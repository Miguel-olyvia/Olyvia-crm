import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck, Globe, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  formatPoDate,
  formatPoDateTime,
  isPortalFeatureMissing,
  poAcceptPromisedDate,
  poPortalErrorMessage,
  poSupplierStatus,
  poWithdrawFromSupplier,
  type PoSendResult,
  type PoSupplierStatus,
} from "@/components/purchase-orders/poSupplierPortalApi";
import { PoSendToSupplierButton } from "@/components/purchase-orders/PoSendToSupplierButton";

const REASON_MAX = 500;

const PUB_LABEL: Record<string, { text: string; tone: string }> = {
  sent: { text: "Enviada", tone: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200" },
  viewed: { text: "Vista pelo fornecedor", tone: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200" },
  confirmed: {
    text: "Confirmada pelo fornecedor",
    tone: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  withdrawn: { text: "Retirada do portal", tone: "bg-muted text-muted-foreground" },
};

const EMAIL_LABEL: Record<string, string> = {
  pending: "na fila",
  sent: "enviado",
  failed: "falhou",
  cancelled: "cancelado",
};

interface Props {
  orderId: string;
  orderNumber: string;
  supplierName?: string | null;
  /** Mudar este valor força nova leitura (ex.: depois de gravar com erro po_published). */
  refreshKey?: number;
  /** Estado lido (ou null se não houver / não disponível) — para bloquear o formulário. */
  onStatusChange?: (status: PoSupplierStatus | null) => void;
  /** Encomendar / retirar / aceitar data mudaram a PO: recarregar a lista. */
  onOrderChanged?: () => void;
  /** Depois de "Encomendar" no diálogo: o estado da PO no formulário passa a este. */
  onOrderStatusChanged?: (orderStatus: string) => void;
  /** Depois de "Aceitar data": expected_delivery passa a esta data no formulário. */
  onExpectedDeliveryAccepted?: (date: string | null) => void;
  /**
   * Depois de "Encomendar" com publicação no portal: recarregar a PO e as linhas
   * da BD, para o formulário (bloqueado) mostrar o que foi realmente enviado.
   */
  onPublished?: () => void;
  /** Formulário com alterações por gravar: "Encomendar" fica desativado. */
  hasUnsavedChanges?: boolean;
  /** Formulário só de leitura por outro motivo (recebida/cancelada): o aviso não fala de notas. */
  formReadOnly?: boolean;
}

/**
 * Painel "Portal do fornecedor" no diálogo da encomenda a fornecedor (F3.2):
 * estado da publicação, emails, e as ações Encomendar / Aceitar data / Retirar
 * (as permissões vêm de rpc_po_supplier_status: can_send/can_withdraw/can_accept_date).
 */
export function PoSupplierPortalPanel({
  orderId,
  orderNumber,
  supplierName,
  refreshKey = 0,
  onStatusChange,
  onOrderChanged,
  onOrderStatusChanged,
  onExpectedDeliveryAccepted,
  onPublished,
  hasUnsavedChanges = false,
  formReadOnly = false,
}: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PoSupplierStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const requestRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await poSupplierStatus(orderId);
      if (requestId !== requestRef.current) return;
      setStatus(res);
      onStatusChangeRef.current?.(res);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setStatus(null);
      setError(err);
      onStatusChangeRef.current?.(null);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Ao fechar/trocar de encomenda, o formulário deixa de estar bloqueado por este painel.
  useEffect(() => () => onStatusChangeRef.current?.(null), [orderId]);

  const handleSent = (res: PoSendResult) => {
    onOrderStatusChanged?.(res.order_status);
    onOrderChanged?.();
    if (res.published || res.already_published) onPublished?.();
    void load();
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await poAcceptPromisedDate(orderId);
      toast({
        title: res.already_accepted ? "A data já estava aceite" : "Data de entrega atualizada",
        description: `Entrega prevista: ${formatPoDate(res.expected_delivery)}.`,
      });
      onExpectedDeliveryAccepted?.(res.expected_delivery);
      onOrderChanged?.();
      void load();
    } catch (err) {
      toast({ title: "Não foi possível aceitar a data", description: poPortalErrorMessage(err), variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    try {
      await poWithdrawFromSupplier(orderId, withdrawReason);
      toast({
        title: "Encomenda retirada do portal",
        description: "Voltou a Pendente e pode ser editada. O fornecedor deixa de a ver (não recebe email).",
      });
      setWithdrawOpen(false);
      setWithdrawReason("");
      onOrderStatusChanged?.("pending");
      onOrderChanged?.();
      void load();
    } catch (err) {
      toast({ title: "Não foi possível retirar", description: poPortalErrorMessage(err), variant: "destructive" });
      void load();
    } finally {
      setWithdrawing(false);
    }
  };

  if (error && isPortalFeatureMissing(error)) return null;

  if (loading && !status) {
    return (
      <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground flex items-center gap-2" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        A ler o estado no portal do fornecedor…
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground flex flex-wrap items-center gap-2">
        Não foi possível ler o estado no portal do fornecedor.
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const pub = status.publication;
  const active = !!pub && pub.status !== "withdrawn";
  // Sem nada para mostrar nem fazer: fornecedor sem portal e sem histórico.
  if (!pub && !status.portal.linked && !status.can_send) return null;

  const label = pub ? PUB_LABEL[pub.status] ?? { text: pub.status, tone: "" } : null;

  return (
    <section className="rounded-md border bg-muted/20 px-3 py-3 space-y-3" aria-labelledby={`po-portal-${orderId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 id={`po-portal-${orderId}`} className="text-sm font-semibold">
            Portal do fornecedor
          </h3>
          {label && (
            <Badge variant="outline" className={cn("font-medium", label.tone)}>
              {label.text}
            </Badge>
          )}
          {pub && pub.revision > 1 && <span className="text-xs text-muted-foreground">versão {pub.revision}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.can_send && (
            <PoSendToSupplierButton
              orderId={orderId}
              orderNumber={orderNumber}
              supplierName={supplierName}
              variant="button"
              onDone={handleSent}
              extraWarning="É enviada a encomenda tal como está gravada."
              disabled={hasUnsavedChanges}
              disabledHint="Grava primeiro as alterações para poder encomendar."
            />
          )}
          {status.can_accept_date && (
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void handleAccept()} disabled={accepting}>
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
              Aceitar data prometida
            </Button>
          )}
          {status.can_withdraw && (
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setWithdrawOpen(true)}>
              <Undo2 className="h-4 w-4" />
              Retirar do portal
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Atualizar estado no portal"
            title="Atualizar"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {!pub && (
        <p className="text-sm text-muted-foreground">
          {status.portal.linked
            ? `O fornecedor tem acesso ao portal (${status.portal.active_users} utilizador(es) ativo(s)). Ao encomendar, recebe a encomenda no portal e por email.`
            : "Este fornecedor não tem acesso ao portal: encomendar só muda o estado para Encomendado."}
        </p>
      )}

      {pub && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Enviada</dt>
            <dd>
              {formatPoDateTime(pub.sent_at)}
              {pub.sent_by?.name ? ` · ${pub.sent_by.name}` : ""}
            </dd>
          </div>
          {pub.viewed_at && (
            <div>
              <dt className="text-xs text-muted-foreground">Vista pelo fornecedor</dt>
              <dd>{formatPoDateTime(pub.viewed_at)}</dd>
            </div>
          )}
          {pub.confirmed_at && (
            <div>
              <dt className="text-xs text-muted-foreground">Confirmada</dt>
              <dd>
                {formatPoDateTime(pub.confirmed_at)}
                {pub.confirmed_by_name ? ` · ${pub.confirmed_by_name}` : ""}
              </dd>
            </div>
          )}
          {pub.status === "confirmed" && (
            <div>
              <dt className="text-xs text-muted-foreground">Entrega prevista pelo fornecedor</dt>
              <dd>
                {pub.promised_date ? formatPoDate(pub.promised_date) : "Sem data indicada"}
                {pub.promised_date && status.expected_delivery !== pub.promised_date && (
                  <span className="block text-xs text-amber-700 dark:text-amber-400">
                    Diferente da entrega prevista na encomenda ({formatPoDate(status.expected_delivery)})
                  </span>
                )}
                {pub.promised_date_accepted_at && (
                  <span className="block text-xs text-muted-foreground">
                    Aceite em {formatPoDateTime(pub.promised_date_accepted_at)}
                    {pub.promised_date_accepted_by_name ? ` por ${pub.promised_date_accepted_by_name}` : ""}
                  </span>
                )}
              </dd>
            </div>
          )}
          {pub.supplier_comment && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-muted-foreground">Comentário do fornecedor</dt>
              <dd className="whitespace-pre-wrap">{pub.supplier_comment}</dd>
            </div>
          )}
          {pub.status === "withdrawn" && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-muted-foreground">Retirada</dt>
              <dd>
                {formatPoDateTime(pub.withdrawn_at)}
                {pub.withdrawn_by_name ? ` · ${pub.withdrawn_by_name}` : ""}
                {pub.withdraw_reason ? ` — ${pub.withdraw_reason}` : ""}
              </dd>
            </div>
          )}
        </dl>
      )}

      {status.emails.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Emails ao fornecedor</p>
          <ul className="space-y-0.5 text-xs">
            {status.emails.map((e, i) => (
              <li
                key={`${e.to_email}-${e.scheduled_for}-${i}`}
                className={cn("break-all", e.status === "failed" ? "text-destructive" : "text-muted-foreground")}
              >
                {e.to_email} · {EMAIL_LABEL[e.status] ?? e.status}
                {e.sent_at ? ` em ${formatPoDateTime(e.sent_at)}` : ` (${formatPoDateTime(e.scheduled_for)})`}
                {e.status === "failed" && e.error_message ? ` — ${e.error_message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.can_send && hasUnsavedChanges && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="note">
          Grava primeiro: há alterações no formulário por gravar e só se encomenda o que está gravado.
        </p>
      )}

      {/* Único aviso de bloqueio do formulário (o ecrã da encomenda não repete). */}
      {active && !status.can_edit_lines && (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          role="note"
        >
          {pub?.status === "confirmed"
            ? "O fornecedor já confirmou esta encomenda no portal: as linhas, o fornecedor, a data da encomenda e o estado já não podem ser alterados. Para reduzir quantidades use \"Não vou receber\" (Anular resto)."
            : "Esta encomenda está no portal do fornecedor. Retire-a para alterar linhas, fornecedor, data da encomenda ou estado."}
          {!formReadOnly && " Pode alterar as notas e a entrega prevista."}
        </div>
      )}

      <Dialog open={withdrawOpen} onOpenChange={(o) => !withdrawing && setWithdrawOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retirar {orderNumber} do portal?</DialogTitle>
            <DialogDescription>
              A encomenda volta a Pendente e pode ser editada. O fornecedor deixa de a ver e não recebe email. Para lha voltar a
              enviar, use "Encomendar" outra vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`po-withdraw-reason-${orderId}`}>Motivo (opcional, interno)</Label>
            <Textarea
              id={`po-withdraw-reason-${orderId}`}
              rows={3}
              maxLength={REASON_MAX}
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value.slice(0, REASON_MAX))}
            />
            <p className="text-xs text-muted-foreground text-right">
              {withdrawReason.length}/{REASON_MAX}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setWithdrawOpen(false)} disabled={withdrawing}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleWithdraw()} disabled={withdrawing}>
              {withdrawing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Retirar do portal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
