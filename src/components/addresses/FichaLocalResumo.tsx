import { cn } from "@/lib/utils";
import {
  linhasResumoFichaLocal,
  type FichaTecnicaEdificio,
} from "@/lib/addresses/fichaTecnicaEdificio";

interface FichaLocalResumoProps {
  ficha: Partial<FichaTecnicaEdificio> | null | undefined;
  /** Andar da morada (entra no "3º de 5" do exterior). */
  piso?: string | null;
  className?: string;
  /** Mostrado quando a ficha está vazia; sem ele não se mostra nada. */
  vazio?: string;
}

/**
 * Resumo da ficha do local em duas linhas (só as secções com dados):
 *   Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1
 *   Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada
 * Usado na ficha do cliente e no orçamento.
 */
export const FichaLocalResumo = ({ ficha, piso, className, vazio }: FichaLocalResumoProps) => {
  const linhas = linhasResumoFichaLocal(ficha, piso);
  if (linhas.length === 0) {
    return vazio ? <p className={cn("text-xs text-muted-foreground", className)}>{vazio}</p> : null;
  }
  return (
    <div className={cn("space-y-0.5 text-xs text-muted-foreground", className)}>
      {linhas.map((l) => (
        <p key={l.seccao} className="break-words" data-seccao={l.seccao}>
          <span className="font-medium text-foreground/80">{l.rotulo}:</span> {l.texto}
        </p>
      ))}
    </div>
  );
};
