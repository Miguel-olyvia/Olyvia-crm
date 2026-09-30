/**
 * Pure decision rules for stripe-create-portal-session.
 *
 * No Deno / deno.land imports on purpose: vitest imports this file directly.
 *
 * Billing belongs to the ROOT PAYER USER. Only that user may open the Stripe
 * Billing Portal (which can cancel the subscription or change the card).
 */

import { isRootPayer } from "./checkoutPolicy.ts";

export interface PortalRequest {
  organization_id: string;
}

export type PortalRequestValidation =
  | { ok: true; data: PortalRequest }
  | { ok: false; status: 400; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validatePortalRequest(raw: unknown): PortalRequestValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  const id = (raw as Record<string, unknown>).organization_id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  return { ok: true, data: { organization_id: id } };
}

export type PortalDecision =
  | { ok: true; customerId: string }
  | { ok: false; status: 403 | 409 | 503; error: string };

/**
 * Order: payer (403), Stripe customer of the billing org (409), Stripe
 * configured (503). A service-role caller has no anew user id, so it is a 403.
 */
export function decidePortalAccess(input: {
  callerAnewUserId: string | null | undefined;
  rootPayerUserId: string | null | undefined;
  stripeCustomerId: string | null | undefined;
  stripeConfigured: boolean;
}): PortalDecision {
  if (!isRootPayer(input.callerAnewUserId, input.rootPayerUserId)) {
    return { ok: false, status: 403, error: "only_payer_can_manage" };
  }
  if (!input.stripeCustomerId) {
    return { ok: false, status: 409, error: "no_stripe_customer" };
  }
  if (!input.stripeConfigured) {
    return { ok: false, status: 503, error: "billing_unavailable" };
  }
  return { ok: true, customerId: input.stripeCustomerId };
}

/** Where Stripe sends the user after leaving the portal. */
export function portalReturnUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/billing`;
}
