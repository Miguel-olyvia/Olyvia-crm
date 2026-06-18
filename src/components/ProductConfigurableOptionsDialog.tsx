import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getEffectiveProductRanges } from "@/lib/product-attribute-ranges";
import { Settings2, Loader2, RotateCcw, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  companyId: string;
  productCategoryId?: string | null;
  productBasePrice?: number;
}

interface AttrDef {
  id: string;
  code: string;
  label: string;
  pricing_type: string;
  value_type: string;
  allowed_values: string[] | null;
  is_variant_option: boolean;
  has_hex_color: boolean;
  is_measurement: boolean;
  valorization_type: string | null;
  pricing_dimension: string | null;
  isAssigned: boolean;
  assignedValueId?: string;
}

interface ValueRow {
  value: string;
  display_name: string;
  hex_color: string | null;
  is_available: boolean;
  price: number;
  sort_order: number;
  source: string;
  existingId: string | null;
  dirty: boolean;
}

interface RangeTier {
  id: string | null;
  min_value: number;
  max_value: number;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  min_depth: number | null;
  max_depth: number | null;
  price_per_unit: number;
  range_type: string;
  source: "product" | "category" | "global";
  dirty: boolean;
}

const RANGE_SELECT_COLS = "id, min_value, max_value, min_width, max_width, min_height, max_height, min_depth, max_depth, price_per_unit, range_type";

const mapRangeRow = (r: any, source: "product" | "category" | "global"): RangeTier => ({
  id: r.id,
  min_value: Number(r.min_value) || 0,
  max_value: r.max_value !== null && r.max_value !== undefined ? Number(r.max_value) : 0,
  min_width: r.min_width !== null && r.min_width !== undefined ? Number(r.min_width) : null,
  max_width: r.max_width !== null && r.max_width !== undefined ? Number(r.max_width) : null,
  min_height: r.min_height !== null && r.min_height !== undefined ? Number(r.min_height) : null,
  max_height: r.max_height !== null && r.max_height !== undefined ? Number(r.max_height) : null,
  min_depth: r.min_depth !== null && r.min_depth !== undefined ? Number(r.min_depth) : null,
  max_depth: r.max_depth !== null && r.max_depth !== undefined ? Number(r.max_depth) : null,
  price_per_unit: Number(r.price_per_unit) || 0,
  range_type: r.range_type || "linear",
  source,
  dirty: false,
});

export default function ProductConfigurableOptionsDialog({
  open, onOpenChange, productId, productName, companyId, productCategoryId, productBasePrice
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allAttributes, setAllAttributes] = useState<AttrDef[]>([]);
  const [assignedAttrIds, setAssignedAttrIds] = useState<Set<string>>(new Set());
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null);
  const [valueRows, setValueRows] = useState<Record<string, ValueRow[]>>({});
  const [attrSources, setAttrSources] = useState<Record<string, string>>({});
  const [newAttrId, setNewAttrId] = useState("");
  const [rangeTiers, setRangeTiers] = useState<Record<string, RangeTier[]>>({});
  const [activeTab, setActiveTab] = useState("options");

  const assignedAttributes = allAttributes.filter(a => assignedAttrIds.has(a.id));
  const pricingAttributes = assignedAttributes.filter(a => ["fixed", "both"].includes(a.pricing_type || ""));
  const rangeAttributes = assignedAttributes.filter(a => a.pricing_type === "range");
  const configurableAttributes = assignedAttributes.filter(a => ["fixed", "both", "range"].includes(a.pricing_type || ""));
  const unassignedAttributes = allAttributes.filter(a => !assignedAttrIds.has(a.id));

  const activeCounts: Record<string, { active: number; total: number }> = {};
  Object.entries(valueRows).forEach(([attrId, rows]) => {
    activeCounts[attrId] = {
      active: rows.filter(r => r.is_available).length,
      total: rows.length
    };
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load ALL available attributes
      const { data: allAttrsData } = await supabase
        .from("product_attributes")
        .select("id, code, label, pricing_type, value_type, allowed_values, is_variant_option, has_hex_color, is_measurement, valorization_type, pricing_dimension")
        .order("label");

      // 2. Load assigned attributes for this product
      const { data: assignedData } = await supabase
        .from("product_attribute_values")
        .select("id, attribute_id")
        .eq("product_id", productId);

      const assignedMap = new Map<string, string>();
      (assignedData || []).forEach((a: any) => {
        assignedMap.set(a.attribute_id, a.id);
      });

      const assignedIds = new Set(assignedMap.keys());
      setAssignedAttrIds(assignedIds);

      const attrs: AttrDef[] = (allAttrsData || []).map((a: any) => ({
        ...a,
        isAssigned: assignedIds.has(a.id),
        assignedValueId: assignedMap.get(a.id),
      }));
      setAllAttributes(attrs);

      // 3. Load option rows for fixed/both pricing attributes AND list-type attributes (e.g. Cor with palettes)
      const fixedAttrs = attrs.filter(a => assignedIds.has(a.id) && (
        ["fixed", "both"].includes(a.pricing_type || "") || a.value_type === "list"
      ));

      const rows: Record<string, ValueRow[]> = {};
      const sources: Record<string, string> = {};

      if (fixedAttrs.length > 0) {
        const attrIds = fixedAttrs.map(a => a.id);
        const { data: existingProductPrices } = await supabase
          .from("product_attribute_value_prices")
          .select("id, attribute_id, value_option")
          .eq("product_id", productId)
          .in("attribute_id", attrIds);

        const existingMap = new Map<string, string>();
        (existingProductPrices || []).forEach((ep: any) => {
          existingMap.set(`${ep.attribute_id}:${ep.value_option}`, ep.id);
        });

        for (const attr of fixedAttrs) {
          const { data: resolved } = await supabase.rpc("resolve_product_attribute_options", {
            p_product_id: productId,
            p_attribute_id: attr.id,
          });

          if (resolved && resolved.length > 0) {
            sources[attr.id] = resolved[0]?.source || "global";
            rows[attr.id] = resolved.map((opt: any, idx: number) => ({
              value: opt.value_text,
              display_name: opt.display_name || opt.value_text,
              hex_color: opt.hex_color || null,
              is_available: opt.is_available ?? true,
              price: Number(opt.price_addon) || 0,
              sort_order: idx,
              source: opt.source || "global",
              existingId: existingMap.get(`${attr.id}:${opt.value_text}`) || null,
              dirty: false,
            }));
          } else {
            sources[attr.id] = "global";
            rows[attr.id] = (attr.allowed_values || []).map((v: string, idx: number) => ({
              value: v, display_name: v, hex_color: null, is_available: true,
              price: 0, sort_order: idx, source: "global",
              existingId: existingMap.get(`${attr.id}:${v}`) || null, dirty: false,
            }));
          }
        }
      }

      setValueRows(rows);
      setAttrSources(sources);

      // 4. Load range tiers via unified helper (Product → Subcategory → Category → Ancestor → Global).
      // This is the SAME hierarchy used by LineAttributesDialog and quote builders, so the
      // tiers shown here always match what is shown when configuring this product in a quote.
      const rangeAttrs = attrs.filter(a => assignedIds.has(a.id) && a.pricing_type === "range");
      const tiers: Record<string, RangeTier[]> = {};

      if (rangeAttrs.length > 0) {
        const rangeIds = rangeAttrs.map(a => a.id);
        const rangesByAttr = await getEffectiveProductRanges({
          productId,
          attributeIds: rangeIds,
          // No price_context here — the editor shows the canonical hierarchy without context bias.
          priceContext: null,
        });

        for (const attr of rangeAttrs) {
          const rows = rangesByAttr.get(attr.id) || [];
          const effectiveSource: "product" | "category" | "global" = (() => {
            const first = rows[0];
            if (!first) return "global";
            if (first.source === "product") return "product";
            if (first.source === "global") return "global";
            return "category"; // subcategory / category / ancestor_category collapse to "category" for the badge
          })();
          sources[attr.id] = effectiveSource;
          tiers[attr.id] = rows.map((r: any) => mapRangeRow(r, effectiveSource));
        }
      }

      setRangeTiers(tiers);

      // Auto-select first configurable attr
      const allConfigurable = attrs.filter(a => assignedIds.has(a.id) && ["fixed", "both", "range"].includes(a.pricing_type || ""));
      if (!selectedAttrId || !allConfigurable.find(a => a.id === selectedAttrId)) {
        setSelectedAttrId(allConfigurable[0]?.id || null);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [productId, toast, selectedAttrId]);

  useEffect(() => {
    if (open && productId) loadData();
  }, [open, productId]);

  const handleAddAttribute = async () => {
    if (!newAttrId) return;
    try {
      const { error } = await supabase
        .from("product_attribute_values")
        .insert({ product_id: productId, attribute_id: newAttrId });
      if (error) throw error;
      setNewAttrId("");
      toast({ title: "Atributo adicionado" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveAttribute = async (attrId: string) => {
    const attr = allAttributes.find(a => a.id === attrId);
    if (!attr?.assignedValueId) return;
    try {
      const { error } = await supabase
        .from("product_attribute_values")
        .delete()
        .eq("id", attr.assignedValueId);
      if (error) throw error;
      await supabase
        .from("product_attribute_value_prices")
        .delete()
        .eq("product_id", productId)
        .eq("attribute_id", attrId);

      if (selectedAttrId === attrId) setSelectedAttrId(null);
      toast({ title: "Atributo removido" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const updateRow = (attrId: string, index: number, updates: Partial<ValueRow>) => {
    setValueRows(prev => {
      const r = [...(prev[attrId] || [])];
      r[index] = { ...r[index], ...updates, dirty: true };
      return { ...prev, [attrId]: r };
    });
  };

  const updateRangeTier = (attrId: string, index: number, updates: Partial<RangeTier>) => {
    setRangeTiers(prev => {
      const t = [...(prev[attrId] || [])];
      t[index] = { ...t[index], ...updates, dirty: true };
      return { ...prev, [attrId]: t };
    });
  };

  const addRangeTier = (attrId: string) => {
    const attr = allAttributes.find(a => a.id === attrId);
    const existingTiers = rangeTiers[attrId] || [];
    // Inherit range_type from existing tiers, otherwise infer from attribute pricing_dimension
    const inferredType = existingTiers[0]?.range_type
      || (attr?.pricing_dimension === "size_3d" || attr?.pricing_dimension === "volume" ? "dimension3d"
        : attr?.pricing_dimension === "size" || attr?.pricing_dimension === "area" ? "dimension"
        : "linear");

    setRangeTiers(prev => {
      const existing = prev[attrId] || [];
      const lastMax = existing.length > 0 ? existing[existing.length - 1].max_value : 0;
      const newTier: RangeTier = {
        id: null,
        min_value: inferredType === "linear" ? lastMax + 1 : 0,
        max_value: inferredType === "linear" ? lastMax + 50 : 0,
        min_width: inferredType !== "linear" ? 0 : null,
        max_width: inferredType !== "linear" ? 0 : null,
        min_height: inferredType !== "linear" ? 0 : null,
        max_height: inferredType !== "linear" ? 0 : null,
        min_depth: inferredType === "dimension3d" ? 0 : null,
        max_depth: inferredType === "dimension3d" ? 0 : null,
        price_per_unit: 0,
        range_type: inferredType,
        source: "product",
        dirty: true,
      };
      return {
        ...prev,
        [attrId]: [...existing, newTier],
      };
    });
  };

  const removeRangeTier = (attrId: string, index: number) => {
    setRangeTiers(prev => {
      const t = [...(prev[attrId] || [])];
      t.splice(index, 1);
      return { ...prev, [attrId]: t };
    });
  };

  const handleResetInheritance = async (attrId: string) => {
    try {
      const attr = allAttributes.find(a => a.id === attrId);
      if (attr?.pricing_type === "range") {
        await (supabase as any)
          .from("product_attribute_price_ranges")
          .delete()
          .eq("product_id", productId)
          .eq("attribute_id", attrId);
      } else {
        const { error } = await supabase
          .from("product_attribute_value_prices")
          .delete()
          .eq("product_id", productId)
          .eq("attribute_id", attrId);
        if (error) throw error;
      }
      toast({ title: "Herança reposta" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save fixed/both option prices
      const upserts: any[] = [];
      const updates: any[] = [];

      Object.entries(valueRows).forEach(([attrId, rows]) => {
        rows.forEach(row => {
          if (!row.dirty) return;
          if (row.existingId) {
            updates.push({ id: row.existingId, is_available: row.is_available, price: row.price, sort_order: row.sort_order, updated_at: new Date().toISOString() });
          } else {
            upserts.push({ product_id: productId, attribute_id: attrId, value_option: row.value, price: row.price, is_available: row.is_available, sort_order: row.sort_order, organization_id: companyId || null });
          }
        });
      });

      for (const u of updates) {
        const { error } = await supabase.from("product_attribute_value_prices").update({ is_available: u.is_available, price: u.price, sort_order: u.sort_order, updated_at: u.updated_at }).eq("id", u.id);
        if (error) throw error;
      }

      if (upserts.length > 0) {
        const { error } = await supabase.from("product_attribute_value_prices").insert(upserts);
        if (error) throw error;
      }

      // Save range tiers
      for (const [attrId, tiers] of Object.entries(rangeTiers)) {
        const hasDirtyTiers = tiers.some(t => t.dirty);
        if (!hasDirtyTiers) continue;

        // Delete existing product-level ranges and re-insert
        await (supabase as any)
          .from("product_attribute_price_ranges")
          .delete()
          .eq("product_id", productId)
          .eq("attribute_id", attrId);

        if (tiers.length > 0) {
          const rangeInserts = tiers.map(t => {
            const rangeType = t.range_type || "linear";
            const base: any = {
              attribute_id: attrId,
              product_id: productId,
              organization_id: companyId || null,
              price_per_unit: t.price_per_unit,
              range_type: rangeType,
            };
            if (rangeType === "linear") {
              base.min_value = t.min_value;
              base.max_value = t.max_value;
            } else if (rangeType === "dimension") {
              base.min_value = 0;
              base.min_width = t.min_width ?? 0;
              base.max_width = t.max_width ?? 0;
              base.min_height = t.min_height ?? 0;
              base.max_height = t.max_height ?? 0;
            } else if (rangeType === "dimension3d") {
              base.min_value = 0;
              base.min_width = t.min_width ?? 0;
              base.max_width = t.max_width ?? 0;
              base.min_height = t.min_height ?? 0;
              base.max_height = t.max_height ?? 0;
              base.min_depth = t.min_depth ?? 0;
              base.max_depth = t.max_depth ?? 0;
            }
            return base;
          });
          const { error } = await (supabase as any)
            .from("product_attribute_price_ranges")
            .insert(rangeInserts);
          if (error) throw error;
        }
      }

      toast({ title: "Guardado" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "product": return <Badge variant="default" className="text-[9px] px-1.5">prod</Badge>;
      case "category":
      case "category_palette": return <Badge variant="secondary" className="text-[9px] px-1.5">cat↑</Badge>;
      case "global": return <Badge variant="outline" className="text-[9px] px-1.5">global</Badge>;
      default: return null;
    }
  };

  const hasDirtyFixed = Object.values(valueRows).some(rows => rows.some(r => r.dirty));
  const hasDirtyRange = Object.values(rangeTiers).some(tiers => tiers.some(t => t.dirty));
  const hasDirty = hasDirtyFixed || hasDirtyRange;
  const currentRows = selectedAttrId ? (valueRows[selectedAttrId] || []) : [];
  const currentRangeTiers = selectedAttrId ? (rangeTiers[selectedAttrId] || []) : [];
  const currentSource = selectedAttrId ? attrSources[selectedAttrId] : null;
  const selectedAttr = selectedAttrId ? allAttributes.find(a => a.id === selectedAttrId) : null;
  const selectedIsFixed = selectedAttr ? (["fixed", "both"].includes(selectedAttr.pricing_type || "") || (selectedAttr.value_type === "list" && (valueRows[selectedAttr.id]?.length || 0) > 0)) : false;
  const selectedIsRange = selectedAttr?.pricing_type === "range";
  const selectedIsConfigurable = selectedIsFixed || selectedIsRange;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-orange-500" />
            Gestão de Opções: {productName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="options" className="flex-1 overflow-hidden" onValueChange={(v) => setActiveTab(v)} value={activeTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="options" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Opções & Preços
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Options & Prices */}
          <TabsContent value="options" className="mt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex gap-4 h-[55vh]">
                  {/* Left panel - Attributes */}
                  <div className="w-56 shrink-0 border-r pr-4 flex flex-col">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">Atributos do Produto</p>

                    <div className="flex gap-1 mb-3">
                      <Select value={newAttrId} onValueChange={setNewAttrId}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="Adicionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unassignedAttributes.map(attr => (
                            <SelectItem key={attr.id} value={attr.id}>
                              <span className="text-xs">{attr.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleAddAttribute} disabled={!newAttrId}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="space-y-1">
                        {assignedAttributes.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            Nenhum atributo atribuído
                          </p>
                        ) : (
                          assignedAttributes.map(attr => {
                            const isConfigurable = ["fixed", "both", "range"].includes(attr.pricing_type || "") || (attr.value_type === "list" && (valueRows[attr.id]?.length || 0) > 0);
                            const counts = activeCounts[attr.id];
                            const tierCount = (rangeTiers[attr.id] || []).length;
                            const source = attrSources[attr.id];
                            return (
                              <div key={attr.id} className="group flex items-center gap-1">
                                <button
                                  onClick={() => setSelectedAttrId(attr.id)}
                                  className={cn(
                                    "flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                                    selectedAttrId === attr.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="truncate text-xs">{attr.label}</span>
                                    {(["fixed", "both"].includes(attr.pricing_type || "") || (attr.value_type === "list" && counts)) && counts && (
                                      <Badge variant={selectedAttrId === attr.id ? "secondary" : "outline"} className="text-[9px] ml-1 shrink-0">
                                        {counts.active}/{counts.total}
                                      </Badge>
                                    )}
                                    {attr.pricing_type === "range" && (
                                      <Badge variant={selectedAttrId === attr.id ? "secondary" : "outline"} className="text-[9px] ml-1 shrink-0">
                                        {tierCount} escalões
                                      </Badge>
                                    )}
                                    {!isConfigurable && (
                                      <Badge variant="outline" className="text-[8px] ml-1 shrink-0">{attr.value_type}</Badge>
                                    )}
                                  </div>
                                  {isConfigurable && source && source !== "product" && (
                                    <div className="mt-0.5">{getSourceBadge(source)}</div>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleRemoveAttribute(attr.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-destructive hover:text-destructive/80 transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Right panel - Options & Prices */}
                  <div className="flex-1 min-w-0">
                    {selectedAttrId && selectedIsFixed ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              Valores de {selectedAttr?.label}
                            </p>
                            {currentSource && getSourceBadge(currentSource)}
                          </div>
                          <div className="flex gap-2">
                            {currentSource === "product" && (
                              <Button variant="outline" size="sm" onClick={() => handleResetInheritance(selectedAttrId)} className="text-orange-600">
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Repor herança
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => {
                              setValueRows(prev => ({ ...prev, [selectedAttrId]: (prev[selectedAttrId] || []).map(r => ({ ...r, is_available: true, dirty: true })) }));
                            }}>Ativar todos</Button>
                            <Button variant="outline" size="sm" onClick={() => {
                              setValueRows(prev => ({ ...prev, [selectedAttrId]: (prev[selectedAttrId] || []).map(r => ({ ...r, is_available: false, dirty: true })) }));
                            }}>Desativar todos</Button>
                          </div>
                        </div>
                        <ScrollArea className="h-[calc(100%-40px)]">
                          <div className="space-y-2">
                            {currentRows.map((row, idx) => (
                              <div
                                key={row.value}
                                className={cn("flex items-center gap-3 p-2 rounded-md border", !row.is_available && "opacity-50 bg-muted/30")}
                              >
                                <Checkbox checked={row.is_available} onCheckedChange={(checked) => updateRow(selectedAttrId, idx, { is_available: !!checked })} />
                                {row.hex_color && (
                                  <div className="w-5 h-5 rounded-full border shrink-0" style={{ backgroundColor: row.hex_color }} />
                                )}
                                <span className="text-sm flex-1 truncate">{row.display_name}</span>
                                {row.source && getSourceBadge(row.source)}
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs text-muted-foreground">+€</span>
                                  <Input
                                    type="number" step="0.01" min="0" value={row.price}
                                    onChange={(e) => updateRow(selectedAttrId, idx, { price: parseFloat(e.target.value) || 0 })}
                                    className="w-24 h-8 text-sm" disabled={!row.is_available}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    ) : selectedAttrId && selectedIsRange ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              Escalões de preço — {selectedAttr?.label}
                            </p>
                            {currentSource && getSourceBadge(currentSource)}
                          </div>
                          <div className="flex gap-2">
                            {currentSource === "product" && (
                              <Button variant="outline" size="sm" onClick={() => handleResetInheritance(selectedAttrId)} className="text-orange-600">
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Repor herança
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => addRangeTier(selectedAttrId)}>
                              <Plus className="h-3 w-3 mr-1" />
                              Adicionar Escalão
                            </Button>
                          </div>
                        </div>
                        <ScrollArea className="h-[calc(100%-40px)]">
                          <div className="space-y-3">
                            {currentRangeTiers.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <p className="text-sm">Sem escalões definidos</p>
                                <p className="text-xs mt-1">Adicione escalões de preço por intervalo</p>
                              </div>
                            ) : (
                              currentRangeTiers.map((tier, idx) => {
                                const rt = tier.range_type || "linear";
                                return (
                                <div key={idx} className="flex items-center gap-3 p-3 rounded-md border bg-muted/20">
                                  <div className="flex-1 space-y-2">
                                    {rt === "linear" ? (
                                      <div className="grid grid-cols-3 gap-3">
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">De</label>
                                          <Input
                                            type="number" min="0" value={tier.min_value}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_value: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Até</label>
                                          <Input
                                            type="number" min="0" value={tier.max_value}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_value: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Preço/Unidade</label>
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number" min="0" step="0.01" value={tier.price_per_unit}
                                              onChange={(e) => updateRangeTier(selectedAttrId, idx, { price_per_unit: parseFloat(e.target.value) || 0 })}
                                              className="h-9 text-sm"
                                            />
                                            <span className="text-xs text-muted-foreground shrink-0">€</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : rt === "dimension" ? (
                                      <div className="grid grid-cols-5 gap-2">
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Comp. min</label>
                                          <Input type="number" min="0" value={tier.min_width ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_width: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Comp. max</label>
                                          <Input type="number" min="0" value={tier.max_width ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_width: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Larg. min</label>
                                          <Input type="number" min="0" value={tier.min_height ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_height: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Larg. max</label>
                                          <Input type="number" min="0" value={tier.max_height ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_height: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Preço/Un.</label>
                                          <div className="flex items-center gap-1">
                                            <Input type="number" min="0" step="0.01" value={tier.price_per_unit}
                                              onChange={(e) => updateRangeTier(selectedAttrId, idx, { price_per_unit: parseFloat(e.target.value) || 0 })}
                                              className="h-9 text-sm" />
                                            <span className="text-xs text-muted-foreground shrink-0">€</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-7 gap-2">
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">C. min</label>
                                          <Input type="number" min="0" value={tier.min_width ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_width: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">C. max</label>
                                          <Input type="number" min="0" value={tier.max_width ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_width: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">L. min</label>
                                          <Input type="number" min="0" value={tier.min_height ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_height: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">L. max</label>
                                          <Input type="number" min="0" value={tier.max_height ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_height: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">A. min</label>
                                          <Input type="number" min="0" value={tier.min_depth ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { min_depth: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">A. max</label>
                                          <Input type="number" min="0" value={tier.max_depth ?? 0}
                                            onChange={(e) => updateRangeTier(selectedAttrId, idx, { max_depth: parseFloat(e.target.value) || 0 })}
                                            className="h-9 text-sm" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground uppercase font-medium">Preço/Un.</label>
                                          <div className="flex items-center gap-1">
                                            <Input type="number" min="0" step="0.01" value={tier.price_per_unit}
                                              onChange={(e) => updateRangeTier(selectedAttrId, idx, { price_per_unit: parseFloat(e.target.value) || 0 })}
                                              className="h-9 text-sm" />
                                            <span className="text-xs text-muted-foreground shrink-0">€</span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {tier.source && (
                                    <div className="shrink-0">{getSourceBadge(tier.source)}</div>
                                  )}
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => removeRangeTier(selectedAttrId, idx)}
                                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                );
                              })
                            )}
                          </div>
                        </ScrollArea>
                      </>
                    ) : selectedAttrId ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                          <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm font-medium mb-1">
                            {assignedAttributes.find(a => a.id === selectedAttrId)?.label}
                          </p>
                          <p className="text-xs mb-2">
                            Tipo: <Badge variant="outline" className="text-[9px]">{assignedAttributes.find(a => a.id === selectedAttrId)?.value_type}</Badge>
                          </p>
                          <p className="text-xs max-w-xs">
                            Este atributo não tem opções com preço. O valor é definido diretamente na linha do orçamento.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                          <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">
                            {assignedAttributes.length === 0
                              ? "Adicione atributos ao produto no painel esquerdo"
                              : "Selecione um atributo para ver as suas opções"
                            }
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                  <Button onClick={handleSave} disabled={saving || !hasDirty}>
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> A guardar...</> : "Guardar"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
