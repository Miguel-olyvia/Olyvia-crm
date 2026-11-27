// 27/11: `semearGlb` põe na cache dos GLB (a de lerGlb) um ficheiro que já está em memória, por chave, sem o pedir à rede. Serve a pré-visualização do diálogo do GLB próprio: o ficheiro
// escolhido (ainda não enviado) lê-se pelos bytes e não por um endereço `blob:`, que a CSP da aplicação (connect-src sem `blob:`) bloquearia.
import { afterEach, describe, expect, it, vi } from "vitest";
import { glbDeTeste } from "../__fixtures__/glbDeTeste";
import { glbEmCache, lerGlb, reterGlb, semearGlb, soltarGlb } from "./glb";

/** `lerGlb` suspende (lança a promessa) enquanto carrega: espera-se e volta-se a ler. */
async function ler(chave: string) {
  for (let i = 0; i < 50; i++) {
    try { return lerGlb(chave); } catch (e) { if (e instanceof Promise) await e; else throw e; }
  }
  throw new Error("o GLB semeado nunca ficou pronto");
}

afterEach(() => { vi.restoreAllMocks(); });

describe("semearGlb", () => {
  it("lê-se como um GLB carregado (uma cena com malhas) e não vai à rede", async () => {
    const rede = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sem rede"));
    semearGlb("glb-local:um", glbDeTeste());
    const cena = await ler("glb-local:um");
    let malhas = 0;
    cena.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) malhas++; });
    expect(malhas).toBeGreaterThan(0);
    expect(rede).not.toHaveBeenCalled();
  });

  it("semear a mesma chave outra vez não troca o que já lá está", async () => {
    semearGlb("glb-local:dois", glbDeTeste());
    const antes = await ler("glb-local:dois");
    semearGlb("glb-local:dois", glbDeTeste({ triangulos: 24 }));
    expect(await ler("glb-local:dois")).toBe(antes);
  });

  it("bytes que não são um GLB fazem lerGlb lançar um erro (a reserva do 3D pega nele), não uma promessa para sempre", async () => {
    semearGlb("glb-local:mau", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).buffer);
    let erro: unknown = null;
    for (let i = 0; i < 50 && !erro; i++) {
      try { lerGlb("glb-local:mau"); } catch (e) { if (e instanceof Promise) await e; else erro = e; }
    }
    expect(erro).toBeInstanceOf(Error);
  });

  it("liberta-se da cache como os outros, depois de a última peça o largar", async () => {
    semearGlb("glb-local:tres", glbDeTeste());
    await ler("glb-local:tres");
    reterGlb("glb-local:tres");
    expect(glbEmCache()).toContain("glb-local:tres");
    soltarGlb("glb-local:tres", 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(glbEmCache()).not.toContain("glb-local:tres");
  });
});
