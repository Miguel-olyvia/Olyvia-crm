// Parte «three» do gerador de GLB (scripts/gerar-modelos-glb.mjs): constrói cada modelo do HTML com o construtor procedural (o mesmo do runtime),
// e achata-o para exportar. Corre em Node (sem DOM), empacotado pelo esbuild. Não simplifica nem comprime: isso é feito no .mjs (meshoptimizer).
//
// Estrutura de saída (a que o runtime espera, em modelosHtml/glb.ts):
//   raiz ─ malhas fixas
//        └ bica (torneiras: roda em y) ─ malhas da bica
//              └ cabeca (torneiras extraíveis: a cabeça que sai; extras: dock e direction) ─ malhas da cabeça
//        └ tampas (Ambar: as tampas dos ralos, que se escondem) ─ malhas das tampas
// Cada malha junta TODAS as peças do mesmo nó com o mesmo material, e chama-se pelo nome do material (metal, trim, aco, vidro…): é por esse
// nome que o runtime lhe atribui o material do acabamento. O GLB não leva materiais.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { construirTorneira, modelosDeTorneira, type ModeloTorneira } from "@/emylia/planta3d/modelosHtml/torneiras";
import { construirLavaLoica, modelosDeLavaLoica } from "@/emylia/planta3d/modelosHtml";
import { construirPlaca, modelosDePlaca } from "@/emylia/planta3d/modelosHtml/placas";
import { contarTriangulos } from "@/emylia/planta3d/modelosHtml/util";

export type FamiliaGlb = "torneira" | "lava_loica" | "placa";
export interface NoSaida { nome: string; pai: string | null; posicao: number[]; quaternion: number[]; extras?: Record<string, unknown> }
export interface MalhaSaida { no: string; material: string; posicoes: Float32Array; normais: Float32Array; indices: Uint32Array }
export interface ModeloPreparado { familia: FamiliaGlb; modelo: string; nos: NoSaida[]; malhas: MalhaSaida[]; triangulosOriginais: number; ms: number }

interface NoMovel { nome: string; pai: string; obj?: THREE.Object3D; membros?: Set<THREE.Object3D>; extras?: Record<string, unknown> }

export const listaDeModelos = (): { familia: FamiliaGlb; modelo: string }[] => [
  ...modelosDeTorneira().map((modelo) => ({ familia: "torneira" as const, modelo })),
  ...modelosDeLavaLoica().map((modelo) => ({ familia: "lava_loica" as const, modelo })),
  ...modelosDePlaca().map((modelo) => ({ familia: "placa" as const, modelo })),
];

/** O modelo construído com as opções de omissão (bica a 0°, recolhida, tampas postas, escorredor à direita) e os nós que se mexem no runtime. */
function construir(familia: FamiliaGlb, modelo: string): { grupo: THREE.Group; moveis: NoMovel[] } {
  if (familia === "torneira") {
    const t = construirTorneira(modelo as ModeloTorneira, "brushed");
    const moveis: NoMovel[] = [{ nome: "bica", pai: "raiz", obj: t.bica }];
    if (t.puxar) moveis.push({ nome: "cabeca", pai: "bica", obj: t.puxar.head, extras: { dock: t.puxar.dock.toArray(), direction: t.puxar.direction.toArray() } });
    return { grupo: t.grupo, moveis };
  }
  if (familia === "lava_loica") {
    const l = construirLavaLoica(modelo, "");
    return { grupo: l.grupo, moveis: l.tampas.length ? [{ nome: "tampas", pai: "raiz", membros: new Set(l.tampas) }] : [] };
  }
  return { grupo: construirPlaca(modelo, "").grupo, moveis: [] };
}

const visivel = (o: THREE.Object3D, raiz: THREE.Object3D): boolean => { for (let x: THREE.Object3D | null = o; x && x !== raiz; x = x.parent) if (!x.visible) return false; return raiz.visible; };

/** Uma geometria só com posição e normal, sem índice, com a matriz aplicada (e a ordem dos vértices corrigida se a matriz espelhar). */
function geometriaAplicada(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const base = new THREE.BufferGeometry();
  base.setAttribute("position", g.getAttribute("position").clone());
  if (g.getAttribute("normal")) base.setAttribute("normal", g.getAttribute("normal").clone());
  if (g.index) base.setIndex(g.index.clone());
  const n = base.index ? base.toNonIndexed() : base;
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  n.applyMatrix4(m);
  if (m.determinant() < 0) for (const nome of ["position", "normal"]) {
    const a = n.getAttribute(nome) as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 3) { const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1); a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)); a.setXYZ(i + 2, x, y, z); }
  }
  return n;
}

export function preparar(familia: FamiliaGlb, modelo: string): ModeloPreparado {
  const t0 = performance.now();
  const { grupo, moveis } = construir(familia, modelo);
  const ms = performance.now() - t0;
  grupo.updateMatrixWorld(true);
  const raizInv = grupo.matrixWorld.clone().invert();
  // a matriz de cada nó relativa à raiz
  const relDe = new Map<string, THREE.Matrix4>([["raiz", new THREE.Matrix4()]]);
  for (const n of moveis) relDe.set(n.nome, n.obj ? raizInv.clone().multiply(n.obj.matrixWorld) : new THREE.Matrix4());
  const nos: NoSaida[] = [{ nome: "raiz", pai: null, posicao: [0, 0, 0], quaternion: [0, 0, 0, 1] }];
  for (const n of moveis) {
    const local = (relDe.get(n.pai) as THREE.Matrix4).clone().invert().multiply(relDe.get(n.nome) as THREE.Matrix4);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    local.decompose(p, q, s);
    if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-6) throw new Error(`${modelo}: o nó ${n.nome} tem escala`);
    // o runtime roda a bica com rotation.y: tem de partir sem rotação
    if (n.nome === "bica" && Math.abs(q.w) < 1 - 1e-9) throw new Error(`${modelo}: a bica tem rotação de partida`);
    nos.push({ nome: n.nome, pai: n.pai, posicao: p.toArray(), quaternion: q.toArray(), extras: n.extras });
  }
  const donoDe = (o: THREE.Object3D): string => {
    for (const n of moveis) if (n.membros?.has(o)) return n.nome;
    for (let x: THREE.Object3D | null = o; x && x !== grupo; x = x.parent) { const n = moveis.find((k) => k.obj === x); if (n) return n.nome; }
    return "raiz";
  };
  // as geometrias por (nó, material), já no espaço do nó
  const grupos = new Map<string, THREE.BufferGeometry[]>();
  grupo.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !visivel(mesh, grupo)) return;
    if (Array.isArray(mesh.material)) throw new Error(`${modelo}: a malha «${mesh.name}» tem vários materiais`);
    const mat = mesh.material.name;
    if (!mat) throw new Error(`${modelo}: a malha «${mesh.name}» tem um material sem nome`);
    if (!(mesh.geometry.getAttribute("position")?.count > 0)) return;
    const no = donoDe(mesh), base = (relDe.get(no) as THREE.Matrix4).clone().invert().multiply(raizInv).multiply(mesh.matrixWorld);
    const chave = `${no}|${mat}`, lista = grupos.get(chave) ?? [];
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      const mi = new THREE.Matrix4();
      for (let i = 0; i < inst.count; i++) { inst.getMatrixAt(i, mi); lista.push(geometriaAplicada(mesh.geometry, base.clone().multiply(mi))); }
    } else lista.push(geometriaAplicada(mesh.geometry, base));
    grupos.set(chave, lista);
  });
  const malhas: MalhaSaida[] = [];
  for (const [chave, lista] of grupos) {
    const [no, material] = chave.split("|");
    const junta = mergeGeometries(lista, false);
    if (!junta) throw new Error(`${modelo}: não consegui juntar ${chave}`);
    const soldada = mergeVertices(junta, 1e-4);
    const pos = soldada.getAttribute("position") as THREE.BufferAttribute, nor = soldada.getAttribute("normal") as THREE.BufferAttribute;
    malhas.push({ no, material, posicoes: new Float32Array(pos.array), normais: new Float32Array(nor.array), indices: new Uint32Array((soldada.index as THREE.BufferAttribute).array) });
  }
  return { familia, modelo, nos, malhas, triangulosOriginais: contarTriangulos(grupo), ms };
}
