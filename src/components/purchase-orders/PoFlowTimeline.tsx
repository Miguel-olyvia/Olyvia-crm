// Linha de etapas da folha da encomenda (Timeline do Olyvia 2.0, PoCab.tsx) e a linha da Receção a seguir
// (ProximoRececao). A lógica está em poSheetFlow.ts; aqui só se desenha. "Aceitar data prometida" usa a RPC
// que já existe (rpc_po_accept_promised_date) e só aparece quando rpc_po_supplier_status diz can_accept_date.
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InventoryStatusBadge } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatPoDate, poAcceptPromisedDate, poPortalErrorMessage } from "./poSupplierPortalApi";
import { poPromiseAcceptance, poReceptionHint, type PoFlowPublication, type PoFlowStep } from "./poSheetFlow";

interface PoFlowTimelineProps {
  orderId: string;
  status: string;
  steps: PoFlowStep[];
  publication?: PoFlowPublication | null;
  /** rpc_po_supplier_status.can_accept_date (o servidor decide a permissão). */
  canAcceptDate?: boolean;
  /** Depois de aceitar: a nova entrega prevista (o formulário e a lista recarregam). */
  onDateAccepted?: (date: string | null) => void;
}

export function PoFlowTimeline({ orderId, status, steps, publication, canAcceptDate = false, onDateAccepted }: PoFlowTimelineProps) {
  const { toast } = useToast();
  const [accepting, setAccepting] = useState(false);
  if (status === "cancelled") {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="note">
        <X className="h-4 w-4" aria-hidden="true" />
        Encomenda cancelada.
      </div>
    );
  }
  const promise = poPromiseAcceptance(publication);
  const accept = async () => {
    setAccepting(true);
    try {
      const res = await poAcceptPromisedDate(orderId);
      toast({
        title: res.already_accepted ? "A data já estava aceite" : "Data de entrega atualizada",
        description: `Entrega prevista: ${formatPoDate(res.expected_delivery)}.`,
      });
      onDateAccepted?.(res.expected_delivery);
    } catch (err) {
      toast({ title: "Não foi possível aceitar a data", description: poPortalErrorMessage(err), variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };
  return (
    <ol aria-label="Linha temporal" className="mb-3 flex overflow-x-auto pb-1 pt-1">
      {steps.map((s, i) => {
        const done = s.state === "done";
        const cur = s.state === "current";
        return (
          <li
            key={s.key}
            aria-current={cur ? "step" : undefined}
            className="relative flex min-w-[120px] flex-1 flex-col items-start gap-0.5 pr-2.5 text-[12.5px]"
          >
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={cn("absolute left-6 right-0 top-[11px] h-0.5", done ? "bg-primary" : "bg-border")} />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "z-[1] grid h-6 w-6 place-items-center rounded-full border-2 text-[11px] font-bold",
                done ? "border-primary bg-primary text-primary-foreground" : cur ? "border-primary bg-card text-primary" : "border-border bg-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="font-semibold">
              {s.label}
              <span className="sr-only">{done ? " (feito)" : cur ? " (passo atual)" : ""}</span>
            </span>
            <small className="text-muted-foreground">{s.detail || " "}</small>
            {s.key === "confirmed" && promise === "accept" && canAcceptDate && (
              <Button type="button" size="sm" variant="outline" className="mt-0.5 h-7 px-2 text-xs" onClick={() => void accept()} disabled={accepting}>
                {accepting && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
                Aceitar data prometida
              </Button>
            )}
            {s.key === "confirmed" && promise === "accepted" && <InventoryStatusBadge tone="ok">Data aceite</InventoryStatusBadge>}
          </li>
        );
      })}
    </ol>
  );
}

/** "Receção no armazém: feita." / "Próximo passo: Receção no armazém (Armazém › Receção) →". */
export function PoReceptionNext({
  status,
  deleted = false,
  canReceive,
  onGo,
}: {
  status: string;
  deleted?: boolean;
  /** Tem as permissões de receber e de abrir a Receção: senão o passo fica em texto. */
  canReceive: boolean;
  onGo: () => void;
}) {
  const hint = poReceptionHint(status, deleted);
  if (!hint) return null;
  return (
    <p className="-mt-1 mb-3 text-sm text-muted-foreground">
      {hint.kind === "done" ? (
        "Receção no armazém: feita."
      ) : (
        <>
          Próximo passo:{" "}
          {canReceive ? (
            <button
              type="button"
              onClick={onGo}
              className="rounded-sm text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Receção no armazém (Armazém › Receção) →
            </button>
          ) : (
            "Receção no armazém"
          )}
          {hint.pendingNote ? " · pode receber-se mesmo pendente" : ""}
        </>
      )}
    </p>
  );
}
