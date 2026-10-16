// A ponte dos Negócios para o Inventário novo (16/10/2026). Quando o Financeiro valida o pagamento, o motor dos Negócios emite a encomenda de
// cliente AQUI, com as regras de sempre do Inventário (ec.ts): a reserva FIFO do stock do armazém de expedição e, do que faltar, a encomenda ao
// fornecedor preferencial (po.ts), enviada logo se a definição for "envio direto". O cartão do negócio só LÊ o estado daqui (resumoEcNegocio).
// · Idempotente: a encomenda de um negócio reconhece-se pela origem (o contrato "CT 2026/<id>" ou a venda direta "VD 2026/<id>"); não se duplica.
// · O número é "EC-<id do negócio>", o mesmo no negócio e no Inventário, também depois de recarregar a página (o Inventário vive em memória e
//   volta aos dados de exemplo; sincronizarEcsNegocios volta a emitir as encomendas que lá faltam).
// · Os materiais das obras (cerâmico, sanitas, móveis...) e os três fornecedores de exemplo entram no Inventário da primeira vez que são precisos,
//   com o stock de abertura do Armazém Central que o motor dos Negócios já tinha (garantirArtigosObra). Os produtos da visita entram como produtos novos.
// Sem React (o cartão lê com useInventario). Só tipos do motor: o motor é que chama a ponte.
import { comoSistema, nifCompleto, produto } from "./base";
import { EC_ESTADOS, EC_LINHA_ESTADOS, criarEc, ecEstado, ecLinhaInfo, type EstadoEc, type EstadoLinhaEc } from "./ec";
import { executar, lerInventario, type Resultado } from "./loja";
import { poStatus, poStatusLabel } from "./po";
import { aplicarMovimentos, linhaStock } from "./stock";
import type { Ec, Fornecedor, Inventario } from "./tipos";
import type { Negocio, StockKey } from "../motor";
import type { EncCliente } from "../preparacaoObra";

/** O armazém de onde saem as obras (o Armazém Central). */
export const ARMAZEM_OBRAS = "LIS";

/* ------------------------------------------------------------------ a origem e o número */
/** A origem da encomenda no Inventário: o contrato do negócio ou, na venda direta, a própria venda. */
export const refNegocio = (d: Pick<Negocio, "id" | "orc">): string => (d.orc?.vendaDireta ? "VD 2026/" : "CT 2026/") + d.id;
/** O número da encomenda de cliente de um negócio: o mesmo no negócio e no Inventário. */
export const idEcNegocio = (d: Pick<Negocio, "id">): string => "EC-" + d.id;
/** A encomenda do negócio no Inventário (também se foi eliminada: não se volta a emitir sozinha). */
export const ecDoNegocio = (db: Inventario, ref: string): Ec | undefined => db.ecs.find((e) => e.origin.ref === ref);

/* ------------------------------------------------------------------ os materiais das obras */
/** A chave de stock do motor → o produto no Inventário. */
export const SKU_MATERIAL: Record<StockKey, string> = { cp: "OB-CP3060", pv: "OB-PV6060", san: "OB-SANS", base: "OB-BD80", cim: "OB-CIM25", mov: "OB-MOVC", banc: "OB-BANC" };
// [chave, nome, unidade, venda, custo, fornecedor, stock de abertura no Armazém Central (o S.stock do motor), mín., ponto de encomenda]
const MATERIAIS: [StockKey, string, string, number, number, string, number, number, number][] = [
  ["cp", "Cerâmico de parede 30×60", "m²", 22, 14, "ceram", 12, 10, 20],
  ["pv", "Pavimento cerâmico 60×60", "m²", 25, 16, "ceram", 0, 10, 20],
  ["san", "Sanita suspensa com estrutura", "un", 290, 180, "sanit", 0, 1, 2],
  ["base", "Base de duche 80×120", "un", 195, 120, "sanit", 3, 1, 2],
  ["cim", "Cimento-cola · saco 25 kg", "sacos", 9.5, 6, "ceram", 40, 20, 30],
  ["mov", "Conjunto de móveis de cozinha", "un", 2950, 1900, "madeir", 0, 0, 0],
  ["banc", "Bancada em pedra", "un", 690, 420, "madeir", 2, 1, 1],
];
/** Os fornecedores de exemplo das obras (os do motor dos Negócios: FORNECEDORES em preparacaoObra.ts). */
const FORN_OBRAS: [string, string, string, string, number][] = [
  ["ceram", "Cerâmica do Centro (exemplo)", "FOR-101", "Leiria", 4],
  ["sanit", "Sanitários do Tejo (exemplo)", "FOR-102", "Santarém", 5],
  ["madeir", "Madeiras e Cozinhas (exemplo)", "FOR-103", "Paços de Ferreira", 10],
];

/** O fornecedor de um produto escolhido na visita, pelo nome. */
export function fornecedorDoProduto(nome: string): string {
  const s = nome.toLowerCase();
  if (/azulej|cerâm|ceram|pavim|revest|mosaic|cola/.test(s)) return "ceram";
  if (/móve|move|bancada|armári|armari|cozinha|porta|madeira/.test(s)) return "madeir";
  return "sanit";
}

/** Põe no Inventário (uma vez) os fornecedores, os materiais das obras com o artigo preferencial e o stock de abertura. */
export function garantirArtigosObra(db: Inventario): void {
  for (const [id, name, code, city, sla] of FORN_OBRAS) {
    if (db.suppliers.some((s) => s.id === id)) continue;
    const nif = nifCompleto("5091000" + (db.suppliers.length % 10));
    const f: Fornecedor = {
      id, name, code, contact: "Departamento comercial", email: `encomendas@${id}.exemplo`, phone: "2" + nif.slice(-8), nif, company: "Empresa A (Lisboa)", sla,
      addr: "Zona Industrial", city, cp: "", country: "Portugal", web: "", notes: "Fornecedor das obras (protótipo de Negócios).", active: true, deleted: false,
      portal: "none", portalUsers: 0, lastAccess: null, dataConfirmed: false, invitedAt: null, awaiting: false,
    };
    db.suppliers.push(f);
  }
  const abertura: Parameters<typeof aplicarMovimentos>[1] = [];
  for (const [k, name, unit, sale, cost, sup, qty, min, rop] of MATERIAIS) {
    const sku = SKU_MATERIAL[k];
    if (produto(db, sku)) continue;
    db.products.push({ sku, ean: "", name, cat: "Obras", sub: "Materiais", unit, sale, cost, avg: 0, codes: [], deleted: false });
    db.items.push({ id: "I" + (db.items.length + 1), sup, sku, ref: sup.toUpperCase() + "-" + k.toUpperCase(), packN: 1, unitLabel: unit === "un" ? "Unidade" : unit, price: cost, pref: true, moq: 1, lead: FORN_OBRAS.find((x) => x[0] === sup)?.[4] ?? 5 });
    const r = linhaStock(db, sku, ARMAZEM_OBRAS, true);
    if (r) Object.assign(r, { loc: "OB-01", min, max: min * 4, rop });
    if (qty) abertura.push({ type: "in", sku, wh: ARMAZEM_OBRAS, qty, doc: "Saldo inicial", note: "Abertura de inventário (materiais das obras)", cost, user: "T. Marques" });
  }
  if (abertura.length) aplicarMovimentos(db, abertura);
}

/** O produto do Inventário de um produto escolhido na visita (cria-o, com o artigo do fornecedor, se ainda não existir). */
function produtoDaVisita(db: Inventario, l: LinhaPedidoNeg): string {
  const sku = "OB-" + (l.idProd || l.n).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18);
  if (!produto(db, sku)) {
    const sup = fornecedorDoProduto(l.n);
    db.products.push({ sku, ean: "", name: l.n, cat: "Obras", sub: "Produtos da visita", unit: l.un || "un", sale: l.preco, cost: l.custo, avg: 0, codes: [], deleted: false });
    db.items.push({ id: "I" + (db.items.length + 1), sup, sku, ref: sup.toUpperCase() + "-" + sku.slice(3), packN: 1, unitLabel: "Unidade", price: l.custo, pref: true, moq: 1, lead: FORN_OBRAS.find((x) => x[0] === sup)?.[4] ?? 5 });
  }
  return sku;
}

/* ------------------------------------------------------------------ emitir */
export interface LinhaPedidoNeg { n: string; un: string; q: number; preco: number; custo: number; k?: StockKey; idProd?: string }
export interface PedidoNeg { id: string; ref: string; tipo: "CT" | "VD"; cliente: string; morada: string; notas: string; linhas: LinhaPedidoNeg[] }

/** O pedido ao Inventário a partir do negócio e da encomenda de cliente do motor (as linhas do contrato, o cliente e a obra). */
export function pedidoDoNegocio(d: Negocio, ec: EncCliente): PedidoNeg {
  return {
    id: idEcNegocio(d), ref: ec.ref ?? refNegocio(d), tipo: d.orc?.vendaDireta ? "VD" : "CT",
    cliente: d.f.nome_fiscal || d.nome,
    morada: [d.f.morada, [d.f.cp, d.f.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ") || d.local,
    notas: `Obra do negócio #${d.id} · ${d.servico}`,
    linhas: ec.linhas.map((x) => ({ n: x.n, un: x.un, q: x.q, preco: x.preco, custo: x.custo, k: x.k, idProd: x.id })),
  };
}

/**
 * Emite a encomenda de cliente no Inventário (corre dentro de executar). Reaproveita o "Simular venda" (simularVenda → criarEc): reserva FIFO e
 * encomenda ao fornecedor do que faltar. Se já existir uma com a mesma origem, devolve-a sem mexer em nada.
 */
export function emitirEcNoInventario(db: Inventario, p: PedidoNeg): Ec {
  const ja = ecDoNegocio(db, p.ref);
  if (ja) return ja;
  return comoSistema(() => {
    garantirArtigosObra(db);
    const linhas = p.linhas.filter((l) => l.q > 0).map((l) => ({
      sku: l.k ? SKU_MATERIAL[l.k] : produtoDaVisita(db, l),
      // o Inventário conta em unidades inteiras: arredonda para cima (nunca falta material)
      qty: Math.max(1, Math.ceil(l.q - 1e-9)),
      price: l.preco,
    }));
    // o número segue o do negócio (EC-<id>), se estiver livre; o contador das encomendas manuais não muda
    const n0 = db.n.ec, num = Number(p.id.replace(/\D/g, ""));
    const forcar = num > 0 && !db.ecs.some((x) => x.id === p.id);
    if (forcar) db.n.ec = num - 1;
    let e: Ec;
    try {
      e = criarEc(db, { origin: { k: p.tipo, ref: p.ref, proforma: null }, client: p.cliente, addr: p.morada, wh: ARMAZEM_OBRAS, notes: p.notas, lines: linhas, diag: null });
    } finally {
      if (forcar) db.n.ec = n0;
    }
    if (p.tipo === "VD") db.vds.push({ ref: p.ref, state: "confirmed" });
    e.log.push({ at: e.log[0]?.at ?? "", t: "Emitida pelo Financeiro ao validar o pagamento do negócio" });
    return e;
  });
}

/** Emite na loja do Inventário (os ecrãs que a leem redesenham). Uma regra que recusa devolve o erro e não deixa nada a meio. */
export const emitirNoInventario = (p: PedidoNeg): Resultado<Ec> => executar((db) => emitirEcNoInventario(db, p));

/** Depois de recarregar a página (ou de "Repor dados" no Inventário), volta a emitir as encomendas dos negócios pagos que lá faltam.
 *  Não toca nas obras concluídas nem nas encomendas que foram eliminadas no Inventário. Devolve quantas emitiu. */
export function sincronizarEcsNegocios(deals: Negocio[]): number {
  // sem negócios com encomenda no Inventário não se lê a base (criá-la custa: os dados de exemplo constroem-se pelo próprio motor)
  const candidatos = deals.filter((d) => !d.perdido && d.fin.pago && d.obra.ec?.ref && d.obra.plano?.estado !== "concluída");
  if (!candidatos.length) return 0;
  const db = lerInventario();
  const faltam = candidatos.filter((d) => !ecDoNegocio(db, d.obra.ec!.ref!));
  if (!faltam.length) return 0;
  const r = executar((x) => { for (const d of faltam) emitirEcNoInventario(x, pedidoDoNegocio(d, d.obra.ec!)); });
  return r.ok ? faltam.length : 0;
}

/* ------------------------------------------------------------------ ler o estado */
export interface LinhaResumoNeg {
  sku: string; n: string; q: number; un: string; st: EstadoLinhaEc; rotulo: string;
  /** já saiu para a obra, pronto a sair (reservado com stock), pedido ao fornecedor e ainda por chegar, sem fornecedor */
  saida: number; pronto: number; aChegar: number; semForn: number;
  /** as encomendas a fornecedor desta linha (id, fornecedor, estado e a data prometida no portal) */
  pos: { id: string; forn: string; estado: string; prometida: string | null }[];
}
export interface ResumoEcNeg {
  id: string; eliminada: boolean; estado: EstadoEc; rotulo: string; linhas: LinhaResumoNeg[];
  tot: { linhas: number; servidas: number; prontas: number; aFornecedor: number; semForn: number };
  pos: { id: string; forn: string; estado: string; prometida: string | null }[];
  /** tudo saiu para a obra ou está pronto a sair */
  pronta: boolean;
}

/** O estado da encomenda de cliente de um negócio, lido do Inventário (null se lá não existe). */
export function resumoEcNegocio(db: Inventario, ref: string | null | undefined): ResumoEcNeg | null {
  if (!ref) return null;
  const e = ecDoNegocio(db, ref);
  if (!e) return null;
  const pos = new Map<string, LinhaResumoNeg["pos"][number]>();
  const linhas: LinhaResumoNeg[] = e.lines.filter((l) => l.sku && !l.voided).map((l) => {
    const i = ecLinhaInfo(db, e, l);
    const lp = i.d.links.map(([p]) => {
      const x = { id: p.id, forn: db.suppliers.find((s) => s.id === p.sup)?.name ?? p.sup, estado: poStatusLabel[poStatus(p)], prometida: p.portal.promised };
      pos.set(p.id, x);
      return x;
    });
    return {
      sku: l.sku!, n: produto(db, l.sku!)?.name ?? l.sku!, q: l.qty, un: produto(db, l.sku!)?.unit ?? "un", st: i.st, rotulo: EC_LINHA_ESTADOS[i.st],
      saida: l.served, pronto: i.ready, aChegar: Math.max(0, i.d.poOut), semForn: l.nosupQty, pos: lp,
    };
  });
  const estado = ecEstado(db, e);
  const tot = {
    linhas: linhas.length, servidas: linhas.filter((l) => l.st === "served").length,
    prontas: linhas.filter((l) => l.st === "ready" || l.st === "recvpo").length,
    aFornecedor: linhas.filter((l) => l.aChegar > 0).length, semForn: linhas.filter((l) => l.semForn > 0).length,
  };
  return { id: e.id, eliminada: e.deleted, estado, rotulo: EC_ESTADOS[estado], linhas, tot, pos: [...pos.values()], pronta: !e.deleted && tot.servidas + tot.prontas === tot.linhas };
}

/** "2 reservadas · 3 encomendadas ao fornecedor · 1 saída" (só o que existe). */
export function textoResumoEc(r: ResumoEcNeg): string {
  if (r.eliminada) return "Eliminada no Inventário.";
  const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const partes = [
    r.tot.servidas ? p(r.tot.servidas, "linha já saiu para a obra", "linhas já saíram para a obra") : "",
    r.tot.prontas ? p(r.tot.prontas, "reservada em armazém", "reservadas em armazém") : "",
    r.tot.aFornecedor ? p(r.tot.aFornecedor, "encomendada ao fornecedor", "encomendadas ao fornecedor") + (r.pos.length ? ` (${r.pos.map((x) => x.id).join(", ")})` : "") : "",
    r.tot.semForn ? p(r.tot.semForn, "sem fornecedor", "sem fornecedor") : "",
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sem linhas com stock.";
}

/** O estado de uma linha para quem lê o negócio (e o cliente): "saiu para a obra", "reservado em armazém", "encomendado ao fornecedor"... */
export function estadoLinhaNegocio(l: LinhaResumoNeg): { t: string; ok: boolean } {
  if (l.st === "served") return { t: "saiu para a obra", ok: true };
  if (l.st === "ready" || l.st === "recvpo") return { t: "reservado em armazém", ok: true };
  if (l.aChegar > 0) {
    const pr = l.pos.find((x) => x.prometida)?.prometida;
    return { t: pr ? `encomendado ao fornecedor · chega a ${pr.slice(8, 10)}/${pr.slice(5, 7)}` : "encomendado ao fornecedor", ok: false };
  }
  if (l.semForn > 0) return { t: "sem fornecedor", ok: false };
  if (l.st === "partial") return { t: "parcialmente reservado", ok: false };
  return { t: "em falta", ok: false };
}
/** A linha do resumo de uma linha do negócio (pelo nome do produto no Inventário). */
export const linhaDoResumo = (r: ResumoEcNeg | null | undefined, nome: string): LinhaResumoNeg | undefined => r?.linhas.find((l) => l.n === nome);
