// Uma secção de uma ficha: linha fina por cima, título de 16 px (e, ao lado, uma marca como "exemplo") e o conteúdo.
// Entre secções, o espaço é do contentor (`space-y-6`). O título liga-se à secção por `aria-labelledby`. Este ficheiro não
// importa de pessoas nem de negocio-metas.
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SeccaoProps {
  titulo: string;
  /** Uma marca ao lado do título (por exemplo "exemplo"). */
  marca?: ReactNode;
  /** O nível do título (3 por defeito; 4 dentro de outra secção). */
  nivel?: 3 | 4;
  className?: string;
  children: ReactNode;
}

export function Seccao({ titulo, marca, nivel = 3, className, children }: SeccaoProps) {
  const id = useId();
  const Titulo = nivel === 4 ? "h4" : "h3";
  return (
    <section aria-labelledby={id} className={cn("space-y-3 border-t border-border pt-5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Titulo id={id} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">{titulo}</Titulo>
        {marca}
      </div>
      {children}
    </section>
  );
}
