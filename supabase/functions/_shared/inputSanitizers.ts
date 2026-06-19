// Defensive input sanitizers for public entry-points (create-lead, update-lead,
// insert-lead). Pure module — no Supabase deps — so it can be tested directly.
//
// Rule: any value that ends up in anew_entity_emails, anew_entity_phones, or
// anew_leads.field_values MUST pass through one of these helpers first.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s.length > 254) return null;
  if (/\s/.test(s)) return null;
  if ((s.match(/@/g) || []).length !== 1) return null;
  if (s.includes("..")) return null;
  if (!EMAIL_RE.test(s)) return null;
  const [, domain] = s.split("@");
  if (!domain || !domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;
  return s;
}

export function sanitizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 20) return null;
  if (/^0+$/.test(digits)) return null;
  // Reject "block repeated 2+ times" (e.g. 925230258925230258)
  if (digits.length >= 8 && digits.length % 2 === 0) {
    const half = digits.slice(0, digits.length / 2);
    if (half.length >= 4 && digits === half.repeat(2)) return null;
  }
  if (digits.length >= 12 && digits.length % 3 === 0) {
    const third = digits.slice(0, digits.length / 3);
    if (third.length >= 4 && digits === third.repeat(3)) return null;
  }
  return hasPlus ? `+${digits}` : digits;
}

export function sanitizeText(raw: unknown, maxLen = 500): string {
  if (raw == null) return "";
  let s = String(raw);
  // Strip control chars except \n and \t
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  // Collapse internal whitespace runs to a single space (but keep newlines)
  s = s.replace(/[ \t]+/g, " ");
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function dedupArray<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const key =
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
        ? `${typeof item}:${String(item)}`
        : `json:${JSON.stringify(item)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

const EMAIL_ALIASES = new Set(["email", "po_email", "mail", "e_mail"]);
const PHONE_ALIASES = new Set([
  "phone",
  "po_telefone",
  "telefone",
  "telemovel",
  "mobile",
  "phone_number",
]);

export interface SanitizeFieldValuesReport {
  fields_cleaned: string[];
  email_rejected?: string;
  phone_rejected?: string;
  arrays_deduped: string[];
}

export interface SanitizeFieldValuesResult {
  cleaned: Record<string, any>;
  report: SanitizeFieldValuesReport;
}

/**
 * Sanitize a field_values object in-place-style (returns new object).
 * - Strings: sanitizeText
 * - Arrays: dedupArray + sanitizeText on string members
 * - Keys mapped to email/phone (via contactMapping reverse lookup or known aliases):
 *   re-validated; if rejected, value becomes null and reported.
 * Never deletes keys.
 */
export function sanitizeFieldValues(
  fv: Record<string, any> | null | undefined,
  contactMapping?: Record<string, string>, // contact_field_mapping → field_key
): SanitizeFieldValuesResult {
  const report: SanitizeFieldValuesReport = { fields_cleaned: [], arrays_deduped: [] };
  if (!fv || typeof fv !== "object") {
    return { cleaned: {}, report };
  }

  // Build reverse: field_key → contact_property
  const keyToProp: Record<string, string> = {};
  if (contactMapping) {
    for (const [prop, key] of Object.entries(contactMapping)) {
      if (key) keyToProp[key] = prop;
    }
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(fv)) {
    // Preserve _meta untouched
    if (key === "_meta") {
      cleaned[key] = value;
      continue;
    }

    const lowerKey = key.toLowerCase();
    const mappedProp = keyToProp[key];
    const isEmailField = mappedProp === "email" || EMAIL_ALIASES.has(lowerKey);
    const isPhoneField = mappedProp === "phone" || PHONE_ALIASES.has(lowerKey);

    if (isEmailField && value != null && value !== "") {
      const sanitized = sanitizeEmail(value);
      if (sanitized === null) {
        report.email_rejected = String(value).slice(0, 120);
        report.fields_cleaned.push(key);
        cleaned[key] = null;
      } else {
        if (sanitized !== value) report.fields_cleaned.push(key);
        cleaned[key] = sanitized;
      }
      continue;
    }
    if (isPhoneField && value != null && value !== "") {
      const sanitized = sanitizePhone(value);
      if (sanitized === null) {
        report.phone_rejected = String(value).slice(0, 60);
        report.fields_cleaned.push(key);
        cleaned[key] = null;
      } else {
        if (sanitized !== value) report.fields_cleaned.push(key);
        cleaned[key] = sanitized;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const normalizedMembers = value.map((m) =>
        typeof m === "string" ? sanitizeText(m, 500) : m,
      );
      const deduped = dedupArray(normalizedMembers);
      if (deduped.length !== value.length) report.arrays_deduped.push(key);
      cleaned[key] = deduped;
      continue;
    }

    if (typeof value === "string") {
      const sanitized = sanitizeText(value, 2000);
      if (sanitized !== value) report.fields_cleaned.push(key);
      cleaned[key] = sanitized;
      continue;
    }

    cleaned[key] = value;
  }

  return { cleaned, report };
}
