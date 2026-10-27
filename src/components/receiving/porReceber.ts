// Receção › "Por receber" (desenho do protótipo, rececaoLista.ts + EncomendasPorReceber.tsx) sobre as colunas REAIS:
// purchase_orders (status, expected_delivery), purchase_order_items (quantity, received_quantity, uom_id, units_per_uom),
// supplier_po_publications (status, viewed_at, confirmed_at, promised_date) e scheduled_emails (envio por email).
// Só funções puras: sem React, sem BD. "Hoje" é sempre um parâmetro ("YYYY-MM-DD", hora local — todayIsoLocal).
//
// Regras (iguais às do protótipo):
// - A data que conta (dataEntregaEf) é a prometida no portal se o fornecedor confirmou e a deu; senão a prevista da PO
//   (pode faltar: sem data nunca é "hoje/amanhã" nem "atrasada").
// - Grupo (grupoRececao), a primeira regra que se aplica: 0 chega hoje/amanhã (ou confirmada desde ontem: "NOVA");
//   1 atrasada; 2 confirmada pelo fornecedor; 3 à espera do fornecedor (já enviada); 4 por enviar (pendente).
// - Expedidas (grupo −1, acima de todos): o fornecedor expediu-a no portal e a guia de remessa ainda está aberta
//   (ReceivablePo.shipped); entre elas, a expedida há mais tempo primeiro. O chip "Hoje/amanhã" inclui-as.
// - Falta = quantity − received_quantity de cada linha de produto (anular o resto já baixa quantity); em unidades
//   de stock = × units_per_uom. Linhas de serviço não contam.

export type PublicationStatus = "sent" | "viewed" | "confirmed" | "withdrawn";

export interface ReceivablePublication {
  status: PublicationStatus;
  viewedAt: string | null;
  confirmedAt: string | null;
  promisedDate: string | null;
}

/** Origem da PO (usePoOrigins): contrato CC-…, venda direta VD-… ou encomenda manual EC-…. */
export interface ReceivableOrigin {
  originType: "contract" | "direct_sale" | "manual";
  number: string;
  clientName: string;
}

export interface ReceivableLine {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  /** Quantidade encomendada (já sem o resto anulado), na unidade da linha. */
  quantity: number;
  received: number;
  /** Em falta na unidade da linha (nunca negativa). */
  open: number;
  uomId: string | null;
  uomCode: string | null;
  /** Unidades de stock por unidade da linha (embalagem). */
  unitsPerUom: number;
}

/** A guia de remessa mais antiga que o fornecedor expediu no portal para esta PO e que ainda está aberta. */
export interface ReceivableShipment {
  noteId: string;
  noteNumber: string;
  shippedAt: string | null;
  hasFile: boolean;
  /** Quantas guias do portal abertas há para esta PO. */
  count: number;
}

export interface ReceivablePo {
  id: string;
  orderNumber: string;
  /** pending | ordered | partially_received */
  status: string;
  supplierId: string | null;
  supplierName: string;
  expectedDelivery: string | null;
  orderDate: string | null;
  /** client_contracts.id quando source_type='contract' (a EC que a PO serve). */
  contractId: string | null;
  origin: ReceivableOrigin | null;
  publication: ReceivablePublication | null;
  /** Há um email enviado ao fornecedor (scheduled_emails status='sent'). */
  emailSent: boolean;
  /** Linhas de produto (as de serviço ficam de fora). */
  lines: ReceivableLine[];
  /** Expedida pelo fornecedor no portal, com guia aberta (sem = null/ausente). */
  shipped?: ReceivableShipment | null;
}

export type RecTone = "ok" | "warn" | "bad" | "info" | "violet" | "neutral";

/** "YYYY-MM-DD" + n dias. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD…" → "dd/mm" ("—" sem data). */
export function fmtDayMonth(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}` : "—";
}

/** Data de um timestamptz no fuso local, "YYYY-MM-DD" (para comparar com "hoje"). */
export function localDay(ts: string | null | undefined): string | null {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const isConfirmed = (p: ReceivablePo) => p.publication?.status === "confirmed";

/** A data em que a encomenda chega: a prometida no portal (se confirmada) ou a prevista. Pode ser null. */
export function dataEntregaEf(p: ReceivablePo): string | null {
  const promised = isConfirmed(p) ? p.publication?.promisedDate : null;
  const d = promised || p.expectedDelivery;
  return d ? d.slice(0, 10) : null;
}

/** Confirmada pelo fornecedor desde ontem: "NOVA". */
export function novaConfirmacao(p: ReceivablePo, today: string): boolean {
  if (!isConfirmed(p)) return false;
  const day = localDay(p.publication?.confirmedAt);
  return !!day && day >= addDays(today, -1);
}

/** Atrasada na Receção: a data efetiva já passou (sem data nunca está atrasada). */
export function atrasadaRec(p: ReceivablePo, today: string): boolean {
  const d = dataEntregaEf(p);
  return !!d && d < today;
}

export type GrupoRec = -1 | 0 | 1 | 2 | 3 | 4;
export const GRUPOS_REC: Record<GrupoRec, string> = {
  [-1]: "Expedidas · a caminho",
  0: "Chega hoje / amanhã",
  1: "Atrasadas",
  2: "Confirmadas pelo fornecedor",
  3: "À espera do fornecedor",
  4: "Por enviar ao fornecedor",
};

/** O fornecedor expediu-a no portal e a guia ainda está aberta. */
export const expedidaRec = (p: ReceivablePo): boolean => !!p.shipped;

export function grupoRececao(p: ReceivablePo, today: string): GrupoRec {
  if (expedidaRec(p)) return -1;
  const d = dataEntregaEf(p);
  if ((d && d >= today && d <= addDays(today, 1)) || novaConfirmacao(p, today)) return 0;
  if (d && d < today) return 1;
  if (isConfirmed(p)) return 2;
  if (p.status !== "pending") return 3;
  return 4;
}

/** Ordem: grupo; no grupo 0 as confirmadas e as parciais primeiro; depois a data efetiva (sem data no fim) e o número. */
export function compararRececao(a: ReceivablePo, b: ReceivablePo, today: string): number {
  const ga = grupoRececao(a, today);
  const gb = grupoRececao(b, today);
  if (ga !== gb) return ga - gb;
  if (ga === -1) {
    const sa = a.shipped?.shippedAt ?? "";
    const sb = b.shipped?.shippedAt ?? "";
    if (sa !== sb) {
      if (!sa) return 1;
      if (!sb) return -1;
      return sa.localeCompare(sb);
    }
  }
  if (ga === 0) {
    const c = Number(isConfirmed(b)) - Number(isConfirmed(a));
    if (c) return c;
    const pa = Number(b.status === "partially_received") - Number(a.status === "partially_received");
    if (pa) return pa;
  }
  const da = dataEntregaEf(a);
  const db = dataEntregaEf(b);
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  }
  return a.orderNumber.localeCompare(b.orderNumber);
}

export const ordenarRececao = (L: readonly ReceivablePo[], today: string): ReceivablePo[] =>
  [...L].sort((a, b) => compararRececao(a, b, today));

/** O selo do portal na Receção: texto e tom (nunca só cor — o componente põe ícone). */
export function seloRececao(p: ReceivablePo): readonly [string, RecTone] {
  if (p.status === "pending") return ["Por enviar ao fornecedor", "warn"];
  const pub = p.publication && p.publication.status !== "withdrawn" ? p.publication : null;
  if (pub?.status === "confirmed") {
    return pub.promisedDate ? [`Confirmada p/ ${fmtDayMonth(pub.promisedDate)}`, "ok"] : ["Confirmada pelo fornecedor", "ok"];
  }
  if (pub?.status === "viewed") {
    const d = localDay(pub.viewedAt);
    return [`No portal · vista${d ? ` ${fmtDayMonth(d)}` : ""}`, "info"];
  }
  if (pub?.status === "sent") return ["No portal · por ver", "neutral"];
  if (p.emailSent) return ["Enviada por email", "neutral"];
  return ["Sem envio registado", "neutral"];
}

/** O que falta receber: unidades de stock e linhas. */
export function faltaPo(p: ReceivablePo): { un: number; linhas: number } {
  const L = p.lines.filter((l) => l.open > 0);
  return { un: L.reduce((a, l) => a + l.open * (l.unitsPerUom || 1), 0), linhas: L.length };
}

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 });
export const fmtUn = (n: number) => nf.format(n);

/** Unidade da linha: "cx (= 12 un)" numa embalagem, senão o código da unidade. */
export const lineUnitLabel = (l: Pick<ReceivableLine, "uomCode" | "unitsPerUom">) =>
  l.unitsPerUom > 1 ? `${l.uomCode || "emb."} (= ${fmtUn(l.unitsPerUom)} un)` : l.uomCode || "un.";

export function textoFalta(p: ReceivablePo): string {
  const f = faltaPo(p);
  return `${fmtUn(f.un)} un · ${f.linhas} ${f.linhas === 1 ? "linha" : "linhas"}`;
}

/** Ainda há alguma coisa por receber (status em aberto e uma linha de produto com falta). */
export const poRecebivel = (p: ReceivablePo): boolean =>
  ["pending", "ordered", "partially_received"].includes(p.status) && p.lines.some((l) => l.open > 0);

// ── Filtros, chips e blocos ──────────────────────────────────────────────────

export type ChipRec = "todas" | "hoje" | "atrasadas" | "clientes" | "stock";
export type AgruparRec = "nao" | "forn";

/** `ids`/`lido`: o filtro posto pela barra de leitura (as POs de uma guia, de um artigo ou de vários números). */
export interface FiltrosRec {
  q: string;
  sup: string;
  cli: string;
  chip: ChipRec;
  ids: string[];
  lido: string;
}
export const FILTROS_REC: FiltrosRec = { q: "", sup: "", cli: "", chip: "todas", ids: [], lido: "" };

/** O cliente/obra de uma PO (o contrato que ela serve) ou "" (stock). */
export const chaveCliente = (p: ReceivablePo): string => p.contractId ?? "";

export function rotuloCliente(p: ReceivablePo): string {
  if (!p.contractId) return "Stock";
  if (!p.origin) return "Encomenda de cliente";
  return p.origin.clientName ? `${p.origin.number} · ${p.origin.clientName}` : p.origin.number;
}

function doChip(p: ReceivablePo, c: ChipRec, today: string): boolean {
  if (c === "clientes") return !!chaveCliente(p);
  if (c === "stock") return !chaveCliente(p);
  if (c === "atrasadas") return atrasadaRec(p, today);
  if (c === "hoje") return grupoRececao(p, today) <= 0;
  return true;
}

/** As POs com a pesquisa e os filtros (sem o chip). */
function semChip(pos: readonly ReceivablePo[], f: FiltrosRec): ReceivablePo[] {
  const q = f.q.trim().toLowerCase();
  return pos
    .filter(poRecebivel)
    .filter((p) => (!f.sup || p.supplierId === f.sup) && (!f.cli || chaveCliente(p) === f.cli) && (!f.ids.length || f.ids.includes(p.id)))
    .filter(
      (p) =>
        !q ||
        [p.orderNumber, p.supplierName, p.origin?.number ?? "", p.origin?.clientName ?? ""].join(" ").toLowerCase().includes(q),
    );
}

/** As POs por receber, filtradas e por ordem de chegada. */
export function porReceber(pos: readonly ReceivablePo[], f: Partial<FiltrosRec>, today: string): ReceivablePo[] {
  const x = { ...FILTROS_REC, ...f };
  return ordenarRececao(
    semChip(pos, x).filter((p) => doChip(p, x.chip, today)),
    today,
  );
}

/** As contagens dos chips (com os outros filtros aplicados). */
export function contagensRec(pos: readonly ReceivablePo[], f: Partial<FiltrosRec>, today: string): Record<ChipRec, number> {
  const L = semChip(pos, { ...FILTROS_REC, ...f });
  const n = (c: ChipRec) => L.filter((p) => doChip(p, c, today)).length;
  return { todas: L.length, hoje: n("hoje"), atrasadas: n("atrasadas"), clientes: n("clientes"), stock: n("stock") };
}

/** Clientes/obras distintos das POs por receber, para o filtro (chave → rótulo). */
export function opcoesClientes(pos: readonly ReceivablePo[]): [string, string][] {
  const m = new Map<string, string>();
  for (const p of pos) if (poRecebivel(p) && p.contractId && !m.has(p.contractId)) m.set(p.contractId, rotuloCliente(p));
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-PT"));
}

/** Fornecedores distintos das POs por receber (id → nome). */
export function opcoesFornecedores(pos: readonly ReceivablePo[]): [string, string][] {
  const m = new Map<string, string>();
  for (const p of pos) if (poRecebivel(p) && p.supplierId && !m.has(p.supplierId)) m.set(p.supplierId, p.supplierName);
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-PT"));
}

export interface BlocoRec {
  chave: string;
  titulo: string;
  pos: ReceivablePo[];
  falta: number;
  atrasada: boolean;
}

/** Blocos por fornecedor, pela ordem de chegada da primeira PO de cada um. */
export function blocosRec(L: readonly ReceivablePo[], today: string): BlocoRec[] {
  const m = new Map<string, BlocoRec>();
  for (const p of L) {
    const k = p.supplierId ?? "";
    const b = m.get(k) ?? { chave: k, titulo: p.supplierName || "Sem fornecedor", pos: [], falta: 0, atrasada: false };
    b.pos.push(p);
    b.falta += faltaPo(p).un;
    b.atrasada ||= atrasadaRec(p, today);
    m.set(k, b);
  }
  const B = [...m.values()].map((b) => ({ ...b, pos: ordenarRececao(b.pos, today) }));
  return B.sort((a, b) => compararRececao(a.pos[0], b.pos[0], today));
}
