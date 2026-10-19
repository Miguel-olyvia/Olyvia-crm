// As ações do Inventário no V1 (19/10/2026): cada uma chama as regras do Inventário do Rafael (inventario/), dentro de executar
// (tudo ou nada: uma regra que recusa não deixa nada a meio). Devolvem a frase do que ficou feito, para o aviso.
import { HOJE, contagemPorId, ecPorId, falhar, nomeForn, nomeProd, poPorId, somarDias } from "./inventario/base";
import { adicionarArtigo, decidirPreco } from "./inventario/cadastros";
import { cancelarContagem, contarLinha, criarContagem, finalizarContagem, infoLinha, resolverLinha } from "./inventario/contagens";
import { livreEm, pedirEmFalta, reverterSaida, sairLinha } from "./inventario/ec";
import { executar, type Resultado } from "./inventario/loja";
import { registarMovimento } from "./inventario/movimentos";
import { ARMAZEM_OBRAS } from "./inventario/ponteNegocios";
import { criarPoManual, eliminarPo, enviarPo, poRem, portalConfirmar } from "./inventario/po";
import { MOTIVOS_RESTO, anularResto, receberLinhas, type ItemReceber } from "./inventario/receber";
import { errosFicha, gravarFicha, proximoCodigoForn } from "./inventario/regrasForn";
import { adicionarStock, editarLinhaStock, qtyAt, transferir } from "./inventario/stock";
import type { Inventario } from "./inventario/tipos";
import { dia, plural, qtd, unidade, type MatInv } from "./inventarioV1Docs";

const po = (db: Inventario, id: string) => poPorId(db, id) ?? falhar("A encomenda já não existe.");

/** Aprovar e enviar uma encomenda a fornecedor (pelo portal, se o fornecedor o tem; senão por email). */
export const aprovar = (id: string): Resultado<string> => executar((db) => {
  const p = po(db, id);
  enviarPo(db, p);
  return p.portal.state === "sent" ? `Encomenda enviada a ${nomeForn(db, p.sup)} pelo portal.` : `Encomenda enviada a ${nomeForn(db, p.sup)} por email.`;
});

/** Dar entrada do que chegou: o que é de uma obra fica guardado para ela; o resto entra livre no armazém. */
export const receber = (id: string, itens: ItemReceber[]): Resultado<string> => executar((db) => {
  const p = po(db, id);
  const r = receberLinhas(db, p, itens, p.wh, null);
  const obra = r.res.reduce((a, x) => a + x.toEC, 0), total = r.res.reduce((a, x) => a + x.qty, 0);
  return `Entrada feita: ${plural(r.res.length, "material", "materiais")}${obra ? (obra === total ? ", tudo guardado para a obra" : `, ${obra} un guardadas para a obra`) : ""}.`;
});

/** Levar à obra o material de uma fase que está pronto no armazém (as saídas da encomenda de cliente). */
export const darSaida = (ec: string, itens: Pick<MatInv, "linhaEc" | "pronto">[]): Resultado<string> => executar((db) => {
  const e = ecPorId(db, ec) ?? falhar("A encomenda de cliente já não existe.");
  let n = 0;
  for (const m of itens) {
    const l = e.lines.find((x) => x.id === m.linhaEc);
    if (!l || m.pronto <= 0) continue;
    sairLinha(db, e, l, m.pronto, e.wh);
    n++;
  }
  if (!n) falhar("Não há material pronto a sair nesta fase.");
  return `Saída feita: ${plural(n, "material", "materiais")} a caminho da obra.`;
});

/** Encomendar ao fornecedor preferido o que está abaixo do mínimo (cria e envia logo: quem decide é quem aprova). */
export const encomendar = (sku: string, q: number, sup: string): Resultado<string> => executar((db) => {
  const it = db.items.find((i) => i.sup === sup && i.sku === sku) ?? falhar("O fornecedor não tem este material.");
  const p = criarPoManual(db, { sup, wh: ARMAZEM_OBRAS, linhas: [{ sku, packs: Math.ceil(q / it.packN) }] });
  enviarPo(db, p);
  return `Encomendados ${qtd(q, unidade(db, sku))} de ${nomeProd(db, sku).toLowerCase()} a ${nomeForn(db, sup)}.`;
});

export type MotivoCorrecao = "contagem" | "quebra" | "encontrado";
export const MOTIVOS: { v: MotivoCorrecao; t: string }[] = [
  { v: "contagem", t: "Contei e está diferente" }, { v: "quebra", t: "Partiu ou estragou-se" }, { v: "encontrado", t: "Encontrei mais" },
];
/** Corrigir a quantidade no armazém: fica no livro, com o motivo. A quebra só tira; encontrar só junta. */
export const corrigir = (sku: string, wh: string, nova: number, motivo: MotivoCorrecao): Resultado<string> => executar((db) => {
  const atual = qtyAt(db, sku, wh), dif = nova - atual, un = unidade(db, sku);
  if (!Number.isInteger(nova) || nova < 0) falhar("A quantidade tem de ser um número inteiro, zero ou mais.");
  if (!dif) falhar("A quantidade é a mesma: não há nada a corrigir.");
  if (motivo === "quebra" && dif > 0) falhar("Uma quebra só tira: a quantidade nova tem de ser menor.");
  if (motivo === "encontrado" && dif < 0) falhar("Encontrar material só junta: a quantidade nova tem de ser maior.");
  const r = motivo === "quebra"
    ? registarMovimento(db, { type: "loss", wh, from: "", to: "", reason: "Dano", lines: [{ sku, qty: -dif }] })
    : registarMovimento(db, { type: "adjust", wh, from: "", to: "", sign: dif > 0 ? "+" : "-", reason: motivo === "contagem" ? "Contagem" : "Material encontrado", lines: [{ sku, qty: Math.abs(dif) }] });
  if (r.failed.length) falhar(r.failed[0].msg);
  return `${nomeProd(db, sku)}: passou de ${qtd(atual, un)} para ${qtd(nova, un)}.`;
});

/** Repor uma carrinha a partir do Armazém Central (uma transferência: sai de um e entra no outro). */
export const reporCarrinha = (carrinha: string, sku: string, q: number): Resultado<string> => executar((db) => {
  if (q <= 0) falhar("Não há livre no Armazém Central para repor.");
  transferir(db, sku, ARMAZEM_OBRAS, carrinha, q, { note: "Reposição da carrinha" });
  return `${qtd(q, unidade(db, sku))} de ${nomeProd(db, sku).toLowerCase()} na ${db.warehouses.find((w) => w.id === carrinha)?.name ?? "carrinha"}.`;
});

/** Protótipo: o fornecedor confirma no portal a data de entrega (o prazo dele a contar de hoje). */
export const simularConfirmacao = (id: string): Resultado<string> => executar((db) => {
  const p = po(db, id);
  const lead = Math.max(1, ...p.lines.map((l) => db.items.find((i) => i.id === l.itemId)?.lead ?? 3));
  const data = somarDias(HOJE, lead);
  portalConfirmar(db, p, data, "Confirmado pelo portal.");
  return `${nomeForn(db, p.sup)} confirmou a entrega para ${dia(data)}.`;
});

/* ---------------------------------------------------------------- encomendas a fornecedor */

/** Não aprovar uma encomenda (fica no histórico como eliminada, com o motivo). Se era de uma obra, o material volta a faltar e pede-se de novo na obra. */
export const recusar = (id: string, motivo: string): Resultado<string> => executar((db) => {
  const p = po(db, id);
  if (p.status !== "pending") falhar("Só uma encomenda por aprovar se pode recusar.");
  eliminarPo(db, p, motivo);
  return `Encomenda a ${nomeForn(db, p.sup)} recusada.`;
});

/** Os motivos para não receber o resto (os do Inventário, sem "Outro", que pede uma nota). */
export const MOTIVOS_RESTO_V1: string[] = MOTIVOS_RESTO.filter((m) => m !== "Outro");
/** "O fornecedor não vai entregar o resto": anula o que falta em todas as linhas. Se era de uma obra, essa parte volta a faltar lá. */
export const anularOResto = (id: string, motivo: string): Resultado<string> => executar((db) => {
  const p = po(db, id);
  anularResto(db, p, p.lines.filter((l) => poRem(l) > 0).map((l) => l.id), motivo, "");
  return `Encomenda a ${nomeForn(db, p.sup)} fechada: o resto já não vem.`;
});

/** Uma encomenda nova, feita à mão: o fornecedor e os materiais dele com a quantidade (em unidades). Segue logo para o fornecedor. */
export const novaEncomenda = (sup: string, linhas: { sku: string; q: number }[]): Resultado<string> => executar((db) => {
  const L = linhas.filter((l) => l.q > 0);
  if (!sup) falhar("Escolha o fornecedor.");
  if (!L.length) falhar("Escolha pelo menos um material e a quantidade.");
  const p = criarPoManual(db, { sup, wh: ARMAZEM_OBRAS, linhas: L.map((l) => {
    const it = db.items.find((i) => i.sup === sup && i.sku === l.sku) ?? falhar("O fornecedor não tem este material.");
    return { sku: l.sku, packs: Math.ceil(l.q / it.packN) };
  }) });
  enviarPo(db, p);
  return `Encomenda enviada a ${nomeForn(db, sup)}: ${plural(L.length, "material", "materiais")}.`;
});

/* ---------------------------------------------------------------- obras */

/** Pedir o que falta a uma obra (o material sem encomenda): uma encomenda ao fornecedor preferido, por aprovar. */
export const pedirOQueFalta = (ec: string): Resultado<string> => executar((db) => {
  const e = ecPorId(db, ec) ?? falhar("A encomenda de cliente já não existe.");
  const r = pedirEmFalta(db, e);
  if (!r.pos.length) falhar("Nenhum fornecedor tem estes materiais. Junte-os a um fornecedor (em Fornecedores) e peça outra vez.");
  return `Pedido o que falta: ${plural(r.pos.length, "encomenda", "encomendas")} por aprovar.`;
});

/** Desfazer a última saída de um material para a obra (saiu por engano ou voltou): volta ao armazém, guardado para a obra. */
export const desfazerSaida = (ec: string, linhaEc: string): Resultado<string> => executar((db) => {
  const e = ecPorId(db, ec) ?? falhar("A encomenda de cliente já não existe.");
  const l = e.lines.find((x) => x.id === linhaEc) ?? falhar("O material já não está na encomenda.");
  reverterSaida(db, e, l);
  return `${nomeProd(db, l.sku!)} voltou ao armazém, guardado para a obra.`;
});

/* ---------------------------------------------------------------- o material */

/** Entrada sem encomenda (comprado ao balcão, oferta, sobra de uma obra), com o fornecedor e o custo, se se souberem. */
export const entradaAvulsa = (sku: string, q: number, sup: string, custo: number | null): Resultado<string> => executar((db) => {
  const r = registarMovimento(db, { type: "in", wh: ARMAZEM_OBRAS, from: "", to: "", supplier: sup || undefined, note: "Entrada sem encomenda", lines: [{ sku, qty: q, cost: custo }] });
  if (r.failed.length) falhar(r.failed[0].msg);
  return `Entrada de ${qtd(q, unidade(db, sku))} de ${nomeProd(db, sku).toLowerCase()}.`;
});
/** Devolver ao fornecedor (defeito, engano no envio). */
export const devolver = (sku: string, q: number, sup: string): Resultado<string> => executar((db) => {
  if (!sup) falhar("Escolha o fornecedor.");
  if (q > qtyAt(db, sku, ARMAZEM_OBRAS)) falhar("Não há tanto no armazém.");
  const r = registarMovimento(db, { type: "ret", wh: ARMAZEM_OBRAS, from: "", to: "", supplier: sup, lines: [{ sku, qty: q }] });
  if (r.failed.length) falhar(r.failed[0].msg);
  return `Devolvidos ${qtd(q, unidade(db, sku))} a ${nomeForn(db, sup)}.`;
});
/** Levar para uma carrinha (transferência a partir do Armazém Central). */
export const levarParaCarrinha = (sku: string, q: number, carrinha: string): Resultado<string> => executar((db) => {
  if (!carrinha) falhar("Escolha a carrinha.");
  if (q > livreEm(db, sku, ARMAZEM_OBRAS)) falhar("Só se leva o que está livre (o resto está guardado para obras).");
  transferir(db, sku, ARMAZEM_OBRAS, carrinha, q, { note: "Levado para a carrinha" });
  return `${qtd(q, unidade(db, sku))} na ${db.warehouses.find((w) => w.id === carrinha)?.name ?? "carrinha"}.`;
});
/** Mudar o mínimo: abaixo dele, o Inventário pede para encomendar (o máximo passa a ser pelo menos o dobro). */
export const mudarMinimo = (sku: string, minimo: number): Resultado<string> => executar((db) => {
  const r = db.stocks.find((s) => s.sku === sku && s.wh === ARMAZEM_OBRAS && !s.deleted) ?? falhar("O material não está no armazém.");
  editarLinhaStock(db, r.id, { min: minimo, rop: minimo, max: Math.max(r.max, minimo * 2) });
  return minimo ? `Mínimo de ${nomeProd(db, sku).toLowerCase()}: ${qtd(minimo, unidade(db, sku))}.` : `${nomeProd(db, sku)} fica sem mínimo.`;
});

export interface DadosMaterial { nome: string; cat: string; un: string; sup: string; preco: number | null; minimo: number; qty: number }
export type ErrosMaterial = Partial<Record<"nome" | "cat" | "un" | "sup" | "preco", string>>;
export function validarMaterial(db: Inventario, d: DadosMaterial): ErrosMaterial {
  const e: ErrosMaterial = {};
  if (!d.nome.trim()) e.nome = "Escreva o nome do material.";
  else if (db.products.some((p) => !p.deleted && p.name.toLowerCase() === d.nome.trim().toLowerCase())) e.nome = "Já existe um material com este nome.";
  if (!d.cat) e.cat = "Escolha a categoria.";
  if (!d.un) e.un = "Escolha a unidade.";
  if (!d.sup) e.sup = "Escolha o fornecedor.";
  if (d.preco == null || Number.isNaN(d.preco) || d.preco < 0) e.preco = "Escreva o preço de compra.";
  return e;
}
/** Um material novo: o produto, o artigo do fornecedor (preferido) e a linha no Armazém Central, com a quantidade que já lá está. Devolve o código. */
export const novoMaterial = (d: DadosMaterial): Resultado<string> => executar((db) => {
  const e = validarMaterial(db, d);
  if (Object.keys(e).length) falhar(Object.values(e)[0]!);
  const sku = "MAT-" + String(db.products.filter((p) => p.sku.startsWith("MAT-")).length + 1).padStart(3, "0");
  db.products.push({ sku, ean: "", name: d.nome.trim(), cat: d.cat, sub: "Armazém", unit: d.un, sale: 0, cost: d.preco!, avg: 0, codes: [], deleted: false });
  adicionarArtigo(db, d.sup, { sku, ref: sku, packN: 1, unitLabel: d.un === "un" ? "Unidade" : d.un, price: d.preco, moq: 1, lead: 0 });
  adicionarStock(db, { sku, wh: ARMAZEM_OBRAS, loc: "", min: d.minimo, max: d.minimo * 2, rop: d.minimo, qty: d.qty, cost: d.preco });
  return sku;
});

/* ---------------------------------------------------------------- fornecedores */

/** Aceitar ou recusar um preço novo que o fornecedor pediu (aceite, passa a ser o custo do material). */
export const decidirPrecoNovo = (id: string, aceitar: boolean): Resultado<string> => executar((db) => {
  const c = db.prices.find((x) => x.id === id) ?? falhar("O pedido já não existe.");
  const it = db.items.find((i) => i.id === c.itemId);
  decidirPreco(db, id, aceitar, aceitar ? "" : "Recusado no Inventário");
  return `${aceitar ? "Preço novo aceite" : "Preço novo recusado"}: ${it ? nomeProd(db, it.sku).toLowerCase() : "material"} de ${nomeForn(db, c.sup)}.`;
});

export interface DadosFornV1 { nome: string; email: string; telefone: string; cidade: string; prazo: number }
export type ErrosFornV1 = Partial<Record<"nome" | "email" | "prazo", string>>;
const fichaDe = (db: Inventario, d: DadosFornV1) => ({
  company: "Mudelar", name: d.nome.trim(), code: proximoCodigoForn(db), contact: "", email: d.email.trim(), phone: d.telefone.trim(), nif: "", sla: d.prazo,
  addr: "", city: d.cidade.trim(), cp: "", country: "Portugal", web: "", notes: "", active: true,
});
export function validarFornecedor(db: Inventario, d: DadosFornV1): ErrosFornV1 {
  const e = errosFicha(db, fichaDe(db, d), null, false), out: ErrosFornV1 = {};
  if (e.name) out.nome = "Escreva o nome do fornecedor.";
  if (e.email) out.email = e.email === "Email inválido." ? "O email não está bem escrito." : e.email;
  if (e.sla) out.prazo = "Escolha o prazo de entrega.";
  return out;
}
/** Um fornecedor novo (recebe as encomendas por email; o portal convida-se depois). Devolve o id. */
export const novoFornecedor = (d: DadosFornV1): Resultado<string> => executar((db) => {
  const e = validarFornecedor(db, d);
  if (Object.keys(e).length) falhar(Object.values(e)[0]!);
  return gravarFicha(db, fichaDe(db, d), null, { items: [], enviar: false }).id;
});
/** Juntar um material a um fornecedor (o preço dele por unidade). */
export const juntarArtigo = (sup: string, sku: string, preco: number | null): Resultado<string> => executar((db) => {
  if (!sku) falhar("Escolha o material.");
  if (preco == null || Number.isNaN(preco) || preco < 0) falhar("Escreva o preço por unidade.");
  adicionarArtigo(db, sup, { sku, ref: `${db.suppliers.find((s) => s.id === sup)?.code ?? sup}-${sku}`, packN: 1, unitLabel: unidade(db, sku) === "un" ? "Unidade" : unidade(db, sku), price: preco, moq: 1, lead: 0 });
  return `${nomeProd(db, sku)} junto a ${nomeForn(db, sup)}.`;
});

/* ---------------------------------------------------------------- contagens */

/** Começar a contar o Armazém Central (tudo, ou uma categoria). Devolve o número da contagem. */
export const comecarContagem = (cat: string): Resultado<string> => executar((db) => criarContagem(db, { wh: ARMAZEM_OBRAS, cat, init: "blank" }).id);
/** Quanto se contou de um material (a linha `idx` da contagem). */
export const contar = (id: string, idx: number, v: number): Resultado<string> => executar((db) => {
  const c = contagemPorId(db, id) ?? falhar("A contagem já não existe.");
  contarLinha(db, c, idx, v);
  return "";
});
/** Acabar a contagem: as diferenças corrigem o stock (ficam no livro como correções da contagem). */
export const acabarContagem = (id: string): Resultado<string> => executar((db) => {
  const c = contagemPorId(db, id) ?? falhar("A contagem já não existe.");
  c.lines.forEach((l, i) => { if (infoLinha(db, c, l).diff) resolverLinha(db, c, i, "adjusted"); });
  const n = finalizarContagem(db, c);
  return n ? `Contagem acabada: ${plural(n, "material corrigido", "materiais corrigidos")} no stock.` : "Contagem acabada: tudo certo, nada a corrigir.";
});
/** Desistir da contagem: o stock não muda. */
export const desistirContagem = (id: string): Resultado<string> => executar((db) => {
  const c = contagemPorId(db, id) ?? falhar("A contagem já não existe.");
  cancelarContagem(db, c, "Desistiu da contagem");
  return "Contagem cancelada: o stock não mudou.";
});
