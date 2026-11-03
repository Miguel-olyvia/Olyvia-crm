// Fotos dos artigos do catálogo do fornecedor (até 4; a 1.ª é a principal).
//
// BD (migration 20270104300000_catalogo_fornecedor_fotos.sql):
//   supplier_catalog_items.image_paths text[] — caminhos no bucket PÚBLICO
//   supplier-catalog-images: {supplier_account_id}/{catalog_item_id}/{uuid}.{jpg|png|webp}.
//   O JSON do artigo (sp_catalog_list / sp_catalog_upsert_item / rpc_supplier_catalog_list …)
//   traz `image_paths: string[]` (sempre lista; vazia sem fotos). O URL público monta-se aqui.
//
// Escrita só pela Edge supplier-catalog-image (POST com o JWT do titular da conta do portal;
// supabase.functions.invoke junta-o):
//   upload  multipart: action=upload, catalog_item_id, file  (JPEG/PNG/WEBP pelos magic bytes, ≤ 5 MB)
//           200 → { success, path, public_url, mime_type, size_bytes, already_registered, item }
//   remove  JSON { action: "remove", catalog_item_id, path }      → { success, removed, storage_deleted, item }
//   reorder JSON { action: "reorder", catalog_item_id, paths[] }  → { success, item }   (permutação das atuais)
// Erros: { error, message } — 401 unauthorized · 403 human_required | not_owner | no_supplier_access ·
//   404 not_found · 400 validation | empty_file · 409 limit · 413 file_too_large ·
//   415 file_type_not_allowed · 429 · 500 upload_failed | rpc_error | internal_error.
//
// Usado no portal (spRpc.ts reexporta) e no CRM (só leitura: catalogImageUrl/catalogImageUrls).

import { supabase } from "@/integrations/supabase/client";

export const CATALOG_IMAGES_BUCKET = "supplier-catalog-images";
export const CATALOG_IMAGES_FUNCTION = "supplier-catalog-image";
/** Máximo de fotos por artigo (BD: CHECK + sp_catalog_image_register). */
export const CATALOG_IMAGE_MAX_COUNT = 4;
/** Limite do bucket e da Edge (413 file_too_large). */
export const CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Tipos aceites (a Edge decide pelos bytes; HEIC recusado). Para o `accept` do input. */
export const CATALOG_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** URL público de uma foto (caminho de image_paths). Vazio/inválido → null. */
export function catalogImageUrl(path: string | null | undefined): string | null {
  const p = typeof path === "string" ? path.trim() : "";
  if (!p) return null;
  return supabase.storage.from(CATALOG_IMAGES_BUCKET).getPublicUrl(p).data.publicUrl || null;
}

/** URLs públicos pela ordem de apresentação (a 1.ª é a principal). Aceita o artigo ou a lista. */
export function catalogImageUrls(
  src: { image_paths?: string[] | null } | string[] | null | undefined,
): string[] {
  const paths = Array.isArray(src) ? src : src?.image_paths;
  if (!Array.isArray(paths)) return [];
  return paths.map(catalogImageUrl).filter((u): u is string => !!u);
}

/** URL da foto principal (1.ª) ou null. */
export function catalogMainImageUrl(item: { image_paths?: string[] | null } | null | undefined): string | null {
  return catalogImageUrls(item)[0] ?? null;
}

export type CatalogImageErrorCode =
  | "unauthorized"
  | "human_required"
  | "not_owner"
  | "no_supplier_access"
  | "not_found"
  | "validation"
  | "empty_file"
  | "limit"
  | "file_too_large"
  | "file_type_not_allowed"
  | "rate_limited"
  | "upload_failed"
  | "rpc_error"
  | "internal_error"
  | "not_deployed"
  | "unknown";

/** Texto PT-PT por código, quando a Edge não manda mensagem. */
const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Sessão inválida ou expirada. Volte a entrar.",
  human_required: "Esta ação tem de ser feita por uma pessoa.",
  not_owner: "Só o utilizador principal da conta pode alterar o catálogo.",
  no_supplier_access: "Sem acesso ativo ao portal do fornecedor. Contacte a empresa que o convidou.",
  not_found: "O artigo não existe ou já não está disponível.",
  validation: "Pedido inválido.",
  empty_file: "O ficheiro está vazio.",
  limit: `Cada artigo pode ter no máximo ${CATALOG_IMAGE_MAX_COUNT} fotos.`,
  file_too_large: "A foto tem de ter até 5 MB.",
  file_type_not_allowed: "Só se aceitam fotos em JPEG, PNG ou WEBP (HEIC não: exporte como JPEG).",
  rate_limited: "Demasiados pedidos. Aguarde um pouco e tente novamente.",
  upload_failed: "Não foi possível guardar a foto. Tente novamente.",
  rpc_error: "Erro interno. Tente novamente.",
  internal_error: "Erro interno. Tente novamente.",
  not_deployed: "As fotos do catálogo ainda não estão disponíveis (função supplier-catalog-image por publicar).",
};

export class CatalogImageError extends Error {
  readonly code: CatalogImageErrorCode | string;
  readonly status: number | null;
  constructor(code: string, message: string, status: number | null) {
    super(message);
    this.name = "CatalogImageError";
    this.code = code;
    this.status = status;
  }
}

export function describeCatalogImageError(err: unknown): string {
  if (err instanceof CatalogImageError) return err.message || ERROR_TEXT[err.code] || "Não foi possível concluir a ação.";
  return err instanceof Error && err.message ? err.message : "Não foi possível concluir a ação.";
}

/** Validação no cliente antes de enviar (a Edge volta a validar pelos bytes). null = válido. */
export function validateCatalogImageFile(file: File, currentCount = 0): string | null {
  if (currentCount >= CATALOG_IMAGE_MAX_COUNT) return ERROR_TEXT.limit;
  if (!(CATALOG_IMAGE_MIME as readonly string[]).includes(file.type)) return ERROR_TEXT.file_type_not_allowed;
  if (file.size <= 0) return ERROR_TEXT.empty_file;
  if (file.size > CATALOG_IMAGE_MAX_BYTES) return ERROR_TEXT.file_too_large;
  return null;
}

/** Chama a Edge; erro → CatalogImageError (code = `error` da Edge, message em PT). */
async function invoke<T>(body: Record<string, unknown> | FormData): Promise<T> {
  const { data, error } = await supabase.functions.invoke(CATALOG_IMAGES_FUNCTION, { body });
  if (!error) {
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      const d = data as { error?: string; message?: string };
      const code = String(d.error);
      throw new CatalogImageError(code, d.message || ERROR_TEXT[code] || "Não foi possível concluir a ação.", null);
    }
    return data as T;
  }
  // Estado não-2xx: o corpo vem em error.context (Response).
  const ctx = (error as { context?: unknown }).context as
    | { status?: number; json?: () => Promise<unknown> }
    | undefined;
  let parsed: { error?: string; message?: string } | null = null;
  try {
    if (ctx && typeof ctx.json === "function") parsed = (await ctx.json()) as { error?: string; message?: string };
  } catch {
    parsed = null;
  }
  const status = ctx && typeof ctx.status === "number" ? ctx.status : null;
  if (status === null || (status === 404 && !parsed?.error)) {
    throw new CatalogImageError("not_deployed", ERROR_TEXT.not_deployed, status);
  }
  const code =
    parsed?.error ||
    (status === 413 ? "file_too_large" : status === 415 ? "file_type_not_allowed" : status === 429 ? "rate_limited" : status === 401 ? "unauthorized" : "unknown");
  throw new CatalogImageError(code, parsed?.message || ERROR_TEXT[code] || "Não foi possível concluir a ação.", status);
}

/** O artigo devolvido pela Edge (fn_sp_catalog_item_json): só o que interessa aqui; o resto segue igual. */
export interface CatalogImageItem {
  id: string;
  image_paths: string[];
  [key: string]: unknown;
}

export interface CatalogImageUploadResult {
  success: true;
  path: string;
  public_url: string | null;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  already_registered: boolean;
  item: CatalogImageItem;
}

export interface CatalogImageRemoveResult {
  success: true;
  /** false = a foto já não estava no artigo (o objeto, se existia, foi apagado na mesma). */
  removed: boolean;
  storage_deleted: boolean;
  item: CatalogImageItem;
}

export interface CatalogImageReorderResult {
  success: true;
  item: CatalogImageItem;
}

/** Envia uma foto para o artigo (fica no fim da lista). Só o titular da conta. */
export function uploadCatalogImage(catalogItemId: string, file: File): Promise<CatalogImageUploadResult> {
  const form = new FormData();
  form.append("action", "upload");
  form.append("catalog_item_id", catalogItemId);
  form.append("file", file, file.name);
  return invoke<CatalogImageUploadResult>(form);
}

/** Remove a foto do artigo e apaga o ficheiro. */
export function removeCatalogImage(catalogItemId: string, path: string): Promise<CatalogImageRemoveResult> {
  return invoke<CatalogImageRemoveResult>({ action: "remove", catalog_item_id: catalogItemId, path });
}

/** Nova ordem (tem de ter exatamente as fotos atuais). A 1.ª passa a ser a principal. */
export function reorderCatalogImages(catalogItemId: string, paths: string[]): Promise<CatalogImageReorderResult> {
  return invoke<CatalogImageReorderResult>({ action: "reorder", catalog_item_id: catalogItemId, paths });
}

/** Atalho: põe `path` como principal (1.ª), mantendo a ordem das restantes. */
export function setMainCatalogImage(catalogItemId: string, currentPaths: string[], path: string): Promise<CatalogImageReorderResult> {
  return reorderCatalogImages(catalogItemId, [path, ...currentPaths.filter((p) => p !== path)]);
}
