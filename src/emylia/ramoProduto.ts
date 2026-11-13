// 13/11: a categoria e a subcategoria de um produto, sobre a árvore do Catálogo (K.arvore: dois níveis, categoria → subcategorias).
// O produto fica num só nó (o mais fundo escolhido); a base grava-o pelo NOME (cat_guardar_produto_tabelas) e cria o que falte.
// Uma categoria ou subcategoria nova nasce aqui como ramo «só de produto» (soProduto): não é um ofício dos serviços e o autosave do
// Catálogo não a grava na árvore dos serviços; vai com o produto, pelo nome (real/gravarCatalogo.ts).
import { juntarNo, type No } from "./v2/catalogoModelo";

const igual = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** As categorias: os nós de topo. */
export const categoriasDe = (A: readonly No[]): No[] => A.filter((x) => x.pai == null);
/** As subcategorias de uma categoria (vazio sem categoria). */
export const subcategoriasDe = (A: readonly No[], cat: string): No[] => (cat ? A.filter((x) => x.pai === cat) : []);

/** O ramo onde um produto fica: categoria e subcategoria («» quando não há). Um nó que já não existe conta como sem ramo. */
export function ramoDe(A: readonly No[], no: string | null | undefined): { cat: string; sub: string } {
  const x = no ? A.find((n) => n.id === no) : undefined;
  if (!x) return { cat: "", sub: "" };
  return x.pai != null && A.some((n) => n.id === x.pai) ? { cat: x.pai, sub: x.id } : { cat: x.id, sub: "" };
}

/** Os nomes que a base grava (cat_guardar_produto_tabelas): categoria e subcategoria, ou null. */
export function nomesDoRamo(A: readonly No[], no: string | null | undefined): { categoria: string | null; subcategoria: string | null } {
  const { cat, sub } = ramoDe(A, no);
  return { categoria: A.find((x) => x.id === cat)?.n ?? null, subcategoria: A.find((x) => x.id === sub)?.n ?? null };
}

export interface RamoEscolhido { cat: string; sub: string; catNova: string | null; subNova: string | null }
export type ResRamo = { ok: true; A: No[]; no: string | null } | { ok: false; erro: string };

/** O nó onde o produto novo fica. Os nomes novos juntam-se à árvore como ramos só de produto; se já existir um com o mesmo nome
 *  (sem acentos nem maiúsculas) usa-se esse, para não duplicar. Sem nomes novos devolve a mesma árvore. */
export function ramoParaCriar(A: No[], r: RamoEscolhido): ResRamo {
  let arv = A;
  const catNova = r.catNova?.trim() || null, subNova = r.subNova?.trim() || null;
  let cat = catNova ? "" : r.cat;
  if (catNova) {
    const ja = categoriasDe(arv).find((x) => igual(x.n) === igual(catNova));
    if (ja) cat = ja.id;
    else {
      const j = juntarNo(arv, catNova);
      if (!j.ok) return j;
      arv = j.A.map((x) => (x.id === j.id ? { ...x, soProduto: true as const } : x));
      cat = j.id;
    }
  }
  let sub = subNova ? "" : r.sub;
  if (subNova && cat) {
    const ja = subcategoriasDe(arv, cat).find((x) => igual(x.n) === igual(subNova));
    if (ja) sub = ja.id;
    else {
      const j = juntarNo(arv, subNova, cat);
      if (!j.ok) return j;
      arv = j.A.map((x) => (x.id === j.id ? { ...x, soProduto: true as const } : x));
      sub = j.id;
    }
  }
  return { ok: true, A: arv, no: sub || cat || null };
}
