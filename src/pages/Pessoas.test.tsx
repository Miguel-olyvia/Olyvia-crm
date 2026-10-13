import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Pessoas from "./Pessoas";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, "sidebar.crm": "CRM" };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

const renderPage = (endereco = "/pessoas") =>
  render(
    <MemoryRouter initialEntries={[endereco]}>
      <Pessoas />
    </MemoryRouter>,
  );

beforeEach(() => window.localStorage.clear());

describe("Pessoas: arranque da lista", () => {
  it("mostra o resumo, a tabela com 17 linhas e o separador de submissões com (6)", () => {
    renderPage();
    expect(screen.getByText("17 pessoas · 6 clientes · 6 sem negócio")).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + 17);
    expect(screen.getByRole("tab", { name: "Submissões, 6 pendentes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pessoas" })).toHaveAttribute("aria-selected", "true");
  });

  it("tem as 7 colunas, o seletor abre em Todos e há o botão Nova lead", () => {
    renderPage();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(
      ["Pessoa", "Localidade", "Etapa", "Formulário", "Último contacto", "Próximo passo", "Valor"],
    );
    expect(screen.getByRole("button", { name: /Todos 17/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Leads 9/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
    expect(screen.queryByText(/Serviço/)).not.toBeInTheDocument();
  });

  it("a lista não tem faixa de KPIs, Fila de trabalho nem Dashboard", () => {
    renderPage();
    expect(screen.queryByText(/Fila de trabalho/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dashboard/i)).not.toBeInTheDocument();
  });
});

describe("Pessoas: arranque da ficha", () => {
  it("?open= abre a ficha com o percurso, as ações e o Resumo em secções", () => {
    renderPage("/pessoas?open=p-nuno");
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: "Nuno Barros", level: 2 })).toBeInTheDocument();
    expect(within(ficha).getByRole("list", { name: "Percurso da lead" })).toBeInTheDocument();
    const chamada = within(ficha).getByRole("button", { name: /Registar chamada/ });
    expect(chamada).toHaveAttribute("aria-expanded", "false");
    for (const titulo of ["Próximo passo e prazo", "Contacto", "Origem", "Sobre a pessoa"]) {
      expect(within(ficha).getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
    expect(within(ficha).getByText(/Lead · Negócio · Proposta · Setúbal/)).toBeInTheDocument();
  });
});
describe("Submissões pendentes: arranque", () => {
  it("?separador=submissoes mostra os 6 cartões, o conflito primeiro", () => {
    renderPage("/pessoas?separador=submissoes");
    const lista = screen.getByRole("list", { name: "Submissões pendentes" });
    const cartoes = within(lista).getAllByRole("article");
    expect(cartoes).toHaveLength(6);
    expect(within(cartoes[0]).getByText("Conflito")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Submissões, 6 pendentes" })).toHaveAttribute("aria-selected", "true");
  });
});
