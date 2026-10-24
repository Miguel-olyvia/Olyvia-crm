// A base só aceita estas fases numa perda (lead, contacto, visita, levantamento, orcamento, proposta, contrato): «ganho» não existe lá.
// O protótipo guarda a fase em que o negócio estava (`FaseNaPerda`); `faseParaBase` traduz-a para o que a base aceita.
import { describe, expect, it } from "vitest";
import { faseParaBase } from "./faseBase";

describe("faseParaBase", () => {
  it.each([["levantamento"], ["orcamento"], ["proposta"], ["contrato"]] as const)("%s segue como está", (fase) => {
    expect(faseParaBase(fase)).toBe(fase);
  });

  it("«ganho» (que a base não aceita) vai como «contrato», a última fase antes de ganhar", () => {
    expect(faseParaBase("ganho")).toBe("contrato");
  });
});
