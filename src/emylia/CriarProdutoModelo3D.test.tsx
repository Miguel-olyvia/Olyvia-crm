// Criar um produto (página real): a secção «Modelo 3D» tem o seletor com «Automático (herda: …)» e o texto de herança a seguir à categoria/subcategoria
// escolhidas; o modelo escolhido segue com o produto novo (Produto.modelo3d) para o plano de gravação (cat_definir_modelo_3d, ver real/gravarModelo3dNovo.test.ts).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ respostas: {} as Record<string, { data: unknown; error: unknown }> }));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { rpc: vi.fn(async (f: string) => base.respostas[f] ?? { data: null, error: null }), from: vi.fn(() => cadeia()) } };
});

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { No } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ARVORE: No[] = [
  { id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" },
  { id: "s2", n: "Sanitas", pai: "c1", modelo3d: "sanita" },
  { id: "s3", n: "Peças soltas", pai: "c1" },
];
const real: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) };
const combo = (ctx: HTMLElement, nome: string) => within(ctx).getByRole("combobox", { name: new RegExp(`^${nome}( |$)`) }) as HTMLInputElement;
const escolher = (ctx: HTMLElement, campo: string, opcao: string) => { fireEvent.click(combo(ctx, campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };
const seletor = () => screen.getByRole("combobox", { name: /^Modelo 3D/ });
const escolherModelo = (nome: string | null) => { fireEvent.click(seletor()); fireEvent.click(nome === null ? screen.getAllByRole("option")[0] : screen.getByRole("option", { name: nome })); };

beforeEach(() => { base.respostas = { cat_prever_sku_modelo: { data: { sku: "X", faltas: [] }, error: null } }; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

const abrir = (r: FichaProdutoReal | null = real, arvore: No[] = ARVORE) => {
  mudarCatalogo((k) => { k.arvore = structuredClone(arvore); });
  const S = seed(), run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r ?? undefined} />);
  fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
  fireEvent.click(screen.getByRole("button", { name: "Criar" }));
  return screen.getByRole("region", { name: "O produto" });
};

describe("criar produto: Modelo 3D", () => {
  it("o seletor está na secção «Modelo 3D», com «Automático» e a herança de quem classifica o produto", () => {
    const sec = abrir();
    expect(seletor()).toHaveTextContent(/Automático/);
    expect(screen.getByRole("heading", { level: 3, name: "Modelo 3D" })).toBeInTheDocument();
    expect(screen.getByText(/Sem escolha: o 3D usa o classificador/)).toBeInTheDocument();
    escolher(sec, "Categoria", "Casa de banho");
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
    escolher(sec, "Subcategoria", "Sanitas");
    expect(screen.getByText("Herdado da subcategoria Sanitas: Sanita de chão.")).toBeInTheDocument();
    escolher(sec, "Subcategoria", "Peças soltas");
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
  });

  it("o modelo escolhido segue com o produto novo (e a escolha manda sobre o herdado)", () => {
    const sec = abrir();
    escolher(sec, "Categoria", "Casa de banho");
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Peça misteriosa X1" } });
    escolherModelo("Bidé");
    expect(screen.getByText("Escolhido neste produto: Bidé.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Peça misteriosa X1")?.modelo3d).toBe("bide");
  });

  it("sem escolher nada o produto novo não leva a chave (herda)", () => {
    const sec = abrir();
    escolher(sec, "Categoria", "Casa de banho");
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Peça misteriosa X2" } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    const p = lerCatalogo().produtos.find((x) => x.n === "Peça misteriosa X2");
    expect(p).toBeDefined();
    expect("modelo3d" in p!).toBe(false);
  });

  it("sem a chave na árvore (migração por aplicar), o seletor aparece em «Automático»", () => {
    abrir(real, ARVORE.map(({ modelo3d: _m, ...x }) => x));
    expect(seletor()).toHaveTextContent(/Automático/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sem página real (o protótipo) não há seletor: não havia onde gravar", () => {
    abrir(null);
    expect(screen.queryByRole("combobox", { name: "Modelo 3D" })).toBeNull();
  });
});
