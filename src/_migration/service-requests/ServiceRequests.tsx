import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, ClipboardList, Pencil, Trash2 } from "lucide-react";
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

interface ServiceRequest {
  id: string;
  request_number: string;
  title: string;
  request_type: string;
  priority: string;
  status: string;
  requested_date: string;
  assets?: { asset_code: string; name: string };
  locations?: { name: string };
}

export default function ServiceRequests() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    request_number: "",
    title: "",
    description: "",
    request_type: "maintenance",
    priority: "medium",
    asset_id: "",
    location_id: "",
    requested_date: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [requestsRes, assetsRes, locationsRes] = await Promise.all([
        supabase
          .from("service_requests")
          .select(`
            *,
            assets(asset_code, name),
            locations(name)
          `)
          .order("requested_date", { ascending: false }),
        supabase.from("assets").select("id, asset_code, name"),
        supabase.from("locations").select("id, name"),
      ]);

      if (requestsRes.error) throw requestsRes.error;
      if (assetsRes.error) throw assetsRes.error;
      if (locationsRes.error) throw locationsRes.error;

      setRequests(requestsRes.data || []);
      setAssets(assetsRes.data || []);
      setLocations(locationsRes.data || []);
    } catch (error: any) {
      toast({
        title: t('serviceRequests.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateRequestNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SR-${year}${month}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      if (editingRequest) {
        // Update existing request
        const updateData: any = {
          title: formData.title,
          request_type: formData.request_type,
          priority: formData.priority,
          requested_date: formData.requested_date,
        };

        if (formData.description) updateData.description = formData.description;
        if (formData.asset_id) updateData.asset_id = formData.asset_id;
        if (formData.location_id) updateData.location_id = formData.location_id;

        const { error } = await supabase
          .from("service_requests")
          .update(updateData)
          .eq("id", editingRequest.id);

        if (error) throw error;

        toast({
          title: t('serviceRequests.toast.updateSuccess'),
        });
      } else {
        // Create new request
        const reqNumber = formData.request_number || generateRequestNumber();

        const requestData: any = {
          request_number: reqNumber,
          title: formData.title,
          request_type: formData.request_type,
          priority: formData.priority,
          status: "submitted",
          requested_date: formData.requested_date,
          requester_id: user.id,
        };

        if (formData.description) requestData.description = formData.description;
        if (formData.asset_id) requestData.asset_id = formData.asset_id;
        if (formData.location_id) requestData.location_id = formData.location_id;

        const { error } = await supabase.from("service_requests").insert(requestData);

        if (error) throw error;

        toast({
          title: t('serviceRequests.toast.createSuccess'),
        });
      }

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: editingRequest ? t('serviceRequests.toast.updateError') : t('serviceRequests.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!requestToDelete) return;

    try {
      const { error } = await supabase
        .from("service_requests")
        .delete()
        .eq("id", requestToDelete);

      if (error) throw error;

      toast({
        title: t('serviceRequests.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('serviceRequests.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setRequestToDelete(null);
    }
  };

  const openEditDialog = (request: ServiceRequest) => {
    setEditingRequest(request);
    setFormData({
      request_number: request.request_number,
      title: request.title,
      description: "",
      request_type: request.request_type,
      priority: request.priority,
      asset_id: "",
      location_id: "",
      requested_date: request.requested_date ? request.requested_date.substring(0, 16) : new Date().toISOString().slice(0, 16),
    });
    setOpen(true);
  };

  const resetForm = () => {
    setEditingRequest(null);
    setFormData({
      request_number: "",
      title: "",
      description: "",
      request_type: "maintenance",
      priority: "medium",
      asset_id: "",
      location_id: "",
      requested_date: new Date().toISOString().slice(0, 16),
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
      submitted: t('serviceRequests.status.submitted'),
      pending_approval: t('serviceRequests.status.pending_approval'),
      approved: t('serviceRequests.status.approved'),
      assigned: t('serviceRequests.status.assigned'),
      in_progress: t('serviceRequests.status.in_progress'),
      resolved: t('serviceRequests.status.resolved'),
      closed: t('serviceRequests.status.closed'),
      rejected: t('serviceRequests.status.rejected'),
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      submitted: "bg-blue-500",
      pending_approval: "bg-yellow-500",
      approved: "bg-green-500",
      assigned: "bg-cyan-500",
      in_progress: "bg-orange-500",
      resolved: "bg-green-700",
      closed: "bg-gray-700",
      rejected: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      low: t('serviceRequests.priority.low'),
      medium: t('serviceRequests.priority.medium'),
      high: t('serviceRequests.priority.high'),
      critical: t('serviceRequests.priority.critical'),
      emergency: t('serviceRequests.priority.emergency'),
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
      maintenance: t('serviceRequests.type.maintenance'),
      repair: t('serviceRequests.type.repair'),
      installation: t('serviceRequests.type.installation'),
      inspection: t('serviceRequests.type.inspection'),
      other: t('serviceRequests.type.other'),
    };
    return labels[type] || type;
  };

  const filteredRequests = requests.filter((req) =>
    req.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('serviceRequests.title')}</h1>
              <p className="text-muted-foreground">{t('serviceRequests.description')}</p>
            </div>
          </div>
          <PermissionGate permission="service_requests.create">
            <Dialog open={open} onOpenChange={handleCloseDialog}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('serviceRequests.newRequest')}
                </Button>
              </DialogTrigger>
            </Dialog>
          </PermissionGate>
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingRequest ? t('serviceRequests.editRequest') : t('serviceRequests.newRequest')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="request_number">{t('serviceRequests.form.requestNumber')}</Label>
                    <Input
                      id="request_number"
                      value={formData.request_number}
                      onChange={(e) => setFormData({ ...formData, request_number: e.target.value })}
                      placeholder={t('serviceRequests.form.requestNumberPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('serviceRequests.form.requestNumberHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requested_date">{t('serviceRequests.form.requestedDate')} *</Label>
                    <Input
                      id="requested_date"
                      type="datetime-local"
                      value={formData.requested_date}
                      onChange={(e) => setFormData({ ...formData, requested_date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">{t('serviceRequests.form.title')} *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('serviceRequests.form.description')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="request_type">{t('serviceRequests.form.type')}</Label>
                    <Select
                      value={formData.request_type}
                      onValueChange={(value) => setFormData({ ...formData, request_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="maintenance">{t('serviceRequests.type.maintenance')}</SelectItem>
                        <SelectItem value="repair">{t('serviceRequests.type.repair')}</SelectItem>
                        <SelectItem value="installation">{t('serviceRequests.type.installation')}</SelectItem>
                        <SelectItem value="inspection">{t('serviceRequests.type.inspection')}</SelectItem>
                        <SelectItem value="other">{t('serviceRequests.type.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="priority">{t('serviceRequests.form.priority')}</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t('serviceRequests.priority.low')}</SelectItem>
                        <SelectItem value="medium">{t('serviceRequests.priority.medium')}</SelectItem>
                        <SelectItem value="high">{t('serviceRequests.priority.high')}</SelectItem>
                        <SelectItem value="critical">{t('serviceRequests.priority.critical')}</SelectItem>
                        <SelectItem value="emergency">{t('serviceRequests.priority.emergency')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="asset_id">{t('serviceRequests.form.asset')}</Label>
                    <Select
                      value={formData.asset_id}
                      onValueChange={(value) => setFormData({ ...formData, asset_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('serviceRequests.form.selectAsset')} />
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

                  <div className="space-y-2">
                    <Label htmlFor="location_id">{t('serviceRequests.form.location')}</Label>
                    <Select
                      value={formData.location_id}
                      onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('serviceRequests.form.selectLocation')} />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('serviceRequests.form.cancel')}
                  </Button>
                  <Button type="submit">{editingRequest ? t('serviceRequests.form.update') : t('serviceRequests.form.create')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('serviceRequests.search')}
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
                  <TableHead>{t('serviceRequests.table.requestNumber')}</TableHead>
                  <TableHead>{t('serviceRequests.table.title')}</TableHead>
                  <TableHead>{t('serviceRequests.table.assetLocation')}</TableHead>
                  <TableHead>{t('serviceRequests.table.type')}</TableHead>
                  <TableHead>{t('serviceRequests.table.priority')}</TableHead>
                  <TableHead>{t('serviceRequests.table.status')}</TableHead>
                  <TableHead>{t('serviceRequests.table.requested')}</TableHead>
                  <TableHead className="text-right">{t('serviceRequests.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t('serviceRequests.noRequests')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.request_number}</TableCell>
                      <TableCell>{req.title}</TableCell>
                      <TableCell>
                        {req.assets ? `${req.assets.asset_code} - ${req.assets.name}` : req.locations?.name || "-"}
                      </TableCell>
                      <TableCell>{getTypeLabel(req.request_type) || "-"}</TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(req.priority)}>
                          {getPriorityLabel(req.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(req.status)}>
                          {getStatusLabel(req.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(req.requested_date), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="service_requests.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(req)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="service_requests.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setRequestToDelete(req.id);
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
              <AlertDialogTitle>{t('serviceRequests.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('serviceRequests.delete.confirm')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRequestToDelete(null)}>
                {t('serviceRequests.delete.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('serviceRequests.delete.action')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
