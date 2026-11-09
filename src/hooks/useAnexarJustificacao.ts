/**
 * Os anexos reais de uma justificação (do dia, ou o papel de uma falta): listar, anexar, remover e abrir.
 *
 * TUDO PASSA PELA EDGE `hr-justificacao-anexo` (JWT do utilizador, o mesmo padrão de `useConviteAnexos`):
 *   url        reserva o anexo e devolve o token de um URL assinado para a QUARENTENA;
 *   (upload)   o browser sobe o ficheiro com `uploadToSignedUrl`, sem passar pela Edge;
 *   confirmar  a Edge lê a assinatura real, limpa o conteúdo e só então o anexo fica verificado.
 * Quem pode o quê decide a base (nunca este ecrã); quem lista é a RPC `rpc_hr_justificacao_anexos_listar`, que devolve o
 * nome NULO a quem não o pode ver.
 *
 * NADA AQUI LANÇA. Cada operação devolve `{ ok, codigo }`; o ecrã traduz o código com `chaveDoErroDeAnexo`. Só os erros que são
 * defeitos (rede, resposta sem corpo) vão para o registo, e sem nomes, caminhos nem tokens.
 *
 * FALTAS: a Edge pede `falta_justificacao_id` (o id de `pessoas_faltas_justificacoes`, o «papel»), enquanto a RPC de listar
 * pede o id da própria falta (`pessoas_faltas.id`). O ecrã da falta só tem o segundo; `papelDaFalta` obtém o primeiro por leitura
 * da tabela (que a RLS limita a quem tem `hr.assiduidade.justificacao.view` e à própria pessoa).
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hrFrom, hrRpc } from "@/lib/hr/hrDb";
import { codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { codigoCanonicoDeAnexo, lerAnexosListados, type AnexoListado } from "@/lib/hr/justificacaoAnexos";
import { captureFlowError } from "@/lib/observability/captureFlowError";

const FUNCAO = "hr-justificacao-anexo";
const ORIGEM_REGISTO = "hr-justificacao-anexos";
const CODIGO_FALHA_ENVIO = "anexo_falha_envio";
const CODIGO_INESPERADO = "erro_inesperado";

/** A justificação a que se anexa: a do dia, ou o papel de uma falta (exactamente um). */
export type AlvoAnexo = { justificacaoDiaId: string } | { faltaJustificacaoId: string };

/** O que se pede à RPC de listar: exactamente um dos dois ids (o da falta é `pessoas_faltas.id`). */
export type AlvoListagem = { justificacaoDiaId: string } | { faltaId: string };

export interface ResultadoAnexo {
  ok: boolean;
  /** Código de erro estável, ou `null` quando correu bem. */
  codigo: string | null;
}

/**
 * O resultado de enviar UM ficheiro. `anexoId` é a reserva feita na Edge (`null` se a reserva falhou) e `uploadFeito` diz se o
 * ficheiro já chegou à quarentena: com isto «Tentar outra vez» sabe se repete só a confirmação ou se limpa a reserva antes de
 * reservar de novo. Sem isto cada tentativa falhada deixava uma reserva a ocupar uma das vagas (até 2 h).
 */
export interface ResultadoEnvio extends ResultadoAnexo {
  anexoId: string | null;
  uploadFeito: boolean;
}

export interface ResultadoDeUmFicheiro extends ResultadoEnvio {
  ficheiro: File;
}

export interface ResultadoListagem {
  ok: boolean;
  anexos: AnexoListado[];
  /** `true` quando a RPC recusou (sem acesso ou ainda por aplicar): o ecrã não mostra nada em vez de dar erro. */
  semAcesso: boolean;
}

/** Sem o nome do ficheiro: pode ser dado de saúde, a Edge já não o devolve e a listagem esconde-o a quem não o pode ver. */
export interface ResultadoAbrir extends ResultadoAnexo {
  url: string | null;
  mimeType: string | null;
}

type RespostaEdge = { ok: boolean; data: Record<string, unknown>; codigo: string | null };

function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === CODIGO_INESPERADO;
}

function erroSemDados(codigo: string | null): Error {
  return new Error(`${ORIGEM_REGISTO}: ${codigo ?? "falha_de_rede"}`);
}

/** O estado HTTP de um erro do `functions.invoke` (vem na `Response` de `error.context`), ou `null`. */
function estadoHttpDoErro(error: unknown): number | null {
  const estado = (error as { context?: { status?: unknown } } | null | undefined)?.context?.status;
  return typeof estado === "number" ? estado : null;
}

async function chamarEdge(body: Record<string, unknown>): Promise<RespostaEdge> {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCAO, { body });
    if (error || data?.error) {
      // Os 401/403 da autenticação (`_shared/auth.ts`) trazem texto em inglês, não um código da Edge: normaliza-se aqui.
      const codigo = codigoCanonicoDeAnexo(await codigoDeErroEdge(error, data), estadoHttpDoErro(error));
      return { ok: false, data: {}, codigo: codigo ?? CODIGO_INESPERADO };
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown>, codigo: null };
  } catch {
    return { ok: false, data: {}, codigo: CODIGO_INESPERADO };
  }
}

function falhou(codigo: string | null): ResultadoAnexo {
  if (eDefeito(codigo)) captureFlowError(erroSemDados(codigo), ORIGEM_REGISTO);
  return { ok: false, codigo: codigo ?? CODIGO_INESPERADO };
}

function corpoDoUrl(alvo: AlvoAnexo, f: File): Record<string, unknown> {
  const chave = "justificacaoDiaId" in alvo ? { justificacao_dia_id: alvo.justificacaoDiaId } : { falta_justificacao_id: alvo.faltaJustificacaoId };
  return { accao: "url", ...chave, nome: f.name, tamanho: f.size, mime: f.type };
}

function falhouEnvio(codigo: string | null, anexoId: string | null, uploadFeito: boolean): ResultadoEnvio {
  return { ...falhou(codigo), anexoId, uploadFeito };
}

/**
 * As recusas em que a Edge JÁ descartou a reserva (ou o anexo já não está à espera de confirmação): repetir a confirmação não
 * serve, reserva-se de novo. `anexo_nao_encontrado`/`anexo_estado_invalido` cobrem a reserva que a limpeza da base já levou.
 */
const CODIGOS_COM_RESERVA_DESCARTADA: ReadonlySet<string> = new Set([
  "anexo_conteudo_recusado",
  "anexo_formato_invalido",
  "anexo_vazio",
  "anexo_demasiado_grande",
  "justificacao_decidida",
  "anexo_estado_invalido",
  "anexo_nao_encontrado",
]);

/** Pede à Edge para confirmar um upload já feito: a Edge lê a assinatura real, limpa o conteúdo e só então o anexo fica verificado. */
async function confirmarEnvio(anexoId: string): Promise<ResultadoEnvio> {
  const confirmada = await chamarEdge({ accao: "confirmar", anexo_id: anexoId });
  return confirmada.ok ? { ok: true, codigo: null, anexoId, uploadFeito: true } : falhouEnvio(confirmada.codigo, anexoId, true);
}

/**
 * Anexa UM ficheiro: reserva, sobe para a quarentena e confirma. Devolve sempre o `anexoId` da reserva e se o upload correu.
 *
 * `anterior` é o resultado falhado da tentativa anterior do MESMO ficheiro («Tentar outra vez»):
 *   - o upload já correu e a Edge não descartou a reserva: repete só a confirmação;
 *   - o upload falhou: limpa a reserva antiga (`remover`) ANTES de reservar de novo, para não acumular reservas; se esse
 *     `remover` falhar devolve o erro dele e não reserva outra (a reserva fica por limpar e volta a tentar-se).
 */
export async function enviarAnexo(alvo: AlvoAnexo, ficheiro: File, anterior?: ResultadoEnvio | null): Promise<ResultadoEnvio> {
  if (anterior?.anexoId) {
    if (anterior.uploadFeito && !CODIGOS_COM_RESERVA_DESCARTADA.has(anterior.codigo ?? "")) return confirmarEnvio(anterior.anexoId);
    if (!anterior.uploadFeito) {
      const limpa = await removerAnexo(anterior.anexoId);
      // «Não encontrado»: a reserva já foi limpa pela base, não há nada a remover.
      if (!limpa.ok && limpa.codigo !== "anexo_nao_encontrado") return { ...limpa, anexoId: anterior.anexoId, uploadFeito: false };
    }
  }
  const reserva = await chamarEdge(corpoDoUrl(alvo, ficheiro));
  if (!reserva.ok) return falhouEnvio(reserva.codigo, null, false);
  const { anexo_id: anexoId, bucket, caminho, upload_token: token } = reserva.data;
  if (typeof anexoId !== "string" || typeof bucket !== "string" || typeof caminho !== "string" || typeof token !== "string") {
    return falhouEnvio(CODIGO_INESPERADO, typeof anexoId === "string" ? anexoId : null, false);
  }
  try {
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(caminho, token, ficheiro);
    if (error) return falhouEnvio(CODIGO_FALHA_ENVIO, anexoId, false);
  } catch {
    return falhouEnvio(CODIGO_FALHA_ENVIO, anexoId, false);
  }
  return confirmarEnvio(anexoId);
}

/**
 * Anexa vários, um a um (a Edge limita o ritmo), e diz como correu cada um. `aoTerminarUm` deixa o ecrã mostrar o progresso.
 * `anteriores` (opcional, por posição) traz o resultado falhado da tentativa anterior de cada ficheiro, para repetir só o que falta.
 */
export async function enviarAnexos(
  alvo: AlvoAnexo,
  ficheiros: readonly File[],
  aoTerminarUm?: (resultado: ResultadoDeUmFicheiro, indice: number) => void,
  anteriores?: ReadonlyArray<ResultadoEnvio | null | undefined>,
): Promise<ResultadoDeUmFicheiro[]> {
  const resultados: ResultadoDeUmFicheiro[] = [];
  for (const [i, ficheiro] of ficheiros.entries()) {
    const r: ResultadoDeUmFicheiro = { ...(await enviarAnexo(alvo, ficheiro, anteriores?.[i])), ficheiro };
    resultados.push(r);
    aoTerminarUm?.(r, i);
  }
  return resultados;
}

export async function removerAnexo(anexoId: string): Promise<ResultadoAnexo> {
  const r = await chamarEdge({ accao: "remover", anexo_id: anexoId });
  return r.ok ? { ok: true, codigo: null } : falhou(r.codigo);
}

/** Pede o URL assinado (60 s). A abertura do RH fica registada pela base ANTES de o URL sair. */
export async function abrirAnexo(anexoId: string): Promise<ResultadoAbrir> {
  const r = await chamarEdge({ accao: "abrir", anexo_id: anexoId });
  if (!r.ok) return { ...falhou(r.codigo), url: null, mimeType: null };
  const url = typeof r.data.url === "string" && r.data.url !== "" ? r.data.url : null;
  if (!url) return { ...falhou(CODIGO_INESPERADO), url: null, mimeType: null };
  return { ok: true, codigo: null, url, mimeType: typeof r.data.mime_type === "string" ? r.data.mime_type : null };
}

/** Os anexos verificados de uma justificação. Uma recusa ou uma RPC ainda por aplicar não é erro: `semAcesso`. */
export async function listarAnexos(alvo: AlvoListagem): Promise<ResultadoListagem> {
  try {
    const { data, error } = await hrRpc("rpc_hr_justificacao_anexos_listar", {
      _justificacao_dia_id: "justificacaoDiaId" in alvo ? alvo.justificacaoDiaId : null,
      _falta_id: "faltaId" in alvo ? alvo.faltaId : null,
    });
    if (error) return { ok: false, anexos: [], semAcesso: true };
    return { ok: true, anexos: lerAnexosListados(data), semAcesso: false };
  } catch {
    return { ok: false, anexos: [], semAcesso: true };
  }
}

/** O id do papel (`pessoas_faltas_justificacoes.id`) de uma falta, ou `null` (sem papel, ou sem permissão para o ler). */
export async function papelDaFalta(faltaId: string): Promise<string | null> {
  try {
    const { data, error } = await hrFrom("pessoas_faltas_justificacoes").select("id").eq("falta_id", faltaId).is("anulado_em", null).limit(1);
    if (error || !Array.isArray(data)) return null;
    const id = (data[0] as { id?: unknown } | undefined)?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** As operações com um sinal de «ocupado» para desactivar botões. */
export function useAnexarJustificacao() {
  const [aOcupar, setAOcupar] = useState(false);
  const comOcupado = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setAOcupar(true);
    try {
      return await fn();
    } finally {
      setAOcupar(false);
    }
  }, []);

  const anexar = useCallback(
    (
      alvo: AlvoAnexo,
      ficheiros: readonly File[],
      aoTerminarUm?: (r: ResultadoDeUmFicheiro, i: number) => void,
      anteriores?: ReadonlyArray<ResultadoEnvio | null | undefined>,
    ) => comOcupado(() => enviarAnexos(alvo, ficheiros, aoTerminarUm, anteriores)),
    [comOcupado],
  );
  const remover = useCallback((id: string) => comOcupado(() => removerAnexo(id)), [comOcupado]);
  const abrir = useCallback((id: string) => comOcupado(() => abrirAnexo(id)), [comOcupado]);
  const listar = useCallback((alvo: AlvoListagem) => listarAnexos(alvo), []);

  return { anexar, remover, abrir, listar, aOcupar };
}
