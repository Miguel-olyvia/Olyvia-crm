import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
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

  useEffect(() => {
    let cancelled = false;

    async function load(uid: string | null) {
      if (!uid) {
        if (!cancelled) { setProposals([]); setLoading(false); }
        return;
      }
      if (!cancelled) setLoading(true);

      // Get portal user info including entity_id and organization_id
      const { data: portalUsers } = await supabase
        .from("client_portal_users")
        .select("proposal_id, entity_id, organization_id")
        .eq("auth_user_id", uid);
      if (cancelled) return;

      if (!portalUsers || portalUsers.length === 0) {
        if (!cancelled) { setProposals([]); setLoading(false); }
        return;
      }

      const entityIds = [...new Set(portalUsers.map(p => p.entity_id).filter(Boolean))];
      const organizationIds = [...new Set(portalUsers.map(p => p.organization_id).filter(Boolean))];
      const directProposalIds = [...new Set(portalUsers.map(p => p.proposal_id).filter(Boolean))];

      if ((entityIds.length === 0 || organizationIds.length === 0) && directProposalIds.length === 0) {
        if (!cancelled) { setProposals([]); setLoading(false); }
        return;
      }

      const [entityPropsRes, directPropsRes] = await Promise.all([
        entityIds.length > 0 && organizationIds.length > 0
          ? supabase
              .from("proposals")
              .select("id, title, proposal_number, value, created_at, valid_until, status, organization_id, anew_organizations:anew_organizations!proposals_organization_id_fkey(name)")
              .in("organization_id", organizationIds)
              .in("entity_id", entityIds)
          : Promise.resolve({ data: [] as any[] }),
        directProposalIds.length > 0
          ? supabase
              .from("proposals")
              .select("id, title, proposal_number, value, created_at, valid_until, status, organization_id, anew_organizations:anew_organizations!proposals_organization_id_fkey(name)")
              .in("id", directProposalIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;

      const merged = Array.from(new Map([...(entityPropsRes.data || []), ...(directPropsRes.data || [])].map((p: any) => [p.id, p])).values())
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProposals(merged);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data: { user } }) => load(user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  // M2: formatCurrency now imported from @/lib/utils


  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">As Minhas Propostas</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : proposals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Não tem propostas disponíveis.</p>
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
