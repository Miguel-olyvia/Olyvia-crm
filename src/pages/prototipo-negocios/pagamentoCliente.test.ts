import { describe, expect, it } from "vitest";
import { em3, referenciaMb, vencimento } from "./pagamentoCliente";

describe("pagamento no portal", () => {
  it("a referência Multibanco tem 9 dígitos e é sempre a mesma para a mesma fatura", () => {
    const r = referenciaMb(1027, "FT 2026/418");
    expect(r).toMatch(/^\d{9}$/);
    expect(r.slice(0, 6)).toBe("027418");
    expect(referenciaMb(1027, "FT 2026/418")).toBe(r);
    expect(referenciaMb(1027, "FT 2026/419")).not.toBe(r);
  });
  it("mostra-se de 3 em 3 dígitos", () => {
    expect(em3("027418123")).toBe("027 418 123");
  });
  it("o vencimento conta os dias a partir da emissão", () => {
    expect(vencimento(new Date(2026, 9, 15), "15 dias")).toBe("30/10");
    expect(vencimento(new Date(2026, 9, 15))).toBe("30/10");
    expect(vencimento(new Date(2026, 9, 25), "30 dias")).toBe("24/11");
  });
});
