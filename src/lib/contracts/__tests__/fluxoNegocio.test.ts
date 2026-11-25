// 23/11/2026 (auditoria de permissões, B3/C1): os contratos do fluxo do Negócio (Emylia) pela mesma regra de
// fn_neg_documento_do_fluxo_emylia — pelo negócio, pela adenda ou pelo orçamento; sem leitura conta como do CRM.
import { describe, expect, it } from "vitest";
import { contratosDoFluxoNegocio, idsParaFluxo } from "../fluxoNegocio";

const linhas = {
  negocios: [{ id: "n-em", fluxo_emylia: true }, { id: "n-crm", fluxo_emylia: false }],
  adendas: [{ id: "a-em", negocio_id: "n-em" }, { id: "a-crm", negocio_id: "n-crm" }],
  quotes: [
    { id: "q-vd", fluxo_emylia: true, negocio_id: null },
    { id: "q-neg", fluxo_emylia: false, negocio_id: "n-em" },
    { id: "q-crm", fluxo_emylia: false, negocio_id: null },
  ],
};

describe("contratosDoFluxoNegocio", () => {
  it("conta pelo negócio, pela adenda e pelo orçamento", () => {
    const s = contratosDoFluxoNegocio([
      { id: "c1", negocio_id: "n-em" },
      { id: "c2", adenda_id: "a-em" },
      { id: "c3", quote_id: "q-vd" },
      { id: "c4", quote_id: "q-neg" },
    ], linhas);
    expect([...s].sort()).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("os do CRM (incl. negócio do fecho v4 com fluxo_emylia = false) não contam", () => {
    const s = contratosDoFluxoNegocio([
      { id: "c1", negocio_id: "n-crm" },
      { id: "c2", adenda_id: "a-crm" },
      { id: "c3", quote_id: "q-crm" },
      { id: "c4" },
    ], linhas);
    expect(s.size).toBe(0);
  });

  it("sem leitura da linha (RLS) conta como do CRM: o ecrã fica como estava", () => {
    const s = contratosDoFluxoNegocio([{ id: "c1", negocio_id: "n-desconhecido" }, { id: "c2", quote_id: "q-desconhecido" }], linhas);
    expect(s.size).toBe(0);
  });

  it("idsParaFluxo junta os ids sem repetidos nem nulos", () => {
    expect(idsParaFluxo([
      { id: "c1", negocio_id: "n1", quote_id: "q1" },
      { id: "c2", negocio_id: "n1", adenda_id: null, quote_id: "q2" },
      { id: "c3", adenda_id: "a1" },
    ])).toEqual({ negocios: ["n1"], adendas: ["a1"], quotes: ["q1", "q2"] });
  });
});
