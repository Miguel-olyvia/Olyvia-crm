// Os modelos detalhados do HTML como GLB pré-gerados (scripts/gerar-modelos-glb.mjs → public/modelos3d/): carregam-se só quando a peça entra
// na planta, ficam em cache por URL (peças iguais partilham a geometria) e libertam-se pouco depois de a última peça sair. O GLB não traz
// materiais: cada malha diz o nome do seu (metal, trim, aco, vidro…) e recebe aqui o material do acabamento, o MESMO que o construtor procedural
// usa (materiaisDaTorneira, materiaisDaLavaLoica, materiaisDaPlaca). As opções que mexem na geometria (rodar e extrair a bica, tirar as tampas
// dos ralos, escorredor à esquerda) ligam-se aos nós do GLB (bica, cabeca, tampas). Sem React: o visualizador usa `lerGlb` com o Suspense.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { aplicarExtracao, criarFlexivel, materiaisDaTorneira, type ModeloTorneira } from "./torneiras";
import { materiaisDaLavaLoica } from "./index";
import { materiaisDaPlaca } from "./placas";
import { KERAN_SPECS } from "./specs";
import { V } from "./util";

/** O interruptor único: `false` volta aos construtores procedurais em todo o lado (peças soltas e bancada). */
export const USAR_GLB = true;
export type FamiliaGlb = "torneira" | "lava_loica" | "placa";
/** O GLB de um modelo do HTML (servido pelo Vite a partir de public/modelos3d, URL estável). */
export const urlDoModeloHtml = (familia: FamiliaGlb, modelo: string): string => `/modelos3d/${familia}-${modelo}.glb`;
/** Quanto tempo um GLB fica em memória depois de a última peça que o usa sair (para voltar a pôr a peça sem o recarregar). */
export const LIBERTAR_APOS_MS = 30_000;

/* ------------------------------------------------------------------ cache por URL, com contagem de peças */
interface Entrada { promessa: Promise<void>; cena?: THREE.Group; erro?: unknown; pecas: number; temporizador?: ReturnType<typeof setTimeout> }
const cache = new Map<string, Entrada>();
let carregador: GLTFLoader | null = null;
const obterCarregador = (): GLTFLoader => {
  if (!carregador) { carregador = new GLTFLoader(); carregador.setMeshoptDecoder(MeshoptDecoder); }
  return carregador;
};
function entradaDe(url: string): Entrada {
  const tida = cache.get(url);
  if (tida) return tida;
  const nova: Entrada = { pecas: 0, promessa: Promise.resolve() };
  nova.promessa = obterCarregador().loadAsync(url).then((g) => { nova.cena = g.scene; }, (e: unknown) => { nova.erro = e; });
  cache.set(url, nova);
  return nova;
}
/**
 * A cena de um GLB para o Suspense do React: devolve-a (partilhada: montar com `montarModelo`, que clona) ou suspende enquanto carrega.
 * Um GLB que falhe lança o erro, para o ErrorBoundary pôr o construtor procedural no lugar.
 */
export function lerGlb(url: string): THREE.Group {
  const e = entradaDe(url);
  if (e.erro) throw e.erro instanceof Error ? e.erro : new Error(`GLB ${url}: ${String(e.erro)}`);
  if (!e.cena) throw e.promessa;
  return e.cena;
}
/** Uma peça passou a usar o GLB (não o liberta enquanto houver peças). */
export function reterGlb(url: string): void {
  const e = entradaDe(url);
  e.pecas++;
  if (e.temporizador) { clearTimeout(e.temporizador); e.temporizador = undefined; }
}
/** Uma peça deixou de o usar: sem peças, liberta a geometria passado `LIBERTAR_APOS_MS`. */
export function soltarGlb(url: string, esperaMs = LIBERTAR_APOS_MS): void {
  const e = cache.get(url);
  if (!e) return;
  e.pecas = Math.max(0, e.pecas - 1);
  if (e.pecas > 0) return;
  e.temporizador = setTimeout(() => {
    if (e.pecas > 0 || cache.get(url) !== e) return;
    e.cena?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    cache.delete(url);
  }, esperaMs);
}
/** Para os testes e as medições: quantos GLB estão em memória. */
export const glbEmCache = (): string[] => [...cache.keys()];

/* ------------------------------------------------------------------ montagem: materiais do acabamento e opções da peça */
export interface OpcoesGlb { bica?: number; extraido?: boolean; tampas?: boolean; reverso?: boolean }
export interface ModeloMontado { grupo: THREE.Group; libertar: () => void }

/** O nome do material de uma malha do GLB (as malhas repetidas ganham «_1», «_2» no carregador; o extra `material` é o nome certo). */
const materialDaMalha = (m: THREE.Object3D): string => (typeof m.userData.material === "string" ? m.userData.material : m.name.replace(/_\d+$/, ""));

/** Uma cópia da cena (a geometria fica partilhada) com o material de cada malha tirado de `materiais` pelo nome; falha se faltar algum. */
export function vestir(cena: THREE.Object3D, materiais: Readonly<Record<string, THREE.Material>>): THREE.Group {
  const copia = cena.clone(true) as THREE.Group;
  copia.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const nome = materialDaMalha(m), mat = materiais[nome];
    if (!mat) throw new Error(`O GLB pede o material «${nome}», que este modelo não tem`);
    m.material = mat; m.castShadow = true; m.receiveShadow = true;
  });
  return copia;
}

/** Monta um modelo do HTML a partir do GLB, com os materiais do acabamento e as opções da peça. Em mm, como o construtor procedural. */
export function montarModelo(familia: FamiliaGlb, cena: THREE.Object3D, modelo: string, acab: string, o: OpcoesGlb = {}): ModeloMontado {
  if (familia === "torneira") {
    const mats = materiaisDaTorneira(modelo as ModeloTorneira, acab), grupo = vestir(cena, { ...mats });
    const bica = grupo.getObjectByName("bica"), cabeca = grupo.getObjectByName("cabeca");
    if (bica) bica.rotation.y = ((o.bica ?? 0) * Math.PI) / 180;
    const geos: THREE.BufferGeometry[] = [];
    if (bica && cabeca && o.extraido) {
      const [dx, dy, dz] = cabeca.userData.dock as number[], [rx, ry, rz] = cabeca.userData.direction as number[];
      const fx = criarFlexivel(mats, bica, "");
      aplicarExtracao({ dock: V(dx, dy, dz), direction: V(rx, ry, rz), head: cabeca as THREE.Group, ...fx }, 1);
      geos.push(fx.core.geometry, fx.spiral.geometry);
    }
    return { grupo, libertar: () => { geos.forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); } };
  }
  const mats = familia === "lava_loica" ? materiaisDaLavaLoica(modelo, acab) : materiaisDaPlaca(modelo, acab), grupo = vestir(cena, { ...mats });
  if (familia === "lava_loica") {
    const tampas = grupo.getObjectByName("tampas");
    if (tampas) tampas.visible = !o.tampas;
    // como o construtor: só a Keran tem escorredor reversível (a lava-loiça roda meia volta)
    if (o.reverso && KERAN_SPECS.some((s) => s.id === modelo)) grupo.rotation.y = Math.PI;
  }
  return { grupo, libertar: () => Object.values(mats).forEach((m) => m.dispose()) };
}
