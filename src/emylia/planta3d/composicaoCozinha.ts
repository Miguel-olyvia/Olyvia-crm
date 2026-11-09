// Protótipo (visualizador 3D): COMPOSIÇÃO MODULAR DE COZINHA, como as que se vendem: uma fila de módulos alinhados (colunas, bases com portas ou
// gavetas, forno encastrado; e, por cima de cada base, um armário de parede opcional). É UMA peça da planta (como a bancada composta: mexe-se e roda
// como um bloco, encosta à parede ao entrar; a ilha fica solta), e cada módulo é uma linha vendável à parte, com o desconto da composição só
// quando estão todos os obrigatórios do predefinido. Os módulos desenham-se com os modelos genéricos da cozinha (categoriasGlb.ts). Funções puras, cm.
import type { PecaPlanta } from "../planta";
import type { ProdutoModelo3D } from "./catalogo3d";

export type TipoModulo = "coluna_despensa" | "coluna_forno" | "coluna_frigorifico" | "base_portas" | "base_gavetas" | "base_forno";
export interface Modulo { id: string; tipo: TipoModulo; largura: number; cor: string; /** armário de parede por cima (só nas bases) */ parede?: boolean }
export interface ComposicaoCozinha { predefinido: string; nome: string; modulos: Modulo[]; /** solta no meio (ilha): não encosta à parede */ ilha: boolean }

/** Medidas (cm): profundidade e altura dos módulos de chão, dos de parede e a altura deles ao chão. */
export const MEDIDAS_COZINHA = { prof: 60, alturaBase: 87, alturaColuna: 210, profParede: 35, alturaParede: 70, chaoParede: 145 } as const;
export const ROTULO_MODULO: Record<TipoModulo, string> = {
  coluna_despensa: "Coluna despensa", coluna_forno: "Coluna de forno", coluna_frigorifico: "Coluna de frigorífico",
  base_portas: "Base com portas", base_gavetas: "Base com gavetas", base_forno: "Base com forno encastrado e gavetão",
};
/** Preço de demonstração por módulo de 60 cm (proporcional à largura) e do armário de parede. */
const PRECO_60: Record<TipoModulo, number> = { coluna_despensa: 420, coluna_forno: 390, coluna_frigorifico: 410, base_portas: 180, base_gavetas: 260, base_forno: 230 };
const PRECO_PAREDE_60 = 150;
/** Desconto da composição (sobre a soma), só com todos os módulos obrigatórios do predefinido. */
export const DESCONTO_COMPOSICAO = 0.08;
export const LARGURAS = [30, 40, 45, 50, 60, 80, 90, 100, 120] as const;
const ehColuna = (t: TipoModulo): boolean => t.startsWith("coluna");

const M = (id: string, tipo: TipoModulo, largura: number, parede = false, cor = "#e9e4da"): Modulo => ({ id, tipo, largura, cor, ...(parede ? { parede } : {}) });
export interface Predefinido { id: string; nome: string; ilha: boolean; modulos: Modulo[]; /** os módulos (ids) sem os quais não há desconto */ obrigatorios: string[] }
export const PREDEFINIDOS: Predefinido[] = [
  { id: "colunas_forno", nome: "Duas colunas com forno no meio", ilha: false, obrigatorios: ["c1", "f", "c2"], modulos: [M("c1", "coluna_despensa", 60), M("f", "base_forno", 60, true), M("c2", "coluna_despensa", 60)] },
  { id: "frigorifico_bases", nome: "Coluna de frigorífico e bases", ilha: false, obrigatorios: ["fr", "g", "p", "cf"], modulos: [M("fr", "coluna_frigorifico", 60), M("g", "base_gavetas", 60), M("p", "base_portas", 80), M("cf", "coluna_forno", 60)] },
  { id: "bancada_parede", nome: "Bancada com módulos de parede", ilha: false, obrigatorios: ["b1", "b2", "b3"], modulos: [M("b1", "base_portas", 60, true), M("b2", "base_gavetas", 60, true), M("b3", "base_portas", 80, true)] },
  { id: "ilha_gavetas", nome: "Ilha com gavetas", ilha: true, obrigatorios: ["i1", "i2", "i3"], modulos: [M("i1", "base_gavetas", 60), M("i2", "base_gavetas", 60), M("i3", "base_gavetas", 60)] },
];
export const predefinido = (id: string): Predefinido | undefined => PREDEFINIDOS.find((p) => p.id === id);
export const composicaoDe = (p: Predefinido): ComposicaoCozinha => ({ predefinido: p.id, nome: p.nome, ilha: p.ilha, modulos: p.modulos.map((m) => ({ ...m })) });

export const larguraTotal = (c: ComposicaoCozinha): number => c.modulos.reduce((s, m) => s + m.largura, 0);
export const alturaTotal = (c: ComposicaoCozinha): number => (c.modulos.some((m) => ehColuna(m.tipo) || m.parede) ? MEDIDAS_COZINHA.alturaColuna : MEDIDAS_COZINHA.alturaBase);

/* ------------------------------------------------------------------ editar: as operações devolvem uma composição nova (sem mutar) */
export const mudarModulo = (c: ComposicaoCozinha, id: string, m: Partial<Omit<Modulo, "id">>): ComposicaoCozinha =>
  ({ ...c, modulos: c.modulos.map((x) => (x.id === id ? { ...x, ...m, ...(m.tipo && ehColuna(m.tipo) ? { parede: false } : {}) } : x)) });
export const retirarModulo = (c: ComposicaoCozinha, id: string): ComposicaoCozinha => ({ ...c, modulos: c.modulos.length > 1 ? c.modulos.filter((x) => x.id !== id) : c.modulos });
export function moverModulo(c: ComposicaoCozinha, id: string, passo: -1 | 1): ComposicaoCozinha {
  const i = c.modulos.findIndex((x) => x.id === id), j = i + passo;
  if (i < 0 || j < 0 || j >= c.modulos.length) return c;
  const l = [...c.modulos];
  [l[i], l[j]] = [l[j], l[i]];
  return { ...c, modulos: l };
}
export function acrescentarModulo(c: ComposicaoCozinha, tipo: TipoModulo = "base_portas", largura = 60): ComposicaoCozinha {
  let n = c.modulos.length + 1;
  while (c.modulos.some((x) => x.id === `m${n}`)) n++;
  return { ...c, modulos: [...c.modulos, M(`m${n}`, tipo, largura, false, c.modulos[c.modulos.length - 1]?.cor)] };
}

/* ------------------------------------------------------------------ como peça da planta e como produto 3D */
export function pecaComposicao(id: string, canto: { x: number; y: number }, c: ComposicaoCozinha): PecaPlanta {
  return { id, tipo: "movel", x: canto.x, y: canto.y, w: larguraTotal(c), h: MEDIDAS_COZINHA.prof, rot: 0, mont: "chao", alt: 0, esp: false, nome: c.nome, dh: alturaTotal(c), coz: c };
}
/** Muda a composição de uma peça: a largura passa para a caixa, mantendo o centro. */
export function aplicarComposicao(p: PecaPlanta, c: ComposicaoCozinha): PecaPlanta {
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2, w = larguraTotal(c);
  return { ...p, coz: c, w, x: Math.round((cx - w / 2) * 10) / 10, y: Math.round((cy - p.h / 2) * 10) / 10, dh: alturaTotal(c) };
}
export function modeloDaComposicao(pecaId: string, c: ComposicaoCozinha): ProdutoModelo3D {
  const w = larguraTotal(c), a = alturaTotal(c);
  return {
    produtoId: `cozinha|${pecaId}`, nome: c.nome, tipo: "movel", dimensoes: { larguraCm: w, profundidadeCm: MEDIDAS_COZINHA.prof, alturaCm: a, deNome: false },
    mockup3d: { tipo: "movel", largura: w / 100, profundidade: MEDIDAS_COZINHA.prof / 100, altura: a / 100, cor: c.modulos[0]?.cor ?? "#e9e4da", params: { k: "cozinha", cfg: c } },
    categoria: "Composição de cozinha", montagem: "chao", alturaOmissao: 0, demo: true,
  };
}

/** Onde cada módulo fica (cm, a partir da esquerda; centro em x) e o que se desenha: a categoria genérica, as medidas, as opções e a altura ao chão. */
export interface PecaDoModulo { modulo: string; categoria: string; x: number; z: number; y: number; w: number; d: number; h: number; o: Record<string, string | boolean>; cor: string }
export function pecasDosModulos(c: ComposicaoCozinha): PecaDoModulo[] {
  const { prof, alturaBase, alturaColuna, profParede, alturaParede, chaoParede } = MEDIDAS_COZINHA, total = larguraTotal(c);
  // com colunas na fila, tudo acaba à altura das colunas: o forno vira uma coluna de forno CHEIA (porta em cima, nicho, gaveta em baixo, sem
  // vãos) e os armários de parede sobem até lá acima; os módulos ficam encostados (cada um começa onde o anterior acaba, sem folga)
  const comColunas = c.modulos.some((m) => ehColuna(m.tipo));
  const hParede = comColunas ? alturaColuna - chaoParede : alturaParede;
  let x0 = -total / 2;
  return c.modulos.flatMap((m): PecaDoModulo[] => {
    const x = x0 + m.largura / 2; x0 += m.largura;
    const base = { modulo: m.id, x, z: 0, y: 0, w: m.largura, d: prof, cor: m.cor };
    const parede = m.parede && !ehColuna(m.tipo) ? [{ ...base, categoria: "armario_parede", z: -prof / 2 + profParede / 2, y: chaoParede, d: profParede, h: hParede, o: { duas: m.largura > 50, vidro: false } }] : [];
    if (ehColuna(m.tipo) || (m.tipo === "base_forno" && comColunas)) return [{ ...base, categoria: "coluna_cozinha", h: alturaColuna, o: { interior: m.tipo === "base_forno" ? "forno" : m.tipo.slice(7) } }];
    if (m.tipo === "base_forno") return [{ ...base, categoria: "modulo_base", h: 27, o: { frentes: "gavetas", duas: false } }, { ...base, categoria: "forno", y: 27, h: alturaBase - 27, d: prof - 2, o: { tipo: "forno" } }, ...parede];
    return [{ ...base, categoria: "modulo_base", h: alturaBase, o: { frentes: m.tipo === "base_gavetas" ? "gavetas" : "portas", duas: m.largura > 50 } }, ...parede];
  });
}

/* ------------------------------------------------------------------ venda: cada módulo uma linha; desconto só com os obrigatórios */
export interface LinhaModulo { id: string; nome: string; preco: number; obrigatorio: boolean }
export function linhasDaComposicao(c: ComposicaoCozinha): LinhaModulo[] {
  const obrig = new Set(predefinido(c.predefinido)?.obrigatorios ?? []);
  return c.modulos.flatMap((m) => {
    const preco = Math.round((PRECO_60[m.tipo] * m.largura) / 60);
    const l: LinhaModulo[] = [{ id: m.id, nome: `${ROTULO_MODULO[m.tipo]} ${m.largura} cm`, preco, obrigatorio: obrig.has(m.id) }];
    if (m.parede && !ehColuna(m.tipo)) l.push({ id: `${m.id}-parede`, nome: `Armário de parede ${m.largura} cm`, preco: Math.round((PRECO_PAREDE_60 * m.largura) / 60), obrigatorio: false });
    return l;
  });
}
export interface PrecoComposicao { soma: number; total: number; poupanca: number; faltam: string[]; completo: boolean }
export function precoComposicao(c: ComposicaoCozinha): PrecoComposicao {
  const p = predefinido(c.predefinido), presentes = new Set(c.modulos.map((m) => m.id));
  const faltam = (p?.obrigatorios ?? []).filter((id) => !presentes.has(id)).map((id) => { const m = p?.modulos.find((x) => x.id === id); return m ? ROTULO_MODULO[m.tipo] : id; });
  const soma = linhasDaComposicao(c).reduce((s, l) => s + l.preco, 0), completo = faltam.length === 0, total = completo ? Math.round(soma * (1 - DESCONTO_COMPOSICAO) * 100) / 100 : soma;
  return { soma, total, poupanca: Math.round((soma - total) * 100) / 100, faltam, completo };
}
