/**
 * As excecoes de taxa por pessoa, delegando ao hook real (`rpc_hr_custo_excecoes_listar` / `rpc_hr_custo_excecao_definir`).
 */
import { useCustoExcecoes as useReal } from "@/hooks/hr/useCustoExcecoes";

export type { CustoExcecoesHook } from "@/hooks/hr/useCustoExcecoes";

export function useCustoExcecoes(opcoes?: { enabled?: boolean }) {
  return useReal(opcoes);
}
