import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const rpcMock = vi.fn();
let currentOrg: string | null = "org-a";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: currentOrg ? { id: currentOrg } : null }),
}));

import { BillingStatusBanner } from "../BillingStatusBanner";
import { __resetBillingOverviewStore } from "@/hooks/useBillingOverview";
import { getBannerState } from "../billingUtils";
import { translations } from "@/translations/index";

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const ov = (over: Record<string, unknown>, canManage: boolean) => ({
  data: { plan: "pro", status: "active", trial_ends_at: null, can_manage_billing: canManage, ...over },
  error: null,
});

const renderBanner = () =>
  render(
    <MemoryRouter>
      <BillingStatusBanner />
    </MemoryRouter>,
  );

describe("BillingStatusBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBillingOverviewStore();
    currentOrg = "org-a";
    window.sessionStorage.clear();
  });

  const matrix: Array<[string, Record<string, unknown>, boolean, string | null]> = [
    ["active", { status: "active" }, true, null],
    ["active non-payer", { status: "active" }, false, null],
    ["canceled", { status: "canceled" }, true, null],
    ["trialing 30 days", { plan: "trial", status: "trialing", trial_ends_at: inDays(30) }, true, null],
    ["trialing 8 days", { plan: "trial", status: "trialing", trial_ends_at: inDays(8) }, true, null],
    ["trialing 7 days payer", { plan: "trial", status: "trialing", trial_ends_at: inDays(7) }, true, "billing.page.banner.trialEnding"],
    ["trialing 3 days non-payer", { plan: "trial", status: "trialing", trial_ends_at: inDays(3) }, false, "billing.page.banner.trialEnding"],
    ["trialing 12h left (last day wording)", { plan: "trial", status: "trialing", trial_ends_at: inDays(0.5) }, true, "billing.page.banner.trialLastDay"],
    ["trialing 3 days (plural wording)", { plan: "trial", status: "trialing", trial_ends_at: inDays(3) }, true, "billing.page.banner.trialEnding"],
    ["trialing with a past trial date uses the expired wording", { plan: "trial", status: "trialing", trial_ends_at: inDays(-2) }, true, "billing.page.banner.expired"],
    ["trialing with a past trial date, non-payer", { plan: "trial", status: "trialing", trial_ends_at: inDays(-2) }, false, "billing.page.banner.expired"],
    ["past_due payer", { status: "past_due" }, true, "billing.page.banner.pastDue"],
    ["past_due non-payer", { status: "past_due" }, false, "billing.page.banner.pastDue"],
    ["expired payer", { status: "expired" }, true, "billing.page.banner.expired"],
    ["expired non-payer", { status: "expired" }, false, "billing.page.banner.expired"],
  ];

  it.each(matrix)("%s", async (_name, over, canManage, expectedText) => {
    rpcMock.mockResolvedValue(ov(over, canManage));
    renderBanner();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    if (expectedText === null) {
      await act(async () => {});
      expect(screen.queryByTestId("billing-status-banner")).toBeNull();
      return;
    }
    const banner = await screen.findByTestId("billing-status-banner");
    expect(banner.textContent).toContain(expectedText);
    const blocking = expectedText.endsWith(".pastDue") || expectedText.endsWith(".expired");
    expect(banner.getAttribute("role")).toBe(blocking ? "alert" : "status");
    if (canManage) {
      expect(screen.getByRole("link").getAttribute("href")).toBe("/billing");
      expect(screen.queryByText("billing.page.banner.nonPayerAction")).toBeNull();
    } else {
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("billing.page.banner.nonPayerAction")).toBeTruthy();
    }
    // only the trial reminder can be dismissed
    expect(screen.queryByRole("button", { name: "billing.page.banner.dismiss" }) !== null).toBe(!blocking);
  });

  it("trial banner can be dismissed for the session and stays dismissed on remount", async () => {
    rpcMock.mockResolvedValue(ov({ plan: "trial", status: "trialing", trial_ends_at: inDays(2) }, true));
    const view = renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: "billing.page.banner.dismiss" }));
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
    view.unmount();
    renderBanner();
    await act(async () => {});
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
  });

  it("shows nothing while loading and nothing when the overview errors", async () => {
    rpcMock.mockReturnValueOnce(new Promise(() => {}));
    const view = renderBanner();
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
    view.unmount();

    __resetBillingOverviewStore();
    rpcMock.mockResolvedValueOnce({ data: { error: "not_a_member" }, error: null });
    renderBanner();
    await act(async () => {});
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();

    __resetBillingOverviewStore();
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderBanner();
    await act(async () => {});
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
  });

  it("does not request anything without an active organization", () => {
    currentOrg = null;
    renderBanner();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
  });

  it("ignores a stale response after switching organization", async () => {
    let resolveA: (v: unknown) => void = () => {};
    rpcMock.mockImplementation((_fn: string, args: { _organization_id: string }) =>
      args._organization_id === "org-a" ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(ov({ status: "active" }, true)),
    );
    const view = renderBanner();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    currentOrg = "org-b";
    view.rerender(
      <MemoryRouter>
        <BillingStatusBanner />
      </MemoryRouter>,
    );
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveA(ov({ status: "past_due" }, true));
    });
    expect(screen.queryByTestId("billing-status-banner")).toBeNull();
  });

  it("one request per organization even with two consumers mounted", async () => {
    rpcMock.mockResolvedValue(ov({ status: "past_due" }, true));
    render(
      <MemoryRouter>
        <BillingStatusBanner />
        <BillingStatusBanner />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByTestId("billing-status-banner")).toHaveLength(2));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("getBannerState", () => {
  it("returns null for null and error overviews", () => {
    expect(getBannerState(null)).toBeNull();
    expect(getBannerState({ error: "not_a_member" })).toBeNull();
  });
  it("blocking states win over the trial reminder", () => {
    expect(getBannerState({ plan: "trial", status: "past_due", trial_ends_at: inDays(1) })?.kind).toBe("past_due");
  });
});

describe("billing translation keys", () => {
  const dicts = translations as Record<string, Record<string, string>>;
  const langs = ["en", "pt", "es", "fr", "de"];
  const pageKeys = Object.keys(dicts.en).filter((k) => k.startsWith("billing.page."));
  const KEYS = [
    ...pageKeys,
    "sidebar.billing",
    "landing.plans.internal.name",
    "friendlyError.planNotActive",
    ...["packageNotFound", "packageInactive", "planPricingNotConfigured", "planNotPurchasable", "invalidRequest", "internalError"]
      .map((k) => `settingsPage.billing.${k}`),
    ...["managedByOwner", "statusExpired", "notPayer", "subscriptionExists", "billingUnavailable", "creditsCheckUnavailable",
      "notAMember", "loadError", "retry", "noOrganization", "planAlreadyActive", "checkoutInProgress", "subscriptionInactive",
      "renewPlan", "pastDueHint", "loading"].map((k) => `settingsPage.billing.${k}`),
    "contractTemplates.import.creditsInsufficient",
    "contractTemplates.import.aiUnavailable",
    "contractTemplates.import.noOrganization",
  ];

  it("has a meaningful number of new page keys", () => {
    expect(pageKeys.length).toBeGreaterThanOrEqual(35);
  });

  it.each(langs)("has every billing key in %s", (lang) => {
    for (const key of KEYS) expect(dicts[lang][key], `${lang}:${key}`).toBeTruthy();
  });

  it.each(langs)("%s has no extra billing.page keys missing from en", (lang) => {
    const extra = Object.keys(dicts[lang]).filter((k) => k.startsWith("billing.page.") && !(k in dicts.en));
    expect(extra).toEqual([]);
  });

  it("keeps interpolation placeholders in every language", () => {
    for (const lang of langs) {
      expect(dicts[lang]["billing.page.banner.trialEnding"]).toContain("{days}");
      expect(dicts[lang]["billing.page.renewsOn"]).toContain("{date}");
      expect(dicts[lang]["billing.page.accessUntil"]).toContain("{date}");
    }
  });
});
