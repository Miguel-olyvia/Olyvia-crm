import { appendFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HOB_SPECS, construirPlaca, modelosDePlaca } from "./placas";
import { caixaEnvolvente, contarTriangulos } from "./util";

const LIMITE_TRIANGULOS = 150_000, LIMITE_MS = 300;
const registo = (linha: string) => { if (process.env.BENCH_FILE) appendFileSync(process.env.BENCH_FILE, linha + "\n"); };

describe("placas portadas do HTML (sem WebGL)", () => {
  it("as 8 placas do catálogo estão portadas: 2 de indução, 2 radiantes, 4 a gás", () => {
    expect(modelosDePlaca()).toHaveLength(8);
    expect(HOB_SPECS.filter((s) => s.kind === "gas")).toHaveLength(4);
  });
  for (const s of HOB_SPECS) {
    it(`${s.id}: caixa em mm coerente com o exterior, o corpo abaixo da bancada e a altura acima dela; triângulos e tempo dentro do limite`, () => {
      const t0 = performance.now(), p = construirPlaca(s.id, s.glass ? "negro" : s.kind === "gas" ? "inox" : "negro"), ms = performance.now() - t0;
      const caixa = caixaEnvolvente(p.grupo), tris = contarTriangulos(p.grupo);
      registo(`${s.id}: ${tris} triângulos, ${Math.round(ms)} ms, exterior ${(caixa.max.x - caixa.min.x).toFixed(0)}×${(caixa.max.z - caixa.min.z).toFixed(0)} mm, acima ${caixa.max.y.toFixed(0)} mm`);
      let malhas = 0; p.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas++; });
      expect(malhas).toBeGreaterThan(8);
      // as grelhas e os queimadores a gás podem sair do bordo (a ficha dá a projecção máxima acima da bancada); o vidro não
      const largura = caixa.max.x - caixa.min.x;
      expect(largura).toBeGreaterThanOrEqual(s.outerWidth - 1);
      expect(largura).toBeLessThan(s.outerWidth + 40);
      expect(caixa.max.z - caixa.min.z).toBeGreaterThanOrEqual(s.outerDepth - 1);
      expect(caixa.min.y).toBeLessThan(-s.under + 1);
      expect(caixa.min.y).toBeGreaterThan(-s.under - 2);
      expect(caixa.max.y).toBeGreaterThanOrEqual(s.plate - 0.01);
      if (s.kind === "gas") expect(caixa.max.y).toBeGreaterThan((s.above ?? 0) - 1);
      if (s.kind !== "gas") expect(caixa.max.y).toBeLessThan(s.plate + 0.1);
      expect(tris).toBeLessThan(LIMITE_TRIANGULOS);
      expect(ms).toBeLessThan(LIMITE_MS * 6);
    });
  }
  it("a ING 61T de vidro muda de preto para branco; as outras não têm variante de vidro", () => {
    const preto = construirPlaca("ing61t", "negro"), branco = construirPlaca("ing61t", "blanco");
    const vidro = (p: ReturnType<typeof construirPlaca>) => p.materiais.find((m) => (m as THREE.MeshPhysicalMaterial).clearcoat === 0.75) as THREE.MeshPhysicalMaterial;
    expect(vidro(preto).color.getHexString()).toBe("080b0d");
    expect(vidro(branco).color.getHexString()).toBe("f0f2f2");
  });
  it("a de 90 cm tem 5 queimadores e 5 manípulos", () => {
    const p = construirPlaca("gmwl958", "inox");
    expect(p.grupo.children.filter((c) => c.name.startsWith("Queimador"))).toHaveLength(5);
    expect(p.grupo.children.filter((c) => c.name.startsWith("Comando"))).toHaveLength(5);
  });
  it("um modelo desconhecido dá erro claro", () => {
    expect(() => construirPlaca("nada", "negro")).toThrow(/desconhecido/);
  });
});
