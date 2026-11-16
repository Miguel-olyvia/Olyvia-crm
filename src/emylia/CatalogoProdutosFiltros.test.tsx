// 16/11: a lista de PRODUTOS do Catálogo filtra por Categoria, Subcategoria e Marca (só de produtos), não pelo «Ofício» dos serviços.
// O modelo é o real: montarCatalogo com as tabelas (product_categories), onde a árvore dos produtos se junta à dos serviços pelo nome.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, porCatalogo } from "./v2/catalogoStore";
import { catalogo0, type Catalogo } from "./v2/catalogoModelo";
import { montarCatalogo, type LinhasCatalogo } from "./real/catalogoReal";
import { juntarTabelas, linhasDe } from "./real/lerCatalogo";
import { SEM_CATEGORIA_PRODUTO, categoriasDeProdutos, filtrarProdutosCatalogo, haProdutosSemCategoria, subcategoriasDeProdutos } from "./filtroProdutosCatalogo";

const ID = {
  of: "66666666-6666-4666-a666-666666666666", sub: "77777777-7777-4777-a777-777777777777", eletr: "66666666-6666-4666-a666-666666666667",
  pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSub: "aaaaaaaa-0000-4000-a000-000000000002", pcSub2: "aaaaaaaa-0000-4000-a000-000000000005",
  pcSan: "aaaaaaaa-0000-4000-a000-000000000003", pcLav: "aaaaaaaa-0000-4000-a000-000000000004", pcVazia: "aaaaaaaa-0000-4000-a000-000000000006", pcEsq: "aaaaaaaa-0000-4000-a000-000000000007", pcOff: "aaaaaaaa-0000-4000-a000-000000000008", pcSubOff: "aaaaaaaa-0000-4000-a000-000000000009",
  torneira: "88888888-8888-4888-a888-888888888801", misturadora: "88888888-8888-4888-a888-888888888802", lavatorio: "88888888-8888-4888-a888-888888888803", solto: "88888888-8888-4888-a888-888888888804", quadro: "88888888-8888-4888-a888-888888888805",
};
const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
function linhasBase(): LinhasCatalogo {
  return linhasDe({
    // os serviços têm dois ofícios (Canalização e Eletricidade): só o primeiro tem categoria de produto igual
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.sub, name: "Louças e torneiras", parent_id: ID.of, sort_order: 0 },
      { id: ID.eletr, name: "Eletricidade", parent_id: null, sort_order: 1 }],
    perfis: [], equipamentos: [], estrutura: [], precosServico: [], passos: [], usosEquip: [], fornecedores: [], tecnicos: [], servicos: [], usosCons: [],
    produtos: [prod(ID.torneira, "Torneira cozinha"), prod(ID.misturadora, "Misturadora banho"), prod(ID.lavatorio, "Lavatório suspenso"), prod(ID.solto, "Produto solto")],
    precosProduto: [],
  });
}
const RESPOSTA = {
  produtos: [
    { id: ID.torneira, brand_id: "b1", marca: "Grohe", uom_id: "u", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub },
    { id: ID.misturadora, brand_id: "b2", marca: "Roca", uom_id: "u", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub2 },
    { id: ID.lavatorio, brand_id: "b2", marca: "Roca", uom_id: "u", uom: "un", category_id: ID.pcSan, subcategory_id: ID.pcLav },
    { id: ID.solto, brand_id: null, marca: null, uom_id: "u", uom: "un", category_id: null, subcategory_id: null },
  ],
  categoriasProduto: [
    { id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.pcSub, name: "Louças e torneiras", parent_id: ID.pcOf, sort_order: 0 },
    { id: ID.pcSub2, name: "Misturadoras", parent_id: ID.pcOf, sort_order: 1 },
    { id: ID.pcEsq, name: "Esquentadores", parent_id: ID.pcOf, sort_order: 2 }, { id: ID.pcSubOff, name: "Boilers", parent_id: ID.pcOf, sort_order: 3, ativa: false },
    { id: ID.pcVazia, name: "Iluminação", parent_id: null, sort_order: 2, ativa: true }, { id: ID.pcOff, name: "Antiga", parent_id: null, sort_order: 5, ativa: false },
    { id: ID.pcSan, name: "Sanitários", parent_id: null, sort_order: 2 }, { id: ID.pcLav, name: "Lavatórios", parent_id: ID.pcSan, sort_order: 0 },
  ],
  marcas: ["Grohe", "Roca", "Sanindusa"], unidades: ["un"], exige: [],
};
const montar = (): Catalogo => montarCatalogo(juntarTabelas(linhasBase(), RESPOSTA), catalogo0(), {}).K;

afterEach(() => { cleanup(); reporCustos(); });

function paginaProdutos(K: Catalogo = montar()) {
  porCatalogo(K);
  const S = seed();
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
  return K;
}
const combo = (nome: string) => screen.getByRole("combobox", { name: nome }) as HTMLInputElement;
const opcoes = () => screen.queryAllByRole("option").map((o) => o.textContent);
const escolher = (campo: string, opcao: string | RegExp) => { fireEvent.click(combo(campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };
const linhas = () => within(screen.getByRole("tabpanel")).getAllByRole("listitem").map((li) => li.textContent ?? "");
const contagem = () => screen.getByText(/^\d+ produtos?$/).textContent;

describe("filtroProdutosCatalogo (sobre o modelo real)", () => {
  it("as categorias são todas as de produtos ativas (mesmo sem produtos), por sort_order e nome: nem o ofício Eletricidade, que só existe nos serviços, nem a desativada", () => {
    const K = montar();
    expect(K.arvore.some((x) => x.n === "Eletricidade")).toBe(true);
    expect(categoriasDeProdutos(K).map((x) => x.n)).toEqual(["Canalização", "Iluminação", "Sanitários"]);
  });
  it("as subcategorias são só as da categoria escolhida; sem categoria, nenhuma", () => {
    const K = montar();
    expect(subcategoriasDeProdutos(K, ID.of).map((x) => x.n)).toEqual(["Louças e torneiras", "Misturadoras", "Esquentadores"]);
    expect(subcategoriasDeProdutos(K, ID.pcSan).map((x) => x.n)).toEqual(["Lavatórios"]);
    expect(subcategoriasDeProdutos(K, "")).toEqual([]);
  });
  it("filtra pela categoria (inclui as subcategorias dela), pela subcategoria e pela marca, e combina-os", () => {
    const K = montar();
    const nomes = (f: Parameters<typeof filtrarProdutosCatalogo>[2]) => filtrarProdutosCatalogo(K, K.produtos, f).map((p) => p.n);
    expect(nomes({ cat: "", sub: "", marca: "" })).toHaveLength(4);
    expect(nomes({ cat: ID.of, sub: "", marca: "" })).toEqual(["Torneira cozinha", "Misturadora banho"]);
    expect(nomes({ cat: ID.of, sub: ID.pcSub2, marca: "" })).toEqual(["Misturadora banho"]);
    expect(nomes({ cat: "", sub: "", marca: "Roca" })).toEqual(["Misturadora banho", "Lavatório suspenso"]);
    expect(nomes({ cat: ID.of, sub: "", marca: "Roca" })).toEqual(["Misturadora banho"]);
  });
  it("a Mudelar tem 0 produtos: as categorias e subcategorias aparecem na mesma, vindas de product_categories (não dos produtos)", () => {
    const K = montarCatalogo(juntarTabelas({ ...linhasBase(), produtos: [] }, { ...RESPOSTA, produtos: [] }), catalogo0(), {}).K;
    expect(K.produtos).toHaveLength(0);
    expect(categoriasDeProdutos(K).map((x) => x.n)).toEqual(["Canalização", "Iluminação", "Sanitários"]);
    expect(subcategoriasDeProdutos(K, ID.of).map((x) => x.n)).toEqual(["Louças e torneiras", "Misturadoras", "Esquentadores"]);
    expect(subcategoriasDeProdutos(K, ID.pcSan).map((x) => x.n)).toEqual(["Lavatórios"]);
  });
  it("uma categoria desativada não aparece, a não ser que um produto ainda a tenha: aí mostra-se «X (desativada)» e filtra", () => {
    const R = { ...RESPOSTA, categoriasProduto: RESPOSTA.categoriasProduto.map((c) => (c.id === ID.pcSan || c.id === ID.pcSub2 ? { ...c, ativa: false } : c)) };
    const K = montarCatalogo(juntarTabelas(linhasBase(), R), catalogo0(), {}).K;
    const cats = categoriasDeProdutos(K);
    expect(cats.map((x) => x.n)).toEqual(["Canalização", "Iluminação", "Sanitários"]); // Sanitários: o Lavatório ainda a tem
    expect(cats.find((x) => x.n === "Sanitários")).toMatchObject({ inativa: true });
    expect(cats.find((x) => x.n === "Canalização")).not.toHaveProperty("inativa");
    expect(subcategoriasDeProdutos(K, ID.of).map((x) => x.n)).toEqual(["Louças e torneiras", "Misturadoras", "Esquentadores"]); // Misturadoras: tem a Misturadora
    expect(filtrarProdutosCatalogo(K, K.produtos, { cat: ID.pcSan, sub: "", marca: "" }).map((p) => p.n)).toEqual(["Lavatório suspenso"]);
  });
  it("sem categorias de produto (protótipo sem «real»), o filtro de categoria cai nos ofícios dos serviços como antes", () => {
    const K = catalogo0();
    const cats = categoriasDeProdutos(K);
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((x) => x.pai == null)).toBe(true);
  });
});

describe("CatalogoV1 · Produtos: Categoria, Subcategoria e Marca", () => {
  it("há três filtros de produtos e já não há o «Ofício»", () => {
    paginaProdutos();
    expect(combo("Categoria")).toHaveValue("Todas as categorias");
    expect(combo("Subcategoria")).toHaveValue("Todas as subcategorias");
    expect(combo("Marca")).toHaveValue("Todas as marcas");
    expect(screen.queryByRole("combobox", { name: "Ofício" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /ofício/i })).toBeNull();
  });
  it("a categoria lista só categorias de produtos, com «Todas as categorias» primeiro, e filtra", () => {
    paginaProdutos();
    fireEvent.click(combo("Categoria"));
    expect(opcoes()).toEqual(["Todas as categorias", "Canalização", "Iluminação", "Sanitários", "Sem categoria de produto"]);
    fireEvent.click(screen.getByRole("option", { name: "Canalização" }));
    expect(contagem()).toBe("2 produtos");
    expect(linhas().join("|")).toContain("Torneira cozinha");
    expect(linhas().join("|")).not.toContain("Lavatório suspenso");
  });
  it("a subcategoria está desativada, com a razão dita, até haver categoria; depois só mostra as da categoria", () => {
    paginaProdutos();
    expect(combo("Subcategoria")).toBeDisabled();
    expect(screen.getByText("Escolha primeiro a categoria.")).toBeInTheDocument();
    expect(combo("Subcategoria")).toHaveAccessibleDescription("Escolha primeiro a categoria.");
    escolher("Categoria", "Canalização");
    expect(combo("Subcategoria")).toBeEnabled();
    fireEvent.click(combo("Subcategoria"));
    expect(opcoes()).toEqual(["Todas as subcategorias", "Louças e torneiras", "Misturadoras", "Esquentadores"]);
    fireEvent.click(screen.getByRole("option", { name: "Misturadoras" }));
    expect(contagem()).toBe("1 produto");
    expect(linhas()[0]).toContain("Misturadora banho");
  });
  it("mudar ou limpar a categoria limpa a subcategoria", () => {
    paginaProdutos();
    escolher("Categoria", "Canalização");
    escolher("Subcategoria", "Misturadoras");
    expect(combo("Subcategoria")).toHaveValue("Misturadoras");
    escolher("Categoria", "Sanitários");
    expect(combo("Subcategoria")).toHaveValue("Todas as subcategorias");
    expect(contagem()).toBe("1 produto");
    escolher("Subcategoria", "Lavatórios");
    escolher("Categoria", "Todas as categorias");
    expect(combo("Subcategoria")).toHaveValue("Todas as subcategorias");
    expect(combo("Subcategoria")).toBeDisabled();
    expect(contagem()).toBe("4 produtos");
  });
  it("a marca filtra, combina com a categoria e com a pesquisa por texto", () => {
    paginaProdutos();
    fireEvent.click(combo("Marca"));
    expect(opcoes()).toEqual(["Todas as marcas", "Grohe", "Roca", "Sanindusa"]);
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(contagem()).toBe("2 produtos");
    escolher("Categoria", "Canalização");
    expect(contagem()).toBe("1 produto");
    escolher("Categoria", "Todas as categorias");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "lavat" } });
    expect(contagem()).toBe("1 produto");
    expect(linhas()[0]).toContain("Lavatório suspenso");
  });
  it("escrever no dropdown procura (sem acentos) e a lista aberta está no <body>, por cima da página", () => {
    paginaProdutos();
    fireEvent.change(combo("Categoria"), { target: { value: "sanit" } });
    expect(opcoes()).toEqual(["Sanitários"]);
    expect(screen.getByRole("listbox", { name: "Categoria" }).closest("[data-lista-flutuante]")!.parentElement).toBe(document.body);
  });
});

// 16/11 (revisão): H1, L2, M4, M5
const montarComQuadro = (): Catalogo => {
  const L = linhasBase();
  L.produtos.push({ ...prod(ID.quadro, "Quadro elétrico"), catalogo_categoria_id: ID.eletr }); // só o ofício dos serviços, sem category_id
  const R = { ...RESPOSTA, produtos: [...RESPOSTA.produtos, { id: ID.quadro, brand_id: null, marca: null, uom_id: "u", uom: "un", category_id: null, subcategory_id: null }] };
  return montarCatalogo(juntarTabelas(L, R), catalogo0(), {}).K;
};

describe("H1: «Sem categoria de produto»", () => {
  it("filtra exatamente os produtos sem categoria de produto: os sem nada e os que só têm o ofício dos serviços", () => {
    const K = montarComQuadro();
    expect(K.produtos.find((p) => p.id === ID.quadro)!.no).toBe(ID.eletr); // o modelo guarda o ofício dos serviços
    expect(haProdutosSemCategoria(K)).toBe(true);
    const nomes = filtrarProdutosCatalogo(K, K.produtos, { cat: SEM_CATEGORIA_PRODUTO, sub: "", marca: "" }).map((p) => p.n);
    expect(nomes.sort()).toEqual(["Produto solto", "Quadro elétrico"]);
    // as categorias de produto não o apanham: Eletricidade nem aparece como categoria
    expect(categoriasDeProdutos(K).map((x) => x.n)).not.toContain("Eletricidade");
  });
  it("só se oferece se existir algum produto assim", () => {
    const K = montar();
    const comTodos = { ...K, produtos: K.produtos.filter((p) => p.id !== ID.solto) };
    expect(haProdutosSemCategoria(comTodos)).toBe(false);
    expect(haProdutosSemCategoria({ ...K, produtos: [] })).toBe(false);
  });
  it("no ecrã é a última opção da Categoria, filtra, e a Subcategoria fica sem escolhas", () => {
    paginaProdutos(montarComQuadro());
    fireEvent.click(combo("Categoria"));
    expect(opcoes().slice(-2)).toEqual(["Sanitários", "Sem categoria de produto"]);
    fireEvent.click(screen.getByRole("option", { name: "Sem categoria de produto" }));
    expect(contagem()).toBe("2 produtos");
    expect(linhas().join("|")).toContain("Quadro elétrico");
    expect(linhas().join("|")).not.toContain("Torneira cozinha");
    expect(combo("Subcategoria")).toBeDisabled();
  });
});

describe("L2: ids repetidos em categoriasProduto", () => {
  it("duas categorias com o mesmo nome juntadas no mesmo nó aparecem uma vez (e as subcategorias também)", () => {
    const dup = "aaaaaaaa-0000-4000-a000-0000000000aa", dupSub = "aaaaaaaa-0000-4000-a000-0000000000ab";
    const R = { ...RESPOSTA, categoriasProduto: [...RESPOSTA.categoriasProduto,
      { id: dup, name: "CANALIZAÇÃO", parent_id: null, sort_order: 9 }, { id: dupSub, name: "louças e torneiras", parent_id: dup, sort_order: 9 }] };
    const K = montarCatalogo(juntarTabelas(linhasBase(), R), catalogo0(), {}).K;
    expect(K.categoriasProduto!.filter((c) => c.id === ID.of).length).toBeGreaterThan(1); // a repetição existe no modelo
    expect(categoriasDeProdutos(K).map((x) => x.n)).toEqual(["Canalização", "Iluminação", "Sanitários"]);
    expect(subcategoriasDeProdutos(K, ID.of).map((x) => x.n)).toEqual(["Louças e torneiras", "Misturadoras", "Esquentadores"]);
  });
});

describe("M5: a marca compara-se sem maiúsculas e sem espaços de fora, dos dois lados", () => {
  it("«Roca» apanha «ROCA » e « roca»", () => {
    const K = montar();
    const ps = [{ ...K.produtos[0], id: "m1", marca: "ROCA " }, { ...K.produtos[0], id: "m2", marca: " roca" }, { ...K.produtos[0], id: "m3", marca: "Grohe" }];
    expect(filtrarProdutosCatalogo(K, ps, { cat: "", sub: "", marca: "Roca" }).map((p) => p.id)).toEqual(["m1", "m2"]);
    expect(filtrarProdutosCatalogo(K, ps, { cat: "", sub: "", marca: "  rOCA" }).map((p) => p.id)).toEqual(["m1", "m2"]);
  });
  it("a lista de marcas do filtro não repete a mesma marca escrita de duas maneiras", () => {
    const K = montar();
    paginaProdutos({ ...K, marcas: ["Grohe", "Roca", "ROCA ", "roca"] });
    fireEvent.click(combo("Marca"));
    expect(opcoes()).toEqual(["Todas as marcas", "Grohe", "Roca"]);
  });
});

describe("M4: o filtro escolhido que deixa de existir repõe-se", () => {
  it("se a categoria escolhida desaparece da lista (releitura), o filtro volta a «Todas as categorias» e não mostra o UUID", () => {
    const K = paginaProdutos();
    escolher("Categoria", "Sanitários");
    expect(contagem()).toBe("1 produto");
    act(() => { mudarCatalogo((k) => { k.categoriasProduto = K.categoriasProduto!.filter((c) => c.id !== ID.pcSan && c.pai !== ID.pcSan); k.produtos = k.produtos.filter((p) => p.id !== ID.lavatorio); }); });
    expect(combo("Categoria")).toHaveValue("Todas as categorias");
    expect(combo("Categoria").value).not.toMatch(/[0-9a-f]{8}-/);
    expect(contagem()).toBe("3 produtos");
  });
  it("o mesmo para a subcategoria e para a marca", () => {
    const K = paginaProdutos();
    escolher("Categoria", "Canalização");
    escolher("Subcategoria", "Esquentadores");
    escolher("Marca", "Sanindusa");
    act(() => { mudarCatalogo((k) => { k.categoriasProduto = K.categoriasProduto!.filter((c) => c.id !== ID.pcEsq); k.marcas = k.marcas.filter((m) => m !== "Sanindusa"); }); });
    expect(combo("Categoria")).toHaveValue("Canalização");
    expect(combo("Subcategoria")).toHaveValue("Todas as subcategorias");
    expect(combo("Marca")).toHaveValue("Todas as marcas");
  });
});
