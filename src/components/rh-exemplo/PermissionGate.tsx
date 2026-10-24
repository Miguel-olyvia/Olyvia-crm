import { ReactNode } from "react";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";

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
  const { hasPermission, hasAnyPermission, loading } = usePermissions();

  // While loading, render fallback (or nothing)
  if (loading) {
    return <>{fallback}</>;
  }

  let hasAccess = false;

  if (permission) {
    // Single permission check
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    if (requireAll) {
      // Must have ALL permissions
      hasAccess = permissions.every((p) => hasPermission(p));
    } else {
      // Must have ANY permission
      hasAccess = hasAnyPermission(permissions);
    }
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
