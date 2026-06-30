import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from 'xlsx';
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, ShoppingCart, Download, Upload, Pencil, Trash2, DollarSign, History, Copy, ArrowUpDown, ArrowUp, ArrowDown, Settings2 } from "lucide-react";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { Input } from "@/components/ui/input";
import ProductPricesDialog from "@/components/ProductPricesDialog";
import ProductPriceHistoryDialog from "@/components/ProductPriceHistoryDialog";
import ProductConfigurableOptionsDialog from "@/components/ProductConfigurableOptionsDialog";
import ProductFormPrices, { PriceFormData } from "@/components/ProductFormPrices";
import ProductFormAttributes, { AttributeFormValue } from "@/components/ProductFormAttributes";
import { exportProductsToCSV, parseProductsCSV, downloadProductsTemplate } from "@/utils/productsExportImport";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";

const getPrimaryOrgId = (sel: any): string | null => sel?.companyId || sel?.levelSelections?.[0]?.id || null;
const getAllOrgIds = (sel: any): string[] => {
  if (sel?.selectedCompanyIds?.length) return sel.selectedCompanyIds;
  if (sel?.levelSelections?.length) return sel.levelSelections.map((l: any) => l.id);
  return sel?.companyId ? [sel.companyId] : [];
};
import { OrganizationFilters } from "@/components/OrganizationFilters";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog, BulkOrgDialog } from "@/components/BulkActionDialogs";
import { BulkPriceDialog } from "@/components/BulkPriceDialog";
import { BulkAttributesDialog } from "@/components/BulkAttributesDialog";
import { useBulkActions } from "@/hooks/useBulkActions";
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
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NativeSelect } from "@/components/ui/native-select";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  status: string;
  is_active: boolean;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  barcode: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  brand_id?: string | null;
  supplier_id?: string | null;
  organization_id?: string | null;
  product_categories?: { name: string } | null;
  subcategory?: { name: string } | null;
  brands?: { name: string };
  anew_organizations?: { name: string };
  product_stock?: Array<{
    qty_available: number;
  }>;
}

export default function Products() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType } = useCompany();
  const { isSystemAdmin } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<'name' | 'sku' | 'brand_name'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [open, setOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importReport, setImportReport] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    skippedLines: { line: number; sku: string; reason: string; file: string }[];
    warnings: string[];
  } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{productId: string; field: string} | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [pricesDialogOpen, setPricesDialogOpen] = useState(false);
  const [priceHistoryDialogOpen, setPriceHistoryDialogOpen] = useState(false);
  const [configurableOptionsDialogOpen, setConfigurableOptionsDialogOpen] = useState(false);
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false);
  const [bulkAttributesDialogOpen, setBulkAttributesDialogOpen] = useState(false);
  const [bulkCategoryDialogOpen, setBulkCategoryDialogOpen] = useState(false);
  const [bulkSubcategoryDialogOpen, setBulkSubcategoryDialogOpen] = useState(false);
  
  const [bulkProductTypeDialogOpen, setBulkProductTypeDialogOpen] = useState(false);
  const [bulkUomDialogOpen, setBulkUomDialogOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState("");
  
  const [bulkProductType, setBulkProductType] = useState("");
  const [bulkUomId, setBulkUomId] = useState("");
  const [uomList, setUomList] = useState<{ id: string; code: string; description: string | null }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    barcode: "",
    status: "draft",
    category_id: "",
    subcategory_id: "",
    brand_id: "",
    product_type: "sale", // "sale", "purchase", or "both"
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

  // Reset organizationSelection whenever the active company changes so a stale org ID
  // cannot survive a company switch and end up written to a different org's product.
  useEffect(() => {
    setOrganizationSelection(defaultOrgSelection());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // defaultOrgSelection closes over activeCompany; activeCompany?.id is the only trigger needed.
  }, [activeCompany?.id]);

  const [priceFormData, setPriceFormData] = useState<PriceFormData>({
    purchase: 0,
    retail: 0,
    wholesale: 0,
    distributor: 0,
    currency: 'EUR',
    vat_rate: 23,
    uom_id: ''
  });

  const [attributeFormData, setAttributeFormData] = useState<AttributeFormValue[]>([]);

  const isAdmin = isSystemAdmin;


  // Debounced search term for server-side filtering
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  
  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Use refs for filter values to avoid recreating loadProducts on every filter change
  const filtersRef = useRef({
    categoryFilter,
    subcategoryFilter,
    brandFilter,
    debouncedSearchTerm,
    sortField,
    sortDirection,
    activeCompanyId: activeCompany?.id,
  });

  // Update refs when filters change
  useEffect(() => {
    filtersRef.current = {
      categoryFilter,
      subcategoryFilter,
      brandFilter,
    debouncedSearchTerm,
    sortField,
    sortDirection,
    activeCompanyId: activeCompany?.id,
  };
}, [categoryFilter, subcategoryFilter, brandFilter, debouncedSearchTerm, sortField, sortDirection, activeCompany?.id]);

  // Resolve all descendant org IDs for the active company (as state to trigger dependents)
  const [descendantIds, setDescendantIds] = useState<string[]>([]);
  const descendantIdsRef = useRef<string[]>([]);
  useEffect(() => {
    // Clear stale data immediately on company change
    setProducts([]);
    setDescendantIds([]);
    descendantIdsRef.current = [];
    if (!activeCompany?.id) {
      return;
    }
    (async () => {
      const { data: hierarchy } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");
      const childMap = new Map<string, string[]>();
      (hierarchy || []).forEach((h: any) => {
        const arr = childMap.get(h.parent_org_id) || [];
        arr.push(h.child_org_id);
        childMap.set(h.parent_org_id, arr);
      });
      const ids = [activeCompany.id];
      const queue = [activeCompany.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const child of childMap.get(current) || []) {
          ids.push(child);
          queue.push(child);
        }
      }
      descendantIdsRef.current = ids;
      setDescendantIds(ids);
    })();
  }, [activeCompany?.id]);

  const loadProducts = useCallback(async (pageNum: number, reset: boolean = false, orgIds?: string[]) => {
    const filters = filtersRef.current;
    // Use passed orgIds, fallback to descendantIdsRef (stable ref avoids recreating callback on every company change),
    // then single activeCompanyId
    const effectiveOrgIds = orgIds ?? (descendantIdsRef.current.length > 0 ? descendantIdsRef.current : (filters.activeCompanyId ? [filters.activeCompanyId] : []));
    
    if (reset) {
      setLoading(true);
      setProducts([]); // Clear immediately when resetting
    } else {
      setLoadingMore(true);
    }

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const orgIdsToUse = effectiveOrgIds;

      // Build query with server-side filters
      let query = (supabase
        .from("products") as any)
        .select(`
          *,
          product_categories!category_id(name),
          subcategory:product_categories!subcategory_id(name),
          brands(name),
          product_stock(qty_available),
          product_organizations(organization_id)
        `)
        .is("deleted_at", null);

      // Apply organization filter (active org + all descendants)
      if (orgIdsToUse.length > 0) {
        // Use !inner join to exclude products without matching org
        query = (supabase
          .from("products") as any)
          .select(`
            *,
            product_categories!category_id(name),
            subcategory:product_categories!subcategory_id(name),
            brands(name),
            product_stock(qty_available),
            product_organizations!inner(organization_id)
          `)
          .is("deleted_at", null)
          .in("product_organizations.organization_id", orgIdsToUse);
      }

      // Apply category filter
      if (filters.categoryFilter !== "all") {
        query = query.eq("category_id", filters.categoryFilter);
      }

      // Apply subcategory filter
      if (filters.subcategoryFilter !== "all") {
        query = query.eq("subcategory_id", filters.subcategoryFilter);
      }

      // Apply brand filter
      if (filters.brandFilter !== "all") {
        query = query.eq("brand_id", filters.brandFilter);
      }

      // Apply search filter (server-side)
      if (filters.debouncedSearchTerm.trim()) {
        const searchLower = filters.debouncedSearchTerm.toLowerCase().trim();
        query = query.or(`sku.ilike.%${searchLower}%,name.ilike.%${searchLower}%,barcode.ilike.%${searchLower}%`);
      }

      // Apply sorting and pagination
      if (filters.sortField === 'brand_name') {
        query = query.order('brands(name)', {
          ascending: filters.sortDirection === 'asc',
          nullsFirst: false,
        }).range(from, to);
      } else if (filters.sortField === 'sku') {
        // Fetch without DB sort for SKU — sort numerically client-side
        query = query.range(from, to);
      } else {
        query = query.order(filters.sortField, { ascending: filters.sortDirection === 'asc' }).range(from, to);
      }

      const result = await query;
      const productsData = result.data || [];
      const error = result.error;

      if (error) throw error;

      let newProducts = productsData || [];

      // Client-side sorts
      if (filters.sortField === 'sku') {
        const asc = filters.sortDirection === 'asc';
        newProducts = [...newProducts].sort((a, b) => {
          const numA = parseFloat(a.sku ?? '');
          const numB = parseFloat(b.sku ?? '');
          const bothNumeric = !isNaN(numA) && !isNaN(numB);
          if (bothNumeric) return asc ? numA - numB : numB - numA;
          const sa = (a.sku ?? '').toLowerCase();
          const sb = (b.sku ?? '').toLowerCase();
          return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
      } else if (filters.sortField === 'name') {
        const asc = filters.sortDirection === 'asc';
        newProducts = [...newProducts].sort((a, b) => {
          const sa = (a.name ?? '').toLowerCase();
          const sb = (b.name ?? '').toLowerCase();
          return asc ? sa.localeCompare(sb, 'pt') : sb.localeCompare(sa, 'pt');
        });
      }
      
      if (reset) {
        setProducts(newProducts);
      } else {
        setProducts(prev => [...prev, ...newProducts]);
      }

      setHasMore(newProducts.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error: any) {
      toast({
        title: t('products.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // descendantIds intentionally omitted — read via descendantIdsRef to keep the callback stable
  }, [t, toast]);

  const loadMetadata = useCallback(async () => {
    // Wait for descendant IDs to resolve before loading metadata
    if (activeCompany?.id && descendantIds.length === 0) return;
    
    try {

      // Load all metadata - no legacy company_id filtering
      let categoriesQuery = supabase
        .from("product_categories")
        .select("id, name, parent_id, organization_id");
      let brandsPromise: Promise<any>;

      // Filter categories and brands by org scope
      const orgIds = descendantIds;
      if (orgIds.length > 0) {
        categoriesQuery = categoriesQuery.or(`organization_id.in.(${orgIds.join(',')}),organization_id.is.null`);

        brandsPromise = (async () => {
          const { data: brandOrgs, error: brandOrgsError } = await supabase
            .from("brand_organizations")
            .select("brand_id")
            .in("organization_id", orgIds);

          if (brandOrgsError) {
            return { data: null, error: brandOrgsError };
          }

          const brandIds = Array.from(
            new Set((brandOrgs || []).map((row: any) => row.brand_id).filter(Boolean))
          );

          if (brandIds.length === 0) {
            return { data: [], error: null };
          }

          return supabase
            .from("brands")
            .select("id, name, organization_id")
            .in("id", brandIds)
            .order("name");
        })();
      } else {
        brandsPromise = Promise.resolve({ data: [], error: null });
      }

      // Fetch organizations as tree from active company
      let companiesPromise: Promise<any>;
      if (activeCompany?.id) {
        // Get active company + all descendants via anew_hierarchy
        companiesPromise = (async () => {
          // Get active org
          const { data: activeOrg } = await supabase
            .from("anew_organizations")
            .select("id, name, type")
            .eq("id", activeCompany.id)
            .single();

          // Get all descendants recursively
          const { data: hierarchy } = await supabase
            .from("anew_hierarchy")
            .select("parent_org_id, child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type)")
            .order("created_at");

          // Build tree structure
          const allOrgs: { id: string; name: string; type: string; parent_id: string | null; depth: number }[] = [];
          if (activeOrg) {
            allOrgs.push({ ...activeOrg, parent_id: null, depth: 0 });
          }

          if (hierarchy) {
            const childMap = new Map<string, any[]>();
            hierarchy.forEach((h: any) => {
              const children = childMap.get(h.parent_org_id) || [];
              if (h.anew_organizations) {
                children.push({ ...h.anew_organizations, parent_id: h.parent_org_id });
              }
              childMap.set(h.parent_org_id, children);
            });

            // BFS to get all descendants of active company
            const queue = [{ id: activeCompany.id, depth: 0 }];
            while (queue.length > 0) {
              const current = queue.shift()!;
              const children = childMap.get(current.id) || [];
              for (const child of children) {
                allOrgs.push({ ...child, depth: current.depth + 1 });
                queue.push({ id: child.id, depth: current.depth + 1 });
              }
            }
          }

          return { data: allOrgs, error: null };
        })();
      } else {
        companiesPromise = Promise.resolve({ data: [], error: null });
      }

      // Load suppliers (filtered by org)
      const suppliersPromise = (async () => {
        let suppQuery = supabase
          .from("suppliers")
          .select("id, name")
          .eq("is_active", true);
        if (activeCompany?.id) {
          suppQuery = suppQuery.eq("organization_id", activeCompany.id);
        }
        const { data } = await suppQuery.order("name");
        return (data || []).map((s: any) => ({
          id: s.id,
          name: s.name || s.id,
        }));
      })();

      const [categoriesRes, brandsRes, companiesRes, uomRes, suppliersData] = await Promise.all([
        categoriesQuery,
        brandsPromise,
        companiesPromise,
        activeCompany?.id
          ? supabase.from("uom").select("id, code, description").eq("is_active", true).or(`organization_id.eq.${activeCompany.id},organization_id.is.null`).order("code")
          : Promise.resolve({ data: [], error: null }),
        suppliersPromise,
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (brandsRes.error) throw brandsRes.error;
      if (companiesRes.error) throw companiesRes.error;
      setUomList(uomRes.data || []);
      setSuppliers(suppliersData);

      setCategories(categoriesRes.data || []);
      setBrands(brandsRes.data || []);
      setCompanies(companiesRes.data || []);
    } catch (error: any) {
      console.error("Failed to load metadata:", error);
      toast({
        title: t('products.toast.metadataError') || "Erro ao carregar metadados",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [activeCompany?.id, userType, descendantIds, t, toast]);

  const loadData = useCallback(async () => {
    setPage(0);
    setHasMore(true);
    await Promise.all([loadProducts(0, true, descendantIds), loadMetadata()]);
  }, [loadProducts, loadMetadata]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "products",
    onSuccess: loadData,
    softDelete: false,
    organizationId: activeCompany?.id,
  });

  // Trigger reload when filters change or when descendantIds resolve after a company switch.
  // descendantIds (state) is the single trigger for company-switch reloads; loadProducts is
  // intentionally omitted from the dep array because it is now stable (reads via ref).
  useEffect(() => {
    // Wait for the hierarchy effect to resolve descendant IDs before loading.
    // When activeCompany is set but descendantIds is still empty, the hierarchy
    // fetch is still in-flight — skip until it resolves.
    if (activeCompany?.id && descendantIds.length === 0) return;
    setPage(0);
    setHasMore(true);
    loadProducts(0, true, descendantIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // loadProducts is stable (dep array is [t, toast]); descendantIds is the intentional trigger
    // for company switches; the filter values are read via filtersRef inside loadProducts.
  }, [categoryFilter, subcategoryFilter, brandFilter, debouncedSearchTerm, sortField, sortDirection, activeCompany?.id, descendantIds]);

  // Load metadata separately (only when company changes)
  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  // Infinite scroll observer — descendantIds is included so the callback always uses the current
  // org tree after a company switch, preventing stale-closure loads from a previous company.
  useEffect(() => {
    if (loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadProducts(page + 1, false, descendantIds);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, hasMore, loadingMore, page, loadProducts, descendantIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    // Category and organization are optional - they may not exist yet

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('products.toast.notAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }

      // Determine the primary organization - use selected or active company
      const primaryOrgId = getPrimaryOrgId(organizationSelection) || activeCompany?.id || null;

      await withAuditContext(supabase, businessUserId, async () => {

      const productData: TablesUpdate<"products"> = {
        sku: formData.sku,
        name: formData.name,
        status: formData.status as TablesUpdate<"products">["status"],
        is_active: true,
        is_sellable: formData.product_type === "sale" || formData.product_type === "both",
        is_purchasable: formData.product_type === "purchase" || formData.product_type === "both",
        category_id: formData.category_id || null,
        subcategory_id: formData.subcategory_id || null,
        organization_id: primaryOrgId,
        uom_id: priceFormData.uom_id || null,
      };

      if (formData.description) productData.description = formData.description;
      if (formData.barcode) productData.barcode = formData.barcode;
      if (formData.brand_id) productData.brand_id = formData.brand_id;

      let productId: string;

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
          .eq("organization_id", activeCompany?.id);

        if (error) throw error;
        productId = editingProduct.id;

        // Update organization associations - delete old ones and insert new
        await supabase
          .from("product_organizations")
          .delete()
          .eq("product_id", editingProduct.id)
          .eq("organization_id", activeCompany?.id);

        toast({
          title: t('products.toast.updateSuccess'),
        });
      } else {
        // Create new product — created_by must be anew_users.id (fail-closed)
        const insertData: TablesInsert<"products"> = {
          ...productData,
          created_by: businessUserId,
          sku: formData.sku,
          name: formData.name,
        };
        const { data: newProduct, error } = await supabase
          .from("products")
          .insert(insertData)
          .select("id")
          .single();

        if (error) throw error;
        productId = newProduct.id;

        toast({
          title: t('products.toast.createSuccess'),
        });
      }

      // Insert organization associations - ALWAYS include primaryOrgId
      const uniqueOrgIds = new Set<string>();
      
      // Always add the primary organization if it exists
      if (primaryOrgId) {
        uniqueOrgIds.add(primaryOrgId);
      }
      
      // Add all org IDs from selection
      getAllOrgIds(organizationSelection).forEach(id => uniqueOrgIds.add(id));
      
      // Create associations for all unique organizations
      if (uniqueOrgIds.size > 0) {
        const orgAssociations = Array.from(uniqueOrgIds).map((orgId) => ({
          product_id: productId,
          organization_id: orgId,
          created_by: businessUserId,
        }));

        const { error: assocError } = await supabase
          .from("product_organizations")
          .insert(orgAssociations);

        if (assocError) throw assocError;
      }

      // Save prices
      const priceTypes: Array<{ type: 'purchase' | 'retail' | 'wholesale' | 'distributor', value: number }> = [
        { type: 'purchase', value: priceFormData.purchase },
        { type: 'retail', value: priceFormData.retail },
        { type: 'wholesale', value: priceFormData.wholesale },
        { type: 'distributor', value: priceFormData.distributor },
      ];

      for (const { type, value } of priceTypes) {
        if (value && value > 0) {
          // Check if price exists
          const { data: existingPrice } = await supabase
            .from('product_prices')
            .select('id')
            .eq('product_id', productId)
            .eq('price_type', type)
            .maybeSingle();

          const priceData = {
            product_id: productId,
            price_type: type as 'purchase' | 'retail' | 'wholesale' | 'distributor',
            price: value,
            currency: priceFormData.currency as 'EUR' | 'USD' | 'GBP',
            vat_rate: priceFormData.vat_rate,
            created_by: businessUserId
          };

          if (existingPrice) {
            await supabase.from('product_prices').update(priceData).eq('id', existingPrice.id);
          } else {
            await supabase.from('product_prices').insert(priceData);
          }
        }
      }

      // Delete removed attributes
      const currentAttributeIds = attributeFormData.map(av => av.attribute_id);
      const { data: existingAttrs } = await supabase
        .from('product_attribute_values')
        .select('id, attribute_id')
        .eq('product_id', productId);
      
      if (existingAttrs) {
        const toDelete = existingAttrs.filter(ea => !currentAttributeIds.includes(ea.attribute_id));
        for (const del of toDelete) {
          await supabase.from('product_attribute_values').delete().eq('id', del.id);
        }
      }

      // Save attributes
      for (const av of attributeFormData) {
        const valueData: TablesInsert<"product_attribute_values"> = {
          product_id: productId,
          attribute_id: av.attribute_id
        };

        switch (av.attribute?.value_type) {
          case 'text':
          case 'string':
          case 'list':
            valueData.value_text = av.value_text || null;
            break;
          case 'number':
            valueData.value_number = av.value_number || null;
            break;
          case 'boolean':
            valueData.value_bool = av.value_bool || false;
            break;
        }

        // Check if attribute value exists
        const { data: existingAttr } = await supabase
          .from('product_attribute_values')
          .select('id')
          .eq('product_id', productId)
          .eq('attribute_id', av.attribute_id)
          .maybeSingle();

        if (existingAttr) {
          await supabase.from('product_attribute_values').update(valueData).eq('id', existingAttr.id);
        } else {
          await supabase.from('product_attribute_values').insert(valueData);
        }
      }

      // Save supplier on the product directly
      await supabase
        .from("products")
        .update({ supplier_id: selectedSupplierId || null })
        .eq("id", productId);

      }); // end withAuditContext

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: editingProduct ? t('products.toast.updateError') : t('products.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    // Delegate to the AlertDialog — this function is called after confirmation
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      // Soft delete - mark as deleted instead of removing
      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("products")
          .update({
            is_deleted: true,
            deleted_at: new Date().toISOString(),
            deleted_by: businessUserId,
          })
          .eq("id", id)
          .eq("organization_id", activeCompany.id)
      );

      if (error) throw error;

      toast({
        title: t('products.toast.success'),
        description: t('products.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const openEditDialog = async (product: Product) => {
    try {
      // Fetch full product data including is_sellable and is_purchasable
      const [productRes, companyRes, pricesRes, attributesRes] = await Promise.all([
        supabase
          .from("products")
          .select("is_sellable, is_purchasable, uom_id")
          .eq("id", product.id)
          .single(),
        supabase
          .from("product_organizations")
          .select("organization_id")
          .eq("product_id", product.id),
        supabase
          .from("product_prices")
          .select("price_type, price, currency, vat_rate")
          .eq("product_id", product.id),
        supabase
          .from("product_attribute_values")
          .select(`
            id,
            attribute_id,
            value_text,
            value_number,
            value_bool,
            product_attributes(id, code, label, value_type, unit, allowed_values)
          `)
          .eq("product_id", product.id),
      ]);

      if (productRes.error) throw productRes.error;
      const data = productRes.data;

      let productType = "sale";
      if (data.is_sellable && data.is_purchasable) {
        productType = "both";
      } else if (data.is_purchasable) {
        productType = "purchase";
      } else if (data.is_sellable) {
        productType = "sale";
      }

      const companyIds = companyRes.data?.map(a => a.organization_id) || [];

      // Set prices
      const loadedPrices: PriceFormData = {
        purchase: 0,
        retail: 0,
        wholesale: 0,
        distributor: 0,
        currency: 'EUR',
        vat_rate: 23,
        uom_id: productRes.data?.uom_id || ''
      };
      pricesRes.data?.forEach(p => {
        if (p.price_type === 'purchase') loadedPrices.purchase = p.price || 0;
        if (p.price_type === 'retail') loadedPrices.retail = p.price || 0;
        if (p.price_type === 'wholesale') loadedPrices.wholesale = p.price || 0;
        if (p.price_type === 'distributor') loadedPrices.distributor = p.price || 0;
        if (p.currency) loadedPrices.currency = p.currency;
        if (p.vat_rate !== null) loadedPrices.vat_rate = p.vat_rate;
      });
      setPriceFormData(loadedPrices);

      // Set attributes
      const loadedAttributes: AttributeFormValue[] = (attributesRes.data || []).map((av: any) => ({
        attribute_id: av.attribute_id,
        attribute: av.product_attributes,
        value_text: av.value_text,
        value_number: av.value_number,
        value_bool: av.value_bool
      }));
      setAttributeFormData(loadedAttributes);

      setEditingProduct(product);
      setFormData({
        sku: product.sku,
        name: product.name,
        description: product.description || "",
        barcode: product.barcode || "",
        status: product.status,
        category_id: product.category_id || "",
        subcategory_id: product.subcategory_id || "",
        brand_id: product.brand_id || "",
        product_type: productType,
      });
      
      // Set organization selection from organization associations
      const primaryCompanyId = companyIds.length > 0 ? companyIds[0] : (product.organization_id || activeCompany?.id || "");
      const secondaryIds = companyIds.slice(1);
      
      // Fetch parent org for tenant context
      let tenantId = "";
      if (primaryCompanyId) {
        const { data: orgData } = await supabase
          .from("anew_organizations")
          .select("id")
          .eq("id", primaryCompanyId)
          .single();
        tenantId = orgData?.id || "";
      }
      
      setOrganizationSelection(defaultOrgSelection());

      // Set supplier directly from product
      setSelectedSupplierId(product.supplier_id || "");
      
      setOpen(true);
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      sku: "",
      name: "",
      description: "",
      barcode: "",
      status: "draft",
      category_id: "",
      subcategory_id: "",
      brand_id: "",
      product_type: "sale",
    });
    setOrganizationSelection(defaultOrgSelection());
    setPriceFormData({
      purchase: 0,
      retail: 0,
      wholesale: 0,
      distributor: 0,
      currency: 'EUR',
      vat_rate: 23,
      uom_id: ''
    });
    setAttributeFormData([]);
    setSelectedSupplierId("");
  };

  const copyLastProduct = async () => {
    try {
      // Get the last created product (scoped to user's org tree)
      let copyQuery = supabase
        .from("products")
        .select(`
          *,
          product_organizations(organization_id)
        `)
        .order("created_at", { ascending: false })
        .limit(1);

      // Scope to descendant org tree
      if (descendantIdsRef.current && descendantIdsRef.current.length > 0) {
        copyQuery = copyQuery.in("organization_id", descendantIdsRef.current);
      } else if (activeCompany?.id) {
        copyQuery = copyQuery.eq("organization_id", activeCompany.id);
      }

      const { data: lastProduct, error } = await copyQuery.single();

      if (error || !lastProduct) {
        toast({
          title: t('products.toast.noProductToCopy') || "Sem produtos para copiar",
          variant: "destructive",
        });
        return;
      }

      // Fetch prices and attributes
      const [pricesRes, attributesRes] = await Promise.all([
        supabase
          .from("product_prices")
          .select("price_type, price, currency, vat_rate")
          .eq("product_id", lastProduct.id),
        supabase
          .from("product_attribute_values")
          .select(`
            attribute_id,
            value_text,
            value_number,
            value_bool,
            product_attributes(id, code, label, value_type, unit, allowed_values)
          `)
          .eq("product_id", lastProduct.id)
      ]);

      // Set form data (with new SKU)
      setFormData({
        sku: "", // Empty SKU - user must provide new one
        name: lastProduct.name || "",
        description: lastProduct.description || "",
        barcode: "", // Empty barcode - likely unique
        status: lastProduct.status || "draft",
        category_id: lastProduct.category_id || "",
        subcategory_id: lastProduct.subcategory_id || "",
        brand_id: lastProduct.brand_id || "",
        product_type: lastProduct.is_sellable && lastProduct.is_purchasable 
          ? "both" 
          : lastProduct.is_purchasable 
            ? "purchase" 
            : "sale",
      });

      // Set organization
      const orgIds = (lastProduct as any).product_organizations?.map((po: any) => po.organization_id) || [];
      setOrganizationSelection(defaultOrgSelection());

      // Set prices
      const loadedPrices: PriceFormData = {
        purchase: 0,
        retail: 0,
        wholesale: 0,
        distributor: 0,
        currency: 'EUR',
        vat_rate: 23,
        uom_id: lastProduct.uom_id || ''
      };
      pricesRes.data?.forEach(p => {
        if (p.price_type === 'purchase') loadedPrices.purchase = p.price || 0;
        if (p.price_type === 'retail') loadedPrices.retail = p.price || 0;
        if (p.price_type === 'wholesale') loadedPrices.wholesale = p.price || 0;
        if (p.price_type === 'distributor') loadedPrices.distributor = p.price || 0;
        if (p.currency) loadedPrices.currency = p.currency;
        if (p.vat_rate !== null) loadedPrices.vat_rate = p.vat_rate;
      });
      setPriceFormData(loadedPrices);

      // Set attributes
      const loadedAttributes: AttributeFormValue[] = (attributesRes.data || []).map((av: any) => ({
        attribute_id: av.attribute_id,
        attribute: av.product_attributes,
        value_text: av.value_text,
        value_number: av.value_number,
        value_bool: av.value_bool,
      }));
      setAttributeFormData(loadedAttributes);

      // Clear editing product (this is a new product)
      setEditingProduct(null);
      setOpen(true);

      toast({
        title: t('products.toast.productCopied') || "Produto copiado",
        description: t('products.toast.productCopiedDesc') || "Preencha o SKU e ajuste os campos necessários",
      });
    } catch (error: any) {
      toast({
        title: t('products.toast.copyError') || "Erro ao copiar",
        description: error.message,
        variant: "destructive",
      });
    }
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

  const startEditing = (productId: string, field: string, currentValue: string) => {
    setEditingCell({ productId, field });
    setEditingValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue("");
  };

  const saveInlineEdit = async (productId: string, field: string) => {
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      cancelEditing();
      return;
    }
    if (field === "category_id") {
      // For category, we don't need to check if value is empty as it's a select
      try {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

        const updateData: Partial<Record<string, unknown>> = {};
        updateData[field] = editingValue;

        const { error } = await withAuditContext(supabase, businessUserId, () =>
          supabase
            .from("products")
            .update(updateData)
            .eq("id", productId)
            .eq("organization_id", activeCompany?.id)
        );

        if (error) throw error;

        toast({
          title: t('products.toast.productUpdated'),
          description: t('products.toast.categoryUpdateSuccess'),
        });

        cancelEditing();
        loadData();
      } catch (error: any) {
        toast({
          title: t('products.toast.updateFailed'),
          description: error.message,
          variant: "destructive",
        });
      }
      return;
    }

    if (!editingValue.trim()) {
      cancelEditing();
      return;
    }

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const updateData: Partial<Record<string, unknown>> = {};
      updateData[field] = editingValue.trim();

      const { error } = await withAuditContext(supabase, businessUserId, () =>
        supabase
          .from("products")
          .update(updateData)
          .eq("id", productId)
          .eq("organization_id", activeCompany?.id)
      );

      if (error) throw error;

      toast({
        title: t('products.toast.productUpdated'),
        description: t('products.toast.changesSuccess'),
      });

      cancelEditing();
      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.updateFailed'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, productId: string, field: string) => {
    if (e.key === "Enter") {
      saveInlineEdit(productId, field);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "default";
      case "discontinued":
        return "destructive";
      case "draft":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return t('products.form.active');
      case "discontinued":
        return t('products.form.discontinued');
      case "draft":
        return t('products.form.draft');
      default:
        return status;
    }
  };

  const getTotalStock = (product: Product) => {
    if (!product.product_stock || product.product_stock.length === 0) return 0;
    return product.product_stock.reduce((sum, stock) => sum + (stock.qty_available || 0), 0);
  };

  // Bulk category update handler
  const handleBulkCategoryUpdate = async () => {
    if (!bulkCategoryId || !activeCompany?.id) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");
      const selectedIds = Array.from(bulkActions.selectedIds);
      const { error } = await withAuditContext(supabase, businessUserId, async () =>
        await supabase
          .from("products")
          .update({ category_id: bulkCategoryId, subcategory_id: null })
          .in("id", selectedIds)
          .eq("organization_id", activeCompany.id)
      );
      if (error) throw error;
      toast({
        title: t('products.toast.success'),
        description: t('products.toast.bulkCategorySuccess') || `${selectedIds.length} produtos atualizados`,
      });
      setBulkCategoryDialogOpen(false);
      setBulkCategoryId("");
      bulkActions.clearSelection();
      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Bulk subcategory update handler
  const handleBulkSubcategoryUpdate = async () => {
    if (!bulkSubcategoryId || !activeCompany?.id) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");
      const selectedIds = Array.from(bulkActions.selectedIds);
      const { error } = await withAuditContext(supabase, businessUserId, async () =>
        await supabase
          .from("products")
          .update({ subcategory_id: bulkSubcategoryId })
          .in("id", selectedIds)
          .eq("organization_id", activeCompany.id)
      );
      if (error) throw error;
      toast({
        title: t('products.toast.success'),
        description: t('products.toast.bulkSubcategorySuccess') || `${selectedIds.length} produtos atualizados`,
      });
      setBulkSubcategoryDialogOpen(false);
      setBulkSubcategoryId("");
      bulkActions.clearSelection();
      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };


  // Bulk product type update handler
  const handleBulkProductTypeUpdate = async () => {
    if (!bulkProductType || !activeCompany?.id) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");
      const selectedIds = Array.from(bulkActions.selectedIds);
      const isSellable = bulkProductType === "sale" || bulkProductType === "both";
      const isPurchasable = bulkProductType === "purchase" || bulkProductType === "both";

      const { error } = await withAuditContext(supabase, businessUserId, async () =>
        await supabase
          .from("products")
          .update({ is_sellable: isSellable, is_purchasable: isPurchasable })
          .in("id", selectedIds)
          .eq("organization_id", activeCompany.id)
      );
      if (error) throw error;
      toast({
        title: t('products.toast.success'),
        description: t('products.toast.bulkProductTypeSuccess') || `${selectedIds.length} produtos atualizados`,
      });
      setBulkProductTypeDialogOpen(false);
      setBulkProductType("");
      bulkActions.clearSelection();
      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkUomUpdate = async () => {
    const selectedIds = Array.from(bulkActions.selectedIds);
    if (selectedIds.length === 0 || !bulkUomId || !activeCompany?.id) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const { error } = await withAuditContext(supabase, businessUserId, async () =>
        await supabase
          .from("products")
          .update({ uom_id: bulkUomId })
          .in("id", selectedIds)
          .eq("organization_id", activeCompany.id)
      );
      if (error) throw error;
      toast({
        title: t('products.toast.success'),
        description: t('products.toast.bulkUomSuccess') || `${selectedIds.length} produtos atualizados`,
      });
      setBulkUomDialogOpen(false);
      setBulkUomId("");
      bulkActions.clearSelection();
      loadData();
    } catch (error: any) {
      toast({
        title: t('products.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    try {
      await exportProductsToCSV(products, activeCompany?.id);
      toast({
        title: t('products.toast.exportSuccess'),
        description: t('products.toast.exportSuccessDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('products.toast.exportError'),
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
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      inputEl.value = '';
      return;
    }

    let totalNew = 0;
    let totalUpdated = 0;
    let totalPrices = 0;
    let totalSkipped = 0;
    const allSkipped: { line: number; sku: string; reason: string; file: string }[] = [];
    const allWarnings: string[] = [];
    const failedFiles: string[] = [];

    try {
    for (const file of Array.from(files)) {
      try {
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        let text: string;
        if (isExcel) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          text = aoa
            .map(row => row.map((cell: any) => {
              const s = cell == null ? '' : String(cell);
              return `"${s.replace(/"/g, '""')}"`;
            }).join(';'))
            .join('\r\n');
        } else {
          text = await file.text();
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error(t('products.toast.notAuthenticated'));

        // Fetch existing products (paginated — Supabase caps at 1000/req).
        // Without pagination, products beyond the first 1000 would be misclassified
        // as "new" and their prices would not go through the delete-then-insert path,
        // so re-importing an edited CSV would silently skip price updates.
        const PAGE_SIZE = 1000;
        const fetchAllProducts = async (trashed: boolean) => {
          const all: { id: string; sku: string | null; organization_id: string | null }[] = [];
          let from = 0;
          while (true) {
            let q = supabase
              .from("products")
              .select("id, sku, organization_id")
              .eq("organization_id", activeCompany?.id)
              .range(from, from + PAGE_SIZE - 1);
            q = trashed ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
            const { data, error } = await q;
            if (error) throw error;
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
          }
          return all;
        };
        const existingProducts = await fetchAllProducts(false);
        const trashedProducts = await fetchAllProducts(true);

        const trashedSkuMap = new Map<string, any>();
        trashedProducts?.forEach(p => {
          if (p.sku) {
            const key = `${p.sku.toLowerCase()}::${p.organization_id ?? ''}`;
            trashedSkuMap.set(key, p);
          }
        });

        // Busca categorias da org activa para o import
        const { data: allCategoriesForImport } = await supabase
          .from("product_categories")
          .select("id, name, parent_id, organization_id")
          .eq("organization_id", activeCompany?.id);
        const allCats = allCategoriesForImport || categories;
        const parentCategories = allCats.filter((c: any) => !c.parent_id);
        const subcategories = allCats.filter((c: any) => c.parent_id);

        const businessUserIdForCsv = await resolveCurrentBusinessUserId();
        if (!businessUserIdForCsv) {
          toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
          return;
        }
        const { productsToInsert, productsToUpdate, pricesToInsert, pricesToUpdate, companyAssociations, stats, skippedLines, warnings } = await parseProductsCSV({
          text,
          categories: parentCategories,
          subcategories,
          brands,
          suppliers,
          companies,
          userId: businessUserIdForCsv,
          activeCompanyId: activeCompany?.id,
          existingProducts: existingProducts || [],
          trashedSkuMap,
        });

        // Accumulate skipped lines and warnings (tagged with file name)
        skippedLines.forEach(s => allSkipped.push({ ...s, file: file.name }));
        warnings.forEach(w => allWarnings.push(`[${file.name}] ${w}`));

        if (productsToInsert.length === 0 && productsToUpdate.length === 0) {
          // Nothing to write — only count skips and continue (don't throw)
          totalSkipped += stats.skippedCount;
          continue;
        }

        // Helper to chunk arrays for batch operations (avoid Supabase payload limits)
        const chunkArray = <T,>(arr: T[], size: number): T[][] => {
          const chunks: T[][] = [];
          for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
          }
          return chunks;
        };
        const CHUNK_SIZE = 50;

        // Upsert new products in chunks (handles SKUs hidden by RLS that already exist in DB).
        // onConflict matches the unique constraint products_sku_organization_id_key.
        // Returning rows lets us reconcile JS-generated UUIDs with the actual DB ids
        // (different when an upsert hit an existing row).
        const upsertedProducts: { id: string; sku: string; organization_id: string | null }[] = [];
        if (productsToInsert.length > 0) {
          for (const chunk of chunkArray(productsToInsert, CHUNK_SIZE)) {
            // Strip JS-generated `id` from payload: when upsert hits an existing row,
            // including `id` would attempt to change the PK and violate FKs from
            // dependent tables (product_attribute_price_ranges, etc.) whose CASCADE
            // only covers DELETE, not PK UPDATE.
            const sanitizedChunk = chunk.map(({ id, ...rest }: any) => rest);
            const { data: upserted, error: prodError } = await supabase
              .from("products")
              .upsert(sanitizedChunk, { onConflict: "sku,organization_id", ignoreDuplicates: false })
              .select("id, sku, organization_id");
            if (prodError) throw prodError;
            if (upserted) upsertedProducts.push(...upserted);
          }
        }

        // Map (sku::orgId) -> real DB id, so we can detect when upsert merged into an existing row.
        const skuLookup = new Map<string, string>();
        upsertedProducts.forEach(p => {
          skuLookup.set(`${p.sku.toLowerCase()}::${p.organization_id ?? ''}`, p.id);
        });

        // Reconcile prices/associations: redirect to real id and treat conflicts as updates.
        const reconciledPricesToInsert: any[] = [];
        const additionalPricesToUpdate: any[] = [];
        const conflictedJsIds = new Set<string>();
        const jsIdToRealId = new Map<string, string>();
        for (const original of productsToInsert) {
          const key = `${(original.sku || '').toLowerCase()}::${original.organization_id ?? ''}`;
          const realId = skuLookup.get(key) || original.id;
          jsIdToRealId.set(original.id, realId);
          const isConflict = realId !== original.id;
          if (isConflict) conflictedJsIds.add(original.id);

          pricesToInsert
            .filter((p: any) => p.product_id === original.id)
            .forEach((p: any) => {
              if (isConflict) additionalPricesToUpdate.push({ ...p, product_id: realId });
              else reconciledPricesToInsert.push(p);
            });
        }

        // Update existing products (matched in JS via existingProducts)
        for (const product of productsToUpdate) {
          const { id, ...updateData } = product;
          const { error } = await supabase.from("products").update(updateData).eq("id", id).eq("organization_id", activeCompany?.id);
          if (error) throw error;
        }

        // Insert prices for genuinely new products
        if (reconciledPricesToInsert.length > 0) {
          for (const chunk of chunkArray(reconciledPricesToInsert, CHUNK_SIZE)) {
            const { error: priceError } = await supabase.from("product_prices").insert(chunk);
            if (priceError) throw priceError;
          }
        }

        // Update prices for existing products: delete old then insert the CSV values.
        // Includes both JS-detected updates AND upsert-detected conflicts.
        const normalizedPricesToUpdate = [...pricesToUpdate, ...additionalPricesToUpdate].map((price: any) => ({
          ...price,
          created_by: businessUserIdForCsv,
        }));
        const updateProductIds = [...new Set(normalizedPricesToUpdate.map((p: any) => p.product_id))];

        for (const productId of updateProductIds) {
          // product_prices has no organization_id column; scope is enforced via product_id FK
          const { error: deletePriceError } = await supabase
            .from("product_prices")
            .delete()
            .eq("product_id", productId);

          if (deletePriceError) throw deletePriceError;
        }

        if (normalizedPricesToUpdate.length > 0) {
          for (const chunk of chunkArray(normalizedPricesToUpdate, CHUNK_SIZE)) {
            const { error: priceUpdateError } = await supabase
              .from("product_prices")
              .insert(chunk);

            if (priceUpdateError) throw priceUpdateError;
          }
        }

        // Remap associations to real DB ids (handles upsert merging into existing rows)
        // and upsert idempotently so both new and existing products end up linked.
        const remappedAssociations = companyAssociations.map(a => ({
          ...a,
          product_id: jsIdToRealId.get(a.product_id) || a.product_id,
        }));
        if (remappedAssociations.length > 0) {
          for (const chunk of chunkArray(remappedAssociations, CHUNK_SIZE)) {
            const { error: assocError } = await supabase
              .from("product_organizations")
              .upsert(chunk, { onConflict: "product_id,organization_id", ignoreDuplicates: true });
            if (assocError) throw assocError;
          }
        }

        totalNew += stats.newCount;
        totalUpdated += stats.updateCount;
        totalSkipped += stats.skippedCount;
        totalPrices += pricesToInsert.length;
      } catch (error: any) {
        failedFiles.push(`${file.name}: ${error.message}`);
      }
    }

    if (failedFiles.length > 0 && failedFiles.length === files.length) {
      toast({
        title: t('products.toast.importError'),
        description: failedFiles.join('\n'),
        variant: "destructive",
      });
    } else {
      const desc = `${totalNew} novos, ${totalUpdated} atualizados, ${totalSkipped} saltados`;

      toast({
        title: t('products.toast.importSuccess'),
        description: failedFiles.length > 0 
          ? `${desc}. Erros: ${failedFiles.join('; ')}`
          : desc,
      });

      // Show detailed report dialog if there are skips or warnings
      if (allSkipped.length > 0 || allWarnings.length > 0) {
        setImportReport({
          inserted: totalNew,
          updated: totalUpdated,
          skipped: totalSkipped,
          skippedLines: allSkipped,
          warnings: allWarnings,
        });
      }

      setImportDialogOpen(false);
      loadData();
    }
    } finally {
      // ALWAYS reset the input value, even on error or early return.
      // Otherwise re-selecting the same filename does NOT trigger onChange,
      // and edits to the same CSV would appear to be ignored.
      inputEl.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    downloadProductsTemplate();
    toast({
      title: t('products.toast.templateDownloaded') || "Template descarregado",
      description: t('products.toast.templateDownloadedDesc') || "Preencha o ficheiro e importe-o.",
    });
  };

  // With server-side filtering, we only need to apply org filter client-side
  // (since it's harder to filter by product_organizations in global view)
  const filteredProducts = products
    .filter((product) => {
      // Only apply organization filter client-side when in global view (no activeCompany)
      if (!activeCompany?.id && companyFilter !== "all") {
        const productOrgIds = (product as any).product_organizations?.map((po: any) => po.organization_id) || [];
        return productOrgIds.includes(companyFilter) || product.organization_id === companyFilter;
      }
      return true;
    });

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('products.title')}</h1>
            <PageFAQSheet pageKey="catalog.products" />
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="products.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> {t('products.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="products.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> {t('products.import')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('products.importDialog.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('products.importDialog.description')}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                        <Download className="mr-2 h-4 w-4" />
                        {t('products.downloadTemplate') || "Template"}
                      </Button>
                    </div>
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      multiple
                      onChange={handleImport}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </PermissionGate>

            {/* Import report dialog */}
            <Dialog open={!!importReport} onOpenChange={(o) => { if (!o) setImportReport(null); }}>
              <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Relatório de Importação</DialogTitle>
                </DialogHeader>
                {importReport && (
                  <div className="space-y-4 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-md border p-3">
                        <div className="text-2xl font-semibold text-primary">{importReport.inserted}</div>
                        <div className="text-xs text-muted-foreground">Inseridos</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-2xl font-semibold text-primary">{importReport.updated}</div>
                        <div className="text-xs text-muted-foreground">Actualizados</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-2xl font-semibold text-destructive">{importReport.skipped}</div>
                        <div className="text-xs text-muted-foreground">Saltados</div>
                      </div>
                    </div>

                    {importReport.skippedLines.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Linhas saltadas (primeiras 50)</div>
                        <div className="rounded-md border max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2">Ficheiro</th>
                                <th className="text-left p-2">Linha</th>
                                <th className="text-left p-2">SKU</th>
                                <th className="text-left p-2">Motivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importReport.skippedLines.slice(0, 50).map((s, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="p-2 truncate max-w-[160px]" title={s.file}>{s.file}</td>
                                  <td className="p-2">{s.line}</td>
                                  <td className="p-2 font-mono">{s.sku}</td>
                                  <td className="p-2">{s.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {importReport.skippedLines.length > 50 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            ...e mais {importReport.skippedLines.length - 50} linhas (use "Copiar relatório" para ver todas)
                          </div>
                        )}
                      </div>
                    )}

                    {importReport.warnings.length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Avisos ({importReport.warnings.length})</div>
                        <div className="rounded-md border max-h-40 overflow-y-auto p-2 space-y-1">
                          {importReport.warnings.slice(0, 100).map((w, idx) => (
                            <div key={idx} className="text-xs text-muted-foreground">{w}</div>
                          ))}
                          {importReport.warnings.length > 100 && (
                            <div className="text-xs text-muted-foreground">...e mais {importReport.warnings.length - 100} avisos</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const lines = [
                            `Inseridos: ${importReport.inserted}`,
                            `Actualizados: ${importReport.updated}`,
                            `Saltados: ${importReport.skipped}`,
                            '',
                            'LINHAS SALTADAS:',
                            ...importReport.skippedLines.map(s => `- [${s.file}] linha ${s.line}, SKU=${s.sku}: ${s.reason}`),
                            '',
                            'AVISOS:',
                            ...importReport.warnings,
                          ];
                          navigator.clipboard.writeText(lines.join('\n'));
                          toast({ title: 'Relatório copiado' });
                        }}
                      >
                        Copiar relatório
                      </Button>
                      <Button onClick={() => setImportReport(null)}>Fechar</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <PermissionGate permission="products.create">
              <Button onClick={() => { resetForm(); setOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('products.addProduct')}
              </Button>
            </PermissionGate>
            <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle>{editingProduct ? t('products.dialog.editTitle') : t('products.dialog.newTitle')}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2">
              <form onSubmit={handleSubmit} className="space-y-4 pb-4">
                {/* Show Copy Last button only for new products */}
                {!editingProduct && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={copyLastProduct}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {t('products.copyLast')}
                  </Button>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">{t('products.form.sku')}</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      required
                      disabled={!!editingProduct}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">{t('products.form.barcode')}</Label>
                    <Input
                      id="barcode"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('products.form.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('products.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category_id">{t('products.form.category')}</Label>
                    {categories.filter((c: any) => !c.parent_id).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic h-10 flex items-center">{t('products.form.noCategoriesAvailable') || "Nenhuma categoria disponível"}</p>
                    ) : (
                      <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value, subcategory_id: "" })}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('products.form.selectCategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.filter((c: any) => !c.parent_id).map((category: any) => (
                            <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subcategory_id">{t('products.form.subcategory')}</Label>
                    {!formData.category_id ? (
                      <p className="text-sm text-muted-foreground italic h-10 flex items-center">{t('products.form.selectCategoryFirst')}</p>
                    ) : categories.filter((c: any) => c.parent_id === formData.category_id).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic h-10 flex items-center">{t('products.form.noSubcategoriesAvailable') || "Nenhuma subcategoria disponível"}</p>
                    ) : (
                      <Select value={formData.subcategory_id} onValueChange={(value) => setFormData({ ...formData, subcategory_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('products.form.selectSubcategory')} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.filter((c: any) => c.parent_id === formData.category_id).map((subcategory: any) => (
                            <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand_id">{t('products.form.brand')}</Label>
                    {brands.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic h-10 flex items-center">{t('products.form.noBrandsAvailable') || "Nenhuma marca disponível"}</p>
                    ) : (
                      <Select value={formData.brand_id} onValueChange={(value) => setFormData({ ...formData, brand_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('products.form.selectBrand')} />
                        </SelectTrigger>
                        <SelectContent>
                          {brands.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier_id">{t('products.form.supplier') || "Fornecedor"}</Label>
                    {suppliers.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic h-10 flex items-center">{t('products.form.noSuppliersAvailable') || "Nenhum fornecedor disponível"}</p>
                    ) : (
                      <Select value={selectedSupplierId} onValueChange={(value) => setSelectedSupplierId(value)}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('products.form.selectSupplier') || "Selecione um fornecedor"} />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <OrganizationFormSection
                  value={organizationSelection}
                  onChange={setOrganizationSelection}
                  showBusinessUnit={true}
                  showDepartment={true}
                  multiSelectCompanies={true}
                />


                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_type">{t('products.form.productType')}</Label>
                    <Select value={formData.product_type} onValueChange={(value) => setFormData({ ...formData, product_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sale">{t('products.form.saleOnly')}</SelectItem>
                        <SelectItem value="purchase">{t('products.form.purchaseOnly')}</SelectItem>
                        <SelectItem value="both">{t('products.form.salePurchase')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">{t('products.form.status')}</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">{t('products.form.draft')}</SelectItem>
                        <SelectItem value="active">{t('products.form.active')}</SelectItem>
                        <SelectItem value="discontinued">{t('products.form.discontinued')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ProductFormPrices prices={priceFormData} onChange={setPriceFormData} />

                <ProductFormAttributes 
                  attributes={attributeFormData} 
                  onChange={setAttributeFormData}
                  productId={editingProduct?.id}
                  productCategoryId={formData.subcategory_id || formData.category_id || null}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('products.form.cancel')}
                  </Button>
                  <Button type="submit">{editingProduct ? t('products.form.updateProduct') : t('products.form.createProduct')}</Button>
                </div>
              </form>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('products.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Select value={categoryFilter} onValueChange={(value) => {
              setCategoryFilter(value);
              // Reset subcategory filter when category changes
              setSubcategoryFilter("all");
            }}>
              <SelectTrigger>
                <SelectValue placeholder={t('products.allCategories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allCategories')}</SelectItem>
                {categories
                  .filter((c: any) => !c.parent_id)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('products.allSubcategories') || "Todas Subcategorias"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allSubcategories') || "Todas Subcategorias"}</SelectItem>
                {categories
                  .filter((c: any) => {
                    // Show all subcategories or only those from selected category
                    if (categoryFilter === "all") return c.parent_id;
                    return c.parent_id === categoryFilter;
                  })
                  .map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id}>
                      {subcategory.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('products.allBrands')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allBrands')}</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('products.allCompanies')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('products.allCompanies')}</SelectItem>
                {companies.map((company: any) => (
                  <SelectItem key={company.id} value={company.id}>
                    <span style={{ paddingLeft: `${(company.depth || 0) * 12}px` }} className="flex items-center gap-1">
                      {(company.depth || 0) > 0 && <span className="text-muted-foreground">└</span>}
                      {company.name}
                      {company.type && (
                        <span className="text-xs text-muted-foreground ml-1">({company.type})</span>
                      )}
                    </span>
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
          onOrgClick={() => bulkActions.setBulkOrgDialogOpen(true)}
          onClearSelection={bulkActions.clearSelection}
          statusPermission="products.edit"
          deletePermission="products.delete"
          showBulkPrice={true}
          showBulkAttributes={true}
          onBulkPriceClick={() => setBulkPriceDialogOpen(true)}
          onBulkAttributesClick={() => setBulkAttributesDialogOpen(true)}
          showBulkCategory={true}
          showBulkSubcategory={true}
          showBulkProductType={true}
          showBulkUom={true}
          onBulkCategoryClick={() => setBulkCategoryDialogOpen(true)}
          onBulkSubcategoryClick={() => setBulkSubcategoryDialogOpen(true)}
          onBulkProductTypeClick={() => setBulkProductTypeDialogOpen(true)}
          onBulkUomClick={() => setBulkUomDialogOpen(true)}
        />

        {loading ? (
          <div className="text-center py-8">{t('products.loading')}</div>
        ) : (
          <>
            <div className="mb-2 text-sm text-muted-foreground">
              💡 {t('products.inlineEditHint')}
            </div>
            <div className="border rounded-lg overflow-auto leads-table-scroll" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <Table density="compact" className="min-w-[1200px]" containerClassName="overflow-visible">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={bulkActions.selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                      onCheckedChange={() => bulkActions.toggleSelectAll(filteredProducts.map(p => p.id))}
                    />
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortField === 'sku') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('sku');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center">
                      {t('products.table.sku')}
                      {sortField === 'sku' ? (
                        sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortField === 'name') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('name');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center">
                      {t('products.table.name')}
                      {sortField === 'name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>{t('products.table.category')}</TableHead>
                  <TableHead>{t('products.table.subcategory')}</TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortField === 'brand_name') {
                        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortField('brand_name');
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center">
                      {t('products.table.brand')}
                      {sortField === 'brand_name' ? (
                        sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead>{t('products.table.company')}</TableHead>
                  
                  <TableHead>{t('products.table.productType') || 'Tipo de Produto'}</TableHead>
                  <TableHead>{t('products.table.stock')}</TableHead>
                  <TableHead>{t('products.table.status')}</TableHead>
                  <TableHead className="text-right">{t('products.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      {t('products.noProducts')}
                    </TableCell>
                  </TableRow>
                ) : (
                   filteredProducts.map((product) => {
                     const totalStock = getTotalStock(product);
                     
                     return (
                       <TableRow key={product.id}>
                         <TableCell>
                           <Checkbox
                             checked={bulkActions.selectedIds.has(product.id)}
                             onCheckedChange={() => bulkActions.toggleSelectOne(product.id)}
                           />
                         </TableCell>
                         <TableCell 
                           className="font-medium cursor-pointer hover:bg-muted/50"
                           onDoubleClick={() => startEditing(product.id, "sku", product.sku)}
                         >
                           {editingCell?.productId === product.id && editingCell?.field === "sku" ? (
                             <Input
                               value={editingValue}
                               onChange={(e) => setEditingValue(e.target.value)}
                               onBlur={() => saveInlineEdit(product.id, "sku")}
                               onKeyDown={(e) => handleKeyDown(e, product.id, "sku")}
                               autoFocus
                               className="h-8"
                             />
                           ) : (
                             product.sku
                           )}
                         </TableCell>
                         <TableCell 
                           className="cursor-pointer hover:bg-muted/50"
                           onDoubleClick={() => startEditing(product.id, "name", product.name)}
                         >
                           {editingCell?.productId === product.id && editingCell?.field === "name" ? (
                             <Input
                               value={editingValue}
                               onChange={(e) => setEditingValue(e.target.value)}
                               onBlur={() => saveInlineEdit(product.id, "name")}
                               onKeyDown={(e) => handleKeyDown(e, product.id, "name")}
                               autoFocus
                               className="h-8"
                             />
                           ) : (
                             product.name
                           )}
                         </TableCell>
                         <TableCell 
                           className="cursor-pointer hover:bg-muted/50"
                           onDoubleClick={() => {
                             setEditingCell({ productId: product.id, field: "category_id" });
                             setEditingValue(product.category_id || "");
                           }}
                         >
                           {editingCell?.productId === product.id && editingCell?.field === "category_id" ? (
                             <Select
                               value={editingValue}
                               onValueChange={(value) => {
                                 setEditingValue(value);
                                 // Save immediately when selecting — scoped to activeCompany to match all other write paths
                                 if (!activeCompany?.id) {
                                   cancelEditing();
                                   return;
                                 }
                                 const updateData = { category_id: value };
                                 supabase
                                   .from("products")
                                   .update(updateData)
                                   .eq("id", product.id)
                                   .eq("organization_id", activeCompany.id)
                                   .then(({ error }) => {
                                     if (error) {
                                       toast({
                                         title: t('products.toast.updateFailed'),
                                         description: error.message,
                                         variant: "destructive",
                                       });
                                     } else {
                                       toast({
                                         title: t('products.toast.categoryUpdated'),
                                       });
                                       loadData();
                                     }
                                     cancelEditing();
                                   });
                               }}
                               onOpenChange={(open) => {
                                 if (!open) {
                                   cancelEditing();
                                 }
                               }}
                             >
                               <SelectTrigger className="h-8">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                  {categories
                                    .filter((c: any) => !c.parent_id)
                                    .map((category: any) => (
                                     <SelectItem key={category.id} value={category.id}>
                                       {category.name}
                                     </SelectItem>
                                   ))}
                               </SelectContent>
                             </Select>
                            ) : (
                              // Category: show the category name
                              product.product_categories?.name || "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Subcategory: show subcategory name from separate relation */}
                            {product.subcategory?.name || "-"}
                          </TableCell>
                         <TableCell>{product.brands?.name || "-"}</TableCell>
                         <TableCell>
                            {(() => {
                              const orgIds = (product as any).product_organizations?.map((po: any) => po.organization_id) || [];
                              const orgNames = orgIds.map((oid: string) => companies.find(c => c.id === oid)?.name).filter(Boolean);
                              return orgNames.length > 0 ? orgNames.join(", ") : (product.anew_organizations?.name || "-");
                            })()}
                         </TableCell>
                         
                         <TableCell>
                           {(() => {
                             const isSellable = product.is_sellable;
                             const isPurchasable = product.is_purchasable;
                             if (isSellable && isPurchasable) return t('products.form.salePurchase');
                             if (isSellable) return t('products.form.saleOnly');
                             if (isPurchasable) return t('products.form.purchaseOnly');
                             return "-";
                           })()}
                         </TableCell>
                         <TableCell>
                           <Badge variant={totalStock > 0 ? "default" : "destructive"}>
                             {totalStock}
                           </Badge>
                         </TableCell>
                         <TableCell>
                           <Badge variant={getStatusColor(product.status)}>
                             {getStatusLabel(product.status)}
                           </Badge>
                         </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <PermissionGate permission="products.manage_prices">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setPricesDialogOpen(true);
                                }}
                                title={t('products.action.managePrices')}
                              >
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="products.view">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setPriceHistoryDialogOpen(true);
                                }}
                                title={t('products.action.priceHistory')}
                              >
                                <History className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="products.edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setConfigurableOptionsDialogOpen(true);
                                }}
                                title="Gerir Opções & Preços"
                              >
                                <Settings2 className="w-4 h-4 text-orange-500" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="products.edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(product)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="products.delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteConfirmId(product.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            
            {/* Infinite scroll loader - inside scroll container */}
            <div ref={loadMoreRef} className="py-4 flex justify-center">
              {loadingMore && (
                <div className="text-sm text-muted-foreground">{t('products.loadingMore')}</div>
              )}
              {!hasMore && products.length > 0 && (
                <div className="text-sm text-muted-foreground">{t('products.allLoaded')}</div>
              )}
            </div>
          </div>
          </>
        )}

        {/* Price Management Dialog */}
        {selectedProduct && (
          <>
            <ProductPricesDialog
              open={pricesDialogOpen}
              onOpenChange={(open) => {
                setPricesDialogOpen(open);
                if (!open) {
                  setSelectedProduct(null);
                  loadData(); // Refresh to show updated prices
                }
              }}
              productId={selectedProduct.id}
              productName={selectedProduct.name}
            />
            <ProductPriceHistoryDialog
              open={priceHistoryDialogOpen}
              onOpenChange={(open) => {
                setPriceHistoryDialogOpen(open);
                if (!open) {
                  setSelectedProduct(null);
                }
              }}
              productId={selectedProduct.id}
              productName={selectedProduct.name}
            />
            <ProductConfigurableOptionsDialog
              open={configurableOptionsDialogOpen}
              onOpenChange={(open) => {
                setConfigurableOptionsDialogOpen(open);
                if (!open) {
                  setSelectedProduct(null);
                  loadData();
                }
              }}
              productId={selectedProduct.id}
              productName={selectedProduct.name}
              companyId={selectedProduct.organization_id || activeCompany?.id || ''}
              productCategoryId={selectedProduct.subcategory_id || selectedProduct.category_id || null}
              productBasePrice={0}
            />
          </>
        )}



        <BulkStatusDialog
          open={bulkActions.bulkStatusDialogOpen}
          onOpenChange={bulkActions.setBulkStatusDialogOpen}
          selectedCount={bulkActions.selectedIds.size}
          status={bulkActions.bulkNewStatus}
          onStatusChange={bulkActions.setBulkNewStatus}
          onConfirm={() => bulkActions.handleBulkStatusChange("status")}
          processing={bulkActions.processing}
          statusOptions={[
            { value: "draft", label: t('products.form.draft') },
            { value: "active", label: t('products.form.active') },
            { value: "discontinued", label: t('products.form.discontinued') },
          ]}
        />

        {/* Bulk Delete Dialog */}
        <BulkDeleteDialog
          open={bulkActions.bulkDeleteDialogOpen}
          onOpenChange={bulkActions.setBulkDeleteDialogOpen}
          selectedCount={bulkActions.selectedIds.size}
          onConfirm={bulkActions.handleBulkDelete}
          processing={bulkActions.processing}
        />

        {/* Bulk Organization Dialog */}
        <BulkOrgDialog
          open={bulkActions.bulkOrgDialogOpen}
          onOpenChange={bulkActions.setBulkOrgDialogOpen}
          selectedCount={bulkActions.selectedIds.size}
          companyId={bulkActions.bulkNewCompanyId}
          onCompanyChange={bulkActions.setBulkNewCompanyId}
          onConfirm={() => bulkActions.handleBulkCompanyChange("organization_id")}
          companies={companies}
          processing={bulkActions.processing}
        />

        <BulkPriceDialog
          open={bulkPriceDialogOpen}
          onOpenChange={setBulkPriceDialogOpen}
          selectedProductIds={Array.from(bulkActions.selectedIds)}
          onSuccess={() => {
            bulkActions.clearSelection();
            loadData();
          }}
        />

        <BulkAttributesDialog
          open={bulkAttributesDialogOpen}
          onOpenChange={setBulkAttributesDialogOpen}
          selectedProductIds={Array.from(bulkActions.selectedIds)}
          onSuccess={() => {
            bulkActions.clearSelection();
            loadData();
          }}
        />

        {/* Bulk Category Dialog */}
        <Dialog open={bulkCategoryDialogOpen} onOpenChange={setBulkCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.bulkCategory.title') || 'Alterar Categoria em Massa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('products.bulkCategory.description', { count: bulkActions.selectedIds.size }) || `Alterar categoria de ${bulkActions.selectedIds.size} produtos`}
              </p>
              <div className="space-y-2">
                <Label>{t('products.form.category')}</Label>
                <NativeSelect
                  value={bulkCategoryId}
                  onValueChange={setBulkCategoryId}
                  placeholder={t('products.form.selectCategory')}
                  options={categories.filter((c: any) => !c.parent_id).map((category) => ({ value: category.id, label: category.name }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkCategoryDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBulkCategoryUpdate} disabled={!bulkCategoryId}>
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Subcategory Dialog */}
        <Dialog open={bulkSubcategoryDialogOpen} onOpenChange={setBulkSubcategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.bulkSubcategory.title') || 'Alterar Subcategoria em Massa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('products.bulkSubcategory.description', { count: bulkActions.selectedIds.size }) || `Alterar subcategoria de ${bulkActions.selectedIds.size} produtos`}
              </p>
              <div className="space-y-2">
                <Label>{t('products.form.subcategory')}</Label>
                <NativeSelect
                  value={bulkSubcategoryId}
                  onValueChange={setBulkSubcategoryId}
                  placeholder={t('products.form.selectSubcategory')}
                  options={categories.filter((c: any) => c.parent_id).map((subcategory) => ({ value: subcategory.id, label: subcategory.name }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkSubcategoryDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBulkSubcategoryUpdate} disabled={!bulkSubcategoryId}>
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>


        {/* Bulk Product Type Dialog */}
        <Dialog open={bulkProductTypeDialogOpen} onOpenChange={setBulkProductTypeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.bulkProductType.title') || 'Alterar Tipo de Produto em Massa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('products.bulkProductType.description', { count: bulkActions.selectedIds.size }) || `Alterar tipo de ${bulkActions.selectedIds.size} produtos`}
              </p>
              <div className="space-y-2">
                <Label>{t('products.form.productType') || 'Tipo de Produto'}</Label>
                <NativeSelect
                  value={bulkProductType}
                  onValueChange={setBulkProductType}
                  placeholder={t('products.form.selectProductType') || 'Selecionar tipo'}
                  options={[
                    { value: "sale", label: t('products.form.forSale') || 'Para Venda' },
                    { value: "purchase", label: t('products.form.forPurchase') || 'Para Compra' },
                    { value: "both", label: t('products.form.both') || 'Ambos' },
                  ]}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkProductTypeDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBulkProductTypeUpdate} disabled={!bulkProductType}>
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk UOM Dialog */}
        <Dialog open={bulkUomDialogOpen} onOpenChange={setBulkUomDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.bulkUom.title') || 'Alterar Unidade de Medida em Massa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('products.bulkUom.description', { count: bulkActions.selectedIds.size }) || `Alterar unidade de medida de ${bulkActions.selectedIds.size} produtos`}
              </p>
              <div className="space-y-2">
                <Label>{t('uom.title')}</Label>
                <NativeSelect
                  value={bulkUomId}
                  onValueChange={setBulkUomId}
                  placeholder={t('common.select')}
                  options={uomList.map((uom) => ({ value: uom.id, label: `${uom.code}${uom.description ? ` - ${uom.description}` : ''}` }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkUomDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleBulkUomUpdate} disabled={!bulkUomId}>
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete confirmation AlertDialog — replaces window.confirm for accessibility */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('products.toast.deleteConfirm') || "Eliminar produto?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('products.toast.deleteConfirmDesc') || "Esta ação não pode ser desfeita. O produto será marcado como eliminado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteConfirmId) handleDelete(deleteConfirmId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete') || "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
