// Paid-click attribution from ad-platform click ids (gclid / fbclid / msclkid).
//
// WHY: the referrer alone can NEVER tell paid from organic — a Google Ads
// click and a Google search click both arrive with a google.* referrer (often
// with no referrer at all, when the ad redirect strips it). The click id in
// the landing URL is exactly what Google Analytics uses to split
// "google / organic" from "google / cpc", and Olyvia was already capturing
// and storing these ids without ever reading them.
//
// HOW IT IS REPRESENTED (no new database structure, no new lead_sources rows):
//   - origin -> matched against existing `lead_sources.name` by the same
//     name/alias resolution the referrer path already uses:
//       gclid   -> "Google Ads"  (global lead_sources row already exists)
//       fbclid  -> "Facebook" / "Instagram" (whichever Meta property the
//                  referrer says the click came from; both rows exist)
//       msclkid -> "Bing"       (no row exists today -> textual source only)
//   - medium -> written to the existing `campaign_leads.medium` column, using
//     the GA vocabulary ("cpc", "paid_social"), and ONLY when the visit
//     carried no explicit utm_medium of its own.
//
// Precedence, everywhere this is used: an explicit utm_source always wins,
// then the click id, then the bare referrer domain.

import { resolveOriginFromReferrer } from "./referrerSource.ts";

export interface PaidClickAttribution {
  /** Display name, resolved against lead_sources.name (never invented). */
  origin: string;
  /** GA-style medium for campaign_leads.medium. */
  medium: string;
  /** Which click id produced this. */
  clickIdKey: "gclid" | "fbclid" | "msclkid";
}

const MEDIUM_CPC = "cpc";
const MEDIUM_PAID_SOCIAL = "paid_social";

/** A click id only counts when it is a non-empty string. */
const hasClickId = (value: unknown): boolean =>
  typeof value === "string" ? value.trim().length > 0 : typeof value === "number";

/** Meta properties an fbclid can legitimately have come from. */
const META_ORIGINS = new Set(["Facebook", "Instagram"]);

/**
 * Derives paid attribution from a sanitized tracking object. Returns null when
 * no click id is present (i.e. the visit is not a known paid click) — the
 * caller then falls back to the referrer domain, unchanged.
 * Never throws.
 */
export function resolvePaidClickAttribution(
  tracking: Record<string, unknown> | null | undefined,
): PaidClickAttribution | null {
  if (!tracking || typeof tracking !== "object") return null;

  // Google Ads: gclid is present on every Google Ads click (auto-tagging),
  // regardless of what the referrer says — including when there is none.
  if (hasClickId(tracking.gclid)) {
    return { origin: "Google Ads", medium: MEDIUM_CPC, clickIdKey: "gclid" };
  }

  // Meta: fbclid rides on both Facebook and Instagram placements. Trust the
  // referrer to say WHICH Meta property, but only if it is in fact one of
  // them (an fbclid pasted onto a link from anywhere else must not turn that
  // third-party domain into "Facebook").
  if (hasClickId(tracking.fbclid)) {
    const fromReferrer = resolveOriginFromReferrer(tracking.referrer);
    const origin = fromReferrer && META_ORIGINS.has(fromReferrer) ? fromReferrer : "Facebook";
    return { origin, medium: MEDIUM_PAID_SOCIAL, clickIdKey: "fbclid" };
  }

  // Microsoft Advertising (Bing Ads).
  if (hasClickId(tracking.msclkid)) {
    return { origin: "Bing", medium: MEDIUM_CPC, clickIdKey: "msclkid" };
  }

  return null;
}

/**
 * The origin name to attribute when there is no explicit utm_source: the paid
 * click id first (it is the only signal that separates paid from organic),
 * then the referrer's domain. Returns null when neither says anything.
 */
export function resolveOriginWithoutUtmSource(
  tracking: Record<string, unknown> | null | undefined,
): string | null {
  const paid = resolvePaidClickAttribution(tracking);
  if (paid) return paid.origin;
  return resolveOriginFromReferrer(tracking?.referrer);
}
