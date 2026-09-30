import type { BillingOverview } from "@/hooks/useBillingOverview";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Trial banner threshold: shown when this many days (or fewer) are left. */
export const TRIAL_BANNER_DAYS = 7;

/** Whole days left until `iso`, rounded up. Keeps the sign: <= 0 means the date has passed. Null when there is no valid date. */
export function daysLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now) / DAY_MS);
}

/** Milliseconds until `iso` (negative once passed), or null when there is no valid date. */
export function msLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  return Number.isNaN(end) ? null : end - now;
}

/**
 * Formats a date for display. Date-only values (YYYY-MM-DD) are read as local
 * calendar dates so they never shift a day; invalid values give "-".
 */
export function formatBillingDate(value: string | null | undefined, locale: string): string {
  if (!value) return "-";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(locale);
}

/**
 * Trial wording for a number of remaining days: `daysKey`/`daysKeyOne` are the
 * plural/singular translation keys; last day and expired have their own keys.
 */
export function trialWordingKey(
  ms: number,
  keys: { expired: string; lastDay: string; one: string; other: string },
): { key: string; days?: number } {
  if (ms <= 0) return { key: keys.expired };
  if (ms < DAY_MS) return { key: keys.lastDay };
  const days = Math.ceil(ms / DAY_MS);
  return days === 1 ? { key: keys.one, days } : { key: keys.other, days };
}

export type BannerKind = "past_due" | "expired" | "trial_ending";

export interface BannerState {
  kind: BannerKind;
  /** Days left in the trial (trial_ending only). */
  days: number | null;
}

/**
 * Which status banner (if any) an overview asks for. Blocking states always win
 * over the trial reminder; unknown or healthy states show nothing.
 */
export function getBannerState(overview: BillingOverview | null, now: number = Date.now()): BannerState | null {
  if (!overview || overview.error) return null;
  if (overview.status === "past_due") return { kind: "past_due", days: null };
  if (overview.status === "expired") return { kind: "expired", days: null };
  const isTrial = overview.status === "trialing" || overview.plan === "trial";
  if (isTrial && overview.status !== "canceled") {
    const ms = msLeft(overview.trial_ends_at, now);
    if (ms === null) return null;
    // Trial date already passed while the status still says trialing: it is expired for the user.
    if (ms <= 0) return { kind: "expired", days: null };
    // Under 24h left counts as the last day (days = 0); otherwise whole days, rounded up.
    const days = ms < DAY_MS ? 0 : Math.ceil(ms / DAY_MS);
    if (days <= TRIAL_BANNER_DAYS) return { kind: "trial_ending", days };
  }
  return null;
}

/** Status keys the page knows how to label. */
export const KNOWN_STATUSES = ["trialing", "active", "past_due", "expired", "canceled"] as const;

/** Normalises an overview to one of the labelled statuses (a plain trial plan counts as trialing). */
export function normalizeStatus(overview: BillingOverview): (typeof KNOWN_STATUSES)[number] | "unknown" {
  const status = overview.status ?? "active";
  if (status === "active" && overview.plan === "trial") return "trialing";
  return (KNOWN_STATUSES as readonly string[]).includes(status)
    ? (status as (typeof KNOWN_STATUSES)[number])
    : "unknown";
}

/**
 * Maps an edge-function failure to a translation key: body code first, then the HTTP status.
 * Returns null when nothing matches (caller falls back to a generic friendly message).
 */
export async function resolveFunctionErrorKey(
  error: any,
  codeKeys: Record<string, string>,
  statusKeys: Record<number, string>,
): Promise<string | null> {
  const response = error?.context;
  const status: number | undefined = typeof response?.status === "number" ? response.status : error?.status;
  let code: string | undefined = typeof error?.error === "string" ? error.error : undefined;
  if (!code && response) {
    try {
      const body = await (typeof response.clone === "function" ? response.clone() : response).json();
      if (typeof body?.error === "string") code = body.error;
    } catch {
      // body unreadable: rely on the status alone
    }
  }
  if (code && codeKeys[code]) return codeKeys[code];
  if (status && statusKeys[status]) return statusKeys[status];
  return null;
}

const K = "settingsPage.billing.";
const P = "billing.page.";

/** Server codes (checkout function) mapped to translation keys; checked before the HTTP status. */
export const CHECKOUT_CODE_KEYS: Record<string, string> = {
  only_payer_can_purchase: `${K}notPayer`,
  plan_already_active: `${K}planAlreadyActive`,
  checkout_in_progress: `${K}checkoutInProgress`,
  subscription_inactive: `${K}subscriptionInactive`,
  credits_check_unavailable: `${K}creditsCheckUnavailable`,
  billing_unavailable: `${K}billingUnavailable`,
  subscription_exists: `${K}subscriptionExists`,
  package_not_found: `${K}packageNotFound`,
  package_inactive: `${K}packageInactive`,
  plan_pricing_not_configured: `${K}planPricingNotConfigured`,
  plan_not_purchasable: `${K}planNotPurchasable`,
  invalid_request: `${K}invalidRequest`,
  internal_error: `${K}internalError`,
};

export const CHECKOUT_STATUS_KEYS: Record<number, string> = {
  400: `${K}invalidRequest`,
  403: `${K}notPayer`,
  409: `${K}subscriptionExists`,
  500: `${K}internalError`,
  503: `${K}billingUnavailable`,
};

/** Server codes (stripe-create-portal-session). */
export const PORTAL_CODE_KEYS: Record<string, string> = {
  only_payer_can_manage: `${P}portal.errorNotPayer`,
  no_stripe_customer: `${P}portal.errorNoCustomer`,
  billing_unavailable: `${K}billingUnavailable`,
  internal_error: `${P}portal.errorInternal`,
};

export const PORTAL_STATUS_KEYS: Record<number, string> = {
  403: `${P}portal.errorNotPayer`,
  409: `${P}portal.errorNoCustomer`,
  503: `${K}billingUnavailable`,
  500: `${P}portal.errorInternal`,
};
