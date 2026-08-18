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
 *  1. Scope overrides are read ONLY from memberships in the ACTIVE organization.
 *  2. An ORG scope held on a PARENT organization's membership does not raise the
 *     scope inside a child organization — it stays OWNED.
 *  3. An ORG scope held on the ACTIVE organization's own membership does apply.
 *  4. Role permissions still resolve across the ancestor chain (unchanged).
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

/** Scope rows keyed by membership id — the test's stand-in for the table. */
let scopeRows: { membership_id: string; permission_code: string; scope_level: string }[] = [];

/** Membership ids the hook actually asked scopes for. The core assertion. */
let scopeQueryMembershipIds: string[] = [];

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: any[]) => fromMock(...a) },
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

type Call = {
  table: string;
  select?: string;
  eqs: Record<string, unknown>;
  ins: Record<string, unknown[]>;
};

function resultFor(call: Call): { data: unknown } {
  switch (call.table) {
    case "anew_users":
      return { data: { id: ANEW_USER } };

    case "anew_hierarchy":
      // Active org has a parent; the parent is the root.
      return call.eqs.child_org_id === ACTIVE_ORG
        ? { data: { parent_org_id: PARENT_ORG } }
        : { data: null };

    case "anew_memberships":
      // First call selects only role_id (global admin probe); the second
      // selects the full row for the ancestor chain.
      if (call.select === "role_id") {
        return { data: [{ role_id: ACTIVE_ROLE }, { role_id: PARENT_ROLE }] };
      }
      return {
        data: [
          { id: ACTIVE_MEMBERSHIP, role_id: ACTIVE_ROLE, organization_id: ACTIVE_ORG },
          { id: PARENT_MEMBERSHIP, role_id: PARENT_ROLE, organization_id: PARENT_ORG },
        ],
      };

    case "anew_roles":
      // Neither role is a global admin, so no full-access short-circuit.
      return call.select === "code"
        ? { data: [{ code: "org_admin" }, { code: "org_admin" }] }
        : {
            data: [
              { id: ACTIVE_ROLE, code: "org_admin" },
              { id: PARENT_ROLE, code: "org_admin" },
            ],
          };

    case "anew_role_permissions":
      // leads.view comes from the ACTIVE org role; clients.view only from the
      // PARENT role — proving permissions still resolve across the chain.
      return { data: [{ permission_code: "leads.view" }, { permission_code: "clients.view" }] };

    case "anew_membership_permission_scopes": {
      const asked = (call.ins.membership_id ?? []) as string[];
      scopeQueryMembershipIds = asked;
      return {
        data: scopeRows
          .filter(r => asked.includes(r.membership_id))
          .map(r => ({ permission_code: r.permission_code, scope_level: r.scope_level })),
      };
    }

    case "anew_permissions":
      // No binary (non-scoped) permissions in these tests.
      return { data: [] };

    default:
      throw new Error(`Unexpected table access: ${call.table}`);
  }
}

function buildChain(table: string) {
  const call: Call = { table, eqs: {}, ins: {} };
  const chain: any = {
    select: (s: string) => {
      call.select = s;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      call.eqs[col] = val;
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      call.ins[col] = vals;
      return chain;
    },
    maybeSingle: () => Promise.resolve(resultFor(call)),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resultFor(call)).then(onFulfilled, onRejected),
  };
  return chain;
}

beforeEach(() => {
  scopeRows = [];
  scopeQueryMembershipIds = [];
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => buildChain(table));
});

describe("usePermissionScope — cross-organization scope isolation", () => {
  it("asks for scope overrides only from memberships in the active organization", async () => {
    scopeRows = [
      { membership_id: PARENT_MEMBERSHIP, permission_code: "leads.view", scope_level: "ORG" },
    ];

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(scopeQueryMembershipIds).toEqual([ACTIVE_MEMBERSHIP]);
    expect(scopeQueryMembershipIds).not.toContain(PARENT_MEMBERSHIP);
  });

  it("does not let an ORG scope held in a parent organization raise the scope in a child", async () => {
    scopeRows = [
      { membership_id: PARENT_MEMBERSHIP, permission_code: "leads.view", scope_level: "ORG" },
    ];

    const { result } = renderHook(() => usePermissionScope());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPermissionScope("leads.view")).toBe("OWNED");
    expect(result.current.hasMinimumScope("leads.view", "ORG")).toBe(false);
  });

  it("applies an ORG scope held on the active organization's own membership", async () => {
    scopeRows = [
      { membership_id: ACTIVE_MEMBERSHIP, permission_code: "leads.view", scope_level: "ORG" },
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
});
