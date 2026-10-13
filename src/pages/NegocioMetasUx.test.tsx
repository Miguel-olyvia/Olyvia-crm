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
const estado = () => screen.getAllByRole("status")[0].textContent;
const escolher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const abrirFiltros = () => fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
/** Os atalhos só valem com o foco dentro do quadro: parte do foco atual ou, se não houver, do botão Todos. */
const teclar = (key: string) => {
  let alvo: Element = document.activeElement ?? document.body;
  if (alvo === document.body) {
    const todos = within(grupoEscopo()).getByRole("button", { name: "Todos" });
    todos.focus();
    alvo = todos;
  }
  fireEvent.keyDown(alvo, { key });
};
const grupoEscopo = () => screen.getByRole("group", { name: "Mostrar" });
const verTodos = () => fireEvent.click(within(grupoEscopo()).getByRole("button", { name: "Todos" }));

beforeEach(() => window.localStorage.clear());

describe("Os meus | Todos", () => {
  it("começa em Os meus e Todos mostra tudo", () => {
    renderPage();
    const meus = within(grupoEscopo()).getByRole("button", { name: "Os meus" });
    const todos = within(grupoEscopo()).getByRole("button", { name: "Todos" });
    expect(meus).toHaveAttribute("aria-pressed", "true");
    expect(todos).toHaveAttribute("aria-pressed", "false");
    expect(estado()).toBe("3 negócios");
    fireEvent.click(todos);
    expect(todos).toHaveAttribute("aria-pressed", "true");
    expect(estado()).toBe("10 negócios");
    fireEvent.click(meus);
    expect(estado()).toBe("3 negócios");
  });

  it("os chips das fases contam já com Os meus", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /^Orçamento 0/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Financeiro 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Para tratar 0/ })).toBeInTheDocument();
  });

  it("lembra Os meus entre visitas", () => {
    const { unmount } = renderPage();
    verTodos();
    unmount();
    renderPage();
    expect(estado()).toBe("10 negócios");
  });
});

describe("botão Filtros e filtros avançados", () => {
  it("abre o painel com serviço, orçamentos e valor (sem fase) e mostra quantos filtros há", () => {
    renderPage();
    verTodos();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    abrirFiltros();
    expect(screen.queryByLabelText("Fase")).not.toBeInTheDocument();
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
    verTodos();
    abrirFiltros();
    escolher("Serviço", "Cozinha");
    escolher("Valor", "ate10");
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar pesquisa e filtros" }));
    expect(estado()).toBe("10 negócios");
  });
});

describe("estado vazio por coluna", () => {
  it("cada fase sem negócios diz que está vazia e oferece limpar os filtros", () => {
    renderPage();
    expect(screen.getAllByText("Nenhum negócio nesta fase")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Limpar filtros" })).toHaveLength(2);
  });
});

describe("ordenar", () => {
  it("o select Ordenar começa na urgência e a escolha vale para o Quadro e a Lista", () => {
    renderPage();
    verTodos();
    const ordenar = screen.getByLabelText("Ordenar") as HTMLSelectElement;
    expect(ordenar.value).toBe("urgencia");
    fireEvent.change(ordenar, { target: { value: "valor" } });
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("columnheader", { name: /Valor/ })).toHaveAttribute("aria-sort", "descending");
    expect((screen.getByLabelText("Ordenar") as HTMLSelectElement).value).toBe("valor");
  });
});

describe("atalhos de teclado", () => {
  it("/ leva o foco à pesquisa", () => {
    renderPage();
    teclar("/");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("com o foco fora do quadro as teclas não fazem nada", () => {
    renderPage();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("uma tecla premida (repetida) não dispara o atalho", () => {
    renderPage();
    const todos = within(grupoEscopo()).getByRole("button", { name: "Todos" });
    todos.focus();
    fireEvent.keyDown(todos, { key: "/", repeat: true });
    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  it("Esc na pesquisa limpa-a", () => {
    renderPage();
    const pesquisa = screen.getByRole("searchbox");
    fireEvent.change(pesquisa, { target: { value: "zzz" } });
    expect(estado()).toBe("0 negócios");
    fireEvent.keyDown(pesquisa, { key: "Escape" });
    expect(pesquisa).toHaveValue("");
    expect(estado()).toBe("3 negócios");
  });

  it("setas movem o foco entre cartões e colunas, a partir de um cartão", () => {
    renderPage();
    verTodos();
    const pesquisa = screen.getByRole("searchbox");
    pesquisa.focus();
    fireEvent.keyDown(pesquisa, { key: "ArrowDown" });
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

  it("com o foco nos chips ou nos botões da barra as setas não fazem nada (a página continua a rolar)", () => {
    renderPage();
    verTodos();
    const todos = within(grupoEscopo()).getByRole("button", { name: "Todos" });
    todos.focus();
    expect(fireEvent.keyDown(todos, { key: "ArrowDown" })).toBe(true);
    const chip = screen.getByRole("button", { name: /^Proposta 2/ });
    chip.focus();
    expect(fireEvent.keyDown(chip, { key: "j" })).toBe(true);
    expect(chip).toHaveFocus();
  });

  it("o foco anda a partir de um botão de ação do mesmo cartão", () => {
    renderPage();
    verTodos();
    const acao = screen.getByRole("button", { name: "Abrir pessoa: Tiago Rocha" });
    acao.focus();
    fireEvent.keyDown(acao, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAccessibleName(/^Nuno Barros · /);
  });

  it("a tecla premida repete as setas mas não repete x", () => {
    renderPage();
    verTodos();
    const nuno = screen.getByRole("button", { name: /^Nuno Barros · / });
    nuno.focus();
    fireEvent.keyDown(nuno, { key: "ArrowDown", repeat: true });
    expect(document.activeElement).toHaveAccessibleName(/^Clara Dias · /);
    fireEvent.keyDown(document.activeElement!, { key: "x", repeat: true });
    expect(screen.queryByRole("region", { name: "Negócios selecionados" })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "x" });
    expect(screen.getByRole("region", { name: "Negócios selecionados" })).toBeInTheDocument();
  });

  it("depois de limpar a seleção sem cartões visíveis o foco vai para a pesquisa", () => {
    renderPage();
    verTodos();
    const nuno = screen.getByRole("button", { name: /^Nuno Barros · / });
    nuno.focus();
    fireEvent.keyDown(nuno, { key: "x" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Negócios selecionados" })).getByRole("button", { name: "Limpar" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("na pesquisa, Enter e a seta para baixo levam ao primeiro cartão", () => {
    renderPage();
    verTodos();
    const pesquisa = screen.getByRole("searchbox");
    pesquisa.focus();
    fireEvent.keyDown(pesquisa, { key: "ArrowDown" });
    expect(document.activeElement).toHaveAccessibleName(/Tiago Rocha/);
    pesquisa.focus();
    fireEvent.keyDown(pesquisa, { key: "Enter" });
    expect(document.activeElement).toHaveAccessibleName(/Tiago Rocha/);
  });

  it("as teclas x, c e o não fazem nada quando se escreve na pesquisa", () => {
    renderPage();
    const pesquisa = screen.getByRole("searchbox");
    pesquisa.focus();
    for (const key of ["x", "c", "o"]) fireEvent.keyDown(pesquisa, { key });
    expect(screen.queryByRole("region", { name: "Negócios selecionados" })).not.toBeInTheDocument();
    expect(pesquisa).toHaveFocus();
  });

  it("? mostra os atalhos novos", () => {
    renderPage();
    teclar("?");
    expect(screen.getByText("Ir para a pesquisa")).toBeInTheDocument();
    expect(screen.getByText("Comparar os selecionados")).toBeInTheDocument();
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
    verTodos();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("em Os meus a coluna Comercial desaparece", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    expect(screen.queryByRole("columnheader", { name: /Comercial/ })).not.toBeInTheDocument();
    verTodos();
    expect(screen.getByRole("columnheader", { name: /Comercial/ })).toBeInTheDocument();
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
  it("mostra a cadeia por ordem e as ligações para o negócio e para a pessoa", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Rui Figueiredo · / }));
    const painel = screen.getByRole("dialog");
    const passos = Array.from(within(painel).getByRole("list", { name: "Cadeia do negócio" }).children);
    expect(passos).toHaveLength(3);
    expect(passos[0]).toHaveTextContent("Orçamentos");
    expect(passos[1]).toHaveTextContent("Proposta");
    expect(passos[2]).toHaveTextContent("Contrato");
    expect(within(painel).getByRole("link", { name: "Abrir negócio" })).toHaveAttribute("href", "/deals?open=n2");
    expect(within(painel).getByRole("link", { name: "Abrir pessoa" })).toHaveAttribute("href", "/pessoas?open=p-rui");
  });
});
