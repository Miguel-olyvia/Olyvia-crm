import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DiagnosticSourceField = "area_m2" | "demolir" | "proteger" | "intervencao";
export type DiagnosticSuggestionTargetType = "product" | "service" | "catalog_item";

export interface DiagnosticSuggestion {
  /** Chave estável para listas/aceitar/rejeitar — gerada no cliente. */
  client_id: string;
  source: "rule" | "ai";
  rule_id?: string | null;
  target_type: DiagnosticSuggestionTargetType;
  product_id?: string | null;
  service_id?: string | null;
  catalog_item_id?: string | null;
  descricao: string;
  qty: number;
  unidade?: string | null;
  rationale?: string | null;
  confidence?: number | null;
  /** Soma de `product_stock.qty_available` para este produto (todas as
   * localizações). `null`/omitido quando não aplicável (target_type
   * diferente de "product") ou quando a query de stock falhar. */
  stockQtyAvailable?: number | null;
  /** false quando é uma sugestão informativa da IA para algo que não existe
   * no catálogo — não tem product_id/service_id reais, não pode ser aceite
   * como linha, só mostrada como aviso; true/omitido nos casos normais. */
  existsInCatalog?: boolean;
}

export interface GetDiagnosticSuggestionsInput {
  diagnosticAreaId: string;
  sourceField: DiagnosticSourceField;
  organizationId: string | null | undefined;
  areaData: {
    area_m2?: number | null;
    demolir_descricao?: string | null;
    proteger_descricao?: string | null;
    intervencao_tipo?: string | null;
    intervencao_descricao?: string | null;
  };
}

export interface GetDiagnosticSuggestionsResult {
  suggestions: DiagnosticSuggestion[];
  aiFailed: boolean;
}

/** Formato de cada linha devolvida por `rpc_preview_diagnostic_suggestions`.
 * A função tem `Returns: Json` em types.ts (retorno genérico do Postgres),
 * por isso não há um tipo de linha gerado automaticamente — este é o
 * contrato acordado com o backend para este RPC. */
interface RuleSuggestionRow {
  rule_id?: string | null;
  target_type: DiagnosticSuggestionTargetType;
  product_id?: string | null;
  service_id?: string | null;
  catalog_item_id?: string | null;
  descricao: string;
  qty: number | string;
  unidade?: string | null;
}

/** Formato de cada sugestão devolvida pela edge function `quote-ai-assistant`
 * (modo `diagnostic_suggestions`) — não vem da BD, por isso não tem tipo
 * gerado em types.ts. */
interface AiSuggestionResponseItem {
  target_type: DiagnosticSuggestionTargetType;
  product_id?: string | null;
  service_id?: string | null;
  catalog_item_id?: string | null;
  descricao: string;
  qty: number | string;
  unidade?: string | null;
  rationale?: string | null;
  confidence?: number | null;
  exists_in_catalog?: boolean;
}

let clientIdCounter = 0;
const nextClientId = (prefix: string) => `${prefix}_${Date.now()}_${++clientIdCounter}`;

/**
 * Enriquece sugestões de tipo "product" com o stock disponível
 * (`product_stock.qty_available`, somado por produto em todas as
 * localizações). Best-effort: nunca lança — se a query falhar, regista o
 * erro e devolve as sugestões originais sem `stockQtyAvailable` preenchido.
 * Único ponto de resolução de stock, usado tanto para sugestões de regra
 * como de IA.
 */
async function withStockAvailability(suggestions: DiagnosticSuggestion[]): Promise<DiagnosticSuggestion[]> {
  const productIds = Array.from(
    new Set(
      suggestions
        .filter((s) => s.target_type === "product" && s.product_id)
        .map((s) => s.product_id as string),
    ),
  );

  if (productIds.length === 0) {
    return suggestions;
  }

  try {
    const { data, error } = await supabase
      .from("product_stock")
      .select("product_id, qty_available")
      .in("product_id", productIds);
    if (error) throw error;

    const stockByProductId = new Map<string, number>();
    for (const row of data || []) {
      const current = stockByProductId.get(row.product_id) ?? 0;
      stockByProductId.set(row.product_id, current + (Number(row.qty_available) || 0));
    }

    return suggestions.map((s) =>
      s.target_type === "product" && s.product_id
        ? { ...s, stockQtyAvailable: stockByProductId.get(s.product_id) ?? 0 }
        : s,
    );
  } catch (err) {
    console.error("[useQuoteDiagnosticSuggestions] Stock availability lookup failed:", err);
    return suggestions;
  }
}

/**
 * Procura sugestões para um campo do diagnóstico: primeiro por regras
 * (rpc_preview_diagnostic_suggestions, instantâneo), e só se não houver
 * nenhuma é que recorre à IA (edge function quote-ai-assistant). A falha da
 * IA nunca bloqueia o resto do formulário — é capturada e devolvida como
 * `{ suggestions: [], aiFailed: true }`.
 */
export function useQuoteDiagnosticSuggestions() {
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isLoadingAiFallback, setIsLoadingAiFallback] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Cancela a chamada de IA anterior se uma nova for disparada antes de a
  // resposta anterior chegar (mesmo padrão de useBundleCatalogItems.ts: um
  // AbortController por pedido, abortado no arranque do seguinte).
  const abortControllerRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: GetDiagnosticSuggestionsInput): Promise<GetDiagnosticSuggestionsResult> => {
      setAiError(null);

      setIsLoadingRules(true);
      let ruleSuggestions: DiagnosticSuggestion[] = [];
      try {
        const { data, error } = await supabase.rpc("rpc_preview_diagnostic_suggestions", {
          p_diagnostic_area_id: input.diagnosticAreaId,
          p_source_field: input.sourceField,
        });
        if (error) throw error;
        // RPC devolve `Json` genérico em types.ts — ver RuleSuggestionRow.
        ruleSuggestions = ((data as RuleSuggestionRow[] | null) || []).map((s) => ({
          client_id: nextClientId("rule"),
          source: "rule" as const,
          rule_id: s.rule_id ?? null,
          target_type: s.target_type,
          product_id: s.product_id ?? null,
          service_id: s.service_id ?? null,
          catalog_item_id: s.catalog_item_id ?? null,
          descricao: s.descricao,
          qty: Number(s.qty) || 0,
          unidade: s.unidade ?? null,
        }));
      } finally {
        setIsLoadingRules(false);
      }

      if (ruleSuggestions.length > 0) {
        return { suggestions: await withStockAvailability(ruleSuggestions), aiFailed: false };
      }

      // Sem regras a corresponder — recorre à IA. Falha na etapa de regras
      // (acima) é inesperada e propaga normalmente; falha aqui é esperada e
      // não pode travar o formulário.
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoadingAiFallback(true);
      try {
        const { data, error } = await supabase.functions.invoke("quote-ai-assistant", {
          body: {
            mode: "diagnostic_suggestions",
            organization_id: input.organizationId,
            diagnostic_context: {
              source_field: input.sourceField,
              ...input.areaData,
            },
          },
          signal: controller.signal,
        });
        if (error) throw error;

        const aiSuggestions: DiagnosticSuggestion[] = ((data?.suggestions || []) as AiSuggestionResponseItem[]).map((s) => ({
          client_id: nextClientId("ai"),
          source: "ai" as const,
          target_type: s.target_type,
          product_id: s.product_id ?? null,
          service_id: s.service_id ?? null,
          catalog_item_id: s.catalog_item_id ?? null,
          descricao: s.descricao,
          qty: Number(s.qty) || 0,
          unidade: s.unidade ?? null,
          rationale: s.rationale ?? null,
          confidence: typeof s.confidence === "number" ? s.confidence : null,
          existsInCatalog: s.exists_in_catalog === false ? false : true,
        }));
        return { suggestions: await withStockAvailability(aiSuggestions), aiFailed: false };
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Um pedido mais recente já assumiu — não é um erro a mostrar.
          return { suggestions: [], aiFailed: false };
        }
        console.error("[useQuoteDiagnosticSuggestions] AI fallback failed:", err);
        setAiError(err?.message || String(err));
        return { suggestions: [], aiFailed: true };
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoadingAiFallback(false);
      }
    },
  });

  const getSuggestions = useCallback(
    (input: GetDiagnosticSuggestionsInput) => mutation.mutateAsync(input),
    [mutation],
  );

  return {
    getSuggestions,
    suggestions: mutation.data?.suggestions ?? [],
    aiFailed: mutation.data?.aiFailed ?? false,
    isLoadingRules,
    isLoadingAiFallback,
    aiError,
    reset: mutation.reset,
  };
}
