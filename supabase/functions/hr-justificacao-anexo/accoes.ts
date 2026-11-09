/**
 * As quatro accoes humanas dos anexos de uma justificacao (do dia ou o papel de
 * uma falta): `url`, `confirmar`, `remover` e `abrir`. Sem Deno nem rede: o
 * cliente de servico entra por um tipo estrutural, por isso o vitest testa isto
 * com um falso.
 *
 * QUEM DECIDE E A BASE. Todas as verificacoes de quem pode (propria pessoa,
 * RH com .edit, RH com .view), de organizacao, de justificacao ainda pendente e
 * de limites estao nas RPCs rpc_hr_justificacao_anexo_* (20270111610000), que
 * recebem o utilizador em `p_auth_uid` e tiram a organizacao e a pessoa da
 * PROPRIA linha. Esta Edge nunca le tabelas: por isso nao ha aqui nenhuma query
 * com a chave de servico a tabelas com organization_id para filtrar (a unica
 * tabela tocada, no index, e rate_limit_attempts, que nao tem organizacao).
 * Nada do pedido (organizacao, pessoa, caminho) e confiado.
 *
 * CICLO DE VIDA
 *   url        reserva a linha (quarentena) e emite o token de upload assinado
 *              para hr-documentos-quarantine.
 *   confirmar  mede o tamanho SEM descarregar, le a assinatura REAL, limpa o
 *              conteudo (limparAnexo), copia os bytes limpos para
 *              hr-justificacoes e so entao passa a linha a verificado.
 *   remover    a base marca como removido; a Edge apaga os objectos.
 *   abrir      a base regista o acesso (se for caso) ANTES de devolver o
 *              caminho; a Edge emite um URL assinado de 60 s. O caminho nunca sai.
 *
 * Respostas de erro: `{error: codigo_estavel}`; nunca texto da base nem do
 * Storage, nunca caminhos finais, organizacao ou pessoa.
 */
import { detectSignature } from "../_shared/fileSignature.ts";
import { UUID_RE, eUuid } from "../_shared/uuid.ts";
import {
  LIMITES,
  MIME_POR_ASSINATURA,
  extensaoDoMime,
  sanitizarNomeOriginal,
} from "../convite-admissao/anexos.ts";
import {
  BUCKET_QUARENTENA,
  copiarParaFinal,
  lerObjecto,
  sha256Hex,
  tamanhoNaQuarentena,
  tentar,
  type BucketAnexos,
} from "../convite-admissao/accoesAnexos.ts";
import { limparAnexo } from "../convite-admissao/conteudoAnexo.ts";

export { BUCKET_QUARENTENA };
export const BUCKET_JUSTIFICACOES = "hr-justificacoes";
/** O URL de abertura vale 60 s (o mesmo que os documentos sensiveis). */
export const TTL_ABERTURA_SEGUNDOS = 60;
const BYTES_DA_CABECA = 64;

export type AccaoHumana = "url" | "confirmar" | "remover" | "abrir";
export const ACCOES_HUMANAS: readonly string[] = ["url", "confirmar", "remover", "abrir"];

export function eAccaoHumana(accao: unknown): accao is AccaoHumana {
  return typeof accao === "string" && ACCOES_HUMANAS.includes(accao);
}

export interface RespostaAccao {
  status: number;
  body: Record<string, unknown>;
}

interface ResultadoRpc {
  data: unknown;
  error: { message?: string; code?: string; details?: string } | null;
}

export interface BucketJustificacao extends BucketAnexos {
  createSignedUrl(
    caminho: string,
    ttlSegundos: number,
  ): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
}

/** O minimo do cliente de servico de que as accoes precisam. */
export interface ClienteJustificacao {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<ResultadoRpc>;
  storage: { from(bucket: string): BucketJustificacao };
}

export interface PedidoAccao {
  accao: string;
  svc: ClienteJustificacao;
  /** auth uid do utilizador real que pediu (nunca service_role). */
  authUid: string;
  payload: Record<string, unknown> | null;
  /** Falhas inesperadas (Sentry). Nunca recebe nomes, caminhos nem conteudo. */
  registarErro?: (erro: unknown) => void;
}

type RegistarErro = (e: unknown) => void;

/** O estado HTTP de cada codigo que a Edge pode devolver. Fora desta lista = erro_inesperado. */
const STATUS_POR_CODIGO: Readonly<Record<string, number>> = {
  pedido_invalido: 400,
  accao_desconhecida: 400,
  sem_sessao: 401,
  sem_permissao: 403,
  justificacao_nao_encontrada: 404,
  anexo_nao_encontrado: 404,
  justificacao_decidida: 409,
  anexo_estado_invalido: 409,
  anexo_maximo_ficheiros: 409,
  anexo_limite_reservas: 409,
  anexo_nao_carregado: 409,
  anexo_formato_invalido: 422,
  anexo_vazio: 422,
  anexo_demasiado_grande: 422,
  anexo_conteudo_recusado: 422,
  rate_limited: 429,
  erro_inesperado: 500,
  anexo_falha_envio: 502,
  erro_url: 502,
};

const erro = (codigo: string): RespostaAccao => ({
  status: Object.hasOwn(STATUS_POR_CODIGO, codigo) ? STATUS_POR_CODIGO[codigo] : 500,
  body: { error: codigo },
});
const inesperado = (): RespostaAccao => erro("erro_inesperado");

function comoObjecto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function motivoDaResposta(data: unknown): string | null {
  const motivo = comoObjecto(data)?.erro;
  return typeof motivo === "string" ? motivo : null;
}

/** Um `erro` da base, como resposta: so codigos conhecidos; o resto e inesperado e fica registado (sem texto). */
function respostaDeMotivo(motivo: string, registarErro?: RegistarErro): RespostaAccao {
  if (Object.hasOwn(STATUS_POR_CODIGO, motivo)) return erro(motivo);
  registarErro?.(new Error("hr-justificacao-anexo: motivo da base fora do catalogo"));
  return inesperado();
}

const MIMES_ACEITES: readonly string[] = Object.values(MIME_POR_ASSINATURA);

// -- url ---------------------------------------------------------------------

function idOpcional(valor: unknown): string | null | "invalido" {
  if (valor === undefined || valor === null) return null;
  return eUuid(valor) ? valor : "invalido";
}

async function accaoUrl(p: PedidoAccao): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const dia = idOpcional(payload?.justificacao_dia_id);
  const falta = idOpcional(payload?.falta_justificacao_id);
  if (dia === "invalido" || falta === "invalido" || (dia === null) === (falta === null)) {
    return erro("pedido_invalido");
  }
  const nome = payload?.nome;
  const tamanho = payload?.tamanho;
  const mime = payload?.mime;
  if (typeof nome !== "string" || typeof mime !== "string") return erro("pedido_invalido");
  if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho)) return erro("pedido_invalido");

  // Primeira recusa, antes de gastar uma reserva; a base repete-as.
  const mimeLimpo = mime.trim().toLowerCase();
  if (!MIMES_ACEITES.includes(mimeLimpo)) return erro("anexo_formato_invalido");
  if (tamanho <= 0) return erro("anexo_vazio");
  if (tamanho > LIMITES.tamanhoMaxBytes) return erro("anexo_demasiado_grande");

  const { data, error } = await svc.rpc("rpc_hr_justificacao_anexo_reservar", {
    p_auth_uid: authUid,
    p_justificacao_dia_id: dia,
    p_falta_justificacao_id: falta,
    p_nome_original: sanitizarNomeOriginal(nome),
    p_tamanho_declarado: tamanho,
    p_mime_declarado: mimeLimpo,
  });
  if (error) {
    registarErro?.(error);
    return inesperado();
  }
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  const reserva = comoObjecto(data);
  const anexoId = reserva?.anexo_id;
  const caminho = reserva?.caminho;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId) || typeof caminho !== "string" || caminho === "") {
    registarErro?.(new Error("hr-justificacao-anexo: reservar devolveu uma forma inesperada"));
    return inesperado();
  }

  let uploadToken: string | null = null;
  try {
    const { data: assinado, error: erroAssinar } = await svc.storage
      .from(BUCKET_QUARENTENA)
      .createSignedUploadUrl(caminho, { upsert: false });
    if (erroAssinar) registarErro?.(erroAssinar);
    uploadToken = typeof assinado?.token === "string" && assinado.token !== "" ? assinado.token : null;
  } catch (e) {
    registarErro?.(e);
  }
  if (!uploadToken) {
    // A reserva conta para os tectos: liberta-a em vez de a deixar a ocupar uma vaga.
    await descartar(svc, authUid, anexoId, "upload_abandonado", registarErro);
    return erro("anexo_falha_envio");
  }

  // O caminho da QUARENTENA e preciso ao browser para o upload assinado; e
  // justificacoes/<id>.<ext> e nao diz nada da organizacao nem da pessoa.
  return {
    status: 200,
    body: { ok: true, anexo_id: anexoId, bucket: BUCKET_QUARENTENA, caminho, upload_token: uploadToken },
  };
}

// -- confirmar ---------------------------------------------------------------

interface ContextoAnexo {
  caminho: string;
  organizationId: string;
  pessoaId: string;
  justificacaoId: string;
}

function lerContexto(data: unknown): ContextoAnexo | null {
  const c = comoObjecto(data);
  if (!c) return null;
  const { caminho, organization_id: org, pessoa_id: pessoa, justificacao_id: just } = c;
  if (typeof caminho !== "string" || caminho === "") return null;
  if (!eUuid(org) || !eUuid(pessoa) || !eUuid(just)) return null;
  return { caminho, organizationId: org, pessoaId: pessoa, justificacaoId: just };
}

/** Diz se a base confirmou o descarte (uma recusa em jsonb tambem conta como nao). */
function descartar(
  svc: ClienteJustificacao,
  authUid: string,
  anexoId: string,
  motivo: "upload_abandonado" | "formato_invalido" | "demasiado_grande" | "conteudo_recusado",
  registarErro?: RegistarErro,
): Promise<boolean> {
  return tentar(
    () => svc.rpc("rpc_hr_justificacao_anexo_descartar", { p_auth_uid: authUid, p_anexo_id: anexoId, p_motivo: motivo }),
    registarErro,
  );
}

/** Recusa um ficheiro ja carregado: descarta a linha, tira-o da quarentena e responde com o codigo. */
async function recusarFicheiro(
  p: PedidoAccao,
  anexoId: string,
  caminhoQuarentena: string,
  motivo: "formato_invalido" | "demasiado_grande" | "conteudo_recusado",
  codigo: string,
): Promise<RespostaAccao> {
  // Se a remocao falhar, a linha recusada guarda o caminho e a limpeza apanha-o.
  await descartar(p.svc, p.authUid, anexoId, motivo, p.registarErro);
  await tentar(() => p.svc.storage.from(BUCKET_QUARENTENA).remove([caminhoQuarentena]), p.registarErro);
  return erro(codigo);
}

async function accaoConfirmar(p: PedidoAccao): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  const { data: dadosContexto, error: erroContexto } = await svc.rpc("rpc_hr_justificacao_anexo_contexto", {
    p_auth_uid: authUid,
    p_anexo_id: anexoId,
  });
  if (erroContexto) {
    registarErro?.(erroContexto);
    return inesperado();
  }
  const motivoContexto = motivoDaResposta(dadosContexto);
  if (motivoContexto === "justificacao_decidida") {
    // Ja nao aceita anexos: o envio de quem o reservou sai (a base deixa-o sempre).
    const caminho = lerContexto(dadosContexto)?.caminho;
    await descartar(svc, authUid, anexoId, "upload_abandonado", registarErro);
    if (caminho) await tentar(() => svc.storage.from(BUCKET_QUARENTENA).remove([caminho]), registarErro);
    return erro("justificacao_decidida");
  }
  if (motivoContexto) return respostaDeMotivo(motivoContexto, registarErro);
  const contexto = lerContexto(dadosContexto);
  if (!contexto) {
    registarErro?.(new Error("hr-justificacao-anexo: contexto do anexo com forma inesperada"));
    return inesperado();
  }

  const quarentena = svc.storage.from(BUCKET_QUARENTENA);

  // ANTES de descarregar: o tamanho vem dos metadados do Storage e um objecto
  // acima do tecto nunca chega a memoria da Edge.
  const medido = await tamanhoNaQuarentena(quarentena, contexto.caminho, registarErro);
  if (medido === "em_falta") return erro("anexo_nao_carregado");
  if (medido === "falhou") return erro("anexo_falha_envio");
  if (medido <= 0) return await recusarFicheiro(p, anexoId, contexto.caminho, "formato_invalido", "anexo_vazio");
  if (medido > LIMITES.tamanhoMaxBytes) {
    return await recusarFicheiro(p, anexoId, contexto.caminho, "demasiado_grande", "anexo_demasiado_grande");
  }

  const lido = await lerObjecto(quarentena, contexto.caminho, registarErro);
  if (!lido) return erro("anexo_nao_carregado");

  const assinatura = detectSignature(lido.subarray(0, BYTES_DA_CABECA));
  if (!assinatura || !Object.hasOwn(MIME_POR_ASSINATURA, assinatura)) {
    return await recusarFicheiro(p, anexoId, contexto.caminho, "formato_invalido", "anexo_formato_invalido");
  }
  if (lido.length <= 0) return await recusarFicheiro(p, anexoId, contexto.caminho, "formato_invalido", "anexo_vazio");
  if (lido.length > LIMITES.tamanhoMaxBytes) {
    return await recusarFicheiro(p, anexoId, contexto.caminho, "demasiado_grande", "anexo_demasiado_grande");
  }

  // Conteudo: PDF com accoes activas recusado; imagem sem EXIF nem bytes depois do fim.
  // O hash e o tamanho gravados sao os dos bytes LIMPOS, que sao os que ficam guardados.
  const limpo = await limparAnexo(assinatura, lido);
  if (!limpo.ok) {
    return await recusarFicheiro(p, anexoId, contexto.caminho, "conteudo_recusado", "anexo_conteudo_recusado");
  }
  const bytes = limpo.bytes;
  const mime = MIME_POR_ASSINATURA[assinatura];
  const extensao = extensaoDoMime(mime);
  if (!extensao) return inesperado();
  const hash = await sha256Hex(bytes);
  const caminhoFinal = `${contexto.organizationId}/${contexto.pessoaId}/${contexto.justificacaoId}/${anexoId}.${extensao}`;

  // O objecto final tem de existir ANTES de a linha ficar verificada.
  const final = svc.storage.from(BUCKET_JUSTIFICACOES);
  if (!(await copiarParaFinal(final, caminhoFinal, bytes, mime, hash, registarErro))) {
    return erro("anexo_falha_envio");
  }

  let verificado: ResultadoRpc;
  try {
    verificado = await svc.rpc("rpc_hr_justificacao_anexo_verificar", {
      p_auth_uid: authUid,
      p_anexo_id: anexoId,
      p_caminho_final: caminhoFinal,
      p_mime: mime,
      p_tamanho: bytes.length,
      p_hash: hash,
    });
  } catch (e) {
    // Nao se sabe se a base chegou a verificar: nada se apaga (o objecto final
    // pode ser o que sustenta uma linha verificada). Se a linha ficou em
    // quarentena, a limpeza apanha os caminhos finais possiveis.
    registarErro?.(e);
    return inesperado();
  }
  if (verificado.error) {
    registarErro?.(verificado.error);
    return inesperado();
  }
  const motivo = motivoDaResposta(verificado.data);
  if (motivo) {
    // estado_invalido: outra chamada mexeu na linha (confirmou em paralelo, ou a
    // pessoa removeu-a). Nao se sabe de quem e o objecto final: nada se apaga, e
    // a limpeza apanha o que sobrar (para linhas nunca verificadas).
    if (motivo !== "anexo_estado_invalido" && motivo !== "anexo_nao_encontrado") {
      await desfazerCopia(p, anexoId, caminhoFinal, contexto.caminho);
    }
    return respostaDeMotivo(motivo, registarErro);
  }
  const anexo = comoObjecto(comoObjecto(verificado.data)?.anexo);
  if (!anexo) {
    registarErro?.(new Error("hr-justificacao-anexo: verificar devolveu uma forma inesperada"));
    return inesperado();
  }

  // A copia da quarentena sai ja; se falhar, a limpeza apanha-a (caminho_quarentena fica na linha).
  await tentar(() => quarentena.remove([contexto.caminho]), registarErro);

  return {
    status: 200,
    body: {
      ok: true,
      anexo: {
        id: anexo.id ?? anexoId,
        nome_original: anexo.nome_original ?? null,
        tamanho_bytes: anexo.tamanho_bytes ?? bytes.length,
        mime_type: anexo.mime_type ?? mime,
      },
    },
  };
}

/**
 * Desfaz uma copia que a base nao aceitou. O objecto final so se apaga depois de
 * a base confirmar o descarte da linha: sem essa confirmacao a linha pode estar
 * verificada, e o objecto e o que a sustenta.
 */
async function desfazerCopia(
  p: PedidoAccao,
  anexoId: string,
  caminhoFinal: string,
  caminhoQuarentena: string,
): Promise<void> {
  const descartado = await descartar(p.svc, p.authUid, anexoId, "upload_abandonado", p.registarErro);
  if (!descartado) return;
  await tentar(() => p.svc.storage.from(BUCKET_JUSTIFICACOES).remove([caminhoFinal]), p.registarErro);
  await tentar(() => p.svc.storage.from(BUCKET_QUARENTENA).remove([caminhoQuarentena]), p.registarErro);
}

// -- remover -----------------------------------------------------------------

interface AlvoDeRemocao {
  bucket: string;
  caminho: string;
}

/** Os objectos que a base diz existirem agora (o da linha e a copia da quarentena), sem repetidos. */
export function alvosDaRemocao(data: unknown): AlvoDeRemocao[] {
  const r = comoObjecto(data);
  const alvos = new Map<string, AlvoDeRemocao>();
  const acrescentar = (bucket: unknown, caminho: unknown) => {
    if ((bucket === BUCKET_QUARENTENA || bucket === BUCKET_JUSTIFICACOES) && typeof caminho === "string" && caminho !== "") {
      alvos.set(`${bucket}\u0000${caminho}`, { bucket, caminho });
    }
  };
  acrescentar(r?.bucket, r?.caminho);
  acrescentar(BUCKET_QUARENTENA, r?.caminho_quarentena);
  return [...alvos.values()];
}

async function accaoRemover(p: PedidoAccao): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  const { data, error } = await svc.rpc("rpc_hr_justificacao_anexo_remover", { p_auth_uid: authUid, p_anexo_id: anexoId });
  if (error) {
    registarErro?.(error);
    return inesperado();
  }
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  // A linha ja esta removida: tirar os objectos. Uma falha aqui nao e erro para
  // quem remove (fica registada) e a limpeza apanha o que ficar.
  let tudoSaiu = true;
  for (const alvo of alvosDaRemocao(data)) {
    const saiu = await tentar(() => svc.storage.from(alvo.bucket).remove([alvo.caminho]), registarErro);
    tudoSaiu = tudoSaiu && saiu;
  }
  // A base so marca o que ja nao pode receber outro objecto; o resto volta na limpeza.
  if (tudoSaiu) {
    await tentar(() => svc.rpc("rpc_hr_justificacao_anexo_objecto_removido", { p_ids: [anexoId] }), registarErro);
  }
  return { status: 200, body: { ok: true } };
}

// -- abrir -------------------------------------------------------------------

async function accaoAbrir(p: PedidoAccao): Promise<RespostaAccao> {
  const { svc, authUid, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  // A base regista o acesso (quando e do RH) DENTRO desta chamada, antes de
  // devolver o caminho: nao ha URL sem registo. Se falhar, nao sai URL.
  const { data, error } = await svc.rpc("rpc_hr_justificacao_anexo_autorizar_abertura", {
    p_auth_uid: authUid,
    p_anexo_id: anexoId,
  });
  if (error) {
    registarErro?.(error);
    return inesperado();
  }
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  const r = comoObjecto(data);
  if (!r || r.ok !== true || r.bucket !== BUCKET_JUSTIFICACOES || typeof r.caminho !== "string" || r.caminho === "") {
    registarErro?.(new Error("hr-justificacao-anexo: autorizar_abertura devolveu uma forma inesperada"));
    return inesperado();
  }

  let signedUrl: string | null = null;
  try {
    const { data: assinado, error: erroUrl } = await svc.storage
      .from(BUCKET_JUSTIFICACOES)
      .createSignedUrl(r.caminho, TTL_ABERTURA_SEGUNDOS);
    if (erroUrl) registarErro?.(erroUrl);
    signedUrl = typeof assinado?.signedUrl === "string" && assinado.signedUrl !== "" ? assinado.signedUrl : null;
  } catch (e) {
    registarErro?.(e);
  }
  if (!signedUrl) return erro("erro_url");

  return {
    status: 200,
    body: {
      ok: true,
      url: signedUrl,
      expiraEmSegundos: TTL_ABERTURA_SEGUNDOS,
      mime_type: typeof r.mime_type === "string" ? r.mime_type : null,
      // Sem `nome_original`: pode ser dado de saúde e a listagem esconde-o a quem não o pode ver.
    },
  };
}

// -- despacho ----------------------------------------------------------------

export async function tratarAccaoHumana(pedido: PedidoAccao): Promise<RespostaAccao> {
  const normalizado = { ...pedido, payload: comoObjecto(pedido.payload) };
  try {
    switch (pedido.accao) {
      case "url":
        return await accaoUrl(normalizado);
      case "confirmar":
        return await accaoConfirmar(normalizado);
      case "remover":
        return await accaoRemover(normalizado);
      case "abrir":
        return await accaoAbrir(normalizado);
      default:
        return erro("accao_desconhecida");
    }
  } catch (e) {
    pedido.registarErro?.(e);
    return inesperado();
  }
}
