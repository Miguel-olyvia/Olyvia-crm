/**
 * Os vinculos de cada pessoa da organizacao (tipo de contrato e horas por semana), delegando ao hook real que le de
 * Supabase. Serve o filtro «Contrato» e o custo por hora previsto do ecra de Custos.
 */
import { usePessoasVinculosVigentes as usePessoasVinculosVigentesReal } from "@/hooks/usePessoasVinculosVigentes";

export { vinculoDoMes, vinculoContinuoDoPeriodo } from "@/hooks/usePessoasVinculosVigentes";
export type { VinculoLido } from "@/hooks/usePessoasVinculosVigentes";

/** `enabled` falso (omissao: ligado) nao le nada; `carregado` diz que a leitura terminou. */
export function usePessoasVinculosVigentes(enabled = true) {
  return usePessoasVinculosVigentesReal(enabled);
}
