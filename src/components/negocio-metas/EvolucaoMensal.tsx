import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatarMeta } from "./formatoMetas";
import type { MesEvolucao } from "./negocioMetas";

interface EvolucaoMensalProps {
  meses: MesEvolucao[];
}

function nomeDoMes(mes: string, language: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString(language, { month: "short" });
}

/** Valor ganho (barras) contra a meta mensal (linha), com tabela alternativa. */
export function EvolucaoMensal({ meses }: EvolucaoMensalProps) {
  const { t, language } = useTranslation();
  const dados = meses.map((m) => ({ ...m, nome: nomeDoMes(m.mes, language) }));
  const rotuloGanho = t("businessGoals.evolution.won");
  const rotuloMeta = t("businessGoals.evolution.goal");

  return (
    <section aria-labelledby="evolucao-titulo" className="space-y-3">
      <h2 id="evolucao-titulo" className="text-base font-semibold text-foreground">
        {t("businessGoals.evolution.title")}
      </h2>
      <div className="rounded-2xl border border-border/70 bg-card p-4">
        <div
          role="img"
          aria-label={t("businessGoals.evolution.chartLabel")}
          className="h-56 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={44}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              />
              <Bar dataKey="ganho" name={rotuloGanho} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Line
                dataKey="meta"
                name={rotuloMeta}
                type="stepAfter"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary" />
            {rotuloGanho}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 bg-warning" />
            {rotuloMeta}
          </li>
        </ul>
        <details className="mt-3 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-1 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("businessGoals.evolution.showTable")}
          </summary>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("businessGoals.evolution.month")}</TableHead>
                <TableHead className="text-right">{rotuloGanho}</TableHead>
                <TableHead className="text-right">{rotuloMeta}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.map((m) => (
                <TableRow key={m.mes}>
                  <TableCell>{m.nome}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatarMeta("euro", m.ganho)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatarMeta("euro", m.meta)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </div>
    </section>
  );
}
