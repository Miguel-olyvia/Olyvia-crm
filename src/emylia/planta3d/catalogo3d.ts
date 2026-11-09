// Protótipo (visualizador 3D): as peças vêm dos PRODUTOS DO CATÁLOGO (v2/catalogoModelo.ts: Produto, árvore de ofícios e sub-ofícios). Aqui:
//  1. classifica cada produto num tipo de mockup (sanita, espelho, toalheiro, base de duche…) pelo sub-ofício e pelo nome;
//  2. tira as DIMENSÕES REAIS do nome («Base de duche 80×120») para campos próprios, com uma tabela de omissões por tipo;
//  3. acrescenta a cada produto um `mockup3d` (geometria paramétrica com essa dimensão; `url` fica para um GLB por produto) e a montagem
//     («chão» ou «parede», com a altura de omissão ao chão);
//  4. agrupa os produtos por espaço (grupos configuráveis) e acrescenta produtos de DEMONSTRAÇÃO «(demo)» para os tipos que o catálogo não tem.
// Funções puras: sem React, sem three.
import type { TipoPeca } from "../planta";
import type { TipoEspaco } from "./modelo";
import { modeloHtmlDoProduto } from "./htmlDoCatalogo";
import { categoriaDoTipo, categoriaPorId, opcoesComOmissao } from "./categoriasGlb";

export type TipoMockup =
  | "caixa" | "sanita" | "sanita_suspensa" | "bide" | "banheira" | "base_duche" | "lavatorio" | "movel_lavatorio" | "coluna" | "coluna_duche" | "movel"
  | "armario_alto" | "espelho" | "armario_espelho" | "torneira" | "toalheiro" | "radiador" | "resguardo" | "acessorio" | "prateleira" | "quadro" | "candeeiro"
  | "roupeiro" | "cama" | "secretaria" | "sofa" | "mesa" | "bancada" | "frigorifico" | "fogao" | "eletro" | "porta" | "janela"
  /* famílias do catálogo de cozinha (familias.ts): torneira, lava-loiça, placa e tampo com geometria própria; sifão não tem geometria */
  | "torneira_cozinha" | "lava_loica" | "placa" | "tampo" | "sifao" | "lavatorio_pousar";

export type Montagem = "chao" | "parede";

/** O mínimo que se precisa de um produto do catálogo (o `Produto` real cumpre-o). `tipo` e `dim` só os produtos de demonstração os trazem. */
export interface ProdutoCat {
  id: string; n: string; sub?: string; no: string | null; marca?: string; fornecedor?: string; custo?: number;
  tipo?: TipoMockup; /** largura, profundidade, altura (cm) */ dim?: [number, number, number]; demo?: boolean;
}
export interface NoCat { id: string; n: string; pai: string | null }

/** O mockup de um produto, em metros. `url`: um GLB opcional (carregado se existir); sem ele, desenha-se a geometria paramétrica. */
/** O material de uma variante (acabamento): a cor vai em `cor`; aqui o resto. Sem mapa de ambiente, o metal renderiza-se com metalness limitado. */
export interface MaterialMockup { metalness: number; roughness: number }
/** O modelo do HTML de uma peça; `exacto: false`: o HTML não tem este produto e usa-se o mais parecido. */
export interface HtmlModelo { modelo: string; acab: string; exacto?: boolean }
/** Parâmetros próprios dos mockups de família (metros). */
export type ParamsMockup =
  | { k: "torneira"; estilo: "extraivel" | "monocomando" | "abativel" | "cira"; altura: number; saida: number; alcance: number; base: number; /** o modelo detalhado portado do HTML (modelosHtml/), com o acabamento */ html?: HtmlModelo }
  | { k: "lava_loica"; cubas: { x: number; z: number; w: number; d: number; prof: number }[]; escorredor: boolean; degrau: boolean; /** o modelo detalhado portado do HTML (a medida e o acabamento) */ html?: HtmlModelo }
  | { k: "placa"; tipo: "induction" | "radiant" | "gas"; recorte: [number, number]; espessura: number; acima: number; queimadores: [number, number, number][]; manipulos: number[]; vidro: boolean; /** o modelo detalhado portado do HTML */ html?: HtmlModelo }
  | { k: "tampo"; espessura: number }
  /** a bancada composta (bancada.ts): chapa, recortes, lava-loiça, placa, torneira, rodatampo e móveis */
  | { k: "bancada"; cfg: import("./bancada").ConfigBancada }
  /** um tampo do catálogo de uma série Coverlam do HTML: a chapa com a imagem do fabricante */
  | { k: "chapa"; series: string; tone: string }
  /** a composição modular de cozinha (composicaoCozinha.ts): a fila de módulos, desenhada com os genéricos da cozinha */
  | { k: "cozinha"; cfg: import("./composicaoCozinha").ComposicaoCozinha };
export interface Mockup3D {
  tipo: TipoMockup; largura: number; profundidade: number; altura: number; cor: string; url?: string; material?: MaterialMockup; params?: ParamsMockup;
  /** o modelo genérico da categoria (categoriasGlb.ts), escolhido pelo tipo e pelo nome, com as omissões das opções que o nome dá */
  generico?: { id: string; o: Record<string, string | boolean> };
}
export interface Dimensoes { larguraCm: number; profundidadeCm: number; alturaCm: number; deNome: boolean }
export interface ProdutoModelo3D {
  produtoId: string; nome: string; tipo: TipoMockup; dimensoes: Dimensoes; mockup3d: Mockup3D; marca?: string; fornecedor?: string; custo?: number; categoria: string;
  montagem: Montagem; /** altura de omissão ao chão (m), só para peças de parede */ alturaOmissao: number; demo: boolean;
  /** Só as peças de uma família do catálogo (familias.ts): a família, a variante escolhida, o SKU e o preço dessa variante. */
  fam?: { familiaId: string; medidaId: string; acabId: string; sku: string; preco: number };
}

interface Espec { rotulo: string; mont: Montagem; alt: number; dim: [number, number, number]; cor: string }
/** Por tipo: o nome, a montagem, a altura ao chão de omissão (m, peças de parede), as dimensões de omissão (cm: largura, profundidade, altura) e a cor. */
export const ESPEC: Record<TipoMockup, Espec> = {
  sanita: { rotulo: "Sanita de chão", mont: "chao", alt: 0, dim: [37, 65, 78], cor: "#f7f7f5" },
  sanita_suspensa: { rotulo: "Sanita suspensa", mont: "parede", alt: 0, dim: [36, 53, 40], cor: "#f7f7f5" },
  bide: { rotulo: "Bidé", mont: "chao", alt: 0, dim: [36, 55, 40], cor: "#f7f7f5" },
  banheira: { rotulo: "Banheira", mont: "chao", alt: 0, dim: [170, 70, 55], cor: "#f4f6f7" },
  base_duche: { rotulo: "Base de duche", mont: "chao", alt: 0, dim: [120, 80, 6], cor: "#e8edf0" },
  lavatorio: { rotulo: "Lavatório", mont: "chao", alt: 0, dim: [55, 45, 85], cor: "#f4f6f7" },
  movel_lavatorio: { rotulo: "Móvel de lavatório", mont: "chao", alt: 0, dim: [60, 46, 85], cor: "#c9b08a" },
  coluna: { rotulo: "Coluna", mont: "chao", alt: 0, dim: [35, 35, 180], cor: "#c9b08a" },
  coluna_duche: { rotulo: "Coluna de duche", mont: "parede", alt: 0.9, dim: [20, 12, 120], cor: "#9aa0a4" },
  movel: { rotulo: "Móvel", mont: "chao", alt: 0, dim: [60, 45, 80], cor: "#c9b08a" },
  armario_alto: { rotulo: "Armário alto", mont: "parede", alt: 1.4, dim: [60, 32, 70], cor: "#d8d3c8" },
  espelho: { rotulo: "Espelho", mont: "parede", alt: 1.0, dim: [60, 3, 80], cor: "#2b2f33" },
  armario_espelho: { rotulo: "Armário de espelho", mont: "parede", alt: 1.2, dim: [60, 15, 70], cor: "#d8d3c8" },
  torneira: { rotulo: "Torneira", mont: "parede", alt: 1.0, dim: [8, 15, 20], cor: "#9aa0a4" },
  toalheiro: { rotulo: "Toalheiro", mont: "parede", alt: 0.3, dim: [50, 10, 120], cor: "#e5e5e5" },
  radiador: { rotulo: "Radiador", mont: "parede", alt: 0.15, dim: [60, 10, 60], cor: "#f2f2f0" },
  resguardo: { rotulo: "Resguardo", mont: "chao", alt: 0, dim: [80, 4, 195], cor: "#bcd9ea" },
  acessorio: { rotulo: "Acessório", mont: "parede", alt: 1.0, dim: [20, 10, 10], cor: "#9aa0a4" },
  prateleira: { rotulo: "Prateleira", mont: "parede", alt: 1.5, dim: [60, 20, 3], cor: "#c9b08a" },
  quadro: { rotulo: "Quadro", mont: "parede", alt: 1.4, dim: [60, 3, 40], cor: "#5f8aa8" },
  candeeiro: { rotulo: "Candeeiro de parede", mont: "parede", alt: 1.8, dim: [15, 15, 15], cor: "#f1e9d2" },
  roupeiro: { rotulo: "Roupeiro", mont: "chao", alt: 0, dim: [200, 60, 240], cor: "#bfa98a" },
  cama: { rotulo: "Cama", mont: "chao", alt: 0, dim: [160, 200, 45], cor: "#cfd8e3" },
  secretaria: { rotulo: "Secretária", mont: "chao", alt: 0, dim: [120, 60, 75], cor: "#b99b76" },
  sofa: { rotulo: "Sofá", mont: "chao", alt: 0, dim: [200, 90, 85], cor: "#7d8b99" },
  mesa: { rotulo: "Mesa", mont: "chao", alt: 0, dim: [140, 80, 75], cor: "#b99b76" },
  bancada: { rotulo: "Bancada", mont: "chao", alt: 0, dim: [200, 60, 90], cor: "#b9b3a8" },
  frigorifico: { rotulo: "Frigorífico", mont: "chao", alt: 0, dim: [60, 65, 185], cor: "#d7dbde" },
  fogao: { rotulo: "Fogão", mont: "chao", alt: 0, dim: [60, 60, 90], cor: "#c9ced3" },
  eletro: { rotulo: "Eletrodoméstico", mont: "chao", alt: 0, dim: [60, 60, 85], cor: "#c9ced3" },
  caixa: { rotulo: "Outro", mont: "chao", alt: 0, dim: [50, 50, 50], cor: "#d0d0d0" },
  torneira_cozinha: { rotulo: "Torneira de cozinha", mont: "chao", alt: 0.9, dim: [5, 22, 40], cor: "#d9dde0" },
  lava_loica: { rotulo: "Lava-loiça", mont: "chao", alt: 0.69, dim: [50, 44, 20], cor: "#c3c7ca" },
  placa: { rotulo: "Placa", mont: "chao", alt: 0.9, dim: [59, 51, 1], cor: "#1c1f21" },
  tampo: { rotulo: "Tampo de bancada", mont: "chao", alt: 0.888, dim: [240, 65, 1.2], cor: "#d8d1bb" },
  sifao: { rotulo: "Sifão e válvula", mont: "chao", alt: 0, dim: [10, 10, 10], cor: "#9aa0a4" },
  lavatorio_pousar: { rotulo: "Lavatório de pousar", mont: "chao", alt: 0.6, dim: [55, 42, 12], cor: "#f4f6f7" },
  porta: { rotulo: "Porta", mont: "parede", alt: 0, dim: [80, 4, 210], cor: "#a98467" },
  janela: { rotulo: "Janela", mont: "parede", alt: 0.9, dim: [100, 6, 120], cor: "#9fb4c7" },
};
/** O tipo de peça do desenho de hoje (planta.ts) que corresponde a um tipo de mockup (as portas e janelas do desenho são aberturas). */
export const TIPO_LEGADO: Record<TipoMockup, TipoPeca> = Object.fromEntries((Object.keys(ESPEC) as TipoMockup[]).map((t) => [t, "movel" as TipoPeca])) as Record<TipoMockup, TipoPeca>;
Object.assign(TIPO_LEGADO, { sanita: "sanita", sanita_suspensa: "sanita", bide: "bide", banheira: "banheira", base_duche: "base", coluna: "coluna", porta: "porta", janela: "janela" });
/** Compatibilidade: dimensões e cores por tipo. */
export const OMISSOES_CM: Record<TipoMockup, [number, number, number]> = Object.fromEntries(Object.entries(ESPEC).map(([k, v]) => [k, v.dim])) as Record<TipoMockup, [number, number, number]>;
export const COR_MOCKUP: Record<TipoMockup, string> = Object.fromEntries(Object.entries(ESPEC).map(([k, v]) => [k, v.cor])) as Record<TipoMockup, string>;

/** Os grupos (separadores) de cada espaço: o que faz sentido, por ordem. Configurável: passa-se outro mapa de grupos a `produtosParaEspaco`. */
export interface Grupo { id: string; rotulo: string; tipos: TipoMockup[] }
export type GruposEspaco = Record<TipoEspaco, Grupo[]>;
const G = (id: string, rotulo: string, ...tipos: TipoMockup[]): Grupo => ({ id, rotulo, tipos });
export const GRUPOS_ESPACO: GruposEspaco = {
  casa_banho: [
    G("sanitas", "Sanitas", "sanita", "sanita_suspensa"), G("bides", "Bidés", "bide"), G("banheiras", "Banheiras", "banheira"), G("bases", "Bases de duche", "base_duche"),
    G("lavatorios", "Lavatórios e móveis", "lavatorio", "movel_lavatorio", "bancada"), G("colunas", "Colunas e armários", "coluna", "coluna_duche", "armario_alto", "movel"),
    G("espelhos", "Espelhos", "espelho", "armario_espelho"), G("torneiras", "Torneiras e misturadoras", "torneira"), G("radiadores", "Toalheiros e radiadores", "toalheiro", "radiador"),
    G("resguardos", "Resguardos", "resguardo"), G("acessorios", "Acessórios", "acessorio", "prateleira", "quadro", "candeeiro"),
  ],
  cozinha: [
    G("modulos", "Módulos", "movel", "armario_alto", "coluna"), G("bancadas", "Bancadas do catálogo", "bancada"), G("lavaloicas", "Lava-loiças", "lava_loica"), G("eletro", "Eletrodomésticos", "frigorifico", "fogao", "eletro", "placa"),
    G("torneiras", "Torneiras", "torneira_cozinha", "torneira"), G("deco", "Prateleiras e decoração", "prateleira", "quadro", "candeeiro"),
  ],
  quarto: [
    G("roupeiros", "Roupeiros", "roupeiro"), G("camas", "Camas", "cama"), G("secretarias", "Secretárias", "secretaria"), G("moveis", "Móveis", "movel", "armario_alto", "coluna"),
    G("deco", "Decoração", "prateleira", "quadro", "candeeiro", "espelho"),
  ],
  sala: [
    G("sofas", "Sofás", "sofa"), G("mesas", "Mesas", "mesa"), G("moveis", "Móveis", "movel", "armario_alto", "coluna", "prateleira"), G("eletro", "Eletrodomésticos", "eletro"),
    G("deco", "Decoração", "quadro", "candeeiro", "espelho", "radiador"),
  ],
  outro: [
    G("sanitas", "Sanitários", "sanita", "sanita_suspensa", "bide", "banheira", "base_duche", "lavatorio", "movel_lavatorio"), G("moveis", "Móveis", "movel", "armario_alto", "coluna", "roupeiro", "secretaria"),
    G("quarto", "Camas e sofás", "cama", "sofa", "mesa"), G("cozinha", "Cozinha", "bancada", "lava_loica", "placa", "torneira_cozinha", "frigorifico", "fogao", "eletro"),
    G("parede", "Peças de parede", "espelho", "armario_espelho", "toalheiro", "radiador", "prateleira", "quadro", "candeeiro", "torneira", "acessorio", "coluna_duche"),
  ],
};
/** O que faz sentido em cada tipo de espaço (os grupos, por ordem, sem repetir). */
export type MapaEspaco = Record<TipoEspaco, TipoMockup[]>;
const achatar = (g: Grupo[]): TipoMockup[] => [...new Set(g.flatMap((x) => x.tipos))];
export const MAPA_ESPACO: MapaEspaco = {
  casa_banho: achatar(GRUPOS_ESPACO.casa_banho), cozinha: achatar(GRUPOS_ESPACO.cozinha), quarto: achatar(GRUPOS_ESPACO.quarto), sala: achatar(GRUPOS_ESPACO.sala), outro: achatar(GRUPOS_ESPACO.outro),
};

/** Sem acentos e em minúsculas, para comparar texto. */
export const sem = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS: [RegExp, TipoMockup][] = [
  [/resguardo/, "resguardo"],
  [/sifao|sifoes|valvula/, "acessorio"],
  // as peças de cozinha do catálogo usam os modelos detalhados do HTML (lava-loiça, placa e torneira de cozinha)
  [/lava-?lo[iu]cas?|lava lo[iu]ca|^cubas (inox|composito)/, "lava_loica"],
  [/^misturadoras? monocomando|torneira.*cozinha|cozinha.*torneira|misturadora.*cozinha|monocomando de lava/, "torneira_cozinha"],
  [/^placas$|placa (de )?(inducao|vitroceramica|vitro|gas|a gas)/, "placa"],
  // uma placa de pladur é material de construção, não um eletrodoméstico
  [/pladur|gesso cartonado/, "caixa"],
  [/torneira|misturadora|chuveiro higien/, "torneira"],
  [/toalheiro/, "toalheiro"],
  [/radiador/, "radiador"],
  [/coluna.*duche|duche.*coluna|colunas duche/, "coluna_duche"],
  [/base.*duche|bases duche|prato de duche/, "base_duche"],
  [/pega de seguranca|cabide|porta-rolos|porta rolos|piacaba|nicho|escova|\bbancos?\b|\bkit/, "acessorio"],
  [/banheira/, "banheira"],
  [/\bbides?\b/, "bide"],
  [/\bsanitas?\b.*suspens|suspens.*\bsanitas?\b/, "sanita_suspensa"],
  [/\bsanitas?\b/, "sanita"],
  [/armario.*espelho|espelheira/, "armario_espelho"],
  [/espelho/, "espelho"],
  [/movel.*lavatorio|moveis de lavatorio/, "movel_lavatorio"],
  [/lavatorio|lavabo/, "lavatorio"],
  [/armarios? superiores?|armario alto|armarios? altos?/, "armario_alto"],
  [/armarios? de coluna|\bcolunas?\b/, "coluna"],
  [/prateleira/, "prateleira"],
  [/\bquadros?\b/, "quadro"],
  [/aplique|candeeiro|luminaria/, "candeeiro"],
  [/roupeiro/, "roupeiro"],
  [/\bcama\b|colchao|estrado/, "cama"],
  [/secretaria|escrivaninha/, "secretaria"],
  [/\bsofa\b/, "sofa"],
  [/\bmesas?\b/, "mesa"],
  [/bancada|tampo/, "bancada"],
  [/frigorific/, "frigorifico"],
  [/\bfogao|\bfogoes/, "fogao"],
  [/\bforno|placa|maquina|exaustor|micro-ondas|garrafeira|termoacumulador|esquentador/, "eletro"],
  [/armario|movel|moveis|mobiliario/, "movel"],
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

/** O tipo de mockup de um produto: o que ele traz (demo), senão pelo sub-ofício real (`sub`), depois pelo nome e, por fim, pelo ramo da árvore. */
export function tipoMockupDe(p: ProdutoCat, arvore: readonly NoCat[] = []): TipoMockup {
  if (p.tipo) return p.tipo;
  for (const t of [p.sub ?? "", p.n, caminhoDe(arvore, p.no)]) {
    const s = sem(t);
    if (!s) continue;
    for (const [re, tipo] of REGRAS) if (re.test(s)) return tipo === "sanita" && /suspens/.test(sem(p.n)) ? "sanita_suspensa" : tipo;
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

/** Tipos cujo nome, com dois números, diz largura × altura (peças planas ou altas). */
const LARGURA_ALTURA: TipoMockup[] = ["roupeiro", "espelho", "quadro", "radiador", "toalheiro", "resguardo"];

/**
 * As dimensões reais de um produto. Do nome, quando as traz; senão a tabela de omissões do tipo.
 * Base de duche e banheira: o maior é a largura (comprimento) e o menor a profundidade; espelho, quadro, radiador, toalheiro, resguardo e roupeiro com
 * dois números: largura × altura; os outros: largura × profundidade (× altura).
 */
export function extrairDimensoes(nome: string, tipo: TipoMockup): Dimensoes {
  const [lw, pd, al] = OMISSOES_CM[tipo];
  const v = dimensoesDoNome(nome);
  if (!v) return { larguraCm: lw, profundidadeCm: pd, alturaCm: al, deNome: false };
  const [a, b, c] = v;
  if (tipo === "base_duche" || tipo === "banheira") return { larguraCm: Math.max(a, b), profundidadeCm: Math.min(a, b), alturaCm: c ?? al, deNome: true };
  if (LARGURA_ALTURA.includes(tipo) && c === undefined) return { larguraCm: a, profundidadeCm: pd, alturaCm: b, deNome: true };
  return { larguraCm: a, profundidadeCm: b, alturaCm: c ?? al, deNome: true };
}

/**
 * PROTÓTIPO: a lista «Produtos do catálogo» mostra SÓ os produtos com o modelo 3D do HTML (o selo «3D do catálogo»): os «3D parecido» e os
 * «Sem modelo do HTML» ficam escondidos da lista (o código e os modelos aproximados continuam; a planta e o 3D continuam a desenhá-los).
 * Para voltar a mostrar todos, pôr a `false`. É o único sítio que decide isto (BarraProdutos.tsx lê-o).
 */
export const SO_COM_MODELO_HTML = true;
/** O produto tem o modelo do HTML exacto (lava-loiça, placa ou torneira do catálogo 3D, ou a chapa de uma série Coverlam). */
export function temModeloHtml(m: ProdutoModelo3D): boolean {
  const pr = m.mockup3d.params;
  return pr?.k === "chapa" || pr?.k === "bancada" || (!!pr && "html" in pr && !!pr.html && pr.html.exacto !== false);
}

/**
 * PROTÓTIPO: com SO_COM_MODELO_HTML, a lista mostra também (depois dos do HTML) os produtos que têm um modelo GENÉRICO por categoria
 * (categoriasGlb.ts, selo «3D genérico»). Pôr a `false` volta a esconder os genéricos. Único sítio que decide isto (BarraProdutos.tsx lê-o).
 */
export const MOSTRAR_GENERICOS = true;
/** O produto usa um modelo genérico da sua categoria (não tem o do HTML e o tipo tem categoria). */
export function temModeloGenerico(m: ProdutoModelo3D): boolean {
  const pr = m.mockup3d.params;
  return !(pr && "html" in pr && pr.html) && pr?.k !== "chapa" && pr?.k !== "bancada" && !!(categoriaPorId(m.mockup3d.generico?.id) ?? categoriaDoTipo(m.mockup3d.tipo, m.nome));
}

/** O produto do catálogo mais o seu mockup 3D (paramétrico, com a dimensão real; `urls`: o GLB de cada produto, quando existir). */
export function modeloDoProduto(p: ProdutoCat, arvore: readonly NoCat[] = [], urls: Readonly<Record<string, string>> = {}): ProdutoModelo3D {
  const tipo = tipoMockupDe(p, arvore);
  let d: Dimensoes = p.dim ? { larguraCm: p.dim[0], profundidadeCm: p.dim[1], alturaCm: p.dim[2], deNome: true } : extrairDimensoes(p.n, tipo);
  const e = ESPEC[tipo];
  // o modelo do HTML do produto (pelo nome e pela medida): lava-loiça, placa e torneira com o modelo e as medidas do HTML; tampo com a chapa
  const h = modeloHtmlDoProduto(p.n, tipo);
  let params: ParamsMockup | undefined;
  if (h && h.tipo !== "tampo") {
    d = { larguraCm: h.dim[0], profundidadeCm: h.dim[1], alturaCm: h.dim[2], deNome: true };
    const html = { modelo: h.modelo, acab: h.acab, exacto: h.exacto };
    params = h.tipo === "torneira_cozinha" ? { k: "torneira", estilo: "extraivel", altura: h.dim[2] / 100, saida: 0, alcance: 0, base: h.dim[0] / 100, html }
      : h.tipo === "lava_loica" ? { k: "lava_loica", cubas: [], escorredor: false, degrau: false, html }
        : { k: "placa", tipo: "induction", recorte: [0, 0], espessura: 0, acima: 0, queimadores: [], manipulos: [], vidro: false, html };
  } else if (h?.tipo === "tampo") params = { k: "chapa", series: h.series, tone: h.tone };
  else if (tipo === "torneira_cozinha") {
    // uma misturadora que o HTML não tem (Sophie, Bruma): o modelo simplificado com medidas habituais (nunca o de outra torneira)
    const t = { estilo: "monocomando" as const, altura: 400, saida: 250, alcance: 220, base: 50 };
    params = { k: "torneira", estilo: t.estilo, altura: t.altura / 1000, saida: t.saida / 1000, alcance: t.alcance / 1000, base: t.base / 1000 };
    d = { larguraCm: t.base / 10, profundidadeCm: (t.alcance + t.base / 2) / 10, alturaCm: t.altura / 10, deNome: true };
  }
  const cg = !params || (params.k === "torneira" && !params.html) ? categoriaDoTipo(tipo, p.n) : undefined;
  // os genéricos presos à parede (armário de parede, exaustor, prateleira): a profundidade típica quando o nome só dá largura × altura
  const nomeTemTres = /\d+\s*[x×]\s*\d+\s*[x×]\s*\d+/i.test(p.n);
  if (cg?.parede?.prof && !p.dim && !nomeTemTres) d = { ...d, profundidadeCm: cg.parede.prof * 100 };
  const mockup3d: Mockup3D = { tipo, largura: d.larguraCm / 100, profundidade: d.profundidadeCm / 100, altura: d.alturaCm / 100, cor: e.cor, ...(params ? { params } : {}), ...(urls[p.id] ? { url: urls[p.id] } : {}),
    ...(cg ? { generico: { id: cg.id, o: opcoesComOmissao(cg, tipo, {}, p.n) } } : {}) };
  // a altura ao chão: o lava-loiça fica com o rebordo por baixo do tampo (a 88,8 cm), a placa e a torneira em cima dele (90 cm)
  // e as peças de parede genéricas ficam à altura da categoria (armário de parede 145 cm, exaustor 150, prateleira 150)
  const alt = h?.tipo === "lava_loica" ? (88.8 - d.alturaCm) / 100 : cg?.parede ? cg.parede.alt : e.alt;
  return {
    produtoId: p.id, nome: p.n, tipo, dimensoes: d, mockup3d, marca: p.marca, fornecedor: p.fornecedor, custo: p.custo, categoria: p.sub || caminhoDe(arvore, p.no) || e.rotulo,
    montagem: cg?.parede ? "parede" : e.mont, alturaOmissao: alt, demo: !!p.demo,
  };
}

/* ------------------------------------------------------------------ produtos de demonstração (só onde o catálogo não tem o tipo) */
const D = (id: string, tipo: TipoMockup, n: string, w: number, d: number, h: number): ProdutoCat => ({ id: `demo:${id}`, n: `${n} (demo)`, no: null, sub: ESPEC[tipo].rotulo, tipo, dim: [w, d, h], demo: true, marca: "Demonstração" });
export const PRODUTOS_DEMO: ProdutoCat[] = [
  D("sanita-suspensa", "sanita_suspensa", "Sanita suspensa 36×53×40", 36, 53, 40), D("sanita-chao", "sanita", "Sanita de chão com depósito 37×65×78", 37, 65, 78),
  D("bide", "bide", "Bidé de chão 36×55×40", 36, 55, 40), D("banheira", "banheira", "Banheira 170×70×55", 170, 70, 55), D("base-duche", "base_duche", "Base de duche 80×120", 120, 80, 6),
  D("lavatorio", "lavatorio", "Lavatório com coluna 55×45×85", 55, 45, 85), D("movel-lavatorio", "movel_lavatorio", "Lavatório com móvel 60×46×85", 60, 46, 85),
  D("coluna", "coluna", "Móvel coluna 35×35×180", 35, 35, 180), D("coluna-duche", "coluna_duche", "Coluna de duche termostática", 20, 12, 120),
  D("espelho", "espelho", "Espelho 60×80", 60, 3, 80), D("armario-espelho", "armario_espelho", "Armário de espelho 60×70", 60, 15, 70), D("armario-alto", "armario_alto", "Armário alto 60×32×70", 60, 32, 70),
  D("torneira", "torneira", "Misturadora de lavatório", 8, 15, 20), D("toalheiro", "toalheiro", "Toalheiro 50×120", 50, 10, 120), D("radiador", "radiador", "Radiador 60×60", 60, 10, 60),
  D("resguardo", "resguardo", "Resguardo de duche 80×195", 80, 4, 195), D("acessorio", "acessorio", "Porta-rolos", 20, 10, 10), D("prateleira", "prateleira", "Prateleira 60×20", 60, 20, 3),
  D("quadro", "quadro", "Quadro 60×40", 60, 3, 40), D("candeeiro", "candeeiro", "Candeeiro de parede", 15, 15, 15),
  D("modulo", "movel", "Módulo baixo 60×45×80", 60, 45, 80), D("bancada", "bancada", "Bancada de cozinha 200×60", 200, 60, 90), D("frigorifico", "frigorifico", "Frigorífico 60×65×185", 60, 65, 185),
  D("fogao", "fogao", "Fogão 60×60×90", 60, 60, 90), D("roupeiro", "roupeiro", "Roupeiro 200×60×240", 200, 60, 240), D("cama", "cama", "Cama de casal 160×200", 160, 200, 45),
  D("secretaria", "secretaria", "Secretária 120×60", 120, 60, 75), D("sofa", "sofa", "Sofá de 3 lugares 200×90", 200, 90, 85), D("mesa", "mesa", "Mesa de jantar 140×80", 140, 80, 75),
];

/** O catálogo mais os produtos de demonstração dos tipos que ele não tem (nenhum produto desse tipo). */
export function comDemonstracao(produtos: readonly ProdutoCat[], arvore: readonly NoCat[] = []): ProdutoCat[] {
  const tem = new Set(produtos.map((p) => tipoMockupDe(p, arvore)));
  return [...produtos, ...PRODUTOS_DEMO.filter((d) => !tem.has(d.tipo as TipoMockup))];
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
    if (oficios && !p.demo && !oficios.includes(idOficio(p.no))) continue;
    const m = modeloDoProduto(p, arvore, o.urls);
    if (tipos.includes(m.tipo)) lista.push(m);
  }
  const ordem = (t: TipoMockup) => tipos.indexOf(t);
  // dentro de cada tipo, primeiro os que têm o modelo do HTML (o mesmo do catálogo 3D), depois os parecidos, depois os sem modelo
  const html = (m: ProdutoModelo3D) => { const pr = m.mockup3d.params; return pr?.k === "chapa" || (pr && "html" in pr && pr.html?.exacto !== false && !!pr.html) ? 0 : pr && "html" in pr && pr.html ? 1 : 2; };
  lista.sort((a, b) => ordem(a.tipo) - ordem(b.tipo) || Number(a.demo) - Number(b.demo) || html(a) - html(b) || a.nome.localeCompare(b.nome, "pt"));
  return lista.slice(0, o.max ?? 200);
}

/** Os produtos de um grupo (separador) do espaço. */
export const produtosDoGrupo = (lista: readonly ProdutoModelo3D[], g: Grupo): ProdutoModelo3D[] => lista.filter((m) => g.tipos.includes(m.tipo));

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
