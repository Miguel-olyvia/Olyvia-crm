import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Truck, Warehouse, History, ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ItemSuppliersTable from "@/components/inventory/ItemSuppliersTable";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";

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

interface WarehouseOption {
  id: string;
  name: string;
}

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

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  created_at: string;
  warehouses?: { name: string } | null;
}

// Painel "visão 360º do artigo" (Products.tsx) — secção 4.1 do plano de
// fornecedores múltiplos: Fornecedores + Stock por armazém + Movimentos
// recentes (Fase 4A/4B, stock_movements).
export default function ProductSuppliersDialog({ open, onOpenChange, productId, productName, organizationId }: ProductSuppliersDialogProps) {
  const [stockLoading, setStockLoading] = useState(false);
  const [stockRows, setStockRows] = useState<WarehouseStock[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);

  useEffect(() => {
    if (open && productId) {
      loadStock();
      loadMovements();
      loadWarehouses();
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

  const loadMovements = async () => {
    setMovementsLoading(true);
    const { data } = await supabase
      .from("stock_movements")
      .select("id, movement_type, quantity, balance_after, document_number, created_at, warehouses(name)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(30);
    setMovements((data || []) as MovementRow[]);
    setMovementsLoading(false);
  };

  const loadWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("name");
    setWarehouses((data || []) as WarehouseOption[]);
  };

  const handleMovementSuccess = () => {
    loadStock();
    loadMovements();
  };

  const stockStatus = (row: WarehouseStock) => {
    if (row.quantity <= 0) return { label: "Esgotado", variant: "destructive" as const };
    // reorder_point = 0 significa "nunca configurado", não "abaixo do ponto de
    // encomenda" — mesma regra do motor de alertas (generate-notifications) e
    // de Stocks.tsx (getStockStatusCode).
    if (row.reorder_point > 0 && row.quantity <= row.reorder_point) return { label: "Abaixo do ponto de encomenda", variant: "outline" as const };
    return { label: "OK", variant: "default" as const };
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <DialogTitle>{productName}</DialogTitle>
          <Button size="sm" variant="outline" onClick={() => setMovementDialogOpen(true)}>
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Registar movimento
          </Button>
        </DialogHeader>

        <Tabs defaultValue="suppliers">
          <TabsList>
            <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="w-3.5 h-3.5" />Fornecedores</TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5"><Warehouse className="w-3.5 h-3.5" />Stock por armazém</TabsTrigger>
            <TabsTrigger value="movements" className="gap-1.5"><History className="w-3.5 h-3.5" />Movimentos recentes</TabsTrigger>
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

          <TabsContent value="movements" className="mt-4">
            {movementsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : movements.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Sem movimentos registados ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Armazém</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Saldo depois</TableHead>
                    <TableHead>Documento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{new Date(row.created_at).toLocaleDateString('pt-PT')}</TableCell>
                      <TableCell>{row.warehouses?.name || "-"}</TableCell>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <StockMovementDialog
      open={movementDialogOpen}
      onOpenChange={setMovementDialogOpen}
      organizationId={organizationId}
      warehouses={warehouses}
      defaultProductId={productId}
      onSuccess={handleMovementSuccess}
    />
    </>
  );
}
