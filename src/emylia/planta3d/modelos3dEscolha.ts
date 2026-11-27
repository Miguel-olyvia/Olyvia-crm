// A escolha do «Modelo 3D» de um produto, em QUATRO níveis com herança: o produto, o Modelo do Catálogo (0001 SMOOTH…), a subcategoria e a categoria. A
// ordem de decisão é produto > MODELO > subcategoria > categoria > automático (o classificador de catalogo3d.ts: pelo nome, pela subcategoria e pelo
// ramo da árvore). 27/11: o nível do Modelo é novo e opcional: quem não o passa tem exactamente o resultado de antes (retrocompatível).
// Vazio (null, undefined, '') herda do nível de cima. Funções puras, sem React nem three; a base só guarda o id (texto ^[a-z0-9_]{1,40}$, sem lista fechada):
// o que cada id quer dizer vive AQUI.
//
// DE ONDE CHEGA CADA NÍVEL (lido da migração): o `modelo3d` do PRODUTO vem da ficha (cat_ler_produto), da página de Produtos (cat_ler_produtos_pagina) e do Estúdio
// (cat_ler_produtos_pagina + product_categories.modelo_3d). Os lotes cat_ler_produtos_tabelas(_servicos) e cat_ler_catalogo(_servicos) NÃO trazem o modelo por produto,
// só o das categorias e subcategorias: quem lê um catálogo desses (a planta, o catálogo em memória) só resolve subcategoria > categoria > automático, e o override do
// produto não entra. Se um dia esses lotes passarem a trazê-lo, basta o campo `modelo3d` nas linhas (real/lerCatalogo.ts já o copia).
// O `modelo3d` do MODELO (product_models.modelo_3d) vem de cat_ler_modelos_gestao (página de Modelos). A ficha e a planta só o usam quando as leituras do produto
// (cat_ler_produto, cat_ler_produtos_pagina e os lotes) passarem a trazer o `modelo3d` do Modelo a que o produto pertence (product.model_id): até lá o nível
// existe só aqui, na regra, e o `resolverDoNo`/`herdadoDe` aceitam-no em `modelo`.
//
// Os modelos que se podem escolher:
//  - genéricos: um por categoria de categoriasGlb.ts (CATEGORIAS_GLB, com os 7 novos de categoriasGlbNovas.ts); o id é o da categoria;
//  - «catálogo 3D» (família «html»): os modelos exactos do HTML (lava-loiça, placa, torneira de cozinha, tampo Coverlam). O modelo concreto continua a ser
//    escolhido pelo nome e pela medida do produto (htmlDoCatalogo.ts); escolher aqui só diz «este produto é um desses» (o classificador força o tipo);
//  - especiais: `caixa` (a caixa com as medidas, sem modelo), `revestimento_chao` e `revestimento_parede`.
//    24/11: na PRÉ-VISUALIZAÇÃO do produto, os revestimentos chão/parede desenham-se como superfície (uma amostra de peças com juntas e a foto da cor:
//    revestimentoPrevia.ts, onde está também a regra da vista por omissão). Na planta e no classificador continuam a cair na caixa com as medidas.
import { CATEGORIAS_GLB } from "./categoriasGlb";

export type OrigemModelo3D = "produto" | "modelo" | "subcategoria" | "categoria" | "automatico";
/** `generico`: uma categoria de categoriasGlb.ts; `html`: um modelo exacto do catálogo 3D; `caixa`; `revestimento`: ainda cai na caixa. */
export type FamiliaModelo = "generico" | "html" | "caixa" | "revestimento";
export interface ModeloEscolha { id: string; rotulo: string; grupo: string; familia: FamiliaModelo }
export interface ResolvidoModelo3D { modelo: string | null; origem: OrigemModelo3D }
/** Como `ResolvidoModelo3D`, mais o nome do modelo, da subcategoria ou da categoria de onde vem (null: do produto ou automático). */
export interface ResolvidoNo extends ResolvidoModelo3D { de: string | null }

export const ID_CAIXA = "caixa";
export const ID_REVESTIMENTO_CHAO = "revestimento_chao";
export const ID_REVESTIMENTO_PAREDE = "revestimento_parede";

/** O formato que a base aceita para o id de um modelo. */
const FORMATO = /^[a-z0-9_]{1,40}$/;
export const ehIdDeModelo3D = (v: unknown): v is string => typeof v === "string" && FORMATO.test(v);

const G_BANHO = "Casa de banho", G_COZINHA = "Cozinha", G_ELETRO = "Eletrodomésticos", G_QUARTO = "Quarto, sala e decoração";
const G_HTML = "Modelos exactos do catálogo 3D", G_ESPECIAIS = "Sem modelo e revestimentos", G_OUTROS = "Outros";
/** Os grupos da lista, por ordem. */
export const GRUPOS_MODELO: readonly string[] = [G_BANHO, G_COZINHA, G_ELETRO, G_QUARTO, G_HTML, G_ESPECIAIS, G_OUTROS];

/** O grupo de cada genérico (o que não vem aqui cai em «Outros»). */
const GRUPO_DO_GENERICO: Readonly<Record<string, string>> = {
  sanita: G_BANHO, sanita_suspensa: G_BANHO, bide: G_BANHO, lavatorio: G_BANHO, movel_lavatorio: G_BANHO, banheira: G_BANHO, base_duche: G_BANHO, resguardo: G_BANHO,
  espelho: G_BANHO, armario: G_BANHO, toalheiro: G_BANHO, torneira: G_BANHO, coluna_duche: G_BANHO, acessorio: G_BANHO,
  modulo_canto: G_COZINHA, modulo_base: G_COZINHA, armario_parede: G_COZINHA, coluna_cozinha: G_COZINHA, extrator: G_COZINHA, lava_loica: G_COZINHA, tampo_wc: G_COZINHA,
  frigorifico: G_ELETRO, forno: G_ELETRO, maquina_loica: G_ELETRO, maquina_roupa: G_ELETRO, termoacumulador: G_ELETRO, garrafeira: G_ELETRO, fogao: G_ELETRO,
  roupeiro: G_QUARTO, prateleira: G_QUARTO, aplique: G_QUARTO,
};

const GENERICOS: ModeloEscolha[] = CATEGORIAS_GLB.map((c) => ({ id: c.id, rotulo: c.rotulo, grupo: GRUPO_DO_GENERICO[c.id] ?? G_OUTROS, familia: "generico" as const }));
const HTML: ModeloEscolha[] = [
  { id: "html_lava_loica", rotulo: "Lava-loiça (modelo do catálogo 3D)", grupo: G_HTML, familia: "html" },
  { id: "html_placa", rotulo: "Placa de cozinha (modelo do catálogo 3D)", grupo: G_HTML, familia: "html" },
  { id: "html_torneira_cozinha", rotulo: "Torneira de cozinha (modelo do catálogo 3D)", grupo: G_HTML, familia: "html" },
  { id: "html_tampo", rotulo: "Tampo de bancada (chapa Coverlam do catálogo 3D)", grupo: G_HTML, familia: "html" },
];
const ESPECIAIS: ModeloEscolha[] = [
  { id: ID_REVESTIMENTO_CHAO, rotulo: "Revestimento no chão", grupo: G_ESPECIAIS, familia: "revestimento" },
  { id: ID_REVESTIMENTO_PAREDE, rotulo: "Revestimento na parede", grupo: G_ESPECIAIS, familia: "revestimento" },
  { id: ID_CAIXA, rotulo: "Sem modelo (caixa com as medidas)", grupo: G_ESPECIAIS, familia: "caixa" },
];

/** Todos os modelos escolháveis, na ordem em que a lista os mostra por grupo. */
export const MODELOS_ESCOLHA: readonly ModeloEscolha[] = [...GENERICOS, ...HTML, ...ESPECIAIS];

const POR_ID = new Map(MODELOS_ESCOLHA.map((m) => [m.id, m]));
/** O modelo escolhível com este id; undefined se a lista não o conhece (a base não tem lista fechada). */
export const escolhaPorId = (id: string | null | undefined): ModeloEscolha | undefined => (id ? POR_ID.get(id) : undefined);
/** O rótulo em português; um id que a lista não conhece mostra-se pelo próprio id. */
export const rotuloDoModelo3D = (id: string): string => POR_ID.get(id)?.rotulo ?? id;

/**
 * O valor de um nível que conta para a resolução: o id se estiver no formato da base E a lista o conhecer; senão null (a chave em falta, vazia, lixo ou um id
 * novo da base que este código ainda não sabe desenhar herdam do nível de cima). Assim um id desconhecido num nível não corta um nível de cima válido.
 * Os seletores continuam a mostrar o id desconhecido tal como a base o tem («(modelo desconhecido)»): isso lê-se do valor do nível, não daqui.
 */
const limpo = (v: unknown): string | null => (ehIdDeModelo3D(v) && POR_ID.has(v) ? v : null);

/** Produto > modelo > subcategoria > categoria > automático. Vazio herda do nível de cima; sem `modelo` dá o mesmo que antes de ele existir. */
export function resolverModelo3D(n: { produto?: string | null; modelo?: string | null; subcategoria?: string | null; categoria?: string | null }): ResolvidoModelo3D {
  const p = limpo(n.produto), m = limpo(n.modelo), s = limpo(n.subcategoria), c = limpo(n.categoria);
  if (p) return { modelo: p, origem: "produto" };
  if (m) return { modelo: m, origem: "modelo" };
  if (s) return { modelo: s, origem: "subcategoria" };
  if (c) return { modelo: c, origem: "categoria" };
  return { modelo: null, origem: "automatico" };
}

/** O que a árvore do Catálogo (No, NoCat) tem de trazer: o `modelo3d` pode faltar (a migração ainda não está aplicada). */
export interface NoComModelo { id: string; n: string; pai: string | null; modelo3d?: string | null; /** 27/11: o GLB próprio do nó (caminho no bucket); vence o `modelo3d` do mesmo nível */ glb?: string | null }
export interface NivelModelo { nome: string; modelo?: string | null; /** 27/11: o GLB próprio deste nível (caminho no bucket catalogo-modelos3d); vence o `modelo` do mesmo nível */ glb?: string | null }

/** O nível da subcategoria e o da categoria de um nó: um nó com pai é a subcategoria (o pai é a categoria); um nó de topo é a categoria. */
export function niveisDoNo(arvore: readonly NoComModelo[], no: string | null | undefined): { subcategoria: NivelModelo | null; categoria: NivelModelo | null } {
  const n = no ? arvore.find((x) => x.id === no) : undefined;
  if (!n) return { subcategoria: null, categoria: null };
  const pai = n.pai ? arvore.find((x) => x.id === n.pai) : undefined;
  if (!pai) return { subcategoria: null, categoria: { nome: n.n, modelo: n.modelo3d, ...comGlb(n) } };
  return { subcategoria: { nome: n.n, modelo: n.modelo3d, ...comGlb(n) }, categoria: { nome: pai.n, modelo: pai.modelo3d, ...comGlb(pai) } };
}
/** O GLB de um nó, só se o tem (assim, sem GLB, o nível fica exactamente como era). */
const comGlb = (n: NoComModelo): { glb?: string } => (n.glb ? { glb: n.glb } : {});

/** O modelo resolvido a partir dos níveis de cima (sem o produto), com o nome de onde vem. `modelo`: o Modelo do Catálogo a que o produto pertence (nome e escolha). */
export function herdadoDe(n: { modelo?: NivelModelo | null; subcategoria?: NivelModelo | null; categoria?: NivelModelo | null }): ResolvidoNo {
  const r = resolverModelo3D({ modelo: n.modelo?.modelo, subcategoria: n.subcategoria?.modelo, categoria: n.categoria?.modelo });
  const de = r.origem === "modelo" ? n.modelo?.nome : r.origem === "subcategoria" ? n.subcategoria?.nome : r.origem === "categoria" ? n.categoria?.nome : undefined;
  return { ...r, de: de ?? null };
}

/**
 * O modelo de um produto na árvore: o do próprio produto, senão o do Modelo (`modelo`, se o chamador o souber), senão o da subcategoria, senão o da categoria.
 * `soHerdado`: ignora o produto (o que o produto herdaria se não escolhesse nada: é o que o seletor mostra em «Automático (herda: …)»); o Modelo continua a contar.
 */
export function resolverDoNo(o: { produto?: string | null; modelo?: NivelModelo | null; arvore: readonly NoComModelo[]; no: string | null | undefined; soHerdado?: boolean }): ResolvidoNo {
  const herdado = herdadoDe({ ...niveisDoNo(o.arvore, o.no), modelo: o.modelo ?? null });
  const proprio = o.soHerdado ? null : limpo(o.produto);
  return proprio ? { modelo: proprio, origem: "produto", de: null } : herdado;
}

/** De onde vem o GLB próprio que vale: o Modelo, a subcategoria ou a categoria; `de` é o nome dele. */
export interface ResolvidoGlb { glb: string; origem: Exclude<OrigemModelo3D, "produto" | "automatico">; de: string | null }

/**
 * 27/11: o GLB PRÓPRIO que vale para um produto, se algum. A ordem é a do contrato do dono: escolha manual do produto (`produto`) > Modelo (GLB próprio > id escolhido) > subcategoria (GLB próprio >
 * id) > categoria (GLB próprio > id) > automático. Em cada nível o GLB vence o id do MESMO nível; um id escolhido (e conhecido) num nível de cima vence o GLB de um nível de baixo; um id
 * desconhecido herda, como em `resolverModelo3D`. Com a escolha manual do produto ou sem nenhum GLB: null, e quem desenha resolve só pelos ids, exactamente como antes.
 */
export function resolverGlbProprio(n: { produto?: string | null; modelo?: NivelModelo | null; subcategoria?: NivelModelo | null; categoria?: NivelModelo | null }): ResolvidoGlb | null {
  if (limpo(n.produto)) return null;
  for (const [origem, nivel] of [["modelo", n.modelo], ["subcategoria", n.subcategoria], ["categoria", n.categoria]] as const) {
    if (!nivel) continue;
    if (nivel.glb) return { glb: nivel.glb, origem, de: nivel.nome || null };
    if (limpo(nivel.modelo)) return null;
  }
  return null;
}

/** O GLB próprio de um produto na árvore (os nós com `glb`) e, se o chamador o souber, no Modelo a que o produto pertence. */
export function resolverGlbDoNo(o: { produto?: string | null; modelo?: NivelModelo | null; arvore: readonly NoComModelo[]; no: string | null | undefined }): ResolvidoGlb | null {
  return resolverGlbProprio({ produto: o.produto, modelo: o.modelo, ...niveisDoNo(o.arvore, o.no) });
}

/** «Modelo 3D próprio (da subcategoria Bidés)»: o texto de quem manda quando o que se vê é um GLB próprio. */
export const textoDoGlb = (r: ResolvidoGlb): string => `Modelo 3D próprio (${daOrigem(r.origem)}${r.de ? ` ${r.de}` : ""})`;

/** «do modelo», «da subcategoria» ou «da categoria»: de onde vem o que se herda. */
export const daOrigem = (origem: OrigemModelo3D): string => (origem === "modelo" ? "do modelo" : origem === "subcategoria" ? "da subcategoria" : "da categoria");

/** «Sanita de chão (da subcategoria Sanitas)», «Bidé (do modelo SMOOTH)», «Bidé (escolhido neste produto)» ou «automático, pelo nome e pela subcategoria». */
export function textoDaOrigem(r: ResolvidoNo): string {
  if (!r.modelo) return "automático, pelo nome e pela subcategoria";
  const nome = rotuloDoModelo3D(r.modelo);
  if (r.origem === "produto") return `${nome} (escolhido neste produto)`;
  return `${nome} (${daOrigem(r.origem)}${r.de ? ` ${r.de}` : ""})`;
}

/** O rótulo da primeira opção do seletor: «Automático (herda: Sanita de chão, da subcategoria Sanitas)». */
export function rotuloAutomatico(h: ResolvidoNo): string {
  if (!h.modelo) return "Automático (herda: o classificador, pelo nome e pela subcategoria)";
  return `Automático (herda: ${rotuloDoModelo3D(h.modelo)}, ${daOrigem(h.origem)}${h.de ? ` ${h.de}` : ""})`;
}
