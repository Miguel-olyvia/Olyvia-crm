import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { PRICE_CONTEXT_CODES, type PriceContextCode } from "@/hooks/usePriceContexts";
import { 
  Search, Package, Wrench, Plus, Minus, Check, X, 
  ShoppingCart, Grid3X3, List, Loader2, ChevronDown, Tag, Layers
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { QuoteAIAssistant } from "./QuoteAIAssistant";
import { BundleSelectionTab, type SelectedBundle, type ExpandedBundleLine } from "./BundleSelectionTab";
import { getEffectiveProductOptionPrices } from "@/lib/product-attribute-option-prices";
import { getEffectiveProductRanges } from "@/lib/product-attribute-ranges";

interface ProductAttribute {
  id: string;
  name: string;
  code: string;
  value_type: string;
  unit: string | null;
  allowed_values: string[] | null;
  values: Array<{ id: string; value: string; rawValue?: string }>;
  pricing_type?: string;
}

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  retail_price: number | null;
  vat_rate: number | null;
  organization_id: string | null;
  type: "product" | "service";
  uom_symbol: string | null;
  uom_name: string | null;
}

// Bundle component info
interface BundleComponentInfo {
  id: string;
  name: string;
  sku: string | null;
  type: "product" | "service";
  source_id: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  selected_attributes?: Record<string, any>;
  attribute_price_addon?: number;
  choice_group_id?: string | null;
}

// Bundle info for quote lines
interface BundleInfo {
  bundle_id: string;
  bundle_sku: string;
  bundle_name: string;
  bundle_description: string | null;
  components: BundleComponentInfo[];
  total_price: number;
}

interface SelectedItem {
  item: CatalogItem;
  quantity: number;
  attributes: Record<string, string>; // attribute_id -> selected value
  fullAttributes?: Record<string, { attribute_code: string; label: string; value_type: string; unit?: string; value: string; pricing_type?: string }>; // enriched data
  attributePriceAddon?: number; // Additional price from attribute ranges (dimension pricing)
  bundleInfo?: BundleInfo; // If this item represents a bundle
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItems: (items: SelectedItem[]) => void;
  products: CatalogItem[];
  services: CatalogItem[];
  replaceMode?: boolean; // When true, selecting an item immediately replaces and closes
  replaceItemType?: "product" | "service" | "bundle"; // Which tab to show when in replace mode
  priceContext?: PriceContextCode; // 'retail' | 'bundle' - defaults to 'retail'
}

const PAGE_SIZE = 10;

export function AddItemsDialog({ open, onOpenChange, onAddItems, products: initialProducts, services: initialServices, replaceMode = false, replaceItemType, priceContext = PRICE_CONTEXT_CODES.RETAIL }: Props) {
  const [activeTab, setActiveTab] = useState<"products" | "services" | "bundles">("products");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBundles, setSelectedBundles] = useState<Map<string, SelectedBundle>>(new Map());
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [productAttributes, setProductAttributes] = useState<Map<string, ProductAttribute[]>>(new Map());
  const [loadingAttributes, setLoadingAttributes] = useState<Set<string>>(new Set());
  const [attributePriceRanges, setAttributePriceRanges] = useState<Map<string, any[]>>(new Map());
  const [attributeOptionPrices, setAttributeOptionPrices] = useState<Map<string, { attrId: string; value: string; price: number; productId: string | null; categoryId?: string | null; source?: string }[]>>(new Map());
  
  // Server-side pagination state
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [totalCount, setTotalCount] = useState({ products: 0, services: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null; parent_name: string | null }[]>([]);
  const currentPageRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { t } = useTranslation();
  const { toast } = useToast();
  const { companies: userCompanies, activeCompany } = useCompany();

  const getEffectiveCompanyId = useCallback(() => {
    if (companyFilter !== "all") return companyFilter;
    return activeCompany?.id ?? undefined;
  }, [companyFilter, activeCompany]);


  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedItems(new Map());
      setSelectedBundles(new Map());
      setSearchTerm("");
      setDebouncedSearch("");
      setCategoryFilter("all");
      setSubcategoryFilter("all");
      // Default to active company to scope items correctly
      setCompanyFilter(activeCompany?.id ?? "all");
      currentPageRef.current = 0;
      
      // Set initial tab based on replaceItemType when in replace mode
      if (replaceMode && replaceItemType) {
        setActiveTab(
          replaceItemType === "product" ? "products" :
          replaceItemType === "service" ? "services" :
          "bundles"
        );
      }
      
      loadItems(false);
      loadCategories();
      loadTotalCounts();
    }
  }, [open, activeCompany?.id, replaceMode, replaceItemType]);

  // Reload items when any filter (including search) changes
  useEffect(() => {
    if (open) {
      currentPageRef.current = 0;
      loadItems(false);
    }
  }, [activeTab, debouncedSearch, categoryFilter, subcategoryFilter, companyFilter]);

  // Reload categories and total counts only when tab/company changes (not on every keystroke)
  useEffect(() => {
    if (open) {
      loadCategories();
      loadTotalCounts();
    }
  }, [activeTab, companyFilter]);

  // Load categories for current tab (filtered by organization)
  const loadCategories = async () => {
    try {
      const effectiveCompanyId = getEffectiveCompanyId();
      const table = activeTab === "products" ? "product_categories" : "service_categories";
      
      let query = supabase
        .from(table)
        .select("id, name, parent_id, organization_id")
        .eq("is_active", true)
        .order("name");

      // Filter by organization to only show relevant categories
      if (effectiveCompanyId) {
        // Get org hierarchy for proper scoping
        const orgIds = [effectiveCompanyId];
        try {
          const { data: children } = await supabase
            .from("anew_hierarchy")
            .select("child_org_id")
            .eq("parent_org_id", effectiveCompanyId);
          if (children) {
            for (const c of children) {
              if (c.child_org_id && !orgIds.includes(c.child_org_id)) {
                orgIds.push(c.child_org_id);
              }
            }
          }
        } catch { /* ignore */ }

        const orFilter = orgIds.flatMap(id => [
          `organization_id.eq.${id}`,
        ]).join(',');
        query = query.or(orFilter);
      }

      const { data } = await query;

      if (!data) { setCategories([]); return; }

      // Build parent name map
      const idToName = new Map(data.map(c => [c.id, c.name]));
      const mapped = data.map(c => ({
        id: c.id,
        name: c.name,
        parent_id: c.parent_id as string | null,
        parent_name: c.parent_id ? (idToName.get(c.parent_id) || null) : null,
      }));

      setCategories(mapped);
    } catch {
      setCategories([]);
    }
  };

  // Helper: resolve active org + descendants for scoping (matches loadCategories scoping)
  const resolveOrgScope = useCallback(async (rootOrgId: string | undefined): Promise<string[]> => {
    if (!rootOrgId) return [];
    const ids = [rootOrgId];
    try {
      const { data: children } = await supabase
        .from("anew_hierarchy")
        .select("child_org_id")
        .eq("parent_org_id", rootOrgId);
      if (children) {
        for (const c of children) {
          if (c.child_org_id && !ids.includes(c.child_org_id)) ids.push(c.child_org_id);
        }
      }
    } catch { /* ignore */ }
    return ids;
  }, []);

  // Resolve subcategory ids matching a free-text category filter (matches existing logic)
  const resolveCategoryIds = useCallback((): string[] | null => {
    if (categoryFilter === "all") return null;
    const selectedCat = categories.find(c => c.name === categoryFilter && !c.parent_id);
    if (!selectedCat) {
      // Treat the value as a leaf/subcategory name
      const leaf = categories.find(c => c.name === categoryFilter);
      return leaf ? [leaf.id] : [];
    }
    const childIds = categories.filter(c => c.parent_id === selectedCat.id).map(c => c.id);
    return [selectedCat.id, ...childIds];
  }, [categoryFilter, categories]);

  const resolveSubcategoryId = useCallback((): string | null => {
    if (subcategoryFilter === "all") return null;
    const sub = categories.find(c => c.name === subcategoryFilter);
    return sub?.id ?? null;
  }, [subcategoryFilter, categories]);

  // Build a base supabase query for the active tab with all "active" + scope filters applied.
  // Products mirror Products.tsx scoping through product_organizations.
  const buildBaseQuery = useCallback((forCount: boolean, orgIds: string[]) => {
    if (activeTab === "products") {
      const productSelect = forCount
        ? (orgIds.length > 0 ? "id, product_organizations!inner(organization_id)" : "id")
        : (orgIds.length > 0
            ? `id, sku, name, description, organization_id, category_id, subcategory_id,
               product_categories!category_id(name),
               brands(name),
               uom:uom_id(code, description),
               product_organizations!inner(organization_id)`
            : `id, sku, name, description, organization_id, category_id, subcategory_id,
               product_categories!category_id(name),
               brands(name),
               uom:uom_id(code, description),
               product_organizations(organization_id)`);

      let q = forCount
        ? (supabase.from("products") as any).select(productSelect, { count: "exact", head: true })
        : (supabase.from("products") as any).select(productSelect);

      q = q
        .eq("is_active", true)
        .eq("is_sellable", true)
        .eq("status", "active")
        .is("deleted_at", null);

      if (orgIds.length > 0) q = q.in("product_organizations.organization_id", orgIds);

      // Subcategory takes precedence: when chosen, filter strictly by it
      // (products store the leaf id in category_id in this schema).
      const subId = resolveSubcategoryId();
      if (subId) {
        q = q.or(`category_id.eq.${subId},subcategory_id.eq.${subId}`);
      } else {
        const catIds = resolveCategoryIds();
        if (catIds !== null) {
          if (catIds.length === 0) {
            q = q.eq("category_id", "00000000-0000-0000-0000-000000000000");
          } else {
            q = q.in("category_id", catIds);
          }
        }
      }

      const term = debouncedSearch.trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ").trim();
        if (safe) {
          q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,description.ilike.%${safe}%,barcode.ilike.%${safe}%`);
        }
      }
      return q;
    }

    const serviceSelect = forCount
      ? "id"
      : `id, sku, name, short_desc, long_desc, organization_id, service_category_id,
         service_categories:service_category_id(id, name)`;

    let q = forCount
      ? (supabase.from("services") as any).select(serviceSelect, { count: "exact", head: true })
      : (supabase.from("services") as any).select(serviceSelect);

    q = q
      .eq("is_active", true)
      .in("service_type", ["sale", "both"]);

    if (orgIds.length > 0) q = q.in("organization_id", orgIds);

    const subId = resolveSubcategoryId();
    if (subId) {
      q = q.eq("service_category_id", subId);
    } else {
      const catIds = resolveCategoryIds();
      if (catIds !== null) {
        if (catIds.length === 0) {
          q = q.eq("service_category_id", "00000000-0000-0000-0000-000000000000");
        } else {
          q = q.in("service_category_id", catIds);
        }
      }
    }

    const term = debouncedSearch.trim();
    if (term) {
      const safe = term.replace(/[%,()]/g, " ").trim();
      if (safe) {
        q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,short_desc.ilike.%${safe}%`);
      }
    }
    return q;
  }, [activeTab, debouncedSearch, resolveCategoryIds, resolveSubcategoryId]);

  // Load total counts for both tabs (server-side, scoped + active filters; ignores search/category for tab badges)
  const loadTotalCounts = async () => {
    try {
      const effectiveCompanyId = getEffectiveCompanyId();
      const orgIds = await resolveOrgScope(effectiveCompanyId);

      let pq = (supabase.from("products") as any)
        .select(
          orgIds.length > 0 ? "id, product_organizations!inner(organization_id)" : "id",
          { count: "exact", head: true },
        )
        .eq("is_active", true)
        .eq("is_sellable", true)
        .eq("status", "active")
        .is("deleted_at", null);
      if (orgIds.length > 0) pq = pq.in("product_organizations.organization_id", orgIds);

      let sq = (supabase.from("services") as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("service_type", ["sale", "both"]);
      if (orgIds.length > 0) sq = sq.in("organization_id", orgIds);

      if (orgIds.length > 0) sq = sq.in("organization_id", orgIds);

      const [{ count: pCount }, { count: sCount }] = await Promise.all([pq, sq]);
      setTotalCount({ products: pCount ?? 0, services: sCount ?? 0 });
    } catch (e) {
      console.error("Error loading totals:", e);
    }
  };

  // Load items with server-side filtering and pagination
  const loadItems = useCallback(async (append = false) => {
    if (activeTab === "bundles") {
      // Bundles tab is handled by BundleSelectionTab; nothing to load here.
      setItems([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      currentPageRef.current = 0;
    }

    const from = currentPageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      const effectiveCompanyId = getEffectiveCompanyId();
      const orgIds = await resolveOrgScope(effectiveCompanyId);
      const baseQuery = buildBaseQuery(false, orgIds);
      const { data, error } = await baseQuery.order("name").range(from, to);
      if (error) throw error;

      const rows = (data || []) as any[];
      let mapped: CatalogItem[] = [];

      if (activeTab === "products") {
        const ids = rows.map(r => r.id);
        const pricesMap = new Map<string, { price: number | null; vat_rate: number | null }>();
        const BATCH = 200;
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH);
          if (batch.length === 0) continue;
          const { data: pd } = await supabase
            .from("product_prices")
            .select("product_id, price, vat_rate")
            .eq("price_type", "retail")
            .in("product_id", batch);
          (pd || []).forEach(p => pricesMap.set(p.product_id, { price: p.price, vat_rate: p.vat_rate }));
        }
        mapped = rows.map(r => {
          const pi = pricesMap.get(r.id);
          return {
            id: r.id,
            name: r.name,
            description: r.description ?? null,
            sku: r.sku ?? null,
            category_name: r.product_categories?.name ?? null,
            brand_name: r.brands?.name ?? null,
            retail_price: pi?.price ?? null,
            vat_rate: pi?.vat_rate ?? 23,
            organization_id: r.organization_id ?? null,
            type: "product" as const,
            uom_symbol: r.uom?.code ?? null,
            uom_name: r.uom?.description ?? null,
          };
        });
      } else {
        const ids = rows.map(r => r.id);
        const pricesMap = new Map<string, { price: number | null; vat_rate: number | null }>();
        const BATCH = 200;
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH);
          if (batch.length === 0) continue;
          const { data: pd } = await supabase
            .from("service_prices")
            .select("service_id, price, vat_rate")
            .eq("price_type", "retail")
            .in("service_id", batch);
          (pd || []).forEach(p => pricesMap.set(p.service_id, { price: p.price, vat_rate: p.vat_rate }));
        }
        mapped = rows.map(r => {
          const pi = pricesMap.get(r.id);
          return {
            id: r.id,
            name: r.name,
            description: r.long_desc ?? r.short_desc ?? null,
            sku: r.sku ?? null,
            category_name: r.service_categories?.name ?? null,
            brand_name: null,
            retail_price: pi?.price ?? null,
            vat_rate: pi?.vat_rate ?? 23,
            organization_id: r.organization_id ?? null,
            type: "service" as const,
            uom_symbol: null,
            uom_name: null,
          };
        });
      }

      if (append) {
        setItems(prev => [...prev, ...mapped]);
      } else {
        setItems(mapped);
      }

      setHasMore(rows.length === PAGE_SIZE);
      currentPageRef.current += 1;
    } catch (error) {
      console.error("Error loading items:", error);
      toast({ title: "Erro ao carregar itens", variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeTab, buildBaseQuery, getEffectiveCompanyId, resolveOrgScope, toast]);

  // Infinite scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore && !loading) {
      loadItems(true);
    }
  }, [hasMore, loadingMore, loading, loadItems]);

  // Load attributes for a product
  const loadProductAttributes = useCallback(async (productId: string) => {
    if (productAttributes.has(productId) || loadingAttributes.has(productId)) return;
    
    setLoadingAttributes(prev => new Set(prev).add(productId));
    
    try {
      // Get attribute associations for this product (which attributes are linked directly)
      const { data: attrValues, error } = await supabase
        .from("product_attribute_values")
        .select("attribute_id, value_text, value_number, value_bool, value_json")
        .eq("product_id", productId);

      if (error) throw error;

      // Direct (product-level) attribute IDs
      const directAttrIds = attrValues && attrValues.length > 0
        ? [...new Set(attrValues.map((d: any) => d.attribute_id))]
        : [];

      // Inherit attributes from the product's subcategory + parent category chain.
      // Any attribute attached to the product's category (or any ancestor) should
      // appear automatically on every product of that category in quotes.
      const inheritedAttrIds: string[] = [];
      const { data: productRow } = await supabase
        .from("products")
        .select("category_id, subcategory_id")
        .eq("id", productId)
        .maybeSingle();

      if (productRow) {
        const categoryChain: string[] = [];
        const seedCategoryId = productRow.subcategory_id || productRow.category_id;
        let currentId: string | null = seedCategoryId || null;
        // Walk up the parent chain (cap at 10 levels for safety)
        for (let i = 0; i < 10 && currentId; i++) {
          categoryChain.push(currentId);
          const { data: parentRow } = await supabase
            .from("product_categories")
            .select("parent_category_id, parent_id")
            .eq("id", currentId)
            .maybeSingle();
          currentId = (parentRow?.parent_category_id || parentRow?.parent_id) ?? null;
        }

        if (categoryChain.length > 0) {
          const [{ data: catAttrs }, { data: paletteAttrs }] = await Promise.all([
            supabase
              .from("category_attributes")
              .select("attribute_id")
              .in("category_id", categoryChain),
            (supabase as any)
              .from("category_attribute_palettes")
              .select("attribute_id")
              .in("category_id", categoryChain),
          ]);

          [...(catAttrs || []), ...(paletteAttrs || [])].forEach((row: any) => {
            if (row?.attribute_id && !inheritedAttrIds.includes(row.attribute_id)) {
              inheritedAttrIds.push(row.attribute_id);
            }
          });
        }
      }

      // Union of direct + inherited
      const attrIds = [...new Set([...directAttrIds, ...inheritedAttrIds])];

      if (attrIds.length === 0) {
        // No attributes associated with this product nor inherited
        setProductAttributes(prev => new Map(prev).set(productId, []));
        return;
      }

      // Fetch attribute definitions with allowed_values and pricing_type
      const { data: attrDefs } = await supabase
        .from("product_attributes")
        .select("id, label, code, value_type, unit, allowed_values, pricing_type")
        .in("id", attrIds);

      if (!attrDefs || attrDefs.length === 0) {
        setProductAttributes(prev => new Map(prev).set(productId, []));
        return;
      }

      const attrsMap = new Map<string, ProductAttribute>();
      
      attrDefs.forEach((attr: any) => {
        // For list-type attributes, use allowed_values from the attribute definition
        const allowedOptions: Array<{ id: string; value: string; rawValue?: string }> =
          attr?.allowed_values && Array.isArray(attr.allowed_values)
            ? (attr.allowed_values as string[])
                .filter((v) => typeof v === "string" && v.trim().length > 0)
                .map((v) => ({ id: v, value: v, rawValue: v }))
            : [];

        attrsMap.set(attr.id, {
          id: attr.id,
          name: attr.label || attr.code,
          code: attr.code,
          value_type: attr.value_type,
          unit: attr.unit,
          allowed_values: attr.allowed_values,
          values: allowedOptions,
          pricing_type: attr.pricing_type,
        });
      });

      // Add any additional values from product_attribute_values that aren't in allowed_values
      if (attrValues) {
        attrValues.forEach((row: any) => {
          const attr = attrsMap.get(row.attribute_id);
          if (!attr) return;

          const candidates: string[] = [];
          if (typeof row.value_text === "string" && row.value_text.trim().length > 0) {
            candidates.push(row.value_text);
          }
          if (typeof row.value_json === "string" && row.value_json.trim().length > 0) {
            candidates.push(row.value_json);
          }
          if (Array.isArray(row.value_json)) {
            row.value_json.forEach((v: unknown) => {
              if (typeof v === "string" && v.trim().length > 0) candidates.push(v);
            });
          }

          candidates.forEach((value) => {
            if (!attr.values.find((v) => v.rawValue === value || v.value === value)) {
              attr.values.push({ id: value, value, rawValue: value });
            }
          });
        });
      }

      // Enrich list-type / fixed-pricing attributes with palette values resolved from
      // the category/subcategory hierarchy. Ensures attributes like "Tonalidade" show
      // their inherited options (Brilho/Mate) even when allowed_values is empty.
      const listAttrs = Array.from(attrsMap.values()).filter(
        (a) => a.value_type === "list" || ["fixed", "both"].includes(a.pricing_type || "")
      );
      const inheritedOptionPrices: { attrId: string; value: string; price: number; productId: string | null }[] = [];

      await Promise.all(
        listAttrs.map(async (attr) => {
          const { data: resolved } = await supabase.rpc("resolve_product_attribute_options", {
            p_product_id: productId,
            p_attribute_id: attr.id,
          });
          if (!resolved || resolved.length === 0) return;

          resolved.forEach((opt: any) => {
            const rawValue = opt.value_text;
            if (!rawValue) return;
            const displayValue = opt.display_name || rawValue;
            const existing = attr.values.find((v) => v.rawValue === rawValue || v.value === displayValue || v.value === rawValue);
            if (!existing) {
              attr.values.push({ id: rawValue, value: displayValue, rawValue });
            }

            if (typeof opt.price_addon === "number" && opt.price_addon !== 0) {
              inheritedOptionPrices.push({
                attrId: attr.id,
                value: rawValue,
                price: Number(opt.price_addon),
                productId: null,
              });

              if (displayValue !== rawValue) {
                inheritedOptionPrices.push({
                  attrId: attr.id,
                  value: displayValue,
                  price: Number(opt.price_addon),
                  productId: null,
                });
              }
            }
          });
        })
      );

      setProductAttributes(prev => new Map(prev).set(productId, Array.from(attrsMap.values())));

      if (inheritedOptionPrices.length > 0) {
        setAttributeOptionPrices(prev => {
          const existing = prev.get(productId) || [];
          const merged = new Map<string, { attrId: string; value: string; price: number; productId: string | null }>();

          [...existing, ...inheritedOptionPrices].forEach((entry) => {
            merged.set(`${entry.attrId}|${entry.value}|${entry.productId || 'global'}`, entry);
          });

          return new Map(prev).set(productId, Array.from(merged.values()));
        });
      }
      
      const allAttrIds = Array.from(attrsMap.keys());
      
      // Get the context ID for the current price context
      let contextId: string | null = null;
      const { data: contextData } = await supabase
        .from('price_contexts')
        .select('id')
        .eq('code', priceContext)
        .order('organization_id', { ascending: false, nullsFirst: false })
        .limit(1);
      
      contextId = contextData?.[0]?.id || null;
      
      // Load price ranges for dimension-based attributes via unified helper
      // (Product → Subcategory → Category → Ancestor → Global, with price_context).
      const dimensionAttrIds = Array.from(attrsMap.values())
        .filter(attr => attr.pricing_type === 'range' || attr.pricing_type === 'both')
        .map(attr => attr.id);

      if (dimensionAttrIds.length > 0) {
        const rangesByAttr = await getEffectiveProductRanges({
          productId,
          attributeIds: dimensionAttrIds,
          priceContext,
        });

        setAttributePriceRanges(prev => {
          const newMap = new Map(prev);
          dimensionAttrIds.forEach(attrId => {
            newMap.set(attrId, rangesByAttr.get(attrId) || []);
          });
          return newMap;
        });
      }

      // Load effective option prices for list-type attributes (Produto → Subcategoria → Categoria → Global)
      if (allAttrIds.length > 0) {
        const optionPriceData = await getEffectiveProductOptionPrices({
          productId,
          attributeIds: allAttrIds,
          priceContext,
        });

        const mappedPrices = optionPriceData.map((p) => ({
          attrId: p.attrId,
          value: p.value,
          price: p.price,
          productId: p.productId,
          categoryId: p.categoryId,
          source: p.source,
        }));

        setAttributeOptionPrices(prev => {
          const inherited = prev.get(productId) || [];
          const merged = new Map<string, { attrId: string; value: string; price: number; productId: string | null; categoryId?: string | null; source?: string }>();

          [...inherited, ...mappedPrices].forEach((entry) => {
            merged.set(`${entry.attrId}|${entry.value}|${entry.productId || entry.categoryId || 'global'}`, entry);
          });

          return new Map(prev).set(productId, Array.from(merged.values()));
        });
      }
    } catch (error) {
      console.error("Error loading attributes:", error);
      setProductAttributes(prev => new Map(prev).set(productId, []));
    } finally {
      setLoadingAttributes(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }, [productAttributes, loadingAttributes, priceContext]);

  // Handle item selection
  const handleSelectItem = (item: CatalogItem) => {
    const newSelected = new Map(selectedItems);
    
    if (newSelected.has(item.id)) {
      const existing = newSelected.get(item.id)!;
      newSelected.set(item.id, { ...existing, quantity: existing.quantity + 1 });
    } else {
      newSelected.set(item.id, { item, quantity: 1, attributes: {} });
      if (item.type === "product") {
        loadProductAttributes(item.id);
      }
    }
    
    setSelectedItems(newSelected);
  };

  // Handle quantity change
  const handleQuantityChange = (itemId: string, delta: number) => {
    const newSelected = new Map(selectedItems);
    const existing = newSelected.get(itemId);
    
    if (!existing) return;
    
    const newQty = existing.quantity + delta;
    if (newQty <= 0) {
      newSelected.delete(itemId);
    } else {
      newSelected.set(itemId, { ...existing, quantity: newQty });
    }
    
    setSelectedItems(newSelected);
  };

  // Helper to find matching range price - moved here for reuse
  const findRangePriceForAttribute = useCallback((attrId: string, value: string): number => {
    const ranges = attributePriceRanges.get(attrId);
    if (!ranges || ranges.length === 0) return 0;
    
    // Parse dimension helpers
    const parseDimension = (val: string): { depth: number; width: number } | null => {
      const match = val.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) return { depth: parseFloat(match[1]), width: parseFloat(match[2]) };
      return null;
    };
    
    const parseDimension3d = (val: string): { depth: number; width: number; height: number } | null => {
      const match = val.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) return { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) };
      return null;
    };
    
    // Check 3D dimension ranges
    const dimension3dRanges = ranges.filter((r: any) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension3d');
    if (dimension3dRanges.length > 0) {
      const dims3d = parseDimension3d(value);
      if (dims3d) {
        const sortedRanges = [...dimension3dRanges].sort((a: any, b: any) => {
          const aVolume = ((a.max_depth || 999999) - (a.min_depth || 0)) * 
                          ((a.max_width || 999999) - (a.min_width || 0)) * 
                          ((a.max_height || 999999) - (a.min_height || 0));
          const bVolume = ((b.max_depth || 999999) - (b.min_depth || 0)) * 
                          ((b.max_width || 999999) - (b.min_width || 0)) * 
                          ((b.max_height || 999999) - (b.min_height || 0));
          return aVolume - bVolume;
        });
        const match = sortedRanges.find((r: any) => 
          dims3d.depth >= (r.min_depth || 0) && (r.max_depth === null || dims3d.depth <= r.max_depth) &&
          dims3d.width >= (r.min_width || 0) && (r.max_width === null || dims3d.width <= r.max_width) &&
          dims3d.height >= (r.min_height || 0) && (r.max_height === null || dims3d.height <= r.max_height)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    // Check 2D dimension ranges
    const dimensionRanges = ranges.filter((r: any) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension');
    if (dimensionRanges.length > 0) {
      const dims = parseDimension(value);
      if (dims) {
        const sortedRanges = [...dimensionRanges].sort((a: any, b: any) => {
          const aArea = ((a.max_width || 999999) - (a.min_width || 0)) * ((a.max_height || 999999) - (a.min_height || 0));
          const bArea = ((b.max_width || 999999) - (b.min_width || 0)) * ((b.max_height || 999999) - (b.min_height || 0));
          return aArea - bArea;
        });
        const match = sortedRanges.find((r: any) => 
          dims.depth >= (r.min_width || 0) && (r.max_width === null || dims.depth <= r.max_width) &&
          dims.width >= (r.min_height || 0) && (r.max_height === null || dims.width <= r.max_height)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    // Check linear ranges
    const linearRanges = ranges.filter((r: any) => {
      const rt = (r.range_type ?? 'linear').toString().trim().toLowerCase();
      return rt === 'linear' || rt === '';
    });
    if (linearRanges.length > 0) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const sortedRanges = [...linearRanges].sort((a: any, b: any) => {
          const aRange = (a.max_value || 999999) - (a.min_value || 0);
          const bRange = (b.max_value || 999999) - (b.min_value || 0);
          return aRange - bRange;
        });
        const match = sortedRanges.find((r: any) => 
          numValue >= (r.min_value || 0) && (r.max_value === null || numValue <= r.max_value)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    return 0;
  }, [attributePriceRanges]);

  // Helper to find option price for list attributes (colors, materials, etc.)
  const findOptionPriceForAttribute = useCallback((productId: string, attrId: string, value: string): number => {
    const prices = attributeOptionPrices.get(productId);
    if (!prices || prices.length === 0 || !value) return 0;
    
    // Get all prices for this attribute and value
    const matchingPrices = prices.filter(p => p.attrId === attrId && p.value === value);
    if (matchingPrices.length === 0) return 0;

    const sourceRank = (source?: string) => {
      switch (source) {
        case 'product': return 0;
        case 'subcategory': return 1;
        case 'category': return 2;
        case 'ancestor_category': return 3;
        case 'global': return 4;
        default: return 5;
      }
    };
    
    // Prioritize product-specific prices over global ones
    const productSpecificPrice = matchingPrices.find(p => p.productId === productId);
    if (productSpecificPrice) return productSpecificPrice.price || 0;

    const scopedPrice = [...matchingPrices]
      .filter(p => !p.productId)
      .sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];

    return scopedPrice?.price || 0;
  }, [attributeOptionPrices]);

  const formatOptionPriceLabel = useCallback((price: number) => {
    if (!price) return "";
    return price > 0 ? ` (+${price.toFixed(2)}€)` : ` (${price.toFixed(2)}€)`;
  }, []);

  const getOptionDisplayLabel = useCallback((productId: string, attrId: string, option: { id: string; value: string; rawValue?: string }) => {
    const lookupValue = option.rawValue || option.id || option.value;
    const price = findOptionPriceForAttribute(productId, attrId, lookupValue);
    return `${option.value}${formatOptionPriceLabel(price)}`;
  }, [findOptionPriceForAttribute, formatOptionPriceLabel]);

  // Handle attribute change - with dynamic price calculation
  const handleAttributeChange = (itemId: string, attrId: string, value: string) => {
    const newSelected = new Map(selectedItems);
    const existing = newSelected.get(itemId);
    
    if (!existing) return;
    
    // Update attributes
    const newAttributes = { ...existing.attributes, [attrId]: value };
    
    // Recalculate attributePriceAddon based on all attributes
    let newAttributePriceAddon = 0;
    const attrs = productAttributes.get(itemId) || [];
    
    Object.entries(newAttributes).forEach(([aId, aValue]) => {
      const attrDef = attrs.find(a => a.id === aId);
      const isDimensionAttr = attrDef?.pricing_type === 'range' || attrDef?.pricing_type === 'both' || 
        attrDef?.name.toLowerCase().includes('medida');
      
      // Check for range-based pricing (dimensions)
      if (isDimensionAttr && aValue.trim()) {
        const rangePrice = findRangePriceForAttribute(aId, aValue.trim());
        if (rangePrice > 0) {
          newAttributePriceAddon += rangePrice;
        }
      }
      
      // Check for fixed option pricing (colors, materials, etc.)
      const optionPrice = findOptionPriceForAttribute(itemId, aId, aValue);
      if (optionPrice !== 0) {
        newAttributePriceAddon += optionPrice;
      }
    });
    
    newSelected.set(itemId, {
      ...existing,
      attributes: newAttributes,
      attributePriceAddon: newAttributePriceAddon
    });
    
    setSelectedItems(newSelected);
  };

  // Remove item (handles both regular items and bundles)
  const handleRemoveItem = (itemId: string) => {
    if (selectedBundles.has(itemId)) {
      const newBundles = new Map(selectedBundles);
      newBundles.delete(itemId);
      setSelectedBundles(newBundles);
      return;
    }
    const newSelected = new Map(selectedItems);
    newSelected.delete(itemId);
    setSelectedItems(newSelected);
  };

  // Helper function to check if dimension value is within defined price ranges
  const isDimensionInRange = useCallback((attrId: string, value: string): boolean => {
    const ranges = attributePriceRanges.get(attrId);
    if (!ranges || ranges.length === 0) return true; // No ranges = allow anything
    
    if (!value.trim()) return true; // Empty is ok
    
    // Parse dimension helpers
    const parseDimension = (val: string): { depth: number; width: number } | null => {
      const match = val.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) return { depth: parseFloat(match[1]), width: parseFloat(match[2]) };
      return null;
    };
    
    const parseDimension3d = (val: string): { depth: number; width: number; height: number } | null => {
      const match = val.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) return { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) };
      return null;
    };
    
    // Check 3D dimension ranges
    const dimension3dRanges = ranges.filter((r: any) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension3d');
    if (dimension3dRanges.length > 0) {
      const dims3d = parseDimension3d(value);
      if (dims3d) {
        const match = dimension3dRanges.find((r: any) => 
          dims3d.depth >= (r.min_depth || 0) && (r.max_depth === null || dims3d.depth <= r.max_depth) &&
          dims3d.width >= (r.min_width || 0) && (r.max_width === null || dims3d.width <= r.max_width) &&
          dims3d.height >= (r.min_height || 0) && (r.max_height === null || dims3d.height <= r.max_height)
        );
        return !!match;
      }
    }
    
    // Check 2D dimension ranges
    const dimensionRanges = ranges.filter((r: any) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension');
    if (dimensionRanges.length > 0) {
      const dims = parseDimension(value);
      if (dims) {
        const match = dimensionRanges.find((r: any) => 
          dims.depth >= (r.min_width || 0) && (r.max_width === null || dims.depth <= r.max_width) &&
          dims.width >= (r.min_height || 0) && (r.max_height === null || dims.width <= r.max_height)
        );
        return !!match;
      }
    }
    
    // Check linear ranges
    const linearRanges = ranges.filter((r: any) => {
      const rt = (r.range_type ?? 'linear').toString().trim().toLowerCase();
      return rt === 'linear' || rt === '';
    });
    if (linearRanges.length > 0) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const match = linearRanges.find((r: any) => 
          numValue >= (r.min_value || 0) && (r.max_value === null || numValue <= r.max_value)
        );
        return !!match;
      }
    }
    
    return false;
  }, [attributePriceRanges]);

  // Group selected items by category/type (including bundles)
  const groupedSelectedItems = useMemo(() => {
    const groups: Record<string, SelectedItem[]> = {};
    
    selectedItems.forEach((selected) => {
      const groupKey = selected.item.type === "product" 
        ? `📦 Produtos - ${selected.item.category_name || "Sem Categoria"}`
        : `🔧 Serviços - ${selected.item.category_name || "Sem Categoria"}`;
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(selected);
    });
    
    // Add bundles as a group
    if (selectedBundles.size > 0) {
      const bundleGroup: SelectedItem[] = [];
      selectedBundles.forEach((selectedBundle) => {
        // Calculate bundle UNIT price (total of component unit prices without bundle quantity multiplier)
        // Note: expandedLines already have quantities multiplied by bundle quantity, 
        // so we need to divide back to get the unit price
        const bundleQty = selectedBundle.quantity;
        const totalWithQty = selectedBundle.expandedLines.reduce(
          (sum, line) => sum + line.unit_price * line.quantity, 
          0
        );
        // The unit price is the total divided by bundle quantity
        const bundleUnitPrice = bundleQty > 0 ? totalWithQty / bundleQty : 0;
        
        // Create a pseudo CatalogItem for the bundle
        const bundleItem: CatalogItem = {
          id: selectedBundle.bundle.id,
          name: selectedBundle.bundle.name,
          description: selectedBundle.bundle.description || null,
          sku: selectedBundle.bundle.sku,
          category_name: "Bundles",
          brand_name: null,
          retail_price: bundleUnitPrice, // Unit price (not multiplied by quantity)
          vat_rate: null,
          organization_id: selectedBundle.bundle.organization_id,
          type: "product",
          uom_symbol: null,
          uom_name: null,
        };
        bundleGroup.push({
          item: bundleItem,
          quantity: selectedBundle.quantity,
          attributes: {},
          attributePriceAddon: 0,
        });
      });
      if (bundleGroup.length > 0) {
        groups["📦 Bundles"] = bundleGroup;
      }
    }
    
    // Sort groups: Products first, then Bundles, then Services, then by category name
    return Object.entries(groups).sort(([a], [b]) => {
      const aIsProduct = a.startsWith("📦");
      const bIsProduct = b.startsWith("📦");
      if (aIsProduct && !bIsProduct) return -1;
      if (!aIsProduct && bIsProduct) return 1;
      return a.localeCompare(b);
    });
  }, [selectedItems, selectedBundles]);

  // Calculate totals (including attribute price addons and bundles)
  const totals = useMemo(() => {
    let count = 0;
    let value = 0;
    
    // Regular items
    selectedItems.forEach(({ item, quantity, attributePriceAddon }) => {
      count += quantity;
      const itemTotal = ((item.retail_price || 0) + (attributePriceAddon || 0)) * quantity;
      value += itemTotal;
    });
    
    // Bundle items (count expanded lines)
    selectedBundles.forEach(({ expandedLines }) => {
      expandedLines.forEach(line => {
        count += line.quantity;
        value += line.unit_price * line.quantity;
      });
    });
    
    return { count, value };
  }, [selectedItems, selectedBundles]);

  // Submit selection - enrich attributes with full data before sending
  const handleSubmit = async () => {
    if (selectedItems.size === 0 && selectedBundles.size === 0) {
      toast({ title: "Selecione pelo menos um item", variant: "destructive" });
      return;
    }
    
    // Validate all dimension attributes are within defined price ranges
    let hasInvalidDimensions = false;
    selectedItems.forEach(({ item, attributes }) => {
      const attrs = productAttributes.get(item.id) || [];
      Object.entries(attributes).forEach(([attrId, value]) => {
        const attrDef = attrs.find(a => a.id === attrId);
        const isDimensionAttr = attrDef?.pricing_type === 'range' || attrDef?.pricing_type === 'both' || 
          attrDef?.name.toLowerCase().includes('medida');
        if (isDimensionAttr && value.trim() && !isDimensionInRange(attrId, value.trim())) {
          hasInvalidDimensions = true;
        }
      });
    });
    
    if (hasInvalidDimensions) {
      toast({ 
        title: "Medida fora do intervalo", 
        description: "Uma ou mais medidas não estão dentro dos intervalos de preço definidos.",
        variant: "destructive" 
      });
      return;
    }
    
    // Collect all attribute IDs that have values to check for range pricing
    const attrIdsToCheck: string[] = [];
    selectedItems.forEach(({ attributes }) => {
      Object.keys(attributes).forEach(attrId => {
        if (!attrIdsToCheck.includes(attrId)) {
          attrIdsToCheck.push(attrId);
        }
      });
    });
    
    // Fetch attribute pricing info and ranges
    const attributePricingInfo: Record<string, { pricing_type: string; price_per_unit: number; ranges: any[] }> = {};
    
    if (attrIdsToCheck.length > 0) {
      const { data: attrData } = await supabase
        .from('product_attributes')
        .select('id, pricing_type, price_per_unit')
        .in('id', attrIdsToCheck);
      
      const { data: rangeData } = await supabase
        .from('product_attribute_price_ranges')
        .select('*')
        .in('attribute_id', attrIdsToCheck);
      
      (attrData || []).forEach((attr: any) => {
        const attrRanges = (rangeData || []).filter((r: any) => r.attribute_id === attr.id);
        attributePricingInfo[attr.id] = {
          pricing_type: attr.pricing_type || 'none',
          price_per_unit: attr.price_per_unit || 0,
          ranges: attrRanges
        };
        console.log('[AddItemsDialog] Attribute pricing loaded:', {
          attrId: attr.id,
          pricing_type: attr.pricing_type,
          price_per_unit: attr.price_per_unit,
          rangesCount: attrRanges.length,
          ranges: attrRanges
        });
      });
    }
    
    // Helper to parse dimension value like "90x90", "90 x 90" or even "90x90 cm" (2D: CxL - Comprimento x Largura)
    const parseDimension = (value: string): { depth: number; width: number } | null => {
      const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        return { depth: parseFloat(match[1]), width: parseFloat(match[2]) };
      }
      return null;
    };
    
    // Helper to parse 3D dimension value like "50x90x120" (CxLxA)
    const parseDimension3d = (value: string): { depth: number; width: number; height: number } | null => {
      const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        return { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) };
      }
      return null;
    };
    
    // Helper to extract a numeric value from various formats
    const extractNumericValue = (value: string): number | null => {
      // First try direct parse
      const direct = parseFloat(value);
      if (!isNaN(direct)) return direct;
      
      // Try to extract from 3D dimension format (use max of all dimensions)
      const dims3d = parseDimension3d(value);
      if (dims3d) {
        return Math.max(dims3d.depth, dims3d.width, dims3d.height);
      }
      
      // Try to extract from 2D dimension format (CxL - use max of depth/width)
      const dims = parseDimension(value);
      if (dims) {
        return Math.max(dims.depth, dims.width);
      }
      
      // Try to extract first number from string
      const numMatch = value.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        return parseFloat(numMatch[1]);
      }
      
      return null;
    };
    
    // Helper to find matching range price
    const findRangePrice = (attrId: string, value: string): number => {
      const pricingInfo = attributePricingInfo[attrId];
      const pricingType = (pricingInfo?.pricing_type || 'none').toString().trim().toLowerCase();
      
      console.log('[findRangePrice] Checking:', { attrId, value, pricingType, rangesCount: pricingInfo?.ranges?.length || 0 });
      
      if (!pricingInfo || !['range', 'both'].includes(pricingType) || pricingInfo.ranges.length === 0) {
        console.log('[findRangePrice] Skipped - no range pricing configured');
        return 0;
      }
      
      const ranges = pricingInfo.ranges;
      
      // Check for 3D dimension-type ranges first (CxLxA)
      const dimension3dRanges = ranges.filter((r: any) => (r?.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension3d');
      console.log('[findRangePrice] Dimension 3D ranges:', dimension3dRanges.length);
      
      if (dimension3dRanges.length > 0) {
        const dims3d = parseDimension3d(value);
        console.log('[findRangePrice] Parsed 3D dimensions:', dims3d);
        if (dims3d) {
          // Sort by specificity: smaller ranges (more specific) first
          const sortedRanges = [...dimension3dRanges].sort((a: any, b: any) => {
            const aVolume = ((a.max_depth || 999999) - (a.min_depth || 0)) * 
                            ((a.max_width || 999999) - (a.min_width || 0)) * 
                            ((a.max_height || 999999) - (a.min_height || 0));
            const bVolume = ((b.max_depth || 999999) - (b.min_depth || 0)) * 
                            ((b.max_width || 999999) - (b.min_width || 0)) * 
                            ((b.max_height || 999999) - (b.min_height || 0));
            return aVolume - bVolume;
          });
          
          const match = sortedRanges.find((r: any) => 
            dims3d.depth >= (r.min_depth || 0) && 
            (r.max_depth === null || dims3d.depth <= r.max_depth) &&
            dims3d.width >= (r.min_width || 0) && 
            (r.max_width === null || dims3d.width <= r.max_width) &&
            dims3d.height >= (r.min_height || 0) && 
            (r.max_height === null || dims3d.height <= r.max_height)
          );
          if (match) {
            console.log('[findRangePrice] MATCHED dimension3d range:', match, '-> price_per_unit:', match.price_per_unit);
            return match.price_per_unit || 0;
          }
        }
      }
      
      // Check for 2D dimension-type ranges (CxL)
      const dimensionRanges = ranges.filter((r: any) => (r?.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension');
      console.log('[findRangePrice] Dimension 2D ranges:', dimensionRanges.length);
      
      if (dimensionRanges.length > 0) {
        const dims = parseDimension(value);
        console.log('[findRangePrice] Parsed 2D dimensions (CxL):', dims);
        if (dims) {
          // Sort by specificity: smaller ranges (more specific) first - ensures tier 1 has priority
          const sortedRanges = [...dimensionRanges].sort((a: any, b: any) => {
            const aArea = ((a.max_width || 999999) - (a.min_width || 0)) * 
                          ((a.max_height || 999999) - (a.min_height || 0));
            const bArea = ((b.max_width || 999999) - (b.min_width || 0)) * 
                          ((b.max_height || 999999) - (b.min_height || 0));
            return aArea - bArea;
          });
          console.log('[findRangePrice] Sorted 2D ranges by specificity:', sortedRanges.map((r: any) => ({ 
            minW: r.min_width, maxW: r.max_width, minH: r.min_height, maxH: r.max_height, price: r.price_per_unit 
          })));
          
          const match = sortedRanges.find((r: any) => 
            dims.depth >= (r.min_width || 0) && 
            (r.max_width === null || dims.depth <= r.max_width) &&
            dims.width >= (r.min_height || 0) && 
            (r.max_height === null || dims.width <= r.max_height)
          );
          if (match) {
            console.log('[findRangePrice] MATCHED dimension range:', match, '-> price_per_unit:', match.price_per_unit);
            return match.price_per_unit || 0;
          }
        }
      }
      
      // Check for linear-type ranges (also handle dimension values like "90x90")
      const linearRanges = ranges.filter((r: any) => {
        const rt = (r?.range_type ?? 'linear').toString().trim().toLowerCase();
        return rt === 'linear' || rt === '';
      });
      console.log('[findRangePrice] Linear ranges:', linearRanges.length);
      
      if (linearRanges.length > 0) {
        const numValue = extractNumericValue(value);
        console.log('[findRangePrice] Extracted numeric value:', numValue);
        if (numValue !== null) {
          // Sort by specificity: smaller ranges (more specific) first
          const sortedRanges = [...linearRanges].sort((a: any, b: any) => {
            const aRange = (a.max_value || 999999) - (a.min_value || 0);
            const bRange = (b.max_value || 999999) - (b.min_value || 0);
            return aRange - bRange;
          });
          
          const match = sortedRanges.find((r: any) => 
            numValue >= (r.min_value || 0) && 
            (r.max_value === null || numValue <= r.max_value)
          );
          if (match) {
            console.log('[findRangePrice] MATCHED linear range:', match, '-> price_per_unit:', match.price_per_unit);
            return match.price_per_unit || 0;
          }
        }
      }
      
      console.log('[findRangePrice] No match found');
      return 0;
    };
    
    // Enrich each selected item with full attribute data
    // Use the attributePriceAddon already calculated by handleAttributeChange (sidebar)
    // which uses properly filtered ranges (by product/context) for accurate pricing
    const enrichedItems = Array.from(selectedItems.values()).map(selected => {
      const { item, quantity, attributes, attributePriceAddon: existingAddon } = selected;
      const attrs = productAttributes.get(item.id) || [];
      
      // Build full attributes object with all metadata (including per-attribute price impact)
      const fullAttributes: Record<string, { attribute_code: string; label: string; value_type: string; unit?: string; value: string; pricing_type?: string; price_impact?: number }> = {};

      Object.entries(attributes).forEach(([attrId, selectedValue]) => {
        const attrDef = attrs.find(a => a.id === attrId);
        const pricingInfo = attributePricingInfo[attrId];

        // Calculate this attribute's individual price impact
        let priceImpact = 0;
        if (selectedValue) {
          const numericValue = parseFloat(selectedValue);
          if (!isNaN(numericValue)) {
            const rangePrice = findRangePriceForAttribute(attrId, selectedValue.trim());
            if (rangePrice > 0) priceImpact += rangePrice;
          }
          const optionPrice = findOptionPriceForAttribute(item.id, attrId, selectedValue);
          if (optionPrice !== 0) priceImpact += optionPrice;
        }

        if (attrDef) {
          fullAttributes[attrId] = {
            attribute_code: attrDef.code,
            label: attrDef.name,
            value_type: attrDef.value_type,
            unit: attrDef.unit || undefined,
            value: selectedValue,
            pricing_type: pricingInfo?.pricing_type,
            price_impact: priceImpact,
          };
        } else {
          fullAttributes[attrId] = {
            attribute_code: attrId,
            label: attrId,
            value_type: 'string',
            value: selectedValue,
            price_impact: priceImpact,
          };
        }
      });
      
      // Use the addon already calculated in real-time by handleAttributeChange
      // This ensures consistency between the sidebar display and the final value
      const attributePriceAddon = existingAddon || 0;
      
      console.log('[AddItemsDialog] Item enriched:', {
        itemName: item.name,
        basePrice: item.retail_price,
        attributePriceAddon,
        finalPrice: (item.retail_price || 0) + attributePriceAddon,
        attributes: Object.entries(fullAttributes).map(([id, attr]) => ({ id, label: attr.label, value: attr.value }))
      });
      
      return {
        ...selected,
        fullAttributes,
        attributePriceAddon
      };
    });
    
    // Convert bundles to single items with component info (not expanded lines)
    const bundleItems: SelectedItem[] = [];
    selectedBundles.forEach((selectedBundle) => {
      const { bundle, quantity, expandedLines } = selectedBundle;

      // expandedLines.quantity is ALREADY multiplied by the bundle quantity
      // (see expandBundleToLines: comp.quantity * quantity).
      // To avoid double-counting downstream (where the line is persisted with
      // qt = bundle quantity and totals are computed as unit_price * qt),
      // we must store the UNIT bundle snapshot here:
      //   - component.quantity → per single bundle (line.quantity / quantity)
      //   - bundle unit price → total / quantity
      const safeQty = quantity > 0 ? quantity : 1;
      const unitTotalPrice = expandedLines.reduce(
        (sum, line) => sum + line.unit_price * (line.quantity / safeQty),
        0
      );

      // Create component info from expanded lines (per single bundle unit)
      const components: BundleComponentInfo[] = expandedLines.map(line => ({
        id: line.id,
        name: line.name,
        sku: line.sku,
        type: line.type,
        source_id: line.source_id,
        quantity: line.quantity / safeQty,
        unit_price: line.unit_price,
        vat_rate: line.vat_rate,
        selected_attributes: line.selected_attributes,
        attribute_price_addon: line.attribute_price_addon,
        choice_group_id: line.choice_group_id ?? null,
      }));
      
      bundleItems.push({
        item: {
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
          sku: bundle.sku,
          category_name: "Bundles",
          brand_name: null,
          retail_price: unitTotalPrice,
          vat_rate: 23,
          organization_id: bundle.organization_id,
          type: "product",
          uom_symbol: null,
          uom_name: null,
        },
        quantity: quantity,
        attributes: {},
        fullAttributes: {},
        attributePriceAddon: 0,
        bundleInfo: {
          bundle_id: bundle.id,
          bundle_sku: bundle.sku,
          bundle_name: bundle.name,
          bundle_description: bundle.description,
          components: components,
          total_price: unitTotalPrice,
        },
      });
    });
    
    onAddItems([...enrichedItems, ...bundleItems]);
    onOpenChange(false);
  };

  // Get selection state for an item
  const getSelectionState = (itemId: string) => {
    return selectedItems.get(itemId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] max-h-[90vh] !flex !flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  {replaceMode ? "Substituir Item" : "Adicionar Itens ao Orçamento"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {replaceMode ? "Selecione o produto ou serviço que substituirá o item atual" : "Selecione produtos ou serviços para adicionar"}
                </p>
              </div>
            </div>
            
            <AnimatePresence>
              {(selectedItems.size > 0 || selectedBundles.size > 0) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-2 rounded-full"
                >
                  <div className="flex items-center gap-1.5">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="font-semibold">{totals.count}</span>
                  </div>
                  <Separator orientation="vertical" className="h-4 bg-primary-foreground/30" />
                  <span className="font-semibold">€{totals.value.toFixed(2)}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* AI Assistant */}
            <QuoteAIAssistant 
              onAddSuggestion={(suggestion) => {
                // Create a virtual catalog item from the AI suggestion
                const virtualItem: CatalogItem = {
                  id: suggestion.product_id || `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: suggestion.name,
                  description: suggestion.reason || null,
                  sku: null,
                  category_name: suggestion.category,
                  brand_name: null,
                  retail_price: suggestion.price || 0,
                  vat_rate: 23,
                  organization_id: activeCompany?.id || null,
                  type: suggestion.type || "product",
                  uom_symbol: null,
                  uom_name: null
                };
                
                const newSelected = new Map(selectedItems);
                if (newSelected.has(virtualItem.id)) {
                  const existing = newSelected.get(virtualItem.id)!;
                  newSelected.set(virtualItem.id, { 
                    ...existing, 
                    quantity: existing.quantity + suggestion.quantity 
                  });
                } else {
                  newSelected.set(virtualItem.id, { 
                    item: virtualItem, 
                    quantity: suggestion.quantity, 
                    attributes: {} 
                  });
                }
                setSelectedItems(newSelected);
                
                toast({
                  title: suggestion.type === "service" ? "Serviço adicionado" : "Produto adicionado",
                  description: `${suggestion.name} (x${suggestion.quantity}) adicionado ao carrinho`,
                });
                return true;
              }}
            />
            
            {/* Tabs & Filters */}
            <div className="px-6 py-4 border-b bg-muted/30 space-y-4">
              <Tabs value={activeTab} onValueChange={(v) => {
                setActiveTab(v as "products" | "services" | "bundles");
                setCategoryFilter("all");
                if (v !== "bundles") loadCategories();
              }}>
                <TabsList className="grid w-full max-w-lg grid-cols-3 h-12">
                  <TabsTrigger value="products" className="gap-2 text-base">
                    <Package className="h-4 w-4" />
                    Produtos
                    <Badge variant="secondary" className="ml-1.5">
                      {totalCount.products}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="services" className="gap-2 text-base">
                    <Wrench className="h-4 w-4" />
                    Serviços
                    <Badge variant="secondary" className="ml-1.5">
                      {totalCount.services}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="bundles" className="gap-2 text-base">
                    <Layers className="h-4 w-4" />
                    Bundles
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {activeTab !== "bundles" && (
                <>
                  <div className="flex gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Pesquisar por nome, SKU ou descrição..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-10"
                      />
                      {searchTerm && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                          onClick={() => setSearchTerm("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Company filter - only show if no active company */}
                    {!activeCompany && (
                      <Select value={companyFilter} onValueChange={setCompanyFilter}>
                        <SelectTrigger className="w-[180px] h-10">
                          <SelectValue placeholder="Empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as Empresas</SelectItem>
                          {userCompanies.map(company => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Category filter */}
                    <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setSubcategoryFilter("all"); }}>
                      <SelectTrigger className="w-[180px] h-10">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="all">Todas as Categorias</SelectItem>
                        {categories
                          .filter(c => !c.parent_id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(cat => (
                            <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {/* Subcategory filter - only show when a parent category is selected and has subcategories */}
                    {categoryFilter !== "all" && (() => {
                      const parentCat = categories.find(c => c.name === categoryFilter && !c.parent_id);
                      const subs = parentCat ? categories.filter(c => c.parent_id === parentCat.id).sort((a, b) => a.name.localeCompare(b.name)) : [];
                      if (subs.length === 0) return null;
                      return (
                        <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
                          <SelectTrigger className="w-[180px] h-10">
                            <SelectValue placeholder="Subcategoria" />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectItem value="all">Todas as Subcategorias</SelectItem>
                            {subs.map(sub => (
                              <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}

                    {/* View toggle */}
                    <div className="flex border rounded-lg overflow-hidden">
                      <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="rounded-none h-10 w-10"
                        onClick={() => setViewMode("grid")}
                      >
                        <Grid3X3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="rounded-none h-10 w-10"
                        onClick={() => setViewMode("list")}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Results count */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {items.length} {activeTab === "products" ? "produtos" : "serviços"} encontrados
                      {hasMore && " (scroll para mais)"}
                    </span>
                    {(searchTerm || categoryFilter !== "all" || subcategoryFilter !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary h-7"
                        onClick={() => {
                          setSearchTerm("");
                          setCategoryFilter("all");
                          setSubcategoryFilter("all");
                          // Keep company filter locked to active company
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Content area - Products/Services or Bundles */}
            {activeTab === "bundles" ? (
              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 280px)' }}>
                <BundleSelectionTab
                  selectedBundles={selectedBundles}
                  onSelectionChange={setSelectedBundles}
                  viewMode={viewMode}
                />
              </div>
            ) : (
              /* Items grid/list with infinite scroll - for products/services */
              <div 
                className="overflow-y-auto p-6"
                style={{ maxHeight: 'calc(90vh - 380px)' }}
                onScroll={handleScroll}
                ref={scrollRef}
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <OlyviaLoader size={40} text="A carregar..." />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Search className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">Nenhum item encontrado</h3>
                    <p className="text-muted-foreground max-w-sm">
                      Tente ajustar os filtros ou termo de pesquisa para encontrar o que procura.
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {items.map((item) => {
                        const selection = getSelectionState(item.id);
                        const isSelected = !!selection;
                        const attrs = productAttributes.get(item.id) || [];
                        const isLoadingAttrs = loadingAttributes.has(item.id);
                        
                        return (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Card
                              className={cn(
                                "relative overflow-hidden transition-all cursor-pointer group",
                                isSelected 
                                  ? "ring-2 ring-primary shadow-lg" 
                                  : "hover:shadow-md hover:border-primary/50"
                              )}
                              onClick={() => !isSelected && handleSelectItem(item)}
                            >
                              {isSelected && (
                                <div className="absolute top-2 right-2 z-10">
                                  <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                    <Check className="h-4 w-4" />
                                  </div>
                                </div>
                              )}
                              
                              <CardContent className="p-4">
                                {item.category_name && (
                                  <Badge variant="secondary" className="mb-2 text-xs font-normal">
                                    {item.category_name}
                                  </Badge>
                                )}
                                
                                <h3
                                  className="font-semibold text-sm mb-1 line-clamp-2 group-hover:text-primary transition-colors"
                                  title={item.name}
                                >
                                  {item.name}
                                </h3>
                                
                                {item.sku && (
                                  <p className="text-xs text-muted-foreground mb-2 font-mono">
                                    {item.sku}
                                  </p>
                                )}
                                
                                <div className="flex items-baseline justify-between mb-3">
                                  <span className="text-lg font-bold text-primary">
                                    €{((item.retail_price || 0) + (selection?.attributePriceAddon || 0)).toFixed(2)}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    IVA {item.vat_rate || 0}%
                                  </Badge>
                                </div>
                                
                                {isSelected ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, -1); }}
                                      >
                                        <Minus className="h-4 w-4" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={selection.quantity}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 1;
                                          const diff = val - selection.quantity;
                                          handleQuantityChange(item.id, diff);
                                        }}
                                        className="h-8 w-16 text-center"
                                        onClick={(e) => e.stopPropagation()}
                                        min={1}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, 1); }}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    
                                    {isLoadingAttrs ? (
                                      <div className="flex items-center justify-center py-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : attrs.length > 0 && (
                                      <div className="space-y-2 pt-2 border-t">
                                        {attrs.map(attr => {
                                          const hasOptions = attr.values.length > 0 || (attr.allowed_values && attr.allowed_values.length > 0);
                                          const isDimensionAttribute = attr.name.toLowerCase().includes('medida') || 
                                            attr.pricing_type === 'range' || 
                                            attr.pricing_type === 'both';
                                          const dimension2dRegex = /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?$/;
                                          const dimension3dRegex = /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?$/;
                                          const currentValue = selection.attributes[attr.id] || "";
                                          const isValidFormat = !currentValue || dimension2dRegex.test(currentValue.trim()) || dimension3dRegex.test(currentValue.trim());
                                          const isInRange = isDimensionAttribute ? isDimensionInRange(attr.id, currentValue.trim()) : true;
                                          const hasError = isDimensionAttribute && currentValue.trim() && (!isValidFormat || !isInRange);
                                          
                                          if (!hasOptions) {
                                            return (
                                              <div key={attr.id} className="space-y-1">
                                                <label className="text-xs text-muted-foreground">
                                                  {attr.name}
                                                  {isDimensionAttribute && <span className="ml-1 text-muted-foreground/60">(CxL ou CxLxA)</span>}
                                                </label>
                                                <Input
                                                  type="text"
                                                  placeholder={isDimensionAttribute ? "Ex: 90x120 ou 50x90x120" : `Introduzir ${attr.name.toLowerCase()}...`}
                                                  value={currentValue}
                                                  onClick={(e) => e.stopPropagation()}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (isDimensionAttribute) {
                                                      if (/^[\d\s.xX]*$/.test(val)) {
                                                        handleAttributeChange(item.id, attr.id, val);
                                                      }
                                                    } else {
                                                      handleAttributeChange(item.id, attr.id, val);
                                                    }
                                                  }}
                                                  onBlur={(e) => {
                                                    if (isDimensionAttribute) {
                                                      const val = e.target.value.trim();
                                                      if (val && !dimension2dRegex.test(val) && !dimension3dRegex.test(val)) {
                                                        handleAttributeChange(item.id, attr.id, "");
                                                      }
                                                    }
                                                  }}
                                                  className={`h-8 text-xs ${hasError ? 'border-destructive' : ''}`}
                                                />
                                                {isDimensionAttribute && currentValue.trim() && !isValidFormat && (
                                                  <p className="text-[10px] text-destructive">Formato: CxL (ex: 90x120) ou CxLxA (ex: 50x90x120)</p>
                                                )}
                                                {isDimensionAttribute && isValidFormat && !isInRange && currentValue.trim() && (
                                                  <p className="text-[10px] text-destructive">Medida fora dos intervalos de preço definidos</p>
                                                )}
                                              </div>
                                            );
                                          }
                                          
                                          return (
                                            <Select
                                              key={attr.id}
                                              value={selection.attributes[attr.id] || ""}
                                              onValueChange={(val) => handleAttributeChange(item.id, attr.id, val)}
                                            >
                                              <SelectTrigger className="h-8 text-xs" onClick={(e) => e.stopPropagation()}>
                                                <SelectValue placeholder={attr.name}>
                                                  {(() => {
                                                    const selectedValue = selection.attributes[attr.id];
                                                    if (!selectedValue) return null;
                                                    const selectedOption = attr.values.find((option) => (option.rawValue || option.id || option.value) === selectedValue);
                                                    return selectedOption
                                                      ? getOptionDisplayLabel(item.id, attr.id, selectedOption)
                                                      : selectedValue;
                                                  })()}
                                                </SelectValue>
                                              </SelectTrigger>
                                              <SelectContent 
                                                className="z-[9999] bg-popover border shadow-lg"
                                                position="popper"
                                                sideOffset={4}
                                              >
                                                {attr.values.map((val) => (
                                                  <SelectItem key={val.id} value={val.rawValue || val.id || val.value}>
                                                    {getOptionDisplayLabel(item.id, attr.id, val)}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          );
                                        })}
                                      </div>
                                    )}
                                    
                                    <div className="text-right text-sm font-semibold text-primary">
                                      Subtotal: €{(((item.retail_price || 0) + (selection.attributePriceAddon || 0)) * selection.quantity).toFixed(2)}
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    className="w-full h-9 gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectItem(item);
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Adicionar
                                  </Button>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    {loadingMore && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                        <span className="text-muted-foreground">A carregar mais...</span>
                      </div>
                    )}
                    
                    {!hasMore && items.length > 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Todos os itens foram carregados
                      </div>
                    )}
                  </>
                ) : (
                  /* List view with table */
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="w-12 px-3 py-3"></th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">IVA</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-48">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {items.map((item) => {
                            const selection = getSelectionState(item.id);
                            const isSelected = !!selection;
                            
                            return (
                              <tr
                                key={item.id}
                                className={cn(
                                  "transition-colors cursor-pointer",
                                  isSelected 
                                    ? "bg-primary/5" 
                                    : "hover:bg-muted/30"
                                )}
                                onClick={() => !isSelected && handleSelectItem(item)}
                              >
                                <td className="px-3 py-3">
                                  <div className={cn(
                                    "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors mx-auto",
                                    isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                                  )}>
                                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="text-xs font-mono text-muted-foreground">{item.sku || "-"}</span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className="font-medium text-sm" title={item.name}>{item.name}</span>
                                </td>
                                <td className="px-3 py-3">
                                  {item.category_name && (
                                    <Badge variant="secondary" className="text-xs">
                                      {item.category_name}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className="font-semibold text-primary">
                                    €{item.retail_price?.toFixed(2) || "0.00"}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <Badge variant="outline" className="text-xs">
                                    {item.vat_rate || 0}%
                                  </Badge>
                                </td>
                                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                  {isSelected ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleQuantityChange(item.id, -1)}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={selection.quantity}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 1;
                                          const diff = val - selection.quantity;
                                          handleQuantityChange(item.id, diff);
                                        }}
                                        className="h-7 w-14 text-center text-sm"
                                        min={1}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleQuantityChange(item.id, 1)}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        onClick={() => handleRemoveItem(item.id)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="gap-1 h-7 text-xs"
                                      onClick={() => handleSelectItem(item)}
                                    >
                                      <Plus className="h-3 w-3" />
                                      Adicionar
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {loadingMore && (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                        <span className="text-muted-foreground text-sm">A carregar mais...</span>
                      </div>
                    )}
                    
                    {!hasMore && items.length > 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        Todos os itens foram carregados
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selected items sidebar - grouped by category */}
          <AnimatePresence>
            {(selectedItems.size > 0 || selectedBundles.size > 0) && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 400, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-l bg-muted/20 overflow-hidden flex flex-col h-full min-h-0"
              >
                <div className="p-4 border-b bg-background/80 shrink-0">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Itens Selecionados
                    <Badge variant="secondary">{selectedItems.size + selectedBundles.size}</Badge>
                  </h3>
                </div>
                
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-4">
                    {groupedSelectedItems.map(([groupName, items]) => (
                      <div key={groupName}>
                        {/* Group header */}
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {groupName}
                          </span>
                          <Badge variant="outline" className="h-5 text-xs">
                            {items.length}
                          </Badge>
                        </div>
                        
                        {/* Items in group */}
                        <div className="space-y-2 mb-4">
                          {items.map(({ item, quantity, attributePriceAddon }) => {
                            const basePrice = item.retail_price || 0;
                            const addon = attributePriceAddon || 0;
                            const unitPrice = basePrice + addon;
                            const lineTotal = unitPrice * quantity;
                            
                            const selectedAttrs = selectedItems.get(item.id);
                            const attrEntries = selectedAttrs ? Object.entries(selectedAttrs.attributes).filter(([, v]) => v) : [];
                            const itemAttrs = productAttributes.get(item.id) || [];
                            const attributeBreakdown = attrEntries.map(([attrId, selectedValue]) => {
                              const attrDef = itemAttrs.find(attr => attr.id === attrId);
                              const optionPrice = findOptionPriceForAttribute(item.id, attrId, selectedValue);
                              const valueLabel = attrDef?.values.find((option) => (option.rawValue || option.id || option.value) === selectedValue)?.value || selectedValue;
                              return {
                                key: attrId,
                                label: attrDef?.name || attrId,
                                valueLabel,
                                optionPrice,
                              };
                            });
                            
                            return (
                            <div 
                              key={item.id} 
                              className="flex items-start gap-3 p-3 rounded-lg bg-background border"
                            >
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm break-words" title={item.name}>{item.name}</h4>
                                <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                  <p>Preço base: €{basePrice.toFixed(2)}</p>
                                  {attributeBreakdown.map(({ key, label, valueLabel, optionPrice }) => (
                                    <p key={key}>
                                      {label}: {valueLabel}{formatOptionPriceLabel(optionPrice)}
                                    </p>
                                  ))}
                                  {addon > 0 && (
                                    <p className="text-primary">+ Atributos: €{addon.toFixed(2)}</p>
                                  )}
                                  {addon > 0 && (
                                    <p className="font-medium text-foreground">Unit.: €{unitPrice.toFixed(2)}</p>
                                  )}
                                  {quantity > 1 && (
                                    <p>{quantity}x €{unitPrice.toFixed(2)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-sm text-primary">
                                  €{lineTotal.toFixed(2)}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-destructive hover:text-destructive"
                                  onClick={() => handleRemoveItem(item.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                
                <div className="shrink-0 p-4 border-t bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-xl font-bold text-primary">
                      €{totals.value.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    {totals.count} item(s) selecionado(s)
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={selectedItems.size === 0 && selectedBundles.size === 0}
            className="gap-2 min-w-[180px]"
          >
            <Check className="h-4 w-4" />
            Adicionar {totals.count > 0 ? `${totals.count} Item(s)` : "Itens"}
            {totals.value > 0 && (
              <Badge variant="secondary" className="ml-1 bg-primary-foreground/20">
                €{totals.value.toFixed(2)}
              </Badge>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
