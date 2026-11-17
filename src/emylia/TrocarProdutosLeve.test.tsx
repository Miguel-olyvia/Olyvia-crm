// 22/01: «Trocar» um produto da proposta com o Catálogo LEVE (K.produtos sem a lista toda): as alternativas vêm da pesquisa no servidor, no mesmo ramo e com o mesmo serviço
// do produto que se troca; o escolhido lê-se inteiro (cat_ler_produto) antes de entrar na proposta.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed, type Negocio, type VersaoProposta } from "./motor";
import { ProdutosDaVersao } from "./TrocarProdutos";
import type { Ctx } from "./pecas";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { definirCatalogoLido } from "./real/catalogoLeve";
import type { Produto } from "./v2/catalogoModelo";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string) => ({ id, nome, sku: null, sku_gerado: null, marca: "Roca", categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 50, pvp: 100, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null,
  atributos_resumo: null, servico_id: "svc-inst", fator_servico: 1 });
const pagina = vi.fn(), ficha = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./real/produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

beforeEach(() => {
  pagina.mockReset(); ficha.mockReset();
  pagina.mockResolvedValue({ ok: true, v: { total: 2, pagina: 1, limite: 50, paginas: 1, produtos: [linha("alt-1", "Sanita alternativa A"), linha("alt-2", "Sanita alternativa B")] } });
  ficha.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: { id, n: id === "alt-1" ? "Sanita alternativa A" : "Sanita alternativa B", custo: 50, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null, servico: "svc-inst", fatorServico: 1 } as Produto }));
  mudarCatalogo((k) => { k.produtos = []; });
  definirCatalogoLido(ORG, true);
});
afterEach(() => { cleanup(); reporCatalogo(); definirCatalogoLido(ORG, false); });

function montar() {
  const S = seed();
  const d = structuredClone(S.deals.find((x) => x.linha === "wc")!) as Negocio;
  d.orc = { linhas: [], precosMan: {} } as unknown as Negocio["orc"];
  d.visita = { ...d.visita, prod: [{ id: "orig", n: "Sanita original", un: "un", custo: 10, q: 1, no: null, svc: "svc-inst", fator: 1 }] };
  const A = { trocarProduto: vi.fn(), produto: vi.fn(), produtoQtd: vi.fn(), tirarProduto: vi.fn(), parteModelo: vi.fn(), refazerOrcamento: vi.fn() };
  const ctx = { S, A, run: (fn: () => void) => fn(), go: vi.fn(), q: "" } as unknown as Ctx;
  render(<ProdutosDaVersao ctx={ctx} d={d} ant={{ n: 1, prod: [{ id: "orig", n: "Sanita original", un: "un", custo: 10, q: 1, no: null }] } as unknown as VersaoProposta} />);
  return { A, d };
}

describe("Trocar um produto com o Catálogo leve", () => {
  it("as alternativas vêm do servidor (o ramo inteiro) e o escolhido entra na troca depois de lido", async () => {
    const { A, d } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Trocar/ }));
    expect(await screen.findByText("Sanita alternativa A")).toBeInTheDocument();
    // M8: as alternativas são as do RAMO inteiro, como no modo completo: sem filtrar pelo serviço do produto original
    expect(pagina.mock.calls.every((c) => (c[1] as { servico?: string }).servico === undefined)).toBe(true);
    fireEvent.click(screen.getByText("Sanita alternativa B"));
    await waitFor(() => expect(A.trocarProduto).toHaveBeenCalledWith(d.id, "orig", expect.objectContaining({ id: "alt-2", n: "Sanita alternativa B" })));
    expect(ficha).toHaveBeenCalledWith(ORG, "alt-2");
  });
  it("escrever na pesquisa pesquisa no servidor", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Trocar/ }));
    await screen.findByText("Sanita alternativa A");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "grohe" } });
    await waitFor(() => expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "grohe" }), 1));
  });
  it("sem o Catálogo leve não chama a base: a lista é a do Catálogo em memória", async () => {
    definirCatalogoLido(ORG, false);
    mudarCatalogo((k) => { k.produtos = [{ id: "loc", n: "Produto local", custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null }]; });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Trocar/ }));
    expect(await screen.findByText("Produto local")).toBeInTheDocument();
    expect(pagina).not.toHaveBeenCalled();
  });
});

describe("M10 e LOW", () => {
  it("M10: se a janela fechou enquanto o produto se lia, a leitura não faz a troca", async () => {
    let soltar!: (v: unknown) => void;
    ficha.mockImplementation(() => new Promise((r) => { soltar = r; }));
    const { A } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Trocar/ }));
    fireEvent.click(await screen.findByText("Sanita alternativa A"));
    await waitFor(() => expect(ficha).toHaveBeenCalled());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Sanita alternativa A")).toBeNull());
    soltar({ ok: true, v: { id: "alt-1", n: "Sanita alternativa A", custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null } });
    await new Promise((r) => setTimeout(r, 50));
    expect(A.trocarProduto).not.toHaveBeenCalled();
  });
  it("LOW: «Mostrar mais» nunca mostra um número negativo", async () => {
    pagina.mockResolvedValue({ ok: true, v: { total: 100, pagina: 1, limite: 50, paginas: 2, produtos: [linha("alt-1", "Sanita alternativa A")] } });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Trocar/ }));
    await screen.findByText("Sanita alternativa A");
    const botao = await screen.findByRole("button", { name: /Mostrar mais/ });
    expect(botao.textContent).not.toMatch(/-|−/);
  });
});
