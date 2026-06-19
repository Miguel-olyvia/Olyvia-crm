import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface PriceContext {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  organization_id: string | null;
}

export const PRICE_CONTEXT_CODES = {
  RETAIL: 'retail',
  BUNDLE: 'bundle',
  PURCHASE: 'purchase',
} as const;

export type PriceContextCode = typeof PRICE_CONTEXT_CODES[keyof typeof PRICE_CONTEXT_CODES];

export function usePriceContexts() {
  const [contexts, setContexts] = useState<PriceContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeCompany } = useCompany();

  const fetchContexts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch global contexts and company-specific contexts
      let query = supabase
        .from('price_contexts')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');

      if (activeCompany?.id) {
        query = query.or(`organization_id.is.null,organization_id.eq.${activeCompany.id}`);
      } else {
        query = query.is('organization_id', null);
      }

      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      setContexts(data || []);
    } catch (err: any) {
      console.error("Error fetching price contexts:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    fetchContexts();
  }, [fetchContexts]);

  const getContextByCode = useCallback((code: PriceContextCode): PriceContext | undefined => {
    // Prefer company-specific context, fallback to global
    const companyContext = contexts.find(c => c.code === code && c.organization_id === activeCompany?.id);
    if (companyContext) return companyContext;
    return contexts.find(c => c.code === code && c.organization_id === null);
  }, [contexts, activeCompany?.id]);

  const getDefaultContext = useCallback((): PriceContext | undefined => {
    return contexts.find(c => c.is_default);
  }, [contexts]);

  const getRetailContext = useCallback((): PriceContext | undefined => {
    return getContextByCode(PRICE_CONTEXT_CODES.RETAIL);
  }, [getContextByCode]);

  const getBundleContext = useCallback((): PriceContext | undefined => {
    return getContextByCode(PRICE_CONTEXT_CODES.BUNDLE);
  }, [getContextByCode]);

  const getPurchaseContext = useCallback((): PriceContext | undefined => {
    return getContextByCode(PRICE_CONTEXT_CODES.PURCHASE);
  }, [getContextByCode]);

  return {
    contexts,
    loading,
    error,
    refetch: fetchContexts,
    getContextByCode,
    getDefaultContext,
    getRetailContext,
    getBundleContext,
    getPurchaseContext,
  };
}

/**
 * Helper to get attribute price with context
 * Can be used directly in components or with the usePriceContexts hook
 */
export async function getAttributePriceWithContext(
  attributeId: string,
  valueOption: string,
  companyId: string | null,
  productId: string | null = null,
  contextCode: PriceContextCode = PRICE_CONTEXT_CODES.RETAIL
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_attribute_price_with_context', {
      p_attribute_id: attributeId,
      p_value_option: valueOption,
      p_organization_id: companyId,
      p_product_id: productId,
      p_context_code: contextCode
    });

    if (error) throw error;
    return data || 0;
  } catch (err) {
    console.error("Error getting attribute price with context:", err);
    return 0;
  }
}
