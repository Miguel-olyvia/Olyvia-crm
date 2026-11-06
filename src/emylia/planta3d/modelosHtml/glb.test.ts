// Os GLB pré-gerados (scripts/gerar-modelos-glb.mjs) existem para todos os modelos do HTML e as malhas pedem materiais que o acabamento tem.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { modelosDeTorneira } from "./torneiras";
import { modelosDeLavaLoica } from "./index";
import { modelosDePlaca } from "./placas";
import { montarModelo, urlDoModeloHtml, vestir } from "./glb";

const PUBLICO = join(process.cwd(), "public");
const todos = [...modelosDeTorneira().map((m) => ["torneira", m] as const), ...modelosDeLavaLoica().map((m) => ["lava_loica", m] as const), ...modelosDePlaca().map((m) => ["placa", m] as const)];

describe("GLB dos modelos do HTML", () => {
  it("há um GLB por modelo (7 torneiras, 32 lava-loiças, 8 placas) e o relatório bate certo", () => {
    expect(todos).toHaveLength(47);
    for (const [f, m] of todos) expect(existsSync(join(PUBLICO, urlDoModeloHtml(f, m))), `${f}-${m}`).toBe(true);
    const rel = JSON.parse(readFileSync(join(PUBLICO, "modelos3d", "modelos.json"), "utf8")) as { url: string; triangulos: number; triangulosOriginais: number }[];
    expect(rel).toHaveLength(47);
    for (const r of rel) expect(r.triangulos).toBeLessThan(r.triangulosOriginais);
  });

  it("veste as malhas pelo nome do material e falha se faltar um", () => {
    const cena = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry());
    m.name = "metal_1"; m.userData.material = "metal"; cena.add(m);
    const metal = new THREE.MeshStandardMaterial(), vestida = vestir(cena, { metal });
    expect((vestida.children[0] as THREE.Mesh).material).toBe(metal);
    expect((vestida.children[0] as THREE.Mesh).geometry).toBe(m.geometry); // a geometria fica partilhada
    expect(() => vestir(cena, {})).toThrow(/metal/);
  });

  it("liga as opções aos nós: bica rodada, tampas escondidas, Keran invertida", () => {
    const folha = (nome: string) => { const x = new THREE.Mesh(new THREE.BoxGeometry()); x.userData.material = nome; return x; };
    const t = new THREE.Group(), bica = new THREE.Group(); bica.name = "bica"; bica.add(folha("metal")); t.add(folha("metal"), bica);
    const mt = montarModelo("torneira", t, "round", "chrome", { bica: 90 });
    expect(mt.grupo.getObjectByName("bica")?.rotation.y).toBeCloseTo(Math.PI / 2);
    const l = new THREE.Group(), tampas = new THREE.Group(); tampas.name = "tampas"; tampas.add(folha("polido")); l.add(folha("chapa"), tampas);
    const k = montarModelo("lava_loica", l, "keran100", "", { tampas: true, reverso: true });
    expect(k.grupo.getObjectByName("tampas")?.visible).toBe(false);
    expect(k.grupo.rotation.y).toBeCloseTo(Math.PI);
    mt.libertar(); k.libertar();
  });
});
