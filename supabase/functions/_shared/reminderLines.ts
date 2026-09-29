// Cria os lembretes de UMA visita (email ao cliente, email a cada comercial,
// SMS ao cliente), ligados a visita para o processador os acertar quando a
// visita mudar (reminderRunner.ts). Partilhado por book-slot (marcacao) e
// reschedule-booking (reagendamento sem lembretes ligados).

import { loadTemplate, scheduleEmail } from "./formEmails.ts";
import type { FormEmailConfig } from "./formEmails.ts";
import { scheduleSms } from "./sendSms.ts";
import { buildAudienceVars, pickAudienceTemplateId } from "./audienceTemplates.ts";
import type { Audience } from "./audienceTemplates.ts";
import { buildReminderMail, reminderSmsTemplate } from "./reminderContent.ts";
import { pickReminderSender } from "./reminderSender.ts";
import { reminderRuleFor } from "./reminderRule.ts";

export interface ReminderTechnician {
  email: string;
  /** anew_users.id (schedule_resources.user_id). */
  userId: string | null;
  name: string;
}

export interface CreateReminderLinesParams {
  supabase: any;
  organizationId: string;
  itemId: string;
  formId: string | null;
  locale: string | null;
  cfg: FormEmailConfig;
  startIso: string;
  entityType: "leads" | "clients";
  entityId: string | null;
  createdBy: string;
  companyName: string;
  /** Variaveis do cliente: nome, contactos, local, data, comercial, cancel_url (link de gerir). */
  clientVars: Record<string, string>;
  /** Link "Confirmo a visita" (vazio se nao houver). */
  confirmUrl: string;
  leadEmail: string;
  leadPhone: string;
  address: string;
  appointmentUrl: string;
  technicians: ReminderTechnician[];
  rescheduled: boolean;
  now?: Date;
}

export interface CreateReminderLinesResult {
  emails: number;
  sms: number;
  skipped?: string;
}

export async function createReminderLines(p: CreateReminderLinesParams): Promise<CreateReminderLinesResult> {
  const { cfg } = p;
  // Regra por destinatario (reminderRule.ts): cada um tem o seu interruptor e as
  // suas horas; o comercial sem valor proprio segue o cliente.
  const clientRule = reminderRuleFor(cfg, "client");
  const technicianRule = reminderRuleFor(cfg, "technician");
  if (!clientRule.enabled && !technicianRule.enabled) {
    return { emails: 0, sms: 0, skipped: "lembrete desligado no formulario" };
  }
  if (!p.entityId) return { emails: 0, sms: 0, skipped: "sem entidade" };

  const nowMs = (p.now ?? new Date()).getTime();
  const startMs = new Date(p.startIso).getTime();
  /** Quando sai o lembrete deste destinatario, ou null se desligado ou ja nao vai a tempo. */
  const remindAtFor = (rule: { enabled: boolean; hoursBefore: number }): string | null => {
    if (!rule.enabled) return null;
    const at = startMs - rule.hoursBefore * 3_600_000;
    return at > nowMs ? new Date(at).toISOString() : null;
  };
  const clientRemindAt = remindAtFor(clientRule);
  const technicianRemindAt = remindAtFor(technicianRule);
  if (!clientRemindAt && !technicianRemindAt) {
    return { emails: 0, sms: 0, skipped: "a hora do lembrete ja passou" };
  }

  // Identidade: o lembrete ao comercial usa o comercial desta visita; o do
  // cliente usa o SMTP do formulario (ou o por omissao da organizacao) e nunca
  // uma identidade pessoal ao acaso (ver reminderSender.ts).
  let orgDefaultSmtpId: string | null = null;
  if (!cfg.email_smtp_id) {
    const { data: orgSmtp } = await p.supabase
      .from("organization_smtp_settings")
      .select("id")
      .eq("organization_id", p.organizationId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    orgDefaultSmtpId = orgSmtp?.id ?? null;
  }

  const templateCache = new Map<Audience, Awaited<ReturnType<typeof loadTemplate>>>();
  const templateFor = async (audience: Audience) => {
    if (!templateCache.has(audience)) {
      const id = pickAudienceTemplateId(cfg, "reminder", audience, p.locale);
      templateCache.set(audience, id ? await loadTemplate(p.supabase, id) : null);
    }
    return templateCache.get(audience) ?? null;
  };

  const targets: { audience: Audience; email: string; tech: ReminderTechnician | null }[] = [];
  if (p.leadEmail && clientRemindAt) targets.push({ audience: "client", email: p.leadEmail, tech: null });
  const seenTech = new Set<string>();
  for (const t of technicianRemindAt ? p.technicians : []) {
    const email = (t.email || "").trim().toLowerCase();
    if (!email || seenTech.has(email)) continue;
    seenTech.add(email);
    targets.push({ audience: "technician", email, tech: t });
  }

  let emails = 0;
  for (const t of targets) {
    const vars = buildAudienceVars(
      { ...p.clientVars, ...(t.tech ? { technician_name: t.tech.name } : {}) },
      t.audience,
      {
        cancelUrl: p.clientVars.cancel_url,
        confirmUrl: p.confirmUrl,
        leadPhone: p.leadPhone,
        leadEmail: p.leadEmail,
        address: p.address,
        appointmentUrl: p.appointmentUrl,
      },
    );
    const template = await templateFor(t.audience);
    const mail = buildReminderMail({ audience: t.audience, template, vars, brand: cfg });
    const sender = pickReminderSender({
      kind: t.audience,
      technicianUserId: t.tech?.userId,
      createdBy: p.createdBy,
      formSmtpId: cfg.email_smtp_id,
      orgDefaultSmtpId,
    });
    const res = await scheduleEmail(p.supabase, {
      organizationId: p.organizationId,
      userId: sender.userId,
      toEmail: t.email,
      subject: mail.subject,
      bodyHtml: mail.html,
      scheduledFor: (t.audience === "client" ? clientRemindAt : technicianRemindAt) as string,
      entityType: p.entityType,
      entityId: p.entityId,
      templateId: pickAudienceTemplateId(cfg, "reminder", t.audience, p.locale),
      smtpId: sender.smtpId,
      link: {
        scheduleItemId: p.itemId,
        audience: t.audience,
        formId: p.formId,
        locale: p.locale,
        visitStartSnapshot: new Date(p.startIso).toISOString(),
        contentVars: vars,
      },
    });
    if (res.ok) emails++;
  }

  // SMS so ao cliente (segue a regra do cliente): o comercial ja ve a agenda, e um SMS tem custo por envio.
  let sms = 0;
  if (cfg.reminder_sms_enabled && p.leadPhone && clientRemindAt) {
    const includeLink = cfg.confirmation_sms_include_link === true;
    const smsVars = {
      ...p.clientVars,
      cancel_url: includeLink ? p.clientVars.cancel_url ?? "" : "",
      confirm_url: includeLink ? p.confirmUrl : "",
    };
    const res = await scheduleSms(p.supabase, {
      organizationId: p.organizationId,
      createdBy: p.createdBy,
      toPhone: p.leadPhone,
      message: reminderSmsTemplate({
        companyName: p.companyName,
        rescheduled: p.rescheduled,
        withConfirmLink: includeLink && !p.rescheduled && !!p.confirmUrl,
        withManageLink: includeLink && p.rescheduled && !!p.clientVars.cancel_url,
      }),
      scheduledFor: clientRemindAt,
      entityType: p.entityType,
      entityId: p.entityId,
      link: {
        scheduleItemId: p.itemId,
        audience: "client",
        formId: p.formId,
        locale: p.locale,
        visitStartSnapshot: new Date(p.startIso).toISOString(),
        contentVars: smsVars,
      },
    });
    if (res.ok) sms++;
  }

  return { emails, sms };
}
