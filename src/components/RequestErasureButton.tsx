import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";

const MIN_REASON_LENGTH = 10;

interface RequestErasureButtonProps {
  entityId: string | null | undefined;
  entityLabel: string;
}

async function getBackendErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx: any = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      return body?.error || body?.message || fallback;
    }
  } catch {
    // ignore parse errors, fall back below
  }
  return fallback;
}

export function RequestErasureButton({ entityId, entityLabel }: RequestErasureButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!entityId) return null;

  const handleSubmit = async () => {
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(`O motivo precisa de pelo menos ${MIN_REASON_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("request-data-erasure", {
        body: { entity_id: entityId, reason: reason.trim() },
      });

      if (error) {
        const message = await getBackendErrorMessage(error, error.message || "Erro ao submeter o pedido.");
        throw new Error(message);
      }

      toast.success("Pedido de eliminação submetido. Um administrador irá revê-lo.");
      setOpen(false);
      setReason("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao submeter o pedido.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!submitting) { setOpen(next); if (!next) setReason(""); } }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
          Pedir eliminação de dados
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pedir eliminação de dados (RGPD Art. 17)</AlertDialogTitle>
          <AlertDialogDescription>
            Submete um pedido de eliminação/anonimização dos dados de <strong>{entityLabel}</strong>.
            Nada é alterado agora — o pedido fica pendente até um administrador o aprovar ou rejeitar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="erasure-reason">Motivo do pedido</Label>
          <Textarea
            id="erasure-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: o titular pediu a eliminação dos seus dados pessoais"
            disabled={submitting}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
            {submitting ? "A submeter…" : "Submeter pedido"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
