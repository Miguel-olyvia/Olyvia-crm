import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Tags, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { OrganizationFilters } from "@/components/OrganizationFilters";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog, BulkOrgDialog } from "@/components/BulkActionDialogs";
import { useBulkActions } from "@/hooks/useBulkActions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  is_active: boolean;
  organization_id: string | null;
}

export default function Brands() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();
  const { hasPermission, loading: permissionsLoading, hasModuleAccess } = usePermissions();
  const canView = hasModuleAccess("brands");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteBrandId, setDeleteBrandId] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    website: "",
    logo_url: "",
  });
  
  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
    selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
    levelSelections: [],
  });

  // Filter states
  const [filterTenantId, setFilterTenantId] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const isAdmin = userType === 'system_admin' || userType === 'tenant_admin';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Get brand IDs associated with the active company via junction table
      let brandIdsToFilter: string[] = [];

      if (filterCompanyId && filterCompanyId !== "all") {
        const { data: brandOrgs } = await supabase
          .from("brand_organizations")
          .select("brand_id")
          .eq("organization_id", filterCompanyId);
        brandIdsToFilter = brandOrgs?.map((bc) => bc.brand_id) || [];
      } else if (activeCompany?.id) {
        // ALWAYS filter by activeCompany for all users including admins
        const { data: brandOrgs } = await supabase
          .from("brand_organizations")
          .select("brand_id")
          .eq("organization_id", activeCompany.id);
        brandIdsToFilter = brandOrgs?.map((bc) => bc.brand_id) || [];
      }

      if (brandIdsToFilter.length === 0) {
        setBrands([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("brands")
        .select("id, name, slug, description, logo_url, website, organization_id, is_active")
        .in("id", brandIdsToFilter)
        .order("name");

      if (filterStatus !== "all") {
        query = query.eq("is_active", filterStatus === "active");
      }

      const { data, error } = await query;

      if (error) throw error;
      setBrands(data || []);
    } catch (error: unknown) {
      toast({
        title: t('brands.toast.loadError'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, filterCompanyId, filterStatus, t, toast]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "brands",
    onSuccess: loadData,
    softDelete: false,
    organizationId: activeCompany?.id,
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('brands.toast.notAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const slug = formData.slug || generateSlug(formData.name);

      // Validate company selection - system_admin and tenant_admin can proceed without selection
      const allCompanyIds = organizationSelection.companyId
        ? [organizationSelection.companyId, ...organizationSelection.secondaryCompanyIds]
        : organizationSelection.secondaryCompanyIds;

      if (allCompanyIds.length === 0 && !isAdmin) {
        toast({
          title: t('common.error'),
          description: t('common.selectCompanies'),
          variant: "destructive",
        });
        return;
      }

      const brandPayload = {
        name: formData.name,
        slug,
        is_active: true,
        organization_id: activeCompany?.id ?? null,
        ...(formData.description ? { description: formData.description } : {}),
        ...(formData.website ? { website: formData.website } : {}),
        ...(formData.logo_url ? { logo_url: formData.logo_url } : {}),
      };

      let brandId: string;

      if (editingBrand) {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("brands")
            .update(brandPayload)
            .eq("id", editingBrand.id)
            .eq("organization_id", activeCompany.id);
          if (error) throw error;
        });
        brandId = editingBrand.id;

        toast({
          title: t('brands.toast.updateSuccess'),
        });
      } else {
        const insertPayload = { ...brandPayload, created_by: businessUserId };
        const newBrand = await withAuditContext(supabase, businessUserId, async () => {
          const { data, error } = await supabase
            .from("brands")
            .insert(insertPayload)
            .select("id")
            .single();
          if (error) throw error;
          return data;
        });
        brandId = newBrand.id;

        toast({
          title: t('brands.toast.createSuccess'),
        });
      }

      // Upsert company associations first, then remove stale ones.
      // Insert-before-delete prevents the brand from becoming org-orphaned
      // if the delete succeeds but the subsequent insert fails.
      // Both junction table operations share the same audit context window.
      if (allCompanyIds.length > 0) {
        const companyAssociations = allCompanyIds.map((companyId) => ({
          brand_id: brandId,
          organization_id: companyId,
          created_by: businessUserId,
        }));

        await withAuditContext(supabase, businessUserId, async () => {
          const { error: assocError } = await supabase
            .from("brand_organizations")
            .upsert(companyAssociations, { onConflict: "brand_id,organization_id", ignoreDuplicates: true });
          if (assocError) throw assocError;

          // Only delete associations NOT in the new set (safe because inserts already succeeded above)
          if (editingBrand) {
            const { error: delError } = await supabase
              .from("brand_organizations")
              .delete()
              .eq("brand_id", brandId)
              .not("organization_id", "in", `(${allCompanyIds.join(",")})`);
            if (delError) throw delError;
          }
        });
      } else if (editingBrand) {
        // No target companies — remove all associations
        await withAuditContext(supabase, businessUserId, async () => {
          const { error: delError } = await supabase
            .from("brand_organizations")
            .delete()
            .eq("brand_id", brandId);
          if (delError) throw delError;
        });
      }

      handleCloseDialog(false);
      loadData();
    } catch (error: unknown) {
      toast({
        title: editingBrand ? t('brands.toast.updateError') : t('brands.toast.createError'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteBrandId) return;
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      setDeleteBrandId(null);
      return;
    }

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase
          .from("brands")
          .delete()
          .eq("id", deleteBrandId)
          .eq("organization_id", activeCompany.id);
        if (error) throw error;
      });

      toast({
        title: t('brands.toast.success'),
        description: t('brands.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: unknown) {
      toast({
        title: t('brands.toast.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setDeleteBrandId(null);
    }
  };

  const openEditDialog = async (brand: Brand) => {
    // Fetch company associations
    const { data: companyAssocs } = await supabase
      .from("brand_organizations")
      .select("organization_id")
      .eq("brand_id", brand.id);

    const companyIds = companyAssocs?.map((a) => a.organization_id) || [];

    setEditingBrand(brand);
    setFormData({
      name: brand.name,
      slug: brand.slug,
      description: brand.description || "",
      website: brand.website || "",
      logo_url: brand.logo_url || "",
    });
    
    const primaryCompanyId = companyIds.length > 0 ? companyIds[0] : (activeCompany?.id || "");
    const secondaryIds = companyIds.slice(1);
    setOrganizationSelection({
      tenantId: "",
      companyId: primaryCompanyId,
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: secondaryIds,
      selectedCompanyIds: companyIds,
      levelSelections: [],
    });
    
    setOpen(true);
  };

  const resetForm = () => {
    setEditingBrand(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      website: "",
      logo_url: "",
    });
    setOrganizationSelection({
      tenantId: "",
      companyId: activeCompany?.id || "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
      levelSelections: [],
    });
  };

  const handleCloseDialog = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  const handleCancel = () => {
    handleCloseDialog(false);
  };

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    brand.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const allIds = filteredBrands.map(b => b.id);

  if (loading || permissionsLoading) {
    return (
      <>
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">{t('brands.loading')}</div>
          </div>
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <div className="p-8">
          <Card className="p-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">{t('brands.accessDenied')}</h2>
              <p className="text-muted-foreground">{t('brands.noPermission')}</p>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Tags className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('brands.title')}</h1>
          </div>
          <PermissionGate permission="brands.create">
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('brands.addBrand')}
            </Button>
          </PermissionGate>
        </div>

        <Dialog open={open} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{editingBrand ? t('brands.dialog.editTitle') : t('brands.dialog.newTitle')}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 overflow-auto pr-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('brands.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t('brands.form.slug')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder={t('brands.form.slugPlaceholder')}
                    disabled={!!editingBrand}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('brands.form.slugHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('brands.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">{t('brands.form.website')}</Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder={t('brands.form.websitePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logo_url">{t('brands.form.logoUrl')}</Label>
                  <Input
                    id="logo_url"
                    type="url"
                    value={formData.logo_url}
                    onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                    placeholder={t('brands.form.logoUrlPlaceholder')}
                  />
                </div>

                <OrganizationFormSection
                  value={organizationSelection}
                  onChange={setOrganizationSelection}
                  showBusinessUnit={true}
                  showDepartment={true}
                  multiSelectCompanies={true}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('brands.form.cancel')}
                  </Button>
                  <Button type="submit">{editingBrand ? t('brands.form.update') : t('brands.form.create')}</Button>
                </div>
              </form>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('brands.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <OrganizationFilters
            companyFilter={filterCompanyId}
            onCompanyFilterChange={setFilterCompanyId}
            statusFilter={filterStatus}
            onStatusFilterChange={setFilterStatus}
          />
        </div>

        <BulkActionsBar
          selectedCount={bulkActions.selectedIds.size}
          onStatusClick={() => bulkActions.setBulkStatusDialogOpen(true)}
          onDeleteClick={() => bulkActions.setBulkDeleteDialogOpen(true)}
          onOrgClick={() => bulkActions.setBulkOrgDialogOpen(true)}
          onClearSelection={bulkActions.clearSelection}
          statusPermission="brands.edit"
          deletePermission="brands.delete"
        />

        {/* Access and loading checks are handled before this JSX via early returns above */}
        <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={bulkActions.selectedIds.size === allIds.length && allIds.length > 0}
                      onCheckedChange={() => bulkActions.toggleSelectAll(allIds)}
                      aria-label={t('common.selectAll')}
                    />
                  </TableHead>
                  <TableHead>{t('brands.table.name')}</TableHead>
                  <TableHead>{t('brands.table.slug')}</TableHead>
                  <TableHead>{t('brands.table.description')}</TableHead>
                  <TableHead>{t('brands.table.website')}</TableHead>
                  <TableHead>{t('brands.table.status')}</TableHead>
                  <TableHead className="text-right">{t('brands.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrands.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('brands.noBrands')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBrands.map((brand) => (
                    <TableRow key={brand.id}>
                      <TableCell>
                        <Checkbox
                          checked={bulkActions.selectedIds.has(brand.id)}
                          onCheckedChange={() => bulkActions.toggleSelectOne(brand.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{brand.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {brand.slug}
                      </TableCell>
                      <TableCell>
                        {brand.description ? (
                          <span className="text-sm line-clamp-1">
                            {brand.description}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {brand.website ? (
                          <a
                            href={brand.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            {t('brands.table.visit')}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={brand.is_active ? "default" : "secondary"}>
                          {brand.is_active ? t('brands.status.active') : t('brands.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="brands.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(brand)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="brands.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteBrandId(brand.id)}
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

      <BulkStatusDialog
        open={bulkActions.bulkStatusDialogOpen}
        onOpenChange={bulkActions.setBulkStatusDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        status={bulkActions.bulkNewStatus}
        onStatusChange={bulkActions.setBulkNewStatus}
        onConfirm={() => bulkActions.handleBulkStatusChange("is_active")}
        processing={bulkActions.processing}
        statusOptions={[
          { value: "active", label: t('common.active') },
          { value: "inactive", label: t('common.inactive') },
        ]}
      />

      <BulkDeleteDialog
        open={bulkActions.bulkDeleteDialogOpen}
        onOpenChange={bulkActions.setBulkDeleteDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        onConfirm={bulkActions.handleBulkDelete}
        processing={bulkActions.processing}
      />

      <BulkOrgDialog
        open={bulkActions.bulkOrgDialogOpen}
        onOpenChange={bulkActions.setBulkOrgDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        companyId={bulkActions.bulkNewCompanyId}
        onCompanyChange={bulkActions.setBulkNewCompanyId}
        onConfirm={() => bulkActions.handleBulkCompanyChange("organization_id")}
        processing={bulkActions.processing}
        companies={[]}
      />

      <AlertDialog open={!!deleteBrandId} onOpenChange={() => setDeleteBrandId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('brands.toast.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.actionCannotBeUndone') || 'Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel') || 'Cancelar'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete') || 'Eliminar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
