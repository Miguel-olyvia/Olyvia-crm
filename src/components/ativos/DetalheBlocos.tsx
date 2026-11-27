/**
 * Os blocos que a ficha de um ativo repete: uma secção (caixa com título e uma lista de definições), uma linha «rótulo: valor» que no
 * telemóvel empilha (o rótulo por cima do valor, sem scroll horizontal) e no ecrã largo fica lado a lado, e um número de destaque
 * (rótulo pequeno por cima do valor) para as grelhas de números.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** O título pequeno, em maiúsculas, das secções da ficha. */
export const TITULO_SECCAO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

export function Linha({ rotulo, id, children }: { rotulo: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className="min-w-0 break-words text-sm font-semibold tabular-nums sm:text-right">{children}</dd>
    </div>
  );
}

/** Um número de destaque numa grelha: o rótulo por cima, o valor por baixo. */
export function Dado({ rotulo, id, children }: { rotulo: string; id: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className="mt-0.5 break-words text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function Seccao({ titulo, children, id, className }: { titulo: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)} aria-labelledby={id}>
      <h3 id={id} className={TITULO_SECCAO}>{titulo}</h3>
      <dl className="mt-2">{children}</dl>
    </section>
  );
}
