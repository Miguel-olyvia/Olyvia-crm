import { useState, useEffect, useMemo, Fragment } from "react";
import { z } from "zod";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, Pencil, Trash2, Package, Download, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { downloadStandardXlsx } from "@/lib/exports/xlsxExport";

type Stock = Database["public"]["Tables"]["stocks"]["Row"] & {
  products?: { name: string; category_id?: string | null; product_categories?: { name: string } | null };
  warehouses?: { name: string };
};

const UNCATEGORIZED_LABEL = "Sem categoria";

function getStockStatusCode(stock: Stock): "low" | "overstock" | "normal" {
  if (stock.quantity <= stock.reorder_point) return "low";
  if (stock.quantity >= stock.maximum_quantity) return "overstock";
  return "normal";
}

const stockSchema = z.object({
  product_id: z.string().trim().min(1, "O produto é obrigatório."),
  warehouse_id: z.string().trim().min(1, "O armazém é obrigatório."),
  quantity: z.number().min(0, "A quantidade deve ser positiva.").max(999999999, "A quantidade é demasiado elevada."),
  minimum_quantity: z.number().min(0, "A quantidade mínima deve ser positiva.").max(999999999, "A quantidade mínima é demasiado elevada."),
  maximum_quantity: z.number().min(0, "A quantidade máxima deve ser positiva.").max(999999999, "A quantidade máxima é demasiado elevada."),
  reorder_point: z.number().min(0, "O ponto de reencomenda deve ser positivo.").max(999999999, "O ponto de reencomenda é demasiado elevado."),
  location: z.string().trim().max(255, "A localização deve ter menos de 255 caracteres.").optional().or(z.literal("")),
}).refine((data) => data.maximum_quantity === 0 || data.maximum_quantity >= data.minimum_quantity, {
  message: "A quantidade máxima deve ser maior ou igual à quantidade mínima.",
  path: ["maximum_quantity"],
});

const Stocks = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [formData, setFormData] = useState({
    product_id: "",
    warehouse_id: "",
    quantity: 0,
    minimum_quantity: 0,
    maximum_quantity: 0,
    reorder_point: 0,
    location: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "normal" | "overstock">("all");

  // Categories actually present in the currently loaded stocks — derived from the
  // data itself so the dropdown never lists a category with zero stock rows.
  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    for (const stock of stocks) {
      names.add(stock.products?.product_categories?.name || UNCATEGORIZED_LABEL);
    }
    return Array.from(names).sort((a, b) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    });
  }, [stocks]);

  // Client-side filter over the already-loaded stocks (no extra query — this page
  // loads the whole org's stocks upfront, same as before this change).
  const filteredStocks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return stocks.filter((stock) => {
      if (term && !(stock.products?.name || "").toLowerCase().includes(term)) return false;
      if (categoryFilter !== "all") {
        const categoryName = stock.products?.product_categories?.name || UNCATEGORIZED_LABEL;
        if (categoryName !== categoryFilter) return false;
      }
      if (warehouseFilter !== "all" && stock.warehouse_id !== warehouseFilter) return false;
      if (statusFilter !== "all" && getStockStatusCode(stock) !== statusFilter) return false;
      return true;
    });
  }, [stocks, searchTerm, categoryFilter, warehouseFilter, statusFilter]);

  // Group stocks by the product's category, sorted alphabetically (uncategorized
  // last); products within a category sorted alphabetically too. Purely a render
  // grouping — doesn't change what fetchStocks loads or how edit/delete work.
  const groupedStocks = useMemo(() => {
    const groups = new Map<string, Stock[]>();
    for (const stock of filteredStocks) {
      const categoryName = stock.products?.product_categories?.name || UNCATEGORIZED_LABEL;
      const list = groups.get(categoryName) || [];
      list.push(stock);
      groups.set(categoryName, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.products?.name || "").localeCompare(b.products?.name || ""));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b);
    });
  }, [filteredStocks]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchStocks();
      fetchProducts();
      fetchWarehouses();
    }
  }, [activeCompany?.id, showDeleted]);

  const fetchStocks = async () => {
    if (!activeCompany?.id) return;

    try {
      let query = supabase
        .from("stocks")
        .select(`
          *,
          products(name, category_id, product_categories!category_id(name)),
          warehouses(name)
        `)
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false });

      // Soft-deleted stocks are hidden from the normal list by default.
      query = showDeleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

      const { data, error } = await query;

      if (error) throw error;
      setStocks(data as Stock[] || []);
    } catch (error: any) {
      toast({
        title: t('stocks.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    if (!activeCompany?.id) return;
    
    try {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .order("name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: t('stocks.toast.loadProductsError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchWarehouses = async () => {
    if (!activeCompany?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null)
        .order("name");

      if (error) throw error;
      setWarehouses(data || []);
    } catch (error: any) {
      toast({
        title: t('stocks.toast.loadWarehousesError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = stockSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) errors[error.path[0].toString()] = error.message;
      });
      setFieldErrors(errors);
      const firstError = validation.error.errors[0];
      toast({ title: t('stocks.toast.error'), description: firstError.message, variant: "destructive" });
      return;
    }
    setFieldErrors({});

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      if (editingStock) {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("stocks")
            .update({
              ...formData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingStock.id);

          if (error) throw error;
        });

        toast({
          title: t('stocks.toast.updateSuccess'),
          description: t('stocks.toast.updateSuccessDesc'),
        });
      } else {
        if (!activeCompany?.id) throw new Error("No active company selected");

        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase.from("stocks").insert([
            {
              ...formData,
              organization_id: activeCompany.id,
              created_by: businessUserId,
            },
          ]);

          if (error) throw error;
        });

        toast({
          title: t('stocks.toast.createSuccess'),
          description: t('stocks.toast.createSuccessDesc'),
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchStocks();
    } catch (error: any) {
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('stocks.delete.confirm'))) return;

    try {
      const { error } = await supabase.rpc("rpc_delete_stock", { p_id: id });
      if (error) throw error;

      toast({
        title: t('stocks.toast.deleteSuccess'),
        description: t('stocks.toast.deleteSuccessDesc'),
      });

      fetchStocks();
    } catch (error: any) {
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      const { error } = await supabase.rpc("rpc_restore_stock", { p_id: id });
      if (error) throw error;

      toast({ title: t('stocks.toast.restoreSuccess') || "Stock restaurado" });

      fetchStocks();
    } catch (error: any) {
      toast({
        title: t('stocks.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: "",
      warehouse_id: "",
      quantity: 0,
      minimum_quantity: 0,
      maximum_quantity: 0,
      reorder_point: 0,
      location: "",
    });
    setEditingStock(null);
    setFieldErrors({});
  };

  const openEditDialog = (stock: Stock) => {
    setEditingStock(stock);
    setFormData({
      product_id: stock.product_id,
      warehouse_id: stock.warehouse_id,
      quantity: stock.quantity,
      minimum_quantity: stock.minimum_quantity,
      maximum_quantity: stock.maximum_quantity,
      reorder_point: stock.reorder_point,
      location: stock.location || "",
    });
    setDialogOpen(true);
  };

  const getStockStatus = (stock: Stock) => {
    const code = getStockStatusCode(stock);
    if (code === "low") return <Badge variant="destructive">{t('stocks.status.lowStock')}</Badge>;
    if (code === "overstock") return <Badge variant="outline">{t('stocks.status.overstock')}</Badge>;
    return <Badge variant="default">{t('stocks.status.normal')}</Badge>;
  };

  const handleExport = () => {
    downloadStandardXlsx({
      sheetName: "Stocks",
      columns: [
        { key: "category", header: "Categoria", width: 22 },
        { key: "product", header: t('stocks.table.product'), width: 30 },
        { key: "warehouse", header: t('stocks.table.warehouse'), width: 26 },
        { key: "quantity", header: t('stocks.table.quantity'), type: "number", width: 14 },
        { key: "minimum", header: t('stocks.form.minimumQuantity'), type: "number", width: 14 },
        { key: "maximum", header: t('stocks.form.maximumQuantity'), type: "number", width: 14 },
        { key: "reorderPoint", header: t('stocks.form.reorderPoint'), type: "number", width: 16 },
        { key: "location", header: t('stocks.table.location'), width: 24 },
      ],
      rows: stocks.map((stock) => ({
        category: stock.products?.product_categories?.name || UNCATEGORIZED_LABEL,
        product: stock.products?.name,
        warehouse: stock.warehouses?.name,
        quantity: stock.quantity,
        minimum: stock.minimum_quantity,
        maximum: stock.maximum_quantity,
        reorderPoint: stock.reorder_point,
        location: stock.location,
      })),
    }, `stocks_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    toast({
      title: t('stocks.toast.exportSuccess'),
      description: t('stocks.toast.exportSuccessDesc'),
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error(t('stocks.toast.emptyFile'));
      }

      // Pre-check existing (product_id, warehouse_id) pairs already tracked for this
      // org, so a collision can be skipped/reported per-row instead of failing the
      // whole batch atomically.
      const { data: existingStockPairs, error: existingStockPairsError } = await supabase
        .from("stocks")
        .select("product_id, warehouse_id")
        .eq("organization_id", activeCompany.id)
        .is("deleted_at", null);

      if (existingStockPairsError) throw existingStockPairsError;

      const pairKey = (productId: string, warehouseId: string) => `${productId}::${warehouseId}`;
      const existingPairSet = new Set(
        (existingStockPairs || []).map((s: any) => pairKey(s.product_id, s.warehouse_id))
      );
      const seenInFile = new Set<string>();

      const dataLines = lines.slice(1);
      const stocksToInsert = [];
      const rowErrors: string[] = [];

      // Convert a raw CSV cell to a number, WITHOUT silently coercing malformed
      // values to 0. Empty cells default to 0 (matches "not provided"); anything
      // else that fails to parse is surfaced as NaN so stockSchema rejects it.
      const toNumberOrNaN = (v: string | undefined): number => {
        const trimmed = (v ?? '').trim();
        if (trimmed === '') return 0;
        return Number(trimmed);
      };

      dataLines.forEach((line, index) => {
        const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

        if (values.length < 3) return;

        const lineNumber = index + 2; // +2 for header row and 0-index

        const product = products.find(p => p.name === values[0]);
        const warehouse = warehouses.find(w => w.name === values[1]);

        if (!product || !warehouse) {
          rowErrors.push(`Linha ${lineNumber}: produto ou armazém não encontrado ("${values[0]}" / "${values[1]}")`);
          return;
        }

        const candidate = {
          product_id: product.id,
          warehouse_id: warehouse.id,
          quantity: toNumberOrNaN(values[2]),
          minimum_quantity: toNumberOrNaN(values[3]),
          maximum_quantity: toNumberOrNaN(values[4]),
          reorder_point: toNumberOrNaN(values[5]),
          location: values[6] || "",
        };

        const validation = stockSchema.safeParse(candidate);
        if (!validation.success) {
          const firstError = validation.error.errors[0];
          rowErrors.push(`Linha ${lineNumber} (${values[0]}): ${firstError.message}`);
          return;
        }

        const key = pairKey(product.id, warehouse.id);
        if (existingPairSet.has(key) || seenInFile.has(key)) {
          rowErrors.push(`Linha ${lineNumber}: já existe stock para "${values[0]}" no armazém "${values[1]}"`);
          return;
        }
        seenInFile.add(key);

        const validated = validation.data;
        stocksToInsert.push({
          product_id: validated.product_id,
          warehouse_id: validated.warehouse_id,
          quantity: validated.quantity,
          minimum_quantity: validated.minimum_quantity,
          maximum_quantity: validated.maximum_quantity,
          reorder_point: validated.reorder_point,
          location: validated.location || null,
          organization_id: activeCompany.id,
          created_by: businessUserId,
        });
      });

      if (stocksToInsert.length === 0) {
        throw new Error(
          rowErrors.length > 0
            ? `${t('stocks.toast.noValidStocks')} ${rowErrors.slice(0, 5).join(" | ")}`
            : t('stocks.toast.noValidStocks')
        );
      }

      await withAuditContext(
        supabase,
        businessUserId,
        async () => {
          const { error } = await supabase.from("stocks").insert(stocksToInsert);
          if (error) throw error;
        },
        "csv_import"
      );

      const skippedSuffix = rowErrors.length > 0
        ? ` ${rowErrors.length} linha(s) inválida(s) foram ignoradas: ${rowErrors.slice(0, 5).join(" | ")}${rowErrors.length > 5 ? ` (+${rowErrors.length - 5} mais)` : ""}`
        : "";

      toast({
        title: t('stocks.toast.importSuccess'),
        description: `${t('stocks.toast.importSuccessDesc', { count: stocksToInsert.length })}${skippedSuffix}`,
      });

      setImportDialogOpen(false);
      fetchStocks();
    } catch (error: any) {
      toast({
        title: t('stocks.toast.importError'),
        description: error.message,
        variant: "destructive",
      });
    }
    
    e.target.value = '';
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-3xl font-bold">{t('stocks.title')}</h1><p className="text-muted-foreground">{t('stocks.description')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('stocks.title')}</h1>
            <p className="text-muted-foreground">
              {t('stocks.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={showDeleted ? "default" : "outline"}
              onClick={() => setShowDeleted((prev) => !prev)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {showDeleted ? (t('stocks.hideDeleted') || 'Ocultar eliminados') : (t('stocks.showDeleted') || 'Ver eliminados')}
            </Button>
            <PermissionGate permission="stocks.export">
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> {t('stocks.export')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="stocks.import">
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> {t('stocks.import')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('stocks.import.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('stocks.import.description')}
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
            <PermissionGate permission="stocks.create">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('stocks.addStock')}
                  </Button>
                </DialogTrigger>
              </Dialog>
            </PermissionGate>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingStock ? t('stocks.editStock') : t('stocks.addStock')}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="product_id">{t('stocks.form.product')}</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, product_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('stocks.form.selectProduct')} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.product_id && <p className="text-sm text-destructive mt-1">{fieldErrors.product_id}</p>}
                </div>
                <div>
                  <Label htmlFor="warehouse_id">{t('stocks.form.warehouse')}</Label>
                  <Select
                    value={formData.warehouse_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, warehouse_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('stocks.form.selectWarehouse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.warehouse_id && <p className="text-sm text-destructive mt-1">{fieldErrors.warehouse_id}</p>}
                </div>
                <div>
                  <Label htmlFor="quantity">{t('stocks.form.quantity')}</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: parseInt(e.target.value) || 0,
                      })
                    }
                    required
                    className={fieldErrors.quantity ? "border-destructive" : ""}
                  />
                  {fieldErrors.quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="minimum_quantity">{t('stocks.form.minimumQuantity')}</Label>
                  <Input
                    id="minimum_quantity"
                    type="number"
                    value={formData.minimum_quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minimum_quantity: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.minimum_quantity ? "border-destructive" : ""}
                  />
                  {fieldErrors.minimum_quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.minimum_quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="maximum_quantity">{t('stocks.form.maximumQuantity')}</Label>
                  <Input
                    id="maximum_quantity"
                    type="number"
                    value={formData.maximum_quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maximum_quantity: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.maximum_quantity ? "border-destructive" : ""}
                  />
                  {fieldErrors.maximum_quantity && <p className="text-sm text-destructive mt-1">{fieldErrors.maximum_quantity}</p>}
                </div>
                <div>
                  <Label htmlFor="reorder_point">{t('stocks.form.reorderPoint')}</Label>
                  <Input
                    id="reorder_point"
                    type="number"
                    value={formData.reorder_point}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reorder_point: parseInt(e.target.value) || 0,
                      })
                    }
                    className={fieldErrors.reorder_point ? "border-destructive" : ""}
                  />
                  {fieldErrors.reorder_point && <p className="text-sm text-destructive mt-1">{fieldErrors.reorder_point}</p>}
                </div>
                <div>
                  <Label htmlFor="location">{t('stocks.form.location')}</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    placeholder={t('stocks.form.locationPlaceholder')}
                    className={fieldErrors.location ? "border-destructive" : ""}
                  />
                  {fieldErrors.location && <p className="text-sm text-destructive mt-1">{fieldErrors.location}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {t('stocks.form.cancel')}
                  </Button>
                  <Button type="submit">
                    {editingStock ? t('stocks.form.update') : t('stocks.form.create')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Pesquisar por produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {availableCategories.map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('stocks.table.warehouse')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os armazéns</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('stocks.table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="low">{t('stocks.status.lowStock')}</SelectItem>
              <SelectItem value="normal">{t('stocks.status.normal')}</SelectItem>
              <SelectItem value="overstock">{t('stocks.status.overstock')}</SelectItem>
            </SelectContent>
          </Select>
          {(searchTerm || categoryFilter !== "all" || warehouseFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("all");
                setWarehouseFilter("all");
                setStatusFilter("all");
              }}
            >
              Limpar filtros
            </Button>
          )}
          <span className="text-sm text-muted-foreground ml-auto">
            {filteredStocks.length} de {stocks.length}
          </span>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('stocks.table.product')}</TableHead>
                <TableHead>{t('stocks.table.warehouse')}</TableHead>
                <TableHead>{t('stocks.table.location')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.quantity')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.min')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.max')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.reorder')}</TableHead>
                <TableHead>{t('stocks.table.status')}</TableHead>
                <TableHead className="text-right">{t('stocks.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    {t('stocks.loading')}
                  </TableCell>
                </TableRow>
              ) : stocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    {t('stocks.noStocks')}
                  </TableCell>
                </TableRow>
              ) : filteredStocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhum stock corresponde aos filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                groupedStocks.map(([categoryName, categoryStocks]) => (
                  <Fragment key={categoryName}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={9} className="font-semibold text-sm">
                        {categoryName} <span className="font-normal text-muted-foreground">({categoryStocks.length})</span>
                      </TableCell>
                    </TableRow>
                    {categoryStocks.map((stock) => (
                      <TableRow key={stock.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 pl-4">
                            <Package className="w-4 h-4 text-muted-foreground" />
                            {stock.products?.name}
                          </div>
                        </TableCell>
                        <TableCell>{stock.warehouses?.name}</TableCell>
                        <TableCell>{stock.location || "-"}</TableCell>
                        <TableCell className="text-right">
                          {stock.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.minimum_quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.maximum_quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.reorder_point}
                        </TableCell>
                        <TableCell>{getStockStatus(stock)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {showDeleted ? (
                              <PermissionGate permission="stocks.delete">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestore(stock.id)}
                                >
                                  {t('stocks.restore') || 'Restaurar'}
                                </Button>
                              </PermissionGate>
                            ) : (
                              <>
                                <PermissionGate permission="stocks.edit">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(stock)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </PermissionGate>
                                <PermissionGate permission="stocks.delete">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(stock.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </PermissionGate>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
};

export default Stocks;
