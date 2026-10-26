/**
 * Os ficheiros anexados ao convite de admissão, delegando ao hook real que
 * comunica com Supabase via Edge Function.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useConviteAnexos as useConviteAnexosReal } from "@/hooks/useConviteAnexos";
import type { AnexoConvite } from "@/lib/hr/conviteAnexos";

export type {
  FaseEnvio,
  EnvioAnexo,
  ContagemAnexos,
  ResultadoConviteAnexos,
} from "@/hooks/useConviteAnexos";

export function useConviteAnexos(
  token: string | undefined,
  iniciais?: AnexoConvite[],
) {
  return useConviteAnexosReal(token, iniciais);
}
