import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Search, Trash2, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useCompany } from "@/contexts/CompanyContext";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

interface Service {
  id: string;
  sku: string;
  name: string;
  short_desc: string | null;
  long_desc: string | null;
  is_active: boolean;
  service_type: string;
  organization_id?: string | null;
  supplier_id?: string | null;
  service_category_id?: string | null;
  service_categories?: { name: string };
  anew_organizations?: { name: string };
  suppliers?: { name: string };
  service_prices?: Array<{
    price: number;
    price_type: string;
    currency: string;
  }>;
}

interface Category {
  id: string;
  name: string;
  organization_id: string | null;
}

type SortField = 'sku' | 'name' | 'category_name' | 'retail_price' | 'company_name' | 'supplier_name' | 'is_active';
type SortDirection = 'asc' | 'desc' | null;

export default function ServiceCatalogItems() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { companies: userCompanies, userType, activeCompany } = useCompany();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const isSystemAdmin = userType === "system_admin";
  const availableCompanies = isSystemAdmin ? allCompanies : userCompanies;

  const filteredCategories = selectedCompanyId === "all" 
    ? categories 
    : categories.filter(cat => cat.organization_id === selectedCompanyId);

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("service_catalog.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  useEffect(() => {
    loadData();
  }, [selectedCompanyId, selectedCategoryId, userCompanies, isSystemAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (isSystemAdmin && allCompanies.length === 0) {
        const { data: companiesData } = await supabase
          .from("anew_organizations")
          .select("id, name")
          .order("name");
        setAllCompanies(companiesData || []);
      }

      let categoriesQuery = supabase
        .from("service_categories")
        .select("id, name, organization_id")
        .is("parent_id", null)
        .eq("is_active", true);

      if (!isSystemAdmin && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.id);
        categoriesQuery = categoriesQuery.in("organization_id", companyIds);
      }

      const { data: categoriesData } = await categoriesQuery.order("name");
      setCategories(categoriesData || []);

      let servicesQuery = supabase
        .from("services")
        .select(`
          *,
          service_categories:service_categories!service_category_id(name),
          anew_organizations!organization_id(name),
          suppliers(name),
          service_prices(price, price_type, currency)
        `)
        .in("service_type", ["sale", "both"]);

      if (!isSystemAdmin && userCompanies.length > 0) {
        const companyIds = userCompanies.map(c => c.id);
        if (selectedCompanyId !== "all") {
          servicesQuery = servicesQuery.eq("organization_id", selectedCompanyId);
        } else {
          servicesQuery = servicesQuery.in("organization_id", companyIds);
        }
      } else if (selectedCompanyId !== "all") {
        servicesQuery = servicesQuery.eq("organization_id", selectedCompanyId);
      }

      if (selectedCategoryId !== "all") {
        servicesQuery = servicesQuery.eq("service_category_id", selectedCategoryId);
      }

      const { data, error } = await servicesQuery.order("name");

      if (error) throw error;

      setServices(data || []);
    } catch (error: any) {
      toast({
        title: t('serviceCatalog.toast.errorLoadingData'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const filteredAndSortedServices = useMemo(() => {
    let result = services.filter((service) =>
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (service.service_categories?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    ).map(service => {
      const retailPrice = service.service_prices?.find(p => p.price_type === 'retail');
      return {
        ...service,
        category_name: service.service_categories?.name || null,
        company_name: service.anew_organizations?.name || null,
        supplier_name: service.suppliers?.name || null,
        retail_price: retailPrice?.price || null,
        currency: retailPrice?.currency || 'EUR',
      };
    });

    if (sortField && sortDirection) {
      result = [...result].sort((a, b) => {
        let aVal: any = a[sortField as keyof typeof a];
        let bVal: any = b[sortField as keyof typeof b];

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
  }, [services, searchTerm, sortField, sortDirection]);

  const handleDelete = async () => {
    if (!deleteItemId) return;

    try {
      const { error } = await supabase
        .from("services")
        .delete()
        .eq("id", deleteItemId);

      if (error) throw error;

      toast({
        title: t('serviceCatalog.toast.success'),
        description: t('serviceCatalog.toast.serviceDeleted'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('serviceCatalog.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteItemId(null);
    }
  };

  const handleExport = () => {
    downloadStandardXlsx({
      sheetName: "Catálogo de serviços",
      columns: [
        { key: "sku", header: t('serviceCatalog.table.sku'), width: 16 },
        { key: "name", header: t('serviceCatalog.table.name'), width: 30 },
        { key: "category", header: t('serviceCatalog.table.category'), width: 22 },
        { key: "price", header: t('serviceCatalog.table.salePrice'), type: "number", width: 16 },
        { key: "currency", header: "Moeda", width: 10 },
        { key: "company", header: t('serviceCatalog.table.company'), width: 26 },
        { key: "supplier", header: t('serviceCatalog.table.supplier'), width: 26 },
        { key: "active", header: t('serviceCatalog.table.status'), type: "boolean", width: 10 },
      ],
      rows: filteredAndSortedServices.map((service) => ({
        sku: service.sku,
        name: service.name,
        category: service.category_name,
        price: service.retail_price,
        currency: service.currency,
        company: service.company_name,
        supplier: service.supplier_name,
        active: service.is_active,
      })),
    }, `catalogo_servicos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast({
      title: t('serviceCatalog.info'),
      description: t('serviceCatalog.toast.inDevelopment'),
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
            <h1 className="text-3xl font-bold">{t('serviceCatalog.title')}</h1>
            <p className="text-muted-foreground">{t('serviceCatalog.subtitle')}</p>
          </div>
          
          <div className="flex gap-2">
            <PermissionGate permission="service_catalog.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                {t('serviceCatalog.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="service_catalog.import">
              <Dialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    {t('serviceCatalog.bulkUpload')}
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('serviceCatalog.bulkUploadTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('serviceCatalog.bulkUploadDescription')}
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
                placeholder={t('serviceCatalog.searchPlaceholder')}
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
                  <SelectValue placeholder={t('serviceCatalog.filterByCompany')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('serviceCatalog.allCompanies')}</SelectItem>
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
                  <SelectValue placeholder={t('serviceCatalog.filterByCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('serviceCatalog.allCategories')}</SelectItem>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader field="sku">{t('serviceCatalog.table.sku')}</SortableHeader>
                <SortableHeader field="name">{t('serviceCatalog.table.name')}</SortableHeader>
                <SortableHeader field="category_name">{t('serviceCatalog.table.category')}</SortableHeader>
                <SortableHeader field="retail_price">{t('serviceCatalog.table.salePrice')}</SortableHeader>
                <SortableHeader field="company_name">{t('serviceCatalog.table.company')}</SortableHeader>
                <SortableHeader field="supplier_name">{t('serviceCatalog.table.supplier')}</SortableHeader>
                <SortableHeader field="is_active">{t('serviceCatalog.table.status')}</SortableHeader>
                <TableHead className="text-right">{t('serviceCatalog.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    {t('serviceCatalog.loading')}
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedServices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    {t('serviceCatalog.noServicesFound')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.sku}</TableCell>
                    <TableCell>{service.name}</TableCell>
                    <TableCell>{service.category_name || "-"}</TableCell>
                    <TableCell>
                      {service.retail_price 
                        ? `${service.currency} ${service.retail_price.toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell>{service.company_name || "-"}</TableCell>
                    <TableCell>{service.supplier_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={service.is_active ? "default" : "destructive"}>
                        {service.is_active ? t('serviceCatalog.active') : t('serviceCatalog.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PermissionGate permission="service_catalog.delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteItemId(service.id)}
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

        <AlertDialog open={!!deleteItemId} onOpenChange={(open) => !open && setDeleteItemId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('serviceCatalog.deleteDialog.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('serviceCatalog.deleteDialog.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('serviceCatalog.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>{t('serviceCatalog.delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
