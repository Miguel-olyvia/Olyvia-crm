// O tipo de fecho na ficha adaptada: lê-se de `fecho` quando a ficha o traz, um valor desconhecido não conta, e num negócio de fecho «proposta» os
// contratos ligados ficam de fora (a base ignora-os, o ecrã também).
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { adaptarNegocios } from "./adaptarNegociosFicha";
import { fichaDb, negocioDb } from "./fichaFabrica";
import type { ContratoDb, NegocioFichaDb } from "./fichaTipos";

const contrato: ContratoDb = { id: "k1", numero: "C-1", status: "signed", valor: 100, assinado_em: "2026-10-12T09:00:00Z", criado_em: "2026-10-12T09:00:00Z", tem_base: true };
const adaptar = (n: NegocioFichaDb) => adaptarNegocios(fichaDb({ negocios: { total: 1, itens: [n] } }), "2026-10-19")[0] as NegocioMes;

describe("adaptarNegocios: fecho", () => {
  it("lê o tipo quando a ficha o traz", () => {
    expect(adaptar(negocioDb({ fecho: "proposta" })).fecho).toBe("proposta");
    expect(adaptar(negocioDb({ fecho: "contrato" })).fecho).toBe("contrato");
  });

  it("sem o campo, ou com um valor desconhecido, não inventa nenhum tipo", () => {
    expect(adaptar(negocioDb()).fecho).toBeUndefined();
    expect(adaptar(negocioDb({ fecho: "xpto" })).fecho).toBeUndefined();
    expect(adaptar(negocioDb({ fecho: null })).fecho).toBeUndefined();
  });

  it("fecho «contrato»: o contrato ligado conta", () => {
    expect(adaptar(negocioDb({ fecho: "contrato", contratos: [contrato] })).contrato).toEqual({ estado: "assinado" });
  });

  it("fecho «proposta»: o contrato ligado é ignorado", () => {
    expect(adaptar(negocioDb({ fecho: "proposta", contratos: [contrato] })).contrato).toBeNull();
  });
});
