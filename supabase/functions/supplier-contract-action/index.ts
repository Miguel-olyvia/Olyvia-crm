/**
 * supplier-contract-action — Contrato de Fornecedor, Fase 2 (ficheiros e emails).
 *
 * Quem chama (Authorization: Bearer <JWT>), resolvido por _shared/auth.ts:
 *   • CRM     — utilizador interno (anew_users). Regras da BD avaliadas com o
 *               JWT dele (rpc_supplier_contract_get → can_manage, estado).
 *   • Portal  — utilizador do portal do fornecedor (supplier_portal_users ativo
 *               numa conta ativa; o mesmo critério de
 *               rpc_supplier_contract_register_file). Regras pela
 *               sp_supplier_contract_get com o JWT dele (can_attach).
 *   Chaves de serviço / segredo do cron são recusados: tem de haver uma pessoa.
 *
 * Ações:
 *   upload (multipart/form-data: action=upload, contract_id, kind, file[, file_name])
 *     CRM: suppliers.contract_manage na org, contrato em rascunho, kind
 *          contrato_fornecedor (PDF) ou anexo (PDF/JPEG/PNG).
 *     Portal: titular da conta; contrato enviado → só kind=anexo; proposta dele
 *             ('proposed', criada no portal) → anexo, e contrato_fornecedor (PDF)
 *             uma vez se a origem é pdf_fornecedor (sp_supplier_contract_get:
 *             can_attach / can_attach_main; regra em portalUploadDecision).
 *     Bytes ≤ 15 MB, tipo pelos magic bytes, SHA-256 dos bytes; grava no bucket
 *     privado supplier-contracts (service_role) e regista com
 *     rpc_supplier_contract_register_file (que volta a validar tudo). Se o
 *     registo falhar, o objeto é apagado.
 *   download_url (JSON { action, file_id })
 *     URL assinado (120 s) criado com o JWT de quem pede: a policy do bucket
 *     (fn_sc_ficheiro_legivel) decide; quem não pode ler recebe not_found.
 *   resend_signature_request (JSON { action, contract_id })  — só CRM
 *     Contrato enviado, can_manage; email aos titulares do portal com acesso à
 *     ligação do contrato, pelo SMTP de quem envia/da organização (como o
 *     convite do portal). Fica no histórico do contrato (evento signature_request_resent, com quem enviou,
 *     destinatários mascarados e smtp_status) por rpc_supplier_contract_log_signature_request; history_logged na resposta.
 *
 * Erros: { error: <código>, message: <texto PT> }. Nunca devolve dados de
 * outro fornecedor/organização, caminhos de outros ficheiros nem texto interno.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { resolveCallerIdentity, AuthError, getServiceRoleKey } from "../_shared/auth.ts";
import { getCorsHeadersExtended, PRODUCTION_ORIGIN } from "../_shared/cors.ts";
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";
import { buildSignatureRequestEmail, logSignatureRequest } from "../_shared/supplierContractEmail.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";
import {
  BUCKET,
  MAX_FILE_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  SIGNED_URL_TTL_SECONDS,
  buildStoragePath,
  checkFile,
  jsonActionSchema,
  maskEmail,
  portalUploadDecision,
  rpcErrorBody,
  sanitizeFileName,
  sha256Hex,
  uploadFieldsSchema,
} from "./logic.ts";

initSentry();

const FN = "supplier-contract-action";
const LIMITS = {
  upload: { maxAttempts: 60, windowMinutes: 60 },
  download_url: { maxAttempts: 240, windowMinutes: 60 },
  resend_signature_request: { maxAttempts: 20, windowMinutes: 60 },
  resend_per_contract: { maxAttempts: 3, windowMinutes: 60 },
} as const;

type Json = Record<string, unknown>;

function resolveAppBaseUrl(): string {
  const app = Deno.env.get("APP_URL")?.trim();
  if (app) {
    try {
      const u = new URL(app);
      if (u.protocol === "https:") return u.origin;
    } catch {
      // inválido → produção
    }
  }
  return PRODUCTION_ORIGIN.replace(/\/+$/, "");
}

interface Actor {
  authUid: string;
  /** Tem perfil interno (anew_users). */
  hasCrmProfile: boolean;
  /** É utilizador ativo do portal do fornecedor numa conta ativa (critério de register_file). */
  isPortal: boolean;
}

serve(async (req: Request) => {
  const cors = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (status: number, body: Json) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", message: "Método não suportado." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  // deno-lint-ignore no-explicit-any
  let svc: any;
  let uploadedPath: string | null = null;

  try {
    svc = createClient(supabaseUrl, getServiceRoleKey(), { auth: { autoRefreshToken: false, persistSession: false } });

    // ── Quem chama ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    let authUid = "";
    let hasCrmProfile = false;
    try {
      const caller = await resolveCallerIdentity(req, svc);
      if (caller.isServiceRole) {
        return json(403, { error: "human_required", message: "Esta ação tem de ser feita por uma pessoa." });
      }
      authUid = caller.authUid;
      hasCrmProfile = true;
    } catch (e) {
      // Sem perfil interno: pode ser um utilizador do portal do fornecedor.
      if (e instanceof AuthError && e.status === 403) {
        const { data, error } = await svc.auth.getUser(authHeader.replace("Bearer ", ""));
        if (error || !data?.user) return json(401, { error: "unauthorized", message: "Sessão inválida ou expirada." });
        authUid = data.user.id;
      } else if (e instanceof AuthError) {
        return json(e.status, { error: "unauthorized", message: "Sessão inválida ou expirada." });
      } else {
        throw e;
      }
    }

    const actor: Actor = { authUid, hasCrmProfile, isPortal: false };
    {
      const { data: pus, error: puErr } = await svc
        .from("supplier_portal_users")
        .select("supplier_account_id")
        .eq("auth_user_id", authUid)
        .eq("status", "active");
      if (puErr) throw new Error("supplier_portal_users lookup failed");
      const accountIds = [...new Set((pus || []).map((p: Json) => p.supplier_account_id).filter(Boolean))];
      if (accountIds.length > 0) {
        const { data: accs, error: accErr } = await svc
          .from("supplier_accounts").select("id").in("id", accountIds).eq("status", "active").limit(1);
        if (accErr) throw new Error("supplier_accounts lookup failed");
        actor.isPortal = Array.isArray(accs) && accs.length > 0;
      }
    }
    if (!actor.isPortal && !actor.hasCrmProfile) {
      return json(403, { error: "no_permission", message: "Sem acesso." });
    }

    // Cliente com o JWT de quem pede: as RPCs e as policies do bucket avaliam-no.
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const limit = async (bucketKey: keyof typeof LIMITS, identifier: string): Promise<Response | null> => {
      const bucket = `${FN}:${bucketKey}`;
      const rl = await checkRateLimit(svc, { bucket, identifier, ...LIMITS[bucketKey] });
      if (!rl.allowed) return rateLimitResponse(rl, cors);
      await recordRateLimitAttempt(svc, bucket, identifier);
      return null;
    };

    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    // ── upload ─────────────────────────────────────────────────────────────
    if (contentType.startsWith("multipart/form-data")) {
      const declared = Number(req.headers.get("content-length") || "0");
      if (declared > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
        return json(413, { error: "file_too_large", message: "O ficheiro tem de ter até 15 MB." });
      }
      const rl = await limit("upload", authUid);
      if (rl) return rl;

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return json(400, { error: "validation", message: "Pedido inválido." });
      }
      const file = form.get("file");
      const parsed = uploadFieldsSchema.safeParse({
        action: form.get("action"),
        contract_id: form.get("contract_id"),
        kind: form.get("kind"),
        file_name: typeof form.get("file_name") === "string" ? form.get("file_name") : undefined,
      });
      if (!parsed.success || !(file instanceof File)) {
        return json(400, { error: "validation", message: "Pedido inválido.", details: parsed.success ? undefined : parsed.error.issues });
      }
      const input = parsed.data;
      if (file.size > MAX_FILE_BYTES) {
        return json(413, { error: "file_too_large", message: "O ficheiro tem de ter até 15 MB." });
      }

      // Pré-verificação (antes de escrever no bucket) com as regras da BD.
      let orgId: string;
      if (actor.isPortal) {
        // O mesmo critério de rpc_supplier_contract_register_file: portal ganha.
        const { data: c, error } = await asUser.rpc("sp_supplier_contract_get", { p_contract_id: input.contract_id });
        if (error) {
          const r = rpcErrorBody(error);
          return json(r.status, r.body);
        }
        const decision = portalUploadDecision(c, input.kind);
        if (!decision.ok) return json(decision.status, decision.body);
        orgId = String(c.organization_id);
      } else {
        const { data: c, error } = await asUser.rpc("rpc_supplier_contract_get", { p_contract_id: input.contract_id });
        if (error) {
          const r = rpcErrorBody(error);
          return json(r.status, r.body);
        }
        if (c?.can_manage !== true) {
          return json(403, { error: "no_permission", message: "Sem permissão para gerir contratos de fornecedor." });
        }
        if (c?.status !== "draft") {
          return json(409, { error: "invalid_state", message: "Só se anexam ficheiros a um rascunho." });
        }
        orgId = String(c.organization_id);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkFile(bytes, input.kind);
      if (!check.ok) return json(check.status, { error: check.error, message: check.message });

      const sha256 = await sha256Hex(bytes);
      const fileName = sanitizeFileName(input.file_name ?? file.name, check.type.ext);
      const path = buildStoragePath(orgId, input.contract_id, crypto.randomUUID(), check.type.ext);

      const { error: upErr } = await svc.storage.from(BUCKET).upload(path, bytes, {
        contentType: check.type.mime,
        upsert: false,
        cacheControl: "no-store",
      });
      if (upErr) {
        console.error(`[${FN}] upload falhou:`, upErr.message);
        return json(500, { error: "upload_failed", message: "Não foi possível guardar o ficheiro. Tente novamente." });
      }
      uploadedPath = path;

      const { data: reg, error: regErr } = await svc.rpc("rpc_supplier_contract_register_file", {
        p_caller_auth_uid: authUid,
        p_contract_id: input.contract_id,
        p_kind: input.kind,
        p_storage_path: path,
        p_file_name: fileName,
        p_mime: check.type.mime,
        p_sha256: sha256,
      });
      if (regErr) {
        await svc.storage.from(BUCKET).remove([path]).catch(() => undefined);
        uploadedPath = null;
        const r = rpcErrorBody(regErr);
        return json(r.status, r.body);
      }
      uploadedPath = null;

      return json(200, {
        success: true,
        file_id: reg?.file_id,
        is_main: reg?.is_main === true,
        already_registered: reg?.already_registered === true,
        file_name: fileName,
        mime_type: check.type.mime,
        size_bytes: bytes.byteLength,
        sha256,
        via: actor.isPortal ? "portal" : "crm",
      });
    }

    // ── ações JSON ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "validation", message: "Pedido inválido." });
    }
    const parsed = jsonActionSchema.safeParse(body);
    if (!parsed.success) {
      return json(400, { error: "validation", message: "Pedido inválido.", details: parsed.error.issues });
    }
    const input = parsed.data;

    if (input.action === "download_url") {
      const rl = await limit("download_url", authUid);
      if (rl) return rl;
      const notFound = () => json(404, { error: "not_found", message: "Ficheiro não encontrado." });

      const { data: f, error: fErr } = await svc
        .from("supplier_contract_files")
        .select("id, storage_path, file_name, mime_type, size_bytes, sha256")
        .eq("id", input.file_id)
        .maybeSingle();
      if (fErr) throw new Error("supplier_contract_files lookup failed");
      if (!f) return notFound();

      // Assinado com o JWT de quem pede: a policy fn_sc_ficheiro_legivel decide.
      const { data: signed, error: sErr } = await asUser.storage
        .from(BUCKET)
        .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS, { download: f.file_name });
      if (sErr || !signed?.signedUrl) return notFound();

      return json(200, {
        success: true,
        url: signed.signedUrl,
        expires_in: SIGNED_URL_TTL_SECONDS,
        file_id: f.id,
        file_name: f.file_name,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
        sha256: f.sha256,
      });
    }

    // resend_signature_request — só CRM
    if (!actor.hasCrmProfile) {
      return json(403, { error: "no_permission", message: "Sem permissão." });
    }
    const rl = await limit("resend_signature_request", authUid);
    if (rl) return rl;

    const { data: c, error: cErr } = await asUser.rpc("rpc_supplier_contract_get", { p_contract_id: input.contract_id });
    if (cErr) {
      const r = rpcErrorBody(cErr);
      return json(r.status, r.body);
    }
    if (c?.can_manage !== true) {
      return json(403, { error: "no_permission", message: "Sem permissão para gerir contratos de fornecedor." });
    }
    if (c?.status !== "sent") {
      return json(409, { error: "invalid_state", message: "Só se reenvia o pedido de um contrato enviado e por assinar." });
    }
    const rlc = await limit("resend_per_contract", String(c.id));
    if (rlc) return rlc;

    // Titulares ativos da conta fixada no envio, com acesso ativo à ligação do contrato.
    const { data: owners, error: oErr } = await svc
      .from("supplier_portal_users")
      .select("id, email, name")
      .eq("supplier_account_id", c.supplier_account_id)
      .eq("role", "owner")
      .eq("status", "active");
    if (oErr) throw new Error("owners lookup failed");
    const ownerIds = (owners || []).map((o: Json) => o.id);
    let recipients: Array<{ email: string; name: string | null }> = [];
    if (ownerIds.length > 0 && c.supplier_account_link_id) {
      const { data: acc, error: aErr } = await svc
        .from("supplier_portal_user_access")
        .select("portal_user_id")
        .eq("link_id", c.supplier_account_link_id)
        .is("revoked_at", null)
        .in("portal_user_id", ownerIds);
      if (aErr) throw new Error("access lookup failed");
      const withAccess = new Set((acc || []).map((a: Json) => a.portal_user_id));
      recipients = (owners || [])
        .filter((o: Json) => withAccess.has(o.id) && typeof o.email === "string" && o.email)
        .map((o: Json) => ({ email: String(o.email), name: (o.name as string | null) ?? null }));
    }
    if (recipients.length === 0) {
      return json(409, { error: "no_portal_owner", message: "A conta do fornecedor no portal não tem um titular ativo para assinar." });
    }

    const masked = recipients.map((r) => maskEmail(r.email));
    const logResend = (smtpStatus: "sent" | "not_found" | "send_failed", sentCount: number) =>
      logSignatureRequest(svc, {
        callerAuthUid: authUid, contractId: String(c.id), source: "reenvio",
        maskedRecipients: masked, smtpStatus, sentCount,
      });

    const smtp = await resolveSmtpForAuthenticatedUser(svc, { authUserId: authUid, organizationId: c.organization_id });
    if (!smtp) {
      const historyLogged = await logResend("not_found", 0);
      return json(200, {
        success: true,
        message: `O email não foi enviado. ${smtpNotFoundMessage()}`,
        smtp_status: "not_found",
        smtp_warning: true,
        recipients: masked,
        history_logged: historyLogged,
      });
    }

    const loginUrl = `${resolveAppBaseUrl()}/auth`;
    let sent = 0;
    let lastError: string | null = null;
    for (const r of recipients) {
      const { subject, html } = buildSignatureRequestEmail({
        orgName: String(c.organization_name || ""),
        recipientName: r.name,
        loginUrl,
        contract: { contract_number: c.contract_number, version: c.version, title: c.title, valid_until: c.valid_until },
      });
      try {
        await sendEmailViaSMTP(smtp.smtp, { to: r.email, subject, html });
        sent++;
      } catch (smtpErr) {
        lastError = sanitizeSmtpError(smtpErr);
        console.error(`[${FN}] envio SMTP falhou`, { ...smtp.metadata, error: lastError });
      }
    }
    const historyLogged = await logResend(sent === 0 ? "send_failed" : "sent", sent);
    if (sent === 0) {
      return json(200, {
        success: true,
        message: "O email não foi enviado (erro SMTP). Tente novamente.",
        smtp_status: "send_failed",
        smtp_warning: true,
        smtp_error_safe: lastError,
        recipients: masked,
        history_logged: historyLogged,
      });
    }
    return json(200, {
      success: true,
      message: "Pedido de assinatura reenviado",
      smtp_status: "sent",
      sent_count: sent,
      recipients: masked,
      history_logged: historyLogged,
    });
  } catch (err) {
    if (uploadedPath && svc) {
      await svc.storage.from(BUCKET).remove([uploadedPath]).catch(() => undefined);
    }
    console.error(`[${FN}] erro:`, err instanceof Error ? err.message : "erro");
    await captureError(err, { function: FN });
    return json(500, { error: "internal_error", message: "Erro interno. Tente novamente." });
  }
});
