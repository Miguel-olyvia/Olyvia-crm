/**
 * supplier-contract-action — regras puras (sem Deno nem rede), testadas no vitest.
 *
 * O index.ts trata do HTTP, da identidade e do bucket; aqui ficam a validação
 * dos pedidos (zod), do ficheiro (tamanho e tipo REAL pelos magic bytes), o
 * nome/caminho no bucket, o SHA-256 e o mapeamento dos HINT da BD.
 */
import { z } from "npm:zod";
import { detectSignature, toHex } from "../_shared/fileSignature.ts";

export const BUCKET = "supplier-contracts";
/** Máximo aceite por esta Edge (o bucket aceita 20 MB; aqui fica mais curto). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Folga para os cabeçalhos do multipart ao olhar para o Content-Length. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Validade do URL assinado de download (segundos). */
export const SIGNED_URL_TTL_SECONDS = 120;

export const FILE_KINDS = ["contrato_fornecedor", "anexo"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const uuid = z.string().uuid();

/** Ações em JSON. O upload vem em multipart/form-data (uploadFieldsSchema). */
export const jsonActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("download_url"), file_id: uuid }),
  z.object({ action: z.literal("resend_signature_request"), contract_id: uuid }),
]);
export type JsonAction = z.infer<typeof jsonActionSchema>;

export const uploadFieldsSchema = z.object({
  action: z.literal("upload"),
  contract_id: uuid,
  kind: z.enum(FILE_KINDS),
  file_name: z.string().max(1000).optional(),
});
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export interface AllowedType {
  mime: "application/pdf" | "image/jpeg" | "image/png";
  ext: "pdf" | "jpg" | "png";
}

const BY_SIGNATURE: Record<string, AllowedType> = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
};

/**
 * Tipo real do ficheiro pelos primeiros bytes. O contrato do fornecedor só
 * PDF; os anexos PDF, JPEG ou PNG (sem HEIC/WEBP/GIF/Office). O tipo que o
 * cliente diz é ignorado.
 */
export function detectAllowedType(bytes: Uint8Array, kind: FileKind): AllowedType | null {
  const sig = detectSignature(bytes);
  const t = sig ? BY_SIGNATURE[sig] : undefined;
  if (!t) return null;
  if (kind === "contrato_fornecedor" && t.mime !== "application/pdf") return null;
  return t;
}

export type FileCheck =
  | { ok: true; type: AllowedType }
  | { ok: false; status: number; error: string; message: string };

export function checkFile(bytes: Uint8Array, kind: FileKind): FileCheck {
  if (bytes.byteLength === 0) {
    return { ok: false, status: 400, error: "empty_file", message: "O ficheiro está vazio." };
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: "file_too_large", message: "O ficheiro tem de ter até 15 MB." };
  }
  const type = detectAllowedType(bytes, kind);
  if (!type) {
    return {
      ok: false,
      status: 415,
      error: "file_type_not_allowed",
      message: kind === "contrato_fornecedor"
        ? "O contrato do fornecedor tem de ser um PDF."
        : "Só se aceitam anexos em PDF, JPEG ou PNG.",
    };
  }
  return { ok: true, type };
}

/**
 * Nome a guardar (o que a pessoa vê): sem caracteres de controlo nem barras,
 * espaços normalizados, até 255 caracteres, com a extensão do tipo real.
 */
export function sanitizeFileName(raw: string | null | undefined, ext: AllowedType["ext"]): string {
  let name = String(raw ?? "")
    .normalize("NFC")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Sem a extensão do cliente; fica a do tipo real.
  name = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[.\s]+$/, "").trim();
  if (!name) name = ext === "pdf" ? "documento" : "imagem";
  const suffix = `.${ext}`;
  if (name.length + suffix.length > 255) name = name.slice(0, 255 - suffix.length).trim();
  return name + suffix;
}

/** {organization_id}/{contract_id}/{uuid}.{ext} — a folha cumpre o regex de rpc_supplier_contract_register_file. */
export function buildStoragePath(orgId: string, contractId: string, fileUuid: string, ext: string): string {
  return `${orgId}/${contractId}/${fileUuid}.${ext}`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // slice(): cópia com ArrayBuffer próprio (o BufferSource do subtle não aceita SharedArrayBuffer).
  return toHex(await crypto.subtle.digest("SHA-256", bytes.slice()));
}

/** HINT das RPCs → estado HTTP. Sem HINT conhecido → 500 com mensagem genérica. */
export const HINT_STATUS: Record<string, number> = {
  no_permission: 403,
  not_owner: 403,
  no_supplier_access: 403,
  not_found: 404,
  invalid_state: 409,
  limit: 409,
  validation: 400,
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

/** "jo***@exemplo.pt" — para a resposta ao CRM, sem expor o email completo em listas. */
export function maskEmail(email: string): string {
  const [user, domain] = String(email).split("@");
  if (!domain) return "***";
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}***@${domain}`;
}
