// Uma lista de campos de uma ficha: rótulo à esquerda e valor à direita (uma só coluna abaixo de sm), 15 px, linhas compactas
// com uma linha fina entre elas (a última sem). Este ficheiro não importa de pessoas nem de negocio-metas.
import type { ReactNode } from "react";

export function ListaCampos({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>;
}

export function LinhaCampo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid min-h-10 grid-cols-1 items-center gap-x-4 gap-y-0.5 border-b border-border py-1.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-[15px] text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-[15px] text-foreground">{children}</dd>
    </div>
  );
}
