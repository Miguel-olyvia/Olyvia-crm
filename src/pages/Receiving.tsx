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
//
// Guia do fornecedor (fatia 2, 20261209100000): opcional, escolhida depois do
// armazém. Fixa o fornecedor e o âmbito (POs da guia). O id da guia vai no
// lookup, no dry-run e na receção, e fica gravado no cesto, em "Por enviar" e
// em cada pendente: o reenvio de uma pendente usa SEMPRE a guia com que foi
// enviada (o servidor recusa o mesmo request_id com outra guia). Trocar de
// guia segue a regra do armazém/fornecedor (só com o cesto vazio). Avisos
// "não consta da guia" / "acima do anunciado" exigem confirmação na entrada.
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { DeliveryNotePicker } from "@/components/receiving/DeliveryNotePicker";
import { DeliveryNoteDialog } from "@/components/receiving/DeliveryNoteDialog";
import { DeliveryNoteDetail } from "@/components/receiving/DeliveryNoteDetail";
import { NOTE_STATUS_LABEL, fetchDeliveryNote, noteLabel, type DeliveryNoteFull } from "@/components/receiving/deliveryNotes";
import { LearnCodeDialog } from "@/components/receiving/LearnCodeDialog";
import {
  describeLearnResult,
  productCodeErrorMessage,
  removeProductCode,
  type LearnCodeResult,
} from "@/components/receiving/productCodes";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
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
  Tag,
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
  /** Só com guia: linha indicada nas linhas da guia (prioridade). */
  in_delivery_note?: boolean;
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
  /** Só com guia: anunciado / recebido pela guia (unidades de stock). */
  delivery_note?: { announced: boolean; announced_units: number; received_units: number };
}

interface LookupResult {
  found: boolean;
  code: string;
  can_receive: boolean;
  candidates: Candidate[];
  warnings: string[];
  /** Só com guia. */
  delivery_note?: { id: string; note_number: string; status: string; has_lines: boolean };
}

/** Avisos da guia que exigem confirmação explícita (decisão 1). */
const NOTE_CHECK_LABEL: Record<string, string> = {
  nao_consta_da_guia: "Não consta da guia",
  acima_do_anunciado: "Acima do anunciado na guia",
};

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
  /** Só com guia. */
  delivery_note_id?: string;
  delivery_note_number?: string;
  delivery_note_checks?: string[];
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
  /**
   * Cópia do que foi enviado com o requestId (para quando a pendente do
   * localStorage já não existir). A pendente é a fonte de verdade de cada id:
   * um reenvio leva exatamente estes dados, não os da entrada.
   */
  sent?: PendingReceipt;
  /**
   * Avisos da guia confirmados pelo utilizador para esta pré-visualização
   * (sig + avisos). Mudar quantidade/linha/guia muda a chave → volta a pedir.
   */
  ackKey?: string;
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
  /** Guia da receção (nº) e avisos da guia devolvidos pelo servidor. */
  deliveryNoteNumber?: string | null;
  /** Recebida COM guia (o servidor devolveu delivery_note_id, ou a pendente tinha guia). */
  withNote: boolean;
  noteChecks?: string[];
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
  /**
   * p_unit_conversion no lookup (só a re-leitura depois de associar um código).
   * Ausente = chamada igual à das fatias 1/2. A receção (rpc_receive_by_code)
   * continua SEM a flag — ver onLearned.
   */
  unitConversion?: boolean;
}

interface FailedScan {
  id: string;
  value: string;
  error: string;
  attempts: number;
  /** Há uma nova tentativa automática agendada. */
  waiting: boolean;
  unitConversion?: boolean;
}

/** Leitura recusada de forma definitiva; fica visível até ser dispensada. */
interface RejectedScan {
  id: string;
  value: string;
  message: string;
  at: Date;
  /** 'not_found' = o lookup não encontrou o código (permite "Associar a um produto"). Opcional. */
  reason?: "not_found";
}

/** Leitura recusada a associar (diálogo aberto); não persiste. */
interface LearnTarget {
  scanId: string;
  code: string;
  /** Época/empresa em que o diálogo abriu (a re-leitura só entra se ainda for a mesma). */
  epoch: number;
  org: string;
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
  /** Guia do fornecedor do cesto ("" = sem guia; cestos antigos não têm). */
  deliveryNoteId?: string;
  entries: StoredEntry[];
}

/**
 * Entrada que ficou por enviar e não pôde voltar ao cesto (outro armazém, ecrã
 * já desmontado). Nada foi recebido; fica em "Por enviar" até voltar ao cesto
 * ou ser dispensada. sessionStorage, por utilizador e empresa.
 */
interface UnsentEntry extends StoredEntry {
  warehouseId: string;
  supplierId: string;
  /** Guia com que foi lida (null/ausente = sem guia). */
  deliveryNoteId?: string | null;
  deliveryNoteNumber?: string | null;
  at: string;
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
  /**
   * Guia com que foi enviada (null/ausente = sem guia — inclui as pendentes
   * de antes da fatia 2). O reenvio usa SEMPRE esta, nunca a do ecrã.
   */
  deliveryNoteId?: string | null;
  deliveryNoteNumber?: string | null;
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
/** Guia guardada ("" = sem guia; dados antigos ou inválidos = sem guia). */
const dnOf = (x: { deliveryNoteId?: string | null } | null | undefined) =>
  typeof x?.deliveryNoteId === "string" ? x.deliveryNoteId : "";
/** Avisos da guia devolvidos pela pré-visualização. */
const noteChecksOf = (r: Partial<ReceiveResult> | undefined) =>
  Array.isArray(r?.delivery_note_checks) ? r.delivery_note_checks.filter((c): c is string => typeof c === "string") : [];
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
/**
 * Numa nova tentativa, uma recusa de negócio só larga o id se o envio anterior
 * tiver sido há mais do que isto. O statement_timeout do authenticated é 8 s,
 * mas o pedido pode antes esperar na fila de ligações do PostgREST (~10 s) —
 * usa a mesma margem do "Descartar".
 */
const REJECT_MIN_AGE_MS = DISCARD_MIN_AGE_MS;
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
const unsentStorageKey = (userId: string, orgId: string) => `olyvia.receiving.unsent.${userId}.${orgId}`;
/**
 * Armazém/fornecedor/guia escolhidos no ecrã, por separador (sessionStorage),
 * utilizador e empresa — mesmo com o cesto vazio. Sem isto, um novo
 * carregamento do ecrã (sair e voltar, F5, "Recarregar" depois de uma
 * atualização) repunha o armazém lembrado mas deixava a guia e o fornecedor
 * em branco, e a receção seguinte ia SEM guia sem ninguém dar por isso.
 */
const contextStorageKey = (userId: string, orgId: string) => `olyvia.receiving.context.${userId}.${orgId}`;
/** Avisa as instâncias montadas de que a lista "Por enviar" mudou (detail = chave). */
const UNSENT_EVENT = "olyvia-receiving-unsent";

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
      deliveryNoteId: dnOf(v),
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

interface StoredContext {
  warehouseId: string;
  supplierId: string;
  deliveryNoteId: string;
}

function readSessionContext(key: string): StoredContext | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredContext> | null;
    if (!v || typeof v !== "object") return null;
    return {
      warehouseId: typeof v.warehouseId === "string" ? v.warehouseId : "",
      supplierId: typeof v.supplierId === "string" ? v.supplierId : "",
      deliveryNoteId: typeof v.deliveryNoteId === "string" ? v.deliveryNoteId : "",
    };
  } catch {
    return null;
  }
}

function writeSessionContext(key: string, value: StoredContext) {
  try {
    if (!value.warehouseId && !value.supplierId && !value.deliveryNoteId) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage indisponível: o contexto só vive em memória.
  }
}

function readUnsent(key: string): UnsentEntry[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (e): e is UnsentEntry =>
        !!e && typeof e.id === "string" && typeof e.productId === "string" && typeof e.warehouseId === "string" && Number(e.quantity) >= 1,
    );
  } catch {
    return [];
  }
}

/**
 * Read-modify-write sobre o que está guardado (outra instância — ex.: a antiga,
 * já desmontada — pode ter acrescentado entretanto); nunca substitui às cegas.
 * Devolve a lista resultante, ou null se o sessionStorage não estiver disponível.
 */
function mutateUnsent(key: string, op: (list: UnsentEntry[]) => UnsentEntry[]): UnsentEntry[] | null {
  try {
    const next = op(readUnsent(key));
    if (next.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(UNSENT_EVENT, { detail: key }));
    return next;
  } catch {
    return null;
  }
}

// ── Separador duplicado ──
// "Duplicar separador" (Chrome/Edge) copia a sessionStorage: o separador novo
// reporia o mesmo cesto, "Por enviar" e contexto, e confirmar nos dois recebia
// a mercadoria duas vezes (request_ids diferentes). Cada separador guarda um
// tabId na sessionStorage; cada carga da página tem um id de instância próprio.
//
// Garantia principal — Web Locks (navigator.locks): a carga que fica com os
// dados prende a tranca `olyvia.receiving.tab.<tabId>` até a página morrer. Uma
// carga nova com o mesmo tabId pede-a com ifAvailable: se a obtém, é o dono (F5,
// crash/"continuar onde parou", Ctrl+Shift+T, separador descartado — a carga
// antiga já não existe); se não, tenta outra vez (o documento anterior de um F5
// pode ainda não a ter largado) e, se continuar presa, é cópia (o original está
// vivo, mesmo congelado ou noutra rota): tabId novo, prende a tranca do tabId
// novo antes de o escrever e apaga as chaves copiadas. A tranca é exclusiva no
// browser: nunca há dois donos do mesmo tabId. Com Web Locks a marca de "vivo"
// não decide nada (só serve ao recurso abaixo). O Chrome não guarda em bfcache
// páginas com trancas presas; se outro browser guardar, a tranca continua presa
// e a página continua dona — nada aqui depende de a página ir ou não para o bfcache.
//
// Recurso, sem Web Locks: a carga pergunta (BroadcastChannel por utilizador) se outra
// instância viva tem o mesmo tabId. Se sim, este é a cópia: tabId novo e as
// chaves copiadas são apagadas (o original fica com elas). F5 no mesmo
// separador: a instância antiga já morreu, ninguém responde, repõe normalmente.
// Sem BroadcastChannel não há como distinguir cópia de F5: com tabId já
// existente não se repõe (apaga-se) e avisa-se — perder um cesto por receber é
// recuperável; receber duas vezes não.
// Original congelado (poupança de energia) ou ocupado não responde a tempo:
// por isso o separador que fica com os dados deixa também uma marca de "vivo"
// na sessionStorage (posta ao verificar e em pageshow, retirada em pagehide).
// F5: o pagehide retira-a, a carga nova não a vê. Cópia: a marca vem copiada →
// é cópia sem perguntar (lado seguro). Separador descartado pelo Chrome
// (document.wasDiscarded) não correu o pagehide: ignora a marca e pergunta.
// A troca de mensagens fica para quando não há marca (ex.: o original ainda
// não tinha aberto a receção nesta carga).
// Estado ao nível do módulo (uma vez por carga): StrictMode e sair/voltar ao
// ecrã reutilizam a mesma verificação (a tranca é pedida uma só vez e não é
// largada ao desmontar o ecrã), e a instância continua a responder
// depois de o ecrã desmontar (enquanto a página não recarregar).

const TAB_ID_KEY = "olyvia.receiving.tabId";
/** Marca de "separador vivo": guarda o tabId de quem tem os dados nesta sessionStorage. */
const TAB_ALIVE_KEY = "olyvia.receiving.tabAlive";
/**
 * Espera pela resposta do separador original (chega em poucos ms; folga para
 * páginas ocupadas). Atrasa a reposição; as leituras feitas entretanto ficam em
 * fila e só são processadas depois de repor (ver scanGateOpen).
 */
const TAB_PROBE_MS = 750;
/** Web Locks: novas tentativas se a tranca estiver presa (documento anterior de um F5 ainda a largar). */
const TAB_LOCK_RETRIES = 2;
const TAB_LOCK_RETRY_MS = 300;
const TAB_DATA_PREFIXES = ["olyvia.receiving.basket.", "olyvia.receiving.unsent.", "olyvia.receiving.context."];

interface TabMsg {
  t: "ping" | "pong";
  tab: string;
  from: string;
  to?: string;
}
interface TabCheck {
  reason: "ok" | "duplicate" | "unsupported";
  /** Havia cesto/"Por enviar" copiado que não foi reposto. */
  dropped: boolean;
}

/** Id desta carga da página (não vai para a sessionStorage). */
const tabInstanceId = newRequestId();
let tabState: { tabId: string; checking: boolean } | null = null;
let tabCheckPromise: Promise<TabCheck> | null = null;
let tabNoticeShown = false;
const tabChannels = new Map<string, BroadcastChannel>();
/** Durante a espera: passa já esta carga a cópia (desempate com outra do mesmo tabId). */
let tabYield: (() => void) | null = null;
let tabLifecycleBound = false;
/** Larga a tranca Web Locks presa por esta carga (só o HMR a usa; numa carga normal fica até a página morrer). */
let tabLockRelease: (() => void) | null = null;

type TabLockAttempt = "held" | "busy" | "error";

function tabLocks(): LockManager | null {
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

/**
 * Tenta prender (sem esperar) a tranca do tabId. Se a obtém, segura-a com uma
 * Promise que só resolve no HMR — numa carga normal, até a página morrer.
 */
function tryHoldTabLock(locks: LockManager, id: string): Promise<TabLockAttempt> {
  return new Promise<TabLockAttempt>((resolve) => {
    try {
      locks
        .request(`olyvia.receiving.tab.${id}`, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve("busy");
            return undefined;
          }
          return new Promise<void>((release) => {
            // Só um tabId por carga: a tranca de um id anterior deixa de servir.
            const previous = tabLockRelease;
            tabLockRelease = release;
            try {
              previous?.();
            } catch {
              // já largada
            }
            resolve("held");
          });
        })
        .catch(() => resolve("error"));
    } catch {
      resolve("error");
    }
  });
}

const waitMs = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function readTabAlive(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_ALIVE_KEY);
  } catch {
    return null;
  }
}

function writeTabAlive(id: string) {
  try {
    window.sessionStorage.setItem(TAB_ALIVE_KEY, id);
  } catch {
    // sessionStorage indisponível: fica só a troca de mensagens.
  }
}

function clearTabAlive() {
  try {
    window.sessionStorage.removeItem(TAB_ALIVE_KEY);
  } catch {
    // idem
  }
}

// F5/fechar/sair (incl. para o bfcache): a página deixa de estar viva.
const onTabPageHide = () => clearTabAlive();
// Volta do bfcache (persisted) com o estado intacto: volta a marcar-se.
const onTabPageShow = () => {
  if (tabState) writeTabAlive(tabState.tabId);
};

function bindTabLifecycle() {
  if (tabLifecycleBound) return;
  tabLifecycleBound = true;
  window.addEventListener("pagehide", onTabPageHide);
  window.addEventListener("pageshow", onTabPageShow);
}

// Só dev: o HMR volta a correr o módulo com outro id de instância. O canal, a
// marca e a tranca da versão antiga fariam a nova passar a cópia e apagar o
// cesto: larga-se a tranca (a nova volta a pedi-la, com as novas tentativas).
import.meta.hot?.dispose(() => {
  try {
    tabLockRelease?.();
  } catch {
    // já largada
  }
  tabLockRelease = null;
  tabState = null;
  tabCheckPromise = null;
  tabChannels.forEach((c) => {
    try {
      c.close();
    } catch {
      // já fechado
    }
  });
  tabChannels.clear();
  tabYield = null;
  window.removeEventListener("pagehide", onTabPageHide);
  window.removeEventListener("pageshow", onTabPageShow);
  clearTabAlive();
});

function readTabId(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_ID_KEY);
  } catch {
    return null;
  }
}

function writeTabId(id: string) {
  try {
    window.sessionStorage.setItem(TAB_ID_KEY, id);
  } catch {
    // sessionStorage indisponível: também não há nada para repor.
  }
}

/** Apaga cesto/"Por enviar"/contexto desta sessionStorage. Devolve se havia cesto ou "Por enviar". */
function clearTabSessionData(): boolean {
  try {
    const ss = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && TAB_DATA_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => ss.removeItem(k));
    return keys.some((k) => !k.startsWith("olyvia.receiving.context."));
  } catch {
    return false;
  }
}

/** Canal do utilizador; abre-o e passa a responder a quem perguntar pelo tabId deste separador. */
function tabChannel(userId: string): BroadcastChannel | null {
  const existing = tabChannels.get(userId);
  if (existing) return existing;
  if (typeof BroadcastChannel === "undefined") return null;
  let ch: BroadcastChannel;
  try {
    ch = new BroadcastChannel(`olyvia.receiving.tabs.${userId}`);
  } catch {
    return null;
  }
  ch.addEventListener("message", (ev: MessageEvent) => {
    const m = ev.data as Partial<TabMsg> | null;
    if (!m || m.t !== "ping" || typeof m.tab !== "string" || typeof m.from !== "string") return;
    if (m.from === tabInstanceId || !tabState || m.tab !== tabState.tabId) return;
    // Duas cargas com o mesmo tabId a verificar ao mesmo tempo: decide já, sem
    // depender de cada uma ter recebido o pedido da outra (uma pode ter nascido
    // depois do pedido da outra). Id menor responde (a outra passa a cópia); id
    // maior passa ela própria a cópia. Em qualquer ordem, só uma fica com os dados.
    if (tabState.checking && !(tabInstanceId < m.from)) {
      tabYield?.();
      return;
    }
    try {
      ch.postMessage({ t: "pong", tab: m.tab, from: tabInstanceId, to: m.from } satisfies TabMsg);
    } catch {
      // canal fechado: nada a fazer
    }
  });
  tabChannels.set(userId, ch);
  return ch;
}

/**
 * Verificação do separador (uma por carga). Resolve depois de decidir; se este
 * separador for uma cópia, as chaves copiadas já foram apagadas.
 */
function checkTab(userId: string): Promise<TabCheck> {
  // O canal responde também com Web Locks (um separador sem tranca a funcionar
  // cai no recurso e pergunta por aqui).
  const ch = tabChannel(userId);
  if (tabCheckPromise) return tabCheckPromise;
  const locks = tabLocks();
  const viaLocks: Promise<TabCheck | null> = locks
    ? checkTabWithLocks(locks).catch(() => null)
    : Promise.resolve(null);
  tabCheckPromise = viaLocks
    .then((r) => r ?? checkTabFallback(ch))
    // Falha inesperada: sem prova de que é o original — não repõe (lado seguro).
    .catch((): TabCheck => {
      const dropped = clearTabSessionData();
      const id = newRequestId();
      tabState = { tabId: id, checking: false };
      writeTabId(id);
      writeTabAlive(id);
      if (locks) void tryHoldTabLock(locks, id);
      return { reason: "unsupported", dropped };
    });
  return tabCheckPromise;
}

/**
 * Passa a separador novo com Web Locks: prende a tranca de um tabId novo e só
 * depois o escreve (uma cópia feita a seguir vê o tabId novo já preso).
 */
async function becomeNewLocked(locks: LockManager, reason: TabCheck["reason"]): Promise<TabCheck> {
  const dropped = reason === "ok" ? false : clearTabSessionData();
  let id = newRequestId();
  for (let i = 0; i < 3; i++) {
    // "busy" com um id aleatório novo não deve acontecer; "error": fica sem
    // tranca — uma cópia desta também cai no recurso e a marca decide.
    if ((await tryHoldTabLock(locks, id)) !== "busy") break;
    id = newRequestId();
  }
  tabState = { tabId: id, checking: false };
  writeTabId(id);
  writeTabAlive(id);
  return { reason, dropped };
}

/** Verificação com Web Locks. null = a API falhou: usa-se o recurso. */
async function checkTabWithLocks(locks: LockManager): Promise<TabCheck | null> {
  bindTabLifecycle();
  const current = readTabId();
  // Separador sem tabId: carga nova (ou dados de antes desta versão) — repõe.
  if (!current) return becomeNewLocked(locks, "ok");
  tabState = { tabId: current, checking: true };
  let attempt = await tryHoldTabLock(locks, current);
  for (let i = 0; attempt === "busy" && i < TAB_LOCK_RETRIES; i++) {
    await waitMs(TAB_LOCK_RETRY_MS);
    attempt = await tryHoldTabLock(locks, current);
  }
  if (attempt === "error") {
    tabState = null;
    return null;
  }
  if (attempt === "held") {
    tabState = { tabId: current, checking: false };
    writeTabAlive(current);
    return { reason: "ok", dropped: false };
  }
  // Presa por outra carga viva com o mesmo tabId: esta é a cópia.
  return becomeNewLocked(locks, "duplicate");
}

/** Recurso sem Web Locks: marca de "vivo" + BroadcastChannel com desempate simétrico. */
function checkTabFallback(ch: BroadcastChannel | null): Promise<TabCheck> {
  return new Promise<TabCheck>((resolve) => {
    const current = readTabId();
    const alive = readTabAlive();
    const discarded = (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true;
    bindTabLifecycle();
    const becomeNew = (reason: TabCheck["reason"]) => {
      const dropped = reason === "ok" ? false : clearTabSessionData();
      tabState = { tabId: newRequestId(), checking: false };
      writeTabId(tabState.tabId);
      // Fica com os (seus) dados: marca-se, para uma cópia desta também ser detetada.
      writeTabAlive(tabState.tabId);
      resolve({ reason, dropped });
    };
    // Separador sem tabId: carga nova (ou dados de antes desta versão) — repõe.
    if (!current) {
      becomeNew("ok");
      return;
    }
    // Marca copiada de um separador vivo (o F5 retira-a no pagehide): é cópia,
    // mesmo que o original esteja congelado e não responda.
    if (alive === current && !discarded) {
      becomeNew("duplicate");
      return;
    }
    if (!ch) {
      becomeNew("unsupported");
      return;
    }
    tabState = { tabId: current, checking: true };
    // Já durante a espera: uma cópia feita agora vê a marca e não repõe.
    writeTabAlive(current);
    let done = false;
    let timer = 0;
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data as Partial<TabMsg> | null;
      if (m && m.t === "pong" && m.tab === current && m.to === tabInstanceId) finish(true);
    };
    const finish = (duplicate: boolean) => {
      if (done) return;
      done = true;
      tabYield = null;
      window.clearTimeout(timer);
      ch.removeEventListener("message", onMsg);
      if (duplicate) {
        becomeNew("duplicate");
      } else {
        tabState = { tabId: current, checking: false };
        writeTabAlive(current);
        resolve({ reason: "ok", dropped: false });
      }
    };
    tabYield = () => finish(true);
    ch.addEventListener("message", onMsg);
    timer = window.setTimeout(() => finish(false), TAB_PROBE_MS);
    try {
      ch.postMessage({ t: "ping", tab: current, from: tabInstanceId } satisfies TabMsg);
    } catch {
      // Não deu para perguntar: não há prova de que é o original.
      done = true;
      tabYield = null;
      window.clearTimeout(timer);
      ch.removeEventListener("message", onMsg);
      becomeNew("unsupported");
    }
  });
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
  sent: undefined,
  ackKey: undefined,
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
  info: {
    name: string;
    sku: string | null;
    quantity: number;
    uomCode: string | null;
    unitsPerUom: number;
    deliveryNoteId?: string | null;
    deliveryNoteNumber?: string | null;
  },
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
    deliveryNoteNumber: result.delivery_note_number ?? info.deliveryNoteNumber ?? null,
    withNote: typeof result.delivery_note_id === "string" ? true : !!dnOf(info),
    noteChecks: noteChecksOf(result),
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
  // Guia do fornecedor ("" = sem guia).
  const { hasPermission } = usePermissions();
  const canEditNotes = hasPermission("purchase_orders.receive");
  // Regra de rpc_product_code_learn: (receber E editar inventário) OU editar produtos.
  const canEditProducts = hasPermission("products.edit");
  const canLearnCodes =
    canEditProducts || (hasPermission("purchase_orders.receive") && hasPermission("inventory.edit"));
  const [deliveryNoteId, setDeliveryNoteId] = useState("");
  const [noteInfo, setNoteInfo] = useState<DeliveryNoteFull | null>(null);
  const [noteLoadError, setNoteLoadError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);
  /** "Voltar ao cesto" que mudaria a guia do ecrã: pede confirmação (dn = guia com que entraria). */
  const [unsentConfirm, setUnsentConfirm] = useState<{ id: string; dn: string; message: string } | null>(null);

  const [code, setCode] = useState("");
  const [queueSize, setQueueSize] = useState(0);
  const [failedScans, setFailedScans] = useState<FailedScan[]>([]);
  const [rejectedScans, setRejectedScans] = useState<RejectedScan[]>([]);
  const [learnTarget, setLearnTarget] = useState<LearnTarget | null>(null);
  /** Separado do alvo: ao fechar, o código fica visível durante a animação. */
  const [learnOpen, setLearnOpen] = useState(false);
  /** Desfazer em curso (por id do código): um clique de cada vez. */
  const undoingCodesRef = useRef(new Set<string>());
  /** Texto para leitores de ecrã (região aria-live sempre montada). */
  const [announcement, setAnnouncement] = useState("");
  const [panel, setPanel] = useState<ScanPanel>({ kind: "none" });
  const [choices, setChoices] = useState<PendingChoice[]>([]);
  const [scannerMode, setScannerMode] = useState<boolean>(() => readStorage(KEYBOARD_MODE_KEY) === "1");

  const [basket, setBasket] = useState<BasketEntry[]>([]);
  const [received, setReceived] = useState<ReceivedEntry[]>([]);
  /** "Por enviar" da empresa ativa (espelho do sessionStorage). */
  const [unsent, setUnsent] = useState<UnsentEntry[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PendingReceipt[]>([]);
  const [pendingBusy, setPendingBusy] = useState<Set<string>>(() => new Set());
  const [pendingChecked, setPendingChecked] = useState(false);
  /** Verificação de separador duplicado concluída: só depois se repõe cesto/"Por enviar"/contexto. */
  const [tabChecked, setTabChecked] = useState(false);
  /** Leituras liberadas (verificação feita e cesto da empresa ativa reposto); só para o texto "A preparar…". */
  const [scanReady, setScanReady] = useState(false);
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
  const deliveryNoteRef = useRef(deliveryNoteId);
  deliveryNoteRef.current = deliveryNoteId;
  const noteInfoRef = useRef<DeliveryNoteFull | null>(noteInfo);
  noteInfoRef.current = noteInfo;
  const noteSeqRef = useRef(0);
  const orgRef = useRef(orgId);
  orgRef.current = orgId;
  const orgNameRef = useRef(activeCompany?.name ?? "");
  orgNameRef.current = activeCompany?.name ?? "";
  const scannerModeRef = useRef(scannerMode);
  scannerModeRef.current = scannerMode;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const tabCheckedRef = useRef(tabChecked);
  tabCheckedRef.current = tabChecked;
  /**
   * Época da empresa ativa: sobe a cada troca. Respostas e ciclos comparam a
   * época capturada (A→B→A não é "a mesma empresa" para um pedido de antes).
   */
  const orgEpochRef = useRef(0);
  /** Chave do cesto em sessionStorage já reposta nesta instância (só se grava depois). */
  const restoredBasketKeyRef = useRef<string | null>(null);
  /** Armazéns/fornecedores carregados para a época indicada (para validar o cesto reposto). */
  const optionsRef = useRef<{ epoch: number; warehouses: Option[]; suppliers: Option[] } | null>(null);

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
  /** "Voltar ao cesto" em curso (a verificação da guia é assíncrona): uma de cada vez. */
  const restoringRef = useRef(false);

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

  // Separador duplicado: nada da sessionStorage é reposto (nem gravado) antes
  // de esta verificação terminar — os efeitos de repor esperam por tabChecked
  // e os de gravar só correm depois de repor.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void checkTab(userId).then((r) => {
      if (!alive || !mountedRef.current) return;
      if (r.dropped && !tabNoticeShown) {
        tabNoticeShown = true;
        toast({
          title: r.reason === "duplicate" ? "Separador duplicado" : "Cesto anterior não reposto",
          description:
            r.reason === "duplicate"
              ? "O cesto e o «Por enviar» ficam só no separador original, para não se receber duas vezes."
              : "Este browser não permite confirmar que o separador não é uma cópia — o cesto e o «Por enviar» anteriores não foram repostos. Volta a ler o que faltar receber.",
        });
      }
      setTabChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [userId, toast]);

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

  // Relógio do "Descartar": só corre enquanto houver pendentes ou entradas incertas.
  const hasPending = pending.length > 0 || basket.some(isUncertain);
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
        // A guia DA PENDENTE (nunca a do ecrã): o servidor recusa o mesmo id com outra guia.
        p_delivery_note_id: dnOf(p) || undefined,
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
    setLearnTarget(null);
    setLearnOpen(false);
    setAnnouncement("");
    setWarehouseId("");
    setSupplierId("");
    setDeliveryNoteId("");
    setPickerOpen(false);
    setCreateNoteOpen(false);
    setDetailNoteId(null);
    setWarehouses([]);
    setSuppliers([]);
    // Síncrono: o efeito que repõe o cesto corre a seguir, neste mesmo commit,
    // e não pode ver o armazém/fornecedor/guia da empresa anterior.
    warehouseRef.current = "";
    supplierRef.current = "";
    deliveryNoteRef.current = "";
    optionsRef.current = null;
    if (!orgId) {
      setOptionsLoading(false);
      return;
    }
    let cancelled = false;
    const epoch = orgEpochRef.current;
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
      const sups = (supRes.data ?? []) as Option[];
      setWarehouses(whs);
      setSuppliers(sups);
      // Só se a carga correu: com erro a lista vem vazia e não serve para validar.
      optionsRef.current = whRes.error || supRes.error ? null : { epoch, warehouses: whs, suppliers: sups };
      // Um cesto reposto do sessionStorage já trouxe o armazém: mantém-no se ainda existir.
      const current = warehouseRef.current;
      const remembered = readStorage(warehouseStorageKey(orgId));
      let nextWh = "";
      if (whRes.error || (current && whs.some((w) => w.id === current))) {
        nextWh = current; // mantém (com erro na carga não há como validar)
      } else if (remembered && whs.some((w) => w.id === remembered)) nextWh = remembered;
      else if (whs.length === 1) nextWh = whs[0].id;
      if (nextWh !== current) {
        setWarehouseId(nextWh);
        warehouseRef.current = nextWh;
      }
      // Fornecedor reposto que já não pertence a esta empresa: volta a "Todos".
      // A guia fixa o fornecedor: sai com ele (e avisa-se, nunca em silêncio).
      const curSup = supplierRef.current;
      if (curSup && !supRes.error && !sups.some((s) => s.id === curSup)) {
        const hadNote = !!deliveryNoteRef.current;
        setSupplierId("");
        supplierRef.current = "";
        setDeliveryNoteId("");
        deliveryNoteRef.current = "";
        if (hadNote) {
          const basketNote = basketRef.current.length > 0 ? " As entradas do cesto ficam sem guia." : "";
          setAnnouncement(`Fornecedor indisponível — a guia foi retirada.${basketNote}`);
          toast({ title: "Fornecedor indisponível", description: `A guia foi retirada.${basketNote}` });
        }
      }
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
      deliveryNoteId: deliveryNoteRef.current,
      entries: list.filter((e) => !isLocked(e)).map(toStoredEntry),
    });
  }, []);

  useEffect(() => {
    saveBasketNow(basket);
  }, [basket, warehouseId, supplierId, deliveryNoteId, userId, orgId, saveBasketNow]);

  // Contexto do ecrã (armazém/fornecedor/guia), mesmo com o cesto vazio. Só
  // depois de reposto nesta instância (mesma regra do cesto: nunca grava na
  // chave da empresa nova com os valores da anterior).
  useEffect(() => {
    if (!userId || !orgId) return;
    if (restoredBasketKeyRef.current !== basketStorageKey(userId, orgId)) return;
    writeSessionContext(contextStorageKey(userId, orgId), {
      warehouseId: warehouseRef.current,
      supplierId: supplierRef.current,
      deliveryNoteId: deliveryNoteRef.current,
    });
  }, [warehouseId, supplierId, deliveryNoteId, userId, orgId]);

  useEffect(() => {
    if (!userId || !orgId || !tabChecked) return;
    const key = basketStorageKey(userId, orgId);
    if (restoredBasketKeyRef.current === key) return;
    restoredBasketKeyRef.current = key;
    const saved = readSessionBasket(key);
    // Por segurança: uma entrada que já originou uma receção pendente nunca volta como livre.
    const pendingEntryIds = new Set(readPending(userId).map((p) => p.entryId).filter(Boolean) as string[]);
    pendingRef.current.forEach((p) => p.entryId && pendingEntryIds.add(p.entryId));
    const entries = (saved?.entries ?? []).filter((e) => !pendingEntryIds.has(e.id)).map(fromStoredEntry);
    if (!saved || entries.length === 0) {
      // Sem cesto para repor: repõe o contexto do ecrã (armazém, fornecedor e
      // GUIA) deste separador. Só se nada tiver sido escolhido entretanto e o
      // cesto estiver vazio; ids de outra empresa não entram (as opções, se já
      // carregadas, validam-nos; se não, a carga valida-os quando chegar).
      const ctx = readSessionContext(contextStorageKey(userId, orgId));
      if (!ctx || basketRef.current.length > 0 || submittingRef.current) return;
      if (deliveryNoteRef.current || supplierRef.current) return;
      const opts0 = optionsRef.current && optionsRef.current.epoch === orgEpochRef.current ? optionsRef.current : null;
      if (ctx.warehouseId && (!opts0 || opts0.warehouses.some((w) => w.id === ctx.warehouseId))) {
        setWarehouseId(ctx.warehouseId);
        warehouseRef.current = ctx.warehouseId;
      }
      const sup0 = ctx.supplierId && (!opts0 || opts0.suppliers.some((x) => x.id === ctx.supplierId)) ? ctx.supplierId : "";
      // A guia fixa o fornecedor: sem o fornecedor dela, não se repõe a guia.
      const dn0 = ctx.deliveryNoteId && sup0 ? ctx.deliveryNoteId : "";
      setSupplierId(sup0);
      supplierRef.current = sup0;
      setDeliveryNoteId(dn0);
      deliveryNoteRef.current = dn0;
      if (dn0) setAnnouncement("Guia do fornecedor reposta.");
      return;
    }
    setBasket((prev) => [...prev, ...entries.filter((x) => !prev.some((p) => p.id === x.id))]);
    // O cesto volta com o armazém e o fornecedor com que foi gravado. Se ainda
    // não houver nada no cesto, sobrepõe-se ao armazém escolhido entretanto
    // (ex.: o lembrado, carregado antes de a sessão chegar). Se as opções desta
    // empresa já estiverem carregadas, só se aceitam ids que lhe pertençam; se
    // não, a carga valida-os quando chegar.
    const opts = optionsRef.current && optionsRef.current.epoch === orgEpochRef.current ? optionsRef.current : null;
    const whOk = !!saved.warehouseId && (!opts || opts.warehouses.some((w) => w.id === saved.warehouseId));
    if (whOk && (!warehouseRef.current || basketRef.current.length === 0)) {
      const supOk = !saved.supplierId || !opts || opts.suppliers.some((s) => s.id === saved.supplierId);
      const sup = supOk ? saved.supplierId : "";
      setWarehouseId(saved.warehouseId);
      warehouseRef.current = saved.warehouseId;
      setSupplierId(sup);
      supplierRef.current = sup;
      // A guia volta com o cesto (o cartão mostra se entretanto foi fechada).
      // A guia fixa o fornecedor: sem o fornecedor dela, não se repõe a guia.
      const dn = sup ? dnOf(saved) : "";
      setDeliveryNoteId(dn);
      deliveryNoteRef.current = dn;
    }
    setAnnouncement(`Cesto reposto: ${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}.`);
  }, [userId, orgId, tabChecked]);

  // "Por enviar" da empresa ativa: carrega ao entrar/trocar e acompanha o que
  // outra instância (ex.: a antiga, já desmontada) lá escrever. Só depois da
  // verificação de separador duplicado (a cópia não pode mostrar o do original).
  useEffect(() => {
    if (!userId || !orgId || !tabChecked) return;
    const key = unsentStorageKey(userId, orgId);
    setUnsent(readUnsent(key));
    const onChange = (ev: Event) => {
      if ((ev as CustomEvent<string>).detail !== key) return;
      if (mountedRef.current) setUnsent(readUnsent(key));
    };
    window.addEventListener(UNSENT_EVENT, onChange);
    return () => window.removeEventListener(UNSENT_EVENT, onChange);
  }, [userId, orgId, tabChecked]);

  /**
   * Entradas que ficaram por enviar quando o ciclo parou (troca de empresa ou
   * saída do ecrã): voltam ao cesto livres, no ecrã se ainda for o da mesma
   * empresa e armazém; com o ecrã montado noutra empresa, ao cesto guardado
   * dessa empresa (esta instância só grava na chave da empresa ativa, por isso
   * não há sobreposição). Em todos os outros casos — ecrã desmontado (uma
   * instância nova pode já ter reposto o cesto e regravá-lo-ia por cima),
   * outro armazém — vão para "Por enviar", sempre por read-modify-write.
   */
  const returnUnsent = useCallback(
    (org: string, orgName: string, wh: string, sup: string, dn: string, dnNumber: string | null, list: BasketEntry[]) => {
      if (list.length === 0) return;
      const freed = list.map(freeEntry);
      if (mountedRef.current && orgRef.current === org && warehouseRef.current === wh && deliveryNoteRef.current === dn) {
        setBasket((prev) => [...prev, ...freed.filter((x) => !prev.some((p) => p.id === x.id))]);
        return;
      }
      const uid = userIdRef.current;
      const onOtherScreen = mountedRef.current && orgRef.current === org; // mesma empresa, outro armazém/guia
      if (uid && mountedRef.current && !onOtherScreen) {
        const key = basketStorageKey(uid, org);
        const saved = readSessionBasket(key);
        if (!saved || saved.entries.length === 0 || (saved.warehouseId === wh && dnOf(saved) === dn)) {
          writeSessionBasket(key, {
            warehouseId: wh,
            supplierId: saved && saved.entries.length > 0 ? saved.supplierId : sup,
            deliveryNoteId: dn,
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
      if (uid) {
        const at = new Date().toISOString();
        const items: UnsentEntry[] = freed.map((e) => ({
          ...toStoredEntry(e),
          warehouseId: wh,
          supplierId: sup,
          deliveryNoteId: dn || null,
          deliveryNoteNumber: dn ? dnNumber : null,
          at,
        }));
        const next = mutateUnsent(unsentStorageKey(uid, org), (cur) => [
          ...cur,
          ...items.filter((x) => !cur.some((c) => c.id === x.id)),
        ]);
        if (next) {
          if (mountedRef.current && orgRef.current === org) setUnsent(next);
          toast({
            title: `Ficaram por enviar em «${orgName}»`,
            description: `${freed.length} ${freed.length === 1 ? "entrada ficou" : "entradas ficaram"} em "Por enviar" — nada foi recebido.`,
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

  /**
   * "Por enviar" → cesto: só com o cesto vazio ou no mesmo armazém, fornecedor
   * e guia. Com o cesto vazio o ecrã passa para o armazém/fornecedor/guia da
   * entrada; se a guia dela já não estiver aberta, a entrada (nada foi
   * recebido) entra na guia escolhida agora no ecrã, ou sem guia.
   */
  const restoreUnsent = async (id: string, confirmedDn?: string) => {
    if (restoringRef.current) return; // dois toques seguidos: só uma reposição de cada vez
    restoringRef.current = true;
    try {
      await restoreUnsentInner(id, confirmedDn);
    } finally {
      restoringRef.current = false;
    }
  };

  /**
   * Corpo de restoreUnsent. Se a entrada for pôr o ecrã noutra guia (a dela,
   * ou — se a dela já não estiver aberta — ficar na do ecrã / sem guia), pede
   * confirmação primeiro: confirmedDn é a guia aceite; se entretanto mudou,
   * volta a perguntar.
   */
  const restoreUnsentInner = async (id: string, confirmedDn?: string) => {
    const uid = userIdRef.current;
    const org = orgRef.current;
    if (!uid || !org || submittingRef.current) return;
    setUnsentConfirm(null);
    const epoch = orgEpochRef.current;
    const key = unsentStorageKey(uid, org);
    const item = readUnsent(key).find((x) => x.id === id) ?? unsent.find((x) => x.id === id);
    if (!item) return;
    const itemDn = dnOf(item);
    const sameContext = () =>
      item.warehouseId === warehouseRef.current && item.supplierId === supplierRef.current && itemDn === deliveryNoteRef.current;
    if (basketRef.current.length > 0 && !sameContext()) {
      toast({
        title: "Armazém, fornecedor ou guia diferente",
        description: "Confirma ou esvazia o cesto primeiro — esta entrada foi lida noutro armazém/fornecedor/guia.",
        variant: "destructive",
      });
      return;
    }
    if (basketRef.current.length === 0) {
      const opts = optionsRef.current && optionsRef.current.epoch === orgEpochRef.current ? optionsRef.current : null;
      if (opts && !opts.warehouses.some((w) => w.id === item.warehouseId)) {
        toast({ title: "Armazém indisponível", description: "O armazém desta entrada já não existe.", variant: "destructive" });
        return;
      }
      let sup = !item.supplierId || !opts || opts.suppliers.some((s) => s.id === item.supplierId) ? item.supplierId : "";
      // A guia fixa o fornecedor: sem o fornecedor dela, a guia da entrada não
      // volta — fica a guia do ecrã (se houver fornecedor no ecrã) ou nenhuma.
      const supGone = !!itemDn && !sup;
      let dn = itemDn;
      let itemNoteOpen = true;
      if (supGone) {
        // Fica o fornecedor do ecrã (não se limpa) e a guia do ecrã, se houver;
        // a guia da entrada não volta.
        sup = supplierRef.current;
        dn = sup ? deliveryNoteRef.current : "";
      } else if (itemDn && itemDn !== deliveryNoteRef.current) {
        const r = await fetchDeliveryNote(itemDn);
        if (!isCurrent(epoch, org) || submittingRef.current) return;
        if (r.error && r.error.code !== "P0002") {
          toast({
            title: "Não foi possível verificar a guia",
            description: "A entrada ficou em \"Por enviar\" — tenta de novo daqui a pouco.",
            variant: "destructive",
          });
          return;
        }
        if (!r.note || r.note.status !== "open") {
          itemNoteOpen = false;
          dn = deliveryNoteRef.current;
          sup = dn ? supplierRef.current : sup;
        }
      }
      // A guia do ecrã vai mudar, ou a entrada vai entrar noutra guia que não a
      // dela: nunca em silêncio — pede confirmação (decisão do utilizador).
      if (dn !== deliveryNoteRef.current || dn !== itemDn) {
        if (confirmedDn === undefined || confirmedDn !== dn) {
          const curDn = deliveryNoteRef.current;
          const curLabel = curDn
            ? `a guia ${noteInfoRef.current?.id === curDn ? noteLabel(noteInfoRef.current.note_number) : "escolhida"}`
            : "sem guia";
          const itemLabel = itemDn ? `a guia ${item.deliveryNoteNumber ? noteLabel(item.deliveryNoteNumber) : "do fornecedor"}` : "sem guia";
          const dnLabel = dn && dn === curDn ? curLabel : "sem guia";
          const supName = sup ? suppliers.find((s) => s.id === sup)?.name : undefined;
          const keepLabel = sup
            ? `com o fornecedor ${supName ? `«${supName}»` : "escolhido no ecrã"} e ${dnLabel}`
            : `sem fornecedor e ${dnLabel}`;
          const message = supGone
            ? `Esta entrada foi lida com ${itemLabel}, de um fornecedor que já não está disponível. Volta ao cesto ${keepLabel}?`
            : !itemNoteOpen
            ? `Esta entrada foi lida com ${itemLabel}, que já não está aberta. Volta ao cesto com ${curLabel} (nada tinha sido recebido)?`
            : `Esta entrada foi lida com ${itemLabel}. O ecrã passa de ${curLabel} para ${itemLabel} — as leituras seguintes também. Continuar?`;
          setUnsentConfirm({ id, dn, message });
          return;
        }
      }
      // Durante a verificação o cesto pode ter recebido leituras.
      if (basketRef.current.length > 0 && !sameContext()) {
        toast({ title: "O cesto mudou entretanto", description: "Tenta de novo.", variant: "destructive" });
        return;
      }
      if (basketRef.current.length === 0) {
        setWarehouseId(item.warehouseId);
        warehouseRef.current = item.warehouseId;
        setSupplierId(sup);
        supplierRef.current = sup;
        setDeliveryNoteId(dn);
        deliveryNoteRef.current = dn;
      }
    }
    const entry = fromStoredEntry(item);
    setBasket((prev) => (prev.some((p) => p.id === entry.id) ? prev : [entry, ...prev]));
    const next = mutateUnsent(key, (cur) => cur.filter((x) => x.id !== id));
    setUnsent(next ?? ((cur) => cur.filter((x) => x.id !== id)));
    focusScan();
  };

  const dismissUnsent = (id: string) => {
    setUnsentConfirm((cur) => (cur?.id === id ? null : cur));
    const uid = userIdRef.current;
    const org = orgRef.current;
    if (!uid || !org) return;
    const next = mutateUnsent(unsentStorageKey(uid, org), (cur) => cur.filter((x) => x.id !== id));
    setUnsent(next ?? ((cur) => cur.filter((x) => x.id !== id)));
    focusScan();
  };

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id);
    if (orgId) writeStorage(warehouseStorageKey(orgId), id || null);
    setPanel({ kind: "none" });
    setChoices([]);
    focusScan();
  };

  const handleSupplierChange = (id: string) => {
    if (deliveryNoteRef.current) return; // a guia fixa o fornecedor
    setSupplierId(id);
    setPanel({ kind: "none" });
    setChoices([]);
    focusScan();
  };

  // ── Guia do fornecedor ──
  /** Recarrega o cartão da guia escolhida (estado, anunciado/recebido). */
  const reloadNote = useCallback(async () => {
    const id = deliveryNoteRef.current;
    const seq = ++noteSeqRef.current;
    if (!id) {
      setNoteInfo(null);
      setNoteLoadError(null);
      return;
    }
    const r = await fetchDeliveryNote(id);
    if (!mountedRef.current || seq !== noteSeqRef.current || deliveryNoteRef.current !== id) return;
    if (r.note) {
      setNoteInfo(r.note);
      setNoteLoadError(null);
    } else {
      setNoteLoadError(
        r.error?.code === "P0002"
          ? "Guia não encontrada (pode ter sido apagada ou ser de outra empresa)."
          : r.error?.code
            ? r.error.message || "Não foi possível carregar a guia."
            : "Sem ligação ao servidor — não foi possível carregar a guia.",
      );
    }
  }, []);

  useEffect(() => {
    setNoteInfo((cur) => (cur && cur.id === deliveryNoteId ? cur : null));
    setNoteLoadError(null);
    void reloadNote();
  }, [deliveryNoteId, reloadNote]);

  /**
   * Escolhe a guia (ou nenhuma). Mesma regra do armazém/fornecedor: só com o
   * cesto vazio e sem receção em curso. A guia fixa o fornecedor.
   */
  const selectNote = (n: { id: string; supplier_id: string } | null) => {
    if (basketRef.current.length > 0 || submittingRef.current) {
      toast({
        title: "Cesto por confirmar",
        description: "Confirma ou esvazia o cesto para mudar de guia.",
        variant: "destructive",
      });
      return;
    }
    const id = n?.id ?? "";
    setDeliveryNoteId(id);
    deliveryNoteRef.current = id;
    setUnsentConfirm(null);
    if (n) {
      setSupplierId(n.supplier_id);
      supplierRef.current = n.supplier_id;
    }
    setPanel({ kind: "none" });
    setChoices([]);
    setPickerOpen(false);
    focusScan();
  };

  /** Guia alterada na ficha (gravada, fechada, reaberta…): atualiza o cartão e refaz as pré-visualizações. */
  const handleNoteChanged = (n: DeliveryNoteFull) => {
    if (n.id !== deliveryNoteRef.current) return;
    const before = noteInfoRef.current;
    setNoteInfo(n);
    setNoteLoadError(null);
    if (before && (before.updated_at !== n.updated_at || before.status !== n.status)) {
      for (const x of basketRef.current) if (!isLocked(x)) recalcPreview(x.id, true);
    }
  };

  /** Trabalho local ainda não recebido com uma guia (aviso ao fechar/cancelar). */
  const localWorkFor = (noteId: string) => ({
    basket: deliveryNoteRef.current === noteId ? basketRef.current.length : 0,
    unsent: unsent.filter((u) => dnOf(u) === noteId).length,
    pending: pending.filter((p) => dnOf(p) === noteId).length,
  });

  /**
   * Guia fechada/cancelada a meio: as entradas livres do cesto passam para "Por
   * enviar" (com a guia delas) para se poder escolher outra guia. A quantidade
   * é fotografada uma vez e subtraída (como no Confirmar): uma leitura que
   * chegue entretanto fica no cesto, nunca se perde.
   */
  const moveBasketToUnsent = () => {
    const uid = userIdRef.current;
    const org = orgRef.current;
    if (!uid || !org || submittingRef.current) return;
    let snap: BasketEntry[] | null = null;
    flushSync(() => {
      setBasket((prev) => {
        if (!snap) snap = prev.filter((e) => !isLocked(e));
        return prev;
      });
    });
    const picked: BasketEntry[] = snap ?? [];
    if (picked.length === 0) return;
    const dn = deliveryNoteRef.current;
    const dnNumber = dn && noteInfoRef.current?.id === dn ? noteInfoRef.current.note_number : null;
    const at = new Date().toISOString();
    const items: UnsentEntry[] = picked.map((e) => ({
      ...toStoredEntry(e),
      warehouseId: warehouseRef.current,
      supplierId: supplierRef.current,
      deliveryNoteId: dn || null,
      deliveryNoteNumber: dnNumber,
      at,
    }));
    const next = mutateUnsent(unsentStorageKey(uid, org), (cur) => [...cur, ...items.filter((x) => !cur.some((c) => c.id === x.id))]);
    if (!next) {
      toast({
        title: "Não foi possível guardar",
        description: "O armazenamento do browser não está disponível — as entradas ficaram no cesto.",
        variant: "destructive",
      });
      return;
    }
    setUnsent(next);
    const qty = new Map(picked.map((e) => [e.id, e.quantity]));
    setBasket((prev) =>
      prev.flatMap((x) => {
        const q = qty.get(x.id);
        if (q === undefined || isLocked(x)) return [x];
        const rest = x.quantity - q;
        return rest > 0 ? [freeEntry({ ...x, id: newRequestId(), quantity: rest })] : [];
      }),
    );
    toast({
      title: "Cesto passado para \"Por enviar\"",
      description: `${picked.length} ${picked.length === 1 ? "entrada" : "entradas"} — nada foi recebido. Escolhe outra guia e usa "Voltar ao cesto".`,
    });
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
    (e: BasketEntry) =>
      `${e.quantity}|${e.poItemId ?? ""}|${warehouseRef.current}|${supplierRef.current}|${deliveryNoteRef.current}`,
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
          p_delivery_note_id: deliveryNoteRef.current || undefined,
        });
        if (!error) preview = { sig, status: "ok", result: data as unknown as ReceiveResult };
        else {
          preview = { sig, status: isTransient(error) ? "transient" : "error", error: errorMessage(error, "preview") };
          // Recusa com guia (p.ex. fechada a meio): o cartão da guia mostra o estado atual.
          if (!isTransient(error) && deliveryNoteRef.current) void reloadNote();
        }
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
        } else {
          // Tentativas automáticas esgotadas (n > PREVIEW_AUTO_RETRIES): o botão pede "Recalcular".
          previewRetries.current.set(id, { sig, n: n + 1 });
        }
      } else {
        previewRetries.current.delete(id);
      }
    },
    [sigOf, updateEntry, recalcPreview, isCurrent, reloadNote],
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
  }, [basket, warehouseId, supplierId, deliveryNoteId, sigOf, runPreview]);

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
  const addRejected = useCallback((value: string, message: string, reason?: RejectedScan["reason"]) => {
    setRejectedScans((cur) => [{ id: newRequestId(), value, message, at: new Date(), ...(reason ? { reason } : {}) }, ...cur]);
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
    async (value: string, unitConversion = false): Promise<{ transient: string } | null> => {
      const org = orgRef.current;
      const epoch = orgEpochRef.current;
      const wh = warehouseRef.current;
      const sup = supplierRef.current;
      const dn = deliveryNoteRef.current;
      if (!wh) return { transient: "Escolhe primeiro o armazém." };
      try {
        const { data, error } = await supabase.rpc("rpc_receiving_lookup", {
          p_warehouse_id: wh,
          p_code: value,
          p_supplier_id: sup || undefined,
          p_delivery_note_id: dn || undefined,
          // Só na re-leitura depois de associar; nas outras a chamada fica igual.
          ...(unitConversion ? { p_unit_conversion: true } : {}),
        });
        if (!isCurrent(epoch, org)) return null;
        // A guia mudou durante a procura: o âmbito era outro — repete a leitura.
        if (deliveryNoteRef.current !== dn) return { transient: "A guia mudou entretanto — a leitura vai ser repetida." };
        if (error) {
          if (isTransient(error)) return { transient: errorMessage(error, "lookup") };
          addRejected(value, errorMessage(error, "lookup"));
          // Guia fechada/cancelada a meio: o cartão da guia passa a mostrá-lo.
          if (dn) void reloadNote();
          return null;
        }
        const lookup = data as unknown as LookupResult;
        lookup.candidates = lookup.candidates ?? [];
        lookup.warnings = lookup.warnings ?? [];
        if (!lookup.found || lookup.candidates.length === 0) {
          addRejected(
            lookup.code || value,
            ["Código não encontrado.", ...lookup.warnings].join(" "),
            "not_found",
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
    [addCandidate, addRejected, isCurrent, reloadNote],
  );

  // A fila e as novas tentativas referem-se mutuamente: a função de enfileirar
  // vive numa ref para o temporizador a encontrar sempre atualizada.
  const enqueueRef = useRef<(item: QueuedScan) => void>(() => {});

  /**
   * As leituras só são processadas depois da verificação de separador e de o
   * cesto/contexto desta empresa ter sido reposto. Antes disso ficam na fila
   * (por ordem): uma leitura feita nos primeiros instantes depois de um F5 não
   * se mistura com o cesto reposto nem é procurada no armazém/fornecedor/guia
   * errado.
   */
  const scanGateOpen = useCallback(() => {
    const uid = userIdRef.current;
    const org = orgRef.current;
    return tabCheckedRef.current && !!uid && !!org && restoredBasketKeyRef.current === basketStorageKey(uid, org);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !scanGateOpen()) return;
    processingRef.current = true;
    try {
      while (scanQueueRef.current.length > 0 && mountedRef.current && scanGateOpen()) {
        const item = scanQueueRef.current[0];
        const org = orgRef.current;
        const epoch = orgEpochRef.current;
        const outcome = await lookupOne(item.value, item.unitConversion === true);
        // Remove por id: a fila pode ter sido limpa (troca de organização) entretanto.
        scanQueueRef.current = scanQueueRef.current.filter((x) => x.id !== item.id);
        setQueueSize(scanQueueRef.current.length);
        if (outcome && isCurrent(epoch, org)) {
          const attempts = item.attempts + 1;
          const auto = attempts < SCAN_AUTO_RETRIES && !!warehouseRef.current;
          setFailedScans((cur) => [
            ...cur.filter((x) => x.id !== item.id),
            {
              id: item.id,
              value: item.value,
              error: outcome.transient,
              attempts,
              waiting: auto,
              ...(item.unitConversion ? { unitConversion: true } : {}),
            },
          ]);
          if (auto) {
            const delay = SCAN_RETRY_BASE_MS * 2 ** (attempts - 1);
            const timer = window.setTimeout(() => {
              scanRetryTimers.current.delete(item.id);
              if (!isCurrent(epoch, org)) return;
              setFailedScans((cur) => cur.filter((x) => x.id !== item.id));
              enqueueRef.current({
                id: item.id,
                value: item.value,
                attempts,
                ...(item.unitConversion ? { unitConversion: true } : {}),
              });
            }, delay);
            scanRetryTimers.current.set(item.id, timer);
          }
        }
      }
    } finally {
      processingRef.current = false;
      focusScan();
    }
  }, [lookupOne, focusScan, isCurrent, scanGateOpen]);

  enqueueRef.current = (item: QueuedScan) => {
    scanQueueRef.current = [...scanQueueRef.current, item];
    setQueueSize(scanQueueRef.current.length);
    void processQueue();
  };

  // Liberta as leituras em fila assim que a verificação e a reposição terminam
  // (este efeito vem depois dos de repor: no mesmo commit, já vê o cesto e o
  // armazém/fornecedor/guia repostos nas refs).
  useEffect(() => {
    const open = scanGateOpen();
    setScanReady(open);
    if (open && scanQueueRef.current.length > 0) void processQueue();
  }, [userId, orgId, tabChecked, scanGateOpen, processQueue]);

  const enqueueScan = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    enqueueRef.current({ id: newRequestId(), value, attempts: 0 });
  };

  /**
   * Leitor com o foco fora de um campo editável (num botão, no <select> da linha
   * de PO, no corpo da página): apanha a rajada em captura, antes do elemento.
   * O Enter final, se a escrita foi de leitor (SCANNER_BURST_MS), não ativa o
   * botão — vai para a fila de leituras. Nos <select> a 1.ª tecla de uma rajada
   * mudaria a opção (type-ahead) e o onChange dos selects de armazém/fornecedor
   * limpa as escolhas pendentes — reverter depois não as recupera. Por isso a
   * tecla é retida e só é aplicada (type-ahead feito aqui, com evento change)
   * se não vier outra logo a seguir: escrita de pessoa funciona como antes (com
   * ~140 ms de atraso); uma rajada de leitor nunca chega a mexer no select.
   * Campos editáveis e diálogos abertos não são tocados.
   */
  useEffect(() => {
    let chars = "";
    let times: number[] = [];
    const reset = () => {
      chars = "";
      times = [];
    };
    // Type-ahead retido do <select> com foco.
    let selEl: HTMLSelectElement | null = null;
    let selBuf = "";
    let selTimes: number[] = [];
    let selLastKey = 0;
    let selTimer: number | undefined;
    const cancelSelect = () => {
      if (selTimer) window.clearTimeout(selTimer);
      selTimer = undefined;
      selEl = null;
      selBuf = "";
      selTimes = [];
    };
    const applyTypeAhead = () => {
      selTimer = undefined;
      const el = selEl;
      const t = selTimes;
      selTimes = []; // o texto fica (1 s) para procura com várias letras, como no browser
      if (!el || !el.isConnected || el.disabled || document.activeElement !== el) return;
      // Rajada sem Enter (leitor configurado sem sufixo): não é escrita de pessoa.
      if (t.length >= 4 && (t[t.length - 1] - t[0]) / (t.length - 1) < SCANNER_BURST_MS) {
        selBuf = "";
        return;
      }
      const q = selBuf.toLocaleLowerCase("pt-PT");
      if (!q.trim()) return;
      // A mesma letra repetida percorre as opções que começam por ela.
      const needle = q.length > 1 && q.split("").every((c) => c === q[0]) ? q[0] : q;
      const opts = Array.from(el.options);
      const n = opts.length;
      const start = el.selectedIndex;
      const from = needle.length === 1 ? start + 1 : Math.max(start, 0);
      for (let k = 0; k < n; k++) {
        const idx = (from + k) % n;
        const o = opts[idx];
        if (!o.disabled && o.text.trim().toLocaleLowerCase("pt-PT").startsWith(needle)) {
          if (idx !== el.selectedIndex) {
            el.selectedIndex = idx;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
      }
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
          cancelSelect(); // a rajada era uma leitura: nada de type-ahead
          if (value) enqueueRef.current({ id: newRequestId(), value, attempts: 0 });
          focusScan();
        } else {
          reset();
        }
        return;
      }
      if (ev.key.length !== 1) return;
      const fastSoFar = times.length >= 1 && now - last < SCANNER_BURST_MS * 2;
      if (active instanceof HTMLSelectElement) {
        // A tecla não chega ao select: fica retida e só se aplica se a escrita
        // parar sem formar rajada (ver applyTypeAhead).
        ev.preventDefault();
        if (selEl !== active || now - selLastKey > 1000) {
          selBuf = "";
          selTimes = [];
        }
        selEl = active;
        selBuf += ev.key;
        selTimes.push(now);
        selLastKey = now;
        if (selTimer) window.clearTimeout(selTimer);
        selTimer = window.setTimeout(applyTypeAhead, SCANNER_BURST_MS * 4);
      } else if (fastSoFar) {
        // A meio de uma rajada a tecla não chega ao elemento.
        ev.preventDefault();
      }
      chars += ev.key;
      times.push(now);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      cancelSelect();
    };
  }, [focusScan]);

  const retryFailedScan = (id: string) => {
    const f = failedScans.find((x) => x.id === id);
    if (!f) return;
    const t = scanRetryTimers.current.get(id);
    if (t) window.clearTimeout(t);
    scanRetryTimers.current.delete(id);
    setFailedScans((cur) => cur.filter((x) => x.id !== id));
    enqueueRef.current({ id: f.id, value: f.value, attempts: 0, ...(f.unitConversion ? { unitConversion: true } : {}) });
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

  // ── Associar um código não encontrado a um produto (Fase 2 — fatia 3) ──
  const openLearn = (r: RejectedScan) => {
    const org = orgRef.current;
    if (!org || !warehouseRef.current) return;
    setLearnTarget({ scanId: r.id, code: r.value, epoch: orgEpochRef.current, org });
    setLearnOpen(true);
  };

  /** Desfaz a associação (anulação lógica). Não mexe no cesto nem reverte receções. */
  const undoLearned = async (r: LearnCodeResult) => {
    const id = r.id;
    if (!id || undoingCodesRef.current.has(id)) return;
    undoingCodesRef.current.add(id);
    try {
      const { data, error } = await removeProductCode(id, "Desfeito na receção");
      if (!mountedRef.current) return;
      if (error || !data) {
        toast({
          title: "Não foi possível desfazer a associação",
          description: productCodeErrorMessage(error ?? { code: "XX000", message: "Resposta vazia do servidor." }),
          variant: "destructive",
        });
        return;
      }
      const n = Number(data.scans_using_code) || 0;
      toast({
        title: data.already_removed ? "A associação já tinha sido desfeita" : "Associação desfeita",
        description: [
          `«${data.code}» deixa de ser reconhecido como ${data.product_name ? `«${data.product_name}»` : "o produto"}.`,
          n > 0
            ? `${n} ${n === 1 ? "leitura usou" : "leituras usaram"} este código — as receções feitas não são revertidas.`
            : "As receções feitas não são revertidas.",
          "Retira do cesto se não for este o produto.",
        ].join(" "),
        duration: 15000,
      });
    } finally {
      undoingCodesRef.current.delete(id);
    }
  };

  /**
   * Código associado: a leitura recusada sai da lista e o código é lido de novo
   * pelo caminho normal (fila → gate → lookup), com p_unit_conversion só nessa
   * leitura. Se a empresa mudou entretanto, não se repete nada.
   */
  const handleLearned = (r: LearnCodeResult) => {
    const t = learnTarget;
    if (!t || !learnOpen) return;
    setRejectedScans((cur) => cur.filter((x) => x.id !== t.scanId));
    const same = isCurrent(t.epoch, t.org);
    if (same) enqueueRef.current({ id: newRequestId(), value: t.code, attempts: 0, unitConversion: true });
    const canUndo = !!r.id && r.learned;
    toast({
      title: r.learned ? "Código associado" : "Código já reconhecido",
      description: same
        ? `${describeLearnResult(r)} A leitura foi repetida.`
        : `${describeLearnResult(r)} A empresa mudou — lê o código de novo.`,
      duration: canUndo ? 15000 : undefined,
      action: canUndo ? (
        <ToastAction altText="Desfazer a associação do código" className="h-11 px-4" onClick={() => void undoLearned(r)}>
          Desfazer
        </ToastAction>
      ) : undefined,
    });
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
    // Com guia, só uma pré-visualização "ok" deixa confirmar: a transient não
    // mostrou os avisos da guia (não consta / acima do anunciado).
    return !p || p.status === "loading" || (!!deliveryNoteRef.current && p.status === "transient");
  };
  /**
   * A pré-visualização desta entrada foi feita com a guia `dn`? Além da
   * assinatura (que já inclui a guia), confirma pela resposta do servidor:
   * com guia ele devolve delivery_note_id, sem guia não. As bloqueadas
   * (reenvio) vão com a guia da pendente e não entram nesta regra.
   */
  const previewMatchesNote = (e: BasketEntry, dn: string) => {
    if (isLocked(e)) return true;
    const p = previewFor(e);
    if (!p) return false;
    if (p.status === "ok") return (typeof p.result?.delivery_note_id === "string" ? p.result.delivery_note_id : "") === dn;
    if (p.status === "transient") return !dn;
    return false;
  };
  /** Chave dos avisos da guia desta pré-visualização (null = sem avisos). */
  const ackKeyOf = (e: BasketEntry): string | null => {
    const p = previewFor(e);
    if (!p || p.status !== "ok") return null;
    const checks = noteChecksOf(p.result);
    return checks.length > 0 ? `${p.sig}#${checks.join(",")}` : null;
  };
  /** Entrada livre com avisos da guia ainda não confirmados (decisão 1: aviso + confirmação). */
  const needsAck = (e: BasketEntry) => {
    if (isLocked(e)) return false;
    const k = ackKeyOf(e);
    return !!k && e.ackKey !== k;
  };

  const pendingFromEntry = (
    e: BasketEntry,
    requestId: string,
    org: string,
    orgName: string,
    wh: string,
    sup: string,
    dn: string,
    dnNumber: string | null,
  ): PendingReceipt => ({
    requestId,
    entryId: e.id,
    orgId: org,
    orgName,
    warehouseId: wh,
    supplierId: sup,
    deliveryNoteId: dn || null,
    deliveryNoteNumber: dn ? dnNumber : null,
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
   * A recusa de negócio só conta se o envio ANTERIOR (prevSentAt) tiver sido
   * há mais de REJECT_MIN_AGE_MS: antes disso esse pedido pode ainda estar a
   * correr e gravar depois da consulta. Sem data do envio anterior → incerta.
   */
  const settleFailedReceive = async (
    requestId: string,
    err: RpcErrorLike | undefined,
    wasUncertain: boolean,
    prevSentAt?: number,
  ): Promise<{ kind: "received"; row: ScanRow } | { kind: "rejected" } | { kind: "uncertain" }> => {
    if (!wasUncertain) return mayHaveCommitted(err) ? { kind: "uncertain" } : { kind: "rejected" };
    const rows = await fetchScans([requestId]);
    if (rows === null) return { kind: "uncertain" };
    const row = rows.find((r) => r.id === requestId);
    if (row) return { kind: "received", row };
    const oldEnough = !!prevSentAt && Date.now() - prevSentAt > REJECT_MIN_AGE_MS;
    return isBusinessRejection(err) && oldEnough ? { kind: "rejected" } : { kind: "uncertain" };
  };

  /** Mensagem de uma receção que fica incerta (P0002: sugere verificar e descartar). */
  const uncertainMessage = (err: RpcErrorLike | undefined) => {
    const msg = errorMessage(err, "receive");
    return err?.code === "P0002"
      ? `${msg} Verifica se chegou a ser recebida; se tens a certeza de que não foi, usa Descartar.`
      : msg;
  };

  const submitEntries = async (onlyId?: string) => {
    if (submittingRef.current) return; // duplo clique / duplo toque
    const wh = warehouseRef.current;
    const sup = supplierRef.current;
    const dn = deliveryNoteRef.current;
    const dnNumber = dn && noteInfoRef.current?.id === dn ? noteInfoRef.current.note_number : null;
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

      // Bloqueia e fotografa no MESMO passo. A fotografia é tirada UMA vez (na
      // 1.ª chamada do updater) e nunca mais muda: o React 18 pode voltar a
      // aplicar este updater (StrictMode, ou rebase quando havia um setBasket de
      // leitura pendente noutra faixa — o flushSync só processa a síncrona). Nesse
      // caso a entrada bloqueada no estado pode acabar com mais quantidade do que
      // a enviada; é por isso que, no fim, se subtrai a quantidade ENVIADA (a da
      // pendente) e o resto fica livre. Depois disto, uma leitura ou "+" vai para
      // outra entrada — nunca soma à que vai ser enviada.
      let snapped = false;
      /** Entradas cuja pré-visualização não foi feita com a guia atual: não vão — recalcula-se. */
      const stale: string[] = [];
      flushSync(() => {
        setBasket((prev) => {
          if (!snapped) {
            snapped = true;
            // Entradas livres com avisos da guia por confirmar não vão (o botão já está bloqueado).
            const picked = prev.filter((e) => {
              if (!((!onlyId || e.id === onlyId) && qtyValid(e) && !e.submitting && !needsAck(e))) return false;
              if (!previewMatchesNote(e, dn)) {
                stale.push(e.id);
                return false;
              }
              return true;
            });
            for (const e of picked) ids.set(e.id, e.requestId ?? newRequestId());
            entries = picked.map((e) => ({ ...e, requestId: ids.get(e.id), submitting: true, submitError: undefined }));
          }
          if (ids.size === 0) return prev;
          return prev.map((x) =>
            ids.has(x.id) && !x.submitting ? { ...x, requestId: ids.get(x.id), submitting: true, submitError: undefined } : x,
          );
        });
      });
      if (stale.length > 0) {
        for (const id of stale) recalcPreview(id, true);
        toast({
          title: stale.length === 1 ? "1 entrada não foi enviada" : `${stale.length} entradas não foram enviadas`,
          description: `A pré-visualização não corresponde à guia atual (${
            dn ? (noteInfoRef.current?.id === dn ? noteLabel(noteInfoRef.current.note_number) : "guia escolhida") : "sem guia"
          }). Estou a recalcular — revê e confirma de novo.`,
          variant: "destructive",
        });
      }
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
        // A pendente é a única fonte de verdade de cada request_id: num reenvio
        // vão EXATAMENTE os dados guardados nela (quantidade, unidade, linha,
        // armazém, fornecedor, produto, código), nunca os da entrada — que pode
        // ter mudado (rebase do updater) e daria 23514 com o mesmo id.
        const prevPending =
          pendingRef.current.find((x) => x.requestId === requestId) ?? (e.sent?.requestId === requestId ? e.sent : undefined);
        const prevSentAt = prevPending ? sentAtMs(prevPending) : undefined;
        const p: PendingReceipt = prevPending
          ? { ...prevPending, entryId: e.id, state: "inflight", lastError: undefined, lastSentAt: nowIso }
          : { ...pendingFromEntry(e, requestId, org, orgName, wh, sup, dn, dnNumber), createdAt: nowIso, lastSentAt: nowIso };
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
            // Com pendente anterior é sempre uma nova tentativa (mesmo id já enviado).
            const s = await settleFailedReceive(requestId, err, wasUncertain || !!prevPending, prevSentAt);
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
            setReceived((prev) => [receivedFromResult(requestId, p, result ?? {}, replayed), ...prev.filter((r) => r.id !== requestId)]);
            // Subtrai a quantidade ENVIADA com este id (p.quantity — a fotografia ou
            // a pendente), nunca a quantidade atual da entrada: se a entrada ficou
            // com mais (rebase do updater de bloqueio), o resto fica livre no cesto.
            const sentQty = p.quantity;
            setBasket((prev) =>
              prev.flatMap((x) => {
                if (x.id !== e.id) return [x];
                const rest = x.quantity - sentQty;
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
          const msg = uncertain ? uncertainMessage(err) : errorMessage(err, "receive");
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
            // Incerta: guarda o que foi enviado com este id (o reenvio usa isto se a pendente faltar).
            sent: uncertain ? { ...p, state: "unknown", lastError: msg } : undefined,
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
      if (!isCurrent(epoch, org)) returnUnsent(org, orgName, wh, sup, dn, dnNumber, [...refusedAway, ...unsent]);
    }

    if (!isCurrent(epoch, org)) return;
    // Recebido pela guia mudou (ou foi recusada — p.ex. guia fechada a meio).
    if (dn && (ok > 0 || failed > 0)) void reloadNote();
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

  /** Pendente recusada (provado: nada recebido) → "Por enviar", sem request_id. */
  const keepRejectedAsUnsent = (p: PendingReceipt): boolean => {
    const uid = userIdRef.current;
    if (!uid) return false;
    const item: UnsentEntry = {
      id: newRequestId(),
      key: entryKey(p.productId, p.uomId),
      productId: p.productId,
      name: p.name,
      sku: p.sku,
      uomId: p.uomId,
      uomCode: p.uomCode,
      unitsPerUom: Number(p.unitsPerUom) || 1,
      code: p.code,
      openLines: [],
      quantity: p.quantity,
      poItemId: p.poItemId,
      warehouseId: p.warehouseId,
      supplierId: p.supplierId,
      deliveryNoteId: dnOf(p) || null,
      deliveryNoteNumber: p.deliveryNoteNumber ?? null,
      at: new Date().toISOString(),
    };
    const next = mutateUnsent(unsentStorageKey(uid, p.orgId), (cur) => [...cur, item]);
    if (next && mountedRef.current && orgRef.current === p.orgId) setUnsent(next);
    return !!next;
  };

  const resendPending = async (requestId: string) => {
    const p = pendingRef.current.find((x) => x.requestId === requestId);
    if (!p || p.orgId !== orgRef.current || inflightRef.current.has(requestId)) return;
    const epoch = orgEpochRef.current;
    const prevSentAt = sentAtMs(p);
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
        const s = await settleFailedReceive(requestId, err, true, prevSentAt);
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
      patchPending(requestId, { state: "unknown", lastError: uncertainMessage(err) });
    } else {
      removePending(requestId);
      // Recusa provada (nada foi recebido). Com guia, o motivo costuma ser a guia
      // fechada/cancelada: a leitura fica em "Por enviar" para não se perder.
      const kept = dnOf(p) ? keepRejectedAsUnsent(p) : false;
      toast({
        title: "Receção recusada",
        description: `${p.label}: ${errorMessage(err, "receive")}${kept ? ' Ficou em "Por enviar" — nada foi recebido.' : ""}`,
        variant: "destructive",
      });
    }
    if (here && dnOf(p) && dnOf(p) === deliveryNoteRef.current) void reloadNote();
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

  /**
   * "Descartar" de uma entrada incerta no cesto: as mesmas regras do da lista
   * "Receção por confirmar" (só DISCARD_MIN_AGE_MS depois do último envio, e só
   * se a consulta a receiving_scans correr e não encontrar o id). Se afinal
   * ficou registada, passa a recebida; se não, larga o id e a entrada fica livre
   * (pode ser removida ou confirmada de novo, com id novo).
   */
  const discardEntry = async (entryId: string) => {
    const e = basketRef.current.find((x) => x.id === entryId);
    if (!e || !isUncertain(e) || e.submitting || submittingRef.current) return;
    const requestId = e.requestId as string;
    if (inflightRef.current.has(requestId)) return;
    const p = pendingRef.current.find((x) => x.requestId === requestId) ?? (e.sent?.requestId === requestId ? e.sent : undefined);
    if (!p || Date.now() - sentAtMs(p) < DISCARD_MIN_AGE_MS) return;
    const epoch = orgEpochRef.current;
    const org = orgRef.current;
    setBusy(requestId, true);
    const rows = await fetchScans([requestId]);
    if (mountedRef.current) setBusy(requestId, false);
    if (!isCurrent(epoch, org)) return;
    if (rows === null) {
      toast({
        title: "Não foi possível verificar",
        description: `${p.label}: sem resposta do servidor. Não foi descartada — tenta de novo daqui a pouco.`,
        variant: "destructive",
      });
      return;
    }
    // Entretanto pode ter sido reenviada (Confirmar/Tentar de novo): nesse caso a
    // consulta é anterior ao reenvio e não prova nada — não se descarta.
    const cur = basketRef.current.find((x) => x.id === entryId);
    if (!cur || cur.requestId !== requestId || cur.submitting || submittingRef.current || inflightRef.current.has(requestId)) return;
    const pNow = pendingRef.current.find((x) => x.requestId === requestId) ?? (cur.sent?.requestId === requestId ? cur.sent : undefined);
    if (!pNow || sentAtMs(pNow) !== sentAtMs(p)) return;
    const row = rows.find((r) => r.id === requestId);
    removePending(requestId);
    if (row) {
      const result = (row.result ?? {}) as Partial<ReceiveResult>;
      setReceived((prev) => [receivedFromResult(requestId, p, result, true), ...prev.filter((r) => r.id !== requestId)]);
      setBasket((prev) =>
        prev.flatMap((x) => {
          if (x.id !== entryId || x.requestId !== requestId || x.submitting) return [x];
          const rest = x.quantity - p.quantity;
          return rest > 0 ? [freeEntry({ ...x, quantity: rest })] : [];
        }),
      );
      refreshSameProduct(p.productId);
      toast({ title: "Já tinha ficado registada", description: `${p.label} — não foi recebida outra vez.` });
    } else {
      scheduledSig.current.delete(entryId);
      setBasket((prev) => prev.map((x) => (x.id === entryId && x.requestId === requestId && !x.submitting ? freeEntry(x) : x)));
      setAnnouncement(`${p.label}: descartada. A entrada voltou a estar livre no cesto.`);
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
    basket.some(isPreviewPending) ||
    basket.some(needsAck);
  const ackPendingCount = basket.filter(needsAck).length;
  // Com guia, uma pré-visualização sem ligação ("transient") bloqueia o Confirmar
  // (ver isPreviewPending): diz porquê, para o botão não parecer preso.
  const noteOffline = basket.filter(
    (e) => !isLocked(e) && qtyValid(e) && !!deliveryNoteRef.current && previewFor(e)?.status === "transient",
  );
  const noteOfflineGaveUp = noteOffline.some((e) => {
    const r = previewRetries.current.get(e.id);
    return !!r && r.sig === previewFor(e)?.sig && r.n > PREVIEW_AUTO_RETRIES;
  });
  const confirmLabel = confirming
    ? "A receber…"
    : ackPendingCount > 0
      ? "Confirma os avisos da guia"
    : noteOffline.length > 0
      ? noteOfflineGaveUp
        ? "Sem ligação — carrega em Recalcular"
        : "Sem ligação — a tentar de novo…"
    : uncertainCount > 0 && freshCount > 0
      ? `Confirmar (inclui ${uncertainCount} a repetir)`
      : uncertainCount > 0
        ? "Tentar de novo"
        : "Confirmar receção";
  const basketUnits = basket.reduce((s, e) => s + e.quantity * e.unitsPerUom, 0);
  const lookupBusy = queueSize > 0;
  /** Leituras à espera da verificação de separador / reposição do cesto. */
  const lookupWaiting = lookupBusy && !scanReady;

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
                    {dnOf(p) ? ` · com guia ${p.deliveryNoteNumber ? noteLabel(p.deliveryNoteNumber) : "do fornecedor"}` : " · sem guia"}
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

      {/* Armazém, guia do fornecedor e fornecedor */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Label htmlFor="receiving-note">Guia do fornecedor (opcional)</Label>
            <Button
              id="receiving-note"
              type="button"
              variant="outline"
              className="h-12 w-full justify-start px-3 text-base font-normal"
              disabled={selectorsLocked || optionsLoading}
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
            >
              <FileText className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">
                {deliveryNoteId
                  ? noteInfo?.id === deliveryNoteId
                    ? noteLabel(noteInfo.note_number)
                    : "Guia escolhida"
                  : "Sem guia"}
              </span>
            </Button>
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="receiving-supplier">{deliveryNoteId ? "Fornecedor (da guia)" : "Fornecedor (opcional)"}</Label>
            <NativeSelect
              id="receiving-supplier"
              className="h-12 text-base"
              value={supplierId}
              onValueChange={handleSupplierChange}
              disabled={selectorsLocked || optionsLoading || !!deliveryNoteId}
              options={[{ value: "", label: "Todos os fornecedores" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
          {selectorsLocked && (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              Confirma ou esvazia o cesto para mudar de armazém, guia ou fornecedor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Guia fechada/cancelada a meio (ou não encontrada): nada se perde */}
      {deliveryNoteId && ((noteInfo?.id === deliveryNoteId && noteInfo.status !== "open") || noteLoadError) && (
        <Notice tone={noteLoadError ? "warning" : "error"}>
          <p className="font-medium">
            {noteLoadError
              ? noteLoadError
              : `A guia ${noteLabel(noteInfo?.note_number)} está ${NOTE_STATUS_LABEL[noteInfo?.status ?? "closed"]} — as leituras e receções com esta guia são recusadas.`}
          </p>
          <p className="mt-1 text-sm">
            O cesto, "Por enviar" e as receções por confirmar ficam guardados. Reabre a guia em "Ver guia", ou passa o cesto para
            "Por enviar" e escolhe outra guia.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onMouseDown={keepScanFocus}
              onClick={() => setDetailNoteId(deliveryNoteId)}
            >
              Ver guia
            </Button>
            {noteLoadError && (
              <Button type="button" variant="outline" className="h-11" onMouseDown={keepScanFocus} onClick={() => void reloadNote()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar de novo
              </Button>
            )}
            {basket.some((e) => !isLocked(e)) && (
              <Button type="button" variant="outline" className="h-11" disabled={confirming} onMouseDown={keepScanFocus} onClick={moveBasketToUnsent}>
                Passar o cesto para "Por enviar"
              </Button>
            )}
            {basket.length === 0 && !confirming && (
              <Button type="button" variant="outline" className="h-11" onMouseDown={keepScanFocus} onClick={() => setPickerOpen(true)}>
                Escolher outra guia
              </Button>
            )}
          </div>
        </Notice>
      )}

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
        {/* Cartão compacto da guia (junto ao campo de leitura) */}
        {deliveryNoteId && (
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 truncate">
              {noteInfo?.id === deliveryNoteId ? (
                <>
                  <span className="font-medium">{noteLabel(noteInfo.note_number)}</span>
                  {noteInfo.status !== "open" && (
                    <span className="font-medium text-destructive"> ({NOTE_STATUS_LABEL[noteInfo.status]})</span>
                  )}
                  {" · "}
                  {noteInfo.supplier_name ?? "Fornecedor"}
                  {" · "}
                  {noteInfo.purchase_orders.length > 0
                    ? `${noteInfo.purchase_orders.length} ${noteInfo.purchase_orders.length === 1 ? "PO" : "POs"}`
                    : "todas as POs"}
                  {noteInfo.summary &&
                    (noteInfo.summary.has_lines
                      ? ` · anunciado ${fmt(noteInfo.summary.totals.announced_units)} / recebido ${fmt(noteInfo.summary.totals.received_units)}`
                      : ` · recebido ${fmt(noteInfo.summary.totals.received_units)}`)}
                </>
              ) : noteLoadError ? (
                <span className="text-destructive">{noteLoadError}</span>
              ) : (
                <span className="text-muted-foreground">A carregar guia…</span>
              )}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2"
              onMouseDown={keepScanFocus}
              onClick={() => setDetailNoteId(deliveryNoteId)}
            >
              Ver guia
            </Button>
          </div>
        )}
        {/* Sempre montada: os leitores de ecrã só anunciam mudanças numa região que já existia. */}
        <p className={cn("text-sm text-muted-foreground", lookupBusy && "mt-1")} aria-live="polite">
          {lookupWaiting
            ? `A preparar… (${queueSize} ${queueSize === 1 ? "leitura" : "leituras"} em fila)`
            : lookupBusy
              ? `A procurar…${queueSize > 1 ? ` (${queueSize} leituras em fila)` : ""}`
              : ""}
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
                {r.reason === "not_found" && canLearnCodes && !!warehouseId && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    onMouseDown={keepScanFocus}
                    onClick={() => openLearn(r)}
                  >
                    <Tag className="mr-2 h-4 w-4" aria-hidden />
                    Associar a um produto
                  </Button>
                )}
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

      {/* Por enviar — entradas que não puderam voltar ao cesto (nada foi recebido) */}
      {unsent.length > 0 && (
        <Card className="border-amber-500/60">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Por enviar ({unsent.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Ficaram por enviar quando o ecrã mudou — nada foi recebido. Volta a pô-las no cesto ou dispensa-as.
            </p>
            {unsent.map((u) => {
              const whName = warehouses.find((w) => w.id === u.warehouseId)?.name;
              const supName = u.supplierId ? suppliers.find((s) => s.id === u.supplierId)?.name : undefined;
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">
                      {u.name} — {fmt(u.quantity)} {unitLabel(u.uomCode, u.unitsPerUom)}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {[
                        whName ? `Armazém ${whName}` : null,
                        dnOf(u) ? `com guia ${u.deliveryNoteNumber ? noteLabel(u.deliveryNoteNumber) : "do fornecedor"}` : "sem guia",
                        supName ? `fornecedor ${supName}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 shrink-0"
                    disabled={confirming}
                    onMouseDown={keepScanFocus}
                    onClick={() => void restoreUnsent(u.id)}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Voltar ao cesto
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 shrink-0 p-0"
                    onMouseDown={keepScanFocus}
                    onClick={() => dismissUnsent(u.id)}
                    aria-label={`Dispensar ${u.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {unsentConfirm?.id === u.id && (
                    <div className="w-full">
                      <Notice tone="warning">
                        <p>{unsentConfirm.message}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            className="h-11"
                            disabled={confirming}
                            onMouseDown={keepScanFocus}
                            onClick={() => void restoreUnsent(u.id, unsentConfirm.dn)}
                          >
                            Sim, voltar ao cesto
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            onMouseDown={keepScanFocus}
                            onClick={() => {
                              setUnsentConfirm(null);
                              focusScan();
                            }}
                          >
                            Não
                          </Button>
                        </div>
                      </Notice>
                    </div>
                  )}
                </div>
              );
            })}
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
          {basket.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {deliveryNoteId
                ? `Leituras com a guia ${noteInfo?.id === deliveryNoteId ? noteLabel(noteInfo.note_number) : "escolhida"}.`
                : "Leituras sem guia do fornecedor."}
            </p>
          )}
          {basket.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Lê um código para começar. Ler o mesmo código outra vez soma 1 à quantidade.
              </CardContent>
            </Card>
          ) : (
            basket.map((e) => {
              const sentRec = e.requestId
                ? (pending.find((x) => x.requestId === e.requestId) ?? (e.sent?.requestId === e.requestId ? e.sent : undefined))
                : undefined;
              const ackKey = isLocked(e) ? null : ackKeyOf(e);
              return (
              <BasketCard
                key={e.id}
                entry={e}
                preview={previewFor(e)}
                noteChecks={ackKey ? noteChecksOf(previewFor(e)?.result) : []}
                acked={!!ackKey && e.ackKey === ackKey}
                onAck={(v) => {
                  editEntry(e.id, { ackKey: v && ackKey ? ackKey : undefined });
                  focusScan();
                }}
                busy={confirming}
                discardBusy={!!e.requestId && pendingBusy.has(e.requestId)}
                discardWaitMs={sentRec ? DISCARD_MIN_AGE_MS - (nowMs - sentAtMs(sentRec)) : Number.POSITIVE_INFINITY}
                onDiscard={() => void discardEntry(e.id)}
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
              );
            })
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
                  <p className="break-words text-xs text-muted-foreground">
                    {[
                      r.orderNumbers.join(", "),
                      r.withNote ? `com guia ${r.deliveryNoteNumber ? noteLabel(r.deliveryNoteNumber) : "do fornecedor"}` : "sem guia",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.noteChecks && r.noteChecks.length > 0 && (
                    <p className="mt-1 flex items-start gap-1 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>Recebido com aviso: {r.noteChecks.map((c) => NOTE_CHECK_LABEL[c] ?? c).join("; ")}.</span>
                    </p>
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
            {ackPendingCount > 0 &&
              ` · ${ackPendingCount === 1 ? "1 aviso da guia" : `${ackPendingCount} avisos da guia`} por confirmar`}
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

      {/* Guia do fornecedor: escolher, criar, ver (componentes em src/components/receiving) */}
      <DeliveryNotePicker
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) focusScan();
        }}
        orgId={orgId}
        currentId={deliveryNoteId}
        canCreate={canEditNotes}
        onSelect={(n) => selectNote(n)}
        onCreate={() => {
          // Uma guia nova só pode ser escolhida com o cesto vazio: não se abre
          // o diálogo para depois a gravar sem a escolher.
          if (basketRef.current.length > 0 || submittingRef.current) {
            toast({
              title: "Cesto por confirmar",
              description: "Confirma ou esvazia o cesto antes de criar uma guia nova — com leituras no cesto a guia não muda.",
              variant: "destructive",
            });
            return;
          }
          setPickerOpen(false);
          setCreateNoteOpen(true);
        }}
      />
      {canLearnCodes && (
        <LearnCodeDialog
          open={learnOpen && learnTarget !== null}
          onOpenChange={(o) => {
            if (!o) {
              setLearnOpen(false);
              focusScan();
            }
          }}
          code={learnTarget?.code ?? ""}
          organizationId={orgId}
          warehouseId={warehouseId || null}
          supplierId={supplierId || (deliveryNoteId && noteInfo?.id === deliveryNoteId ? noteInfo.supplier_id : null)}
          suppliers={suppliers}
          canEditProducts={canEditProducts}
          onLearned={handleLearned}
        />
      )}
      {canEditNotes && (
        <DeliveryNoteDialog
          open={createNoteOpen}
          onOpenChange={(o) => {
            setCreateNoteOpen(o);
            if (!o) focusScan();
          }}
          orgId={orgId}
          suppliers={suppliers}
          defaultSupplierId={supplierId || undefined}
          onSaved={(n) => {
            if (n.status !== "open") {
              toast({
                title: `Guia ${noteLabel(n.note_number)} gravada mas NÃO escolhida`,
                description: `Está ${NOTE_STATUS_LABEL[n.status] ?? n.status} — não pode receber.`,
                variant: "destructive",
              });
              return;
            }
            if (basketRef.current.length === 0 && !submittingRef.current) {
              selectNote(n);
              setNoteInfo(n);
              toast({ title: `Guia ${noteLabel(n.note_number)} registada e escolhida`, description: n.supplier_name ?? undefined });
              return;
            }
            const cur = deliveryNoteRef.current;
            toast({
              title: `Guia ${noteLabel(n.note_number)} gravada mas NÃO escolhida`,
              description: `Há leituras no cesto (ou uma receção em curso), que continuam ${
                cur ? `com ${noteInfoRef.current?.id === cur ? noteLabel(noteInfoRef.current.note_number) : "a guia escolhida"}` : "SEM guia"
              }. Confirma ou esvazia o cesto e escolhe a guia na lista.`,
              variant: "destructive",
            });
          }}
          onOpenExisting={(id) => setDetailNoteId(id)}
        />
      )}
      <DeliveryNoteDetail
        open={!!detailNoteId}
        onOpenChange={(o) => {
          if (!o) {
            setDetailNoteId(null);
            focusScan();
          }
        }}
        noteId={detailNoteId}
        orgId={orgId}
        canEdit={canEditNotes}
        localWork={localWorkFor}
        onChanged={handleNoteChanged}
        onOpenOther={(id) => setDetailNoteId(id)}
        onUse={
          detailNoteId && detailNoteId !== deliveryNoteId && basket.length === 0 && !confirming
            ? (n) => {
                selectNote(n);
                setNoteInfo(n);
                setDetailNoteId(null);
              }
            : undefined
        }
      />
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
        {c.delivery_note && (
          <p className="text-sm text-muted-foreground">
            Guia:{" "}
            {c.delivery_note.announced
              ? `anunciado ${fmt(c.delivery_note.announced_units)} un · recebido ${fmt(c.delivery_note.received_units)} un`
              : panel.lookup.delivery_note?.has_lines
                ? `não anunciado · recebido ${fmt(c.delivery_note.received_units)} un`
                : `recebido ${fmt(c.delivery_note.received_units)} un`}
          </p>
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
        {line.in_delivery_note && <Badge variant="secondary">na guia</Badge>}
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
  noteChecks,
  acked,
  onAck,
  busy,
  discardBusy,
  discardWaitMs,
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
  onDiscard,
  onRecalc,
}: {
  entry: BasketEntry;
  preview: Preview | undefined;
  /** Avisos da guia desta pré-visualização (exigem confirmação explícita). */
  noteChecks: string[];
  acked: boolean;
  onAck: (v: boolean) => void;
  busy: boolean;
  discardBusy: boolean;
  /** Tempo até o "Descartar" ficar disponível (≤ 0 = já pode). */
  discardWaitMs: number;
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
  onDiscard: () => void;
  onRecalc: () => void;
}) {
  const uncertain = isUncertain(entry);
  const discardTooRecent = discardWaitMs > 0;
  const discardHintId = `discard-wait-${entry.id}`;
  const locked = busy || isLocked(entry);
  const lines = sameUnitLines(entry.openLines);
  const openTotal = lines.reduce((s, l) => s + Number(l.open_quantity), 0);
  const qtyId = `qty-${entry.id}`;
  const poId = `po-${entry.id}`;
  const ackId = `ack-${entry.id}`;

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
                      l.in_delivery_note ? "na guia" : null,
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

        {/* Pré-visualização — sem região aria-live por cartão: os anúncios vão
            todos pela região global (announcement), para não se sobreporem. */}
        <PreviewView entry={entry} preview={preview} onRecalc={onRecalc} />

        {/* Avisos da guia (não consta / acima do anunciado): confirmação explícita */}
        {noteChecks.length > 0 && !locked && (
          <div className="flex items-start gap-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <Checkbox
              id={ackId}
              className="mt-0.5 h-5 w-5 border-amber-700 dark:border-amber-400"
              checked={acked}
              onCheckedChange={(c) => onAck(c === true)}
            />
            <Label htmlFor={ackId} className="min-w-0 flex-1 cursor-pointer font-normal leading-snug">
              <span className="font-medium">{noteChecks.map((c) => NOTE_CHECK_LABEL[c] ?? c).join(" · ")}.</span>{" "}
              Confirmo que recebo mesmo assim.
            </Label>
          </div>
        )}

        {/* Erro do pedido real (anunciado pela região global no fim do Confirmar) */}
        {entry.submitError && (
          <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="break-words">{entry.submitError}</p>
            {uncertain && (
              <>
                <p className="text-destructive/90">
                  Pode já ter ficado registada — tenta de novo. "Tentar de novo" usa o mesmo pedido e não recebe duas vezes;
                  por isso esta entrada não pode ser removida nem alterada.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onMouseDown={keepScanFocus}
                    onClick={onRetry}
                    disabled={busy || discardBusy}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Tentar de novo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 whitespace-normal text-left"
                    onMouseDown={keepScanFocus}
                    onClick={onDiscard}
                    disabled={busy || discardBusy || discardTooRecent}
                    aria-describedby={discardTooRecent && Number.isFinite(discardWaitMs) ? discardHintId : undefined}
                  >
                    {discardBusy ? "A verificar…" : "Descartar — confirmo que não foi recebida"}
                  </Button>
                </div>
                {discardTooRecent && Number.isFinite(discardWaitMs) && (
                  <p id={discardHintId} className="text-xs text-destructive/90">
                    Enviada há pouco — o pedido pode ainda estar a ser processado. Podes descartar daqui a{" "}
                    {Math.max(1, Math.ceil(discardWaitMs / 1000))} s.
                  </p>
                )}
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
