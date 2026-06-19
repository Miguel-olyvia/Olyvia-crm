/**
 * Generic UI strings used by public form rendering.
 * Kept in code (not DB) to minimize DB load and to avoid translation tables.
 *
 * Resolution order at runtime:
 *   1. URL query ?lang=xx
 *   2. <html lang="..."> attribute
 *   3. navigator.language
 *   4. fallback "pt"
 *
 * The selected locale is also passed to get-form-data?lang=, which resolves
 * form-specific text (labels, placeholders, branding) from forms.settings.i18n.
 */

export type SupportedLocale = "pt" | "en" | "es" | "fr" | "de";

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  pt: {
    next: "Próximo",
    previous: "Anterior",
    submit: "Submeter",
    submitting: "A submeter...",
    required: "Campo obrigatório",
    loading: "A carregar...",
    selectPlaceholder: "Selecione...",
    thankYou: "Obrigado!",
    successDefault: "Os seus dados foram enviados com sucesso.",
  },
  en: {
    next: "Next",
    previous: "Previous",
    submit: "Submit",
    submitting: "Submitting...",
    required: "Required field",
    loading: "Loading...",
    selectPlaceholder: "Select...",
    thankYou: "Thank you!",
    successDefault: "Your data was submitted successfully.",
  },
  es: {
    next: "Siguiente",
    previous: "Anterior",
    submit: "Enviar",
    submitting: "Enviando...",
    required: "Campo obligatorio",
    loading: "Cargando...",
    selectPlaceholder: "Seleccionar...",
    thankYou: "¡Gracias!",
    successDefault: "Sus datos se enviaron con éxito.",
  },
  fr: {
    next: "Suivant",
    previous: "Précédent",
    submit: "Envoyer",
    submitting: "Envoi...",
    required: "Champ obligatoire",
    loading: "Chargement...",
    selectPlaceholder: "Sélectionner...",
    thankYou: "Merci !",
    successDefault: "Vos données ont été envoyées avec succès.",
  },
  de: {
    next: "Weiter",
    previous: "Zurück",
    submit: "Absenden",
    submitting: "Senden...",
    required: "Pflichtfeld",
    loading: "Laden...",
    selectPlaceholder: "Auswählen...",
    thankYou: "Vielen Dank!",
    successDefault: "Ihre Daten wurden erfolgreich übermittelt.",
  },
};

const SUPPORTED: SupportedLocale[] = ["pt", "en", "es", "fr", "de"];

export function normalizeLocale(input: string | null | undefined): SupportedLocale | null {
  if (!input) return null;
  const short = String(input).toLowerCase().split(/[-_]/)[0] as SupportedLocale;
  return SUPPORTED.includes(short) ? short : null;
}

/**
 * Detect the locale to request from the public form endpoint.
 * Safe to call in the browser; returns null in SSR contexts (caller decides default).
 */
export function detectLocale(): SupportedLocale | null {
  if (typeof window === "undefined") return null;
  // 1. URL ?lang=
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeLocale(params.get("lang"));
    if (fromUrl) return fromUrl;
  } catch {
    /* ignore */
  }
  // 2. <html lang="">
  const htmlLang = normalizeLocale(document?.documentElement?.lang);
  if (htmlLang) return htmlLang;
  // 3. navigator
  const nav = normalizeLocale(navigator?.language);
  if (nav) return nav;
  return null;
}

/** Lookup a UI string with safe fallback. */
export function uiString(locale: string | null | undefined, key: string): string {
  const loc = normalizeLocale(locale) || "pt";
  return STRINGS[loc]?.[key] || STRINGS.en[key] || key;
}
