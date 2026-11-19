import { useTranslation } from "@/hooks/useTranslation";
import { localeDisplayName } from "@/lib/formEmailLocales";
import { SMS_BASE_MESSAGE, smsBaseMessageFor } from "@/lib/formSmsBase";
import { SwitchHeader } from "./EmailsTabParts";
import { SmsMessageField } from "./SmsMessageField";
import type { EmailsTabFields, EmailsTabPatch } from "./emailsTabTypes";

interface ConfirmationSmsSectionProps {
  branding: EmailsTabFields;
  set: EmailsTabPatch;
  /** Idiomas ativos do formulário, o por omissão primeiro. */
  locales: string[];
  /** Texto do SMS dos idiomas que não são o por omissão (forms.settings.i18n); {} se não houver. */
  smsByLocale?: Record<string, string>;
  /** Guarda o texto de um idioma que não é o por omissão. Sem ele, o separador não oferece SMS por idioma. */
  onSmsLocaleChange?: (locale: string, value: string) => void;
}

/**
 * «Também por SMS»: interruptor, mensagem e ligação. Com um só idioma ativo é a caixa única de sempre
 * (coluna `confirmation_sms_message`). Com vários, uma caixa por idioma: o idioma por omissão escreve
 * na coluna, os outros na sobreposição de traduções do formulário (ver lib/formSmsLocales.ts).
 */
export function ConfirmationSmsSection({ branding, set, locales, smsByLocale, onSmsLocaleChange }: ConfirmationSmsSectionProps) {
  const { t } = useTranslation();
  const column = branding.confirmation_sms_message;
  const defaultLocale = locales[0];
  const perLocale = locales.length > 1 && !!onSmsLocaleChange;

  return (
    <>
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
          {perLocale ? (
            <div role="group" aria-label={t("emailAudience.smsLocaleGroup")} className="space-y-3">
              {locales.map((locale) => {
                const isDefault = locale === defaultLocale;
                // Vazio, o servidor usa a coluna (idioma por omissão); sem ela, o texto base do idioma.
                const base = t("emailAudience.smsPlaceholderBase", { message: smsBaseMessageFor(locale) });
                return (
                  <SmsMessageField
                    key={locale}
                    grouped
                    id={`confirmation-sms-message-${locale}`}
                    label={`${t("emailAudience.smsMessageLabel")} — ${localeDisplayName(locale)}`}
                    value={isDefault ? column : (smsByLocale?.[locale] ?? "")}
                    onChange={(v) => (isDefault ? set({ confirmation_sms_message: v }) : onSmsLocaleChange(locale, v))}
                    includeLink={branding.confirmation_sms_include_link}
                    placeholder={!isDefault && column.trim() ? column : base}
                    help={isDefault ? undefined : t("emailAudience.smsLocaleHelp", { language: localeDisplayName(defaultLocale) })}
                  />
                );
              })}
            </div>
          ) : (
            <SmsMessageField
              id="confirmation-sms-message"
              label="Mensagem do SMS"
              value={column}
              onChange={(v) => set({ confirmation_sms_message: v })}
              includeLink={branding.confirmation_sms_include_link}
              placeholder={`Deixe vazio para usar a mensagem base: "${SMS_BASE_MESSAGE.pt}"`}
            />
          )}
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
    </>
  );
}
