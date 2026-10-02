import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

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
}

const TEMPLATE_DEFAULT = "__default__";

interface EventTemplateSelectProps {
  id: string;
  label: string;
  options: EmailTemplateOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  defaultLabel: string;
}

/** Um seletor de modelo de email; a opção por omissão grava null. */
function EventTemplateSelect({ id, label, options, value, onChange, defaultLabel }: EventTemplateSelectProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select
        value={value || TEMPLATE_DEFAULT}
        onValueChange={(v) => onChange(v === TEMPLATE_DEFAULT ? null : v)}
      >
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TEMPLATE_DEFAULT}>{defaultLabel}</SelectItem>
          {options.map((tpl) => (
            <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ExtraEmailsFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

function ExtraEmailsField({ id, value, onChange }: ExtraEmailsFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">Emails adicionais a notificar</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ex: comercial@empresa.pt, outro@empresa.pt"
        rows={2}
      />
      <p className="text-[10px] text-muted-foreground">Separe vários emails por vírgula, ponto e vírgula ou linha.</p>
    </div>
  );
}

interface SwitchHeaderProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  small?: boolean;
}

function SwitchHeader({ id, label, description, checked, onChange, small }: SwitchHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label htmlFor={id} className={small ? "text-xs" : undefined}>{label}</Label>
        <p className={small ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground"}>{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface FormEmailsTabProps<T extends EmailsTabFields> {
  branding: T;
  /** Recebe o objecto completo já actualizado (mesmo padrão do resto do ecrã). */
  onChange: (next: T) => void;
  emailTemplateOptions: EmailTemplateOption[];
  smtpOptions: SmtpOption[];
}

/** Separador «Emails»: primeiro o que é do cliente, depois o que é do comercial, no fim o envio. */
export function FormEmailsTab<T extends EmailsTabFields>({
  branding,
  onChange,
  emailTemplateOptions,
  smtpOptions,
}: FormEmailsTabProps<T>) {
  const { t } = useTranslation();
  const set = (patch: Partial<EmailsTabFields>) => onChange({ ...branding, ...patch });
  // Interruptor do comercial que se mostra: o dele, senão o do cliente (regra do servidor).
  const technicianReminderOn = branding.reminder_technician_enabled ?? branding.reminder_enabled;
  const followsClientOverridden =
    branding.reminder_technician_enabled != null || branding.reminder_technician_hours_before != null;

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
            <EventTemplateSelect
              id="confirmation-email-template"
              label="Modelo de email"
              options={emailTemplateOptions}
              value={branding.confirmation_email_template_id}
              onChange={(id) => set({ confirmation_email_template_id: id })}
              defaultLabel={t("emailAudience.systemDefault")}
            />
          )}
          <div className="border-t pt-3">
            <SwitchHeader
              small
              id="confirmation-sms-enabled"
              label="Também por SMS"
              description="Além do email, envia um SMS de confirmação ao número indicado pelo cliente."
              checked={branding.confirmation_sms_enabled}
              onChange={(v) => set({ confirmation_sms_enabled: v })}
            />
          </div>
          {branding.confirmation_sms_enabled && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="confirmation-sms-message" className="text-xs">Mensagem do SMS</Label>
                <Textarea
                  id="confirmation-sms-message"
                  value={branding.confirmation_sms_message}
                  onChange={(e) => set({ confirmation_sms_message: e.target.value })}
                  placeholder='Deixe vazio para usar a mensagem base: "{{company_name}}: a sua visita ficou marcada para {{meeting_date}}. Aguarde o nosso contacto telefónico para confirmação da visita."'
                  rows={3}
                />
                <p className="text-[10px] text-muted-foreground">
                  Aceita as mesmas variáveis do email: {"{{lead_name}}"}, {"{{meeting_date}}"}, {"{{company_name}}"}, {"{{cancel_url}}"}.
                </p>
              </div>
              <SwitchHeader
                small
                id="confirmation-sms-include-link"
                label="Incluir link de gerir/cancelar no SMS"
                description="Desligado por omissão. Só ligue depois de confirmar o envio de um SMS de teste com o link."
                checked={branding.confirmation_sms_include_link}
                onChange={(v) => set({ confirmation_sms_include_link: v })}
              />
            </div>
          )}
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
              <EventTemplateSelect
                id="reminder-client-template"
                label={t("emailAudience.templateLabel")}
                options={emailTemplateOptions}
                value={branding.reminder_template_id}
                onChange={(id) => set({ reminder_template_id: id })}
                defaultLabel={t("emailAudience.systemDefault")}
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
            <EventTemplateSelect
              id="reschedule-client-template"
              label={t("emailAudience.templateLabel")}
              options={emailTemplateOptions}
              value={branding.reschedule_client_template_id}
              onChange={(id) => set({ reschedule_client_template_id: id })}
              defaultLabel={t("emailAudience.systemDefault")}
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
            <EventTemplateSelect
              id="cancel-client-template"
              label={t("emailAudience.templateLabel")}
              options={emailTemplateOptions}
              value={branding.cancel_client_template_id}
              onChange={(id) => set({ cancel_client_template_id: id })}
              defaultLabel={t("emailAudience.systemDefault")}
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
              <EventTemplateSelect
                id="meeting-notify-template"
                label="Modelo de email"
                options={emailTemplateOptions}
                value={branding.meeting_notify_template_id}
                onChange={(id) => set({ meeting_notify_template_id: id })}
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
              <EventTemplateSelect
                id="reminder-technician-template"
                label={t("emailAudience.templateLabel")}
                options={emailTemplateOptions}
                value={branding.reminder_technician_template_id}
                onChange={(id) => set({ reminder_technician_template_id: id })}
                defaultLabel={t("emailAudience.commercialSystemDefault")}
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
          <EventTemplateSelect
            id="reschedule-technician-template"
            label={t("emailAudience.templateLabel")}
            options={emailTemplateOptions}
            value={branding.reschedule_technician_template_id}
            onChange={(id) => set({ reschedule_technician_template_id: id })}
            defaultLabel={t("emailAudience.commercialSystemDefault")}
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
          <EventTemplateSelect
            id="cancel-technician-template"
            label={t("emailAudience.templateLabel")}
            options={emailTemplateOptions}
            value={branding.cancel_technician_template_id}
            onChange={(id) => set({ cancel_technician_template_id: id })}
            defaultLabel={t("emailAudience.commercialSystemDefault")}
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
