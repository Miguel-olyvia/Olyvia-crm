/**
 * Margem da obra e previsão do fim — leitura (db/margem-previsao.sql).
 *
 * Tudo opcional: sem o SQL aplicado, as funções devolvem null / [] e os
 * ecrãs simplesmente não mostram os blocos.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ErroDeEscrita } from "./dados";

export type Semaforo = "verde" | "amarelo" | "vermelho" | "sem_dados";

export interface MargemObra {
  ve_custos: true;
  pode_configurar: boolean;
  custo_hora_padrao: number;
  obra_id: string;
  codigo: string;
  estado: string;
  receita: number | null;
  receita_fonte: "orcamento" | "linhas" | "total_com_iva" | null;
  extras: number;
  receita_total: number | null;
  custo_materiais: number;
  mo_orcada: number;
  mo_prevista: number;
  custo_previsto: number;
  margem_prevista: number | null;
  margem_prevista_pct: number | null;
  progresso: number;
  mo_real: number;
  custo_a_data: number | null;
  margem_a_data: number | null;
  margem_a_data_pct: number | null;
  mo_projetada: number;
  custo_projetado: number;
  margem_projetada: number | null;
  margem_projetada_pct: number | null;
  ritmo: number;
  ritmo_fonte: "obra" | "historico" | "sem_dados";
  custo_hora: number;
  custo_hora_fonte: "orcamento" | "equipa" | "padrao";
  sem_tarifa: number;
  minutos_previstos: number;
  minutos_reais: number;
  limiar: number;
  semaforo: Semaforo;
}

export type RespostaMargem = MargemObra | { ve_custos: false };

export interface MargemResumo {
  obra_id: string;
  semaforo: Semaforo;
  margem_prevista_pct: number | null;
  margem_projetada_pct: number | null;
  limiar: number;
}

export interface PrevisaoBase {
  hoje: string;
  minutos_por_dia: number;
  p50: number;
  p80: number;
  fonte: "obra" | "historico" | "sem_dados";
  n_obra: number;
  n_historico: number;
  por_especialidade: { skill_id: string; nome: string | null; n: number; p50: number; p80: number }[];
  dias_uteis: string[];
}

const SEM_SQL = /does not exist|não existe|Could not find the function|PGRST202/i;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** A margem de uma obra. null se o SQL ainda não estiver aplicado. */
export async function margemDaObra(obraId: string): Promise<RespostaMargem | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_margem", { p_obra_id: obraId });
  if (error) {
    if (SEM_SQL.test(error.message)) return null;
    throw new ErroDeEscrita(error.message || "Não foi possível calcular a margem.");
  }
  const d = data as Record<string, unknown> | null;
  if (!d || d.ve_custos !== true) return { ve_custos: false };
  // numeric chega como texto ou número: normaliza.
  const r = { ...d } as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (typeof r[k] === "string" && /^-?\d+(\.\d+)?$/.test(r[k] as string)) r[k] = Number(r[k]);
  }
  return r as unknown as MargemObra;
}

/** O semáforo de todas as obras da organização — numa chamada. [] sem SQL ou sem permissão. */
export async function margensDaOrganizacao(orgId: string): Promise<MargemResumo[]> {
  const { data, error } = await supabase.rpc("rpc_ops_obras_margem", { p_org: orgId });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    obra_id: String(m.obra_id),
    semaforo: m.semaforo as Semaforo,
    margem_prevista_pct: num(m.margem_prevista_pct),
    margem_projetada_pct: num(m.margem_projetada_pct),
    limiar: Number(m.limiar ?? 20),
  }));
}

/** O limiar (%) e o custo/hora padrão. Só o gestor. */
export async function gravarLimiarMargem(orgId: string, limiar: number, custoHora?: number | null): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_obra_margem_config", {
    p_org: orgId,
    p_limiar_percent: limiar,
    p_custo_hora_padrao: custoHora ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar o limiar.");
}

/** Fatores e calendário para o fim provável. null sem SQL. */
export async function previsaoDaObra(obraId: string): Promise<PrevisaoBase | null> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_previsao", { p_obra_id: obraId });
  if (error) {
    if (SEM_SQL.test(error.message)) return null;
    throw new ErroDeEscrita(error.message || "Não foi possível calcular a previsão.");
  }
  const d = data as Record<string, unknown>;
  return {
    hoje: String(d.hoje),
    minutos_por_dia: Number(d.minutos_por_dia ?? 480),
    p50: Number(d.p50 ?? 1),
    p80: Number(d.p80 ?? 1.2),
    fonte: (d.fonte as PrevisaoBase["fonte"]) ?? "sem_dados",
    n_obra: Number(d.n_obra ?? 0),
    n_historico: Number(d.n_historico ?? 0),
    por_especialidade: ((d.por_especialidade ?? []) as Record<string, unknown>[]).map((e) => ({
      skill_id: String(e.skill_id),
      nome: (e.nome as string | null) ?? null,
      n: Number(e.n),
      p50: Number(e.p50),
      p80: Number(e.p80),
    })),
    dias_uteis: ((d.dias_uteis ?? []) as string[]).map((x) => String(x).slice(0, 10)),
  };
}

/**
 * O semáforo de todas as obras, para a lista: UMA chamada à base, em segundo
 * plano (a lista aparece sem esperar por ele). Vazio para quem não vê custos.
 */
export function useMargensDaOrganizacao(orgId: string | null | undefined, recarga = 0): ReadonlyMap<string, MargemResumo> {
  const [m, setM] = useState<ReadonlyMap<string, MargemResumo>>(new Map());
  useEffect(() => {
    if (!orgId) return;
    let vivo = true;
    margensDaOrganizacao(orgId)
      .then((l) => vivo && setM(new Map(l.map((x) => [x.obra_id, x]))))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [orgId, recarga]);
  return m;
}
