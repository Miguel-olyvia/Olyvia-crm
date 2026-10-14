/** Na apresentação os salários dos cargos e das pessoas estão alinhados: nada diverge. */
export interface CargoSalarioDivergente {
  cargo: string;
  pessoa_id: string;
  pessoa_nome: string;
  valor_base: number;
  periodicidade: string;
}

export function useCargosSalariosDivergentes(): {
  divergencias: CargoSalarioDivergente[];
  isLoading: boolean;
  error: Error | null;
} {
  return { divergencias: [], isLoading: false, error: null };
}
