/**
 * As retribuições vigentes de toda a organização para um mês, delegando ao
 * hook real que lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useRetribuicoesVigentesDaOrganizacao as useRetribuicoesVigentesDaOrganizacaoReal } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";

export type {
  RetribuicaoVigenteLinha,
  RetribuicaoVigenteResultado,
} from "@/hooks/useRetribuicoesVigentesDaOrganizacao";

export { limitesDoMes, escolherRetribuicaoVigente } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";

export function useRetribuicoesVigentesDaOrganizacao(
  organizationId: string | undefined,
  ano: number,
  mes: number,
) {
  return useRetribuicoesVigentesDaOrganizacaoReal(organizationId, ano, mes);
}
