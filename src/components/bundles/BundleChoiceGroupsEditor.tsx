import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { useBundleCatalogItems } from "@/hooks/useBundleCatalogItems";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Package, Wrench, Search, ChevronDown, ListPlus, Settings, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ChoiceGroup {
  id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  sort_order: number;
  components?: ChoiceComponent[];
}

interface ChoiceComponent {
  id: string;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  pricing_mode: string;
  custom_price: number | null;
  custom_discount_percent: number | null;
  custom_discount_fixed: number | null;
  product?: { id: string; name: string; sku: string; };
  service?: { id: string; name: string; };
  retail_price?: number;
}

interface BundleChoiceGroupsEditorProps {
  bundleId: string;
}

export default function BundleChoiceGroupsEditor({ bundleId }: BundleChoiceGroupsEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  const [groups, setGroups] = useState<ChoiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // New group dialog
  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({
    name: "",
    description: "",
    min_selections: 1,
    max_selections: 1,
    is_required: true,
  });
  
  // Add items dialog
  const [addItemsGroupId, setAddItemsGroupId] = useState<string | null>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Debounced search → server-side via hook
  const debouncedSearch = useDebounce(localSearchTerm, 300);

  // Shared catalog hook (paginated + scope-aware)
  const catalog = useBundleCatalogItems(activeCompany?.id);

  // Refs for infinite scroll
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGroups();
  }, [bundleId]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      
      const { data: groupsData, error: groupsError } = await supabase
        .from("bundle_choice_groups")
        .select("*")
        .eq("bundle_id", bundleId)
        .order("sort_order");
      
      if (groupsError) throw groupsError;

      // Load components for each group
      const groupsWithComponents = await Promise.all((groupsData || []).map(async (group) => {
        const { data: componentsData } = await supabase
          .from("bundle_components")
          .select(`
            *,
            product:products(id, name, sku),
            service:services(id, name)
          `)
          .eq("choice_group_id", group.id)
          .order("sort_order");

        // Load prices for components
        const componentsWithPrices = await Promise.all((componentsData || []).map(async (comp) => {
          let retailPrice = 0;
          
          if (comp.product_id) {
            const { data: priceData } = await supabase
              .from("product_prices")
              .select("price")
              .eq("product_id", comp.product_id)
              .eq("price_type", "retail")
              .order("created_at", { ascending: false })
              .limit(1)
              .single();
            retailPrice = priceData?.price || 0;
          } else if (comp.service_id) {
            const { data: priceData } = await supabase
              .from("service_prices")
              .select("price")
              .eq("service_id", comp.service_id)
              .eq("price_type", "retail")
              .order("created_at", { ascending: false })
              .limit(1)
              .single();
            retailPrice = priceData?.price || 0;
          }

          return { ...comp, retail_price: retailPrice };
        }));

        return { ...group, components: componentsWithPrices };
      }));

      setGroups(groupsWithComponents);
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

  const handleCreateGroup = async () => {
    if (!newGroupForm.name.trim()) {
      toast({
        title: t('common.error'),
        description: t('bundles.choices.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("bundle_choice_groups")
        .insert({
          bundle_id: bundleId,
          name: newGroupForm.name.trim(),
          description: newGroupForm.description.trim() || null,
          min_selections: newGroupForm.min_selections,
          max_selections: newGroupForm.max_selections,
          is_required: newGroupForm.is_required,
          sort_order: groups.length,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: t('bundles.choices.created'),
      });

      setShowNewGroupDialog(false);
      setNewGroupForm({
        name: "",
        description: "",
        min_selections: 1,
        max_selections: 1,
        is_required: true,
      });
      
      loadGroups();
      setExpandedGroups(prev => new Set([...prev, data.id]));
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      // First remove components from this group
      await supabase
        .from("bundle_components")
        .delete()
        .eq("choice_group_id", groupId);
      
      const { error } = await supabase
        .from("bundle_choice_groups")
        .delete()
        .eq("id", groupId);

      if (error) throw error;

      toast({
        title: t('bundles.choices.deleted'),
      });

      loadGroups();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Sync debounced search to catalog hook
  useEffect(() => {
    catalog.changeSearch(debouncedSearch);
  }, [debouncedSearch, catalog.changeSearch]);

  // Reset selection + refresh catalog when opening dialog
  useEffect(() => {
    if (addItemsGroupId) {
      setSelectedItems(new Set());
      setLocalSearchTerm("");
      catalog.refresh();
    }
  }, [addItemsGroupId]);

  // Infinite scroll observer
  useEffect(() => {
    if (!addItemsGroupId) return;

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
  }, [addItemsGroupId, catalog.hasMore, catalog.loading, catalog.loadMore]);

  const handleAddItems = async () => {
    if (!addItemsGroupId || selectedItems.size === 0) return;

    try {
      const group = groups.find(g => g.id === addItemsGroupId);
      const existingCount = group?.components?.length || 0;

      const newComponents = Array.from(selectedItems).map((itemId, index) => ({
        bundle_id: bundleId,
        choice_group_id: addItemsGroupId,
        product_id: catalog.itemType === 'product' ? itemId : null,
        service_id: catalog.itemType === 'service' ? itemId : null,
        quantity: 1,
        pricing_mode: 'original' as const,
        is_optional: false,
        sort_order: existingCount + index,
      }));

      const { error } = await supabase
        .from("bundle_components")
        .insert(newComponents);

      if (error) throw error;

      toast({
        title: t('bundles.choices.optionsAdded'),
      });

      setAddItemsGroupId(null);
      loadGroups();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteComponent = async (compId: string) => {
    try {
      const { error } = await supabase
        .from("bundle_components")
        .delete()
        .eq("id", compId);

      if (error) throw error;

      loadGroups();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Filter out items already in the group (server-side search handled by hook)
  const existingIds = new Set(
    groups.find(g => g.id === addItemsGroupId)?.components?.map(c => c.product_id || c.service_id) || []
  );
  const availableItems = catalog.items.filter(item => !existingIds.has(item.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-medium">{t('bundles.choices.title')}</h4>
          <p className="text-sm text-muted-foreground">{t('bundles.choices.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowNewGroupDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('bundles.choices.addGroup')}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <ListPlus className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-2">{t('bundles.choices.empty')}</p>
            <p className="text-xs text-muted-foreground mb-4">{t('bundles.choices.emptyHint')}</p>
            <Button variant="outline" size="sm" onClick={() => setShowNewGroupDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('bundles.choices.createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <Collapsible
                open={expandedGroups.has(group.id)}
                onOpenChange={() => toggleGroup(group.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ChevronDown className={`h-4 w-4 transition-transform ${
                          expandedGroups.has(group.id) ? '' : '-rotate-90'
                        }`} />
                        <div>
                          <CardTitle className="text-base">{group.name}</CardTitle>
                          {group.description && (
                            <p className="text-xs text-muted-foreground">{group.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {t('bundles.choices.selectRange', { min: group.min_selections, max: group.max_selections })}
                        </Badge>
                        {group.is_required && (
                          <Badge variant="secondary">{t('bundles.choices.required')}</Badge>
                        )}
                        <Badge variant="outline">{group.components?.length || 0} {t('bundles.choices.options')}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {(group.components?.length || 0) === 0 ? (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        {t('bundles.choices.noOptions')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {group.components?.map((comp) => (
                          <div key={comp.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                            {comp.product_id ? (
                              <Package className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Wrench className="h-4 w-4 text-green-500" />
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {comp.product?.name || comp.service?.name}
                              </p>
                              {comp.product?.sku && (
                                <p className="text-xs text-muted-foreground">{comp.product.sku}</p>
                              )}
                            </div>
                            <p className="text-sm font-semibold">{formatCurrency(comp.retail_price || 0)}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDeleteComponent(comp.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-between pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddItemsGroupId(group.id)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('bundles.choices.addOption')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDeleteGroup(group.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('bundles.choices.deleteGroup')}
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* New Group Dialog */}
      <Dialog open={showNewGroupDialog} onOpenChange={setShowNewGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bundles.choices.newGroup')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('bundles.choices.groupName')} *</Label>
              <Input
                value={newGroupForm.name}
                onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                placeholder={t('bundles.choices.groupNamePlaceholder')}
              />
            </div>
            
            <div className="space-y-2">
              <Label>{t('bundles.choices.groupDescription')}</Label>
              <Input
                value={newGroupForm.description}
                onChange={(e) => setNewGroupForm({ ...newGroupForm, description: e.target.value })}
                placeholder={t('bundles.choices.groupDescriptionPlaceholder')}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('bundles.choices.minSelections')}</Label>
                <Input
                  type="number"
                  min="0"
                  value={newGroupForm.min_selections}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, min_selections: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('bundles.choices.maxSelections')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={newGroupForm.max_selections}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, max_selections: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                checked={newGroupForm.is_required}
                onCheckedChange={(checked) => setNewGroupForm({ ...newGroupForm, is_required: checked })}
              />
              <Label>{t('bundles.choices.isRequired')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewGroupDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateGroup}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Items to Group Dialog */}
      <Dialog open={!!addItemsGroupId} onOpenChange={() => setAddItemsGroupId(null)}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t('bundles.choices.addOptions')}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-4 shrink-0">
              <Select value={catalog.itemType} onValueChange={(v: 'product' | 'service') => catalog.changeType(v)}>
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

            <div className="flex-1 min-h-0 overflow-y-auto border rounded-md pr-1">
              <div className="p-2 space-y-1">
                {availableItems.length === 0 && !catalog.loading ? (
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
                          <Package className="h-4 w-4 text-primary" />
                        ) : (
                          <Wrench className="h-4 w-4 text-primary" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{item.name}</p>
                          {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                        </div>
                        <p className="font-semibold shrink-0">{formatCurrency(item.retail_price)}</p>
                      </div>
                    ))}
                    {/* Infinite scroll sentinel */}
                    {catalog.hasMore && (
                      <div ref={loadMoreTriggerRef} className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                        {catalog.loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {catalog.loading ? t('common.loading') : ''}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setAddItemsGroupId(null)}>
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
