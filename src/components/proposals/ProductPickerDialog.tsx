import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Package, Wrench, Plus, Loader2 } from "lucide-react";

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  price: number;
  vat_rate: number;
  category_name: string | null;
}

interface ProductPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProducts: (products: CatalogProduct[]) => void;
  organizationId?: string;
}

export function ProductPickerDialog({
  open,
  onOpenChange,
  onSelectProducts,
  organizationId,
}: ProductPickerDialogProps) {
  const { activeCompany } = useCompany();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [services, setServices] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("products");

  const orgId = organizationId || activeCompany?.id;

  useEffect(() => {
    if (open && orgId) {
      loadData();
    }
    if (!open) {
      setSelectedIds(new Set());
      setSearch("");
      setActiveTab("products");
    }
  }, [open, orgId]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const orgIds = [orgId];
      const { data: children } = await supabase
        .from("anew_hierarchy")
        .select("child_org_id")
        .eq("parent_org_id", orgId);
      if (children) {
        orgIds.push(...children.map((c: any) => c.child_org_id));
      }

      // Build OR filter for all org IDs across organization_id and root_organization_id
      const orClauses = orgIds.flatMap(id => [
        `organization_id.eq.${id}`,
        `root_organization_id.eq.${id}`,
      ]).join(',');

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, sku, description")
        .or(orClauses)
        .eq("is_active", true)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .order("name")
        .limit(500) as any;

      const { data: servicesData } = await supabase
        .from("services")
        .select("id, name, sku, short_desc")
        .or(orClauses)
        .eq("is_active", true)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .order("name")
        .limit(500) as any;

      const productIds = (productsData || []).map((p: any) => p.id);
      const serviceIds = (servicesData || []).map((s: any) => s.id);
      const pricesMap = new Map<string, { price: number; vat_rate: number }>();

      if (productIds.length > 0) {
        const { data: prices } = await supabase
          .from("product_prices")
          .select("product_id, price, vat_rate, price_type")
          .in("product_id", productIds)
          .or("valid_from.is.null,valid_from.lte." + new Date().toISOString())
          .or("valid_to.is.null,valid_to.gte." + new Date().toISOString());
        if (prices) {
          for (const p of prices) {
            const existing = pricesMap.get(p.product_id);
            if (!existing || p.price_type === "retail") {
              pricesMap.set(p.product_id, { price: p.price || 0, vat_rate: p.vat_rate || 23 });
            }
          }
        }
      }

      if (serviceIds.length > 0) {
        const { data: servicePrices } = await supabase
          .from("service_prices")
          .select("service_id, price, vat_rate, price_type")
          .in("service_id", serviceIds)
          .or("valid_from.is.null,valid_from.lte." + new Date().toISOString())
          .or("valid_to.is.null,valid_to.gte." + new Date().toISOString());
        if (servicePrices) {
          for (const p of servicePrices) {
            const existing = pricesMap.get(p.service_id);
            if (!existing || p.price_type === "retail") {
              pricesMap.set(p.service_id, { price: p.price || 0, vat_rate: p.vat_rate || 23 });
            }
          }
        }
      }

      setProducts((productsData || []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku, description: p.description,
        price: pricesMap.get(p.id)?.price || 0, vat_rate: pricesMap.get(p.id)?.vat_rate || 23,
        category_name: "Produto",
      })));

      setServices((servicesData || []).map((s: any) => ({
        id: s.id, name: s.name, sku: s.sku, description: s.short_desc,
        price: pricesMap.get(s.id)?.price || 0, vat_rate: pricesMap.get(s.id)?.vat_rate || 23,
        category_name: "Serviço",
      })));
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const allItems = [...products, ...services];
    const selected = allItems.filter((p) => selectedIds.has(p.id));
    onSelectProducts(selected);
    onOpenChange(false);
  };

  const filterItems = (items: CatalogProduct[]) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    );
  };

  const renderTable = (items: CatalogProduct[], emptyLabel: string) => {
    const filtered = filterItems(items);
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{emptyLabel}</p>
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Nome</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="text-right">IVA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((item) => (
            <TableRow
              key={item.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => toggleProduct(item.id)}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleProduct(item.id)}
                />
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {item.sku && (
                  <Badge variant="outline" className="font-mono text-xs">{item.sku}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-medium">€{item.price.toFixed(2)}</TableCell>
              <TableCell className="text-right text-sm">{item.vat_rate}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Selecionar do Catálogo
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="products" className="flex-1 gap-2">
              <Package className="h-4 w-4" />
              Produtos ({filterItems(products).length})
            </TabsTrigger>
            <TabsTrigger value="services" className="flex-1 gap-2">
              <Wrench className="h-4 w-4" />
              Serviços ({filterItems(services).length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="flex-1 min-h-0 mt-2">
            <div className="overflow-y-auto max-h-[45vh]">
              {renderTable(products, "Nenhum produto encontrado")}
            </div>
          </TabsContent>
          <TabsContent value="services" className="flex-1 min-h-0 mt-2">
            <div className="overflow-y-auto max-h-[45vh]">
              {renderTable(services, "Nenhum serviço encontrado")}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size} {selectedIds.size === 1 ? "item selecionado" : "itens selecionados"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar ({selectedIds.size})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
