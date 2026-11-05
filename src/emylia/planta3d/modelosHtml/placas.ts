// Placas do catálogo de origem, portadas do HTML (em milímetros; y = 0 é o plano de apoio na bancada, o corpo desce `under` mm): Indesit IB 65B60,
// RI 161 C, THP 642 e ING 61T; Whirlpool WL B1160 BF, AKT 8090/NE, GMAL 6422/IXL e GMWL 958/IXL. Vidro com bordo (indução e radiante) ou inox estampado com
// queimadores de coroa de alumínio, grelhas de varão, individuais ou de ferro fundido, e manípulos. A serigrafia (texto e zonas desenhadas num canvas) não se porta.
import * as THREE from "three";
import { V, cyl, lathe, mesh, rod, rounded } from "./util";
import { roundLoop, sinkSurface } from "./lavaLoicas";

type Queimador = [number, number, number] | [number, number, number, boolean];
export interface SpecPlaca {
  id: string; nominalWidth: number; brand: string; title: string; kind: "induction" | "radiant" | "gas"; glass?: boolean; outerWidth: number; outerDepth: number; plate: number; under: number;
  above?: number; cut: [number, number]; radius: number; zones: number; grate?: "wire" | "individual" | "cast"; knobs?: number[]; burners?: Queimador[];
}
export const HOB_SPECS: SpecPlaca[] = [
  { id: "ib65b60", nominalWidth: 600, brand: "Indesit", title: "IB 65B60 NE", kind: "induction", outerWidth: 590, outerDepth: 510, plate: 4, under: 50, cut: [560, 480], radius: 10, zones: 4 },
  { id: "ri161", nominalWidth: 600, brand: "Indesit", title: "RI 161 C (ES)", kind: "radiant", outerWidth: 580, outerDepth: 510, plate: 4, under: 42, cut: [560, 490], radius: 1, zones: 4 },
  { id: "thp642", nominalWidth: 600, brand: "Indesit", title: "THP 642 IX/I 1", kind: "gas", outerWidth: 580, outerDepth: 510, plate: 13, under: 38, above: 56, cut: [560, 480], radius: 10, zones: 4, grate: "wire", knobs: [-84, -28, 28, 84],
    burners: [[-160, -130, 37.5], [160, -130, 50], [-160, 75, 37.5], [160, 75, 27.5]] },
  { id: "ing61t", nominalWidth: 600, brand: "Indesit", title: "ING 61T", kind: "gas", glass: true, outerWidth: 590, outerDepth: 510, plate: 7, under: 42, above: 57, cut: [560, 480], radius: 2, zones: 4, grate: "individual", knobs: [-90, -30, 30, 90],
    burners: [[-145, -130, 37.5], [145, -130, 50], [-145, 75, 37.5], [145, 75, 27.5]] },
  { id: "wlb1160", nominalWidth: 600, brand: "Whirlpool", title: "WL B1160 BF", kind: "induction", outerWidth: 590, outerDepth: 510, plate: 4, under: 50, cut: [560, 480], radius: 2, zones: 4 },
  { id: "akt8090", nominalWidth: 600, brand: "Whirlpool", title: "AKT 8090/NE", kind: "radiant", outerWidth: 580, outerDepth: 510, plate: 4, under: 42, cut: [560, 490], radius: 6, zones: 4 },
  { id: "gmal6422", nominalWidth: 600, brand: "Whirlpool", title: "GMAL 6422/IXL", kind: "gas", outerWidth: 590, outerDepth: 510, plate: 7, under: 39, above: 52, cut: [560, 480], radius: 4, zones: 4, grate: "cast", knobs: [25, 88, 151, 214],
    burners: [[-145, -130, 37.5], [145, -130, 37.5], [-145, 70, 62, true], [145, 70, 27.5]] },
  { id: "gmwl958", nominalWidth: 900, brand: "Whirlpool", title: "GMWL 958/IXL", kind: "gas", outerWidth: 860, outerDepth: 510, plate: 7, under: 40, above: 52, cut: [840, 480], radius: 8.5, zones: 5, grate: "cast", knobs: [-235, -70, 40, 205, 315],
    burners: [[-270, -20, 64, true], [0, -135, 37.5], [0, 85, 37.5], [270, -135, 50], [270, 85, 27.5]] },
];
export interface PlacaHtml { grupo: THREE.Group; materiais: THREE.Material[] }
interface Mats { steel: THREE.MeshStandardMaterial; alloy: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; ceramic: THREE.MeshStandardMaterial; glass: THREE.MeshPhysicalMaterial }

function laje(w: number, d: number, r: number, bottom: number, height: number, mat: THREE.Material, parent: THREE.Object3D, name: string): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(rounded(w, d, r), { depth: height, bevelEnabled: false, curveSegments: 16, steps: 1 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bottom, 0); return mesh(geo, mat, parent, name);
}
function caixa(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D, name: string): THREE.Mesh {
  const o = mesh(new THREE.BoxGeometry(w, h, d), mat, parent, name); o.position.set(x, y, z); return o;
}
function queimador(spec: SpecPlaca, b: Queimador, index: number, m: Mats, parent: THREE.Object3D): void {
  const [x, z, r] = b, double = b.length > 3 && b[3] === true, g = new THREE.Group();
  g.name = `Queimador ${index + 1}${double ? " · dupla coroa" : ""}`; g.position.set(x, spec.plate, z); parent.add(g);
  lathe([[0, 0], [r + 17, 0], [r + 15, 1], [r + 10, 3], [r + 5, 9], [r, 10], [0, 10]], m.steel, g, "Base estampada");
  lathe([[0, 10], [r - 2, 10], [r - 2, 15], [r, 17], [r, 22], [r - 4, 24], [0, 24]], m.alloy, g, "Coroa de alumínio");
  const count = Math.round(r * 1.25);
  for (let j = 0; j < count; j++) { const a = (j / count) * Math.PI * 2, o = caixa(1.6, 4, 1.3, Math.sin(a) * (r - 0.2), 21, Math.cos(a) * (r - 0.2), m.dark, g, "Saída de gás"); o.rotation.y = a; }
  if (double) {
    lathe([[r - 17, 23], [r - 3, 23], [r, 24], [r, 27], [r - 3, 28], [r - 17, 28], [r - 17, 23]], m.iron, g, "Tampa anelar da coroa exterior");
    lathe([[0, 10], [23, 10], [25, 13], [25, 23], [0, 23]], m.alloy, g, "Coroa central");
    lathe([[0, 23], [26, 23], [28, 24], [28, 27], [25, 28], [0, 28]], m.iron, g, "Tampa central");
  } else lathe([[0, 23], [r, 23], [r + 2, 24], [r + 2, 27], [r - 1, 28], [0, 28]], m.iron, g, "Tampa do queimador");
  cyl(3.5, 3.5, 14, m.ceramic, g, "Isqueiro cerâmico", 16).position.set(r + 7, 14, 5);
  cyl(1, 1, 4, m.alloy, g, "Elétrodo", 12).position.set(r + 7, 23, 5);
  cyl(2, 2, 18, m.alloy, g, "Termopar", 12).position.set(-r - 7, 14, 5);
}
function barra(a: number[], b: number[], width: number, height: number, mat: THREE.Material, parent: THREE.Object3D, name: string): THREE.Mesh {
  const dx = b[0] - a[0], dz = b[2] - a[2], o = caixa(Math.hypot(dx, dz), height, width, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, mat, parent, name);
  o.rotation.y = -Math.atan2(dz, dx); return o;
}
function grelhas(spec: SpecPlaca, iron: THREE.Material, parent: THREE.Object3D): void {
  const g = new THREE.Group(); g.name = "Grelhas"; parent.add(g);
  const top = spec.above ?? 0, h = spec.grate === "wire" ? 6 : 10, y = top - h / 2, queimadores = spec.burners ?? [];
  const rail = (x: number, z: number, a: number, b: number, w = 8) => (spec.grate === "wire" ? rod(V(x, y, z), V(a, y, b), 3, iron, g, "Varão esmaltado") : barra([x, y, z], [a, y, b], w, h, iron, g, "Barra de ferro fundido"));
  const frame = (x0: number, x1: number, z0: number, z1: number) => { rail(x0, z0, x1, z0); rail(x1, z0, x1, z1); rail(x1, z1, x0, z1); rail(x0, z1, x0, z0); };
  if (spec.grate === "wire") {
    for (const [a, b] of [[-272, -4], [4, 272]]) frame(a, b, -232, 157);
    for (const [x, z] of queimadores) { rail(x, -232, x, 157, 6); rail(x < 0 ? -272 : 4, z, x < 0 ? -4 : 272, z, 6); }
    rail(-272, -35, 272, -35, 6);
  } else if (spec.grate === "individual") {
    for (const [x, z] of queimadores) {
      const low = spec.plate + 16, half = 73;
      for (const [a, b] of [[[x - half, low, z - half], [x + half, low, z - half]], [[x + half, low, z - half], [x + half, low, z + half]], [[x + half, low, z + half], [x - half, low, z + half]], [[x - half, low, z + half], [x - half, low, z - half]]]) barra(a, b, 9, 8, iron, g, "Arco inferior da grelha");
      rail(x - 88, z, x + 88, z, 9); rail(x, z - 94, x, z + 94, 9);
      for (const [a, b] of [[x - half, z], [x + half, z], [x, z - half], [x, z + half]]) caixa(9, y - low, 9, a, low + (y - low) / 2, b, iron, g, "Apoio da cruz");
      for (const [a, b] of [[x - half, z - half], [x + half, z + half]]) caixa(9, 16, 9, a, spec.plate + 8, b, iron, g, "Pé da grelha");
    }
  } else {
    const sections = spec.zones === 5 ? [[-405, -139], [-133, 133], [139, 405]] : [[-272, -4], [4, 272]];
    for (const [a, b] of sections) frame(a, b, -232, 155);
    for (const [x, z, r] of queimadores) {
      const [a, b] = sections.find(([l, rr]) => x >= l && x <= rr) as number[], stop = r * 0.52;
      const row = queimadores.filter((v) => v[0] === x).sort((p, q) => p[1] - q[1]), index = row.findIndex((v) => v[1] === z);
      const start = index === 0 ? -232 : (row[index - 1][1] + z) / 2, end = index === row.length - 1 ? 155 : (row[index + 1][1] + z) / 2;
      rail(a, z, x - stop, z, 10); rail(x + stop, z, b, z, 10); rail(x, start, x, z - stop, 10); rail(x, z + stop, x, end, 10);
      if (index < row.length - 1) rail(a, end, b, end, 8);
    }
  }
  if (spec.grate !== "individual") for (const x of spec.zones === 5 ? [-397, -143, 143, 397] : [-260, -8, 8, 260]) for (const z of [-222, 145]) caixa(9, top - spec.plate - h, 10, x, spec.plate + (top - spec.plate - h) / 2, z, iron, g, "Pé da grelha");
}

/**
 * As zonas de cozedura marcadas no vidro (indução e radiante), em linha fina: uma versão simples da serigrafia do HTML (que desenha texto e símbolos
 * num canvas, o que aqui não se porta). Posições e raios do HTML: círculos nas radiantes e contornos arredondados na IB 65B60.
 */
function marcasNoVidro(spec: SpecPlaca, g: THREE.Group): void {
  const mat = new THREE.MeshBasicMaterial({ color: "#b0b5b7", transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const y = spec.plate + 0.06, e = 0.85;
  const anel = (x: number, z: number, r: number) => { const o = mesh(new THREE.RingGeometry(r - e, r, 64), mat, g, "Serigrafia · zona"); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); };
  const contorno = (x: number, z: number, w: number, d: number, r: number) => {
    const s = rounded(w, d, r); s.holes.push(rounded(w - 2 * e, d - 2 * e, Math.max(0.1, r - e)));
    const o = mesh(new THREE.ShapeGeometry(s, 12), mat, g, "Serigrafia · zona"); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z);
  };
  if (spec.kind === "radiant") for (const [x, z, r] of [[-130, -110, 105], [-145, 113, 90], [165, -145, 72.5], [165, 55, 72.5]]) anel(x, z, r);
  else if (spec.id === "ib65b60") { contorno(-137, -122, 210, 210, 35); contorno(-137, 92, 150, 150, 28); contorno(133, -22, 180, 397, 42); }
  else if (spec.id === "wlb1160") { anel(135, -115, 105); anel(135, 98, 75); anel(-135, -20, 100); }
}

/** Constrói uma placa (em mm). O acabamento só muda nas placas de vidro (ING 61T: preto ou branco). */
export function construirPlaca(modelo: string, acab: string): PlacaHtml {
  const spec = HOB_SPECS.find((s) => s.id === modelo);
  if (!spec) throw new Error(`Modelo de placa desconhecido: ${modelo}`);
  const g = new THREE.Group(), gas = spec.kind === "gas"; g.name = `${spec.brand} ${spec.title}`;
  const m: Mats = {
    steel: new THREE.MeshStandardMaterial({ color: "#b6babe", metalness: 0.94, roughness: 0.3, envMapIntensity: 0.8 }), alloy: new THREE.MeshStandardMaterial({ color: "#959da2", metalness: 0.86, roughness: 0.38 }),
    iron: new THREE.MeshStandardMaterial({ color: "#202326", metalness: 0.12, roughness: 0.7 }), dark: new THREE.MeshStandardMaterial({ color: "#101417", roughness: 0.84 }),
    ceramic: new THREE.MeshStandardMaterial({ color: "#dddcd4", roughness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#080b0d", metalness: 0, roughness: 0.16, clearcoat: 0.75, clearcoatRoughness: 0.13, envMapIntensity: 0.32 }),
  };
  if (spec.glass) m.glass.color.set(acab === "blanco" ? "#f0f2f2" : "#080b0d");
  laje(spec.cut[0] - 8, spec.cut[1] - 8, 9, -spec.under, spec.under - 1, m.alloy, g, "Caixa inferior de encastre");
  for (const x of [-spec.cut[0] / 2 + 22, spec.cut[0] / 2 - 22]) for (const z of [-spec.cut[1] / 2 + 25, spec.cut[1] / 2 - 25]) cyl(3, 3, 1, m.dark, g, "Parafuso inferior", 12).position.set(x, -spec.under - 0.5, z);
  if (!gas || spec.glass) laje(spec.outerWidth, spec.outerDepth, spec.radius, 0, spec.plate, m.glass, g, "Vidro · bordo exterior");
  if (!gas) marcasNoVidro(spec, g);
  else {
    const w = spec.outerWidth, d = spec.outerDepth;
    sinkSurface([roundLoop(w, d, spec.radius).map(([x, z]) => [x, 0, z]), roundLoop(w, d, spec.radius).map(([x, z]) => [x, spec.plate - 1, z]), roundLoop(w - 3, d - 3, spec.radius).map(([x, z]) => [x, spec.plate, z]),
      roundLoop(w - 22, d - 85, 12).map(([x, z]) => [x, spec.plate, z - 30]), roundLoop(w - 34, d - 97, 12).map(([x, z]) => [x, 1.5, z - 30])], m.steel, g, "Inox · aro e rebaixo estampado");
    laje(w - 34, d - 97, 12, 0, 1.5, m.steel, g, "Fundo estampado").position.z = -30;
  }
  if (gas) {
    (spec.burners ?? []).forEach((b, i) => queimador(spec, b, i, m, g)); grelhas(spec, m.iron, g);
    (spec.knobs ?? []).forEach((x, i) => {
      const knob = new THREE.Group(); knob.name = `Comando ${i + 1}`; knob.position.set(x, spec.plate, 208); g.add(knob);
      lathe([[0, 0], [19, 0], [20, 1], [20, 3], [17, 5], [16, 20], [14, 22], [0, 22]], m.steel, knob, "Manípulo inox");
      if (spec.glass) caixa(8, 9, 24, 0, 24, -2, m.steel, knob, "Pega superior");
      caixa(1.3, 0.3, 8, 0, spec.glass ? 28.6 : 22.1, -7, m.dark, knob, "Índice do manípulo");
    });
  } else for (const x of [-180, 180]) for (let z = -150; z <= 150; z += 17) caixa(42, 0.2, 4, x, -spec.under - 0.2, z, m.dark, g, "Grelha inferior de ventilação");
  const marcas: THREE.Material[] = []; g.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh && x.name === "Serigrafia · zona" && !marcas.includes(x.material as THREE.Material)) marcas.push(x.material as THREE.Material); });
  return { grupo: g, materiais: [...Object.values(m), ...marcas] };
}
export const modelosDePlaca = (): string[] => HOB_SPECS.map((s) => s.id);
export const ehModeloPlaca = (id: string): boolean => HOB_SPECS.some((s) => s.id === id);
