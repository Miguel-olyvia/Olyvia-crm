/** Os documentos de RH de uma pessoa de exemplo (emitir, assinar, anexar), em memoria. */
import { useCallback, useMemo } from "react";
import { atualizarFicha, lerEstado, novoId, useEstadoRh, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { urlDeExemplo } from "@/components/rh-exemplo/lib/anexoUrl";
import type {
  PessoaDocumento,
  PessoaDocumentoModelo,
  TipoDocumentoRH,
} from "@/components/rh-exemplo/tipos";

export interface UrlFicheiroDocumento {
  url: string;
  hash: string | null;
  anexadoEm: string | null;
}

export interface UsePessoaDocumentosResult {
  documentos: PessoaDocumento[];
  modelos: PessoaDocumentoModelo[];
  loading: boolean;
  saving: boolean;
  recusado: boolean;
  recarregar: () => Promise<void>;
  emitir: (modeloId: string) => Promise<string | null>;
  criarPorUpload: (args: {
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string | null;
  }) => Promise<{ documentoId: string | null; erro: string | null }>;
  registarAssinaturaExterna: (documentoId: string) => Promise<string | null>;
  verConteudo: (documentoId: string) => Promise<string>;
  assinar: (documentoId: string) => Promise<string | null>;
  anexarFicheiro: (documentoId: string, ficheiro: File) => Promise<string | null>;
  obterUrlFicheiro: (documentoId: string) => Promise<UrlFicheiroDocumento>;
}

const SEM_DOCUMENTOS: PessoaDocumento[] = [];
const SEM_MODELOS: PessoaDocumentoModelo[] = [];
const HASH_EXEMPLO = "9f2c4b7a1d3e5f60a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1";

export function usePessoaDocumentos(pessoaId: string | undefined, podeVerModelos: boolean): UsePessoaDocumentosResult {
  const ficha = useFichaRh(pessoaId);
  const todosModelos = useEstadoRh((e) => e.modelos);
  const documentos = ficha?.documentos ?? SEM_DOCUMENTOS;
  const modelos = podeVerModelos ? todosModelos : SEM_MODELOS;

  const alterarDocumento = useCallback(
    (documentoId: string, fn: (d: PessoaDocumento) => PessoaDocumento): void => {
      if (pessoaId) {
        atualizarFicha(pessoaId, (f) => ({
          ...f,
          documentos: f.documentos.map((d) => (d.id === documentoId ? fn(d) : d)),
        }));
      }
    },
    [pessoaId],
  );

  const criar = useCallback(
    (campos: Partial<PessoaDocumento> & Pick<PessoaDocumento, "tipo" | "titulo">): string | null => {
      if (!pessoaId) return null;
      const id = novoId("doc");
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        documentos: [
          {
            id,
            pessoa_id: pessoaId,
            organization_id: f.pessoa.organization_id,
            vinculo_id: f.vinculos[0]?.id ?? null,
            modelo_id: null,
            estado: "rascunho",
            ficheiro_caminho: null,
            ficheiro_hash_sha256: null,
            ficheiro_anexado_em: null,
            emitido_em: null,
            emitido_por: null,
            assinado_em: null,
            assinatura_origem: null,
            anulado_em: null,
            anulado_motivo: null,
            created_at: new Date().toISOString(),
            ...campos,
          },
          ...f.documentos,
        ],
      }));
      return id;
    },
    [pessoaId],
  );

  const emitir = useCallback(
    async (modeloId: string): Promise<string | null> => {
      const modelo = lerEstado().modelos.find((m) => m.id === modeloId);
      if (!modelo) return "Modelo desconhecido";
      const nome = ficha?.pessoa.nome_completo ?? "";
      criar({
        tipo: modelo.tipo,
        titulo: `${modelo.nome} — ${nome}`,
        modelo_id: modelo.id,
        estado: "a_aguardar_assinatura",
        emitido_em: new Date().toISOString(),
      });
      return null;
    },
    [criar, ficha],
  );

  const criarPorUpload = useCallback(
    async (args: { tipo: TipoDocumentoRH; titulo: string; vinculoId: string | null }) => {
      const id = criar({ tipo: args.tipo, titulo: args.titulo, vinculo_id: args.vinculoId });
      return { documentoId: id, erro: null };
    },
    [criar],
  );

  const registarAssinaturaExterna = useCallback(
    async (documentoId: string): Promise<string | null> => {
      alterarDocumento(documentoId, (d) => ({
        ...d,
        estado: "assinado",
        assinado_em: new Date().toISOString(),
        assinatura_origem: "externa",
      }));
      return null;
    },
    [alterarDocumento],
  );

  const assinar = useCallback(
    async (documentoId: string): Promise<string | null> => {
      alterarDocumento(documentoId, (d) => ({
        ...d,
        estado: "assinado",
        assinado_em: new Date().toISOString(),
        assinatura_origem: "interna",
      }));
      return null;
    },
    [alterarDocumento],
  );

  const anexarFicheiro = useCallback(
    async (documentoId: string, ficheiro: File): Promise<string | null> => {
      alterarDocumento(documentoId, (d) => ({
        ...d,
        ficheiro_caminho: `exemplo/${ficheiro.name}`,
        ficheiro_hash_sha256: HASH_EXEMPLO,
        ficheiro_anexado_em: new Date().toISOString(),
      }));
      return null;
    },
    [alterarDocumento],
  );

  const verConteudo = useCallback(
    async (documentoId: string): Promise<string> => {
      const doc = documentos.find((d) => d.id === documentoId);
      const modelo = lerEstado().modelos.find((m) => m.id === doc?.modelo_id);
      return modelo?.corpo_html ?? `<h1>${doc?.titulo ?? "Documento"}</h1><p>Conteúdo de exemplo.</p>`;
    },
    [documentos],
  );

  const obterUrlFicheiro = useCallback(
    async (documentoId: string): Promise<UrlFicheiroDocumento> => {
      const doc = documentos.find((d) => d.id === documentoId);
      return {
        url: urlDeExemplo(doc?.titulo ?? "Documento"),
        hash: doc?.ficheiro_hash_sha256 ?? null,
        anexadoEm: doc?.ficheiro_anexado_em ?? null,
      };
    },
    [documentos],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return useMemo(
    () => ({
      documentos,
      modelos,
      loading: false,
      saving: false,
      recusado: false,
      recarregar,
      emitir,
      criarPorUpload,
      registarAssinaturaExterna,
      verConteudo,
      assinar,
      anexarFicheiro,
      obterUrlFicheiro,
    }),
    [documentos, modelos, recarregar, emitir, criarPorUpload, registarAssinaturaExterna, verConteudo, assinar, anexarFicheiro, obterUrlFicheiro],
  );
}
