import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import { CHAVE_VISTA } from "@/components/negocio-metas/vistaGuardada";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(`{${k}}`, String(v));
        });
        return texto;
      },
    }),
  };
});

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const renderPage = () => render(<MemoryRouter><NegocioMetas /></MemoryRouter>);
const estado = () => screen.getByRole("status").textContent;
const escolher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const abrirFiltros = () => fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
const teclar = (key: string) => fireEvent.keyDown(document.body, { key });

beforeEach(() => window.localStorage.clear());

describe("Os meus | Todos", () => {
  it("começa em Todos e Os meus filtra pelo comercial atual", () => {
    renderPage();
    const grupo = screen.getByRole("group", { name: "Mostrar" });
    const meus = within(grupo).getByRole("button", { name: "Os meus" });
    const todos = within(grupo).getByRole("button", { name: "Todos" });
    expect(todos).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(meus);
    expect(meus).toHaveAttribute("aria-pressed", "true");
    expect(todos).toHaveAttribute("aria-pressed", "false");
    expect(estado()).toBe("3 negócios");
    fireEvent.click(todos);
    expect(estado()).toBe("10 negócios");
  });

  it("os chips das vistas contam já com Os meus", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Os meus" }));
    expect(screen.getByRole("button", { name: /^Para enviar/ })).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: /^Em Financeiro/ })).toHaveTextContent("2");
  });
});

describe("botão Filtros e filtros avançados", () => {
  it("abre o painel com serviço, orçamentos e valor e mostra quantos filtros há", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    abrirFiltros();
    escolher("Serviço", "Cozinha");
    expect(estado()).toBe("2 negócios");
    expect(screen.getByRole("button", { name: "Filtros (1)" })).toBeInTheDocument();
    escolher("Número de orçamentos", "2+");
    expect(estado()).toBe("1 negócio");
    escolher("Valor", "10a20");
    expect(estado()).toBe("1 negócio");
    expect(screen.getByRole("button", { name: "Filtros (3)" })).toBeInTheDocument();
  });

  it("cada filtro vira um chip que se tira, e há Limpar tudo", () => {
    renderPage();
    abrirFiltros();
    escolher("Serviço", "Cozinha");
    fireEvent.click(screen.getByRole("button", { name: "Os meus" }));
    const ativos = screen.getByRole("group", { name: "Filtros ativos" });
    expect(within(ativos).getByRole("button", { name: "Tirar o filtro: Serviço: Cozinha" })).toBeInTheDocument();
    expect(estado()).toBe("1 negócio");
    fireEvent.click(within(ativos).getByRole("button", { name: "Tirar o filtro: Os meus" }));
    expect(estado()).toBe("2 negócios");
    fireEvent.click(within(screen.getByRole("group", { name: "Filtros ativos" })).getByRole("button", { name: "Limpar tudo" }));
    expect(estado()).toBe("10 negócios");
    expect(screen.queryByRole("group", { name: "Filtros ativos" })).not.toBeInTheDocument();
  });

  it("sem resultados mostra a mensagem e a ação de limpar", () => {
    renderPage();
    abrirFiltros();
    escolher("Serviço", "Cozinha");
    escolher("Valor", "ate10");
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar pesquisa e filtros" }));
    expect(estado()).toBe("10 negócios");
  });
});

describe("estado vazio por coluna", () => {
  it("cada fase sem negócios diz que está vazia", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Os meus" }));
    expect(screen.getAllByText("Nenhum negócio nesta fase")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Limpar filtros" })).toHaveLength(2);
  });
});

describe("atalhos de teclado", () => {
  it("/ leva o foco à pesquisa", () => {
    renderPage();
    teclar("/");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("Esc na pesquisa limpa-a", () => {
    renderPage();
    const pesquisa = screen.getByRole("searchbox");
    fireEvent.change(pesquisa, { target: { value: "zzz" } });
    expect(estado()).toBe("0 negócios");
    fireEvent.keyDown(pesquisa, { key: "Escape" });
    expect(pesquisa).toHaveValue("");
    expect(estado()).toBe("10 negócios");
  });

  it("setas movem o foco entre cartões e colunas", () => {
    renderPage();
    teclar("ArrowDown");
    expect(document.activeElement).toHaveAccessibleName(/Tiago Rocha/);
    teclar("ArrowRight");
    expect(document.activeElement).toHaveAccessibleName(/Nuno Barros/);
    teclar("ArrowDown");
    expect(document.activeElement).toHaveAccessibleName(/Clara Dias/);
    teclar("ArrowUp");
    expect(document.activeElement).toHaveAccessibleName(/Nuno Barros/);
    teclar("ArrowLeft");
    expect(document.activeElement).toHaveAccessibleName(/Tiago Rocha/);
  });

  it("as setas não se metem quando se escreve na pesquisa", () => {
    renderPage();
    const pesquisa = screen.getByRole("searchbox");
    pesquisa.focus();
    fireEvent.keyDown(pesquisa, { key: "ArrowDown" });
    expect(pesquisa).toHaveFocus();
  });

  it("? mostra os atalhos", () => {
    renderPage();
    teclar("?");
    expect(screen.getByText("Ir para a pesquisa")).toBeInTheDocument();
  });

  it("o botão de atalhos tem nome para quem não vê o ícone", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Atalhos de teclado" })).toBeInTheDocument();
  });
});

describe("Lista", () => {
  it("a primeira ordenação por Valor põe o maior em cima e mostra a seta", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    const cabecalho = screen.getByRole("columnheader", { name: /Valor/ });
    fireEvent.click(within(cabecalho).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Valor/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Vasco Pinto");
  });

  it("sem resultados a Lista também diz o que fazer", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("o seletor Quadro | Lista fica ao lado das abas", () => {
    renderPage();
    const vista = screen.getByRole("group", { name: "Ver os negócios como" });
    expect(within(vista).getAllByRole("button")).toHaveLength(2);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    expect(screen.queryByRole("group", { name: "Ver os negócios como" })).not.toBeInTheDocument();
  });
});

describe("painel do negócio", () => {
  it("mostra a cadeia por ordem e uma ação para os Pedidos de Proposta", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Rui Figueiredo/ }));
    const painel = screen.getByRole("dialog");
    const passos = Array.from(within(painel).getByRole("list", { name: "Cadeia do negócio" }).children);
    expect(passos).toHaveLength(3);
    expect(passos[0]).toHaveTextContent("Orçamentos");
    expect(passos[1]).toHaveTextContent("Proposta");
    expect(passos[2]).toHaveTextContent("Contrato");
    expect(within(painel).getByRole("link", { name: "Abrir nos Pedidos de Proposta" })).toHaveAttribute("href", "/deals");
  });
});
