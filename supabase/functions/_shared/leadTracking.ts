// Shared lead tracking sanitizer for Edge Functions.
// Independent copy (no cross-import from src/).

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "landing_page",
  "referrer",
  "captured_at",
] as const;

const MAX_VALUE_LEN = 500;
const MAX_TOTAL_BYTES = 2048;

export function sanitizeTracking(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const key of TRACKING_KEYS) {
    const raw = src[key];
    if (raw == null) continue;
    const v = String(raw).trim().slice(0, MAX_VALUE_LEN);
    if (v) out[key] = v;
  }

  if (Object.keys(out).length === 0) return null;

  if (!out.captured_at) out.captured_at = new Date().toISOString();

  // Cap total size by dropping trailing keys (keep utm_* first).
  const keys = Object.keys(out);
  while (JSON.stringify(out).length > MAX_TOTAL_BYTES && keys.length > 1) {
    const k = keys.pop()!;
    if (k === "captured_at") continue;
    delete out[k];
  }

  return out;
}
