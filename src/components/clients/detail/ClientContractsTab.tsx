import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, Plus } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

interface ClientContractsTabProps {
  entityId: string;
  organizationId: string;
}

interface ContractRecord {
  id: string;
  title: string;
  status: string;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  payment_terms: string | null;
  created_at: string;
}

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  active: { label: "Activo", className: "bg-green-100 text-green-700 dark:bg-green-900/30" },
  signed: { label: "Activo", className: "bg-green-100 text-green-700 dark:bg-green-900/30" },
  expired: { label: "Expirado", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-700 dark:bg-red-900/30" },
  draft: { label: "Rascunho", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30" },
};

export function ClientContractsTab({ entityId, organizationId }: ClientContractsTabProps) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContracts();
  }, [entityId, organizationId]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("client_contracts")
        .select("id, title:contract_number, status, total_value, start_date, end_date, payment_terms, created_at")
        .eq("entity_id", entityId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      setContracts(data || []);
    } catch (e) {
      console.error("Error loading contracts:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const now = new Date();

  return (
    <div className="space-y-3 mt-4">
      {contracts.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Sem contratos registados</p>
        </div>
      ) : (
        contracts.map(c => {
          const statusCfg = STATUS_DISPLAY[c.status] || STATUS_DISPLAY.draft;
          const daysToEnd = c.end_date ? differenceInDays(new Date(c.end_date), now) : null;
          const totalDays = c.start_date && c.end_date ? differenceInDays(new Date(c.end_date), new Date(c.start_date)) : null;
          const elapsed = c.start_date ? differenceInDays(now, new Date(c.start_date)) : null;
          const progressPct = totalDays && elapsed !== null ? Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100))) : null;

          return (
            <Card key={c.id} className="border-l-4 border-l-green-500">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.start_date && `Início: ${format(new Date(c.start_date), "dd/MM/yyyy", { locale: pt })}`}
                        {c.end_date && ` · Fim: ${format(new Date(c.end_date), "dd/MM/yyyy", { locale: pt })}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <p className="text-sm font-bold text-green-600">
                      €{c.total_value?.toLocaleString("pt-PT")}
                      {c.payment_terms === "recurring" && <span className="text-[10px] text-muted-foreground">/mês</span>}
                    </p>
                    <Badge className={`text-[10px] ${statusCfg.className}`}>
                      {daysToEnd !== null && daysToEnd > 0 && daysToEnd <= 60
                        ? `Renova em ${daysToEnd}d`
                        : c.payment_terms === "recurring" ? "Recorrente" : statusCfg.label}
                    </Badge>
                  </div>
                </div>
                {progressPct !== null && (
                  <div className="mt-2">
                    <Progress value={progressPct} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
      <button className="w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-2.5">
        + Criar contrato
      </button>
    </div>
  );
}
