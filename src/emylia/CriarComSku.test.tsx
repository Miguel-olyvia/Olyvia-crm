// 16/11: criar um produto na página real: a pré-visualização da referência (SKU) segue a categoria, a subcategoria e os atributos escolhidos,
// e some quando se escreve uma referência à mão.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.respostas[f] ?? { data: null, error: null }; }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { No } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PC1 = "c0000000-0000-4000-a000-000000000001", PS1 = "50000000-0000-4000-a000-000000000001";
// a árvore do Catálogo usa ids próprios (aqui «c1», «s2»): a pré-visualização resolve a categoria pelo NOME
const ARVORE: No[] = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s2", n: "Torneiras", pai: "c1" }];
const real: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) };
const combo = (ctx: HTMLElement, nome: string) => within(ctx).getByRole("combobox", { name: nome }) as HTMLInputElement;
const escolher = (ctx: HTMLElement, campo: string, opcao: string) => { fireEvent.click(combo(ctx, campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };

beforeEach(() => {
  base.chamadas = [];
  base.respostas = {
    cat_ler_categorias_gestao: { data: { categorias: [{ id: PC1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [{ id: PS1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 0, sigla: "TO" }] }] }, error: null },
    cat_prever_sku: { data: { sku: "BC-TO-0001", faltas: [] }, error: null },
  };
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("criar produto: referência gerada", () => {
  const abrir = () => {
    mudarCatalogo((k) => { k.arvore = structuredClone(ARVORE); });
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    return screen.getByRole("region", { name: "O produto" });
  };
  it("sem categoria pede-a; com categoria e subcategoria mostra a referência com os ids da categoria de produto", async () => {
    const sec = abrir();
    expect(within(sec).getByText(/Escolha a categoria para ver a referência/)).toBeInTheDocument();
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    await waitFor(() => expect(within(sec).getByText(/Referência gerada: BC-TO-0001/)).toBeInTheDocument());
    expect(within(sec).getByText(/a confirmar ao guardar/)).toBeInTheDocument();
    const prever = base.chamadas.filter((c) => c.f === "cat_prever_sku");
    expect(prever.at(-1)?.a).toEqual({ p_org: ORG, p_categoria: PC1, p_subcategoria: PS1, p_atributos: [] });
  });
  it("ao escrever uma referência à mão a pré-visualização cede: fica a que se escreveu", async () => {
    const sec = abrir();
    escolher(sec, "Categoria", "Casa de banho");
    await waitFor(() => expect(within(sec).getByText(/Referência gerada: BC-TO-0001/)).toBeInTheDocument());
    fireEvent.change(within(sec).getByLabelText(/^Referência \(opcional/), { target: { value: "GR-77" } });
    await waitFor(() => expect(within(sec).getByText("Fica a referência que escreveu.")).toBeInTheDocument());
    expect(within(sec).queryByText(/Referência gerada/)).toBeNull();
  });
});
