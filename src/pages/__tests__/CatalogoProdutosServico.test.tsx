// 23/11 (testarh, Mudelar): três problemas do «+ Criar › Produto» e da ficha na página leve de Produtos.
//  1. Criar gravava, além do produto, as receitas que estavam na store como serviços NOVOS («duplicate key services_organization_id_sku_key», produto já criado).
//  2. Um nome de mais de 10 palavras parava na verificação de duplicados («A pesquisa tem no máximo 10 palavras»).
//  3. Não se podia escolher o serviço que o produto traz (nem ao criar, nem na ficha): só por SQL.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const SVC = { instalar: "55555555-5555-4555-a555-555555555501", demol: "55555555-5555-4555-a555-555555555502" };
const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => unknown,
  servicos: [] as unknown[],
  tabelas: [] as string[],
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "3242e925-da26-459a-8258-be04d904e355" }, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
    from: vi.fn((t: string) => {
      base.tabelas.push(t);
      const c: Record<string, unknown> = {};
      for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
      c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: t === "services" ? base.servicos : [], error: null }).then(ok);
      return c;
    }),
  },
}));

import CatalogoProdutos from "../CatalogoProdutos";
import { mudarCustos, reporCustos } from "@/emylia/v2/custosStore";
import { reporCatalogo } from "@/emylia/v2/catalogoStore";

const NOVO = "88888888-8888-4888-a888-888888888899", TORNEIRA = "88888888-8888-4888-a888-888888888801";
const NOME_LONGO = "Móvel AXIS Suspenso c/lavatório 60x50x36 - 2 Gav c/ Fundo Reduzido";
const REFS = { categoriasProduto: [], marcas: [], unidades: ["un"], exige: [], modelos: null };
const PRODUTO = {
  id: TORNEIRA, name: "Torneira cozinha", sku: "CB-0001-1", tipo_catalogo: "produto", unidade: "un", servico_id: null as string | null, fator_servico: 1, image_urls: [],
  marca: "Grohe", uom: "un", category_id: null, subcategory_id: null, estado: "active", ve_valores: true, custo: 60, custo_data: "2026-11-01", pvp: 100,
};
const palavras = (q: unknown) => new Set(String(q ?? "").trim().split(/\s+/).filter(Boolean).map((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())).size;
const padrao = (f: string, a: Record<string, unknown>): unknown => {
  if (f === "cat_ler_referencias_produtos") return { data: REFS, error: null };
  if (f === "cat_ler_atributos_definicoes") return { data: { atributos: [], produtos: [] }, error: null };
  if (f === "cat_ler_produtos_pagina") {
    // a base recusa mais de 10 palavras (fn_cat_termos_pesquisa)
    if (palavras(a.p_q) > 10) return { data: null, error: { code: "CT002", message: "A pesquisa tem no máximo 10 palavras." } };
    return { data: { total: 0, pagina: 1, limite: 50, paginas: 0, produtos: [] }, error: null };
  }
  if (f === "cat_ler_produtos_contagens") return { data: { total: 0, por_categoria: [], por_subcategoria: [], por_modelo: [], sem_referencia: 0, sem_categoria: 0, sem_marca: 0 }, error: null };
  if (f === "cat_ler_produto") return { data: { ...PRODUTO, servico_id: servicoBase, fator_servico: fatorBase }, error: null };
  if (f === "cat_guardar_produto") return { data: NOVO, error: null };
  if (f === "cat_guardar_servico") return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "services_organization_id_sku_key"' } };
  if (f === "cat_definir_servico_produto") { servicoBase = a.p_servico as string | null; fatorBase = a.p_fator as number; return { data: { id: a.p_produto }, error: null }; }
  return { data: null, error: null };
};
let servicoBase: string | null = null, fatorBase = 1;
const doTipo = (f: string) => base.chamadas.filter((c) => c.f === f);
const montar = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/catalogo/produtos" element={<CatalogoProdutos />} />
      <Route path="/catalogo/produtos/:id" element={<CatalogoProdutos />} />
    </Routes>
  </MemoryRouter>,
);
const preencher = async (nome: string) => {
  fireEvent.change(await screen.findByLabelText("Nome do produto"), { target: { value: nome } });
  fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "12" } });
};
const avisos = () => screen.getByRole("status", { name: "Avisos" });

beforeEach(() => {
  base.chamadas = []; base.tabelas = []; base.responder = padrao; servicoBase = null; fatorBase = 1;
  base.servicos = [{ id: SVC.instalar, name: "Instalação de móvel de casa de banho", sku: "inst-movel" }, { id: SVC.demol, name: "Demolição e entulho", sku: "demol" }];
  // a store dos custos como a página de Serviços a deixa: com a receita da «Demolição e entulho»
  mudarCustos((c) => { c.receitas.demol = { sid: "demol", origem: "editada", mo: [{ id: "p1", n: "Execução", perfil: "servente", h: 1 }], equip: [], cons: [], modo: "margem", precoTabela: 0, margem: 35, medida: null, hist: [] }; });
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("criar um produto na página leve", () => {
  it("1. grava só o produto: nenhum cat_guardar_servico (nem «duplicate key»), e o formulário fecha", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    expect(await within(avisos()).findByText("Gravado")).toBeInTheDocument();
    expect(doTipo("cat_guardar_servico")).toHaveLength(0);
    expect(screen.queryByText(/Não gravou/)).toBeNull();
    await waitFor(() => expect(screen.queryByLabelText("Nome do produto")).toBeNull());
  });

  it("2. um nome real de 11 palavras cria-se: a verificação de duplicados manda à base no máximo 10", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher(NOME_LONGO);
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    expect(doTipo("cat_guardar_produto")[0].a.p_nome).toBe(NOME_LONGO);
    expect(doTipo("cat_ler_produtos_pagina").every((c) => palavras(c.a.p_q) <= 10)).toBe(true);
    expect(screen.queryByText(/no máximo 10 palavras/)).toBeNull();
  });

  it("3. mostra «O serviço que traz» com os serviços da organização e grava o id em products.servico_id", async () => {
    montar("/catalogo/produtos?criar=produto");
    await preencher("Móvel suspenso 60");
    const secao = await screen.findByRole("region", { name: "O serviço que traz" });
    expect(base.tabelas).toContain("services");
    fireEvent.focus(within(secao).getByRole("combobox", { name: "Serviço que traz" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Instalação de móvel de casa de banho/ }));
    expect(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByText(/Traz: Instalação de móvel de casa de banho/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    expect(doTipo("cat_guardar_produto")[0].a).toMatchObject({ p_servico_id: SVC.instalar, p_fator_servico: 1 });
    expect(doTipo("cat_guardar_servico")).toHaveLength(0);
  });

  it("3. sem os serviços (sem services.view ou a leitura falhou) cria-se na mesma, sem a secção", async () => {
    base.servicos = [];
    montar("/catalogo/produtos?criar=produto");
    await preencher("Banheira nova");
    expect(screen.queryByRole("region", { name: "O serviço que traz" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    await waitFor(() => expect(doTipo("cat_guardar_produto")).toHaveLength(1));
    expect(doTipo("cat_guardar_produto")[0].a.p_servico_id).toBeNull();
  });
});

describe("a ficha do produto: o serviço que traz", () => {
  it("escolhe o serviço e o fator, grava só isso (cat_definir_servico_produto) e relê o produto", async () => {
    montar(`/catalogo/produtos/${TORNEIRA}`);
    const secao = await screen.findByRole("region", { name: "Serviço que traz" });
    fireEvent.focus(within(secao).getByRole("combobox", { name: "Serviço que traz" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Instalação de móvel/ }));
    fireEvent.change(within(secao).getByLabelText(/Quantas unidades do serviço/), { target: { value: "2" } });
    fireEvent.click(within(secao).getByRole("button", { name: "Gravar o serviço" }));
    await waitFor(() => expect(doTipo("cat_definir_servico_produto")).toHaveLength(1));
    expect(doTipo("cat_definir_servico_produto")[0].a).toEqual({ p_org: ORG, p_produto: TORNEIRA, p_servico: SVC.instalar, p_fator: 2 });
    expect(doTipo("cat_guardar_produto")).toHaveLength(0);
    await waitFor(() => expect(doTipo("cat_ler_produto").length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole("button", { name: "Traz: Instalação de móvel de casa de banho" })).toBeInTheDocument();
  });

  it("tirar o serviço grava null; sem a função na base diz que falta a migração", async () => {
    servicoBase = SVC.demol;
    base.responder = (f, a) => (f === "cat_definir_servico_produto" ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_servico_produto" } } : padrao(f, a));
    montar(`/catalogo/produtos/${TORNEIRA}`);
    const secao = await screen.findByRole("region", { name: "Serviço que traz" });
    fireEvent.click(within(secao).getByRole("button", { name: "Trocar" }));
    fireEvent.click(within(secao).getByRole("button", { name: "Tirar o serviço" }));
    expect(await within(secao).findByRole("alert")).toHaveTextContent(/falta a migração 20270126100000/);
    expect(doTipo("cat_definir_servico_produto")[0].a).toMatchObject({ p_servico: null, p_fator: 1 });
  });
});
