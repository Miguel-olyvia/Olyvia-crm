import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Info, DollarSign, Copy, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/hooks/useTranslation";
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
import { AttributeContextPricesTab } from "@/components/product-prices";

interface ProductAttributePricesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  companyId: string | null;
}

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  allowed_values?: string[] | null;
  pricing_type: string | null;
}

interface ValuePrice {
  id?: string;
  attribute_id: string;
  value_option: string;
  price: number;
  isProductSpecific: boolean;
}

interface PriceRange {
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
  isProductSpecific: boolean;
}

export default function ProductAttributePricesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  companyId
}: ProductAttributePricesDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingToSubcategory, setApplyingToSubcategory] = useState(false);
  const [productAttributes, setProductAttributes] = useState<ProductAttribute[]>([]);
  const [valuePrices, setValuePrices] = useState<ValuePrice[]>([]);
  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([]);
  const [selectedAttribute, setSelectedAttribute] = useState<string>("");
  const [productSubcategoryId, setProductSubcategoryId] = useState<string | null>(null);
  const [inheritedRangeSource, setInheritedRangeSource] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!productId) return;
    
    setLoading(true);
    try {
      // Load product's subcategory
      const { data: productData } = await supabase
        .from("products")
        .select("subcategory_id")
        .eq("id", productId)
        .single();
      
      if (productData?.subcategory_id) {
        setProductSubcategoryId(productData.subcategory_id);
      }

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
      }

      // Load existing value prices (both global and product-specific)
      const { data: vPrices } = await supabase
        .from("product_attribute_value_prices")
        .select("*")
        .in("attribute_id", attrIds)
        .or(`product_id.eq.${productId},product_id.is.null`);

      if (vPrices) {
        setValuePrices(vPrices.map(vp => ({
          id: vp.id,
          attribute_id: vp.attribute_id,
          value_option: vp.value_option,
          price: vp.price,
          isProductSpecific: vp.product_id === productId
        })));
      }

      // Load existing price ranges with proper hierarchy: product → subcategory → category → global
      // First load product-specific ranges
      const { data: productRanges } = await supabase
        .from("product_attribute_price_ranges")
        .select("*")
        .in("attribute_id", attrIds)
        .eq("product_id", productId);

      const mappedProductRanges: PriceRange[] = (productRanges || []).map(r => ({
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
        isProductSpecific: true
      }));

      // Now resolve inherited ranges per attribute through hierarchy
      // Get product's category info
      const { data: prodCatInfo } = await supabase
        .from("products")
        .select("category_id")
        .eq("id", productId)
        .single();

      let inheritedRanges: PriceRange[] = [];
      let inheritSource = 'Global';

      if (prodCatInfo?.category_id) {
        // Try product's direct category first
        const { data: catRanges } = await supabase
          .from("product_attribute_price_ranges")
          .select("*")
          .in("attribute_id", attrIds)
          .eq("category_id", prodCatInfo.category_id)
          .is("product_id", null);

        if (catRanges && catRanges.length > 0) {
          // Found at direct category level - check if it's a subcategory or root
          const { data: catDetail } = await supabase
            .from("product_categories")
            .select("name, parent_category_id")
            .eq("id", prodCatInfo.category_id)
            .single();

          inheritSource = catDetail?.parent_category_id ? `Subcategoria: ${catDetail.name}` : `Categoria: ${catDetail?.name || ''}`;
          inheritedRanges = catRanges.map(r => ({
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
            isProductSpecific: false
          }));
        } else {
          // Try parent category if product's category is a subcategory
          const { data: catDetail } = await supabase
            .from("product_categories")
            .select("parent_category_id, name")
            .eq("id", prodCatInfo.category_id)
            .single();

          if (catDetail?.parent_category_id) {
            const { data: parentCatRanges } = await supabase
              .from("product_attribute_price_ranges")
              .select("*")
              .in("attribute_id", attrIds)
              .eq("category_id", catDetail.parent_category_id)
              .is("product_id", null);

            if (parentCatRanges && parentCatRanges.length > 0) {
              const { data: parentCat } = await supabase
                .from("product_categories")
                .select("name")
                .eq("id", catDetail.parent_category_id)
                .single();
              inheritSource = `Categoria: ${parentCat?.name || ''}`;
              inheritedRanges = parentCatRanges.map(r => ({
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
                isProductSpecific: false
              }));
            }
          }
        }
      }

      // Fallback to global if no category ranges found
      if (inheritedRanges.length === 0) {
        const { data: globalRangesData } = await supabase
          .from("product_attribute_price_ranges")
          .select("*")
          .in("attribute_id", attrIds)
          .is("product_id", null)
          .is("category_id", null);

        inheritSource = 'Global';
        inheritedRanges = (globalRangesData || []).map(r => ({
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
          isProductSpecific: false
        }));
      }

      setInheritedRangeSource(inheritSource);
      setPriceRanges([...inheritedRanges, ...mappedProductRanges]);

      // Auto-select first attribute
      if (attrs && attrs.length > 0) {
        const pricingAttrs = attrs.filter(a => 
          a.pricing_type === 'fixed' || a.pricing_type === 'range' || a.pricing_type === 'both'
        );
        if (pricingAttrs.length > 0) {
          setSelectedAttribute(pricingAttrs[0].id);
        }
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    if (open && productId) {
      loadData();
    } else {
      setProductAttributes([]);
      setValuePrices([]);
      setPriceRanges([]);
      setSelectedAttribute("");
    }
  }, [open, productId, loadData]);

  const handleValuePriceChange = (attrId: string, valueOption: string, price: number) => {
    setValuePrices(prev => {
      // Check if product-specific price exists
      const existingProductSpecific = prev.find(
        vp => vp.attribute_id === attrId && vp.value_option === valueOption && vp.isProductSpecific
      );
      
      if (existingProductSpecific) {
        return prev.map(vp => 
          vp.attribute_id === attrId && vp.value_option === valueOption && vp.isProductSpecific
            ? { ...vp, price }
            : vp
        );
      }
      
      // Create new product-specific price
      return [...prev, {
        attribute_id: attrId,
        value_option: valueOption,
        price,
        isProductSpecific: true
      }];
    });
  };

  const handleRemoveProductSpecificPrice = (attrId: string, valueOption: string) => {
    setValuePrices(prev => prev.filter(vp => 
      !(vp.attribute_id === attrId && vp.value_option === valueOption && vp.isProductSpecific)
    ));
  };

  const handleRangePriceChange = (rangeId: string | undefined, attrId: string, field: string, value: any) => {
    setPriceRanges(prev => {
      if (rangeId) {
        return prev.map(r => r.id === rangeId ? { ...r, [field]: value } : r);
      }
      return prev;
    });
  };

  const handleAddProductSpecificRange = (attrId: string, baseRange: PriceRange) => {
    setPriceRanges(prev => [...prev, {
      ...baseRange,
      id: undefined,
      attribute_id: attrId,
      isProductSpecific: true
    }]);
  };

  const handleProductRangeFieldChange = (index: number, field: string, value: any) => {
    setPriceRanges(prev => {
      const productRanges = prev.filter(r => r.attribute_id === selectedAttribute && r.isProductSpecific);
      const otherRanges = prev.filter(r => !(r.attribute_id === selectedAttribute && r.isProductSpecific));
      
      const updatedProductRanges = productRanges.map((r, idx) => 
        idx === index ? { ...r, [field]: value } : r
      );
      
      return [...otherRanges, ...updatedProductRanges];
    });
  };

  const handleRemoveProductSpecificRange = (rangeId: string | undefined, attrId: string, index: number) => {
    if (rangeId) {
      setPriceRanges(prev => prev.filter(r => r.id !== rangeId));
    } else {
      setPriceRanges(prev => {
        const productRanges = prev.filter(r => r.attribute_id === attrId && r.isProductSpecific);
        const otherRanges = prev.filter(r => !(r.attribute_id === attrId && r.isProductSpecific));
        const updatedProductRanges = productRanges.filter((_, idx) => idx !== index);
        return [...otherRanges, ...updatedProductRanges];
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save product-specific value prices
      const productValuePrices = valuePrices.filter(vp => vp.isProductSpecific);
      
      // Delete existing product-specific prices for this product
      await supabase
        .from("product_attribute_value_prices")
        .delete()
        .eq("product_id", productId);

      // Insert new product-specific prices
      if (productValuePrices.length > 0) {
        const toInsert = productValuePrices.map(vp => ({
          attribute_id: vp.attribute_id,
          value_option: vp.value_option,
          price: vp.price,
          product_id: productId,
          organization_id: companyId
        }));
        
        const { error } = await supabase
          .from("product_attribute_value_prices")
          .insert(toInsert);
        
        if (error) throw error;
      }

      // Save product-specific price ranges
      const productRanges = priceRanges.filter(r => r.isProductSpecific);
      
      // Delete existing product-specific ranges for this product
      await supabase
        .from("product_attribute_price_ranges")
        .delete()
        .eq("product_id", productId);

      // Insert new product-specific ranges
      if (productRanges.length > 0) {
        const toInsert = productRanges.map(r => ({
          attribute_id: r.attribute_id,
          range_type: r.range_type,
          min_value: r.min_value,
          max_value: r.max_value,
          min_width: r.min_width,
          max_width: r.max_width,
          min_height: r.min_height,
          max_height: r.max_height,
          min_depth: r.min_depth,
          max_depth: r.max_depth,
          price_per_unit: r.price_per_unit,
          product_id: productId,
          organization_id: companyId
        }));
        
        const { error } = await supabase
          .from("product_attribute_price_ranges")
          .insert(toInsert);
        
        if (error) throw error;
      }

      toast({
        title: "Preços guardados",
        description: "Os preços específicos deste produto foram guardados com sucesso."
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao guardar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToSubcategory = async () => {
    if (!productSubcategoryId || !currentAttribute) return;
    
    const productRangesToApply = priceRanges.filter(r => r.isProductSpecific && r.attribute_id === currentAttribute.id);
    
    if (productRangesToApply.length === 0) {
      toast({
        title: "Sem intervalos",
        description: "Não existem intervalos específicos para aplicar.",
        variant: "destructive"
      });
      return;
    }
    
    setApplyingToSubcategory(true);
    try {
      // Get all products in the same subcategory (except current one) AND same company
      const { data: subcategoryProducts } = await supabase
        .from("products")
        .select("id")
        .eq("subcategory_id", productSubcategoryId)
        .eq("organization_id", companyId)
        .neq("id", productId);
      
      if (!subcategoryProducts || subcategoryProducts.length === 0) {
        toast({
          title: "Sem produtos",
          description: "Não existem outros produtos nesta subcategoria."
        });
        return;
      }
      
      const targetProductIds = subcategoryProducts.map(p => p.id);
      
      // For each product, delete existing specific ranges for this attribute and insert new ones
      for (const targetId of targetProductIds) {
        // Delete existing specific ranges for this attribute
        await supabase
          .from("product_attribute_price_ranges")
          .delete()
          .eq("product_id", targetId)
          .eq("attribute_id", currentAttribute.id);
        
        // Insert new ranges
        const toInsert = productRangesToApply.map(r => ({
          attribute_id: r.attribute_id,
          range_type: r.range_type,
          min_value: r.min_value,
          max_value: r.max_value,
          min_width: r.min_width,
          max_width: r.max_width,
          min_height: r.min_height,
          max_height: r.max_height,
          min_depth: r.min_depth,
          max_depth: r.max_depth,
          price_per_unit: r.price_per_unit,
          product_id: targetId,
          organization_id: companyId
        }));
        
        await supabase
          .from("product_attribute_price_ranges")
          .insert(toInsert);
      }
      
      toast({
        title: "Aplicado com sucesso",
        description: `Intervalos aplicados a ${targetProductIds.length} produtos da subcategoria.`
      });
    } catch (error: any) {
      toast({
        title: "Erro ao aplicar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setApplyingToSubcategory(false);
    }
  };

  const getEffectivePrice = (attrId: string, valueOption: string): { price: number; isProductSpecific: boolean } => {
    // First check for product-specific price
    const productPrice = valuePrices.find(
      vp => vp.attribute_id === attrId && vp.value_option === valueOption && vp.isProductSpecific
    );
    if (productPrice) return { price: productPrice.price, isProductSpecific: true };
    
    // Fall back to global price
    const globalPrice = valuePrices.find(
      vp => vp.attribute_id === attrId && vp.value_option === valueOption && !vp.isProductSpecific
    );
    if (globalPrice) return { price: globalPrice.price, isProductSpecific: false };
    
    return { price: 0, isProductSpecific: false };
  };

  const currentAttribute = productAttributes.find(a => a.id === selectedAttribute);

  const getAttributeValuePrices = (attrId: string) => {
    const attr = productAttributes.find(a => a.id === attrId);
    if (!attr?.allowed_values) return [];
    return attr.allowed_values;
  };

  const getAttributeRanges = (attrId: string) => {
    return priceRanges.filter(r => r.attribute_id === attrId);
  };

  const globalRanges = currentAttribute ? getAttributeRanges(currentAttribute.id).filter(r => !r.isProductSpecific) : [];
  const productSpecificRanges = currentAttribute ? getAttributeRanges(currentAttribute.id).filter(r => r.isProductSpecific) : [];

  const [activeTab, setActiveTab] = useState<'simple' | 'context'>('simple');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Preços de Atributos: {productName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'simple' | 'context')} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="grid grid-cols-2 w-full max-w-md flex-shrink-0">
            <TabsTrigger value="simple" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t('priceContexts.simplePrices')}
            </TabsTrigger>
            <TabsTrigger value="context" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {t('priceContexts.byContext')}
            </TabsTrigger>
          </TabsList>

          {/* Simple Prices Tab */}
          <TabsContent value="simple" className="flex-1 flex flex-col min-h-0 mt-4 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <span className="text-muted-foreground">A carregar...</span>
              </div>
            ) : productAttributes.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-muted-foreground">
                  Este produto não tem atributos com preçário configurado.
                </p>
                <p className="text-xs text-muted-foreground">
                  Configure primeiro os atributos em Catálogo → Atributos de Produto.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
                        <p className="text-sm">
                          Configure preços específicos para este produto. 
                          Se não definir, serão usados os preços globais do atributo.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Scrollable Content Area */}
                {currentAttribute && (
                  <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-24">
                    <div className="space-y-6 pr-2">
                  {/* Fixed Prices (for list-type attributes) */}
                  {(currentAttribute.pricing_type === 'fixed' || currentAttribute.pricing_type === 'both') && 
                   currentAttribute.allowed_values && 
                   Array.isArray(currentAttribute.allowed_values) && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Preços por Opção</h4>
                      <ScrollArea className="h-[300px] border rounded-md">
                        <div className="grid gap-2 p-2">
                          {currentAttribute.allowed_values.map((option: string) => {
                            const { price, isProductSpecific } = getEffectivePrice(currentAttribute.id, option);
                            return (
                              <div key={option} className="flex items-center gap-3 p-2 border rounded-md bg-background">
                                <span className="flex-1 text-sm">{option}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant={isProductSpecific ? "default" : "secondary"} className="text-xs">
                                    {isProductSpecific ? "Específico" : "Global"}
                                  </Badge>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-24"
                                    value={isProductSpecific ? price : ""}
                                    placeholder={price.toFixed(2)}
                                    onChange={(e) => {
                                      const newPrice = parseFloat(e.target.value) || 0;
                                      handleValuePriceChange(currentAttribute.id, option, newPrice);
                                    }}
                                  />
                                  <span className="text-sm text-muted-foreground">€</span>
                                  {isProductSpecific && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => handleRemoveProductSpecificPrice(currentAttribute.id, option)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Range Prices */}
                  {(currentAttribute.pricing_type === 'range' || currentAttribute.pricing_type === 'both') && (
                    <div className="space-y-4">
                      <Separator />
                      <h4 className="font-medium text-sm">Preços por Intervalo/Medida</h4>
                      
                      {/* Global ranges (read-only reference) */}
                      {globalRanges.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">Intervalos herdados de {inheritedRangeSource || 'Global'} (referência):</p>
                          <div className="max-h-48 overflow-y-auto border rounded-md">
                            <div className="grid gap-1 p-1">
                              {globalRanges.map((range, idx) => (
                                <div key={range.id || idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                                  {range.range_type === 'linear' ? (
                                    <span>{range.min_value} - {range.max_value ?? '∞'}</span>
                                  ) : range.range_type === 'dimension' ? (
                                    <span>
                                      C: {range.min_width}-{range.max_width ?? '∞'} × L: {range.min_height}-{range.max_height ?? '∞'}
                                    </span>
                                  ) : (
                                    <span>
                                      {range.min_depth}-{range.max_depth ?? '∞'} × {range.min_width}-{range.max_width ?? '∞'} × {range.min_height}-{range.max_height ?? '∞'}
                                    </span>
                                  )}
                                  <span className="ml-auto font-medium">€{range.price_per_unit.toFixed(2)}</span>
                                  <Badge variant="secondary" className="text-xs">Global</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Product-specific ranges */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Intervalos específicos deste produto:</p>
                          <div className="flex gap-2">
                            {globalRanges.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Plus className="h-4 w-4 mr-1" />
                                    Copiar intervalo global
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto z-[9999] bg-popover">
                                  {globalRanges.map((range, idx) => {
                                    const rangeLabel = range.range_type === 'linear'
                                      ? `${range.min_value ?? 0} - ${range.max_value ?? '∞'}`
                                      : range.range_type === 'dimension3d'
                                        ? `C: ${range.min_width ?? 0}-${range.max_width ?? '∞'} × L: ${range.min_height ?? 0}-${range.max_height ?? '∞'} × A: ${range.min_depth ?? 0}-${range.max_depth ?? '∞'}`
                                        : `C: ${range.min_width ?? 0}-${range.max_width ?? '∞'} × L: ${range.min_height ?? 0}-${range.max_height ?? '∞'}`;
                                    return (
                                      <DropdownMenuItem
                                        key={range.id || `global-${idx}`}
                                        onClick={() => {
                                          handleAddProductSpecificRange(currentAttribute.id, {
                                            ...range,
                                            id: undefined,
                                            isProductSpecific: true
                                          });
                                        }}
                                      >
                                        <span className="flex-1 truncate">{rangeLabel}</span>
                                        <span className="ml-2 text-muted-foreground">€{range.price_per_unit?.toFixed(2) ?? '0.00'}</span>
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                const rangeType = globalRanges.length > 0 
                                  ? globalRanges[0].range_type 
                                  : 'dimension';
                                handleAddProductSpecificRange(currentAttribute.id, {
                                  attribute_id: currentAttribute.id,
                                  range_type: rangeType,
                                  min_value: 0,
                                  max_value: null,
                                  min_width: 0,
                                  max_width: null,
                                  min_height: 0,
                                  max_height: null,
                                  min_depth: 0,
                                  max_depth: null,
                                  price_per_unit: 0,
                                  isProductSpecific: true
                                });
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Novo intervalo
                            </Button>
                          </div>
                        </div>
                        
                        {productSpecificRanges.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic py-4">
                            Nenhum intervalo específico. Serão usados os intervalos globais.
                          </p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto border rounded-md p-2">
                            <div className="grid gap-3">
                            {productSpecificRanges.map((range, idx) => (
                              <div key={range.id || `new-${idx}`} className="p-3 border border-primary/30 rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Select 
                                      value={range.range_type} 
                                      onValueChange={(val) => handleProductRangeFieldChange(idx, 'range_type', val)}
                                    >
                                      <SelectTrigger className="w-40">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="linear">Linear</SelectItem>
                                        <SelectItem value="dimension">2D (CxL)</SelectItem>
                                        <SelectItem value="dimension3d">3D (CxLxA)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Badge variant="default" className="text-xs">Específico</Badge>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleRemoveProductSpecificRange(range.id, currentAttribute.id, idx)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                {range.range_type === 'linear' ? (
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs w-16">Valor:</Label>
                                    <Input
                                      type="number"
                                      className="w-24"
                                      value={range.min_value}
                                      onChange={(e) => handleProductRangeFieldChange(idx, 'min_value', parseFloat(e.target.value) || 0)}
                                      placeholder="Min"
                                    />
                                    <span>-</span>
                                    <Input
                                      type="number"
                                      className="w-24"
                                      value={range.max_value ?? ""}
                                      onChange={(e) => handleProductRangeFieldChange(idx, 'max_value', e.target.value ? parseFloat(e.target.value) : null)}
                                      placeholder="Max"
                                    />
                                  </div>
                                ) : range.range_type === 'dimension' ? (
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-8">C:</Label>
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={range.min_width ?? 0}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'min_width', parseFloat(e.target.value) || 0)}
                                        placeholder="Min"
                                      />
                                      <span>-</span>
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={range.max_width ?? ""}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'max_width', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder="Max"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-8">L:</Label>
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={range.min_height ?? 0}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'min_height', parseFloat(e.target.value) || 0)}
                                        placeholder="Min"
                                      />
                                      <span>-</span>
                                      <Input
                                        type="number"
                                        className="w-20"
                                        value={range.max_height ?? ""}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'max_height', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder="Max"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-8">C:</Label>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.min_depth ?? 0}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'min_depth', parseFloat(e.target.value) || 0)}
                                        placeholder="Min"
                                      />
                                      <span>-</span>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.max_depth ?? ""}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'max_depth', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder="Max"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-8">L:</Label>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.min_width ?? 0}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'min_width', parseFloat(e.target.value) || 0)}
                                        placeholder="Min"
                                      />
                                      <span>-</span>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.max_width ?? ""}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'max_width', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder="Max"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs w-8">A:</Label>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.min_height ?? 0}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'min_height', parseFloat(e.target.value) || 0)}
                                        placeholder="Min"
                                      />
                                      <span>-</span>
                                      <Input
                                        type="number"
                                        className="w-16"
                                        value={range.max_height ?? ""}
                                        onChange={(e) => handleProductRangeFieldChange(idx, 'max_height', e.target.value ? parseFloat(e.target.value) : null)}
                                        placeholder="Max"
                                      />
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-2 pt-2 border-t">
                                  <Label className="text-xs">Preço:</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="w-28"
                                    value={range.price_per_unit}
                                    onChange={(e) => handleProductRangeFieldChange(idx, 'price_per_unit', parseFloat(e.target.value) || 0)}
                                  />
                                  <span className="text-sm">€</span>
                                </div>
                              </div>
                            ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        
        {/* Footer for Simple Tab */}
        {activeTab === 'simple' && (
          <DialogFooter className="mt-4 flex-wrap gap-2 flex-shrink-0 border-t pt-4">
            {productSubcategoryId && productSpecificRanges.length > 0 && (
              <Button 
                variant="secondary" 
                onClick={handleApplyToSubcategory} 
                disabled={applyingToSubcategory || saving}
                className="mr-auto"
              >
                <Copy className="h-4 w-4 mr-2" />
                {applyingToSubcategory ? "A aplicar..." : "Aplicar a subcategoria"}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </DialogFooter>
        )}

          {/* Context Prices Tab */}
          <TabsContent value="context" className="flex-1 flex flex-col min-h-0 mt-4">
            <AttributeContextPricesTab
              productId={productId}
              productName={productName}
              companyId={companyId}
              onSaved={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}