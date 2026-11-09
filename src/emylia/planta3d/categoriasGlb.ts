// Os modelos GENÉRICOS por categoria (tudo o que não é do HTML): UM GLB simples por categoria (public/modelos3d/genericos/<id>.glb, gerado por
// scripts/gerar-modelos-glb.mjs a partir desta tabela) e cada produto só muda parâmetros por dentro. Esta é a tabela única e legível:
//  - partes: o nome estável da parte (é o nome do nó no GLB), a forma (uma peça unitária: caixa, caixa arredondada, cilindro, elipsoide), o
//    material (atribuído em runtime: `corpo` leva a cor e o acabamento do produto) e onde fica para um conjunto de parâmetros. A posição e a
//    escala de cada parte calculam-se das medidas reais (largura, profundidade, altura, em metros), mas o que não deve deformar fica fixo em
//    metros (a espessura do assento e da tampa, o diâmetro dos tubos, o perfil do resguardo, a espessura do vidro).
//  - opções: as escolhas da categoria (sanita com ou sem depósito, lavatório com coluna, resguardo de abrir ou de correr…), visíveis e
//    editáveis no painel da peça; ficam em `opc.gen` da peça.
// Sem React nem three: o gerador (Node) e o visualizador usam a mesma tabela.
import type { TipoMockup } from "./catalogo3d";

export type FormaGlb = "caixa" | "caixaR" | "cilindro" | "elipsoide";
/** Os materiais das partes: `corpo` é o do produto (cor e acabamento); os outros são fixos. */
export type MaterialGlb = "corpo" | "branco" | "metal" | "vidro" | "espelho" | "escuro" | "interior";
export type V3 = [number, number, number];
export interface ParamsGenerico { w: number; d: number; h: number; o: Readonly<Record<string, string | boolean>> }
export interface Colocacao { pos: V3; esc: V3; rot?: V3 }
export interface ParteGlb { nome: string; forma: FormaGlb; mat: MaterialGlb; colocar: (p: ParamsGenerico) => Colocacao; ver?: (p: ParamsGenerico) => boolean }
/** A omissão de uma opção: fixa, ou do tipo e do nome do produto (ex.: «Frigorífico DE ENCASTRE» abre com «de encastrar» ligado). */
export type OmissaoGlb<T> = T | ((t: TipoMockup, nome: string) => T);
export type OpcaoGlb =
  | { id: string; rotulo: string; tipo: "sim"; omissao: OmissaoGlb<boolean> }
  | { id: string; rotulo: string; tipo: "lista"; valores: { id: string; rotulo: string }[]; omissao: OmissaoGlb<string> };
/** `nome`: só os produtos cujo nome casa (para separar, no mesmo tipo, o armário superior da cozinha do armário de casa de banho, o forno do exaustor…). */
export interface CategoriaGlb {
  id: string; rotulo: string; tipos: TipoMockup[]; nome?: RegExp; partes: ParteGlb[]; opcoes: OpcaoGlb[];
  /** Presa à parede e no ar: a altura da base ao chão por omissão (m) e, se o nome não a der, a profundidade (m). */
  parede?: { alt: number; prof?: number };
}

/** Interruptor único dos genéricos em GLB: `false` volta aos mockups paramétricos de sempre (Visualizador3D, `Parametrico`). */
export const USAR_GLB_GENERICOS = true;
export const urlDoGenerico = (id: string): string => `/modelos3d/genericos/${id}.glb`;

const sim = (p: ParamsGenerico, id: string): boolean => p.o[id] !== false;
const min = Math.min, max = Math.max;
/** Altura do assento das sanitas e bidés de chão (m). */
const ASSENTO = 0.4;

const caixa = (nome: string, mat: MaterialGlb, colocar: ParteGlb["colocar"], ver?: ParteGlb["ver"]): ParteGlb => ({ nome, forma: "caixa", mat, colocar, ...(ver ? { ver } : {}) });
/** Rodapé recuado dos módulos de chão da cozinha (m). */
const RODAPE = 0.1;
/** O friso entre frentes (m): 2 mm, só relevo visual (os corpos ficam encostados, sem vão). */
const FRISO = 0.002;
/** Uma frente (porta ou gaveta) na face da frente, entre y0 e y1, de x0 a x1 (m). */
const frente = (nome: string, mat: MaterialGlb, f: (p: ParamsGenerico) => [number, number, number, number], ver?: ParteGlb["ver"]): ParteGlb =>
  caixa(nome, mat, (p) => { const [x0, x1, y0, y1] = f(p); return { pos: [(x0 + x1) / 2, (y0 + y1) / 2, p.d / 2 + 0.009], esc: [x1 - x0 - FRISO, y1 - y0 - FRISO, 0.018] }; }, ver);
/** Um puxador horizontal na frente, à altura y (m). */
const puxador = (nome: string, f: (p: ParamsGenerico) => [number, number], ver?: ParteGlb["ver"]): ParteGlb =>
  caixa(nome, "metal", (p) => { const [x, y] = f(p); return { pos: [x, y, p.d / 2 + 0.025], esc: [min(0.16, p.w * 0.35), 0.012, 0.014] }; }, ver);

/** Os genéricos da cozinha, do quarto e da sala (os de cozinha antes dos de casa de banho: o nome decide entre os do mesmo tipo). */
const CATEGORIAS_COZINHA: CategoriaGlb[] = [
  {
    id: "modulo_canto", rotulo: "Módulo de canto (cozinha)", tipos: ["movel"], nome: /canto/i, opcoes: [],
    partes: [
      caixa("corpo_a", "corpo", ({ w, d, h }) => ({ pos: [0, RODAPE + (h - RODAPE) / 2, -d / 2 + 0.3], esc: [w, h - RODAPE, 0.6] })),
      caixa("corpo_b", "corpo", ({ w, d, h }) => ({ pos: [-w / 2 + 0.3, RODAPE + (h - RODAPE) / 2, 0.3], esc: [0.6, h - RODAPE, max(0.01, d - 0.6)] })),
      caixa("rodape", "escuro", ({ w, d }) => ({ pos: [0, RODAPE / 2, -d / 2 + 0.25], esc: [w - 0.04, RODAPE, 0.5] })),
      frente("porta", "corpo", ({ w, h }) => [-w / 2 + 0.6, w / 2, RODAPE, h]),
      puxador("puxador", ({ w, h }) => [w / 4, h - 0.06]),
    ],
  },
  {
    id: "modulo_base", rotulo: "Módulo base (cozinha)", tipos: ["movel"], nome: /inferior|base|cozinha|gaveta|gavet/i,
    opcoes: [
      { id: "frentes", rotulo: "Frentes", tipo: "lista", valores: [{ id: "portas", rotulo: "Portas" }, { id: "gavetas", rotulo: "Gavetas" }], omissao: (_t, n) => (/gav/i.test(n) ? "gavetas" : "portas") },
      { id: "duas", rotulo: "Duas portas", tipo: "sim", omissao: true },
    ],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, RODAPE + (h - RODAPE) / 2, 0], esc: [w, h - RODAPE, d] })),
      caixa("rodape", "escuro", ({ w, d }) => ({ pos: [0, RODAPE / 2, d / 2 - 0.08], esc: [w - 0.02, RODAPE, 0.02] })),
      frente("porta_esq", "corpo", ({ w, h, o }) => (o.duas === false ? [-w / 2, w / 2, RODAPE, h] : [-w / 2, 0, RODAPE, h]), (p) => p.o.frentes !== "gavetas"),
      frente("porta_dir", "corpo", ({ w, h }) => [0, w / 2, RODAPE, h], (p) => p.o.frentes !== "gavetas" && p.o.duas !== false),
      ...[0, 1, 2].map((i) => frente(`gaveta_${i + 1}`, "corpo", ({ w, h }) => { const a = (h - RODAPE) / 3; return [-w / 2, w / 2, RODAPE + i * a, RODAPE + (i + 1) * a]; }, (p) => p.o.frentes === "gavetas")),
      ...[0, 1, 2].map((i) => puxador(`puxador_gaveta_${i + 1}`, ({ h }) => [0, RODAPE + ((i + 0.85) * (h - RODAPE)) / 3], (p) => p.o.frentes === "gavetas")),
      puxador("puxador_porta", ({ w, h, o }) => [o.duas === false ? w / 4 : 0, h - 0.06], (p) => p.o.frentes !== "gavetas"),
    ],
  },
  {
    id: "armario_parede", rotulo: "Armário de parede (cozinha)", tipos: ["armario_alto"], nome: /superior|parede|suspens/i, parede: { alt: 1.45, prof: 0.35 },
    opcoes: [{ id: "duas", rotulo: "Duas portas", tipo: "sim", omissao: true }, { id: "vidro", rotulo: "Portas de vidro", tipo: "sim", omissao: false }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] })),
      frente("porta_esq", "corpo", ({ w, h, o }) => (o.duas === false ? [-w / 2, w / 2, 0, h] : [-w / 2, 0, 0, h]), (p) => p.o.vidro !== true),
      frente("porta_dir", "corpo", ({ w, h }) => [0, w / 2, 0, h], (p) => p.o.vidro !== true && p.o.duas !== false),
      frente("vidro_esq", "vidro", ({ w, h, o }) => (o.duas === false ? [-w / 2, w / 2, 0, h] : [-w / 2, 0, 0, h]), (p) => p.o.vidro === true),
      frente("vidro_dir", "vidro", ({ w, h }) => [0, w / 2, 0, h], (p) => p.o.vidro === true && p.o.duas !== false),
      puxador("puxador", ({ w, o }) => [o.duas === false ? w / 4 : 0, 0.05]),
    ],
  },
  {
    id: "coluna_cozinha", rotulo: "Coluna alta (cozinha)", tipos: ["coluna", "armario_alto"], nome: /despensa|forno|frigor|coluna c\/espa|armário de coluna|coluna de cozinha/i,
    opcoes: [{ id: "interior", rotulo: "Coluna de", tipo: "lista", valores: [{ id: "despensa", rotulo: "Despensa" }, { id: "forno", rotulo: "Forno" }, { id: "frigorifico", rotulo: "Frigorífico" }], omissao: (_t, n) => (/forno/i.test(n) ? "forno" : /frigor/i.test(n) ? "frigorifico" : "despensa") }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, RODAPE + (h - RODAPE) / 2, 0], esc: [w, h - RODAPE, d] })),
      caixa("rodape", "escuro", ({ w, d }) => ({ pos: [0, RODAPE / 2, d / 2 - 0.08], esc: [w - 0.02, RODAPE, 0.02] })),
      frente("porta_alta", "corpo", ({ w, h, o }) => [-w / 2, w / 2, o.interior === "frigorifico" ? RODAPE + (h - RODAPE) * 0.45 : o.interior === "forno" ? RODAPE + 0.75 : RODAPE, h], undefined),
      frente("porta_baixa", "corpo", ({ w, h, o }) => [-w / 2, w / 2, RODAPE, o.interior === "frigorifico" ? RODAPE + (h - RODAPE) * 0.45 : RODAPE + 0.15], (p) => p.o.interior !== "despensa"),
      caixa("forno", "escuro", ({ w, d }) => ({ pos: [0, RODAPE + 0.45, d / 2 + 0.004], esc: [w - 0.04, 0.58, 0.008] }), (p) => p.o.interior === "forno"),
      caixa("forno_puxador", "metal", ({ w, d }) => ({ pos: [0, RODAPE + 0.68, d / 2 + 0.03], esc: [w * 0.7, 0.015, 0.015] }), (p) => p.o.interior === "forno"),
      puxador("puxador", ({ w, h, o }) => [w / 2 - 0.05, o.interior === "despensa" ? (RODAPE + h) / 2 : h - 0.3]),
    ],
  },
  {
    id: "frigorifico", rotulo: "Frigorífico", tipos: ["frigorifico"],
    opcoes: [
      { id: "americano", rotulo: "Americano (duas portas lado a lado)", tipo: "sim", omissao: (_t, n) => /americano/i.test(n) },
      { id: "encastre", rotulo: "De encastrar (frente de móvel)", tipo: "sim", omissao: (_t, n) => /encastr|integ/i.test(n) },
    ],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] })),
      frente("porta_cima", "corpo", ({ w, h }) => [-w / 2, w / 2, h * 0.62, h], (p) => p.o.americano !== true),
      frente("porta_baixo", "corpo", ({ w, h }) => [-w / 2, w / 2, 0, h * 0.62], (p) => p.o.americano !== true),
      frente("porta_esq", "corpo", ({ w, h }) => [-w / 2, 0, 0, h], (p) => p.o.americano === true),
      frente("porta_dir", "corpo", ({ w, h }) => [0, w / 2, 0, h], (p) => p.o.americano === true),
      caixa("puxador_1", "metal", ({ w, d, h, o }) => ({ pos: [o.americano === true ? -0.03 : w / 2 - 0.05, o.americano === true ? h * 0.55 : h * 0.75, d / 2 + 0.03], esc: [0.014, o.americano === true ? h * 0.4 : 0.25, 0.02] }), (p) => p.o.encastre !== true),
      caixa("puxador_2", "metal", ({ w, d, h, o }) => ({ pos: [o.americano === true ? 0.03 : w / 2 - 0.05, o.americano === true ? h * 0.55 : h * 0.45, d / 2 + 0.03], esc: [0.014, o.americano === true ? h * 0.4 : 0.25, 0.02] }), (p) => p.o.encastre !== true),
    ],
  },
  {
    id: "forno", rotulo: "Forno ou micro-ondas", tipos: ["eletro"], nome: /forno|micro/i,
    opcoes: [{ id: "tipo", rotulo: "Aparelho", tipo: "lista", valores: [{ id: "forno", rotulo: "Forno" }, { id: "micro", rotulo: "Micro-ondas" }], omissao: (_t, n) => (/micro/i.test(n) ? "micro" : "forno") }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] })),
      caixa("vidro", "escuro", ({ w, d, h, o }) => (o.tipo === "micro" ? { pos: [-w * 0.12, h * 0.48, d / 2 + 0.003], esc: [w * 0.66, h * 0.7, 0.006] } : { pos: [0, h * 0.42, d / 2 + 0.003], esc: [w * 0.86, h * 0.62, 0.006] })),
      caixa("painel", "escuro", ({ w, d, h, o }) => (o.tipo === "micro" ? { pos: [w * 0.36, h * 0.5, d / 2 + 0.003], esc: [w * 0.2, h * 0.8, 0.006] } : { pos: [0, h * 0.88, d / 2 + 0.003], esc: [w * 0.9, h * 0.14, 0.006] })),
      caixa("puxador", "metal", ({ w, d, h }) => ({ pos: [0, h * 0.76, d / 2 + 0.025], esc: [w * 0.72, 0.014, 0.016] }), (p) => p.o.tipo !== "micro"),
    ],
  },
  {
    id: "extrator", rotulo: "Exaustor (de parede ou de ilha)", tipos: ["eletro"], nome: /exaustor|extrator/i, parede: { alt: 1.5 },
    opcoes: [
      { id: "ilha", rotulo: "De ilha", tipo: "sim", omissao: (_t, n) => /ilha/i.test(n) },
      { id: "chamine", rotulo: "Com chaminé", tipo: "sim", omissao: (_t, n) => !/encastre|integr|convencional/i.test(n) },
    ],
    partes: [
      caixa("campanula", "corpo", ({ w, d }) => ({ pos: [0, 0.04, 0], esc: [w, 0.08, max(0.3, d)] })),
      caixa("filtro", "escuro", ({ w, d }) => ({ pos: [0, -0.001, 0], esc: [w * 0.85, 0.004, max(0.3, d) * 0.8] })),
      caixa("chamine", "corpo", ({ d, h, o }) => ({ pos: [0, 0.08 + max(0.2, h - 0.08) / 2, o.ilha === true ? 0 : -max(0.3, d) / 2 + 0.13], esc: [0.26, max(0.2, h - 0.08), 0.24] }), (p) => p.o.chamine !== false),
    ],
  },
  {
    id: "maquina_loica", rotulo: "Máquina de lavar loiça", tipos: ["eletro"], nome: /m[áa]quina.*(loi|lou)|lava.?loi[çc]a.*m[áa]q/i, opcoes: [{ id: "encastre", rotulo: "De encastrar (frente de móvel)", tipo: "sim", omissao: (_t, n) => /encastr|integ/i.test(n) }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] })),
      caixa("painel", "escuro", ({ w, d, h }) => ({ pos: [0, h - 0.05, d / 2 + 0.003], esc: [w * 0.95, 0.08, 0.006] }), (p) => p.o.encastre !== true),
      caixa("puxador", "metal", ({ w, d, h }) => ({ pos: [0, h - 0.12, d / 2 + 0.02], esc: [w * 0.5, 0.014, 0.016] })),
    ],
  },
  {
    id: "fogao", rotulo: "Fogão ou placa genérica", tipos: ["fogao", "placa"],
    opcoes: [{ id: "forno", rotulo: "Com forno (fogão)", tipo: "sim", omissao: (t) => t === "fogao" }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h, o }) => (o.forno === false ? { pos: [0, -0.025, 0], esc: [w * 0.92, 0.05, d * 0.9] } : { pos: [0, h / 2, 0], esc: [w, h, d] })),
      caixa("tampo", "escuro", ({ w, d, h, o }) => ({ pos: [0, (o.forno === false ? 0 : h) + 0.003, 0], esc: [w, 0.006, d] })),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i): ParteGlb => ({ nome: `zona_${i + 1}`, forma: "cilindro", mat: "metal", colocar: ({ w, d, h, o }) => ({ pos: [sx * w * 0.22, (o.forno === false ? 0 : h) + 0.008, sz * d * 0.22], esc: [min(w, d) * 0.28, 0.006, min(w, d) * 0.28] }) })),
      caixa("porta_forno", "escuro", ({ w, d, h }) => ({ pos: [0, h * 0.4, d / 2 + 0.004], esc: [w * 0.82, h * 0.5, 0.008] }), (p) => p.o.forno !== false),
      caixa("puxador", "metal", ({ w, d, h }) => ({ pos: [0, h * 0.7, d / 2 + 0.025], esc: [w * 0.6, 0.014, 0.016] }), (p) => p.o.forno !== false),
    ],
  },
  {
    id: "cama", rotulo: "Cama", tipos: ["cama"], opcoes: [{ id: "cabeceira", rotulo: "Com cabeceira", tipo: "sim", omissao: true }],
    partes: [
      caixa("estrado", "corpo", ({ w, d }) => ({ pos: [0, 0.15, 0], esc: [w, 0.3, d] })),
      { nome: "colchao", forma: "caixaR", mat: "branco", colocar: ({ w, d }) => ({ pos: [0, 0.39, 0.01], esc: [w - 0.04, 0.2, d - 0.04] }) },
      { nome: "almofada_1", forma: "caixaR", mat: "interior", colocar: ({ w, d }) => ({ pos: [-w / 4, 0.53, -d / 2 + 0.2], esc: [w / 2 - 0.08, 0.1, 0.3] }) },
      { nome: "almofada_2", forma: "caixaR", mat: "interior", colocar: ({ w, d }) => ({ pos: [w / 4, 0.53, -d / 2 + 0.2], esc: [w / 2 - 0.08, 0.1, 0.3] }) },
      caixa("cabeceira", "corpo", ({ w, d, h }) => ({ pos: [0, max(0.9, h) / 2, -d / 2 - 0.03], esc: [w + 0.04, max(0.9, h), 0.06] }), (p) => sim(p, "cabeceira")),
    ],
  },
  {
    id: "roupeiro", rotulo: "Roupeiro", tipos: ["roupeiro"],
    opcoes: [{ id: "correr", rotulo: "Portas de correr", tipo: "sim", omissao: (_t, n) => /correr/i.test(n) }],
    partes: [
      caixa("corpo", "corpo", ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] })),
      frente("porta_1", "corpo", ({ w, h }) => [-w / 2, -w / 6, 0.02, h - 0.02]),
      frente("porta_2", "corpo", ({ w, h }) => [-w / 6, w / 6, 0.02, h - 0.02]),
      frente("porta_3", "corpo", ({ w, h }) => [w / 6, w / 2, 0.02, h - 0.02]),
      caixa("calha", "metal", ({ w, d, h }) => ({ pos: [0, h - 0.01, d / 2 + 0.03], esc: [w, 0.02, 0.04] }), (p) => p.o.correr === true),
      ...[0, 1, 2].map((i) => caixa(`puxador_${i + 1}`, "metal", ({ w, d, h }) => ({ pos: [-w / 2 + ((i + 1) * w) / 3 - 0.04, h / 2, d / 2 + 0.025], esc: [0.014, 0.3, 0.016] }), (p) => p.o.correr !== true)),
    ],
  },
  {
    id: "secretaria", rotulo: "Secretária", tipos: ["secretaria"], opcoes: [{ id: "gavetas", rotulo: "Com bloco de gavetas", tipo: "sim", omissao: true }],
    partes: [
      caixa("tampo", "corpo", ({ w, d, h }) => ({ pos: [0, h - 0.015, 0], esc: [w, 0.03, d] })),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => caixa(`perna_${i + 1}`, "metal", ({ w, d, h }) => ({ pos: [sx * (w / 2 - 0.03), (h - 0.03) / 2, sz * (d / 2 - 0.03)], esc: [0.04, h - 0.03, 0.04] }))),
      caixa("gavetas", "corpo", ({ w, d, h }) => ({ pos: [w / 2 - 0.25, h - 0.03 - 0.3, 0], esc: [0.4, 0.6, d - 0.1] }), (p) => sim(p, "gavetas")),
    ],
  },
  {
    id: "sofa", rotulo: "Sofá", tipos: ["sofa"], opcoes: [{ id: "bracos", rotulo: "Com braços", tipo: "sim", omissao: true }],
    partes: [
      { nome: "base", forma: "caixaR", mat: "corpo", colocar: ({ w, d }) => ({ pos: [0, 0.22, 0.05], esc: [w, 0.3, d - 0.1] }) },
      { nome: "assento", forma: "caixaR", mat: "corpo", colocar: ({ w, d }) => ({ pos: [0, 0.42, 0.08], esc: [w - 0.3, 0.12, d - 0.3] }) },
      { nome: "encosto", forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, (0.2 + h) / 2, -d / 2 + 0.12], esc: [w, h - 0.2, 0.24] }) },
      { nome: "braco_esq", forma: "caixaR", mat: "corpo", ver: (p) => sim(p, "bracos"), colocar: ({ w, d }) => ({ pos: [-w / 2 + 0.1, 0.32, 0.03], esc: [0.2, 0.5, d - 0.06] }) },
      { nome: "braco_dir", forma: "caixaR", mat: "corpo", ver: (p) => sim(p, "bracos"), colocar: ({ w, d }) => ({ pos: [w / 2 - 0.1, 0.32, 0.03], esc: [0.2, 0.5, d - 0.06] }) },
    ],
  },
  {
    id: "mesa", rotulo: "Mesa", tipos: ["mesa"], opcoes: [{ id: "redonda", rotulo: "Tampo redondo", tipo: "sim", omissao: false }],
    partes: [
      caixa("tampo", "corpo", ({ w, d, h }) => ({ pos: [0, h - 0.02, 0], esc: [w, 0.04, d] }), (p) => p.o.redonda !== true),
      { nome: "tampo_redondo", forma: "cilindro", mat: "corpo", ver: (p) => p.o.redonda === true, colocar: ({ w, d, h }) => ({ pos: [0, h - 0.02, 0], esc: [w, 0.04, d] }) },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => caixa(`perna_${i + 1}`, "corpo", ({ w, d, h, o }) => { const k = o.redonda === true ? 0.3 : 0.5; return { pos: [sx * (w * k - 0.05), (h - 0.04) / 2, sz * (d * k - 0.05)], esc: [0.05, h - 0.04, 0.05] }; })),
    ],
  },
  {
    id: "prateleira", rotulo: "Prateleira ou estante", tipos: ["prateleira"], parede: { alt: 1.5 }, opcoes: [{ id: "suportes", rotulo: "Com suportes à vista", tipo: "sim", omissao: true }],
    partes: [
      caixa("tabua", "corpo", ({ w, d, h }) => ({ pos: [0, h - 0.0125, 0], esc: [w, min(0.025, h), d] })),
      caixa("suporte_esq", "metal", ({ w, d, h }) => ({ pos: [-w / 2 + 0.1, h - 0.06, -d / 2 + 0.01], esc: [0.02, 0.1, 0.02] }), (p) => sim(p, "suportes")),
      caixa("suporte_dir", "metal", ({ w, d, h }) => ({ pos: [w / 2 - 0.1, h - 0.06, -d / 2 + 0.01], esc: [0.02, 0.1, 0.02] }), (p) => sim(p, "suportes")),
    ],
  },
];

export const CATEGORIAS_GLB: CategoriaGlb[] = [...CATEGORIAS_COZINHA,
  {
    id: "sanita", rotulo: "Sanita de chão", tipos: ["sanita"],
    opcoes: [{ id: "deposito", rotulo: "Com depósito", tipo: "sim", omissao: true }],
    partes: [
      { nome: "pe", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => { const s = min(ASSENTO, h); return { pos: [0, s / 2 - 0.03, d * 0.06], esc: [w * 0.55, s - 0.06, d * 0.45] }; } },
      { nome: "cuvete", forma: "elipsoide", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, min(ASSENTO, h) - 0.08, d * 0.1], esc: [w, 0.18, d * 0.78] }) },
      { nome: "assento", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, min(ASSENTO, h) + 0.01, d * 0.1], esc: [w * 0.96, 0.02, d * 0.74] }) },
      { nome: "tampa", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, min(ASSENTO, h) + 0.03, d * 0.1], esc: [w * 0.92, 0.016, d * 0.7] }) },
      { nome: "deposito", forma: "caixaR", mat: "corpo", ver: (p) => sim(p, "deposito"), colocar: ({ w, d, h }) => { const s = min(ASSENTO, h), a = max(0.1, h - s); return { pos: [0, s + a / 2, -d / 2 + 0.09], esc: [w * 0.96, a, 0.18] }; } },
      { nome: "botao", forma: "cilindro", mat: "metal", ver: (p) => sim(p, "deposito"), colocar: ({ d, h }) => ({ pos: [0, max(h, ASSENTO + 0.1) + 0.004, -d / 2 + 0.09], esc: [0.05, 0.01, 0.05] }) },
    ],
  },
  {
    id: "sanita_suspensa", rotulo: "Sanita suspensa", tipos: ["sanita_suspensa"],
    opcoes: [{ id: "placa", rotulo: "Com placa de comando", tipo: "sim", omissao: true }],
    partes: [
      { nome: "corpo", forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h * 0.42, -d * 0.12], esc: [w * 0.9, h * 0.84, d * 0.76] }) },
      { nome: "cuvete", forma: "elipsoide", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h - 0.08, d * 0.08], esc: [w, 0.18, d * 0.84] }) },
      { nome: "assento", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h + 0.01, d * 0.08], esc: [w * 0.96, 0.02, d * 0.78] }) },
      { nome: "tampa", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h + 0.03, d * 0.08], esc: [w * 0.92, 0.016, d * 0.74] }) },
      { nome: "placa", forma: "caixa", mat: "metal", ver: (p) => sim(p, "placa"), colocar: ({ d, h }) => ({ pos: [0, h + 0.45, -d / 2 + 0.005], esc: [0.24, 0.16, 0.01] }) },
    ],
  },
  {
    id: "bide", rotulo: "Bidé", tipos: ["bide"],
    opcoes: [{ id: "torneira", rotulo: "Com torneira", tipo: "sim", omissao: true }],
    partes: [
      { nome: "pe", forma: "cilindro", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, (h - 0.06) / 2, d * 0.02], esc: [w * 0.6, h - 0.06, d * 0.5] }) },
      { nome: "cuvete", forma: "elipsoide", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h - 0.07, d * 0.05], esc: [w, 0.16, d * 0.9] }) },
      { nome: "interior", forma: "cilindro", mat: "interior", colocar: ({ w, d, h }) => ({ pos: [0, h + 0.008, d * 0.1], esc: [w * 0.75, 0.004, d * 0.6] }) },
      { nome: "torneira", forma: "cilindro", mat: "metal", ver: (p) => sim(p, "torneira"), colocar: ({ d, h }) => ({ pos: [0, h + 0.05, -d / 2 + 0.07], esc: [0.03, 0.1, 0.03] }) },
    ],
  },
  {
    id: "lavatorio", rotulo: "Lavatório", tipos: ["lavatorio", "lavatorio_pousar"],
    opcoes: [{ id: "coluna", rotulo: "Com coluna", tipo: "sim", omissao: (t) => t === "lavatorio" }],
    partes: [
      { nome: "bacia", forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => { const a = min(0.16, h); return { pos: [0, h - a / 2, 0], esc: [w, a, d] }; } },
      { nome: "cuba", forma: "elipsoide", mat: "interior", colocar: ({ w, d, h }) => ({ pos: [0, h - 0.004, d * 0.05], esc: [w * 0.78, 0.01, d * 0.7] }) },
      { nome: "ralo", forma: "cilindro", mat: "metal", colocar: ({ d, h }) => ({ pos: [0, h + 0.002, d * 0.05], esc: [0.04, 0.006, 0.04] }) },
      { nome: "coluna", forma: "cilindro", mat: "corpo", ver: (p) => sim(p, "coluna"), colocar: ({ d, h }) => { const a = max(0.05, h - 0.16); return { pos: [0, a / 2, -d * 0.12], esc: [0.2, a, 0.18] }; } },
    ],
  },
  {
    id: "movel_lavatorio", rotulo: "Móvel de lavatório", tipos: ["movel_lavatorio"],
    opcoes: [{ id: "gavetas", rotulo: "Frentes", tipo: "lista", valores: [{ id: "gavetas", rotulo: "Duas gavetas" }, { id: "portas", rotulo: "Duas portas" }], omissao: "gavetas" }],
    partes: [
      { nome: "caixa", forma: "caixa", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, (h - 0.03) / 2, 0], esc: [w, h - 0.03, d] }) },
      { nome: "lavatorio", forma: "caixaR", mat: "branco", colocar: ({ w, d, h }) => ({ pos: [0, h - 0.015, 0.005], esc: [w + 0.01, 0.03, d + 0.01] }) },
      { nome: "cuba", forma: "elipsoide", mat: "interior", colocar: ({ w, d, h }) => ({ pos: [0, h + 0.001, 0.02], esc: [w * 0.7, 0.006, d * 0.6] }) },
      { nome: "frente_cima", forma: "caixa", mat: "corpo", ver: (p) => p.o.gavetas !== "portas", colocar: ({ w, d, h }) => { const a = (h - 0.03) / 2 - 0.008; return { pos: [0, (h - 0.03) * 0.75, d / 2 + 0.009], esc: [w - 0.01, a, 0.018] }; } },
      { nome: "frente_baixo", forma: "caixa", mat: "corpo", ver: (p) => p.o.gavetas !== "portas", colocar: ({ w, d, h }) => { const a = (h - 0.03) / 2 - 0.008; return { pos: [0, (h - 0.03) * 0.25, d / 2 + 0.009], esc: [w - 0.01, a, 0.018] }; } },
      { nome: "porta_esq", forma: "caixa", mat: "corpo", ver: (p) => p.o.gavetas === "portas", colocar: ({ w, d, h }) => ({ pos: [-w / 4, (h - 0.03) / 2, d / 2 + 0.009], esc: [w / 2 - 0.008, h - 0.045, 0.018] }) },
      { nome: "porta_dir", forma: "caixa", mat: "corpo", ver: (p) => p.o.gavetas === "portas", colocar: ({ w, d, h }) => ({ pos: [w / 4, (h - 0.03) / 2, d / 2 + 0.009], esc: [w / 2 - 0.008, h - 0.045, 0.018] }) },
      { nome: "puxador_1", forma: "caixa", mat: "metal", colocar: ({ w, d, h, o }) => (o.gavetas === "portas" ? { pos: [-0.03, (h - 0.03) * 0.6, d / 2 + 0.025], esc: [0.012, 0.12, 0.014] } : { pos: [0, (h - 0.03) * 0.9, d / 2 + 0.025], esc: [min(0.2, w * 0.4), 0.012, 0.014] }) },
      { nome: "puxador_2", forma: "caixa", mat: "metal", colocar: ({ w, d, h, o }) => (o.gavetas === "portas" ? { pos: [0.03, (h - 0.03) * 0.6, d / 2 + 0.025], esc: [0.012, 0.12, 0.014] } : { pos: [0, (h - 0.03) * 0.4, d / 2 + 0.025], esc: [min(0.2, w * 0.4), 0.012, 0.014] }) },
    ],
  },
  {
    id: "banheira", rotulo: "Banheira", tipos: ["banheira"],
    opcoes: [{ id: "torneira", rotulo: "Com torneira", tipo: "sim", omissao: true }],
    partes: [
      { nome: "corpo", forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] }) },
      { nome: "interior", forma: "caixaR", mat: "interior", colocar: ({ w, d, h }) => ({ pos: [0, h - 0.002, 0], esc: [w - 0.12, 0.01, d - 0.12] }) },
      { nome: "ralo", forma: "cilindro", mat: "metal", colocar: ({ w, h }) => ({ pos: [-w / 2 + 0.2, h + 0.005, 0], esc: [0.05, 0.004, 0.05] }) },
      { nome: "torneira", forma: "cilindro", mat: "metal", ver: (p) => sim(p, "torneira"), colocar: ({ w, h }) => ({ pos: [-w / 2 + 0.03, h + 0.06, 0], esc: [0.03, 0.12, 0.03] }) },
      { nome: "bica", forma: "cilindro", mat: "metal", ver: (p) => sim(p, "torneira"), colocar: ({ w, h }) => ({ pos: [-w / 2 + 0.08, h + 0.11, 0], esc: [0.025, 0.11, 0.025], rot: [0, 0, Math.PI / 2] }) },
    ],
  },
  {
    id: "base_duche", rotulo: "Base de duche", tipos: ["base_duche"],
    opcoes: [{ id: "ralo", rotulo: "Ralo", tipo: "lista", valores: [{ id: "redondo", rotulo: "Redondo" }, { id: "linear", rotulo: "Linear" }], omissao: "redondo" }],
    partes: [
      { nome: "base", forma: "caixaR", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] }) },
      { nome: "ralo_redondo", forma: "cilindro", mat: "metal", ver: (p) => p.o.ralo !== "linear", colocar: ({ h }) => ({ pos: [0, h + 0.002, 0], esc: [0.12, 0.004, 0.12] }) },
      { nome: "ralo_linear", forma: "caixa", mat: "metal", ver: (p) => p.o.ralo === "linear", colocar: ({ w, d, h }) => ({ pos: [0, h + 0.002, -d / 2 + 0.08], esc: [w * 0.7, 0.004, 0.05] }) },
    ],
  },
  {
    id: "resguardo", rotulo: "Resguardo de duche", tipos: ["resguardo"],
    opcoes: [{ id: "abertura", rotulo: "Porta", tipo: "lista", valores: [{ id: "abrir", rotulo: "De abrir" }, { id: "correr", rotulo: "De correr" }], omissao: "correr" }],
    partes: [
      { nome: "vidro_fixo", forma: "caixa", mat: "vidro", colocar: ({ w, h }) => ({ pos: [-w / 4, h / 2, 0], esc: [w / 2, h - 0.02, 0.008] }) },
      { nome: "vidro_porta", forma: "caixa", mat: "vidro", colocar: ({ w, h, o }) => ({ pos: [w / 4 - (o.abertura === "abrir" ? 0 : 0.02), h / 2, o.abertura === "abrir" ? 0 : 0.02], esc: [w / 2, h - 0.02, 0.008] }) },
      { nome: "perfil_base", forma: "caixa", mat: "metal", colocar: ({ w }) => ({ pos: [0, 0.01, 0.01], esc: [w, 0.02, 0.04] }) },
      { nome: "perfil_topo", forma: "caixa", mat: "metal", ver: (p) => p.o.abertura !== "abrir", colocar: ({ w, h }) => ({ pos: [0, h - 0.01, 0.01], esc: [w, 0.02, 0.04] }) },
      { nome: "dobradica", forma: "caixa", mat: "metal", ver: (p) => p.o.abertura === "abrir", colocar: ({ h }) => ({ pos: [0, h * 0.75, 0], esc: [0.03, 0.06, 0.02] }) },
      { nome: "puxador", forma: "cilindro", mat: "metal", colocar: ({ w, h }) => ({ pos: [w / 2 - 0.08, h * 0.5, 0.03], esc: [0.02, 0.3, 0.02] }) },
    ],
  },
  {
    id: "espelho", rotulo: "Espelho", tipos: ["espelho"],
    opcoes: [{ id: "moldura", rotulo: "Com moldura", tipo: "sim", omissao: true }],
    partes: [
      { nome: "moldura", forma: "caixa", mat: "corpo", ver: (p) => sim(p, "moldura"), colocar: ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, max(0.01, d)] }) },
      { nome: "espelho", forma: "caixa", mat: "espelho", colocar: ({ w, d, h, o }) => { const m = o.moldura === false ? 0 : 0.04; return { pos: [0, h / 2, max(0.01, d) / 2 + 0.001], esc: [w - m, h - m, 0.004] }; } },
    ],
  },
  {
    id: "armario", rotulo: "Armário (de espelho ou alto)", tipos: ["armario_espelho", "armario_alto", "coluna"],
    opcoes: [
      { id: "frente", rotulo: "Frente", tipo: "lista", valores: [{ id: "espelho", rotulo: "Espelho" }, { id: "lisa", rotulo: "Lisa" }], omissao: (t) => (t === "armario_espelho" ? "espelho" : "lisa") },
      { id: "duas", rotulo: "Duas portas", tipo: "sim", omissao: true },
    ],
    partes: [
      { nome: "caixa", forma: "caixa", mat: "corpo", colocar: ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w, h, d] }) },
      { nome: "porta_esq", forma: "caixa", mat: "corpo", ver: (p) => p.o.frente !== "espelho", colocar: ({ w, d, h, o }) => { const n = o.duas === false ? 1 : 2; return { pos: [n === 1 ? 0 : -w / 4, h / 2, d / 2 + 0.009], esc: [w / n - 0.008, h - 0.01, 0.018] }; } },
      { nome: "porta_dir", forma: "caixa", mat: "corpo", ver: (p) => p.o.frente !== "espelho" && p.o.duas !== false, colocar: ({ w, d, h }) => ({ pos: [w / 4, h / 2, d / 2 + 0.009], esc: [w / 2 - 0.008, h - 0.01, 0.018] }) },
      { nome: "espelho_esq", forma: "caixa", mat: "espelho", ver: (p) => p.o.frente === "espelho", colocar: ({ w, d, h, o }) => { const n = o.duas === false ? 1 : 2; return { pos: [n === 1 ? 0 : -w / 4, h / 2, d / 2 + 0.004], esc: [w / n - 0.008, h - 0.01, 0.006] }; } },
      { nome: "espelho_dir", forma: "caixa", mat: "espelho", ver: (p) => p.o.frente === "espelho" && p.o.duas !== false, colocar: ({ w, d, h }) => ({ pos: [w / 4, h / 2, d / 2 + 0.004], esc: [w / 2 - 0.008, h - 0.01, 0.006] }) },
      { nome: "puxador", forma: "caixa", mat: "metal", ver: (p) => p.o.frente !== "espelho", colocar: ({ w, d, h, o }) => ({ pos: [o.duas === false ? w / 2 - 0.04 : -0.03, h / 2, d / 2 + 0.025], esc: [0.012, min(0.14, h * 0.3), 0.014] }) },
    ],
  },
  {
    id: "toalheiro", rotulo: "Toalheiro ou radiador", tipos: ["toalheiro", "radiador"],
    opcoes: [{ id: "tipo", rotulo: "Tipo", tipo: "lista", valores: [{ id: "barras", rotulo: "Barras (toalheiro)" }, { id: "painel", rotulo: "Painel (radiador)" }], omissao: (t) => (t === "radiador" ? "painel" : "barras") }],
    partes: [
      { nome: "tubo_esq", forma: "cilindro", mat: "corpo", colocar: ({ w, h }) => ({ pos: [-w / 2 + 0.015, h / 2, 0], esc: [0.03, h, 0.03] }) },
      { nome: "tubo_dir", forma: "cilindro", mat: "corpo", colocar: ({ w, h }) => ({ pos: [w / 2 - 0.015, h / 2, 0], esc: [0.03, h, 0.03] }) },
      // até 10 barras, espaçadas 12 cm: as que cabem na altura ficam visíveis
      ...Array.from({ length: 10 }, (_, i): ParteGlb => ({
        nome: `barra_${i + 1}`, forma: "cilindro", mat: "corpo", ver: (p) => p.o.tipo !== "painel" && (i + 1) * 0.12 < p.h,
        colocar: ({ w }) => ({ pos: [0, (i + 1) * 0.12, 0], esc: [0.02, w - 0.03, 0.02], rot: [0, 0, Math.PI / 2] }),
      })),
      { nome: "painel", forma: "caixaR", mat: "corpo", ver: (p) => p.o.tipo === "painel", colocar: ({ w, d, h }) => ({ pos: [0, h / 2, 0], esc: [w - 0.03, h - 0.04, max(0.02, d * 0.6)] }) },
    ],
  },
  {
    id: "torneira", rotulo: "Torneira ou misturadora", tipos: ["torneira", "torneira_cozinha"],
    opcoes: [{ id: "extraivel", rotulo: "Bica extraível", tipo: "sim", omissao: false }],
    partes: [
      { nome: "base", forma: "cilindro", mat: "corpo", colocar: ({ w }) => ({ pos: [0, 0.006, 0], esc: [max(0.05, w * 0.7), 0.012, max(0.05, w * 0.7)] }) },
      { nome: "corpo", forma: "cilindro", mat: "corpo", colocar: ({ h }) => ({ pos: [0, h * 0.45, 0], esc: [0.035, h * 0.9, 0.035] }) },
      { nome: "bica", forma: "cilindro", mat: "corpo", colocar: ({ d, h }) => ({ pos: [0, h * 0.88, d * 0.3], esc: [0.022, max(0.06, d * 0.7), 0.022], rot: [Math.PI / 2, 0, 0] }) },
      { nome: "cabeca", forma: "cilindro", mat: "corpo", ver: (p) => p.o.extraivel === true, colocar: ({ d, h }) => ({ pos: [0, h * 0.82, d * 0.62], esc: [0.032, 0.1, 0.032] }) },
      { nome: "manipulo", forma: "caixa", mat: "corpo", colocar: ({ h }) => ({ pos: [0.03, h * 0.6, 0], esc: [0.05, 0.012, 0.014] }) },
    ],
  },
  {
    id: "coluna_duche", rotulo: "Coluna ou misturadora de duche", tipos: ["coluna_duche"],
    opcoes: [{ id: "mao", rotulo: "Com chuveiro de mão", tipo: "sim", omissao: true }],
    partes: [
      { nome: "barra", forma: "cilindro", mat: "corpo", colocar: ({ h }) => ({ pos: [0, h / 2, 0], esc: [0.025, h, 0.025] }) },
      { nome: "braco", forma: "cilindro", mat: "corpo", colocar: ({ h }) => ({ pos: [0, h, 0.15], esc: [0.02, 0.3, 0.02], rot: [Math.PI / 2, 0, 0] }) },
      { nome: "chuveiro", forma: "cilindro", mat: "corpo", colocar: ({ w, h }) => ({ pos: [0, h - 0.01, 0.3], esc: [max(0.2, w), 0.012, max(0.2, w)] }) },
      { nome: "misturadora", forma: "caixaR", mat: "corpo", colocar: () => ({ pos: [0, 0.05, 0.03], esc: [0.16, 0.06, 0.06] }) },
      { nome: "chuveiro_mao", forma: "cilindro", mat: "corpo", ver: (p) => sim(p, "mao"), colocar: ({ h }) => ({ pos: [0.05, h * 0.55, 0.03], esc: [0.035, 0.22, 0.035] }) },
    ],
  },
];

/** A categoria genérica de um tipo de mockup (ou nenhuma: o tipo fica com o mockup paramétrico de sempre). */
/** Pelo tipo e, quando a categoria o pede, pelo nome do produto (a primeira que casa: as mais específicas estão primeiro). */
export const categoriaDoTipo = (t: TipoMockup, nome = ""): CategoriaGlb | undefined => CATEGORIAS_GLB.find((c) => c.tipos.includes(t) && (!c.nome || c.nome.test(nome)));
export const categoriaPorId = (id: string | undefined): CategoriaGlb | undefined => (id ? CATEGORIAS_GLB.find((c) => c.id === id) : undefined);
/** As opções da peça com as omissões da categoria preenchidas (as omissões podem vir do nome do produto). */
export function opcoesComOmissao(c: CategoriaGlb, t: TipoMockup, o: Readonly<Record<string, string | boolean>> = {}, nome = ""): Record<string, string | boolean> {
  const r: Record<string, string | boolean> = {};
  for (const op of c.opcoes) r[op.id] = o[op.id] ?? (typeof op.omissao === "function" ? op.omissao(t, nome) : op.omissao);
  return r;
}
