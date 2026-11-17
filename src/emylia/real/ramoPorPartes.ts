// 22/01: a regra «exige produto» com o Catálogo leve. selecao.trocaResolvida decide se uma troca («o cliente mantém a sanita e a base de duche?») está resolvida: cada parte que o ramo TEM
// em produtos tem de ter um produto escolhido, e as partes que o ramo não tem não contam. Com K.produtos só com os 145 produtos dos consumos, «o ramo não tem bidés» seria falso;
// aqui o ramo (a categoria da regra, filtroDoRamo) pesquisa-se no servidor, uma vez por parte da pergunta.
import type { No } from "../v2/catalogoModelo";
import { SEM_FILTRO_SERVIDOR, lerProdutosPagina } from "./produtosPaginados";
import { filtroDoRamo } from "./pesquisaProdutos";
import { objetoDaPergunta, palavrasDe } from "../necessidades";

/** Os produtos do ramo `no` que correspondem a cada parte da pergunta (a primeira página de cada pesquisa), no formato de trocaResolvida. null: a pesquisa falhou (não se sabe;
 *  quem chama não resolve a troca sozinho). [] : sem pergunta ou sem objeto na pergunta. */
export async function produtosDoRamoPorPartes(org: string, arvore: readonly No[], no: string, pergunta: string | null | undefined): Promise<{ n: string; sub: string }[] | null> {
  const obj = objetoDaPergunta(pergunta);
  if (!obj) return [];
  const ramo = filtroDoRamo(arvore, no);
  const qs = obj.comArtigo.split(/\s+e\s+/).map((parte) => palavrasDe(parte).join(" ")).filter(Boolean);
  const rs = await Promise.all(qs.map((q) => lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q, categoria: ramo.categoria ?? "", subcategoria: ramo.subcategoria ?? "" }, 1)));
  if (rs.some((r) => !r.ok)) return null;
  return rs.flatMap((r) => (r.ok ? r.v.produtos.map((l) => ({ n: l.nome, sub: l.subcategoria ?? "" })) : []));
}
