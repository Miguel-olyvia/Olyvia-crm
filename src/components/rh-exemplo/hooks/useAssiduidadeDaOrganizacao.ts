/**
 * O mes de assiduidade da organizacao, delegando ao hook real que le de Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import {
  useAssiduidadeDaOrganizacao as useAssiduidadeDaOrganizacaoReal,
  chaveCelula as chaveCelulaReal,
  type CelulaDoDia,
} from "@/hooks/useAssiduidadeDaOrganizacao";

export type { CelulaDoDia };
export const chaveCelula = chaveCelulaReal;

export function useAssiduidadeDaOrganizacao(janela: { de: string; ate: string }) {
  return useAssiduidadeDaOrganizacaoReal(janela);
}
