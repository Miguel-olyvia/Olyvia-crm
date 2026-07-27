import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { toast } from "sonner";

const PAGE_SIZE = 50;
const MIN_REJECTION_REASON_LENGTH = 5;

type ErasureStatus = "pending" | "approved" | "rejected" | "completed" | "failed";
type StatusFilter = "all" | ErasureStatus;

interface ErasureRequestRow {
  id: string;
  entity_snapshot: { type?: string; display_name?: string; status?: string } | null;
  organization_id: string;
  requested_by: string;
  reason: string;
  status: ErasureStatus;
  decision_mode: "deleted" | "anonymized" | null;
  requested_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  error_message: string | null;
}

const statusBadgeVariant: Record<ErasureStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "outline",
  completed: "default",
  rejected: "destructive",
  failed: "destructive",
};

const statusLabel: Record<ErasureStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  completed: "Concluído",
  rejected: "Rejeitado",
  failed: "Falhou",
};

async function getBackendErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx: any = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      return body?.error || body?.message || fallback;
    }
  } catch {
    // ignore parse errors, fall back below
  }
  return fallback;
}

export default function DataErasureRequests() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ErasureRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const [decision, setDecision] = useState<{ request: ErasureRequestRow; action: "approved" | "rejected" } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  const fetchRequests = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from("data_erasure_requests")
        .select("id, entity_snapshot, organization_id, requested_by, reason, status, decision_mode, requested_at, reviewed_at, rejection_reason, error_message")
        .order("requested_at", { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const result = (data || []) as ErasureRequestRow[];
      setRows(result);
      setHasMore(result.length === PAGE_SIZE);
    } catch (error: unknown) {
      console.error("Error fetching data erasure requests:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => { fetchRequests(page); }, [fetchRequests, page]);

  const openDecision = (request: ErasureRequestRow, action: "approved" | "rejected") => {
    setRejectionReason("");
    setDecision({ request, action });
  };

  const handleDecide = async () => {
    if (!decision) return;
    if (decision.action === "rejected" && rejectionReason.trim().length < MIN_REJECTION_REASON_LENGTH) {
      toast.error(`O motivo da rejeição precisa de pelo menos ${MIN_REJECTION_REASON_LENGTH} caracteres.`);
      return;
    }

    setDeciding(true);
    try {
      const { error } = await supabase.functions.invoke("decide-data-erasure", {
        body: {
          request_id: decision.request.id,
          action: decision.action,
          ...(decision.action === "rejected" ? { rejection_reason: rejectionReason.trim() } : {}),
        },
      });

      if (error) {
        const message = await getBackendErrorMessage(error, error.message || t("common.error"));
        throw new Error(message);
      }

      toast.success(decision.action === "approved" ? "Pedido aprovado e executado." : "Pedido rejeitado.");
      setDecision(null);
      fetchRequests(page);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("common.error");
      toast.error(message);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">{t("sidebar.dataErasureRequests")}</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de eliminação/anonimização de dados ao abrigo do RGPD Art. 17 — aprovação e execução requerem confirmação explícita.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-base">Pedidos</CardTitle>
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(0); }}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <OlyviaLoader size={32} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Titular dos dados</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {t("common.noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(row.requested_at), "dd/MM/yyyy HH:mm:ss", { locale: pt })}
                        </TableCell>
                        <TableCell className="font-medium">{row.entity_snapshot?.display_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate" title={row.reason}>
                          {row.reason}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant[row.status]}>{statusLabel[row.status]}</Badge>
                          {row.status === "rejected" && row.rejection_reason && (
                            <p className="text-xs text-muted-foreground mt-1">{row.rejection_reason}</p>
                          )}
                          {row.status === "failed" && row.error_message && (
                            <p className="text-xs text-destructive mt-1">{row.error_message}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.decision_mode === "deleted" ? "Eliminado" : row.decision_mode === "anonymized" ? "Anonimizado" : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === "pending" ? (
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => openDecision(row, "rejected")}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDecision(row, "approved")}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-muted-foreground">Página {page + 1}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!decision} onOpenChange={(open) => { if (!open && !deciding) setDecision(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.action === "approved" ? "Aprovar e executar eliminação?" : "Rejeitar pedido?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {decision?.action === "approved" ? (
                <>
                  Esta ação elimina ou anonimiza imediatamente os dados de{" "}
                  <strong>{decision?.request.entity_snapshot?.display_name}</strong>. Não pode ser desfeita.
                </>
              ) : (
                <>
                  O pedido de eliminação para <strong>{decision?.request.entity_snapshot?.display_name}</strong> será
                  rejeitado e nenhum dado será alterado.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {decision?.action === "rejected" && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Motivo da rejeição</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explique porque este pedido está a ser rejeitado"
                disabled={deciding}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deciding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDecide} disabled={deciding}>
              {deciding ? "A processar…" : decision?.action === "approved" ? "Aprovar" : "Rejeitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
