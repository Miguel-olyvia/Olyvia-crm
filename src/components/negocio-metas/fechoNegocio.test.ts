// O tipo de fecho de um negócio: os dois valores que a base conhece, a omissão («contrato») e o que se ignora num negócio de fecho «proposta»
// (os contratos). Tudo o que a base devolver fora destes valores lê-se como desconhecido (nulo), nunca como «contrato».
import { describe, expect, it } from "vitest";
import { ehFecho, FECHO_POR_OMISSAO, FECHOS_NEGOCIO, fechoDe, semContratosSeProposta } from "./fechoNegocio";
import type { NegocioMes } from "./negocioMetas";

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "n1", pessoaId: "p", pessoa: "Ana", servico: "Cozinha", comercial: "Rui", dias: 1, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});

describe("fechoNegocio", () => {
  it("há dois tipos, e a omissão é o contrato", () => {
    expect([...FECHOS_NEGOCIO].sort()).toEqual(["contrato", "proposta"]);
    expect(FECHO_POR_OMISSAO).toBe("contrato");
  });

  it("ehFecho só aceita exatamente os dois valores", () => {
    expect(ehFecho("proposta")).toBe(true);
    expect(ehFecho("contrato")).toBe(true);
    for (const v of ["Proposta", "", " contrato", null, undefined, 1, {}, ["proposta"]]) expect(ehFecho(v), String(v)).toBe(false);
  });

  it("fechoDe devolve o valor ou nulo, nunca uma omissão inventada", () => {
    expect(fechoDe("proposta")).toBe("proposta");
    expect(fechoDe("xpto")).toBeNull();
    expect(fechoDe(undefined)).toBeNull();
  });

  it("semContratosSeProposta tira o contrato só nos negócios de fecho «proposta», sem mutar o original", () => {
    const original = negocio({ fecho: "proposta", contrato: { estado: "assinado" } });
    const visto = semContratosSeProposta(original);
    expect(visto.contrato).toBeNull();
    expect(original.contrato).toEqual({ estado: "assinado" });
    const noContrato = negocio({ fecho: "contrato", contrato: { estado: "assinado" } });
    expect(semContratosSeProposta(noContrato)).toBe(noContrato);
    const semTipo = negocio({ contrato: { estado: "assinado" } });
    expect(semContratosSeProposta(semTipo)).toBe(semTipo);
  });
});
