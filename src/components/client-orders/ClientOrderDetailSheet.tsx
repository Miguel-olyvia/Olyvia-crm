// Folha lateral do detalhe de uma Encomenda Cliente (Folha/EcFolha do
// protótipo): cabeçalho fixo com a migalha, o título, os distintivos, o menu ⋯
// e o fechar; grelha de dados; corpo que rola; rodapé fixo. Só apresentação —
// dados, handlers e permissões vêm da página (ClientOrders.tsx).
import type { ReactNode } from "react";
import { Pencil, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ClientOrderDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Migalha por cima do título ("Armazém › Saídas para clientes"). */
  crumbs: string;
  title: ReactNode;
  badges?: ReactNode;
  /** À esquerda do fechar (menu ⋯). */
  topActions?: ReactNode;
  /** Grelha de dados por baixo do título (ClientOrderInfoGrid). */
  info?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function ClientOrderDetailSheet({
  open,
  onOpenChange,
  crumbs,
  title,
  badges,
  topActions,
  info,
  footer,
  children,
}: ClientOrderDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[min(1000px,100vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none [&>button.absolute]:hidden"
      >
        <div className="border-b bg-card px-5 pt-4 max-sm:px-3.5 max-sm:pt-3">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0">
              <SheetDescription className="mb-0.5 text-[12.5px] text-muted-foreground">{crumbs}</SheetDescription>
              <SheetTitle className="font-mono text-xl font-bold leading-tight">{title}</SheetTitle>
              {badges ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {topActions}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {info}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 max-sm:px-3.5 max-sm:py-3">
          <div className="flex flex-col gap-3">{children}</div>
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-5 py-3 max-sm:px-3.5">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export interface ClientOrderInfoItem {
  label: string;
  value: ReactNode;
  /** Lápis para editar (só quando permitido). */
  onEdit?: (() => void) | null;
  editLabel?: string;
  editDisabled?: boolean;
  wide?: boolean;
}

/** Grelha de dados (.sh-info do protótipo): rótulo em maiúsculas + valor. */
export function ClientOrderInfoGrid({ items }: { items: readonly ClientOrderInfoItem[] }) {
  return (
    <dl className="my-3 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-[18px] gap-y-2.5">
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "col-span-full")}>
          <dt className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-[.03em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="flex min-w-0 items-start gap-1 text-sm">
            <span className="min-w-0 whitespace-pre-wrap break-words">{item.value}</span>
            {item.onEdit ? (
              <button
                type="button"
                onClick={item.onEdit}
                disabled={item.editDisabled}
                aria-label={item.editLabel ?? `Editar ${item.label.toLowerCase()}`}
                title={item.editLabel ?? `Editar ${item.label.toLowerCase()}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
