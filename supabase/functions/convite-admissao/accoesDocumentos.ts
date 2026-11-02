/**
 * As accoes de DOCUMENTOS do portal do colaborador (admissao): ver o contrato e os
 * documentos que o RH partilhou, assina-los com um codigo por SMS, recusar, enviar
 * ficheiros de resposta a um pedido do RH e pedir documentos ao RH. Mais a accao
 * de RH `documentos_avisar` (e-mail a dizer que ha documentos no portal).
 *
 * Publicas (so token do link + SESSAO do OTP por e-mail): o handler aplica o rate
 * limit por IP e por token_hash com `tectoDocumentosPorHora`. Cada accao chama uma
 * RPC `service_role` de 20270101460000 que verifica a sessao e a janela de
 * documentos (HRA51/52/53/63):
 *   doc_ler             -> rpc_hr_portal_documentos_ler
 *   doc_conteudo        -> rpc_hr_portal_documento_conteudo
 *   doc_ficheiro_url    -> rpc_hr_portal_documento_ficheiro (+ URL assinado de 60 s)
 *   doc_codigo          -> rpc_hr_portal_documento_codigo_pedir (+ SMS)
 *   doc_assinar         -> rpc_hr_portal_documento_assinar
 *   doc_recusar         -> rpc_hr_portal_documento_recusar
 *   doc_pedido_url      -> rpc_hr_portal_pedido_ficheiro_reservar (+ URL de upload para a quarentena)
 *   doc_pedido_confirmar-> rpc_hr_portal_pedido_ficheiro_ligar (depois da copia para hr-documentos)
 *   doc_pedido_remover  -> rpc_hr_portal_pedido_ficheiro_remover
 *   doc_pedido_enviar   -> rpc_hr_portal_pedido_enviar
 *   doc_pedir_rh        -> rpc_hr_portal_pedido_ao_rh
 *   doc_pedido_cancelar -> rpc_hr_portal_pedido_cancelar_meu
 *
 * REGRAS QUE NAO SE PODEM PARTIR
 *  - O codigo SMS nasce aqui, vai por SMS e a mais lado nenhum: nem a resposta, nem
 *    a base (so o HMAC), nem logs, nem o Sentry. O telemovel completo so serve para
 *    o SMS; ao browser vai so o mascarado. O token da SMSAPI nunca passa por aqui
 *    (o enviador injectado e que o tem).
 *  - Respostas so com chaves permitidas: nada que a RPC acrescente um dia sai sem
 *    passar pelas listas brancas. Nunca organization_id, pessoa_id nem caminhos.
 *  - Nunca `error.message`/`details` de um erro do Postgres: erros saem como codigo
 *    do catalogo (erros.ts).
 *  - Ficheiros: o ciclo de accoesAnexos.ts (quarentena -> assinatura binaria real ->
 *    tamanho real -> SHA-256 -> copia para hr-documentos -> so entao ligar; desfaz-se
 *    se a base recusar). Os anexo_* continuam a responder 410 (handler.ts).
 *
 * Modulo sem Deno e sem rede: cliente, SMS, correio e ambiente entram por `DepsDocumentos`.
 */
import { detectClientIp, detectUserAgent } from "../_shared/clientIp.ts";
import { detectSignature } from "../_shared/fileSignature.ts";
import { UUID_RE, eUuid } from "../_shared/uuid.ts";
import {
  BUCKET_FINAL,
  BUCKET_QUARENTENA,
  copiarParaFinal,
  lerObjecto,
  sha256Hex as sha256Bytes,
  tentar,
  type BucketAnexos,
} from "./accoesAnexos.ts";
import {
  eObjecto,
  respostaErro,
  respostaErroRpc,
  respostaInvalidaDaRpc,
  textoOpcional,
  type RespostaAccaoPortal,
} from "./accoesPortal.ts";
import {
  MIME_POR_ASSINATURA,
  LIMITES,
  eTipoAnexo,
  extensaoDoMime,
  sanitizarNomeOriginal,
  validarFicheiroReal,
  type TipoAnexo,
} from "./anexos.ts";
import type { PedidoCorreio, ResultadoCorreio } from "./correio.ts";
import { gerarCodigoOtp, pepperValido, sha256Hex } from "./otp.ts";
import { UUID, emailValido, linkDoConvite } from "./pedidoCriar.ts";
import { formatoSessaoValido, lerSessaoDoPedido } from "./sessao.ts";

export const ACCOES_DOCUMENTOS = [
  "doc_ler",
  "doc_conteudo",
  "doc_ficheiro_url",
  "doc_codigo",
  "doc_assinar",
  "doc_recusar",
  "doc_pedido_url",
  "doc_pedido_confirmar",
  "doc_pedido_remover",
  "doc_pedido_enviar",
  "doc_pedir_rh",
  "doc_pedido_cancelar",
] as const;
export type AccaoDocumentos = (typeof ACCOES_DOCUMENTOS)[number];

export function eAccaoDocumentos(accao: unknown): accao is AccaoDocumentos {
  return typeof accao === "string" && (ACCOES_DOCUMENTOS as readonly string[]).includes(accao);
}

/** Tecto por hora, por IP e por token_hash. Ler repete-se; assinar, recusar e pedir codigo gastam-se devagar. */
export function tectoDocumentosPorHora(accao: AccaoDocumentos): number {
  switch (accao) {
    case "doc_ler":
      return 120;
    case "doc_conteudo":
    case "doc_ficheiro_url":
      return 60;
    case "doc_pedido_url":
    case "doc_pedido_confirmar":
    case "doc_pedido_remover":
    case "doc_pedido_enviar":
      return 20;
    case "doc_codigo":
    case "doc_assinar":
    case "doc_recusar":
    case "doc_pedir_rh":
    case "doc_pedido_cancelar":
      return 10;
  }
}

// -- tipos ------------------------------------------------------------------------

export interface BucketDocumentos extends BucketAnexos {
  createSignedUrl(
    caminho: string,
    segundos: number,
  ): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
}

export interface ClienteDocumentos {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  storage: { from(bucket: string): BucketDocumentos };
}

export interface PedidoSms {
  /** E.164 com "+". Nunca se regista. */
  telefone: string;
  texto: string;
}

export type ResultadoSms =
  | { enviado: true }
  | { enviado: false; erroCodigo: "sms_nao_configurado" | "sms_falhou" | "pedido_invalido" };

export interface DepsDocumentos {
  svc: ClienteDocumentos;
  tokenHash: string;
  payload: Record<string, unknown>;
  req: Request;
  /** O mesmo pepper do OTP por e-mail (PORTAL_OTP_PEPPER). */
  otpPepper: string | null | undefined;
  /** Enviador de SMS injectado (nos testes, um falso: NUNCA se envia SMS a serio). */
  enviarSms?: (pedido: PedidoSms) => Promise<ResultadoSms>;
  reportar(origem: string, erro: unknown): void;
  registarErro(erro: Error): void;
}

// -- constantes e utilitarios -----------------------------------------------------

/** Validade que o SMS promete (e a da base: 5 min). */
export const VALIDADE_CODIGO_SMS_MINUTOS = 5;
/** Os URLs assinados de um documento duram um minuto. */
export const SEGUNDOS_URL_DOCUMENTO = 60;
const MOTIVO_MIN = 3;
const MOTIVO_MAX = 2000;
const NOME_ASSINATURA_MAX = 200;
const TITULO_MAX = 200;
const NOTA_MAX = 2000;
const TELEMOVEL_E164 = /^\+[1-9][0-9]{6,14}$/;
const CODIGO_SEIS = /^[0-9]{6}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const MIMES_ACEITES: readonly string[] = Object.values(MIME_POR_ASSINATURA);
const TIPOS_PEDIDO_PESSOA = ["declaracao_vinculo", "comprovativo_rendimentos", "copia_contrato", "outro"] as const;
const URGENCIAS = ["normal", "urgente"] as const;
/** Bytes da cabeca de que a deteccao de assinatura precisa. */
const BYTES_DA_CABECA = 64;
const USER_AGENT_MAX = 512;

/**
 * DISCREPANCIA COM A MIGRATION 20270101460000: nenhuma RPC do portal devolve a organizacao e a
 * pessoa de um anexo, e `rpc_hr_portal_pedido_ficheiro_ligar` exige o caminho final
 * `<org>/<pessoa>/admissao/<anexo_id>.<ext>`. Sem isto a confirmacao nao consegue montar o caminho.
 * Esta RPC (so service_role, com token e sessao) tem de existir: devolve
 * {caminho_quarentena, organization_id, pessoa_id, tipo}. Falha FECHADO se nao existir.
 */
export const RPC_CONTEXTO_FICHEIRO = "rpc_hr_portal_pedido_ficheiro_contexto";

export function textoSmsCodigo(codigo: string): string {
  if (!CODIGO_SEIS.test(codigo)) throw new Error("otp_pedido_invalido");
  return `O seu código de verificação é: ${codigo}. Válido por ${VALIDADE_CODIGO_SMS_MINUTOS} minutos.`;
}

/**
 * HMAC-SHA-256 (hex, 64) do codigo SMS, ligado ao envio, com o pepper do OTP. A base so ve este
 * valor e compara-o por igualdade. Falha FECHADA sem pepper valido (a mensagem nunca traz o
 * pepper nem o codigo).
 */
export async function hmacCodigoSms(pepper: string, envioId: string, codigo: string): Promise<string> {
  if (!pepperValido(pepper)) throw new Error("otp_pepper_invalido");
  if (!CODIGO_SEIS.test(codigo) || !UUID_RE.test(envioId)) throw new Error("otp_pedido_invalido");
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(`hr-portal-doc-sms|${envioId.toLowerCase()}|${codigo}`),
  );
  const hex = Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return HEX64.test(hex) ? hex : "";
}

type Escalar = string | number | boolean | null;
const eEscalar = (v: unknown): v is Escalar =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** So as chaves permitidas e so se forem escalares (nunca objectos aninhados por engano). */
function soEscalares(origem: Record<string, unknown>, chaves: readonly string[]): Record<string, Escalar> {
  const saida: Record<string, Escalar> = {};
  for (const c of chaves) {
    const v = origem[c];
    if (c in origem && eEscalar(v)) saida[c] = v;
  }
  return saida;
}

function listaFiltrada(valor: unknown, chaves: readonly string[]): Record<string, Escalar>[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(eObjecto).map((item) => soEscalares(item, chaves));
}

const CHAVES_LER = ["estado", "documentos_ate", "pendentes", "telemovel_mascarado"] as const;
const CHAVES_ENVIO = [
  "id", "titulo", "tipo", "enviado_em", "visto_em", "exige_assinatura", "situacao", "assinado_em",
  "assinatura_referencia", "recusa_motivo", "tem_conteudo", "tem_ficheiro", "codigo_expira_em", "pedido_id",
] as const;
const CHAVES_PEDIDO_RH = ["id", "tipo", "titulo", "nota", "prazo", "estado", "motivo_recusa"] as const;
const CHAVES_FICHEIRO = ["id", "nome", "estado"] as const;
const CHAVES_PEDIDO_PESSOA = ["id", "tipo", "titulo", "nota", "urgencia", "estado", "motivo_recusa", "envio_id"] as const;

type Chamada = { ok: true; data: unknown } | { ok: false; resposta: RespostaAccaoPortal };

interface Alvo {
  bucket: string;
  caminho: string;
}

function falhaFechada(deps: DepsDocumentos, origem: string): RespostaAccaoPortal {
  // Mensagem fixa nossa: nunca o valor do pepper.
  deps.registarErro(new Error(`convite-admissao ${origem}: PORTAL_OTP_PEPPER ou SMS em falta ou invalido`));
  return respostaErro("otp_indisponivel");
}

/** Chama uma RPC do portal (token e sessao primeiro). Um erro sai como codigo do catalogo. */
async function chamar(
  deps: DepsDocumentos,
  sessaoHash: string,
  origem: string,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<Chamada> {
  const { data, error } = await deps.svc.rpc(fn, { p_token_hash: deps.tokenHash, p_sessao_hash: sessaoHash, ...args });
  if (error) return { ok: false, resposta: respostaErroRpc(deps, origem, error) };
  return { ok: true, data };
}

function idDoPayload(deps: DepsDocumentos, chave: string): string | null {
  const v = deps.payload[chave];
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

const ok = (extra: Record<string, unknown> = {}): RespostaAccaoPortal => ({ status: 200, body: { ok: true, ...extra } });

// -- ler, conteudo, ficheiro ------------------------------------------------------

async function ler(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const c = await chamar(deps, sessaoHash, "doc_ler", "rpc_hr_portal_documentos_ler");
  if (!c.ok) return c.resposta;
  if (!eObjecto(c.data)) return respostaInvalidaDaRpc(deps, "doc_ler");
  const d = c.data;
  const pedidosRh = Array.isArray(d.pedidos_rh)
    ? d.pedidos_rh.filter(eObjecto).map((p) => ({
      ...soEscalares(p, CHAVES_PEDIDO_RH),
      ficheiros: listaFiltrada(p.ficheiros, CHAVES_FICHEIRO),
    }))
    : [];
  return ok({
    ...soEscalares(d, CHAVES_LER),
    envios: listaFiltrada(d.envios, CHAVES_ENVIO),
    pedidos_rh: pedidosRh,
    pedidos_pessoa: listaFiltrada(d.pedidos_pessoa, CHAVES_PEDIDO_PESSOA),
  });
}

async function conteudo(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const envioId = idDoPayload(deps, "envio_id");
  if (!envioId) return respostaErro("pedido_invalido");
  const c = await chamar(deps, sessaoHash, "doc_conteudo", "rpc_hr_portal_documento_conteudo", { p_envio_id: envioId });
  if (!c.ok) return c.resposta;
  if (typeof c.data !== "string") return respostaInvalidaDaRpc(deps, "doc_conteudo");
  // O HTML segue como esta: o browser sanitiza-o com DOMPurify antes de o mostrar.
  return ok({ html: c.data });
}

async function ficheiroUrl(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const envioId = idDoPayload(deps, "envio_id");
  if (!envioId) return respostaErro("pedido_invalido");
  const c = await chamar(deps, sessaoHash, "doc_ficheiro_url", "rpc_hr_portal_documento_ficheiro", { p_envio_id: envioId });
  if (!c.ok) return c.resposta;
  if (!eObjecto(c.data) || c.data.bucket !== BUCKET_FINAL || typeof c.data.caminho !== "string" || c.data.caminho === "") {
    return respostaInvalidaDaRpc(deps, "doc_ficheiro_url");
  }
  let url: string | null = null;
  try {
    const { data, error } = await deps.svc.storage.from(BUCKET_FINAL).createSignedUrl(c.data.caminho, SEGUNDOS_URL_DOCUMENTO);
    if (error) deps.reportar("doc_ficheiro_url assinar", error);
    url = typeof data?.signedUrl === "string" && data.signedUrl !== "" ? data.signedUrl : null;
  } catch (e) {
    deps.reportar("doc_ficheiro_url assinar", e);
  }
  // O caminho nunca sai: so o URL de 60 s.
  return url ? ok({ url }) : respostaErro("erro_inesperado");
}

// -- assinatura por SMS -----------------------------------------------------------

/** Pede o codigo: a base guarda o HMAC e devolve o telemovel; a Edge envia o SMS. */
async function codigo(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const envioId = idDoPayload(deps, "envio_id");
  if (!envioId) return respostaErro("pedido_invalido");
  if (!pepperValido(deps.otpPepper) || !deps.enviarSms) return falhaFechada(deps, "doc_codigo");

  // O codigo vive so nesta funcao: a base recebe o HMAC, o telemovel recebe o codigo.
  const cod = gerarCodigoOtp();
  const hmac = await hmacCodigoSms(deps.otpPepper, envioId, cod);
  const c = await chamar(deps, sessaoHash, "doc_codigo", "rpc_hr_portal_documento_codigo_pedir", {
    p_envio_id: envioId,
    p_codigo_hmac: hmac,
    p_ip: detectClientIp(deps.req),
  });
  if (!c.ok) return c.resposta;

  const d = c.data;
  if (
    !eObjecto(d) || typeof d.telemovel !== "string" || !TELEMOVEL_E164.test(d.telemovel) ||
    typeof d.telemovel_mascarado !== "string" || typeof d.expira_em !== "string"
  ) {
    return respostaInvalidaDaRpc(deps, "doc_codigo");
  }
  const reenviarEm = typeof d.reenviar_em === "string" ? d.reenviar_em : null;

  let resultado: ResultadoSms;
  try {
    resultado = await deps.enviarSms({ telefone: d.telemovel, texto: textoSmsCodigo(cod) });
  } catch (e) {
    deps.reportar("doc_codigo sms", e);
    return respostaErro("sms_nao_enviado", { reenviar_em: reenviarEm });
  }
  if (!resultado.enviado) {
    // So o CODIGO do erro: nunca o numero, o texto ou a resposta da SMSAPI.
    deps.registarErro(new Error(`convite-admissao doc_codigo: sms ${resultado.erroCodigo}`));
    return respostaErro("sms_nao_enviado", { reenviar_em: reenviarEm });
  }
  return ok({ telemovel_mascarado: d.telemovel_mascarado, expira_em: d.expira_em, reenviar_em: reenviarEm });
}

// `conteudo_alterado`: o texto ou o ficheiro mudou depois de o codigo ser pedido; o codigo deixa de valer (pede-se outro).
const ERROS_CODIGO_EM_JSONB = ["otp_invalido", "otp_expirado", "otp_bloqueado", "conteudo_alterado"] as const;

async function assinar(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const envioId = idDoPayload(deps, "envio_id");
  const cod = deps.payload.codigo;
  const nome = textoOpcional(deps.payload.nome, NOME_ASSINATURA_MAX);
  if (!envioId || nome === undefined || typeof deps.payload.aceite !== "boolean") return respostaErro("pedido_invalido");
  // Sem aceite nem se gasta uma das tentativas do codigo.
  if (deps.payload.aceite !== true) return respostaErro("aceite_obrigatorio");
  // Um codigo mal formado nem chega a base: nao gasta uma das 5 tentativas.
  if (typeof cod !== "string" || !CODIGO_SEIS.test(cod)) return respostaErro("pedido_invalido");
  if (!pepperValido(deps.otpPepper)) return falhaFechada(deps, "doc_assinar");

  const hmac = await hmacCodigoSms(deps.otpPepper, envioId, cod);
  const c = await chamar(deps, sessaoHash, "doc_assinar", "rpc_hr_portal_documento_assinar", {
    p_envio_id: envioId,
    p_codigo_hmac: hmac,
    p_aceite: true,
    p_nome: nome,
    p_ip: detectClientIp(deps.req),
    p_user_agent: detectUserAgent(deps.req)?.slice(0, USER_AGENT_MAX) ?? null,
  });
  if (!c.ok) return c.resposta;
  const d = c.data;
  if (!eObjecto(d)) return respostaInvalidaDaRpc(deps, "doc_assinar");

  // Os erros do codigo vem em jsonb (nao por RAISE) para o incremento de tentativas ficar gravado.
  if (typeof d.erro === "string") {
    if (!(ERROS_CODIGO_EM_JSONB as readonly string[]).includes(d.erro)) return respostaInvalidaDaRpc(deps, "doc_assinar");
    const r = d.restantes;
    return respostaErro(d.erro, typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 5 ? { restantes: r } : {});
  }
  if (d.ok !== true || typeof d.assinado_em !== "string") return respostaInvalidaDaRpc(deps, "doc_assinar");
  return ok({ assinado_em: d.assinado_em, referencia: typeof d.referencia === "string" ? d.referencia : null });
}

async function recusar(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const envioId = idDoPayload(deps, "envio_id");
  if (!envioId) return respostaErro("pedido_invalido");
  const motivo = typeof deps.payload.motivo === "string" ? deps.payload.motivo.trim() : "";
  if (motivo.length < MOTIVO_MIN || motivo.length > MOTIVO_MAX) return respostaErro("motivo_invalido");
  const c = await chamar(deps, sessaoHash, "doc_recusar", "rpc_hr_portal_documento_recusar", {
    p_envio_id: envioId,
    p_motivo: motivo,
  });
  return c.ok ? ok() : c.resposta;
}

// -- ficheiros de resposta a um pedido do RH --------------------------------------

/** Os objectos que a base diz existirem (`{caminhos:[{bucket, caminho}]}`), so dos dois buckets de RH. */
export function alvosDeCaminhos(data: unknown): Alvo[] {
  const lista = eObjecto(data) && Array.isArray(data.caminhos) ? data.caminhos : [];
  const alvos = new Map<string, Alvo>();
  for (const item of lista) {
    if (!eObjecto(item)) continue;
    const { bucket, caminho } = item;
    if ((bucket === BUCKET_QUARENTENA || bucket === BUCKET_FINAL) && typeof caminho === "string" && caminho !== "") {
      alvos.set(`${bucket}\u0000${caminho}`, { bucket, caminho });
    }
  }
  return [...alvos.values()];
}

async function apagarObjectos(deps: DepsDocumentos, alvos: readonly Alvo[]): Promise<void> {
  for (const a of alvos) {
    await tentar(() => deps.svc.storage.from(a.bucket).remove([a.caminho]), (e) => deps.reportar("doc_pedido limpeza", e));
  }
}

/**
 * Descarta a linha na base e SO DEPOIS apaga os objectos que a base indicou: sem a confirmacao
 * da base o objecto final pode ser o que sustenta uma linha ligada.
 */
async function descartarLinha(deps: DepsDocumentos, sessaoHash: string, anexoId: string, origem: string): Promise<Chamada> {
  const c = await chamar(deps, sessaoHash, origem, "rpc_hr_portal_pedido_ficheiro_remover", { p_anexo_id: anexoId });
  if (c.ok) await apagarObjectos(deps, alvosDeCaminhos(c.data));
  return c;
}

async function pedidoUrl(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const pedidoId = idDoPayload(deps, "pedido_id");
  const { nome, mime, tamanho } = deps.payload;
  if (!pedidoId || typeof nome !== "string" || typeof mime !== "string") return respostaErro("pedido_invalido");
  if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho)) return respostaErro("pedido_invalido");
  // Pre-verificacao (a mesma da RPC); o que conta e a assinatura real ao confirmar.
  const mimeLimpo = mime.trim().toLowerCase();
  if (!MIMES_ACEITES.includes(mimeLimpo)) return respostaErro("anexo_formato_invalido");
  if (tamanho <= 0) return respostaErro("anexo_vazio");
  if (tamanho > LIMITES.tamanhoMaxBytes) return respostaErro("anexo_demasiado_grande");

  const c = await chamar(deps, sessaoHash, "doc_pedido_url", "rpc_hr_portal_pedido_ficheiro_reservar", {
    p_pedido_id: pedidoId,
    p_nome: sanitizarNomeOriginal(nome),
    p_mime: mimeLimpo,
    p_tamanho: tamanho,
    p_ip: detectClientIp(deps.req),
  });
  if (!c.ok) return c.resposta;
  const d = c.data;
  if (!eObjecto(d) || typeof d.anexo_id !== "string" || !UUID_RE.test(d.anexo_id) || typeof d.caminho_quarentena !== "string" || d.caminho_quarentena === "") {
    return respostaInvalidaDaRpc(deps, "doc_pedido_url");
  }

  let uploadToken: string | null = null;
  try {
    const { data, error } = await deps.svc.storage.from(BUCKET_QUARENTENA).createSignedUploadUrl(d.caminho_quarentena, { upsert: false });
    if (error) deps.reportar("doc_pedido_url assinar", error);
    uploadToken = typeof data?.token === "string" && data.token !== "" ? data.token : null;
  } catch (e) {
    deps.reportar("doc_pedido_url assinar", e);
  }
  if (!uploadToken) {
    // A reserva conta para os tectos: liberta-a em vez de a deixar a ocupar uma vaga.
    await descartarLinha(deps, sessaoHash, d.anexo_id, "doc_pedido_url desfazer");
    return respostaErro("anexo_falha_envio");
  }
  return ok({ anexo_id: d.anexo_id, upload_token: uploadToken, caminho_quarentena: d.caminho_quarentena });
}

interface ContextoFicheiro {
  caminhoQuarentena: string;
  organizationId: string;
  pessoaId: string;
  tipo: TipoAnexo;
}

function lerContexto(data: unknown): ContextoFicheiro | null {
  if (!eObjecto(data)) return null;
  const { caminho_quarentena: cq, organization_id: org, pessoa_id: pessoa } = data;
  if (typeof cq !== "string" || cq === "" || !eUuid(org) || !eUuid(pessoa)) return null;
  // `outro` (e qualquer tipo de pedido fora dos tres) segue as regras gerais: pdf, png ou jpeg ate 10 MB.
  return { caminhoQuarentena: cq, organizationId: org, pessoaId: pessoa, tipo: eTipoAnexo(data.tipo) ? data.tipo : "comprovativo_iban" };
}

async function pedidoConfirmar(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const anexoId = idDoPayload(deps, "anexo_id");
  if (!anexoId) return respostaErro("pedido_invalido");

  const ctxRpc = await chamar(deps, sessaoHash, "doc_pedido_confirmar", RPC_CONTEXTO_FICHEIRO, { p_anexo_id: anexoId });
  if (!ctxRpc.ok) return ctxRpc.resposta;
  const contexto = lerContexto(ctxRpc.data);
  if (!contexto) return respostaInvalidaDaRpc(deps, "doc_pedido_confirmar");

  const quarentena = deps.svc.storage.from(BUCKET_QUARENTENA);
  const bytes = await lerObjecto(quarentena, contexto.caminhoQuarentena, (e) => deps.reportar("doc_pedido_confirmar", e));
  if (!bytes) return respostaErro("anexo_nao_carregado");

  const tamanho = bytes.length;
  const assinatura = detectSignature(bytes.subarray(0, BYTES_DA_CABECA));
  const recusa = validarFicheiroReal({ tipo: contexto.tipo, assinatura, tamanho });
  if (recusa) {
    // Se a remocao falhar, a base indica os caminhos e a limpeza apanha-os.
    await descartarLinha(deps, sessaoHash, anexoId, "doc_pedido_confirmar descartar");
    await tentar(() => quarentena.remove([contexto.caminhoQuarentena]), (e) => deps.reportar("doc_pedido_confirmar limpeza", e));
    return respostaErro(recusa);
  }

  const mime = MIME_POR_ASSINATURA[assinatura as string];
  const extensao = extensaoDoMime(mime);
  if (!extensao) return respostaErro("erro_inesperado");
  const hash = await sha256Bytes(bytes);
  const caminhoFinal = `${contexto.organizationId}/${contexto.pessoaId}/admissao/${anexoId}.${extensao}`;

  // O objecto final tem de existir ANTES de a linha ficar ligada.
  const copiado = await copiarParaFinal(
    deps.svc.storage.from(BUCKET_FINAL), caminhoFinal, bytes, mime, hash, (e) => deps.reportar("doc_pedido_confirmar copia", e),
  );
  if (!copiado) return respostaErro("anexo_falha_envio");

  const ligado = await chamar(deps, sessaoHash, "doc_pedido_confirmar", "rpc_hr_portal_pedido_ficheiro_ligar", {
    p_anexo_id: anexoId,
    p_caminho_final: caminhoFinal,
    p_sha256: hash,
    p_tamanho: tamanho,
    p_mime: mime,
  });
  if (!ligado.ok || !eObjecto(ligado.data) || typeof ligado.data.id !== "string" || ligado.data.estado !== "ligado") {
    // A base recusou (ou respondeu mal): desfaz-se a copia (so com o descarte confirmado).
    await descartarLinha(deps, sessaoHash, anexoId, "doc_pedido_confirmar desfazer");
    return ligado.ok ? respostaInvalidaDaRpc(deps, "doc_pedido_confirmar") : ligado.resposta;
  }

  await tentar(() => quarentena.remove([contexto.caminhoQuarentena]), (e) => deps.reportar("doc_pedido_confirmar limpeza", e));
  return ok({ ficheiro: { id: ligado.data.id, nome: typeof ligado.data.nome === "string" ? ligado.data.nome : null, estado: "ligado" } });
}

async function pedidoRemover(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const anexoId = idDoPayload(deps, "anexo_id");
  if (!anexoId) return respostaErro("pedido_invalido");
  const c = await descartarLinha(deps, sessaoHash, anexoId, "doc_pedido_remover");
  return c.ok ? ok() : c.resposta;
}

// -- pedidos (so a base muda) -----------------------------------------------------

async function pedidoEnviar(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const pedidoId = idDoPayload(deps, "pedido_id");
  if (!pedidoId) return respostaErro("pedido_invalido");
  const c = await chamar(deps, sessaoHash, "doc_pedido_enviar", "rpc_hr_portal_pedido_enviar", { p_pedido_id: pedidoId });
  return c.ok ? ok() : c.resposta;
}

async function pedidoCancelar(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const pedidoId = idDoPayload(deps, "pedido_id");
  if (!pedidoId) return respostaErro("pedido_invalido");
  const c = await chamar(deps, sessaoHash, "doc_pedido_cancelar", "rpc_hr_portal_pedido_cancelar_meu", { p_pedido_id: pedidoId });
  return c.ok ? ok() : c.resposta;
}

async function pedirRh(deps: DepsDocumentos, sessaoHash: string): Promise<RespostaAccaoPortal> {
  const { tipo, urgencia } = deps.payload;
  const titulo = textoOpcional(deps.payload.titulo, TITULO_MAX);
  const nota = textoOpcional(deps.payload.nota, NOTA_MAX);
  if (typeof tipo !== "string" || !(TIPOS_PEDIDO_PESSOA as readonly string[]).includes(tipo)) return respostaErro("pedido_invalido");
  if (titulo === undefined || nota === undefined) return respostaErro("pedido_invalido");
  if (tipo === "outro" && titulo === null) return respostaErro("pedido_invalido");
  const urg = urgencia === undefined || urgencia === null ? "normal" : urgencia;
  if (typeof urg !== "string" || !(URGENCIAS as readonly string[]).includes(urg)) return respostaErro("pedido_invalido");

  const c = await chamar(deps, sessaoHash, "doc_pedir_rh", "rpc_hr_portal_pedido_ao_rh", {
    p_tipo: tipo,
    p_titulo: titulo,
    p_nota: nota,
    p_urgencia: urg,
  });
  if (!c.ok) return c.resposta;
  if (typeof c.data !== "string" || !UUID_RE.test(c.data)) return respostaInvalidaDaRpc(deps, "doc_pedir_rh");
  return ok({ pedido_id: c.data });
}

// -- despacho ---------------------------------------------------------------------

export async function tratarAccaoDocumentos(accao: AccaoDocumentos, deps: DepsDocumentos): Promise<RespostaAccaoPortal> {
  const sessao = lerSessaoDoPedido(deps.req, deps.payload);
  // A base recusaria a sessao ausente com HRA51: poupa-se a viagem.
  if (!sessao || !formatoSessaoValido(sessao)) return respostaErro("sessao_ausente");
  const sessaoHash = await sha256Hex(sessao);
  try {
    switch (accao) {
      case "doc_ler":
        return await ler(deps, sessaoHash);
      case "doc_conteudo":
        return await conteudo(deps, sessaoHash);
      case "doc_ficheiro_url":
        return await ficheiroUrl(deps, sessaoHash);
      case "doc_codigo":
        return await codigo(deps, sessaoHash);
      case "doc_assinar":
        return await assinar(deps, sessaoHash);
      case "doc_recusar":
        return await recusar(deps, sessaoHash);
      case "doc_pedido_url":
        return await pedidoUrl(deps, sessaoHash);
      case "doc_pedido_confirmar":
        return await pedidoConfirmar(deps, sessaoHash);
      case "doc_pedido_remover":
        return await pedidoRemover(deps, sessaoHash);
      case "doc_pedido_enviar":
        return await pedidoEnviar(deps, sessaoHash);
      case "doc_pedir_rh":
        return await pedirRh(deps, sessaoHash);
      case "doc_pedido_cancelar":
        return await pedidoCancelar(deps, sessaoHash);
    }
  } catch (e) {
    // Excepcao (rede, Storage...): so tipo e codigo, nunca texto.
    deps.reportar(accao, e);
    return respostaErro("erro_inesperado");
  }
}

// -- accao do RH: documentos_avisar -----------------------------------------------

export const PERMISSAO_AVISAR_DOCUMENTOS = "hr.pessoas.documentos.emitir";

export interface ArgsAvisarDocumentos {
  svc: { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
  enviarCorreio: (pedido: PedidoCorreio) => Promise<ResultadoCorreio>;
  conviteId: string;
  organizationId: string;
  /** auth.users.id, derivado do JWT. */
  actor: string;
  baseUrl: string;
  reportar(origem: string, erro: unknown): void;
  registarErro(erro: Error): void;
}

/** O e-mail: sem titulo nem conteudo do documento, so o aviso e o link. */
export function conteudoAvisoDocumentos(link: string): { assunto: string; html: string; texto: string } {
  return {
    assunto: "Tem um documento para ver no portal",
    html: `<p>Tem um documento para ver ou assinar no portal.</p>` +
      `<p><a href="${link}">Abrir o portal</a></p>` +
      `<p>Vai receber um código de verificação para entrar. Se não estava à espera desta mensagem, ignore-a.</p>`,
    texto: `Tem um documento para ver ou assinar no portal.\nAbrir o portal: ${link}\n` +
      `Vai receber um código de verificação para entrar. Se não estava à espera desta mensagem, ignore-a.`,
  };
}

/**
 * RH: avisa a pessoa por e-mail de que ha documentos no portal. O JWT ja foi validado e o actor derivado
 * dele pelo handler. A permissao confirma-se aqui; "sem permissao" e "nao existe" dao o MESMO erro.
 * O link vem de `rpc_hr_portal_documentos_link` (so service_role) e so serve para compor o e-mail:
 * o token nunca vai ao browser nem se regista.
 */
export async function avisarDocumentos(args: ArgsAvisarDocumentos): Promise<RespostaAccaoPortal> {
  const { data: pode, error: erroPermissao } = await args.svc.rpc("has_anew_permission_in_org", {
    _auth_uid: args.actor,
    _permission_code: PERMISSAO_AVISAR_DOCUMENTOS,
    _organization_id: args.organizationId,
  });
  if (erroPermissao) {
    args.reportar("documentos_avisar permissao", erroPermissao);
    return respostaErro("erro_inesperado");
  }
  if (!pode) return respostaErro("nao_encontrado");

  // `rpc_hr_portal_documentos_link` (so service_role): a mesma forma da de reenvio, mas aceita um processo
  // ja submetido com a janela de documentos aberta; confirma a permissao e limita os avisos (HRA41).
  const { data, error } = await args.svc.rpc("rpc_hr_portal_documentos_link", {
    p_convite_id: args.conviteId,
    p_organization_id: args.organizationId,
    p_actor: args.actor,
  });
  if (error) {
    const r = respostaErroRpc(args, "documentos_avisar", error, false);
    return r.body.error === "insufficient_privilege" ? respostaErro("nao_encontrado") : r;
  }

  const token = eObjecto(data) ? data.token : undefined;
  if (
    !eObjecto(data) || typeof token !== "string" || token.length < 20 || token.length > 200 ||
    !emailValido(data.email_destino) || typeof data.organization_id !== "string" || !UUID.test(data.organization_id)
  ) {
    return respostaInvalidaDaRpc(args, "documentos_avisar");
  }

  const conteudoEmail = conteudoAvisoDocumentos(linkDoConvite(args.baseUrl, token));
  let resultado: ResultadoCorreio;
  try {
    resultado = await args.enviarCorreio({
      organizationId: data.organization_id,
      para: data.email_destino,
      assunto: conteudoEmail.assunto,
      html: conteudoEmail.html,
      texto: conteudoEmail.texto,
    });
  } catch (e) {
    args.reportar("documentos_avisar correio", e);
    return respostaErro("email_nao_enviado");
  }
  if (!resultado.enviado) {
    args.registarErro(new Error(`convite-admissao documentos_avisar: correio ${resultado.erroCodigo}`));
    return respostaErro("email_nao_enviado");
  }
  return ok({ email_enviado: true });
}

// -- accao do RH: pedido_ficheiro_url ---------------------------------------------

export interface ArgsPedidoFicheiroUrlRh {
  svc: ClienteDocumentos;
  anexoId: string;
  organizationId: string;
  /** auth.users.id, derivado do JWT. */
  actor: string;
  reportar(origem: string, erro: unknown): void;
  registarErro(erro: Error): void;
}

/**
 * RH: URL assinado de 60 s de um ficheiro que a pessoa enviou a um pedido. O JWT ja foi validado e o actor
 * derivado dele pelo handler. A permissao (matriz por tipo) e a organizacao verificam-se na RPC
 * (`rpc_hr_portal_pedido_ficheiro_url_rh`, so service_role); "sem permissao" e "nao existe" dao o MESMO erro.
 * O caminho e o mime nunca saem: so o URL.
 */
export async function pedidoFicheiroUrlRh(args: ArgsPedidoFicheiroUrlRh): Promise<RespostaAccaoPortal> {
  const { data, error } = await args.svc.rpc("rpc_hr_portal_pedido_ficheiro_url_rh", {
    p_anexo_id: args.anexoId,
    p_organization_id: args.organizationId,
    p_actor: args.actor,
  });
  if (error) {
    const r = respostaErroRpc(args, "pedido_ficheiro_url", error, false);
    return r.body.error === "insufficient_privilege" ? respostaErro("nao_encontrado") : r;
  }
  if (!eObjecto(data) || data.bucket !== BUCKET_FINAL || typeof data.caminho !== "string" || data.caminho === "") {
    return respostaInvalidaDaRpc(args, "pedido_ficheiro_url");
  }
  let url: string | null = null;
  try {
    const { data: assinado, error: erroAssinar } = await args.svc.storage.from(BUCKET_FINAL).createSignedUrl(data.caminho, SEGUNDOS_URL_DOCUMENTO);
    if (erroAssinar) args.reportar("pedido_ficheiro_url assinar", erroAssinar);
    url = typeof assinado?.signedUrl === "string" && assinado.signedUrl !== "" ? assinado.signedUrl : null;
  } catch (e) {
    args.reportar("pedido_ficheiro_url assinar", e);
  }
  return url ? ok({ url }) : respostaErro("erro_inesperado");
}
