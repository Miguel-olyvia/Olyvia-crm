// Os documentos de um negócio que o processo precisa de encontrar: o orçamento a partir do qual se cria a proposta, a proposta que se envia ou
// aceita, a proposta aceite de onde nasce o contrato, e o contrato que se assina. Lidos da ficha, sem nunca rebentar com valores em falta.
import { describe, expect, it } from "vitest";
import { contratoVivo, orcamentoParaProposta, propostaAceite, propostaViva, temPropostaEnviadaOuAceite } from "./documentosDoNegocio";
import { negocioDb } from "./fichaFabrica";
import type { ContratoDb, OrcamentoDb, PropostaDb } from "./fichaTipos";

const orc = (id: string, estado: string | null, criado_em: string | null): OrcamentoDb => ({ id, numero: id, estado, total: 1, criado_em });
const prop = (id: string, status: string | null, criado_em: string | null, extra: Partial<PropostaDb> = {}): PropostaDb => ({
  id, numero: id, titulo: null, status, valor: 1, valid_until: null, terms: null, enviada_em: null, aceite_em: null, criado_em, ...extra,
});
const con = (id: string, status: string | null, criado_em: string | null): ContratoDb => ({ id, numero: id, status, valor: 1, assinado_em: null, criado_em, tem_base: true });

describe("orcamentoParaProposta", () => {
  it("é o orçamento aceite", () => {
    const n = negocioDb({ orcamentos: [orc("a", "enviado", "2026-10-03T09:00:00Z"), orc("b", "aceite", "2026-10-01T09:00:00Z")] });
    expect(orcamentoParaProposta(n)).toBe("b");
  });

  it("sem nenhum aceite, o mais recente (um rascunho também: a proposta carrega-o por id)", () => {
    const n = negocioDb({ orcamentos: [orc("a", "rascunho", "2026-10-03T09:00:00Z"), orc("b", "enviado", "2026-10-01T09:00:00Z")] });
    expect(orcamentoParaProposta(n)).toBe("a");
  });

  it("um orçamento recusado só serve se não houver mais nenhum", () => {
    expect(orcamentoParaProposta(negocioDb({ orcamentos: [orc("a", "rejeitado", "2026-10-03T09:00:00Z"), orc("b", "enviado", "2026-10-01T09:00:00Z")] }))).toBe("b");
    expect(orcamentoParaProposta(negocioDb({ orcamentos: [orc("a", "rejeitado", "2026-10-03T09:00:00Z")] }))).toBe("a");
  });

  it("sem orçamentos, null", () => {
    expect(orcamentoParaProposta(negocioDb())).toBeNull();
  });
});

describe("propostaViva", () => {
  it("é a mais recente que não foi recusada", () => {
    const n = negocioDb({ propostas: [prop("velha", "sent", "2026-10-01T09:00:00Z"), prop("nova", "rejected", "2026-10-05T09:00:00Z")] });
    expect(propostaViva(n)?.id).toBe("velha");
  });

  it("se só há recusadas, a mais recente delas; sem propostas, null", () => {
    expect(propostaViva(negocioDb({ propostas: [prop("a", "rejected", "2026-10-01T09:00:00Z"), prop("b", "declined", "2026-10-05T09:00:00Z")] }))?.id).toBe("b");
    expect(propostaViva(negocioDb())).toBeNull();
  });
});

describe("propostaAceite", () => {
  it("é a mais recente aceite (pelo estado ou pela data de aceitação)", () => {
    const n = negocioDb({ propostas: [
      prop("a", "accepted", "2026-10-01T09:00:00Z"), prop("b", "sent", "2026-10-07T09:00:00Z"), prop("c", "approved", "2026-10-04T09:00:00Z"),
    ] });
    expect(propostaAceite(n)?.id).toBe("c");
  });

  it("sem nenhuma aceite, null", () => {
    expect(propostaAceite(negocioDb({ propostas: [prop("a", "draft", "2026-10-01T09:00:00Z")] }))).toBeNull();
  });
});

describe("temPropostaEnviadaOuAceite", () => {
  it("uma proposta enviada ou aceite conta, em qualquer posição da lista", () => {
    expect(temPropostaEnviadaOuAceite(negocioDb({ propostas: [prop("a", "sent", "2026-10-01T09:00:00Z", { enviada_em: "2026-10-02T09:00:00Z" })] }))).toBe(true);
    expect(temPropostaEnviadaOuAceite(negocioDb({ propostas: [prop("a", "accepted", "2026-10-01T09:00:00Z"), prop("b", "draft", "2026-10-09T09:00:00Z")] }))).toBe(true);
  });

  it("rascunhos, recusadas e a falta de propostas não contam", () => {
    expect(temPropostaEnviadaOuAceite(negocioDb())).toBe(false);
    expect(temPropostaEnviadaOuAceite(negocioDb({ propostas: [prop("a", "draft", null)] }))).toBe(false);
    expect(temPropostaEnviadaOuAceite(negocioDb({ propostas: [prop("a", "rejected", null, { enviada_em: "2026-10-02T09:00:00Z" }), prop("b", "declined", null)] }))).toBe(false);
  });

  it("uma enviada que o cliente recusou e um rascunho novo: nenhuma viva", () => {
    expect(temPropostaEnviadaOuAceite(negocioDb({ propostas: [prop("a", "rejected", "2026-10-01T09:00:00Z"), prop("b", "draft", "2026-10-09T09:00:00Z")] }))).toBe(false);
  });
});

describe("contratoVivo", () => {
  it("é o mais recente que não está cancelado", () => {
    const n = negocioDb({ contratos: [con("velho", "signed", "2026-10-01T09:00:00Z"), con("novo", "cancelled", "2026-10-09T09:00:00Z")] });
    expect(contratoVivo(n)?.id).toBe("velho");
  });

  it("sem contratos, ou só cancelados, null", () => {
    expect(contratoVivo(negocioDb())).toBeNull();
    expect(contratoVivo(negocioDb({ contratos: [con("a", "cancelled", null)] }))).toBeNull();
  });
});
