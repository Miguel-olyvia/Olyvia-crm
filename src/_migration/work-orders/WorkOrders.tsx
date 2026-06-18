import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Wrench, Pencil, Trash2 } from "lucide-react";
import { PageFAQSheet } from "@/components/PageFAQSheet";
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
import { format } from "date-fns";
import { PermissionGate } from "@/components/PermissionGate";
import {
  Dialog,
  DialogContent,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  work_order_type: string;
  priority: string;
  status: string;
  scheduled_start: string;
  assets?: { asset_code: string; name: string };
}

export default function WorkOrders() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workOrderToDelete, setWorkOrderToDelete] = useState<string | null>(null);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    work_order_number: "",
    title: "",
    description: "",
    work_order_type: "corrective",
    priority: "medium",
    asset_id: "",
    scheduled_start: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [workOrdersRes, assetsRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            *,
            assets(asset_code, name)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("assets").select("id, asset_code, name"),
      ]);

      if (workOrdersRes.error) throw workOrdersRes.error;
      if (assetsRes.error) throw assetsRes.error;

      setWorkOrders(workOrdersRes.data || []);
      setAssets(assetsRes.data || []);
    } catch (error: any) {
      toast({
        title: t('workOrders.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateWorkOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `WO-${year}${month}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const woNumber = formData.work_order_number || generateWorkOrderNumber();

      const workOrderData: any = {
        title: formData.title,
        work_order_type: formData.work_order_type,
        priority: formData.priority,
      };

      if (formData.description) workOrderData.description = formData.description;
      if (formData.asset_id) workOrderData.asset_id = formData.asset_id;
      if (formData.scheduled_start) workOrderData.scheduled_start = formData.scheduled_start;

      if (editingWorkOrder) {
        // Update existing work order
        const { error } = await supabase
          .from("work_orders")
          .update(workOrderData)
          .eq("id", editingWorkOrder.id);

        if (error) throw error;

        toast({
          title: t('workOrders.toast.updateSuccess'),
        });
      } else {
        // Create new work order
        workOrderData.work_order_number = woNumber;
        workOrderData.status = "draft";
        workOrderData.created_by = user.id;

        const { error } = await supabase.from("work_orders").insert(workOrderData);

        if (error) throw error;

        toast({
          title: t('workOrders.toast.createSuccess'),
        });
      }

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: editingWorkOrder ? t('workOrders.toast.updateError') : t('workOrders.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!workOrderToDelete) return;

    try {
      const { error } = await supabase
        .from("work_orders")
        .delete()
        .eq("id", workOrderToDelete);

      if (error) throw error;

      toast({
        title: t('workOrders.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('workOrders.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setWorkOrderToDelete(null);
    }
  };

  const openEditDialog = (workOrder: WorkOrder) => {
    setEditingWorkOrder(workOrder);
    setFormData({
      work_order_number: workOrder.work_order_number,
      title: workOrder.title,
      description: "",
      work_order_type: workOrder.work_order_type,
      priority: workOrder.priority,
      asset_id: "",
      scheduled_start: workOrder.scheduled_start ? workOrder.scheduled_start.substring(0, 16) : "",
    });
    setOpen(true);
  };

  const resetForm = () => {
    setEditingWorkOrder(null);
    setFormData({
      work_order_number: "",
      title: "",
      description: "",
      work_order_type: "corrective",
      priority: "medium",
      asset_id: "",
      scheduled_start: "",
    });
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: t('workOrders.status.draft'),
      open: t('workOrders.status.open'),
      assigned: t('workOrders.status.assigned'),
      in_progress: t('workOrders.status.in_progress'),
      on_hold: t('workOrders.status.on_hold'),
      completed: t('workOrders.status.completed'),
      closed: t('workOrders.status.closed'),
      cancelled: t('workOrders.status.cancelled'),
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500",
      open: "bg-blue-500",
      assigned: "bg-cyan-500",
      in_progress: "bg-yellow-500",
      on_hold: "bg-orange-500",
      completed: "bg-green-500",
      closed: "bg-gray-700",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      low: t('workOrders.priority.low'),
      medium: t('workOrders.priority.medium'),
      high: t('workOrders.priority.high'),
      critical: t('workOrders.priority.critical'),
      emergency: t('workOrders.priority.emergency'),
    };
    return labels[priority] || priority;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-blue-500",
      medium: "bg-yellow-500",
      high: "bg-orange-500",
      critical: "bg-red-500",
      emergency: "bg-red-700",
    };
    return colors[priority] || "bg-gray-500";
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      preventive: t('workOrders.type.preventive'),
      corrective: t('workOrders.type.corrective'),
      predictive: t('workOrders.type.predictive'),
      inspection: t('workOrders.type.inspection'),
      emergency: t('workOrders.type.emergency'),
    };
    return labels[type] || type;
  };

  const filteredWorkOrders = workOrders.filter((wo) =>
    wo.work_order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wo.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Wrench className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('workOrders.title')}</h1>
              <p className="text-muted-foreground">{t('workOrders.description')}</p>
            </div>
            <PageFAQSheet pageKey="operations.workOrders" />
          </div>
          <PermissionGate permission="work_orders.create">
            <Dialog open={open} onOpenChange={handleCloseDialog}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('workOrders.newWorkOrder')}
                </Button>
              </DialogTrigger>
            </Dialog>
          </PermissionGate>
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingWorkOrder ? t('workOrders.editWorkOrder') : t('workOrders.newWorkOrder')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="work_order_number">{t('workOrders.form.woNumber')}</Label>
                    <Input
                      id="work_order_number"
                      value={formData.work_order_number}
                      onChange={(e) => setFormData({ ...formData, work_order_number: e.target.value })}
                      placeholder={t('workOrders.form.woNumberPlaceholder')}
                      disabled={!!editingWorkOrder}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('workOrders.form.woNumberHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scheduled_start">{t('workOrders.form.scheduledStart')}</Label>
                    <Input
                      id="scheduled_start"
                      type="datetime-local"
                      value={formData.scheduled_start}
                      onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">{t('workOrders.form.title')} *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('workOrders.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="work_order_type">{t('workOrders.form.type')}</Label>
                    <Select
                      value={formData.work_order_type}
                      onValueChange={(value) => setFormData({ ...formData, work_order_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventive">{t('workOrders.type.preventive')}</SelectItem>
                        <SelectItem value="corrective">{t('workOrders.type.corrective')}</SelectItem>
                        <SelectItem value="predictive">{t('workOrders.type.predictive')}</SelectItem>
                        <SelectItem value="inspection">{t('workOrders.type.inspection')}</SelectItem>
                        <SelectItem value="emergency">{t('workOrders.type.emergency')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">{t('workOrders.form.priority')}</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t('workOrders.priority.low')}</SelectItem>
                        <SelectItem value="medium">{t('workOrders.priority.medium')}</SelectItem>
                        <SelectItem value="high">{t('workOrders.priority.high')}</SelectItem>
                        <SelectItem value="critical">{t('workOrders.priority.critical')}</SelectItem>
                        <SelectItem value="emergency">{t('workOrders.priority.emergency')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="asset_id">{t('workOrders.form.asset')}</Label>
                    <Select
                      value={formData.asset_id}
                      onValueChange={(value) => setFormData({ ...formData, asset_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('workOrders.form.selectAsset')} />
                      </SelectTrigger>
                      <SelectContent>
                        {assets.map((asset) => (
                          <SelectItem key={asset.id} value={asset.id}>
                            {asset.asset_code} - {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('workOrders.form.cancel')}
                  </Button>
                  <Button type="submit">{editingWorkOrder ? t('workOrders.form.update') : t('workOrders.form.create')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('workOrders.search')}
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
                  <TableHead>{t('workOrders.table.woNumber')}</TableHead>
                  <TableHead>{t('workOrders.table.title')}</TableHead>
                  <TableHead>{t('workOrders.table.asset')}</TableHead>
                  <TableHead>{t('workOrders.table.type')}</TableHead>
                  <TableHead>{t('workOrders.table.priority')}</TableHead>
                  <TableHead>{t('workOrders.table.status')}</TableHead>
                  <TableHead>{t('workOrders.table.scheduled')}</TableHead>
                  <TableHead className="text-right">{t('workOrders.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t('workOrders.noWorkOrders')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWorkOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-medium">{wo.work_order_number}</TableCell>
                      <TableCell>{wo.title}</TableCell>
                      <TableCell>
                        {wo.assets ? `${wo.assets.asset_code} - ${wo.assets.name}` : "-"}
                      </TableCell>
                      <TableCell>{getTypeLabel(wo.work_order_type)}</TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(wo.priority)}>
                          {getPriorityLabel(wo.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(wo.status)}>
                          {getStatusLabel(wo.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wo.scheduled_start ? format(new Date(wo.scheduled_start), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="work_orders.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(wo)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="work_orders.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setWorkOrderToDelete(wo.id);
                                setDeleteDialogOpen(true);
                              }}
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
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('workOrders.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('workOrders.delete.confirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setWorkOrderToDelete(null)}>
                {t('workOrders.delete.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('workOrders.delete.action')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
