import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache user type per company to reduce queries
const userTypeCache = new Map<string, { tipo: string; roleName: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Company {
  id: string;
  name: string;
  logo_url?: string | null;
  type?: string | null;
  parent_id?: string | null;   // parent org id (from anew_hierarchy)
  parent_name?: string | null; // parent org name
}

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (company: Company) => void;
  refreshCompanies: () => Promise<void>;
  isLoading: boolean;
  userType: string;
  userRoleName: string;
}

interface AnewUserRow { id: string }
interface HierarchyLinkRow { child_org_id: string; parent_org_id: string | null }
interface OrganizationRow { id: string; name: string; logo_url?: string | null; type?: string | null }
interface RoleRow { code: string | null; name: string | null }
interface MembershipRow { role_id: string | null; organization_id?: string | null }

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

// Helper: get anew_user id from auth user id
async function getAnewUserId(authUserId: string): Promise<string | null> {
  const { data } = await (supabase as any).from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
  return (data as AnewUserRow | null)?.id || null;
}

// Helper: build ancestor chain for an org (up to 10 levels)
async function buildAncestorChain(orgId: string): Promise<string[]> {
  const chain: string[] = [orgId];
  let currentId = orgId;
  for (let i = 0; i < 10; i++) {
    const { data } = await (supabase as any)
      .from("anew_hierarchy")
      .select("parent_org_id")
      .eq("child_org_id", currentId)
      .maybeSingle();
    const link = data as Pick<HierarchyLinkRow, "parent_org_id"> | null;
    if (!link?.parent_org_id) break;
    chain.push(link.parent_org_id);
    currentId = link.parent_org_id;
  }
  return chain;
}

// Role priority map — higher index = higher privilege
const ROLE_PRIORITY: Record<string, number> = {
  client: -1,
  org_viewer: 0,
  org_editor: 1,
  org_admin: 2,
  super_admin: 3,
  system_admin: 4,
};

// No normalization — userType always reflects the real role code.
// UI visibility is driven by PermissionsContext/PermissionGate, not userType checks.

// Helper: find the user's HIGHEST role across the ancestor chain, returns { code, name }
async function resolveRole(anewUserId: string, orgId: string): Promise<{ code: string; name: string } | null> {
  const chain = await buildAncestorChain(orgId);
  let best: { code: string; name: string } | null = null;
  let bestPriority = -Infinity;

  for (const oid of chain) {
    // Read as array — a user may have multiple active memberships in the same org
    // (different roles). Pick the highest-priority one.
    const { data: memberships } = await supabase.from("anew_memberships")
      .select("role_id")
      .eq("user_id", anewUserId)
      .eq("organization_id", oid)
      .eq("status", "active");
    if (memberships && memberships.length > 0) {
      const roleIds = (memberships as MembershipRow[]).map((m) => m.role_id).filter(Boolean);
      if (roleIds.length === 0) continue;
      const { data: roles } = await supabase.from("anew_roles").select("code, name").in("id", roleIds);
      for (const role of (roles || []) as RoleRow[]) {
        const code = role?.code || null;
        const name = role?.name || code || "";
        const priority = code ? (ROLE_PRIORITY[code] ?? 0) : -1;
        if (priority > bestPriority) {
          bestPriority = priority;
          best = { code: code || "org_viewer", name };
        }
      }
      // Short-circuit if we already found the highest possible role
      if (bestPriority >= ROLE_PRIORITY.system_admin) break;
    }
  }
  return best;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userType, setUserType] = useState<string>("");
  const [userRoleName, setUserRoleName] = useState<string>("");
  const requestVersionRef = useRef(0);
  // Track which user has been fully loaded to skip redundant SIGNED_IN events
  // (Supabase re-emits SIGNED_IN on tab refocus / session revalidation)
  const loadedUserIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    loadUserCompanies();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        requestVersionRef.current += 1;
        loadedUserIdRef.current = null;
        initialLoadDoneRef.current = false;
        setCompanies([]);
        setActiveCompanyState(null);
        setUserType("");
        setUserRoleName("");
        localStorage.removeItem("activeCompanyId");
        setIsLoading(false);
      } else if (event === "SIGNED_IN") {
        if (!session) return;
        // Skip if same user already fully loaded (tab refocus revalidation)
        if (
          session.user.id === loadedUserIdRef.current &&
          initialLoadDoneRef.current
        ) {
          return;
        }
        setTimeout(() => loadUserCompanies(), 0);
      } else if (event === "TOKEN_REFRESHED" && session) {
        // Session refreshed successfully, no action needed
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Determine user type using anew tables only — returns { tipo, roleName }
  const determineUserType = useCallback(async (authUserId: string, companyId: string | null): Promise<{ tipo: string; roleName: string }> => {
    const cacheKey = `${authUserId}-${companyId || 'none'}`;
    const cached = userTypeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { tipo: cached.tipo, roleName: cached.roleName };
    }

    const anewId = await getAnewUserId(authUserId);
    if (!anewId) {
      const result = { tipo: "", roleName: "" };
      userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }

    // 1. Check for system_admin membership (org-less or any org)
    const { data: sysMemb } = await supabase.from("anew_memberships")
      .select("role_id")
      .eq("user_id", anewId)
      .eq("status", "active");

    if (sysMemb && sysMemb.length > 0) {
      const roleIds = sysMemb.map(m => m.role_id);
      const { data: roles } = await supabase.from("anew_roles").select("code, name").in("id", roleIds);
      const sysRole = roles?.find(r => r.code === "system_admin");
      if (sysRole) {
        const result = { tipo: "system_admin", roleName: sysRole.name || "System Admin" };
        userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
        return result;
      }
    }

    // 2. If company context, resolve role via ancestor traversal
    if (companyId) {
      const resolved = await resolveRole(anewId, companyId);
      if (resolved) {
        const result = { tipo: resolved.code, roleName: resolved.name };
        userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
        return result;
      }
    }

    // 3. Find highest role across all memberships
    if (sysMemb && sysMemb.length > 0) {
      const roleIds = sysMemb.map(m => m.role_id);
      const { data: roles } = await supabase.from("anew_roles").select("code, name").in("id", roleIds);
      const rolePriority = ["super_admin", "org_admin", "org_editor", "org_viewer"];
      for (const rp of rolePriority) {
        const found = roles?.find(r => r.code === rp);
        if (found) {
          const result = { tipo: rp, roleName: found.name || rp };
          userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
          return result;
        }
      }
      // Return first role code found
      const first = roles?.[0];
      const result = { tipo: first?.code || "", roleName: first?.name || "" };
      userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }

    // No memberships at all — user has no role
    const result = { tipo: "", roleName: "" };
    userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  }, []);

  // Fetch organizations with parent org names (replaces fetchCompaniesWithTenantNames)
  const fetchOrgsWithParentNames = async (orgIds: string[]): Promise<Company[]> => {
    if (orgIds.length === 0) return [];

    const { data: orgs } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name, logo_url, type")
      .in("id", orgIds)
      .in("type", ["holding", "empresa"])
      .order("name");

    const organizations = (orgs || []) as OrganizationRow[];
    if (organizations.length === 0) return [];

    // Fetch parent org for each org via anew_hierarchy
    const { data: hierarchyLinks } = await (supabase as any)
      .from("anew_hierarchy")
      .select("child_org_id, parent_org_id")
      .in("child_org_id", orgIds);

    const parentIds = new Set<string>();
    const childToParent = new Map<string, string>();
    ((hierarchyLinks || []) as HierarchyLinkRow[]).forEach((h) => {
      if (!h.parent_org_id) return;
      childToParent.set(h.child_org_id, h.parent_org_id);
      parentIds.add(h.parent_org_id);
    });

    // Fetch parent org names
    const parentNames = new Map<string, string>();
    if (parentIds.size > 0) {
      const { data: parents } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .in("id", Array.from(parentIds));
      ((parents || []) as Pick<OrganizationRow, "id" | "name">[]).forEach((p) => parentNames.set(p.id, p.name));
    }

    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      logo_url: org.logo_url,
      type: org.type || null,
      parent_id: childToParent.get(org.id) || null,
      parent_name: parentNames.get(childToParent.get(org.id) || "") || null,
    }));
  };

  const loadUserCompanies = async () => {
    const requestVersion = ++requestVersionRef.current;
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (requestVersion !== requestVersionRef.current) return;

      if (!session) {
        loadedUserIdRef.current = null;
        initialLoadDoneRef.current = false;
        setIsLoading(false);
        return;
      }

      const initialResult = await determineUserType(session.user.id, null);
      if (requestVersion !== requestVersionRef.current) return;

      const anewId = await getAnewUserId(session.user.id);
      if (requestVersion !== requestVersionRef.current) return;
      
      let userCompanies: Company[] = [];

      if (initialResult.tipo === "system_admin") {
        // Only system_admin sees all organizations globally
        const { data: allOrgs } = await (supabase as any)
          .from("anew_organizations")
          .select("id")
          .order("name");
        if (requestVersion !== requestVersionRef.current) return;

        const allOrgIds = ((allOrgs || []) as Pick<OrganizationRow, "id">[]).map((o) => o.id);
        userCompanies = await fetchOrgsWithParentNames(allOrgIds);
        if (requestVersion !== requestVersionRef.current) return;
      } else if (anewId) {
        // Get all orgs from active memberships
        const { data: memberships } = await supabase.from("anew_memberships")
          .select("organization_id")
          .eq("user_id", anewId)
          .eq("status", "active");
        if (requestVersion !== requestVersionRef.current) return;

        const orgIdSet = new Set<string>();
        (memberships || []).forEach(m => orgIdSet.add(m.organization_id));

        // Resolve full descendant tree for all membership orgs
        const directOrgIds = Array.from(orgIdSet);
        let currentParentIds = directOrgIds;
        for (let depth = 0; depth < 10 && currentParentIds.length > 0; depth++) {
          const { data: children } = await (supabase as any)
            .from("anew_hierarchy")
            .select("child_org_id")
            .in("parent_org_id", currentParentIds);
          if (requestVersion !== requestVersionRef.current) return;

          if (!children || children.length === 0) break;
          const childIds = (children as Pick<HierarchyLinkRow, "child_org_id">[])
            .map((c) => c.child_org_id)
            .filter((id) => !orgIdSet.has(id));
          if (childIds.length === 0) break;
          childIds.forEach((id: string) => orgIdSet.add(id));
          currentParentIds = childIds;
        }

        userCompanies = await fetchOrgsWithParentNames(Array.from(orgIdSet));
        if (requestVersion !== requestVersionRef.current) return;
      }

      setCompanies(userCompanies);

      // Load saved active company from localStorage
      const savedCompanyId = localStorage.getItem("activeCompanyId");
      const savedCompany = userCompanies.find(c => c.id === savedCompanyId);
      
      let selectedCompany: Company | null = null;
      if (savedCompany) {
        selectedCompany = savedCompany;
        setActiveCompanyState(savedCompany);
      } else if (userCompanies.length > 0) {
        selectedCompany = userCompanies[0];
        setActiveCompanyState(userCompanies[0]);
        localStorage.setItem("activeCompanyId", userCompanies[0].id);
      }

      // Determine contextual user type based on selected company
      if (selectedCompany && initialResult.tipo !== "system_admin") {
        const contextualResult = await determineUserType(session.user.id, selectedCompany.id);
        if (requestVersion !== requestVersionRef.current) return;

        setUserType(contextualResult.tipo);
        setUserRoleName(contextualResult.roleName);
      } else if (initialResult.tipo === "system_admin") {
        setUserType(initialResult.tipo);
        setUserRoleName(initialResult.roleName);
      } else if (initialResult.tipo !== "system_admin") {
        setUserType(initialResult.tipo);
        setUserRoleName(initialResult.roleName);
      }

      // Mark this user as fully loaded so future SIGNED_IN events for the
      // same user (e.g. tab refocus revalidation) can be safely skipped.
      if (requestVersion === requestVersionRef.current) {
        loadedUserIdRef.current = session.user.id;
        initialLoadDoneRef.current = true;
      }
    } catch (error) {
      console.error("Error loading companies:", error);
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsLoading(false);
      }
    }
  };

  const setActiveCompany = async (company: Company) => {
    const requestVersion = ++requestVersionRef.current;
    setActiveCompanyState(company);
    localStorage.setItem("activeCompanyId", company.id);
    
    // Recalculate userType for the new company context
    const { data: { session } } = await supabase.auth.getSession();
    if (requestVersion !== requestVersionRef.current) return;

    if (session && userType !== "system_admin") {
      const contextualResult = await determineUserType(session.user.id, company.id);
      if (requestVersion !== requestVersionRef.current) return;

      setUserType(contextualResult.tipo);
      setUserRoleName(contextualResult.roleName);
    }
  };

  const refreshCompanies = async () => {
    await loadUserCompanies();
  };

  return (
    <CompanyContext.Provider value={{ 
      companies, 
      activeCompany, 
      setActiveCompany,
      refreshCompanies,
      isLoading,
      userType,
      userRoleName
    }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
