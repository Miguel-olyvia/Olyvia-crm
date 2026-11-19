// 19/11 (auditoria, lote 2, ponto 1): a causa concreta de uma falta que não se pode pedir ao fornecedor, com o critério do pedido.
import { describe, expect, it } from "vitest";
import { MISSING_CAUSE_TEXT, blockedMissingSummary, missingBlockReason, missingCauseText } from "./missingCause";

describe("missingBlockReason", () => {
  it("a causa da base vale mais do que has_preferred_supplier (a unidade incompatível tem fornecedor preferido)", () => {
    expect(missingBlockReason({ has_preferred_supplier: true, request_block_reason: "incompatible_supplier_uom" })).toBe("incompatible_supplier_uom");
    expect(missingBlockReason({ has_preferred_supplier: false, request_block_reason: "no_preferred_supplier" })).toBe("no_preferred_supplier");
    expect(missingBlockReason({ has_preferred_supplier: true, request_block_reason: null })).toBeNull();
  });
  it("sem o campo (a base por atualizar), como antes: has_preferred_supplier; serviço ou sem nada, não se sabe", () => {
    expect(missingBlockReason({ has_preferred_supplier: false })).toBe("no_preferred_supplier");
    expect(missingBlockReason({ has_preferred_supplier: true })).toBeNull();
    expect(missingBlockReason({})).toBeUndefined();
    expect(missingBlockReason({ item_type: "service", request_block_reason: "no_preferred_supplier" })).toBeUndefined();
  });
  it("um valor desconhecido na base conta como «pode pedir-se» (o servidor decide)", () => {
    expect(missingBlockReason({ request_block_reason: "outra" })).toBeNull();
  });
});

describe("os textos", () => {
  it("cada causa nas palavras pedidas", () => {
    expect(MISSING_CAUSE_TEXT.no_preferred_supplier).toBe("sem fornecedor preferido: escolha um no Catálogo");
    expect(MISSING_CAUSE_TEXT.incompatible_supplier_uom).toBe("unidade do fornecedor incompatível");
    expect(missingCauseText({ request_block_reason: "incompatible_supplier_uom" })).toBe("unidade do fornecedor incompatível");
    expect(missingCauseText({ request_block_reason: null })).toBe("");
  });
  it("o motivo do botão desligado conta as linhas em falta por causa (as sem falta não contam)", () => {
    const L = [
      { qty_missing: 2, request_block_reason: "no_preferred_supplier" },
      { qty_missing: 1, request_block_reason: "no_preferred_supplier" },
      { qty_missing: 3, request_block_reason: "incompatible_supplier_uom" },
      { qty_missing: 0, request_block_reason: "incompatible_supplier_uom" },
      { qty_missing: 5, request_block_reason: null },
    ];
    expect(blockedMissingSummary(L)).toBe("2 materiais sem fornecedor preferido (escolha um no Catálogo) e 1 com a unidade do fornecedor incompatível");
    expect(blockedMissingSummary([{ qty_missing: 1.5, request_block_reason: "incompatible_supplier_uom" }]))
      .toBe("1 material com a unidade do fornecedor incompatível");
    expect(blockedMissingSummary([{ qty_missing: 4, request_block_reason: null }])).toBe("");
  });
});
