// O passo seguinte de um negócio de fecho «proposta»: os contratos são ignorados, por isso uma proposta aceite não pede contrato e um contrato
// assinado nunca pede o ganho. Com fecho «contrato» (ou sem tipo, como no exemplo) tudo fica como estava.
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { contratoAssinadoPronto, passoDoNegocio, propostaAceiteSemContrato } from "./etapaPessoa";

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "n1", pessoaId: "p", pessoa: "Ana", servico: "Cozinha", comercial: "Rui", dias: 1, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [{ id: "o", valor: 10, escolhido: true }], estadoReal: "aberto",
  proposta: { estado: "aceite" }, contrato: null, ...extra,
});

describe("propostaAceiteSemContrato", () => {
  it("com fecho «contrato» uma proposta aceite sem contrato pede o contrato", () => {
    expect(propostaAceiteSemContrato(negocio({ fecho: "contrato" }))).toBe(true);
    expect(passoDoNegocio(negocio({ fecho: "contrato" }))).toBe("criarContrato");
  });

  it("sem tipo (a base ainda sem ele, ou o exemplo com estadoReal) fica como estava", () => {
    expect(propostaAceiteSemContrato(negocio())).toBe(true);
  });

  it("com fecho «proposta» não pede contrato", () => {
    expect(propostaAceiteSemContrato(negocio({ fecho: "proposta" }))).toBe(false);
    expect(passoDoNegocio(negocio({ fecho: "proposta" }))).not.toBe("criarContrato");
  });
});

describe("contratoAssinadoPronto", () => {
  const assinado = { contrato: { estado: "assinado" as const }, prontoAGanhar: true };

  it("com fecho «contrato» o contrato assinado e pronto pede o ganho", () => {
    expect(contratoAssinadoPronto(negocio({ fecho: "contrato", ...assinado }))).toBe(true);
    expect(passoDoNegocio(negocio({ fecho: "contrato", ...assinado }))).toBe("ganharNegocio");
  });

  it("com fecho «proposta» o contrato (ignorado) nunca pede o ganho", () => {
    expect(contratoAssinadoPronto(negocio({ fecho: "proposta", ...assinado }))).toBe(false);
    expect(passoDoNegocio(negocio({ fecho: "proposta", ...assinado }))).not.toBe("ganharNegocio");
  });
});
