// 22/01: o Estúdio com o Catálogo leve. K.produtos só tem os 145 produtos dos consumos; o par de cada peça (sanita, base de duche…) procura-se no servidor
// (cat_pesquisar_produtos, por texto) e o escolhido lê-se inteiro (cat_ler_produto) para entrar no Catálogo em memória.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { candidatosComErros, candidatosDoEstudio, limparCandidatosDoEstudio, trazerProdutosDoEstudio, useProdutosDoEstudio } from "./produtosDoEstudio";
import { reporCatalogo, lerCatalogo, mudarCatalogo } from "../v2/catalogoStore";
import type { LinhaLevada } from "../ligarEstudio";
import type { Produto } from "../v2/catalogoModelo";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, sku: null, sku_gerado: null, marca: "Roca", categoria_id: null, categoria: null, subcategoria_id: null,
  subcategoria: null, modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 50, pvp: 100, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null,
  atributos_resumo: null, servico_id: null, fator_servico: null, ...extra });
const L = (id: string, chave: string, tipo: "produto" | "servico" = "produto", cores?: string[]): LinhaLevada => ({ id, n: id, q: 1, un: "un", tipo, chave, ...(cores ? { cores } : {}) });

const pesquisa = vi.fn(), ficha = vi.fn();
vi.mock("./produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./produtosPaginados")>()), lerPesquisaProdutos: (...a: unknown[]) => pesquisa(...a) }));
vi.mock("./produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

const pag = (produtos: unknown[]) => ({ ok: true, v: { total: produtos.length, pagina: 1, limite: 50, paginas: 1, produtos } });
beforeEach(() => {
  pesquisa.mockReset(); ficha.mockReset(); limparCandidatosDoEstudio();
  mudarCatalogo((k) => { k.produtos = []; }); // o Catálogo leve: sem os produtos da lista, só os dos consumos (aqui nenhum)
  pesquisa.mockImplementation(async (_o: string, f: { q: string }) => pag(f.q === "sanita" ? [linha("s1", "Sanita Roca Gap", { servico_id: "svc-inst", fator_servico: 1 })] : f.q === "bide" ? [linha("b1", "Bidé Roca Gap")] : []));
  ficha.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: { id, n: id === "s1" ? "Sanita Roca Gap" : "Bidé Roca Gap", custo: 50, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null, ...(id === "s1" ? { servico: "svc-inst", fatorServico: 1 } : {}) } as Produto }));
});
afterEach(() => { reporCatalogo(); });

describe("candidatosDoEstudio", () => {
  it("pesquisa no servidor uma vez por tipo de peça (só os produtos, com a palavra do tipo) e devolve-os com o serviço que trazem", async () => {
    const r = await candidatosDoEstudio(ORG, [L("a", "sanita"), L("b", "sanita"), L("c", "bide"), L("d", "instalar:sanita", "servico"), L("e", "desconhecido")]);
    expect(pesquisa).toHaveBeenCalledTimes(2);
    expect(pesquisa).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "sanita" }), 1);
    expect(pesquisa).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "bide" }), 1);
    expect(r.map((p) => p.id).sort()).toEqual(["b1", "s1"]);
    expect(r.find((p) => p.id === "s1")).toMatchObject({ n: "Sanita Roca Gap", servico: "svc-inst", fatorServico: 1 });
  });
  it("não repete a pesquisa de um tipo já feito", async () => {
    await candidatosDoEstudio(ORG, [L("a", "sanita")]);
    await candidatosDoEstudio(ORG, [L("a", "sanita")]);
    expect(pesquisa).toHaveBeenCalledTimes(1);
  });
  it("uma pesquisa que falha não rebenta: esse tipo fica sem candidatos e volta a tentar-se", async () => {
    pesquisa.mockResolvedValueOnce({ ok: false, erro: "tempo" });
    expect(await candidatosDoEstudio(ORG, [L("a", "sanita")])).toEqual([]);
    expect((await candidatosDoEstudio(ORG, [L("a", "sanita")])).map((p) => p.id)).toEqual(["s1"]);
  });
  it("sem linhas de produto não chama a base", async () => {
    expect(await candidatosDoEstudio(ORG, [L("d", "instalar:sanita", "servico")])).toEqual([]);
    expect(pesquisa).not.toHaveBeenCalled();
  });
});

describe("falhas e cor (H2, M5)", () => {
  it("candidatosComErros diz qual tipo não se pôde pesquisar, em vez de o tratar como «sem par»", async () => {
    pesquisa.mockImplementation(async (_o: string, f: { q: string }) => (f.q === "bide" ? { ok: false, erro: "tempo" } : pag([linha("s1", "Sanita Roca Gap")])));
    const r = await candidatosComErros(ORG, [L("a", "sanita"), L("c", "bide")]);
    expect(r.produtos.map((p) => p.id)).toEqual(["s1"]);
    expect(r.erros).toEqual([expect.stringContaining("bide")]);
    expect(r.erros[0]).toContain("tempo");
  });
  it("trazerProdutosDoEstudio devolve esse erro (o Estúdio não leva um projeto a meio como se não houvesse par)", async () => {
    pesquisa.mockResolvedValue({ ok: false, erro: "tempo" });
    const r = await trazerProdutosDoEstudio(ORG, [L("a", "sanita")], {});
    expect(r.erros).toEqual([expect.stringMatching(/sanita.*pesquisar/)]);
  });
  it("com a cor pedida pesquisa também «tipo cor» (a melhor correspondência), além da pesquisa geral", async () => {
    await candidatosDoEstudio(ORG, [L("a", "sanita", "produto", ["preto"])]);
    expect(pesquisa).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "sanita preto" }), 1);
    expect(pesquisa).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "sanita" }), 1);
  });
});

describe("trazerProdutosDoEstudio", () => {
  it("lê inteiro o par escolhido de cada peça e mete-o no Catálogo em memória (a sanita e o bidé, não outros)", async () => {
    const r = await trazerProdutosDoEstudio(ORG, [L("a", "sanita"), L("c", "bide"), L("d", "instalar:sanita", "servico")], {});
    expect(r.erros).toEqual([]);
    expect(ficha).toHaveBeenCalledTimes(2);
    expect(lerCatalogo().produtos.map((p) => p.id).sort()).toEqual(["b1", "s1"]);
    expect(lerCatalogo().produtos.find((p) => p.id === "s1")?.servico).toBe("svc-inst");
  });
  it("um produto que já está no Catálogo em memória não se lê outra vez", async () => {
    await trazerProdutosDoEstudio(ORG, [L("a", "sanita")], {});
    ficha.mockClear();
    await trazerProdutosDoEstudio(ORG, [L("a", "sanita")], {});
    expect(ficha).not.toHaveBeenCalled();
  });
  it("a leitura do produto falha: diz-o e não rebenta", async () => {
    ficha.mockResolvedValueOnce({ ok: false, erro: "sem permissão" });
    const r = await trazerProdutosDoEstudio(ORG, [L("a", "sanita")], {});
    expect(r.erros).toEqual([expect.stringContaining("sem permissão")]);
    expect(lerCatalogo().produtos).toHaveLength(0);
  });
});

describe("useProdutosDoEstudio", () => {
  const base: Produto[] = [{ id: "k1", n: "Cola", custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null }];
  it("devolve o Catálogo em memória e, depois da pesquisa, os candidatos do servidor", async () => {
    const linhas = [L("a", "sanita")];
    const { result } = renderHook(() => useProdutosDoEstudio(ORG, linhas, base));
    await waitFor(() => expect(result.current.map((p) => p.id)).toEqual(["k1", "s1"]));
  });
  it("sem organização (protótipo, Catálogo inteiro) devolve a mesma lista, sem chamar a base", async () => {
    const { result } = renderHook(() => useProdutosDoEstudio(null, [L("a", "sanita")], base));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(base);
    expect(pesquisa).not.toHaveBeenCalled();
  });
});

describe("17/11: o produto exato escolhido no Estúdio", () => {
  it("lê-se pelo id (não pela pesquisa) e é esse que entra, mesmo fora dos primeiros resultados", async () => {
    const EXATO = "0b1c2d3e-0000-4000-8000-000000000009";
    ficha.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: { id, n: "SANITA FLY SUSPENSO", custo: 80, un: "un", marca: "", fornecedor: "", data: "", no: null } as Produto }));
    const r = await trazerProdutosDoEstudio(ORG, [{ ...L("prod-s", "sanita", "produto", ["branco"]), produtoId: EXATO, n: "SANITA FLY SUSPENSO" }], {});
    expect(r.erros).toEqual([]);
    expect(pesquisa).not.toHaveBeenCalled();
    expect(ficha).toHaveBeenCalledWith(ORG, EXATO);
    expect(lerCatalogo().produtos.map((p) => p.id)).toEqual([EXATO]);
  });
  it("se não se consegue ler, diz qual (não entra outro no lugar)", async () => {
    ficha.mockResolvedValue({ ok: false, erro: "inexistente" });
    const r = await trazerProdutosDoEstudio(ORG, [{ ...L("prod-s", "sanita"), produtoId: "0b1c2d3e-0000-4000-8000-0000000000aa", n: "Sanita X" }], {});
    expect(r.erros).toEqual(["Sanita X: não foi possível ler o produto escolhido"]);
    expect(lerCatalogo().produtos).toEqual([]);
  });
});
