// Foto na opção de atributo: validar e converter no navegador. Módulo puro (sem React, sem base, sem rede).
// Aceita JPG, PNG e WebP (por MIME E pelos primeiros bytes: um GIF ou um SVG com o nome trocado não passa), recusa originais > 5 MB, descodifica respeitando a
// orientação, reduz o lado maior a 1024 px e gera WebP, baixando a qualidade de 0,85 a 0,5 até caber em 300 KB.

export const MAX_ORIGINAL = 5 * 1024 * 1024;
export const MAX_BYTES = 300 * 1024;
export const LADO_MAX = 1024;
/** Acima disto recusa-se SEM descodificar: um ficheiro pequeno pode declarar dezenas de milhares de píxeis de lado e esgotar a memória do navegador ao abrir (bomba de descompressão). */
export const MAX_PIXEIS = 50_000_000;
/** Quanto do início do ficheiro se lê para o tipo e as dimensões (o SOF de um JPEG pode vir depois de EXIF e miniaturas). */
const BYTES_CABECALHO = 512 * 1024;
const QUALIDADES = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5] as const;

export const MSG_FOTO = {
  tipo: "Só se aceitam fotos JPG, PNG ou WebP.",
  grande: "A foto tem mais de 5 MB.",
  reduzir: "Não foi possível reduzir a foto para 300 KB; escolha outra.",
  webp: "Este navegador não converte para WebP.",
  ler: "Não foi possível ler a foto; escolha outra.",
  pixeis: "A foto é demasiado grande (em píxeis).",
  carregar: "Não foi possível carregar a foto.",
} as const;

/** Traduz o erro (em inglês) do storage para português: os conhecidos têm mensagem própria, o resto uma genérica. */
export function mensagemDoStorage(texto: string | null | undefined): string {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("bucket not found")) return "A pasta das fotos ainda não está disponível nesta base.";
  if (t.includes("row-level security") || t.includes("unauthorized") || t.includes("not authorized")) return "Não tem permissão para carregar fotos.";
  if (t.includes("too large") || t.includes("exceeded the maximum")) return "A foto é demasiado grande para carregar.";
  return MSG_FOTO.carregar;
}

export interface DadosFoto { blob: Blob; largura: number; altura: number; bytes: number }
export type ResFoto = { ok: true; v: DadosFoto } | { ok: false; erro: string };

const MIME_ACEITES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);
const ASCII = (b: Uint8Array, de: number, t: string): boolean => t.split("").every((c, i) => b[de + i] === c.charCodeAt(0));

/** O tipo verdadeiro da imagem, pelos primeiros bytes (JPG: FF D8 FF; PNG: 89 «PNG»; WebP: «RIFF» … «WEBP»). Outra coisa (GIF, SVG, texto): null. */
export function tipoPorBytes(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ASCII(b, 1, "PNG") && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && ASCII(b, 0, "RIFF") && ASCII(b, 8, "WEBP")) return "webp";
  return null;
}

const u16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number): number => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le24 = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** A largura e a altura declaradas no cabeçalho (PNG: IHDR; JPEG: primeiro SOF; WebP: VP8X, VP8L ou VP8), sem descodificar. Cabeçalho cortado ou desconhecido: null. */
export function dimensoesDoCabecalho(b: Uint8Array): { largura: number; altura: number } | null {
  const tipo = tipoPorBytes(b);
  if (tipo === "png") return b.length >= 24 ? { largura: u32(b, 16), altura: u32(b, 20) } : null;
  if (tipo === "webp") {
    if (b.length >= 30 && ASCII(b, 12, "VP8X")) return { largura: le24(b, 24) + 1, altura: le24(b, 27) + 1 };
    if (b.length >= 25 && ASCII(b, 12, "VP8L") && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (b.length >= 30 && ASCII(b, 12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { largura: (b[26] | (b[27] << 8)) & 0x3fff, altura: (b[28] | (b[29] << 8)) & 0x3fff };
    return null;
  }
  if (tipo === "jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x00 || m === 0x01 || m === 0xd8 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { altura: u16(b, i + 5), largura: u16(b, i + 7) };
      if (m === 0xda) return null; // começa a imagem sem ter aparecido o SOF
      i += 2 + u16(b, i + 2);
    }
  }
  return null;
}

/** As dimensões depois de reduzir o lado maior a `max`, mantendo a proporção. Não amplia; nunca devolve menos de 1 px. */
export function dimensoesReduzidas(largura: number, altura: number, max: number = LADO_MAX): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= max) return { largura, altura };
  const f = max / maior;
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) };
}

const comoWebp = (canvas: HTMLCanvasElement, q: number): Promise<Blob | null> => new Promise((ok) => canvas.toBlob(ok, "image/webp", q));

async function primeirosBytes(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.slice(0, BYTES_CABECALHO).arrayBuffer());
}

/** Valida e converte o ficheiro escolhido. Nunca lança: o erro volta em português, pronto a mostrar. */
export async function prepararFotoOpcao(ficheiro: File): Promise<ResFoto> {
  if (!MIME_ACEITES.has(ficheiro.type)) return { ok: false, erro: MSG_FOTO.tipo };
  if (ficheiro.size > MAX_ORIGINAL) return { ok: false, erro: MSG_FOTO.grande };
  let cabecalho: Uint8Array;
  try { cabecalho = await primeirosBytes(ficheiro); } catch { return { ok: false, erro: MSG_FOTO.ler }; }
  if (!tipoPorBytes(cabecalho)) return { ok: false, erro: MSG_FOTO.tipo };
  const dims = dimensoesDoCabecalho(cabecalho);
  if (dims && dims.largura * dims.altura > MAX_PIXEIS) return { ok: false, erro: MSG_FOTO.pixeis };
  if (typeof createImageBitmap !== "function") return { ok: false, erro: MSG_FOTO.webp };

  let imagem: ImageBitmap;
  try { imagem = await createImageBitmap(ficheiro, { imageOrientation: "from-image" }); } catch { return { ok: false, erro: MSG_FOTO.ler }; }
  const canvas = document.createElement("canvas");
  try {
    const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, erro: MSG_FOTO.webp };
    ctx.drawImage(imagem, 0, 0, largura, altura);
    for (const q of QUALIDADES) {
      const blob = await comoWebp(canvas, q);
      // um navegador sem WebP devolve PNG (ou nada): nunca se envia isso como se fosse WebP
      if (!blob || blob.type !== "image/webp") return { ok: false, erro: MSG_FOTO.webp };
      if (blob.size <= MAX_BYTES) return { ok: true, v: { blob, largura, altura, bytes: blob.size } };
    }
    return { ok: false, erro: MSG_FOTO.reduzir };
  } finally {
    imagem.close?.();
    // o canvas guarda a imagem inteira em memória até ser recolhido: encolhe-se já
    canvas.width = 0; canvas.height = 0;
  }
}
