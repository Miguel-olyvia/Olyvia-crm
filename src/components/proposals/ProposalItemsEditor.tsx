import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Package, Wrench, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  sort_order: number;
}

interface ProposalItemsEditorProps {
  items: ProposalItem[];
  onChange: (items: ProposalItem[]) => void;
  disabled?: boolean;
  hasQuotes?: boolean;
}

interface CatalogPriceRow { price: number | null; price_type: string | null }
interface ProductCatalogRow { id: string; name: string; sku: string | null; product_prices?: CatalogPriceRow[] | null }
interface ServiceCatalogRow { id: string; name: string; sku: string | null; service_prices?: CatalogPriceRow[] | null }
interface CatalogResult { id: string; name: string; sku: string | null; type: "product" | "service"; price: number }

const VAT_RATES = [0, 6, 13, 23];

const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function ProposalItemsEditor({ 
  items, 
  onChange, 
  disabled = false,
  hasQuotes = false 
}: ProposalItemsEditorProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"product" | "service">("product");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);

  const organizationId = activeCompany?.id;

  const searchCatalog = useCallback(async (query: string, type: "product" | "service") => {
    if (!organizationId) { setCatalogResults([]); return; }
    setSearching(true);
    try {
      const orgIds: string[] = [organizationId];
      try {
        const { data: children } = await supabase.from("anew_hierarchy").select("child_org_id").eq("parent_org_id", organizationId);
        if (children) children.forEach(c => { if (c.child_org_id && !orgIds.includes(c.child_org_id)) orgIds.push(c.child_org_id); });
      } catch (err) {
        console.warn("Could not load child organizations for proposal catalog search:", err);
      }

      const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');
      let fetched: CatalogResult[] = [];

      if (type === "product") {
        let pQuery = supabase.from("products").select("id, name, sku, product_prices(price, price_type)")
          .or(orgFilter).eq("is_active", true).eq("is_deleted", false).order("name").limit(500);
        if (query.length > 0) pQuery = pQuery.ilike("name", `%${query}%`);
        const { data } = await pQuery;
        fetched = ((data || []) as ProductCatalogRow[]).map((p) => {
          const retailPrice = (p.product_prices || []).find((pp) => pp.price_type === "retail");
          return { id: p.id, name: p.name, sku: p.sku, type: "product" as const, price: retailPrice?.price || 0 };
        });
      } else {
        let sQuery = supabase.from("services").select("id, name, sku, service_prices(price, price_type)")
          .or(orgFilter).eq("is_active", true).eq("is_deleted", false).order("name").limit(500);
        if (query.length > 0) sQuery = sQuery.ilike("name", `%${query}%`);
        const { data } = await sQuery;
        fetched = ((data || []) as ServiceCatalogRow[]).map((s) => {
          const retailPrice = (s.service_prices || []).find((sp) => sp.price_type === "retail");
          return { id: s.id, name: s.name, sku: s.sku, type: "service" as const, price: retailPrice?.price || 0 };
        });
      }
      setCatalogResults(fetched);
    } catch (err) {
      console.error("Catalog search error:", err);
    } finally { setSearching(false); }
  }, [organizationId]);

  useEffect(() => {
    if (showCatalog) searchCatalog(catalogSearch, catalogTab);
  }, [showCatalog, catalogTab, searchCatalog]);

  useEffect(() => {
    if (!showCatalog) return;
    const timer = setTimeout(() => searchCatalog(catalogSearch, catalogTab), 300);
    return () => clearTimeout(timer);
  }, [catalogSearch, searchCatalog, showCatalog, catalogTab]);

  const addFromCatalog = (result: CatalogResult) => {
    const newItem: ProposalItem = {
      id: generateTempId(),
      description: result.name,
      quantity: 1,
      unit_price: result.price || 0,
      vat_rate: 23,
      sort_order: items.length,
    };
    onChange([...items, newItem]);
  };

  const addManualItem = () => {
    const newItem: ProposalItem = {
      id: generateTempId(),
      description: "",
      quantity: 1,
      unit_price: 0,
      vat_rate: 23,
      sort_order: items.length,
    };
    onChange([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof ProposalItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    newItems.forEach((item, i) => item.sort_order = i);
    onChange(newItems);
  };

  const calculateItemSubtotal = (item: ProposalItem) => item.quantity * item.unit_price;
  const calculateItemVat = (item: ProposalItem) => calculateItemSubtotal(item) * (item.vat_rate / 100);
  const calculateItemTotal = (item: ProposalItem) => calculateItemSubtotal(item) + calculateItemVat(item);

  const totals = (() => {
    const subtotal = items.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
    const vatTotal = items.reduce((sum, item) => sum + calculateItemVat(item), 0);
    return { subtotal, vatTotal, total: subtotal + vatTotal };
  })();

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Itens
          </CardTitle>
          <div className="flex gap-1">
            <Button type="button" size="sm" onClick={() => setShowCatalog(!showCatalog)} disabled={disabled} className="gap-1">
              <Plus className="h-4 w-4" />
              Adicionar Item
            </Button>
          </div>
        </div>
        {hasQuotes && items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Com orçamentos associados, o valor é calculado a partir deles. Adicione itens apenas se precisar de valores adicionais.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Catalog picker */}
        {showCatalog && (
          <div className="relative space-y-2 border rounded-lg p-3 bg-muted/20">
            <Tabs value={catalogTab} onValueChange={(v) => { setCatalogTab(v as "product" | "service"); setCatalogResults([]); setCatalogSearch(""); }}>
              <TabsList className="w-full">
                <TabsTrigger value="product" className="flex-1 gap-1">
                  <Package className="w-3.5 h-3.5" />Produtos
                </TabsTrigger>
                <TabsTrigger value="service" className="flex-1 gap-1">
                  <Wrench className="w-3.5 h-3.5" />Serviços
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={catalogTab === "product" ? "Pesquisar produtos..." : "Pesquisar serviços..."}
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-md bg-popover">
              {searching && <p className="text-xs text-muted-foreground p-3">A pesquisar...</p>}
              {!searching && catalogResults.length === 0 && <p className="text-xs text-muted-foreground p-3">Sem resultados.</p>}
              {catalogResults.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm border-b last:border-b-0"
                  onClick={() => addFromCatalog(r)}
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
            <div className="flex justify-between items-center pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={addManualItem} className="text-xs gap-1">
                <Plus className="h-3 w-3" />Item manual
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCatalog(false)} className="text-xs">
                Fechar
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 && !showCatalog ? (
          <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum item adicionado</p>
            <p className="text-xs mt-1">Clique em "Adicionar Item" para selecionar do catálogo</p>
          </div>
        ) : items.length > 0 ? (
          <>
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2">
              <div className="col-span-5">Descrição</div>
              <div className="col-span-1 text-center">Qtd</div>
              <div className="col-span-2 text-right">Preço Un.</div>
              <div className="col-span-1 text-center">IVA</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {/* Items */}
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="col-span-5">
                  <Input
                    placeholder="Descrição do item..."
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    disabled={disabled}
                    className="h-9"
                  />
                </div>
                <div className="col-span-1">
                  <Input type="number" min="0" step="0.01" value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    disabled={disabled} className="h-9 text-center px-1" />
                </div>
                <div className="col-span-2">
                  <Input type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    disabled={disabled} className="h-9 text-right" placeholder="0.00" />
                </div>
                <div className="col-span-1">
                  <Select value={item.vat_rate.toString()} onValueChange={(v) => updateItem(index, 'vat_rate', parseFloat(v))} disabled={disabled}>
                    <SelectTrigger className="h-9 px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_RATES.map((rate) => (<SelectItem key={rate} value={rate.toString()}>{rate}%</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 text-right font-medium">
                  <span className="text-sm">{formatCurrency(calculateItemTotal(item))}</span>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}
                    disabled={disabled} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Totals */}
            <div className="border-t pt-4 mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal (s/ IVA)</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA</span>
                <span>{formatCurrency(totals.vatTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function calculateProposalItemsTotal(items: ProposalItem[]): number {
  return items.reduce((sum, item) => {
    const subtotal = item.quantity * item.unit_price;
    const vat = subtotal * (item.vat_rate / 100);
    return sum + subtotal + vat;
  }, 0);
}