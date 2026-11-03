/**
 * A troca de documentos com UMA pessoa, vista pelo RH: o que o RH pos no portal da pessoa (envios), o que o RH pediu a pessoa
 * (pedidos do RH) e o que a pessoa pediu ao RH (pedidos da pessoa). Le por SELECT com colunas explicitas (nunca `select('*')`)
 * as tabelas `pessoas_portal_envios` e `pessoas_portal_pedidos` e os documentos da pessoa (`pessoas_documentos`, so metadados),
 * e escreve SO por RPC (as tabelas nao tem INSERT/UPDATE/DELETE para `authenticated`):
 *
 *  - `rpc_hr_portal_documento_enviar` (hr.pessoas.documentos.emitir), `rpc_hr_portal_envio_retirar` (.anular);
 *  - `rpc_hr_portal_pedido_criar`, `_decidir`, `_cancelar`, `_pessoa_tratar` (.edit), `_pessoa_responder` (.emitir);
 *  - `rpc_hr_portal_pedido_ficheiros` (.view): os ficheiros que a pessoa enviou num pedido (nome, tipo e tamanho; nunca o caminho).
 *
 * Quem nao pode ver (42501) recebe `semAcesso`: o cartao nao aparece. O ecra so recebe TEXTO traduzido para os erros, nunca o
 * codigo em bruto nem a mensagem da base; defeitos vao para o registo, recusas de negocio nao.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { codigoDeErroRpc, chaveDoErro } from "@/lib/hr/admissaoPipeline";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { extensaoHrDocumento, subirParaQuarentenaHr, validarFicheiroHr } from "@/hooks/usePessoaDocumentos";

export interface EnvioRh {
  id: string;
  documentoId: string;
  conviteId: string | null;
  pedidoId: string | null;
  exigeAssinatura: boolean;
  enviadoEm: string;
  vistoEm: string | null;
  recusadoEm: string | null;
  recusaMotivo: string | null;
  /** Do documento (a mesma linha do separador Documentos). */
  titulo: string;
  tipo: string;
  estadoDocumento: string;
  assinadoEm: string | null;
  assinaturaOrigem: string | null;
  assinaturaReferencia: string | null;
  assinaturaTelemovelMascarado: string | null;
}

export interface FicheiroDoPedido {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
}

export interface PedidoDoRh {
  id: string;
  tipo: string;
  titulo: string;
  nota: string;
  prazo: string;
  estado: string;
  motivoRecusa: string | null;
  enviadoEm: string | null;
  ficheiros: FicheiroDoPedido[];
}

export interface PedidoDaPessoa {
  id: string;
  tipo: string;
  titulo: string;
  nota: string;
  urgencia: string;
  estado: string;
  motivoRecusa: string | null;
  criadoEm: string;
}

/** Um documento da pessoa que o RH pode partilhar no portal ou usar para responder a um pedido. */
export interface DocumentoPartilhavel {
  id: string;
  titulo: string;
  tipo: string;
  estado: string;
  partilhado: boolean;
}

/** Forma plana (sem `strictNullChecks` uma uniao por `ok` nao estreita). */
export interface ResultadoPortalRh {
  ok: boolean;
  /** O texto traduzido para o RH; `null` quando correu bem. */
  erro: string | null;
}

const COLUNAS_ENVIO =
  "id, documento_id, convite_id, pedido_id, exige_assinatura, enviado_em, visto_em, recusado_em, recusa_motivo, retirado_em";
const COLUNAS_PEDIDO =
  "id, direcao, tipo, titulo, nota, prazo, urgencia, estado, motivo_recusa, criado_em, enviado_em";
const COLUNAS_DOCUMENTO =
  "id, titulo, tipo, estado, assinado_em, assinatura_origem, assinatura_referencia, assinatura_telemovel_mascarado";
const ESTADOS_COM_FICHEIROS = ["enviado", "aceite", "recusado"];
const GENERICA = "hr.convite.erro.accaoFalhou";
/** Sem assinatura, a base so deixa entregar estes tipos (rpc_hr_portal_documento_enviar). */
export const TIPOS_SEM_ASSINATURA: readonly string[] = ["declaracao", "recibo"];
/** Com assinatura, todos os que a criacao por upload aceita. */
export const TIPOS_COM_ASSINATURA: readonly string[] = ["contrato", "adenda", "declaracao", "recibo", "outro"];

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const textoOuVazio = (v: unknown): string => (typeof v === "string" ? v : "");

type Linha = Record<string, unknown>;
const linhas = (v: unknown): Linha[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Linha[]) : []);

function falha(erro: unknown, origem: string): ResultadoPortalRh {
  const codigo = codigoDeErroRpc(erro);
  if (codigo === null || codigo === "erro_inesperado") captureFlowError(erro, origem);
  return { ok: false, erro: getLocalizedFallback(chaveDoErro(codigo, GENERICA)) };
}

/** O texto de cada codigo `{ok:false, codigo}` da Edge `hr-documento-enviar-ficheiro`; o que nao esta aqui cai no generico. */
const CHAVE_POR_CODIGO_EDGE: Readonly<Record<string, string>> = {
  ficheiro_em_falta: "rhPortalReal.enviar.erro.ficheiroEmFalta",
  ficheiro_invalido: "rhPortalReal.enviar.erro.ficheiroInvalido",
  ficheiro_demasiado_grande: "rhPortalReal.enviar.erro.ficheiroGrande",
  pedido_repetido: "rhPortalReal.enviar.erro.pedidoRepetido",
  limite_excedido: "rhPortalReal.enviar.erro.limite",
  pedido_invalido: "rhPortalReal.enviar.erro.tituloInvalido",
  estado_invalido: "rhPortalReal.enviar.erro.estadoInvalido",
  nao_encontrado: "rhPortalReal.enviar.erro.naoEncontrado",
  insufficient_privilege: "rhPortalReal.enviar.erro.semPermissao",
  nao_autenticado: "rhPortalReal.enviar.erro.semSessao",
};

const chaveDoErroEdge = (codigo: string | null): string => (codigo !== null && CHAVE_POR_CODIGO_EDGE[codigo]) || GENERICA;

/** `functions.invoke` devolve erro em qualquer resposta nao-2xx; o `codigo` esta no corpo (`error.context`, uma Response). */
async function codigoDaEdge(erro: unknown): Promise<string | null> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (!contexto || typeof (contexto as { json?: unknown }).json !== "function") return null;
  try {
    const corpo = (await (contexto as Response).json()) as unknown;
    return corpo && typeof corpo === "object" ? texto((corpo as Linha).codigo) : null;
  } catch {
    return null;
  }
}

function ficheirosDe(bruto: unknown): FicheiroDoPedido[] {
  return linhas(bruto).flatMap((f) => {
    const id = texto(f.id);
    return id ? [{ id, nome: textoOuVazio(f.nome), mime: textoOuVazio(f.mime), tamanho: typeof f.tamanho === "number" ? f.tamanho : 0 }] : [];
  });
}

export function usePortalDocumentosRh(pessoaId: string | null) {
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState(false);
  const [aExecutar, setAExecutar] = useState(false);
  const organizationId = useCompany().activeCompany?.id ?? null;
  const [envios, setEnvios] = useState<EnvioRh[]>([]);
  const [pedidosRh, setPedidosRh] = useState<PedidoDoRh[]>([]);
  const [pedidosPessoa, setPedidosPessoa] = useState<PedidoDaPessoa[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoPartilhavel[]>([]);
  // So a resposta do pedido MAIS RECENTE conta (a ficha muda de pessoa sem desmontar).
  const pedidoAtual = useRef(0);

  const carregar = useCallback(
    async (primeira: boolean) => {
      const pedido = ++pedidoAtual.current;
      if (!pessoaId) {
        setEnvios([]);
        setPedidosRh([]);
        setPedidosPessoa([]);
        setDocumentos([]);
        setCarregando(false);
        return;
      }
      if (primeira) setCarregando(true);
      setErro(false);
      try {
        const [rEnvios, rPedidos, rDocs] = await Promise.all([
          hrFrom("pessoas_portal_envios").select(COLUNAS_ENVIO).eq("pessoa_id", pessoaId).is("retirado_em", null).order("enviado_em", { ascending: false }),
          hrFrom("pessoas_portal_pedidos").select(COLUNAS_PEDIDO).eq("pessoa_id", pessoaId).neq("estado", "cancelado").order("criado_em", { ascending: false }),
          hrFrom("pessoas_documentos").select(COLUNAS_DOCUMENTO).eq("pessoa_id", pessoaId).order("created_at", { ascending: false }),
        ]);
        if (pedido !== pedidoAtual.current) return;
        const falhou = rEnvios.error ?? rPedidos.error ?? rDocs.error;
        if (falhou) {
          if (isPermissionError(falhou)) setSemAcesso(true);
          else {
            captureFlowError(falhou, "hr-portal-documentos-ler");
            setErro(true);
          }
          return;
        }
        setSemAcesso(false);
        const docs = new Map(linhas(rDocs.data).map((d) => [textoOuVazio(d.id), d]));
        const idsPartilhados = new Set(linhas(rEnvios.data).map((e) => textoOuVazio(e.documento_id)));
        setDocumentos(
          linhas(rDocs.data).flatMap((d) => {
            const id = texto(d.id);
            const estado = textoOuVazio(d.estado);
            // Um rascunho ou um anulado nao se partilha (a base recusa com `estado_invalido`).
            if (!id || estado === "rascunho" || estado === "anulado") return [];
            return [{ id, titulo: textoOuVazio(d.titulo), tipo: textoOuVazio(d.tipo), estado, partilhado: idsPartilhados.has(id) }];
          }),
        );
        setEnvios(
          linhas(rEnvios.data).flatMap((e) => {
            const id = texto(e.id);
            const doc = docs.get(textoOuVazio(e.documento_id));
            if (!id || !doc) return [];
            return [{
              id, documentoId: textoOuVazio(e.documento_id), conviteId: texto(e.convite_id), pedidoId: texto(e.pedido_id),
              exigeAssinatura: e.exige_assinatura === true, enviadoEm: textoOuVazio(e.enviado_em), vistoEm: texto(e.visto_em),
              recusadoEm: texto(e.recusado_em), recusaMotivo: texto(e.recusa_motivo),
              titulo: textoOuVazio(doc.titulo), tipo: textoOuVazio(doc.tipo), estadoDocumento: textoOuVazio(doc.estado),
              assinadoEm: texto(doc.assinado_em), assinaturaOrigem: texto(doc.assinatura_origem),
              assinaturaReferencia: texto(doc.assinatura_referencia), assinaturaTelemovelMascarado: texto(doc.assinatura_telemovel_mascarado),
            }];
          }),
        );
        const todos = linhas(rPedidos.data);
        setPedidosPessoa(
          todos.filter((p) => p.direcao === "pessoa_pede").flatMap((p) => {
            const id = texto(p.id);
            return id ? [{
              id, tipo: textoOuVazio(p.tipo), titulo: textoOuVazio(p.titulo), nota: textoOuVazio(p.nota), urgencia: textoOuVazio(p.urgencia),
              estado: textoOuVazio(p.estado), motivoRecusa: texto(p.motivo_recusa), criadoEm: textoOuVazio(p.criado_em),
            }] : [];
          }),
        );
        // Os ficheiros que a pessoa enviou: uma leitura por pedido que ja os tem (sao poucos, no maximo 10 abertos).
        const doRh = todos.filter((p) => p.direcao === "rh_pede" && texto(p.id));
        const comFicheiros = await Promise.all(
          doRh.map(async (p): Promise<PedidoDoRh> => {
            const id = textoOuVazio(p.id);
            const estado = textoOuVazio(p.estado);
            let ficheiros: FicheiroDoPedido[] = [];
            if (ESTADOS_COM_FICHEIROS.includes(estado)) {
              const r = await hrRpc("rpc_hr_portal_pedido_ficheiros", { p_pedido_id: id });
              if (r.error) {
                if (!isPermissionError(r.error)) captureFlowError(r.error, "hr-portal-pedido-ficheiros");
              } else ficheiros = ficheirosDe(r.data);
            }
            return {
              id, tipo: textoOuVazio(p.tipo), titulo: textoOuVazio(p.titulo), nota: textoOuVazio(p.nota), prazo: textoOuVazio(p.prazo),
              estado, motivoRecusa: texto(p.motivo_recusa), enviadoEm: texto(p.enviado_em), ficheiros,
            };
          }),
        );
        if (pedido !== pedidoAtual.current) return;
        setPedidosRh(comFicheiros);
      } catch (e) {
        if (pedido !== pedidoAtual.current) return;
        captureFlowError(e, "hr-portal-documentos-ler");
        setErro(true);
      } finally {
        if (pedido === pedidoAtual.current) setCarregando(false);
      }
    },
    [pessoaId],
  );

  useEffect(() => {
    void carregar(true);
    return () => {
      pedidoAtual.current += 1;
    };
  }, [carregar]);

  const recarregar = useCallback(() => void carregar(false), [carregar]);

  /** Corre uma RPC de escrita e, se correu bem, volta a ler. Nunca lanca. */
  const escrever = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<ResultadoPortalRh> => {
      setAExecutar(true);
      try {
        const { error } = await hrRpc(fn, args);
        if (error) return falha(error, `hr-portal-${fn}`);
        await carregar(false);
        return { ok: true, erro: null };
      } catch (e) {
        return falha(e, `hr-portal-${fn}`);
      } finally {
        setAExecutar(false);
      }
    },
    [carregar],
  );

  const enviarDocumento = useCallback(
    (documentoId: string, conviteId: string | null, exigeAssinatura: boolean) =>
      escrever("rpc_hr_portal_documento_enviar", { p_documento_id: documentoId, p_convite_id: conviteId, p_exige_assinatura: exigeAssinatura }),
    [escrever],
  );

  /**
   * Cria um documento novo com um ficheiro e partilha-o no portal numa so accao (Edge `hr-documento-enviar-ficheiro`): o ficheiro
   * sobe para a quarentena num caminho com o id do documento novo, e a Edge valida-o, copia-o e cria o documento ja com o ficheiro
   * e o envio, numa transaccao. Ou fica tudo, ou nao fica nada. Sem assinatura, so `declaracao` ou `recibo`.
   */
  const anexarEEnviar = useCallback(
    async (d: { titulo: string; tipo: string; ficheiro: File; exigeAssinatura: boolean; conviteId: string | null }): Promise<ResultadoPortalRh> => {
      if (!pessoaId || !organizationId) return { ok: false, erro: getLocalizedFallback(GENERICA) };
      if (d.titulo.trim() === "") return { ok: false, erro: getLocalizedFallback("rhPortalReal.enviar.erroTitulo") };
      if (!d.exigeAssinatura && !TIPOS_SEM_ASSINATURA.includes(d.tipo)) {
        return { ok: false, erro: getLocalizedFallback("rhPortalReal.enviar.erroTipoSemAssinatura") };
      }
      const invalido = validarFicheiroHr(d.ficheiro);
      if (invalido) return { ok: false, erro: invalido };
      const extensao = extensaoHrDocumento(d.ficheiro);
      if (!extensao) return { ok: false, erro: getLocalizedFallback("hr.documentos.tipoFicheiroInvalido") };
      setAExecutar(true);
      try {
        // Caminho imposto pela politica da quarentena; a 3.a pasta e o id do documento que a base vai criar.
        const documentoId = crypto.randomUUID();
        const caminho = `${organizationId}/${pessoaId}/${documentoId}/${crypto.randomUUID()}.${extensao}`;
        const erroUpload = await subirParaQuarentenaHr(caminho, d.ficheiro);
        if (erroUpload) return { ok: false, erro: erroUpload };

        const { data, error } = await supabase.functions.invoke("hr-documento-enviar-ficheiro", {
          body: {
            caminho, organizationId, tipo: d.tipo, titulo: d.titulo.trim(), exigeAssinatura: d.exigeAssinatura, conviteId: d.conviteId,
          },
        });
        // `invoke` devolve erro em qualquer resposta que nao seja 2xx: o codigo vem no corpo da resposta.
        const recusado = (data as Linha | null)?.ok === false;
        const codigo = error ? await codigoDaEdge(error) : recusado ? texto((data as Linha).codigo) : null;
        // Volta a ler sempre: mesmo numa falha ambigua (500) o documento pode ter ficado criado.
        await carregar(false);
        // Uma repeticao ja feita (`repetido: true`, ok) e sucesso: o documento existe e foi enviado.
        if (error || recusado) {
          if (codigo === null || codigo === "erro_inesperado") captureFlowError(error ?? new Error("hr-documento-enviar-ficheiro: erro_inesperado"), "hr-portal-anexar-enviar");
          return { ok: false, erro: getLocalizedFallback(chaveDoErroEdge(codigo)) };
        }
        return { ok: true, erro: null };
      } catch (e) {
        return falha(e, "hr-portal-anexar-enviar");
      } finally {
        setAExecutar(false);
      }
    },
    [carregar, organizationId, pessoaId],
  );

  const retirarEnvio = useCallback(
    (envioId: string, motivo: string) => escrever("rpc_hr_portal_envio_retirar", { p_envio_id: envioId, p_motivo: motivo.trim() }),
    [escrever],
  );

  const pedirDocumento = useCallback(
    (d: { tipo: string; titulo: string; nota: string; prazo: string; conviteId: string | null }) => {
      if (!pessoaId) return Promise.resolve<ResultadoPortalRh>({ ok: false, erro: getLocalizedFallback(GENERICA) });
      return escrever("rpc_hr_portal_pedido_criar", {
        p_pessoa_id: pessoaId, p_tipo: d.tipo, p_titulo: d.tipo === "outro" ? d.titulo.trim() : null,
        p_nota: d.nota.trim() === "" ? null : d.nota.trim(), p_prazo: d.prazo, p_convite_id: d.conviteId,
      });
    },
    [escrever, pessoaId],
  );

  const aceitarPedido = useCallback(
    (pedidoId: string) => escrever("rpc_hr_portal_pedido_decidir", { p_pedido_id: pedidoId, p_aceitar: true, p_motivo: null }),
    [escrever],
  );

  const recusarPedido = useCallback(
    (pedidoId: string, motivo: string) =>
      escrever("rpc_hr_portal_pedido_decidir", { p_pedido_id: pedidoId, p_aceitar: false, p_motivo: motivo.trim() }),
    [escrever],
  );

  const cancelarPedido = useCallback(
    (pedidoId: string) => escrever("rpc_hr_portal_pedido_cancelar", { p_pedido_id: pedidoId }),
    [escrever],
  );

  const prepararPedidoDaPessoa = useCallback(
    (pedidoId: string) => escrever("rpc_hr_portal_pedido_pessoa_tratar", { p_pedido_id: pedidoId, p_accao: "preparar", p_motivo: null }),
    [escrever],
  );

  const recusarPedidoDaPessoa = useCallback(
    (pedidoId: string, motivo: string) =>
      escrever("rpc_hr_portal_pedido_pessoa_tratar", { p_pedido_id: pedidoId, p_accao: "recusar", p_motivo: motivo.trim() }),
    [escrever],
  );

  const responderPedidoDaPessoa = useCallback(
    (pedidoId: string, documentoId: string) =>
      escrever("rpc_hr_portal_pedido_pessoa_responder", { p_pedido_id: pedidoId, p_documento_id: documentoId }),
    [escrever],
  );

  return {
    carregando, semAcesso, erro, aExecutar, envios, pedidosRh, pedidosPessoa, documentos, recarregar,
    enviarDocumento, anexarEEnviar, retirarEnvio, pedirDocumento, aceitarPedido, recusarPedido, cancelarPedido,
    prepararPedidoDaPessoa, recusarPedidoDaPessoa, responderPedidoDaPessoa,
  };
}
