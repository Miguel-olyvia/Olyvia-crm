// A leitura dos atributos de cada produto escolhido: cache por id, no máximo 4 em simultâneo, estado de carregamento e de erro por produto, «tentar de novo».
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { criarCacheAtributos, useAtributosEscolhidos } from "./usarAtributosEscolhidos";
import { attrs } from "./fixturesFamilias";

const ORG = "11111111-1111-4111-a111-111111111111";
const ler = vi.fn();
vi.mock("../real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("../real/produtosPaginados")>()), lerAtributosProduto: (...a: unknown[]) => ler(...a) }));

interface Pendente { id: string; ok: (v: AtributoProduto[]) => void; falha: (e: string) => void }
let pendentes: Pendente[] = [];
// a cache tem de ser a mesma em todos os renders do hook: cria-se aqui, não dentro do callback do renderHook
let cacheTeste = criarCacheAtributos();
beforeEach(() => {
  ler.mockReset(); pendentes = []; cacheTeste = criarCacheAtributos();
  ler.mockImplementation((_org: string, id: string) => new Promise((res) => { pendentes.push({ id, ok: (v) => res({ ok: true, v }), falha: (e) => res({ ok: false, erro: e }) }); }));
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const estadoDe = (r: { current: ReturnType<typeof useAtributosEscolhidos> }, id: string) => r.current.estados.get(id)?.k;

describe("useAtributosEscolhidos", () => {
  it("com 10 produtos lê só 4 de cada vez; ao acabar um, começa o seguinte", async () => {
    const cache = criarCacheAtributos();
    const { result } = renderHook(() => useAtributosEscolhidos(ORG, ids(10), true, cache));
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(4));
    expect(estadoDe(result, "p1")).toBe("a-ler");
    expect(estadoDe(result, "p10")).toBe("a-ler");
    await act(async () => { pendentes[0].ok(attrs(50, "o-branco")); });
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(5));
    expect(estadoDe(result, "p1")).toBe("ok");
    expect(result.current.estados.get("p1")).toMatchObject({ k: "ok", attrs: attrs(50, "o-branco") });
  });

  it("nunca há mais de 4 pedidos em voo, do princípio ao fim", async () => {
    let emVoo = 0, maximo = 0;
    ler.mockImplementation(async () => { emVoo++; maximo = Math.max(maximo, emVoo); await new Promise((r) => setTimeout(r, 5)); emVoo--; return { ok: true, v: [] }; });
    const { result } = renderHook(() => useAtributosEscolhidos(ORG, ids(12), true, cacheTeste));
    await waitFor(() => expect(ids(12).every((i) => estadoDe(result, i) === "ok")).toBe(true));
    expect(maximo).toBe(4);
    expect(ler).toHaveBeenCalledTimes(12);
  });

  it("não lê nada enquanto não está ativo, nem sem organização", async () => {
    renderHook(() => useAtributosEscolhidos(ORG, ids(3), false, cacheTeste));
    renderHook(() => useAtributosEscolhidos(null, ids(3), true, cacheTeste));
    await new Promise((r) => setTimeout(r, 30));
    expect(ler).not.toHaveBeenCalled();
  });

  it("a cache evita reler: um produto já lido não volta a ser pedido (nem ao voltar ao passo)", async () => {
    const cache = criarCacheAtributos();
    ler.mockImplementation(async () => ({ ok: true, v: attrs(50, "o-branco") }));
    const a = renderHook(() => useAtributosEscolhidos(ORG, ["p1", "p2"], true, cache));
    await waitFor(() => expect(estadoDe(a.result, "p2")).toBe("ok"));
    a.unmount();
    const b = renderHook(() => useAtributosEscolhidos(ORG, ["p1", "p2", "p3"], true, cache));
    await waitFor(() => expect(estadoDe(b.result, "p3")).toBe("ok"));
    expect(estadoDe(b.result, "p1")).toBe("ok");
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it("a cache distingue organizações (o mesmo id noutra organização lê-se de novo)", async () => {
    const cache = criarCacheAtributos();
    ler.mockImplementation(async () => ({ ok: true, v: [] }));
    const a = renderHook(() => useAtributosEscolhidos(ORG, ["p1"], true, cache));
    await waitFor(() => expect(estadoDe(a.result, "p1")).toBe("ok"));
    const b = renderHook(() => useAtributosEscolhidos("22222222-2222-4222-a222-222222222222", ["p1"], true, cache));
    await waitFor(() => expect(estadoDe(b.result, "p1")).toBe("ok"));
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("um erro fica só nesse produto, com a mensagem; os outros continuam", async () => {
    const { result } = renderHook(() => useAtributosEscolhidos(ORG, ids(3), true, cacheTeste));
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(3));
    await act(async () => { pendentes[1].falha("Sem permissão."); pendentes[0].ok([]); pendentes[2].ok([]); });
    expect(result.current.estados.get("p2")).toEqual({ k: "erro", erro: "Sem permissão." });
    expect(estadoDe(result, "p1")).toBe("ok");
    expect(estadoDe(result, "p3")).toBe("ok");
  });

  it("uma exceção (rede) também fica como erro desse produto", async () => {
    ler.mockRejectedValueOnce(new Error("rede em baixo"));
    const { result } = renderHook(() => useAtributosEscolhidos(ORG, ["p1"], true, cacheTeste));
    await waitFor(() => expect(result.current.estados.get("p1")).toEqual({ k: "erro", erro: "rede em baixo" }));
  });

  it("«tentar» repete só esse produto e um erro não volta a ser pedido sozinho", async () => {
    ler.mockReset();
    ler.mockResolvedValueOnce({ ok: false, erro: "falhou" }).mockResolvedValueOnce({ ok: true, v: attrs(60, "o-preto") });
    const { result, rerender } = renderHook(() => useAtributosEscolhidos(ORG, ["p1"], true, cacheTeste));
    await waitFor(() => expect(estadoDe(result, "p1")).toBe("erro"));
    rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(ler).toHaveBeenCalledTimes(1);
    act(() => result.current.tentar("p1"));
    await waitFor(() => expect(estadoDe(result, "p1")).toBe("ok"));
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("uma resposta que chega depois de desmontar não faz nada, mas fica na cache (não se lê outra vez)", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useAtributosEscolhidos(ORG, ["p1"], true, cacheTeste));
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { pendentes[0].ok(attrs(50, "o-branco")); });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
    const b = renderHook(() => useAtributosEscolhidos(ORG, ["p1"], true, cacheTeste));
    expect(b.result.current.estados.get("p1")?.k).toBe("ok");
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("um produto tirado da escolha enquanto espera na fila não chega a ser lido", async () => {
    const cache = criarCacheAtributos();
    const { rerender } = renderHook(({ lista }) => useAtributosEscolhidos(ORG, lista, true, cache), { initialProps: { lista: ids(6) } });
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(4));
    rerender({ lista: ["p1", "p2", "p3", "p4", "p6"] });
    await act(async () => { pendentes.slice(0, 4).forEach((p) => p.ok([])); });
    await waitFor(() => expect(ler).toHaveBeenCalledTimes(5));
    expect(ler.mock.calls.map((c) => c[1])).not.toContain("p5");
    expect(ler.mock.calls.map((c) => c[1])).toContain("p6");
  });
});
