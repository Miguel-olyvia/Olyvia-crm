// A página «Organização» com as abas Estrutura e Chefias (o organograma de pessoas por «reporta a», que já não vive na lista de Pessoas),
// o redirecionamento do endereço antigo e o realce do menu. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { itemAtivo } from "@/components/sidebar/itemAtivo";
import { menuSections } from "@/components/sidebar/menuConfig";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhOrganizacao from "./RhOrganizacao";

function Sonda() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

const renderEm = (endereco: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/organizacao" element={<RhOrganizacao />} />
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
          <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
        </Routes>
        <Sonda />
      </MemoryRouter>
    </LanguageProvider>,
  );

const abaSelecionada = () => screen.getAllByRole("tab").find((a) => a.getAttribute("aria-selected") === "true");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("Organização: abas Estrutura e Chefias", () => {
  it("tem as abas Estrutura e Chefias, com Estrutura por omissão e a árvore da estrutura", () => {
    renderEm("/rh-exemplo/organizacao");
    const abas = screen.getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Estrutura", "Chefias"]);
    expect(abaSelecionada()).toHaveTextContent("Estrutura");
    expect(screen.getByRole("button", { name: /Ligar pessoa/ })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /^Grupo Aurora/ })).toBeInTheDocument();
  });

  it("a aba Chefias mostra a hierarquia por «reporta a» e fica no endereço", () => {
    renderEm("/rh-exemplo/organizacao");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chefias" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Chefias" }));
    expect(screen.getByTestId("url")).toHaveTextContent("/rh-exemplo/organizacao?vista=chefias");
    expect(abaSelecionada()).toHaveTextContent("Chefias");
    expect(screen.queryByRole("treeitem")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ligar pessoa/ })).toBeNull();
    const marta = screen.getByRole("button", { name: /Marta Figueiredo/ });
    const ramo = marta.closest("li")!;
    expect(within(ramo).getByRole("button", { name: /Rui Amaral/ })).toBeInTheDocument();
    expect(within(within(ramo).getByRole("button", { name: /Rui Amaral/ }).closest("li")!).getByRole("button", { name: /Tiago Pinheiro/ })).toBeInTheDocument();
  });

  it("?vista=chefias abre direto a aba Chefias e clicar numa pessoa abre a ficha de RH", () => {
    renderEm("/rh-exemplo/organizacao?vista=chefias");
    expect(abaSelecionada()).toHaveTextContent("Chefias");
    fireEvent.click(screen.getByRole("button", { name: /Rui Amaral/ }));
    expect(screen.getByTestId("url")).toHaveTextContent("/rh-exemplo/pessoas/p-rui");
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
  });

  it("um valor de vista desconhecido cai na Estrutura", () => {
    renderEm("/rh-exemplo/organizacao?vista=outra");
    expect(abaSelecionada()).toHaveTextContent("Estrutura");
  });
});

describe("a lista de Pessoas sem o separador Organograma", () => {
  it("tem Pessoas, Admissões, Cargos e Contratos a terminar, e nenhum Organograma", () => {
    renderEm("/rh-exemplo/pessoas");
    const nomes = screen.getAllByRole("tab").map((a) => a.textContent ?? "");
    expect(nomes).toHaveLength(4);
    expect(nomes.some((n) => /organograma/i.test(n))).toBe(false);
  });

  it("o endereço antigo ?tab=organograma redireciona para a Organização, vista Chefias", () => {
    renderEm("/rh-exemplo/pessoas?tab=organograma");
    expect(screen.getByTestId("url")).toHaveTextContent("/rh-exemplo/organizacao?vista=chefias");
    expect(abaSelecionada()).toHaveTextContent("Chefias");
  });
});

describe("o menu", () => {
  it("«Organização» é a única entrada de organograma e realça em qualquer vista", () => {
    const itens = menuSections.find((s) => s.id === "rh-exemplo")!.items;
    const organizacao = itens.filter((i) => i.to.startsWith("/rh-exemplo/organizacao"));
    expect(organizacao).toHaveLength(1);
    for (const pesquisa of ["", "?vista=estrutura", "?vista=chefias"]) {
      expect(itemAtivo(organizacao[0]!, "/rh-exemplo/organizacao", pesquisa), pesquisa).toBe(true);
    }
    expect(itemAtivo(organizacao[0]!, "/rh-exemplo/pessoas", "?tab=cargos")).toBe(false);
  });
});
