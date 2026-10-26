/**
 * As ausencias da organizacao, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useAusenciasDaOrganizacao as useAusenciasDaOrganizacaoReal } from "@/hooks/useAusenciasDaOrganizacao";

export type { OpcoesOrganizacao } from "@/hooks/useAusenciasDaOrganizacao";

export function useAusenciasDaOrganizacao(opcoes: { anoDoMapa?: number } = {}) {
  return useAusenciasDaOrganizacaoReal(opcoes);
}
