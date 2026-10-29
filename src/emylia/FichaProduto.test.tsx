// 29/10: a ficha do produto (FichaProduto.tsx): abre ao tocar na linha, mostra a margem, a estrela muda o preferido
// (cat_definir_fornecedor_preferido), a ligação usa rpc_catalog_link com os argumentos de Compras e, sem as funções na base, não rebenta.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
  tabelas: {} as Record<string, unknown[]>,
}));
vi.mock("@/integrations/supabase/client", () => {
  // .from(t).select().eq().is().order()… : tudo encadeia e no fim resolve com as linhas da tabela
  const cadeia = (t: string) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: base.tabelas[t] ?? [], error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.respostas[f] ?? { data: null, error: null }; }),
      from: vi.fn((t: string) => cadeia(t)),
    },
  };
});

import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const PID = "11111111-2222-4333-8444-555555555555";
const SUP = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROD: Produto = { id: PID, n: "Torneira Teste", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: null, sku: "GR-1" };
const LIGADO = {
  item_supplier_id: "is-1", supplier_id: SUP, supplier_name: "Fornecedor A", supplier_sku: "A-77", purchase_price: 60, currency: "EUR",
  lead_time_days: 3, moq: null, is_preferred: false, is_active: true, preco_data: "2026-10-01", catalog_item_id: null, catalogo: null,
};
const real = (podeEditar = true, podeMudarPrecos = true): FichaProdutoReal => ({ org: "org-1", podeEditar, podeMudarPrecos, recarregar: vi.fn(async () => {}) });
const ficha = (p: Produto = PROD, r: FichaProdutoReal | undefined = real(), anunciar = vi.fn()) => {
  render(<FichaProduto p={p} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r} />);
  return anunciar;
};

// 29/10: a secção «Stock e armazéns» lê cat_produto_stock em todas as fichas reais (os testes dela estão em StockArmazens.test.tsx)
beforeEach(() => { base.chamadas = []; base.respostas = { cat_produto_stock: { data: { gere_stock: true, pode_editar: true, armazens: [] }, error: null } }; base.tabelas = {}; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("FichaProduto · abrir pela linha", () => {
  function pagina(S: Estado = seed()) {
    const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  }
  it("tocar na linha abre a ficha; «Voltar ao Catálogo» volta à lista", () => {
    mudarCatalogo((k) => { k.produtos.unshift({ ...PROD }); });
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    const linha = within(screen.getByRole("tabpanel")).getAllByRole("listitem").find((li) => li.textContent?.includes("Torneira Teste"))!;
    fireEvent.click(linha);
    expect(screen.getByRole("heading", { level: 1, name: "Torneira Teste" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
  it("o «Traz:» continua a abrir o serviço (não a ficha do produto)", () => {
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    const traz = within(screen.getByRole("tabpanel")).getAllByRole("button", { name: /^Traz:/ })[0];
    const servico = traz.textContent!.replace(/^Traz:\s*/, "");
    fireEvent.click(traz);
    expect(screen.getByRole("heading", { level: 1, name: servico })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Custo e preço" })).toBeInTheDocument();
  });
});

describe("FichaProduto · preço e fornecedores", () => {
  it("mostra a margem (PVP − custo) ÷ PVP; sem PVP, custo + alvo", async () => {
    base.respostas.cat_produto_fornecedores = { data: [], error: null };
    ficha();
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("40,0%");
    cleanup();
    ficha({ ...PROD, pvp: undefined }, undefined);
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("35,0%");
    expect(screen.getByText(/Sem PVP: custo \+ 35% de margem/)).toBeInTheDocument();
  });
  it("lista os fornecedores ligados e a estrela chama cat_definir_fornecedor_preferido; diz o motivo se o custo não mudou", async () => {
    base.respostas.cat_produto_fornecedores = { data: [LIGADO], error: null };
    base.respostas.cat_definir_fornecedor_preferido = { data: { ok: true, custo_aplicado: false, motivo: "preço sem data" }, error: null };
    const r = real();
    const anunciar = ficha(PROD, r);
    const linha = (await screen.findByText("Fornecedor A")).closest("tr")!;
    expect(base.chamadas.find((c) => c.f === "cat_produto_fornecedores")).toEqual({ f: "cat_produto_fornecedores", a: { p_product_id: PID } });
    expect(linha).toHaveTextContent("A-77");
    expect(linha).toHaveTextContent("60,00 €");
    expect(linha).toHaveTextContent("3 d");
    fireEvent.click(screen.getByRole("button", { name: "Tornar Fornecedor A o preferido" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(base.chamadas.find((c) => c.f === "cat_definir_fornecedor_preferido")?.a).toEqual({ p_item_supplier_id: "is-1" });
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("preço sem data"));
    expect(base.chamadas.filter((c) => c.f === "cat_produto_fornecedores")).toHaveLength(2);
  });
  it("sem products.edit não há estrela nem «Ligar»", async () => {
    base.respostas.cat_produto_fornecedores = { data: [LIGADO], error: null };
    ficha(PROD, real(false));
    await screen.findByText("Fornecedor A");
    expect(screen.queryByRole("button", { name: /o preferido$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ligar a artigo do fornecedor/ })).toBeNull();
  });
  it("sem products.manage_prices a estrela só se vê (o preferido continua marcado); «Ligar» fica", async () => {
    base.respostas.cat_produto_fornecedores = { data: [LIGADO, { ...LIGADO, item_supplier_id: "is-2", supplier_name: "Fornecedor B", is_preferred: true }], error: null };
    ficha(PROD, real(true, false));
    const b = (await screen.findByText("Fornecedor B")).closest("tr")!;
    expect(within(b).getByText("Preferido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /o preferido$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Ligar a artigo do fornecedor/ })).toBeInTheDocument();
  });
  it("sem a função na base (PGRST202) diz «Ainda não disponível nesta base» e a página fica", async () => {
    base.respostas.cat_produto_fornecedores = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_produto_fornecedores" } };
    ficha();
    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda não disponível nesta base");
    expect(screen.getByRole("heading", { level: 1, name: "Torneira Teste" })).toBeInTheDocument();
  });
});

describe("FichaProduto · o PVP (o custo vem do fornecedor)", () => {
  beforeEach(() => { base.respostas.cat_produto_fornecedores = { data: [], error: null }; });
  const campo = () => screen.getByRole("textbox", { name: "PVP" });
  it("ao escrever, a margem acompanha; abaixo da mínima avisa sem bloquear; Guardar chama cat_definir_pvp com o número e relê", async () => {
    base.respostas.cat_definir_pvp = { data: { ok: true, pvp: 80 }, error: null };
    const r = real();
    const anunciar = ficha(PROD, r);
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("40,0%");
    fireEvent.change(campo(), { target: { value: "80" } });
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("25,0%");
    expect(screen.getByText("Abaixo da margem mínima (28%).")).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: "120,5" } });
    expect(screen.getByTestId("venda-produto")).toHaveTextContent("120,50 €");
    expect(screen.queryByText(/Abaixo da margem mínima/)).toBeNull();
    fireEvent.change(campo(), { target: { value: "50" } });
    expect(screen.getByText(/Abaixo do custo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar PVP" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(base.chamadas.find((c) => c.f === "cat_definir_pvp")?.a).toEqual({ p_product_id: PID, p_pvp: 50 });
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("50,00 €"));
    expect(base.chamadas.some((c) => c.f === "cat_guardar_produto")).toBe(false);
  });
  it("vazio mostra «Sem PVP: custo + alvo»; 0 ou texto não se grava", () => {
    ficha();
    fireEvent.change(campo(), { target: { value: "" } });
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("35,0%");
    expect(screen.getByText(/Sem PVP: custo \+ 35% de margem/)).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent("maior que 0");
    expect(screen.getByRole("button", { name: "Guardar PVP" })).toBeDisabled();
  });
  it("Limpar PVP chama cat_definir_pvp com null", async () => {
    base.respostas.cat_definir_pvp = { data: { ok: true, pvp: null }, error: null };
    const r = real();
    ficha(PROD, r);
    fireEvent.click(screen.getByRole("button", { name: "Limpar PVP" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(base.chamadas.find((c) => c.f === "cat_definir_pvp")?.a).toEqual({ p_product_id: PID, p_pvp: null });
  });
  it("sem products.edit ou sem products.manage_prices o PVP só se lê", async () => {
    ficha(PROD, real(false, true));
    expect(screen.queryByRole("textbox", { name: "PVP" })).toBeNull();
    cleanup();
    ficha(PROD, real(true, false));
    expect(screen.queryByRole("textbox", { name: "PVP" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar PVP" })).toBeNull();
    expect(screen.getByTestId("margem-produto")).toHaveTextContent("40,0%");
  });
  it("sem a função na base diz «Ainda não disponível nesta base»", async () => {
    base.respostas.cat_definir_pvp = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_pvp" } };
    ficha();
    fireEvent.change(campo(), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar PVP" }));
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
  });
});

describe("FichaProduto · ligar a artigo do fornecedor", () => {
  it("o fornecedor indicado preenche a procura; ligar chama rpc_catalog_link com os argumentos de Compras", async () => {
    base.respostas.cat_produto_fornecedores = { data: [], error: null };
    base.tabelas.suppliers = [{ id: SUP, name: "Sanitop" }, { id: "outro", name: "Outro" }];
    base.tabelas.item_suppliers = [{ id: "is-9", uom_id: "uom-un", supplier_sku: null, purchase_price: null, currency: null, catalog_item_id: null, uom: { code: "un" } }];
    base.respostas.rpc_supplier_catalog_list = { data: {
      linked_account: true, counts: {}, total: 1, limit: 20, offset: 0, can_link: true, can_view_pricing: true, can_manage_prices: true,
      items: [{ id: "cat-1", supplier_ref: "SAN-1", barcode: null, name: "Torneira Sanitop", description: null, brand: null, unit_label: "un", units_per_pack: 1,
        base_price: 55, currency: "EUR", moq: null, lead_time_days: null, is_active: true, updated_at: "", is_linked: false, is_dismissed: false, links: [] }],
    }, error: null };
    base.respostas.rpc_catalog_link = { data: { item_supplier_id: "is-9", created: false, already_linked: false, codes: [], warnings: [] }, error: null };
    const r = real();
    const anunciar = ficha({ ...PROD, fornecedor: "Sanitop" }, r);
    expect(await screen.findByText(/Fornecedor indicado:/)).toHaveTextContent("Sanitop");
    fireEvent.click(screen.getByRole("button", { name: "ligar ao artigo do portal" }));
    // o nome igual escolhe o fornecedor sozinho e procura no catálogo dele
    expect(await screen.findByText(/Fornecedor: Sanitop/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Ligar SAN-1" }));
    await waitFor(() => expect(base.chamadas.some((c) => c.f === "rpc_catalog_link")).toBe(true));
    expect(base.chamadas.find((c) => c.f === "rpc_supplier_catalog_list")?.a).toMatchObject({ p_supplier_id: SUP, p_filter: "all", p_include_inactive: false });
    expect(base.chamadas.find((c) => c.f === "rpc_catalog_link")?.a).toEqual({
      p_supplier_id: SUP, p_catalog_item_id: "cat-1", p_product_id: PID, p_uom_id: "uom-un", p_apply_catalog_price: true,
    });
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("Artigo SAN-1 ligado"));
  });
  it("sem can_manage_prices não oferece o preço do catálogo e liga sem ele", async () => {
    base.respostas.cat_produto_fornecedores = { data: [], error: null };
    base.tabelas.suppliers = [{ id: SUP, name: "Sanitop" }];
    base.respostas.rpc_supplier_catalog_list = { data: {
      linked_account: true, counts: {}, total: 1, limit: 20, offset: 0, can_link: true, can_view_pricing: true, can_manage_prices: false,
      items: [{ id: "cat-1", supplier_ref: "SAN-1", barcode: null, name: "Torneira Sanitop", description: null, brand: null, unit_label: "un", units_per_pack: 1,
        base_price: 55, currency: "EUR", moq: null, lead_time_days: null, is_active: true, updated_at: "", is_linked: false, is_dismissed: false, links: [] }],
    }, error: null };
    base.respostas.rpc_catalog_link = { data: { item_supplier_id: "is-new", created: true, already_linked: false, codes: [], warnings: [] }, error: null };
    ficha();
    fireEvent.click(await screen.findByRole("button", { name: /Ligar a artigo do fornecedor/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Sanitop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ligar SAN-1" }));
    expect(screen.queryByRole("checkbox", { name: "Usar o preço do catálogo" })).toBeNull();
    await waitFor(() => expect(base.chamadas.some((c) => c.f === "rpc_catalog_link")).toBe(true));
    expect(base.chamadas.find((c) => c.f === "rpc_catalog_link")?.a).toMatchObject({ p_uom_id: null, p_apply_catalog_price: false });
  });
});
