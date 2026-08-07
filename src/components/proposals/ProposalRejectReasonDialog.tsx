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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
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

/**
 * Builds the NOT NULL `code` from the user-visible label. The table requires a
 * code but nothing in the UI ever exposed one, so it is derived rather than
 * asked for.
 */
const slugifyReasonCode = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "motivo";

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
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setSelectedReasonId("");
      setNotes("");
      setCreating(false);
      setNewLabel("");
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

  /**
   * Creates a reason for the ACTIVE organization and selects it.
   *
   * There is no settings screen for this table anywhere in the app — the
   * dialog only ever read it — so an organization with no rows (a brand new
   * one) could never reject a proposal at all. Creating inline is the only
   * way out of that dead end without a DB edit.
   */
  const handleCreateReason = async () => {
    const label = newLabel.trim();
    if (!label || !organizationId) return;

    setSavingNew(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const baseCode = slugifyReasonCode(label);
      let created: RejectionReasonRow | null = null;
      let lastError: any = null;

      // `code` may collide with an existing (possibly inactive) row, so retry
      // with a suffix instead of failing in the user's face.
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const code = attempt === 0 ? baseCode : `${baseCode}_${attempt + 1}`;
        const { data, error } = await (supabase.from("proposal_rejection_reasons") as any)
          .insert({
            organization_id: organizationId,
            code,
            label,
            is_active: true,
            sort_order: reasons.length,
            created_by: auth?.user?.id ?? null,
          })
          .select("id, code, label, description")
          .single();

        if (!error) {
          created = data as RejectionReasonRow;
          break;
        }
        lastError = error;
        if (error.code !== "23505") break; // not a duplicate — no point retrying
      }

      if (!created) throw lastError ?? new Error("Não foi possível criar o motivo.");

      setReasons((prev) => [...prev, created!]);
      setSelectedReasonId(created.id);
      setNewLabel("");
      setCreating(false);
    } catch (err: any) {
      toast({
        title: "Não foi possível criar o motivo",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingNew(false);
    }
  };

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

            {!loadingReasons && reasons.length === 0 && !creating && (
              <p className="text-xs text-muted-foreground">
                Esta organização ainda não tem motivos de rejeição configurados.
              </p>
            )}

            {creating ? (
              <div className="space-y-2 rounded-md border p-2">
                <Label className="text-xs">Novo motivo</Label>
                <Input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex.: Preço acima do orçamento"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateReason();
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCreating(false);
                      setNewLabel("");
                    }}
                    disabled={savingNew}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateReason}
                    disabled={savingNew || !newLabel.trim()}
                  >
                    {savingNew ? "A criar…" : "Criar e selecionar"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setCreating(true)}
                disabled={!organizationId || loadingReasons}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo motivo
              </Button>
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
