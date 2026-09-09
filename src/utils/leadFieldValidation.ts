/**
 * Validation for lead field values captured through the manual "create lead"
 * dialog.
 *
 * Background: the public form enforces `form_fields.pattern` (e.g. the Portuguese
 * postal code `^[0-9]{4}-[0-9]{3}$`), but the manual dialog used to drop those
 * constraints and only checked `is_required && !value`. A lone "-" therefore
 * satisfied every required text field, which is how leads ended up stored with
 * `po_codigo_postal = "-"` and `po_morada = "-"`.
 */

export const POSTAL_CODE_PT_PATTERN = "^[0-9]{4}-[0-9]{3}$";

const POSTAL_CODE_KEY_HINTS = [
  "codigo_postal",
  "código_postal",
  "postal_code",
  "postalcode",
  "zip",
  "cep",
];

/** Values that are technically non-empty but carry no information. */
const FILLER_VALUE_CHARS = " \t\r\n-–—_.·•/\\";
const isFillerOnly = (text: string): boolean =>
  text.split("").every((char) => FILLER_VALUE_CHARS.includes(char));
const FILLER_WORD_PATTERN = /^(n\/a|n\.a\.?|n\/d|none|null|undefined)$/i;

export interface LeadFieldConstraint {
  field_key: string;
  field_label: string;
  field_type?: string | null;
  is_required?: boolean | null;
  pattern?: string | null;
  pattern_message?: string | null;
  min_length?: number | null;
  max_length?: number | null;
}

export interface LeadFieldError {
  fieldKey: string;
  fieldLabel: string;
  message: string;
}

export const isPostalCodeField = (fieldKey: string): boolean => {
  const key = String(fieldKey || "").toLowerCase();
  return POSTAL_CODE_KEY_HINTS.some((hint) => key.includes(hint));
};

/** True when the value is absent, blank, or pure filler such as "-" or "n/a". */
export const isMeaninglessValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0 || value.every(isMeaninglessValue);
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return false;
  if (typeof value === "object") return Object.keys(value as object).length === 0;

  const text = String(value).trim();
  if (text === "") return true;
  return isFillerOnly(text) || FILLER_WORD_PATTERN.test(text);
};

/**
 * Effective pattern for a field: the one configured on the field definition,
 * or the Portuguese postal code pattern for postal-code fields that have none.
 */
export const resolveFieldPattern = (field: LeadFieldConstraint): string | null => {
  if (field.pattern) return field.pattern;
  if (isPostalCodeField(field.field_key)) return POSTAL_CODE_PT_PATTERN;
  return null;
};

const buildRegExp = (pattern: string): RegExp | null => {
  try {
    return new RegExp(pattern);
  } catch {
    // A malformed pattern must never block a user from creating a lead.
    console.warn("[leadFieldValidation] invalid pattern ignored", pattern);
    return null;
  }
};

const validateField = (
  field: LeadFieldConstraint,
  rawValue: unknown,
): LeadFieldError | null => {
  const label = field.field_label || field.field_key;
  const empty = isMeaninglessValue(rawValue);

  if (field.is_required && empty) {
    return { fieldKey: field.field_key, fieldLabel: label, message: `${label} é obrigatório` };
  }
  if (empty) return null;
  if (typeof rawValue !== "string") return null;

  const value = rawValue.trim();

  if (typeof field.min_length === "number" && value.length < field.min_length) {
    return {
      fieldKey: field.field_key,
      fieldLabel: label,
      message: `${label} deve ter pelo menos ${field.min_length} caracteres`,
    };
  }
  if (typeof field.max_length === "number" && value.length > field.max_length) {
    return {
      fieldKey: field.field_key,
      fieldLabel: label,
      message: `${label} deve ter no máximo ${field.max_length} caracteres`,
    };
  }

  const pattern = resolveFieldPattern(field);
  if (pattern) {
    const regex = buildRegExp(pattern);
    if (regex && !regex.test(value)) {
      const fallback = isPostalCodeField(field.field_key)
        ? `${label} deve ter o formato 1234-567`
        : `${label} tem um formato inválido`;
      return {
        fieldKey: field.field_key,
        fieldLabel: label,
        message: field.pattern_message || fallback,
      };
    }
  }

  return null;
};

/** Validates every field definition against the submitted values. */
export const validateLeadFieldValues = (
  fields: LeadFieldConstraint[],
  values: Record<string, unknown>,
): LeadFieldError[] => {
  const errors: LeadFieldError[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    if (!field?.field_key || seen.has(field.field_key)) continue;
    seen.add(field.field_key);
    const error = validateField(field, values?.[field.field_key]);
    if (error) errors.push(error);
  }

  return errors;
};
