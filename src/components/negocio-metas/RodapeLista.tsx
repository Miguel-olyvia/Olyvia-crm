import { useTranslation } from "@/hooks/useTranslation";
import { TableCell, TableFooter, TableRow } from "@/components/ui/table";
import { formatarMeta } from "./formatoMetas";
import { FASES, somaValor, type TotalFase } from "./logicaQuadro";
import type { FaseNegocio, NegocioMes } from "./negocioMetas";

interface RodapeListaProps {
  /** As linhas que a lista mostra. */
  negocios: NegocioMes[];
  /** Totais por fase com os filtros ligados, sem o de fase (a faixa não muda ao ligar uma fase). */
  totaisFase: Record<FaseNegocio, TotalFase>;
  colunas: number;
}

/** Rodapé da Lista: o total visível (negócios e valor) e a faixa de totais por fase. */
export function RodapeLista({ negocios, totaisFase, colunas }: RodapeListaProps) {
  const { t } = useTranslation();
  const valor = somaValor(negocios);
  return (
    <TableFooter>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colunas} className="px-3 py-3 text-sm">
          <p className="font-semibold text-foreground">
            {t("businessGoals.list.totalVisible")}:{" "}
            <span className="tabular-nums">
              {t("businessGoals.list.totalLine", { count: negocios.length, value: formatarMeta("euro", valor) })}
            </span>
          </p>
          <ul aria-label={t("businessGoals.list.byPhase")} className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {FASES.map((fase) => (
              <li key={fase} className="tabular-nums">
                {t("businessGoals.list.phaseTotal", {
                  phase: t(`businessGoals.phase.${fase}`),
                  count: totaisFase[fase].n,
                  value: formatarMeta("euro", totaisFase[fase].valor),
                })}
              </li>
            ))}
          </ul>
        </TableCell>
      </TableRow>
    </TableFooter>
  );
}
