// Filtros da lista "Saídas para clientes" que a RPC da lista não faz (filtrarEcs
// do Olyvia 2.0): a origem (chip "Origem: …" vindo do Hoje) e as encomendas
// eliminadas ("Ver eliminadas"). Funções puras — a página só as aplica.
//
// rpc_list_client_order_documents não filtra por origem nem devolve as
// eliminadas (cc.deleted_at IS NULL e status assinado). Por isso:
//   - origem: a página lê a lista inteira (até um teto, como "Prontas a
//     expedir") e filtra aqui por origin_type;
//   - eliminadas: lidas de client_contracts (useDeletedClientOrders) e
//     intercaladas aqui com as ativas, pela mesma ordem da lista.
import type { ClientOrderOriginFilter } from "@/components/inventory/ui/inventoryLinks";

export type ClientOrderOrigin = Exclude<ClientOrderOriginFilter, "all">;

/** Texto do chip "Origem: …" (ORIGENS do 2.0). */
export const CLIENT_ORDER_ORIGIN_FILTER_LABELS: Record<ClientOrderOrigin, string> = {
  contract: "Contratos",
  direct_sale: "Vendas diretas",
  manual: "Encomendas manuais",
};

/** Sem origin_type (RPC antiga) conta como contrato — a origem por omissão. */
export const rowOrigin = (row: { origin_type?: string | null }): ClientOrderOrigin =>
  row.origin_type === "direct_sale" || row.origin_type === "manual" ? row.origin_type : "contract";

export function filterRowsByOrigin<T extends { origin_type?: string | null }>(
  rows: readonly T[],
  origin: ClientOrderOriginFilter,
): T[] {
  return origin === "all" ? [...rows] : rows.filter((r) => rowOrigin(r) === origin);
}

// ── Eliminadas ────────────────────────────────────────────────────────────

/**
 * Encomenda eliminada (rpc_delete_client_order: deleted_at + status
 * 'cancelled' + cancellation_reason) ou anulada pelo contrato
 * (cancel_and_replace_contract: status 'cancelled'), lida de client_contracts.
 */
export interface DeletedClientOrderRow {
  contract_id: string;
  contract_number: string;
  order_number: string | null;
  client_name: string | null;
  signature_date: string | null;
  /** deleted_at, ou cancelled_at quando só foi anulada. */
  deleted_at: string | null;
  delete_reason: string | null;
  delivery_address: string | null;
  notes: string | null;
  total_value: number | null;
  is_manual_order: boolean;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Linha de client_contracts (com entity:anew_entities(display_name)) → DeletedClientOrderRow. */
export function mapDeletedContract(raw: Record<string, unknown>): DeletedClientOrderRow | null {
  const id = text(raw.id);
  if (!id) return null;
  const entity = raw.entity as { display_name?: unknown } | Array<{ display_name?: unknown }> | null | undefined;
  const entityName = Array.isArray(entity) ? entity[0]?.display_name : entity?.display_name;
  return {
    contract_id: id,
    contract_number: text(raw.contract_number) ?? "",
    order_number: text(raw.order_number),
    client_name: text(entityName),
    signature_date: text(raw.signature_date),
    deleted_at: text(raw.deleted_at) ?? text(raw.cancelled_at),
    delete_reason: text(raw.cancellation_reason),
    delivery_address: text(raw.delivery_address),
    notes: text(raw.notes),
    total_value: num(raw.total_value),
    is_manual_order: raw.is_manual_order === true,
  };
}

/**
 * Origem de uma eliminada: venda direta se houver direct_sales ligada (a
 * venda fica 'cancelada', não apagada), senão manual/contrato pelo
 * is_manual_order. Sem direct_sales.view a RLS esconde a venda e a
 * encomenda aparece como manual/contrato — a mesma regra da lista.
 */
export const deletedRowOrigin = (row: DeletedClientOrderRow, hasDirectSale: boolean): ClientOrderOrigin =>
  hasDirectSale ? "direct_sale" : row.is_manual_order ? "manual" : "contract";

export interface DeletedRowFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  origin: ClientOrderOriginFilter;
  /** Filtro de estado ou "Prontas a expedir" ativo: as eliminadas não entram (como no 2.0). */
  statusActive: boolean;
}

/**
 * Mesmos filtros da lista: pesquisa (nº EC, contrato, cliente e o nº da
 * venda direta/proforma, em `extraSearch`), datas pela data da encomenda e
 * origem.
 */
export function filterDeletedRows(
  rows: readonly DeletedClientOrderRow[],
  f: DeletedRowFilters,
  originOf: (row: DeletedClientOrderRow) => ClientOrderOrigin,
  extraSearch: (row: DeletedClientOrderRow) => readonly (string | null | undefined)[] = () => [],
): DeletedClientOrderRow[] {
  if (f.statusActive) return [];
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.origin !== "all" && originOf(r) !== f.origin) return false;
    const day = r.signature_date ? r.signature_date.slice(0, 10) : "";
    if (f.dateFrom && (!day || day < f.dateFrom)) return false;
    if (f.dateTo && (!day || day > f.dateTo)) return false;
    if (!q) return true;
    return [r.order_number, r.contract_number, r.client_name, ...extraSearch(r)]
      .some((v) => !!v && v.toLowerCase().includes(q));
  });
}

export type ClientOrderListEntry<A, D> =
  | { kind: "active"; row: A }
  | { kind: "deleted"; row: D };

const time = (v: string | null | undefined): number => {
  if (!v) return Number.NEGATIVE_INFINITY;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/**
 * Intercala as eliminadas nas ativas pela data da encomenda (mais recente
 * primeiro, a ordem da RPC). Enquanto a lista ativa ainda tem páginas por
 * carregar, as eliminadas mais antigas que a última ativa ficam para quando
 * essas páginas chegarem — senão apareciam fora de ordem no fim.
 */
export function mergeWithDeleted<A extends { signature_date: string | null }, D extends { signature_date: string | null }>(
  active: readonly A[],
  deleted: readonly D[],
  activeComplete: boolean,
): ClientOrderListEntry<A, D>[] {
  const sortedDeleted = [...deleted].sort((a, b) => time(b.signature_date) - time(a.signature_date));
  // Abaixo deste limite ainda podem faltar ativas (páginas por carregar).
  const floor = activeComplete
    ? Number.NEGATIVE_INFINITY
    : active.length > 0
      ? time(active[active.length - 1].signature_date)
      : Number.POSITIVE_INFINITY;
  const out: ClientOrderListEntry<A, D>[] = [];
  let i = 0;
  for (const a of active) {
    const ta = time(a.signature_date);
    while (i < sortedDeleted.length && time(sortedDeleted[i].signature_date) > ta) {
      out.push({ kind: "deleted", row: sortedDeleted[i++] });
    }
    out.push({ kind: "active", row: a });
  }
  while (i < sortedDeleted.length && time(sortedDeleted[i].signature_date) >= floor) {
    out.push({ kind: "deleted", row: sortedDeleted[i++] });
  }
  return out;
}
