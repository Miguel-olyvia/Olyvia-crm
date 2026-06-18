import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter, Package, Download, Upload, Pencil, Trash2 } from "lucide-react";
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
import { exportAssetsToCSV, parseAssetsCSV } from "./assetsExportImport";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";

interface Asset {
  id: string;
  asset_code: string;
  name: string;
  description: string;
  status: string;
  manufacturer: string;
  model: string;
  serial_number?: string;
  acquisition_cost: number;
  current_value: number;
  acquisition_date?: string;
  useful_life_years?: number;
  company_id?: string;
  location_id?: string;
  category_id?: string;
  companies?: { name: string };
  locations?: { name: string };
  asset_categories?: { name: string };
}

const initialFormData = {
  asset_code: "",
  name: "",
  description: "",
  company_id: "",
  location_id: "",
  category_id: "",
  manufacturer: "",
  model: "",
  serial_number: "",
  status: "active",
  acquisition_cost: 0,
  acquisition_date: "",
  useful_life_years: 10,
};

export default function Assets() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  // Edit states
  const [editOpen, setEditOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editFormData, setEditFormData] = useState(initialFormData);

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      active: t('assets.status.active'),
      maintenance: t('assets.status.maintenance'),
      inactive: t('assets.status.inactive'),
      decommissioned: t('assets.status.decommissioned'),
      planned_disposal: t('assets.status.plannedDisposal'),
    };
    return statusMap[status] || status;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [assetsRes, companiesRes, locationsRes, categoriesRes] = await Promise.all([
        supabase
          .from("assets")
          .select(`
            *,
            companies(name),
            locations(name),
            asset_categories(name)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("locations").select("id, name, location_type").eq("is_active", true).order("name"),
        supabase.from("asset_categories").select("id, name").order("name"),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (locationsRes.error) throw locationsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setAssets(assetsRes.data || []);
      setCompanies(companiesRes.data || []);
      setLocations(locationsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error: any) {
      toast({
        title: t('assets.toast.loadError'),
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

      const { error } = await supabase.from("assets").insert([
        {
          asset_code: formData.asset_code,
          name: formData.name,
          description: formData.description || null,
          company_id: formData.company_id,
          location_id: formData.location_id || null,
          category_id: formData.category_id || null,
          manufacturer: formData.manufacturer || null,
          model: formData.model || null,
          serial_number: formData.serial_number || null,
          status: formData.status as "active" | "maintenance" | "inactive" | "decommissioned" | "planned_disposal",
          acquisition_cost: formData.acquisition_cost || null,
          acquisition_date: formData.acquisition_date || null,
          useful_life_years: formData.useful_life_years || null,
          created_by: user.id,
        },
      ]);

      if (error) throw error;

      toast({
        title: t('assets.toast.createSuccess'),
      });

      setDialogOpen(false);
      setFormData(initialFormData);
      loadData();
    } catch (error: any) {
      toast({
        title: t('assets.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditClick = (asset: Asset) => {
    setEditingAsset(asset);
    setEditFormData({
      asset_code: asset.asset_code || "",
      name: asset.name || "",
      description: asset.description || "",
      company_id: asset.company_id || "",
      location_id: asset.location_id || "",
      category_id: asset.category_id || "",
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      serial_number: asset.serial_number || "",
      status: asset.status || "active",
      acquisition_cost: asset.acquisition_cost || 0,
      acquisition_date: asset.acquisition_date || "",
      useful_life_years: asset.useful_life_years || 10,
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset) return;

    try {
      const { error } = await supabase
        .from("assets")
        .update({
          asset_code: editFormData.asset_code,
          name: editFormData.name,
          description: editFormData.description || null,
          company_id: editFormData.company_id || null,
          location_id: editFormData.location_id || null,
          category_id: editFormData.category_id || null,
          manufacturer: editFormData.manufacturer || null,
          model: editFormData.model || null,
          serial_number: editFormData.serial_number || null,
          status: editFormData.status as "active" | "maintenance" | "inactive" | "decommissioned" | "planned_disposal",
          acquisition_cost: editFormData.acquisition_cost || null,
          acquisition_date: editFormData.acquisition_date || null,
          useful_life_years: editFormData.useful_life_years || null,
        })
        .eq("id", editingAsset.id);

      if (error) throw error;

      toast({
        title: t('assets.toast.updateSuccess'),
      });

      setEditOpen(false);
      setEditingAsset(null);
      loadData();
    } catch (error: any) {
      toast({
        title: t('assets.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (asset: Asset) => {
    setAssetToDelete(asset);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!assetToDelete) return;

    try {
      const { error } = await supabase
        .from("assets")
        .delete()
        .eq("id", assetToDelete.id);

      if (error) throw error;

      toast({
        title: t('assets.toast.deleteSuccess'),
      });

      setDeleteDialogOpen(false);
      setAssetToDelete(null);
      loadData();
    } catch (error: any) {
      toast({
        title: t('assets.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-500",
      maintenance: "bg-yellow-500",
      inactive: "bg-gray-500",
      decommissioned: "bg-red-500",
      planned_disposal: "bg-orange-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const handleExport = () => {
    if (assets.length === 0) {
      toast({
        title: t('assets.export.noData'),
        description: t('assets.export.noAssets'),
        variant: "destructive",
      });
      return;
    }
    exportAssetsToCSV(assets);
    toast({
      title: t('assets.export.success'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const assetsToInsert = parseAssetsCSV(text, companies, locations, categories, user.id);

      if (assetsToInsert.length === 0) {
        throw new Error(t('assets.import.noValidAssets'));
      }

      const { error } = await supabase.from("assets").insert(assetsToInsert);

      if (error) throw error;

      toast({
        title: t('assets.import.success', { count: assetsToInsert.length }),
      });

      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('assets.import.error'),
        description: error.message,
        variant: "destructive",
      });
    }

    e.target.value = "";
  };

  const filteredAssets = assets.filter((asset) =>
    asset.asset_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('assets.title')}</h1>
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="assets.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('common.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="assets.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('common.import')}
                </Button>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('assets.import.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="csv-upload">{t('assets.import.csvFile')}</Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        onChange={handleImport}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('assets.import.description')}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="assets.create">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('assets.addAsset')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('assets.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline">
            <Filter className="w-4 h-4 mr-2" />
            {t('assets.filters')}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assets.table.code')}</TableHead>
                  <TableHead>{t('assets.table.name')}</TableHead>
                  <TableHead>{t('assets.table.category')}</TableHead>
                  <TableHead>{t('assets.table.manufacturer')}</TableHead>
                  <TableHead>{t('assets.table.location')}</TableHead>
                  <TableHead>{t('assets.table.status')}</TableHead>
                  <TableHead>{t('assets.table.value')}</TableHead>
                  <TableHead>{t('assets.table.company')}</TableHead>
                  <TableHead className="w-[100px]">{t('assets.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t('assets.noAssets')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{asset.asset_code}</TableCell>
                      <TableCell>{asset.name}</TableCell>
                      <TableCell>{asset.asset_categories?.name || "-"}</TableCell>
                      <TableCell>{asset.manufacturer || "-"}</TableCell>
                      <TableCell>{asset.locations?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(asset.status)}>
                          {getStatusLabel(asset.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {asset.current_value ? `€${asset.current_value.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>{asset.companies?.name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <PermissionGate permission="assets.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(asset)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="assets.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(asset)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('assets.addAsset')}</DialogTitle>
              <DialogDescription>
                {t('assets.registerAsset')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="asset_code">{t('assets.form.assetCode')} *</Label>
                  <Input
                    id="asset_code"
                    value={formData.asset_code}
                    onChange={(e) => setFormData({ ...formData, asset_code: e.target.value })}
                    placeholder="AST-001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('assets.form.name')} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="description">{t('assets.form.description')}</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_id">{t('assets.form.company')} *</Label>
                  <Select
                    value={formData.company_id}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectCompany')} />
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
                  <Label htmlFor="category_id">{t('assets.form.category')}</Label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location_id">{t('assets.form.location')}</Label>
                  <Select
                    value={formData.location_id}
                    onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectLocation')} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} ({location.location_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manufacturer">{t('assets.form.manufacturer')}</Label>
                  <Input
                    id="manufacturer"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">{t('assets.form.model')}</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serial_number">{t('assets.form.serialNumber')}</Label>
                  <Input
                    id="serial_number"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">{t('assets.form.status')}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('assets.status.active')}</SelectItem>
                      <SelectItem value="maintenance">{t('assets.status.maintenance')}</SelectItem>
                      <SelectItem value="inactive">{t('assets.status.inactive')}</SelectItem>
                      <SelectItem value="decommissioned">{t('assets.status.decommissioned')}</SelectItem>
                      <SelectItem value="planned_disposal">{t('assets.status.plannedDisposal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acquisition_cost">{t('assets.form.acquisitionCost')}</Label>
                  <Input
                    id="acquisition_cost"
                    type="number"
                    step="0.01"
                    value={formData.acquisition_cost}
                    onChange={(e) => setFormData({ ...formData, acquisition_cost: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acquisition_date">{t('assets.form.acquisitionDate')}</Label>
                  <Input
                    id="acquisition_date"
                    type="date"
                    value={formData.acquisition_date}
                    onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="useful_life_years">{t('assets.form.usefulLife')}</Label>
                  <Input
                    id="useful_life_years"
                    type="number"
                    value={formData.useful_life_years}
                    onChange={(e) => setFormData({ ...formData, useful_life_years: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">{t('assets.createAsset')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('assets.editAsset')}</DialogTitle>
              <DialogDescription>
                {t('assets.updateAsset')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_asset_code">{t('assets.form.assetCode')} *</Label>
                  <Input
                    id="edit_asset_code"
                    value={editFormData.asset_code}
                    onChange={(e) => setEditFormData({ ...editFormData, asset_code: e.target.value })}
                    placeholder="AST-001"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_name">{t('assets.form.name')} *</Label>
                  <Input
                    id="edit_name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="edit_description">{t('assets.form.description')}</Label>
                  <Input
                    id="edit_description"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_company_id">{t('assets.form.company')}</Label>
                  <Select
                    value={editFormData.company_id}
                    onValueChange={(value) => setEditFormData({ ...editFormData, company_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectCompany')} />
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
                  <Label htmlFor="edit_category_id">{t('assets.form.category')}</Label>
                  <Select
                    value={editFormData.category_id}
                    onValueChange={(value) => setEditFormData({ ...editFormData, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_location_id">{t('assets.form.location')}</Label>
                  <Select
                    value={editFormData.location_id}
                    onValueChange={(value) => setEditFormData({ ...editFormData, location_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('assets.form.selectLocation')} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name} ({location.location_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_manufacturer">{t('assets.form.manufacturer')}</Label>
                  <Input
                    id="edit_manufacturer"
                    value={editFormData.manufacturer}
                    onChange={(e) => setEditFormData({ ...editFormData, manufacturer: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_model">{t('assets.form.model')}</Label>
                  <Input
                    id="edit_model"
                    value={editFormData.model}
                    onChange={(e) => setEditFormData({ ...editFormData, model: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_serial_number">{t('assets.form.serialNumber')}</Label>
                  <Input
                    id="edit_serial_number"
                    value={editFormData.serial_number}
                    onChange={(e) => setEditFormData({ ...editFormData, serial_number: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_status">{t('assets.form.status')}</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('assets.status.active')}</SelectItem>
                      <SelectItem value="maintenance">{t('assets.status.maintenance')}</SelectItem>
                      <SelectItem value="inactive">{t('assets.status.inactive')}</SelectItem>
                      <SelectItem value="decommissioned">{t('assets.status.decommissioned')}</SelectItem>
                      <SelectItem value="planned_disposal">{t('assets.status.plannedDisposal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_acquisition_cost">{t('assets.form.acquisitionCost')}</Label>
                  <Input
                    id="edit_acquisition_cost"
                    type="number"
                    step="0.01"
                    value={editFormData.acquisition_cost}
                    onChange={(e) => setEditFormData({ ...editFormData, acquisition_cost: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_acquisition_date">{t('assets.form.acquisitionDate')}</Label>
                  <Input
                    id="edit_acquisition_date"
                    type="date"
                    value={editFormData.acquisition_date}
                    onChange={(e) => setEditFormData({ ...editFormData, acquisition_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_useful_life_years">{t('assets.form.usefulLife')}</Label>
                  <Input
                    id="edit_useful_life_years"
                    type="number"
                    value={editFormData.useful_life_years}
                    onChange={(e) => setEditFormData({ ...editFormData, useful_life_years: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit">{t('assets.saveChanges')}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('assets.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('assets.delete.confirm', { name: assetToDelete?.name || '' })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
