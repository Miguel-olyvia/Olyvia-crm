import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { buildLineUomOptions, type LineUomOption, type UomCatalogRow } from "@/utils/quotes/lineUom";

// Seletor "Unidade" das linhas de venda (orçamentos, orçamentos inline, venda
// direta, encomenda de cliente manual). Carrega:
//  - as uoms ativas visíveis (globais + da empresa ativa — mesmo filtro de
//    Products.tsx), em cache partilhada entre ecrãs;
//  - a unidade (products.uom_id) dos produtos presentes nas linhas.
// A RLS de `uom`/`products` continua a ser quem decide o que se vê.

const STALE_TIME = 5 * 60 * 1000;
const BATCH_SIZE = 200;

export function useLineUomOptions(productIds: Array<string | null | undefined>) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const ids = Array.from(new Set(productIds.filter((id): id is string => !!id))).sort();
  const idsKey = ids.join(",");

  const { data: uoms = [] } = useQuery({
    queryKey: ["line-uom-catalog", orgId],
    queryFn: async (): Promise<UomCatalogRow[]> => {
      let query = supabase
        .from("uom")
        .select("id, code, description, base_uom_id, conversion_factor")
        .eq("is_active", true)
        .order("code");
      query = orgId
        ? query.or(`organization_id.eq.${orgId},organization_id.is.null`)
        : query.is("organization_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as UomCatalogRow[];
    },
    staleTime: STALE_TIME,
  });

  const { data: productUoms = {} } = useQuery({
    queryKey: ["line-uom-products", idsKey],
    queryFn: async (): Promise<Record<string, string | null>> => {
      const map: Record<string, string | null> = {};
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.from("products").select("id, uom_id").in("id", batch);
        if (error) throw error;
        for (const row of data || []) map[row.id] = row.uom_id ?? null;
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });

  /** Opções para o produto; só devolve algo quando há pelo menos uma embalagem. */
  const getOptions = (productId: string | null | undefined): LineUomOption[] => {
    if (!productId) return [];
    const options = buildLineUomOptions(productUoms[productId], uoms);
    return options.length > 1 ? options : [];
  };

  /** Código da unidade de stock do produto (ex. "un"), para "= 20 un". */
  const getBaseCode = (productId: string | null | undefined): string | null => {
    if (!productId) return null;
    const uomId = productUoms[productId];
    return uoms.find((u) => u.id === uomId)?.code ?? null;
  };

  return { getOptions, getBaseCode };
}
