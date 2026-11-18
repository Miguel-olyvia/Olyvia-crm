import type { EmailLocaleTemplates } from "@/lib/formEmailLocales";

export interface EmailTemplateOption {
  id: string;
  name: string;
}

export interface SmtpOption {
  id: string;
  name: string;
  is_default: boolean;
}

/** Campos da personalização do formulário que o separador «Emails» lê e grava. */
export interface EmailsTabFields {
  confirmation_email_enabled: boolean;
  confirmation_email_template_id: string | null;
  confirmation_sms_enabled: boolean;
  confirmation_sms_message: string;
  confirmation_sms_include_link: boolean;
  meeting_notify_commercial: boolean;
  meeting_notify_emails: string;
  meeting_notify_template_id: string | null;
  reschedule_notify_client: boolean;
  reschedule_notify_commercial: boolean;
  reschedule_notify_emails: string;
  reschedule_client_template_id: string | null;
  reschedule_technician_template_id: string | null;
  cancel_notify_client: boolean;
  cancel_notify_commercial: boolean;
  cancel_notify_emails: string;
  cancel_client_template_id: string | null;
  cancel_technician_template_id: string | null;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  reminder_template_id: string | null;
  /** Lembrete do comercial. null = segue o do cliente (interruptor / horas). */
  reminder_technician_enabled: boolean | null;
  reminder_technician_hours_before: number | null;
  reminder_technician_template_id: string | null;
  scheduling_invite_enabled: boolean;
  scheduling_invite_delays_hours: string;
  email_smtp_id: string | null;
  booking_manage_url_template: string;
  public_form_url_template: string;
  /**
   * Modelo por idioma: {finalidade: {idioma: id}}. Opcional para os formulários
   * monolingues, que continuam a usar só as colunas `*_template_id`.
   */
  email_locale_templates?: EmailLocaleTemplates;
}

/** Aplica uma alteração parcial ao branding (o pai guarda o objeto completo). */
export type EmailsTabPatch = (patch: Partial<EmailsTabFields>) => void;
