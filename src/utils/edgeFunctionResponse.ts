/**
 * Helpers for consuming `supabase.functions.invoke` results.
 *
 * WHY THIS EXISTS
 *
 * Our Edge Functions build success responses as
 * `new Response(JSON.stringify(payload), { headers: corsHeaders })`, and
 * `_shared/cors.ts#getCorsHeaders` deliberately returns only the
 * Access-Control-* headers — no `Content-Type`. The platform therefore serves
 * the body as `text/plain;charset=UTF-8`.
 *
 * `functions.invoke` chooses how to decode the body from that content type:
 * JSON is parsed, `text/plain` is not. So a function that returns a JSON body
 * without setting `Content-Type` gives the caller the raw JSON **string**, and
 * every field read off it evaluates to `undefined` — no error, no throw, just
 * silently absent data. That is what broke the client portal's "Download PDF"
 * button: `data.quotes.length` was `undefined` on a perfectly good HTTP 200
 * payload, so the UI reported "esta proposta não tem orçamentos associados".
 *
 * Normalizing on the client keeps working whether or not the function is later
 * fixed to send `Content-Type: application/json` — an object passes straight
 * through, a JSON string is parsed.
 */

/**
 * Normalize an `invoke` payload into an object.
 *
 * Returns `null` when the payload is absent or is not decodable JSON, so the
 * caller can tell "the server said nothing useful" apart from "the server sent
 * a valid but empty result".
 */
export function parseEdgeFunctionPayload<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === "object" ? (parsed as T) : null;
    } catch {
      return null;
    }
  }

  if (typeof data === "object") return data as T;

  return null;
}

/**
 * Best-effort human-readable message for an `invoke` failure.
 *
 * `FunctionsHttpError` carries only the generic "Edge Function returned a
 * non-2xx status code" in `message`; the message the function actually sent
 * lives in the unread `context` Response body. Without reading it the user is
 * shown nothing actionable, and whoever debugs it later has nothing to go on.
 */
export async function describeEdgeFunctionError(error: unknown): Promise<string> {
  const fallback = "Não foi possível concluir a operação. Tenta novamente.";
  if (!error) return fallback;

  const context: unknown = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const raw = await context.clone().text();
      const payload = parseEdgeFunctionPayload<{ message?: string; error?: string }>(raw);
      const detail = payload?.message || payload?.error || raw.trim();
      if (detail) return `${detail} (HTTP ${context.status})`;
      return `O servidor respondeu HTTP ${context.status}.`;
    } catch {
      return `O servidor respondeu HTTP ${context.status}.`;
    }
  }

  if (error instanceof Error && error.message) return error.message;

  const message: unknown = (error as { message?: unknown }).message;
  if (typeof message === "string" && message) return message;

  return fallback;
}
