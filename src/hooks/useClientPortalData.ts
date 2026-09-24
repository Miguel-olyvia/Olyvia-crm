import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolvePortalContractIdsForUsers } from "@/lib/portal/contractAccess";
import { usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";

interface PortalSummary {
  proposalCount: number;
  pendingProposals: number;
  contractCount: number;
  activeContracts: number;
  quoteCount: number;
  pendingQuotes: number;
  documentCount: number;
  pendingActions: Array<{
    id: string;
    type: "proposal" | "contract" | "quote";
    title: string;
    status: string;
    date: string;
  }>;
  commercial: {
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  loading: boolean;
}

export function useClientPortalData() {
  // Resumo da EMPRESA ATIVA do portal. Antes agregava todas as empresas do
  // grupo a que o email tem acesso, o que misturava números de organizações
  // diferentes no mesmo cartão. Ver src/contexts/PortalCompanyContext.tsx.
  const { activeOrg, isLoading: orgsLoading } = usePortalCompany();
  const [data, setData] = useState<PortalSummary>({
    proposalCount: 0,
    pendingProposals: 0,
    contractCount: 0,
    activeContracts: 0,
    quoteCount: 0,
    pendingQuotes: 0,
    documentCount: 0,
    pendingActions: [],
    commercial: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string, org: PortalOrg) {
      try {
        // Só a linha desta empresa: client_portal_users tem UNIQUE
        // (auth_user_id, organization_id), por isso isto é no máximo uma linha.
        const { data: portalUsers } = await supabase
          .from("client_portal_users")
          .select("id, proposal_id, contract_id, quote_id, organization_id, created_by, entity_id")
          .eq("auth_user_id", userId)
          .eq("organization_id", org.organizationId);

        if (cancelled) return;

        if (!portalUsers || portalUsers.length === 0) {
          setData(prev => ({ ...prev, loading: false }));
          return;
        }

        const directProposalIds = [...new Set(portalUsers.map(p => p.proposal_id).filter(Boolean))];
        const quoteIds = portalUsers.filter(p => p.quote_id).map(p => p.quote_id!);

        // Mesma resolução usada pela página "Os Meus Contratos": une a coluna
        // legada `contract_id` com as concessões em `client_portal_documents`.
        // Contar só a coluna legada era o que punha o cartão "Contratos" a 1
        // enquanto a lista mostrava 5. O `orgScope` remove o que pertence a
        // outra empresa do grupo.
        const contractIds = await resolvePortalContractIdsForUsers(portalUsers, {
          organizationId: org.organizationId,
          entityId: org.entityId,
        });
        if (cancelled) return;

        // Filtro pelo PAR (organização, entidade) da empresa ativa. Nunca dois
        // `.in()` independentes: como o entity_id pode diferir entre
        // organizações, isso formaria um produto cartesiano e traria propostas
        // de combinações nunca concedidas.
        let proposals: any[] = [];
        if (org.entityId) {
          const { data: entityProps } = await supabase
            .from("proposals")
            .select("id, title, status, created_at, created_by, deal_id, client_id")
            .eq("organization_id", org.organizationId)
            .eq("entity_id", org.entityId)
            .order("created_at", { ascending: false });
          if (cancelled) return;
          proposals = entityProps || [];
        }

        if (directProposalIds.length > 0) {
          const { data: directProps } = await supabase
            .from("proposals")
            .select("id, title, status, created_at, created_by, deal_id, client_id")
            .in("id", directProposalIds);
          if (cancelled) return;
          proposals = Array.from(new Map([...(proposals || []), ...(directProps || [])].map((p: any) => [p.id, p])).values());
        }

        // Fetch contracts
        let contracts: any[] = [];
        if (contractIds.length > 0) {
          const { data: conts } = await supabase
            .from("client_contracts")
            .select("id, contract_number, status, created_at")
            .in("id", contractIds);
          if (cancelled) return;
          contracts = conts || [];
        }

        // Fetch quotes
        let quotes: any[] = [];
        if (quoteIds.length > 0) {
          const { data: qts } = await supabase
            .from("quotes")
            .select("id, title, quote_number, estado, created_at")
            .in("id", quoteIds)
            .neq("estado", "rascunho")
            .order("created_at", { ascending: false });
          if (cancelled) return;
          quotes = qts || [];
        }

        // Pending actions
        const pendingActions: PortalSummary["pendingActions"] = [];

        proposals.filter(p => p.status === "sent" || p.status === "pending").forEach(p => {
          pendingActions.push({
            id: p.id,
            type: "proposal",
            title: p.title || "Proposta sem título",
            status: p.status,
            date: p.created_at,
          });
        });

        contracts.filter(c => c.status === "pending" || c.status === "sent").forEach(c => {
          pendingActions.push({
            id: c.id,
            type: "contract",
            title: c.contract_number || "Contrato sem título",
            status: c.status,
            date: c.created_at,
          });
        });

        // Quotes are intentionally NOT added to pendingActions:
        // the portal has no dedicated quote detail route, so they would
        // mislabel as "Contrato" and 404 on click.

        // Comercial da empresa ATIVA, resolvido na BD (get_portal_commercial):
        // Resp. Comercial da lead > ficha de cliente > documento mais recente.
        // Nunca quem carregou em "Enviar para o portal" — era o que acontecia
        // antes sem proposta, e esse não é necessariamente o comercial.
        let commercial: PortalSummary["commercial"] = null;
        const { data: commercialInfo } = await (supabase as any).rpc("get_portal_commercial", {
          p_organization_id: org.organizationId,
        });
        if (cancelled) return;
        if (commercialInfo) {
          commercial = {
            name: commercialInfo.name || "Comercial",
            phone: commercialInfo.phone || null,
            email: commercialInfo.email || null,
          };
        }

        // Fetch document count from unified `documents` table (RLS handles visibility)
        let docCount = 0;
        if (contractIds.length > 0) {
          const { count } = await (supabase as any)
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", "contract")
            .in("entity_id", contractIds);
          if (cancelled) return;
          docCount = count || 0;
        }

        if (cancelled) return;

        setData({
          proposalCount: proposals.length,
          pendingProposals: proposals.filter(p => ["sent", "pending"].includes(p.status)).length,
          contractCount: contracts.length,
          activeContracts: contracts.filter(c => c.status === "active" || c.status === "signed").length,
          quoteCount: quotes.length,
          pendingQuotes: quotes.filter(q => ["rascunho", "enviado"].includes(q.estado)).length,
          documentCount: docCount,
          pendingActions,
          commercial,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading portal data:", err);
        setData(prev => ({ ...prev, loading: false }));
      }
    }

    // Enquanto a empresa ativa não estiver resolvida não vale a pena pedir
    // nada; sem nenhuma empresa (conta sem linhas de portal) o ecrã tem de
    // sair do estado de carregamento à mesma.
    if (orgsLoading) return;
    if (!activeOrg) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }
    const org = activeOrg;
    setData(prev => ({ ...prev, loading: true }));

    // Subscribe FIRST, then check existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const user = session?.user;
      if (!user) {
        setData(prev => ({ ...prev, loading: false }));
        return;
      }
      void load(user.id, org);

      // H10: only stamp last_login_at on actual sign-in (not INITIAL_SESSION / TOKEN_REFRESHED)
      if (event === "SIGNED_IN") {
        // Defer to avoid potential deadlocks inside the auth callback
        setTimeout(() => {
          if (cancelled) return;
          void supabase
            .from("client_portal_users")
            .update({ last_login_at: new Date().toISOString() })
            .eq("auth_user_id", user.id);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) void load(session.user.id, org);
      else setData(prev => ({ ...prev, loading: false }));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [activeOrg, orgsLoading]);

  return data;
}
