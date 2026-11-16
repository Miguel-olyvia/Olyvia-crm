// 16/11: o separador Produtos do Catálogo REAL lê do servidor, 50 por página (cat_ler_produtos_pagina), com os filtros, as contagens da navegação e do
// resumo (cat_ler_produtos_contagens) e, na ficha, os atributos do produto (cat_ler_atributos_produto). Sem «real» (protótipo) fica em memória (CatalogoProdutosFiltros.test.tsx).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
    from: vi.fn(() => { const c: Record<string, unknown> = {}; for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c; c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok); return c; }),
  },
}));

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProdutoAberto } from "./FichaProdutoAberto";
import { reporCustos } from "./v2/custosStore";
import { porCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { catalogo0, type Catalogo } from "./v2/catalogoModelo";
import { montarCatalogo } from "./real/catalogoReal";
import { juntarAtributos, juntarModelos, juntarTabelas, linhasDe } from "./real/lerCatalogo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = {
  of: "66666666-6666-4666-a666-666666666666", sub: "77777777-7777-4777-a777-777777777777",
  pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSub: "aaaaaaaa-0000-4000-a000-000000000002", pcSan: "aaaaaaaa-0000-4000-a000-000000000003", pcLav: "aaaaaaaa-0000-4000-a000-000000000004",
  torneira: "88888888-8888-4888-a888-888888888801", lavatorio: "88888888-8888-4888-a888-888888888803", solto: "88888888-8888-4888-a888-888888888804",
  m1: "e0000000-0000-4000-a000-000000000001", aCor: "dddddddd-0000-4000-a000-000000000001", oPreto: "bbbbbbbb-0000-4000-a000-000000000001",
};
const prod = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
function montar(): Catalogo {
  let L = linhasDe({
    // o ofício «Canalização» dos serviços junta-se pelo nome à categoria de produto: o nó é o do ofício, o id na base é o de product_categories
    categorias: [{ id: ID.of, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.sub, name: "Louças e torneiras", parent_id: ID.of, sort_order: 0 }],
    produtos: [prod(ID.torneira, "Torneira cozinha"), prod(ID.lavatorio, "Lavatório suspenso"), prod(ID.solto, "Produto solto")],
  });
  L = juntarTabelas(L, {
    produtos: [{ id: ID.torneira, brand_id: "b1", marca: "Grohe", uom_id: "u", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub }, { id: ID.lavatorio, brand_id: "b2", marca: "Roca", uom_id: "u", uom: "un", category_id: ID.pcSan, subcategory_id: ID.pcLav },
      { id: ID.solto, brand_id: null, marca: null, uom_id: "u", uom: "un", category_id: null, subcategory_id: null }],
    categoriasProduto: [{ id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0 }, { id: ID.pcSub, name: "Louças e torneiras", parent_id: ID.pcOf, sort_order: 0 },
      { id: ID.pcSan, name: "Sanitários", parent_id: null, sort_order: 2 }, { id: ID.pcLav, name: "Lavatórios", parent_id: ID.pcSan, sort_order: 0 }],
    marcas: ["Grohe", "Roca"], unidades: ["un"], exige: [],
  });
  L = juntarAtributos(L, { atributos: [{ id: ID.aCor, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: false, ordem: 1, opcoes: [{ id: ID.oPreto, valor: "Preto", hex: null, ordem: 1 }] }], produtos: [] });
  L = juntarModelos(L, { modelos: [{ id: ID.m1, nome: "SORTY", numero: 1, ativo: true, subcategoria: { id: ID.pcSub } }] }, null);
  return montarCatalogo(L, catalogo0(), {}).K;
}

const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, sku: null, sku_gerado: null, marca: null, categoria_id: null, categoria: null, subcategoria_id: null,
  subcategoria: null, modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 60, pvp: 100, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null, ...extra });
const CONTAGENS = { total: 3, por_categoria: [{ id: ID.pcOf, n: 1 }, { id: ID.pcSan, n: 1 }], por_subcategoria: [{ id: ID.pcSub, n: 1 }], por_modelo: [{ id: ID.m1, n: 1 }], sem_referencia: 2, sem_categoria: 1, sem_marca: 1 };
/** Respostas por omissão: 3 páginas de 50 (120 produtos); cada página traz dois produtos com o número da página no nome. */
const padrao = (f: string, a: Record<string, unknown>): unknown => {
  if (f === "cat_ler_produtos_pagina") {
    const p = a.p_pagina as number;
    return { data: { total: 120, pagina: p, limite: 50, paginas: 3, produtos: p === 1
      ? [linha(ID.torneira, "Torneira cozinha", { marca: "Grohe", sku: "CB-0001-1", modelo_id: ID.m1, modelo: "SORTY", modelo_numero: 1, atributos_resumo: "Cor: Preto", pvp: 100 }), linha(ID.lavatorio, "Lavatório suspenso", { marca: "Roca", pvp: null, custo: 70 })]
      : [linha(`88888888-8888-4888-a888-8888888888${p}1`, `Produto da página ${p}`)] }, error: null };
  }
  if (f === "cat_ler_produtos_contagens") return { data: CONTAGENS, error: null };
  return { data: null, error: null };
};
const real = (extra: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: true, podeStock: true, recarregar: vi.fn(async () => {}), ...extra });
const doTipo = (f: string) => base.chamadas.filter((c) => c.f === f);
const paginas = () => doTipo("cat_ler_produtos_pagina");

/** `null` = o protótipo (sem «real»). */
async function pagina(r: FichaProdutoReal | null = real(), K: Catalogo = montar()) {
  porCatalogo(K);
  const S = seed();
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r ?? undefined} />);
  fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
  if (r) await screen.findByText(/Página 1 de 3/);
}
const painel = () => within(screen.getByRole("tabpanel"));
const combo = (nome: string) => screen.getByRole("combobox", { name: nome }) as HTMLInputElement;
const escolher = (campo: string, opcao: string | RegExp) => { fireEvent.click(combo(campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };
/** O pedido «principal» do último filtro: com o pré-carregamento o último pedido é uma página seguinte, por isso devolve-se o da página mais baixa do último grupo de filtros. */
const mesmoFiltro = (x: Record<string, unknown>, y: Record<string, unknown>) => Object.keys(x).every((k) => k === "p_pagina" || x[k] === y[k]);
const ultima = () => {
  const fim = paginas().at(-1)!.a;
  const grupo = paginas().filter((c) => mesmoFiltro(c.a, fim));
  return grupo.reduce((m, c) => ((c.a.p_pagina as number) <= (m.a.p_pagina as number) ? c : m)).a;
};
const pedidas = (extra: Record<string, unknown> = {}) => paginas().filter((c) => mesmoFiltro(c.a, { ...paginas()[0].a, ...extra })).map((c) => c.a.p_pagina as number);

beforeEach(() => { base.chamadas = []; base.responder = padrao; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("Produtos por páginas · a leitura", () => {
  it("ao abrir pede a página 1 de 50, sem filtros, com a organização (e pré-carrega a 2 e a 3); e as contagens", async () => {
    await pagina();
    await waitFor(() => expect(paginas()).toHaveLength(3));
    expect(paginas().map((c) => c.a.p_pagina)).toEqual([1, 2, 3]);
    expect(paginas()[0].a).toEqual({ p_org: ORG, p_q: null, p_categoria: null, p_subcategoria: null, p_modelo: null, p_marca: null, p_sem_categoria: false, p_limite: 50, p_pagina: 1 });
    expect(doTipo("cat_ler_produtos_contagens").length).toBeGreaterThan(0);
    expect(doTipo("cat_ler_produtos_contagens")[0].a).toEqual({ p_org: ORG, p_q: null, p_marca: null });
  });
  it("a linha mostra nome, marca, modelo, referência, atributos e preço (o PVP, ou custo + margem alvo sem PVP)", async () => {
    await pagina();
    const l = painel().getByRole("button", { name: "Torneira cozinha" }).closest("li")!;
    expect(l.textContent).toContain("Grohe · 0001 · SORTY · ref. CB-0001-1");
    expect(l.textContent).toContain("Cor: Preto");
    expect(l.textContent).toMatch(/100,00\s*€\/un/);
    const sem = painel().getByRole("button", { name: "Lavatório suspenso" }).closest("li")!;
    expect(sem.textContent).toMatch(/107,69\s*€\/un/); // 70 ÷ (1 − 0,35)
  });
  it("mostra «Página X de Y · N produtos» numa região que se anuncia", async () => {
    await pagina();
    const t = screen.getByText("Página 1 de 3 · 120 produtos");
    expect(t).toHaveAttribute("aria-live", "polite");
  });
  it("não lê os produtos do arranque para a lista: o que se vê é o que a página trouxe (e não os do K)", async () => {
    await pagina();
    expect(painel().queryByRole("button", { name: "Produto solto" })).not.toBeInTheDocument();
  });
});

describe("Produtos por páginas · Anterior e Seguinte", () => {
  it("na primeira página «Anterior» está desativado com a razão; «Seguinte» pede a página 2 e leva o foco ao topo da lista", async () => {
    await pagina();
    const ant = screen.getByRole("button", { name: "Anterior" });
    expect(ant).toBeDisabled();
    expect(ant).toHaveAccessibleDescription(/primeira página/i);
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 3/);
    expect(paginas().some((c) => c.a.p_pagina === 2 && c.a.p_limite === 50)).toBe(true);
    expect(painel().getByRole("button", { name: "Produto da página 2" })).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 3/)).toHaveFocus();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });
  it("na última página «Seguinte» está desativado com a razão; «Anterior» volta atrás", async () => {
    await pagina();
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 3/);
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 3 de 3/);
    const seg = screen.getByRole("button", { name: "Seguinte" });
    expect(seg).toBeDisabled();
    expect(seg).toHaveAccessibleDescription(/última página/i);
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByText(/Página 2 de 3/);
    expect(painel().getByRole("button", { name: "Produto da página 2" })).toBeInTheDocument();
  });
  it("os botões estão numa navegação com nome", async () => {
    await pagina();
    const nav = screen.getByRole("navigation", { name: "Páginas de produtos" });
    expect(within(nav).getByRole("button", { name: "Anterior" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Seguinte" })).toBeInTheDocument();
  });
  it("uma lista que cabe numa página não tem botões ativos e diz «Página 1 de 1»", async () => {
    base.responder = (f, a) => (f === "cat_ler_produtos_pagina" ? { data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha(ID.torneira, "Torneira cozinha")] }, error: null } : padrao(f, a));
    porCatalogo(montar());
    const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    await screen.findByText("Página 1 de 1 · 1 produto");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeDisabled();
  });
  it("sem produtos: diz que não há nenhum e não oferece páginas", async () => {
    base.responder = (f, a) => (f === "cat_ler_produtos_pagina" ? { data: { total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] }, error: null } : padrao(f, a));
    porCatalogo(montar());
    const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    await screen.findByText("0 produtos");
    expect(screen.getByText("Nenhum produto com esse nome ou filtro.")).toBeInTheDocument();
  });
});

describe("Produtos por páginas · os filtros mandam os argumentos certos e voltam à página 1", () => {
  it("categoria: o id em product_categories (não o do nó do ofício) e página 1, mesmo a partir da página 2", async () => {
    await pagina();
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 3/);
    escolher("Categoria", "Canalização");
    await waitFor(() => expect(ultima()).toMatchObject({ p_categoria: ID.pcOf, p_pagina: 1, p_subcategoria: null }));
  });
  it("subcategoria", async () => {
    await pagina();
    escolher("Categoria", "Canalização");
    await waitFor(() => expect(ultima()).toMatchObject({ p_categoria: ID.pcOf }));
    escolher("Subcategoria", "Louças e torneiras");
    await waitFor(() => expect(ultima()).toMatchObject({ p_categoria: ID.pcOf, p_subcategoria: ID.pcSub, p_pagina: 1 }));
  });
  it("modelo", async () => {
    await pagina();
    escolher("Categoria", "Canalização");
    escolher("Subcategoria", "Louças e torneiras");
    escolher("Modelo", /SORTY/);
    await waitFor(() => expect(ultima()).toMatchObject({ p_modelo: ID.m1, p_subcategoria: ID.pcSub }));
  });
  it("marca (e as contagens recebem a marca)", async () => {
    await pagina();
    escolher("Marca", "Roca");
    await waitFor(() => expect(ultima()).toMatchObject({ p_marca: "Roca", p_pagina: 1 }));
    await waitFor(() => expect(doTipo("cat_ler_produtos_contagens").at(-1)!.a).toMatchObject({ p_marca: "Roca" }));
  });
  it("«Sem categoria de produto»: p_sem_categoria e nenhuma categoria", async () => {
    await pagina();
    escolher("Categoria", "Sem categoria de produto");
    await waitFor(() => expect(ultima()).toMatchObject({ p_sem_categoria: true, p_categoria: null, p_subcategoria: null }));
  });
  it("mudar a categoria limpa a subcategoria e o modelo da chamada seguinte", async () => {
    await pagina();
    escolher("Categoria", "Canalização");
    escolher("Subcategoria", "Louças e torneiras");
    escolher("Modelo", /SORTY/);
    await waitFor(() => expect(ultima()).toMatchObject({ p_modelo: ID.m1 }));
    escolher("Categoria", "Sanitários");
    await waitFor(() => expect(ultima()).toMatchObject({ p_categoria: ID.pcSan, p_subcategoria: null, p_modelo: null }));
  });
});

describe("Produtos por páginas · a pesquisa tem debounce", () => {
  it("escrever depressa não pede nada a cada letra: uma só chamada, com o texto todo, passados ~300 ms", async () => {
    await pagina();
    const antes = paginas().length;
    const caixa = painel().getByRole("searchbox", { name: "Procurar produto" });
    for (const t of ["g", "gr", "gro"]) fireEvent.change(caixa, { target: { value: t } });
    await new Promise((r) => setTimeout(r, 120));
    expect(paginas()).toHaveLength(antes); // ainda a esperar
    await waitFor(() => expect(paginas().length).toBeGreaterThan(antes), { timeout: 2000 });
    await waitFor(() => expect(pedidas({ p_q: "gro" })).toEqual([1, 2, 3])); // uma só pesquisa: a página 1 e o pré-carregamento de 2 e 3
    expect(ultima()).toMatchObject({ p_q: "gro", p_pagina: 1 });
  });
  it("a pesquisa volta à página 1 e leva-a também às contagens", async () => {
    await pagina();
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 3/);
    fireEvent.change(painel().getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "roca" } });
    await waitFor(() => expect(ultima()).toMatchObject({ p_q: "roca", p_pagina: 1 }), { timeout: 2000 });
    await waitFor(() => expect(doTipo("cat_ler_produtos_contagens").at(-1)!.a).toMatchObject({ p_q: "roca" }));
  });
});

describe("Produtos por páginas · navegação por categorias e resumo vêm das contagens", () => {
  it("a navegação mostra o nº de cada categoria (por id de product_categories) e o total", async () => {
    await pagina();
    const nav = screen.getByRole("navigation", { name: "Categorias de produto", hidden: true });
    await waitFor(() => expect(within(nav).getByRole("button", { name: "Mostrar só Canalização, 1 produto", hidden: true })).toBeInTheDocument());
    expect(within(nav).getByRole("button", { name: "Mostrar todas as categorias, 3 produtos", hidden: true })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Mostrar só Sanitários, 1 produto", hidden: true })).toBeInTheDocument();
  });
  it("o resumo usa o total, sem referência, sem categoria e sem marca da base", async () => {
    await pagina();
    const r = screen.getByRole("region", { name: "Resumo do Catálogo", hidden: true });
    await waitFor(() => expect(within(r).getByText("Sem referência gerada", { exact: false }).closest("li")!.textContent).toContain("2"));
    expect(within(r).getByText("Total de produtos").closest("li")!.textContent).toContain("3");
    expect(within(r).getByText("Sem marca").closest("li")!.textContent).toContain("1");
  });
  it("a linha «Sem categoria de produto» do resumo filtra por ela, no servidor", async () => {
    await pagina();
    const r = screen.getByRole("region", { name: "Resumo do Catálogo", hidden: true });
    const b = await within(r).findByRole("button", { name: "Sem categoria de produto", hidden: true });
    fireEvent.click(b);
    await waitFor(() => expect(ultima()).toMatchObject({ p_sem_categoria: true, p_pagina: 1 }));
  });
  it("tocar numa categoria da navegação filtra no servidor", async () => {
    await pagina();
    const nav = screen.getByRole("navigation", { name: "Categorias de produto", hidden: true });
    fireEvent.click(await within(nav).findByRole("button", { name: "Mostrar só Sanitários, 1 produto", hidden: true }));
    await waitFor(() => expect(ultima()).toMatchObject({ p_categoria: ID.pcSan, p_pagina: 1 }));
  });
});

describe("Produtos por páginas · pré-carregamento e cache", () => {
  /** 6 páginas, para haver o que pré-carregar para lá da 3. */
  const seis = (f: string, a: Record<string, unknown>): unknown => {
    if (f !== "cat_ler_produtos_pagina") return padrao(f, a);
    const p = a.p_pagina as number;
    return { data: { total: 300, pagina: p, limite: 50, paginas: 6, produtos: [linha(`88888888-8888-4888-a888-8888888888${p}1`, `Produto da página ${p}`)] }, error: null };
  };
  const pedidasSemFiltro = () => paginas().filter((c) => c.a.p_marca === null).map((c) => c.a.p_pagina as number);
  const assentar = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const abrir6 = async () => { base.responder = seis; porCatalogo(montar()); const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" })); await screen.findByText(/Página 1 de 6/); };

  it("ao abrir a página 1 pede 1, 2 e 3", async () => {
    await abrir6();
    await waitFor(() => expect(pedidasSemFiltro().sort()).toEqual([1, 2, 3]));
  });
  it("ir à 2 mostra-a logo (sem «A ler…»), não a pede de novo e pré-carrega a 4", async () => {
    await abrir6();
    await waitFor(() => expect(pedidasSemFiltro()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    expect(screen.queryByText(/A ler/)).not.toBeInTheDocument();
    await screen.findByText(/Página 2 de 6/);
    await waitFor(() => expect(pedidasSemFiltro().sort()).toEqual([1, 2, 3, 4]));
    expect(painel().getByRole("button", { name: "Produto da página 2" })).toBeInTheDocument();
  });
  it("voltar à 1 usa a cache: nenhum pedido novo", async () => {
    await abrir6();
    await waitFor(() => expect(pedidasSemFiltro()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await waitFor(() => expect(pedidasSemFiltro()).toHaveLength(4));
    const n = paginas().length;
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByText(/Página 1 de 6/);
    await assentar();
    expect(paginas()).toHaveLength(n);
  });
  it("mudar o filtro limpa a cache e recomeça (1, 2 e 3 do novo filtro; e voltar a «sem filtro» lê de novo)", async () => {
    await abrir6();
    await waitFor(() => expect(pedidasSemFiltro()).toHaveLength(3));
    escolher("Marca", "Roca");
    await waitFor(() => expect(paginas().filter((c) => c.a.p_marca === "Roca").map((c) => c.a.p_pagina).sort()).toEqual([1, 2, 3]));
    escolher("Marca", "Todas as marcas");
    await waitFor(() => expect(pedidasSemFiltro().filter((p) => p === 1)).toHaveLength(2));
  });
  it("uma falha a pré-carregar não mostra erro, e a página lê-se normalmente quando se pede", async () => {
    let falhas = 0;
    base.responder = (f, a) => { if (f === "cat_ler_produtos_pagina" && a.p_pagina === 2 && falhas++ === 0) return { data: null, error: { message: "rede em baixo" } }; return seis(f, a); };
    porCatalogo(montar()); const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    await screen.findByText(/Página 1 de 6/);
    await waitFor(() => expect(falhas).toBe(1));
    await assentar();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/rede em baixo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 6/);
    expect(painel().getByRole("button", { name: "Produto da página 2" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("a última página não pré-carrega para lá de `paginas`", async () => {
    await pagina(); // 3 páginas
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 2 de 3/);
    fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
    await screen.findByText(/Página 3 de 3/);
    await assentar();
    expect(Math.max(...paginas().map((c) => c.a.p_pagina as number))).toBe(3);
  });
  it("depois de gravar no Catálogo (o Catálogo é relido) a cache invalida-se e a página volta a ler-se", async () => {
    const K = montar();
    base.responder = seis; porCatalogo(K); const S = seed(); const run = (fn: () => void) => fn();
    const el = (k: Catalogo) => <CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />;
    const { rerender } = render(el(K));
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    await screen.findByText(/Página 1 de 6/);
    await waitFor(() => expect(pedidasSemFiltro()).toHaveLength(3));
    act(() => { porCatalogo(montar()); });
    rerender(el(K));
    await waitFor(() => expect(pedidasSemFiltro().filter((p) => p === 1).length).toBeGreaterThanOrEqual(2));
  });
});

describe("Produtos por páginas · erros", () => {
  it("se a página falha mostra a mensagem com «Tentar de novo» (nunca fica a ler); ao tentar de novo, lê", async () => {
    let falhar = true;
    base.responder = (f, a) => (f === "cat_ler_produtos_pagina" && falhar ? { data: null, error: { code: "57014", message: "statement timeout" } } : padrao(f, a));
    porCatalogo(montar());
    const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("statement timeout");
    expect(screen.queryByText(/A ler/)).not.toBeInTheDocument();
    falhar = false;
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    await screen.findByText(/Página 1 de 3/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("se as contagens falham a lista funciona e há «Tentar de novo» para elas", async () => {
    let falhar = true;
    base.responder = (f, a) => (f === "cat_ler_produtos_contagens" && falhar ? { data: null, error: { message: "contagens em baixo" } } : padrao(f, a));
    await pagina();
    const aviso = await screen.findByText(/contagens em baixo/);
    expect(painel().getByRole("button", { name: "Torneira cozinha" })).toBeInTheDocument();
    falhar = false;
    fireEvent.click(within(aviso.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.queryByText(/contagens em baixo/)).not.toBeInTheDocument());
  });
  it("a Gestão e as outras secções não ficam presas por causa das leituras novas", async () => {
    base.responder = (f) => (f.startsWith("cat_ler_produtos") ? { data: null, error: { message: "tudo em baixo" } } : { data: null, error: null });
    porCatalogo(montar());
    const S = seed(); const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    await screen.findAllByRole("alert");
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
});

describe("Produtos por páginas · seleção e ficha", () => {
  it("«Selecionar» marca linhas da página e «Selecionar todos» apanha só as da página", async () => {
    await pagina();
    fireEvent.click(painel().getByRole("button", { name: "Selecionar" }));
    fireEvent.click(await screen.findByRole("button", { name: /Selecionar todos os filtrados \(2\)/ }));
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();
    // no modo Selecionar, tocar na linha marca-a em vez de abrir a ficha
    fireEvent.click(painel().getByRole("button", { name: "Torneira cozinha" }));
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
  });
  it("abrir a ficha pelo id: lê os atributos do produto (cat_ler_atributos_produto) e mostra o modelo da linha", async () => {
    base.responder = (f, a) => (f === "cat_ler_atributos_produto" ? { data: { valores: [{ atributo: ID.aCor, opcao: ID.oPreto, valor: "Preto", medida: null }] }, error: null } : padrao(f, a));
    await pagina(real({ podeEditar: false }));
    fireEvent.click(painel().getByRole("button", { name: "Torneira cozinha" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Torneira cozinha" })).toBeInTheDocument();
    expect(await screen.findByText("Cor: Preto")).toBeInTheDocument();
    expect(doTipo("cat_ler_atributos_produto")[0].a).toEqual({ p_org: ORG, p_produto: ID.torneira });
    expect(screen.getByText(/modelo 0001 · SORTY/)).toBeInTheDocument();
  });
  it("a ficha aberta pelo endereço (sem passar pela lista) procura o modelo do produto pelo nome", async () => {
    porCatalogo(montar());
    render(<FichaProdutoAberto id={ID.torneira} K={montar()} real={real({ podeEditar: false })} vistas={new Map()} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} />);
    expect(screen.getByText("A ler o produto…")).toBeInTheDocument();
    await screen.findByRole("heading", { level: 1, name: "Torneira cozinha" });
    expect(screen.getByText(/modelo 0001 · SORTY/)).toBeInTheDocument();
    expect(paginas().some((c) => c.a.p_q === "Torneira cozinha")).toBe(true);
  });
  it("se a procura não trouxe o produto (nome repetido) não finge saber: diz que não conseguiu confirmar o modelo, com «Tentar de novo»", async () => {
    base.responder = (f, a) => (f === "cat_ler_produtos_pagina" ? { data: { total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] }, error: null } : padrao(f, a));
    render(<FichaProdutoAberto id={ID.torneira} K={montar()} real={real({ podeEditar: false })} vistas={new Map()} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} />);
    const a = await screen.findByRole("alert");
    expect(a.textContent).toContain("confirmar o modelo");
    expect(within(a).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Torneira cozinha" })).not.toBeInTheDocument();
  });
  it("se a leitura dos atributos falha a ficha diz-o com «Tentar de novo» e abre na mesma", async () => {
    let falhar = true;
    base.responder = (f, a) => (f === "cat_ler_atributos_produto" ? (falhar ? { data: null, error: { message: "atributos em baixo" } } : { data: { valores: [{ atributo: ID.aCor, opcao: ID.oPreto, valor: "Preto", medida: null }] }, error: null }) : padrao(f, a));
    await pagina(real({ podeEditar: false }));
    fireEvent.click(painel().getByRole("button", { name: "Torneira cozinha" }));
    const aviso = await screen.findByText(/atributos em baixo/);
    expect(screen.getByRole("heading", { level: 1, name: "Torneira cozinha" })).toBeInTheDocument();
    falhar = false;
    fireEvent.click(within(aviso.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Cor: Preto")).toBeInTheDocument();
  });
});

describe("Produtos · o protótipo (sem real) fica em memória", () => {
  it("não chama nenhuma função por páginas e mostra os produtos do Catálogo", async () => {
    await pagina(null);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(base.chamadas.map((c) => c.f)).toEqual([]);
    expect(painel().getByRole("button", { name: "Torneira cozinha" })).toBeInTheDocument();
    expect(painel().getByRole("button", { name: "Produto solto" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Páginas de produtos" })).not.toBeInTheDocument();
    expect(screen.getByText("3 produtos")).toBeInTheDocument();
  });
});
