// Formatação e estados do portal do fornecedor por idioma: pt igual ao de sempre, en em estilo britânico.
import { describe, expect, it } from "vitest";
import {
  formatSpDate,
  formatSpDateTime,
  formatSpMoney,
  formatSpQty,
  spOrderStatusBadge,
  spPublicationBadge,
} from "../spOrderFormat";

describe("formatSpDate", () => {
  it("troca a ordem de AAAA-MM-DD sem passar por Date, nos dois idiomas", () => {
    expect(formatSpDate("2026-03-05", "pt")).toBe("05/03/2026");
    expect(formatSpDate("2026-03-05", "en")).toBe("05/03/2026");
    expect(formatSpDate("2026-03-05T23:30:00-05:00", "pt")).toBe("05/03/2026");
  });

  it("sem valor mostra um travessão e um texto que não é data volta como veio", () => {
    expect(formatSpDate(null, "pt")).toBe("—");
    expect(formatSpDate(undefined, "en")).toBe("—");
    expect(formatSpDate("", "en")).toBe("—");
    expect(formatSpDate("não é data", "pt")).toBe("não é data");
  });
});

describe("formatSpDateTime", () => {
  const instante = new Date(2026, 10, 18, 14, 5).toISOString();

  it("dd/mm/aaaa, hh:mm na hora local, igual ao de sempre em pt", () => {
    expect(formatSpDateTime(instante, "pt")).toBe("18/11/2026, 14:05");
  });

  it("em inglês mantém dd/mm/aaaa e 24 horas", () => {
    expect(formatSpDateTime(instante, "en")).toBe("18/11/2026, 14:05");
  });

  it("sem valor, travessão; texto inválido volta como veio", () => {
    expect(formatSpDateTime(null, "pt")).toBe("—");
    expect(formatSpDateTime("xx", "en")).toBe("xx");
  });
});

describe("formatSpMoney e formatSpQty (o dinheiro e os números não seguem o idioma: pt-PT sempre)", () => {
  it("moeda: vírgula decimal e símbolo depois, como sempre", () => {
    expect(formatSpMoney(1234.5, "EUR").replace(/\s/g, " ")).toBe("1234,50 €");
    expect(formatSpMoney(1234.5).replace(/\s/g, " ")).toBe("1234,50 €");
  });

  it("em falta conta como zero e uma moeda inválida não rebenta", () => {
    expect(formatSpMoney(null, "EUR").replace(/\s/g, " ")).toBe("0,00 €");
    expect(formatSpMoney(10, "XX")).toContain("10");
    expect(formatSpMoney(10, "USD").replace(/\s/g, " ")).toBe("10,00 US$");
  });

  it("quantidades com até 4 casas decimais e vírgula decimal", () => {
    expect(formatSpQty(1500.5)).toBe("1500,5");
    expect(formatSpQty(0.123456)).toBe("0,1235");
    expect(formatSpQty(null)).toBe("0");
  });
});

describe("estados (os códigos da base não mudam; só se mapeiam para chaves)", () => {
  it("resposta do fornecedor", () => {
    expect(spPublicationBadge("confirmed")).toEqual({ labelKey: "sp.estado.confirmada", tone: "confirmed" });
    expect(spPublicationBadge("viewed")).toEqual({ labelKey: "sp.estado.vista", tone: "viewed" });
    expect(spPublicationBadge("sent")).toEqual({ labelKey: "sp.estado.nova", tone: "new" });
  });

  it("estado na empresa: só quando já avançou", () => {
    expect(spOrderStatusBadge("cancelled")).toEqual({ labelKey: "sp.estado.cancelada", tone: "cancelled" });
    expect(spOrderStatusBadge("received")).toEqual({ labelKey: "sp.estado.recebida", tone: "received" });
    expect(spOrderStatusBadge("partially_received")).toEqual({
      labelKey: "sp.estado.parcialmenteRecebida",
      tone: "partial",
    });
    expect(spOrderStatusBadge("ordered")).toBeNull();
  });
});
