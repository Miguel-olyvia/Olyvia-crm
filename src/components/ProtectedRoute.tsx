import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import Layout from "@/components/Layout";
import { ShieldAlert } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface ProtectedRouteProps {
  /** The permission code required to view this page (e.g., "organizations.view") */
  permission?: string;
  /** OR-logic: user needs at least one of these permissions */
  permissions?: string[];
  /** The page component to render if access is granted */
  children: ReactNode;
}

/**
 * Route-level permission guard.
 * Wraps a page component and blocks access if the user lacks the required permission.
 * Shows a localized "Access Denied" page inside the Layout shell.
 */
export function ProtectedRoute({ permission, permissions, children }: ProtectedRouteProps) {
  const { hasPermission, hasAnyPermission, isSystemAdmin, loading: permissionsLoading } = usePermissions();
  const { isLoading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Wait until BOTH company context and permissions are fully resolved
  if (permissionsLoading || companyLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8">
          <OlyviaLoader size={40} />
        </div>
      </Layout>
    );
  }

  // System admin always has access — bypass all permission checks
  if (isSystemAdmin) {
    return <>{children}</>;
  }

  // Check access
  let hasAccess = true;
  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = hasAnyPermission(permissions);
  }

  if (!hasAccess) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {t("permissions.accessDenied")}
            </h2>
            <p className="text-muted-foreground">
              {t("permissions.noPageAccess")}
            </p>
            <Button variant="outline" onClick={() => navigate("/home")}>
              {t("permissions.goHome")}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}
