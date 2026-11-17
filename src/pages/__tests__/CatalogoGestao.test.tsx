// 17/11: cada página de gestão do Catálogo (/catalogo/produtos/categorias, …) monta o seu componente, com a organização ativa e as permissões,
// sem passar pela leitura pesada do Catálogo (cat_ler_catalogo).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const org = vi.hoisted(() => ({ id: "org-1" as string | null, loading: false }));
const perms = vi.hoisted(() => ({ tem: (_: string) => true }));
const reais = vi.hoisted(() => ({ ultimo: {} as Record<string, unknown> }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: org.id ? { id: org.id } : null, isLoading: org.loading }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (p: string) => perms.tem(p) }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => { throw new Error("a página de gestão não lê o Catálogo inteiro"); }) } }));
vi.mock("@/emylia/GestaoCategorias", () => ({ GestaoCategorias: (p: { real: unknown }) => { reais.ultimo = p.real as Record<string, unknown>; return <div data-testid="gestao">categorias</div>; } }));
vi.mock("@/emylia/GestaoSubcategorias", () => ({ GestaoSubcategorias: () => <div data-testid="gestao">subcategorias</div> }));
vi.mock("@/emylia/GestaoModelos", () => ({ GestaoModelos: () => <div data-testid="gestao">modelos</div> }));
vi.mock("@/emylia/GestaoMarcas", () => ({ GestaoMarcas: () => <div data-testid="gestao">marcas</div> }));
vi.mock("@/emylia/GestaoAtributos", () => ({ GestaoAtributos: (p: { embutido?: boolean }) => <div data-testid="gestao">atributos{p.embutido ? "-embutido" : ""}</div> }));
vi.mock("@/emylia/GestaoSku", () => ({
  GestaoSku: (p: { irPara: (s: "categorias" | "subcategorias") => void }) => (
    <div data-testid="gestao">sku<button type="button" onClick={() => p.irPara("subcategorias")}>ir</button></div>
  ),
}));

import CatalogoGestao from "../CatalogoGestao";
import type { SeparadorGestao } from "@/emylia/GestaoCatalogo";
import { catalogoDesatualizado, marcarCatalogoAtualizado } from "@/emylia/v2/catalogoStore";

const Sitio = () => <p data-testid="sitio">{useLocation().pathname}</p>;
afterEach(() => { marcarCatalogoAtualizado(); cleanup(); org.id = "org-1"; org.loading = false; perms.tem = () => true; reais.ultimo = {}; });

const montar = (separador: SeparadorGestao) =>
  render(
    <MemoryRouter initialEntries={["/catalogo/produtos/x"]}>
      <Routes>
        <Route path="/catalogo/produtos/x" element={<CatalogoGestao separador={separador} />} />
        <Route path="*" element={<Sitio />} />
      </Routes>
    </MemoryRouter>,
  );

describe("CatalogoGestao: cada página abre o componente certo", () => {
  it.each([
    ["categorias", "categorias", "Categorias"], ["subcategorias", "subcategorias", "Subcategorias"], ["modelos", "modelos", "Modelos"],
    ["marcas", "marcas", "Marcas"], ["atributos", "atributos-embutido", "Atributos"], ["sku", "sku", "Referência (SKU)"],
  ] as const)("%s", (separador, texto, titulo) => {
    montar(separador);
    expect(screen.getByTestId("gestao")).toHaveTextContent(new RegExp(`^${texto}`));
    expect(screen.getAllByTestId("gestao")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
  });

  it("passa a organização ativa e as permissões do Catálogo (e o recarregar não lê nada)", async () => {
    perms.tem = (p) => p === "products.edit" || p === "products.view_cost";
    montar("categorias");
    expect(reais.ultimo).toMatchObject({ org: "org-1", podeEditar: true, podeMudarPrecos: false, podeStock: false, podeVerCusto: true });
    await expect((reais.ultimo.recarregar as () => Promise<void>)()).resolves.toBeUndefined();
  });

  it("recarregar marca o Catálogo partilhado como desatualizado, sem o ler de novo (nenhuma chamada à base)", async () => {
    montar("categorias");
    expect(catalogoDesatualizado()).toBe(false);
    await (reais.ultimo.recarregar as () => Promise<void>)();
    expect(catalogoDesatualizado()).toBe(true);
  });

  it("a Referência (SKU) leva às páginas de Categorias e Subcategorias pelas rotas", () => {
    montar("sku");
    fireEvent.click(screen.getByRole("button", { name: "ir" }));
    expect(screen.getByTestId("sitio")).toHaveTextContent("/catalogo/produtos/subcategorias");
  });

  it("sem organização ativa, diz-o e não monta a gestão", () => {
    org.id = null;
    montar("marcas");
    expect(screen.getByText("Escolha uma organização para ver o Catálogo e custos.")).toBeInTheDocument();
    expect(screen.queryByTestId("gestao")).toBeNull();
  });

  it("enquanto a organização carrega, mostra «A carregar…»", () => {
    org.loading = true;
    montar("marcas");
    expect(screen.getByText("A carregar…")).toBeInTheDocument();
    expect(screen.queryByTestId("gestao")).toBeNull();
  });
});
