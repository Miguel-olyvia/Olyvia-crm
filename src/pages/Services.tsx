import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Wrench, Pencil, Trash2, DollarSign, History, Copy, Download, Upload, RotateCcw } from "lucide-react";
import { exportServicesToCSV, parseServicesCSV, downloadServicesTemplate, type ImportReport } from "@/utils/servicesExportImport";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { Input } from "@/components/ui/input";
import ServicePricesDialog from "@/components/ServicePricesDialog";
import ServicePriceHistoryDialog from "@/components/ServicePriceHistoryDialog";
import ServiceFormPrices, { ServicePriceFormData } from "@/components/ServiceFormPrices";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog } from "@/components/BulkActionDialogs";
import { useBulkActions } from "@/hooks/useBulkActions";
import { OrganizationFormSection, type OrganizationSelection } from "@/components/OrganizationFormSection";

interface Service {
  id: string;
  sku: string;
  name: string;
  short_desc: string | null;
  long_desc: string | null;
  is_active: boolean;
  is_deleted?: boolean;
  service_type: string;
  organization_id?: string | null;
  root_organization_id?: string | null;
  
  service_category_id?: string | null;
  service_subcategory_id?: string | null;
  service_categories?: { name: string };
  subcategory?: { name: string };
  anew_organizations?: { name: string };
  service_organizations?: Array<{
    organization_id: string;
  }>;
}

const serviceSchema = z.object({
  sku: z.string().trim().min(1, "O SKU é obrigatório.").max(100, "O SKU deve ter menos de 100 caracteres."),
  name: z.string().trim().min(1, "O nome é obrigatório.").max(200, "O nome deve ter menos de 200 caracteres."),
  description: z.string().trim().max(2000, "A descrição deve ter menos de 2000 caracteres.").optional().or(z.literal("")),
  category_id: z.string().optional().or(z.literal("")),
  subcategory_id: z.string().optional().or(z.literal("")),
  service_type: z.string().trim().min(1, "O tipo de serviço é obrigatório."),
  status: z.string().trim().min(1, "O estado é obrigatório."),
});

// Helper functions for organization selection compatibility
const getPrimaryOrgId = (sel: any): string | null => sel?.companyId || sel?.levelSelections?.[0]?.id || null;
const getAllOrgIds = (sel: any): string[] => {
  if (sel?.selectedCompanyIds?.length) return sel.selectedCompanyIds;
  if (sel?.levelSelections?.length) return sel.levelSelections.map((l: any) => l.id);
  if (sel?.companyId) return [sel.companyId];
  return [];
};

export default function Services() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { companies: userCompanies, userType, activeCompany } = useCompany();
  const allOrgIdsRef = useRef<string[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingCell, setEditingCell] = useState<{serviceId: string; field: string} | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [pricesDialogOpen, setPricesDialogOpen] = useState(false);
  const [priceHistoryDialogOpen, setPriceHistoryDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    category_id: "",
    subcategory_id: "",
    service_type: "both",
    status: "active",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [priceData, setPriceData] = useState<ServicePriceFormData>({
    purchase: 0,
    retail: 0,
    currency: "EUR",
    vat_rate: 23,
  });

  const defaultOrgSelection = (): OrganizationSelection => ({
    tenantId: "",
    companyId: activeCompany?.id || "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
    selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
    levelSelections: [],
  });
  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>(defaultOrgSelection);

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("services.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Reload when active company changes
  useEffect(() => {
    setServices([]);
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setCompanyFilter("all");
    setSupplierFilter("all");
    setSearchTerm("");
    loadData();
  }, [activeCompany?.id, showDeleted]);

  const loadData = async () => {
    setLoading(true);

    // Only fetch if we have an active company
    if (!activeCompany?.id) {
      setServices([]);
      setCategories([]);
      setSubcategories([]);
      setCompanies([]);
      setSuppliers([]);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Collect active company + descendants only (do not include sibling organizations)
      const { data: hierarchy } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id")
        .order("created_at");

      const childMap = new Map<string, string[]>();
      (hierarchy || []).forEach((h: any) => {
        const children = childMap.get(h.parent_org_id) || [];
        children.push(h.child_org_id);
        childMap.set(h.parent_org_id, children);
      });

      const allOrgIds: string[] = [activeCompany.id];
      const queue = [activeCompany.id];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        for (const childId of childMap.get(currentId) || []) {
          if (!allOrgIds.includes(childId)) {
            allOrgIds.push(childId);
            queue.push(childId);
          }
        }
      }

      // Store for use in copyLastService
      allOrgIdsRef.current = allOrgIds;

      const orgScopeFilter = `organization_id.in.(${allOrgIds.join(',')}),organization_id.is.null`;

      // Filter by active company subtree only
      const servicesQuery = (supabase as any)
        .from("services")
        .select(`
          *,
          service_categories!service_category_id(name),
          subcategory:service_categories!service_subcategory_id(name),
          anew_organizations!organization_id(name)
        `)
        .in("organization_id", allOrgIds)
        .eq("is_deleted", showDeleted);

      const categoriesQuery = supabase
        .from("service_categories")
        .select("id, name, parent_id, organization_id")
        .or(orgScopeFilter)
        .order("name");

      const companiesQuery = supabase
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", allOrgIds)
        .order("name");

      const [servicesRes, categoriesRes, companiesRes] = await Promise.all([
        servicesQuery.order("name"),
        categoriesQuery,
        companiesQuery,
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (companiesRes.error) throw companiesRes.error;

      const scopedCategories = categoriesRes.data || [];

      // Load service organization associations separately
      const loadedServices = servicesRes.data || [];
      const serviceIds = loadedServices.map((s: any) => s.id);
      let serviceOrgsMap = new Map<string, string[]>();
      if (serviceIds.length > 0) {
        const { data: serviceOrgs } = await supabase
          .from("service_organizations")
          .select("service_id, organization_id")
          .in("service_id", serviceIds);
        (serviceOrgs || []).forEach((so: any) => {
          const arr = serviceOrgsMap.get(so.service_id) || [];
          arr.push(so.organization_id);
          serviceOrgsMap.set(so.service_id, arr);
        });
      }

      const servicesWithOrgs = loadedServices.map((s: any) => ({
        ...s,
        service_organizations: (serviceOrgsMap.get(s.id) || []).map((orgId: string) => ({ organization_id: orgId })),
      }));

      setServices(servicesWithOrgs);
      setCategories(scopedCategories.filter((category: any) => !category.parent_id));
      setSubcategories(scopedCategories.filter((category: any) => !!category.parent_id));
      setCompanies(companiesRes.data || []);
    } catch (error: any) {
      toast({
        title: t("services.toast.loadError"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = serviceSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) errors[error.path[0].toString()] = error.message;
      });
      setFieldErrors(errors);
      const firstError = validation.error.errors[0];
      toast({ title: t("common.error") || "Erro", description: firstError.message, variant: "destructive" });
      return;
    }
    setFieldErrors({});

    // Determine the primary company - use selected or active company
    const primaryCompanyId = (organizationSelection?.companyId || organizationSelection?.levelSelections?.[0]?.selectedIds?.[0]) || activeCompany?.id || null;

    if (!primaryCompanyId) {
      toast({
        title: t("services.toast.companyRequired"),
        description: t("services.toast.selectCompany"),
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const slug = formData.name.toLowerCase().replace(/\s+/g, "-");
      const longDesc = formData.description ? formData.description : null;
      const categoryId = formData.category_id ? formData.category_id : null;
      const subcategoryId = formData.subcategory_id ? formData.subcategory_id : null;
      const isActive = formData.status === "active";
      const allOrgIds = getAllOrgIds(organizationSelection);

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      await withAuditContext(supabase, businessUserId, async () => {
        if (editingService) {
          const { error } = await supabase.rpc("rpc_update_service", {
            p_id: editingService.id,
            p_sku: formData.sku,
            p_name: formData.name,
            p_slug: slug,
            p_long_desc: longDesc,
            p_service_type: formData.service_type,
            p_is_active: isActive,
            p_organization_id: primaryCompanyId,
            p_category_id: categoryId,
            p_subcategory_id: subcategoryId,
            p_org_ids: allOrgIds.length > 0 ? allOrgIds : null,
            p_touch_orgs: true,
            p_touch_prices: true,
            p_purchase: priceData.purchase || 0,
            p_retail: priceData.retail || 0,
            p_currency: priceData.currency,
            p_vat_rate: priceData.vat_rate,
          });

          if (error) throw error;

          toast({
            title: t("services.toast.updateSuccess"),
          });
        } else {
          const { error } = await supabase.rpc("rpc_create_service", {
            p_sku: formData.sku,
            p_name: formData.name,
            p_slug: slug,
            p_long_desc: longDesc,
            p_service_type: formData.service_type,
            p_is_active: isActive,
            p_organization_id: primaryCompanyId,
            p_category_id: categoryId,
            p_subcategory_id: subcategoryId,
            p_org_ids: allOrgIds.length > 0 ? allOrgIds : null,
            p_purchase: priceData.purchase || 0,
            p_retail: priceData.retail || 0,
            p_currency: priceData.currency,
            p_vat_rate: priceData.vat_rate,
          });

          if (error) throw error;

          toast({
            title: t("services.toast.createSuccess"),
          });
        }
      });

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: editingService ? t("services.toast.updateError") : t("services.toast.createError"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDeleteDialog = (service: Service) => {
    setServiceToDelete(service);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!serviceToDelete) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase.rpc("rpc_delete_service", { p_id: serviceToDelete.id });
        if (error) throw error;
      });

      toast({
        title: t("services.toast.success"),
        description: t("services.toast.deleteSuccess"),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t("services.toast.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
    }
  };

  const handleRestore = async (service: Service) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_service", { p_id: service.id });
      if (error) throw error;

      toast({
        title: t("services.toast.success") || "Sucesso",
        description: t("services.toast.restoreSuccess") || "Serviço restaurado com sucesso.",
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t("services.toast.error") || "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    try {
      await exportServicesToCSV(filteredServices, activeCompany?.id);
      toast({ title: "Exportação concluída" });
    } catch (error: any) {
      toast({
        title: "Erro ao exportar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadTemplate = () => {
    try {
      downloadServicesTemplate();
    } catch (error: any) {
      toast({
        title: "Erro ao gerar template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const files = inputEl.files;
    if (!files || files.length === 0) return;

    if (!activeCompany?.id) {
      toast({
        title: "Empresa não definida",
        description: "Selecione uma empresa ativa antes de importar.",
        variant: "destructive",
      });
      if (inputEl) inputEl.value = "";
      return;
    }

    setImporting(true);
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const aggregate: ImportReport = {
        total: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      };

      for (const file of Array.from(files)) {
        const report = await parseServicesCSV(file, activeCompany.id, businessUserId);
        aggregate.total += report.total;
        aggregate.inserted += report.inserted;
        aggregate.updated += report.updated;
        aggregate.skipped += report.skipped;
        aggregate.errors.push(...report.errors);
      }

      setImportReport(aggregate);
      setImportDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao importar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (inputEl) inputEl.value = "";
    }
  };

  const openEditDialog = async (service: Service) => {
    setEditingService(service);
    setFormData({
      sku: service.sku,
      name: service.name,
      description: service.long_desc || "",
      category_id: service.service_category_id || "",
      subcategory_id: service.service_subcategory_id || "",
      service_type: service.service_type || "both",
      status: service.is_active ? "active" : "inactive",
    });

    // Load prices for service
    const { data: prices } = await supabase
      .from("service_prices")
      .select("price_type, price, currency, vat_rate")
      .eq("service_id", service.id);

    if (prices && prices.length > 0) {
      const priceMap: ServicePriceFormData = {
        purchase: 0,
        retail: 0,
        currency: "EUR",
        vat_rate: 23,
      };
      prices.forEach(p => {
        if (p.price_type === "purchase") priceMap.purchase = p.price || 0;
        if (p.price_type === "retail") priceMap.retail = p.price || 0;
        if (p.currency) priceMap.currency = p.currency;
        if (p.vat_rate !== null) priceMap.vat_rate = p.vat_rate;
      });
      setPriceData(priceMap);
    } else {
      setPriceData({ purchase: 0, retail: 0, currency: "EUR", vat_rate: 23 });
    }

    // Load associated companies from service_companies table
    const { data: serviceOrgs } = await supabase
      .from("service_organizations")
      .select("organization_id")
      .eq("service_id", service.id);

    const associatedOrgIds = serviceOrgs?.map((sc: any) => sc.organization_id) || [];
    const primaryOrgId = service.organization_id || (associatedOrgIds.length > 0 ? associatedOrgIds[0] : "");
    const secondaryIds = associatedOrgIds.filter(id => id !== primaryOrgId);

    // Set organization selection for editing from the real associations
    setOrganizationSelection({
      tenantId: primaryOrgId,
      companyId: primaryOrgId,
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: secondaryIds,
      selectedCompanyIds: associatedOrgIds.length > 0 ? associatedOrgIds : (primaryOrgId ? [primaryOrgId] : []),
      levelSelections: [],
    });

    setOpen(true);
  };

  const resetForm = () => {
    setEditingService(null);
    setFormData({
      sku: "",
      name: "",
      description: "",
      category_id: "",
      subcategory_id: "",
      service_type: "both",
      status: "active",
    });
    setFieldErrors({});
    setPriceData({
      purchase: 0,
      retail: 0,
      currency: "EUR",
      vat_rate: 23,
    });
    setOrganizationSelection(defaultOrgSelection());
  };

  const handleCloseDialog = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  const startEditing = (serviceId: string, field: string, currentValue: string) => {
    if (!hasPermission("services.edit")) return;
    setEditingCell({ serviceId, field });
    setEditingValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const saveInlineEdit = async (serviceId: string, field: string) => {
    if (!editingValue.trim()) {
      cancelEditing();
      return;
    }

    try {
      const currentService = services.find((s) => s.id === serviceId);
      if (!currentService) throw new Error("Serviço não encontrado.");

      const updatedValue = editingValue.trim();
      const nextSku = field === "sku" ? updatedValue : currentService.sku;
      const nextName = field === "name" ? updatedValue : currentService.name;
      const nextSlug = nextName.toLowerCase().replace(/\s+/g, "-");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase.rpc("rpc_update_service", {
          p_id: serviceId,
          p_sku: nextSku,
          p_name: nextName,
          p_slug: nextSlug,
          p_long_desc: currentService.long_desc || null,
          p_service_type: currentService.service_type,
          p_is_active: currentService.is_active,
          p_organization_id: currentService.organization_id || null,
          p_category_id: currentService.service_category_id || null,
          p_subcategory_id: currentService.service_subcategory_id || null,
          p_org_ids: null,
          p_touch_orgs: false,
          p_touch_prices: false,
          p_purchase: null,
          p_retail: null,
          p_currency: null,
          p_vat_rate: null,
        });

        if (error) throw error;
      });

      toast({
        title: t("services.toast.inlineUpdateSuccess"),
        description: t("services.toast.changesSaved"),
      });

      cancelEditing();
      loadData();
    } catch (error: any) {
      toast({
        title: t("services.toast.inlineUpdateError"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, serviceId: string, field: string) => {
    if (e.key === "Enter") {
      saveInlineEdit(serviceId, field);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // Copy last service functionality
  const copyLastService = async () => {
    try {
      // Get the last created service
      let copyQuery = (supabase
        .from("services") as any)
        .select(`
          *,
          service_organizations(organization_id)
        `)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (allOrgIdsRef.current.length > 0) {
        copyQuery = copyQuery.in("organization_id", allOrgIdsRef.current);
      }

      const { data: lastService, error } = await copyQuery.single();

      if (error || !lastService) {
        toast({
          title: t('services.toast.noServiceToCopy') || "Sem serviços para copiar",
          variant: "destructive",
        });
        return;
      }

      // Fetch prices
      const { data: pricesData } = await supabase
        .from("service_prices")
        .select("price_type, price, currency, vat_rate")
        .eq("service_id", lastService.id);

      // Set form data (with empty SKU - user must provide new one)
      setFormData({
        sku: "", // Empty SKU - user must provide new one
        name: lastService.name || "",
        description: lastService.short_desc || "",
        category_id: lastService.service_category_id || "",
        subcategory_id: lastService.service_subcategory_id || "",
        service_type: lastService.service_type || "both",
        status: lastService.is_active ? "active" : "inactive",
      });

      // Set organization
      const orgIds = lastService.service_organizations?.map((sc: any) => sc.organization_id) || [];
      setOrganizationSelection(defaultOrgSelection());

      // Set prices
      const loadedPrices: ServicePriceFormData = {
        purchase: 0,
        retail: 0,
        currency: 'EUR',
        vat_rate: 23
      };
      pricesData?.forEach(p => {
        if (p.price_type === 'purchase') loadedPrices.purchase = p.price || 0;
        if (p.price_type === 'retail') loadedPrices.retail = p.price || 0;
        if (p.currency) loadedPrices.currency = p.currency;
        if (p.vat_rate !== null) loadedPrices.vat_rate = p.vat_rate;
      });
      setPriceData(loadedPrices);

      toast({
        title: t('services.toast.serviceCopied') || "Serviço copiado",
        description: t('services.toast.serviceCopiedDesc') || "Dados do último serviço carregados. Insira um novo SKU.",
      });
    } catch (error: any) {
      toast({
        title: t('services.toast.copyError') || "Erro ao copiar serviço",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const selectedOrgId = getPrimaryOrgId(organizationSelection);
  const filteredCategoriesForForm = selectedOrgId
    ? categories.filter(cat => cat.organization_id === selectedOrgId || cat.organization_id === null)
    : categories;

  const filteredServices = services.filter((service) => {
    const serviceOrgIds = service.service_organizations?.map((serviceOrg) => serviceOrg.organization_id) || [];
    const matchesSearch =
      service.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || service.service_category_id === categoryFilter;
    const matchesSubcategory = subcategoryFilter === "all" || service.service_subcategory_id === subcategoryFilter;
    const matchesCompany = companyFilter === "all" || service.organization_id === companyFilter || serviceOrgIds.includes(companyFilter);
    const matchesSupplier = supplierFilter === "all";
    
    return matchesSearch && matchesCategory && matchesSubcategory && matchesCompany && matchesSupplier;
  });

  // Bulk actions hook - must be after loadData and filteredServices
  const bulkActions = useBulkActions({
    tableName: "services",
    onSuccess: loadData,
    softDelete: false,
    organizationId: activeCompany?.id,
    bulkStatusRpc: "rpc_bulk_status_service",
    bulkDeleteRpc: "rpc_bulk_delete_service",
    bulkOrgRpc: "rpc_bulk_org_service",
    bulkOrgRpcNewOrgParam: "p_new_org_id",
  });

  const toggleSelectAll = () => {
    const allIds = filteredServices.map((s) => s.id);
    bulkActions.toggleSelectAll(allIds);
  };

  const toggleSelectOne = (id: string) => {
    bulkActions.toggleSelectOne(id);
  };

  const allSelected = filteredServices.length > 0 && filteredServices.every((s) => bulkActions.selectedIds.has(s.id));
  const someSelected = filteredServices.some((s) => bulkActions.selectedIds.has(s.id));

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wrench className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t("services.title")}</h1>
            <PageFAQSheet pageKey="catalog.services" />
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="services.delete">
              <Button
                variant={showDeleted ? "secondary" : "outline"}
                onClick={() => setShowDeleted((prev) => !prev)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {showDeleted ? "Ver ativos" : "Ver eliminados"}
              </Button>
            </PermissionGate>
            <PermissionGate permission="services.view">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Exportar
              </Button>
            </PermissionGate>
            <PermissionGate permission="services.create">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> Importar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Importar Serviços</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Carregue um ficheiro CSV. Serviços com SKU existente serão atualizados; novos SKUs serão criados.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                        <Download className="mr-2 h-4 w-4" />
                        Template
                      </Button>
                    </div>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      multiple
                      onChange={handleImport}
                      disabled={importing}
                    />
                    {importing && (
                      <p className="text-xs text-muted-foreground">A importar…</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            <PermissionGate permission="services.create">
              <Button onClick={() => { resetForm(); setOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t("services.addService")}
              </Button>
            </PermissionGate>
          </div>

          {/* Import report dialog */}
          <Dialog open={!!importReport} onOpenChange={(o) => { if (!o) setImportReport(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Relatório de Importação</DialogTitle>
              </DialogHeader>
              {importReport && (
                <div className="space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="rounded-md border p-3">
                      <div className="text-2xl font-semibold text-primary">{importReport.inserted}</div>
                      <div className="text-xs text-muted-foreground">Inseridos</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-2xl font-semibold text-primary">{importReport.updated}</div>
                      <div className="text-xs text-muted-foreground">Atualizados</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-2xl font-semibold text-muted-foreground">{importReport.skipped}</div>
                      <div className="text-xs text-muted-foreground">Ignorados</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-2xl font-semibold text-destructive">{importReport.errors.length}</div>
                      <div className="text-xs text-muted-foreground">Erros</div>
                    </div>
                  </div>
                  {importReport.errors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Erros</h4>
                      <div className="max-h-60 overflow-y-auto rounded-md border p-2 text-xs space-y-1">
                        {importReport.errors.map((err, idx) => (
                          <div key={idx} className="text-destructive">
                            Linha {err.row} ({err.sku || "—"}): {err.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingService ? t("services.dialog.editTitle") : t("services.dialog.newTitle")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Copy Last Service Button */}
                {!editingService && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={copyLastService}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {t('services.copyLast')}
                  </Button>
                )}

                {/* SKU */}
                <div className="space-y-2">
                  <Label htmlFor="sku">{t("services.form.sku")} <span className="text-destructive">*</span></Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    required
                    disabled={!!editingService}
                    className={fieldErrors.sku ? "border-destructive" : ""}
                  />
                  {fieldErrors.sku && <p className="text-sm text-destructive">{fieldErrors.sku}</p>}
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">{t("services.form.name")} <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className={fieldErrors.name ? "border-destructive" : ""}
                  />
                  {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">{t("services.form.description") || "Descrição"}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className={fieldErrors.description ? "border-destructive" : ""}
                  />
                  {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
                </div>

                {/* Category + Subcategory */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">{t("services.form.category")}</Label>
                    <Select
                      value={formData.category_id || "none"}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value === "none" ? "" : value, subcategory_id: "" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("services.form.none")}</SelectItem>
                        {filteredCategoriesForForm.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subcategory">{t("services.form.subcategory")}</Label>
                    <Select
                      value={formData.subcategory_id || "none"}
                      onValueChange={(value) => setFormData({ ...formData, subcategory_id: value === "none" ? "" : value })}
                      disabled={!formData.category_id}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("services.form.none")}</SelectItem>
                        {subcategories
                          .filter(sub => sub.parent_id === formData.category_id)
                          .map((subcategory) => (
                            <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Organization Section */}
                <OrganizationFormSection
                  value={organizationSelection}
                  onChange={(val) => {
                    setOrganizationSelection(val);
                    // Reset dependent fields when org changes
                    if (getPrimaryOrgId(val) !== getPrimaryOrgId(organizationSelection)) {
                      setFormData(prev => ({ ...prev, category_id: "", subcategory_id: "" }));
                    }
                  }}
                  showBusinessUnit={false}
                  showDepartment={false}
                  multiSelectCompanies={true}
                  activeOrganizationOnly
                />


                {/* Service Type + Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service_type">{t("services.form.serviceType")}</Label>
                    <Select
                      value={formData.service_type}
                      onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sale">{t("services.type.sale")}</SelectItem>
                        <SelectItem value="purchase">{t("services.type.purchase")}</SelectItem>
                        <SelectItem value="both">{t("services.type.both")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">{t("services.form.status")}</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("services.status.active")}</SelectItem>
                        <SelectItem value="inactive">{t("services.status.inactive")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Prices Section */}
                <ServiceFormPrices
                  prices={priceData}
                  onChange={setPriceData}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleCloseDialog(false)}>
                    {t("services.form.cancel")}
                  </Button>
                  <Button type="submit">
                    {editingService ? t("services.form.update") : t("services.form.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t("services.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("services.filter.allCategories")} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">{t("services.filter.allCategories")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("services.filter.allSubcategories") || "Todas Subcategorias"} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">{t("services.filter.allSubcategories") || "Todas Subcategorias"}</SelectItem>
                {subcategories
                  .filter((subcategory) => categoryFilter === "all" || subcategory.parent_id === categoryFilter)
                  .map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("services.filter.allCompanies") || "Todas Empresas"} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">{t("services.filter.allCompanies") || "Todas Empresas"}</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>
        </div>

        <BulkActionsBar
          selectedCount={bulkActions.selectedIds.size}
          onStatusClick={() => bulkActions.setBulkStatusDialogOpen(true)}
          onDeleteClick={() => bulkActions.setBulkDeleteDialogOpen(true)}
          onClearSelection={bulkActions.clearSelection}
          showOrgAction={false}
          statusPermission="services.edit"
          deletePermission="services.delete"
        />

        <div className="mb-2 text-sm text-muted-foreground">
          💡 {t("services.inlineEditHint")}
        </div>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t('common.selectAll')}
                    className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                </TableHead>
                <TableHead>{t("services.table.sku")}</TableHead>
                <TableHead>{t("services.table.name")}</TableHead>
                <TableHead>{t("services.table.type")}</TableHead>
                <TableHead>{t("services.table.category")}</TableHead>
                <TableHead>{t("services.table.company")}</TableHead>
                
                <TableHead>{t("services.table.status")}</TableHead>
                <TableHead className="text-right">{t("services.table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">{t("services.loading")}</TableCell>
                </TableRow>
              ) : filteredServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">{t("services.noServices")}</TableCell>
                </TableRow>
              ) : (
                filteredServices.map((service) => (
                  <TableRow key={service.id} className={bulkActions.selectedIds.has(service.id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={bulkActions.selectedIds.has(service.id)}
                        onCheckedChange={() => toggleSelectOne(service.id)}
                        aria-label={t('common.select')}
                      />
                    </TableCell>
                    <TableCell 
                      className="font-medium cursor-pointer hover:bg-muted/50"
                      onDoubleClick={() => startEditing(service.id, "sku", service.sku)}
                    >
                      {editingCell?.serviceId === service.id && editingCell?.field === "sku" ? (
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveInlineEdit(service.id, "sku")}
                          onKeyDown={(e) => handleKeyDown(e, service.id, "sku")}
                          autoFocus
                          className="h-8"
                        />
                      ) : (
                        service.sku
                      )}
                    </TableCell>
                    <TableCell 
                      className="cursor-pointer hover:bg-muted/50"
                      onDoubleClick={() => startEditing(service.id, "name", service.name)}
                    >
                      {editingCell?.serviceId === service.id && editingCell?.field === "name" ? (
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveInlineEdit(service.id, "name")}
                          onKeyDown={(e) => handleKeyDown(e, service.id, "name")}
                          autoFocus
                          className="h-8"
                        />
                      ) : (
                        service.name
                      )}
                    </TableCell>
                    <TableCell>
                      {service.service_type === "purchase" && t("services.type.purchase")}
                      {service.service_type === "sale" && t("services.type.sale")}
                      {service.service_type === "both" && t("services.type.both")}
                    </TableCell>
                    <TableCell>{service.service_categories?.name || "-"}</TableCell>
                    <TableCell>{service.anew_organizations?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={service.is_active ? "default" : "secondary"}>
                        {service.is_active ? t("services.status.active") : t("services.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGate permission="services.manage_prices">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedService(service);
                              setPricesDialogOpen(true);
                            }}
                            title={t("services.actions.managePrices")}
                          >
                            <DollarSign className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate permission="services.view">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedService(service);
                              setPriceHistoryDialogOpen(true);
                            }}
                            title={t("services.actions.priceHistory")}
                          >
                            <History className="w-4 h-4" />
                          </Button>
                        </PermissionGate>
                        {!showDeleted && (
                          <PermissionGate permission="services.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(service)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                        )}
                        <PermissionGate permission="services.delete">
                          {showDeleted ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRestore(service)}
                              title="Restaurar"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteDialog(service)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
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

      {selectedService && (
        <>
          <ServicePricesDialog
            open={pricesDialogOpen}
            onOpenChange={(open) => {
              setPricesDialogOpen(open);
              if (!open) {
                setSelectedService(null);
                loadData();
              }
            }}
            serviceId={selectedService.id}
            serviceName={selectedService.name}
          />
          <ServicePriceHistoryDialog
            open={priceHistoryDialogOpen}
            onOpenChange={(open) => {
              setPriceHistoryDialogOpen(open);
              if (!open) {
                setSelectedService(null);
              }
            }}
            serviceId={selectedService.id}
            serviceName={selectedService.name}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("services.delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {serviceToDelete && (
                <>
                  {t("services.delete.confirmMessage", { name: serviceToDelete.name })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("services.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t("services.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Dialogs */}
      <BulkStatusDialog
        open={bulkActions.bulkStatusDialogOpen}
        onOpenChange={bulkActions.setBulkStatusDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        status={bulkActions.bulkNewStatus}
        onStatusChange={bulkActions.setBulkNewStatus}
        onConfirm={() => bulkActions.handleBulkStatusChange("is_active")}
        processing={bulkActions.processing}
      />

      <BulkDeleteDialog
        open={bulkActions.bulkDeleteDialogOpen}
        onOpenChange={bulkActions.setBulkDeleteDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        onConfirm={bulkActions.handleBulkDelete}
        processing={bulkActions.processing}
      />
    </>
  );
}
