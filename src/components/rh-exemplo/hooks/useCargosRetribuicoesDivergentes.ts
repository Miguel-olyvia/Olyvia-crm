/** Na apresentação as retribuições estão alinhadas com os cargos: nada diverge. */
import type { Periodicidade } from "@/components/rh-exemplo/tipos";

export interface CargoRetribuicaoDivergente {
  pessoa_id: string;
  pessoa_nome: string;
  cargo_id: string;
  cargo_nome: string;
  retribuicao_id: string;
  valor_base: number;
  periodicidade: Periodicidade;
  valido_de: string;
  esperado_valor_base: number;
  esperado_periodicidade: Periodicidade;
}

export function useCargosRetribuicoesDivergentes(): {
  divergencias: CargoRetribuicaoDivergente[];
  isLoading: boolean;
  error: Error | null;
} {
  return { divergencias: [], isLoading: false, error: null };
}
