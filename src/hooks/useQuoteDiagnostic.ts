import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// TODO: remover cast após regenerar types.ts — `quote_diagnostic_areas` e as
// RPCs `rpc_save_diagnostic_area`/`rpc_complete_diagnostic_phase1` ainda não
// existem em src/integrations/supabase/types.ts (migração em curso, em
// paralelo, noutro agente).
const sb = supabase as any;

export type DiagnosticPhase = "fase_1" | "fase_2";
export type DiagnosticAreaStatus = "em_preenchimento" | "completo";

export interface QuoteDiagnosticArea {
  id: string;
  quote_id: string;
  organization_id: string | null;
  phase: DiagnosticPhase;
  nome_area: string;
  area_m2: number | null;
  demolir_descricao: string | null;
  demolir_m2: number | null;
  proteger_descricao: string | null;
  intervencao_tipo: string | null;
  intervencao_descricao: string | null;
  status: DiagnosticAreaStatus;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveDiagnosticAreaInput {
  id?: string | null;
  organization_id?: string | null;
  phase?: DiagnosticPhase;
  nome_area?: string;
  area_m2?: number | null;
  demolir_descricao?: string | null;
  demolir_m2?: number | null;
  proteger_descricao?: string | null;
  intervencao_tipo?: string | null;
  intervencao_descricao?: string | null;
  status?: DiagnosticAreaStatus;
  sort_order?: number;
}

const areasQueryKey = (quoteId: string | null | undefined) => ["quote-diagnostic-areas", quoteId] as const;

/**
 * Estado das áreas de diagnóstico (Fase 1) de um orçamento, mais as mutações
 * para as gravar e para concluir a fase.
 *
 * Não deriva aqui `isPhase1Complete` a partir de `quotes.diagnostic_phase1_completed_at`
 * — o QuoteBuilder já carrega a linha do orçamento via `fetchQuote()` (estado
 * local, não TanStack Query), por isso essa leitura fica lá, para não a
 * duplicar. `completePhase1()` só invalida a lista de áreas aqui; é o
 * `onSuccess`/callback no QuoteBuilder que atualiza o seu próprio estado local
 * de "fase 1 completa".
 */
export function useQuoteDiagnostic(quoteId: string | null | undefined) {
  const queryClient = useQueryClient();

  const areasQuery = useQuery({
    queryKey: areasQueryKey(quoteId),
    queryFn: async (): Promise<QuoteDiagnosticArea[]> => {
      const { data, error } = await sb
        .from("quote_diagnostic_areas")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as QuoteDiagnosticArea[];
    },
    enabled: !!quoteId,
  });

  const invalidateAreas = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: areasQueryKey(quoteId) });
  }, [queryClient, quoteId]);

  const saveAreaMutation = useMutation({
    mutationFn: async (areaData: SaveDiagnosticAreaInput) => {
      if (!quoteId) throw new Error("quoteId em falta ao gravar área de diagnóstico.");
      const { id, ...rest } = areaData;
      const { data, error } = await sb.rpc("rpc_save_diagnostic_area", {
        p_quote_id: quoteId,
        p_area_id: id || null,
        p_area_data: rest,
      });
      if (error) throw error;
      return data as QuoteDiagnosticArea;
    },
    onSuccess: () => {
      invalidateAreas();
    },
  });

  const completePhase1Mutation = useMutation({
    mutationFn: async () => {
      if (!quoteId) throw new Error("quoteId em falta ao concluir a fase 1.");
      const { data, error } = await sb.rpc("rpc_complete_diagnostic_phase1", {
        p_quote_id: quoteId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateAreas();
      // Não há query própria de `quotes` neste ficheiro para invalidar — o
      // QuoteBuilder guarda diagnostic_phase1_completed_at em estado local e
      // atualiza-o no callback onPhase1Complete que passa a este hook.
    },
  });

  const areas = (areasQuery.data || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const totalAreas = areas.length;
  const completeAreas = areas.filter((a) => a.status === "completo").length;
  const allAreasComplete = totalAreas > 0 && completeAreas === totalAreas;

  return {
    areas,
    isLoadingAreas: areasQuery.isLoading,
    areasError: areasQuery.error as Error | null,
    refetchAreas: areasQuery.refetch,
    saveArea: saveAreaMutation.mutateAsync,
    isSavingArea: saveAreaMutation.isPending,
    completePhase1: completePhase1Mutation.mutateAsync,
    isCompletingPhase1: completePhase1Mutation.isPending,
    totalAreas,
    completeAreas,
    allAreasComplete,
  };
}
