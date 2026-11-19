import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfirmationSms } from "../../../supabase/functions/_shared/emailDefaults";
import { CONFIRMATION_SMS_KEY as SERVER_KEY } from "../../../supabase/functions/_shared/confirmationSms";

const db = vi.hoisted(() => ({
  settings: {} as unknown,
  updated: [] as unknown[],
  selectError: null as unknown,
  updateError: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { settings: db.settings }, error: db.selectError }) }),
      }),
      update: (payload: unknown) => ({
        eq: () => {
          db.updated.push(payload);
          return Promise.resolve({ error: db.updateError });
        },
      }),
    }),
  },
}));

import {
  CONFIRMATION_SMS_KEY,
  SMS_BASE_MESSAGE,
  applySmsOverlay,
  persistSmsByLocale,
  readSmsByLocale,
  smsBaseMessageFor,
  smsChanges,
} from "../formSmsLocales";
import type { FormI18nConfig } from "../formI18n";

const cfg = (branding: Record<string, Record<string, string>> | undefined): FormI18nConfig => ({
  default_locale: "pt",
  enabled_locales: ["en"],
  content: branding ? { branding } : {},
});

beforeEach(() => {
  db.settings = {};
  db.updated = [];
  db.selectError = null;
  db.updateError = null;
});

describe("chave e textos base", () => {
  it("a chave é a mesma que o servidor lê", () => {
    expect(CONFIRMATION_SMS_KEY).toBe(SERVER_KEY);
    expect(CONFIRMATION_SMS_KEY).toBe("confirmation_sms_message");
  });

  it("os textos base de pt e en são os que o servidor usa por omissão (paridade)", () => {
    const base = (lang: "pt" | "en") => defaultConfirmationSms(lang, { companyName: "{{company_name}}", withCancelLink: false });
    expect(SMS_BASE_MESSAGE.pt).toBe(base("pt"));
    expect(SMS_BASE_MESSAGE.en).toBe(base("en"));
  });

  it("smsBaseMessageFor: en para inglês e variantes; o resto em português, como o servidor", () => {
    expect(smsBaseMessageFor("en")).toBe(SMS_BASE_MESSAGE.en);
    expect(smsBaseMessageFor("en-GB")).toBe(SMS_BASE_MESSAGE.en);
    for (const l of ["pt", "es", "xx", "", null, undefined]) expect(smsBaseMessageFor(l)).toBe(SMS_BASE_MESSAGE.pt);
  });
});

describe("readSmsByLocale", () => {
  it("lê só os idiomas pedidos que têm texto", () => {
    const c = cfg({ en: { confirmation_sms_message: "Hi", form_title: "T" }, es: { confirmation_sms_message: "Hola" } });
    expect(readSmsByLocale(c, ["pt", "en"])).toEqual({ en: "Hi" });
    expect(readSmsByLocale(c, ["en", "es"])).toEqual({ en: "Hi", es: "Hola" });
  });

  it("sem conteúdo devolve {}", () => {
    expect(readSmsByLocale(cfg(undefined), ["pt", "en"])).toEqual({});
  });
});

describe("smsChanges", () => {
  it("devolve só os idiomas cujo texto mudou; texto vazio significa apagar", () => {
    expect(smsChanges({ en: "a", es: "b" }, { en: "a2", es: "b" }, ["en", "es"])).toEqual({ en: "a2" });
    expect(smsChanges({ en: "a" }, { en: "" }, ["en"])).toEqual({ en: "" });
    expect(smsChanges({}, { en: "novo" }, ["en"])).toEqual({ en: "novo" });
  });

  it("sem diferenças, ou idiomas que não estão ativos, não devolve nada", () => {
    expect(smsChanges({ en: "a" }, { en: "a" }, ["en"])).toEqual({});
    expect(smsChanges({}, { fr: "x" }, ["en"])).toEqual({});
    expect(smsChanges({ en: "a" }, {}, ["en"])).toEqual({});
  });

  it("espaços à volta não contam como alteração", () => {
    expect(smsChanges({ en: "a" }, { en: "a  " }, ["en"])).toEqual({});
  });
});

describe("applySmsOverlay", () => {
  it("escreve o idioma e preserva os outros textos traduzidos e os outros idiomas", () => {
    const c = cfg({ en: { form_title: "Title" }, es: { confirmation_sms_message: "Hola" } });
    const next = applySmsOverlay(c, { en: "Hi {{lead_name}}" });
    expect(next.content?.branding).toEqual({
      en: { form_title: "Title", confirmation_sms_message: "Hi {{lead_name}}" },
      es: { confirmation_sms_message: "Hola" },
    });
    expect(c.content?.branding?.en).toEqual({ form_title: "Title" });
  });

  it("texto vazio apaga a chave e limpa o que fica vazio", () => {
    const c = cfg({ en: { confirmation_sms_message: "Hi" } });
    expect(applySmsOverlay(c, { en: "" }).content?.branding).toBeUndefined();
  });
});

describe("persistSmsByLocale", () => {
  it("lê as definições, aplica só as alterações e grava, sem perder as outras chaves", async () => {
    db.settings = {
      other: 1,
      i18n: {
        default_locale: "pt",
        enabled_locales: ["en"],
        content: { branding: { en: { form_title: "Title" } }, steps: { s1: { en: { title: "Step" } } } },
      },
    };
    await persistSmsByLocale("form-1", { en: "Hi" });
    expect(db.updated).toHaveLength(1);
    expect(db.updated[0]).toEqual({
      settings: {
        other: 1,
        i18n: {
          default_locale: "pt",
          enabled_locales: ["en"],
          content: {
            branding: { en: { form_title: "Title", confirmation_sms_message: "Hi" } },
            steps: { s1: { en: { title: "Step" } } },
          },
        },
      },
    });
  });

  it("sem alterações não escreve nada", async () => {
    await persistSmsByLocale("form-1", {});
    expect(db.updated).toHaveLength(0);
  });

  it("erro a ler ou a gravar lança (nada fica dado por guardado)", async () => {
    db.selectError = { message: "x" };
    await expect(persistSmsByLocale("form-1", { en: "Hi" })).rejects.toBeTruthy();
    db.selectError = null;
    db.updateError = { message: "y" };
    await expect(persistSmsByLocale("form-1", { en: "Hi" })).rejects.toBeTruthy();
  });
});
