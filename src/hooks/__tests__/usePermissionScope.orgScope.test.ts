/**
 * Regression tests for cross-organization scope isolation in usePermissionScope.
 *
 * The hook resolves the caller's ROLE PERMISSIONS across the organization
 * ancestor chain (active org + every parent via anew_hierarchy), which is
 * intended. It used to resolve SCOPE OVERRIDES the same way, which was not:
 * an ORG-level scope granted on a membership in a parent organization leaked
 * ORG-level visibility into every child organization, even where the user's
 * own membership granted nothing.
 *
 * The database side of this defect is fixed by
 * 20261112120000_scope_resolution_per_org_only.sql (and, for proposals, by
 * 20261006010000_fix_proposal_scope_org_leak_and_ownership_spoofing.sql, which
 * classified it as cross-organization privilege escalation).
 *
 * These tests lock down the client side:
 *
 *  1. Overrides carried on a non-active-organization membership are ignored.
 *  2. An ORG scope held on a PARENT organization's membership does not raise the
 *     scope inside a child organization — it stays OWNED.
 *  3. An ORG scope held on the ACTIVE organization's own membership does apply.
 *  4. Role permissions still resolve across the ancestor chain (unchanged).
 *
 * The hook now reads its inputs from the `get_permission_scope_context` RPC
 * (20261112490000) instead of running 11 separate table queries. That RPC is a
 * data collector: it returns the whole ancestor chain's override rows, each
 * tagged with the membership's organization_id, and the hook filters them down
 * to the active organization. The filter — not the SQL — is what enforces the
 * rule, which is why these tests still reach it. Assertion 1 is therefore
 * behavioural now (the override has no effect) rather than a check on which
 * membership ids were queried, and it is the stronger claim of the two.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ACTIVE_ORG = "11111111-1111-1111-1111-111111111111";
const PARENT_ORG = "22222222-2222-2222-2222-222222222222";
const ACTIVE_MEMBERSHIP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PARENT_MEMBERSHIP = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ACTIVE_ROLE = "role-active";
const PARENT_ROLE = "role-parent";
const ANEW_USER = "user-1";

interface ScopeRow {
  membership_id: string;
  organization_id: string;
  permission_code: string;
  scope_level: string;
}

/** Override rows the RPC reports for the whole ancestor chain. */
let scopeRows: ScopeRow[] = [];

/** Arguments the hook passed to the RPC. */
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: any[]) => rpcMock(...a) },
}));

vi.mock("@/lib/cachedAuth", () => ({
  getCachedAuthUser: () => Promise.resolve({ data: { user: { id: "auth-1" } } }),
}));

// The identity of `activeCompany` must be stable: usePermissionScope memoises
// loadPermissions on it, so a fresh object per render would re-trigger the
// effect forever and the hook would never leave its loading state.
vi.mock("@/contexts/CompanyContext", () => {
  const activeCompany = { id: "11111111-1111-1111-1111-111111111111" };
  return { useCompany: () => ({ activeCompany }) };
});

import { usePermissionScope } from "@/hooks/usePermissionScope";

/**
 * The context the RPC returns. Neither role is a global admin, so no
 * full-access short-circuit fires. `leads.view` comes from the ACTIVE org's
 * role and `clients.view` only from the PARENT role, which is what proves
 * permission inheritance across the chain still works.
 */
function scopeContext() {
  return {
    anew_user_id: ANEW_USER,
    is_global_system_admin: false,
    org_chain: [ACTIVE_ORG, PARENT_ORG],
    memberships: [
      { id: ACTIVE_MEMBERSHIP, role_id: ACTIVE_ROLE, organization_id: ACTIVE_ORG, role_code: "org_admin" },
      { id: PARENT_MEMBERSHIP, role_id: PARENT_ROLE, organization_id: PARENT_ORG, role_code: "org_admin" },
    ],
    role_permissions: ["leads.view", "clients.view"],
    scope_rows: scopeRows,
    binary_permission_codes: [],
    team_member_ids: [],
  };
}

beforeEach(() => {
  scopeRows = [];
  rpcCalls = [];
  rpcMock.mockReset();
  rpcMock.mockImplementation((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (name !== "get_permission_scope_context") {
      throw new Error(`Unexpected RPC: ${name}`);
    }
    return Promise.resolve({ data: scopeContext(), error: null });
  });
});

describe("usePermissionScope — cross-organization scope isolation", () => {
  it("resolves its context for the active organization in a single RPC call", async () => {
    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("get_permission_scope_context");
    expect(rpcCalls[0].args).toEqual({ _organization_id: ACTIVE_ORG });
  });

  it("ignores an override carried on a membership outside the active organization", async () => {
    scopeRows = [
      {
        membership_id: PARENT_MEMBERSHIP,
        organization_id: PARENT_ORG,
        permission_code: "leads.view",
        scope_level: "ORG",
      },
    ];

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The row was returned by the RPC and deliberately dropped by the hook.
    expect(result.current.getPermissionScope("leads.view")).not.toBe("ORG");
  });

  it("does not let an ORG scope held in a parent organization raise the scope in a child", async () => {
    scopeRows = [
      {
        membership_id: PARENT_MEMBERSHIP,
        organization_id: PARENT_ORG,
        permission_code: "leads.view",
        scope_level: "ORG",
      },
    ];

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPermissionScope("leads.view")).toBe("OWNED");
    expect(result.current.hasMinimumScope("leads.view", "ORG")).toBe(false);
  });

  it("applies an ORG scope held on the active organization's own membership", async () => {
    scopeRows = [
      {
        membership_id: ACTIVE_MEMBERSHIP,
        organization_id: ACTIVE_ORG,
        permission_code: "leads.view",
        scope_level: "ORG",
      },
    ];

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPermissionScope("leads.view")).toBe("ORG");
    expect(result.current.hasMinimumScope("leads.view", "ORG")).toBe(true);
  });

  it("still resolves role permissions across the ancestor chain", async () => {
    // clients.view is granted by the PARENT role only. It must remain reachable
    // (at OWNED), proving this change did not also cut permission inheritance.
    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPermissionScope("clients.view")).toBe("OWNED");
    expect(result.current.getPermissionScope("unknown.permission")).toBe("NONE");
  });

  it("fails closed when the RPC errors", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "boom" } })
    );

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPermissionScope("leads.view")).toBe("NONE");
    expect(result.current.hasMinimumScope("leads.view", "OWNED")).toBe(false);
  });
});
