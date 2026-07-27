import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ProposalRejectionReason {
  code: string;
  label: string;
  description: string | null;
}

export interface ProposalRejectionDecision {
  reasonId: string | null;
  code: string;
  label: string;
  notes: string | null;
}

interface ProposalRejectReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
  onConfirm: (decision: ProposalRejectionDecision) => Promise<void> | void;
}

interface RejectionReasonRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
}

export function ProposalRejectReasonDialog({
  open,
  onOpenChange,
  organizationId,
  onConfirm,
}: ProposalRejectReasonDialogProps) {
  const [reasons, setReasons] = useState<RejectionReasonRow[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loadingReasons, setLoadingReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedReasonId("");
      setNotes("");
      return;
    }
    if (!organizationId) {
      setReasons([]);
      return;
    }
    let isCurrent = true;
    setLoadingReasons(true);
    (async () => {
      const { data } = await (supabase.from("proposal_rejection_reasons") as any)
        .select("id, code, label, description")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order");
      if (isCurrent) {
        setReasons(data || []);
        setLoadingReasons(false);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [open, organizationId]);

  const selectedReason = reasons.find((reason) => reason.id === selectedReasonId);

  const handleConfirm = async () => {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await onConfirm({
        reasonId: selectedReason.id,
        code: selectedReason.code,
        label: selectedReason.label,
        notes: notes.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeitar proposta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo da rejeição</Label>
            <Select value={selectedReasonId} onValueChange={setSelectedReasonId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingReasons ? "A carregar motivos…" : "Seleciona um motivo"}
                />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((reason) => (
                  <SelectItem key={reason.id} value={reason.id}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReason?.description && (
              <p className="text-xs text-muted-foreground">{selectedReason.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notas adicionais (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes adicionais sobre a rejeição"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!selectedReason || submitting}
          >
            {submitting ? "A rejeitar…" : "Confirmar rejeição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
