import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

import { CONTRACT_STATUS_LABELS as STATUS_LABELS, CONTRACT_STATUS_VARIANTS as STATUS_VARIANTS } from "@/constants/contractStatus";

const ClientPortalContracts = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(uid: string | null) {
      if (!uid) {
        if (!cancelled) { setContracts([]); setLoading(false); }
        return;
      }
      if (!cancelled) setLoading(true);

      const { data: portalUsers } = await supabase
        .from("client_portal_users")
        .select("contract_id")
        .eq("auth_user_id", uid)
        .not("contract_id", "is", null);
      if (cancelled) return;

      const contractIds = portalUsers?.map(p => p.contract_id!) || [];
      if (contractIds.length === 0) {
        if (!cancelled) { setContracts([]); setLoading(false); }
        return;
      }

      const { data } = await supabase
        .from("client_contracts")
        .select("id, contract_number, total_value, start_date, end_date, status, created_at")
        .in("id", contractIds)
        .order("created_at", { ascending: false });
      if (cancelled) return;

      setContracts(data || []);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data: { user } }) => load(user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const fmtCurrency = (val: number) => formatCurrency(val || 0);

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Os Meus Contratos</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : contracts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Não tem contratos disponíveis.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contracts.map(contract => (
              <Card key={contract.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ScrollText className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {contract.contract_number || "Contrato"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {contract.total_value && (
                            <>
                              <span>{fmtCurrency(contract.total_value)}</span>
                              <span>•</span>
                            </>
                          )}
                          {contract.start_date && (
                            <>
                              <span>{format(new Date(contract.start_date), "d MMM yyyy", { locale: pt })}</span>
                              {contract.end_date && (
                                <span> — {format(new Date(contract.end_date), "d MMM yyyy", { locale: pt })}</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/client-portal/contracts/${contract.id}`)}
                      >
                        Ver <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortalContracts;
