import { ReactNode } from "react";
import { usePermissionScope } from '@/hooks/usePermissionScope';
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
  /** OR-logic (default) or AND-logic (with requireAll): permissions the user needs */
  permissions?: string[];
  /** When `permissions` is set, require ALL of them instead of the default ANY (OR) logic. */
  requireAll?: boolean;
  /**
   * Só administradores (`super_admin` ou `system_admin`) entram.
   *
   * Serve para páginas que ainda não estão prontas para toda a gente. É
   * deliberadamente uma trava de PAPEL e não de permissão: a permissão que
   * guardava a página dos agendamentos guarda também o calendário, o menu e a
   * ação na lista de leads — retirá-la a um papel fechava tudo isso junto.
   */
  adminOnly?: boolean;
  /**
   * Só o administrador de sistema (papel global `system_admin`, o mesmo que
   * `is_system_admin` / `requireAdminRole` no servidor). Para ferramentas da
   * plataforma (importar códigos postais) e páginas de desenvolvimento.
   */
  systemAdminOnly?: boolean;
  /**
   * Sem empresa ativa, deixa entrar: é o caminho de quem acabou de criar a conta e ainda vai registar a primeira
   * organização (o servidor aceita-o por user_can_self_register_first_org). Sem empresa não há permissões, e sem
   * organizações visíveis a RLS não devolve nada de ninguém.
   */
  allowWithoutCompany?: boolean;
  /** The page component to render if access is granted */
  children: ReactNode;
}

/**
 * Route-level permission guard.
 * Wraps a page component and blocks access if the user lacks the required permission.
 * Shows a localized "Access Denied" page inside the Layout shell.
 */
export function ProtectedRoute({ permission, permissions, requireAll = false, adminOnly, systemAdminOnly, allowWithoutCompany, children }: ProtectedRouteProps) {
  const { hasPermission, hasAnyPermission, isSystemAdmin, loading: permissionsLoading } = usePermissions();
  const { anewRoleCode, loading: scopeLoading } = usePermissionScope();
  const { isLoading: companyLoading, activeCompany } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Wait until BOTH company context and permissions are fully resolved
  if (permissionsLoading || companyLoading || (adminOnly && scopeLoading)) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-8">
          <OlyviaLoader size={40} />
        </div>
      </Layout>
    );
  }

  // Check access
  let hasAccess = true;
  if (systemAdminOnly) {
    hasAccess = isSystemAdmin === true;
  } else if (allowWithoutCompany && !activeCompany) {
    hasAccess = true;
  } else if (adminOnly) {
    hasAccess = anewRoleCode === 'super_admin' || anewRoleCode === 'system_admin';
  } else if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? permissions.every((p) => hasPermission(p))
      : hasAnyPermission(permissions);
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
