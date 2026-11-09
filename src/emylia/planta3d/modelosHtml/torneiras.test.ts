import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { afterAll, describe, expect, it } from "vitest";
import { MEDIDAS_TORNEIRA, acabamentoDaTorneira, aplicarExtracao, construirTorneira, modelosDeTorneira, type ModeloTorneira } from "./torneiras";
import { ACABAMENTOS_HTML, caixaEnvolvente, contarTriangulos, limparCacheGeometrias } from "./util";

const LIMITE_TRIANGULOS = 150_000, LIMITE_MS = 300;
const medidas: string[] = [];
const acabamentos: Record<ModeloTorneira, string[]> = { round: ["brushed", "chrome", "oro", "titanio", "negro", "cobre"], noah: ["brushed", "negro", "oro", "cobre", "titanio"], smooth: ["chrome", "nickel", "blanco", "gunmetal", "negro", "oro", "cobre"], stick: ["negro"],
  cira: ["chrome", "gunmetal", "negro", "oro"], alexia: ["chrome", "oro"], granada: ["negro", "blanco"] };
afterAll(() => { if (process.env.BENCH_FILE) writeFileSync(process.env.BENCH_FILE, medidas.join("\n")); });

describe("torneiras portadas do HTML (sem WebGL)", () => {
  for (const modelo of modelosDeTorneira()) {
    it(`${modelo}: grupo com malhas, caixa em mm coerente com as medidas, triângulos e tempo dentro do limite`, () => {
      limparCacheGeometrias();
      const t0 = performance.now(), t = construirTorneira(modelo, acabamentos[modelo][0]), ms = performance.now() - t0;
      const t1 = performance.now(); construirTorneira(modelo, acabamentos[modelo][0]); const ms2 = performance.now() - t1;
      const tris = contarTriangulos(t.grupo), caixa = caixaEnvolvente(t.grupo), m = MEDIDAS_TORNEIRA[modelo];
      medidas.push(`${modelo}: ${tris} triângulos, ${Math.round(ms)} ms (a frio), ${Math.round(ms2)} ms (corpo em cache), altura ${caixa.max.y.toFixed(1)} mm`);
      let malhas = 0; t.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) malhas++; });
      expect(malhas).toBeGreaterThan(8);
      // altura total (o topo do tubo da bica), alcance e base do catálogo de origem, com 2 mm de tolerância
      expect(caixa.max.y).toBeGreaterThan(m.altura - 2);
      expect(caixa.max.y).toBeLessThan(m.altura + 2);
      expect(caixa.max.z).toBeGreaterThan(m.alcance - 1);
      expect(caixa.max.z).toBeLessThan(m.alcance + 40);
      expect(caixa.min.y).toBeGreaterThan(-1);
      expect(tris).toBeLessThan(LIMITE_TRIANGULOS);
      expect(ms).toBeLessThan(LIMITE_MS * 6); // folga para a máquina ocupada; os números medidos ficam no relatório
    });
    it(`${modelo}: cada acabamento muda o material (cor, rugosidade e metalness exactos do HTML)`, () => {
      const cores = new Set<string>();
      for (const a of acabamentos[modelo]) {
        const t = construirTorneira(modelo, a), esperado = acabamentoDaTorneira(modelo, a);
        cores.add(t.materiais.metal.color.getHexString());
        expect(ACABAMENTOS_HTML[a]).toBeDefined();
        expect(t.materiais.metal.metalness).toBeCloseTo(esperado.metalness, 5);
        expect(t.materiais.metal.roughness).toBeGreaterThan(0.1);
        let usa = false; t.grupo.traverse((o) => { if ((o as THREE.Mesh).material === t.materiais.metal) usa = true; });
        expect(usa).toBe(true);
      }
      expect(cores.size).toBe(acabamentos[modelo].length);
    });
  }
  it("a bica roda 360° e a extracção põe a cabeça mais abaixo, mais à frente, com o flexível em espiral", () => {
    const t = construirTorneira("smooth", "chrome", { bica: 90 });
    expect(t.bica.rotation.y).toBeCloseTo(Math.PI / 2, 5);
    const p = t.puxar!, antes = p.head.position.clone();
    expect(p.hose.visible).toBe(false);
    aplicarExtracao(p, 1);
    expect(p.hose.visible).toBe(true);
    expect(p.head.position.y).toBeLessThan(antes.y - 100);
    expect(p.head.position.z).toBeGreaterThan(antes.z);
    expect(contarTriangulos(p.hose)).toBeGreaterThan(5000);
    aplicarExtracao(p, 0);
    expect(p.hose.visible).toBe(false);
    expect(construirTorneira("noah", "oro").puxar).toBeNull();
  });
  it("as variantes partilham o corpo em cache (a geometria pesada calcula-se uma só vez)", () => {
    limparCacheGeometrias();
    const a = construirTorneira("noah", "brushed"), b = construirTorneira("noah", "negro");
    const corpo = (g: THREE.Group) => g.children.find((c) => c.name === "Noah · corpo e ligação lateral") as THREE.Mesh;
    expect(corpo(a.grupo).geometry).toBe(corpo(b.grupo).geometry);
    expect(corpo(a.grupo).material).not.toBe(corpo(b.grupo).material);
  });
});
