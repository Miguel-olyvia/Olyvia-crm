import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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

const INCREASING_TYPES = new Set(["entrada", "transferencia_entrada", "ajuste_positivo"]);

interface StockMovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
}

interface StockMovementsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  warehouseId: string;
  productName?: string;
  warehouseName?: string;
}

export default function StockMovementsHistoryDialog({
  open, onOpenChange, productId, warehouseId, productName, warehouseName,
}: StockMovementsHistoryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StockMovementRow[]>([]);

  useEffect(() => {
    if (!open || !productId || !warehouseId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("stock_movements")
          .select("id, movement_type, quantity, balance_after, document_number, counterparty, notes, created_at")
          .eq("product_id", productId)
          .eq("warehouse_id", warehouseId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        setRows((data || []) as StockMovementRow[]);
      } catch (error: any) {
        toast({ title: "Erro ao carregar movimentos", description: error.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, productId, warehouseId, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Movimentos recentes{productName ? ` — ${productName}` : ""}{warehouseName ? ` (${warehouseName})` : ""}
          </DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead className="text-right">Saldo depois</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center">A carregar...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem movimentos registados ainda.</TableCell></TableRow>
            ) : (
              rows.map((row) => (
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
      </DialogContent>
    </Dialog>
  );
}
