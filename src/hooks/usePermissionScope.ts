import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedAuthUser } from "@/lib/cachedAuth";
import { permissionSetHas } from "@/lib/permissionAliases";
import { useCompany } from "@/contexts/CompanyContext";

export type ScopeLevel = "NONE" | "OWNED" | "TEAM" | "ORG";

const SCOPE_HIERARCHY: Record<ScopeLevel, number> = { NONE: 0, OWNED: 1, TEAM: 2, ORG: 3 };

/** Resolve all team member IDs where user is leader (via organization_teams) */
async function resolveSubordinates(anewUserId: string, activeOrgId?: string): Promise<string[]> {
  if (!activeOrgId) return [];

  const { data: ledTeams } = await (supabase as any)
    .from("organization_teams")
    .select("id")
    .eq("organization_id", activeOrgId)
    .eq("leader_id", anewUserId);

  if (!ledTeams || ledTeams.length === 0) return [];

  const teamIds = ledTeams.map((t: any) => t.id);
  const { data: teamMembers } = await (supabase as any)
    .from("organization_team_members")
    .select("user_id")
    .in("team_id", teamIds);

  if (!teamMembers) return [];

  return teamMembers
    .map((m: any) => m.user_id as string)
    .filter((id: string) => id !== anewUserId);
}

export function usePermissionScope() {
  const { activeCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [anewUserId, setAnewUserId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [anewRoleCode, setAnewRoleCode] = useState<string | null>(null);
  const [scopeOverrides, setScopeOverrides] = useState<Map<string, ScopeLevel>>(new Map());
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [binaryPermissions, setBinaryPermissions] = useState<Set<string>>(new Set());
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);

  const loadPermissions = useCallback(async () => {
    if (!activeCompany) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data: { user } } = await getCachedAuthUser();
      if (!user) { setLoading(false); return; }
      setAuthUserId(user.id);

      const { data: anewUser } = await (supabase as any).from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
      if (!anewUser) { setLoading(false); return; }
      setAnewUserId(anewUser.id);

      // System admins are global roles: they must keep full access even
      // when the active organization is not one of their direct memberships.
      // Super admins only have access to their own organizations.
      const { data: globalMemberships } = await supabase.from("anew_memberships")
        .select("role_id")
        .eq("user_id", anewUser.id)
        .eq("status", "active");

      const globalRoleIds = [...new Set((globalMemberships || []).map(m => m.role_id).filter(Boolean))];
      if (globalRoleIds.length > 0) {
        const { data: globalRoles } = await supabase.from("anew_roles").select("code").in("id", globalRoleIds);
        const globalAdminRole = (globalRoles || []).find(r => ["system_admin"].includes(r.code));
        if (globalAdminRole) {
          setAnewRoleCode(globalAdminRole.code);
          setIsFullAccess(true);
          setRolePermissions(new Set(["*"]));
          setScopeOverrides(new Map());
          setBinaryPermissions(new Set());
          setTeamMemberIds([]);
          setLoading(false);
          return;
        }
      }

      // PERF-003 (Item 3): build ancestor chain via targeted queries (no full-scan of anew_hierarchy)
      const orgChain: string[] = [activeCompany.id];
      let currentOrgId = activeCompany.id;
      for (let i = 0; i < 10; i++) {
        const { data: parentLink } = await (supabase as any)
          .from("anew_hierarchy")
          .select("parent_org_id")
          .eq("child_org_id", currentOrgId)
          .maybeSingle();
        if (!parentLink?.parent_org_id) break;
        orgChain.push(parentLink.parent_org_id);
        currentOrgId = parentLink.parent_org_id;
      }

      // Find ALL active memberships across ancestor chain
      const { data: memberships } = await supabase.from("anew_memberships")
        .select("id, role_id, organization_id")
        .eq("user_id", anewUser.id)
        .in("organization_id", orgChain)
        .eq("status", "active");

      if (!memberships || memberships.length === 0) {
        setRolePermissions(new Set()); setScopeOverrides(new Map()); setIsFullAccess(false); setTeamMemberIds([]); setLoading(false); return;
      }

      const roleIds = [...new Set(memberships.map(m => m.role_id))];
      const membershipIds = memberships.map(m => m.id);

      // PERF-003: parallelize independent queries (roles, role_perms, scope overrides)
      const [rolesRes, rolePermsRes, scopeRes] = await Promise.all([
        supabase.from("anew_roles").select("id, code").in("id", roleIds),
        supabase.from("anew_role_permissions").select("permission_code").in("role_id", roleIds),
        supabase.from("anew_membership_permission_scopes").select("permission_code, scope_level").in("membership_id", membershipIds),
      ]);

      const roles = rolesRes.data;
      const roleCodeMap = new Map((roles || []).map(r => [r.id, r.code]));

      const ROLE_PRIORITY: Record<string, number> = {
        org_viewer: 0, org_editor: 1, org_admin: 2, super_admin: 3, system_admin: 4,
      };
      let bestCode = "";
      let bestPriority = -Infinity;
      for (const m of memberships) {
        const code = roleCodeMap.get(m.role_id) || '';
        const priority = ROLE_PRIORITY[code] ?? 0;
        if (priority > bestPriority) { bestPriority = priority; bestCode = code; }
      }
      setAnewRoleCode(bestCode || null);

      const hasFullAccess = (roles || []).some(r => ["super_admin", "system_admin"].includes(r.code));
      if (hasFullAccess) { setIsFullAccess(true); setTeamMemberIds([]); setLoading(false); return; }
      setIsFullAccess(false);

      const permSet = new Set<string>(rolePermsRes.data?.map(rp => rp.permission_code) || []);
      setRolePermissions(permSet);

      // Scope overrides — pick highest scope per permission
      const overrideMap = new Map<string, ScopeLevel>();
      scopeRes.data?.forEach(s => {
        const existing = overrideMap.get(s.permission_code);
        const newLevel = s.scope_level as ScopeLevel;
        if (!existing || SCOPE_HIERARCHY[newLevel] > SCOPE_HIERARCHY[existing]) {
          overrideMap.set(s.permission_code, newLevel);
        }
      });
      setScopeOverrides(overrideMap);

      // PERF-003: parallelize binary perms lookup with subordinates resolution
      const permCodes = Array.from(permSet);
      const hasTeamScope = Array.from(overrideMap.values()).some(v => v === "TEAM");

      const [binaryDefsRes, subs] = await Promise.all([
        permCodes.length > 0
          ? supabase.from("anew_permissions").select("code, supports_scope").in("code", permCodes).eq("supports_scope", false)
          : Promise.resolve({ data: [] as { code: string; supports_scope: boolean }[] }),
        hasTeamScope ? resolveSubordinates(anewUser.id, activeCompany?.id) : Promise.resolve([] as string[]),
      ]);

      setBinaryPermissions(new Set((binaryDefsRes.data || []).map((p: any) => p.code)));
      setTeamMemberIds(subs);
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
