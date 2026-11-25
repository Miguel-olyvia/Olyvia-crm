// 24/11 (fase 1): as fotos de várias zonas. Ao mudar a foto de UMA zona as outras não podem piscar para cor lisa: os URL novos pedem-se ANTES de largar os que saem,
// e o estado não se limpa no cleanup (só ao desmontar se largam todos). A cache de texturas (texturaProduto) está simulada: o que interessa aqui é a ordem dos pedidos e o que o hook devolve.
import { act, cleanup, renderHook } from "@testing-library/react";
import type * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ eventos: [] as string[], ouvintes: new Map<string, (t: unknown) => void>(), texs: new Map<string, object>() }));
vi.mock("./texturaProduto", () => ({
  pedirTextura: (url: string, aoResolver: (t: unknown) => void) => {
    sim.eventos.push(`pedir:${url}`);
    sim.ouvintes.set(url, aoResolver);
    return () => { sim.eventos.push(`largar:${url}`); sim.ouvintes.delete(url); };
  },
}));

import { useTexturasPorUrl } from "./useTexturasPorUrl";

const resolver = (url: string) => { const t = { url } as unknown as THREE.Texture; sim.texs.set(url, t); act(() => { sim.ouvintes.get(url)?.(t); }); };
const montar = (inicial: string[]) => {
  const historico: ReadonlyMap<string, THREE.Texture>[] = [];
  const r = renderHook(({ urls }: { urls: string[] }) => { const m = useTexturasPorUrl(urls); historico.push(m); return m; }, { initialProps: { urls: inicial } });
  return { ...r, historico };
};

beforeEach(() => { sim.eventos.length = 0; sim.ouvintes.clear(); sim.texs.clear(); });
afterEach(cleanup);

describe("useTexturasPorUrl: trocar a foto de uma zona não faz piscar as outras", () => {
  it("devolve as fotos que já chegaram", () => {
    const { result } = montar(["a", "b"]);
    expect(result.current.size).toBe(0);
    resolver("a"); resolver("b");
    expect([...result.current.keys()].sort()).toEqual(["a", "b"]);
  });
  it("ao trocar b por c, pede c ANTES de largar b, e a foto de a nunca desaparece nem muda de objecto", () => {
    const { rerender, result, historico } = montar(["a", "b"]);
    resolver("a"); resolver("b");
    const antes = result.current.get("a");
    const desde = historico.length;
    sim.eventos.length = 0;
    rerender({ urls: ["a", "c"] });
    expect(sim.eventos).toEqual(["pedir:c", "largar:b"]);
    for (const m of historico.slice(desde - 1)) expect(m.get("a"), "a foto de `a` não pode sair do mapa").toBe(antes);
    expect(result.current.has("b")).toBe(false);
    resolver("c");
    expect([...result.current.keys()].sort()).toEqual(["a", "c"]);
    expect(result.current.get("a")).toBe(antes);
  });
  it("a mesma lista por outra ordem (ou com repetidos) não pede nem larga nada", () => {
    const { rerender } = montar(["a", "b"]);
    sim.eventos.length = 0;
    rerender({ urls: ["b", "a", "a"] });
    expect(sim.eventos).toEqual([]);
  });
  it("ao desmontar larga todas as fotos que ainda tinha", () => {
    const { unmount } = montar(["a", "b"]);
    resolver("a");
    sim.eventos.length = 0;
    unmount();
    expect(sim.eventos.sort()).toEqual(["largar:a", "largar:b"]);
  });
  it("uma foto que falha (null) fica de fora; sem URL, mapa vazio e nada pedido", () => {
    const { result, rerender } = montar(["a"]);
    act(() => { sim.ouvintes.get("a")?.(null); });
    expect(result.current.size).toBe(0);
    sim.eventos.length = 0;
    rerender({ urls: [] });
    expect(sim.eventos).toEqual(["largar:a"]);
    expect(result.current.size).toBe(0);
  });
});
