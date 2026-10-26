/**
 * Os lançamentos pontuais de um período de processamento salarial, delegando
 * ao hook real que lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useProcessamentoLancamentos as useProcessamentoLancamentosReal } from "@/hooks/useProcessamentoLancamentos";

export type { NovoLancamentoProcessamento, ProcessamentoLancamentos } from "@/hooks/useProcessamentoLancamentos";

export function useProcessamentoLancamentos(periodoId: string | undefined) {
  return useProcessamentoLancamentosReal(periodoId);
}
