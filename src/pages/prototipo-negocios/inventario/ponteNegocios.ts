// A ponte dos Negócios para o Inventário novo (16/10/2026). Quando o Financeiro valida o pagamento, o motor dos Negócios emite a encomenda de
// cliente AQUI, com as regras de sempre do Inventário (ec.ts): a reserva FIFO do stock do armazém de expedição e, do que faltar, a encomenda ao
// fornecedor preferencial (po.ts), enviada logo se a definição for "envio direto". O cartão do negócio só LÊ o estado daqui (resumoEcNegocio).
// · Idempotente: a encomenda de um negócio reconhece-se pela origem (o contrato "CT 2026/<id>" ou a venda direta "VD 2026/<id>"); não se duplica.
// · O número é "EC-<id do negócio>", o mesmo no negócio e no Inventário, também depois de recarregar a página (o Inventário vive em memória e
//   volta aos dados de exemplo; sincronizarEcsNegocios volta a emitir as encomendas que lá faltam).
// · Os materiais das obras (cerâmico, sanitas, móveis...) e os três fornecedores de exemplo entram no Inventário da primeira vez que são precisos,
//   com o stock de abertura do Armazém Central que o motor dos Negócios já tinha (garantirArtigosObra). Os produtos da visita entram como produtos novos.
// · As encomendas a fornecedor do que falta nascem PENDENTES (rascunhos automáticos, por aprovar), seja qual for a definição de envio: aprova-as quem
//   tem purchase_orders.approve, no Inventário (enviarPo), e como os fornecedores das obras têm o portal ativo seguem pelo portal do fornecedor.
// Sem React (o cartão lê com useInventario). Só tipos do motor: o motor é que chama a ponte.
import { comoSistema, nifCompleto, produto } from "./base";
import { EC_ESTADOS, EC_LINHA_ESTADOS, criarEc, ecEstado, ecLinhaInfo, eliminarEc, type EstadoEc, type EstadoLinhaEc } from "./ec";
import { executar, lerInventario, type Resultado } from "./loja";
import { poStatus, poStatusLabel } from "./po";
import { aplicarMovimentos, linhaStock } from "./stock";
import type { Ec, Fornecedor, Inventario, Po } from "./tipos";
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
/** A origem é de um negócio do protótipo ("CT 2026/1027", "VD 2026/1030")? As da seed do Inventário têm outro formato ("CT-2026-043"). */
export const ehRefNegocio = (ref: string | null | undefined): boolean => !!ref && /^(CT|VD) 2026\/\d+$/.test(ref);
/** A etiqueta dos movimentos de uma fase da obra (doc dos movimentos no Inventário): "EC-1027 · fase 3". Vive aqui (e não na Frota) para a ponte a ler sem ciclo. */
export const docFase = (ec: string, fase: number): string => `${ec} · fase ${fase}`;

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
      // o portal ativo, como os fornecedores com portal da seed: a encomenda aprovada publica-se no portal (enviarPo)
      portal: "active", portalUsers: 1, lastAccess: "2026-10-08T17:40", dataConfirmed: true, invitedAt: null, awaiting: false,
      invite: { email: `encomendas@${id}.exemplo`, name: "Departamento comercial", state: "active", at: "2026-10-01T10:00" },
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
    // as encomendas a fornecedor ficam pendentes (por aprovar): o envio direto da definição não se aplica às que nascem do negócio
    const envio = db.settings.autoPO;
    db.settings.autoPO = "approval";
    let e: Ec;
    try {
      e = criarEc(db, { origin: { k: p.tipo, ref: p.ref, proforma: null }, client: p.cliente, addr: p.morada, wh: ARMAZEM_OBRAS, notes: p.notas, lines: linhas, diag: null });
    } finally {
      if (forcar) db.n.ec = n0;
      db.settings.autoPO = envio;
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

/* ------------------------------------------------------------------ anular (19/10) */
/** O contrato (ou a venda direta) anulado nos Negócios: elimina a encomenda de cliente com as regras de sempre (eliminarEc: estorna as saídas,
 *  liberta as reservas, anula o resto das encomendas a fornecedor ligadas). Corre como o sistema: a permissão (contracts.cancel) já a pediu o motor. */
export function anularEcNoInventario(ref: string, motivo: string): Resultado<void> {
  return executar((db) => {
    const e = ecDoNegocio(db, ref);
    if (!e || e.deleted) return;
    comoSistema(() => eliminarEc(db, e, motivo, { contrato: e.origin.k === "CT" }));
  });
}
/** Os negócios (não perdidos) cuja encomenda de cliente foi eliminada no próprio Inventário: o negócio anula-se sozinho (motor: ecEliminadaNoInventario). */
export function ecsEliminadasDeNegocios(deals: Negocio[], db: Inventario): { id: number; motivo: string; q: string }[] {
  const L: { id: number; motivo: string; q: string }[] = [];
  for (const d of deals) {
    const ref = d.obra.ec?.ref;
    if (d.perdido || !ref) continue;
    const e = ecDoNegocio(db, ref);
    if (e?.deleted) L.push({ id: d.id, motivo: e.deleteReason || "sem motivo", q: e.deletedAt ?? "" });
  }
  return L;
}

/* ------------------------------------------------------------------ ler o estado */
/** Onde está a encomenda a fornecedor, para quem lê o negócio. */
export type FasePo = "por aprovar" | "no portal" | "por email" | "parcial" | "recebida" | "cancelada";
export interface PoResumoNeg { id: string; forn: string; estado: string; fase: FasePo; prometida: string | null;
  /** quando chega: a data prometida no portal ou, sem ela, a prevista da encomenda ("aaaa-mm-dd") */
  prevista: string }
/** pending → por aprovar; encomendada → no portal do fornecedor (ou por email, sem portal); depois parcial / recebida. */
export function fasePo(p: Po): FasePo {
  const st = poStatus(p);
  if (st === "pending") return "por aprovar";
  if (st === "cancelled") return "cancelada";
  if (st === "received") return "recebida";
  if (st === "partial") return "parcial";
  return p.portal.state === "email" || p.portal.state === "none" ? "por email" : "no portal";
}
const ROTULO_FASE: Record<FasePo, string> = { "por aprovar": "por aprovar", "no portal": "no portal do fornecedor", "por email": "enviada por email", parcial: "recebida em parte", recebida: "recebida", cancelada: "cancelada" };

export interface LinhaResumoNeg {
  id: string; sku: string; n: string; q: number; un: string; st: EstadoLinhaEc; rotulo: string;
  /** carregada na carrinha de uma viatura (a fase da obra, Frota) e ainda não entregue: conta como garantida */
  aBordo: boolean;
  /** já saiu para a obra, pronto a sair (reservado com stock), pedido ao fornecedor e ainda por chegar, sem fornecedor */
  saida: number; pronto: number; aChegar: number; semForn: number;
  /** as encomendas a fornecedor desta linha (id, fornecedor, estado e a data prometida no portal) */
  pos: PoResumoNeg[];
}
export interface ResumoEcNeg {
  id: string; eliminada: boolean; estado: EstadoEc; rotulo: string; linhas: LinhaResumoNeg[];
  /** eliminada no Inventário: o motivo e quando */
  motivo?: string; quando?: string;
  tot: { linhas: number; servidas: number; prontas: number; aBordo: number; aFornecedor: number; semForn: number };
  pos: PoResumoNeg[];
  /** tudo saiu para a obra, está pronto a sair no armazém ou vai a bordo da carrinha */
  pronta: boolean;
}

/** As linhas (ainda não servidas) carregadas na carrinha: há a entrada ("tin") da fase da obra com o mesmo produto (frota/transporteObra.ts: carregarFase). */
export function linhasABordo(db: Inventario, e: Ec): Set<string> {
  const pre = `${e.id} · fase `, S = new Set<string>();
  const carregados = db.moves.filter((m) => m.type === "tin" && m.doc.startsWith(pre));
  for (const l of e.lines) if (l.sku && !l.voided && l.served < l.qty && carregados.some((m) => m.sku === l.sku)) S.add(l.id);
  return S;
}

/** O estado da encomenda de cliente de um negócio, lido do Inventário (null se lá não existe). */
export function resumoEcNegocio(db: Inventario, ref: string | null | undefined): ResumoEcNeg | null {
  if (!ref) return null;
  const e = ecDoNegocio(db, ref);
  if (!e) return null;
  const pos = new Map<string, LinhaResumoNeg["pos"][number]>();
  const bordo = e.deleted ? new Set<string>() : linhasABordo(db, e);
  const linhas: LinhaResumoNeg[] = e.lines.filter((l) => l.sku && !l.voided).map((l) => {
    const i = ecLinhaInfo(db, e, l);
    const lp = i.d.links.map(([p]) => {
      const fase = fasePo(p);
      const x: PoResumoNeg = { id: p.id, forn: db.suppliers.find((s) => s.id === p.sup)?.name ?? p.sup, estado: `${poStatusLabel[poStatus(p)]} · ${ROTULO_FASE[fase]}`, fase, prometida: p.portal.promised, prevista: p.portal.promised ?? p.due };
      pos.set(p.id, x);
      return x;
    });
    return {
      id: l.id, sku: l.sku!, n: produto(db, l.sku!)?.name ?? l.sku!, q: l.qty, un: produto(db, l.sku!)?.unit ?? "un", st: i.st, rotulo: EC_LINHA_ESTADOS[i.st],
      aBordo: bordo.has(l.id), saida: l.served, pronto: i.ready, aChegar: Math.max(0, i.d.poOut), semForn: l.nosupQty, pos: lp,
    };
  });
  const estado = ecEstado(db, e);
  const tot = {
    linhas: linhas.length, servidas: linhas.filter((l) => l.st === "served").length,
    prontas: linhas.filter((l) => pronto(l) && !l.aBordo).length,
    aBordo: linhas.filter((l) => l.aBordo && l.st !== "served").length,
    aFornecedor: linhas.filter((l) => l.aChegar > 0).length, semForn: linhas.filter((l) => l.semForn > 0).length,
  };
  return {
    id: e.id, eliminada: e.deleted, estado, rotulo: EC_ESTADOS[estado], linhas, tot, pos: [...pos.values()],
    ...(e.deleted ? { motivo: e.deleteReason, quando: e.deletedAt } : {}),
    pronta: !e.deleted && tot.servidas + tot.prontas + tot.aBordo === tot.linhas,
  };
}

/** Pronta a sair no armazém (reservada com stock). */
const pronto = (l: LinhaResumoNeg): boolean => l.st === "ready" || l.st === "recvpo";
/** A linha está garantida para a obra: saiu, está pronta a sair no armazém ou vai na carrinha. */
const garantida = (l: LinhaResumoNeg): boolean => l.st === "served" || pronto(l) || l.aBordo;
/** "dd/mm" de "aaaa-mm-dd". */
const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * O que falta nos materiais para a obra arrancar (vazio = tudo garantido), pela ordem em que se trata: a encomenda no Inventário, o fornecedor
 * das linhas sem ele, aprovar as encomendas a fornecedor, recebê-las no armazém e, por fim, reservar o resto. O critério das linhas é o da Frota
 * para carregar a carrinha (frota/transporteObra.ts: faltaParaCarregar): cada uma saída, pronta a sair no armazém ou a bordo.
 */
export function faltaMateriais(r: ResumoEcNeg | null | undefined): string[] {
  if (!r) return ["a encomenda de cliente no Inventário (volta a ser emitida sozinha)"];
  if (r.eliminada) return [`uma encomenda de cliente válida: a ${r.id} foi eliminada no Inventário`];
  const F: string[] = [];
  const mat = (n: number) => `${n} ${n === 1 ? "material" : "materiais"}`;
  const semForn = r.linhas.filter((l) => !garantida(l) && l.semForn > 0).length;
  if (semForn) F.push(`escolher o fornecedor de ${mat(semForn)} no Inventário`);
  const porAprovar = r.pos.filter((p) => p.fase === "por aprovar");
  if (porAprovar.length) F.push(`aprovar ${porAprovar.length === 1 ? "a encomenda a fornecedor" : "as encomendas a fornecedor"} ${porAprovar.map((p) => p.id).join(", ")} no Inventário (Compras)`);
  const porReceber = r.pos.filter((p) => p.fase === "no portal" || p.fase === "por email" || p.fase === "parcial");
  if (porReceber.length) {
    const data = porReceber.map((p) => p.prevista).filter(Boolean).sort().at(-1);
    F.push(`receber no armazém ${porReceber.length === 1 ? "a encomenda" : "as encomendas"} ${porReceber.map((p) => p.id).join(", ")}${data ? " (prevista a " + ddmm(data) + ")" : ""}`);
  }
  const outras = r.linhas.filter((l) => !garantida(l) && !(l.semForn > 0) && !(l.aChegar > 0)).length;
  if (outras) F.push(`reservar no armazém o que falta de ${mat(outras)} ("Pedir o que falta", no Inventário)`);
  // salvaguarda: nada acima mas a encomenda não está pronta (não devia acontecer)
  if (!F.length && !r.pronta) F.push("receber no armazém todos os materiais da encomenda de cliente");
  return F;
}

/** "2 reservadas · 3 encomendadas ao fornecedor · 1 saída" (só o que existe). */
export function textoResumoEc(r: ResumoEcNeg): string {
  if (r.eliminada) return `Eliminada no Inventário${r.motivo ? ": " + r.motivo : ""}.`;
  const p = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const partes = [
    r.tot.servidas ? p(r.tot.servidas, "linha já saiu para a obra", "linhas já saíram para a obra") : "",
    r.tot.prontas ? p(r.tot.prontas, "reservada em armazém", "reservadas em armazém") : "",
    r.tot.aBordo ? `${r.tot.aBordo} na carrinha` : "",
    ...(["por aprovar", "no portal", "por email", "parcial"] as FasePo[]).map((f) => {
      const L = r.pos.filter((x) => x.fase === f);
      return L.length ? `${L.length === 1 ? "1 encomenda a fornecedor" : `${L.length} encomendas a fornecedor`} ${ROTULO_FASE[f]} (${L.map((x) => x.id).join(", ")})` : "";
    }),
    r.tot.semForn ? p(r.tot.semForn, "sem fornecedor", "sem fornecedor") : "",
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sem linhas com stock.";
}

/** O estado de uma linha para quem lê o negócio (e o cliente): "saiu para a obra", "reservado em armazém", "encomendado ao fornecedor"... */
/** O estado da linha enquanto a encomenda ao fornecedor espera aprovação (interno: o portal do cliente esconde-o). */
export const ESTADO_PO_POR_APROVAR = "encomenda a fornecedor por aprovar";
export function estadoLinhaNegocio(l: LinhaResumoNeg): { t: string; ok: boolean } {
  if (l.st === "served") return { t: "saiu para a obra", ok: true };
  if (l.aBordo) return { t: "na carrinha", ok: true };
  if (l.st === "ready" || l.st === "recvpo") return { t: "reservado em armazém", ok: true };
  if (l.aChegar > 0) {
    const pr = l.pos.find((x) => x.prometida)?.prometida;
    if (l.pos.length && l.pos.every((x) => x.fase === "por aprovar")) return { t: ESTADO_PO_POR_APROVAR, ok: false };
    const f = l.pos.find((x) => x.fase !== "por aprovar")?.fase;
    const onde = f === "no portal" ? "no portal do fornecedor" : f === "parcial" ? "recebido em parte" : "encomendado ao fornecedor";
    return { t: pr ? `${onde} · chega a ${pr.slice(8, 10)}/${pr.slice(5, 7)}` : onde, ok: false };
  }
  if (l.semForn > 0) return { t: "sem fornecedor", ok: false };
  if (l.st === "partial") return { t: "parcialmente reservado", ok: false };
  return { t: "em falta", ok: false };
}
/** A linha do resumo de uma linha do negócio (pelo nome do produto no Inventário). */
export const linhaDoResumo = (r: ResumoEcNeg | null | undefined, nome: string): LinhaResumoNeg | undefined => r?.linhas.find((l) => l.n === nome);
