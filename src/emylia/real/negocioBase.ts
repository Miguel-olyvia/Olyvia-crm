// CRM: as linhas do Negócio (negocioReal.ts, com as chaves da Emylia) ↔ o que as funções da base recebem e devolvem (com os uuid):
// neg_ler_negocios(org) e neg_guardar_negocio(org, negocio, linhas) (migration 20261231960000). Só se trocam os serviços: a Emylia chama-os
// pela chave (demol, canal, s-<sku>) e a base pelo id; os produtos e os ramos já são os ids do Catálogo lido da base.
// 28/10 (20261231999000): a obra de cada negócio lê-se e grava-se ao lado (obra_ler_negocios, obra_guardar_negocio; obraReal.ts). Numa base
// sem essas funções, a obra fica como antes (só no ecrã) e o resto lê e grava na mesma.
import type { SupabaseClient } from "@supabase/supabase-js";
import { acertarFaseDasMedidas, type Negocio } from "../motor";
import { deLinhas, type LinhasNegocio } from "./negocioReal";
import { obraDaBase, type ObraBase } from "./obraReal";
import { erpLembrado } from "../erpEticadata";
import { refNegocio } from "../inventario/ponteNegocios";
import type { CfgCampos } from "../campos";
import { linhasSugeridas, type SugestaoBase } from "../sugestoesForm";

export interface IdsServico { paraId: ReadonlyMap<string, string>; paraChave: ReadonlyMap<string, string> }
/** Os mapas chave ↔ id a partir do que o Catálogo montou (CatalogoMontado.ids.servico: chave → id). */
export const idsServico = (chaveParaId: ReadonlyMap<string, string>): IdsServico =>
  ({ paraId: chaveParaId, paraChave: new Map([...chaveParaId].map(([k, v]) => [v, k])) });

/** docsCrm: o negócio tem orçamentos, contratos ou vendas diretas do CRM (20261231994000). Lê-se, mas não se grava por aqui: a base
 *  recusa-o (NE005) e abre-se em Contratos/Propostas. */
export interface NegocioLido { id: string; entityId: string; estadoCrm: string; fluxoEmylia: boolean; docsCrm: boolean; linhas: LinhasNegocio;
  /** A obra gravada (20261231999000). Sem ela, o negócio ainda não tem obra na base. */
  obra?: Negocio["obra"];
  /** 28/10: a encomenda de cliente emitida no servidor (20261231999700, fn_neg_ler_ec): o contrato e quando. Sem ela, ainda não há. */
  ec?: EcBase | null }
export interface EcBase { contract_id: string; order_number: string | null; emitida_em: string | null }

/** O negócio do motor a partir do que se leu: as linhas e, se houver, a obra. */
export function negocioDoLido(n: NegocioLido): Negocio {
  const d = deLinhas(n.linhas);
  // F3: a encomenda de cliente é a do servidor (a obra gravada pode trazer uma cópia antiga; sem EC emitida não há nenhuma)
  if (n.obra) d.obra = { ...n.obra, ec: d.obra.ec ?? null, ...(d.obra.ecsAjuste ? { ecsAjuste: d.obra.ecsAjuste } : { ecsAjuste: (n.obra.ecsAjuste ?? []).filter((x) => !x.adenda) }) };
  // a referência do negócio no Inventário (CT/VD 2026/<n>): é por ela que o resumo da encomenda real se lê (encomendaReal.ts, ef8d968f)
  if (d.obra.ec?.contrato && !d.obra.ec.ref) d.obra.ec.ref = refNegocio(d);
  // e a última leitura do Eticadata da fatura (não se grava na base)
  const erp = erpLembrado(d.fin.fatura?.n);
  if (erp) d.fin.erp = erp;
  return d;
}

/** O negócio lido, para o ecrã: como negocioDoLido, com a fase que o fluxo de 10/11 pede (Rúben: «medidas antes da fatura»: as medidas e
 *  o plano antes do Financeiro; acertarFaseDasMedidas). A fase acertada grava-se na próxima mudança do negócio. */
export function negocioParaOEcra(n: NegocioLido): Negocio {
  const d = negocioDoLido(n);
  acertarFaseDasMedidas(d);
  return d;
}

/** A função ainda não está na base (a migration por aplicar): PostgREST PGRST202, Postgres 42883. */
export const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

/** Só os elementos que servem (negocio_id, grupo e chave em texto): um null ou um objeto torto não pode rebentar a leitura. */
const eSugestao = (x: unknown): x is SugestaoBase => {
  const o = x as Record<string, unknown> | null;
  return !!o && typeof o === "object" && typeof o.negocio_id === "string" && typeof o.grupo === "string" && typeof o.chave === "string";
};

/** 4/11: as respostas do formulário online ligadas a perguntas da fase (neg_sugestoes_formulario). Best-effort: qualquer erro
 *  (função por aplicar incluída) deixa os negócios abrirem sem sugestões; nunca lança. Acima de 5000 negócios a função devolve
 *  `truncado: true` e as sugestões dos restantes faltam em silêncio (só há um aviso na consola). */
async function lerSugestoes(sb: SupabaseClient, org: string): Promise<SugestaoBase[]> {
  try {
    const { data, error } = await sb.rpc("neg_sugestoes_formulario" as never, { p_org: org } as never);
    if (error) {
      if (!semFuncao(error)) console.warn("[negócios] as sugestões do formulário não carregaram:", error.message);
      return [];
    }
    // a função devolve {sugestoes, truncado}; tolera-se também um array simples
    if (Array.isArray(data)) return data.filter(eSugestao);
    const o = data as { sugestoes?: unknown; truncado?: unknown } | null;
    if (o?.truncado === true) console.warn("[negócios] sugestões truncadas: há mais negócios do que o limite");
    return Array.isArray(o?.sugestoes) ? o.sugestoes.filter(eSugestao) : [];
  } catch (e) {
    console.warn("[negócios] as sugestões do formulário não carregaram:", (e as Error).message);
    return [];
  }
}

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
  const o = j as LinhasNegocio & { negocio: LinhasNegocio["negocio"] & { id: string; entity_id: string; estado_crm: string; fluxo_emylia: boolean; docs_crm?: boolean };
    ec?: Partial<EcBase> | null };
  const n = { ...o.negocio } as Record<string, unknown>;
  const id = String(n.id), entityId = String(n.entity_id), estadoCrm = String(n.estado_crm), fluxoEmylia = !!n.fluxo_emylia, docsCrm = n.docs_crm === true;
  for (const k of ["id", "entity_id", "estado_crm", "fluxo_emylia", "docs_crm"]) delete n[k];
  const L: LinhasNegocio = {
    negocio: n as unknown as LinhasNegocio["negocio"], respostas: o.respostas ?? [], visitas: o.visitas ?? [], medidas: o.medidas,
    servicos: o.servicos ?? [], produtos: o.produtos ?? null, partes_fora: o.partes_fora ?? null, orcamentos: o.orcamentos ?? [],
    contratos: o.contratos ?? [], faturas: o.faturas ?? null, historico: o.historico ?? [], adendas: o.adendas ?? [],
    // F3 (20261231999700): a encomenda de cliente emitida no servidor
    ec: o.ec ?? null,
  };
  const ec: EcBase | null = o.ec?.contract_id ? { contract_id: String(o.ec.contract_id), order_number: o.ec.order_number ?? null, emitida_em: o.ec.emitida_em ?? null } : null;
  return { id, entityId, estadoCrm, fluxoEmylia, docsCrm, ec, linhas: trocarServicos(L, (s) => (s == null ? null : ids.paraChave.get(s) ?? s)) };
}

/** `campos`: os ajustes da organização (S.campos), para traduzir as respostas do formulário para as perguntas da fase. A foto e o conflito()
 *  passam por aqui, por isso veem as mesmas sugestões que o ecrã. */
export async function lerNegocios(sb: SupabaseClient, org: string, ids: IdsServico, campos?: CfgCampos,
  opcoes: { semSugestoes?: boolean } = {}): Promise<NegocioLido[]> {
  const [neg, obras, autores, sugestoes] = await Promise.all([
    sb.rpc("neg_ler_negocios" as never, { p_org: org } as never),
    sb.rpc("obra_ler_negocios" as never, { p_org: org } as never),
    // 3/11 (20270105100000): quem fez cada entrada do histórico; sem a função (ou com erro), o histórico fica sem nomes
    sb.rpc("neg_historico_autores" as never, { p_org: org } as never),
    // 09/11 (20270111100000): quem só lê as obras (sem pessoas.view, com negocios.obra.executar) não pode ler as sugestões: nem se pedem
    opcoes.semSugestoes ? Promise.resolve([] as SugestaoBase[]) : lerSugestoes(sb, org),
  ]);
  if (neg.error) throw new Error(neg.error.message || "Não foi possível ler os negócios.");
  if (obras.error && !semFuncao(obras.error)) throw new Error(obras.error.message || "Não foi possível ler as obras.");
  const porNegocio = new Map(((obras.error ? [] : obras.data) as { negocio_id: string; emylia: unknown }[] | null ?? [])
    .map((o) => [o.negocio_id, obraDaBase(o.emylia)]));
  const quem = new Map(((autores.error ? [] : autores.data) as { negocio_id: string; ordem: number; quem: string | null }[] | null ?? [])
    .map((a) => [`${a.negocio_id}:${a.ordem}`, a.quem ?? ""]));
  const sugPorNegocio = new Map<string, SugestaoBase[]>();
  for (const s of sugestoes) if (s.negocio_id) sugPorNegocio.set(s.negocio_id, [...(sugPorNegocio.get(s.negocio_id) ?? []), s]);
  return ((neg.data as unknown[]) ?? []).map((j) => {
    const n = deBase(j, ids);
    for (const h of n.linhas.historico) h.quem = quem.get(`${n.id}:${h.ordem}`) ?? "";
    // uma linha sugerida por chave AUSENTE; uma chave com linha (respondida, ou apagada de propósito com valor vazio) nunca se toca
    const dele = sugPorNegocio.get(n.id);
    if (dele) {
      const novas = linhasSugeridas(dele, campos, new Set(n.linhas.respostas.map((r) => r.campo_chave)));
      if (novas.length) n.linhas = { ...n.linhas, respostas: [...n.linhas.respostas, ...novas] };
    }
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
