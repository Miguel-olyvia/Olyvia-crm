// 29/10: modos de baixa de stock em Definições (automático na emissão da EC / manual; «Proposta aceite» antiga só leitura).
import { describe, expect, it } from "vitest";
import { translations } from "./index";

const CHAVES = [
  "settingsPage.inventory.deductionTriggerAutomatic",
  "settingsPage.inventory.deductionTriggerManual",
  "settingsPage.inventory.deductionTriggerProposalAcceptedLegacy",
  "settingsPage.inventory.deductionTriggerHelp",
];

describe("traduções da baixa de stock por venda", () => {
  it("todas as línguas têm as chaves novas, sem texto vazio", () => {
    for (const [lingua, mapa] of Object.entries(translations)) {
      const m = mapa as Record<string, string>;
      for (const chave of CHAVES) expect(m[chave]?.trim(), `${lingua} ${chave}`).toBeTruthy();
    }
  });

  it("as chaves antigas saíram (o rótulo «Contrato assinado» já não descreve o modo)", () => {
    for (const mapa of Object.values(translations)) {
      const m = mapa as Record<string, string>;
      expect(m["settingsPage.inventory.deductionTriggerContractSigned"]).toBeUndefined();
      expect(m["settingsPage.inventory.deductionTriggerProposalAccepted"]).toBeUndefined();
    }
  });

  it("pt usa os mesmos rótulos do cartão do Armazém", () => {
    const pt = translations.pt as Record<string, string>;
    expect(pt["settingsPage.inventory.deductionTriggerAutomatic"]).toBe("Automático — quando a encomenda de cliente é emitida");
    expect(pt["settingsPage.inventory.deductionTriggerManual"]).toBe("Manual — só pela Saída para clientes");
  });
});
