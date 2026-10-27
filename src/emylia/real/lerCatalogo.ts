// CRM: lê o Catálogo e custos da organização numa só chamada (cat_ler_catalogo, migration 20261231920000).
// A função devolve as linhas de cada tabela; montar os objetos dos ecrãs é real/catalogoReal.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhasCatalogo } from "./catalogoReal";

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

export async function lerCatalogo(sb: SupabaseClient, org: string): Promise<LinhasCatalogo> {
  const { data, error } = await sb.rpc("cat_ler_catalogo" as never, { p_org: org } as never);
  if (error) throw new Error(mensagemErroCatalogo(error));
  return linhasDe(data);
}
