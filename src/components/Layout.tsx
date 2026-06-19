import { ReactNode, useState, useEffect, memo, useMemo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopHeader } from "@/components/TopHeader";

import { InternalChatWidget } from "@/components/chat/InternalChatWidget";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { useSidebarExpand } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children?: ReactNode;
  fullWidth?: boolean;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const Layout = ({ children, fullWidth = false }: LayoutProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userType: contextUserType } = useCompany();
  const [userName, setUserName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Idle timeout — auto logout after 30 min inactivity
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        console.log("[Layout] Idle timeout reached, signing out");
        await supabase.auth.signOut();
        navigate("/auth", { replace: true });
      }, IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [navigate]);

  const typeTranslationKeys: Record<string, string> = {
    system_admin: "users.form.systemAdmin",
    tenant_admin: "users.form.tenantAdmin",
    company_admin: "users.form.companyAdmin",
    business_unit_admin: "users.form.businessUnitAdmin",
    department_admin: "users.form.departmentAdmin",
    worker_user: "users.form.workerUser",
  };

  const translationKey = typeTranslationKeys[contextUserType];
  const displayRole = translationKey ? t(translationKey) : contextUserType;

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.warn("[Layout] Session error; signing out.", error);
        await supabase.auth.signOut();
      }

      if (!session) {
        console.log("[Layout] No session found, redirecting to auth");
        navigate("/auth", { replace: true });
        return;
      }

      const { data: anewUser } = await (supabase as any)
        .from("anew_users")
        .select("name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (anewUser) {
        setUserName(anewUser.name);
      }
      setIsLoading(false);
    };

    loadUserData();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground text-sm">A carregar...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <LayoutContent userName={userName} displayRole={displayRole} fullWidth={fullWidth}>
        {children ?? <Outlet />}
      </LayoutContent>
    </SidebarProvider>
  );
};

export { Layout as LayoutRoute };

// Pages that don't require an active organization
const NO_ORG_EXEMPT_ROUTES = [
  "/organizations", "/org-templates", "/org-chart", "/org-help",
  "/home", "/dashboard", "/settings", "/auth", "/welcome-guide",
  "/notifications", "/flow-builder",
];

const LayoutContent = memo(function LayoutContent({
  children,
  userName,
  displayRole,
  fullWidth = false,
}: {
  children: ReactNode;
  userName: string;
  displayRole: string;
  fullWidth?: boolean;
}) {
  const { isSubmenuOpen } = useSidebarExpand();
  const { activeCompany } = useCompany();
  const location = useLocation();

  // Total sidebar width: icon rail (64px) + submenu panel (256px) when open
  const sidebarWidth = isSubmenuOpen ? "md:ml-80" : "md:ml-16";

  // Check if current route requires an organization
  const isExemptRoute = NO_ORG_EXEMPT_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + "/"));
  const showNoOrgState = !activeCompany && !isExemptRoute;

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* Top Header - Fixed */}
      <TopHeader userName={userName} userRole={displayRole} />

      {/* Spacer for fixed header */}
      <div className="h-14 shrink-0" />

      {/* Desktop Sidebar - fixed, renders on top */}
      <div className="hidden md:block">
        <AppSidebar userName={userName} userRole={displayRole} />
      </div>

      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild className="md:hidden fixed bottom-4 left-4 z-50">
          <Button variant="outline" size="icon">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <AppSidebar userName={userName} userRole={displayRole} />
        </SheetContent>
      </Sheet>

      {/* Main Content - fixed, left edge shifts with sidebar */}
      <main className={cn(
        "fixed top-14 right-0 bottom-0 left-0 overflow-auto bg-background transition-[left] duration-300",
        isSubmenuOpen ? "md:left-80" : "md:left-16"
      )}>
        {fullWidth ? (
          showNoOrgState ? (
            <div className="p-6 md:p-8"><NoOrganizationState /></div>
          ) : (
            <div className="h-full flex flex-col px-6 md:px-11">{children}</div>
          )
        ) : (
          <div className="container mx-auto p-6 md:p-8">
            {showNoOrgState ? <NoOrganizationState /> : children}
          </div>
        )}
      </main>

      {/* Chat Widget */}
      <InternalChatWidget />
    </div>
  );
});

export default Layout;
