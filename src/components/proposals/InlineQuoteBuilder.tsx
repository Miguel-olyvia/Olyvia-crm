import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, FileText, Search, Package, Wrench, Loader2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { AddItemsDialog } from "@/components/quote/AddItemsDialog";
import { getEffectiveProductOptionPrices } from "@/lib/product-attribute-option-prices";
import { getEffectiveProductRanges } from "@/lib/product-attribute-ranges";

export interface InlineQuoteLine {
  id: string;
  section_name: string;
  descricao_snapshot: string;
  item_description?: string;
  qt: number;
  unidade?: string;
  custo_material_unit: number;
  custo_mao_obra_unit: number;
  margem_percent: number;
  iva_percent: number;
  int_percent: number;
  discount_percent: number;
  ordem: number;
  catalog_item_id?: string | null;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
  retail_price_unit?: number;
  cost_price?: number;
  selected_attributes?: Record<string, any>;
}

export interface InlineQuoteData {
  tempId: string;
  title: string;
  sections: string[];
  lines: InlineQuoteLine[];
  desconto_global_percent: number;
  validade_dias: number;
  iva_rate: number;
  obra_notas: string;
  client_notes: string;
  conditions: string;
  modelo_base: string;
}

interface InlineQuoteBuilderProps {
  quote: InlineQuoteData;
  onChange: (quote: InlineQuoteData) => void;
  onRemove: () => void;
  proposalTitle?: string;
  organizationId?: string;
}

let tempIdCounter = 0;
const genTempId = () => `temp_line_${Date.now()}_${tempIdCounter++}`;

const DEFAULT_IVA = 23;
const DEFAULT_MARGIN = 30;

/**
 * Tolerant numeric parser for quantity inputs.
 * - Accepts comma or dot as decimal separator (PT/EN locales).
 * - Returns null for empty/invalid input (caller decides default — never coerce silently to 0).
 * - Rejects negative values.
 */
export const parseQty = (raw: string | number | null | undefined): number | null => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const normalized = s.replace(",", ".");
  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
};

export const InlineQuoteBuilder = ({ quote, onChange, onRemove, proposalTitle, organizationId }: InlineQuoteBuilderProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; codigo: string; description: string | null; name: string }>>([]);
  const { activeCompany, companies: userCompanies } = useCompany();
  
  // Catalog dialog state
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  const [catalogSection, setCatalogSection] = useState("Geral");
  
  // Catalog data
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogServices, setCatalogServices] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const orgId = organizationId || activeCompany?.id;

  // Load products and services for catalog
  useEffect(() => {
    if (!orgId) { setCatalogLoading(false); return; }
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const userCompanyIds = userCompanies.map(c => c.id);
        const companyIds = userCompanyIds.length > 0 ? userCompanyIds : (orgId ? [orgId] : []);
        if (companyIds.length === 0) return;

        console.log('[InlineQuoteBuilder] Loading catalog for companies:', companyIds);

        // Fetch products and services in parallel
        const [productsRes, servicesRes] = await Promise.all([
          supabase
            .from("products")
            .select("id, name, sku, description, organization_id, product_categories!category_id(name), uom:uom_id(code, description)")
            .eq("is_sellable", true)
            .eq("is_active", true)
            .eq("status", "active")
            .in("organization_id", companyIds)
            .order("name")
            .limit(2000),
          supabase
            .from("services")
            .select("id, name, sku, short_desc, organization_id, service_categories:service_category_id(name)")
            .eq("is_active", true)
            .in("service_type", ["sale", "both"])
            .in("organization_id", companyIds)
            .order("name")
            .limit(2000),
        ]);

        console.log('[InlineQuoteBuilder] Products loaded:', productsRes.data?.length, 'Services:', servicesRes.data?.length, 'Error:', productsRes.error?.message, servicesRes.error?.message);

        const productIds = productsRes.data?.map((p: any) => p.id) || [];
        const serviceIds = servicesRes.data?.map((s: any) => s.id) || [];

        // Batch price queries to avoid URL length limits with large ID lists
        const BATCH_SIZE = 200;
        const allProdPrices: any[] = [];
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          const { data } = await supabase.from("product_prices").select("product_id, price, vat_rate").eq("price_type", "retail").in("product_id", batch);
          if (data) allProdPrices.push(...data);
        }
        const allSvcPrices: any[] = [];
        for (let i = 0; i < serviceIds.length; i += BATCH_SIZE) {
          const batch = serviceIds.slice(i, i + BATCH_SIZE);
          const { data } = await supabase.from("service_prices").select("service_id, price, vat_rate").eq("price_type", "retail").in("service_id", batch);
          if (data) allSvcPrices.push(...data);
        }

        const prodPriceMap = new Map(allProdPrices.map((p: any) => [p.product_id, { price: p.price, vat_rate: p.vat_rate }]));
        const svcPriceMap = new Map(allSvcPrices.map((s: any) => [s.service_id, { price: s.price, vat_rate: s.vat_rate }]));

        setCatalogProducts((productsRes.data || []).map((p: any) => {
          const priceInfo = prodPriceMap.get(p.id);
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            description: p.description,
            organization_id: p.organization_id,
            category_name: p.product_categories?.name || null,
            retail_price: priceInfo?.price || 0,
            vat_rate: priceInfo?.vat_rate || 23,
            type: "product" as const,
            uom_symbol: p.uom?.code || null,
            uom_name: p.uom?.description || null,
          };
        }));

        setCatalogServices((servicesRes.data || []).map((s: any) => {
          const priceInfo = svcPriceMap.get(s.id);
          return {
            id: s.id,
            name: s.name,
            sku: s.sku,
            description: s.short_desc,
            organization_id: s.organization_id,
            category_name: s.service_categories?.name || null,
            retail_price: priceInfo?.price || 0,
            vat_rate: priceInfo?.vat_rate || 23,
            type: "service" as const,
            uom_symbol: null,
            uom_name: null,
          };
        }));
      } catch (error) {
        console.error("Error loading catalog:", error);
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, [orgId, userCompanies]);

  const handleAddItemsFromDialog = (selectedItems: Array<any>) => {
    const defaultMargin = DEFAULT_MARGIN;
    const newLines: InlineQuoteLine[] = [];
    
    selectedItems.forEach((selected) => {
      const { item, quantity, fullAttributes, attributePriceAddon } = selected;
      const basePrice = item.retail_price ?? 0;
      const vatRate = item.vat_rate || DEFAULT_IVA;
      const retailPrice = basePrice + (attributePriceAddon || 0);
      
      const materialCost = retailPrice > 0 
        ? retailPrice / (1 + defaultMargin / 100)
        : 0;
      
      const maxOrdem = quote.lines.length + newLines.length > 0 
        ? Math.max(...[...quote.lines, ...newLines].map(l => l.ordem)) + 1 
        : 0;

      newLines.push({
        id: genTempId(),
        section_name: catalogSection,
        descricao_snapshot: item.name,
        qt: quantity,
        unidade: item.uom_symbol || item.uom_name || "un",
        custo_material_unit: materialCost,
        custo_mao_obra_unit: 0,
        margem_percent: materialCost > 0 ? defaultMargin : 0,
        iva_percent: vatRate,
        int_percent: 0,
        discount_percent: 0,
        ordem: maxOrdem,
        product_id: item.type === "product" ? item.id : null,
        service_id: item.type === "service" ? item.id : null,
        retail_price_unit: materialCost > 0 ? undefined : retailPrice,
        cost_price: materialCost,
        selected_attributes: fullAttributes || {},
      });
    });

    if (newLines.length > 0) {
      onChange({ ...quote, lines: [...quote.lines, ...newLines] });
    }
  };

  const openCatalogForSection = (sectionName: string) => {
    setCatalogSection(sectionName);
    setShowCatalogDialog(true);
  };

  useEffect(() => {
    fetchTemplates();
  }, [organizationId]);

  const fetchTemplates = async () => {
    try {
      let query = supabase
        .from("quote_templates")
        .select("id, codigo, description, name")
        .eq("active", true);

      const orgId = organizationId || activeCompany?.id;
      if (orgId) {
        query = query.or(`organization_id.is.null,organization_id.eq.${orgId}`);
      } else {
        query = query.is("organization_id", null);
      }

      const { data } = await query.order("codigo");
      setTemplates(data || []);
    } catch (e) {
      console.error("Error fetching templates:", e);
    }
  };

  const loadTemplate = async (templateCode: string) => {
    try {
      const orgId = organizationId || activeCompany?.id;
      let query = supabase.from("quote_templates").select("id").eq("codigo", templateCode).eq("active", true);
      if (orgId) {
        query = query.or(`organization_id.is.null,organization_id.eq.${orgId}`);
      } else {
        query = query.is("organization_id", null);
      }

      const { data: template, error: templateError } = await query.single();
      if (templateError || !template) throw templateError ?? new Error("Template não encontrado");

      const { data: templateItems, error: itemsError } = await supabase
        .from("quote_template_items")
        .select(`*, product:products(id, name, sku, uom:uom_id(code, description)), service:services(id, name, sku)`)
        .eq("template_id", template.id)
        .order("ordem");

      if (itemsError) throw itemsError;
      if (!templateItems || templateItems.length === 0) {
        onChange({ ...quote, modelo_base: templateCode });
        return;
      }

      const productIds = [...new Set(templateItems.filter((item: any) => item.product_id).map((item: any) => item.product_id))] as string[];
      const serviceIds = [...new Set(templateItems.filter((item: any) => item.service_id).map((item: any) => item.service_id))] as string[];
      const allAttributeIds = Array.from(new Set(
        templateItems.flatMap((item: any) => {
          if (item.default_attributes && typeof item.default_attributes === "object" && !Array.isArray(item.default_attributes)) {
            return Object.keys(item.default_attributes);
          }
          return [];
        })
      ));

      const [productRetailResult, productCostResult, serviceRetailResult, serviceCostResult, attrRangesResult, optionPricesByProduct] = await Promise.all([
        productIds.length > 0
          ? supabase.from("product_prices").select("product_id, price, vat_rate").eq("price_type", "retail").in("product_id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length > 0
          ? supabase.from("product_prices").select("product_id, price").eq("price_type", "purchase").in("product_id", productIds)
          : Promise.resolve({ data: [] as any[] }),
        serviceIds.length > 0
          ? supabase.from("service_prices").select("service_id, price, vat_rate").eq("price_type", "retail").in("service_id", serviceIds)
          : Promise.resolve({ data: [] as any[] }),
        serviceIds.length > 0
          ? supabase.from("service_prices").select("service_id, price").eq("price_type", "purchase").in("service_id", serviceIds)
          : Promise.resolve({ data: [] as any[] }),
        allAttributeIds.length > 0 && productIds.length > 0
          ? Promise.all(productIds.map(async (pid) => {
              const map = await getEffectiveProductRanges({
                productId: pid,
                attributeIds: allAttributeIds,
                priceContext: 'retail',
              });
              const flat: any[] = [];
              map.forEach((rows) => {
                for (const r of rows) flat.push({ ...r, product_id: pid });
              });
              return flat;
            })).then((arrays) => ({ data: arrays.flat() as any[] }))
          : Promise.resolve({ data: [] as any[] }),
        // Effective option prices respecting hierarchy (product → subcategory → category → ancestor → global)
        allAttributeIds.length > 0 && productIds.length > 0
          ? Promise.all(productIds.map(async (pid) => {
              const list = await getEffectiveProductOptionPrices({
                productId: pid,
                attributeIds: allAttributeIds,
                priceContext: 'retail',
              });
              return [pid, list] as const;
            })).then((entries) => new Map(entries))
          : Promise.resolve(new Map<string, Awaited<ReturnType<typeof getEffectiveProductOptionPrices>>>()),
      ]);

      const productRetailMap = new Map<string, { price: number; vat_rate: number }>(
        (productRetailResult.data || []).map((row: any) => [row.product_id, { price: Number(row.price) || 0, vat_rate: Number(row.vat_rate) || DEFAULT_IVA }])
      );
      const productCostMap = new Map<string, number>(
        (productCostResult.data || []).map((row: any) => [row.product_id, Number(row.price) || 0])
      );
      const serviceRetailMap = new Map<string, { price: number; vat_rate: number }>(
        (serviceRetailResult.data || []).map((row: any) => [row.service_id, { price: Number(row.price) || 0, vat_rate: Number(row.vat_rate) || DEFAULT_IVA }])
      );
      const serviceCostMap = new Map<string, number>(
        (serviceCostResult.data || []).map((row: any) => [row.service_id, Number(row.price) || 0])
      );

      const parseDimension = (value: string): { depth: number; width: number } | null => {
        const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
        return match ? { depth: parseFloat(match[1]), width: parseFloat(match[2]) } : null;
      };

      const parseDimension3d = (value: string): { depth: number; width: number; height: number } | null => {
        const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
        return match ? { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) } : null;
      };

      const extractNumericValue = (value: string): number | null => {
        const direct = parseFloat(value);
        if (!Number.isNaN(direct)) return direct;
        const dims3d = parseDimension3d(value);
        if (dims3d) return Math.max(dims3d.depth, dims3d.width, dims3d.height);
        const dims = parseDimension(value);
        if (dims) return Math.max(dims.depth, dims.width);
        const numMatch = value.match(/(\d+(?:\.\d+)?)/);
        return numMatch ? parseFloat(numMatch[1]) : null;
      };

      const findRangePrice = (productId: string, attrId: string, value: string): number => {
        const ranges = (attrRangesResult.data || []).filter((range: any) => range.attribute_id === attrId);
        if (ranges.length === 0) return 0;

        const productRanges = ranges.filter((range: any) => range.product_id === productId);
        const finalRanges = productRanges.length > 0 ? productRanges : ranges.filter((range: any) => range.product_id === null);
        if (finalRanges.length === 0) return 0;

        const dimension3dRanges = finalRanges.filter((range: any) => (range.range_type ?? "linear").toLowerCase() === "dimension3d");
        if (dimension3dRanges.length > 0) {
          const dims3d = parseDimension3d(value);
          if (dims3d) {
            const match = [...dimension3dRanges]
              .sort((a: any, b: any) => {
                const aVolume = ((a.max_depth || 999999) - (a.min_depth || 0)) * ((a.max_width || 999999) - (a.min_width || 0)) * ((a.max_height || 999999) - (a.min_height || 0));
                const bVolume = ((b.max_depth || 999999) - (b.min_depth || 0)) * ((b.max_width || 999999) - (b.min_width || 0)) * ((b.max_height || 999999) - (b.min_height || 0));
                return aVolume - bVolume;
              })
              .find((range: any) =>
                dims3d.depth >= (range.min_depth || 0) && (range.max_depth === null || dims3d.depth <= range.max_depth) &&
                dims3d.width >= (range.min_width || 0) && (range.max_width === null || dims3d.width <= range.max_width) &&
                dims3d.height >= (range.min_height || 0) && (range.max_height === null || dims3d.height <= range.max_height)
              );
            if (match) return match.price_per_unit || 0;
          }
        }

        const dimensionRanges = finalRanges.filter((range: any) => (range.range_type ?? "linear").toLowerCase() === "dimension");
        if (dimensionRanges.length > 0) {
          const dims = parseDimension(value);
          if (dims) {
            const match = [...dimensionRanges]
              .sort((a: any, b: any) => {
                const aArea = ((a.max_width || 999999) - (a.min_width || 0)) * ((a.max_height || 999999) - (a.min_height || 0));
                const bArea = ((b.max_width || 999999) - (b.min_width || 0)) * ((b.max_height || 999999) - (b.min_height || 0));
                return aArea - bArea;
              })
              .find((range: any) =>
                dims.depth >= (range.min_width || 0) && (range.max_width === null || dims.depth <= range.max_width) &&
                dims.width >= (range.min_height || 0) && (range.max_height === null || dims.width <= range.max_height)
              );
            if (match) return match.price_per_unit || 0;
          }
        }

        const linearRanges = finalRanges.filter((range: any) => {
          const rangeType = (range.range_type ?? "linear").toLowerCase();
          return rangeType === "linear" || rangeType === "";
        });
        if (linearRanges.length > 0) {
          const numericValue = extractNumericValue(value);
          if (numericValue !== null) {
            const match = [...linearRanges]
              .sort((a: any, b: any) => (((a.max_value || 999999) - (a.min_value || 0)) - ((b.max_value || 999999) - (b.min_value || 0))))
              .find((range: any) => numericValue >= (range.min_value || 0) && (range.max_value === null || numericValue <= range.max_value));
            if (match) return match.price_per_unit || 0;
          }
        }

        return 0;
      };

      const findOptionPrice = (productId: string, attrId: string, value: string): number => {
        if (!value) return 0;
        const list = optionPricesByProduct.get(productId) || [];
        const match = list.find((p) => p.attrId === attrId && p.value === value);
        return match ? Number(match.price) || 0 : 0;
      };

      const calculateAttributeAddon = (productId: string, attributes: Record<string, any>) => {
        let totalAddon = 0;
        Object.entries(attributes).forEach(([attrId, attrData]) => {
          const value = attrData?.value?.toString() || "";
          if (!value) return;
          totalAddon += findRangePrice(productId, attrId, value);
          totalAddon += findOptionPrice(productId, attrId, value);
        });
        return totalAddon;
      };

      const newLines: InlineQuoteLine[] = templateItems
        .map((item: any, idx: number) => {
          const defaultAttributes = item.default_attributes && typeof item.default_attributes === "object" && !Array.isArray(item.default_attributes)
            ? item.default_attributes as Record<string, any>
            : {};

          if (item.item_type === "product" && item.product) {
            const retailInfo = productRetailMap.get(item.product.id) || { price: 0, vat_rate: DEFAULT_IVA };
            const costPrice = productCostMap.get(item.product.id) || 0;
            const attributeAddon = Object.keys(defaultAttributes).length > 0
              ? calculateAttributeAddon(item.product.id, defaultAttributes)
              : 0;
            const retailPrice = retailInfo.price + attributeAddon;
            const marginPercent = costPrice > 0 && retailPrice > 0
              ? Math.max(0, ((retailPrice / costPrice) - 1) * 100)
              : (costPrice > 0 ? DEFAULT_MARGIN : 0);

            return {
              id: genTempId(),
              section_name: item.section_name || "Geral",
              descricao_snapshot: item.product.name,
              qt: Number(item.default_qt) || 1,
              unidade: (item.product as any).uom?.code || (item.product as any).uom?.description || "un",
              custo_material_unit: costPrice,
              custo_mao_obra_unit: 0,
              margem_percent: marginPercent,
              iva_percent: retailInfo.vat_rate,
              int_percent: 0,
              discount_percent: 0,
              ordem: idx,
              catalog_item_id: null,
              product_id: item.product.id,
              service_id: null,
              retail_price_unit: costPrice > 0 ? undefined : retailPrice,
              cost_price: costPrice,
              selected_attributes: defaultAttributes,
            };
          }

          if (item.item_type === "service" && item.service) {
            const retailInfo = serviceRetailMap.get(item.service.id) || { price: 0, vat_rate: DEFAULT_IVA };
            const costPrice = serviceCostMap.get(item.service.id) || 0;
            const marginPercent = costPrice > 0 && retailInfo.price > 0
              ? Math.max(0, ((retailInfo.price / costPrice) - 1) * 100)
              : (costPrice > 0 ? DEFAULT_MARGIN : 0);

            return {
              id: genTempId(),
              section_name: item.section_name || "Geral",
              descricao_snapshot: item.service.name,
              qt: Number(item.default_qt) || 1,
              unidade: "un",
              custo_material_unit: costPrice,
              custo_mao_obra_unit: 0,
              margem_percent: marginPercent,
              iva_percent: retailInfo.vat_rate,
              int_percent: 0,
              discount_percent: 0,
              ordem: idx,
              catalog_item_id: null,
              product_id: null,
              service_id: item.service.id,
              retail_price_unit: costPrice > 0 ? undefined : retailInfo.price,
              cost_price: costPrice,
              selected_attributes: defaultAttributes,
            };
          }

          return null;
        })
        .filter(Boolean) as InlineQuoteLine[];

      const sections = [...new Set(newLines.map((line) => line.section_name))];
      // If switching from a previously loaded template, replace its lines/sections.
      // Otherwise (no template yet), append to preserve any manually added lines.
      const isSwitchingTemplate = !!quote.modelo_base && quote.modelo_base !== templateCode;
      const baseLines = isSwitchingTemplate ? [] : quote.lines;
      const baseSections = isSwitchingTemplate ? [] : quote.sections;
      onChange({
        ...quote,
        lines: [...baseLines, ...newLines],
        sections: [...new Set([...baseSections, ...sections])],
        modelo_base: templateCode,
      });
    } catch (e) {
      console.error("Error loading template:", e);
    }
  };

  const addSection = () => {
    const newName = `Secção ${quote.sections.length + 1}`;
    onChange({ ...quote, sections: [...quote.sections, newName] });
  };

  const addLine = (sectionName: string) => {
    const maxOrdem = quote.lines.length > 0 ? Math.max(...quote.lines.map(l => l.ordem)) + 1 : 0;
    const newLine: InlineQuoteLine = {
      id: genTempId(),
      section_name: sectionName,
      descricao_snapshot: "",
      qt: 1,
      unidade: "un",
      custo_material_unit: 0,
      custo_mao_obra_unit: 0,
      margem_percent: DEFAULT_MARGIN,
      iva_percent: DEFAULT_IVA,
      int_percent: 0,
      discount_percent: 0,
      ordem: maxOrdem,
    };
    onChange({ ...quote, lines: [...quote.lines, newLine] });
  };

  const updateLine = (lineId: string, field: string, value: any) => {
    onChange({
      ...quote,
      lines: quote.lines.map(l => l.id === lineId ? { ...l, [field]: value } : l),
    });
  };

  const removeLine = (lineId: string) => {
    onChange({ ...quote, lines: quote.lines.filter(l => l.id !== lineId) });
  };

  const calcLinePrice = (line: InlineQuoteLine) => {
    const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
    const isManual = custoUnit === 0 && line.retail_price_unit !== undefined && line.retail_price_unit !== null;
    const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
    const base = unitPrice * line.qt;
    const afterDiscount = base * (1 - (line.discount_percent || 0) / 100);
    return afterDiscount;
  };

  const totalSemIva = quote.lines.reduce((sum, l) => sum + calcLinePrice(l), 0);
  const totalIva = quote.lines.reduce((sum, l) => sum + calcLinePrice(l) * (l.iva_percent / 100), 0);
  const totalAfterGlobalDiscount = totalSemIva * (1 - quote.desconto_global_percent / 100);
  const totalIvaAfterDiscount = totalIva * (1 - quote.desconto_global_percent / 100);
  const grandTotal = totalAfterGlobalDiscount + totalIvaAfterDiscount;

  const sectionNames = quote.sections.length > 0 ? quote.sections : ["Geral"];

  return (
    <Card className="border-primary/20 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <FileText className="h-4 w-4 text-primary" />
            <Input
              value={quote.title}
              onChange={(e) => onChange({ ...quote, title: e.target.value })}
              placeholder="Título do orçamento"
              className="font-semibold border-none bg-transparent p-0 h-auto text-base focus-visible:ring-0 shadow-none"
            />
          </div>
          <div className="flex items-center gap-1">
            {(() => {
              const invalidCount = quote.lines.filter(l => !l.qt || l.qt <= 0).length;
              if (invalidCount === 0) return null;
              return (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {invalidCount} {invalidCount === 1 ? "linha sem qtd" : "linhas sem qtd"}
                </Badge>
              );
            })()}
            <Badge variant="outline" className="text-xs">{formatCurrency(grandTotal)}</Badge>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-4">
          {/* Template selector */}
          {templates.length > 0 && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Template:</Label>
              <Select value={quote.modelo_base} onValueChange={(v) => { if (v !== "0") loadTemplate(v); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Nenhum</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.codigo}>{t.codigo} — {t.name || t.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sections and lines */}
          {sectionNames.map((sectionName, sIdx) => {
            const sectionLines = quote.lines.filter(l => l.section_name === sectionName);
            return (
              <div key={sIdx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Input
                    value={sectionName}
                    onChange={(e) => {
                      const newSections = [...quote.sections];
                      const oldName = newSections[sIdx];
                      newSections[sIdx] = e.target.value;
                      const newLines = quote.lines.map(l => l.section_name === oldName ? { ...l, section_name: e.target.value } : l);
                      onChange({ ...quote, sections: newSections, lines: newLines });
                    }}
                    className="font-medium text-sm border-none bg-transparent p-0 h-auto focus-visible:ring-0 shadow-none max-w-[200px]"
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openCatalogForSection(sectionName)} disabled={catalogLoading}>
                    {catalogLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Item
                  </Button>
                </div>

                {sectionLines.length > 0 && (
                  <div className="space-y-1">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_60px_60px_80px_80px_60px_80px_28px] gap-1 text-[10px] text-muted-foreground font-medium px-1">
                      <span>Descrição</span>
                      <span className="text-center">Qtd</span>
                      <span className="text-center">Un</span>
                      <span className="text-right">P. Custo</span>
                      <span className="text-right">P. Venda</span>
                      <span className="text-center">IVA%</span>
                      <span className="text-right">Total</span>
                      <span></span>
                    </div>

                    {sectionLines.map(line => {
                      const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
                      const isManual = custoUnit === 0;
                      const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
                      const lineTotal = calcLinePrice(line);

                      return (
                        <div key={line.id} className="grid grid-cols-[1fr_60px_60px_80px_80px_60px_80px_28px] gap-1 items-center">
                          <Input
                            value={line.descricao_snapshot}
                            onChange={(e) => updateLine(line.id, "descricao_snapshot", e.target.value)}
                            placeholder="Nome do item"
                            className="h-8 text-xs"
                          />
                          <div className="relative">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={line.qt === 0 ? "" : String(line.qt).replace(".", ",")}
                              onChange={(e) => {
                                const parsed = parseQty(e.target.value);
                                updateLine(line.id, "qt", parsed === null ? 0 : parsed);
                              }}
                              className={`h-8 text-xs text-center pr-5 ${(!line.qt || line.qt <= 0) ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            />
                            {(!line.qt || line.qt <= 0) && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-destructive pointer-events-auto" />
                                  </TooltipTrigger>
                                  <TooltipContent>Quantidade obrigatória (&gt; 0)</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <Input
                            value={line.unidade || "un"}
                            onChange={(e) => updateLine(line.id, "unidade", e.target.value)}
                            className="h-8 text-xs text-center"
                          />
                          <Input
                            type="number"
                            value={custoUnit || ""}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              updateLine(line.id, "custo_material_unit", v);
                              updateLine(line.id, "custo_mao_obra_unit", 0);
                            }}
                            placeholder="0.00"
                            className="h-8 text-xs text-right"
                            step="0.01"
                          />
                          <Input
                            type="number"
                            value={isManual ? (line.retail_price_unit ?? "") : unitPrice.toFixed(2)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              if (custoUnit > 0) {
                                const newMargin = ((v / custoUnit) - 1) * 100;
                                updateLine(line.id, "margem_percent", Math.max(0, newMargin));
                              } else {
                                updateLine(line.id, "retail_price_unit", v);
                              }
                            }}
                            placeholder="0.00"
                            className="h-8 text-xs text-right"
                            step="0.01"
                          />
                          <Input
                            type="number"
                            value={line.iva_percent}
                            onChange={(e) => updateLine(line.id, "iva_percent", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-center"
                          />
                          <div className="text-xs text-right font-medium pr-1">
                            {formatCurrency(lineTotal)}
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {sIdx < sectionNames.length - 1 && <Separator className="my-2" />}
              </div>
            );
          })}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addSection}>
              <Plus className="h-3 w-3" /> Nova Secção
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openCatalogForSection(sectionNames[0] || "Geral")} disabled={catalogLoading}>
              {catalogLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Adicionar Item
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => addLine(sectionNames[0] || "Geral")}>
              <Plus className="h-3 w-3" /> Item manual
            </Button>
          </div>

          {/* Catalog Dialog */}
          <AddItemsDialog
            open={showCatalogDialog}
            onOpenChange={setShowCatalogDialog}
            onAddItems={handleAddItemsFromDialog}
            products={catalogProducts}
            services={catalogServices}
          />

          {/* Totals */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (s/IVA)</span>
              <span>{formatCurrency(totalSemIva)}</span>
            </div>
            {quote.desconto_global_percent > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Desconto global ({quote.desconto_global_percent}%)</span>
                <span>-{formatCurrency(totalSemIva - totalAfterGlobalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span>{formatCurrency(totalIvaAfterDiscount)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-primary">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Extra options row */}
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Desc. global %</Label>
              <Input
                type="number"
                value={quote.desconto_global_percent || ""}
                onChange={(e) => onChange({ ...quote, desconto_global_percent: parseFloat(e.target.value) || 0 })}
                className="h-7 w-16 text-xs"
                min={0} max={100} step={0.5}
              />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Validade (dias)</Label>
              <Input
                type="number"
                value={quote.validade_dias}
                onChange={(e) => onChange({ ...quote, validade_dias: parseInt(e.target.value) || 30 })}
                className="h-7 w-16 text-xs"
                min={1}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export const createEmptyInlineQuote = (proposalTitle?: string): InlineQuoteData => ({
  tempId: `inline_${Date.now()}_${tempIdCounter++}`,
  title: proposalTitle || "Novo Orçamento",
  sections: ["Geral"],
  lines: [],
  desconto_global_percent: 0,
  validade_dias: 30,
  iva_rate: 23,
  obra_notas: "",
  client_notes: "",
  conditions: "",
  modelo_base: "0",
});

export const calcInlineQuoteTotal = (quote: InlineQuoteData): number => {
  const calcLinePrice = (line: InlineQuoteLine) => {
    const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
    const isManual = custoUnit === 0 && line.retail_price_unit !== undefined && line.retail_price_unit !== null;
    const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
    const base = unitPrice * line.qt;
    return base * (1 - (line.discount_percent || 0) / 100);
  };

  // Only count lines that will actually be persisted (qt > 0).
  // Keeps `proposal.value` consistent with the rows inserted into `quote_lines`.
  const validLines = quote.lines.filter(l => l.qt > 0);
  const totalSemIva = validLines.reduce((sum, l) => sum + calcLinePrice(l), 0);
  const totalIva = validLines.reduce((sum, l) => sum + calcLinePrice(l) * (l.iva_percent / 100), 0);
  const afterDiscount = totalSemIva * (1 - quote.desconto_global_percent / 100);
  const ivaAfterDiscount = totalIva * (1 - quote.desconto_global_percent / 100);
  return afterDiscount + ivaAfterDiscount;
};
