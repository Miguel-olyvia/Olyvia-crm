import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Trash2, Info, DollarSign, Package, ShoppingCart, 
  ChevronDown, ChevronRight, AlertCircle, Check, Layers 
} from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { usePriceContexts, PRICE_CONTEXT_CODES, type PriceContext } from "@/hooks/usePriceContexts";
import { PermissionGate } from "@/components/PermissionGate";

interface AttributeContextPricesTabProps {
  productId: string;
  productName: string;
  companyId: string | null;
  onSaved?: () => void;
}

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  allowed_values?: string[] | null;
  pricing_type: string | null;
}

interface ContextPrice {
  id?: string;
  attribute_id: string;
  value_option: string;
  price: number;
  cost_impact: number | null;
  price_context_id: string | null;
  isProductSpecific: boolean;
  context_code?: string;
}

interface ContextRange {
  id?: string;
  attribute_id: string;
  range_type: 'linear' | 'dimension' | 'dimension3d';
  min_value: number;
  max_value: number | null;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  min_depth: number | null;
  max_depth: number | null;
  price_per_unit: number;
  cost_impact: number | null;
  price_context_id: string | null;
  isProductSpecific: boolean;
  context_code?: string;
}

const CONTEXT_ICONS: Record<string, React.ReactNode> = {
  retail: <ShoppingCart className="h-4 w-4" />,
  bundle: <Package className="h-4 w-4" />,
  purchase: <DollarSign className="h-4 w-4" />,
};

const CONTEXT_COLORS: Record<string, string> = {
  retail: "bg-blue-500/10 text-blue-700 border-blue-200",
  bundle: "bg-purple-500/10 text-purple-700 border-purple-200",
  purchase: "bg-green-500/10 text-green-700 border-green-200",
};

export default function AttributeContextPricesTab({
  productId,
  productName,
  companyId,
  onSaved
}: AttributeContextPricesTabProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { contexts, loading: contextsLoading, getRetailContext, getBundleContext, getPurchaseContext } = usePriceContexts();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productAttributes, setProductAttributes] = useState<ProductAttribute[]>([]);
  const [contextPrices, setContextPrices] = useState<ContextPrice[]>([]);
  const [contextRanges, setContextRanges] = useState<ContextRange[]>([]);
  const [selectedAttribute, setSelectedAttribute] = useState<string>("");
  const [expandedContexts, setExpandedContexts] = useState<Record<string, boolean>>({
    retail: true,
    bundle: false,
    purchase: false,
  });
  const [hasChanges, setHasChanges] = useState(false);

  const retailContext = getRetailContext();
  const bundleContext = getBundleContext();
  const purchaseContext = getPurchaseContext();

  const loadData = useCallback(async () => {
    if (!productId) return;
    
    setLoading(true);
    try {
      // Load product's attribute associations
      const { data: attrValues } = await supabase
        .from("product_attribute_values")
        .select("attribute_id")
        .eq("product_id", productId);

      if (!attrValues || attrValues.length === 0) {
        setProductAttributes([]);
        return;
      }

      const attrIds = [...new Set(attrValues.map(av => av.attribute_id))];

      // Load attribute definitions
      const { data: attrs } = await supabase
        .from("product_attributes")
        .select("id, code, label, value_type, allowed_values, pricing_type")
        .in("id", attrIds);

      if (attrs) {
        const mappedAttrs: ProductAttribute[] = attrs
          .filter(a => a.pricing_type === 'fixed' || a.pricing_type === 'range' || a.pricing_type === 'both')
          .map(a => ({
            id: a.id,
            code: a.code,
            label: a.label,
            value_type: a.value_type,
            allowed_values: Array.isArray(a.allowed_values) ? a.allowed_values as string[] : null,
            pricing_type: a.pricing_type
          }));
        setProductAttributes(mappedAttrs);
        if (mappedAttrs.length > 0 && !selectedAttribute) {
          setSelectedAttribute(mappedAttrs[0].id);
        }
      }

      // Load existing value prices with context info
      const { data: vPrices } = await supabase
        .from("product_attribute_value_prices")
        .select(`
          *,
          price_context:price_contexts(code, name)
        `)
        .in("attribute_id", attrIds)
        .or(`product_id.eq.${productId},product_id.is.null`);

      if (vPrices) {
        setContextPrices(vPrices.map((vp: any) => ({
          id: vp.id,
          attribute_id: vp.attribute_id,
          value_option: vp.value_option,
          price: vp.price,
          cost_impact: vp.cost_impact,
          price_context_id: vp.price_context_id,
          isProductSpecific: vp.product_id === productId,
          context_code: vp.price_context?.code || null
        })));
      }

      // Load existing price ranges with context info
      const { data: ranges } = await supabase
        .from("product_attribute_price_ranges")
        .select(`
          *,
          price_context:price_contexts(code, name)
        `)
        .in("attribute_id", attrIds)
        .or(`product_id.eq.${productId},product_id.is.null`);

      if (ranges) {
        setContextRanges(ranges.map((r: any) => ({
          id: r.id,
          attribute_id: r.attribute_id,
          range_type: (r.range_type || 'linear') as 'linear' | 'dimension' | 'dimension3d',
          min_value: r.min_value,
          max_value: r.max_value,
          min_width: r.min_width,
          max_width: r.max_width,
          min_height: r.min_height,
          max_height: r.max_height,
          min_depth: r.min_depth,
          max_depth: r.max_depth,
          price_per_unit: r.price_per_unit,
          cost_impact: r.cost_impact,
          price_context_id: r.price_context_id,
          isProductSpecific: r.product_id === productId,
          context_code: r.price_context?.code || null
        })));
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [productId, selectedAttribute, t, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleContext = (contextCode: string) => {
    setExpandedContexts(prev => ({
      ...prev,
      [contextCode]: !prev[contextCode]
    }));
  };

  const getContextById = (contextId: string | null): PriceContext | undefined => {
    if (!contextId) return undefined;
    return contexts.find(c => c.id === contextId);
  };

  const getPriceForContext = (
    attrId: string, 
    valueOption: string, 
    contextId: string | null
  ): { price: number; costImpact: number | null; isProductSpecific: boolean; source: string } => {
    // First check for product-specific price with this context
    const productContextPrice = contextPrices.find(
      vp => vp.attribute_id === attrId && 
            vp.value_option === valueOption && 
            vp.isProductSpecific && 
            vp.price_context_id === contextId
    );
    if (productContextPrice) {
      return { 
        price: productContextPrice.price, 
        costImpact: productContextPrice.cost_impact,
        isProductSpecific: true, 
        source: 'product-context' 
      };
    }
    
    // Then check for global price with this context
    const globalContextPrice = contextPrices.find(
      vp => vp.attribute_id === attrId && 
            vp.value_option === valueOption && 
            !vp.isProductSpecific && 
            vp.price_context_id === contextId
    );
    if (globalContextPrice) {
      return { 
        price: globalContextPrice.price, 
        costImpact: globalContextPrice.cost_impact,
        isProductSpecific: false, 
        source: 'global-context' 
      };
    }
    
    // Fall back to product-specific price without context
    const productPrice = contextPrices.find(
      vp => vp.attribute_id === attrId && 
            vp.value_option === valueOption && 
            vp.isProductSpecific && 
            !vp.price_context_id
    );
    if (productPrice) {
      return { 
        price: productPrice.price, 
        costImpact: productPrice.cost_impact,
        isProductSpecific: true, 
        source: 'product-fallback' 
      };
    }
    
    // Fall back to global price without context
    const globalPrice = contextPrices.find(
      vp => vp.attribute_id === attrId && 
            vp.value_option === valueOption && 
            !vp.isProductSpecific && 
            !vp.price_context_id
    );
    if (globalPrice) {
      return { 
        price: globalPrice.price, 
        costImpact: globalPrice.cost_impact,
        isProductSpecific: false, 
        source: 'global-fallback' 
      };
    }
    
    return { price: 0, costImpact: null, isProductSpecific: false, source: 'none' };
  };

  const handlePriceChange = (
    attrId: string, 
    valueOption: string, 
    contextId: string | null,
    newPrice: number,
    field: 'price' | 'cost_impact' = 'price'
  ) => {
    setHasChanges(true);
    setContextPrices(prev => {
      // Find existing product-specific price with this context
      const existingIdx = prev.findIndex(
        vp => vp.attribute_id === attrId && 
              vp.value_option === valueOption && 
              vp.isProductSpecific && 
              vp.price_context_id === contextId
      );
      
      if (existingIdx >= 0) {
        const updated = [...prev];
        if (field === 'price') {
          updated[existingIdx] = { ...updated[existingIdx], price: newPrice };
        } else {
          updated[existingIdx] = { ...updated[existingIdx], cost_impact: newPrice };
        }
        return updated;
      }
      
      // Create new product-specific price
      const basePrice = getPriceForContext(attrId, valueOption, contextId);
      return [...prev, {
        attribute_id: attrId,
        value_option: valueOption,
        price: field === 'price' ? newPrice : basePrice.price,
        cost_impact: field === 'cost_impact' ? newPrice : null,
        price_context_id: contextId,
        isProductSpecific: true
      }];
    });
  };

  const handleRemoveProductPrice = (attrId: string, valueOption: string, contextId: string | null) => {
    setHasChanges(true);
    setContextPrices(prev => prev.filter(vp => 
      !(vp.attribute_id === attrId && 
        vp.value_option === valueOption && 
        vp.isProductSpecific && 
        vp.price_context_id === contextId)
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get all product-specific prices for this product
      const productPrices = contextPrices.filter(vp => vp.isProductSpecific);
      
      // Delete existing product-specific prices for this product
      await supabase
        .from("product_attribute_value_prices")
        .delete()
        .eq("product_id", productId);

      // Insert new product-specific prices
      if (productPrices.length > 0) {
        const toInsert = productPrices.map(vp => ({
          attribute_id: vp.attribute_id,
          value_option: vp.value_option,
          price: vp.price,
          cost_impact: vp.cost_impact,
          price_context_id: vp.price_context_id,
          product_id: productId,
          organization_id: companyId
        }));
        
        const { error } = await supabase
          .from("product_attribute_value_prices")
          .insert(toInsert);
        
        if (error) throw error;
      }

      setHasChanges(false);
      toast({
        title: t('common.success'),
        description: "Preços de atributos guardados com sucesso."
      });
      
      onSaved?.();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const currentAttribute = productAttributes.find(a => a.id === selectedAttribute);

  const renderContextSection = (context: PriceContext | undefined, contextCode: string, label: string) => {
    if (!currentAttribute || !context) return null;
    
    const isExpanded = expandedContexts[contextCode];
    const isPurchaseContext = contextCode === 'purchase';
    const allowedValues = currentAttribute.allowed_values || [];
    
    // Count product-specific prices for this context
    const productSpecificCount = contextPrices.filter(
      vp => vp.attribute_id === currentAttribute.id && 
            vp.isProductSpecific && 
            vp.price_context_id === context.id
    ).length;

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleContext(contextCode)}>
        <Card className={`border ${CONTEXT_COLORS[contextCode]}`}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {CONTEXT_ICONS[contextCode]}
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  {productSpecificCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {productSpecificCount} específico{productSpecificCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        {isPurchaseContext 
                          ? "Define o impacto no custo de compra para cada opção."
                          : `Define preços específicos para o contexto ${label}.`
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 px-4">
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                  <div className="col-span-4">Opção</div>
                  <div className="col-span-2 text-center">Origem</div>
                  <div className="col-span-2 text-right">
                    {isPurchaseContext ? "Custo Base" : "Preço"}
                  </div>
                  {isPurchaseContext && (
                    <div className="col-span-2 text-right">Impacto Custo</div>
                  )}
                  <div className={`${isPurchaseContext ? 'col-span-2' : 'col-span-4'} text-right`}>Ações</div>
                </div>
                
                {allowedValues.map((option: string) => {
                  const priceInfo = getPriceForContext(currentAttribute.id, option, context.id);
                  const hasProductSpecific = priceInfo.source === 'product-context';
                  
                  return (
                    <div key={option} className="grid grid-cols-12 gap-2 items-center py-1">
                      <div className="col-span-4 text-sm truncate" title={option}>
                        {option}
                      </div>
                      <div className="col-span-2 text-center">
                        <Badge 
                          variant={hasProductSpecific ? "default" : "outline"} 
                          className="text-[10px] px-1.5"
                        >
                          {hasProductSpecific ? (
                            <><Check className="h-3 w-3 mr-0.5" />Prod</>
                          ) : priceInfo.source === 'global-context' ? (
                            "Global"
                          ) : priceInfo.source !== 'none' ? (
                            "Fallback"
                          ) : (
                            "—"
                          )}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-8 text-right text-sm"
                            value={hasProductSpecific ? priceInfo.price : ""}
                            placeholder={priceInfo.price > 0 ? priceInfo.price.toFixed(2) : "0.00"}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0;
                              handlePriceChange(currentAttribute.id, option, context.id, newPrice, 'price');
                            }}
                          />
                          <span className="text-xs text-muted-foreground">€</span>
                        </div>
                      </div>
                      {isPurchaseContext && (
                        <div className="col-span-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right text-sm"
                              value={hasProductSpecific && priceInfo.costImpact !== null ? priceInfo.costImpact : ""}
                              placeholder="0.00"
                              onChange={(e) => {
                                const newCost = parseFloat(e.target.value) || 0;
                                handlePriceChange(currentAttribute.id, option, context.id, newCost, 'cost_impact');
                              }}
                            />
                            <span className="text-xs text-muted-foreground">€</span>
                          </div>
                        </div>
                      )}
                      <div className={`${isPurchaseContext ? 'col-span-2' : 'col-span-4'} flex justify-end`}>
                        {hasProductSpecific && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveProductPrice(currentAttribute.id, option, context.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  };

  if (loading || contextsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-muted-foreground">A carregar...</span>
      </div>
    );
  }

  if (productAttributes.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">
          Este produto não tem atributos com preçário configurado.
        </p>
        <p className="text-xs text-muted-foreground">
          Configure primeiro os atributos em Catálogo → Atributos de Produto.
        </p>
      </div>
    );
  }

  // Check if current attribute supports context pricing (fixed or both)
  const supportsContextPricing = currentAttribute && 
    (currentAttribute.pricing_type === 'fixed' || currentAttribute.pricing_type === 'both');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Attribute Selector - Fixed Header */}
      <div className="flex items-center gap-3 pb-4 border-b flex-shrink-0">
        <Label className="whitespace-nowrap font-medium">Atributo:</Label>
        <Select value={selectedAttribute} onValueChange={setSelectedAttribute}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecionar atributo" />
          </SelectTrigger>
          <SelectContent>
            {productAttributes.map(attr => (
              <SelectItem key={attr.id} value={attr.id}>
                <div className="flex items-center gap-2">
                  {attr.label}
                  <Badge variant="outline" className="text-xs">
                    {attr.pricing_type}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                Configure preços específicos deste produto para cada contexto de venda 
                (PVP, Bundle, Compra). Preços não definidos herdam do global.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Content Area */}
      {supportsContextPricing ? (
        <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-20">
          <div className="space-y-3 pr-2">
            {renderContextSection(retailContext, 'retail', 'PVP (Preço de Venda)')}
            {renderContextSection(bundleContext, 'bundle', 'Bundle (Pacotes)')}
            {renderContextSection(purchaseContext, 'purchase', 'Compra (Custo)')}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-12 space-y-3 max-w-md">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <Layers className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-muted-foreground font-medium">
                Atributos de intervalo não suportam contextos de preço
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Atributos do tipo "range" usam a configuração de intervalos existente.
                Para editar intervalos, use a aba "Preços Simples".
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save Footer */}
      {supportsContextPricing && (
        <PermissionGate permission="products.edit">
          <div className="flex items-center justify-between gap-2 pt-4 border-t flex-shrink-0 bg-background">
            <div>
              {hasChanges && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {t('priceContexts.unsavedChanges')}
                </Badge>
              )}
            </div>
            <Button 
              onClick={handleSave} 
              disabled={saving || !hasChanges}
              className="min-w-[120px]"
            >
              {saving ? t('priceContexts.saving') : t('priceContexts.savePrices')}
            </Button>
          </div>
        </PermissionGate>
      )}
    </div>
  );
}
