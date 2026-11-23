// 23/11 (Rúben: «o 3D real do projeto aprovado no Estúdio da obra»). O projeto do Estúdio guarda só os ids dos produtos escolhidos. O
// Estúdio conhece-os porque pré-carrega o catálogo da empresa; o Estúdio da obra não o carrega (e um produto achado pela pesquisa nem
// está nas páginas pré-carregadas). Aqui leem-se só os produtos do projeto, um a um pelo id, no mesmo formato (Produto), e juntam-se aos
// que o desenho e o 3D conhecem (guardarProdutosDoProjeto). A cor e a medida saem do nome e dos atributos, como no Estúdio. Os que têm
// nome conhecido (os produtos do contrato) entram logo pelo nome; a linha do catálogo, quando chega, junta os atributos.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useCompanyOpcional } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { lerProdutosPagina, SEM_FILTRO_SERVIDOR, type LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";
import { guardarProdutosDoProjeto, ouvirProdutosReais, produto, produtosReais, versaoProdutosReais, type Categoria, type Produto } from "./catalogoFake";
import { produtoDaLinha } from "./catalogoRealDoEstudio";
import type { Projeto } from "./necessidadesEstudio";

/** Um produto a ler: o id, a categoria e, quando se sabe (os produtos do contrato), o nome. */
export interface PedidoProduto { id: string; cat: Categoria; n?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Os produtos de um projeto, com a categoria de cada um: os das peças do depois, o que vai com elas, o revestimento e o pavimento. */
export function produtosPedidosDoProjeto(p: Projeto, extras: readonly PedidoProduto[] = []): PedidoProduto[] {
  const out = new Map<string, PedidoProduto>();
  const por = (id: string | undefined, cat: Categoria) => { if (id && !out.has(id)) out.set(id, { id, cat }); };
  for (const pc of p.depois.pecas) {
    por(p.escolhas[pc.id], pc.tipo);
    for (const [cat, id] of Object.entries(p.acompanha[pc.id] ?? {}) as [Categoria, string | undefined][]) por(id, cat);
  }
  por(p.revestimento, "revestimento");
  por(p.pavimento, "pavimento");
  for (const x of extras) por(x.id, x.cat);
  return [...out.values()];
}

/** Um produto só com o nome (sem a linha do catálogo, ou sem preço de venda): o nome dá a cor e a medida; sem preço. */
export function produtoDoNome(id: string, nome: string, cat: Categoria): Produto {
  const linha = { id, nome, pvp: 1, ativo: true, unidade: null, modelo: null, marca: null, atributos_resumo: null } as unknown as LinhaPaginaProduto;
  return { ...produtoDaLinha(linha, cat)!, preco: 0 };
}

/** Os produtos com nome conhecido, já (pelo nome), sem esperar pela base. */
export function produtosPeloNome(pedidos: readonly PedidoProduto[]): void {
  guardarProdutosDoProjeto(pedidos.filter((x) => x.n && UUID.test(x.id) && !produto(x.id)).map((x) => produtoDoNome(x.id, x.n!, x.cat)));
}

type Sb = { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }> } } };
/** Os produtos a ler agora e os já lidos da base nesta sessão (não se voltam a ler). */
const aLer = new Set<string>();
const lidosDaBase = new Set<string>();

/** A linha do catálogo de um produto (os atributos, o modelo, o PVP), procurada pela referência ou pelo nome e escolhida pelo id. */
async function linhaDoCatalogo(org: string, id: string, q: string, cat: Categoria): Promise<Produto | null> {
  const pg = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q }, 1);
  const l = pg.ok ? pg.v.produtos.find((x) => x.id === id) : undefined;
  if (!l) return null;
  return produtoDaLinha({ ...l, estado: null, ativo: true }, cat) ?? { ...produtoDaLinha({ ...l, pvp: 1, estado: null, ativo: true }, cat)!, preco: 0 };
}

/** Lê os produtos pedidos que ainda não se leram da base e junta cada um quando chega (a pesquisa do catálogo pode demorar). Os que
 *  têm nome entram logo pelo nome. Devolve os que chegaram. Sem sessão ou com erro, ficam os do nome. */
export async function lerProdutosDoProjeto(org: string, pedidos: readonly PedidoProduto[]): Promise<Produto[]> {
  produtosPeloNome(pedidos);
  // os que o Estúdio já carregou do catálogo não se leem outra vez
  const doCatalogo = new Set(produtosReais().map((x) => x.id));
  const faltam = pedidos.filter((x) => UUID.test(x.id) && !doCatalogo.has(x.id) && !lidosDaBase.has(x.id) && !aLer.has(x.id));
  if (!faltam.length) return [];
  faltam.forEach((x) => aLer.add(x.id));
  const lidos: Produto[] = [];
  try {
    // a referência de cada um (a pesquisa por referência acha um só); sem leitura da tabela, procura-se pelo nome
    const ref = new Map<string, { n: string; sku: string | null }>();
    try {
      const { data, error } = await (supabase as unknown as Sb).from("products").select("id, name, sku").in("id", faltam.map((x) => x.id));
      if (!error && data) for (const r of data as { id: string; name: string; sku: string | null }[]) ref.set(r.id, { n: r.name, sku: r.sku });
    } catch { /* fica o nome do pedido */ }
    await Promise.all(faltam.map(async (x) => {
      const r = ref.get(x.id), nome = r?.n ?? x.n;
      let prod: Produto | null = null;
      try { if (r?.sku || nome) prod = await linhaDoCatalogo(org, x.id, r?.sku || nome!, x.cat); } catch { /* fica o do nome */ }
      if (!prod && nome) prod = produtoDoNome(x.id, nome, x.cat);
      if (!prod) return;
      lidosDaBase.add(x.id);
      lidos.push(prod);
      guardarProdutosDoProjeto([prod]);
    }));
    return lidos;
  } finally {
    faltam.forEach((x) => aLer.delete(x.id));
  }
}

/** Garante que estes produtos se conhecem (os com nome, logo; os outros quando a base responder); redesenha quando chegam. */
export function useLerProdutos(pedidos: readonly PedidoProduto[]): void {
  const org = useCompanyOpcional()?.activeCompany?.id ?? null;
  useSyncExternalStore(ouvirProdutosReais, versaoProdutosReais);
  const chave = useMemo(() => JSON.stringify(pedidos), [pedidos]);
  useEffect(() => {
    const L = JSON.parse(chave) as PedidoProduto[];
    if (!L.length) return;
    if (!org) { produtosPeloNome(L); return; }
    void lerProdutosDoProjeto(org, L);
  }, [org, chave]);
}

/** Os produtos do projeto (e os `extras`). */
export function useProdutosDoProjeto(p: Projeto | null, extras: readonly PedidoProduto[] = []): void {
  const pedidos = useMemo(() => (p ? produtosPedidosDoProjeto(p, extras) : []), [p, extras]);
  useLerProdutos(pedidos);
}
