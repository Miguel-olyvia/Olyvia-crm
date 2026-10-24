// Os textos do separador «Negócios» do Workflow de Pessoas (pessoasWorkflowNegocios.ts): pt e en com as mesmas chaves e marcadores, nenhum vazio
// nem com emoji, todas as chaves que o código usa existem nas duas línguas, e chegam à página (pessoasPagina junta-as).
import { describe, expect, it } from "vitest";
import { CANCELAMENTOS, CONVERSOES_AO_GANHAR, RECUSAS } from "@/hooks/pessoas/workflow/configNegocios";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasWorkflowNegociosTranslations } from "./pessoasWorkflowNegocios";

const { en, pt } = pessoasWorkflowNegociosTranslations;
const W = "pessoasPagina.real.workflow.";
const N = `${W}neg.`;
const marcas = (texto: string): string[] => (texto.match(/\{\{?\w+\}?\}/g) ?? []).sort();

const CHAVES_USADAS = [
  "intro", "loading", "loadError", "retry", "noConfig",
  "conv.title", "conv.hint", "propRefused.title", "propRefused.hint", "contRefused.title", "contRefused.hint", "cancel.title", "cancel.hint",
  "conv.example", "propRefused.example", "contRefused.example", "cancel.example", "reflexion.example",
  "reflexion.label", "reflexion.hint", "reflexion.error.format", "reflexion.error.range",
  "save", "saving", "saved", "unchanged", "notice", "error.title", "error.ng008", "error.ng009", "error.permission",
  ...CONVERSOES_AO_GANHAR.map((c) => `conv.${c}`),
  ...RECUSAS.map((r) => `refusal.${r}`),
  ...CANCELAMENTOS.map((c) => `cancel.${c}`),
].map((c) => `${N}${c}`);

describe("as ajudas das recusas dizem o que a base faz (decisão 4)", () => {
  it("a recusa decide-se só por esta opção: não se fala de «outra proposta ou contrato positivo ativo»", () => {
    for (const chave of ["propRefused.hint", "contRefused.hint"].map((c) => `${N}${c}`)) {
      expect(pt[chave], chave).not.toMatch(/outro? (proposta|contrato).*positivo|positivo/i);
      expect(en[chave], chave).not.toMatch(/positive|other active/i);
      expect(pt[chave], chave).toMatch(/não depende/);
      expect(en[chave], chave).toMatch(/does not depend/);
    }
  });
});

describe("traduções do separador «Negócios» do Workflow de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo do Workflow, nenhuma está vazia e nenhuma tem emoji", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(W), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("todas as chaves que o código usa existem nas duas línguas", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("o separador chama-se «Negócios»", () => {
    expect(pt[`${W}tabs.deals`]).toBe("Negócios");
    expect(en[`${W}tabs.deals`]).toBeTruthy();
  });

  it("os erros dizem que nada foi guardado", () => {
    for (const l of [pt, en]) {
      for (const c of ["ng009", "permission"]) expect(l[`${N}error.${c}`], c).toMatch(/Nada foi guardado|Nothing was saved/);
      expect(l[`${N}error.ng008`]).toMatch(/Nada foi guardado|Nothing was saved/);
    }
  });

  it("não escreve aconselhamento jurídico nem um prazo por omissão: o texto do prazo só diz o intervalo e «em branco»", () => {
    expect(pt[`${N}reflexion.hint`]).toBe("De 1 a 365 dias. Deixe em branco enquanto o prazo não estiver definido.");
    for (const l of [pt, en]) {
      for (const [chave, texto] of Object.entries(l)) {
        expect(texto, chave).not.toMatch(/\b14\b|\b30\b|lei\b|legal|jur[ií]dic|law\b/i);
      }
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
