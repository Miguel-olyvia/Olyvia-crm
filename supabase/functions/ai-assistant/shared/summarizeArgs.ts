// Defensive summarizer for tool-call arguments shown in the assistant UI.
// Goals: redact secrets, mask PII, truncate long fields, never crash.

const REDACT_KEYS = new Set([
  "password",
  "pass",
  "secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "auth",
  "otp",
  "pin",
  "cvv",
  "card_number",
  "iban",
]);

const EMAIL_KEYS = /(^|_)email$/i;
const PHONE_KEYS = /(^|_)(phone|telefone|mobile|telemovel|telemóvel)$/i;
const NIF_KEYS = /(^|_)nif$/i;

const LONG_TEXT_KEYS = new Set([
  "notes",
  "description",
  "content",
  "message",
  "body",
  "html",
  "body_html",
  "subject",
  "text",
  "transcript",
  "summary",
  "observations",
  "observacoes",
  "observações",
]);

const LARGE_STRUCT_KEYS = new Set([
  "action_config",
  "trigger_conditions",
  "conditions",
  "actions",
  "payload",
  "metadata",
  "field_values",
  "data",
  "extra",
]);

const HARD_CAP = 240;
const LONG_TEXT_TRUNCATE = 60;
const STRING_TRUNCATE = 60;
const STRING_LONG_THRESHOLD = 80;

function maskEmail(v: string): string {
  const m = v.match(/^(.)([^@]*)(@.+)$/);
  if (!m) return "***";
  return `${m[1]}***${m[3]}`;
}

function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const tail = digits.slice(-2);
  const prefix = v.startsWith("+") ? `+${digits.slice(0, digits.length - 2 - 2)}` : "";
  const stars = "*".repeat(Math.max(0, digits.length - 2 - (prefix ? prefix.length - 1 : 0)));
  return `${prefix}${stars}${tail}`;
}

function maskNif(v: string): string {
  const s = String(v);
  if (s.length <= 3) return "***";
  return `***${s.slice(-3)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function formatPrimitive(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v.length > STRING_LONG_THRESHOLD) return JSON.stringify(truncate(v, STRING_TRUNCATE));
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

function formatValue(key: string, value: unknown, depth: number): string | null {
  if (value === undefined) return null;
  if (typeof value === "string" && value === "") return null;

  const lk = key.toLowerCase();

  if (REDACT_KEYS.has(lk)) return "***";
  if (NIF_KEYS.test(lk) && typeof value === "string") return maskNif(value);
  if (EMAIL_KEYS.test(lk) && typeof value === "string") return maskEmail(value);
  if (PHONE_KEYS.test(lk) && typeof value === "string") return maskPhone(value);

  if (LARGE_STRUCT_KEYS.has(lk)) {
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (value && typeof value === "object") return `{${Object.keys(value).length} campos}`;
    return formatPrimitive(value);
  }

  if (LONG_TEXT_KEYS.has(lk) && typeof value === "string") {
    return JSON.stringify(truncate(value, LONG_TEXT_TRUNCATE));
  }

  if (Array.isArray(value)) {
    const shown = value.slice(0, 3).map((v) => formatPrimitive(v));
    const extra = value.length > 3 ? `, …+${value.length - 3}` : "";
    return `[${shown.join(", ")}${extra}]`;
  }

  if (value && typeof value === "object") {
    if (depth >= 1) return "{…}";
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const formatted = formatValue(k, v, depth + 1);
        return formatted == null ? null : `${k}=${formatted}`;
      })
      .filter((x): x is string => x != null)
      .sort();
    return `{${entries.join(", ")}}`;
  }

  return formatPrimitive(value);
}

export function summarizeToolArgs(args: unknown): string {
  try {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return truncate(JSON.stringify(args ?? null), HARD_CAP);
    }
    const pairs = Object.entries(args as Record<string, unknown>)
      .map(([k, v]) => {
        const formatted = formatValue(k, v, 0);
        return formatted == null ? null : `${k}=${formatted}`;
      })
      .filter((x): x is string => x != null)
      .sort();
    return truncate(pairs.join(", "), HARD_CAP);
  } catch {
    return "";
  }
}
