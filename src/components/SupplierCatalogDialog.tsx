import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

interface SupplierCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
}

interface CatalogRow {
  id: string;
  item_type: string;
  supplier_sku: string | null;
  purchase_price: number | null;
  currency: string;
  lead_time_days: number | null;
  is_preferred: boolean;
  is_active: boolean;
  products?: { name: string; sku: string } | null;
  services?: { name: string; sku: string } | null;
}

// Vista inversa de item_suppliers (secção 4 do plano de fornecedores
// múltiplos): que produtos/serviços usam este fornecedor. Só leitura +
// remover associação — adicionar faz-se do lado do Produto/Serviço
// (ProductSuppliersDialog / ServiceSuppliersDialog), para não duplicar o
// mesmo formulário de adicionar nos dois sentidos.
export default function SupplierCatalogDialog({ open, onOpenChange, supplierId, supplierName }: SupplierCatalogDialogProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  // Ecrã de Fornecedores: custo de compra e código do fornecedor exigem
  // suppliers.view_pricing — sem ela, lê-se item_suppliers_public (sem
  // purchase_price/currency/supplier_sku) em vez de item_suppliers.
  const canViewPricing = hasPermission("suppliers.view_pricing");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [deletingRow, setDeletingRow] = useState<CatalogRow | null>(null);

  useEffect(() => {
    if (open && supplierId) {
      loadRows();
    }
  }, [open, supplierId, canViewPricing]);

  const loadRows = async () => {
    setLoading(true);
    const { data, error } = canViewPricing
      ? await (supabase as any)
          .from("item_suppliers")
          .select("id, item_type, supplier_sku, purchase_price, currency, lead_time_days, is_preferred, is_active, products(name, sku), services(name, sku)")
          .eq("supplier_id", supplierId)
          .is("deleted_at", null)
          .order("item_type")
      : await (supabase as any)
          .from("item_suppliers_public")
          .select("id, item_type, lead_time_days, is_preferred, is_active, products(name, sku), services(name, sku)")
          .eq("supplier_id", supplierId)
          .order("item_type");
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      const mapped = canViewPricing
        ? ((data || []) as CatalogRow[])
        : ((data || []) as any[]).map((row) => ({
            ...row,
            supplier_sku: null,
            purchase_price: null,
            currency: "",
          })) as CatalogRow[];
      setRows(mapped);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    const { error } = await supabase.rpc("rpc_delete_item_supplier", { p_id: deletingRow.id });
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Associação removida" });
    setDeletingRow(null);
    loadRows();
  };

  const itemLabel = (row: CatalogRow) => {
    if (row.item_type === "product") return row.products?.name || "-";
    return row.services?.name || "-";
  };
  const itemSku = (row: CatalogRow) => (row.item_type === "product" ? row.products?.sku : row.services?.sku) || "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catálogo — {supplierName}</DialogTitle>
          <DialogDescription>Produtos e serviços associados a este fornecedor</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">Nenhum produto ou serviço associado a este fornecedor.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Artigo</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Código de compra</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Prazo (dias)</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.is_preferred && (
                      <span title="Preferencial">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{row.item_type === "product" ? "Produto" : "Serviço"}</TableCell>
                  <TableCell className="font-medium">{itemLabel(row)}</TableCell>
                  <TableCell>{itemSku(row)}</TableCell>
                  <TableCell>{canViewPricing ? (row.supplier_sku || "-") : <span className="text-muted-foreground italic">Sem permissão</span>}</TableCell>
                  <TableCell>{canViewPricing ? (row.purchase_price != null ? `${row.purchase_price} ${row.currency}` : "-") : <span className="text-muted-foreground italic">Sem permissão</span>}</TableCell>
                  <TableCell>{row.lead_time_days ?? "-"}</TableCell>
                  <TableCell><Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Sim" : "Não"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingRow(row)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <AlertDialog open={!!deletingRow} onOpenChange={(v) => { if (!v) setDeletingRow(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover associação a "{deletingRow ? itemLabel(deletingRow) : ''}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Este fornecedor deixa de estar associado a este artigo. O histórico de preços fica preservado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
