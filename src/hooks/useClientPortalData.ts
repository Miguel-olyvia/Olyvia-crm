import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

    async function load(userId: string) {
      try {
        // Get portal user records
        const { data: portalUsers } = await supabase
          .from("client_portal_users")
          .select("id, proposal_id, contract_id, quote_id, organization_id, created_by, entity_id")
          .eq("auth_user_id", userId);

        if (cancelled) return;

        if (!portalUsers || portalUsers.length === 0) {
          setData(prev => ({ ...prev, loading: false }));
          return;
        }

        const entityIds = [...new Set(portalUsers.map(p => p.entity_id).filter(Boolean))];
        const organizationIds = [...new Set(portalUsers.map(p => p.organization_id).filter(Boolean))];
        const directProposalIds = [...new Set(portalUsers.map(p => p.proposal_id).filter(Boolean))];
        const contractIds = portalUsers.filter(p => p.contract_id).map(p => p.contract_id!);
        const quoteIds = portalUsers.filter(p => p.quote_id).map(p => p.quote_id!);

        // Fetch proposals across all authorized group companies for this portal user
        let proposals: any[] = [];
        if (entityIds.length > 0 && organizationIds.length > 0) {
          const { data: entityProps } = await supabase
            .from("proposals")
            .select("id, title, status, created_at, created_by, deal_id, client_id")
            .in("organization_id", organizationIds)
            .in("entity_id", entityIds)
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

        const resolveCommercial = async (identifier: string): Promise<PortalSummary["commercial"]> => {
          // Use SECURITY DEFINER function to bypass RLS
          const { data: info } = await (supabase as any).rpc("get_commercial_info", { p_user_id: identifier });
          if (!info) return null;
          return {
            name: info.name || "Comercial",
            phone: info.phone || null,
            email: info.email || null,
          };
        };

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

        // Get commercial info — priority: deal client > proposal client > deal assigned_to > proposal created_by
        let commercial: PortalSummary["commercial"] = null;
        const proposalForCommercial =
          proposals.find((p) => p.status === "sent" || p.status === "pending") ||
          proposals[0] ||
          null;

        let commercialIdentifier = proposalForCommercial?.created_by || portalUsers[0]?.created_by || null;

        let dealClientId: string | null = null;

        if (proposalForCommercial?.deal_id) {
          const { data: deal } = await supabase
            .from("deals")
            .select("assigned_to, client_id")
            .eq("id", proposalForCommercial.deal_id)
            .maybeSingle();
          if (cancelled) return;

          if (deal?.assigned_to) {
            commercialIdentifier = deal.assigned_to;
          }

          if (deal?.client_id) {
            dealClientId = deal.client_id;
          }
        }

        if (proposalForCommercial?.client_id) {
          const { data: proposalClient } = await supabase
            .from("anew_clients")
            .select("assigned_to")
            .eq("id", proposalForCommercial.client_id)
            .maybeSingle();
          if (cancelled) return;

          if (proposalClient?.assigned_to) {
            commercialIdentifier = proposalClient.assigned_to;
          }
        }

        if (dealClientId) {
          const { data: dealClient } = await supabase
            .from("anew_clients")
            .select("assigned_to")
            .eq("id", dealClientId)
            .maybeSingle();
          if (cancelled) return;

          if (dealClient?.assigned_to) {
            commercialIdentifier = dealClient.assigned_to;
          }
        }

        if (commercialIdentifier) {
          commercial = await resolveCommercial(commercialIdentifier);
          if (cancelled) return;
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

    // Subscribe FIRST, then check existing session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const user = session?.user;
      if (!user) {
        setData(prev => ({ ...prev, loading: false }));
        return;
      }
      void load(user.id);

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
      if (session?.user) void load(session.user.id);
      else setData(prev => ({ ...prev, loading: false }));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return data;
}
