/**
 * O envio de um ficheiro pelo RH para a ficha de uma pessoa, delegando ao hook
 * real que lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useAnexarAnexoRh as useAnexarAnexoRhReal } from "@/hooks/useAnexarAnexoRh";

export type { FaseEnvioRh, EnvioAnexoRh, ResultadoEnvioRh, ResultadoAnexarAnexoRh } from "@/hooks/useAnexarAnexoRh";

export function useAnexarAnexoRh() {
  return useAnexarAnexoRhReal();
}
