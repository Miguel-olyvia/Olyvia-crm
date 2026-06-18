/**
 * Helpers for reading/writing form translations stored in
 * `forms.settings.i18n` (JSONB on the existing `forms` table).
 *
 * Storage shape (only the parts that have translations exist):
 *   forms.settings = {
 *     i18n: {
 *       default_locale: "pt",
 *       enabled_locales: ["en", "es"],
 *       content: {
 *         steps:    { [step_id]:  { [locale]: { title?, description? } } },
 *         fields:   { [field_id]: { [locale]: { label?, placeholder?, help_text?, options?: { [opt_id]: string } } } },
 *         branding: { [locale]: { form_title?, form_subtitle?, submit_button_text?, next_button_text?,
 *                                 previous_button_text?, success_title?, success_message?,
 *                                 footer_text?, location_rejection_message? } }
 *       }
 *     }
 *   }
 *
 * Rules:
 *  - The default locale always writes to the base columns (form_steps, form_fields, form_branding).
 *  - Secondary locales write to this overlay only.
 *  - Removed/empty values prune the overlay node to keep payload minimal.
 *  - Existing forms without `settings.i18n` keep working (monolingual).
 */

import { supabase } from "@/integrations/supabase/client";

export type FormI18nConfig = {
  default_locale: string;
  enabled_locales: string[];
  content?: {
    steps?: Record<string, Record<string, { title?: string; description?: string }>>;
    fields?: Record<
      string,
      Record<
        string,
        { label?: string; placeholder?: string; help_text?: string; options?: Record<string, string> }
      >
    >;
    branding?: Record<string, Record<string, string>>;
  };
};

export const DEFAULT_FORM_LOCALE = "pt";

export function readI18nConfig(settings: any): FormI18nConfig {
  const i18n = settings?.i18n;
  if (!i18n || typeof i18n !== "object") {
    return { default_locale: DEFAULT_FORM_LOCALE, enabled_locales: [], content: {} };
  }
  return {
    default_locale: typeof i18n.default_locale === "string" ? i18n.default_locale : DEFAULT_FORM_LOCALE,
    enabled_locales: Array.isArray(i18n.enabled_locales) ? i18n.enabled_locales.filter((x: any) => typeof x === "string") : [],
    content: i18n.content && typeof i18n.content === "object" ? i18n.content : {},
  };
}

/** Build a new settings object with the i18n config merged in (preserves other keys). */
export function withI18nConfig(settings: any, i18n: FormI18nConfig): any {
  const base = settings && typeof settings === "object" ? settings : {};
  return { ...base, i18n };
}

/** Persist `settings.i18n` for a form. Reads current settings first to avoid clobbering siblings. */
export async function persistI18nConfig(formId: string, i18n: FormI18nConfig): Promise<void> {
  const { data, error } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
  if (error) throw error;
  const next = withI18nConfig(data?.settings, i18n);
  const { error: updErr } = await supabase.from("forms").update({ settings: next }).eq("id", formId);
  if (updErr) throw updErr;
}

/** Strip empty objects/strings recursively so the overlay never accumulates noise. */
function pruneEmpty(node: any): any {
  if (node === null || node === undefined) return undefined;
  if (typeof node === "string") return node.length > 0 ? node : undefined;
  if (Array.isArray(node)) return node.length > 0 ? node : undefined;
  if (typeof node === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(node)) {
      const cleaned = pruneEmpty(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return node;
}

type Section = "steps" | "fields" | "branding";

/**
 * Set a translation value for a given locale in the overlay.
 * Pass value === "" or undefined to remove the key.
 *
 * For "branding" use entityId = "branding" (single record per form).
 */
export function setOverlayValue(
  i18n: FormI18nConfig,
  section: Section,
  entityId: string,
  locale: string,
  key: string,
  value: string | undefined,
): FormI18nConfig {
  const content = { ...(i18n.content || {}) } as any;
  const sectionMap = { ...(content[section] || {}) };

  if (section === "branding") {
    const localeMap = { ...(sectionMap[locale] || {}) };
    if (value && value.length > 0) localeMap[key] = value;
    else delete localeMap[key];
    sectionMap[locale] = localeMap;
  } else {
    const entityMap = { ...(sectionMap[entityId] || {}) };
    const localeMap = { ...(entityMap[locale] || {}) };
    if (value && value.length > 0) localeMap[key] = value;
    else delete localeMap[key];
    entityMap[locale] = localeMap;
    sectionMap[entityId] = entityMap;
  }

  content[section] = sectionMap;
  const pruned = pruneEmpty(content) ?? {};
  return { ...i18n, content: pruned };
}

/** Set a translated option label (fields only). */
export function setFieldOptionTranslation(
  i18n: FormI18nConfig,
  fieldId: string,
  locale: string,
  optionId: string,
  value: string | undefined,
): FormI18nConfig {
  const content = { ...(i18n.content || {}) } as any;
  const fields = { ...(content.fields || {}) };
  const fieldMap = { ...(fields[fieldId] || {}) };
  const localeMap = { ...(fieldMap[locale] || {}) };
  const opts = { ...(localeMap.options || {}) };
  if (value && value.length > 0) opts[optionId] = value;
  else delete opts[optionId];
  if (Object.keys(opts).length > 0) localeMap.options = opts;
  else delete localeMap.options;
  fieldMap[locale] = localeMap;
  fields[fieldId] = fieldMap;
  content.fields = fields;
  const pruned = pruneEmpty(content) ?? {};
  return { ...i18n, content: pruned };
}

/** Read helpers (return undefined when not translated → caller falls back to base value). */
export function getOverlayValue(
  i18n: FormI18nConfig,
  section: Section,
  entityId: string,
  locale: string,
  key: string,
): string | undefined {
  const content = i18n.content || {};
  if (section === "branding") {
    return (content.branding as any)?.[locale]?.[key];
  }
  return (content as any)?.[section]?.[entityId]?.[locale]?.[key];
}

export function getFieldOptionTranslation(
  i18n: FormI18nConfig,
  fieldId: string,
  locale: string,
  optionId: string,
): string | undefined {
  return i18n.content?.fields?.[fieldId]?.[locale]?.options?.[optionId];
}

/* ------------------------------------------------------------------ */
/* Coverage helpers (B5 — Form Builder UI only, never public surface) */
/* ------------------------------------------------------------------ */

export type LocaleCoverage = { translated: number; total: number };

const hasBaseValue = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

const hasOverlayValue = (v: unknown): boolean =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Mirror of FormBuilder's option-key rule: legacy index-based ids (`String(index)`).
 * Must stay in sync with `handleUpdateFieldOption` / `getFieldOptionTranslation` callsites.
 */
const optionKeyForIndex = (index: number): string => String(index);

/** Extract option base values from a field.options payload (tolerates legacy shapes). */
function extractOptionBaseValues(options: unknown): string[] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((o) => (typeof o === "string" ? o : "")).filter((s) => s.length > 0);
  }
  if (typeof options === "object") {
    const inner = (options as { options?: unknown }).options;
    if (Array.isArray(inner)) {
      return inner.map((o) => (typeof o === "string" ? o : "")).filter((s) => s.length > 0);
    }
  }
  return [];
}

/** Step coverage: counts `title` (and `description` if present in base). */
export function computeStepCoverage(
  i18n: FormI18nConfig,
  locale: string,
  step: { id: string; step_title?: string | null; step_description?: string | null },
): LocaleCoverage {
  let total = 0;
  let translated = 0;
  const overlay = i18n.content?.steps?.[step.id]?.[locale];
  if (hasBaseValue(step.step_title)) {
    total += 1;
    if (hasOverlayValue(overlay?.title)) translated += 1;
  }
  if (hasBaseValue(step.step_description)) {
    total += 1;
    if (hasOverlayValue(overlay?.description)) translated += 1;
  }
  return { translated, total };
}

/**
 * Field coverage: counts `label`, `placeholder`, `help_text` (only when base has value)
 * + each option (key = `String(index)`, matching FormBuilder.tsx).
 */
export function computeFieldCoverage(
  i18n: FormI18nConfig,
  locale: string,
  field: {
    id: string;
    field_label?: string | null;
    placeholder?: string | null;
    help_text?: string | null;
    options?: unknown;
  },
): LocaleCoverage {
  let total = 0;
  let translated = 0;
  const overlay = i18n.content?.fields?.[field.id]?.[locale];

  if (hasBaseValue(field.field_label)) {
    total += 1;
    if (hasOverlayValue(overlay?.label)) translated += 1;
  }
  if (hasBaseValue(field.placeholder)) {
    total += 1;
    if (hasOverlayValue(overlay?.placeholder)) translated += 1;
  }
  if (hasBaseValue(field.help_text)) {
    total += 1;
    if (hasOverlayValue(overlay?.help_text)) translated += 1;
  }

  const baseOptions = extractOptionBaseValues(field.options);
  for (let i = 0; i < baseOptions.length; i++) {
    total += 1;
    const key = optionKeyForIndex(i);
    if (hasOverlayValue(overlay?.options?.[key])) translated += 1;
  }

  return { translated, total };
}

/**
 * Branding coverage: counts each translatable key that has a base (non-empty) value.
 * Caller passes the base branding record (the same shape persisted in `form_branding`).
 */
export const TRANSLATABLE_BRANDING_COVERAGE_KEYS = [
  "form_title",
  "form_subtitle",
  "submit_button_text",
  "next_button_text",
  "previous_button_text",
  "success_title",
  "success_message",
  "footer_text",
  "location_rejection_message",
] as const;

export function computeBrandingCoverage(
  i18n: FormI18nConfig,
  locale: string,
  branding: Record<string, unknown> | null | undefined,
): LocaleCoverage {
  let total = 0;
  let translated = 0;
  const overlay = i18n.content?.branding?.[locale] || {};
  for (const key of TRANSLATABLE_BRANDING_COVERAGE_KEYS) {
    if (hasBaseValue(branding?.[key])) {
      total += 1;
      if (hasOverlayValue((overlay as Record<string, unknown>)[key])) translated += 1;
    }
  }
  return { translated, total };
}
