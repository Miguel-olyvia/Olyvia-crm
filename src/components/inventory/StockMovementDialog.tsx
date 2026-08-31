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
import { Plus, Trash2, AlertCircle } from "lucide-react";

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

// Fase 5.0F (pedido do utilizador, 2026-08-31): quando o profissional regista
// manualmente uma Saída para satisfazer uma Encomenda Cliente concreta, dá
// para ligar o movimento a esse contrato — mesma ideia de "prova rastreável"
// já usada pela dedução automática (Fase 5.0B), mas aqui é uma escolha manual
// via rpc_decrement_stock(p_sale_source_type, p_sale_source_id), não uma
// trigger. Não substitui nem interage com a dedução automática.
interface ClientOrderOption {
  contract_id: string;
  contract_number: string;
  client_name: string | null;
}

// Multi-produto (pedido do utilizador, 2026-08-31): cada movimento pode
// afetar vários produtos de uma vez — ex. um profissional a processar uma
// saída de vários produtos ao mesmo tempo. Campos comuns ao movimento
// (armazém, motivo, contraparte, notas, encomenda de origem) ficam
// partilhados; produto/quantidade/fornecedor/custo são por linha porque
// variam por produto.
interface MovementLine {
  key: string;
  productId: string;
  quantity: string;
  itemSupplierId: string;
  unitCost: string;
  itemSuppliers: ItemSupplierOption[];
  itemSuppliersLoaded: boolean;
  error?: string;
}

const makeEmptyLine = (productId = ""): MovementLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  productId,
  quantity: "",
  itemSupplierId: "",
  unitCost: "",
  itemSuppliers: [],
  itemSuppliersLoaded: false,
});

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  warehouses: Warehouse[];
  // Pré-preenchidos quando aberto a partir de uma linha concreta de Stocks —
  // ficam bloqueados (não editáveis, só 1 linha) nesse caso, para não se poder
  // mudar o produto/armazém de um movimento que partiu de um contexto
  // específico.
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
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || "");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [direction, setDirection] = useState<"positivo" | "negativo">("positivo");
  const [reason, setReason] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [lines, setLines] = useState<MovementLine[]>([makeEmptyLine(defaultProductId)]);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Ligação opcional a uma Encomenda Cliente — só relevante para "saida".
  const [clientOrderId, setClientOrderId] = useState("");
  const [clientOrders, setClientOrders] = useState<ClientOrderOption[]>([]);
  const [clientOrdersLoaded, setClientOrdersLoaded] = useState(false);

  const isProductLocked = Boolean(defaultProductId);
  const isWarehouseLocked = Boolean(defaultWarehouseId) && movementType !== "transferencia";
  const needsSupplier = movementType === "entrada" || movementType === "devolucao";

  // Reset the form each time the dialog opens, re-applying whatever context it
  // was opened with (produto/armazém pré-preenchidos a partir de uma linha).
  useEffect(() => {
    if (!open) return;
    setMovementType("entrada");
    setWarehouseId(defaultWarehouseId || "");
    setToWarehouseId("");
    setDirection("positivo");
    setReason("");
    setCounterparty("");
    setNotes("");
    setClientOrderId("");
    setLines([makeEmptyLine(defaultProductId)]);
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

  // Encomendas Clientes assinadas — só carregado quando o tipo "Saída" é
  // escolhido pela primeira vez (não bloqueia a abertura do diálogo).
  useEffect(() => {
    if (!open || movementType !== "saida" || clientOrdersLoaded || !organizationId) return;
    (async () => {
      const { data, error } = await supabase.rpc('rpc_list_client_order_documents', {
        p_organization_id: organizationId,
        p_search: null,
        p_status_filter: null,
        p_limit: 100,
        p_offset: 0,
      } as any);
      if (error) {
        // Best-effort — permissão em falta (client_contracts.view) não deve
        // bloquear o registo de movimento, só esconde o campo de ligação.
        setClientOrdersLoaded(true);
        return;
      }
      setClientOrders(((data as any[]) || []).map((r) => ({
        contract_id: r.contract_id, contract_number: r.contract_number, client_name: r.client_name,
      })));
      setClientOrdersLoaded(true);
    })();
  }, [open, movementType, organizationId, clientOrdersLoaded]);

  // Fornecedores de uma linha concreta — carregado sob-demanda, quando o
  // produto dessa linha muda ou quando o tipo de movimento passa a precisar
  // de fornecedor (entrada/devolução).
  const loadSuppliersForLine = async (lineKey: string, productId: string) => {
    if (!productId) return;
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
    setLines((prev) => prev.map((l) => (
      l.key === lineKey
        ? { ...l, itemSuppliers: (data || []) as ItemSupplierOption[], itemSuppliersLoaded: true, itemSupplierId: "" }
        : l
    )));
  };

  const updateLine = (key: string, patch: Partial<MovementLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch, error: undefined } : l)));
  };

  const handleProductChange = (lineKey: string, productId: string) => {
    updateLine(lineKey, { productId, itemSuppliers: [], itemSuppliersLoaded: false, itemSupplierId: "" });
    if (needsSupplier && productId) {
      loadSuppliersForLine(lineKey, productId);
    }
  };

  // Quando o tipo de movimento passa a precisar de fornecedor, carrega os
  // fornecedores das linhas que já têm produto escolhido mas ainda não foram
  // carregadas para esse efeito.
  useEffect(() => {
    if (!needsSupplier) return;
    lines.forEach((l) => {
      if (l.productId && !l.itemSuppliersLoaded) {
        loadSuppliersForLine(l.key, l.productId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSupplier]);

  const addLine = () => setLines((prev) => [...prev, makeEmptyLine()]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const validateLine = (line: MovementLine): string | null => {
    if (!line.productId) return "Escolhe um produto.";
    const qty = parseInt(line.quantity, 10);
    if (!qty || qty <= 0) return "Quantidade tem de ser positiva.";
    if (needsSupplier && !line.itemSupplierId) return "Escolhe o fornecedor.";
    return null;
  };

  const runLineRpc = async (line: MovementLine): Promise<{ error: any }> => {
    const qty = parseInt(line.quantity, 10);
    switch (movementType) {
      case "entrada":
        return supabase.rpc("rpc_register_stock_entry", {
          p_product_id: line.productId,
          p_warehouse_id: warehouseId,
          p_qty: qty,
          p_item_supplier_id: line.itemSupplierId,
          p_unit_cost: line.unitCost.trim() ? Number(line.unitCost) : null,
          p_counterparty: counterparty.trim() || null,
          p_notes: notes.trim() || null,
        });
      case "saida":
        return supabase.rpc("rpc_decrement_stock", {
          p_product_id: line.productId,
          p_warehouse_id: warehouseId,
          p_qty: qty,
          p_document_number: null,
          p_document_type: "venda",
          p_counterparty: counterparty.trim() || null,
          p_notes: notes.trim() || null,
          p_sale_source_type: clientOrderId ? "contract" : null,
          p_sale_source_id: clientOrderId || null,
        } as any);
      case "transferencia":
        return supabase.rpc("rpc_register_stock_transfer", {
          p_product_id: line.productId,
          p_from_warehouse_id: warehouseId,
          p_to_warehouse_id: toWarehouseId,
          p_qty: qty,
          p_notes: notes.trim() || null,
        });
      case "ajuste":
        return supabase.rpc("rpc_adjust_stock", {
          p_product_id: line.productId,
          p_warehouse_id: warehouseId,
          p_qty: qty,
          p_direction: direction,
          p_reason: reason.trim(),
          p_notes: notes.trim() || null,
        });
      case "devolucao":
        return supabase.rpc("rpc_register_supplier_return", {
          p_product_id: line.productId,
          p_warehouse_id: warehouseId,
          p_qty: qty,
          p_item_supplier_id: line.itemSupplierId,
          p_notes: notes.trim() || null,
        });
      case "quebra":
        return supabase.rpc("rpc_register_stock_loss", {
          p_product_id: line.productId,
          p_warehouse_id: warehouseId,
          p_qty: qty,
          p_reason: reason.trim(),
          p_notes: notes.trim() || null,
        });
    }
  };

  const handleSubmit = async () => {
    // Validações partilhadas ao movimento inteiro.
    if (!warehouseId) {
      toast({ title: "Erro", description: movementType === "transferencia" ? "Escolhe o armazém de origem." : "Escolhe o armazém.", variant: "destructive" });
      return;
    }
    if (movementType === "transferencia") {
      if (!toWarehouseId) {
        toast({ title: "Erro", description: "Escolhe o armazém de destino.", variant: "destructive" });
        return;
      }
      if (warehouseId === toWarehouseId) {
        toast({ title: "Erro", description: "Origem e destino têm de ser diferentes.", variant: "destructive" });
        return;
      }
    }
    if ((movementType === "ajuste" || movementType === "quebra") && !reason.trim()) {
      toast({ title: "Erro", description: movementType === "ajuste" ? "Indica o motivo do ajuste." : "Indica o motivo da quebra.", variant: "destructive" });
      return;
    }

    // Validações por linha.
    const lineErrors = lines.map((l) => validateLine(l));
    if (lineErrors.some((e) => e)) {
      setLines((prev) => prev.map((l, i) => ({ ...l, error: lineErrors[i] || undefined })));
      toast({ title: "Erro", description: "Corrige as linhas assinaladas antes de continuar.", variant: "destructive" });
      return;
    }
    // Produtos repetidos na mesma submissão — evita 2 movimentos concorrentes
    // sobre o mesmo par produto/armazém na mesma ação (junta-os manualmente).
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.productId)) {
        setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, error: "Produto repetido — junta as quantidades numa única linha." } : x)));
        toast({ title: "Erro", description: "Há produtos repetidos na lista.", variant: "destructive" });
        return;
      }
      seen.add(l.productId);
    }

    setSubmitting(true);
    const succeededKeys: string[] = [];
    const failed: MovementLine[] = [];
    try {
      // Sequencial, não em paralelo — cada linha é uma RPC atómica própria,
      // mas correr todas ao mesmo tempo sobre o mesmo armazém aumentaria
      // contenção de lock desnecessária (fn_stock_movements_apply faz
      // SELECT ... FOR UPDATE por par produto/armazém).
      for (const line of lines) {
        const { error } = await runLineRpc(line);
        if (error) {
          failed.push({ ...line, error: error.message });
        } else {
          succeededKeys.push(line.key);
        }
      }

      if (failed.length === 0) {
        toast({ title: "Movimento registado", description: `${MOVEMENT_LABELS[movementType]} — ${lines.length} produto(s).` });
        onOpenChange(false);
        onSuccess();
      } else if (succeededKeys.length === 0) {
        toast({ title: "Erro ao registar movimento", description: `Nenhuma linha foi registada (${failed.length} erro(s) — ver detalhe abaixo).`, variant: "destructive" });
        setLines(failed);
      } else {
        toast({
          title: "Registado parcialmente",
          description: `${succeededKeys.length} produto(s) registado(s), ${failed.length} falharam — corrige e tenta novamente.`,
          variant: "destructive",
        });
        setLines(failed);
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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

          {movementType === "ajuste" && (
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
          )}

          {(movementType === "ajuste" || movementType === "quebra") && (
            <div>
              <Label>Motivo</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={movementType === "ajuste" ? "ex.: contagem física trimestral" : "ex.: dano no transporte"}
              />
            </div>
          )}

          {movementType === "saida" && (
            <div>
              <Label>Encomenda Cliente de origem (opcional)</Label>
              <Select value={clientOrderId || "none"} onValueChange={(v) => setClientOrderId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhuma — saída sem ligação a um contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma — saída sem ligação a um contrato</SelectItem>
                  {clientOrders.map((o) => (
                    <SelectItem key={o.contract_id} value={o.contract_id}>
                      {o.contract_number} — {o.client_name || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Liga esta saída à Encomenda Cliente que está a satisfazer — fica rastreável em "Encomendas Clientes" como prova, e o documento pode ser visto/gerado em PDF a partir de lá.
              </p>
            </div>
          )}

          {/* Linhas de produto — múltiplos produtos por movimento */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Produtos</Label>
              {!isProductLocked && (
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar produto
                </Button>
              )}
            </div>

            {lines.map((line) => (
              <div key={line.key} className="rounded-md border p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Produto</Label>
                    <Select
                      value={line.productId}
                      onValueChange={(v) => handleProductChange(line.key, v)}
                      disabled={isProductLocked}
                    >
                      <SelectTrigger><SelectValue placeholder="Escolhe um produto" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </div>
                  {!isProductLocked && lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-5"
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {needsSupplier && (
                  <div>
                    <Label className="text-xs">Fornecedor</Label>
                    <Select
                      value={line.itemSupplierId}
                      onValueChange={(v) => updateLine(line.key, { itemSupplierId: v })}
                      disabled={!line.productId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={line.productId ? "Escolhe um fornecedor" : "Escolhe primeiro o produto"} />
                      </SelectTrigger>
                      <SelectContent>
                        {line.itemSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.suppliers?.name || "—"}
                            {s.purchase_price != null ? ` · ${s.purchase_price.toFixed(2)}€` : ""}
                            {s.supplier_sku ? ` · ${s.supplier_sku}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {line.productId && line.itemSuppliersLoaded && line.itemSuppliers.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Este produto não tem nenhum fornecedor ativo associado — adiciona um em Produtos primeiro.
                      </p>
                    )}
                  </div>
                )}

                {movementType === "entrada" && (
                  <div>
                    <Label className="text-xs">Custo unitário (opcional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={
                        line.itemSuppliers.find((s) => s.id === line.itemSupplierId)?.purchase_price != null
                          ? `Preço do fornecedor: ${line.itemSuppliers.find((s) => s.id === line.itemSupplierId)!.purchase_price!.toFixed(2)}€`
                          : "—"
                      }
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                    />
                  </div>
                )}

                {line.error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {line.error}
                  </p>
                )}
              </div>
            ))}
          </div>

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
            {submitting ? "A registar..." : `Registar movimento${lines.length > 1 ? ` (${lines.length} produtos)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
