// A fase de um negócio DA BASE (`estadoReal`) segue a regra da base para a coluna do Quadro: com orçamentos, Orçamento; sem eles, Levantamento só com um
// levantamento ligado (feito ou por fazer). Os negócios de exemplo, com a sua decisão do levantamento, não mudam (ver percursoNegocio.test.ts).
import { describe, expect, it } from "vitest";
import { contactoBase, levantamentoBase, negocioBase, registosBase } from "@/components/pessoas/fabricaTestes";
import { faseDoPercurso } from "./percursoNegocio";

const daBase = negocioBase("n1", { estadoReal: "aberto" });
const levantamentoLigado = registosBase({ levantamentos: [levantamentoBase("rl-1", { negocioId: "n1", estado: "porFazer" })] });

describe("faseDoPercurso de um negócio da base", () => {
  it("sem orçamentos e com um levantamento ligado (mesmo por fazer) está em Levantamento", () => {
    expect(faseDoPercurso(daBase, { registos: levantamentoLigado })).toBe("levantamento");
  });

  it("o levantamento de outro negócio não conta", () => {
    const doutro = registosBase({ levantamentos: [levantamentoBase("rl-2", { negocioId: "n2" })] });
    expect(faseDoPercurso(daBase, { registos: doutro })).toBe("orcamento");
  });

  it("só com uma chamada ligada não está em Levantamento (a abordagem trata do resto)", () => {
    expect(faseDoPercurso(daBase, { registos: registosBase({ contactos: [contactoBase("rc-1", { negocioId: "n1" })] }) })).toBe("orcamento");
  });

  it("havendo orçamentos manda o Orçamento, mesmo com um levantamento ligado", () => {
    const comOrc = { ...daBase, orcamentos: [{ id: "o1", valor: 100, escolhido: false }] };
    expect(faseDoPercurso(comOrc, { registos: levantamentoLigado })).toBe("orcamento");
  });
});
