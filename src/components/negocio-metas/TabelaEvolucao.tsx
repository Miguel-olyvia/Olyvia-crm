import { useTranslation } from "@/hooks/useTranslation";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatarMeta } from "./formatoMetas";
import type { MesEvolucao } from "./negocioMetas";

/** Tabela alternativa ao gráfico de evolução (mês, ganho e meta). */
export function TabelaEvolucao({ dados }: { dados: Array<MesEvolucao & { nome: string }> }) {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("businessGoals.evolution.month")}</TableHead>
          <TableHead className="text-right">{t("businessGoals.evolution.won")}</TableHead>
          <TableHead className="text-right">{t("businessGoals.evolution.goal")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dados.map((m) => (
          <TableRow key={m.mes}>
            <TableCell>{m.nome}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatarMeta("euro", m.ganho)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatarMeta("euro", m.meta)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
