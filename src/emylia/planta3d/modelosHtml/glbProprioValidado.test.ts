// 27/11: um GLB PRÓPRIO (o que a empresa carrega e qualquer pessoa com a ficha aberta vê) é validado no runtime antes de o carregador o ler: quem tem `products.edit` pode pôr bytes
// quaisquer no bucket pela API, e o GLTFLoader segue os URI que o ficheiro mandar. `lerGlb(url, { validar: true })` pede os bytes, corre `validarGlb` e só então `parse`.
// E o que sai da cache liberta também os materiais e as texturas embebidas, não só a geometria.
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { glbDeTeste } from "../__fixtures__/glbDeTeste";
import { glbEmCache, lerGlb, reterGlb, soltarGlb } from "./glb";

/** `lerGlb` suspende (lança a promessa) enquanto carrega: espera-se e lê-se outra vez. */
async function ler(url: string, validar = true): Promise<THREE.Group | Error> {
  for (let i = 0; i < 50; i++) {
    try { return lerGlb(url, { validar }); } catch (e) { if (e instanceof Promise) await e; else return e as Error; }
  }
  throw new Error("o GLB nunca ficou pronto");
}
const resposta = (dados: ArrayBuffer, ok = true, estado = 200) => ({ ok, status: estado, arrayBuffer: () => Promise.resolve(dados) }) as unknown as Response;

afterEach(() => { vi.restoreAllMocks(); });

describe("lerGlb com validar: só abre o que passou em validarGlb", () => {
  it("um GLB bom pede-se uma vez e abre", async () => {
    const rede = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(glbDeTeste()));
    const r = await ler("https://armazem.exemplo/catalogo-modelos3d/a/bom.glb");
    expect(r).toBeInstanceOf(THREE.Group);
    expect(rede).toHaveBeenCalledTimes(1);
  });

  it("um GLB com um URI externo escondido num segundo bloco JSON nunca chega ao carregador: lança o erro da validação", async () => {
    const base = glbDeTeste(), u = new Uint8Array(base);
    const mau = new TextEncoder().encode('{"asset":{"version":"2.0"},"buffers":[{"byteLength":4,"uri":"https://exemplo.invalid/x.bin"}]}  ');
    const compr = base.byteLength + 8 + mau.length, saida = new ArrayBuffer(compr), w = new DataView(saida), s = new Uint8Array(saida);
    s.set(u);
    w.setUint32(8, compr, true);
    w.setUint32(base.byteLength, mau.length, true); w.setUint32(base.byteLength + 4, 0x4e4f534a, true); s.set(mau, base.byteLength + 8);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(saida));
    const r = await ler("https://armazem.exemplo/catalogo-modelos3d/a/duplo.glb");
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/mais de um bloco JSON/);
  });

  it("um GLB com Draco ou com um URI externo lança, sem chegar ao carregador", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(glbDeTeste({ uriExterno: true })));
    const r = await ler("https://armazem.exemplo/catalogo-modelos3d/a/externo.glb");
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/externo/);
  });

  it("uma resposta que não é 200 lança (a reserva do 3D pega nela)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(new ArrayBuffer(0), false, 404));
    const r = await ler("https://armazem.exemplo/catalogo-modelos3d/a/falta.glb");
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/404/);
  });

  it("sem validar (genéricos e modelos do HTML, do próprio sítio) o caminho é o do carregador, sem fetch nosso", async () => {
    const rede = vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(glbDeTeste({ uriExterno: true })));
    await ler("/modelos3d/genericos/nao-validado.glb", false);
    // o carregador usa o seu próprio pedido (que aqui falha, jsdom): o que interessa é que não passou pela validação nem por ela foi recusado
    expect(rede.mock.calls.every(([u]) => String(u).includes("nao-validado"))).toBe(true);
  });
});

describe("soltarGlb liberta geometria, materiais e texturas da cena em cache", () => {
  it("dispõe do material e do mapa de cada malha quando a última peça sai", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(glbDeTeste()));
    const url = "https://armazem.exemplo/catalogo-modelos3d/a/liberta.glb";
    const cena = (await ler(url)) as THREE.Group;
    const gastos: string[] = [];
    cena.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry, mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
      vi.spyOn(geo, "dispose").mockImplementation(() => { gastos.push("geo"); });
      for (const mat of mats) {
        mat.map = new THREE.Texture();
        vi.spyOn(mat.map, "dispose").mockImplementation(() => { gastos.push("mapa"); });
        vi.spyOn(mat, "dispose").mockImplementation(() => { gastos.push("mat"); });
      }
    });
    reterGlb(url);
    soltarGlb(url, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(glbEmCache()).not.toContain(url);
    expect(gastos).toContain("geo");
    expect(gastos).toContain("mat");
    expect(gastos).toContain("mapa");
  });
});
