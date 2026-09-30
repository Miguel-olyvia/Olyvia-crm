import { describe, expect, it } from "vitest";
import {
  decidePortalAccess,
  portalReturnUrl,
  validatePortalRequest,
} from "../portalPolicy";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PAYER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const base = {
  callerAnewUserId: PAYER,
  rootPayerUserId: PAYER,
  stripeCustomerId: "cus_123",
  stripeConfigured: true,
};

describe("validatePortalRequest", () => {
  it("accepts a uuid organization_id", () => {
    expect(validatePortalRequest({ organization_id: ORG })).toEqual({
      ok: true,
      data: { organization_id: ORG },
    });
  });

  it.each([null, [], "x", {}, { organization_id: "nope" }, { organization_id: 5 }])(
    "rejects %j",
    (raw) => {
      const r = validatePortalRequest(raw);
      expect(r.ok).toBe(false);
    },
  );
});

describe("decidePortalAccess", () => {
  it("allows the root payer with a customer and Stripe configured", () => {
    expect(decidePortalAccess(base)).toEqual({ ok: true, customerId: "cus_123" });
  });

  it("refuses a non-payer with 403", () => {
    expect(decidePortalAccess({ ...base, callerAnewUserId: OTHER })).toEqual({
      ok: false,
      status: 403,
      error: "only_payer_can_manage",
    });
  });

  it("refuses a service-role caller (no anew user id) with 403", () => {
    const r = decidePortalAccess({ ...base, callerAnewUserId: null });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses when the root payer is unknown", () => {
    const r = decidePortalAccess({ ...base, rootPayerUserId: null });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("answers 409 no_stripe_customer when the billing org has none", () => {
    for (const stripeCustomerId of [null, undefined, ""]) {
      expect(decidePortalAccess({ ...base, stripeCustomerId })).toEqual({
        ok: false,
        status: 409,
        error: "no_stripe_customer",
      });
    }
  });

  it("answers 503 billing_unavailable when Stripe is not configured", () => {
    expect(decidePortalAccess({ ...base, stripeConfigured: false })).toEqual({
      ok: false,
      status: 503,
      error: "billing_unavailable",
    });
  });

  it("checks the payer before anything else", () => {
    const r = decidePortalAccess({
      callerAnewUserId: OTHER,
      rootPayerUserId: PAYER,
      stripeCustomerId: null,
      stripeConfigured: false,
    });
    expect(r).toMatchObject({ status: 403 });
  });

  it("checks the customer before Stripe availability", () => {
    const r = decidePortalAccess({ ...base, stripeCustomerId: null, stripeConfigured: false });
    expect(r).toMatchObject({ status: 409 });
  });
});

describe("portalReturnUrl", () => {
  it("appends /billing and strips trailing slashes", () => {
    expect(portalReturnUrl("https://app.example.com/")).toBe("https://app.example.com/billing");
    expect(portalReturnUrl("https://app.example.com")).toBe("https://app.example.com/billing");
  });
});
