import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Info, Palette, Ruler, Hash } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProductAttributeDefinition {
  id: string;
  code: string;
  label: string;
  value_type: string;
  has_hex_color: boolean;
  is_measurement: boolean;
  valorization_type: string | null;
  pricing_dimension: string | null;
  is_variant_option: boolean;
}

interface AssignedAttribute {
  id: string;
  attribute_id: string;
  attribute: ProductAttributeDefinition;
  value_text?: string;
  value_number?: number;
  value_bool?: boolean;
  is_variant_axis: boolean;
  value_count: number; // real count of active values
}

interface ProductAttributesTabProps {
  productId: string;
  productName: string;
  productBasePrice?: number;
  productCategoryId?: string | null;
  organizationId: string;
}

export default function ProductAttributesTab({
  productId,
  productName,
  productBasePrice,
  productCategoryId,
  organizationId,
}: ProductAttributesTabProps) {
  const { toast } = useToast();
  const [availableAttributes, setAvailableAttributes] = useState<ProductAttributeDefinition[]>([]);
  const [assignedAttributes, setAssignedAttributes] = useState<AssignedAttribute[]>([]);
  const [newAttributeId, setNewAttributeId] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: attrs, error: attrsError } = await supabase
        .from('product_attributes')
        .select('id, code, label, value_type, has_hex_color, is_measurement, valorization_type, pricing_dimension, is_variant_option')
        .eq('organization_id', organizationId)
        .order('label');

      if (attrsError) throw attrsError;
      setAvailableAttributes((attrs || []) as ProductAttributeDefinition[]);

      const { data: values, error: valuesError } = await supabase
        .from('product_attribute_values')
        .select(`
          id,
          attribute_id,
          value_text,
          value_number,
          value_bool,
          product_attributes(id, code, label, value_type, has_hex_color, is_measurement, valorization_type, pricing_dimension, is_variant_option)
        `)
        .eq('product_id', productId);

      if (valuesError) throw valuesError;

      // For each assigned attribute, count available value_options from product_attribute_value_prices
      const attrIds = (values || []).map((v: any) => v.attribute_id);
      let valueCounts: Record<string, number> = {};
      
      if (attrIds.length > 0) {
        const { data: priceValues } = await supabase
          .from('product_attribute_value_prices')
          .select('attribute_id, value_option')
          .in('attribute_id', attrIds)
          .eq('is_available', true);
        
        // Count unique value_options per attribute
        const countMap: Record<string, Set<string>> = {};
        (priceValues || []).forEach((pv: any) => {
          if (!countMap[pv.attribute_id]) countMap[pv.attribute_id] = new Set();
          countMap[pv.attribute_id].add(pv.value_option);
        });
        Object.entries(countMap).forEach(([attrId, optSet]) => {
          valueCounts[attrId] = optSet.size;
        });
      }

      const mapped = (values || []).map((v: any) => ({
        id: v.id,
        attribute_id: v.attribute_id,
        attribute: v.product_attributes as ProductAttributeDefinition,
        value_text: v.value_text,
        value_number: v.value_number,
        value_bool: v.value_bool,
        is_variant_axis: v.product_attributes?.is_variant_option || false,
        value_count: valueCounts[v.attribute_id] || 0,
      }));

      setAssignedAttributes(mapped);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar atributos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [productId, organizationId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Validation Rules ---
  const validateAddAttribute = (attrId: string): string | null => {
    const attr = availableAttributes.find(a => a.id === attrId);
    if (!attr) return "Atributo não encontrado";

    if (assignedAttributes.some(a => a.attribute_id === attrId)) {
      return "Este atributo já está atribuído a este produto.";
    }

    // Rule 1: Only one base_price per product
    if (attr.valorization_type === 'base_price') {
      const existing = assignedAttributes.find(a => a.attribute?.valorization_type === 'base_price');
      if (existing) {
        return `Já existe um atributo de preço base (${existing.attribute?.label}). Só é permitido um por produto.`;
      }
    }

    // Rule 2: adjustment/multiplier require base_price to exist
    if (['adjustment', 'fixed', 'both', 'multiplier'].includes(attr.valorization_type || '')) {
      const hasBase = assignedAttributes.some(a => a.attribute?.valorization_type === 'base_price');
      const productHasBase = (productBasePrice || 0) > 0;
      if (!hasBase && !productHasBase) {
        return "É necessário um preço base (atributo ou produto) antes de adicionar ajustes/multiplicadores.";
      }
    }

    // Rule 4: Conflict on pricing_dimension (except 'other')
    if (attr.pricing_dimension && attr.pricing_dimension !== 'other') {
      const conflict = assignedAttributes.find(
        a => a.attribute?.pricing_dimension === attr.pricing_dimension && a.attribute?.pricing_dimension !== 'other'
      );
      if (conflict) {
        return `Já existe um atributo com a dimensão "${attr.pricing_dimension}" (${conflict.attribute?.label}). Conflito de dimensão.`;
      }
    }

    // Rule 5: has_hex_color → only adjustment + color
    if (attr.has_hex_color) {
      if (attr.valorization_type !== 'adjustment' && attr.valorization_type !== 'none') {
        return "Atributos com cor hex só aceitam valorização de ajuste (adjustment).";
      }
      if (attr.pricing_dimension && attr.pricing_dimension !== 'color') {
        return "Atributos com cor hex devem ter dimensão 'color'.";
      }
    }

    return null;
  };

  const handleAddAttribute = async () => {
    if (!newAttributeId) return;

    const error = validateAddAttribute(newAttributeId);
    if (error) {
      toast({ title: "Validação", description: error, variant: "destructive" });
      return;
    }

    try {
      const { error: insertError } = await supabase.from('product_attribute_values').insert({
        product_id: productId,
        attribute_id: newAttributeId,
      });

      if (insertError) throw insertError;

      setNewAttributeId("");
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveAttribute = async (av: AssignedAttribute) => {
    try {
      const { error } = await supabase
        .from('product_attribute_values')
        .delete()
        .eq('id', av.id);

      if (error) throw error;
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleVariantAxis = async (av: AssignedAttribute) => {
    const newValue = !av.is_variant_axis;
    // Optimistic update
    setAssignedAttributes(prev =>
      prev.map(a => a.id === av.id ? { ...a, is_variant_axis: newValue } : a)
    );
    try {
      // Persist to product_attributes.is_variant_option
      const { error } = await supabase
        .from('product_attributes')
        .update({ is_variant_option: newValue })
        .eq('id', av.attribute_id);

      if (error) throw error;
    } catch (err: any) {
      // Revert on error
      setAssignedAttributes(prev =>
        prev.map(a => a.id === av.id ? { ...a, is_variant_axis: !newValue } : a)
      );
      toast({ title: "Erro", description: (err as any).message, variant: "destructive" });
    }
  };


  const getAvailableForSelect = () => {
    const usedIds = new Set(assignedAttributes.map(a => a.attribute_id));
    return availableAttributes.filter(a => !usedIds.has(a.id));
  };

  const getValorizationBadge = (type: string | null) => {
    switch (type) {
      case 'base_price': return <Badge variant="default" className="bg-blue-600">Base</Badge>;
      case 'fixed': return <Badge variant="default" className="bg-green-600">Fixo</Badge>;
      case 'adjustment': return <Badge variant="default" className="bg-amber-600">Ajuste</Badge>;
      case 'multiplier': return <Badge variant="default" className="bg-purple-600">Mult.</Badge>;
      case 'both': return <Badge variant="default" className="bg-orange-600">Ambos</Badge>;
      case 'range': return <Badge variant="default" className="bg-teal-600">Escalão</Badge>;
      case 'per_unit': return <Badge variant="default" className="bg-cyan-600">Un.</Badge>;
      default: return <Badge variant="secondary">Sem val.</Badge>;
    }
  };

  const getAttrIcon = (attr: ProductAttributeDefinition) => {
    if (attr.has_hex_color) return <Palette className="h-4 w-4 text-pink-500" />;
    if (attr.is_measurement) return <Ruler className="h-4 w-4 text-blue-500" />;
    return <Hash className="h-4 w-4 text-muted-foreground" />;
  };

  const buildFormulaBar = () => {
    const basePriceAttr = assignedAttributes.find(a => a.attribute?.valorization_type === 'base_price');
    const adjustments = assignedAttributes.filter(a => ['fixed', 'adjustment', 'both'].includes(a.attribute?.valorization_type || ''));
    const multipliers = assignedAttributes.filter(a => a.attribute?.valorization_type === 'multiplier');

    const basePart = basePriceAttr ? basePriceAttr.attribute?.label : (productBasePrice ? `${productBasePrice}€` : '?');
    const adjPart = adjustments.map(a => `+ ${a.attribute?.label}`).join(' ');
    const multPart = multipliers.map(a => `× ${a.attribute?.label}`).join(' ');

    return `(${basePart} ${adjPart}) ${multPart}`.trim();
  };

  if (loading) {
    return <div className="p-4 text-muted-foreground">A carregar atributos...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Formula Bar */}
      {assignedAttributes.some(a => a.attribute?.valorization_type && a.attribute.valorization_type !== 'none') && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-mono text-muted-foreground">
            Fórmula: {buildFormulaBar()}
          </span>
        </div>
      )}

      {/* Bloco A: Attribute Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Atributos do Produto</h3>
          <div className="flex gap-2 items-center">
            <Select value={newAttributeId} onValueChange={setNewAttributeId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecionar atributo..." />
              </SelectTrigger>
              <SelectContent>
                {getAvailableForSelect().map(attr => {
                  const validationError = validateAddAttribute(attr.id);
                  return (
                    <SelectItem key={attr.id} value={attr.id} disabled={!!validationError}>
                      <span className={validationError ? 'opacity-50' : ''}>
                        {attr.label} ({attr.value_type})
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button onClick={handleAddAttribute} size="sm" disabled={!newAttributeId}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>

        {assignedAttributes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum atributo atribuído. Adicione atributos para definir variantes e preços.
          </div>
        ) : (
          <div className="grid gap-3">
            {assignedAttributes.map(av => (
              <Card key={av.id} className="p-3">
                <div className="flex items-center gap-3">
                  {getAttrIcon(av.attribute)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{av.attribute?.label}</span>
                      <Badge variant="outline" className="text-xs">{av.attribute?.value_type}</Badge>
                      {getValorizationBadge(av.attribute?.valorization_type)}
                      {av.attribute?.pricing_dimension && (
                        <Badge variant="secondary" className="text-xs">{av.attribute.pricing_dimension}</Badge>
                      )}
                      {av.value_count > 0 && (
                        <Badge variant="outline" className="text-xs">{av.value_count} opções</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Eixo</span>
                            <Switch
                              checked={av.is_variant_axis}
                              onCheckedChange={() => handleToggleVariantAxis(av)}
                              className="scale-75"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Usar como eixo de variante na matriz</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveAttribute(av)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
