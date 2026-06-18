import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, UserCircle, Download, Upload, Pencil, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { exportDriversToCSV, parseDriversCSV } from "./driversExportImport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";

interface Driver {
  employee_id: string;
  vehicle_id?: string;
  license_number: string;
  license_categories: string[];
  license_expiry: string;
  is_active: boolean;
  total_infractions: number;
  total_accidents: number;
  driving_score: number;
  full_name?: string;
  employee_number?: string;
  vehicle?: {
    license_plate?: string;
    brand?: string;
    model?: string;
  };
}

export default function Drivers() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<string | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    employee_id: "",
    vehicle_id: "",
    license_number: "",
    license_categories: "B",
    license_expiry: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load driver info
      const { data: driverData, error: driversError } = await supabase
        .from("driver_info")
        .select("*")
        .order("created_at", { ascending: false });

      if (driversError) throw driversError;

      // Get employee IDs and vehicle IDs
      const employeeIds = driverData?.map(d => d.employee_id) || [];
      const vehicleIds = driverData?.map(d => d.vehicle_id).filter(Boolean) || [];

      const [employeesRes, employeesListRes, vehiclesRes, vehiclesListRes] = await Promise.all([
        employeeIds.length > 0
          ? supabase.from("employees").select("id, first_name, last_name, employee_number").in("id", employeeIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("employees").select("id, first_name, last_name, employee_number").order("first_name"),
        vehicleIds.length > 0
          ? supabase.from("vehicles").select("id, license_plate, brand, model").in("id", vehicleIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("vehicles").select("id, license_plate, brand, model").order("license_plate"),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (employeesListRes.error) throw employeesListRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (vehiclesListRes.error) throw vehiclesListRes.error;

      // Create maps for merging
      const employeesMap = new Map();
      employeesRes.data?.forEach(e => {
        if (e.id) employeesMap.set(e.id, e);
      });

      const vehiclesMap = new Map();
      vehiclesRes.data?.forEach(v => {
        if (v.id) vehiclesMap.set(v.id, v);
      });
      
      const driversWithDetails = driverData?.map(d => {
        const employee = employeesMap.get(d.employee_id);
        const vehicle = d.vehicle_id ? vehiclesMap.get(d.vehicle_id) : null;
        return {
          ...d,
          full_name: employee ? `${employee.first_name} ${employee.last_name}` : null,
          employee_number: employee?.employee_number || null,
          vehicle: vehicle ? {
            license_plate: vehicle.license_plate,
            brand: vehicle.brand,
            model: vehicle.model,
          } : undefined,
        };
      }) || [];

      setDrivers(driversWithDetails as Driver[]);
      setEmployees(employeesListRes.data || []);
      setVehicles(vehiclesListRes.data || []);
    } catch (error: any) {
      toast({
        title: t('drivers.toast.loadError'),
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
      const categories = formData.license_categories.split(",").map(c => c.trim());

      if (editingDriver) {
        // Update existing driver
        const { error } = await supabase
          .from("driver_info")
          .update({
            vehicle_id: formData.vehicle_id || null,
            license_number: formData.license_number,
            license_categories: categories,
            license_expiry: formData.license_expiry || null,
          })
          .eq("employee_id", editingDriver.employee_id);

        if (error) throw error;

        toast({
          title: t('drivers.toast.updateSuccess'),
        });
      } else {
        // Create new driver
        const { error } = await supabase.from("driver_info").insert([
          {
            employee_id: formData.employee_id,
            vehicle_id: formData.vehicle_id || null,
            license_number: formData.license_number,
            license_categories: categories,
            license_expiry: formData.license_expiry || null,
          },
        ]);

        if (error) throw error;

        toast({
          title: t('drivers.toast.createSuccess'),
        });
      }

      setDialogOpen(false);
      setEditingDriver(null);
      setFormData({
        employee_id: "",
        vehicle_id: "",
        license_number: "",
        license_categories: "B",
        license_expiry: "",
      });
      loadData();
    } catch (error: any) {
      toast({
        title: t('drivers.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!driverToDelete) return;

    try {
      const { error } = await supabase
        .from("driver_info")
        .delete()
        .eq("employee_id", driverToDelete);

      if (error) throw error;

      toast({
        title: t('drivers.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('drivers.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDriverToDelete(null);
    }
  };

  const openEditDialog = (driver: Driver) => {
    setEditingDriver(driver);
    setFormData({
      employee_id: driver.employee_id,
      vehicle_id: driver.vehicle_id || "",
      license_number: driver.license_number,
      license_categories: driver.license_categories?.join(", ") || "B",
      license_expiry: driver.license_expiry || "",
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingDriver(null);
    setFormData({
      employee_id: "",
      vehicle_id: "",
      license_number: "",
      license_categories: "B",
      license_expiry: "",
    });
  };

  const filteredDrivers = drivers.filter((driver) =>
    driver.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.employee_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.license_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.vehicle?.license_plate?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    if (drivers.length === 0) {
      toast({
        title: t('drivers.toast.exportNoData'),
        description: t('drivers.toast.exportNoDataDesc'),
        variant: "destructive",
      });
      return;
    }
    exportDriversToCSV(drivers);
    toast({
      title: t('drivers.toast.exportSuccess'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();

      const driversToInsert = parseDriversCSV(text, employees, vehicles);

      if (driversToInsert.length === 0) {
        throw new Error(t('drivers.toast.noValidDrivers'));
      }

      const { error } = await supabase.from("driver_info").insert(driversToInsert);

      if (error) throw error;

      toast({
        title: t('drivers.toast.importSuccess', { count: driversToInsert.length }),
      });

      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('drivers.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UserCircle className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('drivers.title')}</h1>
              <p className="text-muted-foreground">{t('drivers.description')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="drivers.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('drivers.actions.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="drivers.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('drivers.actions.import')}
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('drivers.import.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="csv-upload">{t('drivers.import.csvFile')}</Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('drivers.import.description')}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="drivers.create">
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('drivers.addDriver')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('drivers.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('drivers.table.employee')}</TableHead>
                  <TableHead>{t('drivers.table.vehicle')}</TableHead>
                  <TableHead>{t('drivers.table.licenseNumber')}</TableHead>
                  <TableHead>{t('drivers.table.categories')}</TableHead>
                  <TableHead>{t('drivers.table.expiry')}</TableHead>
                  <TableHead>{t('drivers.table.score')}</TableHead>
                  <TableHead>{t('drivers.table.infractions')}</TableHead>
                  <TableHead>{t('drivers.table.status')}</TableHead>
                  <TableHead className="text-right">{t('drivers.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t('drivers.noDrivers')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDrivers.map((driver) => (
                    <TableRow key={driver.employee_id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {driver.full_name || "Unknown"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {driver.employee_number || "N/A"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {driver.vehicle ? (
                          <div>
                            <div className="font-medium">{driver.vehicle.license_plate}</div>
                            <div className="text-sm text-muted-foreground">
                              {driver.vehicle.brand} {driver.vehicle.model}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{driver.license_number}</TableCell>
                      <TableCell>
                        {driver.license_categories?.join(", ") || "-"}
                      </TableCell>
                      <TableCell>
                        {driver.license_expiry || "-"}
                      </TableCell>
                      <TableCell>
                        {driver.driving_score ? (
                          <Badge variant={driver.driving_score >= 80 ? "default" : driver.driving_score >= 60 ? "secondary" : "destructive"}>
                            {driver.driving_score}/100
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={driver.total_infractions === 0 ? "default" : "destructive"}>
                          {driver.total_infractions}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={driver.is_active ? "default" : "secondary"}>
                          {driver.is_active ? t('drivers.status.active') : t('drivers.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="drivers.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(driver)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="drivers.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDriverToDelete(driver.employee_id);
                                setDeleteDialogOpen(true);
                              }}
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

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { resetForm(); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingDriver ? t('drivers.editDriver') : t('drivers.addDriver')}</DialogTitle>
              <DialogDescription>
                {editingDriver ? t('drivers.editDescription') : t('drivers.addDescription')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="employee_id">{t('drivers.form.employee')} *</Label>
                  <Select
                    value={formData.employee_id}
                    onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
                    disabled={!!editingDriver}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('drivers.form.selectEmployee')} />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name} - {employee.employee_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="vehicle_id">{t('drivers.form.vehicle')}</Label>
                  <Select
                    value={formData.vehicle_id}
                    onValueChange={(value) => setFormData({ ...formData, vehicle_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('drivers.form.selectVehicle')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('drivers.form.selectVehicle')}</SelectItem>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.license_plate} - {vehicle.brand} {vehicle.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="license_number">{t('drivers.form.licenseNumber')} *</Label>
                  <Input
                    id="license_number"
                    value={formData.license_number}
                    onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="license_categories">{t('drivers.form.licenseCategories')} *</Label>
                  <Input
                    id="license_categories"
                    value={formData.license_categories}
                    onChange={(e) => setFormData({ ...formData, license_categories: e.target.value })}
                    placeholder="B, C, D"
                    required
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="license_expiry">{t('drivers.form.licenseExpiry')}</Label>
                  <Input
                    id="license_expiry"
                    type="date"
                    value={formData.license_expiry}
                    onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('drivers.form.cancel')}
                </Button>
                <Button type="submit">{editingDriver ? t('drivers.form.update') : t('drivers.form.add')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('drivers.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('drivers.delete.confirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDriverToDelete(null)}>
                {t('drivers.delete.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('drivers.delete.action')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
