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

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <OlyviaLoader size={40} />
    </div>
  );
}

/**
 * Layout route — wraps all client portal routes.
 * Entry is allowed to portal-only clients and to hybrid (CRM + client) users
 * who chose the portal context at login. A hybrid who has not chosen yet is
 * sent to the context picker.
 */
export function ClientRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, portalAllowed, needsContextChoice, loading } = useClientRole();

  if (loading) return <LoadingScreen />;
  if (accessKind === "anonymous") return <Navigate to="/auth" replace />;
  if (accessKind === "no_profile") return <NoProfileScreen />;
  if (needsContextChoice) return <Navigate to="/escolher-acesso" replace />;
  if (!portalAllowed) return <Navigate to="/dashboard" replace />;

  return <>{children ?? <Outlet />}</>;
}

/**
 * Layout route — wraps all CRM routes.
 * Entry is allowed to CRM users and to hybrid users who chose the CRM context.
 * A hybrid who chose the portal is redirected there; one who has not chosen is
 * sent to the context picker.
 */
export function CrmRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, crmAllowed, portalAllowed, needsContextChoice, loading } = useClientRole();

  if (loading) return <LoadingScreen />;
  if (accessKind === "anonymous") return <Navigate to="/auth" replace />;
  if (accessKind === "no_profile") return <NoProfileScreen />;
  if (needsContextChoice) return <Navigate to="/escolher-acesso" replace />;

  if (!crmAllowed) {
    return <Navigate to={portalAllowed ? "/client-portal" : "/auth"} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
