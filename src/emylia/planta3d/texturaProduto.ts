// 24/11: a textura da foto da opção de cor (o Nogal, o Artisan…) no 3D do produto. Sem React. Três coisas:
//  1. o mapeamento: o UV vem da POSIÇÃO NO MUNDO e da normal (projecção triplanar, o plano é o da normal dominante), e não do UV da peça. Assim cada repetição da foto
//     cobre `ladoCm` centímetros reais em qualquer forma (caixa esticada, elipsoide, cilindro) e em qualquer medida do produto, sem esticar;
//  2. o material: a foto é o `map` do material do corpo (a cor lisa passa a branco, porque multiplica a foto), com o shader a mapear no mundo (`onBeforeCompile`);
//  3. a cache por URL: uma textura por foto, partilhada pelas peças que a usam e libertada quando a última larga; se a imagem falhar (404, CORS, rede) entrega null
//     e quem desenha fica com a cor lisa.
// GANCHO PARA A PLANTA: a planta 3D não usa nada disto por omissão. Para a peça de um produto ter textura basta o modelo trazer `mockup3d.textura` (url e ladoCm);
// o Visualizador3D pede-a (useTexturaDoModelo) e aplica-a ao corpo dos genéricos e à caixa paramétrica. A posição no mundo inclui a da peça na divisão: se a planta
// vier a usar texturas, convém tirar a origem da peça (uma uniform com a posição) para o veio não deslizar ao arrastar a peça.
import * as THREE from "three";

/** Quantos centímetros cobre uma repetição da foto, por omissão (constante fácil de afinar). */
export const LADO_TEXTURA_CM = 40;
/** A foto de uma opção de cor e o lado, em cm, que uma repetição dela cobre. */
export interface TexturaModelo { url: string; ladoCm: number }

type V3 = readonly [number, number, number];

/** Repetições da foto por metro para um lado em cm; um lado inválido volta ao de omissão. */
export function repeticoesPorMetro(ladoCm: number): number {
  const lado = Number.isFinite(ladoCm) && ladoCm > 0 ? ladoCm : LADO_TEXTURA_CM;
  return 100 / lado;
}

/** O UV de um ponto do mundo (m) numa face de normal `n`, em repetições da foto: o plano é o da normal dominante. É o que o shader faz (ver `aplicarTextura`). */
export function uvEmMundo(p: V3, n: V3, repeticoes: number, rodar = false): [number, number] {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [u, v] = ax > ay && ax > az ? [p[2], p[1]] : ay > az ? [p[0], p[2]] : [p[0], p[1]];
  return rodar ? [v * repeticoes, u * repeticoes] : [u * repeticoes, v * repeticoes];
}
/** 24/11: `rodar` troca os eixos da foto (u ↔ v): o veio vertical da foto corre na horizontal. Só os revestimentos com o lado maior na horizontal o pedem. */
export interface OpcoesTextura { rodar?: boolean }

/* ------------------------------------------------------------------ o material */
const CHAVE_PROGRAMA = "textura-no-mundo-v1";
type Guardado = { cor: THREE.Color; uniform: { value: number } };
const guardados = new WeakMap<THREE.Material, Guardado>();

/** Põe a foto no material (MeshStandardMaterial) como mapa, mapeada no mundo com `ladoCm` por repetição. A cor passa a branco (e guarda-se a de antes). Idempotente. */
export function aplicarTextura(mat: THREE.MeshStandardMaterial, textura: THREE.Texture, ladoCm: number, opcoes: OpcoesTextura = {}): void {
  const rodar = !!opcoes.rodar;
  let g = guardados.get(mat);
  if (!g) { g = { cor: mat.color.clone(), uniform: { value: 0 } }; guardados.set(mat, g); }
  g.uniform.value = repeticoesPorMetro(ladoCm);
  const uniform = g.uniform;
  mat.color.set(0xffffff);
  mat.map = textura;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRepTextura = uniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPosMundoTx;\nvarying vec3 vNormalMundoTx;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPosMundoTx = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvNormalMundoTx = mat3( modelMatrix ) * objectNormal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPosMundoTx;\nvarying vec3 vNormalMundoTx;\nuniform float uRepTextura;")
      // o mesmo que uvEmMundo: o plano da normal dominante, em metros × repetições por metro (o `map` já vem em linear: a textura é sRGB)
      .replace("#include <map_fragment>", `{
  vec3 anTx = abs( vNormalMundoTx );
  vec2 uvTx = ( anTx.x > anTx.y && anTx.x > anTx.z ) ? vPosMundoTx.zy : ( ( anTx.y > anTx.z ) ? vPosMundoTx.xz : vPosMundoTx.xy );${rodar ? "\n  uvTx = uvTx.yx;" : ""}
  diffuseColor *= texture2D( map, uvTx * uRepTextura );
}`);
  };
  mat.customProgramCacheKey = () => (rodar ? `${CHAVE_PROGRAMA}-rodada` : CHAVE_PROGRAMA);
  mat.needsUpdate = true;
}

/** Tira a foto do material e volta à cor de antes. Sem nunca ter aplicado, não faz nada. A textura em si não se liberta aqui (é da cache). */
export function retirarTextura(mat: THREE.MeshStandardMaterial): void {
  const g = guardados.get(mat);
  if (!g) return;
  mat.map = null;
  mat.color.copy(g.cor);
  mat.onBeforeCompile = () => {};
  mat.customProgramCacheKey = () => "";
  guardados.delete(mat);
  mat.needsUpdate = true;
}

/* ------------------------------------------------------------------ a cache de texturas por URL */
interface Entrada { tex: THREE.Texture | null; estado: "a-carregar" | "pronta" | "falhou"; refs: number; ouvintes: Set<(t: THREE.Texture | null) => void> }
const cache = new Map<string, Entrada>();
/** Os URL com textura em cache (para os testes). */
export const texturasEmCache = (): string[] => [...cache.keys()];
/** A anisotropia pedida (a placa limita-a ao que suporta): o veio de frente e a ângulo fica nítido sem custo grande. */
const ANISOTROPIA_MAX = 4;

/**
 * Pede a textura de uma foto: `aoResolver` recebe a textura quando está pronta (ou já está em cache) ou null se a imagem falhar. Devolve a função que a larga: quando
 * a última larga, a textura liberta-se. A mesma foto pedida por várias peças carrega uma vez. `carregador`: para os testes.
 */
export function pedirTextura(url: string, aoResolver: (t: THREE.Texture | null) => void, carregador: Pick<THREE.TextureLoader, "load"> = new THREE.TextureLoader()): () => void {
  let e = cache.get(url);
  if (!e) {
    const nova: Entrada = { tex: null, estado: "a-carregar", refs: 0, ouvintes: new Set() };
    e = nova;
    cache.set(url, nova);
    carregador.load(
      url,
      (t) => {
        if (cache.get(url) !== nova) { t.dispose(); return; } // largaram-na antes de chegar
        t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISOTROPIA_MAX;
        nova.tex = t; nova.estado = "pronta";
        nova.ouvintes.forEach((f) => f(t));
      },
      undefined,
      (erro) => {
        if (cache.get(url) !== nova) return;
        console.warn("[catálogo] a foto da opção de cor não abriu; fica a cor lisa:", url, erro);
        nova.estado = "falhou";
        nova.ouvintes.forEach((f) => f(null));
      },
    );
  }
  const entrada = e;
  entrada.refs += 1;
  entrada.ouvintes.add(aoResolver);
  if (entrada.estado === "pronta") aoResolver(entrada.tex);
  else if (entrada.estado === "falhou") aoResolver(null);
  let largada = false;
  return () => {
    if (largada) return;
    largada = true;
    entrada.ouvintes.delete(aoResolver);
    entrada.refs -= 1;
    if (entrada.refs > 0) return;
    entrada.tex?.dispose();
    if (cache.get(url) === entrada) cache.delete(url);
  };
}
