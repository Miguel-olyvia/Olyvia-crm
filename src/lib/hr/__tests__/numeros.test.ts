/**
 * `numeroDe`: o unico "texto -> numero" do assistente de nova pessoa e do
 * contrato. `Number()` sozinho aceita "0x10" (16) e "1e3" (1000): num campo de
 * horas ou de subsidio isso grava um valor que ninguem escreveu.
 */
import { describe, expect, it } from "vitest";
import { numeroDe } from "@/lib/hr/numeros";

describe("numeroDe", () => {
  it("aceita inteiros e decimais, com virgula ou ponto, e tira espacos", () => {
    expect(numeroDe("40")).toBe(40);
    expect(numeroDe(" 6,5 ")).toBe(6.5);
    expect(numeroDe("6.5")).toBe(6.5);
    expect(numeroDe("0")).toBe(0);
    expect(numeroDe("-1")).toBe(-1);
    expect(numeroDe(".5")).toBe(0.5);
  });

  it("vazio e ausencia (null), nao zero", () => {
    expect(numeroDe("")).toBeNull();
    expect(numeroDe("   ")).toBeNull();
  });

  it("rejeita hexadecimal, notacao cientifica e lixo", () => {
    for (const texto of ["0x10", "0X1F", "1e3", "1E3", "2e-2", "Infinity", "NaN", "abc", "1 000", "1.2.3", "1,2,3", "--1", "5%", "0b11"]) {
      expect(numeroDe(texto), texto).toBeNull();
    }
  });
});
