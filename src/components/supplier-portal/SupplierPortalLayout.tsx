import { Suspense, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeftRight, Building2, ClipboardList, FileSignature, Home, IdCard, LogOut, Package, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClientSupplierSwitch } from "@/hooks/useClientRole";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { cn } from "@/lib/utils";
import { SupplierPortalProvider, useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { SupplierFirstLoginModal } from "@/components/supplier-portal/SupplierFirstLoginModal";
import { SupplierConfirmDataModal } from "@/components/supplier-portal/SupplierConfirmDataModal";
import { useSpOrdersToConfirm } from "@/components/supplier-portal/useSpOrdersToConfirm";
import { SpContractPendingBanner, SpContractPendingPrompt } from "@/components/supplier-portal/contract/SpContractPending";
import { SpOrdersSlaBanner } from "@/components/supplier-portal/SpOrdersSlaBanner";
import { useSpContractsList } from "@/components/supplier-portal/contract/useSpContracts";
import { pendingContract } from "@/lib/supplierContracts/portal";
import { PortalLanguageProvider, PortalSeletorIdioma, usePortalT } from "@/portal-i18n";

const NAV_ITEMS = [
  { labelKey: "sp.layout.menu.inicio", icon: Home, path: "/supplier-portal", end: true, badge: false },
  { labelKey: "sp.layout.menu.encomendas", icon: ClipboardList, path: "/supplier-portal/orders", end: false, badge: true },
  { labelKey: "sp.layout.menu.catalogo", icon: Package, path: "/supplier-portal/catalog", end: false, badge: false },
  { labelKey: "sp.layout.menu.contrato", icon: FileSignature, path: "/supplier-portal/contract", end: false, badge: false },
  { labelKey: "sp.layout.menu.meusDados", icon: IdCard, path: "/supplier-portal/profile", end: false, badge: false },
];

function FullScreenLoader() {
  const { t } = usePortalT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
      <OlyviaLoader size={40} />
      <span className="sr-only">{t("sp.layout.aCarregar")}</span>
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
  const { t } = usePortalT();
  const { available, switchTo } = useClientSupplierSwitch();
  if (!available) return null;
  return (
    <Button
      variant="outline"
      onClick={() => navigate(switchTo("portal"))}
      className={cn("h-11 min-w-11 gap-1.5", className)}
      aria-label={t("sp.layout.mudarParaCliente")}
      title={t("sp.layout.mudarParaCliente")}
    >
      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      <span className={cn("text-sm", compact && "hidden md:inline")}>{t("sp.layout.mudarParaCliente")}</span>
    </Button>
  );
}

function NoActiveAccessScreen({ email }: { email: string | null }) {
  const logout = useLogout();
  const { t } = usePortalT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t("sp.layout.semAcesso.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("sp.layout.semAcesso.texto")}</p>
        {email && <p className="text-xs text-muted-foreground break-all">{t("sp.layout.semAcesso.sessao", { email })}</p>}
        <PortalSeletorIdioma compacto />
        <SwitchToClientPortalButton className="w-full" />
        <Button className="w-full h-11 gap-2" variant="outline" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("sp.layout.sair")}
        </Button>
      </div>
    </div>
  );
}

/** sp_whoami falhou (rede/JWT): não se sabe se há acesso — nunca "Sem acesso ativo". */
function LoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  const logout = useLogout();
  const { t } = usePortalT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-4" role="alert">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t("sp.layout.erroCarregar.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("sp.layout.erroCarregar.texto")}</p>
        <PortalSeletorIdioma compacto />
        <Button className="w-full h-11 gap-2" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("sp.erro.tentarDeNovo")}
        </Button>
        <SwitchToClientPortalButton className="w-full" />
        <Button className="w-full h-11 gap-2" variant="outline" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("sp.layout.sair")}
        </Button>
      </div>
    </div>
  );
}

export function SupplierPortalLayout({ children }: { children: ReactNode }) {
  const { loading, loadError, active, account, user, companies, firstLogin, profileConfirmed, markPasswordChanged, refresh } =
    useSupplierPortal();
  const logout = useLogout();
  const { t } = usePortalT();
  const { count: toConfirm } = useSpOrdersToConfirm();
  // Contrato por assinar: só depois da password e da confirmação de dados (um passo de cada vez).
  const contractNoticesOn = !firstLogin && profileConfirmed;
  const { data: contractsList } = useSpContractsList(contractNoticesOn);
  const contractToSign = pendingContract(contractsList)?.can_sign === true;

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
          <p className="text-[11px] font-medium text-primary leading-tight">{t("sp.layout.titulo")}</p>
          {companiesLabel && (
            <p className="hidden md:block text-[11px] text-muted-foreground truncate max-w-[40ch]" title={companiesLabel}>
              {t("sp.layout.clientes", { lista: companiesLabel })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block text-right min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight truncate max-w-[24ch]" title={userLabel}>
              {userLabel}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {user?.role === "owner" ? t("sp.layout.papel.owner") : t("sp.layout.papel.member")}
            </p>
          </div>
          <PortalSeletorIdioma compacto />
          <SwitchToClientPortalButton compact />
          <Button
            variant="outline"
            onClick={() => void logout()}
            className="h-11 min-w-11 gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30"
            aria-label={t("sp.layout.sair")}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline text-sm">{t("sp.layout.sair")}</span>
          </Button>
        </div>
      </header>

      <nav className="border-b bg-background px-2 md:px-6" aria-label={t("sp.layout.titulo")}>
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
              {t(item.labelKey)}
              {item.path === "/supplier-portal/contract" && contractNoticesOn && contractToSign && (
                <span className="ml-0.5 h-2.5 w-2.5 rounded-full bg-primary" aria-label={t("sp.layout.contratoPorAssinar")} role="img" />
              )}
              {item.badge && !!toConfirm && toConfirm > 0 && (
                <span
                  className="ml-0.5 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
                  aria-label={t("sp.layout.porConfirmar", { n: toConfirm })}
                >
                  {toConfirm > 99 ? "99+" : toConfirm}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <SpOrdersSlaBanner />
      <SpContractPendingBanner enabled={contractNoticesOn} />

      <main className="flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6">{children}</main>

      <footer className="border-t bg-background px-4 md:px-6 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{account.display_name}</span> · {t("sp.layout.titulo")}
        </p>
      </footer>

      <SupplierFirstLoginModal open={firstLogin} onDone={markPasswordChanged} />
      {/* Só depois da password: um passo de cada vez. */}
      <SupplierConfirmDataModal open={!firstLogin && !profileConfirmed} />
      <SpContractPendingPrompt enabled={contractNoticesOn} />
    </div>
  );
}

function PageLoader() {
  const { t } = usePortalT();
  return (
    <div className="py-16 flex items-center justify-center" role="status" aria-live="polite">
      <OlyviaLoader size={32} />
      <span className="sr-only">{t("sp.layout.aCarregar")}</span>
    </div>
  );
}

/**
 * Montado uma só vez para todas as rotas /supplier-portal/* (lazy em App.tsx):
 * idioma (<html lang>) + contexto (sp_whoami/sp_my_companies) + layout + páginas via Outlet.
 * O PortalLanguageProvider fica por fora de tudo, por isso cobre as páginas e os ecrãs de erro.
 * O Suspense interno evita desmontar o layout ao carregar cada página.
 */
export default function SupplierPortalShell() {
  return (
    <PortalLanguageProvider>
      <SupplierPortalProvider>
        <SupplierPortalLayout>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </SupplierPortalLayout>
      </SupplierPortalProvider>
    </PortalLanguageProvider>
  );
}
