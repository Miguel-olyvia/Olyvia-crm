import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPoShortDate, type PoPublicationRow } from "@/components/purchase-orders/poSupplierPortalApi";

/** "YYYY-MM-DD" → "dd/mm". */
function shortDay(value: string | null): string {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return m ? `${m[3]}/${m[2]}` : "";
}

/**
 * Etiqueta pequena na coluna Estado da lista de encomendas a fornecedor:
 * "No portal · enviada", "No portal · vista em dd/mm",
 * "Confirmada pelo fornecedor em dd/mm (entrega dd/mm)".
 */
export function PoPortalStatusBadge({ publication, className }: { publication: PoPublicationRow | undefined; className?: string }) {
  if (!publication || publication.status === "withdrawn") return null;

  let text: string;
  let tone: string;
  if (publication.status === "confirmed") {
    const when = formatPoShortDate(publication.confirmed_at);
    const promised = shortDay(publication.promised_date);
    text = `Confirmada pelo fornecedor${when ? ` em ${when}` : ""}${promised ? ` (entrega ${promised})` : ""}`;
    tone = "text-emerald-700 dark:text-emerald-400";
  } else if (publication.status === "viewed") {
    const when = formatPoShortDate(publication.viewed_at);
    text = `No portal · vista${when ? ` em ${when}` : ""}`;
    tone = "text-sky-700 dark:text-sky-400";
  } else {
    text = "No portal · enviada";
    tone = "text-muted-foreground";
  }

  return (
    <span className={cn("mt-1 flex items-center gap-1 text-xs whitespace-nowrap", tone, className)} title={text}>
      <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}
