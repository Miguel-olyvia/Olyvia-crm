import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Truck, UserRound } from "lucide-react";
import {
  clientSupplierHome,
  useClientRole,
  type ClientSupplierSurface,
  type SessionContext,
} from "@/hooks/useClientRole";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

/**
 * Context picker (Option 2). Shown only to a hybrid account — one that holds
 * both a CRM (internal) membership and a client (portal) membership on the same
 * login. The person chooses which surface to enter; the choice is stored and
 * the route guards route accordingly.
 *
 * This is a UX router, not a security boundary: the real data isolation is the
 * per-request RLS/route guards enforced by the account's actual roles. The
 * picker only decides which interface to show a user who legitimately has both.
 */
export default function ChooseAccess() {
  const navigate = useNavigate();
  const {
    accessKind,
    loading,
    needsContextChoice,
    activeContext,
    chooseContext,
    isClientSupplier,
    clientSupplierSurface,
    chooseClientSupplierSurface,
  } = useClientRole();

  // client_supplier sem escolha guardada → mostra a escolha Cliente/Fornecedor.
  const needsSupplierChoice = isClientSupplier && clientSupplierSurface === null;

  useEffect(() => {
    if (loading) return;
    if (accessKind === "anonymous") {
      navigate("/auth", { replace: true });
      return;
    }
    // Conta do portal do fornecedor: tem uma só superfície.
    if (accessKind === "supplier_only") {
      navigate("/supplier-portal", { replace: true });
      return;
    }
    // Cliente + fornecedor: com escolha guardada vai direto; sem ela, fica aqui.
    if (accessKind === "client_supplier") {
      if (clientSupplierSurface) navigate(clientSupplierHome(clientSupplierSurface), { replace: true });
      return;
    }
    // Not a hybrid needing a choice → send them where they belong.
    if (!needsContextChoice && accessKind !== "no_profile") {
      navigate(activeContext === "portal" ? "/client-portal" : "/home", { replace: true });
    }
  }, [loading, accessKind, needsContextChoice, activeContext, clientSupplierSurface, navigate]);

  const pick = (ctx: SessionContext) => {
    chooseContext(ctx);
    navigate(ctx === "portal" ? "/client-portal" : "/home", { replace: true });
  };

  const pickSupplierSurface = (surface: ClientSupplierSurface) => {
    chooseClientSupplierSurface(surface);
    navigate(clientSupplierHome(surface), { replace: true });
  };

  if (needsSupplierChoice && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Como quer entrar?</h1>
            <p className="text-sm text-muted-foreground">
              A sua conta tem acesso ao portal do cliente e ao portal do fornecedor. Escolha onde
              entrar agora — pode mudar a qualquer momento no menu do portal.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => pickSupplierSurface("portal")}
              className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="space-y-1">
                <span className="block font-semibold text-foreground">Portal do Cliente</span>
                <span className="block text-sm text-muted-foreground">
                  Propostas, contratos e documentos.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => pickSupplierSurface("supplier")}
              className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="space-y-1">
                <span className="block font-semibold text-foreground">Portal do Fornecedor</span>
                <span className="block text-sm text-muted-foreground">
                  Catálogo de artigos e empresas clientes.
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || (!needsContextChoice && accessKind !== "no_profile")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (accessKind === "no_profile") {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Como quer entrar?</h1>
          <p className="text-sm text-muted-foreground">
            A sua conta tem acesso de equipa e de cliente. Escolha onde entrar agora — pode
            trocar mais tarde saindo e voltando a entrar.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => pick("crm")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="space-y-1">
              <span className="block font-semibold text-foreground">Equipa</span>
              <span className="block text-sm text-muted-foreground">
                Entrar na plataforma da empresa (CRM).
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => pick("portal")}
            className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserRound className="h-5 w-5" />
            </span>
            <span className="space-y-1">
              <span className="block font-semibold text-foreground">Cliente</span>
              <span className="block text-sm text-muted-foreground">
                Entrar no portal do cliente.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
