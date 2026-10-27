// Pesquisa global do Inventário (caixa do topo, como a gSearch do Olyvia 2.0):
// PO, EC, produto (nome/SKU/EAN/códigos alternativos), fornecedor e guia numa
// só caixa. Um pedido à BD (rpc_inventory_global_search) que já devolve os
// resultados agrupados e filtrados pelas permissões; aqui só se normaliza a
// resposta e se monta, para cada resultado, o texto e o link de destino
// (builders de inventoryLinks.ts — os mesmos parâmetros que as páginas leem).
import {
  clientOrdersLink,
  purchaseOrdersLink,
  receivingLink,
  stocksLink,
  suppliersLink,
} from "@/components/inventory/ui/inventoryLinks";

/** Mínimo de caracteres para pesquisar (igual ao da função na BD). */
export const GLOBAL_SEARCH_MIN_CHARS = 2;
/** Máximo de caracteres enviados (a BD corta também aos 100). */
export const GLOBAL_SEARCH_MAX_CHARS = 100;
/** Resultados por grupo (a BD aceita 1–20). */
export const GLOBAL_SEARCH_LIMIT = 8;
export const GLOBAL_SEARCH_DEBOUNCE_MS = 250;

export type GlobalSearchGroupKey =
  | "purchase_orders"
  | "client_orders"
  | "products"
  | "suppliers"
  | "delivery_notes";

/** Ordem dos grupos no ecrã (a do 2.0: PO, EC, produto, fornecedor, guia). */
export const GLOBAL_SEARCH_GROUP_ORDER: readonly GlobalSearchGroupKey[] = [
  "purchase_orders",
  "client_orders",
  "products",
  "suppliers",
  "delivery_notes",
];

export const GLOBAL_SEARCH_GROUP_LABELS: Record<GlobalSearchGroupKey, string> = {
  purchase_orders: "Encomendas a fornecedor",
  client_orders: "Encomendas Clientes",
  products: "Produtos",
  suppliers: "Fornecedores",
  delivery_notes: "Guias do fornecedor",
};

/** Permissão da página de destino de cada grupo (ProtectedRoute em App.tsx). */
export const GLOBAL_SEARCH_GROUP_PERMISSION: Record<GlobalSearchGroupKey, string> = {
  purchase_orders: "purchase_orders.view",
  client_orders: "client_orders.view",
  products: "inventory.view",
  suppliers: "suppliers.view",
  delivery_notes: "receiving.view",
};

// ── Forma devolvida pela RPC ────────────────────────────────────────────────
export interface SearchPurchaseOrder {
  id: string;
  order_number: string | null;
  status: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  supplier_name: string | null;
}
export interface SearchClientOrder {
  contract_id: string;
  order_number: string | null;
  contract_number: string | null;
  client_name: string | null;
  signature_date: string | null;
  origin_type: "contract" | "direct_sale" | "manual" | string | null;
  origin_number: string | null;
}
export interface SearchProduct {
  id: string;
  sku: string | null;
  name: string | null;
  barcode: string | null;
  matched_code: string | null;
  total_quantity: number | string | null;
}
export interface SearchSupplier {
  id: string;
  name: string | null;
  code: string | null;
  city: string | null;
  vat_number: string | null;
  is_active: boolean | null;
}
export interface SearchDeliveryNote {
  id: string;
  note_number: string | null;
  status: string | null;
  document_date: string | null;
  supplier_name: string | null;
}

export interface GlobalSearchPayload {
  query?: string;
  purchase_orders?: SearchPurchaseOrder[] | null;
  client_orders?: SearchClientOrder[] | null;
  products?: SearchProduct[] | null;
  suppliers?: SearchSupplier[] | null;
  delivery_notes?: SearchDeliveryNote[] | null;
}

// ── Forma usada pelo ecrã ───────────────────────────────────────────────────
export interface GlobalSearchItem {
  /** Único em toda a lista (grupo:id) — é o value do cmdk. */
  key: string;
  title: string;
  subtitle: string;
  /** path?query da página/ficha de destino. */
  href: string;
}
export interface GlobalSearchGroup {
  key: GlobalSearchGroupKey;
  label: string;
  items: GlobalSearchItem[];
}

/** O texto como vai para a BD: sem espaços nas pontas e cortado ao máximo. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().slice(0, GLOBAL_SEARCH_MAX_CHARS);
}

export function isSearchable(raw: string): boolean {
  return normalizeSearchQuery(raw).length >= GLOBAL_SEARCH_MIN_CHARS;
}

const PO_STATUS_LABELS: Record<string, string> = {
  pending: "Por aprovar",
  ordered: "Encomendada",
  partially_received: "Parcialmente recebida",
  received: "Recebida",
  cancelled: "Cancelada",
};
const NOTE_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  closed: "Fechada",
  cancelled: "Cancelada",
};
const EC_ORIGIN_LABELS: Record<string, string> = {
  contract: "Contrato",
  direct_sale: "Venda direta",
  manual: "Manual",
};

const join = (...parts: (string | null | undefined | false)[]): string =>
  parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" · ");

const fmtQty = (v: number | string | null): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString("pt-PT", { maximumFractionDigits: 3 })} un`;
};

const asArray = <T,>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null);

/**
 * Grupos a mostrar, pela ordem do 2.0. Um grupo a null (sem permissão) ou
 * vazio não aparece. `canSee` volta a confirmar a permissão da página de
 * destino (a BD já a verifica; isto só evita links para páginas negadas se as
 * duas regras se desalinharem).
 */
export function buildGlobalSearchGroups(
  payload: GlobalSearchPayload | null | undefined,
  canSee: (permission: string) => boolean = () => true,
): GlobalSearchGroup[] {
  if (!payload || typeof payload !== "object") return [];
  const groups: GlobalSearchGroup[] = [];

  for (const key of GLOBAL_SEARCH_GROUP_ORDER) {
    if (!canSee(GLOBAL_SEARCH_GROUP_PERMISSION[key])) continue;
    let items: GlobalSearchItem[] = [];

    switch (key) {
      case "purchase_orders":
        items = (asArray<SearchPurchaseOrder>(payload.purchase_orders) ?? [])
          .filter((r) => r?.id)
          .map((r) => ({
            key: `po:${r.id}`,
            title: r.order_number || "Encomenda sem número",
            subtitle: join(r.supplier_name, r.status ? PO_STATUS_LABELS[r.status] ?? r.status : null),
            href: purchaseOrdersLink({ open: r.id }),
          }));
        break;
      case "client_orders":
        items = (asArray<SearchClientOrder>(payload.client_orders) ?? [])
          .filter((r) => r?.contract_id)
          .map((r) => {
            const origin = r.origin_type ? EC_ORIGIN_LABELS[r.origin_type] ?? null : null;
            // Venda direta: mostrar o nº VD (não o contrato sintético); manual: só o distintivo.
            const originText = r.origin_type === "manual"
              ? origin
              : join(origin, r.origin_number && r.origin_number !== r.order_number ? r.origin_number : null);
            return {
              key: `ec:${r.contract_id}`,
              title: r.order_number || r.contract_number || "Encomenda de cliente",
              subtitle: join(r.client_name, originText),
              href: clientOrdersLink({ open: r.contract_id }),
            };
          });
        break;
      case "products":
        items = (asArray<SearchProduct>(payload.products) ?? [])
          .filter((r) => r?.id)
          .map((r) => ({
            key: `prod:${r.id}`,
            title: r.name || r.sku || "Produto",
            subtitle: join(
              r.sku,
              r.barcode ? `EAN ${r.barcode}` : null,
              r.matched_code ? `código ${r.matched_code}` : null,
              fmtQty(r.total_quantity),
            ),
            // Existências filtradas pelo SKU (a lista de /stocks pesquisa nome/SKU/EAN).
            href: stocksLink({ q: r.sku || r.name || null }),
          }));
        break;
      case "suppliers":
        items = (asArray<SearchSupplier>(payload.suppliers) ?? [])
          .filter((r) => r?.id)
          .map((r) => ({
            key: `sup:${r.id}`,
            title: r.name || "Fornecedor",
            subtitle: join(r.code, r.city, r.is_active === false ? "Inativo" : null),
            href: suppliersLink({ open: r.id }),
          }));
        break;
      case "delivery_notes":
        items = (asArray<SearchDeliveryNote>(payload.delivery_notes) ?? [])
          .filter((r) => r?.id)
          .map((r) => ({
            key: `guia:${r.id}`,
            title: r.note_number || "Guia",
            subtitle: join(r.supplier_name, r.status ? NOTE_STATUS_LABELS[r.status] ?? r.status : null),
            href: receivingLink({ guia: r.id, tab: "guias" }),
          }));
        break;
    }

    if (items.length) groups.push({ key, label: GLOBAL_SEARCH_GROUP_LABELS[key], items });
  }
  return groups;
}

/** A pesquisa só se mostra a quem pode abrir pelo menos uma das páginas de destino. */
export function canUseGlobalSearch(hasPermission: (permission: string) => boolean): boolean {
  return GLOBAL_SEARCH_GROUP_ORDER.some((k) => hasPermission(GLOBAL_SEARCH_GROUP_PERMISSION[k]));
}
