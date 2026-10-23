import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Código da unidade de stock (products.uom_id → uom.code) dos produtos
// presentes nas linhas. Serve para decidir se a quantidade tem de ser inteira
// (requiresIntegerQty em @/utils/quotes/integerQty). A RLS de products/uom
// continua a decidir o que se vê; um produto que não venha fica sem código
// (quantidade decimal permitida, como antes).

const STALE_TIME = 5 * 60 * 1000;
const BATCH_SIZE = 200;

export function useProductBaseUomCodes(productIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id))).sort();
  const idsKey = ids.join(",");

  const { data: codes = {} } = useQuery({
    queryKey: ["product-base-uom-codes", idsKey],
    queryFn: async (): Promise<Record<string, string | null>> => {
      const map: Record<string, string | null> = {};
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from("products")
          .select("id, uom:uom_id(code)")
          .in("id", batch);
        if (error) throw error;
        for (const row of (data || []) as Array<{ id: string; uom: { code: string | null } | null }>) {
          map[row.id] = row.uom?.code ?? null;
        }
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });

  const getBaseCode = (productId: string | null | undefined): string | null =>
    productId ? codes[productId] ?? null : null;

  return { getBaseCode };
}
