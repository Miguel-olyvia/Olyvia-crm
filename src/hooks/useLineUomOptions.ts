import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  buildLineUomOptions,
  pickDefaultLineUomOption,
  type LineUomOption,
  type UomCatalogRow,
} from "@/utils/quotes/lineUom";

// Seletor "Unidade" das linhas de venda (orçamentos, orçamentos inline, venda
// direta, encomenda de cliente manual). Carrega:
//  - as uoms ativas visíveis (globais + da empresa ativa — mesmo filtro de
//    Products.tsx), em cache partilhada entre ecrãs;
//  - a unidade (products.uom_id) e a unidade de venda por omissão
//    (products.sale_uom_id) dos produtos presentes nas linhas.
// A RLS de `uom`/`products` continua a ser quem decide o que se vê.

const STALE_TIME = 5 * 60 * 1000;
const BATCH_SIZE = 200;

interface ProductUnits {
  uom_id: string | null;
  sale_uom_id: string | null;
}

type ProductUnitsMap = Record<string, ProductUnits>;

/** Resolve a unidade de venda por omissão de um produto (null = à unidade). */
export type DefaultLineUomResolver = (productId: string | null | undefined) => LineUomOption | null;

const uniqueSortedIds = (productIds: Array<string | null | undefined>): string[] =>
  Array.from(new Set(productIds.filter((id): id is string => !!id))).sort();

async function fetchUomCatalog(orgId: string | null): Promise<UomCatalogRow[]> {
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
}

async function fetchProductUnits(ids: string[]): Promise<ProductUnitsMap> {
  const map: ProductUnitsMap = {};
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    // `as any`: sale_uom_id ainda não está no types.ts gerado.
    let { data, error } = await (supabase as any)
      .from("products")
      .select("id, uom_id, sale_uom_id")
      .in("id", batch);
    if (error) {
      // Coluna ainda inexistente (BD atrás do frontend): o seletor continua a
      // funcionar como antes, só sem unidade de venda por omissão.
      ({ data, error } = await supabase.from("products").select("id, uom_id").in("id", batch));
      if (error) throw error;
    }
    for (const row of (data || []) as Array<{ id: string; uom_id: string | null; sale_uom_id?: string | null }>) {
      map[row.id] = { uom_id: row.uom_id ?? null, sale_uom_id: row.sale_uom_id ?? null };
    }
  }
  return map;
}

export function useLineUomOptions(productIds: Array<string | null | undefined>) {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id ?? null;

  const ids = uniqueSortedIds(productIds);
  const idsKey = ids.join(",");

  const catalogQueryKey = ["line-uom-catalog", orgId] as const;

  const { data: uoms = [] } = useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => fetchUomCatalog(orgId),
    staleTime: STALE_TIME,
  });

  const { data: productUnits = {} } = useQuery({
    queryKey: ["line-uom-products", idsKey],
    queryFn: () => fetchProductUnits(ids),
    enabled: ids.length > 0,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });

  /** Opções para o produto; só devolve algo quando há pelo menos uma embalagem. */
  const getOptions = (productId: string | null | undefined): LineUomOption[] => {
    if (!productId) return [];
    const options = buildLineUomOptions(productUnits[productId]?.uom_id, uoms);
    return options.length > 1 ? options : [];
  };

  /** Código da unidade de stock do produto (ex. "un"), para "= 20 un". */
  const getBaseCode = (productId: string | null | undefined): string | null => {
    if (!productId) return null;
    const uomId = productUnits[productId]?.uom_id;
    return uoms.find((u) => u.id === uomId)?.code ?? null;
  };

  /**
   * Unidade de venda por omissão (products.sale_uom_id) de um produto já
   * presente nas linhas — null quando se vende à unidade ou a embalagem não
   * está entre as opções.
   */
  const getDefaultOption: DefaultLineUomResolver = (productId) => {
    if (!productId) return null;
    const units = productUnits[productId];
    if (!units) return null;
    return pickDefaultLineUomOption(buildLineUomOptions(units.uom_id, uoms), units.sale_uom_id);
  };

  /**
   * Para linhas ACABADAS DE CRIAR: carrega (ou lê da cache) a unidade dos
   * produtos indicados e devolve um resolvedor síncrono. Nunca rejeita — em
   * erro devolve um resolvedor que diz sempre "à unidade", e a linha nasce
   * como antes.
   */
  const loadDefaultOptions = async (
    newProductIds: Array<string | null | undefined>,
  ): Promise<DefaultLineUomResolver> => {
    const wanted = uniqueSortedIds(newProductIds);
    if (wanted.length === 0) return () => null;
    try {
      const [catalog, units] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: catalogQueryKey,
          queryFn: () => fetchUomCatalog(orgId),
          staleTime: STALE_TIME,
        }),
        queryClient.fetchQuery({
          queryKey: ["line-uom-products", wanted.join(",")],
          queryFn: () => fetchProductUnits(wanted),
          staleTime: STALE_TIME,
        }),
      ]);
      return (productId) => {
        if (!productId) return null;
        const row = units[productId];
        if (!row) return null;
        return pickDefaultLineUomOption(buildLineUomOptions(row.uom_id, catalog), row.sale_uom_id);
      };
    } catch (error) {
      console.error("Erro ao carregar a unidade de venda por omissão:", error);
      return () => null;
    }
  };

  return { getOptions, getBaseCode, getDefaultOption, loadDefaultOptions };
}
