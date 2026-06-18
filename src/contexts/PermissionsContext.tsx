import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
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

  const isSystemAdmin = userType === "system_admin";
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
        if (!session?.user) { setPermissions([]); setPermissionSet(new Set()); return; }

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
        const { data: rawCtx, error: ctxError } = await (supabase as any).rpc("get_user_context");
        const ctx = rawCtx as UserContextRpcResult | null;
        if (version !== versionRef.current) return;
        if (ctxError) {
          console.error("get_user_context RPC error:", ctxError);
          setPermissions([]); setPermissionSet(new Set());
          return;
        }

        if (!ctx || !ctx.business_user_id) {
          setPermissions([]); setPermissionSet(new Set());
          return;
        }

        // System admin bypass (RPC already returns ["*"] in this case, but keep userType-based bypass for parity)
        if (ctx.is_system_admin || userType === "system_admin" || userType === "super_admin") {
          setPermissions(["*"]);
          setPermissionSet(new Set(["*"]));
          permissionsCache.set(cacheKey, { permissions: ["*"], timestamp: Date.now() });
          return;
        }

        const permissionsList: string[] = Array.isArray(ctx.permissions) ? ctx.permissions : [];
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
    if (permissionSet.has("*")) return true;
    return permissionSetHas(permissionSet, permissionCode);
  }, [isSystemAdmin, permissionSet]);

  const hasAnyPermission = useCallback((permissionCodes: string[]): boolean => {
    if (isSystemAdmin) return true;
    if (permissionSet.has("*")) return true;
    return permissionCodes.some(code => permissionSetHas(permissionSet, code));
  }, [isSystemAdmin, permissionSet]);

  const hasModuleAccess = useCallback((module: string): boolean => {
    if (isSystemAdmin) return true;
    if (permissionSet.has("*")) return true;
    for (const p of permissionSet) {
      if (p.startsWith(module)) return true;
    }
    return false;
  }, [isSystemAdmin, permissionSet]);

  const refreshPermissions = useCallback(() => {
    permissionsCache.clear();
    setRefreshCounter(c => c + 1);
  }, []);

  return (
    <PermissionsContext.Provider value={{
      permissions,
      loading,
      isSystemAdmin,
      hasPermission,
      hasAnyPermission,
      hasModuleAccess,
      refreshPermissions,
    }}>
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
