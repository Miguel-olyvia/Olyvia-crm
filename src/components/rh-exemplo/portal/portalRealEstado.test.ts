// Do estado real do processo para os quatro passos e a etiqueta da «Ficha de admissão».
import { describe, expect, it } from "vitest";
import { etiquetaDoEstadoReal, passosDoEstadoReal } from "./portalRealEstado";

const situacoes = (estado: string | null | undefined) => passosDoEstadoReal(estado).map((p) => p.situacao);

describe("passosDoEstadoReal", () => {
  it("tem sempre os quatro passos pela ordem Ficha, Aprovação, Contrato, Acesso", () => {
    expect(passosDoEstadoReal("convidada").map((p) => p.passo)).toEqual(["ficha", "aprovacao", "contrato", "acesso"]);
  });

  it.each([
    ["convidada", ["atual", "falta", "falta", "falta"]],
    ["em_preenchimento", ["atual", "falta", "falta", "falta"]],
    ["devolvida", ["atual", "falta", "falta", "falta"]],
    ["submetida", ["feito", "atual", "falta", "falta"]],
    ["aprovada", ["feito", "feito", "atual", "falta"]],
    ["a_aguardar_assinaturas", ["feito", "feito", "atual", "falta"]],
    ["assinaturas_concluidas", ["feito", "feito", "feito", "atual"]],
    ["a_aguardar_ativacao", ["feito", "feito", "feito", "atual"]],
    ["concluida", ["feito", "feito", "feito", "feito"]],
  ])("«%s» -> %j", (estado, esperado) => {
    expect(situacoes(estado)).toEqual(esperado);
  });

  it.each([null, undefined, "", "estado_novo", "constructor", "toString"])("um estado desconhecido (%j) deixa tudo por fazer", (estado) => {
    expect(situacoes(estado)).toEqual(["falta", "falta", "falta", "falta"]);
  });
});

describe("etiquetaDoEstadoReal", () => {
  it.each([
    ["convidada", "a_preencher"],
    ["em_preenchimento", "a_preencher"],
    ["devolvida", "devolvida"],
    ["submetida", "submetida"],
    ["aprovada", "aprovada"],
    ["concluida", "aprovada"],
    [null, "a_preencher"],
    ["constructor", "a_preencher"],
  ])("«%s» -> %s", (estado, etiqueta) => {
    expect(etiquetaDoEstadoReal(estado)).toBe(etiqueta);
  });
});
