import { describe, it, expect } from "vitest";
import { hasFrozenBody, UNFREEZE_CONTRACT_COLUMNS, isContractInForce } from "../contractDocument";

/**
 * Descarregar um contrato assinado é LER, não produzir. Até aqui o documento
 * era refeito a cada descarga a partir da minuta viva, o que fazia um contrato
 * assinado em Julho mudar hoje porque alguém editou a minuta.
 */
describe("um contrato assinado deixa de mudar por alguém o abrir", () => {
  it("reconhece a cópia congelada", () => {
    expect(hasFrozenBody({ contract_body_frozen_html: "<p>documento</p>" })).toBe(true);
  });

  it("um contrato por congelar não é confundido com um congelado", () => {
    expect(hasFrozenBody({ contract_body_frozen_html: null })).toBe(false);
    expect(hasFrozenBody({})).toBe(false);
    // Uma cópia vazia ou só com espaços não é documento nenhum: servi-la daria
    // uma folha em branco a quem descarregasse um contrato assinado.
    expect(hasFrozenBody({ contract_body_frozen_html: "" })).toBe(false);
    expect(hasFrozenBody({ contract_body_frozen_html: "   \n  " })).toBe(false);
  });

  it("descongelar limpa a cópia E a data a que ela correspondia", () => {
    // Deixar a data para trás faria o documento dizer que corresponde a um
    // momento cuja cópia já não existe.
    expect(UNFREEZE_CONTRACT_COLUMNS).toEqual({
      contract_body_frozen_html: null,
      contract_frozen_at: null,
    });
  });
});

/**
 * Quando é que um contrato está "em vigor" para efeitos de congelamento.
 * A data de assinatura do cliente não chega: 14 contratos estão marcados como
 * assinados ou activos sem essa data, porque só a empresa assinou.
 */
describe("que contratos são congelados", () => {
  it("o cliente assinou", () => {
    expect(isContractInForce({ signature_date: "2026-08-19T10:00:00Z", status: "pending_signature" })).toBe(true);
  });

  it("assinado só pela empresa, sem data de assinatura do cliente", () => {
    expect(isContractInForce({ signature_date: null, status: "signed" })).toBe(true);
    expect(isContractInForce({ signature_date: null, status: "active" })).toBe(true);
  });

  it("um rascunho não congela — ainda está a ser trabalhado", () => {
    expect(isContractInForce({ signature_date: null, status: "draft" })).toBe(false);
    expect(isContractInForce({})).toBe(false);
  });
});
