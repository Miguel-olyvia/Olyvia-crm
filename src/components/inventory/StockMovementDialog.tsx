import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type MovementType = "entrada" | "saida" | "transferencia" | "ajuste" | "devolucao" | "quebra";

const MOVEMENT_LABELS: Record<MovementType, string> = {
  entrada: "Entrada (compra)",
  saida: "Saída (venda)",
  transferencia: "Transferência entre armazéns",
  ajuste: "Ajuste de inventário",
  devolucao: "Devolução a fornecedor",
  quebra: "Quebra / perda",
};

interface Warehouse {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
}

interface ItemSupplierOption {
  id: string;
  supplier_id: string;
  purchase_price: number | null;
  supplier_sku: string | null;
  suppliers?: { name: string } | null;
}

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  warehouses: Warehouse[];
  // Pré-preenchidos quando aberto a partir de uma linha concreta de Stocks —
  // ficam bloqueados (não editáveis) nesse caso, para não se poder mudar o
  // produto/armazém de um movimento que partiu de um contexto específico.
  defaultProductId?: string;
  defaultWarehouseId?: string;
  onSuccess: () => void;
}

// PostgREST caps an unranged response at 1000 rows — paginado por segurança
// (mesmo padrão já usado em PurchaseOrders.tsx/Stocks.tsx).
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

export default function StockMovementDialog({
  open, onOpenChange, organizationId, warehouses, defaultProductId, defaultWarehouseId, onSuccess,
}: StockMovementDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [movementType, setMovementType] = useState<MovementType>("entrada");
  const [productId, setProductId] = useState(defaultProductId || "");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [itemSupplierId, setItemSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [direction, setDirection] = useState<"positivo" | "negativo">("positivo");
  const [reason, setReason] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [itemSuppliers, setItemSuppliers] = useState<ItemSupplierOption[]>([]);

  // Reset the form each time the dialog opens, re-applying whatever context it
  // was opened with (product/warehouse pré-preenchidos a partir de uma linha).
  useEffect(() => {
    if (!open) return;
    setMovementType("entrada");
    setProductId(defaultProductId || "");
    setWarehouseId(defaultWarehouseId || "");
    setToWarehouseId("");
    setQuantity("");
    setItemSupplierId("");
    setUnitCost("");
    setDirection("positivo");
    setReason("");
    setCounterparty("");
    setNotes("");
  }, [open, defaultProductId, defaultWarehouseId]);

  // Produtos — só carregado quando o diálogo abre (não em todo o carregamento
  // da página de Stocks), paginado.
  useEffect(() => {
    if (!open || productsLoaded || !organizationId) return;
    (async () => {
      const { data, error } = await fetchAllRows(() =>
        (supabase as any)
          .from("products")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name", { ascending: true })
          .order("id", { ascending: true })
      );
      if (error) {
        toast({ title: "Erro ao carregar produtos", description: error.message, variant: "destructive" });
        return;
      }
      setProducts(data || []);
      setProductsLoaded(true);
    })();
  }, [open, organizationId, productsLoaded, toast]);

  // Fornecedores deste produto — só relevante para entrada/devolução. Refaz-se
  // sempre que o produto muda.
  useEffect(() => {
    if (!open || !productId || (movementType !== "entrada" && movementType !== "devolucao")) return;
    (async () => {
      const { data, error } = await supabase
        .from("item_suppliers")
        .select("id, supplier_id, purchase_price, supplier_sku, suppliers(name)")
        .eq("product_id", productId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("is_preferred", { ascending: false });
      if (error) {
        toast({ title: "Erro ao carregar fornecedores", description: error.message, variant: "destructive" });
        return;
      }
      setItemSuppliers((data || []) as ItemSupplierOption[]);
      setItemSupplierId("");
    })();
  }, [open, productId, movementType, toast]);

  const selectedItemSupplier = itemSuppliers.find((s) => s.id === itemSupplierId);

  const handleSubmit = async () => {
    const qty = parseInt(quantity, 10);
    if (!productId) {
      toast({ title: "Erro", description: "Escolhe um produto.", variant: "destructive" });
      return;
    }
    if (!qty || qty <= 0) {
      toast({ title: "Erro", description: "Quantidade tem de ser positiva.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      switch (movementType) {
        case "entrada": {
          if (!warehouseId) throw new Error("Escolhe o armazém de destino.");
          if (!itemSupplierId) throw new Error("Escolhe o fornecedor.");
          const { error } = await supabase.rpc("rpc_register_stock_entry", {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_qty: qty,
            p_item_supplier_id: itemSupplierId,
            p_unit_cost: unitCost.trim() ? Number(unitCost) : null,
            p_counterparty: counterparty.trim() || null,
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
        case "saida": {
          if (!warehouseId) throw new Error("Escolhe o armazém.");
          const { error } = await supabase.rpc("rpc_decrement_stock", {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_qty: qty,
            p_document_number: null,
            p_document_type: "venda",
            p_counterparty: counterparty.trim() || null,
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
        case "transferencia": {
          if (!warehouseId) throw new Error("Escolhe o armazém de origem.");
          if (!toWarehouseId) throw new Error("Escolhe o armazém de destino.");
          if (warehouseId === toWarehouseId) throw new Error("Origem e destino têm de ser diferentes.");
          const { error } = await supabase.rpc("rpc_register_stock_transfer", {
            p_product_id: productId,
            p_from_warehouse_id: warehouseId,
            p_to_warehouse_id: toWarehouseId,
            p_qty: qty,
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
        case "ajuste": {
          if (!warehouseId) throw new Error("Escolhe o armazém.");
          if (!reason.trim()) throw new Error("Indica o motivo do ajuste.");
          const { error } = await supabase.rpc("rpc_adjust_stock", {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_qty: qty,
            p_direction: direction,
            p_reason: reason.trim(),
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
        case "devolucao": {
          if (!warehouseId) throw new Error("Escolhe o armazém.");
          if (!itemSupplierId) throw new Error("Escolhe o fornecedor.");
          const { error } = await supabase.rpc("rpc_register_supplier_return", {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_qty: qty,
            p_item_supplier_id: itemSupplierId,
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
        case "quebra": {
          if (!warehouseId) throw new Error("Escolhe o armazém.");
          if (!reason.trim()) throw new Error("Indica o motivo da quebra.");
          const { error } = await supabase.rpc("rpc_register_stock_loss", {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_qty: qty,
            p_reason: reason.trim(),
            p_notes: notes.trim() || null,
          });
          if (error) throw error;
          break;
        }
      }

      toast({ title: "Movimento registado", description: MOVEMENT_LABELS[movementType] });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro ao registar movimento", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const isProductLocked = Boolean(defaultProductId);
  const isWarehouseLocked = Boolean(defaultWarehouseId) && movementType !== "transferencia";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registar movimento de stock</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tipo de movimento</Label>
            <Select value={movementType} onValueChange={(v) => setMovementType(v as MovementType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((type) => (
                  <SelectItem key={type} value={type}>{MOVEMENT_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId} disabled={isProductLocked}>
              <SelectTrigger><SelectValue placeholder="Escolhe um produto" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{movementType === "transferencia" ? "Armazém origem" : "Armazém"}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isWarehouseLocked}>
                <SelectTrigger><SelectValue placeholder="Escolhe um armazém" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {movementType === "transferencia" && (
              <div>
                <Label>Armazém destino</Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Escolhe um armazém" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.filter((w) => w.id !== warehouseId).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {(movementType === "entrada" || movementType === "devolucao") && (
            <div>
              <Label>Fornecedor</Label>
              <Select value={itemSupplierId} onValueChange={setItemSupplierId} disabled={!productId}>
                <SelectTrigger>
                  <SelectValue placeholder={productId ? "Escolhe um fornecedor" : "Escolhe primeiro o produto"} />
                </SelectTrigger>
                <SelectContent>
                  {itemSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.suppliers?.name || "—"}
                      {s.purchase_price != null ? ` · ${s.purchase_price.toFixed(2)}€` : ""}
                      {s.supplier_sku ? ` · ${s.supplier_sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {productId && itemSuppliers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Este produto não tem nenhum fornecedor ativo associado — adiciona um em Produtos primeiro.
                </p>
              )}
            </div>
          )}

          {movementType === "entrada" && (
            <div>
              <Label>Custo unitário (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={selectedItemSupplier?.purchase_price != null ? `Preço do fornecedor: ${selectedItemSupplier.purchase_price.toFixed(2)}€` : "—"}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          )}

          {movementType === "ajuste" && (
            <>
              <div>
                <Label>Direção</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as "positivo" | "negativo")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positivo">Positivo (encontrou mais do que o registado)</SelectItem>
                    <SelectItem value="negativo">Negativo (encontrou menos do que o registado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Motivo</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: contagem física trimestral" />
              </div>
            </>
          )}

          {movementType === "quebra" && (
            <div>
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: dano no transporte" />
            </div>
          )}

          {(movementType === "entrada" || movementType === "saida") && (
            <div>
              <Label>{movementType === "entrada" ? "Fornecedor (referência livre, opcional)" : "Cliente (opcional)"}</Label>
              <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </div>
          )}

          <div>
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "A registar..." : "Registar movimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
