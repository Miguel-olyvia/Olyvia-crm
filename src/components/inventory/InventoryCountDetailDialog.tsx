import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { ArrowRightLeft, Camera, Check, ClipboardCheck, Download, Info, Loader2, Upload } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { DocInfoGrid, DocumentSheetContent, DOC_TABLE_WRAP_CLASS } from "@/components/inventory/DocumentSheet";
import { InventoryStatusBadge, type InventoryTone } from "@/components/inventory/ui";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";
import {
  normalizeCodeKey,
  parseCountImportFile,
  type CountImportEntry,
  type CountImportErrorRow,
  type CountImportPreview,
} from "@/components/inventory/counts/countImport";
import { ReasonButton } from "@/components/inventory/counts/ReasonButton";
import CategorySubcategoryFilter from "@/components/inventory/CategorySubcategoryFilter";
import { productMatchesCategoryIds, useProductCategories } from "@/hooks/useProductCategories";

// Fase 5.4 do plano de inventário: diálogo de detalhe/contagem de uma sessão
// de public.inventory_counts. Consome as 3 RPCs de escrita já aplicadas
// (20261116020000_inventory_counts_foundation.sql):
// rpc_update_inventory_count_line_quantity (permissão inventory.count),
// rpc_resolve_inventory_count_line e rpc_finalize_inventory_count (ambas
// exigem inventory.edit). Leitura via .from() direto — inventory_counts/
// inventory_count_lines/products/warehouses/product_categories têm SELECT
// liberado por organização (sem permissão extra necessária além de
// inventory.view, já verificado na rota/menu).

type ResolutionType = "ajustado" | "aceite_sem_ajuste" | "recontagem_pedida";

interface InventoryCountHeader {
  id: string;
  document_number: string;
  status: string;
  started_at: string;
  finalized_at: string | null;
  warehouse_id: string;
  category_id: string | null;
  created_by: string | null;
  warehouses?: { name: string } | null;
  product_categories?: { name: string } | null;
}

interface InventoryCountLineRow {
  id: string;
  product_id: string;
  system_quantity_at_start: number;
  counted_quantity: number | null;
  counted_at: string | null;
  discrepancy_resolution: string | null;
  resolution_notes: string | null;
  moved_during_count: boolean;
  stock_movement_id: string | null;
  products?: {
    name: string;
    sku: string | null;
    barcode: string | null;
    category_id: string | null;
    subcategory_id: string | null;
  } | null;
}

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
}

const INCREASING_TYPES = new Set(["entrada", "transferencia_entrada", "ajuste_positivo"]);
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

// PostgREST caps an unranged response at 1000 rows — paginado por segurança,
// mesmo padrão já usado em Stocks.tsx/StockMovementDialog.tsx.
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

// --- Exportar / importar contagem -----------------------------------------
// O ficheiro exportado é o mesmo que o utilizador devolve preenchido, por isso
// o cabeçalho é validado por NOME (nunca por posição): quem abre o ficheiro no
// Excel reordena colunas, apaga as que não interessam e volta a gravar.

const CHUNK_SIZE = 200;

// A contagem INICIAL semeia o catálogo inteiro da organização (numa org real
// deste projeto são ~2200 produtos, noutras pode ser mais) e o diálogo abre
// logo a seguir a criar. Com canCount && isActive cada linha renderiza um
// <Input type="number"> e dois refs — de uma só vez, isso congela o browser
// durante segundos. Acima do limiar a tabela pagina no cliente; abaixo dele
// (contagem de rotina, dezenas de linhas) fica exatamente como estava.
const LINE_PAGE_SIZE = 200;
const LINE_PAGINATION_THRESHOLD = 500;

// Resultado de uma gravação em massa (importar ou preencher = esperado).
interface BulkWriteResult {
  updated: number;
  errors: CountImportErrorRow[];
  // true quando um lote falhou a meio: os lotes anteriores JÁ estão gravados
  // (cada chamada RPC é a sua própria transação) e o resto nunca foi enviado.
  incomplete: boolean;
  notSent: number;
}

interface ImportReport extends BulkWriteResult {
  skipped: number;
  /**
   * Erros sem número de linha de ficheiro (Preencher = esperado): o relatório
   * mostra só o SKU/código, não uma "Linha N" que não existe em lado nenhum.
   */
  withoutFileLines?: boolean;
}

// Motivo mostrado nos botões desativados.
const NO_COUNT_PERMISSION = "Requer a permissão inventory.count";
const NO_EDIT_PERMISSION = "Requer a permissão inventory.edit";
// Não existe RPC de cancelamento (inventory_counts aceita o estado
// 'cancelada', mas a RLS bloqueia UPDATE direto e nenhuma migration cria
// rpc_cancel_inventory_count) — o botão fica visível e desativado.
const CANCEL_UNAVAILABLE = "Ainda não disponível";

interface InventoryCountDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countId: string | null;
  // Chamado depois de qualquer alteração que mude os agregados mostrados na
  // listagem (contagem de linhas, discrepâncias por resolver, estado) —
  // finalizar ou resolver uma linha.
  onChanged: () => void;
}

export default function InventoryCountDetailDialog({
  open, onOpenChange, countId, onChanged,
}: InventoryCountDetailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  // Estrito a "inventory.count": a RPC rpc_update_inventory_count_line_quantity
  // exige exatamente esta permissão (ver migration 20261116020000). Mostrar o
  // campo a quem só tem "inventory.edit" deixava-o escrever um valor que a BD
  // rejeitava em silêncio (toast de erro fácil de não notar, campo revertia).
  const canCount = hasPermission("inventory.count");
  const canEdit = hasPermission("inventory.edit");

  const [loading, setLoading] = useState(false);
  const [header, setHeader] = useState<InventoryCountHeader | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [lines, setLines] = useState<InventoryCountLineRow[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, { resolution: ResolutionType | ""; notes: string }>>({});
  const [resolvingLineId, setResolvingLineId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  // Pré-visualização do ficheiro: lido e validado, ainda NADA gravado.
  const [importPreview, setImportPreview] = useState<CountImportPreview | null>(null);
  // Linhas já resolvidas (Ajustado / Aceite sem ajuste) cujo valor muda: por
  // omissão NÃO são gravadas — gravar limpava a resolução sem ninguém notar.
  const [includeResolved, setIncludeResolved] = useState(false);

  // "Preencher contadas = esperado" (confirmação antes de gravar).
  const [fillConfirmOpen, setFillConfirmOpen] = useState(false);
  const [filling, setFilling] = useState(false);

  // Leitor de mão (USB/Bluetooth) que escreve o código e Enter no campo.
  const [manualCode, setManualCode] = useState("");

  // Página atual da tabela de linhas (só usada acima de LINE_PAGINATION_THRESHOLD).
  const [linePage, setLinePage] = useState(0);

  // Filtro Categoria/Subcategoria da folha — só muda o que a TABELA mostra.
  // Exportar, importar, finalizar e os agregados da listagem continuam a usar
  // todas as linhas (`lines`).
  const [lineCategoryFilter, setLineCategoryFilter] = useState("all");
  const [lineSubcategoryFilter, setLineSubcategoryFilter] = useState("all");
  const { resolveFilterIds } = useProductCategories();
  const lineFilterIds = useMemo(
    () => resolveFilterIds(lineCategoryFilter, lineSubcategoryFilter),
    [lineCategoryFilter, lineSubcategoryFilter, resolveFilterIds],
  );
  const lineFilterActive = lineFilterIds !== null;
  const filteredLines = useMemo(
    () => (lineFilterIds ? lines.filter((l) => productMatchesCategoryIds(l.products, lineFilterIds)) : lines),
    [lines, lineFilterIds],
  );
  const clearLineFilters = useCallback(() => {
    setLineCategoryFilter("all");
    setLineSubcategoryFilter("all");
    setLinePage(0);
  }, []);

  // Leitor de código de barras (Fase 5.4 — localizar linha por câmara). As
  // etiquetas físicas dos produtos codificam o SKU (products.barcode está
  // vazio em toda a BD hoje) — comparamos primeiro por sku e, como fallback
  // preparado para o futuro, também por barcode.
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // A escolha automática da câmara (deviceId undefined) pode apanhar o
  // dispositivo errado quando há mais do que um (ex: câmara virtual de apps
  // de videochamada) — sem sinal, dá um ecrã preto sem erro nenhum. Os
  // "label" dos dispositivos só vêm preenchidos depois de a permissão já
  // ter sido concedida uma vez, por isso a lista só é pedida depois do
  // primeiro getUserMedia bem sucedido.
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanControlsRef = useRef<IScannerControls | null>(null);
  const quantityInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  // O painel de scan fica aberto para ler vários produtos seguidos — sem
  // isto, o mesmo código continuaria a ser decodificado em quase todos os
  // frames enquanto estivesse à frente da câmara, somando +1 dezenas de
  // vezes por segundo. Ignora qualquer leitura nos SCAN_COOLDOWN_MS a
  // seguir à última processada (encontrada ou não).
  const SCAN_COOLDOWN_MS = 1500;
  const lastScanAtRef = useRef(0);

  // Gravação da contada por linha, em fila. Um leitor de mão dispara Enter
  // várias vezes antes de o `lines` do render se atualizar — somar a partir
  // dele gravava o mesmo valor N vezes (contada abaixo do real).
  //  · requestedQtyRef: último valor PEDIDO por linha (as leituras somam a
  //    partir daqui);
  //  · confirmedQtyRef: último valor que o servidor confirmou;
  //  · saveQueueRef: cauda da fila da linha — uma gravação de cada vez, e cada
  //    uma envia o valor acumulado no momento em que arranca.
  // Repostos sempre que as linhas são recarregadas do servidor.
  const requestedQtyRef = useRef<Record<string, number>>({});
  const confirmedQtyRef = useRef<Record<string, number | null>>({});
  const saveQueueRef = useRef<Record<string, Promise<unknown>>>({});

  const isActive = header?.status === "em_contagem";

  // Paginação client-side da tabela de linhas. `safeLinePage` é derivado (não
  // é estado): assim uma contagem que encolha — recarregada noutra sessão —
  // nunca deixa a tabela presa numa página que já não existe. Pagina sobre as
  // linhas filtradas (filteredLines === lines sem filtro).
  const paginateLines = filteredLines.length > LINE_PAGINATION_THRESHOLD;
  const linePageCount = paginateLines ? Math.ceil(filteredLines.length / LINE_PAGE_SIZE) : 1;
  const safeLinePage = Math.min(Math.max(linePage, 0), linePageCount - 1);
  const lineRangeStart = paginateLines ? safeLinePage * LINE_PAGE_SIZE : 0;
  const visibleLines = paginateLines
    ? filteredLines.slice(lineRangeStart, lineRangeStart + LINE_PAGE_SIZE)
    : filteredLines;

  const loadDetail = useCallback(async () => {
    if (!countId) return;
    setLoading(true);
    try {
      const { data: headerData, error: headerError } = await supabase
        .from("inventory_counts")
        .select("id, document_number, status, started_at, finalized_at, warehouse_id, category_id, created_by, warehouses(name), product_categories(name)")
        .eq("id", countId)
        .single();
      if (headerError) throw headerError;
      const headerRow = headerData as unknown as InventoryCountHeader;
      setHeader(headerRow);

      // Nome de quem iniciou (grelha "Iniciada"). Só informativo: se a leitura
      // falhar (RLS de anew_users), mostra-se só a data.
      setCreatorName(null);
      if (headerRow.created_by) {
        supabase
          .from("anew_users")
          .select("name")
          .eq("id", headerRow.created_by)
          .maybeSingle()
          .then(({ data }) => setCreatorName((data as { name?: string } | null)?.name || null));
      }

      const { data: lineData, error: lineError } = await fetchAllRows(() =>
        supabase
          .from("inventory_count_lines")
          .select("id, product_id, system_quantity_at_start, counted_quantity, counted_at, discrepancy_resolution, resolution_notes, moved_during_count, stock_movement_id, products(name, sku, barcode, category_id, subcategory_id)")
          .eq("inventory_count_id", countId)
          .order("name", { foreignTable: "products", ascending: true })
      );
      if (lineError) throw lineError;
      const rows = (lineData || []) as unknown as InventoryCountLineRow[];
      requestedQtyRef.current = {};
      confirmedQtyRef.current = {};
      setLines(rows);
      setQuantityDrafts(Object.fromEntries(rows.map((l) => [l.id, l.counted_quantity != null ? String(l.counted_quantity) : ""])));
      setResolutionDrafts({});
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.detailError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [countId, t, toast]);

  // Filtra por stock_movement_id (gravado na linha só quando 'ajustado' gerou
  // mesmo um movimento) em vez de reference_id IN (todos os ids de linha) —
  // uma sessão grande (milhares de linhas) produzia um URL de dezenas de
  // milhares de caracteres, rejeitado pela infraestrutura do Supabase antes
  // de responder ("Failed to fetch", sem cabeçalhos, indistinguível de CORS).
  // stock_movement_id é sempre gravado junto com reference_id (ver migration
  // 20261116020000, secção 9) — mesmo resultado, lista tipicamente muito mais
  // pequena (só linhas realmente ajustadas). Batching a 200 ids mantido como
  // rede de segurança, mesmo padrão já usado noutras páginas do projeto.
  const MOVEMENT_ID_CHUNK = 200;

  const loadMovements = useCallback(async (movementIds: string[]) => {
    if (movementIds.length === 0) {
      setMovements([]);
      return;
    }
    setMovementsLoading(true);
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < movementIds.length; i += MOVEMENT_ID_CHUNK) {
        chunks.push(movementIds.slice(i, i + MOVEMENT_ID_CHUNK));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("stock_movements")
            .select("id, movement_type, quantity, balance_after, document_number, counterparty, notes, created_at")
            .in("id", chunk)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      const rows = results.flatMap((r) => (r.data || []) as MovementRow[]);
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setMovements(rows);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.movementsLoadError'), description: error.message, variant: "destructive" });
    } finally {
      setMovementsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (!open || !countId) return;
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, countId]);

  useEffect(() => {
    if (!open) return;
    const movementIds = lines
      .map((l) => l.stock_movement_id)
      .filter((id): id is string => !!id);
    loadMovements(movementIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lines]);

  // Se o diálogo principal fechar enquanto o leitor de código está aberto,
  // fecha-o também — o efeito da câmara (abaixo) trata de libertar o stream.
  useEffect(() => {
    if (!open) {
      setScanOpen(false);
      setImportOpen(false);
      setImportReport(null);
      setImportPreview(null);
      setFillConfirmOpen(false);
    }
  }, [open]);

  // Abrir outra contagem (ou reabrir esta) volta sempre à primeira página e
  // sem filtro de categoria.
  useEffect(() => {
    setLinePage(0);
    setLineCategoryFilter("all");
    setLineSubcategoryFilter("all");
  }, [countId, open]);

  const findLineByCode = useCallback((code: string): InventoryCountLineRow | undefined => {
    const trimmed = code.trim();
    if (!trimmed) return undefined;
    const exact = lines.find((l) => l.products?.sku === trimmed || l.products?.barcode === trimmed);
    if (exact) return exact;
    const normalized = trimmed.toLowerCase();
    return lines.find((l) => {
      const sku = l.products?.sku?.trim().toLowerCase();
      const barcode = l.products?.barcode?.trim().toLowerCase();
      return sku === normalized || barcode === normalized;
    });
  }, [lines]);

  // Grava a quantidade contada de uma linha (RPC + estado local) — partilhado
  // entre a gravação manual (onBlur do campo) e o incremento automático por
  // scan, para as duas vias atualizarem exatamente da mesma forma (Diferença
  // e Resolução dependem deste mesmo `lines`).
  const persistQuantity = useCallback(async (lineId: string, qty: number) => {
    const { data, error } = await supabase.rpc('rpc_update_inventory_count_line_quantity', {
      p_line_id: lineId,
      p_counted_quantity: qty,
    } as any);
    if (error) throw error;
    const result = data as any;
    setLines((prev) => prev.map((l) => (l.id === lineId
      ? {
        ...l,
        counted_quantity: result.counted_quantity,
        moved_during_count: result.moved_during_count,
        discrepancy_resolution: result.resolution_cleared ? null : l.discrepancy_resolution,
        resolution_notes: result.resolution_cleared ? null : l.resolution_notes,
        stock_movement_id: result.resolution_cleared ? null : l.stock_movement_id,
      }
      : l)));
    if (result.resolution_cleared) {
      setResolutionDrafts((prev) => ({ ...prev, [lineId]: { resolution: "", notes: "" } }));
    }
    setQuantityDrafts((prev) => ({ ...prev, [lineId]: String(result.counted_quantity) }));
    // Ao contrário de handleResolveLine/handleFinalize, esta gravação nunca
    // avisava o pai — o contador "X/Y" e o badge de discrepâncias na lista
    // (StockCounts.tsx) ficavam presos ao valor com que a página tinha
    // aberto até haver refresh por outra via.
    onChanged();
    return result;
  }, [onChanged]);

  // Põe na fila da linha uma gravação do valor PEDIDO (requestedQtyRef) no
  // momento em que ela arranca. Várias leituras seguidas colapsam: se, quando
  // a vez chega, o valor pedido já é o confirmado, não se grava nada
  // (`saved: false`). Rejeita com o erro da RPC — quem chama repõe o ref.
  const enqueueQuantitySave = useCallback((lineId: string): Promise<{ saved: boolean; qty: number | null }> => {
    const previous = saveQueueRef.current[lineId] ?? Promise.resolve();
    const job = previous
      .catch(() => undefined)
      .then(async () => {
        const target = requestedQtyRef.current[lineId];
        // Ref limpo (linhas recarregadas, ou reposto depois de um erro).
        if (target === undefined || confirmedQtyRef.current[lineId] === target) {
          return { saved: false, qty: confirmedQtyRef.current[lineId] ?? null };
        }
        const result = await persistQuantity(lineId, target);
        const qty = Number(result?.counted_quantity ?? target);
        confirmedQtyRef.current[lineId] = qty;
        return { saved: true, qty };
      });
    saveQueueRef.current[lineId] = job;
    return job;
  }, [persistQuantity]);

  // Em erro: o ref volta ao último valor confirmado pelo servidor, e as
  // gravações ainda na fila (que somavam a partir do valor falhado) já não
  // gravam nada.
  const resetRequestedQuantity = (lineId: string) => {
    const confirmed = confirmedQtyRef.current[lineId];
    if (confirmed == null) delete requestedQtyRef.current[lineId];
    else requestedQtyRef.current[lineId] = confirmed;
  };

  // `manual`: código escrito por um leitor de mão (teclado + Enter) — cada
  // Enter é uma leitura intencional, por isso não passa pelo cooldown da câmara.
  const handleScanResult = useCallback((code: string, manual = false) => {
    const now = Date.now();
    if (!manual && now - lastScanAtRef.current < SCAN_COOLDOWN_MS) return;
    lastScanAtRef.current = now;

    const match = findLineByCode(code);
    if (!match) {
      toast({
        title: t('stockCounts.scan.notFoundTitle'),
        description: t('stockCounts.scan.notFoundDescription', { code }),
        variant: "destructive",
      });
      return;
    }
    // Com a tabela paginada, a linha lida pode estar noutra página — sem isto
    // o utilizador ouvia o "bip", via o toast e não via a linha a mudar. O
    // scan procura sempre em TODAS as linhas; se o produto lido está escondido
    // pelo filtro de categoria, o filtro é limpo e salta-se para ele na lista
    // completa.
    const hiddenByFilter = lineFilterActive && !filteredLines.some((l) => l.id === match.id);
    const targetList = hiddenByFilter ? lines : filteredLines;
    if (hiddenByFilter) {
      setLineCategoryFilter("all");
      setLineSubcategoryFilter("all");
    }
    if (targetList.length > LINE_PAGINATION_THRESHOLD) {
      const matchIndex = targetList.findIndex((l) => l.id === match.id);
      setLinePage(matchIndex >= 0 ? Math.floor(matchIndex / LINE_PAGE_SIZE) : 0);
    } else if (hiddenByFilter) {
      setLinePage(0);
    }

    // Soma a partir do último valor PEDIDO (não do `lines` deste render, que
    // ainda não viu as gravações em curso).
    const lineId = match.id;
    if (!(lineId in confirmedQtyRef.current)) {
      confirmedQtyRef.current[lineId] = match.counted_quantity;
    }
    const base = requestedQtyRef.current[lineId] ?? match.counted_quantity ?? 0;
    const newQty = base + 1;
    requestedQtyRef.current[lineId] = newQty;
    const productLabel = match.products?.name || code;
    enqueueQuantitySave(lineId)
      .then(({ saved, qty }) => {
        if (!saved) return; // já coberta por uma gravação acumulada
        // Leva a linha lida para a vista (por baixo do painel do leitor).
        requestAnimationFrame(() => {
          rowRefs.current[lineId]?.scrollIntoView({ block: "nearest" });
        });
        toast({
          title: t('stockCounts.scan.foundTitle'),
          description: t('stockCounts.scan.foundCountDescription', {
            name: productLabel,
            qty: qty ?? newQty,
          }),
        });
      })
      .catch((error: any) => {
        resetRequestedQuantity(lineId);
        const confirmed = confirmedQtyRef.current[lineId];
        toast({
          title: t('stockCounts.toast.quantityError'),
          description: `${error?.message ?? ""} — ${productLabel} ficou com ${confirmed ?? 0} no servidor; volte a ler as unidades que faltam.`,
          variant: "destructive",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findLineByCode, lines, filteredLines, lineFilterActive, enqueueQuantitySave, t, toast]);

  // Mantido em ref para o efeito da câmara (abaixo) não precisar reiniciar o
  // stream sempre que `lines`/`t`/`toast` mudam — só quando scanOpen muda.
  const handleScanResultRef = useRef(handleScanResult);
  useEffect(() => {
    handleScanResultRef.current = handleScanResult;
  }, [handleScanResult]);

  useEffect(() => {
    if (!scanOpen) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setScanError(null);
    const reader = new BrowserMultiFormatReader();

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(t('stockCounts.scan.unsupportedError'));
        }
        // Adquirimos e ligamos o stream nós próprios (em vez de deixar
        // decodeFromVideoDevice tratar disso) — verificado num PC real em
        // que a câmara acendia (luz de atividade ligada, getUserMedia
        // resolvia sem erro) mas o <video> ficava preto: a biblioteca não
        // estava a esperar por video.play() de forma fiável em todos os
        // browsers/drivers. Assim confirmamos explicitamente que o vídeo
        // está mesmo a reproduzir antes de começar a decodificar.
        stream = await navigator.mediaDevices.getUserMedia({
          video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error(t('stockCounts.scan.genericError'));
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        const controls = await reader.decodeFromVideoElement(
          video,
          (result, error) => {
            if (cancelled) return;
            if (result) {
              handleScanResultRef.current(result.getText());
              return;
            }
            // NotFoundException é disparada em quase todos os frames sem
            // código visível — comportamento normal do decode contínuo, não
            // é um erro a reportar ao utilizador. Outros erros são raros e
            // transitórios (frame ilegível); ignoramos silenciosamente para
            // não interromper o scan contínuo.
            if (error && !(error instanceof NotFoundException)) {
              // eslint-disable-next-line no-console
              console.debug("[InventoryCountDetailDialog] scan decode error", error);
            }
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        scanControlsRef.current = controls;
        // Só agora, com a permissão já concedida, é que os "label" das
        // câmaras vêm preenchidos — lista-se para mostrar o seletor caso
        // haja mais do que uma.
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!cancelled) setVideoDevices(devices);
        } catch {
          // Não crítico — sem lista de dispositivos, o utilizador só não
          // vê o seletor de câmara, o scan continua a funcionar.
        }
      } catch (err: any) {
        if (cancelled) return;
        const isPermissionError = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setScanError(isPermissionError
          ? t('stockCounts.scan.permissionError')
          : (err?.message || t('stockCounts.scan.genericError')));
      }
    };

    start();

    return () => {
      cancelled = true;
      scanControlsRef.current?.stop();
      scanControlsRef.current = null;
      // decodeFromVideoElement não adquiriu o stream, por isso não o pára
      // sozinho — temos de libertar a câmara nós próprios.
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanOpen, selectedDeviceId, t]);

  // Limpa a lista/escolha de câmara ao fechar o painel — a próxima abertura
  // volta a listar do zero (evita mostrar dispositivos obsoletos).
  useEffect(() => {
    if (!scanOpen) {
      setVideoDevices([]);
      setSelectedDeviceId(undefined);
      setManualCode("");
    }
  }, [scanOpen]);

  const handleSaveQuantity = async (lineId: string) => {
    const raw = quantityDrafts[lineId];
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    const trimmed = (raw ?? "").trim();
    if (trimmed === "") return; // nada a gravar
    const qty = Number(trimmed);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      toast({ title: t('stockCounts.toast.quantityError'), description: t('stockCounts.detail.lines.countedQty'), variant: "destructive" });
      setQuantityDrafts((prev) => ({ ...prev, [lineId]: line.counted_quantity != null ? String(line.counted_quantity) : "" }));
      return;
    }
    if (line.counted_quantity === qty) return; // sem alteração

    setSavingLineId(lineId);
    // Mesma fila das leituras: um valor escrito à mão não corre em paralelo
    // com leituras ainda a gravar, e as leituras seguintes somam a partir dele.
    if (!(lineId in confirmedQtyRef.current)) {
      confirmedQtyRef.current[lineId] = line.counted_quantity;
    }
    requestedQtyRef.current[lineId] = qty;
    try {
      await enqueueQuantitySave(lineId);
    } catch (error: any) {
      resetRequestedQuantity(lineId);
      const confirmed = confirmedQtyRef.current[lineId];
      toast({ title: t('stockCounts.toast.quantityError'), description: error.message, variant: "destructive" });
      setQuantityDrafts((prev) => ({ ...prev, [lineId]: confirmed != null ? String(confirmed) : "" }));
    } finally {
      setSavingLineId(null);
    }
  };

  const updateResolutionDraft = (lineId: string, patch: Partial<{ resolution: ResolutionType | ""; notes: string }>) => {
    setResolutionDrafts((prev) => ({
      ...prev,
      [lineId]: { resolution: prev[lineId]?.resolution ?? "", notes: prev[lineId]?.notes ?? "", ...patch },
    }));
  };

  const handleResolveLine = async (lineId: string) => {
    const draft = resolutionDrafts[lineId];
    if (!draft || !draft.resolution) return;
    if (draft.resolution === "aceite_sem_ajuste" && !draft.notes.trim()) {
      toast({ title: t('stockCounts.toast.resolveError'), description: t('stockCounts.toast.notesRequired'), variant: "destructive" });
      return;
    }

    setResolvingLineId(lineId);
    try {
      const { error } = await supabase.rpc('rpc_resolve_inventory_count_line', {
        p_line_id: lineId,
        p_resolution: draft.resolution,
        p_notes: draft.notes.trim() || null,
      } as any);
      if (error) throw error;

      toast({ title: t('stockCounts.toast.resolveSuccess') });
      setResolutionDrafts((prev) => ({ ...prev, [lineId]: { resolution: "", notes: "" } }));
      await loadDetail();
      onChanged();
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.resolveError'), description: error.message, variant: "destructive" });
    } finally {
      setResolvingLineId(null);
    }
  };

  const handleFinalize = async () => {
    if (!countId) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.rpc('rpc_finalize_inventory_count', {
        p_inventory_count_id: countId,
      } as any);
      if (error) throw error;

      const result = data as any;
      toast({
        title: t('stockCounts.toast.finalizeSuccess', { document: result.document_number }),
        description: result.lines_uncounted > 0
          ? t('stockCounts.toast.finalizeSuccessUncounted', { count: result.lines_uncounted })
          : undefined,
      });
      await loadDetail();
      onChanged();
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.finalizeError'), description: error.message, variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  };

  // Exporta as linhas já carregadas para XLSX (helper partilhado do projeto —
  // anti-injeção de fórmulas e larguras). "Contada"/"Diferença" ficam VAZIAS
  // enquanto a linha não foi contada: é este o ficheiro que o utilizador leva
  // para o armazém e devolve preenchido em Importar (lido por SKU ou EAN).
  const handleExport = () => {
    if (lines.length === 0) {
      toast({
        title: t('stockCounts.export.emptyTitle'),
        description: t('stockCounts.export.emptyDescription'),
      });
      return;
    }
    try {
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const prefix = (t('stockCounts.export.filenamePrefix') || "stocktake").replace(/[^\w.-]+/g, "_");
      const documentNumber = (header?.document_number || "").replace(/[^\w.-]+/g, "_") || prefix;
      const filename = `${prefix}_${documentNumber}_${stamp}.xlsx`;

      downloadStandardXlsx(
        {
          sheetName: t('stockCounts.export.sheetName'),
          columns: [
            { key: "product", header: t('stockCounts.export.columnProduct'), type: "text" },
            { key: "sku", header: t('stockCounts.export.columnSku'), type: "text" },
            { key: "barcode", header: t('stockCounts.export.columnBarcode'), type: "text" },
            { key: "system_quantity", header: t('stockCounts.export.columnSystemQty'), type: "number" },
            { key: "moved", header: "Movida durante", type: "text" },
            { key: "expected", header: "Esperado", type: "number" },
            { key: "counted_quantity", header: t('stockCounts.export.columnCountedQty'), type: "number" },
            { key: "difference", header: t('stockCounts.export.columnDifference'), type: "number" },
            { key: "resolution", header: "Resolução", type: "text" },
            { key: "note", header: "Nota", type: "text" },
          ],
          rows: lines.map((line) => {
            const diff = getDiff(line);
            return {
              product: line.products?.name ?? "",
              sku: line.products?.sku ?? "",
              barcode: line.products?.barcode ?? "",
              system_quantity: line.system_quantity_at_start,
              moved: line.moved_during_count ? "Sim" : "",
              expected: line.system_quantity_at_start,
              // null (não 0) — normalizeExportCell devolve célula vazia.
              counted_quantity: line.counted_quantity ?? null,
              difference: diff,
              resolution: line.discrepancy_resolution
                ? getResolutionLabel(line.discrepancy_resolution)
                : diff !== null && diff !== 0 ? "Por resolver" : "",
              note: line.resolution_notes ?? "",
            };
          }),
        },
        filename,
      );

      toast({
        title: t('stockCounts.export.successTitle'),
        description: t('stockCounts.export.successDescription', { count: lines.length, filename }),
      });
    } catch (error: any) {
      toast({
        title: t('stockCounts.export.errorTitle'),
        description: error?.message,
        variant: "destructive",
      });
    }
  };

  // Grava N quantidades contadas pela MESMA via da edição manual:
  //  · linhas com SKU único na contagem → rpc_bulk_update_inventory_count_lines
  //    (réplica em lote de rpc_update_inventory_count_line_quantity, por SKU),
  //    em lotes de CHUNK_SIZE;
  //  · linhas sem SKU (ou SKU repetido na contagem, ambíguo para a RPC por SKU)
  //    → rpc_update_inventory_count_line_quantity, uma a uma.
  // Cada chamada é a sua própria transação: um lote que falhe NÃO desfaz os
  // anteriores, por isso o erro é registado e devolvido, nunca lançado.
  // `fromFile` = false (Preencher = esperado): não há linhas de ficheiro, por
  // isso os erros de lote identificam-se pelos códigos, não por "linhas N–M".
  const writeCountedQuantities = async (
    entries: CountImportEntry[],
    { fromFile = true }: { fromFile?: boolean } = {},
  ): Promise<BulkWriteResult> => {
    const errors: CountImportErrorRow[] = [];
    let updated = 0;
    let incomplete = false;
    let notSent = 0;
    if (!countId || entries.length === 0) return { updated, errors, incomplete, notSent };

    // A RPC em lote resolve por SKU dentro da contagem — só é seguro para SKUs
    // que pertencem a UM produto da contagem. O resto vai linha a linha, pelo
    // id da linha (já resolvido sem ambiguidade em countImport).
    const skuUse = new Map<string, number>();
    for (const line of lines) {
      const key = normalizeCodeKey(line.products?.sku ?? "");
      if (key) skuUse.set(key, (skuUse.get(key) ?? 0) + 1);
    }
    const bySku = entries.filter((e) => e.sku && skuUse.get(normalizeCodeKey(e.sku)) === 1);
    const bySkuSet = new Set(bySku);
    const byLine = entries.filter((e) => !bySkuSet.has(e));

    let done = 0;
    setImportProgress({ current: 0, total: entries.length });

    for (let i = 0; i < bySku.length; i += CHUNK_SIZE) {
      const chunk = bySku.slice(i, i + CHUNK_SIZE);
      // (supabase.rpc as any): a RPC ainda não está no types.ts gerado.
      const { data, error } = await (supabase.rpc as any)('rpc_bulk_update_inventory_count_lines', {
        p_inventory_count_id: countId,
        p_lines: chunk.map((e) => ({ sku: e.sku, counted_quantity: e.counted_quantity, input_index: e.input_index })),
      });
      if (error) {
        const fromLine = chunk[0]?.input_index ?? 0;
        const toLine = chunk[chunk.length - 1]?.input_index ?? fromLine;
        const errorText = error.message || t('stockCounts.import.unknownError');
        errors.push(fromFile
          ? {
            line: fromLine,
            code: "—",
            reason: t('stockCounts.import.chunkFailed', { from: fromLine, to: toLine, error: errorText }),
          }
          : {
            line: fromLine,
            code: `${chunk[0]?.code ?? "—"} … ${chunk[chunk.length - 1]?.code ?? "—"}`,
            reason: `Lote de ${chunk.length} produto(s) não gravado: ${errorText}`,
          });
        incomplete = true;
        notSent = entries.length - done;
        return { updated, errors, incomplete, notSent };
      }
      const result = (data || {}) as any;
      const results = (result.results || []) as any[];
      const okCount = results.filter((r) => r?.status === "ok").length;
      updated += typeof result.updated === "number" ? result.updated : okCount;
      for (const r of results) {
        if (r?.status === "error") {
          const source = chunk.find((e) => e.input_index === Number(r.input_index));
          errors.push({
            line: Number(r.input_index ?? 0),
            code: r.sku || source?.code || "—",
            reason: r.error || t('stockCounts.import.unknownError'),
          });
        }
      }
      done += chunk.length;
      setImportProgress({ current: done, total: entries.length });
    }

    for (const entry of byLine) {
      const { error } = await supabase.rpc('rpc_update_inventory_count_line_quantity', {
        p_line_id: entry.lineId,
        p_counted_quantity: entry.counted_quantity,
      } as any);
      if (error) {
        errors.push({ line: entry.input_index, code: entry.code, reason: error.message });
      } else {
        updated += 1;
      }
      done += 1;
      setImportProgress({ current: done, total: entries.length });
    }

    return { updated, errors, incomplete, notSent };
  };

  // Fase 1 do Importar — só LÊ e valida o ficheiro e mostra a pré-visualização.
  // Nada é gravado até o utilizador confirmar.
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const preview = await parseCountImportFile(file, lines, {
        skuHeader: t('stockCounts.export.columnSku'),
        barcodeHeader: t('stockCounts.export.columnBarcode'),
        countedHeader: t('stockCounts.export.columnCountedQty'),
      });
      setIncludeResolved(false);
      setImportPreview(preview);
    } catch (error: any) {
      setImportPreview(null);
      toast({
        title: t('stockCounts.import.errorTitle'),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      // SEMPRE — senão re-selecionar o mesmo ficheiro (corrigido) não dispara onChange.
      inputEl.value = "";
      setImporting(false);
    }
  };

  // Entradas que a confirmação grava: sem as que perdem resolução, a não ser
  // que o utilizador as inclua explicitamente.
  const importEntriesToWrite = importPreview
    ? (includeResolved ? importPreview.entries : importPreview.entries.filter((e) => !e.losesResolution))
    : [];
  const importExcludedResolved = importPreview ? importPreview.entries.length - importEntriesToWrite.length : 0;

  // Fase 2 do Importar — grava as entradas da pré-visualização.
  const handleConfirmImport = async () => {
    if (!importPreview) return;
    const preview = importPreview;
    const toWrite = importEntriesToWrite;
    // As já resolvidas deixadas de fora contam como ignoradas no resumo.
    const skippedTotal = preview.skipped + importExcludedResolved;
    setImporting(true);
    let result: BulkWriteResult = { updated: 0, errors: [], incomplete: false, notSent: 0 };
    try {
      result = await writeCountedQuantities(toWrite);
    } catch (error: any) {
      // Rede de segurança: o que já foi gravado continua gravado.
      result = { ...result, incomplete: true };
      toast({ title: t('stockCounts.import.errorTitle'), description: error?.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }

    const errors = [...preview.errors, ...result.errors].sort((a, b) => a.line - b.line);
    if (result.incomplete) {
      toast({
        title: t('stockCounts.import.incompleteTitle'),
        description: t('stockCounts.import.incompleteSummary', { updated: result.updated, notSent: result.notSent }),
        variant: "destructive",
      });
    } else {
      toast({
        title: t('stockCounts.import.successTitle'),
        description: t('stockCounts.import.summary', { updated: result.updated, skipped: skippedTotal, failed: errors.length }),
      });
    }
    setImportPreview(null);
    setImportOpen(false);
    if (errors.length > 0) {
      setImportReport({ ...result, errors, skipped: skippedTotal });
    }
    // `incomplete` recarrega mesmo com updated = 0: um timeout de rede pode
    // ter deixado a escrita commitada do lado do servidor.
    if (result.updated > 0 || result.incomplete) {
      await loadDetail();
      onChanged();
    }
  };

  // "Preencher contadas = esperado": só as linhas AINDA VAZIAS, com o esperado
  // (= sistema no início da contagem — é contra esse valor que a app calcula a
  // diferença e que rpc_finalize_inventory_count valida). Nunca toca em linhas
  // já contadas, por isso nunca limpa uma resolução. Inclui as linhas com
  // recontagem pedida (a recontagem limpa a contada) — o texto de confirmação
  // di-lo explicitamente.
  const emptyLines = lines.filter((l) => l.counted_quantity == null);
  const emptyRecountLines = emptyLines.filter((l) => l.discrepancy_resolution === "recontagem_pedida").length;
  const handleFillExpected = async () => {
    if (importing || filling) return;
    const entries: CountImportEntry[] = emptyLines.map((line, index) => ({
      lineId: line.id,
      sku: line.products?.sku?.trim() || null,
      productName: line.products?.name || "-",
      code: line.products?.sku || line.products?.barcode || line.products?.name || "-",
      previous: null,
      counted_quantity: Math.max(0, line.system_quantity_at_start),
      input_index: index + 1,
    }));
    setFilling(true);
    let result: BulkWriteResult = { updated: 0, errors: [], incomplete: false, notSent: 0 };
    try {
      result = await writeCountedQuantities(entries, { fromFile: false });
    } catch (error: any) {
      result = { ...result, incomplete: true };
      toast({ title: "Erro ao preencher", description: error?.message, variant: "destructive" });
    } finally {
      setFilling(false);
      setImportProgress(null);
      setFillConfirmOpen(false);
    }
    if (result.errors.length > 0 || result.incomplete) {
      toast({
        title: "Preenchimento incompleto",
        description: `${result.updated} linha(s) preenchida(s); ${result.errors.length} com erro${result.notSent ? `, ${result.notSent} por enviar` : ""}.`,
        variant: "destructive",
      });
      setImportReport({ ...result, skipped: 0, withoutFileLines: true });
    } else {
      toast({ title: "Linhas por contar preenchidas com o esperado.", description: `${result.updated} linha(s).` });
    }
    if (result.updated > 0 || result.incomplete) {
      await loadDetail();
      onChanged();
    }
  };

  const getDiff = (line: InventoryCountLineRow): number | null => (
    line.counted_quantity == null ? null : line.counted_quantity - line.system_quantity_at_start
  );

  const getResolutionLabel = (resolution: string) => {
    switch (resolution) {
      case "ajustado": return t('stockCounts.detail.lines.resolutionAdjusted');
      case "aceite_sem_ajuste": return t('stockCounts.detail.lines.resolutionAccepted');
      case "recontagem_pedida": return t('stockCounts.detail.lines.resolutionRecount');
      default: return resolution;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "em_contagem": return t('stockCounts.status.emContagem');
      case "finalizada": return t('stockCounts.status.finalizada');
      case "cancelada": return t('stockCounts.status.cancelada');
      default: return status;
    }
  };

  // Cabeçalho da folha (ContagemFolha do protótipo): progresso e diferenças por
  // resolver, contados sobre TODAS as linhas (o filtro de categoria só muda a tabela).
  const countedLines = lines.filter((l) => l.counted_quantity != null).length;
  const unresolvedLines = lines.filter((l) => {
    const d = getDiff(l);
    return d !== null && d !== 0 && !l.discrepancy_resolution;
  }).length;
  const pendingLines = lines.length - countedLines + unresolvedLines;
  // Última atividade: a contagem mais recente de uma linha (ou o início/fecho).
  const lastActivity = [header?.started_at, header?.finalized_at, ...lines.map((l) => l.counted_at)]
    .filter((d): d is string => !!d)
    .reduce((max, d) => (new Date(d).getTime() > new Date(max).getTime() ? d : max), header?.started_at ?? new Date().toISOString());
  // Câmara/leitor, Importar e Preencher escrevem quantidades contadas — mesma
  // exigência das RPCs de contagem: inventory.count e sessão "em contagem".
  const countBlockedReason: string | null = !isActive
    ? "Contagem fechada: as quantidades corrigem-se com um ajuste em Movimentos"
    : !canCount
      ? NO_COUNT_PERMISSION
      : null;
  const statusTone: InventoryTone = header?.status === "finalizada" ? "ok" : header?.status === "cancelada" ? "neutral" : "info";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DocumentSheetContent
        crumbs="Armazém › Contagens"
        title={header?.document_number || t('stockCounts.detail.title')}
        titleClassName="font-mono"
        onClose={() => onOpenChange(false)}
        badges={
          header ? (
            <>
              <InventoryStatusBadge tone={statusTone}>{getStatusLabel(header.status)}</InventoryStatusBadge>
              <InventoryStatusBadge tone="neutral">{header.warehouses?.name || '-'}</InventoryStatusBadge>
              <InventoryStatusBadge tone="neutral">{header.product_categories?.name || t('stockCounts.allCategories')}</InventoryStatusBadge>
            </>
          ) : undefined
        }
        header={
          header && !loading ? (
            <>
              <DocInfoGrid
                items={[
                  {
                    label: "Iniciada",
                    value: `${new Date(header.started_at).toLocaleString('pt-PT')}${creatorName ? ` · ${creatorName}` : ""}`,
                  },
                  { label: "Última atividade", value: new Date(lastActivity).toLocaleString('pt-PT') },
                  header.finalized_at
                    ? { label: t('stockCounts.detail.finalizedAt'), value: new Date(header.finalized_at).toLocaleString('pt-PT') }
                    : null,
                  { label: "Progresso", value: `${countedLines} / ${lines.length} contadas` },
                  { label: "Por resolver", value: unresolvedLines },
                ]}
              />
              {/* Sempre visíveis (como no protótipo); desativados com o motivo
                  quando a contagem está fechada ou falta inventory.count. */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <ReasonButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  reason={countBlockedReason}
                  onClick={() => setScanOpen(true)}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Câmara / leitor
                </ReasonButton>
                {/* Exportar não escreve nada: quem abre a folha já vê estas linhas. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={lines.length === 0}
                  onClick={handleExport}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Exportar
                </Button>
                <ReasonButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  reason={countBlockedReason}
                  disabled={filling}
                  onClick={() => { setImportPreview(null); setImportOpen(true); }}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Importar
                </ReasonButton>
                <ReasonButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  reason={countBlockedReason ?? (emptyLines.length === 0 ? "Não há linhas por contar" : null)}
                  disabled={filling || importing}
                  onClick={() => setFillConfirmOpen(true)}
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Preencher contadas = esperado
                </ReasonButton>
              </div>
            </>
          ) : undefined
        }
        footer={
          header && isActive
            ? {
                left: (
                  <ReasonButton type="button" variant="ghost" reason={CANCEL_UNAVAILABLE}>
                    Cancelar contagem
                  </ReasonButton>
                ),
                right: (
                  <>
                    <span className="text-sm text-muted-foreground" aria-live="polite">
                      {pendingLines > 0 ? `${pendingLines} linha(s) por contar ou resolver` : "Pronta a finalizar"}
                    </span>
                    <ReasonButton
                      type="button"
                      reason={
                        !canEdit
                          ? NO_EDIT_PERMISSION
                          : unresolvedLines > 0
                            ? `Há ${unresolvedLines} diferença(s) por resolver`
                            : null
                      }
                      onClick={handleFinalize}
                      disabled={finalizing || loading}
                    >
                      <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                      {finalizing ? t('stockCounts.detail.finalizing') : t('stockCounts.detail.finalize')}
                    </ReasonButton>
                  </>
                ),
              }
            : header
              ? {
                  right: (
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Fechar
                    </Button>
                  ),
                }
              : null
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <OlyviaLoader size={32} />
          </div>
        ) : header ? (
          <div className="space-y-6">
            {isActive && !canEdit && canCount && (
              <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
                {t('stockCounts.detail.countOnlyNotice')}
              </p>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[15px] font-semibold">{t('stockCounts.detail.lines.title')}</h3>
              </div>
              {lines.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <CategorySubcategoryFilter
                    categoryId={lineCategoryFilter}
                    subcategoryId={lineSubcategoryFilter}
                    onChange={({ categoryId, subcategoryId }) => {
                      setLineCategoryFilter(categoryId);
                      setLineSubcategoryFilter(subcategoryId);
                      setLinePage(0);
                    }}
                    triggerClassName="h-9 w-[200px]"
                  />
                  {lineFilterActive && (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={clearLineFilters}>
                        {t('stockCounts.clearFilters')}
                      </Button>
                      <span className="text-xs text-muted-foreground" aria-live="polite">
                        {t('stockCounts.detail.lines.filteredInfo', { shown: filteredLines.length, total: lines.length })}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div className={DOC_TABLE_WRAP_CLASS}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockCounts.detail.lines.product')}</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Movida durante</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right w-32">Contada</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead className="min-w-[190px]">Resolução</TableHead>
                    <TableHead className="min-w-[180px]">Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t('stockCounts.detail.lines.noLines')}
                      </TableCell>
                    </TableRow>
                  ) : filteredLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t('stockCounts.detail.lines.noFilteredLines')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleLines.map((line) => {
                      const diff = getDiff(line);
                      const needsResolution = diff !== null && diff !== 0 && !line.discrepancy_resolution;
                      const canResolveHere = needsResolution && canEdit && isActive;
                      const draft = resolutionDrafts[line.id] || { resolution: "" as const, notes: "" };
                      const productName = line.products?.name || '-';
                      return (
                        <TableRow key={line.id} ref={(el) => { rowRefs.current[line.id] = el; }}>
                          <TableCell className="font-medium">
                            <div>{productName}</div>
                            {line.products?.sku && (
                              <div className="font-mono text-xs text-muted-foreground">{line.products.sku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{line.system_quantity_at_start}</TableCell>
                          <TableCell className="text-right">
                            {line.moved_during_count ? (
                              <Badge
                                variant="outline"
                                className="gap-1"
                                title="Houve movimentos deste produto no armazém durante a contagem. “Ajustado” usa o saldo atual."
                              >
                                <ArrowRightLeft className="h-3 w-3" aria-hidden="true" /> {t('stockCounts.detail.lines.movedBadge')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {/* A app não guarda a quantidade movida durante a contagem
                              (só a marca moved_during_count): o esperado é o
                              sistema no início, que é o que a finalização valida. */}
                          <TableCell className="text-right tabular-nums">{line.system_quantity_at_start}</TableCell>
                          <TableCell className="text-right">
                            {canCount && isActive ? (
                              <Input
                                ref={(el) => { quantityInputRefs.current[line.id] = el; }}
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                aria-label={`Contada ${productName}`}
                                className="w-24 ml-auto text-right"
                                value={quantityDrafts[line.id] ?? ""}
                                placeholder={t('stockCounts.detail.lines.countPlaceholder')}
                                disabled={savingLineId === line.id || filling || importing}
                                onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                onBlur={() => handleSaveQuantity(line.id)}
                                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              />
                            ) : (
                              <span className="tabular-nums">{line.counted_quantity ?? "—"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {diff === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : diff === 0 ? (
                              <InventoryStatusBadge tone="ok">0</InventoryStatusBadge>
                            ) : (
                              <InventoryStatusBadge tone="bad">{diff > 0 ? `+${diff}` : diff}</InventoryStatusBadge>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.discrepancy_resolution ? (
                              <Badge variant="secondary">{getResolutionLabel(line.discrepancy_resolution)}</Badge>
                            ) : canResolveHere ? (
                              <div className="flex items-center gap-1.5">
                                <Select
                                  value={draft.resolution || "pendente"}
                                  onValueChange={(v) => updateResolutionDraft(line.id, { resolution: v === "pendente" ? "" : v as ResolutionType })}
                                >
                                  <SelectTrigger className="h-8 text-xs" aria-label={`Resolução ${productName}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pendente">Por resolver</SelectItem>
                                    <SelectItem value="ajustado">{t('stockCounts.detail.lines.resolutionAdjusted')}</SelectItem>
                                    <SelectItem value="aceite_sem_ajuste">{t('stockCounts.detail.lines.resolutionAccepted')}</SelectItem>
                                    <SelectItem value="recontagem_pedida">{t('stockCounts.detail.lines.resolutionRecount')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                {draft.resolution && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={resolvingLineId === line.id}
                                    onClick={() => handleResolveLine(line.id)}
                                  >
                                    {resolvingLineId === line.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : t('stockCounts.detail.lines.confirm')}
                                  </Button>
                                )}
                              </div>
                            ) : needsResolution ? (
                              <span className="text-xs text-muted-foreground" title={!canEdit ? NO_EDIT_PERMISSION : undefined}>Por resolver</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.discrepancy_resolution || !canResolveHere ? (
                              <span className="text-xs text-muted-foreground">{line.resolution_notes || "—"}</span>
                            ) : (
                              <Input
                                className="h-8 text-xs"
                                aria-label={`Nota ${productName}`}
                                placeholder={draft.resolution === "aceite_sem_ajuste" ? "Motivo (obrigatório)" : "Nota"}
                                value={draft.notes}
                                onChange={(e) => updateResolutionDraft(line.id, { notes: e.target.value })}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Diferença = contada − sistema no início da contagem (o esperado). “Ajustado” gera logo um movimento de ajuste contra o saldo atual; “Aceite sem ajuste” exige motivo na nota; “Recontagem” limpa a contada e a linha volta a ficar por contar. Só se finaliza sem diferenças por resolver.
                </span>
              </p>
              {paginateLines && (
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {t('stockCounts.detail.lines.pageInfo', {
                      from: lineRangeStart + 1,
                      to: lineRangeStart + visibleLines.length,
                      total: filteredLines.length,
                      page: safeLinePage + 1,
                      pages: linePageCount,
                    })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeLinePage === 0}
                      onClick={() => setLinePage(Math.max(safeLinePage - 1, 0))}
                    >
                      {t('stockCounts.detail.lines.prevPage')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeLinePage >= linePageCount - 1}
                      onClick={() => setLinePage(Math.min(safeLinePage + 1, linePageCount - 1))}
                    >
                      {t('stockCounts.detail.lines.nextPage')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[15px] font-semibold mb-2">{t('stockCounts.detail.movements.title')}</h3>
              <div className={DOC_TABLE_WRAP_CLASS}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockCounts.detail.movements.date')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.type')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.movements.quantity')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.movements.balanceAfter')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.document')}</TableHead>
                    <TableHead>{t('stockCounts.detail.movements.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">{t('stockCounts.detail.movements.loading')}</TableCell></TableRow>
                  ) : movements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t('stockCounts.detail.movements.none')}</TableCell></TableRow>
                  ) : (
                    movements.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{new Date(row.created_at).toLocaleString('pt-PT')}</TableCell>
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
                        <TableCell className="text-muted-foreground text-xs">
                          {[row.counterparty, row.notes].filter(Boolean).join(" · ") || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
        ) : null}
      </DocumentSheetContent>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contar com leitor / câmara</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cada leitura soma 1 à contada do produto (procura por SKU ou EAN).
            </p>
            {/* Leitor de mão (USB/Bluetooth): escreve o código e Enter. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = manualCode.trim();
                if (!code) return;
                handleScanResult(code, true);
                setManualCode("");
              }}
            >
              <label htmlFor="count-scan-code" className="mb-1 block text-xs font-medium text-muted-foreground">
                Código (leitor ou teclado)
              </label>
              <Input
                id="count-scan-code"
                autoFocus
                autoComplete="off"
                placeholder="Leia ou escreva o código e Enter"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
            </form>
            {scanError ? (
              <p className="text-sm text-destructive border rounded-md p-3 bg-destructive/10">
                {scanError}
              </p>
            ) : (
              <div className="relative rounded-md overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full aspect-video"
                  width={640}
                  height={360}
                  muted
                  playsInline
                  autoPlay
                />
              </div>
            )}
            {videoDevices.length > 1 && (
              <Select
                value={selectedDeviceId ?? videoDevices[0]?.deviceId}
                onValueChange={setSelectedDeviceId}
              >
                <SelectTrigger aria-label={t('stockCounts.scan.cameraLabel')}>
                  <SelectValue placeholder={t('stockCounts.scan.cameraLabel')} />
                </SelectTrigger>
                <SelectContent>
                  {videoDevices.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || `${t('stockCounts.scan.cameraLabel')} ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">{t('stockCounts.scan.hint')}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScanOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(next) => {
          // Enquanto a escrita decorre, fechar perdia o relatório.
          if (importing) return;
          setImportOpen(next);
          if (!next) setImportPreview(null);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[85vh] flex flex-col"
          hideClose={importing}
          onInteractOutside={(e) => { if (importing) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Importar contagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              CSV ou Excel com uma coluna <strong>SKU</strong> (ou <strong>EAN</strong>/código de barras) e uma
              coluna <strong>Qtd contada</strong> — o ficheiro de Exportar serve. Linhas sem quantidade ficam por
              contar. Primeiro vê a pré-visualização; nada é gravado até confirmar.
            </p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              aria-label="Ficheiro da contagem"
              onChange={handleImportFile}
              disabled={importing}
            />
            {importing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {importProgress
                  ? t('stockCounts.import.progress', { current: importProgress.current, total: importProgress.total })
                  : t('stockCounts.import.progressReading')}
              </div>
            )}
            {importPreview && !importing && (
              <div className="space-y-3">
                <div className={cn(
                  "grid grid-cols-2 gap-2 text-center",
                  importPreview.losingResolution > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4",
                )}>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-semibold text-primary">{importEntriesToWrite.length}</div>
                    <div className="text-xs text-muted-foreground">a gravar</div>
                  </div>
                  {importPreview.losingResolution > 0 && (
                    <div className="rounded-md border border-amber-500/50 p-2">
                      <div className="text-xl font-semibold text-amber-600">{importPreview.losingResolution}</div>
                      <div className="text-xs text-muted-foreground">já resolvidas (perdem resolução)</div>
                    </div>
                  )}
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-semibold">{importPreview.unchanged}</div>
                    <div className="text-xs text-muted-foreground">iguais (não reenviadas)</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-semibold">{importPreview.skipped}</div>
                    <div className="text-xs text-muted-foreground">sem quantidade</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-xl font-semibold text-destructive">{importPreview.errors.length}</div>
                    <div className="text-xs text-muted-foreground">com erro</div>
                  </div>
                </div>
                {importPreview.losingResolution > 0 && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                    <p className="mb-2">
                      {importPreview.losingResolution} linha(s) já estão resolvidas (Ajustado / Aceite sem ajuste) e o
                      ficheiro muda a contada — gravá-las limpa a resolução e a diferença volta a ficar por resolver.
                      Por omissão ficam de fora.
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="count-import-include-resolved"
                        checked={includeResolved}
                        onCheckedChange={(v) => setIncludeResolved(v === true)}
                      />
                      <label htmlFor="count-import-include-resolved" className="cursor-pointer">
                        Incluir também as {importPreview.losingResolution} já resolvidas
                      </label>
                    </div>
                  </div>
                )}
                {importPreview.entries.length > 0 && (
                  <div className="rounded-md border max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <caption className="sr-only">Linhas a gravar</caption>
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th scope="col" className="text-left p-2">Linha</th>
                          <th scope="col" className="text-left p-2">Produto</th>
                          <th scope="col" className="text-right p-2">Atual</th>
                          <th scope="col" className="text-right p-2">Nova</th>
                          {importPreview.losingResolution > 0 && (
                            <th scope="col" className="text-left p-2">Perde resolução</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.entries.slice(0, 100).map((entry) => {
                          const excluded = entry.losesResolution && !includeResolved;
                          return (
                            <tr key={entry.lineId} className={cn("border-t", excluded && "text-muted-foreground")}>
                              <td className="p-2">{entry.input_index}</td>
                              <td className="p-2">
                                {entry.productName}
                                <span className="ml-1 font-mono text-muted-foreground">{entry.code}</span>
                              </td>
                              <td className="p-2 text-right">{entry.previous ?? "—"}</td>
                              <td className={cn("p-2 text-right", excluded ? "line-through" : "font-medium")}>
                                {entry.counted_quantity}
                              </td>
                              {importPreview.losingResolution > 0 && (
                                <td className="p-2">
                                  {entry.losesResolution && entry.previousResolution ? (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {getResolutionLabel(entry.previousResolution)}
                                      {excluded ? " · não incluída" : ""}
                                    </span>
                                  ) : "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {importPreview.entries.length > 100 && (
                      <p className="p-2 text-xs text-muted-foreground">e mais {importPreview.entries.length - 100} linha(s).</p>
                    )}
                  </div>
                )}
                {importPreview.errors.length > 0 && (
                  <div>
                    <div className="mb-1 text-sm font-medium">Linhas com erro (não são gravadas)</div>
                    <div className="rounded-md border max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <caption className="sr-only">Linhas com erro</caption>
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th scope="col" className="text-left p-2">Linha</th>
                            <th scope="col" className="text-left p-2">Código</th>
                            <th scope="col" className="text-left p-2">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.errors.slice(0, 50).map((row, index) => (
                            <tr key={`${row.line}-${index}`} className="border-t">
                              <td className="p-2">{row.line}</td>
                              <td className="p-2 font-mono">{row.code}</td>
                              <td className="p-2">{row.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importPreview.errors.length > 50 && (
                      <p className="mt-1 text-xs text-muted-foreground">e mais {importPreview.errors.length - 50} erro(s).</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => { setImportOpen(false); setImportPreview(null); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={importing || !importPreview || importEntriesToWrite.length === 0}
              onClick={handleConfirmImport}
            >
              {importEntriesToWrite.length > 0
                ? `Gravar ${importEntriesToWrite.length} linha(s)`
                : "Gravar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={fillConfirmOpen} onOpenChange={(next) => { if (!filling) setFillConfirmOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Preencher contadas = esperado</AlertDialogTitle>
            <AlertDialogDescription>
              As {emptyLines.length} linha(s) ainda por contar ficam com a contada igual ao esperado (sistema no
              início da contagem)
              {emptyRecountLines > 0
                ? <>, <strong>incluindo {emptyRecountLines} com recontagem pedida</strong></>
                : null}
              . As linhas já contadas não mudam. Use só se confirmou fisicamente esses produtos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {filling && importProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {importProgress.current} / {importProgress.total}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={filling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={filling || importing || emptyLines.length === 0}
              onClick={(e) => { e.preventDefault(); handleFillExpected(); }}
            >
              {filling ? "A preencher…" : `Preencher ${emptyLines.length} linha(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!importReport} onOpenChange={(next) => { if (!next) setImportReport(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('stockCounts.import.reportTitle')}</DialogTitle>
          </DialogHeader>
          {importReport && (
            <div className="space-y-4 overflow-y-auto">
              {importReport.incomplete && (
                <p className="text-sm border rounded-md p-3 bg-destructive/10 text-destructive">
                  {t('stockCounts.import.incompleteNotice', {
                    updated: importReport.updated,
                    notSent: importReport.notSent,
                  })}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold text-primary">{importReport.updated}</div>
                  <div className="text-xs text-muted-foreground">{t('stockCounts.import.reportUpdated')}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{importReport.skipped}</div>
                  <div className="text-xs text-muted-foreground">{t('stockCounts.import.reportSkipped')}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold text-destructive">{importReport.errors.length}</div>
                  <div className="text-xs text-muted-foreground">{t('stockCounts.import.reportFailed')}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">{t('stockCounts.import.reportErrorsTitle')}</div>
                <div className="rounded-md border max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {!importReport.withoutFileLines && (
                          <th scope="col" className="text-left p-2">{t('stockCounts.import.reportLine')}</th>
                        )}
                        <th scope="col" className="text-left p-2">{importReport.withoutFileLines ? "SKU / código" : "Código"}</th>
                        <th scope="col" className="text-left p-2">{t('stockCounts.import.reportReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReport.errors.slice(0, 50).map((row, index) => (
                        <tr key={`${row.line}-${row.code}-${index}`} className="border-t">
                          {!importReport.withoutFileLines && <td className="p-2">{row.line}</td>}
                          <td className="p-2 font-mono">{row.code}</td>
                          <td className="p-2">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importReport.errors.length > 50 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t('stockCounts.import.reportMore', { count: importReport.errors.length - 50 })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportReport(null)}>
              {t('stockCounts.import.reportClose')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
