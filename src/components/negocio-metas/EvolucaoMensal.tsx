import {
  Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TabelaEvolucao } from "./TabelaEvolucao";
import { TooltipEvolucao } from "./TooltipEvolucao";
import { FOCO } from "./estilos";
import { CARTAO, TRANSICAO } from "./estilosDashboard";
import { formatarMeta } from "./formatoMetas";
import type { MesEvolucao } from "./negocioMetas";

interface EvolucaoMensalProps {
  meses: MesEvolucao[];
}

const TEXTO_EIXO = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };
const euros = (v: number) => formatarMeta("euro", v);

function nomeDoMes(mes: string, language: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString(language, { month: "short" });
}

/** Sem animação para quem pediu movimento reduzido. */
function animar(): boolean {
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Valor ganho (barras) contra a meta mensal (linha tracejada), com tooltip, legenda e tabela. */
export function EvolucaoMensal({ meses }: EvolucaoMensalProps) {
  const { t, language } = useTranslation();
  const dados = meses.map((m) => ({ ...m, nome: nomeDoMes(m.mes, language) }));
  const rotuloGanho = t("businessGoals.evolution.won");
  const rotuloMeta = t("businessGoals.evolution.goal");
  const movimento = animar();

  return (
    <section aria-labelledby="evolucao-titulo" className="space-y-3">
      <h2 id="evolucao-titulo" className="text-lg font-semibold text-foreground">
        {t("businessGoals.evolution.title")}
      </h2>
      <div className={cn(CARTAO, "p-4")}>
        <div role="img" aria-label={t("businessGoals.evolution.chartLabel")} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="nome" tickLine={false} axisLine={false} tick={TEXTO_EIXO} />
              <YAxis
                tickLine={false} axisLine={false} tick={TEXTO_EIXO} width={64}
                tickFormatter={euros}
              />
              <Tooltip
                content={<TooltipEvolucao />}
                cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                isAnimationActive={false}
              />
              <Bar
                dataKey="ganho" name={rotuloGanho} fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]} isAnimationActive={movimento}
              >
                <LabelList
                  dataKey="ganho" position="insideTop" formatter={euros}
                  fill="hsl(var(--primary-foreground))" fontSize={10}
                />
              </Bar>
              <Line
                dataKey="meta" name={rotuloMeta} type="stepAfter" dot={false}
                stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="6 4"
                isAnimationActive={movimento}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ul
          aria-label={t("businessGoals.evolution.legend")}
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary" />
            {rotuloGanho}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-foreground" />
            {rotuloMeta}
          </li>
        </ul>
        <details className="mt-3 text-sm">
          <summary
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-md px-1 text-primary", TRANSICAO, FOCO,
            )}
          >
            {t("businessGoals.evolution.showTable")}
          </summary>
          <TabelaEvolucao dados={dados} />
        </details>
      </div>
    </section>
  );
}
