import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { identifyUser, resetAnalytics } from "@/lib/analytics/posthog";

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

interface HierarchyLinkRow { child_org_id: string; parent_org_id: string | null }
interface OrganizationRow { id: string; name: string; logo_url?: string | null; type?: string | null }
interface WorkOrgRpcRow {
  id: string;
  name: string;
  membership_type: string;
  via_org_id: string | null;
  via_org_name: string | null;
  roles: string[];
}

// Shape returned by get_user_context RPC
interface UserContextRpc {
  business_user_id: string | null;
  is_system_admin: boolean;
  org_ids: string[];
  memberships: Array<{ organization_id: string; role_id: string; role_code: string }>;
  permissions: string[];
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

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

// Picks the highest-priority role from an already-resolved role list (e.g.
// get_user_work_orgs()'s per-company `roles` array, which correctly reflects
// inherited/via_department access) — does not re-derive from raw memberships.
function pickHighestRole(roles: string[]): { tipo: string; roleName: string } {
  let best: { tipo: string; roleName: string } | null = null;
  let bestPriority = -Infinity;
  for (const code of roles) {
    const priority = ROLE_PRIORITY[code] ?? 0;
    if (priority > bestPriority) {
      bestPriority = priority;
      best = { tipo: code, roleName: code };
    }
  }
  return best ?? { tipo: "", roleName: "" };
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
  // Per-work-org roles from the last get_user_work_orgs() response, keyed by
  // company id — the only source that correctly reflects inherited access.
  const rolesByOrgIdRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    loadUserCompanies();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        if (event === "SIGNED_OUT") resetAnalytics();
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
        identifyUser(session.user.id);
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

  // Determine the user's GLOBAL role status (system_admin or not) exclusively
  // via get_user_context RPC. Org-specific role resolution for a selected
  // company is NOT done here — it uses get_user_work_orgs()'s own per-company
  // `roles` array (see rolesByOrgIdRef below), because that's the only source
  // that correctly reflects inherited (via_department) access; a fresh
  // per-org filter over get_user_context()'s direct-membership list cannot
  // see that relationship and silently falls back to the user's unrelated
  // globally-highest role for any company reached only via hierarchy.
  const determineUserType = useCallback(async (_authUserId: string): Promise<{ tipo: string; roleName: string }> => {
    const cacheKey = _authUserId;
    const cached = userTypeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { tipo: cached.tipo, roleName: cached.roleName };
    }

    const { data: rawCtx, error } = await (supabase as any).rpc("get_user_context");
    if (error || !rawCtx) {
      const result = { tipo: "", roleName: "" };
      userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }

    const ctx = rawCtx as UserContextRpc;

    if (!ctx.business_user_id) {
      const result = { tipo: "", roleName: "" };
      userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }

    if (ctx.is_system_admin) {
      const result = { tipo: "system_admin", roleName: "System Admin" };
      userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
      return result;
    }

    const memberships = Array.isArray(ctx.memberships) ? ctx.memberships : [];
    const result = pickHighestRole(memberships.map((m) => m.role_code || ""));
    userTypeCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  }, []);

  // Enriches the work_orgs already resolved by get_user_work_orgs() with
  // display-only fields the RPC contract doesn't return (logo_url, type) and
  // with each work_org's OWN hierarchy parent (one hop), used by
  // CompanySwitcher to render the nested company tree. This is a DIFFERENT
  // concept from via_org_id/via_org_name (the internal structure the CURRENT
  // USER's membership came through) — do not conflate the two.
  const enrichWorkOrgs = async (workOrgs: WorkOrgRpcRow[]): Promise<Company[]> => {
    if (workOrgs.length === 0) return [];
    const orgIds = workOrgs.map((w) => w.id);

    const [{ data: orgs, error: orgsError }, { data: hierarchyLinks, error: hierarchyError }] = await Promise.all([
      (supabase as any)
        .from("anew_organizations")
        .select("id, logo_url, type")
        .in("id", orgIds),
      (supabase as any)
        .from("anew_hierarchy")
        .select("child_org_id, parent_org_id")
        .in("child_org_id", orgIds),
    ]);
    if (orgsError) console.error("Error enriching companies (anew_organizations):", orgsError);
    if (hierarchyError) console.error("Error enriching companies (anew_hierarchy):", hierarchyError);

    const orgById = new Map<string, Pick<OrganizationRow, "id" | "logo_url" | "type">>();
    ((orgs || []) as OrganizationRow[]).forEach((o) => orgById.set(o.id, o));

    const parentIds = new Set<string>();
    const childToParent = new Map<string, string>();
    ((hierarchyLinks || []) as HierarchyLinkRow[]).forEach((h) => {
      if (!h.parent_org_id) return;
      childToParent.set(h.child_org_id, h.parent_org_id);
      parentIds.add(h.parent_org_id);
    });

    const parentNames = new Map<string, string>();
    if (parentIds.size > 0) {
      const { data: parents, error: parentsError } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .in("id", Array.from(parentIds));
      if (parentsError) console.error("Error enriching companies (parent names):", parentsError);
      ((parents || []) as Pick<OrganizationRow, "id" | "name">[]).forEach((p) => parentNames.set(p.id, p.name));
    }

    return workOrgs.map((w) => {
      const org = orgById.get(w.id);
      const parentId = childToParent.get(w.id) || null;
      return {
        id: w.id,
        name: w.name,
        logo_url: org?.logo_url ?? null,
        type: org?.type ?? null,
        parent_id: parentId,
        parent_name: parentId ? parentNames.get(parentId) || null : null,
      };
    });
  };

  // Ref-wrapper so refreshCompanies (exposed via context) can have a stable
  // identity via useCallback without needing loadUserCompanies itself
  // (which closes over many local state/refs) to be memoized.
  const loadUserCompaniesRef = useRef<() => Promise<void>>(async () => {});

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

      const initialResult = await determineUserType(session.user.id);
      if (requestVersion !== requestVersionRef.current) return;

      // get_user_work_orgs() is the single source of truth for which orgs are
      // selectable: is_work_org = true AND status = 'active' (system_admin
      // sees all of them; everyone else only direct/inherited memberships,
      // resolved server-side with correct anti-cycle hierarchy traversal that
      // tolerates the legacy relationship_type casing still present in
      // anew_hierarchy). This replaces the previous client-side type IN
      // ('holding','empresa') filter (no status check) and unfiltered
      // anew_hierarchy descendant walk.
      const { data: workOrgsRaw, error: workOrgsError } = await (supabase as any).rpc("get_user_work_orgs");
      if (requestVersion !== requestVersionRef.current) return;

      if (workOrgsError) {
        // Do NOT fall through silently — a failed RPC call must not look like
        // "this account genuinely has zero companies" (which drives the
        // create-company empty state in CompanySwitcher).
        console.error("Error loading work orgs:", workOrgsError);
        toast({
          variant: "destructive",
          title: "Erro ao carregar organizações",
          description: "Não foi possível obter a lista de organizações. Tenta recarregar a página.",
        });
      }

      const workOrgs = (workOrgsRaw || []) as WorkOrgRpcRow[];
      rolesByOrgIdRef.current = new Map(workOrgs.map((w) => [w.id, w.roles || []]));
      const userCompanies = await enrichWorkOrgs(workOrgs);
      if (requestVersion !== requestVersionRef.current) return;

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

      // Determine contextual user type based on the selected company. system_admin
      // is global and never org-scoped. Otherwise use the roles already resolved
      // by get_user_work_orgs() for this exact company (correct for inherited/
      // via_department access) instead of a second, per-org lookup.
      if (initialResult.tipo === "system_admin") {
        setUserType(initialResult.tipo);
        setUserRoleName(initialResult.roleName);
      } else if (selectedCompany) {
        const contextualResult = pickHighestRole(rolesByOrgIdRef.current.get(selectedCompany.id) || []);
        setUserType(contextualResult.tipo);
        setUserRoleName(contextualResult.roleName);
      } else {
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

  loadUserCompaniesRef.current = loadUserCompanies;

  const setActiveCompany = useCallback((company: Company) => {
    setActiveCompanyState(company);
    localStorage.setItem("activeCompanyId", company.id);

    // Recalculate userType for the new company context. system_admin is
    // global; everyone else uses the roles already resolved for this company
    // by the last get_user_work_orgs() response (see rolesByOrgIdRef).
    if (userType !== "system_admin") {
      const contextualResult = pickHighestRole(rolesByOrgIdRef.current.get(company.id) || []);
      setUserType(contextualResult.tipo);
      setUserRoleName(contextualResult.roleName);
    }
  }, [userType]);

  const refreshCompanies = useCallback(async () => {
    await loadUserCompaniesRef.current();
  }, []);

  // Memoized so consumers of useCompany() only see a new context value when
  // one of these actually changes, instead of on every CompanyProvider
  // render — an unmemoized value object here previously caused every
  // consumer's effects/callbacks depending on "the whole context" to refire
  // on every render, which could cascade into render loops downstream.
  const value = useMemo(
    () => ({
      companies,
      activeCompany,
      setActiveCompany,
      refreshCompanies,
      isLoading,
      userType,
      userRoleName,
    }),
    [companies, activeCompany, setActiveCompany, refreshCompanies, isLoading, userType, userRoleName],
  );

  return (
    <CompanyContext.Provider value={value}>
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
