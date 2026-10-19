// Quando se oferece «Dar como ganho». A fonte de verdade é o `prontoAGanhar` que a base calcula por negócio; sem ele vale a regra da
// organização (manual, proposta aceite, contrato assinado). A interface oferece; quem decide é a base (NG006).
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negocioBase } from "./fabricaTestes";
import { podeGanhar } from "./podeGanhar";

const aberto = (extra: Partial<NegocioMes> = {}): NegocioMes => negocioBase("n1", { estadoReal: "aberto", ...extra });

describe("podeGanhar: negócios que não estão abertos", () => {
  it.each(["ganho", "perdido"] as const)("um negócio %s não se ganha", (estadoReal) => {
    expect(podeGanhar(negocioBase("n1", { estadoReal }), "manual")).toEqual({ pode: false, motivo: "naoAberto" });
  });

  it("um negócio sem estado da base (o exemplo) não se ganha por aqui", () => {
    expect(podeGanhar(negocioBase("n1"), "manual")).toEqual({ pode: false, motivo: "naoAberto" });
  });
});

describe("podeGanhar: a regra da organização, sem prontoAGanhar", () => {
  it("manual: um negócio aberto pode ganhar", () => {
    expect(podeGanhar(aberto(), "manual")).toEqual({ pode: true, motivo: null });
  });

  it("proposta_aceite: só com a proposta aceite", () => {
    expect(podeGanhar(aberto({ proposta: { estado: "aceite" } }), "proposta_aceite").pode).toBe(true);
    expect(podeGanhar(aberto({ proposta: { estado: "enviada" } }), "proposta_aceite")).toEqual({ pode: false, motivo: "semProposta" });
    expect(podeGanhar(aberto(), "proposta_aceite")).toEqual({ pode: false, motivo: "semProposta" });
  });

  it("contrato_assinado: só com o contrato assinado", () => {
    expect(podeGanhar(aberto({ contrato: { estado: "assinado" } }), "contrato_assinado").pode).toBe(true);
    expect(podeGanhar(aberto({ contrato: { estado: "pendente" } }), "contrato_assinado")).toEqual({ pode: false, motivo: "semContrato" });
    expect(podeGanhar(aberto(), "contrato_assinado")).toEqual({ pode: false, motivo: "semContrato" });
  });

  it("sem regra conhecida (a configuração não veio), não se oferece", () => {
    expect(podeGanhar(aberto(), null)).toEqual({ pode: false, motivo: "semRegra" });
  });
});

describe("podeGanhar: o prontoAGanhar da base manda", () => {
  it("pronto: pode, mesmo que a regra local dissesse que não", () => {
    expect(podeGanhar(aberto({ prontoAGanhar: true }), "contrato_assinado")).toEqual({ pode: true, motivo: null });
  });

  it("não pronto: não pode, mesmo que a regra local dissesse que sim, e o motivo é o da regra da organização", () => {
    expect(podeGanhar(aberto({ prontoAGanhar: false, proposta: { estado: "aceite" } }), "proposta_aceite")).toEqual({ pode: false, motivo: "semProposta" });
    expect(podeGanhar(aberto({ prontoAGanhar: false, contrato: { estado: "assinado" } }), "contrato_assinado")).toEqual({ pode: false, motivo: "semContrato" });
    expect(podeGanhar(aberto({ prontoAGanhar: false }), "manual")).toEqual({ pode: false, motivo: "semRegra" });
  });
});
