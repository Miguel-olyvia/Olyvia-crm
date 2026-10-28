// Permissões separadas por separador na página /utilizadores-perfis, e o ?aba= do URL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";
import { separadoresPermitidos } from "@/components/utilizadores-perfis/separadores";

let codigos: string[] = [];
let carregando = false;

vi.mock("@/components/utilizadores-perfis/hooks/usePermissoesPerfis", () => ({
  usePermissoesPerfis: () => {
    const tem = (c: string) => codigos.includes(c);
    return { carregando, permitidos: separadoresPermitidos(tem), tem };
  },
}));

// Os utilizadores vêm da base (testados em UtilizadoresPerfisUtilizadores.test.tsx): aqui o wrapper é simulado e vazio.
vi.mock("@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloFalso());

vi.mock("@/components/utilizadores-perfis/hooks/useRolesPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloRolesFalso());

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

beforeEach(() => {
  codigos = [];
  carregando = false;
});

const renderPage = (url = "/utilizadores-perfis") => render(<MemoryRouter initialEntries={[url]}><UtilizadoresPerfis /></MemoryRouter>);
const nomesDasAbas = () => screen.getAllByRole("tab").map((a) => a.textContent ?? "");

describe("UtilizadoresPerfis: separadores por permissão", () => {
  it("só users.view: vê Utilizadores e Portal e não vê Roles", () => {
    codigos = ["users.view"];
    renderPage();
    const abas = nomesDasAbas();
    expect(abas).toHaveLength(2);
    expect(abas.some((a) => /Roles/.test(a))).toBe(false);
    expect(screen.queryByRole("button", { name: "Nova role" })).not.toBeInTheDocument();
  });

  it("só roles.view: vê só Roles e abre nele, mesmo sem ?aba=", () => {
    codigos = ["roles.view"];
    renderPage();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /Roles/ })).toHaveAttribute("aria-selected", "true");
  });

  it("as duas permissões: três separadores", () => {
    codigos = ["users.view", "roles.view"];
    renderPage();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("?aba=roles sem roles.view cai no primeiro permitido", () => {
    codigos = ["users.view"];
    renderPage("/utilizadores-perfis?aba=roles");
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("?aba= inválido cai no primeiro permitido; ?aba=roles com roles.view abre Roles", () => {
    codigos = ["users.view", "roles.view"];
    const { unmount } = renderPage("/utilizadores-perfis?aba=xpto");
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
    unmount();
    renderPage("/utilizadores-perfis?aba=roles");
    expect(screen.getByRole("tab", { name: /Roles/ })).toHaveAttribute("aria-selected", "true");
  });

  it("os separadores navegam com o teclado (setas) e mantêm o aria da lista", async () => {
    codigos = ["users.view", "roles.view"];
    renderPage();
    expect(screen.getByRole("tablist")).toHaveAccessibleName("Secções de utilizadores e perfis");
    const primeira = screen.getAllByRole("tab")[0];
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getAllByRole("tab")[1]).toHaveFocus());
  });

  it("sem nenhuma permissão não mostra separadores nem dados", () => {
    codigos = ["users.create", "roles.edit"];
    renderPage();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText("Rui Pacheco")).not.toBeInTheDocument();
  });

  it("enquanto as permissões carregam não decide nem mostra dados", () => {
    carregando = true;
    codigos = ["users.view"];
    renderPage();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByText("Rui Pacheco")).not.toBeInTheDocument();
  });
});
