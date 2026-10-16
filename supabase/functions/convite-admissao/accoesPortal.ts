/**
 * As accoes do portal de admissao por OTP e sessao (V3a): `otp_pedir`,
 * `otp_verificar`, `sair`, `ler` e `sensiveis`. Publicas: sem JWT, so com o
 * token do link (o IP e o token_hash limitam-nas no handler) e, para as
 * escritas e leituras, com a SESSAO que o OTP abriu.
 *
 * Cada accao chama uma RPC `service_role` (ver 20261210430000):
 *   otp_pedir      -> rpc_hr_convite_admissao_otp_pedir(p_token_hash, p_otp_hmac)
 *   otp_verificar  -> rpc_hr_convite_admissao_otp_verificar(p_token_hash, p_otp_hmac, p_sessao_hash)
 *   sair           -> rpc_hr_convite_admissao_sessao_terminar(p_token_hash, p_sessao_hash)
 *   ler            -> rpc_hr_convite_admissao_portal_ler(p_token_hash, p_sessao_hash)
 *   sensiveis      -> rpc_hr_convite_admissao_sensiveis_gravar(p_token_hash, p_sessao_hash, p_niss, p_iban)
 * A sessao verifica-se DENTRO da RPC (`hr_convite_sessao_exigir`); a Edge so
 * recusa de imediato uma sessao ausente ou mal formada, que a base recusaria.
 *
 * REGRAS QUE NAO SE PODEM PARTIR
 *  - O codigo OTP nasce aqui, vai ao e-mail do convite e a mais lado nenhum:
 *    nem a resposta, nem a base (so o HMAC), nem logs, nem o Sentry.
 *  - O e-mail de destino e o que a RPC devolve (FIXADO no convite), nunca um
 *    do pedido. Nunca vai para o browser.
 *  - A sessao (segredo) nunca se regista nem se manda a base: so o SHA-256.
 *  - Nunca `error.details` nem `error.message` de um erro do Postgres: os
 *    erros saem como codigo do catalogo; o inesperado reporta so tipo e SQLSTATE.
 *  - Sem pepper valido (PORTAL_OTP_PEPPER) ou sem correio, falha FECHADO.
 *
 * Modulo sem Deno e sem rede: o cliente, o correio e o ambiente entram por `DepsPortal`.
 */
import { UUID, emailValido } from "./pedidoCriar.ts";
import { conteudoOtp, mascararEmail, type PedidoCorreio, type ResultadoCorreio } from "./correio.ts";
import { mapearErroRpc, statusDoCodigo } from "./erros.ts";
import { gerarCodigoOtp, hmacOtp, pepperValido, sha256Hex } from "./otp.ts";
import { formatoSessaoValido, gerarSessao, lerSessaoDoPedido } from "./sessao.ts";

export const ACCOES_PORTAL = ["otp_pedir", "otp_verificar", "sair", "ler", "sensiveis"] as const;
export type AccaoPortal = (typeof ACCOES_PORTAL)[number];

export function eAccaoPortal(accao: unknown): accao is AccaoPortal {
  return typeof accao === "string" && (ACCOES_PORTAL as readonly string[]).includes(accao);
}

/** Tecto por hora, por IP e por token_hash. O OTP gasta-se devagar; ler repete-se enquanto a pessoa preenche. */
export function tectoPortalPorHora(accao: AccaoPortal): number {
  switch (accao) {
    case "otp_pedir":
      return 6;
    case "otp_verificar":
      return 30;
    case "sair":
      return 20;
    case "ler":
      return 120;
    case "sensiveis":
      return 30;
  }
}

export interface ClienteRpc {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface RespostaAccaoPortal {
  status: number;
  body: Record<string, unknown>;
}

export interface DepsPortal {
  svc: ClienteRpc;
  tokenHash: string;
  payload: Record<string, unknown>;
  req: Request;
  otpPepper: string | null | undefined;
  enviarCorreio?: (pedido: PedidoCorreio) => Promise<ResultadoCorreio>;
  /** Regista um erro de uma RPC: so tipo e SQLSTATE. */
  reportar(origem: string, erro: unknown): void;
  /** Regista um erro JA sem dados (mensagem fixa nossa). */
  registarErro(erro: Error): void;
}

type ErroRpc = { code?: string; message?: string; details?: string };

export function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function respostaErro(codigo: string, extra: Record<string, unknown> = {}): RespostaAccaoPortal {
  return { status: statusDoCodigo(codigo), body: { error: codigo, ...extra } };
}

/**
 * Um erro de uma RPC publica para o browser. HRA31 (token desconhecido) sai como
 * `convite_invalido`, o mesmo do estado: nao se revela se o convite existe.
 * So o inesperado se reporta (as recusas de negocio sao respostas legitimas).
 */
export function respostaErroRpc(
  deps: Pick<DepsPortal, "reportar">,
  origem: string,
  error: unknown,
  publica = true,
): RespostaAccaoPortal {
  let { codigo }: { codigo: string } = mapearErroRpc(error as ErroRpc);
  // Nas accoes do RH (publica = false) o HRA31 fica nao_encontrado.
  if (codigo === "nao_encontrado" && publica) codigo = "convite_invalido";
  // HRA52 e HRA53 dao o MESMO erro ao visitante: nao se revela se alguem abriu sessao noutro
  // dispositivo. O dispositivo antigo ve sempre "sessao terminada, confirme de novo o codigo".
  if (codigo === "sessao_substituida") codigo = "sessao_expirada";
  if (codigo === "erro_inesperado") deps.reportar(origem, error);
  return respostaErro(codigo);
}

function soChaves(origem: Record<string, unknown>, chaves: readonly string[]): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const c of chaves) if (c in origem) saida[c] = origem[c];
  return saida;
}

const CHAVES_LER = [
  "estado",
  "rascunho",
  "campos_obrigatorios",
  "campos_editaveis",
  "documentos_editaveis",
  "niss_ultimos4",
  "iban_ultimos4",
  "devolucao",
  "anexos",
  "rejeicao_mensagem",
] as const;

const NISS_MAX = 32;
const IBAN_MAX = 64;
/** A validade do OTP e da RPC (10 min); se a resposta nao a trouxer, diz-se isto. */
const VALIDADE_OTP_MINUTOS = 10;

function respostaInvalidaDaRpc(deps: DepsPortal, origem: string): RespostaAccaoPortal {
  deps.registarErro(new Error(`convite-admissao ${origem}: resposta da RPC invalida`));
  return respostaErro("erro_inesperado");
}

/** Minutos de agora ate `expiraEm`, ou a validade conhecida se a data nao servir. */
function minutosAte(expiraEm: unknown): number {
  const ms = typeof expiraEm === "string" ? new Date(expiraEm).getTime() - Date.now() : Number.NaN;
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : VALIDADE_OTP_MINUTOS;
}

function falhaFechada(deps: DepsPortal, origem: string): RespostaAccaoPortal {
  // Mensagem fixa nossa: nunca o valor do pepper.
  deps.registarErro(new Error(`convite-admissao ${origem}: PORTAL_OTP_PEPPER ou correio em falta ou invalido`));
  return respostaErro("otp_indisponivel");
}

async function otpPedir(deps: DepsPortal): Promise<RespostaAccaoPortal> {
  if (!pepperValido(deps.otpPepper) || !deps.enviarCorreio) return falhaFechada(deps, "otp_pedir");

  // O codigo vive so nesta funcao: a base recebe o HMAC, o e-mail recebe o codigo.
  const codigo = gerarCodigoOtp();
  const hmac = await hmacOtp(deps.otpPepper, deps.tokenHash, codigo);
  const { data, error } = await deps.svc.rpc("rpc_hr_convite_admissao_otp_pedir", {
    p_token_hash: deps.tokenHash,
    p_otp_hmac: hmac,
  });
  if (error) return respostaErroRpc(deps, "otp_pedir", error);

  // email_destino e organization_id ficam aqui: nunca vao para o browser.
  if (!eObjecto(data) || !emailValido(data.email_destino) || typeof data.organization_id !== "string" || !UUID.test(data.organization_id)) {
    return respostaInvalidaDaRpc(deps, "otp_pedir");
  }
  const conteudo = conteudoOtp(codigo, minutosAte(data.expira_em));
  let resultado: ResultadoCorreio;
  try {
    resultado = await deps.enviarCorreio({
      organizationId: data.organization_id,
      para: data.email_destino,
      assunto: conteudo.assunto,
      html: conteudo.html,
      texto: conteudo.texto,
    });
  } catch (e) {
    deps.reportar("otp_pedir correio", e);
    return respostaErro("email_nao_enviado");
  }
  if (!resultado.enviado) {
    deps.registarErro(new Error(`convite-admissao otp_pedir: correio ${resultado.erroCodigo}`));
    return respostaErro("email_nao_enviado");
  }
  // So o e-mail MASCARADO volta ao browser (para a pessoa saber para onde foi o codigo); nunca o completo.
  return {
    status: 200,
    body: {
      ok: true,
      expira_em: typeof data.expira_em === "string" ? data.expira_em : null,
      email_mascarado: mascararEmail(data.email_destino),
    },
  };
}

// pedido_invalido: o hash de sessao ja estava em uso noutro processo (a base nao faz RAISE para nao perder o incremento).
const ERROS_OTP_EM_JSONB = ["otp_invalido", "otp_expirado", "otp_bloqueado", "pedido_invalido"] as const;

async function otpVerificar(deps: DepsPortal): Promise<RespostaAccaoPortal> {
  const codigo = deps.payload.codigo;
  // Um codigo mal formado nem chega a base: nao gasta uma das 5 tentativas.
  if (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo)) return respostaErro("pedido_invalido");
  if (!pepperValido(deps.otpPepper)) return falhaFechada(deps, "otp_verificar");

  const hmac = await hmacOtp(deps.otpPepper, deps.tokenHash, codigo);
  // A sessao nasce aqui; a base so recebe o hash dela.
  const { sessao, hash } = await gerarSessao();
  const { data, error } = await deps.svc.rpc("rpc_hr_convite_admissao_otp_verificar", {
    p_token_hash: deps.tokenHash,
    p_otp_hmac: hmac,
    p_sessao_hash: hash,
  });
  if (error) return respostaErroRpc(deps, "otp_verificar", error);
  if (!eObjecto(data)) return respostaInvalidaDaRpc(deps, "otp_verificar");

  // Os erros de OTP vem em jsonb (e nao por RAISE) para o incremento de tentativas ficar gravado.
  if (typeof data.erro === "string") {
    if (!(ERROS_OTP_EM_JSONB as readonly string[]).includes(data.erro)) return respostaInvalidaDaRpc(deps, "otp_verificar");
    const r = data.restantes;
    const restantes = typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= 5 ? { restantes: r } : {};
    return respostaErro(data.erro, restantes);
  }
  if (data.ok !== true) return respostaInvalidaDaRpc(deps, "otp_verificar");
  return {
    status: 200,
    body: { ok: true, sessao, sessao_expira_em: typeof data.sessao_expira_em === "string" ? data.sessao_expira_em : null },
  };
}

async function sair(deps: DepsPortal, sessao: string | null): Promise<RespostaAccaoPortal> {
  // Sem sessao nao ha nada a terminar: sair e idempotente.
  if (!sessao) return { status: 200, body: { ok: true, terminada: false } };
  const { data, error } = await deps.svc.rpc("rpc_hr_convite_admissao_sessao_terminar", {
    p_token_hash: deps.tokenHash,
    p_sessao_hash: await sha256Hex(sessao),
  });
  if (error) return respostaErroRpc(deps, "sair", error);
  return { status: 200, body: { ok: true, terminada: eObjecto(data) && data.terminada === true } };
}

async function ler(deps: DepsPortal, sessao: string): Promise<RespostaAccaoPortal> {
  const { data, error } = await deps.svc.rpc("rpc_hr_convite_admissao_portal_ler", {
    p_token_hash: deps.tokenHash,
    p_sessao_hash: await sha256Hex(sessao),
  });
  if (error) return respostaErroRpc(deps, "ler", error);
  if (!eObjecto(data)) return respostaInvalidaDaRpc(deps, "ler");
  // So as chaves documentadas: o que a RPC acrescentar um dia nao sai sem passar por aqui.
  return { status: 200, body: { ok: true, ...soChaves(data, CHAVES_LER) } };
}

/** Texto aparado, ou null se ausente/vazio; `undefined` se nao for texto nem nulo. */
function textoOpcional(valor: unknown, maximo: number): string | null | undefined {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return undefined;
  const aparado = valor.trim();
  if (aparado.length > maximo) return undefined;
  return aparado === "" ? null : aparado;
}

const mascara = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function sensiveis(deps: DepsPortal, sessao: string): Promise<RespostaAccaoPortal> {
  const niss = textoOpcional(deps.payload.niss, NISS_MAX);
  const iban = textoOpcional(deps.payload.iban, IBAN_MAX);
  // Pelo menos um dos dois; o valor nunca se regista nem volta na resposta.
  if (niss === undefined || iban === undefined || (niss === null && iban === null)) return respostaErro("pedido_invalido");

  const { data, error } = await deps.svc.rpc("rpc_hr_convite_admissao_sensiveis_gravar", {
    p_token_hash: deps.tokenHash,
    p_sessao_hash: await sha256Hex(sessao),
    p_niss: niss,
    p_iban: iban,
  });
  if (error) return respostaErroRpc(deps, "sensiveis", error);
  if (!eObjecto(data)) return respostaInvalidaDaRpc(deps, "sensiveis");
  return { status: 200, body: { ok: true, niss_ultimos4: mascara(data.niss_ultimos4), iban_ultimos4: mascara(data.iban_ultimos4) } };
}

export async function tratarAccaoPortal(accao: AccaoPortal, deps: DepsPortal): Promise<RespostaAccaoPortal> {
  if (accao === "otp_pedir") return otpPedir(deps);
  if (accao === "otp_verificar") return otpVerificar(deps);

  const sessao = lerSessaoDoPedido(deps.req, deps.payload);
  if (accao === "sair") return sair(deps, sessao);
  // A base recusaria a sessao ausente com HRA51: poupa-se a viagem.
  if (!sessao || !formatoSessaoValido(sessao)) return respostaErro("sessao_ausente");
  return accao === "ler" ? ler(deps, sessao) : sensiveis(deps, sessao);
}
