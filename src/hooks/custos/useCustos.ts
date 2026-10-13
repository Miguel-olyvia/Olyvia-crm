// Dados da área de custos (tabelas e RPCs de 20261214110000_area_custos.sql).
// As tabelas novas ainda não estão em src/integrations/supabase/types.ts:
// quando os tipos forem gerados de novo, tirar o cast `db`.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParametrosCusto, VerificacaoMargem } from "@/lib/custos";

const db = supabase as any;

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export interface PerfilLinha {
  id: string;
  nome: string;
  salario_base: number | null;
  encargos_pct: number | null;
  custo_hora_manual: number | null;
  custo_hora: number | null;
  ativo: boolean;
  ordem: number;
  servicos_em_uso: number;
  salario_visivel: boolean;
}
export interface Equipamento {
  id: string;
  nome: string;
  compra: number;
  vida_util_horas: number;
  residual: number;
  manutencao_anual: number;
  uso_horas_ano: number;
  ativo: boolean;
}
export interface ItemEstruturaLinha {
  id: string;
  descricao: string;
  categoria: string;
  valor_mensal: number;
  ativo: boolean;
}
export interface MargemLinha {
  id: string;
  service_category_id: string;
  margem_minima: number;
  margem_alvo: number;
}
export interface CategoriaServico {
  id: string;
  name: string;
  parent_id: string | null;
}
export interface ServicoSimples {
  id: string;
  name: string;
  service_category_id: string | null;
}
export interface ResumoCustos {
  estrutura_mensal: number;
  estrutura_hora: number | null;
  custo_hora_medio: number | null;
  parametros: ParametrosCusto & { organization_id: string };
}
export interface PedidoAprovacao {
  id: string;
  quote_id: string;
  quote_number: string | null;
  titulo: string | null;
  total: number | null;
  margem: number | null;
  margem_minima: number | null;
  margem_linha_min: number | null;
  motivo: string;
  estado: "pendente" | "aprovada" | "recusada" | "anulada";
  pedida_em: string;
  pedida_por: string | null;
  decidida_em: string | null;
  decidida_por: string | null;
  motivo_decisao: string | null;
  alertas: VerificacaoMargem["alertas"];
}

export const chaveCustos = (org: string | undefined, ...resto: string[]) => ["custos", org ?? "-", ...resto];

export function useResumoCustos(org?: string) {
  return useQuery({
    queryKey: chaveCustos(org, "resumo"),
    enabled: !!org,
    queryFn: () => ok<ResumoCustos>(db.rpc("rpc_custos_resumo", { p_org: org })),
  });
}

export function usePerfis(org?: string) {
  return useQuery({
    queryKey: chaveCustos(org, "perfis"),
    enabled: !!org,
    queryFn: async () => (await ok<PerfilLinha[] | null>(db.rpc("rpc_custos_perfis", { p_org: org }))) ?? [],
  });
}

function useTabela<T>(org: string | undefined, tabela: string, ordem: string) {
  return useQuery({
    queryKey: chaveCustos(org, tabela),
    enabled: !!org,
    queryFn: async () =>
      (await ok<T[] | null>(db.from(tabela).select("*").eq("organization_id", org).order(ordem))) ?? [],
  });
}
export const useEquipamentos = (org?: string) => useTabela<Equipamento>(org, "cost_equipment", "nome");
export const useEstrutura = (org?: string) => useTabela<ItemEstruturaLinha>(org, "cost_structure_items", "created_at");
export const useMargensLinha = (org?: string) => useTabela<MargemLinha>(org, "service_line_margins", "updated_at");

export function useCategoriasServico(org?: string) {
  return useQuery({
    queryKey: chaveCustos(org, "categorias"),
    enabled: !!org,
    queryFn: async () =>
      (await ok<CategoriaServico[] | null>(
        db.from("service_categories").select("id, name, parent_id")
          .eq("organization_id", org).eq("is_deleted", false).order("name"),
      )) ?? [],
  });
}

export function useServicosOrg(org?: string) {
  return useQuery({
    queryKey: chaveCustos(org, "servicos"),
    enabled: !!org,
    queryFn: async () =>
      (await ok<ServicoSimples[] | null>(
        db.from("services").select("id, name, service_category_id")
          .eq("organization_id", org).eq("is_deleted", false).order("name"),
      )) ?? [],
  });
}

export function useAprovacoes(org?: string, estado: string | null = "pendente") {
  return useQuery({
    queryKey: chaveCustos(org, "aprovacoes", estado ?? "todas"),
    enabled: !!org,
    queryFn: async () =>
      (await ok<PedidoAprovacao[] | null>(db.rpc("rpc_margem_aprovacoes", { p_org: org, p_estado: estado }))) ?? [],
  });
}

/** Uma mutação genérica que invalida a área de custos da organização no fim. */
export function useGravarCustos<A>(org: string | undefined, fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: ["custos", org ?? "-"] }),
  });
}

export const custosApi = {
  guardarParametros: (org: string, valores: Partial<ParametrosCusto>) =>
    ok(db.from("cost_parameters").upsert({ organization_id: org, ...valores }, { onConflict: "organization_id" })),

  guardarPerfil: (org: string, p: {
    id: string | null; nome: string; salario?: number | null; mudarSalario: boolean;
    encargos_pct: number | null; custo_hora_manual: number | null; ativo: boolean;
  }) =>
    ok(db.rpc("rpc_custos_perfil_guardar", {
      p_org: org, p_id: p.id, p_nome: p.nome, p_salario: p.salario ?? null, p_mudar_salario: p.mudarSalario,
      p_encargos_pct: p.encargos_pct, p_custo_hora_manual: p.custo_hora_manual, p_ativo: p.ativo,
    })),
  apagarPerfil: (id: string) => ok(db.rpc("rpc_custos_perfil_apagar", { p_id: id })),

  inserir: (tabela: string, linha: Record<string, unknown>) => ok(db.from(tabela).insert(linha)),
  mudar: (tabela: string, id: string, valores: Record<string, unknown>) => ok(db.from(tabela).update(valores).eq("id", id)),
  apagar: (tabela: string, id: string) => ok(db.from(tabela).delete().eq("id", id)),

  guardarMargemLinha: (org: string, categoria: string, minima: number, alvo: number) =>
    ok(db.from("service_line_margins").upsert(
      { organization_id: org, service_category_id: categoria, margem_minima: minima, margem_alvo: alvo },
      { onConflict: "organization_id,service_category_id" },
    )),

  decidir: (id: string, decisao: "aprovada" | "recusada", motivo: string | null) =>
    ok(db.rpc("rpc_margem_decidir", { p_aprovacao_id: id, p_decisao: decisao, p_motivo: motivo })),

  verificarMargem: (quoteId: string) => ok<VerificacaoMargem>(db.rpc("rpc_margem_verificar", { p_quote_id: quoteId })),
  pedirAprovacao: (quoteId: string, motivo: string) =>
    ok<string>(db.rpc("rpc_margem_pedir_aprovacao", { p_quote_id: quoteId, p_motivo: motivo })),
};

/* ── Receita de um serviço ────────────────────────────────────────────────── */

export interface CustoServicoRpc {
  service_id: string;
  servico: string;
  tem_receita: boolean;
  medida: string | null;
  horas?: number;
  mao_obra?: number;
  equipamentos?: number;
  consumiveis?: number;
  estrutura?: number;
  estrutura_hora?: number;
  somar_estrutura?: boolean;
  custo_por_medida: number | null;
  preco_tabela: number | null;
  margem: number | null;
  margem_minima: number;
  margem_alvo: number;
  origem_margem: "linha" | "linha_mae" | "geral";
  preco_sugerido?: number | null;
  avisos: { tipo: string; nivel: string; mensagem: string }[];
}

export interface ReceitaCompleta {
  receita: { id: string; organization_id: string; service_id: string; medida: string; notas: string | null } | null;
  maoObra: { id: string; perfil_id: string; descricao: string | null; horas_por_medida: number; ordem: number }[];
  equipamentos: { id: string; equipamento_id: string; horas_por_medida: number; ordem: number }[];
  consumiveis: {
    id: string; descricao: string | null; unidade: string | null; quantidade_por_medida: number;
    preco_unitario: number | null; preco_atualizado_em: string | null; catalog_item_id: string | null; ordem: number;
  }[];
}

export function useServico(id?: string) {
  return useQuery({
    queryKey: ["custos-servico", id ?? "-", "servico"],
    enabled: !!id,
    queryFn: () =>
      ok<{ id: string; name: string; organization_id: string; service_category_id: string | null } | null>(
        db.from("services").select("id, name, organization_id, service_category_id").eq("id", id).maybeSingle(),
      ),
  });
}

export function useCustoServico(id?: string) {
  return useQuery({
    queryKey: ["custos-servico", id ?? "-", "custo"],
    enabled: !!id,
    queryFn: () => ok<CustoServicoRpc | null>(db.rpc("rpc_custo_servico", { p_service_id: id, p_quantidade: 1 })),
  });
}

export function useReceita(id?: string) {
  return useQuery({
    queryKey: ["custos-servico", id ?? "-", "receita"],
    enabled: !!id,
    queryFn: async (): Promise<ReceitaCompleta> => {
      const receita = await ok<ReceitaCompleta["receita"]>(
        db.from("service_recipes").select("*").eq("service_id", id).maybeSingle(),
      );
      if (!receita) return { receita: null, maoObra: [], equipamentos: [], consumiveis: [] };
      const [maoObra, equipamentos, consumiveis] = await Promise.all([
        ok<ReceitaCompleta["maoObra"]>(db.from("service_recipe_labor").select("*").eq("recipe_id", receita.id).order("ordem")),
        ok<ReceitaCompleta["equipamentos"]>(db.from("service_recipe_equipment").select("*").eq("recipe_id", receita.id).order("ordem")),
        ok<ReceitaCompleta["consumiveis"]>(db.from("service_recipe_consumables").select("*").eq("recipe_id", receita.id).order("ordem")),
      ]);
      return { receita, maoObra: maoObra ?? [], equipamentos: equipamentos ?? [], consumiveis: consumiveis ?? [] };
    },
  });
}

export function useGravarReceita<A>(serviceId: string | undefined, fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: ["custos-servico", serviceId ?? "-"] }),
  });
}
