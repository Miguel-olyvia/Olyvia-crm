import { useTranslation } from "@/hooks/useTranslation";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarraMeta } from "./BarraMeta";
import { formatarMeta } from "./formatoMetas";
import type { TotaisComercial } from "./negocioMetas";

interface MetasComerciaisProps {
  totais: TotaisComercial[];
}

/** Tabela de metas por comercial: meta, ganho, percentagem e barra. */
export function MetasComerciais({ totais }: MetasComerciaisProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="metas-comerciais-titulo" className="space-y-3">
      <h2 id="metas-comerciais-titulo" className="text-base font-semibold text-foreground">
        {t("businessGoals.reps.title")}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <Table>
          <TableCaption className="sr-only">{t("businessGoals.reps.caption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("businessGoals.reps.name")}</TableHead>
              <TableHead className="text-right">{t("businessGoals.reps.goal")}</TableHead>
              <TableHead className="text-right">{t("businessGoals.reps.won")}</TableHead>
              <TableHead className="text-right">{t("businessGoals.reps.percent")}</TableHead>
              <TableHead className="min-w-32">{t("businessGoals.reps.progress")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totais.map((c) => (
              <TableRow key={c.comercial}>
                <TableCell className="font-medium">{c.comercial}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatarMeta("euro", c.meta)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatarMeta("euro", c.atual)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  {c.percentagem}%
                </TableCell>
                <TableCell>
                  <BarraMeta
                    atual={c.atual}
                    meta={c.meta}
                    rotulo={`${c.comercial}: ${c.percentagem}%`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
