// 24/11: os REVESTIMENTOS na pré-visualização 3D do produto (só para ver): uma amostra de chão ou de parede com as peças à medida real, as juntas e a foto da cor.
// Funções puras, sem React nem three:
//  - planearRevestimento: a grelha de peças da amostra (posições, tamanhos, cortes, tom), com um limite de peças;
//  - medidaDoRevestimento e aplicacaoDosAtributos: o que o produto diz (a Medida em mm ou cm, sem os limites de 5 a 400 cm do modelo 3D, que deitavam fora a espessura
//    de 3,5 mm de um laminado; e o atributo «Aplicação»);
//  - superficieDaPrevia: A REGRA DA VISTA POR OMISSÃO (chão ou parede), num só sítio (ver VISTA_POR_APLICACAO e VISTA_POR_SUBCATEGORIA);
//  - cenaDoRevestimento: a divisão mínima, onde fica a amostra e a câmara de cada caso;
//  - corDaJunta: a cor da argamassa.
// A PLANTA NÃO MUDA: o classificador continua a dar a «caixa» aos revestimentos (catalogo3d.ts) e a planta 3D continua a pintar o chão e as paredes com a textura
// procedural de revestimentos.ts (um só plano por superfície, a textura repetida por `modulo` em metros). Esse caminho não serve aqui: não tem peças soltas nem
// juntas com relevo, e não leva a foto da cor. O que se reaproveita é a convenção dele (a peça em metros, o lado maior na horizontal da superfície) e a textura da
// foto (texturaProduto.ts, mapeada no mundo). GANCHO PARA A PLANTA: para a planta desenhar um pavimento ou um revestimento com peças, basta pôr a amostra com
// `planearRevestimento({ superficie, areaM: [comprimento, altura] })` e o `AmostraRevestimento` do Visualizador3D por superfície (nada disso está ligado hoje).
import type { AtributoDef, AtributoProduto, DimensaoMedida } from "../v2/catalogoModelo";
import { sem } from "./catalogo3d";
import { ID_REVESTIMENTO_CHAO, ID_REVESTIMENTO_PAREDE } from "./modelos3dEscolha";
import { espacoVazio, paredesDoContorno, PE_DIREITO_OMISSAO, type Espaco } from "./modelo";

export type SuperficieRev = "chao" | "parede";

/** A peça quando a medida falta (cm). */
export const PECA_OMISSAO_CM: readonly [number, number] = [60, 60];
/** A espessura quando a medida não a diz (cm). */
export const ESPESSURA_OMISSAO_CM = 1;
/** A junta: 2 mm por omissão, entre 2 e 3 mm. */
export const JUNTA_MM_OMISSAO = 2, JUNTA_MM_MIN = 2, JUNTA_MM_MAX = 3;
/** A amostra (m): largura × fundo no chão, largura × altura na parede. */
export const AMOSTRA_M: Readonly<Record<SuperficieRev, readonly [number, number]>> = { chao: [1.2, 1.2], parede: [1.2, 1.6] };
/** A amostra cresce até aqui para mostrar 2 × 2 peças grandes (m); e não encolhe abaixo do mínimo quando as peças são muito pequenas. */
export const AMOSTRA_MAX_M = 4, AMOSTRA_MIN_M = 0.5;
/** No máximo, quantas peças se desenham (é tudo uma só geometria, mas o limite mantém-na leve). */
export const MAX_PECAS = 600;
/** A variação de tom entre peças: cada peça fica entre 1 − VARIACAO e 1 da cor (barato: uma cor por vértice). */
export const VARIACAO_TOM = 0.12;

/** Uma peça da amostra, em metros, no plano da amostra: `x` ao longo da largura, `y` ao longo do fundo (chão) ou da altura (parede); (x, y) é o canto de menor x e y. */
export interface PecaRev { x: number; y: number; w: number; h: number; fila: number; coluna: number; cortada: boolean; tom: number }
export interface PlanoRevestimento {
  superficie: SuperficieRev;
  /** A amostra (m): [largura, fundo ou altura]. */
  amostraM: [number, number];
  /** A peça desenhada (m), o lado maior primeiro (na horizontal): é a real vezes `escala`. */
  pecaM: [number, number];
  /** A peça real (cm), como veio (ou a de omissão). */
  pecaRealCm: [number, number];
  /** 1, ou mais quando as peças são tão pequenas que, mesmo com a amostra no mínimo, passariam o limite. */
  escala: number;
  espessuraM: number; juntaM: number;
  /** O desfasamento de uma fila para a seguinte (fração da peça): 0 na fiada simples (as juntas alinhadas). */
  desfasamento: number;
  pecas: PecaRev[];
  /** O que se mudou para caber no limite (a área reduzida, a peça aumentada), em português; null se nada. */
  aviso: string | null;
  medidaEmFalta: boolean;
}
export interface EntradaRevestimento {
  /** Os dois lados da peça (cm), por qualquer ordem: o maior fica na horizontal. */
  ladoPecaCm?: readonly [number, number] | readonly number[] | null;
  superficie: SuperficieRev;
  /** A área da amostra (m); sem ela, a de AMOSTRA_M. */
  areaM?: readonly [number, number];
  juntaMm?: number;
  espessuraCm?: number | null;
  /** 0 (fiada simples, por omissão) a 0,5 (meia peça). */
  desfasamento?: number;
}

const valido = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
/** O tom de uma peça: um número fixo por posição (não muda entre desenhos), entre 1 − VARIACAO_TOM e 1. */
const tomDe = (fila: number, coluna: number) => { const s = Math.sin(fila * 12.9898 + coluna * 78.233) * 43758.5453; return 1 - VARIACAO_TOM * (s - Math.floor(s)); };

/** Quantas peças cabem (com as cortadas), para uma amostra `w`×`h` e uma peça `u`×`v` com junta `j`. */
function contar(w: number, h: number, u: number, v: number, j: number, desf: number): number {
  return (Math.ceil((w + j) / (u + j)) + (desf > 0 ? 1 : 0)) * Math.ceil((h + j) / (v + j));
}

/**
 * A grelha de peças da amostra. A peça fica com o lado maior no eixo X (na parede, na horizontal); a amostra é a de omissão, cresce para mostrar pelo menos
 * 2 peças em cada sentido (laminados de 1 m ou mais), até AMOSTRA_MAX_M; se passar de MAX_PECAS, reduz a área (até AMOSTRA_MIN_M) e, se ainda não chegar, mostra
 * a peça maior do que é, e di-lo em `aviso`. As peças que passam da borda são cortadas: tudo fica dentro da amostra.
 */
export function planearRevestimento(e: EntradaRevestimento): PlanoRevestimento {
  const l = e.ladoPecaCm;
  const okLados = !!l && l.length >= 2 && valido(l[0], 0.1, 1000) && valido(l[1], 0.1, 1000);
  const real: [number, number] = okLados ? [Math.max(l[0], l[1]), Math.min(l[0], l[1])] : [PECA_OMISSAO_CM[0], PECA_OMISSAO_CM[1]];
  const juntaMm = Math.min(JUNTA_MM_MAX, Math.max(JUNTA_MM_MIN, valido(e.juntaMm, 0, 100) ? e.juntaMm : JUNTA_MM_OMISSAO));
  const j = juntaMm / 1000;
  const espessuraM = (valido(e.espessuraCm, 0.05, 10) ? e.espessuraCm : ESPESSURA_OMISSAO_CM) / 100;
  const desf = valido(e.desfasamento, 0, 0.5) ? e.desfasamento : 0;
  let u = real[0] / 100, v = real[1] / 100, escala = 1;
  const base = e.areaM && valido(e.areaM[0], 0.05, 100) && valido(e.areaM[1], 0.05, 100) ? e.areaM : AMOSTRA_M[e.superficie];
  // peças grandes: a amostra cresce para mostrar pelo menos duas em cada sentido, até ao máximo
  let w = base[0] < 2 * u ? Math.min(AMOSTRA_MAX_M, 2 * u + j) : base[0];
  let h = base[1] < 2 * v ? Math.min(AMOSTRA_MAX_M, 2 * v + j) : base[1];
  const avisos: string[] = [];
  if (contar(w, h, u, v, j, desf) > MAX_PECAS) {
    // peças pequenas: primeiro a área (mantém a proporção, até ao mínimo), depois a peça mostrada
    for (let i = 0; i < 60 && contar(w, h, u, v, j, desf) > MAX_PECAS && (w > AMOSTRA_MIN_M || h > AMOSTRA_MIN_M); i++) {
      w = Math.max(AMOSTRA_MIN_M, w * 0.95); h = Math.max(AMOSTRA_MIN_M, h * 0.95);
    }
    w = Math.round(w * 1000) / 1000; h = Math.round(h * 1000) / 1000;
    avisos.push(`a amostra mostra só ${nf(w)} × ${nf(h)} m`);
    while (contar(w, h, u, v, j, desf) > MAX_PECAS) { escala *= 1.1; u = (real[0] / 100) * escala; v = (real[1] / 100) * escala; }
    if (escala > 1) avisos.push(`as peças aparecem maiores do que são (${nf(Math.round(escala * 10) / 10)} vezes)`);
  }
  const pecas: PecaRev[] = [];
  for (let fila = 0, y = 0; y < h - 1e-9; fila++, y += v + j) {
    const desloc = fila % 2 === 1 ? desf * (u + j) : 0;
    const y1 = Math.min(h, y + v);
    if (y1 - y < 0.002) break;
    for (let coluna = 0, x = -desloc; x < w - 1e-9; coluna++, x += u + j) {
      const x0 = Math.max(0, x), x1 = Math.min(w, x + u);
      if (x1 - x0 < 0.002) continue;
      const cortada = x0 > x + 1e-9 || x1 < x + u - 1e-9 || y1 < y + v - 1e-9;
      pecas.push({ x: x0, y, w: x1 - x0, h: y1 - y, fila, coluna, cortada, tom: tomDe(fila, coluna) });
    }
  }
  return {
    superficie: e.superficie, amostraM: [w, h], pecaM: [u, v], pecaRealCm: real, escala, espessuraM, juntaM: j, desfasamento: desf, pecas,
    aviso: avisos.length ? `Peças pequenas: ${avisos.join(" e ")}.` : null, medidaEmFalta: !okLados,
  };
}

/* ------------------------------------------------------------------ o que o produto diz */
export interface MedidaRevestimento { ladoCm: [number, number]; espessuraCm?: number }
/** Uma dimensão em cm (o número ou o limite superior de um intervalo; mm passa a cm), sem os limites do modelo 3D; ilegível: undefined. */
function dimCm(d: DimensaoMedida | null | undefined, unidade: "cm" | "mm"): number | undefined {
  const v = typeof d === "number" ? d : d && typeof d === "object" ? d.ate : Number.NaN;
  if (!valido(v, 0, Infinity) || v <= 0) return undefined;
  return Math.round((unidade === "mm" ? v / 10 : v) * 1000) / 1000;
}
/** A Medida (2D ou 3D) de um revestimento em cm: os dois lados e, se houver, a espessura (em mm num laminado: 3,5 mm = 0,35 cm). 1D, sem medida ou ilegível: null. */
export function medidaDoRevestimento(attrs: readonly AtributoProduto[] | undefined): MedidaRevestimento | null {
  const m = attrs?.find((a) => a.medida)?.medida;
  if (!m || m.tipo === "1D") return null;
  const l = dimCm(m.largura, m.unidade), c = dimCm(m.comprimento, m.unidade), e = dimCm(m.espessura, m.unidade);
  if (l === undefined || c === undefined) return null;
  return e === undefined ? { ladoCm: [l, c] } : { ladoCm: [l, c], espessuraCm: e };
}
/** O valor escolhido no atributo «Aplicação» (o nome da opção, senão o texto); sem atributo ou sem escolha: null. */
export function aplicacaoDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | null {
  const def = defs?.find((d) => sem(d.nome).trim() === "aplicacao" || d.codigo.toLowerCase() === "aplicacao");
  const a = def && attrs?.find((x) => x.atributoId === def.id && (x.opcaoId || x.valor));
  if (!def || !a) return null;
  const op = a.opcaoId ? def.opcoes.find((o) => o.id === a.opcaoId) : undefined;
  return op?.nome || op?.valor || a.valor || null;
}

/* ------------------------------------------------------------------ A REGRA DA VISTA POR OMISSÃO (só a pré-visualização; não grava nada) */
/**
 * 1. O modelo resolvido (produto > subcategoria > categoria) manda: `revestimento_chao` → chão, `revestimento_parede` → parede; outro modelo escolhido → não é esta vista.
 * 2. Automático (nenhum modelo escolhido) e o produto está na categoria «Revestimentos»: o atributo «Aplicação», se disser um só dos dois (VISTA_POR_APLICACAO); senão a
 *    subcategoria (VISTA_POR_SUBCATEGORIA, a primeira que bate); senão o chão.
 * 3. Automático e não é um revestimento: null (fica exactamente como hoje).
 * Afinar aqui: as duas listas abaixo (o texto compara-se sem acentos e em minúsculas).
 */
export const CATEGORIA_REVESTIMENTOS = /revestiment/;
export const VISTA_POR_APLICACAO: ReadonlyArray<readonly [RegExp, SuperficieRev]> = [[/pavimento|chao/, "chao"], [/parede|revestimento/, "parede"]];
/** A ordem conta: «Cerâmico Laminado» é chão antes de «Cerâmico» ser parede. */
export const VISTA_POR_SUBCATEGORIA: ReadonlyArray<readonly [RegExp, SuperficieRev]> = [
  [/laminad/, "chao"], [/\bspc\b/, "chao"], [/porcelan/, "chao"], [/ceramic|azulej/, "parede"],
];
export const VISTA_OMISSAO_REVESTIMENTO: SuperficieRev = "chao";

export interface EntradaVista { modelo: string | null | undefined; categoria?: string | null; subcategoria?: string | null; aplicacao?: string | null }
export function superficieDaPrevia({ modelo, categoria, subcategoria, aplicacao }: EntradaVista): SuperficieRev | null {
  if (modelo === ID_REVESTIMENTO_CHAO) return "chao";
  if (modelo === ID_REVESTIMENTO_PAREDE) return "parede";
  if (modelo) return null;
  if (!categoria || !CATEGORIA_REVESTIMENTOS.test(sem(categoria))) return null;
  if (aplicacao) {
    const t = sem(aplicacao), achadas = new Set(VISTA_POR_APLICACAO.filter(([re]) => re.test(t)).map(([, s]) => s));
    if (achadas.size === 1) return [...achadas][0];
  }
  const s = subcategoria ? sem(subcategoria) : "";
  return VISTA_POR_SUBCATEGORIA.find(([re]) => re.test(s))?.[1] ?? VISTA_OMISSAO_REVESTIMENTO;
}

/* ------------------------------------------------------------------ a cena */
type V3 = [number, number, number];
/** Onde fica a amostra no mundo: `origem` é o canto (x, y, z) de menor x; no chão a largura vai em +X e o fundo em +Z; na parede a largura em +X e a altura em +Y. */
export interface AmostraNoMundo { plano: PlanoRevestimento; origem: V3 }
export interface CenaRevestimento { espaco: Espaco; amostra: AmostraNoMundo; camara: { chave: string; pos: V3; alvo: V3; distMin: number; distMax: number } }

const FOLGA_M = 1, FOLGA_CAMARA_M = 0.6, LADO_MIN_M = 2, FOLGA_PE_DIREITO_M = 0.4, DIST_MIN_M = 1, DIST_MAX_M = 12;
/** Os limites do zoom: como os da peça (a partir de 25 cm e até 3 vezes a distância de partida), aqui sempre a 30 cm (a amostra é plana: aproxima-se para ver as juntas). */
const ZOOM_MIN_M = 0.3, ZOOM_AFASTAR = 3;
/** As direções da câmara: no chão, a ¾ e bem por cima; na parede, de frente, um pouco de lado e quase à altura do centro. */
const DIRECAO: Readonly<Record<SuperficieRev, V3>> = { chao: [0.55, 1.15, 1], parede: [0.32, 0.12, 1] };

/** A divisão mínima (quadrada, sem peças) com a amostra no chão, ao centro, ou na parede do fundo (z = 0, a partir do chão), e a câmara a enquadrá-la. */
export function cenaDoRevestimento(plano: PlanoRevestimento, nome: string): CenaRevestimento {
  const [w, h] = plano.amostraM, chao = plano.superficie === "chao";
  // na parede quem limita é a altura (a abertura vertical da câmara é de 35°: 1,6 m de altura pede ~2,9 m de distância)
  const dist = Math.min(DIST_MAX_M, Math.max(DIST_MIN_M, (chao ? Math.max(w, h) * 1.3 : Math.max(w * 1.3, h * 1.9)) + 0.3));
  const d = DIRECAO[plano.superficie], k = dist / Math.hypot(...d);
  // a divisão contém a câmara com folga (uma câmara dentro da espessura de uma parede só via cinzento), e a amostra com FOLGA_M
  const lado = Math.max(LADO_MIN_M, Math.max(w, chao ? h : 0) + FOLGA_M, 2 * Math.max(d[0], d[2]) * k + FOLGA_CAMARA_M), centro = lado / 2;
  const vazio = espacoVazio("outro", nome || "Revestimento");
  const espaco: Espaco = {
    // o chão e as paredes da divisão lisos (microcimento e tinta branca): o chão de omissão é um cerâmico 60×60 desenhado, que se confundia com a amostra
    ...vazio, revestimentos: { ...vazio.revestimentos, pavimento: "microcimento", parede: "tinta_branca" },
    peDireito: Math.max(PE_DIREITO_OMISSAO, chao ? 0 : h + FOLGA_PE_DIREITO_M),
    paredes: paredesDoContorno([{ x: 0, y: 0 }, { x: lado, y: 0 }, { x: lado, y: lado }, { x: 0, y: lado }]), pecas: [],
  };
  const origem: V3 = chao ? [centro - w / 2, 0, centro - h / 2] : [centro - w / 2, 0, 0];
  const alvo: V3 = chao ? [centro, 0, centro] : [centro, h / 2, 0];
  const pos: V3 = [alvo[0] + d[0] * k, alvo[1] + d[1] * k, alvo[2] + d[2] * k];
  const chave = `rev-${plano.superficie}-${[w, h, ...plano.pecaM].map((x) => Math.round(x * 1000)).join("x")}`;
  return { espaco, amostra: { plano, origem }, camara: { chave, pos, alvo, distMin: Math.min(dist, ZOOM_MIN_M), distMax: dist * ZOOM_AFASTAR } };
}

/* ------------------------------------------------------------------ a argamassa */
const HEX6 = /^#([0-9a-f]{6})$/i, HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const JUNTA_OMISSAO = "#8f8c86";
/** A cor da argamassa: o cinzento da luminância da peça (com um quarto da cor dela), a 62 %: cinzenta e mais escura do que a peça (com 2 mm de junta, sem contraste não se via). Cor inválida: o cinzento de omissão. */
export function corDaJunta(hex: string): string {
  const m3 = HEX3.exec(hex), m6 = HEX6.exec(m3 ? `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}` : hex);
  if (!m6) return JUNTA_OMISSAO;
  const n = parseInt(m6[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return `#${rgb.map((c) => Math.round(Math.min(255, (0.75 * lum + 0.25 * c) * 0.62)).toString(16).padStart(2, "0")).join("")}`;
}
