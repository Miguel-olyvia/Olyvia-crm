import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FormEmailsTab, type EmailsTabFields } from "../FormEmailsTab";
import { SMS_BASE_MESSAGE } from "@/lib/formSmsBase";
import { base, OPTIONS } from "./emailsTabTestUtils";
import { ui } from "./emailsTabUi";

vi.mock("@/contexts/LanguageContext", async () => {
  const { ui: state } = await import("./emailsTabUi");
  return { useLanguage: () => ({ language: state.language }) };
});

afterEach(() => {
  ui.language = "pt";
});

const smsOn: EmailsTabFields = { ...base, confirmation_sms_enabled: true, confirmation_sms_message: "Texto PT" };
const GROUP = "Mensagem do SMS: textos por idioma";
const LINK_BTN = "Inserir variável Link gerir/cancelar {{cancel_url}}";
const NAME_BTN = "Inserir variável Nome do cliente {{lead_name}}";

function renderSms(opts: {
  branding?: EmailsTabFields;
  locales?: string[];
  smsByLocale?: Record<string, string>;
  withHandler?: boolean;
}) {
  const onChange = vi.fn();
  const onSmsLocaleChange = vi.fn();
  render(
    <FormEmailsTab
      branding={opts.branding ?? smsOn}
      onChange={onChange}
      emailTemplateOptions={OPTIONS}
      smtpOptions={[]}
      activeLocales={opts.locales}
      smsByLocale={opts.smsByLocale}
      onSmsLocaleChange={opts.withHandler === false ? undefined : onSmsLocaleChange}
    />,
  );
  return { onChange, onSmsLocaleChange };
}

// Por papel e nome: o grupo que envolve cada caixa tem o mesmo nome (anuncia caixa e botões juntos).
const field = (language: string) => screen.getByRole("textbox", { name: `Mensagem do SMS — ${language}` }) as HTMLTextAreaElement;
const fieldGroup = (language: string) => screen.getByRole("group", { name: `Mensagem do SMS — ${language}` });

describe("SMS de confirmação por idioma: um só idioma", () => {
  it.each([[undefined], [[]], [["pt"]]])("com activeLocales=%j mantém a caixa única de sempre", (locales) => {
    renderSms({ locales: locales as string[] | undefined });
    expect(document.querySelector("#confirmation-sms-message")).not.toBeNull();
    expect(screen.getByLabelText("Mensagem do SMS")).toHaveValue("Texto PT");
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });

  it("com vários idiomas mas sem quem guarde os outros textos, mantém a caixa única", () => {
    renderSms({ locales: ["pt", "en"], withHandler: false });
    expect(document.querySelector("#confirmation-sms-message")).not.toBeNull();
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });

  it("com o SMS desligado não mostra caixa nenhuma", () => {
    renderSms({ branding: { ...smsOn, confirmation_sms_enabled: false }, locales: ["pt", "en"] });
    expect(screen.queryByLabelText(/Mensagem do SMS/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
  });
});

describe("SMS de confirmação por idioma: português e inglês ativos", () => {
  it("mostra uma caixa por idioma, com rótulo e id próprios, no mesmo grupo", () => {
    renderSms({ locales: ["pt", "en"], smsByLocale: { en: "Hi there" } });
    const group = screen.getByRole("group", { name: GROUP });
    expect(within(group).getByRole("textbox", { name: "Mensagem do SMS — Português" })).toHaveAttribute("id", "confirmation-sms-message-pt");
    expect(within(group).getByRole("textbox", { name: "Mensagem do SMS — English" })).toHaveAttribute("id", "confirmation-sms-message-en");
    expect(document.querySelector("#confirmation-sms-message")).toBeNull();
    expect(field("Português")).toHaveValue("Texto PT");
    expect(field("English")).toHaveValue("Hi there");
  });

  it("o idioma por omissão vem primeiro", () => {
    renderSms({ locales: ["en", "pt"], smsByLocale: { pt: "Olá" } });
    const ids = within(screen.getByRole("group", { name: GROUP })).getAllByRole("textbox").map((el) => el.id);
    expect(ids).toEqual(["confirmation-sms-message-en", "confirmation-sms-message-pt"]);
    expect(field("Português")).toHaveValue("Olá");
  });

  it("escrever no idioma por omissão grava a coluna única, sem tocar nos outros idiomas", () => {
    const { onChange, onSmsLocaleChange } = renderSms({ locales: ["pt", "en"], smsByLocale: { en: "Hi" } });
    fireEvent.change(field("Português"), { target: { value: "Novo texto" } });
    expect(onChange).toHaveBeenCalledWith({ ...smsOn, confirmation_sms_message: "Novo texto" });
    expect(onSmsLocaleChange).not.toHaveBeenCalled();
  });

  it("escrever noutro idioma grava só o texto desse idioma, sem tocar na coluna única", () => {
    const { onChange, onSmsLocaleChange } = renderSms({ locales: ["pt", "en"], smsByLocale: { en: "Hi" } });
    fireEvent.change(field("English"), { target: { value: "Hello {{lead_name}}" } });
    expect(onSmsLocaleChange).toHaveBeenCalledWith("en", "Hello {{lead_name}}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cada caixa tem os botões de variáveis e inserem na sua própria caixa", () => {
    const { onChange, onSmsLocaleChange } = renderSms({ locales: ["pt", "en"], smsByLocale: { en: "Hi" } });
    fireEvent.click(within(fieldGroup("English")).getByRole("button", { name: NAME_BTN }));
    expect(onSmsLocaleChange).toHaveBeenCalledWith("en", "Hi{{lead_name}}");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(fieldGroup("Português")).getByRole("button", { name: NAME_BTN }));
    expect(onChange).toHaveBeenCalledWith({ ...smsOn, confirmation_sms_message: "Texto PT{{lead_name}}" });
  });

  it("sem o link ligado, o botão do link está inativo em cada caixa", () => {
    renderSms({ locales: ["pt", "en"] });
    for (const language of ["Português", "English"]) {
      expect(within(fieldGroup(language)).getByRole("button", { name: LINK_BTN })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("com o link ligado, o botão do link está ativo nas duas caixas", () => {
    renderSms({ branding: { ...smsOn, confirmation_sms_include_link: true }, locales: ["pt", "en"] });
    for (const language of ["Português", "English"]) {
      expect(within(fieldGroup(language)).getByRole("button", { name: LINK_BTN })).not.toHaveAttribute("aria-disabled");
    }
  });

  it("o texto que se vê quando a caixa está vazia é o que o servidor vai usar", () => {
    renderSms({ branding: { ...smsOn, confirmation_sms_message: "" }, locales: ["pt", "en"] });
    expect(field("Português").placeholder).toContain(SMS_BASE_MESSAGE.pt);
    expect(field("English").placeholder).toContain(SMS_BASE_MESSAGE.en);
  });

  it("noutro idioma, com texto no idioma por omissão, o texto vazio mostra esse texto (é o que o servidor usa)", () => {
    renderSms({ locales: ["pt", "en"] });
    expect(field("English").placeholder).toContain("Texto PT");
  });

  it("noutro idioma, a ajuda diz de que idioma vem a mensagem quando fica vazio", () => {
    renderSms({ locales: ["pt", "en"] });
    expect(within(fieldGroup("English")).getByText(/Se ficar vazio, usa a mensagem de Português/)).toBeInTheDocument();
    expect(within(fieldGroup("Português")).queryByText(/Se ficar vazio, usa a mensagem de/)).not.toBeInTheDocument();
  });

  it("três idiomas: uma caixa por idioma, com o código quando não há nome", () => {
    renderSms({ locales: ["pt", "en", "xx"] });
    expect(screen.getByRole("textbox", { name: "Mensagem do SMS — XX" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: GROUP })).getAllByRole("textbox")).toHaveLength(3);
  });

  it("segue a língua da interface (inglês)", () => {
    ui.language = "en";
    renderSms({ locales: ["pt", "en"] });
    expect(screen.getByRole("group", { name: "SMS message: texts by language" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "SMS message — English" })).toBeInTheDocument();
    expect(screen.getByText(/If left empty, the Português message is used/)).toBeInTheDocument();
  });
});
