// Contrato único dos parâmetros de URL do Inventário: builders tipados (para
// <Link>/navigate/DocumentLink) e parsers (para as páginas lerem o URL).
//
//   /purchase-orders?status=&supplier=&open=      purchaseOrdersLink / parsePurchaseOrdersParams
//   /suppliers?filter=&open=&tab=(&prices=pending) suppliersLink / parseSuppliersParams
//   /client-orders?status=&ready=1&origin=&open=   clientOrdersLink / parseClientOrdersParams (+ parseClientOrdersOrigin)
//   /stock-counts?status=&stalled=1&open=          stockCountsLink / parseStockCountsParams
//   /receiving?guia=&notes=&tab=&po=&vista=&ec=    receivingLink / parseReceivingParams
//   /stocks?status=&warehouse=&q=                  stocksLink / parseStocksParams
//   /stock-movements?product=&warehouse=&doc=      stockMovementsLink / parseStockMovementsParams
//
// Regras: valores por omissão ("all", false, vazio) não vão para o URL; valores
// desconhecidos no URL caem no valor por omissão; ids são uuid tal como estão na BD.
// Os valores de estado são os reais de cada tabela/RPC (ver comentário de cada tipo).

export const INVENTORY_PATHS = {
  today: "/inventory",
  purchaseOrders: "/purchase-orders",
  suppliers: "/suppliers",
  clientOrders: "/client-orders",
  stockCounts: "/stock-counts",
  receiving: "/receiving",
  stocks: "/stocks",
  stockMovements: "/stock-movements",
  warehouses: "/warehouses",
} as const;

type ParamsInput = URLSearchParams | string;

const toParams = (input: ParamsInput): URLSearchParams =>
  typeof input === "string" ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input) : input;

function oneOf<T extends string>(list: readonly T[], value: string | null, fallback: T): T {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

const str = (sp: URLSearchParams, key: string): string | null => {
  const v = sp.get(key);
  return v && v.trim() ? v.trim() : null;
};

const flag = (sp: URLSearchParams, key: string): boolean => sp.get(key) === "1" || sp.get(key) === "true";

/** Monta path?query só com os valores definidos e diferentes do valor por omissão. */
function build(path: string, entries: Record<string, string | boolean | null | undefined>, defaults: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v === undefined || v === null || v === false || v === "") continue;
    if (v === true) sp.set(k, "1");
    else if (defaults[k] !== v) sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

// ── Encomendas a fornecedor ────────────────────────────────────────────────
/**
 * purchase_orders.status: pending | ordered | partially_received | received | cancelled.
 * Derivados (filtro do mockup): late (entrega prevista ultrapassada, em aberto) e
 * portal (publicada no portal do fornecedor). "all" = sem filtro.
 */
export const PO_STATUS_FILTERS = [
  "all",
  "pending",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
  "late",
  "portal",
] as const;
export type PoStatusFilter = (typeof PO_STATUS_FILTERS)[number];

export interface PurchaseOrdersLinkParams {
  status?: PoStatusFilter;
  /** suppliers.id */
  supplier?: string | null;
  /** purchase_orders.id — abre o detalhe. */
  open?: string | null;
}

export const purchaseOrdersLink = (p: PurchaseOrdersLinkParams = {}): string =>
  build(INVENTORY_PATHS.purchaseOrders, { status: p.status, supplier: p.supplier, open: p.open }, { status: "all" });

export function parsePurchaseOrdersParams(input: ParamsInput) {
  const sp = toParams(input);
  return {
    status: oneOf(PO_STATUS_FILTERS, sp.get("status"), "all"),
    supplier: str(sp, "supplier"),
    open: str(sp, "open"),
  };
}

// ── Fornecedores ───────────────────────────────────────────────────────────
/**
 * active/inactive = suppliers.is_active. prices = alterações de preço por aprovar;
 * awaiting = convidados à espera de preencher a ficha; catalog = artigos do portal
 * por ligar (contadores de rpc_inventory_today.suppliers).
 */
export const SUPPLIER_FILTERS = ["all", "active", "inactive", "prices", "awaiting", "catalog"] as const;
export type SupplierFilter = (typeof SUPPLIER_FILTERS)[number];
/** Separador da ficha (Suppliers.tsx): dados | portal; "catalogo" abre o portal. */
export const SUPPLIER_TABS = ["dados", "portal", "catalogo"] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number];

export interface SuppliersLinkParams {
  filter?: SupplierFilter;
  /** suppliers.id — abre a ficha. */
  open?: string | null;
  tab?: SupplierTab;
  /** Legado já lido por Suppliers.tsx: foca "Preços por aprovar" na ficha. */
  prices?: "pending";
}

export const suppliersLink = (p: SuppliersLinkParams = {}): string =>
  build(INVENTORY_PATHS.suppliers, { filter: p.filter, open: p.open, tab: p.tab, prices: p.prices }, { filter: "all" });

export function parseSuppliersParams(input: ParamsInput) {
  const sp = toParams(input);
  const tab = sp.get("tab");
  return {
    filter: oneOf(SUPPLIER_FILTERS, sp.get("filter"), "all"),
    open: str(sp, "open"),
    tab: tab !== null && (SUPPLIER_TABS as readonly string[]).includes(tab) ? (tab as SupplierTab) : null,
    prices: sp.get("prices") === "pending" ? ("pending" as const) : null,
  };
}

// ── Encomendas Clientes (saídas para clientes) ─────────────────────────────
/**
 * Estado calculado pela RPC da lista (p_status_filter em ClientOrders.tsx):
 * totalmente_servido | parcialmente_pendente | a_aguardar_encomenda | sem_fornecedor.
 * ready=1 = com linhas prontas a expedir (independente do estado).
 */
export const CLIENT_ORDER_STATUS_FILTERS = [
  "all",
  "totalmente_servido",
  "parcialmente_pendente",
  "a_aguardar_encomenda",
  "sem_fornecedor",
] as const;
export type ClientOrderStatusFilter = (typeof CLIENT_ORDER_STATUS_FILTERS)[number];

/**
 * Origem da encomenda (rpc_list_client_order_documents.origin_type):
 * contract | direct_sale | manual. "all" = todas. Escolhida no Hoje
 * ("Vendas assinadas"); a lista mostra-a num chip "Origem: …" que a limpa.
 */
export const CLIENT_ORDER_ORIGIN_FILTERS = ["all", "contract", "direct_sale", "manual"] as const;
export type ClientOrderOriginFilter = (typeof CLIENT_ORDER_ORIGIN_FILTERS)[number];

export interface ClientOrdersLinkParams {
  status?: ClientOrderStatusFilter;
  ready?: boolean;
  origin?: ClientOrderOriginFilter;
  /** contract_id da encomenda (é o que ClientOrders.tsx abre com ?open=). */
  open?: string | null;
}

export const clientOrdersLink = (p: ClientOrdersLinkParams = {}): string =>
  build(
    INVENTORY_PATHS.clientOrders,
    { status: p.status, ready: p.ready, origin: p.origin, open: p.open },
    { status: "all", origin: "all" },
  );

/** ?origin= da lista de Encomendas Clientes (desconhecido → "all"). */
export function parseClientOrdersOrigin(input: ParamsInput): ClientOrderOriginFilter {
  return oneOf(CLIENT_ORDER_ORIGIN_FILTERS, toParams(input).get("origin"), "all");
}

export function parseClientOrdersParams(input: ParamsInput) {
  const sp = toParams(input);
  return {
    status: oneOf(CLIENT_ORDER_STATUS_FILTERS, sp.get("status"), "all"),
    ready: flag(sp, "ready"),
    open: str(sp, "open"),
  };
}

// ── Contagens ──────────────────────────────────────────────────────────────
/** inventory_counts.status: em_contagem | finalizada | cancelada. stalled=1 = em contagem sem atividade há ≥ 7 dias. */
export const STOCK_COUNT_STATUS_FILTERS = ["all", "em_contagem", "finalizada", "cancelada"] as const;
export type StockCountStatusFilter = (typeof STOCK_COUNT_STATUS_FILTERS)[number];

export interface StockCountsLinkParams {
  status?: StockCountStatusFilter;
  stalled?: boolean;
  /** id da contagem — abre o detalhe. */
  open?: string | null;
}

export const stockCountsLink = (p: StockCountsLinkParams = {}): string =>
  build(INVENTORY_PATHS.stockCounts, { status: p.status, stalled: p.stalled, open: p.open }, { status: "all" });

export function parseStockCountsParams(input: ParamsInput) {
  const sp = toParams(input);
  return {
    status: oneOf(STOCK_COUNT_STATUS_FILTERS, sp.get("status"), "all"),
    stalled: flag(sp, "stalled"),
    open: str(sp, "open"),
  };
}

// ── Receção ────────────────────────────────────────────────────────────────
/** supplier_delivery_notes.status: open | closed | cancelled. divergent = abertas com divergências. */
export const RECEIVING_NOTES_FILTERS = ["all", "open", "closed", "cancelled", "divergent"] as const;
export type ReceivingNotesFilter = (typeof RECEIVING_NOTES_FILTERS)[number];

/** Separador da vista lista da Receção: Por receber | Recebidas | Guias. */
export const RECEIVING_TABS = ["receber", "recebidas", "guias"] as const;
export type ReceivingTab = (typeof RECEIVING_TABS)[number];
/** lista = encomendas por receber (por omissão); leitor = "Ler artigo a artigo" (cesto por código). */
export const RECEIVING_VIEWS = ["lista", "leitor"] as const;
export type ReceivingView = (typeof RECEIVING_VIEWS)[number];

export interface ReceivingLinkParams {
  /** supplier_delivery_notes.id — abre/fixa essa guia. */
  guia?: string | null;
  notes?: ReceivingNotesFilter;
  tab?: ReceivingTab;
  /** purchase_orders.id — abre o painel "Dar entrada" dessa encomenda. */
  po?: string | null;
  vista?: ReceivingView;
  /** client_contracts.id — a lista "Por receber" já filtrada pelas encomendas a fornecedor dessa encomenda de cliente (o negócio). */
  ec?: string | null;
}

export const receivingLink = (p: ReceivingLinkParams = {}): string =>
  build(
    INVENTORY_PATHS.receiving,
    { guia: p.guia, notes: p.notes, tab: p.tab, po: p.po, vista: p.vista, ec: p.ec },
    { notes: "all", tab: "receber", vista: "lista" },
  );

export function parseReceivingParams(input: ParamsInput) {
  const sp = toParams(input);
  const notes = oneOf(RECEIVING_NOTES_FILTERS, sp.get("notes"), "all");
  const rawTab = sp.get("tab");
  const rawVista = sp.get("vista");
  return {
    guia: str(sp, "guia"),
    notes,
    // Links antigos só com ?notes= (Hoje do Inventário) querem a lista das guias.
    tab: rawTab === null && sp.get("notes") !== null ? ("guias" as ReceivingTab) : oneOf(RECEIVING_TABS, rawTab, "receber"),
    po: str(sp, "po"),
    ec: str(sp, "ec"),
    vista: oneOf(RECEIVING_VIEWS, rawVista, "lista"),
    /** A vista pedida no URL (null = a do ecrã por omissão, que depende das permissões). */
    vistaParam: rawVista !== null && (RECEIVING_VIEWS as readonly string[]).includes(rawVista) ? (rawVista as ReceivingView) : null,
  };
}

// ── Existências ────────────────────────────────────────────────────────────
/** Estado calculado em Stocks.tsx: low (abaixo do ponto de encomenda) | normal | overstock (acima do máximo). */
export const STOCK_STATUS_FILTERS = ["all", "low", "normal", "overstock"] as const;
export type StockStatusFilter = (typeof STOCK_STATUS_FILTERS)[number];

export interface StocksLinkParams {
  status?: StockStatusFilter;
  /** warehouses.id */
  warehouse?: string | null;
  /** Texto da pesquisa da lista (nome, SKU ou EAN) — usado pela pesquisa global. */
  q?: string | null;
}

export const stocksLink = (p: StocksLinkParams = {}): string =>
  build(
    INVENTORY_PATHS.stocks,
    { status: p.status, warehouse: p.warehouse, q: p.q?.trim() || null },
    { status: "all", warehouse: "all" },
  );

export function parseStocksParams(input: ParamsInput) {
  const sp = toParams(input);
  const warehouse = str(sp, "warehouse");
  return {
    status: oneOf(STOCK_STATUS_FILTERS, sp.get("status"), "all"),
    warehouse: warehouse === "all" ? null : warehouse,
    q: str(sp, "q"),
  };
}

// ── Movimentos ─────────────────────────────────────────────────────────────
export interface StockMovementsLinkParams {
  /** products.id */
  product?: string | null;
  /** warehouses.id */
  warehouse?: string | null;
  /** Nº do documento (texto: PO, EC, contagem, transferência…), filtro "contém". */
  doc?: string | null;
}

export const stockMovementsLink = (p: StockMovementsLinkParams = {}): string =>
  build(
    INVENTORY_PATHS.stockMovements,
    { product: p.product, warehouse: p.warehouse, doc: p.doc },
    { warehouse: "all" },
  );

export function parseStockMovementsParams(input: ParamsInput) {
  const sp = toParams(input);
  const warehouse = str(sp, "warehouse");
  return {
    product: str(sp, "product"),
    warehouse: warehouse === "all" ? null : warehouse,
    doc: str(sp, "doc"),
  };
}
