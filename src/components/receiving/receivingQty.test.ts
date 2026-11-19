// 19/11 (auditoria, lote 2, ponto 2): o cesto da Receção aceita decimais nos produtos que se medem (m², ml, kg), como o servidor
// (rpc_receive_by_code, 20270124020000); inteiros nas embalagens e no que se conta.
import { describe, expect, it } from "vitest";
import {
  cleanReceivingQtyText, isValidReceivingQty, normalizeReceivingQty, parseReceivingQty, receivingIntegerOnly, receivingQtyError, receivingQtyText,
} from "./receivingQty";
import { lineIntegerOnly } from "./porReceber";

describe("receivingIntegerOnly", () => {
  it("vale o integer_qty da leitura quando vem", () => {
    expect(receivingIntegerOnly({ integerQty: false, uomCode: "un", unitsPerUom: 1 })).toBe(false);
    expect(receivingIntegerOnly({ integerQty: true, uomCode: "m2", unitsPerUom: 1 })).toBe(true);
  });
  it("sem ele: embalagem ou unidade que se conta → inteiro; m², kg ou sem unidade → decimais", () => {
    expect(receivingIntegerOnly({ uomCode: "CX", unitsPerUom: 10 })).toBe(true);
    expect(receivingIntegerOnly({ uomCode: "un", unitsPerUom: 1 })).toBe(true);
    expect(receivingIntegerOnly({ uomCode: "m2", unitsPerUom: 1 })).toBe(false);
    expect(receivingIntegerOnly({ uomCode: "kg", unitsPerUom: 1 })).toBe(false);
    expect(receivingIntegerOnly({ uomCode: null, unitsPerUom: 1 })).toBe(false);
  });
});

describe("o texto do campo", () => {
  it("inteiro: só algarismos", () => {
    expect(cleanReceivingQtyText("2,5", true)).toBe("25");
    expect(cleanReceivingQtyText("12a", true)).toBe("12");
  });
  it("decimal: uma vírgula (o ponto passa a vírgula) e até 3 casas", () => {
    expect(cleanReceivingQtyText("21.34", false)).toBe("21,34");
    expect(cleanReceivingQtyText("21,3456", false)).toBe("21,345");
    expect(cleanReceivingQtyText("1,2,3", false)).toBe("1,23");
    expect(cleanReceivingQtyText("2,", false)).toBe("2,");
    expect(cleanReceivingQtyText("abc", false)).toBe("");
  });
  it("lê e escreve à portuguesa", () => {
    expect(parseReceivingQty("21,34")).toBe(21.34);
    expect(parseReceivingQty("")).toBeNaN();
    expect(receivingQtyText(21.6)).toBe("21,6");
    expect(receivingQtyText(3)).toBe("3");
  });
});

describe("validar e acertar", () => {
  it("inteiro ≥ 1; decimal > 0", () => {
    expect(isValidReceivingQty("2,5", 2.5, false)).toBe(true);
    expect(isValidReceivingQty("0,5", 0.5, false)).toBe(true);
    expect(isValidReceivingQty("0", 0, false)).toBe(false);
    expect(isValidReceivingQty("2,5", 2.5, true)).toBe(false);
    expect(isValidReceivingQty("3", 3, true)).toBe(true);
    expect(isValidReceivingQty("3", 4, true)).toBe(false);
    expect(isValidReceivingQty("", 1, true)).toBe(false);
  });
  it("o + e o −: o inteiro fica ≥ 1; o decimal guarda as casas e nunca chega a 0", () => {
    expect(normalizeReceivingQty(2.5, true)).toBe(2);
    expect(normalizeReceivingQty(0, true)).toBe(1);
    expect(normalizeReceivingQty(21.34 + 1, false)).toBe(22.34);
    expect(normalizeReceivingQty(0, false)).toBe(0.001);
  });
  it("a mensagem diz a regra certa", () => {
    expect(receivingQtyError(true)).toBe("A quantidade tem de ser um número inteiro, 1 ou mais.");
    expect(receivingQtyError(false)).toBe("A quantidade tem de ser maior que 0 (até 3 casas decimais).");
  });
});

describe("lineIntegerOnly (as linhas de uma encomenda a fornecedor)", () => {
  it("na unidade do produto que se mede: decimais; embalagem ou unidade que se conta: inteiros; sem a unidade lida, o servidor decide", () => {
    expect(lineIntegerOnly({ uomId: null, uomCode: null, unitsPerUom: 1, productUomCode: "m2" })).toBe(false);
    expect(lineIntegerOnly({ uomId: null, uomCode: null, unitsPerUom: 1, productUomCode: "un" })).toBe(true);
    expect(lineIntegerOnly({ uomId: "u-cx", uomCode: "cx", unitsPerUom: 5, productUomCode: "un" })).toBe(true);
    expect(lineIntegerOnly({ uomId: null, uomCode: null, unitsPerUom: 1 })).toBe(false);
  });
});
