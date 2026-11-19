import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { base, box, confirmationGroup, openAndPick, renderTab } from "./emailsTabTestUtils";
import { ui } from "./emailsTabUi";

vi.mock("@/contexts/LanguageContext", async () => {
  const { ui: state } = await import("./emailsTabUi");
  return { useLanguage: () => ({ language: state.language }) };
});

afterEach(() => {
  ui.language = "pt";
});

describe("FormEmailsTab por idioma: aviso de modelo em falta", () => {
  it("sem modelo por omissão, avisa uma só vez por finalidade e nomeia os idiomas, sem bloquear", () => {
    renderTab(base, ["pt", "en"]);
    const group = confirmationGroup();
    expect(within(group).getAllByText(/Sem modelo em/)).toHaveLength(1);
    expect(within(group).getByText("Sem modelo em Português, English: vai usar o modelo por omissão.")).toBeInTheDocument();
    for (const el of within(group).getAllByRole("combobox")) {
      expect(el).toBeEnabled();
    }
  });

  it("com um modelo por omissão, avisa só nos idiomas sem modelo próprio", () => {
    renderTab({ ...base, confirmation_email_template_id: "t1" }, ["pt", "en", "es"]);
    const group = confirmationGroup();
    expect(within(group).getByText("Sem modelo em English: vai usar o modelo por omissão.")).toBeInTheDocument();
    expect(within(group).getByText("Sem modelo em Español: vai usar o modelo por omissão.")).toBeInTheDocument();
    expect(within(group).queryByText(/Sem modelo em Português/)).not.toBeInTheDocument();
  });

  it("sem modelo por omissão, o idioma com modelo próprio não entra na lista do aviso", () => {
    renderTab({ ...base, email_locale_templates: { confirmation: { en: "t2" } } }, ["pt", "en"]);
    expect(within(confirmationGroup()).getByText("Sem modelo em Português: vai usar o modelo por omissão.")).toBeInTheDocument();
  });

  it("o aviso desaparece quando todos os idiomas têm modelo", () => {
    renderTab(
      { ...base, confirmation_email_template_id: "t1", email_locale_templates: { confirmation: { en: "t2" } } },
      ["pt", "en"],
    );
    expect(within(confirmationGroup()).queryByText(/Sem modelo em/)).not.toBeInTheDocument();
  });

  it("o aviso de uma finalidade não aparece no cartão de outra que já tem modelos", () => {
    renderTab({ ...base, reminder_template_id: "t1", email_locale_templates: { reminder: { en: "t2" } } }, ["pt", "en"]);
    expect(within(confirmationGroup()).getByText(/Sem modelo em/)).toBeInTheDocument();
    const reminder = screen.getByRole("group", { name: "Lembrete antes da visita: modelos por idioma" });
    expect(within(reminder).queryByText(/Sem modelo em/)).not.toBeInTheDocument();
  });

  it("o aviso do grupo fica ligado aos seletores que cobre (aria-describedby)", () => {
    renderTab({ ...base, email_locale_templates: { confirmation: { en: "t2" } } }, ["pt", "en"]);
    const noteId = box("Português").getAttribute("aria-describedby");
    expect(noteId).toBe("confirmation-email-template-note");
    expect(document.getElementById(noteId as string)).toHaveTextContent("Sem modelo em Português");
    expect(box("English")).not.toHaveAttribute("aria-describedby");
  });

  it("o aviso de um idioma fica ligado ao seu seletor", () => {
    renderTab({ ...base, confirmation_email_template_id: "t1" }, ["pt", "en"]);
    const noteId = box("English").getAttribute("aria-describedby");
    expect(noteId).toBe("confirmation-email-template-en-note");
    expect(document.getElementById(noteId as string)).toHaveTextContent("Sem modelo em English");
    expect(box("Português")).not.toHaveAttribute("aria-describedby");
  });

  it("o aviso não é um alerta (não interrompe quem usa leitor de ecrã)", () => {
    renderTab(base, ["pt", "en"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("segue a língua da interface (inglês)", () => {
    ui.language = "en";
    renderTab(base, ["pt", "en"]);
    expect(screen.getAllByRole("combobox", { name: "Email template — English" })[0]).toBeInTheDocument();
    expect(screen.getAllByText("No template for Português, English: the default template will be used.").length).toBeGreaterThan(0);
  });

  it("o nome do grupo também segue a língua da interface", () => {
    ui.language = "en";
    renderTab(base, ["pt", "en"]);
    expect(screen.getByRole("group", { name: "Confirmation email: templates by language" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Notice to the salesperson on cancel: templates by language" })).toBeInTheDocument();
  });
});

describe("FormEmailsTab por idioma: um só seletor, mas o mapa já tem entrada do idioma por omissão", () => {
  it("grava a coluna e a entrada do mapa, que o servidor usa antes da coluna", async () => {
    const withMap = { ...base, email_locale_templates: { confirmation: { pt: "t2", fr: "t9" } } };
    const { onChange } = renderTab(withMap, ["pt"]);
    await openAndPick(document.querySelector("#confirmation-email-template") as HTMLElement, "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...withMap,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { pt: "t1", fr: "t9" } },
    });
  });

  it("mostra o modelo que o servidor vai usar (o do mapa, não o da coluna)", () => {
    renderTab(
      { ...base, confirmation_email_template_id: "t1", email_locale_templates: { confirmation: { pt: "t2" } } },
      ["pt"],
    );
    expect(document.querySelector("#confirmation-email-template")).toHaveTextContent("Modelo B");
  });

  it("limpar o modelo limpa também a entrada do mapa, e uma entrada em variante regional conta", async () => {
    const withMap = {
      ...base,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { "pt-PT": "t1", en: "t2" } },
    };
    const { onChange } = renderTab(withMap, ["pt"]);
    await openAndPick(document.querySelector("#confirmation-email-template") as HTMLElement, "Modelo padrão do sistema");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...withMap,
      confirmation_email_template_id: null,
      email_locale_templates: { confirmation: { en: "t2" } },
    });
  });

  it("sem entrada do idioma por omissão no mapa, não mexe no mapa (continua só a coluna)", async () => {
    const withMap = { ...base, email_locale_templates: { confirmation: { en: "t2" } } };
    const { onChange } = renderTab(withMap, ["pt"]);
    await openAndPick(document.querySelector("#confirmation-email-template") as HTMLElement, "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ ...withMap, confirmation_email_template_id: "t1" });
  });
});

describe("FormEmailsTab por idioma: trocar o modelo do idioma por omissão não muda os outros em silêncio", () => {
  it("os idiomas sem modelo próprio ficam com o modelo que a coluna tinha", async () => {
    const { onChange } = renderTab({ ...base, confirmation_email_template_id: "t1" }, ["en", "pt"]);
    await openAndPick(box("English"), "Modelo B");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t2",
      email_locale_templates: { confirmation: { en: "t2", pt: "t1" } },
    });
  });

  it("também quando se volta ao modelo padrão", async () => {
    const { onChange } = renderTab({ ...base, confirmation_email_template_id: "t1" }, ["en", "pt"]);
    await openAndPick(box("English"), "Modelo padrão do sistema");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: null,
      email_locale_templates: { confirmation: { pt: "t1" } },
    });
  });

  it("não sobrescreve um idioma que já tem modelo próprio", async () => {
    const { onChange } = renderTab(
      { ...base, confirmation_email_template_id: "t1", email_locale_templates: { confirmation: { pt: "t2" } } },
      ["en", "pt", "es"],
    );
    await openAndPick(box("English"), "Modelo B");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t2",
      email_locale_templates: { confirmation: { en: "t2", pt: "t2", es: "t1" } },
    });
  });

  it("sem modelo anterior não há nada a copiar", async () => {
    const { onChange } = renderTab(base, ["en", "pt"]);
    await openAndPick(box("English"), "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { en: "t1" } },
    });
  });
});

describe("FormEmailsTab por idioma: chaves regionais no mapa", () => {
  it("gravar um idioma tira as variantes dele e preserva o que o ecrã não mostra", async () => {
    const { onChange } = renderTab(
      { ...base, email_locale_templates: { confirmation: { "pt-pt": "t1", PT_pt: "t2", fr: "t9" }, outra: { pt: "z" } } },
      ["pt", "en"],
    );
    await openAndPick(box("Português"), "Modelo B");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].email_locale_templates).toEqual({
      confirmation: { pt: "t2", fr: "t9" },
      outra: { pt: "z" },
    });
  });
});

describe("FormEmailsTab por idioma: modelo que já não existe", () => {
  it("mostra «Modelo indisponível» em vez de um seletor em branco", () => {
    renderTab({ ...base, email_locale_templates: { confirmation: { en: "apagado" } } }, ["pt", "en"]);
    expect(box("English")).toHaveTextContent("Modelo indisponível");
  });

  it("vale também para a coluna no seletor único", () => {
    renderTab({ ...base, confirmation_email_template_id: "apagado" });
    expect(document.querySelector("#confirmation-email-template")).toHaveTextContent("Modelo indisponível");
  });

  it("o modelo indisponível continua a poder ser trocado", async () => {
    const { onChange } = renderTab({ ...base, email_locale_templates: { confirmation: { en: "apagado" } } }, ["pt", "en"]);
    await openAndPick(box("English"), "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0][0].email_locale_templates).toEqual({ confirmation: { en: "t1" } });
  });
});
