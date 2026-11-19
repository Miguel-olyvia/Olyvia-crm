// Emails por omissao da confirmacao, do aviso ao comercial, do cancelamento e do reagendamento,
// por idioma. Puro: sem rede, sem Deno. Antes vivia escrito dentro de book-slot, cancel-booking e
// reschedule-booking; o portugues sai IDENTICO (golden em __tests__/fixtures) e o ingles so entra
// quando o destinatario e o CLIENTE e o idioma dele e `en`. O comercial recebe sempre portugues.
//
// Um modelo escolhido manda sempre: corpo e assunto vem dele. Sem modelo, texto por omissao do idioma.

import { defaultMeetingHtml, renderHtml, renderSubject } from "./formEmails.ts";
import { MAIL_TEXTS, mailLangFor } from "./emailDefaults.ts";
import type { MailAudience } from "./emailDefaults.ts";

export interface MailTemplate {
  subject: string;
  body_html: string;
}

export interface BuiltMail {
  subject: string;
  html: string;
}

/** Marca e dados comuns do desenho por omissao. */
interface Brand {
  primaryColor?: string | null;
  logoUrl?: string | null;
}

export interface BookingConfirmationParams extends Brand {
  /** Modelo escolhido para o idioma (pickTemplateId); null = texto por omissao. */
  template: MailTemplate | null;
  vars: Record<string, string>;
  /** Idioma da pessoa (anew_leads.locale ou lang do pedido). */
  lang?: string | null;
  leadName: string;
  when: string;
  location?: string;
  technicianName?: string;
  cancelUrl?: string;
}

/** Confirmacao da visita ao cliente (book-slot). O assunto vem do modelo, senao o por omissao do idioma. */
export function buildBookingConfirmationMail(p: BookingConfirmationParams): BuiltMail {
  const lang = mailLangFor("client", p.lang);
  const t = MAIL_TEXTS[lang].bookingConfirmation;
  const html = p.template?.body_html
    ? renderHtml(p.template.body_html, p.vars)
    : defaultMeetingHtml({
      audience: "client",
      lang,
      heading: t.heading,
      intro: t.intro,
      leadName: p.leadName,
      when: p.when,
      location: p.location,
      technicianName: p.technicianName,
      cancelUrl: p.cancelUrl,
      primaryColor: p.primaryColor,
      logoUrl: p.logoUrl,
    });
  return { subject: renderSubject(p.template?.subject || t.subject, p.vars), html };
}

export interface MeetingNotifyParams extends Brand {
  template: MailTemplate | null;
  /** Variaveis ja com os dados do comercial (buildAudienceVars). */
  vars: Record<string, string>;
  /** Ignorado: o aviso ao comercial e interno e sai sempre em portugues. */
  lang?: string | null;
  leadName: string;
  leadPhone?: string;
  leadEmail?: string;
  address?: string;
  appointmentUrl?: string;
  when: string;
  location?: string;
  technicianName?: string;
}

/** Aviso de nova reuniao ao comercial (book-slot). Interno: sempre em portugues. */
export function buildMeetingNotifyMail(p: MeetingNotifyParams): BuiltMail {
  const lang = mailLangFor("technician", p.lang);
  const t = MAIL_TEXTS[lang].meetingNotify;
  const html = p.template?.body_html
    ? renderHtml(p.template.body_html, p.vars)
    : defaultMeetingHtml({
      audience: "technician",
      lang,
      leadPhone: p.leadPhone,
      leadEmail: p.leadEmail,
      address: p.address,
      appointmentUrl: p.appointmentUrl,
      heading: t.heading,
      intro: t.intro,
      leadName: p.leadName,
      when: p.when,
      location: p.location,
      technicianName: p.technicianName,
      // Sem cancelUrl de proposito: e o link de autogestao do CLIENTE, nao uma acao do comercial.
      primaryColor: p.primaryColor,
      logoUrl: p.logoUrl,
    });
  return { subject: renderSubject(p.template?.subject || t.subject, p.vars), html };
}

export interface LifecycleMailParams extends Brand {
  kind: MailAudience;
  /** Modelo proprio do destinatario (cancel_/reschedule_ client/technician); null = por omissao. */
  template: MailTemplate | null;
  /** Variaveis ja por destinatario (buildAudienceVars). */
  vars: Record<string, string>;
  /** Idioma da pessoa; so o cliente o segue. */
  lang?: string | null;
  leadName: string;
  leadPhone?: string;
  leadEmail?: string;
  address?: string;
  appointmentUrl?: string;
  when: string;
  location?: string;
  technicianName?: string;
  /** Link de gerir do cliente (so o reagendamento o mostra no texto por omissao). */
  cancelUrl?: string;
}

function lifecycleMail(event: "cancel" | "reschedule", p: LifecycleMailParams): BuiltMail {
  const lang = mailLangFor(p.kind, p.lang);
  const t = MAIL_TEXTS[lang][event];
  const client = p.kind === "client";
  const defaultSubject = client ? t.clientSubject : t.technicianSubject;
  if (p.template?.body_html) {
    return {
      subject: renderSubject(p.template.subject || defaultSubject, p.vars),
      html: renderHtml(p.template.body_html, p.vars),
    };
  }
  return {
    subject: renderSubject(defaultSubject, p.vars),
    html: defaultMeetingHtml({
      audience: p.kind,
      lang,
      leadPhone: client ? undefined : (p.leadPhone || undefined),
      leadEmail: client ? undefined : (p.leadEmail || undefined),
      address: client ? undefined : (p.address || undefined),
      appointmentUrl: client ? undefined : p.appointmentUrl,
      heading: t.heading,
      intro: client ? t.clientIntro : t.technicianIntro,
      leadName: p.leadName,
      when: p.when,
      location: p.location,
      technicianName: p.technicianName,
      cancelUrl: event === "reschedule" && client ? (p.cancelUrl || undefined) : undefined,
      primaryColor: p.primaryColor,
      logoUrl: p.logoUrl,
    }),
  };
}

/** Aviso de cancelamento (cancel-booking). O texto por omissao nunca leva o link de gerir. */
export function buildCancelMail(p: LifecycleMailParams): BuiltMail {
  return lifecycleMail("cancel", p);
}

/** Aviso de reagendamento (reschedule-booking). */
export function buildRescheduleMail(p: LifecycleMailParams): BuiltMail {
  return lifecycleMail("reschedule", p);
}
