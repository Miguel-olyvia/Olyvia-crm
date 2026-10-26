/**
 * O fim de contrato de um vinculo: regra, renovacoes, avisos e as acoes,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaContratoFim as useReal } from "@/hooks/usePessoaContratoFim";

export type { ExcepcaoContrato, ResultadoAccao } from "@/hooks/usePessoaContratoFim";

export function usePessoaContratoFim(vinculoId: string | null, organizationId: string, onMudou?: () => void) {
  return useReal(vinculoId, organizationId, onMudou);
}
