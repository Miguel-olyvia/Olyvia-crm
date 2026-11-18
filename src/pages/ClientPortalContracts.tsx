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
import { resolvePortalContractIdsForUsers } from "@/lib/portal/contractAccess";
import { usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";
import { PortalOrgsErrorState } from "@/components/portal/PortalOrgsErrorState";
import { usePortalFormato, usePortalT } from "@/portal-i18n";

import { CONTRACT_STATUS_VARIANTS as STATUS_VARIANTS, contractStatusLabel } from "@/constants/contractStatus";

const ClientPortalContracts = () => {
  const navigate = useNavigate();
  const { t } = usePortalT();
  const { formatarData } = usePortalFormato();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Empresa ativa do portal — ver src/contexts/PortalCompanyContext.tsx.
  const { activeOrg, isLoading: orgsLoading, isError: orgsError, hasMultiple } = usePortalCompany();

  useEffect(() => {
    let cancelled = false;

    async function load(org: PortalOrg) {
      if (!cancelled) setLoading(true);

      // Resolução partilhada (coluna legada + client_portal_documents) — ver
      // src/lib/portal/contractAccess.ts. Duplicá-la aqui foi o que fez o cartão
      // da página inicial divergir desta lista.
      //
      // Só a conta de portal DESTA empresa (as concessões em
      // client_portal_documents são por portal_user_id) e, por segurança, o
      // `orgScope` corta o que pertença a outra organização.
      const contractIds = await resolvePortalContractIdsForUsers(
        [{ id: org.portalUserId, contract_id: org.contractId }],
        { organizationId: org.organizationId, entityId: org.entityId },
      );
      if (cancelled) return;

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

    if (orgsLoading) return;
    if (!activeOrg) {
      setContracts([]);
      setLoading(false);
      return;
    }

    void load(activeOrg);

    return () => { cancelled = true; };
  }, [activeOrg, orgsLoading]);

  const fmtCurrency = (val: number) => formatCurrency(val || 0);

  return (
    <ClientPortalLayout>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">{t("pc.contratos.titulo")}</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : orgsError ? (
          // Falha a carregar o âmbito: nunca apresentar como "não tem nada".
          <PortalOrgsErrorState />
        ) : contracts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">{t("pc.contratos.vazio")}</p>
              {hasMultiple && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {t("pc.contratos.vazioTroqueEmpresa")}
                </p>
              )}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">
                            {contract.contract_number || t("pc.contratos.semNumero")}
                          </p>
                          <Badge variant={STATUS_VARIANTS[contract.status] || "outline"} className="text-[10px]">
                            {contractStatusLabel(contract.status, t)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {contract.total_value && (
                            <>
                              <span>{fmtCurrency(contract.total_value)}</span>
                              <span>•</span>
                            </>
                          )}
                          {contract.start_date && (
                            <>
                              <span>{formatarData(contract.start_date, "curto")}</span>
                              {contract.end_date && (
                                <span> — {formatarData(contract.end_date, "curto")}</span>
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
                        {t("pc.contratos.ver")} <ArrowRight className="h-3 w-3 ml-1" />
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
