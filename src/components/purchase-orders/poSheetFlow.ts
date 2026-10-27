// Folha da encomenda a fornecedor: o percurso (linha de etapas), o passo da Receção e o bloqueio de edição,
// como percursoPo / ProximoRececao / motivoBloqueioPo do Olyvia 2.0 (po.ts, PoCab.tsx) mas sobre os dados reais:
//   purchase_orders (status, order_date, created_at, deleted_at), supplier_po_publications (sent/viewed/confirmed,
//   promised_date), purchase_order_receipts (última receção ativa), purchase_order_items (recebido/encomendado),
//   guia do portal (expedição, via poPortalShipments ou o registo de auditoria supplier_shipment).
// Sem React e sem BD — testável à parte (__tests__/poSheetFlow.test.ts).

export type PoFlowStepState = "done" | "current" | "todo";

export interface PoFlowStep {
  key: "draft" | "ordered" | "viewed" | "confirmed" | "shipped" | "partial" | "received";
  label: string;
  /** Subtexto (data, "sem portal", "3 de 10", …); "" quando ainda não há. */
  detail: string;
  state: PoFlowStepState;
}

export interface PoFlowPublication {
  status: string;
  sent_at?: string | null;
  viewed_at?: string | null;
  confirmed_at?: string | null;
  promised_date?: string | null;
  promised_date_accepted_at?: string | null;
}

export interface PoFlowInput {
  /** Estado gravado da PO (pending · ordered · partially_received · received · cancelled). */
  status: string;
  orderDate?: string | null;
  createdAt?: string | null;
  /** Rascunho gerado por uma Encomenda Cliente: o nº (passo 1 passa a "Criada a partir de …"). */
  autoFromNumber?: string | null;
  /** Quando passou a Encomendado (registo de auditoria); sem ele usa-se o envio para o portal. */
  orderedAt?: string | null;
  /** Publicação no portal (null/undefined = sem publicação). Retirada conta como sem publicação. */
  publication?: PoFlowPublication | null;
  /** O fornecedor tem acesso ao portal (null = desconhecido). */
  portalLinked?: boolean | null;
  /** Última expedição do fornecedor no portal (guia). */
  shipment?: { noteNumber: string; shipDate?: string | null } | null;
  /** Unidades recebidas / a receber (encomendado − anulado), na unidade das linhas. */
  receivedQty?: number | null;
  expectedQty?: number | null;
  /** Data da última receção ativa (timestamptz) ou actual_delivery_date. */
  receivedAt?: string | null;
}

/** "YYYY-MM-DD…" → "dd/mm/aaaa" sem passar por Date (as colunas date não têm fuso). */
export function fmtDay(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** timestamptz → "dd/mm/aaaa, hh:mm". */
export function fmtDayTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const fmtQty = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

/** Estados em que a PO ainda se recebe na Receção (os mesmos de "Por receber"). */
export const PO_RECEIVABLE_STATUSES = ["pending", "ordered", "partially_received"] as const;

export const isPoReceivableStatus = (status: string | null | undefined, deleted = false): boolean =>
  !deleted && (PO_RECEIVABLE_STATUSES as readonly string[]).includes(status ?? "");

const activePublication = (p: PoFlowPublication | null | undefined): PoFlowPublication | null =>
  p && p.status !== "withdrawn" ? p : null;

/**
 * O percurso da PO (percursoPo do 2.0): Rascunho → Encomendada → Vista pelo fornecedor → Confirmada →
 * [Expedida] → Parcialmente recebida → Recebida. Cancelada não tem percurso (devolve []).
 */
export function poFlowSteps(i: PoFlowInput): PoFlowStep[] {
  const st = i.status;
  if (st === "cancelled") return [];
  const pub = activePublication(i.publication);
  const left = st !== "pending";
  // Sem publicação e já encomendada: o fornecedor não tem portal (ou foi encomendada antes do portal).
  const noPortal = left && !pub;
  const ordered = i.orderedAt || pub?.sent_at || null;

  const steps: Omit<PoFlowStep, "state">[] = [
    { key: "draft", label: i.autoFromNumber ? `Criada a partir de ${i.autoFromNumber}` : "Rascunho", detail: fmtDay(i.orderDate) || fmtDay(i.createdAt) },
    { key: "ordered", label: "Encomendada", detail: left && ordered ? fmtDayTime(ordered) : "" },
    {
      key: "viewed",
      label: "Vista pelo fornecedor",
      detail: noPortal ? (i.portalLinked === false ? "sem portal" : "fora do portal") : pub?.viewed_at ? fmtDayTime(pub.viewed_at) : "",
    },
    {
      key: "confirmed",
      label: "Confirmada",
      detail: pub?.status === "confirmed"
        ? pub.promised_date ? `entrega prometida ${fmtDay(pub.promised_date)}` : "sem data prometida"
        : "",
    },
    {
      key: "partial",
      label: "Parcialmente recebida",
      detail: st === "partially_received" && i.expectedQty != null && i.receivedQty != null
        ? `${fmtQty(i.receivedQty)} de ${fmtQty(i.expectedQty)}`
        : "",
    },
    { key: "received", label: "Recebida", detail: st === "received" ? fmtDay(i.receivedAt) : "" },
  ];
  // Com expedição do fornecedor (guia do portal), "Expedida" entra entre Confirmada e Parcialmente recebida.
  const ex = i.shipment ? 1 : 0;
  if (i.shipment) {
    const d = fmtDay(i.shipment.shipDate);
    steps.splice(4, 0, { key: "shipped", label: "Expedida", detail: `guia ${i.shipment.noteNumber}${d ? ` · ${d}` : ""}` });
  }
  // O passo atual, como no 2.0 (sem portal o "Vista" fica como atual até haver receções).
  let cur = 0;
  if (left) cur = 1;
  if (pub?.viewed_at || pub?.status === "viewed" || noPortal) cur = 2;
  if (pub?.status === "confirmed") cur = 3;
  if (i.shipment) cur = 4;
  if (st === "partially_received" || st === "received") cur = 4 + ex;
  if (st === "received") cur = 6 + ex;
  return steps.map((s, idx) => ({ ...s, state: idx < cur ? "done" : idx === cur ? "current" : "todo" }));
}

/** O fornecedor confirmou com data prometida e ainda não foi aceite (o botão "Aceitar data prometida"). */
export function poPromiseAcceptance(pub: PoFlowPublication | null | undefined): "accept" | "accepted" | null {
  const p = activePublication(pub);
  if (!p || p.status !== "confirmed" || !p.promised_date) return null;
  return p.promised_date_accepted_at ? "accepted" : "accept";
}

/**
 * A linha a seguir às etapas (ProximoRececao do 2.0): "Receção no armazém: feita." (recebida) ou
 * "Próximo passo: Receção no armazém →" (pendente/encomendada/parcial); nada se cancelada ou eliminada.
 */
export type PoReceptionHint = { kind: "done" } | { kind: "next"; pendingNote: boolean } | null;

export function poReceptionHint(status: string, deleted = false): PoReceptionHint {
  if (deleted || status === "cancelled") return null;
  if (status === "received") return { kind: "done" };
  if (isPoReceivableStatus(status)) return { kind: "next", pendingNote: status === "pending" };
  return null;
}

/** Porque é que a PO não se edita e o que o levanta (motivoBloqueioPo + desbloqueioPo do 2.0, com as ações reais). */
export interface PoSheetLock {
  kind: "portal" | "received" | "partial" | "permission";
  reason: string;
  /** Ação que levanta o bloqueio (só as que existem na app): retirar do portal ou reverter a receção. */
  unlock: "withdraw" | "revert" | null;
  /** Texto extra quando não há botão (ex.: confirmada pelo fornecedor). */
  hint?: string;
}

export interface PoSheetLockInput {
  status: string;
  /** Publicação ativa no portal (sent/viewed/confirmed). */
  publicationStatus?: string | null;
  /** rpc_po_supplier_status.can_withdraw. */
  canWithdraw?: boolean;
  hasReceivedLines?: boolean;
  lacksEditPermission?: boolean;
}

export function poSheetLock(i: PoSheetLockInput): PoSheetLock | null {
  const pub = i.publicationStatus && i.publicationStatus !== "withdrawn" ? i.publicationStatus : null;
  if (i.status === "received") {
    return { kind: "received", reason: "Encomenda recebida: as linhas refletem o que entrou no armazém", unlock: i.hasReceivedLines ? "revert" : null };
  }
  if (i.status === "partially_received") {
    return { kind: "partial", reason: "Parcialmente recebida: as linhas refletem o que já entrou no armazém", unlock: i.hasReceivedLines ? "revert" : null };
  }
  if (pub && isPoReceivableStatus(i.status)) {
    if (i.canWithdraw) {
      return { kind: "portal", reason: "Publicada no portal do fornecedor: linhas, fornecedor, data e estado bloqueados", unlock: "withdraw" };
    }
    return {
      kind: "portal",
      reason: pub === "confirmed"
        ? "Confirmada pelo fornecedor no portal: linhas, fornecedor, data e estado bloqueados"
        : "Publicada no portal do fornecedor: linhas, fornecedor, data e estado bloqueados",
      unlock: null,
      hint: pub === "confirmed" ? "Para reduzir quantidades use “Não vou receber o resto”." : undefined,
    };
  }
  if (i.lacksEditPermission) return { kind: "permission", reason: "Sem permissão para editar encomendas — só de leitura", unlock: null };
  return null;
}

/** Recebido / esperado (encomendado − anulado) nas linhas de produto, para o subtexto de "Parcialmente recebida". */
export function poReceivedProgress(
  items: ReadonlyArray<{ id: string; item_type?: string | null; quantity: number | null; received_quantity: number | null }>,
  cancellations: ReadonlyArray<{ purchase_order_item_id: string | null; quantity_cancelled: number | null; undone_at?: string | null }> = [],
): { received: number; expected: number } {
  const products = items.filter((it) => !it.item_type || it.item_type === "product");
  const ids = new Set(products.map((it) => it.id));
  const cancelled = cancellations
    .filter((c) => !c.undone_at && c.purchase_order_item_id && ids.has(c.purchase_order_item_id))
    .reduce((a, c) => a + (Number(c.quantity_cancelled) || 0), 0);
  const ordered = products.reduce((a, it) => a + (Number(it.quantity) || 0), 0);
  const received = products.reduce((a, it) => a + (Number(it.received_quantity) || 0), 0);
  return { received, expected: Math.max(0, ordered - cancelled) };
}

/** Data da última receção ativa (kind receipt, não revertida). */
export function lastActiveReceiptAt(
  rows: ReadonlyArray<{ received_at: string; kind?: string | null; reverted_at?: string | null }>,
): string | null {
  let best: string | null = null;
  for (const r of rows) {
    if (r.reverted_at || (r.kind && r.kind !== "receipt")) continue;
    if (!best || r.received_at > best) best = r.received_at;
  }
  return best;
}
