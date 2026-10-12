import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import { menuSections } from "@/components/sidebar/menuConfig";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string) => negocioMetasTranslations.pt[key] ?? key,
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

describe("NegocioMetas", () => {
  it("mostra título, migalhas e a faixa de exemplo", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Negócio e metas" })).toBeInTheDocument();
    const migalhas = screen.getByRole("navigation", { name: "Migalhas de pão" });
    expect(within(migalhas).getByText("Aquisição")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Dados de exemplo · ainda sem ligação à base");
  });

  it("mostra os quatro blocos", () => {
    renderPage();
    for (const nome of ["Metas do mês", "Metas por comercial", "Evolução mensal", "Negócios do mês"]) {
      expect(screen.getByRole("heading", { level: 2, name: nome })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByRole("img", { name: /Gráfico/ })).toBeInTheDocument();
  });

  it("mostra os cartões com valores calculados", () => {
    renderPage();
    const cartoes = screen.getByRole("heading", { name: "Metas do mês" }).closest("section")!;
    expect(within(cartoes).getByText("77%")).toBeInTheDocument();
    expect(within(cartoes).getByText("75%")).toBeInTheDocument();
  });

  it("a tabela alternativa do gráfico tem os seis meses", () => {
    renderPage();
    const seccao = screen.getByRole("heading", { name: "Evolução mensal" }).closest("section")!;
    expect(within(seccao).getAllByRole("row")).toHaveLength(7);
  });

  it("expandir um negócio mostra a cadeia", () => {
    renderPage();
    expect(screen.queryByText("Escolhido")).not.toBeInTheDocument();
    const botao = screen.getByRole("button", { name: /Rui Figueiredo/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("Escolhido")).toHaveLength(1);
    expect(screen.getByText("Assinado")).toBeInTheDocument();
    expect(screen.getByText("Aceite")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.queryByText("Escolhido")).not.toBeInTheDocument();
  });

  it("um negócio sem contrato mostra o passo opcional", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Nuno Barros/ }));
    expect(screen.getByText("Passo opcional")).toBeInTheDocument();
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
