import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lerEstadoGlb, limparEstadoGlb, registarEstadoGlb, registarFalhaGlb, useEstadoGlb } from "./estadoGlbProprio";

const URL_A = "https://x.invalid/a.glb", URL_B = "https://x.invalid/b.glb";

describe("estadoGlbProprio: a nota do GLB fora do canvas", () => {
  it("quem lê vê o que o 3D registou, por URL, e sem GLB não vê nada", () => {
    const { result } = renderHook(() => useEstadoGlb(URL_A));
    expect(result.current).toBeNull();
    act(() => registarEstadoGlb(URL_A, { tipo: "falhou", texto: "Não abriu." }));
    expect(result.current).toEqual({ tipo: "falhou", texto: "Não abriu." });
    act(() => registarEstadoGlb(URL_B, { tipo: "ok" }));
    expect(result.current).toEqual({ tipo: "falhou", texto: "Não abriu." }); // o de outro URL não mexe
    act(() => limparEstadoGlb(URL_B));
    expect(renderHook(() => useEstadoGlb(null)).result.current).toBeNull();
  });

  it("um estado igual não acorda quem lê, e um novo substitui o anterior", () => {
    let desenhos = 0;
    const { result } = renderHook(() => { desenhos++; return useEstadoGlb(URL_A); });
    act(() => registarEstadoGlb(URL_A, { tipo: "aviso", texto: "Pesado." }));
    const depois = desenhos;
    act(() => registarEstadoGlb(URL_A, { tipo: "aviso", texto: "Pesado." }));
    expect(desenhos).toBe(depois);
    act(() => registarEstadoGlb(URL_A, { tipo: "ok" }));
    expect(result.current).toEqual({ tipo: "ok" });
  });

  it("uma falha do GLB regista a nota em português (rede, Draco, limite) e diz que se mostra o genérico", () => {
    const { result } = renderHook(() => useEstadoGlb(URL_A));
    act(() => registarFalhaGlb(URL_A, new TypeError("Failed to fetch")));
    expect(result.current).toMatchObject({ tipo: "falhou", texto: expect.stringMatching(/carregar.*genérico/) });
    act(() => registarFalhaGlb(URL_A, new Error("setDRACOLoader() must be called to load Draco compressed meshes")));
    expect(result.current).toMatchObject({ tipo: "falhou", texto: expect.stringMatching(/Draco/) });
  });

  it("ao sair, o leitor limpa o estado: uma falha antiga não aparece da próxima vez", () => {
    const { unmount } = renderHook(() => useEstadoGlb(URL_A));
    act(() => registarEstadoGlb(URL_A, { tipo: "falhou", texto: "Não abriu." }));
    expect(lerEstadoGlb(URL_A)).not.toBeNull();
    unmount();
    expect(lerEstadoGlb(URL_A)).toBeNull();
  });
});
