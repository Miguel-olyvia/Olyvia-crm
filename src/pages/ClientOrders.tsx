import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { EntitySearchInput, type EntitySearchResult } from "@/components/EntitySearchInput";
import { AddItemsDialog } from "@/components/quote/AddItemsDialog";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Eye, FileDown, ExternalLink, Loader2, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { generateProformaPdfBlob, downloadBlob } from "@/utils/generateProformaPdfBlob";
import { pdf } from '@react-pdf/renderer';
import { ClientOrderDocumentPDF } from "@/components/ClientOrderDocumentPDF";

// Fase 5.0F do plano de inventário: página só-leitura "Encomendas Clientes" —
// 1 linha por Contrato assinado, derivada ao momento da leitura de
// client_contracts + quote_lines + stock_movements + purchase_orders (sem
// tabela nova, sem trigger nova). Consome os 2 RPCs de leitura já aplicados
// em produção (migration 20261115160000_client_order_documents_read_rpcs.sql):
// rpc_list_client_order_documents (listagem) e rpc_get_client_order_document
// (detalhe/PDF). Ambos exigem inventory.view E client_contracts.view em
// simultâneo — mesma dupla verificação replicada no frontend via
// ProtectedRoute (App.tsx) e no item de menu (menuConfig.ts).
//
// Padrão de paginação: infinite-scroll com .range() e SEM total_count (a RPC
// não devolve contagem total, de propósito — mesmo padrão já usado em
// Stocks.tsx: hasMore inferido de "a página veio cheia?").

const PAGE_SIZE = 30;

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
}

interface ClientOrderDocumentRow {
  contract_id: string;
  contract_number: string;
  client_name: string | null;
  signature_date: string | null;
  total_lines: number;
  lines_from_stock: number;
  lines_awaiting_order: number;
  lines_received: number;
  lines_no_supplier: number;
  overall_status: string;
}

// 20261130070000: armazém(ns) com stock deste produto, só preenchido nas
// linhas com line_status === 'stock_disponivel_confirmar' (ordenado por
// quantity desc pela RPC). `rpc_get_client_order_document` devolve jsonb, pelo
// que `supabase gen types` gera sempre `Returns: Json` (opaco) — a tipagem
// desta estrutura tem de continuar manual, não é um `as any` temporário.
interface ClientOrderAvailableWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
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
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'stock_disponivel_confirmar' | 'sem_fornecedor' | 'servico';
  stock_movement_id: string | null;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  available_warehouses: ClientOrderAvailableWarehouse[] | null;
}

// Origem de uma encomenda que nasceu de uma venda direta (Fase 5). Ausente
// quando a encomenda veio de uma proposta assinada ou foi criada à mão.
interface DirectSaleOrigin {
  direct_sale_id: string;
  sale_number: string | null;
  proforma_number: string | null;
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

const ClientOrders = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfirmStockExit = hasPermission('inventory.edit') && hasPermission('client_orders.confirm_stock_exit');

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ClientOrderDocumentDetail | null>(null);
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
  const [createItems,setCreateItems] = useState<ManualClientOrderItem[]>([]);
  const [showItemsDialog, setShowItemsDialog] = useState(false);

  // Checklist de saída de stock (linhas stock_disponivel_confirmar):
  // - checklistActiveLineIds: linhas onde o checkbox foi marcado E há mais de
  //   1 armazém disponível, pelo que o Select + botão "Confirmar" ficam
  //   visíveis à espera de escolha.
  // - selectedWarehouseByLine: armazém escolhido no Select acima, por
  //   quote_line_id.
  // - confirmingLineId: linha atualmente a chamar
  //   rpc_confirm_client_order_stock_exit (mostra spinner em vez do checkbox).
  const [checklistActiveLineIds, setChecklistActiveLineIds] = useState<Set<string>>(new Set());
  const [selectedWarehouseByLine, setSelectedWarehouseByLine] = useState<Record<string, string>>({});
  const [confirmingLineId, setConfirmingLineId] = useState<string | null>(null);

  // Filtros num ref (não recria loadOrders a cada keystroke) — mesmo truque
  // já usado em Stocks.tsx para manter a identidade do IntersectionObserver
  // estável.
  const filtersRef = useRef({
    activeCompanyId: activeCompany?.id,
    debouncedSearchTerm,
    statusFilter,
    dateFrom,
    dateTo,
  });
  useEffect(() => {
    filtersRef.current = { activeCompanyId: activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo };
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo]);

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
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, toast, loadOrigins]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    loadOrders(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter, dateFrom, dateTo]);

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
      link.download = `EncomendaCliente_${contractNumber || contractId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: t('clientOrders.toast.pdfSuccess') });
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.pdfError'), description: error.message, variant: "destructive" });
    } finally {
      setPdfGeneratingId(null);
    }
  };

  // Checklist de saída de stock (fase pós-20261130070000).
  const handleConfirmStockExit = async (line: ClientOrderDocumentLine, warehouseId: string) => {
    if (!detailData) return;
    setConfirmingLineId(line.quote_line_id);
    try {
      const { error } = await supabase.rpc('rpc_confirm_client_order_stock_exit', {
        p_contract_id: detailData.contract_id,
        p_product_id: line.product_id,
        p_quantity: line.quantity,
        p_warehouse_id: warehouseId,
      });
      if (error) throw error;

      toast({ title: t('clientOrders.dialog.stockExitSuccess') });
      setChecklistActiveLineIds((prev) => {
        const next = new Set(prev);
        next.delete(line.quote_line_id);
        return next;
      });
      setSelectedWarehouseByLine((prev) => {
        const next = { ...prev };
        delete next[line.quote_line_id];
        return next;
      });

      // Padrão já usado no resto da página (openDetail): re-buscar o
      // documento inteiro é a forma mais simples e segura de refletir o novo
      // line_status, em vez de tentar recalcular a cascata no frontend.
      const refreshed = await fetchDetail(detailData.contract_id);
      setDetailData(refreshed);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.stockExitError'), description: error.message, variant: "destructive" });
    } finally {
      setConfirmingLineId(null);
    }
  };

  const handleChecklistCheckboxChange = (line: ClientOrderDocumentLine, checked: boolean) => {
    const warehouses = line.available_warehouses || [];

    if (!checked) {
      setChecklistActiveLineIds((prev) => {
        const next = new Set(prev);
        next.delete(line.quote_line_id);
        return next;
      });
      setSelectedWarehouseByLine((prev) => {
        const next = { ...prev };
        delete next[line.quote_line_id];
        return next;
      });
      return;
    }

    if (warehouses.length === 1) {
      handleConfirmStockExit(line, warehouses[0].warehouse_id);
      return;
    }

    if (warehouses.length > 1) {
      setChecklistActiveLineIds((prev) => new Set(prev).add(line.quote_line_id));
    }
  };

  const openPurchaseOrder = (purchaseOrderId: string) => {
    // Mesmo padrão de cross-link já usado em ClientContracts.tsx
    // (?open=<id>) — replicado em PurchaseOrders.tsx para este caso.
    navigate(`/purchase-orders?open=${purchaseOrderId}`);
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

  const getLineStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      servido_por_stock: "bg-success/10 text-success",
      recebido: "bg-teal-500/10 text-teal-600",
      a_aguardar_encomenda: "bg-info/10 text-info",
      stock_disponivel_confirmar: "bg-warning/10 text-warning",
      sem_fornecedor: "bg-destructive/10 text-destructive",
      // Neutro de propósito: uma linha de serviço não tem stock nem fornecedor,
      // por isso não é uma pendência. Sem esta entrada caía no fallback
      // vermelho e parecia um problema por resolver.
      servico: "bg-muted text-muted-foreground",
    };
    return colors[status] || colors.sem_fornecedor;
  };

  const getLineStatusLabel = (line: ClientOrderDocumentLine) => {
    switch (line.line_status) {
      case 'servido_por_stock':
        return t('clientOrders.lineStatus.servedByStock');
      case 'recebido':
        return t('clientOrders.lineStatus.received');
      case 'a_aguardar_encomenda':
        return t('clientOrders.lineStatus.awaitingOrder', { number: line.purchase_order_number || '' });
      case 'stock_disponivel_confirmar':
        return t('clientOrders.lineStatus.stockAvailableConfirm');
      case 'sem_fornecedor':
        return t('clientOrders.lineStatus.noSupplier');
      case 'servico':
        return t('clientOrders.lineStatus.service');
      default:
        return line.line_status;
    }
  };

  // Indicador "Produtos Disponíveis" no cabeçalho do diálogo — recalculado a
  // cada render a partir de detailData (sem memoização: a tabela é pequena e
  // já recalcula badges/labels da mesma forma).
  const getAvailableProductsProgress = () => {
    if (!detailData) return { done: 0, total: 0, percent: 0 };
    // Só produtos entram na contagem: uma linha de serviço nunca pode ficar
    // "disponível", por isso contá-la no denominador tornava os 100%
    // inalcançáveis em qualquer encomenda com serviços.
    const productLines = detailData.lines.filter((line) => line.line_status !== 'servico');
    const total = productLines.length;
    const done = productLines.filter((line) =>
      ['servido_por_stock', 'recebido', 'stock_disponivel_confirmar'].includes(line.line_status)
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
  };

  // Checklist inline da célula "Estado" — só para linhas
  // stock_disponivel_confirmar (fase pós-20261130070000). Estados possíveis:
  // 1) sem permissão inventory.edit → checkbox desativado + tooltip;
  // 2) sem armazéns disponíveis (não devia acontecer, dado o próprio
  //    line_status) → checkbox desativado + tooltip;
  // 3) 1 armazém → checkbox dispara logo a confirmação;
  // 4) 2+ armazéns → checkbox revela Select + botão "Confirmar";
  // 5) a processar → spinner em vez do checkbox.
  const renderStockExitChecklist = (line: ClientOrderDocumentLine) => {
    const warehouses = line.available_warehouses || [];
    const isProcessing = confirmingLineId === line.quote_line_id;

    if (isProcessing) {
      return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }

    if (!canConfirmStockExit) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Checkbox checked={false} disabled />
            </span>
          </TooltipTrigger>
          <TooltipContent>{t('clientOrders.dialog.noPermissionToConfirm')}</TooltipContent>
        </Tooltip>
      );
    }

    if (warehouses.length === 0) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Checkbox checked={false} disabled />
            </span>
          </TooltipTrigger>
          <TooltipContent>{t('clientOrders.dialog.noWarehouseAvailable')}</TooltipContent>
        </Tooltip>
      );
    }

    const isActive = checklistActiveLineIds.has(line.quote_line_id);
    const selectedWarehouseId = selectedWarehouseByLine[line.quote_line_id];

    if (warehouses.length > 1 && isActive) {
      return (
        <div className="flex items-center gap-1.5">
          <Checkbox
            checked
            onCheckedChange={(checked) => handleChecklistCheckboxChange(line, checked === true)}
          />
          <Select
            value={selectedWarehouseId || ""}
            onValueChange={(value) =>
              setSelectedWarehouseByLine((prev) => ({ ...prev, [line.quote_line_id]: value }))
            }
          >
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder={t('clientOrders.dialog.selectWarehouse')} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((wh) => (
                <SelectItem key={wh.warehouse_id} value={wh.warehouse_id}>
                  {wh.warehouse_name} ({wh.quantity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedWarehouseId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => handleConfirmStockExit(line, selectedWarehouseId)}
            >
              {t('clientOrders.dialog.confirmStockExit')}
            </Button>
          )}
        </div>
      );
    }

    return (
      <Checkbox
        checked={isActive}
        onCheckedChange={(checked) => handleChecklistCheckboxChange(line, checked === true)}
      />
    );
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
    setCreateDate(new Date().toISOString().split('T')[0]);
    setCreateNotes("");
    setCreateItems([]);
  };

  // Ao escolher o cliente, pré-preenche a morada de entrega com a morada
  // principal da entidade (editável). O ref guarda o último entityId pedido
  // para ignorar respostas que cheguem fora de ordem.
  const handleCreateClientChange = async (client: EntitySearchResult | null) => {
    setCreateClient(client);
    const entityId = client?.entityId ?? null;
    deliveryAddressRequestRef.current = entityId;
    if (!entityId) {
      setCreateDeliveryAddress("");
      return;
    }
    let address = "";
    try {
      const { data, error } = await (supabase as any)
        .from('anew_entity_addresses')
        .select('is_primary, anew_addresses(street, number, postal_code, city)')
        .eq('entity_id', entityId)
        .order('is_primary', { ascending: false })
        .limit(1);
      if (error) throw error;
      const addr = data?.[0]?.anew_addresses;
      if (addr) {
        address = [addr.street, addr.number, addr.postal_code, addr.city]
          .map((part: unknown) => (typeof part === 'string' ? part.trim() : part != null ? String(part).trim() : ''))
          .filter(Boolean)
          .join(', ');
      }
    } catch (error) {
      console.error('Error loading client delivery address:', error);
    }
    if (deliveryAddressRequestRef.current !== entityId) return;
    setCreateDeliveryAddress(address);
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
            vat_rate: Number(comp.vat_rate) || DEFAULT_VAT_RATE,
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
        vat_rate: Number(item.vat_rate) || DEFAULT_VAT_RATE,
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
      const parsed = parseFloat(value);
      next[index] = { ...next[index], [field]: isNaN(parsed) ? 0 : parsed };
      return next;
    });
  };

  const handleRemoveCreateItem = (index: number) => {
    setCreateItems((prev) => prev.filter((_, i) => i !== index));
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

    if (createItems.length === 0) {
      toast({
        title: t('clientOrders.create.validation.itemsRequired'),
        description: t('clientOrders.create.validation.itemsRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    for (let i = 0; i < createItems.length; i++) {
      const item = createItems[i];
      if (!item.product_id && !item.service_id) {
        toast({
          title: t('clientOrders.create.validation.lineWithoutItem'),
          description: t('clientOrders.create.validation.lineWithoutItemDesc', { line: i + 1 }),
          variant: "destructive",
        });
        return;
      }
      if (!(item.quantity > 0)) {
        toast({
          title: t('clientOrders.create.validation.invalidQuantity'),
          description: t('clientOrders.create.validation.invalidQuantityDesc', { line: i + 1 }),
          variant: "destructive",
        });
        return;
      }
    }

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
        p_items: createItems.map((item) => ({
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
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-7 h-7 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold mb-1">{t('clientOrders.title')}</h1>
              <p className="text-muted-foreground">{t('clientOrders.description')}</p>
            </div>
          </div>
          {/* A página já está protegida por inventory.view + client_contracts.view
              (ProtectedRoute em App.tsx e menuConfig.ts). Criar uma encomenda
              cria um contrato assinado, pelo que exige client_contracts.create —
              mesmo PermissionGate usado em ClientContracts.tsx. */}
          <PermissionGate permission="client_contracts.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('clientOrders.create.newOrder')}
            </Button>
          </PermissionGate>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder={t('clientOrders.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={t('clientOrders.table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('clientOrders.filterStatusAll')}</SelectItem>
              <SelectItem value="totalmente_servido">{t('clientOrders.status.totallyServed')}</SelectItem>
              <SelectItem value="parcialmente_pendente">{t('clientOrders.status.partiallyPending')}</SelectItem>
              <SelectItem value="a_aguardar_encomenda">{t('clientOrders.status.awaitingOrder')}</SelectItem>
              <SelectItem value="sem_fornecedor">{t('clientOrders.status.noSupplier')}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
            title={t('clientOrders.filters.dateFrom')}
            aria-label={t('clientOrders.filters.dateFrom')}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
            title={t('clientOrders.filters.dateTo')}
            aria-label={t('clientOrders.filters.dateTo')}
          />
          {(searchTerm || statusFilter !== "all" || dateFrom || dateTo) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              {t('clientOrders.filters.clear')}
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('clientOrders.table.contractNumber')}</TableHead>
              <TableHead>{t('clientOrders.table.client')}</TableHead>
              <TableHead>{t('clientOrders.table.signatureDate')}</TableHead>
              <TableHead className="text-right">{t('clientOrders.table.lines')}</TableHead>
              <TableHead>{t('clientOrders.table.status')}</TableHead>
              <TableHead className="text-right">{t('clientOrders.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">{t('clientOrders.loading')}</TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">{t('clientOrders.noOrders')}</TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.contract_id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{order.contract_number}</span>
                      {salesByContract[order.contract_id] && (
                        <Badge variant="outline" className="w-fit gap-1 font-normal text-xs">
                          <ShoppingBag className="h-3 w-3" />
                          {t('clientOrders.origin.directSale')}
                          {salesByContract[order.contract_id].sale_number
                            ? ` ${salesByContract[order.contract_id].sale_number}`
                            : ''}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{order.client_name || '-'}</TableCell>
                  <TableCell>
                    {order.signature_date ? new Date(order.signature_date).toLocaleDateString('pt-PT') : '-'}
                  </TableCell>
                  <TableCell className="text-right">{order.total_lines}</TableCell>
                  <TableCell>
                    <Badge className={getOverallStatusColor(order.overall_status)}>
                      {getOverallStatusLabel(order.overall_status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDetail(order.contract_id)}
                      title={t('clientOrders.viewDetail')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleGeneratePdf(order.contract_id, order.contract_number)}
                      title={t('clientOrders.downloadPdf')}
                      disabled={pdfGeneratingId === order.contract_id}
                    >
                      <FileDown className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div ref={loadMoreRef} className="py-4 flex justify-center">
          {loadingMore && (
            <div className="text-sm text-muted-foreground">{t('clientOrders.loadingMore')}</div>
          )}
          {!hasMore && !loading && orders.length > 0 && (
            <div className="text-sm text-muted-foreground">{t('clientOrders.allLoaded')}</div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('clientOrders.dialog.title')}
              {detailData ? ` — ${detailData.contract_number}` : ""}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <OlyviaLoader size={32} />
            </div>
          ) : detailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('clientOrders.dialog.client')}: </span>
                  <span className="font-medium">{detailData.client_name || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('clientOrders.dialog.contract')}: </span>
                  <span className="font-medium">{detailData.contract_number}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('clientOrders.dialog.signatureDate')}: </span>
                  <span className="font-medium">
                    {detailData.signature_date ? new Date(detailData.signature_date).toLocaleDateString('pt-PT') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('clientOrders.dialog.totalValue')}: </span>
                  <span className="font-medium">
                    {detailData.total_value !== null && detailData.total_value !== undefined
                      ? `€${Number(detailData.total_value).toFixed(2)}`
                      : '-'}
                  </span>
                </div>
                {salesByContract[detailData.contract_id] && (
                  <div className="col-span-2 flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">{t('clientOrders.dialog.origin')}: </span>
                    <Badge variant="outline" className="gap-1 font-normal">
                      <ShoppingBag className="h-3 w-3" />
                      {t('clientOrders.origin.directSale')}
                      {salesByContract[detailData.contract_id].sale_number
                        ? ` ${salesByContract[detailData.contract_id].sale_number}`
                        : ''}
                    </Badge>
                    {salesByContract[detailData.contract_id].proforma_number && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => handleDownloadProforma(detailData.contract_id)}
                        disabled={proformaDownloadingId === detailData.contract_id}
                      >
                        {proformaDownloadingId === detailData.contract_id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FileDown className="h-3.5 w-3.5" />}
                        {salesByContract[detailData.contract_id].proforma_number}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Diagnóstico da obra — só-leitura. Cópia congelada tirada pelo
                  QuoteBuilder quando o orçamento é gravado (não há trigger de
                  assinatura de contrato nenhum por trás disto), para o armazém
                  saber o que vai executar. Não renderiza nada (nem título, nem
                  caixa) quando a encomenda não tem diagnóstico: é o caso normal
                  das vendas diretas e das encomendas manuais. */}
              {(() => {
                const needs = detailData.diagnostic ?? [];
                if (needs.length === 0) return null;
                return (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">
                        {tf('clientOrders.dialog.diagnostic.title', 'Diagnóstico da obra')}
                      </h3>
                      <Badge variant="outline" className="font-normal">
                        {tf('clientOrders.dialog.diagnostic.readOnlyBadge', 'Só leitura')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tf(
                        'clientOrders.dialog.diagnostic.subtitle',
                        'Cópia do diagnóstico no momento em que o orçamento foi gravado. Não faz parte das linhas da encomenda.'
                      )}
                    </p>

                    {needs.map((need) => {
                      // Só os campos preenchidos entram na lista — rótulos sem
                      // valor não se mostram.
                      const fields: Array<{ label: string; value: string; wide?: boolean }> = [];
                      if (need.diag_demolir_descricao) {
                        fields.push({
                          label: tf('clientOrders.dialog.diagnostic.demolish', 'Demolir'),
                          value: need.diag_demolir_descricao,
                          wide: true,
                        });
                      }
                      if (need.diag_demolir_m2 !== null) {
                        fields.push({
                          label: tf('clientOrders.dialog.diagnostic.demolishArea', 'Área a demolir'),
                          value: `${formatDiagnosticNumber(need.diag_demolir_m2)} m²`,
                        });
                      }
                      if (need.diag_proteger_descricao) {
                        fields.push({
                          label: tf('clientOrders.dialog.diagnostic.protect', 'Proteger'),
                          value: need.diag_proteger_descricao,
                          wide: true,
                        });
                      }
                      if (need.diag_intervencao_tipo) {
                        fields.push({
                          label: tf('clientOrders.dialog.diagnostic.interventionType', 'Tipo de intervenção'),
                          value: need.diag_intervencao_tipo,
                        });
                      }
                      if (need.diag_intervencao_descricao) {
                        fields.push({
                          label: tf('clientOrders.dialog.diagnostic.interventionDescription', 'Descrição da intervenção'),
                          value: need.diag_intervencao_descricao,
                          wide: true,
                        });
                      }

                      return (
                        <div
                          key={need.deal_need_id}
                          className="space-y-3 rounded-md border bg-background p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-medium">
                              {need.need_title
                                || tf('clientOrders.dialog.diagnostic.untitledNeed', 'Necessidade sem título')}
                            </span>
                            {need.diag_area_m2 !== null && (
                              <Badge variant="secondary" className="shrink-0 font-normal">
                                {formatDiagnosticNumber(need.diag_area_m2)} m²
                              </Badge>
                            )}
                          </div>

                          {fields.length > 0 && (
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                              {fields.map((field) => (
                                <div key={field.label} className={field.wide ? 'sm:col-span-2' : undefined}>
                                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                                  <dd className="whitespace-pre-wrap break-words font-medium">{field.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}

                          {need.materials.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  {tf('clientOrders.dialog.diagnostic.materials', 'Materiais previstos')}
                                </span>
                                <Badge variant="outline" className="font-normal">
                                  {tf(
                                    'clientOrders.dialog.diagnostic.materialsBadge',
                                    'Informativo para o armazém'
                                  )}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {tf(
                                  'clientOrders.dialog.diagnostic.materialsNote',
                                  'Não são linhas da encomenda, não têm preço e não somam ao total.'
                                )}
                              </p>
                              <ul className="space-y-1">
                                {need.materials.map((material, materialIndex) => (
                                  <li
                                    key={`${need.deal_need_id}-mat-${materialIndex}`}
                                    className="flex items-baseline gap-2 text-sm"
                                  >
                                    <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                                      {formatDiagnosticNumber(material.quantity)}
                                      {material.unidade ? ` ${material.unidade}` : ''}
                                    </span>
                                    <span className="min-w-0 break-words text-muted-foreground">
                                      {material.descricao || '-'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {(() => {
                const { done, total, percent } = getAvailableProductsProgress();
                const barColorClass = total === 0
                  ? "[&>div]:bg-muted-foreground"
                  : percent === 100
                    ? "[&>div]:bg-success"
                    : "[&>div]:bg-warning";
                return (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t('clientOrders.dialog.availableProducts')}</span>
                      <span className="font-medium">{done}/{total} ({percent}%)</span>
                    </div>
                    <Progress value={percent} className={`h-2 ${barColorClass}`} />
                  </div>
                );
              })()}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGeneratePdf(detailData.contract_id, detailData.contract_number)}
                  disabled={pdfGeneratingId === detailData.contract_id}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  {t('clientOrders.downloadPdf')}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('clientOrders.dialog.sku')}</TableHead>
                    <TableHead>{t('clientOrders.dialog.product')}</TableHead>
                    <TableHead className="text-right">{t('clientOrders.dialog.quantity')}</TableHead>
                    <TableHead>{t('clientOrders.dialog.lineStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailData.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('clientOrders.dialog.noLines')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailData.lines.map((line) => (
                      <TableRow key={line.quote_line_id}>
                        <TableCell>{line.product_sku || line.service_sku || '-'}</TableCell>
                        <TableCell>{line.product_name || line.service_name || '-'}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={getLineStatusColor(line.line_status)}>
                              {getLineStatusLabel(line)}
                            </Badge>
                            {line.line_status === 'stock_disponivel_confirmar' && renderStockExitChecklist(line)}
                            {line.purchase_order_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openPurchaseOrder(line.purchase_order_id as string)}
                                title={t('clientOrders.openPurchaseOrder')}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Criação manual de Encomenda Cliente */}
      <Dialog
        open={createOpen}
        onOpenChange={(isOpen) => {
          setCreateOpen(isOpen);
          if (!isOpen) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('clientOrders.create.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>{t('clientOrders.create.client')} *</Label>
              <EntitySearchInput
                value={createClient}
                onChange={handleCreateClientChange}
                searchTypes={["client"]}
                placeholder={t('clientOrders.create.clientPlaceholder')}
                disabled={creating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_order_delivery_address">{t('clientOrders.create.deliveryAddress')}</Label>
              <Textarea
                id="client_order_delivery_address"
                value={createDeliveryAddress}
                onChange={(e) => setCreateDeliveryAddress(e.target.value)}
                placeholder={t('clientOrders.create.deliveryAddressPlaceholder')}
                rows={2}
                disabled={creating}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_order_date">{t('clientOrders.create.date')} *</Label>
                <Input
                  id="client_order_date"
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_order_notes">{t('clientOrders.create.notes')}</Label>
                <Textarea
                  id="client_order_notes"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={2}
                  disabled={creating}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{t('clientOrders.create.items')}</h3>
                <Button type="button" onClick={() => setShowItemsDialog(true)} disabled={creating}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('clientOrders.create.addItems')}
                </Button>
              </div>

              {createItems.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('clientOrders.create.itemType')}</TableHead>
                          <TableHead>{t('clientOrders.create.itemDescription')}</TableHead>
                          <TableHead>{t('clientOrders.create.itemQuantity')}</TableHead>
                          <TableHead>{t('clientOrders.create.itemUnitPrice')}</TableHead>
                          <TableHead>{t('clientOrders.create.itemVat')}</TableHead>
                          <TableHead className="text-right">{t('clientOrders.create.itemTotal')}</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {createItems.map((item, index) => {
                          const lineSubtotal = item.unit_price * item.quantity;
                          const lineTotal = lineSubtotal * (1 + item.vat_rate / 100);
                          return (
                            <TableRow key={`${item.product_id || item.service_id}-${index}`}>
                              <TableCell>
                                <Badge variant="outline">
                                  {item.item_type === 'product'
                                    ? t('clientOrders.create.typeProduct')
                                    : t('clientOrders.create.typeService')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{item.description}</div>
                                <div className="text-xs text-muted-foreground">
                                  {item.sku ? `${item.sku} · ` : ''}{item.categoria}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleCreateItemChange(index, 'quantity', e.target.value)}
                                  className="w-20"
                                  min="0"
                                  step="0.01"
                                  disabled={creating}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.unit_price}
                                  onChange={(e) => handleCreateItemChange(index, 'unit_price', e.target.value)}
                                  className="w-24"
                                  min="0"
                                  step="0.01"
                                  disabled={creating}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.vat_rate}
                                  onChange={(e) => handleCreateItemChange(index, 'vat_rate', e.target.value)}
                                  className="w-20"
                                  min="0"
                                  step="0.5"
                                  disabled={creating}
                                />
                              </TableCell>
                              <TableCell className="text-right font-semibold">€{lineTotal.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveCreateItem(index)}
                                  title={t('clientOrders.create.removeItem')}
                                  disabled={creating}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    {(() => {
                      const totals = getCreateTotals();
                      return (
                        <Card>
                          <CardHeader>
                            <CardTitle>{t('clientOrders.create.summary')}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('clientOrders.create.subtotal')}</span>
                              <span>€{totals.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('clientOrders.create.vat')}</span>
                              <span>€{totals.totalVat.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold pt-2 border-t">
                              <span>{t('clientOrders.create.total')}</span>
                              <span>€{totals.total.toFixed(2)}</span>
                            </div>
                            <div className="text-sm text-muted-foreground pt-2">
                              {t('clientOrders.create.itemsCount')}: {createItems.length}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('clientOrders.create.noItems')}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                {t('clientOrders.create.cancel')}
              </Button>
              <Button type="button" onClick={handleCreateOrder} disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {creating ? t('clientOrders.create.submitting') : t('clientOrders.create.submit')}
              </Button>
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
      />
    </>
  );
};

export default ClientOrders;
