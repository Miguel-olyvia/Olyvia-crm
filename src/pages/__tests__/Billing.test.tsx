import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const invokeMock = vi.fn();
let currentOrg: string | null = "b6ffce4f-f630-4933-833a-008649757a33";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: currentOrg ? { id: currentOrg } : null }),
}));
vi.mock("@/lib/toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });
  return { toast };
});
vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: vi.fn(async () => "friendly"),
}));
vi.mock("@/hooks/usePlanUsage", () => {
  const limits = [
    { limit_type: "ai_credits", limit_value: 100, used_value: 90, reset_cadence: "monthly" },
    { limit_type: "leads", limit_value: null, used_value: 12, reset_cadence: "monthly" },
    { limit_type: "users", limit_value: 5, used_value: 2, reset_cadence: "none" },
    { limit_type: "proposals", limit_value: 10, used_value: 10, reset_cadence: "monthly" },
    { limit_type: "quotes", limit_value: 10, used_value: 0, reset_cadence: "monthly" },
    { limit_type: "contracts", limit_value: null, used_value: 0, reset_cadence: "monthly" },
  ];
  return {
    usePlanUsage: () => ({
      summary: { plan: "pro", status: "active", trial_ends_at: null, limits },
      loading: false,
      error: null,
      refetch: vi.fn(),
      getLimit: (t: string) => limits.find((l) => l.limit_type === t),
    }),
  };
});

import Billing from "../Billing";
import { toast } from "@/lib/toast";
import { __resetBillingOverviewStore } from "@/hooks/useBillingOverview";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ORG_B = "11111111-1111-4111-8111-111111111111";

const catalog = (table: string) => {
  const rows =
    table === "ai_credit_packages"
      ? [{ id: "p1", name: "Pack 100", credits: 100, price_sale: 10, active: true, is_popular: false }]
      : [
          { plan: "starter", price_eur: 10 },
          { plan: "pro", price_eur: 20 },
          { plan: "enterprise", price_eur: 30 },
        ];
  const chain: any = { select: () => chain, eq: () => chain, order: async () => ({ data: rows, error: null }) };
  return chain;
};

const overview = (canManage: boolean, extra: Record<string, unknown> = {}) => ({
  data: {
    plan: "pro",
    status: "active",
    trial_ends_at: null,
    current_period_end: "2027-01-15T00:00:00Z",
    balance_credits: 42,
    can_manage_billing: canManage,
    invoices: canManage
      ? [{ id: "i1", organization_id: ORG, type: "plano", package_id: null, amount: 20, status: "pago", description: "Pro", created_at: "2026-09-01T00:00:00Z", paid_at: null }]
      : [],
    ...extra,
  },
  error: null,
});

const httpError = (status: number, code?: string) => ({
  data: null,
  error: { context: { status, clone() { return this; }, json: async () => (code ? { error: code } : {}) } },
});

const renderPage = (entry = "/billing") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Billing />
    </MemoryRouter>,
  );

const portalButton = () => screen.findByRole("button", { name: /billing\.page\.portal\.button/ });

describe("Billing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBillingOverviewStore();
    currentOrg = ORG;
    fromMock.mockImplementation(catalog);
  });

  it("reads billing only through the RPC, never from billing tables", async () => {
    rpcMock.mockResolvedValue(overview(true));
    renderPage();
    await portalButton();
    expect(rpcMock).toHaveBeenCalledWith("fn_get_billing_overview", { _organization_id: ORG });
    const tables = fromMock.mock.calls.map((c) => c[0]);
    for (const forbidden of ["organization_subscriptions", "organization_ai_credits", "invoices"]) {
      expect(tables).not.toContain(forbidden);
    }
  });

  it("non-payer: read-only, no buttons at all, owner notice, no catalog request, no invoices", async () => {
    rpcMock.mockResolvedValue(overview(false));
    renderPage();
    expect(await screen.findByText("settingsPage.billing.managedByOwner")).toBeTruthy();
    expect(screen.getByTestId("billing-plan-name")).toBeTruthy();
    expect(screen.getByTestId("billing-credits-balance").textContent).toContain("42");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(fromMock).not.toHaveBeenCalled();
    expect(screen.queryByText("settingsPage.billing.invoicesTitle")).toBeNull();
  });

  it("payer: sees portal, plan, buy buttons and invoices, without the owner notice", async () => {
    rpcMock.mockResolvedValue(overview(true, { plan: "trial" }));
    renderPage();
    expect(await portalButton()).toBeTruthy();
    expect(await screen.findByRole("button", { name: "settingsPage.billing.buy: Pack 100" })).toBeTruthy();
    expect(screen.getAllByText("settingsPage.billing.changePlan").length).toBeGreaterThan(0);
    expect(screen.getByText("settingsPage.billing.invoicesTitle")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.queryByText("settingsPage.billing.managedByOwner")).toBeNull();
    expect(screen.getByText("billing.page.portal.help")).toBeTruthy();
  });

  it("shows all six limits, with unlimited spelled out and progress bars for finite ones", async () => {
    rpcMock.mockResolvedValue(overview(false));
    renderPage();
    await screen.findByTestId("usage-ai_credits");
    for (const type of ["ai_credits", "leads", "users", "proposals", "quotes", "contracts"]) {
      expect(screen.getByTestId(`usage-${type}`)).toBeTruthy();
    }
    expect(screen.getByTestId("usage-leads").textContent).toContain("billing.page.usage.unlimited");
    expect(screen.getByTestId("usage-ai_credits").textContent).toContain("90 / 100");
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
  });

  it("status header: past_due, expired, canceled and trialing", async () => {
    rpcMock.mockResolvedValue(overview(true, { status: "past_due" }));
    const view = renderPage();
    expect((await screen.findByTestId("billing-status-badge")).textContent).toBe("billing.page.status.past_due");
    expect(screen.getByText("settingsPage.billing.pastDueHint")).toBeTruthy();
    view.unmount();

    __resetBillingOverviewStore();
    rpcMock.mockResolvedValue(overview(true, { status: "expired" }));
    const v2 = renderPage();
    expect((await screen.findByTestId("billing-status-badge")).textContent).toBe("billing.page.status.expired");
    expect(screen.getByText("billing.page.chooseAPlan")).toBeTruthy();
    expect(screen.getByRole("button", { name: "settingsPage.billing.renewPlan: landing.plans.pro.name" })).toBeTruthy();
    v2.unmount();

    __resetBillingOverviewStore();
    rpcMock.mockResolvedValue(overview(true, { status: "canceled" }));
    const v3 = renderPage();
    expect((await screen.findByTestId("billing-status-badge")).textContent).toBe("billing.page.status.canceled");
    expect(screen.getByText("billing.page.accessUntil")).toBeTruthy();
    v3.unmount();

    __resetBillingOverviewStore();
    rpcMock.mockResolvedValue(
      overview(true, { plan: "trial", status: "trialing", trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString() }),
    );
    renderPage();
    expect((await screen.findByTestId("billing-status-badge")).textContent).toBe("billing.page.status.trialing");
    expect(screen.getByText("settingsPage.billing.trialDaysLeft")).toBeTruthy();
  });

  it("failed load: alert with retry, no values and no buttons except retry", async () => {
    rpcMock.mockResolvedValueOnce({ data: { error: "not_a_member" }, error: null });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("settingsPage.billing.notAMember");
    expect(screen.queryByTestId("billing-plan-name")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    rpcMock.mockResolvedValue(overview(true));
    fireEvent.click(screen.getByRole("button", { name: "settingsPage.billing.retry" }));
    expect(await portalButton()).toBeTruthy();
  });

  it("no organization: message and no RPC call", () => {
    currentOrg = null;
    renderPage();
    expect(screen.getByText("settingsPage.billing.noOrganization")).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("ignores a stale response after switching organization", async () => {
    let resolveA: (v: unknown) => void = () => {};
    rpcMock.mockImplementation((_fn: string, args: { _organization_id: string }) =>
      args._organization_id === ORG ? new Promise((resolve) => { resolveA = resolve; }) : Promise.resolve(overview(false)),
    );
    const view = renderPage();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    currentOrg = ORG_B;
    view.rerender(
      <MemoryRouter>
        <Billing />
      </MemoryRouter>,
    );
    expect(await screen.findByText("settingsPage.billing.managedByOwner")).toBeTruthy();
    await act(async () => {
      resolveA(overview(true));
    });
    expect(screen.getByText("settingsPage.billing.managedByOwner")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("canceled plan (same plan) is renewable: Renew button and no 'current plan' badge", async () => {
    rpcMock.mockResolvedValue(overview(true, { status: "canceled" }));
    renderPage();
    expect(
      await screen.findByRole("button", { name: "settingsPage.billing.renewPlan: landing.plans.pro.name" }),
    ).toBeTruthy();
    expect(screen.queryByText("settingsPage.billing.currentPlanBadge")).toBeNull();
  });

  it.each(["active", "past_due"])("%s subscriber: no change-plan purchase, points to the portal instead", async (status) => {
    rpcMock.mockResolvedValue(overview(true, { status }));
    renderPage();
    expect(await screen.findByText("billing.page.changeInPortal")).toBeTruthy();
    expect(screen.queryByText("settingsPage.billing.changePlan")).toBeNull();
    expect(screen.queryByText("settingsPage.billing.renewPlan")).toBeNull();
    expect(screen.getByText("billing.page.changeInPortalLink").getAttribute("href")).toBe("#billing-portal-title");
    // credit packages stay purchasable
    expect(await screen.findByRole("button", { name: "settingsPage.billing.buy: Pack 100" })).toBeTruthy();
  });

  it("?checkout=success with the organization arriving late: handled once, after the org is known", async () => {
    currentOrg = null;
    rpcMock.mockResolvedValue(overview(true));
    const view = renderPage("/billing?checkout=success&session_id=cs_1");
    await act(async () => {});
    expect(toast.success).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();

    currentOrg = ORG;
    view.rerender(
      <MemoryRouter initialEntries={["/billing?checkout=success&session_id=cs_1"]}>
        <Billing />
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect((toast.success as any).mock.calls[0][0]).toBe("settingsPage.billing.checkoutSuccess");
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
  });

  it("pageshow with persisted=true (bfcache restore) releases the busy guard", async () => {
    rpcMock.mockResolvedValue(overview(true));
    invokeMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await portalButton());
    await waitFor(() => expect((screen.getByRole("button", { name: /billing\.page\.portal\./ }) as HTMLButtonElement).disabled).toBe(true));
    await act(async () => {
      const ev = new Event("pageshow");
      Object.defineProperty(ev, "persisted", { value: true });
      window.dispatchEvent(ev);
    });
    expect((screen.getByRole("button", { name: /billing\.page\.portal\.button/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("busy state of organization A does not carry over to organization B", async () => {
    rpcMock.mockResolvedValue(overview(true));
    invokeMock.mockReturnValue(new Promise(() => {}));
    const view = renderPage();
    fireEvent.click(await portalButton());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    currentOrg = ORG_B;
    view.rerender(
      <MemoryRouter>
        <Billing />
      </MemoryRouter>,
    );
    const button = await portalButton();
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("portal: double click sends one request and disables every button meanwhile", async () => {
    rpcMock.mockResolvedValue(overview(true));
    invokeMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    const button = await portalButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith("stripe-create-portal-session", { body: { organization_id: ORG } });
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    [403, "only_payer_can_manage", "billing.page.portal.errorNotPayer"],
    [403, undefined, "billing.page.portal.errorNotPayer"],
    [409, "no_stripe_customer", "billing.page.portal.errorNoCustomer"],
    [503, "billing_unavailable", "settingsPage.billing.billingUnavailable"],
    [500, "internal_error", "billing.page.portal.errorInternal"],
    [500, undefined, "billing.page.portal.errorInternal"],
    [503, undefined, "settingsPage.billing.billingUnavailable"],
  ])("portal error %s %s maps to %s", async (status, code, expectedKey) => {
    rpcMock.mockResolvedValue(overview(true));
    invokeMock.mockResolvedValue(httpError(status as number, code as string | undefined));
    renderPage();
    fireEvent.click(await portalButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect((toast.error as any).mock.calls[0][0]).toContain(expectedKey);
    // the guard is released after a failure
    await waitFor(() => expect((screen.getByRole("button", { name: /billing\.page\.portal\.button/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it.each([
    [403, "only_payer_can_purchase", "settingsPage.billing.notPayer"],
    [409, "plan_already_active", "settingsPage.billing.planAlreadyActive"],
    [409, "checkout_in_progress", "settingsPage.billing.checkoutInProgress"],
    [409, undefined, "settingsPage.billing.subscriptionExists"],
    [409, "subscription_inactive", "settingsPage.billing.subscriptionInactive"],
    [503, "billing_unavailable", "settingsPage.billing.billingUnavailable"],
    [500, "internal_error", "settingsPage.billing.internalError"],
    [500, undefined, "settingsPage.billing.internalError"],
    [400, "invalid_request", "settingsPage.billing.invalidRequest"],
    [404, "package_not_found", "settingsPage.billing.packageNotFound"],
    [409, "package_inactive", "settingsPage.billing.packageInactive"],
    [503, "plan_pricing_not_configured", "settingsPage.billing.planPricingNotConfigured"],
    [409, "plan_not_purchasable", "settingsPage.billing.planNotPurchasable"],
    [503, "credits_check_unavailable", "settingsPage.billing.creditsCheckUnavailable"],
  ])("checkout error %s %s maps to %s and a double click buys once", async (status, code, expectedKey) => {
    rpcMock.mockResolvedValue(overview(true));
    invokeMock.mockResolvedValue(httpError(status as number, code as string | undefined));
    renderPage();
    const buy = await screen.findByRole("button", { name: "settingsPage.billing.buy: Pack 100" });
    fireEvent.click(buy);
    fireEvent.click(buy);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect((toast.error as any).mock.calls[0][0]).toContain(expectedKey);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
