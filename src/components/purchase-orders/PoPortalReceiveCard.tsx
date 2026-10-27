// Separador Portal: o cartão "Expedida pelo fornecedor com a guia …: leia o número da guia na Receção · Receber agora →"
// (ou "Confirmada pelo fornecedor · entrega a …. Já aparece na Receção.") do Olyvia 2.0 (TabPortal), quando a PO
// ainda se recebe. "Receber agora →" vai para Armazém › Receção com a PO (o mesmo de "Receber no armazém →").
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { noteLabel } from "@/components/receiving/deliveryNotes";
import { fmtDay, isPoReceivableStatus } from "./poSheetFlow";

export function poPortalReceiveText(i: {
  status: string;
  deleted?: boolean;
  publicationStatus?: string | null;
  promisedDate?: string | null;
  shipmentNote?: string | null;
}): string | null {
  if (!isPoReceivableStatus(i.status, i.deleted)) return null;
  if (i.shipmentNote) return `Expedida pelo fornecedor com a guia ${noteLabel(i.shipmentNote)}: leia o número da guia na Receção.`;
  if (i.publicationStatus === "confirmed") {
    const d = fmtDay(i.promisedDate);
    return `Confirmada pelo fornecedor${d ? ` · entrega a ${d}` : ""}. Já aparece na Receção.`;
  }
  return null;
}

export function PoPortalReceiveCard({ text, canReceive, onReceive }: { text: string | null; canReceive: boolean; onReceive: () => void }) {
  if (!text) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <span>{text}</span>
        {canReceive && (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={onReceive}>
            Receber agora →
          </Button>
        )}
      </div>
    </div>
  );
}
