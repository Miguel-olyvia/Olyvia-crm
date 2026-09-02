import { describe, expect, it } from "vitest";
import { enderecoDaEtiqueta, serveParaImprimir } from "../etiqueta";

describe("o endereço que a etiqueta carrega", () => {
  it("junta a origem, a base e o código", () => {
    expect(enderecoDaEtiqueta("https://www.olyvia-ai.com", "/operacao/", "100.107")).toBe(
      "https://www.olyvia-ai.com/operacao/ativos/100.107"
    );
  });

  it("não duplica barras, venham elas como vierem", () => {
    expect(enderecoDaEtiqueta("https://x.pt/", "/operacao/", "A-1")).toBe(
      "https://x.pt/operacao/ativos/A-1"
    );
    expect(enderecoDaEtiqueta("https://x.pt", "/operacao", "A-1")).toBe(
      "https://x.pt/operacao/ativos/A-1"
    );
  });

  it("um código com espaços ou acentos continua a ser um endereço válido", () => {
    // "BM24.BM24 PISO" existe mesmo na instância observada.
    expect(enderecoDaEtiqueta("https://x.pt", "/operacao", "BM24.BM24 PISO")).toBe(
      "https://x.pt/operacao/ativos/BM24.BM24%20PISO"
    );
    expect(enderecoDaEtiqueta("https://x.pt", "/operacao", "Extintor nº3")).toContain("n%C2%BA3");
  });

  it("leva o código e não um id", () => {
    // O código diz-se ao telefone e escreve-se à mão se a etiqueta se rasgar.
    const u = enderecoDaEtiqueta("https://x.pt", "/operacao", "100.107");
    expect(u).toContain("100.107");
    expect(u).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe("se serve para imprimir", () => {
  it("um endereço a sério serve", () => {
    expect(serveParaImprimir("https://www.olyvia-ai.com")).toBe(true);
    expect(serveParaImprimir("https://olyvia-crm-git-x.vercel.app")).toBe(true);
  });

  it("localhost NÃO serve", () => {
    // Descobre-se depois de colar trezentos autocolantes que não abrem nada.
    expect(serveParaImprimir("http://localhost:5274")).toBe(false);
    expect(serveParaImprimir("http://127.0.0.1:5274")).toBe(false);
    expect(serveParaImprimir("http://[::1]:5274")).toBe(false);
  });

  it("um domínio que só CONTÉM 'localhost' serve", () => {
    expect(serveParaImprimir("https://localhost-teste.pt")).toBe(true);
  });
});
