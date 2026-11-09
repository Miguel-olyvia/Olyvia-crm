import { appendFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AMBAR_ACABAMENTOS, AMBAR_SPECS, LODY_ACABAMENTOS, LODY_SPECS, VELAR_SPECS, construirLavaLoica, modelosDeLavaLoica } from "./lavaLoicas";
import { caixaEnvolvente, contarTriangulos } from "./util";

const LIMITE_TRIANGULOS = 150_000, LIMITE_MS = 300;
const registo = (linha: string) => { if (process.env.BENCH_FILE) appendFileSync(process.env.BENCH_FILE, linha + "\n"); };
const acabamentoDe = (id: string): string => (id.startsWith("lody") ? "oro" : id.startsWith("ambar") ? "negro" : "inox");

describe("lava-loiças portadas do HTML (sem WebGL)", () => {
  it("todos os modelos portados estão registados: 5 Velar, 3 Lody, 12 Ambar", () => {
    expect(modelosDeLavaLoica()).toHaveLength(5 + 3 + 12);
  });
  for (const id of modelosDeLavaLoica()) {
    it(`${id}: grupo com malhas, caixa em mm igual ao exterior do catálogo, triângulos e tempo dentro do limite`, () => {
      const t0 = performance.now(), l = construirLavaLoica(id, acabamentoDe(id)), ms = performance.now() - t0;
      const caixa = caixaEnvolvente(l.grupo), tris = contarTriangulos(l.grupo);
      const spec = [...VELAR_SPECS, ...LODY_SPECS, ...AMBAR_SPECS].find((s) => s.id === id)!;
      const larg = spec.outerWidth, prof = "outerDepth" in spec ? spec.outerDepth : 440;
      registo(`${id}: ${tris} triângulos, ${Math.round(ms)} ms, exterior ${(caixa.max.x - caixa.min.x).toFixed(0)}×${(caixa.max.z - caixa.min.z).toFixed(0)} mm`);
      let malhas = 0; l.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas++; });
      expect(malhas).toBeGreaterThan(6);
      expect(caixa.max.x - caixa.min.x).toBeGreaterThan(larg - 1);
      expect(caixa.max.x - caixa.min.x).toBeLessThan(larg + 1);
      expect(caixa.max.z - caixa.min.z).toBeGreaterThan(prof - 1);
      expect(caixa.max.z - caixa.min.z).toBeLessThan(prof + 1);
      expect(caixa.max.y).toBeCloseTo(0, 3); // o topo do rebordo é y = 0
      expect(caixa.min.y).toBeLessThan(-190); // a cuba desce (200 mm) e a válvula um pouco mais
      expect(tris).toBeLessThan(LIMITE_TRIANGULOS);
      expect(ms).toBeLessThan(LIMITE_MS * 6);
    });
  }
  it("Lody: cada acabamento PVD muda a cor da cuba e da válvula (valores exactos do HTML)", () => {
    for (const [a, f] of Object.entries(LODY_ACABAMENTOS)) {
      const l = construirLavaLoica("lody50", a), [corpo, valvula] = l.materiais as THREE.MeshPhysicalMaterial[];
      expect(corpo.color.getHexString()).toBe(new THREE.Color(f.color).getHexString());
      expect(valvula.color.getHexString()).toBe(new THREE.Color(f.trim).getHexString());
      expect(corpo.metalness).toBe(1);
    }
  });
  it("Ambar: Midnight, Concrete e Ice dão materiais mate diferentes; a tampa dos ralos retira-se", () => {
    const cores = new Set<string>();
    for (const [a, f] of Object.entries(AMBAR_ACABAMENTOS)) {
      const l = construirLavaLoica("ambar100", a), corpo = l.materiais[0] as THREE.MeshPhysicalMaterial;
      cores.add(corpo.color.getHexString());
      expect(corpo.metalness).toBe(0);
      expect(corpo.color.getHexString()).toBe(new THREE.Color(f.color).getHexString());
    }
    expect(cores.size).toBe(3);
    const com = construirLavaLoica("ambar100", "negro"), sem = construirLavaLoica("ambar100", "negro", { tampas: true });
    expect(com.tampas).toHaveLength(2);
    expect(com.tampas.every((t) => t.visible)).toBe(true);
    expect(sem.tampas.every((t) => !t.visible)).toBe(true);
  });
  it("as cubas ficam onde o catálogo diz (posição da cuba da Ambar 86 com escorredor)", () => {
    const l = construirLavaLoica("ambar86", "negro");
    const cuba = l.grupo.children.find((c) => c.name === "Ambar · cuba 1")!;
    expect(cuba.position.x).toBeCloseTo(-860 / 2 + 37 + 452 / 2, 5);
    expect(cuba.position.z).toBeCloseTo(-500 / 2 + 60.6 + 380 / 2, 5);
  });
  it("um modelo desconhecido dá erro claro", () => {
    expect(() => construirLavaLoica("nada", "inox")).toThrow(/desconhecido/);
  });
});
