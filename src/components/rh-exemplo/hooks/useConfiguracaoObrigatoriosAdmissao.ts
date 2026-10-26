/**
 * A configuração dos campos da admissão, delegando ao hook real que lê/escreve
 * em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useConfiguracaoObrigatoriosAdmissao as useConfiguracaoObrigatoriosAdmissaoReal } from "@/hooks/useConfiguracaoObrigatoriosAdmissao";

export type { ConfiguracaoCampo, PosicaoCampoPessoa } from "@/hooks/useConfiguracaoObrigatoriosAdmissao";
export { normalizarLinhaConfiguracao } from "@/hooks/useConfiguracaoObrigatoriosAdmissao";

export function useConfiguracaoObrigatoriosAdmissao() {
  return useConfiguracaoObrigatoriosAdmissaoReal();
}
