// CRM: lê o Catálogo e custos da organização numa só chamada (cat_ler_catalogo, migration 20261231920000).
// A função devolve as linhas de cada tabela; montar os objetos dos ecrãs é real/catalogoReal.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhaAtributo, LinhaModelo, LinhaProduto, LinhasAtributos, LinhasCatalogo, LinhasTabelas } from "./catalogoReal";

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

/** 13/11 (cat_ler_atributos): junta os atributos dos produtos. Sem resposta (função por criar na base, erro ou outro formato): as
 *  linhas ficam como estão, sem `atributos`, e o ecrã não mostra a secção «Atributos». */
export function juntarAtributos(L: LinhasCatalogo, r: unknown): LinhasCatalogo {
  if (!r || typeof r !== "object" || !Array.isArray((r as Record<string, unknown>).atributos)) return L;
  const o = r as Record<string, unknown>;
  const atributos: LinhasAtributos = { defs: lista<LinhaAtributo>(o.atributos), produtos: lista<LinhasAtributos["produtos"][number]>(o.produtos) };
  return { ...L, atributos };
}

/** 16/11 (cat_ler_modelos_gestao e products.model_id): junta os modelos e o modelo de cada produto. Sem resposta válida (função por criar, sem permissão,
 *  outro formato): as linhas ficam como estão, sem `modelos`, e o ecrã não oferece modelos. `ligacoes` null = não se leu (os modelos lêem-se, os produtos ficam sem). */
export function juntarModelos(L: LinhasCatalogo, r: unknown, ligacoes: { id: string; model_id: string }[] | null): LinhasCatalogo {
  const lista = r && typeof r === "object" ? (r as Record<string, unknown>).modelos : null;
  if (!Array.isArray(lista)) return L;
  const modelos = lista.flatMap((m): LinhaModelo[] => {
    const x = (m ?? {}) as Record<string, unknown>, s = (x.subcategoria ?? {}) as Record<string, unknown>;
    return typeof x.id === "string" && typeof s.id === "string"
      ? [{ id: x.id, nome: typeof x.nome === "string" ? x.nome : "", numero: typeof x.numero === "number" ? x.numero : 0, ativo: x.ativo !== false, subcategoria: s.id }]
      : [];
  });
  return { ...L, modelos: { lista: modelos, produtos: ligacoes } };
}

const PAGINA = 1000;
type Cadeia = { select: (c: string) => Cadeia; eq: (c: string, v: unknown) => Cadeia; not: (c: string, op: string, v: unknown) => Cadeia; range: (de: number, ate: number) => Promise<{ data?: unknown; error?: unknown } | undefined> };
/** O modelo de cada produto vivo da organização, lido da própria tabela products (RLS: quem vê a organização). Páginas de 1000; null se falhar. */
async function lerLigacoesModelo(sb: SupabaseClient, org: string): Promise<{ id: string; model_id: string }[] | null> {
  try {
    const out: { id: string; model_id: string }[] = [];
    for (let de = 0; de < 100 * PAGINA; de += PAGINA) {
      const p = await (sb as unknown as { from: (t: string) => Cadeia }).from("products").select("id, model_id").eq("organization_id", org).eq("is_deleted", false).not("model_id", "is", null).range(de, de + PAGINA - 1);
      if (!p || p.error || !Array.isArray(p.data)) return null;
      out.push(...(p.data as { id: string; model_id: string }[]));
      if (p.data.length < PAGINA) break;
    }
    return out;
  } catch {
    return null;
  }
}

/** A resposta de cat_ler_modelos_gestao (e, se há modelos, as ligações dos produtos); qualquer falha é «sem modelos», nunca um erro. */
async function lerModelos(sb: SupabaseClient, org: string): Promise<{ r: unknown; ligacoes: { id: string; model_id: string }[] | null }> {
  try {
    const m = (await sb.rpc("cat_ler_modelos_gestao" as never, { p_org: org } as never)) as { data?: unknown; error?: unknown } | undefined;
    if (!m || m.error) return { r: null, ligacoes: null };
    const lista = (m.data as { modelos?: unknown } | null)?.modelos;
    // sem modelos nenhum produto tem modelo (FK): poupa-se a leitura da tabela
    return { r: m.data, ligacoes: Array.isArray(lista) && lista.length ? await lerLigacoesModelo(sb, org) : [] };
  } catch {
    return { r: null, ligacoes: null };
  }
}

/** A resposta de cat_ler_atributos; qualquer falha (função por criar, permissão, rede) é «sem atributos», nunca um erro. */
async function lerAtributos(sb: SupabaseClient, org: string): Promise<unknown> {
  try {
    const a = (await sb.rpc("cat_ler_atributos" as never, { p_org: org } as never)) as { data?: unknown; error?: unknown } | undefined;
    return a && !a.error ? a.data : null;
  } catch {
    return null;
  }
}

export async function lerCatalogo(sb: SupabaseClient, org: string): Promise<LinhasCatalogo> {
  const [r, t, a, m] = await Promise.all([
    sb.rpc("cat_ler_catalogo" as never, { p_org: org } as never),
    sb.rpc("cat_ler_produtos_tabelas" as never, { p_org: org } as never),
    lerAtributos(sb, org),
    lerModelos(sb, org),
  ]);
  if (r.error) throw new Error(mensagemErroCatalogo(r.error));
  // sem a função nova (SQL 20270117100000 por colar) ou com erro nela: lê-se pelo texto, como antes
  if (t.error) console.info("Catálogo: produtos pelo texto (cat_ler_produtos_tabelas:", t.error.message ?? t.error.code, ")");
  return juntarModelos(juntarAtributos(juntarTabelas(linhasDe(r.data), t.error ? null : t.data), a), m.r, m.ligacoes);
}
