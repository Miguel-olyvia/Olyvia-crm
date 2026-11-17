// 17/11: o Catálogo debaixo das rotas novas (/catalogo/…): a secção vem da rota, o menu lateral faz de separadores (a barra e o botão «Gestão»
// escondem-se) e abrir uma ficha navega para a rota dela.
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
  it("abre a secção da rota e não mostra os separadores nem o botão «Gestão»", () => {
    pagina({ seccao: "equipamentos" }, seed(), REAL);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gestão" })).toBeNull();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
  it.each([["servicos"], ["produtos"], ["consumiveis"], ["tecnicos"], ["ligacoes"]] as const)("a rota %s abre o painel dessa secção", (seccao) => {
    pagina({ seccao });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", `painel-${seccao}`);
  });
  it("a rota com o id do serviço abre a ficha e o «voltar» navega para a lista dos serviços", () => {
    const S = seed();
    const sid = Object.keys(S.svc)[0];
    const ir = pagina({ seccao: "servicos", servico: sid }, S);
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^Voltar/ })[0]);
    expect(ir).toHaveBeenCalledTimes(1);
    expect(ir.mock.calls[0][0]).toBe("/catalogo/servicos");
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
    expect(screen.queryByRole("tabpanel")).toBeNull();
    window.history.replaceState(null, "", "/catalogo/servicos/tecnicos");
    rerender(el("tecnicos"));
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
