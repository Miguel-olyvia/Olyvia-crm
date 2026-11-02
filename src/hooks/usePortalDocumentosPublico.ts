/**
 * A troca de documentos do portal publico do colaborador (janela de documentos aberta pelo RH depois de aprovar a admissao).
 * Tudo pela Edge Function `convite-admissao` (accoes `doc_*`) e SEMPRE com a sessao do codigo por e-mail: este hook nao gere a
 * sessao, usa a do `useConviteAdmissaoPublico` (`chamarComSessao`, `documentosBrutos`, `manterSessao`), que a guarda so em memoria.
 *
 *  - ler: `doc_ler` (corre quando a sessao abre e em `recarregar`); a resposta e normalizada por lista branca;
 *  - ver: `doc_conteudo` (HTML, que o ecra sanitiza) e `doc_ficheiro_url` (URL assinado de 60 s: abre-se e esquece-se);
 *  - assinar: codigo por SMS (`doc_codigo` pede-o, `doc_assinar` confirma com o codigo e o aceite) ou `doc_recusar` com motivo;
 *  - ficheiros de um pedido do RH: `doc_pedido_url` -> upload para a quarentena -> `doc_pedido_confirmar` (a Edge le a assinatura
 *    real do ficheiro) -> `doc_pedido_enviar`; `doc_pedido_remover` tira um;
 *  - pedir ao RH: `doc_pedir_rh`, `doc_pedido_cancelar`.
 *
 * O QUE NUNCA SAI DAQUI: o codigo SMS nao fica em estado nenhum (passa e acaba); o telemovel so chega mascarado; o caminho de um
 * ficheiro nunca chega ao browser; nada disto vai para o registo de erros (so a operacao e o codigo, na camada de baixo).
 */
import { useCallback, useMemo } from "react";
import { enviarParaQuarentena } from "@/lib/hr/envioQuarentena";
import { normalizarDocumentos, type DocumentosPortal } from "@/lib/hr/portalDocumentosContrato";
import type { ResultadoAccaoSessao } from "@/hooks/useConviteAdmissaoPublico";

/** O que este hook precisa do portal: o que o `useConviteAdmissaoPublico` devolve. */
export interface LigacaoPortalDocumentos {
  documentosBrutos: Record<string, unknown> | null;
  erroLeitura: string | null;
  chamarComSessao: (accao: string, extra?: Record<string, unknown>) => Promise<ResultadoAccaoSessao>;
  manterSessao: () => Promise<void>;
}

export interface ResultadoCodigoSms {
  ok: boolean;
  codigo: string | null;
  /** So mascarado. */
  telemovelMascarado: string | null;
  /** Instantes ISO: quando o codigo deixa de valer e quando se pode pedir outro. */
  expiraEm: string | null;
  reenviarEm: string | null;
}

export interface DadosPedidoAoRh {
  tipo: string;
  titulo: string;
  nota: string;
  urgencia: "normal" | "urgente";
}

const FALHA_DE_ENVIO = "anexo_falha_envio";
const FALHA: ResultadoAccaoSessao = { ok: false, codigo: "erro_inesperado", data: {}, restantes: null };

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function usePortalDocumentosPublico(portal: LigacaoPortalDocumentos) {
  const { documentosBrutos, chamarComSessao, manterSessao } = portal;
  const dados: DocumentosPortal | null = useMemo(
    () => (documentosBrutos ? normalizarDocumentos(documentosBrutos) : null),
    [documentosBrutos],
  );

  const recarregar = useCallback(() => manterSessao(), [manterSessao]);

  /** Faz a accao e, se correu bem, volta a ler (os contadores e os estados mudam). */
  const comRecarga = useCallback(
    async (accao: string, extra: Record<string, unknown>): Promise<ResultadoAccaoSessao> => {
      const r = await chamarComSessao(accao, extra);
      if (r.ok) await manterSessao();
      return r;
    },
    [chamarComSessao, manterSessao],
  );

  /** O HTML do documento (a pessoa e a dona). O ecra sanitiza-o com DOMPurify e nao o guarda para alem do que o mostra. */
  const conteudo = useCallback(
    async (envioId: string): Promise<{ ok: boolean; codigo: string | null; html: string }> => {
      const r = await chamarComSessao("doc_conteudo", { envio_id: envioId });
      return { ok: r.ok, codigo: r.codigo, html: r.ok ? (texto(r.data.html) ?? "") : "" };
    },
    [chamarComSessao],
  );

  /** O URL assinado (60 s) de um documento que e um ficheiro. */
  const urlDoFicheiro = useCallback(
    async (envioId: string): Promise<{ ok: boolean; codigo: string | null; url: string | null }> => {
      const r = await chamarComSessao("doc_ficheiro_url", { envio_id: envioId });
      return { ok: r.ok, codigo: r.codigo, url: r.ok ? texto(r.data.url) : null };
    },
    [chamarComSessao],
  );

  /** Pede o codigo por SMS para o telemovel da ficha. Sem telemovel valido: `sem_telemovel`. */
  const pedirCodigoSms = useCallback(
    async (envioId: string): Promise<ResultadoCodigoSms> => {
      const r = await chamarComSessao("doc_codigo", { envio_id: envioId });
      return {
        ok: r.ok,
        codigo: r.codigo,
        telemovelMascarado: r.ok ? texto(r.data.telemovel_mascarado) : null,
        expiraEm: r.ok ? texto(r.data.expira_em) : null,
        reenviarEm: r.ok ? texto(r.data.reenviar_em) : null,
      };
    },
    [chamarComSessao],
  );

  /** Assina com o codigo recebido por SMS. O codigo vai no pedido e nao fica em lado nenhum. */
  const assinar = useCallback(
    (envioId: string, codigo: string, aceite: boolean): Promise<ResultadoAccaoSessao> =>
      comRecarga("doc_assinar", { envio_id: envioId, codigo: codigo.replace(/\s/g, ""), aceite }),
    [comRecarga],
  );

  const recusar = useCallback(
    (envioId: string, motivo: string): Promise<ResultadoAccaoSessao> =>
      comRecarga("doc_recusar", { envio_id: envioId, motivo: motivo.trim() }),
    [comRecarga],
  );

  /** Envia um ficheiro de um pedido do RH: reserva, sobe para a quarentena e confirma. Nunca lanca. */
  const enviarFicheiro = useCallback(
    async (pedidoId: string, ficheiro: File, aoProgredir?: (percentagem: number) => void): Promise<ResultadoAccaoSessao> => {
      const url = await chamarComSessao("doc_pedido_url", {
        pedido_id: pedidoId,
        nome: ficheiro.name,
        mime: ficheiro.type,
        tamanho: ficheiro.size,
      });
      if (!url.ok) return url;
      const anexoId = texto(url.data.anexo_id);
      const caminho = texto(url.data.caminho_quarentena) ?? texto(url.data.caminho);
      const tokenUpload = texto(url.data.upload_token) ?? texto(url.data.upload);
      if (!anexoId || !caminho || !tokenUpload) return FALHA;

      const subiu = await enviarParaQuarentena(caminho, tokenUpload, ficheiro, aoProgredir ?? (() => undefined));
      if (!subiu) {
        // Melhor esforco: liberta o lugar reservado, que de outro modo ficava ocupado ate a limpeza do servidor.
        void chamarComSessao("doc_pedido_remover", { anexo_id: anexoId });
        return { ok: false, codigo: FALHA_DE_ENVIO, data: {}, restantes: null };
      }
      const confirmado = await chamarComSessao("doc_pedido_confirmar", { anexo_id: anexoId });
      // Uma falha sem corpo deixa o estado do servidor por saber: tenta-se desfazer.
      if (!confirmado.ok && confirmado.codigo === "erro_inesperado") void chamarComSessao("doc_pedido_remover", { anexo_id: anexoId });
      return confirmado;
    },
    [chamarComSessao],
  );

  const removerFicheiro = useCallback(
    (anexoId: string): Promise<ResultadoAccaoSessao> => comRecarga("doc_pedido_remover", { anexo_id: anexoId }),
    [comRecarga],
  );

  /** Fecha o pedido: precisa de 1 a 4 ficheiros ligados (a base diz `sem_ficheiro` se nao). */
  const enviarPedido = useCallback(
    (pedidoId: string): Promise<ResultadoAccaoSessao> => comRecarga("doc_pedido_enviar", { pedido_id: pedidoId }),
    [comRecarga],
  );

  const pedirAoRh = useCallback(
    (pedido: DadosPedidoAoRh): Promise<ResultadoAccaoSessao> =>
      comRecarga("doc_pedir_rh", {
        tipo: pedido.tipo,
        titulo: pedido.titulo.trim(),
        nota: pedido.nota.trim(),
        urgencia: pedido.urgencia,
      }),
    [comRecarga],
  );

  const cancelarMeuPedido = useCallback(
    (pedidoId: string): Promise<ResultadoAccaoSessao> => comRecarga("doc_pedido_cancelar", { pedido_id: pedidoId }),
    [comRecarga],
  );

  return {
    dados,
    erroLeitura: portal.erroLeitura,
    recarregar,
    conteudo,
    urlDoFicheiro,
    pedirCodigoSms,
    assinar,
    recusar,
    enviarFicheiro,
    removerFicheiro,
    enviarPedido,
    pedirAoRh,
    cancelarMeuPedido,
  };
}
