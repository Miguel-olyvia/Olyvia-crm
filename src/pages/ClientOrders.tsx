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
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Eye, FileDown, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
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

interface ClientOrderDocumentLine {
  quote_line_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'stock_disponivel_confirmar' | 'sem_fornecedor';
  stock_movement_id: string | null;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  available_warehouses: ClientOrderAvailableWarehouse[] | null;
}

interface ClientOrderDocumentDetail {
  contract_id: string;
  contract_number: string;
  client_name: string | null;
  signature_date: string | null;
  total_value: number | null;
  status: string;
  lines: ClientOrderDocumentLine[];
}

const ClientOrders = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canConfirmStockExit = hasPermission('inventory.edit');

  const [orders, setOrders] = useState<ClientOrderDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ClientOrderDocumentDetail | null>(null);
  const [pdfGeneratingId, setPdfGeneratingId] = useState<string | null>(null);

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
  });
  useEffect(() => {
    filtersRef.current = { activeCompanyId: activeCompany?.id, debouncedSearchTerm, statusFilter };
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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
      });

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
      // Sem total_count na RPC — hasMore inferido do tamanho da página devolvida.
      setHasMore(newRows.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      toast({ title: t('clientOrders.toast.loadError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    loadOrders(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, debouncedSearchTerm, statusFilter]);

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
    return data as unknown as ClientOrderDocumentDetail;
  };

  const openDetail = async (contractId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const doc = await fetchDetail(contractId);
      setDetailData(doc);
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

      const blob = await pdf(
        <ClientOrderDocumentPDF document={doc} company={company} />
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
      default:
        return line.line_status;
    }
  };

  // Indicador "Produtos Disponíveis" no cabeçalho do diálogo — recalculado a
  // cada render a partir de detailData (sem memoização: a tabela é pequena e
  // já recalcula badges/labels da mesma forma).
  const getAvailableProductsProgress = () => {
    if (!detailData) return { done: 0, total: 0, percent: 0 };
    const total = detailData.lines.length;
    const done = detailData.lines.filter((line) =>
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
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-7 h-7 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold mb-1">{t('clientOrders.title')}</h1>
            <p className="text-muted-foreground">{t('clientOrders.description')}</p>
          </div>
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
                  <TableCell className="font-medium">{order.contract_number}</TableCell>
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
              </div>

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
                        <TableCell>{line.product_sku || '-'}</TableCell>
                        <TableCell>{line.product_name}</TableCell>
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
    </>
  );
};

export default ClientOrders;
