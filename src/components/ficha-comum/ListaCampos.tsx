// Uma lista de campos de uma ficha: rótulo à esquerda e valor à direita (uma só coluna abaixo de sm), 15 px, sem divisória
// por linha. Este ficheiro não importa de pessoas nem de negocio-metas.
import type { ReactNode } from "react";

export function ListaCampos({ children }: { children: ReactNode }) {
  return <dl className="space-y-0.5">{children}</dl>;
}

export function LinhaCampo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-[15px] text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-[15px] text-foreground">{children}</dd>
    </div>
  );
}
