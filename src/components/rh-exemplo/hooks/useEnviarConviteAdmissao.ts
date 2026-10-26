/**
 * Enviar o convite de admissão a uma pessoa, delegando ao hook real que
 * comunica com Supabase via Edge Function.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useEnviarConviteAdmissao as useEnviarConviteAdmissaoReal } from "@/hooks/useEnviarConviteAdmissao";

export type { ResultadoConvite } from "@/hooks/useEnviarConviteAdmissao";

export function useEnviarConviteAdmissao() {
  return useEnviarConviteAdmissaoReal();
}
