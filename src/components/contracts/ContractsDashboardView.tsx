import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";
import { getEffectiveContractValue, getEffectiveContractValueExVat } from "@/utils/contractValue";
import { AlertCircle } from "lucide-react";

interface Contract {
  id: string;
  status: string;
  contract_number?: string;
  total_value?: number;
  total_value_sem_iva?: number | null;
  quote_id?: string | null;
  proposals?: { quotes?: { id: string; total?: number; subtotal?: number; total_fees?: number }[] } | null;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at?: string;
  _clientName?: string;
  assigned_to_name?: string;
}

interface ContractsDashboardViewProps {
  contracts: Contract[];
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_signature: "Enviado",
  signed: "Assinado",
  active: "Activo",
  expired: "Expirado",
  cancelled: "Cancelado",
  outro: "Outro",
};

export function ContractsDashboardView({ contracts }: ContractsDashboardViewProps) {
  // getEffectiveContractValueExVat pode devolver null quando o contrato não tem
  // quote ligada com subtotal nem total_value_sem_iva preenchido. Nesses casos
  // os somatórios tratam o contrato como 0, mas contamos quantos ficaram assim
  // para se poder sinalizar dados incompletos em vez de esconder o problema.
  const missingExVatCount = useMemo(
    () => contracts.filter(c => getEffectiveContractValueExVat(c) == null).length,
    [contracts]
  );

  const statusDistribution = useMemo(() => {
    const map: Record<string, { count: number; value: number; valueWithVat: number; color: string }> = {
      draft: { count: 0, value: 0, valueWithVat: 0, color: "bg-yellow-400" },
      pending_signature: { count: 0, value: 0, valueWithVat: 0, color: "bg-blue-400" },
      signed: { count: 0, value: 0, valueWithVat: 0, color: "bg-green-400" },
      active: { count: 0, value: 0, valueWithVat: 0, color: "bg-green-500" },
      expired: { count: 0, value: 0, valueWithVat: 0, color: "bg-red-400" },
      cancelled: { count: 0, value: 0, valueWithVat: 0, color: "bg-gray-400" },
      outro: { count: 0, value: 0, valueWithVat: 0, color: "bg-gray-300" },
    };
    contracts.forEach(c => {
      let s = map[c.status];
      if (!s) {
        if (import.meta.env.DEV) {
          console.warn(`[ContractsDashboardView] Estado de contrato desconhecido: ${c.status}`);
        }
        s = map.outro;
      }
      s.count++;
      s.value += getEffectiveContractValueExVat(c) ?? 0;
      s.valueWithVat += getEffectiveContractValue(c);
    });
    return map;
  }, [contracts]);

  const byMonth = useMemo(() => {
    const months: Record<string, { value: number; valueWithVat: number }> = {};
    contracts.forEach(c => {
      const d = new Date(c.start_date || c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { value: 0, valueWithVat: 0 };
      months[key].value += getEffectiveContractValueExVat(c) ?? 0;
      months[key].valueWithVat += getEffectiveContractValue(c);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  }, [contracts]);

  const maxMonth = Math.max(...byMonth.map(([, v]) => v.value), 1);

  const byCommercial = useMemo(() => {
    const map: Record<string, { count: number; value: number; valueWithVat: number; signed: number }> = {};
    contracts.forEach(c => {
      const name = c.assigned_to_name || "Não atribuído";
      if (!map[name]) map[name] = { count: 0, value: 0, valueWithVat: 0, signed: 0 };
      map[name].count++;
      map[name].value += getEffectiveContractValueExVat(c) ?? 0;
      map[name].valueWithVat += getEffectiveContractValue(c);
      if (c.status === "signed" || c.status === "active") map[name].signed++;
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [contracts]);

  const renewalsNext6 = useMemo(() => {
    const now = new Date();
    return contracts.filter(c => {
      if (!c.end_date) return false;
      const end = new Date(c.end_date);
      const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 0 && diff <= 180 && c.status !== "expired" && c.status !== "cancelled";
    }).sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime());
  }, [contracts]);

  if (contracts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Ainda não existem contratos. Os contratos aparecerão aqui assim que forem criados.
        </CardContent>
      </Card>
    );
  }

  const denom = Math.max(contracts.length, 1);

  return (
    <div className="space-y-4">
      {missingExVatCount > 0 && (
        <Badge variant="outline" className="w-fit gap-1 text-[10px] font-normal text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700">
          <AlertCircle className="h-3 w-3" />
          {missingExVatCount} contrato(s) sem valor sem IVA disponível (contam como 0€ nos totais abaixo)
        </Badge>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Status Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-base">Distribuição por Estado</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(statusDistribution).filter(([, v]) => v.count > 0).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${val.color}`} />
                <span className="text-sm w-28">{statusLabels[key]}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${val.color} rounded-full`}
                    style={{ width: `${(val.count / denom) * 100}%`, minWidth: "4px" }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{val.count}</span>
                <div className="w-24 text-right">
                  <span className="text-xs text-muted-foreground block">{formatCurrency(val.value)}</span>
                  <span className="text-[10px] text-muted-foreground/70 block">{formatCurrency(val.valueWithVat)} c/ IVA</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Value by Month */}
      <Card>
        <CardHeader><CardTitle className="text-base">Valor dos Contratos por Mês</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {byMonth.map(([month, data]) => (
              <div key={month} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16">{month}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(data.value / maxMonth) * 100}%`, minWidth: "4px" }}
                  />
                </div>
                <div className="w-28 text-right">
                  <span className="text-xs font-semibold block">{formatCurrency(data.value)}</span>
                  <span className="text-[10px] text-muted-foreground block">{formatCurrency(data.valueWithVat)} c/ IVA</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* By Commercial */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contratos por Comercial</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {byCommercial.slice(0, 10).map(([name, data]) => (
              <div key={name} className="flex items-center justify-between border-b border-muted pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{data.count} contratos · {data.signed} assinados</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-primary block">{formatCurrency(data.value)}</span>
                  <span className="text-[10px] text-muted-foreground block">{formatCurrency(data.valueWithVat)} c/ IVA</span>
                </div>
              </div>
            ))}
            {byCommercial.length > 10 && (
              <p className="text-xs text-muted-foreground pt-2">
                e mais {byCommercial.length - 10} comerciais
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Renewals Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Renovações Próximos 6 Meses</CardTitle></CardHeader>
        <CardContent>
          {renewalsNext6.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem renovações urgentes</p>
          ) : (
            <ScrollArea className="h-80">
              <div className="space-y-3 pr-4">
                {renewalsNext6.map(c => {
                  const daysLeft = Math.ceil((new Date(c.end_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={c.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.contract_number}</p>
                        <p className="text-xs text-muted-foreground">{c._clientName}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={daysLeft <= 30 ? "border-red-300 text-red-600" : daysLeft <= 90 ? "border-orange-300 text-orange-600" : "border-green-300 text-green-600"}
                      >
                        {daysLeft}d
                      </Badge>
                      <div className="text-right">
                        <span className="text-sm font-medium block">{formatCurrency(getEffectiveContractValueExVat(c) ?? 0)}</span>
                        <span className="text-[10px] text-muted-foreground block">{formatCurrency(getEffectiveContractValue(c))} c/ IVA</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
