import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface SupplierSlaReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
}

interface SlaSummary {
  supplier_id: string;
  supplier_name: string;
  total_received: number;
  within_sla: number | null;
  over_sla: number | null;
  avg_delay_days: number | null;
  compliance_pct: number | null;
}

interface SlaOrderRow {
  order_number: string;
  order_date: string;
  expected_delivery: string | null;
  actual_delivery_date: string | null;
  delivery_sla_days: number | null;
  days_taken: number | null;
  is_within_sla: boolean | null;
}

// Relatório de cumprimento de SLA de entrega de um fornecedor: resumo (rpc_get_supplier_sla_report)
// + detalhe por encomenda recebida (rpc_get_supplier_sla_orders). Segue o padrão de
// SupplierCatalogDialog.tsx (dialog só-leitura, carregado on-open).
export default function SupplierSlaReportDialog({ open, onOpenChange, supplierId, supplierName }: SupplierSlaReportDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SlaSummary | null>(null);
  const [orders, setOrders] = useState<SlaOrderRow[]>([]);

  useEffect(() => {
    if (open && supplierId) {
      loadReport();
    }
  }, [open, supplierId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [summaryRes, ordersRes] = await Promise.all([
        supabase.rpc("rpc_get_supplier_sla_report", { p_supplier_id: supplierId }),
        supabase.rpc("rpc_get_supplier_sla_orders", { p_supplier_id: supplierId }),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const summaryRow = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
      setSummary(summaryRow || null);
      setOrders((ordersRes.data as SlaOrderRow[]) || []);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const hasSlaDefined = summary
    ? summary.within_sla !== null || summary.over_sla !== null || summary.compliance_pct !== null
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("suppliers.slaReport.title")} — {supplierName}</DialogTitle>
          <DialogDescription>{supplierName}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{t("suppliers.slaReport.totalReceived")}</p>
                  <p className="text-2xl font-bold">{summary?.total_received ?? 0}</p>
                </CardContent>
              </Card>
              {hasSlaDefined && (
                <>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{t("suppliers.slaReport.withinSla")}</p>
                      <p className="text-2xl font-bold text-success">{summary?.within_sla ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{t("suppliers.slaReport.overSla")}</p>
                      <p className="text-2xl font-bold text-destructive">{summary?.over_sla ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{t("suppliers.slaReport.compliancePct")}</p>
                      <p className="text-2xl font-bold">
                        {summary?.compliance_pct != null ? `${Math.round(summary.compliance_pct)}%` : "-"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{t("suppliers.slaReport.avgDelay")}</p>
                      <p className="text-2xl font-bold">
                        {summary?.avg_delay_days != null ? `${Math.round(summary.avg_delay_days)} d` : "-"}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {!hasSlaDefined && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                <span>{t("suppliers.slaReport.noSla")}</span>
              </div>
            )}

            {orders.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">{t("suppliers.slaReport.noOrders")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("suppliers.slaReport.table.orderNumber")}</TableHead>
                    <TableHead>{t("suppliers.slaReport.table.orderDate")}</TableHead>
                    <TableHead>{t("suppliers.slaReport.table.expectedDelivery")}</TableHead>
                    <TableHead>{t("suppliers.slaReport.table.actualDelivery")}</TableHead>
                    <TableHead className="text-right">{t("suppliers.slaReport.table.daysTaken")}</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.order_number}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{order.order_date}</TableCell>
                      <TableCell>{order.expected_delivery || "-"}</TableCell>
                      <TableCell>{order.actual_delivery_date || "-"}</TableCell>
                      <TableCell className="text-right">{order.days_taken ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {order.is_within_sla === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : order.is_within_sla ? (
                          <Badge className="bg-success/10 text-success">{t("suppliers.slaReport.table.withinDeadline")}</Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive">{t("suppliers.slaReport.table.overDeadline")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
