import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter, Truck, Download, Upload, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { exportVehiclesToCSV, parseVehiclesCSV } from "./vehiclesExportImport";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";

interface Vehicle {
  id: string;
  license_plate: string;
  brand: string;
  model: string;
  year: number;
  vehicle_type: string;
  status: string;
  current_odometer: number;
  company_id: string;
  vin?: string | null;
  companies?: { name: string };
}

export default function Vehicles() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    license_plate: "",
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    vehicle_type: "light",
    status: "active",
    company_id: "",
    vin: "",
    current_odometer: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [vehiclesRes, companiesRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select(`
            *,
            companies(name)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("companies").select("id, name").order("name"),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (companiesRes.error) throw companiesRes.error;

      setVehicles(vehiclesRes.data || []);
      setCompanies(companiesRes.data || []);
    } catch (error: any) {
      toast({
        title: t('vehicles.toast.loadError'),
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

      if (editingVehicle) {
        // Update existing vehicle
        const { error } = await supabase
          .from("vehicles")
          .update({
            license_plate: formData.license_plate,
            brand: formData.brand,
            model: formData.model,
            year: formData.year,
            vehicle_type: formData.vehicle_type as "light" | "heavy" | "electric" | "hybrid" | "van" | "truck" | "bus" | "motorcycle",
            status: formData.status as "active" | "inactive" | "maintenance" | "sold",
            company_id: formData.company_id,
            vin: formData.vin || null,
            current_odometer: formData.current_odometer,
          })
          .eq("id", editingVehicle.id);

        if (error) throw error;

        toast({
          title: t('vehicles.toast.updateSuccess'),
        });
      } else {
        // Create new vehicle
        const { error } = await supabase.from("vehicles").insert([
          {
            license_plate: formData.license_plate,
            brand: formData.brand,
            model: formData.model,
            year: formData.year,
            vehicle_type: formData.vehicle_type as "light" | "heavy" | "electric" | "hybrid" | "van" | "truck" | "bus" | "motorcycle",
            status: formData.status as "active" | "inactive" | "maintenance" | "sold",
            company_id: formData.company_id,
            vin: formData.vin || null,
            current_odometer: formData.current_odometer,
            created_by: user.id,
          },
        ]);

        if (error) throw error;

        toast({
          title: t('vehicles.toast.createSuccess'),
        });
      }

      setDialogOpen(false);
      setEditingVehicle(null);
      setFormData({
        license_plate: "",
        brand: "",
        model: "",
        year: new Date().getFullYear(),
        vehicle_type: "light",
        status: "active",
        company_id: "",
        vin: "",
        current_odometer: 0,
      });
      loadData();
    } catch (error: any) {
      toast({
        title: t('vehicles.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!vehicleToDelete) return;

    try {
      const { error } = await supabase.from("vehicles").delete().eq("id", vehicleToDelete.id);

      if (error) throw error;

      toast({
        title: t('vehicles.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('vehicles.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setVehicleToDelete(null);
    }
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      license_plate: vehicle.license_plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      vehicle_type: vehicle.vehicle_type,
      status: vehicle.status,
      company_id: vehicle.company_id,
      vin: vehicle.vin || "",
      current_odometer: vehicle.current_odometer,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingVehicle(null);
    setFormData({
      license_plate: "",
      brand: "",
      model: "",
      year: new Date().getFullYear(),
      vehicle_type: "light",
      status: "active",
      company_id: "",
      vin: "",
      current_odometer: 0,
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-500",
      inactive: "bg-gray-500",
      maintenance: "bg-yellow-500",
      sold: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: t('vehicles.status.active'),
      inactive: t('vehicles.status.inactive'),
      maintenance: t('vehicles.status.maintenance'),
      sold: t('vehicles.status.sold'),
    };
    return labels[status] || status;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      light: t('vehicles.type.light'),
      heavy: t('vehicles.type.heavy'),
      van: t('vehicles.type.van'),
      truck: t('vehicles.type.truck'),
      bus: t('vehicles.type.bus'),
      motorcycle: t('vehicles.type.motorcycle'),
      electric: t('vehicles.type.electric'),
      hybrid: t('vehicles.type.hybrid'),
    };
    return labels[type] || type;
  };

  const handleExport = () => {
    if (vehicles.length === 0) {
      toast({
        title: t('vehicles.toast.exportNoData'),
        description: t('vehicles.toast.exportNoDataDesc'),
        variant: "destructive",
      });
      return;
    }
    exportVehiclesToCSV(vehicles);
    toast({
      title: t('vehicles.toast.exportSuccess'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const vehiclesToInsert = parseVehiclesCSV(text, companies, user.id);

      if (vehiclesToInsert.length === 0) {
        throw new Error(t('vehicles.toast.noValidVehicles'));
      }

      const { error } = await supabase.from("vehicles").insert(vehiclesToInsert);

      if (error) throw error;

      toast({
        title: t('vehicles.toast.importSuccess', { count: vehiclesToInsert.length }),
      });

      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('vehicles.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  const filteredVehicles = vehicles.filter((vehicle) =>
    vehicle.license_plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('vehicles.title')}</h1>
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="vehicles.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('vehicles.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="vehicles.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('vehicles.import')}
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('vehicles.import.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="csv-upload">{t('vehicles.import.csvFile')}</Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('vehicles.import.description')}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="vehicles.create">
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('vehicles.addVehicle')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('vehicles.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline">
            <Filter className="w-4 h-4 mr-2" />
            {t('vehicles.filters')}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8">{t('vehicles.loading')}</div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('vehicles.table.licensePlate')}</TableHead>
                  <TableHead>{t('vehicles.table.brandModel')}</TableHead>
                  <TableHead>{t('vehicles.table.year')}</TableHead>
                  <TableHead>{t('vehicles.table.type')}</TableHead>
                  <TableHead>{t('vehicles.table.status')}</TableHead>
                  <TableHead>{t('vehicles.table.odometer')}</TableHead>
                  <TableHead>{t('vehicles.table.company')}</TableHead>
                  <TableHead className="text-right">{t('vehicles.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t('vehicles.noVehicles')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-medium">{vehicle.license_plate}</TableCell>
                      <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                      <TableCell>{vehicle.year}</TableCell>
                      <TableCell>{getTypeLabel(vehicle.vehicle_type)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(vehicle.status)}>
                          {getStatusLabel(vehicle.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{vehicle.current_odometer.toLocaleString()} km</TableCell>
                      <TableCell>{vehicle.companies?.name || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="vehicles.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(vehicle)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="vehicles.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(vehicle)}
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
        )}

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingVehicle ? t('vehicles.editVehicle') : t('vehicles.addVehicle')}</DialogTitle>
              <DialogDescription>
                {editingVehicle ? t('vehicles.form.editDescription') : t('vehicles.form.addDescription')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license_plate">{t('vehicles.form.licensePlate')} *</Label>
                  <Input
                    id="license_plate"
                    value={formData.license_plate}
                    onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vin">{t('vehicles.form.vin')}</Label>
                  <Input
                    id="vin"
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand">{t('vehicles.form.brand')} *</Label>
                  <Input
                    id="brand"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">{t('vehicles.form.model')} *</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year">{t('vehicles.form.year')}</Label>
                  <Input
                    id="year"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicle_type">{t('vehicles.form.vehicleType')}</Label>
                  <Select
                    value={formData.vehicle_type}
                    onValueChange={(value) => setFormData({ ...formData, vehicle_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">{t('vehicles.type.light')}</SelectItem>
                      <SelectItem value="heavy">{t('vehicles.type.heavy')}</SelectItem>
                      <SelectItem value="van">{t('vehicles.type.van')}</SelectItem>
                      <SelectItem value="truck">{t('vehicles.type.truck')}</SelectItem>
                      <SelectItem value="bus">{t('vehicles.type.bus')}</SelectItem>
                      <SelectItem value="motorcycle">{t('vehicles.type.motorcycle')}</SelectItem>
                      <SelectItem value="electric">{t('vehicles.type.electric')}</SelectItem>
                      <SelectItem value="hybrid">{t('vehicles.type.hybrid')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">{t('vehicles.form.status')}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('vehicles.status.active')}</SelectItem>
                      <SelectItem value="inactive">{t('vehicles.status.inactive')}</SelectItem>
                      <SelectItem value="maintenance">{t('vehicles.status.maintenance')}</SelectItem>
                      <SelectItem value="sold">{t('vehicles.status.sold')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_id">{t('vehicles.form.company')} *</Label>
                  <Select
                    value={formData.company_id}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('vehicles.form.selectCompany')} />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current_odometer">{t('vehicles.form.odometer')}</Label>
                  <Input
                    id="current_odometer"
                    type="number"
                    value={formData.current_odometer}
                    onChange={(e) => setFormData({ ...formData, current_odometer: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('vehicles.form.cancel')}
                </Button>
                <Button type="submit">{editingVehicle ? t('vehicles.form.update') : t('vehicles.form.create')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('vehicles.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('vehicles.delete.confirm', { plate: vehicleToDelete?.license_plate || '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setVehicleToDelete(null)}>{t('vehicles.delete.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-primary text-primary-foreground hover:bg-primary/90">{t('vehicles.delete.action')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
