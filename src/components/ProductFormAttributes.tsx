import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Tag } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  unit?: string;
  allowed_values?: any;
  valorization_type?: string;
  pricing_dimension?: string;
}

export interface AttributeFormValue {
  attribute_id: string;
  attribute?: ProductAttribute;
  value_text?: string;
  value_number?: number;
  value_bool?: boolean;
}

interface ResolvedOption {
  value_text: string;
  display_name: string;
  hex_color: string | null;
}

interface ProductFormAttributesProps {
  attributes: AttributeFormValue[];
  onChange: (attributes: AttributeFormValue[]) => void;
  productId?: string;
  productCategoryId?: string | null;
}

export default function ProductFormAttributes({ attributes, onChange, productId, productCategoryId }: ProductFormAttributesProps) {
  const { t } = useTranslation();
  const [availableAttributes, setAvailableAttributes] = useState<ProductAttribute[]>([]);
  const [newAttributeId, setNewAttributeId] = useState<string>("");
  const [resolvedOptions, setResolvedOptions] = useState<Record<string, ResolvedOption[]>>({});

  useEffect(() => {
    loadAttributes();
  }, []);

  // Resolve options for all assigned list-type attributes whenever assignments or category change
  useEffect(() => {
    if (attributes.length === 0) return;
    resolveAllOptions();
  }, [attributes.map(a => a.attribute_id).join(","), productId, productCategoryId, availableAttributes.length]);

  const loadAttributes = async () => {
    const { data } = await supabase
      .from('product_attributes')
      .select('id, code, label, value_type, unit, allowed_values, valorization_type, pricing_dimension')
      .order('label');
    setAvailableAttributes(data || []);
  };

  const resolveAllOptions = async () => {
    const newResolved: Record<string, ResolvedOption[]> = {};

    for (const av of attributes) {
      const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
      if (!attr || attr.value_type !== 'list') continue;

      // If we have a productId, use the RPC for proper hierarchy resolution
      if (productId) {
        const { data } = await supabase.rpc("resolve_product_attribute_options", {
          p_product_id: productId,
          p_attribute_id: av.attribute_id,
        });
        if (data && data.length > 0) {
          newResolved[av.attribute_id] = data.map((o: any) => ({
            value_text: o.value_text,
            display_name: o.display_name || o.value_text,
            hex_color: o.hex_color,
          }));
          continue;
        }
      }

      // Fallback: try category-based resolution from value_prices table
      if (productCategoryId) {
        const { data: catPrices } = await supabase
          .from("product_attribute_value_prices")
          .select("value_option")
          .eq("attribute_id", av.attribute_id)
          .eq("category_id", productCategoryId)
          .is("product_id", null)
          .order("sort_order");

        if (catPrices && catPrices.length > 0) {
          newResolved[av.attribute_id] = catPrices.map((p: any) => ({
            value_text: p.value_option,
            display_name: p.value_option,
            hex_color: null,
          }));
          continue;
        }

        // Try parent category
        const { data: catInfo } = await supabase
          .from("product_categories")
          .select("parent_id")
          .eq("id", productCategoryId)
          .single();

        if (catInfo?.parent_id) {
          const { data: parentPrices } = await supabase
            .from("product_attribute_value_prices")
            .select("value_option")
            .eq("attribute_id", av.attribute_id)
            .eq("category_id", catInfo.parent_id)
            .is("product_id", null)
            .order("sort_order");

          if (parentPrices && parentPrices.length > 0) {
            newResolved[av.attribute_id] = parentPrices.map((p: any) => ({
              value_text: p.value_option,
              display_name: p.value_option,
              hex_color: null,
            }));
            continue;
          }
        }
      }

      // Fallback: try category_attribute_palettes (palette groups with colors)
      if (productCategoryId) {
        const { data: paletteConfig } = await (supabase as any)
          .from('category_attribute_palettes')
          .select('base_group_id, additional_values, excluded_values')
          .eq('category_id', productCategoryId)
          .eq('attribute_id', av.attribute_id)
          .maybeSingle();

        if (paletteConfig?.base_group_id) {
          const { data: groupValues } = await (supabase as any)
            .from('attribute_option_group_values')
            .select('value_text, display_name, hex_color')
            .eq('group_id', paletteConfig.base_group_id)
            .eq('is_active', true)
            .order('sort_order');

          const excludedValues = paletteConfig.excluded_values || [];
          const additionalValues = paletteConfig.additional_values || [];

          const paletteOptions = (groupValues || [])
            .filter((v: any) => !excludedValues.includes(v.value_text))
            .map((v: any) => ({
              value_text: v.value_text,
              display_name: v.display_name || v.value_text,
              hex_color: v.hex_color || null,
            }));

          for (const av2 of additionalValues) {
            paletteOptions.push({
              value_text: av2.value || av2,
              display_name: av2.display_name || av2.value || av2,
              hex_color: av2.hex_color || null,
            });
          }

          if (paletteOptions.length > 0) {
            newResolved[av.attribute_id] = paletteOptions;
            continue;
          }
        }
      }

      // Final fallback: use allowed_values from attribute definition
      if (attr.allowed_values && Array.isArray(attr.allowed_values)) {
        newResolved[av.attribute_id] = attr.allowed_values.map((v: string) => ({
          value_text: v,
          display_name: v,
          hex_color: null,
        }));
      }
    }

    setResolvedOptions(newResolved);
  };

  const handleAddAttribute = () => {
    if (!newAttributeId) return;

    const attribute = availableAttributes.find(a => a.id === newAttributeId);
    if (!attribute) return;

    if (attributes.some(av => av.attribute_id === newAttributeId)) return;

    if (attribute.valorization_type === 'base_price') {
      const existing = attributes.find(av => {
        const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        return attr?.valorization_type === 'base_price';
      });
      if (existing) return;
    }

    if (attribute.pricing_dimension && attribute.pricing_dimension !== 'other') {
      const conflict = attributes.find(av => {
        const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        return attr?.pricing_dimension === attribute.pricing_dimension && attr?.pricing_dimension !== 'other';
      });
      if (conflict) return;
    }

    onChange([
      ...attributes,
      {
        attribute_id: newAttributeId,
        attribute: attribute,
        value_text: '',
        value_number: 0,
        value_bool: false
      }
    ]);
    setNewAttributeId("");
  };

  const handleRemoveAttribute = (attributeId: string) => {
    onChange(attributes.filter(av => av.attribute_id !== attributeId));
  };

  const handleValueChange = (attributeId: string, field: string, value: any) => {
    onChange(attributes.map(av =>
      av.attribute_id === attributeId ? { ...av, [field]: value } : av
    ));
  };

  const renderValueInput = (av: AttributeFormValue) => {
    const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
    if (!attribute) return null;

    switch (attribute.value_type) {
      case 'text':
      case 'string':
        return (
          <Input
            type="text"
            value={av.value_text || ''}
            onChange={(e) => handleValueChange(av.attribute_id, 'value_text', e.target.value)}
            placeholder={t('productAttributesDialog.valuePlaceholder')}
          />
        );
      case 'list': {
        const options = resolvedOptions[av.attribute_id];
        if (options && options.length > 0) {
          return (
            <Select
              value={av.value_text || ''}
              onValueChange={(value) => handleValueChange(av.attribute_id, 'value_text', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('productAttributesDialog.selectOption')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value_text} value={option.value_text}>
                    <div className="flex items-center gap-2">
                      {option.hex_color && (
                        <span
                          className="w-3 h-3 rounded-full border border-border inline-block"
                          style={{ backgroundColor: option.hex_color }}
                        />
                      )}
                      {option.display_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        // Fallback to raw allowed_values if no resolved options yet
        if (attribute.allowed_values && Array.isArray(attribute.allowed_values)) {
          return (
            <Select
              value={av.value_text || ''}
              onValueChange={(value) => handleValueChange(av.attribute_id, 'value_text', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('productAttributesDialog.selectOption')} />
              </SelectTrigger>
              <SelectContent>
                {attribute.allowed_values.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            type="text"
            value={av.value_text || ''}
            onChange={(e) => handleValueChange(av.attribute_id, 'value_text', e.target.value)}
          />
        );
      }
      case 'number':
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              value={av.value_number || 0}
              onChange={(e) => handleValueChange(av.attribute_id, 'value_number', parseFloat(e.target.value) || 0)}
            />
            {attribute.unit && <span className="text-xs text-muted-foreground">{attribute.unit}</span>}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={av.value_bool || false}
              onCheckedChange={(checked) => handleValueChange(av.attribute_id, 'value_bool', checked)}
            />
            <span className="text-xs">
              {av.value_bool ? t('productAttributesDialog.yes') : t('productAttributesDialog.no')}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const getAvailableAttributesForSelect = () => {
    const usedIds = attributes.map(av => av.attribute_id);
    return availableAttributes.filter(attr => !usedIds.includes(attr.id));
  };

  if (availableAttributes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium flex items-center gap-2">
        <Tag className="w-4 h-4" />
        {t('productAttributesDialog.productAttributes')}
      </h3>

      <div className="flex gap-2">
        <div className="flex-1">
          <Select value={newAttributeId} onValueChange={setNewAttributeId}>
            <SelectTrigger>
              <SelectValue placeholder={t('productAttributesDialog.selectAttribute')} />
            </SelectTrigger>
            <SelectContent>
              {getAvailableAttributesForSelect().map((attr) => (
                <SelectItem key={attr.id} value={attr.id}>
                  {attr.label} ({attr.value_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button 
          type="button" 
          onClick={handleAddAttribute} 
          variant="outline" 
          size="sm"
          disabled={!newAttributeId || getAvailableAttributesForSelect().length === 0}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {attributes.length > 0 && (
        <ScrollArea className="h-[200px] pr-3">
          <div className="space-y-2">
            {attributes.map((av) => {
              const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
              return (
                <div key={av.attribute_id} className="flex gap-2 items-center p-2 border rounded-md bg-muted/50">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{attribute?.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {attribute?.value_type}
                      </Badge>
                    </div>
                    <div className="max-w-xs">
                      {renderValueInput(av)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAttribute(av.attribute_id)}
                    className="text-destructive hover:text-destructive h-8 w-8"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
