import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { spConfirmOrder, type SpConfirmOrderResult, type SpOrderDetail } from "@/lib/supplierPortal/spRpc";
import { formatSpDate } from "@/components/supplier-portal/spOrderFormat";

const COMMENT_MAX = 1000;
const MAX_DAYS_AHEAD = 730;

/** Hoje em Lisboa (a RPC valida a data na hora de Lisboa), "YYYY-MM-DD". */
function todayLisbon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SpOrderDetail;
  /** Revisão que estava no ecrã quando o diálogo abriu (não a da última leitura). */
  revision: number;
  onConfirmed: (res: SpConfirmOrderResult) => void;
  onError: (err: unknown) => void;
}

/**
 * Confirmar a encomenda (sp_confirm_order) com data de entrega prevista e
 * comentário, os dois opcionais. Envia a revisão fixada ao abrir o diálogo: se
 * a empresa reenviou entretanto, a RPC responde stale_revision (tratado em onError).
 */
export function SpConfirmOrderDialog({ open, onOpenChange, order, revision, onConfirmed, onError }: Props) {
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const today = todayLisbon();
  const minDate = order.order_date && order.order_date < today ? order.order_date.slice(0, 10) : today;
  const maxDate = addDays(today, MAX_DAYS_AHEAD);

  useEffect(() => {
    if (open) {
      // Sugere a data pedida pela empresa, só se estiver dentro do intervalo aceite.
      const asked = order.expected_delivery?.slice(0, 10) ?? "";
      setDate(asked && asked >= minDate && asked <= maxDate ? asked : "");
      setComment("");
      setDateError(null);
    }
  }, [open, order.expected_delivery, minDate, maxDate]);

  const validateDate = (value: string): string | null => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Data inválida.";
    if (value < minDate) return `A data não pode ser anterior a ${formatSpDate(minDate)}.`;
    if (value > maxDate) return `A data não pode ser posterior a ${formatSpDate(maxDate)}.`;
    return null;
  };

  const submit = async () => {
    const err = validateDate(date);
    setDateError(err);
    if (err) return;
    setSubmitting(true);
    try {
      const res = await spConfirmOrder({
        poId: order.purchase_order_id,
        revision,
        promisedDate: date || null,
        comment: comment.trim() || null,
      });
      onOpenChange(false);
      onConfirmed(res);
    } catch (e) {
      onError(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar encomenda {order.order_number}</DialogTitle>
          <DialogDescription>
            A empresa {order.company.name} é avisada da confirmação. Depois de confirmar, a data e o comentário já não podem
            ser alterados aqui.
          </DialogDescription>
        </DialogHeader>

        <form
          id="sp-confirm-order-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sp-confirm-date">Data de entrega prevista (opcional)</Label>
            <Input
              id="sp-confirm-date"
              type="date"
              className="h-11"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => {
                setDate(e.target.value);
                if (dateError) setDateError(validateDate(e.target.value));
              }}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? "sp-confirm-date-error" : "sp-confirm-date-help"}
            />
            {dateError ? (
              <p id="sp-confirm-date-error" className="text-xs text-destructive" role="alert">
                {dateError}
              </p>
            ) : (
              <p id="sp-confirm-date-help" className="text-xs text-muted-foreground">
                {order.expected_delivery
                  ? `A empresa pediu entrega até ${formatSpDate(order.expected_delivery)}.`
                  : "A empresa não indicou data de entrega."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-confirm-comment">Comentário (opcional)</Label>
            <Textarea
              id="sp-confirm-comment"
              rows={4}
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
              placeholder="Ex.: entrega em duas vezes, artigo X com prazo maior…"
              aria-describedby="sp-confirm-comment-count"
            />
            <p id="sp-confirm-comment-count" className="text-xs text-muted-foreground text-right" aria-live="polite">
              {comment.length}/{COMMENT_MAX}
            </p>
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="sp-confirm-order-form" className="h-11 gap-2" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar encomenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
