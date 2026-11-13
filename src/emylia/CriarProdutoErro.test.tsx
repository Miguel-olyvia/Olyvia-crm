// 13/11: criar um produto cuja categoria/subcategoria nova não se pode juntar à árvore não é um clique morto: mostra o erro (REACT-M2).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn() } }));
vi.mock("./ramoProduto", async (orig) => {
  const m = await orig<typeof import("./ramoProduto")>();
  return { ...m, ramoParaCriar: vi.fn(() => ({ ok: false as const, erro: "Já existe «Rega» aqui." })) };
});

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";

afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("criar produto: erro do ramo", () => {
  it("mostra a mensagem em alerta, não cria o produto e limpa o aviso ao mexer no ramo", () => {
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Mangueira" } });
    fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "12" } });
    fireEvent.click(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByRole("button", { name: "Criar o produto" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe «Rega» aqui.");
    expect(lerCatalogo().produtos.some((p) => p.n === "Mangueira")).toBe(false);
    // mexer na classificação tira o aviso (já não vale)
    fireEvent.click(screen.getByRole("combobox", { name: "Categoria" }));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
