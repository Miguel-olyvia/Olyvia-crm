import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SuggestionSourceField = "area_m2" | "demolir" | "proteger" | "intervencao";
export type SuggestionQuantityFormulaType = "multiplier" | "fixed" | "per_unit_area";
export type SuggestionRounding = "ceil" | "floor" | "round" | "none";
export type SuggestionTargetType = "product" | "service" | "catalog_item";
export type DiagnosticPhase = "fase_1" | "fase_2";

export interface QuoteSuggestionRule {
  id: string;
  organization_id: string;
  phase: DiagnosticPhase;
  name: string;
  source_field: SuggestionSourceField;
  intervention_type: string | null;
  match_keyword: string | null;
  quantity_formula_type: SuggestionQuantityFormulaType;
  quantity_multiplier: number | null;
  quantity_fixed: number | null;
  rounding: SuggestionRounding;
  target_type: SuggestionTargetType;
  product_id: string | null;
  service_id: string | null;
  catalog_item_id: string | null;
  default_qt_unit: string | null;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuoteSuggestionRuleInput = Omit<
  QuoteSuggestionRule,
  "id" | "created_by" | "created_at" | "updated_at"
>;

const rulesQueryKey = (organizationId: string | null | undefined) =>
  ["quote-suggestion-rules", organizationId] as const;

export function useQuoteSuggestionRulesAdmin(organizationId: string | null | undefined) {
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: rulesQueryKey(organizationId),
    queryFn: async (): Promise<QuoteSuggestionRule[]> => {
      const { data, error } = await supabase
        .from("quote_suggestion_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("priority", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as QuoteSuggestionRule[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: rulesQueryKey(organizationId) });

  const createRule = useMutation({
    mutationFn: async (rule: QuoteSuggestionRuleInput) => {
      const { data, error } = await supabase.from("quote_suggestion_rules").insert(rule).select().single();
      if (error) throw error;
      return data as QuoteSuggestionRule;
    },
    onSuccess: invalidate,
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...rule }: Partial<QuoteSuggestionRuleInput> & { id: string }) => {
      const { data, error } = await supabase.from("quote_suggestion_rules").update(rule).eq("id", id).select().single();
      if (error) throw error;
      return data as QuoteSuggestionRule;
    },
    onSuccess: invalidate,
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quote_suggestion_rules").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: invalidate,
  });

  return {
    rules: rulesQuery.data || [],
    isLoadingRules: rulesQuery.isLoading,
    rulesError: rulesQuery.error as Error | null,
    createRule: createRule.mutateAsync,
    isCreatingRule: createRule.isPending,
    updateRule: updateRule.mutateAsync,
    isUpdatingRule: updateRule.isPending,
    deleteRule: deleteRule.mutateAsync,
    isDeletingRule: deleteRule.isPending,
  };
}
