import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Building, Pencil, Trash2, Mail, Phone, Globe, Download, Upload, Search, Filter, X, Building2 } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

interface FilterOrganization {
  id: string;
  name: string;
}

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { activeCompany, userType, companies, isLoading: companyLoading } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  // Filter data
  const [filterOrganizations, setFilterOrganizations] = useState<FilterOrganization[]>([]);


  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  
  // New bulk action states
  const [bulkCompanyDialogOpen, setBulkCompanyDialogOpen] = useState(false);
  const [bulkCompanyId, setBulkCompanyId] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    country: "",
    tax_id: "",
    website: "",
    notes: "",
    is_active: true,
  });

  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
  });

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("suppliers.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Pre-select activeCompany in companyFilter on page load
  // Non-system_admin users are never allowed to use "all" (cross-tenant data leak)
  useEffect(() => {
    if (companyFilter === null && activeCompany?.id) {
      setCompanyFilter(activeCompany.id);
    } else if (companyFilter === null && !activeCompany) {
      setCompanyFilter(userType === "system_admin" ? "all" : "");
    }
  }, [activeCompany?.id, companyFilter, userType]);

  // Load filter data from anew_organizations
  useEffect(() => {
    if (activeCompany?.id || userType === 'system_admin') {
      loadFilterData();
    }
  }, [activeCompany?.id, userType]);

  const loadFilterData = async () => {
    try {
      // Use companies from CompanyContext (already filtered by user visibility)
      setFilterOrganizations(companies.map(c => ({ id: c.id, name: c.name })));
    } catch (error: any) {
      console.error("Error loading filter data:", error);
    }
  };

  // Load suppliers with filters
  const loadSuppliers = useCallback(async (offset = 0, reset = false) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      // Build count query
      let countQuery = supabase
        .from("suppliers")
        .select("*", { count: "exact", head: true });

      // Apply company filter — non-system_admin always scoped
      if (companyFilter && companyFilter !== "all") {
        countQuery = countQuery.eq("organization_id", companyFilter);
      } else if (userType !== "system_admin" && activeCompany?.id) {
        countQuery = countQuery.eq("organization_id", activeCompany.id);
      }

      // Apply status filter
      if (statusFilter !== "all") {
        countQuery = countQuery.eq("is_active", statusFilter === "active");
      }

      // Apply search filter
      if (searchQuery) {
        countQuery = countQuery.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,contact_person.ilike.%${searchQuery}%`);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Build data query
      let dataQuery = supabase
        .from("suppliers")
        .select("*, anew_organizations:suppliers_organization_id_fkey(id, name)")
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      // Apply company filter — non-system_admin always scoped
      if (companyFilter && companyFilter !== "all") {
        dataQuery = dataQuery.eq("organization_id", companyFilter);
      } else if (userType !== "system_admin" && activeCompany?.id) {
        dataQuery = dataQuery.eq("organization_id", activeCompany.id);
      }

      // Apply status filter
      if (statusFilter !== "all") {
        dataQuery = dataQuery.eq("is_active", statusFilter === "active");
      }

      // Apply search filter
      if (searchQuery) {
        dataQuery = dataQuery.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,contact_person.ilike.%${searchQuery}%`);
      }

      const { data, error } = await dataQuery;

      if (error) throw error;

      if (reset || offset === 0) {
        setSuppliers(data as Supplier[] || []);
      } else {
        setSuppliers(prev => [...prev, ...(data as Supplier[] || [])]);
      }

      setHasMore((data?.length || 0) >= PAGE_SIZE);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.loadError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [companyFilter, statusFilter, searchQuery, userType, t, toast]);

  // Debounce search
  useEffect(() => {
    if (!activeCompany?.id && userType !== 'system_admin') return;
    
    const timer = setTimeout(() => {
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, companyFilter]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadSuppliers(suppliers.length);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [suppliers.length, hasMore, loadingMore, loading, loadSuppliers]);

  const handleEdit = async (supplier: Supplier) => {
    setEditingId(supplier.id);
    setFormData({
      name: supplier.name,
      contact_person: (supplier as any).contact_person || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      postal_code: supplier.postal_code || "",
      country: supplier.country || "",
      tax_id: (supplier as any).tax_id || "",
      website: supplier.website || "",
      notes: supplier.notes || "",
      is_active: supplier.is_active ?? true,
    });
    
    // Load organization data from supplier via anew_hierarchy
    const companyId = (supplier as any).organization_id || "";
    let tenantId = "";
    if (companyId) {
      const { data: hierarchyData } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", companyId)
        .maybeSingle();
      tenantId = hierarchyData?.parent_org_id || "";
    }
    
    setOrganizationSelection({
      tenantId: tenantId,
      companyId: companyId,
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
    });
    
    setOpen(true);
  };

  const handleDeleteClick = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!supplierToDelete) return;

    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", supplierToDelete.id);

      if (error) throw error;

      toast({
        title: t("suppliers.toast.deleteSuccess"),
      });

      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.deleteError"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const supplierData: any = {
        name: formData.name,
        contact_person: formData.contact_person || null,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        tax_id: formData.tax_id || null,
        website: formData.website || null,
        notes: formData.notes || null,
        is_active: formData.is_active,
        organization_id: organizationSelection.companyId || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("suppliers")
          .update(supplierData)
          .eq("id", editingId);

        if (error) throw error;

        toast({
          title: t("suppliers.toast.updateSuccess"),
        });
      } else {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) {
          toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.from("suppliers").insert({
          ...supplierData,
          created_by: businessUserId,
        });

        if (error) throw error;

        toast({
          title: t("suppliers.toast.createSuccess"),
        });
      }

      setOpen(false);
      setEditingId(null);
      resetForm();
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: editingId ? t("suppliers.toast.updateError") : t("suppliers.toast.createError"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      postal_code: "",
      country: "",
      tax_id: "",
      website: "",
      notes: "",
      is_active: true,
    });
    setOrganizationSelection({
      tenantId: "",
      companyId: activeCompany?.id || "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
    });
  };

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === suppliers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suppliers.map(s => s.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from("suppliers")
        .update({ is_active: bulkNewStatus })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({ 
        title: t('suppliers.toast.statusUpdated'),
        description: t('suppliers.toast.statusUpdatedDesc').replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkStatusDialogOpen(false);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.statusUpdateError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({ 
        title: t('suppliers.toast.bulkDeleteSuccess'),
        description: t('suppliers.toast.bulkDeleteSuccessDesc').replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.bulkDeleteError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const handleBulkCompanyUpdate = async () => {
    if (!bulkCompanyId || selectedIds.size === 0) return;
    try {
      const { error } = await supabase
        .from("suppliers")
        .update({ organization_id: bulkCompanyId })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      toast({
        title: t('suppliers.toast.companyUpdated') || "Empresa atualizada",
        description: (t('suppliers.toast.companyUpdatedDesc') || "{count} fornecedor(es) atualizado(s)").replace("{count}", String(selectedIds.size))
      });
      setSelectedIds(new Set());
      setBulkCompanyDialogOpen(false);
      setBulkCompanyId("");
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t('suppliers.toast.updateError') || "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    }
  };




  const handleExport = () => {
    downloadStandardXlsx({
      sheetName: "Fornecedores",
      columns: [
        { key: "name", header: t("suppliers.form.name"), width: 30 },
        { key: "contact", header: t("suppliers.form.contactPerson"), width: 26 },
        { key: "email", header: t("suppliers.form.email"), width: 30 },
        { key: "phone", header: t("suppliers.form.phone"), width: 18 },
        { key: "address", header: t("suppliers.form.address"), width: 36 },
        { key: "city", header: t("suppliers.form.city"), width: 20 },
        { key: "postalCode", header: t("suppliers.form.postalCode"), width: 16 },
        { key: "country", header: t("suppliers.form.country"), width: 16 },
        { key: "taxId", header: t("suppliers.form.taxId"), width: 16 },
        { key: "website", header: t("suppliers.form.website"), width: 28 },
        { key: "notes", header: t("suppliers.form.notes"), width: 36 },
        { key: "active", header: t("suppliers.form.active"), type: "boolean", width: 10 },
      ],
      rows: suppliers.map((supplier) => ({
        name: supplier.name,
        contact: (supplier as any).contact_person,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        city: supplier.city,
        postalCode: supplier.postal_code,
        country: supplier.country,
        taxId: (supplier as any).tax_id,
        website: supplier.website,
        notes: supplier.notes,
        active: supplier.is_active,
      })),
    }, `fornecedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    toast({
      title: t("suppliers.export.success"),
      description: t("suppliers.export.successDesc"),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error(t("suppliers.toast.emptyFile"));
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      if (!activeCompany?.id) throw new Error("No active company selected");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        throw new Error("Perfil de utilizador não encontrado.");
      }

      const dataLines = lines.slice(1);
      const suppliersToInsert = [];

      for (const line of dataLines) {
        const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        
        if (values.length < 1 || !values[0]) continue;

        suppliersToInsert.push({
          name: values[0],
          contact_person: values[1] || null,
          email: values[2] || null,
          phone: values[3] || null,
          address: values[4] || null,
          city: values[5] || null,
          postal_code: values[6] || null,
          country: values[7] || null,
          tax_id: values[8] || null,
          website: values[9] || null,
          notes: values[10] || null,
          is_active: values[11]?.toLowerCase() === 'yes' || values[11]?.toLowerCase() === 'sim' || values[11]?.toLowerCase() === 'sí' || values[11]?.toLowerCase() === 'oui' || values[11]?.toLowerCase() === 'ja',
          created_by: businessUserId,
          organization_id: activeCompany?.id,
        });
      }

      if (suppliersToInsert.length === 0) {
        throw new Error(t("suppliers.toast.noValidSuppliers"));
      }

      const { error } = await supabase.from("suppliers").insert(suppliersToInsert);
      
      if (error) throw error;

      toast({
        title: t("suppliers.toast.importSuccess"),
        description: t("suppliers.toast.importSuccessDesc").replace("{count}", String(suppliersToInsert.length)),
      });

      setImportDialogOpen(false);
      setSuppliers([]);
      setHasMore(true);
      loadSuppliers(0, true);
    } catch (error: any) {
      toast({
        title: t("suppliers.toast.importError"),
        description: error.message,
        variant: "destructive",
      });
    }
    
    e.target.value = '';
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCompanyFilter("all");
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || (companyFilter && companyFilter !== "all");

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany?.id && userType !== 'system_admin') {
    return (
      <>
        <div className="text-center py-12">
          <Building className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {t("suppliers.selectCompany")}
          </p>
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-3xl font-bold">{t("suppliers.title")}</h1><p className="text-muted-foreground">{t("suppliers.description")}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold">{t("suppliers.title")}</h1>
              <p className="text-muted-foreground">{t("suppliers.description")}</p>
            </div>
            <PageFAQSheet pageKey="operations.suppliers" />
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="suppliers.export">
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                {t("suppliers.actions.export")}
              </Button>
            </PermissionGate>
            <PermissionGate permission="suppliers.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    {t("suppliers.actions.import")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("suppliers.import.title")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t("suppliers.import.description")}
                    </p>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleImport}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="suppliers.create">
              <Button
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                  setOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("suppliers.newSupplier")}
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Filters Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                {/* Search Input */}
                <div className="flex-1 relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder={t('suppliers.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[150px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t('common.status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('suppliers.allStatus')}</SelectItem>
                    <SelectItem value="active">{t('suppliers.status.active')}</SelectItem>
                    <SelectItem value="inactive">{t('suppliers.status.inactive')}</SelectItem>
                  </SelectContent>
                </Select>

                {/* Organization Filter */}
                <Select
                  value={companyFilter || "all"}
                  onValueChange={(value) => {
                    setCompanyFilter(value);
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <Building2 className="w-4 h-4 mr-2" />
                    <SelectValue placeholder={t('common.company')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('suppliers.allCompanies')}</SelectItem>
                    {filterOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-2" />
                    {t('common.clearFilters')}
                  </Button>
                )}
              </div>

              {/* Results count */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t('suppliers.showingCount').replace("{current}", String(suppliers.length)).replace("{total}", String(totalCount))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Card */}
        <Card>
          <CardContent className="p-6">
            {/* Bulk Actions Bar */}
            <BulkActionsBar
              selectedCount={selectedIds.size}
              onStatusClick={() => setBulkStatusDialogOpen(true)}
              onDeleteClick={() => setBulkDeleteDialogOpen(true)}
              onOrgClick={() => setBulkCompanyDialogOpen(true)}
              onClearSelection={() => setSelectedIds(new Set())}
              showOrgAction={true}
              statusPermission="suppliers.edit"
              deletePermission="suppliers.delete"
            />

            {loading ? (
              <div className="text-center py-8">{t('common.loading')}</div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('suppliers.noSuppliers')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === suppliers.length && suppliers.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>{t('suppliers.form.name')}</TableHead>
                    <TableHead>{t('common.company')}</TableHead>
                    <TableHead>{t('suppliers.form.contactPerson')}</TableHead>
                    <TableHead>{t('suppliers.form.email')}</TableHead>
                    <TableHead>{t('suppliers.form.phone')}</TableHead>
                    <TableHead>{t('suppliers.form.city')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id} className={selectedIds.has(supplier.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(supplier.id)}
                          onCheckedChange={() => toggleSelectOne(supplier.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-primary" />
                          {supplier.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(supplier as any).anew_organizations?.name || "-"}
                      </TableCell>
                      <TableCell>{(supplier as any).contact_person || "-"}</TableCell>
                      <TableCell>
                        {supplier.email ? (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {supplier.email}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {supplier.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {supplier.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{supplier.city || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={supplier.is_active ? "default" : "secondary"}>
                          {supplier.is_active ? t('suppliers.status.active') : t('suppliers.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {supplier.website && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(supplier.website!, '_blank')}
                              title={t('suppliers.form.website')}
                            >
                              <Globe className="h-4 w-4" />
                            </Button>
                          )}
                          <PermissionGate permission="suppliers.edit">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(supplier)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="suppliers.delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteClick(supplier, e)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Infinite Scroll Sentinel */}
            {suppliers.length > 0 && (
              <div ref={loadMoreRef} className="flex justify-center py-4">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <OlyviaLoader size={20} inline />
                    <span className="text-sm">{t('common.loadingMore')}</span>
                  </div>
                )}
                {!hasMore && !loading && (
                  <span className="text-sm text-muted-foreground">
                    {t('suppliers.showingCount').replace("{current}", String(suppliers.length)).replace("{total}", String(totalCount))}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Dialog */}
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setEditingId(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? t("suppliers.editSupplier") : t("suppliers.newSupplier")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Organization Selection */}
              <OrganizationFormSection
                value={organizationSelection}
                onChange={setOrganizationSelection}
                showSecondaryCompanies={false}
                multiSelectCompanies={true}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="name">{t("suppliers.form.name")} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_person">{t("suppliers.form.contactPerson")}</Label>
                  <Input
                    id="contact_person"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("suppliers.form.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("suppliers.form.phone")}</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax_id">{t("suppliers.form.taxId")}</Label>
                  <Input
                    id="tax_id"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="address">{t("suppliers.form.address")}</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t("suppliers.form.city")}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">{t("suppliers.form.postalCode")}</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t("suppliers.form.country")}</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">{t("suppliers.form.website")}</Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="notes">{t("suppliers.form.notes")}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Checkbox
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">{t("suppliers.form.active")}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("suppliers.form.cancel")}
                </Button>
                <Button type="submit">{editingId ? t("suppliers.form.update") : t("suppliers.form.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.delete.description').replace("{name}", supplierToDelete?.name || "")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Status Change Dialog */}
        <AlertDialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.bulkStatus.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.bulkStatus.description').replace("{count}", String(selectedIds.size))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Select value={bulkNewStatus ? "active" : "inactive"} onValueChange={(value) => setBulkNewStatus(value === "active")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('suppliers.status.active')}</SelectItem>
                  <SelectItem value="inactive">{t('suppliers.status.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkStatusChange}>
                {t('common.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('suppliers.bulkDelete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('suppliers.bulkDelete.description').replace("{count}", String(selectedIds.size))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Company Dialog */}
        <Dialog open={bulkCompanyDialogOpen} onOpenChange={(open) => {
          setBulkCompanyDialogOpen(open);
          if (!open) {
            setBulkCompanyId("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('common.changeOrg') || 'Alterar Empresa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {(t('suppliers.bulkCompany.description') || 'Alterar empresa de {count} fornecedor(es)').replace("{count}", String(selectedIds.size))}
              </p>
              <div className="space-y-2">
                <Label>{t('common.company')}</Label>
                <Select value={bulkCompanyId} onValueChange={setBulkCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.selectCompany') || 'Selecione uma empresa'} />
                  </SelectTrigger>
                  <SelectContent>
                    {filterOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkCompanyDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleBulkCompanyUpdate} disabled={!bulkCompanyId}>
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </>
  );
};

export default Suppliers;
