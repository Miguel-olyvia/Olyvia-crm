// Torneiras do catálogo de origem, portadas do HTML (geometria própria, em milímetros): GME IO Round e Noah, Rubicer Smooth e Moovlux Stick.
// Cada construtor devolve um THREE.Group com a origem no centro da base e a bica para +z. Opções: bica (rotação 360°) e extraída (0 a 1, a
// cabeça sai com o flexível metálico em espiral). Os corpos são tetraedros marchantes (caros) e ficam em cache por modelo; os materiais mudam com o acabamento.
import * as THREE from "three";
import { DETALHE, V, acabamentoHtml, bodyGeometry, reduzirGrelha, criarMateriais, cyl, geometriaEmCache, lathe, mesh, rod, rounded, roundCylinder, spiralGeometry, type AcabHtml, type Materiais, type Vec } from "./util";

import { MEDIDAS_TORNEIRA, type ModeloTorneira } from "./specs";
export { MEDIDAS_TORNEIRA, type ModeloTorneira };
export interface OpcoesTorneira { /** rotação da bica, em graus (0 a 360) */ bica?: number; /** 0 = recolhida, 1 = bica extraída com o flexível */ extraido?: number }
export interface TorneiraHtml { grupo: THREE.Group; bica: THREE.Group; puxar: Puxar | null; materiais: Materiais }
export interface Puxar { dock: Vec; direction: Vec; head: THREE.Group; hose: THREE.Group; core: THREE.Mesh; spiral: THREE.Mesh }

/** As alterações de acabamento próprias de cada modelo (os `finishOverrides` do HTML). */
export const SOBREPOR_ACABAMENTO: Record<ModeloTorneira, Record<string, Partial<AcabHtml>>> = {
  round: {},
  noah: { brushed: { color: "#b7b9ba", trim: "#a7aaab", roughness: 0.27 }, oro: { color: "#c6ab64", trim: "#ac904d" }, cobre: { color: "#b88755", trim: "#9e7248" }, titanio: { color: "#55524d", trim: "#45413c" } },
  smooth: { oro: { color: "#bba25c", trim: "#9c8447", roughness: 0.29 }, cobre: { color: "#bd977e", trim: "#a57f67", roughness: 0.3 }, negro: { color: "#151617", trim: "#101112", roughness: 0.46 } },
  stick: { negro: { color: "#151617", trim: "#111213", roughness: 0.53, metalness: 0.03, clearcoat: 0.02 } },
  cira: { chrome: { roughness: 0.17 }, gunmetal: { color: "#777a78", trim: "#5c605d", roughness: 0.29 }, oro: { color: "#ccba7a", trim: "#ac995c", roughness: 0.27 }, negro: { color: "#151618", trim: "#111214", roughness: 0.46 } },
  alexia: { chrome: { roughness: 0.115 }, oro: { color: "#c6ab64", trim: "#ac904d", roughness: 0.26 } },
  granada: { negro: { color: "#171819", trim: "#101112", roughness: 0.4, metalness: 0.06, clearcoat: 0.07 }, blanco: { color: "#f5f5f2", trim: "#e5e6e4", roughness: 0.36, metalness: 0.015, clearcoat: 0.1 } },
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

/* ------------------------------------------------------------------ Marti 1921 Cira Silicone Edition (em repouso: a ponteira encaixada) */
/** `ciraEngravedCylinder`: o cilindro com a gravação quadriculada em sulcos reais. */
function cilindroGravado(radius: number, height: number, columns: number, rows: number): THREE.BufferGeometry {
  const segments = columns * 6, levels = rows * 6, positions: number[] = [], indices: number[] = [], uv: number[] = [];
  for (let iy = 0; iy <= levels; iy++) for (let ix = 0; ix <= segments; ix++) {
    const u = ix / segments, v = iy / levels, fu = (ix % 6) / 6, fv = (iy % 6) / 6;
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv), t = Math.min(edge / 0.19, 1), relief = t * t * (3 - 2 * t);
    const r = radius - 0.42 * (1 - relief), angle = u * Math.PI * 2;
    positions.push(Math.sin(angle) * r, v * height, Math.cos(angle) * r); uv.push(u, v);
    if (ix < segments && iy < levels) { const a = iy * (segments + 1) + ix, b = a + 1, c = a + segments + 1, d = c + 1; indices.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
/** O arejador com os furos (InstancedMesh, como no HTML). */
function arejador(m: Materiais, pai: THREE.Object3D, r: number, y: number, raioFuro: number, alternado: boolean, nome: string): void {
  cyl(r, r, 0.5, m.aerator, pai, nome).position.y = y;
  const pts: number[][] = [];
  for (let x = -9; x <= 9; x += 1.65) for (let z = -9; z <= 9; z += 1.65) { const zz = z + (alternado ? (Math.round(x / 1.65) % 2) * 0.825 : 0); if (x * x + zz * zz < 88) pts.push([x, zz]); }
  const furos = new THREE.InstancedMesh(new THREE.CylinderGeometry(raioFuro, raioFuro, alternado ? 0.13 : 0.15, 8), m.hole, pts.length), mx = new THREE.Matrix4();
  pts.forEach(([x, z], i) => { mx.makeTranslation(x, y + 0.32, z); furos.setMatrixAt(i, mx); }); pai.add(furos);
}
function construirCira(m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = "Marti 1921 Cira Silicone Edition";
  lathe([[0, 0], [22.7, 0], [23.7, 0.35], [24, 1], [24, 7], [23.65, 8], [19.9, 8], [0, 8]], m.metal, grupo, "Cira · base Ø48");
  mesh(geometriaEmCache("cira-corpo", () => cilindroGravado(19.95, 239, 26, 48)), m.metal, grupo, "Cira · corpo com gravação quadriculada").position.y = 8;
  lathe([[19.5, 246.7], [20.3, 247], [20.5, 248], [20.5, 269], [20, 270], [11.45, 270], [11.45, 268]], m.metal, grupo, "Cira · colar superior a 270 mm");
  lathe([[19.6, 246.9], [20.52, 246.9], [20.52, 247.35], [19.6, 247.35]], m.trim, grupo, "Cira · união do colar");
  const neck = new THREE.Group(); neck.position.set(12, 166, 0); neck.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(neck);
  lathe([[0, 0], [18.7, 0], [19.1, 1], [19.1, 4], [17.8, 12], [17.8, 25], [0, 25]], m.metal, neck, "Cira · ligação lateral");
  const knob = new THREE.Group(); knob.position.set(36.5, 166, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe([[0, 0], [18.6, 0], [19.5, 1], [19.7, 2], [19.7, 22.5], [19.2, 24], [18.4, 24.6], [0, 24.6]], m.metal, knob, "Cira · comando lateral");
  lathe([[17.7, -0.35], [18.65, -0.35], [18.65, 0.1], [17.7, 0.1]], m.rubber, knob, "Cira · junta do comando");
  lathe([[0, 0], [2.75, 0], [3.0, 0.5], [3.0, 62], [2.8, 63], [0, 63.3]], m.metal, grupo, "Cira · pega vertical").position.set(50, 184, 0);
  const bica = new THREE.Group(); bica.name = "Cira · braço, encaixe e mangueira"; grupo.add(bica);
  const arm = mesh(geometriaEmCache("cira-braco", () => cilindroGravado(7.3, 183.5, 12, 37)), m.metal, bica, "Cira · braço metálico gravado");
  arm.position.set(0, 260, 18); arm.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, 0, 1));
  rod(V(0, 260, 199), V(0, 260, 207), 7.45, m.metal, bica, "Cira · ligação ao suporte");
  lathe([[14.05, 210], [14.45, 210.7], [14.45, 271.5], [14.15, 272.4], [12.0, 272.4], [11.85, 271.5], [11.85, 211], [12.1, 210], [14.05, 210]], m.metal, bica, "Cira · encaixe cilíndrico fixo").position.z = 220;
  lathe([[11.75, 212], [11.75, 271.8], [11.9, 271.8], [11.9, 212], [11.75, 212]], m.rubber, bica, "Cira · interior do encaixe").position.z = 220;
  const dock = V(0, 291, 220);
  const head = new THREE.Group(); head.name = "Cira · ponteira removível"; head.position.copy(dock); head.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, -1, 0)); bica.add(head);
  lathe([[11.3, 0], [14.1, 0], [14.45, 0.7], [14.45, 17.6], [14.0, 18.3], [11.4, 18.7], [11.4, 79.7], [10.8, 81], [10.25, 81], [10.25, 79]], m.metal, head, "Cira · ponteira metálica");
  lathe([[13.7, 18], [14.13, 18], [14.13, 18.35], [13.7, 18.35]], m.trim, head, "Cira · junta da ponteira");
  arejador(m, head, 10.4, 80.5, 0.42, false, "Cira · arejador");
  // `ciraCurve(ciraDock, 478.5, (0,-1,0))`: o contorno de repouso da mangueira em silicone
  const end = dock, peak = 478.5, direction = V(0, -1, 0);
  const upper = end.clone().addScaledVector(direction, -Math.min(79, Math.max(0, peak - end.y - 45))), crown = V(end.x * 0.44, peak, end.z * 0.5), right = V(0, peak - 113.5, 0);
  const curva = new THREE.CurvePath<THREE.Vector3>(); curva.add(new THREE.LineCurve3(V(0, 269.5, 0), right));
  curva.add(new THREE.CubicBezierCurve3(right, right.clone().add(V(0, 62, 0)), crown.clone().add(V(-end.x * 0.16, 0, -end.z * 0.277)), crown));
  curva.add(new THREE.CubicBezierCurve3(crown, crown.clone().add(V(end.x * 0.16, 0, end.z * 0.277)), upper.clone().addScaledVector(direction, -Math.min(60, (peak - upper.y) * 0.9)), upper));
  curva.add(new THREE.LineCurve3(upper, end));
  mesh(new THREE.TubeGeometry(curva, Math.round(240 * DETALHE.tuboSegmentos), 11.5, DETALHE.tuboRadial, false), m.silicone, bica, "Cira · mangueira preta em silicone");
  rodar(bica, o.bica);
  return { grupo, bica, puxar: null, materiais: m };
}

/* ------------------------------------------------------------------ GME IO Alexia e Marti 1921 Granada (abatíveis, na posição inicial) */
interface Abativel {
  nome: string; prefixo: string; base: number[][]; corpo: (x: number, y: number, z: number) => number; grelhaCorpo: Parameters<typeof bodyGeometry>[1];
  hingeX: number; hinge: (x: number, y: number, z: number) => number; seamX: number; casquilho: number[][]; linhaCasquilho?: number[][];
  inclinacao: number; saidaLocal: [number, number]; topo: number; curva: [number, number, number, number]; terminal: number[][]; junta: number[][]; raioFiltro: number;
  knob: [number, number[][], number[][]]; pega: [number[][], number, number, number]; indicador?: boolean;
}
function construirAbativel(a: Abativel, m: Materiais, o: OpcoesTorneira): TorneiraHtml {
  const grupo = new THREE.Group(); grupo.name = a.nome;
  lathe(a.base, m.metal, grupo, `${a.prefixo} · base de fixação`);
  mesh(corpo(`${a.prefixo}-corpo`, a.corpo, a.grelhaCorpo), m.metal, grupo, `${a.prefixo} · corpo horizontal e pedestal`);
  const fold = new THREE.Group(); fold.name = `${a.prefixo} · articulação`; fold.position.set(a.hingeX, 52, 0); grupo.add(fold);
  mesh(corpo(`${a.prefixo}-cabeca`, a.hinge, { step: 1.05, nx: 40, ny: 73, nz: 50, x0: -21, y0: -26, z0: -26 }), m.metal, fold, `${a.prefixo} · cabeça articulada`);
  const seam = lathe([[23.6, 0], [24.57, 0], [24.57, 0.42], [23.6, 0.42]], m.trim, grupo, `${a.prefixo} · junta da articulação`); seam.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); seam.position.set(a.seamX, 52, 0);
  lathe(a.casquilho, m.metal, fold, `${a.prefixo} · casquilho de rotação`);
  if (a.linhaCasquilho) lathe(a.linhaCasquilho, m.trim, fold, `${a.prefixo} · linha do casquilho`);
  const bica = new THREE.Group(); bica.name = `${a.prefixo} · bica giratória`; bica.position.y = 50; fold.add(bica);
  const ang = (a.inclinacao * Math.PI) / 180, dir = V(0, -Math.cos(ang), Math.sin(ang)), dock = V(0, a.saidaLocal[0], a.saidaLocal[1]).addScaledVector(dir, -18);
  const p = (y: number, z: number) => V(0, y - 102, z), [c1, c2, c3, c4] = a.curva;
  const caminho = new THREE.CurvePath<THREE.Vector3>();
  caminho.add(new THREE.LineCurve3(p(101.5, 0), p(293, 0)));
  caminho.add(new THREE.CubicBezierCurve3(p(293, 0), p(c1, 0), p(c2, c3), p(c2, c4)));
  // Alexia: um troço recto de 20 mm antes do terminal; Granada: o arco acaba no terminal
  const fimArco = a.prefixo === "Alexia" ? dock.clone().addScaledVector(dir, -20) : dock;
  const raio = (a.topo - fimArco.y) / (1 - Math.sin(ang)), topoFim = V(0, a.topo, fimArco.z - raio * Math.cos(ang)), alca = (4 / 3) * Math.tan(((90 - a.inclinacao) * Math.PI) / 720) * raio;
  caminho.add(new THREE.LineCurve3(p(c2, c4), topoFim));
  caminho.add(new THREE.CubicBezierCurve3(topoFim, topoFim.clone().add(V(0, 0, alca)), fimArco.clone().addScaledVector(dir, -alca), fimArco));
  if (fimArco !== dock) caminho.add(new THREE.LineCurve3(fimArco, dock));
  mesh(new THREE.TubeGeometry(caminho, Math.round(320 * DETALHE.tuboSegmentos), 12, DETALHE.tuboRadial, false), m.metal, bica, `${a.prefixo} · bica tubular`);
  const tip = new THREE.Group(); tip.name = `${a.prefixo} · terminal`; tip.position.copy(dock); tip.quaternion.setFromUnitVectors(V(0, 1, 0), dir); bica.add(tip);
  lathe(a.terminal, m.metal, tip, `${a.prefixo} · terminal e aro do arejador`);
  lathe(a.junta, m.trim, tip, `${a.prefixo} · união do terminal`);
  arejador(m, tip, a.raioFiltro, 17.4, 0.38, true, `${a.prefixo} · arejador`);
  const [kx, kp, kj] = a.knob, knob = new THREE.Group(); knob.position.set(kx, 52, 0); knob.quaternion.setFromUnitVectors(V(0, 1, 0), V(1, 0, 0)); grupo.add(knob);
  lathe(kp, m.metal, knob, `${a.prefixo} · comando lateral`); lathe(kj, m.rubber, knob, `${a.prefixo} · junta do comando`);
  const [pp, px, py, prz] = a.pega, pega = lathe(pp, m.metal, grupo, `${a.prefixo} · pega`); pega.position.set(px, py, 0); pega.rotation.z = (prz * Math.PI) / 180;
  if (a.indicador) { const ind = mesh(new THREE.SphereGeometry(1.75, 20, 12), m.rubber, grupo, `${a.prefixo} · indicador discreto`); ind.scale.y = 0.36; ind.position.set(70, 76.5, 0); }
  rodar(bica, o.bica);
  return { grupo, bica, puxar: null, materiais: m };
}
const ALEXIA: Abativel = {
  nome: "GME IO Alexia Abatível", prefixo: "Alexia", base: [[0, 0], [25.3, 0], [26, 0.4], [26, 6.3], [25.6, 7.1], [22.5, 7.5], [0, 7.5]],
  corpo: (x, y, z) => { const a = roundCylinder(Math.hypot(y - 52, z), x - 17, 24.5, 42, 0.8), b = roundCylinder(Math.hypot(x, z), y - 28, 22, 21.5, 0.8), h = Math.max(5 - Math.abs(a - b), 0) / 5; return Math.min(a, b) - h * h * 1.25; },
  grelhaCorpo: { step: 1.15, nx: 78, ny: 68, nz: 47, x0: -28, y0: 4, z0: -27 }, hingeX: -42,
  hinge: (x, y, z) => { const a = roundCylinder(Math.hypot(y, z), x + 1, 24.4, 18, 0.9), b = roundCylinder(Math.hypot(x, z), y - 29, 14.2, 19, 1), h = Math.max(4 - Math.abs(a - b), 0) / 4; return Math.min(a, b) - h * h; },
  seamX: -25.2, casquilho: [[12, 36.7], [14.2, 36.7], [14.45, 37.1], [14.45, 51.5], [14.15, 52.3], [12, 52.3]], linhaCasquilho: [[13.7, 37.3], [14.5, 37.3], [14.5, 37.55], [13.7, 37.55]],
  inclinacao: 5, saidaLocal: [157, 201], topo: 239, curva: [319.51, 341, 21.49, 48],
  terminal: [[11.9, 0], [12.05, 0.4], [12.05, 16.9], [11.8, 17.7], [10.7, 18], [10.3, 18], [10.3, 16.5]], junta: [[11.7, -0.18], [12.1, -0.18], [12.1, 0.1], [11.7, 0.1]], raioFiltro: 10.45,
  knob: [59, [[0, 0], [23.5, 0], [24.55, 0.9], [24.65, 2], [24.65, 22.9], [24.35, 24.1], [23.3, 25], [0, 25]], [[22.8, -0.5], [24, -0.5], [24, -0.08], [22.8, -0.08]]],
  pega: [[[0, 0], [3.6, 0], [4, 0.4], [4, 65.7], [3.6, 66.8], [2.9, 67.2], [0, 67.2]], 76, 75, 0],
};
const GRANADA: Abativel = {
  nome: "Marti 1921 Granada Abatível", prefixo: "Granada", base: [[0, 0], [25.3, 0], [26, 0.5], [26, 5.6], [25.4, 6.6], [22, 7], [0, 7]],
  corpo: (x, y, z) => { const a = roundCylinder(Math.hypot(y - 52, z), x - 17.5, 24.5, 44.5, 1.1), b = roundCylinder(Math.hypot(x, z), y - 28, 22, 21.5, 1.1), h = Math.max(5 - Math.abs(a - b), 0) / 5; return Math.min(a, b) - h * h * 1.25; },
  grelhaCorpo: { step: 1.15, nx: 84, ny: 69, nz: 47, x0: -30, y0: 3, z0: -27 }, hingeX: -44,
  hinge: (x, y, z) => { const a = roundCylinder(Math.hypot(y, z), x + 1, 24.4, 18, 1.1), b = roundCylinder(Math.hypot(x, z), y - 29, 14.15, 19, 1.1), h = Math.max(4.5 - Math.abs(a - b), 0) / 4.5; return Math.min(a, b) - h * h * 1.125; },
  seamX: -27.2, casquilho: [[12, 37], [14.1, 37], [14.3, 37.5], [14.3, 51.4], [13.8, 52], [12, 52]],
  inclinacao: 8, saidaLocal: [183, 195], topo: 231, curva: [315.0914, 333, 17.9086, 40],
  terminal: [[11.9, 0], [12.05, 0.4], [12.05, 16.8], [11.7, 17.7], [10.6, 18], [10.25, 18], [10.25, 16.3]], junta: [[11.7, -0.15], [12.09, -0.15], [12.09, 0.1], [11.7, 0.1]], raioFiltro: 10.4,
  knob: [62, [[0, 0], [23.3, 0], [24.4, 0.9], [24.6, 2], [24.6, 23], [24.2, 24.1], [23.2, 25], [0, 25]], [[22.8, -0.5], [23.9, -0.5], [23.9, -0.1], [22.8, -0.1]]],
  pega: [[[0, 0], [3.6, 0], [4, 0.4], [4, 65], [3.7, 66], [3.1, 66.5], [0, 66.5]], 77, 75, -3], indicador: true,
};

const CONSTRUTORES: Record<ModeloTorneira, (m: Materiais, o: OpcoesTorneira) => TorneiraHtml> = {
  round: construirRound, noah: construirNoah, smooth: construirSmooth, stick: construirStick, cira: construirCira,
  alexia: (m, o) => construirAbativel(ALEXIA, m, o), granada: (m, o) => construirAbativel(GRANADA, m, o),
};
export const modelosDeTorneira = (): ModeloTorneira[] => Object.keys(CONSTRUTORES) as ModeloTorneira[];
export const ehModeloTorneira = (id: string): id is ModeloTorneira => id in CONSTRUTORES;
/** Constrói uma torneira (em mm) para um acabamento e opções; as geometrias pesadas vêm do cache. */
export function construirTorneira(modelo: ModeloTorneira, acab: string, opcoes: OpcoesTorneira = {}): TorneiraHtml {
  return CONSTRUTORES[modelo](criarMateriais(acabamentoDaTorneira(modelo, acab)), opcoes);
}
