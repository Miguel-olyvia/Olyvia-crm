import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { ArrowRightLeft } from "lucide-react";

// Fase 5.4 do plano de inventário: diálogo de detalhe/contagem de uma sessão
// de public.inventory_counts. Consome as 3 RPCs de escrita já aplicadas
// (20261116020000_inventory_counts_foundation.sql):
// rpc_update_inventory_count_line_quantity (permissão inventory.count),
// rpc_resolve_inventory_count_line e rpc_finalize_inventory_count (ambas
// exigem inventory.edit). Leitura via .from() direto — inventory_counts/
// inventory_count_lines/products/warehouses/product_categories têm SELECT
// liberado por organização (sem permissão extra necessária além de
// inventory.view, já verificado na rota/menu).

type ResolutionType = "ajustado" | "aceite_sem_ajuste" | "recontagem_pedida";

interface InventoryCountHeader {
  id: string;
  document_number: string;
  status: string;
  started_at: string;
  finalized_at: string | null;
  warehouse_id: string;
  category_id: string | null;
  warehouses?: { name: string } | null;
  product_categories?: { name: string } | null;
}

interface InventoryCountLineRow {
  id: string;
  product_id: string;
  system_quantity_at_start: number;
  counted_quantity: number | null;
  counted_at: string | null;
  discrepancy_resolution: string | null;
  resolution_notes: string | null;
  moved_during_count: boolean;
  stock_movement_id: string | null;
  products?: { name: string; sku: string | null } | null;
}

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
}

const INCREASING_TYPES = new Set(["entrada", "transferencia_entrada", "ajuste_positivo"]);
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_entrada: "Transferência (entrada)",
  transferencia_saida: "Transferência (saída)",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (-)",
  devolucao_fornecedor: "Devolução a fornecedor",
  quebra: "Quebra",
};

// PostgREST caps an unranged response at 1000 rows — paginado por segurança,
// mesmo padrão já usado em Stocks.tsx/StockMovementDialog.tsx.
const fetchAllRows = async (buildQuery: () => any): Promise<{ data: any[] | null; error: any }> => {
  const PAGE = 1000;
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { data: rows, error: null };
};

interface InventoryCountDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countId: string | null;
  // Chamado depois de qualquer alteração que mude os agregados mostrados na
  // listagem (contagem de linhas, discrepâncias por resolver, estado) —
  // finalizar ou resolver uma linha.
  onChanged: () => void;
}

export default function InventoryCountDetailDialog({
  open, onOpenChange, countId, onChanged,
}: InventoryCountDetailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const canCount = hasPermission("inventory.count") || hasPermission("inventory.edit");
  const canEdit = hasPermission("inventory.edit");

  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState<InventoryCountHeader | null>(null);
  const [lines, setLines] = useState<InventoryCountLineRow[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, { resolution: ResolutionType | ""; notes: string }>>({});
  const [resolvingLineId, setResolvingLineId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const isActive = header?.status === "em_contagem";

  const loadDetail = useCallback(async () => {
    if (!countId) return;
    setLoading(true);
    try {
      const { data: headerData, error: headerError } = await supabase
        .from("inventory_counts")
        .select("id, document_number, status, started_at, finalized_at, warehouse_id, category_id, warehouses(name), product_categories(name)")
        .eq("id", countId)
        .single();
      if (headerError) throw headerError;
      setHeader(headerData as unknown as InventoryCountHeader);

      const { data: lineData, error: lineError } = await fetchAllRows(() =>
        supabase
          .from("inventory_count_lines")
          .select("id, product_id, system_quantity_at_start, counted_quantity, counted_at, discrepancy_resolution, resolution_notes, moved_during_count, stock_movement_id, products(name, sku)")
          .eq("inventory_count_id", countId)
          .order("name", { foreignTable: "products", ascending: true })
      );
      if (lineError) throw lineError;
      const rows = (lineData || []) as unknown as InventoryCountLineRow[];
      setLines(rows);
      setQuantityDrafts(Object.fromEntries(rows.map((l) => [l.id, l.counted_quantity != null ? String(l.counted_quantity) : ""])));
      setResolutionDrafts({});
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.detailError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [countId, t, toast]);

  const loadMovements = useCallback(async (lineIds: string[]) => {
    if (lineIds.length === 0) {
      setMovements([]);
      return;
    }
    setMovementsLoading(true);
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, balance_after, document_number, counterparty, notes, created_at")
        .in("reference_id", lineIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setMovements((data || []) as MovementRow[]);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.movementsLoadError'), description: error.message, variant: "destructive" });
    } finally {
      setMovementsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (!open || !countId) return;
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countId]);

  useEffect(() => {
    if (!open || lines.length === 0) {
      if (open) setMovements([]);
      return;
    }
    loadMovements(lines.map((l) => l.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lines]);

  const handleSaveQuantity = async (lineId: string) => {
    const raw = quantityDrafts[lineId];
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    const trimmed = (raw ?? "").trim();
    if (trimmed === "") return; // nada a gravar
    const qty = Number(trimmed);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      toast({ title: t('stockCounts.toast.quantityError'), description: t('stockCounts.detail.lines.countedQty'), variant: "destructive" });
      setQuantityDrafts((prev) => ({ ...prev, [lineId]: line.counted_quantity != null ? String(line.counted_quantity) : "" }));
      return;
    }
    if (line.counted_quantity === qty) return; // sem alteração

    setSavingLineId(lineId);
    try {
      const { data, error } = await supabase.rpc('rpc_update_inventory_count_line_quantity', {
        p_line_id: lineId,
        p_counted_quantity: qty,
      } as any);
      if (error) throw error;
      const result = data as any;
      setLines((prev) => prev.map((l) => (l.id === lineId
        ? {
          ...l,
          counted_quantity: result.counted_quantity,
          moved_during_count: result.moved_during_count,
          discrepancy_resolution: result.resolution_cleared ? null : l.discrepancy_resolution,
          resolution_notes: result.resolution_cleared ? null : l.resolution_notes,
          stock_movement_id: result.resolution_cleared ? null : l.stock_movement_id,
        }
        : l)));
      if (result.resolution_cleared) {
        setResolutionDrafts((prev) => ({ ...prev, [lineId]: { resolution: "", notes: "" } }));
      }
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.quantityError'), description: error.message, variant: "destructive" });
      setQuantityDrafts((prev) => ({ ...prev, [lineId]: line.counted_quantity != null ? String(line.counted_quantity) : "" }));
    } finally {
      setSavingLineId(null);
    }
  };

  const updateResolutionDraft = (lineId: string, patch: Partial<{ resolution: ResolutionType | ""; notes: string }>) => {
    setResolutionDrafts((prev) => ({
      ...prev,
      [lineId]: { resolution: prev[lineId]?.resolution ?? "", notes: prev[lineId]?.notes ?? "", ...patch },
    }));
  };

  const handleResolveLine = async (lineId: string) => {
    const draft = resolutionDrafts[lineId];
    if (!draft || !draft.resolution) return;
    if (draft.resolution === "aceite_sem_ajuste" && !draft.notes.trim()) {
      toast({ title: t('stockCounts.toast.resolveError'), description: t('stockCounts.toast.notesRequired'), variant: "destructive" });
      return;
    }

    setResolvingLineId(lineId);
    try {
      const { error } = await supabase.rpc('rpc_resolve_inventory_count_line', {
        p_line_id: lineId,
        p_resolution: draft.resolution,
        p_notes: draft.notes.trim() || null,
      } as any);
      if (error) throw error;

      toast({ title: t('stockCounts.toast.resolveSuccess') });
      setResolutionDrafts((prev) => ({ ...prev, [lineId]: { resolution: "", notes: "" } }));
      await loadDetail();
      onChanged();
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.resolveError'), description: error.message, variant: "destructive" });
    } finally {
      setResolvingLineId(null);
    }
  };

  const handleFinalize = async () => {
    if (!countId) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.rpc('rpc_finalize_inventory_count', {
        p_inventory_count_id: countId,
      } as any);
      if (error) throw error;

      const result = data as any;
      toast({
        title: t('stockCounts.toast.finalizeSuccess', { document: result.document_number }),
        description: result.lines_uncounted > 0
          ? t('stockCounts.toast.finalizeSuccessUncounted', { count: result.lines_uncounted })
          : undefined,
      });
      await loadDetail();
      onChanged();
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.finalizeError'), description: error.message, variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  };

  const getDiff = (line: InventoryCountLineRow): number | null => (
    line.counted_quantity == null ? null : line.counted_quantity - line.system_quantity_at_start
  );

  const getResolutionLabel = (resolution: string) => {
    switch (resolution) {
      case "ajustado": return t('stockCounts.detail.lines.resolutionAdjusted');
      case "aceite_sem_ajuste": return t('stockCounts.detail.lines.resolutionAccepted');
      case "recontagem_pedida": return t('stockCounts.detail.lines.resolutionRecount');
      default: return resolution;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "em_contagem": return t('stockCounts.status.emContagem');
      case "finalizada": return t('stockCounts.status.finalizada');
      case "cancelada": return t('stockCounts.status.cancelada');
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      em_contagem: "bg-info/10 text-info",
      finalizada: "bg-success/10 text-success",
      cancelada: "bg-muted text-muted-foreground",
    };
    return colors[status] || colors.em_contagem;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('stockCounts.detail.title')}
            {header ? ` — ${header.document_number}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <OlyviaLoader size={32} />
          </div>
        ) : header ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.warehouse')}: </span>
                <span className="font-medium">{header.warehouses?.name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.category')}: </span>
                <span className="font-medium">{header.product_categories?.name || t('stockCounts.allCategories')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.status')}: </span>
                <Badge className={getStatusColor(header.status)}>{getStatusLabel(header.status)}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.startedAt')}: </span>
                <span className="font-medium">{new Date(header.started_at).toLocaleString('pt-PT')}</span>
              </div>
              {header.finalized_at && (
                <div>
                  <span className="text-muted-foreground">{t('stockCounts.detail.finalizedAt')}: </span>
                  <span className="font-medium">{new Date(header.finalized_at).toLocaleString('pt-PT')}</span>
                </div>
              )}
            </div>

            {isActive && !canEdit && canCount && (
              <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
                {t('stockCounts.detail.countOnlyNotice')}
              </p>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2">{t('stockCounts.detail.lines.title')}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockCounts.detail.lines.product')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.lines.systemQty')}</TableHead>
                    <TableHead className="text-right w-32">{t('stockCounts.detail.lines.countedQty')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.lines.difference')}</TableHead>
                    <TableHead>{t('stockCounts.detail.lines.moved')}</TableHead>
                    <TableHead className="min-w-[260px]">{t('stockCounts.detail.lines.resolution')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t('stockCounts.detail.lines.noLines')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => {
                      const diff = getDiff(line);
                      const needsResolution = diff !== null && diff !== 0 && !line.discrepancy_resolution;
                      const draft = resolutionDrafts[line.id] || { resolution: "" as const, notes: "" };
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-medium">
                            <div>{line.products?.name || '-'}</div>
                            {line.products?.sku && (
                              <div className="text-xs text-muted-foreground">{line.products.sku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{line.system_quantity_at_start}</TableCell>
                          <TableCell className="text-right">
                            {canCount && isActive ? (
                              <Input
                                type="number"
                                min={0}
                                className="w-24 ml-auto text-right"
                                value={quantityDrafts[line.id] ?? ""}
                                placeholder={t('stockCounts.detail.lines.countPlaceholder')}
                                disabled={savingLineId === line.id}
                                onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                onBlur={() => handleSaveQuantity(line.id)}
                              />
                            ) : (
                              <span>{line.counted_quantity ?? t('stockCounts.detail.lines.notCounted')}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {diff === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : diff === 0 ? (
                              <span className="text-success font-medium">0</span>
                            ) : (
                              <span className={diff > 0 ? "text-warning font-medium" : "text-destructive font-medium"}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.moved_during_count && (
                              <Badge variant="outline" className="gap-1">
                                <ArrowRightLeft className="w-3 h-3" /> {t('stockCounts.detail.lines.movedBadge')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.discrepancy_resolution ? (
                              <div className="space-y-0.5">
                                <Badge variant="secondary">{getResolutionLabel(line.discrepancy_resolution)}</Badge>
                                {line.resolution_notes && (
                                  <p className="text-xs text-muted-foreground">{line.resolution_notes}</p>
                                )}
                              </div>
                            ) : needsResolution && canEdit && isActive ? (
                              <div className="space-y-1.5">
                                <Select
                                  value={draft.resolution}
                                  onValueChange={(v) => updateResolutionDraft(line.id, { resolution: v as ResolutionType })}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={t('stockCounts.detail.lines.selectResolution')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ajustado">{t('stockCounts.detail.lines.resolutionAdjusted')}</SelectItem>
                                    <SelectItem value="aceite_sem_ajuste">{t('stockCounts.detail.lines.resolutionAccepted')}</SelectItem>
                                    <SelectItem value="recontagem_pedida">{t('stockCounts.detail.lines.resolutionRecount')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(draft.resolution === "aceite_sem_ajuste" || draft.resolution === "ajustado") && (
                                  <Textarea
                                    className="text-xs"
                                    rows={2}
                                    placeholder={t('stockCounts.detail.lines.notesPlaceholder')}
                                    value={draft.notes}
                                    onChange={(e) => updateResolutionDraft(line.id, { notes: e.target.value })}
                                  />
                                )}
                                {draft.resolution && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={resolvingLineId === line.id}
                                    onClick={() => handleResolveLine(line.id)}
                                  >
                                    {resolvingLineId === line.id ? t('stockCounts.detail.finalizing') : t('stockCounts.detail.lines.confirm')}
                                  </Button>
                                )}
                              </div>
                            ) : needsResolution ? (
                              <span className="text-xs text-muted-foreground">{t('stockCounts.detail.lines.selectResolution')}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">{t('stockCounts.detail.movements.title')}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockCounts.detail.movements.date')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.type')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.movements.quantity')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.movements.balanceAfter')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.document')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">{t('stockCounts.detail.movements.loading')}</TableCell></TableRow>
                  ) : movements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t('stockCounts.detail.movements.none')}</TableCell></TableRow>
                  ) : (
                    movements.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{new Date(row.created_at).toLocaleString('pt-PT')}</TableCell>
                        <TableCell>
                          <Badge variant={INCREASING_TYPES.has(row.movement_type) ? "default" : "outline"}>
                            {MOVEMENT_TYPE_LABELS[row.movement_type] || row.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {INCREASING_TYPES.has(row.movement_type) ? "+" : "-"}{row.quantity}
                        </TableCell>
                        <TableCell className="text-right">{row.balance_after}</TableCell>
                        <TableCell className="font-mono text-xs">{row.document_number}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {[row.counterparty, row.notes].filter(Boolean).join(" · ") || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {header && isActive && canEdit && (
          <DialogFooter>
            <Button onClick={handleFinalize} disabled={finalizing || loading}>
              {finalizing ? t('stockCounts.detail.finalizing') : t('stockCounts.detail.finalize')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
