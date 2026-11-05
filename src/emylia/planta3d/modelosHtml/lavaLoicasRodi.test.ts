import { appendFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { construirLavaLoica, ehModeloLavaLoica, modelosDeLavaLoica } from "./index";
import { CUBAS_SPECS, KERAN_SPECS, UNA_SPECS, construirRodi, modelosRodi } from "./lavaLoicasRodi";
import { caixaEnvolvente, contarTriangulos } from "./util";

const LIMITE_TRIANGULOS = 150_000, LIMITE_MS = 300;
const registo = (linha: string) => { if (process.env.BENCH_FILE) appendFileSync(process.env.BENCH_FILE, linha + "\n"); };
const dimensoes = (id: string): [number, number, number] => {
  const k = KERAN_SPECS.find((s) => s.id === id); if (k) return [k.outerWidth, 500, 160];
  const u = UNA_SPECS.find((s) => s.id === id); if (u) return [u.outerWidth, 440, 200];
  const c = CUBAS_SPECS.find((s) => s.id === id)!; return [c.outerWidth, c.outerDepth, 200];
};

describe("lava-loiças RODI portadas do HTML (sem WebGL)", () => {
  it("12 modelos RODI portados (4 Keran, 2 UNA, 6 Cubas) e o registo geral tem os 32 do catálogo", () => {
    expect(modelosRodi()).toHaveLength(12);
    expect(modelosDeLavaLoica()).toHaveLength(32);
    expect(ehModeloLavaLoica("keran100")).toBe(true);
    expect(ehModeloLavaLoica("nada")).toBe(false);
  });
  for (const id of modelosRodi()) {
    it(`${id}: caixa em mm igual ao exterior do catálogo, cuba para baixo, triângulos e tempo dentro do limite`, () => {
      const t0 = performance.now(), r = construirRodi(id), ms = performance.now() - t0, caixa = caixaEnvolvente(r.grupo), tris = contarTriangulos(r.grupo), [w, d, fundo] = dimensoes(id);
      registo(`${id}: ${tris} triângulos, ${Math.round(ms)} ms, exterior ${(caixa.max.x - caixa.min.x).toFixed(0)}×${(caixa.max.z - caixa.min.z).toFixed(0)} mm`);
      let malhas = 0; r.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas++; });
      expect(malhas).toBeGreaterThan(6);
      expect(caixa.max.x - caixa.min.x).toBeGreaterThan(w - 1.5);
      expect(caixa.max.x - caixa.min.x).toBeLessThan(w + 1.5);
      expect(caixa.max.z - caixa.min.z).toBeGreaterThan(d - 1.5);
      expect(caixa.max.z - caixa.min.z).toBeLessThan(d + 1.5);
      expect(caixa.max.y).toBeLessThanOrEqual(0.1);
      expect(caixa.max.y).toBeGreaterThan(-5);
      expect(caixa.min.y).toBeLessThan(-fundo + 5);
      expect(tris).toBeLessThan(LIMITE_TRIANGULOS);
      expect(ms).toBeLessThan(LIMITE_MS * 6);
    });
  }
  it("Keran: o escorredor reverso roda o lava-loiça 180°; as outras não rodam", () => {
    expect(construirRodi("keran100", { reverso: true }).grupo.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(construirRodi("keran100").grupo.rotation.y).toBe(0);
    expect(construirRodi("una55", { reverso: true }).grupo.rotation.y).toBe(0);
  });
  it("Keran tem 5 canais no escorredor e UNA e Cubas têm as cubas do catálogo", () => {
    const k = construirRodi("keran80").grupo;
    expect(k.children.filter((c) => /^Keran · canal \d$/.test(c.name))).toHaveLength(5);
    expect(construirRodi("una55").grupo.children.filter((c) => c.name.startsWith("UNA · cuba"))).toHaveLength(2);
    expect(construirRodi("duo60").grupo.children.filter((c) => c.name.startsWith("Cubas RODI · cuba"))).toHaveLength(2);
  });
  it("o registo geral constrói qualquer lava-loiça portada e passa a opção reverso", () => {
    expect(construirLavaLoica("keran86", "inox", { reverso: true }).grupo.rotation.y).toBeCloseTo(Math.PI, 5);
    expect(construirLavaLoica("velar50", "inox").grupo.name).toMatch(/Velar 50/);
    expect(() => construirLavaLoica("nada", "inox")).toThrow(/desconhecido/);
  });
});
