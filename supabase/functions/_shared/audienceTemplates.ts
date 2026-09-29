// Escolha do modelo de email e das variaveis por DESTINATARIO (cliente / comercial)
// para o lembrete, o reagendamento e o cancelamento. Puro: sem rede, sem Deno.
//
// Regras:
//  - SEPARACAO TOTAL: cada destinatario so olha para os modelos do seu lado
//    (por idioma, depois a coluna dele). Sem nenhum, devolve null e o chamador
//    usa o texto por omissao do SEU lado. Nenhum lado cai para o outro, nem para
//    o aviso de nova reuniao (meeting_notify), que e so do comercial.
//  - O comercial NUNCA recebe cancel_url nem confirm_url (os links do cliente),
//    mesmo com um modelo personalizado: as variaveis ficam vazias.

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

/**
 * Modelo a usar: o do proprio destinatario (idioma, depois a coluna dele), senao
 * null (texto por omissao do seu lado). Nunca o do outro lado.
 */
export function pickAudienceTemplateId(
  cfg: FormEmailConfig | null,
  event: AudienceEvent,
  audience: Audience,
  locale: string | null | undefined,
): string | null {
  const slot = audience === "technician" ? technicianSlot(cfg, event) : clientSlot(cfg, event);
  return pickTemplateId(cfg, slot.purpose, locale, slot.column);
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
