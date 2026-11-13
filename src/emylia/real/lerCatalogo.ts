// CRM: lê o Catálogo e custos da organização numa só chamada (cat_ler_catalogo, migration 20261231920000).
// A função devolve as linhas de cada tabela; montar os objetos dos ecrãs é real/catalogoReal.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhaProduto, LinhasCatalogo, LinhasTabelas } from "./catalogoReal";

const VAZIO: LinhasCatalogo = {
  parametros: null, margemLinha: [], categorias: [], perfis: [], equipamentos: [], estrutura: [], servicos: [], precosServico: [],
  passos: [], usosEquip: [], usosCons: [], produtos: [], precosProduto: [], fornecedores: [], tecnicos: [],
};

/** As linhas que a função devolveu, com as listas em falta vazias (uma organização sem Catálogo). */
export function linhasDe(r: unknown): LinhasCatalogo {
  const o = (r && typeof r === "object" ? r : {}) as Partial<LinhasCatalogo>;
  const L = { ...VAZIO } as LinhasCatalogo;
  for (const k of Object.keys(VAZIO) as (keyof LinhasCatalogo)[]) {
    if (k === "parametros") L.parametros = o.parametros ?? null;
    else (L as unknown as Record<string, unknown[]>)[k] = Array.isArray(o[k]) ? (o[k] as unknown[]) : [];
  }
  return L;
}

/** O erro da base em português: CT001 sem permissão, o resto como veio. */
export function mensagemErroCatalogo(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "Não foi possível ler o Catálogo.";
  if (e.code === "CT001") return "Não tem permissão para ver o Catálogo e custos desta organização.";
  return e.message || "Não foi possível ler o Catálogo.";
}

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 13/11 (20270117100000): junta o que cat_ler_produtos_tabelas devolveu (a marca, a unidade e a categoria de cada produto pelas
 *  tabelas de referência, a árvore dos produtos, as marcas, as unidades e a regra «exige produto»). Sem resposta (função por criar
 *  na base): as linhas ficam como estão e o Catálogo lê e grava pelo texto, como antes. */
export function juntarTabelas(L: LinhasCatalogo, r: unknown): LinhasCatalogo {
  if (!r || typeof r !== "object" || !Array.isArray((r as Record<string, unknown>).categoriasProduto)) return L;
  const o = r as Record<string, unknown>;
  type Ref = Pick<LinhaProduto, "id" | "brand_id" | "marca" | "uom_id" | "uom" | "category_id" | "subcategory_id">;
  const refs = new Map(lista<Ref>(o.produtos).map((x) => [x.id, x]));
  const tabelas: LinhasTabelas = {
    categoriasProduto: lista(o.categoriasProduto), marcas: lista<string>(o.marcas).filter(Boolean),
    unidades: lista<string>(o.unidades).filter(Boolean), exige: lista(o.exige),
  };
  return {
    ...L, tabelas,
    produtos: L.produtos.map((p) => {
      const x = refs.get(p.id);
      return x ? { ...p, brand_id: x.brand_id ?? null, marca: x.marca ?? null, uom_id: x.uom_id ?? null, uom: x.uom ?? null,
        category_id: x.category_id ?? null, subcategory_id: x.subcategory_id ?? null } : p;
    }),
  };
}

export async function lerCatalogo(sb: SupabaseClient, org: string): Promise<LinhasCatalogo> {
  const [r, t] = await Promise.all([
    sb.rpc("cat_ler_catalogo" as never, { p_org: org } as never),
    sb.rpc("cat_ler_produtos_tabelas" as never, { p_org: org } as never),
  ]);
  if (r.error) throw new Error(mensagemErroCatalogo(r.error));
  // sem a função nova (SQL 20270117100000 por colar) ou com erro nela: lê-se pelo texto, como antes
  if (t.error) console.info("Catálogo: produtos pelo texto (cat_ler_produtos_tabelas:", t.error.message ?? t.error.code, ")");
  return juntarTabelas(linhasDe(r.data), t.error ? null : t.data);
}
