/**
 * supplier-catalog-image — regras puras (sem Deno nem rede), testadas no vitest.
 *
 * O index.ts trata do HTTP, da identidade e do bucket; aqui ficam a validação
 * dos pedidos (zod), do ficheiro (tamanho e tipo REAL pelos magic bytes), o
 * caminho no bucket e o mapeamento dos HINT da BD.
 */
import { z } from "npm:zod";
import { detectSignature } from "../_shared/fileSignature.ts";

export const BUCKET = "supplier-catalog-images";
/** Igual ao file_size_limit do bucket (5 MB). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Folga para os cabeçalhos do multipart ao olhar para o Content-Length. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Máximo de fotos por artigo (a BD tem o mesmo limite: CHECK + sp_catalog_image_register). */
export const MAX_IMAGES_PER_ITEM = 4;

const uuid = z.string().uuid();

/**
 * Caminho no bucket: {supplier_account_id}/{catalog_item_id}/{uuid}.{jpg|png|webp}.
 * A BD valida o mesmo formato (fn_sp_catalog_image_path_ok); aqui só um limite de forma.
 */
export const storagePathSchema = z
  .string()
  .max(200)
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);

/** Ações em JSON. O upload vem em multipart/form-data (uploadFieldsSchema). */
export const jsonActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove"), catalog_item_id: uuid, path: storagePathSchema }),
  z.object({
    action: z.literal("reorder"),
    catalog_item_id: uuid,
    paths: z.array(storagePathSchema).max(MAX_IMAGES_PER_ITEM),
  }),
]);
export type JsonAction = z.infer<typeof jsonActionSchema>;

export const uploadFieldsSchema = z.object({
  action: z.literal("upload"),
  catalog_item_id: uuid,
});
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export interface AllowedImage {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
}

const BY_SIGNATURE: Record<string, AllowedImage> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
};

/** Tipo real pelos primeiros bytes; só JPEG, PNG e WEBP (HEIC, GIF, PDF, SVG… recusados). */
export function detectAllowedImage(bytes: Uint8Array): AllowedImage | null {
  const sig = detectSignature(bytes);
  return (sig && BY_SIGNATURE[sig]) || null;
}

export type FileCheck =
  | { ok: true; type: AllowedImage }
  | { ok: false; status: number; error: string; message: string };

export function checkImage(bytes: Uint8Array): FileCheck {
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "empty_file", message: "O ficheiro está vazio." };
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: "file_too_large", message: "A foto tem de ter até 5 MB." };
  }
  const type = detectAllowedImage(bytes);
  if (!type) {
    return {
      ok: false,
      status: 415,
      error: "file_type_not_allowed",
      message: "Só se aceitam fotos em JPEG, PNG ou WEBP (HEIC não: exporte como JPEG).",
    };
  }
  return { ok: true, type };
}

export function buildStoragePath(accountId: string, itemId: string, fileUuid: string, ext: string): string {
  return `${accountId}/${itemId}/${fileUuid}.${ext}`;
}

/**
 * Chave de serviço apresentada como pessoa: chave secreta nova (sb_secret_…) ou JWT com role
 * service_role (chave legada). Só lê o payload para recusar; a assinatura é do gateway/Auth.
 */
export function isServiceCredential(token: string): boolean {
  const t = String(token || "").trim();
  if (t.startsWith("sb_secret_")) return true;
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

/** HINT das RPCs → estado HTTP. Sem HINT conhecido → 500 com mensagem genérica. */
export const HINT_STATUS: Record<string, number> = {
  not_owner: 403,
  no_supplier_access: 403,
  not_found: 404,
  validation: 400,
  limit: 409,
};

export interface DbError {
  message?: string;
  hint?: string;
}

export function rpcErrorBody(error: DbError | null | undefined): { status: number; body: { error: string; message: string } } {
  const hint = error?.hint || "";
  const status = HINT_STATUS[hint];
  if (!status) {
    return { status: 500, body: { error: "rpc_error", message: "Erro interno. Tente novamente." } };
  }
  return { status, body: { error: hint, message: error?.message || "Erro." } };
}
