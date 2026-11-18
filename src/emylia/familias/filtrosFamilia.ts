// Famílias (configurador): os filtros do passo «Escolher produtos», só o que é PURO e não varre o catálogo.
// A pesquisa, as facetas (marca/categoria com contagem) e o índice sobre os produtos ficam de fora: passam a ser no servidor (fase B).
import type { FamiliaCfg } from "./nucleo";

export interface FiltrosCatalogo {
  q: string;
  /** chaves de marca (sem acentos nem maiúsculas; «» = sem marca) */
  marcas: readonly string[];
  /** ids de nó da árvore («» = sem categoria) */
  categorias: readonly string[];
  soComPreco: boolean; semFamilia: boolean; soEscolhidos: boolean;
}

export const filtrosIniciais = (): FiltrosCatalogo => ({ q: "", marcas: [], categorias: [], soComPreco: false, semFamilia: false, soEscolhidos: false });

/** Os produtos que já são variantes de famílias da sessão (menos a que se está a editar, pelo id). */
export function idsEmFamilias(familias: readonly Pick<FamiliaCfg, "id" | "variantes">[], exceto?: string | null): Set<string> {
  const ids = new Set<string>();
  for (const f of familias) if (f.id !== exceto) for (const v of f.variantes) ids.add(v.produtoId);
  return ids;
}
