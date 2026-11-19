// Assunto e corpo de um lembrete de visita, por destinatario. Puro: sem rede,
// sem Deno. E usado na marcacao (book-slot), no reagendamento pelo link
// (reschedule-booking) e no envio (processadores), para o texto ser sempre o
// mesmo e para, no envio, a hora e o comercial serem os ACTUAIS da visita.
//
// Idioma: o CLIENTE recebe o texto por omissao no idioma dele (`lang`; so `en` tem versao inglesa,
// o resto e portugues, como sempre). O COMERCIAL recebe sempre portugues (aviso interno). Ver emailDefaults.ts.

import { defaultMeetingHtml, renderHtml, renderSubject } from "./formEmails.ts";
import { MAIL_TEXTS, formatVisitDate, mailLangFor, normalizeMailLang, reminderSmsText } from "./emailDefaults.ts";
import type { Audience } from "./audienceTemplates.ts";

/** Assunto por omissao, um por destinatario, em portugues: o comercial nunca recebe o texto do cliente. */
export const DEFAULT_REMINDER_SUBJECT_CLIENT = MAIL_TEXTS.pt.reminder.clientSubject;
export const DEFAULT_REMINDER_SUBJECT_TECHNICIAN = MAIL_TEXTS.pt.reminder.technicianSubject;

/**
 * Data/hora de uma visita, como aparece nos emails e SMS (fuso de Lisboa). Sem `lang` (ou pt, ou
 * desconhecido) e o texto de sempre; em `en` so as palavras mudam.
 */
export function formatVisitWhen(iso: string, lang?: string | null): string {
  return formatVisitDate(iso, lang, true);
}

export interface ReminderBrand {
  primary_color: string | null;
  logo_url: string | null;
}

export interface ReminderTemplate {
  subject: string;
  body_html: string;
}

export function buildReminderMail(opts: {
  audience: Audience;
  template: ReminderTemplate | null;
  vars: Record<string, string>;
  brand: ReminderBrand | null;
  /** Idioma da pessoa; so o cliente o segue. */
  lang?: string | null;
  /** Idioma do modelo usado (o por omissao do formulario se for o da coluna unica); so para o assunto por omissao. */
  templateLang?: string | null;
}): { subject: string; html: string } {
  const { audience, template, vars, brand } = opts;
  const isClient = audience === "client";
  const lang = mailLangFor(audience, opts.lang);
  const t = MAIL_TEXTS[lang].reminder;
  const tt = MAIL_TEXTS[mailLangFor(audience, opts.templateLang ?? opts.lang)].reminder;
  const defaultSubject = isClient ? t.clientSubject : t.technicianSubject;
  // Com modelo, um assunto em falta cai no por omissao do idioma do modelo; sem modelo, no da pessoa.
  const templateSubject = isClient ? tt.clientSubject : tt.technicianSubject;
  const subject = renderSubject(template?.subject || (template?.body_html ? templateSubject : defaultSubject), vars);
  if (template?.body_html) {
    return { subject, html: renderHtml(template.body_html, vars) };
  }
  return {
    subject,
    html: defaultMeetingHtml({
      audience,
      lang,
      heading: isClient ? t.clientHeading : t.technicianHeading,
      intro: isClient ? t.clientIntro : t.technicianIntro,
      leadName: vars.lead_name || "",
      leadPhone: isClient ? undefined : (vars.lead_phone || undefined),
      leadEmail: isClient ? undefined : (vars.lead_email || undefined),
      address: isClient ? undefined : (vars.address || undefined),
      appointmentUrl: isClient ? undefined : (vars.appointment_url || undefined),
      when: vars.meeting_date || "",
      location: vars.location || undefined,
      technicianName: isClient ? (vars.technician_name || undefined) : undefined,
      cancelUrl: isClient ? (vars.cancel_url || undefined) : undefined,
      confirmUrl: isClient ? (vars.confirm_url || undefined) : undefined,
      primaryColor: brand?.primary_color ?? null,
      logoUrl: brand?.logo_url ?? null,
    }),
  };
}

/**
 * Variaveis guardadas na linha, com a hora, o local e o comercial ACTUAIS da visita.
 * `lang`: idioma da data (so as palavras); sem ele, portugues como sempre.
 */
export function withFreshVisitVars(
  stored: Record<string, string>,
  fresh: { startIso: string; location?: string | null; technicianName?: string | null },
  lang?: string | null,
): Record<string, string> {
  const when = formatVisitWhen(fresh.startIso, lang);
  return {
    ...stored,
    meeting_date: when,
    meeting_datetime: when,
    location: fresh.location ?? stored.location ?? "",
    technician_name: fresh.technicianName ?? stored.technician_name ?? "",
  };
}

/** Le content_vars (jsonb) como mapa de strings; null se nao for um objecto. */
export function parseContentVars(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

/** Texto do SMS de lembrete (com {{variaveis}}) a guardar na linha; o envio renderiza-o. */
export function reminderSmsTemplate(opts: {
  companyName: string;
  rescheduled: boolean;
  /** Acrescenta " Confirme: {{confirm_url}}". */
  withConfirmLink: boolean;
  /** Acrescenta " Gerir: {{cancel_url}}". */
  withManageLink: boolean;
  /** Idioma do cliente; sem ele (ou desconhecido), portugues como sempre. */
  lang?: string | null;
}): string {
  return reminderSmsText(normalizeMailLang(opts.lang), opts);
}
