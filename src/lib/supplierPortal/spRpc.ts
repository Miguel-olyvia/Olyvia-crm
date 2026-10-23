// Portal do Fornecedor (F3.1) — chamadas às RPCs sp_* e mapeamento de erros.
//
// Os ARGUMENTOS vêm dos tipos gerados (Database["public"]["Functions"]["sp_*"]
// em src/integrations/supabase/types.ts). Os RETORNOS são `Json` nos tipos
// gerados, por isso o conteúdo é descrito pelos tipos locais abaixo (contrato
// F3.1, secção 2) — manter alinhados com a migration
// 20261211110000_portal_fornecedor_f31_contas_catalogo.sql.
//
// O portal NUNCA lê tabelas diretamente: tudo passa por estas funções.

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

type SpFunctions = Database["public"]["Functions"];

// ─── Conteúdo dos retornos Json (tipos locais) ──────────────────────────────

export type SpRole = "owner" | "member";

export interface SpWhoamiUser {
  id: string;
  email: string;
  name: string | null;
  role: SpRole;
  password_changed_at: string | null;
}

export interface SpWhoamiAccount {
  id: string;
  display_name: string;
  nif_key: string;
}

export type SpWhoami =
  | { is_supplier: false }
  | {
      is_supplier: true;
      active: boolean;
      first_login: boolean;
      can_manage_catalog: boolean;
      /** Também é cliente do portal (conta client_supplier). */
      also_client?: boolean;
      /**
       * Dados da empresa confirmados pelo fornecedor (passo obrigatório depois
       * da password). `undefined` = BD ainda sem a migration → tratar como true.
       */
      profile_confirmed?: boolean;
      user: SpWhoamiUser;
      account: SpWhoamiAccount | null;
    };

export interface SpCompany {
  organization_id: string;
  name: string;
  logo_url: string | null;
  granted_at: string;
}

export interface SpCatalogItem {
  id: string;
  supplier_ref: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit_label: string | null;
  units_per_pack: number | null;
  base_price: number | null;
  currency: string;
  moq: number | null;
  lead_time_days: number | null;
  is_active: boolean;
  updated_at: string;
}

export interface SpCatalogListResult {
  total: number;
  limit: number;
  offset: number;
  can_edit: boolean;
  items: SpCatalogItem[];
}

/** Chaves aceites por sp_catalog_import / sp_catalog_upsert_item (contrato 2.5). */
export type SpCatalogField =
  | "supplier_ref"
  | "barcode"
  | "name"
  | "description"
  | "brand"
  | "unit_label"
  | "units_per_pack"
  | "base_price"
  | "currency"
  | "moq"
  | "lead_time_days"
  | "is_active";

/** Chave ausente = mantém o valor gravado; presente com "" = limpa. */
export type SpCatalogRowInput = Partial<Record<SpCatalogField, string | number | boolean>> & {
  _row?: number;
};

export type SpImportRowStatus = "new" | "changed" | "error";

export interface SpImportRowResult {
  row: number | null;
  status: SpImportRowStatus;
  supplier_ref: string | null;
  name: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  errors: string[] | null;
}

export interface SpCatalogImportResult {
  dry_run: boolean;
  import_id: string | null;
  total: number;
  new: number;
  changed: number;
  unchanged: number;
  errors: number;
  rows: SpImportRowResult[];
}

export interface SpUpsertResult {
  created: boolean;
  item: SpCatalogItem;
}

// ─── Encomendas (F3.2, contrato-f32 secção 2) ───────────────────────────────
// Conteúdo dos retornos Json de sp_list_orders / sp_get_order /
// sp_mark_order_viewed / sp_confirm_order.

export type SpOrderStatus = "pending" | "ordered" | "partially_received" | "received" | "cancelled";
export type SpPublicationStatus = "sent" | "viewed" | "confirmed";
export type SpOrderFilter = "all" | "to_confirm" | "confirmed" | "open" | "received" | "cancelled";

export interface SpOrderListItem {
  purchase_order_id: string;
  order_number: string;
  organization: { id: string; name: string; logo_url: string | null };
  order_date: string;
  expected_delivery: string | null;
  order_status: SpOrderStatus;
  publication_status: SpPublicationStatus;
  revision: number;
  sent_at: string;
  viewed_at: string | null;
  confirmed_at: string | null;
  promised_date: string | null;
  lines: number;
  subtotal: number;
  vat_total: number;
  total: number;
  currency: string;
  can_confirm: boolean;
}

export type SpOrderCounts = Record<SpOrderFilter, number>;

export interface SpOrderListResult {
  total: number;
  limit: number;
  offset: number;
  counts: SpOrderCounts;
  items: SpOrderListItem[];
}

export interface SpOrderLine {
  id: string;
  item_type: "product" | "service";
  description: string | null;
  sku: string | null;
  supplier_sku: string | null;
  uom_code: string | null;
  base_uom_code: string | null;
  units_per_uom: number | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  subtotal: number;
  total: number;
  received_quantity: number;
  selected_attributes: Record<string, { label?: string; value?: string; unit?: string } | null>;
}

export interface SpOrderDetail {
  purchase_order_id: string;
  order_number: string;
  order_date: string;
  expected_delivery: string | null;
  order_status: SpOrderStatus;
  supplier_notes: string | null;
  currency: string;
  publication: {
    status: SpPublicationStatus;
    revision: number;
    sent_at: string;
    viewed_at: string | null;
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    promised_date: string | null;
    supplier_comment: string | null;
    promised_date_accepted: boolean;
  };
  can_confirm: boolean;
  company: {
    organization_id: string;
    name: string;
    nif: string | null;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
  };
  supplier: { name: string | null; tax_id: string | null; email: string | null; phone: string | null };
  sent_by: { name: string | null; email: string | null; phone: string | null } | null;
  lines: SpOrderLine[];
  totals: { subtotal: number; vat_total: number; total: number };
}

export interface SpMarkViewedResult {
  purchase_order_id: string;
  viewed_at: string;
  first_view: boolean;
}

export interface SpConfirmOrderResult {
  purchase_order_id: string;
  revision: number;
  publication_status: "confirmed";
  confirmed_at: string;
  promised_date: string | null;
  supplier_comment: string | null;
  already_confirmed: boolean;
}

// ─── Dados do fornecedor (os meus dados) ───────────────────────────────────
// sp_get_my_supplier_data / sp_update_my_supplier_data ainda não estão nos
// tipos gerados: argumentos e retornos descritos aqui.

/** Campos da ficha do fornecedor que o próprio vê/edita (tax_id só leitura). */
export interface SpSupplierData {
  name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  phone_country_code: string | null;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
}

/** O que se envia em sp_update_my_supplier_data (sem NIF). */
export type SpSupplierDataInput = Omit<SpSupplierData, "tax_id">;

export interface SpMySupplierData {
  can_edit: boolean;
  confirmed_at: string | null;
  data: SpSupplierData;
  companies: { organization_id: string; name: string }[];
}

export interface SpUpdateMySupplierDataResult {
  ok: true;
  updated_count: number;
  confirmed_at: string;
}

// ─── Erros ──────────────────────────────────────────────────────────────────

export type SpErrorHint =
  | "no_supplier_access"
  | "not_owner"
  | "not_found"
  | "validation"
  | "too_many_rows"
  | "conflict"
  | "stale_revision"
  | "order_closed";

export class SupplierPortalRpcError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly details: string | null;
  /** Mensagens próprias da chamada, por hint (sobrepõem-se às genéricas de spErrorMessage). */
  readonly hintMessages: Partial<Record<SpErrorHint, string>>;

  constructor(
    raw: { message?: string; code?: string; hint?: string; details?: string } | null | undefined,
    hintMessages: Partial<Record<SpErrorHint, string>> = {},
  ) {
    super(raw?.message || "Erro desconhecido");
    this.name = "SupplierPortalRpcError";
    this.code = raw?.code ?? null;
    this.hint = raw?.hint ?? null;
    this.details = raw?.details ?? null;
    this.hintMessages = hintMessages;
  }
}

export function getSpHint(err: unknown): string | null {
  return err instanceof SupplierPortalRpcError ? err.hint : null;
}

export function isNoSupplierAccess(err: unknown): boolean {
  return getSpHint(err) === "no_supplier_access";
}

/**
 * Mensagem para o utilizador. O ecrã decide pelo `hint` (estável); a
 * `message` do servidor vem em português e serve para validação/conflitos.
 */
export function spErrorMessage(err: unknown): string {
  const hint = getSpHint(err);
  const raw = err instanceof Error ? err.message : "";
  const code = err instanceof SupplierPortalRpcError ? err.code : null;

  const own = err instanceof SupplierPortalRpcError && hint ? err.hintMessages[hint as SpErrorHint] : undefined;
  if (own) return own;

  switch (hint) {
    case "no_supplier_access":
      return "Sem acesso ativo ao portal do fornecedor. Contacte a empresa que o convidou.";
    case "not_owner":
      return "Só o utilizador principal da conta pode alterar o catálogo.";
    case "not_found":
      return raw || "O artigo não existe ou já não está disponível.";
    case "too_many_rows":
      return raw || "Demasiadas linhas: o máximo é 5000 por importação.";
    case "conflict":
      return raw || "Já existe um artigo com esta referência.";
    case "validation":
      return raw || "Dados inválidos.";
    case "stale_revision":
      return "A empresa atualizou esta encomenda entretanto. Reveja os dados atualizados e confirme de novo.";
    case "order_closed":
      return raw || "Esta encomenda já foi recebida ou cancelada: já não pode ser confirmada.";
    default:
      break;
  }

  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("load failed")) {
    return "Sem ligação ao servidor. Verifique a ligação à internet e tente novamente.";
  }
  if (code === "57014" || lower.includes("statement timeout")) {
    return "A operação demorou demasiado tempo. Tente novamente ou use um ficheiro mais pequeno.";
  }
  if (code === "42501") {
    return "Sem permissão para esta operação.";
  }
  return raw || "Ocorreu um erro inesperado. Tente novamente.";
}

// ─── Chamadas ───────────────────────────────────────────────────────────────

/** Converte o resultado de supabase.rpc: erro → SupplierPortalRpcError; Json → tipo local. */
function unwrap<T>(
  { data, error }: { data: Json | null; error: { message: string; code?: string; hint?: string; details?: string } | null },
  hintMessages?: Partial<Record<SpErrorHint, string>>,
): T {
  if (error) throw new SupplierPortalRpcError(error, hintMessages);
  return data as unknown as T;
}

/**
 * Variante que LANÇA em falha (rede, JWT, servidor): para quem tem de
 * distinguir "sem acesso" (resposta com sucesso) de "não foi possível saber".
 */
export async function spWhoamiStrict(): Promise<SpWhoami> {
  const data = unwrap<SpWhoami | null>(await supabase.rpc("sp_whoami"));
  return data && typeof data === "object" ? data : { is_supplier: false };
}

/**
 * Tolerante (guards): em qualquer falha devolve { is_supplier: false }.
 * Não usar para decidir "sem acesso ativo" — ver spWhoamiStrict.
 */
export async function spWhoami(): Promise<SpWhoami> {
  try {
    return await spWhoamiStrict();
  } catch {
    return { is_supplier: false };
  }
}

export async function spMyCompanies(): Promise<SpCompany[]> {
  const data = unwrap<SpCompany[] | null>(await supabase.rpc("sp_my_companies"));
  return Array.isArray(data) ? data : [];
}

export async function spMarkPasswordChanged(): Promise<{ ok: boolean }> {
  return unwrap<{ ok: boolean }>(await supabase.rpc("sp_mark_password_changed"));
}

export async function spCatalogList(params: {
  search?: string | null;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}): Promise<SpCatalogListResult> {
  const search = params.search?.trim();
  const args: SpFunctions["sp_catalog_list"]["Args"] = {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_include_inactive: params.includeInactive ?? false,
    ...(search ? { p_search: search } : {}),
  };
  return unwrap<SpCatalogListResult>(await supabase.rpc("sp_catalog_list", args));
}

export async function spCatalogImport(
  rows: SpCatalogRowInput[],
  dryRun: boolean,
  fileName: string | null,
): Promise<SpCatalogImportResult> {
  const args: SpFunctions["sp_catalog_import"]["Args"] = {
    p_rows: rows as unknown as Json,
    p_dry_run: dryRun,
    ...(fileName ? { p_file_name: fileName.slice(0, 255) } : {}),
  };
  return unwrap<SpCatalogImportResult>(await supabase.rpc("sp_catalog_import", args));
}

export async function spCatalogUpsertItem(item: SpCatalogRowInput & { id?: string }): Promise<SpUpsertResult> {
  const args: SpFunctions["sp_catalog_upsert_item"]["Args"] = { p_item: item as unknown as Json };
  return unwrap<SpUpsertResult>(await supabase.rpc("sp_catalog_upsert_item", args));
}

export async function spCatalogSetActive(itemIds: string[], active: boolean): Promise<{ updated: number }> {
  const args: SpFunctions["sp_catalog_set_active"]["Args"] = { p_item_ids: itemIds, p_active: active };
  return unwrap<{ updated: number }>(await supabase.rpc("sp_catalog_set_active", args));
}

// ─── Encomendas (F3.2) ──────────────────────────────────────────────────────
// Argumentos: tipos gerados. Retornos (Json): tipos locais acima (contrato
// F3.2, secção 2; migration 20261211130000_portal_fornecedor_f32_encomendas.sql).

/** Erro "não encontrada" (inexistente, retirada, de outra empresa ou sem acesso). */
export function isSpNotFound(err: unknown): boolean {
  return getSpHint(err) === "not_found";
}

export async function spListOrders(params: {
  orgId?: string | null;
  status?: SpOrderFilter | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}): Promise<SpOrderListResult> {
  const search = params.search?.trim();
  const args: SpFunctions["sp_list_orders"]["Args"] = {
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    ...(params.orgId ? { p_org_id: params.orgId } : {}),
    ...(params.status && params.status !== "all" ? { p_status: params.status } : {}),
    ...(search ? { p_search: search } : {}),
  };
  const data = unwrap<SpOrderListResult | null>(await supabase.rpc("sp_list_orders", args));
  return {
    total: data?.total ?? 0,
    limit: data?.limit ?? (params.limit ?? 50),
    offset: data?.offset ?? (params.offset ?? 0),
    counts: {
      all: data?.counts?.all ?? 0,
      to_confirm: data?.counts?.to_confirm ?? 0,
      confirmed: data?.counts?.confirmed ?? 0,
      open: data?.counts?.open ?? 0,
      received: data?.counts?.received ?? 0,
      cancelled: data?.counts?.cancelled ?? 0,
    },
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export async function spGetOrder(poId: string): Promise<SpOrderDetail> {
  const args: SpFunctions["sp_get_order"]["Args"] = { p_po_id: poId };
  return unwrap<SpOrderDetail>(await supabase.rpc("sp_get_order", args));
}

/** Marca como vista (só muda da 1.ª vez). O erro pode ser ignorado (contrato 2.3). */
export async function spMarkOrderViewed(poId: string): Promise<SpMarkViewedResult> {
  const args: SpFunctions["sp_mark_order_viewed"]["Args"] = { p_po_id: poId };
  return unwrap<SpMarkViewedResult>(await supabase.rpc("sp_mark_order_viewed", args));
}

export async function spConfirmOrder(params: {
  poId: string;
  revision: number;
  promisedDate?: string | null;
  comment?: string | null;
}): Promise<SpConfirmOrderResult> {
  const comment = params.comment?.trim();
  const args: SpFunctions["sp_confirm_order"]["Args"] = {
    p_po_id: params.poId,
    p_revision: params.revision,
    ...(params.promisedDate ? { p_promised_date: params.promisedDate } : {}),
    ...(comment ? { p_comment: comment } : {}),
  };
  return unwrap<SpConfirmOrderResult>(await supabase.rpc("sp_confirm_order", args));
}

// ─── Dados do fornecedor ────────────────────────────────────────────────────

type RpcResponse = {
  data: Json | null;
  error: { message: string; code?: string; hint?: string; details?: string } | null;
};

/** RPCs ainda fora dos tipos gerados (não regenerar types.ts só por isto). */
function untypedRpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse> {
  const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResponse>;
  return rpc.call(supabase, fn, args);
}

/** A função ainda não existe na BD (migration por aplicar). */
export function isSpFunctionMissing(err: unknown): boolean {
  if (!(err instanceof SupplierPortalRpcError)) return false;
  return err.code === "PGRST202" || err.code === "42883";
}

/** not_owner nestas RPCs não é sobre o catálogo: mensagem própria. */
const SUPPLIER_DATA_HINT_MESSAGES: Partial<Record<SpErrorHint, string>> = {
  not_owner: "Só o responsável principal da conta pode fazer esta alteração.",
};

export async function spGetMySupplierData(): Promise<SpMySupplierData> {
  const raw = unwrap<Partial<SpMySupplierData> | null>(
    await untypedRpc("sp_get_my_supplier_data"),
    SUPPLIER_DATA_HINT_MESSAGES,
  );
  const d = (raw?.data ?? {}) as Partial<SpSupplierData>;
  return {
    can_edit: !!raw?.can_edit,
    confirmed_at: raw?.confirmed_at ?? null,
    data: {
      name: d.name ?? null,
      contact_person: d.contact_person ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      phone_country_code: d.phone_country_code ?? null,
      tax_id: d.tax_id ?? null,
      address: d.address ?? null,
      city: d.city ?? null,
      postal_code: d.postal_code ?? null,
      country: d.country ?? null,
      website: d.website ?? null,
    },
    companies: Array.isArray(raw?.companies) ? raw.companies : [],
  };
}

/**
 * Envia só as chaves alteradas: o servidor grava cada chave presente em todas
 * as fichas do fornecedor. {} = sem alterações, só marca a confirmação.
 */
export async function spUpdateMySupplierData(data: Partial<SpSupplierDataInput>): Promise<SpUpdateMySupplierDataResult> {
  return unwrap<SpUpdateMySupplierDataResult>(
    await untypedRpc("sp_update_my_supplier_data", { p_data: data }),
    SUPPLIER_DATA_HINT_MESSAGES,
  );
}
