// Os GLB pré-gerados (scripts/gerar-modelos-glb.mjs) existem para todos os modelos do HTML e as malhas pedem materiais que o acabamento tem.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { modelosDeTorneira } from "./torneiras";
import { modelosDeLavaLoica } from "./index";
import { modelosDePlaca } from "./placas";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { libertarCena, montarModelo, prepararCena, urlDoModeloHtml, vestir } from "./glb";

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

/* ------------------------------------------------------------------ os GLB completos do fabricante (public/modelos3d/completos) */
describe("urlDoModeloHtml: o completo do fabricante, se existir, senão o antigo", () => {
  it("devolve o completo quando há ficheiro para esse modelo e acabamento", () => {
    expect(urlDoModeloHtml("lava_loica", "ambar50n", "negro")).toBe("/modelos3d/completos/lava_loica-ambar50n-negro.glb");
    expect(urlDoModeloHtml("torneira", "smooth", "chrome")).toBe("/modelos3d/completos/torneira-smooth-chrome.glb");
  });
  it("sem acabamento, com um acabamento que não tem ficheiro, ou sem ficheiro nenhum, fica o GLB antigo (exactamente como hoje)", () => {
    expect(urlDoModeloHtml("lava_loica", "ambar50n")).toBe("/modelos3d/lava_loica-ambar50n.glb");
    expect(urlDoModeloHtml("lava_loica", "ambar50n", "oro")).toBe("/modelos3d/lava_loica-ambar50n.glb");
    expect(urlDoModeloHtml("torneira", "round", "chrome")).toBe("/modelos3d/torneira-round.glb");
    expect(urlDoModeloHtml("placa", "ib65b60", "negro")).toBe("/modelos3d/placa-ib65b60.glb");
  });
});

/** Uma cena como a que o GLTFLoader devolve de um GLB completo: o nó raiz (units «metres», escala 0,001) com as malhas de materiais embutidos. */
function cenaCompleta() {
  const cena = new THREE.Group(), raiz = new THREE.Group();
  raiz.userData = { units: "metres", model: "smooth" }; raiz.scale.setScalar(0.001); raiz.name = "Rubicer_-_Smooth_-_Cromo";
  const mat = new THREE.MeshPhysicalMaterial({ clearcoat: 1 }), geo = new THREE.BoxGeometry(10, 10, 10);
  const corpo = new THREE.Mesh(geo, mat); corpo.name = "Smooth_corpo";
  raiz.add(corpo); cena.add(raiz);
  return { cena, raiz, corpo, mat, geo };
}

describe("cena completa (materiais embutidos, em mm como os antigos)", () => {
  it("prepararCena põe o nó raiz a escala 1 (mm) e marca a cena; uma cena antiga fica intacta", () => {
    const { cena, raiz } = cenaCompleta();
    expect(prepararCena(cena)).toBe(true);
    expect(raiz.scale.x).toBe(1); expect(raiz.scale.y).toBe(1); expect(raiz.scale.z).toBe(1);
    expect(cena.userData.completo).toBe(true);
    const antiga = new THREE.Group(), no = new THREE.Group(); no.scale.setScalar(0.5); antiga.add(no);
    expect(prepararCena(antiga)).toBe(false);
    expect(no.scale.x).toBe(0.5); expect(antiga.userData.completo).toBeUndefined();
  });

  it("montarModelo não lança sem userData.material, mantém os materiais e a geometria do GLB e liga as sombras", () => {
    const { cena, corpo, mat, geo } = cenaCompleta();
    prepararCena(cena);
    const m = montarModelo("torneira", cena, "smooth", "chrome", { bica: 45 });
    const malha = m.grupo.getObjectByName(corpo.name) as THREE.Mesh;
    expect(malha).not.toBe(corpo); // clone
    expect(malha.material).toBe(mat); expect(malha.geometry).toBe(geo); // partilhados com a cache
    expect(malha.castShadow).toBe(true); expect(malha.receiveShadow).toBe(true);
    let largado = 0; mat.addEventListener("dispose", () => largado++);
    m.libertar();
    expect(largado).toBe(0); // os materiais são da cache, não da peça
    const l = montarModelo("lava_loica", cena, "ambar50n", "negro", { tampas: true });
    expect(l.grupo.getObjectByName(corpo.name)).toBeDefined();
    l.libertar();
  });

  it("a cena antiga continua a exigir o material (vestir não mudou)", () => {
    const sem = new THREE.Group(), y = new THREE.Mesh(new THREE.BoxGeometry()); y.name = "naoexiste"; sem.add(y);
    expect(() => montarModelo("torneira", sem, "round", "chrome")).toThrow(/naoexiste/);
  });

  it("libertarCena larga a geometria e, numa cena completa, também os materiais (a cache é a dona); numa antiga, só a geometria", () => {
    const { cena, mat, geo } = cenaCompleta();
    prepararCena(cena);
    let g = 0, m = 0; geo.addEventListener("dispose", () => g++); mat.addEventListener("dispose", () => m++);
    libertarCena(cena);
    expect(g).toBe(1); expect(m).toBe(1);
    const antiga = cenaCompleta(); let g2 = 0, m2 = 0;
    antiga.geo.addEventListener("dispose", () => g2++); antiga.mat.addEventListener("dispose", () => m2++);
    libertarCena(antiga.cena);
    expect(g2).toBe(1); expect(m2).toBe(0);
  });
});

/** Lê um GLB completo do disco com o mesmo carregador e descodificador do navegador (sem rede). */
async function lerDoDisco(ficheiro: string): Promise<THREE.Group> {
  const b = readFileSync(join(PUBLICO, "modelos3d", "completos", ficheiro));
  // um ArrayBuffer do mesmo «reino» do carregador (o do Buffer do Node falha o `instanceof` no jsdom)
  const buf = new ArrayBuffer(b.byteLength); new Uint8Array(buf).set(b);
  const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
  const g = await new Promise<{ scene: THREE.Group }>((ok, err) => l.parse(buf, "", ok, err));
  prepararCena(g.scene);
  return g.scene;
}
const malhas = (o: THREE.Object3D, re?: RegExp, casam = true) => { const r: THREE.Object3D[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh && (!re || re.test(x.name) === casam)) r.push(x); }); return r; };

describe("GLB completos reais (lidos do disco)", () => {
  it("o nó raiz ficou a escala 1 e a peça tem o tamanho real em mm (Ambar 100: cerca de 1000 mm de comprimento)", async () => {
    const cena = await lerDoDisco("lava_loica-ambar100-negro.glb");
    expect(cena.userData.completo).toBe(true);
    const t = new THREE.Box3().setFromObject(cena).getSize(new THREE.Vector3());
    expect(t.x).toBeGreaterThan(900); expect(t.x).toBeLessThan(1100);
  });

  it("Ambar: as tampas dos ralos (todas as malhas que casam pelo nome) escondem-se e voltam a ver-se; a cena da cache não muda", async () => {
    const cena = await lerDoDisco("lava_loica-ambar100-negro.glb");
    const m = montarModelo("lava_loica", cena, "ambar100", "negro", { tampas: true });
    const tampas = malhas(m.grupo, /tampa_remov/i);
    expect(tampas.length).toBeGreaterThanOrEqual(2); // uma por cuba
    for (const t of tampas) expect(t.visible).toBe(false);
    const outras = malhas(m.grupo, /tampa_remov/i, false);
    expect(outras.length).toBeGreaterThan(5); for (const o of outras) expect(o.visible).toBe(true);
    for (const t of malhas(cena, /tampa_remov/i)) expect(t.visible).toBe(true);
    const com = montarModelo("lava_loica", cena, "ambar100", "negro", { tampas: false });
    for (const t of malhas(com.grupo, /tampa_remov/i)) expect(t.visible).toBe(true);
    m.libertar(); com.libertar();
  });

  it("Keran: o escorredor reverso roda a lava-loiça meia volta", async () => {
    const cena = await lerDoDisco("lava_loica-keran100-inox.glb");
    const k = montarModelo("lava_loica", cena, "keran100", "inox", { reverso: true });
    expect(k.grupo.rotation.y).toBeCloseTo(Math.PI);
    const n = montarModelo("lava_loica", cena, "keran100", "inox", {});
    expect(n.grupo.rotation.y).toBe(0);
    k.libertar(); n.libertar();
  });

  it("Smooth: a bica giratória roda sobre o eixo vertical (nó pelo nome); a Cira, sem esse nó, monta na mesma", async () => {
    const smooth = await lerDoDisco("torneira-smooth-chrome.glb");
    const m = montarModelo("torneira", smooth, "smooth", "chrome", { bica: 90 });
    const bicas: THREE.Object3D[] = []; m.grupo.traverse((x) => { if (/bica_girat/.test(x.name)) bicas.push(x); });
    expect(bicas).toHaveLength(1);
    expect(bicas[0].rotation.y).toBeCloseTo(Math.PI / 2);
    m.libertar();
    const cira = await lerDoDisco("torneira-cira-chrome.glb");
    expect(() => montarModelo("torneira", cira, "cira", "chrome", { bica: 90 }).libertar()).not.toThrow();
  });
});
