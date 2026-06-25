import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { useBulkActions } from "@/hooks/useBulkActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Package, Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Download, Upload, Loader2 } from "lucide-react";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog } from "@/components/BulkActionDialogs";
import BundleFormDialog from "@/components/bundles/BundleFormDialog";
import { formatCurrency } from "@/lib/utils";
import { exportBundlesToCSV, parseBundlesCSV, downloadBundlesTemplate } from "@/utils/bundlesExportImport";
import { PermissionGate } from "@/components/PermissionGate";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Bundle {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  pricing_type: string;
  fixed_price: number | null;
  discount_percent: number | null;
  discount_fixed: number | null;
  is_active: boolean;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  components_count?: number;
  original_price?: number;
  final_price?: number;
}

type SortField = 'sku' | 'name' | 'status' | 'final_price' | 'components_count';
type SortDirection = 'asc' | 'desc' | null;

const Bundles = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission, isSystemAdmin, loading: permissionsLoading } = usePermissions();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  
  // System admins and super admins have full access
  const hasFullAccess = isSystemAdmin;

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pricingTypeFilter, setPricingTypeFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editBundle, setEditBundle] = useState<Bundle | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(false);
  
  // Import/Export state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Debounced search
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadBundles = useCallback(async () => {
    if (!activeCompany?.id) return;

    try {
      setLoading(true);

      let query = supabase
        .from("bundles")
        .select(`*, bundle_components(id, quantity, pricing_mode, custom_price, custom_discount_percent, custom_discount_fixed, product_id, service_id, choice_group_id, is_optional)`)
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (pricingTypeFilter !== "all") {
        query = query.eq("pricing_type", pricingTypeFilter as "custom" | "fixed_discount" | "fixed_price" | "percentage_discount");
      }

      if (debouncedSearchTerm.trim()) {
        const searchLower = debouncedSearchTerm.toLowerCase().trim();
        query = query.or(`sku.ilike.%${searchLower}%,name.ilike.%${searchLower}%,description.ilike.%${searchLower}%`);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      const bundlesRaw = data || [];
      const bundleIds = bundlesRaw.map((b: any) => b.id);

      // Batch fetch: choice groups + retail prices for all components in 3 queries
      const allComponents = bundlesRaw.flatMap((b: any) => (b.bundle_components || []).map((c: any) => ({ ...c, bundle_id: b.id })));
      const productIds = Array.from(new Set(allComponents.map((c: any) => c.product_id).filter(Boolean)));
      const serviceIds = Array.from(new Set(allComponents.map((c: any) => c.service_id).filter(Boolean)));

      const [choiceGroupsRes, productPricesRes, servicePricesRes] = await Promise.all([
        bundleIds.length
          ? supabase.from("bundle_choice_groups").select("id, bundle_id, min_selections, is_required").in("bundle_id", bundleIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length
          ? supabase.from("product_prices").select("product_id, price, created_at").in("product_id", productIds).eq("price_type", "retail").order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        serviceIds.length
          ? supabase.from("service_prices").select("service_id, price, created_at").in("service_id", serviceIds).eq("price_type", "retail").order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Build lookup maps (latest price wins thanks to order desc)
      const productPriceMap = new Map<string, number>();
      for (const pp of (productPricesRes.data || []) as any[]) {
        if (!productPriceMap.has(pp.product_id)) productPriceMap.set(pp.product_id, Number(pp.price) || 0);
      }
      const servicePriceMap = new Map<string, number>();
      for (const sp of (servicePricesRes.data || []) as any[]) {
        if (!servicePriceMap.has(sp.service_id)) servicePriceMap.set(sp.service_id, Number(sp.price) || 0);
      }
      const choiceGroupsByBundle = new Map<string, any[]>();
      for (const g of (choiceGroupsRes.data || []) as any[]) {
        if (!choiceGroupsByBundle.has(g.bundle_id)) choiceGroupsByBundle.set(g.bundle_id, []);
        choiceGroupsByBundle.get(g.bundle_id)!.push(g);
      }

      const getRetailPrice = (c: any): number => {
        if (c.product_id) return productPriceMap.get(c.product_id) || 0;
        if (c.service_id) return servicePriceMap.get(c.service_id) || 0;
        return 0;
      };

      const getComponentLinePrice = (c: any): number => {
        const retail = getRetailPrice(c);
        let unit = retail;
        if (c.pricing_mode === 'custom_price' && c.custom_price !== null && c.custom_price !== undefined) {
          unit = Number(c.custom_price) || 0;
        } else if (c.pricing_mode === 'custom_discount_percent' && c.custom_discount_percent) {
          unit = retail * (1 - Number(c.custom_discount_percent) / 100);
        } else if (c.pricing_mode === 'custom_discount_fixed' && c.custom_discount_fixed) {
          unit = Math.max(0, retail - Number(c.custom_discount_fixed));
        }
        return unit * (Number(c.quantity) || 1);
      };

      const bundlesWithPrices = bundlesRaw.map((bundle: any) => {
        const components = (bundle.bundle_components || []) as any[];
        const componentsCount = components.length;

        // Original price: sum of all (non-optional) component line prices
        const originalPrice = components
          .filter((c) => !c.is_optional)
          .reduce((sum, c) => sum + getComponentLinePrice(c), 0);

        let finalPrice = originalPrice;
        if (bundle.pricing_type === 'fixed_price' && bundle.fixed_price) {
          finalPrice = Number(bundle.fixed_price);
        } else if (bundle.pricing_type === 'percentage_discount' && bundle.discount_percent) {
          finalPrice = originalPrice * (1 - Number(bundle.discount_percent) / 100);
        } else if (bundle.pricing_type === 'fixed_discount' && bundle.discount_fixed) {
          finalPrice = originalPrice - Number(bundle.discount_fixed);
        } else if (bundle.pricing_type === 'custom') {
          const requiredGroups = (choiceGroupsByBundle.get(bundle.id) || []).filter((g) => g.is_required && (g.min_selections || 0) > 0);
          const baseComponents = components.filter((c) => !c.is_optional && !c.choice_group_id);
          let customTotal = baseComponents.reduce((sum, c) => sum + getComponentLinePrice(c), 0);

          for (const group of requiredGroups) {
            const groupComponents = components.filter((c) => !c.is_optional && c.choice_group_id === group.id);
            if (groupComponents.length === 0) continue;
            const prices = groupComponents.map(getComponentLinePrice);
            customTotal += Math.min(...prices) * (group.min_selections || 1);
          }

          finalPrice = customTotal;
        }

        return {
          ...bundle,
          components_count: componentsCount,
          original_price: originalPrice,
          final_price: Math.max(0, finalPrice),
        };
      });

      setBundles(bundlesWithPrices);
    } catch (error: any) {
      toast({
        title: t('bundles.toast.errorLoading'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, statusFilter, pricingTypeFilter, debouncedSearchTerm, t, toast]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "bundles",
    onSuccess: loadBundles,
    softDelete: false,
    organizationId: activeCompany?.id,
  });

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("products.view") && !hasFullAccess) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, hasFullAccess, navigate, activeCompany]);

  // Load companies for import (scoped to active org)
  useEffect(() => {
    const loadCompanies = async () => {
      if (!activeCompany?.id) {
        setCompanies([]);
        return;
      }
      const { data } = await supabase
        .from("anew_organizations")
        .select("id, name")
        .eq("id", activeCompany.id);
      setCompanies(data || []);
    };
    loadCompanies();
  }, [activeCompany?.id]);

  useEffect(() => {
    if (companyLoading) return;
    if (activeCompany?.id) {
      loadBundles();
    } else {
      // Org context resolved but user has no active company → stop loading state.
      setLoading(false);
    }
  }, [loadBundles, activeCompany?.id, companyLoading]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3" />;
    if (sortDirection === 'asc') return <ArrowUp className="ml-1 h-3 w-3" />;
    if (sortDirection === 'desc') return <ArrowDown className="ml-1 h-3 w-3" />;
    return <ArrowUpDown className="ml-1 h-3 w-3" />;
  };

  const filteredAndSortedBundles = useMemo(() => {
    let result = [...bundles];

    if (sortField && sortDirection) {
      result = result.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (aVal === null || aVal === undefined) aVal = '' as any;
        if (bVal === null || bVal === undefined) bVal = '' as any;

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const strA = String(aVal).toLowerCase();
        const strB = String(bVal).toLowerCase();
        return sortDirection === 'asc' 
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    return result;
  }, [bundles, sortField, sortDirection]);

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      setDeleteId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("bundles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteId)
        .eq("organization_id", activeCompany.id);

      if (error) throw error;

      toast({
        title: t('bundles.toast.deleted'),
        description: t('bundles.toast.deletedDescription'),
      });

      loadBundles();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const handleBulkStatusChange = async () => {
    const selectedIds = Array.from(bulkActions.selectedIds);
    if (selectedIds.length === 0) return;
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      bulkActions.setProcessing(true);

      const isActive = bulkActions.bulkNewStatus === "active";

      const { error } = await supabase
        .from("bundles")
        .update({
          status: bulkActions.bulkNewStatus,
          is_active: isActive
        })
        .in("id", selectedIds)
        .eq("organization_id", activeCompany.id);

      if (error) throw error;

      toast({
        title: t('common.statusUpdated'),
        description: `${selectedIds.length} ${t('bundles.items')} ${t('common.updated').toLowerCase()}`,
      });

      bulkActions.clearSelection();
      bulkActions.setBulkStatusDialogOpen(false);
      loadBundles();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      bulkActions.setProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedIds = Array.from(bulkActions.selectedIds);
    if (selectedIds.length === 0) return;
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      bulkActions.setProcessing(true);

      const { error } = await supabase
        .from("bundles")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", selectedIds)
        .eq("organization_id", activeCompany.id);

      if (error) throw error;

      toast({
        title: t('common.deleteSuccess'),
        description: `${selectedIds.length} ${t('bundles.items')} ${t('common.deleted').toLowerCase()}`,
      });

      bulkActions.clearSelection();
      bulkActions.setBulkDeleteDialogOpen(false);
      loadBundles();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      bulkActions.setProcessing(false);
    }
  };

  const handleFormClose = () => {
    setShowFormDialog(false);
    setEditBundle(null);
  };

  const handleFormSuccess = () => {
    handleFormClose();
    loadBundles();
  };

  // Export handler
  const handleExport = async () => {
    try {
      await exportBundlesToCSV(bundles);
      toast({
        title: t('bundles.toast.exportSuccess') || "Exportação concluída",
        description: t('bundles.toast.exportSuccessDesc') || "Ficheiro CSV descarregado.",
      });
    } catch (error: any) {
      toast({
        title: t('bundles.toast.exportError') || "Erro na exportação",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Import handler
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const CANCELLED_MESSAGE = "Importação cancelada";
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;

    const checkCancelled = () => {
      if (controller.signal.aborted) throw new Error(CANCELLED_MESSAGE);
    };
    const yieldToUI = async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    };

    setImportLoading(true);
    try {
      await yieldToUI();
      checkCancelled();

      const text = await file.text();
      checkCancelled();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('common.notAuthenticated') || "Não autenticado");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");
      checkCancelled();

      // Fetch existing bundles for upsert logic
      const { data: existingBundles, error: fetchError } = await supabase
        .from("bundles")
        .select("id, sku, organization_id")
        .eq("organization_id", activeCompany?.id || "")
        .is("deleted_at", null);

      if (fetchError) throw fetchError;
      checkCancelled();

      const result = await parseBundlesCSV({
        text,
        companies,
        businessUserId,
        activeCompanyId: activeCompany?.id,
        existingBundles: existingBundles || [],
        signal: controller.signal,
      });

      checkCancelled();

      // Insert new bundles
      if (result.bundlesToInsert.length > 0) {
        const { error } = await supabase.from("bundles").insert(result.bundlesToInsert);
        if (error) throw error;
      }
      checkCancelled();

      // Update existing bundles
      for (const bundle of result.bundlesToUpdate) {
        const { id, ...updateData } = bundle;
        const { error } = await supabase.from("bundles").update(updateData).eq("id", id);
        if (error) throw error;
      }

      toast({
        title: t('bundles.toast.importSuccess') || "Importação concluída",
        description: `${result.stats.newCount} novos, ${result.stats.updateCount} atualizados`,
      });

      setImportDialogOpen(false);
      loadBundles();
    } catch (error: any) {
      if (error.message === CANCELLED_MESSAGE) {
        toast({
          title: "Importação cancelada",
          description: "A importação foi interrompida.",
        });
      } else {
        toast({
          title: t('bundles.toast.importError') || "Erro na importação",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      setImportLoading(false);
    }

    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    downloadBundlesTemplate();
    toast({
      title: t('bundles.toast.templateDownloaded') || "Template descarregado",
      description: t('bundles.toast.templateDownloadedDesc') || "Preencha o ficheiro e importe-o.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">{t('bundles.status.active')}</Badge>;
      case 'draft':
        return <Badge variant="secondary">{t('bundles.status.draft')}</Badge>;
      case 'discontinued':
        return <Badge variant="destructive">{t('bundles.status.discontinued')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPricingLabel = (bundle: Bundle) => {
    if (bundle.pricing_type === 'fixed_price') {
      return t('bundles.pricing.fixedPrice');
    } else if (bundle.pricing_type === 'percentage_discount') {
      return `${bundle.discount_percent}% ${t('bundles.pricing.discount')}`;
    } else if (bundle.pricing_type === 'fixed_discount') {
      return `-${formatCurrency(bundle.discount_fixed || 0)}`;
    }
    return t('bundles.pricing.custom');
  };

  const allBundleIds = filteredAndSortedBundles.map(b => b.id);
  const allSelected = allBundleIds.length > 0 && allBundleIds.every(id => bulkActions.selectedIds.has(id));
  const someSelected = allBundleIds.some(id => bulkActions.selectedIds.has(id)) && !allSelected;

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center">
        {children}
        {getSortIcon(field)}
      </div>
    </TableHead>
  );

  const statusOptions = [
    { value: "draft", label: t('bundles.status.draft') },
    { value: "active", label: t('bundles.status.active') },
    { value: "discontinued", label: t('bundles.status.discontinued') },
  ];

  return (
    <>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">{t('bundles.title')}</h1>
                <p className="text-muted-foreground">{t('bundles.subtitle')}</p>
              </div>
              <PageFAQSheet pageKey="catalog.bundles" />
            </div>
          </div>
          
          <div className="flex gap-2">
            <PermissionGate permission="products.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> {t('common.export') || 'Exportar'}
              </Button>
            </PermissionGate>
            <PermissionGate permission="products.import">
              <Dialog
                open={importDialogOpen}
                onOpenChange={(open) => {
                  if (!open && importLoading) {
                    importAbortRef.current?.abort();
                  }
                  setImportDialogOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> {t('common.import') || 'Importar'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('bundles.importDialog.title') || 'Importar Bundles'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {importLoading ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">
                          {t('bundles.importDialog.importing') || 'A importar bundles...'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('bundles.importDialog.importingHint') || 'Este processo pode demorar alguns segundos'}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              importAbortRef.current?.abort();
                              setImportDialogOpen(false);
                            }}
                          >
                            {t('bundles.importDialog.cancelImport')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {t('bundles.importDialog.description') || 'Faça upload de um ficheiro CSV com os bundles a importar.'}
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                            <Download className="mr-2 h-4 w-4" />
                            {t('bundles.importDialog.downloadTemplate')}
                          </Button>
                        </div>
                        <Input
                          type="file"
                          accept=".csv"
                          onChange={handleImport}
                        />
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>
            {(hasFullAccess || hasPermission("products.create")) && (
              <Button onClick={() => setShowFormDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('bundles.addBundle')}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={t('bundles.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t('bundles.filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bundles.allStatuses')}</SelectItem>
              <SelectItem value="draft">{t('bundles.status.draft')}</SelectItem>
              <SelectItem value="active">{t('bundles.status.active')}</SelectItem>
              <SelectItem value="discontinued">{t('bundles.status.discontinued')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={pricingTypeFilter} onValueChange={setPricingTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t('bundles.filterByPricing')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bundles.allPricingTypes')}</SelectItem>
              <SelectItem value="custom">{t('bundles.pricing.custom')}</SelectItem>
              <SelectItem value="fixed_price">{t('bundles.pricing.fixedPrice')}</SelectItem>
              <SelectItem value="percentage_discount">{t('bundles.pricing.percentageDiscount')}</SelectItem>
              <SelectItem value="fixed_discount">{t('bundles.pricing.fixedDiscount')}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center text-sm text-muted-foreground">
            {filteredAndSortedBundles.length} {t('bundles.items')}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {bulkActions.selectedIds.size > 0 && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {bulkActions.selectedIds.size} {t('common.selected') || 'selecionados'}
              </span>
              {(hasFullAccess || hasPermission("products.edit")) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkActions.setBulkStatusDialogOpen(true)}
                >
                  {t('common.changeStatus')}
                </Button>
              )}
              {(hasFullAccess || hasPermission("products.delete")) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => bulkActions.setBulkDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={bulkActions.clearSelection}
            >
              {t('common.clearSelection') || 'Limpar Seleção'}
            </Button>
          </div>
        )}

        {/* Bundles Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as any).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={() => bulkActions.toggleSelectAll(allBundleIds)}
                    aria-label={t('common.selectAll')}
                  />
                </TableHead>
                <SortableHeader field="sku">{t('bundles.table.sku')}</SortableHeader>
                <SortableHeader field="name">{t('bundles.table.name')}</SortableHeader>
                <SortableHeader field="components_count">{t('bundles.table.components')}</SortableHeader>
                <TableHead>{t('bundles.table.pricing')}</TableHead>
                <TableHead className="text-right">{t('bundles.table.originalPrice')}</TableHead>
                <SortableHeader field="final_price">{t('bundles.table.finalPrice')}</SortableHeader>
                <SortableHeader field="status">{t('bundles.table.status')}</SortableHeader>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedBundles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="h-12 w-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground">{t('bundles.noBundles')}</p>
                      {(hasFullAccess || hasPermission("products.create")) && (
                        <Button variant="outline" size="sm" onClick={() => setShowFormDialog(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          {t('bundles.createFirst')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedBundles.map((bundle) => (
                  <TableRow 
                    key={bundle.id}
                    className={bulkActions.selectedIds.has(bundle.id) ? "bg-muted/50" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={bulkActions.selectedIds.has(bundle.id)}
                        onCheckedChange={() => bulkActions.toggleSelectOne(bundle.id)}
                        aria-label={`${t('common.select')} ${bundle.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{bundle.sku}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{bundle.name}</p>
                        {bundle.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{bundle.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{bundle.components_count} {t('bundles.items')}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getPricingLabel(bundle)}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground line-through">
                      {formatCurrency(bundle.original_price || 0)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {formatCurrency(bundle.final_price || 0)}
                    </TableCell>
                    <TableCell>{getStatusBadge(bundle.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(hasFullAccess || hasPermission("products.edit")) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditBundle(bundle);
                              setShowFormDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {(hasFullAccess || hasPermission("products.delete")) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(bundle.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Form Dialog */}
      <BundleFormDialog
        open={showFormDialog}
        onOpenChange={handleFormClose}
        bundle={editBundle}
        onSuccess={handleFormSuccess}
      />

      {/* Bulk Status Dialog */}
      <BulkStatusDialog
        open={bulkActions.bulkStatusDialogOpen}
        onOpenChange={bulkActions.setBulkStatusDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        status={bulkActions.bulkNewStatus}
        onStatusChange={bulkActions.setBulkNewStatus}
        onConfirm={handleBulkStatusChange}
        processing={bulkActions.processing}
        statusOptions={statusOptions}
      />

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={bulkActions.bulkDeleteDialogOpen}
        onOpenChange={bulkActions.setBulkDeleteDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        onConfirm={handleBulkDelete}
        processing={bulkActions.processing}
      />

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bundles.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bundles.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Bundles;
