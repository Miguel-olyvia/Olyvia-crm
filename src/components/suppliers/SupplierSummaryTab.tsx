// Separador "Resumo" da ficha do fornecedor (FornecedorResumo do protótipo):
// cumprimento do prazo (rpc_get_supplier_sla_report) e as encomendas do
// fornecedor (purchase_orders da organização). Sem permissão, a parte
// correspondente não aparece.
import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import SupplierSlaReportDialog from "@/components/SupplierSlaReportDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { cn } from "@/lib/utils";
import {
  InventoryStatusBadge,
  KpiGrid,
  KpiTile,
  purchaseOrdersLink,
  toneText,
  type InventoryTone,
} from "@/components/inventory/ui";
import { useSupplierPurchaseOrders, useSupplierSlaSummary, type SupplierPoRow } from "./useSupplierSheetData";

const PO_STATUS: Record<string, { label: string; tone: InventoryTone }> = {
  pending: { label: "Pendente", tone: "warn" },
  ordered: { label: "Encomendada", tone: "info" },
  partially_received: { label: "Parcialmente recebida", tone: "violet" },
  received: { label: "Recebida", tone: "ok" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

const OPEN = new Set(["ordered", "partially_received"]);

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-PT");
};

const fmtEur = (v: number | null | undefined): string =>
  Number(v ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function PoTable({ rows, caption }: { rows: SupplierPoRow[]; caption: string }) {
  const today = todayIso();
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[560px]">
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((po) => {
            const st = PO_STATUS[po.status] ?? { label: po.status, tone: "neutral" as InventoryTone };
            const late = OPEN.has(po.status) && !!po.expected_delivery && po.expected_delivery.slice(0, 10) < today;
            return (
              <TableRow key={po.id}>
                <TableCell className="font-mono text-[13px]">
                  <Link
                    to={purchaseOrdersLink({ open: po.id })}
                    className="rounded-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Abrir a encomenda ${po.order_number}`}
                  >
                    {po.order_number}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(po.order_date)}</TableCell>
                <TableCell className={cn("whitespace-nowrap", late && cn("font-semibold", toneText.bad))}>
                  {fmtDate(po.expected_delivery)}
                  {late ? <span className="sr-only"> (atrasada)</span> : null}
                </TableCell>
                <TableCell>
                  <InventoryStatusBadge tone={st.tone}>{st.label}</InventoryStatusBadge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtEur(po.total_value)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface SupplierSummaryTabProps {
  supplierId: string;
  supplierName: string;
  slaDays: number | null;
}

export function SupplierSummaryTab({ supplierId, supplierName, slaDays }: SupplierSummaryTabProps) {
  const { hasPermission, loading: permLoading } = usePermissions();
  // POs filtradas pela organização ATIVA, como a lista de Encomendas a fornecedor.
  const { activeCompany } = useCompany();
  // As mesmas permissões do "Relatório SLA" da lista e da coluna SLA %.
  const canSla =
    hasPermission("suppliers.view") && hasPermission("suppliers.view_sla_report") && hasPermission("purchase_orders.view");
  const canPos = hasPermission("purchase_orders.view");
  const [slaOpen, setSlaOpen] = useState(false);

  const sla = useSupplierSlaSummary(supplierId, !permLoading && canSla);
  const pos = useSupplierPurchaseOrders(activeCompany?.id ?? null, supplierId, !permLoading && canPos);

  if (permLoading) {
    return (
      <div className="flex justify-center py-8">
        <OlyviaLoader size={28} />
      </div>
    );
  }

  const s = sla.data ?? null;
  const hasSla = !!s && (s.within_sla !== null || s.over_sla !== null || s.compliance_pct !== null);
  const pct = s?.compliance_pct != null ? Number(s.compliance_pct) : null;
  const avg = s?.avg_delay_days != null ? Number(s.avg_delay_days) : null;
  const dash = "—";

  return (
    <div className="space-y-5">
      {canSla && (
        <section aria-label="Cumprimento do prazo de entrega" className="space-y-2">
          {sla.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar o relatório de SLA.</p>
          ) : sla.isLoading ? (
            <div className="flex justify-center py-6">
              <OlyviaLoader size={24} />
            </div>
          ) : (
            <>
              <KpiGrid className="lg:grid-cols-5">
                <KpiTile label="Recebidas" value={s?.total_received ?? 0} hint="histórico" />
                <KpiTile
                  label="Dentro do SLA"
                  value={hasSla ? s?.within_sla ?? 0 : dash}
                  hint={slaDays != null ? `prazo ${slaDays} dias` : "sem prazo definido"}
                  tone={hasSla ? "ok" : undefined}
                />
                <KpiTile
                  label="Fora do SLA"
                  value={hasSla ? s?.over_sla ?? 0 : dash}
                  tone={hasSla && (s?.over_sla ?? 0) > 0 ? "bad" : undefined}
                />
                <KpiTile
                  label="% cumprimento"
                  value={pct != null ? `${Math.round(pct)}%` : dash}
                  tone={pct == null ? undefined : pct >= 90 ? "ok" : "warn"}
                />
                <KpiTile
                  label="Atraso médio"
                  value={avg != null ? `${(Math.round(avg * 10) / 10).toString().replace(".", ",")} dias` : dash}
                />
              </KpiGrid>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setSlaOpen(true)}>
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Ver relatório SLA por encomenda
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {canPos ? (
        pos.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar as encomendas deste fornecedor.</p>
        ) : pos.isLoading ? (
          <div className="flex justify-center py-6">
            <OlyviaLoader size={24} />
          </div>
        ) : (
          <>
            <section className="space-y-2" aria-labelledby={`sup-open-pos-${supplierId}`}>
              <h3 id={`sup-open-pos-${supplierId}`} className="text-base font-semibold">
                POs abertas ({pos.data?.open.length ?? 0})
              </h3>
              {pos.data && pos.data.open.length > 0 ? (
                <PoTable rows={pos.data.open} caption="Encomendas em aberto" />
              ) : (
                <p className="text-sm text-muted-foreground">Sem encomendas em aberto.</p>
              )}
            </section>
            <section className="space-y-2" aria-labelledby={`sup-last-pos-${supplierId}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 id={`sup-last-pos-${supplierId}`} className="text-base font-semibold">
                  Últimas encomendas
                </h3>
                <Link
                  to={purchaseOrdersLink({ supplier: supplierId })}
                  className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver todas
                </Link>
              </div>
              {pos.data && pos.data.recent.length > 0 ? (
                <PoTable rows={pos.data.recent} caption="Últimas encomendas" />
              ) : (
                <p className="text-sm text-muted-foreground">Sem encomendas.</p>
              )}
            </section>
          </>
        )
      ) : null}

      {!canSla && !canPos && (
        <p className="text-sm text-muted-foreground">Sem permissão para ver o SLA e as encomendas deste fornecedor.</p>
      )}

      {canSla && slaOpen && (
        <SupplierSlaReportDialog open={slaOpen} onOpenChange={setSlaOpen} supplierId={supplierId} supplierName={supplierName} />
      )}
    </div>
  );
}
