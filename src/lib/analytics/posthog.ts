import posthog from "posthog-js";

/**
 * Field names that must never reach PostHog as event/user properties — same
 * PII surface already scrubbed for Sentry in main.tsx (leads/contacts/clients
 * email, phone, NIF, names, addresses).
 */
const PII_KEY_PATTERN = /email|phone|telefone|nif|iban|password|token|address|morada|first_?name|last_?name|display_?name|\bnome\b|signat/i;

function scrubPii<T>(value: T, depth = 0): T {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY_PATTERN.test(key) ? "[Filtered]" : scrubPii(val, depth + 1);
    }
    return out as T;
  }
  return value;
}

let initialized = false;

/** No-op until VITE_POSTHOG_KEY is set — safe to call unconditionally from app boot. */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key || initialized) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    // Session recordings are opt-in at the project level in PostHog itself;
    // if enabled later, mask every input by default so form fields (NIF,
    // phone, email, addresses) never appear in a recording.
    session_recording: {
      maskAllInputs: true,
    },
    before_send: (event) => (event ? (scrubPii(event) as typeof event) : event),
  });
  initialized = true;
}

/** Call after a successful sign-in. Identifies by user id only — no email/name. */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(userId, properties ? scrubPii(properties) : undefined);
}

/** Call on sign-out so the next session doesn't inherit the previous user's identity. */
export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

/** Respect a user's opt-out choice (wire to a cookie-consent banner action). */
export function optOutAnalytics(): void {
  if (!initialized) return;
  posthog.opt_out_capturing();
}

export function optInAnalytics(): void {
  if (!initialized) return;
  posthog.opt_in_capturing();
}

export { posthog };
