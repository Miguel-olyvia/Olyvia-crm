import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapStripeSubscriptionStatus,
  processStripeEvent,
  type StripeEvent,
} from "../stripeWebhookLogic";
import { createFakeDb, type FakeDb } from "./fakeDb";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const INV = "22222222-2222-4222-8222-222222222222";
const SESSION = "cs_test_1";

function planInvoice(over: Record<string, unknown> = {}) {
  return {
    id: INV,
    organization_id: ORG,
    type: "plano",
    amount: 49.9,
    status: "pendente",
    target_plan: "pro",
    stripe_checkout_session_id: SESSION,
    ...over,
  };
}

function checkoutEvent(over: Record<string, unknown> = {}, type = "checkout.session.completed"): StripeEvent {
  return {
    id: "evt_1",
    type,
    data: {
      object: {
        id: SESSION,
        mode: "subscription",
        payment_status: "paid",
        amount_total: 4990,
        currency: "eur",
        customer: "cus_1",
        subscription: "sub_1",
        payment_intent: null,
        invoice: "in_1",
        metadata: { invoice_id: INV, organization_id: ORG, target_plan: "enterprise" },
        ...over,
      },
    },
  };
}

let db: FakeDb;
const report = vi.fn();
const LIVE_END = 1900000000;
const fetchSubscription = vi.fn();
const cancelSubscription = vi.fn().mockResolvedValue({});
const deps = { fetchSubscription, cancelSubscription };

function seed(invoice: Record<string, unknown> = planInvoice()) {
  db = createFakeDb({
    invoices: [invoice],
    organization_subscriptions: [
      { organization_id: ORG, plan: "trial", status: "trialing", trial_ends_at: "2026-10-01", stripe_subscription_id: null },
    ],
  });
  db.rpcResults.resolve_billing_organization_id = { data: ORG, error: null };
}

beforeEach(() => {
  report.mockReset();
  fetchSubscription.mockReset();
  fetchSubscription.mockResolvedValue({ id: "sub_1", status: "active", current_period_end: LIVE_END, metadata: {} });
  seed();
});

describe("checkout.session.completed", () => {
  it("marks paid, takes the plan from invoices.target_plan (not metadata) and clears the trial", async () => {
    const r = await processStripeEvent(db, checkoutEvent(), report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.tables.invoices[0].stripe_invoice_id).toBe("in_1");
    expect(db.tables.organization_subscriptions[0]).toMatchObject({
      plan: "pro", // metadata said enterprise
      status: "active",
      trial_ends_at: null,
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
    expect(db.tables.stripe_webhook_events[0]).toMatchObject({ event_id: "evt_1", status: "processed" });
    expect(report).not.toHaveBeenCalled();
  });

  it("rejects a wrong amount, records it and answers 200", async () => {
    const r = await processStripeEvent(db, checkoutEvent({ amount_total: 100 }), report, deps);
    expect(r).toMatchObject({ httpStatus: 200, outcome: "rejected", reason: "amount_mismatch" });
    expect(db.tables.invoices[0].status).toBe("pendente");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
    expect(db.tables.stripe_webhook_events[0].status).toBe("rejected");
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong currency, foreign session, org mismatch and non-billing org", async () => {
    expect((await processStripeEvent(db, { ...checkoutEvent({ currency: "usd" }), id: "e1" }, report, deps)).reason).toBe("currency_mismatch");
    expect((await processStripeEvent(db, { ...checkoutEvent({ id: "cs_other" }), id: "e2" }, report, deps)).reason).toBe("session_mismatch");
    expect((await processStripeEvent(db, {
      ...checkoutEvent({ metadata: { invoice_id: INV, organization_id: "other-org" } }), id: "e3",
    }, report, deps)).reason).toBe("organization_mismatch");
    db.rpcResults.resolve_billing_organization_id = { data: "someone-elses-org", error: null };
    // Payment already taken, payer unknown: paid + flagged, plan NOT applied (see M3 tests).
    expect((await processStripeEvent(db, { ...checkoutEvent(), id: "e4" }, report, deps)).reason).toBe("not_billing_organization");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });

  it("rejects an unknown invoice", async () => {
    const r = await processStripeEvent(db, checkoutEvent({ metadata: { invoice_id: "nope", organization_id: ORG } }), report, deps);
    expect(r.reason).toBe("unknown_invoice");
  });

  it("ignores an unpaid session without touching anything", async () => {
    const r = await processStripeEvent(db, checkoutEvent({ payment_status: "unpaid" }), report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.invoices[0].status).toBe("pendente");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });

  it("async_payment_succeeded activates like completed", async () => {
    await processStripeEvent(db, checkoutEvent({}, "checkout.session.async_payment_succeeded"), report, deps);
    expect(db.tables.organization_subscriptions[0].plan).toBe("pro");
  });

  it("still applies the subscription update when the invoice was already paid", async () => {
    seed(planInvoice({ status: "pago" }));
    const r = await processStripeEvent(db, checkoutEvent(), report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ plan: "pro", status: "active", trial_ends_at: null });
  });

  it("a DB error while marking paid throws (-> HTTP 500) and marks the event failed", async () => {
    db.failOn("invoices", "update");
    await expect(processStripeEvent(db, checkoutEvent(), report, deps)).rejects.toThrow(/Failed to mark invoice/);
    expect(db.tables.stripe_webhook_events[0].status).toBe("failed");
  });

  it("a subscription update matching 0 rows throws", async () => {
    db.tables.organization_subscriptions.length = 0;
    await expect(processStripeEvent(db, checkoutEvent(), report, deps)).rejects.toThrow(/No organization_subscriptions row/);
  });

  it("a failed event is retried on redelivery and then succeeds", async () => {
    db.failOn("invoices", "update");
    await expect(processStripeEvent(db, checkoutEvent(), report, deps)).rejects.toThrow();
    // clear the forced failure by rebuilding the invoice table access
    const fresh = createFakeDb({
      invoices: db.tables.invoices,
      organization_subscriptions: db.tables.organization_subscriptions,
      stripe_webhook_events: db.tables.stripe_webhook_events,
    });
    fresh.rpcResults.resolve_billing_organization_id = { data: ORG, error: null };
    const r = await processStripeEvent(fresh, checkoutEvent(), report, deps);
    expect(r.outcome).toBe("processed");
    expect(fresh.tables.invoices[0].status).toBe("pago");
  });
});

describe("event dedup", () => {
  it("answers 200 duplicate for an already processed event without reprocessing", async () => {
    await processStripeEvent(db, checkoutEvent(), report, deps);
    db.tables.organization_subscriptions[0].plan = "starter"; // would be overwritten if reprocessed
    const r = await processStripeEvent(db, checkoutEvent(), report, deps);
    expect(r).toEqual({ httpStatus: 200, outcome: "duplicate" });
    expect(db.tables.organization_subscriptions[0].plan).toBe("starter");
  });

  it("asks Stripe to retry (409) while the same event is still processing", async () => {
    db.tables.stripe_webhook_events = [{ event_id: "evt_1", type: "x", status: "processing", claimed_at: new Date().toISOString() }];
    const r = await processStripeEvent(db, checkoutEvent(), report, deps);
    expect(r).toMatchObject({ httpStatus: 409, outcome: "in_progress" });
  });

  it("a failure inserting the ledger row throws", async () => {
    db.failOn("stripe_webhook_events", "insert");
    await expect(processStripeEvent(db, checkoutEvent(), report, deps)).rejects.toThrow(/record webhook event/);
  });
});

describe("subscription events", () => {
  it.each([
    ["trialing", "trialing"],
    ["active", "active"],
    ["past_due", "past_due"],
    ["unpaid", "past_due"],
    ["paused", "past_due"],
    ["canceled", "canceled"],
    ["incomplete_expired", "canceled"],
    ["incomplete", "incomplete"],
  ])("maps %s -> %s", (stripe, ours) => {
    expect(mapStripeSubscriptionStatus(stripe)).toBe(ours);
  });

  it("throws on an unknown status", () => {
    expect(() => mapStripeSubscriptionStatus("weird")).toThrow();
  });

  it("customer.subscription.updated changes status but never plan", async () => {
    db.tables.organization_subscriptions[0] = { organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_1" };
    await processStripeEvent(db, {
      id: "evt_u", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active" } },
    }, report, deps);
    fetchSubscription.mockClear();
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "unpaid", current_period_end: LIVE_END, metadata: {} });
    await processStripeEvent(db, {
      id: "evt_u2", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active" } }, // stale event says active
    }, report, deps);
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ plan: "pro", status: "past_due" });
    expect(db.tables.organization_subscriptions[0].current_period_end).toBe(new Date(LIVE_END * 1000).toISOString());
  });

  it("an unknown status becomes a thrown error (500)", async () => {
    db.tables.organization_subscriptions[0].stripe_subscription_id = "sub_1";
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "weird" });
    await expect(processStripeEvent(db, {
      id: "evt_bad", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "weird" } },
    }, report, deps)).rejects.toThrow(/Unknown Stripe subscription status/);
  });

  it("unmatched subscription without invoice metadata is rejected as unknown_subscription (200)", async () => {
    const r = await processStripeEvent(db, {
      id: "evt_nomatch", type: "customer.subscription.deleted",
      data: { object: { id: "sub_missing", status: "canceled" } },
    }, report, deps);
    expect(r).toMatchObject({ httpStatus: 200, outcome: "rejected", reason: "unknown_subscription" });
  });

  it("invoice.paid activates, sets period end and clears trial_ends_at", async () => {
    db.tables.organization_subscriptions[0] = {
      organization_id: ORG, plan: "pro", status: "past_due", trial_ends_at: "2026-10-01", stripe_subscription_id: "sub_1",
    };
    await processStripeEvent(db, {
      id: "evt_p", type: "invoice.paid",
      data: { object: { subscription: "sub_1", lines: { data: [{ period: { end: 1800000000 } }] } } },
    }, report, deps);
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ status: "active", trial_ends_at: null });
    expect(db.tables.organization_subscriptions[0].current_period_end).toBe(new Date(LIVE_END * 1000).toISOString());
  });

  it("invoice.payment_failed matches on the subscription id, not the customer", async () => {
    db.tables.organization_subscriptions[0] = { organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_1", stripe_customer_id: "cus_shared" };
    db.tables.organization_subscriptions.push({ organization_id: "org-2", plan: "pro", status: "active", stripe_subscription_id: "sub_2", stripe_customer_id: "cus_shared" });
    await processStripeEvent(db, {
      id: "evt_f", type: "invoice.payment_failed",
      data: { object: { subscription: "sub_1", customer: "cus_shared" } },
    }, report, deps);
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
    expect(db.tables.organization_subscriptions[1].status).toBe("active");
  });
});

describe("refunds and disputes", () => {
  const creditsInvoice = { id: INV, organization_id: ORG, type: "creditos", status: "pago", stripe_payment_intent_id: "pi_1" };

  it("full refund cancels the invoice and revokes credits", async () => {
    seed(creditsInvoice);
    await processStripeEvent(db, {
      id: "evt_r", type: "charge.refunded",
      data: { object: { refunded: true, amount: 5000, amount_refunded: 5000, payment_intent: "pi_1" } },
    }, report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.rpcCalls.filter((c) => c.fn === "fn_revoke_invoice_credits")).toEqual([
      { fn: "fn_revoke_invoice_credits", args: { _invoice_id: INV } },
    ]);
  });

  it("partial refund is recorded for manual handling, nothing revoked", async () => {
    seed(creditsInvoice);
    await processStripeEvent(db, {
      id: "evt_pr", type: "charge.refunded",
      data: { object: { refunded: false, amount: 5000, amount_refunded: 1000, payment_intent: "pi_1" } },
    }, report, deps);
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.rpcCalls.some((c) => c.fn === "fn_revoke_invoice_credits")).toBe(false);
    expect(db.tables.stripe_webhook_events.at(-1)).toMatchObject({ status: "rejected", error: "partial_refund_manual" });
    expect(report).toHaveBeenCalled();
  });

  it("refund of a plan invoice (found via stripe_invoice_id) cancels it without revoking credits", async () => {
    seed({ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_invoice_id: "in_1" });
    db.tables.organization_subscriptions[0].status = "active";
    await processStripeEvent(db, {
      id: "evt_rp", type: "charge.refunded",
      data: { object: { refunded: true, amount: 4990, amount_refunded: 4990, payment_intent: "pi_x", invoice: "in_1" } },
    }, report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
    expect(db.rpcCalls.some((c) => c.fn === "fn_revoke_invoice_credits")).toBe(false);
  });

  it("dispute on a plan invoice cancels it and sets the subscription past_due (no Stripe cancel)", async () => {
    seed({ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_payment_intent_id: "pi_1" });
    db.tables.organization_subscriptions[0].status = "active";
    await processStripeEvent(db, {
      id: "evt_d", type: "charge.dispute.created",
      data: { object: { payment_intent: "pi_1" } },
    }, report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });

  it("revoke RPC failure throws (500) and a redelivery retries the revoke", async () => {
    seed(creditsInvoice);
    db.rpcResults.fn_revoke_invoice_credits = { data: null, error: { message: "boom" } };
    const ev = { id: "evt_rr", type: "charge.refunded", data: { object: { refunded: true, payment_intent: "pi_1" } } };
    await expect(processStripeEvent(db, ev, report, deps)).rejects.toThrow(/fn_revoke_invoice_credits/);
    db.rpcResults.fn_revoke_invoice_credits = { data: 12, error: null };
    const r = await processStripeEvent(db, ev, report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.rpcCalls.filter((c) => c.fn === "fn_revoke_invoice_credits")).toHaveLength(2);
  });

  it("an unknown invoice on refund is rejected, not thrown", async () => {
    const r = await processStripeEvent(db, {
      id: "evt_ru", type: "charge.refunded",
      data: { object: { refunded: true, payment_intent: "pi_none" } },
    }, report, deps);
    expect(r).toMatchObject({ outcome: "rejected", reason: "unknown_invoice" });
  });
});
