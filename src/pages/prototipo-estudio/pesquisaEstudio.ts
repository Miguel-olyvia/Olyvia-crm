// 17/11 (Rúben: «no Estúdio permitia fazer pesquisas dos produtos; se clico em sanita, não posso pesquisar por sanitas»; «e claro depois
// permitir pesquisar por voz»). A pesquisa da lista de produtos do Estúdio, leve: o filtro local (com sinónimos e plurais: «douradas»
// encontra «ORO», «pretos» encontra «Negro») e, só quando é preciso ir ao servidor, o catálogo verdadeiro (catalogoRealDoEstudio.ts, que
// traz o cliente da base) carrega-se à parte.
import type { Categoria, Cor, Produto } from "./catalogoFake";

export const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** As palavras de cada cor (nomes do catálogo em português, espanhol, italiano e inglês). */
export const COR_PALAVRAS: [Cor, RegExp][] = [
  ["branco", /\b(branc|blanc|bianc|white)/],
  ["preto", /\b(pret|negr|black|nero)/],
  ["cinza", /\b(cinz|gris|grey|gray|antracit|grafit|cimento|cement|concret|crom|inox|aco\b|acero|niquel|titani|gun ?metal)/],
  ["madeira", /\b(madeir|carvalh|nogueir|nogal|roble|oak|wood|freixo|fresno|cerejeir|walnut|teca|wengue|olmo)/],
  ["bege", /\b(bege|beige|beje|creme|crema|marfil|arena|areia|sand|taupe|cappuc|capuc|linho|ouro|oro\b|dourad|cobre|rosa gold)/],
];
/** As medidas ditas no nome («70x120», «100X81X45», «60 x 60 cm», «1200x2600x5,6» em mm). Em cm. */
export function medidasDoTexto(texto: string): number[] | null {
  const m = texto.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX×]\s*(\d+(?:[.,]\d+)?))?/);
  if (!m) return null;
  let v = [m[1], m[2], m[3]].filter(Boolean).map((x) => Number(x!.replace(",", ".")));
  if (v.some((x) => !Number.isFinite(x) || x <= 0)) return null;
  if (Math.max(...v) > 400) v = v.map((x) => x / 10); // em milímetros
  return v.map((x) => Math.round(x));
}
/** As cores de um produto pelo nome e pelos atributos («SANITA GLAMIC BTW CINZA MATE» → cinza). */
export function coresDoTexto(texto: string): Cor[] {
  const t = semAcento(texto);
  return COR_PALAVRAS.filter(([, rx]) => rx.test(t)).map(([c]) => c);
}

/** Sinónimos de pesquisa (o primeiro é a raiz dita): cada grupo vale por qualquer um. */
const SINONIMOS: string[][] = [
  ["dourad", "oro", "ouro", "gold"], ["pret", "negr", "black", "nero"], ["branc", "blanc", "bianc", "white"],
  ["cinz", "gris", "grey", "gray", "antracit"], ["madeir", "carvalh", "nogueir", "roble", "nogal", "oak", "wood"],
  ["crom", "chrome"], ["cobre", "copper"], ["niquel", "nickel"], ["suspens", "susp"], ["compact", "btw"], ["escovad", "cepillad"],
];
/** A raiz de uma palavra dita (sem o plural e o género: «douradas» → «dourad», «pretos» → «pret»). */
const raiz = (w: string) => (w.length > 4 ? w.replace(/(as|os|es|a|o|s)$/, "") : w);

/** Só as letras e os algarismos, sem acentos nem maiúsculas: «DBBD-0098» e «dbbd 0098» são a mesma referência. */
export const compacto = (s: string) => semAcento(s).replace(/[^a-z0-9]/g, "");
/** Uma referência procura-se a partir de 3 caracteres (menos do que isso apanhava quase todas). */
const MIN_REF = 3;

/** 23/11 (Rúben: «procurar pela referência dá 0 resultados»): o texto é a referência (SKU) do produto, inteira ou parte dela. */
export function bateComReferencia(p: Produto, q: string): boolean {
  const c = compacto(q), ref = compacto(p.ref ?? "");
  return c.length >= MIN_REF && !!ref && ref.includes(c);
}

/** Os termos da pesquisa batem todos com o nome, o modelo ou os atributos (sem acentos nem maiúsculas; com sinónimos e plurais).
 *  23/11: ou o texto é a referência (SKU) do produto, inteira ou em parte. */
export function bateComPesquisa(p: Produto, q: string): boolean {
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  if (bateComReferencia(p, q)) return true;
  const texto = semAcento(`${p.n} ${p.colecao} ${p.destaque ?? ""} ${p.ref ?? ""} ${p.procura ?? ""}`);
  return termos.every((t) => {
    if (texto.includes(t)) return true;
    const r = raiz(t);
    if (texto.includes(r)) return true;
    const grupo = SINONIMOS.find((g) => g.some((s) => r.startsWith(s) || s.startsWith(r)));
    return !!grupo && grupo.some((s) => texto.includes(s));
  });
}

/** 23/11 (Rúben: «o produto com o nome quase inteiro nunca apareceu»): quanto um produto se parece com o texto (menor = mais
 *  parecido). 0 a referência exata; 1 parte da referência; 2 o nome igual; 3 o texto seguido dentro do nome; 4 todas as palavras no
 *  nome; 5 o resto (pelo modelo, pelos atributos, por sinónimos). */
export function grauDaPesquisa(p: Produto, q: string): number {
  const c = compacto(q), ref = compacto(p.ref ?? "");
  if (c && ref && ref === c) return 0;
  if (bateComReferencia(p, q)) return 1;
  const frase = semAcento(q).replace(/\s+/g, " "), nome = semAcento(p.n).replace(/\s+/g, " ");
  if (!frase) return 5;
  if (nome === frase) return 2;
  if (nome.includes(frase)) return 3;
  return frase.split(" ").every((t) => nome.includes(t)) ? 4 : 5;
}

/** Os resultados de uma pesquisa, os mais parecidos primeiro: o grau, depois o nome mais curto (o mais exato), depois o nome. */
export function ordenarPorPesquisa(lista: readonly Produto[], q: string): Produto[] {
  return lista
    .map((p) => ({ p, g: grauDaPesquisa(p, q), l: p.n.length }))
    .sort((a, b) => a.g - b.g || a.l - b.l || a.p.n.localeCompare(b.p.n, "pt"))
    .map((x) => x.p);
}

/** O evento que manda a lista de produtos aberta procurar (a Olyvia: «procura sanitas glamic»). */
export const EV_PROCURAR = "estudio-procurar";

/** O que a procura no catálogo da empresa trouxe: quantos produtos novos entraram e se o servidor tem mais páginas. */
export interface ResultadoProcura { novos: number; haMais: boolean }

/** Procura no catálogo inteiro da empresa (as subcategorias deste tipo de peça) e junta o que encontrar. `pagina` > 1 traz os
 *  seguintes («Ver mais»). Sem catálogo verdadeiro: nada novo e nada mais. */
export async function procurarNoCatalogo(cat: Categoria, q: string, pagina = 1): Promise<ResultadoProcura> {
  const m = await import("./catalogoRealDoEstudio");
  return m.procurarNoCatalogoReal(cat, q, pagina);
}
