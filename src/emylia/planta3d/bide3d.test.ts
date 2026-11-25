// O bidé genérico (categoria `bide`): parece um bidé (taça oval comprida e baixa, com aro, assente num pedestal estreito, a torneira no
// rebordo do fundo) e o suspenso é a mesma taça sem pedestal, presa à parede por uma placa. Montado a sério com o GLB que já existe
// (as partes novas constroem-se em tempo de execução, o GLB não muda).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { describe, expect, it } from "vitest";
import { categoriaPorId, opcoesComOmissao, urlDoGenerico, type CategoriaGlb, type ParamsGenerico } from "./categoriasGlb";
import { montarGenerico } from "./modelosHtml/glb";

const cat = (): CategoriaGlb => {
  const c = categoriaPorId("bide");
  if (!c) throw new Error("falta a categoria bide");
  return c;
};
async function carregar(): Promise<THREE.Group> {
  const b = readFileSync(join(process.cwd(), "public", urlDoGenerico("bide"))), buf = new ArrayBuffer(b.byteLength);
  new Uint8Array(buf).set(b);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return (await l.parseAsync(buf, "")).scene;
}
/** As partes da torneira (o corpo, a bica, o manípulo): só estas passam do aro para cima. */
const DA_TORNEIRA = /^(torneira|bica|manipulo|roseta)/;
const MEDIDAS: [number, number, number][] = [[0.36, 0.55, 0.4], [0.37, 0.58, 0.43], [0.35, 0.52, 0.4]];
const TOL = 0.02;

interface Medido { nome: string; caixa: THREE.Box3 }
async function montar(o: Record<string, string | boolean>, [w, d, h] = MEDIDAS[0]): Promise<{ partes: Medido[]; todas: THREE.Box3; livre: () => void }> {
  const c = cat(), cena = await carregar();
  const m = montarGenerico(cena, c, { w, d, h, o: opcoesComOmissao(c, "bide", o) }, "#cccccc");
  m.grupo.updateMatrixWorld(true);
  const partes: Medido[] = [];
  // uma malha só se vê se ela e todos os pais até ao grupo estiverem visíveis (o nó da parte pode ser um grupo com a malha lá dentro)
  const vista = (x: THREE.Object3D): boolean => { for (let n: THREE.Object3D | null = x; n; n = n.parent) { if (!n.visible) return false; if (n === m.grupo) break; } return true; };
  const nomeDaParte = (x: THREE.Object3D): string => { for (let n: THREE.Object3D | null = x; n; n = n.parent) { if (c.partes.some((p) => p.nome === n?.name)) return n.name; } return x.name; };
  m.grupo.traverse((x) => { if ((x as THREE.Mesh).isMesh && vista(x)) partes.push({ nome: nomeDaParte(x), caixa: new THREE.Box3().setFromObject(x) }); });
  const todas = new THREE.Box3();
  for (const p of partes) todas.union(p.caixa);
  return { partes, todas, livre: m.libertar };
}
const combinacoes = (): Record<string, boolean>[] => [true, false].flatMap((torneira) => [true, false].map((suspenso) => ({ torneira, suspenso })));

describe("bidé genérico: o desenho", () => {
  it("as opções e as omissões não mudaram (as peças já gravadas guardam só estas)", () => {
    const c = cat();
    expect(c.opcoes.map((x) => x.id)).toEqual(["torneira", "suspenso"]);
    expect(opcoesComOmissao(c, "bide", {}, "Bidé ELEGANT")).toEqual({ torneira: true, suspenso: false });
    expect(opcoesComOmissao(c, "bide", {}, "Bidé ELEGANT SUSPENSO")).toEqual({ torneira: true, suspenso: true });
  });

  it("as partes: as 4 do GLB continuam, e tudo o que o GLB não tem é construído em tempo de execução", async () => {
    const c = cat(), cena = await carregar();
    for (const n of ["pe", "cuvete", "interior", "torneira"]) expect(c.partes.some((p) => p.nome === n), n).toBe(true);
    for (const p of c.partes) {
      const noGlb = cena.getObjectByName(p.nome) !== undefined;
      expect(noGlb || p.emRuntime === true, `${p.nome} nem está no GLB nem é emRuntime`).toBe(true);
    }
    expect(new Set(c.partes.map((p) => p.nome)).size).toBe(c.partes.length);
  });

  it("nenhuma parte com escala 0, negativa ou NaN, em nenhuma combinação nem medida", () => {
    const c = cat();
    for (const [w, d, h] of MEDIDAS) for (const o of combinacoes()) {
      const p: ParamsGenerico = { w, d, h, o };
      for (const parte of c.partes) {
        const k = parte.colocar(p);
        for (const v of [...k.pos, ...k.esc, ...(k.rot ?? [])]) expect(Number.isFinite(v), `${parte.nome} ${JSON.stringify(o)}`).toBe(true);
        for (const e of k.esc) expect(e, `${parte.nome} ${JSON.stringify(o)}`).toBeGreaterThan(0);
      }
    }
  });

  it("todas as partes cabem na caixa w×d×h (a torneira sai só para cima, abaixo de h + 0,20 m)", async () => {
    for (const med of MEDIDAS) for (const o of combinacoes()) {
      const [w, d, h] = med, { partes, livre } = await montar(o, med);
      for (const { nome, caixa } of partes) {
        const msg = `${nome} ${JSON.stringify(o)} ${med.join("x")}`;
        expect(caixa.min.x, msg).toBeGreaterThanOrEqual(-w / 2 - TOL);
        expect(caixa.max.x, msg).toBeLessThanOrEqual(w / 2 + TOL);
        expect(caixa.min.z, msg).toBeGreaterThanOrEqual(-d / 2 - TOL);
        expect(caixa.max.z, msg).toBeLessThanOrEqual(d / 2 + TOL);
        expect(caixa.min.y, msg).toBeGreaterThanOrEqual(-TOL);
        expect(caixa.max.y, msg).toBeLessThanOrEqual(DA_TORNEIRA.test(nome) ? h + 0.2 : h + TOL);
      }
      livre();
    }
  });

  it("a taça é oval e comprida: mais funda (profundidade) do que larga, baixa, com aro e bacia", async () => {
    const [w, d, h] = MEDIDAS[0], { partes, todas, livre } = await montar({ torneira: true, suspenso: false });
    const aro = partes.find((p) => p.nome === "aro")?.caixa, cuvete = partes.find((p) => p.nome === "cuvete")?.caixa;
    expect(aro).toBeDefined(); expect(cuvete).toBeDefined();
    if (!aro || !cuvete) return;
    const dim = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
    expect(dim(aro).z / dim(aro).x).toBeGreaterThan(1.3);
    expect(dim(cuvete).z / dim(cuvete).x).toBeGreaterThan(1.3);
    // o aro é o topo da louça: à altura do assento (h) e fino, e a bacia (a água) fica dentro dele
    expect(aro.max.y).toBeCloseTo(h, 2);
    expect(dim(aro).y).toBeLessThanOrEqual(0.07);
    const bacia = partes.find((p) => p.nome === "bacia")?.caixa;
    expect(bacia).toBeDefined();
    if (bacia) { expect(bacia.min.x).toBeGreaterThan(aro.min.x); expect(bacia.max.x).toBeLessThan(aro.max.x); expect(bacia.min.z).toBeGreaterThan(aro.min.z); expect(bacia.max.z).toBeLessThan(aro.max.z); }
    // o conjunto não é mais alto do que o bidé mais a torneira, e toca no chão
    expect(todas.min.y).toBeCloseTo(0, 2);
    expect(todas.max.x - todas.min.x).toBeLessThanOrEqual(w + TOL * 2);
    expect(todas.max.z - todas.min.z).toBeGreaterThan(todas.max.x - todas.min.x);
    livre();
  });

  it("o pedestal estreita-se para o chão e é bem mais estreito do que a taça (não é um tronco)", async () => {
    const { partes, livre } = await montar({ torneira: true, suspenso: false });
    const pe = partes.find((p) => p.nome === "pe")?.caixa, aro = partes.find((p) => p.nome === "aro")?.caixa, alto = partes.find((p) => p.nome === "pe_alto")?.caixa;
    expect(pe && aro && alto).toBeTruthy();
    if (!pe || !aro || !alto) return;
    const lar = (b: THREE.Box3) => b.max.x - b.min.x;
    expect(pe.min.y).toBeCloseTo(0, 2);
    expect(lar(pe)).toBeLessThan(lar(aro) * 0.55);
    expect(lar(alto)).toBeGreaterThan(lar(pe));
    livre();
  });

  it("a torneira (corpo, bica curta, manípulo) está no rebordo do fundo, sem tubo altíssimo", async () => {
    const { partes, livre } = await montar({ torneira: true, suspenso: false });
    const aroCx = partes.find((p) => p.nome === "aro")?.caixa;
    const t = partes.filter((p) => DA_TORNEIRA.test(p.nome));
    for (const n of ["torneira", "bica", "manipulo"]) expect(t.some((p) => p.nome === n), n).toBe(true);
    for (const { nome, caixa } of t) {
      expect(caixa.max.y, nome).toBeLessThan(0.4 + 0.2);
      // a torneira assenta no aro: nenhuma parte sua é mais alta do que 12 cm acima dele
      expect(caixa.max.y, nome).toBeLessThanOrEqual(0.4 + 0.12 + 0.001);
      // e fica na metade de trás
      expect(caixa.min.z, nome).toBeLessThan(0);
    }
    const corpo = t.find((p) => p.nome === "torneira")?.caixa;
    if (corpo) { expect(corpo.max.y - corpo.min.y).toBeGreaterThanOrEqual(0.05); expect(corpo.max.y - corpo.min.y).toBeLessThanOrEqual(0.09); expect(corpo.getCenter(new THREE.Vector3()).z).toBeLessThan((aroCx?.min.z ?? 0) * 0.5); }
    const bica = t.find((p) => p.nome === "bica")?.caixa;
    if (bica) expect(bica.max.z - bica.min.z).toBeLessThanOrEqual(0.14);
    // dois pequenos botões no rebordo
    expect(partes.filter((p) => /^botao_/.test(p.nome))).toHaveLength(2);
    livre();
  });

  it("sem torneira, não há nada acima do aro", async () => {
    const { partes, todas, livre } = await montar({ torneira: false, suspenso: false });
    expect(partes.some((p) => DA_TORNEIRA.test(p.nome))).toBe(false);
    expect(todas.max.y).toBeLessThanOrEqual(0.4 + TOL);
    livre();
  });

  it("suspenso: a mesma taça, sem pedestal, a 25 cm ou mais do chão, e a placa de fixação atrás", async () => {
    for (const med of MEDIDAS) {
      const { partes, todas, livre } = await montar({ torneira: true, suspenso: true }, med);
      expect(partes.some((p) => p.nome === "pe" || p.nome === "pe_alto"), "pedestal").toBe(false);
      expect(todas.min.y).toBeGreaterThanOrEqual(0.25 - 0.005);
      const placa = partes.find((p) => p.nome === "fixacao")?.caixa;
      expect(placa).toBeDefined();
      if (placa) expect(placa.min.z).toBeLessThanOrEqual(-med[1] / 2 + 0.03);
      expect(partes.some((p) => p.nome === "aro")).toBe(true);
      livre();
    }
  });

  it("de chão não leva placa de fixação", async () => {
    const { partes, livre } = await montar({ torneira: true, suspenso: false });
    expect(partes.some((p) => p.nome === "fixacao")).toBe(false);
    livre();
  });
});
