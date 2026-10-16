/**
 * As regras puras da accao "criar" do convite de admissao: validacao do pedido,
 * URL base obrigatoria e saneamento do erro de envio.
 *
 * Modulo puro (sem Deno, sem rede) para ser testavel no vitest.
 */

import {
  ADDITIONAL_ALLOWED_ORIGINS,
  LOCAL_DEV_ORIGIN_PATTERN,
  PRODUCTION_ORIGIN,
  VERCEL_PREVIEW_ORIGIN_PATTERN,
} from "../_shared/cors.ts";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 5321: um endereco nao passa dos 254 caracteres. */
export const EMAIL_MAX = 254;

/** Um unico destinatario: sem espacos, virgulas, ponto e virgula, aspas nem parenteses. */
const EMAIL = /^[^\s@,;<>()"'\\]+@[^\s@,;<>()"'\\]+\.[^\s@,;<>()"'\\]+$/;

/** Um unico endereco valido (so formato): para o e-mail do convite que a base devolve ao correio. */
export function emailValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0 && valor.length <= EMAIL_MAX && EMAIL.test(valor);
}

/** Tectos por hora da accao "criar": por quem chama e por pessoa convidada. */
export const LIMITE_CRIAR_POR_UTILIZADOR = 20;
export const LIMITE_CRIAR_POR_PESSOA = 5;

/** O `email_erro` tem um CHECK de 500 caracteres na base. */
export const EMAIL_ERRO_MAX = 500;

export interface PedidoCriar {
  pessoaId: string;
  /** A organizacao activa no ecra (activeCompany): so um seletor, a Edge e a RPC confirmam-na. */
  organizationId: string;
  email: string;
}

/**
 * `null` quando o pedido nao serve; nunca lanca. So le `pessoa_id`,
 * `organization_id` e `email`: o actor NUNCA vem do corpo (deriva-se do JWT).
 */
export function validarPedidoCriar(payload: unknown): PedidoCriar | null {
  if (!payload || typeof payload !== "object") return null;
  const { pessoa_id: pessoaId, organization_id: organizationId, email: bruto } = payload as Record<string, unknown>;
  if (typeof pessoaId !== "string" || !UUID.test(pessoaId)) return null;
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) return null;
  if (typeof bruto !== "string") return null;
  const email = bruto.trim();
  if (email.length === 0 || email.length > EMAIL_MAX || !EMAIL.test(email)) return null;
  return { pessoaId, organizationId, email };
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

/**
 * O endereco de onde o RH pediu o convite, quando e um dos permitidos (a mesma
 * lista ANCORADA que o CORS destas funcoes usa: producao, previews desta equipa
 * e loopback local). Assim o link sai sempre com o endereco da aplicacao onde
 * o RH esta, e nao com o segredo APP_BASE_URL, que so serve de reserva.
 * `null` quando falta ou nao e permitido: nunca se reflecte um endereco
 * arbitrario, porque o link vai por email a uma pessoa.
 */
export function origemPermitida(
  origem: string | null | undefined,
  explicita?: string | null,
): string | null {
  const valor = (origem ?? "").trim().replace(/\/+$/, "");
  if (!valor) return null;
  const permitida =
    valor === PRODUCTION_ORIGIN ||
    ADDITIONAL_ALLOWED_ORIGINS.includes(valor) ||
    (!!explicita && valor === explicita.trim().replace(/\/+$/, "")) ||
    VERCEL_PREVIEW_ORIGIN_PATTERN.test(valor) ||
    LOCAL_DEV_ORIGIN_PATTERN.test(valor);
  return permitida ? valor : null;
}

export function linkDoConvite(baseUrl: string, token: string): string {
  return `${baseUrl}/admissao/${token}`;
}

export interface ResultadoCriar {
  /** `null` quando a RPC nao devolveu um id valido: nada a registar. */
  conviteId: string | null;
}

/**
 * O retorno de `rpc_hr_convite_admissao_criar` e `TABLE (convite_id,
 * rascunho_herdado)`: o PostgREST devolve um ARRAY de uma linha. Aceita-se
 * tambem um objecto solto. `rascunho_herdado` e ignorado: desde a V2 nao ha
 * heranca de rascunho. Nunca lanca.
 */
export function lerResultadoCriar(data: unknown): ResultadoCriar {
  const linha: unknown = Array.isArray(data) ? data[0] : data;
  const obj = linha && typeof linha === "object" ? (linha as Record<string, unknown>) : {};
  const id = obj.convite_id;
  return { conviteId: typeof id === "string" && UUID.test(id) ? id : null };
}

/**
 * O link que sai para quem criou o convite (RH), ou `null`. So sai quando o
 * e-mail NAO foi: e a unica vez que o RH o pode ver. Nunca e gravado.
 */
export function linkParaOCriador(args: { emailEnviado: boolean; baseUrl: string; token: string }): string | null {
  if (args.emailEnviado) return null;
  return linkDoConvite(args.baseUrl, args.token);
}

/**
 * A data (dd/mm/aaaa, fuso de Lisboa) ate quando o convite serve, a partir do
 * `valid_until` que a base devolve. `null` quando falta ou nao e uma data: o
 * e-mail omite entao a validade em vez de a inventar.
 */
export function formatarValidade(iso: unknown): string | null {
  if (typeof iso !== "string" || iso === "") return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** O corpo do e-mail do convite. A validade e a que a base calculou, nunca um numero fixo. */
export function htmlConvite(link: string, validade: string | null): string {
  const prazo = validade ? ` (valido ate ${validade})` : "";
  return `<p>Foi convidado a completar a sua admissao. Use o link${prazo}: </p>` +
    `<p><a href="${link}">Completar admissao</a></p>`;
}

/** A versao em texto simples do e-mail do convite: so o link e a validade, sem dados pessoais. */
export function textoConvite(link: string, validade: string | null): string {
  const prazo = validade ? ` (válido até ${validade})` : "";
  return `Foi convidado a completar a sua admissão${prazo}. Use este link: ${link}`;
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
