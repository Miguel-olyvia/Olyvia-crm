// Os limites da base nas linhas do levantamento: a medida é numeric(12,3), maior que 0 e menor que 1 000 000 (0,0004 arredonda a 0,000 e a base
// recusa), e o texto «Outro» tem 60 caracteres. Fora destes valores o formulário recusa em vez de deixar a gravação rebentar na base.
import { describe, expect, it } from "vitest";
import { MEDIDA_MAXIMA, MEDIDA_MINIMA, novaLinha, validarLevantamento, type LinhaForm } from "./levantamento";
import { negocioMetasNovoTranslations } from "@/translations/negocioMetasNovo";

const linha = (medida: string, extra: Partial<LinhaForm> = {}): LinhaForm => ({ ...novaLinha("l1"), divisao: "cozinha", trabalho: "bancada", medida, ...extra });
const erroDaMedida = (medida: string) =>
  validarLevantamento({ data: "2026-10-20", feitoPor: "Ana", estado: "porFazer", observacoes: "", linhas: [linha(medida)] }).linhas?.l1?.medida;

describe("a medida de uma linha do levantamento", () => {
  it("os limites são os da base: 0,001 e 999 999,999", () => {
    expect(MEDIDA_MINIMA).toBe(0.001);
    expect(MEDIDA_MAXIMA).toBe(999_999.999);
  });

  it("aceita o mínimo, o máximo, valores a meio (vírgula ou ponto) e o que a base arredonda para dentro (0,0005 e 0,0009 dão 0,001)", () => {
    for (const ok of ["0,001", "0.001", "0,0005", "0,0009", "2,5", "10", "999999,999", "999999.999", "999999.9994"]) expect(erroDaMedida(ok), ok).toBeUndefined();
  });

  it("recusa o que arredonda a zero (0,0004) e o que não cabe (1 000 000, ou 999 999,9996 que arredonda para lá) como «fora» dos limites", () => {
    for (const fora of ["0,0004", "0,0001", "1000000", "1000000,5", "99999999", "999999.9996"]) expect(erroDaMedida(fora), fora).toBe("fora");
  });

  it("vazia continua obrigatória; zero, negativos e o que não é número continuam inválidos (como antes)", () => {
    expect(erroDaMedida("")).toBe("obrigatorio");
    for (const invalido of ["abc", "0", "-1"]) expect(erroDaMedida(invalido), invalido).toBe("invalido");
  });

  it("o texto de «fora dos limites» existe em pt e en, com os limites", () => {
    expect(negocioMetasNovoTranslations.pt["businessGoals.new.error.measure.fora"]).toMatch(/0,001.*999 999,999/);
    expect(negocioMetasNovoTranslations.en["businessGoals.new.error.measure.fora"]).toMatch(/0\.001.*999,999\.999/);
  });
});
