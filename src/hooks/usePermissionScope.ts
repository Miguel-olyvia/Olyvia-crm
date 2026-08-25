import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAuthUser } from "@/lib/cachedAuth";
import { permissionSetHas } from "@/lib/permissionAliases";
import { useCompany } from "@/contexts/CompanyContext";
import { type AnewUserId, type AuthUserId, asAnewUserId, asAuthUserId } from "@/types/identity";

export type ScopeLevel = "NONE" | "OWNED" | "TEAM" | "ORG";

const SCOPE_HIERARCHY: Record<ScopeLevel, number> = { NONE: 0, OWNED: 1, TEAM: 2, ORG: 3 };

/** Shape returned by the get_permission_scope_context RPC. */
interface ScopeContextMembership {
  id: string;
  role_id: string;
  organization_id: string;
  role_code: string | null;
}

interface ScopeContextRow {
  membership_id: string;
  organization_id: string;
  permission_code: string;
  scope_level: string;
}

interface ScopeContext {
  anew_user_id: string | null;
  is_global_system_admin: boolean;
  org_chain: string[];
  memberships: ScopeContextMembership[];
  role_permissions: string[];
  scope_rows: ScopeContextRow[];
  binary_permission_codes: string[];
  team_member_ids: string[];
}

/**
 * In-flight RPC calls, keyed by auth user + active organization. The hook has
 * 29 consumers and they mount together, so the same context used to be
 * resolved once per component instance. Sharing the pending promise collapses
 * that burst into one request.
 *
 * Entries are dropped as soon as the call settles — this dedupes concurrency,
 * it does not memoise results, so `refresh()` still re-reads the database.
 */
const inFlightScopeContexts = new Map<string, Promise<ScopeContext | null>>();

async function fetchScopeContext(authUid: string, organizationId: string): Promise<ScopeContext | null> {
  const key = `${authUid}:${organizationId}`;
  const pending = inFlightScopeContexts.get(key);
  if (pending) return pending;

  const request = (async (): Promise<ScopeContext | null> => {
    const { data, error } = await supabase.rpc("get_permission_scope_context", {
      _organization_id: organizationId,
    });

    if (error) {
      // Fail closed: a null context leaves every scope at NONE rather than
      // silently granting anything.
      console.error("[usePermissionScope] scope context RPC failed:", error);
      return null;
    }

    return (data ?? null) as ScopeContext | null;
  })();

  inFlightScopeContexts.set(key, request);
  try {
    return await request;
  } finally {
    inFlightScopeContexts.delete(key);
  }
}

export function usePermissionScope() {
  const { activeCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [anewUserId, setAnewUserId] = useState<AnewUserId | null>(null);
  const [authUserId, setAuthUserId] = useState<AuthUserId | null>(null);
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [anewRoleCode, setAnewRoleCode] = useState<string | null>(null);
  const [scopeOverrides, setScopeOverrides] = useState<Map<string, ScopeLevel>>(new Map());
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [binaryPermissions, setBinaryPermissions] = useState<Set<string>>(new Set());
  const [teamMemberIds, setTeamMemberIds] = useState<AnewUserId[]>([]);

  const loadPermissions = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data: { user } } = await getCachedAuthUser();
      if (!user) { setLoading(false); return; }
      setAuthUserId(asAuthUserId(user.id));

      // One RPC replaces the 11-query chain this hook used to run per
      // instance. It is a data collector only — every decision below stays
      // here, in reviewed and tested TypeScript.
      const ctx = await fetchScopeContext(user.id, activeCompany.id);
      if (!ctx?.anew_user_id) { setLoading(false); return; }

      const typedAnewUserId = asAnewUserId(ctx.anew_user_id);
      setAnewUserId(typedAnewUserId);

      // System admins are global roles: they must keep full access even
      // when the active organization is not one of their direct memberships.
      // Super admins only have access to their own organizations.
      if (ctx.is_global_system_admin) {
        setAnewRoleCode("system_admin");
        setIsFullAccess(true);
        setRolePermissions(new Set(["*"]));
        setScopeOverrides(new Map());
        setBinaryPermissions(new Set());
        setTeamMemberIds([]);
        setLoading(false);
        return;
      }

      // Active memberships across the organization ancestor chain, resolved
      // server-side by the RPC's recursive CTE.
      const memberships = ctx.memberships ?? [];
      if (memberships.length === 0) {
        setRolePermissions(new Set()); setScopeOverrides(new Map()); setIsFullAccess(false); setTeamMemberIds([]); setLoading(false); return;
      }

      const ROLE_PRIORITY: Record<string, number> = {
        org_viewer: 0, org_editor: 1, org_admin: 2, super_admin: 3, system_admin: 4,
      };
      let bestCode = "";
      let bestPriority = -Infinity;
      for (const m of memberships) {
        const code = m.role_code || '';
        const priority = ROLE_PRIORITY[code] ?? 0;
        if (priority > bestPriority) { bestPriority = priority; bestCode = code; }
      }
      setAnewRoleCode(bestCode || null);

      const hasFullAccess = memberships.some(m => ["super_admin", "system_admin"].includes(m.role_code || ''));
      if (hasFullAccess) { setIsFullAccess(true); setTeamMemberIds([]); setLoading(false); return; }
      setIsFullAccess(false);

      const permSet = new Set<string>(ctx.role_permissions ?? []);
      setRolePermissions(permSet);

      // Scope overrides come ONLY from memberships in the ACTIVE organization.
      // Reading them across the ancestor chain let ORG scope granted in a parent
      // organization leak into every child — the cross-organization escalation
      // fixed in the database by 20261112120000_scope_resolution_per_org_only.sql
      // (and, for proposals, by 20261006010000). Role permissions still resolve
      // across the chain, mirroring the database.
      //
      // The RPC returns the chain's rows with their organization_id attached and
      // this filter is what enforces the rule, so the invariant stays here where
      // usePermissionScope.orgScope.test.ts can prove it.
      const overrideMap = new Map<string, ScopeLevel>();
      (ctx.scope_rows ?? [])
        .filter(s => s.organization_id === activeCompany.id)
        .forEach(s => {
          const existing = overrideMap.get(s.permission_code);
          const newLevel = s.scope_level as ScopeLevel;
          if (!existing || SCOPE_HIERARCHY[newLevel] > SCOPE_HIERARCHY[existing]) {
            overrideMap.set(s.permission_code, newLevel);
          }
        });
      setScopeOverrides(overrideMap);

      setBinaryPermissions(new Set(ctx.binary_permission_codes ?? []));

      // Team members only matter once a TEAM scope is in play, as before.
      const hasTeamScope = Array.from(overrideMap.values()).some(v => v === "TEAM");
      setTeamMemberIds(
        hasTeamScope
          ? (ctx.team_member_ids ?? []).map(id => asAnewUserId(id)).filter(id => id !== typedAnewUserId)
          : []
      );
    } catch (error) { console.error("Error loading permission scopes:", error); } finally { setLoading(false); }
  }, [activeCompany]);

  useEffect(() => { loadPermissions(); }, [loadPermissions]);

  const getPermissionScope = useCallback((permissionCode: string): ScopeLevel => {
    if (isFullAccess) return "ORG";
    // Check scope overrides (direct + aliases)
    const override = scopeOverrides.get(permissionCode);
    if (override) return override;
    // Check aliases in overrides
    const overrideKeys = Array.from(scopeOverrides.keys());
    for (const code of overrideKeys) {
      if (permissionSetHas(new Set([code]), permissionCode)) return scopeOverrides.get(code)!;
    }
    // Check role permissions with alias support
    if (permissionSetHas(rolePermissions, permissionCode)) {
      return permissionSetHas(binaryPermissions, permissionCode) ? "ORG" : "OWNED";
    }
    return "NONE";
  }, [scopeOverrides, rolePermissions, isFullAccess, binaryPermissions]);

  const hasMinimumScope = useCallback((permissionCode: string, minScope: ScopeLevel): boolean => {
    return SCOPE_HIERARCHY[getPermissionScope(permissionCode)] >= SCOPE_HIERARCHY[minScope];
  }, [getPermissionScope]);

  return { loading, getPermissionScope, hasMinimumScope, anewUserId, authUserId, anewRoleCode, teamMemberIds, refresh: loadPermissions };
}

export function canActOnEntity(
  scope: ScopeLevel,
  entity: { created_by?: string | null },
  anewUserId: string | null,
  _authUserId: string | null,
  teamMemberIds?: string[]
): boolean {
  if (scope === "NONE") return false;
  if (scope === "ORG") return true;
  if (scope === "TEAM") {
    return (
      entity.created_by === anewUserId ||
      (teamMemberIds || []).includes(entity.created_by || "")
    );
  }
  // OWNED
  return entity.created_by === anewUserId;
}

export function applyScopeFilter<T extends { created_by?: string | null }>(
  data: T[], scope: ScopeLevel, anewUserId: string | null, _authUserId?: string | null, teamMemberIds?: string[]
): T[] {
  if (scope === "NONE") return [];
  if (scope === "ORG") return data;
  if (scope === "TEAM") {
    const allowed = new Set<string>();
    if (anewUserId) allowed.add(anewUserId);
    (teamMemberIds || []).forEach(id => allowed.add(id));
    return data.filter(item => allowed.has(item.created_by || ""));
  }
  // OWNED
  return data.filter(item => item.created_by === anewUserId);
}
