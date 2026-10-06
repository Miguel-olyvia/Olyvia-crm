/**
 * As regras puras da accao "criar" do convite de admissao: validacao do pedido,
 * URL base obrigatoria e saneamento do erro de envio.
 *
 * Modulo puro (sem Deno, sem rede) para ser testavel no vitest.
 */

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 5321: um endereco nao passa dos 254 caracteres. */
export const EMAIL_MAX = 254;

/** Um unico destinatario: sem espacos, virgulas, ponto e virgula, aspas nem parenteses. */
const EMAIL = /^[^\s@,;<>()"'\\]+@[^\s@,;<>()"'\\]+\.[^\s@,;<>()"'\\]+$/;

/** Tectos por hora da accao "criar": por quem chama e por pessoa convidada. */
export const LIMITE_CRIAR_POR_UTILIZADOR = 20;
export const LIMITE_CRIAR_POR_PESSOA = 5;

/** O `email_erro` tem um CHECK de 500 caracteres na base. */
export const EMAIL_ERRO_MAX = 500;

export interface PedidoCriar {
  pessoaId: string;
  email: string;
}

/** `null` quando o pedido nao serve; nunca lanca. */
export function validarPedidoCriar(payload: unknown): PedidoCriar | null {
  if (!payload || typeof payload !== "object") return null;
  const { pessoa_id: pessoaId, email: bruto } = payload as Record<string, unknown>;
  if (typeof pessoaId !== "string" || !UUID.test(pessoaId)) return null;
  if (typeof bruto !== "string") return null;
  const email = bruto.trim();
  if (email.length === 0 || email.length > EMAIL_MAX || !EMAIL.test(email)) return null;
  return { pessoaId, email };
}

/**
 * O URL base da aplicacao, sem barras finais. `null` quando falta ou nao e um
 * URL absoluto http(s): nesse caso o convite NAO se cria, porque o link sairia
 * relativo (e so se mostra uma vez).
 */
export function resolverBaseUrl(bruto: string | null | undefined): string | null {
  const valor = (bruto ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/i.test(valor)) return null;
  return valor;
}

export function linkDoConvite(baseUrl: string, token: string): string {
  return `${baseUrl}/admissao/${token}`;
}

export interface ResultadoCriar {
  /** `null` quando a RPC nao devolveu um id valido: nada a registar. */
  conviteId: string | null;
  /** `true` na duvida: so um `false` literal da base liberta o link. */
  rascunhoHerdado: boolean;
}

/**
 * O retorno de `rpc_hr_convite_admissao_criar` e `TABLE (convite_id,
 * rascunho_herdado)`: o PostgREST devolve um ARRAY de uma linha. Aceita-se
 * tambem um objecto solto. Nunca lanca.
 */
export function lerResultadoCriar(data: unknown): ResultadoCriar {
  const linha: unknown = Array.isArray(data) ? data[0] : data;
  const obj = linha && typeof linha === "object" ? (linha as Record<string, unknown>) : {};
  const id = obj.convite_id;
  return {
    conviteId: typeof id === "string" && UUID.test(id) ? id : null,
    rascunhoHerdado: obj.rascunho_herdado !== false,
  };
}

/**
 * O link que sai para quem criou o convite (RH), ou `null`. So sai quando o
 * e-mail NAO foi E o convite nao herdou um rascunho: com rascunho herdado, o
 * link abriria na mao do RH os dados (NIF, NISS, IBAN, morada) da pessoa.
 */
export function linkParaOCriador(args: {
  emailEnviado: boolean;
  rascunhoHerdado: boolean;
  baseUrl: string;
  token: string;
}): string | null {
  if (args.emailEnviado || args.rascunhoHerdado) return null;
  return linkDoConvite(args.baseUrl, args.token);
}

/**
 * O texto de erro do envio vai para a base (legivel por quem tem
 * `hr.pessoas.view`) e para o RH: nunca pode conter o token nem o caminho do
 * link, que abririam o convite e o rascunho da pessoa.
 */
export function sanearEmailErro(
  texto: string | null | undefined,
  token: string,
): string | null {
  let limpo = (texto ?? "").trim();
  if (limpo === "") return null;
  if (token) limpo = limpo.split(token).join("[token]");
  limpo = limpo.replace(/\/admissao\/[A-Za-z0-9_\-%.~]+/g, "/admissao/[token]");
  return limpo.slice(0, EMAIL_ERRO_MAX);
}
