/**
 * Sentry error tracking for Edge Functions.
 *
 * Each function calls initSentry() once at module load, then captureError()
 * inside its existing catch block. defaultIntegrations is disabled because
 * Sentry's default Node/browser integrations don't apply to the isolated
 * per-request Deno runtime and can leak state across concurrent invocations.
 * captureError awaits Sentry.flush() because the function process can be
 * torn down immediately after the response is returned — without flushing,
 * queued events are silently dropped.
 */
import * as Sentry from "npm:@sentry/deno@^8";

let initialized = false;

// Field names that must never leave this function in a Sentry event — leads/
// contacts/clients PII (email, phone, NIF, names, addresses) that can end up
// in error `extra` context via captureError(error, { function: "...", ... })
// call sites, or in request bodies. Does NOT scrub PII embedded directly in
// an exception's own message or stack trace text — that would require
// unreliable content sniffing and is a known limitation, not something
// beforeSend can fix. Mirrors src/main.tsx's frontend scrubber.
const PII_KEY_PATTERN = /email|phone|telefone|nif|iban|password|token|address|morada|first_?name|last_?name|display_?name|\bnome\b|signat/i;
const REDACTED = "[Filtered]";

function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY_PATTERN.test(key) ? REDACTED : scrubPii(val, depth + 1);
    }
    return out;
  }
  return value;
}

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete (event.user as Record<string, unknown>).username;
  }
  if (event.extra) event.extra = scrubPii(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubPii(event.contexts) as typeof event.contexts;
  if (event.request) {
    if (event.request.data) event.request.data = scrubPii(event.request.data);
    if (event.request.query_string) event.request.query_string = REDACTED;
    delete event.request.cookies;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, data: b.data ? (scrubPii(b.data) as Record<string, unknown>) : b.data }));
  }
  return event;
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
  initialized = true;
}

export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
  await Sentry.flush(2000);
}
