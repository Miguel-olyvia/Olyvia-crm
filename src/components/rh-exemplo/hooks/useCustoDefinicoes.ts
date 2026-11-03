/**
 * As definicoes do custo da organizacao (taxa da empresa, seguro, valor por km e por dia), delegando ao hook real
 * (`rpc_hr_custo_definicoes_ler` / `_guardar`). Sao por organizacao: guardar muda o custo de todas as pessoas dela.
 */
import { useCustoDefinicoes as useReal } from "@/hooks/hr/useCustoDefinicoes";

export type { CustoDefinicoesHook } from "@/hooks/hr/useCustoDefinicoes";

export function useCustoDefinicoes(opcoes?: { enabled?: boolean }) {
  return useReal(opcoes);
}
