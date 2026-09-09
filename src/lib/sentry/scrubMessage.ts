// Redaction for the *text* of an error — the exception `value` and the event
// `message` — as opposed to the structured `extra`/`contexts`/`request` data
// handled by the key-based scrubber in `scrub.ts`.
//
// The message text is what Sentry shows as the issue title, so PII that lands
// there is the most visible leak we have. It is also the single most valuable
// piece of debugging information we get, so this module is deliberately
// conservative: it only touches (a) rigid, machine-generated formats whose
// shape is known, and (b) a very small set of free-text patterns that cannot
// plausibly be anything but personal data. Everything else is left alone.
//
// Explicitly NOT redacted, and why:
//  - Phone numbers. In Portugal they are bare 9-digit runs, indistinguishable
//    from row counts, legacy ids, codes and quantities. No pattern we trust,
//    so no pattern at all. See the report/tests for the accepted gap.
//  - Names, addresses, free-text notes. No shape to key off.
//  - Exception `type` and stack frames — never touched by this module.

export const REDACTED = "[Filtered]";

// ── (a) Rigid formats ───────────────────────────────────────────────────────

// Postgres unique/foreign-key violation detail:
//   `Key (email)=(joao@exemplo.pt) already exists.`
//   `Key (organization_id, email)=(9d3..., joao@exemplo.pt) already exists.`
//   `Key (client_id)=(9d3...) is not present in table "clients".`
// The column list is schema, not data: keeping it tells the developer exactly
// which constraint collided. Only the value tuple is redacted.
const PG_KEY_SUFFIX = "(?=\\s+(?:already exists|is not present|is still referenced)|\\s*\\.?\\s*$)";
const PG_KEY_ANCHORED = new RegExp(`Key \\(([^)]*)\\)=\\([\\s\\S]*?\\)${PG_KEY_SUFFIX}`, "g");
// Same format without one of the known trailing clauses (value must then not
// itself contain a closing parenthesis).
const PG_KEY_FALLBACK = /Key \(([^)]*)\)=\([^)]*\)/g;

// Postgres check-constraint / not-null detail, which dumps the entire row:
//   `Failing row contains (1, joao@exemplo.pt, 912345678, ...).`
// There is nothing worth keeping inside the parentheses.
const PG_FAILING_ROW_ANCHORED = /Failing row contains \([\s\S]*?\)(?=\s*\.\s*$|\s*$)/g;
const PG_FAILING_ROW_FALLBACK = /Failing row contains \([^)]*\)/g;

// URLs quoted inside a message. PostgREST puts row filters in the query
// string (`...?email=eq.joao%40exemplo.pt`), so the query and fragment go and
// origin + path stay — the same rule `sanitizeUrl` applies to breadcrumbs.
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>)\]}]+/g;
const URL_CREDENTIALS = /^(https?:\/\/)[^/@]*@/;

function redactUrl(rawUrl: string): string {
  const cut = rawUrl.search(/[?#]/);
  const withoutQuery = cut === -1 ? rawUrl : `${rawUrl.slice(0, cut)}?${REDACTED}`;
  return withoutQuery.replace(URL_CREDENTIALS, `$1${REDACTED}@`);
}

// ── (b) Free-text patterns we trust ─────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// IBAN: two letters, two check digits, then 11-30 alphanumerics (PT is
// PT50 + 21 digits). Uppercase-anchored, so it does not touch lowercase
// identifiers, uuids or constraint names.
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

// Portuguese NIF. A bare 9-digit run on its own is NOT a pattern we trust —
// it is also a phone number, an id or a quantity. What makes this one usable
// is the mod-11 check digit plus the allowed prefixes: a random 9-digit value
// passes both only rarely, so the false-positive cost stays low while real
// NIFs are caught. Capture group 1 is the non-digit boundary, re-emitted.
const NINE_DIGIT_RUN = /(^|[^\d])(\d{9})(?!\d)/g;
const NIF_FIRST_DIGITS = new Set(["1", "2", "3", "5", "6", "8"]);
const NIF_FIRST_TWO_DIGITS = new Set([
  "45", "70", "71", "72", "74", "75", "77", "78", "79", "90", "91", "98", "99",
]);

export function isPortugueseNif(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  if (!NIF_FIRST_DIGITS.has(value[0]) && !NIF_FIRST_TWO_DIGITS.has(value.slice(0, 2))) return false;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += Number(value[i]) * (9 - i);
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return checkDigit === Number(value[8]);
}

/**
 * Redacts personal data from a single error-message string, keeping every
 * technical token (constraint names, column names, types, paths, HTTP status)
 * that a developer needs to act on the issue. Returns the input unchanged when
 * nothing matches — a message that carries no PII must arrive intact.
 */
export function scrubMessageText(message: string): string {
  if (message.length === 0) return message;

  return message
    .replace(PG_KEY_ANCHORED, `Key ($1)=(${REDACTED})`)
    .replace(PG_KEY_FALLBACK, `Key ($1)=(${REDACTED})`)
    .replace(PG_FAILING_ROW_ANCHORED, `Failing row contains (${REDACTED})`)
    .replace(PG_FAILING_ROW_FALLBACK, `Failing row contains (${REDACTED})`)
    .replace(URL_IN_TEXT, (url) => redactUrl(url))
    .replace(EMAIL, REDACTED)
    .replace(IBAN, REDACTED)
    .replace(NINE_DIGIT_RUN, (match, boundary: string, digits: string) =>
      isPortugueseNif(digits) ? `${boundary}${REDACTED}` : match
    );
}

/** Convenience wrapper for values whose type is not known to be a string. */
export function scrubMessageValue(value: unknown): unknown {
  return typeof value === "string" ? scrubMessageText(value) : value;
}
