import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ShoppingCart, Pencil, Trash2, Download, Upload, Tag, X, FileDown, PackageCheck, Undo2, ChevronDown, ChevronRight, Layers, List, Ban } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { PermissionGate } from "@/components/PermissionGate";
import LineAttributesDialog from "@/components/LineAttributesDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/integrations/supabase/types";
import { exportPurchaseOrdersToCSV, parsePurchaseOrdersCSV } from "@/utils/purchaseOrdersExportImport";
import { useTranslation } from "@/hooks/useTranslation";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { pdf } from '@react-pdf/renderer';
import { PurchaseOrderPDFDocument } from "@/components/PurchaseOrderPDFDocument";
import { purchaseOrderSchema } from "@/lib/validations";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { integerQtyMessage, isValidQtyFor, requiresIntegerQty, roundToIntegerQty } from "@/utils/quotes/integerQty";
import { useProductBaseUomCodes } from "@/hooks/useProductBaseUomCodes";

type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"] & {
  suppliers: { name: string } | null;
};

// Pré-seleção de linhas no diálogo "Reverter receção" — vem do link por linha
// em ClientOrders.tsx (?open=<po>&item=… ou &product=…&quote_line=…&component=…).
type RevertPreselect = {
  itemIds?: string[];
  productId?: string | null;
  quoteLineId?: string | null;
  componentIndex?: number | null;
};

type PurchaseOrderItem = {
  id?: string;
  item_type: 'product' | 'service';
  product_id?: string;
  service_id?: string;
  description: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  total_price: number;
  selected_attributes?: Record<string, any>;
  notes?: string;
};

// Receção parcial (migration 20261114040000): tipo de conveniência para as
// linhas de purchase_order_items usadas no fluxo de receção.
// `products` (join) é usado para mostrar o nome REAL/atual do produto no
// diálogo — a `description` da linha é um snapshot da altura da encomenda e
// não distingue variantes cujo nome só difere na medida (ex.: "Base Duche
// Stone Plus" 70x70 vs 70x90 guardam a mesma description genérica).
// units_per_uom / received_to_stock_units vêm da própria linha (Row).
// products.uom (opcional) só serve para o rótulo das unidades de stock.
type PurchaseOrderItemWithReceipt = Database["public"]["Tables"]["purchase_order_items"]["Row"] & {
  products?: { name: string; uom?: { code: string | null } | null } | null;
};

// Destino por linha da receção (20261206130000): mesmo formato em
// rpc_receive_purchase_order_lines e rpc_preview_po_receipt. units_* em
// unidades de stock (já × units_per_uom); qty_* na unidade da linha.
type ReceiptAllocationLine = {
  purchase_order_item_id: string;
  units_per_uom?: number | null;
  destination?: "client_order" | "stock" | "split" | null;
  allocation_reason?: string | null;
  contract_order_number?: string | null;
  contract_active?: boolean | null;
  units_to_order?: number | null;
  units_to_stock?: number | null;
  qty_to_order?: number | null;
  qty_to_stock?: number | null;
  stock_quantity_now?: number | null;
  // Só no cliente: quantidade enviada na pré-visualização (descarta
  // repartições de uma quantidade já alterada).
  requested_quantity?: number;
};

type ReceiptAllocationResult = {
  order_number?: string;
  status?: string;
  stock_skipped?: boolean;
  units_to_order_total?: number | null;
  units_to_stock_total?: number | null;
  lines?: ReceiptAllocationLine[];
};

type PurchaseOrderReceiptRow = Database["public"]["Tables"]["purchase_order_receipts"]["Row"];

const formatQty = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString("pt-PT", { maximumFractionDigits: 4 });

// Anular o resto de uma linha / da PO inteira ("não vou receber o resto").
// Tabela purchase_order_item_cancellations e RPCs rpc_cancel_po_line_remainder,
// rpc_cancel_po_remainder, rpc_undo_po_line_cancellation e
// rpc_undo_po_cancellation_batch ainda não estão nos tipos gerados — cast local.
type PoCancellationReason = "found_stock" | "supplier_unavailable" | "other";

const PO_CANCELLATION_REASON_LABELS: Record<PoCancellationReason, string> = {
  found_stock: "Encontrei stock / outra solução",
  supplier_unavailable: "Fornecedor sem produto",
  other: "Outro",
};

const poCancellationReasonLabel = (reason: string | null | undefined) =>
  PO_CANCELLATION_REASON_LABELS[reason as PoCancellationReason] || reason || "—";

type PoItemCancellationRow = {
  id: string;
  organization_id: string;
  purchase_order_id: string;
  // null quando a linha da PO foi recriada na edição (ON DELETE SET NULL).
  purchase_order_item_id: string | null;
  quantity_cancelled: number;
  quantity_before: number | null;
  quantity_after: number | null;
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  undone_at: string | null;
  undone_by: string | null;
  undo_reason: string | null;
  // Preenchido nas anulações da PO inteira (desfazem-se em lote — a BD recusa
  // desfazer só uma linha de um lote).
  batch_id?: string | null;
  po_status_after?: string | null;
};

type PoCancelTarget =
  | {
      kind: "line";
      source: "receive";
      orderId: string;
      orderNumber: string;
      itemId: string;
      quantity: number;
      uomLabel: string;
      productName: string;
      isClientOrder: boolean;
    }
  | {
      kind: "order";
      source: "receive" | "list";
      orderId: string;
      orderNumber: string;
      // null quando não se conhecem as linhas (ação na lista).
      lineCount: number | null;
      isClientOrder: boolean;
    };

type PoUndoTarget = {
  cancellationId: string;
  batchId: string | null;
  orderId: string;
  source: "receive" | "orderDialog";
  description: string;
};

const poCancellationsDb = () => supabase as any;

// Unidade da linha para as notas de anulação: a da embalagem (uom da linha,
// quando a query a trouxe) ou a do produto se a linha não for embalagem.
const poCancellationUomCode = (item: PurchaseOrderItemWithReceipt | undefined) => {
  const units = Number(item?.units_per_uom) || 1;
  const lineUom = (item as { uom?: { code: string | null } | null } | undefined)?.uom?.code;
  return lineUom || (units === 1 ? item?.products?.uom?.code : null) || "";
};

// Números de EC distintos referidos nas linhas (normalmente só um por PO).
const distinctContractNumbers = (lines: ReceiptAllocationLine[] | undefined) =>
  Array.from(new Set((lines || []).map((l) => l.contract_order_number).filter((n): n is string => !!n)));

// Rótulo da unidade de stock do produto (ex. "un", "m2"); "un" por omissão.
const stockUnitCode = (item: PurchaseOrderItemWithReceipt | undefined) =>
  item?.products?.uom?.code || "un";

// Unidades de stock recebidas numa linha que ainda não estão em stock (as
// que foram entregues à Encomenda Cliente).
const getUnitsNotInStock = (item: PurchaseOrderItemWithReceipt) =>
  (Number(item.received_quantity) || 0) * (Number(item.units_per_uom) || 1) - (Number(item.received_to_stock_units) || 0);

type ProductCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
};

type PriceInfo = {
  price: number | null;
  vat_rate: number | null;
};

type ProductAttribute = {
  id: string;
  name: string;
  code: string;
  value_type: string;
  unit: string | null;
  allowed_values: string[] | null;
  values: Array<{ id: string; value: string }>;
};

// PostgREST caps an unranged response at 1000 rows (Content-Range: 0-999/*,
// confirmed live via Network tab) — a plain .select() silently truncates for
// catalogs bigger than that (2000+ products for orgs like Mudelar), returning
// only whichever ~1000 happen to come first in undefined order. This paginates
// past that cap instead of ever relying on a single unranged request.
const fetchAllRows = async (
  buildQuery: () => any
): Promise<{ data: any[] | null; error: any }> => {
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

const PURCHASE_ORDERS_VIEW_STORAGE_KEY = "purchaseOrders.listViewMode";
// Chave do grupo "Sem fornecedor" na vista agrupada.
const NO_SUPPLIER_GROUP_KEY = "__no_supplier__";
// Lote de ids por pedido .in(...) — mantém o URL do PostgREST num tamanho seguro.
const ORIGIN_LOOKUP_CHUNK = 150;

const PurchaseOrders = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [services, setServices] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  // Filtros da listagem (frontend, tudo já carregado via fetchAllRows — sem
  // paginação, ver comentário em loadData()): fornecedor, estado e intervalo
  // de datas (aplicado a order_date ou actual_delivery_date, à escolha).
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilterValue, setStatusFilterValue] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateFilterField, setDateFilterField] = useState<"order_date" | "actual_delivery_date">("order_date");
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const loadRequestRef = useRef(0);
  // Receção (Fase 4C): dedicado, fora do dropdown de estado genérico — pede o
  // armazém de destino e liga-se a rpc_receive_purchase_order (gera a entrada
  // em stock_movements na mesma transação que muda o estado para 'received').
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  // isClientOrder: PO ligada a uma Encomenda Cliente (source_type='contract') —
  // o destino de cada linha (EC / stock / misto) vem de rpc_preview_po_receipt.
  const [receivingOrder, setReceivingOrder] = useState<{ id: string; order_number: string; isClientOrder: boolean } | null>(null);
  const [receiveWarehouses, setReceiveWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");
  // Receção parcial (20261114040000): linhas de produto desta encomenda e a
  // quantidade a receber agora por linha, editável — por omissão pré-preenchida
  // com o saldo por receber de cada linha (equivalente ao antigo "tudo de uma
  // vez", mas agora ajustável antes de confirmar).
  const [receiveLines, setReceiveLines] = useState<PurchaseOrderItemWithReceipt[]>([]);
  const [receiveLineQuantities, setReceiveLineQuantities] = useState<Record<string, number>>({});
  // Data real de entrega (suppliers.delivery_sla_days / purchase_orders.actual_delivery_date,
  // migration pendente) — só gravada quando a encomenda fica 'received', mas pedida sempre
  // (também é usada pelo relatório de SLA mesmo em receções parciais sucessivas).
  const [actualDeliveryDate, setActualDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiving, setReceiving] = useState(false);
  // Pré-visualização do destino por linha (rpc_preview_po_receipt, debounce):
  // chave = purchase_order_item_id. O erro (ex. acima do saldo) fica inline.
  const [receivePreview, setReceivePreview] = useState<Record<string, ReceiptAllocationLine>>({});
  const [receivePreviewError, setReceivePreviewError] = useState<string | null>(null);
  const [receivePreviewLoading, setReceivePreviewLoading] = useState(false);
  const receivePreviewRequestRef = useRef(0);

  // "Não vou receber o resto" (linha ou PO inteira) — anulações ativas por PO
  // (no diálogo de receção e no diálogo da encomenda) e diálogos de motivo /
  // desfazer.
  const [receiveCancellations, setReceiveCancellations] = useState<{ orderId: string; rows: PoItemCancellationRow[] } | null>(null);
  const [orderCancellations, setOrderCancellations] = useState<{ orderId: string; rows: PoItemCancellationRow[] } | null>(null);
  const [poCancelTarget, setPoCancelTarget] = useState<PoCancelTarget | null>(null);
  const [poCancelReason, setPoCancelReason] = useState<PoCancellationReason>("found_stock");
  const [poCancelNotes, setPoCancelNotes] = useState("");
  const [poCancelSubmitting, setPoCancelSubmitting] = useState(false);
  const [poUndoTarget, setPoUndoTarget] = useState<PoUndoTarget | null>(null);
  const [poUndoSubmitting, setPoUndoSubmitting] = useState(false);
  // Passar para stock (rpc_po_receipt_release_to_stock): recebido de linhas de
  // PO de contrato cuja Encomenda Cliente ficou inativa.
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  // contractInactiveKnown=false: estado da EC desconhecido (texto neutro).
  const [releaseOrder, setReleaseOrder] = useState<{ id: string; order_number: string; contractNumber: string; contractInactiveKnown: boolean } | null>(null);
  const [releaseLines, setReleaseLines] = useState<PurchaseOrderItemWithReceipt[]>([]);
  const [releaseSelectedIds, setReleaseSelectedIds] = useState<Set<string>>(new Set());
  const [releaseWarehouses, setReleaseWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [releaseWarehouseId, setReleaseWarehouseId] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [releasing, setReleasing] = useState(false);
  // Diálogo de detalhe: estado da EC ligada, linhas tal como gravadas
  // (received_to_stock_units) e histórico de receções — sempre com o id da PO,
  // para não mostrar dados de outra encomenda aberta entretanto.
  // active: null = estado da EC desconhecido (a RLS não devolveu o contrato).
  const [orderContractState, setOrderContractState] = useState<{ orderId: string; contractId: string; number: string; active: boolean | null } | null>(null);
  // PO aberta no diálogo de detalhe — respostas de outra PO são descartadas.
  const openOrderIdRef = useRef<string | null>(null);
  const [orderReceiptItems, setOrderReceiptItems] = useState<{ orderId: string; items: PurchaseOrderItemWithReceipt[] } | null>(null);
  const [orderReceipts, setOrderReceipts] = useState<{ orderId: string; rows: PurchaseOrderReceiptRow[]; warehouseNames: Record<string, string> } | null>(null);
  const [receiptHistoryOpen, setReceiptHistoryOpen] = useState(false);
  // Reverter receção (por linha) — para encomendas marcadas como recebidas por
  // engano. Liga a rpc_revert_purchase_order_receipt: as linhas escolhidas
  // voltam a "por receber" e o stock que entrou é retirado (recusa se já saiu).
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertingOrder, setRevertingOrder] = useState<{ id: string; order_number: string } | null>(null);
  const [revertLines, setRevertLines] = useState<PurchaseOrderItemWithReceipt[]>([]);
  const [revertSelectedIds, setRevertSelectedIds] = useState<Set<string>>(new Set());
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);
  // Encomenda aberta no diálogo de detalhe: nº, fornecedor e estado ORIGINAL
  // (não o do formulário) — decide o modo só de leitura. hasReceivedLines é
  // preenchido quando as linhas carregam (handleEdit).
  const [editingOrderMeta, setEditingOrderMeta] = useState<{
    id: string;
    orderNumber: string;
    supplierName: string;
    status: string;
    hasReceivedLines: boolean;
  } | null>(null);
  // Linha a pré-selecionar em "Reverter receção", lida do URL (?item=/?product=).
  const [pendingRevertPreselect, setPendingRevertPreselect] = useState<(RevertPreselect & { orderId: string }) | null>(null);
  // Ao passar do diálogo da encomenda para o de reversão, o primeiro não deve
  // devolver o foco ao gatilho (roubava-o ao diálogo que acabou de abrir).
  const skipOrderDialogFocusRestoreRef = useRef(false);
  // Fase 5.0F: link inverso — quando a encomenda foi gerada automaticamente a
  // partir de um Contrato assinado (source_type='contract'), mostra a origem
  // no diálogo de detalhe, com link de volta para "Encomendas Clientes".
  const [orderSourceInfo, setOrderSourceInfo] = useState<{
    contractId: string;
    originType: 'contract' | 'direct_sale' | 'manual';
    number: string;
    clientName: string;
  } | null>(null);
  // Coluna "Origem / Cliente" da lista: a mesma resolução de orderSourceInfo
  // (ver handleEdit), mas em lote para todas as encomendas com
  // source_type='contract' — chave = client_contracts.id (source_id).
  // Best-effort: se a leitura falhar ou a RLS não devolver a linha, a célula
  // mostra "—" e a lista continua a funcionar.
  const [listOriginByContract, setListOriginByContract] = useState<Record<string, {
    originType: 'contract' | 'direct_sale' | 'manual';
    number: string;
    clientName: string;
  }>>({});
  const listOriginRequestRef = useRef(0);
  // Vista da lista: agrupada por fornecedor (omissão) ou todas as encomendas.
  // A última escolha fica em localStorage.
  const [listViewMode, setListViewMode] = useState<'grouped' | 'all'>(() => {
    try {
      return localStorage.getItem(PURCHASE_ORDERS_VIEW_STORAGE_KEY) === 'all' ? 'all' : 'grouped';
    } catch {
      return 'grouped';
    }
  });
  const [expandedSupplierGroups, setExpandedSupplierGroups] = useState<Set<string>>(new Set());
  // Ligação manual, só na criação (20261115200000) — resolve o caso
  // "sem_fornecedor" em Encomendas Clientes: ao criar a encomenda daqui,
  // escolhe-se a Encomenda Cliente que está a satisfazer.
  const [newOrderClientOrderId, setNewOrderClientOrderId] = useState("");
  const [clientOrderOptions, setClientOrderOptions] = useState<{
    contract_id: string;
    contract_number: string;
    order_number: string | null;
    origin_type: 'contract' | 'direct_sale' | 'manual' | null;
    origin_number: string | null;
    client_name: string | null;
  }[]>([]);
  const [clientOrderOptionsLoaded, setClientOrderOptionsLoaded] = useState(false);
  // Pré-preenchimento de itens (pedido do utilizador, 2026-08-31): ao
  // escolher a Encomenda Cliente, os produtos dela ficam "pendentes" até
  // haver fornecedor escolhido (o preço depende do fornecedor) — nesse
  // momento são adicionados automaticamente aos "Itens da Encomenda", mesmo
  // padrão já usado em StockMovementDialog.tsx.
  const [pendingClientOrderLines, setPendingClientOrderLines] = useState<{ product_id: string; quantity: number }[]>([]);
  const [clientOrderLinesLoading, setClientOrderLinesLoading] = useState(false);
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  // Encomendas recebidas (total ou parcialmente) abrem só de leitura, venha o
  // diálogo de onde vier (lista, ?open= de Encomendas Clientes, …).
  const isOrderReadOnly =
    !!editingId &&
    editingOrderMeta?.id === editingId &&
    (editingOrderMeta.status === 'received' || editingOrderMeta.status === 'partially_received');

  const [formData, setFormData] = useState({
    supplier_id: "",
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery: "",
    status: "pending",
    notes: "",
  });

  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  // Unidade de stock dos produtos das linhas — quantidade inteira em unidades contáveis.
  const productUom = useProductBaseUomCodes(orderItems.map((item) => (item.item_type === "product" ? item.product_id : null)));
  const itemRequiresIntegerQty = (item: PurchaseOrderItem) =>
    requiresIntegerQty({
      hasProduct: item.item_type === "product" && !!item.product_id,
      lineUomId: null,
      baseUomCode: productUom.getBaseCode(item.product_id),
    });
  const [showItemsDialog, setShowItemsDialog] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<string[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<'product' | 'service'>('product');
  const [productAttributes, setProductAttributes] = useState<Map<string, ProductAttribute[]>>(new Map());
  // product_id/service_id -> { purchase_price, supplier_sku } for the SELECTED supplier,
  // resolved from item_suppliers (Fase 1). Determines which catalog items are eligible
  // to add to this order and at what price — replaces the deprecated
  // products.supplier_id/services.supplier_id single-supplier match.
  const [supplierProductRefs, setSupplierProductRefs] = useState<Map<string, { purchase_price: number | null; supplier_sku: string | null }>>(new Map());
  const [supplierServiceRefs, setSupplierServiceRefs] = useState<Map<string, { purchase_price: number | null; supplier_sku: string | null }>>(new Map());
  const [selectedItemAttributes, setSelectedItemAttributes] = useState<Record<string, Record<string, string>>>({});
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState<string>("");

  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
  });

  // Update organization selection when activeCompany changes
  useEffect(() => {
    if (activeCompany?.id) {
      setOrganizationSelection(prev => ({
        ...prev,
        companyId: activeCompany.id,
      }));
    }
  }, [activeCompany?.id]);

  // Load suppliers when company selection changes in the form
  useEffect(() => {
    const loadFormSuppliers = async () => {
      const companyId = organizationSelection.companyId;
      console.log("Loading suppliers for company:", companyId);
      
      if (!companyId) {
        console.log("No company selected, clearing suppliers");
        setSuppliers([]);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("organization_id", companyId);
        
        if (error) throw error;
        console.log("Loaded suppliers:", data);
        setSuppliers(data || []);
        
        // Reset supplier selection if it's not in the new list
        if (formData.supplier_id && !data?.find(s => s.id === formData.supplier_id)) {
          setFormData(prev => ({ ...prev, supplier_id: "" }));
        }
      } catch (error: any) {
        console.error("Error loading suppliers:", error);
      }
    };

    loadFormSuppliers();
  }, [organizationSelection.companyId]);

  // Resolve which products/services the SELECTED supplier can actually supply, via
  // item_suppliers (Fase 1 do plano de fornecedores) — substitui o antigo
  // products.supplier_id/services.supplier_id (deprecated, só guarda 1 fornecedor
  // por artigo). O catálogo em si (produtos/serviços/preços/atributos) vem de
  // loadCatalog() (ver mais abaixo), carregado à parte, uma vez por empresa,
  // quando o diálogo de nova/editar encomenda abre; este efeito só resolve, para
  // o fornecedor escolhido no cabeçalho da encomenda, QUAIS desses artigos ele
  // fornece e a que preço/referência — não volta a fazer fetch de products/services.
  useEffect(() => {
    const loadSupplierItemRefs = async () => {
      const companyId = organizationSelection.companyId;
      const supplierId = formData.supplier_id;

      if (!companyId || !supplierId) {
        setSupplierProductRefs(new Map());
        setSupplierServiceRefs(new Map());
        return;
      }

      try {
        const { data, error } = await (supabase as any)
          .from("item_suppliers")
          .select("product_id, service_id, purchase_price, supplier_sku")
          .eq("organization_id", companyId)
          .eq("supplier_id", supplierId)
          .eq("is_active", true)
          .is("deleted_at", null);

        if (error) throw error;

        const productMap = new Map<string, { purchase_price: number | null; supplier_sku: string | null }>();
        const serviceMap = new Map<string, { purchase_price: number | null; supplier_sku: string | null }>();

        (data || []).forEach((row: any) => {
          const info = { purchase_price: row.purchase_price ?? null, supplier_sku: row.supplier_sku ?? null };
          if (row.product_id) productMap.set(row.product_id, info);
          if (row.service_id) serviceMap.set(row.service_id, info);
        });

        setSupplierProductRefs(productMap);
        setSupplierServiceRefs(serviceMap);
      } catch (error: any) {
        console.error("Error loading supplier item references:", error);
        setSupplierProductRefs(new Map());
        setSupplierServiceRefs(new Map());
      }
    };

    loadSupplierItemRefs();
  }, [organizationSelection.companyId, formData.supplier_id]);

  useEffect(() => {
    if (activeCompany?.id) {
      setLoading(true);
      loadData();
    }
  }, [activeCompany?.id, showDeleted]);

  // Catálogo (produtos/serviços/preços/atributos) só é preciso para escolher
  // itens ao criar/editar uma encomenda — carregado sob demanda quando o
  // diálogo abre, não no carregamento inicial da lista. Reseta quando a
  // empresa ativa muda para forçar recarga do catálogo certo.
  useEffect(() => {
    setCatalogLoaded(false);
    setClientOrderOptionsLoaded(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (open && !catalogLoaded && activeCompany?.id) {
      loadCatalog();
    }
  }, [open, catalogLoaded, activeCompany?.id]);

  // Fase 5.0F: Encomendas Clientes assinadas, para a ligação manual opcional
  // ao criar uma encomenda nova (não relevante ao editar — ver
  // rpc_create_purchase_order, 20261115200000). Best-effort: falha de
  // permissão (client_orders.view) não bloqueia a criação da encomenda,
  // só esconde o campo.
  useEffect(() => {
    if (!open || editingId || clientOrderOptionsLoaded || !activeCompany?.id) return;
    (async () => {
      const { data, error } = await supabase.rpc('rpc_list_client_order_documents', {
        p_organization_id: activeCompany.id,
        p_search: null,
        p_status_filter: null,
        p_limit: 100,
        p_offset: 0,
      } as any);
      setClientOrderOptionsLoaded(true);
      if (error) return;
      setClientOrderOptions(((data as any[]) || []).map((r) => ({
        contract_id: r.contract_id,
        contract_number: r.contract_number,
        order_number: r.order_number ?? null,
        origin_type: r.origin_type ?? null,
        origin_number: r.origin_number ?? null,
        client_name: r.client_name,
      })));
    })();
  }, [open, editingId, clientOrderOptionsLoaded, activeCompany?.id]);

  // Fase 5.0F: abre o dialog de edição/detalhe de uma encomenda específica quando
  // se navega para cá a partir de outro ecrã (ex. "Encomendas Clientes", link por
  // linha em ClientOrders.tsx) com ?open=<purchase_order_id> — mesmo padrão de
  // cross-link já usado em ClientContracts.tsx.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (loading) return;

    const target = orders.find((o) => o.id === openId);
    if (target) {
      const itemId = searchParams.get("item");
      const productId = searchParams.get("product");
      const quoteLineId = searchParams.get("quote_line");
      const componentRaw = searchParams.get("component");
      const componentIndex = componentRaw !== null && componentRaw !== "" && Number.isFinite(Number(componentRaw))
        ? Number(componentRaw)
        : null;
      setPendingRevertPreselect(
        itemId || productId
          ? {
              orderId: target.id,
              itemIds: itemId ? [itemId] : undefined,
              productId: productId || null,
              quoteLineId: quoteLineId || null,
              componentIndex,
            }
          : null,
      );
      handleEdit(target);
    } else {
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: 'Encomenda não encontrada.',
        variant: "destructive",
      });
    }

    searchParams.delete("open");
    searchParams.delete("item");
    searchParams.delete("product");
    searchParams.delete("quote_line");
    searchParams.delete("component");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, orders, loading]);

  // Só orders + suppliers — o catálogo (produtos/serviços/preços/atributos)
  // carrega à parte, sob demanda, só quando o diálogo de nova/editar encomenda
  // abre (ver loadCatalog() abaixo). Antes este loadData() também carregava o
  // catálogo inteiro da organização em TODO o carregamento da lista — dezenas de
  // pedidos de rede por visita à página, o que tornava a página lenta e
  // aumentava a probabilidade de um desses pedidos falhar com "Failed to fetch".
  const loadData = async () => {
    if (!activeCompany?.id) {
      console.log("loadData: No activeCompany");
      return;
    }

    const requestId = ++loadRequestRef.current;

    try {
      const companyId = activeCompany.id;
      console.log("loadData: Loading purchase orders for company:", companyId, activeCompany.name);

      const [ordersRes, suppliersRes] = await Promise.all([
        fetchAllRows(() =>
          showDeleted
            ? supabase
                .from("purchase_orders")
                .select("*, suppliers(name)")
                .eq("organization_id", companyId)
                .not("deleted_at", "is", null)
                .order("created_at", { ascending: false })
            : supabase
                .from("purchase_orders")
                .select("*, suppliers(name)")
                .eq("organization_id", companyId)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
        ),
        supabase.from("suppliers").select("id, name").eq("organization_id", companyId).is("deleted_at", null),
      ]);

      // Um loadData() mais recente (ex.: alternou "Ver eliminados" outra vez antes
      // deste pedido terminar) já está em curso — descarta esta resposta desatualizada
      // em vez de sobrepor dados mais recentes com dados antigos.
      if (loadRequestRef.current !== requestId) return;

      console.log("loadData: Orders response:", ordersRes.data, ordersRes.error);

      if (ordersRes.error) throw ordersRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setOrders((ordersRes.data as PurchaseOrder[]) || []);
      setSuppliers(suppliersRes.data || []);
    } catch (error: any) {
      if (loadRequestRef.current !== requestId) return;
      captureFlowError(error, "purchase-order-lifecycle");
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  };

  // Catálogo completo (produtos + serviços + preços de compra + atributos), usado
  // apenas no formulário de criar/editar encomenda para escolher itens. Carregado
  // uma vez sob demanda (ver useEffect de `open`/`catalogLoaded` acima) em vez de em
  // todo o carregamento da lista de encomendas — isto evitava dezenas de pedidos de
  // rede (e falhas "Failed to fetch" ocasionais) só para mostrar a tabela.
  const loadCatalog = async () => {
    if (!activeCompany?.id) return;

    setCatalogLoading(true);
    try {
      const companyId = activeCompany.id;

      const productColumns = `
            id,
            sku,
            name,
            description,
            product_categories!category_id(name),
            brands(name)
          `;

      const fetchAllProductRows = (applyFilters: (q: any) => any) =>
        fetchAllRows(() => applyFilters(supabase.from("products").select(productColumns)));

      const [companyProductsRes, directProductsRes, servicesRes] = await Promise.all([
        fetchAllRows(() =>
          supabase.from("product_organizations").select("product_id").eq("organization_id", companyId)
        ),
        // Direct match: products owned by this org — the bulk of the catalog, paginated
        // past the 1000-row cap above.
        fetchAllProductRows((q) =>
          q
            .eq("organization_id", companyId)
            .eq("is_active", true)
            .eq("is_purchasable", true)
            .is("deleted_at", null)
        ),
        supabase
          .from("services")
          .select(`
            id,
            sku,
            name,
            short_desc,
            service_categories:service_category_id(name)
          `)
          .eq("is_active", true)
          .eq("organization_id", companyId),
      ]);

      if (companyProductsRes.error) throw companyProductsRes.error;
      if (directProductsRes.error) throw directProductsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      // Shared products: linked via product_organizations to this org but owned
      // (products.organization_id) by a DIFFERENT org — not covered by the direct query
      // above. This set is expected to be small (cross-org sharing is the exception, not
      // the rule), so a .in() over just these leftover ids stays well within URL limits.
      const directProductsData = directProductsRes.data || [];
      const directProductIds = new Set(directProductsData.map((p: any) => p.id));
      const junctionOnlyIds = (companyProductsRes.data || [])
        .map((p: any) => p.product_id)
        .filter((id: string) => id && !directProductIds.has(id));

      let sharedProductsData: any[] = [];
      if (junctionOnlyIds.length > 0) {
        const sharedRes = await fetchAllProductRows((q) =>
          q
            .eq("is_active", true)
            .eq("is_purchasable", true)
            .is("deleted_at", null)
            .in("id", junctionOnlyIds)
        );
        if (sharedRes.error) throw sharedRes.error;
        sharedProductsData = sharedRes.data || [];
      }

      const productsData: any[] = [...directProductsData, ...sharedProductsData];

      // Fetch product prices — batched (same BATCH=200 pattern as AddItemsDialog.tsx):
      // a single .in("product_id", productIds) with thousands of ids builds a query
      // string that fails outright with net::ERR_FAILED for large catalogs.
      const productIds = productsData?.map((p: any) => p.id) || [];
      const PRICE_BATCH = 200;
      const productPrices: any[] = [];
      for (let i = 0; i < productIds.length; i += PRICE_BATCH) {
        const batch = productIds.slice(i, i + PRICE_BATCH);
        if (batch.length === 0) continue;
        const { data: batchPrices, error: batchError } = await supabase
          .from("product_prices")
          .select("product_id, price, vat_rate")
          .eq("price_type", "purchase")
          .in("product_id", batch);
        if (batchError) throw batchError;
        productPrices.push(...(batchPrices || []));
      }

      const productPriceEntries: Array<[string, PriceInfo]> = (productPrices || [])
        .filter((p: any) => typeof p.product_id === "string")
        .map((p: any) => [p.product_id, { price: p.price ?? null, vat_rate: p.vat_rate ?? null }]);

      const productPricesMap = new Map<string, PriceInfo>(productPriceEntries);

      const mappedProducts: ProductCatalogItem[] = (productsData || []).map((product: any) => {
        const priceInfo = productPricesMap.get(product.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          sku: product.sku,
          category_name: product.product_categories?.name || null,
          brand_name: product.brands?.name || null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setProducts(mappedProducts);

      // Fetch product attributes — restrito aos produtos deste catálogo (em vez de
      // todos os produtos ativos de todas as organizações, como acontecia antes).
      await fetchProductAttributes(productIds);

      // Fetch service prices — same batching as product_prices above, for consistency
      // (services catalogs are usually much smaller, but no reason to risk it).
      const serviceIds = servicesRes.data?.map((s: any) => s.id) || [];
      const servicePrices: any[] = [];
      for (let i = 0; i < serviceIds.length; i += PRICE_BATCH) {
        const batch = serviceIds.slice(i, i + PRICE_BATCH);
        if (batch.length === 0) continue;
        const { data: batchPrices, error: batchError } = await supabase
          .from("service_prices")
          .select("service_id, price, vat_rate")
          .eq("price_type", "purchase")
          .in("service_id", batch);
        if (batchError) throw batchError;
        servicePrices.push(...(batchPrices || []));
      }

      const servicePriceEntries: Array<[string, PriceInfo]> = (servicePrices || [])
        .filter((p: any) => typeof p.service_id === "string")
        .map((p: any) => [p.service_id, { price: p.price ?? null, vat_rate: p.vat_rate ?? null }]);

      const servicePricesMap = new Map<string, PriceInfo>(servicePriceEntries);

      const mappedServices: ProductCatalogItem[] = (servicesRes.data || []).map((service: any) => {
        const priceInfo = servicePricesMap.get(service.id);
        return {
          id: service.id,
          name: service.name,
          description: service.short_desc,
          sku: service.sku,
          category_name: service.service_categories?.name || null,
          brand_name: null,
          purchase_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
        };
      });

      setServices(mappedServices);
      setCatalogLoaded(true);
    } catch (error: any) {
      toast({
        title: t('purchaseOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchProductAttributes = async (productIds: string[]) => {
    try {
      if (productIds.length === 0) return;

      // Restrito aos produtos deste catálogo (batched a 200 ids, mesmo padrão dos
      // preços acima) — antes ia buscar TODOS os produtos ativos de TODAS as
      // organizações só para montar este mapa de atributos.
      const BATCH = 200;
      const productsData: Array<{ id: string; category_id: string | null }> = [];
      for (let i = 0; i < productIds.length; i += BATCH) {
        const batch = productIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("products")
          .select("id, category_id")
          .in("id", batch);
        if (error) throw error;
        productsData.push(...(data || []));
      }

      // Get unique category IDs
      const categoryIds = [...new Set(productsData.map(p => p.category_id).filter(Boolean))];

      if (categoryIds.length === 0) {
        return;
      }

      // Get attributes for these categories
      const { data: categoryAttrs, error: caError } = await supabase
        .from("category_attributes")
        .select(`
          category_id,
          attribute_id,
          product_attributes!inner (
            id,
            code,
            label,
            value_type,
            unit,
            allowed_values
          )
        `)
        .in("category_id", categoryIds);

      if (caError) throw caError;

      const attributesMap = new Map<string, ProductAttribute[]>();

      productsData.forEach(product => {
        if (!product.category_id) return;

        const productAttrs = categoryAttrs
          ?.filter(ca => ca.category_id === product.category_id)
          .map(ca => ({
            id: ca.attribute_id,
            name: ca.product_attributes.label,
            code: ca.product_attributes.code,
            value_type: ca.product_attributes.value_type,
            unit: ca.product_attributes.unit,
            allowed_values: Array.isArray(ca.product_attributes.allowed_values)
              ? ca.product_attributes.allowed_values as string[]
              : null,
            values: []
          })) || [];

        if (productAttrs.length > 0) {
          attributesMap.set(product.id, productAttrs);
        }
      });

      setProductAttributes(attributesMap);
    } catch (error: any) {
      console.error("Error loading product attributes:", error);
    }
  };

  // Histórico de receções (purchase_order_receipts, só leitura) — best-effort:
  // se falhar, a secção simplesmente não aparece. Nomes dos armazéns por id
  // (inclui armazéns já apagados, para o histórico continuar legível).
  const loadOrderReceipts = async (orderId: string) => {
    const { data, error } = await supabase
      .from("purchase_order_receipts")
      .select("*")
      .eq("purchase_order_id", orderId)
      .order("received_at", { ascending: false });
    if (error || !data || openOrderIdRef.current !== orderId) return;
    const warehouseIds = Array.from(new Set(data.map((r) => r.warehouse_id).filter((id): id is string => !!id)));
    const warehouseNames: Record<string, string> = {};
    if (warehouseIds.length > 0) {
      const { data: whs } = await supabase.from("warehouses").select("id, name").in("id", warehouseIds);
      (whs || []).forEach((w) => { warehouseNames[w.id] = w.name; });
    }
    // Entretanto pode ter sido aberta outra PO — descarta a resposta.
    if (openOrderIdRef.current !== orderId) return;
    setOrderReceipts({ orderId, rows: data, warehouseNames });
  };

  const handleEdit = async (order: PurchaseOrder) => {
    openOrderIdRef.current = order.id;
    setEditingId(order.id);
    setEditingOrderMeta({
      id: order.id,
      orderNumber: order.order_number,
      supplierName: order.suppliers?.name || "",
      status: order.status,
      hasReceivedLines: false,
    });
    setFormData({
      supplier_id: order.supplier_id,
      order_date: order.order_date,
      expected_delivery: order.expected_delivery || "",
      status: order.status,
      notes: order.notes || "",
    });

    // Fase 5.0F: origem via Contrato (source_type/source_id, Fase 5.0C) —
    // best-effort, nunca bloqueia a abertura do diálogo se falhar.
    // client_contracts inclui contratos sintéticos (is_manual_order=true):
    // Venda Direta (direct_sales.client_contract_id) → "Venda Direta VD-…";
    // Encomenda Cliente manual → "Encomenda Cliente EC-…"; senão "Contrato CC-…".
    // A query a direct_sales é silenciosa: sem direct_sales.view a RLS devolve
    // vazio e cai-se para o caso manual (mesma regra de ClientOrders.tsx).
    setOrderSourceInfo(null);
    setOrderContractState(null);
    setOrderReceiptItems(null);
    setOrderReceipts(null);
    setReceiptHistoryOpen(false);
    void loadOrderReceipts(order.id);
    if ((order as any).source_type === "contract" && (order as any).source_id) {
      const contractId: string = (order as any).source_id;
      (async () => {
        const { data } = await supabase
          .from("client_contracts")
          .select("contract_number, order_number, is_manual_order, entity_id, status, deleted_at, anew_entities(display_name)")
          .eq("id", contractId)
          .maybeSingle();
        if (openOrderIdRef.current !== order.id) return;
        if (!data) {
          // Sem client_contracts.view (ou EC não devolvida pela RLS): estado
          // desconhecido — a RPC de passagem para stock decide e explica.
          setOrderContractState({ orderId: order.id, contractId, number: "", active: null });
          return;
        }
        const row = data as any;
        // Mesma regra das RPCs de receção: ativa = assinada e não apagada.
        setOrderContractState({
          orderId: order.id,
          contractId,
          number: row.order_number || row.contract_number || "",
          active: !row.deleted_at && (row.status === "signed" || row.status === "assinado"),
        });
        const clientName: string = row.anew_entities?.display_name || "";
        const contractNumber: string = row.contract_number || "";
        if (!row.is_manual_order) {
          setOrderSourceInfo({ contractId, originType: "contract", number: contractNumber, clientName });
          return;
        }
        const { data: sale } = await supabase
          .from("direct_sales")
          .select("id, sale_number")
          .eq("client_contract_id", contractId)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (sale && (sale as any).sale_number) {
          setOrderSourceInfo({ contractId, originType: "direct_sale", number: (sale as any).sale_number, clientName });
        } else {
          setOrderSourceInfo({ contractId, originType: "manual", number: row.order_number || contractNumber, clientName });
        }
      })().catch(() => {
        // best-effort; estado da EC fica desconhecido (não bloqueia o botão).
        if (openOrderIdRef.current === order.id) {
          setOrderContractState((prev) => prev ?? { orderId: order.id, contractId, number: "", active: null });
        }
      });
    }

    // Load existing items
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("*, products(name, uom:uom_id(code))")
      .eq("purchase_order_id", order.id);

    if (items) {
      if (openOrderIdRef.current === order.id) {
        setOrderReceiptItems({ orderId: order.id, items: items as unknown as PurchaseOrderItemWithReceipt[] });
      }
      const hasReceivedLines = (items as unknown as Array<PurchaseOrderItemWithReceipt>).some(
        (item) => item.item_type === 'product' && Number(item.received_quantity) > 0,
      );
      setEditingOrderMeta((prev) => (prev && prev.id === order.id ? { ...prev, hasReceivedLines } : prev));
      setOrderItems(items.map(item => ({
        id: item.id,
        item_type: item.item_type as 'product' | 'service',
        product_id: item.product_id,
        service_id: item.service_id,
        description: item.description,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate || 23,
        vat_amount: item.vat_amount || 0,
        total_price: item.total_price,
        selected_attributes: item.selected_attributes as Record<string, string> || {},
        notes: item.notes,
      })));
    }
    
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('purchaseOrders.delete.confirm'))) return;

    try {
      const { error } = await supabase.rpc("rpc_delete_purchase_order", { p_id: id });

      if (error) throw error;

      toast({
        title: t('purchaseOrders.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({
        title: t('purchaseOrders.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_purchase_order", { p_id: id });
      if (error) throw error;

      toast({ title: t('purchaseOrders.toast.restoreSuccess') || "Encomenda restaurada" });

      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({
        title: t('purchaseOrders.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openReceiveDialog = async (order: PurchaseOrder) => {
    // Ligada a uma Encomenda Cliente: o que a EC ainda precisa vai para a EC e
    // o excedente entra em stock (20261206130000) — ver a pré-visualização.
    setReceivingOrder({ id: order.id, order_number: order.order_number, isClientOrder: (order as any).source_type === "contract" });
    setReceiveWarehouseId("");
    setReceiveLines([]);
    setReceiveLineQuantities({});
    setReceivePreview({});
    setReceivePreviewError(null);
    setReceivePreviewLoading(false);
    setActualDeliveryDate(new Date().toISOString().slice(0, 10));
    setReceiveDialogOpen(true);

    if (!activeCompany?.id) return;

    const [warehousesRes, itemsRes] = await Promise.all([
      supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("purchase_order_items")
        .select("*, products(name, uom:uom_id(code))")
        .eq("purchase_order_id", order.id)
        .eq("item_type", "product"),
    ]);

    if (warehousesRes.error) {
      toast({ title: t('purchaseOrders.toast.error'), description: warehousesRes.error.message, variant: "destructive" });
      return;
    }
    setReceiveWarehouses(warehousesRes.data || []);

    if (itemsRes.error) {
      toast({ title: t('purchaseOrders.toast.error'), description: itemsRes.error.message, variant: "destructive" });
      return;
    }
    const items = (itemsRes.data as PurchaseOrderItemWithReceipt[] | null) || [];
    setReceiveLines(items);

    const initialQuantities: Record<string, number> = {};
    items.forEach((item) => {
      const remaining = item.quantity - (item.received_quantity || 0);
      initialQuantities[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveLineQuantities(initialQuantities);
  };

  const getReceiveRemaining = (item: PurchaseOrderItemWithReceipt) =>
    item.quantity - (item.received_quantity || 0);

  // "Selecionar tudo": repõe cada input ao saldo por receber da respetiva
  // linha — replica num clique o antigo comportamento por omissão ("recebe
  // tudo de uma vez").
  const handleSelectAllReceiveLines = () => {
    const quantities: Record<string, number> = {};
    receiveLines.forEach((item) => {
      const remaining = getReceiveRemaining(item);
      quantities[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceiveLineQuantities(quantities);
  };

  // Pré-visualização do destino (rpc_preview_po_receipt simula a receção e
  // desfaz): debounce de 400 ms; pedidos antigos descartados pelo requestId.
  // Erros ficam inline (sem toast a cada tecla). Só em POs ligadas a uma EC —
  // numa PO de stock tudo entra em stock. O armazém vai no pedido mas não é
  // dependência: o destino não depende dele.
  useEffect(() => {
    if (!receiveDialogOpen || !receivingOrder) return;
    const orderId = receivingOrder.id;
    const lines = receiveLines
      .map((item) => ({ purchase_order_item_id: item.id, quantity: receiveLineQuantities[item.id] || 0 }))
      .filter((line) => line.quantity > 0);
    const requestId = ++receivePreviewRequestRef.current;
    if (!receivingOrder.isClientOrder || lines.length === 0) {
      setReceivePreview({});
      setReceivePreviewError(null);
      setReceivePreviewLoading(false);
      return;
    }
    setReceivePreviewLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc("rpc_preview_po_receipt", {
        p_purchase_order_id: orderId,
        p_lines: lines,
        p_warehouse_id: receiveWarehouseId || undefined,
      });
      if (receivePreviewRequestRef.current !== requestId) return;
      setReceivePreviewLoading(false);
      if (error) {
        setReceivePreview({});
        setReceivePreviewError(error.message);
        return;
      }
      const result = data as unknown as ReceiptAllocationResult | null;
      const requested = new Map(lines.map((l) => [l.purchase_order_item_id, l.quantity]));
      const byItem: Record<string, ReceiptAllocationLine> = {};
      (result?.lines || []).forEach((l) => {
        byItem[l.purchase_order_item_id] = { ...l, requested_quantity: requested.get(l.purchase_order_item_id) };
      });
      setReceivePreview(byItem);
      setReceivePreviewError(null);
    }, 400);
    return () => {
      clearTimeout(handle);
      // Descarta a resposta em voo (diálogo fechado ou quantidades mudadas).
      receivePreviewRequestRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveDialogOpen, receivingOrder, receiveLines, receiveLineQuantities]);

  const handleReceiveOrder = async () => {
    if (!receivingOrder || !receiveWarehouseId) return;

    const linesToReceive = receiveLines
      .map((item) => ({
        purchase_order_item_id: item.id,
        quantity: receiveLineQuantities[item.id] || 0,
      }))
      .filter((line) => line.quantity > 0);

    if (linesToReceive.length === 0) {
      toast({
        title: t('purchaseOrders.toast.error'),
        description: "Indica pelo menos uma quantidade a receber numa linha.",
        variant: "destructive",
      });
      return;
    }

    setReceiving(true);
    try {
      const { data, error } = await supabase.rpc("rpc_receive_purchase_order_lines", {
        p_purchase_order_id: receivingOrder.id,
        p_warehouse_id: receiveWarehouseId,
        p_lines: linesToReceive,
        p_actual_delivery_date: actualDeliveryDate || null,
      });
      if (error) throw error;

      // O status devolvido pelo RPC é a fonte da verdade — não assumir
      // 'received' (pode ter ficado 'partially_received').
      const result = data as unknown as ReceiptAllocationResult | null;
      const isFullyReceived = result?.status === 'received';
      const resultLines = result?.lines || [];
      // Destino por linha (20261206130000): units_*_total em unidades de stock.
      // stock_skipped=true só quando nada entrou em stock numa PO de contrato.
      const unitsToOrder = Number(result?.units_to_order_total) || 0;
      const unitsToStock = Number(result?.units_to_stock_total) || 0;
      const ecNumbers = distinctContractNumbers(resultLines);
      const ecLabel = ecNumbers.length > 0 ? ecNumbers.join(", ") : "Encomenda Cliente";
      // EC inativa decide-se pelo motivo da alocação (o número pode faltar).
      const inactiveLines = resultLines.filter((l) => l.allocation_reason === "client_order_inactive");
      const inactiveEcNumbers = distinctContractNumbers(inactiveLines);
      const inactiveEcLabel = inactiveEcNumbers.length > 0
        ? `A encomenda cliente ${inactiveEcNumbers.join(", ")}`
        : "A encomenda cliente ligada";
      const stockNote = unitsToOrder > 0 && unitsToStock > 0
        ? ` ${formatQty(unitsToOrder)} unidades para a ${ecLabel}, ${formatQty(unitsToStock)} para stock.`
        : result?.stock_skipped || (unitsToOrder > 0 && unitsToStock === 0)
          ? ` Tudo para a ${ecLabel} — o stock geral não foi alterado.`
          : inactiveLines.length > 0
            ? ` ${inactiveEcLabel} está inativa — entraram ${formatQty(unitsToStock)} unidades em stock.`
            : resultLines.some((l) => l.allocation_reason === "client_order_already_covered")
              ? ` A ${ecLabel} já estava coberta — entraram ${formatQty(unitsToStock)} unidades em stock.`
              : " Stock atualizado.";

      toast({
        title: isFullyReceived ? "Encomenda totalmente recebida" : "Receção parcial registada",
        description: isFullyReceived
          ? `${receivingOrder.order_number} foi totalmente recebida —${stockNote}`
          : `${receivingOrder.order_number} teve uma receção parcial registada —${stockNote}`,
      });
      setReceiveDialogOpen(false);
      setReceivingOrder(null);
      setReceiveLines([]);
      setReceiveLineQuantities({});
      setReceivePreview({});
      setReceivePreviewError(null);
      setActualDeliveryDate(new Date().toISOString().slice(0, 10));
      loadData();
    } catch (error: any) {
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setReceiving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // "Não vou receber o resto" — anular o que falta de uma linha ou da PO inteira.
  // Best-effort na leitura: se a tabela não responder, as notas não aparecem e
  // o resto do ecrã funciona como antes.
  const fetchActivePoCancellations = async (orderId: string): Promise<PoItemCancellationRow[] | null> => {
    const { data, error } = await poCancellationsDb()
      .from("purchase_order_item_cancellations")
      .select("*")
      .eq("purchase_order_id", orderId)
      .is("undone_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[PurchaseOrders] não foi possível carregar as anulações da encomenda", error);
      return null;
    }
    return ((data as PoItemCancellationRow[] | null) || []);
  };

  const loadReceiveCancellations = async (orderId: string) => {
    const rows = await fetchActivePoCancellations(orderId);
    if (rows) setReceiveCancellations({ orderId, rows });
  };

  // Anulações da PO aberta no diálogo de receção.
  useEffect(() => {
    if (!receiveDialogOpen || !receivingOrder?.id) return;
    setReceiveCancellations(null);
    void loadReceiveCancellations(receivingOrder.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveDialogOpen, receivingOrder?.id]);

  // Anulações da PO aberta no diálogo da encomenda (ver/editar).
  useEffect(() => {
    if (!open || !editingId) return;
    const orderId = editingId;
    setOrderCancellations(null);
    void fetchActivePoCancellations(orderId).then((rows) => {
      if (rows && openOrderIdRef.current === orderId) setOrderCancellations({ orderId, rows });
    });
  }, [open, editingId]);

  // Depois de anular/desfazer com o diálogo de receção aberto: relê as linhas
  // (a quantidade encomendada muda) sem tocar no armazém/data escolhidos; o
  // "Receber agora" de cada linha nunca passa do novo pendente.
  const refreshReceiveLinesAfterCancellation = async (orderId: string) => {
    const { data, error } = await supabase
      .from("purchase_order_items")
      .select("*, products(name, uom:uom_id(code))")
      .eq("purchase_order_id", orderId)
      .eq("item_type", "product");
    if (error || !data) return;
    const items = data as unknown as PurchaseOrderItemWithReceipt[];
    setReceiveLines((prev) => (prev.length === 0 || prev[0].purchase_order_id === orderId ? items : prev));
    setReceiveLineQuantities((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const remaining = Math.max(item.quantity - (item.received_quantity || 0), 0);
        if (item.id in next) next[item.id] = Math.min(next[item.id] ?? 0, remaining);
      });
      return next;
    });
  };

  // Mesmo fecho que a receção faz quando a PO fica totalmente recebida.
  const closeReceiveDialogAfterCancellation = () => {
    setReceiveDialogOpen(false);
    setReceivingOrder(null);
    setReceiveLines([]);
    setReceiveLineQuantities({});
    setReceivePreview({});
    setReceivePreviewError(null);
    setActualDeliveryDate(new Date().toISOString().slice(0, 10));
  };

  const resetPoCancelForm = () => {
    setPoCancelReason("found_stock");
    setPoCancelNotes("");
  };

  const openPoLineCancel = (item: PurchaseOrderItemWithReceipt, remaining: number, uomLabel: string) => {
    if (!receivingOrder || remaining <= 0) return;
    resetPoCancelForm();
    setPoCancelTarget({
      kind: "line",
      source: "receive",
      orderId: receivingOrder.id,
      orderNumber: receivingOrder.order_number,
      itemId: item.id,
      quantity: remaining,
      uomLabel,
      productName: item.products?.name || item.description || "produto",
      isClientOrder: receivingOrder.isClientOrder,
    });
  };

  const openPoOrderCancelFromReceive = () => {
    if (!receivingOrder) return;
    const pendingCount = receiveLines.filter((item) => getReceiveRemaining(item) > 0).length;
    if (pendingCount === 0) return;
    resetPoCancelForm();
    setPoCancelTarget({
      kind: "order",
      source: "receive",
      orderId: receivingOrder.id,
      orderNumber: receivingOrder.order_number,
      lineCount: pendingCount,
      isClientOrder: receivingOrder.isClientOrder,
    });
  };

  const openPoOrderCancelFromList = (order: PurchaseOrder) => {
    resetPoCancelForm();
    setPoCancelTarget({
      kind: "order",
      source: "list",
      orderId: order.id,
      orderNumber: order.order_number,
      lineCount: null,
      isClientOrder: (order as any).source_type === "contract",
    });
  };

  const handleConfirmPoCancel = async () => {
    const target = poCancelTarget;
    if (!target) return;
    const notes = poCancelNotes.trim();
    if (poCancelReason === "other" && !notes) {
      toast({ title: t('purchaseOrders.toast.error'), description: "Indica uma nota para o motivo «Outro».", variant: "destructive" });
      return;
    }
    setPoCancelSubmitting(true);
    try {
      const { data, error } = target.kind === "line"
        ? await poCancellationsDb().rpc("rpc_cancel_po_line_remainder", {
            p_purchase_order_item_id: target.itemId,
            p_reason: poCancelReason,
            p_notes: notes || null,
          })
        : await poCancellationsDb().rpc("rpc_cancel_po_remainder", {
            p_purchase_order_id: target.orderId,
            p_reason: poCancelReason,
            p_notes: notes || null,
          });
      if (error) throw error;
      const result = (data || {}) as { status?: string; quantity_cancelled?: number | null; lines_cancelled?: number | null };
      const status = result.status;
      const linesCancelled = target.kind === "order" ? Number(result.lines_cancelled ?? target.lineCount ?? 0) || 0 : 0;
      toast({
        title: "Resto anulado",
        description: target.kind === "line"
          ? `${formatQty(result.quantity_cancelled ?? target.quantity)}${target.uomLabel ? ` ${target.uomLabel}` : ""} de ${target.productName} já não vão ser recebidos (${target.orderNumber}).`
          : status === "cancelled"
            ? `${target.orderNumber} ficou cancelada — nada tinha sido recebido.`
            : `${target.orderNumber}: anulado o que faltava${linesCancelled > 0 ? ` de ${linesCancelled} linha(s)` : ""}.`,
      });
      setPoCancelTarget(null);
      resetPoCancelForm();
      if (target.source === "receive") {
        if (status === "received" || status === "cancelled") {
          closeReceiveDialogAfterCancellation();
        } else {
          void refreshReceiveLinesAfterCancellation(target.orderId);
          void loadReceiveCancellations(target.orderId);
        }
      }
      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setPoCancelSubmitting(false);
    }
  };

  const handleConfirmPoUndo = async () => {
    const target = poUndoTarget;
    if (!target) return;
    setPoUndoSubmitting(true);
    try {
      const { error } = target.batchId
        ? await poCancellationsDb().rpc("rpc_undo_po_cancellation_batch", { p_batch_id: target.batchId, p_reason: null })
        : await poCancellationsDb().rpc("rpc_undo_po_line_cancellation", { p_cancellation_id: target.cancellationId, p_reason: null });
      if (error) throw error;
      toast({
        title: "Anulação desfeita",
        description: target.batchId
          ? "As linhas desta encomenda voltam a ficar por receber."
          : "A quantidade volta a ficar por receber.",
      });
      setPoUndoTarget(null);
      if (target.source === "receive") {
        void refreshReceiveLinesAfterCancellation(target.orderId);
        void loadReceiveCancellations(target.orderId);
      } else {
        // O estado da PO mudou: fecha o diálogo da encomenda para não ficar um
        // formulário com o estado antigo (que podia ser regravado).
        handleOrderDialogOpenChange(false);
      }
      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setPoUndoSubmitting(false);
    }
  };

  // Linhas a marcar à partida: ids explícitos; senão as do produto, e dessas
  // só as ligadas à linha da Encomenda Cliente (quote_line_id/component_index)
  // quando alguma o estiver. Só ids que existam na lista carregada.
  const resolveRevertPreselection = (lines: PurchaseOrderItemWithReceipt[], preselect: RevertPreselect): string[] => {
    if (preselect.itemIds && preselect.itemIds.length > 0) {
      const wanted = new Set(preselect.itemIds);
      const byId = lines.filter((l) => wanted.has(l.id)).map((l) => l.id);
      if (byId.length > 0 || !preselect.productId) return byId;
    }
    if (!preselect.productId) return [];
    const byProduct = lines.filter((l) => l.product_id === preselect.productId);
    if (preselect.quoteLineId) {
      const wantedComponent = preselect.componentIndex ?? null;
      const byQuoteLine = byProduct.filter((l) => {
        const row = l as unknown as { quote_line_id?: string | null; component_index?: number | null };
        return row.quote_line_id === preselect.quoteLineId && (row.component_index ?? null) === wantedComponent;
      });
      if (byQuoteLine.length > 0) return byQuoteLine.map((l) => l.id);
    }
    return byProduct.map((l) => l.id);
  };

  const openRevertDialog = async (order: Pick<PurchaseOrder, 'id' | 'order_number'>, preselect?: RevertPreselect) => {
    setRevertingOrder({ id: order.id, order_number: order.order_number });
    setRevertLines([]);
    setRevertSelectedIds(new Set());
    setRevertReason("");
    setRevertDialogOpen(true);

    // Só linhas de produto com alguma quantidade recebida podem ser revertidas.
    const { data, error } = await supabase
      .from("purchase_order_items")
      .select("*, uom:uom_id(code), products(name, uom:uom_id(code))")
      .eq("purchase_order_id", order.id)
      .eq("item_type", "product")
      .gt("received_quantity", 0);

    if (error) {
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
      return;
    }
    const lines = (data as unknown as PurchaseOrderItemWithReceipt[] | null) || [];
    setRevertLines(lines);
    if (preselect) {
      const ids = resolveRevertPreselection(lines, preselect);
      if (ids.length > 0) setRevertSelectedIds(new Set(ids));
    }
  };

  const handleOrderDialogOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      openOrderIdRef.current = null;
      setEditingId(null);
      setEditingOrderMeta(null);
      setPendingRevertPreselect(null);
      setFormData({
        supplier_id: "",
        order_date: new Date().toISOString().split('T')[0],
        expected_delivery: "",
        status: "pending",
        notes: "",
      });
      setFieldErrors({});
      setOrderItems([]);
      setOrganizationSelection({
        tenantId: "",
        companyId: activeCompany?.id || "",
        businessUnitId: "",
        departmentId: "",
        secondaryCompanyIds: [],
      });
      setNewOrderClientOrderId("");
      setPendingClientOrderLines([]);
    }
  };

  // "Reverter receção" dentro do diálogo da encomenda (só de leitura): fecha-o
  // e abre o diálogo de reversão já existente, com a linha vinda do link.
  const handleRevertFromOrderDialog = () => {
    const meta = editingOrderMeta;
    if (!meta) return;
    const preselect = pendingRevertPreselect?.orderId === meta.id ? pendingRevertPreselect : undefined;
    skipOrderDialogFocusRestoreRef.current = true;
    handleOrderDialogOpenChange(false);
    void openRevertDialog({ id: meta.id, order_number: meta.orderNumber }, preselect);
  };

  const toggleRevertLine = (id: string, checked: boolean) => {
    setRevertSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAllRevertLines = () => {
    setRevertSelectedIds(new Set(revertLines.map((item) => item.id)));
  };

  const handleRevertReceipt = async () => {
    const reason = revertReason.trim();
    if (!revertingOrder || revertSelectedIds.size === 0 || reason.length < 3) return;

    setReverting(true);
    try {
      const { data, error } = await supabase.rpc("rpc_revert_purchase_order_receipt", {
        p_purchase_order_id: revertingOrder.id,
        p_item_ids: Array.from(revertSelectedIds),
        p_reason: reason,
      });
      if (error) throw error;

      const result = data as {
        order_number?: string;
        status?: string;
        lines?: Array<{ units_reverted_from_stock?: number | null; units_reverted_from_client_order?: number | null }>;
      } | null;
      // Destino por linha (20261206130000): quanto saiu do stock e quanto
      // deixou de estar entregue à Encomenda Cliente (unidades de stock).
      const fromStock = (result?.lines || []).reduce((sum, l) => sum + (Number(l.units_reverted_from_stock) || 0), 0);
      const fromClientOrder = (result?.lines || []).reduce((sum, l) => sum + (Number(l.units_reverted_from_client_order) || 0), 0);
      const revertNote = fromStock > 0 && fromClientOrder > 0
        ? ` Retiradas ${formatQty(fromStock)} unidades do stock e ${formatQty(fromClientOrder)} da Encomenda Cliente.`
        : fromClientOrder > 0
          ? ` Retiradas ${formatQty(fromClientOrder)} unidades da Encomenda Cliente — o stock geral não foi alterado.`
          : fromStock > 0
            ? ` Retiradas ${formatQty(fromStock)} unidades do stock.`
            : "";
      toast({
        title: t('purchaseOrders.revert.successTitle') || "Receção revertida",
        description: t('purchaseOrders.revert.successDescription', {
          order: result?.order_number || revertingOrder.order_number,
          count: result?.lines?.length ?? revertSelectedIds.size,
        }) + revertNote,
      });
      setRevertDialogOpen(false);
      setRevertingOrder(null);
      setRevertLines([]);
      setRevertSelectedIds(new Set());
      setRevertReason("");
      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setReverting(false);
    }
  };

  // Linhas da encomenda aberta que podem passar para stock: só PO de contrato
  // (orderContractState só existe para source_type='contract') com a EC
  // inativa OU de estado desconhecido (sem client_contracts.view). Se a EC for
  // conhecida e ativa, não. rpc_po_receipt_release_to_stock volta a validar
  // tudo e explica a recusa.
  const releasableLines =
    editingId &&
    orderContractState?.orderId === editingId &&
    orderContractState.active !== true &&
    orderReceiptItems?.orderId === editingId
      ? orderReceiptItems.items.filter((item) => item.item_type === "product" && getUnitsNotInStock(item) > 0)
      : [];

  // Fecha o diálogo da encomenda e abre o de "Passar para stock" (mesmo
  // padrão de handleRevertFromOrderDialog).
  const handleReleaseFromOrderDialog = async () => {
    const meta = editingOrderMeta;
    if (!meta || releasableLines.length === 0) return;
    const lines = releasableLines;
    setReleaseOrder({
      id: meta.id,
      order_number: meta.orderNumber,
      contractNumber: orderContractState?.number || "",
      contractInactiveKnown: orderContractState?.active === false,
    });
    setReleaseLines(lines);
    setReleaseSelectedIds(new Set(lines.map((l) => l.id)));
    setReleaseWarehouseId("");
    setReleaseReason("");
    skipOrderDialogFocusRestoreRef.current = true;
    handleOrderDialogOpenChange(false);
    setReleaseDialogOpen(true);

    if (!activeCompany?.id) return;
    const { data, error } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("organization_id", activeCompany.id)
      .is("deleted_at", null)
      .order("name");
    if (error) {
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
      return;
    }
    setReleaseWarehouses(data || []);
  };

  const toggleReleaseLine = (id: string, checked: boolean) => {
    setReleaseSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleReleaseToStock = async () => {
    if (!releaseOrder || releaseSelectedIds.size === 0 || !releaseWarehouseId) return;
    setReleasing(true);
    try {
      const { data, error } = await supabase.rpc("rpc_po_receipt_release_to_stock", {
        p_item_ids: Array.from(releaseSelectedIds),
        p_warehouse_id: releaseWarehouseId,
        p_reason: releaseReason.trim() || undefined,
      });
      if (error) throw error;
      const result = data as { lines?: Array<{ units_to_stock?: number | null }> } | null;
      const units = (result?.lines || []).reduce((sum, l) => sum + (Number(l.units_to_stock) || 0), 0);
      toast({
        title: "Passado para stock",
        description: `${releaseOrder.order_number}: entraram ${formatQty(units)} unidades em stock.`,
      });
      setReleaseDialogOpen(false);
      setReleaseOrder(null);
      setReleaseLines([]);
      setReleaseSelectedIds(new Set());
      setReleaseReason("");
      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({ title: t('purchaseOrders.toast.error'), description: error.message, variant: "destructive" });
    } finally {
      setReleasing(false);
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalVat = 0;
    
    orderItems.forEach(item => {
      const itemSubtotal = item.unit_price * item.quantity;
      const itemVat = itemSubtotal * (item.vat_rate / 100);
      subtotal += itemSubtotal;
      totalVat += itemVat;
    });
    
    const total = subtotal + totalVat;
    
    return {
      subtotal,
      totalVat,
      total,
    };
  };

  // Products/services the selected supplier actually supplies, per item_suppliers,
  // with purchase_price overridden to the supplier-specific price when it has one
  // (falls back to the product_prices-derived price otherwise). Single source used
  // both by getAvailableItems() (confirm/add) and the two tab lists in the items
  // dialog (render) — kept as one computation so they can never disagree.
  const availableProductsForSupplier = useMemo(() => {
    if (!formData.supplier_id) return [];
    return products
      .filter(p => supplierProductRefs.has(p.id))
      .map(p => {
        const ref = supplierProductRefs.get(p.id);
        return ref?.purchase_price != null ? { ...p, purchase_price: ref.purchase_price } : p;
      });
  }, [products, supplierProductRefs, formData.supplier_id]);

  const availableServicesForSupplier = useMemo(() => {
    if (!formData.supplier_id) return [];
    return services
      .filter(s => supplierServiceRefs.has(s.id))
      .map(s => {
        const ref = supplierServiceRefs.get(s.id);
        return ref?.purchase_price != null ? { ...s, purchase_price: ref.purchase_price } : s;
      });
  }, [services, supplierServiceRefs, formData.supplier_id]);

  // Fase 5.0F (pedido do utilizador, 2026-08-31): ao escolher a Encomenda
  // Cliente de origem, busca os produtos desse contrato e resolve o
  // fornecedor PREFERENCIAL de cada um (item_suppliers.is_preferred) — o
  // formulário só suporta 1 fornecedor por encomenda, por isso escolhe-se
  // sozinho o fornecedor mais comum entre as linhas (o mesmo critério que a
  // geração automática, Fase 5.0C, já usa por produto). Produtos sem
  // fornecedor preferencial nenhum ficam assinalados à parte — nunca inventa
  // fornecedor.
  const handleNewOrderClientOrderChange = async (value: string) => {
    const id = value === "none" ? "" : value;
    setNewOrderClientOrderId(id);
    setPendingClientOrderLines([]);
    if (!id) return;

    setClientOrderLinesLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_get_client_order_document', {
        p_contract_id: id,
      } as any);
      if (error) throw error;
      const doc = data as any;
      const docLines = ((doc?.lines as any[]) || [])
        .filter((l) => l.product_id)
        .map((l) => ({ product_id: l.product_id as string, quantity: Number(l.quantity) || 1 }));
      setPendingClientOrderLines(docLines);

      if (docLines.length === 0) {
        toast({ title: "Encomenda sem linhas de produto", description: "Não há produtos associados a este contrato — adiciona manualmente.", variant: "destructive" });
        return;
      }

      const companyId = organizationSelection.companyId || activeCompany?.id;
      const { data: prefRows, error: prefError } = await supabase
        .from("item_suppliers")
        .select("product_id, supplier_id, suppliers(name)")
        .eq("organization_id", companyId)
        .in("product_id", docLines.map((l) => l.product_id))
        .eq("is_preferred", true)
        .eq("is_active", true)
        .is("deleted_at", null);
      if (prefError) throw prefError;

      const supplierByProduct = new Map<string, string>();
      (prefRows || []).forEach((r: any) => supplierByProduct.set(r.product_id, r.supplier_id));

      const noSupplierProducts = docLines.filter((l) => !supplierByProduct.has(l.product_id));
      if (noSupplierProducts.length > 0) {
        toast({
          title: "Produto(s) sem fornecedor atribuído",
          description: `${noSupplierProducts.length} produto(s) desta Encomenda Cliente não têm fornecedor preferencial — atribui um em Produtos, ou adiciona manualmente aqui já com o fornecedor certo.`,
          variant: "destructive",
        });
      }

      // Fornecedor mais comum entre as linhas resolvidas — escolhido sozinho
      // só se o campo ainda não tiver sido preenchido manualmente.
      if (!formData.supplier_id && supplierByProduct.size > 0) {
        const counts = new Map<string, number>();
        supplierByProduct.forEach((supplierId) => counts.set(supplierId, (counts.get(supplierId) || 0) + 1));
        const [dominantSupplierId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        setFormData((prev) => ({ ...prev, supplier_id: dominantSupplierId }));
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar a Encomenda Cliente", description: error.message, variant: "destructive" });
    } finally {
      setClientOrderLinesLoading(false);
    }
  };

  // Preenchimento automático dos itens: só quando há fornecedor escolhido
  // (preço depende dele) e a encomenda ainda está vazia (não sobrescreve
  // trabalho manual já feito). Produtos do contrato que este fornecedor não
  // vende (fora de availableProductsForSupplier) ficam de fora, com aviso —
  // nunca inventa preço.
  useEffect(() => {
    if (editingId || pendingClientOrderLines.length === 0 || !formData.supplier_id || orderItems.length > 0) return;

    const matched: PurchaseOrderItem[] = [];
    const unmatched: string[] = [];

    pendingClientOrderLines.forEach((line) => {
      const product = availableProductsForSupplier.find((p) => p.id === line.product_id);
      if (!product || !product.purchase_price || product.purchase_price <= 0) {
        unmatched.push(line.product_id);
        return;
      }
      const vatRate = product.vat_rate || 23;
      const subtotal = product.purchase_price * line.quantity;
      const vatAmount = subtotal * (vatRate / 100);
      matched.push({
        item_type: 'product',
        product_id: product.id,
        description: product.name,
        sku: product.sku || undefined,
        quantity: line.quantity,
        unit_price: product.purchase_price,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_price: subtotal + vatAmount,
        selected_attributes: {},
      });
    });

    if (matched.length > 0) {
      setOrderItems(matched);
      toast({
        title: "Itens preenchidos automaticamente",
        description: `${matched.length} produto(s) da Encomenda Cliente adicionado(s).${unmatched.length > 0 ? ` ${unmatched.length} produto(s) sem preço para este fornecedor — adiciona manualmente ou escolhe outro fornecedor.` : ''}`,
        variant: unmatched.length > 0 ? "destructive" : undefined,
      });
    } else if (unmatched.length > 0) {
      toast({
        title: "Fornecedor sem preço para estes produtos",
        description: "Nenhum dos produtos desta Encomenda Cliente tem preço definido para o fornecedor escolhido — adiciona os itens manualmente ou escolhe outro fornecedor.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.supplier_id, pendingClientOrderLines, availableProductsForSupplier]);

  const getAvailableItems = () => {
    return selectedItemType === 'product' ? availableProductsForSupplier : availableServicesForSupplier;
  };

  const handleAddCatalogItems = () => {
    const availableItems = getAvailableItems();
    const selectedProducts = availableItems.filter(p => selectedCatalogItems.includes(p.id));
    
    if (selectedProducts.length === 0) {
      toast({
        title: t('purchaseOrders.toast.noItemsSelected'),
        description: t('purchaseOrders.toast.selectAtLeastOne'),
        variant: "destructive",
      });
      return;
    }
    
    const newItems: PurchaseOrderItem[] = selectedProducts.map(item => {
      const selectedAttrs = selectedItemAttributes[item.id] || {};
      const purchasePrice = item.purchase_price || 0;
      const vatRate = item.vat_rate || 23;
      
      if (!purchasePrice || purchasePrice <= 0) {
        toast({
          title: t('purchaseOrders.toast.missingPrice'),
          description: t('purchaseOrders.toast.noPurchasePrice', { name: item.name }),
          variant: "destructive",
        });
      }
      
      // Transform selected attributes to full format for LineAttributesDialog
      const fullAttributes: Record<string, any> = {};
      if (Object.keys(selectedAttrs).length > 0 && selectedItemType === 'product') {
        const attrs = productAttributes.get(item.id);
        Object.entries(selectedAttrs).forEach(([attrId, value]) => {
          const attr = attrs?.find(a => a.id === attrId);
          if (attr && value) {
            fullAttributes[attrId] = {
              attribute_code: attr.code,
              label: attr.name,
              value_type: attr.value_type,
              unit: attr.unit,
              value: value
            };
          }
        });
      }
      
      // Build description with attributes
      let description = item.name;
      if (Object.keys(fullAttributes).length > 0) {
        const attrStrings = Object.entries(fullAttributes).map(([attrId, attrData]) => {
          const displayValue = attrData.unit ? `${attrData.value} ${attrData.unit}` : attrData.value;
          return `${attrData.label}: ${displayValue}`;
        }).filter(Boolean);
        
        if (attrStrings.length > 0) {
          description = `${item.name} (${attrStrings.join(', ')})`;
        }
      }
      
      const quantity = 1;
      const subtotal = purchasePrice * quantity;
      const vatAmount = subtotal * (vatRate / 100);
      const totalPrice = subtotal + vatAmount;
      
      return {
        item_type: selectedItemType,
        product_id: selectedItemType === 'product' ? item.id : undefined,
        service_id: selectedItemType === 'service' ? item.id : undefined,
        description,
        sku: item.sku || undefined,
        quantity,
        unit_price: purchasePrice,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_price: totalPrice,
        selected_attributes: fullAttributes,
      };
    }).filter(item => item.unit_price > 0);
    
    if (newItems.length === 0) {
      return;
    }
    
    setOrderItems([...orderItems, ...newItems]);
    setSelectedCatalogItems([]);
    setSelectedItemAttributes({});
    setShowItemsDialog(false);
    
    toast({
      title: t('purchaseOrders.toast.itemsAdded'),
      description: t('purchaseOrders.toast.itemsAddedDesc', { count: newItems.length }),
    });
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const newItems = [...orderItems];
    const item = newItems[index];
    
    if (field === 'quantity' || field === 'unit_price') {
      const parsedQty = field === 'quantity' ? parseFloat(value) || 0 : item.quantity;
      // Unidade contável => quantidade inteira.
      const quantity = field === 'quantity' && itemRequiresIntegerQty(item) ? roundToIntegerQty(parsedQty) : parsedQty;
      const unitPrice = field === 'unit_price' ? parseFloat(value) || 0 : item.unit_price;
      const subtotal = quantity * unitPrice;
      const vatAmount = subtotal * (item.vat_rate / 100);
      const totalPrice = subtotal + vatAmount;
      
      newItems[index] = {
        ...item,
        [field]: field === 'quantity' ? quantity : unitPrice,
        vat_amount: vatAmount,
        total_price: totalPrice,
      };
    } else {
      newItems[index] = {
        ...item,
        [field]: value,
      };
    }
    
    setOrderItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Encomenda recebida: só de leitura — nunca grava, mesmo que algo submeta o form.
    if (isOrderReadOnly) return;

    const validation = purchaseOrderSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setFieldErrors(errors);
      toast({
        title: t('purchaseOrders.toast.createError'),
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    if (orderItems.length === 0) {
      toast({
        title: t('purchaseOrders.toast.addAtLeastOneItem'),
        description: t('purchaseOrders.toast.addAtLeastOneItemDesc'),
        variant: "destructive",
      });
      return;
    }

    // Unidade contável: só quantidades inteiras (o input já arredonda; isto
    // apanha linhas carregadas com decimais).
    const nonIntegerIndex = orderItems.findIndex(
      (item) => Number(item.quantity) > 0 && itemRequiresIntegerQty(item) && !isValidQtyFor(Number(item.quantity), true),
    );
    if (nonIntegerIndex >= 0) {
      const item = orderItems[nonIntegerIndex];
      toast({
        title: t('purchaseOrders.toast.createError'),
        description: integerQtyMessage(nonIntegerIndex + 1, productUom.getBaseCode(item.product_id)),
        variant: "destructive",
      });
      return;
    }

    const { total } = calculateTotals();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      const orderData = {
        supplier_id: formData.supplier_id,
        order_date: formData.order_date,
        expected_delivery: formData.expected_delivery || null,
        status: formData.status,
        total_value: total,
        notes: formData.notes || null,
        // Ligação manual a uma Encomenda Cliente (20261115200000) — só
        // relevante na criação; rpc_update_purchase_order ignora estas 2
        // chaves de propósito (nunca reescreve a ligação numa edição).
        ...(!editingId && newOrderClientOrderId
          ? { source_type: "contract", source_id: newOrderClientOrderId }
          : {}),
      };

      const itemsPayload = orderItems.map(item => ({
        item_type: item.item_type,
        product_id: item.product_id || null,
        service_id: item.service_id || null,
        description: item.description,
        sku: item.sku || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
        vat_amount: item.vat_amount,
        total_price: item.total_price,
        selected_attributes: item.selected_attributes || {},
        notes: item.notes || null,
      }));

      if (editingId) {
        // Update order + full item replace (delete-all + re-insert) in a single
        // atomic RPC call, matching rpc_update_purchase_order's contract.
        const { error: updateError } = await supabase.rpc("rpc_update_purchase_order", {
          p_purchase_order_id: editingId,
          p_order: orderData,
          p_items: itemsPayload,
        });

        if (updateError) throw updateError;

        toast({
          title: t('purchaseOrders.toast.updateSuccess'),
        });
      } else {
        const companyId = organizationSelection.companyId || activeCompany?.id;
        if (!companyId) throw new Error("No company selected");

        // Create order + items in a single atomic RPC call, matching
        // rpc_create_purchase_order's contract (order_number auto-generated by trigger).
        const { error: createError } = await supabase.rpc("rpc_create_purchase_order", {
          p_organization_id: companyId,
          p_order: orderData,
          p_items: itemsPayload,
        });

        if (createError) throw createError;

        toast({
          title: t('purchaseOrders.toast.createSuccess'),
        });
      }

      setOpen(false);
      setEditingId(null);
      setFormData({
        supplier_id: "",
        order_date: new Date().toISOString().split('T')[0],
        expected_delivery: "",
        status: "pending",
        notes: "",
      });
      setFieldErrors({});
      setOrderItems([]);
      loadData();
    } catch (error: any) {
      captureFlowError(error, "purchase-order-lifecycle");
      toast({
        title: editingId ? t('purchaseOrders.toast.updateError') : t('purchaseOrders.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-warning/10 text-warning",
      ordered: "bg-info/10 text-info",
      // Intermédio entre "ordered" (info/azul) e "received" (success/verde) —
      // teal já usado noutros ecrãs do projeto para estados intermédios.
      partially_received: "bg-teal-500/10 text-teal-600",
      received: "bg-success/10 text-success",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: t('purchaseOrders.status.pending'),
      ordered: t('purchaseOrders.status.ordered'),
      partially_received: t('purchaseOrders.status.partiallyReceived'),
      received: t('purchaseOrders.status.received'),
      cancelled: t('purchaseOrders.status.cancelled'),
    };
    return labels[status] || status;
  };

  const handleGeneratePDF = async (orderId: string) => {
    try {
      // Fetch order data with company and supplier
      const { data: orderData, error: orderError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (name, tax_id, email, phone),
          anew_organizations!organization_id (name, logo_url)
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', orderId);

      if (itemsError) throw itemsError;

      // Fetch current user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let userData = null;
      if (authUser) {
        const { data: anewUser } = await supabase
          .from('anew_users')
          .select('name, phone')
          .eq('auth_user_id', authUser.id)
          .single();

        userData = {
          id: authUser.id,
          email: authUser.email,
          name: anewUser?.name || '',
          phone: anewUser?.phone || '',
        };
      }

      // Convert logo to base64
      let logoBase64 = null;
      const orgData = orderData?.anew_organizations as any;
      if (orgData?.logo_url) {
        try {
          const response = await fetch(orgData.logo_url);
          const blob = await response.blob();
          logoBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Error converting logo to base64:', error);
        }
      }

      const companyWithLogo = {
        ...(orgData || {}),
        logo_url: logoBase64 || orgData?.logo_url,
      };

      // Generate PDF
      const blob = await pdf(
        <PurchaseOrderPDFDocument
          order={orderData}
          company={companyWithLogo}
          supplier={orderData.suppliers}
          items={itemsData || []}
          user={userData}
        />
      ).toBlob();

      // Download PDF
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Encomenda_${orderData.order_number || orderId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: t('purchaseOrders.toast.pdfSuccess'),
      });
    } catch (error: any) {
      captureFlowError(error, "purchase-order-document");
      toast({
        title: t('purchaseOrders.toast.pdfError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (orders.length === 0) {
      toast({
        title: t('purchaseOrders.toast.exportNoData'),
        description: t('purchaseOrders.toast.exportNoDataDesc'),
        variant: "destructive",
      });
      return;
    }
    exportPurchaseOrdersToCSV(orders);
    toast({
      title: t('purchaseOrders.toast.exportSuccess'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      // order_number is unique per organization (not globally), and a single
      // duplicate would otherwise fail the whole all-or-nothing RPC import.
      // Pre-fetch existing order_numbers for this org (regardless of
      // deleted_at — the DB constraint applies to soft-deleted rows too) so
      // colliding rows can be skipped/reported instead of aborting the batch.
      const { data: existingOrders, error: existingOrdersError } = await supabase
        .from("purchase_orders")
        .select("order_number")
        .eq("organization_id", activeCompany.id);

      if (existingOrdersError) throw existingOrdersError;

      const existingOrderNumbers = new Set((existingOrders || []).map((o: any) => o.order_number));

      const { ordersToInsert, skippedLines } = parsePurchaseOrdersCSV(
        text,
        suppliers,
        businessUserId,
        activeCompany.id,
        existingOrderNumbers,
      );

      if (ordersToInsert.length === 0) {
        throw new Error(
          skippedLines.length > 0
            ? `${t('purchaseOrders.toast.noValidOrders')} ${skippedLines.slice(0, 5).map(s => `Linha ${s.line}: ${s.reason}`).join(" | ")}`
            : t('purchaseOrders.toast.noValidOrders')
        );
      }

      const { error } = await supabase.rpc("rpc_import_purchase_orders_csv", {
        p_orders: ordersToInsert,
      });

      if (error) throw error;

      const skippedSuffix = skippedLines.length > 0
        ? ` ${skippedLines.length} linha(s) ignoradas: ${skippedLines.slice(0, 5).map(s => `L${s.line} (${s.orderNumber}): ${s.reason}`).join(" | ")}${skippedLines.length > 5 ? ` (+${skippedLines.length - 5} mais)` : ""}`
        : "";

      toast({
        title: t('purchaseOrders.toast.importSuccess', { count: ordersToInsert.length }) + skippedSuffix,
      });

      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({
        title: t('purchaseOrders.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  const totals = calculateTotals();

  // Filtros aplicados em memória sobre `orders` (já carregado inteiro via
  // fetchAllRows — ver loadData()). A data é comparada como string "YYYY-MM-DD"
  // (mesmo formato de order_date/actual_delivery_date e dos <Input type="date">),
  // por isso a comparação lexicográfica funciona sem conversão para Date.
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (supplierFilter !== "all" && order.supplier_id !== supplierFilter) return false;
      if (statusFilterValue !== "all" && order.status !== statusFilterValue) return false;

      const fieldValue = dateFilterField === "order_date"
        ? order.order_date
        : (order as any).actual_delivery_date;

      if (dateFrom || dateTo) {
        if (!fieldValue) return false;
        if (dateFrom && fieldValue < dateFrom) return false;
        if (dateTo && fieldValue > dateTo) return false;
      }

      return true;
    });
  }, [orders, supplierFilter, statusFilterValue, dateFrom, dateTo, dateFilterField]);

  const hasActiveOrderFilters = supplierFilter !== "all" || statusFilterValue !== "all" || !!dateFrom || !!dateTo;

  const clearOrderFilters = () => {
    setSupplierFilter("all");
    setStatusFilterValue("all");
    setDateFrom("");
    setDateTo("");
    setDateFilterField("order_date");
  };

  // Origem / Cliente em lote para a lista — mesma regra de handleEdit
  // (client_contracts → se is_manual_order, procura a Venda Direta ligada;
  // senão é Encomenda Cliente manual EC-…; não manual = Contrato CC-…), mas com
  // .in(...) por lotes em vez de uma consulta por encomenda.
  useEffect(() => {
    const requestId = ++listOriginRequestRef.current;
    const contractIds = Array.from(new Set(
      orders
        .filter((o) => (o as any).source_type === "contract" && (o as any).source_id)
        .map((o) => (o as any).source_id as string)
    ));
    if (contractIds.length === 0) {
      setListOriginByContract({});
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < contractIds.length; i += ORIGIN_LOOKUP_CHUNK) {
      chunks.push(contractIds.slice(i, i + ORIGIN_LOOKUP_CHUNK));
    }
    (async () => {
      const contractResults = await Promise.all(chunks.map((ids) =>
        supabase
          .from("client_contracts")
          .select("id, contract_number, order_number, is_manual_order, anew_entities(display_name)")
          .in("id", ids)
      ));
      const contractRows: any[] = [];
      for (const res of contractResults) {
        if (res.error) throw res.error;
        contractRows.push(...((res.data as any[]) || []));
      }

      // Só os contratos sintéticos podem ter Venda Direta. Sem direct_sales.view
      // a RLS devolve vazio e cai-se para o caso manual (EC-…).
      const manualIds = contractRows.filter((r) => r.is_manual_order).map((r) => r.id as string);
      const saleByContract = new Map<string, string>();
      if (manualIds.length > 0) {
        const saleChunks: string[][] = [];
        for (let i = 0; i < manualIds.length; i += ORIGIN_LOOKUP_CHUNK) {
          saleChunks.push(manualIds.slice(i, i + ORIGIN_LOOKUP_CHUNK));
        }
        const saleResults = await Promise.all(saleChunks.map((ids) =>
          supabase
            .from("direct_sales")
            .select("client_contract_id, sale_number")
            .in("client_contract_id", ids)
            .is("deleted_at", null)
        ));
        for (const res of saleResults) {
          if (res.error) continue; // silencioso, como em handleEdit
          for (const sale of ((res.data as any[]) || [])) {
            if (sale.client_contract_id && sale.sale_number && !saleByContract.has(sale.client_contract_id)) {
              saleByContract.set(sale.client_contract_id, sale.sale_number);
            }
          }
        }
      }

      const next: Record<string, { originType: 'contract' | 'direct_sale' | 'manual'; number: string; clientName: string }> = {};
      for (const row of contractRows) {
        const clientName: string = row.anew_entities?.display_name || "";
        const contractNumber: string = row.contract_number || "";
        if (!row.is_manual_order) {
          next[row.id] = { originType: "contract", number: contractNumber, clientName };
        } else if (saleByContract.has(row.id)) {
          next[row.id] = { originType: "direct_sale", number: saleByContract.get(row.id) as string, clientName };
        } else {
          next[row.id] = { originType: "manual", number: row.order_number || contractNumber, clientName };
        }
      }
      if (listOriginRequestRef.current !== requestId) return;
      setListOriginByContract(next);
    })().catch((error) => {
      console.error("Error loading purchase order origins:", error);
      if (listOriginRequestRef.current !== requestId) return;
      setListOriginByContract({});
    });
  }, [orders]);

  // Vista agrupada: os filtros já foram aplicados em filteredOrders, por isso
  // um fornecedor sem encomendas filtradas não chega a ter grupo.
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      supplierName: string;
      orders: PurchaseOrder[];
      toReceive: number;
      received: number;
      lastOrderDate: string;
      totalValue: number;
    }>();
    for (const order of filteredOrders) {
      const key = order.supplier_id || NO_SUPPLIER_GROUP_KEY;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          supplierName: order.supplier_id
            ? (order.suppliers?.name || suppliers.find((s) => s.id === order.supplier_id)?.name || "N/A")
            : (t('purchaseOrders.groups.noSupplier') || 'Sem fornecedor'),
          orders: [],
          toReceive: 0,
          received: 0,
          lastOrderDate: "",
          totalValue: 0,
        };
        groups.set(key, group);
      }
      group.orders.push(order);
      if (order.status === 'pending' || order.status === 'ordered' || order.status === 'partially_received') group.toReceive += 1;
      if (order.status === 'received') group.received += 1;
      if (order.order_date && order.order_date > group.lastOrderDate) group.lastOrderDate = order.order_date;
      group.totalValue += Number(order.total_value) || 0;
    }
    return Array.from(groups.values()).sort((a, b) => b.lastOrderDate.localeCompare(a.lastOrderDate));
  }, [filteredOrders, suppliers, t]);

  const changeListViewMode = (mode: 'grouped' | 'all') => {
    setListViewMode(mode);
    try {
      localStorage.setItem(PURCHASE_ORDERS_VIEW_STORAGE_KEY, mode);
    } catch {
      /* localStorage indisponível — fica só nesta sessão */
    }
  };

  const toggleSupplierGroup = (key: string) => {
    setExpandedSupplierGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderOrderOrigin = (order: PurchaseOrder) => {
    if ((order as any).source_type !== "contract" || !(order as any).source_id) {
      return <span className="text-muted-foreground">{t('purchaseOrders.origin.stock') || 'Stock'}</span>;
    }
    const contractId: string = (order as any).source_id;
    const info = listOriginByContract[contractId];
    if (!info) return <span className="text-muted-foreground">—</span>;
    const numberLabel = info.originType === "contract"
      ? (t('purchaseOrders.origin.contract', { number: info.number }) || `Contrato ${info.number}`)
      : info.number;
    const label = info.clientName ? `${numberLabel} — ${info.clientName}` : numberLabel;
    return (
      <Link
        to={`/client-orders?open=${contractId}`}
        className="block max-w-[280px] truncate hover:underline"
        title={label}
      >
        {label}
      </Link>
    );
  };

  // Coluna de ações fixa à direita: fundo opaco (a cor do cartão + a mesma tinta
  // da linha/hover em camadas), para não ficar transparente por cima das colunas
  // que passam por baixo durante o scroll horizontal. Sem border-l porque em
  // border-collapse a borda não acompanha o sticky — usa-se box-shadow.
  // A vista agrupada (sem coluna de fornecedor) está dentro de uma célula com
  // bg-muted/30, por isso a camada base inclui essa tinta.
  const stickyActionsBase =
    "sticky right-0 z-10 whitespace-nowrap bg-card shadow-[inset_1px_0_0_hsl(var(--border)),-6px_0_6px_-6px_rgb(0_0_0/0.15)]";
  const stickyActionsFlat =
    "group-hover:[background-image:linear-gradient(hsl(var(--muted)/0.5),hsl(var(--muted)/0.5))]";
  const stickyActionsNested =
    "[background-image:linear-gradient(hsl(var(--muted)/0.3),hsl(var(--muted)/0.3))] group-hover:[background-image:linear-gradient(hsl(var(--muted)/0.5),hsl(var(--muted)/0.5)),linear-gradient(hsl(var(--muted)/0.3),hsl(var(--muted)/0.3))]";
  const stickyActionsClass = (nested: boolean) =>
    `${stickyActionsBase} ${nested ? stickyActionsNested : stickyActionsFlat}`;

  // Linha de encomenda — usada tal e qual nas duas vistas ("Ver todas" e dentro
  // de cada grupo). Ações, condições e PermissionGate inalterados.
  // showSupplier=false só é usado dentro do grupo expandido (tabela aninhada).
  const renderOrderRow = (order: PurchaseOrder, showSupplier: boolean) => (
    <TableRow key={order.id} className="group">
      <TableCell className="font-mono font-semibold whitespace-nowrap">{order.order_number}</TableCell>
      {showSupplier && <TableCell>{order.suppliers?.name || "N/A"}</TableCell>}
      <TableCell className="whitespace-nowrap">{renderOrderOrigin(order)}</TableCell>
      <TableCell className="whitespace-nowrap">{new Date(order.order_date).toLocaleDateString()}</TableCell>
      <TableCell className="whitespace-nowrap">
        {order.expected_delivery
          ? new Date(order.expected_delivery).toLocaleDateString()
          : "N/A"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge className={`whitespace-nowrap ${getStatusColor(order.status)}`}>
          {getStatusLabel(order.status)}
        </Badge>
      </TableCell>
      <TableCell className="font-semibold whitespace-nowrap">€{order.total_value.toFixed(2)}</TableCell>
      <TableCell className={`text-right ${stickyActionsClass(!showSupplier)}`}>
        <div className="flex justify-end gap-2">
          {showDeleted ? (
            <PermissionGate permission="purchase_orders.delete">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(order.id)}
              >
                {t('purchaseOrders.restore') || 'Restaurar'}
              </Button>
            </PermissionGate>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={() => handleGeneratePDF(order.id)} title="Gerar PDF">
                <FileDown className="w-4 h-4" />
              </Button>
              {(order.status === 'pending' || order.status === 'ordered' || order.status === 'partially_received') && (
                // Mesmas permissões que rpc_receive_purchase_order_lines exige (a receção dá entrada de stock).
                <PermissionGate permissions={["purchase_orders.receive", "inventory.edit"]} requireAll>
                  <Button variant="ghost" size="icon" onClick={() => openReceiveDialog(order)} title="Marcar como recebida">
                    <PackageCheck className="w-4 h-4" />
                  </Button>
                </PermissionGate>
              )}
              {(order.status === 'pending' || order.status === 'ordered' || order.status === 'partially_received') && (
                // "Não vou receber o resto" da PO inteira — mesmas permissões que a receção.
                <PermissionGate permissions={["purchase_orders.receive", "inventory.edit"]} requireAll>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openPoOrderCancelFromList(order)}
                    title="Não vou receber"
                    aria-label="Não vou receber o resto da encomenda"
                  >
                    <Ban className="w-4 h-4" />
                  </Button>
                </PermissionGate>
              )}
              {(order.status === 'received' || order.status === 'partially_received') && (
                // Mesmas permissões que rpc_revert_purchase_order_receipt exige (a reversão retira stock).
                <PermissionGate permissions={["purchase_orders.revert_receipt", "inventory.edit"]} requireAll>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openRevertDialog(order)}
                    title={t('purchaseOrders.revert.action') || "Reverter receção"}
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </PermissionGate>
              )}
              <PermissionGate permission="purchase_orders.edit">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(order)}
                  disabled={order.status === 'partially_received' || order.status === 'received'}
                  title={
                    order.status === 'partially_received' || order.status === 'received'
                      ? "Não é possível editar uma encomenda já recebida"
                      : undefined
                  }
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </PermissionGate>
              <PermissionGate permission="purchase_orders.delete">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(order.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </PermissionGate>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  const renderOrderTableHeader = (showSupplier: boolean) => (
    <TableHeader>
      <TableRow className="group">
        <TableHead className="whitespace-nowrap">{t('purchaseOrders.table.number')}</TableHead>
        {showSupplier && <TableHead>{t('purchaseOrders.table.supplier')}</TableHead>}
        <TableHead>{t('purchaseOrders.table.origin') || 'Origem / Cliente'}</TableHead>
        <TableHead>{t('purchaseOrders.table.date')}</TableHead>
        <TableHead>{t('purchaseOrders.table.delivery')}</TableHead>
        <TableHead>{t('purchaseOrders.table.status')}</TableHead>
        <TableHead>{t('purchaseOrders.table.totalValue')}</TableHead>
        <TableHead className={`text-right ${stickyActionsClass(!showSupplier)}`}>{t('purchaseOrders.table.actions')}</TableHead>
      </TableRow>
    </TableHeader>
  );

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-3xl font-bold">{t('purchaseOrders.title')}</h1><p className="text-muted-foreground">{t('purchaseOrders.description')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">{t('purchaseOrders.loading')}</h1>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-full"></div>
            <div className="h-64 bg-muted rounded w-full"></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-2">{t('purchaseOrders.title')}</h1>
              <p className="text-muted-foreground">{t('purchaseOrders.description')}</p>
            </div>
            <PageFAQSheet pageKey="operations.purchaseOrders" />
          </div>
          <div className="flex gap-2">
            <Button
              variant={showDeleted ? "default" : "outline"}
              onClick={() => setShowDeleted((prev) => !prev)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {showDeleted ? (t('purchaseOrders.hideDeleted') || 'Ocultar eliminados') : (t('purchaseOrders.showDeleted') || 'Ver eliminados')}
            </Button>
            <PermissionGate permission="purchase_orders.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('purchaseOrders.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="purchase_orders.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    {t('purchaseOrders.import')}
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('purchaseOrders.import.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="csv-upload">{t('purchaseOrders.import.csvFile')}</Label>
                    <Input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleImport}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('purchaseOrders.import.description')}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            </PermissionGate>
            <PermissionGate permission="purchase_orders.create">
           <Dialog open={open} onOpenChange={handleOrderDialogOpenChange}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('purchaseOrders.newOrder')}
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-6xl max-h-[90vh] overflow-y-auto"
                onCloseAutoFocus={(e) => {
                  if (skipOrderDialogFocusRestoreRef.current) {
                    skipOrderDialogFocusRestoreRef.current = false;
                    e.preventDefault();
                  }
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {!editingId
                      ? t('purchaseOrders.newOrder')
                      : editingOrderMeta?.id === editingId
                        ? (isOrderReadOnly
                            ? t('purchaseOrders.orderTitle', {
                                number: editingOrderMeta.orderNumber,
                                supplier: editingOrderMeta.supplierName || '—',
                              })
                            : `${t('purchaseOrders.editOrder')} ${editingOrderMeta.orderNumber} — ${editingOrderMeta.supplierName || '—'}`)
                        : t('purchaseOrders.editOrder')}
                  </DialogTitle>
                  {editingId && orderSourceInfo && (
                    <p className="text-sm text-muted-foreground">
                      {orderSourceInfo.originType === 'direct_sale'
                        ? (t('purchaseOrders.generatedFromDirectSale', {
                            number: orderSourceInfo.number,
                            clientName: orderSourceInfo.clientName,
                          }) || `Gerada automaticamente a partir da Venda Direta ${orderSourceInfo.number} — Cliente ${orderSourceInfo.clientName}`)
                        : orderSourceInfo.originType === 'manual'
                        ? (t('purchaseOrders.generatedFromClientOrder', {
                            number: orderSourceInfo.number,
                            clientName: orderSourceInfo.clientName,
                          }) || `Gerada automaticamente a partir da Encomenda Cliente ${orderSourceInfo.number} — Cliente ${orderSourceInfo.clientName}`)
                        : (t('purchaseOrders.generatedFromContract', {
                            contractNumber: orderSourceInfo.number,
                            clientName: orderSourceInfo.clientName,
                          }) || `Gerada automaticamente a partir do Contrato ${orderSourceInfo.number} — Cliente ${orderSourceInfo.clientName}`)}
                      {' '}
                      <Link to={`/client-orders?open=${orderSourceInfo.contractId}`} className="underline">
                        {t('purchaseOrders.viewClientOrder') || 'Ver Encomenda Cliente'}
                      </Link>
                    </p>
                  )}
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Encomenda recebida: só de leitura. A reversão é por linha, no
                      diálogo próprio — mesmas permissões que o botão ↩ da lista. */}
                  {isOrderReadOnly && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
                      <p className="text-sm text-muted-foreground">
                        {t('purchaseOrders.readOnlyReceived')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {/* EC inativa: o que foi entregue à EC pode passar para stock.
                            Mesmas permissões que rpc_po_receipt_release_to_stock. */}
                        {releasableLines.length > 0 && (
                          <PermissionGate permissions={["purchase_orders.receive", "inventory.edit"]} requireAll>
                            <Button type="button" variant="outline" size="sm" onClick={() => void handleReleaseFromOrderDialog()}>
                              <PackageCheck className="w-4 h-4 mr-2" />
                              Passar para stock
                            </Button>
                          </PermissionGate>
                        )}
                        {editingOrderMeta?.hasReceivedLines && (
                          <PermissionGate permissions={["purchase_orders.revert_receipt", "inventory.edit"]} requireAll>
                            <Button type="button" variant="outline" size="sm" onClick={handleRevertFromOrderDialog}>
                              <Undo2 className="w-4 h-4 mr-2" />
                              {t('purchaseOrders.revert.action')}
                            </Button>
                          </PermissionGate>
                        )}
                      </div>
                      {releasableLines.length > 0 && orderContractState?.active === false && (
                        <p className="w-full text-xs text-amber-700 dark:text-amber-400">
                          A encomenda cliente {orderContractState.number || "ligada"} está inativa — o que foi recebido para ela pode passar para stock.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Organization Selection — sem prop disabled; em só de leitura o
                      fieldset desativa os controlos e bloqueia o rato. */}
                  <fieldset
                    disabled={isOrderReadOnly}
                    className={isOrderReadOnly ? "min-w-0 pointer-events-none opacity-70" : "min-w-0"}
                  >
                    <OrganizationFormSection
                      value={organizationSelection}
                      onChange={setOrganizationSelection}
                      showSecondaryCompanies={false}
                      multiSelectCompanies={false}
                    />
                  </fieldset>

                  {/* Fase 5.0F: ligação manual opcional a uma Encomenda Cliente — só
                      na criação, resolve o caso "sem_fornecedor" em Encomendas
                      Clientes (produto sem fornecedor preferencial na altura da
                      assinatura, nenhuma PO autogerada). */}
                  {!editingId && clientOrderOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="new_order_client_order">{t('purchaseOrders.form.clientOrderSource') || 'Encomenda Cliente de origem (opcional)'}</Label>
                      <Select
                        value={newOrderClientOrderId || "none"}
                        onValueChange={handleNewOrderClientOrderChange}
                        disabled={clientOrderLinesLoading}
                      >
                        <SelectTrigger id="new_order_client_order">
                          <SelectValue placeholder={t('purchaseOrders.form.clientOrderSourceNone') || 'Nenhuma — encomenda sem ligação a um contrato'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('purchaseOrders.form.clientOrderSourceNone') || 'Nenhuma — encomenda sem ligação a um contrato'}</SelectItem>
                          {clientOrderOptions.map((o) => (
                            <SelectItem key={o.contract_id} value={o.contract_id}>
                              {o.order_number || o.contract_number}
                              {o.origin_type === 'direct_sale'
                                ? ` · ${t('purchaseOrders.form.clientOrderOriginDirectSale', { number: o.origin_number || '' }) || `Venda Direta ${o.origin_number || ''}`}`.trimEnd()
                                : o.origin_type === 'contract'
                                ? ` · ${t('purchaseOrders.form.clientOrderOriginContract', { number: o.origin_number || o.contract_number }) || `Contrato ${o.origin_number || o.contract_number}`}`
                                : ''}
                              {' — '}{o.client_name || "—"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {clientOrderLinesLoading
                          ? "A carregar produtos da encomenda…"
                          : (pendingClientOrderLines.length > 0 && !formData.supplier_id)
                            ? "Escolhe o fornecedor abaixo para os produtos desta Encomenda Cliente serem adicionados automaticamente."
                            : (t('purchaseOrders.form.clientOrderSourceHint') || 'Liga esta encomenda à Encomenda Cliente que está a satisfazer — os produtos preenchem-se automaticamente ao escolher o fornecedor. Fica rastreável em "Encomendas Clientes" e o estado atualiza quando esta for recebida.')}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplier_id">{t('purchaseOrders.form.supplier')} *</Label>
                      <Select value={formData.supplier_id} onValueChange={(value) => {
                        setFormData({ ...formData, supplier_id: value });
                        setOrderItems([]);
                      }} required disabled={isOrderReadOnly}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('purchaseOrders.form.selectSupplier')} />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.supplier_id && <p className="text-xs text-destructive">{fieldErrors.supplier_id}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_date">{t('purchaseOrders.form.orderDate')} *</Label>
                      <Input
                        id="order_date"
                        type="date"
                        value={formData.order_date}
                        onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                        required
                        disabled={isOrderReadOnly}
                        className={fieldErrors.order_date ? "border-destructive" : ""}
                      />
                      {fieldErrors.order_date && <p className="text-xs text-destructive">{fieldErrors.order_date}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expected_delivery">{t('purchaseOrders.form.expectedDelivery')}</Label>
                      <Input
                        id="expected_delivery"
                        type="date"
                        value={formData.expected_delivery}
                        onChange={(e) => setFormData({ ...formData, expected_delivery: e.target.value })}
                        disabled={isOrderReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">{t('purchaseOrders.form.status')} *</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })} disabled={isOrderReadOnly}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">{t('purchaseOrders.status.pending')}</SelectItem>
                          {/* Passar a "ordered" (aprovar a encomenda) requer purchase_orders.approve.
                              Continua visível se já for o valor atual (ex.: a reabrir uma encomenda
                              já aprovada por quem entretanto perdeu a permissão), só fica indisponível
                              para escolher de novo a partir de outro estado sem a permissão. Isto é só
                              UX — o backend rejeita na mesma quem contornar isto. */}
                          {(hasPermission('purchase_orders.approve') || formData.status === 'ordered') && (
                            <SelectItem value="ordered">{t('purchaseOrders.status.ordered')}</SelectItem>
                          )}
                          {/* "received" já não é uma opção genérica aqui — passa pelo botão
                              dedicado "Marcar como recebida" na lista (Fase 4C), que pede o
                              armazém de destino e gera a entrada em stock_movements. Manter
                              este dropdown a permitir 'received' deixaria criar encomendas
                              "recebidas" sem nunca dar entrada em stock nenhum. */}
                          {editingId && formData.status === 'received' && (
                            <SelectItem value="received">{t('purchaseOrders.status.received')}</SelectItem>
                          )}
                          {/* "partially_received" nunca é uma escolha manual — é derivado por
                              rpc_receive_purchase_order_lines a partir das receções parciais
                              já registadas. Só aparece aqui, desativado, se a encomenda já
                              estiver neste estado (hoje inatingível a partir deste formulário,
                              já que o botão de editar fica desativado para encomendas com
                              receção parcial — mantido por clareza/defesa em profundidade). */}
                          {editingId && formData.status === 'partially_received' && (
                            <SelectItem value="partially_received" disabled>
                              {t('purchaseOrders.status.partiallyReceived')}
                            </SelectItem>
                          )}
                          <SelectItem value="cancelled">{t('purchaseOrders.status.cancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                      {!isOrderReadOnly && !hasPermission('purchase_orders.approve') && formData.status !== 'ordered' && (
                        <p className="text-xs text-muted-foreground">
                          Sem permissão para aprovar encomendas (mudar para "{t('purchaseOrders.status.ordered')}").
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('purchaseOrders.form.notes')}</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      disabled={isOrderReadOnly}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold">{t('purchaseOrders.form.orderItems')}</h3>
                      {!isOrderReadOnly && (
                      <Button 
                        type="button" 
                        onClick={() => setShowItemsDialog(true)}
                        disabled={!formData.supplier_id}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('purchaseOrders.form.addItems')}
                      </Button>
                      )}
                    </div>

                    {orderItems.length > 0 ? (
                      <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-2 space-y-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('purchaseOrders.items.sku')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.description')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.quantity')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.unitPrice')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.vat')}</TableHead>
                                <TableHead>{t('purchaseOrders.items.total')}</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                             <TableBody>
                               {orderItems.map((item, index) => (
                                 <TableRow key={index}>
                                   <TableCell className="font-mono text-xs">{item.sku || "N/A"}</TableCell>
                                   <TableCell>{item.description}</TableCell>
                                   <TableCell>
                                     <Input
                                       type="number"
                                       value={item.quantity}
                                       onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                       disabled={isOrderReadOnly}
                                       className="w-20"
                                       min="0"
                                       step={itemRequiresIntegerQty(item) ? "1" : "0.01"}
                                       inputMode={itemRequiresIntegerQty(item) ? "numeric" : undefined}
                                     />
                                   </TableCell>
                                   <TableCell>
                                     <Input
                                       type="number"
                                       value={item.unit_price}
                                       onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                                       disabled={isOrderReadOnly}
                                       className="w-24"
                                       min="0"
                                       step="0.01"
                                     />
                                   </TableCell>
                                   <TableCell>{item.vat_rate}%</TableCell>
                                   <TableCell className="font-semibold">€{item.total_price.toFixed(2)}</TableCell>
                                   <TableCell>
                                     <div className="flex gap-1">
                                        {!isOrderReadOnly && item.item_type === 'product' && item.product_id && (
                                         <Button
                                           type="button"
                                           variant="ghost"
                                           size="icon"
                                           onClick={() => {
                                             const product = products.find(p => p.id === item.product_id);
                                             setEditingItemIndex(index);
                                             setEditingProductId(item.product_id);
                                             setEditingProductName(product?.name || item.description);
                                           }}
                                           title={t('quoteBuilder.editAttributes')}
                                         >
                                           <Tag className="w-4 h-4" />
                                         </Button>
                                       )}
                                       {!isOrderReadOnly && (
                                       <Button
                                         type="button"
                                         variant="ghost"
                                         size="icon"
                                         onClick={() => handleRemoveItem(index)}
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </Button>
                                       )}
                                     </div>
                                   </TableCell>
                                 </TableRow>
                               ))}
                             </TableBody>
                          </Table>
                        </div>

                        <div>
                          <Card>
                            <CardHeader>
                              <CardTitle>{t('purchaseOrders.summary.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('purchaseOrders.summary.subtotal')}</span>
                                <span>€{totals.subtotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('purchaseOrders.summary.vat')}</span>
                                <span>€{totals.totalVat.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                                <span>{t('purchaseOrders.summary.total')}</span>
                                <span>€{totals.total.toFixed(2)}</span>
                              </div>
                              <div className="text-sm text-muted-foreground pt-2">
                                {t('purchaseOrders.summary.items')}: {orderItems.length}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {t('purchaseOrders.form.noItems')}
                      </div>
                    )}
                  </div>

                  {/* "Não vou receber o resto": anulações ativas desta PO (linha ou
                      PO inteira). Só informação + Desfazer; a anulação da PO
                      inteira (batch_id) desfaz-se em lote. */}
                  {editingId && orderCancellations?.orderId === editingId && orderCancellations.rows.length > 0 && (() => {
                    const rows = orderCancellations.rows;
                    const itemsById = new Map(
                      (orderReceiptItems?.orderId === editingId ? orderReceiptItems.items : []).map((i) => [i.id, i]),
                    );
                    return (
                      <div className="border-t pt-4 space-y-2">
                        <p className="text-sm font-medium">Resto anulado (não vai ser recebido)</p>
                        <ul className="space-y-1">
                          {rows.map((c, idx) => {
                            // purchase_order_item_id null = linha recriada na edição
                            // da PO: mostra-se sem nome de linha e sem Desfazer.
                            const lineGone = !c.purchase_order_item_id;
                            const item = c.purchase_order_item_id ? itemsById.get(c.purchase_order_item_id) : undefined;
                            const lineUomCode = poCancellationUomCode(item);
                            const name = item?.products?.name || item?.description || (lineGone ? "Linha já não existe" : "Linha");
                            // Lote: um só "Desfazer" (na primeira linha do lote que ainda existe).
                            const isBatchFollower = lineGone || (!!c.batch_id &&
                              rows.findIndex((r) => r.batch_id === c.batch_id && !!r.purchase_order_item_id) !== idx);
                            return (
                              <li key={c.id} className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                                <span>
                                  {name}: {formatQty(c.quantity_cancelled)}{lineUomCode ? ` ${lineUomCode}` : ""} anulado(s) — {poCancellationReasonLabel(c.reason)}
                                  {c.notes ? ` (${c.notes})` : ""} · {new Date(c.created_at).toLocaleString("pt-PT")}
                                </span>
                                {!isBatchFollower && (
                                  <PermissionGate permissions={["purchase_orders.receive", "inventory.edit"]} requireAll>
                                    <Button
                                      type="button"
                                      variant="link"
                                      size="sm"
                                      className="h-6 px-1 text-xs"
                                      onClick={() => setPoUndoTarget({
                                        cancellationId: c.id,
                                        batchId: c.batch_id ?? null,
                                        orderId: c.purchase_order_id,
                                        source: "orderDialog",
                                        description: `Volta a ficar por receber: ${formatQty(c.quantity_cancelled)}${lineUomCode ? ` ${lineUomCode}` : ""} de ${name}.`,
                                      })}
                                    >
                                      {c.batch_id ? "Desfazer (toda a encomenda)" : "Desfazer"}
                                    </Button>
                                  </PermissionGate>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}

                  {/* Histórico de receções (purchase_order_receipts, 20261206130000) —
                      só de leitura, colapsável. Receções anteriores à tabela não
                      têm registo aqui. */}
                  {editingId && (
                    (orderReceipts?.orderId === editingId && orderReceipts.rows.length > 0) ||
                    (editingOrderMeta?.id === editingId && editingOrderMeta.hasReceivedLines)
                  ) && (() => {
                    const rows = orderReceipts?.orderId === editingId ? orderReceipts.rows : [];
                    const warehouseNames = orderReceipts?.orderId === editingId ? orderReceipts.warehouseNames : {};
                    const itemsById = new Map(
                      (orderReceiptItems?.orderId === editingId ? orderReceiptItems.items : []).map((i) => [i.id, i]),
                    );
                    return (
                      <div className="border-t pt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-2 -ml-2"
                          onClick={() => setReceiptHistoryOpen((v) => !v)}
                          aria-expanded={receiptHistoryOpen}
                        >
                          {receiptHistoryOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                          Histórico de receções{rows.length > 0 ? ` (${rows.length})` : ""}
                        </Button>
                        {receiptHistoryOpen && (
                          rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-2">
                              Sem registo detalhado — as receções feitas antes desta funcionalidade não aparecem aqui.
                            </p>
                          ) : (
                            <div className="mt-2 overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Linha / produto</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead className="text-right">Quantidade</TableHead>
                                    <TableHead className="text-right">Para EC</TableHead>
                                    <TableHead className="text-right">Para stock</TableHead>
                                    <TableHead>Armazém</TableHead>
                                    <TableHead>Estado</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rows.map((r) => {
                                    const item = r.purchase_order_item_id ? itemsById.get(r.purchase_order_item_id) : undefined;
                                    const units = Number(r.units_per_uom) || 1;
                                    const baseCode = stockUnitCode(item);
                                    const isRelease = r.kind === "release_to_stock";
                                    return (
                                      <TableRow key={r.id} className={r.reverted_at ? "opacity-60" : ""}>
                                        <TableCell className="whitespace-nowrap">{new Date(r.received_at).toLocaleString("pt-PT")}</TableCell>
                                        <TableCell>
                                          <div className="max-w-[240px] truncate" title={item?.products?.name || item?.description || ""}>
                                            {item?.products?.name || item?.description || "Linha removida"}
                                          </div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">{isRelease ? "Passagem para stock" : "Receção"}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                          {isRelease ? "—" : `${formatQty(r.quantity)}${units === 1 && item ? ` ${baseCode}` : ""}`}
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                          {Number(r.units_to_order) > 0 ? `${formatQty(r.units_to_order)} ${baseCode}` : "—"}
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                          {Number(r.units_to_stock) > 0 ? `${formatQty(r.units_to_stock)} ${baseCode}` : "—"}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">{r.warehouse_id ? warehouseNames[r.warehouse_id] || "—" : "—"}</TableCell>
                                        <TableCell>
                                          {r.reverted_at ? (
                                            <span className="text-xs">
                                              Revertida em {new Date(r.reverted_at).toLocaleString("pt-PT")}
                                              {r.revert_reason ? ` — ${r.revert_reason}` : ""}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">
                                              Ativa{isRelease && r.notes ? ` — ${r.notes}` : ""}
                                            </span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 justify-end pt-4 border-t">
                    {isOrderReadOnly ? (
                      // Fecho completo (repõe o formulário) — o Cancelar abaixo só
                      // fecha, e deixaria o editingId/modo só de leitura agarrados
                      // à próxima "Nova Encomenda".
                      <Button type="button" variant="outline" onClick={() => handleOrderDialogOpenChange(false)}>
                        {t('purchaseOrders.form.close')}
                      </Button>
                    ) : (
                      <>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                          {t('purchaseOrders.form.cancel')}
                        </Button>
                        <Button type="submit">
                          {editingId ? t('purchaseOrders.form.update') : t('purchaseOrders.form.create')}
                        </Button>
                      </>
                    )}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </PermissionGate>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4 flex-wrap md:items-end">
              <div className="space-y-2 w-full md:w-[200px]">
                <Label>{t('purchaseOrders.filters.supplier')}</Label>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('purchaseOrders.filters.all')}</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 w-full md:w-[200px]">
                <Label>{t('purchaseOrders.filters.status')}</Label>
                <Select value={statusFilterValue} onValueChange={setStatusFilterValue}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('purchaseOrders.filters.all')}</SelectItem>
                    <SelectItem value="pending">{getStatusLabel('pending')}</SelectItem>
                    <SelectItem value="ordered">{getStatusLabel('ordered')}</SelectItem>
                    <SelectItem value="partially_received">{getStatusLabel('partially_received')}</SelectItem>
                    <SelectItem value="received">{getStatusLabel('received')}</SelectItem>
                    <SelectItem value="cancelled">{getStatusLabel('cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 w-full md:w-[190px]">
                <Label>{t('purchaseOrders.filters.dateField')}</Label>
                <Select
                  value={dateFilterField}
                  onValueChange={(value) => setDateFilterField(value as "order_date" | "actual_delivery_date")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order_date">{t('purchaseOrders.filters.dateFieldOrder')}</SelectItem>
                    <SelectItem value="actual_delivery_date">{t('purchaseOrders.filters.dateFieldDelivery')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 w-full md:w-[160px]">
                <Label>{t('purchaseOrders.filters.dateFrom')}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>

              <div className="space-y-2 w-full md:w-[160px]">
                <Label>{t('purchaseOrders.filters.dateTo')}</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>

              {hasActiveOrderFilters && (
                <Button variant="outline" onClick={clearOrderFilters}>
                  <X className="w-4 h-4 mr-2" />
                  {t('purchaseOrders.filters.clear')}
                </Button>
              )}

              <Button
                variant="outline"
                className="md:ml-auto"
                onClick={() => changeListViewMode(listViewMode === 'grouped' ? 'all' : 'grouped')}
              >
                {listViewMode === 'grouped' ? (
                  <>
                    <List className="w-4 h-4 mr-2" />
                    {t('purchaseOrders.view.all') || 'Ver todas'}
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4 mr-2" />
                    {t('purchaseOrders.view.grouped') || 'Agrupar por fornecedor'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {hasActiveOrderFilters ? t('purchaseOrders.filters.noResults') : t('purchaseOrders.noOrders')}
              </p>
            </div>
          ) : listViewMode === 'grouped' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>{t('purchaseOrders.table.supplier')}</TableHead>
                  <TableHead className="text-right">{t('purchaseOrders.groups.orderCount') || 'Nº encomendas'}</TableHead>
                  <TableHead className="text-right">{t('purchaseOrders.groups.toReceive') || 'Por receber'}</TableHead>
                  <TableHead className="text-right">{t('purchaseOrders.groups.received') || 'Recebidas'}</TableHead>
                  <TableHead>{t('purchaseOrders.groups.lastOrder') || 'Última encomenda'}</TableHead>
                  <TableHead className="text-right">{t('purchaseOrders.groups.totalValue') || 'Valor total'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierGroups.map((group) => {
                  const isExpanded = expandedSupplierGroups.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleSupplierGroup(group.key)}
                      >
                        <TableCell className="w-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded
                              ? (t('purchaseOrders.groups.collapse') || 'Recolher')
                              : (t('purchaseOrders.groups.expand') || 'Expandir')}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSupplierGroup(group.key);
                            }}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-semibold">{group.supplierName}</TableCell>
                        <TableCell className="text-right">{group.orders.length}</TableCell>
                        <TableCell className="text-right">{group.toReceive}</TableCell>
                        <TableCell className="text-right">{group.received}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {group.lastOrderDate ? new Date(group.lastOrderDate).toLocaleDateString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">€{group.totalValue.toFixed(2)}</TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/30 p-2 md:pl-10">
                            {/* w-0 + min-w-full: o contentor com overflow-auto não contribui
                                com a largura da tabela interna para a célula, por isso fica
                                com a largura disponível e o scroll horizontal (e o sticky das
                                ações) passam a ser deste contentor, não da tabela exterior. */}
                            <Table containerClassName="w-0 min-w-full">
                              {renderOrderTableHeader(false)}
                              <TableBody>
                                {group.orders.map((order) => renderOrderRow(order, false))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              {renderOrderTableHeader(true)}
              <TableBody>
                {filteredOrders.map((order) => renderOrderRow(order, true))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Items Selection Dialog */}
      <Dialog open={showItemsDialog} onOpenChange={setShowItemsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('purchaseOrders.items.title')}</DialogTitle>
          </DialogHeader>
          
          <Tabs value={selectedItemType} onValueChange={(v) => setSelectedItemType(v as 'product' | 'service')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="product">{t('purchaseOrders.items.products')}</TabsTrigger>
              <TabsTrigger value="service">{t('purchaseOrders.items.services')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="product" className="space-y-4 max-h-[50vh] overflow-y-auto">
              {availableProductsForSupplier.map((product) => (
                <div key={product.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <Checkbox
                    checked={selectedCatalogItems.includes(product.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCatalogItems([...selectedCatalogItems, product.id]);
                      } else {
                        setSelectedCatalogItems(selectedCatalogItems.filter(id => id !== product.id));
                        const newAttrs = { ...selectedItemAttributes };
                        delete newAttrs[product.id];
                        setSelectedItemAttributes(newAttrs);
                      }
                    }}
                  />
                  <div className="flex-1 space-y-2">
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        SKU: {product.sku || "N/A"} | {t('purchaseOrders.items.price')}: €{product.purchase_price?.toFixed(2) || "N/A"} | {t('purchaseOrders.items.vat')}: {product.vat_rate}%
                      </div>
                    </div>
                    
                    {selectedCatalogItems.includes(product.id) && productAttributes.get(product.id) && (
                      <div className="pl-4 space-y-2 border-l-2">
                        {productAttributes.get(product.id)!.map(attr => (
                          <div key={attr.id} className="space-y-1">
                            <Label className="text-xs">
                              {attr.name}
                              {attr.unit && <span className="text-muted-foreground ml-1">({attr.unit})</span>}
                            </Label>
                            {attr.value_type === 'list' && attr.allowed_values ? (
                              <Select
                                value={selectedItemAttributes[product.id]?.[attr.id] || ""}
                                onValueChange={(value) => {
                                  setSelectedItemAttributes({
                                    ...selectedItemAttributes,
                                    [product.id]: {
                                      ...selectedItemAttributes[product.id],
                                      [attr.id]: value,
                                    }
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder={`${t('purchaseOrders.items.select')} ${attr.name}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {attr.allowed_values.map(val => (
                                    <SelectItem key={val} value={val}>
                                      {val}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={attr.value_type === 'number' ? 'number' : 'text'}
                                placeholder={attr.unit ? `${attr.unit}` : ''}
                                className="h-8"
                                value={selectedItemAttributes[product.id]?.[attr.id] || ""}
                                onChange={(e) => {
                                  setSelectedItemAttributes({
                                    ...selectedItemAttributes,
                                    [product.id]: {
                                      ...selectedItemAttributes[product.id],
                                      [attr.id]: e.target.value,
                                    }
                                  });
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="service" className="space-y-4 max-h-[50vh] overflow-y-auto">
              {availableServicesForSupplier.map((service) => (
                <div key={service.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <Checkbox
                    checked={selectedCatalogItems.includes(service.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCatalogItems([...selectedCatalogItems, service.id]);
                      } else {
                        setSelectedCatalogItems(selectedCatalogItems.filter(id => id !== service.id));
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-semibold">{service.name}</div>
                    <div className="text-sm text-muted-foreground">
                      SKU: {service.sku || "N/A"} | {t('purchaseOrders.items.price')}: €{service.purchase_price?.toFixed(2) || "N/A"} | {t('purchaseOrders.items.vat')}: {service.vat_rate}%
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowItemsDialog(false)}>
              {t('purchaseOrders.items.cancel')}
            </Button>
            <Button onClick={handleAddCatalogItems} disabled={selectedCatalogItems.length === 0}>
              {t('purchaseOrders.items.add')} {selectedCatalogItems.length} Item(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Edit Line Attributes Dialog */}
      {editingItemIndex !== null && editingProductId && (
        <LineAttributesDialog
          open={editingItemIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditingItemIndex(null);
              setEditingProductId(null);
              setEditingProductName("");
            }
          }}
          productId={editingProductId}
          productName={editingProductName}
          currentAttributes={orderItems[editingItemIndex]?.selected_attributes || {}}
          onSave={(attributes) => {
            if (editingItemIndex !== null) {
              const updatedItems = [...orderItems];
              updatedItems[editingItemIndex] = {
                ...updatedItems[editingItemIndex],
                selected_attributes: attributes
              };
              setOrderItems(updatedItems);
              
              toast({
                title: t('purchaseOrders.toast.attributesUpdated'),
                description: t('purchaseOrders.toast.attributesUpdatedDesc')
              });
            }
          }}
        />
      )}

      {/* Receção de encomenda, total ou parcial (Fase 4) — pede o armazém de
          destino e, por linha de produto, a quantidade a dar entrada agora;
          liga a rpc_receive_purchase_order_lines (recebe só as
          linhas/quantidades indicadas). Receções parciais em armazéns
          diferentes fazem-se em 2 chamadas separadas (1 armazém por chamada). */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receção de encomenda{receivingOrder ? ` — ${receivingOrder.order_number}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Indica, por linha, a quantidade a receber agora. Só as quantidades
              indicadas são recebidas — o que ficar por preencher continua por receber para uma
              entrega posterior.
              {receivingOrder?.isClientOrder &&
                " Esta encomenda está ligada a uma Encomenda Cliente: o que ela ainda precisa fica para ela e o excedente entra em stock."}
            </p>
            {(() => {
              // Decide-se pelo motivo da alocação; o número da EC pode faltar.
              const inactiveLines = Object.values(receivePreview).filter((l) => l.allocation_reason === "client_order_inactive");
              if (inactiveLines.length === 0) return null;
              const numbers = distinctContractNumbers(inactiveLines);
              return (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {numbers.length > 0 ? `A encomenda cliente ${numbers.join(", ")}` : "A encomenda cliente ligada"} está inativa — o recebido entra em stock.
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Armazém de destino</Label>
              <Select value={receiveWarehouseId} onValueChange={setReceiveWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolhe um armazém" />
                </SelectTrigger>
                <SelectContent>
                  {receiveWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("purchaseOrders.receive.actualDeliveryDate")}</Label>
              <Input
                type="date"
                value={actualDeliveryDate}
                onChange={(e) => setActualDeliveryDate(e.target.value)}
              />
            </div>

            {receiveLines.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Linhas a receber</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAllReceiveLines}>
                    Selecionar tudo
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Encomendada</TableHead>
                      <TableHead className="text-right">Já recebida</TableHead>
                      <TableHead className="text-right">Receber agora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiveLines.map((item) => {
                      const remaining = getReceiveRemaining(item);
                      const fullyReceived = remaining <= 0;
                      return (
                        <TableRow key={item.id} className={fullyReceived ? "opacity-50" : ""}>
                          <TableCell className={fullyReceived ? "line-through" : ""}>
                            <div className="font-medium">{item.products?.name || item.description}</div>
                            {item.sku && (
                              <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{item.received_quantity || 0}</TableCell>
                          <TableCell className="text-right">
                            {fullyReceived ? (
                              <span className="text-xs text-muted-foreground">
                                {/* quantity=0 só acontece numa linha anulada sem nada recebido. */}
                                {Number(item.quantity) <= 0 && !(Number(item.received_quantity) > 0) ? "anulada" : "já recebida"}
                              </span>
                            ) : (
                              <>
                                <Input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step="1"
                                  className="w-24 ml-auto"
                                  value={receiveLineQuantities[item.id] ?? 0}
                                  onChange={(e) => {
                                    const raw = parseFloat(e.target.value);
                                    const clamped = isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), remaining);
                                    setReceiveLineQuantities((prev) => ({ ...prev, [item.id]: clamped }));
                                  }}
                                />
                                {/* Destino por linha (só PO ligada a uma EC; numa PO
                                    de stock tudo entra em stock, sem pré-visualização). */}
                                {receivingOrder?.isClientOrder && (() => {
                                  const toReceive = receiveLineQuantities[item.id] || 0;
                                  if (toReceive <= 0) return null;
                                  const preview = receivePreview[item.id];
                                  // Repartição de uma quantidade já alterada (ou ainda sem resposta).
                                  if (!preview || preview.requested_quantity !== toReceive) {
                                    return receivePreviewError ? null : (
                                      <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">a calcular destino…</div>
                                    );
                                  }
                                  const units = Number(preview.units_per_uom ?? item.units_per_uom) || 1;
                                  const baseCode = stockUnitCode(item);
                                  const qtyToOrder = Number(preview.qty_to_order) || 0;
                                  const qtyToStock = Number(preview.qty_to_stock) || 0;
                                  const parts: string[] = [];
                                  if (qtyToOrder > 0) {
                                    parts.push(
                                      `${formatQty(qtyToOrder)} para ${preview.contract_order_number || "a EC"}` +
                                        (units > 1 ? ` (${formatQty(preview.units_to_order)} ${baseCode})` : ""),
                                    );
                                  }
                                  if (qtyToStock > 0) {
                                    parts.push(
                                      `${formatQty(qtyToStock)} para stock` +
                                        (units > 1 ? ` (${formatQty(preview.units_to_stock)} ${baseCode})` : ""),
                                    );
                                  }
                                  if (parts.length === 0) return null;
                                  return (
                                    <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">{parts.join(" / ")}</div>
                                  );
                                })()}
                              </>
                            )}
                            {(() => {
                              // "Não vou receber o resto": anulações ativas desta
                              // linha + ação para anular o que ainda falta.
                              const lineCancellations = receiveCancellations && receiveCancellations.orderId === receivingOrder?.id
                                ? receiveCancellations.rows.filter((c) => c.purchase_order_item_id === item.id)
                                : [];
                              if (lineCancellations.length === 0 && fullyReceived) return null;
                              const uomLabel = poCancellationUomCode(item);
                              const productName = item.products?.name || item.description || "produto";
                              return (
                                <div className="mt-1 flex flex-col items-end text-xs">
                                  {lineCancellations.map((c) => {
                                    // Lote: um só "Desfazer (toda a encomenda)", na
                                    // primeira linha do lote que está na tabela.
                                    const isBatchFollower = !!c.batch_id && receiveCancellations?.rows.find(
                                      (r) => r.batch_id === c.batch_id && !!r.purchase_order_item_id &&
                                        receiveLines.some((l) => l.id === r.purchase_order_item_id),
                                    )?.id !== c.id;
                                    return (
                                    <div key={c.id} className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                                      <span title={c.notes || undefined}>
                                        {formatQty(c.quantity_cancelled)}{uomLabel ? ` ${uomLabel}` : ""} anulado(s) — {poCancellationReasonLabel(c.reason)}
                                      </span>
                                      {!isBatchFollower && (
                                      <Button
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="h-6 px-1 text-xs"
                                        disabled={receiving || poUndoSubmitting}
                                        onClick={() => setPoUndoTarget({
                                          cancellationId: c.id,
                                          batchId: c.batch_id ?? null,
                                          orderId: c.purchase_order_id,
                                          source: "receive",
                                          description: `Volta a ficar por receber: ${formatQty(c.quantity_cancelled)}${uomLabel ? ` ${uomLabel}` : ""} de ${productName}.`,
                                        })}
                                      >
                                        {/* Anulação da PO inteira: a BD só aceita desfazer o lote. */}
                                        {c.batch_id ? "Desfazer (toda a encomenda)" : "Desfazer"}
                                      </Button>
                                      )}
                                    </div>
                                    );
                                  })}
                                  {!fullyReceived && (
                                    <Button
                                      type="button"
                                      variant="link"
                                      size="sm"
                                      className="h-6 px-1 text-xs text-muted-foreground"
                                      disabled={receiving}
                                      onClick={() => openPoLineCancel(item, remaining, uomLabel)}
                                    >
                                      Não vou receber o resto
                                    </Button>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {receivePreviewError && (
                  <p className="text-xs text-destructive" role="alert">{receivePreviewError}</p>
                )}
                {receiveLines.some((item) => getReceiveRemaining(item) > 0) && (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-6 px-1 text-xs text-muted-foreground"
                      disabled={receiving}
                      onClick={openPoOrderCancelFromReceive}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Não vou receber o resto da encomenda
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} disabled={receiving}>
                Cancelar
              </Button>
              <Button onClick={handleReceiveOrder} disabled={receiving || !receiveWarehouseId}>
                {receiving ? "A confirmar..." : "Confirmar receção"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* "Não vou receber o resto" — motivo da anulação (linha ou PO inteira).
          Liga a rpc_cancel_po_line_remainder / rpc_cancel_po_remainder; os
          erros vêm da RPC. Pode abrir por cima do diálogo de receção. */}
      <Dialog
        open={!!poCancelTarget}
        onOpenChange={(o) => {
          if (!o && !poCancelSubmitting) setPoCancelTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {poCancelTarget?.kind === "order" ? "Não vou receber o resto da encomenda" : "Não vou receber o resto"}
            </DialogTitle>
          </DialogHeader>
          {poCancelTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {poCancelTarget.kind === "line"
                  ? `Vais anular ${formatQty(poCancelTarget.quantity)}${poCancelTarget.uomLabel ? ` ${poCancelTarget.uomLabel}` : ""} de ${poCancelTarget.productName}.`
                  : poCancelTarget.lineCount !== null
                    ? `Vais anular o que falta de ${poCancelTarget.lineCount} linha(s) da encomenda ${poCancelTarget.orderNumber}. Se nada tiver sido recebido, a encomenda fica cancelada.`
                    : `Vais anular tudo o que falta receber da encomenda ${poCancelTarget.orderNumber}. Se nada tiver sido recebido, a encomenda fica cancelada.`}
                {poCancelTarget.isClientOrder
                  ? " A encomenda de cliente ligada deixa de esperar por este fornecedor e passa a usar stock disponível ou a ficar em falta."
                  : " Esta quantidade deixa de estar por receber."}
              </p>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <RadioGroup
                  value={poCancelReason}
                  onValueChange={(v) => setPoCancelReason(v as PoCancellationReason)}
                  disabled={poCancelSubmitting}
                >
                  {(Object.keys(PO_CANCELLATION_REASON_LABELS) as PoCancellationReason[]).map((value) => (
                    <div key={value} className="flex items-center gap-2">
                      <RadioGroupItem value={value} id={`po-cancel-reason-${value}`} />
                      <Label htmlFor={`po-cancel-reason-${value}`} className="font-normal">
                        {PO_CANCELLATION_REASON_LABELS[value]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="po-cancel-notes">
                  Nota{poCancelReason === "other" ? " (obrigatória)" : " (opcional)"}
                </Label>
                <Textarea
                  id="po-cancel-notes"
                  rows={3}
                  value={poCancelNotes}
                  onChange={(e) => setPoCancelNotes(e.target.value)}
                  disabled={poCancelSubmitting}
                  aria-required={poCancelReason === "other"}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPoCancelTarget(null)} disabled={poCancelSubmitting}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleConfirmPoCancel()}
                  disabled={poCancelSubmitting || (poCancelReason === "other" && !poCancelNotes.trim())}
                >
                  {poCancelSubmitting ? "A anular..." : "Confirmar anulação"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Desfazer uma anulação (linha) ou o lote da PO inteira. */}
      <AlertDialog
        open={!!poUndoTarget}
        onOpenChange={(o) => {
          if (!o && !poUndoSubmitting) setPoUndoTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer anulação?</AlertDialogTitle>
            <AlertDialogDescription>
              {poUndoTarget?.batchId
                ? "Desfaz a anulação de todas as linhas desta encomenda."
                : poUndoTarget?.description}
              {poUndoTarget?.source === "orderDialog" &&
                " O diálogo da encomenda vai fechar — alterações não gravadas perdem-se."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={poUndoSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={poUndoSubmitting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmPoUndo();
              }}
            >
              {poUndoSubmitting ? "A desfazer..." : "Desfazer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverter receção, por linha — para receções registadas por engano.
          Liga a rpc_revert_purchase_order_receipt; os erros (sem permissão,
          stock já saído, estado inválido) vêm da RPC já em PT. */}
      <Dialog open={revertDialogOpen} onOpenChange={(o) => { if (!reverting) setRevertDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('purchaseOrders.revert.title') || "Reverter receção"}{revertingOrder ? ` — ${revertingOrder.order_number}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('purchaseOrders.revert.warning') || "As linhas escolhidas voltam a \"por receber\" e o stock que entrou é retirado do armazém. Se já saiu stock, a reversão é recusada."}
            </p>

            {revertLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('purchaseOrders.revert.noLines') || "Esta encomenda não tem linhas recebidas para reverter."}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>{t('purchaseOrders.revert.linesLabel') || "Linhas a reverter"}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAllRevertLines} disabled={reverting}>
                    {t('purchaseOrders.revert.selectAll') || "Selecionar tudo"}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{t('purchaseOrders.revert.item') || "Item"}</TableHead>
                      <TableHead className="text-right">{t('purchaseOrders.revert.ordered') || "Encomendada"}</TableHead>
                      <TableHead className="text-right">{t('purchaseOrders.revert.receivedToRevert') || "Recebida (a reverter)"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revertLines.map((item) => {
                      const checked = revertSelectedIds.has(item.id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleRevertLine(item.id, v === true)}
                              disabled={reverting}
                              aria-label={item.products?.name || item.description}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{item.products?.name || item.description}</div>
                            {(item.sku || item.supplier_sku) && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {item.sku}
                                {item.sku && item.supplier_sku ? " · " : ""}
                                {item.supplier_sku ? `Ref.: ${item.supplier_sku}` : ""}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">{item.quantity}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {item.received_quantity || 0}
                            {/* Destino por linha: parte que saiu do stock vs. parte entregue à EC. */}
                            {getUnitsNotInStock(item) > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {formatQty(item.received_to_stock_units)} {stockUnitCode(item)} do stock · {formatQty(getUnitsNotInStock(item))} {stockUnitCode(item)} da EC
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="revert-reason">{t('purchaseOrders.revert.reason') || "Motivo"}</Label>
              <Textarea
                id="revert-reason"
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder={t('purchaseOrders.revert.reasonPlaceholder') || "Ex.: marcada como recebida por engano"}
                disabled={reverting}
                rows={3}
              />
              {revertReason.length > 0 && revertReason.trim().length < 3 && (
                <p className="text-xs text-destructive">
                  {t('purchaseOrders.revert.reasonTooShort') || "O motivo tem de ter pelo menos 3 caracteres."}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRevertDialogOpen(false)} disabled={reverting}>
                {t('purchaseOrders.revert.cancel') || "Cancelar"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevertReceipt}
                disabled={reverting || revertSelectedIds.size === 0 || revertReason.trim().length < 3}
              >
                {reverting
                  ? (t('purchaseOrders.revert.processing') || "A reverter...")
                  : (t('purchaseOrders.revert.confirm') || "Reverter receção")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Passar para stock — o recebido de uma PO de contrato cuja Encomenda
          Cliente ficou inativa. Liga a rpc_po_receipt_release_to_stock, que
          volta a validar tudo (EC ativa, linha de stock, nada pendente). */}
      <Dialog open={releaseDialogOpen} onOpenChange={(o) => { if (!releasing) setReleaseDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Passar para stock{releaseOrder ? ` — ${releaseOrder.order_number}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {releaseOrder?.contractInactiveKnown
                ? `A encomenda cliente ${releaseOrder.contractNumber || "ligada"} está inativa. O que foi recebido para ela nas linhas escolhidas dá entrada no armazém indicado.`
                : "Só é possível se a encomenda cliente estiver inativa. O que foi recebido para ela nas linhas escolhidas dá entrada no armazém indicado."}
            </p>

            <div className="space-y-2">
              <Label>Armazém de destino</Label>
              <Select value={releaseWarehouseId} onValueChange={setReleaseWarehouseId} disabled={releasing}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolhe um armazém" />
                </SelectTrigger>
                <SelectContent>
                  {releaseWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Recebida</TableHead>
                  <TableHead className="text-right">Passa para stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releaseLines.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={releaseSelectedIds.has(item.id)}
                        onCheckedChange={(v) => toggleReleaseLine(item.id, v === true)}
                        disabled={releasing}
                        aria-label={item.products?.name || item.description}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.products?.name || item.description}</div>
                      {item.sku && <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {item.received_quantity || 0}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatQty(getUnitsNotInStock(item))} {stockUnitCode(item)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="space-y-2">
              <Label htmlFor="release-reason">Motivo (opcional)</Label>
              <Textarea
                id="release-reason"
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                placeholder="Ex.: encomenda cliente cancelada"
                disabled={releasing}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReleaseDialogOpen(false)} disabled={releasing}>
                Cancelar
              </Button>
              <Button
                onClick={handleReleaseToStock}
                disabled={releasing || releaseSelectedIds.size === 0 || !releaseWarehouseId}
              >
                {releasing ? "A passar..." : "Passar para stock"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PurchaseOrders;