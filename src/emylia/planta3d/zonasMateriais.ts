// 24/11 (fase 1): UM material por zona num genérico montado (montarGenerico). Os GLB só dizem «material corpo» e o visualizador pintava esse material partilhado de uma vez; aqui cada zona
// (frente, corpo, tampo, pés, estofo…, zonasGlb.ts) ganha uma CÓPIA do `corpo` e as malhas das suas partes passam a usá-la, para cada zona levar a sua foto ou cor. Um material por zona
// (não por malha): as três portas de uma frente partilham o mesmo. Só as malhas de material `corpo` mudam: o metal dos puxadores, o vidro e o resto ficam como são.
// A cor e a foto de cada zona aplicam-se EM CIMA, sem refazer o material (mexe-se nele em vez de o recriar): `aplicarAparenciaDasZonas`; o realce (só o brilho, `emissive`) à parte, em
// `aplicarRealceDasZonas`, para apontar de uma zona a outra não retirar nem repor as fotos.
// Os materiais de zona libertam-se com `libertar` ao desmontar; a foto em si é da cache de texturaProduto.ts (não se liberta aqui). Os 35 GLB não se regeneram.
import * as THREE from "three";
import type { CategoriaGlb } from "./categoriasGlb";
import type { MaterialZona } from "./aspetoZonas";
import { corDoMetal } from "./metal3d";
import { aplicarTextura, retirarTextura } from "./texturaProduto";
import { zonaDaParte, type ZonaGlb, type ZonasDoProduto } from "./zonasGlb";

/** A cor do brilho que realça uma zona (violeta, como a selecção das peças). */
export const COR_REALCE = "#7c3aed";
const INTENSIDADE_REALCE = 0.55;
const SEM_BRILHO = "#000000";

/** Uma parte do catálogo que o GLB não tem: avisa-se uma vez por categoria e parte (a zona fica sem essa malha, não parte nada). */
const partesEmFalta = new Set<string>();
function avisarParteEmFalta(categoria: string, parte: string): void {
  const chave = `${categoria}:${parte}`;
  if (partesEmFalta.has(chave)) return;
  partesEmFalta.add(chave);
  console.warn(`[catálogo] o modelo 3D «${categoria}» não tem a parte «${parte}»: a zona fica sem essa malha`);
}

/**
 * `porZona`: um material por zona, cópia do `corpo`. `fixas` (25/11): os puxadores de metal e afins, só das zonas ligadas explicitamente a um atributo (`ligadas`): também ganham uma cópia
 * própria, para a cor e o aspeto da zona lhes chegarem. Sem ligações `fixas` está vazio e tudo é como era.
 */
export interface MateriaisDeZona { porZona: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>; fixas: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>; libertar: () => void }

/** O que um material tinha ao ser copiado (rugosidade, metal e cor): é o que se repõe quando a zona deixa de ter aspeto ou cor. */
const DE_ORIGEM = new WeakMap<THREE.MeshStandardMaterial, { roughness: number; metalness: number; cor: THREE.Color }>();
const guardarOrigem = (m: THREE.MeshStandardMaterial): void => { DE_ORIGEM.set(m, { roughness: m.roughness, metalness: m.metalness, cor: m.color.clone() }); };

/**
 * O nó de uma parte do catálogo no grupo montado. Nos GLB o nó da parte (base, corpo, bica…) leva dentro uma malha que também se chama como o material («corpo»), e o GLTFLoader dá nomes
 * únicos: a malha da primeira parte fica «corpo» e o nó da parte «corpo» passa a «corpo_1». Procurar só pelo nome apanhava a malha da base em vez da parte «corpo», cuja malha ficava sem a
 * cópia da zona (sem o metal e sem a cor). Um nó que não seja uma malha, com o nome da parte (ou com o nome e o sufixo `_N` do carregador), tem prioridade; sem ele, o nome sozinho
 * (cenas de caixas, onde a malha é a própria parte).
 */
function noDaParte(grupo: THREE.Object3D, nome: string): THREE.Object3D | undefined {
  let exato: THREE.Object3D | undefined, sufixado: THREE.Object3D | undefined;
  grupo.traverse((o) => {
    if (o === grupo || (o as THREE.Mesh).isMesh) return;
    if (!exato && o.name === nome) exato = o;
    else if (!sufixado && o.name.startsWith(`${nome}_`) && /^\d+$/.test(o.name.slice(nome.length + 1))) sufixado = o;
  });
  return exato ?? sufixado ?? grupo.getObjectByName(nome);
}

/**
 * Cria, para cada zona que o modelo tem, uma cópia do material `corpo` e põe-na nas malhas de material `corpo` das partes dessa zona (partes escondidas incluídas: se voltarem a aparecer
 * com outra opção, o material já lá está). O `grupo` é o de `montarGenerico` (os nós têm o nome das partes).
 * 25/11: `ligadas` (as zonas com ligação explícita): as partes de material `metal` dessas zonas (os puxadores) também levam uma cópia, em `fixas`; sem `ligadas` só as de `corpo`, como sempre.
 */
export function criarMateriaisDeZona(grupo: THREE.Object3D, c: CategoriaGlb, ligadas?: readonly ZonaGlb[]): MateriaisDeZona {
  const porZona = new Map<ZonaGlb, THREE.MeshStandardMaterial>(), fixas = new Map<ZonaGlb, THREE.MeshStandardMaterial>();
  for (const parte of c.partes) {
    const zona = zonaDaParte(parte, c.id);
    const doCorpo = parte.mat === "corpo", doMetal = parte.mat === "metal" && !!zona && !!ligadas?.includes(zona);
    if (!zona || !(doCorpo || doMetal)) continue;
    const no = noDaParte(grupo, parte.nome);
    if (!no) { avisarParteEmFalta(c.id, parte.nome); continue; }
    const mapa = doCorpo ? porZona : fixas;
    no.traverse((o) => {
      const malha = o as THREE.Mesh;
      const atual = malha.material;
      if (!malha.isMesh || Array.isArray(atual) || atual.name !== (doCorpo ? "corpo" : "metal")) return;
      let mat = mapa.get(zona);
      if (!mat) { mat = (atual as THREE.MeshStandardMaterial).clone(); mat.name = atual.name; guardarOrigem(mat); mapa.set(zona, mat); }
      malha.material = mat;
    });
  }
  return { porZona, fixas, libertar: () => { porZona.forEach((m) => m.dispose()); fixas.forEach((m) => m.dispose()); } };
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
  /** 25/11: os materiais fixos das zonas ligadas (`criarMateriaisDeZona().fixas`): só levam o que a zona tem (cor, foto, aspeto); sem nada, ficam como o modelo os fez. */
  fixas?: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>;
  /**
   * 25/11: o mapa de ambiente COM CONTRASTE dos metais (ambienteMetal.ts), pedido só quando há uma zona de metal (nada se constrói sem metal). Sem ele o metal usa o ambiente da cena, como antes.
   * Só as zonas cujo `material` diz metal o levam; os não metais nunca (o ambiente deles não muda).
   */
  ambienteMetal?: () => THREE.Texture | null;
}

/** A partir de que `metalness` uma zona conta como metal (as zonas de metal levam 1; os não metais 0 ou nada). */
const LIMITE_METAL = 0.5;
/** A intensidade do mapa de ambiente dos metais: o mapa é escuro entre as caixas de luz, por isso um pouco acima de 1 para as caixas lerem-se como reflexos fortes. */
export const INTENSIDADE_AMBIENTE_METAL = 1.35;
const ehMetal = (m: MaterialZona | undefined): boolean => (m?.metalness ?? 0) >= LIMITE_METAL;

/** A rugosidade e o metal de uma zona: o que o `material` da zona manda e, sem ele (ou sem `metalness` nele), o que o material tinha ao ser copiado. */
function aplicarAspeto(mat: THREE.MeshStandardMaterial, material: MaterialZona | undefined, ambienteMetal?: () => THREE.Texture | null): void {
  const origem = DE_ORIGEM.get(mat);
  mat.roughness = material?.roughness ?? origem?.roughness ?? mat.roughness;
  mat.metalness = material?.metalness ?? origem?.metalness ?? mat.metalness;
  // o metal da zona reflecte o ambiente com contraste; tudo o resto (e o metal que o modelo traz de origem) fica com o ambiente da cena (envMap nulo, intensidade 1: o que sempre foi)
  const env = ehMetal(material) ? ambienteMetal?.() ?? null : null;
  mat.envMap = env;
  mat.envMapIntensity = env ? INTENSIDADE_AMBIENTE_METAL : 1;
}
/** A cor de base de uma zona: a da zona, e, num metal sem foto, a cor de metal (`corDoMetal`: a amostra de catálogo é pálida). */
const corDaZona = (cor: string, material: MaterialZona | undefined, comFoto: boolean): string => (ehMetal(material) && !comFoto ? corDoMetal(cor) : cor);

/**
 * Aplica a cor, a foto e o aspeto (rugosidade e metal) a cada material de zona (idempotente: repõe o que havia antes de aplicar o novo). Não mexe no realce.
 * O aspeto não depende de `porZona`: as zonas só têm `material` quando há «Tem aspeto» escolhido.
 */
export function aplicarAparenciaDasZonas(mats: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>, o: AparenciaDasZonas): void {
  for (const [zona, mat] of mats) {
    retirarTextura(mat);
    let cor = o.corBase, tex: THREE.Texture | undefined, lado = 0;
    const z = o.zonas?.zonas[zona];
    if (o.zonas?.porZona) {
      if (z?.cor) cor = z.cor;
      if (z?.textura) { tex = o.texturas.get(z.textura.url); lado = z.textura.ladoCm; }
    } else if (o.unica) { tex = o.unica.tex; lado = o.unica.lado; }
    mat.color.set(corDaZona(cor, z?.material, !!tex));
    if (tex) aplicarTextura(mat, tex, lado);
    aplicarAspeto(mat, z?.material, o.ambienteMetal);
  }
  // as partes fixas (puxadores de metal): só o que a zona leva; sem entrada, voltam à cor e ao metal de origem
  for (const [zona, mat] of o.fixas ?? []) {
    retirarTextura(mat);
    const z = o.zonas?.zonas[zona], tex = z?.textura ? o.texturas.get(z.textura.url) : undefined;
    const origem = DE_ORIGEM.get(mat);
    if (z?.cor) mat.color.set(corDaZona(z.cor, z.material, !!tex)); else if (origem) mat.color.copy(origem.cor);
    if (tex && z?.textura) aplicarTextura(mat, tex, z.textura.ladoCm);
    aplicarAspeto(mat, z?.material, o.ambienteMetal);
  }
}

/** Realça uma zona (brilho) e apaga o das outras; mexe só no `emissive`, por isso não obriga o material a recompilar nem toca na cor e na foto. */
export function aplicarRealceDasZonas(mats: ReadonlyMap<ZonaGlb, THREE.MeshStandardMaterial>, realce: ZonaGlb | null | undefined): void {
  for (const [zona, mat] of mats) {
    mat.emissive.set(realce === zona ? COR_REALCE : SEM_BRILHO);
    mat.emissiveIntensity = realce === zona ? INTENSIDADE_REALCE : 1;
  }
}
