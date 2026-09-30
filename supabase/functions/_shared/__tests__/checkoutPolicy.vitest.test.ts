import { describe, expect, it, vi } from "vitest";
import {
  CREDITS_AMOUNT_MAX,
  creditsPriceEur,
  decidePendingCheckout,
  evaluateCreditsPurchase,
  ensureStripeCustomer,
  evaluatePlanPurchase,
  gateCheckout,
  isPendingInvoiceReusable,
  validateCheckoutRequest,
} from "../checkoutPolicy";
import { createFakeDb } from "./fakeDb";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PKG = "11111111-1111-4111-8111-111111111111";

describe("validateCheckoutRequest", () => {
  it("accepts a paid plan", () => {
    const r = validateCheckoutRequest({ organization_id: ORG, type: "plano", target_plan: "pro" });
    expect(r.ok).toBe(true);
  });

  it.each(["trial", "internal"])("rejects target_plan=%s", (plan) => {
    const r = validateCheckoutRequest({ organization_id: ORG, type: "plano", target_plan: plan });
    expect(r.ok).toBe(false);
  });

  it("caps credits_amount at the maximum", () => {
    const ok = validateCheckoutRequest({ organization_id: ORG, type: "creditos", credits_amount: CREDITS_AMOUNT_MAX });
    const over = validateCheckoutRequest({ organization_id: ORG, type: "creditos", credits_amount: CREDITS_AMOUNT_MAX + 1 });
    expect(ok.ok).toBe(true);
    expect(over.ok).toBe(false);
  });

  it("rejects non-integer, zero and negative credits", () => {
    for (const n of [0, -5, 1.5]) {
      expect(validateCheckoutRequest({ organization_id: ORG, type: "creditos", credits_amount: n }).ok).toBe(false);
    }
  });

  it("enforces package/credits exclusivity and plan requirement", () => {
    expect(validateCheckoutRequest({ organization_id: ORG, type: "creditos" }).ok).toBe(false);
    expect(validateCheckoutRequest({ organization_id: ORG, type: "creditos", package_id: PKG, credits_amount: 10 }).ok).toBe(false);
    expect(validateCheckoutRequest({ organization_id: ORG, type: "plano" }).ok).toBe(false);
  });

  it("prices custom credits at EUR 0.70", () => {
    expect(creditsPriceEur(100)).toBe(70);
  });
});

describe("gateCheckout", () => {
  it("lets the root payer through", () => {
    expect(gateCheckout({ callerAnewUserId: "u1", rootPayerUserId: "u1", stripeConfigured: true })).toEqual({ ok: true });
  });

  it("403 for a non-payer, even a service-role caller", () => {
    for (const caller of ["u2", "service_role", null, undefined]) {
      const r = gateCheckout({ callerAnewUserId: caller, rootPayerUserId: "u1", stripeConfigured: true });
      expect(r).toEqual({ ok: false, status: 403, error: "only_payer_can_purchase" });
    }
  });

  it("403 when the payer cannot be resolved", () => {
    const r = gateCheckout({ callerAnewUserId: "u1", rootPayerUserId: null, stripeConfigured: true });
    expect(r.ok).toBe(false);
  });

  it("503 billing_unavailable in manual mode (no Stripe key)", () => {
    const r = gateCheckout({ callerAnewUserId: "u1", rootPayerUserId: "u1", stripeConfigured: false });
    expect(r).toEqual({ ok: false, status: 503, error: "billing_unavailable" });
  });
});

describe("evaluatePlanPurchase", () => {
  it("409 subscription_exists for active or past_due with a Stripe subscription", () => {
    for (const status of ["active", "past_due"]) {
      const r = evaluatePlanPurchase("pro", { plan: "starter", status, stripe_subscription_id: "sub_1" });
      expect(r).toEqual({ ok: false, status: 409, error: "subscription_exists" });
    }
  });

  it("409 when the plan is already active", () => {
    const r = evaluatePlanPurchase("pro", { plan: "pro", status: "active", stripe_subscription_id: null });
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects internal", () => {
    expect(evaluatePlanPurchase("internal", null)).toMatchObject({ ok: false });
  });

  it("allows a trial org to buy", () => {
    expect(evaluatePlanPurchase("pro", { plan: "trial", status: "trialing", stripe_subscription_id: null })).toEqual({ ok: true });
  });

  it("allows a canceled subscription to buy again", () => {
    expect(evaluatePlanPurchase("pro", { plan: "pro", status: "canceled", stripe_subscription_id: "sub_1" })).toEqual({ ok: true });
  });
});

describe("isPendingInvoiceReusable", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  it("reuses under 23h, not after", () => {
    expect(isPendingInvoiceReusable("2026-09-29T00:00:00Z", now)).toBe(true);
    expect(isPendingInvoiceReusable("2026-09-28T12:00:00Z", now)).toBe(false);
    expect(isPendingInvoiceReusable(null, now)).toBe(false);
  });
});

describe("ensureStripeCustomer", () => {
  it("reuses the stored customer without calling Stripe", async () => {
    const create = vi.fn();
    const id = await ensureStripeCustomer(createFakeDb(), ORG, "cus_existing", create);
    expect(id).toBe("cus_existing");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates with customer:<billingOrgId> idempotency key and stores it", async () => {
    const db = createFakeDb({
      organization_subscriptions: [{ organization_id: ORG, stripe_customer_id: null }],
    });
    const create = vi.fn().mockResolvedValue({ id: "cus_new" });
    const id = await ensureStripeCustomer(db, ORG, null, create);
    expect(id).toBe("cus_new");
    expect(create).toHaveBeenCalledWith(`customer:${ORG}`);
    expect(db.tables.organization_subscriptions[0].stripe_customer_id).toBe("cus_new");
  });

  it("keeps the winner when another request stored a customer first", async () => {
    const db = createFakeDb({
      organization_subscriptions: [{ organization_id: ORG, stripe_customer_id: "cus_winner" }],
    });
    const id = await ensureStripeCustomer(db, ORG, null, () => Promise.resolve({ id: "cus_loser" }));
    expect(id).toBe("cus_winner");
    expect(db.tables.organization_subscriptions[0].stripe_customer_id).toBe("cus_winner");
  });
});

describe("evaluateCreditsPurchase (M6)", () => {
  it("only trialing or active subscriptions may buy credits", () => {
    expect(evaluateCreditsPurchase({ status: "active" })).toEqual({ ok: true });
    expect(evaluateCreditsPurchase({ status: "trialing" })).toEqual({ ok: true });
    for (const status of ["past_due", "canceled", "incomplete", "expired"]) {
      expect(evaluateCreditsPurchase({ status })).toEqual({ ok: false, status: 409, error: "subscription_inactive" });
    }
    expect(evaluateCreditsPurchase(null)).toMatchObject({ ok: false, error: "subscription_inactive" });
  });
});

describe("decidePendingCheckout (concurrent plan checkout, H2)", () => {
  it("creates when nothing is open", () => {
    expect(decidePendingCheckout([], "pro")).toEqual({ action: "create" });
  });
  it("reuses only a session for the same target plan", () => {
    expect(decidePendingCheckout([{ target_plan: "pro", url: "u1" }], "pro")).toEqual({ action: "reuse", url: "u1" });
  });
  it("blocks with 409 checkout_in_progress when another plan's session is open", () => {
    expect(decidePendingCheckout([{ target_plan: "starter", url: "u2" }], "pro")).toEqual({
      action: "conflict", status: 409, error: "checkout_in_progress",
    });
  });
});
