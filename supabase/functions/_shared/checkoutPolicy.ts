/**
 * Pure authorisation / validation rules for stripe-create-checkout-session.
 *
 * No Deno / deno.land imports on purpose: vitest imports this file directly.
 *
 * Billing belongs to the ROOT PAYER USER, not to an organization. Only that
 * user may start a checkout, and nobody (payer included) changes plan except
 * through a Stripe payment verified server-side by stripe-webhook.
 */

export const CREDITS_AMOUNT_MAX = 10000;
export const CREDITS_PRICE_PER_UNIT_EUR = 0.70;
/** A pending plan invoice younger than this may reuse its open Stripe session. */
export const PENDING_INVOICE_REUSE_WINDOW_MS = 23 * 60 * 60 * 1000;

/** 'trial' and 'internal' can never be bought. */
export const PURCHASABLE_PLANS = ["starter", "pro", "enterprise"] as const;
export type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

export interface CheckoutRequest {
  organization_id: string;
  type: "creditos" | "plano";
  package_id?: string;
  credits_amount?: number;
  target_plan?: PurchasablePlan;
}

export interface PolicyIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: CheckoutRequest }
  | { ok: false; status: 400; error: string; details?: PolicyIssue[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Schema + cross-field validation of the request body. */
export function validateCheckoutRequest(raw: unknown): ValidationResult {
  const issues: PolicyIssue[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Invalid request" };
  }
  const b = raw as Record<string, unknown>;

  if (!isUuid(b.organization_id)) {
    issues.push({ path: "organization_id", message: "Invalid uuid" });
  }
  if (b.type !== "creditos" && b.type !== "plano") {
    issues.push({ path: "type", message: "Invalid enum value" });
  }
  if (b.package_id !== undefined && !isUuid(b.package_id)) {
    issues.push({ path: "package_id", message: "Invalid uuid" });
  }
  if (b.credits_amount !== undefined) {
    const n = b.credits_amount;
    if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
      issues.push({
        path: "credits_amount",
        message: "Must be a positive integer",
      });
    } else if (n > CREDITS_AMOUNT_MAX) {
      issues.push({
        path: "credits_amount",
        message: `Must be at most ${CREDITS_AMOUNT_MAX}`,
      });
    }
  }
  if (
    b.target_plan !== undefined &&
    !(PURCHASABLE_PLANS as readonly unknown[]).includes(b.target_plan)
  ) {
    issues.push({ path: "target_plan", message: "Invalid enum value" });
  }
  if (issues.length > 0) {
    return { ok: false, status: 400, error: "Invalid request", details: issues };
  }

  const data = b as unknown as CheckoutRequest;
  if (data.type === "creditos") {
    if (!data.package_id && !data.credits_amount) {
      return {
        ok: false,
        status: 400,
        error: "package_id ou credits_amount é obrigatório para type=creditos",
      };
    }
    if (data.package_id && data.credits_amount) {
      return {
        ok: false,
        status: 400,
        error: "package_id e credits_amount são mutuamente exclusivos",
      };
    }
  }
  if (data.type === "plano" && !data.target_plan) {
    return {
      ok: false,
      status: 400,
      error: "target_plan é obrigatório para type=plano",
    };
  }
  return { ok: true, data };
}

/**
 * Only the root payer may buy. No system_admin exception; a service-role
 * caller has no anew user id and is therefore refused too.
 */
export function isRootPayer(
  callerAnewUserId: string | null | undefined,
  rootPayerUserId: string | null | undefined,
): boolean {
  return !!callerAnewUserId && !!rootPayerUserId &&
    callerAnewUserId === rootPayerUserId;
}

export interface SubscriptionSnapshot {
  plan?: string | null;
  status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}

export type PurchaseDecision =
  | { ok: true }
  | { ok: false; status: 409 | 400; error: string };

/** Plan purchase gate: not internal, not already active, no live subscription. */
export function evaluatePlanPurchase(
  targetPlan: string,
  sub: SubscriptionSnapshot | null,
): PurchaseDecision {
  if (targetPlan === "internal") {
    return { ok: false, status: 400, error: "plan_not_purchasable" };
  }
  if (
    sub?.stripe_subscription_id &&
    (sub.status === "active" || sub.status === "past_due")
  ) {
    return { ok: false, status: 409, error: "subscription_exists" };
  }
  if (sub?.plan === targetPlan && sub.status === "active") {
    return { ok: false, status: 409, error: "plan_already_active" };
  }
  return { ok: true };
}

export function isPendingInvoiceReusable(
  createdAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!createdAtIso) return false;
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return false;
  return nowMs - created < PENDING_INVOICE_REUSE_WINDOW_MS;
}

export function creditsPriceEur(credits: number): number {
  return Math.round(credits * CREDITS_PRICE_PER_UNIT_EUR * 100) / 100;
}

export type GateDecision =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string };

/** Payer check first (403), then billing availability (503). */
export function gateCheckout(input: {
  callerAnewUserId: string | null | undefined;
  rootPayerUserId: string | null | undefined;
  stripeConfigured: boolean;
}): GateDecision {
  if (!isRootPayer(input.callerAnewUserId, input.rootPayerUserId)) {
    return { ok: false, status: 403, error: "only_payer_can_purchase" };
  }
  if (!input.stripeConfigured) {
    return { ok: false, status: 503, error: "billing_unavailable" };
  }
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Returns the billing org's Stripe customer id, creating it when missing.
 * `createCustomer` must send Idempotency-Key `customer:<billingOrgId>`. The
 * store is conditional (only while still null) so concurrent checkouts
 * converge on one customer.
 */
export async function ensureStripeCustomer(
  admin: Admin,
  billingOrgId: string,
  existing: string | null | undefined,
  createCustomer: (idempotencyKey: string) => Promise<{ id: string }>,
): Promise<string> {
  if (existing) return existing;

  const key = `customer:${billingOrgId}`;
  let customer: { id: string };
  try {
    customer = await createCustomer(key);
  } catch (e) {
    // A concurrent request holds the same idempotency key: retry once.
    const err = e as { status?: number; code?: string };
    if (err?.code === "idempotency_key_in_use" || err?.status === 409) {
      customer = await createCustomer(key);
    } else {
      throw e;
    }
  }

  const { data: stored, error } = await admin
    .from("organization_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("organization_id", billingOrgId)
    .is("stripe_customer_id", null)
    .select("organization_id");
  if (error) {
    throw new Error(`Failed to store stripe_customer_id: ${error.message}`);
  }
  if (stored && stored.length > 0) return customer.id;

  // Lost the race (or no row): read whatever is stored now.
  const { data: current, error: readError } = await admin
    .from("organization_subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", billingOrgId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read stripe_customer_id: ${readError.message}`);
  }
  if (!current?.stripe_customer_id) {
    throw new Error("Billing organization has no subscription row");
  }
  return current.stripe_customer_id;
}

/** Credits are only sold to an org whose subscription is trialing or active. */
export function evaluateCreditsPurchase(
  sub: SubscriptionSnapshot | null,
): PurchaseDecision {
  if (sub?.status === "trialing" || sub?.status === "active") return { ok: true };
  return { ok: false, status: 409, error: "subscription_inactive" };
}

export interface OpenPlanSession {
  target_plan: string | null;
  url: string;
}

export type PendingCheckoutDecision =
  | { action: "create" }
  | { action: "reuse"; url: string }
  | { action: "conflict"; status: 409; error: "checkout_in_progress" };

/**
 * `openSessions` = still-open Stripe sessions of the billing org's recent
 * pending plan invoices. Reuse only for the same target plan; any other open
 * session blocks a new checkout (two live plan checkouts could both be paid).
 */
export function decidePendingCheckout(
  openSessions: OpenPlanSession[],
  targetPlan: string,
): PendingCheckoutDecision {
  const same = openSessions.find((s) => s.target_plan === targetPlan);
  if (same) return { action: "reuse", url: same.url };
  if (openSessions.length > 0) {
    return { action: "conflict", status: 409, error: "checkout_in_progress" };
  }
  return { action: "create" };
}

export interface PendingPlanInvoiceRow {
  id: string;
  created_at: string | null;
  target_plan: string | null;
  stripe_checkout_session_id: string | null;
}

interface FetchedSession {
  status?: string | null;
  url?: string | null;
}

function isDeadSessionError(e: unknown): boolean {
  const err = e as { status?: number; code?: string; message?: string };
  return err?.status === 404 || err?.code === "resource_missing" ||
    /no such checkout|resource_missing/i.test(err?.message ?? "");
}

/**
 * Looks up the Stripe session of each recent pending plan invoice and returns
 * the ones still open. A session Stripe no longer knows (404) or that has
 * expired is dead: its pending invoice is cancelled and we carry on. Any other
 * lookup failure counts as "not open" but leaves the invoice alone (its
 * session might still be paid).
 */
export async function collectOpenPlanSessions(
  rows: PendingPlanInvoiceRow[],
  fetchSession: (sessionId: string) => Promise<FetchedSession | null>,
  cancelInvoice: (invoiceId: string) => Promise<void>,
  nowMs: number = Date.now(),
): Promise<OpenPlanSession[]> {
  const open: OpenPlanSession[] = [];
  for (const row of rows) {
    if (!row.stripe_checkout_session_id) continue;
    if (!isPendingInvoiceReusable(row.created_at, nowMs)) continue;
    let session: FetchedSession | null = null;
    try {
      session = await fetchSession(row.stripe_checkout_session_id);
    } catch (e) {
      if (isDeadSessionError(e)) await cancelInvoice(row.id);
      continue;
    }
    if (session?.status === "open" && session.url) {
      open.push({ target_plan: row.target_plan, url: session.url });
    } else if (session?.status === "expired") {
      await cancelInvoice(row.id);
    }
  }
  return open;
}
