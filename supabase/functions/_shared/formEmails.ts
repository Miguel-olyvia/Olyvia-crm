// Shared helpers for per-form transactional emails:
//  - confirmation email to the client on submit
//  - meeting notification to the assigned commercial + extra emails
//  - reminder email X hours before the meeting (technician + client)
//
// Config lives on form_branding (see migration 20260726120000). Emails are
// delivered via the send-email edge function, which resolves the organization's
// SMTP. All helpers are fail-soft — callers should wrap in try/catch and never
// let an email failure break the booking/lead flow.

export interface FormEmailConfig {
  confirmation_email_enabled: boolean;
  confirmation_email_template_id: string | null;
  meeting_notify_commercial: boolean;
  meeting_notify_emails: string | null;
  meeting_notify_template_id: string | null;
  reminder_enabled: boolean;
  reminder_hours_before: number | null;
  reminder_template_id: string | null;
  // Per-locale template overrides: { confirmation: {pt,en}, meeting_notify:{}, reminder:{} }
  email_locale_templates: Record<string, Record<string, string>> | null;
  // "manage booking" URL with a {lang} placeholder, e.g. https://www.mudelar.pt/{lang}/updateagenda
  booking_manage_url_template: string | null;
  // Which organization SMTP this form's emails go through (null = org default).
  email_smtp_id: string | null;
  // Public URL where THIS form is served, with a {lang} placeholder — e.g.
  // https://www.mudelar.pt/{lang}/orcamento . Used to build the "finish scheduling" resume
  // link. When null, falls back to PUBLIC_FORM_BASE_URL env (or olyvia-ai.com)/form/{form_id}.
  public_form_url_template: string | null;
  // "Finish scheduling" recovery nudges: master switch + when to send each one (hours after
  // the lead was created; one element per email, e.g. [24] or [72,168,336]).
  scheduling_invite_enabled: boolean;
  scheduling_invite_delays_hours: number[] | null;
}

export type EmailPurpose = "confirmation" | "meeting_notify" | "reminder";

/** Normalize a locale to its short form ("pt-PT" -> "pt"). */
export function shortLocale(locale?: string | null): string | null {
  if (!locale) return null;
  const l = locale.toLowerCase().trim();
  return l.split(/[-_]/)[0] || null;
}

/**
 * Pick the template id for a purpose in the given locale, falling back to the
 * short locale, then to the single default *_template_id column.
 */
export function pickTemplateId(
  cfg: FormEmailConfig | null,
  purpose: EmailPurpose,
  locale: string | null | undefined,
  fallbackId: string | null | undefined,
): string | null {
  const map = cfg?.email_locale_templates?.[purpose] || null;
  if (map && locale) {
    const l = locale.toLowerCase().trim();
    if (map[l]) return map[l];
    const s = shortLocale(l);
    if (s && map[s]) return map[s];
  }
  return fallbackId || null;
}

/**
 * Build the "manage booking" link. Uses the per-form URL template (substituting
 * {lang}) when set, otherwise falls back to <base>/booking/manage.
 */
export function buildManageUrl(
  template: string | null | undefined,
  lang: string | null | undefined,
  token: string,
  fallbackBase: string,
): string {
  const l = shortLocale(lang) || "pt";
  if (template && template.trim()) {
    const url = template.replace(/\{lang\}/g, l);
    return url.includes("?") ? `${url}&token=${token}` : `${url}?token=${token}`;
  }
  return `${fallbackBase}/booking/manage?token=${token}`;
}

/**
 * Build the "finish scheduling" resume link. Uses the per-form public URL template
 * (substituting {lang} and {form_id}) when set, appending ?resume=<token>; otherwise
 * falls back to <base>/form/<form_id>?resume=<token>.
 */
export function buildResumeUrl(
  template: string | null | undefined,
  lang: string | null | undefined,
  token: string,
  formId: string,
  fallbackBase: string,
): string {
  const l = shortLocale(lang) || "pt";
  if (template && template.trim()) {
    const url = template
      .replace(/\{lang\}/g, l)
      .replace(/\{form_id\}/g, formId);
    return url.includes("?") ? `${url}&resume=${token}` : `${url}?resume=${token}`;
  }
  return `${fallbackBase.replace(/\/+$/, "")}/form/${formId}?resume=${token}`;
}

/** Replace {{key}} placeholders with values (unknown keys are left intact). */
export function replaceVars(text: string, data: Record<string, string>): string {
  if (!text) return text || "";
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (data[k] != null ? data[k] : m));
}

/** HTML-escape a value so user input can't inject markup/scripts into email bodies. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse a value to a single line for safe use in an email subject (prevents header injection). */
export function oneLine(s: unknown): string {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 300);
}

function mapValues(data: Record<string, string>, fn: (v: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(data || {})) out[k] = fn(data[k]);
  return out;
}

/** Render an HTML body template, HTML-escaping every substituted user value. */
export function renderHtml(template: string, data: Record<string, string>): string {
  return replaceVars(template, mapValues(data, escapeHtml));
}

/** Render a subject template, stripping newlines from every substituted value. */
export function renderSubject(template: string, data: Record<string, string>): string {
  return oneLine(replaceVars(template, mapValues(data, oneLine)));
}

/** Split a comma/semicolon/newline separated list into valid emails. */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Dedupe emails, dropping falsy entries. */
export function uniqueEmails(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const e of emails) {
    const v = (e || "").trim().toLowerCase();
    if (v && v.includes("@")) seen.add(v);
  }
  return [...seen];
}

export async function loadFormEmailConfig(
  supabase: any,
  formId: string | null | undefined,
): Promise<FormEmailConfig | null> {
  if (!formId) return null;
  const { data } = await supabase
    .from("form_branding")
    .select(
      "confirmation_email_enabled, confirmation_email_template_id, meeting_notify_commercial, meeting_notify_emails, meeting_notify_template_id, reminder_enabled, reminder_hours_before, reminder_template_id, email_locale_templates, booking_manage_url_template, email_smtp_id, public_form_url_template, scheduling_invite_enabled, scheduling_invite_delays_hours",
    )
    .eq("form_id", formId)
    .maybeSingle();
  return (data as FormEmailConfig) || null;
}

export async function loadTemplate(
  supabase: any,
  templateId: string | null | undefined,
): Promise<{ subject: string; body_html: string } | null> {
  if (!templateId) return null;
  const { data } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("id", templateId)
    .maybeSingle();
  return data ? { subject: data.subject || "", body_html: data.body_html || "" } : null;
}

/** Send an email immediately via the send-email edge function (org SMTP). */
export async function sendEmailNow(params: {
  organizationId: string;
  userId?: string | null;
  smtpId?: string | null;
  to: string;
  recipients?: string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        organization_id: params.organizationId,
        // Only include user_id when we have a real user; otherwise send-email
        // resolves the organization's default SMTP (correct for public forms).
        ...(params.userId ? { user_id: params.userId } : {}),
        // A form-chosen SMTP always wins in send-email.
        ...(params.smtpId ? { smtp_id: params.smtpId } : {}),
        to: params.to,
        recipients: params.recipients,
        subject: params.subject,
        html: params.html,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (result?.error) {
      console.error("[formEmails] send-email returned error:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[formEmails] sendEmailNow failed:", err);
    return false;
  }
}

/**
 * Insert a scheduled email row using the CANONICAL scheduled_emails shape
 * (to_email + user_id + body_html), so process-scheduled-emails can deliver it.
 */
export async function scheduleEmail(
  supabase: any,
  row: {
    organizationId: string;
    userId: string;
    toEmail: string;
    subject: string;
    bodyHtml: string;
    scheduledFor: string; // ISO
    entityType?: string;
    entityId?: string;
    templateId?: string | null;
    smtpId?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("scheduled_emails").insert({
      template_id: row.templateId || null,
      entity_type: row.entityType || "leads",
      entity_id: row.entityId,
      to_email: row.toEmail,
      subject: row.subject,
      body_html: row.bodyHtml,
      user_id: row.userId,
      organization_id: row.organizationId,
      scheduled_for: row.scheduledFor,
      status: "pending",
      smtp_id: row.smtpId || null,
    });
  } catch (err) {
    console.error("[formEmails] scheduleEmail failed:", err);
  }
}

/**
 * HTML for the "finish booking your visit" invite sent to a lead who completed a
 * scheduling form but didn't pick a slot. The CTA links to a secure resume URL that
 * reopens the form at the scheduling step for their existing lead.
 */
export function defaultSchedulingInviteHtml(opts: {
  leadName: string;
  companyName?: string;
  resumeUrl: string;
  ctaLabel?: string;
  unsubscribeUrl?: string;
}): string {
  const hi = opts.leadName ? `Olá ${escapeHtml(opts.leadName)},` : "Olá,";
  const cta = escapeHtml(opts.ctaLabel || "Agendar a minha visita");
  const from = opts.companyName ? ` — ${escapeHtml(opts.companyName)}` : "";
  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:6px 0 0;color:#9ca3af;font-size:12px">
         <a href="${encodeURI(opts.unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline">Já não quero receber estes lembretes</a>
       </p>`
    : "";
  return `
  <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1F2937">
    <h2 style="margin:0 0 8px">Falta só agendar a sua visita${from}</h2>
    <p style="margin:0 0 12px;color:#4b5563">${hi}</p>
    <p style="margin:0 0 16px;color:#4b5563">
      Recebemos o seu pedido de orçamento, mas ainda falta escolher a data da sua
      <strong>visita técnica gratuita</strong>. É rápido — escolha o horário que lhe der mais jeito:
    </p>
    <p style="margin:24px 0">
      <a href="${encodeURI(opts.resumeUrl)}"
         style="display:inline-block;background:#85D3BE;color:#ffffff;text-decoration:none;
                padding:12px 22px;border-radius:10px;font-weight:600">${cta}</a>
    </p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:13px">
      Se já agendou ou não pretende avançar, pode ignorar este email.
    </p>
    ${unsub}
  </div>`;
}

/** A neutral, branded-enough default HTML for meeting notifications/reminders. */
export function defaultMeetingHtml(opts: {
  heading: string;
  intro: string;
  leadName: string;
  when: string;
  location?: string;
  technicianName?: string;
  cancelUrl?: string;
}): string {
  const rows: string[] = [];
  rows.push(`<tr><td style="padding:4px 0;color:#6b7280">Cliente</td><td style="padding:4px 0;font-weight:600">${escapeHtml(opts.leadName || "-")}</td></tr>`);
  rows.push(`<tr><td style="padding:4px 0;color:#6b7280">Data / hora</td><td style="padding:4px 0;font-weight:600">${escapeHtml(opts.when || "-")}</td></tr>`);
  if (opts.location) rows.push(`<tr><td style="padding:4px 0;color:#6b7280">Local</td><td style="padding:4px 0;font-weight:600">${escapeHtml(opts.location)}</td></tr>`);
  if (opts.technicianName) rows.push(`<tr><td style="padding:4px 0;color:#6b7280">Técnico</td><td style="padding:4px 0;font-weight:600">${escapeHtml(opts.technicianName)}</td></tr>`);
  // cancelUrl is a system-built URL (buildManageUrl), not free user text — safe as href.
  const cancel = opts.cancelUrl
    ? `<p style="margin:20px 0 0"><a href="${encodeURI(opts.cancelUrl)}" style="color:#85D3BE">Gerir / cancelar agendamento</a></p>`
    : "";
  return `
  <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1F2937">
    <h2 style="margin:0 0 8px">${escapeHtml(opts.heading)}</h2>
    <p style="margin:0 0 16px;color:#4b5563">${escapeHtml(opts.intro)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join("")}</table>
    ${cancel}
  </div>`;
}
