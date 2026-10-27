/**
 * Os vinculos de cada pessoa da organizacao (tipo de contrato e horas por semana), delegando ao hook real que le de
 * Supabase. Serve o filtro «Contrato» e o custo por hora previsto do ecra de Custos.
 */
import { usePessoasVinculosVigentes as usePessoasVinculosVigentesReal } from "@/hooks/usePessoasVinculosVigentes";

export { vinculoDoMes } from "@/hooks/usePessoasVinculosVigentes";
export type { VinculoLido } from "@/hooks/usePessoasVinculosVigentes";

export function usePessoasVinculosVigentes() {
  return usePessoasVinculosVigentesReal();
}
