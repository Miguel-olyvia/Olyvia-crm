import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Tag, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProductAttributesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  productCategoryId?: string | null; // Add category to filter palettes
}

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

interface AttributeValue {
  id?: string;
  attribute_id: string;
  attribute?: ProductAttribute;
  value_text?: string;
  value_number?: number;
  value_bool?: boolean;
}

interface CategoryPaletteValue {
  value_text: string;
  display_name: string;
  hex_color: string | null;
}

export default function ProductAttributesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  productCategoryId
}: ProductAttributesDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [availableAttributes, setAvailableAttributes] = useState<ProductAttribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [newAttributeId, setNewAttributeId] = useState<string>("");
  const [categoryPaletteValues, setCategoryPaletteValues] = useState<Record<string, CategoryPaletteValue[]>>({});
  const [usingPalette, setUsingPalette] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open && productId) {
      loadData();
    }
  }, [open, productId, productCategoryId]);

  const loadData = async () => {
    try {
      const { data: attributesData, error: attrError } = await supabase
        .from('product_attributes')
        .select('id, code, label, value_type, unit, allowed_values, valorization_type, pricing_dimension')
        .order('label');

      if (attrError) throw attrError;
      setAvailableAttributes(attributesData || []);

      const { data: valuesData, error: valuesError } = await supabase
        .from('product_attribute_values')
        .select(`
          id,
          attribute_id,
          value_text,
          value_number,
          value_bool,
          product_attributes(id, code, label, value_type, unit, allowed_values)
        `)
        .eq('product_id', productId);

      if (valuesError) throw valuesError;
      setAttributeValues(valuesData || []);

      // Load category palette values if product has a category
      if (productCategoryId) {
        await loadCategoryPalettes(attributesData || [], productCategoryId);
      }
    } catch (error: any) {
      toast({
        title: t('productAttributesDialog.toast.loadError'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const loadCategoryPalettes = async (attributes: ProductAttribute[], categoryId: string) => {
    const paletteValuesMap: Record<string, CategoryPaletteValue[]> = {};
    const usingPaletteMap: Record<string, boolean> = {};

    for (const attr of attributes) {
      if (attr.value_type !== 'list') continue;

      // Check if there's a palette assigned to this category for this attribute
      const { data: paletteConfig } = await (supabase as any)
        .from('category_attribute_palettes')
        .select('base_group_id, additional_values, excluded_values')
        .eq('category_id', categoryId)
        .eq('attribute_id', attr.id)
        .maybeSingle();

      if (paletteConfig?.base_group_id) {
        // Load values from the palette group
        const { data: groupValues } = await (supabase as any)
          .from('attribute_option_group_values')
          .select('value_text, display_name, hex_color')
          .eq('group_id', paletteConfig.base_group_id)
          .eq('is_active', true)
          .order('sort_order');

        const excludedValues = paletteConfig.excluded_values || [];
        const additionalValues = paletteConfig.additional_values || [];

        // Filter out excluded and add additional
        const filteredValues = (groupValues || [])
          .filter((v: CategoryPaletteValue) => !excludedValues.includes(v.value_text))
          .map((v: CategoryPaletteValue) => ({
            value_text: v.value_text,
            display_name: v.display_name || v.value_text,
            hex_color: v.hex_color
          }));

        // Add additional values
        for (const av of additionalValues) {
          filteredValues.push({
            value_text: av.value || av,
            display_name: av.display_name || av.value || av,
            hex_color: av.hex_color || null
          });
        }

        if (filteredValues.length > 0) {
          paletteValuesMap[attr.id] = filteredValues;
          usingPaletteMap[attr.id] = true;
        }
      }
    }

    setCategoryPaletteValues(paletteValuesMap);
    setUsingPalette(usingPaletteMap);
  };

  const handleAddAttribute = () => {
    if (!newAttributeId) {
      toast({
        title: t('productAttributesDialog.toast.selectAttribute'),
        variant: "destructive"
      });
      return;
    }

    const attribute = availableAttributes.find(a => a.id === newAttributeId);
    if (!attribute) return;

    if (attributeValues.some(av => av.attribute_id === newAttributeId)) {
      toast({
        title: t('productAttributesDialog.toast.alreadyAdded'),
        variant: "destructive"
      });
      return;
    }

    // Rule 1: Only one base_price per product
    if (attribute.valorization_type === 'base_price') {
      const existing = attributeValues.find(av => {
        const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        return attr?.valorization_type === 'base_price';
      });
      if (existing) {
        const existingAttr = existing.attribute || availableAttributes.find(a => a.id === existing.attribute_id);
        toast({
          title: "Validação",
          description: `Já existe um atributo de preço base (${existingAttr?.label}). Só é permitido um por produto.`,
          variant: "destructive"
        });
        return;
      }
    }

    // Rule 2: adjustment/multiplier require base_price
    if (['adjustment', 'fixed', 'both', 'multiplier'].includes(attribute.valorization_type || '')) {
      const hasBase = attributeValues.some(av => {
        const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        return attr?.valorization_type === 'base_price';
      });
      if (!hasBase) {
        toast({
          title: "Validação",
          description: "É necessário um atributo de preço base antes de adicionar ajustes/multiplicadores.",
          variant: "destructive"
        });
        return;
      }
    }

    // Rule 4: Conflict on pricing_dimension (except 'other')
    if (attribute.pricing_dimension && attribute.pricing_dimension !== 'other') {
      const conflict = attributeValues.find(av => {
        const attr = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        return attr?.pricing_dimension === attribute.pricing_dimension && attr?.pricing_dimension !== 'other';
      });
      if (conflict) {
        const conflictAttr = conflict.attribute || availableAttributes.find(a => a.id === conflict.attribute_id);
        toast({
          title: "Validação",
          description: `Já existe um atributo com a dimensão "${attribute.pricing_dimension}" (${conflictAttr?.label}).`,
          variant: "destructive"
        });
        return;
      }
    }

    setAttributeValues([
      ...attributeValues,
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

  const handleRemoveAttribute = async (attributeValue: AttributeValue) => {
    if (attributeValue.id) {
      const { error } = await supabase
        .from('product_attribute_values')
        .delete()
        .eq('id', attributeValue.id);

      if (error) {
        toast({
          title: t('productAttributesDialog.toast.removeError'),
          description: error.message,
          variant: "destructive"
        });
        return;
      }
    }

    setAttributeValues(attributeValues.filter(av => av.attribute_id !== attributeValue.attribute_id));
  };

  const handleValueChange = (attributeId: string, field: string, value: any) => {
    setAttributeValues(attributeValues.map(av =>
      av.attribute_id === attributeId
        ? { ...av, [field]: value }
        : av
    ));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const av of attributeValues) {
        const valueData: any = {
          product_id: productId,
          attribute_id: av.attribute_id
        };

        const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
        if (!attribute) continue;

        switch (attribute.value_type) {
          case 'text':
          case 'string':
          case 'list':
            valueData.value_text = av.value_text || null;
            break;
          case 'number':
            valueData.value_number = av.value_number || null;
            break;
          case 'boolean':
            valueData.value_bool = av.value_bool || false;
            break;
        }

        if (av.id) {
          const { error } = await supabase
            .from('product_attribute_values')
            .update(valueData)
            .eq('id', av.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('product_attribute_values')
            .insert(valueData);

          if (error) throw error;
        }
      }

      toast({
        title: t('productAttributesDialog.toast.saveSuccess')
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: t('productAttributesDialog.toast.saveError'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderValueInput = (av: AttributeValue) => {
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
      case 'list':
        // Check if we have palette values for this attribute
        const paletteValues = categoryPaletteValues[av.attribute_id];
        const hasPalette = usingPalette[av.attribute_id] && paletteValues?.length > 0;
        
        // Determine which values to show
        const optionsToShow = hasPalette 
          ? paletteValues 
          : (attribute.allowed_values && Array.isArray(attribute.allowed_values)
              ? attribute.allowed_values.map((v: string) => ({ value_text: v, display_name: v, hex_color: null }))
              : []);

        if (optionsToShow.length > 0) {
          return (
            <div className="space-y-1">
              {hasPalette && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Info className="h-3 w-3" />
                        A usar paleta da categoria
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Este atributo está a usar uma paleta de opções específica para esta categoria de produtos</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Select
                value={av.value_text || ''}
                onValueChange={(value) => handleValueChange(av.attribute_id, 'value_text', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('productAttributesDialog.selectOption')} />
                </SelectTrigger>
                <SelectContent>
                  {optionsToShow.map((option: CategoryPaletteValue) => (
                    <SelectItem key={option.value_text} value={option.value_text}>
                      <div className="flex items-center gap-2">
                        {option.hex_color && (
                          <div 
                            className="w-3 h-3 rounded-full border"
                            style={{ backgroundColor: option.hex_color }}
                          />
                        )}
                        {option.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
          <Input
            type="text"
            value={av.value_text || ''}
            onChange={(e) => handleValueChange(av.attribute_id, 'value_text', e.target.value)}
            placeholder={t('productAttributesDialog.valuePlaceholder')}
          />
        );
      case 'number':
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              value={av.value_number || 0}
              onChange={(e) => handleValueChange(av.attribute_id, 'value_number', parseFloat(e.target.value) || 0)}
              placeholder={t('productAttributesDialog.valuePlaceholder')}
            />
            {attribute.unit && <span className="text-sm text-muted-foreground">{attribute.unit}</span>}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={av.value_bool || false}
              onCheckedChange={(checked) => handleValueChange(av.attribute_id, 'value_bool', checked)}
            />
            <span className="text-sm">
              {av.value_bool ? t('productAttributesDialog.yes') : t('productAttributesDialog.no')}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const getAvailableAttributesForSelect = () => {
    const usedIds = attributeValues.map(av => av.attribute_id);
    return availableAttributes.filter(attr => !usedIds.includes(attr.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {t('productAttributesDialog.title').replace('{{name}}', productName)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {availableAttributes.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('productAttributesDialog.noAttributesAvailable')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('productAttributesDialog.configureFirst')}
              </p>
            </div>
          ) : (
            <>
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
                <Button onClick={handleAddAttribute} variant="outline" disabled={getAvailableAttributesForSelect().length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('productAttributesDialog.add')}
                </Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-sm">{t('productAttributesDialog.productAttributes')}</h3>
                
                {attributeValues.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('productAttributesDialog.noAttributesAdded')}
                  </p>
                ) : (
              <div className="space-y-3">
                {attributeValues.map((av) => {
                  const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
                  return (
                    <div key={av.attribute_id} className="flex gap-3 items-start p-3 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium">{attribute?.label}</Label>
                          <Badge variant="outline" className="text-xs">
                            {attribute?.value_type}
                          </Badge>
                        </div>
                        {renderValueInput(av)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveAttribute(av)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t('productAttributesDialog.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? t('productAttributesDialog.saving') : t('productAttributesDialog.save')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}