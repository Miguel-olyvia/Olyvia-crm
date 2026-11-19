import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormBrandingConfig } from "../FormBrandingConfig";
import { openAndPick } from "./emailsTabTestUtils";

// Radix (ScrollArea, Select) precisa disto no jsdom
globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

type Result = { data: unknown; error: unknown };
type Write = { table: string; op: "update" | "insert"; payload: Record<string, unknown> };

const db = vi.hoisted(() => ({
  brandingRow: null as Record<string, unknown> | null,
  forms: (() => Promise.resolve({ data: null, error: null })) as () => Promise<Result>,
  writes: [] as Write[],
  toastError: vi.fn(),
  formsWriteError: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => {
  const OPTIONS = [
    { id: "t1", name: "Modelo A" },
    { id: "t2", name: "Modelo B" },
  ];
  const chain = (table: string) => {
    let wrote = false;
    const result = (): Promise<Result> => {
      if (wrote) return Promise.resolve({ data: null, error: table === "forms" ? db.formsWriteError : null });
      if (table === "forms") return db.forms();
      if (table === "form_branding") return Promise.resolve({ data: db.brandingRow, error: null });
      if (table === "email_templates") return Promise.resolve({ data: OPTIONS, error: null });
      return Promise.resolve({ data: [], error: null });
    };
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      order: () => c,
      maybeSingle: () => result(),
      update: (payload: Record<string, unknown>) => {
        db.writes.push({ table, op: "update", payload });
        wrote = true;
        return c;
      },
      insert: (payload: Record<string, unknown>) => {
        db.writes.push({ table, op: "insert", payload });
        wrote = true;
        return c;
      },
      then: (ok: (v: Result) => unknown, ko: (e: unknown) => unknown) => result().then(ok, ko),
    };
    return c;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org1" } }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: db.toastError, success: vi.fn() } }));
vi.mock("@/components/forms/BrandingLivePreview", () => ({ BrandingLivePreview: () => null }));
vi.mock("@/components/GalleryPickerDialog", () => ({ GalleryPickerDialog: () => null }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u1" }));

const i18n = (enabled: string[]) => () =>
  Promise.resolve({ data: { settings: { i18n: { default_locale: "pt", enabled_locales: enabled } } }, error: null });

const row = (map: unknown) => ({
  id: "b1",
  form_id: "f1",
  confirmation_email_enabled: true,
  email_locale_templates: map,
});

function renderDialog() {
  render(<FormBrandingConfig open onOpenChange={vi.fn()} formId="f1" formName="Teste" />);
}

async function openEmailsTab() {
  const tab = await screen.findByRole("tab", { name: /Emails/ });
  fireEvent.mouseDown(tab);
}

async function save() {
  fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(db.writes.length).toBeGreaterThan(0));
  return db.writes[0];
}

const GROUP = "Email de confirmação: modelos por idioma";
const MAP = { confirmation: { pt: "t1", "fr-FR": "t9" }, outra: { pt: "z" } };

beforeEach(() => {
  db.brandingRow = row(MAP);
  db.forms = i18n(["en"]);
  db.writes = [];
  db.toastError.mockClear();
  db.formsWriteError = null;
});

describe("FormBrandingConfig: modelo de email por idioma", () => {
  it("(a) guardar sem mexer no separador não envia o mapa", async () => {
    renderDialog();
    const write = await save();
    expect(write.table).toBe("form_branding");
    expect(write.op).toBe("update");
    expect(write.payload).not.toHaveProperty("email_locale_templates");
  });

  it("(a) nem depois de abrir o separador Emails e não escolher nada", async () => {
    renderDialog();
    await openEmailsTab();
    await screen.findByRole("group", { name: GROUP });
    const write = await save();
    expect(write.payload).not.toHaveProperty("email_locale_templates");
  });

  it("(b) mexer envia o mapa completo, com o que o ecrã não mostra preservado", async () => {
    renderDialog();
    await openEmailsTab();
    const group = await screen.findByRole("group", { name: GROUP });
    await openAndPick(within(group).getByRole("combobox", { name: "Modelo de email — English" }), "Modelo B");
    const write = await save();
    expect(write.payload.email_locale_templates).toEqual({
      confirmation: { pt: "t1", "fr-FR": "t9", en: "t2" },
      outra: { pt: "z" },
    });
  });

  it("(c) com o i18n a falhar mostra o seletor único, avisa e não grava o mapa sem mexer", async () => {
    db.forms = () => Promise.resolve({ data: null, error: { message: "falhou" } });
    renderDialog();
    await openEmailsTab();
    await waitFor(() => expect(document.querySelector("#confirmation-email-template")).not.toBeNull());
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();
    expect(db.toastError).toHaveBeenCalled();
    const write = await save();
    expect(write.payload).not.toHaveProperty("email_locale_templates");
    expect(db.writes.every((w) => w.table === "form_branding")).toBe(true);
  });

  it("(c) com o i18n a falhar, escolher um modelo não apaga os outros idiomas do mapa", async () => {
    db.forms = () => Promise.reject(new Error("rede"));
    renderDialog();
    await openEmailsTab();
    await waitFor(() => expect(document.querySelector("#confirmation-email-template")).not.toBeNull());
    await openAndPick(document.querySelector("#confirmation-email-template") as HTMLElement, "Modelo B");
    const write = await save();
    expect(write.payload.email_locale_templates).toEqual({
      confirmation: { pt: "t2", "fr-FR": "t9" },
      outra: { pt: "z" },
    });
    expect(db.writes.every((w) => w.table === "form_branding")).toBe(true);
  });

  it("(d) criar sem registo anterior e com o mapa vazio não envia o mapa", async () => {
    db.brandingRow = null;
    renderDialog();
    const write = await save();
    expect(write.op).toBe("insert");
    expect(write.payload).not.toHaveProperty("email_locale_templates");
  });

  it("o separador Emails espera pelos idiomas e só depois mostra os seletores", async () => {
    let release: (v: Result) => void = () => {};
    db.forms = () => new Promise<Result>((resolve) => (release = resolve));
    renderDialog();
    await openEmailsTab();
    expect(await screen.findByRole("status")).toHaveTextContent("A carregar idiomas");
    expect(document.querySelector("#confirmation-email-template")).toBeNull();
    expect(screen.queryByRole("group", { name: GROUP })).not.toBeInTheDocument();

    release({ data: { settings: { i18n: { default_locale: "pt", enabled_locales: ["en"] } } }, error: null });
    await screen.findByRole("group", { name: GROUP });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector("#confirmation-email-template")).toBeNull();
  });
});

describe("FormBrandingConfig: SMS de confirmação por idioma", () => {
  const SMS_GROUP = "Mensagem do SMS: textos por idioma";
  const settingsWithSms = {
    other: 1,
    i18n: {
      default_locale: "pt",
      enabled_locales: ["en"],
      content: { branding: { en: { form_title: "Title", confirmation_sms_message: "Hi there" } }, steps: { s1: { en: { title: "Step" } } } },
    },
  };
  const loadSettings = (settings: unknown) => () => Promise.resolve({ data: { settings }, error: null });
  const smsRow = () => ({ ...row(null), confirmation_sms_enabled: true, confirmation_sms_message: "Texto PT" });
  const writesTo = (table: string) => db.writes.filter((w) => w.table === table);

  async function openSms() {
    renderDialog();
    await openEmailsTab();
    const group = await screen.findByRole("group", { name: SMS_GROUP });
    return {
      pt: within(group).getByRole("textbox", { name: "Mensagem do SMS — Português" }) as HTMLTextAreaElement,
      en: within(group).getByRole("textbox", { name: "Mensagem do SMS — English" }) as HTMLTextAreaElement,
    };
  }

  async function clickSave() {
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(writesTo("form_branding").length).toBeGreaterThan(0));
  }

  beforeEach(() => {
    db.brandingRow = smsRow();
    db.forms = loadSettings(settingsWithSms);
  });

  it("mostra o texto de cada idioma: a coluna no por omissão, a sobreposição nos outros", async () => {
    const { pt, en } = await openSms();
    expect(pt).toHaveValue("Texto PT");
    expect(en).toHaveValue("Hi there");
  });

  it("editar o texto de um idioma grava na sobreposição do formulário, sem perder o resto, e não toca na coluna", async () => {
    const { en } = await openSms();
    fireEvent.change(en, { target: { value: "Hello {{lead_name}}" } });
    await clickSave();
    const forms = writesTo("forms");
    expect(forms).toHaveLength(1);
    expect(forms[0].payload).toEqual({
      settings: {
        other: 1,
        i18n: {
          default_locale: "pt",
          enabled_locales: ["en"],
          content: {
            branding: { en: { form_title: "Title", confirmation_sms_message: "Hello {{lead_name}}" } },
            steps: { s1: { en: { title: "Step" } } },
          },
        },
      },
    });
    const branding = writesTo("form_branding")[0].payload;
    expect(branding).not.toHaveProperty("confirmation_sms_by_locale");
    expect(branding.confirmation_sms_message).toBe("Texto PT");
  });

  it("editar o texto do idioma por omissão grava só na coluna, e não mexe nas definições do formulário", async () => {
    const { pt } = await openSms();
    fireEvent.change(pt, { target: { value: "Novo PT" } });
    await clickSave();
    expect(writesTo("forms")).toHaveLength(0);
    expect(writesTo("form_branding")[0].payload.confirmation_sms_message).toBe("Novo PT");
  });

  it("guardar sem mexer no SMS não grava nas definições do formulário nem leva chaves novas", async () => {
    await openSms();
    await clickSave();
    expect(writesTo("forms")).toHaveLength(0);
    expect(writesTo("form_branding")[0].payload).not.toHaveProperty("confirmation_sms_by_locale");
  });

  it("limpar o texto de um idioma apaga-o da sobreposição (volta a valer a coluna)", async () => {
    const { en } = await openSms();
    fireEvent.change(en, { target: { value: "" } });
    await clickSave();
    const settings = writesTo("forms")[0].payload.settings as { i18n: { content: { branding: Record<string, Record<string, string>> } } };
    expect(settings.i18n.content.branding.en).toEqual({ form_title: "Title" });
  });

  it("se a gravação das definições falhar, avisa e não guarda mais nada (nada fica a meio)", async () => {
    db.formsWriteError = { message: "sem permissão" };
    const { en } = await openSms();
    fireEvent.change(en, { target: { value: "Hello" } });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(db.toastError).toHaveBeenCalled());
    expect(writesTo("form_branding")).toHaveLength(0);
  });

  it("com o i18n a falhar mostra a caixa única, e editar o SMS grava só a coluna", async () => {
    db.forms = () => Promise.resolve({ data: null, error: { message: "falhou" } });
    renderDialog();
    await openEmailsTab();
    await waitFor(() => expect(document.querySelector("#confirmation-sms-message")).not.toBeNull());
    expect(screen.queryByRole("group", { name: SMS_GROUP })).not.toBeInTheDocument();
    fireEvent.change(document.querySelector("#confirmation-sms-message") as HTMLTextAreaElement, { target: { value: "So PT" } });
    await clickSave();
    expect(writesTo("forms")).toHaveLength(0);
    expect(writesTo("form_branding")[0].payload.confirmation_sms_message).toBe("So PT");
  });

  it("um formulário só em português mantém a caixa única de sempre", async () => {
    db.forms = loadSettings({ i18n: { default_locale: "pt", enabled_locales: [] } });
    renderDialog();
    await openEmailsTab();
    await waitFor(() => expect(document.querySelector("#confirmation-sms-message")).not.toBeNull());
    expect(screen.queryByRole("group", { name: SMS_GROUP })).not.toBeInTheDocument();
  });
});
