// Ficha de uma guia do fornecedor (Fase 2 — fatia 2): resumo por produto
// (ok / falta / excesso / não anunciado / não encomendado), receções feitas
// pela guia, histórico e ações (editar, fechar, reabrir, cancelar).
//
// Ações só para quem gere guias (receiving.manage_delivery_notes); quem só pode
// consultar vê a ficha sem botões. Fechar exige nota se houver divergências;
// reabrir e cancelar exigem motivo. Fechar/reabrir/cancelar repetidos são
// idempotentes no servidor (changed=false), por isso "tentar de novo" depois
// de uma falha de rede é seguro.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban, CheckCircle2, FileDown, Lock, Pencil, RefreshCw, Unlock } from "lucide-react";
import { DeliveryNoteDialog } from "./DeliveryNoteDialog";
import {
  FULLSCREEN_DIALOG_CLASS,
  NOTE_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  fetchDeliveryNote,
  fmtDateTime,
  fmtDay,
  fmtQty,
  normalizeNote,
  noteErrorMessage,
  noteLabel,
  type DeliveryNoteFull,
  type DeliveryNoteProductStatus,
  type RpcErrorLike,
} from "./deliveryNotes";

export interface DeliveryNoteLocalWork {
  basket: number;
  unsent: number;
  pending: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  orgId: string | null;
  /** receiving.manage_delivery_notes: editar, fechar, reabrir, cancelar. */
  canEdit: boolean;
  /**
   * receiving.download_proof: botão "Descarregar PDF" (só no frontend).
   * Default true até o Receiving passar o valor da permissão.
   */
  canDownloadProof?: boolean;
  /** Trabalho local ainda por enviar com esta guia (aviso ao fechar/cancelar). */
  localWork?: (noteId: string) => DeliveryNoteLocalWork;
  /** Guia alterada (gravada, fechada, reaberta, cancelada) ou recarregada. */
  onChanged?: (note: DeliveryNoteFull) => void;
  /** Abrir outra guia (ex.: nº repetido ao editar). */
  onOpenOther?: (id: string) => void;
  /** "Usar esta guia" na receção (só se o ecrã o permitir agora). */
  onUse?: (note: DeliveryNoteFull) => void;
}

type ActionMode = "close" | "reopen" | "cancel" | null;

const STATUS_TONE: Record<DeliveryNoteProductStatus, string> = {
  ok: "border-emerald-500/60 text-emerald-700 dark:text-emerald-400",
  recebido: "border-emerald-500/60 text-emerald-700 dark:text-emerald-400",
  falta: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  excesso: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  nao_anunciado: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  nao_encomendado: "border-destructive/60 text-destructive",
};

const HISTORY_LABEL: Record<string, string> = { close: "Fechada", reopen: "Reaberta", cancel: "Cancelada" };

export function DeliveryNoteDetail({ open, onOpenChange, noteId, orgId, canEdit, canDownloadProof = true, localWork, onChanged, onOpenOther, onUse }: Props) {
  const [note, setNote] = useState<DeliveryNoteFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<ActionMode>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (id: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    setLoadError(null);
    const r = await fetchDeliveryNote(id);
    if (seq !== seqRef.current) return null;
    setLoading(false);
    if (r.note) {
      setNote(r.note);
      onChangedRef.current?.(r.note);
      return r.note;
    }
    setLoadError(noteErrorMessage(r.error));
    return null;
  }, []);

  useEffect(() => {
    if (!open || !noteId) return;
    setNote(null);
    setMode(null);
    setText("");
    setActionError(null);
    void load(noteId);
  }, [open, noteId, load]);

  const startAction = (m: ActionMode) => {
    setMode(m);
    setText("");
    setActionError(null);
  };

  const runAction = async () => {
    if (!note || !mode || busyRef.current) return;
    const trimmed = text.trim();
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    let err: RpcErrorLike | undefined;
    let result: DeliveryNoteFull | null = null;
    try {
      const res =
        mode === "close"
          ? await supabase.rpc("rpc_delivery_note_close", {
              p_delivery_note_id: note.id,
              p_notes: trimmed || undefined,
              p_expected_updated_at: note.updated_at,
            })
          : mode === "reopen"
            ? await supabase.rpc("rpc_delivery_note_reopen", { p_delivery_note_id: note.id, p_reason: trimmed })
            : await supabase.rpc("rpc_delivery_note_cancel", { p_delivery_note_id: note.id, p_reason: trimmed });
      if (res.error) err = res.error;
      else result = normalizeNote(res.data);
    } catch (ex) {
      err = { message: String(ex) };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (result) {
      setNote(result);
      setMode(null);
      setText("");
      onChangedRef.current?.(result);
      return;
    }
    if (err?.code === "40001") {
      await load(note.id);
      setActionError("A guia foi alterada entretanto (outra pessoa ou outra receção). Recarreguei — revê o resumo e tenta de novo.");
      return;
    }
    setActionError(
      err?.code ? noteErrorMessage(err) : "Sem ligação ao servidor — não sei se ficou feito. Tenta de novo (repetir não faz nada a dobrar).",
    );
  };

  // Comprovativo de receção (PDF). Import dinâmico: o @react-pdf/renderer não
  // pode entrar no chunk do ecrã de receção (pesa e só é preciso aqui).
  const downloadProof = async () => {
    if (!note || downloading) return;
    setDownloading(true);
    setActionError(null);
    try {
      const { downloadReceiptProof } = await import("@/utils/generateReceiptProofPdf");
      await downloadReceiptProof(note.id);
    } catch (ex) {
      setActionError(ex instanceof Error && ex.message ? ex.message : "Não foi possível gerar o PDF — tenta de novo.");
    } finally {
      setDownloading(false);
    }
  };

  const summary = note?.summary ?? null;
  const totals = summary?.totals;
  const needsCloseNote = !!summary?.has_divergences;
  const work = note && localWork ? localWork(note.id) : null;
  const workCount = work ? work.basket + work.unsent + work.pending : 0;
  const actionDisabled =
    busy ||
    (mode === "close" && needsCloseNote && !text.trim()) ||
    ((mode === "reopen" || mode === "cancel") && !text.trim());

  return (
    <>
      <Dialog open={open && !editOpen} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className={FULLSCREEN_DIALOG_CLASS}>
          <DialogHeader className="border-b p-4 pr-12 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Guia {note ? noteLabel(note.note_number) : ""}</span>
              {note && (
                <Badge variant={note.status === "open" ? "secondary" : "outline"}>{NOTE_STATUS_LABEL[note.status] ?? note.status}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {note
                ? [note.supplier_name ?? "Fornecedor", note.document_date ? `data ${fmtDay(note.document_date)}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : "Resumo da guia do fornecedor"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {loading && !note && <p className="text-sm text-muted-foreground">A carregar guia…</p>}
            {loadError && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  {loadError}
                </p>
                {noteId && (
                  <Button type="button" variant="outline" className="h-11" onClick={() => void load(noteId)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar de novo
                  </Button>
                )}
              </div>
            )}

            {note && (
              <>
                {note.changed_since_close && (
                  <Callout tone="warning">
                    O recebido mudou depois do fecho (por exemplo, uma receção revertida). O resumo abaixo é o atual; o do
                    fecho ficou guardado.
                  </Callout>
                )}
                {note.status === "closed" && (
                  <Callout tone="info">
                    Fechada em {fmtDateTime(note.closed_at)}
                    {note.close_notes ? ` — ${note.close_notes}` : ""}. Leituras com esta guia são recusadas até ser reaberta.
                  </Callout>
                )}
                {note.status === "cancelled" && (
                  <Callout tone="error">
                    Cancelada em {fmtDateTime(note.cancelled_at)}
                    {note.cancel_reason ? ` — ${note.cancel_reason}` : ""}.
                  </Callout>
                )}
                {note.notes && <p className="whitespace-pre-wrap break-words text-sm">{note.notes}</p>}

                <section aria-labelledby="dnd-pos" className="space-y-1">
                  <h3 id="dnd-pos" className="font-semibold">
                    Encomendas
                  </h3>
                  <p className="break-words text-sm">
                    {note.purchase_orders.length === 0
                      ? "Todas as encomendas em aberto do fornecedor."
                      : note.purchase_orders
                          .map((p) => `${p.order_number ?? "PO"}${p.deleted ? " (apagada)" : p.status === "cancelled" ? " (cancelada)" : ""}`)
                          .join(", ")}
                  </p>
                </section>

                <section aria-labelledby="dnd-products" className="space-y-2">
                  <h3 id="dnd-products" className="font-semibold">
                    Resumo por produto
                  </h3>
                  {totals && (
                    <p className="text-sm text-muted-foreground">
                      {summary?.has_lines ? `Anunciado ${fmtQty(totals.announced_units)} un · ` : "Sem linhas anunciadas · "}
                      recebido {fmtQty(totals.received_units)} un
                      {summary?.has_lines && totals.missing_units > 0 ? ` · falta ${fmtQty(totals.missing_units)} un` : ""}
                      {summary?.has_lines && totals.excess_units > 0 ? ` · excesso ${fmtQty(totals.excess_units)} un` : ""}
                      {totals.divergences > 0 ? ` · ${totals.divergences} com divergência` : ""}
                    </p>
                  )}
                  {!summary || summary.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda nada anunciado nem recebido.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {summary.products.map((p) => (
                        <li key={p.product_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2 text-sm">
                          <div className="min-w-0 flex-1 basis-40">
                            <p className="break-words font-medium">{p.name ?? "Produto"}</p>
                            {p.sku && <p className="break-all text-xs text-muted-foreground">{p.sku}</p>}
                          </div>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {summary.has_lines ? `${fmtQty(p.received_units)} / ${fmtQty(p.announced_units)} un` : `${fmtQty(p.received_units)} un`}
                          </span>
                          <Badge variant="outline" className={cn("whitespace-nowrap", STATUS_TONE[p.status])}>
                            {PRODUCT_STATUS_LABEL[p.status] ?? p.status}
                            {p.status === "falta" && ` ${fmtQty(p.missing_units)}`}
                            {p.status === "excesso" && ` +${fmtQty(p.excess_units)}`}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="dnd-receipts" className="space-y-2">
                  <h3 id="dnd-receipts" className="font-semibold">
                    Receções por esta guia{summary ? ` (${summary.receipts.length})` : ""}
                  </h3>
                  {!summary || summary.receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda nenhuma receção com esta guia.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {summary.receipts.map((r) => (
                        <li key={r.id} className={cn("space-y-0.5 p-2 text-sm", r.reverted && "opacity-60")}>
                          <p className="break-words">
                            <span className="font-medium">{r.product_name ?? "Produto"}</span> · {fmtQty(r.units)} un ·{" "}
                            {r.order_number ?? "PO"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDateTime(r.received_at)}
                            {Number(r.units_to_order) > 0 ? ` · ${fmtQty(r.units_to_order)} un para EC` : ""}
                            {Number(r.units_to_stock) > 0 ? ` · ${fmtQty(r.units_to_stock)} un para stock` : ""}
                            {r.reverted ? ` · revertida em ${fmtDateTime(r.reverted_at)}${r.revert_reason ? ` — ${r.revert_reason}` : ""}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {note.history.length > 0 && (
                  <section aria-labelledby="dnd-history" className="space-y-1">
                    <h3 id="dnd-history" className="font-semibold">
                      Histórico
                    </h3>
                    <ul className="space-y-1 text-sm">
                      {note.history.map((h, i) => (
                        <li key={i} className="break-words text-muted-foreground">
                          {fmtDateTime(h.at)} · {HISTORY_LABEL[h.action] ?? h.action}
                          {h.notes ? ` — ${h.notes}` : ""}
                          {h.reason ? ` — ${h.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Ação em curso */}
                {canEdit && mode && (
                  <section className="space-y-2 rounded-md border p-3" aria-labelledby="dnd-action">
                    <h3 id="dnd-action" className="font-semibold">
                      {mode === "close" ? "Fechar a guia" : mode === "reopen" ? "Reabrir a guia" : "Cancelar a guia"}
                    </h3>
                    {mode === "close" && (
                      <p className="text-sm text-muted-foreground">
                        Fechar só fecha a guia: as encomendas ficam como estão (o que faltar continua em aberto na PO).
                        {needsCloseNote && " Há divergências — indica uma nota."}
                      </p>
                    )}
                    {mode === "cancel" && (
                      <p className="text-sm text-muted-foreground">
                        Só para guias registadas por engano. Uma guia com receções ativas não pode ser cancelada (reverte-as
                        primeiro na encomenda).
                      </p>
                    )}
                    {(mode === "close" || mode === "cancel") && workCount > 0 && work && (
                      <Callout tone="warning">
                        Ainda há trabalho por enviar com esta guia neste dispositivo:{" "}
                        {[
                          work.basket > 0 ? `${work.basket} no cesto` : null,
                          work.unsent > 0 ? `${work.unsent} em "Por enviar"` : null,
                          work.pending > 0 ? `${work.pending} por confirmar` : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        . Depois de {mode === "close" ? "fechada" : "cancelada"}, essas receções são recusadas até a guia ser
                        reaberta (nada se perde — ficam no ecrã).
                      </Callout>
                    )}
                    <Label htmlFor="dnd-text">
                      {mode === "close" ? `Nota de fecho${needsCloseNote ? " *" : " (opcional)"}` : "Motivo *"}
                    </Label>
                    <Textarea
                      id="dnd-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={mode === "close" ? 2000 : 1000}
                      rows={3}
                      disabled={busy}
                    />
                    {actionError && (
                      <p role="alert" className="break-words text-sm text-destructive">
                        {actionError}
                      </p>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" className="h-11" onClick={() => startAction(null)} disabled={busy}>
                        Voltar
                      </Button>
                      <Button
                        type="button"
                        variant={mode === "cancel" ? "destructive" : "default"}
                        className="h-11"
                        onClick={() => void runAction()}
                        disabled={actionDisabled}
                      >
                        {busy
                          ? "A gravar…"
                          : mode === "close"
                            ? "Fechar guia"
                            : mode === "reopen"
                              ? "Reabrir guia"
                              : "Cancelar guia"}
                      </Button>
                    </div>
                  </section>
                )}
                {!mode && actionError && (
                  <p role="alert" className="break-words text-sm text-destructive">
                    {actionError}
                  </p>
                )}
              </>
            )}
          </div>

          {note && !mode && (
            <div className="flex flex-col-reverse flex-wrap gap-2 border-t p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11" onClick={() => noteId && void load(noteId)} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              {canDownloadProof && note.status !== "cancelled" && (
                <Button type="button" variant="outline" className="h-11" onClick={() => void downloadProof()} disabled={downloading}>
                  <FileDown className="mr-2 h-4 w-4" aria-hidden />
                  {downloading ? "A gerar…" : "Descarregar PDF"}
                </Button>
              )}
              {onUse && note.status === "open" && (
                <Button type="button" variant="secondary" className="h-11" onClick={() => onUse(note)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Usar esta guia
                </Button>
              )}
              {canEdit && note.status === "open" && (
                <>
                  <Button type="button" variant="outline" className="h-11" onClick={() => startAction("cancel")}>
                    <Ban className="mr-2 h-4 w-4" />
                    Cancelar guia
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button type="button" className="h-11" onClick={() => startAction("close")}>
                    <Lock className="mr-2 h-4 w-4" />
                    Fechar guia
                  </Button>
                </>
              )}
              {canEdit && note.status === "closed" && (
                <Button type="button" className="h-11" onClick={() => startAction("reopen")}>
                  <Unlock className="mr-2 h-4 w-4" />
                  Reabrir
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {canEdit && note && (
        <DeliveryNoteDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          orgId={orgId}
          note={note}
          onSaved={(n) => {
            setNote(n);
            onChangedRef.current?.(n);
          }}
          onOpenExisting={(id) => {
            setEditOpen(false);
            onOpenOther?.(id);
          }}
        />
      )}
    </>
  );
}

function Callout({ tone, children }: { tone: "warning" | "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        tone === "warning" && "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        tone === "info" && "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300",
        tone === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
