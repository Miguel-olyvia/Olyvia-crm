/**
 * Mensagem base do SMS de confirmação, por idioma. Módulo puro (sem cliente Supabase) para o
 * separador «Emails» o poder usar sem arrastar a base de dados.
 *
 * É a que o servidor usa quando não há texto configurado (com o nome da empresa como variável). Tem
 * de ficar igual a `defaultConfirmationSms` em `supabase/functions/_shared/emailDefaults.ts`
 * (há um teste de paridade em `__tests__/formSmsLocales.test.ts`). Só existe em pt e en; qualquer
 * outro idioma sai em português, como no servidor.
 */
import { normalizeLocaleCode } from "@/lib/formEmailLocales";

export const SMS_BASE_MESSAGE = {
  pt: "{{company_name}}: a sua visita ficou marcada para {{meeting_date}}. Aguarde o nosso contacto telefónico para confirmação da visita.",
  en: "{{company_name}}: your visit has been scheduled for {{meeting_date}}. Please wait for our phone call to confirm the visit.",
} as const;

export function smsBaseMessageFor(locale: string | null | undefined): string {
  return normalizeLocaleCode(locale) === "en" ? SMS_BASE_MESSAGE.en : SMS_BASE_MESSAGE.pt;
}
