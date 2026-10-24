// Os textos do ecrã de fecho (pessoasFechoEcra.ts): pt e en com as mesmas chaves e marcadores, nenhum vazio, sem emoji, todas as chaves que o código
// usa existem nas duas línguas e chegam à página (pessoasPagina junta-as). Cada código de alerta e cada prova que o ecrã sabe dizer tem texto.
import { describe, expect, it } from "vitest";
import { pessoasFechoEcraTranslations } from "./pessoasFechoEcra";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasFechoEcraTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();
const N = "pessoasPagina.neg.close.";
const PREFIXOS = [N, "pessoasPagina.step."];

const CODIGOS = ["positivo_depois_perda", "sem_prova", "prazo_por_configurar", "mudanca_sem_efeito", "recusa_depois_aceite", "reenvio_sem_reabrir", "conversao_falhou"];
const CONVERSOES = ["feita", "ja_cliente", "ja_convertida", "por_fazer", "falhou", "manual"];
const PROVAS = ["P1", "P2", "P3", "utilizador"];
const CHAVES_USADAS = [
  "group", "now.button", "now.result", "now.won", "now.wonNoKind", "now.proof", "now.stillOpen", "now.done", "now.noChange", "kind.proposta", "kind.contrato",
  "origin.won", "origin.wonNoNumber", "origin.date", "origin.lostAuto", "origin.lostAutoNoDoc", "origin.lostManual", "convert.button", "convert.done",
  "reopen.button", "reopen.title", "reopen.description", "reopen.reason", "reopen.error.empty", "reopen.error.tooLong", "reopen.cancel", "reopen.done",
  "keep.button", "keep.done", "dismiss.button", "dismiss.done", "alerts.title", "alerts.generic", "secondProposal.warning", "secondProposal.blocked",
  ...CODIGOS.map((c) => `alerts.${c}`), ...CONVERSOES.map((c) => `conversion.${c}`), ...PROVAS.map((p) => `proof.${p}`),
].map((c) => `${N}${c}`).concat(["pessoasPagina.step.semOrcamentos"]);

describe("traduções do ecrã de fecho", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm um prefixo conhecido, nenhuma está vazia e nenhuma leva emoji", () => {
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(PREFIXOS.some((p) => chave.startsWith(p)), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
      expect(/\p{Extended_Pictographic}/u.test(texto), chave).toBe(false);
    }
  });

  it("todas as chaves que o código usa existem nas duas línguas", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pt[chave], chave).toBeTruthy();
      expect(en[chave], chave).toBeTruthy();
    }
  });

  it("não há texto de conflito «proposta aceite com contrato recusado»", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/conflit|conflict/i);
  });

  it("chegam à página nas duas línguas", () => {
    for (const chave of CHAVES_USADAS) {
      expect(pessoasPaginaTranslations.pt[chave], chave).toBe(pt[chave]);
      expect(pessoasPaginaTranslations.en[chave], chave).toBe(en[chave]);
    }
  });
});
