import { afterEach, describe, expect, it } from "vitest";
import { mapFriendlyErrorText } from "../friendlyError";
import { translations } from "@/translations/index";

/**
 * A base recusa mudar o dono de uma lead/cliente com visita futura quando o
 * novo dono nao tem recurso de agenda, com mensagens de prefixo estavel
 * (o nif-write-proxy so passa `message`). O ecra tem de as traduzir nas 5 linguas
 * e nunca deixar o texto cru — nem deixar um nome com "permission" cair no mapa geral.
 */
const LANGS = ["en", "pt", "es", "fr", "de"] as const;
type Lang = (typeof LANGS)[number];

function setLanguage(lang: Lang) {
  localStorage.setItem("language", lang);
}

afterEach(() => localStorage.removeItem("language"));

describe("erro: novo dono sem recurso de agenda", () => {
  const raw = "owner_without_schedule_resource: Ana Permission";

  it.each(LANGS)("traduz e interpola o nome em %s", (lang) => {
    setLanguage(lang);
    const table = translations as unknown as Record<string, Record<string, string>>;
    const expected = table[lang]["friendlyError.ownerWithoutScheduleResource"].replace("{name}", "Ana Permission");
    const text = mapFriendlyErrorText(raw);
    expect(text).toBe(expected);
    expect(text).toContain("Ana Permission");
    expect(text).not.toMatch(/owner_without_schedule_resource/);
  });

  it("apanha a mensagem dentro do JSON do proxy e tira o lixo do fim", () => {
    setLanguage("pt");
    const text = mapFriendlyErrorText('{"error":"owner_without_schedule_resource: Rui Sá"}');
    expect(text).toContain("Rui Sá");
    expect(text).not.toContain('"');
  });
});

describe("erro: dono obrigatorio com visita futura", () => {
  it.each(LANGS)("traduz em %s", (lang) => {
    setLanguage(lang);
    const table = translations as unknown as Record<string, Record<string, string>>;
    const text = mapFriendlyErrorText("owner_required_for_future_visit");
    expect(text).toBe(table[lang]["friendlyError.ownerRequiredForFutureVisit"]);
    expect(text).not.toMatch(/owner_required/);
  });
});

describe("chaves de traducao do alinhamento dono/visita", () => {
  const keys = [
    "friendlyError.ownerWithoutScheduleResource",
    "friendlyError.ownerRequiredForFutureVisit",
    "leads.toast.bulkAssigneeSkipped",
    "leads.toast.visitOwnerSynced",
    "clients.toast.bulkAssignSkipped",
    "scheduling.item.leadOwnerSynced",
    "leads.reassignVisit.incompleteTitle",
    "leads.reassignVisit.incompleteDesc",
    "leads.reassignVisit.success",
    "leads.reassignVisit.error",
  ];

  it.each(LANGS)("todas existem e nao estao vazias em %s", (lang) => {
    const table = translations as unknown as Record<string, Record<string, string>>;
    for (const key of keys) {
      expect(table[lang][key], `${lang}:${key}`).toBeTruthy();
    }
  });
});
