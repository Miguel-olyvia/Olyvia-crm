// Torneiras do catálogo de origem, portadas do HTML (geometria própria, em milímetros): GME IO Round e Noah, Rubicer Smooth e Moovlux Stick.
// Cada construtor devolve um THREE.Group com a origem no centro da base e a bica para +z. Opções: bica (rotação 360°) e extraída (0 a 1, a
// cabeça sai com o flexível metálico em espiral). Os corpos são tetraedros marchantes (caros) e ficam em cache por modelo; os materiais mudam com o acabamento.
import * as THREE from "three";
import { DETALHE, V, acabamentoHtml, bodyGeometry, reduzirGrelha, criarMateriais, cyl, geometriaEmCache, lathe, mesh, rod, rounded, roundCylinder, spiralGeometry, type AcabHtml, type Materiais, type Vec } from "./util";

export type ModeloTorneira = "round" | "noah" | "smooth" | "stick";
export interface OpcoesTorneira { /** rotação da bica, em graus (0 a 360) */ bica?: number; /** 0 = recolhida, 1 = bica extraída com o flexível */ extraido?: number }
export interface TorneiraHtml { grupo: THREE.Group; bica: THREE.Group; puxar: Puxar | null; materiais: Materiais }
export interface Puxar { dock: Vec; direction: Vec; head: THREE.Group; hose: THREE.Group; core: THREE.Mesh; spiral: THREE.Mesh }

/** As alterações de acabamento próprias de cada modelo (os `finishOverrides` do HTML). */
export const SOBREPOR_ACABAMENTO: Record<ModeloTorneira, Record<string, Partial<AcabHtml>>> = {
  round: {},
  noah: { brushed: { color: "#b7b9ba", trim: "#a7aaab", roughness: 0.27 }, oro: { color: "#c6ab64", trim: "#ac904d" }, cobre: { color: "#b88755", trim: "#9e7248" }, titanio: { color: "#55524d", trim: "#45413c" } },
  smooth: { oro: { color: "#bba25c", trim: "#9c8447", roughness: 0.29 }, cobre: { color: "#bd977e", trim: "#a57f67", roughness: 0.3 }, negro: { color: "#151617", trim: "#101112", roughness: 0.46 } },
  stick: { negro: { color: "#151617", trim: "#111213", roughness: 0.53, metalness: 0.03, clearcoat: 0.02 } },
};
/** As medidas principais de cada modelo (mm), as do catálogo de origem: altura total, alcance, altura de saída e diâmetro da base. */
export const MEDIDAS_TORNEIRA: Record<ModeloTorneira, { altura: number; alcance: number; saida: number; base: number }> = {
  round: { altura: 445, alcance: 224, saida: 245, base: 55 }, noah: { altura: 366, alcance: 210, saida: 291, base: 51.5 },
  smooth: { altura: 435, alcance: 213, saida: 242, base: 49 }, stick: { altura: 456, alcance: 230, saida: 231, base: 50 },
};
export const acabamentoDaTorneira = (m: ModeloTorneira, acab: string): AcabHtml => acabamentoHtml(acab, SOBREPOR_ACABAMENTO[m][acab]);

/* ------------------------------------------------------------------ a cabeça extraível (do Round; o Smooth e o Stick adaptam-na) */
type VarianteCabeca = "round" | "smooth" | "stick";
function cabecaExtraivel(m: Materiais, dock: Vec, D: Vec, v: VarianteCabeca): THREE.Group {
  const head = new THREE.Group();
  head.name = "Bica extraível"; head.position.copy(dock); head.quaternion.setFromUnitVectors(V(0, 1, 0), D);
  lathe([[14.7, 0], [15.2, 0.25], [15.4, 1], [15.5, 5], [15.8, 42], [16.1, 77.5], [16.1, 80.5], [15.7, 81.6], [14, 82], [13.0, 81.7]], m.metal, head, "Corpo da bica extraível");
  lathe([[14.8, -0.25], [15.1, -0.25], [15.1, 0.2], [14.8, 0.2]], m.rubber, head, "Junta de encaixe discreta");
  const filter = cyl(13.4, 13.4, 1, m.aerator, head, "Arejador"); filter.position.y = 81.5;
  const inner = cyl(10.7, 10.7, 1.1, m.aerator, head, "Filtro central"); inner.position.y = 82.05;
  const holes: number[][] = [];
  for (let x = -10; x <= 10; x += 1.8) for (let z = -10; z <= 10; z += 1.8) { const zz = z + (Math.round(x / 1.8) % 2) * 0.9; if (x * x + zz * zz < 100) holes.push([x, zz]); }
  const inst = new THREE.InstancedMesh(geometriaEmCache("furos-arejador-round", () => new THREE.CylinderGeometry(0.46, 0.46, 0.18, 8)), m.hole, holes.length);
  const mx = new THREE.Matrix4(); holes.forEach(([x, z], i) => { mx.makeTranslation(x, 82.68, z); inst.setMatrixAt(i, mx); }); head.add(inst);
  for (let i = 0; i < 32; i++) { const a = (i * Math.PI * 2) / 32, o = cyl(0.7, 0.7, 0.22, m.hole, head, "", 8); o.position.set(Math.cos(a) * 12, 82.04, Math.sin(a) * 12); }
  const frame = mesh(new THREE.ExtrudeGeometry(rounded(10.7, 37, 1.8), { depth: 0.8, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.3, bevelSegments: 3, curveSegments: 8 }), m.rubber, head, "Junta do botão");
  frame.rotation.y = Math.PI / 2; frame.position.set(14.7, 43, 0);
  const button = mesh(new THREE.ExtrudeGeometry(rounded(9.4, 35.4, 1.45), { depth: 1, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.35, bevelSegments: 3, curveSegments: 8 }), m.metal, head, "Botão da bica");
  button.rotation.y = Math.PI / 2; button.position.set(15.45, 43, 0);
  lathe([[0, -25], [6.4, -25], [7.1, -24], [7.1, -22], [9.2, -22], [10.1, -20.8], [10.5, -12.7], [10.5, -11.2], [10.9, -10.3], [11.7, -2], [12.2, -0.8], [12.2, 1], [0, 1]], m.hose, head, "Ligação escalonada do flexível");
  lathe([[9.8, -12.8], [10.7, -12.8], [10.8, -12.3], [10.8, -10.7], [10.6, -10.3], [9.8, -10.3]], m.rubber, head, "Vedante da ligação");
  if (v === "round") return head;
  // o Smooth e o Stick reaproveitam a cabeça, com o corpo e o botão ajustados
  for (const child of head.children) {
    if (v === "smooth") {
      if (child.name === "Corpo da bica extraível") (child as THREE.Mesh).geometry = new THREE.LatheGeometry([[14.3, 0], [14.55, 0.35], [14.65, 1], [14.75, 5], [15.2, 48], [16.05, 86.5], [16.05, 88.3], [15.6, 89.7], [14, 90], [13, 89.7]].map((p) => new THREE.Vector2(p[0], p[1])), DETALHE.lathe);
      else if (child.name === "Junta de encaixe discreta") child.scale.set(14.55 / 15.1, 1, 14.55 / 15.1);
      else if (child.name === "Junta do botão" || child.name === "Botão da bica") { const radius = child.position.x - 0.6; child.position.set(0, child.position.y + 4, -radius); child.rotation.y = Math.PI; }
      else if (child.name === "Arejador" || child.name === "Filtro central" || child.name === "") child.position.y += 8;
    } else {
      if (child.name === "Corpo da bica extraível") (child as THREE.Mesh).geometry = new THREE.LatheGeometry([[14.8, 0], [15, 0.3], [15.1, 1], [15.15, 5], [15.35, 50], [15.6, 89], [15.6, 90.5], [15.1, 91.7], [13.5, 92], [13, 91.7]].map((p) => new THREE.Vector2(p[0], p[1])), DETALHE.lathe);
      else if (child.name === "Junta de encaixe discreta") child.scale.set(15 / 15.1, 1, 15 / 15.1);
      else if (child.name === "Junta do botão" || child.name === "Botão da bica") { const radius = child.position.x; child.position.set(0, child.position.y + 4, -radius); child.rotation.y = Math.PI; child.scale.x = 0.88; }
      else if (child.name === "Arejador" || child.name === "Filtro central" || child.name === "") child.position.y += 10;
    }
  }
  return head;
}

/** Põe a cabeça na posição extraída e (re)constrói o flexível de metal em espiral entre a ligação e a cabeça. */
export function aplicarExtracao(p: Puxar, quantidade: number): void {
  const a = Math.min(1, Math.max(0, quantidade)), moved = p.dock.clone().add(V(18 * a, -132 * a, 30 * a));
  p.head.position.copy(moved);
  const start = p.dock.clone().addScaledVector(p.direction, 1.5), end = moved.clone().addScaledVector(p.direction, -24);
  p.hose.visible = end.clone().sub(start).dot(p.direction) > 2;
  if (!p.hose.visible) return;
  const bend = Math.min(start.distanceTo(end) * 0.34, 38), curve = new THREE.CubicBezierCurve3(start, start.clone().addScaledVector(p.direction, bend), end.clone().addScaledVector(p.direction, -bend), end);
  p.core.geometry.dispose(); p.spiral.geometry.dispose();
  p.core.geometry = new THREE.TubeGeometry(curve, 50, 5.18, 24, false); p.spiral.geometry = spiralGeometry(curve);
}
function criarFlexivel(m: Materiais, pai: THREE.Object3D, prefixo: string) {
  const hose = new THREE.Group(); hose.name = `${prefixo}flexível metálico em espiral`; hose.visible = false; pai.add(hose);
  return { hose, core: mesh(new THREE.BufferGeometry(), m.hoseCore, hose, `${prefixo}fundo das juntas`), spiral: mesh(new THREE.BufferGeometry(), m.hose, hose, `${prefixo}fita metálica helicoidal`) };
}
function haste(m: Materiais, pai: THREE.Object3D, caminho: THREE.CurvePath<THREE.Vector3>, raio: number, nome: string, segmentos = 280): void {
  mesh(new THREE.TubeGeometry(caminho, Math.round(segmentos * DETALHE.tuboSegmentos), raio, DETALHE.tuboRadial, false), m.metal, pai, nome);
}
const rodar = (g: THREE.Object3D, graus: number | undefined) => { g.rotation.y = ((graus ?? 0) * Math.PI) / 180; };
const corpo = (chave: string, sdf: (x: number, y: number, z: number) => number, grelha: Parameters<typeof bodyGeometry>[1]) => geometriaEmCache(chave, () => bodyGeometry(sdf, reduzirGrelha(grelha)));

/* ------------------------------------------------------------------ GME IO Round Extraível */
function construirRound(m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = "GME IO Round Extraível";
  lathe([[0, 0], [25.7, 0], [26.9, 0.4], [27.5, 1.1], [27.5, 3.2], [27.1, 4.1], [25.8, 5.0], [24.0, 5.3], [0, 5.3]], m.metal, grupo, "Base Ø55");
  const sdf = (x: number, y: number, z: number) => {
    const a = roundCylinder(Math.hypot(x, z), y - 52, 24, 47, 2.2), b = roundCylinder(Math.hypot(y - 53, z), x - 30, 20, 23, 1.8), h = Math.max(3.6 - Math.abs(a - b), 0) / 3.6;
    return Math.min(a, b) - h * h * 0.9;
  };
  mesh(corpo("round-corpo", sdf, { step: 1.6, nx: 52, ny: 65, nz: 34, x0: -27, y0: 2, z0: -27 }), m.metal, grupo, "Corpo com ligação lateral contínua");
  lathe([[15, 96], [16.4, 98.3], [17.0, 100], [16.3, 101.5], [15.1, 102.2], [15, 104]], m.trim, grupo, "Anel de rotação");
  const bica = new THREE.Group(); bica.name = "Round · bica giratória 360°"; grupo.add(bica);
  const outlet = V(0, 245, 224), D = V(0, -0.95015, 0.31179).normalize(), dock = outlet.clone().addScaledVector(D, -82);
  const caminho = new THREE.CurvePath<THREE.Vector3>();
  caminho.add(new THREE.LineCurve3(V(0, 100, 0), V(0, 329, 0)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 329, 0), V(0, 390, 0), V(0, 430, 39), V(0, 430, 95)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 430, 95), V(0, 430, 156), dock.clone().addScaledVector(D, -67), dock));
  haste(m, bica, caminho, 15, "Bica curva contínua Ø30");
  const head = cabecaExtraivel(m, dock, D, "round"); bica.add(head);
  const fx = criarFlexivel(m, bica, "Round · ");
  const knob = new THREE.Group(); knob.position.set(49, 53, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe([[0, 0], [20.7, 0], [21.7, 1.0], [22.5, 2.5], [22.5, 18.7], [22.3, 20.4], [21.4, 21.4], [0, 21.4]], m.metal, knob, "Comando lateral");
  lathe([[20.2, -0.4], [20.8, -0.4], [20.8, 0.2], [20.2, 0.2]], m.trim, knob, "Junta do comando");
  lathe([[0, 0], [4.3, 0], [4.7, 0.6], [4.7, 75], [4.4, 77], [3.4, 78], [0, 78]], m.metal, grupo, "Pega vertical").position.set(58, 75, 0);
  const puxar: Puxar = { dock, direction: D, head, ...fx };
  rodar(bica, o.bica); aplicarExtracao(puxar, o.extraido ?? 0);
  return { grupo, bica, puxar, materiais: m };
}

/* ------------------------------------------------------------------ GME IO Noah Monocomando (bica fixa Ø24, saída a 7°) */
function construirNoah(m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = "GME IO Noah Monocomando";
  lathe([[0, 0], [24.8, 0], [25.5, 0.4], [25.75, 1], [25.75, 7], [25.3, 8], [22, 8.4], [0, 8.4]], m.metal, grupo, "Noah · base Ø51,5");
  const sdf = (x: number, y: number, z: number) => {
    const a = roundCylinder(Math.hypot(x, z), y - 58, 22, 50, 0.8), b = roundCylinder(Math.hypot(y - 59, z), x - 32, 21, 24, 0.8), h = Math.max(1.3 - Math.abs(a - b), 0) / 1.3;
    return Math.min(a, b) - h * h * 0.325;
  };
  mesh(corpo("noah-corpo", sdf, { step: 1.35, nx: 66, ny: 83, nz: 39, x0: -25, y0: 4, z0: -25 }), m.metal, grupo, "Noah · corpo e ligação lateral");
  lathe([[12, 107.5], [12.6, 108], [12.7, 108.25], [12, 108.5]], m.trim, grupo, "Noah · junta de rotação");
  const bica = new THREE.Group(); bica.name = "Noah · bica giratória 360°"; grupo.add(bica);
  const dir = V(0, -Math.cos((7 * Math.PI) / 180), Math.sin((7 * Math.PI) / 180)), outlet = V(0, 291, 210), dock = outlet.clone().addScaledVector(dir, -19);
  const caminho = new THREE.CurvePath<THREE.Vector3>();
  caminho.add(new THREE.LineCurve3(V(0, 107.5, 0), V(0, 314, 0)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 314, 0), V(0, 333.882, 0), V(0, 350, 16.118), V(0, 350, 36)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 350, 36), V(0, 350, 78), V(0, 354, 122), V(0, 354, 164)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 354, 164), V(0, 354, 189), dock.clone().addScaledVector(dir, -24), dock));
  haste(m, bica, caminho, 12, "Noah · tubo Ø24");
  const tip = new THREE.Group(); tip.position.copy(dock); tip.quaternion.setFromUnitVectors(V(0, 1, 0), dir); tip.name = "Noah · saída fixa a 7°"; bica.add(tip);
  lathe([[11.9, 0], [12, 0.35], [12, 17.7], [11.9, 18.45], [11.25, 19], [10.35, 19], [10.35, 17.5]], m.metal, tip, "Noah · terminal e arejador");
  lathe([[11.8, -0.15], [12.03, -0.15], [12.03, 0.08], [11.8, 0.08]], m.trim, tip, "Noah · união do terminal");
  const filtro = cyl(10.45, 10.45, 0.45, m.aerator, tip, "Noah · filtro do arejador"); filtro.position.y = 18.55;
  const furos: number[][] = [];
  for (let x = -9; x <= 9; x += 1.6) for (let z = -9; z <= 9; z += 1.6) { const zz = z + (Math.round(x / 1.6) % 2) * 0.8; if (x * x + zz * zz < 85) furos.push([x, zz]); }
  const inst = new THREE.InstancedMesh(geometriaEmCache("furos-arejador-noah", () => new THREE.CylinderGeometry(0.38, 0.38, 0.12, 8)), m.hole, furos.length);
  const mx = new THREE.Matrix4(); furos.forEach(([x, z], i) => { mx.makeTranslation(x, 18.83, z); inst.setMatrixAt(i, mx); }); tip.add(inst);
  const knob = new THREE.Group(); knob.position.set(47, 59, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe([[0, 0], [21.5, 0], [22.05, 0.7], [22.2, 1.3], [22.2, 24.2], [21.9, 25.2], [21.2, 25.7], [0, 25.7]], m.metal, knob, "Noah · comando lateral");
  lathe([[21, -0.6], [21.6, -0.6], [21.6, -0.15], [21, -0.15]], m.rubber, knob, "Noah · junta do comando");
  rod(V(61.5, 80, 0), V(61.5, 105.5, 0), 3.1, m.metal, grupo, "Noah · haste da pega");
  lathe([[0, 0], [4.9, 0], [5.45, 0.5], [5.6, 1.2], [5.6, 35.2], [5.35, 36], [4.8, 36.5], [0, 36.5]], m.metal, grupo, "Noah · pega cilíndrica").position.set(61.5, 104.5, 0);
  rodar(bica, o.bica);
  return { grupo, bica, puxar: null, materiais: m };
}

/* ------------------------------------------------------------------ Rubicer Smooth Extraível (corpo afunilado) */
function construirSmooth(m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = "Rubicer Smooth";
  lathe([[0, 0], [23.95, 0], [24.4, 0.25], [24.5, 0.65], [24.5, 2.8], [0, 2.8]], m.metal, grupo, "Smooth · base Ø49");
  const raio = (y: number) => { const t = THREE.MathUtils.clamp((y - 88) / 121, 0, 1); return 24.5 - 10 * (t * t * (3 - 2 * t)); };
  const sdf = (x: number, y: number, z: number) => {
    const a = roundCylinder(Math.hypot(x, z), y - 105.5, raio(y), 103.5, 0.45), b = roundCylinder(Math.hypot(y - 80, z), x - 32, 20.5, 24, 1.1), h = Math.max(4 - Math.abs(a - b), 0) / 4;
    return Math.min(a, b) - h * h;
  };
  mesh(corpo("smooth-corpo", sdf, { step: 1.45, nx: 62, ny: 149, nz: 38, x0: -27, y0: -1.5, z0: -27 }), m.metal, grupo, "Smooth · corpo afunilado e ligação do comando");
  lathe([[14.25, 208.65], [14.51, 208.65], [14.51, 209.05], [14.25, 209.05]], m.trim, grupo, "Smooth · junta de rotação");
  const bica = new THREE.Group(); bica.name = "Smooth · bica giratória 360°"; grupo.add(bica);
  const dir = V(0, -Math.cos((7 * Math.PI) / 180), Math.sin((7 * Math.PI) / 180)), outlet = V(0, 242, 213), dock = outlet.clone().addScaledVector(dir, -90), cotovelo = dock.clone().addScaledVector(dir, -45);
  const caminho = new THREE.CurvePath<THREE.Vector3>();
  caminho.add(new THREE.LineCurve3(V(0, 209, 0), V(0, 371.5, 0)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 371.5, 0), V(0, 398.563, 0), V(0, 420.5, 21.937), V(0, 420.5, 49)));
  caminho.add(new THREE.LineCurve3(V(0, 420.5, 49), V(0, 420.5, 141)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 420.5, 141), V(0, 420.5, 169), cotovelo.clone().addScaledVector(dir, -27), cotovelo));
  caminho.add(new THREE.LineCurve3(cotovelo, dock));
  haste(m, bica, caminho, 14.5, "Smooth · tubo de cantos arredondados", 300);
  const head = cabecaExtraivel(m, dock, dir, "smooth"); bica.add(head);
  const fx = criarFlexivel(m, bica, "Smooth · ");
  const knob = new THREE.Group(); knob.position.set(48, 80, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe([[0, 0], [20.5, 0], [21.9, 0.8], [22.35, 1.8], [22.35, 25.8], [22.1, 26.6], [21.35, 27.2], [0, 27.2]], m.metal, knob, "Smooth · comando lateral");
  lathe([[20.3, -0.3], [21, -0.3], [21, 0.15], [20.3, 0.15]], m.rubber, knob, "Smooth · junta do comando");
  lathe([[0, 0], [3.15, 0], [3.6, 0.5], [3.6, 66.5], [3.4, 67.7], [2.9, 68], [0, 68]], m.metal, grupo, "Smooth · pega vertical").position.set(62, 101, 0);
  const puxar: Puxar = { dock, direction: dir, head, ...fx };
  rodar(bica, o.bica); aplicarExtracao(puxar, o.extraido ?? 0);
  return { grupo, bica, puxar, materiais: m };
}

/* ------------------------------------------------------------------ Moovlux Stick Extraível (TC1005, corpo esguio Ø30) */
function construirStick(m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = "Moovlux Stick Extraível";
  lathe([[0, 0], [23.8, 0], [24.7, 0.4], [25, 1], [25, 3.5], [24.4, 4.5], [21.8, 5.2], [15, 5.2], [0, 5.2]], m.metal, grupo, "Stick · base Ø50");
  const sdf = (x: number, y: number, z: number) => {
    const a = roundCylinder(Math.hypot(x, z), y - 97.15, 15, 92.35, 0.35), b = roundCylinder(Math.hypot(y - 112, z), x - 30, 14.4, 24.5, 1.1), h = Math.max(3.2 - Math.abs(a - b), 0) / 3.2;
    return Math.min(a, b) - h * h * 0.8;
  };
  mesh(corpo("stick-corpo", sdf, { step: 1.35, nx: 56, ny: 142, nz: 26, x0: -17, y0: 1.5, z0: -17 }), m.metal, grupo, "Stick · corpo esguio Ø30 e ligação lateral");
  lathe([[14.8, 189.25], [15.05, 189.25], [15.05, 189.6], [14.8, 189.6]], m.trim, grupo, "Stick · junta de rotação");
  const bica = new THREE.Group(); bica.name = "Stick · bica giratória 360°"; grupo.add(bica);
  const dir = V(0, -Math.cos((12 * Math.PI) / 180), Math.sin((12 * Math.PI) / 180)), outlet = V(0, 231, 230), dock = outlet.clone().addScaledVector(dir, -92);
  const caminho = new THREE.CurvePath<THREE.Vector3>();
  caminho.add(new THREE.LineCurve3(V(0, 189.5, 0), V(0, 335, 0)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 335, 0), V(0, 394, 0), V(0, 441, 46), V(0, 441, 105)));
  caminho.add(new THREE.CubicBezierCurve3(V(0, 441, 105), V(0, 441, 165), dock.clone().addScaledVector(dir, -72), dock));
  haste(m, bica, caminho, 15, "Stick · curva contínua Ø30", 300);
  const head = cabecaExtraivel(m, dock, dir, "stick"); bica.add(head);
  const fx = criarFlexivel(m, bica, "Stick · ");
  const knob = new THREE.Group(); knob.position.set(52, 112, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe([[0, 0], [13.9, 0], [14.5, 0.5], [14.7, 1.2], [14.7, 16.7], [14.4, 17.8], [13.7, 18.4], [0, 18.4]], m.metal, knob, "Stick · comando lateral");
  lathe([[13.9, -0.3], [14.45, -0.3], [14.45, 0.1], [13.9, 0.1]], m.rubber, knob, "Stick · junta do comando");
  lathe([[0, 0], [2.8, 0], [3.05, 0.5], [3.05, 81.9], [2.85, 83], [2.35, 83.5], [0, 83.5]], m.metal, grupo, "Stick · pega vertical").position.set(61.5, 126, 0);
  const puxar: Puxar = { dock, direction: dir, head, ...fx };
  rodar(bica, o.bica); aplicarExtracao(puxar, o.extraido ?? 0);
  return { grupo, bica, puxar, materiais: m };
}

const CONSTRUTORES: Record<ModeloTorneira, (m: Materiais, o: OpcoesTorneira) => TorneiraHtml> = { round: construirRound, noah: construirNoah, smooth: construirSmooth, stick: construirStick };
export const modelosDeTorneira = (): ModeloTorneira[] => Object.keys(CONSTRUTORES) as ModeloTorneira[];
export const ehModeloTorneira = (id: string): id is ModeloTorneira => id in CONSTRUTORES;
/** Constrói uma torneira (em mm) para um acabamento e opções; as geometrias pesadas vêm do cache. */
export function construirTorneira(modelo: ModeloTorneira, acab: string, opcoes: OpcoesTorneira = {}): TorneiraHtml {
  return CONSTRUTORES[modelo](criarMateriais(acabamentoDaTorneira(modelo, acab)), opcoes);
}
