/**
 * As pendencias de admissao de uma pessoa, delegando ao hook real que le de Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import {
  useAdmissaoPendencias as useAdmissaoPendenciasReal,
  type EstadoAdmissaoPendencias,
  type Pendencia,
  type OrigemPendencia,
  type PosicaoPendencia,
} from "@/hooks/useAdmissaoPendencias";

export type { EstadoAdmissaoPendencias, Pendencia, OrigemPendencia, PosicaoPendencia };

export function useAdmissaoPendencias(pessoaId: string | null): EstadoAdmissaoPendencias {
  return useAdmissaoPendenciasReal(pessoaId);
}
