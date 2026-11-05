// 5/11 (Rúben: «cria um branch à parte, só um layout disso, para experimentarmos com um catálogo fake»). Um catálogo de teste para o
// Estúdio: produtos com cor, preço, mão de obra, o tamanho na planta e a altura no 3D. Os nomes são inventados (nenhuma marca real).
// Mais tarde o catálogo vem do Catálogo da Olyvia (os produtos do fornecedor), com as mesmas chaves.
import type { TipoPeca } from "@/emylia/planta";

export type Cor = "cinza" | "preto" | "branco" | "madeira" | "bege";
export const CORES: Record<Cor, { n: string; hex: string }> = {
  cinza: { n: "Cinza", hex: "#9aa0a6" },
  preto: { n: "Preto", hex: "#2f3136" },
  branco: { n: "Branco", hex: "#f4f4f2" },
  madeira: { n: "Madeira", hex: "#b08458" },
  bege: { n: "Bege", hex: "#d8c7ad" },
};

/** As peças que se põem na planta, e as que vão com elas (a coluna e o resguardo com a base; a torneira com o móvel) ou nas paredes e no chão. */
export type Categoria = TipoPeca | "coluna_duche" | "resguardo" | "torneira" | "revestimento" | "pavimento";
export const NOME_CATEGORIA: Record<Categoria, string> = {
  base: "Bases de duche", banheira: "Banheiras", sanita: "Sanitas", bide: "Bidés", movel: "Móveis", coluna: "Móveis coluna", espelho: "Espelhos",
  toalheiro: "Toalheiros", porta: "Portas", janela: "Janelas", coluna_duche: "Colunas de duche", resguardo: "Resguardos", torneira: "Torneiras",
  revestimento: "Revestimento das paredes", pavimento: "Pavimento",
};
/** O que acompanha cada peça (escolhe-se no mesmo painel). */
export const ACOMPANHA: Partial<Record<TipoPeca, Categoria[]>> = { base: ["coluna_duche", "resguardo"], banheira: ["coluna_duche"], movel: ["torneira"] };

export interface Produto {
  id: string;
  cat: Categoria;
  n: string;
  colecao: string;
  cores: Cor[];
  /** A cor principal (o desenho e o 3D). */
  hex: string;
  /** Preço ao cliente sem IVA (por unidade, ou por m² nos revestimentos e pavimentos). */
  preco: number;
  un: "un" | "m²";
  /** Mão de obra da instalação (por unidade, ou por m²). */
  inst: number;
  /** Na planta (cm), quando se põe na planta. */
  w?: number;
  h?: number;
  /** No 3D: de que altura a que altura (cm). */
  z0?: number;
  z1?: number;
  destaque?: string;
}

const P = (id: string, cat: Categoria, n: string, colecao: string, cores: Cor[], preco: number, inst: number, extra: Partial<Produto> = {}): Produto =>
  ({ id, cat, n, colecao, cores, hex: CORES[cores[0]].hex, preco, un: cat === "revestimento" || cat === "pavimento" ? "m²" : "un", inst, ...extra });

export const CATALOGO: Produto[] = [
  // sanitas
  P("san-nexo-s", "sanita", "Sanita suspensa Nexo, sem aro", "Nexo", ["branco"], 289, 140, { w: 36, h: 52, z0: 30, z1: 72, destaque: "Descarga sem aro, tampa amortecida" }),
  P("san-nexo-c", "sanita", "Sanita suspensa Nexo Cinza Mate", "Nexo", ["cinza"], 349, 140, { w: 36, h: 52, z0: 30, z1: 72, destaque: "Cerâmica cinza mate" }),
  P("san-ria", "sanita", "Sanita compacta Ria ao chão", "Ria", ["branco"], 179, 110, { w: 36, h: 62, z0: 0, z1: 78 }),
  P("san-douro-p", "sanita", "Sanita suspensa Douro Preta", "Douro", ["preto"], 399, 140, { w: 37, h: 54, z0: 30, z1: 72 }),
  P("san-serra", "sanita", "Sanita ao chão Serra, encostada à parede", "Serra", ["branco", "bege"], 239, 120, { w: 36, h: 56, z0: 0, z1: 78 }),
  // bidés
  P("bid-nexo", "bide", "Bidé suspenso Nexo", "Nexo", ["branco"], 219, 120, { w: 36, h: 52, z0: 30, z1: 70 }),
  P("bid-nexo-c", "bide", "Bidé suspenso Nexo Cinza Mate", "Nexo", ["cinza"], 269, 120, { w: 36, h: 52, z0: 30, z1: 70 }),
  // bases de duche
  P("bas-ard-c", "base", "Base Ardósia por medida, Cinza", "Ardósia", ["cinza"], 420, 180, { w: 120, h: 70, z0: 0, z1: 3, destaque: "Encastrada nas paredes, antiderrapante nível 3" }),
  P("bas-ard-p", "base", "Base Ardósia por medida, Preta", "Ardósia", ["preto"], 440, 180, { w: 120, h: 70, z0: 0, z1: 3, destaque: "Textura rugosa, ralo com cesto" }),
  P("bas-ard-b", "base", "Base Ardósia por medida, Branca", "Ardósia", ["branco"], 400, 180, { w: 120, h: 70, z0: 0, z1: 3 }),
  P("bas-lisa-bg", "base", "Base Lisa Areia", "Lisa", ["bege"], 360, 170, { w: 120, h: 80, z0: 0, z1: 3 }),
  // banheiras
  P("ban-lago", "banheira", "Banheira Lago 170", "Lago", ["branco"], 520, 260, { w: 170, h: 75, z0: 0, z1: 55 }),
  P("ban-lago-p", "banheira", "Banheira Lago 170, frente preta", "Lago", ["preto", "branco"], 610, 260, { w: 170, h: 75, z0: 0, z1: 55 }),
  // colunas de duche
  P("col-circ-p", "coluna_duche", "Coluna termostática circular, Preta", "Círculo", ["preto"], 389, 90, { destaque: "Anticalcário, toque frio" }),
  P("col-circ-c", "coluna_duche", "Coluna termostática circular, Cromada", "Círculo", ["cinza"], 339, 90),
  P("col-quad-p", "coluna_duche", "Coluna termostática quadrada, Preta", "Quadra", ["preto"], 409, 90),
  P("col-quad-d", "coluna_duche", "Coluna misturadora quadrada, Dourada", "Quadra", ["bege"], 449, 90),
  // resguardos
  P("res-meio-p", "resguardo", "Resguardo dois fixos, entrada no meio, perfil preto", "Vidro 8 mm", ["preto"], 690, 160, { destaque: "Vidro temperado 8 mm, rolamentos em cima" }),
  P("res-desl-p", "resguardo", "Resguardo fixo e deslizante, perfil preto", "Vidro 8 mm", ["preto"], 640, 160),
  P("res-desl-c", "resguardo", "Resguardo fixo e deslizante, perfil cromado", "Vidro 8 mm", ["cinza"], 590, 160),
  P("res-fixo", "resguardo", "Painel fixo walk-in, perfil preto", "Vidro 8 mm", ["preto"], 450, 120),
  // móveis
  P("mov-axis-80", "movel", "Móvel suspenso Axis 80, gavetas, Axis Oak", "Axis", ["madeira"], 690, 150, { w: 80, h: 46, z0: 35, z1: 85, destaque: "Duas gavetas, tampo cerâmico branco" }),
  P("mov-axis-60", "movel", "Móvel suspenso Axis 60, gavetas, Axis Oak", "Axis", ["madeira"], 590, 150, { w: 60, h: 46, z0: 35, z1: 85 }),
  P("mov-linea-c", "movel", "Móvel suspenso Línea 80, Cinza Antracite", "Línea", ["cinza"], 640, 150, { w: 80, h: 46, z0: 35, z1: 85 }),
  P("mov-linea-b", "movel", "Móvel suspenso Línea 80, Branco brilho", "Línea", ["branco"], 560, 150, { w: 80, h: 46, z0: 35, z1: 85 }),
  P("mov-pe-p", "movel", "Móvel ao chão Pé 80, Preto mate", "Pé", ["preto"], 720, 150, { w: 80, h: 46, z0: 0, z1: 85 }),
  // móveis coluna
  P("cln-axis", "coluna", "Coluna suspensa Axis, Axis Oak", "Axis", ["madeira"], 390, 90, { w: 35, h: 33, z0: 30, z1: 190 }),
  P("cln-linea-c", "coluna", "Coluna suspensa Línea, Cinza Antracite", "Línea", ["cinza"], 360, 90, { w: 35, h: 33, z0: 30, z1: 190 }),
  // espelhos
  P("esp-led-80", "espelho", "Espelho LED direto 80 x 70", "Luz", ["cinza"], 249, 60, { w: 80, h: 4, z0: 110, z1: 180, destaque: "Luz direta, antiembaciamento" }),
  P("esp-led-p", "espelho", "Espelho LED com moldura preta 80 x 70", "Luz", ["preto"], 289, 60, { w: 80, h: 4, z0: 110, z1: 180 }),
  P("esp-red", "espelho", "Espelho redondo 60, moldura madeira", "Ronda", ["madeira"], 199, 50, { w: 60, h: 4, z0: 115, z1: 175 }),
  // toalheiros
  P("toa-ele-p", "toalheiro", "Toalheiro elétrico 50, Preto", "Calor", ["preto"], 229, 80, { w: 50, h: 6, z0: 90, z1: 170 }),
  P("toa-ele-c", "toalheiro", "Toalheiro elétrico 50, Cromado", "Calor", ["cinza"], 199, 80, { w: 50, h: 6, z0: 90, z1: 170 }),
  // torneiras
  P("tor-mono-p", "torneira", "Misturadora de lavatório, Preta", "Círculo", ["preto"], 169, 45),
  P("tor-mono-c", "torneira", "Misturadora de lavatório, Cromada", "Círculo", ["cinza"], 129, 45),
  P("tor-alto-p", "torneira", "Misturadora de pé alto, Preta", "Círculo", ["preto"], 219, 45),
  P("tor-parede-p", "torneira", "Misturadora de parede, Preta", "Quadra", ["preto"], 249, 70),
  // revestimentos (€/m²)
  P("rev-tela-c", "revestimento", "Tela Cinza 120 x 60 retificado, mate", "Tela", ["cinza"], 39, 32, { destaque: "Placa 120 x 60, 1 cm, junta quase invisível" }),
  P("rev-tela-cc", "revestimento", "Tela Cinza Claro 120 x 60 retificado, mate", "Tela", ["cinza"], 39, 32),
  P("rev-tela-a", "revestimento", "Tela Antracite 120 x 60 retificado, mate", "Tela", ["preto", "cinza"], 42, 32),
  P("rev-pedra-cr", "revestimento", "Pedra Creme 120 x 60, mate", "Pedra", ["bege"], 41, 32),
  P("rev-madeira", "revestimento", "Madeira natural 120 x 20, só no duche", "Bosque", ["madeira"], 46, 36),
  P("rev-branco-b", "revestimento", "Branco brilho 60 x 30", "Clássico", ["branco"], 24, 30),
  // pavimentos (€/m²)
  P("pav-tela-a", "pavimento", "Tela Antracite 120 x 60, antiderrapante", "Tela", ["preto", "cinza"], 44, 30, { destaque: "Um tom mais escuro do que as paredes" }),
  P("pav-tela-c", "pavimento", "Tela Cinza 120 x 60, antiderrapante", "Tela", ["cinza"], 42, 30),
  P("pav-madeira", "pavimento", "Cerâmico efeito madeira 120 x 20", "Bosque", ["madeira"], 38, 30),
  P("pav-pedra-cr", "pavimento", "Pedra Creme 60 x 60", "Pedra", ["bege"], 36, 28),
];

export const produto = (id: string | undefined): Produto | undefined => (id ? CATALOGO.find((x) => x.id === id) : undefined);

/** O estilo do cliente: as cores de sempre, e as exceções por categoria («o resto cinza, o móvel em madeira»). */
export interface Estilo { cores: Cor[]; porCategoria: Partial<Record<Categoria, Cor[]>> }

export const coresPara = (e: Estilo, cat: Categoria): Cor[] => e.porCategoria[cat]?.length ? e.porCategoria[cat]! : e.cores;

/** Quanto um produto combina com o estilo: 2 com a 1.ª cor pedida, 1 com outra pedida, 0 sem nenhuma. */
export function combina(p: Produto, e: Estilo): number {
  const quer = coresPara(e, p.cat);
  if (!quer.length) return 1;
  if (p.cores.includes(quer[0])) return 2;
  return p.cores.some((c) => quer.includes(c)) ? 1 : 0;
}

/** Os produtos de uma categoria, os que combinam primeiro (e, entre iguais, o mais barato). */
export function produtosDe(cat: Categoria, e: Estilo, todos = false): Produto[] {
  return CATALOGO.filter((p) => p.cat === cat && (todos || combina(p, e) > 0)).sort((a, b) => combina(b, e) - combina(a, e) || a.preco - b.preco);
}

/** O que melhor combina, ou nada (sem nenhum que combine, não se escolhe sozinho). */
export const melhorPara = (cat: Categoria, e: Estilo): Produto | undefined => produtosDe(cat, e)[0];

// ---------------------------------------------------------------- 5/11 (Rúben: «e incluir também os serviços»)

/** Um serviço do catálogo de teste: o preço por unidade, por m², por metro ou por hora. `sugestao` diz de onde sai a quantidade. */
export interface Servico {
  id: string;
  n: string;
  desc: string;
  un: "un" | "m²" | "m" | "h";
  preco: number;
  /** De onde sai a quantidade sugerida: o chão, as paredes, o perímetro, a zona do duche, ou 1. */
  sugestao: "chao" | "paredes" | "perimetro" | "um" | "duche";
  /** Recomenda-se quando a planta do depois tem uma destas peças. */
  quando?: TipoPeca[];
}

export const SERVICOS: Servico[] = [
  { id: "sv-imperm", n: "Impermeabilização da zona do duche", desc: "Membrana no chão e nas paredes do duche, antes do revestimento.", un: "m²", preco: 28, sugestao: "duche", quando: ["base"] },
  { id: "sv-nicho", n: "Nicho embutido no duche", desc: "Para os champôs, revestido como a parede.", un: "un", preco: 220, sugestao: "um", quando: ["base"] },
  { id: "sv-pintura-teto", n: "Pintura do teto", desc: "Tinta anti-humidade, duas demãos.", un: "m²", preco: 9, sugestao: "chao" },
  { id: "sv-estores", n: "Pintura da caixa dos estores", desc: "Da cor do teto ou dos azulejos.", un: "un", preco: 45, sugestao: "um" },
  { id: "sv-tomada", n: "Tomada nova com tampa", desc: "Junto ao móvel ou ao espelho.", un: "un", preco: 65, sugestao: "um", quando: ["movel"] },
  { id: "sv-aplique", n: "Aplique LED por cima do espelho", desc: "Com o ponto de luz.", un: "un", preco: 85, sugestao: "um", quando: ["espelho"] },
  { id: "sv-ventilador", n: "Ventilador (ventaxia)", desc: "Para casas de banho sem janela ou com pouca ventilação.", un: "un", preco: 160, sugestao: "um" },
  { id: "sv-eletrica", n: "Instalação elétrica nova da casa de banho", desc: "Circuito novo com diferencial, até ao quadro.", un: "un", preco: 480, sugestao: "um" },
  { id: "sv-reboco", n: "Regularização das paredes (reboco)", desc: "Quando, ao tirar o azulejo, a parede não fica direita.", un: "m²", preco: 22, sugestao: "paredes" },
  { id: "sv-rodape", n: "Rodapé cerâmico", desc: "À volta da divisão, do mesmo cerâmico do chão.", un: "m", preco: 12, sugestao: "perimetro" },
  { id: "sv-limpeza", n: "Limpeza final da obra", desc: "Pronta a usar.", un: "un", preco: 80, sugestao: "um" },
];
export const servico = (id: string | undefined): Servico | undefined => (id ? SERVICOS.find((x) => x.id === id) : undefined);
