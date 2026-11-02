import { useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSpHint } from "@/lib/supplierPortal/spRpc";
import { describeSpContractError, spContractsRpc } from "@/lib/supplierContracts/portal";

export const REFUSE_REASON_MIN = 3;
export const REFUSE_REASON_MAX = 2000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractLabel: string;
  onRefused: () => void;
  onStale: () => void;
}

/** Recusa pelo titular (sp_supplier_contract_refuse): motivo obrigatório, 3 a 2000 caracteres. */
export function SpContractRefuseDialog({ open, onOpenChange, contractId, contractLabel, onRefused, onStale }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trimmed = reason.trim();
  const valid = trimmed.length >= REFUSE_REASON_MIN && trimmed.length <= REFUSE_REASON_MAX;

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!valid) {
      setError(`Indique o motivo da recusa (${REFUSE_REASON_MIN} a ${REFUSE_REASON_MAX} caracteres).`);
      return;
    }
    setSaving(true);
    try {
      await spContractsRpc.refuse(contractId, trimmed);
      toast({ title: "Contrato recusado", description: "A empresa foi avisada e recebe o seu motivo." });
      setReason("");
      setError(null);
      onOpenChange(false);
      onRefused();
    } catch (err) {
      const msg = describeSpContractError(err);
      const hint = getSpHint(err);
      if (hint === "invalid_state" || hint === "not_found" || hint === "not_owner") {
        toast({ title: "Não foi possível recusar", description: msg, variant: "destructive" });
        onOpenChange(false);
        onStale();
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" /> Recusar o contrato
          </DialogTitle>
          <DialogDescription>
            Contrato {contractLabel}. Diga à empresa o que não aceita: pode depois enviar-lhe uma nova versão.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-1.5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          id="sp-refuse-form"
        >
          <Label htmlFor="sp-refuse-reason">
            Motivo da recusa<span className="text-destructive ml-1" aria-hidden="true">*</span>
          </Label>
          <Textarea
            id="sp-refuse-reason"
            rows={4}
            maxLength={REFUSE_REASON_MAX}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            required
            aria-invalid={!!error}
            aria-describedby={error ? "sp-refuse-reason-error" : undefined}
            disabled={saving}
          />
          {error && (
            <p id="sp-refuse-reason-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => close(false)} disabled={saving}>
            Voltar
          </Button>
          <Button type="submit" form="sp-refuse-form" variant="destructive" className="h-11 gap-2" disabled={saving || !valid}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Recusar contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
