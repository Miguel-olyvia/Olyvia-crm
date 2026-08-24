import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { QUOTE_LOST_REASONS } from "@/lib/quoteReasons";

interface QuoteRejectReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen reason once the user confirms. */
  onConfirm: (reason: string) => void;
}

// Pede o motivo de rejeição antes de gravar um orçamento com estado = "rejeitado".
// Reutiliza a MESMA lista de motivos do "Marcar como Perdido" (src/lib/quoteReasons.ts).
export function QuoteRejectReasonDialog({ open, onOpenChange, onConfirm }: QuoteRejectReasonDialogProps) {
  const [reason, setReason] = useState("");

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setReason("");
  };

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason);
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como Rejeitado</DialogTitle>
          <DialogDescription>Indique o motivo de rejeição deste orçamento.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue placeholder="Motivo..." /></SelectTrigger>
            <SelectContent>
              {QUOTE_LOST_REASONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
