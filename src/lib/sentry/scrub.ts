import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { REDACTED, scrubMessageText } from "./scrubMessage";

// Field names that must never leave this browser in a Sentry event — leads/
// contacts/clients PII (email, phone, NIF, names, addresses) that can end up
// in error `extra` context, breadcrumbs, or request data via
// Sentry.captureException(error, { extra: {...} }) call sites elsewhere in
// the app. PII embedded in the *text* of an error (the exception value, the
// event message, or any string leaf that survives this key check) is handled
// separately by `scrubMessageText`; stack traces are still not scrubbed.
const PII_KEY_PATTERN =
  /email|phone|telefone|nif|iban|password|token|address|morada|first_?name|last_?name|display_?name|\bnome\b|signat/i;

export { REDACTED };

const MAX_SCRUB_DEPTH = 5;

export function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY_PATTERN.test(key) ? REDACTED : scrubPii(val, depth + 1);
    }
    return out;
  }
  // A string leaf under a harmless-looking key (`details`, `hint`, `message`)
  // is where a PostgREST error object hides its `Key (email)=(...)` detail.
  if (typeof value === "string") return scrubMessageText(value);
  return value;
}

export const isModuleLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
};

// ── URL sanitising: allow-list, never a regex blacklist ─────────────────────
// Supabase/PostgREST puts row filters in the query string, so a client search
// produces `.../rest/v1/clients?email=eq.joao%40exemplo.pt`. Anything past the
// path is therefore assumed to be customer data and dropped wholesale. We
// rebuild the URL from `origin + pathname` instead of trying to strip the
// parts we recognise — an unparseable or unexpected URL fails closed to
// `[Filtered]` rather than being passed through.
export function sanitizeUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return REDACTED;
  const base = typeof window !== "undefined" ? window.location?.origin : undefined;
  try {
    const parsed = new URL(rawUrl, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return REDACTED;
    // `origin` already excludes any `user:password@` credentials.
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return REDACTED;
  }
}

// Only these keys survive on a network breadcrumb. Everything else (request
// body, response body, headers, whatever a future SDK version starts adding)
// is dropped without inspection.
const NETWORK_BREADCRUMB_SAFE_KEYS = ["method", "status_code"] as const;
const NETWORK_BREADCRUMB_CATEGORIES = new Set(["fetch", "xhr"]);
const NAVIGATION_BREADCRUMB_CATEGORIES = new Set(["navigation"]);

function sanitizeNetworkBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = (breadcrumb.data ?? {}) as Record<string, unknown>;
  const safeData: Record<string, unknown> = { url: sanitizeUrl(data.url) };
  for (const key of NETWORK_BREADCRUMB_SAFE_KEYS) {
    if (data[key] !== undefined) safeData[key] = data[key];
  }
  const sanitized: Breadcrumb = { ...breadcrumb, data: safeData };
  // The SDK echoes the URL into `message` for some transports; it carries no
  // information the sanitised `data` lacks, so it goes.
  delete sanitized.message;
  return sanitized;
}

function sanitizeNavigationBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = (breadcrumb.data ?? {}) as Record<string, unknown>;
  const safeData: Record<string, unknown> = {};
  if (data.from !== undefined) safeData.from = sanitizeUrl(data.from);
  if (data.to !== undefined) safeData.to = sanitizeUrl(data.to);
  return { ...breadcrumb, data: safeData };
}

/**
 * Sentry `beforeBreadcrumb` hook. Network breadcrumbs keep origin + path only;
 * every other category still goes through the key-based PII scrubber.
 */
export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  if (NETWORK_BREADCRUMB_CATEGORIES.has(category)) return sanitizeNetworkBreadcrumb(breadcrumb);
  if (NAVIGATION_BREADCRUMB_CATEGORIES.has(category)) return sanitizeNavigationBreadcrumb(breadcrumb);
  if (breadcrumb.data) {
    return { ...breadcrumb, data: scrubPii(breadcrumb.data) as Record<string, unknown> };
  }
  return breadcrumb;
}

function eventMessages(event: ErrorEvent): string[] {
  const values = event.exception?.values ?? [];
  const messages = values.map((v) => `${v.type ?? ""}: ${v.value ?? ""}`);
  if (event.message) messages.push(event.message);
  return messages;
}

/**
 * Sentry `beforeSend` hook. Returns `null` to drop the event entirely.
 */
export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  // Stale-chunk errors after a deploy are handled in-app with a reload banner;
  // they are noise in Sentry. This must live here and not only in the app's
  // `unhandledrejection` listener: the SDK installs its own
  // `window.onunhandledrejection` handler at init time, which runs before that
  // listener and is not stopped by its `preventDefault()`.
  if (eventMessages(event).some((message) => isModuleLoadError(message))) return null;

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
    if (event.request.url) event.request.url = sanitizeUrl(event.request.url);
    delete event.request.cookies;
  }
  // Defence in depth: breadcrumbs already passed through `beforeBreadcrumb`,
  // but any added before init (or by another code path) is sanitised here too.
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((b) => beforeBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }
  // The exception value is the issue *title* in Sentry, so PII there is the
  // most visible leak of all. `type` and `stacktrace` are left untouched: they
  // carry no customer data and are what makes an issue actionable.
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = scrubMessageText(value.value);
  }
  if (typeof event.message === "string") event.message = scrubMessageText(event.message);
  if (event.logentry && typeof event.logentry.message === "string") {
    event.logentry.message = scrubMessageText(event.logentry.message);
  }
  return event;
}

// Browser/extension noise that would otherwise train us to ignore alerts.
export const SENTRY_IGNORE_ERRORS: (string | RegExp)[] = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured with value: object Not Found Matching Id",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  "The network connection was lost",
  "AbortError",
  "The operation was aborted",
];

export const SENTRY_DENY_URLS: (string | RegExp)[] = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
  /^chrome:\/\//i,
];
