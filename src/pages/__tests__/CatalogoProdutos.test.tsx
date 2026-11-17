// 17/11: a página de Produtos do Catálogo (/catalogo/produtos e /catalogo/produtos/:id) já não lê o Catálogo inteiro (cat_ler_catalogo, 30 MB) nem
// cat_ler_produtos_tabelas (8,6 MB): usa as referências (cat_ler_referencias_produtos), a página da lista (cat_ler_produtos_pagina) e, na ficha, um só
// produto (cat_ler_produto). O Estado do produto (Rascunho, Ativo, Descontinuado) grava-se com cat_definir_estado_produto, na ficha e ao criar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const org = vi.hoisted(() => ({ id: "11111111-1111-4111-a111-111111111111" as string | null }));
const perms = vi.hoisted(() => ({ tem: (_: string) => true }));
const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => unknown,
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: org.id ? { id: org.id } : null, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (p: string) => perms.tem(p) }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
    from: vi.fn(() => { const c: Record<string, unknown> = {}; for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c; c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok); return c; }),
  },
}));

import CatalogoProdutos from "../CatalogoProdutos";
import { FichaProdutoLeve } from "@/emylia/FichaProdutoLeve";
import { catalogo0 } from "@/emylia/v2/catalogoModelo";
import type { FichaProdutoReal } from "@/emylia/fichaProdutoDados";
import { catalogoDesatualizado, marcarCatalogoAtualizado } from "@/emylia/v2/catalogoStore";

const ORG = "11111111-1111-4111-a111-111111111111";
const ID = {
  torneira: "88888888-8888-4888-a888-888888888801", rascunho: "88888888-8888-4888-a888-888888888802", novo: "88888888-8888-4888-a888-888888888899",
  pcOf: "aaaaaaaa-0000-4000-a000-000000000001", pcSub: "aaaaaaaa-0000-4000-a000-000000000002",
};
const REFS = {
  categoriasProduto: [{ id: ID.pcOf, name: "Canalização", parent_id: null, sort_order: 0, ativa: true }, { id: ID.pcSub, name: "Louças e torneiras", parent_id: ID.pcOf, sort_order: 0, ativa: true }],
  marcas: ["Grohe"], unidades: ["un"], exige: [], modelos: null,
};
const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, sku: null, sku_gerado: null, marca: null, categoria_id: null, categoria: null, subcategoria_id: null,
  subcategoria: null, modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 60, pvp: 100, grossista: null, distribuidor: null, fornecedor: null, ativo: true,
  estado: "active", imagem: null, atributos_resumo: null, ...extra });
const PRODUTO = {
  id: ID.torneira, name: "Torneira cozinha", sku: "CB-0001-1", tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1, entulho_m3: null, entulho_kg: null,
  short_description: null, marca_livre: null, fornecedor_livre: null, image_urls: [], brand_id: "b1", marca: "Grohe", uom_id: "u1", uom: "un", category_id: ID.pcOf, subcategory_id: ID.pcSub,
  sku_gerado: true, categoria: "Canalização", subcategoria: "Louças e torneiras", ativo: true, modelo_id: null, modelo: null, modelo_numero: null, estado: "active", ve_valores: true,
  precosProduto: [], fornecedores: [], custo: 60, custo_data: "2026-11-01", pvp: 100, grossista: null, distribuidor: null, fornecedor: null,
};
const CONTAGENS = { total: 2, por_categoria: [{ id: ID.pcOf, n: 2 }], por_subcategoria: [], por_modelo: [], sem_referencia: 0, sem_categoria: 0, sem_marca: 0 };
const padrao = (f: string, a: Record<string, unknown>): unknown => {
  if (f === "cat_ler_referencias_produtos") return { data: REFS, error: null };
  if (f === "cat_ler_atributos_definicoes") return { data: { atributos: [], produtos: [] }, error: null };
  if (f === "cat_ler_produtos_pagina") return { data: { total: 2, pagina: 1, limite: 50, paginas: 1, produtos: [linha(ID.torneira, "Torneira cozinha", { sku: "CB-0001-1" }), linha(ID.rascunho, "Misturadora em estudo", { estado: "draft", ativo: false })] }, error: null };
  if (f === "cat_ler_produtos_contagens") return { data: CONTAGENS, error: null };
  if (f === "cat_ler_produto") return { data: { ...PRODUTO, estado: estadoBase }, error: null };
  if (f === "cat_ler_parametros_catalogo") return { data: parametros, error: null };
  if (f === "cat_definir_estado_produto") estadoBase = a.p_status as string;
  if (f === "cat_definir_estado_produto") return { data: { ok: true, id: a.p_produto, estado: a.p_status, ativo: a.p_status === "active", alterado: true }, error: null };
  if (f === "cat_guardar_produto") return { data: ID.novo, error: null };
  return { data: null, error: null };
};
let estadoBase = "active";
let parametros: unknown = null;
const doTipo = (f: string) => base.chamadas.filter((c) => c.f === f);

function montar(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/catalogo/produtos" element={<CatalogoProdutos />} />
        <Route path="/catalogo/produtos/:id" element={<CatalogoProdutos />} />
        <Route path="*" element={<p>fora</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { estadoBase = "active"; parametros = null; marcarCatalogoAtualizado(); base.chamadas = []; base.responder = padrao; org.id = ORG; perms.tem = () => true; });
afterEach(cleanup);

describe("Produtos do Catálogo: a lista não lê o Catálogo inteiro", () => {
  it("usa as referências e a página; nunca cat_ler_catalogo nem cat_ler_produtos_tabelas", async () => {
    montar("/catalogo/produtos");
    await screen.findByText(/Página 1 de 1/);
    const fns = base.chamadas.map((c) => c.f);
    expect(fns).toContain("cat_ler_referencias_produtos");
    expect(fns).toContain("cat_ler_produtos_pagina");
    expect(fns).not.toContain("cat_ler_catalogo");
    expect(fns).not.toContain("cat_ler_produtos_tabelas");
    expect(doTipo("cat_ler_referencias_produtos")[0].a).toEqual({ p_org: ORG });
    expect(screen.getByText("Torneira cozinha")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lista", "Categorias", "Subcategorias", "Modelos", "Marcas", "Atributos", "Referência (SKU)"]);
  });

  it("mostra o estado de um produto que não está ativo, e só desse", async () => {
    montar("/catalogo/produtos");
    await screen.findByText("Misturadora em estudo");
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.queryByText("Ativo")).not.toBeInTheDocument();
  });

  it("uma falha a ler as referências diz-se, com «Tentar de novo»", async () => {
    base.responder = (f, a) => (f === "cat_ler_referencias_produtos" ? { data: null, error: { code: "CT001", message: "Sem permissão para ver o Catálogo." } } : padrao(f, a));
    montar("/catalogo/produtos");
    expect(await screen.findByText(/Sem permissão para ver o Catálogo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});

describe("Produtos do Catálogo: a ficha abre pelo id da rota", () => {
  it("lê só esse produto (cat_ler_produto) e mostra-o", async () => {
    montar(`/catalogo/produtos/${ID.torneira}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Torneira cozinha" })).toBeInTheDocument();
    expect(doTipo("cat_ler_produto")[0].a).toEqual({ p_org: ORG, p_produto: ID.torneira });
    const fns = base.chamadas.map((c) => c.f);
    expect(fns).not.toContain("cat_ler_catalogo");
    expect(fns).not.toContain("cat_ler_produtos_tabelas");
  });

  it("um produto que a base recusa (CT003) diz-se e deixa voltar", async () => {
    base.responder = (f, a) => (f === "cat_ler_produto" ? { data: null, error: { code: "CT003", message: "Produto não encontrado." } } : padrao(f, a));
    montar(`/catalogo/produtos/${ID.torneira}`);
    expect(await screen.findByText(/Produto não encontrado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Voltar ao Catálogo/ })).toBeInTheDocument();
  });
});

describe("Produtos do Catálogo: o Estado na ficha", () => {
  it("grava com cat_definir_estado_produto e relê só esse produto", async () => {
    montar(`/catalogo/produtos/${ID.torneira}`);
    const sel = await screen.findByLabelText("Estado");
    expect(sel).toHaveValue("active");
    expect(Array.from((sel as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(["Rascunho", "Ativo", "Descontinuado"]);
    const antes = doTipo("cat_ler_produto").length;
    fireEvent.change(sel, { target: { value: "discontinued" } });
    await waitFor(() => expect(doTipo("cat_definir_estado_produto")).toHaveLength(1));
    expect(doTipo("cat_definir_estado_produto")[0].a).toEqual({ p_org: ORG, p_produto: ID.torneira, p_status: "discontinued" });
    await waitFor(() => expect(doTipo("cat_ler_produto").length).toBe(antes + 1));
    await waitFor(() => expect(screen.getByLabelText("Estado")).toHaveValue("discontinued"));
    expect(base.chamadas.map((c) => c.f)).not.toContain("cat_ler_catalogo");
  });

  it("a recusa da base (CT001) mostra-se tal como vem e o seletor volta ao que estava", async () => {
    base.responder = (f, a) => (f === "cat_definir_estado_produto" ? { data: null, error: { code: "CT001", message: "Sem permissão para editar produtos." } } : padrao(f, a));
    montar(`/catalogo/produtos/${ID.torneira}`);
    const sel = await screen.findByLabelText("Estado");
    fireEvent.change(sel, { target: { value: "draft" } });
    expect(await screen.findByText("Sem permissão para editar produtos.")).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Estado")).toHaveValue("active");
  });

  it("sem products.edit o estado só se vê", async () => {
    perms.tem = (p) => p !== "products.edit";
    montar(`/catalogo/produtos/${ID.torneira}`);
    const sel = await screen.findByLabelText("Estado");
    expect(sel).toBeDisabled();
    expect(doTipo("cat_definir_estado_produto")).toHaveLength(0);
  });
});

describe("Produtos do Catálogo: criar com Estado", () => {
  const preencher = async (nome: string) => {
    fireEvent.change(await screen.findByLabelText("Nome do produto"), { target: { value: nome } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "12" } });
  };

  it("o Estado começa em Ativo; um produto Ativo não chama cat_definir_estado_produto", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    expect(screen.getByRole("radio", { name: "Ativo" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    await screen.findByText(/Banheira nova/);
    expect(doTipo("cat_definir_estado_produto")).toHaveLength(0);
  });

  it("criar em Rascunho chama a RPC do estado a seguir a cat_guardar_produto, com o id que a base deu", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("radio", { name: "Rascunho" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_definir_estado_produto")).toHaveLength(1));
    expect(doTipo("cat_definir_estado_produto")[0].a).toEqual({ p_org: ORG, p_produto: ID.novo, p_status: "draft" });
    const ordem = base.chamadas.map((c) => c.f);
    expect(ordem.indexOf("cat_guardar_produto")).toBeLessThan(ordem.indexOf("cat_definir_estado_produto"));
  });

  it("um nome que já existe (sem ler o Catálogo inteiro) recusa-se antes de gravar", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Torneira cozinha");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await screen.findByText(/Já existe «Torneira cozinha»/)).toHaveAttribute("role", "alert");
    expect(doTipo("cat_ler_produtos_pagina").some((c) => c.a.p_q === "Torneira cozinha")).toBe(true);
    expect(doTipo("cat_guardar_produto")).toHaveLength(0);
  });
});

describe("Produtos do Catálogo: revisão (duplicados, desmontar, reler, atributos, permissões)", () => {
  const preencher = async (nome: string) => {
    fireEvent.change(await screen.findByLabelText("Nome do produto"), { target: { value: nome } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "12" } });
  };
  const adiado = () => { let soltar!: (v: unknown) => void; const p = new Promise<unknown>((r) => { soltar = r; }); return { p, soltar }; };
  const avisos = () => screen.getByRole("status", { name: "Avisos" });

  it("M1: o nome exato que só vem na página 2 da pesquisa também recusa", async () => {
    base.responder = (f, a) => {
      if (f === "cat_ler_produtos_pagina" && a.p_q === "Banheira nova") {
        return a.p_pagina === 1
          ? { data: { total: 60, pagina: 1, limite: 50, paginas: 2, produtos: [linha(ID.torneira, "Banheira nova grande")] }, error: null }
          : { data: { total: 60, pagina: 2, limite: 50, paginas: 2, produtos: [linha(ID.rascunho, "Banheira nova")] }, error: null };
      }
      return padrao(f, a);
    };
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await screen.findByText(/Já existe «Banheira nova»/)).toBeInTheDocument();
    expect(doTipo("cat_guardar_produto")).toHaveLength(0);
    expect(doTipo("cat_ler_produtos_pagina").filter((c) => c.a.p_q === "Banheira nova").map((c) => c.a.p_pagina)).toEqual([1, 2]);
  });

  it("M7: a referência repetida recusa-se (pesquisa pela referência)", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.change(screen.getByLabelText(/^Referência/), { target: { value: "CB-0001-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await screen.findByText("A referência CB-0001-1 já é de outro produto.")).toBeInTheDocument();
    expect(doTipo("cat_guardar_produto")).toHaveLength(0);
  });

  it("L3: enquanto verifica duplicados o botão fica desativado e diz o que faz", async () => {
    const d = adiado();
    base.responder = (f, a) => (f === "cat_ler_produtos_pagina" && a.p_q === "Banheira nova" ? d.p : padrao(f, a));
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await screen.findByRole("button", { name: /A verificar/ })).toBeDisabled();
    d.soltar({ data: { total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] }, error: null });
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
  });

  it("M2 e L3: se a página desmonta a meio da gravação, nada corre depois; durante ela o botão diz «A gravar»", async () => {
    const d = adiado();
    base.responder = (f, a) => (f === "cat_guardar_produto" ? d.p : padrao(f, a));
    const { unmount } = montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    expect(screen.getByRole("button", { name: /A gravar/ })).toBeDisabled();
    const leituras = doTipo("cat_ler_referencias_produtos").length;
    unmount();
    d.soltar({ data: ID.novo, error: null });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(doTipo("cat_ler_referencias_produtos")).toHaveLength(leituras);
  });

  it("M6: criar um produto marca o Catálogo partilhado como desatualizado", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    expect(catalogoDesatualizado()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(catalogoDesatualizado()).toBe(true));
  });

  it("M6: gravar na ficha (o estado) também o marca", async () => {
    montar(`/catalogo/produtos/${ID.torneira}`);
    fireEvent.change(await screen.findByLabelText("Estado"), { target: { value: "draft" } });
    await waitFor(() => expect(catalogoDesatualizado()).toBe(true));
  });

  it("M7 e L1: a falha do estado ao criar não anula o produto e o aviso vem no único «Avisos»", async () => {
    base.responder = (f, a) => (f === "cat_definir_estado_produto" ? { data: null, error: { code: "CT001", message: "Sem permissão." } } : padrao(f, a));
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("radio", { name: "Rascunho" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await within(avisos()).findByText(/criado; estado por definir/)).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "Avisos" })).toHaveLength(1);
    expect(doTipo("cat_guardar_produto")).toHaveLength(1);
  });

  it("L5: o «Não gravou» desaparece ao mudar de página", async () => {
    base.responder = (f, a) => (f === "cat_guardar_produto" ? { data: null, error: { code: "CT001", message: "Sem permissão para criar." } } : padrao(f, a));
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(await within(avisos()).findByText(/Não gravou/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Voltar ao Catálogo/ }));
    await screen.findByText(/Página 1 de 1/);
    expect(screen.queryByText(/Não gravou/)).not.toBeInTheDocument();
  });

  it("M7: ?criar=produto sem products.edit não abre o formulário", async () => {
    perms.tem = (p) => p !== "products.edit";
    montar("/catalogo/produtos?criar=produto");
    expect(await screen.findByText(/Sem permissão para criar produtos/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome do produto")).not.toBeInTheDocument();
  });

  it("M5: sem as definições dos atributos não se cria (diz-se, com «Tentar de novo»)", async () => {
    let falha = true;
    base.responder = (f, a) => (f === "cat_ler_atributos_definicoes" && falha ? { data: null, error: { code: "57014", message: "statement timeout" } } : padrao(f, a));
    montar("/catalogo/produtos?criar=produto");
    expect(await screen.findByText(/Não foi possível ler os atributos/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome do produto")).not.toBeInTheDocument();
    falha = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByLabelText("Nome do produto")).toBeInTheDocument();
  });

  it("M3 e M7: se reler falha depois de gravar o estado, diz-se «gravou, mas não foi possível reler» e o estado fica aplicado", async () => {
    let lidos = 0;
    base.responder = (f, a) => (f === "cat_ler_produto" && ++lidos > 1 ? { data: null, error: { code: "57014", message: "statement timeout" } } : padrao(f, a));
    montar(`/catalogo/produtos/${ID.torneira}`);
    fireEvent.change(await screen.findByLabelText("Estado"), { target: { value: "discontinued" } });
    expect(await screen.findByText(/gravou, mas não foi possível reler/)).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue("discontinued");
  });

  it("M4: uma releitura que chega depois de mudar de produto não o substitui", async () => {
    const d = adiado();
    let leiturasA = 0;
    base.responder = (f, a) => {
      if (f === "cat_ler_produto" && a.p_produto === ID.torneira && ++leiturasA === 2) return d.p;
      if (f === "cat_ler_produto" && a.p_produto === ID.rascunho) return { data: { ...PRODUTO, id: ID.rascunho, name: "Outra torneira" }, error: null };
      return padrao(f, a);
    };
    const r: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: true, podeStock: true, podeVerCusto: true, recarregar: async () => {} };
    const props = { K: catalogo0(), real: r, min: 28, alvo: 35, voltar: () => {}, anunciar: () => {}, nomeServico: () => "", onAbrirServico: () => {} };
    const { rerender } = render(<MemoryRouter><FichaProdutoLeve id={ID.torneira} {...props} /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Estado"), { target: { value: "discontinued" } });
    await waitFor(() => expect(leiturasA).toBe(2));
    rerender(<MemoryRouter><FichaProdutoLeve id={ID.rascunho} {...props} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: "Outra torneira" })).toBeInTheDocument();
    d.soltar({ data: { ...PRODUTO, estado: "discontinued" }, error: null });
    await act(async () => { await new Promise((x) => setTimeout(x, 30)); });
    expect(screen.getByRole("heading", { level: 1, name: "Outra torneira" })).toBeInTheDocument();
  });
});

describe("Produtos do Catálogo: o botão Criar da lista", () => {
  it("aparece com products.edit e abre o formulário", async () => {
    montar("/catalogo/produtos");
    await screen.findByText(/Página 1 de 1/);
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(await screen.findByLabelText("Nome do produto")).toBeInTheDocument();
  });
  it("não aparece sem products.edit", async () => {
    perms.tem = (p) => p !== "products.edit";
    montar("/catalogo/produtos");
    await screen.findByText(/Página 1 de 1/);
    expect(screen.queryByRole("button", { name: "Criar" })).not.toBeInTheDocument();
  });
});

describe("Produtos do Catálogo: as margens vêm de cat_ler_parametros_catalogo", () => {
  const semPvp = (f: string, a: Record<string, unknown>): unknown => {
    if (f === "cat_ler_produto") return { data: { ...PRODUTO, pvp: null, custo: 60 }, error: null };
    if (f === "cat_ler_produtos_pagina") return { data: { total: 1, pagina: 1, limite: 50, paginas: 1, produtos: [linha(ID.torneira, "Torneira cozinha", { pvp: null, custo: 60 })] }, error: null };
    return padrao(f, a);
  };
  const PARAMETROS = { meses: 14, tsu: 23.75, seguros_ano: 0, horas_ano: 1345, horas_mes: 0, meses_desatualizado: 6, margem_minima: 40, margem_alvo: 50 };

  it("lê-as com as referências e o preço sugerido da ficha usa a margem-alvo da organização (50%, não 35%)", async () => {
    parametros = PARAMETROS;
    base.responder = semPvp;
    montar(`/catalogo/produtos/${ID.torneira}`);
    expect(await screen.findByTestId("venda-produto")).toHaveTextContent("120,00");
    expect(doTipo("cat_ler_parametros_catalogo")[0].a).toEqual({ p_org: ORG });
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("50");
    expect(base.chamadas.map((c) => c.f)).not.toContain("cat_ler_catalogo");
  });

  it("o preço sugerido da lista usa a mesma margem", async () => {
    parametros = PARAMETROS;
    base.responder = semPvp;
    montar("/catalogo/produtos");
    await screen.findByText(/Página 1 de 1/);
    expect(await screen.findByText(/120,00/)).toBeInTheDocument();
  });

  it("sem parâmetros (null) valem 28 e 35, como no Catálogo inteiro (60 / 0,65 = 92,31)", async () => {
    parametros = null;
    base.responder = semPvp;
    montar(`/catalogo/produtos/${ID.torneira}`);
    expect(await screen.findByTestId("venda-produto")).toHaveTextContent("92,31");
  });

  it("uma falha a ler os parâmetros diz-se (não se mostra um preço com margens inventadas)", async () => {
    base.responder = (f, a) => (f === "cat_ler_parametros_catalogo" ? { data: null, error: { code: "57014", message: "statement timeout" } } : padrao(f, a));
    montar("/catalogo/produtos");
    expect(await screen.findByText(/statement timeout/)).toBeInTheDocument();
  });
});
