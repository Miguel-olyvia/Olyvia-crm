// O ciclo de vida do GLB próprio no 3D: pede à cache e solta ao sair, refaz-se quando muda a medida ou a cor do produto, liberta os materiais, e diz ao ecrã se há aviso.
// O canvas e a cache de rede são simulados (o GLB de teste abre-se em memória com o mesmo carregador).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { glbDeTeste } from "./__fixtures__/glbDeTeste";

const mundo = vi.hoisted(() => ({
  invalidate: vi.fn(),
  cena: null as unknown,
  erro: null as unknown,
  reter: vi.fn(), soltar: vi.fn(),
}));
vi.mock("@react-three/fiber", () => ({ useThree: (sel: (s: { invalidate: () => void }) => unknown) => sel({ invalidate: mundo.invalidate }) }));
vi.mock("./modelosHtml/glb", () => ({
  lerGlb: () => { if (mundo.erro) throw mundo.erro; return mundo.cena; },
  reterGlb: (u: string) => mundo.reter(u), soltarGlb: (u: string) => mundo.soltar(u),
}));

import { lerEstadoGlb } from "./estadoGlbProprio";
import { useModeloProprio } from "./useModeloProprio";

const URL_A = "https://cdn.teste/catalogo-modelos3d/a.glb";
const MEDIDAS = { larguraM: 0.6, profundidadeM: 0.4, alturaM: 0.9 };
const corpo = (g: THREE.Object3D) => { let r: THREE.MeshStandardMaterial | null = null; g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.name === "corpo") r = m; }); return r as THREE.MeshStandardMaterial | null; };

beforeEach(async () => {
  mundo.invalidate.mockClear(); mundo.reter.mockClear(); mundo.soltar.mockClear(); mundo.erro = null;
  mundo.cena = (await new GLTFLoader().parseAsync(glbDeTeste(), "")).scene;
});

describe("useModeloProprio", () => {
  it("retém o GLB na cache, monta com as medidas do produto, regista «ok» e pede um desenho; ao sair solta e limpa", () => {
    const { result, unmount } = renderHook(() => useModeloProprio({ url: URL_A, medidas: MEDIDAS }));
    expect(mundo.reter).toHaveBeenCalledWith(URL_A);
    const t = new THREE.Box3().setFromObject(result.current.grupo).getSize(new THREE.Vector3());
    expect(t.y).toBeCloseTo(0.9, 4);
    expect(lerEstadoGlb(URL_A)).toEqual({ tipo: "ok" });
    expect(mundo.invalidate).toHaveBeenCalled();
    unmount();
    expect(mundo.soltar).toHaveBeenCalledWith(URL_A);
    expect(lerEstadoGlb(URL_A)).toBeNull();
  });

  it("refaz-se quando muda a cor do produto (materiais novos, os antigos libertados) e fica igual se nada muda", () => {
    const { result, rerender } = renderHook((p: { cor?: string }) => useModeloProprio({ url: URL_A, medidas: MEDIDAS, ...(p.cor ? { cor: p.cor } : {}) }), { initialProps: {} as { cor?: string } });
    const primeiro = result.current;
    rerender({});
    expect(result.current).toBe(primeiro);
    const matAntigo = corpo(primeiro.grupo)!, dispose = vi.spyOn(matAntigo, "dispose");
    rerender({ cor: "#336699" });
    expect(result.current).not.toBe(primeiro);
    expect(`#${corpo(result.current.grupo)!.color.getHexString()}`).toBe("#336699");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("sem medidas do produto o GLB fica no tamanho nativo; com medidas muda quando elas mudam", () => {
    const { result, rerender } = renderHook((p: { m: typeof MEDIDAS | null }) => useModeloProprio({ url: URL_A, medidas: p.m }), { initialProps: { m: null as typeof MEDIDAS | null } });
    expect(new THREE.Box3().setFromObject(result.current.grupo).getSize(new THREE.Vector3()).y).toBeCloseTo(1, 4);
    rerender({ m: MEDIDAS });
    expect(new THREE.Box3().setFromObject(result.current.grupo).getSize(new THREE.Vector3()).y).toBeCloseTo(0.9, 4);
  });

  it("a textura do produto vai ao corpo (e só aos materiais permitidos)", () => {
    const tex = new THREE.Texture();
    const { result } = renderHook(() => useModeloProprio({ url: URL_A, medidas: MEDIDAS, textura: { tex, ladoCm: 40 } }));
    expect(corpo(result.current.grupo)!.map).toBe(tex);
  });

  it("um aviso (tamanho nativo fora de 1 cm a 5 m, sem medidas) fica registado para o ecrã mostrar", async () => {
    mundo.cena = (await new GLTFLoader().parseAsync(glbDeTeste({ tamanho: [60, 80, 60] }), "")).scene;
    renderHook(() => useModeloProprio({ url: URL_A, medidas: null }));
    expect(lerEstadoGlb(URL_A)).toMatchObject({ tipo: "aviso", texto: expect.stringMatching(/grande/) });
  });

  it("se a cache falhar (rede, cabeçalho) o erro sobe: é a reserva do Visualizador3D que põe o genérico", () => {
    mundo.erro = new Error("Couldn't load URL");
    const calar = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useModeloProprio({ url: URL_A, medidas: MEDIDAS }))).toThrow(/load URL/);
    calar.mockRestore();
  });

  it("um GLB com triângulos a mais lança o erro próprio (o genérico entra, com a nota)", async () => {
    mundo.cena = (await new GLTFLoader().parseAsync(glbDeTeste({ triangulos: 200_002 }), "")).scene;
    const calar = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useModeloProprio({ url: URL_A, medidas: MEDIDAS }))).toThrow(/200 000/);
    calar.mockRestore();
  });
});
