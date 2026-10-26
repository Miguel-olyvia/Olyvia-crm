/**
 * Os centros de trabalho, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useLocaisTrabalho as useLocaisTrabalhoReal } from "@/hooks/useLocaisTrabalho";

export type { DadosLocalTrabalho } from "@/hooks/useLocaisTrabalho";

export function useLocaisTrabalho(opcoes: { apenasAtivos?: boolean } = {}) {
  return useLocaisTrabalhoReal(opcoes);
}
