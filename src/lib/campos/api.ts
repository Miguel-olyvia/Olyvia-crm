/**
 * Acesso à base dos campos configuráveis (migração 20261209100000).
 * As tabelas e RPCs são novas e ainda não estão em integrations/supabase/types.ts,
 * por isso passam por um cliente sem tipos — só aqui.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Ficha, LinhaCampo } from "./catalogo";
import type { ValoresExtra } from "./definicoes";
import type { Termos } from "./termos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ConfigEmpresa {
  linhas: Record<Ficha, LinhaCampo[]>;
  termos: unknown;
  modeloSetor: string | null;
  /** false quando a migração ainda não está aplicada (tudo fica como sempre). */
  disponivel: boolean;
}

const VAZIA: ConfigEmpresa = {
  linhas: { local: [], diagnostico: [], cliente: [], lead: [] },
  termos: {},
  modeloSetor: null,
  disponivel: false,
};

const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

export async function lerConfigEmpresa(org: string): Promise<ConfigEmpresa> {
  const [campos, empresa] = await Promise.all([
    db.from("cfg_campos").select("*").eq("organization_id", org).order("ordem"),
    db.from("cfg_empresa").select("*").eq("organization_id", org).maybeSingle(),
  ]);
  if (semTabela(campos.error)) return VAZIA;
  if (campos.error) throw campos.error;
  if (empresa.error && !semTabela(empresa.error)) throw empresa.error;

  const linhas: ConfigEmpresa["linhas"] = { local: [], diagnostico: [], cliente: [], lead: [] };
  for (const l of (campos.data ?? []) as (LinhaCampo & { ficha: Ficha })[]) {
    if (linhas[l.ficha]) linhas[l.ficha].push({ ...l, opcoes: Array.isArray(l.opcoes) ? l.opcoes : [] });
  }
  return {
    linhas,
    termos: empresa.data?.termos ?? {},
    modeloSetor: empresa.data?.modelo_setor ?? null,
    disponivel: true,
  };
}

export async function gravarFicha(org: string, ficha: Ficha, linhas: LinhaCampo[]): Promise<void> {
  const { error } = await db.rpc("rpc_cfg_gravar_ficha", { p_org: org, p_ficha: ficha, p_campos: linhas });
  if (error) throw error;
}

export async function gravarEmpresa(org: string, modeloSetor: string | null, termos: Partial<Termos>): Promise<void> {
  const { error } = await db.rpc("rpc_cfg_gravar_empresa", { p_org: org, p_modelo_setor: modeloSetor, p_termos: termos });
  if (error) throw error;
}

/** Valores dos campos da empresa nas moradas de entrega de uma entidade: { address_id: valores }. */
export async function lerExtraLocal(entityId: string, org: string): Promise<Record<string, ValoresExtra>> {
  const { data, error } = await db.rpc("rpc_local_extra_ler", { p_entity_id: entityId, p_org: org });
  if (error) {
    if (semTabela(error) || error.code === "PGRST202") return {};
    throw error;
  }
  return (data ?? {}) as Record<string, ValoresExtra>;
}

export async function gravarExtraLocal(entityId: string, addressId: string, org: string, valores: ValoresExtra): Promise<ValoresExtra> {
  const { data, error } = await db.rpc("rpc_local_extra_gravar", {
    p_entity_id: entityId, p_address_id: addressId, p_org: org, p_valores: valores,
  });
  if (error) throw error;
  return (data ?? {}) as ValoresExtra;
}

export async function gravarExtraDiagnostico(needId: string, valores: ValoresExtra): Promise<ValoresExtra> {
  const { data, error } = await db.rpc("rpc_diag_extra_gravar", { p_need_id: needId, p_valores: valores });
  if (error) throw error;
  return (data ?? {}) as ValoresExtra;
}

export async function gravarExtraCliente(clientId: string, valores: ValoresExtra): Promise<ValoresExtra> {
  const { data, error } = await db.rpc("rpc_cliente_extra_gravar", { p_client_id: clientId, p_valores: valores });
  if (error) throw error;
  return (data ?? {}) as ValoresExtra;
}

export async function gravarExtraLead(leadId: string, valores: ValoresExtra): Promise<ValoresExtra> {
  const { data, error } = await db.rpc("rpc_lead_extra_gravar", { p_lead_id: leadId, p_valores: valores });
  if (error) throw error;
  return (data ?? {}) as ValoresExtra;
}
