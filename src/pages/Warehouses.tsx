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
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Plus, Pencil, Trash2, Warehouse, MapPin, Download, Upload, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { exportWarehousesToCSV, parseWarehousesCSV } from "@/utils/warehousesExportImport";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

type WarehouseData = Database["public"]["Tables"]["warehouses"]["Row"];

const Warehouses = () => {
  const { toast } = useToast();
  const { loading: permissionsLoading, hasModuleAccess } = usePermissions();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const canView = hasModuleAccess("warehouses");
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseData | null>(null);
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

  useEffect(() => {
    if (activeCompany?.id) {
      fetchWarehouses();
    }
  }, [activeCompany?.id]);

  const fetchWarehouses = async () => {
    if (!activeCompany?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false });

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
        const { error } = await supabase
          .from("warehouses")
          .update({
            ...warehouseData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingWarehouse.id);

        if (error) throw error;

        toast({
          title: t("warehouses.toast.updateSuccess"),
        });
      } else {
        if (!activeCompany?.id) throw new Error("No active company selected");
        
        const { error } = await supabase.from("warehouses").insert([
          {
            ...warehouseData,
            organization_id: activeCompany.id,
            created_by: businessUserId,
          },
        ]);

        if (error) throw error;

        toast({
          title: t("warehouses.toast.createSuccess"),
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchWarehouses();
    } catch (error: any) {
      toast({
        title: t("warehouses.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("warehouses.delete.confirm"))) return;

    try {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: t("warehouses.toast.deleteSuccess"),
      });

      fetchWarehouses();
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

      const { error } = await supabase.from("warehouses").insert(warehousesToInsert);

      if (error) throw error;

      toast({
        title: t("warehouses.toast.importSuccess").replace("{count}", String(warehousesToInsert.length)),
      });

      setImportDialogOpen(false);
      fetchWarehouses();
    } catch (error: any) {
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
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t("warehouses.title")}</h1><p className="text-muted-foreground">{t("warehouses.description")}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (loading || permissionsLoading) {
    return (
      <>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">{t("warehouses.title")}</h1>
              <p className="text-muted-foreground">{t("warehouses.description")}</p>
            </div>
          </div>
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t("warehouses.title")}</h1>
            <p className="text-muted-foreground">
              {t("warehouses.description")}
            </p>
          </div>
          <div className="flex gap-2">
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
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("warehouses.addWarehouse")}
                  </Button>
                </DialogTrigger>
              </Dialog>
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
                    />
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
                    />
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
                    />
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
                    />
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
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("warehouses.table.name")}</TableHead>
                <TableHead>{t("warehouses.table.code")}</TableHead>
                <TableHead>{t("warehouses.table.location")}</TableHead>
                <TableHead>{t("warehouses.table.manager")}</TableHead>
                <TableHead>{t("warehouses.table.contact")}</TableHead>
                <TableHead className="text-right">{t("warehouses.table.capacity")}</TableHead>
                <TableHead>{t("warehouses.table.status")}</TableHead>
                <TableHead className="text-right">{t("warehouses.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    {t("warehouses.noWarehouses")}
                  </TableCell>
                </TableRow>
              ) : (
                warehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Warehouse className="w-4 h-4 text-muted-foreground" />
                        {warehouse.name}
                      </div>
                    </TableCell>
                    <TableCell>{warehouse.code}</TableCell>
                    <TableCell>
                      {warehouse.city && warehouse.country ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="w-3 h-3" />
                          {warehouse.city}, {warehouse.country}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{warehouse.manager_name || "-"}</TableCell>
                    <TableCell>
                      {warehouse.phone || warehouse.email ? (
                        <div className="text-sm">
                          {warehouse.phone && <div>{warehouse.phone}</div>}
                          {warehouse.email && <div>{warehouse.email}</div>}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {warehouse.capacity ? `${warehouse.capacity} m³` : "-"}
                    </TableCell>
                    <TableCell>
                      {warehouse.is_active ? (
                        <Badge variant="default">{t("warehouses.status.active")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("warehouses.status.inactive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="warehouses.edit">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(warehouse)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="warehouses.delete">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(warehouse.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
};

export default Warehouses;
