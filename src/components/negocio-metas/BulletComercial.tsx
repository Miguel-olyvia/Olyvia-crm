import { cn } from "@/lib/utils";
import type { EstadoMeta } from "./estadoMeta";
import { COR_PREENCHE } from "./estilosDashboard";
import { percentagem } from "./negocioMetas";

interface BulletComercialProps {
  atual: number;
  meta: number;
  estado: EstadoMeta;
}

/**
 * Bullet chart compacto: a barra é o ganho, o traço vertical é a meta. A escala
 * é 100% da meta, ou o ganho se o passar. Decorativo: o texto ao lado diz tudo.
 */
export function BulletComercial({ atual, meta, estado }: BulletComercialProps) {
  const pct = percentagem(atual, meta);
  const escala = Math.max(100, pct);
  return (
    <div aria-hidden="true" className="relative h-4 w-full rounded-sm bg-muted">
      <div
        className={cn("absolute inset-y-1 left-0 rounded-sm", COR_PREENCHE[estado])}
        style={{ width: `${(pct / escala) * 100}%` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-foreground"
        style={{ left: `calc(${(100 / escala) * 100}% - 2px)` }}
      />
    </div>
  );
}
