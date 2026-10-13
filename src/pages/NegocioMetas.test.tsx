import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import { menuSections } from "@/components/sidebar/menuConfig";
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

// O jsdom não tem ResizeObserver, que o ResponsiveContainer do recharts usa.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const renderPage = () =>
  render(
    <MemoryRouter>
      <NegocioMetas />
    </MemoryRouter>,
  );

const estado = () => screen.getAllByRole("status")[0].textContent;
const chips = () => within(screen.getByRole("group", { name: "Fases e alertas" })).getAllByRole("button");
const verTodos = () =>
  fireEvent.click(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: "Todos" }));
const cartoes = () => document.querySelectorAll("[data-cartao]");

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("cabeçalho", () => {
  it("mostra migalhas, título, resumo numa linha e a faixa de exemplo", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Negócio e metas" })).toBeInTheDocument();
    const migalhas = screen.getByRole("navigation", { name: "Migalhas de pão" });
    expect(within(migalhas).getByText("Aquisição")).toBeInTheDocument();
    expect(
      screen.getByText(/3 \(de 10\) no Quadro · €0 em proposta · 1 por fechar, no valor de €47\.800/),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Dados de exemplo · ainda sem ligação à base");
  });

  it("põe as abas no topo, depois o título e as ações, e o seletor do Quadro só aparece no Quadro", () => {
    renderPage();
    const abas = screen.getByRole("tablist", { name: "Vista" });
    const titulo = screen.getByRole("heading", { level: 1, name: "Negócio e metas" });
    const botao = screen.getByRole("button", { name: "Workflow" });
    const antes = (x: Element, y: Element) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(abas, screen.getByRole("navigation", { name: "Migalhas de pão" }))).toBe(true);
    expect(antes(abas, titulo)).toBe(true);
    expect(antes(titulo, botao)).toBe(true);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Ver os negócios como" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    expect(screen.queryByRole("group", { name: "Ver os negócios como" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
  });

  it("tem as abas Quadro e Dashboard", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "Quadro" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument();
  });
});

describe("Quadro", () => {
  it("mostra quatro colunas por fase com os cartões", () => {
    renderPage();
    verTodos();
    for (const fase of ["Orçamento", "Proposta", "Contrato", "Ganho"]) {
      // O nome da coluna leva, só para leitores de ecrã, quantos negócios tem ("Orçamento, 1 negócio").
      expect(screen.getByRole("heading", { level: 3, name: new RegExp("^" + fase + ", [0-9]+ negócios?$") })).toBeInTheDocument();
    }
    expect(cartoes()).toHaveLength(10);
  });

  it("começa em Os meus, sem repetir o comercial em cada cartão", () => {
    renderPage();
    expect(estado()).toBe("3 negócios");
    expect(cartoes()).toHaveLength(3);
    expect(screen.getByRole("button", { name: /^Vasco Pinto · / })).not.toHaveTextContent("Ana Ribeiro");
    verTodos();
    expect(screen.getByRole("button", { name: /^Nuno Barros · / })).toHaveTextContent("Carla Mendes");
  });

  it("há um chip por fase e o Para tratar, cada um com a contagem que o filtro dele dá", () => {
    renderPage();
    verTodos();
    const antes = chips().map((c) => c.textContent!);
    expect(antes).toHaveLength(5);
    antes.forEach((texto, i) => {
      const n = Number(texto.match(/([0-9]+)(?:\s*·[^·]*)?$/)![1]);
      fireEvent.click(chips()[i]);
      expect(chips()[i]).toHaveAttribute("aria-pressed", "true");
      expect(estado()).toBe(n === 1 ? "1 negócio" : `${n} negócios`);
      fireEvent.click(chips()[i]);
      expect(chips()[i]).toHaveAttribute("aria-pressed", "false");
      expect(estado()).toBe("10 negócios");
    });
  });

  it("os chips de fase somam-se (OU) e o Para tratar junta-se com E", () => {
    renderPage();
    verTodos();
    fireEvent.click(screen.getByRole("button", { name: /^Orçamento: 1 / }));
    fireEvent.click(screen.getByRole("button", { name: /^Proposta: 2 / }));
    expect(estado()).toBe("3 negócios");
    fireEvent.click(screen.getByRole("button", { name: /^Para tratar/ }));
    expect(estado()).toBe("3 negócios");
    fireEvent.click(screen.getByRole("button", { name: /^Orçamento: 1 / }));
    expect(estado()).toBe("2 negócios");
  });

  it("um chip filtra os cartões e o resumo do topo", () => {
    renderPage();
    verTodos();
    fireEvent.click(screen.getByRole("button", { name: /^Orçamento: 1 / }));
    expect(estado()).toBe("1 negócio");
    expect(screen.queryByRole("button", { name: /Marta Silveira/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tiago Rocha · / })).toBeInTheDocument();
    expect(screen.getByText(/1 \(de 10\) no Quadro/)).toBeInTheDocument();
  });

  it("sem negócios meus a página oferece Ver todos", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Tiago" } });
    expect(screen.getByText("Nenhum negócio teu com estes filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(estado()).toBe("1 negócio");
  });

  it("a pesquisa filtra e dá a opção de limpar quando não há resultados", () => {
    renderPage();
    verTodos();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum negócio encontrado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar pesquisa e filtros" }));
    expect(estado()).toBe("10 negócios");
  });

  it("abrir um cartão mostra o painel com a cadeia", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Rui Figueiredo · / }));
    const painel = screen.getByRole("dialog");
    // O Resumo abre primeiro, com a cadeia numa linha; o orçamento escolhido está no separador Orçamentos.
    expect(within(painel).getByText("Aceite")).toBeInTheDocument();
    expect(within(painel).getByText("Assinado")).toBeInTheDocument();
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Orçamentos/ }));
    expect(within(painel).getByText("Escolhido")).toBeInTheDocument();
  });

  it("um negócio sem contrato mostra o passo opcional", () => {
    renderPage();
    verTodos();
    fireEvent.click(screen.getByRole("button", { name: /^Nuno Barros · / }));
    expect(within(screen.getByRole("dialog")).getByText("Passo opcional")).toBeInTheDocument();
  });
});

describe("Quadro | Lista", () => {
  it("alterna entre quadro e lista", () => {
    renderPage();
    verTodos();
    const quadro = screen.getByRole("button", { name: "Quadro" });
    const lista = screen.getByRole("button", { name: "Lista" });
    expect(quadro).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(lista);
    expect(lista).toHaveAttribute("aria-pressed", "true");
    expect(quadro).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("table")).toBeInTheDocument();
    // cabeçalho + 10 negócios + rodapé (as linhas de detalhe estão escondidas)
    expect(screen.getAllByRole("row")).toHaveLength(12);
    fireEvent.click(quadro);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lembra a escolha", () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(window.localStorage.getItem(CHAVE_VISTA)).toBe("lista");
    unmount();
    renderPage();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  });

  it("funciona quando o armazenamento falha", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("a lista respeita os filtros", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    verTodos();
    fireEvent.click(screen.getByRole("button", { name: /^Para tratar/ }));
    // cabeçalho + 3 negócios + rodapé
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });

  it("ordena ao clicar nos cabeçalhos, com aria-sort", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    verTodos();
    const cabecalho = screen.getByRole("columnheader", { name: /Pessoa/ });
    expect(cabecalho).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(cabecalho).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Pessoa/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Clara Dias");
    fireEvent.click(within(screen.getByRole("columnheader", { name: /Pessoa/ })).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Pessoa/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Vasco Pinto");
  });

  it("abrir uma linha mostra o painel", () => {
    window.localStorage.setItem(CHAVE_VISTA, "lista");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Vasco Pinto/ }));
    expect(within(screen.getByRole("dialog")).getByText("Por assinar")).toBeInTheDocument();
  });
});

describe("Dashboard", () => {
  it("mostra os números, as metas do mês, por comercial e a evolução", () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    for (const nome of ["Números do Quadro", "Metas do mês", "Metas por comercial", "Evolução mensal"]) {
      expect(screen.getByRole("heading", { level: 2, name: nome })).toBeInTheDocument();
    }
    const metas = screen.getByRole("heading", { name: "Metas do mês" }).closest("section")!;
    expect(within(metas).getByText("77%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Gráfico/ })).toBeInTheDocument();
  });
});

describe("menu de Aquisição", () => {
  it("tem a entrada Negócio e metas com a permissão dos Pedidos de Proposta", () => {
    const aquisicao = menuSections.find((s) => s.id === "acquisition")!;
    const deals = aquisicao.items.find((i) => i.to === "/deals")!;
    const entrada = aquisicao.items.find((i) => i.to === "/negocio-metas");
    expect(entrada).toBeDefined();
    expect(entrada!.labelKey).toBe("sidebar.businessGoals");
    expect(entrada!.permission).toBe(deals.permission);
    expect(aquisicao.paths).toContain("/negocio-metas");
  });
});
