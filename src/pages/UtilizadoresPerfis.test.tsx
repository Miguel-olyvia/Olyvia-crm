// "Utilizadores e perfis" real: junta as páginas Utilizadores e Roles em separadores, cada um com a sua permissão.
// As duas páginas embebidas são simuladas (têm testes próprios); aqui vê-se só a junção, as permissões e o URL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";
import RedirecionarUtilizadoresPerfis from "./RedirecionarUtilizadoresPerfis";
import { menuSections } from "@/components/sidebar/menuConfig";

const estado = vi.hoisted(() => ({ permissoes: new Set<string>() }));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.permissoes.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => estado.permissoes.has(p)),
    loading: false,
  }),
}));
vi.mock("./UsersNew", () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="pagina-utilizadores" data-embedded={String(!!embedded)} />,
}));
vi.mock("./Roles", () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="pagina-roles" data-embedded={String(!!embedded)} />,
}));
vi.mock("@/hooks/useTranslation", async () => {
  const { utilizadoresPerfisTranslations } = await import("@/translations/utilizadoresPerfis");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const pt: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, ...utilizadoresPerfisTranslations.pt };
  return { useTranslation: () => ({ language: "pt", t: (key: string) => pt[key] ?? key }) };
});

const Local = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="local">{pathname + search}</p>;
};

const renderPage = (permissoes: string[], url = "/utilizadores-perfis") => {
  estado.permissoes = new Set(permissoes);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <UtilizadoresPerfis />
      <Local />
    </MemoryRouter>,
  );
};

beforeEach(() => { estado.permissoes = new Set(); });

describe("UtilizadoresPerfis: separadores e permissões", () => {
  it("só users.view: um separador, Utilizadores, e o conteúdo real da página de utilizadores", async () => {
    renderPage(["users.view"]);
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Utilizadores" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("pagina-utilizadores")).toHaveAttribute("data-embedded", "true");
    expect(screen.queryByTestId("pagina-roles")).not.toBeInTheDocument();
  });

  it("só roles.view: um separador, Roles, e o conteúdo real da página de roles", async () => {
    renderPage(["roles.view"]);
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Roles" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("pagina-roles")).toHaveAttribute("data-embedded", "true");
    expect(screen.queryByTestId("pagina-utilizadores")).not.toBeInTheDocument();
  });

  it("com as duas permissões vê os dois separadores, Utilizadores primeiro", async () => {
    renderPage(["users.view", "roles.view"]);
    expect(screen.getAllByRole("tab").map((a) => a.textContent)).toEqual(["Utilizadores", "Roles"]);
    expect(screen.getByRole("tablist", { name: "Secções de utilizadores e perfis" })).toBeInTheDocument();
    expect(await screen.findByTestId("pagina-utilizadores")).toBeInTheDocument();
  });

  it("tem um único título de nível 1 (as páginas embebidas não repetem o seu)", () => {
    renderPage(["users.view", "roles.view"]);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Utilizadores e perfis" })).toBeInTheDocument();
  });

  it("sem nenhuma das duas permissões não mostra separadores nem conteúdo", () => {
    renderPage(["leads.view"]);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pagina-utilizadores")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pagina-roles")).not.toBeInTheDocument();
  });
});

describe("UtilizadoresPerfis: o separador vive no URL (?aba=)", () => {
  const ambas = ["users.view", "roles.view"];

  it("?aba=roles abre o separador Roles", async () => {
    renderPage(ambas, "/utilizadores-perfis?aba=roles");
    expect(screen.getByRole("tab", { name: "Roles" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("pagina-roles")).toBeInTheDocument();
  });

  it("clicar noutro separador actualiza o URL e guarda os outros parâmetros", async () => {
    renderPage(ambas, "/utilizadores-perfis?edit=abc");
    const roles = screen.getByRole("tab", { name: "Roles" });
    fireEvent.mouseDown(roles);
    fireEvent.click(roles);
    expect(await screen.findByTestId("pagina-roles")).toBeInTheDocument();
    expect(screen.getByTestId("local")).toHaveTextContent("aba=roles");
    expect(screen.getByTestId("local")).toHaveTextContent("edit=abc");
  });

  it("valor inválido cai no primeiro separador permitido", async () => {
    renderPage(ambas, "/utilizadores-perfis?aba=portal");
    expect(screen.getByRole("tab", { name: "Utilizadores" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("pagina-utilizadores")).toBeInTheDocument();
  });

  it("separador não permitido cai no permitido: só users.view com ?aba=roles não vê Roles", async () => {
    renderPage(["users.view"], "/utilizadores-perfis?aba=roles");
    expect(await screen.findByTestId("pagina-utilizadores")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-roles")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Roles" })).not.toBeInTheDocument();
  });

  it("separador não permitido cai no permitido: só roles.view com ?aba=utilizadores não vê Utilizadores", async () => {
    renderPage(["roles.view"], "/utilizadores-perfis?aba=utilizadores");
    expect(await screen.findByTestId("pagina-roles")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-utilizadores")).not.toBeInTheDocument();
  });

  it("teclado: seta para a direita passa ao separador seguinte, Home volta ao primeiro", async () => {
    renderPage(ambas);
    const utilizadores = screen.getByRole("tab", { name: "Utilizadores" });
    utilizadores.focus();
    fireEvent.keyDown(utilizadores, { key: "ArrowRight" });
    expect(await screen.findByTestId("pagina-roles")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Roles" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Roles" }), { key: "Home" });
    expect(await screen.findByTestId("pagina-utilizadores")).toBeInTheDocument();
  });
});

describe("redireccionamentos de /users e /roles", () => {
  const renderRedireccao = (url: string) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/users" element={<RedirecionarUtilizadoresPerfis aba="utilizadores" />} />
          <Route path="/roles" element={<RedirecionarUtilizadoresPerfis aba="roles" />} />
          <Route path="/utilizadores-perfis" element={<Local />} />
        </Routes>
      </MemoryRouter>,
    );

  it("/users vai para o separador Utilizadores", () => {
    renderRedireccao("/users");
    expect(screen.getByTestId("local")).toHaveTextContent("/utilizadores-perfis?aba=utilizadores");
  });

  it("/roles vai para o separador Roles", () => {
    renderRedireccao("/roles");
    expect(screen.getByTestId("local")).toHaveTextContent("/utilizadores-perfis?aba=roles");
  });

  it("preserva os parâmetros que já traziam (ex.: /users?edit=id)", () => {
    renderRedireccao("/users?edit=42");
    const local = screen.getByTestId("local").textContent ?? "";
    expect(local).toContain("aba=utilizadores");
    expect(local).toContain("edit=42");
  });
});

describe("menu", () => {
  const grupo = menuSections.find((s) => s.id === "users")!;

  it("tem um só item «Utilizadores e perfis», visível com users.view OU roles.view", () => {
    const entradas = grupo.items.filter((i) => i.to === "/utilizadores-perfis");
    expect(entradas).toHaveLength(1);
    expect(entradas[0].labelKey).toBe("sidebar.usersProfiles");
    expect([...(entradas[0].permissions ?? [])].sort()).toEqual(["roles.view", "users.view"]);
    expect(entradas[0].requireAll).not.toBe(true);
    expect(entradas[0].permission).toBeUndefined();
  });

  it("os itens /users e /roles saíram do menu, mas os caminhos continuam a abrir o grupo", () => {
    expect(grupo.items.some((i) => i.to === "/users")).toBe(false);
    expect(grupo.items.some((i) => i.to === "/roles")).toBe(false);
    for (const p of ["/users", "/roles", "/utilizadores-perfis", "/export-audit"]) expect(grupo.paths).toContain(p);
  });

  it("a exportação de auditoria fica como estava", () => {
    const entrada = grupo.items.find((i) => i.to === "/export-audit");
    expect(entrada?.permission).toBe("exports.audit.view");
  });

  it("o grupo aparece com qualquer das duas permissões", () => {
    expect(grupo.permissions).toEqual(expect.arrayContaining(["users.view", "roles.view"]));
  });
});
