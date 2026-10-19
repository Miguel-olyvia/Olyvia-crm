// As ações do Inventário no V1 (19/10/2026): cada uma chama as regras do Inventário do Rafael (inventario/), dentro de executar
// (tudo ou nada: uma regra que recusa não deixa nada a meio). Devolvem a frase do que ficou feito, para o aviso.
import { HOJE, ecPorId, falhar, nomeForn, nomeProd, poPorId, produto, somarDias } from "./inventario/base";
import { sairLinha } from "./inventario/ec";
import { executar, type Resultado } from "./inventario/loja";
import { registarMovimento } from "./inventario/movimentos";
import { ARMAZEM_OBRAS } from "./inventario/ponteNegocios";
import { criarPoManual, enviarPo, portalConfirmar } from "./inventario/po";
import { receberLinhas, type ItemReceber } from "./inventario/receber";
import { qtyAt, transferir } from "./inventario/stock";
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

export const temProduto = (db: Inventario, sku: string): boolean => !!produto(db, sku);
