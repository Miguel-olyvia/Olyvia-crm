/**
 * As permissões de assiduidade resolvidas num sítio só, delegando ao hook real
 * que lê permissões de Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { usePermissoesAssiduidade as usePermissoesAssiduidadeReal } from "@/hooks/usePermissoesAssiduidade";

export function usePermissoesAssiduidade() {
  return usePermissoesAssiduidadeReal();
}
