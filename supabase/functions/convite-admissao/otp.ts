/**
 * O codigo OTP do portal de admissao.
 *
 * A Edge GERA o codigo (6 digitos, `crypto.getRandomValues`) e calcula o HMAC
 * dele com um PEPPER de servidor (segredo da Edge `PORTAL_OTP_PEPPER`, nunca
 * escrito no codigo). A base so ve o HMAC (`otp_pedir` grava-o, `otp_verificar`
 * compara-o por igualdade de texto): quem leia a tabela nao consegue
 * reconstruir um codigo, e quem tenha o HMAC sem o pepper nao o consegue
 * adivinhar por forca bruta offline (1 milhao de codigos).
 *
 * A mensagem do HMAC e `hr-admissao-otp|<token_hash>|<codigo>`. Liga-se ao
 * token_hash, e nao ao id do convite, porque a Edge nao conhece o id antes de
 * chamar a RPC (as RPCs publicas identificam o convite pelo token_hash). Um
 * HMAC de um convite nao serve noutro, e regenerar o link (que troca o
 * token_hash e apaga o OTP) invalida tambem qualquer HMAC antigo.
 *
 * Modulo sem Deno e sem rede: so Web Crypto, por isso testavel no vitest.
 */

/** Um pepper curto enfraquece o HMAC: exige-se pelo menos isto. */
export const PEPPER_MIN = 32;

const CODIGO = /^\d{6}$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** Maior multiplo de 10^6 abaixo de 2^32: rejeitar o resto evita o vies do modulo. */
const LIMITE_SEM_VIES = Math.floor(0x100000000 / 1_000_000) * 1_000_000;

export function pepperValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length >= PEPPER_MIN;
}

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 6 digitos uniformes (com zeros a esquerda), de `crypto.getRandomValues`. */
export function gerarCodigoOtp(): string {
  const amostra = new Uint32Array(1);
  do {
    crypto.getRandomValues(amostra);
  } while (amostra[0] >= LIMITE_SEM_VIES);
  return String(amostra[0] % 1_000_000).padStart(6, "0");
}

/**
 * HMAC-SHA-256 em hex (64) do codigo, ligado ao convite. Falha FECHADA: sem
 * pepper valido lanca `otp_pepper_invalido` (a mensagem nunca traz o pepper nem
 * o codigo).
 */
export async function hmacOtp(pepper: string, tokenHash: string, codigo: string): Promise<string> {
  if (!pepperValido(pepper)) throw new Error("otp_pepper_invalido");
  if (!CODIGO.test(codigo) || !HEX64.test(tokenHash)) throw new Error("otp_pedido_invalido");
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
    new TextEncoder().encode(`hr-admissao-otp|${tokenHash}|${codigo}`),
  );
  return Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
