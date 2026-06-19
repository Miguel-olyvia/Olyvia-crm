import nodemailer from "npm:nodemailer@6.9.14";

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export type SmtpSource = "user" | "organization";
export type ScheduledSmtpResolutionMode =
  | "auth_user_id_direct"
  | "anew_user_id_fallback"
  | "organization_fallback"
  | "not_found";

export interface ResolvedSmtp {
  smtp: any;
  source: SmtpSource;
  metadata: Record<string, unknown>;
}

export interface ResolvedScheduledSmtp extends ResolvedSmtp {
  resolution_mode: ScheduledSmtpResolutionMode;
}

const SMTP_NOT_FOUND_MESSAGE = "Nenhum SMTP ativo encontrado para o utilizador nem para a organização.";

export function smtpNotFoundMessage(): string {
  return SMTP_NOT_FOUND_MESSAGE;
}

export function sanitizeSmtpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const redacted = raw
    .replace(/(password|passwd|pass|token|secret|apikey|api_key|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._\-]+/g, "[redacted-token]");

  const lower = redacted.toLowerCase();
  if (lower.includes("basic authentication is disabled") || lower.includes("smtpclientauthentication") || lower.includes("5.7.139")) {
    return "O Outlook/Microsoft bloqueou a autenticação SMTP básica. Ative SMTP AUTH para a conta ou use uma app password/palavra-passe de aplicação.";
  }
  if (lower.includes("auth") || lower.includes("login") || lower.includes("credential") || lower.includes("535") || lower.includes("534")) {
    return "Autenticação SMTP falhou. Verifique o utilizador, password/app password e permissões da conta.";
  }
  if (lower.includes("sender") || lower.includes("from") || lower.includes("not allowed") || lower.includes("unauthorized") || lower.includes("550") || lower.includes("553")) {
    return "Remetente SMTP não autorizado. Verifique se o email remetente está permitido pelo servidor SMTP.";
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("timed out")) {
    return "Timeout ao contactar o servidor SMTP. Verifique host, porta e firewall.";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("eai_again") || lower.includes("host") || lower.includes("port")) {
    return "Host ou porta SMTP inválidos/inacessíveis. Verifique a configuração do servidor.";
  }
  return redacted ? `Erro SMTP ao enviar email: ${redacted.slice(0, 240)}` : "Erro SMTP ao enviar email.";
}

export function safeSmtpMetadata(smtp: any, source: SmtpSource, extra: Record<string, unknown> = {}) {
  return {
    source,
    smtp_id: smtp?.id ?? null,
    host: smtp?.smtp_host ?? smtp?.host ?? null,
    from_email: smtp?.from_email ?? null,
    organization_id: smtp?.organization_id ?? extra.organization_id ?? null,
    auth_user_id: extra.auth_user_id ?? null,
  };
}

async function getActiveUserSmtp(supabase: any, authUserId?: string | null, organizationId?: string | null) {
  if (!authUserId) return null;
  let query = supabase
    .from("user_smtp_settings")
    .select("*")
    .eq("user_id", authUserId)
    .eq("is_active", true);

  const { data, error } = await query;
  if (error) return null;
  const rows = data || [];
  if (rows.length === 0) return null;

  return rows.sort((a: any, b: any) => {
    const aOrg = organizationId && a.organization_id === organizationId ? 1 : 0;
    const bOrg = organizationId && b.organization_id === organizationId ? 1 : 0;
    if (aOrg !== bOrg) return bOrg - aOrg;
    const aGlobal = !a.organization_id ? 1 : 0;
    const bGlobal = !b.organization_id ? 1 : 0;
    if (aGlobal !== bGlobal) return bGlobal - aGlobal;
    return Number(!!b.is_default) - Number(!!a.is_default);
  })[0];
}

export async function resolveOrganizationSmtp(supabase: any, organizationId?: string | null): Promise<ResolvedSmtp | null> {
  if (!organizationId) return null;
  const { data } = await supabase
    .from("organization_smtp_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { smtp: data, source: "organization", metadata: safeSmtpMetadata(data, "organization", { organization_id: organizationId }) };
}

export async function resolveSmtpForAuthenticatedUser(
  supabase: any,
  options: { authUserId?: string | null; organizationId?: string | null; smtpId?: string | null }
): Promise<ResolvedSmtp | null> {
  const { authUserId, organizationId, smtpId } = options;

  if (smtpId) {
    const { data: userSmtp } = await supabase.from("user_smtp_settings").select("*").eq("id", smtpId).eq("is_active", true).maybeSingle();
    if (userSmtp && (!authUserId || userSmtp.user_id === authUserId)) {
      return { smtp: userSmtp, source: "user", metadata: safeSmtpMetadata(userSmtp, "user", { auth_user_id: authUserId, organization_id: organizationId }) };
    }
    const { data: orgSmtp } = await supabase.from("organization_smtp_settings").select("*").eq("id", smtpId).eq("is_active", true).maybeSingle();
    if (orgSmtp) {
      return { smtp: orgSmtp, source: "organization", metadata: safeSmtpMetadata(orgSmtp, "organization", { organization_id: organizationId }) };
    }
  }

  const userSmtp = await getActiveUserSmtp(supabase, authUserId, organizationId);
  if (userSmtp) {
    return { smtp: userSmtp, source: "user", metadata: safeSmtpMetadata(userSmtp, "user", { auth_user_id: authUserId, organization_id: organizationId }) };
  }

  return await resolveOrganizationSmtp(supabase, organizationId);
}

export async function resolveSmtpForScheduledEmail(
  supabase: any,
  options: { scheduledUserId?: string | null; organizationId?: string | null }
): Promise<ResolvedScheduledSmtp | null> {
  const { scheduledUserId, organizationId } = options;

  if (scheduledUserId) {
    const directUserSmtp = await getActiveUserSmtp(supabase, scheduledUserId, organizationId);
    if (directUserSmtp) {
      return {
        smtp: directUserSmtp,
        source: "user",
        resolution_mode: "auth_user_id_direct",
        metadata: safeSmtpMetadata(directUserSmtp, "user", { auth_user_id: scheduledUserId, organization_id: organizationId }),
      };
    }

    const { data: anewUser } = await supabase
      .from("anew_users")
      .select("auth_user_id")
      .eq("id", scheduledUserId)
      .maybeSingle();

    if (anewUser?.auth_user_id) {
      const fallbackUserSmtp = await getActiveUserSmtp(supabase, anewUser.auth_user_id, organizationId);
      if (fallbackUserSmtp) {
        return {
          smtp: fallbackUserSmtp,
          source: "user",
          resolution_mode: "anew_user_id_fallback",
          metadata: safeSmtpMetadata(fallbackUserSmtp, "user", { auth_user_id: anewUser.auth_user_id, organization_id: organizationId }),
        };
      }
    }
  }

  const orgSmtp = await resolveOrganizationSmtp(supabase, organizationId);
  if (orgSmtp) return { ...orgSmtp, resolution_mode: "organization_fallback" };
  return null;
}

export async function sendEmailViaSMTP(
  smtpConfig: any,
  payload: { to: string | string[]; cc?: string | string[]; subject: string; html: string; text?: string; attachments?: EmailAttachment[] }
) {
  const host = smtpConfig.smtp_host || smtpConfig.host;
  const port = smtpConfig.smtp_port || smtpConfig.port || 587;
  const user = smtpConfig.smtp_username || smtpConfig.username;
  const pass = smtpConfig.smtp_password || smtpConfig.password;
  const secure = smtpConfig.smtp_secure ?? smtpConfig.secure ?? false;
  const fromEmail = smtpConfig.from_email || user || (Array.isArray(payload.to) ? payload.to[0] : payload.to);
  const fromName = smtpConfig.from_name || "Olyvia";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465 ? true : port === 587 ? false : secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  });

  const mailOptions: any = {
    from: `${fromName} <${fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.text || "",
    html: payload.html,
  };
  if (payload.cc && (Array.isArray(payload.cc) ? payload.cc.length : payload.cc.trim())) {
    mailOptions.cc = payload.cc;
  }

  if (payload.attachments?.length) {
    mailOptions.attachments = payload.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
      encoding: "base64",
      contentType: att.contentType || "application/pdf",
    }));
  }

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId || `${Date.now()}@${host}` };
}
