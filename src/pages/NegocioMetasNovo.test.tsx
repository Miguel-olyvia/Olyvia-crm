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
      { pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO,
    );
    renderPage();
    verTodos();
    expect(estado()).toBe("11 negócios");
    expect(document.body.textContent).not.toContain("undefined");
    expect(screen.getByRole("button", { name: /^Marta Silveira · Ana Ribeiro/ })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    // No Quadro 10 passam a 11 e Por fechar 4 passam a 5 (o novo está aberto).
    expect(numerosDoQuadro()).toEqual(["11", "5"]);
    const metas = screen.getByRole("heading", { name: "Metas do mês" }).closest("section")!;
    // O valor ganho não muda (77%), porque o novo não é ganho.
    expect(within(metas).getByText("77%")).toBeInTheDocument();
  });
});

describe("Levantamento no painel do negócio criado", () => {
  const levantamento = {
    data: "2026-10-13", feitoPor: "Bruno Costa", estado: "feito" as const, observacoes: "Cliente em casa de manhã",
    linhas: [{ divisao: "Cozinha", trabalho: "Bancada nova", medida: 3.5, unidade: "m", observacoes: "Ver canos" }],
  };
  const abrirPainel = (comLevantamento: boolean) => {
    const criado = criarNegocioNovo(
      {
        pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro",
        ...(comLevantamento ? { levantamento } : {}),
      }, HOJE_EXEMPLO,
    );
    render(<MemoryRouter initialEntries={[`/?open=${criado.id}`]}><NegocioMetas /></MemoryRouter>);
    return screen.getByRole("dialog");
  };

  it("mostra a secção Levantamento no Resumo, só de leitura, com o estado, a data, quem fez e as linhas", () => {
    const painel = abrirPainel(true);
    const secao = within(painel).getByRole("heading", { name: "Levantamento" }).closest("section")!;
    expect(within(secao).getByText("Feito · 13/10/2026 · Bruno Costa")).toBeInTheDocument();
    expect(within(secao).getByRole("listitem")).toHaveTextContent("Cozinha: Bancada nova, 3.5 m (Ver canos)");
    expect(within(secao).getByText("Cliente em casa de manhã")).toBeInTheDocument();
  });

  it("sem levantamento o Resumo não traz a secção", () => {
    const painel = abrirPainel(false);
    expect(within(painel).queryByRole("heading", { name: "Levantamento" })).not.toBeInTheDocument();
  });
});

describe("Qualificação, morada da obra e visita no painel do negócio criado", () => {
  const abrirPainel = (extra: Record<string, unknown>) => {
    const criado = criarNegocioNovo({ pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro", ...extra }, HOJE_EXEMPLO);
    render(<MemoryRouter initialEntries={[`/?open=${criado.id}`]}><NegocioMetas /></MemoryRouter>);
    return screen.getByRole("dialog");
  };

  it("mostra Qualificação, Morada da obra e Visita no Resumo, só de leitura, com o que foi respondido", () => {
    const painel = abrirPainel({
      qualificacao: [{ pergunta: "Tipo de imóvel", resposta: "Apartamento" }],
      moradaObra: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "3.º Esq." },
      visita: [{ titulo: "Exterior do edifício", respostas: [{ pergunta: "Acesso", resposta: "Fácil" }] }],
    });
    const qualificacao = within(painel).getByRole("heading", { name: "Qualificação" }).closest("section")!;
    expect(within(qualificacao).getByRole("listitem")).toHaveTextContent("Tipo de imóvel: Apartamento");
    const morada = within(painel).getByRole("heading", { name: "Morada da obra" }).closest("section")!;
    expect(within(morada).getByText("Rua A 1, 1000-001 Lisboa")).toBeInTheDocument();
    expect(within(morada).getByText("3.º Esq.")).toBeInTheDocument();
    const visita = within(painel).getByRole("heading", { level: 3, name: "Visita" }).closest("section")!;
    expect(within(visita).getByRole("heading", { name: "Exterior do edifício" })).toBeInTheDocument();
    expect(within(visita).getByRole("listitem")).toHaveTextContent("Acesso: Fácil");
  });

  it("sem respostas o Resumo não traz nenhuma das três secções", () => {
    const painel = abrirPainel({});
    for (const nome of ["Qualificação", "Morada da obra", "Visita"]) {
      expect(within(painel).queryByRole("heading", { name: nome })).not.toBeInTheDocument();
    }
  });
});
