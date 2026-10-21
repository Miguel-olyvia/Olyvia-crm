import { describe, expect, it } from "vitest";
import { em3, ibanCurto, ibanValido, metodoDe, referenciaMb, vencimento } from "./pagamentoCliente";

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

describe("a forma de pagar (21/10)", () => {
  it("o cliente escolhe entre transferência, referência MB e débito direto; sem escolha é transferência", () => {
    expect(metodoDe("Débito direto")).toBe("Débito direto");
    expect(metodoDe("Referência MB")).toBe("Referência MB");
    expect(metodoDe("Cheque")).toBe("Transferência");
    expect(metodoDe(undefined)).toBe("Transferência");
  });
  it("o IBAN do débito direto é português e fica à vista só com os últimos 4 dígitos", () => {
    expect(ibanValido("PT50 0002 0123 1234 5678 9015 4")).toBe(true);
    expect(ibanValido("PT50 0002 0123")).toBe(false);
    expect(ibanValido("ES91 2100 0418 4502 0005 1332")).toBe(false);
    expect(ibanCurto("PT50 0002 0123 1234 5678 9015 4")).toBe("PT50 ···· 0154");
  });
});
