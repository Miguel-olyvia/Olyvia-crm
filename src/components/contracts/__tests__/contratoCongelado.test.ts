import { describe, it, expect } from "vitest";
import { hasFrozenBody, UNFREEZE_CONTRACT_COLUMNS } from "../contractDocument";

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
