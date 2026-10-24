// Portal do Fornecedor F3.4b — aprovação de preços (lado do CRM).
// Contrato: vault "fase3-portal/contrato-f34b-precos.md", secção 5.
// rpc_price_changes_list / rpc_price_changes_decide devolvem Json nos tipos
// gerados: a forma do JSON fica descrita aqui.
import { callRpc, formatMoney, type RpcError } from "./types";

/** Texto do servidor terminado em ponto; vazio → null. */
const sentence = (msg: string | null | undefined): string | null => {
  const m = (msg ?? "").trim();
  if (!m) return null;
  return /[.!?]$/.test(m) ? m : `${m}.`;
};

export type PriceChangeStatus = "pending" | "approved" | "rejected" | "superseded";
export type PriceChangeFilter = PriceChangeStatus | "decided" | "all";

export interface PriceChangeCostPlan {
  will_update: boolean;
  reason: string | null;
  message: string | null;
  is_preferred: boolean | null;
  preferred_supplier_name: string | null;
  units_per_purchase_uom: number | null;
  new_unit_cost: number | null;
  current_unit_cost: number | null;
  current_cost_currency: string | null;
  sale_price: number | null;
  margin_current_pct: number | null;
  margin_new_pct: number | null;
}

export interface PriceChangeItem {
  id: string;
  status: PriceChangeStatus;
  organization_id: string;
  requested_at: string;
  batch_id: string;
  supplier: { id: string; name: string };
  catalog_item: { id: string; supplier_ref: string; name: string; is_active: boolean };
  item_supplier_id: string;
  product: { id: string; name: string; sku: string | null } | null;
  purchase_uom: { id: string | null; code: string | null } | null;
  is_preferred: boolean;
  current_price: number | null;
  current_currency: string | null;
  old_price: number | null;
  new_price: number;
  currency: string;
  catalog_old_price: number | null;
  catalog_new_price: number | null;
  diff: number | null;
  diff_pct: number | null;
  unit_changed: boolean;
  old_unit_label: string | null;
  unit_label: string | null;
  old_units_per_pack: number | null;
  units_per_pack: number | null;
  stale: boolean;
  already_applied: boolean;
  /** Só nos pendentes. */
  product_cost: PriceChangeCostPlan | null;
  decided_at: string | null;
  decided_by: { id: string; name: string | null } | null;
  decision_note: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  result: Record<string, unknown> | null;
}

export interface PriceChangeList {
  counts: Record<PriceChangeStatus, number>;
  total: number;
  limit: number;
  offset: number;
  can_decide: boolean;
  items: PriceChangeItem[];
}

export type DecideOutcome =
  | {
      id: string;
      outcome: "approved";
      item_supplier_updated: boolean;
      accepted_unit_change: boolean;
      product_cost_updated: boolean;
      product_cost_rows: number;
      product_cost_reason: string | null;
      product_cost_message: string | null;
      new_unit_cost: number | null;
      units_per_purchase_uom: number | null;
    }
  | { id: string; outcome: "rejected" }
  | { id: string; outcome: "skipped"; reason: "not_pending" | "stale" | "unit_changed" | string; message: string | null; status?: string };

export interface DecideResult {
  approved: number;
  rejected: number;
  skipped: number;
  item_suppliers_updated: number;
  product_costs_updated: number;
  results: DecideOutcome[];
}

export const NOTE_MAX = 500;

export async function listPriceChanges(args: {
  supplierId?: string | null;
  productId?: string | null;
  status?: PriceChangeFilter;
  limit?: number;
  offset?: number;
}): Promise<{ data: PriceChangeList | null; error: RpcError | null }> {
  return callRpc<PriceChangeList>("rpc_price_changes_list", {
    ...(args.supplierId ? { p_supplier_id: args.supplierId } : {}),
    ...(args.productId ? { p_product_id: args.productId } : {}),
    p_status: args.status ?? "pending",
    p_limit: args.limit ?? 100,
    p_offset: args.offset ?? 0,
  });
}

export async function decidePriceChanges(args: {
  ids: string[];
  approve: boolean;
  note?: string | null;
  acceptUnitChange?: boolean;
}): Promise<{ data: DecideResult | null; error: RpcError | null }> {
  const note = (args.note ?? "").trim();
  return callRpc<DecideResult>("rpc_price_changes_decide", {
    p_ids: args.ids,
    p_approve: args.approve,
    ...(note ? { p_note: note.slice(0, NOTE_MAX) } : {}),
    p_accept_unit_change: !!args.acceptUnitChange,
  });
}

/** Sem permissão para ver a lista: a secção/aviso some em vez de mostrar erro. */
export const isNoPermission = (err: RpcError | null | undefined) =>
  !!err && (err.hint === "no_permission" || err.code === "42501");

export const formatPct = (v: number | null | undefined, signed = false): string => {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  const n = Number(v);
  const txt = `${n.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`;
  return signed && n > 0 ? `+${txt}` : txt;
};

const unitText = (label: string | null, perPack: number | null) =>
  [label || null, perPack ? `× ${Number(perPack).toLocaleString("pt-PT")}` : null].filter(Boolean).join(" ") || "sem unidade";

/** "un → cx × 12" quando o fornecedor mudou a unidade/embalagem. */
export const unitChangeText = (item: Pick<PriceChangeItem, "old_unit_label" | "old_units_per_pack" | "unit_label" | "units_per_pack">) =>
  `${unitText(item.old_unit_label, item.old_units_per_pack)} → ${unitText(item.unit_label, item.units_per_pack)}`;

/** O que aceitar faz ao custo do produto (para a coluna "Custo do produto"). */
export function costEffect(item: PriceChangeItem): { changes: boolean; text: string } {
  const plan = item.product_cost;
  if (!plan) return { changes: false, text: "-" };
  if (plan.will_update) {
    return {
      changes: true,
      text: `Muda: ${formatMoney(plan.current_unit_cost, plan.current_cost_currency ?? item.currency)} → ${formatMoney(plan.new_unit_cost, item.currency)}${
        plan.units_per_purchase_uom && plan.units_per_purchase_uom > 1 ? ` (÷ ${plan.units_per_purchase_uom})` : ""
      }`,
    };
  }
  if (plan.reason === "not_preferred") {
    return {
      changes: false,
      text: plan.preferred_supplier_name
        ? `Não muda: o custo vem do fornecedor preferencial (${plan.preferred_supplier_name})`
        : "Não muda: este fornecedor não é o preferencial",
    };
  }
  return { changes: false, text: `Não muda${plan.message ? `: ${plan.message}` : ""}` };
}

/** Uma linha de resultado por pedido decidido (para mostrar depois de decidir). */
export function describeOutcome(o: DecideOutcome, item: PriceChangeItem | undefined): { text: string; tone: "ok" | "info" | "warn" } {
  if (o.outcome === "rejected") return { text: "Recusado: nada mudou.", tone: "info" };
  if (o.outcome === "skipped") {
    return { text: o.message || "Não foi decidido.", tone: "warn" };
  }
  const parts: string[] = [];
  parts.push(
    o.item_supplier_updated
      ? `Preço do fornecedor atualizado${item ? ` para ${formatMoney(item.new_price, item.currency)}` : ""}.`
      : "O preço do fornecedor já era este.",
  );
  if (o.product_cost_updated) {
    parts.push(`Custo do produto atualizado${o.new_unit_cost != null ? ` para ${formatMoney(o.new_unit_cost, item?.currency ?? null)}` : ""}.`);
  } else {
    parts.push(sentence(o.product_cost_message) ?? "O custo do produto não mudou.");
  }
  return { text: parts.join(" "), tone: o.product_cost_updated ? "ok" : "info" };
}

/** Resumo para o toast. */
export function summarizeDecision(r: DecideResult): string {
  const parts: string[] = [];
  if (r.approved) parts.push(`${r.approved} aceite(s)`);
  if (r.rejected) parts.push(`${r.rejected} recusado(s)`);
  if (r.skipped) parts.push(`${r.skipped} não decidido(s)`);
  const head = parts.join(", ") || "Nada decidido";
  const costs = r.approved ? ` Custo do produto atualizado em ${r.product_costs_updated}.` : "";
  return `${head}.${costs}`;
}

/** Mensagens "o custo não mudou porque…" dos aceites (únicas, para o toast). */
export function costNotUpdatedMessages(r: DecideResult): string[] {
  const out = new Set<string>();
  r.results.forEach((o) => {
    if (o.outcome === "approved" && !o.product_cost_updated) {
      const s = sentence(o.product_cost_message);
      if (s) out.add(s);
    }
    if (o.outcome === "skipped" && o.message) out.add(o.message);
  });
  return Array.from(out);
}
