// As condições da proposta como se guardam em `proposals.terms` (jsonb): só prazo, início, pagamento e garantia. A validade e as notas já
// têm coluna própria; `terms` chega ao portal anónimo, por isso nunca leva nada interno.
import { describe, expect, it } from "vitest";
import { lerTermos, paraTermos, type CondicoesTermos } from "./termosProposta";

const BOAS: CondicoesTermos = { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 };

describe("paraTermos", () => {
  it("devolve exatamente as quatro chaves, e mais nada", () => {
    expect(paraTermos(BOAS)).toEqual({ prazo_execucao_dias: 20, inicio_previsto: "2026-11-02", pagamento: "metade", garantia_anos: 2 });
  });

  it("não deixa passar chaves a mais, mesmo que o objeto de entrada as traga", () => {
    const comExtra = { ...BOAS, validade: 30, notas: "interno", margem: 0.4 } as unknown as CondicoesTermos;
    expect(Object.keys(paraTermos(comExtra)).sort()).toEqual(["garantia_anos", "inicio_previsto", "pagamento", "prazo_execucao_dias"]);
  });
});

describe("lerTermos", () => {
  it("lê o que paraTermos escreveu (ida e volta)", () => {
    expect(lerTermos(paraTermos(BOAS))).toEqual({ condicoes: BOAS, legivel: true });
  });

  it.each([null, undefined, {}])("sem condições (%j) é legível e vazio", (vazio) => {
    expect(lerTermos(vazio)).toEqual({ condicoes: null, legivel: true });
  });

  it.each([
    ["texto", "30 dias"],
    ["lista", [1, 2]],
    ["número", 7],
    ["uma chave só", { prazo_execucao_dias: 20 }],
    ["pagamento desconhecido", { ...paraTermos(BOAS), pagamento: "cheque" }],
    ["garantia fora das opções", { ...paraTermos(BOAS), garantia_anos: 9 }],
    ["prazo em texto", { ...paraTermos(BOAS), prazo_execucao_dias: "20" }],
    ["prazo decimal", { ...paraTermos(BOAS), prazo_execucao_dias: 2.5 }],
    ["início que não é data", { ...paraTermos(BOAS), inicio_previsto: "amanhã" }],
    ["início impossível", { ...paraTermos(BOAS), inicio_previsto: "2026-13-45" }],
  ])("um formato que não se reconhece (%s) não rebenta: fica ilegível", (_nome, terms) => {
    expect(lerTermos(terms)).toEqual({ condicoes: null, legivel: false });
  });
});
