// CRM: as linhas do Negócio (negocioReal.ts, com as chaves da Emylia) ↔ o que as funções da base recebem e devolvem (com os uuid):
// neg_ler_negocios(org) e neg_guardar_negocio(org, negocio, linhas) (migration 20261231960000). Só se trocam os serviços: a Emylia chama-os
// pela chave (demol, canal, s-<sku>) e a base pelo id; os produtos e os ramos já são os ids do Catálogo lido da base.
// 28/10 (20261231999000): a obra de cada negócio lê-se e grava-se ao lado (obra_ler_negocios, obra_guardar_negocio; obraReal.ts). Numa base
// sem essas funções, a obra fica como antes (só no ecrã) e o resto lê e grava na mesma.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negocio } from "../motor";
import { deLinhas, type LinhasNegocio } from "./negocioReal";
import { obraDaBase, type ObraBase } from "./obraReal";

export interface IdsServico { paraId: ReadonlyMap<string, string>; paraChave: ReadonlyMap<string, string> }
/** Os mapas chave ↔ id a partir do que o Catálogo montou (CatalogoMontado.ids.servico: chave → id). */
export const idsServico = (chaveParaId: ReadonlyMap<string, string>): IdsServico =>
  ({ paraId: chaveParaId, paraChave: new Map([...chaveParaId].map(([k, v]) => [v, k])) });

/** docsCrm: o negócio tem orçamentos, contratos ou vendas diretas do CRM (20261231994000). Lê-se, mas não se grava por aqui: a base
 *  recusa-o (NE005) e abre-se em Contratos/Propostas. */
export interface NegocioLido { id: string; entityId: string; estadoCrm: string; fluxoEmylia: boolean; docsCrm: boolean; linhas: LinhasNegocio;
  /** A obra gravada (20261231999000). Sem ela, o negócio ainda não tem obra na base. */
  obra?: Negocio["obra"] }

/** O negócio do motor a partir do que se leu: as linhas e, se houver, a obra. */
export function negocioDoLido(n: NegocioLido): Negocio {
  const d = deLinhas(n.linhas);
  if (n.obra) d.obra = n.obra;
  return d;
}

/** A função ainda não está na base (a migration por aplicar): PostgREST PGRST202, Postgres 42883. */
const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

/** Troca os serviços de cada sítio onde aparecem (lista dos serviços da visita, produtos, linhas e produtos de cada versão). */
function trocarServicos(L: LinhasNegocio, f: (s: string | null) => string | null): LinhasNegocio {
  const c = structuredClone(L);
  for (const s of c.servicos) s.servico = f(s.servico) ?? s.servico;
  for (const p of c.produtos ?? []) p.servico = f(p.servico);
  for (const o of c.orcamentos) {
    for (const l of o.linhas ?? []) if (l.tipo === "servico") l.servico = f(l.servico);
    for (const p of o.produtos ?? []) p.servico = f(p.servico);
  }
  for (const a of c.adendas ?? []) for (const v of a.versoes) for (const l of v.linhas) if (!l.livre) l.servico = f(l.servico);
  return c;
}

/** As linhas como a função da base as recebe: os serviços pelo id. Um serviço que a base não tem é erro (não se grava pela metade). */
export function paraBase(L: LinhasNegocio, ids: IdsServico): LinhasNegocio {
  const falta = new Set<string>();
  const r = trocarServicos(L, (s) => { if (s == null) return null; const id = ids.paraId.get(s); if (!id) falta.add(s); return id ?? s; });
  if (falta.size) throw new Error(`Serviços que não estão no Catálogo desta organização: ${[...falta].join(", ")}.`);
  return r;
}

/** O que a base devolve, para um negócio, de volta às linhas com as chaves da Emylia. */
export function deBase(j: unknown, ids: IdsServico): NegocioLido {
  const o = j as LinhasNegocio & { negocio: LinhasNegocio["negocio"] & { id: string; entity_id: string; estado_crm: string; fluxo_emylia: boolean; docs_crm?: boolean } };
  const n = { ...o.negocio } as Record<string, unknown>;
  const id = String(n.id), entityId = String(n.entity_id), estadoCrm = String(n.estado_crm), fluxoEmylia = !!n.fluxo_emylia, docsCrm = n.docs_crm === true;
  for (const k of ["id", "entity_id", "estado_crm", "fluxo_emylia", "docs_crm"]) delete n[k];
  const L: LinhasNegocio = {
    negocio: n as unknown as LinhasNegocio["negocio"], respostas: o.respostas ?? [], visitas: o.visitas ?? [], medidas: o.medidas,
    servicos: o.servicos ?? [], produtos: o.produtos ?? null, partes_fora: o.partes_fora ?? null, orcamentos: o.orcamentos ?? [],
    contratos: o.contratos ?? [], faturas: o.faturas ?? null, historico: o.historico ?? [], adendas: o.adendas ?? [],
  };
  return { id, entityId, estadoCrm, fluxoEmylia, docsCrm, linhas: trocarServicos(L, (s) => (s == null ? null : ids.paraChave.get(s) ?? s)) };
}

export async function lerNegocios(sb: SupabaseClient, org: string, ids: IdsServico): Promise<NegocioLido[]> {
  const [neg, obras] = await Promise.all([
    sb.rpc("neg_ler_negocios" as never, { p_org: org } as never),
    sb.rpc("obra_ler_negocios" as never, { p_org: org } as never),
  ]);
  if (neg.error) throw new Error(neg.error.message || "Não foi possível ler os negócios.");
  if (obras.error && !semFuncao(obras.error)) throw new Error(obras.error.message || "Não foi possível ler as obras.");
  const porNegocio = new Map(((obras.error ? [] : obras.data) as { negocio_id: string; emylia: unknown }[] | null ?? [])
    .map((o) => [o.negocio_id, obraDaBase(o.emylia)]));
  return ((neg.data as unknown[]) ?? []).map((j) => {
    const n = deBase(j, ids);
    const obra = porNegocio.get(n.id);
    return obra ? { ...n, obra } : n;
  });
}

/** Grava a obra do negócio e devolve os avisos (ex.: um técnico sem o ofício da tarefa). Numa base sem a função, não faz nada. */
export async function gravarObra(sb: SupabaseClient, org: string, negocioId: string, obra: ObraBase): Promise<string[]> {
  const { data, error } = await sb.rpc("obra_guardar_negocio" as never, { p_org: org, p_negocio_id: negocioId, p_obra: obra } as never);
  if (error) {
    if (semFuncao(error)) return [];
    throw new Error(error.message || "Não foi possível gravar a obra.");
  }
  const avisos = (data as { avisos?: unknown } | null)?.avisos;
  return Array.isArray(avisos) ? avisos.map(String) : [];
}

/** Grava e devolve os avisos (ex.: uma visita que a agenda recusou por ser feriado; o resto ficou gravado). */
export async function gravarNegocio(sb: SupabaseClient, org: string, negocioId: string, L: LinhasNegocio, ids: IdsServico): Promise<string[]> {
  const { data, error } = await sb.rpc("neg_guardar_negocio" as never, { p_org: org, p_negocio_id: negocioId, p_linhas: paraBase(L, ids) } as never);
  if (error) throw new Error(error.message || "Não foi possível gravar o negócio.");
  const avisos = (data as { avisos?: unknown } | null)?.avisos;
  return Array.isArray(avisos) ? avisos.map(String) : [];
}
