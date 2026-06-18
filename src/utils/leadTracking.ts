/**
 * Lead tracking utilities (client-side).
 * Additive, opt-in. Returns null when no whitelisted tracking params are present.
 */

export const TRACKING_KEYS = [
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
] as const;

export type TrackingKey = (typeof TRACKING_KEYS)[number];
export type Tracking = Partial<Record<TrackingKey, string>>;

const MAX_VALUE_LEN = 500;
const MAX_TOTAL_BYTES = 2048;

const sanitizeValue = (v: unknown): string => {
  if (v == null) return "";
  return String(v).trim().slice(0, MAX_VALUE_LEN);
};

/**
 * Reads whitelisted tracking params from a URLSearchParams (or any object with
 * a `.get(key)` method). Returns null when no value found, so callers can
 * conditionally omit the field from request bodies (preserving legacy behavior).
 */
export function extractTrackingFromSearchParams(
  searchParams: URLSearchParams | { get(key: string): string | null }
): Tracking | null {
  const out: Tracking = {};
  for (const key of TRACKING_KEYS) {
    const raw = searchParams.get(key);
    if (!raw) continue;
    const v = sanitizeValue(raw);
    if (v) out[key] = v;
  }

  // Hard cap total payload size — drop trailing keys until under the limit.
  const keys = Object.keys(out) as TrackingKey[];
  while (JSON.stringify(out).length > MAX_TOTAL_BYTES && keys.length) {
    const k = keys.pop()!;
    delete out[k];
  }

  return Object.keys(out).length === 0 ? null : out;
}
