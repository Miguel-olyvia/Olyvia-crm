// Foto na opção de atributo: validar o ficheiro (tipo por MIME e por bytes), reduzir para 1024 px e converter para WebP até caber em 300 KB.
// O canvas e o createImageBitmap são simulados (o jsdom não os tem).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LADO_MAX, MAX_BYTES, MAX_ORIGINAL, MSG_FOTO, dimensoesReduzidas, prepararFotoOpcao, tipoPorBytes } from "./fotoOpcao";

const JPG = [0xff, 0xd8, 0xff, 0xe0], PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const ficheiro = (cab: number[], tipo: string, nome = "foto", tamanho = 64) => {
  const b = new Uint8Array(Math.max(tamanho, cab.length));
  b.set(cab);
  return new File([b], nome, { type: tipo });
};

let desenhar: ReturnType<typeof vi.fn>;
let qualidades: number[];
let tamanhoPorQ: (q: number) => number;
let tipoBlob: string | null;
let fechar: ReturnType<typeof vi.fn>;

beforeEach(() => {
  qualidades = []; tipoBlob = "image/webp"; tamanhoPorQ = () => 1000; desenhar = vi.fn(); fechar = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 2000, close: fechar })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ drawImage: desenhar })) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((cb: BlobCallback, _t?: string, q?: number) => {
    qualidades.push(q ?? -1);
    cb(tipoBlob === null ? null : new Blob([new Uint8Array(tamanhoPorQ(q ?? 1))], { type: tipoBlob }));
  }) as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("tipoPorBytes", () => {
  it("reconhece JPG, PNG e WebP pelos primeiros bytes", () => {
    expect(tipoPorBytes(new Uint8Array(JPG))).toBe("jpeg");
    expect(tipoPorBytes(new Uint8Array(PNG))).toBe("png");
    expect(tipoPorBytes(new Uint8Array(WEBP))).toBe("webp");
  });
  it("GIF, SVG, texto e vazio não são fotos aceites", () => {
    expect(tipoPorBytes(new Uint8Array(GIF))).toBeNull();
    expect(tipoPorBytes(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(tipoPorBytes(new Uint8Array(0))).toBeNull();
  });
});

describe("dimensoesReduzidas", () => {
  it("reduz o lado maior a 1024 mantendo a proporção", () => {
    expect(dimensoesReduzidas(4000, 2000)).toEqual({ largura: 1024, altura: 512 });
    expect(dimensoesReduzidas(2000, 4000)).toEqual({ largura: 512, altura: 1024 });
    expect(dimensoesReduzidas(3000, 3000)).toEqual({ largura: 1024, altura: 1024 });
  });
  it("não amplia uma foto pequena", () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesReduzidas(1024, 1024)).toEqual({ largura: 1024, altura: 1024 });
  });
  it("nunca devolve 0 px (uma tira muito fina fica com 1 px)", () => {
    expect(dimensoesReduzidas(10000, 3)).toEqual({ largura: 1024, altura: 1 });
  });
});

describe("prepararFotoOpcao: recusas", () => {
  it("recusa GIF (MIME e bytes) e SVG com a mensagem dos tipos aceites", async () => {
    for (const f of [ficheiro(GIF, "image/gif"), new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })]) {
      expect(await prepararFotoOpcao(f)).toEqual({ ok: false, erro: "Só se aceitam fotos JPG, PNG ou WebP." });
    }
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it("recusa um ficheiro cujo MIME diz JPG mas cujos bytes são de outra coisa", async () => {
    expect(await prepararFotoOpcao(ficheiro(GIF, "image/jpeg"))).toEqual({ ok: false, erro: MSG_FOTO.tipo });
  });
  it("recusa um MIME vazio ou desconhecido, mesmo com bytes de JPG", async () => {
    expect(await prepararFotoOpcao(ficheiro(JPG, ""))).toEqual({ ok: false, erro: MSG_FOTO.tipo });
  });
  it("recusa mais de 5 MB, sem tentar descodificar", async () => {
    const r = await prepararFotoOpcao(ficheiro(JPG, "image/jpeg", "grande", MAX_ORIGINAL + 1));
    expect(r).toEqual({ ok: false, erro: "A foto tem mais de 5 MB." });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it("aceita exatamente 5 MB", async () => {
    const r = await prepararFotoOpcao(ficheiro(JPG, "image/jpeg", "justo", MAX_ORIGINAL));
    expect(r.ok).toBe(true);
  });
  it("uma foto que o navegador não consegue descodificar diz-o em português", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("InvalidStateError"); }));
    const r = await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"));
    expect(r).toEqual({ ok: false, erro: MSG_FOTO.ler });
  });
});

describe("prepararFotoOpcao: conversão", () => {
  it("descodifica respeitando a orientação, desenha reduzida a 1024 px e devolve o WebP", async () => {
    const r = await prepararFotoOpcao(ficheiro(PNG, "image/png"));
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(desenhar).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 512);
    expect(r.ok && r.v).toMatchObject({ largura: 1024, altura: 512, bytes: 1000 });
    expect(r.ok && r.v.blob.type).toBe("image/webp");
    expect(LADO_MAX).toBe(1024);
    expect(fechar).toHaveBeenCalled();
  });
  it("começa a 0,85 e fica por aí se já cabe em 300 KB", async () => {
    await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"));
    expect(qualidades).toEqual([0.85]);
  });
  it("desce a qualidade até caber e pára na primeira que cabe", async () => {
    tamanhoPorQ = (q) => (q > 0.7 ? MAX_BYTES + 1 : MAX_BYTES);
    const r = await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"));
    expect(qualidades).toEqual([0.85, 0.8, 0.75, 0.7]);
    expect(r.ok && r.v.bytes).toBe(MAX_BYTES);
  });
  it("se nem a 0,5 cabe, diz que não foi possível reduzir", async () => {
    tamanhoPorQ = () => MAX_BYTES + 1;
    const r = await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"));
    expect(r).toEqual({ ok: false, erro: "Não foi possível reduzir a foto para 300 KB; escolha outra." });
    expect(qualidades[0]).toBe(0.85);
    expect(qualidades[qualidades.length - 1]).toBe(0.5);
    expect(qualidades.length).toBeLessThanOrEqual(10);
  });
  it("sem WebP no navegador (o blob vem noutro tipo ou null), diz-o e não devolve a foto", async () => {
    tipoBlob = "image/png";
    expect(await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"))).toEqual({ ok: false, erro: "Este navegador não converte para WebP." });
    tipoBlob = null;
    expect(await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"))).toEqual({ ok: false, erro: "Este navegador não converte para WebP." });
  });
  it("sem contexto 2D no canvas, diz que o navegador não converte", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => null) as never);
    expect(await prepararFotoOpcao(ficheiro(JPG, "image/jpeg"))).toEqual({ ok: false, erro: MSG_FOTO.webp });
  });
  it("uma foto WebP também passa pela conversão (fica reduzida e dentro do limite)", async () => {
    const r = await prepararFotoOpcao(ficheiro(WEBP, "image/webp"));
    expect(r.ok).toBe(true);
    expect(desenhar).toHaveBeenCalled();
  });
});
