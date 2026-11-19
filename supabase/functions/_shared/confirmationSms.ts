// SMS de confirmacao POR IDIOMA, sem alterar o esquema da base.
//
// Onde esta guardado (decisao documentada):
//  - Idioma por omissao do formulario: a coluna de sempre, form_branding.confirmation_sms_message.
//  - Outros idiomas: forms.settings.i18n.content.branding[<idioma>].confirmation_sms_message, a mesma
//    sobreposicao de traducoes que ja guarda os restantes textos do formulario por idioma
//    (src/lib/formI18n.ts; a regra desse ficheiro e: o idioma por omissao escreve nas colunas base, os
//    outros so na sobreposicao). Nao se usa email_locale_templates: esse mapa guarda IDs de modelos e
//    outras funcoes iteram-no como ids.
//  - Sem texto para o idioma da pessoa cai na coluna unica (retrocompativel) e, sem ela, no texto por
//    omissao do idioma (emailDefaults.ts).
// Puro: sem rede, sem Deno.

export const CONFIRMATION_SMS_KEY = "confirmation_sms_message";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Mensagens por idioma lidas de forms.settings; so os idiomas com texto, em minusculas. */
export function smsByLocaleFromSettings(settings: unknown): Record<string, string> {
  const branding = isRecord(settings) && isRecord(settings.i18n) && isRecord(settings.i18n.content)
    ? settings.i18n.content.branding
    : null;
  const out: Record<string, string> = {};
  if (!isRecord(branding)) return out;
  for (const [locale, texts] of Object.entries(branding)) {
    if (!isRecord(texts)) continue;
    const text = texts[CONFIRMATION_SMS_KEY];
    if (typeof text === "string" && text.trim()) out[locale.toLowerCase().trim()] = text.trim();
  }
  return out;
}

/**
 * Mensagem a usar: a do idioma da pessoa (exato, depois o curto), senao a coluna unica; null quando
 * nao ha nada configurado (o chamador usa o texto por omissao do idioma).
 */
export function pickConfirmationSmsMessage(p: {
  column: string | null | undefined;
  byLocale: Record<string, string> | null | undefined;
  locale: string | null | undefined;
}): string | null {
  const map = p.byLocale ?? {};
  const locale = (p.locale ?? "").toLowerCase().trim();
  if (locale) {
    const short = locale.split(/[-_]/)[0];
    const own = (map[locale] ?? "").trim() || (short ? (map[short] ?? "").trim() : "");
    if (own) return own;
  }
  const column = (p.column ?? "").trim();
  return column ? (p.column as string) : null;
}
