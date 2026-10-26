/**
 * O nome de quem está a ver um documento sensível, para a marca de água,
 * delegando ao hook real que lê a sessão Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useNomeParaMarcaDagua as useNomeParaMarcaDaguaReal } from "@/hooks/useNomeParaMarcaDagua";

export function useNomeParaMarcaDagua(): string {
  return useNomeParaMarcaDaguaReal();
}
