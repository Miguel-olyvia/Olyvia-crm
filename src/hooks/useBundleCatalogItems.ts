import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgSubtree } from "@/lib/orgSubtree";

const PAGE_SIZE = 30;

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
  const [itemType, setItemType] = useState<'product' | 'service'>('product');
  const [searchTerm, setSearchTerm] = useState("");

  const offsetRef = useRef(0);
  const cacheRef = useRef<Record<string, CacheEntry>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const orgIdsRef = useRef<string[] | null>(null);

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

    try {
      const searchLower = search.trim().toLowerCase();
      let fetchedItems: CatalogItem[] = [];
      let totalFetched = 0;

      // Resolve org list (descendant subtree); fall back to single companyId if not yet ready
      const orgIds = orgIdsRef.current && orgIdsRef.current.length > 0
        ? orgIdsRef.current
        : [companyId];

      if (type === 'product') {
        let query = supabase
          .from("products")
          .select(`
            id, name, sku,
            product_prices!inner(price, price_type)
          `)
          .in("organization_id", orgIds)
          .eq("is_active", true)
          .eq("status", "active")
          .is("deleted_at", null)
          .eq("product_prices.price_type", "retail")
          .order("name")
          .range(offset, offset + PAGE_SIZE - 1);

        if (searchLower) {
          query = query.or(`name.ilike.%${searchLower}%,sku.ilike.%${searchLower}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        fetchedItems = (data || []).map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          type: 'product' as const,
          retail_price: (p.product_prices as any)?.[0]?.price || 0,
        }));
        totalFetched = data?.length || 0;
      } else {
        // Services - fetch services first, then batch load prices
        const servicesQuery = supabase
          .from("services")
          .select("id, name")
          .in("organization_id", orgIds)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name")
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

      const newHasMore = totalFetched === PAGE_SIZE;

      if (append) {
        setItems(prev => [...prev, ...fetchedItems]);
      } else {
        setItems(fetchedItems);
        // Update cache for initial loads
        cacheRef.current[cacheKey] = {
          items: fetchedItems,
          hasMore: newHasMore,
          timestamp: Date.now(),
        };
      }

      setHasMore(newHasMore);
      offsetRef.current = offset + totalFetched;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error loading catalog items:', error);
      }
    } finally {
      setLoading(false);
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
    itemType,
    searchTerm,
    loadMore,
    refresh,
    changeType,
    changeSearch,
    clearCache,
  };
}
