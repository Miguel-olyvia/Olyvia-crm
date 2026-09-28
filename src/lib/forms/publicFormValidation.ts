/**
 * Dynamic Zod validation for the public lead form (`PublicLeadForm`).
 *
 * Campaign owners configure form fields at runtime (field_key, field_type,
 * is_required, min/max_length, min/max_value, pattern, ...), so there is no
 * static schema to hand-write. Instead we build a Zod schema per step from
 * the field metadata returned by `get-form-data`, then validate the values
 * the visitor typed before allowing submission.
 *
 * This module only adds format/bounds validation (email shape, phone
 * digits, min/max length, min/max value, custom pattern). It intentionally
 * mirrors — and does not replace — the existing "required field" toast
 * behavior in `PublicLeadForm.validateCurrentStep`, so valid submissions
 * keep behaving exactly as before.
 */
import { z } from "zod";
import { COUNTRY_CODES } from "@/constants/countryCodes";

// Indicativos ordenados do mais longo para o mais curto, para o mesmo
// motivo do PublicLeadForm case "phone": "+1" nao pode "comer" por engano
// o prefixo de um indicativo mais longo que tambem comece por "1".
const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

/**
 * Numero de digitos do telefone SEM o indicativo (ex.: "+351912345678" -> 9).
 * min_length/max_length de um campo phone configurado antes deste campo
 * passar a gravar "+<indicativo><digitos>" contavam so os digitos -- por
 * isso continuam a validar so os digitos, nao a string toda com o "+" e o
 * indicativo, que teria um comprimento diferente por pais e quebraria
 * qualquer campanha ja configurada.
 */
function phoneNationalDigitsLength(value: string): number {
  const matched = COUNTRY_CODES_BY_LENGTH.find((c) => value.startsWith(c.dialCode));
  const digits = matched ? value.slice(matched.dialCode.length) : value.replace(/^\+/, "");
  return digits.length;
}

export interface ValidatableField {
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_multi_select?: boolean;
  display_style?: string;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  pattern_message?: string | null;
}

export interface FieldValidationError {
  fieldKey: string;
  message: string;
}

const EMPTY_VALUE = Symbol("empty");

/** Treat "", null, undefined and empty arrays as "not provided" (required-ness is handled separately). */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    // Malformed pattern configured by a campaign owner — don't block the visitor.
    return null;
  }
}

/**
 * Builds a Zod schema entry for a single field, based purely on format/bounds
 * (never on required-ness — that stays the caller's responsibility so the
 * existing UX for missing required fields is unchanged).
 */
function buildFieldSchema(field: ValidatableField): z.ZodTypeAny {
  const label = field.field_label || field.field_key;

  // Checkbox-style fields are rendered/stored as string arrays via
  // handleMultiSelectChange in PublicLeadForm.tsx regardless of is_multi_select
  // (see the render condition at PublicLeadForm.tsx ~line 1599:
  // `field.is_multi_select || displayStyle === 'checkbox'`) - mirror that
  // exact condition here, or a checkbox field with is_multi_select=false gets
  // validated as a plain string against an array value and always fails.
  if (field.is_multi_select || field.display_style === "checkbox") {
    // Multi-select values are string arrays; only bounds checks apply.
    let schema = z.array(z.string());
    if (typeof field.min_length === "number") {
      schema = schema.min(field.min_length, `${label}: selecione pelo menos ${field.min_length} opção(ões)`);
    }
    if (typeof field.max_length === "number") {
      schema = schema.max(field.max_length, `${label}: selecione no máximo ${field.max_length} opção(ões)`);
    }
    return schema;
  }

  if (field.field_type === "number") {
    // The input stores numeric fields as strings (see renderField number case),
    // so coerce before applying numeric bounds.
    let schema = z.coerce.number({ invalid_type_error: `${label}: valor numérico inválido` });
    if (typeof field.min_value === "number") {
      schema = schema.min(field.min_value, `${label}: deve ser maior ou igual a ${field.min_value}`);
    }
    if (typeof field.max_value === "number") {
      schema = schema.max(field.max_value, `${label}: deve ser menor ou igual a ${field.max_value}`);
    }
    return schema;
  }

  let stringSchema = z.string();
  const isPhone = field.field_type === "phone";

  if (field.field_type === "email") {
    stringSchema = stringSchema.email(`${label}: formato de email inválido`);
  }

  if (isPhone) {
    // O campo grava "+<indicativo><digitos>" (PhoneInput never assume um
    // indicativo por omissao -- ver PublicLeadForm case "phone"). O "+"
    // aqui nao e opcional: sem ele, o visitante nao escolheu pais nenhum.
    stringSchema = stringSchema.regex(
      /^\+[0-9]+$/,
      `${label}: escolha o indicativo do país e escreva só números`
    );
  } else {
    if (typeof field.min_length === "number") {
      stringSchema = stringSchema.min(field.min_length, `${label}: deve ter pelo menos ${field.min_length} caracteres`);
    }
    if (typeof field.max_length === "number") {
      stringSchema = stringSchema.max(field.max_length, `${label}: deve ter no máximo ${field.max_length} caracteres`);
    }
  }

  if (field.pattern) {
    const regex = safeRegExp(field.pattern);
    if (regex) {
      stringSchema = stringSchema.regex(regex, field.pattern_message || `${label}: formato inválido`);
    }
  }

  if (!isPhone) {
    return stringSchema;
  }

  // min_length/max_length de um campo phone contam os digitos do numero,
  // nao o indicativo -- por isso aplicados aqui, sobre stringSchema ja
  // pronto (regex + pattern), em vez do bloco generico acima (que contaria
  // "+351" ou "+34" como parte do comprimento e rejeitava numeros validos
  // so por o indicativo ter um numero de digitos diferente do que a
  // campanha configurou antes deste campo passar a incluir o indicativo).
  // z.refine() devolve ZodEffects, não ZodString -- só entra aqui no fim,
  // depois de stringSchema já ter os métodos de ZodString (.regex/.email)
  // todos aplicados, para não perder acesso a eles a meio da cadeia.
  let phoneSchema: z.ZodTypeAny = stringSchema;
  if (typeof field.min_length === "number") {
    const min = field.min_length;
    phoneSchema = phoneSchema.refine(
      (val) => phoneNationalDigitsLength(val as string) >= min,
      `${label}: deve ter pelo menos ${min} dígitos`
    );
  }
  if (typeof field.max_length === "number") {
    const max = field.max_length;
    phoneSchema = phoneSchema.refine(
      (val) => phoneNationalDigitsLength(val as string) <= max,
      `${label}: deve ter no máximo ${max} dígitos`
    );
  }
  return phoneSchema;
}

/**
 * Validates the values for a single step against the field metadata.
 * Only non-empty values are checked (required-ness is handled by the caller's
 * existing "is_required" pass) — this purely catches malformed data that
 * would otherwise pass through silently (bad email, out-of-range number,
 * text too long/short, pattern mismatch).
 *
 * Returns the first validation error found, or null when everything valid.
 */
export function validateStepFieldFormats(
  fields: ValidatableField[],
  values: Record<string, unknown>
): FieldValidationError | null {
  for (const field of fields) {
    const rawValue = values[field.field_key];
    if (isEmptyValue(rawValue)) continue; // required-ness handled elsewhere

    const schema = buildFieldSchema(field);
    const result = schema.safeParse(rawValue);
    if (!result.success) {
      const message = result.error.issues[0]?.message || `${field.field_label || field.field_key}: valor inválido`;
      return { fieldKey: field.field_key, message };
    }
  }
  return null;
}
