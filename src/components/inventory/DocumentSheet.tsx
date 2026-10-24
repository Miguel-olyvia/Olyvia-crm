// Folha lateral de um documento (Folha do protótipo prototipo-negocios/inventario,
// classes .sheet/.sh-head/.sh-info/.sh-body/.sh-foot do inventario.css) em
// shadcn + Tailwind, para as fichas reais: encomenda a fornecedor, contagem e
// guia do fornecedor. Só layout — a lógica, as permissões e os diálogos ficam
// em quem a usa.
//
// API:
//   <Sheet open onOpenChange>                      (ou <DocumentSheet …> que inclui o Root)
//     <DocumentSheetContent
//       crumbs="Compras › Encomenda a fornecedor"   migalha por cima do título
//       title="PO-0042"                              nº do documento (SheetTitle)
//       badges={<…/>}                                distintivos de estado
//       headerActions={<RowActions modal={false} …/>} o ⋯ ao lado do fechar
//       onClose={() => …}                            botão X (o X do shadcn fica escondido)
//       header={<DocInfoGrid …/>}                    grelha de dados, linha temporal, abas
//       footer={{ left: <PDF/>, right: <Ações/> }}  rodapé fixo
//       form={{ onSubmit }}                          opcional: cabeçalho+corpo+rodapé dentro de um <form>
//     >corpo</DocumentSheetContent>
//   </Sheet>
//
// Dentro da folha: DropdownMenu com modal={false}; Popover com Command com modal
// (o focus trap da folha rouba o foco aos dropdowns não modais de Popover).
import { forwardRef, useId, type ComponentPropsWithoutRef, type FormHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type ContentProps = Omit<ComponentPropsWithoutRef<typeof SheetContent>, "title" | "children">;

export interface DocumentSheetContentProps extends ContentProps {
  crumbs?: ReactNode;
  title: ReactNode;
  titleClassName?: string;
  badges?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Debaixo do título, ainda no cabeçalho (fundo do cartão): grelha, linha temporal, abas. */
  header?: ReactNode;
  footer?: { left?: ReactNode; right?: ReactNode } | null;
  /** Corpo e rodapé ficam dentro de um <form> com estes atributos (botões submit no rodapé). */
  form?: FormHTMLAttributes<HTMLFormElement>;
  bodyClassName?: string;
  children?: ReactNode;
}

export const DocumentSheetContent = forwardRef<HTMLDivElement, DocumentSheetContentProps>(function DocumentSheetContent(
  {
    crumbs,
    title,
    titleClassName,
    badges,
    headerActions,
    onClose,
    closeLabel = "Fechar",
    header,
    footer,
    form,
    bodyClassName,
    className,
    children,
    ...contentProps
  },
  ref,
) {
  const hasFooter = !!footer && (footer.left != null || footer.right != null);
  const inner = (
    <>
      <div className="border-b bg-card px-3.5 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            {crumbs ? (
              <SheetDescription className="mb-0.5 text-[12.5px] text-muted-foreground">{crumbs}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Detalhe</SheetDescription>
            )}
            <SheetTitle className={cn("break-words text-xl font-bold leading-tight", titleClassName)}>{title}</SheetTitle>
            {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {header ? <div>{header}</div> : <div className="h-3" />}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-5 sm:py-4", bodyClassName)}>
        <div className="space-y-4">{children}</div>
      </div>
      {hasFooter && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-card px-3.5 py-2.5 sm:px-5 sm:py-3">
          {footer?.left != null && <div className="mr-auto flex flex-wrap items-center gap-2">{footer.left}</div>}
          {footer?.right}
        </div>
      )}
    </>
  );
  return (
    <SheetContent
      ref={ref}
      side="right"
      {...contentProps}
      // Largura do protótipo: min(1000px, 100vw). O X do shadcn (último filho,
      // absolute) fica escondido — o cabeçalho tem o seu.
      className={cn(
        "flex w-full max-w-[1000px] flex-col gap-0 border-l p-0 sm:max-w-[1000px] [&>button.absolute]:hidden",
        className,
      )}
    >
      {form ? (
        <form {...form} className={cn("flex min-h-0 flex-1 flex-col", form.className)}>
          {inner}
        </form>
      ) : (
        inner
      )}
    </SheetContent>
  );
});

/** Root + conteúdo, para quem não precisa de SheetTrigger. */
export function DocumentSheet({
  open,
  onOpenChange,
  ...props
}: DocumentSheetContentProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DocumentSheetContent {...props} />
    </Sheet>
  );
}

/** Grelha rótulo/valor do cabeçalho (.sh-info + .lbl): rótulo em maiúsculas pequenas por cima do valor. */
export function DocInfoGrid({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: string; value: ReactNode; wide?: boolean } | null | false | undefined>;
  className?: string;
}) {
  return (
    <dl className={cn("my-3 grid gap-x-[18px] gap-y-2.5 text-sm [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]", className)}>
      {items.filter(Boolean).map((it) => {
        const item = it as { label: string; value: ReactNode; wide?: boolean };
        return (
          <div key={item.label} className={cn("min-w-0", item.wide && "col-span-full")}>
            <dt className={DOC_LABEL_CLASS}>{item.label}</dt>
            <dd className="break-words">{item.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Rótulo pequeno em maiúsculas (.lbl do protótipo). */
export const DOC_LABEL_CLASS = "mb-0.5 block text-[11.5px] font-semibold uppercase tracking-[.03em] text-muted-foreground";

/**
 * Invólucro das tabelas da folha (.tw do protótipo): borda, cantos, scroll
 * horizontal e cabeçalho com fundo muted em letra pequena.
 */
export const DOC_TABLE_WRAP_CLASS =
  "overflow-x-auto rounded-lg border bg-card [&_thead_th]:h-9 [&_thead_th]:whitespace-nowrap [&_thead_th]:bg-muted [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground";

/** Título de secção dentro do corpo da folha (h3 do protótipo). */
export function DocSection({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={cn("space-y-2", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? <h3 id={id} className="text-[15px] font-semibold">{title}</h3> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Abas da folha (.tabs/.tab do protótipo): role=tab com setas/Home/End.
 * Os painéis são do consumidor: <div role="tabpanel" id={docTabPanelId(base, id)} hidden={…}>.
 */
export function DocSheetTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  idBase,
}: {
  label: string;
  tabs: ReadonlyArray<{ id: T; label: string; count?: number; hidden?: boolean }>;
  value: T;
  onChange: (id: T) => void;
  idBase: string;
}) {
  const shown = tabs.filter((t) => !t.hidden);
  const ids = shown.map((t) => t.id);
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-0.5 overflow-x-auto px-1">
      {shown.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            id={docTabId(idBase, t.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={docTabPanelId(idBase, t.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const j =
                e.key === "ArrowRight" ? (i + 1) % ids.length
                : e.key === "ArrowLeft" ? (i - 1 + ids.length) % ids.length
                : e.key === "Home" ? 0
                : e.key === "End" ? ids.length - 1
                : -1;
              if (j < 0) return;
              e.preventDefault();
              onChange(ids[j]);
              document.getElementById(docTabId(idBase, ids[j]))?.focus();
            }}
            className={cn(
              "-mb-px inline-flex min-h-10 items-center whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const docTabId = (base: string, id: string) => `${base}-tab-${id}`;
export const docTabPanelId = (base: string, id: string) => `${base}-panel-${id}`;
