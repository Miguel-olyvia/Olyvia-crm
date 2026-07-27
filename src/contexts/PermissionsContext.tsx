import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { expandPermissions, permissionSetHas } from "@/lib/permissionAliases";

interface PermissionsContextType {
  permissions: string[];
  loading: boolean;
  isSystemAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
  hasAnyPermission: (permissionCodes: string[]) => boolean;
  hasModuleAccess: (module: string) => boolean;
  refreshPermissions: () => void;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

// Cache permissions per company to avoid redundant queries
const permissionsCache = new Map<string, { permissions: string[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface UserContextRpcResult {
  business_user_id?: string | null;
  is_system_admin?: boolean | null;
  permissions?: unknown;
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionSet, setPermissionSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { activeCompany, userType } = useCompany();

  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  // Version counter to handle race conditions — only the latest call applies results
  const versionRef = useRef(0);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    if (!userType) {
      setLoading(false);
      return;
    }

    const version = ++versionRef.current;
    setLoading(true);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (version !== versionRef.current) return;
        if (!session?.user) {
          setPermissions([]);
          setPermissionSet(new Set());
          setIsSystemAdmin(false);
          return;
        }

        const userId = session.user.id;

        // Check cache (per user + active company)
        const cacheKey = `${userId}-${activeCompany?.id || "none"}`;
        const cached = permissionsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setPermissions(cached.permissions);
          setPermissionSet(expandPermissions(cached.permissions));
          return;
        }

        // P2.a — Single RPC replaces: anew_users + anew_hierarchy chain + anew_memberships + anew_roles + anew_role_permissions
        // Transient network blips (e.g. a dropped fetch) have no retry at the
        // supabase-js layer for rpc() calls, so a single retry with a short
        // backoff is done here before failing closed.
        let rawCtx: unknown = null;
        let ctxError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await (supabase as any).rpc("get_user_context");
          rawCtx = result.data;
          ctxError = result.error;
          if (version !== versionRef.current) return;
          if (!ctxError) break;
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
        }
        const ctx = rawCtx as UserContextRpcResult | null;
        if (ctxError) {
          console.error("get_user_context RPC error:", ctxError);
          // Fail closed: don't leave a stale isSystemAdmin/permissions state
          // from a previous successful fetch in effect after this one failed.
          setPermissions([]); setPermissionSet(new Set()); setIsSystemAdmin(false);
          return;
        }

        if (!ctx || !ctx.business_user_id) {
          setPermissions([]); setPermissionSet(new Set()); setIsSystemAdmin(false);
          return;
        }

        setIsSystemAdmin(ctx.is_system_admin === true);

        const permissionsList: string[] =
          Array.isArray(ctx.permissions) &&
          ctx.permissions.every((value): value is string => typeof value === "string") &&
          !ctx.permissions.includes("*")
            ? ctx.permissions
            : [];
        const expanded = expandPermissions(permissionsList);

        permissionsCache.set(cacheKey, { permissions: permissionsList, timestamp: Date.now() });
        setPermissions(permissionsList);
        setPermissionSet(expanded);
      } catch (error) {
        console.error("Error loading permissions:", error);
        if (version === versionRef.current) { setPermissions([]); setPermissionSet(new Set()); }
      } finally {
        if (version === versionRef.current) setLoading(false);
      }
    })();
  }, [activeCompany?.id, userType, refreshCounter]);

  const hasPermission = useCallback((permissionCode: string): boolean => {
    if (isSystemAdmin) return true;
    return permissionSetHas(permissionSet, permissionCode);
  }, [permissionSet, isSystemAdmin]);

  const hasAnyPermission = useCallback((permissionCodes: string[]): boolean => {
    if (isSystemAdmin) return true;
    return permissionCodes.some(code => permissionSetHas(permissionSet, code));
  }, [permissionSet, isSystemAdmin]);

  const hasModuleAccess = useCallback((module: string): boolean => {
    if (isSystemAdmin) return true;
    for (const p of permissionSet) {
      if (p.startsWith(module)) return true;
    }
    return false;
  }, [permissionSet, isSystemAdmin]);

  const refreshPermissions = useCallback(() => {
    permissionsCache.clear();
    setRefreshCounter(c => c + 1);
  }, []);

  // Memoized so consumers of usePermissions() only see a new context value
  // when one of these actually changes, instead of on every
  // PermissionsProvider render (all the function fields are already stable
  // via useCallback above, so this memo only recomputes on real changes).
  const value = useMemo(
    () => ({
      permissions,
      loading,
      isSystemAdmin,
      hasPermission,
      hasAnyPermission,
      hasModuleAccess,
      refreshPermissions,
    }),
    [permissions, loading, isSystemAdmin, hasPermission, hasAnyPermission, hasModuleAccess, refreshPermissions],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
