import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { clientSupplierHome, useClientRole } from "@/hooks/useClientRole";
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
 * Entry is allowed to portal-only clients, to client_supplier accounts (whatever
 * portal they chose at login — portalAllowed is always true for them) and to
 * hybrid (CRM + client) users who chose the portal context at login. A hybrid
 * who has not chosen yet is sent to the context picker.
 */
export function ClientRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, portalAllowed, needsContextChoice, loading } = useClientRole();

  if (loading) return <LoadingScreen />;
  if (accessKind === "anonymous") return <Navigate to="/auth" replace />;
  // Conta do portal do fornecedor: nunca entra no portal do cliente.
  if (accessKind === "supplier_only") return <Navigate to="/supplier-portal" replace />;
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
  const { accessKind, crmAllowed, portalAllowed, needsContextChoice, clientSupplierSurface, loading } =
    useClientRole();

  if (loading) return <LoadingScreen />;
  if (accessKind === "anonymous") return <Navigate to="/auth" replace />;
  // Conta do portal do fornecedor: nunca entra no CRM (nem no onboarding).
  if (accessKind === "supplier_only") return <Navigate to="/supplier-portal" replace />;
  // Cliente + fornecedor: nunca entra no CRM. Vai para o portal escolhido; sem
  // escolha, para o ecrã de escolha (que não passa por este guard).
  if (accessKind === "client_supplier") {
    return <Navigate to={clientSupplierHome(clientSupplierSurface)} replace />;
  }
  if (accessKind === "no_profile") return <NoProfileScreen />;
  if (needsContextChoice) return <Navigate to="/escolher-acesso" replace />;

  if (!crmAllowed) {
    return <Navigate to={portalAllowed ? "/client-portal" : "/auth"} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

/**
 * Layout route — wraps all supplier portal routes (/supplier-portal/*).
 * Entry is allowed to supplier_only accounts (no anew_users, recognised by
 * sp_whoami) and to client_supplier accounts (portal clients with an active
 * supplier-portal access). Internal users (crm_user/hybrid) and plain portal
 * clients are sent to their own surface; they never see the supplier portal.
 */
export function SupplierRouteGuard({ children }: { children?: ReactNode }) {
  const { accessKind, supplierAllowed, needsContextChoice, loading } = useClientRole();

  if (loading) return <LoadingScreen />;
  if (accessKind === "anonymous") return <Navigate to="/auth" replace />;
  if (accessKind === "no_profile") return <NoProfileScreen />;
  if (accessKind === "client_only") return <Navigate to="/client-portal" replace />;
  if (needsContextChoice) return <Navigate to="/escolher-acesso" replace />;
  if (!supplierAllowed) return <Navigate to="/home" replace />;

  return <>{children ?? <Outlet />}</>;
}
