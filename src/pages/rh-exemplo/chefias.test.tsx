// A página «Organização» num só organograma: a árvore da estrutura com as PESSOAS dentro (debaixo do centro onde trabalham),
// as chefias como informação da pessoa («Chefia», «Reporta a», subordinados por baixo), a pesquisa que encontra pessoas,
// a ficha de RH, os redirecionamentos dos endereços antigos e o título «Pessoas» da lista. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { itemAtivo } from "@/components/sidebar/itemAtivo";
import { menuSections } from "@/components/sidebar/menuConfig";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { definirOrganizacao, lerOrganizacao } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhOrganizacao from "./RhOrganizacao";

// A leitura e a gravacao reais testam-se em useOrganizacaoReal.test.ts; aqui a pagina corre sobre dados de exemplo em memoria.
vi.mock("@/components/rh-exemplo/organizacao/useOrganizacaoReal", async () => {
  const m = await import("@/components/rh-exemplo/organizacao/organizacaoEmMemoria");
  return { useOrganizacaoReal: m.useOrganizacaoEmMemoria };
});

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

const item = (nome: RegExp | string) => screen.getByRole("treeitem", { name: nome });
const nomesDosItens = () => screen.getAllByRole("treeitem").map((i) => i.getAttribute("aria-labelledby"));
/** Os filhos directos (um nível abaixo) de um item da árvore. */
const grupoDe = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>(":scope > [role=group]")!;
const filhosDe = (el: HTMLElement): HTMLElement[] => Array.from(grupoDe(el).children).filter((f): f is HTMLElement => f.getAttribute("role") === "treeitem");

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("Organização: um só organograma, sem abas", () => {
  it("não tem abas Estrutura nem Chefias, e mostra a árvore e «Ligar pessoa» como botão primário", () => {
    renderEm("/rh-exemplo/organizacao");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByText("Chefias", { selector: "[role=tab] *, [role=tab]" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Organização" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ligar pessoa/ })).toBeInTheDocument();
    expect(item(/^Grupo Aurora/)).toBeInTheDocument();
  });

  it("as pessoas estão dentro dos centros onde trabalham (15 pessoas ligadas, uma folha cada)", () => {
    renderEm("/rh-exemplo/organizacao");
    expect(nomesDosItens()).toHaveLength(15 + 15);
    const colombo = item(/^Loja Colombo/);
    for (const nome of ["Rui Amaral", "Carolina Matos", "Marco Ventura"]) {
      expect(within(colombo).getByRole("treeitem", { name: new RegExp(`^${nome}`) })).toBeInTheDocument();
    }
    // O Tiago tem vínculo na Filial Lisboa mas trabalha em Faro: aparece em Faro, não em Colombo.
    expect(within(item(/^Loja Faro/)).getByRole("treeitem", { name: /^Tiago Pinheiro/ })).toBeInTheDocument();
    expect(within(colombo).queryByRole("treeitem", { name: /^Tiago Pinheiro/ })).toBeNull();
  });

  it("a pessoa mostra o cargo, o chip «Chefia» quando tem equipa e «Reporta a: <nome>»", () => {
    renderEm("/rh-exemplo/organizacao");
    const rui = item(/^Rui Amaral/);
    const linhaRui = rui.querySelector("[id^='rhOrg-no-']") as HTMLElement;
    expect(within(linhaRui).getByText("Gerente de Loja")).toBeInTheDocument();
    expect(within(linhaRui).getByText("Chefia")).toBeInTheDocument();
    expect(within(linhaRui).getByText("Reporta a: Marta Figueiredo")).toBeInTheDocument();
    const marta = item(/^Marta Figueiredo/).querySelector("[id^='rhOrg-no-']") as HTMLElement;
    expect(within(marta).getByText("Chefia")).toBeInTheDocument();
    expect(within(marta).queryByText(/^Reporta a/)).toBeNull();
    const tiago = item(/^Tiago Pinheiro/).querySelector("[id^='rhOrg-no-']") as HTMLElement;
    expect(within(tiago).queryByText("Chefia")).toBeNull();
    expect(within(tiago).getByText("Reporta a: Rui Amaral")).toBeInTheDocument();
  });

  it("mantém o chip «Vínculo legal: Filial X» só em quem trabalha noutra filial", () => {
    renderEm("/rh-exemplo/organizacao");
    const tiago = item(/^Tiago Pinheiro/);
    expect(within(tiago).getByText("Vínculo legal: Filial Lisboa")).toBeInTheDocument();
    expect(within(item(/^Rui Amaral/).querySelector("[id^='rhOrg-no-']") as HTMLElement).queryByText(/^Vínculo legal/)).toBeNull();
  });

  it("dentro do centro a chefia vem primeiro e quem reporta a ela fica por baixo, com recuo", () => {
    renderEm("/rh-exemplo/organizacao");
    const colombo = item(/^Loja Colombo/);
    const unicas = filhosDe(colombo);
    // A Marta (Sede) não está em Colombo: o Rui é a raiz do centro e a Carolina e o Marco estão por baixo dele.
    expect(unicas[0]!.getAttribute("aria-labelledby")).toBe("rhOrg-no-pessoa:p-rui");
    const rui = unicas[0]!;
    expect(rui.getAttribute("aria-level")).toBe("5");
    const equipa = filhosDe(rui);
    expect(equipa.map((e) => e.getAttribute("data-no"))).toEqual(["pessoa:p-carolina", "pessoa:p-marco"]);
    expect(equipa.every((e) => e.getAttribute("aria-level") === "6")).toBe(true);
    expect(within(equipa[0]!).getByText("Reporta a: Rui Amaral")).toBeInTheDocument();
    expect(unicas).toHaveLength(1);
    // Está dentro de um grupo (lista aninhada), e não ao lado do Rui.
    expect(equipa[0]!.closest("[role=group]")).toBe(grupoDe(rui));
  });

  it("uma pessoa com vínculo mas sem centro aparece em «Sem centro atribuído», debaixo da filial", () => {
    const antes = lerOrganizacao();
    const lig = antes.ligacoes.find((l) => l.pessoaId === "p-hugo")!;
    act(() => definirOrganizacao({ ...antes, ligacoes: antes.ligacoes.map((l) => (l === lig ? { ...l, centroId: "" } : l)) }));
    renderEm("/rh-exemplo/organizacao");
    const semCentro = screen.getByRole("treeitem", { name: /^Sem centro atribuído/ });
    expect(semCentro.getAttribute("data-no")).toBe("semcentro:fil-porto");
    expect(item(/^Filial Porto/)).toContainElement(semCentro);
    expect(semCentro.textContent).toContain("1 pessoa");
    expect(within(semCentro).getByRole("treeitem", { name: /^Hugo Teixeira/ })).toBeInTheDocument();
    expect(within(item(/^Loja Porto/)).queryByRole("treeitem", { name: /^Hugo Teixeira/ })).toBeNull();
  });

  it("a pesquisa encontra uma pessoa e expande o caminho até ela", () => {
    renderEm("/rh-exemplo/organizacao");
    fireEvent.click(screen.getByRole("button", { name: "Recolher tudo" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar por nome" }), { target: { value: "tiago" } });
    const ids = screen.getAllByRole("treeitem").map((i) => i.getAttribute("data-no"));
    expect(ids).toEqual(["org-grupo-aurora", "emp-aurora-climatizacao", "fil-faro", "loc-faro", "pessoa:p-tiago"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar por nome" }), { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhuma pessoa ou nó corresponde à pesquisa.")).toBeInTheDocument();
  });

  it("clicar numa pessoa abre a ficha de RH; clicar num centro abre o painel do nó", () => {
    renderEm("/rh-exemplo/organizacao");
    fireEvent.click(screen.getByText("Rui Amaral"));
    expect(screen.getByTestId("url")).toHaveTextContent("/rh-exemplo/pessoas/p-rui");
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
    cleanup();
    renderEm("/rh-exemplo/organizacao");
    fireEvent.click(screen.getByText("Loja Faro"));
    expect(screen.getByTestId("url")).toHaveTextContent("/rh-exemplo/organizacao");
    expect(within(screen.getByRole("dialog")).getByRole("tab", { name: "Trabalham aqui" })).toBeInTheDocument();
  });

  it("no teclado, Enter numa pessoa abre a ficha e as setas descem do centro à pessoa", () => {
    renderEm("/rh-exemplo/organizacao");
    const centro = item(/^Loja Faro/);
    centro.focus();
    fireEvent.keyDown(centro, { key: "ArrowRight" });
    const primeira = filhosDe(centro)[0]!;
    expect(document.activeElement).toBe(primeira);
    fireEvent.keyDown(primeira, { key: "Enter" });
    expect(screen.getByTestId("url").textContent).toMatch(/^\/rh-exemplo\/pessoas\/p-/);
  });
});

describe("os endereços antigos", () => {
  it("?vista=chefias e ?vista=estrutura redirecionam para /rh-exemplo/organizacao", () => {
    renderEm("/rh-exemplo/organizacao?vista=chefias");
    expect(screen.getByTestId("url").textContent).toBe("/rh-exemplo/organizacao");
    expect(screen.getByRole("tree")).toBeInTheDocument();
    cleanup();
    renderEm("/rh-exemplo/organizacao?vista=estrutura");
    expect(screen.getByTestId("url").textContent).toBe("/rh-exemplo/organizacao");
  });

  it("/rh-exemplo/pessoas?tab=organograma redireciona para /rh-exemplo/organizacao", () => {
    renderEm("/rh-exemplo/pessoas?tab=organograma");
    expect(screen.getByTestId("url").textContent).toBe("/rh-exemplo/organizacao");
    expect(screen.getByRole("tree")).toBeInTheDocument();
  });
});

describe("a lista de Pessoas", () => {
  it("chama-se «Pessoas» (e não «Organização») e mantém Pessoas, Admissões, Cargos e Contratos a terminar", () => {
    renderEm("/rh-exemplo/pessoas");
    expect(screen.getByRole("heading", { level: 1, name: /^Pessoas/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /Organização/ })).toBeNull();
    expect(screen.getByText(/As pessoas como trabalhadores: filial, contrato, horário\. Não são os utilizadores da plataforma\./)).toBeInTheDocument();
    const nomes = screen.getAllByRole("tab").map((a) => a.textContent ?? "");
    expect(nomes).toHaveLength(4);
    expect(nomes.some((n) => /organograma/i.test(n))).toBe(false);
  });

  it("o separador «Admissões» mostra o contador de admissões por aprovar", () => {
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    const aba = screen.getByRole("tab", { name: /Admissões/ });
    expect(aba).toHaveAttribute("aria-selected", "true");
    expect(aba.textContent).toContain("1");
    expect(within(aba).getByText(", 1 por aprovar")).toBeInTheDocument();
  });
});

describe("o menu", () => {
  it("«Organização» é a única entrada de organograma e realça em qualquer endereço da página", () => {
    const itens = menuSections.find((s) => s.id === "rh-exemplo")!.items;
    const organizacao = itens.filter((i) => i.to.startsWith("/rh-exemplo/organizacao"));
    expect(organizacao).toHaveLength(1);
    for (const pesquisa of ["", "?vista=estrutura", "?vista=chefias"]) {
      expect(itemAtivo(organizacao[0]!, "/rh-exemplo/organizacao", pesquisa), pesquisa).toBe(true);
    }
    expect(itemAtivo(organizacao[0]!, "/rh-exemplo/pessoas", "?tab=cargos")).toBe(false);
  });
});
