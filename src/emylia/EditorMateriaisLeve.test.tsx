// 22/01: os materiais que o Gestor de obra junta a uma tarefa são os produtos e consumíveis do Catálogo (definirMateriaisReais). Com o Catálogo leve essa lista só tem os 145 produtos
// dos consumos; para juntar outro produto («Pladur 13 mm»), o campo de pesquisa procura-o no servidor (a partir de 2 letras), com o id (para a encomenda) e o custo.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorMateriais } from "./PlanoInterativo";
import { definirMateriaisReais } from "./tarefasValidador";
import { definirCatalogoLido } from "./real/catalogoLeve";

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string) => ({ id, nome, sku: null, sku_gerado: null, marca: null, categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "pl", custo: 7.5, pvp: 12, grossista: null, distribuidor: null, fornecedor: "Leroy", ativo: true, imagem: null, atributos_resumo: null });
const pagina = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));

beforeEach(() => {
  pagina.mockReset();
  pagina.mockResolvedValue({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha("srv-pladur", "Pladur 13 mm")] } });
  definirMateriaisReais([{ n: "Silicone", q: 1, un: "un", produto: "loc-sil", preco: 4 }]);
  definirCatalogoLido(ORG, true);
});
afterEach(() => { cleanup(); definirMateriaisReais(null); definirCatalogoLido(ORG, false); });

const abrir = () => { const mudar = vi.fn(); render(<EditorMateriais mats={[]} mudar={mudar} />); fireEvent.click(screen.getByRole("button", { name: /Juntar material/ })); return mudar; };

describe("«Juntar material» com o Catálogo leve", () => {
  it("escrever procura no servidor e o produto escolhido entra com o id, o custo e o fornecedor", async () => {
    const mudar = abrir();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pladur" } });
    await waitFor(() => expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "pladur" }), 1), { timeout: 3000 });
    fireEvent.click(await screen.findByRole("button", { name: /Pladur 13 mm/ }));
    expect(mudar).toHaveBeenCalledWith([{ n: "Pladur 13 mm", q: 1, un: "pl", produto: "srv-pladur", preco: 7.5, forn: "Leroy" }]);
  });
  it("sem texto (ou com uma só letra) não chama a base: valem os materiais já lidos", () => {
    abrir();
    expect(screen.getByRole("button", { name: /Silicone/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "p" } });
    expect(pagina).not.toHaveBeenCalled();
  });
  it("os materiais já lidos continuam a aparecer, sem repetir o que o servidor também traz", async () => {
    pagina.mockResolvedValue({ ok: true, v: { total: 2, pagina: 1, limite: 50, paginas: 1, produtos: [linha("loc-sil", "Silicone"), linha("srv-sil2", "Silicone sanitário")] } });
    abrir();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sili" } });
    await screen.findByRole("button", { name: /Silicone sanitário/ }, { timeout: 3000 });
    expect(screen.getAllByRole("button", { name: /^Silicone$|^\+?\s*Silicone$/ })).toHaveLength(1);
  });
  it("sem o Catálogo leve (leitura inteira) nunca chama a base", async () => {
    definirCatalogoLido(ORG, false);
    abrir();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pladur" } });
    await new Promise((r) => setTimeout(r, 450));
    expect(pagina).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Nada com esse nome.")).toBeInTheDocument());
  });
});

describe("LOW: estado e erro da pesquisa", () => {
  it("mostra «A procurar…» enquanto a pesquisa não chega, e o erro se falhar", async () => {
    let soltar!: (v: unknown) => void;
    pagina.mockImplementation(() => new Promise((r) => { soltar = r; }));
    abrir();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pladur" } });
    expect(await screen.findByText("A procurar…", undefined, { timeout: 3000 })).toBeInTheDocument();
    soltar({ ok: false, erro: "statement timeout" });
    expect(await screen.findByText(/Não foi possível procurar: statement timeout/)).toBeInTheDocument();
  });
});
