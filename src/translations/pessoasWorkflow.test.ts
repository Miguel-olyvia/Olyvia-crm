import { describe, expect, it } from "vitest";
import { CONDITION_CATALOG, QUALIFICATION_LEGACY_KEYS } from "@/components/leads/workflow/conditionCatalog";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasWorkflowTranslations } from "./pessoasWorkflow";

const { en, pt } = pessoasWorkflowTranslations;
const W = "pessoasPagina.real.workflow.";
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções do Workflow de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo do Workflow e nenhum texto vazio", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(25);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(W), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("os erros NG008, NG009 e de permissão (42501) estão traduzidos nas duas línguas, e dizem que nada foi guardado", () => {
    for (const lingua of [pt, en]) {
      for (const chave of ["error.ng008", "error.ng009", "error.permission"]) {
        expect(lingua[`${W}${chave}`], chave).toBeTruthy();
      }
    }
    expect(pt[`${W}error.ng009`]).toMatch(/Nada foi guardado/);
    expect(en[`${W}error.ng009`]).toMatch(/Nothing was saved/);
  });

  it("cada condição que o editor oferece tem rótulo nas duas línguas, e o português é o rótulo de Leads", () => {
    const linhas = CONDITION_CATALOG.filter((r) => QUALIFICATION_LEGACY_KEYS.includes(r.key));
    expect(linhas).toHaveLength(12);
    for (const r of linhas) {
      expect(pt[`${W}cond.${r.key}`], r.key).toBe(r.label);
      expect(en[`${W}cond.${r.key}`], r.key).toBeTruthy();
      expect(en[`${W}cond.${r.key}`], r.key).not.toBe(pt[`${W}cond.${r.key}`]);
    }
  });

  it("o botão chama-se «Workflow», como em Leads, e o separador «Qualificação»", () => {
    expect(pt[`${W}open`]).toBe("Workflow");
    expect(en[`${W}open`]).toBe("Workflow");
    expect(pt[`${W}tabs.qualification`]).toBe("Qualificação");
  });
});
