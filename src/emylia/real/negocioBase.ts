// CRM: as linhas do Negócio (negocioReal.ts, com as chaves da Emylia) ↔ o que as funções da base recebem e devolvem (com os uuid):
// neg_ler_negocios(org) e neg_guardar_negocio(org, negocio, linhas) (migration 20261231960000). Só se trocam os serviços: a Emylia chama-os
// pela chave (demol, canal, s-<sku>) e a base pelo id; os produtos e os ramos já são os ids do Catálogo lido da base.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhasNegocio } from "./negocioReal";

export interface IdsServico { paraId: ReadonlyMap<string, string>; paraChave: ReadonlyMap<string, string> }
/** Os mapas chave ↔ id a partir do que o Catálogo montou (CatalogoMontado.ids.servico: chave → id). */
export const idsServico = (chaveParaId: ReadonlyMap<string, string>): IdsServico =>
  ({ paraId: chaveParaId, paraChave: new Map([...chaveParaId].map(([k, v]) => [v, k])) });

/** docsCrm: o negócio tem orçamentos, contratos ou vendas diretas do CRM (20261231994000). Lê-se, mas não se grava por aqui: a base
 *  recusa-o (NE005) e abre-se em Contratos/Propostas. */
export interface NegocioLido { id: string; entityId: string; estadoCrm: string; fluxoEmylia: boolean; docsCrm: boolean; linhas: LinhasNegocio }

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
  const { data, error } = await sb.rpc("neg_ler_negocios" as never, { p_org: org } as never);
  if (error) throw new Error(error.message || "Não foi possível ler os negócios.");
  return ((data as unknown[]) ?? []).map((j) => deBase(j, ids));
}

/** Grava e devolve os avisos (ex.: uma visita que a agenda recusou por ser feriado; o resto ficou gravado). */
export async function gravarNegocio(sb: SupabaseClient, org: string, negocioId: string, L: LinhasNegocio, ids: IdsServico): Promise<string[]> {
  const { data, error } = await sb.rpc("neg_guardar_negocio" as never, { p_org: org, p_negocio_id: negocioId, p_linhas: paraBase(L, ids) } as never);
  if (error) throw new Error(error.message || "Não foi possível gravar o negócio.");
  const avisos = (data as { avisos?: unknown } | null)?.avisos;
  return Array.isArray(avisos) ? avisos.map(String) : [];
}
