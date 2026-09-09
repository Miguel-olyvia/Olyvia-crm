// Referrer-domain -> human-readable origin mapping. Fully GA-style: when a
// visit carries no utm_source at all, the referrer's domain is the only
// signal left to attribute the lead's origin. Deliberately conservative — an
// unrecognised domain resolves to null (never invents an origin).
//
// This ONLY derives a display name ("Instagram", "Facebook", ...). Turning
// that name into a lead_sources.id is a separate, explicit step (see
// resolveSourceDirect in marketingAttribution.ts), and callers must never let
// this override an explicit utm_source or an already-validated source_id.
//
// SECURITY — how a hostname is allowed to match:
//   - `hosts`: exact equality only (after stripping a leading "www.").
//   - `roots`: equality with the registrable domain, or a suffix anchored on a
//     dot (`h === r || h.endsWith("." + r)`), so only real subdomains match.
//   - `multiTldRoots`: a regex anchored on BOTH ends for brands that use many
//     ccTLDs (google.pt, pinterest.co.uk, ...).
// NEVER a substring/`includes` check. A previous version of the Google rule
// matched `google.evil.example` — a domain anybody can register — which would
// have let a third party forge the origin of a lead just by linking from it.
// Every rule below is covered by negative tests (`notinstagram.com`,
// `instagram.com.phishing.example`) in referrerSource.test.ts.

interface DomainRule {
  origin: string;
  /** Matched by exact equality (after "www." is stripped). */
  hosts?: string[];
  /** Registrable domains; equality or dot-anchored subdomain suffix. */
  roots?: string[];
  /** Brands spread over many ccTLDs: `<root>.<tld>` with optional subdomains. */
  multiTldRoots?: string[];
}

const DOMAIN_RULES: DomainRule[] = [
  {
    origin: "Instagram",
    // l./lm. are Instagram's own outbound redirectors.
    roots: ["instagram.com"],
    hosts: ["ig.me", "instagr.am"],
  },
  {
    origin: "Facebook",
    // m./mbasic./free./web./business./l./lm. are all Facebook's own hosts.
    roots: ["facebook.com", "fb.com"],
    hosts: ["fb.me", "fb.watch"],
  },
  {
    origin: "Google",
    multiTldRoots: ["google"],
  },
  {
    origin: "LinkedIn",
    roots: ["linkedin.com"],
    hosts: ["lnkd.in"],
  },
  {
    origin: "YouTube",
    roots: ["youtube.com", "youtube-nocookie.com"],
    hosts: ["youtu.be"],
  },
  {
    origin: "TikTok",
    // vm./vt./m. are TikTok's own short-link and mobile hosts.
    roots: ["tiktok.com"],
  },
  {
    origin: "Bing",
    roots: ["bing.com"],
  },
  {
    origin: "DuckDuckGo",
    // html./lite./start. are DuckDuckGo's own lightweight front-ends.
    roots: ["duckduckgo.com", "duck.com"],
  },
  {
    origin: "Yahoo",
    // r.search.yahoo.com is Yahoo's redirector on organic result clicks.
    multiTldRoots: ["yahoo"],
  },
  {
    origin: "Twitter",
    // t.co is X/Twitter's link wrapper; every outbound click passes through it.
    roots: ["twitter.com", "x.com"],
    hosts: ["t.co"],
  },
  {
    origin: "Pinterest",
    multiTldRoots: ["pinterest"],
    hosts: ["pin.it"],
  },
  {
    origin: "WhatsApp",
    // web./api./chat./business. are WhatsApp's own hosts; wa.me is its short link.
    roots: ["whatsapp.com", "wa.me"],
  },
  {
    origin: "Telegram",
    roots: ["telegram.org", "telegram.me", "telegram.dog"],
    hosts: ["t.me"],
  },
  {
    origin: "Reddit",
    // old./np./out./m./new. are Reddit's own hosts; redd.it is its short link.
    roots: ["reddit.com", "redd.it"],
  },
  {
    origin: "Snapchat",
    // story./t./web. are Snapchat's own hosts.
    roots: ["snapchat.com"],
  },
];

/**
 * `<root>.<tld>` with an optional subdomain chain, anchored on BOTH ends.
 * The TLD alternation is deliberately narrow (com | 2-letter ccTLD |
 * co.xx | com.xx) so `google.evil.example` can never match.
 */
const multiTldPattern = (root: string): RegExp =>
  new RegExp(`^(?:[a-z0-9-]+\\.)*${root}\\.(?:com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})$`);

const MULTI_TLD_CACHE = new Map<string, RegExp>();

const matchesMultiTld = (hostname: string, root: string): boolean => {
  let re = MULTI_TLD_CACHE.get(root);
  if (!re) {
    re = multiTldPattern(root);
    MULTI_TLD_CACHE.set(root, re);
  }
  return re.test(hostname);
};

const matchesRule = (hostname: string, rule: DomainRule): boolean => {
  if (rule.hosts?.some((h) => hostname === h)) return true;
  // Dot-anchored: only a real subdomain of the registrable domain matches.
  if (rule.roots?.some((r) => hostname === r || hostname.endsWith(`.${r}`))) return true;
  if (rule.multiTldRoots?.some((root) => matchesMultiTld(hostname, root))) return true;
  return false;
};

/**
 * Resolves a human-readable origin name ("Instagram", "Facebook", ...) from a
 * referrer URL's hostname. Returns null for unknown domains, missing
 * referrer, or an unparseable URL — never throws.
 */
export function resolveOriginFromReferrer(referrer: unknown): string | null {
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  // A trailing dot ("instagram.com.") is a valid FQDN form for the same host.
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  for (const rule of DOMAIN_RULES) {
    if (matchesRule(hostname, rule)) return rule.origin;
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
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 200);
  return normalized || null;
}
