// 22/01: o orçamento mostra a foto de cada produto da visita. Com o Catálogo leve K.produtos não tem os produtos escolhidos de uma pesquisa (ao reabrir o negócio): a foto lê-se do
// servidor (cat_ler_produto), uma vez por produto (cache por organização e id), sem os meter no Catálogo.
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limparFotosDosProdutos, useFotosDosProdutos } from "./fotosDosProdutos";
import { ProdutosOrcamento } from "../ProdutosOrcamento";
import { seed, type Negocio } from "../motor";
import { mudarCatalogo, reporCatalogo, lerCatalogo } from "../v2/catalogoStore";
import { definirCatalogoLido } from "./catalogoLeve";
import type { Produto } from "../v2/catalogoModelo";
import type { Ctx } from "../pecas";

const ORG = "11111111-1111-4111-a111-111111111111";
const ficha = vi.fn();
vi.mock("./produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));
const lido = (id: string, fotos?: string[]): { ok: true; v: Produto } => ({ ok: true, v: { id, n: id, custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null, ...(fotos ? { fotos } : {}) } });

beforeEach(() => { ficha.mockReset(); limparFotosDosProdutos(); ficha.mockImplementation(async (_o: string, id: string) => lido(id, [`https://fotos.test/${id}.jpg`])); });
afterEach(() => { cleanup(); reporCatalogo(); definirCatalogoLido(ORG, false); });

describe("useFotosDosProdutos", () => {
  it("lê a foto de cada id e devolve-as por id", async () => {
    const { result } = renderHook(() => useFotosDosProdutos(ORG, ["a", "b"]));
    await waitFor(() => expect(result.current).toEqual({ a: ["https://fotos.test/a.jpg"], b: ["https://fotos.test/b.jpg"] }));
    expect(ficha).toHaveBeenCalledTimes(2);
  });
  it("cada produto lê-se uma só vez (cache), mesmo com outro hook ou outra renderização", async () => {
    const um = renderHook(() => useFotosDosProdutos(ORG, ["a"]));
    await waitFor(() => expect(Object.keys(um.result.current)).toEqual(["a"]));
    const dois = renderHook(() => useFotosDosProdutos(ORG, ["a"]));
    await waitFor(() => expect(Object.keys(dois.result.current)).toEqual(["a"]));
    expect(ficha).toHaveBeenCalledTimes(1);
  });
  it("sem organização ou sem ids não chama a base; um produto sem fotos, ou uma leitura que falha, ficam de fora sem rebentar", async () => {
    renderHook(() => useFotosDosProdutos(null, ["a"]));
    renderHook(() => useFotosDosProdutos(ORG, []));
    expect(ficha).not.toHaveBeenCalled();
    ficha.mockImplementation(async (_o: string, id: string) => (id === "x" ? lido("x") : { ok: false, erro: "sem permissão" }));
    const { result } = renderHook(() => useFotosDosProdutos(ORG, ["x", "y"]));
    await waitFor(() => expect(ficha).toHaveBeenCalledTimes(2));
    expect(result.current).toEqual({});
  });
});

describe("ProdutosOrcamento com o Catálogo leve", () => {
  const montar = () => {
    const S = seed();
    const d = structuredClone(S.deals.find((x) => x.linha === "wc")!) as Negocio;
    d.orc = { linhas: [], precosMan: {} } as unknown as Negocio["orc"];
    d.visita = { ...d.visita, prod: [{ id: "srv-p", n: "Sanita Roca Gap", un: "un", custo: 100, q: 1, no: null, pvp: 180 }] };
    return render(<ProdutosOrcamento S={S} A={{} as Ctx["A"]} run={(fn) => fn()} d={d} simples />);
  };
  it("mostra a foto do produto escolhido que não está no Catálogo em memória", async () => {
    mudarCatalogo((k) => { k.produtos = []; });
    definirCatalogoLido(ORG, true);
    const { container } = montar();
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "https://fotos.test/srv-p.jpg")); // decorativa (alt vazio): sem papel de imagem
    expect(ficha).toHaveBeenCalledWith(ORG, "srv-p");
  });
  it("um produto que já está no Catálogo em memória não se lê outra vez", () => {
    mudarCatalogo((k) => { k.produtos = [{ id: "srv-p", n: "Sanita Roca Gap", custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null, fotos: ["https://k.test/p.jpg"] }]; });
    definirCatalogoLido(ORG, true);
    montar();
    expect(ficha).not.toHaveBeenCalled();
    expect(lerCatalogo().produtos).toHaveLength(1);
  });
  it("sem o Catálogo leve (leitura inteira) não chama a base", () => {
    mudarCatalogo((k) => { k.produtos = []; });
    montar();
    expect(ficha).not.toHaveBeenCalled();
  });
});

describe("M7: limites", () => {
  it("no máximo 4 leituras ao mesmo tempo", async () => {
    let ativas = 0, maximo = 0;
    ficha.mockImplementation(async (_o: string, id: string) => { ativas++; maximo = Math.max(maximo, ativas); await new Promise((r) => setTimeout(r, 15)); ativas--; return lido(id, [`https://fotos.test/${id}.jpg`]); });
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const { result } = renderHook(() => useFotosDosProdutos(ORG, ids));
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(12), { timeout: 3000 });
    expect(maximo).toBeLessThanOrEqual(4);
    expect(ficha).toHaveBeenCalledTimes(12);
  });
  it("depois de uma recusa CT001 não volta a ler nessa organização", async () => {
    ficha.mockImplementation(async () => ({ ok: false, erro: "Sem permissão", codigo: "CT001" }));
    const { result } = renderHook(() => useFotosDosProdutos(ORG, Array.from({ length: 10 }, (_, i) => `q${i}`)));
    await waitFor(() => expect(ficha).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(ficha.mock.calls.length).toBeLessThanOrEqual(4); // só as que já estavam em curso
    const antes = ficha.mock.calls.length;
    renderHook(() => useFotosDosProdutos(ORG, ["novo"]));
    await new Promise((r) => setTimeout(r, 50));
    expect(ficha.mock.calls.length).toBe(antes);
    expect(result.current).toEqual({});
  });
});
