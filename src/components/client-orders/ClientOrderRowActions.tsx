// Ações de uma linha de "Saídas para clientes" (AcoesLinhaEc do mockup):
// "Ver", "PDF" e o menu ⋯. Só apresentação — os handlers e as condições vêm
// da página (ClientOrders.tsx), que os mantém iguais aos de antes.
import { Eye, FileDown, Loader2, Pencil, Printer, Receipt, Trash2, Truck } from "lucide-react";
import { RowActions, type RowActionEntry } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";

// Mesmo aspeto do botão principal de RowActions (.btn.btn-sm do mockup).
const BTN =
  "inline-flex min-h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1 text-[13px] font-[550] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface ClientOrderRowActionsProps {
  orderLabel: string;
  onView: () => void;
  onPdf: () => void;
  pdfBusy: boolean;
  /** Editar (encomenda manual): null = não se aplica (outra origem). */
  edit: { onSelect: () => void } | null;
  onRequestMissing: () => void;
  /** Proforma da venda direta (só quando existe). */
  proforma: { number: string; onSelect: () => void; busy: boolean } | null;
  /** Eliminar: deletable = manual ou venda direta. */
  remove: { deletable: boolean; busy: boolean; onSelect: () => void };
}

/**
 * Linha de uma encomenda eliminada ("Ver eliminadas"): só "Ver". O PDF e as
 * ações precisam de rpc_get_client_order_document, que não lê eliminadas.
 */
export function DeletedClientOrderRowActions({ orderLabel, onView }: { orderLabel: string; onView: () => void }) {
  return (
    <div className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={BTN} onClick={onView} aria-label={`Ver ${orderLabel} (eliminada)`}>
        Ver
      </button>
    </div>
  );
}

export function ClientOrderRowActions({
  orderLabel,
  onView,
  onPdf,
  pdfBusy,
  edit,
  onRequestMissing,
  proforma,
  remove,
}: ClientOrderRowActionsProps) {
  const items: RowActionEntry[] = [
    { label: "Abrir detalhe", icon: Eye, onSelect: onView },
    { label: "PDF", icon: Printer, onSelect: onPdf, disabled: pdfBusy, disabledReason: "A gerar o PDF…" },
    {
      label: "Editar",
      icon: Pencil,
      onSelect: () => edit?.onSelect(),
      disabled: !edit,
      disabledReason: "Só encomendas manuais",
      permission: "client_orders.edit",
    },
    {
      label: "Pedir em falta ao fornecedor",
      icon: Truck,
      onSelect: onRequestMissing,
      permission: ["purchase_orders.create", "client_orders.view"],
      requireAllPermissions: true,
    },
    ...(proforma
      ? [{
          label: `Proforma ${proforma.number}`,
          icon: Receipt,
          onSelect: proforma.onSelect,
          disabled: proforma.busy,
          disabledReason: "A gerar a proforma…",
        }]
      : []),
    "separator",
    {
      label: "Eliminar",
      icon: Trash2,
      destructive: true,
      onSelect: remove.onSelect,
      disabled: !remove.deletable || remove.busy,
      disabledReason: !remove.deletable ? "Só manuais ou venda direta" : "A eliminar…",
      permission: "client_orders.delete",
    },
  ];

  return (
    <div className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={BTN} onClick={onView} aria-label={`Ver ${orderLabel}`}>
        Ver
      </button>
      <button
        type="button"
        className={cn(BTN)}
        onClick={onPdf}
        disabled={pdfBusy}
        aria-label={`PDF de ${orderLabel}`}
      >
        {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileDown className="h-3.5 w-3.5" aria-hidden="true" />}
        PDF
      </button>
      <RowActions items={items} menuLabel={`Mais ações para ${orderLabel}`} />
    </div>
  );
}
