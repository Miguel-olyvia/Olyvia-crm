import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { ArrowRightLeft, Download, Loader2, ScanLine, Upload } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import * as XLSX from "xlsx";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

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
  products?: { name: string; sku: string | null; barcode: string | null } | null;
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

// Sem acentos, sem maiúsculas e sem pontuação — "Qtd. Contada", "qtd contada"
// e "QTD CONTADA" colapsam todos para "qtd contada".
const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Aliases fixos (nas 5 línguas) para além do cabeçalho traduzido do idioma
// ativo — o ficheiro pode ter sido exportado por um colega noutro idioma.
const SKU_HEADER_ALIASES = new Set([
  "sku", "codigo", "codigo do produto", "code", "product code",
  "referencia", "reference", "artikelnummer", "ref",
]);
const COUNTED_HEADER_ALIASES = new Set([
  "qtd contada", "qtd contada unid", "quantidade contada", "contada",
  "counted qty", "counted quantity", "counted",
  "cantidad contada", "cant contada",
  "qte comptee", "quantite comptee", "comptee",
  "gezahlte menge", "menge gezahlt", "gezahlt",
]);

// O separador NÃO pode ser assumido: o export do projeto produz ';', mas quem
// abre o XLSX no Excel e faz "Guardar como CSV" obtém ';' ou ',' conforme o
// locale do Windows, e há ainda quem exporte separado por tabulações. Um
// separador errado dá UMA coluna só por linha, e o erro que chegava ao
// utilizador era "Colunas em falta" — a apontar para o sítio errado.
// Conta os candidatos na primeira linha não vazia (fora de aspas) e escolhe o
// dominante; empate ou ficheiro de uma só coluna mantém ';'.
const CSV_DELIMITER_CANDIDATES = [";", ",", "\t"] as const;

const detectCsvDelimiter = (text: string): string => {
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { i += 1; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\n") {
      // Linha vazia no topo do ficheiro não termina a deteção.
      if (counts[";"] > 0 || counts[","] > 0 || counts["\t"] > 0) break;
      continue;
    }
    if (char in counts) counts[char] += 1;
  }
  let best: string = ";";
  for (const candidate of CSV_DELIMITER_CANDIDATES) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return counts[best] > 0 ? best : ";";
};

// Parser de CSV tolerante a campos entre aspas com o separador lá dentro e a
// quebras de linha dentro das aspas.
const parseCsvToMatrix = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Tira o BOM: o carácter U+FEFF tal e qual (comparado por code point, para
  // não deixar whitespace irregular no código) e também a versão já mal
  // descodificada ("ï»¿"), que é o que sobra quando se relê um ficheiro
  // UTF-8 como Windows-1252.
  const source = (text.codePointAt(0) === 0xFEFF ? text.slice(1) : text).replace(/^ï»¿/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === delimiter) { row.push(field); field = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

const buildCsvMatrix = (text: string): string[][] => parseCsvToMatrix(text, detectCsvDelimiter(text));

// O export do projeto (xlsxExport.normalizeExportCell) prefixa um apóstrofo a
// qualquer texto começado por = + - @ — proteção contra injeção de fórmulas no
// Excel. Um SKU como "-1234" volta do ficheiro como "'-1234" e deixava de
// casar, com o utilizador a ver "Produto não encontrado nesta contagem" sem
// perceber porquê. Ao ler, desfazemos esse escape.
const stripSpreadsheetEscape = (value: unknown): string =>
  String(value ?? "").trim().replace(/^'/, "");

// Chave de comparação de SKU alinhada com a RPC (upper + btrim): é assim que
// rpc_bulk_update_inventory_count_lines resolve o SKU dentro da contagem, por
// isso é assim que temos de detetar duplicados no ficheiro.
const normalizeSkuKey = (sku: string): string => sku.trim().toUpperCase();

// Uma só forma (em vez de uma união discriminada): o tsconfig deste projeto
// corre com strict: false, e nesse modo o narrowing por discriminante booleano
// não é fiável.
interface ImportColumnLookup {
  status: "ok" | "empty" | "missingSku" | "missingCounted" | "missingBoth";
  headerRowIndex: number;
  skuIndex: number;
  countedIndex: number;
}

// Localiza a linha de cabeçalho e as duas colunas obrigatórias. Devolve o
// motivo em vez de lançar: quem chama pode tentar outra descodificação do
// ficheiro antes de desistir.
const locateImportColumns = (
  matrix: unknown[][],
  skuAliases: Set<string>,
  countedAliases: Set<string>,
): ImportColumnLookup => {
  const headerRowIndex = matrix.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (headerRowIndex === -1) {
    return { status: "empty", headerRowIndex: -1, skuIndex: -1, countedIndex: -1 };
  }

  const headerCells = (matrix[headerRowIndex] || []).map(normalizeHeader);
  const skuIndex = headerCells.findIndex((cell) => skuAliases.has(cell));
  const countedIndex = headerCells.findIndex((cell) => countedAliases.has(cell));

  let status: ImportColumnLookup["status"] = "ok";
  if (skuIndex === -1 && countedIndex === -1) status = "missingBoth";
  else if (skuIndex === -1) status = "missingSku";
  else if (countedIndex === -1) status = "missingCounted";

  return { status, headerRowIndex, skuIndex, countedIndex };
};

// Devolve null quando o valor não é uma quantidade válida (inteiro >= 0).
// Quem chama tem de tratar a célula vazia ANTES — vazia não é inválida, é uma
// linha que o utilizador simplesmente não contou.
const parseCountedQuantity = (raw: unknown): number | null => {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  // stripSpreadsheetEscape por simetria com o SKU: uma quantidade escrita à
  // mão como "-1" chegaria aqui prefixada e tem de ser rejeitada como
  // quantidade inválida, não confundida com texto.
  const text = stripSpreadsheetEscape(raw).replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
};

interface ImportErrorRow {
  line: number;
  sku: string;
  reason: string;
}

interface ImportReport {
  updated: number;
  skipped: number;
  errors: ImportErrorRow[];
  // true quando um lote falhou a meio: os lotes anteriores JÁ estão gravados
  // (cada chamada RPC é a sua própria transação) e o resto do ficheiro nunca
  // chegou a ser enviado.
  incomplete: boolean;
  notSent: number;
}

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

  // Página atual da tabela de linhas (só usada acima de LINE_PAGINATION_THRESHOLD).
  const [linePage, setLinePage] = useState(0);

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

  const isActive = header?.status === "em_contagem";

  // Paginação client-side da tabela de linhas. `safeLinePage` é derivado (não
  // é estado): assim uma contagem que encolha — recarregada noutra sessão —
  // nunca deixa a tabela presa numa página que já não existe.
  const paginateLines = lines.length > LINE_PAGINATION_THRESHOLD;
  const linePageCount = paginateLines ? Math.ceil(lines.length / LINE_PAGE_SIZE) : 1;
  const safeLinePage = Math.min(Math.max(linePage, 0), linePageCount - 1);
  const lineRangeStart = paginateLines ? safeLinePage * LINE_PAGE_SIZE : 0;
  const visibleLines = paginateLines
    ? lines.slice(lineRangeStart, lineRangeStart + LINE_PAGE_SIZE)
    : lines;

  const loadDetail = useCallback(async () => {
    if (!countId) return;
    setLoading(true);
    try {
      const { data: headerData, error: headerError } = await supabase
        .from("inventory_counts")
        .select("id, document_number, status, started_at, finalized_at, warehouse_id, category_id, warehouses(name), product_categories(name)")
        .eq("id", countId)
        .single();
      if (headerError) throw headerError;
      setHeader(headerData as unknown as InventoryCountHeader);

      const { data: lineData, error: lineError } = await fetchAllRows(() =>
        supabase
          .from("inventory_count_lines")
          .select("id, product_id, system_quantity_at_start, counted_quantity, counted_at, discrepancy_resolution, resolution_notes, moved_during_count, stock_movement_id, products(name, sku, barcode)")
          .eq("inventory_count_id", countId)
          .order("name", { foreignTable: "products", ascending: true })
      );
      if (lineError) throw lineError;
      const rows = (lineData || []) as unknown as InventoryCountLineRow[];
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
    }
  }, [open]);

  // Abrir outra contagem (ou reabrir esta) volta sempre à primeira página.
  useEffect(() => {
    setLinePage(0);
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

  const handleScanResult = useCallback((code: string) => {
    const now = Date.now();
    if (now - lastScanAtRef.current < SCAN_COOLDOWN_MS) return;
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
    // o utilizador ouvia o "bip", via o toast e não via a linha a mudar.
    if (lines.length > LINE_PAGINATION_THRESHOLD) {
      const matchIndex = lines.findIndex((l) => l.id === match.id);
      if (matchIndex >= 0) setLinePage(Math.floor(matchIndex / LINE_PAGE_SIZE));
    }

    const newQty = (match.counted_quantity ?? 0) + 1;
    persistQuantity(match.id, newQty)
      .then(() => {
        toast({
          title: t('stockCounts.scan.foundTitle'),
          description: t('stockCounts.scan.foundCountDescription', {
            name: match.products?.name || code,
            qty: newQty,
          }),
        });
      })
      .catch((error: any) => {
        toast({ title: t('stockCounts.toast.quantityError'), description: error.message, variant: "destructive" });
      });
  }, [findLineByCode, lines, persistQuantity, t, toast]);

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
    try {
      await persistQuantity(lineId, qty);
    } catch (error: any) {
      toast({ title: t('stockCounts.toast.quantityError'), description: error.message, variant: "destructive" });
      setQuantityDrafts((prev) => ({ ...prev, [lineId]: line.counted_quantity != null ? String(line.counted_quantity) : "" }));
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

  // Exporta as linhas já carregadas no diálogo para XLSX (helper partilhado
  // do projeto — trata do anti-injeção de fórmulas e das larguras). "Qtd
  // contada"/"Diferença" ficam VAZIAS enquanto a linha não foi contada: é
  // este o ficheiro que o utilizador leva para o armazém e preenche.
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
      // Prefixo traduzido (sem acentos nem espaços — é um nome de ficheiro):
      // um utilizador DE recebia um ficheiro chamado "contagem_...".
      const prefix = (t('stockCounts.export.filenamePrefix') || "stocktake").replace(/[^\w.-]+/g, "_");
      const documentNumber = (header?.document_number || "").replace(/[^\w.-]+/g, "_") || prefix;
      const filename = `${prefix}_${documentNumber}_${stamp}.xlsx`;

      downloadStandardXlsx(
        {
          sheetName: t('stockCounts.export.sheetName'),
          columns: [
            { key: "sku", header: t('stockCounts.export.columnSku'), type: "text" },
            { key: "barcode", header: t('stockCounts.export.columnBarcode'), type: "text" },
            { key: "product", header: t('stockCounts.export.columnProduct'), type: "text" },
            { key: "system_quantity", header: t('stockCounts.export.columnSystemQty'), type: "number" },
            { key: "counted_quantity", header: t('stockCounts.export.columnCountedQty'), type: "number" },
            { key: "difference", header: t('stockCounts.export.columnDifference'), type: "number" },
          ],
          rows: lines.map((line) => ({
            sku: line.products?.sku ?? "",
            barcode: line.products?.barcode ?? "",
            product: line.products?.name ?? "",
            system_quantity: line.system_quantity_at_start,
            // null (não 0) — normalizeExportCell devolve célula vazia.
            counted_quantity: line.counted_quantity ?? null,
            difference: line.counted_quantity == null
              ? null
              : line.counted_quantity - line.system_quantity_at_start,
          })),
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

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (!countId) {
      inputEl.value = "";
      return;
    }

    setImporting(true);
    setImportProgress(null);

    // Fase 1 — LEITURA E VALIDAÇÃO DO FICHEIRO. É só esta fase que o try/catch
    // cobre: enquanto não se escreve nada na base, lançar e mostrar "erro ao
    // importar" é honesto. A fase 2 (escrita em lotes) trata os erros dela
    // própria, porque aí já pode haver linhas gravadas.
    let parsed: {
      payload: { sku: string; counted_quantity: number; input_index: number }[];
      errors: ImportErrorRow[];
      skipped: number;
    };
    try {
      const skuAliases = new Set([
        ...SKU_HEADER_ALIASES,
        normalizeHeader(t('stockCounts.export.columnSku')),
      ]);
      const countedAliases = new Set([
        ...COUNTED_HEADER_ALIASES,
        normalizeHeader(t('stockCounts.export.columnCountedQty')),
      ]);

      // Mesmo padrão de leitura do import de produtos (Products.tsx): XLSX/XLS
      // pela biblioteca, CSV pelo parser próprio (separador detetado).
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      let matrix: unknown[][];
      let located: ImportColumnLookup;
      if (isExcel) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
        located = locateImportColumns(matrix, skuAliases, countedAliases);
      } else {
        const buffer = await file.arrayBuffer();
        matrix = buildCsvMatrix(new TextDecoder("utf-8").decode(buffer));
        located = locateImportColumns(matrix, skuAliases, countedAliases);
        if (located.status !== "ok" && located.status !== "empty") {
          // O Excel grava CSV em ANSI/Windows-1252 conforme o locale — lido
          // como UTF-8, o cabeçalho "Qté comptée"/"Gezählte Menge" chega
          // mojibake e nenhum alias casa. Segunda tentativa antes de desistir.
          const ansiMatrix = buildCsvMatrix(new TextDecoder("windows-1252").decode(buffer));
          const ansiLocated = locateImportColumns(ansiMatrix, skuAliases, countedAliases);
          if (ansiLocated.status === "ok") {
            matrix = ansiMatrix;
            located = ansiLocated;
          }
        }
      }

      if (located.status !== "ok") {
        if (located.status === "empty") {
          throw new Error(t('stockCounts.import.emptyFile'));
        }
        const missingColumns: string[] = [];
        if (located.status === "missingSku" || located.status === "missingBoth") {
          missingColumns.push(t('stockCounts.export.columnSku'));
        }
        if (located.status === "missingCounted" || located.status === "missingBoth") {
          missingColumns.push(t('stockCounts.export.columnCountedQty'));
        }
        throw new Error(t('stockCounts.import.missingColumns', { columns: missingColumns.join(", ") }));
      }

      const { headerRowIndex, skuIndex, countedIndex } = located;

      const linesBySku = new Map<string, InventoryCountLineRow>();
      for (const line of lines) {
        const key = normalizeSkuKey(line.products?.sku ?? "");
        if (key) linesBySku.set(key, line);
      }

      let payload: { sku: string; counted_quantity: number; input_index: number }[] = [];
      const errors: ImportErrorRow[] = [];
      let skipped = 0;

      for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
        const row = matrix[i] || [];
        // Número da linha no ficheiro (1-based) — é o mesmo número que o
        // utilizador vê na margem do Excel.
        const inputIndex = i + 1;
        const rawSku = stripSpreadsheetEscape(row[skuIndex]);
        const rawQuantity = stripSpreadsheetEscape(row[countedIndex]);

        if (rawSku === "" && rawQuantity === "") continue; // linha vazia do ficheiro
        // Por contar: é o caso normal (só se preenche parte do ficheiro).
        if (rawQuantity === "") { skipped += 1; continue; }

        if (rawSku === "") {
          errors.push({
            line: inputIndex,
            sku: t('stockCounts.import.unknownSku'),
            reason: t('stockCounts.import.missingSku'),
          });
          continue;
        }
        const quantity = parseCountedQuantity(row[countedIndex]);
        if (quantity === null) {
          errors.push({
            line: inputIndex,
            sku: rawSku,
            reason: t('stockCounts.import.invalidQuantity', { value: rawQuantity }),
          });
          continue;
        }
        if (!linesBySku.has(normalizeSkuKey(rawSku))) {
          errors.push({
            line: inputIndex,
            sku: rawSku,
            reason: t('stockCounts.import.productNotFound'),
          });
          continue;
        }
        payload.push({ sku: rawSku, counted_quantity: quantity, input_index: inputIndex });
      }

      // SKUs repetidos no ficheiro (a mesma prateleira contada em dois sítios):
      // enviados tal e qual, venceria a última linha em silêncio e o relatório
      // diria "2 atualizadas" para 1 produto. Quem decide qual vale é o
      // utilizador — as linhas em conflito NÃO são enviadas, as outras seguem.
      const occurrencesBySku = new Map<string, number[]>();
      for (const entry of payload) {
        const key = normalizeSkuKey(entry.sku);
        const list = occurrencesBySku.get(key);
        if (list) list.push(entry.input_index);
        else occurrencesBySku.set(key, [entry.input_index]);
      }
      const duplicateKeys = new Set<string>();
      for (const [key, occurrences] of occurrencesBySku) {
        if (occurrences.length < 2) continue;
        duplicateKeys.add(key);
        const displaySku = payload.find((entry) => normalizeSkuKey(entry.sku) === key)?.sku ?? key;
        const conflictLines = occurrences.join(", ");
        for (const occurrence of occurrences) {
          errors.push({
            line: occurrence,
            sku: displaySku,
            reason: t('stockCounts.import.duplicateSku', { sku: displaySku, lines: conflictLines }),
          });
        }
      }
      if (duplicateKeys.size > 0) {
        payload = payload.filter((entry) => !duplicateKeys.has(normalizeSkuKey(entry.sku)));
      }

      parsed = { payload, errors, skipped };
    } catch (error: any) {
      toast({
        title: t('stockCounts.import.errorTitle'),
        description: error?.message,
        variant: "destructive",
      });
      inputEl.value = "";
      setImporting(false);
      setImportProgress(null);
      return;
    }

    // Fase 2 — ESCRITA. Cada chamada RPC é a sua própria transação: se o lote
    // 3 falhar, os lotes 1 e 2 JÁ estão gravados na base. Lançar daqui para um
    // catch genérico deitava fora o `updated` acumulado e nunca corria o
    // relatório nem o loadDetail — o utilizador via "Erro ao importar" e a
    // tabela com as quantidades antigas, com meia contagem já escrita, e
    // reimportava por cima. Por isso o erro é apanhado AQUI, registado como
    // erro do lote (com o intervalo de linhas), e o fluxo segue normalmente.
    const { payload, errors, skipped } = parsed;
    let updated = 0;
    let incomplete = false;
    let notSent = 0;
    try {
      if (payload.length > 0) {
        setImportProgress({ current: 0, total: payload.length });
        for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
          const chunk = payload.slice(i, i + CHUNK_SIZE);
          // (supabase.rpc as any): a RPC é nova e ainda não está no
          // types.ts gerado — mesmo padrão já usado noutras páginas.
          const { data, error } = await (supabase.rpc as any)('rpc_bulk_update_inventory_count_lines', {
            p_inventory_count_id: countId,
            p_lines: chunk,
          });
          if (error) {
            const fromLine = chunk[0]?.input_index ?? 0;
            const toLine = chunk[chunk.length - 1]?.input_index ?? fromLine;
            errors.push({
              line: fromLine,
              sku: t('stockCounts.import.unknownSku'),
              reason: t('stockCounts.import.chunkFailed', {
                from: fromLine,
                to: toLine,
                error: error.message || t('stockCounts.import.unknownError'),
              }),
            });
            incomplete = true;
            notSent = payload.length - i;
            break;
          }

          const result = (data || {}) as any;
          const results = (result.results || []) as any[];
          const okCount = results.filter((r) => r?.status === "ok").length;
          updated += typeof result.updated === "number" ? result.updated : okCount;
          for (const line of results) {
            if (line?.status === "error") {
              errors.push({
                line: Number(line.input_index ?? 0),
                sku: line.sku || t('stockCounts.import.unknownSku'),
                reason: line.error || t('stockCounts.import.unknownError'),
              });
            }
          }
          setImportProgress({ current: Math.min(i + chunk.length, payload.length), total: payload.length });
        }
      }

      // Por número de linha do ficheiro: os erros de parsing vinham todos
      // primeiro e os do servidor atrás, lote a lote — os números saltavam
      // para trás e, com mais de 50 erros, as 50 mostradas podiam ser todas de
      // parsing, escondendo por completo os do servidor.
      errors.sort((a, b) => a.line - b.line);

      if (incomplete) {
        toast({
          title: t('stockCounts.import.incompleteTitle'),
          description: t('stockCounts.import.incompleteSummary', { updated, notSent }),
          variant: "destructive",
        });
      } else if (payload.length === 0 && errors.length === 0) {
        toast({ title: t('stockCounts.import.noValidRowsTitle'), description: t('stockCounts.import.noValidRows') });
      } else {
        toast({
          title: t('stockCounts.import.successTitle'),
          description: t('stockCounts.import.summary', { updated, skipped, failed: errors.length }),
        });
      }

      setImportOpen(false);
      if (errors.length > 0) {
        setImportReport({ updated, skipped, errors, incomplete, notSent });
      }

      // `incomplete` recarrega mesmo com updated = 0: um timeout de rede pode
      // ter deixado a escrita commitada do lado do servidor sem nós sabermos.
      if (updated > 0 || incomplete) {
        await loadDetail();
        onChanged();
      }
    } catch (error: any) {
      // Rede de segurança para o inesperado (a falha da RPC já é tratada lote
      // a lote acima). Mesmo aqui o relatório é mostrado com o que foi
      // gravado, para nunca dar a entender que nada foi escrito.
      toast({
        title: t('stockCounts.import.errorTitle'),
        description: error?.message,
        variant: "destructive",
      });
      setImportOpen(false);
      if (errors.length > 0 || updated > 0) {
        errors.sort((a, b) => a.line - b.line);
        setImportReport({ updated, skipped, errors, incomplete: true, notSent });
      }
    } finally {
      // SEMPRE — sem isto, re-selecionar o mesmo ficheiro (corrigido entretanto)
      // não volta a disparar o onChange e parece que a importação foi ignorada.
      inputEl.value = "";
      setImporting(false);
      setImportProgress(null);
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      em_contagem: "bg-info/10 text-info",
      finalizada: "bg-success/10 text-success",
      cancelada: "bg-muted text-muted-foreground",
    };
    return colors[status] || colors.em_contagem;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('stockCounts.detail.title')}
            {header ? ` — ${header.document_number}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <OlyviaLoader size={32} />
          </div>
        ) : header ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.warehouse')}: </span>
                <span className="font-medium">{header.warehouses?.name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.category')}: </span>
                <span className="font-medium">{header.product_categories?.name || t('stockCounts.allCategories')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.status')}: </span>
                <Badge className={getStatusColor(header.status)}>{getStatusLabel(header.status)}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">{t('stockCounts.detail.startedAt')}: </span>
                <span className="font-medium">{new Date(header.started_at).toLocaleString('pt-PT')}</span>
              </div>
              {header.finalized_at && (
                <div>
                  <span className="text-muted-foreground">{t('stockCounts.detail.finalizedAt')}: </span>
                  <span className="font-medium">{new Date(header.finalized_at).toLocaleString('pt-PT')}</span>
                </div>
              )}
            </div>

            {isActive && !canEdit && canCount && (
              <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
                {t('stockCounts.detail.countOnlyNotice')}
              </p>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{t('stockCounts.detail.lines.title')}</h3>
                <div className="flex items-center gap-2">
                  {canCount && isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setScanOpen(true)}
                    >
                      <ScanLine className="w-4 h-4" />
                      {t('stockCounts.scan.button')}
                    </Button>
                  )}
                  {/* Sem PermissionGate próprio: quem consegue abrir o
                      diálogo já pode ver estas mesmas linhas no ecrã. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4" />
                    {t('stockCounts.export.button')}
                  </Button>
                  {canCount && isActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload className="w-4 h-4" />
                      {t('stockCounts.import.button')}
                    </Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('stockCounts.detail.lines.product')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.lines.systemQty')}</TableHead>
                    <TableHead className="text-right w-32">{t('stockCounts.detail.lines.countedQty')}</TableHead>
                    <TableHead className="text-right">{t('stockCounts.detail.lines.difference')}</TableHead>
                    <TableHead>{t('stockCounts.detail.lines.moved')}</TableHead>
                    <TableHead className="min-w-[260px]">{t('stockCounts.detail.lines.resolution')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t('stockCounts.detail.lines.noLines')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleLines.map((line) => {
                      const diff = getDiff(line);
                      const needsResolution = diff !== null && diff !== 0 && !line.discrepancy_resolution;
                      const draft = resolutionDrafts[line.id] || { resolution: "" as const, notes: "" };
                      return (
                        <TableRow key={line.id} ref={(el) => { rowRefs.current[line.id] = el; }}>
                          <TableCell className="font-medium">
                            <div>{line.products?.name || '-'}</div>
                            {line.products?.sku && (
                              <div className="text-xs text-muted-foreground">{line.products.sku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{line.system_quantity_at_start}</TableCell>
                          <TableCell className="text-right">
                            {canCount && isActive ? (
                              <Input
                                ref={(el) => { quantityInputRefs.current[line.id] = el; }}
                                type="number"
                                min={0}
                                className="w-24 ml-auto text-right"
                                value={quantityDrafts[line.id] ?? ""}
                                placeholder={t('stockCounts.detail.lines.countPlaceholder')}
                                disabled={savingLineId === line.id}
                                onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                onBlur={() => handleSaveQuantity(line.id)}
                              />
                            ) : (
                              <span>{line.counted_quantity ?? t('stockCounts.detail.lines.notCounted')}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {diff === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : diff === 0 ? (
                              <span className="text-success font-medium">0</span>
                            ) : (
                              <span className={diff > 0 ? "text-warning font-medium" : "text-destructive font-medium"}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.moved_during_count && (
                              <Badge variant="outline" className="gap-1">
                                <ArrowRightLeft className="w-3 h-3" /> {t('stockCounts.detail.lines.movedBadge')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {line.discrepancy_resolution ? (
                              <div className="space-y-0.5">
                                <Badge variant="secondary">{getResolutionLabel(line.discrepancy_resolution)}</Badge>
                                {line.resolution_notes && (
                                  <p className="text-xs text-muted-foreground">{line.resolution_notes}</p>
                                )}
                              </div>
                            ) : needsResolution && canEdit && isActive ? (
                              <div className="space-y-1.5">
                                <Select
                                  value={draft.resolution}
                                  onValueChange={(v) => updateResolutionDraft(line.id, { resolution: v as ResolutionType })}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={t('stockCounts.detail.lines.selectResolution')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ajustado">{t('stockCounts.detail.lines.resolutionAdjusted')}</SelectItem>
                                    <SelectItem value="aceite_sem_ajuste">{t('stockCounts.detail.lines.resolutionAccepted')}</SelectItem>
                                    <SelectItem value="recontagem_pedida">{t('stockCounts.detail.lines.resolutionRecount')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(draft.resolution === "aceite_sem_ajuste" || draft.resolution === "ajustado") && (
                                  <Textarea
                                    className="text-xs"
                                    rows={2}
                                    placeholder={t('stockCounts.detail.lines.notesPlaceholder')}
                                    value={draft.notes}
                                    onChange={(e) => updateResolutionDraft(line.id, { notes: e.target.value })}
                                  />
                                )}
                                {draft.resolution && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={resolvingLineId === line.id}
                                    onClick={() => handleResolveLine(line.id)}
                                  >
                                    {resolvingLineId === line.id ? t('stockCounts.detail.finalizing') : t('stockCounts.detail.lines.confirm')}
                                  </Button>
                                )}
                              </div>
                            ) : needsResolution ? (
                              <span className="text-xs text-muted-foreground">{t('stockCounts.detail.lines.selectResolution')}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {paginateLines && (
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {t('stockCounts.detail.lines.pageInfo', {
                      from: lineRangeStart + 1,
                      to: lineRangeStart + visibleLines.length,
                      total: lines.length,
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
              <h3 className="text-sm font-semibold mb-2">{t('stockCounts.detail.movements.title')}</h3>
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
        ) : null}

        {header && isActive && canEdit && (
          <DialogFooter>
            <Button onClick={handleFinalize} disabled={finalizing || loading}>
              {finalizing ? t('stockCounts.detail.finalizing') : t('stockCounts.detail.finalize')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('stockCounts.scan.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {scanError ? (
              <p className="text-sm text-destructive border rounded-md p-3 bg-destructive/10">
                {scanError}
              </p>
            ) : (
              <div className="relative rounded-md overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  className="w-full aspect-video"
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
                <SelectTrigger>
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
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(next) => {
          // Enquanto a escrita está a decorrer, os lotes ainda estão a ser
          // gravados — fechar aqui perdia o relatório e deixava o utilizador
          // sem saber onde a importação parou.
          if (importing) return;
          setImportOpen(next);
        }}
      >
        <DialogContent
          className="max-w-md"
          hideClose={importing}
          onInteractOutside={(e) => { if (importing) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{t('stockCounts.import.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('stockCounts.import.description')}</p>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              disabled={importing}
            />
            {importing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {importProgress
                  ? t('stockCounts.import.progress', {
                    current: importProgress.current,
                    total: importProgress.total,
                  })
                  : t('stockCounts.import.progressReading')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                        <th className="text-left p-2">{t('stockCounts.import.reportLine')}</th>
                        <th className="text-left p-2">{t('stockCounts.import.reportSku')}</th>
                        <th className="text-left p-2">{t('stockCounts.import.reportReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReport.errors.slice(0, 50).map((row, index) => (
                        <tr key={`${row.line}-${row.sku}-${index}`} className="border-t">
                          <td className="p-2">{row.line}</td>
                          <td className="p-2 font-mono">{row.sku}</td>
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
    </Dialog>
  );
}
