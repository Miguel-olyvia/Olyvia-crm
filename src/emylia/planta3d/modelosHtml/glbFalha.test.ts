// 25/11: um GLB que falha uma vez (rede, servidor) já não fica na cache para sempre: passado TENTAR_GLB_APOS_MS, a peça seguinte volta a pedi-lo.
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

const pedidos: string[] = [];
let falhar = true;
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    setMeshoptDecoder() { return this; }
    loadAsync(url: string) { pedidos.push(url); return falhar ? Promise.reject(new Error("404")) : Promise.resolve({ scene: new THREE.Group() }); }
  },
}));
const { lerGlb, TENTAR_GLB_APOS_MS } = await import("./glb");

afterEach(() => { vi.useRealTimers(); });

const ler = (url: string): unknown => { try { return lerGlb(url); } catch (e) { return e; } };

describe("cache dos GLB: uma falha não fica para sempre", () => {
  it("falha, não repete logo (sem ciclo), e passado um bocado volta a pedir e abre", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const url = "/modelos3d/genericos/sanita.glb";
    await ler(url); // suspende (a promessa) até o pedido acabar
    expect(ler(url)).toBeInstanceOf(Error);
    expect(ler(url)).toBeInstanceOf(Error); // logo a seguir, a mesma falha: o React volta a desenhar a peça uma vez antes da reserva
    expect(pedidos).toHaveLength(1);
    falhar = false;
    vi.setSystemTime(Date.now() + TENTAR_GLB_APOS_MS);
    const p = ler(url);
    expect(p).toBeInstanceOf(Promise); // pede outra vez
    await p;
    expect(ler(url)).toBeInstanceOf(THREE.Group);
    expect(pedidos).toHaveLength(2);
  });
});
