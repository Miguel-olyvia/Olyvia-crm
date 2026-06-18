import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

interface PermissionGateProps {
  /** Single permission to check */
  permission?: string;
  /** Multiple permissions - user must have at least one */
  permissions?: string[];
  /** Require ALL permissions instead of ANY */
  requireAll?: boolean;
  /** Content to render when user has permission */
  children: ReactNode;
  /** Optional fallback content when user lacks permission */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on user permissions.
 * 
 * Usage:
 * ```tsx
 * <PermissionGate permission="quotes.create">
 *   <Button>New Quote</Button>
 * </PermissionGate>
 * 
 * <PermissionGate permissions={["quotes.edit", "quotes.delete"]} requireAll>
 *   <AdminPanel />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, loading, permissions: userPermissions, isSystemAdmin } = usePermissions();

  // While loading, render fallback (or nothing)
  if (loading) {
    return <>{fallback}</>;
  }

  // System admin always has access - bypass all permission checks
  if (isSystemAdmin) {
    return <>{children}</>;
  }

  let hasAccess = false;

  if (permission) {
    // Single permission check
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    if (requireAll) {
      // Must have ALL permissions
      hasAccess = permissions.every((p) => userPermissions.includes(p));
    } else {
      // Must have ANY permission
      hasAccess = hasAnyPermission(permissions);
    }
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
