import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PRICE_CONTEXT_CODES, type PriceContextCode } from "@/hooks/usePriceContexts";
import { getEffectiveProductAttributes, type AttributeSource } from "@/lib/product-attributes";
import { getEffectiveProductOptionPrices, type EffectiveOptionPrice } from "@/lib/product-attribute-option-prices";
import { getEffectiveProductRanges } from "@/lib/product-attribute-ranges";

const SOURCE_BADGE_LABEL: Record<AttributeSource, string> = {
  product: "Produto",
  subcategory: "Subcategoria",
  category: "Categoria",
  ancestor_category: "Categoria-pai",
};

interface LineAttributesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentAttributes: Record<string, any>; // attribute_id: {attribute_code, label, value, value_type, unit?}
  onSave: (attributes: Record<string, any>, attributePriceAddon: number) => void;
  priceContext?: PriceContextCode; // 'retail' | 'bundle' - defaults to 'retail'
}

interface PriceRange {
  id: string;
  range_type: string;
  min_value?: number;
  max_value?: number;
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  min_depth?: number;
  max_depth?: number;
  price_per_unit: number;
}

interface OptionPrice {
  id: string;
  attribute_id: string;
  value_option: string;
  price: number;
  product_id?: string | null;
}

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  unit?: string;
  allowed_values?: any;
  source?: AttributeSource;
}

export default function LineAttributesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentAttributes,
  onSave,
  priceContext = PRICE_CONTEXT_CODES.RETAIL
}: LineAttributesDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [availableAttributes, setAvailableAttributes] = useState<ProductAttribute[]>([]);
  const [lineAttributes, setLineAttributes] = useState<Record<string, any>>({});
  const [attributePricingInfo, setAttributePricingInfo] = useState<Record<string, { pricing_type: string; ranges: PriceRange[] }>>({});
  const [optionPrices, setOptionPrices] = useState<EffectiveOptionPrice[]>([]);

  useEffect(() => {
    if (open && productId) {
      loadProductAttributes();
      setLineAttributes({ ...currentAttributes });
    }
  }, [open, productId, currentAttributes, priceContext]);

  const loadProductAttributes = async () => {
    try {
      // Discover the effective set of attributes via the centralized helper.
      // This walks product → subcategory → category → ancestors and never drops inherited attrs.
      const effective = await getEffectiveProductAttributes({
        productId,
        priceContext,
        includeDirectValues: true,
      });

      const attrs: ProductAttribute[] = effective.map((e) => {
        // Prefer resolved options (only available for list-like / palette / fixed-price attrs).
        let allowed: any = e.allowed_values ?? null;
        if (e.resolvedOptions && e.resolvedOptions.length > 0) {
          const availableValues = e.resolvedOptions
            .filter((r) => r.is_available !== false)
            .map((r) => r.value_text);
          if (availableValues.length > 0) {
            allowed = availableValues;
          }
        }
        return {
          id: e.id,
          code: e.code,
          label: e.label,
          value_type: e.value_type,
          unit: e.unit ?? undefined,
          allowed_values: allowed,
          source: e.source,
        };
      });

      const attrIds = attrs.map((a) => a.id);
      // Keep raw effective rows around so we can carry pricing_type into attributePricingInfo.
      const effectiveById = new Map(effective.map((e) => [e.id, e]));

      setAvailableAttributes(attrs);

      // Load pricing ranges via unified helper (Product → Subcategory → Category → Ancestor → Global)
      // Same hierarchy as option prices, so the same product shows the same ranges everywhere.
      if (attrIds.length > 0) {
        const rangesByAttr = await getEffectiveProductRanges({
          productId,
          attributeIds: attrIds,
          priceContext,
        });

        // Load effective option prices via helper (respects product → subcategory → category → ancestor → global)
        const effectiveOptPrices = await getEffectiveProductOptionPrices({
          productId,
          attributeIds: attrIds,
          priceContext,
        });

        setOptionPrices(effectiveOptPrices);

        const pricingInfo: Record<string, { pricing_type: string; ranges: PriceRange[] }> = {};
        attrs.forEach(attr => {
          const finalRanges = (rangesByAttr.get(attr.id) || []) as unknown as PriceRange[];
          pricingInfo[attr.id] = {
            pricing_type: effectiveById.get(attr.id)?.pricing_type || 'none',
            ranges: finalRanges
          };
        });
        setAttributePricingInfo(pricingInfo);
      }

      // If currentAttributes is empty, initialize with all product attributes
      if (Object.keys(currentAttributes).length === 0 && attrs.length > 0) {
        const initAttrs: Record<string, any> = {};
        attrs.forEach(attr => {
          const eff = effectiveById.get(attr.id);
          const direct = eff?.directValue;
          // Pre-fill from direct value when available, otherwise default per type.
          let initialValue: any = getDefaultValue(attr.value_type);
          if (direct) {
            if (direct.value_text != null && direct.value_text !== '') initialValue = direct.value_text;
            else if (direct.value_number != null) initialValue = direct.value_number;
            else if (direct.value_bool != null) initialValue = direct.value_bool;
            else if (direct.value_date) initialValue = direct.value_date;
          }
          initAttrs[attr.id] = {
            attribute_code: attr.code,
            label: attr.label,
            value_type: attr.value_type,
            unit: attr.unit,
            value: initialValue
          };
        });
        setLineAttributes(initAttrs);
      } else if (Object.keys(currentAttributes).length > 0) {
        // Enrich existing attributes with labels if missing (for backwards compatibility)
        const enrichedAttrs: Record<string, any> = {};
        attrs.forEach(attr => {
          const existing = currentAttributes[attr.id];
          const eff = effectiveById.get(attr.id);
          const direct = eff?.directValue;
          if (existing) {
            // Ensure all fields are populated
            enrichedAttrs[attr.id] = {
              attribute_code: existing.attribute_code || attr.code,
              label: existing.label || attr.label,
              value_type: existing.value_type || attr.value_type,
              unit: existing.unit || attr.unit,
              value: existing.value ?? getDefaultValue(attr.value_type)
            };
          } else {
            // Add missing attributes from product definition (or inherited from category).
            let initialValue: any = getDefaultValue(attr.value_type);
            if (direct) {
              if (direct.value_text != null && direct.value_text !== '') initialValue = direct.value_text;
              else if (direct.value_number != null) initialValue = direct.value_number;
              else if (direct.value_bool != null) initialValue = direct.value_bool;
              else if (direct.value_date) initialValue = direct.value_date;
            }
            enrichedAttrs[attr.id] = {
              attribute_code: attr.code,
              label: attr.label,
              value_type: attr.value_type,
              unit: attr.unit,
              value: initialValue
            };
          }
        });
        setLineAttributes(enrichedAttrs);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar atributos",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getDefaultValue = (valueType: string) => {
    switch (valueType) {
      case 'boolean':
        return false;
      case 'number':
        return 0;
      default:
        return '';
    }
  };

  const handleValueChange = (attributeId: string, value: any) => {
    setLineAttributes(prev => ({
      ...prev,
      [attributeId]: {
        ...prev[attributeId],
        value
      }
    }));
  };

  // Dimension parsing helpers (same logic as AddItemsDialog)
  const parseDimension = (value: string): { depth: number; width: number } | null => {
    const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return { depth: parseFloat(match[1]), width: parseFloat(match[2]) };
    }
    return null;
  };

  const parseDimension3d = (value: string): { depth: number; width: number; height: number } | null => {
    const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      return { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) };
    }
    return null;
  };

  const extractNumericValue = (value: string): number | null => {
    const direct = parseFloat(value);
    if (!isNaN(direct)) return direct;
    const dims3d = parseDimension3d(value);
    if (dims3d) return Math.max(dims3d.depth, dims3d.width, dims3d.height);
    const dims = parseDimension(value);
    if (dims) return Math.max(dims.depth, dims.width);
    const numMatch = value.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) return parseFloat(numMatch[1]);
    return null;
  };

  const findRangePrice = (attrId: string, value: string): number => {
    const pricingInfo = attributePricingInfo[attrId];
    const pricingType = (pricingInfo?.pricing_type || 'none').toString().trim().toLowerCase();
    
    if (!pricingInfo || !['range', 'both'].includes(pricingType) || pricingInfo.ranges.length === 0) {
      return 0;
    }
    
    const ranges = pricingInfo.ranges;
    
    // Check 3D dimension ranges first
    const dimension3dRanges = ranges.filter((r) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension3d');
    if (dimension3dRanges.length > 0) {
      const dims3d = parseDimension3d(value);
      if (dims3d) {
        const sortedRanges = [...dimension3dRanges].sort((a, b) => {
          const aVolume = ((a.max_depth || 999999) - (a.min_depth || 0)) * 
                          ((a.max_width || 999999) - (a.min_width || 0)) * 
                          ((a.max_height || 999999) - (a.min_height || 0));
          const bVolume = ((b.max_depth || 999999) - (b.min_depth || 0)) * 
                          ((b.max_width || 999999) - (b.min_width || 0)) * 
                          ((b.max_height || 999999) - (b.min_height || 0));
          return aVolume - bVolume;
        });
        const match = sortedRanges.find((r) => 
          dims3d.depth >= (r.min_depth || 0) && (r.max_depth === null || dims3d.depth <= r.max_depth) &&
          dims3d.width >= (r.min_width || 0) && (r.max_width === null || dims3d.width <= r.max_width) &&
          dims3d.height >= (r.min_height || 0) && (r.max_height === null || dims3d.height <= r.max_height)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    // Check 2D dimension ranges (CxL)
    const dimensionRanges = ranges.filter((r) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension');
    if (dimensionRanges.length > 0) {
      const dims = parseDimension(value);
      if (dims) {
        const sortedRanges = [...dimensionRanges].sort((a, b) => {
          const aArea = ((a.max_width || 999999) - (a.min_width || 0)) * ((a.max_height || 999999) - (a.min_height || 0));
          const bArea = ((b.max_width || 999999) - (b.min_width || 0)) * ((b.max_height || 999999) - (b.min_height || 0));
          return aArea - bArea;
        });
        const match = sortedRanges.find((r) => 
          dims.depth >= (r.min_width || 0) && (r.max_width === null || dims.depth <= r.max_width) &&
          dims.width >= (r.min_height || 0) && (r.max_height === null || dims.width <= r.max_height)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    // Check linear ranges
    const linearRanges = ranges.filter((r) => {
      const rt = (r.range_type ?? 'linear').toString().trim().toLowerCase();
      return rt === 'linear' || rt === '';
    });
    if (linearRanges.length > 0) {
      const numValue = extractNumericValue(value);
      if (numValue !== null) {
        const sortedRanges = [...linearRanges].sort((a, b) => {
          const aRange = (a.max_value || 999999) - (a.min_value || 0);
          const bRange = (b.max_value || 999999) - (b.min_value || 0);
          return aRange - bRange;
        });
        const match = sortedRanges.find((r) => 
          numValue >= (r.min_value || 0) && (r.max_value === null || numValue <= r.max_value)
        );
        if (match) return match.price_per_unit || 0;
      }
    }
    
    return 0;
  };

  // Check if dimension value matches at least one price range
  const isDimensionInRange = (attrId: string, value: string): boolean => {
    const pricingInfo = attributePricingInfo[attrId];
    if (!pricingInfo || pricingInfo.ranges.length === 0) return true; // No ranges defined = allow anything
    
    const pricingType = (pricingInfo.pricing_type || 'none').toString().trim().toLowerCase();
    if (!['range', 'both'].includes(pricingType)) return true;
    
    if (!value.trim()) return true; // Empty is ok
    
    const ranges = pricingInfo.ranges;
    
    // Check 3D dimension ranges
    const dimension3dRanges = ranges.filter((r) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension3d');
    if (dimension3dRanges.length > 0) {
      const dims3d = parseDimension3d(value);
      if (dims3d) {
        const match = dimension3dRanges.find((r) => 
          dims3d.depth >= (r.min_depth || 0) && (r.max_depth === null || dims3d.depth <= r.max_depth) &&
          dims3d.width >= (r.min_width || 0) && (r.max_width === null || dims3d.width <= r.max_width) &&
          dims3d.height >= (r.min_height || 0) && (r.max_height === null || dims3d.height <= r.max_height)
        );
        return !!match;
      }
    }
    
    // Check 2D dimension ranges
    const dimensionRanges = ranges.filter((r) => (r.range_type ?? 'linear').toString().trim().toLowerCase() === 'dimension');
    if (dimensionRanges.length > 0) {
      const dims = parseDimension(value);
      if (dims) {
        const match = dimensionRanges.find((r) => 
          dims.depth >= (r.min_width || 0) && (r.max_width === null || dims.depth <= r.max_width) &&
          dims.width >= (r.min_height || 0) && (r.max_height === null || dims.width <= r.max_height)
        );
        return !!match;
      }
    }
    
    // Check linear ranges
    const linearRanges = ranges.filter((r) => {
      const rt = (r.range_type ?? 'linear').toString().trim().toLowerCase();
      return rt === 'linear' || rt === '';
    });
    if (linearRanges.length > 0) {
      const numValue = extractNumericValue(value);
      if (numValue !== null) {
        const match = linearRanges.find((r) => 
          numValue >= (r.min_value || 0) && (r.max_value === null || numValue <= r.max_value)
        );
        return !!match;
      }
    }
    
    return false;
  };

  // Find option price for list attributes (like colors).
  // Helper already returns the best (most specific) effective price per attr/value.
  const findOptionPrice = (attrId: string, value: string): number => {
    if (!value) return 0;
    const match = optionPrices.find((p) => p.attrId === attrId && p.value === value);
    return match ? Number(match.price) || 0 : 0;
  };

  const calculateAttributePriceAddon = (): number => {
    let totalAddon = 0;
    Object.entries(lineAttributes).forEach(([attrId, attrData]) => {
      const value = attrData.value?.toString() || '';
      if (value) {
        // Check for range-based pricing (dimensions)
        const rangePrice = findRangePrice(attrId, value);
        totalAddon += rangePrice;
        
        // Check for fixed option pricing (colors, materials, etc.)
        const optPrice = findOptionPrice(attrId, value);
        totalAddon += optPrice;
      }
    });
    return totalAddon;
  };

  // Check if all dimension attributes have valid values within ranges
  const hasInvalidDimensions = (): boolean => {
    for (const [attrId, attrData] of Object.entries(lineAttributes)) {
      const dimensionType = hasDimensionPricing(attrId);
      if (dimensionType) {
        const value = (attrData.value || '').toString().trim();
        if (value && !isDimensionInRange(attrId, value)) {
          return true;
        }
      }
    }
    return false;
  };

  const handleSave = () => {
    if (hasInvalidDimensions()) {
      toast({
        title: "Medida fora do intervalo",
        description: "Uma ou mais medidas não estão dentro dos intervalos de preço definidos.",
        variant: "destructive"
      });
      return;
    }
    const attributePriceAddon = calculateAttributePriceAddon();
    onSave(lineAttributes, attributePriceAddon);
    onOpenChange(false);
  };

  // Build a human-readable list of available dimension/linear ranges to guide the user
  const getAvailableRangesHint = (attrId: string): string[] => {
    const pricingInfo = attributePricingInfo[attrId];
    if (!pricingInfo || pricingInfo.ranges.length === 0) return [];
    const fmt = (n: number | null | undefined, fallback: string) =>
      n === null || n === undefined ? fallback : String(n);
    const lines: string[] = [];
    pricingInfo.ranges.forEach((r) => {
      const rt = (r.range_type ?? 'linear').toString().trim().toLowerCase();
      const price = r.price_per_unit ? ` (+€${Number(r.price_per_unit).toFixed(2)})` : '';
      if (rt === 'dimension3d') {
        lines.push(
          `${fmt(r.min_depth, '0')}–${fmt(r.max_depth, '∞')} x ${fmt(r.min_width, '0')}–${fmt(r.max_width, '∞')} x ${fmt(r.min_height, '0')}–${fmt(r.max_height, '∞')}${price}`
        );
      } else if (rt === 'dimension') {
        lines.push(
          `${fmt(r.min_width, '0')}–${fmt(r.max_width, '∞')} x ${fmt(r.min_height, '0')}–${fmt(r.max_height, '∞')}${price}`
        );
      } else {
        lines.push(`${fmt(r.min_value, '0')}–${fmt(r.max_value, '∞')}${price}`);
      }
    });
    return lines;
  };

  // Check if attribute has dimension-based pricing
  const hasDimensionPricing = (attrId: string): 'dimension' | 'dimension3d' | null => {
    const pricingInfo = attributePricingInfo[attrId];
    if (!pricingInfo || !['range', 'both'].includes(pricingInfo.pricing_type)) return null;
    
    const has3d = pricingInfo.ranges.some(r => (r.range_type ?? 'linear').toLowerCase() === 'dimension3d');
    if (has3d) return 'dimension3d';
    
    const has2d = pricingInfo.ranges.some(r => (r.range_type ?? 'linear').toLowerCase() === 'dimension');
    if (has2d) return 'dimension';
    
    return null;
  };

  // Validate dimension format
  const isValidDimensionFormat = (value: string, type: 'dimension' | 'dimension3d'): boolean => {
    if (!value.trim()) return true; // Empty is ok
    if (type === 'dimension3d') {
      return /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?(\s*(cm|mm|m)?)?$/.test(value.trim());
    }
    return /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?(\s*(cm|mm|m)?)?$/.test(value.trim());
  };

  const handleDimensionBlur = (attributeId: string, value: string) => {
    const dimensionType = hasDimensionPricing(attributeId);
    if (dimensionType && value.trim() && !isValidDimensionFormat(value, dimensionType)) {
      // Clear invalid format
      handleValueChange(attributeId, '');
    }
  };

  const renderValueInput = (attributeId: string, attrData: any) => {
    const attribute = availableAttributes.find(a => a.id === attributeId);
    if (!attribute) return null;

    const currentValue = attrData.value;
    const dimensionType = hasDimensionPricing(attributeId);

    // Real-time validation for dimension inputs
    const dimension2dRegex = /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?$/;
    const dimension3dRegex = /^\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?\s*[xX]\s*\d+(\.\d+)?$/;
    const currentValueStr = (currentValue || '').toString().trim();
    const isValidFormat = !currentValueStr || 
      dimension2dRegex.test(currentValueStr) || 
      dimension3dRegex.test(currentValueStr);
    
    // Check if dimension is within defined price ranges
    const isInRange = dimensionType ? isDimensionInRange(attributeId, currentValueStr) : true;
    const hasError = dimensionType && currentValueStr && (!isValidFormat || !isInRange);

    switch (attribute.value_type) {
      case 'text':
      case 'string':
        // Check if this attribute has dimension-based pricing
        if (dimensionType) {
          const placeholder = dimensionType === 'dimension3d' 
            ? 'CxLxA (ex: 50x90x120)' 
            : 'CxL (ex: 90x120)';
          const rangesHint = getAvailableRangesHint(attributeId);
          return (
            <div className="space-y-1">
              <Input
                type="text"
                value={currentValue || ''}
                onChange={(e) => handleValueChange(attributeId, e.target.value)}
                onBlur={(e) => handleDimensionBlur(attributeId, e.target.value)}
                placeholder={placeholder}
                className={`font-mono ${hasError ? 'border-destructive' : ''}`}
              />
              {rangesHint.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Medidas disponíveis:</span>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {rangesHint.map((line, i) => (
                      <li key={i} className="font-mono">{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!isValidFormat && currentValueStr && (
                <p className="text-xs text-destructive">
                  Formato: {dimensionType === 'dimension3d' ? 'CxLxA (ex: 50x90x120)' : 'CxL (ex: 90x120)'}
                </p>
              )}
              {isValidFormat && !isInRange && currentValueStr && (
                <p className="text-xs text-destructive">
                  Medida fora dos intervalos de preço definidos
                </p>
              )}
            </div>
          );
        }
        return (
          <Input
            type="text"
            value={currentValue || ''}
            onChange={(e) => handleValueChange(attributeId, e.target.value)}
            placeholder="Valor"
          />
        );
      case 'list':
        if (attribute.allowed_values && Array.isArray(attribute.allowed_values)) {
          return (
            <Select
              value={currentValue || ''}
              onValueChange={(value) => handleValueChange(attributeId, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar opção" />
              </SelectTrigger>
              <SelectContent>
                {attribute.allowed_values.map((option: string) => {
                  const optPrice = findOptionPrice(attributeId, option);
                  return (
                    <SelectItem key={option} value={option}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{option}</span>
                        {optPrice > 0 && (
                          <span className="text-xs text-muted-foreground">+€{optPrice.toFixed(2)}</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            type="text"
            value={currentValue || ''}
            onChange={(e) => handleValueChange(attributeId, e.target.value)}
            placeholder="Valor"
          />
        );
      case 'number':
        // If this number attribute has dimension-based pricing, render text input for CxL / CxLxA
        if (dimensionType) {
          const placeholder = dimensionType === 'dimension3d'
            ? 'CxLxA (ex: 50x90x120)'
            : 'CxL (ex: 90x120)';
          const rangesHintNum = getAvailableRangesHint(attributeId);
          return (
            <div className="space-y-1">
              <div className="flex gap-2 items-center">
                <Input
                  type="text"
                  value={currentValue ?? ''}
                  onChange={(e) => handleValueChange(attributeId, e.target.value)}
                  onBlur={(e) => handleDimensionBlur(attributeId, e.target.value)}
                  placeholder={placeholder}
                  className={`font-mono ${hasError ? 'border-destructive' : ''}`}
                />
                {attribute.unit && <span className="text-sm text-muted-foreground">{attribute.unit}</span>}
              </div>
              {rangesHintNum.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Medidas disponíveis{attribute.unit ? ` (${attribute.unit})` : ''}:</span>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {rangesHintNum.map((line, i) => (
                      <li key={i} className="font-mono">{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!isValidFormat && currentValueStr && (
                <p className="text-xs text-destructive">
                  Formato: {dimensionType === 'dimension3d' ? 'CxLxA (ex: 50x90x120)' : 'CxL (ex: 90x120)'}
                </p>
              )}
              {isValidFormat && !isInRange && currentValueStr && (
                <p className="text-xs text-destructive">
                  Medida fora dos intervalos de preço definidos
                </p>
              )}
            </div>
          );
        }
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              value={currentValue || 0}
              onChange={(e) => handleValueChange(attributeId, parseFloat(e.target.value) || 0)}
              placeholder="Valor"
            />
            {attribute.unit && <span className="text-sm text-muted-foreground">{attribute.unit}</span>}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={currentValue || false}
              onCheckedChange={(checked) => handleValueChange(attributeId, checked)}
            />
            <span className="text-sm">{currentValue ? 'Sim' : 'Não'}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Atributos de Linha: {productName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {availableAttributes.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                Este produto não tem atributos configurados.
              </p>
              <p className="text-xs text-muted-foreground">
                Configure atributos no produto primeiro em Catálogo → Produtos.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <h3 className="font-medium text-sm">Configurar valores para esta linha</h3>
                
                <div className="space-y-3">
                  {Object.entries(lineAttributes).map(([attributeId, attrData]) => {
                    const attribute = availableAttributes.find(a => a.id === attributeId);
                    if (!attribute) return null;
                    
                    // Calculate individual addon for this attribute
                    const value = attrData.value?.toString() || '';
                    const rangeAddon = value ? findRangePrice(attributeId, value) : 0;
                    const optionAddon = value ? findOptionPrice(attributeId, value) : 0;
                    const totalAttrAddon = rangeAddon + optionAddon;

                    return (
                      <div key={attributeId} className="flex gap-3 items-start p-3 border rounded-lg">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label className="font-medium">{attrData.label}</Label>
                              <Badge variant="outline" className="text-xs">
                                {attrData.value_type}
                              </Badge>
                              {attribute.source && attribute.source !== 'product' && (
                                <Badge variant="secondary" className="text-xs">
                                  {SOURCE_BADGE_LABEL[attribute.source]}
                                </Badge>
                              )}
                            </div>
                            {totalAttrAddon > 0 && (
                              <Badge variant="secondary" className="text-xs font-medium">
                                +€{totalAttrAddon.toFixed(2)}
                              </Badge>
                            )}
                          </div>
                          {renderValueInput(attributeId, attrData)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Show price addon preview */}
              {calculateAttributePriceAddon() > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Adicional de atributos:</span>
                    <span className="text-sm font-bold text-primary">+€{calculateAttributePriceAddon().toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este valor será adicionado ao preço base do produto
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "A salvar..." : "Confirmar"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
