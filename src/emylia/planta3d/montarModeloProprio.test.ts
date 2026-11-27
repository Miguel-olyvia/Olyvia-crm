import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { glbDeTeste, type OpcoesGlbTeste } from "./__fixtures__/glbDeTeste";
import { ErroModeloProprio, MAX_TRIANGULOS } from "./modelo3dProprio";
import { contarTriangulos, montarModeloProprio } from "./montarModeloProprio";
import { aplicarTextura } from "./texturaProduto";

/** O GLB de teste aberto com o mesmo carregador do 3D (em memória, sem rede). */
async function abrir(o?: OpcoesGlbTeste): Promise<THREE.Group> {
  const g = await new GLTFLoader().parseAsync(glbDeTeste(o), "");
  return g.scene;
}
const caixaDe = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g);
const matDe = (g: THREE.Object3D, nome: string): THREE.MeshStandardMaterial => {
  let r: THREE.MeshStandardMaterial | null = null;
  g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.name === nome) r = m; });
  if (!r) throw new Error(`sem material ${nome}`);
  return r;
};
const MEDIDAS = { larguraM: 0.6, profundidadeM: 0.4, alturaM: 0.9 };
const corHex = (m: THREE.MeshStandardMaterial) => `#${m.color.getHexString()}`;

afterEach(() => vi.restoreAllMocks());

describe("montarModeloProprio: escala, base e centro", () => {
  it("o cubo 1×1×1 passa a 60×40×90 cm, assente no chão e centrado em x e z", async () => {
    const m = montarModeloProprio(await abrir(), { medidas: MEDIDAS });
    const c = caixaDe(m.grupo), t = c.getSize(new THREE.Vector3());
    expect(t.x).toBeCloseTo(0.6, 4); expect(t.z).toBeCloseTo(0.4, 4); expect(t.y).toBeCloseTo(0.9, 4);
    expect(c.min.y).toBeCloseTo(0, 5);
    expect(c.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 5);
    expect(c.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 5);
    expect(m.plano.usaMedidas).toBe(true);
  });

  it("normaliza um modelo fora da origem (centro deslocado, a meio da altura) antes de escalar", async () => {
    const m = montarModeloProprio(await abrir({ tamanho: [2, 4, 1], centro: [5, 7, -3] }), { medidas: MEDIDAS });
    const c = caixaDe(m.grupo);
    expect(c.getSize(new THREE.Vector3()).toArray().map((x) => Math.round(x * 1000) / 1000)).toEqual([0.6, 0.9, 0.4]);
    expect(c.min.y).toBeCloseTo(0, 5);
    expect(c.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 5);
  });

  it("sem medidas fica no tamanho nativo e avisa se está fora de 1 cm a 5 m", async () => {
    const normal = montarModeloProprio(await abrir({ tamanho: [0.5, 1, 0.5] }), { medidas: null });
    expect(caixaDe(normal.grupo).getSize(new THREE.Vector3()).y).toBeCloseTo(1, 4);
    expect(normal.plano.aviso).toBeNull();
    const enorme = montarModeloProprio(await abrir({ tamanho: [60, 80, 60] }), { medidas: null });
    expect(caixaDe(enorme.grupo).getSize(new THREE.Vector3()).y).toBeCloseTo(80, 3);
    expect(enorme.plano.aviso).toMatch(/grande/);
  });
});

describe("montarModeloProprio: cor e textura do produto", () => {
  it("sem cor nem textura o GLB fica como veio (cores do ficheiro)", async () => {
    const cena = await abrir();
    const antes = corHex(matDe(cena, "corpo"));
    const m = montarModeloProprio(cena, { medidas: MEDIDAS });
    expect(corHex(matDe(m.grupo, "corpo"))).toBe(antes);
  });

  it("a cor do produto pinta todos os materiais menos o metal", async () => {
    const cena = await abrir({ materiais: ["corpo", "metal"] });
    const m = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#a1b2c3" });
    expect(corHex(matDe(m.grupo, "corpo"))).toBe("#a1b2c3");
    expect(corHex(matDe(m.grupo, "metal"))).not.toBe("#a1b2c3");
  });

  it("vidro, espelho, luz e agua também ficam como vêm; qualquer outro nome leva a cor", async () => {
    for (const nome of ["Vidro_1", "espelho", "LUZ", "Água"]) {
      const m = montarModeloProprio(await abrir({ materiais: ["tampo", nome] }), { medidas: MEDIDAS, cor: "#102030" });
      expect(corHex(matDe(m.grupo, "tampo")), nome).toBe("#102030");
      expect(corHex(matDe(m.grupo, nome)), nome).not.toBe("#102030");
    }
  });

  it("a cor substitui o mapa de cor que o GLB trouxesse (a cor é sempre a do produto)", async () => {
    const cena = await abrir();
    const original = matDe(cena, "corpo");
    original.map = new THREE.Texture();
    const m = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#336699" });
    expect(matDe(m.grupo, "corpo").map).toBeNull();
    expect(original.map).not.toBeNull(); // o original (da cache) não se toca
  });

  it("a textura vai só aos materiais permitidos; tingida, a cor multiplica-a (não passa a branco)", async () => {
    const tex = new THREE.Texture();
    const m = montarModeloProprio(await abrir(), { medidas: MEDIDAS, cor: "#334455", textura: { tex, ladoCm: 40, tingir: true } });
    expect(matDe(m.grupo, "corpo").map).toBe(tex);
    expect(corHex(matDe(m.grupo, "corpo"))).toBe("#334455");
    expect(matDe(m.grupo, "metal").map).toBeNull();
    const pura = montarModeloProprio(await abrir(), { medidas: MEDIDAS, textura: { tex, ladoCm: 40 } });
    expect(matDe(pura.grupo, "corpo").map).toBe(tex);
    expect(corHex(matDe(pura.grupo, "corpo"))).toBe("#ffffff");
  });

  it("aplica a textura com a MESMA função da ficha (aplicarTextura): o shader no mundo e a repetição em cm", async () => {
    const tex = new THREE.Texture(), espia = vi.fn(aplicarTextura);
    const m = montarModeloProprio(await abrir(), { medidas: MEDIDAS, textura: { tex, ladoCm: 25 } }, espia);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0]![2]).toBe(25);
    expect(typeof matDe(m.grupo, "corpo").onBeforeCompile).toBe("function");
  });
});

describe("montarModeloProprio: materiais por instância", () => {
  it("cada instância tem os seus materiais (pintar uma não pinta a outra nem a cache) e a geometria fica partilhada", async () => {
    const cena = await abrir();
    const a = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#aa0000" }), b = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#0000aa" });
    expect(corHex(matDe(a.grupo, "corpo"))).toBe("#aa0000");
    expect(corHex(matDe(b.grupo, "corpo"))).toBe("#0000aa");
    expect(matDe(a.grupo, "corpo")).not.toBe(matDe(cena, "corpo"));
    expect(corHex(matDe(cena, "corpo"))).not.toBe("#aa0000");
    let ga: THREE.BufferGeometry | null = null, gc: THREE.BufferGeometry | null = null;
    a.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh && !ga) ga = (o as THREE.Mesh).geometry; });
    cena.traverse((o) => { if ((o as THREE.Mesh).isMesh && !gc) gc = (o as THREE.Mesh).geometry; });
    expect(ga).toBe(gc);
  });

  it("libertar larga os materiais da instância e nunca os da cache", async () => {
    const cena = await abrir();
    const deCena = [matDe(cena, "corpo"), matDe(cena, "metal")].map((x) => vi.spyOn(x, "dispose"));
    const m = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#123456" });
    const meus = [matDe(m.grupo, "corpo"), matDe(m.grupo, "metal")].map((x) => vi.spyOn(x, "dispose"));
    m.libertar();
    for (const s of meus) expect(s).toHaveBeenCalledTimes(1);
    for (const s of deCena) expect(s).not.toHaveBeenCalled();
  });

  it("as malhas que partilham um material partilham UMA cópia dele na instância (e uma só vez a libertar)", async () => {
    const cena = await abrir();
    let unico: THREE.Material | null = null;
    cena.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh) { unico ??= x.material as THREE.Material; x.material = unico; } });
    const m = montarModeloProprio(cena, { medidas: MEDIDAS, cor: "#123456" });
    const mats = new Set<THREE.Material>();
    m.grupo.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh) mats.add(x.material as THREE.Material); });
    expect(mats.size).toBe(1);
    const sp = vi.spyOn([...mats][0]!, "dispose");
    m.libertar();
    expect(sp).toHaveBeenCalledTimes(1);
  });
});

describe("montarModeloProprio: limites", () => {
  it("conta os triângulos reais da cena", async () => {
    expect(contarTriangulos(await abrir({ triangulos: 30 }))).toBe(30);
  });

  it("recusa, com erro próprio, mais de 200 000 triângulos (o 3D cai no genérico)", async () => {
    const cena = await abrir({ triangulos: MAX_TRIANGULOS + 2 });
    expect(() => montarModeloProprio(cena, { medidas: MEDIDAS })).toThrow(ErroModeloProprio);
  });

  it("avisa de 50 000 triângulos sem recusar", async () => {
    const m = montarModeloProprio(await abrir({ triangulos: 50_000 }), { medidas: MEDIDAS });
    expect(m.triangulos).toBe(50_000);
    expect(m.aviso).toMatch(/50 000/);
  });

  it("uma cena sem geometria dá erro (o 3D cai no genérico)", () => {
    expect(() => montarModeloProprio(new THREE.Group(), { medidas: MEDIDAS })).toThrow(ErroModeloProprio);
  });
});
