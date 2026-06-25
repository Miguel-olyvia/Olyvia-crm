import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { INTERNAL_ASSIGNMENT_EXCLUDED_ROLES } from "@/constants/userTypeRoles";

export interface ComercialUser {
  id: string;
  name: string;
  org_ids: string[];
}

/**
 * Loads users belonging to "Comercial" departments under the active company subtree.
 * Falls back to all active members of the subtree when no Comercial dept exists.
 * Mirrors the logic used in AnewLeads.tsx (without districts/address resolution).
 */
export function useComercialUsers(activeCompanyId: string | null | undefined) {
  const [users, setUsers] = useState<ComercialUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) {
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      // Resolve descendant org ids
      const { data: hierarchy } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const childrenMap = new Map<string, string[]>();
      (hierarchy || []).forEach((h: any) => {
        const arr = childrenMap.get(h.parent_org_id) || [];
        arr.push(h.child_org_id);
        childrenMap.set(h.parent_org_id, arr);
      });
      const allOrgIds: string[] = [activeCompanyId];
      const queue = [activeCompanyId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const c of (childrenMap.get(cur) || [])) {
          if (!allOrgIds.includes(c)) {
            allOrgIds.push(c);
            queue.push(c);
          }
        }
      }

      const { data: orgs } = await supabase
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", allOrgIds);

      const comercialDeptIds = (orgs || [])
        .filter((o: any) => o.name?.toLowerCase() === "comercial" && o.type === "departamento")
        .map((o: any) => o.id);

      const membershipOrgIds = comercialDeptIds.length > 0 ? comercialDeptIds : allOrgIds;

      const { data: rawMemberships } = await supabase
        .from("anew_memberships")
        .select("user_id, organization_id, role_id")
        .in("organization_id", membershipOrgIds)
        .eq("status", "active");

      const roleIds = [...new Set((rawMemberships || []).map((m: any) => m.role_id).filter(Boolean))];
      const roleCodeMap: Record<string, string> = {};
      if (roleIds.length > 0) {
        const { data: rolesData } = await supabase
          .from("anew_roles")
          .select("id, code")
          .in("id", roleIds);
        (rolesData || []).forEach((r: any) => { roleCodeMap[r.id] = (r.code || "").toLowerCase(); });
      }

      // Exclude external/client roles — only internal staff should be selectable as Comercial
      const memberships = (rawMemberships || []).filter((m: any) => {
        const code = roleCodeMap[m.role_id];
        return !code || !INTERNAL_ASSIGNMENT_EXCLUDED_ROLES.has(code);
      });

      if (memberships.length === 0) {
        setUsers([]);
        return;
      }

      const userIds = [...new Set(memberships.map((m: any) => m.user_id))];
      const { data: usersData } = await supabase
        .from("anew_users")
        .select("id, name, status")
        .in("id", userIds)
        .eq("status", "active");

      // dept -> parent org map
      const deptParentMap = new Map<string, string>();
      (hierarchy || []).forEach((h: any) => {
        if (comercialDeptIds.includes(h.child_org_id)) {
          deptParentMap.set(h.child_org_id, h.parent_org_id);
        }
      });

      const userOrgMap: Record<string, string[]> = {};
      memberships.forEach((m: any) => {
        const parentOrg = deptParentMap.get(m.organization_id) || m.organization_id;
        if (!userOrgMap[m.user_id]) userOrgMap[m.user_id] = [];
        if (!userOrgMap[m.user_id].includes(parentOrg)) userOrgMap[m.user_id].push(parentOrg);
        if (!userOrgMap[m.user_id].includes(m.organization_id)) userOrgMap[m.user_id].push(m.organization_id);
      });

      setUsers(
        (usersData || []).map((u: any) => ({
          id: u.id,
          name: u.name || "Utilizador",
          org_ids: userOrgMap[u.id] || [],
        })).sort((a, b) => a.name.localeCompare(b.name))
      );
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => { load(); }, [load]);

  return { comercialUsers: users, loading, reload: load };
}
