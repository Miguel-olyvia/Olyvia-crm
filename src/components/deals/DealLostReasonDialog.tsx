import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DealLostReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void | Promise<void>;
  /** Title of the single deal being moved, when applicable (kanban drag). */
  dealTitle?: string;
  /**
   * Overrides the default explanatory text — e.g. for the bulk-action flow,
   * where there is no single deal title to show.
   */
  description?: string;
}

/**
 * Asks for the disqualification reason before a deal is moved into a "lost"
 * stage. Uses a free-text field, matching the exact same "Motivo da
 * Desqualificação" field used in the deal edit form (src/pages/Deals.tsx) —
 * there is no fixed list of reason categories anywhere in the app for deals,
 * so this mirrors that field rather than inventing a Select with options
 * that don't exist elsewhere.
 */
export function DealLostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  dealTitle,
  description,
}: DealLostReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo da Desqualificação</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {description ||
              (dealTitle
                ? `Está a mover "${dealTitle}" para uma fase de desqualificação. Indique o motivo.`
                : "Está a mover este pedido para uma fase de desqualificação. Indique o motivo.")}
          </p>

          <div className="space-y-2">
            <Label htmlFor="deal-lost-reason-dialog">Motivo da Desqualificação *</Label>
            <Textarea
              id="deal-lost-reason-dialog"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Indique o motivo da desqualificação..."
              autoFocus
              className={!reason.trim() ? "border-destructive/50" : ""}
            />
            <p className="text-xs text-muted-foreground">Obrigatório para pedidos desqualificados</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!reason.trim() || submitting}>
            {submitting ? "A guardar…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
