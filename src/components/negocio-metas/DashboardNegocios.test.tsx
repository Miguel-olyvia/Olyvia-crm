import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DashboardNegocios } from "./DashboardNegocios";
import { TooltipEvolucao } from "./TooltipEvolucao";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";

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

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const MEIO = new Date(2026, 9, 13);
const FIM = new Date(2026, 9, 30);
const secao = (titulo: string) => screen.getByRole("heading", { level: 2, name: titulo }).closest("section")!;
const linhas = () => screen.getAllByRole("button", { name: /Filtrar o Dashboard/ });
const mostrar = (hoje = MEIO) => render(<DashboardNegocios dados={DADOS_EXEMPLO} hoje={hoje} />);

describe("hierarquia", () => {
  it("as Metas do mês vêm antes dos Números do Quadro", () => {
    mostrar();
    const metas = secao("Metas do mês");
    const numeros = secao("Números do Quadro");
    expect(metas.compareDocumentPosition(numeros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(metas).getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("estado da meta", () => {
  it("diz o estado em texto, com aria-label, e não só pela cor", () => {
    mostrar();
    const metas = secao("Metas do mês");
    expect(within(metas).getAllByText("No ritmo").length).toBeGreaterThan(0);
    expect(within(metas).getAllByLabelText(/^Estado: /)).toHaveLength(4);
  });

  it("muda com o ritmo do mês", () => {
    mostrar(FIM);
    expect(within(secao("Metas do mês")).getAllByText("Em risco").length).toBeGreaterThan(0);
  });
});

describe("metas por comercial", () => {
  it("ordena do maior para o menor ganho e inverte no botão", () => {
    mostrar();
    expect(linhas()[0]).toHaveAccessibleName(/^Ana Ribeiro/);
    expect(linhas()[3]).toHaveAccessibleName(/^Diogo Lopes/);
    fireEvent.click(screen.getByRole("button", { name: /Ordenar/ }));
    expect(linhas()[0]).toHaveAccessibleName(/^Diogo Lopes/);
  });

  it("acaba com o total da equipa e mantém a tabela alternativa", () => {
    mostrar();
    const total = within(secao("Metas por comercial")).getByTestId("total-equipa");
    expect(total).toHaveTextContent("Total da equipa");
    expect(total).toHaveTextContent("€69.500");
    expect(total).toHaveTextContent("77%");
    expect(screen.getByRole("table", { name: /Valor ganho face à meta/ })).toBeInTheDocument();
  });
});

describe("filtro por comercial", () => {
  const quadro = () => within(secao("Números do Quadro")).getByText("No Quadro").closest("li")!;

  it("filtra os números, mostra o chip e remove-o", () => {
    mostrar();
    expect(quadro()).toHaveTextContent("10");
    fireEvent.click(linhas()[1]);
    expect(screen.getByText("A ver: Bruno Costa")).toBeInTheDocument();
    expect(quadro()).toHaveTextContent("2");
    expect(quadro()).not.toHaveTextContent("10");
    fireEvent.click(screen.getByRole("button", { name: "Remover filtro" }));
    expect(screen.queryByText(/A ver:/)).not.toBeInTheDocument();
    expect(quadro()).toHaveTextContent("10");
  });
});

describe("estados", () => {
  it("a carregar reserva o espaço com skeletons", () => {
    const { container } = render(<DashboardNegocios dados={DADOS_EXEMPLO} estado="carregando" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(3);
  });

  it("vazio diz Sem dados neste período e tem uma ação", () => {
    const aoIr = vi.fn();
    render(<DashboardNegocios dados={DADOS_EXEMPLO} estado="vazio" aoIrParaQuadro={aoIr} />);
    expect(screen.getByText("Sem dados neste período")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver o Quadro" }));
    expect(aoIr).toHaveBeenCalled();
  });

  it("erro mostra a mensagem e o botão Tentar de novo", () => {
    const outra = vi.fn();
    render(<DashboardNegocios dados={DADOS_EXEMPLO} estado="erro" aoTentarDeNovo={outra} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(outra).toHaveBeenCalled();
  });
});

describe("evolução mensal", () => {
  it("tem legenda com real e meta", () => {
    mostrar();
    const legenda = within(secao("Evolução mensal")).getByRole("list", { name: "Legenda" });
    expect(legenda).toHaveTextContent("Valor ganho");
    expect(legenda).toHaveTextContent("Meta mensal");
  });

  it("o tooltip mostra ganho, meta e % da meta", () => {
    render(
      <TooltipEvolucao active payload={[{ payload: { nome: "set", ganho: 81700, meta: 90000 } }]} />,
    );
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("set");
    expect(tip).toHaveTextContent("€81.700");
    expect(tip).toHaveTextContent("€90.000");
    expect(tip).toHaveTextContent("91% da meta");
  });

  it("não desenha nada quando inativo", () => {
    const { container } = render(<TooltipEvolucao active={false} payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
