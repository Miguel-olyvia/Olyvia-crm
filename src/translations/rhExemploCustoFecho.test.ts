// Os textos das contas do custo: o aviso do mes fechado diz o que e gravado e o que e de hoje; as chaves novas existem em pt e en.
import { describe, expect, it } from "vitest";
import { rhExemploCustoFechoTranslations as textos } from "./rhExemploCustoFecho";

const CHAVES_NOVAS = [
  "rhContas.linha.arredondamento",
  "rhContas.linha.limiteFaltas",
  "rhContas.nota.cargoDesconhecido",
  "rhContas.nota.faltasExcedem",
  "rhContas.rotuloCalculado",
];

describe("rhExemploCustoFecho", () => {
  it("as chaves novas das contas existem em pt e en", () => {
    for (const lingua of ["pt", "en"] as const) for (const chave of CHAVES_NOVAS) expect(textos[lingua][chave], `${lingua} ${chave}`).toBeTruthy();
  });

  it("o texto do mes fechado diz o que e gravado e o que e de hoje, sem «Nada se recalcula»", () => {
    expect(textos.pt["rhContas.fechado"]).toBe("Num mês fechado só a retribuição e as horas são as gravadas no fecho; a TSU, o seguro e os equipamentos são os de hoje.");
    for (const lingua of ["pt", "en"] as const) {
      expect(textos[lingua]["rhContas.fechado"]).not.toMatch(/Nada se recalcula|Nothing is recalculated/);
      expect(textos[lingua]["rhCustoFecho.nota"]).toMatch(/seguro|insurance/);
    }
  });

  it("a nota da TSU diz que a base inclui alimentacao, IHT e horas extra e manda confirmar com a contabilidade", () => {
    expect(textos.pt["rhContas.notaTsu"]).toBe("A base da TSU é a retribuição do mês sem km nem ajudas de custo (dentro dos limites legais); inclui o subsídio de alimentação, o IHT e as horas extra. Confirme com a contabilidade.");
  });

  it("o rotulo da comparacao diz que e so o salario base e a ajuda diz o que fica de fora", () => {
    expect(textos.pt["rhContas.comparar.repartido"]).toBe("Só o salário base repartido por 12 meses (14 ÷ 12) com TSU e seguro");
    expect(textos.pt["rhContas.comparar.repartidoAjuda"]).toContain("NÃO inclui alimentação, horas extra, IHT, km, ajudas, manuais nem equipamentos");
    expect(textos.en["rhContas.comparar.repartidoAjuda"]).toMatch(/does NOT include/);
  });
});
