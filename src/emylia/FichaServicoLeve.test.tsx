// 17/11: a ficha do serviço com o Catálogo LEVE (K.produtos só tem os produtos dos consumos): «Ligar um produto» e «Juntar consumível» procuram no servidor
// (cat_ler_produtos_pagina) e o produto escolhido entra no estado do serviço com o mesmo formato de sempre.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos, lerCustos } from "./v2/custosStore";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { aoRegistarProduto, definirCatalogoLido } from "./real/catalogoLeve";
import type { Produto } from "./v2/catalogoModelo";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string) => ({ id, nome, sku: `S-${id}`, sku_gerado: false, marca: "Roca", categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 123.4, pvp: 200, grossista: null, distribuidor: null, fornecedor: "Roca PT", ativo: true, imagem: null, atributos_resumo: null });
const BASE: Produto = { id: "p-base", n: "Base de duche 120", custo: 123.4, un: "un", marca: "Roca", fornecedor: "Roca PT", data: "2026-11-01", no: null, sku: "S-p-base" };

const pagina = vi.fn(), ficha = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./real/produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

beforeEach(() => {
  pagina.mockReset(); ficha.mockReset();
  pagina.mockResolvedValue({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha("p-base", "Base de duche 120")] } });
  ficha.mockResolvedValue({ ok: true, v: BASE });
  definirCatalogoLido(ORG, true);
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); definirCatalogoLido(ORG, false); });

function abrirServico() {
  const S = seed();
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S as Estado} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^Canalização/ })[0]);
}

describe("a ficha do serviço com o Catálogo leve", () => {
  it("«Ligar um produto» procura no servidor e o produto escolhido passa a trazer o serviço", async () => {
    const registados: string[] = [];
    const sai = aoRegistarProduto((p) => registados.push(p.id));
    abrirServico();
    expect(lerCatalogo().produtos.some((p) => p.id === "p-base")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 120/ }));
    await waitFor(() => expect(lerCatalogo().produtos.find((p) => p.id === "p-base")?.servico).toBeTruthy());
    sai();
    const p = lerCatalogo().produtos.find((x) => x.id === "p-base")!;
    expect(p).toMatchObject({ id: "p-base", n: "Base de duche 120", custo: 123.4, fatorServico: 1 });
    expect(registados).toEqual(["p-base"]); // o autosave soube dele ANTES de entrar no Catálogo (senão gravava um duplicado)
    expect(pagina).toHaveBeenCalledWith(ORG, expect.anything(), 1);
    expect(ficha).toHaveBeenCalledWith(ORG, "p-base");
  });
  it("«Juntar consumível» procura no servidor e põe o produto na receita com o custo e o nome certos", async () => {
    abrirServico();
    const consumiveis = () => Object.values(lerCustos().receitas).flatMap((r) => r.cons);
    expect(consumiveis().some((c) => c.n === "Base de duche 120")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Juntar consumível" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 120/ }));
    await waitFor(() => expect(consumiveis().some((c) => c.n === "Base de duche 120")).toBe(true));
    const novo = consumiveis().find((c) => c.n === "Base de duche 120");
    expect(novo).toMatchObject({ n: "Base de duche 120", preco: 123.4, q: 1, un: "un", fornecedor: "Roca PT" });
    // um consumível de receita não entra em K.produtos (só se lê)
    expect(lerCatalogo().produtos.some((p) => p.id === "p-base")).toBe(false);
  });
  it("sem o Catálogo leve (leitura inteira, protótipo), nenhum dos dois seletores chama a base", async () => {
    definirCatalogoLido(ORG, false);
    abrirServico();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    await screen.findByRole("combobox", { name: "Procurar: Ligar um produto" });
    expect(pagina).not.toHaveBeenCalled();
  });
});
