// Os negócios criados com "Novo negócio" entram em todas as vistas da página; sem nenhum, os números são os de sempre.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import { criarNegocioNovo, repor } from "@/components/negocio-metas/negociosNovos";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const renderPage = () => render(<MemoryRouter><NegocioMetas /></MemoryRouter>);
const estado = () => screen.getAllByRole("status")[0].textContent;
const verTodos = () =>
  fireEvent.click(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: "Todos" }));

/** "No Quadro" e "Por fechar" do Dashboard, só os números. */
const numerosDoQuadro = () => {
  const secao = screen.getByRole("heading", { name: "Números do Quadro" }).closest("section")!;
  return within(secao).getAllByRole("listitem").slice(0, 2).map((li) => li.querySelector("p")!.textContent);
};

beforeEach(() => window.localStorage.clear());
afterEach(() => repor());

describe("Novo negócio na página", () => {
  it("tem o botão primário Novo negócio no cabeçalho, ao lado do Workflow", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Novo negócio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
  });

  it("sem negócios novos os números são os dos 10 originais", () => {
    renderPage();
    verTodos();
    expect(estado()).toBe("10 negócios");
    expect(screen.getByText(/3 \(de 10\) no Quadro|10 no Quadro/)).toBeInTheDocument();
  });

  it("um negócio novo entra no Quadro, no resumo e na contagem do Dashboard, sem contar como ganho", () => {
    criarNegocioNovo(
      { pessoa: { id: "p-marta", nome: "Marta Silveira" }, servico: "Cozinha", comercial: "Ana Ribeiro" }, HOJE_EXEMPLO,
    );
    renderPage();
    verTodos();
    expect(estado()).toBe("11 negócios");
    expect(screen.getByRole("button", { name: /^Marta Silveira · Cozinha/ })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    // No Quadro 10 passam a 11 e Por fechar 4 passam a 5 (o novo está aberto).
    expect(numerosDoQuadro()).toEqual(["11", "5"]);
    const metas = screen.getByRole("heading", { name: "Metas do mês" }).closest("section")!;
    // O valor ganho não muda (77%), porque o novo não é ganho.
    expect(within(metas).getByText("77%")).toBeInTheDocument();
  });
});
