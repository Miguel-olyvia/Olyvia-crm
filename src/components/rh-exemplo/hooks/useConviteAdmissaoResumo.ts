/**
 * O estado do convite de admissão de uma pessoa, delegando ao hook real que
 * lê em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useConviteAdmissaoResumo as useConviteAdmissaoResumoReal } from "@/hooks/useConviteAdmissaoResumo";

export type {
  RecusaConvite,
  ResumoConvite,
  ConflitoConvite,
  EstadoConviteResumo,
} from "@/hooks/useConviteAdmissaoResumo";

export function useConviteAdmissaoResumo(pessoaId: string | null) {
  return useConviteAdmissaoResumoReal(pessoaId);
}
