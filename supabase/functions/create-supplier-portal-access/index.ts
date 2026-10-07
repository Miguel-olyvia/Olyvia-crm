/**
 * create-supplier-portal-access — Portal do Fornecedor (F3.1)
 *
 * "Enviar acesso ao portal" na ficha do fornecedor (CRM).
 *
 * Diferenças deliberadas em relação a create-client-portal-access:
 *   • NUNCA há password temporária e NUNCA se devolve uma password ou um link
 *     ao operador. O fornecedor recebe por email um link para definir a
 *     password (generateLink "recovery" → token_hash → /reset-password).
 *     A conta é global por NIF (pode ser usada por várias empresas); um
 *     operador de uma empresa não pode tomar conta dela.
 *   • A conta Auth é criada com user_metadata.admin_created = 'true': o
 *     gatilho handle_new_user não cria anew_users nem anew_entities. Leva
 *     também app_metadata.supplier_portal = true (só o servidor o escreve):
 *     a RPC só aproveita uma conta Auth ainda sem utilizador do portal se
 *     tiver essa marca e nunca tiver iniciado sessão — uma conta registada
 *     por terceiros com o mesmo email é recusada (email_not_allowed). Não há
 *     anew_memberships, não há "lazy-create" de perfil, não se muda o email
 *     de uma conta existente.
 *   • Todo o trabalho na BD é feito numa RPC atómica service_role
 *     (rpc_supplier_portal_invite_prepare / _resend_prepare), que volta a
 *     verificar quem chama (org visível + suppliers.portal_manage).
 *   • A resposta ao operador é igual quer a conta já existisse quer não
 *     ("Convite enviado"); não revela outras empresas ligadas.
 *
 * Pedido (POST, Authorization: Bearer <JWT do utilizador do CRM>):
 *   { action: "invite", organization_id, supplier_id, email, name? }
 *   { action: "resend", organization_id, supplier_id, portal_user_id }
 *
 * Resposta 200:
 *   { success: true, message, smtp_status: "sent" | "not_found" | "send_failed", smtp_warning?: true }
 * Erros: { error: <código>, message: <texto PT> } com 400/401/403/404/409/422/429/500.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { z } from "npm:zod";
import { resolveSmtpForAuthenticatedUser, sendEmailViaSMTP, sanitizeSmtpError, smtpNotFoundMessage } from "../_shared/smtp.ts";
import { validateOrgScope, checkUserPermission, getServiceRoleKey } from "../_shared/auth.ts";
import { checkRateLimit, recordRateLimitAttempt, rateLimitResponse } from "../_shared/rateLimit.ts";
import { getCorsHeadersExtended, PRODUCTION_ORIGIN } from "../_shared/cors.ts";
import { initSentry, captureError } from "../_shared/sentry.ts";

initSentry();

const uuid = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    organization_id: uuid,
    supplier_id: uuid,
    email: z.string().trim().toLowerCase().email().max(320),
    name: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal("resend"),
    organization_id: uuid,
    supplier_id: uuid,
    portal_user_id: uuid,
  }),
]);

// Limites (rate_limit_attempts): por operador e por email de destino.
const CALLER_LIMIT = { maxAttempts: 30, windowMinutes: 60 };
const TARGET_LIMIT = { maxAttempts: 5, windowMinutes: 60 };

// HINT das RPCs → estado HTTP.
const HINT_STATUS: Record<string, number> = {
  no_permission: 403,
  not_found: 404,
  invalid_nif: 422,
  validation: 400,
  email_not_allowed: 409,
  account_unavailable: 409,
  conflict: 409,
  auth_user_missing: 500,
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Base dos links enviados ao fornecedor. NUNCA vem do pedido (nem do corpo,
 * nem do cabeçalho Origin, que qualquer cliente fora do browser escolhe): o
 * link leva um token de sessão e um domínio controlado por terceiros
 * permitiria capturá-lo. Só configuração do servidor: APP_URL (se for uma
 * origem https válida) ou a origem de produção. SITE_URL não é usado: neste
 * projeto não aponta para o domínio da app.
 */
function resolveAppBaseUrl(): string {
  const app = Deno.env.get("APP_URL")?.trim();
  if (app) {
    try {
      const u = new URL(app);
      if (u.protocol === "https:") return u.origin;
    } catch {
      // inválido → produção
    }
    console.warn("[create-supplier-portal-access] APP_URL ignorado (não é https válido)");
  }
  return PRODUCTION_ORIGIN.replace(/\/+$/, "");
}

/**
 * Desfaz a conta Auth criada por ESTE pedido, só se continuar sem utilizador
 * do portal. Dois pedidos em simultâneo para o mesmo email: o outro pode ter
 * encontrado esta conta ("already registered") e já a ter ligado — nesse caso
 * (ou se não for possível confirmar) não se apaga.
 */
// deno-lint-ignore no-explicit-any
async function deleteCreatedAuthUserIfUnlinked(supabase: any, authUserId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("supplier_portal_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .limit(1);
    if (error) {
      console.error("[create-supplier-portal-access] rollback: verificação falhou, conta mantida:", error.message);
      return;
    }
    if (Array.isArray(data) && data.length > 0) {
      console.warn("[create-supplier-portal-access] rollback: conta já ligada ao portal por outro pedido, mantida");
      return;
    }
    await supabase.auth.admin.deleteUser(authUserId);
  } catch (e) {
    console.error("[create-supplier-portal-access] rollback da conta falhou:", e);
  }
}

function json(status: number, body: unknown, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
function rpcErrorResponse(error: any, corsHeaders: Record<string, string>): Response {
  const hint: string = error?.hint || "";
  const status = HINT_STATUS[hint] ?? 500;
  return json(status, {
    error: hint || "rpc_error",
    message: status === 500 ? "Erro interno. Tente novamente." : (error?.message || "Erro."),
  }, corsHeaders);
}

function emailLayout(inner: string, safeOrgName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">
      ${inner}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 13px;">Enviado por ${safeOrgName} através da Olyvia.
      Se não esperava este email, pode ignorá-lo.</p>
    </div>`;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeadersExtended(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Método não suportado." }, corsHeaders);
  }

  // Conta criada neste pedido (para desfazer se a preparação falhar).
  let createdAuthUserId: string | null = null;
  // deno-lint-ignore no-explicit-any
  let supabase: any = null;

  try {
    supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── Quem chama ───────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "unauthorized", message: "Sessão em falta." }, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return json(401, { error: "unauthorized", message: "Sessão inválida ou expirada." }, corsHeaders);
    }

    const { data: callerAnew } = await supabase
      .from("anew_users")
      .select("id, name")
      .eq("auth_user_id", caller.id)
      .eq("status", "active")
      .maybeSingle();
    if (!callerAnew) {
      return json(403, { error: "no_permission", message: "Utilizador não encontrado no sistema." }, corsHeaders);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "validation", message: "Pedido inválido." }, corsHeaders);
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json(400, { error: "validation", message: "Pedido inválido.", details: parsed.error.issues }, corsHeaders);
    }
    const input = parsed.data;

    const callerIdentity = { authUid: caller.id, anewUserId: callerAnew.id, isServiceRole: false };
    if (!(await validateOrgScope(supabase, callerIdentity, input.organization_id))) {
      return json(403, { error: "no_permission", message: "Sem permissão para aceder a esta organização." }, corsHeaders);
    }
    // Mesma regra da BD (has_anew_permission): a permissão num papel ativo.
    // A RPC volta a verificar org visível + permissão de forma autoritativa.
    // Sem organization_id: quem gere a organização pela hierarquia (sem ser
    // membro direto) também passa, como na BD.
    if (!(await checkUserPermission(supabase, callerAnew.id, "suppliers.portal_manage"))) {
      return json(403, { error: "no_permission", message: "Sem permissão para gerir o acesso dos fornecedores ao portal." }, corsHeaders);
    }

    // ── Limite de pedidos por operador ───────────────────────────────────
    // Cada tentativa conta (também as recusadas), gravada ANTES de qualquer
    // RPC: senão as recusas (ex. email_not_allowed) permitiam sondar emails
    // sem limite.
    const callerRl = await checkRateLimit(supabase, {
      bucket: "supplier-portal-access:caller", identifier: caller.id, ...CALLER_LIMIT,
    });
    if (!callerRl.allowed) return rateLimitResponse(callerRl, corsHeaders);
    await recordRateLimitAttempt(supabase, "supplier-portal-access:caller", caller.id);

    // ── Preparação na BD ─────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    let prep: any;

    if (input.action === "invite") {
      // input.email já vem normalizado pelo schema (trim + lowercase).
      const targetEmail = input.email;
      const targetRl = await checkRateLimit(supabase, {
        bucket: "supplier-portal-access:email", identifier: targetEmail, ...TARGET_LIMIT,
      });
      if (!targetRl.allowed) return rateLimitResponse(targetRl, corsHeaders);
      await recordRateLimitAttempt(supabase, "supplier-portal-access:email", targetEmail);

      // 1. Validar antes de criar qualquer conta.
      const { data: check, error: checkErr } = await supabase.rpc("rpc_supplier_portal_invite_prepare", {
        p_caller_auth_uid: caller.id,
        p_organization_id: input.organization_id,
        p_supplier_id: input.supplier_id,
        p_email: targetEmail,
        p_name: input.name ?? null,
        p_check_only: true,
      });
      if (checkErr) return rpcErrorResponse(checkErr, corsHeaders);

      // 2. Conta Auth sem password conhecida e sem perfil do CRM.
      //    Uma só tentativa (sem withRetryResult): repetir um createUser que
      //    pode ter sido aplicado do lado do Auth dava "already registered"
      //    e perdia-se o id da conta criada por este pedido.
      //    app_metadata.supplier_portal só o servidor escreve — é a marca que
      //    a RPC exige para aproveitar uma conta Auth ainda sem utilizador do
      //    portal.
      if (!check?.auth_user_exists) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: targetEmail,
          email_confirm: true,
          app_metadata: { supplier_portal: true },
          user_metadata: { admin_created: "true", supplier_portal: true, full_name: input.name ?? null },
        });
        if (createErr || !created?.user) {
          // Corrida: a conta foi criada entretanto (outro pedido) → tratá-la
          // como pré-existente: createdAuthUserId fica null e NUNCA se apaga.
          // A RPC decide se pode ser usada. Qualquer outro erro é fatal.
          const msg = String(createErr?.message || "");
          if (!/already|registered|exists/i.test(msg)) {
            console.error("[create-supplier-portal-access] createUser falhou:", msg);
            throw new Error("Não foi possível criar a conta de acesso.");
          }
          const { data: existingId, error: lookupErr } = await supabase.rpc("get_auth_user_id_by_email", {
            p_email: targetEmail,
          });
          if (lookupErr || !existingId) {
            console.error("[create-supplier-portal-access] conta 'already registered' não encontrada:", lookupErr?.message);
            throw new Error("Não foi possível criar a conta de acesso.");
          }
        } else {
          createdAuthUserId = created.user.id;
        }
      }

      // 3. Conta, ligação, utilizador e acesso — atómico.
      const { data: full, error: fullErr } = await supabase.rpc("rpc_supplier_portal_invite_prepare", {
        p_caller_auth_uid: caller.id,
        p_organization_id: input.organization_id,
        p_supplier_id: input.supplier_id,
        p_email: targetEmail,
        p_name: input.name ?? null,
        p_check_only: false,
      });
      if (fullErr) {
        if (createdAuthUserId) {
          const toDelete = createdAuthUserId;
          createdAuthUserId = null;
          await deleteCreatedAuthUserIfUnlinked(supabase, toDelete);
        }
        return rpcErrorResponse(fullErr, corsHeaders);
      }
      prep = full;
      createdAuthUserId = null; // já ligada ao portal: não desfazer daqui em diante
    } else {
      const { data: rs, error: rsErr } = await supabase.rpc("rpc_supplier_portal_resend_prepare", {
        p_caller_auth_uid: caller.id,
        p_organization_id: input.organization_id,
        p_supplier_id: input.supplier_id,
        p_portal_user_id: input.portal_user_id,
      });
      if (rsErr) return rpcErrorResponse(rsErr, corsHeaders);
      prep = rs;

      const targetRl = await checkRateLimit(supabase, {
        bucket: "supplier-portal-access:email", identifier: String(prep.email), ...TARGET_LIMIT,
      });
      if (!targetRl.allowed) return rateLimitResponse(targetRl, corsHeaders);
      await recordRateLimitAttempt(supabase, "supplier-portal-access:email", String(prep.email));
    }

    const email: string = String(prep.email);
    // Sempre do servidor (APP_URL/produção) — também o link /auth do aviso
    // a quem já tem password.
    const baseUrl = resolveAppBaseUrl();
    const orgName: string = prep.organization_name || "a empresa";
    const safeOrgName = escapeHtml(orgName);
    const safeName = escapeHtml(String(prep.user_name || ""));

    // Convite a quem já definiu a password: só avisa (sem link de reposição).
    // Reenviar: manda sempre um link novo, só para o email do utilizador.
    const sendSetPasswordLink = input.action === "resend" || !prep.password_set;

    let link = `${baseUrl}/auth`;
    if (sendSetPasswordLink) {
      const { data: gen, error: genErr } = await supabase.auth.admin.generateLink({ type: "recovery", email });
      const hashed = gen?.properties?.hashed_token;
      if (genErr || !hashed) {
        console.error("[create-supplier-portal-access] generateLink falhou:", genErr?.message);
        throw new Error("Não foi possível gerar o link de acesso.");
      }
      if (gen.user?.id && prep.auth_user_id && gen.user.id !== prep.auth_user_id) {
        throw new Error("A conta de acesso não corresponde ao utilizador do portal.");
      }
      link = `${baseUrl}/reset-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`;
    }
    const safeLink = escapeHtml(link);

    const subject = sendSetPasswordLink
      ? `Acesso ao Portal do Fornecedor — ${orgName}`
      : `${orgName} deu-lhe acesso no Portal do Fornecedor`;
    const inner = sendSetPasswordLink
      ? `
        <h2 style="color: #333;">Ol&aacute;${safeName ? `, ${safeName}` : ""}!</h2>
        <p><strong>${safeOrgName}</strong> convidou-o para o Portal do Fornecedor da Olyvia,
        onde pode gerir o seu cat&aacute;logo de artigos.</p>
        <p>Para entrar, defina a sua password no bot&atilde;o abaixo:</p>
        <p style="margin: 24px 0;">
          <a href="${safeLink}" style="background: #2563eb; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">Definir password</a>
        </p>
        <p style="color: #666; font-size: 14px;">O link s&oacute; pode ser usado uma vez e expira ao fim de pouco tempo.
        Se expirar, pe&ccedil;a a ${safeOrgName} que lhe envie um novo.</p>
        <p style="color: #666; font-size: 13px;">Depois de definir a password, entre sempre em
        <a href="${escapeHtml(baseUrl)}/auth" style="color: #2563eb;">${escapeHtml(baseUrl)}/auth</a> com o email ${escapeHtml(email)}.</p>`
      : `
        <h2 style="color: #333;">Ol&aacute;${safeName ? `, ${safeName}` : ""}!</h2>
        <p><strong>${safeOrgName}</strong> deu-lhe acesso no Portal do Fornecedor da Olyvia.</p>
        <p>Entre com o email e a password que j&aacute; usa no portal:
        <a href="${safeLink}" style="color: #2563eb;">${safeLink}</a></p>
        <p style="color: #666; font-size: 14px;">Se n&atilde;o se lembra da password, use "Esqueci-me da password" no ecr&atilde; de entrada.</p>`;

    // ── Email (SMTP da organização / de quem envia) ──────────────────────
    const resolvedSmtp = await resolveSmtpForAuthenticatedUser(supabase, {
      authUserId: caller.id,
      organizationId: input.organization_id,
    });
    const okMessage = input.action === "invite" ? "Convite enviado" : "Link reenviado";

    if (!resolvedSmtp) {
      console.warn("[create-supplier-portal-access] sem SMTP", { organization_id: input.organization_id });
      return json(200, {
        success: true,
        message: `Acesso registado, mas o email não foi enviado. ${smtpNotFoundMessage()}`,
        smtp_status: "not_found",
        smtp_warning: true,
      }, corsHeaders);
    }

    try {
      await sendEmailViaSMTP(resolvedSmtp.smtp, { to: email, subject, html: emailLayout(inner, safeOrgName) });
    } catch (smtpErr) {
      const safe = sanitizeSmtpError(smtpErr);
      console.error("[create-supplier-portal-access] envio SMTP falhou", { ...resolvedSmtp.metadata, error: safe });
      return json(200, {
        success: true,
        message: "Acesso registado, mas o email não foi enviado (erro SMTP). Tente reenviar.",
        smtp_status: "send_failed",
        smtp_warning: true,
        smtp_error_safe: safe,
      }, corsHeaders);
    }

    return json(200, { success: true, message: okMessage, smtp_status: "sent" }, corsHeaders);
  } catch (err) {
    if (createdAuthUserId && supabase) {
      await deleteCreatedAuthUserIfUnlinked(supabase, createdAuthUserId);
    }
    console.error("[create-supplier-portal-access] erro:", sanitizeSmtpError(err));
    await captureError(err, { function: "create-supplier-portal-access" });
    return json(500, { error: "internal_error", message: "Erro interno. Tente novamente." }, corsHeaders);
  }
});
