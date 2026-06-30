import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Pencil, Trash2, Tag } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { OrganizationFilters } from "@/components/OrganizationFilters";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog, BulkOrgDialog } from "@/components/BulkActionDialogs";
import { useBulkActions } from "@/hooks/useBulkActions";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface ProductSubcategory {
  id: string;
  name: string;
  slug: string;
  path: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  parent_id: string;
  parent_name?: string;
  organization_id?: string;
  organization_name?: string;
}

interface ParentCategory {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
}

export default function ProductSubcategories() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType, companies: contextCompanies } = useCompany();
  const { isSystemAdmin, hasPermission } = usePermissions();
  const selectedCompanyId = activeCompany?.id || null;

  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([]);
  const [formParentCategories, setFormParentCategories] = useState<ParentCategory[]>([]);
  const [adminCompanies, setAdminCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subcategoryToDelete, setSubcategoryToDelete] = useState<string | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<ProductSubcategory | null>(null);
  const [catPricesOpen, setCatPricesOpen] = useState(false);
  const [catPricesCategory, setCatPricesCategory] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    parent_id: "",
    organization_id: "",
    sort_order: 0,
  });

  // Pagination states
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  // pageRef mirrors page state so loadData can read the current page value
  // without closing over `page` as a useCallback dependency (CAT-HOOK-001).
  const pageRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Filter states
  const [filterTenantId, setFilterTenantId] = useState("all");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterParentId, setFilterParentId] = useState("all");

  const isAdmin = isSystemAdmin;
  const canSelectCompanyInForm = isAdmin || hasPermission('products.manage');

  const loadCompanies = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const companiesResult = await supabase
        .from("anew_organizations")
        .select("id, name")
        .order("name");

      if (companiesResult.error) throw companiesResult.error;
      setAdminCompanies((companiesResult.data || []) as Company[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: t("common.error"),
        description: message,
        variant: "destructive",
      });
    }
  }, [isAdmin, t, toast]);

  const loadFormParentCategories = useCallback(async (companyId: string | null) => {
    if (!companyId) {
      setFormParentCategories([]);
      return;
    }

    const { data: companyCats, error: companyCatsError } = await supabase
      .from("product_category_organizations")
      .select("category_id")
      .eq("organization_id", companyId);

    if (companyCatsError) throw companyCatsError;

    const categoryIds = [...new Set(companyCats?.map((c) => c.category_id) || [])];

    if (categoryIds.length === 0) {
      setFormParentCategories([]);
      return;
    }

    const { data: parentsData, error: parentsError } = await supabase
      .from("product_categories")
      .select("id, name")
      .is("parent_id", null)
      .eq("is_active", true)
      .in("id", categoryIds)
      .order("name");

    if (parentsError) throw parentsError;
    setFormParentCategories((parentsData || []) as ParentCategory[]);
  }, []);

  const loadData = useCallback(async (reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
        pageRef.current = 0;
        setPage(0);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      // Read current page from ref so `page` state is not a dep of this callback.
      // This prevents a reload loop when the infinite-scroll useEffect fires on
      // page increment (CAT-HOOK-001).
      const currentPage = reset ? 0 : pageRef.current;
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Load parent categories (those without parent_id)
      let parentsData: ParentCategory[] = [];

      // Determine effective filter: specific company filter takes precedence
      const effectiveCompanyId =
        filterCompanyId && filterCompanyId !== "all"
          ? filterCompanyId
          : null;

      // Get user's accessible company IDs for company_admin
      const userCompanyIds = contextCompanies.map((c) => c.id);

      // If organization filter is set, get companies from that tenant
      let tenantCompanyIds: string[] = [];
      const hasTenantFilter =
        !!filterTenantId && filterTenantId !== "" && filterTenantId !== "all";

      if (hasTenantFilter) {
        const { data: tenantCompanies, error: tenantCompaniesError } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id")
          .eq("parent_org_id", filterTenantId);

        if (tenantCompaniesError) throw tenantCompaniesError;

        tenantCompanyIds = (tenantCompanies || []).map((c) => c.child_org_id);

        // Selected organization has no companies -> show empty state (no error)
        if (tenantCompanyIds.length === 0) {
          setParentCategories([]);
          setSubcategories([]);
          setHasMore(false);
          return;
        }
      }

      // Determine which company IDs to filter by - ALWAYS include activeCompany
      let filterByCompanyIds: string[] | null = null;
      if (effectiveCompanyId) {
        filterByCompanyIds = [effectiveCompanyId];
      } else if (hasTenantFilter) {
        filterByCompanyIds = tenantCompanyIds;
      } else if (selectedCompanyId) {
        // ALWAYS filter by activeCompany for all users including admins
        filterByCompanyIds = [selectedCompanyId];
      } else if (!isAdmin && userCompanyIds.length > 0) {
        filterByCompanyIds = userCompanyIds;
      }

      // ALWAYS use junction table to resolve visibility
      if (filterByCompanyIds && filterByCompanyIds.length > 0) {
        const { data: companyCats } = await supabase
          .from("product_category_organizations")
          .select("category_id")
          .in("organization_id", filterByCompanyIds);

        const categoryIds = [...new Set(companyCats?.map((c) => c.category_id) || [])];

        if (categoryIds.length > 0) {
          const { data: parentsRows, error: parentsError } = await supabase
            .from("product_categories")
            .select("id, name")
            .is("parent_id", null)
            .eq("is_active", true)
            .in("id", categoryIds)
            .order("name");
          if (parentsError) throw parentsError;
          parentsData = (parentsRows || []) as ParentCategory[];
        }
      }

      setParentCategories(parentsData);

      // Load subcategories (those with parent_id) with pagination
      let subsQuery = supabase
        .from("product_categories")
        .select(`
          id,
          name,
          slug,
          path,
          description,
          is_active,
          sort_order,
          parent_id,
          organization_id,
          parent:parent_id(name)
        `)
        .not("parent_id", "is", null)
        .order("path")
        .range(from, to);

      // ALWAYS require org filter — no unscoped queries allowed
      if (!filterByCompanyIds || filterByCompanyIds.length === 0) {
        setParentCategories([]);
        setSubcategories([]);
        setHasMore(false);
        return;
      }
      subsQuery = subsQuery.in("organization_id", filterByCompanyIds);

      if (filterStatus !== "all") {
        subsQuery = subsQuery.eq("is_active", filterStatus === "active");
      }

      if (filterParentId !== "all") {
        subsQuery = subsQuery.eq("parent_id", filterParentId);
      }

      // Server-side search filter
      if (debouncedSearchTerm) {
        subsQuery = subsQuery.ilike("name", `%${debouncedSearchTerm}%`);
      }

      const { data: subsData, error: subsError } = await subsQuery;
      if (subsError) throw subsError;

      // Resolve organization names via junction table
      const subOrgIds = [
        ...new Set(
          (subsData || [])
            .map((s) => (s as { organization_id?: string }).organization_id)
            .filter((id): id is string => !!id)
        ),
      ];
      let orgNameMap: Record<string, string> = {};
      if (subOrgIds.length > 0) {
        const { data: orgs } = await supabase
          .from("anew_organizations")
          .select("id, name")
          .in("id", subOrgIds);
        orgNameMap = Object.fromEntries((orgs || []).map((o) => [o.id, o.name]));
      }

      const formattedSubs = (subsData || []).map((sub) => {
        const subWithParent = sub as typeof sub & { parent?: { name?: string } };
        const orgId = (sub as { organization_id?: string }).organization_id ?? "";
        return {
          ...sub,
          parent_name: subWithParent.parent?.name || "",
          organization_name: orgNameMap[orgId] || "",
        };
      });

      // Check if there are more results
      if (formattedSubs.length < PAGE_SIZE) {
        setHasMore(false);
      }

      if (reset) {
        setSubcategories(formattedSubs as ProductSubcategory[]);
      } else {
        setSubcategories((prev) => [...prev, ...(formattedSubs as ProductSubcategory[])]);
      }
    } catch (error: unknown) {
      toast({
        title: t('productSubcategories.toast.loadError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [
    // `page` intentionally omitted: read via pageRef.current to avoid reload loop
    // on every infinite-scroll page increment (CAT-HOOK-001).
    filterCompanyId,
    filterTenantId,
    filterStatus,
    filterParentId,
    debouncedSearchTerm,
    selectedCompanyId,
    contextCompanies,
    isAdmin,
    t,
    toast,
  ]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "product_categories",
    onSuccess: loadData,
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

  // Load more function for infinite scroll
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      setPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore, loading]);

  // Intersection Observer for infinite scroll
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

  // Load data when page changes (for infinite scroll).
  // Sync pageRef before calling loadData so the callback reads the new page value.
  useEffect(() => {
    if (page > 0) {
      pageRef.current = page;
      loadData(false);
    }
  }, [page, loadData]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.parent_id) {
      toast({
        title: t('productSubcategories.toast.parentRequired'),
        description: t('productSubcategories.toast.parentRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    const companyId = canSelectCompanyInForm ? formData.organization_id : selectedCompanyId;

    if (!companyId) {
      toast({
        title: t('common.error'),
        description: t('common.selectCompany'),
        variant: "destructive",
      });
      return;
    }

    try {
      // resolveCurrentBusinessUserId() performs its own auth.getUser() internally and
      // handles the null case — a separate getUser() call here is redundant and creates
      // a divergent early-exit error path on transient auth failures (PROD-DEAD-AUTH-CALL-SUBMIT).
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const slug = formData.slug || generateSlug(formData.name);
      const parentCategory = parentCategories.find(c => c.id === formData.parent_id);
      const path = parentCategory ? `${parentCategory.name.toLowerCase()}/${slug}` : slug;

      if (editingSubcategory) {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("product_categories")
            .update({
              name: formData.name,
              description: formData.description || null,
              sort_order: formData.sort_order,
              parent_id: formData.parent_id,
              organization_id: companyId,
            })
            .eq("id", editingSubcategory.id);
          if (error) throw error;
        });

        toast({
          title: t('productSubcategories.toast.updateSuccess'),
        });
      } else {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase.from("product_categories").insert({
            name: formData.name,
            slug,
            path,
            description: formData.description || null,
            parent_id: formData.parent_id,
            organization_id: companyId,
            sort_order: formData.sort_order,
            is_active: true,
            created_by: businessUserId,
          });
          if (error) throw error;
        });

        toast({
          title: t('productSubcategories.toast.createSuccess'),
        });
      }

      handleCloseDialog();
      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('productSubcategories.toast.saveError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!subcategoryToDelete) return;

    try {
      // Verify subcategory ownership before any Supabase call.
      const sub = subcategories.find(s => s.id === subcategoryToDelete);
      if (!sub?.organization_id) {
        throw new Error('Subcategory not found or no organization context');
      }

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      await withAuditContext(supabase, businessUserId, async () => {
        // Clear references in soft-deleted products so they don't block the DELETE.
        // Scoped to the subcategory's org to avoid cross-tenant mutations.
        // throwOnError() ensures a silent UPDATE failure (e.g. RLS rejection) is surfaced
        // before the DELETE proceeds, preventing orphaned FK references (AUDIT-CAT-05).
        await supabase
          .from("products")
          .update({ subcategory_id: null })
          .eq("subcategory_id", subcategoryToDelete)
          .eq("organization_id", sub.organization_id)
          .not("deleted_at", "is", null)
          .throwOnError();

        const { error } = await supabase
          .from("product_categories")
          .delete()
          .eq("id", subcategoryToDelete)
          .eq("organization_id", sub.organization_id);

        if (error) {
          // Foreign key constraint: subcategory is still in use by active products.
          if (error.code === "23503") {
            toast({
              title: t('productSubcategories.toast.cannotDelete'),
              description: t('productSubcategories.toast.inUseByProducts'),
              variant: "destructive",
            });
            setDeleteDialogOpen(false);
            setSubcategoryToDelete(null);
            return;
          }
          throw error;
        }
      });

      toast({
        title: t('productSubcategories.toast.deleteSuccess'),
      });

      setDeleteDialogOpen(false);
      setSubcategoryToDelete(null);
      await loadData();
    } catch (error: unknown) {
      toast({
        title: t('productSubcategories.toast.deleteError'),
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setSubcategoryToDelete(null);
    }
  };

  const openEditDialog = (subcategory: ProductSubcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({
      name: subcategory.name,
      slug: subcategory.slug,
      description: subcategory.description || "",
      parent_id: subcategory.parent_id,
      organization_id: subcategory.organization_id || "",
      sort_order: subcategory.sort_order,
    });
    setOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      parent_id: "",
      organization_id: selectedCompanyId || "",
      sort_order: 0,
    });
    setFormParentCategories([]);
    setEditingSubcategory(null);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    resetForm();
  };

  const selectedCompanyIdForForm = canSelectCompanyInForm
    ? formData.organization_id || selectedCompanyId
    : selectedCompanyId;

  useEffect(() => {
    if (!open) return;

    loadFormParentCategories(selectedCompanyIdForForm || null).catch((error: unknown) => {
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    });
  }, [open, selectedCompanyIdForForm, loadFormParentCategories, toast, t]);

  const filteredParentCategories = formParentCategories;

  const openDeleteDialog = (id: string) => {
    setSubcategoryToDelete(id);
    setDeleteDialogOpen(true);
  };

  // No client-side filtering needed - search is server-side now
  const allIds = subcategories.map(s => s.id);

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('productSubcategories.title')}</h1>
            <p className="text-muted-foreground">{t('productSubcategories.subtitle')}</p>
          </div>
          <PermissionGate permission="product_subcategories.create">
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('productSubcategories.addSubcategory')}
            </Button>
          </PermissionGate>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingSubcategory ? t('productSubcategories.dialog.editTitle') : t('productSubcategories.dialog.newTitle')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {canSelectCompanyInForm && (
                  <div>
                    <Label htmlFor="organization_id">{t("common.company")}</Label>
                    <Select
                      value={formData.organization_id}
                      onValueChange={(value) =>
                        setFormData({ ...formData, organization_id: value, parent_id: "" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.selectCompany")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(isAdmin ? adminCompanies : contextCompanies).map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="parent_id">{t("productSubcategories.form.parentCategory")}</Label>
                  <Select
                    value={formData.parent_id}
                    disabled={canSelectCompanyInForm && !selectedCompanyIdForForm}
                    onValueChange={(value) => setFormData({ ...formData, parent_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("productSubcategories.form.selectParent")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredParentCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="name">{t('productSubcategories.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('productSubcategories.form.namePlaceholder')}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="slug">{t('productSubcategories.form.slug')}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder={t('productSubcategories.form.slugPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t('productSubcategories.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('productSubcategories.form.descriptionPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="sort_order">{t('productSubcategories.form.sortOrder')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    {t('productSubcategories.form.cancel')}
                  </Button>
                  <Button type="submit">
                    {editingSubcategory ? t('productSubcategories.form.update') : t('productSubcategories.form.create')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('productSubcategories.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <OrganizationFilters
            companyFilter={filterCompanyId}
            onCompanyFilterChange={setFilterCompanyId}
            tenantFilter={filterTenantId}
            onTenantFilterChange={setFilterTenantId}
            statusFilter={filterStatus}
            onStatusFilterChange={setFilterStatus}
            extraFilters={
              <div className="min-w-[200px]">
                <label htmlFor="filter-parent-id" className="text-sm font-medium mb-1 block">
                  {t('productSubcategories.form.parentCategory')}
                </label>
                <Select value={filterParentId} onValueChange={setFilterParentId}>
                  <SelectTrigger id="filter-parent-id">
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {parentCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
        </div>

        <BulkActionsBar
          selectedCount={bulkActions.selectedIds.size}
          onStatusClick={() => bulkActions.setBulkStatusDialogOpen(true)}
          onDeleteClick={() => bulkActions.setBulkDeleteDialogOpen(true)}
          onOrgClick={() => bulkActions.setBulkOrgDialogOpen(true)}
          onClearSelection={bulkActions.clearSelection}
          statusPermission="product_subcategories.edit"
          deletePermission="product_subcategories.delete"
        />

        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={bulkActions.selectedIds.size === allIds.length && allIds.length > 0}
                      onCheckedChange={() => bulkActions.toggleSelectAll(allIds)}
                    />
                  </TableHead>
                  <TableHead>{t('productSubcategories.table.name')}</TableHead>
                  <TableHead>{t('productSubcategories.table.parentCategory')}</TableHead>
                  {isAdmin && <TableHead>{t("common.company")}</TableHead>}
                  <TableHead>{t('productSubcategories.table.slug')}</TableHead>
                  <TableHead>{t('productSubcategories.table.description')}</TableHead>
                  <TableHead>{t('productSubcategories.table.status')}</TableHead>
                  <TableHead>{t('productSubcategories.table.sortOrder')}</TableHead>
                  <TableHead className="text-right">{t('productSubcategories.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>
          <ScrollArea className="h-[calc(100vh-400px)] min-h-[300px]">
            <div className="overflow-x-auto">
              <Table>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8">
                        {t("productSubcategories.loading")}
                      </TableCell>
                    </TableRow>
                  ) : subcategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8">
                        {t('productSubcategories.noSubcategories')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {subcategories.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="w-12">
                            <Checkbox
                              checked={bulkActions.selectedIds.has(sub.id)}
                              onCheckedChange={() => bulkActions.toggleSelectOne(sub.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{sub.name}</TableCell>
                          <TableCell>{sub.parent_name}</TableCell>
                          {isAdmin && <TableCell>{sub.organization_name || "-"}</TableCell>}
                          <TableCell className="text-muted-foreground">{sub.slug}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {sub.description || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sub.is_active ? "default" : "secondary"}>
                              {sub.is_active ? t('productSubcategories.status.active') : t('productSubcategories.status.inactive')}
                            </Badge>
                          </TableCell>
                          <TableCell>{sub.sort_order}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <PermissionGate permission="product_subcategories.edit">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={t('common.edit')}
                                  onClick={() => openEditDialog(sub)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={t('productSubcategories.actions.attributePrices')}
                                  onClick={() => { setCatPricesCategory({ id: sub.id, name: sub.name }); setCatPricesOpen(true); }}
                                >
                                  <Tag className="w-4 h-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate permission="product_subcategories.delete">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={t('common.delete')}
                                  onClick={() => openDeleteDialog(sub.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </PermissionGate>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="py-4 text-center">
              {loadingMore && (
                <span className="text-muted-foreground">{t('common.loadingMore')}</span>
              )}
              {!hasMore && subcategories.length > 0 && (
                <span className="text-muted-foreground text-sm">{t('common.noMoreResults')}</span>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('productSubcategories.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('productSubcategories.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSubcategoryToDelete(null)}>
              {t('productSubcategories.deleteDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('productSubcategories.deleteDialog.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
