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
export type OpcaoGlb =
  | { id: string; rotulo: string; tipo: "sim"; omissao: boolean | ((t: TipoMockup) => boolean) }
  | { id: string; rotulo: string; tipo: "lista"; valores: { id: string; rotulo: string }[]; omissao: string | ((t: TipoMockup) => string) };
export interface CategoriaGlb { id: string; rotulo: string; tipos: TipoMockup[]; partes: ParteGlb[]; opcoes: OpcaoGlb[] }

/** Interruptor único dos genéricos em GLB: `false` volta aos mockups paramétricos de sempre (Visualizador3D, `Parametrico`). */
export const USAR_GLB_GENERICOS = true;
export const urlDoGenerico = (id: string): string => `/modelos3d/genericos/${id}.glb`;

const sim = (p: ParamsGenerico, id: string): boolean => p.o[id] !== false;
const min = Math.min, max = Math.max;
/** Altura do assento das sanitas e bidés de chão (m). */
const ASSENTO = 0.4;

export const CATEGORIAS_GLB: CategoriaGlb[] = [
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
export const categoriaDoTipo = (t: TipoMockup): CategoriaGlb | undefined => CATEGORIAS_GLB.find((c) => c.tipos.includes(t));
/** As opções da peça com as omissões da categoria preenchidas. */
export function opcoesComOmissao(c: CategoriaGlb, t: TipoMockup, o: Readonly<Record<string, string | boolean>> = {}): Record<string, string | boolean> {
  const r: Record<string, string | boolean> = {};
  for (const op of c.opcoes) r[op.id] = o[op.id] ?? (typeof op.omissao === "function" ? op.omissao(t) : op.omissao);
  return r;
}
