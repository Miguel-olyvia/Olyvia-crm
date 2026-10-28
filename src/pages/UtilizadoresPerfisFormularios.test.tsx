// Arranque dos formulários de "Utilizadores e perfis": o de role e o de utilizador abrem, têm os campos, validam, criam e o
// resultado aparece na lista (em memória). Sem testes de interação exaustivos.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";

// Quem testa a lista e os formulários tem todas as permissões; as permissões por separador estão em
// UtilizadoresPerfisSeparadores.test.tsx.
vi.mock("@/components/utilizadores-perfis/hooks/usePermissoesPerfis", () => ({
  usePermissoesPerfis: () => ({ carregando: false, permitidos: ["utilizadores", "roles", "portal"], tem: () => true }),
}));

// Os utilizadores vêm da base (testados em UtilizadoresPerfisUtilizadores.test.tsx): aqui o wrapper é simulado e vazio.
vi.mock("@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloFalso());

// As roles vêm da base (testadas em UtilizadoresPerfisRoles.test.tsx e em hooks/): aqui o wrapper é simulado, com as roles e as
// 229 permissões de exemplo, e as ações de criar e guardar mexem numa lista em estado (nova a cada montagem da página).
vi.mock("@/components/utilizadores-perfis/hooks/useRolesPerfis", async () => {
  const { useState } = await import("react");
  const { ROLES_EXEMPLO, PERMISSOES, EDITOR_EXEMPLO } = await import("@/components/utilizadores-perfis/catalogoExemplo");
  return {
    useRolesPerfis: () => {
      const [roles, setRoles] = useState(ROLES_EXEMPLO);
      const ok = { ok: true as const };
      return {
        roles, lista: roles, estado: { carregando: false, erro: null, semOrganizacao: false }, recarregar: () => {},
        verEliminadas: false, mudarVerEliminadas: () => {},
        catalogo: { catalogo: PERMISSOES, editor: EDITOR_EXEMPLO, visiveis: PERMISSOES, carregando: false, erro: null },
        modelos: { modelos: [], carregando: false, erro: null },
        contagem: { contagem: Object.fromEntries(roles.map((r) => [r.id, 0])), disponivel: true, erro: null },
        permissoesPorRole: Object.fromEntries(roles.map((r) => [r.id, r.permissoes.length])),
        autorizacoes: { podeCriar: true, podeEditar: () => true, podeEliminar: () => true, podeRestaurar: () => true },
        acoes: {
          criar: async (d: { nome: string; codigo: string; descricao: string; podeAssinar: boolean; permissoes: string[] }) => {
            setRoles((rs) => [...rs, { id: `nova-${d.codigo}`, codigo: d.codigo, nome: d.nome, descricao: d.descricao, sistema: false, podeAssinar: d.podeAssinar, permissoes: d.permissoes }]);
            return ok;
          },
          guardar: async (id: string, d: { nome: string; codigo: string; descricao: string; podeAssinar: boolean; permissoes: string[] }) => {
            setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...d } : r)));
            return ok;
          },
          eliminar: async () => ok, restaurar: async () => ok, aGravar: false,
        },
      };
    },
  };
});

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

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  // O Switch do Radix, dentro de um formulário, mede-se com um ResizeObserver, que o jsdom não tem.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

const renderPage = () => render(<MemoryRouter><UtilizadoresPerfis /></MemoryRouter>);
const irParaTab = (nome: RegExp, dentro: HTMLElement | Document = document.body) => {
  const aba = within(dentro as HTMLElement).getByRole("tab", { name: nome });
  fireEvent.mouseDown(aba);
  fireEvent.click(aba);
};
const escolher = async (dialogo: HTMLElement, campo: RegExp, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};
const escrever = (dialogo: HTMLElement, campo: RegExp, valor: string) =>
  fireEvent.change(within(dialogo).getByRole("textbox", { name: campo }), { target: { value: valor } });

describe("formulário de role", () => {
  const abrirNovaRole = () => {
    renderPage();
    irParaTab(/^Roles/);
    fireEvent.click(screen.getByRole("button", { name: "Nova role" }));
    return screen.getByRole("dialog", { name: "Nova role" });
  };

  it("abre com cabeçalho, selo, aviso de exemplo, abas e rodapé com Cancelar e Criar role", () => {
    const form = abrirNovaRole();
    expect(within(form).getByText("Novo · por gravar")).toBeInTheDocument();
    // Comportamento que mudou de propósito: o formulário já grava na base, por isso deixou de avisar que é só exemplo.
    expect(within(form).queryByText(/Só exemplo/)).not.toBeInTheDocument();
    expect(within(form).getByRole("navigation", { name: "Onde está" })).toBeInTheDocument();
    expect(within(form).getAllByRole("tab").map((a) => a.textContent)).toEqual(["Geral", expect.stringContaining("Permissões")]);
    expect(within(form).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Criar role" })).toBeInTheDocument();
    expect(within(form).getByRole("textbox", { name: /^Nome/ })).toHaveFocus();
    expect(within(form).getByRole("textbox", { name: /^Código/ })).toBeInTheDocument();
    expect(within(form).getByRole("switch", { name: "Pode assinar contratos" })).toBeInTheDocument();
    expect(within(form).getByRole("combobox", { name: "Começar de um modelo" })).toHaveTextContent("Em branco");
  });

  it("o código acompanha o nome até ser editado à mão", () => {
    const form = abrirNovaRole();
    escrever(form, /^Nome/, "Gestor de Parceiros");
    expect(within(form).getByRole("textbox", { name: /^Código/ })).toHaveValue("gestor_de_parceiros");
    escrever(form, /^Código/, "meu_codigo");
    escrever(form, /^Nome/, "Outro nome");
    expect(within(form).getByRole("textbox", { name: /^Código/ })).toHaveValue("meu_codigo");
  });

  it("recusa nome vazio e código repetido, com erro por campo ligado por aria-describedby", () => {
    const form = abrirNovaRole();
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    const nome = within(form).getByRole("textbox", { name: /^Nome/ });
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(nome.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Indique o nome da role.");
    escrever(form, /^Nome/, "Comercial");
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    expect(within(form).getByText("Outra role já usa este código.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Nova role" })).toBeInTheDocument();
  });

  it("a matriz tem as 229 permissões, bloqueia o que precisa de Ver e pede confirmação para uma perigosa", async () => {
    const form = abrirNovaRole();
    irParaTab(/^Permissões/, form);
    expect(within(form).getByText("0 de 229 permissões concedidas")).toBeInTheDocument();
    fireEvent.change(within(form).getByRole("searchbox"), { target: { value: "clientes" } });
    const eliminar = within(form).getByRole("checkbox", { name: "Eliminar clientes" });
    expect(eliminar).toBeDisabled();
    expect(within(form).getAllByText("Precisa primeiro da permissão Ver").length).toBeGreaterThan(0);
    fireEvent.click(within(form).getByRole("checkbox", { name: "Ver clientes" }));
    expect(within(form).getByText("1 de 229 permissões concedidas")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("checkbox", { name: "Eliminar clientes" }));
    const aviso = await screen.findByRole("alertdialog");
    expect(within(aviso).getByText(/Eliminar clientes/)).toBeInTheDocument();
    fireEvent.click(within(aviso).getByRole("button", { name: "Conceder" }));
    await waitFor(() => expect(within(form).getByText("2 de 229 permissões concedidas")).toBeInTheDocument());
  });

  it("cria a role: fecha, avisa e a role nova aparece na lista com 0 utilizadores", async () => {
    const form = abrirNovaRole();
    escrever(form, /^Nome/, "Gestor de Parceiros");
    fireEvent.click(within(form).getByRole("button", { name: "Criar role" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nova role" })).not.toBeInTheDocument());
    const linha = screen.getByRole("button", { name: "Gestor de Parceiros" }).closest("tr")!;
    expect(within(linha).getByText("gestor_de_parceiros")).toBeInTheDocument();
    expect(within(linha).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Roles/ })).toHaveAccessibleName(/8/);
    expect(document.body.textContent).toContain("Role Gestor de Parceiros criada. Está na lista.");
  });

  it("editar abre a partir da linha com os dados da role; as de sistema abrem só para ver", () => {
    renderPage();
    irParaTab(/^Roles/);
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Comercial" }));
    let form = screen.getByRole("dialog", { name: "Editar role" });
    expect(within(form).getByRole("textbox", { name: /^Código/ })).toHaveValue("comercial");
    expect(within(form).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Super administrador" }));
    form = screen.getByRole("dialog", { name: "Editar role" });
    expect(within(form).getByRole("textbox", { name: /^Nome/ })).toHaveAttribute("readonly");
    expect(within(form).getByRole("textbox", { name: /^Código/ })).toHaveAttribute("readonly");
    expect(within(form).getByText(/Role de sistema: só podes ver as permissões/)).toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("guardar uma edição muda o nome na lista; duplicar abre pré-preenchido com (cópia)", async () => {
    renderPage();
    irParaTab(/^Roles/);
    fireEvent.click(screen.getByRole("button", { name: "Editar a role Comercial" }));
    const form = screen.getByRole("dialog", { name: "Editar role" });
    escrever(form, /^Nome/, "Comercial Sénior");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Comercial Sénior" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Comercial Sénior" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Duplicar" }));
    const copia = await screen.findByRole("dialog", { name: "Duplicar role" });
    expect(within(copia).getByRole("textbox", { name: /^Nome/ })).toHaveValue("Comercial Sénior (cópia)");
  });
});
