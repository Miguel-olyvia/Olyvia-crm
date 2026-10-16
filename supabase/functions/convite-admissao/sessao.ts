/**
 * A sessao do portal de admissao (decisao 12: 30 min sem actividade, 4 h no
 * total; os prazos sao da RPC, nao daqui).
 *
 * A Edge gera o segredo (32 bytes = 256 bits, base64url, 43 caracteres) ao
 * verificar o OTP e manda a base SO o SHA-256 dele. O segredo chega ao browser
 * uma vez, no CORPO da resposta de `otp_verificar`, e volta no cabecalho
 * `x-portal-sessao` (ou no campo `sessao` do corpo). NUNCA no URL: um URL fica
 * em historicos, logs de proxy e no Referer.
 *
 * Modulo sem Deno e sem rede.
 */
import { sha256Hex } from "./otp.ts";

export const CABECALHO_SESSAO = "x-portal-sessao";

const FORMATO = /^[A-Za-z0-9_-]{43}$/;

export function formatoSessaoValido(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO.test(valor);
}

/** O segredo (para o browser) e o SHA-256 hex dele (para a base). */
export async function gerarSessao(): Promise<{ sessao: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const sessao = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { sessao, hash: await sha256Hex(sessao) };
}

/**
 * A sessao que o browser mandou: o cabecalho ganha ao corpo. Nunca se le o URL.
 * `null` se faltar ou vier mal formada (nunca lanca).
 */
export function lerSessaoDoPedido(req: Request, payload: Record<string, unknown>): string | null {
  for (const candidata of [req.headers.get(CABECALHO_SESSAO), payload.sessao]) {
    if (formatoSessaoValido(candidata)) return candidata;
  }
  return null;
}

/** Os cabecalhos CORS permitidos, com `x-portal-sessao` (o CORS partilhado nao o conhece). */
export function comCabecalhoSessao(cors: Record<string, string>): Record<string, string> {
  const atual = cors["Access-Control-Allow-Headers"] ?? "";
  const lista = atual.split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (!lista.some((h) => h.toLowerCase() === CABECALHO_SESSAO)) lista.push(CABECALHO_SESSAO);
  return { ...cors, "Access-Control-Allow-Headers": lista.join(", ") };
}
