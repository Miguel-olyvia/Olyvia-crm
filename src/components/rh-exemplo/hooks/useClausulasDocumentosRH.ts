/**
 * As cláusulas reutilizáveis dos modelos de documento de RH, delegando ao hook
 * real que lê/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useClausulasDocumentosRH as useClausulasDocumentosRHReal } from "@/hooks/useClausulasDocumentosRH";

export type {
  ClausulaDocumentoRH,
  NovaClausulaDocumentoRH,
  EdicaoClausulaDocumentoRH,
} from "@/hooks/useClausulasDocumentosRH";

export function useClausulasDocumentosRH() {
  return useClausulasDocumentosRHReal();
}
