// 17/11 (Rúben: «no Estúdio permitia fazer pesquisas dos produtos; se clico em sanita, não posso pesquisar por sanitas»). A pesquisa da
// lista de produtos do Estúdio, leve: o filtro local e, só quando é preciso ir ao servidor, o catálogo verdadeiro (catalogoRealDoEstudio.ts,
// que traz o cliente da base) carrega-se à parte.
import type { Categoria, Produto } from "./catalogoFake";

export const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Os termos da pesquisa batem todos com o nome, o modelo ou os atributos (sem acentos nem maiúsculas). */
export function bateComPesquisa(p: Produto, q: string): boolean {
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const texto = semAcento(`${p.n} ${p.colecao} ${p.destaque ?? ""}`);
  return termos.every((t) => texto.includes(t));
}

/** Procura no catálogo inteiro da empresa (as subcategorias deste tipo de peça) e junta o que encontrar. 0 sem catálogo verdadeiro. */
export async function procurarNoCatalogo(cat: Categoria, q: string): Promise<number> {
  const m = await import("./catalogoRealDoEstudio");
  return m.procurarNoCatalogoReal(cat, q);
}
