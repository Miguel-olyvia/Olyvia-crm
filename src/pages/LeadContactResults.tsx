import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { 
  Plus, Pencil, Trash2, Phone, PhoneOff, PhoneMissed, 
  Clock, CheckCircle, XCircle, CalendarCheck, GripVertical,
  MessageSquare, PhoneCall, PhoneForwarded, Ban
} from "lucide-react";
import { HelpButton } from "@/components/HelpButton";

interface ContactResult {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  workflow_next_status: string | null;
  is_positive: boolean;
  is_negative: boolean;
  requires_callback: boolean;
  requires_visit: boolean;
  sort_order: number;
  is_active: boolean;
}

const PRESET_COLORS = [
  "#22c55e", "#16a34a", "#eab308", "#f97316", "#ef4444", 
  "#dc2626", "#3b82f6", "#2563eb", "#a855f7", "#7c3aed",
  "#ec4899", "#6b7280"
];

export default function LeadContactResults() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const selectedCompanyId = activeCompany?.id;
  const [results, setResults] = useState<ContactResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<ContactResult | null>(null);
  const [resultToDelete, setResultToDelete] = useState<ContactResult | null>(null);

  const AVAILABLE_ICONS = [
    { value: "phone", label: t('contactResults.icons.phone'), icon: Phone },
    { value: "phone-off", label: t('contactResults.icons.phoneOff'), icon: PhoneOff },
    { value: "phone-missed", label: t('contactResults.icons.noAnswer'), icon: PhoneMissed },
    { value: "phone-call", label: t('contactResults.icons.phoneCall'), icon: PhoneCall },
    { value: "phone-forwarded", label: t('contactResults.icons.phoneForwarded'), icon: PhoneForwarded },
    { value: "clock", label: t('contactResults.icons.clock'), icon: Clock },
    { value: "check-circle", label: t('contactResults.icons.success'), icon: CheckCircle },
    { value: "x-circle", label: t('contactResults.icons.error'), icon: XCircle },
    { value: "calendar-check", label: t('contactResults.icons.calendar'), icon: CalendarCheck },
    { value: "message-square", label: t('contactResults.icons.message'), icon: MessageSquare },
    { value: "ban", label: t('contactResults.icons.blocked'), icon: Ban },
  ];

  const LEAD_STATUSES = [
    { value: "new", label: t('contactResults.statuses.new') },
    { value: "contacted", label: t('contactResults.statuses.contacted') },
    { value: "no_answer", label: t('contactResults.statuses.noAnswer') },
    { value: "callback_scheduled", label: t('contactResults.statuses.callbackScheduled') },
    { value: "visit_scheduled", label: t('contactResults.statuses.visitScheduled') },
    { value: "qualified", label: t('contactResults.statuses.qualified') },
    { value: "converted", label: t('contactResults.statuses.converted') },
    { value: "rejected", label: t('contactResults.statuses.rejected') },
    { value: "lost", label: t('contactResults.statuses.lost') },
  ];
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "phone",
    color: "#6b7280",
    workflow_next_status: "",
    is_positive: false,
    is_negative: false,
    requires_callback: false,
    requires_visit: false,
    is_active: true,
  });

  useEffect(() => {
    loadResults();
  }, [selectedCompanyId]);

  const loadResults = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("lead_contact_results")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${selectedCompanyId}`)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setResults(data);
    }
    setLoading(false);
  };

  const handleOpenDialog = (result?: ContactResult) => {
    if (result) {
      setEditingResult(result);
      setFormData({
        name: result.name,
        description: result.description || "",
        icon: result.icon,
        color: result.color,
        workflow_next_status: result.workflow_next_status || "",
        is_positive: result.is_positive,
        is_negative: result.is_negative,
        requires_callback: result.requires_callback,
        requires_visit: result.requires_visit,
        is_active: result.is_active,
      });
    } else {
      setEditingResult(null);
      setFormData({
        name: "",
        description: "",
        icon: "phone",
        color: "#6b7280",
        workflow_next_status: "",
        is_positive: false,
        is_negative: false,
        requires_callback: false,
        requires_visit: false,
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('contactResults.toast.nameRequired'), variant: "destructive" });
      return;
    }

    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    const payload = {
      ...formData,
      workflow_next_status: formData.workflow_next_status || null,
      organization_id: selectedCompanyId,
      created_by: businessUserId,
      sort_order: editingResult ? editingResult.sort_order : results.length + 1,
    };

    if (editingResult) {
      const { error } = await supabase
        .from("lead_contact_results")
        .update(payload)
        .eq("id", editingResult.id);

      if (error) {
        toast({ title: t('contactResults.toast.updateError'), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t('contactResults.toast.updateSuccess') });
        setDialogOpen(false);
        loadResults();
      }
    } else {
      const { error } = await supabase
        .from("lead_contact_results")
        .insert(payload);

      if (error) {
        toast({ title: t('contactResults.toast.createError'), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t('contactResults.toast.createSuccess') });
        setDialogOpen(false);
        loadResults();
      }
    }
  };

  const handleDelete = async () => {
    if (!resultToDelete) return;

    const { error } = await supabase
      .from("lead_contact_results")
      .delete()
      .eq("id", resultToDelete.id);

    if (error) {
      toast({ title: t('contactResults.toast.deleteError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t('contactResults.toast.deleteSuccess') });
      loadResults();
    }
    setDeleteDialogOpen(false);
    setResultToDelete(null);
  };

  const getIconComponent = (iconName: string) => {
    const iconConfig = AVAILABLE_ICONS.find(i => i.value === iconName);
    return iconConfig?.icon || Phone;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{t('contactResults.title')}</h1>
              <HelpButton pageKey="marketing.lead-contact-results" />
            </div>
            <p className="text-muted-foreground">
              {t('contactResults.subtitle')}
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            {t('contactResults.newResult')}
          </Button>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>{t('contactResults.table.result')}</TableHead>
                <TableHead>{t('contactResults.table.workflow')}</TableHead>
                <TableHead>{t('contactResults.table.flags')}</TableHead>
                <TableHead>{t('contactResults.table.scope')}</TableHead>
                <TableHead>{t('contactResults.table.status')}</TableHead>
                <TableHead className="w-24">{t('contactResults.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t('contactResults.loading')}
                  </TableCell>
                </TableRow>
              ) : results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('contactResults.noResults')}
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result) => {
                  const IconComponent = getIconComponent(result.icon);
                  return (
                    <TableRow key={result.id}>
                      <TableCell>
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: result.color + "20" }}
                          >
                            <IconComponent className="w-4 h-4" style={{ color: result.color }} />
                          </div>
                          <div>
                            <p className="font-medium">{result.name}</p>
                            {result.description && (
                              <p className="text-xs text-muted-foreground">{result.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {result.workflow_next_status ? (
                          <Badge variant="secondary">
                            → {LEAD_STATUSES.find(s => s.value === result.workflow_next_status)?.label || result.workflow_next_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {result.is_positive && (
                            <Badge variant="outline" className="text-green-600 border-green-200">{t('contactResults.flags.positive')}</Badge>
                          )}
                          {result.is_negative && (
                            <Badge variant="outline" className="text-red-600 border-red-200">{t('contactResults.flags.negative')}</Badge>
                          )}
                          {result.requires_callback && (
                            <Badge variant="outline" className="text-purple-600 border-purple-200">{t('contactResults.flags.callback')}</Badge>
                          )}
                          {result.requires_visit && (
                            <Badge variant="outline" className="text-blue-600 border-blue-200">{t('contactResults.flags.visit')}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={result.organization_id ? "default" : "secondary"}>
                          {result.organization_id ? t('contactResults.scope.company') : t('contactResults.scope.global')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={result.is_active ? "default" : "outline"}>
                          {result.is_active ? t('contactResults.status.active') : t('contactResults.status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(result)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {result.organization_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setResultToDelete(result);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingResult ? t('contactResults.editResult') : t('contactResults.newResultFull')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contactResults.form.name')}</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('contactResults.form.namePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('contactResults.form.description')}</Label>
              <Input
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('contactResults.form.descriptionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('contactResults.form.icon')}</Label>
                <Select value={formData.icon} onValueChange={v => setFormData({ ...formData, icon: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ICONS.map(icon => {
                      const IconComp = icon.icon;
                      return (
                        <SelectItem key={icon.value} value={icon.value}>
                          <div className="flex items-center gap-2">
                            <IconComp className="w-4 h-4" />
                            {icon.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('contactResults.form.color')}</Label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`w-6 h-6 rounded-full border-2 ${
                        formData.color === color ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('contactResults.form.workflowNextStatus')}</Label>
              <Select 
                value={formData.workflow_next_status || "none"} 
                onValueChange={v => setFormData({ ...formData, workflow_next_status: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('contactResults.form.selectStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('contactResults.form.noStatusChange')}</SelectItem>
                  {LEAD_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('contactResults.form.statusHint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label>{t('contactResults.form.positiveResult')}</Label>
                <Switch
                  checked={formData.is_positive}
                  onCheckedChange={v => setFormData({ ...formData, is_positive: v, is_negative: v ? false : formData.is_negative })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label>{t('contactResults.form.negativeResult')}</Label>
                <Switch
                  checked={formData.is_negative}
                  onCheckedChange={v => setFormData({ ...formData, is_negative: v, is_positive: v ? false : formData.is_positive })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label>{t('contactResults.form.requiresCallback')}</Label>
                <Switch
                  checked={formData.requires_callback}
                  onCheckedChange={v => setFormData({ ...formData, requires_callback: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label>{t('contactResults.form.requiresVisit')}</Label>
                <Switch
                  checked={formData.requires_visit}
                  onCheckedChange={v => setFormData({ ...formData, requires_visit: v })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label>{t('contactResults.form.active')}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={v => setFormData({ ...formData, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('contactResults.form.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingResult ? t('contactResults.form.save') : t('contactResults.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contactResults.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('contactResults.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('contactResults.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('contactResults.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
