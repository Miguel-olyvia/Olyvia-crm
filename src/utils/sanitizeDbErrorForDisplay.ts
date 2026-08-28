/**
 * Recognizes raw database/PostgREST error text and replaces it wholesale
 * before it reaches a toast. Shared by both toast channels in the app:
 *
 *  - Channel A: `src/hooks/use-toast.ts` (167 call sites, wired centrally).
 *  - Channel B: the 72 files that import `sonner` directly (wired site by
 *    site by whoever picks that up — call this same function there).
 *
 * Deliberately has no dependency on React or on `use-toast.ts`, so either
 * channel can call it with nothing but a string.
 *
 * THE RULE
 * --------
 * 1. Recognize by RIGID SIGNATURE ONLY — formats that can only come out of
 *    Postgres/PostgREST internals, never out of a hand-written UI string.
 *    A loose keyword match (e.g. "permission" or "invalid") would eat
 *    legitimate validation and permission messages, which is worse than the
 *    problem this module solves. See the rejected-patterns list below.
 * 2. When recognized: throw away the ENTIRE technical message (not just the
 *    offending fragment — a message that leaked a constraint name once can
 *    leak something else next time) and replace it with the specific
 *    `FRIENDLY_MAP` text when there is one, or a generic fallback otherwise.
 *    Report the original text to Sentry, tagged `db-error-leaked-to-ui`, so
 *    every call site that still produces raw DB text is discoverable in
 *    production — silently hiding an error that isn't ALSO one of the ~160
 *    already-instrumented sites would make it disappear completely.
 * 3. When NOT recognized: return the input unchanged, byte for byte, and
 *    report nothing. This module never redacts PII inside a message that
 *    isn't itself a raw database error (that is `scrubMessage.ts`'s job, for
 *    Sentry payloads specifically — not this module's, and not the toast's).
 * 4. Never throws. Any internal failure (including the Sentry call itself)
 *    degrades to "show the original text, unsanitized" — a toast must never
 *    break because of this.
 */
import { getGenericFriendlyFallback, mapFriendlyErrorText } from "@/utils/friendlyError";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export interface SanitizedErrorMessage {
  /** What to show the user. Equal to the input when nothing was recognized. */
  text: string;
  /** True only when a raw DB/PostgREST signature was recognized and replaced. */
  wasSanitized: boolean;
}

// Each pattern below is a format that Postgres, PostgREST, or the Supabase
// client emit verbatim and that has no legitimate reason to appear in a
// hand-written UI string. Ordered roughly by how often the audit
// (classificacao-erros-toast.md) found each one leaking into a toast.
const DB_ERROR_SIGNATURES: RegExp[] = [
  // "violates unique constraint", "violates not-null constraint",
  // "violates foreign key constraint \"x\"", "violates check constraint"...
  //
  // O quantificador {1,3} existe porque o nome da restricao pode ter mais do
  // que uma palavra: `[\w"]+` nao atravessa espacos e deixava passar
  // "violates foreign key constraint", que e a segunda assinatura mais comum
  // depois do duplicate key. O comentario acima ja dizia que a cobria; a
  // implementacao nao cumpria. Limitado a 3 para nao virar apanha-tudo.
  /violates\s+(?:[\w"-]+\s+){1,3}constraint/i,
  // "duplicate key value violates unique constraint ..."
  /duplicate key value/i,
  // "null value in column \"x\" violates not-null constraint"
  /null value in column/i,
  // "Failing row contains (...)" — dumps the entire row. CampaignFieldsConfig.tsx:482.
  /Failing row contains/i,
  /row-level security policy/i,
  // "invalid input syntax for type uuid: \"...\""
  /invalid input syntax for/i,
  // "relation \"public.anew_users\" does not exist"
  /relation\s+"[^"]+"\s+does not exist/i,
  // "column proposals.valor does not exist" / column "x" does not exist
  /column\s+"?[\w.]+"?\s+does not exist/i,
  // Postgres's fixed phrasing: "permission denied for <object-type> <name>".
  // Distinct from the app's own Portuguese "Sem permissão"/"Não tem
  // permissão" messages, so this does not collide with them.
  /permission denied for\s+\w+/i,
  // PostgREST error codes, e.g. PGRST116, PGRST200.
  /\bPGRST\d{3}\b/,
  // Postgres SQLSTATE, only when explicitly labeled — see rejected patterns.
  /\bSQLSTATE\s+[0-9A-Za-z]{5}\b/,
];

/*
 * REJECTED SIGNATURES (considered, not implemented — false-positive risk):
 *
 * - A bare 5-character alphanumeric code (SQLSTATE without the "SQLSTATE"
 *   label) is indistinguishable from a legitimate short id, code, or SKU
 *   fragment. Only matched when the literal word "SQLSTATE" is attached.
 * - Generic "permission"/"forbidden"/"not allowed" keywords are exactly
 *   `FRIENDLY_MAP`'s job for messages that ARE meant to reach the user (e.g.
 *   "Sem permissão para exportar"); matching on the bare keyword here would
 *   swallow those. Only Postgres's fixed "permission denied for <type>"
 *   phrasing is treated as a leak.
 * - A bare 9-digit run (candidate for a Portuguese NIF, mirroring
 *   `scrubMessage.ts`) is not a database-error signature at all — it is a
 *   PII pattern, out of scope for a module whose job is "which whole
 *   messages are illegitimate", not "which substrings are personal data".
 * - "not found" / "does not exist" alone, without the "relation"/"column"
 *   prefix, is also a legitimate application message (e.g. "Cliente não
 *   encontrado"); only the schema-qualified Postgres phrasing is matched.
 */

function looksLikeRawDbError(message: string): boolean {
  return DB_ERROR_SIGNATURES.some((pattern) => pattern.test(message));
}

/**
 * Sanitizes a single error-message string for display in a toast.
 *
 * @param raw the technical message as it would otherwise be shown (e.g.
 *   `error.message` from a Supabase/PostgREST call).
 */
export function sanitizeDbErrorForDisplay(raw: string): SanitizedErrorMessage {
  try {
    if (typeof raw !== "string" || raw.length === 0) {
      return { text: raw, wasSanitized: false };
    }

    if (!looksLikeRawDbError(raw)) {
      return { text: raw, wasSanitized: false };
    }

    const mapped = mapFriendlyErrorText(raw);
    const friendlyText = mapped !== raw ? mapped : getGenericFriendlyFallback();

    // Report ONLY the still-raw original text, tagged as a leak site. This
    // must happen before we return the sanitized text; if it throws, the
    // whole call degrades to "unsanitized, unreported" rather than partially
    // hiding without a paper trail.
    captureFlowError(new Error(raw), "db-error-leaked-to-ui");

    return { text: friendlyText, wasSanitized: true };
  } catch {
    // Sanitization (including the Sentry report) must never break a toast.
    return { text: raw, wasSanitized: false };
  }
}
