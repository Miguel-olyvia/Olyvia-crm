/**
 * Mantém a data de fim de um contrato a termo certo coerente com a duração em
 * meses, delegando ao hook real.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useFimDoContratoPorMeses as useFimDoContratoPorMesesReal } from "@/hooks/useFimDoContratoPorMeses";

export { mesesDoTexto, mesesDaDataFim } from "@/hooks/useFimDoContratoPorMeses";

import type { TipoContrato } from "@/types/hr";

interface Parametros {
  tipoContrato: TipoContrato | "";
  inicioEfectivo: string;
  duracaoMeses: string;
  dataFim: string;
  onDataFim: (dataFim: string) => void;
}

export function useFimDoContratoPorMeses(params: Parametros): void {
  return useFimDoContratoPorMesesReal(params);
}
