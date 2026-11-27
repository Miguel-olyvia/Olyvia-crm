// 27/11: a montagem, com o three, de UMA instância de um GLB próprio (a parte sem React de ModeloProprio.tsx, para se testar sem canvas): normaliza o ficheiro (centra em x e z
// e assenta-o no chão), escala-o pelas medidas do produto, pinta os materiais permitidos com a cor e a textura do produto (modelo3dProprio.ts) e dá à instância os seus
// materiais (clonados; `libertar` larga-os). Nunca altera a cena em cache: partilha-se só a geometria.
import * as THREE from "three";
import { hexValido } from "./acabamentoCor3d";
import { ErroModeloProprio, MAX_TRIANGULOS, materialRecebeAparencia, notaDeAviso, planearEscala, type MedidasProduto, type PlanoEscala } from "./modelo3dProprio";
import { aplicarTextura } from "./texturaProduto";

/** A foto do produto já carregada (a mesma que a ficha usa: texturaProduto.ts) e o lado em cm de cada repetição; `tingir`: a cor multiplica-a. */
export interface TexturaCarregada { tex: THREE.Texture; ladoCm: number; tingir?: boolean }
export interface OpcoesProprio { medidas: MedidasProduto | null; cor?: string | undefined; textura?: TexturaCarregada | null | undefined }
export interface ModeloProprioMontado {
  grupo: THREE.Group; libertar: () => void; plano: PlanoEscala; triangulos: number;
  /** a nota de um aviso (tamanho nativo estranho, muitos triângulos); null sem nada a dizer */
  aviso: string | null;
}

const MIL = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Os triângulos que a cena desenha (índices a dividir por 3, ou os vértices se a malha não tem índices). */
export function contarTriangulos(cena: THREE.Object3D): number {
  let n = 0;
  cena.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += Math.floor((g.index ? g.index.count : g.getAttribute("position")?.count ?? 0) / 3);
  });
  return n;
}

type ComCor = THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; isMeshStandardMaterial?: boolean };

/** Pinta UM material (já clonado) com a cor e a textura do produto. A cor substitui o mapa de cor que o ficheiro trouxesse; a textura usa a mesma função da ficha. */
function pintar(mat: ComCor, o: OpcoesProprio, aplicar: typeof aplicarTextura): void {
  if (hexValido(o.cor) && mat.color) mat.color.set(o.cor);
  if (o.textura && mat.isMeshStandardMaterial) { aplicar(mat as THREE.MeshStandardMaterial, o.textura.tex, o.textura.ladoCm, { tingir: o.textura.tingir === true }); return; }
  if (hexValido(o.cor) && mat.color && "map" in mat && mat.map) { mat.map = null; mat.needsUpdate = true; }
}

/**
 * Monta uma instância do GLB (uma cópia da cena em cache, sem a alterar): normalizada, escalada, com materiais próprios e pintados. `aplicar`: só os testes o trocam.
 * Lança `ErroModeloProprio` se a cena não tem geometria ou passa dos 200 000 triângulos (o 3D cai no genérico, com a nota).
 */
export function montarModeloProprio(cena: THREE.Object3D, o: OpcoesProprio, aplicar: typeof aplicarTextura = aplicarTextura): ModeloProprioMontado {
  const triangulos = contarTriangulos(cena);
  if (triangulos > MAX_TRIANGULOS) throw new ErroModeloProprio(`O modelo tem ${MIL(triangulos)} triângulos: o limite é ${MIL(MAX_TRIANGULOS)}.`);
  const copia = cena.clone(true);
  const normalizado = new THREE.Group(), grupo = new THREE.Group();
  normalizado.add(copia); grupo.add(normalizado);

  // os materiais da instância: uma cópia por material do ficheiro (as malhas que o partilham continuam a partilhá-lo), para nunca pintar a cache nem outra peça
  const copias = new Map<THREE.Material, THREE.Material>();
  const copiar = (m: THREE.Material): THREE.Material => { let c = copias.get(m); if (!c) { c = m.clone(); copias.set(m, c); } return c; };
  copia.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(copiar) : copiar(m.material);
  });
  if (hexValido(o.cor) || o.textura) for (const [original, nova] of copias) if (materialRecebeAparencia(original.name)) pintar(nova as ComCor, o, aplicar);

  normalizado.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(normalizado);
  if (caixa.isEmpty()) throw new ErroModeloProprio("O modelo 3D próprio não tem geometria para desenhar.");
  const tam = caixa.getSize(new THREE.Vector3()), centro = caixa.getCenter(new THREE.Vector3());
  const plano = planearEscala({ x: tam.x, y: tam.y, z: tam.z }, o.medidas);
  const [kx, ky, kz] = plano.escala;
  normalizado.position.set(-centro.x * kx, -caixa.min.y * ky, -centro.z * kz);
  normalizado.scale.set(kx, ky, kz);
  return { grupo, plano, triangulos, aviso: notaDeAviso({ tamanhoNativo: plano.tamanhoNativo, triangulos }), libertar: () => copias.forEach((c) => c.dispose()) };
}
