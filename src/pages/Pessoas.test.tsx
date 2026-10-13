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

describe("Pessoas: arranque", () => {
  it("mostra o resumo, a tabela com 13 linhas e o separador de submissões com (6)", () => {
    renderPage();
    expect(screen.getByText("13 pessoas · 6 clientes · 3 sem negócio")).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + 13);
    expect(screen.getByRole("tab", { name: "Submissões, 6 pendentes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pessoas" })).toHaveAttribute("aria-selected", "true");
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
