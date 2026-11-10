// Os textos das contas do custo: o aviso do mes fechado diz o que e gravado e o que e de hoje; as chaves novas existem em pt e en.
import { describe, expect, it } from "vitest";
import { rhExemploCustoFechoTranslations as textos } from "./rhExemploCustoFecho";

const CHAVES_NOVAS = [
  "rhContas.linha.arredondamento",
  "rhContas.linha.limiteFaltas",
  "rhContas.nota.cargoDesconhecido",
  "rhContas.nota.faltasExcedem",
  "rhContas.rotuloCalculado",
  "rhContas.rotuloSubsidios",
  "rhContas.linha.subsidioAlimentacaoDia",
  "rhContas.linha.subsidioAlimentacaoHora",
  "rhContas.rotuloDia",
  "rhContas.rotuloDiaADia",
  "rhContas.rotuloDeFalta",
  "rhContas.dias",
  "rhContas.verDias",
  "rhContas.semDetalheFechado",
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

  it("a aba so mostra o custo do mes: ja nao ha textos de «para comparar», custo por hora nem acumulados", () => {
    for (const lingua of ["pt", "en"] as const) {
      expect(Object.keys(textos[lingua]).filter((c) => c.startsWith("rhContas.comparar."))).toEqual([]);
      expect(textos[lingua]["rhContas.rotuloSubsidios"]).toBeTruthy();
    }
  });
});
