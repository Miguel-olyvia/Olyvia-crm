// Separador "Histórico" da folha da encomenda a fornecedor (TabHistorico do Olyvia 2.0) a partir do registo de
// auditoria que já existe: entity_audit_log com table_name='purchase_orders' e entity_id = id da PO. As RPCs da PO
// escrevem uma linha consolidada (fn_manual_audit_log) — criação/edição (web_app, com o diff aninhado em
// {purchase_orders, purchase_order_items}), envio/retirada do portal (supplier_publication), confirmação e expedição
// pelo fornecedor (source supplier_portal: supplier_publication, supplier_shipment, supplier_shipment_file), aceitar a
// data prometida — e o gatilho genérico escreve as mudanças de estado das receções. Só leitura, RLS existente.
import { supabase } from "@/integrations/supabase/client";
import { noteLabel } from "@/components/receiving/deliveryNotes";
import { fmtDay } from "./poSheetFlow";

export interface PoAuditRow {
  id: string;
  operation: string;
  changed_fields: unknown;
  changed_by: string | null;
  source: string | null;
  created_at: string;
}

export interface PoHistoryEntry {
  id: string;
  at: string;
  title: string;
  details: string[];
  /** Nome de quem fez (anew_users) ou "Portal do fornecedor". */
  actor: string | null;
}

type Diff = Record<string, unknown>;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  ordered: "Encomendado",
  partially_received: "Parcialmente recebida",
  received: "Recebida",
  cancelled: "Cancelada",
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isChange = (v: unknown): v is { old?: unknown; new?: unknown } => isObj(v) && ("old" in v || "new" in v);
const str = (v: unknown): string => (v == null ? "" : String(v));
const statusLabel = (v: unknown) => STATUS_LABEL[str(v)] ?? (str(v) || "—");
const eur = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }) : "—";
};
const day = (v: unknown) => fmtDay(str(v)) || "—";

/** Chaves de evento (não são colunas de purchase_orders) escritas pelas RPCs do portal e do aceitar data. */
const EVENT_KEYS = new Set(["supplier_publication", "supplier_shipment", "supplier_shipment_file", "source"]);

/** Junta o diff consolidado ({purchase_orders:{…}, purchase_order_items:{new:[…]}}) com o diff plano do gatilho. */
function flatten(changed: unknown): { po: Diff; items: unknown[] | null; extra: Diff } {
  const po: Diff = {};
  const extra: Diff = {};
  let items: unknown[] | null = null;
  if (!isObj(changed)) return { po, items, extra };
  for (const [k, v] of Object.entries(changed)) {
    if (EVENT_KEYS.has(k)) extra[k] = v;
    else if (k === "purchase_orders" && isObj(v) && !isChange(v)) Object.assign(po, v);
    else if (k === "purchase_order_items" && isObj(v)) items = Array.isArray(v.new) ? (v.new as unknown[]) : [];
    else if (isChange(v)) po[k] = v;
    else extra[k] = v;
  }
  return { po, items, extra };
}

const IGNORED = new Set(["organization_id", "updated_at", "created_at", "order_number", "source_id", "source_type", "business_unit_id", "deleted_by"]);

const FIELD_TEXT: Record<string, (c: { old?: unknown; new?: unknown }) => string> = {
  expected_delivery: (c) => `Entrega prevista: ${day(c.old)} → ${day(c.new)}`,
  order_date: (c) => `Data da encomenda: ${day(c.old)} → ${day(c.new)}`,
  actual_delivery_date: (c) => `Data de entrega: ${day(c.new)}`,
  total_value: (c) => `Total: ${eur(c.old)} → ${eur(c.new)}`,
  supplier_id: () => "Fornecedor alterado",
  notes: () => "Notas internas alteradas",
  supplier_notes: () => "Notas para o fornecedor alteradas",
};

function publicationText(c: { old?: unknown; new?: unknown }): { title: string; details: string[] } {
  const n = isObj(c.new) ? c.new : {};
  const rev = Number(n.revision) > 1 ? ` (versão ${n.revision})` : "";
  switch (str(n.status)) {
    case "sent":
      return { title: `Encomendada e publicada no portal do fornecedor${rev}`, details: [] };
    case "viewed":
      return { title: "Vista pelo fornecedor no portal", details: [] };
    case "confirmed":
      return {
        title: "Confirmada pelo fornecedor",
        details: [n.promised_date ? `Entrega prometida: ${day(n.promised_date)}` : "Sem data prometida"],
      };
    case "withdrawn":
      return { title: "Retirada do portal do fornecedor", details: n.reason ? [`Motivo: ${str(n.reason)}`] : [] };
    default:
      return { title: "Portal do fornecedor atualizado", details: [] };
  }
}

/** Uma linha do registo de auditoria em texto legível (título + detalhes). */
export function describePoAuditRow(row: Pick<PoAuditRow, "operation" | "changed_fields">): { title: string; details: string[] } {
  const op = row.operation.toUpperCase();
  const { po, items, extra } = flatten(row.changed_fields);

  if (op === "INSERT") {
    const st = isChange(po.status) ? statusLabel(po.status.new) : null;
    const n = items?.length ?? 0;
    return { title: `Encomenda criada${st ? ` (${st})` : ""}`, details: n ? [`${n} linha(s)`] : [] };
  }
  if (op === "DELETE") return { title: "Encomenda apagada", details: [] };

  if (isChange(extra.supplier_shipment)) {
    const n = isObj(extra.supplier_shipment.new) ? extra.supplier_shipment.new : {};
    const details = [
      n.ship_date ? `Expedição: ${day(n.ship_date)}` : "",
      n.carrier ? `Transportador: ${str(n.carrier)}` : "",
      Number(n.lines) > 0 ? `${n.lines} linha(s)` : "",
    ].filter(Boolean);
    return { title: `Expedida pelo fornecedor com a guia ${noteLabel(str(n.note_number))}`, details };
  }
  if (isChange(extra.supplier_shipment_file)) {
    const n = isObj(extra.supplier_shipment_file.new) ? extra.supplier_shipment_file.new : {};
    return { title: "Ficheiro da guia anexado pelo fornecedor", details: n.name ? [str(n.name)] : [] };
  }

  const details: string[] = [];
  let title: string | null = null;
  if (isChange(extra.supplier_publication)) {
    const p = publicationText(extra.supplier_publication);
    title = p.title;
    details.push(...p.details);
  }
  if (isChange(po.status)) {
    const t = `Estado: ${statusLabel(po.status.old)} → ${statusLabel(po.status.new)}`;
    if (title) details.unshift(t);
    else title = t;
  }
  if (isChange(po.deleted_at)) {
    title = po.deleted_at.new ? "Encomenda eliminada" : "Encomenda restaurada";
  }
  for (const [k, c] of Object.entries(po)) {
    if (k === "status" || k === "deleted_at" || IGNORED.has(k) || !isChange(c)) continue;
    const f = FIELD_TEXT[k];
    const text = f ? f(c) : `Campo alterado: ${k}`;
    if (k === "expected_delivery" && extra.source === "supplier_promised_date") {
      if (!title) title = "Data prometida pelo fornecedor aceite";
      details.push(text);
      continue;
    }
    details.push(text);
  }
  if (items && op === "UPDATE" && !isChange(po.status)) details.push(`Linhas gravadas (${items.length})`);
  if (!title) {
    title = details.length ? "Encomenda alterada" : "Encomenda atualizada";
  }
  return { title, details };
}

/** Quando passou a Encomendado pela última vez (pending → ordered), ou null. */
export function orderedAtFromAudit(rows: readonly PoAuditRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const { po } = flatten(r.changed_fields);
    if (isChange(po.status) && str(po.status.new) === "ordered" && (!best || r.created_at > best)) best = r.created_at;
  }
  return best;
}

/** A última expedição do fornecedor no portal (supplier_shipment), ou null. */
export function lastShipmentFromAudit(rows: readonly PoAuditRow[]): { noteNumber: string; shipDate: string | null; at: string } | null {
  let best: { noteNumber: string; shipDate: string | null; at: string } | null = null;
  for (const r of rows) {
    const { extra } = flatten(r.changed_fields);
    if (!isChange(extra.supplier_shipment) || !isObj(extra.supplier_shipment.new)) continue;
    const n = extra.supplier_shipment.new;
    if (!best || r.created_at > best.at) best = { noteNumber: noteLabel(str(n.note_number)), shipDate: n.ship_date ? str(n.ship_date) : null, at: r.created_at };
  }
  return best;
}

/** Entradas do histórico, da mais recente para a mais antiga. */
export function poHistoryEntries(rows: readonly PoAuditRow[], names: ReadonlyMap<string, string>): PoHistoryEntry[] {
  return [...rows]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .map((r) => {
      const d = describePoAuditRow(r);
      const actor = r.source === "supplier_portal" ? "Portal do fornecedor" : r.changed_by ? names.get(r.changed_by) ?? null : null;
      return { id: r.id, at: r.created_at, title: d.title, details: d.details, actor };
    });
}

const LIMIT = 200;

/** Lê o registo de auditoria da PO e os nomes de quem fez (anew_users). Sem permissão a RLS devolve vazio. */
export async function fetchPoAuditLog(poId: string): Promise<{ rows: PoAuditRow[]; names: Map<string, string> }> {
  const { data, error } = await supabase
    .from("entity_audit_log")
    .select("id, operation, changed_fields, changed_by, source, created_at")
    .eq("entity_id", poId)
    .eq("table_name", "purchase_orders")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as PoAuditRow[];
  const ids = [...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from("anew_users").select("id, name").in("id", ids);
    for (const u of (users ?? []) as { id: string; name: string | null }[]) if (u.name) names.set(u.id, u.name);
  }
  return { rows, names };
}
