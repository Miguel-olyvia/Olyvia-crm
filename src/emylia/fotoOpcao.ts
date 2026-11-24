// Foto na opção de atributo: validar e converter no navegador. Módulo puro (sem React, sem base, sem rede).
// Aceita JPG, PNG e WebP (por MIME E pelos primeiros bytes: um GIF ou um SVG com o nome trocado não passa), recusa originais > 5 MB, descodifica respeitando a
// orientação, reduz o lado maior a 1024 px e gera WebP, baixando a qualidade de 0,85 a 0,5 até caber em 300 KB.

export const MAX_ORIGINAL = 5 * 1024 * 1024;
export const MAX_BYTES = 300 * 1024;
export const LADO_MAX = 1024;
const QUALIDADES = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5] as const;

export const MSG_FOTO = {
  tipo: "Só se aceitam fotos JPG, PNG ou WebP.",
  grande: "A foto tem mais de 5 MB.",
  reduzir: "Não foi possível reduzir a foto para 300 KB; escolha outra.",
  webp: "Este navegador não converte para WebP.",
  ler: "Não foi possível ler a foto; escolha outra.",
} as const;

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

/** As dimensões depois de reduzir o lado maior a `max`, mantendo a proporção. Não amplia; nunca devolve menos de 1 px. */
export function dimensoesReduzidas(largura: number, altura: number, max: number = LADO_MAX): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= max) return { largura, altura };
  const f = max / maior;
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) };
}

const comoWebp = (canvas: HTMLCanvasElement, q: number): Promise<Blob | null> => new Promise((ok) => canvas.toBlob(ok, "image/webp", q));

async function primeirosBytes(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.slice(0, 12).arrayBuffer());
}

/** Valida e converte o ficheiro escolhido. Nunca lança: o erro volta em português, pronto a mostrar. */
export async function prepararFotoOpcao(ficheiro: File): Promise<ResFoto> {
  if (!MIME_ACEITES.has(ficheiro.type)) return { ok: false, erro: MSG_FOTO.tipo };
  if (ficheiro.size > MAX_ORIGINAL) return { ok: false, erro: MSG_FOTO.grande };
  let cabecalho: Uint8Array;
  try { cabecalho = await primeirosBytes(ficheiro); } catch { return { ok: false, erro: MSG_FOTO.ler }; }
  if (!tipoPorBytes(cabecalho)) return { ok: false, erro: MSG_FOTO.tipo };
  if (typeof createImageBitmap !== "function") return { ok: false, erro: MSG_FOTO.webp };

  let imagem: ImageBitmap;
  try { imagem = await createImageBitmap(ficheiro, { imageOrientation: "from-image" }); } catch { return { ok: false, erro: MSG_FOTO.ler }; }
  try {
    const { largura, altura } = dimensoesReduzidas(imagem.width, imagem.height);
    const canvas = document.createElement("canvas");
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
  }
}
