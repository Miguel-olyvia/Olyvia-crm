// Escolha do modelo de email e das variaveis por DESTINATARIO (cliente / comercial)
// para o lembrete, o reagendamento e o cancelamento. Puro: sem rede, sem Deno.
//
// Regras:
//  - O comercial NUNCA recebe cancel_url nem confirm_url (os links do cliente),
//    mesmo com um modelo personalizado: as variaveis ficam vazias.
//  - Quem nao configurar nenhum modelo cai no texto padrao (o chamador usa o
//    defaultMeetingHtml quando isto devolve null), ou seja, fica como hoje.

import { pickTemplateId } from "./formEmails.ts";
import type { EmailPurpose, FormEmailConfig } from "./formEmails.ts";

export type AudienceEvent = "reminder" | "reschedule" | "cancel";
export type Audience = "client" | "technician";

/** Purpose (chave em email_locale_templates) e coluna de cada destinatario/evento. */
function clientSlot(
  cfg: FormEmailConfig | null,
  event: AudienceEvent,
): { purpose: EmailPurpose; column: string | null } {
  switch (event) {
    case "reminder":
      return { purpose: "reminder", column: cfg?.reminder_template_id ?? null };
    case "reschedule":
      return { purpose: "reschedule_client", column: cfg?.reschedule_client_template_id ?? null };
    case "cancel":
      return { purpose: "cancel_client", column: cfg?.cancel_client_template_id ?? null };
  }
}

function technicianSlot(
  cfg: FormEmailConfig | null,
  event: AudienceEvent,
): { purpose: EmailPurpose; column: string | null } {
  switch (event) {
    case "reminder":
      return { purpose: "reminder_technician", column: cfg?.reminder_technician_template_id ?? null };
    case "reschedule":
      return { purpose: "reschedule_technician", column: cfg?.reschedule_technician_template_id ?? null };
    case "cancel":
      return { purpose: "cancel_technician", column: cfg?.cancel_technician_template_id ?? null };
  }
}

/** Coluna que existia antes deste desdobramento (o recurso final). */
function legacyColumn(cfg: FormEmailConfig | null, event: AudienceEvent): string | null {
  if (event === "reminder") return cfg?.reminder_template_id ?? null;
  if (event === "reschedule") return cfg?.meeting_notify_template_id ?? null;
  // Cancelamento: nenhuma. Um cancelamento nunca reutiliza o modelo de
  // "nova marcacao" (meeting_notify), que anuncia o contrario do que aconteceu.
  return null;
}

/**
 * Modelo a usar: o do destinatario -> (comercial) o do cliente -> a coluna
 * antiga do evento -> null (texto padrao). Cada degrau respeita o idioma
 * (email_locale_templates[purpose]).
 */
export function pickAudienceTemplateId(
  cfg: FormEmailConfig | null,
  event: AudienceEvent,
  audience: Audience,
  locale: string | null | undefined,
): string | null {
  if (audience === "technician") {
    const own = technicianSlot(cfg, event);
    const fromOwn = pickTemplateId(cfg, own.purpose, locale, own.column);
    if (fromOwn) return fromOwn;
  }
  const client = clientSlot(cfg, event);
  const fromClient = pickTemplateId(cfg, client.purpose, locale, client.column);
  if (fromClient) return fromClient;
  return legacyColumn(cfg, event);
}

export interface AudienceVarsExtra {
  /** Link de gerir/cancelar do cliente (so o cliente o recebe). */
  cancelUrl?: string | null;
  /** Link "Confirmo a visita" do cliente (so o cliente o recebe). */
  confirmUrl?: string | null;
  /** Dados da lead, so para o comercial. */
  leadPhone?: string | null;
  leadEmail?: string | null;
  /** Morada completa da visita, so para o comercial. */
  address?: string | null;
  /** Link para o calendario da app, so para o comercial. */
  appointmentUrl?: string | null;
}

/**
 * Variaveis do modelo por destinatario. Nunca muta baseVars.
 * Cliente: cancel_url e confirm_url. Comercial: lead_phone, lead_email, address
 * e appointment_url, e cancel_url/confirm_url sempre vazios.
 */
export function buildAudienceVars(
  baseVars: Record<string, string>,
  audience: Audience,
  extra: AudienceVarsExtra = {},
): Record<string, string> {
  if (audience === "client") {
    return {
      ...baseVars,
      cancel_url: extra.cancelUrl ?? baseVars.cancel_url ?? "",
      confirm_url: extra.confirmUrl ?? baseVars.confirm_url ?? "",
      appointment_url: "",
    };
  }
  return {
    ...baseVars,
    cancel_url: "",
    confirm_url: "",
    lead_phone: extra.leadPhone ?? baseVars.lead_phone ?? "",
    lead_email: extra.leadEmail ?? baseVars.lead_email ?? "",
    address: extra.address ?? baseVars.address ?? "",
    appointment_url: extra.appointmentUrl ?? "",
  };
}
