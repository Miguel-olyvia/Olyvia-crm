/**
 * PIN, sessao e identificador de IP da denuncia publica.
 *
 * A Edge GERA o PIN (6 digitos, `crypto.getRandomValues`, sem vies de modulo) e calcula o
 * HMAC-SHA-256 dele com um PEPPER de servidor (segredo da Edge `DENUNCIAS_PIN_PEPPER`,
 * nunca escrito no codigo). A base so ve o HMAC: quem leia a tabela nao reconstroi um PIN e
 * quem tenha o HMAC sem o pepper nao o adivinha por forca bruta offline.
 *
 * A mensagem do HMAC liga-se a organizacao e ao codigo (`den-pin|org|codigo|pin`): um HMAC
 * de uma denuncia nao serve noutra. O IP so existe como HMAC com pepper proprio E o dia na
 * mensagem (o identificador roda todos os dias, para nao ligar dias diferentes).
 *
 * Modulo sem Deno e sem rede: so Web Crypto, por isso testavel no vitest.
 */

/** Um pepper curto enfraquece o HMAC: exige-se pelo menos isto. */
export const PEPPER_MIN = 32;

const PIN = /^\d{6}$/;
/** Igual a base (denuncias_proximo_codigo): 4 digitos com zeros, ate 6 depois do 9999.o caso do ano. */
const CODIGO = /^DEN-\d{4}-\d{4,6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Maior multiplo de 10^6 abaixo de 2^32: rejeitar o resto evita o vies do modulo. */
const LIMITE_SEM_VIES = Math.floor(0x100000000 / 1_000_000) * 1_000_000;

export function pepperValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length >= PEPPER_MIN;
}

function paraHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(texto: string): Promise<string> {
  return paraHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

async function hmacHex(pepper: string, mensagem: string): Promise<string> {
  if (!pepperValido(pepper)) throw new Error("pepper_invalido");
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return paraHex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem)));
}

function uint32Aleatorio(): number {
  const amostra = new Uint32Array(1);
  crypto.getRandomValues(amostra);
  return amostra[0];
}

/** 6 digitos uniformes (com zeros a esquerda). `amostra` e injectavel para os testes. */
export function gerarPin(amostra: () => number = uint32Aleatorio): string {
  let n = amostra();
  while (n >= LIMITE_SEM_VIES) n = amostra();
  return String(n % 1_000_000).padStart(6, "0");
}

export const normalizarCodigo = (texto: string): string => texto.trim().toUpperCase().replace(/\s+/g, "");
export const normalizarPin = (texto: string): string => texto.replace(/\s+/g, "");

/**
 * HMAC (hex de 64) do PIN, ligado a organizacao e ao codigo. Falha FECHADA: sem pepper
 * valido lanca `pepper_invalido`; com entradas mal formadas, `pedido_invalido` (a mensagem
 * nunca traz o pepper nem o PIN).
 */
export async function hmacPin(pepper: string, organizationId: string, codigo: string, pin: string): Promise<string> {
  if (!pepperValido(pepper)) throw new Error("pepper_invalido");
  if (!UUID.test(organizationId) || !CODIGO.test(codigo) || !PIN.test(pin)) throw new Error("pedido_invalido");
  return hmacHex(pepper, `den-pin|${organizationId}|${codigo}|${pin}`);
}

/** HMAC do IP com o dia (AAAA-MM-DD, UTC): so serve para contar pedidos. */
export async function hmacIp(pepper: string, ip: string, dia: string): Promise<string> {
  return hmacHex(pepper, `den-ip|${dia}|${ip}`);
}

/** 32 bytes aleatorios em base64url (43 caracteres) e o SHA-256 (hex de 64) desse texto. */
export async function gerarSessao(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: await sha256Hex(token) };
}
