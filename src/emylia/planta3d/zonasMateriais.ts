// 24/11 (fase 1): UM material por zona num genérico montado (montarGenerico). Os GLB só dizem «material corpo» e o visualizador pintava esse material partilhado de uma vez; aqui cada zona
// (frente, corpo, tampo, pés, estofo…, zonasGlb.ts) ganha uma CÓPIA do `corpo` e as malhas das suas partes passam a usá-la, para cada zona levar a sua foto ou cor. Um material por zona
// (não por malha): as três portas de uma frente partilham o mesmo. Só as malhas de material `corpo` mudam: o metal dos puxadores, o vidro e o resto ficam como são.
// A cor, a foto e o realce de cada zona aplicam-se EM CIMA, sem refazer o material (mexe-se nele em vez de o recriar): `aplicarAparenciaDasZonas`.
// Os materiais de zona libertam-se com `libertar` ao desmontar; a foto em si é da cache de texturaProduto.ts (não se liberta aqui). Os 35 GLB não se regeneram.
import * as THREE from "three";
import type { CategoriaGlb } from "./categoriasGlb";
import { aplicarTextura, retirarTextura } from "./texturaProduto";
import { zonaDaParte, type ZonaGlb, type ZonasDoProduto } from "./zonasGlb";

/** A cor do brilho que realça uma zona (violeta, como a selecção das peças). */
export const COR_REALCE = "#7c3aed";
const INTENSIDADE_REALCE = 0.55;
const SEM_BRILHO = "#000000";

export interface MateriaisDeZona { porZona: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>; libertar: () => void }

/**
 * Cria, para cada zona que o modelo tem, uma cópia do material `corpo` e põe-na nas malhas de material `corpo` das partes dessa zona (partes escondidas incluídas: se voltarem a aparecer
 * com outra opção, o material já lá está). O `grupo` é o de `montarGenerico` (os nós têm o nome das partes).
 */
export function criarMateriaisDeZona(grupo: THREE.Object3D, c: CategoriaGlb): MateriaisDeZona {
  const porZona = new Map<ZonaGlb, THREE.MeshStandardMaterial>();
  for (const parte of c.partes) {
    const zona = zonaDaParte(parte, c.id);
    if (!zona || parte.mat !== "corpo") continue;
    grupo.getObjectByName(parte.nome)?.traverse((o) => {
      const malha = o as THREE.Mesh;
      const atual = malha.material;
      if (!malha.isMesh || Array.isArray(atual) || atual.name !== "corpo") return;
      let mat = porZona.get(zona);
      if (!mat) { mat = (atual as THREE.MeshStandardMaterial).clone(); mat.name = "corpo"; porZona.set(zona, mat); }
      malha.material = mat;
    });
  }
  return { porZona, libertar: () => porZona.forEach((m) => m.dispose()) };
}

export interface AparenciaDasZonas {
  /** A cor do modelo (a que o `corpo` tinha): o que uma zona sem aparência leva. */
  corBase: string;
  /** A aparência de cada zona; só vale com `porZona: true` (com todas as zonas iguais, vale `unica`). */
  zonas?: ZonasDoProduto;
  /** As fotos já carregadas, por URL. Uma foto que ainda não chegou (ou falhou) deixa a zona na sua cor. */
  texturas: ReadonlyMap<string, THREE.Texture>;
  /** O caminho de hoje: a foto única (corpo > frente > cor) em TODAS as zonas, como ia para o `corpo` inteiro. */
  unica?: { tex: THREE.Texture; lado: number } | null;
  /** A zona a realçar (brilho), ou nenhuma. */
  realce?: ZonaGlb | null;
}

/** Aplica a cor, a foto e o realce a cada material de zona (idempotente: repõe o que havia antes de aplicar o novo). */
export function aplicarAparenciaDasZonas(mats: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>, o: AparenciaDasZonas): void {
  for (const [zona, mat] of mats) {
    retirarTextura(mat);
    let cor = o.corBase, tex: THREE.Texture | undefined, lado = 0;
    if (o.zonas?.porZona) {
      const z = o.zonas.zonas[zona];
      if (z?.cor) cor = z.cor;
      if (z?.textura) { tex = o.texturas.get(z.textura.url); lado = z.textura.ladoCm; }
    } else if (o.unica) { tex = o.unica.tex; lado = o.unica.lado; }
    mat.color.set(cor);
    if (tex) aplicarTextura(mat, tex, lado);
    mat.emissive.set(o.realce === zona ? COR_REALCE : SEM_BRILHO);
    mat.emissiveIntensity = o.realce === zona ? INTENSIDADE_REALCE : 1;
  }
}
