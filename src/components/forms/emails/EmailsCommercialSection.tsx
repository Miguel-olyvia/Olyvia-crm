import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { ExtraEmailsField, SwitchHeader } from "./EmailsTabParts";
import { PurposeTemplateField } from "./EmailTemplateField";
import type { EmailTemplateOption, EmailsTabFields, EmailsTabPatch } from "./emailsTabTypes";

interface EmailsCommercialSectionProps {
  branding: EmailsTabFields;
  set: EmailsTabPatch;
  emailTemplateOptions: EmailTemplateOption[];
  /** Idiomas ativos do formulário, o por omissão primeiro. */
  locales: string[];
}

/** Secção «Emails para o comercial»: aviso de reunião, lembrete, reagendar e cancelar. */
export function EmailsCommercialSection({ branding, set, emailTemplateOptions, locales }: EmailsCommercialSectionProps) {
  const { t } = useTranslation();
  // Interruptor do comercial que se mostra: o dele, senão o do cliente (regra do servidor).
  const technicianReminderOn = branding.reminder_technician_enabled ?? branding.reminder_enabled;
  const followsClientOverridden =
    branding.reminder_technician_enabled != null || branding.reminder_technician_hours_before != null;
  const common = { options: emailTemplateOptions, branding, onPatch: set, locales };
  const templateLabel = t("emailAudience.templateLabel");
  const commercialDefault = t("emailAudience.commercialSystemDefault");

  return (
    <section role="group" aria-labelledby="emails-commercial-title" className="space-y-3">
      <h3 id="emails-commercial-title" className="text-sm font-semibold">{t("emailAudience.commercialSectionTitle")}</h3>

      <div className="space-y-3 rounded-lg border p-3">
        <SwitchHeader
          id="meeting-notify-commercial"
          label="Aviso de reunião ao comercial"
          description="Notifica quando uma visita/reunião é agendada."
          checked={branding.meeting_notify_commercial}
          onChange={(v) => set({ meeting_notify_commercial: v })}
        />
        {branding.meeting_notify_commercial && (
          <>
            <PurposeTemplateField
              {...common}
              purpose="meeting_notify"
              id="meeting-notify-template"
              label={templateLabel}
              groupLabel={t("emailAudience.groupMeetingNotify")}
              defaultLabel={t("emailAudience.systemDefault")}
            />
            <ExtraEmailsField
              id="meeting-notify-emails"
              value={branding.meeting_notify_emails}
              onChange={(v) => set({ meeting_notify_emails: v })}
            />
          </>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <SwitchHeader
          id="reminder-technician-enabled"
          label={t("emailAudience.commercialReminderTitle")}
          description={t("emailAudience.commercialReminderHelp")}
          checked={technicianReminderOn}
          onChange={(v) => set({ reminder_technician_enabled: v })}
        />
        {technicianReminderOn && (
          <>
            <div className="space-y-1">
              <Label htmlFor="reminder-technician-hours" className="text-xs">Horas de antecedência</Label>
              <Input
                id="reminder-technician-hours"
                type="number"
                min={1}
                value={branding.reminder_technician_hours_before ?? ""}
                placeholder={String(branding.reminder_hours_before)}
                onChange={(e) => {
                  const hours = parseInt(e.target.value, 10);
                  set({ reminder_technician_hours_before: hours > 0 ? hours : null });
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("emailAudience.followsClientHint", { hours: branding.reminder_hours_before })}
              </p>
            </div>
            <PurposeTemplateField
              {...common}
              purpose="reminder_technician"
              id="reminder-technician-template"
              label={templateLabel}
              groupLabel={`${t("emailAudience.commercialReminderTitle")} (${t("emailAudience.forCommercial")})`}
              defaultLabel={commercialDefault}
            />
          </>
        )}
        {followsClientOverridden && (
          <button
            type="button"
            id="reminder-technician-follow-client"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => set({ reminder_technician_enabled: null, reminder_technician_hours_before: null })}
          >
            {t("emailAudience.followClient")}
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <SwitchHeader
          id="reschedule-notify-commercial"
          label="Aviso ao comercial ao reagendar"
          description="Notifica quando uma visita/reunião é reagendada."
          checked={branding.reschedule_notify_commercial}
          onChange={(v) => set({ reschedule_notify_commercial: v })}
        />
        <PurposeTemplateField
          {...common}
          purpose="reschedule_technician"
          id="reschedule-technician-template"
          label={templateLabel}
          groupLabel={t("emailAudience.groupRescheduleCommercial")}
          defaultLabel={commercialDefault}
        />
        {branding.reschedule_notify_commercial && (
          <ExtraEmailsField
            id="reschedule-notify-emails"
            value={branding.reschedule_notify_emails}
            onChange={(v) => set({ reschedule_notify_emails: v })}
          />
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <SwitchHeader
          id="cancel-notify-commercial"
          label="Aviso ao comercial ao cancelar"
          description="Notifica quando uma visita/reunião é cancelada."
          checked={branding.cancel_notify_commercial}
          onChange={(v) => set({ cancel_notify_commercial: v })}
        />
        <PurposeTemplateField
          {...common}
          purpose="cancel_technician"
          id="cancel-technician-template"
          label={templateLabel}
          groupLabel={t("emailAudience.groupCancelCommercial")}
          defaultLabel={commercialDefault}
        />
        {branding.cancel_notify_commercial && (
          <ExtraEmailsField
            id="cancel-notify-emails"
            value={branding.cancel_notify_emails}
            onChange={(v) => set({ cancel_notify_emails: v })}
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">{t("emailAudience.extraEmailsHelp")}</p>
    </section>
  );
}
