/**
 * A posição de cada campo da admissão (convite, ficha ou opcional) para o painel «Nova pessoa», delegando ao hook real
 * (`rpc_hr_admissao_posicoes_campos`). Devolve também os estados «a carregar» e «sem acesso», que o painel diz por escrito.
 */
import { useAdmissaoPosicoesCampos as useAdmissaoPosicoesCamposReal } from "@/hooks/useAdmissaoPosicoesCampos";

export type { EstadoAdmissaoPosicoes } from "@/hooks/useAdmissaoPosicoesCampos";

export function useAdmissaoPosicoesCampos(enabled = true) {
  return useAdmissaoPosicoesCamposReal(enabled);
}
