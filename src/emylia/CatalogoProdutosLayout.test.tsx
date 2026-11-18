// 16/11: o separador Produtos usa a mesma grelha dos Serviços (navegação · lista centrada · painel), para a lista ficar na mesma posição.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { porCatalogo } from "./v2/catalogoStore";
import { catalogo0, type Catalogo } from "./v2/catalogoModelo";
import { montarCatalogo, type LinhasCatalogo } from "./real/catalogoReal";
import { juntarTabelas, linhasDe } from "./real/lerCatalogo";

const ID = {
  of: "66666666-6666-4666-a666-666666666666", pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSan: "aaaaaaaa-0000-4000-a000-000000000003",
  pcSub: "aaaaaaaa-0000-4000-a000-000000000002", pcLav: "aaaaaaaa-0000-4000-a000-000000000004",
  a: "88888888-8888-4888-a888-888888888801", b: "88888888-8888-4888-a888-888888888802", c: "88888888-8888-4888-a888-888888888803", d: "88888888-8888-4888-a888-888888888804",
};
const prod = (id: string, name: string, sku: string | null) => ({ id, name, sku, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
function linhas0(): LinhasCatalogo {
  return linhasDe({
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }],
    perfis: [], equipamentos: [], estrutura: [], precosServico: [], passos: [], usosEquip: [], fornecedores: [], tecnicos: [], servicos: [], usosCons: [],
    produtos: [prod(ID.a, "Torneira cozinha", "BC-TO-0001"), prod(ID.b, "Misturadora banho", "CAT-0A1B2C3D4E"), prod(ID.c, "Lavatório suspenso", null), prod(ID.d, "Produto solto", "BC-XX-0002")],
    precosProduto: [],
  });
}
const RESPOSTA = {
  produtos: [
    { id: ID.a, brand_id: "b1", marca: "Grohe", uom_id: "u", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub },
    { id: ID.b, brand_id: "b2", marca: "Roca", uom_id: "u", uom: "un", category_id: ID.pcOf, subcategory_id: null },
    { id: ID.c, brand_id: "b2", marca: "Roca", uom_id: "u", uom: "un", category_id: ID.pcSan, subcategory_id: ID.pcLav },
    { id: ID.d, brand_id: null, marca: null, uom_id: "u", uom: "un", category_id: null, subcategory_id: null },
  ],
  categoriasProduto: [
    { id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.pcSub, name: "Torneiras", parent_id: ID.pcOf, sort_order: 0 },
    { id: ID.pcSan, name: "Sanitários", parent_id: null, sort_order: 1 }, { id: ID.pcLav, name: "Lavatórios", parent_id: ID.pcSan, sort_order: 0 },
  ],
  marcas: ["Grohe", "Roca"], unidades: ["un"], exige: [],
};
const montar = (): Catalogo => montarCatalogo(juntarTabelas(linhas0(), RESPOSTA), catalogo0(), {}).K;

afterEach(() => { cleanup(); reporCustos(); });

function pagina() {
  porCatalogo(montar());
  const S = seed();
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
}
const separador = (nome: string) => fireEvent.click(screen.getByRole("tab", { name: nome }));
const grelha = () => screen.getByRole("tabpanel").querySelector<HTMLElement>(":scope > div")!;
const combo = (nome: string) => screen.getByRole("combobox", { name: new RegExp(`^${nome}( |$)`) }) as HTMLButtonElement;
const contagem = () => screen.getByText(/^\d+ produtos?$/).textContent;
const nav = () => screen.getByRole("navigation", { name: "Categorias de produto" });
const painel = () => screen.getByRole("region", { name: "Resumo do Catálogo" });

describe("Produtos: a grelha dos Serviços", () => {
  it("a grelha e a coluna da lista têm as mesmas classes que nos Serviços, e o painel já não encolhe para max-w-3xl", () => {
    pagina();
    separador("Serviços");
    const dosServicos = grelha().className;
    expect(dosServicos).toContain("xl:grid-cols-[13rem_minmax(0,1fr)_20rem]");
    const colunaServicos = screen.getByRole("searchbox", { name: "Procurar serviço" }).closest<HTMLElement>("div.min-w-0")!.className;
    separador("Produtos");
    expect(grelha().className).toBe(dosServicos);
    expect(screen.getByRole("tabpanel").className).not.toContain("max-w-3xl");
    const coluna = screen.getByRole("searchbox", { name: "Procurar produto" }).closest<HTMLElement>("div.min-w-0")!;
    expect(coluna.className).toBe(colunaServicos);
    expect(coluna.className).toContain("xl:col-start-2 xl:row-start-1");
    expect(coluna.parentElement).toBe(grelha());
  });
  it("a lista, a navegação e o painel são colunas da grelha", () => {
    pagina();
    separador("Produtos");
    expect(nav().parentElement!.className).toContain("xl:col-start-1");
    expect(painel().closest("div.xl\\:col-start-3")!.parentElement).toBe(grelha());
  });
});

describe("Produtos: navegação por categorias", () => {
  it("mostra «Todas» e cada categoria de produto com o nº de produtos", () => {
    pagina();
    separador("Produtos");
    const b = (n: string) => within(nav()).getByRole("button", { name: n });
    // o nome acessível inclui a contagem
    expect(b("Mostrar todas as categorias, 4 produtos")).toHaveTextContent("Todas");
    expect(b("Mostrar só Canalização, 2 produtos")).toHaveTextContent("2");
    expect(b("Mostrar só Sanitários, 1 produto")).toHaveTextContent("1");
    expect(b("Mostrar só Sem categoria de produto, 1 produto")).toHaveTextContent("1");
    expect(b("Mostrar todas as categorias, 4 produtos")).toHaveAttribute("aria-pressed", "true");
  });
  it("clicar na categoria muda o filtro Categoria, e escolher no filtro muda a navegação", () => {
    pagina();
    separador("Produtos");
    fireEvent.click(within(nav()).getByRole("button", { name: "Mostrar só Canalização, 2 produtos" }));
    expect(combo("Categoria").textContent).toBe("Canalização");
    expect(contagem()).toBe("2 produtos");
    expect(within(nav()).getByRole("button", { name: "Mostrar só Canalização, 2 produtos" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(combo("Categoria"));
    fireEvent.click(screen.getByRole("option", { name: "Sanitários" }));
    expect(within(nav()).getByRole("button", { name: "Mostrar só Sanitários, 1 produto" })).toHaveAttribute("aria-pressed", "true");
    expect(within(nav()).getByRole("button", { name: "Mostrar só Canalização, 2 produtos" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(nav()).getByRole("button", { name: "Mostrar todas as categorias, 4 produtos" }));
    expect(combo("Categoria").textContent).toBe("Todas as categorias");
    expect(contagem()).toBe("4 produtos");
  });
});

describe("Produtos: painel de resumo", () => {
  it("diz o total, os sem referência gerada (em falta ou CAT-… provisória), os sem categoria e os sem marca", () => {
    pagina();
    separador("Produtos");
    const linha = (n: RegExp) => within(painel()).getByText(n).closest("li")!;
    expect(linha(/^Total de produtos$/)).toHaveTextContent("4");
    expect(linha(/^Sem referência gerada$/)).toHaveTextContent("2");
    expect(linha(/^Sem categoria de produto$/)).toHaveTextContent("1");
    expect(linha(/^Sem marca$/)).toHaveTextContent("1");
  });
  it("«Sem categoria de produto» aplica o filtro; as outras linhas são só informação", () => {
    pagina();
    separador("Produtos");
    expect(within(painel()).queryByRole("button", { name: /Sem marca|Sem referência|Total/ })).toBeNull();
    fireEvent.click(within(painel()).getByRole("button", { name: /Sem categoria de produto/ }));
    expect(combo("Categoria").textContent).toBe("Sem categoria de produto");
    expect(contagem()).toBe("1 produto");
  });
  it("o clique limpa também a pesquisa e a marca: a lista fica com os N que o painel mostra", () => {
    pagina();
    separador("Produtos");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "lavat" } });
    fireEvent.click(combo("Marca"));
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(contagem()).toBe("1 produto");
    fireEvent.click(within(painel()).getByRole("button", { name: /Sem categoria de produto/ }));
    expect(screen.getByRole("searchbox", { name: "Procurar produto" })).toHaveValue("");
    expect(combo("Marca").textContent).toBe("Todas as marcas");
    expect(combo("Categoria").textContent).toBe("Sem categoria de produto");
    expect(contagem()).toBe("1 produto");
    expect(within(screen.getByRole("tabpanel")).getByText("Produto solto")).toBeInTheDocument();
  });
  it("o botão do painel tem a altura mínima de um alvo de toque", () => {
    pagina();
    separador("Produtos");
    expect(within(painel()).getByRole("button", { name: /Sem categoria de produto/ }).className).toContain("min-h-11");
  });
});
