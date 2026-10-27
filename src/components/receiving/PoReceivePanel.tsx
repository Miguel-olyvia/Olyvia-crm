// Receção › "Dar entrada" (protótipo PainelPoRececao.tsx): o painel lateral de uma encomenda a fornecedor, em modo
// resumo por omissão. Cabeçalho (fornecedor, selo do portal, estado, cliente/contrato), "Entra em [armazém]", a guia do
// fornecedor (opcional: uma aberta do fornecedor ou uma nova), "Vai entrar N un (L linhas)" com a pré-visualização de
// cada linha (rpc_preview_po_receipt: reservadas para a EC / stock) e "✓ Receber tudo · N un". "Veio diferente? Conferir
// linha a linha" abre a tabela (máximo = o que falta); "Não vou receber o resto" anula o resto (PoCancelRemainderDialog).
//
// O painel NÃO recebe sozinho: onReceive mete no cesto do leitor (Receiving.tsx) uma entrada por linha, presa à linha
// da PO, e é o envio de sempre (rpc_receive_by_code com request_id, pendente em localStorage, avisos da guia com
// confirmação, reservas FIFO) que dá entrada. O painel mostra o progresso (run) e, no fim, o que entrou, "Ver EC-…" e as
// outras encomendas por receber do mesmo fornecedor.
//
// Guias expedidas pelo fornecedor no portal (como no Olyvia 2.0): as guias abertas do fornecedor com history 'shipped'
// / supplier_portal ligadas a esta PO (supplier_delivery_note_orders ou purchase_order_id do history) aparecem primeiro,
// com "Enviada pelo fornecedor" e "Ver guia". A mais antiga com alguma coisa por receber fica escolhida e cada linha vem
// pré-preenchida com "anunciado na guia − já recebido com esta guia" (prefillFromNote: nunca acima do que falta);
// o utilizador muda a guia ou as quantidades. A entrada continua a ser a do cesto (rpc_receive_by_code com
// p_delivery_note_id). Sem guias do portal, tudo como antes (vale o que falta).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Check, Minus, Plus, RefreshCw, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryStatusBadge, clientOrdersLink } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import { DeliveryNoteDialog } from "./DeliveryNoteDialog";
import {
  fmtDay,
  isPortalNote,
  noteLabel,
  notePending,
  portalMeta,
  prefillFromNote,
  type NoteLineLite,
  type NoteReceiptLite,
  type PortalNoteMeta,
} from "./deliveryNotes";
import { SeloEnviadaFornecedor } from "./DeliveryNotesPanel";
import { OrigemChipRec, SeloExpedida, SeloNova, SeloRec } from "./PorReceberList";
import { receivablePosQueryKey } from "./useReceivablePos";
import { VerGuiaButton } from "./VerGuiaButton";
import { PoCancelRemainderDialog, type CancelTarget } from "./PoCancelRemainderDialog";
import { faltaPo, fmtUn, lineUnitLabel, localDay, novaConfirmacao, poRecebivel, textoFalta, type ReceivableLine, type ReceivablePo } from "./porReceber";
import { runTotals, textoEntrada, type PoRunView } from "./poRun";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  ordered: "Encomendado",
  partially_received: "Parcialmente recebida",
};

interface PreviewLine {
  purchase_order_item_id: string;
  units_to_order?: number | null;
  units_to_stock?: number | null;
  contract_order_number?: string | null;
  allocation_reason?: string | null;
}

export interface PoReceivePanelProps {
  /** PO aberta (null = painel fechado). */
  po: ReceivablePo | null;
  /** O ?po= aponta para uma PO que não está na lista (a carregar ou já recebida). */
  missing?: "loading" | "gone" | null;
  onClose: () => void;
  orgId: string | null;
  today: string;
  warehouses: readonly { id: string; name: string }[];
  warehouseId: string;
  onWarehouseChange: (id: string) => void;
  /** O cesto do leitor tem entradas: o armazém não muda aqui. */
  warehouseLocked: boolean;
  suppliers: readonly { id: string; name: string }[];
  canReceive: boolean;
  receiveReason?: string;
  canCancel: boolean;
  cancelReason?: string;
  canCreateNote: boolean;
  /** Linha a destacar (artigo lido na barra). */
  highlightProductId?: string | null;
  /** Guia lida na barra (fica escolhida se for deste fornecedor e estiver aberta). */
  initialNoteId?: string | null;
  /** Outras POs por receber do mesmo fornecedor (estado final). */
  otherPos: readonly ReceivablePo[];
  run: PoRunView | null;
  /** Mete as linhas no cesto e recebe; devolve o motivo se recusar (nada foi feito). */
  onReceive: (po: ReceivablePo, items: { line: ReceivableLine; qty: number }[], noteId: string) => string | null;
  onAck: (entryId: string, acked: boolean) => void;
  onConfirmReview: () => void;
  onCancelRun: () => void;
  onRecalcRun: () => void;
  onResetRun: () => void;
  onOpenPo: (id: string) => void;
  onArticleMode: () => void;
  /** Depois de anular o resto (recarregar a lista). */
  onCancelled: (message: string) => void;
  /** Guia criada/alterada no painel (recarregar listas e contadores). */
  onNotesChanged?: () => void;
}

/** "1,5" ou "1.5" → 1.5; vazio/inválido → NaN. */
function parseQty(v: string): number {
  const t = v.trim().replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
}

function defaultQty(po: ReceivablePo, vem: (l: ReceivableLine) => number = (l) => l.open): Record<string, string> {
  return Object.fromEntries(po.lines.map((l) => [l.id, String(vem(l))]));
}

interface OpenNoteRow {
  id: string;
  note_number: string;
  document_date: string | null;
  created_at?: string | null;
  history?: unknown;
}

/** Uma guia do portal desta PO, com o que vem nela por linha (null = não indica linhas desta PO). */
interface PortalNoteForPo {
  id: string;
  number: string;
  meta: PortalNoteMeta;
  prefill: Record<string, number> | null;
  pending: boolean;
}

export function PoReceivePanel(props: PoReceivePanelProps) {
  const { po, missing, onClose } = props;
  return (
    <Sheet open={!!po || !!missing} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {po ? (
          <PanelBody key={po.id} {...props} po={po} />
        ) : (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle>Dar entrada</SheetTitle>
              <SheetDescription>Armazém › Receção</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 p-4">
              {missing === "loading" ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <p className="text-sm text-muted-foreground">Esta encomenda já não está por receber (ou não pertence à empresa ativa).</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  po,
  onClose,
  orgId,
  today,
  warehouses,
  warehouseId,
  onWarehouseChange,
  warehouseLocked,
  suppliers,
  canReceive,
  receiveReason,
  canCancel,
  cancelReason,
  canCreateNote,
  highlightProductId,
  initialNoteId,
  otherPos,
  run,
  onReceive,
  onAck,
  onConfirmReview,
  onCancelRun,
  onRecalcRun,
  onResetRun,
  onOpenPo,
  onArticleMode,
  onCancelled,
  onNotesChanged,
}: PoReceivePanelProps & { po: ReceivablePo }) {
  const [qtd, setQtd] = useState<Record<string, string>>(() => defaultQty(po));
  const [conferir, setConferir] = useState(false);
  const [noteId, setNoteId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);

  const activeRun = run && run.poId === po.id ? run : null;
  const running = !!activeRun && (activeRun.phase === "preparing" || activeRun.phase === "review" || activeRun.phase === "submitting");
  const finished = !!activeRun && (activeRun.phase === "done" || activeRun.phase === "failed");

  // Guias abertas deste fornecedor (RLS: purchase_orders.view ou .receive). A chave fica debaixo da da lista "Por
  // receber": recarregar a lista (depois de receber, anular ou mexer numa guia) recarrega também estas.
  const notesQuery = useQuery({
    queryKey: [...receivablePosQueryKey(orgId), "panel-open-notes", po.supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_delivery_notes")
        .select("id, note_number, document_date, created_at, history")
        .eq("organization_id", orgId as string)
        .eq("supplier_id", po.supplierId as string)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OpenNoteRow[];
    },
    enabled: !!orgId && !!po.supplierId,
    staleTime: 30_000,
  });
  const openNotes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  useEffect(() => {
    if (initialNoteId && openNotes.some((n) => n.id === initialNoteId)) setNoteId((cur) => cur || initialNoteId);
  }, [initialNoteId, openNotes]);

  // Guias do portal deste fornecedor: as POs, as linhas anunciadas e as receções feitas com cada uma (em lote).
  const portalOpen = useMemo(() => openNotes.filter((n) => isPortalNote(n.history)), [openNotes]);
  const portalIds = portalOpen.map((n) => n.id);
  const portalQuery = useQuery({
    queryKey: [...receivablePosQueryKey(orgId), "panel-portal-notes", po.id, portalIds.join(",")],
    queryFn: async () => {
      const ids = new Set(portalIds);
      const [orders, lines, receipts] = await Promise.all([
        supabase
          .from("supplier_delivery_note_orders")
          .select("delivery_note_id, purchase_order_id")
          .eq("organization_id", orgId as string)
          .in("delivery_note_id", portalIds),
        supabase
          .from("supplier_delivery_note_lines")
          .select("delivery_note_id, product_id, purchase_order_item_id, quantity, units_per_uom")
          .eq("organization_id", orgId as string)
          .in("delivery_note_id", portalIds)
          .limit(5000),
        supabase
          .from("purchase_order_receipts")
          .select("delivery_note_id, purchase_order_item_id, quantity, units_per_uom")
          .eq("organization_id", orgId as string)
          .eq("purchase_order_id", po.id)
          .in("delivery_note_id", portalIds)
          .eq("kind", "receipt")
          .is("reverted_at", null)
          .limit(5000),
      ]);
      for (const r of [orders, lines, receipts]) if (r.error) throw r.error;
      const inSet = (x: { delivery_note_id: string | null }) => !!x.delivery_note_id && ids.has(x.delivery_note_id);
      return {
        orders: ((orders.data ?? []) as { delivery_note_id: string; purchase_order_id: string }[]).filter(inSet),
        lines: ((lines.data ?? []) as NoteLineLite[]).filter(inSet),
        receipts: ((receipts.data ?? []) as NoteReceiptLite[]).filter(inSet),
      };
    },
    enabled: !!orgId && portalIds.length > 0,
    staleTime: 10_000,
  });

  const linesSig = po.lines.map((l) => `${l.id}:${l.open}`).join("|");
  const poPortalNotes = useMemo((): PortalNoteForPo[] => {
    const d = portalQuery.data;
    if (!d) return [];
    const poLines = po.lines.map((l) => ({ id: l.id, productId: l.productId, open: l.open, unitsPerUom: l.unitsPerUom }));
    return portalOpen
      .map((n) => ({ n, meta: portalMeta(n.history) as PortalNoteMeta }))
      .filter(({ n, meta }) => meta.purchaseOrderId === po.id || d.orders.some((o) => o.delivery_note_id === n.id && o.purchase_order_id === po.id))
      .map(({ n, meta }) => {
        const prefill = prefillFromNote(n.id, poLines, d.lines, d.receipts);
        return { id: n.id, number: n.note_number, meta, prefill, pending: notePending(prefill) };
      })
      .sort((a, b) => (a.meta.shippedAt ?? "").localeCompare(b.meta.shippedAt ?? "") || a.number.localeCompare(b.number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalQuery.data, portalOpen, po.id, linesSig]);

  // Escolhe uma vez a guia do portal mais antiga com alguma coisa por receber (nunca por cima de uma escolha).
  const autoPicked = useRef(false);
  const portalReady = notesQuery.isSuccess && (portalIds.length === 0 || portalQuery.isSuccess || portalQuery.isError);
  useEffect(() => {
    if (autoPicked.current || !portalReady) return;
    autoPicked.current = true;
    const first = poPortalNotes.find((n) => n.pending);
    if (first) setNoteId((cur) => cur || first.id);
  }, [portalReady, poPortalNotes]);
  const portalLoading = portalIds.length > 0 && portalQuery.isLoading;

  const escolhida = poPortalNotes.find((n) => n.id === noteId) ?? null;
  /** O que vem de cada linha: com uma guia do portal (com linhas), o que vem nela; senão o que falta. */
  const vem = (l: ReceivableLine): number => (escolhida?.prefill ? (escolhida.prefill[l.id] ?? 0) : l.open);
  const vemSig = po.lines.map((l) => `${l.id}:${vem(l)}`).join("|");

  // As linhas mudam depois de receber/anular (a lista recarrega) ou muda a guia: os valores passam a ser o que vem agora.
  useEffect(() => {
    setQtd(defaultQty(po, vem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vemSig]);

  const abertas = po.lines.filter((l) => l.open > 0);
  const quanto = (l: ReceivableLine): number => {
    if (!conferir) return vem(l);
    const n = parseQty(qtd[l.id] ?? "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const itens = abertas.map((line) => ({ line, qty: quanto(line) })).filter((x) => x.qty > 0);
  const totalUn = itens.reduce((a, x) => a + x.qty * (x.line.unitsPerUom || 1), 0);
  const nLinhas = itens.length;

  // Pré-visualização da repartição (rpc_preview_po_receipt, só POs de cliente; exige as permissões de receção).
  const previewKey = itens.map((x) => `${x.line.id}:${x.qty}`).join("|");
  const [debouncedKey, setDebouncedKey] = useState(previewKey);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedKey(previewKey), 400);
    return () => window.clearTimeout(t);
  }, [previewKey]);
  const previewQuery = useQuery({
    queryKey: ["receiving-po-preview", po.id, warehouseId, debouncedKey],
    queryFn: async () => {
      const lines = debouncedKey
        .split("|")
        .filter(Boolean)
        .map((s) => {
          const [id, q] = s.split(":");
          return { purchase_order_item_id: id, quantity: Number(q) };
        });
      const { data, error } = await supabase.rpc("rpc_preview_po_receipt", {
        p_purchase_order_id: po.id,
        p_lines: lines,
        p_warehouse_id: warehouseId || undefined,
      });
      if (error) throw error;
      const r = (data ?? {}) as { lines?: PreviewLine[] };
      return new Map((r.lines ?? []).map((l) => [l.purchase_order_item_id, l]));
    },
    enabled: canReceive && !!po.contractId && !!debouncedKey && !running && !finished,
    staleTime: 10_000,
    retry: false,
  });

  const mudarQtd = (l: ReceivableLine, v: string) => {
    setErro(null);
    // Aceita vírgula ou ponto (nunca se apagam caracteres em silêncio: "1,5" não vira "15").
    const clean = v.replace(/[^\d.,]/g, "").slice(0, 12);
    const n = parseQty(clean);
    setQtd((x) => ({ ...x, [l.id]: clean !== "" && n > l.open ? String(l.open) : clean }));
  };
  const passo = (l: ReceivableLine, d: number) => {
    const n = Math.max(0, Math.min(l.open, (parseQty(qtd[l.id] ?? "") || 0) + d));
    mudarQtd(l, String(n));
  };

  const whName = warehouses.find((w) => w.id === warehouseId)?.name ?? null;
  const confirmar = () => {
    setErro(null);
    if (!canReceive) return;
    if (!warehouseId) {
      setErro("Escolha o armazém onde entra.");
      return;
    }
    if (!itens.length) {
      setErro("Indique pelo menos uma quantidade a receber.");
      return;
    }
    for (const x of itens) {
      if (!Number.isInteger(x.qty) || x.qty < 1) {
        setErro(
          `Quantidades inteiras: ${x.line.name} (${fmtUn(x.qty)}). A receção pelo cesto, como o leitor, só aceita unidades inteiras — para frações use a receção na encomenda.`,
        );
        return;
      }
      if (x.qty > x.line.open) {
        setErro(`Nunca mais do que falta: ${x.line.name} (${fmtUn(x.line.open)}).`);
        return;
      }
    }
    if (portalLoading) {
      setErro("A carregar as guias enviadas pelo fornecedor — tente daqui a um instante.");
      return;
    }
    const motivo = onReceive(po, itens, noteId);
    if (motivo) setErro(motivo);
  };

  const para = po.origin?.clientName || po.origin?.number || null;
  const totals = activeRun ? runTotals(activeRun) : null;
  const mais = otherPos.filter((x) => x.id !== po.id && x.supplierId === po.supplierId && poRecebivel(x));
  const destacado = highlightProductId ? abertas.find((l) => l.productId === highlightProductId) : undefined;
  const lockedReason = "O cesto do leitor tem entradas por confirmar: confirme-as ou esvazie-o para mudar o armazém.";

  const selos = (
    <div className="flex flex-wrap items-center gap-1.5">
      <SeloRec po={po} />
      <SeloExpedida po={po} />
      {novaConfirmacao(po, today) ? <SeloNova /> : null}
      {po.status !== "pending" ? <InventoryStatusBadge tone="info">{STATUS_LABEL[po.status] ?? po.status}</InventoryStatusBadge> : null}
      {po.contractId ? (
        <OrigemChipRec po={po} />
      ) : (
        <InventoryStatusBadge tone="neutral">Para stock</InventoryStatusBadge>
      )}
    </div>
  );

  const previsao = (l: ReceivableLine, qty: number) => {
    const pv = previewQuery.data?.get(l.id);
    const toEc = Number(pv?.units_to_order) || 0;
    const toSt = pv ? Number(pv.units_to_stock) || 0 : po.contractId ? null : qty * (l.unitsPerUom || 1);
    return (
      <li key={l.id} className={cn("rounded-md border p-2 text-sm", l.productId === highlightProductId && "border-primary bg-primary/5")}>
        <p>
          <b>{fmtUn(qty)}×</b> {l.name} {l.sku ? <small className="font-mono text-muted-foreground">{l.sku}</small> : null}
          {l.unitsPerUom > 1 ? <small className="text-muted-foreground"> · {lineUnitLabel(l)}</small> : null}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs">
          {toEc ? (
            <span className="text-violet-700 dark:text-violet-300">
              → {fmtUn(toEc)} reservadas para {para ?? pv?.contract_order_number ?? "a EC"}
              {pv?.contract_order_number ? ` (${pv.contract_order_number})` : ""}
            </span>
          ) : null}
          {toSt ? <span className="text-emerald-700 dark:text-emerald-400">→ {fmtUn(toSt)} para stock</span> : null}
          {pv?.allocation_reason === "client_order_inactive" ? (
            <InventoryStatusBadge tone="warn">EC inativa: vai para stock</InventoryStatusBadge>
          ) : null}
          {po.contractId && !pv && canReceive ? (
            <span className="text-muted-foreground">{previewQuery.isFetching ? "A calcular repartição…" : ""}</span>
          ) : null}
        </p>
      </li>
    );
  };

  // ── Corpo ──
  let corpo: ReactNode;
  if (finished && activeRun && totals) {
    const falhadas = activeRun.lines.filter((l) => l.outcome && l.outcome !== "ok");
    corpo = (
      <div className="space-y-3">
        {activeRun.phase === "failed" ? (
          <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">Nada entrou.</p>
            {activeRun.error ? <p>{activeRun.error}</p> : null}
            <ul className="mt-1 list-disc pl-5">
              {activeRun.lines
                .filter((l) => l.previewError || l.message)
                .map((l) => (
                  <li key={l.entryId}>
                    {l.name}: {l.previewError || l.message}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {totals.ok > 0 ? (
          <div role="status" className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            <p className="font-medium">{textoEntrada(totals, activeRun.warehouseName, para)}</p>
            {activeRun.lines.some((l) => l.outcome === "ok" && l.replayed) ? (
              <p className="mt-1">Algumas linhas já tinham ficado registadas antes — não foram recebidas outra vez.</p>
            ) : null}
          </div>
        ) : null}
        {falhadas.length > 0 && activeRun.phase === "done" ? (
          <div role="alert" className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">
              {falhadas.length === 1 ? "1 linha não entrou" : `${falhadas.length} linhas não entraram`} — ficaram no cesto do leitor.
            </p>
            <ul className="list-disc pl-5">
              {falhadas.map((l) => (
                <li key={l.entryId}>
                  {l.name}: {l.outcome === "uncertain" ? `sem resposta do servidor — use "Tentar de novo" no leitor (não recebe duas vezes). ${l.message ?? ""}` : (l.message ?? "não foi enviada.")}
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={onArticleMode}>
              <ScanLine className="mr-1 h-4 w-4" aria-hidden="true" />
              Abrir o leitor
            </Button>
          </div>
        ) : null}
        {totals.unitsToOrder > 0 && po.contractId ? (
          <Button asChild variant="outline" size="sm">
            <Link to={clientOrdersLink({ open: po.contractId })}>Ver {totals.contractNumbers[0] ?? po.origin?.number ?? "encomenda de cliente"}</Link>
          </Button>
        ) : null}
        {poRecebivel(po) ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Ainda falta {textoFalta(po)} nesta encomenda.</span>
            <Button type="button" variant="outline" size="sm" onClick={onResetRun}>
              Dar entrada ao que falta
            </Button>
          </div>
        ) : null}
        {mais.length > 0 ? (
          <div role="group" aria-label={`Mais da ${po.supplierName}`} className="space-y-1.5">
            <p className="text-sm font-semibold">Mais da {po.supplierName}:</p>
            {mais.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <b className="font-mono">{x.orderNumber}</b> ({fmtUn(faltaPo(x).un)} un) <SeloRec po={x} />
                </span>
                <Button type="button" size="sm" variant="outline" aria-label={`Dar entrada ${x.orderNumber}`} onClick={() => onOpenPo(x.id)}>
                  Dar entrada
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else {
    corpo = (
      <div className="space-y-4">
        {!canReceive ? (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            Modo consulta: {receiveReason ?? "sem permissão para receber."}
          </p>
        ) : null}
        {po.status === "pending" ? (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {po.orderNumber} ainda está pendente (não enviada ao fornecedor). Pode dar entrada na mesma.
          </p>
        ) : null}
        {destacado ? (
          <p className="rounded-lg border border-sky-500/50 bg-sky-500/10 p-3 text-sm text-sky-800 dark:text-sky-300">
            <ScanLine className="mr-1 inline h-4 w-4" aria-hidden="true" />
            Lido: {destacado.name} (linha destacada).
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="rec-po-wh">Entra em</Label>
            <NativeSelect
              id="rec-po-wh"
              value={warehouseId}
              disabled={!canReceive || warehouseLocked || running}
              placeholder="Escolher o armazém"
              onValueChange={onWarehouseChange}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              aria-describedby={warehouseLocked ? "rec-po-wh-help" : undefined}
            />
            {warehouseLocked ? (
              <p id="rec-po-wh-help" className="text-xs text-muted-foreground">
                {lockedReason}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-po-note">Guia do fornecedor (opcional)</Label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <NativeSelect
                  id="rec-po-note"
                  value={noteId}
                  disabled={!canReceive || running || !po.supplierId}
                  onValueChange={(v) => {
                    setErro(null);
                    setNoteId(v);
                  }}
                  options={[
                    { value: "", label: "Sem guia" },
                    ...poPortalNotes.map((n) => ({ value: n.id, label: `${noteLabel(n.number)} · enviada pelo fornecedor` })),
                    ...openNotes
                      .filter((n) => !poPortalNotes.some((x) => x.id === n.id))
                      .map((n) => ({ value: n.id, label: noteLabel(n.note_number) })),
                  ]}
                />
              </div>
              {canCreateNote && canReceive && po.supplierId ? (
                <Button type="button" variant="outline" disabled={running} onClick={() => setCreateNoteOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Nova guia
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {notesQuery.isLoading || portalLoading
                ? "A carregar guias…"
                : poPortalNotes.length
                  ? `${poPortalNotes.length} ${poPortalNotes.length === 1 ? "guia enviada" : "guias enviadas"} pelo fornecedor${
                      openNotes.length > poPortalNotes.length
                        ? ` · ${openNotes.length - poPortalNotes.length} ${openNotes.length - poPortalNotes.length === 1 ? "outra aberta" : "outras abertas"}`
                        : ""
                    }.`
                  : openNotes.length
                    ? `${openNotes.length} ${openNotes.length === 1 ? "guia aberta" : "guias abertas"} deste fornecedor.`
                    : "Sem guias abertas deste fornecedor."}
            </p>
            {portalQuery.isError ? (
              <p className="text-xs text-destructive">Não foi possível ler as guias enviadas pelo fornecedor: vale o que falta.</p>
            ) : null}
          </div>
        </div>

        {poPortalNotes.length > 0 ? (
          <ul aria-label="Guias enviadas pelo fornecedor" className="space-y-1.5">
            {poPortalNotes.map((n) => (
              <li
                key={n.id}
                className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-2 text-sm", n.id === noteId && "border-violet-500 bg-violet-500/5")}
              >
                <b className="font-mono">{noteLabel(n.number)}</b>
                <SeloEnviadaFornecedor />
                <small className="text-muted-foreground">
                  {n.meta.shippedAt ? `expedida ${fmtDay(localDay(n.meta.shippedAt))}` : "expedida"}
                  {n.meta.carrier ? ` · ${n.meta.carrier}` : ""}
                  {n.meta.byName ? ` · por ${n.meta.byName}` : ""}
                </small>
                {!n.pending && n.prefill ? <InventoryStatusBadge tone="ok">Já recebida</InventoryStatusBadge> : null}
                {n.meta.file ? <VerGuiaButton file={n.meta.file} /> : <small className="text-muted-foreground">sem ficheiro</small>}
                {n.id !== noteId && canReceive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={running}
                    aria-label={`Usar a guia ${noteLabel(n.number)}`}
                    onClick={() => {
                      setErro(null);
                      setNoteId(n.id);
                    }}
                  >
                    Usar esta guia
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {escolhida ? (
          <p role="status" className="rounded-lg border border-violet-500/50 bg-violet-500/10 p-3 text-sm text-violet-900 dark:text-violet-200">
            {escolhida.prefill
              ? escolhida.pending
                ? `Guia de remessa ${noteLabel(escolhida.number)} do fornecedor: as quantidades são as que vêm nesta guia, menos o já recebido com ela (nunca mais do que falta). Pode alterá-las em "Conferir linha a linha".`
                : `Tudo o que vem na guia ${noteLabel(escolhida.number)} já foi recebido nesta encomenda. Escolha outra guia ou confira linha a linha.`
              : `A guia ${noteLabel(escolhida.number)} não indica linhas desta encomenda: vale o que falta.`}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <p className="font-semibold">
            Vai entrar {fmtUn(totalUn)} un ({nLinhas} {nLinhas === 1 ? "linha" : "linhas"})
          </p>
          {previewQuery.error ? (
            <p className="text-xs text-destructive">
              Não foi possível calcular a repartição: {(previewQuery.error as { message?: string }).message ?? "erro"}
            </p>
          ) : null}
          <ul className="space-y-1.5">{itens.map((x) => previsao(x.line, x.qty))}</ul>
        </div>

        {!conferir ? (
          canReceive && !running ? (
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => setConferir(true)}>
              Veio diferente? Conferir linha a linha
            </Button>
          ) : null
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Conferir linha a linha: o que veio de cada linha (máximo = o que falta).</caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Produto</th>
                    <th className="px-2 py-1.5 text-right font-medium">Pedido</th>
                    <th className="px-2 py-1.5 text-right font-medium">Recebido</th>
                    <th className="px-2 py-1.5 text-right font-medium">Falta</th>
                    {escolhida?.prefill ? <th className="px-2 py-1.5 text-right font-medium">Nesta guia</th> : null}
                    <th className="px-2 py-1.5 text-right font-medium">Dar entrada</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.id} className={cn("border-t", l.productId === highlightProductId && "bg-primary/5")}>
                      <td className="px-2 py-1.5">
                        {l.name} {l.sku ? <small className="font-mono text-muted-foreground">{l.sku}</small> : null}
                        <br />
                        <small className="text-muted-foreground">{lineUnitLabel(l)}</small>
                        {l.open > 0 && canCancel ? (
                          <>
                            <br />
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-xs text-muted-foreground"
                              disabled={running}
                              onClick={() =>
                                setCancelTarget({
                                  kind: "line",
                                  poId: po.id,
                                  orderNumber: po.orderNumber,
                                  itemId: l.id,
                                  productName: l.name,
                                  quantity: l.open,
                                  uomLabel: l.uomCode || "un.",
                                })
                              }
                            >
                              Não vou receber o resto desta linha
                            </Button>
                          </>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtUn(l.quantity)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtUn(l.received)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtUn(l.open)}</td>
                      {escolhida?.prefill ? <td className="px-2 py-1.5 text-right tabular-nums">{fmtUn(vem(l))}</td> : null}
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-9 p-0"
                            aria-label={`Menos: ${l.name}`}
                            disabled={!canReceive || running || l.open <= 0}
                            onClick={() => passo(l, -1)}
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Input
                            inputMode="decimal"
                            aria-label={`Dar entrada: ${l.name}`}
                            className="h-9 w-16 text-center"
                            disabled={!canReceive || running || l.open <= 0}
                            value={qtd[l.id] ?? ""}
                            onChange={(e) => mudarQtd(l, e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-9 p-0"
                            aria-label={`Mais: ${l.name}`}
                            disabled={!canReceive || running || l.open <= 0}
                            onClick={() => passo(l, 1)}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Máximo = o que falta. Excesso: registe à parte (não entra nesta encomenda).</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Button type="button" variant="link" className="h-auto p-0" disabled={running} onClick={() => setConferir(false)}>
                Voltar ao resumo (receber tudo)
              </Button>
              {abertas.length > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  className={cn("h-auto p-0", !canCancel && "cursor-not-allowed opacity-50")}
                  aria-disabled={!canCancel || running || undefined}
                  title={canCancel ? undefined : cancelReason}
                  onClick={() => {
                    if (!canCancel || running) return;
                    setCancelTarget({ kind: "order", poId: po.id, orderNumber: po.orderNumber, lineCount: abertas.length });
                  }}
                >
                  <Ban className="mr-1 h-4 w-4" aria-hidden="true" />
                  Não vou receber o resto
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {cancelMsg ? (
          <p role="status" className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            {cancelMsg}
          </p>
        ) : null}

        {activeRun && running ? <RunProgress run={activeRun} onAck={onAck} onRecalc={onRecalcRun} /> : null}

        {erro ? (
          <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <Button type="button" variant="link" className="h-auto p-0" onClick={onArticleMode}>
          <ScanLine className="mr-1 h-4 w-4" aria-hidden="true" />
          Ler artigo a artigo
        </Button>
      </div>
    );
  }

  // ── Rodapé ──
  const review = activeRun?.phase === "review";
  const pendingAck = !!activeRun && activeRun.lines.some((l) => l.noteChecks.length > 0 && !l.acked);
  let rodape: ReactNode;
  if (finished) {
    rodape = (
      <Button type="button" onClick={onClose}>
        Concluir
      </Button>
    );
  } else if (review) {
    rodape = (
      <>
        <Button type="button" variant="outline" onClick={onCancelRun}>
          Cancelar
        </Button>
        {activeRun?.offline ? (
          <Button type="button" onClick={onRecalcRun}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Recalcular
          </Button>
        ) : (
          <Button type="button" disabled={pendingAck} onClick={onConfirmReview}>
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            {pendingAck ? "Confirme os avisos da guia" : "Confirmar entrada"}
          </Button>
        )}
      </>
    );
  } else {
    const blocked = !canReceive || running || !itens.length || portalLoading;
    rodape = (
      <>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          aria-disabled={blocked || undefined}
          title={!canReceive ? receiveReason : undefined}
          className={cn(blocked && "cursor-not-allowed opacity-50")}
          onClick={() => {
            if (!blocked) confirmar();
          }}
        >
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          {running ? "A receber…" : conferir ? `Confirmar entrada · ${fmtUn(totalUn)} un` : `Receber tudo · ${fmtUn(totalUn)} un`}
        </Button>
      </>
    );
  }

  const supplierOptions = useMemo(() => suppliers.map((s) => ({ id: s.id, name: s.name })), [suppliers]);

  return (
    <>
      <SheetHeader className="space-y-1.5 border-b p-4 pr-12 text-left">
        <SheetTitle>Dar entrada · {po.orderNumber}</SheetTitle>
        <SheetDescription>Armazém › Receção · {po.supplierName}</SheetDescription>
        {selos}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{corpo}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t p-4">{rodape}</div>
      <PoCancelRemainderDialog
        target={cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        onDone={({ status, message }) => {
          setCancelTarget(null);
          setCancelMsg(message);
          setConferir(false);
          onCancelled(message);
          if (status === "received" || status === "cancelled") onClose();
        }}
      />
      {canCreateNote ? (
        <DeliveryNoteDialog
          open={createNoteOpen}
          onOpenChange={setCreateNoteOpen}
          orgId={orgId}
          suppliers={supplierOptions}
          defaultSupplierId={po.supplierId ?? undefined}
          onSaved={(n) => {
            setCreateNoteOpen(false);
            void notesQuery.refetch();
            onNotesChanged?.();
            if (n.status === "open" && n.supplier_id === po.supplierId) setNoteId(n.id);
            else setErro(`A guia ${noteLabel(n.note_number)} foi gravada mas não é deste fornecedor (ou não está aberta): não fica escolhida.`);
          }}
          onOpenExisting={(id) => {
            setCreateNoteOpen(false);
            if (openNotes.some((x) => x.id === id)) setNoteId(id);
          }}
        />
      ) : null}
    </>
  );
}

/** O progresso da receção pelo cesto: a pré-visualização de cada linha e os avisos da guia por confirmar. */
function RunProgress({ run, onAck, onRecalc }: { run: PoRunView; onAck: (entryId: string, v: boolean) => void; onRecalc: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm" aria-live="polite">
      <p className="font-medium">
        {run.phase === "submitting"
          ? "A receber…"
          : run.phase === "review"
            ? run.offline
              ? "Sem ligação para confirmar os avisos da guia."
              : "Reveja antes de dar entrada:"
            : "A preparar a entrada…"}
      </p>
      <ul className="space-y-1.5">
        {run.lines.map((l) => (
          <li key={l.entryId} className="space-y-1">
            <p>
              <b>
                {fmtUn(l.quantity)} {l.unitLabel}
              </b>{" "}
              · {l.name}
              {l.previewText ? <span className="text-muted-foreground"> — {l.previewText}</span> : null}
              {l.previewStatus === "loading" ? <span className="text-muted-foreground"> — a calcular…</span> : null}
            </p>
            {l.previewError ? <p className="text-destructive">{l.previewError}</p> : null}
            {l.noteChecks.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300">
                <Checkbox
                  id={`ack-run-${l.entryId}`}
                  checked={l.acked}
                  onCheckedChange={(c) => onAck(l.entryId, c === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={`ack-run-${l.entryId}`} className="font-normal leading-snug">
                  <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">{l.noteChecks.join(" · ")}.</span> Confirmo que recebo mesmo assim.
                </Label>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {run.offline ? (
        <Button type="button" variant="outline" size="sm" onClick={onRecalc}>
          <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
          Recalcular
        </Button>
      ) : null}
    </div>
  );
}
