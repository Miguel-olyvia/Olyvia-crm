import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ItemSuppliersTable from "@/components/inventory/ItemSuppliersTable";

interface ProductSuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  organizationId: string;
}

interface WarehouseStock {
  id: string;
  quantity: number;
  reorder_point: number;
  warehouses?: { name: string } | null;
}

// Painel "visão 360º do artigo" (Products.tsx) — secção 4.1 do plano de
// fornecedores múltiplos. A tab "Movimentos recentes" fica para a Fase 4,
// quando stock_movements existir; por agora só Fornecedores + Stock.
export default function ProductSuppliersDialog({ open, onOpenChange, productId, productName, organizationId }: ProductSuppliersDialogProps) {
  const [stockLoading, setStockLoading] = useState(false);
  const [stockRows, setStockRows] = useState<WarehouseStock[]>([]);

  useEffect(() => {
    if (open && productId) {
      loadStock();
    }
  }, [open, productId]);

  const loadStock = async () => {
    setStockLoading(true);
    const { data } = await (supabase as any)
      .from("stocks")
      .select("id, quantity, reorder_point, warehouses(name)")
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("quantity", { ascending: false });
    setStockRows((data || []) as WarehouseStock[]);
    setStockLoading(false);
  };

  const stockStatus = (row: WarehouseStock) => {
    if (row.quantity <= 0) return { label: "Esgotado", variant: "destructive" as const };
    if (row.quantity <= row.reorder_point) return { label: "Abaixo do ponto de encomenda", variant: "outline" as const };
    return { label: "OK", variant: "default" as const };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productName}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="suppliers">
          <TabsList>
            <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="w-3.5 h-3.5" />Fornecedores</TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5"><Warehouse className="w-3.5 h-3.5" />Stock por armazém</TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers" className="mt-4">
            <ItemSuppliersTable itemType="product" itemId={productId} organizationId={organizationId} />
          </TabsContent>

          <TabsContent value="stock" className="mt-4">
            {stockLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : stockRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Sem stock registado para este produto em nenhum armazém.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Armazém</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Ponto de encomenda</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.map((row) => {
                    const status = stockStatus(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.warehouses?.name || "-"}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.reorder_point}</TableCell>
                        <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
