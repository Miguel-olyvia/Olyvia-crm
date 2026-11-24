// 16/11: criar um produto na página real: a pré-visualização da referência (SKU) segue a categoria, a subcategoria, o MODELO e os atributos escolhidos,
// e some quando se escreve uma referência à mão. O campo «Modelo» vem a seguir à subcategoria e só mostra os modelos dela.
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
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { No } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PC1 = "c0000000-0000-4000-a000-000000000001", PS1 = "50000000-0000-4000-a000-000000000001";
const M1 = "e0000000-0000-4000-a000-000000000001", M2 = "e0000000-0000-4000-a000-000000000002";
// a árvore do Catálogo usa ids próprios (aqui «c1», «s2»): a pré-visualização resolve a categoria pelo NOME
const ARVORE: No[] = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s2", n: "Torneiras", pai: "c1" }];
const real: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) };
const combo = (ctx: HTMLElement, nome: string) => within(ctx).getByRole("combobox", { name: new RegExp(`^${nome}( (?!3D)|$)`) }) as HTMLInputElement; // «Modelo» não é o «Modelo 3D», que também está no formulário
const escolher = (ctx: HTMLElement, campo: string, opcao: string) => { fireEvent.click(combo(ctx, campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };

beforeEach(() => {
  base.chamadas = [];
  base.respostas = {
    cat_ler_categorias_gestao: { data: { categorias: [{ id: PC1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [{ id: PS1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 0, sigla: "TO" }] }] }, error: null },
    cat_prever_sku_modelo: { data: { sku: "BC-TO-0001", faltas: [] }, error: null },
  };
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("criar produto: referência gerada", () => {
  /** `comModelos`: a base já tem os modelos (K.modelos, na subcategoria «Torneiras» da árvore do Catálogo, s2). */
  const abrir = (comModelos = false) => {
    mudarCatalogo((k) => { k.arvore = structuredClone(ARVORE); if (comModelos) k.modelos = [{ id: M1, n: "SORTY", numero: 1, sub: "s2", ativo: true }, { id: M2, n: "OUTRO", numero: 1, sub: "outra", ativo: true }]; });
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
    const prever = base.chamadas.filter((c) => c.f === "cat_prever_sku_modelo");
    expect(prever.at(-1)?.a).toEqual({ p_org: ORG, p_categoria: PC1, p_subcategoria: PS1, p_modelo: null, p_atributos: [], p_produto: null });
  });
  it("o campo «Modelo» vem a seguir à Subcategoria, desativado e com a razão até haver subcategoria; depois só mostra os modelos dela", () => {
    const sec = abrir(true);
    const ordem = within(sec).getAllByRole("combobox").map((c) => document.querySelector(`label[for="${c.id}"]`)?.textContent ?? c.getAttribute("aria-label")); // o nome vem do rótulo visível quando o há
    expect(ordem.indexOf("Modelo")).toBe(ordem.indexOf("Subcategoria") + 1);
    expect(combo(sec, "Modelo")).toBeDisabled();
    expect(within(sec).getByText("Escolha primeiro a subcategoria (o modelo é da subcategoria).")).toBeInTheDocument();
    escolher(sec, "Categoria", "Casa de banho");
    expect(combo(sec, "Modelo")).toBeDisabled();
    escolher(sec, "Subcategoria", "Torneiras");
    expect(combo(sec, "Modelo")).toBeEnabled();
    fireEvent.click(combo(sec, "Modelo"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Sem modelo", "0001 · SORTY", "Novo modelo…"]);
  });
  it("escolher o modelo manda-o à pré-visualização; mudar a categoria limpa o modelo", async () => {
    const sec = abrir(true);
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    escolher(sec, "Modelo", "0001 · SORTY");
    await waitFor(() => expect(base.chamadas.filter((c) => c.f === "cat_prever_sku_modelo").at(-1)?.a).toMatchObject({ p_modelo: M1 }));
    escolher(sec, "Categoria", "Sem categoria");
    expect(combo(sec, "Modelo").value).toBe("");
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    expect(combo(sec, "Modelo").value).toBe("");
  });
  it("sem a lista de modelos na base o campo diz «Ainda não disponível nesta base»", () => {
    const sec = abrir(false);
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    expect(combo(sec, "Modelo")).toBeDisabled();
    expect(within(sec).getByText("Ainda não disponível nesta base")).toBeInTheDocument();
  });
  it("um modelo novo fica pendente: nada se grava, a pré-visualização diz que gera ao guardar e o produto criado leva o nome do modelo novo", async () => {
    const sec = abrir(true);
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    fireEvent.click(combo(sec, "Modelo"));
    fireEvent.click(screen.getByRole("option", { name: "Novo modelo…" }));
    fireEvent.change(screen.getByLabelText("Nome do novo modelo"), { target: { value: "Rio" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(within(sec).getByText("O modelo é novo: a referência gera-se ao guardar.")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Torneira Rio" } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Torneira Rio")).toMatchObject({ modeloNovo: "Rio" });
    expect(base.chamadas.map((c) => c.f)).not.toContain("cat_guardar_modelo");
  });
  it("criar com um modelo que já existe leva o id no produto", () => {
    const sec = abrir(true);
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Torneiras");
    escolher(sec, "Modelo", "0001 · SORTY");
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Torneira Sorty" } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Torneira Sorty")).toMatchObject({ modeloId: M1 });
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
