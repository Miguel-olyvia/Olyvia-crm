/**
 * A conta bancaria: seis formatos, uma so validacao por ramo.
 *
 * O que este ficheiro protege e a garantia da ronda 1: o ramo do IBAN NAO foi
 * enfraquecido para acomodar os outros formatos. Um IBAN com o digito de
 * controlo errado continua a ser recusado, e nao passa a ser aceite so porque
 * "parece alfanumerico".
 */
import { describe, expect, it } from "vitest";
import {
  chaveDoRotuloDaConta,
  contaValida,
  ibanValido,
  mascaraDaConta,
  minimoDaConta,
  normalizarConta,
} from "@/lib/hr/conta";

// IBAN portugues de teste do proprio IBAN Registry.
const IBAN_BOM = "PT50000201231234567890154";

describe("conta bancaria", () => {
  it("normaliza como a RPC: maiusculas e sem espacos", () => {
    expect(normalizarConta(" pt50 0002 0123 ")).toBe("PT500002 0123".replace(/\s/g, ""));
  });

  it("valida o IBAN pelo mod-97, nao pela aparencia", () => {
    expect(ibanValido(IBAN_BOM)).toBe(true);
    expect(ibanValido("PT50 0002 0123 1234 5678 9015 4")).toBe(true);
    // Um digito de controlo errado: mesma forma, IBAN falso.
    expect(ibanValido("PT51000201231234567890154")).toBe(false);
    // Formato que nem chega ao mod-97.
    expect(ibanValido("1234567890123456")).toBe(false);
    expect(ibanValido("PT5")).toBe(false);
  });

  it("so o formato iban exige mod-97", () => {
    expect(contaValida("iban", IBAN_BOM)).toBe(true);
    expect(contaValida("iban", "PT51000201231234567890154")).toBe(false);

    // O mesmo valor que falha como IBAN serve como conta local: nao ha digito
    // de controlo universal para o validar, e inventar um seria pior.
    expect(contaValida("clabe", "PT51000201231234567890154")).toBe(true);
    expect(contaValida("conta_mais_sort_code", "12345678")).toBe(true);
    expect(contaValida("outro", "AB12CD34")).toBe(true);
  });

  it("nos outros formatos recusa o que o padrao da base recusa", () => {
    // Menos de 4 caracteres: a mascara dos "ultimos quatro" seria o numero.
    expect(contaValida("clabe", "123")).toBe(false);
    // Mais de 34.
    expect(contaValida("outro", "1".repeat(35))).toBe(false);
    // Pontuacao: o padrao e ^[0-9A-Z]{4,34}$.
    expect(contaValida("outro", "1234-5678")).toBe(false);
  });

  it("vazio e ausencia, nao invalido", () => {
    expect(contaValida("iban", "")).toBe(true);
    expect(contaValida("clabe", "   ")).toBe(true);
  });

  it("o pais so aparece na mascara do IBAN", () => {
    expect(mascaraDaConta("iban", "0154", "PT")).toContain("PT");
    expect(mascaraDaConta("iban", "0154", "PT")).toContain("0154");
    // Nos outros formatos nao ha pais guardado -- a base obriga a NULL.
    expect(mascaraDaConta("clabe", "0154", null)).toBe("•••• 0154");
    // Sem mascara nao se inventa nada.
    expect(mascaraDaConta("iban", null, "PT")).toBeNull();
  });

  it("o rotulo e o minimo acompanham o formato", () => {
    expect(chaveDoRotuloDaConta("iban")).toBe("hr.campos.iban");
    expect(chaveDoRotuloDaConta("clabe")).toBe("hr.campos.clabe");
    expect(chaveDoRotuloDaConta("banco_mais_conta")).toBe("hr.campos.numeroConta");
    expect(minimoDaConta("iban")).toBe(15);
    expect(minimoDaConta("outro")).toBe(4);
  });
});
