// Ações de ficheiros e e-mail do Contrato de Fornecedor — Edge
// supplier-contract-action (Fase 2, commit 916c4f4a), POST com o JWT de quem
// pede (supabase.functions.invoke junta-o):
//   upload                   multipart: action, contract_id, kind
//                            (contrato_fornecedor|anexo), file, file_name?. CRM: contract_manage e
//                            rascunho. 200 → {success, file_id, is_main, already_registered,
//                            file_name, mime_type, size_bytes, sha256, via}
//   download_url             JSON {action, file_id} → {success, url, expires_in: 120, ...}
//   resend_signature_request JSON {action, contract_id} (só CRM) →
//                            {success, message, smtp_status, sent_count?, recipients[]}
// Erros: {error, message} (mensagem PT da Edge); aqui só se traduzem os códigos
// para texto legível quando a Edge não manda mensagem.
import { supabase } from "@/integrations/supabase/client";
import type { SupplierContractFile } from "./tipos";

const FUNCTION_NAME = "supplier-contract-action";

/** Limite da Edge (413 file_too_large). */
export const CONTRACT_FILE_MAX_BYTES = 15 * 1024 * 1024;
/** Tipos aceites pela Edge (pelos magic bytes): contrato só PDF; anexos PDF/JPEG/PNG. */
export const CONTRACT_MAIN_MIME = ["application/pdf"] as const;
export const CONTRACT_ANNEX_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;

export interface ContractActionError {
  error: string;
  message: string;
}

type ActionResult<T> = { data: T; error: null } | { data: null; error: ContractActionError };

/** Texto PT-PT por código, quando a Edge não manda mensagem. */
const ERROR_TEXT: Record<string, string> = {
  file_too_large: "O ficheiro tem de ter até 15 MB.",
  file_type_not_allowed: "Tipo de ficheiro não aceite: o contrato tem de ser PDF; os anexos PDF, JPEG ou PNG.",
  invalid_state: "O contrato já não está no estado que permite esta ação. Atualize a página.",
  not_found: "Contrato ou ficheiro não encontrado.",
  no_permission: "Sem permissão para gerir contratos de fornecedor.",
  not_owner: "Só o responsável da conta pode fazer esta ação.",
  validation: "Pedido inválido.",
  no_portal_owner: "A conta do fornecedor no portal não tem um titular ativo para assinar.",
  rate_limited: "Limite de reenvios atingido (3 por hora por contrato). Tente mais tarde.",
  unauthorized: "Sessão inválida ou expirada. Volte a entrar.",
  upload_failed: "Não foi possível guardar o ficheiro. Tente novamente.",
  internal_error: "Erro interno. Tente novamente.",
};

export function describeActionError(e: Partial<ContractActionError> | null | undefined): string {
  if (!e) return "Não foi possível concluir a ação.";
  return e.message || (e.error ? ERROR_TEXT[e.error] : undefined) || "Não foi possível concluir a ação.";
}

async function invoke<T>(body: Record<string, unknown> | FormData): Promise<ActionResult<T>> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (!error) {
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      const d = data as Partial<ContractActionError>;
      return { data: null, error: { error: String(d.error), message: describeActionError(d) } };
    }
    return { data: data as T, error: null };
  }
  // Estado não-2xx: o corpo vem em error.context (Response).
  const ctx = (error as { context?: unknown }).context as
    | { status?: number; json?: () => Promise<unknown> }
    | undefined;
  let parsed: Partial<ContractActionError> | null = null;
  try {
    if (ctx && typeof ctx.json === "function") parsed = (await ctx.json()) as Partial<ContractActionError>;
  } catch {
    parsed = null;
  }
  const isHttp = !!ctx && typeof ctx.status === "number";
  if (!isHttp || (ctx?.status === 404 && !parsed?.error)) {
    return {
      data: null,
      error: {
        error: "not_deployed",
        message: "As ações de ficheiros do contrato ainda não estão disponíveis (função supplier-contract-action por publicar).",
      },
    };
  }
  const code = parsed?.error || (ctx?.status === 413 ? "file_too_large" : ctx?.status === 415 ? "file_type_not_allowed" : "unknown");
  return { data: null, error: { error: code, message: describeActionError({ error: code, message: parsed?.message }) } };
}

/** Validação no cliente (a Edge volta a validar pelos bytes). null = válido. */
export function validateContractFile(file: File, kind: SupplierContractFile["kind"]): string | null {
  const allowed: readonly string[] = kind === "contrato_fornecedor" ? CONTRACT_MAIN_MIME : CONTRACT_ANNEX_MIME;
  if (!allowed.includes(file.type)) {
    return kind === "contrato_fornecedor" ? "O contrato do fornecedor tem de ser um PDF." : "Só são aceites anexos PDF, JPEG ou PNG.";
  }
  if (file.size <= 0) return "O ficheiro está vazio.";
  if (file.size > CONTRACT_FILE_MAX_BYTES) return ERROR_TEXT.file_too_large;
  return null;
}

export interface UploadResult {
  success: boolean;
  file_id: string;
  is_main: boolean;
  already_registered: boolean;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  via: "crm" | "portal";
}

/** Envia o PDF do fornecedor (kind contrato_fornecedor) ou um anexo. CRM: só em rascunho. */
export function uploadContractFile(
  contractId: string,
  kind: SupplierContractFile["kind"],
  file: File,
): Promise<ActionResult<UploadResult>> {
  const form = new FormData();
  form.append("action", "upload");
  form.append("contract_id", contractId);
  form.append("kind", kind);
  form.append("file", file, file.name);
  form.append("file_name", file.name);
  return invoke<UploadResult>(form);
}

export interface DownloadUrlResult {
  success: boolean;
  url: string;
  expires_in: number;
  file_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
}

/** URL assinado (120 s) para abrir/descarregar um ficheiro do contrato. */
export function downloadContractFile(fileId: string): Promise<ActionResult<DownloadUrlResult>> {
  return invoke<DownloadUrlResult>({ action: "download_url", file_id: fileId });
}

export interface ResendResult {
  success: boolean;
  message: string;
  smtp_status: "sent" | "not_found" | "send_failed";
  sent_count?: number;
  recipients: string[];
}

/** Volta a enviar ao(s) titular(es) do portal o pedido de assinatura (contrato enviado). */
export function resendContractEmail(contractId: string): Promise<ActionResult<ResendResult>> {
  return invoke<ResendResult>({ action: "resend_signature_request", contract_id: contractId });
}
