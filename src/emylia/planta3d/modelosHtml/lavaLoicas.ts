// Lava-loiças do catálogo de origem, portadas do HTML (geometria própria, em milímetros, y = 0 no topo do rebordo, as cubas para baixo, +z para a frente):
// Frasa Velar (inox, cuba R25, rebordo de 20 mm), Frasa Lody (PVD Gold, Cobre e Gunmetal, ralo de 24 ranhuras) e RODI Ambar (composto Magma mate, degrau,
// escorredor liso e tampas dos ralos que se retiram). As cubas são superfícies por anéis (sem CSG): paredes rebaixadas, fundo inclinado para a válvula.
import * as THREE from "three";
import { cyl, lathe, mesh, nomearMateriais, rounded } from "./util";

type Par = number[];
export type ModeloLavaLoica = string;
export interface OpcoesLavaLoica { /** retirar as tampas dos ralos (Ambar) */ tampas?: boolean; /** escorredor à esquerda (Keran) */ reverso?: boolean }
export interface LavaLoicaHtml { grupo: THREE.Group; tampas: THREE.Object3D[]; materiais: THREE.Material[] }

/* ------------------------------------------------------------------ dados dos modelos (as `*Specs` do HTML) */
// os dados estão em specs.ts (sem three), para a lista de produtos e a bancada os usarem sem carregar o three
import { AMBAR_SPECS, LODY_SPECS, VELAR_SPECS, roundLoop, type BowlAmbar, type SpecAmbar } from "./specs";
export { AMBAR_SPECS, LODY_SPECS, VELAR_SPECS, roundLoop };
export const LODY_ACABAMENTOS: Record<string, { color: string; trim: string; roughness: number; metalness: number; clearcoat: number }> = {
  oro: { color: "#c9ad68", trim: "#c2a25b", roughness: 0.3, metalness: 1, clearcoat: 0.055 }, cobre: { color: "#bc825b", trim: "#b77950", roughness: 0.3, metalness: 1, clearcoat: 0.055 },
  gunmetal: { color: "#62605e", trim: "#575553", roughness: 0.29, metalness: 1, clearcoat: 0.055 },
};
export const AMBAR_ACABAMENTOS: Record<string, { color: string; trim: string }> = { negro: { color: "#292c2d", trim: "#252829" }, gunmetal: { color: "#858988", trim: "#bfc4c7" }, blanco: { color: "#e5e5e1", trim: "#bfc4c7" } };

/* ------------------------------------------------------------------ materiais e auxiliares (sinkSteel, sinkPolish, sinkDark, roundLoop, sinkSurface...) */
export interface Mat { aco: THREE.MeshPhysicalMaterial; polido: THREE.MeshPhysicalMaterial; escuro: THREE.MeshStandardMaterial }
export const materiais = (): Mat => nomearMateriais({
  aco: new THREE.MeshPhysicalMaterial({ color: "#c3c7ca", metalness: 1, roughness: 0.3, clearcoat: 0.07, envMapIntensity: 1.05, side: THREE.DoubleSide }),
  polido: new THREE.MeshPhysicalMaterial({ color: "#cdd1d3", metalness: 1, roughness: 0.2, envMapIntensity: 1.1, side: THREE.DoubleSide }),
  escuro: new THREE.MeshStandardMaterial({ color: "#1c2428", roughness: 0.58, metalness: 0.45 }),
});
/** Os materiais da Lody num acabamento PVD: o corpo (`aco`) e os acessórios (`polido`) mudam de cor; o interior da válvula fica escuro. */
function materiaisLody(acab: string): Mat {
  const m = materiais(), f = LODY_ACABAMENTOS[acab] ?? LODY_ACABAMENTOS.oro;
  m.aco.envMapIntensity = 1.05; m.polido.envMapIntensity = 1.08;
  [m.aco, m.polido].forEach((mat, i) => { mat.color.set(i ? f.trim : f.color); mat.roughness = i ? f.roughness - 0.035 : f.roughness; mat.metalness = 1; mat.clearcoat = f.clearcoat; });
  return m;
}
/** Os materiais da Ambar: o composto mate (`corpo`) e as ferragens (`polido`) mudam com o acabamento. */
function materiaisAmbar(acab: string): Mat & { corpo: THREE.MeshPhysicalMaterial } {
  const m = materiais(), f = AMBAR_ACABAMENTOS[acab] ?? AMBAR_ACABAMENTOS.negro;
  const corpo = new THREE.MeshPhysicalMaterial({ color: f.color, metalness: 0, roughness: 0.58, clearcoat: 0, envMapIntensity: 0.65, side: THREE.DoubleSide });
  m.polido.color.set(f.trim); m.polido.metalness = acab === "negro" ? 0.3 : 1; m.polido.roughness = acab === "negro" ? 0.44 : 0.24;
  return nomearMateriais({ ...m, corpo });
}
/** Os materiais de uma lava-loiça Frasa/Ambar por nome (`aco`, `polido`, `escuro`, `corpo`), para os modelos pré-gerados (GLB) que não trazem materiais. */
export function materiaisDaLavaLoicaBase(modelo: ModeloLavaLoica, acab: string): Record<string, THREE.Material> {
  if (LODY_SPECS.some((s) => s.id === modelo)) return { ...materiaisLody(acab) };
  if (AMBAR_SPECS.some((s) => s.id === modelo)) return { ...materiaisAmbar(acab) };
  return { ...materiais() };
}
/** Uma superfície por anéis de pontos (x, y, z) consecutivos: as paredes e o fundo das cubas. */
export function sinkSurface(rings: Par[][], material: THREE.Material, parent: THREE.Object3D, name: string, reverse = false): THREE.Mesh {
  const p: number[] = [], ix: number[] = [], count = rings[0].length;
  for (const ring of rings) for (const v of ring) p.push(...v);
  for (let row = 0; row < rings.length - 1; row++) for (let j = 0; j < count; j++) {
    const a = row * count + j, b = row * count + ((j + 1) % count), c = a + count, d = b + count;
    if (reverse) ix.push(a, b, c, b, d, c); else ix.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals(); g.computeBoundingBox();
  return mesh(g, material, parent, name);
}
/** Subdivide o contorno do fundo por ângulo à volta do ralo, sem mexer no contorno exterior (evita cordas a cruzar a abertura). */
export function refineDrainLoop(edge: Par[], drainZ: number): Par[] {
  const result: Par[] = [], tau = Math.PI * 2, maxAngle = Math.PI / 96;
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length], az = a[2] - drainZ, bz = b[2] - drainZ, start = Math.atan2(az, a[0]), end = Math.atan2(bz, b[0]);
    const sweep = (end - start + tau) % tau, steps = Math.max(1, Math.ceil(sweep / maxAngle));
    for (let j = 0; j < steps; j++) {
      if (j === 0) { result.push(a.slice()); continue; }
      const angle = start + (sweep * j) / steps, rx = Math.cos(angle), rz = Math.sin(angle), dx = b[0] - a[0], dz = bz - az;
      const t = THREE.MathUtils.clamp(-(a[0] * rz - az * rx) / (dx * rz - dz * rx), 0, 1);
      result.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)]);
    }
  }
  return result;
}
export const caminhoForma = (loop: Par[]): THREE.Shape => { const p = new THREE.Shape(); loop.forEach(([x, z], i) => { if (i === 0) p.moveTo(x, -z); else p.lineTo(x, -z); }); p.closePath(); return p; };
export const caminhoFuro = (loop: Par[]): THREE.Path => { const p = new THREE.Path(); loop.forEach(([x, z], i) => { if (i === 0) p.moveTo(x, -z); else p.lineTo(x, -z); }); p.closePath(); return p; };
export function placa(outline: Par[], holes: Par[][], y: number, mat: THREE.Material, parent: THREE.Object3D, name: string): THREE.Mesh {
  const s = caminhoForma(outline); s.holes = holes.map(caminhoFuro);
  const o = mesh(new THREE.ShapeGeometry(s, 24), mat, parent, name); o.rotation.x = -Math.PI / 2; o.position.y = y; return o;
}
/** A válvula de cesta (`keranDrain` do HTML): aro, cesto perfurado, interior escuro e pega. */
export function valvulaDeCesta(parent: THREE.Object3D, depth: number, polido: THREE.Material, escuro: THREE.Material): THREE.Group {
  const drain = new THREE.Group(); drain.name = "Válvula de cesta"; drain.position.y = -depth + 200; parent.add(drain);
  lathe([[45, -200], [55, -198], [57.5, -197.4], [57.5, -196.8], [54.5, -196.5], [46, -198], [40, -203], [36.8, -207], [36.8, -213]], polido, drain, "Aro da válvula");
  const disk = new THREE.Shape(); disk.absarc(0, 0, 36.5, 0, Math.PI * 2, false);
  for (const [radius, count, holeRadius] of [[26, 18, 2.5], [17, 12, 2.1]]) for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * radius, Math.sin(a) * radius, holeRadius, 0, Math.PI * 2, true); disk.holes.push(h);
  }
  const basket = mesh(new THREE.ShapeGeometry(disk, 12), polido, drain, "Cesto perfurado"); basket.rotation.x = -Math.PI / 2; basket.position.y = -207;
  const dark = cyl(37, 37, 1, escuro, drain, "Interior da válvula"); dark.position.y = -213.5;
  lathe([[0, -207], [6.5, -207], [7, -206], [7, -201], [5.5, -200], [0, -200]], polido, drain, "Pega do cesto");
  return drain;
}

/* ------------------------------------------------------------------ Frasa Velar */
function construirVelar(spec: (typeof VELAR_SPECS)[number]): LavaLoicaHtml {
  const m = materiais(), g = new THREE.Group(); g.name = `Frasa Velar ${spec.size} U/F`;
  const w = spec.innerWidth, d = 400, drainZ = -70, ring = (rw: number, rd: number, r: number, y: number): Par[] => roundLoop(rw, rd, r).map(([x, z]) => [x, y, z]);
  sinkSurface([ring(spec.outerWidth, 440, 10, -1.2), ring(spec.outerWidth, 440, 10, -0.2), ring(spec.outerWidth - 0.6, 439.4, 9.7, 0), ring(w + 2, d + 2, 26, 0), ring(w, d, 25, -1.2)], m.aco, g, "Velar · aba 20 mm · exterior R10");
  const wall = [ring(w, d, 25, -1.2), ring(w, d, 25, -4), ring(w - 12, d - 12, 25, -169)];
  for (let i = 1; i <= 16; i++) { const a = (i / 16) * Math.PI / 2, shrink = 25 * (1 - Math.cos(a)); wall.push(ring(w - 12 - 2 * shrink, d - 12 - 2 * shrink, Math.max(8, 25 - shrink * 0.5), -169 - 25 * Math.sin(a))); }
  sinkSurface(wall, m.aco, g, "Velar · cuba R25 · profundidade 200");
  const edge = refineDrainLoop(wall[wall.length - 1], drainZ), floorRings: Par[][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, s = t * t * (3 - 2 * t);
    floorRings.push(edge.map(([x, , z]) => { const a = Math.atan2(z - drainZ, x), tx = 44.45 * Math.cos(a), tz = drainZ + 44.45 * Math.sin(a); return [THREE.MathUtils.lerp(x, tx, t), -194 - 6 * s, THREE.MathUtils.lerp(z, tz, t)]; }));
  }
  sinkSurface(floorRings, m.aco, g, "Velar · fundo inclinado para válvula");
  const drain = new THREE.Group(); drain.name = "Velar · válvula 3½ polegadas"; drain.position.z = drainZ; g.add(drain);
  lathe([[44.45, -200], [49, -196.7], [50, -196], [49.5, -195.8], [44, -197], [40, -202], [36.8, -207], [36.8, -213]], m.polido, drain, "Aro da válvula");
  const disk = new THREE.Shape(); disk.absarc(0, 0, 36.5, 0, Math.PI * 2, false);
  for (const [radius, count, holeRadius] of [[26, 18, 2.5], [17, 12, 2.1]]) for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * radius, Math.sin(a) * radius, holeRadius, 0, Math.PI * 2, true); disk.holes.push(h); }
  const cesto = mesh(new THREE.ShapeGeometry(disk, 12), m.polido, drain, "Cesto perfurado"); cesto.rotation.x = -Math.PI / 2; cesto.position.y = -207;
  cyl(37, 37, 1, m.escuro, drain, "Interior da válvula").position.y = -213.5;
  lathe([[0, -207], [6.5, -207], [7, -206], [7, -201], [5.5, -200], [0, -200]], m.polido, drain, "Pega do cesto");
  mesh(new THREE.ShapeGeometry(rounded(44, 8, 2.6), 12), m.polido, g, "Velar · espelho anti-inundação").position.set(0, -34, -198.8);
  mesh(new THREE.ShapeGeometry(rounded(32, 2.2, 1), 12), m.escuro, g, "Velar · abertura anti-inundação").position.set(0, -34, -198.4);
  return { grupo: g, tampas: [], materiais: [m.aco, m.polido, m.escuro] };
}

/* ------------------------------------------------------------------ Frasa Lody (PVD) */
function construirLody(spec: (typeof LODY_SPECS)[number], acab: string): LavaLoicaHtml {
  const m = materiaisLody(acab), g = new THREE.Group(); g.name = `Frasa Lody ${spec.size} U/F PVD`;
  const body = m.aco, fittings = m.polido;
  const w = spec.innerWidth, d = 400, r = spec.radius, drainZ = spec.drainZ, ring = (rw: number, rd: number, rr: number, y: number): Par[] => roundLoop(rw, rd, rr).map(([x, z]) => [x, y, z]);
  const floorHeight = (x: number, z: number) => -200 + 6 * (1 - Math.exp(-Math.max(0, Math.hypot(x, z - drainZ) - 44.45) / 80));
  const deck = rounded(spec.outerWidth, 440, 10), opening = rounded(w + 2, d + 2, r + 1); deck.holes.push(opening);
  mesh(new THREE.ShapeGeometry(deck, 24), body, g, "Lody · aba 20 mm · exterior R10").rotation.x = -Math.PI / 2;
  sinkSurface([ring(spec.outerWidth, 440, 10, -1.2), ring(spec.outerWidth, 440, 10, 0)], body, g, "Lody · espessura da aba");
  sinkSurface([ring(w + 2, d + 2, r + 1, 0), ring(w, d, r, -1.2)], body, g, "Lody · transição da abertura");
  const wall = [ring(w, d, r, -1.2), ring(w, d, r, -4), ring(w - 10, d - 10, r, -181)];
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * Math.PI / 2, shrink = 13 * (1 - Math.cos(a));
    wall.push(ring(w - 10 - 2 * shrink, d - 10 - 2 * shrink, Math.max(6, r - shrink * 0.5), -181 - 13 * Math.sin(a)).map(([x, y, z]) => [x, y + (floorHeight(x, z) + 194) * Math.pow(Math.sin(a), 3), z]));
  }
  sinkSurface(wall, body, g, "Lody · paredes da cuba");
  const edge = refineDrainLoop(wall[wall.length - 1], drainZ), floorRings: Par[][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    floorRings.push(edge.map(([x, , z]) => { const a = Math.atan2(z - drainZ, x), tx = 44.45 * Math.cos(a), tz = drainZ + 44.45 * Math.sin(a), px = THREE.MathUtils.lerp(x, tx, t), pz = THREE.MathUtils.lerp(z, tz, t); return [px, floorHeight(px, pz), pz]; }));
  }
  const bottom = sinkSurface(floorRings, body, g, "Lody · fundo com abertura circular");
  const positions = bottom.geometry.attributes.position, normals = bottom.geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) - drainZ, rho = Math.hypot(x, z), slope = 0.075 * Math.exp(-Math.max(0, rho - 44.45) / 80), n = new THREE.Vector3((-slope * x) / rho, 1, (-slope * z) / rho).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  normals.needsUpdate = true;
  const drain = new THREE.Group(); drain.name = "Lody · válvula PVD 3½ polegadas"; drain.position.z = drainZ; g.add(drain);
  lathe([[44.45, -200], [49, -196.7], [50, -196], [49.5, -195.8], [44, -197], [40, -202], [36.8, -207], [36.8, -213]], fittings, drain, "Lody · aro da válvula");
  const disk = new THREE.Shape(); disk.absarc(0, 0, 36.5, 0, Math.PI * 2, false);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2, h = new THREE.Path(), pts = [[-1.5, 20], [-1.5, 31], [1.5, 31], [1.5, 20]].map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
    h.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => h.lineTo(p[0], p[1])); h.closePath(); disk.holes.push(h);
  }
  const cesto = mesh(new THREE.ShapeGeometry(disk, 24), fittings, drain, "Lody · cesto com 24 ranhuras"); cesto.rotation.x = -Math.PI / 2; cesto.position.y = -207;
  cyl(37, 37, 1, m.escuro, drain, "Lody · interior escuro da válvula").position.y = -213.5;
  lathe([[0, -207], [6.5, -207], [7, -206], [7, -201], [5.5, -200], [0, -200]], fittings, drain, "Lody · pega do cesto");
  mesh(new THREE.ShapeGeometry(rounded(44, 12, 2), 16), fittings, g, "Lody · espelho anti-inundação").position.set(0, -32, -198.6);
  mesh(new THREE.ShapeGeometry(rounded(34, 2.4, 0.9), 16), m.escuro, g, "Lody · abertura anti-inundação").position.set(0, -28.2, -198.3);
  return { grupo: g, tampas: [], materiais: [body, fittings, m.escuro] };
}

/* ------------------------------------------------------------------ RODI Ambar (composto Magma mate) */
type BowlPos = BowlAmbar & { cx: number; cz: number };
function recessoAmbar(spec: SpecAmbar, bowls: BowlPos[]): Par[] {
  if (spec.drainer) {
    const first = bowls[0], l = first.cx - first.w / 2, r = first.cx + first.w / 2, end = spec.outerWidth / 2 - 37, p = new THREE.Shape();
    p.moveTo(l + 15, -200.6); p.lineTo(r - 15, -200.6); p.quadraticCurveTo(r, -200.6, r, -185.6); p.lineTo(r, -173); p.quadraticCurveTo(r, -164, r + 10, -164); p.lineTo(end - 10, -164); p.quadraticCurveTo(end, -164, end, -154);
    p.lineTo(end, 155); p.quadraticCurveTo(end, 165, end - 10, 165); p.lineTo(r + 10, 165); p.quadraticCurveTo(r, 165, r, 174); p.lineTo(r, 186.6); p.quadraticCurveTo(r, 200.6, r - 15, 200.6);
    p.lineTo(l + 15, 200.6); p.quadraticCurveTo(l, 200.6, l, 185.6); p.lineTo(l, -185.6); p.quadraticCurveTo(l, -200.6, l + 15, -200.6);
    return p.getPoints(24).map((q) => [q.x, q.y]);
  }
  if (spec.id === "ambar55") return roundLoop(515, 400, 15);
  if (spec.tapLedge) return roundLoop(500, 470, 15);
  const b = bowls[0];
  return roundLoop(b.w, b.d + (spec.step ? 20 : 0), 15).map(([x, z]) => [x + b.cx, z + b.cz]);
}
function cubaAmbar(b: BowlPos, parent: THREE.Group, index: number, mats: { body: THREE.Material; hardware: THREE.Material }, startY: number, drainer: boolean, escuro: THREE.Material, tampas: THREE.Object3D[]): void {
  const g = new THREE.Group(); g.name = `Ambar · cuba ${index + 1}`; g.position.set(b.cx, 0, b.cz); parent.add(g);
  const ring = (w: number, d: number, r: number, y: number): Par[] => roundLoop(w, d, r).map(([x, z]) => [x, y, z]);
  const fillet = b.w < 180 ? 5 : 12, draft = b.w < 180 ? 4 : 10;
  const floorHeight = (x: number, z: number) => -b.depth + 4 * (1 - Math.exp(-Math.max(0, Math.hypot(x - b.drainX, z - b.drainZ) - 45) / 65));
  const wall = [ring(b.w, b.d, 15, startY), ring(b.w - 1, b.d - 1, 15, startY - 3), ring(b.w - draft, b.d - draft, 15, -b.depth + fillet + 4)];
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * Math.PI / 2, shrink = fillet * (1 - Math.cos(a));
    wall.push(ring(b.w - draft - shrink * 2, b.d - draft - shrink * 2, Math.max(5, 15 - shrink * 0.5), -b.depth + 4 + fillet * (1 - Math.sin(a))).map(([x, y, z]) => [x, y + (floorHeight(x, z) + b.depth - 4) * Math.pow(Math.sin(a), 3), z]));
  }
  sinkSurface(wall, mats.body, g, "Ambar · paredes R15");
  const shifted = wall[wall.length - 1].map(([x, y, z]) => [x - b.drainX, y, z]), edge = refineDrainLoop(shifted, b.drainZ), rings: Par[][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    rings.push(edge.map(([x, y, z]) => { const a = Math.atan2(z - b.drainZ, x), px = b.drainX + THREE.MathUtils.lerp(x, 45 * Math.cos(a), t), pz = THREE.MathUtils.lerp(z, b.drainZ + 45 * Math.sin(a), t); return [px, i === 0 ? y : floorHeight(px, pz), pz]; }));
  }
  const bottom = sinkSurface(rings, mats.body, g, "Ambar · fundo aberto para válvula"), p = bottom.geometry.attributes.position, n = bottom.geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) - b.drainX, z = p.getZ(i) - b.drainZ, r = Math.hypot(x, z), s = (4 / 65) * Math.exp(-Math.max(0, r - 45) / 65), v = new THREE.Vector3((-s * x) / r, 1, (-s * z) / r).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  n.needsUpdate = true;
  const drain = valvulaDeCesta(g, b.depth, mats.hardware, escuro); drain.name = "Ambar · válvula com cesto"; drain.position.x = b.drainX; drain.position.z = b.drainZ;
  tampas.push(lathe([[0, -194], [58, -194], [60, -193], [60, -192], [57, -190.5], [0, -190.5]], mats.hardware, drain, "Ambar · tampa removível do ralo"));
  if (index === 0) {
    const overflow = mesh(new THREE.ShapeGeometry(rounded(38, 11, 2), 12), mats.hardware, g, "Ambar · anti-inundação"), slit = mesh(new THREE.ShapeGeometry(rounded(29, 3, 1), 12), escuro, g, "Ambar · abertura anti-inundação");
    if (drainer) { overflow.rotation.y = slit.rotation.y = -Math.PI / 2; overflow.position.set(b.w / 2 - 1.4, -35, 0); slit.position.set(b.w / 2 - 1.7, -35, 0); }
    else { overflow.position.set(0, -32, -b.d / 2 + 1.4); slit.position.set(0, -32, -b.d / 2 + 1.7); }
  }
}
function construirAmbar(spec: SpecAmbar, acab: string, o: OpcoesLavaLoica): LavaLoicaHtml {
  const m = materiaisAmbar(acab), g = new THREE.Group(); g.name = `RODI Ambar ${spec.size}`;
  const W = spec.outerWidth, D = spec.outerDepth, body = m.corpo, hardware = m.polido;
  const tampas: THREE.Object3D[] = [], bowls: BowlPos[] = spec.bowls.map((b) => ({ ...b, cx: -W / 2 + b.left + b.w / 2, cz: -D / 2 + b.top + b.d / 2 }));
  const recess = recessoAmbar(spec, bowls), startY = spec.step ? -12 : -1;
  placa(roundLoop(W, D, 10), [recess], 0, body, g, "Ambar · aba exterior R10");
  sinkSurface([-10, 0].map((y) => roundLoop(W, D, 10).map(([x, z]) => [x, y, z])), body, g, "Ambar · espessura exterior");
  sinkSurface([0, startY].map((y) => recess.map(([x, z]) => [x, y, z])), body, g, "Ambar · parede do degrau");
  if (spec.step) placa(recess, bowls.map((b) => roundLoop(b.w, b.d, 15).map(([x, z]) => [x + b.cx, z + b.cz])), startY, body, g, spec.drainer ? "Ambar · escorredor liso e degrau" : "Ambar · degrau interior");
  bowls.forEach((b, i) => cubaAmbar(b, g, i, { body, hardware }, startY, !!spec.drainer, m.escuro, tampas));
  for (const t of tampas) t.visible = !o.tampas;
  return { grupo: g, tampas, materiais: [body, hardware, m.aco, m.escuro] };
}

/* ------------------------------------------------------------------ registo */
export const modelosDeLavaLoica = (): string[] => [...VELAR_SPECS, ...LODY_SPECS, ...AMBAR_SPECS].map((s) => s.id);
export const ehModeloLavaLoica = (id: string): boolean => modelosDeLavaLoica().includes(id);
/** Constrói um lava-loiça (em mm): o modelo é o id da medida (velar50, lody70, ambar86…) e o acabamento o da família. */
export function construirLavaLoica(modelo: ModeloLavaLoica, acab: string, o: OpcoesLavaLoica = {}): LavaLoicaHtml {
  const v = VELAR_SPECS.find((s) => s.id === modelo); if (v) return construirVelar(v);
  const l = LODY_SPECS.find((s) => s.id === modelo); if (l) return construirLody(l, acab);
  const a = AMBAR_SPECS.find((s) => s.id === modelo); if (a) return construirAmbar(a, acab, o);
  throw new Error(`Modelo de lava-loiça desconhecido: ${modelo}`);
}
