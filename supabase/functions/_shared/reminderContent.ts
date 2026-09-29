// Assunto e corpo de um lembrete de visita, por destinatario. Puro: sem rede,
// sem Deno. E usado na marcacao (book-slot), no reagendamento pelo link
// (reschedule-booking) e no envio (processadores), para o texto ser sempre o
// mesmo e para, no envio, a hora e o comercial serem os ACTUAIS da visita.

import { defaultMeetingHtml, renderHtml, renderSubject } from "./formEmails.ts";
import type { Audience } from "./audienceTemplates.ts";

/** Assunto por omissao, um por destinatario: o comercial nunca recebe o texto do cliente. */
export const DEFAULT_REMINDER_SUBJECT_CLIENT = "Lembrete da sua visita — {{meeting_date}}";
export const DEFAULT_REMINDER_SUBJECT_TECHNICIAN = "Lembrete: visita a {{lead_name}} — {{meeting_date}}";

/** Data/hora de uma visita, como aparece nos emails e SMS (fuso de Lisboa). */
export function formatVisitWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
}): { subject: string; html: string } {
  const { audience, template, vars, brand } = opts;
  const isClient = audience === "client";
  const defaultSubject = isClient ? DEFAULT_REMINDER_SUBJECT_CLIENT : DEFAULT_REMINDER_SUBJECT_TECHNICIAN;
  const subject = renderSubject(template?.subject || defaultSubject, vars);
  if (template?.body_html) {
    return { subject, html: renderHtml(template.body_html, vars) };
  }
  return {
    subject,
    html: defaultMeetingHtml({
      audience,
      heading: isClient ? "Lembrete da sua visita" : "Lembrete de visita",
      intro: isClient
        ? "Este é um lembrete da sua visita agendada."
        : "Lembrete: tem uma visita agendada com a lead abaixo.",
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

/** Variaveis guardadas na linha, com a hora, o local e o comercial ACTUAIS da visita. */
export function withFreshVisitVars(
  stored: Record<string, string>,
  fresh: { startIso: string; location?: string | null; technicianName?: string | null },
): Record<string, string> {
  const when = formatVisitWhen(fresh.startIso);
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
}): string {
  let text = `${opts.companyName || "A empresa"}: lembrete da sua visita${opts.rescheduled ? " reagendada" : ""} para {{meeting_date}}.`;
  if (opts.withConfirmLink) text += " Confirme: {{confirm_url}}";
  if (opts.withManageLink) text += " Gerir: {{cancel_url}}";
  return text;
}
