// A caixa de um gráfico: título, o número em texto, o gráfico, e um botão "Ver como tabela" (aria-expanded) que mostra os mesmos números em tabela.
// Sem dados diz-se, em vez de mostrar um gráfico em branco. Sem cartões dentro de cartões: o gráfico e a tabela ficam soltos dentro desta caixa.
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CaixaProps {
  titulo: string;
  /** O número principal em texto (por exemplo "21 pessoas"). */
  numero: string;
  /** Sem dados: a frase que ocupa o lugar do gráfico. */
  vazio?: string;
  grafico: ReactNode;
  tabela: ReactNode;
  className?: string;
}

export function CaixaGrafico({ titulo, numero, vazio, grafico, tabela, className }: CaixaProps) {
  const id = useId(), [aberta, setAberta] = useState(false);
  return (
    <section aria-labelledby={`${id}-t`} className={cn("min-w-0 rounded-xl border border-border bg-card p-4", className)}>
      <h3 id={`${id}-t`} className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {numero ? <p className="mt-0.5 text-[15px] tabular-nums text-muted-foreground">{numero}</p> : null}
      <div className="mt-3">{vazio ? <p className="text-[15px] text-muted-foreground">{vazio}</p> : grafico}</div>
      {!vazio && (
        <div className="mt-2">
          <button type="button" aria-expanded={aberta} aria-controls={`${id}-tab`} onClick={() => setAberta((v) => !v)}
            className="min-h-11 cursor-pointer rounded-md px-2 text-[15px] font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Ver como tabela
          </button>
          <div id={`${id}-tab`} hidden={!aberta} className="mt-1">{aberta && tabela}</div>
        </div>
      )}
    </section>
  );
}
