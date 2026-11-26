/**
 * Os blocos que a ficha de um ativo repete: uma secção com título e uma lista de definições, e uma linha «rótulo: valor» que no
 * telemóvel empilha (o rótulo por cima do valor, sem scroll horizontal) e no ecrã largo fica lado a lado.
 */
import type { ReactNode } from "react";

export function Linha({ rotulo, id, children }: { rotulo: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className="min-w-0 break-words text-sm font-medium tabular-nums sm:text-right">{children}</dd>
    </div>
  );
}

export function Seccao({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <section className="space-y-1" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-semibold">{titulo}</h3>
      <dl>{children}</dl>
    </section>
  );
}
