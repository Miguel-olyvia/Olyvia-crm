/**
 * Os equipamentos das pessoas e as escritas (atribuir, devolver, alterar a conta), delegando aos hooks reais
 * (`rpc_hr_equipamentos_listar`, `rpc_hr_equipamento_atribuir/devolver/alterar_conta`).
 */
import { useEquipamentosCusto as useReal, useEquipamentosCustoAcoes as useAcoesReal } from "@/hooks/hr/useEquipamentosCusto";

export type {
  CorrecaoEquipamento, EquipamentosCustoAcoes, EquipamentosCustoHook, NovoEquipamentoBase, ResultadoAtribuir, ResultadoCorrecao,
} from "@/hooks/hr/useEquipamentosCusto";
export type { ResultadoCusto } from "@/lib/hr/custoBase";

export function useEquipamentosCusto(opcoes?: { pessoaId?: string | null; enabled?: boolean }) {
  return useReal(opcoes);
}

/** So as escritas (sem pedir a lista). */
export function useEquipamentosCustoAcoes() {
  return useAcoesReal();
}
