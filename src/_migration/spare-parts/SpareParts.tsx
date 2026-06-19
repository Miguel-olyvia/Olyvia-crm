import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Package2 } from "lucide-react";
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
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";

interface SparePart {
  id: string;
  part_number: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_of_measure: string;
  is_active: boolean;
  stock_levels?: Array<{
    quantity_available: number;
    locations?: { name: string };
  }>;
}

export default function SpareParts() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    part_number: "",
    name: "",
    description: "",
    category: "",
    manufacturer: "",
    model_number: "",
    unit_cost: "",
    unit_of_measure: "unit",
    minimum_stock_level: "",
    reorder_point: "",
  });

  const getUomLabel = (uom: string) => {
    const uomMap: Record<string, string> = {
      'unit': t('spareParts.uom.unit'),
      'piece': t('spareParts.uom.piece'),
      'box': t('spareParts.uom.box'),
      'pack': t('spareParts.uom.pack'),
      'meter': t('spareParts.uom.meter'),
      'liter': t('spareParts.uom.liter'),
      'kg': t('spareParts.uom.kg'),
    };
    return uomMap[uom] || uom;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from("spare_parts")
        .select(`
          *,
          stock_levels(
            quantity_available,
            locations(name)
          )
        `)
        .order("name");

      if (error) throw error;
      setSpareParts(data || []);
    } catch (error: any) {
      toast({
        title: t('spareParts.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const sparePartData: any = {
        part_number: formData.part_number,
        name: formData.name,
        category: formData.category,
        unit_cost: parseFloat(formData.unit_cost),
        unit_of_measure: formData.unit_of_measure,
        is_active: true,
        created_by: user.id,
      };

      if (formData.description) sparePartData.description = formData.description;
      if (formData.manufacturer) sparePartData.manufacturer = formData.manufacturer;
      if (formData.model_number) sparePartData.model_number = formData.model_number;
      if (formData.minimum_stock_level) sparePartData.minimum_stock_level = parseInt(formData.minimum_stock_level);
      if (formData.reorder_point) sparePartData.reorder_point = parseInt(formData.reorder_point);

      const { error } = await supabase.from("spare_parts").insert(sparePartData);

      if (error) throw error;

      toast({
        title: t('spareParts.toast.createSuccess'),
      });

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('spareParts.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCloseDialog = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setFormData({
        part_number: "",
        name: "",
        description: "",
        category: "",
        manufacturer: "",
        model_number: "",
        unit_cost: "",
        unit_of_measure: "unit",
        minimum_stock_level: "",
        reorder_point: "",
      });
    }
  };

  const handleCancel = () => {
    handleCloseDialog(false);
  };

  const getTotalStock = (part: SparePart) => {
    if (!part.stock_levels || part.stock_levels.length === 0) return 0;
    return part.stock_levels.reduce((sum, level) => sum + (level.quantity_available || 0), 0);
  };

  const filteredParts = spareParts.filter((part) =>
    part.part_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Package2 className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('spareParts.title')}</h1>
          </div>
          <PermissionGate permission="spare_parts.create">
            <Dialog open={open} onOpenChange={handleCloseDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('spareParts.addSparePart')}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('spareParts.newSparePart')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="part_number">{t('spareParts.form.partNumber')} *</Label>
                    <Input
                      id="part_number"
                      value={formData.part_number}
                      onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">{t('spareParts.form.name')} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('spareParts.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">{t('spareParts.form.category')} *</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">{t('spareParts.form.manufacturer')}</Label>
                    <Input
                      id="manufacturer"
                      value={formData.manufacturer}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model_number">{t('spareParts.form.modelNumber')}</Label>
                    <Input
                      id="model_number"
                      value={formData.model_number}
                      onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="unit_cost">{t('spareParts.form.unitCost')} *</Label>
                    <Input
                      id="unit_cost"
                      type="number"
                      step="0.01"
                      value={formData.unit_cost}
                      onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unit_of_measure">{t('spareParts.form.unitOfMeasure')}</Label>
                    <Select
                      value={formData.unit_of_measure}
                      onValueChange={(value) => setFormData({ ...formData, unit_of_measure: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unit">{t('spareParts.uom.unit')}</SelectItem>
                        <SelectItem value="piece">{t('spareParts.uom.piece')}</SelectItem>
                        <SelectItem value="box">{t('spareParts.uom.box')}</SelectItem>
                        <SelectItem value="pack">{t('spareParts.uom.pack')}</SelectItem>
                        <SelectItem value="meter">{t('spareParts.uom.meter')}</SelectItem>
                        <SelectItem value="liter">{t('spareParts.uom.liter')}</SelectItem>
                        <SelectItem value="kg">{t('spareParts.uom.kg')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minimum_stock_level">{t('spareParts.form.minimumStockLevel')}</Label>
                    <Input
                      id="minimum_stock_level"
                      type="number"
                      value={formData.minimum_stock_level}
                      onChange={(e) => setFormData({ ...formData, minimum_stock_level: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reorder_point">{t('spareParts.form.reorderPoint')}</Label>
                    <Input
                      id="reorder_point"
                      type="number"
                      value={formData.reorder_point}
                      onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('spareParts.form.cancel')}
                  </Button>
                  <Button type="submit">{t('spareParts.form.create')}</Button>
                </div>
              </form>
              </DialogContent>
            </Dialog>
          </PermissionGate>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('spareParts.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('spareParts.table.partNumber')}</TableHead>
                  <TableHead>{t('spareParts.table.name')}</TableHead>
                  <TableHead>{t('spareParts.table.category')}</TableHead>
                  <TableHead>{t('spareParts.table.unitCost')}</TableHead>
                  <TableHead>{t('spareParts.table.uom')}</TableHead>
                  <TableHead>{t('spareParts.table.stock')}</TableHead>
                  <TableHead>{t('spareParts.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('spareParts.noSpareParts')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParts.map((part) => {
                    const totalStock = getTotalStock(part);
                    return (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">{part.part_number}</TableCell>
                        <TableCell>{part.name}</TableCell>
                        <TableCell>{part.category || "-"}</TableCell>
                        <TableCell>
                          {part.unit_cost ? `€${part.unit_cost.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell>{getUomLabel(part.unit_of_measure)}</TableCell>
                        <TableCell>
                          <Badge variant={totalStock > 0 ? "default" : "destructive"}>
                            {totalStock} {getUomLabel(part.unit_of_measure)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={part.is_active ? "default" : "secondary"}>
                            {part.is_active ? t('spareParts.status.active') : t('spareParts.status.inactive')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
