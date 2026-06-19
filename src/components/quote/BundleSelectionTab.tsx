import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { 
  Search, Package, Plus, Check, X, Loader2, ChevronDown, ChevronRight, Layers, Tag
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import LineAttributesDialog from "@/components/LineAttributesDialog";

interface BundleComponent {
  id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  is_optional: boolean;
  pricing_mode: string;
  custom_price: number | null;
  custom_discount_percent: number | null;
  custom_discount_fixed: number | null;
  choice_group_id: string | null;
  sort_order: number;
  // Joined data
  product?: {
    id: string;
    name: string;
    sku: string | null;
    product_prices: Array<{ price: number; vat_rate: number; price_type: string }>;
  };
  service?: {
    id: string;
    name: string;
    sku: string | null;
    service_prices: Array<{ price: number; vat_rate: number; price_type: string }>;
  };
}

interface BundleChoiceGroup {
  id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  sort_order: number;
  components: BundleComponent[];
}

interface Bundle {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  pricing_type: string;
  fixed_price: number | null;
  discount_percent: number | null;
  discount_fixed: number | null;
  is_active: boolean;
  status: string;
  organization_id: string;
  components: BundleComponent[];
  choice_groups: BundleChoiceGroup[];
}

interface ExpandedBundleLine {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  type: "product" | "service";
  source_id: string; // product_id or service_id
  quantity: number;
  unit_price: number;
  vat_rate: number;
  bundle_id: string;
  bundle_name: string;
  is_bundle_component: true;
  // Per-component attribute configuration (for choice-group selections)
  selected_attributes?: Record<string, any>;
  attribute_price_addon?: number;
  choice_group_id?: string | null;
}

interface ComponentAttributeState {
  selected_attributes: Record<string, any>;
  price_addon: number;
}

interface SelectedBundle {
  bundle: Bundle;
  quantity: number;
  choiceSelections: Record<string, Record<string, number>>; // choice_group_id -> { component_id: qty }
  excludedComponentIds: string[]; // IDs de componentes (fixos/opcionais) a EXCLUIR do bundle
  // Per choice-group attributes: groupId -> ComponentAttributeState
  choiceAttributes?: Record<string, ComponentAttributeState>;
  expandedLines: ExpandedBundleLine[];
}

interface Props {
  selectedBundles: Map<string, SelectedBundle>;
  onSelectionChange: (bundles: Map<string, SelectedBundle>) => void;
  viewMode: "grid" | "list";
}

const PAGE_SIZE = 50;

export function BundleSelectionTab({ selectedBundles, onSelectionChange, viewMode }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [openComponentsBundleId, setOpenComponentsBundleId] = useState<string | null>(null);
  const [openChoiceGroupsBundleId, setOpenChoiceGroupsBundleId] = useState<string | null>(null);
  const [openChoiceCombobox, setOpenChoiceCombobox] = useState<string | null>(null);

  // Attribute dialog state for choice groups
  const [attrDialogState, setAttrDialogState] = useState<{
    bundleId: string;
    groupId: string;
    productId: string;
    productName: string;
    currentAttrs: Record<string, any>;
  } | null>(null);
  
  const currentPageRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load bundles
  const isInitialLoadRef = useRef(true);
  const loadBundles = useCallback(async (append = false) => {
    if (!activeCompany?.id) return;
    
    if (append) {
      setLoadingMore(true);
    } else {
      // Only show full-screen loader on initial mount; subsequent searches use a subtle indicator
      if (isInitialLoadRef.current) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      currentPageRef.current = 0;
    }

    const from = currentPageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      let query = supabase
        .from("bundles")
        .select(`
          id, sku, name, description, pricing_type, fixed_price, 
          discount_percent, discount_fixed, is_active, status, organization_id,
          bundle_components (
            id, product_id, service_id, quantity, is_optional, 
            pricing_mode, custom_price, custom_discount_percent, custom_discount_fixed,
            choice_group_id, sort_order,
            products:product_id (
              id, name, sku,
              product_prices (price, vat_rate, price_type)
            ),
            services:service_id (
              id, name, sku,
              service_prices (price, vat_rate, price_type)
            )
          ),
          bundle_choice_groups (
            id, name, description, min_selections, max_selections, is_required, sort_order
          )
        `)
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name")
        .range(from, to);

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const mappedBundles: Bundle[] = (data || []).map((b: any) => {
        // Map components with joined data
        const components: BundleComponent[] = (b.bundle_components || []).map((c: any) => ({
          id: c.id,
          product_id: c.product_id,
          service_id: c.service_id,
          quantity: c.quantity,
          is_optional: c.is_optional,
          pricing_mode: c.pricing_mode,
          custom_price: c.custom_price,
          custom_discount_percent: c.custom_discount_percent,
          custom_discount_fixed: c.custom_discount_fixed,
          choice_group_id: c.choice_group_id,
          sort_order: c.sort_order,
          product: c.products ? {
            id: c.products.id,
            name: c.products.name,
            sku: c.products.sku,
            product_prices: c.products.product_prices || []
          } : undefined,
          service: c.services ? {
            id: c.services.id,
            name: c.services.name,
            sku: c.services.sku,
            service_prices: c.services.service_prices || []
          } : undefined,
        }));

        // Map choice groups with their components
        const choiceGroups: BundleChoiceGroup[] = (b.bundle_choice_groups || []).map((g: any) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          min_selections: g.min_selections,
          max_selections: g.max_selections,
          is_required: g.is_required,
          sort_order: g.sort_order,
          components: components.filter(c => c.choice_group_id === g.id)
        }));

        return {
          id: b.id,
          sku: b.sku,
          name: b.name,
          description: b.description,
          pricing_type: b.pricing_type,
          fixed_price: b.fixed_price,
          discount_percent: b.discount_percent,
          discount_fixed: b.discount_fixed,
          is_active: b.is_active,
          status: b.status,
          organization_id: b.organization_id,
          components,
          choice_groups: choiceGroups,
        };
      });

      if (append) {
        setBundles(prev => [...prev, ...mappedBundles]);
      } else {
        setBundles(mappedBundles);
      }

      setHasMore(mappedBundles.length === PAGE_SIZE);
      currentPageRef.current += 1;
    } catch (error) {
      console.error("Error loading bundles:", error);
      toast({ title: t('bundles.toast.errorLoading'), variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isInitialLoadRef.current = false;
    }
  }, [activeCompany?.id, debouncedSearch, t, toast]);

  useEffect(() => {
    loadBundles(false);
  }, [activeCompany?.id, debouncedSearch]);

  // Calculate component price based on pricing mode
  const getComponentPrice = (comp: BundleComponent, bundlePricingType: string, bundleDiscount?: { percent?: number; fixed?: number }): number => {
    const basePrice = comp.product 
      ? (comp.product.product_prices?.find(p => p.price_type === 'retail')?.price || 0)
      : (comp.service?.service_prices?.find(p => p.price_type === 'retail')?.price || 0);

    // Handle component-level pricing
    switch (comp.pricing_mode) {
      case 'custom_price':
        return comp.custom_price || basePrice;
      case 'custom_discount_percent':
        return basePrice * (1 - (comp.custom_discount_percent || 0) / 100);
      case 'custom_discount_fixed':
        return Math.max(0, basePrice - (comp.custom_discount_fixed || 0));
      case 'original':
      default:
        // Apply bundle-level discount if custom pricing type
        if (bundlePricingType === 'percentage_discount' && bundleDiscount?.percent) {
          return basePrice * (1 - bundleDiscount.percent / 100);
        }
        if (bundlePricingType === 'fixed_discount' && bundleDiscount?.fixed) {
          // Distribute fixed discount proportionally (simplified)
          return basePrice; // Will be calculated at bundle level
        }
        return basePrice;
    }
  };

  const getComponentVatRate = (comp: BundleComponent): number => {
    // Use the VAT rate of the underlying product/service (e.g. services typically 6%, materials 23%).
    const isProduct = !!comp.product_id;
    const retailPrice = isProduct
      ? comp.product?.product_prices?.find(p => p.price_type === 'retail')
      : comp.service?.service_prices?.find(p => p.price_type === 'retail');
    const vat = retailPrice?.vat_rate;
    return typeof vat === 'number' ? vat : 23;
  };

  // Calculate bundle total price (including selected choice group components with per-component quantity)
  const calculateBundlePrice = (
    bundle: Bundle,
    choiceSelections?: Record<string, Record<string, number>>,
    excludedComponentIds: string[] = []
  ): { original: number; final: number } => {
    const excluded = new Set(excludedComponentIds);
    const requiredComponents = bundle.components.filter(c => !c.is_optional && !c.choice_group_id && !excluded.has(c.id));
    const optionalIncluded = bundle.components.filter(c => c.is_optional && !c.choice_group_id && !excluded.has(c.id));

    // Selected choice components with their per-component quantity multiplier
    const selectedChoiceEntries: Array<{ comp: BundleComponent; qty: number }> = [];
    if (choiceSelections) {
      Object.values(choiceSelections).forEach(map => {
        Object.entries(map || {}).forEach(([compId, qty]) => {
          if (!qty || qty <= 0) return;
          const comp = bundle.components.find(c => c.id === compId);
          if (comp && !excluded.has(comp.id)) selectedChoiceEntries.push({ comp, qty });
        });
      });
    }

    const allEntries: Array<{ comp: BundleComponent; qty: number }> = [
      ...requiredComponents.map(c => ({ comp: c, qty: 1 })),
      ...optionalIncluded.map(c => ({ comp: c, qty: 1 })),
      ...selectedChoiceEntries,
    ];

    const originalTotal = allEntries.reduce((sum, { comp, qty }) => {
      const basePrice = comp.product
        ? (comp.product.product_prices?.find(p => p.price_type === 'retail')?.price || 0)
        : (comp.service?.service_prices?.find(p => p.price_type === 'retail')?.price || 0);
      return sum + (basePrice * comp.quantity * qty);
    }, 0);

    let finalPrice = originalTotal;

    switch (bundle.pricing_type) {
      case 'fixed_price':
        finalPrice = bundle.fixed_price || originalTotal;
        break;
      case 'percentage_discount':
        finalPrice = originalTotal * (1 - (bundle.discount_percent || 0) / 100);
        break;
      case 'fixed_discount':
        finalPrice = Math.max(0, originalTotal - (bundle.discount_fixed || 0));
        break;
      case 'custom':
        finalPrice = allEntries.reduce((sum, { comp, qty }) => {
          return sum + (getComponentPrice(comp, bundle.pricing_type) * comp.quantity * qty);
        }, 0);
        break;
    }

    return { original: originalTotal, final: finalPrice };
  };

  // Estimate a "starting from" price for bundles whose components live entirely
  // (or mostly) inside choice groups. Picks the cheapest option of each required
  // group, so the user always sees a meaningful price on the card.
  const calculateBundleStartingPrice = (bundle: Bundle): number => {
    const fixedComponents = bundle.components.filter(c => !c.choice_group_id && !c.is_optional);
    const fixedTotal = fixedComponents.reduce((sum, comp) => {
      return sum + getComponentPrice(comp, bundle.pricing_type) * comp.quantity;
    }, 0);

    let choiceTotal = 0;
    bundle.choice_groups.forEach(group => {
      const groupComps = bundle.components.filter(c => c.choice_group_id === group.id);
      if (groupComps.length === 0) return;
      const minSel = Math.max(1, group.min_selections || (group.is_required ? 1 : 0));
      if (minSel <= 0) return;
      const prices = groupComps
        .map(c => getComponentPrice(c, bundle.pricing_type) * c.quantity)
        .sort((a, b) => a - b);
      for (let i = 0; i < Math.min(minSel, prices.length); i++) {
        choiceTotal += prices[i];
      }
    });

    return fixedTotal + choiceTotal;
  };

  // Expand bundle into quote lines
  const expandBundleToLines = (
    bundle: Bundle,
    quantity: number,
    choiceSelections: Record<string, Record<string, number>>,
    excludedComponentIds: string[] = [],
    choiceAttributes: Record<string, ComponentAttributeState> = {}
  ): ExpandedBundleLine[] => {
    const lines: ExpandedBundleLine[] = [];
    const excluded = new Set(excludedComponentIds);

    // Calculate total original price for proportional discount distribution (including choice selections)
    const { original: originalTotal, final: finalTotal } = calculateBundlePrice(bundle, choiceSelections, excludedComponentIds);
    const discountRatio = originalTotal > 0 ? finalTotal / originalTotal : 1;

    const requiredComponents = bundle.components.filter(c => !c.is_optional && !c.choice_group_id && !excluded.has(c.id));
    const optionalIncluded = bundle.components.filter(c => c.is_optional && !c.choice_group_id && !excluded.has(c.id));

    const selectedChoiceEntries: Array<{ comp: BundleComponent; qty: number }> = [];
    Object.values(choiceSelections).forEach(map => {
      Object.entries(map || {}).forEach(([compId, qty]) => {
        if (!qty || qty <= 0) return;
        const comp = bundle.components.find(c => c.id === compId);
        if (comp && !excluded.has(comp.id)) selectedChoiceEntries.push({ comp, qty });
      });
    });

    const allEntries: Array<{ comp: BundleComponent; qty: number }> = [
      ...requiredComponents.map(c => ({ comp: c, qty: 1 })),
      ...optionalIncluded.map(c => ({ comp: c, qty: 1 })),
      ...selectedChoiceEntries,
    ];

    allEntries.forEach(({ comp, qty: choiceQty }) => {
      const isProduct = !!comp.product_id;
      const item = isProduct ? comp.product : comp.service;
      if (!item) return;

      const basePrice = isProduct
        ? (comp.product?.product_prices?.find(p => p.price_type === 'retail')?.price || 0)
        : (comp.service?.service_prices?.find(p => p.price_type === 'retail')?.price || 0);

      let unitPrice = basePrice;

      if (bundle.pricing_type === 'fixed_price' && originalTotal > 0) {
        const proportion = basePrice / originalTotal;
        unitPrice = (bundle.fixed_price || 0) * proportion;
      } else if (bundle.pricing_type === 'percentage_discount') {
        unitPrice = basePrice * (1 - (bundle.discount_percent || 0) / 100);
      } else if (bundle.pricing_type === 'fixed_discount' && originalTotal > 0) {
        const proportion = basePrice / originalTotal;
        const discountShare = (bundle.discount_fixed || 0) * proportion;
        unitPrice = Math.max(0, basePrice - discountShare);
      } else if (bundle.pricing_type === 'custom') {
        unitPrice = getComponentPrice(comp, bundle.pricing_type);
      }

      // Apply per-component attribute addon (only for choice-group winners)
      const groupId = comp.choice_group_id;
      const attrState = groupId ? choiceAttributes[groupId] : undefined;
      const attributePriceAddon = attrState?.price_addon || 0;
      const componentSelectedAttrs = attrState?.selected_attributes;
      if (attributePriceAddon > 0) {
        unitPrice = unitPrice + attributePriceAddon;
      }

      lines.push({
        id: `${bundle.id}_${comp.id}`,
        name: item.name,
        description: `[${bundle.name}] ${item.name}`,
        sku: item.sku || null,
        type: isProduct ? "product" : "service",
        source_id: isProduct ? comp.product_id! : comp.service_id!,
        quantity: comp.quantity * choiceQty * quantity,
        unit_price: unitPrice,
        vat_rate: getComponentVatRate(comp),
        bundle_id: bundle.id,
        bundle_name: bundle.name,
        is_bundle_component: true,
        selected_attributes: componentSelectedAttrs,
        attribute_price_addon: attributePriceAddon || undefined,
        choice_group_id: groupId || null,
      });
    });

    return lines;
  };

  // Handle bundle selection
  const handleSelectBundle = (bundle: Bundle) => {
    const newSelected = new Map(selectedBundles);

    if (newSelected.has(bundle.id)) {
      const existing = newSelected.get(bundle.id)!;
      const newQty = existing.quantity + 1;
      const expandedLines = expandBundleToLines(bundle, newQty, existing.choiceSelections, existing.excludedComponentIds, existing.choiceAttributes || {});
      newSelected.set(bundle.id, { ...existing, quantity: newQty, expandedLines });
    } else {
      const choiceSelections: Record<string, Record<string, number>> = {};
      bundle.choice_groups.forEach(group => {
        const groupComponents = bundle.components.filter(c => c.choice_group_id === group.id);
        const map: Record<string, number> = {};
        groupComponents.slice(0, group.min_selections).forEach(c => { map[c.id] = 1; });
        choiceSelections[group.id] = map;
      });

      const excludedComponentIds: string[] = [];
      const choiceAttributes: Record<string, ComponentAttributeState> = {};
      const expandedLines = expandBundleToLines(bundle, 1, choiceSelections, excludedComponentIds, choiceAttributes);
      newSelected.set(bundle.id, { bundle, quantity: 1, choiceSelections, excludedComponentIds, choiceAttributes, expandedLines });
    }

    onSelectionChange(newSelected);
  };

  // Toggle ANY component (fixed/optional/choice) inclusion in the bundle
  const handleToggleComponent = (bundleId: string, componentId: string, included: boolean) => {
    const bundleSelection = selectedBundles.get(bundleId);
    if (!bundleSelection) return;

    const comp = bundleSelection.bundle.components.find(c => c.id === componentId);
    if (!comp) return;

    let newExcluded = [...bundleSelection.excludedComponentIds];
    let newChoiceSelections: Record<string, Record<string, number>> = { ...bundleSelection.choiceSelections };
    let newChoiceAttributes = { ...(bundleSelection.choiceAttributes || {}) };

    if (comp.choice_group_id) {
      const groupId = comp.choice_group_id;
      const currentMap: Record<string, number> = { ...(newChoiceSelections[groupId] || {}) };
      const prevKeys = Object.keys(currentMap);
      const group = bundleSelection.bundle.choice_groups.find(g => g.id === groupId);
      const groupComponentsCount = bundleSelection.bundle.components.filter(c => c.choice_group_id === groupId).length;
      const effectiveMaxSelections = Math.max(group?.max_selections || 1, groupComponentsCount || 1);

      if (!included) {
        delete currentMap[componentId];
      } else if (!(componentId in currentMap)) {
        const sumOthers = Object.values(currentMap).reduce((s, q) => s + q, 0);
        if (effectiveMaxSelections <= 1) {
          // single-select: replace whatever is there
          for (const k of Object.keys(currentMap)) delete currentMap[k];
          currentMap[componentId] = 1;
        } else if (sumOthers >= effectiveMaxSelections) {
          // group full: drop the first entry (FIFO, preserves previous swap behaviour)
          const firstKey = Object.keys(currentMap)[0];
          if (firstKey) delete currentMap[firstKey];
          currentMap[componentId] = 1;
        } else {
          currentMap[componentId] = 1;
        }
      }

      newChoiceSelections[groupId] = currentMap;

      // If the set of distinct components changed, clear stored attrs
      const nextKeys = Object.keys(currentMap);
      const sameSet = prevKeys.length === nextKeys.length && prevKeys.every(id => nextKeys.includes(id));
      if (!sameSet) {
        delete newChoiceAttributes[groupId];
      }
    } else {
      if (included) {
        newExcluded = newExcluded.filter(id => id !== componentId);
      } else if (!newExcluded.includes(componentId)) {
        newExcluded.push(componentId);
      }
    }

    const expandedLines = expandBundleToLines(
      bundleSelection.bundle,
      bundleSelection.quantity,
      newChoiceSelections,
      newExcluded,
      newChoiceAttributes
    );

    const newSelected = new Map(selectedBundles);
    newSelected.set(bundleId, {
      ...bundleSelection,
      choiceSelections: newChoiceSelections,
      excludedComponentIds: newExcluded,
      choiceAttributes: newChoiceAttributes,
      expandedLines,
    });
    onSelectionChange(newSelected);
  };

  // Change the quantity of a specific component inside a choice group.
  // Clamped to [0, effectiveMaxSelections - sumOfOthers]; reaching 0 removes the selection.
  const handleChoiceQtyChange = (bundleId: string, groupId: string, componentId: string, nextQty: number) => {
    const bundleSelection = selectedBundles.get(bundleId);
    if (!bundleSelection) return;

    const group = bundleSelection.bundle.choice_groups.find(g => g.id === groupId);
    const groupComponentsCount = bundleSelection.bundle.components.filter(c => c.choice_group_id === groupId).length;
    const effectiveMaxSelections = Math.max(group?.max_selections || 1, groupComponentsCount || 1);

    const currentMap: Record<string, number> = { ...(bundleSelection.choiceSelections[groupId] || {}) };
    const prevKeys = Object.keys(currentMap);
    const sumOthers = Object.entries(currentMap).reduce((s, [k, q]) => s + (k === componentId ? 0 : q), 0);
    const clamped = Math.max(0, Math.min(nextQty, effectiveMaxSelections - sumOthers));

    if (clamped === 0) {
      delete currentMap[componentId];
    } else {
      currentMap[componentId] = clamped;
    }

    const newChoiceSelections = { ...bundleSelection.choiceSelections, [groupId]: currentMap };
    let newChoiceAttributes = { ...(bundleSelection.choiceAttributes || {}) };
    const nextKeys = Object.keys(currentMap);
    const sameSet = prevKeys.length === nextKeys.length && prevKeys.every(id => nextKeys.includes(id));
    if (!sameSet) {
      delete newChoiceAttributes[groupId];
    }

    const expandedLines = expandBundleToLines(
      bundleSelection.bundle,
      bundleSelection.quantity,
      newChoiceSelections,
      bundleSelection.excludedComponentIds,
      newChoiceAttributes
    );

    const newSelected = new Map(selectedBundles);
    newSelected.set(bundleId, {
      ...bundleSelection,
      choiceSelections: newChoiceSelections,
      choiceAttributes: newChoiceAttributes,
      expandedLines,
    });
    onSelectionChange(newSelected);
  };



  // Handle choice selection change (kept for backwards compat with existing UI)
  const handleChoiceChange = (bundleId: string, groupId: string, componentId: string, selected: boolean) => {
    handleToggleComponent(bundleId, componentId, selected);
  };

  // Save attributes for a choice group's selected component
  const handleSaveGroupAttributes = (
    bundleId: string,
    groupId: string,
    selectedAttributes: Record<string, any>,
    priceAddon: number
  ) => {
    const bundleSelection = selectedBundles.get(bundleId);
    if (!bundleSelection) return;

    const newChoiceAttributes = {
      ...(bundleSelection.choiceAttributes || {}),
      [groupId]: { selected_attributes: selectedAttributes, price_addon: priceAddon },
    };

    const expandedLines = expandBundleToLines(
      bundleSelection.bundle,
      bundleSelection.quantity,
      bundleSelection.choiceSelections,
      bundleSelection.excludedComponentIds,
      newChoiceAttributes
    );

    const newSelected = new Map(selectedBundles);
    newSelected.set(bundleId, {
      ...bundleSelection,
      choiceAttributes: newChoiceAttributes,
      expandedLines,
    });
    onSelectionChange(newSelected);
  };

  // Update bundle quantity
  const handleQuantityChange = (bundleId: string, newQuantity: number) => {
    const bundleSelection = selectedBundles.get(bundleId);
    if (!bundleSelection) return;

    if (newQuantity < 1) {
      handleRemoveBundle(bundleId);
      return;
    }

    const expandedLines = expandBundleToLines(
      bundleSelection.bundle,
      newQuantity,
      bundleSelection.choiceSelections,
      bundleSelection.excludedComponentIds,
      bundleSelection.choiceAttributes || {}
    );
    const newSelected = new Map(selectedBundles);
    newSelected.set(bundleId, { ...bundleSelection, quantity: newQuantity, expandedLines });
    onSelectionChange(newSelected);
  };

  // Remove bundle
  const handleRemoveBundle = (bundleId: string) => {
    const newSelected = new Map(selectedBundles);
    newSelected.delete(bundleId);
    onSelectionChange(newSelected);
  };

  // Infinite scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore && !loading) {
      loadBundles(true);
    }
  }, [hasMore, loadingMore, loading, loadBundles]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <OlyviaLoader size={40} text="A carregar bundles..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('bundles.searchPlaceholder')}
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

      {/* Results */}
      <div 
        className="overflow-y-auto"
        style={{ maxHeight: 'calc(90vh - 480px)' }}
        onScroll={handleScroll}
        ref={scrollRef}
      >
        {bundles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">{t('bundles.noBundles')}</h3>
            <p className="text-muted-foreground max-w-sm">
              Não existem bundles ativos. Crie bundles na página de catálogo.
            </p>
          </div>
        ) : (
          <div className={cn(
            viewMode === "grid" 
              ? "grid grid-cols-2 lg:grid-cols-3 gap-4" 
              : "space-y-2"
          )}>
            {bundles.map((bundle) => {
              const selection = selectedBundles.get(bundle.id);
              const isSelected = !!selection;
              // Pass choice selections to include selected items in price calculation
              const { original, final } = calculateBundlePrice(bundle, selection?.choiceSelections, selection?.excludedComponentIds);
              const hasChoices = bundle.choice_groups.length > 0;
              const isExpanded = expandedBundle === bundle.id;
              // When a bundle has choices and the user hasn't picked yet, "final" is 0.
              // Show a "from" price using the cheapest option in each required choice group.
              const hasAnyChoiceSelection = !!selection && Object.values(selection.choiceSelections || {}).some(map => Object.values(map || {}).some(q => q > 0));
              const showStartingFrom = hasChoices && !hasAnyChoiceSelection && final === 0;
              const startingPrice = showStartingFrom ? calculateBundleStartingPrice(bundle) : 0;
              const displayPrice = showStartingFrom ? startingPrice : final;
              const displayOriginal = showStartingFrom ? startingPrice : original;

              return (
                <motion.div
                  key={bundle.id}
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
                    onClick={() => !isSelected && !hasChoices && handleSelectBundle(bundle)}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10">
                        <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          <Layers className="h-3 w-3 mr-1" />
                          Bundle
                        </Badge>
                        {bundle.sku && (
                          <Badge variant="secondary" className="text-xs font-mono">
                            {bundle.sku}
                          </Badge>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-sm mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                        {bundle.name}
                      </h3>
                      
                      {bundle.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {bundle.description}
                        </p>
                      )}

                      {/* Components count */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Package className="h-3 w-3" />
                        <span>{bundle.components.length} {t('bundles.items')}</span>
                        {hasChoices && (
                          <Badge variant="outline" className="text-xs">
                            + escolhas
                          </Badge>
                        )}
                      </div>

                      {/* Pricing */}
                      <div className="space-y-1 mb-3">
                        {!showStartingFrom && displayOriginal !== displayPrice && (
                          <p className="text-xs text-muted-foreground line-through">
                            {formatCurrency(displayOriginal)}
                          </p>
                        )}
                        <div className="flex items-baseline gap-1">
                          {showStartingFrom && (
                            <span className="text-xs text-muted-foreground">A partir de</span>
                          )}
                          <p className="text-lg font-bold text-primary">
                            {formatCurrency(displayPrice)}
                          </p>
                        </div>
                        {bundle.pricing_type === 'percentage_discount' && bundle.discount_percent && (
                          <Badge variant="destructive" className="text-xs">
                            -{bundle.discount_percent}%
                          </Badge>
                        )}
                      </div>

                      {/* Components panel removed — choice groups remain below */}

                      {/* Choice groups panel */}
                      {hasChoices && isSelected && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between mb-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenChoiceGroupsBundleId((current) => current === bundle.id ? null : bundle.id);
                            }}
                          >
                            <span>Grupos de escolha</span>
                            <ChevronDown className={cn("h-4 w-4 transition-transform", openChoiceGroupsBundleId === bundle.id && "rotate-180")} />
                          </Button>

                          {openChoiceGroupsBundleId === bundle.id && (
                            <div className="space-y-3">
                              {bundle.choice_groups
                                .filter((group) => bundle.components.some((c) => c.choice_group_id === group.id))
                                .map((group) => {
                                const groupMap: Record<string, number> = selection?.choiceSelections[group.id] || {};
                                const groupSelectedIds = Object.keys(groupMap).filter(id => (groupMap[id] || 0) > 0);
                                const groupTotalQty = Object.values(groupMap).reduce((s, q) => s + (q || 0), 0);
                                const groupComponents = bundle.components.filter((c) => c.choice_group_id === group.id);
                                const effectiveMaxSelections = Math.max(group.max_selections || 1, groupComponents.length || 1);

                                // Attributes editable only when exactly one DISTINCT product is selected.
                                const singleSelectedCompId = groupSelectedIds.length === 1 ? groupSelectedIds[0] : null;
                                const singleSelectedComp = singleSelectedCompId
                                  ? groupComponents.find(c => c.id === singleSelectedCompId)
                                  : null;
                                const canEditAttrs = !!singleSelectedComp?.product_id;
                                const groupAttrState = selection?.choiceAttributes?.[group.id];
                                const filledAttrCount = groupAttrState
                                  ? Object.values(groupAttrState.selected_attributes || {}).filter((a: any) => {
                                      const v = a?.value;
                                      return v !== undefined && v !== null && v !== '' && v !== false && v !== 0;
                                    }).length
                                  : 0;

                                const openAttrsForGroup = () => {
                                  if (!singleSelectedComp?.product_id || !singleSelectedComp.product) return;
                                  setAttrDialogState({
                                    bundleId: bundle.id,
                                    groupId: group.id,
                                    productId: singleSelectedComp.product_id,
                                    productName: singleSelectedComp.product.name,
                                    currentAttrs: groupAttrState?.selected_attributes || {},
                                  });
                                };

                                const triggerLabel = (() => {
                                  if (groupSelectedIds.length === 0) return "Selecionar componentes...";
                                  if (groupSelectedIds.length === 1) {
                                    const only = groupComponents.find(c => c.id === groupSelectedIds[0]);
                                    const name = only?.product?.name || only?.service?.name || "1 selecionado";
                                    const q = groupMap[groupSelectedIds[0]] || 0;
                                    return q > 1 ? `${name} ×${q}` : name;
                                  }
                                  return `${groupSelectedIds.length} componentes (${groupTotalQty} un.)`;
                                })();

                                return (
                                  <div key={group.id} className="space-y-2 rounded-lg border p-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium">{group.name}</span>
                                      {group.is_required && <Badge variant="outline" className="text-xs">Obrigatório</Badge>}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <Popover
                                          open={openChoiceCombobox === `${bundle.id}:${group.id}`}
                                          onOpenChange={(open) => setOpenChoiceCombobox(open ? `${bundle.id}:${group.id}` : null)}
                                        >
                                          <PopoverTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              role="combobox"
                                              className="h-8 flex-1 min-w-0 justify-between px-3 text-xs font-normal"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <span className="truncate">{triggerLabel}</span>
                                              <Badge variant="outline" className="ml-2 text-[10px] shrink-0">
                                                {groupTotalQty}/{effectiveMaxSelections}
                                              </Badge>
                                              <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent
                                            align="start"
                                            className="w-[var(--radix-popover-trigger-width)] min-w-[28rem] p-0 z-[650]"
                                            onClick={(e) => e.stopPropagation()}
                                            onWheel={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                          >
                                            <Command>
                                              <CommandInput placeholder="Pesquisar componente..." />
                                              <CommandList
                                                className="max-h-72 overflow-y-auto"
                                                onWheel={(e) => e.stopPropagation()}
                                              >
                                                <CommandEmpty>Nenhum componente encontrado.</CommandEmpty>
                                                <CommandGroup>
                                                  {groupComponents.map((comp) => {
                                                    const item = comp.product || comp.service;
                                                    const price = getComponentPrice(comp, bundle.pricing_type);
                                                    const compQty = groupMap[comp.id] || 0;
                                                    const isChecked = compQty > 0;
                                                    const sumOthers = groupTotalQty - compQty;
                                                    const remaining = effectiveMaxSelections - sumOthers;
                                                    const canIncrement = compQty < remaining;
                                                    const atMax = !isChecked && sumOthers >= effectiveMaxSelections;
                                                    const label = `${item?.name || "Componente"} ${item?.sku || ""} ${formatCurrency(price * comp.quantity)}`;
                                                    return (
                                                      <CommandItem
                                                        key={comp.id}
                                                        value={label}
                                                        disabled={atMax}
                                                        onSelect={() => {
                                                          if (atMax) return;
                                                          handleChoiceChange(bundle.id, group.id, comp.id, !isChecked);
                                                        }}
                                                        className="gap-2 text-xs"
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={isChecked}
                                                          readOnly
                                                          className="rounded pointer-events-none"
                                                        />
                                                        <span className="flex-1 truncate">{item?.name || "Componente"}</span>
                                                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(price * comp.quantity)}</span>
                                                        {isChecked && (
                                                          <div
                                                            className="flex items-center gap-1 ml-2 shrink-0"
                                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                                            onPointerDown={(e) => e.stopPropagation()}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                          >
                                                            <Button
                                                              type="button"
                                                              variant="outline"
                                                              size="icon"
                                                              className="h-5 w-5"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                handleChoiceQtyChange(bundle.id, group.id, comp.id, compQty - 1);
                                                              }}
                                                            >
                                                              <span className="text-sm leading-none">−</span>
                                                            </Button>
                                                            <span className="w-5 text-center tabular-nums text-xs">{compQty}</span>
                                                            <Button
                                                              type="button"
                                                              variant="outline"
                                                              size="icon"
                                                              className="h-5 w-5"
                                                              disabled={!canIncrement}
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                handleChoiceQtyChange(bundle.id, group.id, comp.id, compQty + 1);
                                                              }}
                                                            >
                                                              <Plus className="h-3 w-3" />
                                                            </Button>
                                                          </div>
                                                        )}
                                                      </CommandItem>
                                                    );
                                                  })}
                                                </CommandGroup>
                                              </CommandList>
                                            </Command>
                                          </PopoverContent>
                                        </Popover>
                                        <Button
                                          type="button"
                                          variant={filledAttrCount > 0 ? "default" : "outline"}
                                          size="icon"
                                          className="h-8 w-8 shrink-0 relative"
                                          disabled={!canEditAttrs}
                                          title={
                                            canEditAttrs
                                              ? "Configurar atributos"
                                              : "Selecione exatamente um produto para configurar atributos"
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openAttrsForGroup();
                                          }}
                                        >
                                          <Tag className="h-3.5 w-3.5" />
                                          {filledAttrCount > 0 && (
                                            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                                              {filledAttrCount}
                                            </span>
                                          )}
                                        </Button>
                                      </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {isSelected ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleQuantityChange(bundle.id, selection.quantity - 1); 
                              }}
                            >
                              <span className="text-lg font-medium">−</span>
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              value={selection.quantity}
                              onChange={(e) => {
                                e.stopPropagation();
                                const val = parseInt(e.target.value) || 1;
                                handleQuantityChange(bundle.id, val);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 w-14 text-center text-sm px-1"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleQuantityChange(bundle.id, selection.quantity + 1); 
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleRemoveBundle(bundle.id); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full h-9 gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectBundle(bundle);
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
        )}

        {loadingMore && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-muted-foreground">A carregar mais...</span>
          </div>
        )}
      </div>

      {attrDialogState && (
        <LineAttributesDialog
          open={!!attrDialogState}
          onOpenChange={(open) => {
            if (!open) setAttrDialogState(null);
          }}
          productId={attrDialogState.productId}
          productName={attrDialogState.productName}
          currentAttributes={attrDialogState.currentAttrs}
          onSave={(attrs, addon) => {
            handleSaveGroupAttributes(
              attrDialogState.bundleId,
              attrDialogState.groupId,
              attrs,
              addon
            );
            setAttrDialogState(null);
          }}
        />
      )}
    </div>
  );
}

export type { ExpandedBundleLine, SelectedBundle };
