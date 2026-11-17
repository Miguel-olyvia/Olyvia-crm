// 17/11: a escolha de produtos por PESQUISA NO SERVIDOR. Com o Catálogo leve (catalogoLeve.ts) K.produtos já não tem os 29 785 produtos da Mudelar; quem escolhe
// um produto (os consumíveis e as ligações de um serviço, a visita, o orçamento) pesquisa-o em cat_ler_produtos_pagina (páginas de 50, com debounce) e, ao escolher,
// lê-o inteiro com cat_ler_produto: o Produto chega ao estado do negócio ou do serviço com o mesmo formato de sempre.
//
// O que cat_ler_produtos_pagina NÃO filtra: por serviço (products.servico_id). Sem esse filtro («produtos que trazem este serviço») pesquisa-se por texto e categoria.
import { useCallback, useEffect, useRef, useState } from "react";
import type { No, Produto } from "../v2/catalogoModelo";
import type { Res } from "../fichaProdutoDados";
import { SEM_FILTRO_SERVIDOR, lerProdutosPagina, type LinhaPaginaProduto } from "./produtosPaginados";
import { lerProdutoFicha } from "./produtosLeves";
import { categoriaCruDoNo, noDoProdutoLido, registarProdutoLido } from "./catalogoLeve";

export const ATRASO_PESQUISA_MS = 300;

/** O que a pesquisa filtra: o texto (nome, marca, referência) e, se quiser, os ids de categoria e subcategoria de product_categories. */
export interface FiltroPesquisaProdutos { q: string; categoria?: string; subcategoria?: string }

export interface PesquisaProdutos {
  linhas: LinhaPaginaProduto[]; total: number; aCarregar: boolean; erro: string | null; maisPaginas: boolean; maisUma: () => void;
}

/** A pesquisa com debounce e páginas de 50. `ativo` false (o painel fechado) não chama a base. */
export function usePesquisaProdutos(org: string | null, f: FiltroPesquisaProdutos, op: { ativo?: boolean; atrasoMs?: number } = {}): PesquisaProdutos {
  const { ativo = true, atrasoMs = ATRASO_PESQUISA_MS } = op;
  const categoria = f.categoria ?? "", subcategoria = f.subcategoria ?? "";
  const [qAtraso, setQAtraso] = useState(f.q);
  const [estado, setEstado] = useState<{ linhas: LinhaPaginaProduto[]; total: number; pagina: number; paginas: number }>({ linhas: [], total: 0, pagina: 0, paginas: 0 });
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    if (f.q === qAtraso) return undefined;
    const t = setTimeout(() => setQAtraso(f.q), atrasoMs);
    return () => clearTimeout(t);
  }, [f.q, qAtraso, atrasoMs]);

  const ler = useCallback(async (pagina: number, juntar: boolean) => {
    if (!org) return;
    const eu = ++pedido.current;
    setACarregar(true); setErro(null);
    const r = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q: qAtraso, categoria, subcategoria }, pagina);
    if (eu !== pedido.current) return; // uma pesquisa mais nova já saiu
    setACarregar(false);
    if (!r.ok) { setErro(r.erro); if (!juntar) setEstado({ linhas: [], total: 0, pagina: 0, paginas: 0 }); return; }
    setEstado((e) => ({ linhas: juntar ? [...e.linhas, ...r.v.produtos.filter((x) => !e.linhas.some((y) => y.id === x.id))] : r.v.produtos, total: r.v.total, pagina: r.v.pagina, paginas: r.v.paginas }));
  }, [org, qAtraso, categoria, subcategoria]);

  useEffect(() => {
    if (!ativo || !org) return;
    void ler(1, false);
  }, [ativo, org, ler]);

  const maisPaginas = estado.pagina > 0 && estado.pagina < estado.paginas;
  const maisUma = useCallback(() => { if (!aCarregar && maisPaginas) void ler(estado.pagina + 1, true); }, [aCarregar, maisPaginas, ler, estado.pagina]);
  return { linhas: estado.linhas, total: estado.total, aCarregar, erro, maisPaginas, maisUma };
}

/** O produto escolhido da pesquisa, lido inteiro (cat_ler_produto) e já no Catálogo em memória (e registado para o autosave). */
export async function escolherProdutoDoServidor(org: string, id: string): Promise<Res<Produto>> {
  const r = await lerProdutoFicha(org, id);
  if (!r.ok) return r;
  // o `no` vem como id de product_categories; o Catálogo usa o nó fundido com a árvore dos serviços (e o autosave grava a categoria por ele)
  return { ok: true, v: registarProdutoLido({ ...r.v, no: noDoProdutoLido(r.v.no) }) };
}

/** O produto lido, SEM o meter no Catálogo (para quem só precisa dos valores, como o consumível de uma receita). */
export const lerProdutoEscolhido = (org: string, id: string): Promise<Res<Produto>> => lerProdutoFicha(org, id);

/** Os produtos de um ramo da árvore (o `no` de um serviço que pede produto), pesquisados no servidor: um nó de topo filtra pela categoria, um sub pela subcategoria. Sem nó, sem filtro de ramo. */
export function filtroDoRamo(arvore: readonly No[], no: string | null): Pick<FiltroPesquisaProdutos, "categoria" | "subcategoria"> {
  const x = no ? arvore.find((y) => y.id === no) : undefined;
  if (!x) return {};
  // o servidor só conhece os ids de product_categories: o nó fundido com um ramo dos serviços converte-se no id cru
  return x.pai ? { subcategoria: categoriaCruDoNo(x.id) } : { categoria: categoriaCruDoNo(x.id) };
}

/** A linha da lista como Produto para MOSTRAR (nome, preço, foto). Falta-lhe o que só a leitura inteira traz (o serviço que o produto traz, a descrição, o entulho): para escolher
 *  usa-se escolherProdutoDoServidor, que lê o produto todo. */
export function produtoDeLinha(l: LinhaPaginaProduto): Produto {
  const pvp = typeof l.pvp === "number" && l.pvp > 0 ? l.pvp : undefined;
  return {
    id: l.id, n: l.nome, custo: l.custo ?? 0, un: l.unidade ?? "un", marca: l.marca ?? "", fornecedor: l.fornecedor ?? "", data: new Date().toISOString().slice(0, 10),
    no: noDoProdutoLido(l.subcategoria_id || l.categoria_id),
    ...(l.sku ? { sku: l.sku } : {}), ...(pvp ? { pvp } : {}),
    ...(l.grossista != null ? { grossista: l.grossista } : {}), ...(l.distribuidor != null ? { distribuidor: l.distribuidor } : {}),
    ...(l.imagem ? { fotos: [l.imagem] } : {}),
  };
}

/** A pesquisa de um ramo, já como Produto[] para os cartões da visita e do orçamento. */
export function useProdutosDoRamo(org: string | null, arvore: readonly No[], no: string | null, q: string, ativo = true): Omit<PesquisaProdutos, "linhas"> & { produtos: Produto[] } {
  const { linhas, ...resto } = usePesquisaProdutos(org, { q, ...filtroDoRamo(arvore, no) }, { ativo });
  return { ...resto, produtos: linhas.map(produtoDeLinha) };
}

/** Tocar num cartão: tirar um produto já escolhido só precisa do id; juntar lê-o inteiro (com o serviço que traz) e mete-o no Catálogo em memória. */
export async function produtoParaTocar(org: string, p: Produto, jaEscolhido: boolean): Promise<Res<Produto>> {
  return jaEscolhido ? { ok: true, v: p } : escolherProdutoDoServidor(org, p.id);
}
