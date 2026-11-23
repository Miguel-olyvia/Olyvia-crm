import { describe, expect, it } from "vitest";
import type { PropostaObra } from "./dadosObra";
import { variaveisDaObra } from "./variaveisDaObra";

const obra = (over: Partial<PropostaObra["condicoes"]> = {}, prest: PropostaObra["prestacoes"] = [
  { l: "Na adjudicação", p: 0.5, v: 500, fase: 0 }, { l: "No fim da obra", p: 0.5, v: 500, fase: "fim" },
]): PropostaObra => ({
  pedido: null, modelo: "", fases: [], materiais: { mats: [], escolhidos: [], fornecidos: [], escolhas: [], nec: [] }, planeamento: null,
  prestacoes: prest, total: 1000,
  condicoes: { prazo: 12, garantia: null, validaAte: new Date(2026, 11, 30), notas: null, ...over },
  aceitacao: { empresa: "Mudelar", comercial: null, cliente: "Ana Silva", aceite: null },
});

describe("variaveisDaObra", () => {
  it("as variáveis do template a partir dos blocos da obra", () => {
    expect(variaveisDaObra(obra())).toEqual({
      condicoes_pagamento: "50% - Adjudicação / 50% - Fim da obra", validade: "30/12/2026", prazo: "12 dias úteis", garantia: "2 anos", cliente_nome: "Ana Silva",
    });
  });
  it("um dia útil, a garantia escrita e 100% na adjudicação", () => {
    const v = variaveisDaObra(obra({ prazo: 1, garantia: "5 anos" }, [{ l: "Na adjudicação", p: 1, v: 1000, fase: 0 }]));
    expect(v.prazo).toBe("1 dia útil");
    expect(v.garantia).toBe("5 anos");
    expect(v.condicoes_pagamento).toBe("100% - Adjudicação");
  });
  it("sem obra: nada", () => {
    expect(variaveisDaObra(null)).toEqual({});
  });
});
