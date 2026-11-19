import { describe, expect, it } from "vitest";
import {
  EMAIL_PURPOSE_COLUMN,
  activeEmailLocales,
  emailLocaleTemplatesEqual,
  getLocaleTemplateId,
  hasLocaleEntry,
  localeDisplayName,
  normalizeEmailLocaleTemplates,
  normalizeLocaleCode,
  setLocaleTemplateId,
} from "../formEmailLocales";

describe("normalizeLocaleCode", () => {
  it("devolve o código curto em minúsculas", () => {
    expect(normalizeLocaleCode("pt-PT")).toBe("pt");
    expect(normalizeLocaleCode(" EN_gb ")).toBe("en");
    expect(normalizeLocaleCode("es")).toBe("es");
  });

  it("recusa o que não é texto ou está vazio", () => {
    expect(normalizeLocaleCode(null)).toBeNull();
    expect(normalizeLocaleCode(undefined)).toBeNull();
    expect(normalizeLocaleCode("")).toBeNull();
    expect(normalizeLocaleCode("   ")).toBeNull();
    expect(normalizeLocaleCode(42)).toBeNull();
    expect(normalizeLocaleCode({})).toBeNull();
  });
});

describe("activeEmailLocales", () => {
  it("sem i18n configurado devolve só o idioma por omissão", () => {
    expect(activeEmailLocales(null)).toEqual(["pt"]);
    expect(activeEmailLocales(undefined)).toEqual(["pt"]);
    expect(activeEmailLocales({ default_locale: "pt", enabled_locales: [] })).toEqual(["pt"]);
  });

  it("põe o idioma por omissão primeiro e depois os ativos, sem repetir", () => {
    expect(activeEmailLocales({ default_locale: "pt", enabled_locales: ["en"] })).toEqual(["pt", "en"]);
    expect(activeEmailLocales({ default_locale: "en", enabled_locales: ["pt", "en", "es"] })).toEqual(["en", "pt", "es"]);
  });

  it("junta variantes regionais no mesmo código curto", () => {
    expect(activeEmailLocales({ default_locale: "pt-PT", enabled_locales: ["pt-BR", "en-GB", "EN"] })).toEqual(["pt", "en"]);
  });

  it("ignora entradas inválidas", () => {
    expect(
      activeEmailLocales({ default_locale: "pt", enabled_locales: ["", "  ", null as unknown as string, "en"] }),
    ).toEqual(["pt", "en"]);
  });

  it("sem idioma por omissão válido cai para pt", () => {
    expect(activeEmailLocales({ default_locale: "", enabled_locales: ["en"] })).toEqual(["pt", "en"]);
  });
});

describe("localeDisplayName", () => {
  it("usa o nome do próprio idioma", () => {
    expect(localeDisplayName("pt")).toBe("Português");
    expect(localeDisplayName("en")).toBe("English");
    expect(localeDisplayName("pt-PT")).toBe("Português");
  });

  it("para um idioma sem nome conhecido mostra o código em maiúsculas", () => {
    expect(localeDisplayName("xx")).toBe("XX");
  });
});

describe("normalizeEmailLocaleTemplates", () => {
  it("aceita o formato {finalidade: {idioma: id}}", () => {
    const raw = { confirmation: { pt: "a", en: "b" } };
    expect(normalizeEmailLocaleTemplates(raw)).toEqual(raw);
  });

  it("devolve {} para null, undefined, arrays e valores que não são objetos", () => {
    expect(normalizeEmailLocaleTemplates(null)).toEqual({});
    expect(normalizeEmailLocaleTemplates(undefined)).toEqual({});
    expect(normalizeEmailLocaleTemplates([])).toEqual({});
    expect(normalizeEmailLocaleTemplates("x")).toEqual({});
    expect(normalizeEmailLocaleTemplates(7)).toEqual({});
  });

  it("descarta ids vazios ou que não são texto e finalidades que ficam vazias", () => {
    expect(
      normalizeEmailLocaleTemplates({ confirmation: { pt: "a", en: "", es: 3 }, reminder: { pt: null }, cancel_client: "x" }),
    ).toEqual({ confirmation: { pt: "a" } });
  });
});

describe("getLocaleTemplateId", () => {
  const map = { confirmation: { pt: "a", en: "b" } };

  it("lê o modelo do idioma", () => {
    expect(getLocaleTemplateId(map, "confirmation", "en")).toBe("b");
    expect(getLocaleTemplateId(map, "confirmation", "pt-PT")).toBe("a");
  });

  it("devolve null quando não há modelo próprio", () => {
    expect(getLocaleTemplateId(map, "confirmation", "es")).toBeNull();
    expect(getLocaleTemplateId(map, "reminder", "pt")).toBeNull();
    expect(getLocaleTemplateId(undefined, "reminder", "pt")).toBeNull();
    expect(getLocaleTemplateId(null, "reminder", "pt")).toBeNull();
  });
});

describe("setLocaleTemplateId", () => {
  it("acrescenta um idioma sem mexer nos outros nem na entrada", () => {
    const before = { confirmation: { pt: "a" }, reminder: { en: "r" } };
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = setLocaleTemplateId(before, "confirmation", "en", "b");
    expect(after).toEqual({ confirmation: { pt: "a", en: "b" }, reminder: { en: "r" } });
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
  });

  it("parte de um mapa vazio ou em falta", () => {
    expect(setLocaleTemplateId({}, "reminder", "pt", "x")).toEqual({ reminder: { pt: "x" } });
    expect(setLocaleTemplateId(undefined, "reminder", "pt", "x")).toEqual({ reminder: { pt: "x" } });
    expect(setLocaleTemplateId(null, "reminder", "pt", "x")).toEqual({ reminder: { pt: "x" } });
  });

  it("grava sempre o código curto", () => {
    expect(setLocaleTemplateId({}, "confirmation", "pt-PT", "a")).toEqual({ confirmation: { pt: "a" } });
  });

  it("null retira o idioma e a finalidade que ficar vazia, sem tocar nas outras", () => {
    const before = { confirmation: { en: "b" }, reminder: { pt: "r", en: "s" } };
    expect(setLocaleTemplateId(before, "confirmation", "en", null)).toEqual({ reminder: { pt: "r", en: "s" } });
    expect(setLocaleTemplateId(before, "reminder", "en", null)).toEqual({ confirmation: { en: "b" }, reminder: { pt: "r" } });
  });

  it("retirar o que não existe não muda nada", () => {
    const before = { confirmation: { en: "b" } };
    expect(setLocaleTemplateId(before, "reminder", "pt", null)).toEqual(before);
  });

  it("preserva finalidades e idiomas que o ecrã não mostra", () => {
    const before = { confirmation: { pt: "a", fr: "f" }, outra: { pt: "z" } };
    expect(setLocaleTemplateId(before, "confirmation", "pt", "a2")).toEqual({
      confirmation: { pt: "a2", fr: "f" },
      outra: { pt: "z" },
    });
  });
});

describe("variantes regionais e maiúsculas no mapa", () => {
  const dirty = { confirmation: { "pt-pt": "a", PT_pt: "b", pt: "c", en: "d", "fr-FR": "f" }, outra: { "pt-BR": "z" } };

  it("gravar um idioma tira as variantes dele e escreve só o código curto", () => {
    expect(setLocaleTemplateId(dirty, "confirmation", "pt", "novo")).toEqual({
      confirmation: { pt: "novo", en: "d", "fr-FR": "f" },
      outra: { "pt-BR": "z" },
    });
  });

  it("limpar um idioma tira também as variantes dele", () => {
    expect(setLocaleTemplateId(dirty, "confirmation", "pt", null)).toEqual({
      confirmation: { en: "d", "fr-FR": "f" },
      outra: { "pt-BR": "z" },
    });
  });

  it("só toca no idioma pedido: as variantes de outros idiomas e de outras finalidades ficam", () => {
    const out = setLocaleTemplateId(dirty, "confirmation", "en", "x");
    expect(out.confirmation["fr-FR"]).toBe("f");
    expect(out.confirmation["pt-pt"]).toBe("a");
    expect(out.outra).toEqual({ "pt-BR": "z" });
  });

  it("limpar o único idioma, que só existia como variante, apaga a finalidade", () => {
    expect(setLocaleTemplateId({ reminder: { "EN-gb": "x" } }, "reminder", "en", null)).toEqual({});
  });

  it("hasLocaleEntry vê o código curto e qualquer variante", () => {
    expect(hasLocaleEntry(dirty, "confirmation", "pt")).toBe(true);
    expect(hasLocaleEntry({ confirmation: { "PT_pt": "b" } }, "confirmation", "pt")).toBe(true);
    expect(hasLocaleEntry({ confirmation: { "pt-pt": "" } }, "confirmation", "pt")).toBe(false);
    expect(hasLocaleEntry(dirty, "confirmation", "es")).toBe(false);
    expect(hasLocaleEntry(dirty, "reminder", "pt")).toBe(false);
    expect(hasLocaleEntry(null, "reminder", "pt")).toBe(false);
  });

  it("a leitura continua a ser só pelo código curto (é o que o servidor encontra sempre)", () => {
    expect(getLocaleTemplateId({ confirmation: { "pt-pt": "a" } }, "confirmation", "pt")).toBeNull();
  });
});

describe("emailLocaleTemplatesEqual", () => {
  it("ignora a ordem das chaves", () => {
    expect(
      emailLocaleTemplatesEqual({ a: { pt: "1", en: "2" }, b: { pt: "3" } }, { b: { pt: "3" }, a: { en: "2", pt: "1" } }),
    ).toBe(true);
  });

  it("deteta diferenças", () => {
    expect(emailLocaleTemplatesEqual({ a: { pt: "1" } }, { a: { pt: "2" } })).toBe(false);
    expect(emailLocaleTemplatesEqual({ a: { pt: "1" } }, {})).toBe(false);
  });

  it("trata undefined e null como vazio", () => {
    expect(emailLocaleTemplatesEqual(undefined, {})).toBe(true);
    expect(emailLocaleTemplatesEqual(null, undefined)).toBe(true);
  });
});

describe("EMAIL_PURPOSE_COLUMN", () => {
  it("liga cada finalidade do servidor à coluna única por omissão", () => {
    expect(EMAIL_PURPOSE_COLUMN).toEqual({
      confirmation: "confirmation_email_template_id",
      meeting_notify: "meeting_notify_template_id",
      reminder: "reminder_template_id",
      reminder_technician: "reminder_technician_template_id",
      reschedule_client: "reschedule_client_template_id",
      reschedule_technician: "reschedule_technician_template_id",
      cancel_client: "cancel_client_template_id",
      cancel_technician: "cancel_technician_template_id",
    });
  });
});
