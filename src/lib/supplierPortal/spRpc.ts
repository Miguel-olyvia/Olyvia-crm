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

// ─── Erros ──────────────────────────────────────────────────────────────────

export type SpErrorHint =
  | "no_supplier_access"
  | "not_owner"
  | "not_found"
  | "validation"
  | "too_many_rows"
  | "conflict";

export class SupplierPortalRpcError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly details: string | null;

  constructor(raw: { message?: string; code?: string; hint?: string; details?: string } | null | undefined) {
    super(raw?.message || "Erro desconhecido");
    this.name = "SupplierPortalRpcError";
    this.code = raw?.code ?? null;
    this.hint = raw?.hint ?? null;
    this.details = raw?.details ?? null;
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
function unwrap<T>({ data, error }: { data: Json | null; error: { message: string; code?: string; hint?: string; details?: string } | null }): T {
  if (error) throw new SupplierPortalRpcError(error);
  return data as unknown as T;
}

/** Nunca dá erro no servidor; em falha de rede devolve { is_supplier: false }. */
export async function spWhoami(): Promise<SpWhoami> {
  try {
    const data = unwrap<SpWhoami | null>(await supabase.rpc("sp_whoami"));
    return data && typeof data === "object" ? data : { is_supplier: false };
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
