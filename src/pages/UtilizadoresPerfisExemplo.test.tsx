// Testes de arranque da página: a lista, a ficha do utilizador e a ficha da role abrem e mostram o essencial.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfisExemplo";
import { criarRole, repor } from "@/components/utilizadores-perfis/perfisStore";

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

beforeEach(repor);

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

  it("a coluna Organização e role usa o chip de /users: organização com a role entre parênteses, e +N para os outros vínculos", () => {
    renderPage();
    const linha = screen.getByRole("button", { name: /Rui Pacheco/ }).closest("tr")!;
    expect(within(linha).getByText("Grupo Aurora")).toBeInTheDocument();
    expect(within(linha).getByText("(Administrador da organização)")).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: "Ver as outras 2 organizações e roles" })).toHaveTextContent("+2");
    fireEvent.click(within(linha).getByRole("button", { name: "Abrir a role Administrador da organização em Grupo Aurora" }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Administrador da organização" })).toBeInTheDocument();
  });

  it("não fala de filial, cargo nem local de trabalho: o utilizador tem vínculos com organizações da plataforma", () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/filial|cargo|local de trabalho|Mudelar/i);
    expect(screen.getByRole("columnheader", { name: "Organização e role" })).toBeInTheDocument();
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

  it("repor a palavra-passe pede confirmação e fica registado na atividade", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Rui Pacheco/ }));
    const ficha = screen.getByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Repor palavra-passe" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pedir reposição" }));
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Atividade/ }));
    fireEvent.click(within(ficha).getByRole("tab", { name: /Atividade/ }));
    expect(within(ficha).getByText(/Reposição da palavra-passe pedida/)).toBeInTheDocument();
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
    // Uma role com utilizadores não se elimina: o botão fica desligado e a ficha diz porquê.
    expect(within(ficha).getByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(within(ficha).getByText(/tem utilizadores/)).toBeInTheDocument();
  });

  it("eliminar uma role sem utilizadores pede confirmação e tira-a da lista", () => {
    criarRole({ nome: "Estagiários", codigo: "estagiarios", descricao: "d", podeAssinar: false, permissoes: [] });
    renderPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("button", { name: "Estagiários" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    const pergunta = screen.getByRole("alertdialog");
    expect(within(pergunta).getByText("Eliminar a role Estagiários?")).toBeInTheDocument();
    fireEvent.click(within(pergunta).getByRole("button", { name: "Eliminar" }));
    expect(screen.queryByRole("button", { name: "Estagiários" })).not.toBeInTheDocument();
  });

  it("a coluna chama-se Utilizadores e mostra a contagem de permissões e a marca de acesso total", () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Roles/ }));
    expect(screen.getByRole("columnheader", { name: "Utilizadores" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Pessoas/ })).not.toBeInTheDocument();
    expect(screen.getByText("Acesso total (org)")).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+ permissões$/).length).toBeGreaterThanOrEqual(6);
  });

  it("a matriz da role lista todas as permissões em módulos fechados, soma o concedido e pesquisa", () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Roles/ }));
    fireEvent.click(screen.getByRole("button", { name: "Comercial" }));
    const ficha = screen.getByRole("dialog");
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Permissões/ }));
    fireEvent.click(within(ficha).getByRole("tab", { name: /Permissões/ }));
    expect(within(ficha).getByText(/\d+ de \d+ permissões concedidas/)).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: /CRM/ })).toHaveAttribute("aria-expanded", "false");
    expect(within(ficha).queryByText("Ver clientes")).not.toBeInTheDocument();
    fireEvent.change(within(ficha).getByRole("searchbox"), { target: { value: "eliminar clientes" } });
    expect(within(ficha).getByText("Eliminar clientes")).toBeInTheDocument();
    expect(within(ficha).getByText("Perigosa")).toBeInTheDocument();
    expect(within(ficha).getByText("Não tem")).toBeInTheDocument();
    fireEvent.change(within(ficha).getByRole("searchbox"), { target: { value: "zzzz" } });
    expect(within(ficha).getByText(/Nenhuma permissão corresponde/)).toBeInTheDocument();
  });

  it("a ficha do utilizador mostra todas as permissões, com a role de onde vêm as que tem", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Carla Mendes/ }));
    const ficha = screen.getByRole("dialog");
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Permissões/ }));
    fireEvent.click(within(ficha).getByRole("tab", { name: /Permissões/ }));
    fireEvent.click(within(ficha).getByRole("button", { name: /CRM/ }));
    expect(within(ficha).getByText("Ver clientes")).toBeInTheDocument();
    expect(within(ficha).getByText("Criar clientes")).toBeInTheDocument();
    expect(within(ficha).getAllByRole("button", { name: "Só leitura" }).length).toBeGreaterThan(0);
    expect(within(ficha).getAllByText("Não tem").length).toBeGreaterThan(0);
  });
});
