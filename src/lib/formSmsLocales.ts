/**
 * SMS de confirmação POR IDIOMA, sem alterar o esquema da base.
 *
 * Onde fica guardado:
 *  - idioma por omissão do formulário: a coluna de sempre, `form_branding.confirmation_sms_message`;
 *  - outros idiomas: `forms.settings.i18n.content.branding[<idioma>].confirmation_sms_message`, a
 *    sobreposição de traduções que já guarda os restantes textos do formulário por idioma (ver
 *    `formI18n.ts`: o idioma por omissão escreve nas colunas base, os outros só na sobreposição).
 *    `email_locale_templates` não serve: guarda IDs de modelos e outras funções iteram-no como ids.
 *  - sem texto próprio, o servidor usa a coluna única e, sem ela, o texto por omissão do idioma
 *    (`supabase/functions/_shared/confirmationSms.ts` e `emailDefaults.ts`).
 */
import {
  getOverlayValue,
  persistI18nConfig,
  readI18nConfig,
  setOverlayValue,
  type FormI18nConfig,
} from "@/lib/formI18n";
import { supabase } from "@/integrations/supabase/client";

export { SMS_BASE_MESSAGE, smsBaseMessageFor } from "@/lib/formSmsBase";

export const CONFIRMATION_SMS_KEY = "confirmation_sms_message";

/** Textos por idioma da sobreposição, só dos idiomas pedidos que têm texto. */
export function readSmsByLocale(i18n: FormI18nConfig, locales: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of locales) {
    const text = getOverlayValue(i18n, "branding", "branding", locale, CONFIRMATION_SMS_KEY);
    if (typeof text === "string" && text.trim()) out[locale] = text;
  }
  return out;
}

/** Idiomas (dos ativos) cujo texto mudou entre o carregado e o rascunho; "" significa apagar. */
export function smsChanges(
  loaded: Record<string, string>,
  draft: Record<string, string>,
  locales: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of locales) {
    const before = (loaded[locale] ?? "").trim();
    const after = (draft[locale] ?? "").trim();
    if (locale in draft && before !== after) out[locale] = draft[locale];
  }
  return out;
}

/** Aplica as alterações à sobreposição (cópia nova); texto vazio apaga a chave. */
export function applySmsOverlay(i18n: FormI18nConfig, changes: Record<string, string>): FormI18nConfig {
  return Object.entries(changes).reduce(
    (acc, [locale, text]) => setOverlayValue(acc, "branding", "branding", locale, CONFIRMATION_SMS_KEY, text.trim() ? text : undefined),
    i18n,
  );
}

/**
 * Grava as alterações em `forms.settings.i18n`: lê as definições actuais, aplica SÓ estas alterações
 * e escreve, para não apagar outros textos traduzidos nem outras chaves. Lança se a leitura ou a
 * escrita falharem.
 */
export async function persistSmsByLocale(formId: string, changes: Record<string, string>): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  const { data, error } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
  if (error) throw error;
  const next = applySmsOverlay(readI18nConfig(data?.settings), changes);
  await persistI18nConfig(formId, next);
}
