import { cn } from "@/lib/utils";
import {
  linhasResumoFichaLocal,
  type FichaTecnicaEdificio,
} from "@/lib/addresses/fichaTecnicaEdificio";
import { resumoExtra, type FichaCombinada, type ValoresExtra } from "@/lib/campos/definicoes";

interface FichaLocalResumoProps {
  ficha: Partial<FichaTecnicaEdificio> | null | undefined;
  /** Andar da morada (entra no "3º de 5" do exterior). */
  piso?: string | null;
  className?: string;
  /** Mostrado quando a ficha está vazia; sem ele não se mostra nada. */
  vazio?: string;
  /** Configuração da empresa (ficha "local"): esconde campos e dá os rótulos dos campos da empresa. */
  config?: FichaCombinada;
  /** Valores dos campos da empresa nesta morada. */
  extra?: ValoresExtra | null;
}

/**
 * Resumo da ficha do local em duas linhas (só as secções com dados):
 *   Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1
 *   Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada
 * e, com campos da empresa preenchidos, uma terceira:
 *   Outros: Horário: Manhã · Exige credenciação
 * Usado na ficha do cliente e no orçamento.
 */
export const FichaLocalResumo = ({ ficha, piso, className, vazio, config, extra }: FichaLocalResumoProps) => {
  const ocultar = config ? new Set(config.todos.filter((d) => d.sistema && !d.ativo).map((d) => d.chave)) : undefined;
  const linhas: { seccao: string; rotulo: string; texto: string }[] = linhasResumoFichaLocal(ficha, piso, ocultar);
  const outros = config ? resumoExtra(config.extra, extra) : null;
  if (outros) linhas.push({ seccao: "outros", rotulo: "Outros", texto: outros });
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
