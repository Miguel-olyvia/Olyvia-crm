// Single source of truth for "what IP accepted/signed this document".
//
// Why this file exists
// --------------------
// `acceptance_ip` / `signature_ip` are audit-trail columns: they exist to be
// evidence of WHO acted and FROM WHERE. Before this helper, four call sites
// derived that value four different ways, and three of them wrote something
// that only LOOKS like evidence:
//
//   - PublicProposal.tsx            -> literal "client"   (browser-side, invented)
//   - send-verification-code        -> raw x-forwarded-for || "unknown"
//   - validate-contract-signature   -> raw x-forwarded-for || "unknown"
//   - client-portal-action          -> first XFF hop || x-real-ip || null   (correct)
//
// Two problems those variants share:
//
//  1. A placeholder ("client", "unknown") is a lie with the shape of proof. A
//     lawyer reading the audit trail cannot tell it apart from a genuine
//     detection, whereas NULL is unambiguously "not captured". Never invent a
//     value for this column — an empty field is honest.
//
//  2. `x-forwarded-for` is a COMMA-SEPARATED CHAIN ("203.0.113.7, 10.0.0.1"),
//     not an address. Storing it raw puts proxy hops into the evidence field
//     and the value fails any IP parse downstream.
//
// The browser cannot know its own public IP; only the server sees it. So this
// derivation must live server-side, and there must be exactly one of it.

/**
 * Loose IPv4 / IPv6 shape check. This is deliberately a FORMAT gate, not a
 * validity gate: the point is that a header containing something which is not
 * an address at all (a hostname, "unknown", an injected string) is rejected
 * and stored as NULL rather than persisted into an evidence column.
 */
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+(?:%[0-9a-zA-Z]+)?$/;

function isIpLike(value: string): boolean {
  if (IPV4.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  // An IPv6 address needs at least one colon; the char class alone would
  // otherwise accept a bare hex string.
  return value.includes(":") && IPV6.test(value);
}

/**
 * Normalises one candidate address:
 *  - trims whitespace
 *  - strips an IPv6 bracket form with optional port: "[::1]:443" -> "::1"
 *  - strips a port from IPv4: "203.0.113.7:52344" -> "203.0.113.7"
 *
 * A bare IPv6 address ("2001:db8::1") is left alone — its colons are part of
 * the address, so port-stripping must never be applied to it.
 */
function normalise(raw: string): string {
  let value = raw.trim();

  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];

  // Exactly one colon => host:port, and the host part is not IPv6.
  if (value.split(":").length === 2 && !value.includes("::")) {
    value = value.split(":")[0];
  }

  return value;
}

/**
 * Returns the client IP as seen by the edge, or `null` when it cannot be
 * determined.
 *
 * Order of trust:
 *   1. first hop of `x-forwarded-for` — the originating client; later entries
 *      are proxies we added ourselves
 *   2. `x-real-ip`
 *   3. `cf-connecting-ip`
 *
 * NEVER accepts an IP supplied in the request body: a client that can choose
 * its own audit-trail IP makes the audit trail worthless.
 *
 * @returns a syntactically valid IP string, or `null`. Callers must write the
 *          `null` through to the database as NULL — do not substitute
 *          "unknown", "client", or any other filler.
 */
export function detectClientIp(req: Request): string | null {
  const candidates: string[] = [];

  const xff = req.headers.get("x-forwarded-for");
  if (xff) candidates.push(...xff.split(","));

  const realIp = req.headers.get("x-real-ip");
  if (realIp) candidates.push(realIp);

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) candidates.push(cfIp);

  for (const candidate of candidates) {
    const value = normalise(candidate);
    if (value && isIpLike(value)) return value;
  }

  return null;
}

/**
 * User agent counterpart. Same rule: absent means NULL, never "unknown".
 * Capped because the header is attacker-controlled and the column is text.
 */
export function detectUserAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  if (!ua) return null;
  const trimmed = ua.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}
