// Testes de arranque da página: a lista, a ficha do utilizador e a ficha da role abrem e mostram o essencial.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";
import { menuSections } from "@/components/sidebar/menuConfig";

vi.mock("@/hooks/useTranslation", async () => {
  const { utilizadoresPerfisTranslations } = await import("@/translations/utilizadoresPerfis");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const pt: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, ...utilizadoresPerfisTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), pt[key] ?? key),
    }),
  };
});

const renderPage = () => render(<MemoryRouter><UtilizadoresPerfis /></MemoryRouter>);

describe("UtilizadoresPerfis: lista", () => {
  it("mostra título, aviso de exemplo, abas com contadores e só os utilizadores ativos", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Utilizadores e perfis" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Dados de exemplo");
    expect(screen.getByRole("tab", { name: /Utilizadores/ })).toHaveAccessibleName(/12/);
    expect(screen.getByText("A mostrar 11 de 12 utilizadores")).toBeInTheDocument();
    expect(screen.queryByText("Duarte Lopes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convidar utilizador" })).toBeInTheDocument();
  });

  it("filtro sem resultados diz o que fazer", () => {
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(screen.getByText("Nenhum utilizador com estes filtros")).toBeInTheDocument();
  });
});

describe("UtilizadoresPerfis: ficha do utilizador", () => {
  it("abre ao clicar no nome, com as quatro abas e a navegação", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Rui Pacheco/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: "Rui Pacheco" })).toBeInTheDocument();
    expect(within(ficha).getAllByRole("tab").map((a) => a.textContent)).toEqual(
      [expect.stringContaining("Resumo"), expect.stringContaining("Vínculos"), expect.stringContaining("Permissões"), expect.stringContaining("Atividade")],
    );
    expect(within(ficha).getByRole("button", { name: "Repor palavra-passe" })).toBeEnabled();
  });

  it("o super administrador abre protegido, com as ações desligadas", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Helena Marques/ }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("button", { name: "Mudar role" })).toBeDisabled();
    expect(within(ficha).getByText(/estão protegidos/)).toBeInTheDocument();
  });
});

describe("UtilizadoresPerfis: roles", () => {
  it("a aba Roles lista as roles e a ficha da role abre com a matriz", () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("button", { name: "Comercial" }));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Eliminar" })).toBeEnabled();
  });
});

describe("menu", () => {
  it("tem a entrada no grupo Utilizadores, com a permissão users.view", () => {
    const grupo = menuSections.find((s) => s.id === "users")!;
    const entrada = grupo.items.find((i) => i.to === "/utilizadores-perfis");
    expect(entrada?.labelKey).toBe("sidebar.usersProfiles");
    expect(entrada?.permission).toBe("users.view");
    expect(grupo.paths).toContain("/utilizadores-perfis");
    expect(grupo.items.some((i) => i.to === "/users")).toBe(true);
    expect(grupo.items.some((i) => i.to === "/roles")).toBe(true);
  });
});
