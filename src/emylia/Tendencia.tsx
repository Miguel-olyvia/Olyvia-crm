// A tendência: uma coluna fina por dia (HTML e CSS), com o primeiro dia, o último e o máximo escritos por baixo. É uma imagem com resumo em texto;
// os mesmos números estão na tabela que o cartão do gráfico oferece. Sem dados mostra-se uma linha de texto, nunca um gráfico em branco.
import { cn } from "@/lib/utils";

export interface PontoTendencia { rotulo: string; n: number }

interface TendenciaProps {
  pontos: readonly PontoTendencia[];
  /** O resumo para quem usa leitor de ecrã (por exemplo "19 pessoas em 30 dias; o dia com mais entradas foi 08/10, com 2"). */
  resumo: string;
  /** O ponto com mais entradas, se quem chama já o calculou (assim não se calcula duas vezes). */
  topo?: PontoTendencia;
}

export function Tendencia({ pontos, resumo, topo: topoDado }: TendenciaProps) {
  const max = Math.max(1, ...pontos.map((p) => p.n));
  const topo = topoDado ?? pontos.reduce((a, p) => (p.n > a.n ? p : a), pontos[0] ?? { rotulo: "", n: 0 });
  return (
    <div>
      <div role="img" aria-label={resumo} className="flex h-20 items-end gap-px border-b border-border">
        {pontos.map((p) => (
          <span key={p.rotulo} title={`${p.rotulo}: ${p.n}`} className={cn("min-w-0 flex-1 rounded-t-sm", p === topo && p.n > 0 ? "bg-primary" : "bg-[hsl(220_10%_45%)]")} style={{ height: `${(100 * p.n) / max}%` }} />
        ))}
      </div>
      <p className="mt-1 flex justify-between gap-2 text-[15px] tabular-nums text-muted-foreground">
        <span>{pontos[0]?.rotulo}</span>
        {topo.n > 0 && <span className="text-center">mais: {topo.rotulo} ({topo.n})</span>}
        <span>{pontos[pontos.length - 1]?.rotulo} (hoje)</span>
      </p>
    </div>
  );
}
