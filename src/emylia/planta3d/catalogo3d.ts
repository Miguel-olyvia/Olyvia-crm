// Protótipo (visualizador 3D): as peças vêm dos PRODUTOS DO CATÁLOGO (v2/catalogoModelo.ts: Produto, árvore de ofícios e sub-ofícios). Aqui:
//  1. classifica cada produto num tipo de mockup (sanita, base de duche, móvel…) pelo sub-ofício e pelo nome;
//  2. tira as DIMENSÕES REAIS do nome («Base de duche 80×120») para campos próprios (largura, profundidade, altura), com uma tabela de omissões
//     por tipo quando o nome não as traz;
//  3. acrescenta a cada produto um `mockup3d` (geometria paramétrica com essa dimensão; `url` fica para um GLB por produto, quando existir);
//  4. escolhe os produtos que fazem sentido para o espaço (mapa configurável tipo de espaço -> tipos de peça).
// Funções puras: sem React, sem three.
import type { TipoEspaco } from "./modelo";

export type TipoMockup =
  | "caixa" | "sanita" | "bide" | "banheira" | "base_duche" | "lavatorio" | "movel" | "roupeiro" | "cama" | "bancada" | "eletro" | "porta" | "janela";

/** O mínimo que se precisa de um produto do catálogo (o `Produto` real cumpre-o). */
export interface ProdutoCat { id: string; n: string; sub?: string; no: string | null; marca?: string; fornecedor?: string; custo?: number }
export interface NoCat { id: string; n: string; pai: string | null }

/** O mockup de um produto, em metros. `url`: um GLB opcional (carregado se existir); sem ele, desenha-se a geometria paramétrica. */
export interface Mockup3D { tipo: TipoMockup; largura: number; profundidade: number; altura: number; cor: string; url?: string }
export interface Dimensoes { larguraCm: number; profundidadeCm: number; alturaCm: number; deNome: boolean }
export interface ProdutoModelo3D { produtoId: string; nome: string; tipo: TipoMockup; dimensoes: Dimensoes; mockup3d: Mockup3D; marca?: string; fornecedor?: string; custo?: number; categoria: string }

/** Dimensões de omissão por tipo (cm), quando o nome não as traz: largura, profundidade, altura. */
export const OMISSOES_CM: Record<TipoMockup, [number, number, number]> = {
  base_duche: [120, 80, 6], banheira: [170, 70, 55], sanita: [36, 55, 40], bide: [36, 55, 40], lavatorio: [60, 46, 85], movel: [60, 45, 80],
  roupeiro: [200, 60, 240], cama: [160, 200, 45], bancada: [200, 60, 90], eletro: [60, 60, 85], caixa: [50, 50, 50], porta: [80, 4, 210], janela: [100, 6, 120],
};
export const COR_MOCKUP: Record<TipoMockup, string> = {
  base_duche: "#e8edf0", banheira: "#f4f6f7", sanita: "#f7f7f5", bide: "#f7f7f5", lavatorio: "#d9c7a8", movel: "#c9b08a", roupeiro: "#bfa98a", cama: "#cfd8e3",
  bancada: "#b9b3a8", eletro: "#c9ced3", caixa: "#d0d0d0", porta: "#a98467", janela: "#9fb4c7",
};

/** O que faz sentido em cada tipo de espaço (configurável: passa-se outro mapa a `produtosParaEspaco`). */
export type MapaEspaco = Record<TipoEspaco, TipoMockup[]>;
export const MAPA_ESPACO: MapaEspaco = {
  casa_banho: ["base_duche", "banheira", "sanita", "bide", "lavatorio", "movel"],
  cozinha: ["movel", "bancada", "eletro"],
  quarto: ["roupeiro", "cama", "movel"],
  sala: ["movel", "eletro"],
  outro: ["base_duche", "banheira", "sanita", "bide", "lavatorio", "movel", "roupeiro", "cama", "bancada", "eletro"],
};

/** Sem acentos e em minúsculas, para comparar texto. */
export const sem = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS: [RegExp, TipoMockup][] = [
  [/resguardo|torneira|misturadora|coluna duche|chuveiro|toalheiro|acessorio/, "caixa"],
  [/base.*duche|bases duche|prato de duche/, "base_duche"],
  [/banheira/, "banheira"],
  [/bide/, "bide"],
  [/\bsanitas?\b/, "sanita"],
  [/lavatorio|lavabo/, "lavatorio"],
  [/roupeiro/, "roupeiro"],
  [/\bcama\b|colchao|estrado/, "cama"],
  [/bancada|tampo/, "bancada"],
  [/frigorific|fogao|\bforno|placa|maquina|exaustor|micro-ondas|garrafeira|termoacumulador|esquentador/, "eletro"],
  [/armario|movel|moveis|mobiliario|coluna/, "movel"],
  [/\bporta/, "porta"],
  [/janela/, "janela"],
];

/** O caminho do produto na árvore, em texto (ofício / sub-ofício). */
export function caminhoDe(arvore: readonly NoCat[], no: string | null): string {
  const n = arvore.find((x) => x.id === no);
  if (!n) return "";
  const pai = n.pai ? arvore.find((x) => x.id === n.pai) : null;
  return pai ? `${pai.n} / ${n.n}` : n.n;
}

/** O tipo de mockup de um produto: pelo sub-ofício real (`sub`), depois pelo nome e, por fim, pelo ramo da árvore. */
export function tipoMockupDe(p: ProdutoCat, arvore: readonly NoCat[] = []): TipoMockup {
  for (const t of [p.sub ?? "", p.n, caminhoDe(arvore, p.no)]) {
    const s = sem(t);
    if (!s) continue;
    for (const [re, tipo] of REGRAS) if (re.test(s)) return tipo;
  }
  return "caixa";
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const PADRAO = new RegExp(`${NUM}\\s*(?:cm|mm)?\\s*[x×*]\\s*${NUM}(?:\\s*(?:cm|mm)?\\s*[x×*]\\s*${NUM})?\\s*(cm|mm)?`, "i");
const num = (s: string) => Number(s.replace(",", "."));

/** Dimensões (cm) escritas no nome («80×120», «60x45x80 cm», «1200x800 mm»), ou null. */
export function dimensoesDoNome(nome: string): number[] | null {
  const m = nome.match(PADRAO);
  if (!m) return null;
  let v = [m[1], m[2], m[3]].filter((x): x is string => !!x).map(num);
  const mm = (m[4] ?? "").toLowerCase() === "mm" || Math.max(...v) > 400;
  if (mm) v = v.map((x) => x / 10);
  v = v.map((x) => Math.round(x * 10) / 10);
  return v.every((x) => x >= 5 && x <= 400) ? v : null;
}

/**
 * As dimensões reais de um produto. Do nome, quando as traz; senão a tabela de omissões do tipo.
 * Base de duche e banheira: o maior é a largura (comprimento) e o menor a profundidade; roupeiro com dois números: largura × altura;
 * os outros: largura × profundidade (× altura).
 */
export function extrairDimensoes(nome: string, tipo: TipoMockup): Dimensoes {
  const [lw, pd, al] = OMISSOES_CM[tipo];
  const v = dimensoesDoNome(nome);
  if (!v) return { larguraCm: lw, profundidadeCm: pd, alturaCm: al, deNome: false };
  const [a, b, c] = v;
  if (tipo === "base_duche" || tipo === "banheira") return { larguraCm: Math.max(a, b), profundidadeCm: Math.min(a, b), alturaCm: c ?? al, deNome: true };
  if (tipo === "roupeiro" && c === undefined) return { larguraCm: a, profundidadeCm: pd, alturaCm: b, deNome: true };
  return { larguraCm: a, profundidadeCm: b, alturaCm: c ?? al, deNome: true };
}

/** O produto do catálogo mais o seu mockup 3D (paramétrico, com a dimensão real; `urls`: o GLB de cada produto, quando existir). */
export function modeloDoProduto(p: ProdutoCat, arvore: readonly NoCat[] = [], urls: Readonly<Record<string, string>> = {}): ProdutoModelo3D {
  const tipo = tipoMockupDe(p, arvore);
  const d = extrairDimensoes(p.n, tipo);
  const mockup3d: Mockup3D = { tipo, largura: d.larguraCm / 100, profundidade: d.profundidadeCm / 100, altura: d.alturaCm / 100, cor: COR_MOCKUP[tipo], ...(urls[p.id] ? { url: urls[p.id] } : {}) };
  return { produtoId: p.id, nome: p.n, tipo, dimensoes: d, mockup3d, marca: p.marca, fornecedor: p.fornecedor, custo: p.custo, categoria: p.sub || caminhoDe(arvore, p.no) };
}

export interface OpcoesEspaco {
  mapa?: MapaEspaco;
  /** Só produtos destes ofícios (nomes da árvore, por exemplo a linha de serviço do espaço). Sem isto, todos. */
  oficios?: readonly string[];
  urls?: Readonly<Record<string, string>>;
  /** O máximo de produtos (por omissão 200). */
  max?: number;
}

/** Os produtos do catálogo que se podem pôr num espaço do tipo dado, já com as dimensões e o mockup, por ordem de tipo e nome. */
export function produtosParaEspaco(produtos: readonly ProdutoCat[], arvore: readonly NoCat[], espaco: TipoEspaco, o: OpcoesEspaco = {}): ProdutoModelo3D[] {
  const tipos = (o.mapa ?? MAPA_ESPACO)[espaco];
  const oficios = o.oficios?.map(sem);
  const idOficio = (no: string | null): string => {
    const n = arvore.find((x) => x.id === no);
    const raiz = n?.pai ? arvore.find((x) => x.id === n.pai) : n;
    return sem(raiz?.n ?? "");
  };
  const lista: ProdutoModelo3D[] = [];
  for (const p of produtos) {
    if (oficios && !oficios.includes(idOficio(p.no))) continue;
    const m = modeloDoProduto(p, arvore, o.urls);
    if (tipos.includes(m.tipo)) lista.push(m);
  }
  const ordem = (t: TipoMockup) => tipos.indexOf(t);
  lista.sort((a, b) => ordem(a.tipo) - ordem(b.tipo) || a.nome.localeCompare(b.nome, "pt"));
  return lista.slice(0, o.max ?? 200);
}

/** O tipo de espaço a partir do nome da divisão da visita («Casa de banho», «Cozinha», «Quarto»…). */
export function tipoEspacoDeDivisao(divisao: string | null | undefined): TipoEspaco {
  const s = sem(divisao ?? "");
  if (/banho|wc|sanitario|lavabo/.test(s)) return "casa_banho";
  if (/cozinha|copa/.test(s)) return "cozinha";
  if (/quarto|suite/.test(s)) return "quarto";
  if (/sala|estar|jantar/.test(s)) return "sala";
  return "outro";
}

export const ROTULO_ESPACO: Record<TipoEspaco, string> = { casa_banho: "Casa de banho", cozinha: "Cozinha", quarto: "Quarto", sala: "Sala", outro: "Outro espaço" };
