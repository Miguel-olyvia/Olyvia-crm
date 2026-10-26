/**
 * O URL assinado da fotografia da pessoa,
 * delegando ao hook real que le de Supabase.
 */
import { usePessoaFotografia as useReal } from "@/hooks/usePessoaFotografia";

export function usePessoaFotografia(fotografiaAnexoId: string | null | undefined): string | null {
  return useReal(fotografiaAnexoId);
}
