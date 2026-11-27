// 27/11 (Rúben, obra Schroeder): «a obra sem técnicos, determinam isso depois» e «desbloquear a obrigatoriedade de materiais antes de arrancar».
import { describe, expect, it } from "vitest";
import { arrancarSemMateriais, faltaParaArrancar, tecnicosDepois } from "./preparacaoObra";
import type { Negocio } from "./motor";

const neg = (f: Record<string, string>, extra: Partial<Negocio> = {}) => ({ f, fin: { pago: true }, obra: { plano: { tasks: [], estado: "aprovado", dia: 0 }, ec: { ref: "EC-1" } }, ...extra }) as unknown as Negocio;

describe("técnicos depois e arranque com materiais por receber", () => {
  it("lê as duas opções do negócio", () => {
    expect(tecnicosDepois(neg({ tecnicos_depois: "Sim" }))).toBe(true);
    expect(tecnicosDepois(neg({}))).toBe(false);
    expect(arrancarSemMateriais(neg({ arrancar_sem_materiais: "Sim" }))).toBe(true);
    expect(arrancarSemMateriais(neg({}))).toBe(false);
  });
  it("com «arrancar com materiais por receber», os materiais não seguram o arranque", () => {
    const F = faltaParaArrancar(neg({ arrancar_sem_materiais: "Sim" }), null, null);
    expect(F.some((x) => /materia|encomendar|receber .* unidade/i.test(x))).toBe(false);
  });
});
