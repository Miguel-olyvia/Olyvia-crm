import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Plus, Pencil, Trash2, Package, Download, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

type Stock = Database["public"]["Tables"]["stocks"]["Row"] & {
  products?: { name: string };
  warehouses?: { name: string };
};

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

  useEffect(() => {
    if (activeCompany?.id) {
      fetchStocks();
      fetchProducts();
      fetchWarehouses();
    }
  }, [activeCompany?.id]);

  const fetchStocks = async () => {
    if (!activeCompany?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("stocks")
        .select(`
          *,
          products(name),
          warehouses(name)
        `)
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false });

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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      if (editingStock) {
        const { error } = await supabase
          .from("stocks")
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingStock.id);

        if (error) throw error;

        toast({
          title: t('stocks.toast.updateSuccess'),
          description: t('stocks.toast.updateSuccessDesc'),
        });
      } else {
        if (!activeCompany?.id) throw new Error("No active company selected");
        
        const { error } = await supabase.from("stocks").insert([
          {
            ...formData,
            organization_id: activeCompany.id,
            created_by: businessUserId,
          },
        ]);

        if (error) throw error;

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
      const { error } = await supabase.from("stocks").delete().eq("id", id);

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
    if (stock.quantity <= stock.reorder_point) {
      return <Badge variant="destructive">{t('stocks.status.lowStock')}</Badge>;
    } else if (stock.quantity >= stock.maximum_quantity) {
      return <Badge variant="outline">{t('stocks.status.overstock')}</Badge>;
    } else {
      return <Badge variant="default">{t('stocks.status.normal')}</Badge>;
    }
  };

  const handleExport = () => {
    const BOM = '\uFEFF';
    const headers = [
      t('stocks.table.product'), 
      t('stocks.table.warehouse'), 
      t('stocks.table.quantity'), 
      t('stocks.form.minimumQuantity'), 
      t('stocks.form.maximumQuantity'), 
      t('stocks.form.reorderPoint'), 
      t('stocks.table.location')
    ];
    const csvContent = headers.map(h => `"${h}"`).join(';') + '\r\n' +
      stocks.map(stock => {
        const row = [
          stock.products?.name || '',
          stock.warehouses?.name || '',
          stock.quantity || 0,
          stock.minimum_quantity || 0,
          stock.maximum_quantity || 0,
          stock.reorder_point || 0,
          stock.location || ''
        ];
        return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';');
      }).join('\r\n');

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stocks_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
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

      const dataLines = lines.slice(1);
      const stocksToInsert = [];

      for (const line of dataLines) {
        const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        
        if (values.length < 3) continue;

        const product = products.find(p => p.name === values[0]);
        const warehouse = warehouses.find(w => w.name === values[1]);

        if (!product || !warehouse) continue;

        stocksToInsert.push({
          product_id: product.id,
          warehouse_id: warehouse.id,
          quantity: parseInt(values[2]) || 0,
          minimum_quantity: parseInt(values[3]) || 0,
          maximum_quantity: parseInt(values[4]) || 0,
          reorder_point: parseInt(values[5]) || 0,
          location: values[6] || null,
          organization_id: activeCompany.id,
          created_by: businessUserId,
        });
      }

      if (stocksToInsert.length === 0) {
        throw new Error(t('stocks.toast.noValidStocks'));
      }

      const { error } = await supabase.from("stocks").insert(stocksToInsert);
      
      if (error) throw error;

      toast({
        title: t('stocks.toast.importSuccess'),
        description: t('stocks.toast.importSuccessDesc', { count: stocksToInsert.length }),
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
                  />
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
                  />
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
                  />
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
                  />
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
                  />
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
              ) : (
                stocks.map((stock) => (
                  <TableRow key={stock.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
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
                      </div>
                    </TableCell>
                  </TableRow>
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