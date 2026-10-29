// 29/10: «Stock e armazéns» na ficha (cat_produto_stock / cat_definir_armazem_produto) e marcar armazéns em lote no Catálogo
// (cat_definir_armazem_produtos). Os produtos gerem sempre stock: os armazéns só dizem onde estão.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
  tabelas: {} as Record<string, unknown[]>,
}));
vi.mock("@/integrations/supabase/client", () => {
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

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PID = uuid(1), W1 = uuid(101), W2 = uuid(102);
const PROD: Produto = { id: PID, n: "Torneira Teste", custo: 60, pvp: 100, un: "un", marca: "", fornecedor: "", data: "2026-10-01", no: null };
const ARM = (o: Record<string, unknown> = {}) => ({
  warehouse_id: W1, nome: "Central", codigo: "C1", ativo: false, quantidade: null, reservado: null, minimo: null, maximo: null, ponto_encomenda: null, localizacao: null, ...o,
});
const real = (o: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: "org-1", podeEditar: true, podeMudarPrecos: true, podeStock: true, recarregar: vi.fn(async () => {}), ...o });
const ficha = (r = real()) => {
  const anunciar = vi.fn();
  render(<FichaProduto p={PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r} />);
  return anunciar;
};

beforeEach(() => {
  base.chamadas = [];
  base.respostas = { cat_produto_fornecedores: { data: [], error: null } };
  base.tabelas = { warehouses: [{ id: W1, name: "Central", code: "C1", is_active: true, serves_customers: true }, { id: W2, name: "Carrinha", code: "V1", is_active: true, serves_customers: false }] };
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("Stock e armazéns · a ficha", () => {
  it("lista os armazéns com «serve clientes»; sem linha «Gere stock» (o stock gere-se sempre)", async () => {
    base.respostas.cat_produto_stock = { data: { gere_stock: false, pode_editar: true, armazens: [ARM(), ARM({ warehouse_id: W2, nome: "Carrinha", codigo: "V1" })] }, error: null };
    ficha();
    const seccao = await screen.findByRole("region", { name: "Stock e armazéns" });
    expect(await within(seccao).findByText(/· serve clientes/)).toHaveTextContent("Não tem este produto · serve clientes");
    await waitFor(() => expect(within(seccao).getByText(/não serve clientes/)).toBeInTheDocument());
    expect(within(seccao).queryByText(/Gere stock/)).toBeNull();
    expect(within(seccao).getByText(/sempre avaliado na encomenda de cliente/)).toBeInTheDocument();
  });
  it("marcar o armazém chama cat_definir_armazem_produto com ativo e relê", async () => {
    base.respostas.cat_produto_stock = { data: { gere_stock: false, pode_editar: true, armazens: [ARM()] }, error: null };
    base.respostas.cat_definir_armazem_produto = { data: { ok: true, motivo: null, gere_stock: true }, error: null };
    const r = real();
    const anunciar = ficha(r);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Central: este armazém tem este produto" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(base.chamadas.find((c) => c.f === "cat_definir_armazem_produto")?.a).toEqual({
      p_product_id: PID, p_warehouse_id: W1, p_ativo: true, p_minimo: null, p_maximo: null, p_ponto_encomenda: null, p_localizacao: null,
    });
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("Central"));
    expect(base.chamadas.filter((c) => c.f === "cat_produto_stock")).toHaveLength(2);
  });
  it("desmarcar bloqueado: mostra a mensagem da base", async () => {
    base.respostas.cat_produto_stock = { data: { gere_stock: true, pode_editar: true, armazens: [ARM({ ativo: true, quantidade: 4 })] }, error: null };
    base.respostas.cat_definir_armazem_produto = { data: null, error: { code: "CT002", message: "Não é possível desligar: o armazém Central ainda tem 4 unidade(s) deste produto. Transfira ou acerte o stock primeiro." } };
    ficha();
    expect(await screen.findByText("4 em stock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Central: este armazém tem este produto" }));
    expect(await screen.findByText(/ainda tem 4 unidade\(s\)/)).toBeInTheDocument();
  });
  it("mínimo, máximo, ponto de encomenda e localização gravam-se no armazém marcado", async () => {
    base.respostas.cat_produto_stock = { data: { gere_stock: true, pode_editar: true, armazens: [ARM({ ativo: true, quantidade: 0 })] }, error: null };
    base.respostas.cat_definir_armazem_produto = { data: { ok: true, motivo: null, gere_stock: true }, error: null };
    ficha();
    fireEvent.change(await screen.findByRole("textbox", { name: "Mínimo em Central" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Ponto de encomenda em Central" }), { target: { value: "5" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Localização em Central" }), { target: { value: "Corredor A" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(base.chamadas.some((c) => c.f === "cat_definir_armazem_produto")).toBe(true));
    expect(base.chamadas.find((c) => c.f === "cat_definir_armazem_produto")?.a).toEqual({
      p_product_id: PID, p_warehouse_id: W1, p_ativo: true, p_minimo: 2, p_maximo: null, p_ponto_encomenda: 5, p_localizacao: "Corredor A",
    });
  });
  it("sem pode_editar só se lê", async () => {
    base.respostas.cat_produto_stock = { data: { gere_stock: true, pode_editar: false, armazens: [ARM({ ativo: true, quantidade: 3 })] }, error: null };
    ficha();
    expect(await screen.findByRole("checkbox", { name: "Central: este armazém tem este produto" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Mínimo em Central" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });
  it("sem a função na base: «Ainda não disponível nesta base»", async () => {
    base.respostas.cat_produto_stock = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_produto_stock" } };
    ficha();
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
  });
});

describe("Stock e armazéns · marcar em lote no Catálogo", () => {
  const pagina = (r?: FichaProdutoReal) => {
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r} />);
  };
  const juntar = () => mudarCatalogo((k) => {
    k.produtos = [
      { ...PROD, id: uuid(1), n: "Torneira lavatório" }, { ...PROD, id: uuid(2), n: "Torneira cozinha" }, { ...PROD, id: uuid(3), n: "Sifão" },
    ];
  });
  it("Selecionar → todos os filtrados (respeita a pesquisa) → Marcar armazém manda esses ids; os recusados aparecem com o motivo", async () => {
    juntar();
    base.respostas.cat_definir_armazem_produtos = { data: { ok: true, alterados: 1, gere_stock_ligados: 1, gere_stock_desligados: 0, recusados: [{ product_id: uuid(2), nome: "Torneira cozinha", motivo: "Produto apagado." }] }, error: null };
    const r = real();
    pagina(r);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "torneira" } });
    fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todos os filtrados (2)" }));
    expect(screen.getByRole("checkbox", { name: "Selecionar Torneira lavatório" })).toBeChecked();
    // no modo Selecionar, tocar na linha marca/desmarca (não abre a ficha)
    const linha = screen.getByRole("checkbox", { name: "Selecionar Torneira cozinha" }).closest("li")!;
    fireEvent.click(linha); fireEvent.click(linha);
    expect(screen.queryByRole("heading", { level: 1, name: "Torneira cozinha" })).toBeNull();
    const barra = screen.getByRole("region", { name: "Marcar armazéns" });
    await waitFor(() => expect(within(barra).getByRole("option", { name: /^Central/ })).toBeInTheDocument());
    fireEvent.change(within(barra).getByRole("combobox", { name: "Armazém" }), { target: { value: W1 } });
    fireEvent.click(within(barra).getByRole("button", { name: "Marcar armazém" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    const a = base.chamadas.find((c) => c.f === "cat_definir_armazem_produtos")!.a;
    expect({ ...a, p_product_ids: [...(a.p_product_ids as string[])].sort() }).toEqual({ p_product_ids: [uuid(1), uuid(2)], p_warehouse_id: W1, p_ativo: true });
    const recusados = within(barra).getByRole("list", { name: "Recusados" });
    expect(recusados).toHaveTextContent("Torneira cozinha — Produto apagado.");
    expect(barra).not.toHaveTextContent(/gere stock/i);
  });
  it("sem inventory.edit não há «Selecionar»; tocar na linha abre a ficha", () => {
    juntar();
    pagina(real({ podeStock: false }));
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    expect(screen.queryByRole("button", { name: "Selecionar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sifão" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sifão" })).toBeInTheDocument();
  });
  it("os consumíveis também: a linha abre a ficha do consumível e há «Selecionar»", () => {
    pagina(real());
    fireEvent.click(screen.getByRole("tab", { name: "Consumíveis" }));
    expect(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Selecionar" })).toBeInTheDocument();
    const nome = within(screen.getByRole("tabpanel")).getAllByRole("listitem")[0].querySelector("button")!;
    const n = nome.textContent!;
    fireEvent.click(nome);
    expect(screen.getByRole("heading", { level: 1, name: n })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Custo" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "PVP" })).toBeNull();
  });
});
