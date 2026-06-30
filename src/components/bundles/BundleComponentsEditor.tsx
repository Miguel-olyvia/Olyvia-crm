import { useState, useEffect, useRef } from "react";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { useBundleCatalogItems, CatalogItem } from "@/hooks/useBundleCatalogItems";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Package, Wrench, Search, Loader2, TrendingUp } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

interface BundleComponent {
  id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  pricing_mode: string;
  custom_price: number | null;
  custom_discount_percent: number | null;
  custom_discount_fixed: number | null;
  is_optional: boolean;
  choice_group_id: string | null;
  sort_order: number;
  product?: { id: string; name: string; sku: string; };
  service?: { id: string; name: string; };
  retail_price?: number;
  cost_price?: number;
}

interface BundleComponentsEditorProps {
  bundleId: string;
}

export default function BundleComponentsEditor({ bundleId }: BundleComponentsEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  const [components, setComponents] = useState<BundleComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  
  // Debounce search to avoid excessive queries
  const debouncedSearch = useDebounce(localSearchTerm, 300);
  
  // Use optimized catalog hook
  const catalog = useBundleCatalogItems(activeCompany?.id);
  
  // Ref for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadComponents();
  }, [bundleId]);

  const loadComponents = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("bundle_components")
        .select(`
          *,
          product:products(id, name, sku),
          service:services(id, name)
        `)
        .eq("bundle_id", bundleId)
        .order("sort_order");
      
      if (error) throw error;

      // Load prices for each component (retail + purchase/cost)
      const componentsWithPrices = await Promise.all((data || []).map(async (comp) => {
        let retailPrice = 0;
        let costPrice = 0;

        if (comp.product_id) {
          const { data: priceData } = await supabase
            .from("product_prices")
            .select("price, price_type")
            .eq("product_id", comp.product_id)
            .in("price_type", ["retail", "purchase"]);
          (priceData || []).forEach((p: any) => {
            if (p.price_type === "retail") retailPrice = Number(p.price) || 0;
            if (p.price_type === "purchase") costPrice = Number(p.price) || 0;
          });
        } else if (comp.service_id) {
          const { data: priceData } = await supabase
            .from("service_prices")
            .select("price, price_type")
            .eq("service_id", comp.service_id)
            .in("price_type", ["retail", "purchase"]);
          (priceData || []).forEach((p: any) => {
            if (p.price_type === "retail") retailPrice = Number(p.price) || 0;
            if (p.price_type === "purchase") costPrice = Number(p.price) || 0;
          });
        }

        return { ...comp, retail_price: retailPrice, cost_price: costPrice };
      }));

      setComponents(componentsWithPrices);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Update debounced search in catalog hook
  useEffect(() => {
    catalog.changeSearch(debouncedSearch);
  }, [debouncedSearch, catalog.changeSearch]);

  // Reset when dialog opens
  useEffect(() => {
    if (showAddDialog) {
      setSelectedItems(new Set());
      setLocalSearchTerm("");
      catalog.refresh();
    }
  }, [showAddDialog]);

  // Infinite scroll observer
  useEffect(() => {
    if (!showAddDialog) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && catalog.hasMore && !catalog.loading) {
          catalog.loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [showAddDialog, catalog.hasMore, catalog.loading, catalog.loadMore]);

  const handleAddItems = async () => {
    if (selectedItems.size === 0) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const newComponents = Array.from(selectedItems).map((itemId, index) => ({
        bundle_id: bundleId,
        product_id: catalog.itemType === 'product' ? itemId : null,
        service_id: catalog.itemType === 'service' ? itemId : null,
        quantity: 1,
        pricing_mode: 'original' as const,
        is_optional: false,
        sort_order: components.length + index,
      }));

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("bundle_components")
          .insert(newComponents)
      );

      if (error) throw error;

      toast({
        title: t('bundles.components.added'),
        description: t('bundles.components.addedDescription'),
      });

      setShowAddDialog(false);
      catalog.clearCache(); // Clear cache to refresh on next open
      loadComponents();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateComponent = async (id: string, updates: Partial<BundleComponent>) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      // Cast pricing_mode if it exists
      const dbUpdates: Record<string, unknown> = { ...updates };
      if (updates.pricing_mode) {
        dbUpdates.pricing_mode = updates.pricing_mode as "original" | "custom_price" | "custom_discount_percent" | "custom_discount_fixed";
      }

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("bundle_components")
          .update(dbUpdates as any)
          .eq("id", id)
      );

      if (error) throw error;

      setComponents(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteComponent = async (id: string) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("bundle_components")
          .delete()
          .eq("id", id)
      );

      if (error) throw error;

      setComponents(prev => prev.filter(c => c.id !== id));
      
      toast({
        title: t('bundles.components.deleted'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getComponentFinalPrice = (comp: BundleComponent) => {
    const basePrice = comp.retail_price || 0;
    
    switch (comp.pricing_mode) {
      case 'custom_price':
        return comp.custom_price || 0;
      case 'custom_discount_percent':
        return basePrice * (1 - (comp.custom_discount_percent || 0) / 100);
      case 'custom_discount_fixed':
        return Math.max(0, basePrice - (comp.custom_discount_fixed || 0));
      default:
        return basePrice;
    }
  };

  // Exclude already added items
  const existingIds = new Set(components.map(c => c.product_id || c.service_id));
  const availableItems = catalog.items.filter(item => !existingIds.has(item.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">{t('bundles.components.title')}</h4>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('bundles.components.add')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : components.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-2">{t('bundles.components.empty')}</p>
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('bundles.components.addFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {components.map((comp) => (
            <Card key={comp.id} className="p-3">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {comp.product_id ? (
                    <Package className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Wrench className="h-5 w-5 text-green-500" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {comp.product?.name || comp.service?.name}
                    </p>
                    {comp.product?.sku && (
                      <Badge variant="outline" className="text-xs">{comp.product.sku}</Badge>
                    )}
                    {comp.is_optional && (
                      <Badge variant="secondary" className="text-xs">{t('bundles.components.optional')}</Badge>
                    )}
                  </div>
                  
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">{t('bundles.components.quantity')}</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={comp.quantity}
                        onChange={(e) => handleUpdateComponent(comp.id, { quantity: parseFloat(e.target.value) || 1 })}
                        className="h-8"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">{t('bundles.components.pricingMode')}</Label>
                      <Select
                        value={comp.pricing_mode}
                        onValueChange={(value) => handleUpdateComponent(comp.id, { pricing_mode: value })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">{t('bundles.components.originalPrice')}</SelectItem>
                          <SelectItem value="custom_price">{t('bundles.components.customPrice')}</SelectItem>
                          <SelectItem value="custom_discount_percent">{t('bundles.components.discountPercent')}</SelectItem>
                          <SelectItem value="custom_discount_fixed">{t('bundles.components.discountFixed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {comp.pricing_mode === 'custom_price' && (
                      <div>
                        <Label className="text-xs">{t('bundles.components.price')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={comp.custom_price ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleUpdateComponent(comp.id, { custom_price: val === '' ? null : parseFloat(val) });
                          }}
                          className="h-8"
                        />
                      </div>
                    )}
                    
                    {comp.pricing_mode === 'custom_discount_percent' && (
                      <div>
                        <Label className="text-xs">{t('bundles.components.discountPercentValue')}</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={comp.custom_discount_percent || ''}
                          onChange={(e) => handleUpdateComponent(comp.id, { custom_discount_percent: parseFloat(e.target.value) || null })}
                          className="h-8"
                        />
                      </div>
                    )}
                    
                    {comp.pricing_mode === 'custom_discount_fixed' && (
                      <div>
                        <Label className="text-xs">{t('bundles.components.discountFixedValue')}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={comp.custom_discount_fixed || ''}
                          onChange={(e) => handleUpdateComponent(comp.id, { custom_discount_fixed: parseFloat(e.target.value) || null })}
                          className="h-8"
                        />
                      </div>
                    )}
                    
                    <div className="flex items-end">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`optional-${comp.id}`}
                          checked={comp.is_optional}
                          onCheckedChange={(checked) => handleUpdateComponent(comp.id, { is_optional: !!checked })}
                        />
                        <Label htmlFor={`optional-${comp.id}`} className="text-xs">
                          {t('bundles.components.optional')}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground line-through">
                      {formatCurrency(comp.retail_price || 0)}
                    </p>
                    <p className="font-semibold text-primary">
                      {formatCurrency(getComponentFinalPrice(comp) * comp.quantity)}
                    </p>
                    {(() => {
                      const cost = (comp.cost_price || 0) * comp.quantity;
                      const finalPrice = getComponentFinalPrice(comp) * comp.quantity;
                      if (cost <= 0 || finalPrice <= 0) {
                        return <p className="text-[10px] text-muted-foreground mt-1">Sem custo definido</p>;
                      }
                      const margin = ((finalPrice - cost) / finalPrice) * 100;
                      const colorClass = margin >= 30 ? "text-green-600" : margin >= 15 ? "text-amber-600" : "text-red-600";
                      return (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">Custo: {formatCurrency(cost)}</p>
                          <p className={cn("text-xs font-medium flex items-center justify-end gap-1", colorClass)}>
                            <TrendingUp className="h-3 w-3" />
                            Margem: {margin.toFixed(1)}%
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteComponent(comp.id)}
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {/* Bundle margin summary */}
          {(() => {
            const totalCost = components.reduce((s, c) => s + (c.cost_price || 0) * c.quantity, 0);
            const totalPrice = components.reduce((s, c) => s + getComponentFinalPrice(c) * c.quantity, 0);
            const hasCost = components.some(c => (c.cost_price || 0) > 0);
            if (!hasCost || totalPrice <= 0) return null;
            const totalMargin = ((totalPrice - totalCost) / totalPrice) * 100;
            const colorClass = totalMargin >= 30 ? "text-green-600" : totalMargin >= 15 ? "text-amber-600" : "text-red-600";
            return (
              <Card className="p-3 bg-muted/40">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Margem total do bundle</div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Custo: <strong>{formatCurrency(totalCost)}</strong></span>
                    <span className="text-muted-foreground">Preço: <strong>{formatCurrency(totalPrice)}</strong></span>
                    <span className={cn("font-bold flex items-center gap-1", colorClass)}>
                      <TrendingUp className="h-4 w-4" />
                      {totalMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Add Items Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('bundles.components.addItems')}</DialogTitle>
            <DialogDescription>
              {t('bundles.components.addItemsDescription')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-4 mb-4">
            <Select 
              value={catalog.itemType} 
              onValueChange={(v: 'product' | 'service') => {
                catalog.changeType(v);
                setSelectedItems(new Set());
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">{t('bundles.components.products')}</SelectItem>
                <SelectItem value="service">{t('bundles.components.services')}</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('bundles.components.searchItems')}
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <ScrollArea className="h-[350px] border rounded-md" ref={scrollContainerRef}>
            <div className="p-2 space-y-1">
              {catalog.loading && availableItems.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {t('common.loading')}
                </div>
              ) : availableItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('bundles.components.noItemsFound')}
                </div>
              ) : (
                <>
                  {availableItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                        selectedItems.has(item.id) ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                      }`}
                      onClick={() => {
                        setSelectedItems(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) {
                            next.delete(item.id);
                          } else {
                            next.add(item.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <Checkbox checked={selectedItems.has(item.id)} />
                      {item.type === 'product' ? (
                        <Package className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Wrench className="h-4 w-4 text-green-500" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </div>
                      <p className="font-semibold">{formatCurrency(item.retail_price)}</p>
                    </div>
                  ))}
                  
                  {/* Infinite scroll trigger */}
                  <div ref={loadMoreTriggerRef} className="h-4">
                    {catalog.loading && availableItems.length > 0 && (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddItems} disabled={selectedItems.size === 0}>
              {t('bundles.components.addSelected')} ({selectedItems.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
