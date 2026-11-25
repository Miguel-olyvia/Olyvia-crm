// 23/11: as Ligações do Catálogo com o Catálogo LEVE. Antes a página lia o Catálogo inteiro (cat_ler_catalogo, ~29 600 produtos na Mudelar) e dava «canceling statement
// due to statement timeout». Agora lê o mesmo que as outras páginas de Serviços (cat_ler_catalogo_servicos: os serviços e os produtos dos consumos) e os produtos
// entram no mapa à medida, pelo servidor, já paginados:
//   · centro serviço  → os produtos que o trazem (cat_pesquisar_produtos, p_servico) e, se ele exige um produto, os do ramo exigido (cat_ler_produtos_pagina);
//   · centro produto  → as alternativas do mesmo ramo;
//   · escolher o centro → a pesquisa de produtos por nome, marca ou referência;
//   · problemas       → os ramos com produtos vêm das contagens (cat_ler_produtos_contagens), não da lista toda.
// Ligar ou desligar um produto que só o servidor trouxe lê-o inteiro antes (escolherProdutoDoServidor): entra no Catálogo em memória já registado para o autosave.
import type { Res } from "../fichaProdutoDados";
import type { No, Produto } from "../v2/catalogoModelo";
import { idDoServicoLido, noDoProdutoLido } from "./catalogoLeve";
import { escolherProdutoDoServidor, filtroDoRamo, produtoDeLinha } from "./pesquisaProdutos";
import { SEM_FILTRO_SERVIDOR, lerProdutosContagens, lerProdutosPagina, type FiltroServidor } from "./produtosPaginados";

/** O que as Ligações pedem ao servidor. Cada leitura traz no máximo uma página (50): o mapa mostra 12 por grupo e o resto na lista do grupo. */
export interface ServidorLigacoes {
  /** Os produtos que trazem o serviço (pela chave do motor). */
  trazem: (sid: string) => Promise<Res<Produto[]>>;
  /** Os produtos de um ramo da árvore (o que um serviço exige, as alternativas de um produto). */
  doRamo: (arvore: readonly No[], no: string) => Promise<Res<Produto[]>>;
  /** A pesquisa de produtos para escolher o centro. */
  procurar: (q: string) => Promise<Res<Produto[]>>;
  /** O produto inteiro, já no Catálogo em memória (antes de ligar ou desligar). */
  escolher: (id: string) => Promise<Res<Produto>>;
  /** Os nós da árvore que têm produtos na base (das contagens por categoria e subcategoria; os de cima contam-se em problemasCatalogo). */
  nosComProduto: () => Promise<Res<string[]>>;
}

const pagina = async (org: string, f: FiltroServidor): Promise<Res<Produto[]>> => {
  const r = await lerProdutosPagina(org, f, 1);
  return r.ok ? { ok: true, v: r.v.produtos.map(produtoDeLinha) } : r;
};

export function servidorLigacoes(org: string): ServidorLigacoes {
  return {
    trazem: async (sid) => {
      const id = idDoServicoLido(sid);
      // um serviço que a base ainda não tem (criado agora, por gravar) não traz nenhum produto gravado
      if (!id) return { ok: true, v: [] };
      return pagina(org, { ...SEM_FILTRO_SERVIDOR, servico: id });
    },
    doRamo: async (arvore, no) => {
      const f = filtroDoRamo(arvore, no);
      if (f.subcategorias?.length) {
        const rs = await Promise.all(f.subcategorias.map((subcategoria) => pagina(org, { ...SEM_FILTRO_SERVIDOR, subcategoria })));
        const ok = rs.filter((r): r is { ok: true; v: Produto[] } => r.ok);
        if (!ok.length) return rs[0] ?? { ok: true, v: [] };
        return { ok: true, v: ok.flatMap((r) => r.v) };
      }
      if (!f.categoria && !f.subcategoria) return { ok: true, v: [] }; // sem ramo de produtos: não se lê o Catálogo todo
      return pagina(org, { ...SEM_FILTRO_SERVIDOR, categoria: f.categoria ?? "", subcategoria: f.subcategoria ?? "" });
    },
    procurar: (q) => (q.trim() ? pagina(org, { ...SEM_FILTRO_SERVIDOR, q }) : Promise.resolve({ ok: true, v: [] })),
    escolher: (id) => escolherProdutoDoServidor(org, id),
    nosComProduto: async () => {
      const r = await lerProdutosContagens(org, "", "");
      if (!r.ok) return r;
      const ids = [...Object.entries(r.v.porCategoria), ...Object.entries(r.v.porSubcategoria)].filter(([, n]) => n > 0).map(([id]) => noDoProdutoLido(id)).filter((x): x is string => !!x);
      return { ok: true, v: [...new Set(ids)] };
    },
  };
}
