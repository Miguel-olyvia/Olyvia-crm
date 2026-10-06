import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diasUteisEntre, sugerirProtecoesELogistica } from "../sugestaoFichaLocal";

describe("sugestão da ficha do local (Operações)", () => {
  it("é a mesma lógica do CRM (ficheiro igual)", () => {
    const aqui = readFileSync(resolve(__dirname, "../sugestaoFichaLocal.ts"), "utf8");
    const crm = readFileSync(resolve(__dirname, "../../../../src/lib/addresses/sugestaoFichaLocal.ts"), "utf8");
    expect(aqui.replace(/\r\n/g, "\n")).toBe(crm.replace(/\r\n/g, "\n"));
  });

  it("usa os dias do plano da obra", () => {
    const s = sugerirProtecoesELogistica(
      { estacionamento: "pago", zona_estacionamento: "amarela", tem_elevador: false, piso: "3.º" },
      [],
      { diasObra: diasUteisEntre("2026-10-05", "2026-10-16") },
    );
    expect(s.dias).toBe(10);
    expect(s.diasOrigem).toBe("plano");
    expect(s.logistica.find((l) => l.chave === "parquimetro")!.total).toBe(100);
    expect(s.logistica.find((l) => l.chave === "escada")!.quantidade).toBe(3);
  });

  it("diasUteisEntre conta de segunda a sexta, os dois dias incluídos", () => {
    expect(diasUteisEntre("2026-10-05", "2026-10-09")).toBe(5);
    expect(diasUteisEntre("2026-10-09", "2026-10-12")).toBe(2);
    expect(diasUteisEntre(null, "2026-10-12")).toBeNull();
    expect(diasUteisEntre("2026-10-12", "2026-10-05")).toBeNull();
  });
});
