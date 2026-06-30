import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Plus, Search, FolderTree, Pencil, Trash2, Tag } from "lucide-react";
import CategoryAttributePricesDialog from "@/components/CategoryAttributePricesDialog";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { OrganizationFilters } from "@/components/OrganizationFilters";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog, BulkOrgDialog } from "@/components/BulkActionDialogs";
import { useBulkActions } from "@/hooks/useBulkActions";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  path: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  parent_id: string | null;
  
  organization_id: string | null;
}

const PAGE_SIZE = 10;

export default function ProductCategories() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();
  const { isSystemAdmin } = usePermissions();
  const [searchParams] = useSearchParams();
  const businessAreaId = searchParams.get("area");
  const [businessAreaName, setBusinessAreaName] = useState<string>("");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [catPricesOpen, setCatPricesOpen] = useState(false);
  const [catPricesCategory, setCatPricesCategory] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    sort_order: 0,
  });
  
  // Pagination states
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  
  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
    selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
    levelSelections: [],
  });

  // Filter states
  const [filterTenantId, setFilterTenantId] = useState("all");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [tenantCompanyIds, setTenantCompanyIds] = useState<string[]>([]);

  const isAdmin = isSystemAdmin;

  // Load company IDs for tenant filter
  useEffect(() => {
    const loadTenantCompanies = async () => {
      if (filterTenantId && filterTenantId !== "all") {
        const { data } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id")
          .eq("parent_org_id", filterTenantId);
        setTenantCompanyIds(data?.map(c => c.child_org_id) || []);
      } else {
        setTenantCompanyIds([]);
      }
    };
    loadTenantCompanies();
  }, [filterTenantId]);

  const loadData = useCallback(async (reset = true) => {
    try {
      if (reset) {
        setLoading(true);
        setPage(0);
      } else {
        setLoadingMore(true);
      }

      const currentPage = reset ? 0 : page;
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("product_categories")
        .select("*")
        .is("parent_id", null)
        .order("path")
        .range(from, to);


      // Filter by company using product_category_organizations junction table
      // ALWAYS filter by activeCompany first, then apply additional filters
      let categoryIdsToFilter: string[] = [];

      if (filterCompanyId && filterCompanyId !== "all") {
        // Specific company filter selected
        const { data: companyCats } = await supabase
          .from("product_category_organizations")
          .select("category_id")
          .eq("organization_id", filterCompanyId);
        categoryIdsToFilter = companyCats?.map((c) => c.category_id) || [];
      } else if (filterTenantId && filterTenantId !== "all") {
        // Organization selected - filter by all companies in that org
        if (tenantCompanyIds.length > 0) {
          const { data: companyCats } = await supabase
            .from("product_category_organizations")
            .select("category_id")
            .in("organization_id", tenantCompanyIds);
          categoryIdsToFilter = companyCats?.map((c) => c.category_id) || [];
        }
      } else if (activeCompany?.id) {
        // ALWAYS filter by activeCompany - this applies to ALL users including admins
        const { data: companyCats } = await supabase
          .from("product_category_organizations")
          .select("category_id")
          .eq("organization_id", activeCompany.id);
        categoryIdsToFilter = companyCats?.map((c) => c.category_id) || [];
      }

      // Apply category ID filter
      if (categoryIdsToFilter.length > 0) {
        query = query.in("id", categoryIdsToFilter);
      } else {
        // No categories for this filter - return empty
        query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      }

      // Apply status filter
      if (filterStatus !== "all") {
        query = query.eq("is_active", filterStatus === "active");
      }

      // Server-side search
      if (debouncedSearchTerm) {
        query = query.or(`name.ilike.%${debouncedSearchTerm}%,path.ilike.%${debouncedSearchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const newData = (data || []) as unknown as ProductCategory[];

      if (reset) {
        setCategories(newData);
      } else {
        setCategories(prev => [...prev, ...newData]);
      }

      setHasMore(newData.length === PAGE_SIZE);
    } catch (error: unknown) {
      toast({
        title: t('productCategories.toast.loadError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCompany?.id, filterCompanyId, filterTenantId, tenantCompanyIds, filterStatus, debouncedSearchTerm, page, t, toast]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "product_categories",
    onSuccess: () => loadData(true),
    softDelete: false,
    organizationId: activeCompany?.id,
  });

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load data on filter changes
  useEffect(() => {
    loadData(true);
    if (businessAreaId) {
      loadBusinessAreaName();
    }
    // userType intentionally excluded: it is not read inside loadData and
    // does not affect the query. Adding it would cause spurious reloads.
  }, [loadData, businessAreaId]);

  // Load more on page change
  useEffect(() => {
    if (page > 0) {
      loadData(false);
    }
  }, [page, loadData]);

  // Infinite scroll observer
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  const loadBusinessAreaName = useCallback(async () => {
    if (!businessAreaId) return;

    try {
      const { data, error } = await supabase
        .from("anew_organizations")
        .select("name")
        .eq("id", businessAreaId)
        .single();

      if (error) throw error;
      setBusinessAreaName(data?.name || "");
    } catch {
      // Non-critical: business area name display only. Failure is silent.
    }
  }, [businessAreaId]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('productSubcategories.toast.notAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const slug = formData.slug || generateSlug(formData.name);
      const path = formData.parent_id
        ? `${categories.find(c => c.id === formData.parent_id)?.path || ""}/${slug}`
        : slug;

      // Get all selected company IDs from multi-select (deduped)
      const uniqueCompanyIds = Array.from(
        new Set((organizationSelection.selectedCompanyIds || []).filter(Boolean))
      );

      if (uniqueCompanyIds.length === 0) {
        toast({
          title: t('common.error'),
          description: t('common.selectCompanies'),
          variant: "destructive",
        });
        return;
      }

      let categoryId: string;

      const primaryOrgId = uniqueCompanyIds[0] || null;

      if (editingCategory) {
        const updatePayload: TablesUpdate<"product_categories"> = {
          name: formData.name,
          description: formData.description || null,
          sort_order: formData.sort_order,
          organization_id: primaryOrgId,
        };

        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("product_categories")
            .update(updatePayload)
            .eq("id", editingCategory.id);
          if (error) throw error;

          // Delete existing associations inside the same audit context so any
          // audit trigger on product_category_organizations also gets the actor.
          await supabase
            .from("product_category_organizations")
            .delete()
            .eq("category_id", editingCategory.id);
        });

        categoryId = editingCategory.id;

        toast({
          title: t('productCategories.toast.updateSuccess'),
        });
      } else {
        const insertPayload: TablesInsert<"product_categories"> = {
          name: formData.name,
          slug,
          path,
          description: formData.description || null,
          parent_id: formData.parent_id || null,
          sort_order: formData.sort_order,
          is_active: true,
          created_by: businessUserId,
          organization_id: primaryOrgId,
        };

        const newCategory = await withAuditContext(supabase, businessUserId, async () => {
          const { data, error } = await supabase
            .from("product_categories")
            .insert(insertPayload)
            .select("id")
            .single();
          if (error) throw error;
          return data;
        });

        if (!newCategory) throw new Error("Insert retornou sem dados — possível rejeição silenciosa por RLS");
        categoryId = newCategory.id;

        toast({
          title: t('productCategories.toast.createSuccess'),
        });
      }

      // Insert company associations (within audit context so junction inserts are attributed).
      const companyAssociations = uniqueCompanyIds.map((companyId) => ({
        category_id: categoryId,
        organization_id: companyId,
        created_by: businessUserId,
      }));

      const { error: assocError } = await withAuditContext(supabase, businessUserId, async () => {
        const result = await supabase
          .from("product_category_organizations")
          .insert(companyAssociations);
        return result;
      });

      if (assocError) {
        // If this was a new category, rollback so it doesn't become orphaned/invisible.
        // Wrapped in withAuditContext so the compensating DELETE is attributed (AUDIT-CAT-01).
        if (!editingCategory) {
          await withAuditContext(supabase, businessUserId, async () => {
            await supabase
              .from("product_categories")
              .delete()
              .eq("id", categoryId);
          });
        }

        throw assocError;
      }

      handleCloseDialog(false);
      await loadData();
    } catch (error: unknown) {
      toast({
        title: editingCategory ? t('productCategories.toast.updateError') : t('productCategories.toast.createError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('productCategories.toast.deleteConfirm'))) return;

    try {
      const category = categories.find(c => c.id === id);
      if (!category || !activeCompany?.id) {
        throw new Error('Category not found or no active company');
      }

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase
          .from("product_categories")
          .delete()
          .eq("id", id)
          .eq("organization_id", activeCompany.id);
        if (error) throw error;
      });

      toast({
        title: t('productCategories.toast.success'),
        description: t('productCategories.toast.deleteSuccess'),
      });

      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('productCategories.toast.error'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    }
  };

  const openEditDialog = async (category: ProductCategory) => {
    // Fetch company associations
    const { data: companyAssocs } = await supabase
      .from("product_category_organizations")
      .select("organization_id")
      .eq("category_id", category.id);

    const companyIds = companyAssocs?.map((a) => a.organization_id) || [];

    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      parent_id: category.parent_id || "",
      
      sort_order: category.sort_order,
    });
    
    // Set organization selection from company associations (multi-select mode)
    setOrganizationSelection({
      tenantId: "",
      companyId: "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: companyIds.length > 0 ? companyIds : (activeCompany?.id ? [activeCompany.id] : []),
      levelSelections: [],
    });
    
    setOpen(true);
  };

  const resetForm = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      parent_id: "",
      
      sort_order: 0,
    });
    setOrganizationSelection({
      tenantId: "",
      companyId: "",
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

  const allIds = categories.map(c => c.id);

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FolderTree className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('productCategories.title')}</h1>
              {businessAreaName && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('productCategories.businessArea')}: <span className="font-medium">{businessAreaName}</span>
                </p>
              )}
            </div>
          </div>
          <PermissionGate permission="product_categories.create">
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('productCategories.addCategory')}
            </Button>
          </PermissionGate>
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCategory ? t('productCategories.dialog.editTitle') : t('productCategories.dialog.newTitle')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('productCategories.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t('productCategories.form.slug')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder={t('productCategories.form.slugPlaceholder')}
                    disabled={!!editingCategory}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('productCategories.form.slugHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('productCategories.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sort_order">{t('productCategories.form.sortOrder')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <OrganizationFormSection
                  value={organizationSelection}
                  onChange={setOrganizationSelection}
                  showBusinessUnit={false}
                  showDepartment={false}
                  showSecondaryCompanies={false}
                  multiSelectCompanies={true}
                  activeOrganizationOnly
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('productCategories.form.cancel')}
                  </Button>
                  <Button type="submit">{editingCategory ? t('productCategories.form.update') : t('productCategories.form.create')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('productCategories.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <OrganizationFilters
            tenantFilter={filterTenantId}
            onTenantFilterChange={setFilterTenantId}
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
          statusPermission="product_categories.edit"
          deletePermission="product_categories.delete"
        />

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={bulkActions.selectedIds.size === allIds.length && allIds.length > 0}
                    onCheckedChange={() => bulkActions.toggleSelectAll(allIds)}
                  />
                </TableHead>
                <TableHead>{t('productCategories.table.name')}</TableHead>
                <TableHead>{t('productCategories.table.path')}</TableHead>
                <TableHead>{t('productCategories.table.slug')}</TableHead>
                <TableHead>{t('productCategories.table.sortOrder')}</TableHead>
                <TableHead>{t('productCategories.table.status')}</TableHead>
                <TableHead className="text-right">{t('productCategories.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">{t('productCategories.loading')}</TableCell>
                </TableRow>
              ) : categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('productCategories.noCategories')}
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <Checkbox
                        checked={bulkActions.selectedIds.has(category.id)}
                        onCheckedChange={() => bulkActions.toggleSelectOne(category.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {category.path}
                    </TableCell>
                    <TableCell>{category.slug}</TableCell>
                    <TableCell>{category.sort_order}</TableCell>
                    <TableCell>
                      <Badge variant={category.is_active ? "default" : "secondary"}>
                        {category.is_active ? t('productCategories.status.active') : t('productCategories.status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="product_categories.edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.edit')}
                            onClick={() => openEditDialog(category)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('productCategories.actions.attributePrices')}
                            onClick={() => { setCatPricesCategory({ id: category.id, name: category.name }); setCatPricesOpen(true); }}
                          >
                            <Tag className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="product_categories.delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('common.delete')}
                            onClick={() => handleDelete(category.id)}
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
          
          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="py-4 text-center">
            {loadingMore && (
              <span className="text-muted-foreground">{t('common.loadingMore')}</span>
            )}
            {!hasMore && categories.length > 0 && (
              <span className="text-muted-foreground text-sm">{t('common.noMoreResults')}</span>
            )}
          </div>
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

      {catPricesCategory && (
        <CategoryAttributePricesDialog
          open={catPricesOpen}
          onOpenChange={setCatPricesOpen}
          categoryId={catPricesCategory.id}
          categoryName={catPricesCategory.name}
        />
      )}
    </>
  );
}
