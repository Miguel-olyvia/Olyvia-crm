import { useState, useEffect } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Plus, Pencil, Trash2, Warehouse, Download, Upload, Shield, ArrowLeftRight, History, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { exportWarehousesToCSV, parseWarehousesCSV } from "@/utils/warehousesExportImport";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { warehouseSchema } from "@/lib/validations";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  InventoryPageHeader,
  InventoryStatusBadge,
  InventoryEmptyState,
  RowActions,
  usePermissionGate,
  stocksLink,
  stockMovementsLink,
  toneText,
} from "@/components/inventory/ui";
import { InventorySettingsCard, useInventorySettings } from "@/components/inventory/InventorySettingsCard";
import { inventoryTodayQueryKey } from "@/hooks/useInventoryToday";
import { cn } from "@/lib/utils";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_entrada: "Transferência (entrada)",
  transferencia_saida: "Transferência (saída)",
  ajuste_positivo: "Ajuste (+)",
  ajuste_negativo: "Ajuste (-)",
  devolucao_fornecedor: "Devolução a fornecedor",
  quebra: "Quebra",
};
const INCREASING_TYPES = new Set(["entrada", "transferencia_entrada", "ajuste_positivo"]);

interface WarehouseMovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  created_at: string;
  products?: { name: string } | null;
}

type WarehouseData = Database["public"]["Tables"]["warehouses"]["Row"];

interface WarehouseStats {
  products: number;
  value: number;
  belowReorder: number;
}

// TITULOS.wh do protótipo (menuInv.ts), sem a frase sobre "servem clientes"/
// reserva FIFO: warehouses não tem serves_customers na BD de produção.
const PAGE_TITLE = "Armazéns";
const PAGE_DESCRIPTION = "Onde está o stock.";

const STATS_PAGE_SIZE = 1000;
const EMPTY_STATS: WarehouseStats = { products: 0, value: 0, belowReorder: 0 };
const formatEur = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

/**
 * Mini-KPIs por armazém, a partir de `stocks` da organização (linhas não
 * eliminadas) num só lote paginado: produtos com quantidade > 0, valor
 * (quantidade × custo médio — só pedido com products.view_cost) e linhas
 * abaixo do ponto de encomenda — a MESMA regra do "Stock Baixo" das
 * Existências (getStockStatusCode em Stocks.tsx): reorder_point > 0 e
 * quantidade ≤ reorder_point (0 = nunca configurado, não conta).
 */
function useWarehouseStockStats(organizationId: string | undefined, withCost: boolean) {
  return useQuery({
    queryKey: ["warehouses-stock-stats", organizationId ?? null, withCost] as const,
    enabled: !!organizationId,
    queryFn: async (): Promise<Record<string, WarehouseStats>> => {
      const columns = withCost
        ? "id, warehouse_id, quantity, reorder_point, average_cost"
        : "id, warehouse_id, quantity, reorder_point";
      const out: Record<string, WarehouseStats> = {};
      for (let from = 0; ; from += STATS_PAGE_SIZE) {
        const { data, error } = await supabase
          .from("stocks")
          .select(columns)
          .eq("organization_id", organizationId as string)
          .is("deleted_at", null)
          .order("id")
          .range(from, from + STATS_PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as Array<{
          warehouse_id: string;
          quantity: number | null;
          reorder_point: number | null;
          average_cost?: number | null;
        }>;
        for (const r of rows) {
          const s = (out[r.warehouse_id] ??= { products: 0, value: 0, belowReorder: 0 });
          const qty = Number(r.quantity) || 0;
          const reorder = Number(r.reorder_point) || 0;
          if (qty > 0) s.products += 1;
          if (withCost) s.value += qty * (Number(r.average_cost) || 0);
          if (reorder > 0 && qty <= reorder) s.belowReorder += 1;
        }
        if (rows.length < STATS_PAGE_SIZE) break;
      }
      return out;
    },
  });
}

const Warehouses = () => {
  const { toast } = useToast();
  const { loading: permissionsLoading, hasModuleAccess, hasPermission } = usePermissions();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const gate = usePermissionGate();
  const canView = hasModuleAccess("warehouses");
  const canViewCost = hasPermission("products.view_cost");
  const editGate = gate("warehouses.edit");
  const movementGate = gate("inventory.edit");
  const statsQuery = useWarehouseStockStats(activeCompany?.id, canViewCost);
  const settingsQuery = useInventorySettings(activeCompany?.id);
  const defaultWarehouseId = settingsQuery.data?.default_warehouse_id ?? null;
  const [deleteTarget, setDeleteTarget] = useState<WarehouseData | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Desativar pede confirmação (revisão #8); ativar grava logo.
  const [deactivateTarget, setDeactivateTarget] = useState<WarehouseData | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    postal_code: "",
    country: "",
    manager_name: "",
    phone: "",
    email: "",
    capacity: "",
    is_active: true,
  });
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementWarehouseId, setMovementWarehouseId] = useState<string | undefined>(undefined);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyWarehouse, setHistoryWarehouse] = useState<{ id: string; name: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<WarehouseMovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchWarehouses();
    }
  }, [activeCompany?.id, showDeleted]);

  const loadWarehouseHistory = async (warehouseId: string) => {
    setHistoryLoading(true);
    try {
      if (!activeCompany?.id) return;
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, movement_type, quantity, balance_after, document_number, created_at, products(name)")
        .eq("organization_id", activeCompany.id)
        .eq("warehouse_id", warehouseId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setHistoryRows((data || []) as WarehouseMovementRow[]);
    } catch (error: any) {
      toast({ title: "Erro ao carregar movimentos", description: error.message, variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    if (!activeCompany?.id) return;

    try {
      let query = supabase
        .from("warehouses")
        .select("*")
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false });

      // Soft-deleted warehouses are hidden from the normal list by default.
      query = showDeleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

      const { data, error } = await query;

      if (error) throw error;
      setWarehouses(data as WarehouseData[] || []);
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.loadError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = warehouseSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) errors[err.path[0].toString()] = err.message;
      });
      setFieldErrors(errors);
      toast({
        title: t("warehouses.toast.error"),
        description: validation.error.errors[0]?.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const warehouseData = {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
      };

      if (editingWarehouse) {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("warehouses")
            .update({
              ...warehouseData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingWarehouse.id);

          if (error) throw error;
        });

        toast({
          title: t("warehouses.toast.updateSuccess"),
        });
      } else {
        if (!activeCompany?.id) throw new Error("No active company selected");

        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase.from("warehouses").insert([
            {
              ...warehouseData,
              organization_id: activeCompany.id,
              created_by: businessUserId,
            },
          ]);

          if (error) throw error;
        });

        toast({
          title: t("warehouses.toast.createSuccess"),
        });
      }

      setDialogOpen(false);
      resetForm();
      refreshAll();
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Depois de criar/editar/eliminar/restaurar/importar: a lista do cartão de
  // definições (armazém por defeito) e os mini-KPIs também mudam.
  const refreshAll = () => {
    fetchWarehouses();
    queryClient.invalidateQueries({ queryKey: ["organization-inventory-settings"] });
    queryClient.invalidateQueries({ queryKey: ["warehouses-stock-stats"] });
  };

  // Mesma gravação que a edição pelo diálogo (warehouses.edit), só do is_active.
  const handleToggleActive = async (warehouse: WarehouseData, next: boolean) => {
    if (!activeCompany?.id) return;
    setTogglingId(warehouse.id);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase
          .from("warehouses")
          .update({ is_active: next, updated_at: new Date().toISOString() })
          .eq("id", warehouse.id)
          .eq("organization_id", activeCompany.id);
        if (error) throw error;
      });
      setWarehouses((prev) => prev.map((w) => (w.id === warehouse.id ? { ...w, is_active: next } : w)));
      toast({ title: t("warehouses.toast.updateSuccess") });
      // A lista do cartão de definições (armazém por defeito) e os KPIs mudam.
      refreshAll();
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_delete_warehouse", { p_id: id });
      if (error) throw error;

      toast({
        title: t("warehouses.toast.deleteSuccess"),
      });

      refreshAll();
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_warehouse", { p_id: id });
      if (error) throw error;

      toast({ title: t("warehouses.toast.restoreSuccess") || "Armazém restaurado" });

      refreshAll();
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      city: "",
      postal_code: "",
      country: "",
      manager_name: "",
      phone: "",
      email: "",
      capacity: "",
      is_active: true,
    });
    setEditingWarehouse(null);
    setFieldErrors({});
  };

  const handleExport = () => {
    if (warehouses.length === 0) {
      toast({
        title: t("warehouses.toast.exportNoData"),
        description: t("warehouses.toast.exportNoDataDesc"),
        variant: "destructive",
      });
      return;
    }
    exportWarehousesToCSV(warehouses);
    toast({
      title: t("warehouses.toast.exportSuccess"),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      if (!activeCompany?.id) throw new Error("No active company selected");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const warehousesToInsert = parseWarehousesCSV(text, businessUserId, activeCompany.id);

      if (warehousesToInsert.length === 0) {
        throw new Error(t("warehouses.toast.noValidWarehouses"));
      }

      await withAuditContext(
        supabase,
        businessUserId,
        async () => {
          const { error } = await supabase.from("warehouses").insert(warehousesToInsert);
          if (error) throw error;
        },
        "csv_import"
      );

      toast({
        title: t("warehouses.toast.importSuccess").replace("{count}", String(warehousesToInsert.length)),
      });

      setImportDialogOpen(false);
      refreshAll();
    } catch (error: any) {
      captureFlowError(error, "record-export-import");
      toast({
        title: t("warehouses.toast.importError"),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  const openEditDialog = (warehouse: WarehouseData) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address || "",
      city: warehouse.city || "",
      postal_code: warehouse.postal_code || "",
      country: warehouse.country || "",
      manager_name: warehouse.manager_name || "",
      phone: warehouse.phone || "",
      email: warehouse.email || "",
      capacity: warehouse.capacity?.toString() || "",
      is_active: warehouse.is_active,
    });
    setDialogOpen(true);
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany?.id) {
    return (
      <>
        <div className="space-y-6 p-6">
          <InventoryPageHeader area="warehouse" title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (loading || permissionsLoading) {
    return (
      <>
        <div className="space-y-6">
          <InventoryPageHeader area="warehouse" title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
          <div className="text-center py-8">{t("common.loading")}</div>
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>{t("warehouses.accessDenied")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                {t("warehouses.noPermission")}
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <InventoryPageHeader
          area="warehouse"
          title={PAGE_TITLE}
          description={PAGE_DESCRIPTION}
          actions={
          <>
            <Button
              variant={showDeleted ? "default" : "outline"}
              aria-pressed={showDeleted}
              onClick={() => setShowDeleted((prev) => !prev)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {showDeleted ? (t("warehouses.hideDeleted") || "Ocultar eliminados") : (t("warehouses.showDeleted") || "Ver eliminados")}
            </Button>
            <PermissionGate permission="warehouses.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t("warehouses.actions.export")}
              </Button>
            </PermissionGate>
            <PermissionGate permission="warehouses.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    {t("warehouses.actions.import")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("warehouses.import.title")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="csv-upload">{t("warehouses.import.csvFile")}</Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("warehouses.import.description")}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="warehouses.create">
              <Button
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("warehouses.addWarehouse")}
              </Button>
            </PermissionGate>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingWarehouse ? t("warehouses.editWarehouse") : t("warehouses.addWarehouse")}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">{t("warehouses.form.name")} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      className={fieldErrors.name ? "border-destructive" : ""}
                    />
                    {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                  </div>
                  <div>
                    <Label htmlFor="code">{t("warehouses.form.code")} *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      required
                      className={fieldErrors.code ? "border-destructive" : ""}
                    />
                    {fieldErrors.code && <p className="text-xs text-destructive">{fieldErrors.code}</p>}
                  </div>
                </div>
                <div>
                  <Label htmlFor="address">{t("warehouses.form.address")}</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">{t("warehouses.form.city")}</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">{t("warehouses.form.postalCode")}</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code}
                      onChange={(e) =>
                        setFormData({ ...formData, postal_code: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">{t("warehouses.form.country")}</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) =>
                        setFormData({ ...formData, country: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="manager_name">{t("warehouses.form.manager")}</Label>
                    <Input
                      id="manager_name"
                      value={formData.manager_name}
                      onChange={(e) =>
                        setFormData({ ...formData, manager_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="capacity">{t("warehouses.form.capacity")}</Label>
                    <Input
                      id="capacity"
                      type="number"
                      value={formData.capacity}
                      onChange={(e) =>
                        setFormData({ ...formData, capacity: e.target.value })
                      }
                      className={fieldErrors.capacity ? "border-destructive" : ""}
                    />
                    {fieldErrors.capacity && <p className="text-xs text-destructive">{fieldErrors.capacity}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">{t("warehouses.form.phone")}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">{t("warehouses.form.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className={fieldErrors.email ? "border-destructive" : ""}
                    />
                    {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">
                    {t("warehouses.form.active")}
                  </Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {t("warehouses.form.cancel")}
                  </Button>
                  <Button type="submit">
                    {editingWarehouse ? t("warehouses.form.update") : t("warehouses.form.create")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </>
          }
        />

        <InventorySettingsCard organizationId={activeCompany.id} />

        {warehouses.length === 0 ? (
          <InventoryEmptyState
            icon={Warehouse}
            title={showDeleted ? "Sem armazéns eliminados" : "Sem armazéns"}
            description={showDeleted ? undefined : t("warehouses.noWarehouses")}
          />
        ) : (
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {warehouses.map((warehouse) => {
              const deleted = !!warehouse.deleted_at;
              const stats = statsQuery.data?.[warehouse.id] ?? EMPTY_STATS;
              const statsReady = statsQuery.isSuccess;
              const switchId = `wh-active-${warehouse.id}`;
              const fields: ReadonlyArray<readonly [string, string | null]> = [
                ["Morada", warehouse.address],
                ["Código postal", warehouse.postal_code],
                ["Cidade", warehouse.city],
                ["País", warehouse.country],
                ["Gestor", warehouse.manager_name],
                ["Telefone", warehouse.phone],
                ["Email", warehouse.email],
                ["Capacidade", warehouse.capacity ? `${warehouse.capacity} m³` : null],
              ];
              const movementBlockedReason = deleted
                ? "Armazém eliminado: restaure-o no menu ⋯"
                : movementGate.reason;
              return (
                <article
                  key={warehouse.id}
                  aria-labelledby={`wh-name-${warehouse.id}`}
                  className={cn(
                    "flex flex-col gap-2.5 rounded-lg border bg-card p-4 shadow-sm",
                    deleted && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 id={`wh-name-${warehouse.id}`} className="truncate text-base font-semibold">
                        {warehouse.name}
                      </h3>
                      <small className="font-mono text-xs text-muted-foreground">{warehouse.code}</small>
                    </div>
                    <RowActions
                      menuLabel={`Mais ações para ${warehouse.name}`}
                      items={[
                        {
                          label: "Editar",
                          icon: Pencil,
                          permission: "warehouses.edit",
                          disabled: deleted,
                          disabledReason: "Armazém eliminado",
                          onSelect: () => openEditDialog(warehouse),
                        },
                        {
                          label: "Movimentos recentes",
                          icon: History,
                          onSelect: () => {
                            setHistoryWarehouse({ id: warehouse.id, name: warehouse.name });
                            setHistoryDialogOpen(true);
                            loadWarehouseHistory(warehouse.id);
                          },
                        },
                        "separator",
                        deleted
                          ? {
                              label: t("warehouses.restore") || "Restaurar",
                              icon: Undo2,
                              permission: "warehouses.delete",
                              onSelect: () => handleRestore(warehouse.id),
                            }
                          : {
                              label: "Eliminar",
                              icon: Trash2,
                              destructive: true,
                              permission: "warehouses.delete",
                              onSelect: () => setDeleteTarget(warehouse),
                            },
                      ]}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {deleted ? (
                      <InventoryStatusBadge tone="neutral">Eliminado</InventoryStatusBadge>
                    ) : (
                      <div className="flex items-center gap-2" title={editGate.reason}>
                        <Switch
                          id={switchId}
                          checked={warehouse.is_active}
                          disabled={!editGate.allowed || togglingId === warehouse.id}
                          onCheckedChange={(next) =>
                            next ? handleToggleActive(warehouse, true) : setDeactivateTarget(warehouse)
                          }
                        />
                        <Label htmlFor={switchId} className="text-sm font-normal">
                          {t("warehouses.form.active")}
                        </Label>
                      </div>
                    )}
                    {defaultWarehouseId === warehouse.id ? (
                      <InventoryStatusBadge tone="info">Por defeito</InventoryStatusBadge>
                    ) : null}
                  </div>

                  <dl className="grid gap-x-3 gap-y-1.5 text-[13px] [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                    {fields.map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="break-words">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-muted p-2">
                      <b className="block text-base tabular-nums">{statsReady ? stats.products : "…"}</b>
                      <span className="text-[11.5px] text-muted-foreground">produtos</span>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <b className="block text-base tabular-nums">
                        {!canViewCost ? "—" : statsReady ? formatEur(stats.value) : "…"}
                      </b>
                      <span className="text-[11.5px] text-muted-foreground">valor</span>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <b
                        className={cn(
                          "block text-base tabular-nums",
                          statsReady && (stats.belowReorder ? toneText.bad : toneText.ok),
                        )}
                      >
                        {statsReady ? stats.belowReorder : "…"}
                      </b>
                      <span className="text-[11.5px] text-muted-foreground">abaixo do ponto de encomenda</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button asChild variant="outline" size="sm">
                      <Link to={stocksLink({ warehouse: warehouse.id })}>Ver existências</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={stockMovementsLink({ warehouse: warehouse.id })}>Movimentos</Link>
                    </Button>
                    <span title={movementBlockedReason}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleted || !movementGate.allowed}
                        onClick={() => {
                          setMovementWarehouseId(warehouse.id);
                          setMovementDialogOpen(true);
                        }}
                      >
                        <ArrowLeftRight className="w-4 h-4 mr-1.5" />
                        Registar movimento
                      </Button>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {deleteTarget?.name}</AlertDialogTitle>
            <AlertDialogDescription>{t("warehouses.delete.confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("warehouses.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>O armazém deixa de aparecer nas escolhas de armazém. O stock e o histórico mantêm-se.</p>
                {deactivateTarget && defaultWarehouseId === deactivateTarget.id ? (
                  <p className="font-medium text-foreground">
                    Este é o armazém por defeito da organização. Escolha outro em Definições do inventário.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("warehouses.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deactivateTarget) handleToggleActive(deactivateTarget, false);
                setDeactivateTarget(null);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StockMovementDialog
        open={movementDialogOpen}
        onOpenChange={setMovementDialogOpen}
        organizationId={activeCompany.id}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        defaultWarehouseId={movementWarehouseId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["warehouses-stock-stats"] });
          queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(activeCompany.id) });
          // Só recarrega o histórico se for do mesmo armazém já aberto no diálogo.
          if (movementWarehouseId && historyWarehouse?.id === movementWarehouseId) {
            loadWarehouseHistory(movementWarehouseId);
          }
        }}
      />

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Movimentos recentes{historyWarehouse ? ` — ${historyWarehouse.name}` : ""}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Saldo depois</TableHead>
                <TableHead>Documento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">A carregar...</TableCell></TableRow>
              ) : historyRows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem movimentos registados ainda.</TableCell></TableRow>
              ) : (
                historyRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.created_at).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{row.products?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={INCREASING_TYPES.has(row.movement_type) ? "default" : "outline"}>
                        {MOVEMENT_TYPE_LABELS[row.movement_type] || row.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {INCREASING_TYPES.has(row.movement_type) ? "+" : "-"}{row.quantity}
                    </TableCell>
                    <TableCell className="text-right">{row.balance_after}</TableCell>
                    <TableCell className="font-mono text-xs">{row.document_number}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Warehouses;
