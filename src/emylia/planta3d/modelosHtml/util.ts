// Modelos detalhados do catálogo de origem («Torneiras e Lava-loiças · Catálogo 3D», do utilizador), portados para módulos sem DOM nem UI.
// Aqui: os utilitários do HTML (mesh, lathe, cyl, rod, rounded, roundCylinder, bodyGeometry por tetraedros a partir de um campo de distância
// assinada, hélice do flexível) e os materiais EXACTOS por acabamento. Tudo em MILÍMETROS, como o HTML; o visualizador escala a metros (0,001).
import * as THREE from "three";

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export type Vec = THREE.Vector3;

/* ------------------------------------------------------------------ acabamentos (a tabela `finishes` do HTML, sem alterar valores) */
export interface AcabHtml { label: string; color: string; trim: string; roughness: number; metalness: number; clearcoat: number }
export const ACABAMENTOS_HTML: Record<string, AcabHtml> = {
  nickel: { label: "Níquel", color: "#adb0b3", trim: "#959a9e", roughness: 0.19, metalness: 1, clearcoat: 0.15 },
  blanco: { label: "Blanco", color: "#eeede4", trim: "#dfded5", roughness: 0.48, metalness: 0.02, clearcoat: 0.04 },
  gunmetal: { label: "Gun Metal", color: "#7c7e75", trim: "#666960", roughness: 0.29, metalness: 1, clearcoat: 0.1 },
  brushed: { label: "Escovado", color: "#bdbab4", trim: "#a4aaa4", roughness: 0.28, metalness: 1, clearcoat: 0.12 },
  chrome: { label: "Cromado", color: "#f3f4f2", trim: "#d9e0dd", roughness: 0.115, metalness: 1, clearcoat: 0.3 },
  oro: { label: "Oro", color: "#bca14e", trim: "#9f8537", roughness: 0.3, metalness: 1, clearcoat: 0.1 },
  titanio: { label: "Titanio", color: "#625e5b", trim: "#514d4a", roughness: 0.3, metalness: 1, clearcoat: 0.12 },
  negro: { label: "Negro", color: "#111212", trim: "#101111", roughness: 0.49, metalness: 0.08, clearcoat: 0.035 },
  cobre: { label: "Cobre", color: "#978060", trim: "#806746", roughness: 0.31, metalness: 1, clearcoat: 0.1 },
};
/** O acabamento com as alterações próprias de cada modelo (`finishOverrides` do HTML). */
export function acabamentoHtml(id: string, sobrepor: Partial<AcabHtml> = {}): AcabHtml {
  return { ...(ACABAMENTOS_HTML[id] ?? ACABAMENTOS_HTML.brushed), ...sobrepor };
}

/** Os materiais de um modelo para um acabamento: `metal` e `trim` mudam com o acabamento; os outros são fixos, como no HTML. */
export interface Materiais {
  metal: THREE.MeshPhysicalMaterial; trim: THREE.MeshPhysicalMaterial; rubber: THREE.MeshStandardMaterial; aerator: THREE.MeshStandardMaterial;
  hole: THREE.MeshStandardMaterial; hose: THREE.MeshPhysicalMaterial; hoseCore: THREE.MeshStandardMaterial;
}
export function criarMateriais(a: AcabHtml): Materiais {
  const metal = new THREE.MeshPhysicalMaterial({ color: "#bdbab4", metalness: 1, roughness: 0.28, clearcoat: 0.12, clearcoatRoughness: 0.3, envMapIntensity: 1.05 });
  const trim = new THREE.MeshPhysicalMaterial({ color: "#a4aaa4", metalness: 1, roughness: 0.24, envMapIntensity: 1.0 });
  metal.color.set(a.color); metal.roughness = a.roughness; metal.metalness = a.metalness; metal.clearcoat = a.clearcoat;
  trim.color.set(a.trim); trim.roughness = a.roughness; trim.metalness = a.metalness;
  return {
    metal, trim, rubber: new THREE.MeshStandardMaterial({ color: "#202221", roughness: 0.85 }), aerator: new THREE.MeshStandardMaterial({ color: "#727972", metalness: 0.7, roughness: 0.45 }),
    hole: new THREE.MeshStandardMaterial({ color: "#202b24", roughness: 0.82 }),
    hose: new THREE.MeshPhysicalMaterial({ color: "#d1d0cb", metalness: 1, roughness: 0.22, clearcoat: 0.15, envMapIntensity: 1.05 }),
    hoseCore: new THREE.MeshStandardMaterial({ color: "#575953", metalness: 0.85, roughness: 0.4 }),
  };
}
export const libertarMateriais = (m: Materiais): void => { for (const x of Object.values(m)) x.dispose(); };

/* ------------------------------------------------------------------ construção de malhas (as funções do HTML) */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, name = ""): THREE.Mesh {
  const o = new THREE.Mesh(g, m); o.name = name; parent.add(o); return o;
}
export function lathe(profile: number[][], m: THREE.Material, parent: THREE.Object3D, name = "", segmentos = DETALHE.lathe): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segmentos), m, parent, name);
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material, parent: THREE.Object3D, name = "", segmentos = 80): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, segmentos), m, parent, name);
}
export function rod(a: Vec, b: Vec, r: number, m: THREE.Material, parent: THREE.Object3D, name = ""): THREE.Mesh {
  const d = b.clone().sub(a), o = cyl(r, r, d.length(), m, parent, name);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); o.position.copy(a).add(b).multiplyScalar(0.5); return o;
}
export function rounded(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s;
}
/** Distância assinada a um cilindro de topos arredondados (a e b: distância radial e altura relativa; r raio; hh meia altura; round arredondamento). */
export function roundCylinder(a: number, b: number, r: number, hh: number, round: number): number {
  const qx = a - r + round, qy = Math.abs(b) - hh + round;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - round;
}

/** O nível de detalhe: o HTML usa a grelha e os tubos mais finos, que passam dos 150 mil triângulos por torneira; aqui reduz-se (as normais vêm do campo de distância, por isso o aspecto liso mantém-se). */
export const DETALHE = { fatorGrelha: 1.6, tuboRadial: 32, tuboSegmentos: 0.55, lathe: 64 };
/** A mesma grelha com um passo `fator` vezes maior, a cobrir o mesmo volume. */
export const reduzirGrelha = (g: { step: number; nx: number; ny: number; nz: number; x0: number; y0: number; z0: number }, fator = DETALHE.fatorGrelha) => ({
  ...g, step: g.step * fator, nx: Math.ceil((g.nx - 1) / fator) + 1, ny: Math.ceil((g.ny - 1) / fator) + 1, nz: Math.ceil((g.nz - 1) / fator) + 1,
});
export interface Grelha { step: number; nx: number; ny: number; nz: number; x0: number; y0: number; z0: number }
const DESLOCAMENTOS: number[][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const TETRAEDROS: number[][] = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
/**
 * Malha por tetraedros marchantes (marching tetrahedra) de um campo de distância assinada: o corpo liso da torneira, sem costuras entre o
 * cilindro principal e o pescoço do comando. Igual ao `bodyGeometry` do HTML.
 */
export function bodyGeometry(distance: (x: number, y: number, z: number) => number, grid: Grelha): THREE.BufferGeometry {
  const { step, nx, ny, nz, x0, y0, z0 } = grid, vals = new Float32Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number) => (y * nz + z) * nx + x;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) vals[idx(x, y, z)] = distance(x0 + x * step, y0 + y * step, z0 + z * step);
  const ps: number[] = [], ns: number[] = [];
  const normal = (p: Vec) => {
    const e = 0.06;
    return V(distance(p.x + e, p.y, p.z) - distance(p.x - e, p.y, p.z), distance(p.x, p.y + e, p.z) - distance(p.x, p.y - e, p.z), distance(p.x, p.y, p.z + e) - distance(p.x, p.y, p.z - e)).normalize();
  };
  const tri = (a: Vec, b: Vec, c: Vec) => {
    const na = normal(a), nb = normal(b), nc = normal(c);
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(na) < 0) { [b, c] = [c, b]; [nb.x, nc.x] = [nc.x, nb.x]; [nb.y, nc.y] = [nc.y, nb.y]; [nb.z, nc.z] = [nc.z, nb.z]; }
    for (const v of [a, b, c]) ps.push(v.x, v.y, v.z);
    for (const n of [na, nb, nc]) ns.push(n.x, n.y, n.z);
  };
  for (let y = 0; y < ny - 1; y++) for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
    const vs = DESLOCAMENTOS.map(([a, b, c]) => vals[idx(x + a, y + b, z + c)]);
    if (vs.every((v) => v >= 0) || vs.every((v) => v < 0)) continue;
    const pp = DESLOCAMENTOS.map(([a, b, c]) => V(x0 + (x + a) * step, y0 + (y + b) * step, z0 + (z + c) * step));
    const cut = (i: number, j: number) => pp[i].clone().lerp(pp[j], vs[i] / (vs[i] - vs[j]));
    for (const tt of TETRAEDROS) {
      const inside = tt.filter((i) => vs[i] < 0), outside = tt.filter((i) => vs[i] >= 0);
      if (!inside.length || !outside.length) continue;
      if (inside.length === 1) tri(cut(inside[0], outside[0]), cut(inside[0], outside[1]), cut(inside[0], outside[2]));
      else if (inside.length === 3) tri(cut(outside[0], inside[0]), cut(outside[0], inside[1]), cut(outside[0], inside[2]));
      else { const [a, b] = inside, [c, d] = outside, p0 = cut(a, c), p1 = cut(a, d), p2 = cut(b, c), p3 = cut(b, d); tri(p0, p1, p2); tri(p1, p3, p2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(ns, 3)); g.computeBoundingSphere(); return g;
}

/** Fita metálica helicoidal ao longo de uma curva (o flexível extraível), com a face larga e a junta estreita. */
export function spiralGeometry(curve: THREE.Curve<THREE.Vector3>): THREE.BufferGeometry {
  const length = curve.getLength(), steps = Math.max(24, Math.ceil((length / 2.6) * 24)), frames = curve.computeFrenetFrames(steps, false), points = curve.getSpacedPoints(steps);
  const section = [[-1.18, 5.25], [-1.06, 5.7], [-0.88, 5.94], [0.86, 5.94], [1.04, 5.73], [1.18, 5.3], [1.05, 5.18], [-1.04, 5.18]], stride = section.length, positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((length * i) / steps / 2.6) * Math.PI * 2, radial = frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle));
    for (const [offset, radius] of section) { const p = points[i].clone().addScaledVector(frames.tangents[i], offset).addScaledVector(radial, radius); positions.push(p.x, p.y, p.z); }
    if (i < steps) for (let j = 0; j < stride; j++) { const a = i * stride + j, b = i * stride + ((j + 1) % stride), c = a + stride, d = b + stride; indices.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

/* ------------------------------------------------------------------ cache de geometrias pesadas e medição */
const cacheGeo = new Map<string, THREE.BufferGeometry>();
/** Uma geometria pesada (tetraedros marchantes) calculada uma só vez por chave (família e modelo); as variantes só mudam os materiais. */
export function geometriaEmCache(chave: string, gerar: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cacheGeo.get(chave);
  if (!g) { g = gerar(); cacheGeo.set(chave, g); }
  return g;
}
export const limparCacheGeometrias = (): void => { for (const g of cacheGeo.values()) g.dispose(); cacheGeo.clear(); };

/** O número de triângulos de um objecto (todas as malhas, instâncias incluídas). */
export function contarTriangulos(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh & { count?: number };
    if (!m.isMesh) return;
    const g = m.geometry, por = g.index ? g.index.count / 3 : (g.getAttribute("position")?.count ?? 0) / 3;
    n += por * ((x as THREE.InstancedMesh).isInstancedMesh ? (x as THREE.InstancedMesh).count : 1);
  });
  return Math.round(n);
}
/** A caixa envolvente do objecto, em milímetros (com as transformações aplicadas). */
export function caixaEnvolvente(o: THREE.Object3D): THREE.Box3 { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o, true); }
