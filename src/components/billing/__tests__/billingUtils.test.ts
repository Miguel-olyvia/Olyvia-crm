import { describe, it, expect } from "vitest";
import { daysLeft, formatBillingDate, msLeft, trialWordingKey } from "../billingUtils";
import { mapFriendlyErrorText } from "@/utils/friendlyError";
import { translations } from "@/translations/index";

const DAY = 86400000;
const keys = { expired: "expired", lastDay: "last", one: "one", other: "other" };

describe("daysLeft / msLeft", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  it("keeps the sign and rounds up", () => {
    expect(daysLeft("2026-09-30T12:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-10-02T00:00:00Z", now)).toBe(3);
    expect(daysLeft("2026-09-28T12:00:00Z", now)).toBe(-1);
    expect(daysLeft("nope", now)).toBeNull();
    expect(msLeft(null, now)).toBeNull();
  });
});

describe("trialWordingKey", () => {
  it("expired, last day, singular and plural", () => {
    expect(trialWordingKey(-5, keys).key).toBe("expired");
    expect(trialWordingKey(0, keys).key).toBe("expired");
    expect(trialWordingKey(DAY - 1, keys).key).toBe("last");
    expect(trialWordingKey(DAY, keys)).toEqual({ key: "one", days: 1 });
    expect(trialWordingKey(3 * DAY - 10, keys)).toEqual({ key: "other", days: 3 });
  });
});

describe("formatBillingDate", () => {
  it("does not shift date-only values and guards invalid dates", () => {
    expect(formatBillingDate("2027-01-15", "en-GB")).toBe("15/01/2027");
    expect(formatBillingDate("garbage", "en-GB")).toBe("-");
    expect(formatBillingDate(null, "en-GB")).toBe("-");
  });
});

describe("friendly error for the seat trigger", () => {
  const t = (k: string) => (translations as any).en[k];
  it("inactive-subscription reasons read as 'plan not active', not 'limit reached'", () => {
    for (const reason of ["no_active_subscription", "subscription_expired", "expired", "past_due"]) {
      expect(mapFriendlyErrorText(`plan_limit_exceeded:users (${reason})`)).toBe(t("friendlyError.planNotActive"));
    }
  });
  it("a real user limit still reads as the limit message", () => {
    expect(mapFriendlyErrorText("plan_limit_exceeded:users (5/5)")).toBe(t("friendlyError.userLimitExceeded"));
  });
});

describe("internal plan name", () => {
  it.each(["en", "pt", "es", "fr", "de"])("is translated in %s (no raw key)", (lang) => {
    const value = (translations as any)[lang]["landing.plans.internal.name"];
    expect(value).toBeTruthy();
    expect(value).not.toContain("landing.plans");
  });
});
