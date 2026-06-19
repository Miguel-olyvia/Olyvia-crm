import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Package, Wrench, Tag, ChevronDown, Layers, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import LineAttributesDialog from "@/components/LineAttributesDialog";

interface ChoiceGroup {
  id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  sort_order: number;
}

interface ChoiceComponent {
  id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  pricing_mode: string;
  custom_price: number | null;
  product_name: string | null;
  product_sku: string | null;
  service_name: string | null;
  retail_price: number;
  has_attributes: boolean;
}

interface BundleChoiceConfig {
  choice_selections: Record<string, string[]>; // group_id -> component_ids
  component_attributes: Record<string, { attrs: Record<string, any>; price_addon: number }>; // component_id -> attrs
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundleId: string;
  bundleName: string;
  currentConfig: BundleChoiceConfig | null;
  onSave: (config: BundleChoiceConfig) => void;
}

export function BundleChoiceConfigDialog({
  open,
  onOpenChange,
  bundleId,
  bundleName,
  currentConfig,
  onSave,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ChoiceGroup[]>([]);
  const [components, setComponents] = useState<Record<string, ChoiceComponent[]>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [componentAttrs, setComponentAttrs] = useState<Record<string, { attrs: Record<string, any>; price_addon: number }>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Attribute dialog state
  const [attrDialogOpen, setAttrDialogOpen] = useState(false);
  const [editingAttrComp, setEditingAttrComp] = useState<{
    componentId: string;
    productId: string;
    productName: string;
    currentAttrs: Record<string, any>;
  } | null>(null);

  useEffect(() => {
    if (open && bundleId) {
      loadBundleChoices();
    }
  }, [open, bundleId]);

  const loadBundleChoices = async () => {
    setLoading(true);
    try {
      // Load choice groups
      const { data: groupsData, error: gErr } = await supabase
        .from("bundle_choice_groups")
        .select("*")
        .eq("bundle_id", bundleId)
        .order("sort_order");

      if (gErr) throw gErr;

      const loadedGroups = groupsData || [];
      setGroups(loadedGroups);
      setExpandedGroups(new Set(loadedGroups.map(g => g.id)));

      // Load components for all groups
      const groupIds = loadedGroups.map(g => g.id);
      if (groupIds.length === 0) {
        setComponents({});
        setLoading(false);
        return;
      }

      const { data: compsData, error: cErr } = await (supabase as any)
        .from("bundle_components")
        .select(`
          id, product_id, service_id, quantity, pricing_mode, custom_price, choice_group_id,
          products:product_id(id, name, sku),
          services:service_id(id, name)
        `)
        .in("choice_group_id", groupIds)
        .order("sort_order");

      if (cErr) throw cErr;

      // Get prices + check attributes for products
      const productIds = (compsData || []).filter((c: any) => c.product_id).map((c: any) => c.product_id);
      const serviceIds = (compsData || []).filter((c: any) => c.service_id).map((c: any) => c.service_id);

      const [productPricesRes, servicePricesRes, productAttrsRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from("product_prices").select("product_id, price").eq("price_type", "retail").in("product_id", productIds)
          : { data: [] },
        serviceIds.length > 0
          ? supabase.from("service_prices").select("service_id, price").eq("price_type", "retail").in("service_id", serviceIds)
          : { data: [] },
        productIds.length > 0
          ? supabase.from("product_attribute_values").select("product_id").in("product_id", productIds)
          : { data: [] },
      ]);

      const prodPriceMap = new Map((productPricesRes.data || []).map((p: any) => [p.product_id, p.price]));
      const svcPriceMap = new Map((servicePricesRes.data || []).map((p: any) => [p.service_id, p.price]));
      const productsWithAttrs = new Set((productAttrsRes.data || []).map((p: any) => p.product_id));

      // Group components by choice_group_id
      const compsByGroup: Record<string, ChoiceComponent[]> = {};
      for (const comp of (compsData || [])) {
        const gid = comp.choice_group_id;
        if (!compsByGroup[gid]) compsByGroup[gid] = [];
        compsByGroup[gid].push({
          id: comp.id,
          product_id: comp.product_id,
          service_id: comp.service_id,
          quantity: comp.quantity,
          pricing_mode: comp.pricing_mode,
          custom_price: comp.custom_price,
          product_name: comp.products?.name || null,
          product_sku: comp.products?.sku || null,
          service_name: comp.services?.name || null,
          retail_price: comp.product_id
            ? (Number(prodPriceMap.get(comp.product_id)) || 0)
            : (Number(svcPriceMap.get(comp.service_id)) || 0),
          has_attributes: comp.product_id ? productsWithAttrs.has(comp.product_id) : false,
        });
      }

      setComponents(compsByGroup);

      // Initialize selections from config or defaults
      if (currentConfig?.choice_selections) {
        setSelections(currentConfig.choice_selections);
        setComponentAttrs(currentConfig.component_attributes || {});
      } else {
        // Default: select first items up to min_selections
        const defaultSelections: Record<string, string[]> = {};
        loadedGroups.forEach(g => {
          const gComps = compsByGroup[g.id] || [];
          defaultSelections[g.id] = gComps.slice(0, g.min_selections).map(c => c.id);
        });
        setSelections(defaultSelections);
        setComponentAttrs({});
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectionChange = (groupId: string, componentId: string, selected: boolean) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const current = selections[groupId] || [];
    const groupComps = components[groupId] || [];
    const effectiveMaxSelections = Math.max(group.max_selections || 1, groupComps.length || 1);

    if (effectiveMaxSelections === 1) {
      // Radio-style: replace
      setSelections(prev => ({ ...prev, [groupId]: selected ? [componentId] : [] }));
      return;
    }

    // Multi-select
    if (selected) {
      if (current.length >= effectiveMaxSelections) {
        const next = [...current.slice(1), componentId];
        setSelections(prev => ({ ...prev, [groupId]: next }));
      } else {
        setSelections(prev => ({ ...prev, [groupId]: [...current, componentId] }));
      }
    } else {
      setSelections(prev => ({ ...prev, [groupId]: current.filter(id => id !== componentId) }));
    }
  };

  const openAttrDialog = (comp: ChoiceComponent) => {
    if (!comp.product_id) return;
    setEditingAttrComp({
      componentId: comp.id,
      productId: comp.product_id,
      productName: comp.product_name || "Produto",
      currentAttrs: componentAttrs[comp.id]?.attrs || {},
    });
    setAttrDialogOpen(true);
  };

  const handleAttrSave = (attrs: Record<string, any>, priceAddon: number) => {
    if (!editingAttrComp) return;
    setComponentAttrs(prev => ({
      ...prev,
      [editingAttrComp.componentId]: { attrs, price_addon: priceAddon },
    }));
    setAttrDialogOpen(false);
    setEditingAttrComp(null);
  };

  const handleSave = () => {
    // Validate required groups
    for (const group of groups) {
      if (group.is_required) {
        const sel = selections[group.id] || [];
        if (sel.length < group.min_selections) {
          toast({
            title: "Seleção incompleta",
            description: `O grupo "${group.name}" requer pelo menos ${group.min_selections} seleção(ões).`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    onSave({
      choice_selections: selections,
      component_attributes: componentAttrs,
    });
    onOpenChange(false);
  };

  const getCompName = (comp: ChoiceComponent) => comp.product_name || comp.service_name || "Item";
  const getCompPrice = (comp: ChoiceComponent) => {
    const base = comp.retail_price;
    const addon = componentAttrs[comp.id]?.price_addon || 0;
    return base + addon;
  };

  const countAttrs = (compId: string) => {
    const a = componentAttrs[compId]?.attrs;
    if (!a) return 0;
    return Object.values(a).filter((v: any) => v?.value !== undefined && v.value !== "" && v.value !== null).length;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Configurar Escolhas — {bundleName}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">A carregar...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Este bundle não tem grupos de escolha.
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map(group => {
                  const groupComps = components[group.id] || [];
                  const selected = selections[group.id] || [];
                  const effectiveMaxSelections = Math.max(group.max_selections || 1, groupComps.length || 1);
                  const isSingle = effectiveMaxSelections === 1;

                  return (
                    <Collapsible
                      key={group.id}
                      open={expandedGroups.has(group.id)}
                      onOpenChange={() => {
                        setExpandedGroups(prev => {
                          const n = new Set(prev);
                          n.has(group.id) ? n.delete(group.id) : n.add(group.id);
                          return n;
                        });
                      }}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedGroups.has(group.id) ? "" : "-rotate-90"}`} />
                          <span className="font-medium">{group.name}</span>
                          {group.is_required && <Badge variant="secondary" className="text-xs">Obrigatório</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {selected.length}/{effectiveMaxSelections}
                          </Badge>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-2 space-y-1.5 pl-2">
                        {group.description && (
                          <p className="text-xs text-muted-foreground mb-2 pl-2">{group.description}</p>
                        )}
                        {groupComps.map(comp => {
                          const isSelected = selected.includes(comp.id);
                          const price = getCompPrice(comp);
                          const attrCount = countAttrs(comp.id);

                          return (
                            <div
                              key={comp.id}
                              className={`flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer ${
                                isSelected ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50 border-transparent"
                              }`}
                              onClick={() => handleSelectionChange(group.id, comp.id, !isSelected)}
                            >
                              {isSingle ? (
                                <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-primary' : 'border-muted-foreground/40'}`}>
                                  {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                                </div>
                              ) : (
                                <Checkbox checked={isSelected} className="pointer-events-none" />
                              )}
                              
                              {comp.product_id ? (
                                <Package className="h-4 w-4 text-blue-500 shrink-0" />
                              ) : (
                                <Wrench className="h-4 w-4 text-green-500 shrink-0" />
                              )}

                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{getCompName(comp)}</p>
                                {comp.product_sku && (
                                  <p className="text-xs text-muted-foreground">{comp.product_sku}</p>
                                )}
                                {attrCount > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Tag className="h-3 w-3 text-primary" />
                                    <span className="text-xs text-primary">{attrCount} atributo(s)</span>
                                  </div>
                                )}
                              </div>

                              <span className="text-sm font-semibold whitespace-nowrap">
                                {formatCurrency(price)}
                              </span>

                              {comp.has_attributes && isSelected && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 relative"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAttrDialog(comp);
                                  }}
                                >
                                  <Tag className="h-3.5 w-3.5" />
                                  {attrCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-4 w-4 text-[10px] bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                                      {attrCount}
                                    </span>
                                  )}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              Guardar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingAttrComp && (
        <LineAttributesDialog
          open={attrDialogOpen}
          onOpenChange={setAttrDialogOpen}
          productId={editingAttrComp.productId}
          productName={editingAttrComp.productName}
          currentAttributes={editingAttrComp.currentAttrs}
          onSave={handleAttrSave}
        />
      )}
    </>
  );
}
