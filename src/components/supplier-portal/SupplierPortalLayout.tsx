import { Suspense, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Building2, ClipboardList, Home, LogOut, Package, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClientSupplierSwitch } from "@/hooks/useClientRole";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { cn } from "@/lib/utils";
import { SupplierPortalProvider, useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { SupplierFirstLoginModal } from "@/components/supplier-portal/SupplierFirstLoginModal";
import { useSpOrdersToConfirm } from "@/components/supplier-portal/useSpOrdersToConfirm";

const NAV_ITEMS = [
  { label: "Início", icon: Home, path: "/supplier-portal", end: true, badge: false },
  { label: "Encomendas", icon: ClipboardList, path: "/supplier-portal/orders", end: false, badge: true },
  { label: "Catálogo", icon: Package, path: "/supplier-portal/catalog", end: false, badge: false },
];

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <OlyviaLoader size={40} />
      <span className="sr-only">A carregar…</span>
    </div>
  );
}

function useLogout() {
  const navigate = useNavigate();
  return async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };
}

/**
 * Só para contas client_supplier (cliente do portal que é também fornecedor):
 * guarda a escolha e passa para o Portal do Cliente. Não aparece para mais
 * nenhum tipo de conta.
 */
function SwitchToClientPortalButton({ className, compact }: { className?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const { available, switchTo } = useClientSupplierSwitch();
  if (!available) return null;
  return (
    <Button
      variant="outline"
      onClick={() => navigate(switchTo("portal"))}
      className={cn("h-11 min-w-11 gap-1.5", className)}
      aria-label="Mudar para Portal do Cliente"
      title="Mudar para Portal do Cliente"
    >
      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      <span className={cn("text-sm", compact && "hidden md:inline")}>Mudar para Portal do Cliente</span>
    </Button>
  );
}

function NoActiveAccessScreen({ email }: { email: string | null }) {
  const logout = useLogout();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Sem acesso ativo</h1>
        <p className="text-sm text-muted-foreground">
          A sua conta não tem nenhum acesso ativo ao portal. Contacte a empresa que o convidou.
        </p>
        {email && <p className="text-xs text-muted-foreground break-all">Sessão iniciada como {email}</p>}
        <SwitchToClientPortalButton className="w-full" />
        <Button className="w-full h-11 gap-2" variant="outline" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </Button>
      </div>
    </div>
  );
}

/** sp_whoami falhou (rede/JWT): não se sabe se há acesso — nunca "Sem acesso ativo". */
function LoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  const logout = useLogout();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-4" role="alert">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar o portal</h1>
        <p className="text-sm text-muted-foreground">
          Verifique a ligação à internet e tente de novo.
        </p>
        <Button className="w-full h-11 gap-2" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar de novo
        </Button>
        <SwitchToClientPortalButton className="w-full" />
        <Button className="w-full h-11 gap-2" variant="outline" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </Button>
      </div>
    </div>
  );
}

export function SupplierPortalLayout({ children }: { children: ReactNode }) {
  const { loading, loadError, active, account, user, companies, firstLogin, markPasswordChanged, refresh } =
    useSupplierPortal();
  const logout = useLogout();
  const { count: toConfirm } = useSpOrdersToConfirm();

  if (loading) return <FullScreenLoader />;
  if (loadError) return <LoadErrorScreen onRetry={() => void refresh()} />;
  if (!active || !account) return <NoActiveAccessScreen email={user?.email ?? null} />;

  const userLabel = user?.name || user?.email || "";
  const companiesLabel = companies.map((c) => c.name).join(", ");

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background px-4 md:px-6 py-2 flex items-center justify-between gap-3 shrink-0 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm sm:text-base font-semibold text-foreground leading-tight truncate" title={account.display_name}>
            {account.display_name}
          </p>
          <p className="text-[11px] font-medium text-primary leading-tight">Portal do Fornecedor</p>
          {companiesLabel && (
            <p className="hidden md:block text-[11px] text-muted-foreground truncate max-w-[40ch]" title={companiesLabel}>
              Clientes: {companiesLabel}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block text-right min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight truncate max-w-[24ch]" title={userLabel}>
              {userLabel}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {user?.role === "owner" ? "Utilizador principal" : "Consulta"}
            </p>
          </div>
          <SwitchToClientPortalButton compact />
          <Button
            variant="outline"
            onClick={() => void logout()}
            className="h-11 min-w-11 gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline text-sm">Sair</span>
          </Button>
        </div>
      </header>

      <nav className="border-b bg-background px-2 md:px-6" aria-label="Portal do Fornecedor">
        <div className="flex gap-0.5 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-4 h-11 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.badge && !!toConfirm && toConfirm > 0 && (
                <span
                  className="ml-0.5 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
                  aria-label={`${toConfirm} por confirmar`}
                >
                  {toConfirm > 99 ? "99+" : toConfirm}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6">{children}</main>

      <footer className="border-t bg-background px-4 md:px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{account.display_name}</span> · Portal do Fornecedor
        </p>
      </footer>

      <SupplierFirstLoginModal open={firstLogin} onDone={markPasswordChanged} />
    </div>
  );
}

const PageLoader = () => (
  <div className="py-16 flex items-center justify-center" role="status" aria-live="polite">
    <OlyviaLoader size={32} />
    <span className="sr-only">A carregar…</span>
  </div>
);

/**
 * Montado uma só vez para todas as rotas /supplier-portal/* (lazy em App.tsx):
 * contexto (sp_whoami/sp_my_companies) + layout + páginas via Outlet.
 * O Suspense interno evita desmontar o layout ao carregar cada página.
 */
export default function SupplierPortalShell() {
  return (
    <SupplierPortalProvider>
      <SupplierPortalLayout>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </SupplierPortalLayout>
    </SupplierPortalProvider>
  );
}
