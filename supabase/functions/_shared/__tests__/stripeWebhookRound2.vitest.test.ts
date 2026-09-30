import { beforeEach, describe, expect, it, vi } from "vitest";
import { processStripeEvent, type StripeEvent } from "../stripeWebhookLogic";
import { createFakeDb, type FakeDb } from "./fakeDb";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const BILLING = "99999999-9999-4999-8999-999999999999";
const INV = "22222222-2222-4222-8222-222222222222";
const SESSION = "cs_test_1";
const LIVE_END = 1900000000;

const report = vi.fn();
const fetchSubscription = vi.fn();
const resolvePaymentIntentRefs = vi.fn();
const cancelSubscription = vi.fn().mockResolvedValue({});
const deps = { fetchSubscription, cancelSubscription, resolvePaymentIntentRefs };

let db: FakeDb;

function planInvoice(over: Record<string, unknown> = {}) {
  return {
    id: INV, organization_id: ORG, type: "plano", amount: 49.9, status: "pendente",
    target_plan: "pro", stripe_checkout_session_id: SESSION, ...over,
  };
}

function checkout(over: Record<string, unknown> = {}, id = "evt_c"): StripeEvent {
  return {
    id, type: "checkout.session.completed",
    data: { object: {
      id: SESSION, mode: "subscription", payment_status: "paid", amount_total: 4990,
      currency: "eur", customer: "cus_1", subscription: "sub_1", payment_intent: null, invoice: "in_1",
      metadata: { invoice_id: INV, organization_id: ORG }, ...over,
    } },
  };
}

function seed(invoices: Array<Record<string, unknown>> = [planInvoice()], subs?: Array<Record<string, unknown>>) {
  db = createFakeDb({
    invoices,
    organization_subscriptions: subs ?? [
      { organization_id: ORG, plan: "trial", status: "trialing", stripe_customer_id: "cus_keep", stripe_subscription_id: null },
    ],
  });
  db.rpcResults.resolve_billing_organization_id = { data: ORG, error: null };
}

beforeEach(() => {
  report.mockReset();
  fetchSubscription.mockReset();
  resolvePaymentIntentRefs.mockReset();
  cancelSubscription.mockClear();
  fetchSubscription.mockResolvedValue({ id: "sub_1", status: "active", current_period_end: LIVE_END, metadata: {} });
  seed();
});

describe("B1 credits revoke follows the real SQL rule", () => {
  function seedCredits() {
    seed([{
      id: INV, organization_id: ORG, type: "creditos", status: "pago", stripe_payment_intent_id: "pi_1",
      credits_credited: 100, paid_at: "2026-09-01T00:00:00Z", refunded_at: null,
    }]);
    db.tables.org_credits = [{ organization_id: ORG, balance: 100 }];
    // Real rules: needs paid_at; only this function writes refunded_at; already
    // refunded -> 0; removes at most what is left in the credited org's balance.
    db.rpcHandlers.fn_revoke_invoice_credits = (args, d) => {
      const inv = d.tables.invoices.find((i) => i.id === args._invoice_id)!;
      if (!inv.paid_at || inv.refunded_at) return { data: 0, error: null };
      const bal = d.tables.org_credits.find((c) => c.organization_id === inv.organization_id)!;
      const removed = Math.min(Number(inv.credits_credited), Number(bal.balance));
      bal.balance = Number(bal.balance) - removed;
      inv.refunded_at = new Date().toISOString();
      return { data: removed, error: null };
    };
  }
  const refund = (id: string): StripeEvent => ({
    id, type: "charge.refunded",
    data: { object: { refunded: true, amount: 5000, amount_refunded: 5000, payment_intent: "pi_1" } },
  });

  it("revoke is capped at the remaining balance", async () => {
    seedCredits();
    db.tables.org_credits[0].balance = 30; // 70 already spent
    await processStripeEvent(db, refund("evt_cap"), report, deps);
    expect(db.tables.org_credits[0].balance).toBe(0);
  });

  it("a refund never writes refunded_at itself (the revoke function does)", async () => {
    seedCredits();
    db.rpcHandlers.fn_revoke_invoice_credits = () => ({ data: 0, error: null });
    await processStripeEvent(db, refund("evt_nw"), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.invoices[0].refunded_at).toBeNull();
  });

  it("actually removes the credits, and a second refund event removes nothing more", async () => {
    seedCredits();
    await processStripeEvent(db, refund("evt_a"), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.org_credits[0].balance).toBe(0);
    await processStripeEvent(db, refund("evt_b"), report, deps);
    expect(db.tables.org_credits[0].balance).toBe(0);
  });
});

describe("H1 event ledger", () => {
  const unpaid: StripeEvent = { ...checkout({ payment_status: "unpaid" }), id: "evt_l" };

  it("reclaims a stale 'processing' row (older than 5 minutes) and refreshes claimed_at", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    db.tables.stripe_webhook_events = [{ event_id: "evt_l", type: "x", status: "processing", claimed_at: old }];
    const r = await processStripeEvent(db, unpaid, report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.stripe_webhook_events[0].status).toBe("processed");
    expect(db.tables.stripe_webhook_events[0].claimed_at).not.toBe(old);
  });

  it("a fresh 'processing' row stays 409", async () => {
    db.tables.stripe_webhook_events = [{ event_id: "evt_l", type: "x", status: "processing", claimed_at: new Date().toISOString() }];
    const r = await processStripeEvent(db, unpaid, report, deps);
    expect(r).toMatchObject({ httpStatus: 409, outcome: "in_progress" });
  });

  it("if finalizing the ledger fails after the work succeeded, it retries, reports, and does not throw", async () => {
    db.failOn("stripe_webhook_events", "update");
    const r = await processStripeEvent(db, unpaid, report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.stripe_webhook_events[0].status).toBe("processing"); // reclaimable later
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ledgerFinalizeFailed: true, eventId: "evt_l" }));
  });
});

describe("H2 replaced / not-yet-bound subscriptions", () => {
  const subEvent = (type: string, metadata: Record<string, unknown> | undefined): StripeEvent => ({
    id: `evt_${type}`, type, data: { object: { id: "sub_new", status: "canceled", metadata } },
  });

  it("throws (retry) while the invoice named in the metadata is still pendente", async () => {
    await expect(processStripeEvent(db, subEvent("customer.subscription.deleted", { invoice_id: INV }), report, deps))
      .rejects.toThrow(/not bound yet/);
  });

  it("rejects with unknown_subscription (200) once that invoice is no longer pendente", async () => {
    seed([planInvoice({ status: "pago" })]);
    const r = await processStripeEvent(db, subEvent("customer.subscription.deleted", { invoice_id: INV }), report, deps);
    expect(r).toMatchObject({ httpStatus: 200, outcome: "rejected", reason: "unknown_subscription" });
  });

  it("events of a replaced subscription do not touch the current one", async () => {
    seed([planInvoice({ status: "pago" })], [
      { organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_current" },
    ]);
    const r = await processStripeEvent(db, {
      id: "evt_old", type: "invoice.payment_failed",
      data: { object: { subscription: "sub_old", subscription_details: { metadata: { invoice_id: INV } } } },
    }, report, deps);
    expect(r.reason).toBe("unknown_subscription");
    expect(db.tables.organization_subscriptions[0].status).toBe("active");
  });

  it("invoice.paid racing ahead of checkout.session.completed is processed (checkout applies live state)", async () => {
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "active", current_period_end: LIVE_END, metadata: { invoice_id: INV } });
    const paid: StripeEvent = { id: "evt_race", type: "invoice.paid", data: { object: { subscription: "sub_1" } } };
    const early = await processStripeEvent(db, paid, report, deps);
    expect(early.outcome).toBe("processed");
    expect(db.tables.organization_subscriptions[0].status).toBe("trialing"); // untouched
    await processStripeEvent(db, checkout(), report, deps);
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ plan: "pro", status: "active" });
  });

  it("customer.subscription.updated racing ahead of the checkout still retries", async () => {
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "active", metadata: { invoice_id: INV } });
    await expect(processStripeEvent(db, {
      id: "evt_su", type: "customer.subscription.updated", data: { object: { id: "sub_1" } },
    }, report, deps)).rejects.toThrow(/not bound yet/);
  });
});

describe("H3 out-of-order events use the live subscription", () => {
  beforeEach(() => {
    seed([planInvoice({ status: "pago" })], [
      { organization_id: ORG, plan: "pro", status: "canceled", trial_ends_at: null, stripe_subscription_id: "sub_1" },
    ]);
  });

  it("a late invoice.paid does not resurrect a canceled subscription", async () => {
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "canceled", current_period_end: LIVE_END, metadata: {} });
    await processStripeEvent(db, { id: "e1", type: "invoice.paid", data: { object: { subscription: "sub_1" } } }, report, deps);
    expect(fetchSubscription).toHaveBeenCalledWith("sub_1");
    expect(db.tables.organization_subscriptions[0].status).toBe("canceled");
  });

  it("a stale subscription.updated cannot override the live state", async () => {
    fetchSubscription.mockResolvedValue({ id: "sub_1", status: "canceled", metadata: {} });
    await processStripeEvent(db, { id: "e2", type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "active" } } }, report, deps);
    expect(db.tables.organization_subscriptions[0].status).toBe("canceled");
  });

  it("customer.subscription.deleted always wins without asking Stripe", async () => {
    db.tables.organization_subscriptions[0].status = "active";
    await processStripeEvent(db, { id: "e3", type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "active" } } }, report, deps);
    expect(db.tables.organization_subscriptions[0].status).toBe("canceled");
    expect(fetchSubscription).not.toHaveBeenCalled();
  });

  it("a failing live fetch throws so Stripe retries", async () => {
    fetchSubscription.mockRejectedValue(new Error("stripe down"));
    await expect(processStripeEvent(db, { id: "e4", type: "invoice.paid", data: { object: { subscription: "sub_1" } } }, report, deps)).rejects.toThrow("stripe down");
  });
});

describe("M3 payments already taken are never just dropped", () => {
  function payers(map: Record<string, string>) {
    db.rpcHandlers.resolve_root_payer_user_id = (args) => ({ data: map[args.p_organization_id as string] ?? null, error: null });
  }

  it("not_billing_organization with the same payer applies the plan to the billing org resolved now", async () => {
    seed([planInvoice()], [
      { organization_id: ORG, plan: "trial", status: "trialing" },
      { organization_id: BILLING, plan: "trial", status: "trialing" },
    ]);
    db.rpcResults.resolve_billing_organization_id = { data: BILLING, error: null };
    payers({ [ORG]: "payer-1", [BILLING]: "payer-1" });
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r.outcome).toBe("processed");
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.tables.organization_subscriptions[1]).toMatchObject({ plan: "pro", status: "active" });
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });

  it("not_billing_organization with a different payer marks paid, applies nothing, and flags for review", async () => {
    db.rpcResults.resolve_billing_organization_id = { data: BILLING, error: null };
    payers({ [ORG]: "payer-1", [BILLING]: "payer-2" });
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r).toMatchObject({ outcome: "rejected", reason: "not_billing_organization" });
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
    expect(db.tables.stripe_webhook_events[0]).toMatchObject({ status: "rejected", error: "not_billing_organization" });
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ invoiceId: INV }));
  });

  it("missing_target_plan marks paid and flags for review", async () => {
    seed([planInvoice({ target_plan: null })]);
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r.reason).toBe("missing_target_plan");
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ invoiceId: INV, paid: true }));
  });
});

describe("activation details (L4, L5)", () => {
  it("does not overwrite stripe_customer_id with null and stores the live current_period_end", async () => {
    await processStripeEvent(db, checkout({ customer: null }), report, deps);
    expect(db.tables.organization_subscriptions[0].stripe_customer_id).toBe("cus_keep");
    expect(db.tables.organization_subscriptions[0].current_period_end).toBe(new Date(LIVE_END * 1000).toISOString());
    expect(fetchSubscription).toHaveBeenCalledWith("sub_1");
  });
});

describe("M2 refund matching without charge.invoice", () => {
  const refund = (): StripeEvent => ({
    id: "evt_m2", type: "charge.refunded",
    data: { object: { refunded: true, amount: 4990, amount_refunded: 4990, payment_intent: "pi_sub" } },
  });

  it("follows the payment intent to the Stripe invoice id", async () => {
    seed([{ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_invoice_id: "in_1" }]);
    resolvePaymentIntentRefs.mockResolvedValue({ invoiceId: "in_1", sessionId: null });
    await processStripeEvent(db, refund(), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(resolvePaymentIntentRefs).toHaveBeenCalledWith("pi_sub");
  });

  it("falls back to the checkout session found for the payment intent", async () => {
    seed([{ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_checkout_session_id: SESSION }]);
    resolvePaymentIntentRefs.mockResolvedValue({ invoiceId: null, sessionId: SESSION });
    await processStripeEvent(db, refund(), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
  });
});

describe("negative checkout cases", () => {
  it("mode_mismatch", async () => {
    const r = await processStripeEvent(db, checkout({ mode: "payment" }), report, deps);
    expect(r.reason).toBe("mode_mismatch");
    expect(db.tables.invoices[0].status).toBe("pendente");
  });

  it("missing_invoice_id", async () => {
    const r = await processStripeEvent(db, checkout({ metadata: { organization_id: ORG } }), report, deps);
    expect(r.reason).toBe("missing_invoice_id");
  });

  it("an already cancelado invoice is not paid again", async () => {
    seed([planInvoice({ status: "cancelado" })]);
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r.reason).toBe("invoice_cancelled");
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });
});
