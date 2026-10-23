/** As retribuições em vigor que não batem com o salário do cargo, calculadas sobre os dados de exemplo (só leitura). */
import { useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { retribuicoesDivergentes, type DivergenciaRetribuicao } from "@/components/rh-exemplo/lib/cargosDivergencias";

export type CargoRetribuicaoDivergente = DivergenciaRetribuicao;

export function useCargosRetribuicoesDivergentes(): {
  divergencias: CargoRetribuicaoDivergente[];
  isLoading: boolean;
  error: Error | null;
} {
  const fichas = useEstadoRh((e) => e.fichas);
  const cargos = useEstadoRh((e) => e.cargos);
  const periodos = useEstadoRh((e) => e.cargosPeriodos);
  const divergencias = useMemo(() => retribuicoesDivergentes(fichas, cargos, periodos, hojeIso()), [fichas, cargos, periodos]);
  return { divergencias, isLoading: false, error: null };
}
