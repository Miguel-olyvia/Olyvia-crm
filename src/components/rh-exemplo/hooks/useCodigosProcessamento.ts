/**
 * O catálogo de códigos de processamento salarial, delegando ao hook real que
 * lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCodigosProcessamento as useCodigosProcessamentoReal } from "@/hooks/useCodigosProcessamento";

export type {
  NovoCodigoProcessamento,
  CamposCodigoProcessamento,
} from "@/hooks/useCodigosProcessamento";

export function useCodigosProcessamento() {
  return useCodigosProcessamentoReal();
}
