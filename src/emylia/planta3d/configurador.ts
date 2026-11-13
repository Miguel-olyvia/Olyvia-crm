// Protótipo (visualizador 3D): o CONFIGURADOR DE FAMÍLIAS, só em memória (estado React; recarregar perde tudo; nada vai para a base nem para o armazenamento).
// Uma família é SEMPRE um agrupamento de produtos que já existem no catálogo (só se diferenciam em atributos). NADA se escreve à mão: os atributos de cada produto vêm de
// `atributosDoProduto` (atributosProduto.ts) e o utilizador só ESCOLHE quais servem de seletor de cor (bolinhas) e de medida (`EixosCfg`) e que produtos entram.
// Modelo: acabamentos × medidas + uma MATRIZ de células (uma por produto: SKU e preço vêm dele) + o GLB do fabricante por célula. `paraFamilia`
// converte-a numa `Familia` do catálogo (familias.ts), para o resto do ecrã a tratar como as outras. Funções puras: sem React, sem three.
import { CATEGORIAS_FAMILIA, FAMILIAS, PREFIXO_CFG, type AcabFam, type CategoriaFam, type Familia, type MedidaFam } from "./familias";
import type { TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";
import { FICHEIROS_3D, chaveFicheiro, type Ficheiro3D } from "./modelosHtml/ficheiros";
import { precoUnitario } from "../produtosVisita";

export interface AcabCfg { id: string; nome: string; cor: string; metalness: number; roughness: number; codigo: string }
export interface MedidaCfg { id: string; rotulo: string; ref: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** preço base (€) */ preco: number }
/** Uma célula da matriz: o acabamento existe nesta medida? `preco`/`sku` próprios sobrepõem o da medida / o automático.
 * Com `produtoId` a variante É um produto que já existe no catálogo: `sku` e `preco` são uma cópia do produto (só leitura, não se editam aqui) e `produtoNome` o nome dele. */
export interface CelulaCfg {
  ativo: boolean; sku?: string; preco?: number; produtoId?: string; produtoNome?: string;
  /** a medida base do produto («50 cm», sem os atributos extra) e os valores dos atributos extra (`FamiliaCfg.atributos`); só nas células de produtos do catálogo */
  medida?: string; valores?: Record<string, string>;
}
export interface RegraSku { modo: "auto" | "manual"; sep: string }
export interface FamiliaCfg {
  id: string; marca: string; nome: string; categoria: CategoriaFam; tipo: TipoMockup; espacos: TipoEspaco[];
  acabamentos: AcabCfg[]; medidas: MedidaCfg[];
  /** chave `medidaId|acabId` (celulaKey) */
  celulas: Record<string, CelulaCfg>;
  regraSku: RegraSku;
  /** chave da célula → chave do ficheiro GLB («familia|modelo|acab», modelosHtml/ficheiros.ts); sem entrada, modelo genérico */
  glb?: Record<string, string>;
  /** os nomes dos atributos extra da família («Nº de cubas», «Material»…), além da medida e da cor/acabamento; cada produto tem um valor para cada (`CelulaCfg.valores`). Sem eles, a família só tem medida e cor. */
  atributos?: string[];
  /** os atributos (dos produtos) que servem de seletor de cor/acabamento e de medida. Com isto a família vem dos eixos (`familiaPorEixos`) e `atributos` já não se usa. */
  eixos?: EixosCfg;
}
/** Os eixos escolhidos: `cor` = o atributo das bolinhas (um só, ou nenhum); `medida` = os atributos que compõem o seletor de medida, pela ordem escolhida. */
export interface EixosCfg { cor: string | null; medida: string[] }
/** Um problema da família e o GRUPO onde se corrige: 1 Família; 2 acabamentos, 3 medidas e 4 combinações. No assistente (PainelConfigurador) o grupo 1 (nome, marca, espaços) é
 * DERIVADO dos produtos e mostra-se no resumo; os grupos 2, 3 e 4 mostram-se no passo «Atributos dos produtos». */
export interface Problema { passo: 1 | 2 | 3 | 4; msg: string }

export const celulaKey = (medidaId: string, acabId: string): string => `${medidaId}|${acabId}`;

/** Os tipos de produto que cada categoria aceita (o primeiro é o de omissão). */
export const TIPOS_DA_CATEGORIA: Record<CategoriaFam, TipoMockup[]> = {
  torneiras: ["torneira_cozinha"], lavaloicas: ["lava_loica"], placas: ["placa"], tampos: ["tampo"], cozinha: ["movel", "sifao"],
  banho: ["base_duche", "resguardo", "torneira", "coluna_duche", "movel", "lavatorio_pousar", "espelho"],
};

export function slug(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const idDoNome = (nome: string): string => `${PREFIXO_CFG}${slug(nome)}`;

/** Os GLB do fabricante que servem um tipo (só há de torneira de cozinha e de lava-loiça). */
export function ficheirosCompativeis(tipo: TipoMockup): Ficheiro3D[] {
  const familia = tipo === "torneira_cozinha" ? "torneira" : tipo === "lava_loica" ? "lava_loica" : null;
  return familia ? FICHEIROS_3D.filter((x) => x.familia === familia) : [];
}

/* ------------------------------------------------------------------ SKU e preço por célula */
const medidaDe = (f: FamiliaCfg, id: string) => f.medidas.find((m) => m.id === id);
const acabDe = (f: FamiliaCfg, id: string) => f.acabamentos.find((a) => a.id === id);
/** O SKU de uma célula: automático = ref + separador + código; manual = o escrito à mão, ou o automático se estiver vazio. */
export function skuDaCelula(f: FamiliaCfg, medidaId: string, acabId: string): string {
  const m = medidaDe(f, medidaId), a = acabDe(f, acabId);
  if (!m || !a) return "";
  const c = f.celulas[celulaKey(medidaId, acabId)];
  if (c?.produtoId) return c.sku?.trim() ?? "";
  const auto = `${m.ref}${f.regraSku.sep}${a.codigo}`;
  return f.regraSku.modo === "manual" ? (f.celulas[celulaKey(medidaId, acabId)]?.sku?.trim() || auto) : auto;
}
const precoProprio = (c?: CelulaCfg): number | undefined => (typeof c?.preco === "number" && Number.isFinite(c.preco) && c.preco > 0 ? c.preco : undefined);
/** O preço de uma célula: o dela, senão o da medida. */
export function precoDaCelula(f: FamiliaCfg, medidaId: string, acabId: string): number {
  const c = f.celulas[celulaKey(medidaId, acabId)];
  if (c?.produtoId) return precoProprio(c) ?? 0;
  return precoProprio(c) ?? medidaDe(f, medidaId)?.preco ?? 0;
}

const celulasAtivas = (f: FamiliaCfg): { m: MedidaCfg; a: AcabCfg }[] =>
  f.medidas.flatMap((m) => f.acabamentos.filter((a) => f.celulas[celulaKey(m.id, a.id)]?.ativo === true).map((a) => ({ m, a })));
const nomeMedida = (m: MedidaCfg): string => m.rotulo.trim() || m.ref.trim() || m.id;
/** A medida tem células que são produtos do catálogo? Então o preço vem deles e o «preço base» é só informativo. */
const medidaDoCatalogo = (f: FamiliaCfg, medidaId: string): boolean => Object.entries(f.celulas).some(([k, c]) => k.startsWith(`${medidaId}|`) && !!c.produtoId);

/* ------------------------------------------------------------------ validação */
export function problemas(f: FamiliaCfg, outrosIds: readonly string[] = []): Problema[] {
  const p: Problema[] = [], add = (passo: Problema["passo"], msg: string) => p.push({ passo, msg });
  if (!f.nome.trim()) add(1, "Não foi possível derivar o nome da família a partir dos produtos escolhidos.");
  else if (!slug(f.nome)) add(1, "O nome da família (derivado dos produtos) precisa de letras ou números.");
  if (f.id === PREFIXO_CFG || outrosIds.includes(f.id) || FAMILIAS.some((d) => d.id === f.id)) add(1, `Já existe uma família com o identificador «${f.id}»: escolha outros produtos ou remova a família que já existe.`);
  if (f.espacos.length === 0) add(1, "Escolha pelo menos um espaço (onde a família aparece).");
  if (f.acabamentos.length === 0) add(2, "Junte pelo menos um acabamento.");
  for (const a of f.acabamentos) {
    if (!a.nome.trim()) add(2, "Há um acabamento sem nome.");
    if (!a.codigo.trim()) add(2, `O acabamento «${a.nome.trim() || a.id}» não tem código (serve para o SKU).`);
  }
  if (f.medidas.length === 0) add(3, "Junte pelo menos um produto (uma medida com referência).");
  for (const m of f.medidas) {
    if (!(m.preco > 0) && !medidaDoCatalogo(f, m.id)) add(3, `O produto «${nomeMedida(m)}» não tem preço base.`);
    if (!m.ref.trim()) add(3, `O produto «${nomeMedida(m)}» não tem referência.`);
    if (m.dim.some((x) => !(x > 0))) add(3, `O produto «${nomeMedida(m)}» tem dimensões por preencher.`);
  }
  if (f.acabamentos.length > 0 && f.medidas.length > 0) {
    const ativas = celulasAtivas(f);
    if (ativas.length === 0) add(4, "Nenhuma combinação está ativa: ative pelo menos uma cor numa medida.");
    const porSku = new Map<string, string[]>();
    for (const { m, a } of ativas) { const s = skuDaCelula(f, m.id, a.id); porSku.set(s, [...(porSku.get(s) ?? []), `${nomeMedida(m)} × ${a.nome}`]); }
    for (const [sku, onde] of porSku) if (onde.length > 1) add(4, `O SKU «${sku}» repete-se (${onde.join("; ")}).`);
    const porProduto = new Map<string, { nome: string; onde: string[] }>();
    for (const { m, a } of ativas) {
      const c = f.celulas[celulaKey(m.id, a.id)];
      if (!c?.produtoId) continue;
      const nome = c.produtoNome || c.sku || c.produtoId, atual = porProduto.get(c.produtoId) ?? { nome, onde: [] };
      porProduto.set(c.produtoId, { nome, onde: [...atual.onde, `${nomeMedida(m)} × ${a.nome}`] });
      if (precoProprio(c) === undefined) add(3, `O produto do catálogo «${nome}» não tem preço de venda.`);
    }
    for (const [, x] of porProduto) if (x.onde.length > 1) add(4, `O mesmo produto do catálogo («${x.nome}») entra em mais de uma variante (${x.onde.join("; ")}).`);
    if (ativas.length > 0) for (const m of f.medidas) if (!ativas.some((x) => x.m.id === m.id)) add(4, `O produto «${nomeMedida(m)}» não tem nenhum acabamento ativo: junte um acabamento ou remova o produto.`);
  }
  return p;
}
/** Só as mensagens (português legível), por ordem de passo. */
export const validar = (f: FamiliaCfg, outrosIds: readonly string[] = []): string[] => problemas(f, outrosIds).map((x) => x.msg);

/* ------------------------------------------------------------------ da configuração à Familia do catálogo */
/** A `Familia` do catálogo: a matriz substitui `spec.acabamentos` (os acabamentos de cada medida vêm das células activas); preço e SKU por célula vão em `spec.precos/skus`. */
export function paraFamilia(f: FamiliaCfg): Familia {
  const ativas = celulasAtivas(f);
  const medidas: MedidaFam[] = f.medidas.filter((m) => ativas.some((x) => x.m.id === m.id)).map((m) => {
    const dela = ativas.filter((x) => x.m.id === m.id).map((x) => x.a);
    const precos: Record<string, number> = {}, skus: Record<string, string> = {}, produtos: Record<string, string> = {};
    for (const a of dela) {
      const c = f.celulas[celulaKey(m.id, a.id)], proprio = precoProprio(c);
      if (proprio !== undefined) precos[a.id] = proprio;
      skus[a.id] = skuDaCelula(f, m.id, a.id);
      if (c?.produtoId) produtos[a.id] = c.produtoId;
    }
    const [w, d, h] = m.dim;
    const forma = f.tipo === "torneira_cozinha" ? { torneira: { estilo: "monocomando" as const, altura: h * 10, saida: d * 10, alcance: d * 10, base: w * 10 } }
      : f.tipo === "lava_loica" ? { cubas: [{ w: Math.max(w * 10 - 40, 100), d: Math.max(d * 10 - 40, 100), prof: h * 10, left: 20, top: 20 }] } : {};
    return { id: m.id, rotulo: m.rotulo, ref: m.ref, preco: m.preco, dim: m.dim, spec: { ...forma, acabamentos: dela.map((a) => a.id), precos, skus, ...(Object.keys(produtos).length ? { produtos } : {}) } };
  });
  const acabamentos: AcabFam[] = f.acabamentos.filter((a) => ativas.some((x) => x.a.id === a.id)).map((a) => ({ ...a, delta: 0 }));
  const glbCelulas: Record<string, string> = {};
  for (const { m, a } of ativas) { const g = f.glb?.[celulaKey(m.id, a.id)]; if (g) glbCelulas[celulaKey(m.id, a.id)] = g; }
  return {
    id: f.id, nome: f.nome.trim(), marca: f.marca.trim(), categoria: f.categoria, tipo: f.tipo, espacos: f.espacos, acabamentos, medidas,
    nota: "Família configurada no protótipo (só nesta sessão).", origem: "configurada", ...(Object.keys(glbCelulas).length ? { glbCelulas } : {}),
  };
}

/* ------------------------------------------------------------------ construção (uma família é sempre um agrupamento de produtos do catálogo) */
export const comNome = (f: FamiliaCfg, nome: string): FamiliaCfg => ({ ...f, nome, id: idDoNome(nome) });
const norm = (s: string): string => s.trim().toLowerCase();

/** A família de partida do assistente: só o cabeçalho. As medidas, os acabamentos e as células saem sempre dos produtos escolhidos (`familiaDeProdutos`). */
export function criarFamiliaVazia(): FamiliaCfg {
  return {
    id: PREFIXO_CFG, marca: "", nome: "", categoria: "lavaloicas", tipo: "lava_loica", espacos: CATEGORIAS_FAMILIA.find((c) => c.id === "lavaloicas")?.espacos ?? ["cozinha", "outro"],
    acabamentos: [], medidas: [], celulas: {}, regraSku: { modo: "auto", sep: "-" },
  };
}

/** Uma linha do resumo: uma variante ativa = um produto real do catálogo. `produto` é o nome dele; `medida` é a medida base (sem os atributos extra) e `valores` os atributos extra. */
export interface LinhaVariante {
  chave: string; medidaId: string; acabId: string; produto: string; medida: string; valores: Record<string, string>; acabamento: string; sku: string; preco: number; tem3d: boolean;
  /** o produto do catálogo de onde vêm o SKU e o preço */ produtoId?: string;
}
export const linhasDeVariantes = (f: FamiliaCfg): LinhaVariante[] => celulasAtivas(f).map(({ m, a }) => {
  const chave = celulaKey(m.id, a.id), c = f.celulas[chave];
  return {
    chave, medidaId: m.id, acabId: a.id, produto: c?.produtoNome || nomeMedida(m), medida: c?.medida ?? nomeMedida(m), valores: { ...c?.valores }, acabamento: a.nome.trim() || a.id,
    sku: skuDaCelula(f, m.id, a.id), preco: precoDaCelula(f, m.id, a.id), tem3d: Boolean(f.glb?.[chave]), ...(c?.produtoId ? { produtoId: c.produtoId } : {}),
  };
});
/** «N produtos = N variantes»: cada variante ativa é um produto do catálogo. */
export function resumoDeProdutos(f: FamiliaCfg): { produtos: number; texto: string } {
  const produtos = linhasDeVariantes(f).length;
  return { produtos, texto: `${produtos} ${produtos === 1 ? "produto" : "produtos"} = ${produtos} ${produtos === 1 ? "variante" : "variantes"}` };
}

/* ------------------------------------------------------------------ JUNTAR PRODUTOS QUE JÁ EXISTEM NO CATÁLOGO
 * Em vez de recriar cada variante, escolhem-se produtos reais do catálogo (só leitura): cada um é UMA variante (medida × acabamento) e traz o seu SKU e o seu preço de
 * venda, que aqui não se editam. O palpite por análise do nome propõe a medida e o acabamento; o utilizador corrige. Funções puras, sem React.
 * O catálogo de exemplo não traz o acabamento em colunas: está no nome («Lody 40 U-F - Cobre») ou no subtipo («Cubas inox»), por isso é preciso adivinhá-lo. */

/** A margem-alvo (%) com que o protótipo calcula o preço de um produto sem PVP (o valor de omissão do motor, `cfg.alvo`). */
export const ALVO_PROTO = 35;
/** Um produto do catálogo como o configurador o vê: o preço de venda já resolvido (o PVP real, senão custo ÷ (1 − margem-alvo), como o catálogo). */
export interface ProdutoRef { id: string; n: string; marca?: string; sku?: string; sub?: string; /** preço de venda por unidade (€, s/IVA); 0 = sem preço */ preco: number; /** o catálogo não tem PVP: o preço foi calculado pelo custo */ semPvp: boolean }
/** O mínimo que se lê de um `Produto` do catálogo (v2/catalogoModelo.ts). */
export interface ProdutoDoCatalogo { id: string; n: string; marca?: string; sku?: string; sub?: string; custo: number; pvp?: number }
export function refDoProduto(p: ProdutoDoCatalogo, alvo: number = ALVO_PROTO): ProdutoRef {
  const sku = p.sku?.trim() || p.id, preco = precoUnitario({ custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}) }, alvo);
  return { id: p.id, n: p.n, ...(p.marca ? { marca: p.marca } : {}), sku, ...(p.sub ? { sub: p.sub } : {}), preco: Number.isFinite(preco) && preco > 0 ? preco : 0, semPvp: !(p.pvp != null && p.pvp > 0) };
}

const plano = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
interface AcabConhecido { id: string; codigo: string; cor: string; metalness: number; roughness: number; re: RegExp }
/** Os acabamentos que o nome costuma trazer (o `id` é o do catálogo 3D, para propor o GLB do fabricante). */
const ACABAMENTOS_CONHECIDOS: readonly AcabConhecido[] = [
  { id: "cobre", codigo: "CO", cor: "#bc825b", metalness: 1, roughness: 0.3, re: /\b(cobre|copper)\b/g },
  { id: "oro", codigo: "GO", cor: "#c9ad68", metalness: 1, roughness: 0.3, re: /\b(oro|gold|dourad[oa])\b/g },
  { id: "gunmetal", codigo: "GM", cor: "#62605e", metalness: 1, roughness: 0.29, re: /\bgun ?metal\b/g },
  { id: "inox", codigo: "IX", cor: "#c3c7ca", metalness: 1, roughness: 0.3, re: /\binox(idavel)?\b/g },
  { id: "negro", codigo: "NE", cor: "#151617", metalness: 0.05, roughness: 0.5, re: /\b(negro|preto|preta|black|midnight)\b/g },
  { id: "blanco", codigo: "BL", cor: "#f2f2ef", metalness: 0.02, roughness: 0.4, re: /\b(blanco|branco|branca|white)\b/g },
  { id: "chrome", codigo: "CR", cor: "#d9dde0", metalness: 1, roughness: 0.12, re: /\b(cromad[oa]|cromo|chrome)\b/g },
  { id: "nickel", codigo: "NI", cor: "#b9bcbd", metalness: 1, roughness: 0.2, re: /\bniquel\b/g },
  { id: "brushed", codigo: "AC", cor: "#b7b9ba", metalness: 1, roughness: 0.27, re: /\b(acero|escovad[oa])\b/g },
  { id: "titanio", codigo: "TI", cor: "#55524d", metalness: 1, roughness: 0.3, re: /\btitanio\b/g },
  { id: "antracite", codigo: "AN", cor: "#4a4e53", metalness: 0, roughness: 0.5, re: /\bantracite\b/g },
];
/** O acabamento conhecido que aparece MAIS À DIREITA no texto (em «BLANCO INOX LEMIS», Blanco é a marca e Inox o acabamento) e o pedaço do texto original. */
function acabamentoNoTexto(texto: string): { a: AcabConhecido; achado: string } | undefined {
  const t = plano(texto);
  let melhor: { a: AcabConhecido; achado: string; i: number } | undefined;
  for (const a of ACABAMENTOS_CONHECIDOS) for (const m of t.matchAll(a.re)) if (!melhor || m.index > melhor.i) melhor = { a, achado: texto.slice(m.index, m.index + m[0].length), i: m.index };
  return melhor;
}
/** O cinzento neutro dos acabamentos que o protótipo não conhece. */
export const COR_NEUTRA = "#b7b9ba";
/** A cor (e o brilho) DERIVADOS do acabamento de um produto do catálogo: a cor não se escolhe, vem do nome do acabamento. `conhecido` = o nome é um acabamento que o protótipo conhece. */
export function corDoAcabamento(nome: string): { cor: string; metalness: number; roughness: number; conhecido: boolean } {
  const achado = nome.trim() ? acabamentoNoTexto(nome) : undefined;
  return achado ? { cor: achado.a.cor, metalness: achado.a.metalness, roughness: achado.a.roughness, conhecido: true } : { cor: COR_NEUTRA, metalness: 0.5, roughness: 0.4, conhecido: false };
}
const formatoNome = (s: string): string => (s === s.toUpperCase() || s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const iniciais = (s: string): string => { const p = s.trim().split(/\s+/).filter(Boolean); return (p.length > 1 ? p.map((x) => x[0]).join("") : (p[0] ?? "").slice(0, 2)).toUpperCase(); };
/** O pedaço depois do último « - » do nome, se parece um acabamento (sem números, até 3 palavras, sem «cuba»). */
function fimDoNome(nome: string): string {
  const partes = nome.split(/\s+[-–—]\s+/);
  const fim = partes.length > 1 ? partes[partes.length - 1].trim() : "";
  return fim && !/\d/.test(fim) && !/cuba/i.test(fim) && fim.split(/\s+/).length <= 3 ? fim : "";
}

export interface PalpiteProduto {
  /** o rótulo da medida («40 cm», «60×45×80 cm» ou «Única») */
  medida: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** a largura em cm lida do nome */ numero?: number;
  acabamento: string; cor: string; codigo: string; metalness: number; roughness: number; /** o id do acabamento no catálogo 3D, quando o nome o diz */ acabId?: string;
}
/** O palpite da medida e do acabamento de um produto a partir do nome (e do subtipo): sempre editável. */
export function palpiteDoProduto(nome: string, o: { sub?: string; tipo?: TipoMockup } = {}): PalpiteProduto {
  const texto = nome.replace(/\s+/g, " ").trim(), t = plano(texto), lava = o.tipo === "lava_loica";
  // acabamento: o fim do nome («… - Cobre»), senão o que está mais à direita no nome, senão no subtipo
  const fim = fimDoNome(texto);
  const achado = fim ? acabamentoNoTexto(fim) : (acabamentoNoTexto(texto) ?? acabamentoNoTexto(o.sub ?? ""));
  let acab: Pick<PalpiteProduto, "acabamento" | "cor" | "codigo" | "metalness" | "roughness" | "acabId"> = { acabamento: "Padrão", cor: "#b7b9ba", codigo: "STD", metalness: 0.5, roughness: 0.4 };
  if (achado) acab = { acabamento: formatoNome(fim || achado.achado), cor: achado.a.cor, codigo: achado.a.codigo, metalness: achado.a.metalness, roughness: achado.a.roughness, acabId: achado.a.id };
  else if (fim) acab = { acabamento: formatoNome(fim), cor: "#b7b9ba", codigo: iniciais(fim), metalness: 0.5, roughness: 0.4 };
  // medida: «60x45x80», senão «86CM», senão o número a seguir a «CUBA», senão o primeiro número de 2-3 algarismos (20 a 300) que não conta cubas
  const tres = /(\d{2,3})\s*[x×]\s*(\d{2,3})(?:\s*[x×]\s*(\d{1,3}))?/.exec(t);
  if (tres) {
    const w = Number(tres[1]), d = Number(tres[2]), h = tres[3] ? Number(tres[3]) : 20;
    return { medida: `${w}×${d}${tres[3] ? `×${h}` : ""} cm`, dim: [w, d, h], numero: w, ...acab };
  }
  const n = /(\d{2,3})\s*cm\b/.exec(t)?.[1] ?? /cubas?\s+(\d{2,3})\b/.exec(t)?.[1]
    ?? [...t.matchAll(/\b(\d{2,3})\b(?!\s*cubas?)/g)].map((m) => Number(m[1])).find((x) => x >= 20 && x <= 300)?.toString();
  if (n === undefined) return { medida: "Única", dim: lava ? [50, 44, 20] : [60, 50, 20], ...acab };
  const numero = Number(n);
  return { medida: `${numero} cm`, dim: lava ? [numero + 4, 44, 20] : [numero, 50, 20], numero, ...acab };
}

/** O nome e a marca sugeridos para a família: o começo comum dos nomes (sem números nem «CUBA» no fim) e a marca mais frequente. */
export function sugerirFamilia(refs: readonly ProdutoRef[]): { nome: string; marca: string } {
  if (refs.length === 0) return { nome: "", marca: "" };
  const marcas = new Map<string, number>();
  for (const r of refs) if (r.marca?.trim()) marcas.set(r.marca.trim(), (marcas.get(r.marca.trim()) ?? 0) + 1);
  const marca = [...marcas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const palavras = (n: string) => n.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const numerica = /^\d+([.,]\d+)?(cm)?$/i, solta = /^\d+([.,]\d+)?(cm)?$|^cubas?$|^[-–—]$/i;
  const limpar = (p: string[]) => { const q = [...p]; while (q.length && solta.test(q[q.length - 1])) q.pop(); return q; };
  const um = (n: string) => {
    const fim = fimDoNome(n), base = fim ? n.slice(0, n.lastIndexOf(fim)).replace(/\s+[-–—]\s*$/, "") : n;
    return palavras(base).filter((w) => !numerica.test(w)).join(" ");
  };
  if (refs.length === 1) return { nome: um(refs[0].n), marca };
  const todas = refs.map((r) => palavras(r.n)), primeira = todas[0], comum: string[] = [];
  for (let i = 0; i < primeira.length && todas.every((p) => p[i] !== undefined && plano(p[i]) === plano(primeira[i])); i++) comum.push(primeira[i]);
  return { nome: limpar(comum).join(" ") || um(refs[0].n), marca };
}

/** A categoria (e o tipo, que a categoria aceita) sugerida pelo tipo de mockup do produto. */
export function categoriaSugerida(tipo: TipoMockup): { categoria: CategoriaFam; tipo: TipoMockup } {
  const direto: Partial<Record<TipoMockup, CategoriaFam>> = { lava_loica: "lavaloicas", torneira_cozinha: "torneiras", placa: "placas", tampo: "tampos", bancada: "tampos", sifao: "cozinha" };
  const categoria = direto[tipo] ?? (TIPOS_DA_CATEGORIA.banho.includes(tipo) ? "banho" : "cozinha");
  return { categoria, tipo: TIPOS_DA_CATEGORIA[categoria].includes(tipo) ? tipo : TIPOS_DA_CATEGORIA[categoria][0] };
}

/** A chave do GLB do fabricante que o nome do produto casa (modelo = palavra do nome; números a ±1 cm; sufixo «N»; acabamento do palpite), ou vazio. */
export function ficheiroSugerido(tipo: TipoMockup, nome: string, palpite: Pick<PalpiteProduto, "acabId" | "numero">): string {
  const familia = tipo === "torneira_cozinha" ? "torneira" : tipo === "lava_loica" ? "lava_loica" : null;
  if (!familia || !palpite.acabId) return "";
  const palavras = plano(nome).split(/[^a-z0-9]+/).filter(Boolean);
  let melhor: { x: Ficheiro3D; custo: number } | undefined;
  for (const x of FICHEIROS_3D) {
    if (x.familia !== familia || x.acab !== palpite.acabId) continue;
    const m = /^([a-z]+)(\d+)?([a-z]*)$/.exec(x.modelo);
    if (!m || !palavras.includes(m[1])) continue;
    if (!m[3] && palavras.includes("n")) continue;
    if (m[3] && !palavras.includes(m[3])) continue;
    let custo = 0;
    if (m[2]) {
      if (palpite.numero === undefined) continue;
      custo = Math.abs(Number(m[2]) - palpite.numero);
      if (custo > 1) continue;
    }
    if (!melhor || custo < melhor.custo) melhor = { x, custo };
  }
  return melhor ? chaveFicheiro(melhor.x.familia, melhor.x.modelo, melhor.x.acab) : "";
}

/** A atribuição de um produto à família (a UI já não a escreve: `familiaPorEixos` constrói-a dos atributos do produto): a medida, o acabamento (a `cor` é DERIVADA dele por `corDoAcabamento`), os valores dos atributos da medida (`extras`) e o GLB proposto. */
export interface AtribuicaoProduto { produtoId: string; medida: string; dim: [number, number, number]; acabamento: string; cor: string; codigo: string; metalness?: number; roughness?: number; glb?: string; extras?: Record<string, string> }

/** O rótulo da medida no cartão: a medida + os valores dos atributos extra que o produto tem («50 cm · 2 cubas»). Uma medida «Única» só aparece se não houver extras. */
export function rotuloDaMedida(medida: string, extras: readonly string[]): string {
  const m = medida.trim(), v = extras.map((x) => x.trim()).filter(Boolean), base = m && !(m === "Única" && v.length > 0) ? [m] : [];
  return [...base, ...v].join(" · ") || "Única";
}

/** Monta a família a partir dos produtos escolhidos e das atribuições (mantém o nome, a marca, a categoria, o tipo, os espaços e os atributos extra de `base`).
 * O rótulo de cada «produto» da família é a medida + os valores dos atributos extra: produtos com o mesmo rótulo juntam-se, com as dimensões do primeiro; o mesmo acabamento (nome) é um só.
 * Se dois produtos têm os mesmos valores em TODOS os atributos (medida, extras e cor/acabamento), o segundo fica de fora e há um conflito para corrigir. */
export function familiaDeProdutos(base: FamiliaCfg, refs: readonly ProdutoRef[], atribuicoes: readonly AtribuicaoProduto[]): { familia: FamiliaCfg; conflitos: string[] } {
  const porId = new Map(refs.map((r) => [r.id, r] as const)), compativeis = new Set(ficheirosCompativeis(base.tipo).map((x) => chaveFicheiro(x.familia, x.modelo, x.acab)));
  const eixos = base.eixos, nomesExtra = eixos ? eixos.medida : base.atributos ?? [];
  const medidas: MedidaCfg[] = [], acabamentos: AcabCfg[] = [], celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {}, ocupado = new Map<string, string>(), conflitos: string[] = [];
  for (const a of atribuicoes) {
    const r = porId.get(a.produtoId);
    if (!r) continue;
    const valores: Record<string, string> = {};
    for (const n of nomesExtra) { const v = a.extras?.[n]?.trim(); if (v) valores[n] = v; }
    const lista = nomesExtra.map((n) => valores[n] ?? ""), nomeAcab = a.acabamento.trim() || "Padrão";
    // com eixos o rótulo é só os valores dos atributos escolhidos, pela ordem escolhida; sem eixos, a medida + os extras (famílias antigas)
    const rotulo = eixos ? lista.filter(Boolean).join(" · ") || "Única" : rotuloDaMedida(a.medida, lista), medidaBase = eixos ? valores[NOME_MEDIDA] || rotulo : a.medida.trim() || "Única";
    let m = medidas.find((x) => norm(x.rotulo) === norm(rotulo));
    if (!m) { m = { id: `m${medidas.length + 1}`, rotulo, ref: r.sku?.trim() || r.id, dim: [...a.dim], preco: 0 }; medidas.push(m); }
    let c = acabamentos.find((x) => norm(x.nome) === norm(nomeAcab));
    if (!c) { const d = corDoAcabamento(nomeAcab); c = { id: `a${acabamentos.length + 1}`, nome: nomeAcab, cor: d.cor, metalness: d.conhecido ? d.metalness : a.metalness ?? d.metalness, roughness: d.conhecido ? d.roughness : a.roughness ?? d.roughness, codigo: a.codigo.trim() || `A${acabamentos.length + 1}` }; acabamentos.push(c); }
    const k = celulaKey(m.id, c.id);
    if (ocupado.has(k)) {
      const todos = [...(eixos ? [] : [`Medida: ${medidaBase}`]), ...nomesExtra.map((n) => `${n}: ${valores[n] ?? "—"}`), `${eixos?.cor ?? "Cor"}: ${c.nome}`].join("; ");
      const como = eixos ? "corrija no produto do catálogo ou exclua um dos produtos" : "mude pelo menos um valor num deles";
      conflitos.push(`Os produtos «${ocupado.get(k)}» e «${r.n}» têm os mesmos valores em todos os atributos (${todos}): ${como}.`);
      continue;
    }
    ocupado.set(k, r.n);
    celulas[k] = { ativo: true, produtoId: r.id, produtoNome: r.n, sku: r.sku?.trim() || r.id, ...(r.preco > 0 ? { preco: r.preco } : {}), medida: medidaBase, ...(Object.keys(valores).length ? { valores } : {}) };
    if (a.glb && compativeis.has(a.glb)) glb[k] = a.glb;
  }
  for (const m of medidas) {
    const precos = Object.entries(celulas).filter(([k]) => k.startsWith(`${m.id}|`)).map(([, x]) => x.preco ?? 0).filter((x) => x > 0);
    m.preco = precos.length ? Math.min(...precos) : 0;
  }
  return { familia: { ...base, acabamentos, medidas, celulas, glb, regraSku: { ...base.regraSku, modo: "manual" } }, conflitos };
}

/** Os produtos de uma família guardada, pela ordem das variantes (para a reabrir com os mesmos produtos; os eixos ficam em `FamiliaCfg.eixos`). */
export function idsDaFamilia(f: FamiliaCfg): string[] {
  return f.medidas.flatMap((m) => f.acabamentos.flatMap((a) => { const id = f.celulas[celulaKey(m.id, a.id)]?.produtoId; return id ? [id] : []; }));
}

/* ------------------------------------------------------------------ EIXOS: escolher entre os atributos que o produto já tem (nada se escreve) */
/** O nome do atributo da medida (o que `atributosDoProduto` devolve). */
export const NOME_MEDIDA = "Medida";
const ORDEM_ATRIBUTOS: readonly string[] = [NOME_MEDIDA, "Cor"];
const vazio = (v: string | undefined): boolean => !v || !v.trim();
type AtributosLista = readonly Readonly<Record<string, string>>[];
/** Os nomes dos atributos que os produtos têm (a união): Medida e Cor primeiro, os outros pela ordem em que aparecem. */
export function nomesDosAtributos(lista: AtributosLista): string[] {
  const vistos = new Set<string>();
  for (const a of lista) for (const k of Object.keys(a)) vistos.add(k);
  return [...ORDEM_ATRIBUTOS.filter((k) => vistos.has(k)), ...[...vistos].filter((k) => !ORDEM_ATRIBUTOS.includes(k))];
}
/** A cor das bolinhas e a medida por omissão: a cor é «Cor» (ou «Acabamento», ou o primeiro atributo cujo nome o diz); a medida junta a Medida e os restantes atributos QUE VARIAM entre os produtos. */
export function eixosPorOmissao(lista: AtributosLista): EixosCfg {
  const nomes = nomesDosAtributos(lista);
  const cor = nomes.find((n) => norm(n) === "cor") ?? nomes.find((n) => norm(n) === "acabamento") ?? nomes.find((n) => /cor|acabamento/i.test(n)) ?? null;
  const varia = (n: string) => new Set(lista.map((a) => a[n]?.trim() ?? "")).size > 1;
  return { cor, medida: nomes.filter((n) => n !== cor && (n === NOME_MEDIDA || varia(n))) };
}
/** Os eixos que valem para estes produtos: sem escolha, a omissão; senão a escolha sem os atributos que já não existem e sem a cor repetida na medida. */
export function eixosValidos(escolha: EixosCfg | null | undefined, lista: AtributosLista): EixosCfg {
  if (!escolha) return eixosPorOmissao(lista);
  const nomes = new Set(nomesDosAtributos(lista)), cor = escolha.cor && nomes.has(escolha.cor) ? escolha.cor : null;
  return { cor, medida: [...new Set(escolha.medida)].filter((n) => nomes.has(n) && n !== cor) };
}

/** Um produto escolhido como o configurador o vê: o preço e o SKU (`ref`), os atributos (`atributosDoProduto`), as dimensões (palpite, só para o 3D) e o GLB proposto pelo nome. */
export interface ItemEixos { ref: ProdutoRef; atributos: Readonly<Record<string, string>>; dim: [number, number, number]; glb?: string }
/** O aviso de um produto sem valor num atributo escolhido (aparece na linha do produto). */
export const textoSemValor = (atributo: string): string => `Este produto não tem ${atributo}: corrija no produto do catálogo.`;
/** Os produtos sem valor nos atributos escolhidos como eixos (bloqueiam o Seguinte e o Guardar até se corrigir no catálogo ou se excluir o produto). */
export function produtosSemValor(itens: readonly Pick<ItemEixos, "ref" | "atributos">[], eixos: EixosCfg): { produtoId: string; nome: string; atributo: string; msg: string }[] {
  const usados = [...eixos.medida, ...(eixos.cor ? [eixos.cor] : [])];
  return itens.flatMap((i) => usados.filter((n) => vazio(i.atributos[n])).map((atributo) => ({ produtoId: i.ref.id, nome: i.ref.n, atributo, msg: `«${i.ref.n}»: ${textoSemValor(atributo)}` })));
}
/** A família a partir dos produtos e dos eixos escolhidos: o rótulo da medida junta os valores dos atributos de `eixos.medida`; as bolinhas são o atributo de `eixos.cor`.
 * Nada é escrito à mão: tudo vem dos `atributos` de cada produto. O resultado guarda os `eixos` para a família poder ser reaberta. */
export function familiaPorEixos(base: FamiliaCfg, itens: readonly ItemEixos[], eixos: EixosCfg): { familia: FamiliaCfg; conflitos: string[] } {
  const atribuicoes = itens.map((i): AtribuicaoProduto => {
    const extras = Object.fromEntries(eixos.medida.flatMap((n) => (vazio(i.atributos[n]) ? [] : [[n, i.atributos[n].trim()] as const])));
    const acabamento = eixos.cor ? i.atributos[eixos.cor]?.trim() ?? "" : "";
    return { produtoId: i.ref.id, medida: extras[NOME_MEDIDA] ?? "", dim: i.dim, acabamento, cor: corDoAcabamento(acabamento).cor, codigo: "", extras, ...(i.glb ? { glb: i.glb } : {}) };
  });
  return familiaDeProdutos({ ...base, eixos: { cor: eixos.cor, medida: [...eixos.medida] } }, itens.map((i) => i.ref), atribuicoes);
}

/** A marca da família: a marca comum dos produtos, «Várias marcas» (`varias`: mostra-se um aviso) se diferem, ou vazio. */
export function marcaDaFamilia(refs: readonly Pick<ProdutoRef, "marca">[]): { marca: string; varias: boolean } {
  const marcas = [...new Set(refs.map((r) => r.marca?.trim() ?? "").filter(Boolean))];
  return marcas.length > 1 ? { marca: "Várias marcas", varias: true } : { marca: marcas[0] ?? "", varias: false };
}
