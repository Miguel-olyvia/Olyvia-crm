import { useTranslation } from "@/hooks/useTranslation";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatarMeta } from "./formatoMetas";
import type { ProgressoMeta, TotaisComercial } from "./negocioMetas";

interface TabelaComerciaisProps {
  totais: TotaisComercial[];
  equipa: ProgressoMeta;
}

/** Tabela alternativa aos bullet charts, só para leitores de ecrã. */
export function TabelaComerciais({ totais, equipa }: TabelaComerciaisProps) {
  const { t } = useTranslation();
  const linha = (nome: string, p: ProgressoMeta, forte = false) => (
    <TableRow key={nome} className={forte ? "font-semibold" : undefined}>
      <TableCell>{nome}</TableCell>
      <TableCell className="text-right">{formatarMeta("euro", p.meta)}</TableCell>
      <TableCell className="text-right">{formatarMeta("euro", p.atual)}</TableCell>
      <TableCell className="text-right">{p.percentagem}%</TableCell>
    </TableRow>
  );
  return (
    <div className="sr-only">
      <Table>
        <TableCaption>{t("businessGoals.reps.caption")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("businessGoals.reps.name")}</TableHead>
            <TableHead className="text-right">{t("businessGoals.reps.goal")}</TableHead>
            <TableHead className="text-right">{t("businessGoals.reps.won")}</TableHead>
            <TableHead className="text-right">{t("businessGoals.reps.percent")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {totais.map((c) => linha(c.comercial, c))}
          {linha(t("businessGoals.reps.total"), equipa, true)}
        </TableBody>
      </Table>
    </div>
  );
}
