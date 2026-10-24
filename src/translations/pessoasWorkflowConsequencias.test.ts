// Os textos do ecrã das consequências (pessoasWorkflowConsequencias.ts): pt e en com as mesmas chaves e marcadores, nenhum vazio nem com emoji,
// as frases que o pedido impõe, e a junção à página.
import { describe, expect, it } from "vitest";
import { RECUSAS_ORCAMENTO } from "@/hooks/pessoas/workflow/consequencias";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasWorkflowConsequenciasTranslations } from "./pessoasWorkflowConsequencias";

const { en, pt } = pessoasWorkflowConsequenciasTranslations;
const C = "pessoasPagina.real.workflow.neg.cons.";
const marcas = (texto: string): string[] => (texto.match(/\{\{?\w+\}?\}/g) ?? []).sort();

const CHAVES_USADAS = [
  "title", "intro", "caption", "col.event", "col.deal", "col.next",
  "ev.quoteAccepted", "ev.quoteRefused", "ev.proposalAccepted", "ev.proposalRefused", "ev.contractSigned", "ev.contractRefused",
  "noChange", "quoteAccepted.switch", "quoteAccepted.hint", "quoteRefused.title", "quoteRefused.hint", "quoteRefused.after",
  "proposalAccepted.switch", "proposalAccepted.hint", "proposalAccepted.deal", "proposalRefused.after",
  "contractSigned.deal", "contractSigned.after", "contractRefused.after",
  "state.on", "state.off", "state.unknown", "readError", "readOnlyNote", "saving", "saved", "unchanged", "error.ng026",
  "loading", "noConfig", "noDeadline",
  ...RECUSAS_ORCAMENTO.map((r) => `quoteRefused.${r}`),
].map((c) => `${C}${c}`);

describe("traduções das consequências", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo, nenhuma está vazia e nenhuma tem emoji", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(C), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("todas as chaves que o código usa existem nas duas línguas, e não há chaves a mais", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
    expect(Object.keys(pt).sort()).toEqual([...CHAVES_USADAS].sort());
  });

  it("a frase do contrato diz que vale para todas as propostas e o que acontece na venda direta", () => {
    expect(pt[`${C}proposalAccepted.hint`]).toMatch(/todas as propostas da organização/);
    expect(pt[`${C}proposalAccepted.hint`]).toMatch(/venda direta.*fora do negócio.*não leva contratos/);
    expect(pt[`${C}proposalAccepted.hint`]).toMatch(/No contrato/);
    expect(en[`${C}proposalAccepted.hint`]).toMatch(/every proposal in the organization/);
  });

  it("a introdução separa o que grava logo do que só grava com «Guardar configuração»", () => {
    expect(pt[`${C}intro`]).toMatch(/interruptores e a recusa do orçamento gravam logo/);
    expect(pt[`${C}intro`]).toMatch(/Guardar configuração/);
    expect(en[`${C}intro`]).toMatch(/switches and the quote decline save straight away/);
    expect(en[`${C}intro`]).toMatch(/Save configuration/);
    expect(pt[`${C}intro`]).not.toMatch(/uma escolha grava-se logo/);
    expect(en[`${C}intro`]).not.toMatch(/or a choice saves straight away/);
  });

  it("o erro NG026 diz que nada foi guardado", () => {
    expect(pt[`${C}error.ng026`]).toMatch(/Nada foi guardado/);
    expect(en[`${C}error.ng026`]).toMatch(/Nothing was saved/);
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });
});
