/**
 * As tres accoes de anexos do convite de admissao: `anexo_url`,
 * `anexo_confirmar` e `anexo_remover`, mais a lista de ficheiros que a accao
 * `estado` junta ao convite. Toda a logica vive aqui; o index.ts so as despacha
 * (depois do token, do hash e do rate limit por IP).
 *
 * Sem importar URLs https nem Deno: o cliente de servico entra por um tipo
 * ESTRUTURAL minimo (`ClienteAnexos`), por isso o vitest testa isto com um
 * falso.
 *
 * O CICLO DE VIDA DE UM FICHEIRO (ver as migrations dos anexos)
 * --------------------------------------------------------------
 *   anexo_url        reserva a linha (pendente) e emite um URL assinado de
 *                    upload para a QUARENTENA. O browser envia o ficheiro la.
 *   anexo_confirmar  descarrega o que chegou, le a assinatura REAL e o tamanho
 *                    REAL (nunca o que o browser declarou), calcula o SHA-256,
 *                    copia para hr-documentos e so entao liga a linha.
 *   anexo_remover    a pessoa tira um ficheiro (pendente ou ligado).
 *
 * REGRAS QUE NAO SE PODEM PARTIR
 * -------------------------------
 *  - O objecto final existe ANTES de a linha passar a ligada, e desfaz-se se a
 *    base recusar: nunca ha linha ligada sem objecto.
 *  - Nunca se apaga o objecto final de uma linha cujo descarte a base nao
 *    confirmou: se a linha estiver ligada, o objecto e o que a sustenta.
 *  - Nenhuma resposta traz organization_id nem pessoa_id (a pessoa que abre o
 *    convite nao os precisa de conhecer). O caminho final nunca sai.
 *  - Erros sao sempre `{error: codigo_estavel}`: nunca error.message da base
 *    nem do Storage.
 *  - Falhas de limpeza (remover do bucket) nao sao erro para a pessoa, MAS
 *    ficam registadas (so tipo e codigo) e a base sabe sempre o que ficou para
 *    tras: a linha guarda o caminho da quarentena (caminho_quarentena) e a
 *    limpeza devolve-o, tambem depois de ligada ou promovida; para uma linha
 *    apagada que nunca foi ligada devolve ainda os tres caminhos finais
 *    possiveis. A Edge convite-admissao-limpeza remove tudo isso.
 *
 * LIMITES CONHECIDOS (documentados, nao resolvidos aqui)
 * ------------------------------------------------------
 *  - OBJECTOS ORFAOS: quando o ligar (ou o descarte) falha com HRA31, HRA51, HRA52 ou HRA53 a
 *    copia em hr-documentos e a da quarentena ficam onde estao, de proposito (a pessoa repete a
 *    confirmacao com a sessao nova). Se nunca repetir, ficam no Storage ate haver um job de
 *    limpeza (D10, decisao do utilizador, fora desta entrega; sem segredos do Vault nao corre).
 *  - O TOKEN ASSINADO DE UPLOAD continua valido depois de `anexo_remover` ou de um descarte, ate
 *    expirar no Storage: quem o guardou pode ainda escrever nesse caminho da quarentena (upsert
 *    false: so se o objecto nao existir). Nada o liga a uma linha, por isso nunca passa a anexo;
 *    e so lixo na quarentena, que a limpeza apanha. O Storage nao deixa revogar o token.
 */
import { detectSignature, toHex } from "../_shared/fileSignature.ts";
import { UUID_RE, eUuid } from "../_shared/uuid.ts";
import {
  MIME_POR_ASSINATURA,
  extensaoDoMime,
  eTipoAnexo,
  recusaPorTamanho,
  sanitizarNomeOriginal,
  validarFicheiroReal,
  validarPedidoAnexo,
  type TipoAnexo,
} from "./anexos.ts";
import { limparAnexo } from "./conteudoAnexo.ts";
import { codigoParaOVisitante } from "./accoesPortal.ts";
import { eCodigoPublico, mapearErroRpc, statusDoCodigo } from "./erros.ts";

/**
 * BUCKET DA QUARENTENA -- A CONFIRMAR NA BASE RH (nao verificavel daqui):
 * `hr-documentos-quarantine` deve ter `file_size_limit` = 10485760 (10 MB) e
 * `allowed_mime_types` = application/pdf, image/jpeg, image/png. E a primeira
 * defesa: o Storage recusa o upload grande antes de a Edge o ler. A segunda e o
 * `tamanhoNaQuarentena` (le o tamanho nos metadados e recusa SEM descarregar).
 * Se o bucket nao tiver o limite, so a segunda protege a memoria da Edge.
 */
export const BUCKET_QUARENTENA = "hr-documentos-quarantine";
export const BUCKET_FINAL = "hr-documentos";

/** Bytes da cabeca de que a deteccao de assinatura precisa (a maior tem 12). */
const BYTES_DA_CABECA = 64;

export type AccaoAnexo = "anexo_url" | "anexo_confirmar" | "anexo_remover";

export interface RespostaAccao {
  status: number;
  body: Record<string, unknown>;
}

interface ResultadoRpc {
  data: unknown;
  error: { message?: string; code?: string; details?: string } | null;
}
interface ResultadoStorage {
  data: unknown;
  error: unknown;
}

export interface BucketAnexos {
  createSignedUploadUrl(
    caminho: string,
    opcoes?: { upsert?: boolean },
  ): PromiseLike<{ data: { token: string } | null; error: unknown }>;
  download(caminho: string): PromiseLike<{ data: { arrayBuffer(): Promise<ArrayBuffer> } | null; error: unknown }>;
  /** Lista uma pasta (os metadados trazem o tamanho): serve para recusar antes de descarregar. */
  list(
    pasta: string,
    opcoes?: { limit?: number; search?: string },
  ): PromiseLike<{ data: { name: string; metadata?: { size?: number } | null }[] | null; error: unknown }>;
  upload(
    caminho: string,
    corpo: Uint8Array,
    opcoes: { contentType: string; upsert: boolean; cacheControl?: string },
  ): PromiseLike<ResultadoStorage>;
  remove(caminhos: string[]): PromiseLike<ResultadoStorage>;
}

/** O minimo do cliente de servico de que as accoes precisam. */
export interface ClienteAnexos {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<ResultadoRpc>;
  storage: { from(bucket: string): BucketAnexos };
}

export interface PedidoAccaoAnexo {
  accao: string;
  svc: ClienteAnexos;
  tokenHash: string;
  /** SHA-256 da sessao do portal (o handler ja a exigiu): vai como `p_sessao_hash` a todas as RPCs. */
  sessaoHash: string;
  payload: Record<string, unknown> | null;
  /** IP valido ou `null` (nunca um marcador como "unknown": a coluna e inet). */
  ip: string | null;
  /** Reservado (o orquestrador passa-o); as accoes usam so o cliente de servico. */
  supabaseUrl?: string;
  /** Falhas inesperadas (Sentry). Nunca recebe token, nome nem caminho. */
  registarErro?: (erro: unknown) => void;
}

type RegistarErro = (e: unknown) => void;

const erro = (codigo: string, status = statusDoCodigo(codigo)): RespostaAccao => ({
  status,
  body: { error: codigo },
});

const inesperado = (): RespostaAccao => erro("erro_inesperado");

function comoObjecto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** O `erro` de uma resposta jsonb da base, se houver. */
function motivoDaResposta(data: unknown): string | null {
  const motivo = comoObjecto(data)?.erro;
  return typeof motivo === "string" ? motivo : null;
}

/**
 * O codigo de um erro de RPC. Desde 20270107000000 as RPCs fazem RAISE (convite
 * morto HRA02-05/HRA31, sessao HRA51-53, estado HRA38) em vez de devolver
 * {erro}; as recusas de negocio dos ficheiros continuam em jsonb. Fora do
 * catalogo = erro_inesperado, registado (sem texto).
 */
function codigoDeErroRpc(erroRpc: NonNullable<ResultadoRpc["error"]>, registarErro?: RegistarErro): string {
  const { codigo } = mapearErroRpc(erroRpc);
  if (codigo === "erro_inesperado") {
    registarErro?.(erroRpc);
    return codigo;
  }
  return codigoParaOVisitante(codigo);
}

/** Erros que nao desfazem o envio: a copia fica e a pessoa repete a confirmacao (nova sessao, ou o convite voltou). */
const ERROS_QUE_NAO_DESFAZEM: ReadonlySet<string> = new Set([
  "sessao_ausente",
  "sessao_expirada",
  "convite_invalido", // HRA31 (nao_encontrado) para o visitante
]);

/** Um motivo da base, como resposta: so codigos do catalogo; o resto e inesperado. */
function respostaDeMotivo(motivo: string, registarErro?: RegistarErro): RespostaAccao {
  if (eCodigoPublico(motivo)) return erro(motivo);
  registarErro?.(new Error("convite-admissao: motivo de anexo fora do catalogo"));
  return inesperado();
}

/**
 * Corre uma operacao de limpeza ou de desfazer e diz se resultou. Falha se
 * lancar, se trouxer `error` (Storage ou base) OU se a RPC recusar em jsonb
 * (`{erro}`): uma recusa de negocio nao e um sucesso. Regista sempre, sem texto.
 */
export async function tentar(operacao: () => PromiseLike<unknown>, registarErro?: RegistarErro): Promise<boolean> {
  try {
    const r = (await operacao()) as { data?: unknown; error?: unknown } | null;
    if (r?.error) {
      registarErro?.(r.error);
      return false;
    }
    if (motivoDaResposta(r?.data) !== null) {
      registarErro?.(new Error("convite-admissao: a base recusou uma operacao de limpeza"));
      return false;
    }
    return true;
  } catch (e) {
    registarErro?.(e);
    return false;
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

// -- anexo_url ---------------------------------------------------------------

async function accaoUrl(p: PedidoAccaoAnexo): Promise<RespostaAccao> {
  const { svc, tokenHash, sessaoHash, payload, ip, registarErro } = p;
  const tipo = payload?.tipo;
  const nome = payload?.nome;
  const tamanho = payload?.tamanho;
  const mime = payload?.mime;
  if (typeof tipo !== "string" || typeof nome !== "string" || typeof mime !== "string") {
    return erro("pedido_invalido");
  }
  if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho) || tamanho <= 0) {
    return erro("pedido_invalido");
  }

  const recusa = validarPedidoAnexo({ tipo, tamanho, mime });
  if (recusa) return erro(recusa);

  const { data, error } = await svc.rpc("rpc_hr_convite_anexo_reservar", {
    p_token_hash: tokenHash,
    p_sessao_hash: sessaoHash,
    p_tipo: tipo,
    p_nome_original: sanitizarNomeOriginal(nome),
    p_tamanho_declarado: tamanho,
    p_mime_declarado: mime.trim().toLowerCase(),
    p_ip: ip,
  });
  if (error) return erro(codigoDeErroRpc(error, registarErro));
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  const reserva = comoObjecto(data);
  const anexoId = reserva?.anexo_id;
  const caminho = reserva?.caminho;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId) || typeof caminho !== "string" || caminho === "") {
    registarErro?.(new Error("convite-admissao: reservar devolveu uma forma inesperada"));
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
    await descartar(svc, tokenHash, sessaoHash, anexoId, "upload_abandonado", registarErro);
    return erro("anexo_falha_envio");
  }

  return { status: 200, body: { ok: true, anexo_id: anexoId, caminho, upload_token: uploadToken } };
}

// -- anexo_confirmar ---------------------------------------------------------

interface ContextoAnexo {
  tipo: TipoAnexo;
  caminho: string;
  organizationId: string;
  pessoaId: string;
}

function lerContexto(data: unknown): ContextoAnexo | null {
  const c = comoObjecto(data);
  if (!c || !eTipoAnexo(c.tipo)) return null;
  const { caminho, organization_id: org, pessoa_id: pessoa } = c;
  if (typeof caminho !== "string" || caminho === "") return null;
  if (!eUuid(org) || !eUuid(pessoa)) return null;
  return { tipo: c.tipo, caminho, organizationId: org, pessoaId: pessoa };
}

/**
 * O tamanho do objecto na quarentena, lido dos metadados (sem o descarregar):
 * `em_falta` se nada chegou, `falhou` se o Storage falhou ou nao deu tamanho
 * utilizavel (fecha-se: sem tamanho nao se descarrega).
 */
async function tamanhoNaQuarentena(
  quarentena: BucketAnexos,
  caminho: string,
  registarErro?: RegistarErro,
): Promise<number | "em_falta" | "falhou"> {
  const i = caminho.lastIndexOf("/");
  const pasta = i >= 0 ? caminho.slice(0, i) : "";
  const nome = i >= 0 ? caminho.slice(i + 1) : caminho;
  try {
    const { data, error } = await quarentena.list(pasta, { limit: 100, search: nome });
    if (error) {
      registarErro?.(error);
      return "falhou";
    }
    const item = (data ?? []).find((o) => o.name === nome);
    if (!item) return "em_falta";
    const tamanho = item.metadata?.size;
    if (typeof tamanho === "number" && Number.isFinite(tamanho) && tamanho >= 0) return tamanho;
    registarErro?.(new Error("convite-admissao: o Storage nao deu o tamanho do objecto"));
    return "falhou";
  } catch (e) {
    registarErro?.(e);
    return "falhou";
  }
}

/** Recusa um ficheiro ja carregado: descarta a linha, tira-o da quarentena e responde com o codigo. */
async function recusarFicheiro(
  p: PedidoAccaoAnexo,
  anexoId: string,
  caminho: string,
  codigo: string,
): Promise<RespostaAccao> {
  const { svc, tokenHash, sessaoHash, registarErro } = p;
  // Se a remocao falhar, a linha apagada guarda o caminho e a limpeza apanha-o.
  await descartar(svc, tokenHash, sessaoHash, anexoId, motivoDeDescarte(codigo), registarErro);
  await tentar(() => svc.storage.from(BUCKET_QUARENTENA).remove([caminho]), registarErro);
  return erro(codigo);
}

function motivoDeDescarte(codigo: string): "demasiado_grande" | "formato_invalido" {
  return codigo === "anexo_demasiado_grande" || codigo === "anexo_fotografia_demasiado_grande"
    ? "demasiado_grande"
    : "formato_invalido";
}

/** Diz se a base confirmou o descarte (uma recusa em jsonb tambem conta como nao). */
function descartar(
  svc: ClienteAnexos,
  tokenHash: string,
  sessaoHash: string,
  anexoId: string,
  motivo: string,
  registarErro?: RegistarErro,
): Promise<boolean> {
  return tentar(
    () => svc.rpc("rpc_hr_convite_anexo_descartar", {
      p_token_hash: tokenHash,
      p_sessao_hash: sessaoHash,
      p_anexo_id: anexoId,
      p_motivo: motivo,
    }),
    registarErro,
  );
}

/** O erro do Storage diz que o objecto nao existe (nao chegou nada), e nao que o Storage falhou? */
function eObjectoEmFalta(erroDownload: unknown): boolean {
  const e = comoObjecto(erroDownload);
  if (!e) return false;
  const estado = String(e.statusCode ?? e.status ?? "");
  return estado === "404" || (typeof e.message === "string" && /not.?found/i.test(e.message));
}

/**
 * Descarrega um objecto (o que o browser enviou para a quarentena, p. ex.);
 * `null` se nao ha nada OU se o Storage falhou. So a segunda fica registada
 * (o erro, nunca o conteudo): "nao chegou nada" e um resultado normal.
 */
export async function lerObjecto(
  quarentena: BucketAnexos,
  caminho: string,
  registarErro?: RegistarErro,
): Promise<Uint8Array | null> {
  try {
    const { data: blob, error: erroDownload } = await quarentena.download(caminho);
    if (!erroDownload && blob) return new Uint8Array(await blob.arrayBuffer());
    if (erroDownload && !eObjectoEmFalta(erroDownload)) registarErro?.(erroDownload);
  } catch (e) {
    registarErro?.(e);
  }
  return null;
}

/**
 * Copia os bytes para hr-documentos (upsert false: nunca se sobrepoe a nada).
 * Se o upload falha porque o objecto final JA la esta com exactamente o mesmo
 * conteudo (uma tentativa anterior morreu entre a copia e a ligacao), conta como
 * sucesso: repetir a confirmacao nao pode ficar presa para sempre.
 */
export async function copiarParaFinal(
  final: BucketAnexos,
  caminhoFinal: string,
  bytes: Uint8Array,
  mime: string,
  hash: string,
  registarErro?: RegistarErro,
): Promise<boolean> {
  // cacheControl "0": o documento de identificacao nao fica em caches intermedias.
  if (
    await tentar(
      () => final.upload(caminhoFinal, bytes, { contentType: mime, upsert: false, cacheControl: "0" }),
      registarErro,
    )
  ) {
    return true;
  }
  const existente = await lerObjecto(final, caminhoFinal, registarErro);
  return existente !== null && (await sha256Hex(existente)) === hash;
}

interface DadosDaLigacao {
  svc: ClienteAnexos;
  tokenHash: string;
  sessaoHash: string;
  anexoId: string;
  tipo: TipoAnexo;
  caminhoFinal: string;
  caminhoQuarentena: string;
  mime: string;
  tamanho: number;
  hash: string;
  registarErro?: RegistarErro;
}

/**
 * Desfaz uma copia que a base nao aceitou. O objecto final so se apaga depois de
 * a base confirmar o descarte da linha: sem essa confirmacao a linha pode estar
 * ligada, e o objecto e o que a sustenta (a invariante: nunca ha linha ligada
 * sem objecto). Se o descarte falhar, a linha pendente expira e a limpeza devolve
 * os caminhos finais possiveis; se o remove falhar, o mesmo. Nada e engolido: cada
 * falha fica registada, sem texto.
 */
async function desfazerCopia(d: DadosDaLigacao): Promise<void> {
  const descartado = await descartar(d.svc, d.tokenHash, d.sessaoHash, d.anexoId, "upload_abandonado", d.registarErro);
  if (!descartado) return;
  await tentar(() => d.svc.storage.from(BUCKET_FINAL).remove([d.caminhoFinal]), d.registarErro);
  await tentar(() => d.svc.storage.from(BUCKET_QUARENTENA).remove([d.caminhoQuarentena]), d.registarErro);
}

/** Liga a linha ao objecto final; se a base recusar ou rebentar, desfaz e devolve a resposta. */
async function ligarOuDesfazer(
  d: DadosDaLigacao,
): Promise<{ anexo: Record<string, unknown> } | { resposta: RespostaAccao }> {
  let ligado: ResultadoRpc;
  try {
    ligado = await d.svc.rpc("rpc_hr_convite_anexo_ligar", {
      p_token_hash: d.tokenHash,
      p_sessao_hash: d.sessaoHash,
      p_anexo_id: d.anexoId,
      p_caminho_final: d.caminhoFinal,
      p_mime: d.mime,
      p_tamanho: d.tamanho,
      p_hash: d.hash,
    });
  } catch (e) {
    d.registarErro?.(e);
    await desfazerCopia(d);
    return { resposta: inesperado() };
  }
  if (ligado.error) {
    // RAISE da base (sessao, convite, estado). Sessao caida ou convite nao encontrado
    // NAO desfazem o envio: a copia e a linha pendente ficam e a pessoa repete a
    // confirmacao (a copia identica conta como feita). Os restantes (processo ja
    // submetido ou encerrado, bloqueado...) desfazem, porque ja nao ha onde ligar.
    const codigo = codigoDeErroRpc(ligado.error, d.registarErro);
    if (!ERROS_QUE_NAO_DESFAZEM.has(codigo)) await desfazerCopia(d);
    return { resposta: erro(codigo) };
  }
  const motivo = motivoDaResposta(ligado.data);
  // anexo_estado_invalido ao ligar = a linha ja nao esta pendente: OUTRA confirmacao em paralelo (duplo
  // clique, repeticao) acabou de a ligar, e o objecto final e o MESMO caminho. Desfazer aqui apagava um
  // anexo ligado. Trata-se como ja ligado: nada se descarta nem se remove, e responde-se com o que se sabe
  // (o nome so a outra chamada o conhece; o ecra junta as duas respostas pelo id).
  if (motivo === "anexo_estado_invalido") {
    return {
      anexo: { id: d.anexoId, tipo: d.tipo, nome_original: null, tamanho_bytes: d.tamanho, mime_type: d.mime },
    };
  }
  const anexo = comoObjecto(comoObjecto(ligado.data)?.anexo);
  if (motivo || !anexo) {
    await desfazerCopia(d);
    return { resposta: motivo ? respostaDeMotivo(motivo, d.registarErro) : inesperado() };
  }
  return { anexo };
}

async function accaoConfirmar(p: PedidoAccaoAnexo): Promise<RespostaAccao> {
  const { svc, tokenHash, sessaoHash, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  const { data: dadosContexto, error: erroContexto } = await svc.rpc("rpc_hr_convite_anexo_contexto", {
    p_token_hash: tokenHash,
    p_sessao_hash: sessaoHash,
    p_anexo_id: anexoId,
  });
  if (erroContexto) return erro(codigoDeErroRpc(erroContexto, registarErro));
  const motivoContexto = motivoDaResposta(dadosContexto);
  if (motivoContexto) return respostaDeMotivo(motivoContexto, registarErro);
  const contexto = lerContexto(dadosContexto);
  if (!contexto) {
    registarErro?.(new Error("convite-admissao: contexto do anexo com forma inesperada"));
    return inesperado();
  }

  const quarentena = svc.storage.from(BUCKET_QUARENTENA);

  // ANTES de descarregar: o tamanho vem dos metadados do Storage e um objecto
  // acima do tecto nunca chega a memoria da Edge.
  const medido = await tamanhoNaQuarentena(quarentena, contexto.caminho, registarErro);
  if (medido === "em_falta") return erro("anexo_nao_carregado");
  if (medido === "falhou") return erro("anexo_falha_envio");
  const recusaTamanho = recusaPorTamanho(contexto.tipo, medido);
  if (recusaTamanho) return await recusarFicheiro(p, anexoId, contexto.caminho, recusaTamanho);

  const lido = await lerObjecto(quarentena, contexto.caminho, registarErro);
  if (!lido) return erro("anexo_nao_carregado");

  const assinatura = detectSignature(lido.subarray(0, BYTES_DA_CABECA));
  const recusa = validarFicheiroReal({ tipo: contexto.tipo, assinatura, tamanho: lido.length });
  if (recusa) return await recusarFicheiro(p, anexoId, contexto.caminho, recusa);

  // Conteudo: PDF com accoes activas recusado; imagem sem EXIF nem bytes depois do fim.
  // O hash e o tamanho gravados sao os dos bytes LIMPOS, que sao os que ficam guardados.
  const limpo = await limparAnexo(assinatura as string, lido);
  if (!limpo.ok) return await recusarFicheiro(p, anexoId, contexto.caminho, "anexo_conteudo_recusado");
  const bytes = limpo.bytes;
  const tamanho = bytes.length;

  const mime = MIME_POR_ASSINATURA[assinatura as string];
  const extensao = extensaoDoMime(mime);
  if (!extensao) return inesperado();
  const hash = await sha256Hex(bytes);
  const caminhoFinal = `${contexto.organizationId}/${contexto.pessoaId}/admissao/${anexoId}.${extensao}`;

  // O objecto final tem de existir ANTES de a linha ficar ligada.
  if (!(await copiarParaFinal(svc.storage.from(BUCKET_FINAL), caminhoFinal, bytes, mime, hash, registarErro))) {
    return erro("anexo_falha_envio");
  }

  const resultado = await ligarOuDesfazer({
    svc, tokenHash, sessaoHash, anexoId, tipo: contexto.tipo, caminhoFinal, caminhoQuarentena: contexto.caminho, mime, tamanho, hash, registarErro,
  });
  if ("resposta" in resultado) return resultado.resposta;
  const { anexo } = resultado;

  // Depois de ligar, a linha aponta para o objecto final mas GUARDA o caminho da
  // quarentena (caminho_quarentena). Se este remove falhar, fica registado e a
  // limpeza devolve-o na proxima volta: a copia do documento nao fica orfa.
  await tentar(() => quarentena.remove([contexto.caminho]), registarErro);

  return {
    status: 200,
    body: {
      ok: true,
      anexo: {
        id: anexo.id ?? anexoId,
        tipo: anexo.tipo,
        nome_original: anexo.nome_original,
        tamanho_bytes: anexo.tamanho_bytes,
        mime_type: anexo.mime_type,
      },
    },
  };
}

// -- anexo_remover -----------------------------------------------------------

interface AlvoDeRemocao {
  bucket: string;
  caminho: string;
}

/** Os objectos que a base diz existirem agora (o da linha e a copia da quarentena), sem repetidos. */
export function alvosDoDescarte(data: unknown): AlvoDeRemocao[] {
  const r = comoObjecto(data);
  const alvos = new Map<string, AlvoDeRemocao>();
  const acrescentar = (bucket: unknown, caminho: unknown) => {
    if ((bucket === BUCKET_QUARENTENA || bucket === BUCKET_FINAL) && typeof caminho === "string" && caminho !== "") {
      alvos.set(`${bucket}\u0000${caminho}`, { bucket, caminho });
    }
  };
  acrescentar(r?.bucket, r?.caminho);
  acrescentar(BUCKET_QUARENTENA, r?.caminho_quarentena);
  return [...alvos.values()];
}

async function accaoRemover(p: PedidoAccaoAnexo): Promise<RespostaAccao> {
  const { svc, tokenHash, sessaoHash, payload, registarErro } = p;
  const anexoId = payload?.anexo_id;
  if (typeof anexoId !== "string" || !UUID_RE.test(anexoId)) return erro("pedido_invalido");

  // O motivo e FIXO, escolhido aqui: nada do pedido o altera. E o unico motivo que
  // a base abre com sessao e estado; os internos (formato, tamanho, abandono) so
  // existem do lado do servidor.
  const { data, error } = await svc.rpc("rpc_hr_convite_anexo_descartar", {
    p_token_hash: tokenHash,
    p_sessao_hash: sessaoHash,
    p_anexo_id: anexoId,
    p_motivo: "removido_pela_pessoa",
  });
  if (error) return erro(codigoDeErroRpc(error, registarErro));
  const motivo = motivoDaResposta(data);
  if (motivo) return respostaDeMotivo(motivo, registarErro);

  // A linha ja esta apagada: tirar os objectos e o que resta. Uma falha aqui nao
  // e erro para a pessoa (fica registada) e a limpeza apanha o que ficar.
  for (const alvo of alvosDoDescarte(data)) {
    await tentar(() => svc.storage.from(alvo.bucket).remove([alvo.caminho]), registarErro);
  }
  return { status: 200, body: { ok: true } };
}

// -- despacho ----------------------------------------------------------------

export const ACCOES_ANEXO: readonly string[] = ["anexo_url", "anexo_confirmar", "anexo_remover"];

export function eAccaoAnexo(accao: unknown): accao is AccaoAnexo {
  return typeof accao === "string" && ACCOES_ANEXO.includes(accao);
}

export async function tratarAccaoAnexo(pedido: PedidoAccaoAnexo): Promise<RespostaAccao> {
  const normalizado = { ...pedido, payload: comoObjecto(pedido.payload) };
  try {
    switch (pedido.accao) {
      case "anexo_url":
        return await accaoUrl(normalizado);
      case "anexo_confirmar":
        return await accaoConfirmar(normalizado);
      case "anexo_remover":
        return await accaoRemover(normalizado);
      default:
        return erro("accao_desconhecida");
    }
  } catch (e) {
    pedido.registarErro?.(e);
    return inesperado();
  }
}
