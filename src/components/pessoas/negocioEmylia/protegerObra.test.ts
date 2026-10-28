import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { podeMontarObra, proximoSeguro, temPlanoDaObra } from "./protegerObra";

function negocio(fase: number): Negocio {
  const base = structuredClone(seed().deals[0]);
  return { ...base, fase, perdido: false, obra: { plano: null, mats: null, real: null, aprendido: false } };
}

describe("protegerObra", () => {
  it("na Obra sem plano não se monta a obra e proximo() não rebenta", () => {
    const d = negocio(5);
    const S = seed();
    expect(temPlanoDaObra(d)).toBe(false);
    expect(podeMontarObra(d)).toBe(false);
    const p = proximoSeguro(d, S);
    expect(p.wait).toBe(true);
    expect(p.t).toMatch(/sem plano|não tem plano/i);
    // diz a verdade sobre as Operações: as funções existem, só não estão ligadas a este ecrã
    expect(p.sub).toMatch(/existem na base/);
    expect(p.sub).not.toMatch(/não existe/i);
  });

  it("o motor a seco rebenta sem plano (a razão da guarda)", async () => {
    const { proximo } = await import("@/emylia/motor");
    expect(() => proximo(negocio(5), seed())).toThrow();
  });

  it("fora da Obra não olha para o plano", () => {
    const d = negocio(4);
    expect(podeMontarObra(d)).toBe(false);
    expect(() => proximoSeguro(d, seed())).not.toThrow();
  });

  it("com plano na Obra pode montar", () => {
    const d = negocio(5);
    d.obra.plano = { estado: "por aprovar", tasks: [], dia: 0, origem: "orcamento" } as unknown as NonNullable<Negocio["obra"]["plano"]>;
    expect(podeMontarObra(d)).toBe(true);
  });
});
