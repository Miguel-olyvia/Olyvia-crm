import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, FileText, ScrollText, FolderOpen, Home, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { FirstLoginModal } from "@/components/portal/FirstLoginModal";
import { PortalCompanySwitcher } from "@/components/portal/PortalCompanySwitcher";
import { PORTAL_ORGS_QUERY_KEY, usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ClientPortalLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Início", icon: Home, path: "/client-portal", matchPaths: ["/client-portal"], badgeKey: null },
  { label: "Propostas", icon: FileText, path: "/client-portal/proposals", matchPaths: ["/client-portal/proposals"], badgeKey: "proposals" as const },
  { label: "Vendas Diretas", icon: Receipt, path: "/client-portal/direct-sales", matchPaths: ["/client-portal/direct-sales"], badgeKey: "directSales" as const },
  { label: "Contratos", icon: ScrollText, path: "/client-portal/contracts", matchPaths: ["/client-portal/contracts"], badgeKey: "contracts" as const },
  { label: "Documentos", icon: FolderOpen, path: "/client-portal/documents", matchPaths: ["/client-portal/documents"], badgeKey: null },
];

// Quem já mudou a palavra-passe nesta aba, POR UTILIZADOR.
//
// Âmbito de módulo e não `useRef` porque este layout é remontado a cada
// navegação entre páginas do portal: um ref voltaria a zero e o modal de
// primeiro login — que é não-dispensável — podia reabrir depois de a
// palavra-passe já ter sido mudada, se o cliente clicasse noutro separador
// antes do refetch (ou se este falhasse).
//
// Guardar o `user.id` em vez de um booleano é o que impede o buraco: logout de
// A + login de B na mesma aba (tudo navegação de SPA, o módulo nunca é
// reavaliado) deixaria B sem modal, com a palavra-passe temporária do email.
// Cobre pela mesma via a expiração de sessão, o logout noutra aba e a
// reemissão de acesso com `force_new_password` (que volta a pôr
// first_login = true).
let passwordChangedForUserId: string | null = null;

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
  // Empresa ativa do portal — branding e contagens seguem-na. Antes o
  // cabeçalho usava a primeira linha devolvida por client_portal_users (sem
  // `order by`, logo não determinística) e as contagens somavam todas as
  // empresas do grupo. Ver src/contexts/PortalCompanyContext.tsx.
  const { activeOrg, portalOrgs, hasMultiple, isLoading: orgsLoading } = usePortalCompany();
  const queryClient = useQueryClient();
  const [userName, setUserName] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showFirstLogin, setShowFirstLogin] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<{ proposals: number; contracts: number; directSales: number }>({ proposals: 0, contracts: 0, directSales: 0 });

  const orgName = activeOrg?.name || "";
  const orgLogo = activeOrg?.logoUrl ?? null;

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session?.user) { setCurrentUserId(null); navigate("/auth"); return; }
      setCurrentUserId(session.user.id);
      setUserName(session.user.user_metadata?.full_name || session.user.email || "");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) { setCurrentUserId(null); navigate("/auth"); return; }
      setCurrentUserId(session.user.id);
      setUserName(session.user.user_metadata?.full_name || session.user.email || "");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // A palavra-passe é da conta, não da empresa: basta uma das linhas de portal
  // ter first_login para o cliente ter de a mudar (e o handlePasswordChanged
  // limpa a marca em todas).
  useEffect(() => {
    // Só salta o modal para a conta que mudou mesmo a palavra-passe nesta aba.
    if (currentUserId && passwordChangedForUserId === currentUserId) return;
    if (portalOrgs.some(o => o.firstLogin)) setShowFirstLogin(true);
  }, [portalOrgs, currentUserId]);

  useEffect(() => {
    if (!activeOrg) return;
    let cancelled = false;

    async function loadBadges(org: PortalOrg) {
      // Zerar antes de recontar: ao trocar de empresa não podem ficar à vista
      // os números da anterior.
      setBadgeCounts({ proposals: 0, contracts: 0, directSales: 0 });

      // Colunas legadas da linha desta empresa (só guardam o último documento
      // partilhado por esse canal) + tudo o que casa com o par
      // (organização, entidade).
      const proposalIdSet = new Set<string>();
      const contractIdSet = new Set<string>();
      if (org.proposalId) proposalIdSet.add(org.proposalId);
      if (org.contractId) contractIdSet.add(org.contractId);

      if (org.entityId) {
        const [propsEnt, contractsEnt] = await Promise.all([
          supabase.from("proposals").select("id")
            .eq("organization_id", org.organizationId).eq("entity_id", org.entityId),
          supabase.from("client_contracts").select("id")
            .eq("organization_id", org.organizationId).eq("entity_id", org.entityId),
        ]);
        if (cancelled) return;

        (propsEnt.data || []).forEach((r: any) => proposalIdSet.add(r.id));
        (contractsEnt.data || []).forEach((r: any) => contractIdSet.add(r.id));
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
      setBadgeCounts(prev => ({ ...prev, proposals: pendingProposals, contracts: pendingContracts }));

      // Venda Direta — contagem estritamente aditiva: corre DEPOIS de as
      // contagens de propostas/contratos já estarem no estado e atualiza só a
      // sua chave. Qualquer falha aqui (query, RLS, coluna em falta) deixa as
      // outras duas intactas — é o motivo do try/catch e do setState
      // funcional.
      //
      // Sem filtro por client_portal_users.direct_sale_id: essa coluna guarda
      // apenas a ÚLTIMA venda direta partilhada com a conta de portal
      // (create-client-portal-access faz update da mesma linha), por isso
      // esconderia as anteriores. O âmbito real vem da RLS "Client can view
      // own direct sale" (via client_portal_documents); o filtro pelo par
      // (organização, entidade) abaixo é só para estreitar a query, mesmo
      // padrão das propostas.
      //
      // `(supabase as any)`: direct_sales ainda não existe em
      // src/integrations/supabase/types.ts.
      try {
        if (org.entityId) {
          const { data: directSales } = await (supabase as any)
            .from("direct_sales")
            .select("id")
            .eq("organization_id", org.organizationId)
            .eq("entity_id", org.entityId)
            .eq("status", "enviada");
          if (cancelled) return;
          setBadgeCounts(prev => ({ ...prev, directSales: (directSales as any[] | null)?.length || 0 }));
        }
      } catch {
        // contagem opcional — nunca deve afetar o resto do portal
      }
    }

    void loadBadges(activeOrg);

    return () => { cancelled = true; };
  }, [activeOrg]);

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
    // A marca first_login acabou de mudar na BD. Escrever na cache é SÍNCRONO e
    // é o que impede a reabertura do modal: o invalidateQueries é
    // fire-and-forget e o layout remonta a cada navegação. O sinalizador por
    // utilizador é o cinto de segurança para o caso de o refetch falhar.
    //
    // Chave EXATA (com o user.id): só o prefixo escreveria em todas as entradas
    // [portal-orgs, <qualquer userId>] ainda em cache (gcTime de 10 min) e
    // apagaria a marca de primeiro login de outra conta que tivesse usado esta
    // aba.
    passwordChangedForUserId = user.id;
    queryClient.setQueryData<PortalOrg[]>(
      [PORTAL_ORGS_QUERY_KEY, user.id],
      (old) => (old ? old.map(o => ({ ...o, firstLogin: false })) : old),
    );
    void queryClient.invalidateQueries({ queryKey: [PORTAL_ORGS_QUERY_KEY, user.id] });
    setShowFirstLogin(false);
  };

  const initials = getInitials(userName);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F8F7FC" }}>
      {/* Top Bar */}
      <header className="border-b bg-white px-4 md:px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {/* Sem empresa resolvida (a carregar ou falha da query) não se inventa
              branding: o "O" genérico do placeholder dava a entender que estava
              tudo bem. */}
          {activeOrg && (orgLogo ? (
            <img src={orgLogo} alt={orgName} width={36} height={36} className="h-9 w-9 rounded-lg object-contain shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: "#7C3AED" }}>
              {orgName?.charAt(0) || "O"}
            </div>
          ))}
          {/* Com acesso a mais do que uma empresa, o nome passa a ser o botão
              do seletor (visível também no telemóvel, onde o bloco estático
              está escondido). Com uma só empresa o seletor devolve null. */}
          <PortalCompanySwitcher />
          {/* `!orgsLoading`: durante o carregamento ainda não se sabe se há uma
              ou várias empresas, e sem ele este bloco renderizava com o nome
              vazio. */}
          {!hasMultiple && !orgsLoading && activeOrg && (
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate">{orgName}</p>
              <p className="text-[11px] font-medium" style={{ color: "#7C3AED" }}>Portal do Cliente</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
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
