/** A folha (periodo) que CONTEM um dia, pelas regras em vigor: o mes do fecho e o intervalo. Uma falta a 25/10 com inicio a 22 cai na folha de NOVEMBRO (22/10 a 21/11). */
import { useMemo } from "react";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { periodoDoDia, type PeriodoDoDia } from "@/lib/hr/periodoFolha";

export function usePeriodoDoDia(dia: string): PeriodoDoDia {
  const { regras } = usePeriodoFolhaRegras();
  return useMemo(() => periodoDoDia(dia, regras), [dia, regras]);
}