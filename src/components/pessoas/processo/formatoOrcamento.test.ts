import { describe, expect, it } from "vitest";
import { eur, numeroParaTexto, pct } from "./formatoOrcamento";

describe("eur (vírgula decimal, ponto nos milhares, € depois com espaço)", () => {
  it.each([
    [0, "0,00 €"], [318, "318,00 €"], [418.2, "418,20 €"], [1476.02, "1.476,02 €"], [10_000_000, "10.000.000,00 €"], [0.005, "0,01 €"],
  ])("%s -> %s", (valor, texto) => {
    expect(eur(valor)).toBe(texto);
  });

  it("arredonda ao cêntimo, sem ruído de vírgula flutuante", () => {
    expect(eur(0.1 + 0.2)).toBe("0,30 €");
    expect(eur(286.20000000000005)).toBe("286,20 €");
  });
});

describe("pct (uma casa decimal, truncada, vírgula, % depois com espaço)", () => {
  it.each([[0.28, "28 %"], [0.279, "27,9 %"], [0.4, "40 %"], [0.2793, "27,9 %"], [0, "0 %"], [0.35, "35 %"], [0.3333, "33,3 %"]])("%s -> %s", (valor, texto) => {
    expect(pct(valor)).toBe(texto);
  });

  it("trunca em vez de arredondar: 27,96 % nunca aparece como 28 % ('abaixo do mínimo de 28 %' seria um absurdo)", () => {
    expect(pct(0.2796)).toBe("27,9 %");
    expect(pct(0.27999)).toBe("27,9 %");
  });
});

describe("numeroParaTexto (o que se escreve num campo numérico)", () => {
  it("usa a vírgula decimal e não escreve zeros a mais", () => {
    expect(numeroParaTexto(15.5)).toBe("15,5");
    expect(numeroParaTexto(10)).toBe("10");
    expect(numeroParaTexto(0.3)).toBe("0,3");
  });
});
