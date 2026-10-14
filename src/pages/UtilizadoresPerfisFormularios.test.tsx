// Arranque dos formulários de "Utilizadores e perfis": o de role e o de utilizador abrem, têm os campos, validam, criam e o
// resultado aparece na lista (em memória). Sem testes de interação exaustivos.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UtilizadoresPerfis from "./UtilizadoresPerfis";
import { repor } from "@/components/utilizadores-perfis/perfisStore";

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
beforeEach(repor);
afterEach(repor);

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
    expect(within(form).getByText(/Só exemplo: nada é gravado/)).toBeInTheDocument();
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
    expect(document.body.textContent).toContain("Role Gestor de Parceiros criada. Está na lista com 0 utilizadores.");
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

describe("formulário de utilizador", () => {
  const abrirConvite = () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Convidar utilizador" }));
    return screen.getByRole("dialog", { name: "Convidar utilizador" });
  };

  it("abre com as abas Dados, Vínculos e Permissões e os campos do ecrã atual, sem filial nem local de trabalho", () => {
    const form = abrirConvite();
    expect(within(form).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(form).getAllByRole("tab").map((a) => a.textContent)).toEqual(
      [expect.stringContaining("Dados"), expect.stringContaining("Vínculos"), expect.stringContaining("Permissões")],
    );
    for (const campo of [/^Nome/, /^Email/, /^Telefone/, /^Morada/, /^Posição na plataforma/]) {
      expect(within(form).getByRole("textbox", { name: campo })).toBeInTheDocument();
    }
    expect(within(form).getByLabelText(/^Palavra-passe/)).toHaveAttribute("type", "password");
    expect(within(form).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Convidado");
    expect(within(form).queryByRole("textbox", { name: /filial|local de trabalho|cargo/i })).not.toBeInTheDocument();
    expect(within(form).queryByRole("combobox", { name: /filial|local de trabalho|cargo/i })).not.toBeInTheDocument();
    expect(within(form).getByRole("textbox", { name: /^Nome/ })).toHaveFocus();
  });

  it("valida por campo e leva à aba com erros", () => {
    const form = abrirConvite();
    fireEvent.click(within(form).getByRole("button", { name: "Criar utilizador" }));
    expect(within(form).getByText("Indique o nome do utilizador.")).toBeInTheDocument();
    expect(within(form).getByText("Indique o email.")).toBeInTheDocument();
    expect(within(form).getByText("Defina uma palavra-passe.")).toBeInTheDocument();
    expect(within(form).getByRole("tab", { name: /Dados.*tem erros/ })).toBeInTheDocument();
  });

  it("cria o utilizador (13.º), como Convidado, e aparece na lista", async () => {
    const form = abrirConvite();
    escrever(form, /^Nome/, "Ana Prata");
    escrever(form, /^Email/, "ana.prata@exemplo.pt");
    fireEvent.change(within(form).getByLabelText(/^Palavra-passe/), { target: { value: "segredo123" } });
    irParaTab(/^Vínculos/, form);
    await escolher(form, /^Organização/, "Grupo Aurora");
    await escolher(form, /^Role/, "Comercial");
    fireEvent.click(within(form).getByRole("button", { name: "Criar utilizador" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Convidar utilizador" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /^Utilizadores/ })).toHaveAccessibleName(/13/);
    expect(screen.getByText("A mostrar 12 de 13 utilizadores")).toBeInTheDocument();
    const linha = screen.getByRole("button", { name: /Ana Prata/ }).closest("tr")!;
    expect(within(linha).getByText("Convidado")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("segredo123");
  });

  it("editar abre a partir da ficha, no separador pedido, e guarda; o super administrador não se edita", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Marta Silveira/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Editar utilizador" }));
    const form = await screen.findByRole("dialog", { name: "Editar utilizador" });
    expect(within(form).getByRole("textbox", { name: /^Email/ })).toHaveValue("marta.silveira@exemplo.pt");
    escrever(form, /^Nome/, "Marta S. Silveira");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar utilizador" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Marta S\. Silveira/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Helena Marques/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Editar utilizador" })).toBeDisabled();
  });

  it("desativar pede confirmação, muda o estado e o filtro Ativos reage; reativar volta", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Tiago Valente/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Desativar" }));
    const confirmar = await screen.findByRole("alertdialog");
    expect(within(confirmar).getByText("Desativar Tiago Valente?")).toBeInTheDocument();
    fireEvent.click(within(confirmar).getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Reativar" })).toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByText("A mostrar 10 de 12 utilizadores")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Tiago Valente/ })).not.toBeInTheDocument();
  });
});
