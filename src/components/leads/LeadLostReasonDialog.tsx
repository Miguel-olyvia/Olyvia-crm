import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Generic business reasons, same idea as the "Marcar como Perdido" dialog in
// Quotes.tsx (src/pages/Quotes.tsx, lostReasonDialog) — options here are
// leads-specific, the persistence mechanism (a plain text column) follows
// the same pattern as quotes.lost_reason / deals.lost_reason.
const LOST_REASON_OPTIONS = [
  "Sem resposta",
  "Preço",
  "Escolheu concorrente",
  "Não é o momento certo",
  "Outro",
];

interface LeadLostReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  leadTitle?: string;
}

export function LeadLostReasonDialog({ open, onOpenChange, onConfirm, leadTitle }: LeadLostReasonDialogProps) {
  const [reason, setReason] = useState("");

  // Reset the selection every time the dialog is (re)opened, so a leftover
  // choice from a previous lead/bulk action never gets silently reused.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como Perdida</DialogTitle>
          <DialogDescription>
            {leadTitle
              ? `Indique o motivo de perda de "${leadTitle}".`
              : "Indique o motivo de perda desta lead."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder="Motivo..." />
            </SelectTrigger>
            <SelectContent>
              {LOST_REASON_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={!reason}
          >
            Marcar como Perdida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
