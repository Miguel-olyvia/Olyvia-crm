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

/** A resposta de cat_ler_modelos_gestao; qualquer falha é «sem modelos», nunca um erro. 16/11: já não se lê products.model_id (14 328 linhas em páginas com OFFSET davam
 *  timeout): o modelo de cada produto vem da página da lista (cat_ler_produtos_pagina) e da ficha. */
async function lerModelos(sb: SupabaseClient, org: string): Promise<unknown> {
  try {
    const m = (await sb.rpc("cat_ler_modelos_gestao" as never, { p_org: org } as never)) as { data?: unknown; error?: unknown } | undefined;
    return m && !m.error ? m.data : null;
  } catch {
    return null;
  }
}

type Resposta = { data?: unknown; error?: { code?: string; message?: string } | null } | undefined;
/** A função não existe na base (PGRST202, 42883): é o único erro que justifica voltar à função antiga. */
const funcaoEmFalta = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message ?? ""));

/** A função `nome` (e não outra) não existe na base: o erro de «função em falta» tem de a nomear. Um erro de DENTRO da função (outra função em falta) não conta. */
export const funcaoNomeadaEmFalta = (e: { code?: string; message?: string } | null | undefined, nome: string): boolean => funcaoEmFalta(e) && (e?.message ?? "").includes(nome);

/** 16/11: só as definições dos atributos (cat_ler_atributos_definicoes). A função antiga (cat_ler_atributos) trazia os valores de TODOS os produtos (8 MB na Mudelar) e só se
 *  usa se a nova ainda não existe na base; qualquer outra falha (tempo, rede, permissão) é «sem atributos», nunca um erro nem a leitura pesada. */
async function lerAtributos(sb: SupabaseClient, org: string): Promise<unknown> {
  try {
    const a = (await sb.rpc("cat_ler_atributos_definicoes" as never, { p_org: org } as never)) as Resposta;
    if (a && !a.error) return a.data;
    if (!funcaoEmFalta(a?.error)) return null;
    const v = (await sb.rpc("cat_ler_atributos" as never, { p_org: org } as never)) as Resposta;
    return v && !v.error ? v.data : null;
  } catch {
    return null;
  }
}

/** 17/11 (20270121000000): a leitura LEVE do Catálogo. cat_ler_catalogo_servicos devolve o mesmo JSON, mas `produtos`, `precosProduto` e `fornecedores` só trazem os
 *  produtos dos consumos dos serviços (145 na Mudelar, em vez de 29 785: 32 MB, 4 a 15 s). Sem a função na base (PGRST202, 42883) lê-se cat_ler_catalogo, como antes;
 *  qualquer outro erro (permissão, tempo) sobe tal como veio, sem voltar à leitura pesada. */
async function lerLinhas(sb: SupabaseClient, org: string, leve: boolean): Promise<Resposta> {
  if (leve) {
    const r = (await sb.rpc("cat_ler_catalogo_servicos" as never, { p_org: org } as never)) as Resposta;
    if (!funcaoNomeadaEmFalta(r?.error, "cat_ler_catalogo_servicos")) return r;
  }
  return (await sb.rpc("cat_ler_catalogo" as never, { p_org: org } as never)) as Resposta;
}

/** 17/11 (20270122000000): as tabelas dos produtos. A versão leve (cat_ler_produtos_tabelas_servicos) traz em `produtos` só os dos consumos (48 KB na Mudelar, em vez de 9,8 MB);
 *  só se a função nomeada não existe na base volta a cat_ler_produtos_tabelas. Qualquer outro erro sobe tal como veio (o chamador deixa o Catálogo sem tabelas). */
async function lerTabelas(sb: SupabaseClient, org: string, leve: boolean): Promise<Resposta> {
  if (leve) {
    const r = (await sb.rpc("cat_ler_produtos_tabelas_servicos" as never, { p_org: org } as never)) as Resposta;
    if (!funcaoNomeadaEmFalta(r?.error, "cat_ler_produtos_tabelas_servicos")) return r;
  }
  return (await sb.rpc("cat_ler_produtos_tabelas" as never, { p_org: org } as never)) as Resposta;
}

/** 18/11: `soServicos` (páginas de Serviços): não lê os atributos nem os modelos, que são dos Produtos (juntarAtributos e juntarModelos toleram a falta).
 *  Mantém as tabelas dos produtos (versão leve, 48 KB): dão a marca e a categoria dos produtos dos consumos, e sem elas o autosave podia reclassificá-los. */
export async function lerCatalogo(sb: SupabaseClient, org: string, opcoes: { leve?: boolean; soServicos?: boolean } = {}): Promise<LinhasCatalogo> {
  const [r, t, a, m] = await Promise.all([
    lerLinhas(sb, org, !!opcoes.leve),
    lerTabelas(sb, org, !!opcoes.leve),
    opcoes.soServicos ? Promise.resolve(null) : lerAtributos(sb, org),
    opcoes.soServicos ? Promise.resolve(null) : lerModelos(sb, org),
  ]);
  if (r?.error) throw new Error(mensagemErroCatalogo(r.error));
  // sem a função nova (SQL 20270117100000 por colar) ou com erro nela: lê-se pelo texto, como antes
  if (t?.error) console.info("Catálogo: produtos pelo texto (tabelas dos produtos:", t.error.message ?? t.error.code, ")");
  return juntarModelos(juntarAtributos(juntarTabelas(linhasDe(r?.data), !t || t.error ? null : t.data), a), m, null);
}
