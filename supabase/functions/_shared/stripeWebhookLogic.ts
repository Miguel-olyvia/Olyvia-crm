/**
 * Pure business logic for stripe-webhook, with an injected Supabase client so
 * vitest can drive it with a mock (no Deno / deno.land imports here).
 *
 * Contract:
 *  - every event id is first claimed in stripe_webhook_events; an event
 *    already 'processed' / 'rejected' is answered 200 without re-running; a
 *    'failed' row, or a 'processing' row older than 5 minutes, is reclaimed;
 *  - a DB error, or an UPDATE that matches 0 rows where a row was expected,
 *    THROWS -> the caller reports to Sentry and answers 500 so Stripe retries;
 *  - a verified business mismatch is recorded 'rejected', reported through
 *    `report`, and answered 200. When the payment was already taken the
 *    invoice is still marked 'pago' and the rejection is a manual-review flag;
 *  - the plan only ever comes from invoices.target_plan (never metadata) and
 *    is only written when a paid checkout is verified. Subscription events
 *    never touch `plan`;
 *  - subscription status/period end written from an event always come from the
 *    LIVE Stripe subscription (events can arrive out of order), except
 *    customer.subscription.deleted which always wins to 'canceled';
 *  - billing belongs to the billing org (root payer).
 */

import { PURCHASABLE_PLANS } from "./checkoutPolicy.ts";

// deno-lint-ignore no-explicit-any
export type DbClient = any;
// deno-lint-ignore no-explicit-any
export type StripeObject = any;

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeObject };
}

export type ReportFn = (
  error: unknown,
  context: Record<string, unknown>,
) => Promise<void> | void;

/** Stripe reads injected so vitest never touches the network. */
export interface WebhookDeps {
  /** GET subscriptions/{id} */
  fetchSubscription: (subscriptionId: string) => Promise<StripeObject>;
  /** DELETE subscriptions/{id} (immediate cancel). Must throw on failure. */
  cancelSubscription: (subscriptionId: string) => Promise<unknown>;
  /** Resolves a payment intent to its Stripe invoice / checkout session ids. */
  resolvePaymentIntentRefs?: (
    paymentIntentId: string,
  ) => Promise<{ invoiceId?: string | null; sessionId?: string | null }>;
}

export interface HandleResult {
  httpStatus: 200 | 409;
  outcome: "processed" | "rejected" | "duplicate" | "in_progress";
  reason?: string;
}

type HandlerResult =
  | { kind: "processed" }
  | { kind: "rejected"; reason: string; context?: Record<string, unknown> };

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** Stripe subscription.status -> organization_subscriptions.status. */
export function mapStripeSubscriptionStatus(status: unknown): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "incomplete";
    default:
      throw new Error(`Unknown Stripe subscription status: ${String(status)}`);
  }
}

const nowIso = () => new Date().toISOString();

function fail(message: string, error: { message: string } | null | undefined): Error {
  return new Error(`${message}: ${error?.message ?? "unknown"}`);
}

function reject(reason: string, context?: Record<string, unknown>): HandlerResult {
  return { kind: "rejected", reason, context };
}

const processed = (): HandlerResult => ({ kind: "processed" });

function toIsoFromSeconds(seconds: unknown): string | null {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function periodEndOf(subscription: StripeObject): string | null {
  return toIsoFromSeconds(
    subscription?.current_period_end ??
      subscription?.items?.data?.[0]?.current_period_end,
  );
}

function subscriptionIdOfInvoice(obj: StripeObject): string | null {
  const id = obj?.subscription ??
    obj?.parent?.subscription_details?.subscription ?? null;
  return typeof id === "string" && id ? id : null;
}

// ---------------------------------------------------------------------
// Subscription-row updates keyed on stripe_subscription_id
// ---------------------------------------------------------------------

/**
 * No subscription row carries this Stripe subscription id. Two very different
 * causes: the event raced ahead of checkout.session.completed (retry), or the
 * subscription was replaced / is not ours (nothing to do). The subscription's
 * own metadata (set at checkout) names the invoice that will bind it.
 */
async function resolveUnmatchedSubscription(
  db: DbClient,
  subscriptionId: string,
  metadata: StripeObject,
  what: string,
  pendingIsProcessed: boolean,
): Promise<HandlerResult> {
  const invoiceId = metadata?.invoice_id;
  if (typeof invoiceId === "string" && invoiceId) {
    const { data: invoice, error } = await db
      .from("invoices")
      .select("id, status")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) throw fail("Failed to read invoice for unmatched subscription", error);
    if (invoice?.status === "pendente") {
      // invoice.paid raced ahead of the checkout event: that event applies
      // the live subscription state itself, so there is nothing to retry.
      if (pendingIsProcessed) return processed();
      throw new Error(
        `${what}: subscription ${subscriptionId} not bound yet (invoice ${invoiceId} still pendente)`,
      );
    }
  }
  return reject("unknown_subscription", { subscriptionId, invoiceId: invoiceId ?? null });
}

async function applySubscriptionPatch(
  db: DbClient,
  subscriptionId: string,
  patch: Record<string, unknown>,
  what: string,
  metadata: StripeObject,
  pendingIsProcessed = false,
): Promise<HandlerResult> {
  const { data, error } = await db
    .from("organization_subscriptions")
    .update({ ...patch, updated_at: nowIso() })
    .eq("stripe_subscription_id", subscriptionId)
    .select("organization_id");
  if (error) throw fail(`Failed to sync ${what}`, error);
  if (!data || data.length === 0) {
    return resolveUnmatchedSubscription(db, subscriptionId, metadata, what, pendingIsProcessed);
  }
  return processed();
}

/** Writes the LIVE subscription's status / period end, never the event's. */
async function syncFromLiveSubscription(
  db: DbClient,
  deps: WebhookDeps,
  subscriptionId: string,
  what: string,
  clearTrialWhenActive: boolean,
  pendingIsProcessed = false,
): Promise<HandlerResult> {
  const live = await deps.fetchSubscription(subscriptionId);
  const status = mapStripeSubscriptionStatus(live?.status);
  const periodEnd = periodEndOf(live);
  return applySubscriptionPatch(
    db,
    subscriptionId,
    {
      status,
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
      ...(clearTrialWhenActive && status === "active" ? { trial_ends_at: null } : {}),
    },
    what,
    live?.metadata,
    pendingIsProcessed,
  );
}

// ---------------------------------------------------------------------
// checkout.session.completed / checkout.session.async_payment_succeeded
// ---------------------------------------------------------------------
async function resolveRootPayer(db: DbClient, orgId: string): Promise<string | null> {
  const { data, error } = await db.rpc("resolve_root_payer_user_id", {
    p_organization_id: orgId,
  });
  if (error) throw fail("resolve_root_payer_user_id failed", error);
  return data ?? null;
}

async function handleCheckoutPaid(
  db: DbClient,
  session: StripeObject,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  if (session?.payment_status !== "paid") return processed();

  const invoiceId: string | undefined = session.metadata?.invoice_id;
  const metaOrgId: string | undefined = session.metadata?.organization_id;
  if (!invoiceId) return reject("missing_invoice_id");

  const { data: invoice, error } = await db
    .from("invoices")
    .select(
      "id, organization_id, type, amount, status, target_plan, stripe_checkout_session_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw fail("Failed to read invoice", error);
  if (!invoice) return reject("unknown_invoice", { invoiceId });

  if (!session.id || session.id !== invoice.stripe_checkout_session_id) {
    return reject("session_mismatch", { invoiceId });
  }
  if (session.currency !== "eur") return reject("currency_mismatch", { invoiceId });
  if (session.amount_total !== Math.round(Number(invoice.amount) * 100)) {
    return reject("amount_mismatch", { invoiceId });
  }
  if (!metaOrgId || metaOrgId !== invoice.organization_id) {
    return reject("organization_mismatch", { invoiceId });
  }
  const expectedMode = invoice.type === "plano" ? "subscription" : "payment";
  if (session.mode !== expectedMode) return reject("mode_mismatch", { invoiceId });
  if (invoice.status === "cancelado") return reject("invoice_cancelled", { invoiceId });

  // The money is real from here on: whatever is wrong below, the invoice is
  // marked paid and the problem becomes a manual-review flag.
  const { data: billingNow, error: billingErr } = await db.rpc(
    "resolve_billing_organization_id",
    { p_organization_id: invoice.organization_id },
  );
  if (billingErr) throw fail("resolve_billing_organization_id failed", billingErr);

  let targetOrgId: string = invoice.organization_id;
  let flag: string | null = null;
  if (billingNow !== invoice.organization_id) {
    const [invoicePayer, billingPayer] = await Promise.all([
      resolveRootPayer(db, invoice.organization_id),
      billingNow ? resolveRootPayer(db, billingNow) : Promise.resolve(null),
    ]);
    if (billingNow && invoicePayer && invoicePayer === billingPayer) {
      targetOrgId = billingNow; // same payer, the plan moved: follow it
    } else {
      flag = "not_billing_organization";
    }
  }
  // Plan: invoices.target_plan, else (invoices created by the previous
  // checkout) the session metadata, but only if it is a purchasable plan.
  const metaPlan = session.metadata?.target_plan;
  const targetPlan: string | null = invoice.target_plan ??
    ((PURCHASABLE_PLANS as readonly unknown[]).includes(metaPlan) ? metaPlan : null);
  if (!flag && invoice.type === "plano" && !targetPlan) {
    flag = "missing_target_plan";
  }

  let flagContext: Record<string, unknown> = {};
  if (!flag && invoice.type === "plano") {
    const { data: current, error: curErr } = await db
      .from("organization_subscriptions")
      .select("status, stripe_subscription_id")
      .eq("organization_id", targetOrgId)
      .maybeSingle();
    if (curErr) throw fail("Failed to read subscription", curErr);
    if (!current) {
      throw new Error(`No organization_subscriptions row for billing org ${targetOrgId}`);
    }
    if (
      current.stripe_subscription_id && session.subscription &&
      current.stripe_subscription_id !== session.subscription &&
      (current.status === "active" || current.status === "past_due")
    ) {
      // A different live subscription already carries this org: never
      // overwrite it silently, a human decides which one to keep.
      flag = "second_subscription_review";
      flagContext = {
        existingSubscriptionId: current.stripe_subscription_id,
        newSubscriptionId: session.subscription,
      };
    }
  }

  const applyPlan = invoice.type === "plano" && !flag;
  const liveSubscription = applyPlan && session.subscription
    ? await deps.fetchSubscription(session.subscription)
    : null;

  if (invoice.status !== "pago") {
    const { data: rows, error: updErr } = await db
      .from("invoices")
      .update({
        status: "pago",
        paid_at: nowIso(),
        stripe_payment_intent_id: session.payment_intent ?? null,
        stripe_invoice_id: session.invoice ?? null,
        stripe_subscription_id: session.subscription ?? null,
      })
      .eq("id", invoice.id)
      .eq("stripe_checkout_session_id", session.id)
      .eq("status", "pendente")
      .select("id");
    if (updErr) throw fail("Failed to mark invoice as paid", updErr);
    if (!rows || rows.length === 0) {
      throw new Error(`Invoice ${invoice.id} not updated to 'pago' (0 rows)`);
    }
  }

  // Always apply the subscription update, even if the invoice was already
  // paid: a previous delivery may have paid the invoice and then failed.
  if (applyPlan) {
    const periodEnd = periodEndOf(liveSubscription);
    const { data: subRows, error: subErr } = await db
      .from("organization_subscriptions")
      .update({
        plan: targetPlan,
        status: liveSubscription
          ? mapStripeSubscriptionStatus(liveSubscription.status)
          : "active",
        trial_ends_at: null,
        ...(session.customer ? { stripe_customer_id: session.customer } : {}),
        ...(session.subscription ? { stripe_subscription_id: session.subscription } : {}),
        ...(periodEnd ? { current_period_end: periodEnd } : {}),
        updated_at: nowIso(),
      })
      .eq("organization_id", targetOrgId)
      .select("organization_id");
    if (subErr) throw fail("Failed to activate plan", subErr);
    if (!subRows || subRows.length === 0) {
      throw new Error(`No organization_subscriptions row for billing org ${targetOrgId}`);
    }
  }

  if (flag) return reject(flag, { invoiceId: invoice.id, paid: true, ...flagContext });
  return processed();
}

// ---------------------------------------------------------------------
// checkout.session.expired: the buyer never paid, close the pending invoice
// ---------------------------------------------------------------------
async function handleCheckoutExpired(
  db: DbClient,
  session: StripeObject,
): Promise<HandlerResult> {
  const invoiceId: string | undefined = session?.metadata?.invoice_id;
  if (!invoiceId) return processed(); // not one of ours

  const { data: invoice, error } = await db
    .from("invoices")
    .select("id, status, stripe_checkout_session_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw fail("Failed to read invoice", error);
  if (!invoice || invoice.stripe_checkout_session_id !== session.id) {
    return reject("unknown_invoice", { invoiceId });
  }
  if (invoice.status !== "pendente") return processed(); // paid or already closed

  const { data, error: updErr } = await db
    .from("invoices")
    .update({ status: "cancelado" })
    .eq("id", invoice.id)
    .eq("status", "pendente")
    .select("id");
  if (updErr) throw fail("Failed to close expired invoice", updErr);
  if (!data || data.length === 0) {
    throw new Error(`Expired invoice ${invoice.id} not closed (0 rows)`);
  }
  return processed();
}

// ---------------------------------------------------------------------
// invoice.* and customer.subscription.*
// ---------------------------------------------------------------------
async function handleInvoicePaid(
  db: DbClient,
  stripeInvoice: StripeObject,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  const subscriptionId = subscriptionIdOfInvoice(stripeInvoice);
  if (!subscriptionId) return processed();
  return syncFromLiveSubscription(db, deps, subscriptionId, "invoice.paid", true, true);
}

async function handleInvoicePaymentFailed(
  db: DbClient,
  stripeInvoice: StripeObject,
): Promise<HandlerResult> {
  const subscriptionId = subscriptionIdOfInvoice(stripeInvoice);
  if (!subscriptionId) return processed();
  const metadata = stripeInvoice?.subscription_details?.metadata ??
    stripeInvoice?.parent?.subscription_details?.metadata;
  return applySubscriptionPatch(
    db,
    subscriptionId,
    { status: "past_due" },
    "invoice.payment_failed",
    metadata,
  );
}

async function handleSubscriptionUpdated(
  db: DbClient,
  subscription: StripeObject,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  return syncFromLiveSubscription(
    db,
    deps,
    subscription.id,
    "customer.subscription.updated",
    false,
  );
}

async function handleSubscriptionDeleted(
  db: DbClient,
  subscription: StripeObject,
): Promise<HandlerResult> {
  // Deleted always wins, whatever order events arrive in. Never touches plan.
  return applySubscriptionPatch(
    db,
    subscription.id,
    { status: "canceled" },
    "customer.subscription.deleted",
    subscription.metadata,
  );
}

// ---------------------------------------------------------------------
// charge.refunded (full) / charge.dispute.created
// ---------------------------------------------------------------------
type InvoiceRow = {
  id: string;
  organization_id: string;
  type: string;
  status: string;
  stripe_subscription_id: string | null;
};
type LookupColumn =
  | "stripe_payment_intent_id"
  | "stripe_invoice_id"
  | "stripe_checkout_session_id";

async function findInvoiceBy(
  db: DbClient,
  column: LookupColumn,
  value: unknown,
): Promise<InvoiceRow | null> {
  if (typeof value !== "string" || !value) return null;
  const { data, error } = await db
    .from("invoices")
    .select("id, organization_id, type, status, stripe_subscription_id")
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw fail("Failed to look up invoice", error);
  return data ?? null;
}

async function locateInvoice(
  db: DbClient,
  deps: WebhookDeps,
  paymentIntentId: unknown,
  stripeInvoiceId: unknown,
): Promise<InvoiceRow | null> {
  const direct = (await findInvoiceBy(db, "stripe_payment_intent_id", paymentIntentId)) ??
    (await findInvoiceBy(db, "stripe_invoice_id", stripeInvoiceId));
  if (direct) return direct;

  // charge.invoice absent (or not ours): follow the payment intent.
  if (typeof paymentIntentId === "string" && paymentIntentId && deps.resolvePaymentIntentRefs) {
    const refs = await deps.resolvePaymentIntentRefs(paymentIntentId);
    return (await findInvoiceBy(db, "stripe_invoice_id", refs?.invoiceId)) ??
      (await findInvoiceBy(db, "stripe_checkout_session_id", refs?.sessionId));
  }
  return null;
}

/**
 * A plan invoice was refunded / disputed: block quota'd creations locally and
 * cancel the Stripe subscription (otherwise the next invoice.paid would
 * re-activate the plan). The row that carries the plan is found by the
 * invoice's stripe_subscription_id, else through the billing org - never by
 * invoice.organization_id directly.
 */
async function reversePlanInvoice(
  db: DbClient,
  deps: WebhookDeps,
  invoice: InvoiceRow,
): Promise<HandlerResult> {
  let row: { organization_id: string; status: string; stripe_subscription_id: string | null } | null = null;

  if (invoice.stripe_subscription_id) {
    const { data, error } = await db
      .from("organization_subscriptions")
      .select("organization_id, status, stripe_subscription_id")
      .eq("stripe_subscription_id", invoice.stripe_subscription_id)
      .maybeSingle();
    if (error) throw fail("Failed to read subscription", error);
    row = data ?? null;
  }
  if (!row) {
    const { data: billingOrgId, error: billingErr } = await db.rpc(
      "resolve_billing_organization_id",
      { p_organization_id: invoice.organization_id },
    );
    if (billingErr) throw fail("resolve_billing_organization_id failed", billingErr);
    if (billingOrgId) {
      const { data, error } = await db
        .from("organization_subscriptions")
        .select("organization_id, status, stripe_subscription_id")
        .eq("organization_id", billingOrgId)
        .maybeSingle();
      if (error) throw fail("Failed to read subscription", error);
      row = data ?? null;
    }
  }
  if (!row) return reject("no_subscription_row", { invoiceId: invoice.id });

  if (row.status === "active" || row.status === "trialing") {
    const { data, error } = await db
      .from("organization_subscriptions")
      .update({ status: "past_due", updated_at: nowIso() })
      .eq("organization_id", row.organization_id)
      .select("organization_id");
    if (error) throw fail("Failed to set subscription past_due", error);
    if (!data || data.length === 0) {
      throw new Error(`Subscription of ${row.organization_id} not set past_due (0 rows)`);
    }
  }

  const stripeSubscriptionId = row.stripe_subscription_id ?? invoice.stripe_subscription_id;
  if (stripeSubscriptionId && row.status !== "canceled") {
    // Throws on failure -> 500 -> Stripe retries the whole event.
    await deps.cancelSubscription(stripeSubscriptionId);
  }
  return processed();
}

async function cancelInvoiceAndRevoke(
  db: DbClient,
  deps: WebhookDeps,
  paymentIntentId: unknown,
  stripeInvoiceId: unknown,
): Promise<HandlerResult> {
  const invoice = await locateInvoice(db, deps, paymentIntentId, stripeInvoiceId);
  if (!invoice) return reject("unknown_invoice", { paymentIntentId, stripeInvoiceId });

  // refunded_at is written ONLY by fn_revoke_invoice_credits (idempotency key).
  if (invoice.status !== "cancelado") {
    const { data, error } = await db
      .from("invoices")
      .update({ status: "cancelado" })
      .eq("id", invoice.id)
      .select("id");
    if (error) throw fail("Failed to cancel invoice", error);
    if (!data || data.length === 0) {
      throw new Error(`Invoice ${invoice.id} not cancelled (0 rows)`);
    }
  }

  // Also on redelivery: each step is idempotent.
  if (invoice.type === "plano") {
    return reversePlanInvoice(db, deps, invoice);
  }
  if (invoice.type === "creditos") {
    const { error } = await db.rpc("fn_revoke_invoice_credits", {
      _invoice_id: invoice.id,
    });
    if (error) throw fail("fn_revoke_invoice_credits failed", error);
  }
  return processed();
}

async function handleChargeRefunded(
  db: DbClient,
  charge: StripeObject,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  const fullyRefunded = charge?.refunded === true ||
    (typeof charge?.amount === "number" && charge.amount > 0 &&
      charge.amount_refunded >= charge.amount);
  if (!fullyRefunded) {
    // fn_revoke_invoice_credits has no partial parameter: a human decides.
    return reject("partial_refund_manual", {
      paymentIntentId: charge?.payment_intent ?? null,
      stripeInvoiceId: charge?.invoice ?? null,
      amount: charge?.amount ?? null,
      amountRefunded: charge?.amount_refunded ?? null,
    });
  }
  return cancelInvoiceAndRevoke(db, deps, charge.payment_intent, charge.invoice);
}

async function handleDisputeCreated(
  db: DbClient,
  dispute: StripeObject,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  return cancelInvoiceAndRevoke(db, deps, dispute.payment_intent, dispute.invoice);
}

async function dispatch(
  db: DbClient,
  event: StripeEvent,
  deps: WebhookDeps,
): Promise<HandlerResult> {
  const obj = event.data?.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutPaid(db, obj, deps);
    case "checkout.session.expired":
      return handleCheckoutExpired(db, obj);
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return handleInvoicePaid(db, obj, deps);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(db, obj);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(db, obj, deps);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(db, obj);
    case "charge.refunded":
      return handleChargeRefunded(db, obj, deps);
    case "charge.dispute.created":
      return handleDisputeCreated(db, obj, deps);
    default:
      return processed();
  }
}

// ---------------------------------------------------------------------
// Event ledger + entry point
// ---------------------------------------------------------------------
const UNIQUE_VIOLATION = "23505";

type Claim =
  | { state: "claimed"; claimedAt: string }
  | { state: "duplicate" }
  | { state: "in_progress" };

async function claimEvent(db: DbClient, event: StripeEvent): Promise<Claim> {
  const now = Date.now();
  const claimedAt = new Date(now).toISOString();
  const { error } = await db.from("stripe_webhook_events").insert({
    event_id: event.id,
    type: event.type,
    status: "processing",
    claimed_at: claimedAt,
  });
  if (!error) return { state: "claimed", claimedAt };
  if (error.code !== UNIQUE_VIOLATION) {
    throw fail("Failed to record webhook event", error);
  }

  const { data: existing, error: readErr } = await db
    .from("stripe_webhook_events")
    .select("status, claimed_at")
    .eq("event_id", event.id)
    .maybeSingle();
  if (readErr) throw fail("Failed to read webhook event", readErr);
  if (existing?.status === "processed" || existing?.status === "rejected") {
    return { state: "duplicate" };
  }

  const reclaimPatch = {
    status: "processing",
    error: null,
    claimed_at: claimedAt,
  };
  if (existing?.status === "failed") {
    const { data, error: e } = await db
      .from("stripe_webhook_events")
      .update(reclaimPatch)
      .eq("event_id", event.id)
      .eq("status", "failed")
      .select("event_id");
    if (e) throw fail("Failed to reclaim webhook event", e);
    if (data && data.length > 0) return { state: "claimed", claimedAt };
  } else if (existing?.status === "processing") {
    // A worker that died mid-way leaves 'processing' behind forever.
    const cutoff = new Date(now - STALE_PROCESSING_MS).toISOString();
    const { data, error: e } = await db
      .from("stripe_webhook_events")
      .update(reclaimPatch)
      .eq("event_id", event.id)
      .eq("status", "processing")
      .lt("claimed_at", cutoff)
      .select("event_id");
    if (e) throw fail("Failed to reclaim stale webhook event", e);
    if (data && data.length > 0) return { state: "claimed", claimedAt };
  }
  return { state: "in_progress" };
}

async function finishEvent(
  db: DbClient,
  eventId: string,
  status: "processed" | "rejected" | "failed",
  error: string | null,
  claimedAt: string,
): Promise<void> {
  // Only while the row is still ours: still 'processing' with our claim.
  const { data, error: updErr } = await db
    .from("stripe_webhook_events")
    .update({ status, error, processed_at: nowIso() })
    .eq("event_id", eventId)
    .eq("status", "processing")
    .eq("claimed_at", claimedAt)
    .select("event_id");
  if (updErr) throw fail("Failed to finalize webhook event", updErr);
  if (!data || data.length === 0) {
    throw new Error(`Ledger row ${eventId} is no longer 'processing' for this claim`);
  }
}

const FINALIZE_ATTEMPTS = 3;

/**
 * The work is already done when this runs, so a ledger failure must not turn
 * into a 500 (Stripe would retry finished work). Retry, then report loudly:
 * the row stays 'processing' and is reclaimable after STALE_PROCESSING_MS.
 */
async function finishEventBestEffort(
  db: DbClient,
  event: StripeEvent,
  status: "processed" | "rejected" | "failed",
  error: string | null,
  report: ReportFn,
  claimedAt: string,
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < FINALIZE_ATTEMPTS; i++) {
    try {
      await finishEvent(db, event.id, status, error, claimedAt);
      return;
    } catch (e) {
      last = e;
    }
  }
  console.error("stripe-webhook: could not finalize ledger row", event.id, last);
  try {
    await report(last, {
      function: "stripe-webhook",
      eventId: event.id,
      eventType: event.type,
      ledgerFinalizeFailed: true,
      intendedStatus: status,
    });
  } catch (_reportError) {
    // nothing left to do
  }
}

/**
 * Processes one verified Stripe event. Throws on any infrastructure failure
 * (caller: capture to Sentry, answer 500). Returns for everything else.
 */
export async function processStripeEvent(
  db: DbClient,
  event: StripeEvent,
  report: ReportFn,
  deps: WebhookDeps,
): Promise<HandleResult> {
  const claim = await claimEvent(db, event);
  if (claim.state === "duplicate") return { httpStatus: 200, outcome: "duplicate" };
  if (claim.state === "in_progress") return { httpStatus: 409, outcome: "in_progress" };
  const claimedAt = claim.claimedAt;

  let result: HandlerResult;
  try {
    result = await dispatch(db, event, deps);
  } catch (err) {
    await finishEventBestEffort(
      db,
      event,
      "failed",
      err instanceof Error ? err.message : String(err),
      report,
      claimedAt,
    );
    throw err;
  }

  if (result.kind === "rejected") {
    await finishEventBestEffort(db, event, "rejected", result.reason, report, claimedAt);
    await report(new Error(`stripe-webhook rejected event: ${result.reason}`), {
      function: "stripe-webhook",
      eventId: event.id,
      eventType: event.type,
      reason: result.reason,
      ...(result.context ?? {}),
    });
    return { httpStatus: 200, outcome: "rejected", reason: result.reason };
  }

  await finishEventBestEffort(db, event, "processed", null, report, claimedAt);
  return { httpStatus: 200, outcome: "processed" };
}
