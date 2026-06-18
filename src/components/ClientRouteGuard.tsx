import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useClientRole } from "@/hooks/useClientRole";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

function NoProfileScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3 max-w-sm mx-4">
        <p className="text-lg font-semibold text-foreground">Perfil não encontrado</p>
        <p className="text-sm text-muted-foreground">
          A sua conta ainda não foi configurada. Contacte o administrador.
        </p>
      </div>
    </div>
  );
}

/**
 * Layout route — wraps all client portal routes.
 * Only portal-only client users can enter; hybrid CRM+client users stay in CRM.
 */
export function ClientRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, isClientOnly, loading } = useClientRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (accessKind === "anonymous") {
    return <Navigate to="/auth" replace />;
  }

  if (accessKind === "no_profile") {
    return <NoProfileScreen />;
  }

  if (!isClientOnly) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/**
 * Layout route — wraps all CRM routes.
 * Only portal-only client users are redirected to /client-portal.
 * Hybrid CRM+client users keep CRM access.
 */
export function CrmRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, isClientOnly, isCrmAllowed, loading } = useClientRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (accessKind === "anonymous") {
    return <Navigate to="/auth" replace />;
  }

  if (accessKind === "no_profile") {
    return <NoProfileScreen />;
  }

  if (isClientOnly) {
    return <Navigate to="/client-portal" replace />;
  }

  if (!isCrmAllowed) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
