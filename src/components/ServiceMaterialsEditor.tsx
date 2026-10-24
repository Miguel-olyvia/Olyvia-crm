import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBundleCatalogItems } from "@/hooks/useBundleCatalogItems";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Package, Search, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { captureFlowError } from "@/lib/observability/captureFlowError";

interface ServiceMaterial {
  id: string;
  product_id: string;
  quantity: number;
  uom_id: string | null;
  notes: string | null;
  sort_order: number | null;
  product?: { id: string; name: string; sku: string } | null;
  // Regra de três simples opcional para este material (migration
  // 20261130170000_service_technical_sheet_quantity_per_area.sql, já
  // aplicada à BD): "Para X m² preciso de Y unidades". Quando ambos
  // preenchidos, a quantidade sugerida no diagnóstico é calculada a partir
  // da área da zona em vez de usar `quantity` fixa (ver
  // QuoteDiagnosticPhase.tsx). NULL mantém o comportamento atual.
  reference_area_m2: number | null;
  reference_quantity: number | null;
}

interface ServiceMaterialsEditorProps {
  serviceId: string;
  organizationId: string;
}

/**
 * Editor da lista de materiais da ficha técnica de um serviço
 * (public.service_materials — migration
 * 20261130130000_service_technical_sheet_materials.sql, ainda não aplicada
 * à BD). Clonado de BundleComponentsEditor.tsx, simplificado para só
 * produtos (a ficha técnica de um serviço nunca lista outros serviços nem
 * bundles). Inserts/updates diretos (RLS-protegida); só o soft-delete passa
 * por RPC (rpc_delete_service_material), tal como documentado na migration.
 *
 * `service_materials`/as RPCs novas ainda não existem em
 * src/integrations/supabase/types.ts (só depois de aplicada a migration e
 * regenerados os tipos) — usa-se `(supabase as any)` para essas chamadas,
 * mesmo padrão já usado no projeto para tabelas/RPCs mais recentes que o
 * schema gerado (ver src/hooks/useConversionRevert.ts, src/contexts/CompanyContext.tsx).
 */
export default function ServiceMaterialsEditor({ serviceId, organizationId }: ServiceMaterialsEditorProps) {
  const { toast } = useToast();

  const [materials, setMaterials] = useState<ServiceMaterial[]>([]);
  const [costPriceMap, setCostPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  // Materiais com o painel da regra de três aberto — inicializado com os que
  // já têm reference_area_m2/reference_quantity preenchidos (ver
  // loadMaterials), para que a regra já configurada fique sempre visível.
  const [expandedReference, setExpandedReference] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(localSearchTerm, 300);

  // Só produtos — a ficha técnica de um serviço nunca lista serviços/bundles.
  const catalog = useBundleCatalogItems(organizationId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("service_materials")
        .select("id, product_id, quantity, uom_id, notes, sort_order, reference_area_m2, reference_quantity, product:products(id, name, sku)")
        .eq("service_id", serviceId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      const materialsData = (data as ServiceMaterial[] | null) || [];
      setMaterials(materialsData);
      setExpandedReference(
        new Set(
          materialsData
            .filter((m) => m.reference_area_m2 != null && m.reference_quantity != null)
            .map((m) => m.id),
        ),
      );

      const productIds = Array.from(
        new Set(materialsData.map((m) => m.product_id).filter(Boolean)),
      );
      if (productIds.length > 0) {
        const { data: costsData, error: costsError } = await supabase
          .from("product_prices")
          .select("product_id, price")
          .in("product_id", productIds)
          .eq("price_type", "purchase");
        if (costsError) throw costsError;
        const map: Record<string, number> = {};
        (costsData || []).forEach((c) => {
          map[c.product_id] = c.price;
        });
        setCostPriceMap(map);
      } else {
        setCostPriceMap({});
      }
    } catch (error: any) {
      captureFlowError(error, "db-error-leaked-to-ui");
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    catalog.changeSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (showAddDialog) {
      setSelectedItems(new Set());
      setLocalSearchTerm("");
      catalog.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddDialog]);

  useEffect(() => {
    if (!showAddDialog) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && catalog.hasMore && !catalog.loading) {
          catalog.loadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [showAddDialog, catalog.hasMore, catalog.loading, catalog.loadMore]);

  const handleAddItems = async () => {
    if (selectedItems.size === 0) return;

    try {
      const rows = Array.from(selectedItems).map((productId, index) => ({
        organization_id: organizationId,
        service_id: serviceId,
        product_id: productId,
        quantity: 1,
        sort_order: materials.length + index,
      }));

      const { error } = await (supabase as any).from("service_materials").insert(rows);
      if (error) throw error;

      toast({ title: "Material(is) adicionado(s) à ficha técnica" });

      setShowAddDialog(false);
      catalog.clearCache();
      loadMaterials();
    } catch (error: any) {
      captureFlowError(error, "db-error-leaked-to-ui");
      toast({
        title: "Erro ao adicionar material",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateQuantity = async (id: string, quantity: number) => {
    // Atualiza a UI de imediato — a gravação é direta (RLS-protegida), sem
    // RPC, tal como pedido para adicionar/editar quantidade.
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, quantity } : m)));
    try {
      const { error } = await (supabase as any).from("service_materials").update({ quantity }).eq("id", id);
      if (error) throw error;
    } catch (error: any) {
      captureFlowError(error, "db-error-leaked-to-ui");
      toast({
        title: "Erro ao atualizar quantidade",
        description: error.message,
        variant: "destructive",
      });
      loadMaterials();
    }
  };

  const handleUpdateReference = async (
    id: string,
    field: "reference_area_m2" | "reference_quantity",
    value: number | null,
  ) => {
    // Mesmo padrão de handleUpdateQuantity: atualiza a UI de imediato,
    // gravação direta (RLS-protegida), sem RPC.
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    try {
      const { error } = await (supabase as any).from("service_materials").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    } catch (error: any) {
      captureFlowError(error, "db-error-leaked-to-ui");
      toast({
        title: "Erro ao atualizar regra de três",
        description: error.message,
        variant: "destructive",
      });
      loadMaterials();
    }
  };

  const toggleReferenceExpanded = (id: string) => {
    setExpandedReference((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      const { error } = await (supabase as any).rpc("rpc_delete_service_material", { p_material_id: id });
      if (error) throw error;

      setMaterials((prev) => prev.filter((m) => m.id !== id));
      toast({ title: "Material removido da ficha técnica" });
    } catch (error: any) {
      captureFlowError(error, "db-error-leaked-to-ui");
      toast({
        title: "Erro ao remover material",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const existingProductIds = new Set(materials.map((m) => m.product_id));
  const availableItems = catalog.items.filter((item) => !existingProductIds.has(item.id));

  const totalMaterialsCost = materials.reduce(
    (sum, m) => sum + m.quantity * (costPriceMap[m.product_id] || 0),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="font-medium text-sm">Materiais da ficha técnica</h4>
          {materials.length > 0 && (
            <p className="text-sm font-semibold text-foreground mt-0.5">
              Custo total de materiais: {formatCurrency(totalMaterialsCost)}
            </p>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar material
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-sm text-muted-foreground">A carregar...</div>
      ) : materials.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-2">Sem materiais associados a este serviço.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar o primeiro material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {materials.map((material) => {
            const unitCost = costPriceMap[material.product_id] || 0;
            const subtotal = material.quantity * unitCost;
            const hasReferenceRule = material.reference_area_m2 != null && material.reference_quantity != null;
            const isExpanded = expandedReference.has(material.id);
            return (
            <Card key={material.id} className="p-3">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate text-sm">{material.product?.name || "Produto removido"}</p>
                    {material.product?.sku && (
                      <Badge variant="outline" className="text-xs">{material.product.sku}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(unitCost)} / un · Subtotal: {formatCurrency(subtotal)}
                  </p>
                  {hasReferenceRule && (
                    <p className="text-xs text-primary mt-0.5">
                      Para {material.reference_area_m2} m² → {material.reference_quantity} unidades
                    </p>
                  )}
                </div>
                <div className="w-28">
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={material.quantity}
                    onChange={(e) => handleUpdateQuantity(material.id, parseFloat(e.target.value) || 1)}
                    className="h-8"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteMaterial(material.id)}
                  className="h-8 w-8 text-destructive shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2 pl-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => toggleReferenceExpanded(material.id)}
                >
                  {isExpanded ? "- Regra de três" : "+ Regra de três"}
                </Button>
                {isExpanded && (
                  <div className="space-y-1.5 mt-1.5">
                    <p className="text-xs text-muted-foreground">Quantidade por área (opcional)</p>
                    <div className="grid grid-cols-2 gap-2 max-w-xs">
                      <div>
                        <Label className="text-xs">Para X m²</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={material.reference_area_m2 ?? ""}
                          onChange={(e) =>
                            handleUpdateReference(
                              material.id,
                              "reference_area_m2",
                              e.target.value === "" ? null : parseFloat(e.target.value),
                            )
                          }
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Y unidades</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={material.reference_quantity ?? ""}
                          onChange={(e) =>
                            handleUpdateReference(
                              material.id,
                              "reference_quantity",
                              e.target.value === "" ? null : parseFloat(e.target.value),
                            )
                          }
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar materiais</DialogTitle>
            <DialogDescription>
              Selecione os produtos do catálogo necessários para este serviço.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar produtos..."
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[350px] border rounded-md" ref={scrollContainerRef}>
            <div className="p-2 space-y-1">
              {catalog.loading && availableItems.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  A carregar...
                </div>
              ) : availableItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</div>
              ) : (
                <>
                  {availableItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                        selectedItems.has(item.id) ? "bg-primary/10 border border-primary" : "hover:bg-muted"
                      }`}
                      onClick={() => {
                        setSelectedItems((prev) => {
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
                      <Package className="h-4 w-4 text-blue-500" />
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </div>
                      <p className="font-semibold">{formatCurrency(item.cost_price)}</p>
                    </div>
                  ))}

                  <div ref={loadMoreTriggerRef} className="h-4">
                    {catalog.loading && availableItems.length > 0 && (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>

                  {catalog.loadError && (
                    <div className="flex flex-col items-center gap-2 py-3">
                      <p className="text-xs text-destructive text-center">{catalog.loadError}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => catalog.loadMore()}>
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAddItems} disabled={selectedItems.size === 0}>
              Adicionar selecionados ({selectedItems.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
