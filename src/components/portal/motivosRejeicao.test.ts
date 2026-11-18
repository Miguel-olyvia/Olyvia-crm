// Os motivos de rejeição: o valor gravado na base (proposals.rejection_reason_code, aparece nas notificações do CRM)
// é sempre o texto português de hoje; só a etiqueta visível muda com o idioma.
import { describe, expect, it } from "vitest";
import { traduzir } from "@/portal-i18n";
import { MOTIVOS_REJEICAO_CONTRATO, MOTIVOS_REJEICAO_PROPOSTA } from "./motivosRejeicao";

describe("motivos de rejeição do portal", () => {
  it("proposta: os valores gravados são exatamente os de sempre, pela mesma ordem", () => {
    expect(MOTIVOS_REJEICAO_PROPOSTA.map((m) => m.valor)).toEqual([
      "Preço alto",
      "Encontrei alternativa",
      "Já não preciso",
      "Prazo não serve",
      "Vou adiar",
      "Outro",
    ]);
  });

  it("contrato: os valores gravados são exatamente os de sempre, pela mesma ordem", () => {
    expect(MOTIVOS_REJEICAO_CONTRATO.map((m) => m.valor)).toEqual([
      "Condições não adequadas",
      "Preço alto",
      "Encontrei alternativa",
      "Vou adiar",
      "Outro",
    ]);
  });

  it.each([
    ["proposta", MOTIVOS_REJEICAO_PROPOSTA],
    ["contrato", MOTIVOS_REJEICAO_CONTRATO],
  ])("%s: em português a etiqueta é o próprio valor", (_nome, motivos) => {
    for (const m of motivos) expect(traduzir("pt", m.chave)).toBe(m.valor);
  });

  it.each([
    ["proposta", MOTIVOS_REJEICAO_PROPOSTA],
    ["contrato", MOTIVOS_REJEICAO_CONTRATO],
  ])("%s: em inglês cada etiqueta existe, é traduzida e não é a chave", (_nome, motivos) => {
    for (const m of motivos) {
      const en = traduzir("en", m.chave);
      expect(en).not.toBe(m.chave);
      expect(en).not.toBe(m.valor);
      expect(en.trim()).not.toBe("");
    }
  });

  it("as chaves de cada lista não se repetem", () => {
    for (const lista of [MOTIVOS_REJEICAO_PROPOSTA, MOTIVOS_REJEICAO_CONTRATO]) {
      expect(new Set(lista.map((m) => m.chave)).size).toBe(lista.length);
      expect(new Set(lista.map((m) => m.valor)).size).toBe(lista.length);
    }
  });
});
