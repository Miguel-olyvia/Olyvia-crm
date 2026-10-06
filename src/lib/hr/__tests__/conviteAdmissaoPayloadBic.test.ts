/**
 * O BIC no payload do convite: viaja como `conta_swift`, sempre presente,
 * normalizado, ou `null` quando a pessoa o deixa em branco (chave ausente =
 * preserva, `null` = limpa).
 */
import { describe, expect, it } from "vitest";
import {
  CHAVES_PAYLOAD_CONVITE,
  RASCUNHO_CONVITE_VAZIO,
  construirPayloadConvite,
} from "@/lib/hr/conviteAdmissaoPayload";

describe("BIC no payload do convite", () => {
  it("conta_swift e uma chave do contrato, entre conta_banco e conta_titular", () => {
    const i = CHAVES_PAYLOAD_CONVITE.indexOf("conta_swift");
    expect(i).toBeGreaterThan(-1);
    expect(CHAVES_PAYLOAD_CONVITE[i - 1]).toBe("conta_banco");
    expect(CHAVES_PAYLOAD_CONVITE[i + 1]).toBe("conta_titular");
  });

  it("o rascunho vazio tem conta_bic vazio", () => {
    expect(RASCUNHO_CONVITE_VAZIO.conta_bic).toBe("");
  });

  it("normaliza espacos e maiusculas", () => {
    const payload = construirPayloadConvite({ ...RASCUNHO_CONVITE_VAZIO, conta_bic: " cgdi ptpl " });
    expect(payload.conta_swift).toBe("CGDIPTPL");
  });

  it("em branco vai como null, com a chave presente", () => {
    for (const conta_bic of ["", "   "]) {
      const payload = construirPayloadConvite({ ...RASCUNHO_CONVITE_VAZIO, conta_bic });
      expect(Object.prototype.hasOwnProperty.call(payload, "conta_swift")).toBe(true);
      expect(payload.conta_swift).toBeNull();
    }
  });

  it("o BIC viaja mesmo sem IBAN", () => {
    const payload = construirPayloadConvite({
      ...RASCUNHO_CONVITE_VAZIO,
      conta_numero: "",
      conta_bic: "CGDIPTPLXXX",
    });
    expect(payload.iban).toBeNull();
    expect(payload.conta_swift).toBe("CGDIPTPLXXX");
  });
});
