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

/** Os termos da pesquisa batem todos com o nome, o modelo ou os atributos (sem acentos nem maiúsculas; com sinónimos e plurais). */
export function bateComPesquisa(p: Produto, q: string): boolean {
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const texto = semAcento(`${p.n} ${p.colecao} ${p.destaque ?? ""}`);
  return termos.every((t) => {
    if (texto.includes(t)) return true;
    const r = raiz(t);
    if (texto.includes(r)) return true;
    const grupo = SINONIMOS.find((g) => g.some((s) => r.startsWith(s) || s.startsWith(r)));
    return !!grupo && grupo.some((s) => texto.includes(s));
  });
}

/** O evento que manda a lista de produtos aberta procurar (a Olyvia: «procura sanitas glamic»). */
export const EV_PROCURAR = "estudio-procurar";

/** Procura no catálogo inteiro da empresa (as subcategorias deste tipo de peça) e junta o que encontrar. 0 sem catálogo verdadeiro. */
export async function procurarNoCatalogo(cat: Categoria, q: string): Promise<number> {
  const m = await import("./catalogoRealDoEstudio");
  return m.procurarNoCatalogoReal(cat, q);
}
