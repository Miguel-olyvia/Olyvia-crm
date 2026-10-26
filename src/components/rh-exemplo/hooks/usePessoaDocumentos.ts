/**
 * Os documentos de RH de uma pessoa, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import {
  usePessoaDocumentos as usePessoaDocumentosReal,
  type UsePessoaDocumentosResult,
  type UrlFicheiroDocumento,
} from "@/hooks/usePessoaDocumentos";

export type { UsePessoaDocumentosResult, UrlFicheiroDocumento };

export function usePessoaDocumentos(
  pessoaId: string | undefined,
  podeVerModelos: boolean,
): UsePessoaDocumentosResult {
  return usePessoaDocumentosReal(pessoaId, podeVerModelos);
}
