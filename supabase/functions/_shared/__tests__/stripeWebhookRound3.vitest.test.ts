import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectOpenPlanSessions, ensureStripeCustomer } from "../checkoutPolicy";
import { processStripeEvent, type StripeEvent } from "../stripeWebhookLogic";
import { createFakeDb, type FakeDb } from "./fakeDb";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const BILLING = "99999999-9999-4999-8999-999999999999";
const INV = "22222222-2222-4222-8222-222222222222";
const SESSION = "cs_test_1";

const report = vi.fn();
const fetchSubscription = vi.fn();
const cancelSubscription = vi.fn();
const deps = { fetchSubscription, cancelSubscription };
let db: FakeDb;

function planInvoice(over: Record<string, unknown> = {}) {
  return {
    id: INV, organization_id: ORG, type: "plano", amount: 49.9, status: "pendente",
    target_plan: "pro", stripe_checkout_session_id: SESSION, ...over,
  };
}

function checkout(over: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}): StripeEvent {
  return {
    id: "evt_c", type: "checkout.session.completed",
    data: { object: {
      id: SESSION, mode: "subscription", payment_status: "paid", amount_total: 4990, currency: "eur",
      customer: "cus_1", subscription: "sub_new", payment_intent: null, invoice: "in_1",
      metadata: { invoice_id: INV, organization_id: ORG, ...metadata }, ...over,
    } },
  };
}

function seed(invoices: Array<Record<string, unknown>>, subs: Array<Record<string, unknown>>) {
  db = createFakeDb({ invoices, organization_subscriptions: subs });
  db.rpcResults.resolve_billing_organization_id = { data: ORG, error: null };
}
const trialSub = { organization_id: ORG, plan: "trial", status: "trialing", stripe_subscription_id: null };

beforeEach(() => {
  report.mockReset();
  fetchSubscription.mockReset();
  cancelSubscription.mockReset();
  cancelSubscription.mockResolvedValue({});
  fetchSubscription.mockResolvedValue({ id: "sub_new", status: "active", current_period_end: 1900000000, metadata: {} });
  seed([planInvoice()], [{ ...trialSub }]);
});

describe("H1/M1 refund or dispute of a plan invoice", () => {
  const dispute = (): StripeEvent => ({ id: "evt_d", type: "charge.dispute.created", data: { object: { payment_intent: "pi_1" } } });

  it("marks the row carrying the plan (via stripe_subscription_id) past_due and cancels it on Stripe", async () => {
    seed(
      [{ id: INV, organization_id: "child-org", type: "plano", status: "pago", stripe_payment_intent_id: "pi_1", stripe_subscription_id: "sub_9" }],
      [
        { organization_id: "child-org", plan: "trial", status: "trialing", stripe_subscription_id: null },
        { organization_id: BILLING, plan: "pro", status: "active", stripe_subscription_id: "sub_9" },
      ],
    );
    await processStripeEvent(db, dispute(), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    expect(db.tables.organization_subscriptions[1].status).toBe("past_due");
    expect(db.tables.organization_subscriptions[0].status).toBe("trialing"); // never invoice.organization_id
    expect(cancelSubscription).toHaveBeenCalledWith("sub_9");
  });

  it("falls back to the billing org when the invoice has no subscription id", async () => {
    seed(
      [{ id: INV, organization_id: "child-org", type: "plano", status: "pago", stripe_payment_intent_id: "pi_1" }],
      [{ organization_id: BILLING, plan: "pro", status: "active", stripe_subscription_id: "sub_9" }],
    );
    db.rpcResults.resolve_billing_organization_id = { data: BILLING, error: null };
    await processStripeEvent(db, dispute(), report, deps);
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
    expect(cancelSubscription).toHaveBeenCalledWith("sub_9");
  });

  it("no subscription row anywhere -> rejected no_subscription_row (200, no retry loop)", async () => {
    seed([{ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_payment_intent_id: "pi_1" }], []);
    const r = await processStripeEvent(db, dispute(), report, deps);
    expect(r).toMatchObject({ httpStatus: 200, outcome: "rejected", reason: "no_subscription_row" });
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("a failing Stripe cancel throws so Stripe retries", async () => {
    seed(
      [{ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_payment_intent_id: "pi_1", stripe_subscription_id: "sub_9" }],
      [{ organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_9" }],
    );
    cancelSubscription.mockRejectedValue(new Error("stripe 500"));
    await expect(processStripeEvent(db, dispute(), report, deps)).rejects.toThrow("stripe 500");
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due"); // set right away
  });

  it("a full refund does the same", async () => {
    seed(
      [{ id: INV, organization_id: ORG, type: "plano", status: "pago", stripe_payment_intent_id: "pi_1", stripe_subscription_id: "sub_9" }],
      [{ organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_9" }],
    );
    await processStripeEvent(db, { id: "evt_r", type: "charge.refunded", data: { object: { refunded: true, payment_intent: "pi_1" } } }, report, deps);
    expect(cancelSubscription).toHaveBeenCalledWith("sub_9");
    expect(db.tables.organization_subscriptions[0].status).toBe("past_due");
  });
});

describe("M2 status comes from the live subscription", () => {
  it("writes the mapped live status, not a hard-coded active", async () => {
    fetchSubscription.mockResolvedValue({ id: "sub_new", status: "trialing", current_period_end: 1900000000, metadata: {} });
    await processStripeEvent(db, checkout(), report, deps);
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ plan: "pro", status: "trialing" });
  });
});

describe("M3 second live subscription", () => {
  it("does not overwrite an active different subscription: paid + rejected second_subscription_review with both ids", async () => {
    seed([planInvoice()], [{ organization_id: ORG, plan: "starter", status: "active", stripe_subscription_id: "sub_old" }]);
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r).toMatchObject({ outcome: "rejected", reason: "second_subscription_review" });
    expect(db.tables.invoices[0].status).toBe("pago");
    expect(db.tables.organization_subscriptions[0]).toMatchObject({ plan: "starter", stripe_subscription_id: "sub_old" });
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      invoiceId: INV, existingSubscriptionId: "sub_old", newSubscriptionId: "sub_new",
    }));
  });

  it("redelivery of the same subscription is not a conflict", async () => {
    seed([planInvoice({ status: "pago" })], [{ organization_id: ORG, plan: "pro", status: "active", stripe_subscription_id: "sub_new" }]);
    const r = await processStripeEvent(db, checkout(), report, deps);
    expect(r.outcome).toBe("processed");
  });
});

describe("M4 expired sessions", () => {
  const expired = (): StripeEvent => ({
    id: "evt_x", type: "checkout.session.expired",
    data: { object: { id: SESSION, metadata: { invoice_id: INV } } },
  });

  it("closes the pending invoice, and is idempotent", async () => {
    await processStripeEvent(db, expired(), report, deps);
    expect(db.tables.invoices[0].status).toBe("cancelado");
    const again = await processStripeEvent(db, { ...expired(), id: "evt_x2" }, report, deps);
    expect(again.outcome).toBe("processed");
    expect(db.tables.invoices[0].status).toBe("cancelado");
  });

  it("never closes an invoice that was paid", async () => {
    seed([planInvoice({ status: "pago" })], [{ ...trialSub }]);
    await processStripeEvent(db, expired(), report, deps);
    expect(db.tables.invoices[0].status).toBe("pago");
  });

  it("collectOpenPlanSessions cancels invoices whose session is dead (404 or expired) and keeps going", async () => {
    const recent = new Date().toISOString();
    const rows = [
      { id: "i1", created_at: recent, target_plan: "pro", stripe_checkout_session_id: "cs_404" },
      { id: "i2", created_at: recent, target_plan: "pro", stripe_checkout_session_id: "cs_exp" },
      { id: "i3", created_at: recent, target_plan: "starter", stripe_checkout_session_id: "cs_open" },
      { id: "i4", created_at: recent, target_plan: "pro", stripe_checkout_session_id: "cs_flaky" },
    ];
    const cancelled: string[] = [];
    const open = await collectOpenPlanSessions(
      rows,
      async (id) => {
        if (id === "cs_404") throw Object.assign(new Error("No such checkout.session"), { status: 404 });
        if (id === "cs_flaky") throw Object.assign(new Error("boom"), { status: 500 });
        return id === "cs_exp" ? { status: "expired" } : { status: "open", url: "https://pay/open" };
      },
      async (id) => { cancelled.push(id); },
    );
    expect(cancelled).toEqual(["i1", "i2"]); // the flaky one is left alone
    expect(open).toEqual([{ target_plan: "starter", url: "https://pay/open" }]);
  });
});

describe("HIGH-2 plan from the old checkout's metadata", () => {
  it("falls back to session.metadata.target_plan when invoices.target_plan is NULL", async () => {
    seed([planInvoice({ target_plan: null })], [{ ...trialSub }]);
    await processStripeEvent(db, checkout({}, { target_plan: "enterprise" }), report, deps);
    expect(db.tables.organization_subscriptions[0].plan).toBe("enterprise");
  });

  it("ignores a non-purchasable metadata plan -> missing_target_plan", async () => {
    seed([planInvoice({ target_plan: null })], [{ ...trialSub }]);
    for (const bad of ["internal", "trial", "hacker"]) {
      const r = await processStripeEvent(db, { ...checkout({}, { target_plan: bad }), id: `e_${bad}` }, report, deps);
      expect(r.reason).toBe("missing_target_plan");
    }
    expect(db.tables.organization_subscriptions[0].plan).toBe("trial");
  });

  it("invoices.target_plan still wins over metadata", async () => {
    await processStripeEvent(db, checkout({}, { target_plan: "enterprise" }), report, deps);
    expect(db.tables.organization_subscriptions[0].plan).toBe("pro");
  });
});

describe("ledger claim ownership", () => {
  it("does not overwrite a ledger row that is no longer ours", async () => {
    fetchSubscription.mockImplementation(async () => {
      // someone reclaimed and finished the event while we were working
      Object.assign(db.tables.stripe_webhook_events[0], { status: "processed", claimed_at: "2000-01-01T00:00:00.000Z" });
      return { id: "sub_1", status: "active", metadata: {} };
    });
    const r = await processStripeEvent(db, { id: "evt_own", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }, report, deps);
    expect(r.outcome === "processed" || r.outcome === "rejected").toBe(true);
    expect(db.tables.stripe_webhook_events[0]).toMatchObject({ status: "processed", claimed_at: "2000-01-01T00:00:00.000Z" });
    expect(report).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ledgerFinalizeFailed: true }));
  });
});

describe("customer creation, Stripe 409 idempotency_key_in_use", () => {
  it("retries once and succeeds", async () => {
    const d = createFakeDb({ organization_subscriptions: [{ organization_id: ORG, stripe_customer_id: null }] });
    const create = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("in use"), { status: 409, code: "idempotency_key_in_use" }))
      .mockResolvedValueOnce({ id: "cus_ok" });
    expect(await ensureStripeCustomer(d, ORG, null, create)).toBe("cus_ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(ensureStripeCustomer(createFakeDb(), ORG, null, create)).rejects.toThrow("bad");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
