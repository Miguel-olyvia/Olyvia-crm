// Passo 1 do configurador: a pesquisa é no SERVIDOR (filtros em cascata, texto com debounce, páginas); os escolhidos são objetos Produto, com teto.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Produto } from "../v2/catalogoModelo";
import { PassoEscolherFamilia } from "./PassoEscolherFamilia";
import { MAX_SELECAO } from "./selecao";
import { K_LEVE, linha, paginaDe, produto } from "./fixturesFamilias";

const ORG = "11111111-1111-4111-a111-111111111111";
const lerPagina = vi.fn(), lerMarcas = vi.fn();
vi.mock("../real/produtosPaginados", async (orig) => ({
  ...(await orig<typeof import("../real/produtosPaginados")>()),
  lerProdutosPagina: (...a: unknown[]) => lerPagina(...a),
  lerMarcasDoFiltro: (...a: unknown[]) => lerMarcas(...a),
}));

const LINHAS = [linha("a", "Lava-loiça Velar 50", { pvp: 150 }), linha("b", "Lava-loiça Velar 60", { pvp: 180 }), linha("c", "Lava-loiça sem preço", { pvp: null, custo: null })];
beforeEach(() => {
  lerPagina.mockReset(); lerMarcas.mockReset();
  lerPagina.mockResolvedValue(paginaDe(LINHAS));
  lerMarcas.mockResolvedValue({ ok: true, v: { marcas: [{ id: null, nome: "Cunha", n: 2 }, { id: null, nome: "Roca", n: 1 }], semMarca: 0, total: 3 } });
});
afterEach(cleanup);

interface Opc { escolhidos?: Produto[]; ocupados?: Set<string> }
const montar = (o: Opc = {}) => {
  const fn = { onAlternar: vi.fn(), onRemover: vi.fn(), onSelecionarPagina: vi.fn(), onLimpar: vi.fn() };
  const r = render(<PassoEscolherFamilia org={ORG} K={K_LEVE} escolhidos={o.escolhidos ?? []} ocupados={o.ocupados ?? new Set()} {...fn} />);
  return { ...fn, ...r };
};
const combo = (nome: string) => screen.getByRole("combobox", { name: new RegExp(`^${nome}( |$)`) }) as HTMLButtonElement;
const escolher = (campo: string, opcao: string | RegExp) => { fireEvent.click(combo(campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };
const lista = () => screen.getByRole("list", { name: "Produtos do catálogo" });
const ultimoFiltro = () => lerPagina.mock.calls.at(-1)![1] as Record<string, unknown>;

describe("PassoEscolherFamilia: leitura no servidor", () => {
  it("lê a página 1 sem filtros e mostra os produtos com SKU, marca e preço; nunca lê o catálogo inteiro", async () => {
    montar();
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
    expect(lerPagina).toHaveBeenCalledWith(ORG, { q: "", categoria: "", subcategoria: "", modelo: "", marca: "", semCategoria: false }, 1);
    expect(within(lista()).getByText(/SKU-a/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Resultados" })).toHaveTextContent("3 de 3 produtos");
  });

  it("a pesquisa de texto só vai ao servidor depois do debounce, e uma só vez com o texto todo", async () => {
    montar();
    await waitFor(() => expect(lerPagina).toHaveBeenCalledTimes(1));
    const campo = screen.getByRole("searchbox", { name: "Procurar produto" });
    fireEvent.change(campo, { target: { value: "v" } });
    fireEvent.change(campo, { target: { value: "velar" } });
    expect(lerPagina).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(ultimoFiltro().q).toBe("velar"), { timeout: 3000 });
    expect(lerPagina.mock.calls.filter((c) => (c[1] as { q: string }).q === "v")).toHaveLength(0);
  });

  it("filtros em cascata: a Subcategoria só se abre depois da Categoria; os ids vão para a base (origem)", async () => {
    montar();
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(combo("Subcategoria")).toBeDisabled();
    expect(combo("Modelo")).toBeDisabled();
    escolher("Categoria", "Louças");
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c1", subcategoria: "" }));
    expect(combo("Subcategoria")).toBeEnabled();
    escolher("Subcategoria", "Lava-loiças");
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c1", subcategoria: "s1" }));
    escolher("Modelo", /Velar/);
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ subcategoria: "s1", modelo: "m1" }));
  });

  it("mudar a categoria limpa a subcategoria e o modelo", async () => {
    montar();
    await waitFor(() => expect(lista()).toBeInTheDocument());
    escolher("Categoria", "Louças"); escolher("Subcategoria", "Lava-loiças"); escolher("Modelo", /Velar/);
    await waitFor(() => expect(ultimoFiltro().modelo).toBe("m1"));
    escolher("Categoria", "Torneiras");
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c2", subcategoria: "", modelo: "" }));
  });

  it("a Marca oferece as marcas do conjunto (cat_ler_marcas_do_filtro, com contagem) e filtra no servidor", async () => {
    montar();
    await waitFor(() => expect(lerMarcas).toHaveBeenCalled());
    escolher("Marca", /Roca/);
    await waitFor(() => expect(ultimoFiltro().marca).toBe("Roca"));
    // as marcas pedem-se sem a marca escolhida
    expect(lerMarcas.mock.calls.at(-1)![1]).toMatchObject({ marca: "" });
  });

  it("paginação: «Página seguinte» pede a página 2, «Página anterior» está aria-disabled (e protegida) na primeira, e o foco vai ao título estático da lista", async () => {
    lerPagina.mockImplementation(async (_o: string, _f: unknown, p: number) => paginaDe([linha(`p${p}`, `Produto ${p}`)], { total: 120, pagina: p, paginas: 3 }));
    montar();
    await waitFor(() => expect(within(lista()).getByText("Produto 1")).toBeInTheDocument());
    expect(screen.getByRole("status", { name: "Resultados" })).toHaveTextContent("1 de 120 produtos");
    expect(screen.getByRole("status", { name: "Resultados" })).toHaveTextContent("Página 1 de 3");
    const nav = screen.getByRole("navigation", { name: "Paginação de produtos" });
    expect(within(nav).getByRole("button", { name: "Página anterior" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(nav).getByRole("button", { name: "Página anterior" }));
    expect(lerPagina).toHaveBeenCalledTimes(1);
    fireEvent.click(within(nav).getByRole("button", { name: "Página seguinte" }));
    await waitFor(() => expect(within(lista()).getByText("Produto 2")).toBeInTheDocument());
    expect(lerPagina).toHaveBeenLastCalledWith(ORG, expect.anything(), 2);
    expect(screen.getByRole("heading", { name: "Produtos do catálogo" })).toHaveFocus();
    expect(screen.getByRole("status", { name: "Resultados" })).not.toHaveFocus();
  });

  it("com uma só página o nav continua montado, com os dois botões aria-disabled", async () => {
    montar();
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
    const nav = screen.getByRole("navigation", { name: "Paginação de produtos" });
    expect(within(nav).getByRole("button", { name: "Página anterior" })).toHaveAttribute("aria-disabled", "true");
    expect(within(nav).getByRole("button", { name: "Página seguinte" })).toHaveAttribute("aria-disabled", "true");
  });


  it("um erro de leitura aparece como alerta, com «Tentar de novo»", async () => {
    lerPagina.mockResolvedValueOnce({ ok: false, erro: "Sem ligação." });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem ligação.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
  });

  it("sem resultados diz-o", async () => {
    lerPagina.mockResolvedValue(paginaDe([]));
    montar();
    expect(await screen.findByText("Nenhum produto com esse nome ou filtro.")).toBeInTheDocument();
  });
});

describe("PassoEscolherFamilia: a escolha", () => {
  it("marcar uma caixa entrega o OBJETO Produto (não o id)", async () => {
    const { onAlternar } = montar();
    await waitFor(() => expect(lista()).toBeInTheDocument());
    fireEvent.click(within(lista()).getByRole("checkbox", { name: /Lava-loiça Velar 60/ }));
    expect(onAlternar).toHaveBeenCalledTimes(1);
    expect(onAlternar.mock.calls[0][0]).toMatchObject({ id: "b", n: "Lava-loiça Velar 60", sku: "SKU-b", pvp: 180, no: "s1" });
  });

  it("os escolhidos aparecem marcados e na lista de escolhidos; «Remover … dos escolhidos» chama onRemover (não onAlternar)", async () => {
    const a = produto("a", "Lava-loiça Velar 50");
    const { onAlternar, onRemover } = montar({ escolhidos: [a, produto("z", "Outro produto de outra página")] });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(within(lista()).getByRole("checkbox", { name: /Velar 50/ })).toBeChecked();
    expect(within(lista()).getByRole("checkbox", { name: /Velar 60/ })).not.toBeChecked();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("2 escolhidos");
    fireEvent.click(screen.getByRole("button", { name: "Remover Outro produto de outra página dos escolhidos" }));
    expect(onRemover.mock.calls[0][0]).toMatchObject({ id: "z" });
    expect(onAlternar).not.toHaveBeenCalled();
  });


  it("«Selecionar os desta página» entrega os produtos da página (objetos)", async () => {
    const { onSelecionarPagina } = montar();
    await waitFor(() => expect(lista()).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Selecionar os desta página" }));
    expect(onSelecionarPagina.mock.calls[0][0].map((p: Produto) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("no teto, avisa e não deixa juntar; avisa quando a página não cabe toda", async () => {
    const cheia = Array.from({ length: MAX_SELECAO }, (_, i) => produto(`x${i}`, `X ${i}`));
    montar({ escolhidos: cheia });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(screen.getByText(/máximo de 60 produtos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar os desta página" })).toBeDisabled();
    expect(within(lista()).getByRole("checkbox", { name: /Velar 50/ })).toBeDisabled();
    cleanup();
    montar({ escolhidos: cheia.slice(0, MAX_SELECAO - 1) });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(screen.getByText(/Só cabem 1 dos 3 desta página/)).toBeInTheDocument();
  });

  it("um produto escolhido continua a poder sair no teto (a caixa não fica desativada)", async () => {
    const cheia = [produto("a", "Lava-loiça Velar 50"), ...Array.from({ length: MAX_SELECAO - 1 }, (_, i) => produto(`x${i}`, `X ${i}`))];
    montar({ escolhidos: cheia });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(within(lista()).getByRole("checkbox", { name: /Velar 50/ })).toBeEnabled();
  });

  it("«Só com preço» filtra no cliente o que está carregado, sem novo pedido; a legenda di-lo e o contador diz «neste carregamento», sem misturar com o total do servidor", async () => {
    montar();
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
    expect(screen.getByRole("status", { name: "Resultados" })).toHaveTextContent("3 de 3 produtos");
    const n = lerPagina.mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox", { name: /Só com preço/ }));
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista()).queryByText(/sem preço/)).toBeNull();
    expect(screen.getByText(/Só nos produtos carregados desta página/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Resultados" })).toHaveTextContent("2 de 3 neste carregamento");
    expect(screen.getByRole("status", { name: "Resultados" })).not.toHaveTextContent("produtos");
    expect(lerPagina).toHaveBeenCalledTimes(n);
  });


  it("produtos que já estão noutra família da sessão aparecem marcados como tal", async () => {
    montar({ ocupados: new Set(["b"]) });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    const itens = within(lista()).getAllByRole("listitem");
    expect(itens[1]).toHaveTextContent("já está noutra família");
    expect(itens[0]).not.toHaveTextContent("já está noutra família");
  });

  it("«Limpar seleção» só aparece com escolhidos e chama onLimpar", async () => {
    const a = montar();
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Limpar seleção" })).toBeNull();
    a.unmount();
    const { onLimpar } = montar({ escolhidos: [produto("a", "A")] });
    fireEvent.click(await screen.findByRole("button", { name: "Limpar seleção" }));
    expect(onLimpar).toHaveBeenCalled();
  });
});

describe("PassoEscolherFamilia: marca (R1), lista anterior (R5) e acessibilidade", () => {
  const marcasDe = (...nomes: string[]) => ({ ok: true, v: { marcas: nomes.map((nome) => ({ id: null, nome, n: 1 })), semMarca: 0, total: nomes.length } });

  it("com marca escolhida, mudar a categoria NÃO pede a lista com a marca antiga: espera as marcas do novo conjunto (a lista anterior fica, esbatida)", async () => {
    montar();
    await waitFor(() => expect(within(lista()).getAllByRole("listitem")).toHaveLength(3));
    escolher("Marca", /Roca/);
    await waitFor(() => expect(ultimoFiltro().marca).toBe("Roca"));
    const antes = lerPagina.mock.calls.length;
    let soltar: (v: unknown) => void = () => undefined;
    lerMarcas.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    escolher("Categoria", "Louças");
    await new Promise((r) => setTimeout(r, 60));
    expect(lerPagina.mock.calls.length).toBe(antes);
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
    expect(lista()).toHaveAttribute("aria-busy", "true");
    await act(async () => { soltar(marcasDe("Cunha")); });
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c1", marca: "" }));
    expect(lerPagina.mock.calls.slice(antes).filter((c) => (c[1] as { marca: string }).marca === "Roca")).toHaveLength(0);
    await waitFor(() => expect(combo("Marca")).toHaveTextContent("Todas as marcas"));
  });

  it("se a marca escolhida continua no novo conjunto, mantém-se e só então pede", async () => {
    montar();
    await waitFor(() => expect(lerMarcas).toHaveBeenCalled());
    escolher("Marca", /Roca/);
    await waitFor(() => expect(ultimoFiltro().marca).toBe("Roca"));
    lerMarcas.mockResolvedValueOnce(marcasDe("Roca", "Cunha"));
    escolher("Categoria", "Louças");
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c1", marca: "Roca" }));
  });

  it("uma resposta atrasada das marcas (de um conjunto antigo) não repõe estado", async () => {
    montar();
    await waitFor(() => expect(lerMarcas).toHaveBeenCalled());
    escolher("Marca", /Roca/);
    await waitFor(() => expect(ultimoFiltro().marca).toBe("Roca"));
    let soltarVelha: (v: unknown) => void = () => undefined;
    lerMarcas.mockImplementationOnce(() => new Promise((r) => { soltarVelha = r; }));
    escolher("Categoria", "Louças");
    lerMarcas.mockResolvedValueOnce(marcasDe("Roca"));
    escolher("Categoria", "Torneiras");
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categoria: "c2", marca: "Roca" }));
    await act(async () => { soltarVelha(marcasDe("Cunha")); });
    expect(combo("Marca")).toHaveTextContent("Roca");
    expect(ultimoFiltro()).toMatchObject({ categoria: "c2", marca: "Roca" });
  });

  it("enquanto lê outra página, a lista anterior fica visível, esbatida (aria-busy), em vez de esvaziar", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    lerPagina.mockResolvedValueOnce(paginaDe([linha("a", "Produto A")], { total: 100, paginas: 2 })).mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    montar();
    await waitFor(() => expect(within(lista()).getByText("Produto A")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Página seguinte" }));
    await waitFor(() => expect(lista()).toHaveAttribute("aria-busy", "true"));
    expect(within(lista()).getByText("Produto A")).toBeInTheDocument();
    await act(async () => { soltar(paginaDe([linha("b", "Produto B")], { total: 100, pagina: 2, paginas: 2 })); });
    await waitFor(() => expect(within(lista()).getByText("Produto B")).toBeInTheDocument());
    expect(lista()).toHaveAttribute("aria-busy", "false");
  });

  it("cada caixa tem o nome do produto e, à parte, o detalhe (SKU, marca, preço, «já está noutra família») como descrição", async () => {
    montar({ ocupados: new Set(["b"]) });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    const caixa = within(lista()).getByRole("checkbox", { name: "Lava-loiça Velar 60" });
    expect(caixa).toHaveAccessibleDescription(/SKU-b.*Cunha.*180,00 €.*já está noutra família/);
    expect(within(lista()).getByRole("checkbox", { name: "Lava-loiça Velar 50" })).not.toHaveAccessibleDescription(/já está noutra família/);
  });

  it("os contentores com rolagem são regiões com nome, alcançáveis pelo teclado (tabindex 0)", async () => {
    montar({ escolhidos: [produto("a", "Lava-loiça Velar 50")] });
    await waitFor(() => expect(lista()).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Produtos do catálogo" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("region", { name: "Escolhidos (1)" })).toHaveAttribute("tabindex", "0");
  });
});
