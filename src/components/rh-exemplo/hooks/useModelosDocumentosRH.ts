/**
 * Os modelos de documento de RH, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useModelosDocumentosRH as useModelosDocumentosRHReal } from "@/hooks/useModelosDocumentosRH";

export type {
  ModeloDocumentoRH,
  NovoModeloDocumentoRH,
  EdicaoModeloDocumentoRH,
} from "@/hooks/useModelosDocumentosRH";

export function useModelosDocumentosRH() {
  return useModelosDocumentosRHReal();
}
