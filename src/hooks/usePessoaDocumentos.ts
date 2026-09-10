/**
 * Os documentos de UMA pessoa: contratos, adendas e declaracoes emitidos a
 * partir de um modelo, mais o essencial para os assinar.
 *
 * SO METADADOS AQUI DENTRO
 * ------------------------
 * A lista carrega `pessoas_documentos` sem `corpo_html` nem
 * `ficheiro_caminho`: essas colunas estao fechadas por GRANT (migration
 * 20261123030000) e pedi-las faria o PostgREST recusar o select inteiro. O
 * conteudo em claro so vem, um documento de cada vez, por
 * `rpc_hr_documento_ver_conteudo` -- o mesmo padrao do NISS em
 * `usePessoa.ts`. NUNCA se guarda esse conteudo em estado que sobreviva ao
 * dialogo que o mostra.
 *
 * A EMISSAO E A ASSINATURA NAO SAO INSERT/UPDATE DIRECTOS
 * ---------------------------------------------------------
 * `pessoas_documentos` bloqueia INSERT/UPDATE/DELETE directos a
 * `authenticated` -- a unica escrita e pelas RPCs `SECURITY DEFINER`
 * `rpc_hr_documento_emitir` e `rpc_hr_documento_assinar`. Uma linha
 * `assinado` e imutavel mesmo por essa via.
 *
 * SEGUE O PADRAO DE `useAusenciasDaPessoa`
 * -----------------------------------------
 * Recusa por permissao (`isPermissionError`) e a resposta CORRECTA e fica
 * silenciosa para o Sentry -- o ecra esconde o bloco. Qualquer outra falha vai
 * por `captureFlowError`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { PessoaDocumento, PessoaDocumentoModelo } from "@/types/hr";

const COLUNAS_DOCUMENTO =
  "id, pessoa_id, organization_id, vinculo_id, modelo_id, tipo, titulo, estado, " +
  "emitido_em, emitido_por, assinado_em, anulado_em, anulado_motivo, created_at";

const COLUNAS_MODELO = "id, organization_id, nome, tipo, activo";

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
  /** O conteudo em claro, uma vez. Lanca em erro -- quem chama mostra a mensagem. */
  verConteudo: (documentoId: string) => Promise<string>;
  assinar: (documentoId: string) => Promise<string | null>;
}

export function usePessoaDocumentos(
  pessoaId: string | undefined,
  podeVerModelos: boolean,
): UsePessoaDocumentosResult {
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
        if (!isPermissionError(e)) captureFlowError(e, "hr-documentos-assinar");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  return {
    documentos,
    modelos,
    loading,
    saving,
    recusado,
    recarregar: load,
    emitir,
    verConteudo,
    assinar,
  };
}
