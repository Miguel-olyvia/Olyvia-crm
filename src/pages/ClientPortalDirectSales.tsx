import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

// Venda Direta — Fase 3: listagem no portal do cliente.
//
// Mesmo padrão de ClientPortalProposals.tsx: NÃO passa pela edge function,
// consulta direta ao Supabase com a RLS a decidir o âmbito — política
// "Client can view own direct sale" (migration 20261201110000), que resolve a
// visibilidade por public.portal_user_can_see_document('direct_sale', id), ou
// seja, por client_portal_documents.
//
// `(supabase as any)`: direct_sales ainda não existe em
// src/integrations/supabase/types.ts (tipos gerados não regenerados após a
// migration). Mesmo padrão de DirectSales.tsx.

interface PortalDirectSaleRow {
  id: string;
  sale_number: string | null;
  title: string | null;
  status: string;
  total: number | null;
  created_at: string;
  sent_at: string | null;
  valid_until: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  enviada: { label: "A aguardar", variant: "secondary" },
  aceite: { label: "Aceite", variant: "default" },
  rejeitada: { label: "Rejeitada", variant: "destructive" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

const ClientPortalDirectSales = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<PortalDirectSaleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(uid: string | null) {
      if (!uid) {
        if (!cancelled) { setSales([]); setLoading(false); }
        return;
      }
      if (!cancelled) setLoading(true);

      // client_portal_users lido com `as any` por causa de direct_sale_id, que
      // também ainda não está nos tipos gerados.
      const { data: portalUsers } = await (supabase as any)
        .from("client_portal_users")
        .select("direct_sale_id, entity_id, organization_id")
        .eq("auth_user_id", uid);
      if (cancelled) return;

      const portalRows = (portalUsers as any[] | null) || [];
      if (portalRows.length === 0) {
        if (!cancelled) { setSales([]); setLoading(false); }
        return;
      }

      const entityIds = [...new Set(portalRows.map(p => p.entity_id).filter(Boolean))] as string[];
      const organizationIds = [...new Set(portalRows.map(p => p.organization_id).filter(Boolean))] as string[];
      // direct_sale_id guarda só a última venda direta partilhada com esta
      // conta (create-client-portal-access faz update da mesma linha), por isso
      // serve de complemento à query por entidade, nunca de filtro único.
      const directSaleIds = [...new Set(portalRows.map(p => p.direct_sale_id).filter(Boolean))] as string[];

      if ((entityIds.length === 0 || organizationIds.length === 0) && directSaleIds.length === 0) {
        if (!cancelled) { setSales([]); setLoading(false); }
        return;
      }

      const COLUMNS = "id, sale_number, title, status, total, created_at, sent_at, valid_until";

      const [entitySalesRes, directSalesRes] = await Promise.all([
        entityIds.length > 0 && organizationIds.length > 0
          ? (supabase as any)
              .from("direct_sales")
              .select(COLUMNS)
              .in("organization_id", organizationIds)
              .in("entity_id", entityIds)
          : Promise.resolve({ data: [] as any[] }),
        directSaleIds.length > 0
          ? (supabase as any)
              .from("direct_sales")
              .select(COLUMNS)
              .in("id", directSaleIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;

      const merged = Array.from(
        new Map(
          [...((entitySalesRes as any).data || []), ...((directSalesRes as any).data || [])]
            .map((s: any) => [s.id, s as PortalDirectSaleRow]),
        ).values(),
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSales(merged);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data: { user } }) => load(user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">As Minhas Vendas Diretas</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : sales.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Não tem vendas diretas disponíveis.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sales.map(s => {
              const statusInfo = STATUS_MAP[s.status] || { label: s.status, variant: "outline" as const };
              const referenceDate = s.sent_at || s.created_at;

              return (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Receipt className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s.title || s.sale_number || "Venda direta"}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {s.sale_number && <span>{s.sale_number}</span>}
                            {s.sale_number && <span>•</span>}
                            <span>{formatCurrency(s.total ?? 0)}</span>
                            <span>•</span>
                            <span>{format(new Date(referenceDate), "d MMM yyyy", { locale: pt })}</span>
                            {s.valid_until && (
                              <>
                                <span>•</span>
                                <span>Válida até {format(new Date(s.valid_until), "d MMM yyyy", { locale: pt })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/client-portal/direct-sales/${s.id}`)}
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

export default ClientPortalDirectSales;
