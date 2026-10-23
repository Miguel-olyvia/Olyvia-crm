// A leitura da Frota (react-query, no padrão do useInventoryToday): uma consulta por tabela/vista, todas com o
// organization_id da organização ativa (useCompany) e chaves ["frota", org, <tabela>]. As escritas são só pelas RPCs
// (api.ts); depois de cada ação invalidam-se as tabelas que a RPC mexe (INVALIDA), e com elas todos os ecrãs ligados:
// Hoje, ficha (abas e Histórico), Atividade, listas, calendário e contadores do menu (que leem as MESMAS chaves).
import { useMemo } from "react";
import { useQueries, useQuery, type QueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type {
  FleetActivityLog, FleetAssignment, FleetCompliance, FleetDriver, FleetExpense, FleetExpenseImport, FleetIncident, FleetMaintenanceEvent,
  FleetOdometerReading, FleetOpsLink, FleetRestockRequest, FleetVehicleView, WarehouseFleetColumns,
} from "@/integrations/supabase/fleetTypes";
import { inventoryTodayQueryKey } from "@/hooks/useInventoryToday";
import { tabela } from "./api";
import { addDias, hojeFrota } from "./base";
import { frotaVazia, type Frota, type LinhaStock } from "./regras";

export type TabelaFrota =
  | "viaturas" | "condutores" | "atribuicoes" | "leituras" | "manutencoes" | "ocorrencias" | "vencimentos" | "custos" | "importacoes"
  | "pedidos" | "ligacoes" | "atividade" | "stock";
export const TABELAS_FROTA: readonly TabelaFrota[] = [
  "viaturas", "condutores", "atribuicoes", "leituras", "manutencoes", "ocorrencias", "vencimentos", "custos", "importacoes", "pedidos", "ligacoes", "atividade", "stock",
];

export const frotaKeys = {
  raiz: (org: string | null | undefined) => ["frota", org ?? null] as const,
  tabela: (org: string | null | undefined, t: TabelaFrota) => ["frota", org ?? null, t] as const,
  ref: (org: string | null | undefined, r: string) => ["frota-ref", org ?? null, r] as const,
  alertas: (org: string | null | undefined) => ["frota-alertas", org ?? null] as const,
  documentos: (vid: string) => ["documents", "vehicle", vid] as const,
};

/** numeric do Postgres pode chegar como texto: passa a número (null fica null). */
const n = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number(x));
const comNumeros = <T,>(linhas: unknown[] | null | undefined, campos: readonly string[]): T[] =>
  (linhas ?? []).map((l) => {
    const o = { ...(l as Record<string, unknown>) };
    for (const c of campos) if (c in o) o[c] = n(o[c]);
    return o as T;
  });

async function correr<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** As leituras de cada tabela (só SELECT; RLS decide o que cada um vê: fleet.view, fleet.costs, fleet.self). */
export const LEITORES: Record<TabelaFrota, (org: string, hoje: string) => Promise<unknown[]>> = {
  viaturas: async (org) => comNumeros<FleetVehicleView>(
    await correr(tabela("fleet_v_vehicles").select("*").eq("organization_id", org).order("plate")),
    ["monthly_rent", "odometer_km", "service_every_km", "service_every_months", "service_last_km", "service_next_km", "model_year"]),
  condutores: async (org) => correr<FleetDriver>(tabela("fleet_drivers").select("*").eq("organization_id", org).is("deleted_at", null).order("full_name")),
  atribuicoes: async (org) => correr<FleetAssignment>(tabela("fleet_assignments").select("*").eq("organization_id", org).is("cancelled_at", null).order("starts_on", { ascending: false }).limit(2000)),
  leituras: async (org, hoje) => comNumeros<FleetOdometerReading>(
    await correr(tabela("fleet_odometer_readings").select("id, vehicle_id, read_on, km, source, is_flagged").eq("organization_id", org).gte("read_on", addDias(hoje, -400)).order("read_on").limit(5000)),
    ["km"]),
  manutencoes: async (org) => comNumeros<FleetMaintenanceEvent>(
    await correr(tabela("fleet_maintenance_events").select("*").eq("organization_id", org).neq("status", "cancelled").order("scheduled_on", { ascending: false }).limit(2000)),
    ["estimated_cost", "final_cost", "km"]),
  ocorrencias: async (org) => comNumeros<FleetIncident>(
    await correr(tabela("fleet_incidents").select("*").eq("organization_id", org).order("occurred_at", { ascending: false }).limit(2000)), ["amount"]),
  vencimentos: async (org) => comNumeros<FleetCompliance>(
    await correr(tabela("fleet_compliance").select("*").eq("organization_id", org).eq("is_current", true)), ["amount"]),
  custos: async (org, hoje) => comNumeros<FleetExpense>(
    await correr(tabela("fleet_expenses").select("*").eq("organization_id", org).gte("spent_on", addDias(hoje, -400)).order("spent_on", { ascending: false }).limit(5000)),
    ["quantity", "amount", "odometer_km"]),
  importacoes: async (org) => correr<FleetExpenseImport>(tabela("fleet_expense_imports").select("*").eq("organization_id", org).order("imported_at", { ascending: false }).limit(50)),
  pedidos: async (org, hoje) => correr<FleetRestockRequest>(
    tabela("fleet_restock_requests").select("*").eq("organization_id", org).or(`status.eq.requested,requested_at.gte.${addDias(hoje, -90)}`).order("requested_at", { ascending: false }).limit(1000)),
  ligacoes: async (org) => comNumeros<FleetOpsLink>(
    await correr(tabela("fleet_ops_links").select("*").eq("organization_id", org).order("used_on", { ascending: false }).limit(1000)), ["km", "cost_per_km", "travel_cost"]),
  atividade: async (org) => correr<FleetActivityLog>(tabela("fleet_activity_log").select("*").eq("organization_id", org).order("created_at", { ascending: false }).limit(300)),
  // o stock das carrinhas: as linhas de stocks dos armazéns móveis (is_vehicle), com o artigo
  stock: async (org) => {
    const l = await correr<{ id: string; product_id: string; warehouse_id: string; quantity: unknown; minimum_quantity: unknown; products: { name?: string; sku?: string } | null }>(
      tabela("stocks").select("id, product_id, warehouse_id, quantity, minimum_quantity, products(name, sku), warehouses!inner(is_vehicle)")
        .eq("organization_id", org).is("deleted_at", null).eq("warehouses.is_vehicle", true).limit(5000));
    return l.map((s): LinhaStock => ({
      id: s.id, product_id: s.product_id, warehouse_id: s.warehouse_id, ref: s.products?.sku ?? "", nome: s.products?.name ?? "Artigo", un: "un",
      qty: Number(s.quantity) || 0, min: Number(s.minimum_quantity) || 0,
    }));
  },
};

const CAMPO: Record<TabelaFrota, keyof Frota> = {
  viaturas: "viaturas", condutores: "condutores", atribuicoes: "atrib", leituras: "leituras", manutencoes: "manut", ocorrencias: "ocorr",
  vencimentos: "venc", custos: "custos", importacoes: "importacoes", pedidos: "pedidos", ligacoes: "ligacoes", atividade: "log", stock: "stock",
};

export interface EstadoDadosFrota {
  F: Frota;
  org: string | null;
  /** A primeira leitura ainda não chegou. */
  carregando: boolean;
  /** As tabelas que falharam (a mensagem do primeiro erro em `erro`). */
  falhas: TabelaFrota[];
  erro: string | null;
  /** Volta a ler tudo. */
  recarregar: () => void;
}

/**
 * Todas as tabelas da Frota da organização ativa, juntas no retrato `F`. Cada tabela é uma consulta com chave própria
 * (["frota", org, tabela]), para as ações invalidarem só o que mudou. `tabelas` limita o que se lê (os contadores do
 * menu só precisam de viaturas, condutores e ocorrências).
 */
export function useDadosFrota(opcoes?: { enabled?: boolean; tabelas?: readonly TabelaFrota[] }): EstadoDadosFrota {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const ativo = (opcoes?.enabled ?? true) && !!org;
  const lista = opcoes?.tabelas ?? TABELAS_FROTA;
  const hoje = hojeFrota();
  const res = useQueries({
    queries: lista.map((t) => ({
      queryKey: frotaKeys.tabela(org, t),
      queryFn: () => LEITORES[t](org as string, hoje),
      enabled: ativo,
      staleTime: 30_000,
      retry: 1,
    })),
  });
  const versao = res.map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}:${r.status}`).join(",");
  return useMemo(() => {
    const F = frotaVazia(org ?? "", hoje);
    const falhas: TabelaFrota[] = [];
    let erro: string | null = null;
    lista.forEach((t, i) => {
      const r = res[i];
      if (r?.data) (F as unknown as Record<string, unknown>)[CAMPO[t]] = r.data;
      if (r?.error) {
        falhas.push(t);
        erro ??= (r.error as { message?: string }).message ?? "Erro a ler a Frota.";
      }
    });
    if (falhas.length) captureFlowError(new Error(`frota: falharam ${falhas.join(", ")}: ${erro}`), "fleet-load");
    return {
      F, org, falhas, erro,
      carregando: ativo && res.some((r) => r.isLoading),
      recarregar: () => { for (const r of res) void r.refetch(); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, org, hoje, ativo, lista.join(",")]);
}

/* ------------------------------------------------------------------ dados de outros módulos (listas dos formulários) */

export interface Opcao { id: string; nome: string; extra?: string }
export interface ReferenciasFrota {
  fornecedores: Opcao[];
  centros: Opcao[];
  obras: (Opcao & { codigo: string; estado: string })[];
  ordens: (Opcao & { codigo: string; estado: string })[];
  armazens: WarehouseFleetColumns[];
  utilizadores: Opcao[];
}
const semFalhar = async <T,>(nome: string, f: () => Promise<T[]>): Promise<T[]> => {
  try { return await f(); } catch (e) { captureFlowError(e instanceof Error ? new Error(`frota ${nome}: ${e.message}`) : e, "fleet-load"); return []; }
};
const LEITORES_REF: { [K in keyof ReferenciasFrota]: (org: string) => Promise<ReferenciasFrota[K]> } = {
  fornecedores: (org) => semFalhar("fornecedores", async () =>
    (await correr<{ id: string; name: string }>(tabela("suppliers").select("id, name").eq("organization_id", org).is("deleted_at", null).order("name").limit(1000)))
      .map((s) => ({ id: s.id, nome: s.name }))),
  centros: (org) => semFalhar("centros", async () =>
    (await correr<{ id: string; nome: string; codigo: string }>(tabela("ops_centro_custo").select("id, nome, codigo").eq("organization_id", org).eq("ativo", true).order("nome")))
      .map((c) => ({ id: c.id, nome: c.nome, extra: c.codigo }))),
  obras: (org) => semFalhar("obras", async () =>
    (await correr<{ id: string; codigo: string; titulo: string; estado: string }>(tabela("ops_obra").select("id, codigo, titulo, estado").eq("organization_id", org).order("criada_em", { ascending: false }).limit(300)))
      .map((o) => ({ id: o.id, nome: o.titulo, codigo: o.codigo, estado: o.estado }))),
  ordens: (org) => semFalhar("ordens", async () =>
    (await correr<{ id: string; codigo: string; titulo: string; estado: string }>(tabela("ops_ordem").select("id, codigo, titulo, estado").eq("organization_id", org).order("criada_em", { ascending: false }).limit(300)))
      .map((o) => ({ id: o.id, nome: o.titulo, codigo: o.codigo, estado: o.estado }))),
  armazens: (org) => semFalhar("armazens", () =>
    correr<WarehouseFleetColumns>(tabela("warehouses").select("id, name, code, is_active, is_vehicle, serves_customers").eq("organization_id", org).is("deleted_at", null).order("name"))),
  utilizadores: (org) => semFalhar("utilizadores", async () => {
    const m = await correr<{ user_id: string }>(tabela("anew_memberships").select("user_id").eq("organization_id", org).eq("status", "active"));
    const ids = [...new Set(m.map((x) => x.user_id))].slice(0, 500);
    if (!ids.length) return [];
    return (await correr<{ id: string; name: string | null; email: string | null }>(tabela("anew_users").select("id, name, email").in("id", ids).is("deleted_at", null).order("name")))
      .map((u) => ({ id: u.id, nome: u.name || u.email || "Utilizador" }));
  }),
};

/** Uma lista de outro módulo (fornecedores, centros de custo, obras, ordens, armazéns, utilizadores). Sem acesso: lista vazia. */
export function useReferenciaFrota<K extends keyof ReferenciasFrota>(k: K, enabled = true): { dados: ReferenciasFrota[K]; carregando: boolean } {
  const { activeCompany } = useCompany();
  const org = activeCompany?.id ?? null;
  const q = useQuery({
    queryKey: frotaKeys.ref(org, k),
    queryFn: () => LEITORES_REF[k](org as string),
    enabled: enabled && !!org,
    staleTime: 5 * 60_000,
  });
  return { dados: (q.data ?? []) as ReferenciasFrota[K], carregando: q.isLoading && enabled && !!org };
}

/* ------------------------------------------------------------------ o que cada ação invalida */

export type AcaoFrota =
  | "nova" | "estado" | "atribuir" | "devolver" | "cancelarReserva" | "km" | "abastecer" | "despesa" | "importar" | "manut" | "concluir"
  | "ocorrencia" | "identificar" | "resolver" | "renovar" | "minimo" | "pedirReposicao" | "satisfazerReposicao" | "cancelarReposicao"
  | "ligar" | "lancarCusto" | "condutor" | "editar" | "rever";

/**
 * As tabelas que cada RPC escreve (lidas do SQL). "atividade" vai em todas as que chamam fn_fleet_log. Invalidar estas
 * chaves refaz as leituras de todos os ecrãs que as mostram (o mapa "ação → ecrãs" do plano, secção 6).
 */
export const INVALIDA: Record<AcaoFrota, readonly TabelaFrota[]> = {
  nova: ["viaturas", "leituras", "vencimentos", "stock", "atividade"],
  estado: ["viaturas", "atribuicoes", "pedidos", "stock", "atividade"],
  atribuir: ["atribuicoes", "viaturas", "leituras", "atividade"],
  devolver: ["atribuicoes", "viaturas", "leituras", "ocorrencias", "atividade"],
  cancelarReserva: ["atribuicoes", "viaturas", "atividade"],
  km: ["viaturas", "leituras", "atividade"],
  abastecer: ["custos", "viaturas", "leituras", "atividade"],
  despesa: ["custos", "atividade"],
  importar: ["custos", "importacoes", "viaturas", "leituras", "atividade"],
  manut: ["manutencoes", "ocorrencias", "atividade"],
  concluir: ["manutencoes", "viaturas", "leituras", "vencimentos", "custos", "atividade"],
  ocorrencia: ["ocorrencias", "atividade"],
  identificar: ["ocorrencias", "atividade"],
  resolver: ["ocorrencias", "atividade"],
  renovar: ["vencimentos", "viaturas", "custos", "atividade"],
  minimo: ["stock"],
  pedirReposicao: ["pedidos", "atividade"],
  satisfazerReposicao: ["pedidos", "stock", "atividade"],
  cancelarReposicao: ["pedidos"],
  ligar: ["ligacoes", "atividade"],
  lancarCusto: ["ligacoes", "atividade"],
  condutor: ["condutores", "viaturas", "atividade"],
  // rpc_fleet_update_vehicle: a ficha (fleet_vehicles) e o plano de revisão, que a vista fleet_v_vehicles junta
  editar: ["viaturas", "atividade"],
  // rpc_fleet_review_expense (proposta): a linha do extrato, o contador da importação e, se os km subirem, a viatura
  rever: ["custos", "importacoes", "viaturas", "leituras", "atividade"],
};

/** As chaves de outros módulos que cada ação mexe (Inventário, Notificações, Agenda/armazéns). */
export function chavesExternas(acao: AcaoFrota, org: string): readonly (readonly unknown[])[] {
  const inv = [inventoryTodayQueryKey(org), ["inventory-today-warehouses"], ["warehouses-stock-stats"]] as const;
  switch (acao) {
    case "nova": case "estado": return [...inv, frotaKeys.ref(org, "armazens")];
    case "satisfazerReposicao": return [...inv, ["stock-movements"]];
    case "identificar": case "resolver": return [["notifications"], frotaKeys.alertas(org)];
    // o comprovativo anexado entra em documents (entity_type='vehicle'): a ficha › Documentos volta a ler
    case "renovar": return [["notifications"], frotaKeys.alertas(org), ["documents", "vehicle"]];
    default: return [];
  }
}

/** Invalida as consultas que a ação mexeu: as tabelas da Frota e as dos módulos ligados. */
export async function invalidarFrota(qc: QueryClient, org: string, acao: AcaoFrota): Promise<void> {
  await Promise.all([
    ...INVALIDA[acao].map((t) => qc.invalidateQueries({ queryKey: frotaKeys.tabela(org, t) })),
    ...chavesExternas(acao, org).map((k) => qc.invalidateQueries({ queryKey: [...k] })),
  ]);
}
