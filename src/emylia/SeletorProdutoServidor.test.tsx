// 17/11: a escolha de produtos por pesquisa no servidor (Catálogo leve: K.produtos já não tem os 29 785 produtos da Mudelar).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Produto } from "./v2/catalogoModelo";
import { SeletorProdutoServidor } from "./SeletorProdutoServidor";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { aoRegistarProduto } from "./real/catalogoLeve";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, nome, sku: `SKU-${nome}`, sku_gerado: false, marca: "Marca", categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null, modelo_id: null, modelo: null, modelo_numero: null,
  unidade: "un", custo: 10, pvp: 20, grossista: null, distribuidor: null, fornecedor: "Forn", ativo: true, imagem: null, atributos_resumo: null, ...extra,
});
const produto = (id: string, n: string): Produto => ({ id, n, custo: 10, un: "un", marca: "Marca", fornecedor: "Forn", data: "2026-11-01", no: null });

const pagina = vi.fn(), ficha = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./real/produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

beforeEach(() => {
  pagina.mockReset(); ficha.mockReset();
  pagina.mockImplementation(async (_org: string, f: { q: string }) => ({ ok: true, v: { total: 2, pagina: 1, limite: 50, paginas: 1,
    produtos: [linha("p-base", "Base de duche 90"), linha("p-wc", "Sanita suspensa")].filter((l) => !f.q || l.nome.toLowerCase().includes(f.q.toLowerCase())) } }));
  ficha.mockImplementation(async (_org: string, id: string) => ({ ok: true, v: produto(id, id === "p-base" ? "Base de duche 90" : "Sanita suspensa") }));
});
afterEach(() => { cleanup(); reporCatalogo(); });

const montar = (props: Partial<Parameters<typeof SeletorProdutoServidor>[0]> = {}) => {
  const aoEscolher = vi.fn();
  render(<SeletorProdutoServidor org={ORG} rotulo="Ligar um produto" gatilho={<span>Ligar</span>} aoEscolher={aoEscolher} {...props} />);
  return aoEscolher;
};

describe("SeletorProdutoServidor", () => {
  it("não chama a base com o painel fechado", () => {
    montar();
    expect(pagina).not.toHaveBeenCalled();
  });
  it("ao abrir, pesquisa no servidor (organização, texto vazio, página 1) e mostra os produtos", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    await screen.findByRole("option", { name: /Base de duche 90/ });
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "" }), 1);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });
  it("escrever pesquisa no servidor (com debounce) e a escolha entrega o produto CERTO, lido inteiro", async () => {
    const aoEscolher = montar();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    await screen.findAllByRole("option");
    const cx = screen.getByRole("combobox", { name: "Procurar: Ligar um produto" });
    fireEvent.change(cx, { target: { value: "sanita" } });
    fireEvent.change(cx, { target: { value: "sanita s" } });
    await waitFor(() => expect(pagina).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ q: "sanita s" }), 1));
    expect(pagina.mock.calls.filter((c) => c[1].q === "sanita")).toHaveLength(0); // o debounce engoliu a intermédia
    fireEvent.click(await screen.findByRole("option", { name: /Sanita suspensa/ }));
    await waitFor(() => expect(aoEscolher).toHaveBeenCalledTimes(1));
    expect(ficha).toHaveBeenCalledWith(ORG, "p-wc");
    expect(aoEscolher.mock.calls[0][0]).toMatchObject({ id: "p-wc", n: "Sanita suspensa" });
  });
  it("com `noCatalogo` o produto escolhido entra no Catálogo em memória, uma vez, e quem grava é avisado ANTES", async () => {
    const vistos: string[] = [];
    const sai = aoRegistarProduto((p) => vistos.push(`${p.id}:${lerCatalogo().produtos.some((x) => x.id === p.id) ? "já-no-catalogo" : "ainda-fora"}`));
    const aoEscolher = montar({ noCatalogo: true });
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
      fireEvent.click(await screen.findByRole("option", { name: /Base de duche 90/ }));
      await waitFor(() => expect(aoEscolher).toHaveBeenCalledTimes(i + 1));
    }
    sai();
    expect(lerCatalogo().produtos.filter((p) => p.id === "p-base")).toHaveLength(1);
    expect(vistos).toEqual(["p-base:ainda-fora"]);
  });
  it("sem `noCatalogo` o produto NÃO entra no Catálogo (só se lê)", async () => {
    const aoEscolher = montar();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 90/ }));
    await waitFor(() => expect(aoEscolher).toHaveBeenCalled());
    expect(lerCatalogo().produtos.some((p) => p.id === "p-base")).toBe(false);
  });
  it("não oferece os produtos de `excluir` (já juntos)", async () => {
    montar({ excluir: (l) => l.nome.startsWith("Base") });
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    await screen.findByRole("option", { name: /Sanita suspensa/ });
    expect(screen.queryByRole("option", { name: /Base de duche/ })).toBeNull();
  });
  it("o filtro de categoria vai ao servidor", async () => {
    montar({ categoria: "cat-1", subcategoria: "sub-1" });
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    await screen.findAllByRole("option");
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ categoria: "cat-1", subcategoria: "sub-1" }), 1);
  });
  it("erro a ler o produto escolhido: avisa e não entrega nada", async () => {
    ficha.mockResolvedValue({ ok: false, erro: "Produto não encontrado." });
    const aoErro = vi.fn(), aoEscolher = montar({ aoErro });
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 90/ }));
    await waitFor(() => expect(aoErro).toHaveBeenCalledWith("Produto não encontrado."));
    expect(aoEscolher).not.toHaveBeenCalled();
  });
  it("erro da pesquisa: diz-se no painel em vez de mostrar «Nenhum resultado»", async () => {
    pagina.mockResolvedValue({ ok: false, erro: "statement timeout" });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    expect(await screen.findByText(/statement timeout/)).toBeInTheDocument();
  });
  it("toque duplo: lê o produto UMA vez e mostra «A ler o produto…» enquanto lê", async () => {
    let soltar!: (v: unknown) => void;
    ficha.mockImplementation(() => new Promise((r) => { soltar = r; }));
    const aoEscolher = montar();
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 90/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ligar um produto" }));
    fireEvent.click(await screen.findByRole("option", { name: /Base de duche 90/ }));
    expect(screen.getByRole("status")).toHaveTextContent("A ler o produto");
    expect(ficha).toHaveBeenCalledTimes(1);
    soltar({ ok: true, v: produto("p-base", "Base de duche 90") });
    await waitFor(() => expect(aoEscolher).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
