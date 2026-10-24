import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";
import { PortalOrgsErrorState } from "@/components/portal/PortalOrgsErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "A aguardar", variant: "secondary" },
  pending: { label: "A aguardar", variant: "secondary" },
  draft: { label: "Rascunho", variant: "outline" },
  accepted: { label: "Aceite", variant: "default" },
  rejected: { label: "Rejeitada", variant: "destructive" },
  expired: { label: "Expirada", variant: "destructive" },
};

const ClientPortalProposals = () => {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Empresa ativa do portal — ver src/contexts/PortalCompanyContext.tsx.
  const { activeOrg, isLoading: orgsLoading, isError: orgsError, hasMultiple } = usePortalCompany();

  useEffect(() => {
    let cancelled = false;

    const COLUMNS = "id, title, proposal_number, value, created_at, valid_until, status, organization_id, anew_organizations:anew_organizations!proposals_organization_id_fkey(name)";

    async function load(org: PortalOrg) {
      if (!cancelled) setLoading(true);

      if (!org.entityId && !org.proposalId) {
        if (!cancelled) { setProposals([]); setLoading(false); }
        return;
      }

      // Par (organização, entidade) da empresa ativa, com `.eq` + `.eq`. Antes
      // eram dois `.in()` independentes sobre as listas de todas as empresas:
      // como o entity_id pode diferir entre organizações, isso formava um
      // produto cartesiano e podia mostrar combinações nunca concedidas.
      const [entityPropsRes, directPropsRes] = await Promise.all([
        org.entityId
          ? supabase
              .from("proposals")
              .select(COLUMNS)
              .eq("organization_id", org.organizationId)
              .eq("entity_id", org.entityId)
          : Promise.resolve({ data: [] as any[] }),
        // Coluna legada da linha desta empresa — é sempre desta organização.
        org.proposalId
          ? supabase
              .from("proposals")
              .select(COLUMNS)
              .eq("id", org.proposalId)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;

      const merged = Array.from(new Map([...(entityPropsRes.data || []), ...(directPropsRes.data || [])].map((p: any) => [p.id, p])).values())
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProposals(merged);
      setLoading(false);
    }

    if (orgsLoading) return;
    if (!activeOrg) {
      setProposals([]);
      setLoading(false);
      return;
    }

    void load(activeOrg);

    return () => { cancelled = true; };
  }, [activeOrg, orgsLoading]);

  // M2: formatCurrency now imported from @/lib/utils


  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">As Minhas Propostas</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : orgsError ? (
          // Falha a carregar o âmbito: nunca apresentar como "não tem nada".
          <PortalOrgsErrorState />
        ) : proposals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Não tem propostas disponíveis.</p>
              {hasMultiple && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Se esperava ver outras, troque de empresa no seletor no topo da página.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {proposals.map(p => {
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{p.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {p.proposal_number && <span>{p.proposal_number}</span>}
                            {p.anew_organizations?.name && (
                              <>
                                <span>•</span>
                                <span>{p.anew_organizations.name}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{formatCurrency(p.value)}</span>
                            <span>•</span>
                            <span>{format(new Date(p.created_at), "d MMM yyyy", { locale: pt })}</span>
                            {p.valid_until && (
                              <>
                                <span>•</span>
                                <span>Válida até {format(new Date(p.valid_until), "d MMM yyyy", { locale: pt })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/client-portal/proposals/${p.id}`)}
                        >
                          Ver <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalProposals;
