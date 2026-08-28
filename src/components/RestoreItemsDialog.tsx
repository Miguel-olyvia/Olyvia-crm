import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { captureFlowError } from "@/lib/observability/captureFlowError";

interface TrashedRow {
  id: string;
  label: string;
  deleted_at: string | null;
}

interface RestoreItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Table to query for trashed (deleted_at IS NOT NULL) rows. */
  tableName: string;
  /** Active organization scope. Required — every query is scoped by it. */
  organizationId?: string;
  /** RPC name that restores a single row: rpc(p_id uuid, p_organization_id uuid). */
  restoreRpc: string;
  /** Column(s) used to build the row's display label (joined with " · "). */
  labelColumns: string[];
  /** Called after a successful restore so the parent can reload its own list. */
  onRestored: () => void;
}

/**
 * Generic "eliminados" (trash) list + restore action for taxonomy tables that
 * use deleted_at/deleted_by soft delete (products, product_categories,
 * product_attributes, brands, bundles). Mirrors the recoverability guarantee
 * already implemented for Leads/Contactos/Clientes/Deals/Propostas/
 * Orçamentos/Contratos/Utilizadores (see src/pages/Trash.tsx), scoped here to
 * a single table since these taxonomy RPCs take (p_id, p_organization_id)
 * rather than the generic entity-facet dispatch Trash.tsx uses.
 */
export function RestoreItemsDialog({
  open,
  onOpenChange,
  tableName,
  organizationId,
  restoreRpc,
  labelColumns,
  onRestored,
}: RestoreItemsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TrashedRow[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const selectCols = Array.from(new Set(["id", "deleted_at", ...labelColumns])).join(", ");
      const { data, error } = await (supabase as any)
        .from(tableName)
        .select(selectCols)
        .eq("organization_id", organizationId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const mapped: TrashedRow[] = (data || []).map((r: any) => ({
        id: r.id,
        label: labelColumns.map((c) => r[c]).filter(Boolean).join(" · ") || r.id,
        deleted_at: r.deleted_at,
      }));
      setRows(mapped);
    } catch (e: any) {
      toast({ title: "Erro a carregar eliminados", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tableName, organizationId, labelColumns, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restore = async (id: string) => {
    if (!organizationId) return;
    setRestoringId(id);
    try {
      const { error } = await supabase.rpc(restoreRpc as any, {
        p_id: id,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      toast({ title: "Restaurado", description: "Registo restaurado com sucesso." });
      setRows((prev) => prev.filter((r) => r.id !== id));
      onRestored();
    } catch (e: any) {
      captureFlowError(e, "soft-delete-restore");
      toast({ title: "Erro a restaurar", description: e.message, variant: "destructive" });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" />
            Eliminados
          </DialogTitle>
          <DialogDescription>
            Registos eliminados desta empresa. Pode restaurá-los a qualquer momento.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Eliminado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">A carregar…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sem registos eliminados.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell>{r.deleted_at ? format(new Date(r.deleted_at), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoringId === r.id}
                      onClick={() => restore(r.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
