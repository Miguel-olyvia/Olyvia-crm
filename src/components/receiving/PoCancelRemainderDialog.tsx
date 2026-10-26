// "Não vou receber o resto" no painel da Receção — o mesmo que já existe em PurchaseOrders.tsx (anular o resto de uma
// linha / da encomenda): rpc_cancel_po_line_remainder / rpc_cancel_po_remainder, motivos found_stock |
// supplier_unavailable | other (com other a nota é obrigatória — a BD recusa sem ela). "Danificado" não é um motivo da
// BD: vai como other com a nota "Danificado: …". A BD exige purchase_orders.receive + inventory.edit; o diálogo não
// decide permissões (o painel só o abre com elas) e mostra o erro do servidor tal como vem.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { fmtUn } from "./porReceber";
import { CANCEL_CHOICE_LABEL, cancelArgs, type CancelChoice } from "./cancelRemainder";

export type CancelTarget =
  | { kind: "line"; poId: string; orderNumber: string; itemId: string; productName: string; quantity: number; uomLabel: string }
  | { kind: "order"; poId: string; orderNumber: string; lineCount: number };

interface Props {
  target: CancelTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Depois de anular (estado da PO devolvido pela BD). */
  onDone: (result: { status?: string; message: string }) => void;
}

export function PoCancelRemainderDialog({ target, onOpenChange, onDone }: Props) {
  const [choice, setChoice] = useState<CancelChoice>("found_stock");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setChoice("found_stock");
    setNote("");
    setError(null);
  }, [target]);

  const confirm = async () => {
    if (!target || busy) return;
    const args = cancelArgs(choice, note);
    if (!args) {
      setError("Com motivo «Outro», escreva uma nota.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // p_notes null = sem nota (a função tem DEFAULT NULL); os tipos gerados só dizem string.
      const notes = args.notes as string;
      const { data, error: err } =
        target.kind === "line"
          ? await supabase.rpc("rpc_cancel_po_line_remainder", {
              p_purchase_order_item_id: target.itemId,
              p_reason: args.reason,
              p_notes: notes,
            })
          : await supabase.rpc("rpc_cancel_po_remainder", {
              p_purchase_order_id: target.poId,
              p_reason: args.reason,
              p_notes: notes,
            });
      if (err) {
        setError(err.message || "Não foi possível anular o resto.");
        return;
      }
      const r = (data ?? {}) as { status?: string; quantity_cancelled?: number | null };
      const message =
        target.kind === "line"
          ? `${fmtUn(Number(r.quantity_cancelled ?? target.quantity))}${target.uomLabel ? ` ${target.uomLabel}` : ""} de ${target.productName} já não vão ser recebidos (${target.orderNumber}).`
          : r.status === "cancelled"
            ? `${target.orderNumber} ficou cancelada — nada tinha sido recebido.`
            : `${target.orderNumber}: anulado o que faltava.`;
      onDone({ status: r.status, message });
    } catch {
      setError("Sem ligação ao servidor — nada foi anulado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Não vou receber o resto — {target?.orderNumber}</DialogTitle>
          <DialogDescription>
            {target?.kind === "line"
              ? `Anula o que falta de ${target.productName} (${fmtUn(target.quantity)}${target.uomLabel ? ` ${target.uomLabel}` : ""}). Pode desfazer depois na encomenda.`
              : target
                ? `Anula o que falta de ${target.lineCount} ${target.lineCount === 1 ? "linha" : "linhas"} desta encomenda. Pode desfazer depois na encomenda.`
                : null}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">
            Motivo <span aria-hidden="true">*</span>
          </legend>
          <RadioGroup value={choice} onValueChange={(v) => setChoice(v as CancelChoice)}>
            {(Object.keys(CANCEL_CHOICE_LABEL) as CancelChoice[]).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <RadioGroupItem id={`cancel-${k}`} value={k} />
                <Label htmlFor={`cancel-${k}`} className="font-normal">
                  {CANCEL_CHOICE_LABEL[k]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="cancel-note">Nota{choice === "other" ? " (obrigatória)" : " (opcional)"}</Label>
          <Textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? "A anular…" : "Anular resto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
