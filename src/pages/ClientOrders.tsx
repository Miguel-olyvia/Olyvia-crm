import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { EntitySearchInput, type EntitySearchResult } from "@/components/EntitySearchInput";
import { AddItemsDialog } from "@/components/quote/AddItemsDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, FileDown, Info, Loader2, Lock, Pencil, Plus, Printer, Receipt, Search, ShoppingCart, Trash2, Truck, Undo2, X } from "lucide-react";
import {
  FilterPills,
  InventoryPageHeader,
  InventoryStatusBadge,
  RowActions,
  parseClientOrdersParams,
  type ClientOrderStatusFilter,
  type FilterPillOption,
  type InventoryTone,
  type RowActionEntry,
} from "@/components/inventory/ui";
import { ClientOrderDetailSheet, ClientOrderInfoGrid, type ClientOrderInfoItem } from "@/components/client-orders/ClientOrderDetailSheet";
import { ClientOrderDiagnosticSection } from "@/components/client-orders/ClientOrderDiagnosticSection";
import { ClientOrderLineSource } from "@/components/client-orders/ClientOrderLineSource";
import { ClientOrderLineStateBadge, ClientOrderLineStateLegend, clientOrderLineState } from "@/components/client-orders/clientOrderLineState";
import { ClientOrderProductPicker, type ClientOrderCatalogProduct } from "@/components/client-orders/ClientOrderProductPicker";
import { useClientOrderPoStates } from "@/components/client-orders/useClientOrderPoStates";
import { useInventoryToday } from "@/hooks/useInventoryToday";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchAllClientOrderRows,
  fetchClientOrderRowsByIds,
  loadClientOrderReadiness,
  readyContractIds,
  useClientOrderStatusSummary,
  type ClientOrderReadinessMap,
} from "@/components/client-orders/clientOrderList";
import { ClientOrderKpis } from "@/components/client-orders/ClientOrderKpis";
import { ClientOrderProgress, ClientOrderProgressLegend, clientOrderProgressParts } from "@/components/client-orders/ClientOrderProgress";
import { ClientOrderOriginChip, type ClientOrderOriginKind } from "@/components/client-orders/ClientOrderOriginChip";
import { ClientOrderRowActions } from "@/components/client-orders/ClientOrderRowActions";
import { useTranslation } from "@/hooks/useTranslation";
import { generateProformaPdfBlob, downloadBlob } from "@/utils/generateProformaPdfBlob";
import { pdf } from '@react-pdf/renderer';
import { ClientOrderDocumentPDF } from "@/components/ClientOrderDocumentPDF";
import { useProductBaseUomCodes } from "@/hooks/useProductBaseUomCodes";
import { requiresIntegerQty, isValidQtyFor, roundToIntegerQty, integerQtyMessage } from "@/utils/quotes/integerQty";
import { DeliveryAddressForm } from "@/components/clients/DeliveryAddressForm";
import {
  fetchEntityDeliveryAddresses,
  formatDeliveryAddress,
  type AddDeliveryAddressResult,
  type DeliveryAddressInput,
  type EntityDeliveryAddress,
} from "@/lib/addresses/entityDeliveryAddresses";

// Fase 5.0F do plano de inventário: página só-leitura "Encomendas Clientes" —
// 1 linha por Contrato assinado, derivada ao momento da leitura de
// client_contracts + quote_lines + stock_movements + purchase_orders (sem
// tabela nova, sem trigger nova). Consome os 2 RPCs de leitura já aplicados
// em produção (migration 20261115160000_client_order_documents_read_rpcs.sql):
// rpc_list_client_order_documents (listagem) e rpc_get_client_order_document
// (detalhe/PDF). Ambos exigem client_orders.view (permissão própria, para o
// armazém não precisar de ver contratos) — mesma verificação replicada no
// frontend via ProtectedRoute (App.tsx) e no item de menu (menuConfig.ts).
//
// Padrão de paginação: infinite-scroll com .range() e SEM total_count (a RPC
// não devolve contagem total, de propósito — mesmo padrão já usado em
// Stocks.tsx: hasMore inferido de "a página veio cheia?").

const PAGE_SIZE = 30;
// Filtro "Prontas a expedir": teto de leitura da lista (páginas de 100) para
// encontrar as encomendas prontas — pára antes assim que as encontra todas.
const READY_MAX_PAGES = 20;

// IVA por omissão quando o artigo do catálogo não traz taxa definida — mesmo
// valor usado em PurchaseOrders.tsx e no AddItemsDialog.
const DEFAULT_VAT_RATE = 23;

// Criação manual de Encomenda Cliente: linha em edição no diálogo, antes de
// ser convertida no payload da RPC (product_id/service_id + descricao +
// categoria + qt + preco_unit + iva_percent). Estrutura deliberadamente igual
// à de `PurchaseOrderItem` em PurchaseOrders.tsx, para a tabela editável e a
// validação seguirem exatamente o mesmo padrão.
interface ManualClientOrderItem {
  item_type: 'product' | 'service';
  product_id: string | null;
  service_id: string | null;
  description: string;
  categoria: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  // Só em modo edição (rpc_update_manual_client_order): linha já gravada.
  // null/ausente = linha nova.
  quote_line_id?: string | null;
  // Linha trancada (já saiu de stock ou tem pedido a fornecedor): mostrada
  // mas não editável. `locked_payload` guarda os valores EXATOS lidos de
  // quote_lines — o servidor rejeita qualquer diferença, mesmo na descrição.
  locked?: boolean;
  locked_payload?: Record<string, unknown>;
  // Linha existente não trancada: produto/quantidade/embalagem como foram
  // lidos, para saber se o utilizador a alterou (ver handleUpdateOrder).
  original_key?: string;
  // Linha existente: quote_lines.uom_id tal como lido, reenviado sem alteração
  // (este ecrã não escolhe unidade). Linhas novas: null/ausente.
  uom_id?: string | null;
  // Chave React local e estável das linhas novas (nunca vai para a BD; as
  // linhas existentes usam quote_line_id).
  row_key?: string;
}

const newRowKey = (): string => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

// IVA vindo do catálogo: 0% é válido (isento) — só cai no default quando não
// há valor.
const toVatRate = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return DEFAULT_VAT_RATE;
  const n = Number(value);
  return Number.isFinite(n) ? n : DEFAULT_VAT_RATE;
};

// Valor da opção "+ Nova morada…" no Select de moradas de entrega.
const NEW_DELIVERY_ADDRESS_VALUE = "__new_delivery_address__";

const manualItemKey = (item: Pick<ManualClientOrderItem, 'product_id' | 'quantity' | 'uom_id'>) =>
  `${item.product_id ?? ''}|${Number(item.quantity) || 0}|${item.uom_id ?? ''}`;

// Origem de uma Encomenda Cliente (20261204290000).
type ClientOrderOriginType = 'contract' | 'direct_sale' | 'manual';

interface ClientOrderDocumentRow {
  contract_id: string;
  contract_number: string;
  // 20261204290000: número próprio da encomenda (EC-AAAA-NNNN) e origem.
  // Opcionais: fallback para contract_number se vierem null.
  order_number?: string | null;
  origin_type?: ClientOrderOriginType | null;
  origin_number?: string | null;
  client_name: string | null;
  signature_date: string | null;
  total_lines: number;
  lines_from_stock: number;
  lines_awaiting_order: number;
  lines_received: number;
  lines_no_supplier: number;
  // 20261130190000: linhas de serviço (sem stock). Opcional: só se lê no progresso.
  lines_service?: number | null;
  overall_status: string;
  // 20261204400000: morada de entrega gravada na encomenda (pode ser nula).
  delivery_address?: string | null;
}

// 20261130070000: armazém(ns) com stock deste produto, só preenchido nas
// linhas com line_status === 'stock_disponivel_confirmar' (ordenado por
// quantity desc pela RPC). `rpc_get_client_order_document` devolve jsonb, pelo
// que `supabase gen types` gera sempre `Returns: Json` (opaco) — a tipagem
// desta estrutura tem de continuar manual, não é um `as any` temporário.
interface ClientOrderAvailableWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  // 20261204310000: `quantity` = LEAST(stock do armazém, qty_reserved da
  // linha); `physical_quantity` = stock físico do armazém.
  quantity: number;
  physical_quantity?: number | null;
}

// Uma linha é de produto OU de serviço (item_type), nunca das duas. A RPC
// rpc_get_client_order_document já devolve os dois pares de campos desde
// 20261130190000, com o par não aplicável a NULL — daí product_id/product_name
// serem anuláveis. Ler só o par do produto deixava as linhas de serviço sem SKU
// e sem descrição na tabela.
interface ClientOrderDocumentLine {
  quote_line_id: string;
  item_type: 'product' | 'service';
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  service_id: string | null;
  service_name: string | null;
  service_sku: string | null;
  quantity: number;
  // 20261206150000: 'nao_recebido_anulado' = linha concluída sem nada
  // recebido/servido, porque o que faltava foi anulado na PO.
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'stock_disponivel_confirmar' | 'parcial' | 'sem_fornecedor' | 'servico' | 'nao_recebido_anulado';
  stock_movement_id: string | null;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  available_warehouses: ClientOrderAvailableWarehouse[] | null;
  // 20261204290000: saída manual (estornável) que serve a linha — null nas
  // baixas automáticas na assinatura, que não se revertem daqui.
  stock_exit_movement_id?: string | null;
  // Linha já servida/pedida: não pode ser alterada nem removida na edição.
  line_locked?: boolean;
  // 20261204310000: reserva de stock por ordem de assinatura. Unidades base;
  // null em serviços e em encomendas não assinadas. component_index distingue
  // os componentes de um bundle (várias linhas com o mesmo quote_line_id).
  component_index?: number | null;
  qty_needed?: number | null;
  qty_reserved?: number | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
  qty_missing?: number | null;
  // 20261204340000: quantidade já servida por stock (unidades base); null em
  // serviços. Fonte de verdade para "X servido" — não inferir pelos movimentos.
  qty_served?: number | null;
  // 20261206150000: quantidade anulada nas POs ("não vou receber o resto"),
  // em unidades base, e as anulações ativas que a explicam (null sem
  // anulações). Opcionais enquanto a RPC não tiver os campos.
  qty_cancelled?: number | null;
  cancellations?: ClientOrderLineCancellation[] | null;
  // Só em linhas de produto: o produto tem fornecedor preferencial. Distingue,
  // em 'sem_fornecedor', "falta pedir ao fornecedor" (true) de "não há
  // fornecedor preferencial" (false). null/ausente = desconhecido (serviços ou
  // RPC ainda sem o campo).
  has_preferred_supplier?: boolean | null;
  // Categoria principal e subcategoria do produto, só para agrupar as linhas
  // no PDF (não se mostram no ecrã). null em serviços e produtos sem
  // categoria; ausentes enquanto a RPC não tiver os campos.
  category_name?: string | null;
  subcategory_name?: string | null;
}

// 'sem_fornecedor' = quantidade em falta sem pedido ao fornecedor. A causa
// depende de has_preferred_supplier; ver getLineStatusColor/Label.
type MissingSupplierKind = 'toRequest' | 'noPreferred' | 'unknown';
const getMissingSupplierKind = (line: Pick<ClientOrderDocumentLine, 'has_preferred_supplier'>): MissingSupplierKind =>
  line.has_preferred_supplier === true
    ? 'toRequest'
    : line.has_preferred_supplier === false
      ? 'noPreferred'
      : 'unknown';

// Chave única por linha do documento: um bundle devolve várias linhas com o
// mesmo quote_line_id (uma por componente).
const lineKey = (line: Pick<ClientOrderDocumentLine, 'quote_line_id' | 'component_index'>) =>
  `${line.quote_line_id}:${line.component_index ?? 0}`;

// Motivos de "não vou receber o resto" numa PO (purchase_order_item_cancellations.reason).
const PO_CANCELLATION_REASON_LABELS: Record<string, string> = {
  found_stock: 'Encontrei stock / outra solução',
  supplier_unavailable: 'Fornecedor sem produto',
  other: 'Outro',
};

// 20261206150000: anulação ativa numa PO que reduz a necessidade da linha
// (rpc_get_client_order_document → lines[].cancellations). quantity_cancelled
// já vem em unidades base.
interface ClientOrderLineCancellation {
  cancellation_id: string;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  quantity_cancelled: number | null;
  reason: string | null;
  notes: string | null;
  created_at: string | null;
}

// " na PO-1, PO-2 (motivo; motivo)" a partir das anulações da linha; sem
// anulações cai para a PO da linha. Motivo 'other' mostra a nota, se houver.
const getLineCancellationRefs = (
  line: Pick<ClientOrderDocumentLine, 'cancellations' | 'purchase_order_number'>,
): string => {
  const list = Array.isArray(line.cancellations) ? line.cancellations : [];
  const pos = Array.from(new Set(list.map((c) => c?.purchase_order_number).filter((n): n is string => !!n)));
  if (pos.length === 0 && line.purchase_order_number) pos.push(line.purchase_order_number);
  const reasons = Array.from(new Set(list.map((c) => {
    if (!c) return '';
    if (c.reason === 'other') return c.notes?.trim() || PO_CANCELLATION_REASON_LABELS.other;
    return (c.reason && PO_CANCELLATION_REASON_LABELS[c.reason]) || c.reason || '';
  }).filter(Boolean)));
  return `${pos.length > 0 ? ` na ${pos.join(', ')}` : ''}${reasons.length > 0 ? ` (${reasons.join('; ')})` : ''}`;
};

const hasDocumentCancellations = (line: Pick<ClientOrderDocumentLine, 'cancellations'>): boolean =>
  Array.isArray(line.cancellations) && line.cancellations.length > 0;

const asQty = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Arredonda o ruído de vírgula flutuante antes de testes de inteiro/limites.
const roundQty = (value: number): number => Math.round(value * 1e6) / 1e6;

// Linha cuja saída de stock se pode confirmar daqui: stock disponível ou
// parcial com parte reservada. Encomendas antigas/não assinadas não trazem
// qty_reserved (null) — mantém-se o comportamento anterior (quantity).
const isStockExitConfirmable = (line: ClientOrderDocumentLine): boolean => {
  if (!line.product_id) return false;
  if (line.line_status === 'stock_disponivel_confirmar') {
    return line.qty_reserved === null || line.qty_reserved === undefined || asQty(line.qty_reserved) > 0;
  }
  return line.line_status === 'parcial' && asQty(line.qty_reserved) > 0;
};

// Saída manual estornável: tem movimento de saída próprio e a linha está
// servida por stock, ou (20261204340000) 'parcial'/'recebido' com parte já
// servida por stock (qty_served > 0).
const isStockExitRevertible = (line: ClientOrderDocumentLine): boolean => {
  if (!line.stock_exit_movement_id) return false;
  if (line.line_status === 'servido_por_stock') return true;
  return (line.line_status === 'parcial' || line.line_status === 'recebido') && asQty(line.qty_served) > 0;
};

// Quantidade que a linha pode consumir do stock (unidades base).
const confirmableQty = (line: ClientOrderDocumentLine): number =>
  line.qty_reserved === null || line.qty_reserved === undefined
    ? asQty(line.quantity)
    : asQty(line.qty_reserved);

// Resultado de rpc_request_missing_from_supplier (e chave supplier_request de
// rpc_update_manual_client_order).
interface SupplierRequestResult {
  success?: boolean;
  purchase_orders_created?: number;
  items_created?: number;
  skipped_no_supplier?: number;
  skipped_other?: number;
  errors?: number;
}

// Origem de uma encomenda que nasceu de uma venda direta (Fase 5). Ausente
// quando a encomenda veio de uma proposta assinada ou foi criada à mão.
interface DirectSaleOrigin {
  direct_sale_id: string;
  sale_number: string | null;
  proforma_number: string | null;
}

// Eliminação de encomenda (rpc_delete_client_order): só manuais e de venda
// direta. O servidor valida permissão, origem, POs já encomendadas e fatura.
interface DeleteOrderTarget {
  contract_id: string;
  order_number: string;
  origin: 'manual' | 'direct_sale';
  sale_number: string | null;
}

interface DeleteClientOrderResult {
  success?: boolean;
  contract_id?: string;
  order_number?: string | null;
  reversed_movements?: number | null;
  cancelled_pos?: number | null;
  direct_sale_cancelled?: boolean | null;
  message?: string | null;
  error?: string | null;
}

// Diagnóstico da obra (Fase 1): cópia congelada do levantamento de necessidades
// do pedido de proposta, para o armazém saber o que vai ser executado.
//
// Quem escreve o snapshot é o frontend, não a BD: o `QuoteBuilder` chama
// `rpc_snapshot_quote_diagnostic(quote_id, deal_id)` em cada gravação do
// orçamento que tenha `deal_id` (ver `handleSave` em
// `src/components/QuoteBuilder.tsx`). Não existe nenhum trigger de assinatura
// do contrato a preencher `quote_diagnostic_snapshot` — se um orçamento nunca
// for gravado pelo builder, a encomenda fica sem diagnóstico. Tal como
// `available_warehouses`, chega dentro do jsonb de
// `rpc_get_client_order_document` — e como `supabase gen types` gera sempre
// `Returns: Json` (opaco) para essa RPC, a tipagem tem de ser manual aqui e
// validada defensivamente em `normalizeDiagnosticNeeds`. Não é um `as any`
// temporário nem se edita types.ts por causa disto.
//
// Um material é informativo: é o que o diagnóstico previu, não é linha da
// encomenda — não tem preço nem soma ao total.
export interface ClientOrderDiagnosticMaterial {
  descricao: string | null;
  quantity: number;
  unidade: string | null;
  product_id: string | null;
  service_id: string | null;
}

// Um elemento por necessidade da obra. Encomendas de venda direta e encomendas
// manuais nunca têm diagnóstico: a RPC devolve `[]` e não se mostra nada — é o
// comportamento correto, não é erro.
// Exportado (só o tipo) para o PDF em `ClientOrderDocumentPDF.tsx` reutilizar
// esta forma em vez de a duplicar. O import lá é `import type`, logo não há
// dependência circular em runtime.
export interface ClientOrderDiagnosticNeed {
  deal_need_id: string;
  need_title: string | null;
  diag_area_m2: number | null;
  diag_demolir_descricao: string | null;
  diag_demolir_m2: number | null;
  diag_proteger_descricao: string | null;
  diag_intervencao_tipo: string | null;
  diag_intervencao_descricao: string | null;
  materials: ClientOrderDiagnosticMaterial[];
}

interface ClientOrderDocumentDetail {
  contract_id: string;
  contract_number: string;
  client_name: string | null;
  signature_date: string | null;
  total_value: number | null;
  status: string;
  lines: ClientOrderDocumentLine[];
  // Opcional de propósito: a chave só passa a existir depois de a migração da
  // RPC estar aplicada, e `fetchDetail` normaliza sempre para array.
  diagnostic?: ClientOrderDiagnosticNeed[];
  // 20261204290000
  order_number?: string | null;
  origin_type?: ClientOrderOriginType | null;
  origin_number?: string | null;
  delivery_address?: string | null;
  is_editable?: boolean;
  // Edição do cabeçalho das encomendas com documento de origem
  // (rpc_update_client_order_header): opcionais até a RPC nova estar aplicada.
  // entity_id: só se a RPC o vier a devolver — senão lê-se de client_contracts.
  notes?: string | null;
  can_edit_header?: boolean;
  entity_id?: string | null;
  // Morada gravada em bruto (client_contracts.delivery_address), sem o
  // COALESCE com a obra/morada principal de delivery_address. Ausente com a
  // RPC antiga; null = sem morada fixada na encomenda.
  delivery_address_override?: string | null;
  // 20261204310000
  // 20261204340000: missing_lines_count/can_request_missing só contam linhas que
  // o pedido ao fornecedor consegue fazer; missing_units_total = soma dessas
  // faltas (unidades base).
  missing_lines_count?: number | null;
  can_request_missing?: boolean;
  missing_units_total?: number | null;
}

// --- Normalização defensiva do bloco `diagnostic` -------------------------
// O jsonb da RPC não é validado pelo TypeScript: qualquer campo pode vir em
// falta, a null, ou (no caso dos numéricos do Postgres) como string. Estas
// funções garantem que o diálogo só lê a forma que declarámos acima.
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asOptionalText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const asOptionalNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDiagnosticMaterials = (raw: unknown): ClientOrderDiagnosticMaterial[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainRecord).map((material) => ({
    descricao: asOptionalText(material.descricao),
    quantity: asOptionalNumber(material.quantity) ?? 0,
    unidade: asOptionalText(material.unidade),
    product_id: asOptionalText(material.product_id),
    service_id: asOptionalText(material.service_id),
  }));
};

const normalizeDiagnosticNeeds = (raw: unknown): ClientOrderDiagnosticNeed[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainRecord).map((need, index) => ({
    deal_need_id: asOptionalText(need.deal_need_id) ?? `diag-${index}`,
    need_title: asOptionalText(need.need_title),
    diag_area_m2: asOptionalNumber(need.diag_area_m2),
    diag_demolir_descricao: asOptionalText(need.diag_demolir_descricao),
    diag_demolir_m2: asOptionalNumber(need.diag_demolir_m2),
    diag_proteger_descricao: asOptionalText(need.diag_proteger_descricao),
    diag_intervencao_tipo: asOptionalText(need.diag_intervencao_tipo),
    diag_intervencao_descricao: asOptionalText(need.diag_intervencao_descricao),
    materials: normalizeDiagnosticMaterials(need.materials),
  }));
};

// Quantidades/áreas do diagnóstico: separador decimal PT e sem casas a mais.
const formatDiagnosticNumber = (value: number): string =>
  new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(value);

// Morada de entrega: Select com as moradas de entrega do cliente, "+ Nova
// morada…" (DeliveryAddressForm) e a Textarea com o texto que é gravado.
// Partilhado pelo diálogo da encomenda manual e pelo de edição do cabeçalho;
// o estado vive na página (ver loadDeliveryOptions e handlers associados).
interface DeliveryAddressPickerProps {
  entityId: string | null;
  options: EntityDeliveryAddress[];
  optionsLoading: boolean;
  choice: string;
  onChoiceChange: (value: string) => void;
  showNewForm: boolean;
  onShowNewFormChange: (show: boolean) => void;
  onAdded: (result: AddDeliveryAddressResult, input: DeliveryAddressInput) => void | Promise<void>;
  value: string;
  onValueChange: (value: string) => void;
  textareaId: string;
  newFormIdPrefix: string;
  label: string;
  disabled: boolean;
  // Acrescentar morada de entrega ao cliente a partir da encomenda
  // (client_orders.edit). Sem ela só se escolhe uma existente ou se escreve.
  canAddNew: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const DeliveryAddressPicker = ({
  entityId, options, optionsLoading, choice, onChoiceChange, showNewForm, onShowNewFormChange,
  onAdded, value, onValueChange, textareaId, newFormIdPrefix, label, disabled, canAddNew, t,
}: DeliveryAddressPickerProps) => (
  <div className="space-y-2">
    <Label htmlFor={textareaId}>{label}</Label>
    {entityId && options.length > 0 && (
      <Select value={choice} onValueChange={onChoiceChange} disabled={disabled}>
        <SelectTrigger aria-label={t('clientOrders.create.deliveryAddressChoose')}>
          <SelectValue placeholder={t('clientOrders.create.deliveryAddressChoose')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.entity_address_id} value={option.entity_address_id}>
              {formatDeliveryAddress(option) || option.formatted || '—'}
            </SelectItem>
          ))}
          {canAddNew && (
            <SelectItem value={NEW_DELIVERY_ADDRESS_VALUE}>{t('clientOrders.create.deliveryAddressNew')}</SelectItem>
          )}
        </SelectContent>
      </Select>
    )}
    {canAddNew && entityId && !optionsLoading && options.length === 0 && !showNewForm && (
      <div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto min-h-6 px-0"
          onClick={() => onShowNewFormChange(true)}
          disabled={disabled}
        >
          {t('clientOrders.create.deliveryAddressAddNew')}
        </Button>
      </div>
    )}
    {canAddNew && entityId && showNewForm && (
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-sm font-medium">{t('deliveryAddresses.newTitle')}</p>
        <DeliveryAddressForm
          entityId={entityId}
          idPrefix={newFormIdPrefix}
          disabled={disabled}
          onAdded={onAdded}
          onCancel={() => onShowNewFormChange(false)}
        />
      </div>
    )}
    <Textarea
      id={textareaId}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={t('clientOrders.create.deliveryAddressPlaceholder')}
      rows={2}
      disabled={disabled}
    />
  </div>
);

const ClientOrders = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfirmStockExit = hasPermission('inventory.edit') && hasPermission('client_orders.confirm_stock_exit');
  // Editar encomendas de cliente: linhas das manuais
  // (rpc_update_manual_client_order), morada de entrega e notas
  // (rpc_update_client_order_header) e acrescentar morada de entrega ao
  // cliente a partir da encomenda. Permissão própria, já não depende de
  // client_contracts.edit. Criar encomenda manual é client_orders.create
  // (PermissionGate do botão "Nova encomenda").
  const canEditOrder = hasPermission('client_orders.edit');
  const canCreateOrder = hasPermission('client_orders.create');
  // Pedir em falta ao fornecedor (rpc_request_missing_from_supplier exige
  // purchase_orders.create + client_orders.view).
  const canRequestMissing = hasPermission('purchase_orders.create') && hasPermission('client_orders.view');
  // Eliminar encomenda (rpc_delete_client_order exige client_orders.delete).
  const canDeleteOrder = hasPermission('client_orders.delete');

  // As chaves da secção "Diagnóstico da obra" ainda não existem em
  // src/translations/index.ts (ficheiro fora do âmbito desta alteração).
  // `t()` devolve a própria chave quando não a encontra, pelo que `tf` mostra
  // o texto PT de reserva entretanto — e passa a usar a tradução sozinho assim
  // que as chaves forem acrescentadas, sem mexer neste ficheiro outra vez.
  const tf = useCallback((key: string, fallback: string): string => {
    const value = t(key);
    return value === key ? fallback : value;
  }, [t]);

  const [orders, setOrders] = useState<ClientOrderDocumentRow[]>([]);
  // Origem "Venda Direta", indexada por contract_id. Vem de uma query própria a
  // direct_sales em vez de das RPCs de encomendas: evita um CREATE OR REPLACE
  // sobre duas funções de ~240 linhas só para acrescentar três campos, e faz
  // com que a RLS de direct_sales.view decida quem vê a origem — quem não pode
  // ver vendas directas não passa a vê-las através desta página.
  const [salesByContract, setSalesByContract] = useState<Record<string, DirectSaleOrigin>>({});
  const [proformaDownloadingId, setProformaDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  // Estado e "prontas a expedir" vêm do URL (?status=&ready=1, contrato de
  // inventoryLinks.ts); o URL é a fonte e o estado segue-o (ver efeito abaixo).
  const [statusFilter, setStatusFilter] = useState<string>(() => parseClientOrdersParams(searchParams).status);
  const urlParams = parseClientOrdersParams(searchParams);
  const urlStatus = urlParams.status;
  const urlReady = urlParams.ready;
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ClientOrderDocumentDetail | null>(null);
  // "Não vou receber o resto" nas POs ligadas (purchase_order_item_cancellations,
  // só leitura): anulações ativas por linha da EC (lineKey). Best-effort.
  const [poCancellationsByLine, setPoCancellationsByLine] = useState<{
    contractId: string;
    byLine: Record<string, Array<{ id: string; units: number; poNumber: string; reason: string; notes: string | null }>>;
  } | null>(null);
  const [pdfGeneratingId, setPdfGeneratingId] = useState<string | null>(null);

  // Criação manual (rpc_create_manual_client_order). Até aqui a página era
  // só-leitura: as encomendas nasciam sempre de um Contrato assinado. A criação
  // manual reaproveita esse mesmo caminho — a RPC cria um orçamento sintético
  // (quotes.is_internal = true + quote_lines) e o client_contracts já assinado
  // ligado a ele, pelo que toda a automação existente (dedução de stock,
  // encomendas a fornecedor, PDF, listagem) continua a funcionar sem alterações.
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createClient, setCreateClient] = useState<EntitySearchResult | null>(null);
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createNotes, setCreateNotes] = useState("");
  const [createDeliveryAddress, setCreateDeliveryAddress] = useState("");
  const deliveryAddressRequestRef = useRef<string | null>(null);
  // Moradas de entrega do cliente (rpc_list_entity_delivery_addresses) para o
  // Select acima da Textarea. deliveryEntityId = cliente escolhido na criação,
  // ou o entity_id do contrato na edição. deliveryChoice = entity_address_id
  // escolhido ("" = placeholder). A Textarea continua a ser o que se grava.
  const [deliveryEntityId, setDeliveryEntityId] = useState<string | null>(null);
  const [deliveryOptions, setDeliveryOptions] = useState<EntityDeliveryAddress[]>([]);
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [deliveryChoice, setDeliveryChoice] = useState("");
  const [showNewDeliveryForm, setShowNewDeliveryForm] = useState(false);
  const [createItems,setCreateItems] = useState<ManualClientOrderItem[]>([]);
  // Unidade de stock dos produtos das linhas — quantidade inteira em unidades contáveis.
  const productUom = useProductBaseUomCodes(createItems.map((item) => item.product_id));
  const [showItemsDialog, setShowItemsDialog] = useState(false);

  // Checklist de saída de stock (linhas stock_disponivel_confirmar e
  // 'parcial' com reserva):
  // - checklistActiveLineIds: linhas onde o checkbox foi marcado E há mais de
  //   1 armazém disponível, pelo que o Select + botão "Confirmar" ficam
  //   visíveis à espera de escolha.
  // - selectedWarehouseByLine: armazém escolhido no Select acima, por
  //   lineKey (quote_line_id + component_index).
  // - confirmingLineId: linha atualmente a chamar
  //   rpc_confirm_client_order_stock_exit (mostra spinner em vez do checkbox).
  const [checklistActiveLineIds, setChecklistActiveLineIds] = useState<Set<string>>(new Set());
  const [selectedWarehouseByLine, setSelectedWarehouseByLine] = useState<Record<string, string>>({});
  const [confirmingLineId, setConfirmingLineId] = useState<string | null>(null);

  // "Confirmar saída de todas": armazém escolhido quando as linhas pendentes
  // têm mais de um armazém possível, e flag de processamento em lote.
  const [confirmAllWarehouseId, setConfirmAllWarehouseId] = useState<string>("");
  const [confirmingAll, setConfirmingAll] = useState(false);

  // Estorno de saída manual (rpc_revert_client_order_stock_exit).
  const [revertTarget, setRevertTarget] = useState<ClientOrderDocumentLine | null>(null);
  const [reverting, setReverting] = useState(false);

  // Pedido ao fornecedor do que falta (rpc_request_missing_from_supplier).
  const [requestingMissing, setRequestingMissing] = useState(false);
  // Confirmação antes do pedido: o material pode já ter chegado por outra via.
  const [requestMissingConfirmOpen, setRequestMissingConfirmOpen] = useState(false);

  // Eliminar encomenda (manual ou de venda direta) com motivo obrigatório.
  const [deleteTarget, setDeleteTarget] = useState<DeleteOrderTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Edição de encomenda manual: reutiliza o diálogo de criação. Com
  // editingContractId preenchido o diálogo grava via
  // rpc_update_manual_client_order; cliente e data ficam só de leitura.
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<string | null>(null);
  const [editingClientName, setEditingClientName] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Edição do cabeçalho de encomendas com documento de origem (contrato real
  // ou venda direta): só morada de entrega e notas, via
  // rpc_update_client_order_header. Partilha com o diálogo manual o estado do
  // Select de moradas (deliveryEntityId/deliveryOptions/deliveryChoice…) — os
  // dois diálogos nunca estão abertos ao mesmo tempo.
  const [headerEditOpen, setHeaderEditOpen] = useState(false);
  const [headerEditSaving, setHeaderEditSaving] = useState(false);
  const [headerDeliveryAddress, setHeaderDeliveryAddress] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");
  // Texto mostrado na Textarea ao abrir (morada calculada). Se não mudar, não
  // se grava a calculada — envia-se o override em bruto.
  const [headerInitialAddress, setHeaderInitialAddress] = useState("");
  // "+ Nova morada…" no diálogo manual: quem edita precisa de
  // client_orders.edit; ao criar basta client_orders.create.
  const canAddDeliveryInManualDialog = canEditOrder || (!editingContractId && canCreateOrder);

  // Filtros num ref (não recria loadOrders a cada keystroke) — mesmo truque
  // já usado em Stocks.tsx para manter a identidade do IntersectionObserver
  // estável.
  const filtersRef = useRef({
    activeCompanyId: activeCompany?.id,
    debouncedSearchTerm,
    statusFilter,
    dateFrom,
    dateTo,
    ready: urlReady,
  });
  useEffect(() => {
    filtersRef.current = { activeCompanyId: activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo, ready: urlReady };
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo, urlReady]);

  // Prontidão por encomenda (rpc_client_order_list_readiness, org ativa):
  // barra de progresso em unidades, "N pronta(s) a sair" e o filtro
  // "Prontas a expedir". Lida no máximo uma vez por carregamento da lista
  // (cache de 1 min entre pesquisas; forçada quando a lista recarrega com os
  // mesmos filtros — i.e. depois de uma ação). null = indisponível.
  const queryClient = useQueryClient();
  const [readiness, setReadiness] = useState<ClientOrderReadinessMap | null>(null);
  // Filtro "Prontas a expedir" truncado pelo teto de leitura.
  const [readyTruncated, setReadyTruncated] = useState(false);
  // Muda quando a lista recarrega com os mesmos filtros (depois de uma ação):
  // as contagens das pílulas voltam a ser lidas.
  const [listDataVersion, setListDataVersion] = useState(0);
  const lastResetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  /**
   * Descarrega a proforma da venda direta que originou esta encomenda.
   * Reutiliza o gerador do módulo de Vendas Diretas em modo CRM (sem
   * prefetch): é ele que lê as linhas, o emitente e o cliente, e é o mesmo
   * que produz o PDF do portal — os dois documentos não podem divergir.
   */
  const handleDownloadProforma = async (contractId: string) => {
    const origin = salesByContract[contractId];
    if (!origin || proformaDownloadingId) return;
    setProformaDownloadingId(contractId);
    try {
      const { blob, fileName } = await generateProformaPdfBlob(origin.direct_sale_id);
      downloadBlob(blob, fileName);
    } catch (error: any) {
      toast({
        title: t('clientOrders.toast.proformaError'),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setProformaDownloadingId(null);
    }
  };

  const loadOrigins = useCallback(async (contractIds: string[], reset: boolean) => {
    if (reset) setSalesByContract({});
    if (contractIds.length === 0) return;
    try {
      const { data, error } = await (supabase as any)
        .from("direct_sales")
        .select("id, sale_number, proforma_number, client_contract_id")
        .in("client_contract_id", contractIds)
        .is("deleted_at", null);
      if (error) throw error;
      const found = (data as Array<{ id: string; sale_number: string | null; proforma_number: string | null; client_contract_id: string }> | null) || [];
      if (found.length === 0) return;
      setSalesByContract((prev) => {
        const next = reset ? {} : { ...prev };
        for (const s of found) {
          next[s.client_contract_id] = {
            direct_sale_id: s.id,
            sale_number: s.sale_number,
            proforma_number: s.proforma_number,
          };
        }
        return next;
      });
    } catch {
      // Silencioso por desenho — ver a chamada em loadOrders.
    }
  }, []);

  const loadOrders = useCallback(async (pageNum: number, reset: boolean) => {
    const filters = filtersRef.current;
    if (!filters.activeCompanyId) return;

    if (reset) {
      setLoading(true);
      setOrders([]);
    } else {
      setLoadingMore(true);
    }

    try {
      // Mesmos filtros do carregamento anterior = recarga depois de uma ação.
      let refresh = false;
      if (reset) {
        const resetKey = JSON.stringify([
          filters.activeCompanyId, filters.debouncedSearchTerm, filters.statusFilter,
          filters.dateFrom, filters.dateTo, filters.ready,
        ]);
        refresh = resetKey === lastResetKeyRef.current;
        // Outra organização: não mostrar a prontidão da anterior enquanto carrega.
        if (lastResetKeyRef.current && JSON.parse(lastResetKeyRef.current)[0] !== filters.activeCompanyId) {
          setReadiness(null);
        }
        lastResetKeyRef.current = resetKey;
        if (refresh) setListDataVersion((v) => v + 1);
      }

      // Prontidão: uma chamada (ou cache) por carregamento da lista.
      let readinessMap: ClientOrderReadinessMap | null = null;
      if (reset) {
        try {
          readinessMap = await loadClientOrderReadiness(queryClient, filters.activeCompanyId, refresh);
        } catch (readinessError) {
          // Sem o filtro "Prontas" não há o que mostrar: falha a lista. Fora
          // dele, a lista mostra-se na mesma, com o progresso por linha.
          if (filters.ready) throw readinessError;
        }
        if (filtersRef.current !== filters) return; // filtros mudaram entretanto
        setReadiness(readinessMap);
      }

      if (filters.ready) {
        // "Prontas a expedir": a RPC da lista não filtra por ids — lê-se pela
        // ordem da lista até ter todas as prontas (ou ao teto), com os mesmos
        // filtros. Tudo de uma vez: sem paginação a seguir.
        if (!reset) return;
        const { rows: readyRows, truncated } = await fetchClientOrderRowsByIds(
          filters.activeCompanyId,
          {
            search: filters.debouncedSearchTerm,
            status: filters.statusFilter,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          },
          readyContractIds(readinessMap),
          READY_MAX_PAGES,
        );
        if (filtersRef.current !== filters) return;
        const rows = readyRows as unknown as ClientOrderDocumentRow[];
        setOrders(rows);
        setReadyTruncated(truncated);
        void loadOrigins(rows.map((o) => o.contract_id), true);
        setHasMore(false);
        setPage(0);
        return;
      }
      if (reset) setReadyTruncated(false);

      const from = pageNum * PAGE_SIZE;
      const { data, error } = await supabase.rpc('rpc_list_client_order_documents', {
        p_organization_id: filters.activeCompanyId,
        p_search: filters.debouncedSearchTerm || null,
        p_status_filter: filters.statusFilter === 'all' ? null : filters.statusFilter,
        p_limit: PAGE_SIZE,
        p_offset: from,
        p_date_from: filters.dateFrom || null,
        p_date_to: filters.dateTo || null,
      } as any);

      if (error) throw error;
      const newRows = (data as unknown as ClientOrderDocumentRow[] | null) || [];

      if (reset) {
        setOrders(newRows);
      } else {
        setOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.contract_id));
          return [...prev, ...newRows.filter((o) => !existingIds.has(o.contract_id))];
        });
      }

      // Origem, só para os contratos desta página. Falha em silêncio de
      // propósito: sem permissão direct_sales.view a RLS devolve vazio, e a
      // encomenda continua a mostrar-se — apenas sem o distintivo. Nunca pode
      // impedir a listagem de carregar.
      void loadOrigins(newRows.map((o) => o.contract_id), reset);
      // Sem total_count na RPC — hasMore inferido do tamanho da página devolvida.
      setHasMore(newRows.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.loadError'), description: error.message, variant: "destructive" });
    } finally {
      // Um carregamento ultrapassado (filtros mudaram) não apaga o "a carregar"
      // do que o substituiu.
      if (filtersRef.current === filters) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [t, toast, loadOrigins, queryClient]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    loadOrders(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo, urlReady]);

  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadOrders(page + 1, false);
        }
      },
      { threshold: 0.1 }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    observerRef.current = observer;
    return () => observerRef.current?.disconnect();
  }, [loading, hasMore, loadingMore, page, loadOrders]);

  const fetchDetail = async (contractId: string): Promise<ClientOrderDocumentDetail> => {
    const { data, error } = await supabase.rpc('rpc_get_client_order_document', {
      p_contract_id: contractId,
    });
    if (error) throw error;
    const doc = data as unknown as ClientOrderDocumentDetail;
    // Fluxo inalterado: só se acrescenta o bloco `diagnostic` já normalizado,
    // para o diálogo ler sempre um array (a chave não existe nas encomendas
    // sem diagnóstico, nem enquanto a migração da RPC não estiver aplicada).
    // O cast local é mínimo — types.ts não conhece o campo e não é editado.
    if (!doc || typeof doc !== 'object') return doc;
    return {
      ...doc,
      diagnostic: normalizeDiagnosticNeeds((doc as { diagnostic?: unknown }).diagnostic),
    };
  };

  const openDetail = async (contractId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    setConfirmAllWarehouseId("");
    try {
      const doc = await fetchDetail(contractId);
      setDetailData(doc);
      // O deep-link ?open=<contract_id> pode abrir uma encomenda que não está
      // na página carregada, e nesse caso a origem ainda não foi buscada.
      if (!salesByContract[contractId]) void loadOrigins([contractId], false);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.detailError'), description: error.message, variant: "destructive" });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Anulações ativas ("não vou receber o resto") das linhas de PO ligadas a
  // esta EC — PO com source_type='contract' e source_id = contrato; a linha
  // da PO liga à linha da EC por quote_line_id + component_index. Recarrega
  // sempre que o documento é relido. Tabela fora dos tipos gerados: cast local.
  const detailContractId = detailData?.contract_id ?? null;
  useEffect(() => {
    if (!detailContractId) return;
    const contractId = detailContractId;
    let stale = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('purchase_order_item_cancellations')
        // !inner nas duas: anulações sem linha (purchase_order_item_id null,
        // linha recriada na edição) e de POs apagadas ficam de fora.
        .select('id, quantity_cancelled, reason, notes, purchase_order_items!inner(quote_line_id, component_index, units_per_uom), purchase_orders!inner(order_number, source_type, source_id, deleted_at)')
        .is('undone_at', null)
        .eq('purchase_orders.source_type', 'contract')
        .eq('purchase_orders.source_id', contractId)
        .is('purchase_orders.deleted_at', null);
      if (stale) return;
      if (error) {
        console.warn('[ClientOrders] não foi possível carregar as anulações das encomendas a fornecedor', error);
        return;
      }
      const byLine: Record<string, Array<{ id: string; units: number; poNumber: string; reason: string; notes: string | null }>> = {};
      ((data || []) as Array<{
        id: string;
        quantity_cancelled: number;
        reason: string;
        notes: string | null;
        purchase_order_items: { quote_line_id: string | null; component_index: number | null; units_per_uom: number | null } | null;
        purchase_orders: { order_number: string | null } | null;
      }>).forEach((row) => {
        const poItem = row.purchase_order_items;
        if (!poItem?.quote_line_id) return;
        const key = lineKey({ quote_line_id: poItem.quote_line_id, component_index: poItem.component_index });
        // Quantidade da PO na unidade da linha; na EC mostra-se em unidades de stock.
        const units = asQty(row.quantity_cancelled) * (Number(poItem.units_per_uom) > 0 ? Number(poItem.units_per_uom) : 1);
        (byLine[key] ||= []).push({
          id: row.id,
          units,
          poNumber: row.purchase_orders?.order_number || '',
          reason: row.reason,
          notes: row.notes,
        });
      });
      setPoCancellationsByLine({ contractId, byLine });
    })().catch((e) => console.warn('[ClientOrders] anulações das encomendas a fornecedor', e));
    return () => { stale = true; };
  }, [detailContractId, detailData]);

  // Fase 5.0F: link inverso a partir de PurchaseOrders.tsx
  // (?open=<contract_id>) — mesmo padrão já usado no sentido oposto
  // (Encomendas Clientes → PurchaseOrders). Abre o detalhe uma única vez e
  // limpa o parâmetro, para não reabrir ao navegar/recarregar.
  useEffect(() => {
    const contractId = searchParams.get("open");
    if (contractId) {
      openDetail(contractId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("open");
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleGeneratePdf = async (contractId: string, contractNumber: string) => {
    setPdfGeneratingId(contractId);
    try {
      const doc = (detailData && detailData.contract_id === contractId)
        ? detailData
        : await fetchDetail(contractId);

      // Info da empresa para o cabeçalho/rodapé do PDF — mesmo padrão (e
      // mesmas colunas) que PurchaseOrders.tsx já usa em handleGeneratePDF.
      let company: { name?: string; logo_url?: string | null } = {};
      if (activeCompany?.id) {
        const { data: orgData } = await supabase
          .from('anew_organizations')
          .select('name, logo_url')
          .eq('id', activeCompany.id)
          .single();

        let logoBase64: string | null = null;
        if (orgData?.logo_url) {
          try {
            const response = await fetch(orgData.logo_url);
            const blob = await response.blob();
            logoBase64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error('Error converting logo to base64:', e);
          }
        }
        company = { name: orgData?.name, logo_url: logoBase64 || orgData?.logo_url };
      }

      // A origem pode não estar em cache quando o PDF é pedido a partir de uma
      // linha ainda não aberta em detalhe; sem ela o PDF sai apenas sem a
      // menção à venda direta, nunca em erro.
      const origin = salesByContract[contractId];
      const blob = await pdf(
        <ClientOrderDocumentPDF
          document={{
            ...doc,
            direct_sale_number: origin?.sale_number ?? null,
            proforma_number: origin?.proforma_number ?? null,
          }}
          company={company}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `EncomendaCliente_${doc.order_number || contractNumber || contractId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: t('clientOrders.toast.pdfSuccess') });
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.pdfError'), description: error.message, variant: "destructive" });
    } finally {
      setPdfGeneratingId(null);
    }
  };

  // Saída por produto (20261204310000): a RPC é por contrato+produto, recusa
  // uma segunda saída do mesmo produto e aceita no máximo a soma de
  // qty_reserved das linhas desse produto. Por isso a quantidade enviada é
  // essa soma (não line.quantity). Capacidade de cada armazém = stock físico
  // (physical_quantity); sem esse campo, o maior `quantity` das linhas (que já
  // vem limitado à reserva DESSA linha).
  // 20261204340000: a RPC de saída recusa um armazém sem stock suficiente, por
  // isso `warehouses` só traz os armazéns cuja capacidade ≥ quantity (é o que se
  // mostra e permite); sem nenhum, a confirmação da linha fica desativada.
  // `quantity` de cada armazém devolvido = essa capacidade (stock a mostrar).
  const getProductExitGroup = (productId: string, docLines: ClientOrderDocumentLine[]) => {
    const groupLines = docLines.filter((l) => l.product_id === productId && isStockExitConfirmable(l));
    const quantity = roundQty(groupLines.reduce((sum, l) => sum + confirmableQty(l), 0));
    const byId = new Map<string, ClientOrderAvailableWarehouse>();
    groupLines.forEach((l) => (l.available_warehouses || []).forEach((wh) => {
      const physical = wh.physical_quantity === null || wh.physical_quantity === undefined
        ? null
        : asQty(wh.physical_quantity);
      const prev = byId.get(wh.warehouse_id);
      const capacity = physical === null
        ? Math.max(asQty(wh.quantity), prev ? asQty(prev.quantity) : 0)
        : physical;
      byId.set(wh.warehouse_id, { ...wh, quantity: roundQty(capacity) });
    }));
    const warehouses = Array.from(byId.values())
      .filter((wh) => quantity > 0 && asQty(wh.quantity) >= quantity)
      .sort((a, b) => asQty(b.quantity) - asQty(a.quantity));
    return { product_id: productId, quantity, warehouses, lineKeys: groupLines.map(lineKey) };
  };

  // Checklist de saída de stock (fase pós-20261130070000).
  const handleConfirmStockExit = async (line: ClientOrderDocumentLine, warehouseId: string) => {
    if (!detailData || !line.product_id) return;
    const group = getProductExitGroup(line.product_id, detailData.lines);
    const key = lineKey(line);
    // p_quantity é integer na RPC — a reserva em unidades base pode não ser.
    if (!(group.quantity > 0) || !Number.isInteger(group.quantity)) {
      toast({
        title: t('clientOrders.toast.stockExitError'),
        description: t('clientOrders.toast.confirmAllSkippedNonInteger', { count: 1 }),
        variant: "destructive",
      });
      return;
    }
    setConfirmingLineId(key);
    try {
      const { error } = await supabase.rpc('rpc_confirm_client_order_stock_exit', {
        p_contract_id: detailData.contract_id,
        p_product_id: line.product_id,
        p_quantity: group.quantity,
        p_warehouse_id: warehouseId,
      });
      if (error) throw error;

      toast({ title: t('clientOrders.dialog.stockExitSuccess') });
      setChecklistActiveLineIds((prev) => {
        const next = new Set(prev);
        group.lineKeys.forEach((k) => next.delete(k));
        return next;
      });
      setSelectedWarehouseByLine((prev) => {
        const next = { ...prev };
        group.lineKeys.forEach((k) => { delete next[k]; });
        return next;
      });

      // Padrão já usado no resto da página (openDetail): re-buscar o
      // documento inteiro é a forma mais simples e segura de refletir o novo
      // line_status, em vez de tentar recalcular a cascata no frontend.
      const refreshed = await fetchDetail(detailData.contract_id);
      setDetailData(refreshed);
      loadOrders(0, true);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.stockExitError'), description: error.message, variant: "destructive" });
    } finally {
      setConfirmingLineId(null);
    }
  };

  const handleChecklistCheckboxChange = (line: ClientOrderDocumentLine, checked: boolean) => {
    const key = lineKey(line);
    const warehouses = line.product_id && detailData
      ? getProductExitGroup(line.product_id, detailData.lines).warehouses
      : [];

    if (!checked) {
      setChecklistActiveLineIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setSelectedWarehouseByLine((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    if (warehouses.length === 1) {
      handleConfirmStockExit(line, warehouses[0].warehouse_id);
      return;
    }

    if (warehouses.length > 1) {
      setChecklistActiveLineIds((prev) => new Set(prev).add(key));
    }
  };

  // ── Confirmar saída de todas ─────────────────────────────────────────────
  // Linhas pendentes de confirmação agrupadas por produto (a RPC é por
  // contrato+produto e recusa uma segunda saída do mesmo produto, por isso
  // várias linhas do mesmo produto vão numa só saída com a quantidade somada
  // em unidades de stock). `pending` e o contador do botão/toast contam
  // PRODUTOS, não linhas. Se cada produto tem um único armazém, usa-se esse sem
  // perguntar; caso contrário o utilizador escolhe um armazém e aplica-se aos
  // produtos onde esse armazém cobre a quantidade somada — os restantes ficam
  // pendentes.
  // 20261204310000: entram também as linhas 'parcial' com parte reservada, e
  // a quantidade de cada produto é a soma de qty_reserved (getProductExitGroup).
  const getConfirmAllInfo = () => {
    const docLines = detailData?.lines || [];
    const productIds = Array.from(new Set(
      docLines.filter(isStockExitConfirmable).map((l) => l.product_id as string),
    ));
    // Só entram produtos com pelo menos um armazém que cubra a quantidade
    // (getProductExitGroup já filtra); os restantes ficam pendentes e contam em
    // `uncovered` — mesma regra da confirmação por linha.
    const groups = productIds
      .map((pid) => getProductExitGroup(pid, docLines))
      .filter((g) => g.quantity > 0);
    const pending = groups.filter((g) => g.warehouses.length > 0);
    const uncovered = groups.length - pending.length;
    const byId = new Map<string, string>();
    pending.forEach((p) => p.warehouses.forEach((wh) => {
      if (!byId.has(wh.warehouse_id)) byId.set(wh.warehouse_id, wh.warehouse_name);
    }));
    const warehouses = Array.from(byId, ([warehouse_id, warehouse_name]) => ({ warehouse_id, warehouse_name }));
    const singleEach = pending.every((p) => p.warehouses.length === 1);
    return { pending, warehouses, singleEach, uncovered };
  };

  const handleConfirmAllStockExits = async () => {
    if (!detailData || confirmingAll) return;
    const contractId = detailData.contract_id;
    const { pending, singleEach, uncovered } = getConfirmAllInfo();
    if (pending.length === 0) return;
    if (!singleEach && !confirmAllWarehouseId) return;

    let ok = 0;
    let failed = 0;
    let skippedNonInteger = 0;
    let leftPending = uncovered;
    let firstError: string | null = null;

    setConfirmingAll(true);
    try {
      // Sequencial de propósito: cada saída mexe no saldo do mesmo armazém e
      // a RPC valida o stock disponível no momento.
      for (const group of pending) {
        // p_quantity é integer na RPC — uma quantidade decimal em unidades de
        // stock não pode ser confirmada daqui.
        if (!Number.isInteger(group.quantity)) {
          skippedNonInteger++;
          continue;
        }
        // O armazém tem de cobrir a quantidade somada do produto; se não
        // cobrir, o produto fica pendente (não conta como falha).
        const targetId = singleEach ? group.warehouses[0]?.warehouse_id : confirmAllWarehouseId;
        const wh = group.warehouses.find((w) => w.warehouse_id === targetId);
        if (!wh || !(Number(wh.quantity) >= group.quantity)) {
          leftPending++;
          continue;
        }
        const { error } = await supabase.rpc('rpc_confirm_client_order_stock_exit', {
          p_contract_id: contractId,
          p_product_id: group.product_id,
          p_quantity: group.quantity,
          p_warehouse_id: wh.warehouse_id,
        });
        if (error) {
          failed++;
          if (!firstError) firstError = error.message;
        } else {
          ok++;
        }
      }

      setChecklistActiveLineIds(new Set());
      setSelectedWarehouseByLine({});
      setConfirmAllWarehouseId("");

      try {
        const refreshed = await fetchDetail(contractId);
        setDetailData(refreshed);
      } catch (error: any) {
        toast({ title: t('clientOrders.toast.detailError'), description: error?.message, variant: "destructive" });
      }

      const details: string[] = [];
      if (firstError) details.push(firstError);
      if (skippedNonInteger > 0) details.push(t('clientOrders.toast.confirmAllSkippedNonInteger', { count: skippedNonInteger }));
      if (leftPending > 0) details.push(t('clientOrders.toast.confirmAllLeftPending', { count: leftPending }));
      toast({
        title: t('clientOrders.toast.confirmAllResult', { ok, failed }),
        description: details.length > 0 ? details.join(' · ') : undefined,
        variant: failed > 0 && ok === 0 ? "destructive" : undefined,
      });
    } finally {
      setConfirmingAll(false);
    }
  };

  // ── Reverter saída manual ────────────────────────────────────────────────
  // Estorna o movimento de saída (o servidor cria o movimento inverso e repõe
  // o stock). Só existe para saídas manuais — as baixas automáticas na
  // assinatura não trazem stock_exit_movement_id.
  const handleRevertStockExit = async () => {
    if (!detailData || !revertTarget?.stock_exit_movement_id) return;
    const contractId = detailData.contract_id;
    setReverting(true);
    try {
      const { error } = await (supabase as any).rpc('rpc_revert_client_order_stock_exit', {
        p_contract_id: contractId,
        p_movement_id: revertTarget.stock_exit_movement_id,
      });
      if (error) throw error;
      toast({ title: t('clientOrders.toast.revertSuccess') });
      setRevertTarget(null);
      const refreshed = await fetchDetail(contractId);
      setDetailData(refreshed);
      loadOrders(0, true);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.revertError'), description: error?.message, variant: "destructive" });
    } finally {
      setReverting(false);
    }
  };

  // Resumo de um pedido ao fornecedor (botão "Pedir em falta" e edição).
  const describeSupplierRequest = (result: SupplierRequestResult | null | undefined): string => {
    const parts: string[] = [];
    const orders = asQty(result?.purchase_orders_created);
    const items = asQty(result?.items_created);
    const noSupplier = asQty(result?.skipped_no_supplier);
    const other = asQty(result?.skipped_other) + asQty(result?.errors);
    parts.push(t('clientOrders.requestMissing.summary', { orders, items }));
    if (noSupplier > 0) parts.push(t('clientOrders.requestMissing.noSupplier', { count: noSupplier }));
    if (other > 0) parts.push(t('clientOrders.requestMissing.skippedOther', { count: other }));
    return parts.join(' · ');
  };

  // ── Pedir em falta ao fornecedor ─────────────────────────────────────────
  // Cria encomendas a fornecedor para a parte das linhas sem reserva nem
  // pedido (can_request_missing). O servidor decide fornecedor e quantidades.
  // Só é chamado a partir do AlertDialog de confirmação (requestMissingConfirmOpen).
  const handleRequestMissing = async () => {
    if (!detailData || requestingMissing) return;
    const contractId = detailData.contract_id;
    setRequestingMissing(true);
    try {
      const { data, error } = await (supabase as any).rpc('rpc_request_missing_from_supplier', {
        p_contract_id: contractId,
      });
      if (error) throw error;
      const result = (data || {}) as SupplierRequestResult;
      const created = asQty(result.items_created) > 0;
      toast({
        title: created
          ? t('clientOrders.requestMissing.success')
          : t('clientOrders.requestMissing.nothingCreated'),
        description: describeSupplierRequest(result),
        variant: !created && asQty(result.errors) > 0 ? "destructive" : undefined,
      });
      try {
        const refreshed = await fetchDetail(contractId);
        setDetailData(refreshed);
      } catch (refreshError: any) {
        toast({ title: t('clientOrders.toast.detailError'), description: refreshError?.message, variant: "destructive" });
      }
      loadOrders(0, true);
    } catch (error: any) {
      toast({ title: t('clientOrders.requestMissing.error'), description: error?.message, variant: "destructive" });
    } finally {
      setRequestingMissing(false);
      setRequestMissingConfirmOpen(false);
    }
  };

  const openPurchaseOrder = (line: ClientOrderDocumentLine) => {
    if (!line.purchase_order_id) return;
    // Mesmo padrão de cross-link já usado em ClientContracts.tsx
    // (?open=<id>) — replicado em PurchaseOrders.tsx para este caso.
    // rpc_get_client_order_document não devolve o id da linha da PO, por isso
    // vai o produto + a linha da EC (quote_line_id/component_index): em
    // PurchaseOrders.tsx servem para pré-selecionar a linha em "Reverter receção".
    const params = new URLSearchParams({ open: line.purchase_order_id });
    if (line.product_id) params.set('product', line.product_id);
    if (line.quote_line_id) params.set('quote_line', line.quote_line_id);
    if (line.component_index !== null && line.component_index !== undefined) {
      params.set('component', String(line.component_index));
    }
    navigate(`/purchase-orders?${params.toString()}`);
  };

  // Origem elegível para eliminação: manual ou venda direta. Contrato real
  // (ou origem desconhecida sem venda direta associada) não se elimina aqui.
  // Mesma regra de getListOrigin para a RPC antiga sem origin_type.
  const getDeletableOrigin = (
    contractId: string,
    originType: ClientOrderOriginType | null | undefined,
  ): 'manual' | 'direct_sale' | null => {
    if (originType === 'manual' || originType === 'direct_sale') return originType;
    if (!originType && salesByContract[contractId]) return 'direct_sale';
    return null;
  };

  const openDeleteOrder = (
    contractId: string,
    orderNumber: string,
    originType: ClientOrderOriginType | null | undefined,
    originNumber: string | null | undefined,
  ) => {
    const origin = getDeletableOrigin(contractId, originType);
    if (!origin) return;
    const sale = salesByContract[contractId];
    setDeleteReason("");
    setDeleteTarget({
      contract_id: contractId,
      order_number: orderNumber,
      origin,
      sale_number: origin === 'direct_sale'
        ? (originNumber || sale?.sale_number || sale?.proforma_number || null)
        : null,
    });
  };

  const deleteReasonValid = deleteReason.trim().length >= 3;

  // ── Eliminar encomenda ───────────────────────────────────────────────────
  // O servidor anula a encomenda (estorna stock, liberta reservas, cancela POs
  // pendentes), cancela a VD ligada e envia-a para o Lixo. Recusas vêm com
  // mensagem PT em error.message; o diálogo fica aberto nesse caso.
  const handleDeleteOrder = async () => {
    if (!deleteTarget || deleting) return;
    const reason = deleteReason.trim();
    if (reason.length < 3) return;
    const contractId = deleteTarget.contract_id;
    setDeleting(true);
    try {
      const { data, error } = await (supabase as any).rpc('rpc_delete_client_order', {
        p_contract_id: contractId,
        p_reason: reason,
      });
      if (error) throw error;
      const result = (data || {}) as DeleteClientOrderResult;
      if (result.success === false) {
        throw new Error(result.message || result.error || tf('clientOrders.delete.error', 'Não foi possível eliminar a encomenda.'));
      }
      const parts = [
        `${asQty(result.reversed_movements)} movimento(s) de stock devolvido(s)`,
        `${asQty(result.cancelled_pos)} pedido(s) a fornecedor cancelado(s)`,
      ];
      if (result.direct_sale_cancelled) {
        parts.push(deleteTarget.sale_number
          ? `venda direta ${deleteTarget.sale_number} cancelada`
          : 'venda direta cancelada');
      }
      toast({
        title: `Encomenda ${result.order_number || deleteTarget.order_number} eliminada`,
        description: parts.join(' · '),
      });
      setDeleteTarget(null);
      setDeleteReason("");
      if (detailData?.contract_id === contractId) {
        setDetailOpen(false);
        setDetailData(null);
      }
      loadOrders(0, true);
    } catch (error: any) {
      toast({
        title: tf('clientOrders.delete.error', 'Não foi possível eliminar a encomenda.'),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getOverallStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      totalmente_servido: "bg-success/10 text-success",
      parcialmente_pendente: "bg-warning/10 text-warning",
      a_aguardar_encomenda: "bg-info/10 text-info",
      sem_fornecedor: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.parcialmente_pendente;
  };

  const getOverallStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      totalmente_servido: t('clientOrders.status.totallyServed'),
      parcialmente_pendente: t('clientOrders.status.partiallyPending'),
      a_aguardar_encomenda: t('clientOrders.status.awaitingOrder'),
      sem_fornecedor: t('clientOrders.status.noSupplier'),
    };
    return labels[status] || status;
  };

  const getLineStatusColor = (line: ClientOrderDocumentLine) => {
    const status = line.line_status;
    if (status === 'sem_fornecedor') {
      const kind = getMissingSupplierKind(line);
      // Âmbar: resolve-se com "Pedir em falta ao fornecedor". Vermelho só
      // quando não há fornecedor preferencial. Neutro quando não se sabe.
      if (kind === 'toRequest') return "bg-amber-500/10 text-amber-600";
      if (kind === 'unknown') return "bg-muted text-muted-foreground";
    }
    const colors: Record<string, string> = {
      servido_por_stock: "bg-success/10 text-success",
      recebido: "bg-teal-500/10 text-teal-600",
      a_aguardar_encomenda: "bg-info/10 text-info",
      stock_disponivel_confirmar: "bg-warning/10 text-warning",
      // 20261204310000: parte reservada do stock + parte pedida/em falta.
      parcial: "bg-orange-500/10 text-orange-600",
      sem_fornecedor: "bg-destructive/10 text-destructive",
      // Neutro de propósito: uma linha de serviço não tem stock nem fornecedor,
      // por isso não é uma pendência. Sem esta entrada caía no fallback
      // vermelho e parecia um problema por resolver.
      servico: "bg-muted text-muted-foreground",
      // Neutro: concluída por decisão (anulado na PO), não é pendência.
      nao_recebido_anulado: "bg-muted text-muted-foreground",
    };
    return colors[status] || colors.sem_fornecedor;
  };

  // Quantidade em unidades de stock (reserva/pedido/falta).
  const formatBaseQty = (value: unknown): string => formatDiagnosticNumber(asQty(value));

  // "Parcial — X servido · Y em stock · Z a aguardar fornecedor · W em falta"
  // (só as partes > 0). "Servido" vem de qty_served (20261204340000), não se
  // infere pelos movimentos de stock.
  const getPartialDetail = (line: ClientOrderDocumentLine): string => {
    const parts: string[] = [];
    const served = asQty(line.qty_served);
    const reserved = asQty(line.qty_reserved);
    const ordered = asQty(line.qty_ordered);
    const received = asQty(line.qty_received);
    const missing = asQty(line.qty_missing);
    if (served > 0) parts.push(t('clientOrders.lineStatus.partServed', { qty: formatBaseQty(served) }));
    if (reserved > 0) parts.push(t('clientOrders.lineStatus.partInStock', { qty: formatBaseQty(reserved) }));
    if (ordered > 0) {
      const pending = roundQty(ordered - received);
      if (pending > 0) parts.push(t('clientOrders.lineStatus.partAwaitingSupplier', { qty: formatBaseQty(pending) }));
      if (received > 0) parts.push(t('clientOrders.lineStatus.partReceived', { qty: formatBaseQty(received) }));
    }
    if (missing > 0) parts.push(t('clientOrders.lineStatus.partMissing', { qty: formatBaseQty(missing) }));
    return parts.join(' · ');
  };

  // Resumo compacto da reserva para as restantes linhas de produto pendentes
  // (o 'parcial' já o mostra no próprio rótulo). Vazio quando não acrescenta.
  // Linhas servidas/recebidas: "X servido do stock" quando qty_served > 0.
  const getReservationSummary = (line: ClientOrderDocumentLine): string => {
    if (line.item_type === 'service') return '';
    if (['servido_por_stock', 'recebido'].includes(line.line_status)) {
      return asQty(line.qty_served) > 0
        ? t('clientOrders.dialog.qtyServed', { qty: formatBaseQty(line.qty_served) })
        : '';
    }
    if (line.qty_needed === null || line.qty_needed === undefined) return '';
    if (!['stock_disponivel_confirmar', 'a_aguardar_encomenda', 'sem_fornecedor'].includes(line.line_status)) return '';
    const parts: string[] = [];
    if (asQty(line.qty_reserved) > 0) parts.push(t('clientOrders.dialog.qtyReserved', { qty: formatBaseQty(line.qty_reserved) }));
    if (asQty(line.qty_ordered) > 0) parts.push(t('clientOrders.dialog.qtyOrdered', { qty: formatBaseQty(line.qty_ordered) }));
    if (asQty(line.qty_missing) > 0) parts.push(t('clientOrders.dialog.qtyMissing', { qty: formatBaseQty(line.qty_missing) }));
    return parts.join(' · ');
  };

  // 20261206150000: parte anulada na PO numa linha recebida/servida/parcial —
  // " · X não será recebido — anulado na PO-X (motivo)". Vazio sem anulação.
  const getCancelledSuffix = (line: ClientOrderDocumentLine): string => {
    if (!['recebido', 'servido_por_stock', 'parcial'].includes(line.line_status)) return '';
    const cancelled = asQty(line.qty_cancelled);
    if (cancelled <= 0) return '';
    return ` · ${formatBaseQty(cancelled)} não será recebido — anulado${getLineCancellationRefs(line)}`;
  };

  const getLineStatusLabel = (line: ClientOrderDocumentLine) => {
    const label = getBaseLineStatusLabel(line);
    return `${label}${getCancelledSuffix(line)}`;
  };

  const getBaseLineStatusLabel = (line: ClientOrderDocumentLine) => {
    switch (line.line_status) {
      case 'nao_recebido_anulado':
        return `Não será recebido — anulado${getLineCancellationRefs(line)}`;
      case 'servido_por_stock':
        return t('clientOrders.lineStatus.servedByStock');
      case 'recebido':
        return line.purchase_order_number
          ? t('clientOrders.lineStatus.receivedWithPo', { number: line.purchase_order_number })
          : t('clientOrders.lineStatus.received');
      case 'a_aguardar_encomenda':
        return t('clientOrders.lineStatus.awaitingOrder', { number: line.purchase_order_number || '' });
      case 'stock_disponivel_confirmar':
        return t('clientOrders.lineStatus.stockAvailableConfirm');
      case 'parcial': {
        const detail = getPartialDetail(line);
        return detail
          ? `${t('clientOrders.lineStatus.partial')} — ${detail}`
          : t('clientOrders.lineStatus.partial');
      }
      case 'sem_fornecedor': {
        const kind = getMissingSupplierKind(line);
        if (kind === 'toRequest') return t('clientOrders.lineStatus.missingToRequest');
        if (kind === 'noPreferred') return t('clientOrders.lineStatus.noSupplier');
        return t('clientOrders.lineStatus.missingNoRequest');
      }
      case 'servico':
        return t('clientOrders.lineStatus.service');
      default:
        return line.line_status;
    }
  };

  // ── Criação manual de Encomenda Cliente ──────────────────────────────────
  // UI/UX e código replicam o diálogo de criação manual de Encomenda de Compra
  // (PurchaseOrders.tsx): tabela de linhas editável (qt/preço), resumo de
  // totais ao lado e validação com um toast por erro antes de submeter. O
  // seletor de artigos é o AddItemsDialog já usado nos Orçamentos — e não o
  // seletor de PurchaseOrders.tsx, que filtra o catálogo pelo fornecedor
  // escolhido e usa preços de COMPRA; aqui as linhas acabam em `quote_lines`,
  // logo o que interessa são artigos vendáveis a preço de VENDA.

  const resetCreateForm = () => {
    setCreateClient(null);
    deliveryAddressRequestRef.current = null;
    setCreateDeliveryAddress("");
    setDeliveryEntityId(null);
    setDeliveryOptions([]);
    setDeliveryOptionsLoading(false);
    setDeliveryChoice("");
    setShowNewDeliveryForm(false);
    setCreateDate(new Date().toISOString().split('T')[0]);
    setCreateNotes("");
    setCreateItems([]);
    setEditingContractId(null);
    setEditingOrderNumber(null);
    setEditingClientName(null);
  };

  // Fecha o diálogo de criação/edição. Ao sair da edição sem gravar volta a
  // abrir o detalhe de onde se partiu.
  const closeCreateDialog = () => {
    const returnTo = editingContractId;
    setCreateOpen(false);
    resetCreateForm();
    if (returnTo) openDetail(returnTo);
  };

  // A linha exige quantidade inteira? (produto cuja unidade de stock é
  // contável — mesma regra que o servidor valida).
  const itemRequiresInteger = (item: ManualClientOrderItem) => requiresIntegerQty({
    hasProduct: !!item.product_id,
    lineUomId: null,
    baseUomCode: productUom.getBaseCode(item.product_id),
  });

  // ── Edição de encomenda manual ──────────────────────────────────────────
  // Pré-preenche o diálogo a partir de quote_lines (lidas diretamente pelo
  // orçamento interno do contrato): é a única fonte com preço, IVA, categoria
  // e descrição exatamente como gravados — e as linhas trancadas têm de ser
  // reenviadas com esses valores exatos. O detalhe só dá o estado/trancado e o
  // SKU de cada linha.
  const openEditOrder = async () => {
    if (!detailData || editLoading) return;
    const doc = detailData;
    setEditLoading(true);
    try {
      // RPC SECURITY DEFINER com as mesmas verificações da gravação
      // (rpc_update_manual_client_order): a leitura direta falhava pela RLS
      // de client_contracts para quem vê a organização pela hierarquia.
      const { data: contractData, error: contractError } = await supabase
        .rpc('rpc_get_manual_client_order_edit', { p_contract_id: doc.contract_id });
      if (contractError) throw contractError;
      const contract = contractData as unknown as { quote_id: string | null; entity_id: string | null; lines: any[] | null } | null;
      if (!contract?.quote_id) throw new Error(t('clientOrders.toast.editLoadError'));

      const quoteLines = contract.lines || [];
      // Proteção: nunca abrir o diálogo vazio sobre uma encomenda com linhas —
      // gravar assim apagaria as linhas.
      if (quoteLines.length === 0 && (doc.lines?.length ?? 0) > 0) {
        throw new Error(t('clientOrders.toast.editLoadError'));
      }

      const detailByLineId = new Map(doc.lines.map((l) => [l.quote_line_id, l]));
      const items: ManualClientOrderItem[] = ((quoteLines as any[]) || [])
        .filter((row) => row.product_id || row.service_id)
        .map((row) => {
          const detailLine = detailByLineId.get(row.id);
          const locked = detailLine?.line_locked === true;
          const isProduct = !!row.product_id;
          return {
            quote_line_id: row.id,
            locked,
            locked_payload: locked
              ? {
                  quote_line_id: row.id,
                  product_id: row.product_id,
                  service_id: row.service_id,
                  descricao: row.descricao_snapshot,
                  categoria: row.categoria,
                  qt: row.qt,
                  preco_unit: row.custo_material_unit,
                  iva_percent: row.iva_percent,
                  uom_id: row.uom_id,
                }
              : undefined,
            original_key: locked
              ? undefined
              : manualItemKey({ product_id: row.product_id ?? null, quantity: Number(row.qt) || 0, uom_id: row.uom_id ?? null }),
            item_type: isProduct ? 'product' : 'service',
            product_id: row.product_id ?? null,
            service_id: isProduct ? null : row.service_id ?? null,
            description: row.descricao_snapshot ?? '',
            categoria: row.categoria ?? '',
            sku: detailLine?.product_sku || detailLine?.service_sku || null,
            quantity: Number(row.qt) || 0,
            unit_price: Number(row.custo_material_unit) || 0,
            vat_rate: row.iva_percent === null || row.iva_percent === undefined ? DEFAULT_VAT_RATE : Number(row.iva_percent),
            uom_id: row.uom_id ?? null,
          };
        });

      resetCreateForm();
      setEditingContractId(doc.contract_id);
      setEditingOrderNumber(doc.order_number || doc.contract_number);
      setEditingClientName(doc.client_name);
      setCreateDeliveryAddress(doc.delivery_address ?? "");
      setCreateDate(doc.signature_date ? doc.signature_date.split('T')[0] : "");
      setCreateItems(items);
      setDetailOpen(false);
      setCreateOpen(true);

      // Moradas de entrega do cliente da encomenda, para o Select. Não
      // substitui a morada já gravada: só marca a opção que lhe corresponde.
      const orderEntityId: string | null = contract.entity_id ?? null;
      deliveryAddressRequestRef.current = orderEntityId;
      setDeliveryEntityId(orderEntityId);
      if (orderEntityId) {
        const savedAddress = (doc.delivery_address ?? "").trim();
        void loadDeliveryOptions(orderEntityId).then((options) => {
          if (!options || deliveryAddressRequestRef.current !== orderEntityId) return;
          const match = options.find((option) => formatDeliveryAddress(option) === savedAddress);
          if (match) setDeliveryChoice(match.entity_address_id);
        });
      }
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.editLoadError'), description: error?.message, variant: "destructive" });
    } finally {
      setEditLoading(false);
    }
  };

  // Carrega as moradas de entrega de um cliente para o Select. Devolve null se
  // entretanto se mudou de cliente (resposta fora de ordem, ignorada).
  const loadDeliveryOptions = async (entityId: string): Promise<EntityDeliveryAddress[] | null> => {
    setDeliveryOptionsLoading(true);
    try {
      const rows = await fetchEntityDeliveryAddresses(entityId);
      if (deliveryAddressRequestRef.current !== entityId) return null;
      setDeliveryOptions(rows);
      return rows;
    } catch (error: any) {
      if (deliveryAddressRequestRef.current !== entityId) return null;
      // Sem toast: sem acesso às moradas de entrega, a encomenda continua a
      // funcionar com a morada principal (ou a já gravada, ao editar).
      console.warn('Error loading client delivery addresses:', error);
      setDeliveryOptions([]);
      return [];
    } finally {
      if (deliveryAddressRequestRef.current === entityId) setDeliveryOptionsLoading(false);
    }
  };

  // Morada principal da entidade em texto, para quando não há moradas de
  // entrega. Só ligações ativas (valid_to nulo ou futuro) e nunca uma de
  // entrega (address_type 'delivery' fica para o Select).
  const loadPrimaryAddressText = async (entityId: string): Promise<string> => {
    try {
      const { data, error } = await (supabase as any)
        .from('anew_entity_addresses')
        .select('is_primary, address_type, anew_addresses(street, number, postal_code, city)')
        .eq('entity_id', entityId)
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      const row = ((data as any[]) || []).find((item) => item?.address_type !== 'delivery');
      const addr = row?.anew_addresses;
      if (!addr) return "";
      return [addr.street, addr.number, addr.postal_code, addr.city]
        .map((part: unknown) => (typeof part === 'string' ? part.trim() : part != null ? String(part).trim() : ''))
        .filter(Boolean)
        .join(', ');
    } catch (error) {
      console.error('Error loading client delivery address:', error);
      return "";
    }
  };

  // Ao escolher o cliente carrega as moradas de entrega: com uma só, escolhe-a;
  // com várias, deixa o Select no placeholder; sem nenhuma, pré-preenche com a
  // morada principal (editável). O ref guarda o último entityId pedido para
  // ignorar respostas que cheguem fora de ordem.
  const handleCreateClientChange = async (client: EntitySearchResult | null) => {
    setCreateClient(client);
    const entityId = client?.entityId ?? null;
    deliveryAddressRequestRef.current = entityId;
    setDeliveryEntityId(entityId);
    setDeliveryOptions([]);
    setDeliveryChoice("");
    setShowNewDeliveryForm(false);
    if (!entityId) {
      setDeliveryOptionsLoading(false);
      setCreateDeliveryAddress("");
      return;
    }
    const [options, primaryText] = await Promise.all([
      loadDeliveryOptions(entityId),
      loadPrimaryAddressText(entityId),
    ]);
    if (options === null || deliveryAddressRequestRef.current !== entityId) return;
    if (options.length === 1) {
      const only = options[0];
      setDeliveryChoice(only.entity_address_id);
      setCreateDeliveryAddress(formatDeliveryAddress(only) || only.formatted || "");
    } else if (options.length > 1) {
      setCreateDeliveryAddress("");
    } else {
      setCreateDeliveryAddress(primaryText);
    }
  };

  // Select de moradas de entrega: preenche a Textarea com o texto formatado
  // (com andar e fração). "+ Nova morada…" só abre o formulário.
  // Textarea de destino: a do diálogo de cabeçalho quando está aberto, senão a
  // do diálogo manual (comportamento anterior).
  const setDeliveryText = (text: string) => {
    if (headerEditOpen) setHeaderDeliveryAddress(text);
    else setCreateDeliveryAddress(text);
  };

  const handleDeliveryChoiceChange = (value: string) => {
    if (value === NEW_DELIVERY_ADDRESS_VALUE) {
      if (headerEditOpen ? canEditOrder : canAddDeliveryInManualDialog) setShowNewDeliveryForm(true);
      return;
    }
    const option = deliveryOptions.find((o) => o.entity_address_id === value);
    if (!option) return;
    setDeliveryChoice(value);
    setDeliveryText(formatDeliveryAddress(option) || option.formatted || "");
  };

  // Nova morada gravada (rpc_add_entity_delivery_address): recarrega a lista
  // e escolhe-a.
  const handleDeliveryAddressAdded = async (result: AddDeliveryAddressResult, input: DeliveryAddressInput) => {
    const entityId = deliveryEntityId;
    if (!entityId) return;
    setShowNewDeliveryForm(false);
    const options = await loadDeliveryOptions(entityId);
    if (options === null) return;
    const added = options.find((o) => o.entity_address_id === result?.entity_address_id);
    setDeliveryChoice(added ? added.entity_address_id : "");
    setDeliveryText(formatDeliveryAddress(added ?? input));
  };

  // ── Edição do cabeçalho (encomendas com documento de origem) ────────────
  // Limpa o estado partilhado do Select de moradas, para o diálogo manual não
  // herdar as moradas deste cliente (o botão "Nova encomenda" não o repõe).
  const resetHeaderEdit = () => {
    deliveryAddressRequestRef.current = null;
    setDeliveryEntityId(null);
    setDeliveryOptions([]);
    setDeliveryOptionsLoading(false);
    setDeliveryChoice("");
    setShowNewDeliveryForm(false);
    setHeaderDeliveryAddress("");
    setHeaderInitialAddress("");
    setHeaderNotes("");
  };

  // Cliente da encomenda para o Select de moradas. Primeiro o entity_id da RPC
  // do detalhe; com a RPC antiga lê-se de client_contracts. Se a RLS não deixar (ex.: system
  // admin por hierarquia), fica só a Textarea — a gravação continua a funcionar.
  const resolveOrderEntityId = async (doc: ClientOrderDocumentDetail): Promise<string | null> => {
    if (doc.entity_id) return doc.entity_id;
    try {
      const { data, error } = await (supabase as any)
        .from('client_contracts')
        .select('entity_id')
        .eq('id', doc.contract_id)
        .maybeSingle();
      if (error) throw error;
      return (data?.entity_id as string | null | undefined) ?? null;
    } catch (error) {
      console.warn('[ClientOrders] não foi possível obter o cliente da encomenda', error);
      return null;
    }
  };

  const openHeaderEdit = () => {
    if (!detailData) return;
    const doc = detailData;
    resetHeaderEdit();
    setHeaderDeliveryAddress(doc.delivery_address ?? "");
    setHeaderInitialAddress(doc.delivery_address ?? "");
    setHeaderNotes(doc.notes ?? "");
    setHeaderEditOpen(true);

    // Igual ao diálogo manual: não substitui a morada gravada, só marca a
    // opção do Select cujo texto lhe corresponde.
    const savedAddress = (doc.delivery_address ?? "").trim();
    const requestKey = `header:${doc.contract_id}`;
    deliveryAddressRequestRef.current = requestKey;
    void resolveOrderEntityId(doc).then((entityId) => {
      if (deliveryAddressRequestRef.current !== requestKey) return;
      deliveryAddressRequestRef.current = entityId;
      setDeliveryEntityId(entityId);
      if (!entityId) return;
      void loadDeliveryOptions(entityId).then((options) => {
        if (!options || deliveryAddressRequestRef.current !== entityId) return;
        const match = options.find((option) => formatDeliveryAddress(option) === savedAddress);
        if (match) setDeliveryChoice(match.entity_address_id);
      });
    });
  };

  const closeHeaderEdit = () => {
    setHeaderEditOpen(false);
    resetHeaderEdit();
  };

  const handleSaveHeader = async () => {
    if (!detailData || headerEditSaving) return;
    const contractId = detailData.contract_id;
    // Morada: se o texto não mudou, não gravar a calculada (COALESCE com a
    // obra/morada principal) — mantém-se o override em bruto. Com a RPC antiga
    // (sem a chave) não há como saber: envia-se o texto, como antes.
    const typedAddress = headerDeliveryAddress.trim();
    const addressUnchanged = typedAddress === headerInitialAddress.trim();
    const hasOverrideKey = 'delivery_address_override' in detailData;
    const deliveryAddressParam = addressUnchanged && hasOverrideKey
      ? (detailData.delivery_address_override ?? null)
      : (typedAddress || null);
    setHeaderEditSaving(true);
    try {
      const { error } = await (supabase as any).rpc('rpc_update_client_order_header', {
        p_contract_id: contractId,
        p_delivery_address: deliveryAddressParam,
        p_notes: headerNotes.trim() || null,
      });
      if (error) throw error;
      toast({ title: tf('clientOrders.headerEdit.success', 'Encomenda atualizada') });
      closeHeaderEdit();
      try {
        const refreshed = await fetchDetail(contractId);
        setDetailData(refreshed);
      } catch (refreshError: any) {
        toast({ title: t('clientOrders.toast.detailError'), description: refreshError?.message, variant: "destructive" });
      }
      loadOrders(0, true);
    } catch (error: any) {
      toast({
        title: tf('clientOrders.headerEdit.error', 'Erro ao atualizar a encomenda'),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setHeaderEditSaving(false);
    }
  };

  // "Contrato CC-…" / "Venda Direta VD-…" para a descrição do diálogo.
  const describeOrigin = (doc: ClientOrderDocumentDetail): string => {
    const sale = salesByContract[doc.contract_id];
    if (doc.origin_type === 'direct_sale' || (!doc.origin_type && sale)) {
      const number = doc.origin_number || sale?.sale_number || sale?.proforma_number || '';
      return `${t('clientOrders.origin.directSale')}${number ? ` ${number}` : ''}`;
    }
    return t('clientOrders.origin.contract', { number: doc.origin_number || doc.contract_number });
  };

  const getCreateTotals = () => {
    let subtotal = 0;
    let totalVat = 0;
    createItems.forEach((item) => {
      const itemSubtotal = item.unit_price * item.quantity;
      subtotal += itemSubtotal;
      totalVat += itemSubtotal * (item.vat_rate / 100);
    });
    return { subtotal, totalVat, total: subtotal + totalVat };
  };

  const handleAddCatalogItems = (selected: any[]) => {
    const newItems: ManualClientOrderItem[] = [];

    selected.forEach((sel) => {
      const { item, quantity, fullAttributes, attributePriceAddon, bundleInfo } = sel;

      // Bundles: o AddItemsDialog devolve-os como UMA linha cujo `item.id` é o
      // id do bundle, que não é um product_id nem um service_id — a RPC
      // rejeitaria. Expande-se nos componentes reais (bundleInfo.components já
      // traz o source_id de cada um, com a quantidade por unidade de bundle).
      if (bundleInfo) {
        (bundleInfo.components || []).forEach((comp: any) => {
          const isProduct = comp.type === 'product';
          newItems.push({
            item_type: isProduct ? 'product' : 'service',
            product_id: isProduct ? comp.source_id : null,
            service_id: isProduct ? null : comp.source_id,
            description: comp.name,
            categoria: bundleInfo.bundle_name || 'Bundle',
            sku: comp.sku ?? null,
            quantity: (Number(comp.quantity) || 0) * (Number(quantity) || 1),
            unit_price: Number(comp.unit_price) || 0,
            vat_rate: toVatRate(comp.vat_rate),
            row_key: newRowKey(),
          });
        });
        return;
      }

      // Descrição com atributos escolhidos, mesmo formato de PurchaseOrders.tsx
      // ("Nome (Medida: 90x90, Cor: Branco)") — é esta string que fica no
      // snapshot da linha do orçamento sintético.
      const attrStrings = Object.values(fullAttributes || {})
        .map((attr: any) => {
          if (!attr?.value) return null;
          const displayValue = attr.unit ? `${attr.value} ${attr.unit}` : attr.value;
          return `${attr.label}: ${displayValue}`;
        })
        .filter(Boolean) as string[];
      const description = attrStrings.length > 0
        ? `${item.name} (${attrStrings.join(', ')})`
        : item.name;

      const isProduct = item.type === 'product';
      newItems.push({
        item_type: isProduct ? 'product' : 'service',
        product_id: isProduct ? item.id : null,
        service_id: isProduct ? null : item.id,
        description,
        categoria: item.category_name || t('clientOrders.create.noCategory'),
        sku: item.sku ?? null,
        quantity: Number(quantity) || 1,
        unit_price: (Number(item.retail_price) || 0) + (Number(attributePriceAddon) || 0),
        vat_rate: toVatRate(item.vat_rate),
        row_key: newRowKey(),
      });
    });

    if (newItems.length === 0) return;

    setCreateItems((prev) => [...prev, ...newItems]);
    toast({
      title: t('clientOrders.create.itemsAdded', { count: newItems.length }),
    });
  };

  const handleCreateItemChange = (index: number, field: 'quantity' | 'unit_price' | 'vat_rate', value: string) => {
    setCreateItems((prev) => {
      const next = [...prev];
      if (next[index]?.locked) return prev;
      const parsed = parseFloat(value);
      let numeric = isNaN(parsed) ? 0 : parsed;
      // Unidade contável: arredonda logo para inteiro.
      if (field === 'quantity' && itemRequiresInteger(next[index])) numeric = roundToIntegerQty(numeric);
      next[index] = { ...next[index], [field]: numeric };
      return next;
    });
  };

  const handleRemoveCreateItem = (index: number) => {
    setCreateItems((prev) => prev.filter((item, i) => i !== index || item.locked));
  };

  // Layout do protótipo: "+ Adicionar linha" acrescenta uma linha de produto
  // por escolher (seletor de produto + quantidade). Linhas deixadas por
  // escolher não se gravam (como no protótipo) — ver getFilledCreateItems.
  const handleAddBlankCreateItem = () => {
    setCreateItems((prev) => [...prev, {
      item_type: 'product',
      product_id: null,
      service_id: null,
      description: '',
      categoria: '',
      sku: null,
      quantity: 1,
      unit_price: 0,
      vat_rate: DEFAULT_VAT_RATE,
      row_key: newRowKey(),
    }]);
  };

  // Produto escolhido no seletor da linha: mesmos campos que o AddItemsDialog
  // preenchia (descrição, categoria, SKU, preço de venda e IVA do catálogo).
  const handleCreateItemProductSelect = (index: number, product: ClientOrderCatalogProduct) => {
    setCreateItems((prev) => {
      const current = prev[index];
      if (!current || current.locked || current.quote_line_id) return prev;
      const next = [...prev];
      next[index] = {
        ...current,
        item_type: 'product',
        product_id: product.id,
        service_id: null,
        description: product.name,
        categoria: product.category_name || t('clientOrders.create.noCategory'),
        sku: product.sku,
        unit_price: Number(product.retail_price) || 0,
        vat_rate: toVatRate(product.vat_rate),
      };
      return next;
    });
  };

  // Linhas a gravar: sem as linhas novas deixadas por escolher.
  const getFilledCreateItems = (): ManualClientOrderItem[] =>
    createItems.filter((item) => item.locked || !!item.quote_line_id || !!item.product_id || !!item.service_id);

  // Validação comum a criar/editar — um toast por erro, mesmo padrão de
  // PurchaseOrders.tsx (o backend valida na mesma; isto é só UX). As linhas
  // trancadas não se validam: seguem tal como estão gravadas.
  const validateOrderItems = (items: ManualClientOrderItem[]): boolean => {
    if (items.length === 0) {
      toast({
        title: t('clientOrders.create.validation.itemsRequired'),
        description: t('clientOrders.create.validation.itemsRequiredDesc'),
        variant: "destructive",
      });
      return false;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.locked) continue;
      // Número da linha como o utilizador a vê no diálogo (as linhas por
      // escolher saem de `items`, mas continuam visíveis e numeradas).
      const visibleIndex = createItems.indexOf(item);
      const lineNo = (visibleIndex >= 0 ? visibleIndex : i) + 1;
      if (!item.product_id && !item.service_id) {
        toast({
          title: t('clientOrders.create.validation.lineWithoutItem'),
          description: t('clientOrders.create.validation.lineWithoutItemDesc', { line: lineNo }),
          variant: "destructive",
        });
        return false;
      }
      if (!(item.quantity > 0)) {
        toast({
          title: t('clientOrders.create.validation.invalidQuantity'),
          description: t('clientOrders.create.validation.invalidQuantityDesc', { line: lineNo }),
          variant: "destructive",
        });
        return false;
      }
      const integer = itemRequiresInteger(item);
      if (!isValidQtyFor(item.quantity, integer)) {
        toast({
          title: t('clientOrders.create.validation.invalidQuantity'),
          description: integerQtyMessage(lineNo,productUom.getBaseCode(item.product_id)),
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const handleUpdateOrder = async () => {
    if (!editingContractId) return;
    const items = getFilledCreateItems();
    if (!validateOrderItems(items)) return;
    const contractId = editingContractId;

    // Produto já servido/pedido (linha trancada) não pode ganhar quantidade
    // noutra linha nova ou alterada: a saída de stock é por (contrato,
    // produto) e não há segunda. O servidor também valida; isto é só UX.
    const lockedProductIds = new Set(
      items.filter((item) => item.locked && item.product_id).map((item) => item.product_id as string),
    );
    const conflicting = items.find((item) => (
      !item.locked
      && !!item.product_id
      && lockedProductIds.has(item.product_id)
      && (!item.quote_line_id || item.original_key !== manualItemKey(item))
    ));
    if (conflicting) {
      const productLabel = conflicting.description || conflicting.sku || conflicting.product_id;
      toast({
        title: t('clientOrders.toast.updateError'),
        description: `O produto ${productLabel} já foi servido ou pedido a fornecedor — reverta a saída antes de acrescentar quantidade`,
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // `rpc_update_manual_client_order` ainda não está nos tipos gerados.
      // Linhas existentes ausentes do payload são removidas pelo servidor,
      // por isso vão todas — as trancadas com os valores exatos lidos.
      const { data: updateResult, error } = await (supabase as any).rpc('rpc_update_manual_client_order', {
        p_contract_id: contractId,
        p_items: items.map((item) => (
          item.locked && item.locked_payload
            ? item.locked_payload
            : {
                quote_line_id: item.quote_line_id ?? null,
                product_id: item.product_id,
                service_id: item.service_id,
                descricao: item.description,
                categoria: item.categoria,
                qt: item.quantity,
                preco_unit: item.unit_price,
                iva_percent: item.vat_rate,
                uom_id: item.uom_id || null,
              }
        )),
        p_delivery_address: createDeliveryAddress.trim() || null,
      });
      if (error) throw error;

      // 20261204310000: o servidor pede logo ao fornecedor o que falta nas
      // linhas novas/aumentadas — mostra-se o resumo quando criou alguma coisa.
      const supplierRequest = (updateResult as { supplier_request?: SupplierRequestResult } | null)?.supplier_request;
      toast({
        title: t('clientOrders.toast.updateSuccess'),
        description: asQty(supplierRequest?.items_created) > 0
          ? `${t('clientOrders.requestMissing.autoRequested')} ${describeSupplierRequest(supplierRequest)}`
          : undefined,
      });
      setCreateOpen(false);
      resetCreateForm();
      loadOrders(0, true);
      openDetail(contractId);
    } catch (error: any) {
      toast({
        title: t('clientOrders.toast.updateError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!activeCompany?.id) return;

    // Validação antes de submeter — um toast por erro, mesmo padrão de
    // PurchaseOrders.tsx (o backend valida na mesma; isto é só UX).
    const entityId = createClient?.entityId;
    if (!entityId) {
      toast({
        title: t('clientOrders.create.validation.clientRequired'),
        description: t('clientOrders.create.validation.clientRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    const items = getFilledCreateItems();
    if (!validateOrderItems(items)) return;

    setCreating(true);
    try {
      // `rpc_create_manual_client_order` ainda não está nos tipos gerados
      // (migration nova) — daí o cast, mesmo padrão já usado nas outras RPCs
      // desta página.
      const { error } = await (supabase as any).rpc('rpc_create_manual_client_order', {
        p_organization_id: activeCompany.id,
        p_order: {
          entity_id: entityId,
          notes: createNotes.trim() || null,
          start_date: createDate || null,
          delivery_address: createDeliveryAddress.trim() || null,
        },
        p_items: items.map((item) => ({
          product_id: item.product_id,
          service_id: item.service_id,
          descricao: item.description,
          categoria: item.categoria,
          qt: item.quantity,
          preco_unit: item.unit_price,
          iva_percent: item.vat_rate,
        })),
      });

      if (error) throw error;

      toast({ title: t('clientOrders.toast.createSuccess') });
      setCreateOpen(false);
      resetCreateForm();
      // Recarrega a listagem a partir da primeira página (a RPC de leitura é a
      // fonte da verdade — a encomenda nova já vem com o estado calculado).
      loadOrders(0, true);
    } catch (error: any) {
      toast({
        title: t('clientOrders.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ── Lista "Saídas para clientes" (UI do Inventário) ──────────────────────
  // Só apresentação: filtros no URL, contagens, exportação e o menu ⋯ por
  // linha. Os handlers de negócio acima ficam como estavam.

  // O estado segue o URL (?status=) — inclui navegar para cá já com filtro.
  useEffect(() => {
    setStatusFilter(urlStatus);
  }, [urlStatus]);

  const applyStatusFilter = (next: ClientOrderStatusFilter) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "all") params.delete("status");
      else params.set("status", next);
      params.delete("ready");
      return params;
    }, { replace: true });
  };

  // "Prontas a expedir" (?ready=1): exclusivo com o filtro de estado, como no
  // protótipo; voltar a carregar na pílula ativa desliga-o.
  const applyReadyFilter = (next: boolean) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next) {
        params.set("ready", "1");
        params.delete("status");
      } else {
        params.delete("ready");
      }
      return params;
    }, { replace: true });
  };

  // Prontas a expedir: nº de encomendas com lines_ready > 0 na prontidão
  // (rpc_client_order_list_readiness — mesma regra de
  // rpc_inventory_today.ready_to_ship). Enquanto não chega ou se falhar, o
  // número agregado de rpc_inventory_today.
  const canViewOrders = hasPermission('client_orders.view');
  const { data: inventoryToday } = useInventoryToday({ enabled: canViewOrders });
  const readyToShipRaw = inventoryToday?.client_orders?.ready_to_ship;
  const readyToShip = readiness
    ? readyContractIds(readiness).size
    : readyToShipRaw === null || readyToShipRaw === undefined || !Number.isFinite(Number(readyToShipRaw))
      ? null
      : Number(readyToShipRaw);

  // Contagens por estado com as datas atuais (pílulas e KPI). Não dependem da
  // pesquisa; voltam a ser lidas quando a lista recarrega depois de uma ação.
  const statusSummaryQuery = useClientOrderStatusSummary(
    activeCompany?.id,
    { dateFrom, dateTo },
    listDataVersion,
  );
  const statusSummary = statusSummaryQuery.data ?? null;

  // Ações do menu ⋯ que só existem no detalhe (dependem de is_editable /
  // can_request_missing, que a lista não traz): abre o detalhe como o "Ver" e,
  // quando o documento chega, segue para a mesma ação do botão do detalhe,
  // com as mesmas condições. Se a condição falhar, fica só o detalhe aberto.
  const pendingDetailActionRef = useRef<{ contractId: string; action: 'edit' | 'requestMissing' } | null>(null);
  const openDetailThen = (contractId: string, action: 'edit' | 'requestMissing') => {
    pendingDetailActionRef.current = { contractId, action };
    openDetail(contractId);
  };
  useEffect(() => {
    const pending = pendingDetailActionRef.current;
    if (!pending) return;
    if (!detailOpen) {
      pendingDetailActionRef.current = null;
      return;
    }
    if (!detailData || detailData.contract_id !== pending.contractId) return;
    pendingDetailActionRef.current = null;
    if (pending.action === 'edit') {
      if (detailData.is_editable && canEditOrder) void openEditOrder();
      return;
    }
    if (detailData.can_request_missing && canRequestMissing) {
      setRequestMissingConfirmOpen(true);
    } else {
      toast({
        title: 'Nada a pedir ao fornecedor',
        description: 'Esta encomenda não tem linhas em falta que se possam pedir.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailData, detailOpen]);

  // Origem para o distintivo da lista — mesma regra de getDeletableOrigin/direct_sales.
  const getListOrigin = (order: ClientOrderDocumentRow): { kind: ClientOrderOriginKind; label: string } | null => {
    const sale = salesByContract[order.contract_id];
    if (order.origin_type === 'direct_sale' || (!order.origin_type && sale)) {
      const number = order.origin_number || sale?.sale_number || sale?.proforma_number || '';
      return { kind: 'direct_sale', label: `Venda direta${number ? ` ${number}` : ''}` };
    }
    if (order.origin_type === 'contract') {
      return { kind: 'contract', label: `Contrato ${order.origin_number || order.contract_number}` };
    }
    if (order.origin_type === 'manual') return { kind: 'manual', label: 'Manual' };
    return null;
  };

  const OVERALL_STATUS_TONE: Record<string, InventoryTone> = {
    totalmente_servido: 'ok',
    parcialmente_pendente: 'warn',
    a_aguardar_encomenda: 'info',
    sem_fornecedor: 'bad',
  };

  // Exportar (XLSX) as encomendas com os filtros atuais — todas, não só as
  // páginas já carregadas. Mesma RPC e mesma organização da lista.
  const [exporting, setExporting] = useState(false);
  const EXPORT_MAX_PAGES = 50;
  const handleExport = async () => {
    if (!activeCompany?.id || exporting) return;
    setExporting(true);
    try {
      const filters = { search: debouncedSearchTerm, status: statusFilter, dateFrom, dateTo };
      // Com "Prontas a expedir" exporta-se o mesmo conjunto que a lista mostra.
      const { rows, truncated } = urlReady
        ? await fetchClientOrderRowsByIds(
            activeCompany.id,
            filters,
            readyContractIds(await loadClientOrderReadiness(queryClient, activeCompany.id, false)),
            EXPORT_MAX_PAGES,
          )
        : await fetchAllClientOrderRows(activeCompany.id, filters, EXPORT_MAX_PAGES);
      if (rows.length === 0) {
        toast({ title: 'Nada para exportar', description: 'Não há encomendas com estes filtros.' });
        return;
      }
      downloadStandardXlsx(
        {
          sheetName: 'Saídas para clientes',
          columns: [
            { key: 'order', header: 'Nº EC', type: 'text' },
            { key: 'origin', header: 'Origem', type: 'text' },
            { key: 'client', header: 'Cliente', type: 'text' },
            { key: 'address', header: 'Morada', type: 'text' },
            { key: 'date', header: 'Data', type: 'date' },
            { key: 'lines', header: 'Linhas', type: 'number' },
            { key: 'served', header: 'Linhas servidas', type: 'number' },
            { key: 'waiting', header: 'Linhas a aguardar', type: 'number' },
            { key: 'missing', header: 'Linhas em falta', type: 'number' },
            { key: 'services', header: 'Serviços', type: 'number' },
            { key: 'status', header: 'Estado', type: 'text' },
            { key: 'linesReady', header: 'Linhas prontas a sair', type: 'number' },
            { key: 'unitsServed', header: 'Un. servidas', type: 'number' },
            { key: 'unitsStock', header: 'Un. em stock', type: 'number' },
            { key: 'unitsPo', header: 'Un. em PO', type: 'number' },
            { key: 'unitsMissing', header: 'Un. em falta', type: 'number' },
          ],
          rows: rows.map((r) => {
            const parts = clientOrderProgressParts(r);
            const origin = getListOrigin(r as ClientOrderDocumentRow);
            const rd = readiness?.[r.contract_id];
            return {
              order: r.order_number || r.contract_number,
              origin: origin?.label ?? '',
              client: r.client_name ?? '',
              address: r.delivery_address ?? '',
              date: r.signature_date ? r.signature_date.slice(0, 10) : '',
              lines: r.total_lines,
              served: parts.served,
              waiting: parts.waiting,
              missing: parts.missing,
              services: r.lines_service ?? 0,
              status: getOverallStatusLabel(r.overall_status),
              // Sem prontidão (RPC indisponível) fica em branco, não a 0.
              linesReady: rd ? rd.lines_ready : null,
              unitsServed: rd ? rd.units_served : null,
              unitsStock: rd ? rd.units_in_stock_reserved : null,
              unitsPo: rd ? rd.units_on_po : null,
              unitsMissing: rd ? rd.units_missing : null,
            };
          }),
        },
        `saidas-para-clientes_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast({
        title: `Exportado: ${rows.length} encomenda(s)`,
        description: truncated ? `Limite de ${EXPORT_MAX_PAGES * 100} encomendas atingido — refine os filtros.` : undefined,
      });
    } catch (error: any) {
      toast({ title: 'Não foi possível exportar', description: error?.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // ── Folha do detalhe (UI do protótipo) ──────────────────────────────────
  // Estado das POs ligadas às linhas, para "De onde vem" (best-effort).
  const detailPoStates = useClientOrderPoStates(
    activeCompany?.id,
    (detailData?.lines || []).map((l) => l.purchase_order_id).filter((id): id is string => !!id),
  );

  // Nova encomenda manual: abre com uma linha por escolher, como no protótipo.
  useEffect(() => {
    if (createOpen && !editingContractId) {
      setCreateItems((prev) => (prev.length === 0
        ? [{ item_type: 'product', product_id: null, service_id: null, description: '', categoria: '', sku: null, quantity: 1, unit_price: 0, vat_rate: DEFAULT_VAT_RATE, row_key: newRowKey() }]
        : prev));
    }
  }, [createOpen, editingContractId]);

  // Estado geral da encomenda: o da lista (rpc_list_client_order_documents)
  // quando a encomenda está carregada; senão a mesma regra da RPC da lista
  // aplicada às linhas do documento.
  const getDetailOverallStatus = (doc: ClientOrderDocumentDetail): string => {
    const row = orders.find((o) => o.contract_id === doc.contract_id);
    if (row?.overall_status) return row.overall_status;
    const lines = doc.lines.filter((l) => l.line_status !== 'servico');
    if (lines.length === 0) return 'totalmente_servido';
    const count = (statuses: string[]) => lines.filter((l) => statuses.includes(l.line_status)).length;
    const stock = count(['servido_por_stock', 'stock_disponivel_confirmar']);
    const awaiting = count(['a_aguardar_encomenda', 'parcial']);
    const received = count(['recebido']);
    const noSupplier = count(['sem_fornecedor']);
    if (awaiting === 0 && noSupplier === 0) return 'totalmente_servido';
    if (stock + received === 0 && noSupplier === 0 && awaiting > 0) return 'a_aguardar_encomenda';
    if (stock + received === 0 && awaiting === 0 && noSupplier > 0) return 'sem_fornecedor';
    return 'parcialmente_pendente';
  };

  // Origem do documento para o distintivo e a grelha — mesma regra de getListOrigin.
  const getDetailOrigin = (doc: ClientOrderDocumentDetail): { kind: ClientOrderOriginKind; label: string } | null => {
    const sale = salesByContract[doc.contract_id];
    if (doc.origin_type === 'direct_sale' || (!doc.origin_type && sale)) {
      const number = doc.origin_number || sale?.sale_number || sale?.proforma_number || '';
      return { kind: 'direct_sale', label: `Venda direta${number ? ` ${number}` : ''}` };
    }
    if (doc.origin_type === 'contract') {
      return { kind: 'contract', label: `Contrato ${doc.origin_number || doc.contract_number}` };
    }
    if (doc.origin_type === 'manual') return { kind: 'manual', label: 'Manual' };
    return null;
  };

  const formatEur = (value: number | null | undefined): string =>
    value === null || value === undefined
      ? '—'
      : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value));

  // Editar a partir do detalhe — mesmas condições dos botões antigos:
  // manual editável → diálogo da encomenda manual (linhas + morada);
  // com documento de origem → só morada e notas (rpc_update_client_order_header).
  const getDetailEditAction = (doc: ClientOrderDocumentDetail): (() => void) | null => {
    if (!canEditOrder) return null;
    if (doc.is_editable) return () => { void openEditOrder(); };
    if (doc.can_edit_header) return openHeaderEdit;
    return null;
  };

  // Menu ⋯ no topo da folha (MenuEc do protótipo).
  const renderDetailMenu = (doc: ClientOrderDocumentDetail) => {
    const label = doc.order_number || doc.contract_number;
    const editAction = getDetailEditAction(doc);
    const deletable = !!getDeletableOrigin(doc.contract_id, doc.origin_type);
    const sale = salesByContract[doc.contract_id];
    const items: RowActionEntry[] = [
      {
        label: 'PDF',
        icon: Printer,
        onSelect: () => handleGeneratePdf(doc.contract_id, label),
        disabled: pdfGeneratingId === doc.contract_id,
        disabledReason: 'A gerar o PDF…',
      },
      {
        label: doc.is_editable ? 'Editar encomenda' : 'Editar morada e notas',
        icon: Pencil,
        onSelect: () => editAction?.(),
        disabled: !editAction || editLoading || headerEditSaving || confirmingAll,
        disabledReason: !editAction ? 'Esta encomenda não pode ser editada' : 'A carregar…',
        permission: 'client_orders.edit',
      },
      {
        label: 'Pedir em falta ao fornecedor',
        icon: ShoppingCart,
        onSelect: () => setRequestMissingConfirmOpen(true),
        disabled: !doc.can_request_missing || requestingMissing || confirmingAll,
        disabledReason: !doc.can_request_missing ? 'Nada em falta que se possa pedir' : 'A pedir…',
        permission: ['purchase_orders.create', 'client_orders.view'],
        requireAllPermissions: true,
      },
      ...(sale?.proforma_number
        ? [{
            label: `Proforma ${sale.proforma_number}`,
            icon: Receipt,
            onSelect: () => handleDownloadProforma(doc.contract_id),
            disabled: proformaDownloadingId === doc.contract_id,
            disabledReason: 'A gerar a proforma…',
          }]
        : []),
      'separator',
      {
        label: 'Eliminar',
        icon: Trash2,
        destructive: true,
        onSelect: () => openDeleteOrder(doc.contract_id, label, doc.origin_type, doc.origin_number),
        disabled: !deletable || deleting || confirmingAll,
        disabledReason: !deletable ? 'Só manuais ou venda direta' : 'A eliminar…',
        permission: 'client_orders.delete',
      },
    ];
    // Dentro da folha (Sheet) o menu não pode ser modal — o focus trap fechava-o.
    return <RowActions items={items} modal={false} menuLabel={`Mais ações para ${label}`} />;
  };

  // Grelha de dados (Dados do protótipo). Sem "Armazém de expedição": não
  // existe nos dados.
  const renderDetailInfo = (doc: ClientOrderDocumentDetail) => {
    const label = doc.order_number || doc.contract_number;
    const origin = getDetailOrigin(doc);
    const sale = salesByContract[doc.contract_id];
    const editAction = getDetailEditAction(doc);
    const editBusy = editLoading || headerEditSaving || confirmingAll;
    // Notas: só no cabeçalho das encomendas com documento de origem (a RPC da
    // encomenda manual não as recebe) — como antes.
    const notesEdit = canEditOrder && !doc.is_editable && doc.can_edit_header ? openHeaderEdit : null;
    const items: ClientOrderInfoItem[] = [
      { label: 'Cliente', value: doc.client_name || '—' },
      {
        label: 'Encomenda · data',
        value: (
          <>
            <span className="font-mono text-[0.92em]">{label}</span>
            {' · '}
            {doc.signature_date ? new Date(doc.signature_date).toLocaleDateString('pt-PT') : '—'}
          </>
        ),
      },
      { label: 'Valor', value: <span className="tabular-nums">{formatEur(doc.total_value)}</span> },
      {
        label: 'Morada',
        value: doc.delivery_address?.trim() || '—',
        onEdit: editAction,
        editLabel: doc.is_editable ? 'Editar encomenda (morada e linhas)' : 'Editar morada de entrega',
        editDisabled: editBusy,
      },
      {
        label: 'Notas',
        value: doc.notes?.trim() || '—',
        onEdit: notesEdit,
        editLabel: 'Editar notas',
        editDisabled: editBusy,
      },
      {
        label: 'Origem',
        value: (
          <span className="flex flex-col items-start gap-1">
            <span>{origin?.label ?? '—'}</span>
            {sale?.proforma_number ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => handleDownloadProforma(doc.contract_id)}
                disabled={proformaDownloadingId === doc.contract_id}
                aria-label={`Descarregar a proforma ${sale.proforma_number}`}
              >
                {proformaDownloadingId === doc.contract_id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <FileDown className="h-3.5 w-3.5" aria-hidden="true" />}
                Proforma {sale.proforma_number}
              </Button>
            ) : null}
          </span>
        ),
      },
    ];
    return <ClientOrderInfoGrid items={items} />;
  };

  // Rodapé fixo: PDF à esquerda; "Pedir em falta ao fornecedor" e
  // "Confirmar saída (N)" à direita (N = produtos prontos, a RPC é por
  // produto). Com vários armazéns possíveis pede-se um antes de confirmar.
  const renderDetailFooter = (doc: ClientOrderDocumentDetail) => {
    const label = doc.order_number || doc.contract_number;
    const { pending, warehouses, singleEach } = getConfirmAllInfo();
    const busy = confirmingAll || confirmingLineId !== null;
    const confirmReason = !canConfirmStockExit
      ? t('clientOrders.dialog.noPermissionToConfirm')
      : pending.length === 0
        ? 'Nada pronto a sair: as linhas esperam stock ou a encomenda ao fornecedor'
        : !singleEach && !confirmAllWarehouseId
          ? 'Escolha o armazém de saída'
          : null;
    const requestReason = !canRequestMissing
      ? 'Sem permissão: requer encomendas a fornecedor (criar)'
      : !doc.can_request_missing
        ? 'Nada em falta que se possa pedir'
        : null;
    const missingCount = asQty(doc.missing_lines_count);
    return (
      <>
        <div className="mr-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => handleGeneratePdf(doc.contract_id, label)}
            disabled={pdfGeneratingId === doc.contract_id}
          >
            {pdfGeneratingId === doc.contract_id
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Printer className="mr-2 h-4 w-4" aria-hidden="true" />}
            PDF
          </Button>
        </div>
        <span title={requestReason ?? undefined} className="inline-flex">
          <Button
            variant="outline"
            onClick={() => setRequestMissingConfirmOpen(true)}
            disabled={!!requestReason || requestingMissing || confirmingAll}
          >
            {requestingMissing
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />}
            Pedir em falta ao fornecedor{missingCount > 0 && !requestReason ? ` (${missingCount})` : ''}
          </Button>
        </span>
        {canConfirmStockExit && pending.length > 0 && !singleEach && (
          <Select value={confirmAllWarehouseId} onValueChange={setConfirmAllWarehouseId} disabled={busy}>
            <SelectTrigger className="h-10 w-[200px] text-xs" aria-label={t('clientOrders.dialog.confirmAllWarehouse')}>
              <SelectValue placeholder={t('clientOrders.dialog.confirmAllWarehouse')} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((wh) => (
                <SelectItem key={wh.warehouse_id} value={wh.warehouse_id}>
                  {wh.warehouse_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span title={confirmReason ?? undefined} className="inline-flex">
          <Button onClick={handleConfirmAllStockExits} disabled={!!confirmReason || busy}>
            {confirmingAll
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Truck className="mr-2 h-4 w-4" aria-hidden="true" />}
            Confirmar saída ({pending.length})
          </Button>
        </span>
      </>
    );
  };

  // "Confirmar saída" por linha (substitui a checkbox): mesma lógica de
  // handleChecklistCheckboxChange — 1 armazém confirma logo; 2+ mostram o
  // Select do armazém e "Confirmar". Sem permissão ou sem armazém com stock
  // suficiente fica desativado com o motivo.
  const renderStockExitAction = (line: ClientOrderDocumentLine) => {
    const key = lineKey(line);
    const group = line.product_id && detailData ? getProductExitGroup(line.product_id, detailData.lines) : null;
    const warehouses = group?.warehouses ?? [];
    if (confirmingLineId === key || confirmingAll) {
      return <Loader2 key="exit" className="h-4 w-4 animate-spin text-muted-foreground" aria-label="A confirmar a saída" />;
    }
    const reason = !canConfirmStockExit
      ? t('clientOrders.dialog.noPermissionToConfirm')
      : warehouses.length === 0
        ? (group && group.quantity > 0
          ? t('clientOrders.dialog.noWarehouseEnoughStock', { qty: formatDiagnosticNumber(group.quantity) })
          : t('clientOrders.dialog.noWarehouseAvailable'))
        : null;
    if (reason) {
      return (
        <Tooltip key="exit">
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0} aria-label={`Confirmar saída: ${reason}`}>
              <Button size="sm" className="h-7 px-2 text-xs" disabled tabIndex={-1}>
                Confirmar saída
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      );
    }
    const isActive = checklistActiveLineIds.has(key);
    const selectedWarehouseId = selectedWarehouseByLine[key];
    if (warehouses.length > 1 && isActive) {
      return (
        <div key="exit" className="flex items-center gap-1.5">
          <Select
            value={selectedWarehouseId || ""}
            onValueChange={(value) => setSelectedWarehouseByLine((prev) => ({ ...prev, [key]: value }))}
          >
            <SelectTrigger className="h-8 w-[190px] text-xs" aria-label={t('clientOrders.dialog.selectWarehouse')}>
              <SelectValue placeholder={t('clientOrders.dialog.selectWarehouse')} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((wh) => (
                <SelectItem key={wh.warehouse_id} value={wh.warehouse_id}>
                  {wh.warehouse_name} ({formatDiagnosticNumber(asQty(wh.quantity))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            disabled={!selectedWarehouseId || confirmingLineId !== null}
            onClick={() => selectedWarehouseId && handleConfirmStockExit(line, selectedWarehouseId)}
          >
            {t('clientOrders.dialog.confirmStockExit')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Cancelar a escolha do armazém"
            onClick={() => handleChecklistCheckboxChange(line, false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      );
    }
    return (
      <Button
        key="exit"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => handleChecklistCheckboxChange(line, true)}
        disabled={confirmingLineId !== null}
      >
        Confirmar saída
      </Button>
    );
  };

  // Ações por linha: confirmar saída, reverter saída (só saídas manuais) e
  // pedir em falta (abre a mesma confirmação do rodapé — a RPC é por encomenda).
  // Abrir a PO é a ligação na coluna "De onde vem".
  const renderLineActions = (line: ClientOrderDocumentLine) => {
    const nodes: ReactElement[] = [];
    if (isStockExitConfirmable(line)) nodes.push(renderStockExitAction(line));
    if (isStockExitRevertible(line) && canConfirmStockExit) {
      nodes.push(
        <Button
          key="revert"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setRevertTarget(line)}
          disabled={reverting || confirmingAll}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Reverter saída
        </Button>,
      );
    }
    const missingHere = line.item_type !== 'service'
      && (line.line_status === 'sem_fornecedor' || asQty(line.qty_missing) > 0)
      && line.has_preferred_supplier !== false;
    if (missingHere && detailData?.can_request_missing && canRequestMissing) {
      nodes.push(
        <Button
          key="missing"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setRequestMissingConfirmOpen(true)}
          disabled={requestingMissing || confirmingAll}
        >
          Pedir em falta
        </Button>,
      );
    }
    return nodes.length > 0 ? <div className="flex flex-wrap items-center justify-end gap-1">{nodes}</div> : null;
  };

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
          <div>
            <h1 className="text-3xl font-bold">{t('clientOrders.title')}</h1>
            <p className="text-muted-foreground">{t('clientOrders.description')}</p>
          </div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <InventoryPageHeader
          area="warehouse"
          title="Saídas para clientes"
          description="Encomendas Clientes: o que existe em stock é reservado (FIFO) e sai do armazém de expedição; o que falta vai para a encomenda ao fornecedor preferencial. Requer inventário + contratos."
          actions={
            <>
              {/* A página já exige client_orders.view (ProtectedRoute/menu);
                  não existe client_orders.export (nem nas migrations nem no
                  frontend) — mantém-se client_orders.view. */}
              <PermissionGate permission="client_orders.view">
                <Button variant="outline" onClick={handleExport} disabled={exporting}>
                  {exporting
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Download className="w-4 h-4 mr-2" />}
                  Exportar
                </Button>
              </PermissionGate>
              {/* Criar uma encomenda manual exige client_orders.create
                  (permissão própria; já não depende de
                  client_contracts.create, mesmo criando por baixo um contrato
                  sintético assinado). */}
              <PermissionGate permission="client_orders.create">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova encomenda manual
                </Button>
              </PermissionGate>
            </>
          }
        />

        <ClientOrderKpis
          readyToShip={readyToShip}
          counts={statusSummary?.byStatus ?? null}
          truncated={statusSummary?.truncated}
          activeStatus={statusFilter}
          readyActive={urlReady}
          onSelectStatus={applyStatusFilter}
          onSelectReady={() => applyReadyFilter(true)}
        />

        <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Nº EC, contrato, VD ou cliente"
                aria-label="Pesquisar encomendas clientes"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-[13px]">
              De
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
                title={t('clientOrders.filters.dateFrom')}
                aria-label={t('clientOrders.filters.dateFrom')}
              />
            </label>
            <label className="inline-flex items-center gap-1.5 text-[13px]">
              Até
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
                title={t('clientOrders.filters.dateTo')}
                aria-label={t('clientOrders.filters.dateTo')}
              />
            </label>
            {(searchTerm || statusFilter !== "all" || dateFrom || dateTo || urlReady) && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  applyStatusFilter("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                {t('clientOrders.filters.clear')}
              </Button>
            )}
          </div>
          <FilterPills<ClientOrderStatusFilter | 'ready'>
            ariaLabel="Estado"
            value={statusFilter as ClientOrderStatusFilter}
            onChange={(value) => {
              if (value !== 'ready') applyStatusFilter(value);
            }}
            options={[
              {
                value: 'all',
                label: 'Todas',
                count: statusSummary?.total ?? null,
                pressed: !urlReady && statusFilter === 'all',
              },
              {
                value: 'ready',
                label: 'Prontas a expedir',
                count: readyToShip,
                pressed: urlReady,
                onSelect: () => applyReadyFilter(!urlReady),
                hint: 'Com linhas com stock reservado, prontas a sair do armazém.',
              },
              ...([
                'totalmente_servido',
                'parcialmente_pendente',
                'a_aguardar_encomenda',
                'sem_fornecedor',
              ] as const).map((status): FilterPillOption<ClientOrderStatusFilter | 'ready'> => ({
                value: status,
                label: getOverallStatusLabel(status),
                count: statusSummary ? statusSummary.byStatus[status] : null,
                pressed: !urlReady && statusFilter === status,
              })),
            ]}
          />
          <ClientOrderProgressLegend />
        </div>

        {urlReady && readyTruncated && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">
            Lista de prontas a expedir incompleta: foram lidas as {READY_MAX_PAGES * 100} encomendas mais recentes.
            Use as datas ou a pesquisa para encontrar as restantes.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nº EC · origem</TableHead>
                <TableHead>{t('clientOrders.table.client')}</TableHead>
                <TableHead>{t('clientOrders.table.deliveryAddress')}</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">{t('clientOrders.table.lines')}</TableHead>
                <TableHead className="w-[190px]">Progresso</TableHead>
                <TableHead>{t('clientOrders.table.status')}</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">{t('clientOrders.table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">{t('clientOrders.loading')}</TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Sem encomendas com estes filtros
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const orderLabel = order.order_number || order.contract_number;
                  const origin = getListOrigin(order);
                  const deletable = !!getDeletableOrigin(order.contract_id, order.origin_type);
                  const sale = salesByContract[order.contract_id];
                  return (
                    <TableRow
                      key={order.contract_id}
                      className="cursor-pointer"
                      onClick={() => openDetail(order.contract_id)}
                    >
                      <TableCell className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <b className="whitespace-nowrap font-mono text-[0.92em]">{orderLabel}</b>
                          {origin ? <ClientOrderOriginChip kind={origin.kind} label={origin.label} /> : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">{order.client_name || '-'}</TableCell>
                      <TableCell className="align-top">
                        {order.delivery_address?.trim() ? (
                          <small className="block max-w-[16rem] truncate text-xs" title={order.delivery_address}>
                            {order.delivery_address}
                          </small>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">
                        {order.signature_date ? new Date(order.signature_date).toLocaleDateString('pt-PT') : '-'}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">{order.total_lines}</TableCell>
                      <TableCell className="align-top">
                        <ClientOrderProgress counts={order} readiness={readiness?.[order.contract_id] ?? null} />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col items-start gap-1">
                          <InventoryStatusBadge tone={OVERALL_STATUS_TONE[order.overall_status] ?? 'warn'}>
                            {getOverallStatusLabel(order.overall_status)}
                          </InventoryStatusBadge>
                          {(readiness?.[order.contract_id]?.lines_ready ?? 0) > 0 ? (
                            <InventoryStatusBadge tone="violet">
                              {readiness?.[order.contract_id]?.lines_ready} pronta(s) a sair
                            </InventoryStatusBadge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <ClientOrderRowActions
                          orderLabel={orderLabel}
                          onView={() => openDetail(order.contract_id)}
                          onPdf={() => handleGeneratePdf(order.contract_id, orderLabel)}
                          pdfBusy={pdfGeneratingId === order.contract_id}
                          edit={order.origin_type === 'manual'
                            ? { onSelect: () => openDetailThen(order.contract_id, 'edit') }
                            : null}
                          onRequestMissing={() => openDetailThen(order.contract_id, 'requestMissing')}
                          proforma={sale?.proforma_number
                            ? {
                                number: sale.proforma_number,
                                onSelect: () => handleDownloadProforma(order.contract_id),
                                busy: proformaDownloadingId === order.contract_id,
                              }
                            : null}
                          remove={{
                            deletable,
                            busy: deleting,
                            onSelect: () => openDeleteOrder(order.contract_id, orderLabel, order.origin_type, order.origin_number),
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5 text-[12.5px] text-muted-foreground">
          <span>{orders.length} encomenda(s){hasMore && !loading ? ' carregada(s)' : ''}</span>
        </div>

        <div ref={loadMoreRef} className="py-4 flex justify-center">
          {loadingMore && (
            <div className="text-sm text-muted-foreground">{t('clientOrders.loadingMore')}</div>
          )}
          {!hasMore && !loading && orders.length > 0 && (
            <div className="text-sm text-muted-foreground">{t('clientOrders.allLoaded')}</div>
          )}
        </div>
      </div>

      <ClientOrderDetailSheet
        open={detailOpen}
        onOpenChange={(o) => {
          // Não fechar a meio de "Confirmar saída de todas".
          if (!o && confirmingAll) return;
          setDetailOpen(o);
        }}
        crumbs="Armazém › Saídas para clientes"
        title={detailData ? (detailData.order_number || detailData.contract_number) : 'Encomenda Cliente'}
        badges={detailData && !detailLoading ? (() => {
          const status = getDetailOverallStatus(detailData);
          const origin = getDetailOrigin(detailData);
          const ready = detailData.lines.filter(isStockExitConfirmable).length;
          return (
            <>
              <InventoryStatusBadge tone={OVERALL_STATUS_TONE[status] ?? 'warn'}>{getOverallStatusLabel(status)}</InventoryStatusBadge>
              {origin ? <ClientOrderOriginChip kind={origin.kind} label={origin.label} /> : null}
              {ready > 0 ? <InventoryStatusBadge tone="violet">{ready} linha(s) pronta(s) a sair</InventoryStatusBadge> : null}
            </>
          );
        })() : null}
        topActions={detailData && !detailLoading ? renderDetailMenu(detailData) : null}
        info={detailData && !detailLoading ? renderDetailInfo(detailData) : null}
        footer={detailData && !detailLoading ? renderDetailFooter(detailData) : null}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-10">
            <OlyviaLoader size={32} />
          </div>
        ) : detailData ? (
          <>
            {/* Diagnóstico da obra — só leitura, colapsável. Nada quando a
                encomenda não tem diagnóstico (vendas diretas, manuais). */}
            <ClientOrderDiagnosticSection needs={detailData.diagnostic ?? []} tf={tf} />

            <ClientOrderLineStateLegend />

            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="w-[260px]">De onde vem</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">{t('clientOrders.table.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t('clientOrders.dialog.noLines')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailData.lines.map((line) => {
                      const isProductLine = line.item_type !== 'service' && !!line.product_id;
                      const served = asQty(line.qty_served);
                      const reserved = asQty(line.qty_reserved);
                      // Notas de anulação na PO ("não vou receber o resto").
                      const extra: ReactElement[] = [];
                      if (line.line_status === 'nao_recebido_anulado') {
                        extra.push(
                          <div key="void" className="text-muted-foreground">{getBaseLineStatusLabel(line)}</div>,
                        );
                      } else {
                        const suffix = getCancelledSuffix(line).replace(/^ · /, '');
                        if (suffix) extra.push(<div key="cancel" className="text-muted-foreground">{suffix}</div>);
                      }
                      if (!hasDocumentCancellations(line) && poCancellationsByLine?.contractId === detailData.contract_id) {
                        (poCancellationsByLine.byLine[lineKey(line)] || []).forEach((c) => {
                          extra.push(
                            <div key={c.id} className="text-muted-foreground" title={c.notes || undefined}>
                              {formatBaseQty(c.units)} anulado(s){c.poNumber ? ` na ${c.poNumber}` : ''} — {PO_CANCELLATION_REASON_LABELS[c.reason] || c.reason}
                            </div>,
                          );
                        });
                      }
                      return (
                        <TableRow key={lineKey(line)}>
                          <TableCell className="whitespace-nowrap align-top font-mono text-[0.92em]">
                            {line.product_sku || line.service_sku || '—'}
                          </TableCell>
                          <TableCell className="align-top">{line.product_name || line.service_name || '—'}</TableCell>
                          <TableCell className="text-right align-top">
                            <div className="inline-flex items-center justify-end gap-1">
                              <b className="tabular-nums">{line.quantity}</b>
                              {line.line_locked ? (
                                <span
                                  className="inline-flex text-muted-foreground"
                                  title="Linha trancada: já saiu de stock ou foi pedida ao fornecedor"
                                >
                                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span className="sr-only">Linha trancada</span>
                                </span>
                              ) : null}
                            </div>
                            {isProductLine && (line.qty_served != null || line.qty_reserved != null) ? (
                              <div className="whitespace-nowrap text-xs text-muted-foreground">
                                servido {formatBaseQty(served)}{reserved > 0 ? ` · reservado ${formatBaseQty(reserved)}` : ''}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-[12.5px]">
                            <ClientOrderLineSource
                              line={line}
                              poState={line.purchase_order_id ? detailPoStates[line.purchase_order_id] ?? null : null}
                              onOpenPo={line.purchase_order_id ? () => openPurchaseOrder(line) : null}
                              extra={extra.length > 0 ? <>{extra}</> : undefined}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <ClientOrderLineStateBadge
                              state={clientOrderLineState(line.line_status, line.has_preferred_supplier)}
                              title={getLineStatusLabel(line)}
                            />
                          </TableCell>
                          <TableCell className="text-right align-top">{renderLineActions(line)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Regra: cada produto reserva o stock livre (stock − reservas das encomendas assinadas antes, por ordem
                de assinatura); o que falta vai para a encomenda ao fornecedor preferencial, que a pode receber no
                portal. A saída confirma-se aqui, por produto, a partir de um armazém com stock suficiente; só as
                saídas confirmadas aqui se podem estornar. A receção da encomenda ao fornecedor serve esta encomenda.
              </span>
            </p>
          </>
        ) : null}
      </ClientOrderDetailSheet>

      {/* Confirmação do estorno de uma saída de stock manual */}
      <AlertDialog
        open={revertTarget !== null}
        onOpenChange={(isOpen) => { if (!isOpen && !reverting) setRevertTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clientOrders.dialog.revertTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {revertTarget && (revertTarget.product_name || revertTarget.service_name)
                ? `${revertTarget.product_name || revertTarget.service_name} — `
                : ''}
              {t('clientOrders.dialog.revertDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting}>{t('clientOrders.create.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverting}
              onClick={(e) => {
                // Mantém o diálogo aberto até a RPC responder.
                e.preventDefault();
                handleRevertStockExit();
              }}
            >
              {reverting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('clientOrders.dialog.revert')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação do pedido do material em falta ao fornecedor */}
      <AlertDialog
        open={requestMissingConfirmOpen}
        onOpenChange={(isOpen) => { if (!isOpen && !requestingMissing) setRequestMissingConfirmOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clientOrders.requestMissing.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('clientOrders.requestMissing.confirmDescription', {
                units: formatDiagnosticNumber(asQty(detailData?.missing_units_total)),
                lines: asQty(detailData?.missing_lines_count),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={requestingMissing}>{t('clientOrders.create.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={requestingMissing}
              onClick={(e) => {
                // Mantém o diálogo aberto até a RPC responder.
                e.preventDefault();
                handleRequestMissing();
              }}
            >
              {requestingMissing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('clientOrders.requestMissing.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação da eliminação de uma encomenda (manual ou venda direta) */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleting) {
            setDeleteTarget(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar encomenda {deleteTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              A encomenda é anulada: o stock já saído volta ao armazém, as reservas são libertadas e os
              pedidos a fornecedor pendentes são cancelados.
              {deleteTarget?.origin === 'direct_sale' && (
                <>
                  {' '}
                  {deleteTarget.sale_number
                    ? `A venda direta ${deleteTarget.sale_number} passa a Cancelada.`
                    : 'A venda direta ligada passa a Cancelada.'}
                </>
              )}
              {' '}A encomenda vai para o Lixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-order-reason">Motivo *</Label>
            <Textarea
              id="delete-order-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Indique o motivo da eliminação"
              rows={3}
              disabled={deleting}
              aria-invalid={deleteReason.length > 0 && !deleteReasonValid}
              aria-describedby="delete-order-reason-hint"
            />
            <p id="delete-order-reason-hint" className="text-xs text-muted-foreground">
              Mínimo 3 caracteres.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('clientOrders.create.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting || !deleteReasonValid}
              onClick={(e) => {
                // Mantém o diálogo aberto até a RPC responder (e em caso de erro).
                e.preventDefault();
                handleDeleteOrder();
              }}
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edição do cabeçalho — encomendas com documento de origem */}
      <Dialog
        open={headerEditOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && !headerEditSaving) closeHeaderEdit();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('clientOrders.dialog.editOrder')}</DialogTitle>
            {detailData && (
              <DialogDescription>
                {tf(
                  'clientOrders.headerEdit.description',
                  'Esta encomenda vem de {origin}: só a morada de entrega e as notas podem ser alteradas.',
                ).replace('{origin}', describeOrigin(detailData))}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <DeliveryAddressPicker
              entityId={deliveryEntityId}
              options={deliveryOptions}
              optionsLoading={deliveryOptionsLoading}
              choice={deliveryChoice}
              onChoiceChange={handleDeliveryChoiceChange}
              showNewForm={showNewDeliveryForm}
              onShowNewFormChange={setShowNewDeliveryForm}
              onAdded={handleDeliveryAddressAdded}
              value={headerDeliveryAddress}
              onValueChange={setHeaderDeliveryAddress}
              textareaId="client_order_header_delivery_address"
              newFormIdPrefix="client_order_header_new_delivery"
              label={t('clientOrders.dialog.deliveryAddress')}
              disabled={headerEditSaving}
              canAddNew={canEditOrder}
              t={t}
            />
            {detailData && 'delivery_address_override' in detailData && (
              <p className="-mt-2 text-xs text-muted-foreground">
                {detailData.delivery_address_override == null
                  ? tf(
                      'clientOrders.headerEdit.addressDefaultHint',
                      'A morada mostrada é a da obra/cliente; escolha ou escreva outra para a fixar nesta encomenda.',
                    )
                  : tf(
                      'clientOrders.headerEdit.addressClearHint',
                      'Deixe vazio para usar a morada por omissão.',
                    )}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="client_order_header_notes">{t('clientOrders.create.notes')}</Label>
              <Textarea
                id="client_order_header_notes"
                value={headerNotes}
                onChange={(e) => setHeaderNotes(e.target.value)}
                rows={3}
                disabled={headerEditSaving}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeHeaderEdit} disabled={headerEditSaving}>
              {t('clientOrders.create.cancel')}
            </Button>
            <Button type="button" onClick={handleSaveHeader} disabled={headerEditSaving}>
              {headerEditSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {headerEditSaving ? t('clientOrders.edit.submitting') : t('clientOrders.edit.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Criação manual de Encomenda Cliente (e edição, com editingContractId) */}
      <Dialog
        open={createOpen}
        onOpenChange={(isOpen) => {
          if (isOpen) setCreateOpen(true);
          else if (!creating) closeCreateDialog();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContractId ? `Editar ${editingOrderNumber || ''}` : 'Nova encomenda manual'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Cliente, morada de entrega, notas e linhas da encomenda manual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                {editingContractId ? (
                  // Em edição o cliente não muda (o contrato já está assinado para ele).
                  <Input value={editingClientName || '-'} disabled readOnly aria-label="Cliente" />
                ) : (
                  <EntitySearchInput
                    value={createClient}
                    onChange={handleCreateClientChange}
                    searchTypes={["client"]}
                    placeholder={t('clientOrders.create.clientPlaceholder')}
                    disabled={creating}
                  />
                )}
              </div>

              <DeliveryAddressPicker
                entityId={deliveryEntityId}
                options={deliveryOptions}
                optionsLoading={deliveryOptionsLoading}
                choice={deliveryChoice}
                onChoiceChange={handleDeliveryChoiceChange}
                showNewForm={showNewDeliveryForm}
                onShowNewFormChange={setShowNewDeliveryForm}
                onAdded={handleDeliveryAddressAdded}
                value={createDeliveryAddress}
                onValueChange={setCreateDeliveryAddress}
                textareaId="client_order_delivery_address"
                newFormIdPrefix="client_order_new_delivery"
                label="Morada de entrega"
                disabled={creating}
                canAddNew={canAddDeliveryInManualDialog}
                t={t}
              />

              {/* Data da encomenda (start_date do contrato sintético): fica no
                  lugar do "Armazém de expedição" do protótipo, que não existe
                  nos dados. Só se define na criação. */}
              <div className="space-y-2">
                <Label htmlFor="client_order_date">Data *</Label>
                <Input
                  id="client_order_date"
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  disabled={creating || !!editingContractId}
                />
              </div>

              {/* As notas só se definem na criação — a RPC de edição não as recebe. */}
              {!editingContractId && (
                <div className="space-y-2">
                  <Label htmlFor="client_order_notes">Notas</Label>
                  <Textarea
                    id="client_order_notes"
                    value={createNotes}
                    onChange={(e) => setCreateNotes(e.target.value)}
                    rows={2}
                    disabled={creating}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <b className="block text-[13px]">Linhas (quantidade em unidades inteiras)</b>
              {createItems.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('clientOrders.create.noItems')}</p>
              )}
              {createItems.map((item, index) => {
                const integerQty = itemRequiresInteger(item);
                // Linha trancada (já servida/pedida): só leitura.
                const rowDisabled = creating || !!item.locked;
                // Produto de linha existente, serviço ou componente de pack do
                // catálogo: não se troca aqui (remove-se e acrescenta-se outra).
                const fixedItem = !!item.locked || !!item.quote_line_id || !!item.service_id;
                const hasItem = !!item.product_id || !!item.service_id;
                const itemLabel = hasItem ? `${item.sku ? `${item.sku} — ` : ''}${item.description}` : '';
                return (
                  <div key={item.quote_line_id || item.row_key || `new-${index}`} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0 flex-1">
                        {fixedItem ? (
                          <div
                            className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${item.locked ? 'bg-muted/40' : 'bg-muted/20'}`}
                            title={item.quote_line_id ? 'Produto de linha existente: para trocar, remova a linha e acrescente outra' : undefined}
                          >
                            <span className="min-w-0 truncate">{itemLabel || '—'}</span>
                            {item.item_type === 'service' && <InventoryStatusBadge>Serviço</InventoryStatusBadge>}
                          </div>
                        ) : (
                          <ClientOrderProductPicker
                            organizationId={activeCompany?.id}
                            valueLabel={itemLabel}
                            selectedId={item.product_id}
                            onSelect={(product) => handleCreateItemProductSelect(index, product)}
                            disabled={creating}
                            ariaLabel={`Produto da linha ${index + 1}`}
                          />
                        )}
                      </div>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleCreateItemChange(index, 'quantity', e.target.value)}
                        className="w-[90px]"
                        min="0"
                        step={integerQty ? 1 : 0.01}
                        inputMode={integerQty ? 'numeric' : 'decimal'}
                        disabled={rowDisabled}
                        aria-label={`Quantidade da linha ${index + 1}`}
                      />
                      <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => handleCreateItemChange(index, 'unit_price', e.target.value)}
                        className="w-[110px]"
                        min="0"
                        step="0.01"
                        disabled={rowDisabled}
                        aria-label={`Preço unitário da linha ${index + 1} (€)`}
                        title="Preço unitário (€, sem IVA)"
                      />
                      {item.locked ? (
                        <span title={t('clientOrders.edit.lockedNote')} className="inline-flex">
                          <InventoryStatusBadge>
                            <Lock className="h-3 w-3" aria-hidden="true" /> Trancada
                          </InventoryStatusBadge>
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => handleRemoveCreateItem(index)}
                        aria-label={`Remover linha ${index + 1}`}
                        title={item.locked ? t('clientOrders.edit.lockedNote') : t('clientOrders.create.removeItem')}
                        disabled={rowDisabled}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {hasItem && (
                      <p className="pl-1 text-xs text-muted-foreground">
                        {item.categoria ? `${item.categoria} · ` : ''}
                        {formatEur(item.unit_price)}/un · IVA {item.vat_rate}%
                        {item.locked ? <span className="text-amber-700 dark:text-warning"> · {t('clientOrders.edit.lockedNote')}</span> : null}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleAddBlankCreateItem} disabled={creating}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Adicionar linha
                </Button>
                {/* Serviços, packs (expandidos nos componentes) e produtos com
                    atributos: o seletor completo do catálogo dos orçamentos. */}
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowItemsDialog(true)} disabled={creating}>
                  Catálogo completo (serviços, packs)…
                </Button>
              </div>
            </div>

            <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Ao gravar, cada produto reserva o stock livre (stock − reservas das encomendas anteriores); o que
                falta vai para a encomenda ao fornecedor preferencial. Linhas já servidas ou pedidas ao fornecedor
                ficam trancadas. Os packs entram pelos seus componentes. Linhas sem produto escolhido não se gravam.
              </span>
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <span className="text-sm text-muted-foreground">
                {(() => {
                  const totals = getCreateTotals();
                  return <>Total {formatEur(totals.subtotal)} s/ IVA · <b className="text-foreground">{formatEur(totals.total)}</b> c/ IVA</>;
                })()}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeCreateDialog} disabled={creating}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={editingContractId ? handleUpdateOrder : handleCreateOrder}
                  disabled={creating}
                >
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {creating ? 'A gravar…' : 'Gravar'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Seletor de artigos partilhado com os Orçamentos: carrega o catálogo
          do lado do servidor (as props products/services existem só por
          compatibilidade de API e não são usadas lá dentro — ver
          InlineQuoteBuilder.tsx, que as passa igualmente vazias/derivadas). */}
      <AddItemsDialog
        open={showItemsDialog}
        onOpenChange={setShowItemsDialog}
        onAddItems={handleAddCatalogItems}
        products={[]}
        services={[]}
        title="Adicionar Itens à Encomenda"
        description="Selecione produtos ou serviços para adicionar à encomenda"
      />
    </>
  );
};

export default ClientOrders;
