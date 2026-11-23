import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { activeEmailLocales } from "@/lib/formEmailLocales";
import { PurposeTemplateField } from "@/components/forms/emails/EmailTemplateField";
import { EmailsCommercialSection } from "@/components/forms/emails/EmailsCommercialSection";
import { ConfirmationSmsSection } from "@/components/forms/emails/ConfirmationSmsSection";
import { SwitchHeader, TEMPLATE_DEFAULT } from "@/components/forms/emails/EmailsTabParts";
import type { EmailTemplateOption, EmailsTabFields, SmtpOption } from "@/components/forms/emails/emailsTabTypes";

export type { EmailTemplateOption, EmailsTabFields, SmtpOption };

interface FormEmailsTabProps<T extends EmailsTabFields> {
  branding: T;
  /** Recebe o objecto completo já actualizado (mesmo padrão do resto do ecrã). */
  onChange: (next: T) => void;
  emailTemplateOptions: EmailTemplateOption[];
  smtpOptions: SmtpOption[];
  /**
   * Idiomas ativos do formulário, o por omissão primeiro (forms.settings.i18n). Com mais de um,
   * cada finalidade mostra um seletor de modelo por idioma; sem isto, ou com um só, o separador
   * é o de sempre (um seletor por finalidade).
   */
  activeLocales?: string[];
  /** Texto do SMS de confirmação dos idiomas que não são o por omissão (forms.settings.i18n). */
  smsByLocale?: Record<string, string>;
  /**
   * Guarda o texto do SMS de um idioma que não é o por omissão. Sem isto o SMS fica numa só mensagem,
   * como sempre; com isto e mais de um idioma ativo, o separador mostra uma mensagem por idioma.
   */
  onSmsLocaleChange?: (locale: string, value: string) => void;
}

/** Separador «Emails»: primeiro o que é do cliente, depois o que é do comercial, no fim o envio. */
export function FormEmailsTab<T extends EmailsTabFields>({
  branding,
  onChange,
  emailTemplateOptions,
  smtpOptions,
  activeLocales,
  smsByLocale,
  onSmsLocaleChange,
}: FormEmailsTabProps<T>) {
  const { t } = useTranslation();
  const set = (patch: Partial<EmailsTabFields>) => onChange({ ...branding, ...patch });
  const locales = useMemo(
    () => activeEmailLocales({ default_locale: activeLocales?.[0], enabled_locales: activeLocales?.slice(1) }),
    [activeLocales],
  );
  const templateLabel = t("emailAudience.templateLabel");
  const systemDefault = t("emailAudience.systemDefault");
  const templateProps = { options: emailTemplateOptions, branding, onPatch: set, locales, label: templateLabel, defaultLabel: systemDefault };

  return (
    <>
      <section role="group" aria-labelledby="emails-client-title" className="space-y-3">
        <h3 id="emails-client-title" className="text-sm font-semibold">{t("emailAudience.clientSectionTitle")}</h3>

        <div className="space-y-3 rounded-lg border p-3">
          <SwitchHeader
            id="confirmation-email-enabled"
            label="Email de confirmação"
            description="Enviado ao cliente assim que submete o formulário (agendamento incluído)."
            checked={branding.confirmation_email_enabled}
            onChange={(v) => set({ confirmation_email_enabled: v })}
          />
          {branding.confirmation_email_enabled && (
            <PurposeTemplateField
              {...templateProps}
              purpose="confirmation"
              id="confirmation-email-template"
              groupLabel={t("emailAudience.groupConfirmation")}
            />
          )}
          <ConfirmationSmsSection
            branding={branding}
            set={set}
            locales={locales}
            smsByLocale={smsByLocale}
            onSmsLocaleChange={onSmsLocaleChange}
          />
          <div className="space-y-1">
            <Label htmlFor="confirmation-send-on" className="text-xs">{t("visitConfirmation.form.label")}</Label>
            <Select
              value={branding.confirmation_send_on ?? "booking"}
              onValueChange={(v) => set({ confirmation_send_on: v === "agenda_confirm" ? "agenda_confirm" : "booking" })}
            >
              <SelectTrigger id="confirmation-send-on" aria-describedby="confirmation-send-on-help"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="booking">{t("visitConfirmation.form.onBooking")}</SelectItem>
                <SelectItem value="agenda_confirm">{t("visitConfirmation.form.onAgendaConfirm")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="confirmation-send-on-help" className="text-xs text-muted-foreground">{t("visitConfirmation.form.help")}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <SwitchHeader
            id="reminder-enabled"
            label={t("emailAudience.clientReminderTitle")}
            description={t("emailAudience.clientReminderHelp")}
            checked={branding.reminder_enabled}
            onChange={(v) => set({ reminder_enabled: v })}
          />
          {branding.reminder_enabled && (
            <>
              <div className="space-y-1">
                <Label htmlFor="reminder-hours-before" className="text-xs">Horas de antecedência</Label>
                <Input
                  id="reminder-hours-before"
                  type="number"
                  min={1}
                  value={branding.reminder_hours_before}
                  onChange={(e) => set({ reminder_hours_before: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <PurposeTemplateField
                {...templateProps}
                purpose="reminder"
                id="reminder-client-template"
                groupLabel={t("emailAudience.clientReminderTitle")}
              />
            </>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <SwitchHeader
            id="reschedule-notify-client"
            label={t("emailAudience.clientRescheduleTitle")}
            description={t("emailAudience.clientRescheduleHelp")}
            checked={branding.reschedule_notify_client}
            onChange={(v) => set({ reschedule_notify_client: v })}
          />
          {branding.reschedule_notify_client && (
            <PurposeTemplateField
              {...templateProps}
              purpose="reschedule_client"
              id="reschedule-client-template"
              groupLabel={t("emailAudience.clientRescheduleTitle")}
            />
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <SwitchHeader
            id="cancel-notify-client"
            label={t("emailAudience.clientCancelTitle")}
            description={t("emailAudience.clientCancelHelp")}
            checked={branding.cancel_notify_client}
            onChange={(v) => set({ cancel_notify_client: v })}
          />
          {branding.cancel_notify_client && (
            <PurposeTemplateField
              {...templateProps}
              purpose="cancel_client"
              id="cancel-client-template"
              groupLabel={t("emailAudience.clientCancelTitle")}
            />
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <SwitchHeader
            id="scheduling-invite-enabled"
            label="Lembrete de agendamento por concluir"
            description="Envia um email ao lead que preencheu o formulário mas não escolheu um horário."
            checked={branding.scheduling_invite_enabled}
            onChange={(v) => set({ scheduling_invite_enabled: v })}
          />
          {branding.scheduling_invite_enabled && (
            <div className="space-y-1">
              <Label htmlFor="scheduling-invite-delays" className="text-xs">Horas após o preenchimento (várias, separadas por vírgula)</Label>
              <Input
                id="scheduling-invite-delays"
                value={branding.scheduling_invite_delays_hours}
                onChange={(e) => set({ scheduling_invite_delays_hours: e.target.value })}
                placeholder="ex: 24, 72, 168"
              />
            </div>
          )}
        </div>
      </section>

      <EmailsCommercialSection
        branding={branding}
        set={set}
        emailTemplateOptions={emailTemplateOptions}
        locales={locales}
      />

      <section role="group" aria-labelledby="emails-delivery-title" className="space-y-3 rounded-lg border p-3">
        <h3 id="emails-delivery-title" className="text-sm font-semibold">{t("emailAudience.deliverySectionTitle")}</h3>
        <div className="space-y-1">
          <Label htmlFor="email-smtp" className="text-xs">SMTP a usar</Label>
          <Select
            value={branding.email_smtp_id || TEMPLATE_DEFAULT}
            onValueChange={(v) => set({ email_smtp_id: v === TEMPLATE_DEFAULT ? null : v })}
          >
            <SelectTrigger id="email-smtp"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TEMPLATE_DEFAULT}>SMTP padrão da organização</SelectItem>
              {smtpOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}{s.is_default ? " (padrão)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="booking-manage-url" className="text-xs">URL de gestão do agendamento</Label>
          <Input
            id="booking-manage-url"
            value={branding.booking_manage_url_template}
            onChange={(e) => set({ booking_manage_url_template: e.target.value })}
            placeholder="Deixe vazio para usar /booking/manage. Aceita {lang}, ex: https://site.pt/{lang}/agendamento"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="public-form-url" className="text-xs">URL pública deste formulário</Label>
          <Input
            id="public-form-url"
            value={branding.public_form_url_template}
            onChange={(e) => set({ public_form_url_template: e.target.value })}
            placeholder="Deixe vazio para usar o padrão. Aceita {lang} e {form_id}"
          />
        </div>
      </section>
    </>
  );
}
