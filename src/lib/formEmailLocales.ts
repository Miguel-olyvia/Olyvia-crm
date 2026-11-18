/**
 * Modelo de email por idioma de um formulário.
 *
 * O servidor (supabase/functions/_shared/formEmails.ts, `pickTemplateId`) escolhe o
 * modelo de cada finalidade por esta ordem:
 *   form_branding.email_locale_templates[finalidade][idioma]
 *   -> o mesmo com o idioma curto («pt-PT» -> «pt»)
 *   -> a coluna única `*_template_id` da finalidade (modelo por omissão).
 * Aqui só se lê e escreve o mapa; a pesquisa do servidor não muda.
 *
 * Os idiomas ativos vêm de `forms.settings.i18n` (default_locale + enabled_locales,
 * ver formI18n.ts). Sem i18n configurado o formulário é monolingue.
 */
import { LANGUAGES } from "@/constants/languages";

/** {finalidade: {idioma: id do modelo}}, como está em form_branding.email_locale_templates. */
export type EmailLocaleTemplates = Record<string, Record<string, string>>;

/** As finalidades que o servidor distingue (EmailPurpose, em _shared/formEmails.ts). */
export const EMAIL_PURPOSE_COLUMN = {
  confirmation: "confirmation_email_template_id",
  meeting_notify: "meeting_notify_template_id",
  reminder: "reminder_template_id",
  reminder_technician: "reminder_technician_template_id",
  reschedule_client: "reschedule_client_template_id",
  reschedule_technician: "reschedule_technician_template_id",
  cancel_client: "cancel_client_template_id",
  cancel_technician: "cancel_technician_template_id",
} as const;

export type EmailPurposeKey = keyof typeof EMAIL_PURPOSE_COLUMN;
export type EmailTemplateColumn = (typeof EMAIL_PURPOSE_COLUMN)[EmailPurposeKey];

const FALLBACK_LOCALE = "pt";

/** Código curto em minúsculas («pt-PT» -> «pt»); null se não for texto utilizável. */
export function normalizeLocaleCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const short = code.toLowerCase().trim().split(/[-_]/)[0];
  return short || null;
}

interface LocaleSettings {
  default_locale?: string | null;
  enabled_locales?: ReadonlyArray<string | null | undefined> | null;
}

/**
 * Idiomas ativos do formulário, o por omissão primeiro, sem repetir e em código curto.
 * Sem i18n configurado devolve só o idioma por omissão (formulário monolingue).
 */
export function activeEmailLocales(i18n: LocaleSettings | null | undefined): string[] {
  const def = normalizeLocaleCode(i18n?.default_locale) ?? FALLBACK_LOCALE;
  const out = [def];
  for (const raw of i18n?.enabled_locales ?? []) {
    const code = normalizeLocaleCode(raw);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Nome do idioma no próprio idioma («en» -> «English»); sem nome conhecido, o código em maiúsculas. */
export function localeDisplayName(code: string): string {
  const short = normalizeLocaleCode(code) ?? code;
  return LANGUAGES.find((l) => l.code === short)?.name ?? short.toUpperCase();
}

/** Aceita só {finalidade: {idioma: id}} com ids de texto não vazio; o resto descarta-se. */
export function normalizeEmailLocaleTemplates(raw: unknown): EmailLocaleTemplates {
  const out: EmailLocaleTemplates = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [purpose, perLocale] of Object.entries(raw as Record<string, unknown>)) {
    if (!perLocale || typeof perLocale !== "object" || Array.isArray(perLocale)) continue;
    const clean: Record<string, string> = {};
    for (const [locale, id] of Object.entries(perLocale as Record<string, unknown>)) {
      if (typeof id === "string" && id.length > 0) clean[locale] = id;
    }
    if (Object.keys(clean).length > 0) out[purpose] = clean;
  }
  return out;
}

/** Modelo próprio de uma finalidade num idioma; null quando esse idioma não tem. */
export function getLocaleTemplateId(
  map: EmailLocaleTemplates | null | undefined,
  purpose: EmailPurposeKey,
  locale: string,
): string | null {
  const code = normalizeLocaleCode(locale);
  if (!code) return null;
  return map?.[purpose]?.[code] || null;
}

/**
 * O mapa tem alguma entrada deste idioma, em código curto ou em variante regional?
 * O servidor usa-a antes da coluna única, por isso quem grava a coluna tem de a ter em conta.
 */
export function hasLocaleEntry(
  map: EmailLocaleTemplates | null | undefined,
  purpose: EmailPurposeKey,
  locale: string,
): boolean {
  const code = normalizeLocaleCode(locale);
  if (!code) return false;
  return Object.entries(map?.[purpose] ?? {}).some(([key, id]) => !!id && normalizeLocaleCode(key) === code);
}

/**
 * Devolve um mapa novo com o modelo (ou sem ele, se `id` for null) de uma finalidade num idioma.
 * Não altera o original e preserva as finalidades e idiomas que o ecrã não mostra; as variantes
 * regionais do próprio idioma («pt-pt») saem e a entrada fica normalizada em código curto.
 */
export function setLocaleTemplateId(
  map: EmailLocaleTemplates | null | undefined,
  purpose: EmailPurposeKey,
  locale: string,
  id: string | null,
): EmailLocaleTemplates {
  const code = normalizeLocaleCode(locale);
  const base: EmailLocaleTemplates = map ?? {};
  if (!code) return { ...base };
  // Tira o código curto e as variantes («pt-pt», «PT_pt»): o servidor tenta primeiro o locale
  // exato do pedido, por isso uma variante esquecida ganharia à escolha feita aqui.
  const rest = Object.fromEntries(
    Object.entries(base[purpose] ?? {}).filter(([key]) => normalizeLocaleCode(key) !== code),
  );
  const nextPurpose = id ? { ...rest, [code]: id } : rest;
  const { [purpose]: _old, ...others } = base;
  return Object.keys(nextPurpose).length > 0 ? { ...others, [purpose]: nextPurpose } : { ...others };
}

function canonical(map: EmailLocaleTemplates | null | undefined): string {
  const sorted = Object.keys(map ?? {})
    .sort()
    .map((purpose) => {
      const perLocale = map?.[purpose] ?? {};
      return [purpose, Object.keys(perLocale).sort().map((l) => [l, perLocale[l]])];
    });
  return JSON.stringify(sorted);
}

/** Igualdade por conteúdo, sem depender da ordem das chaves; null e undefined contam como vazio. */
export function emailLocaleTemplatesEqual(
  a: EmailLocaleTemplates | null | undefined,
  b: EmailLocaleTemplates | null | undefined,
): boolean {
  return canonical(a) === canonical(b);
}
