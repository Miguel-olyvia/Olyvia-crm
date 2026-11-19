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

describe("FormEmailsTab por idioma: formulário sem mais de um idioma ativo", () => {
  it.each([[undefined], [[]], [["pt"]]])("com activeLocales=%j mantém o seletor único de sempre", (locales) => {
    renderTab(base, locales as string[] | undefined);
    expect(document.querySelector("#confirmation-email-template")).not.toBeNull();
    expect(document.querySelector("#confirmation-email-template-pt")).toBeNull();
    expect(screen.queryByRole("group", { name: /modelos por idioma/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem modelo em/)).not.toBeInTheDocument();
  });

  it("escolher um modelo grava só a coluna única (sem tocar no mapa por idioma)", async () => {
    const { onChange } = renderTab(base, ["pt"]);
    await openAndPick(screen.getByLabelText("Modelo de email", { selector: "#confirmation-email-template" }), "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ ...base, confirmation_email_template_id: "t1" });
  });
});

describe("FormEmailsTab por idioma: português e inglês ativos", () => {
  it("mostra um seletor por idioma no cartão de cada finalidade, com rótulo e id próprios", () => {
    renderTab(base, ["pt", "en"]);
    const group = confirmationGroup();
    const pt = within(group).getByRole("combobox", { name: "Modelo de email — Português" });
    const en = within(group).getByRole("combobox", { name: "Modelo de email — English" });
    expect(pt).toHaveAttribute("id", "confirmation-email-template-pt");
    expect(en).toHaveAttribute("id", "confirmation-email-template-en");
    expect(document.querySelector("#confirmation-email-template")).toBeNull();
  });

  it("são 8 finalidades x 2 idiomas, com os ids todos distintos", () => {
    renderTab(base, ["pt", "en"]);
    const boxes = screen.getAllByRole("combobox").filter((el) => /-(pt|en)$/.test(el.id));
    const ids = boxes.map((el) => el.id);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    expect(ids).toEqual(
      expect.arrayContaining([
        "confirmation-email-template-pt",
        "reminder-client-template-en",
        "reschedule-client-template-pt",
        "cancel-client-template-en",
        "meeting-notify-template-pt",
        "reminder-technician-template-en",
        "reschedule-technician-template-pt",
        "cancel-technician-template-en",
      ]),
    );
  });

  it("cada finalidade tem o seu grupo, com nome único", () => {
    renderTab(base, ["pt", "en"]);
    const groups = screen.getAllByRole("group", { name: /modelos por idioma/ });
    expect(groups).toHaveLength(8);
    const names = groups.map((g) => g.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(8);
  });

  it("o idioma por omissão do formulário vem primeiro", () => {
    renderTab(base, ["en", "pt"]);
    const boxes = within(confirmationGroup()).getAllByRole("combobox");
    expect(boxes.map((b) => b.id)).toEqual(["confirmation-email-template-en", "confirmation-email-template-pt"]);
  });

  it("só mostra os seletores das finalidades que estão ligadas", () => {
    renderTab({ ...base, reschedule_notify_client: false, confirmation_email_enabled: false }, ["pt", "en"]);
    expect(document.querySelector("#reschedule-client-template-pt")).toBeNull();
    expect(document.querySelector("#confirmation-email-template-en")).toBeNull();
    expect(document.querySelector("#cancel-client-template-en")).not.toBeNull();
  });

  it("os seletores têm pelo menos 44px de altura", () => {
    renderTab(base, ["pt", "en"]);
    for (const el of within(confirmationGroup()).getAllByRole("combobox")) {
      expect(el.className).toContain("min-h-[44px]");
    }
  });

  it("um idioma com nome conhecido usa o nome; sem nome conhecido usa o código", () => {
    renderTab(base, ["pt", "es", "xx"]);
    const group = confirmationGroup();
    expect(within(group).getByRole("combobox", { name: "Modelo de email — Español" })).toBeInTheDocument();
    expect(within(group).getByRole("combobox", { name: "Modelo de email — XX" })).toBeInTheDocument();
  });

  it("variantes regionais contam como o mesmo idioma", () => {
    renderTab(base, ["pt-PT", "pt-BR", "en"]);
    expect(within(confirmationGroup()).getAllByRole("combobox")).toHaveLength(2);
  });
});

describe("FormEmailsTab por idioma: o que cada seletor mostra", () => {
  it("o idioma por omissão mostra a coluna única", () => {
    renderTab({ ...base, confirmation_email_template_id: "t1" }, ["pt", "en"]);
    const pt = box("Português");
    expect(pt).toHaveTextContent("Modelo A");
  });

  it("o mapa por idioma tem prioridade sobre a coluna no idioma por omissão", () => {
    renderTab(
      { ...base, confirmation_email_template_id: "t1", email_locale_templates: { confirmation: { pt: "t2" } } },
      ["pt", "en"],
    );
    expect(box("Português")).toHaveTextContent("Modelo B");
  });

  it("o idioma sem modelo próprio e sem modelo por omissão mostra «Modelo padrão do sistema»", () => {
    renderTab(base, ["pt", "en"]);
    expect(box("English")).toHaveTextContent("Modelo padrão do sistema");
  });

  it("o idioma sem modelo próprio, havendo modelo por omissão, mostra o modelo por omissão (sem o atribuir a um idioma)", () => {
    renderTab({ ...base, confirmation_email_template_id: "t1" }, ["pt", "en"]);
    const en = box("English");
    expect(en).toHaveTextContent("Modelo por omissão: Modelo A");
    expect(en).not.toHaveTextContent("Modelo padrão do sistema");
  });

  it("o idioma com modelo próprio mostra esse modelo", () => {
    renderTab(
      { ...base, confirmation_email_template_id: "t1", email_locale_templates: { confirmation: { en: "t2" } } },
      ["pt", "en"],
    );
    expect(box("English")).toHaveTextContent("Modelo B");
  });

  it("nas finalidades do comercial a opção por omissão é a do comercial", () => {
    renderTab(base, ["pt", "en"]);
    expect(document.querySelector("#reschedule-technician-template-en")).toHaveTextContent(
      "Modelo padrão do sistema (comercial)",
    );
    expect(document.querySelector("#cancel-technician-template-pt")).toHaveTextContent(
      "Modelo padrão do sistema (comercial)",
    );
  });
});

describe("FormEmailsTab por idioma: gravação", () => {
  it("escolher no idioma secundário grava só no mapa e deixa a coluna única como estava", async () => {
    const { onChange } = renderTab({ ...base, confirmation_email_template_id: "t1" }, ["pt", "en"]);
    await openAndPick(box("English"), "Modelo B");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { en: "t2" } },
    });
  });

  it("escolher no idioma por omissão grava na coluna única E no mapa", async () => {
    const { onChange } = renderTab(base, ["pt", "en"]);
    await openAndPick(box("Português"), "Modelo A");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { pt: "t1" } },
    });
  });

  it("voltar ao modelo padrão no idioma por omissão limpa a coluna e a entrada do mapa", async () => {
    const { onChange } = renderTab(
      {
        ...base,
        confirmation_email_template_id: "t1",
        email_locale_templates: { confirmation: { pt: "t1", en: "t2" }, reminder: { pt: "t1" } },
      },
      ["pt", "en"],
    );
    await openAndPick(box("Português"), "Modelo padrão do sistema");
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: null,
      email_locale_templates: { confirmation: { en: "t2" }, reminder: { pt: "t1" } },
    });
  });

  it("retirar o modelo próprio de um idioma só apaga esse idioma e preserva o resto do mapa", async () => {
    const { onChange } = renderTab(
      {
        ...base,
        confirmation_email_template_id: "t1",
        email_locale_templates: { confirmation: { en: "t2", fr: "t1" }, reminder: { en: "t2" } },
      },
      ["pt", "en"],
    );
    await openAndPick(box("English"), /^Modelo por omissão/);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({
      ...base,
      confirmation_email_template_id: "t1",
      email_locale_templates: { confirmation: { fr: "t1" }, reminder: { en: "t2" } },
    });
  });

  it("não altera o branding recebido", async () => {
    const branding = { ...base, email_locale_templates: { confirmation: { pt: "t1" } } };
    const snapshot = JSON.parse(JSON.stringify(branding));
    const { onChange } = renderTab(branding, ["pt", "en"]);
    await openAndPick(box("English"), "Modelo B");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(branding).toEqual(snapshot);
  });
});
