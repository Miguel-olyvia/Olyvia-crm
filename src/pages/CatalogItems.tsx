import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Trash2, Search, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

interface CatalogProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
  category_id: string | null;
  brand_id: string | null;
  organization_id: string | null;
  product_categories: { name: string } | null;
  brands: { name: string } | null;
  product_prices: { price: number; price_type: string }[] | null;
}

interface CatalogItem {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  retail_price: number | null;
  category_name: string | null;
  brand_name: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
}

type SortField = 'sku' | 'name' | 'category_name' | 'brand_name' | 'retail_price' | 'is_active';
type SortDirection = 'asc' | 'desc' | null;

const CatalogItems = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { companies: userCompanies, userType, activeCompany } = useCompany();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const isSystemAdmin = userType === "system_admin";
  const availableCompanies = isSystemAdmin ? allCompanies : userCompanies;

  // Redirect if no permission
  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("catalog_items.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Load data when filters change
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load companies for system admin
      if (isSystemAdmin && allCompanies.length === 0) {
        const { data: companiesData } = await supabase
          .from("anew_organizations")
          .select("id, name")
          .order("name");
        setAllCompanies(companiesData || []);
      }

      // Load categories
      const { data: categoriesData } = await supabase
        .from("product_categories")
        .select("id, name")
        .is("parent_id", null)
        .order("name");
      setCategories(categoriesData || []);

      // Build products query with prices LEFT joined (products without prices should still appear)
      let productsQuery = supabase
        .from("products")
        .select(`
          id, sku, name, description, is_active, created_at, category_id, brand_id, organization_id,
          product_categories!category_id(name),
          brands(name),
          product_prices(price, price_type)
        `)
        .eq("is_sellable", true);

      // Apply company filter
      if (isSystemAdmin) {
        if (selectedCompanyId !== "all") {
          productsQuery = productsQuery.eq("organization_id", selectedCompanyId);
        }
      } else if (userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.id);
        if (selectedCompanyId !== "all") {
          productsQuery = productsQuery.eq("organization_id", selectedCompanyId);
        } else {
          productsQuery = productsQuery.in("organization_id", companyIds);
        }
      }

      // Apply category filter
      if (selectedCategoryId !== "all") {
        productsQuery = productsQuery.eq("category_id", selectedCategoryId);
      }

      const { data: productsData, error: productsError } = await productsQuery
        .order("name");

      if (productsError) throw productsError;

      // Map to CatalogItem format - find retail price from prices array
      const mappedItems: CatalogItem[] = (productsData || []).map((product: CatalogProduct) => {
        const retailPrice = product.product_prices?.find((p) => p.price_type === 'retail');
        return {
          id: product.id,
          sku: product.sku,
          name: product.name,
          description: product.description,
          is_active: product.is_active ?? false,
          retail_price: retailPrice?.price || null,
          category_name: product.product_categories?.name || null,
          brand_name: product.brands?.name || null,
          created_at: product.created_at,
        };
      });

      setItems(mappedItems);
    } catch (error: any) {
      toast({
        title: t('catalogItems.toast.errorLoadingItems'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, selectedCategoryId, userCompanies, isSystemAdmin, allCompanies.length, toast, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    let result = items.filter((item) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.sku?.toLowerCase().includes(searchLower) ||
        item.name.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.category_name?.toLowerCase().includes(searchLower) ||
        item.brand_name?.toLowerCase().includes(searchLower)
      );
    });

    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        if (aVal === null || aVal === undefined) aVal = '';
        if (bVal === null || bVal === undefined) bVal = '';

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        if (typeof aVal === 'boolean') {
          return sortDirection === 'asc' 
            ? (aVal === bVal ? 0 : aVal ? -1 : 1)
            : (aVal === bVal ? 0 : aVal ? 1 : -1);
        }

        const strA = String(aVal).toLowerCase();
        const strB = String(bVal).toLowerCase();
        return sortDirection === 'asc' 
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    return result;
  }, [items, searchTerm, sortField, sortDirection]);

  const handleDelete = async () => {
    if (!deleteItemId) return;

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const { error } = await withAuditContext(supabase, businessUserId, async () => {
        await supabase.from("product_prices").delete().eq("product_id", deleteItemId);
        return await supabase.from("products").delete().eq("id", deleteItemId);
      });

      if (error) throw error;

      toast({
        title: t('catalogItems.toast.success'),
        description: t('catalogItems.toast.productDeleted'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('catalogItems.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteItemId(null);
    }
  };

  const handleExport = () => {
    downloadStandardXlsx({
      sheetName: "Catálogo de produtos",
      columns: [
        { key: "sku", header: t('catalogItems.table.sku'), width: 16 },
        { key: "name", header: t('catalogItems.table.name'), width: 30 },
        { key: "description", header: t('catalogItems.table.description'), width: 40 },
        { key: "category", header: t('catalogItems.table.category'), width: 22 },
        { key: "brand", header: t('catalogItems.table.brand'), width: 20 },
        { key: "price", header: t('catalogItems.table.salePrice'), type: "number", width: 16 },
        { key: "active", header: t('catalogItems.table.active'), type: "boolean", width: 10 },
      ],
      rows: filteredAndSortedItems.map((item) => ({
        sku: item.sku,
        name: item.name,
        description: item.description,
        category: item.category_name,
        brand: item.brand_name,
        price: item.retail_price,
        active: item.is_active,
      })),
    }, `catalogo_produtos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast({
      title: t('catalogItems.info') || 'Info',
      description: t('catalogItems.toast.inDevelopment') || 'Functionality in development',
      variant: "default",
    });

    setShowBulkUploadDialog(false);
  };

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

  return (
    <>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{t('catalogItems.title')}</h1>
            <p className="text-muted-foreground">{t('catalogItems.subtitle')}</p>
          </div>
          
          <div className="flex gap-2">
            <PermissionGate permission="catalog_items.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                {t('catalogItems.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="catalog_items.import">
              <Dialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('catalogItems.bulkUpload')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('catalogItems.bulkUploadTitle')}</DialogTitle>
                    <DialogDescription>
                      {t('catalogItems.bulkUploadDescription')}
                    </DialogDescription>
                  </DialogHeader>
                  <Input type="file" accept=".csv" onChange={handleBulkUpload} />
                </DialogContent>
              </Dialog>
            </PermissionGate>
          </div>
        </div>

        <div className="mb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('catalogItems.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div>
              <Select value={selectedCompanyId} onValueChange={(value) => {
                setSelectedCompanyId(value);
                setSelectedCategoryId("all");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('catalogItems.filterByCompany')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('catalogItems.allCompanies')}</SelectItem>
                  {availableCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('catalogItems.filterByCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('catalogItems.allCategories')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="sku">{t('catalogItems.table.sku')}</SortableHeader>
                <SortableHeader field="name">{t('catalogItems.table.name')}</SortableHeader>
                <TableHead>{t('catalogItems.table.description')}</TableHead>
                <SortableHeader field="category_name">{t('catalogItems.table.category')}</SortableHeader>
                <SortableHeader field="brand_name">{t('catalogItems.table.brand')}</SortableHeader>
                <SortableHeader field="retail_price">{t('catalogItems.table.salePrice')}</SortableHeader>
                <SortableHeader field="is_active">{t('catalogItems.table.active')}</SortableHeader>
                <TableHead className="text-right">{t('catalogItems.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    {t('catalogItems.loading')}
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    {t('catalogItems.noProducts')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.sku || "-"}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="max-w-xs truncate">{item.description || "-"}</TableCell>
                    <TableCell>{item.category_name || "-"}</TableCell>
                    <TableCell>{item.brand_name || "-"}</TableCell>
                    <TableCell className="font-semibold">€{item.retail_price?.toFixed(2) || "0.00"}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? "default" : "destructive"}>
                        {item.is_active ? t('catalogItems.yes') : t('catalogItems.no')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PermissionGate permission="catalog_items.delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteItemId(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('catalogItems.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('catalogItems.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('catalogItems.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('catalogItems.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CatalogItems;
