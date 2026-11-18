import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { proposalTemplateVersionsTranslations } from "../proposalTemplateVersions";

let idioma = "pt";
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: idioma }) }));

import { useTranslation } from "@/hooks/useTranslation";

describe("traduções das versões por idioma do editor de propostas", () => {
  beforeEach(() => {
    idioma = "pt";
  });

  it("en e pt têm exatamente as mesmas chaves, todas com texto", () => {
    const en = Object.keys(proposalTemplateVersionsTranslations.en).sort();
    const pt = Object.keys(proposalTemplateVersionsTranslations.pt).sort();
    expect(pt).toEqual(en);
    for (const lingua of ["en", "pt"]) {
      for (const [chave, texto] of Object.entries(proposalTemplateVersionsTranslations[lingua])) {
        expect(texto.trim(), `${lingua}:${chave}`).not.toBe("");
      }
    }
  });

  it("todas as chaves usam o prefixo do editor", () => {
    for (const chave of Object.keys(proposalTemplateVersionsTranslations.en)) {
      expect(chave.startsWith("proposalTemplateEditor.versions.")).toBe(true);
    }
  });

  it("os mesmos marcadores {x} existem em en e pt", () => {
    const marcadores = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [chave, texto] of Object.entries(proposalTemplateVersionsTranslations.en)) {
      expect(marcadores(proposalTemplateVersionsTranslations.pt[chave]), chave).toEqual(marcadores(texto));
    }
  });

  it("o useTranslation junta o módulo (pt e en) e substitui parâmetros", () => {
    const { result, rerender } = renderHook(() => useTranslation());
    expect(result.current.t("proposalTemplateEditor.versions.addLanguage")).toBe("Adicionar idioma");
    expect(result.current.t("proposalTemplateEditor.versions.missingCount", { count: 3 })).toBe("3 por traduzir");
    idioma = "en";
    rerender();
    expect(result.current.t("proposalTemplateEditor.versions.addLanguage")).toBe("Add language");
  });

  it("a chave antiga do editor continua a existir (o merge não a apaga)", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("proposalTemplateEditor.toast.logoError")).toBe("Erro ao carregar logotipo");
  });

  it("noutra língua cai para en", () => {
    idioma = "de";
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("proposalTemplateEditor.versions.addLanguage")).toBe("Add language");
  });
});
