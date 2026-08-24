import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgSubtree } from "@/lib/orgSubtree";

const PAGE_SIZE = 30;

// Escapa caracteres com significado especial no filtro .or() do PostgREST
// (`,` separa condições, `(`/`)` delimitam grupos, `%`/`*` são wildcards do
// ilike) para que um termo de pesquisa com esses caracteres não provoque um
// erro de sintaxe do filtro (ex.: "Cadeira, Mesa (2un)").
function escapePostgrestOrTerm(term: string): string {
  return term.replace(/[%,()*]/g, " ").trim();
}

export interface CatalogItem {
  id: string;
  name: string;
  sku?: string;
  type: 'product' | 'service';
  retail_price: number;
}

interface CacheEntry {
  items: CatalogItem[];
  hasMore: boolean;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useBundleCatalogItems(companyId: string | undefined) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemType, setItemType] = useState<'product' | 'service'>('product');
  const [searchTerm, setSearchTerm] = useState("");

  const offsetRef = useRef(0);
  const cacheRef = useRef<Record<string, CacheEntry>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const orgIdsRef = useRef<string[] | null>(null);
  // Incrementado sempre que tipo/pesquisa/empresa mudam, para que o autoload
  // em cadeia de um pedido anterior saiba que ficou obsoleto e pare.
  const loadGenerationRef = useRef(0);

  // Resolve descendant orgs once per companyId so we include shared/sub-org items
  useEffect(() => {
    let cancelled = false;
    orgIdsRef.current = null;
    if (!companyId) return;
    resolveOrgSubtree(companyId).then(ids => {
      if (!cancelled) {
        orgIdsRef.current = ids && ids.length > 0 ? ids : [companyId];
      }
    }).catch(() => {
      if (!cancelled) orgIdsRef.current = [companyId];
    });
    return () => { cancelled = true; };
  }, [companyId]);

  const getCacheKey = useCallback((type: 'product' | 'service', search: string) => {
    return `${type}:${search.trim().toLowerCase()}`;
  }, []);

  const isCacheValid = useCallback((key: string) => {
    const entry = cacheRef.current[key];
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL;
  }, []);

  const loadItems = useCallback(async (
    type: 'product' | 'service',
    search: string,
    offset: number,
    append: boolean = false
  ) => {
    if (!companyId) return;

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const generation = append ? loadGenerationRef.current : ++loadGenerationRef.current;

    const cacheKey = getCacheKey(type, search);

    // Check cache for initial load
    if (offset === 0 && !append && isCacheValid(cacheKey)) {
      const cached = cacheRef.current[cacheKey];
      setItems(cached.items);
      setHasMore(cached.hasMore);
      offsetRef.current = cached.items.length;
      return;
    }

    setLoading(true);
    if (!append) setLoadError(null);

    try {
      const searchLower = search.trim().toLowerCase();
      let fetchedItems: CatalogItem[] = [];
      let totalFetched = 0;

      // Resolve org list (descendant subtree); fall back to single companyId if not yet ready
      const orgIds = orgIdsRef.current && orgIdsRef.current.length > 0
        ? orgIdsRef.current
        : [companyId];

      if (type === 'product') {
        // Não fazer o embed `product_prices!inner(...)` junto com o filtro de
        // organização/paginação: medido com EXPLAIN ANALYZE (RLS ativo), esse
        // JOIN obriga o Postgres a avaliar a política RLS de product_prices
        // (que reexecuta uma verificação de admin por LINHA) sobre TODOS os
        // produtos da organização antes de aplicar o LIMIT — 700ms a 3,6s por
        // pedido, independentemente do tamanho da página. Em vez disso,
        // paginamos só a lista de produtos e carregamos os preços à parte
        // para os IDs da página, tal como já era feito para os serviços.
        let query = supabase
          .from("products")
          .select("id, name, sku")
          .in("organization_id", orgIds)
          .eq("is_active", true)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("name")
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);

        const safeSearch = escapePostgrestOrTerm(search);
        if (safeSearch) {
          query = query.or(`name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const productsData = data || [];
        const productIds = productsData.map(p => p.id);

        const priceMap = new Map<string, number>();
        if (productIds.length > 0) {
          const { data: pricesData } = await supabase
            .from("product_prices")
            .select("product_id, price")
            .in("product_id", productIds)
            .eq("price_type", "retail");
          (pricesData || []).forEach(p => priceMap.set(p.product_id, p.price));
        }

        fetchedItems = productsData.map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          type: 'product' as const,
          retail_price: priceMap.get(p.id) || 0,
        }));
        totalFetched = productsData.length;
      } else {
        // Services - fetch services first, then batch load prices
        const servicesQuery = supabase
          .from("services")
          .select("id, name")
          .in("organization_id", orgIds)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name")
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);

        if (searchLower) {
          const { data, error } = await servicesQuery.ilike("name", `%${searchLower}%`);
          if (error) throw error;
          
          const servicesData = data || [];
          const serviceIds = servicesData.map(s => s.id);
          
          // Batch load prices for all services at once
          const { data: pricesData } = serviceIds.length > 0 
            ? await supabase
                .from("service_prices")
                .select("service_id, price")
                .in("service_id", serviceIds)
                .eq("price_type", "retail")
            : { data: [] };
          
          const priceMap = new Map((pricesData || []).map(p => [p.service_id, p.price]));
          
          fetchedItems = servicesData.map(s => ({
            id: s.id,
            name: s.name,
            type: 'service' as const,
            retail_price: priceMap.get(s.id) || 0,
          }));
          totalFetched = servicesData.length;
        } else {
          const { data, error } = await servicesQuery;
          if (error) throw error;
          
          const servicesData = data || [];
          const serviceIds = servicesData.map(s => s.id);
          
          // Batch load prices for all services at once
          const { data: pricesData } = serviceIds.length > 0 
            ? await supabase
                .from("service_prices")
                .select("service_id, price")
                .in("service_id", serviceIds)
                .eq("price_type", "retail")
            : { data: [] };
          
          const priceMap = new Map((pricesData || []).map(p => [p.service_id, p.price]));
          
          fetchedItems = servicesData.map(s => ({
            id: s.id,
            name: s.name,
            type: 'service' as const,
            retail_price: priceMap.get(s.id) || 0,
          }));
          totalFetched = servicesData.length;
        }
      }

      // Pedido de uma geração anterior (tipo/pesquisa/empresa já mudaram)
      // chegou tarde: ignora para não misturar lotes de gerações diferentes.
      if (generation !== loadGenerationRef.current) return;

      const newHasMore = totalFetched === PAGE_SIZE;

      if (append) {
        setItems(prev => {
          const next = [...prev, ...fetchedItems];
          // Cacheia a lista acumulada só quando o autoload em cadeia termina
          // (não há mais lotes), para não guardar resultados parciais.
          if (!newHasMore) {
            cacheRef.current[cacheKey] = { items: next, hasMore: newHasMore, timestamp: Date.now() };
          }
          return next;
        });
      } else {
        setItems(fetchedItems);
        if (!newHasMore) {
          cacheRef.current[cacheKey] = { items: fetchedItems, hasMore: newHasMore, timestamp: Date.now() };
        }
      }

      setHasMore(newHasMore);
      setLoadError(null);
      offsetRef.current = offset + totalFetched;

      // Autoload em cadeia: continua a pedir lotes sucessivos em segundo
      // plano (sem depender de scroll/IntersectionObserver) até não haver
      // mais itens, mostrando-os progressivamente à medida que chegam.
      if (newHasMore && generation === loadGenerationRef.current) {
        void loadItems(type, search, offset + totalFetched, true);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      if (generation !== loadGenerationRef.current) return;
      console.error('Error loading catalog items:', error);
      setLoadError(error?.message || String(error));
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [companyId, getCacheKey, isCacheValid]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    loadItems(itemType, searchTerm, offsetRef.current, true);
  }, [loading, hasMore, itemType, searchTerm, loadItems]);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    loadItems(itemType, searchTerm, 0, false);
  }, [itemType, searchTerm, loadItems]);

  const changeType = useCallback((newType: 'product' | 'service') => {
    setItemType(newType);
    offsetRef.current = 0;
    setItems([]);
    setHasMore(true);
  }, []);

  const changeSearch = useCallback((newSearch: string) => {
    setSearchTerm(newSearch);
    offsetRef.current = 0;
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current = {};
  }, []);

  // Effect to load when type or search changes
  useEffect(() => {
    if (companyId) {
      loadItems(itemType, searchTerm, 0, false);
    }
  }, [itemType, searchTerm, companyId, loadItems]);

  return {
    items,
    loading,
    hasMore,
    loadError,
    itemType,
    searchTerm,
    loadMore,
    refresh,
    changeType,
    changeSearch,
    clearCache,
  };
}
