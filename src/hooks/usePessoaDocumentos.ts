/**
 * Os documentos de UMA pessoa: contratos, adendas e declaracoes emitidos a
 * partir de um modelo, mais o essencial para os assinar.
 *
 * SO METADADOS AQUI DENTRO -- MESMO O DE FICHEIRO
 * --------------------------------------------------
 * A lista carrega `pessoas_documentos` sem `corpo_html`: essa coluna continua
 * fechada por GRANT (migration 20261123030000) e pedi-la faria o PostgREST
 * recusar o select inteiro. O conteudo em claro so vem, um documento de cada
 * vez, por `rpc_hr_documento_ver_conteudo` -- o mesmo padrao do NISS em
 * `usePessoa.ts`. NUNCA se guarda esse conteudo em estado que sobreviva ao
 * dialogo que o mostra.
 *
 * `ficheiro_caminho`/`ficheiro_hash_sha256`/`ficheiro_anexado_em` JA vem na
 * lista (GRANT de metadados desde 20261130065000) -- e o que permite mostrar
 * "resumo guardado" sem pedir nada mais. Mas o CONTEUDO do ficheiro (os
 * bytes) nunca vem por aqui nem por RPC nenhuma: so por um URL assinado de
 * curta duracao, pedido a `hr-documento-ficheiro-url` (`obterUrlFicheiro`),
 * que audita antes de o emitir -- SQL nao fala com o Storage.
 *
 * A EMISSAO, A ASSINATURA E O ANEXO NAO SAO INSERT/UPDATE DIRECTOS
 * ---------------------------------------------------------------------
 * `pessoas_documentos` bloqueia INSERT/UPDATE/DELETE directos a
 * `authenticated` -- a unica escrita e pelas RPCs `SECURITY DEFINER`
 * `rpc_hr_documento_emitir` e `rpc_hr_documento_assinar`, mais
 * `rpc_hr_documento_anexar_ficheiro` (chamada de dentro de `validate-upload`,
 * nunca directamente -- essa RPC nao tem EXECUTE para `authenticated`). Uma
 * linha `assinado` e imutavel mesmo por essas vias: anexar so e aceite com o
 * documento em `a_aguardar_assinatura`.
 *
 * SEGUE O PADRAO DE `useAusenciasDaPessoa`
 * -----------------------------------------
 * Recusa por permissao (`isPermissionError`) e a resposta CORRECTA e fica
 * silenciosa para o Sentry -- o ecra esconde o bloco. Qualquer outra falha vai
 * por `captureFlowError`.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage, getLocalizedFallback } from "@/utils/friendlyError";
import { getUploadErrorMessage, resolveValidateUploadErrorMessage, parseValidateUploadResponse } from "@/lib/uploadErrors";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { chaveErroDocumento, comRepeticaoPorDeadlock, motivoParaEnvio, razaoMotivoInvalido } from "@/lib/hr/documentoMotivo";
import type { PessoaDocumento, PessoaDocumentoModelo, TipoDocumentoRH } from "@/types/hr";

const COLUNAS_DOCUMENTO =
  "id, pessoa_id, organization_id, vinculo_id, modelo_id, tipo, titulo, estado, " +
  "ficheiro_caminho, ficheiro_hash_sha256, ficheiro_anexado_em, " +
  "emitido_em, emitido_por, assinado_em, assinatura_origem, anulado_em, anulado_motivo, created_at";

/** O resultado de `hr-documento-ficheiro-url`: o URL so vive o tempo do dialogo que o abre. */
export interface UrlFicheiroDocumento {
  url: string;
  hash: string | null;
  anexadoEm: string | null;
}

// corpo_html incluido para a pre-visualizacao (com DADOS_EXEMPLO_RH, nunca a
// pessoa real) no dialogo de inserir documento -- o GRANT de
// pessoas_documentos_modelos e por TABELA, sem restricao de coluna
// (20261123020000), por isso pedir esta coluna aqui nao muda a RLS nenhuma.
const COLUNAS_MODELO = "id, organization_id, nome, tipo, corpo_html, variaveis, activo";

/**
 * Extensoes que a politica de storage de hr-documentos-quarantine
 * (20261130055000) e validate-upload (deteccao por assinatura binaria)
 * aceitam -- so estas 3, nunca a lista maior de DocumentsTab. Um tipo fora
 * desta lista e rejeitado aqui, ANTES de gastar um upload que o servidor ia
 * recusar de qualquer forma.
 */
const HR_DOCUMENTO_EXTENSAO_POR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const HR_DOCUMENTO_EXTENSOES_PERMITIDAS = ["pdf", "jpg", "jpeg", "png"];
/** Mesmo tecto do bucket hr-documentos-quarantine (20261130055000). */
const HR_DOCUMENTO_TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

export function extensaoHrDocumento(ficheiro: File): string | null {
  const porMime = HR_DOCUMENTO_EXTENSAO_POR_MIME[ficheiro.type];
  if (porMime) return porMime;
  const bruta = ficheiro.name.split(".").pop()?.toLowerCase() ?? "";
  return HR_DOCUMENTO_EXTENSOES_PERMITIDAS.includes(bruta) ? bruta : null;
}

/** O valor de `accept` do input de ficheiro: as mesmas extensoes que o servidor aceita. */
export const HR_DOCUMENTO_ACCEPT = HR_DOCUMENTO_EXTENSOES_PERMITIDAS.map((e) => `.${e}`).join(",");

/** Valida tamanho e tipo ANTES de gastar um upload. Devolve a mensagem traduzida, ou `null` se o ficheiro serve. */
export function validarFicheiroHr(ficheiro: File): string | null {
  if (ficheiro.size > HR_DOCUMENTO_TAMANHO_MAXIMO_BYTES) {
    return getLocalizedFallback("hr.documentos.ficheiroDemasiadoGrande");
  }
  if (!extensaoHrDocumento(ficheiro)) {
    return getLocalizedFallback("hr.documentos.tipoFicheiroInvalido");
  }
  return null;
}

/**
 * So o upload para `hr-documentos-quarantine`, no caminho ja montado pelo chamador
 * (<organization_id>/<pessoa_id>/<documento_id>/<uuid>.<ext>). Nao cria nem liga registo nenhum.
 * Devolve a mensagem de erro traduzida, ou `null` em sucesso.
 */
export async function subirParaQuarentenaHr(caminho: string, ficheiro: File): Promise<string | null> {
  const { error } = await supabase.storage.from("hr-documentos-quarantine").upload(caminho, ficheiro);
  return error ? await getUploadErrorMessage(error) : null;
}

/**
 * Sobe o ficheiro para a quarentena e liga-o ao documento via `validate-upload` (o UNICO caminho de escrita).
 * Nao recarrega listas nem mexe em estado: quem chama decide. Devolve a mensagem de erro, ou `null` em sucesso.
 * Partilhado por `anexarFicheiro` (separador Documentos) e pelo envio com ficheiro novo do portal.
 */
export async function subirFicheiroParaDocumento(
  documento: { id: string; pessoa_id: string; organization_id: string },
  ficheiro: File,
): Promise<string | null> {
  const invalido = validarFicheiroHr(ficheiro);
  if (invalido) return invalido;
  const extensao = extensaoHrDocumento(ficheiro);
  try {
    // Caminho IMPOSTO por politica (20261130055000):
    // <organization_id>/<pessoa_id>/<documento_id>/<uuid_minusculo>.<ext>
    const caminho =
      `${documento.organization_id}/${documento.pessoa_id}/${documento.id}/` +
      `${crypto.randomUUID()}.${extensao}`;

    const erroUpload = await subirParaQuarentenaHr(caminho, ficheiro);
    if (erroUpload) return erroUpload;

    const { data: dadosValidacao, error: erroValidacao } = await supabase.functions.invoke(
      "validate-upload",
      {
        body: {
          quarantineBucket: "hr-documentos-quarantine",
          finalBucket: "hr-documentos",
          path: caminho,
        },
      },
    );
    const resultadoValidacao = parseValidateUploadResponse(dadosValidacao);
    if (erroValidacao || !resultadoValidacao.ok) {
      return await resolveValidateUploadErrorMessage(resultadoValidacao, erroValidacao);
    }
    return null;
  } catch (e) {
    if (!isPermissionError(e)) captureFlowError(e, "hr-documentos-anexar-ficheiro");
    return await getFriendlyErrorMessage(e);
  }
}

/**
 * Um documento ocultado, como o devolve `rpc_hr_documentos_ocultados` (20270111810000): so descritivos e a ultima ocultacao.
 * NUNCA o texto nem o caminho do ficheiro -- para ver o conteudo de um oculto repoe-se primeiro.
 */
export interface DocumentoOcultado {
  documento_id: string;
  tipo: TipoDocumentoRH;
  titulo: string;
  estado: string;
  emitido_em: string | null;
  assinado_em: string | null;
  entregue_em: string | null;
  anulado_em: string | null;
  tem_ficheiro: boolean;
  ocultado_em: string | null;
  ocultado_por: string | null;
  ocultado_por_nome: string | null;
  ocultado_motivo: string | null;
}

/** Anular, ocultar e repor: o documento e o motivo (3 a 2000 caracteres). Devolve a mensagem de erro traduzida, ou `null` em sucesso. */
export type AccaoComMotivoDocumento = (documentoId: string, motivo: string) => Promise<string | null>;

/** O erro de uma RPC de documentos em texto: o conhecido (HRA31/37/38/62, permissao) traduzido, o resto pelo texto amigavel geral. */
async function mensagemErroDocumento(e: unknown): Promise<string> {
  const chave = chaveErroDocumento(e);
  return chave ? getLocalizedFallback(chave) : await getFriendlyErrorMessage(e);
}

export interface UsePessoaDocumentosResult {
  documentos: PessoaDocumento[];
  /** So preenchido quando `podeVerModelos` -- quem so pode ver os proprios
   *  documentos nunca precisa da lista de modelos. */
  modelos: PessoaDocumentoModelo[];
  loading: boolean;
  saving: boolean;
  /** Distingue "sem documentos" de "sem permissao de ver" -- ver `SemAcessoCard`. */
  recusado: boolean;
  recarregar: () => Promise<void>;
  emitir: (modeloId: string) => Promise<string | null>;
  /**
   * O segundo caminho de criar um documento (20261201070000): sem modelo,
   * para um contrato ja assinado em papel fora do sistema. Nasce
   * `a_aguardar_assinatura`, tal como `emitir` -- o ficheiro anexa-se a
   * seguir por `anexarFicheiro`, o MESMO caminho que a emissao por modelo ja
   * usa. Ao contrario dos outros metodos de escrita deste hook, devolve o id
   * do documento novo (quem chama precisa dele para o passo seguinte de
   * anexar o ficheiro) em vez de so `string | null` de erro.
   */
  criarPorUpload: (args: {
    tipo: TipoDocumentoRH;
    titulo: string;
    vinculoId: string | null;
  }) => Promise<{ documentoId: string | null; erro: string | null }>;
  /**
   * Fecha o caminho externo: so aceita quando o ficheiro JA esta anexado.
   * `assinado_por_auth_uid` fica NULL na base -- ninguem assinou dentro da
   * app. Devolve uma mensagem de erro amigavel, ou `null` em sucesso.
   */
  registarAssinaturaExterna: (documentoId: string) => Promise<string | null>;
  /** O conteudo em claro, uma vez. Lanca em erro -- quem chama mostra a mensagem. */
  verConteudo: (documentoId: string) => Promise<string>;
  assinar: (documentoId: string) => Promise<string | null>;
  /**
   * Anexa o ficheiro digitalizado a um documento a_aguardar_assinatura:
   * sobe para a quarentena, valida-se e liga-se ao documento pelo mesmo
   * caminho de `validate-upload` que os outros modulos ja usam. Devolve uma
   * mensagem de erro amigavel, ou `null` em sucesso.
   */
  anexarFicheiro: (documentoId: string, ficheiro: File) => Promise<string | null>;
  /**
   * Pede um URL assinado de curta duracao (60s) para o ficheiro ja anexado,
   * via `hr-documento-ficheiro-url` -- a UNICA porta de leitura do bucket
   * final. Lanca em erro -- quem chama mostra a mensagem.
   */
  obterUrlFicheiro: (documentoId: string) => Promise<UrlFicheiroDocumento>;
}

/**
 * O resultado completo do hook: o antigo mais anular, ocultar, repor e listar ocultados. Separado de `UsePessoaDocumentosResult` para
 * que quem constroi esse tipo a mao (testes de components/hr) nao tenha de conhecer os membros novos.
 */
export interface UsePessoaDocumentosCompleto extends UsePessoaDocumentosResult {
  /**
   * Anula um documento a rascunho ou a aguardar assinatura (`rpc_hr_documento_anular`, hr.pessoas.documentos.anular). Retira o
   * envio ao portal, se houver. Repete uma vez se a base desfizer por deadlock (40P01).
   */
  anular: AccaoComMotivoDocumento;
  /** Oculta um documento assinado, entregue ou anulado (`rpc_hr_documento_ocultar`, hr.pessoas.documentos.ocultar). */
  ocultar: AccaoComMotivoDocumento;
  /** Repoe um documento oculto (`rpc_hr_documento_repor`, hr.pessoas.documentos.repor). O envio ao portal nao volta. */
  repor: AccaoComMotivoDocumento;
  /** Os documentos ocultados desta pessoa (hr.pessoas.documentos.repor). Nunca o texto. Erro traduzido e lista vazia se a base recusar. */
  listarOcultados: () => Promise<{ documentos: DocumentoOcultado[]; erro: string | null }>;
}

export function usePessoaDocumentos(
  pessoaId: string | undefined,
  podeVerModelos: boolean,
): UsePessoaDocumentosCompleto {
  const [documentos, setDocumentos] = useState<PessoaDocumento[]>([]);
  const [modelos, setModelos] = useState<PessoaDocumentoModelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recusado, setRecusado] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setDocumentos([]);
      setModelos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await hrFrom("pessoas_documentos")
        .select(COLUNAS_DOCUMENTO)
        .eq("pessoa_id", pessoaId)
        .order("created_at", { ascending: false });
      if (error) {
        if (isPermissionError(error)) {
          setRecusado(true);
          setDocumentos([]);
        } else {
          captureFlowError(error, "hr-documentos-load");
          setDocumentos([]);
        }
      } else {
        setRecusado(false);
        setDocumentos((data ?? []) as PessoaDocumento[]);
      }

      if (podeVerModelos) {
        const { data: dadosModelos, error: erroModelos } = await hrFrom(
          "pessoas_documentos_modelos",
        )
          .select(COLUNAS_MODELO)
          .eq("activo", true)
          .order("nome", { ascending: true });
        if (erroModelos) {
          if (!isPermissionError(erroModelos)) {
            captureFlowError(erroModelos, "hr-documentos-modelos-load");
          }
          setModelos([]);
        } else {
          setModelos((dadosModelos ?? []) as PessoaDocumentoModelo[]);
        }
      } else {
        setModelos([]);
      }
    } catch (e) {
      captureFlowError(e, "hr-documentos-load");
    } finally {
      setLoading(false);
    }
  }, [pessoaId, podeVerModelos]);

  useEffect(() => {
    void load();
  }, [load]);

  const emitir = useCallback(
    async (modeloId: string): Promise<string | null> => {
      if (!pessoaId) return null;
      setSaving(true);
      try {
        const { error } = await hrRpc("rpc_hr_documento_emitir", {
          p_modelo_id: modeloId,
          p_pessoa_ids: [pessoaId],
        });
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-documentos-emitir");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [pessoaId, load],
  );

  const criarPorUpload = useCallback(
    async (args: {
      tipo: TipoDocumentoRH;
      titulo: string;
      vinculoId: string | null;
    }): Promise<{ documentoId: string | null; erro: string | null }> => {
      if (!pessoaId) return { documentoId: null, erro: null };
      setSaving(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_documento_upload_assinado_criar", {
          p_pessoa_id: pessoaId,
          p_vinculo_id: args.vinculoId,
          p_tipo: args.tipo,
          p_titulo: args.titulo,
        });
        if (error) throw error;
        await load();
        return { documentoId: (data ?? null) as string | null, erro: null };
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-documentos-criar-por-upload");
        return { documentoId: null, erro: await getFriendlyErrorMessage(e) };
      } finally {
        setSaving(false);
      }
    },
    [pessoaId, load],
  );

  const registarAssinaturaExterna = useCallback(
    async (documentoId: string): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await hrRpc("rpc_hr_documento_registar_assinatura_externa", {
          p_documento_id: documentoId,
        });
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e) && !chaveErroDocumento(e)) captureFlowError(e, "hr-documentos-assinatura-externa");
        return await mensagemErroDocumento(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const verConteudo = useCallback(async (documentoId: string): Promise<string> => {
    const { data, error } = await hrRpc("rpc_hr_documento_ver_conteudo", {
      p_documento_id: documentoId,
    });
    if (error) {
      if (!isPermissionError(error)) captureFlowError(error, "hr-documentos-ver-conteudo");
      throw error;
    }
    return (data ?? "") as string;
  }, []);

  const assinar = useCallback(
    async (documentoId: string): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await hrRpc("rpc_hr_documento_assinar", {
          p_documento_id: documentoId,
        });
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e) && !chaveErroDocumento(e)) captureFlowError(e, "hr-documentos-assinar");
        return await mensagemErroDocumento(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const anexarFicheiro = useCallback(
    async (documentoId: string, ficheiro: File): Promise<string | null> => {
      const documento = documentos.find((d) => d.id === documentoId);
      if (!documento) {
        return getLocalizedFallback("hr.documentos.erroAnexar");
      }

      const invalido = validarFicheiroHr(ficheiro);
      if (invalido) return invalido;

      setSaving(true);
      try {
        const erro = await subirFicheiroParaDocumento(documento, ficheiro);
        if (erro) return erro;
        await load();
        return null;
      } finally {
        setSaving(false);
      }
    },
    [documentos, load],
  );

  const obterUrlFicheiro = useCallback(
    async (documentoId: string): Promise<UrlFicheiroDocumento> => {
      const { data, error } = await supabase.functions.invoke("hr-documento-ficheiro-url", {
        body: { documentoId },
      });
      if (error) {
        if (!isPermissionError(error)) captureFlowError(error, "hr-documentos-obter-url-ficheiro");
        throw error;
      }
      const resposta = data as { url?: unknown; hash?: unknown; anexadoEm?: unknown } | null;
      if (!resposta || typeof resposta.url !== "string") {
        throw new Error("hr-documento-ficheiro-url: resposta inesperada");
      }
      return {
        url: resposta.url,
        hash: typeof resposta.hash === "string" ? resposta.hash : null,
        anexadoEm: typeof resposta.anexadoEm === "string" ? resposta.anexadoEm : null,
      };
    },
    [],
  );

  const executarComMotivo = useCallback(
    async (rpc: string, fluxo: string, documentoId: string, motivo: string): Promise<string | null> => {
      // O mesmo criterio da base (hr_documento_motivo): sem ida e volta por um motivo que ela ia recusar.
      if (razaoMotivoInvalido(motivo)) return getLocalizedFallback("hr.documentos.erro.motivoInvalido");
      setSaving(true);
      try {
        const { error } = await comRepeticaoPorDeadlock(() =>
          hrRpc(rpc, { p_documento_id: documentoId, p_motivo: motivoParaEnvio(motivo) }),
        );
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e) && !chaveErroDocumento(e)) captureFlowError(e, fluxo);
        return await mensagemErroDocumento(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const anular = useCallback<AccaoComMotivoDocumento>(
    (documentoId, motivo) => executarComMotivo("rpc_hr_documento_anular", "hr-documentos-anular", documentoId, motivo),
    [executarComMotivo],
  );
  const ocultar = useCallback<AccaoComMotivoDocumento>(
    (documentoId, motivo) => executarComMotivo("rpc_hr_documento_ocultar", "hr-documentos-ocultar", documentoId, motivo),
    [executarComMotivo],
  );
  const repor = useCallback<AccaoComMotivoDocumento>(
    (documentoId, motivo) => executarComMotivo("rpc_hr_documento_repor", "hr-documentos-repor", documentoId, motivo),
    [executarComMotivo],
  );

  const listarOcultados = useCallback(async (): Promise<{ documentos: DocumentoOcultado[]; erro: string | null }> => {
    if (!pessoaId) return { documentos: [], erro: null };
    try {
      const { data, error } = await comRepeticaoPorDeadlock(() =>
        hrRpc("rpc_hr_documentos_ocultados", { p_pessoa_id: pessoaId }),
      );
      if (error) throw error;
      return { documentos: (data ?? []) as DocumentoOcultado[], erro: null };
    } catch (e) {
      if (!isPermissionError(e) && !chaveErroDocumento(e)) captureFlowError(e, "hr-documentos-listar-ocultados");
      return { documentos: [], erro: await mensagemErroDocumento(e) };
    }
  }, [pessoaId]);

  return {
    documentos,
    modelos,
    loading,
    saving,
    recusado,
    recarregar: load,
    emitir,
    criarPorUpload,
    registarAssinaturaExterna,
    verConteudo,
    assinar,
    anexarFicheiro,
    obterUrlFicheiro,
    anular,
    ocultar,
    repor,
    listarOcultados,
  };
}
