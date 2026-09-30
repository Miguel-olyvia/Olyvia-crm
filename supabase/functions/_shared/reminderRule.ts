// Regra do lembrete POR DESTINATARIO (cliente / comercial). Pura: sem rede, sem
// Deno, sem imports (serve as funcoes e o vitest).
//
//  - Cliente: reminder_enabled / reminder_hours_before.
//  - Comercial: reminder_technician_enabled / reminder_technician_hours_before.
//    NULL = segue o valor do cliente (por isso um formulario que nunca mexeu
//    nisto continua igual); um valor explicito manda e torna-o independente.
//  - Horas sem valor valido (vazio, zero, negativo) = 2.

export type ReminderAudienceKind = "client" | "technician";

export const DEFAULT_REMINDER_HOURS = 2;

/** O que a regra le do formulario (compativel com FormEmailConfig e ReminderFormState). */
export interface ReminderRuleSource {
  reminder_enabled?: boolean | null;
  reminder_hours_before?: number | null;
  reminder_technician_enabled?: boolean | null;
  reminder_technician_hours_before?: number | null;
}

export interface ReminderRule {
  enabled: boolean;
  hoursBefore: number;
}

/** Horas validas (> 0) ou null. */
export function positiveHours(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Interruptor efectivo do comercial: o dele se existir, senao o do cliente. */
export function technicianReminderEnabled(src: ReminderRuleSource | null | undefined): boolean {
  if (!src) return false;
  if (src.reminder_technician_enabled === true || src.reminder_technician_enabled === false) {
    return src.reminder_technician_enabled;
  }
  return !!src.reminder_enabled;
}

/** Horas efectivas do comercial (as dele, senao as do cliente), ou null se nenhuma for valida. */
export function technicianReminderHours(src: ReminderRuleSource | null | undefined): number | null {
  if (!src) return null;
  return positiveHours(src.reminder_technician_hours_before) ?? positiveHours(src.reminder_hours_before);
}

export function reminderRuleFor(
  src: ReminderRuleSource | null | undefined,
  audience: ReminderAudienceKind,
): ReminderRule {
  if (audience === "technician") {
    return {
      enabled: technicianReminderEnabled(src),
      hoursBefore: technicianReminderHours(src) ?? DEFAULT_REMINDER_HOURS,
    };
  }
  return {
    enabled: !!src?.reminder_enabled,
    hoursBefore: positiveHours(src?.reminder_hours_before) ?? DEFAULT_REMINDER_HOURS,
  };
}

/** Ha algum lembrete de email ligado (cliente ou comercial)? */
export function anyReminderEnabled(src: ReminderRuleSource | null | undefined): boolean {
  return reminderRuleFor(src, "client").enabled || reminderRuleFor(src, "technician").enabled;
}
