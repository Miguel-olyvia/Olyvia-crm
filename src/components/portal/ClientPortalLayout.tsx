import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, FileText, ScrollText, FolderOpen, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { FirstLoginModal } from "@/components/portal/FirstLoginModal";
import { useToast } from "@/hooks/use-toast";

interface ClientPortalLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Início", icon: Home, path: "/client-portal", matchPaths: ["/client-portal"], badgeKey: null },
  { label: "Propostas", icon: FileText, path: "/client-portal/proposals", matchPaths: ["/client-portal/proposals"], badgeKey: "proposals" as const },
  { label: "Contratos", icon: ScrollText, path: "/client-portal/contracts", matchPaths: ["/client-portal/contracts"], badgeKey: "contracts" as const },
  { label: "Documentos", icon: FolderOpen, path: "/client-portal/documents", matchPaths: ["/client-portal/documents"], badgeKey: null },
];

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [showFirstLogin, setShowFirstLogin] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<{ proposals: number; contracts: number }>({ proposals: 0, contracts: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load(user: { id: string; email?: string | null; user_metadata?: any }) {
      if (cancelled) return;
      setUserName(user.user_metadata?.full_name || user.email || "");

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("organization_id, first_login, proposal_id, contract_id, entity_id")
        .eq("auth_user_id", user.id);
      if (cancelled) return;

      if (portalUser && portalUser.length > 0) {
        const firstRecord = portalUser[0];
        if (firstRecord.first_login) {
          setShowFirstLogin(true);
        }

        const { data: org } = await supabase
          .from("anew_organizations")
          .select("name, logo_url")
          .eq("id", firstRecord.organization_id)
          .maybeSingle();
        if (cancelled) return;

        if (org) {
          setOrgName(org.name || "");
          setOrgLogo(org.logo_url);
        }

        const proposalIdSet = new Set<string>(
          portalUser.filter(p => p.proposal_id).map(p => p.proposal_id!)
        );
        const contractIdSet = new Set<string>(
          portalUser.filter(p => p.contract_id).map(p => p.contract_id!)
        );

        const entityPairs = portalUser
          .filter(p => p.entity_id && p.organization_id)
          .map(p => ({ entity_id: p.entity_id!, organization_id: p.organization_id! }));

        if (entityPairs.length > 0) {
          const entityIds = Array.from(new Set(entityPairs.map(e => e.entity_id)));
          const orgIds = Array.from(new Set(entityPairs.map(e => e.organization_id)));

          const [propsEnt, contractsEnt] = await Promise.all([
            supabase.from("proposals").select("id, entity_id, organization_id")
              .in("entity_id", entityIds).in("organization_id", orgIds),
            supabase.from("client_contracts").select("id, entity_id, organization_id")
              .in("entity_id", entityIds).in("organization_id", orgIds),
          ]);
          if (cancelled) return;

          const pairKey = (e: string, o: string) => `${e}::${o}`;
          const allowed = new Set(entityPairs.map(p => pairKey(p.entity_id, p.organization_id)));

          (propsEnt.data || []).forEach((r: any) => {
            if (r.entity_id && r.organization_id && allowed.has(pairKey(r.entity_id, r.organization_id))) {
              proposalIdSet.add(r.id);
            }
          });
          (contractsEnt.data || []).forEach((r: any) => {
            if (r.entity_id && r.organization_id && allowed.has(pairKey(r.entity_id, r.organization_id))) {
              contractIdSet.add(r.id);
            }
          });
        }

        const proposalIds = Array.from(proposalIdSet);
        const contractIds = Array.from(contractIdSet);

        let pendingProposals = 0;
        let pendingContracts = 0;

        if (proposalIds.length > 0) {
          const { data: props } = await supabase
            .from("proposals")
            .select("id, status")
            .in("id", proposalIds)
            .in("status", ["sent", "pending"]);
          if (cancelled) return;
          pendingProposals = props?.length || 0;
        }

        if (contractIds.length > 0) {
          const { data: conts } = await supabase
            .from("client_contracts")
            .select("id, status")
            .in("id", contractIds)
            .in("status", ["sent", "pending"]);
          if (cancelled) return;
          pendingContracts = conts?.length || 0;
        }

        if (cancelled) return;
        setBadgeCounts({ proposals: pendingProposals, contracts: pendingContracts });
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session?.user) { navigate("/auth"); return; }
      void load(session.user);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) { navigate("/auth"); return; }
      void load(session.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };
  const { toast } = useToast();

  const handlePasswordChanged = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Sessão expirada", description: "Volte a iniciar sessão.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("client_portal_users")
      .update({ first_login: false, password_changed_at: new Date().toISOString() })
      .eq("auth_user_id", user.id);
    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível confirmar a alteração da palavra-passe. Tente novamente.",
        variant: "destructive",
      });
      return; // keep modal open
    }
    setShowFirstLogin(false);
  };

  const initials = getInitials(userName);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F8F7FC" }}>
      {/* Top Bar */}
      <header className="border-b bg-white px-4 md:px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {orgLogo ? (
            <img src={orgLogo} alt={orgName} className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: "#7C3AED" }}>
              {orgName?.charAt(0) || "O"}
            </div>
          )}
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-foreground leading-tight">{orgName}</p>
            <p className="text-[11px] font-medium" style={{ color: "#7C3AED" }}>Portal do Cliente</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: "#7C3AED" }}
            >
              {initials || "?"}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-foreground leading-tight">{userName}</p>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cliente</p>
            </div>
          </div>
          <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Sair</span>
          </Button>
        </div>
      </header>

      {/* Horizontal Nav */}
      <nav className="border-b bg-white px-4 md:px-6">
        <div className="flex gap-0.5 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.matchPaths?.some(p => location.pathname === p) || (item.path !== "/client-portal" && location.pathname.startsWith(item.path));
            const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap relative",
                  isActive
                    ? "border-[#7C3AED] text-[#7C3AED]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {badgeCount > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white px-4 md:px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          {orgName && <span className="font-medium">{orgName}</span>}
          {orgName && " · "}
          Portal do Cliente
        </p>
      </footer>

      {/* First Login Modal */}
      <FirstLoginModal open={showFirstLogin} onPasswordChanged={handlePasswordChanged} />
    </div>
  );
}
