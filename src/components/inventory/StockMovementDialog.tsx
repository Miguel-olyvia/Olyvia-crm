import { useEffect, useMemo, useRef, useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Plus, Trash2, AlertCircle, AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
// 20261204290000: a Encomenda Cliente tem número próprio (EC-AAAA-NNNN) e
// origem (contrato / venda direta / manual) — mesmos campos e mesma regra de
// fallback que ClientOrders.tsx (order_number null → contract_number).
type ClientOrderOriginType = "contract" | "direct_sale" | "manual";

interface ClientOrderOption {
  contract_id: string;
  contract_number: string;
  client_name: string | null;
  order_number: string | null;
  origin_type: ClientOrderOriginType | null;
  origin_number: string | null;
}

const toClientOrderOption = (r: any): ClientOrderOption => ({
  contract_id: r.contract_id,
  contract_number: r.contract_number,
  client_name: r.client_name ?? null,
  order_number: r.order_number ?? null,
  origin_type: (r.origin_type ?? null) as ClientOrderOriginType | null,
  origin_number: r.origin_number ?? null,
});

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
  // Estado da linha na Encomenda Cliente de origem, quando a linha foi
  // pré-preenchida a partir de lá — só para mostrar aviso, não bloqueia nada
  // (o utilizador pode sempre confirmar/editar/remover manualmente).
  sourceLineStatus?: "servido_por_stock" | "recebido" | "a_aguardar_encomenda" | "sem_fornecedor";
}

const STOCK_INTEGER_ONLY_MSG = "O stock só regista unidades inteiras.";

// Reserva de stock para Encomendas Clientes assinadas (20261204310000), por
// produto e ao nível da ORGANIZAÇÃO (todos os armazéns) — resultado de
// rpc_get_product_stock_reservations.
interface ProductReservation {
  qty_reserved: number;
  qty_missing: number;
  orders_count: number;
}

const toNum = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

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
  // Tipo inicial (por omissão "entrada") — ex. "ajuste" quando aberto a partir
  // da edição de stock, onde a quantidade deixou de ser editável.
  defaultMovementType?: MovementType;
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
  open, onOpenChange, organizationId, warehouses, defaultProductId, defaultWarehouseId, defaultMovementType, onSuccess,
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
  // Opção escolhida guardada à parte: a lista muda com a pesquisa e a
  // encomenda escolhida pode deixar de estar nos resultados.
  const [selectedClientOrder, setSelectedClientOrder] = useState<ClientOrderOption | null>(null);
  const [clientOrders, setClientOrders] = useState<ClientOrderOption[]>([]);
  // Últimas 100 sem pesquisa — base para filtrar no cliente pelo nº de
  // origem (VD-…), que o p_search da RPC não cobre.
  const [recentClientOrders, setRecentClientOrders] = useState<ClientOrderOption[]>([]);
  const [clientOrdersFetching, setClientOrdersFetching] = useState(false);
  const [clientOrderPickerOpen, setClientOrderPickerOpen] = useState(false);
  const [clientOrderSearch, setClientOrderSearch] = useState("");
  const [debouncedClientOrderSearch, setDebouncedClientOrderSearch] = useState("");
  const clientOrdersRequestRef = useRef(0);
  const [clientOrderLoading, setClientOrderLoading] = useState(false);
  // Reserva da própria Encomenda Cliente ligada (qty_reserved somado por
  // produto): uma saída para essa encomenda pode consumir a sua reserva.
  const [clientOrderReservedByProduct, setClientOrderReservedByProduct] = useState<Record<string, number>>({});

  // Aviso não bloqueante: reservas e stock total da organização por produto.
  const [reservations, setReservations] = useState<Record<string, ProductReservation>>({});
  const [orgStockByProduct, setOrgStockByProduct] = useState<Record<string, number>>({});

  const isProductLocked = Boolean(defaultProductId);
  const isWarehouseLocked = Boolean(defaultWarehouseId) && movementType !== "transferencia";
  const needsSupplier = movementType === "entrada" || movementType === "devolucao";

  // Reset the form each time the dialog opens, re-applying whatever context it
  // was opened with (produto/armazém pré-preenchidos a partir de uma linha).
  useEffect(() => {
    if (!open) return;
    setMovementType(defaultMovementType || "entrada");
    setWarehouseId(defaultWarehouseId || "");
    setToWarehouseId("");
    setDirection("positivo");
    setReason("");
    setCounterparty("");
    setNotes("");
    setClientOrderId("");
    setSelectedClientOrder(null);
    setClientOrderPickerOpen(false);
    setClientOrderSearch("");
    setDebouncedClientOrderSearch("");
    setClientOrderReservedByProduct({});
    setReservations({});
    setOrgStockByProduct({});
    setLines([makeEmptyLine(defaultProductId)]);
  }, [open, defaultProductId, defaultWarehouseId, defaultMovementType]);

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

  // Debounce da pesquisa de Encomenda Cliente (pesquisa no servidor).
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedClientOrderSearch(clientOrderSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [clientOrderSearch]);

  // Encomendas Clientes assinadas — só carregado com o tipo "Saída" (não
  // bloqueia a abertura do diálogo). Pesquisa no servidor via p_search (cobre
  // nº do contrato, nº EC e nome do cliente), para não depender das primeiras
  // 100. Respostas fora de ordem são ignoradas (clientOrdersRequestRef).
  useEffect(() => {
    if (!open || movementType !== "saida" || !organizationId) return;
    const requestId = ++clientOrdersRequestRef.current;
    const search = debouncedClientOrderSearch;
    setClientOrdersFetching(true);
    (async () => {
      const { data, error } = await supabase.rpc('rpc_list_client_order_documents', {
        p_organization_id: organizationId,
        p_search: search || null,
        p_status_filter: null,
        p_limit: 100,
        p_offset: 0,
      } as any);
      if (requestId !== clientOrdersRequestRef.current) return;
      setClientOrdersFetching(false);
      if (error) {
        // Best-effort — permissão em falta (client_orders.view) não deve
        // bloquear o registo de movimento: a lista fica só com "Nenhuma".
        setClientOrders([]);
        return;
      }
      const rows = ((data as unknown as any[] | null) || []).map(toClientOrderOption);
      setClientOrders(rows);
      if (!search) setRecentClientOrders(rows);
    })();
  }, [open, movementType, organizationId, debouncedClientOrderSearch]);

  // Resultados do servidor + as recentes cujo nº de origem (VD-…) contém a
  // pesquisa — o p_search da RPC não procura no nº da venda direta.
  const clientOrderResults = useMemo(() => {
    const search = debouncedClientOrderSearch.toLowerCase();
    if (!search) return clientOrders;
    const ids = new Set(clientOrders.map((o) => o.contract_id));
    const byOrigin = recentClientOrders.filter(
      (o) => !ids.has(o.contract_id) && (o.origin_number || "").toLowerCase().includes(search),
    );
    return [...clientOrders, ...byOrigin];
  }, [clientOrders, recentClientOrders, debouncedClientOrderSearch]);

  // "Contrato CC-…" / "Venda Direta VD-…" / "Sem documento anterior" — mesmos
  // textos de ClientOrders.tsx. Sem origin_type (RPC antiga) não mostra nada.
  const describeClientOrderOrigin = (o: ClientOrderOption): string | null => {
    if (o.origin_type === "direct_sale") {
      return `${t('clientOrders.origin.directSale')}${o.origin_number ? ` ${o.origin_number}` : ""}`;
    }
    if (o.origin_type === "contract") {
      return t('clientOrders.origin.contract', { number: o.origin_number || o.contract_number });
    }
    if (o.origin_type === "manual") return t('clientOrders.origin.manual');
    return null;
  };

  const formatClientOrderLabel = (o: ClientOrderOption): string => {
    const origin = describeClientOrderOrigin(o);
    return `${o.order_number || o.contract_number} — ${o.client_name || "—"}${origin ? ` · ${origin}` : ""}`;
  };

  // Pré-preenchimento (pedido do utilizador, 2026-08-31): ao escolher a
  // Encomenda Cliente, as linhas de produto passam a preencher-se sozinhas a
  // partir do documento (rpc_get_client_order_document, Fase 5.0F) — em vez
  // de o profissional ter de escolher produto a produto. Continua totalmente
  // editável a seguir (adicionar/remover/mudar quantidade) — proteção para
  // quando o preenchimento automático não é o que se quer, ou falha.
  const handleClientOrderChange = async (value: string) => {
    const id = value === "none" ? "" : value;
    setClientOrderId(id);
    setClientOrderReservedByProduct({});
    if (!id) return;

    setClientOrderLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_get_client_order_document', {
        p_contract_id: id,
      } as any);
      if (error) throw error;

      const doc = data as any;
      const docLines = (doc?.lines as any[]) || [];
      if (docLines.length === 0) {
        toast({ title: "Encomenda sem linhas de produto", description: "Não há produtos associados a este contrato — adiciona manualmente.", variant: "destructive" });
        return;
      }

      setLines(docLines.map((l) => ({
        ...makeEmptyLine(l.product_id),
        quantity: String(l.quantity ?? ""),
        sourceLineStatus: l.line_status,
      })));

      const ownReserved: Record<string, number> = {};
      docLines.forEach((l) => {
        if (l.product_id && toNum(l.qty_reserved) > 0) {
          ownReserved[l.product_id] = (ownReserved[l.product_id] || 0) + toNum(l.qty_reserved);
        }
      });
      setClientOrderReservedByProduct(ownReserved);

      const alreadyServed = docLines.filter((l) => l.line_status === "servido_por_stock" || l.line_status === "recebido").length;
      if (alreadyServed > 0) {
        toast({
          title: "Atenção — possível duplicação",
          description: `${alreadyServed} produto(s) desta encomenda já consta(m) como servido(s)/recebido(s). Confirma antes de registar, para não descontar stock a dobrar.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar a Encomenda Cliente", description: error.message, variant: "destructive" });
    } finally {
      setClientOrderLoading(false);
    }
  };

  const selectClientOrder = (order: ClientOrderOption | null) => {
    setSelectedClientOrder(order);
    setClientOrderPickerOpen(false);
    handleClientOrderChange(order ? order.contract_id : "none");
  };

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
    updateLine(lineKey, { productId, itemSuppliers: [], itemSuppliersLoaded: false, itemSupplierId: "", sourceLineStatus: undefined });
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

  // Movimentos que tiram stock da organização (a transferência só o muda de
  // armazém, não mexe no total da organização, logo não consome reservas).
  const consumesOrgStock = movementType === "saida"
    || movementType === "quebra"
    || movementType === "devolucao"
    || (movementType === "ajuste" && direction === "negativo");

  const productIdsKey = useMemo(
    () => Array.from(new Set(lines.map((l) => l.productId).filter(Boolean))).sort().join(","),
    [lines],
  );

  // Reservas por produto (rpc_get_product_stock_reservations) + stock total da
  // organização (armazéns ativos, a mesma base da reserva). Falhar isto nunca
  // impede o registo: o aviso simplesmente não aparece.
  useEffect(() => {
    if (!open || !consumesOrgStock || !organizationId || !productIdsKey) return;
    const productIds = productIdsKey.split(",");
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("rpc_get_product_stock_reservations", {
          p_organization_id: organizationId,
          p_product_ids: productIds,
        });
        if (error) throw error;
        const nextReservations: Record<string, ProductReservation> = {};
        ((data as any[]) || []).forEach((r) => {
          if (!r?.product_id) return;
          nextReservations[r.product_id] = {
            qty_reserved: toNum(r.qty_reserved),
            qty_missing: toNum(r.qty_missing),
            orders_count: toNum(r.orders_count),
          };
        });
        const reservedIds = Object.keys(nextReservations).filter((id) => nextReservations[id].qty_reserved > 0);
        const nextOrgStock: Record<string, number> = {};
        if (reservedIds.length > 0) {
          const { data: stockRows, error: stockError } = await (supabase as any)
            .from("stocks")
            .select("product_id, quantity, warehouses!inner(deleted_at)")
            .eq("organization_id", organizationId)
            .is("deleted_at", null)
            .is("warehouses.deleted_at", null)
            .in("product_id", reservedIds);
          if (stockError) throw stockError;
          ((stockRows as any[]) || []).forEach((row) => {
            nextOrgStock[row.product_id] = (nextOrgStock[row.product_id] || 0) + toNum(row.quantity);
          });
        }
        if (cancelled) return;
        setReservations(nextReservations);
        setOrgStockByProduct(nextOrgStock);
      } catch (error) {
        console.warn("[StockMovementDialog] não foi possível obter as reservas de stock", error);
        if (cancelled) return;
        setReservations({});
        setOrgStockByProduct({});
      }
    })();
    return () => { cancelled = true; };
  }, [open, consumesOrgStock, organizationId, productIdsKey]);

  // Quanto desta linha sai de stock reservado para OUTRAS encomendas:
  // livre = stock da organização − reservado (sem a reserva da própria
  // encomenda ligada, numa saída); consome o que a quantidade passar do livre.
  const getReservedConsumption = (line: MovementLine): { qty: number; orders: number } | null => {
    if (!consumesOrgStock || !line.productId) return null;
    const res = reservations[line.productId];
    if (!res || res.qty_reserved <= 0) return null;
    const qty = parseLineQty(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const own = movementType === "saida" && clientOrderId ? (clientOrderReservedByProduct[line.productId] || 0) : 0;
    const otherReserved = Math.max(0, res.qty_reserved - own);
    if (otherReserved <= 0) return null;
    const orgStock = Math.max(0, orgStockByProduct[line.productId] || 0);
    const free = Math.max(0, orgStock - otherReserved);
    const consumed = Math.min(otherReserved, Math.max(0, qty - free));
    if (consumed <= 0) return null;
    const orders = Math.max(1, res.orders_count - (own > 0 ? 1 : 0));
    return { qty: Math.round(consumed * 1e6) / 1e6, orders };
  };

  const addLine = () => setLines((prev) => [...prev, makeEmptyLine()]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  // O stock conta-se em unidades inteiras. Antes era parseInt, que truncava
  // em silêncio (1,5 → 1); agora um decimal é recusado na validação.
  const parseLineQty = (raw: string): number => Number(String(raw).trim().replace(",", "."));

  const validateLine = (line: MovementLine): string | null => {
    if (!line.productId) return "Escolhe um produto.";
    const qty = parseLineQty(line.quantity);
    if (!line.quantity.trim() || !Number.isFinite(qty) || qty <= 0) return "Quantidade tem de ser positiva.";
    if (!Number.isInteger(qty)) return STOCK_INTEGER_ONLY_MSG;
    if (needsSupplier && !line.itemSupplierId) return "Escolhe o fornecedor.";
    return null;
  };

  const runLineRpc = async (line: MovementLine): Promise<{ error: any }> => {
    // validateLine já garantiu um inteiro positivo.
    const qty = parseLineQty(line.quantity);
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
      toast({
        title: "Erro",
        description: lineErrors.includes(STOCK_INTEGER_ONLY_MSG) ? STOCK_INTEGER_ONLY_MSG : "Corrige as linhas assinaladas antes de continuar.",
        variant: "destructive",
      });
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
              {/* `modal` no Popover: o conteúdo vai para um portal fora do
                  DialogContent e, sem isto, o focus trap do diálogo rouba o
                  foco ao CommandInput e o dropdown fecha-se sozinho. */}
              <Popover modal open={clientOrderPickerOpen} onOpenChange={setClientOrderPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientOrderPickerOpen}
                    className="w-full justify-between font-normal"
                    disabled={clientOrderLoading}
                  >
                    <span className="truncate">
                      {clientOrderId && selectedClientOrder
                        ? formatClientOrderLabel(selectedClientOrder)
                        : "Nenhuma — saída sem ligação a um contrato"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[24rem] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Pesquisar por EC, contrato, VD ou cliente…"
                      value={clientOrderSearch}
                      onValueChange={setClientOrderSearch}
                    />
                    <CommandList className="max-h-72 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem value="__none__" onSelect={() => selectClientOrder(null)}>
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", !clientOrderId ? "opacity-100" : "opacity-0")} />
                          Nenhuma — saída sem ligação a um contrato
                        </CommandItem>
                        {clientOrderResults.map((o) => (
                          <CommandItem key={o.contract_id} value={o.contract_id} onSelect={() => selectClientOrder(o)}>
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", clientOrderId === o.contract_id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{formatClientOrderLabel(o)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {(clientOrdersFetching || clientOrderResults.length === 0) && (
                        <p className="py-3 text-center text-sm text-muted-foreground">
                          {clientOrdersFetching ? "A pesquisar…" : "Nenhuma encomenda encontrada."}
                        </p>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground mt-1">
                {clientOrderLoading
                  ? "A carregar produtos da encomenda…"
                  : "Liga esta saída à Encomenda Cliente que está a satisfazer — os produtos preenchem-se automaticamente abaixo (continua editável). Fica rastreável em \"Encomendas Clientes\" como prova."}
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
                      step={1}
                      inputMode="numeric"
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

                {(line.sourceLineStatus === "servido_por_stock" || line.sourceLineStatus === "recebido") && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Esta linha já consta como {line.sourceLineStatus === "servido_por_stock" ? "servida por stock" : "recebida"} na Encomenda Cliente — confirma que não é duplicação antes de registar.
                  </p>
                )}

                {(() => {
                  const consumption = getReservedConsumption(line);
                  // Saída sem Encomenda Cliente escolhida sobre um produto com
                  // reservas: avisa sempre (mesmo com stock livre suficiente),
                  // para quem está a servir uma dessas encomendas a escolher
                  // acima. rpc_get_product_stock_reservations só devolve o total
                  // por produto e o nº de encomendas, não quais são.
                  const reservation = line.productId ? reservations[line.productId] : undefined;
                  const unlinkedReserved = movementType === "saida" && !clientOrderId && reservation && reservation.qty_reserved > 0
                    ? reservation
                    : null;
                  if (!consumption && !unlinkedReserved) return null;
                  return (
                    <Alert className="border-amber-500/50 bg-amber-50 py-2 dark:bg-amber-950/20">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
                        {unlinkedReserved && (
                          <span className="block">
                            {t('inventory.movement.unlinkedReservedWarning', {
                              qty: Math.round(unlinkedReserved.qty_reserved * 1e6) / 1e6,
                              count: Math.max(1, unlinkedReserved.orders_count),
                            })}
                          </span>
                        )}
                        {consumption && (
                          <span className={unlinkedReserved ? "block mt-1" : undefined}>
                            {t('inventory.movement.reservedWarning', { qty: consumption.qty, count: consumption.orders })}
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  );
                })()}

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
