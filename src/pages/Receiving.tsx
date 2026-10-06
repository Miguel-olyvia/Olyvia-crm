// Receção por código no armazém (Fase 2 — fatia 1).
//
// O operador lê um código (código de barras, referência do fornecedor ou SKU);
// o servidor identifica o produto (rpc_receiving_lookup) e, ao confirmar,
// reparte a quantidade pelas linhas de encomenda a fornecedor em aberto
// (rpc_receive_by_code), decidindo o que vai para a Encomenda Cliente e o que
// entra em stock. A pré-visualização é a mesma RPC em dry-run.
//
// Este ecrã só usa o que as RPCs devolvem (uom_code, units_per_uom): não
// importa nada do trabalho de embalagens/packs, para poder ir para main sozinho.
//
// Pensado para telemóvel, tablet e PC: uma coluna até xl, cesto e "Recebido
// nesta sessão" lado a lado a partir de xl; campo de leitura fixo no topo e
// barra de confirmar fixa no fundo da área de conteúdo.
//
// Garantias contra perda/duplicação:
//   - cada Enter vai para uma fila processada em série; leituras que falham por
//     rede ficam em "Leituras por processar" (nunca se escreve de volta no campo);
//   - uma entrada a confirmar (ou com resultado incerto) fica bloqueada; uma
//     leitura nova do mesmo produto vai para uma entrada nova;
//   - cada receção real é REGISTADA em localStorage (por utilizador) ANTES de
//     chamar a RPC e só sai com resposta definitiva do servidor. Ao montar, as
//     pendentes são verificadas em receiving_scans: se existirem, já ficaram
//     registadas; se não, ficam em "Receção por confirmar" para reenviar com o
//     MESMO request_id (idempotência do servidor) ou descartar explicitamente;
//   - uma receção incerta nunca larga o id sem prova: qualquer erro numa nova
//     tentativa é verificado em receiving_scans antes de decidir;
//   - o cesto por confirmar fica em sessionStorage (por utilizador e empresa)
//     e é reposto ao voltar ao ecrã; as entradas bloqueadas não, essas vivem
//     nas pendentes do localStorage.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { flushSync } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Keyboard,
  KeyboardOff,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  Trash2,
} from "lucide-react";

// ── Formatos das RPCs (supabase/migrations/20261206160000_rececao_por_codigo.sql) ──

interface OpenLine {
  purchase_order_id: string;
  order_number: string | null;
  po_status: string;
  confirmed: boolean;
  supplier_id: string | null;
  supplier_name: string | null;
  expected_delivery: string | null;
  purchase_order_item_id: string;
  description: string | null;
  quantity: number;
  received_quantity: number;
  open_quantity: number;
  uom_id: string | null;
  units_per_uom: number;
  same_unit: boolean;
  contract_id: string | null;
  contract_order_number: string | null;
  contract_active: boolean;
  allocation_rank: number | null;
}

interface Candidate {
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  matched_by: string;
  uom_id: string | null;
  uom_code: string | null;
  units_per_uom: number;
  open_lines: OpenLine[];
}

interface LookupResult {
  found: boolean;
  code: string;
  can_receive: boolean;
  candidates: Candidate[];
  warnings: string[];
}

interface AllocLine {
  purchase_order_item_id: string;
  destination: "stock" | "client_order" | "split";
  qty_to_order: number;
  qty_to_stock: number;
  units_to_order: number;
  units_to_stock: number;
  contract_order_number: string | null;
  contract_active: boolean | null;
  allocation_reason?: string | null;
}

interface Allocation {
  purchase_order_id: string;
  order_number: string | null;
  status?: string | null;
  units_to_order_total: number;
  units_to_stock_total: number;
  lines: AllocLine[];
}

interface ReceiveResult {
  request_id: string;
  replayed: boolean;
  dry_run: boolean;
  quantity: number;
  units: number;
  uom_code: string | null;
  units_per_uom: number;
  allocations: Allocation[];
  units_to_order_total: number;
  units_to_stock_total: number;
  warnings: string[];
}

// ── Estado do ecrã ──

interface Preview {
  sig: string;
  /** transient = falha de rede/servidor: não bloqueia o Confirmar e volta a ser tentada. */
  status: "loading" | "ok" | "error" | "transient";
  result?: ReceiveResult;
  error?: string;
}

interface BasketEntry {
  /** Identificador local da entrada (pode haver duas do mesmo produto se uma estiver bloqueada). */
  id: string;
  /** Produto + unidade lida. */
  key: string;
  productId: string;
  name: string;
  sku: string | null;
  uomId: string | null;
  uomCode: string | null;
  unitsPerUom: number;
  code: string;
  openLines: OpenLine[];
  quantity: number;
  qtyText: string;
  poItemId: string | null;
  showAdvanced: boolean;
  preview?: Preview;
  /** Gerado UMA vez ao confirmar; reutilizado em "Tentar de novo" (idempotência). */
  requestId?: string;
  submitting?: boolean;
  submitError?: string;
  /** Resultado desconhecido (sem resposta do servidor): só se pode tentar de novo com o mesmo id. */
  retryable?: boolean;
}

interface ReceivedEntry {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  uomCode: string | null;
  unitsPerUom: number;
  unitsToOrder: number;
  unitsToStock: number;
  orderNumbers: string[];
  contractNumbers: string[];
  replayed: boolean;
  at: Date;
}

// Leituras recusadas (não encontradas, erro definitivo, sem linhas em aberto)
// não usam o painel: vão para RejectedScan, que uma leitura seguinte não apaga.
type ScanPanel =
  | { kind: "none" }
  | { kind: "consult"; lookup: LookupResult; candidate: Candidate }
  | { kind: "no_lines"; lookup: LookupResult; candidate: Candidate }
  | { kind: "added"; lookup: LookupResult; candidate: Candidate; quantity: number };

interface PendingChoice {
  id: string;
  lookup: LookupResult;
}

interface Option {
  id: string;
  name: string;
}

interface QueuedScan {
  id: string;
  value: string;
  attempts: number;
}

interface FailedScan {
  id: string;
  value: string;
  error: string;
  attempts: number;
  /** Há uma nova tentativa automática agendada. */
  waiting: boolean;
}

/** Leitura recusada de forma definitiva; fica visível até ser dispensada. */
interface RejectedScan {
  id: string;
  value: string;
  message: string;
  at: Date;
}

/** Linha de receiving_scans (RLS: só as da organização do utilizador). */
interface ScanRow {
  id: string;
  result: unknown;
  organization_id: string;
}

/** Entrada livre guardada em sessionStorage (sem pré-visualização nem estado de envio). */
type StoredEntry = Pick<
  BasketEntry,
  "id" | "key" | "productId" | "name" | "sku" | "uomId" | "uomCode" | "unitsPerUom" | "code" | "openLines" | "quantity" | "poItemId"
>;

interface StoredBasket {
  warehouseId: string;
  supplierId: string;
  entries: StoredEntry[];
}

/**
 * Receção real registada antes de chamar a RPC; sai da lista só com resposta
 * definitiva do servidor ou descarte explícito. Persistida em localStorage.
 */
interface PendingReceipt {
  requestId: string;
  orgId: string;
  orgName: string;
  warehouseId: string;
  supplierId: string;
  productId: string;
  uomId: string | null;
  poItemId: string | null;
  quantity: number;
  code: string;
  name: string;
  sku: string | null;
  uomCode: string | null;
  unitsPerUom: number;
  label: string;
  createdAt: string;
  /** Último envio (o "Descartar" só fica disponível algum tempo depois). */
  lastSentAt?: string;
  /** Entrada do cesto que a originou: não é reposta do sessionStorage enquanto estiver pendente. */
  entryId?: string;
  /** inflight = pedido enviado sem resposta ainda; unknown = sem resposta (rede). */
  state: "inflight" | "unknown";
  lastError?: string;
}

interface QtyEditState {
  entryId: string;
  before: number;
  times: number[];
  typed: string;
  el: HTMLInputElement | null;
  idle?: number;
}

// ── Utilitários ──

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 });
const fmt = (n: number | null | undefined) => nf.format(Number(n ?? 0));
const timeFmt = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sem passar por Date (evita desvios de fuso). */
function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

const entryKey = (productId: string, uomId: string | null) => `${productId}|${uomId ?? ""}`;
const isLocked = (e: BasketEntry) => !!e.submitting || !!e.requestId;
const isUncertain = (e: BasketEntry) => !!e.retryable && !!e.requestId;

const RETRYABLE_CODES = new Set(["40001", "40P01", "57014", "08000", "08003", "08006"]);
/**
 * Recusas de negócio da RPC (quantidade, linha, produto, fornecedor…). Só estas,
 * e só depois de confirmar em receiving_scans que o id não existe, permitem
 * largar o id de uma receção incerta. Tudo o resto (JWT expirado, perfil não
 * encontrado, PGRST*, 08xxx, 40xxx, 57xxx, permissões…) não prova nada.
 */
const BUSINESS_REJECTION_CODES = new Set(["23514", "22003", "22P02", "P0001"]);
/** Intervalo mínimo entre o último envio de uma pendente e o "Descartar". */
const DISCARD_MIN_AGE_MS = 60_000;
const PREVIEW_AUTO_RETRIES = 3;
const PREVIEW_RETRY_MS = 3000;
const SCAN_AUTO_RETRIES = 3;
const SCAN_RETRY_BASE_MS = 1000;
const QTY_IDLE_MS = 3000;
/** Intervalo médio entre teclas abaixo do qual a escrita é de um leitor e não de uma pessoa. */
const SCANNER_BURST_MS = 35;

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Contextos sem randomUUID (ex.: http numa rede local): UUID v4 com getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function warehouseStorageKey(orgId: string) {
  return `olyvia.receiving.warehouse.${orgId}`;
}
const KEYBOARD_MODE_KEY = "olyvia.receiving.scannerMode";
const pendingStorageKey = (userId: string) => `olyvia.receiving.pending.${userId}`;
const basketStorageKey = (userId: string, orgId: string) => `olyvia.receiving.basket.${userId}.${orgId}`;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // localStorage indisponível (modo privado, quota): ignora.
  }
}

/**
 * Lê as pendentes guardadas. Devolve null se o localStorage não estiver
 * disponível ou o conteúdo não for legível — quem chama usa então o que tem em
 * memória, em vez de assumir que a lista está vazia.
 */
function readPendingStrict(userId: string): PendingReceipt[] | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(pendingStorageKey(userId));
  } catch {
    return null;
  }
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list.filter((p) => p && typeof p.requestId === "string") as PendingReceipt[]) : null;
  } catch {
    return null;
  }
}

function readPending(userId: string): PendingReceipt[] {
  return readPendingStrict(userId) ?? [];
}

const sentAtMs = (p: PendingReceipt) => Date.parse(p.lastSentAt ?? p.createdAt) || 0;

// ── Cesto em sessionStorage (por utilizador e empresa) ──

function readSessionBasket(key: string): StoredBasket | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredBasket> | null;
    if (!v || !Array.isArray(v.entries)) return null;
    return {
      warehouseId: typeof v.warehouseId === "string" ? v.warehouseId : "",
      supplierId: typeof v.supplierId === "string" ? v.supplierId : "",
      entries: v.entries.filter(
        (e): e is StoredEntry => !!e && typeof e.id === "string" && typeof e.productId === "string" && Number(e.quantity) >= 1,
      ),
    };
  } catch {
    return null;
  }
}

function writeSessionBasket(key: string, value: StoredBasket | null) {
  try {
    if (!value || value.entries.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage indisponível ou cheio: o cesto só vive em memória.
  }
}

const toStoredEntry = (e: BasketEntry): StoredEntry => ({
  id: e.id,
  key: e.key,
  productId: e.productId,
  name: e.name,
  sku: e.sku,
  uomId: e.uomId,
  uomCode: e.uomCode,
  unitsPerUom: e.unitsPerUom,
  code: e.code,
  openLines: e.openLines,
  quantity: e.quantity,
  poItemId: e.poItemId,
});

/** Entrada livre (sem pré-visualização, que se recalcula). */
const fromStoredEntry = (s: StoredEntry): BasketEntry => ({
  ...s,
  openLines: Array.isArray(s.openLines) ? s.openLines : [],
  quantity: Math.max(1, Math.floor(Number(s.quantity))),
  qtyText: String(Math.max(1, Math.floor(Number(s.quantity)))),
  unitsPerUom: Number(s.unitsPerUom) || 1,
  showAdvanced: !!s.poItemId,
});

/** Volta a pôr uma entrada no estado livre (para regressar ao cesto). */
const freeEntry = (e: BasketEntry): BasketEntry => ({
  ...e,
  qtyText: String(e.quantity),
  preview: undefined,
  requestId: undefined,
  submitting: false,
  submitError: undefined,
  retryable: false,
});

/** Não deixa o botão tirar o foco ao campo de leitura (o Enter do leitor ativaria o botão). */
const keepScanFocus = (ev: ReactMouseEvent) => ev.preventDefault();

function isEditableElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(t);
  }
  return false;
}

function detectCoarsePointer(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

interface RpcErrorLike {
  code?: string;
  message?: string;
}

type ErrorContext = "lookup" | "preview" | "receive";

function errorMessage(err: RpcErrorLike | null | undefined, ctx: ErrorContext): string {
  const code = err?.code ?? "";
  if (code === "42501") return err?.message || "Sem permissão para esta operação.";
  if (!code) {
    if (ctx === "receive") return "Sem ligação ao servidor. A receção pode não ter ficado registada — tenta de novo.";
    if (ctx === "preview") return "Sem ligação ao servidor — não foi possível calcular a repartição.";
    return "Sem ligação ao servidor.";
  }
  return err?.message || "Erro inesperado.";
}

/** Sem resposta do servidor (sem código Postgres): o resultado é desconhecido. */
function isUnknownOutcome(err: RpcErrorLike | null | undefined): boolean {
  return !err?.code;
}

/** Falha passageira (rede, conflito, timeout): a pré-visualização/procura pode ser repetida. */
function isTransient(err: RpcErrorLike | null | undefined): boolean {
  const code = err?.code ?? "";
  return !code || RETRYABLE_CODES.has(code);
}

/**
 * Erro que, mesmo numa PRIMEIRA tentativa, não prova que a transação foi
 * desfeita: sem resposta, ligação perdida (08xxx — pode ter caído depois do
 * commit), servidor a desligar (57P0x), recursos (53xxx) ou erro interno (XX).
 */
function mayHaveCommitted(err: RpcErrorLike | null | undefined): boolean {
  if (isUnknownOutcome(err)) return true;
  return /^(08|57P|53|XX)/.test(err?.code ?? "");
}

/** Recusa de negócio da RPC (ver BUSINESS_REJECTION_CODES). */
function isBusinessRejection(err: RpcErrorLike | null | undefined): boolean {
  return BUSINESS_REJECTION_CODES.has(err?.code ?? "");
}

const sameUnitLines = (lines: OpenLine[]) => lines.filter((l) => l.same_unit);

function unitLabel(uomCode: string | null, unitsPerUom: number) {
  const code = uomCode || "un.";
  return unitsPerUom > 1 ? `${code} (= ${fmt(unitsPerUom)} un)` : code;
}

/** Resumo por PO: "PO-… · N para EC-… · M para stock". */
function summarizeAllocation(a: Allocation, uomCode: string | null) {
  const code = uomCode || "un.";
  const toOrder = new Map<string, number>();
  let toStock = 0;
  const inactive = new Set<string>();
  for (const l of a.lines ?? []) {
    if (Number(l.qty_to_order) > 0) {
      const ec = l.contract_order_number || "EC";
      toOrder.set(ec, (toOrder.get(ec) ?? 0) + Number(l.qty_to_order));
    }
    toStock += Number(l.qty_to_stock) || 0;
    if (l.contract_order_number && l.contract_active === false) inactive.add(l.contract_order_number);
  }
  const parts: string[] = [];
  toOrder.forEach((q, ec) => parts.push(`${fmt(q)} ${code} para ${ec}`));
  if (toStock > 0) parts.push(`${fmt(toStock)} ${code} para stock`);
  return { parts, inactive: Array.from(inactive) };
}

function receivedFromResult(
  requestId: string,
  info: { name: string; sku: string | null; quantity: number; uomCode: string | null; unitsPerUom: number },
  result: Partial<ReceiveResult>,
  replayed: boolean,
): ReceivedEntry {
  const allocs = result.allocations ?? [];
  const contracts = new Set<string>();
  allocs.forEach((a) =>
    (a.lines ?? []).forEach((l) => {
      if (Number(l.units_to_order) > 0 && l.contract_order_number) contracts.add(l.contract_order_number);
    }),
  );
  return {
    id: requestId,
    name: info.name,
    sku: info.sku,
    quantity: Number(result.quantity ?? info.quantity),
    uomCode: result.uom_code ?? info.uomCode,
    unitsPerUom: Number(result.units_per_uom ?? info.unitsPerUom) || 1,
    unitsToOrder: Number(result.units_to_order_total) || 0,
    unitsToStock: Number(result.units_to_stock_total) || 0,
    orderNumbers: allocs.map((a) => a.order_number).filter((n): n is string => !!n),
    contractNumbers: Array.from(contracts),
    replayed,
    at: new Date(),
  };
}

const qtyValid = (e: BasketEntry) => e.qtyText !== "" && Number(e.qtyText) === e.quantity && e.quantity >= 1;

// ── Página ──

export default function Receiving() {
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { toast } = useToast();
  const orgId = activeCompany?.id ?? null;
  const [isCoarse] = useState(detectCoarsePointer);

  const [userId, setUserId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const [code, setCode] = useState("");
  const [queueSize, setQueueSize] = useState(0);
  const [failedScans, setFailedScans] = useState<FailedScan[]>([]);
  const [rejectedScans, setRejectedScans] = useState<RejectedScan[]>([]);
  /** Texto para leitores de ecrã (região aria-live sempre montada). */
  const [announcement, setAnnouncement] = useState("");
  const [panel, setPanel] = useState<ScanPanel>({ kind: "none" });
  const [choices, setChoices] = useState<PendingChoice[]>([]);
  const [scannerMode, setScannerMode] = useState<boolean>(() => readStorage(KEYBOARD_MODE_KEY) === "1");

  const [basket, setBasket] = useState<BasketEntry[]>([]);
  const [received, setReceived] = useState<ReceivedEntry[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PendingReceipt[]>([]);
  const [pendingBusy, setPendingBusy] = useState<Set<string>>(() => new Set());
  const [pendingChecked, setPendingChecked] = useState(false);
  /** Relógio para o "Descartar" (só depois de DISCARD_MIN_AGE_MS desde o último envio). */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const scanInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const basketRef = useRef<BasketEntry[]>(basket);
  basketRef.current = basket;
  const warehouseRef = useRef(warehouseId);
  warehouseRef.current = warehouseId;
  const supplierRef = useRef(supplierId);
  supplierRef.current = supplierId;
  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  const orgNameRef = useRef(activeCompany?.name ?? "");
  orgNameRef.current = activeCompany?.name ?? "";
  const scannerModeRef = useRef(scannerMode);
  scannerModeRef.current = scannerMode;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  /**
   * Época da empresa ativa: sobe a cada troca. Respostas e ciclos comparam a
   * época capturada (A→B→A não é "a mesma empresa" para um pedido de antes).
   */
  const orgEpochRef = useRef(0);
  /** Chave do cesto em sessionStorage já reposta nesta instância (só se grava depois). */
  const restoredBasketKeyRef = useRef<string | null>(null);

  const previewTimers = useRef(new Map<string, number>());
  const previewSeq = useRef(new Map<string, number>());
  const scheduledSig = useRef(new Map<string, string>());
  const previewRetries = useRef(new Map<string, { sig: string; n: number; timer?: number }>());
  const scanQueueRef = useRef<QueuedScan[]>([]);
  const scanRetryTimers = useRef(new Map<string, number>());
  const processingRef = useRef(false);
  const submittingRef = useRef(false);
  /** Receções pendentes (chave = request_id), espelho síncrono do localStorage. */
  const pendingRef = useRef<PendingReceipt[]>([]);
  /** request_ids com pedido real em curso nesta instância. */
  const inflightRef = useRef(new Set<string>());
  const qtyEditRef = useRef<QtyEditState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Volta a pôr o foco no campo de leitura. Num ecrã tátil em modo teclado não
   * o faz sozinho, para não abrir o teclado do ecrã a cada ação; `force` é para
   * quando o utilizador pediu explicitamente (ex.: trocar de modo).
   */
  const focusScan = useCallback(
    (force = false) => {
      if (!mountedRef.current) return;
      if (isCoarse && !scannerModeRef.current && !force) return;
      window.setTimeout(() => scanInputRef.current?.focus(), 0);
    },
    [isCoarse],
  );

  /** A resposta/ciclo ainda pertence ao ecrã atual (mesma época e mesma empresa)? */
  const isCurrent = useCallback(
    (epoch: number, org: string | null) => mountedRef.current && orgEpochRef.current === epoch && orgRef.current === org,
    [],
  );

  // ── Receções pendentes (localStorage por utilizador) ──
  // Cada operação é read-modify-write por request_id sobre o que está guardado
  // (outro separador pode ter acrescentado/removido entretanto); só se usa a
  // cópia em memória se o localStorage não estiver legível.
  const mutatePending = useCallback((op: (list: PendingReceipt[]) => PendingReceipt[]) => {
    const uid = userIdRef.current;
    const stored = uid ? readPendingStrict(uid) : null;
    const next = op(stored ?? pendingRef.current);
    pendingRef.current = next;
    if (uid) writeStorage(pendingStorageKey(uid), next.length ? JSON.stringify(next) : null);
    if (mountedRef.current) setPending(next);
  }, []);

  const upsertPending = useCallback(
    (p: PendingReceipt) => {
      mutatePending((list) => [...list.filter((x) => x.requestId !== p.requestId), p]);
    },
    [mutatePending],
  );

  const patchPending = useCallback(
    (requestId: string, patch: Partial<PendingReceipt>) => {
      mutatePending((list) => list.map((x) => (x.requestId === requestId ? { ...x, ...patch } : x)));
    },
    [mutatePending],
  );

  const removePending = useCallback(
    (requestId: string) => {
      mutatePending((list) => list.filter((x) => x.requestId !== requestId));
    },
    [mutatePending],
  );

  const ensureUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      if (uid) {
        userIdRef.current = uid;
        if (mountedRef.current) setUserId(uid);
      }
      return uid;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const uid = await ensureUserId();
      if (!uid || !mountedRef.current) return;
      // Junta o que estiver guardado com o que esta instância já registou.
      mutatePending((stored) => [
        ...stored,
        ...pendingRef.current.filter((p) => !stored.some((s) => s.requestId === p.requestId)),
      ]);
    })();
  }, [ensureUserId, mutatePending]);

  // Outro separador mexeu nas pendentes: sincroniza a cópia em memória e o ecrã.
  useEffect(() => {
    if (!userId) return;
    const key = pendingStorageKey(userId);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== null && ev.key !== key) return;
      const list = readPendingStrict(userId);
      if (list === null) return;
      pendingRef.current = list;
      if (mountedRef.current) setPending(list);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  /** Procura ids em receiving_scans. null = a consulta falhou (não prova nada). */
  const fetchScans = useCallback(async (ids: string[]): Promise<ScanRow[] | null> => {
    if (ids.length === 0) return [];
    try {
      const { data, error } = await supabase.from("receiving_scans").select("id, result, organization_id").in("id", ids);
      if (error) return null;
      return (data ?? []) as ScanRow[];
    } catch {
      return null;
    }
  }, []);

  /**
   * A pendente afinal está em receiving_scans: sai das pendentes e passa para
   * "Recebido nesta sessão" (como replayed) se for da empresa do ecrã.
   */
  const recoverFromRow = useCallback(
    (p: PendingReceipt, row: ScanRow, notify = true) => {
      removePending(p.requestId);
      if (mountedRef.current && row.organization_id === orgRef.current) {
        const r = receivedFromResult(p.requestId, p, (row.result ?? {}) as Partial<ReceiveResult>, true);
        setReceived((cur) => [r, ...cur.filter((x) => x.id !== r.id)]);
        if (notify) toast({ title: "Já tinha ficado registada", description: `${p.label} — não foi recebida outra vez.` });
      } else {
        toast({
          title: "Receção já registada",
          description: `${p.label} já tinha ficado registada em «${p.orgName}».`,
        });
      }
    },
    [removePending, toast],
  );

  /**
   * Verifica as pendentes em receiving_scans (RLS por organização). As que
   * existirem já ficaram registadas; as outras passam a "por confirmar".
   * Devolve true se a verificação correu (ou não havia nada a verificar).
   */
  const checkPending = useCallback(
    async (onlyIds?: string[]): Promise<boolean> => {
      const candidates = pendingRef.current.filter(
        (p) =>
          (!onlyIds || onlyIds.includes(p.requestId)) &&
          !inflightRef.current.has(p.requestId) &&
          !basketRef.current.some((e) => e.requestId === p.requestId),
      );
      if (candidates.length === 0) {
        if (mountedRef.current) setPendingChecked(true);
        return true;
      }
      const rows = await fetchScans(candidates.map((p) => p.requestId));
      if (rows === null) {
        if (mountedRef.current) setPendingChecked(true);
        return false; // fica tudo como está; o utilizador pode tentar de novo
      }
      for (const p of candidates) {
        // Pode ter sido resolvida entretanto (outro separador, reenvio).
        if (!pendingRef.current.some((x) => x.requestId === p.requestId)) continue;
        const row = rows.find((r) => r.id === p.requestId);
        if (row) {
          // Na verificação geral (ao abrir) não há toast por cada uma: aparecem na lista.
          recoverFromRow(p, row, !!onlyIds);
        } else if (p.state === "inflight" && !inflightRef.current.has(p.requestId)) {
          patchPending(p.requestId, { state: "unknown" });
        }
      }
      if (mountedRef.current) setPendingChecked(true);
      return true;
    },
    [fetchScans, recoverFromRow, patchPending],
  );

  useEffect(() => {
    if (!userId || !orgId) return;
    setPendingChecked(false);
    void checkPending();
  }, [userId, orgId, checkPending]);

  // Relógio do "Descartar": só corre enquanto houver pendentes.
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, [hasPending]);

  // Inclui o cesto por confirmar (BrowserRouter: sem useBlocker, só o aviso do browser).
  const hasPendingWork = confirming || pending.length > 0 || basket.length > 0;
  useEffect(() => {
    if (!hasPendingWork) return;
    const handler = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPendingWork]);

  /** Chamada real à RPC (sem dry-run). */
  const callReceive = async (p: PendingReceipt): Promise<{ result?: ReceiveResult; err?: RpcErrorLike }> => {
    try {
      const { data, error } = await supabase.rpc("rpc_receive_by_code", {
        p_request_id: p.requestId,
        p_warehouse_id: p.warehouseId,
        p_product_id: p.productId,
        p_quantity: p.quantity,
        p_uom_id: p.uomId ?? undefined,
        p_supplier_id: p.supplierId || undefined,
        p_purchase_order_item_id: p.poItemId ?? undefined,
        p_code: p.code || undefined,
        p_dry_run: false,
      });
      if (error) return { err: error };
      return { result: data as unknown as ReceiveResult };
    } catch (ex) {
      return { err: { message: String(ex) } };
    }
  };

  // ── Organização ativa: limpa tudo de forma síncrona e carrega armazéns/fornecedores ──
  useEffect(() => {
    // Nova época: pedidos e ciclos de antes deixam de mexer no ecrã (mesmo A→B→A).
    orgEpochRef.current += 1;
    setBasket([]);
    setReceived([]);
    setPanel({ kind: "none" });
    setChoices([]);
    scanQueueRef.current = [];
    setQueueSize(0);
    scanRetryTimers.current.forEach((t) => window.clearTimeout(t));
    scanRetryTimers.current.clear();
    setFailedScans([]);
    setRejectedScans([]);
    setAnnouncement("");
    setWarehouseId("");
    setSupplierId("");
    setWarehouses([]);
    setSuppliers([]);
    warehouseRef.current = "";
    supplierRef.current = "";
    if (!orgId) {
      setOptionsLoading(false);
      return;
    }
    let cancelled = false;
    setOptionsLoading(true);
    (async () => {
      const [whRes, supRes] = await Promise.all([
        supabase.from("warehouses").select("id, name").eq("organization_id", orgId).is("deleted_at", null).order("name"),
        supabase.from("suppliers").select("id, name").eq("organization_id", orgId).is("deleted_at", null).order("name"),
      ]);
      if (cancelled) return;
      setOptionsLoading(false);
      if (whRes.error) {
        toast({ title: "Erro ao carregar armazéns", description: whRes.error.message, variant: "destructive" });
      }
      if (supRes.error) {
        toast({ title: "Erro ao carregar fornecedores", description: supRes.error.message, variant: "destructive" });
      }
      const whs = (whRes.data ?? []) as Option[];
      setWarehouses(whs);
      setSuppliers((supRes.data ?? []) as Option[]);
      // Um cesto reposto do sessionStorage já trouxe o armazém: mantém-no se ainda existir.
      const current = warehouseRef.current;
      const remembered = readStorage(warehouseStorageKey(orgId));
      if (current && whs.some((w) => w.id === current)) {
        // mantém
      } else if (remembered && whs.some((w) => w.id === remembered)) setWarehouseId(remembered);
      else if (whs.length === 1) setWarehouseId(whs[0].id);
      focusScan();
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, toast, focusScan]);

  // ── Cesto em sessionStorage ──
  // Grava só as entradas livres; as bloqueadas/incertas vivem nas pendentes.
  // Este efeito vem ANTES do de repor: no render em que a empresa muda, a chave
  // reposta ainda é a da empresa anterior e nada é gravado na chave errada.
  const saveBasketNow = useCallback((list: BasketEntry[]) => {
    const uid = userIdRef.current;
    const org = orgRef.current;
    if (!uid || !org) return;
    const key = basketStorageKey(uid, org);
    if (restoredBasketKeyRef.current !== key) return;
    writeSessionBasket(key, {
      warehouseId: warehouseRef.current,
      supplierId: supplierRef.current,
      entries: list.filter((e) => !isLocked(e)).map(toStoredEntry),
    });
  }, []);

  useEffect(() => {
    saveBasketNow(basket);
  }, [basket, warehouseId, supplierId, userId, orgId, saveBasketNow]);

  useEffect(() => {
    if (!userId || !orgId) return;
    const key = basketStorageKey(userId, orgId);
    if (restoredBasketKeyRef.current === key) return;
    restoredBasketKeyRef.current = key;
    const saved = readSessionBasket(key);
    if (!saved || saved.entries.length === 0) return;
    // Por segurança: uma entrada que já originou uma receção pendente nunca volta como livre.
    const pendingEntryIds = new Set(readPending(userId).map((p) => p.entryId).filter(Boolean) as string[]);
    pendingRef.current.forEach((p) => p.entryId && pendingEntryIds.add(p.entryId));
    const entries = saved.entries.filter((e) => !pendingEntryIds.has(e.id)).map(fromStoredEntry);
    if (entries.length === 0) return;
    setBasket((prev) => [...prev, ...entries.filter((x) => !prev.some((p) => p.id === x.id))]);
    if (saved.warehouseId && !warehouseRef.current) {
      setWarehouseId(saved.warehouseId);
      warehouseRef.current = saved.warehouseId;
      setSupplierId(saved.supplierId);
      supplierRef.current = saved.supplierId;
    }
    setAnnouncement(`Cesto reposto: ${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}.`);
  }, [userId, orgId]);

  /**
   * Entradas que ficaram por enviar quando o ciclo parou (troca de empresa ou
   * saída do ecrã): voltam ao cesto livres, no ecrã se ainda for o da mesma
   * empresa e armazém, senão ao cesto guardado dessa empresa.
   */
  const returnUnsent = useCallback(
    (org: string, orgName: string, wh: string, sup: string, list: BasketEntry[]) => {
      if (list.length === 0) return;
      const freed = list.map(freeEntry);
      if (mountedRef.current && orgRef.current === org && warehouseRef.current === wh) {
        setBasket((prev) => [...prev, ...freed.filter((x) => !prev.some((p) => p.id === x.id))]);
        return;
      }
      const uid = userIdRef.current;
      const onOtherScreen = mountedRef.current && orgRef.current === org; // mesma empresa, outro armazém
      if (uid && !onOtherScreen) {
        const key = basketStorageKey(uid, org);
        const saved = readSessionBasket(key);
        if (!saved || saved.entries.length === 0 || saved.warehouseId === wh) {
          writeSessionBasket(key, {
            warehouseId: wh,
            supplierId: saved && saved.entries.length > 0 ? saved.supplierId : sup,
            entries: [...(saved?.entries ?? []), ...freed.filter((x) => !saved?.entries.some((s) => s.id === x.id)).map(toStoredEntry)],
          });
          // Se a empresa já foi reposta nesta instância (A→B→A), volta a repor ao regressar.
          if (restoredBasketKeyRef.current === key) restoredBasketKeyRef.current = null;
          toast({
            title: `Ficaram por enviar em «${orgName}»`,
            description: `${freed.length} ${freed.length === 1 ? "entrada voltou" : "entradas voltaram"} ao cesto dessa empresa.`,
          });
          return;
        }
      }
      toast({
        title: `Ficaram por enviar em «${orgName}»`,
        description: freed.map((e) => `${e.name} — ${fmt(e.quantity)} ${unitLabel(e.uomCode, e.unitsPerUom)}`).join("; "),
        variant: "destructive",
      });
    },
    [toast],
  );

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id);
    if (orgId) writeStorage(warehouseStorageKey(orgId), id || null);
    setPanel({ kind: "none" });
    setChoices([]);
    focusScan();
  };

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    setPanel({ kind: "none" });
    setChoices([]);
    focusScan();
  };

  const toggleScannerMode = () => {
    const next = !scannerMode;
    setScannerMode(next);
    scannerModeRef.current = next;
    writeStorage(KEYBOARD_MODE_KEY, next ? "1" : "0");
    focusScan(true);
  };

  const updateEntry = useCallback((id: string, patch: Partial<BasketEntry>) => {
    setBasket((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // ── Pré-visualização (dry-run) com debounce ──
  const sigOf = useCallback(
    (e: BasketEntry) => `${e.quantity}|${e.poItemId ?? ""}|${warehouseRef.current}|${supplierRef.current}`,
    [],
  );

  /** Pede de novo a pré-visualização (botão "Recalcular", nova tentativa automática, ou stock mudou). */
  const recalcPreview = useCallback(
    (id: string, manual: boolean) => {
      if (!mountedRef.current) return;
      if (manual) {
        const r = previewRetries.current.get(id);
        if (r?.timer) window.clearTimeout(r.timer);
        previewRetries.current.delete(id);
      }
      scheduledSig.current.delete(id);
      updateEntry(id, { preview: undefined });
    },
    [updateEntry],
  );

  const runPreview = useCallback(
    async (id: string, sig: string) => {
      const entry = basketRef.current.find((e) => e.id === id);
      const wh = warehouseRef.current;
      const org = orgRef.current;
      const epoch = orgEpochRef.current;
      if (!entry || !wh || isLocked(entry) || !mountedRef.current) return;
      const seq = (previewSeq.current.get(id) ?? 0) + 1;
      previewSeq.current.set(id, seq);
      updateEntry(id, { preview: { sig, status: "loading" } });

      let preview: Preview;
      try {
        const { data, error } = await supabase.rpc("rpc_receive_by_code", {
          p_request_id: newRequestId(),
          p_warehouse_id: wh,
          p_product_id: entry.productId,
          p_quantity: entry.quantity,
          p_uom_id: entry.uomId ?? undefined,
          p_supplier_id: supplierRef.current || undefined,
          p_purchase_order_item_id: entry.poItemId ?? undefined,
          p_code: entry.code || undefined,
          p_dry_run: true,
        });
        if (!error) preview = { sig, status: "ok", result: data as unknown as ReceiveResult };
        else preview = { sig, status: isTransient(error) ? "transient" : "error", error: errorMessage(error, "preview") };
      } catch (err) {
        preview = { sig, status: "transient", error: errorMessage({ message: String(err) }, "preview") };
      }

      // Descarta respostas antigas: só a última chamada desta entrada, e só se a
      // quantidade/linha/armazém ainda forem os do pedido.
      if (!isCurrent(epoch, org)) return;
      if (previewSeq.current.get(id) !== seq) return;
      const current = basketRef.current.find((e) => e.id === id);
      if (!current || isLocked(current) || sigOf(current) !== sig) return;
      updateEntry(id, { preview });

      if (preview.status === "transient") {
        const prev = previewRetries.current.get(id);
        const n = prev && prev.sig === sig ? prev.n : 0;
        if (n < PREVIEW_AUTO_RETRIES) {
          const timer = window.setTimeout(() => {
            if (!mountedRef.current) return;
            const cur = basketRef.current.find((e) => e.id === id);
            if (cur && !isLocked(cur) && cur.preview?.sig === sig && cur.preview.status === "transient") {
              recalcPreview(id, false);
            }
          }, PREVIEW_RETRY_MS);
          previewRetries.current.set(id, { sig, n: n + 1, timer });
        }
      } else {
        previewRetries.current.delete(id);
      }
    },
    [sigOf, updateEntry, recalcPreview, isCurrent],
  );

  useEffect(() => {
    const ids = new Set(basket.map((e) => e.id));
    for (const e of basket) {
      if (isLocked(e)) continue; // entrada presa a um pedido real
      const sig = sigOf(e);
      if (e.preview?.sig === sig) {
        // Já há resultado (ou pedido em curso) para estes valores: cancela um
        // agendamento intermédio que tenha ficado para trás (ex.: 1 → 2 → 1).
        if (scheduledSig.current.get(e.id) !== sig) {
          const pendingTimer = previewTimers.current.get(e.id);
          if (pendingTimer) window.clearTimeout(pendingTimer);
          previewTimers.current.delete(e.id);
          scheduledSig.current.set(e.id, sig);
        }
        continue;
      }
      if (scheduledSig.current.get(e.id) === sig) continue;
      scheduledSig.current.set(e.id, sig);
      const old = previewTimers.current.get(e.id);
      if (old) window.clearTimeout(old);
      const timer = window.setTimeout(() => {
        previewTimers.current.delete(e.id);
        void runPreview(e.id, sig);
      }, 300);
      previewTimers.current.set(e.id, timer);
    }
    // Limpa o que pertencia a entradas removidas.
    for (const k of Array.from(previewTimers.current.keys())) {
      if (!ids.has(k)) {
        window.clearTimeout(previewTimers.current.get(k));
        previewTimers.current.delete(k);
      }
    }
    for (const k of Array.from(scheduledSig.current.keys())) {
      if (!ids.has(k)) scheduledSig.current.delete(k);
    }
    for (const [k, r] of Array.from(previewRetries.current.entries())) {
      if (!ids.has(k)) {
        if (r.timer) window.clearTimeout(r.timer);
        previewRetries.current.delete(k);
      }
    }
  }, [basket, warehouseId, supplierId, sigOf, runPreview]);

  useEffect(() => {
    const timers = previewTimers.current;
    const retries = previewRetries.current;
    const scanTimers = scanRetryTimers.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      retries.forEach((r) => r.timer && window.clearTimeout(r.timer));
      retries.clear();
      scanTimers.forEach((t) => window.clearTimeout(t));
      scanTimers.clear();
      if (qtyEditRef.current?.idle) window.clearTimeout(qtyEditRef.current.idle);
    };
  }, []);

  // ── Leitura ──
  /** Leitura recusada de forma definitiva: fica na lista até ser dispensada. */
  const addRejected = useCallback((value: string, message: string) => {
    setRejectedScans((cur) => [{ id: newRequestId(), value, message, at: new Date() }, ...cur]);
    setAnnouncement(`«${value}»: ${message}`);
  }, []);

  const addCandidate = useCallback((lookup: LookupResult, c: Candidate) => {
    if (!lookup.can_receive) {
      setPanel({ kind: "consult", lookup, candidate: c });
      setAnnouncement(`${c.name}: modo consulta, sem permissão para receber.`);
      return;
    }
    if (sameUnitLines(c.open_lines).length === 0) {
      setPanel({ kind: "no_lines", lookup, candidate: c });
      addRejected(
        lookup.code || c.name,
        `${c.name}: sem encomenda a fornecedor em aberto nesta unidade — não foi para o cesto.`,
      );
      return;
    }
    const key = entryKey(c.product_id, c.uom_id);
    // Só soma a uma entrada livre; se a do produto estiver a confirmar ou com
    // resultado incerto, a leitura vai para uma entrada nova (nunca se perde
    // nem entra numa receção já enviada).
    const open = basketRef.current.find((e) => e.key === key && !isLocked(e));
    const nextQty = open ? open.quantity + 1 : 1;
    setBasket((prev) => {
      const found = prev.find((e) => e.key === key && !isLocked(e));
      if (found) {
        const q = found.quantity + 1;
        const stillValid =
          found.poItemId && c.open_lines.some((l) => l.purchase_order_item_id === found.poItemId && l.same_unit);
        return prev.map((e) =>
          e.id === found.id
            ? {
                ...e,
                quantity: q,
                qtyText: String(q),
                openLines: c.open_lines,
                poItemId: stillValid ? e.poItemId : null,
                submitError: undefined,
              }
            : e,
        );
      }
      return [
        {
          id: newRequestId(),
          key,
          productId: c.product_id,
          name: c.name,
          sku: c.sku,
          uomId: c.uom_id,
          uomCode: c.uom_code,
          unitsPerUom: Number(c.units_per_uom) || 1,
          code: lookup.code,
          openLines: c.open_lines,
          quantity: 1,
          qtyText: "1",
          poItemId: null,
          showAdvanced: false,
        },
        ...prev,
      ];
    });
    setPanel({ kind: "added", lookup, candidate: c, quantity: nextQty });
    setAnnouncement(`${c.name}: ${fmt(nextQty)} ${unitLabel(c.uom_code, c.units_per_uom)} no cesto.`);
  }, [addRejected]);

  /**
   * Processa uma leitura (chamada só pela fila, uma de cada vez). Devolve a
   * mensagem se falhou de forma passageira (para voltar a tentar).
   */
  const lookupOne = useCallback(
    async (value: string): Promise<{ transient: string } | null> => {
      const org = orgRef.current;
      const epoch = orgEpochRef.current;
      const wh = warehouseRef.current;
      const sup = supplierRef.current;
      if (!wh) return { transient: "Escolhe primeiro o armazém." };
      try {
        const { data, error } = await supabase.rpc("rpc_receiving_lookup", {
          p_warehouse_id: wh,
          p_code: value,
          p_supplier_id: sup || undefined,
        });
        if (!isCurrent(epoch, org)) return null;
        if (error) {
          if (isTransient(error)) return { transient: errorMessage(error, "lookup") };
          addRejected(value, errorMessage(error, "lookup"));
          return null;
        }
        const lookup = data as unknown as LookupResult;
        lookup.candidates = lookup.candidates ?? [];
        lookup.warnings = lookup.warnings ?? [];
        if (!lookup.found || lookup.candidates.length === 0) {
          addRejected(
            lookup.code || value,
            ["Código não encontrado.", ...lookup.warnings].join(" "),
          );
        } else if (lookup.candidates.length > 1) {
          // Fica numa lista própria: uma leitura seguinte não a apaga.
          setChoices((prev) => [...prev, { id: newRequestId(), lookup }]);
        } else {
          addCandidate(lookup, lookup.candidates[0]);
        }
        return null;
      } catch (err) {
        if (!isCurrent(epoch, org)) return null;
        return { transient: errorMessage({ message: String(err) }, "lookup") };
      }
    },
    [addCandidate, addRejected, isCurrent],
  );

  // A fila e as novas tentativas referem-se mutuamente: a função de enfileirar
  // vive numa ref para o temporizador a encontrar sempre atualizada.
  const enqueueRef = useRef<(item: QueuedScan) => void>(() => {});

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (scanQueueRef.current.length > 0 && mountedRef.current) {
        const item = scanQueueRef.current[0];
        const org = orgRef.current;
        const epoch = orgEpochRef.current;
        const outcome = await lookupOne(item.value);
        // Remove por id: a fila pode ter sido limpa (troca de organização) entretanto.
        scanQueueRef.current = scanQueueRef.current.filter((x) => x.id !== item.id);
        setQueueSize(scanQueueRef.current.length);
        if (outcome && isCurrent(epoch, org)) {
          const attempts = item.attempts + 1;
          const auto = attempts < SCAN_AUTO_RETRIES && !!warehouseRef.current;
          setFailedScans((cur) => [
            ...cur.filter((x) => x.id !== item.id),
            { id: item.id, value: item.value, error: outcome.transient, attempts, waiting: auto },
          ]);
          if (auto) {
            const delay = SCAN_RETRY_BASE_MS * 2 ** (attempts - 1);
            const timer = window.setTimeout(() => {
              scanRetryTimers.current.delete(item.id);
              if (!isCurrent(epoch, org)) return;
              setFailedScans((cur) => cur.filter((x) => x.id !== item.id));
              enqueueRef.current({ id: item.id, value: item.value, attempts });
            }, delay);
            scanRetryTimers.current.set(item.id, timer);
          }
        }
      }
    } finally {
      processingRef.current = false;
      focusScan();
    }
  }, [lookupOne, focusScan, isCurrent]);

  enqueueRef.current = (item: QueuedScan) => {
    scanQueueRef.current = [...scanQueueRef.current, item];
    setQueueSize(scanQueueRef.current.length);
    void processQueue();
  };

  const enqueueScan = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    enqueueRef.current({ id: newRequestId(), value, attempts: 0 });
  };

  /**
   * Leitor com o foco fora de um campo editável (num botão, no <select> da linha
   * de PO, no corpo da página): apanha a rajada em captura, antes do elemento.
   * O Enter final, se a escrita foi de leitor (SCANNER_BURST_MS), não ativa o
   * botão — vai para a fila de leituras. Nos <select> as teclas imprimíveis são
   * sempre travadas, senão a 1.ª tecla da rajada mudava a opção (type-ahead).
   * Campos editáveis e diálogos abertos não são tocados.
   */
  useEffect(() => {
    let chars = "";
    let times: number[] = [];
    const reset = () => {
      chars = "";
      times = [];
    };
    const onKeyDown = (ev: globalThis.KeyboardEvent) => {
      if (ev.isComposing || ev.ctrlKey || ev.altKey || ev.metaKey) {
        reset();
        return;
      }
      const active = document.activeElement;
      if (isEditableElement(active)) {
        reset();
        return;
      }
      if (
        (active instanceof HTMLElement && active.closest('[role="dialog"],[role="alertdialog"]')) ||
        document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]')
      ) {
        reset();
        return;
      }
      const now = performance.now();
      const last = times.length ? times[times.length - 1] : 0;
      // Pausa longa: não é a mesma rajada.
      if (times.length && now - last > SCANNER_BURST_MS * 4) reset();

      if (ev.key === "Enter") {
        const t = times;
        const burst = t.length >= 4 && (t[t.length - 1] - t[0]) / (t.length - 1) < SCANNER_BURST_MS && now - last < SCANNER_BURST_MS * 4;
        if (burst) {
          ev.preventDefault();
          ev.stopPropagation();
          const value = chars.trim();
          reset();
          if (value) enqueueRef.current({ id: newRequestId(), value, attempts: 0 });
          focusScan();
        } else {
          reset();
        }
        return;
      }
      if (ev.key.length !== 1) return;
      const inSelect = active instanceof HTMLSelectElement;
      // A meio de uma rajada (ou num select) a tecla não chega ao elemento.
      const fastSoFar = times.length >= 1 && now - last < SCANNER_BURST_MS * 2;
      if (inSelect || fastSoFar) ev.preventDefault();
      chars += ev.key;
      times.push(now);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [focusScan]);

  const retryFailedScan = (id: string) => {
    const f = failedScans.find((x) => x.id === id);
    if (!f) return;
    const t = scanRetryTimers.current.get(id);
    if (t) window.clearTimeout(t);
    scanRetryTimers.current.delete(id);
    setFailedScans((cur) => cur.filter((x) => x.id !== id));
    enqueueRef.current({ id: f.id, value: f.value, attempts: 0 });
    focusScan();
  };

  const dropFailedScan = (id: string) => {
    const t = scanRetryTimers.current.get(id);
    if (t) window.clearTimeout(t);
    scanRetryTimers.current.delete(id);
    setFailedScans((cur) => cur.filter((x) => x.id !== id));
    focusScan();
  };

  const handleLookupSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = code;
    setCode("");
    enqueueScan(value);
    focusScan();
  };

  const handleChoose = (choiceId: string, lookup: LookupResult, c: Candidate) => {
    setChoices((prev) => prev.filter((x) => x.id !== choiceId));
    addCandidate(lookup, c);
    focusScan();
  };

  // ── Edição do cesto ──
  /**
   * Alteração feita pelo utilizador: nunca se aplica a uma entrada bloqueada (a
   * enviar ou incerta) — a quantidade enviada tem de ser a que fica no cesto.
   * A guarda está no updater, por isso vale mesmo contra estado desatualizado.
   */
  const editEntry = (id: string, patch: Partial<BasketEntry>) => {
    setBasket((prev) => prev.map((e) => (e.id === id && !isLocked(e) ? { ...e, ...patch } : e)));
  };

  const setQuantity = (id: string, q: number) => {
    const qty = Math.max(1, Math.floor(q));
    editEntry(id, { quantity: qty, qtyText: String(qty), submitError: undefined });
  };

  const handleQtyText = (id: string, text: string) => {
    const clean = text.replace(/[^\d]/g, "").slice(0, 9);
    const n = Number.parseInt(clean, 10);
    if (clean !== "" && Number.isFinite(n) && n >= 1) {
      editEntry(id, { qtyText: clean, quantity: n, submitError: undefined });
    } else {
      editEntry(id, { qtyText: clean });
    }
  };

  const clearQtyIdle = () => {
    const st = qtyEditRef.current;
    if (st?.idle) window.clearTimeout(st.idle);
    if (st) st.idle = undefined;
  };

  const handleQtyFocus = (entry: BasketEntry, el: HTMLInputElement) => {
    clearQtyIdle();
    qtyEditRef.current = { entryId: entry.id, before: entry.quantity, times: [], typed: "", el };
    el.select();
  };

  /**
   * Enter no campo da quantidade devolve o foco ao campo de leitura. Se as teclas
   * vieram em rajada (leitor a escrever aqui por engano), repõe a quantidade e
   * manda o texto para a fila de leituras. Sem teclas durante ~3 s, volta também.
   */
  const handleQtyKeyDown = (entry: BasketEntry, ev: KeyboardEvent<HTMLInputElement>) => {
    let st = qtyEditRef.current;
    if (!st || st.entryId !== entry.id) {
      st = { entryId: entry.id, before: entry.quantity, times: [], typed: "", el: ev.currentTarget };
      qtyEditRef.current = st;
    }
    clearQtyIdle();
    if (ev.key === "Enter") {
      ev.preventDefault();
      const t = st.times;
      const burst = t.length >= 4 && (t[t.length - 1] - t[0]) / (t.length - 1) < SCANNER_BURST_MS;
      if (burst) {
        setQuantity(entry.id, st.before);
        enqueueScan(st.typed);
      }
      st.times = [];
      st.typed = "";
      ev.currentTarget.blur();
      focusScan();
      return;
    }
    if (ev.key.length === 1) {
      st.times.push(performance.now());
      st.typed += ev.key;
    }
    // Num telemóvel em modo teclado não se tira o foco à pessoa a meio da escrita.
    if (!isCoarse || scannerModeRef.current) {
      const el = ev.currentTarget;
      st.idle = window.setTimeout(() => {
        if (mountedRef.current && document.activeElement === el) {
          el.blur();
          focusScan();
        }
      }, QTY_IDLE_MS);
    }
  };

  const handleQtyBlur = (entry: BasketEntry) => {
    clearQtyIdle();
    if (!qtyValid(entry)) editEntry(entry.id, { qtyText: String(entry.quantity) });
  };

  const removeEntry = (id: string) => {
    const e = basketRef.current.find((x) => x.id === id);
    if (!e || isLocked(e)) return; // a enviar ou incerta: só "Tentar de novo"
    setBasket((prev) => prev.filter((x) => x.id !== id || isLocked(x)));
    focusScan();
  };

  // ── Confirmar ──
  const previewFor = (e: BasketEntry) => (e.preview && e.preview.sig === sigOf(e) ? e.preview : undefined);
  const hasPreviewError = (e: BasketEntry) => !isLocked(e) && previewFor(e)?.status === "error";
  const isPreviewPending = (e: BasketEntry) => {
    if (isLocked(e) || !qtyValid(e)) return false;
    const p = previewFor(e);
    return !p || p.status === "loading";
  };

  const pendingFromEntry = (
    e: BasketEntry,
    requestId: string,
    org: string,
    orgName: string,
    wh: string,
    sup: string,
  ): PendingReceipt => ({
    requestId,
    entryId: e.id,
    orgId: org,
    orgName,
    warehouseId: wh,
    supplierId: sup,
    productId: e.productId,
    uomId: e.uomId,
    poItemId: e.poItemId,
    quantity: e.quantity,
    code: e.code,
    name: e.name,
    sku: e.sku,
    uomCode: e.uomCode,
    unitsPerUom: e.unitsPerUom,
    label: `${e.name} — ${fmt(e.quantity)} ${unitLabel(e.uomCode, e.unitsPerUom)}`,
    createdAt: new Date().toISOString(),
    state: "inflight",
  });

  /** Depois de uma receção com sucesso, o em aberto mudou: refaz as pré-visualizações do mesmo produto. */
  const refreshSameProduct = (productId: string) => {
    for (const x of basketRef.current) {
      if (x.productId === productId && !isLocked(x)) recalcPreview(x.id, true);
    }
  };

  /**
   * Depois de um erro num pedido real, decide o destino do request_id:
   *  - "received": afinal está em receiving_scans → já ficou registada (replayed);
   *  - "rejected": recusa provada → pode largar o id;
   *  - "uncertain": sem prova → mantém o mesmo id.
   * Numa 1.ª tentativa, uma resposta de erro do servidor prova que a transação
   * foi desfeita (exceto mayHaveCommitted). Numa receção JÁ incerta, nada se
   * larga sem consultar receiving_scans: existe → recebida; não existe e o erro
   * é de negócio → recusada; consulta falhou ou erro de rede/auth → incerta.
   */
  const settleFailedReceive = async (
    requestId: string,
    err: RpcErrorLike | undefined,
    wasUncertain: boolean,
  ): Promise<{ kind: "received"; row: ScanRow } | { kind: "rejected" } | { kind: "uncertain" }> => {
    if (!wasUncertain) return mayHaveCommitted(err) ? { kind: "uncertain" } : { kind: "rejected" };
    const rows = await fetchScans([requestId]);
    if (rows === null) return { kind: "uncertain" };
    const row = rows.find((r) => r.id === requestId);
    if (row) return { kind: "received", row };
    return isBusinessRejection(err) ? { kind: "rejected" } : { kind: "uncertain" };
  };

  const submitEntries = async (onlyId?: string) => {
    if (submittingRef.current) return; // duplo clique / duplo toque
    const wh = warehouseRef.current;
    const sup = supplierRef.current;
    const org = orgRef.current;
    const orgName = orgNameRef.current;
    const epoch = orgEpochRef.current;
    if (!wh || !org) return;
    submittingRef.current = true;
    setConfirming(true);

    // request_id de cada entrada, gerado UMA vez: o já guardado (tentar de novo) ou um novo.
    const ids = new Map<string, string>();
    /** Fotografia das entradas TAL COMO FICARAM BLOQUEADAS — é isto que se envia. */
    let entries: BasketEntry[] = [];
    /** Índice a partir do qual o ciclo parou sem enviar (troca de empresa / saída). */
    let stopAt = -1;
    /** Recusadas depois de o ecrã ter mudado: voltam ao cesto da empresa. */
    const refusedAway: BasketEntry[] = [];

    let ok = 0;
    let failed = 0;
    let toOrder = 0;
    let toStock = 0;
    let replayedCount = 0;

    try {
      // Sessão primeiro (dentro do try: se getSession rebentar, as travas soltam-se
      // no finally). Sem utilizador não há onde registar a pendente: não se envia.
      const uid = await ensureUserId();
      if (!uid) {
        if (mountedRef.current) {
          toast({
            title: "Sessão não encontrada",
            description: "Não foi possível identificar o utilizador. Nada foi enviado — volta a entrar e tenta de novo.",
            variant: "destructive",
          });
        }
        return;
      }
      if (!isCurrent(epoch, org)) return;

      // Bloqueia e fotografa no MESMO passo, sobre o estado mais recente (o
      // updater recebe tudo o que já estava em fila). Depois disto, uma leitura
      // ou "+" vai para outra entrada — nunca soma à que vai ser enviada. Os ids
      // ficam no Map para o updater ser idempotente (StrictMode chama-o 2×).
      flushSync(() => {
        setBasket((prev) => {
          const picked = prev.filter((e) => (!onlyId || e.id === onlyId) && qtyValid(e) && !e.submitting);
          for (const e of picked) if (!ids.has(e.id)) ids.set(e.id, e.requestId ?? newRequestId());
          entries = picked.map((e) => ({ ...e, requestId: ids.get(e.id), submitting: true, submitError: undefined }));
          if (picked.length === 0) return prev;
          return prev.map((x) => entries.find((y) => y.id === x.id) ?? x);
        });
      });
      if (entries.length === 0) return;
      // O cesto da sessão deixa já de ter as bloqueadas (F5 a seguir não as repõe como livres).
      saveBasketNow(basketRef.current);

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!isCurrent(epoch, org)) {
          stopAt = i;
          break;
        }
        const requestId = ids.get(e.id) as string;
        const wasUncertain = isUncertain(e);
        // Regista ANTES de chamar: se a página desmontar ou a rede cair, fica para confirmar.
        const nowIso = new Date().toISOString();
        const prevPending = pendingRef.current.find((x) => x.requestId === requestId);
        const p: PendingReceipt = {
          ...pendingFromEntry(e, requestId, org, orgName, wh, sup),
          createdAt: prevPending?.createdAt ?? nowIso,
          lastSentAt: nowIso,
        };
        upsertPending(p);
        inflightRef.current.add(requestId);
        let result: Partial<ReceiveResult> | undefined;
        let replayed = false;
        let err: RpcErrorLike | undefined;
        let uncertain = false;
        try {
          const r = await callReceive(p);
          if (r.result) {
            result = r.result;
            replayed = !!r.result.replayed;
          } else {
            err = r.err;
            const s = await settleFailedReceive(requestId, err, wasUncertain);
            if (s.kind === "received") {
              result = (s.row.result ?? {}) as Partial<ReceiveResult>;
              replayed = true;
            } else {
              uncertain = s.kind === "uncertain";
            }
          }
        } finally {
          inflightRef.current.delete(requestId);
        }
        // As pendentes tratam-se sempre; o ecrã só se ainda for o mesmo.
        const here = isCurrent(epoch, org);

        if (result) {
          removePending(requestId);
          ok += 1;
          if (replayed) replayedCount += 1;
          toOrder += Number(result.units_to_order_total) || 0;
          toStock += Number(result.units_to_stock_total) || 0;
          if (here) {
            setReceived((prev) => [receivedFromResult(requestId, e, result ?? {}, replayed), ...prev.filter((r) => r.id !== requestId)]);
            // A entrada esteve bloqueada (não pode mudar), por isso sai inteira. Por
            // defesa, se tiver mais do que o enviado, fica só a diferença, livre.
            setBasket((prev) =>
              prev.flatMap((x) => {
                if (x.id !== e.id) return [x];
                const rest = x.quantity - e.quantity;
                return rest > 0 ? [freeEntry({ ...x, quantity: rest })] : [];
              }),
            );
            refreshSameProduct(e.productId);
          } else {
            toast({ title: `Receção registada em «${orgName}»`, description: p.label });
            stopAt = i + 1;
            break;
          }
        } else {
          failed += 1;
          const msg = errorMessage(err, "receive");
          if (uncertain) {
            patchPending(requestId, { state: "unknown", lastError: msg });
          } else {
            // Recusa provada: nada foi recebido (a transação foi desfeita); a
            // próxima tentativa leva um id novo e a pré-visualização é refeita.
            removePending(requestId);
          }
          if (!here) {
            if (!uncertain) {
              toast({ title: `Receção recusada em «${orgName}»`, description: `${p.label}: ${msg}`, variant: "destructive" });
              refusedAway.push(e);
            }
            stopAt = i + 1;
            break;
          }
          if (!uncertain) scheduledSig.current.delete(e.id);
          updateEntry(e.id, {
            submitting: false,
            submitError: msg,
            retryable: uncertain,
            requestId: uncertain ? requestId : undefined,
            preview: uncertain ? e.preview : undefined,
          });
        }
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) {
        setConfirming(false);
        // Entradas que ficaram por enviar (saída antecipada) deixam de estar bloqueadas.
        setBasket((prev) =>
          prev.map((x) =>
            x.submitting && ids.has(x.id) ? { ...x, submitting: false, requestId: x.retryable ? x.requestId : undefined } : x,
          ),
        );
      }
      // Por enviar quando o ciclo parou: as livres voltam ao cesto dessa empresa;
      // as incertas já estão nas pendentes (localStorage) com o mesmo id.
      const unsent = stopAt >= 0 ? entries.slice(stopAt).filter((x) => !isUncertain(x)) : [];
      if (!isCurrent(epoch, org)) returnUnsent(org, orgName, wh, sup, [...refusedAway, ...unsent]);
    }

    if (!isCurrent(epoch, org)) return;
    if (ok > 0) {
      toast({
        title: ok === 1 ? "Receção registada" : `${ok} receções registadas`,
        description:
          `${fmt(toOrder)} un para EC, ${fmt(toStock)} un para stock` +
          (replayedCount > 0
            ? `. ${replayedCount === 1 ? "1 já tinha ficado registada" : `${replayedCount} já tinham ficado registadas`} antes — não foram recebidas outra vez.`
            : ""),
      });
    }
    if (failed > 0) {
      toast({
        title: failed === 1 ? "1 entrada não foi recebida" : `${failed} entradas não foram recebidas`,
        description: "Ficaram no cesto com o motivo.",
        variant: "destructive",
      });
    }
    if (ok > 0 || failed > 0) {
      setAnnouncement(
        [ok > 0 ? `${ok} ${ok === 1 ? "receção registada" : "receções registadas"}` : "", failed > 0 ? `${failed} por receber` : ""]
          .filter(Boolean)
          .join(", ") + ".",
      );
    }
    focusScan();
  };

  // ── Receções por confirmar (de uma visita anterior ao ecrã) ──
  const setBusy = (requestId: string, busy: boolean) =>
    setPendingBusy((cur) => {
      const next = new Set(cur);
      if (busy) next.add(requestId);
      else next.delete(requestId);
      return next;
    });

  const resendPending = async (requestId: string) => {
    const p = pendingRef.current.find((x) => x.requestId === requestId);
    if (!p || p.orgId !== orgRef.current || inflightRef.current.has(requestId)) return;
    const epoch = orgEpochRef.current;
    setBusy(requestId, true);
    patchPending(requestId, { state: "inflight", lastError: undefined, lastSentAt: new Date().toISOString() });
    inflightRef.current.add(requestId);
    let result: Partial<ReceiveResult> | undefined;
    let replayed = false;
    let err: RpcErrorLike | undefined;
    let uncertain = false;
    try {
      // Mesmo request_id e mesmos dados: o servidor recebe uma vez só.
      const r = await callReceive(p);
      if (r.result) {
        result = r.result;
        replayed = !!r.result.replayed;
      } else {
        err = r.err;
        // Uma pendente é sempre incerta: nunca se larga o id sem prova.
        const s = await settleFailedReceive(requestId, err, true);
        if (s.kind === "received") {
          result = (s.row.result ?? {}) as Partial<ReceiveResult>;
          replayed = true;
        } else {
          uncertain = s.kind === "uncertain";
        }
      }
    } finally {
      inflightRef.current.delete(requestId);
      if (mountedRef.current) setBusy(requestId, false);
    }
    const here = isCurrent(epoch, p.orgId);
    if (result) {
      removePending(requestId);
      if (here) {
        setReceived((cur) => [receivedFromResult(requestId, p, result ?? {}, replayed), ...cur.filter((r) => r.id !== requestId)]);
        for (const x of basketRef.current) if (x.productId === p.productId && !isLocked(x)) recalcPreview(x.id, true);
      }
      toast({
        title: replayed ? "Já tinha ficado registada" : "Receção registada",
        description: `${p.label} · ${fmt(result.units_to_order_total)} un para EC, ${fmt(result.units_to_stock_total)} un para stock`,
      });
    } else if (uncertain) {
      patchPending(requestId, { state: "unknown", lastError: errorMessage(err, "receive") });
    } else {
      removePending(requestId);
      toast({ title: "Receção recusada", description: `${p.label}: ${errorMessage(err, "receive")}`, variant: "destructive" });
    }
    if (here) focusScan();
  };

  const discardPending = async (requestId: string) => {
    const p = pendingRef.current.find((x) => x.requestId === requestId);
    if (!p || inflightRef.current.has(requestId)) return;
    // Pouco depois de um envio o pedido pode ainda estar a ser processado.
    if (Date.now() - sentAtMs(p) < DISCARD_MIN_AGE_MS) return;
    setBusy(requestId, true);
    // Última verificação: se afinal ficou registada, mostra-a em vez de a esquecer.
    // Só se descarta se a verificação CORREU e confirmou que não existe.
    const checked = await checkPending([requestId]);
    if (mountedRef.current) setBusy(requestId, false);
    if (!checked) {
      toast({
        title: "Não foi possível verificar",
        description: `${p.label}: sem resposta do servidor. Não foi descartada — tenta de novo daqui a pouco.`,
        variant: "destructive",
      });
      return;
    }
    if (pendingRef.current.some((x) => x.requestId === requestId) && !inflightRef.current.has(requestId)) {
      removePending(requestId);
    }
    focusScan();
  };

  const basketRequestIds = new Set(basket.map((e) => e.requestId).filter(Boolean) as string[]);
  const recoveryItems = pending.filter((p) => !basketRequestIds.has(p.requestId) && !(confirming && p.state === "inflight"));

  const uncertainCount = basket.filter(isUncertain).length;
  const freshCount = basket.filter((e) => !isLocked(e)).length;
  const confirmDisabled =
    confirming ||
    basket.length === 0 ||
    basket.some((e) => !qtyValid(e) && !isLocked(e)) ||
    basket.some(hasPreviewError) ||
    basket.some(isPreviewPending);
  const confirmLabel = confirming
    ? "A receber…"
    : uncertainCount > 0 && freshCount > 0
      ? `Confirmar (inclui ${uncertainCount} a repetir)`
      : uncertainCount > 0
        ? "Tentar de novo"
        : "Confirmar receção";
  const basketUnits = basket.reduce((s, e) => s + e.quantity * e.unitsPerUom, 0);
  const lookupBusy = queueSize > 0;

  // ── Render ──
  if (companyLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <OlyviaLoader size={40} />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="space-y-6">
        <PageTitle />
        <NoOrganizationState inline />
      </div>
    );
  }

  const selectorsLocked = basket.length > 0 || confirming;
  const scanDisabled = optionsLoading || !warehouseId;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageTitle />

      {/* Receções sem resposta do servidor (visita anterior, outra empresa, F5) */}
      {recoveryItems.length > 0 && (
        <Card className="border-amber-500/60">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Receção por confirmar ({recoveryItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Estas receções foram enviadas mas não houve resposta do servidor. "Tentar de novo" reenvia o mesmo pedido —
              se já tinha ficado registada, não é recebida duas vezes.
            </p>
            {recoveryItems.map((p) => {
              const busy = pendingBusy.has(p.requestId) || (p.state === "inflight" && inflightRef.current.has(p.requestId));
              const here = p.orgId === orgId;
              const waitMs = DISCARD_MIN_AGE_MS - (nowMs - sentAtMs(p));
              const tooRecent = waitMs > 0;
              return (
                <div key={p.requestId} className="space-y-2 rounded-lg border p-3 text-sm">
                  <p className="break-words font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Enviada às {timeFmt.format(new Date(p.createdAt))}
                    {!here && ` · empresa «${p.orgName}»`}
                  </p>
                  {p.lastError && <p className="break-words text-destructive">{p.lastError}</p>}
                  {here ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="h-11"
                          disabled={busy || !pendingChecked}
                          onMouseDown={keepScanFocus}
                          onClick={() => void resendPending(p.requestId)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {busy ? "A verificar…" : "Tentar de novo"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 whitespace-normal text-left"
                          disabled={busy || !pendingChecked || tooRecent}
                          onMouseDown={keepScanFocus}
                          onClick={() => void discardPending(p.requestId)}
                          aria-describedby={tooRecent ? `discard-wait-${p.requestId}` : undefined}
                        >
                          Descartar — confirmo que não foi recebida
                        </Button>
                      </div>
                      {tooRecent && (
                        <p id={`discard-wait-${p.requestId}`} className="text-xs text-muted-foreground">
                          Enviada há pouco — o pedido pode ainda estar a ser processado. Podes descartar daqui a{" "}
                          {Math.max(1, Math.ceil(waitMs / 1000))} s.
                        </p>
                      )}
                    </div>
                  ) : (
                    <Notice tone="warning">
                      Havia uma receção por confirmar em «{p.orgName}». Volta a essa empresa e tenta de novo.
                    </Notice>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Armazém e fornecedor */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="receiving-warehouse">Armazém *</Label>
            <NativeSelect
              id="receiving-warehouse"
              className="h-12 text-base"
              value={warehouseId}
              onValueChange={handleWarehouseChange}
              disabled={selectorsLocked || optionsLoading}
              placeholder={optionsLoading ? "A carregar…" : "Escolhe o armazém"}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="receiving-supplier">Fornecedor (opcional)</Label>
            <NativeSelect
              id="receiving-supplier"
              className="h-12 text-base"
              value={supplierId}
              onValueChange={handleSupplierChange}
              disabled={selectorsLocked || optionsLoading}
              options={[{ value: "", label: "Todos os fornecedores" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
          {selectorsLocked && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Confirma ou esvazia o cesto para mudar de armazém ou de fornecedor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campo de leitura — fixo no topo da área de conteúdo, acima do teclado virtual */}
      <div className="sticky top-0 z-20 -mx-2 rounded-b-lg bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <form onSubmit={handleLookupSubmit} className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={scanInputRef}
              autoFocus={!isCoarse || scannerMode}
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              placeholder={optionsLoading ? "A carregar…" : warehouseId ? "Lê ou escreve o código" : "Escolhe o armazém primeiro"}
              aria-label="Código lido"
              disabled={scanDisabled}
              inputMode={scannerMode ? "none" : "text"}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={200}
              className="h-14 pl-11 text-lg"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-14 w-14 shrink-0 p-0"
            onMouseDown={keepScanFocus}
            onClick={toggleScannerMode}
            aria-pressed={scannerMode}
            aria-label={scannerMode ? "Mostrar teclado no ecrã" : "Esconder teclado no ecrã (modo leitor)"}
            title={scannerMode ? "Modo leitor: o teclado do ecrã não abre" : "Modo teclado"}
          >
            {scannerMode ? <KeyboardOff className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
          </Button>
          <Button
            type="submit"
            className="h-14 shrink-0 px-4 text-base"
            disabled={scanDisabled || !code.trim()}
            onMouseDown={keepScanFocus}
          >
            <Search className="h-5 w-5 sm:mr-2" />
            <span className="sr-only sm:not-sr-only">Procurar</span>
          </Button>
        </form>
        {/* Sempre montada: os leitores de ecrã só anunciam mudanças numa região que já existia. */}
        <p className={cn("text-sm text-muted-foreground", lookupBusy && "mt-1")} aria-live="polite">
          {lookupBusy ? `A procurar…${queueSize > 1 ? ` (${queueSize} leituras em fila)` : ""}` : ""}
        </p>
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Leituras recusadas — ficam até serem dispensadas (uma rajada não as apaga) */}
      {rejectedScans.length > 0 && (
        <Card className="border-destructive/60">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
            <CardTitle className="text-base">Leituras não aceites ({rejectedScans.length})</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 shrink-0"
              onMouseDown={keepScanFocus}
              onClick={() => {
                setRejectedScans([]);
                focusScan();
              }}
            >
              Dispensar todas
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {rejectedScans.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-medium">«{r.value}»</p>
                  <p className="break-words text-destructive">{r.message}</p>
                  <p className="text-xs text-muted-foreground">{timeFmt.format(r.at)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 shrink-0 p-0"
                  onMouseDown={keepScanFocus}
                  onClick={() => {
                    setRejectedScans((cur) => cur.filter((x) => x.id !== r.id));
                    focusScan();
                  }}
                  aria-label={`Dispensar a leitura ${r.value}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Leituras que falharam por rede — nunca são descartadas em silêncio */}
      {failedScans.length > 0 && (
        <Card className="border-amber-500/60">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Leituras por processar ({failedScans.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {failedScans.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-medium">«{f.value}»</p>
                  <p className="break-words text-muted-foreground">
                    {f.error}
                    {f.waiting && " Nova tentativa automática em breve."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0"
                  onMouseDown={keepScanFocus}
                  onClick={() => retryFailedScan(f.id)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Tentar de novo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-11 shrink-0 p-0"
                  onMouseDown={keepScanFocus}
                  onClick={() => dropFailedScan(f.id)}
                  aria-label={`Descartar a leitura ${f.value}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {choices.map((ch) => (
        <ChoiceCard
          key={ch.id}
          lookup={ch.lookup}
          onChoose={(c) => handleChoose(ch.id, ch.lookup, c)}
          onDismiss={() => {
            setChoices((prev) => prev.filter((x) => x.id !== ch.id));
            focusScan();
          }}
        />
      ))}

      <ScanPanelView
        panel={panel}
        onDismiss={() => {
          setPanel({ kind: "none" });
          focusScan();
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {/* Cesto */}
        <section aria-labelledby="receiving-basket-title" className="min-w-0 space-y-3">
          <h2 id="receiving-basket-title" className="text-lg font-semibold">
            Cesto {basket.length > 0 && <span className="text-muted-foreground">({basket.length})</span>}
          </h2>
          {basket.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Lê um código para começar. Ler o mesmo código outra vez soma 1 à quantidade.
              </CardContent>
            </Card>
          ) : (
            basket.map((e) => (
              <BasketCard
                key={e.id}
                entry={e}
                preview={previewFor(e)}
                busy={confirming}
                qtyValid={qtyValid(e)}
                onMinus={() => {
                  setQuantity(e.id, e.quantity - 1);
                  focusScan();
                }}
                onPlus={() => {
                  setQuantity(e.id, e.quantity + 1);
                  focusScan();
                }}
                onQtyText={(t) => handleQtyText(e.id, t)}
                onQtyFocus={(el) => handleQtyFocus(e, el)}
                onQtyKeyDown={(ev) => handleQtyKeyDown(e, ev)}
                onQtyBlur={() => handleQtyBlur(e)}
                onRemove={() => removeEntry(e.id)}
                onToggleAdvanced={() => {
                  updateEntry(e.id, { showAdvanced: !e.showAdvanced });
                  focusScan();
                }}
                onPoItem={(id) => {
                  editEntry(e.id, { poItemId: id || null, submitError: undefined });
                  focusScan();
                }}
                onRetry={() => void submitEntries(e.id)}
                onRecalc={() => {
                  recalcPreview(e.id, true);
                  focusScan();
                }}
              />
            ))
          )}
        </section>

        {/* Recebido nesta sessão */}
        <section aria-labelledby="receiving-session-title" className="min-w-0 space-y-3">
          <h2 id="receiving-session-title" className="text-lg font-semibold">
            Recebido nesta sessão {received.length > 0 && <span className="text-muted-foreground">({received.length})</span>}
          </h2>
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda nada recebido.</p>
          ) : (
            <ul className="space-y-2">
              {received.map((r) => (
                <li key={r.id} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{r.name}</p>
                      {r.sku && <p className="break-all text-xs text-muted-foreground">{r.sku}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeFmt.format(r.at)}</span>
                  </div>
                  <p className="mt-1">
                    {fmt(r.quantity)} {unitLabel(r.uomCode, r.unitsPerUom)}
                  </p>
                  <p className="text-muted-foreground">
                    {fmt(r.unitsToOrder)} un para EC{r.contractNumbers.length > 0 && ` (${r.contractNumbers.join(", ")})`} ·{" "}
                    {fmt(r.unitsToStock)} un para stock
                  </p>
                  {r.orderNumbers.length > 0 && (
                    <p className="break-words text-xs text-muted-foreground">{r.orderNumbers.join(", ")}</p>
                  )}
                  {r.replayed && (
                    <p className="mt-1 flex items-start gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>Já tinha ficado registada numa tentativa anterior — não foi recebida outra vez.</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/*
        Barra de confirmar — fixa no fundo. pl-12 no telemóvel deixa livre o botão
        do menu (fixed bottom-4 left-4); pr-20 em todos os tamanhos deixa livre o
        botão do chat interno (fixed bottom-6 right-6, 56 px).
      */}
      <div className="sticky bottom-0 z-20 -mx-2 border-t bg-background/95 py-3 pl-12 pr-20 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:pl-2">
        <div className="flex items-center gap-3">
          <p className="hidden min-w-0 flex-1 text-sm text-muted-foreground sm:block">
            {basket.length === 0
              ? "Cesto vazio"
              : `${basket.length} ${basket.length === 1 ? "entrada" : "entradas"} · ${fmt(basketUnits)} un`}
          </p>
          <Button
            type="button"
            className="h-12 min-w-0 flex-1 whitespace-normal px-4 text-base leading-tight sm:flex-none"
            disabled={confirmDisabled}
            onMouseDown={keepScanFocus}
            onClick={() => void submitEntries()}
          >
            {uncertainCount > 0 ? <RotateCcw className="mr-2 h-5 w-5 shrink-0" /> : <PackageCheck className="mr-2 h-5 w-5 shrink-0" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PageTitle() {
  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">Receção no armazém</h1>
      <p className="text-muted-foreground">
        Lê o código do artigo; o sistema escolhe as encomendas a fornecedor em aberto e reparte entre Encomenda Cliente e stock.
      </p>
    </div>
  );
}

// ── Escolha entre vários produtos ──

function ChoiceCard({
  lookup,
  onChoose,
  onDismiss,
}: {
  lookup: LookupResult;
  onChoose: (c: Candidate) => void;
  onDismiss: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        <CardTitle className="min-w-0 break-words text-base">
          «{lookup.code}» corresponde a vários produtos — escolhe um
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" className="h-11 shrink-0" onMouseDown={keepScanFocus} onClick={onDismiss}>
          Fechar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        <Warnings items={lookup.warnings} />
        {lookup.candidates.map((c) => {
          const open = sameUnitLines(c.open_lines).reduce((s, l) => s + Number(l.open_quantity), 0);
          return (
            <button
              key={entryKey(c.product_id, c.uom_id)}
              type="button"
              onMouseDown={keepScanFocus}
              onClick={() => onChoose(c)}
              className="flex min-h-[3.5rem] w-full flex-col items-start rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="break-words font-medium">{c.name}</span>
              <span className="break-all text-sm text-muted-foreground">
                {[c.sku, unitLabel(c.uom_code, c.units_per_uom)].filter(Boolean).join(" · ")} · em aberto {fmt(open)}
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Painel do resultado da última leitura ──

function ScanPanelView({ panel, onDismiss }: { panel: ScanPanel; onDismiss: () => void }) {
  if (panel.kind === "none") return null;

  const dismiss = (
    <Button type="button" variant="ghost" size="sm" className="h-11 shrink-0" onMouseDown={keepScanFocus} onClick={onDismiss}>
      Fechar
    </Button>
  );

  const c = panel.candidate;
  const lines = panel.kind === "consult" ? c.open_lines : sameUnitLines(c.open_lines);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-4 pb-2">
        <div className="min-w-0">
          <CardTitle className="break-words text-base">{c.name}</CardTitle>
          <p className="break-all text-sm text-muted-foreground">
            {[c.sku, unitLabel(c.uom_code, c.units_per_uom)].filter(Boolean).join(" · ")}
          </p>
        </div>
        {dismiss}
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {panel.kind === "added" && (
          <Notice tone="success">
            No cesto: {fmt(panel.quantity)} {unitLabel(c.uom_code, c.units_per_uom)}
          </Notice>
        )}
        {panel.kind === "no_lines" && (
          <Notice tone="warning">Sem encomenda a fornecedor em aberto para este produto nesta unidade — não foi para o cesto.</Notice>
        )}
        {panel.kind === "consult" && (
          <Notice tone="info">Modo consulta: não tens permissão para receber (precisas de receber encomendas e editar inventário).</Notice>
        )}
        <Warnings items={panel.lookup.warnings} />
        {panel.kind === "consult" &&
          (lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem encomendas a fornecedor em aberto.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => (
                <li key={l.purchase_order_item_id}>
                  <OpenLineSummary line={l} uomCode={c.uom_code} />
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}

function OpenLineSummary({ line, uomCode }: { line: OpenLine; uomCode: string | null }) {
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{line.order_number ?? "PO"}</span>
        {!line.confirmed && (
          <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
            não confirmada
          </Badge>
        )}
        {line.contract_order_number && (
          <Badge variant={line.contract_active ? "secondary" : "outline"}>
            {line.contract_order_number}
            {!line.contract_active && " (inativa)"}
          </Badge>
        )}
        {!line.same_unit && <Badge variant="outline">outra unidade</Badge>}
      </div>
      <p className="text-muted-foreground">
        Em aberto {fmt(line.open_quantity)} {line.units_per_uom > 1 ? `× ${fmt(line.units_per_uom)} un` : uomCode || "un."}
        {line.supplier_name && ` · ${line.supplier_name}`}
        {line.expected_delivery && ` · previsto ${fmtDate(line.expected_delivery)}`}
      </p>
    </div>
  );
}

// ── Entrada do cesto ──

function BasketCard({
  entry,
  preview,
  busy,
  qtyValid,
  onMinus,
  onPlus,
  onQtyText,
  onQtyFocus,
  onQtyKeyDown,
  onQtyBlur,
  onRemove,
  onToggleAdvanced,
  onPoItem,
  onRetry,
  onRecalc,
}: {
  entry: BasketEntry;
  preview: Preview | undefined;
  busy: boolean;
  qtyValid: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onQtyText: (t: string) => void;
  onQtyFocus: (el: HTMLInputElement) => void;
  onQtyKeyDown: (ev: KeyboardEvent<HTMLInputElement>) => void;
  onQtyBlur: () => void;
  onRemove: () => void;
  onToggleAdvanced: () => void;
  onPoItem: (id: string) => void;
  onRetry: () => void;
  onRecalc: () => void;
}) {
  const uncertain = isUncertain(entry);
  const locked = busy || isLocked(entry);
  const lines = sameUnitLines(entry.openLines);
  const openTotal = lines.reduce((s, l) => s + Number(l.open_quantity), 0);
  const qtyId = `qty-${entry.id}`;
  const poId = `po-${entry.id}`;

  return (
    <Card className={cn(entry.submitError && "border-destructive")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words font-medium leading-tight">{entry.name}</p>
            <p className="break-all text-sm text-muted-foreground">
              {[entry.sku, unitLabel(entry.uomCode, entry.unitsPerUom), `em aberto ${fmt(openTotal)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0 text-destructive hover:text-destructive"
            onMouseDown={keepScanFocus}
            onClick={onRemove}
            disabled={locked}
            aria-label={`Remover ${entry.name}`}
            title={uncertain ? "Pode já ter ficado registada — tenta de novo" : undefined}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>

        {/* Quantidade */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0 p-0"
            onMouseDown={keepScanFocus}
            onClick={onMinus}
            disabled={locked || entry.quantity <= 1}
            aria-label={`Menos 1 de ${entry.name}`}
          >
            <Minus className="h-5 w-5" />
          </Button>
          <Label htmlFor={qtyId} className="sr-only">
            Quantidade de {entry.name}
          </Label>
          <Input
            id={qtyId}
            value={entry.qtyText}
            onChange={(ev) => onQtyText(ev.target.value)}
            onFocus={(ev) => onQtyFocus(ev.currentTarget)}
            onKeyDown={onQtyKeyDown}
            onBlur={onQtyBlur}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={9}
            enterKeyHint="done"
            autoComplete="off"
            disabled={locked}
            aria-invalid={!qtyValid}
            className={cn("h-12 w-24 text-center text-lg font-semibold", !qtyValid && "border-destructive")}
          />
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0 p-0"
            onMouseDown={keepScanFocus}
            onClick={onPlus}
            disabled={locked}
            aria-label={`Mais 1 de ${entry.name}`}
          >
            <Plus className="h-5 w-5" />
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {entry.uomCode || "un."}
            {entry.unitsPerUom > 1 && qtyValid && ` = ${fmt(entry.quantity * entry.unitsPerUom)} un`}
          </span>
        </div>
        {!qtyValid && <p className="text-sm text-destructive">A quantidade tem de ser um número inteiro, 1 ou mais.</p>}

        {/* Linha de PO específica (avançado) */}
        <div>
          <Button
            type="button"
            variant="link"
            className="h-11 px-0 text-sm"
            onMouseDown={keepScanFocus}
            onClick={onToggleAdvanced}
            aria-expanded={entry.showAdvanced}
            aria-controls={poId}
          >
            {entry.showAdvanced
              ? "Esconder escolha de linha"
              : entry.poItemId
                ? "Linha de encomenda escolhida — alterar"
                : "Escolher linha de encomenda (avançado)"}
          </Button>
          {entry.showAdvanced && (
            <div className="space-y-2" id={poId}>
              <Label htmlFor={`${poId}-select`} className="sr-only">
                Linha de encomenda
              </Label>
              <NativeSelect
                id={`${poId}-select`}
                className="h-12 text-base"
                value={entry.poItemId ?? ""}
                onValueChange={onPoItem}
                disabled={locked}
                options={[
                  { value: "", label: "Automático (ordem de enchimento)" },
                  ...lines.map((l) => ({
                    value: l.purchase_order_item_id,
                    label: [
                      l.order_number ?? "PO",
                      !l.confirmed ? "não confirmada" : null,
                      l.contract_order_number ? `${l.contract_order_number}${l.contract_active ? "" : " (inativa)"}` : "stock",
                      `em aberto ${fmt(l.open_quantity)}`,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  })),
                ]}
              />
              {entry.poItemId &&
                (() => {
                  const l = lines.find((x) => x.purchase_order_item_id === entry.poItemId);
                  return l ? <OpenLineSummary line={l} uomCode={entry.uomCode} /> : null;
                })()}
            </div>
          )}
        </div>

        {/* Pré-visualização — região aria-live sempre montada, o conteúdo muda lá dentro */}
        <div aria-live="polite">
          <PreviewView entry={entry} preview={preview} onRecalc={onRecalc} />
        </div>

        {/* Erro do pedido real */}
        {entry.submitError && (
          <div role="alert" className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="break-words">{entry.submitError}</p>
            {uncertain && (
              <>
                <p className="text-destructive/90">
                  Pode já ter ficado registada — tenta de novo. "Tentar de novo" usa o mesmo pedido e não recebe duas vezes;
                  por isso esta entrada não pode ser removida nem alterada.
                </p>
                <Button type="button" variant="outline" className="h-11" onMouseDown={keepScanFocus} onClick={onRetry} disabled={busy}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Tentar de novo
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewView({
  entry,
  preview,
  onRecalc,
}: {
  entry: BasketEntry;
  preview: Preview | undefined;
  onRecalc: () => void;
}) {
  if (entry.submitting) {
    return <p className="text-sm text-muted-foreground">A receber…</p>;
  }
  if (isUncertain(entry)) return null;
  if (!preview || preview.status === "loading") {
    return <p className="text-sm text-muted-foreground">A calcular repartição…</p>;
  }
  if (preview.status === "error" || preview.status === "transient") {
    const transient = preview.status === "transient";
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md p-2 text-sm",
          transient ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-destructive/10 text-destructive",
        )}
      >
        <span className="min-w-0 flex-1 break-words">{preview.error}</span>
        <Button type="button" variant="outline" size="sm" className="h-11 shrink-0" onMouseDown={keepScanFocus} onClick={onRecalc}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Recalcular
        </Button>
      </div>
    );
  }
  const r = preview.result;
  if (!r) return null;
  const uomCode = r.uom_code ?? entry.uomCode;
  return (
    <div className="space-y-1.5 rounded-md bg-muted/50 p-2 text-sm">
      {(r.allocations ?? []).map((a) => {
        const s = summarizeAllocation(a, uomCode);
        return (
          <div key={a.purchase_order_id}>
            <p className="break-words">
              <span className="font-medium">{a.order_number ?? "PO"}</span>
              {s.parts.length > 0 && ` · ${s.parts.join(" · ")}`}
            </p>
            {s.inactive.length > 0 && (
              <p className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{s.inactive.join(", ")} não está ativa — não conta para a encomenda.</span>
              </p>
            )}
          </div>
        );
      })}
      <p className="text-muted-foreground">
        Total: {fmt(r.units_to_order_total)} un para EC · {fmt(r.units_to_stock_total)} un para stock
      </p>
      <Warnings items={r.warnings} />
    </div>
  );
}

// ── Peças pequenas ──

function Warnings({ items }: { items: string[] | null | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((w, i) => (
        <li key={i} className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{w}</span>
        </li>
      ))}
    </ul>
  );
}

function Notice({
  tone,
  children,
  action,
}: {
  tone: "error" | "warning" | "success" | "info";
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3",
        tone === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
        tone === "warning" && "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        tone === "success" && "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        tone === "info" && "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300",
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {action}
    </div>
  );
}
