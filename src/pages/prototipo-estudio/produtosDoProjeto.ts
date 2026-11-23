// 23/11 (Rúben: «o 3D real do projeto aprovado no Estúdio da obra»). O projeto do Estúdio guarda só os ids dos produtos escolhidos. O
// Estúdio conhece-os porque pré-carrega o catálogo da empresa; o Estúdio da obra não o carrega (e um produto achado pela pesquisa nem
// está nas páginas pré-carregadas). Aqui leem-se só os produtos do projeto, um a um pelo id, no mesmo formato (Produto), e juntam-se aos
// que o desenho e o 3D conhecem (guardarProdutosDoProjeto). A cor e a medida saem do nome e dos atributos, como no Estúdio.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useCompanyOpcional } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { lerProdutosPagina, SEM_FILTRO_SERVIDOR, type LinhaPaginaProduto } from "@/emylia/real/produtosPaginados";
import { guardarProdutosDoProjeto, ouvirProdutosReais, produto, versaoProdutosReais, type Categoria, type Produto } from "./catalogoFake";
import { produtoDaLinha } from "./catalogoRealDoEstudio";
import type { Projeto } from "./necessidadesEstudio";

export interface PedidoProduto { id: string; cat: Categoria }

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

/** Um produto só com o que a tabela dá (sem a leitura do catálogo, ou sem preço de venda): o nome dá a cor e a medida; sem preço. */
export function produtoDoNome(id: string, nome: string, cat: Categoria): Produto {
  const linha = { id, nome, pvp: 1, ativo: true, unidade: null, modelo: null, marca: null, atributos_resumo: null } as unknown as LinhaPaginaProduto;
  return { ...produtoDaLinha(linha, cat)!, preco: 0 };
}

type Sb = { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => Promise<{ data: unknown[] | null; error: unknown }> } } };
const aLer = new Set<string>();

/** Lê os produtos pedidos que ainda não se conhecem e junta-os. Devolve os que chegaram. Sem sessão ou com erro, nada. */
export async function lerProdutosDoProjeto(org: string, pedidos: readonly PedidoProduto[]): Promise<Produto[]> {
  const faltam = pedidos.filter((x) => UUID.test(x.id) && !produto(x.id) && !aLer.has(x.id));
  if (!faltam.length) return [];
  faltam.forEach((x) => aLer.add(x.id));
  try {
    const { data, error } = await (supabase as unknown as Sb).from("products").select("id, name, sku").in("id", faltam.map((x) => x.id));
    if (error || !data) return [];
    const linhas = data as { id: string; name: string; sku: string | null }[];
    const cat = new Map(faltam.map((x) => [x.id, x.cat]));
    // a linha do catálogo (os atributos, o modelo, o PVP), procurada pela referência; sem ela, o produto pelo nome
    const lidos = await Promise.all(linhas.map(async (r) => {
      const c = cat.get(r.id)!;
      if (r.sku) {
        try {
          const pg = await lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q: r.sku }, 1);
          const l = pg.ok ? pg.v.produtos.find((x) => x.id === r.id) : undefined;
          const x = l && produtoDaLinha({ ...l, estado: null, ativo: true }, c);
          if (x) return x;
          if (l) return { ...produtoDaLinha({ ...l, pvp: 1, estado: null, ativo: true }, c)!, preco: 0 };
        } catch { /* fica o do nome */ }
      }
      return produtoDoNome(r.id, r.name, c);
    }));
    guardarProdutosDoProjeto(lidos);
    return lidos;
  } catch {
    return [];
  } finally {
    faltam.forEach((x) => aLer.delete(x.id));
  }
}

/** Garante que os produtos do projeto (e os `extras`) se conhecem; redesenha quando chegam. */
export function useProdutosDoProjeto(p: Projeto | null, extras: readonly PedidoProduto[] = []): void {
  const org = useCompanyOpcional()?.activeCompany?.id ?? null;
  useSyncExternalStore(ouvirProdutosReais, versaoProdutosReais);
  const chave = useMemo(() => (p ? JSON.stringify(produtosPedidosDoProjeto(p, extras)) : "[]"), [p, extras]);
  useEffect(() => {
    if (!org || chave === "[]") return;
    void lerProdutosDoProjeto(org, JSON.parse(chave) as PedidoProduto[]);
  }, [org, chave]);
}
