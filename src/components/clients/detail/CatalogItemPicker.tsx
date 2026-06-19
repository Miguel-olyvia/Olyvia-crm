import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2, Package, Wrench } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface CatalogLineItem {
  id?: string;
  type: "product" | "service";
  product_id?: string;
  service_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface CatalogItemPickerProps {
  items: CatalogLineItem[];
  onChange: (items: CatalogLineItem[]) => void;
  organizationId?: string;
}

export const CatalogItemPicker = ({ items, onChange, organizationId }: CatalogItemPickerProps) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<"product" | "service">("product");

  const searchCatalog = useCallback(async (query: string, type: "product" | "service") => {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.length === 0) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      // Build org scope: active org + descendants
      const orgIds: string[] = [organizationId];
      try {
        const { data: children } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id")
          .eq("parent_org_id", organizationId);
        if (children) {
          for (const c of children) {
            if (c.child_org_id && !orgIds.includes(c.child_org_id)) {
              orgIds.push(c.child_org_id);
            }
          }
        }
      } catch (_) { /* ignore hierarchy errors */ }

      const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');
      let fetched: any[] = [];

      if (type === "product") {
        let pQuery = supabase.from("products").select("id, name, sku, product_prices(price, price_type)")
          .or(orgFilter)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .order("name")
          .limit(500);
        if (query.length > 0) pQuery = pQuery.ilike("name", `%${query}%`);
        const { data } = await pQuery;
        fetched = (data || []).map((p: any) => {
          const retailPrice = (p.product_prices || []).find((pp: any) => pp.price_type === "retail");
          return { id: p.id, name: p.name, sku: p.sku, type: "product" as const, price: retailPrice?.price || 0 };
        });
      } else {
        let sQuery = supabase.from("services").select("id, name, sku, service_prices(price, price_type)")
          .or(orgFilter)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .order("name")
          .limit(500);
        if (query.length > 0) sQuery = sQuery.ilike("name", `%${query}%`);
        const { data } = await sQuery;
        fetched = (data || []).map((s: any) => {
          const retailPrice = (s.service_prices || []).find((sp: any) => sp.price_type === "retail");
          return { id: s.id, name: s.name, sku: s.sku, type: "service" as const, price: retailPrice?.price || 0 };
        });
      }

      setResults(fetched);
    } catch (err) {
      console.error("Catalog search error:", err);
    } finally {
      setSearching(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (showSearch) {
      searchCatalog(search, activeTab);
    }
  }, [showSearch, activeTab, searchCatalog]);

  useEffect(() => {
    if (!showSearch) return;
    const timer = setTimeout(() => searchCatalog(search, activeTab), 300);
    return () => clearTimeout(timer);
  }, [search, searchCatalog, showSearch, activeTab]);

  const addItem = (result: any) => {
    const newItem: CatalogLineItem = {
      type: result.type,
      product_id: result.type === "product" ? result.id : undefined,
      service_id: result.type === "service" ? result.id : undefined,
      name: result.name,
      quantity: 1,
      unit_price: result.price || 0,
    };
    onChange([...items, newItem]);
  };

  const addManualItem = () => {
    onChange([...items, { type: "product", name: "", quantity: 1, unit_price: 0 }]);
  };

  const updateItem = (index: number, field: keyof CatalogLineItem, value: any) => {
    const updated = items.map((item, i) => i === index ? { ...item, [field]: value } : item);
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Produtos / Serviços</p>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
            <Search className="w-3.5 h-3.5 mr-1" />Catálogo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={addManualItem}>
            <Plus className="w-3.5 h-3.5 mr-1" />Manual
          </Button>
        </div>
      </div>

      {showSearch && (
        <div className="relative space-y-2">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "product" | "service"); setResults([]); setSearch(""); }}>
            <TabsList className="w-full">
              <TabsTrigger value="product" className="flex-1 gap-1">
                <Package className="w-3.5 h-3.5" />Produtos
              </TabsTrigger>
              <TabsTrigger value="service" className="flex-1 gap-1">
                <Wrench className="w-3.5 h-3.5" />Serviços
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            placeholder={activeTab === "product" ? "Pesquisar produtos..." : "Pesquisar serviços..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-72 overflow-y-auto" style={{ top: "calc(100% - 8px)" }}>
            {searching && <p className="text-xs text-muted-foreground p-3">A pesquisar...</p>}
            {!searching && results.length === 0 && <p className="text-xs text-muted-foreground p-3">Sem resultados.</p>}
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm"
                onClick={() => addItem(r)}
              >
                {r.type === "product" ? (
                  <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Wrench className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                )}
                <span className="truncate flex-1">{r.name}</span>
                {r.sku && <span className="text-[10px] text-muted-foreground">{r.sku}</span>}
                <span className="text-xs font-medium">€{r.price?.toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
              {item.product_id || item.service_id ? (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {item.type === "product" ? "Prod" : "Serv"}
                </Badge>
              ) : null}
              <Input
                className="flex-1 h-8 text-xs"
                placeholder="Descrição"
                value={item.name}
                onChange={e => updateItem(i, "name", e.target.value)}
              />
              <Input
                className="w-16 h-8 text-xs text-center"
                type="number"
                min={1}
                value={item.quantity}
                onChange={e => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
              />
              <Input
                className="w-24 h-8 text-xs text-right"
                type="number"
                step="0.01"
                value={item.unit_price}
                onChange={e => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)}
              />
              <span className="text-xs font-medium w-20 text-right">
                €{(item.quantity * item.unit_price).toFixed(2)}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(i)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex justify-end pt-1 border-t border-border">
            <span className="text-sm font-bold">Total: €{total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {items.length === 0 && !showSearch && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sem itens. Adicione do catálogo ou manualmente.
        </p>
      )}
    </div>
  );
};
