// 25/11: o nó de uma parte de um genérico GLB, procurado por nome. Partilhado por `montarGenerico` (que põe nele a posição e a escala da parte) e por `criarMateriaisDeZona` (que lhe muda os materiais).
import type * as THREE from "three";

/**
 * O nó de uma parte do catálogo no grupo montado. Nos GLB o nó da parte (base, corpo, bica…) leva dentro uma malha que também se chama como o material («corpo»), e o GLTFLoader dá nomes
 * únicos: a malha da primeira parte fica «corpo» e o nó da parte «corpo» passa a «corpo_1». Procurar só pelo nome apanhava a malha da base em vez da parte «corpo»: a escala e a posição
 * da parte iam para a malha errada (a torneira saía com um cilindro de 1 m) e a cópia do material da zona não chegava à malha certa. Um nó que não seja uma malha, com o nome da parte (ou
 * com o nome e o sufixo `_N` do carregador), tem prioridade; sem ele, o nome sozinho (cenas de caixas, onde a malha é a própria parte).
 */
export function noDaParte(grupo: THREE.Object3D, nome: string): THREE.Object3D | undefined {
  let exato: THREE.Object3D | undefined, sufixado: THREE.Object3D | undefined;
  grupo.traverse((o) => {
    if (o === grupo || (o as THREE.Mesh).isMesh) return;
    if (!exato && o.name === nome) exato = o;
    else if (!sufixado && o.name.startsWith(`${nome}_`) && /^\d+$/.test(o.name.slice(nome.length + 1))) sufixado = o;
  });
  return exato ?? sufixado ?? grupo.getObjectByName(nome);
}
