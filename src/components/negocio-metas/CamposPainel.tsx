import type { ReactNode } from "react";

/** Uma lista de campos do painel: rótulo e valor, linha a linha. */
export function ListaCampos({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>;
}

/** Um campo: o rótulo à esquerda e o valor à direita, sempre em texto. */
export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-2 sm:grid-cols-[9rem_1fr] border-b border-border py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Um título de secção dentro de um separador. */
export function TituloPainel({ id, children }: { id: string; children: ReactNode }) {
  return <h3 id={id} className="text-sm font-semibold text-foreground">{children}</h3>;
}
