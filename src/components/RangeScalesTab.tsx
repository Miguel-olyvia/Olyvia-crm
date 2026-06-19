import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RangeScalesTabProps {
  attributeId: string;
}

type ContextType = 'global' | 'category' | 'subcategory' | 'product';

interface PriceRange {
  id?: string;
  min_value: number;
  max_value: number | null;
  price_per_unit: number;
  range_type: 'linear' | 'dimension' | 'dimension3d';
  min_width?: number | null;
  max_width?: number | null;
  min_height?: number | null;
  max_height?: number | null;
  min_depth?: number | null;
  max_depth?: number | null;
}

interface EntityOption {
  id: string;
  name: string;
  parent_id: string | null;
  level?: number;
}

export default function RangeScalesTab({ attributeId }: RangeScalesTabProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();

  const [contextType, setContextType] = useState<ContextType>('global');
  const [contextEntityId, setContextEntityId] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntityOption[]>([]);

  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([]);
  const [rangeMode, setRangeMode] = useState<'linear' | 'dimension' | 'dimension3d'>('linear');
  const [loading, setLoading] = useState(false);

  // Inheritance state
  const [isInherited, setIsInherited] = useState(false);
  const [inheritedFromName, setInheritedFromName] = useState<string | null>(null);
  const [hasOwnScales, setHasOwnScales] = useState(false);

  // Load entities when context type changes
  useEffect(() => {
    if (contextType === 'global') {
      setEntities([]);
      setContextEntityId(null);
      return;
    }
    loadEntities();
  }, [contextType, activeCompany?.id]);

  const dbContextType = (type: ContextType): 'global' | 'category' | 'product' => {
    if (type === 'subcategory') return 'category';
    return type;
  };

  // Load ranges when context or rangeMode changes
  useEffect(() => {
    if (contextType === 'global' || contextEntityId) {
      loadRangesWithInheritance();
    } else {
      setPriceRanges([]);
      setIsInherited(false);
      setHasOwnScales(false);
    }
  }, [attributeId, contextType, contextEntityId, rangeMode]);

  const loadEntities = async () => {
    if (!activeCompany?.id) return;

    if (contextType === 'category') {
      const { data } = await supabase
        .from('product_categories')
        .select('id, name, parent_id')
        .is('parent_id', null)
        .order('name');

      setEntities((data || []).map(c => ({ id: c.id, name: c.name, parent_id: null })));
    } else if (contextType === 'subcategory') {
      const { data } = await supabase
        .from('product_categories')
        .select('id, name, parent_id')
        .not('parent_id', 'is', null)
        .order('name');

      setEntities((data || []).map(c => ({ id: c.id, name: c.name, parent_id: c.parent_id })));
    } else if (contextType === 'product') {
      // Paginate to bypass Supabase's default 1000-row limit and load all products
      const pageSize = 1000;
      let from = 0;
      const all: { id: string; name: string }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name')
          .eq('organization_id', activeCompany.id)
          .order('name')
          .range(from, from + pageSize - 1);
        if (error) break;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      setEntities(all.map(p => ({ id: p.id, name: p.name, parent_id: null })));
    }
  };

  const loadRangesWithInheritance = async () => {
    // 1. Try to load own scales for the current context
    const ownData = await loadRangesForContext(contextType, contextEntityId);

    if (ownData && ownData.length > 0) {
      applyRanges(ownData);
      setIsInherited(false);
      setHasOwnScales(contextType !== 'global');
      setInheritedFromName(null);
      return;
    }

    // 2. If no own scales, climb the hierarchy
    if (contextType === 'global') {
      setPriceRanges([]);
      setIsInherited(false);
      setHasOwnScales(false);
      return;
    }

    // For product: try subcategory → category → global
    if (contextType === 'product' && contextEntityId) {
      const { data: product } = await supabase
        .from('products')
        .select('category_id')
        .eq('id', contextEntityId)
        .single();

      if (product?.category_id) {
        // Try product's direct category (subcategory)
        const subData = await loadRangesForContext('subcategory', product.category_id);
        if (subData && subData.length > 0) {
          applyRanges(subData);
          setIsInherited(true);
          setHasOwnScales(false);
          setInheritedFromName('Subcategoria');
          return;
        }

        // Try parent category
        const { data: catInfo } = await supabase
          .from('product_categories')
          .select('parent_category_id, name')
          .eq('id', product.category_id)
          .single();

        const parentCatId = catInfo?.parent_category_id;
        if (parentCatId) {
          const parentData = await loadRangesForContext('category', parentCatId);
          if (parentData && parentData.length > 0) {
            applyRanges(parentData);
            setIsInherited(true);
            setHasOwnScales(false);
            setInheritedFromName('Categoria');
            return;
          }
        }
      }
    }

    // For subcategory: try parent category → global
    if (contextType === 'subcategory' && contextEntityId) {
      const entity = entities.find(e => e.id === contextEntityId);
      if (entity?.parent_id) {
        const parentData = await loadRangesForContext('category', entity.parent_id);
        if (parentData && parentData.length > 0) {
          applyRanges(parentData);
          setIsInherited(true);
          setHasOwnScales(false);
          const { data: parentCat } = await supabase
            .from('product_categories')
            .select('name')
            .eq('id', entity.parent_id)
            .single();
          setInheritedFromName(parentCat?.name || 'Categoria');
          return;
        }
      }
    }

    // For category: no parent (root categories only now), go to global
    if (contextType === 'category' && contextEntityId) {
      // fall through to global
    }

    // Fallback to global
    const globalData = await loadRangesForContext('global', null);
    if (globalData && globalData.length > 0) {
      applyRanges(globalData);
      setIsInherited(true);
      setHasOwnScales(false);
      setInheritedFromName('Global');
      return;
    }

    // Nothing found anywhere
    setPriceRanges([]);
    setIsInherited(false);
    setHasOwnScales(false);
    setInheritedFromName(null);
  };

  const loadRangesForContext = async (type: ContextType, entityId: string | null) => {
    let query = (supabase as any)
      .from('product_attribute_price_ranges')
      .select('id, min_value, max_value, price_per_unit, range_type, min_width, max_width, min_height, max_height, min_depth, max_depth')
      .eq('attribute_id', attributeId)
      .eq('range_type', rangeMode)
      .order('min_value');

    // Filter by organization
    if (activeCompany?.id) {
      query = query.eq('organization_id', activeCompany.id);
    }

    const effectiveType = dbContextType(type);

    if (effectiveType === 'global') {
      query = query.is('product_id', null).is('category_id', null);
    } else if (effectiveType === 'category') {
      query = query.eq('category_id', entityId).is('product_id', null);
    } else if (effectiveType === 'product') {
      query = query.eq('product_id', entityId);
    }

    const { data } = await query;
    return data;
  };

  const applyRanges = (data: any[]) => {
    const mapped = data.map((r: any) => ({
      ...r,
      range_type: (r.range_type === 'dimension3d' ? 'dimension3d' : r.range_type === 'dimension' ? 'dimension' : 'linear') as PriceRange['range_type'],
    }));
    setPriceRanges(mapped);
    if (data.length > 0) {
      setRangeMode(mapped[0].range_type);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Delete existing for this context
      let deleteQuery = (supabase as any)
        .from('product_attribute_price_ranges')
        .delete()
        .eq('attribute_id', attributeId)
        .eq('range_type', rangeMode);

      if (activeCompany?.id) {
        deleteQuery = deleteQuery.eq('organization_id', activeCompany.id);
      }

      if (contextType === 'global') {
        deleteQuery = deleteQuery.is('product_id', null).is('category_id', null);
      } else if (contextType === 'category' || contextType === 'subcategory') {
        deleteQuery = deleteQuery.eq('category_id', contextEntityId).is('product_id', null);
      } else if (contextType === 'product') {
        deleteQuery = deleteQuery.eq('product_id', contextEntityId);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      if (priceRanges.length > 0) {
        const is3D = rangeMode === 'dimension3d';
        const isDimension = rangeMode === 'dimension' || is3D;

        const rangesToInsert = priceRanges.map(pr => ({
          attribute_id: attributeId,
          min_value: isDimension ? 0 : pr.min_value,
          max_value: isDimension ? null : pr.max_value,
          price_per_unit: pr.price_per_unit,
          organization_id: activeCompany?.id,
          range_type: rangeMode,
          min_width: isDimension ? (pr.min_width ?? 0) : null,
          max_width: isDimension ? pr.max_width : null,
          min_height: isDimension ? (pr.min_height ?? 0) : null,
          max_height: isDimension ? pr.max_height : null,
          min_depth: is3D ? (pr.min_depth ?? 0) : null,
          max_depth: is3D ? pr.max_depth : null,
          product_id: contextType === 'product' ? contextEntityId : null,
          category_id: (contextType === 'category' || contextType === 'subcategory') ? contextEntityId : null,
        }));

        const { error: insertError } = await (supabase as any)
          .from('product_attribute_price_ranges')
          .insert(rangesToInsert);
        if (insertError) throw insertError;
      }

      toast({ title: "Escalões guardados com sucesso" });
      setIsInherited(false);
      setHasOwnScales(contextType !== 'global');
      setInheritedFromName(null);
    } catch (error: any) {
      toast({ title: "Erro ao guardar escalões", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRevertToInherited = async () => {
    setLoading(true);
    try {
      let deleteQuery = (supabase as any)
        .from('product_attribute_price_ranges')
        .delete()
        .eq('attribute_id', attributeId);

      if (contextType === 'category' || contextType === 'subcategory') {
        deleteQuery = deleteQuery.eq('category_id', contextEntityId).is('product_id', null);
      } else if (contextType === 'product') {
        deleteQuery = deleteQuery.eq('product_id', contextEntityId);
      }

      await deleteQuery;
      toast({ title: "Escalões próprios removidos — a herdar do nível superior" });
      loadRangesWithInheritance();
    } catch (error: any) {
      toast({ title: "Erro ao reverter", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addRange = () => {
    // If inherited, clicking add means user wants to create own scales
    if (isInherited) {
      setIsInherited(false);
      setHasOwnScales(true);
    }

    if (rangeMode === 'dimension3d') {
      setPriceRanges([...priceRanges, { min_value: 0, max_value: null, price_per_unit: 0, range_type: 'dimension3d', min_depth: 0, max_depth: null, min_width: 0, max_width: null, min_height: 0, max_height: null }]);
    } else if (rangeMode === 'dimension') {
      setPriceRanges([...priceRanges, { min_value: 0, max_value: null, price_per_unit: 0, range_type: 'dimension', min_width: 0, max_width: null, min_height: 0, max_height: null }]);
    } else {
      const lastRange = priceRanges[priceRanges.length - 1];
      const newMin = lastRange ? (lastRange.max_value || lastRange.min_value + 10) + 1 : 0;
      setPriceRanges([...priceRanges, { min_value: newMin, max_value: null, price_per_unit: 0, range_type: 'linear' }]);
    }
  };

  const updateRange = (index: number, field: string, value: any) => {
    if (isInherited) {
      // Clone inherited to own on first edit
      setIsInherited(false);
      setHasOwnScales(true);
    }
    setPriceRanges(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const handleContextChange = (newContext: ContextType) => {
    setContextType(newContext);
    setContextEntityId(null);
    setPriceRanges([]);
    setIsInherited(false);
    setHasOwnScales(false);
    setInheritedFromName(null);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Context Selector */}
      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aplicar escalões a:</Label>
        <div className="flex gap-1.5 flex-wrap">
          {(['global', 'category', 'subcategory', 'product'] as ContextType[]).map((ctx) => {
            const labels: Record<ContextType, string> = { global: 'Global', category: 'Categoria', subcategory: 'Subcategoria', product: 'Produto' };
            return (
              <Button key={ctx} variant={contextType === ctx ? 'default' : 'outline'} size="sm" className="h-7 text-xs px-3" onClick={() => handleContextChange(ctx)}>
                {labels[ctx]}
              </Button>
            );
          })}
        </div>

        {contextType !== 'global' && (() => {
          const placeholder = contextType === 'category' ? 'Selecionar categoria...' : contextType === 'subcategory' ? 'Selecionar subcategoria...' : 'Selecionar produto...';

          return (
            <NativeSelect
              value={contextEntityId || ""}
              onValueChange={(val) => setContextEntityId(val || null)}
              placeholder={placeholder}
              className="h-8 text-sm"
              options={entities.map((entity) => ({
                value: entity.id,
                label: `${entity.level ? '  '.repeat(entity.level) + '└ ' : ''}${entity.name}`,
              }))}
            />
          );
        })()}

        {/* Inheritance badge */}
        {isInherited && inheritedFromName && (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 text-xs">
            A herdar de: {inheritedFromName}
          </Badge>
        )}
        {hasOwnScales && contextType !== 'global' && (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-300 text-xs">
            Escalões próprios
          </Badge>
        )}
      </div>

      {/* Range Mode Toggle */}
      <div className="flex items-center gap-3 p-2.5 border rounded-lg bg-muted/30">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Modo:</Label>
        <div className="flex gap-1.5 flex-wrap">
          <Button variant={rangeMode === 'linear' ? 'default' : 'outline'} size="sm" className="h-7 text-xs px-3" onClick={() => setRangeMode('linear')}>
            Linear (0-100)
          </Button>
          <Button variant={rangeMode === 'dimension' ? 'default' : 'outline'} size="sm" className="h-7 text-xs px-3" onClick={() => setRangeMode('dimension')}>
            Medidas (CxL)
          </Button>
          <Button variant={rangeMode === 'dimension3d' ? 'default' : 'outline'} size="sm" className="h-7 text-xs px-3" onClick={() => setRangeMode('dimension3d')}>
            Medidas 3D (CxLxA)
          </Button>
        </div>
      </div>

      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Escalões de Preço</Label>
          <p className="text-xs text-muted-foreground">
            {rangeMode === 'dimension3d' ? 'Defina medidas CxLxA' : rangeMode === 'dimension' ? 'Defina medidas CxL' : 'Defina escalões por quantidade'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRange} disabled={contextType !== 'global' && !contextEntityId}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={loading || (contextType !== 'global' && !contextEntityId)}>
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar
          </Button>
        </div>
      </div>

      {/* Scrollable list with explicit max height */}
      <div className="overflow-y-auto rounded-lg border p-2" style={{ maxHeight: 'calc(100vh - 520px)', minHeight: '120px' }}>
        <div className={`space-y-1.5 ${isInherited ? 'opacity-60' : ''}`}>
          {priceRanges.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              {contextType !== 'global' && !contextEntityId
                ? `Selecione ${contextType === 'category' ? 'uma categoria' : contextType === 'subcategory' ? 'uma subcategoria' : 'um produto'} acima`
                : 'Adicione escalões clicando no botão acima'}
            </p>
          ) : rangeMode === 'linear' ? (
            /* Compact linear table-like header */
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 px-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">De</Label>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Até</Label>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Preço/Un.</Label>
                <span />
              </div>
              {priceRanges.map((range, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 items-center p-1.5 border rounded bg-background hover:bg-muted/20 transition-colors">
                  <Input type="number" step="0.01" min="0" value={range.min_value} onChange={(e) => updateRange(index, 'min_value', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                  <Input type="number" step="0.01" min="0" value={range.max_value ?? ''} onChange={(e) => updateRange(index, 'max_value', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="∞" className="h-7 text-sm" />
                  <div className="flex items-center gap-1">
                    <Input type="number" step="0.01" min="0" value={range.price_per_unit} onChange={(e) => updateRange(index, 'price_per_unit', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                    <span className="text-xs text-muted-foreground">€</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (isInherited) { setIsInherited(false); setHasOwnScales(true); } setPriceRanges(prev => prev.filter((_, i) => i !== index)); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            priceRanges.map((range, index) => (
              <div key={index} className="flex items-start gap-2 p-2.5 border rounded bg-background">
                <div className="flex-1 space-y-1.5">
                  {rangeMode === 'dimension3d' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Comp. Mín. (C)</Label>
                        <Input type="number" step="1" min="0" value={range.min_depth ?? 0} onChange={(e) => updateRange(index, 'min_depth', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Comp. Máx. (C)</Label>
                        <Input type="number" step="1" min="0" value={range.max_depth ?? ''} onChange={(e) => updateRange(index, 'max_depth', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="∞" className="h-7 text-sm" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Larg. Mín. (L)</Label>
                      <Input type="number" step="1" min="0" value={range.min_width ?? 0} onChange={(e) => updateRange(index, 'min_width', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Larg. Máx. (L)</Label>
                      <Input type="number" step="1" min="0" value={range.max_width ?? ''} onChange={(e) => updateRange(index, 'max_width', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="∞" className="h-7 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">{rangeMode === 'dimension3d' ? 'Alt. Mín. (A)' : 'Comp. Mín. (C)'}</Label>
                      <Input type="number" step="1" min="0" value={range.min_height ?? 0} onChange={(e) => updateRange(index, 'min_height', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">{rangeMode === 'dimension3d' ? 'Alt. Máx. (A)' : 'Comp. Máx. (C)'}</Label>
                      <Input type="number" step="1" min="0" value={range.max_height ?? ''} onChange={(e) => updateRange(index, 'max_height', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="∞" className="h-7 text-sm" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Preço/Unidade</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" step="0.01" min="0" value={range.price_per_unit} onChange={(e) => updateRange(index, 'price_per_unit', parseFloat(e.target.value) || 0)} className="h-7 text-sm" />
                      <span className="text-xs text-muted-foreground">€</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive mt-4" onClick={() => { if (isInherited) { setIsInherited(false); setHasOwnScales(true); } setPriceRanges(prev => prev.filter((_, i) => i !== index)); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Revert to inherited button */}
      {hasOwnScales && contextType !== 'global' && (
        <div className="flex justify-end pt-1 border-t">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Voltar a herdar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Voltar a herdar escalões?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isto irá apagar todos os escalões próprios deste nível e voltar a usar os escalões do nível superior. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRevertToInherited}>Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
