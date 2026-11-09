/**
 * Os documentos de RH de uma pessoa, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import {
  usePessoaDocumentos as usePessoaDocumentosReal,
  type UsePessoaDocumentosResult,
  type UsePessoaDocumentosCompleto,
  type DocumentoOcultado,
  type UrlFicheiroDocumento,
} from "@/hooks/usePessoaDocumentos";

export type { UsePessoaDocumentosResult, UsePessoaDocumentosCompleto, DocumentoOcultado, UrlFicheiroDocumento };

export function usePessoaDocumentos(
  pessoaId: string | undefined,
  podeVerModelos: boolean,
): UsePessoaDocumentosCompleto {
  return usePessoaDocumentosReal(pessoaId, podeVerModelos);
}
