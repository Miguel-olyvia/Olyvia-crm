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

export { escolherRetribuicaoVigente } from "@/hooks/useRetribuicoesVigentesDaOrganizacao";
/** O intervalo da folha (de, ate), de um so sitio: substitui o antigo `limitesDoMes`. */
export { periodoDaFolha } from "@/lib/hr/periodoFolha";

export function useRetribuicoesVigentesDaOrganizacao(
  organizationId: string | undefined,
  ano: number,
  mes: number,
  intervalo?: { de: string; ate: string },
) {
  return useRetribuicoesVigentesDaOrganizacaoReal(organizationId, ano, mes, intervalo);
}
