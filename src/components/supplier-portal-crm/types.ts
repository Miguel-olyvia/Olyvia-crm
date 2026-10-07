// Portal do Fornecedor F3.1 — tipos e utilitários do lado do CRM.
// Os argumentos das RPCs vêm dos tipos gerados; o retorno é `Json` nos tipos
// gerados, por isso a forma do JSON fica descrita aqui. Contrato: vault
// "fase3-portal/contrato-f31.md", secções 3 e 6.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
}

type PublicFns = Database["public"]["Functions"];

export type F31CrmRpc =
  | "rpc_supplier_portal_status"
  | "rpc_supplier_portal_revoke_access"
  | "rpc_supplier_catalog_list"
  | "rpc_catalog_link_suggestions"
  | "rpc_catalog_link"
  | "rpc_catalog_unlink"
  | "rpc_catalog_dismiss";

/** Chama uma RPC do CRM da F3.1 (args tipados) e dá forma ao JSON devolvido. */
export async function callRpc<T, K extends F31CrmRpc = F31CrmRpc>(
  fn: K,
  args: PublicFns[K]["Args"],
): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(fn, args as never);
  return { data: (data ?? null) as unknown as T | null, error: (error ?? null) as RpcError | null };
}

// ─── 3.1 rpc_supplier_portal_status ────────────────────────────────────────

export type PortalStatus = "not_invited" | "active" | "revoked";

export interface PortalUser {
  portal_user_id: string;
  email: string;
  name: string | null;
  access_status: "active" | "revoked";
  granted_at: string | null;
  revoked_at: string | null;
  password_set: boolean;
  last_login_at: string | null;
}

export interface SupplierPortalStatus {
  supplier_id: string;
  nif: string | null;
  nif_valid: boolean;
  nif_key: string | null;
  supplier_email: string | null;
  portal_status: PortalStatus;
  link_id: string | null;
  linked_at: string | null;
  revoked_at: string | null;
  users: PortalUser[];
  catalog_active_items: number | null;
  can_manage: boolean;
}

// ─── 3.3 rpc_supplier_catalog_list ─────────────────────────────────────────

export type CatalogFilter = "all" | "linked" | "unlinked" | "dismissed";

export interface CatalogItemLink {
  item_supplier_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  uom_id: string | null;
  supplier_sku: string | null;
  purchase_price: number | null;
  currency: string | null;
  is_preferred: boolean;
}

export interface CrmCatalogItem {
  id: string;
  supplier_ref: string;
  barcode: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  unit_label: string | null;
  units_per_pack: number | null;
  base_price: number | null;
  currency: string | null;
  moq: number | null;
  lead_time_days: number | null;
  is_active: boolean;
  updated_at: string;
  is_linked: boolean;
  is_dismissed: boolean;
  links: CatalogItemLink[];
}

export interface CrmCatalogList {
  linked_account: boolean;
  counts: Record<CatalogFilter, number>;
  total: number;
  limit: number;
  offset: number;
  can_link: boolean;
  can_view_pricing: boolean;
  items: CrmCatalogItem[];
}

// ─── 3.4 rpc_catalog_link_suggestions ──────────────────────────────────────

/**
 * "created" não vem da RPC: é o produto criado a partir do artigo cuja ligação
 * falhou (fica como sugestão para ligar manualmente).
 */
export type SuggestionReason = "supplier_sku" | "supplier_ref_code" | "barcode" | "name" | "created";

export interface LinkSuggestion {
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_barcode: string | null;
  reason: SuggestionReason;
  score: number;
  exact: boolean;
  item_supplier_id: string | null;
}

export interface LinkSuggestionsResult {
  items: { catalog_item_id: string; suggestions: LinkSuggestion[] }[];
}

export const REASON_LABEL: Record<SuggestionReason, string> = {
  supplier_sku: "Ref. igual (já associada)",
  supplier_ref_code: "Ref. igual",
  barcode: "Código de barras",
  name: "Nome semelhante",
  created: "Criado a partir deste artigo",
};

/** Nível de confiança apresentado ao operador. */
export function confidenceOf(s: Pick<LinkSuggestion, "score" | "exact"> & { reason?: SuggestionReason }): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  if (s.exact) return { label: "Exata", variant: "default" };
  // Sugestão local (produto criado aqui a partir do artigo).
  if (s.reason === "created") return { label: "Produto novo", variant: "secondary" };
  if (s.score >= 0.7) return { label: `Alta · ${Math.round(s.score * 100)}%`, variant: "secondary" };
  if (s.score >= 0.5) return { label: `Média · ${Math.round(s.score * 100)}%`, variant: "outline" };
  return { label: `Baixa · ${Math.round(s.score * 100)}%`, variant: "outline" };
}

// ─── 3.5 rpc_catalog_link ──────────────────────────────────────────────────

export interface CatalogLinkResult {
  item_supplier_id: string;
  created: boolean;
  already_linked: boolean;
  is_preferred?: boolean;
  codes: { id: string; kind: string; code: string }[];
  warnings: string[];
}

/** Linha item_suppliers (produto, fornecedor) ainda sem artigo do catálogo. */
export interface FreeSupplierRow {
  id: string;
  uom_id: string | null;
  uom_code: string | null;
  supplier_sku: string | null;
  purchase_price: number | null;
  currency: string | null;
}

/**
 * Linhas item_suppliers do produto para este fornecedor (RLS) que a ligação
 * pode reaproveitar. rpc_catalog_link procura por (produto, fornecedor,
 * unidade): sem a unidade certa cria uma segunda linha. As que já estão
 * ligadas a outro artigo do catálogo ficam de fora (a RPC recusa-as).
 */
export async function fetchFreeSupplierRows(
  productId: string,
  supplierId: string,
): Promise<{ rows: FreeSupplierRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("item_suppliers")
    .select("id, uom_id, supplier_sku, purchase_price, currency, catalog_item_id, uom:uom_id(code)")
    .eq("product_id", productId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .is("catalog_item_id", null)
    .order("created_at");
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []).map((r) => {
    const uom = r.uom as { code: string } | { code: string }[] | null;
    return {
      id: r.id,
      uom_id: r.uom_id,
      uom_code: (Array.isArray(uom) ? uom[0]?.code : uom?.code) ?? null,
      supplier_sku: r.supplier_sku,
      purchase_price: r.purchase_price,
      currency: r.currency,
    };
  });
  return { rows, error: null };
}

// ─── 6. Edge function create-supplier-portal-access ────────────────────────

export interface PortalAccessResponse {
  success: true;
  message: string;
  smtp_status: "sent" | "not_found" | "send_failed";
  smtp_warning?: boolean;
  smtp_error_safe?: string;
}

export interface PortalAccessError {
  error: string;
  message: string;
  retry_after_seconds?: number;
}

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  invalid_nif: "Preenche um NIF válido no fornecedor antes de enviar o acesso. Para fornecedores estrangeiros usa o prefixo do país (ex.: ESB12345678).",
  email_not_allowed:
    "Este email não pode ser usado no portal do fornecedor: já pertence a um utilizador interno ou a um cliente do portal. Indica outro email.",
};

/** Mensagem a mostrar para um erro da edge function (pelo código estável). */
export function describeAccessError(err: PortalAccessError): string {
  if (INVITE_ERROR_MESSAGES[err.error]) return INVITE_ERROR_MESSAGES[err.error];
  if (err.error === "rate_limited") {
    const minutes = err.retry_after_seconds ? Math.max(1, Math.ceil(err.retry_after_seconds / 60)) : null;
    return minutes
      ? `Limite de envios atingido. Tenta de novo dentro de ${minutes} minuto(s).`
      : err.message || "Limite de envios atingido. Tenta de novo mais tarde.";
  }
  return err.message || "Não foi possível enviar o acesso ao portal.";
}

/**
 * Invoca a edge function e devolve sempre { data } ou { error } já com o
 * corpo da resposta lido (supabase.functions.invoke esconde-o em
 * error.context num estado não-2xx).
 */
export async function invokePortalAccess(
  body: Record<string, unknown>,
): Promise<{ data: PortalAccessResponse | null; error: PortalAccessError | null }> {
  const { data, error } = await supabase.functions.invoke("create-supplier-portal-access", { body });
  if (!error) {
    if (data && typeof data === "object" && "error" in data) {
      return { data: null, error: data as PortalAccessError };
    }
    return { data: data as PortalAccessResponse, error: null };
  }
  let parsed: Partial<PortalAccessError> | null = null;
  const ctx = (error as { context?: unknown }).context as
    | { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }
    | undefined;
  const isHttpResponse = !!ctx && typeof ctx.status === "number";
  try {
    if (ctx && typeof ctx.json === "function") {
      parsed = (await ctx.json()) as Partial<PortalAccessError>;
    } else if (ctx && typeof ctx.text === "function") {
      parsed = JSON.parse(await ctx.text()) as Partial<PortalAccessError>;
    }
  } catch {
    parsed = null;
  }
  // Função sem deploy: o gateway responde 404 sem o nosso { error } (ou o
  // pedido nem chega a sair, por falha de CORS no preflight → FunctionsFetchError).
  const notDeployed = (isHttpResponse && ctx?.status === 404 && !parsed?.error) || !isHttpResponse;
  if (notDeployed) {
    return {
      data: null,
      error: {
        error: "function_unavailable",
        message: isHttpResponse
          ? "O envio de acessos ao Portal do Fornecedor ainda não está disponível (serviço não publicado). Tenta mais tarde ou contacta o suporte."
          : "Não foi possível contactar o serviço de envio de acessos ao Portal do Fornecedor. Verifica a ligação; se persistir, o serviço pode ainda não estar publicado.",
      },
    };
  }
  return {
    data: null,
    error: {
      error: parsed?.error || "unknown",
      message: parsed?.message || error.message || "Erro ao contactar o servidor.",
      retry_after_seconds: parsed?.retry_after_seconds,
    },
  };
}

export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "-";

export const formatMoney = (value: number | null | undefined, currency: string | null | undefined): string =>
  value == null
    ? "-"
    : `${Number(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency ?? ""}`.trim();
