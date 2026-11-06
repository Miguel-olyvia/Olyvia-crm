// Lava-loiças RODI do catálogo de origem, portadas do HTML (milímetros, y = 0 no topo): Keran (cuba principal R95, escorredor com 5 canais e nervuras,
// reversível), UNA (degrau de acessórios, ponte de 20 mm, válvula estampada) e Cubas individuais (Brasília, Bahia, Laguna, Belém, Duo 60 e Duo 80).
import * as THREE from "three";
import { cyl, lathe, mesh, nomearMateriais, rounded } from "./util";
import { caminhoForma, caminhoFuro, materiais, placa, refineDrainLoop, roundLoop, sinkSurface, valvulaDeCesta } from "./lavaLoicas";

type Par = number[];
export interface RodiHtml { grupo: THREE.Group; materiais: THREE.Material[] }
export interface OpcoesRodi { /** Keran: escorredor à esquerda em vez de à direita */ reverso?: boolean }

import { CUBAS_SPECS, KERAN_SPECS, UNA_SPECS, type CubaCubas, type CubaKeran } from "./specs";
export { CUBAS_SPECS, KERAN_SPECS, UNA_SPECS };
export const modelosRodi = (): string[] => [...KERAN_SPECS, ...UNA_SPECS, ...CUBAS_SPECS].map((s) => s.id);
export const ehModeloRodi = (id: string): boolean => modelosRodi().includes(id);

const aco = (cor: string, rough: number, clear: number, env: number) => new THREE.MeshPhysicalMaterial({ color: cor, metalness: 1, roughness: rough, clearcoat: clear, envMapIntensity: env, side: THREE.DoubleSide });
/** Os materiais de uma RODI por nome: a chapa da família (`chapa`) e os comuns (`aco`, `polido`, `escuro`). Também usados pelos GLB pré-gerados. */
export function materiaisRodi(modelo: string): { chapa: THREE.MeshPhysicalMaterial; aco: THREE.MeshPhysicalMaterial; polido: THREE.MeshPhysicalMaterial; escuro: THREE.MeshStandardMaterial } {
  const chapa = KERAN_SPECS.some((s) => s.id === modelo) ? aco("#c6c8ca", 0.22, 0.12, 1.08) : UNA_SPECS.some((s) => s.id === modelo) ? aco("#c8cbce", 0.23, 0.08, 1.06) : aco("#c8cbcd", 0.23, 0.09, 1.06);
  return nomearMateriais({ chapa, ...materiais() });
}
const ring = (w: number, d: number, r: number, y: number, n = 24): Par[] => roundLoop(w, d, r, n).map(([x, z]) => [x, y, z]);

/* ------------------------------------------------------------------ RODI Keran */
function cubaKeran(b: CubaKeran & { cx: number }, parent: THREE.Group, index: number, steel: THREE.Material, polido: THREE.Material, escuro: THREE.Material): void {
  const g = new THREE.Group(); g.name = `Keran · cuba ${index + 1}`; g.position.x = b.cx; parent.add(g);
  const rr = (w: number, d: number, r: number, y: number) => ring(w, d, Math.min(r, w / 2 - 0.1, d / 2 - 0.1), y);
  const baseRadius = Math.max(30, b.r - 23), fillet = b.w < 200 ? 8 : 22, inset = b.w < 200 ? 18 : 30, upperInset = inset - 6;
  const wall = [rr(b.w, b.d, b.r, -4), rr(b.w - 4, b.d - 4, b.r - 2, -7), rr(b.w - 12, b.d - 12, b.r - 6, -13), rr(b.w - upperInset, b.d - upperInset, b.r - upperInset / 2, -25), rr(b.w - inset, b.d - inset, baseRadius, -b.depth + fillet + 6)];
  for (let i = 1; i <= 16; i++) { const a = (i / 16) * Math.PI / 2, shrink = fillet * (1 - Math.cos(a)); wall.push(rr(b.w - inset - 2 * shrink, b.d - inset - 2 * shrink, baseRadius - shrink * 0.65, -b.depth + 6 + fillet * (1 - Math.sin(a)))); }
  sinkSurface(wall, steel, g, "Keran · parede da cuba");
  const shifted = wall[wall.length - 1].map(([x, y, z]) => [x - b.drainX, y, z]), edge = refineDrainLoop(shifted, 0), floorRings: Par[][] = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, s = t * t * (3 - 2 * t); floorRings.push(edge.map(([x, , z]) => { const a = Math.atan2(z, x); return [b.drainX + THREE.MathUtils.lerp(x, 45 * Math.cos(a), t), -b.depth + 6 * (1 - s), THREE.MathUtils.lerp(z, 45 * Math.sin(a), t)]; })); }
  sinkSurface(floorRings, steel, g, "Keran · fundo com abertura circular");
  valvulaDeCesta(g, b.depth, polido, escuro).position.x = b.drainX;
  if (index === 0) for (let i = 0; i < 3; i++) { const slot = mesh(new THREE.ShapeGeometry(rounded(2.1, 20, 1), 8), escuro, g, "Keran · anti-inundação"); slot.rotation.y = -Math.PI / 2; slot.position.set(b.w / 2 - 7, -17 - i * 5.5, 0); }
}
function construirKeran(spec: (typeof KERAN_SPECS)[number], o: OpcoesRodi): RodiHtml {
  const m = materiaisRodi(spec.id), steel = m.chapa, g = new THREE.Group(); g.name = `RODI Keran ${spec.size}`;
  const W = spec.outerWidth, D = 500;
  sinkSurface([ring(W, D, 10, -1.2), ring(W, D, 10, -0.3), ring(W - 1, D - 1, 9.5, 0), ring(W - 8, D - 8, 10, -1.1), ring(W - 16, D - 16, 14, -1.2), ring(W - 32, D - 32, 24, -4), ring(W - 40, D - 40, 30, -4)], steel, g, "Keran · rebordo exterior R10");
  const bowls = spec.bowls.map((b) => ({ ...b, cx: -W / 2 + b.left + b.w / 2 })), holes: Par[][] = bowls.map((b) => roundLoop(b.w, b.d, b.r).map(([x, z]) => [x + b.cx, z]));
  const last = bowls[bowls.length - 1], drainerStart = last.cx + last.w / 2 + 32, drainerEnd = W / 2 - 44, ribWidth = drainerEnd - drainerStart, ribCenter = (drainerStart + drainerEnd) / 2;
  for (let i = 0; i < 5; i++) {
    const z = -110 + i * 55;
    holes.push(roundLoop(ribWidth, 20, 5).map(([x, d]) => [x + ribCenter, z + d]));
    const rings = ([[ribWidth, 20, 5, -4], [ribWidth - 2, 18, 4, -4.5], [ribWidth - 5, 15, 3, -6.7], [ribWidth - 7, 13, 2.5, -7.2]] as number[][]).map(([w, d, r, y]) => roundLoop(w, d, r).map(([x, dz]) => [x + ribCenter, y, z + dz]));
    sinkSurface(rings, steel, g, `Keran · canal ${i + 1}`);
    placa(roundLoop(ribWidth - 7, 13, 2.5).map(([x, d]) => [x + ribCenter, z + d]), [], -7.2, steel, g, `Keran · fundo do canal ${i + 1}`);
  }
  const shoulderLeft = bowls.length === 2 && last.w === 160 ? bowls[0].cx + bowls[0].w / 2 - 24 : last.cx + last.w / 2 - 24;
  for (const sign of [-1, 1]) {
    const outline: Par[] = [[shoulderLeft, sign * 228], [W / 2 - 52, sign * 228], [W / 2 - 28, sign * 214], [shoulderLeft + 45, sign * 156], [shoulderLeft + 29, sign * 162]];
    holes.push(outline);
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cz = outline.reduce((s, p) => s + p[1], 0) / outline.length, inner = outline.map(([x, z]) => [cx + (x - cx) * 0.985, cz + (z - cz) * 0.93]);
    sinkSurface([outline.map(([x, z]) => [x, -4, z]), inner.map(([x, z]) => [x, -1.3, z])], steel, g, "Keran · nervura diagonal");
    placa(inner, [], -1.3, steel, g, "Keran · ombro estampado");
  }
  if (spec.size === 116) {
    const mid = (bowls[0].cx + bowls[0].w / 2 + bowls[1].cx - bowls[1].w / 2) / 2;
    for (const sign of [-1, 1]) {
      const outline: Par[] = [[mid - 58, sign * 228], [mid + 58, sign * 228], [mid + 16, sign * 165], [mid - 16, sign * 165]];
      holes.push(outline);
      const inner = outline.map(([x, z]) => [mid + (x - mid) * 0.94, sign * 200 + (z - sign * 200) * 0.94]);
      sinkSurface([outline.map(([x, z]) => [x, -4, z]), inner.map(([x, z]) => [x, -1.3, z])], steel, g, "Keran · reforço entre cubas");
      placa(inner, [], -1.3, steel, g, "Keran · ombro central");
    }
  }
  placa(roundLoop(W - 40, D - 40, 30), holes, -4, steel, g, "Keran · chapa com cubas e canais abertos");
  bowls.forEach((b, i) => cubaKeran(b, g, i, steel, m.polido, m.escuro));
  if (o.reverso) g.rotation.y = Math.PI; // escorredor à esquerda
  return { grupo: g, materiais: [steel, m.aco, m.polido, m.escuro] };
}

/* ------------------------------------------------------------------ RODI UNA */
function valvulaUna(parent: THREE.Object3D, depth: number, steel: THREE.Material, polido: THREE.Material, escuro: THREE.Material): void {
  const drain = new THREE.Group(); drain.name = "UNA · válvula estampada"; drain.position.z = -80; parent.add(drain);
  lathe([[45, -depth], [43.5, -depth - 0.2], [41, -depth - 1.2], [38, -depth - 4], [36.8, -depth - 7], [36.8, -depth - 14]], steel, drain, "UNA · rebaixo integrado da válvula");
  const disk = new THREE.Shape(); disk.absarc(0, 0, 36.5, 0, Math.PI * 2, false);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2, h = new THREE.Path(), loop = roundLoop(3, 11, 1.5, 8).map(([x, z]) => [x * Math.cos(angle) - (z + 27) * Math.sin(angle), x * Math.sin(angle) + (z + 27) * Math.cos(angle)]);
    loop.reverse().forEach(([x, y], j) => (j ? h.lineTo(x, y) : h.moveTo(x, y))); h.closePath(); disk.holes.push(h);
  }
  const cesto = mesh(new THREE.ShapeGeometry(disk, 16), polido, drain, "UNA · cesto com fendas abertas"); cesto.rotation.x = -Math.PI / 2; cesto.position.y = -depth - 7;
  lathe([[36.5, -depth - 7], [36.5, -depth - 6.2], [35, -depth - 5.5], [33, -depth - 6], [32.5, -depth - 7]], polido, drain, "UNA · orla do cesto");
  lathe([[0, -depth - 7], [12, -depth - 7], [13, -depth - 5.5], [13, -depth - 3], [11, -depth - 1.5], [0, -depth - 1.5]], polido, drain, "UNA · botão da válvula");
  cyl(36.6, 36.6, 1, escuro, drain, "UNA · interior da válvula").position.y = -depth - 14;
}
function cubaUna(b: { w: number; depth: number; cx: number }, parent: THREE.Group, index: number, steel: THREE.Material, polido: THREE.Material, escuro: THREE.Material): void {
  const g = new THREE.Group(); g.name = `UNA · cuba ${index + 1}`; g.position.x = b.cx; parent.add(g);
  const seat = [ring(b.w, 400, 25, -0.6), ring(b.w - 0.8, 399.2, 24.6, -1.2), ring(b.w - 2, 398, 24, -3), ring(b.w - 2, 398, 24, -12), ring(b.w - 2, 397, 23.5, -14), ring(b.w - 2, 382, 23.5, -14), ring(b.w - 2, 380, 23.5, -15.5)];
  sinkSurface(seat, steel, g, "UNA · degrau para acessórios");
  const fillet = 18, wall = [seat[seat.length - 1], ring(b.w - 4, 378, 23, -18), ring(b.w - 10, 372, 23, -b.depth + fillet + 5)];
  for (let i = 1; i <= 16; i++) { const a = (i / 16) * Math.PI / 2, shrink = fillet * (1 - Math.cos(a)); wall.push(ring(b.w - 10 - 2 * shrink, 372 - 2 * shrink, Math.max(10, 23 - shrink * 0.5), -b.depth + 5 + fillet * (1 - Math.sin(a)))); }
  sinkSurface(wall, steel, g, "UNA · paredes da cuba");
  const edge = refineDrainLoop(wall[wall.length - 1], -80), floorRings: Par[][] = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, s = t * t * (3 - 2 * t); floorRings.push(edge.map(([x, , z]) => { const a = Math.atan2(z + 80, x); return [THREE.MathUtils.lerp(x, 45 * Math.cos(a), t), -b.depth + 5 * (1 - s), THREE.MathUtils.lerp(z, -80 + 45 * Math.sin(a), t)]; })); }
  sinkSurface(floorRings, steel, g, "UNA · fundo com abertura circular");
  valvulaUna(g, b.depth, steel, polido, escuro);
  mesh(new THREE.ShapeGeometry(rounded(88, 4.5, 2), 12), polido, g, "UNA · espelho anti-inundação").position.set(0, -29, -188.1);
  mesh(new THREE.ShapeGeometry(rounded(78, 1.8, 0.8), 12), escuro, g, "UNA · abertura anti-inundação").position.set(0, -29, -187.9);
}
function construirUna(spec: (typeof UNA_SPECS)[number]): RodiHtml {
  const m = materiaisRodi(spec.id), steel = m.chapa, g = new THREE.Group(); g.name = `RODI UNA ${spec.size}`;
  const W = spec.outerWidth;
  sinkSurface([ring(W, 440, 10, -1.2), ring(W, 440, 10, -0.3), ring(W - 0.6, 439.4, 9.7, 0)], steel, g, "UNA · aresta exterior R10");
  const bowls = spec.bowls.map((b) => ({ ...b, cx: -W / 2 + b.left + b.w / 2 })), outer = caminhoForma(roundLoop(W - 0.6, 439.4, 9.7));
  outer.holes = bowls.map((b) => caminhoFuro(roundLoop(b.w, 400, 25).map(([x, z]) => [x + b.cx, z])));
  const deck = mesh(new THREE.ShapeGeometry(outer, 24), steel, g, "UNA · aba monobloco e ponte 20 mm"); deck.rotation.x = -Math.PI / 2; deck.position.y = -0.6;
  bowls.forEach((b, i) => cubaUna(b, g, i, steel, m.polido, m.escuro));
  return { grupo: g, materiais: [steel, m.aco, m.polido, m.escuro] };
}

/* ------------------------------------------------------------------ RODI Cubas individuais */
function contornoCubas(spec: (typeof CUBAS_SPECS)[number]): Par[] {
  if (spec.id !== "duo60") return roundLoop(spec.outerWidth, spec.outerDepth, spec.outerRadius, 32);
  const p = new THREE.Shape(); p.moveTo(50, 0); p.lineTo(350, 0);
  p.absarc(350, 50, 50, -Math.PI / 2, 0, false); p.lineTo(400, 54); p.absarc(450, 54, 50, Math.PI, Math.PI / 2, true); p.lineTo(521, 104); p.absarc(521, 154, 50, -Math.PI / 2, 0, false); p.lineTo(571, 400);
  p.absarc(521, 400, 50, 0, Math.PI / 2, false); p.lineTo(50, 450); p.absarc(50, 400, 50, Math.PI / 2, Math.PI, false); p.lineTo(0, 50); p.absarc(50, 50, 50, Math.PI, Math.PI * 1.5, false); p.closePath();
  const loop = p.getPoints(32); loop.pop(); return loop.map((v) => [v.x - 571 / 2, v.y - 450 / 2]);
}
function cubaCubas(b: CubaCubas & { cx: number; cz: number }, parent: THREE.Group, index: number, duo: boolean, steel: THREE.Material, polido: THREE.Material, escuro: THREE.Material): void {
  const g = new THREE.Group(); g.name = `Cubas RODI · cuba ${index + 1}`; g.position.set(b.cx, 0, b.cz); parent.add(g);
  const r32 = (w: number, d: number, r: number, y: number) => ring(w, d, r, y, 32), small = b.w < 200, inset = small ? 8 : 12, fillet = small ? 10 : 25;
  const wall = [r32(b.w, b.d, b.r, -0.6), r32(b.w - 1, b.d - 1, b.r - 0.5, -1), r32(b.w - 3, b.d - 3, b.r - 1.5, -3), r32(b.w - 6, b.d - 6, b.r - 3, -9), r32(b.w - inset, b.d - inset, b.r - inset / 2, -b.depth + fillet + 5)];
  for (let i = 1; i <= 20; i++) { const a = (i / 20) * Math.PI / 2, shrink = fillet * (1 - Math.cos(a)); wall.push(r32(b.w - inset - 2 * shrink, b.d - inset - 2 * shrink, b.r - inset / 2 - shrink * 0.8, -b.depth + 5 + fillet * (1 - Math.sin(a)))); }
  sinkSurface(wall, steel, g, "RODI · cuba monoestampada");
  const shifted = wall[wall.length - 1].map(([x, y, z]) => [x - b.drainX, y, z]), edge = refineDrainLoop(shifted, b.drainZ), floorRings: Par[][] = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, s = t * t * (3 - 2 * t); floorRings.push(edge.map(([x, , z]) => { const a = Math.atan2(z - b.drainZ, x); return [b.drainX + THREE.MathUtils.lerp(x, 45 * Math.cos(a), t), -b.depth + 5 * (1 - s), THREE.MathUtils.lerp(z, b.drainZ + 45 * Math.sin(a), t)]; })); }
  sinkSurface(floorRings, steel, g, "RODI · fundo com abertura circular");
  const valve = valvulaDeCesta(g, b.depth, polido, escuro); valve.name = "RODI · válvula manual de cesta"; valve.position.x = b.drainX; valve.position.z = b.drainZ;
  if (index === 0) {
    const o = new THREE.Group(); o.name = "RODI · anti-inundação"; g.add(o);
    if (duo) { o.position.set(b.w / 2 - 4.3, -30, 0); o.rotation.y = -Math.PI / 2; } else o.position.set(0, -30, -b.d / 2 + 4.3);
    for (const x of [-22, -11, 11, 22]) mesh(new THREE.ShapeGeometry(rounded(6, 2.5, 1), 10), escuro, o, "RODI · abertura de transbordo").position.x = x;
    mesh(new THREE.CircleGeometry(4.2, 32), polido, o, "RODI · centro do anti-inundação").position.z = 0.1;
    mesh(new THREE.CircleGeometry(1.4, 24), escuro, o, "RODI · fixação central").position.z = 0.2;
  }
}
function construirCubas(spec: (typeof CUBAS_SPECS)[number]): RodiHtml {
  const m = materiaisRodi(spec.id), steel = m.chapa, g = new THREE.Group(); g.name = `RODI ${spec.title}`;
  const outline = contornoCubas(spec);
  sinkSurface([outline.map(([x, z]) => [x, -1.2, z]), outline.map(([x, z]) => [x, -0.6, z])], steel, g, "RODI · aresta da aba");
  const bowls = spec.bowls.map((b) => ({ ...b, cx: -spec.outerWidth / 2 + b.left + b.w / 2, cz: -spec.outerDepth / 2 + b.top + b.d / 2 }));
  const shape = caminhoForma(outline); shape.holes = bowls.map((b) => caminhoFuro(roundLoop(b.w, b.d, b.r, 32).map(([x, z]) => [x + b.cx, z + b.cz])));
  const deck = mesh(new THREE.ShapeGeometry(shape, 32), steel, g, "RODI · aba com cubas abertas"); deck.rotation.x = -Math.PI / 2; deck.position.y = -0.6;
  bowls.forEach((b, i) => cubaCubas(b, g, i, !!spec.duo, steel, m.polido, m.escuro));
  return { grupo: g, materiais: [steel, m.aco, m.polido, m.escuro] };
}

/** Constrói um lava-loiça RODI (em mm): o modelo é o id da medida (keran100, una55, duo60…). */
export function construirRodi(modelo: string, o: OpcoesRodi = {}): RodiHtml {
  const k = KERAN_SPECS.find((s) => s.id === modelo); if (k) return construirKeran(k, o);
  const u = UNA_SPECS.find((s) => s.id === modelo); if (u) return construirUna(u);
  const c = CUBAS_SPECS.find((s) => s.id === modelo); if (c) return construirCubas(c);
  throw new Error(`Modelo de lava-loiça desconhecido: ${modelo}`);
}
