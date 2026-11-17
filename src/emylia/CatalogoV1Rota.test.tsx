// 17/11: o Catálogo debaixo das rotas novas (/catalogo/…): a secção vem da rota, os separadores do grupo (Produtos ou Serviços) estão sempre visíveis e cada um é uma rota,
// o botão «Gestão» esconde-se e abrir uma ficha navega para a rota dela (com os separadores à vista).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnderecoAtivo } from "@/lib/paramUrl";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { RotaCatalogo } from "./catalogoRotas";
import type { FichaProdutoReal } from "./fichaProdutoDados";

afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

const REAL: FichaProdutoReal = { org: "org-1", podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined) };
function pagina(rota: Omit<RotaCatalogo, "ir">, S: Estado = seed(), real?: FichaProdutoReal) {
  const ir = vi.fn();
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} rota={{ ...rota, ir }} real={real} />);
  return ir;
}

describe("CatalogoV1 com a rota a mandar", () => {
  it("abre a secção da rota, com os separadores dos Serviços visíveis (Equipamentos selecionado) e sem o botão «Gestão»", () => {
    pagina({ seccao: "equipamentos" }, seed(), REAL);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lista", "Equipamentos", "Consumíveis", "Técnicos", "Ligações"]);
    expect(screen.getByRole("tab", { name: "Equipamentos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Gestão" })).toBeNull();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
  it("na página Produtos, os separadores são os de Produtos, com a Lista selecionada", () => {
    pagina({ seccao: "produtos" });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lista", "Categorias", "Subcategorias", "Modelos", "Marcas", "Atributos", "Referência (SKU)"]);
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
  });
  it("clicar num separador navega para a rota dele", () => {
    const ir = pagina({ seccao: "servicos" });
    fireEvent.click(screen.getByRole("tab", { name: "Ligações" }));
    expect(ir).toHaveBeenCalledWith("/catalogo/servicos/ligacoes");
    fireEvent.click(screen.getByRole("tab", { name: "Técnicos" }));
    expect(ir).toHaveBeenLastCalledWith("/catalogo/servicos/tecnicos");
  });
  it("a rota das Ligações abre o painel das ligações com o separador Ligações selecionado", () => {
    pagina({ seccao: "ligacoes" });
    expect(screen.getByRole("tab", { name: "Ligações" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "painel-ligacoes");
  });
  it.each([["servicos"], ["produtos"], ["consumiveis"], ["tecnicos"], ["ligacoes"]] as const)("a rota %s abre o painel dessa secção", (seccao) => {
    pagina({ seccao });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", `painel-${seccao}`);
  });
  it("a rota com o id do serviço abre a ficha e o «voltar» navega para a lista dos serviços", () => {
    const S = seed();
    const sid = Object.keys(S.svc)[0];
    const ir = pagina({ seccao: "servicos", servico: sid }, S);
    // a ficha abre dentro da página, com os separadores visíveis (Lista selecionada)
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getAllByRole("button", { name: /^Voltar/ })[0]);
    expect(ir).toHaveBeenCalledTimes(1);
    expect(ir.mock.calls[0][0]).toBe("/catalogo/servicos");
  });
  it("a ficha de um produto também abre com os separadores dos Produtos visíveis", () => {
    pagina({ seccao: "produtos", produto: "p-1" });
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
  });
  it("abrir um serviço da lista navega para a rota da ficha", () => {
    const S = seed();
    const ir = pagina({ seccao: "servicos" }, S);
    fireEvent.click(screen.getAllByRole("button", { name: /^Canalização/ })[0]);
    expect(ir).toHaveBeenCalledTimes(1);
    expect(ir.mock.calls[0][0]).toMatch(/^\/catalogo\/servicos\/[^/]+$/);
  });
  it("?criar=produto na pesquisa abre o Criar no lugar da lista (o endereço antigo traduzido)", () => {
    window.history.replaceState(null, "", "/catalogo/produtos?criar=produto");
    const S = seed();
    const run = (fn: () => void) => fn();
    render(<EnderecoAtivo.Provider value="pesquisa"><CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} rota={{ seccao: "produtos", ir: vi.fn() }} /></EnderecoAtivo.Provider>);
    expect(screen.queryByRole("tabpanel")).toBeNull();
    window.history.replaceState(null, "", "/");
  });
  it("o Criar aberto (?criar=) fecha ao navegar pelo menu para outra rota irmã", () => {
    window.history.replaceState(null, "", "/catalogo/produtos?criar=produto");
    const S = seed();
    const run = (fn: () => void) => fn();
    const el = (seccao: "produtos" | "equipamentos") => (
      <EnderecoAtivo.Provider value="pesquisa"><CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} rota={{ seccao, ir: vi.fn() }} /></EnderecoAtivo.Provider>
    );
    const { rerender } = render(el("produtos"));
    expect(screen.queryByRole("tabpanel")).toBeNull();
    window.history.replaceState(null, "", "/catalogo/servicos/equipamentos");
    rerender(el("equipamentos"));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "painel-equipamentos");
    window.history.replaceState(null, "", "/");
  });
  it("a ficha de consumível aberta (?consumivel=) fecha ao navegar para outra rota irmã", () => {
    window.history.replaceState(null, "", "/catalogo/servicos/consumiveis?consumivel=Cola");
    const S = seed();
    const run = (fn: () => void) => fn();
    const el = (seccao: "consumiveis" | "tecnicos") => (
      <EnderecoAtivo.Provider value="pesquisa"><CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} rota={{ seccao, ir: vi.fn() }} /></EnderecoAtivo.Provider>
    );
    const { rerender } = render(el("consumiveis"));
    // a ficha está aberta (o «Voltar» dela), dentro da página e com os separadores visíveis
    expect(screen.getAllByRole("button", { name: /^Voltar/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    window.history.replaceState(null, "", "/catalogo/servicos/tecnicos");
    rerender(el("tecnicos"));
    expect(screen.queryByRole("button", { name: /^Voltar/ })).toBeNull();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "painel-tecnicos");
    window.history.replaceState(null, "", "/");
  });
  it("sem a rota (protótipo), continua com os seis separadores", () => {
    const S = seed();
    const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });
});
