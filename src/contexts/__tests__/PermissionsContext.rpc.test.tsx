/**
 * P2.a regression tests — PermissionsContext now uses get_user_context RPC.
 *
 * Guarantees:
 *  - Single rpc('get_user_context') call replaces the legacy 5-query chain.
 *  - Public API (permissions, isSystemAdmin, hasPermission, hasAnyPermission,
 *    hasModuleAccess, refreshPermissions, loading) returns the SAME shape and
 *    values as the legacy implementation for the same inputs.
 *  - System admin identity is separate from explicit permissions.
 *  - RPC error → fail-closed (empty permissions, no crash).
 *  - No membership → fail-closed (empty permissions).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { ReactNode } from "react";

// ---- Mocks ----
const rpcMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...a: any[]) => getSessionMock(...a),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc: (...a: any[]) => rpcMock(...a),
    from: vi.fn(),
  },
}));

// CompanyContext is a hard dependency of PermissionsContext.
const useCompanyMock = vi.fn();
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => useCompanyMock(),
}));

import { PermissionsProvider, usePermissions } from "@/contexts/PermissionsContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PermissionsProvider>{children}</PermissionsProvider>
);

// Use a unique session.user.id per test so the module-level cache key never collides.
let testCounter = 0;

beforeEach(() => {
  rpcMock.mockReset();
  getSessionMock.mockReset();
  testCounter += 1;
  getSessionMock.mockResolvedValue({
    data: { session: { user: { id: `auth-user-${testCounter}` } } },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PermissionsContext (P2.a — RPC-backed)", () => {
  it("calls get_user_context exactly once on mount for a non-admin user", async () => {
    useCompanyMock.mockReturnValue({
      activeCompany: { id: "org-1" },
      userType: "member",
    });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [{ organization_id: "org-1", role_id: "role-1", role_code: "org_editor" }],
        permissions: ["products.view", "products.edit"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("get_user_context");
    expect(result.current.permissions).toEqual(["products.view", "products.edit"]);
    expect(result.current.isSystemAdmin).toBe(false);
  });

  it("hasPermission resolves base codes AND aliases (e.g. products.edit ↔ products.update)", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["products.edit"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasPermission("products.edit")).toBe(true);
    expect(result.current.hasPermission("products.update")).toBe(true); // alias
    expect(result.current.hasPermission("products.delete")).toBe(false);
  });

  it("hasAnyPermission returns true when at least one matches", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["leads.view"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasAnyPermission(["deals.view", "leads.view"])).toBe(true);
    expect(result.current.hasAnyPermission(["deals.view", "deals.create"])).toBe(false);
  });

  it("hasModuleAccess returns true when any permission starts with the module prefix", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["catalog.products.view"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasModuleAccess("catalog")).toBe(true);
    expect(result.current.hasModuleAccess("contracts")).toBe(false);
  });

  it("system_admin keeps explicit platform permissions without wildcard bypass", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "system_admin" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: true,
        org_ids: [],
        memberships: [],
        permissions: ["platform.dashboard.view"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSystemAdmin).toBe(true);
    expect(result.current.permissions).toEqual(["platform.dashboard.view"]);
    expect(result.current.hasPermission("platform.dashboard.view")).toBe(true);
    expect(result.current.hasPermission("leads.view")).toBe(false);
    expect(result.current.hasAnyPermission(["leads.view", "contacts.view"])).toBe(false);
  });

  it("is_system_admin from RPC identifies the role but does not bypass permissions", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: true,
        org_ids: [],
        memberships: [],
        permissions: ["platform.users.view"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toEqual(["platform.users.view"]);
    expect(result.current.hasPermission("platform.users.view")).toBe(true);
    expect(result.current.hasPermission("rls.bypass")).toBe(false);
  });

  it("rejects an unexpected wildcard and fails closed", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "system_admin" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: true,
        org_ids: [],
        memberships: [],
        permissions: ["*"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toEqual([]);
    expect(result.current.hasPermission("platform.dashboard.view")).toBe(false);
  });

  it("RPC error → fail-closed (empty permissions, no crash)", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toEqual([]);
    expect(result.current.hasPermission("products.view")).toBe(false);
    errSpy.mockRestore();
  });

  it("no business_user_id → fail-closed", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: { business_user_id: null, is_system_admin: false, org_ids: [], memberships: [], permissions: [] },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissions).toEqual([]);
    expect(result.current.hasPermission("anything")).toBe(false);
  });

  it("refreshPermissions clears cache and re-invokes the RPC", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["a.view"],
      },
      error: null,
    });

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rpcMock).toHaveBeenCalledTimes(1);

    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["a.view", "b.edit"],
      },
      error: null,
    });

    act(() => result.current.refreshPermissions());
    await waitFor(() => expect(result.current.permissions).toEqual(["a.view", "b.edit"]));
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT hit anew_users / anew_hierarchy / anew_memberships / anew_role_permissions directly", async () => {
    useCompanyMock.mockReturnValue({ activeCompany: { id: "org-1" }, userType: "member" });
    rpcMock.mockResolvedValue({
      data: {
        business_user_id: "biz-1",
        is_system_admin: false,
        org_ids: ["org-1"],
        memberships: [],
        permissions: ["x.view"],
      },
      error: null,
    });
    const fromSpy = vi.fn();
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase as any).from = fromSpy;

    renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());

    expect(fromSpy).not.toHaveBeenCalled();
  });
});
