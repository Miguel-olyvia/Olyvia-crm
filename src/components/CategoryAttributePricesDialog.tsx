import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  attributeId?: string;
}

interface AttrDef {
  id: string;
  code: string;
  label: string;
  pricing_type: string;
}

interface ValueRow {
  value: string;
  display_name: string;
  hex_color: string | null;
  is_available: boolean;
  price: number;
  sort_order: number;
  existingId: string | null;
  dirty: boolean;
}

export default function CategoryAttributePricesDialog({
  open, onOpenChange, categoryId, categoryName, attributeId: propAttributeId
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attributes, setAttributes] = useState<AttrDef[]>([]);
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null);
  const [valueRows, setValueRows] = useState<Record<string, ValueRow[]>>({});

  const activeCounts: Record<string, { active: number; total: number }> = {};
  Object.entries(valueRows).forEach(([attrId, rows]) => {
    activeCounts[attrId] = {
      active: rows.filter(r => r.is_available).length,
      total: rows.length,
    };
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const categoryChain: string[] = [];
      let currentCategoryId: string | null = categoryId;
      for (let i = 0; i < 10 && currentCategoryId; i++) {
        categoryChain.push(currentCategoryId);
        const { data: parentRow } = await supabase
          .from("product_categories")
          .select("parent_category_id, parent_id")
          .eq("id", currentCategoryId)
          .maybeSingle();
        currentCategoryId = (parentRow?.parent_category_id || parentRow?.parent_id || null) as string | null;
      }

      // Get pricing attributes + always include the passed attribute
      let query = supabase
        .from("product_attributes")
        .select("id, code, label, pricing_type")
        .order("label");

      if (propAttributeId) {
        // Include attributes with pricing OR the specific attribute being configured
        query = query.or(`pricing_type.in.(fixed,both),id.eq.${propAttributeId}`);
      } else {
        query = query.in("pricing_type", ["fixed", "both"]);
      }

      const { data: allAttrs, error: attErr } = await query;

      if (attErr) throw attErr;

      const attrList = (allAttrs || []) as AttrDef[];
      setAttributes(attrList);

      if (attrList.length === 0) {
        setValueRows({});
        setSelectedAttrId(null);
        return;
      }

      const attrIds = attrList.map(a => a.id);
      const rows: Record<string, ValueRow[]> = {};

      // Load existing category-level prices
      const { data: existingPrices } = await supabase
        .from("product_attribute_value_prices")
        .select("id, attribute_id, value_option, price, is_available, sort_order")
        .eq("category_id", categoryId)
        .is("product_id", null)
        .in("attribute_id", attrIds);

      const inheritedCategoryIds = categoryChain.slice(1);
      const { data: inheritedPrices } = inheritedCategoryIds.length > 0
        ? await supabase
            .from("product_attribute_value_prices")
            .select("attribute_id, value_option, price, is_available, sort_order, category_id")
            .in("attribute_id", attrIds)
            .is("product_id", null)
            .or(`category_id.in.(${inheritedCategoryIds.join(",")}),category_id.is.null`)
        : await supabase
            .from("product_attribute_value_prices")
            .select("attribute_id, value_option, price, is_available, sort_order, category_id")
            .in("attribute_id", attrIds)
            .is("product_id", null)
            .is("category_id", null);

      // For each attribute, get options via RPC (now with fallback to option groups)
      for (const attr of attrList) {
        const { data: options } = await supabase.rpc("get_category_attribute_options", {
          p_category_id: categoryId,
          p_attribute_id: attr.id,
        });

        if (!options || options.length === 0) continue;

        const existingMap = new Map<string, any>();
        (existingPrices || []).forEach((ep: any) => {
          if (ep.attribute_id === attr.id) {
            existingMap.set(ep.value_option, ep);
          }
        });

        const inheritedMap = new Map<string, any>();
        const inheritedForAttr = (inheritedPrices || []).filter((ip: any) => ip.attribute_id === attr.id);
        options.forEach((opt: any) => {
          const match = inheritedForAttr.find((ip: any) => ip.value_option === opt.value_text && ip.category_id === inheritedCategoryIds[0])
            || inheritedForAttr.find((ip: any) => ip.value_option === opt.value_text && ip.category_id === inheritedCategoryIds[1])
            || inheritedForAttr.find((ip: any) => ip.value_option === opt.value_text && ip.category_id === inheritedCategoryIds[2])
            || inheritedForAttr.find((ip: any) => ip.value_option === opt.value_text && ip.category_id === null);
          if (match) inheritedMap.set(opt.value_text, match);
        });

        rows[attr.id] = options.map((opt: any, idx: number) => {
          const existing = existingMap.get(opt.value_text);
          const inherited = inheritedMap.get(opt.value_text);
          return {
            value: opt.value_text,
            display_name: opt.display_name || opt.value_text,
            hex_color: opt.hex_color || null,
            is_available: existing ? existing.is_available : true,
            price: existing ? Number(existing.price) : Number(inherited?.price || 0),
            sort_order: existing ? existing.sort_order : idx,
            existingId: existing?.id || null,
            dirty: false,
          };
        });
      }

      // Filter to only show attributes that have options
      const attrsWithOptions = attrList.filter(a => rows[a.id] && rows[a.id].length > 0);
      setAttributes(attrsWithOptions);

      setValueRows(rows);
      // Pre-select the passed attributeId if available, otherwise first
      if (propAttributeId && attrsWithOptions.find(a => a.id === propAttributeId)) {
        setSelectedAttrId(propAttributeId);
      } else if (!selectedAttrId || !attrsWithOptions.find(a => a.id === selectedAttrId)) {
        setSelectedAttrId(attrsWithOptions[0]?.id || null);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [categoryId, toast, selectedAttrId]);

  useEffect(() => {
    if (open && categoryId) loadData();
  }, [open, categoryId]);

  const updateRow = (attrId: string, index: number, updates: Partial<ValueRow>) => {
    setValueRows(prev => {
      const rows = [...(prev[attrId] || [])];
      rows[index] = { ...rows[index], ...updates, dirty: true };
      return { ...prev, [attrId]: rows };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any[] = [];
      const inserts: any[] = [];

      Object.entries(valueRows).forEach(([attrId, rows]) => {
        rows.forEach(row => {
          if (!row.dirty) return;
          if (row.existingId) {
            updates.push({
              id: row.existingId,
              is_available: row.is_available,
              price: row.price,
              sort_order: row.sort_order,
            });
          } else {
            inserts.push({
              category_id: categoryId,
              product_id: null,
              attribute_id: attrId,
              value_option: row.value,
              price: row.price,
              is_available: row.is_available,
              sort_order: row.sort_order,
            });
          }
        });
      });

      for (const u of updates) {
        const { error } = await supabase
          .from("product_attribute_value_prices")
          .update({ is_available: u.is_available, price: u.price, sort_order: u.sort_order, updated_at: new Date().toISOString() })
          .eq("id", u.id);
        if (error) throw error;
      }

      if (inserts.length > 0) {
        const { error } = await supabase
          .from("product_attribute_value_prices")
          .insert(inserts);
        if (error) throw error;
      }

      toast({ title: "Guardado", description: "Preços de categoria atualizados." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = Object.values(valueRows).some(rows => rows.some(r => r.dirty));
  const currentRows = selectedAttrId ? (valueRows[selectedAttrId] || []) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Preços de Opções: {categoryName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : attributes.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p>Nenhum atributo com opções disponíveis para esta categoria.</p>
          </div>
        ) : (
          <div className="flex gap-4 h-[55vh]">
            <div className="w-48 shrink-0 border-r pr-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">Atributos</p>
              <ScrollArea className="h-full">
                <div className="space-y-1">
                  {attributes.map(attr => {
                    const counts = activeCounts[attr.id];
                    return (
                      <button
                        key={attr.id}
                        onClick={() => setSelectedAttrId(attr.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                          selectedAttrId === attr.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{attr.label}</span>
                          {counts && (
                            <Badge variant={selectedAttrId === attr.id ? "secondary" : "outline"} className="text-[10px] ml-1 shrink-0">
                              {counts.active}/{counts.total}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 min-w-0">
              {selectedAttrId && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">
                      Valores de {attributes.find(a => a.id === selectedAttrId)?.label}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        setValueRows(prev => ({
                          ...prev,
                          [selectedAttrId]: (prev[selectedAttrId] || []).map(r => ({ ...r, is_available: true, dirty: true }))
                        }));
                      }}>
                        Ativar todos
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setValueRows(prev => ({
                          ...prev,
                          [selectedAttrId]: (prev[selectedAttrId] || []).map(r => ({ ...r, is_available: false, dirty: true }))
                        }));
                      }}>
                        Desativar todos
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(100%-40px)]">
                    <div className="space-y-2">
                      {currentRows.map((row, idx) => (
                        <div
                          key={row.value}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-md border",
                            !row.is_available && "opacity-50 bg-muted/30"
                          )}
                        >
                          <Checkbox
                            checked={row.is_available}
                            onCheckedChange={(checked) => updateRow(selectedAttrId, idx, { is_available: !!checked })}
                          />
                          {row.hex_color && (
                            <div
                              className="w-5 h-5 rounded-full border shrink-0"
                              style={{ backgroundColor: row.hex_color }}
                            />
                          )}
                          <span className="text-sm flex-1 truncate">{row.display_name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">+€</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.price}
                              onChange={(e) => updateRow(selectedAttrId, idx, { price: parseFloat(e.target.value) || 0 })}
                              className="w-24 h-8 text-sm"
                              disabled={!row.is_available}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !hasDirty}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> A guardar...</> : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
