// Referrer-domain -> human-readable origin mapping. Fully GA-style: when a
// visit carries no utm_source at all, the referrer's domain is the only
// signal left to attribute the lead's origin. Deliberately conservative — an
// unrecognised domain resolves to null (never invents an origin).
//
// This ONLY derives a display name ("Instagram", "Facebook", ...). Turning
// that name into a lead_sources.id is a separate, explicit step (see
// resolveSourceDirect in marketingAttribution.ts), and callers must never let
// this override an explicit utm_source or an already-validated source_id.

interface DomainRule {
  test: (hostname: string) => boolean;
  origin: string;
}

const DOMAIN_RULES: DomainRule[] = [
  { test: (h) => h === 'instagram.com' || h === 'l.instagram.com', origin: 'Instagram' },
  {
    test: (h) => h === 'facebook.com' || h === 'm.facebook.com' || h === 'lm.facebook.com' || h === 'l.facebook.com',
    origin: 'Facebook',
  },
  // Only real Google properties: an optional subdomain chain, then
  // `google.` followed by a plausible TLD/ccTLD suffix. Anchored on BOTH ends
  // so an attacker-controlled hostname whose registrable domain is somebody
  // else's (e.g. `google.evil.example`) is NOT attributed to Google.
  { test: (h) => /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(h), origin: 'Google' },
  { test: (h) => h === 'linkedin.com' || h === 'lnkd.in', origin: 'LinkedIn' },
  { test: (h) => h === 'youtube.com' || h === 'youtu.be', origin: 'YouTube' },
];

/**
 * Resolves a human-readable origin name ("Instagram", "Facebook", ...) from a
 * referrer URL's hostname. Returns null for unknown domains, missing
 * referrer, or an unparseable URL — never throws.
 */
export function resolveOriginFromReferrer(referrer: unknown): string | null {
  if (typeof referrer !== 'string' || !referrer.trim()) return null;
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);
  for (const rule of DOMAIN_RULES) {
    if (rule.test(hostname)) return rule.origin;
  }
  return null;
}

// Combining diacritical marks (U+0300-U+036F) left behind by
// String.prototype.normalize('NFD') — stripped to fold accented characters
// onto their base letter (e.g. "e" from an accented variant).
const DIACRITICS_RE = /[\u0300-\u036F]/g;

/**
 * Normalizes free text for source name/alias comparison: lowercase, strip
 * diacritics, strip whitespace. Used to match a derived origin name (or a raw
 * utm_source) against lead_sources.name / lead_sources.utm_aliases without
 * requiring anyone to configure anything — exact match only, never partial.
 */
export function normalizeSourceText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 200);
  return normalized || null;
}
