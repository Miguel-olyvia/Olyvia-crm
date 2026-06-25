import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/contexts/CompanyContext";

interface ServiceFeeType {
  id: string;
  name: string;
  description: string | null;
  calculation_type: "PERCENTAGE" | "FIXED";
  percentage: number | null;
  fixed_amount: number | null;
  is_active: boolean;
  created_at: string;
  organization_id: string | null;
  service_id: string | null;
  application_mode: "SUBTOTAL" | "LINE_PERCENTAGE";
  apply_vat: boolean;
  vat_rate: number;
  anew_organizations?: { name: string };
  services?: { name: string };
}

interface Service {
  id: string;
  name: string;
}

export default function ServiceFees() {
  const { companies: userCompanies, userType, activeCompany } = useCompany();
  const { t } = useTranslation();
  const [feeTypes, setFeeTypes] = useState<ServiceFeeType[]>([]);
  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    calculation_type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    percentage: "",
    fixed_amount: "",
    is_active: true,
    organization_id: "",
    service_id: "",
    application_mode: "SUBTOTAL" as "SUBTOTAL" | "LINE_PERCENTAGE",
    apply_vat: true,
    vat_rate: "23",
  });

  const isSystemAdmin = userType === "system_admin";

  // Get available companies based on user access
  const availableCompanies = isSystemAdmin ? allCompanies : userCompanies;

  useEffect(() => {
    fetchFeeTypes();
    if (isSystemAdmin) {
      fetchAllCompanies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSystemAdmin, activeCompany?.id]);

  // Load services when company changes
  useEffect(() => {
    if (formData.organization_id) {
      fetchServicesForCompany(formData.organization_id);
    } else {
      setServices([]);
      setFormData(prev => ({ ...prev, service_id: "" }));
    }
  }, [formData.organization_id]);

  const fetchAllCompanies = async () => {
    if (!activeCompany?.id) return;
    try {
      const { resolveOrgSubtree } = await import("@/lib/orgSubtree");
      const subtreeIds = await resolveOrgSubtree(activeCompany.id);
      const { data, error } = await supabase
        .from("anew_organizations")
        .select("id, name")
        .in("id", subtreeIds)
        .order("name");

      if (error) throw error;
      setAllCompanies(data || []);
    } catch (error: any) {
      console.error("Error fetching companies:", error);
    }
  };

  const fetchServicesForCompany = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("organization_id", companyId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      console.error("Error fetching services:", error);
    }
  };

  const fetchFeeTypes = async () => {
    try {
      if (!activeCompany?.id) {
        setFeeTypes([]);
        return;
      }

      const { resolveOrgSubtree } = await import("@/lib/orgSubtree");
      const orgIds = await resolveOrgSubtree(activeCompany.id);

      const { data, error } = await supabase
        .from("service_fee_types")
        .select(`
          *,
          anew_organizations!organization_id(name),
          services(name)
        `)
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeeTypes((data || []) as ServiceFeeType[]);
    } catch (error: any) {
      toast({
        title: t('serviceFees.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      calculation_type: "PERCENTAGE",
      percentage: "",
      fixed_amount: "",
      is_active: true,
      organization_id: activeCompany?.id || "",
      service_id: "",
      application_mode: "SUBTOTAL",
      apply_vat: true,
      vat_rate: "23",
    });
    setEditingId(null);
    setServices([]);
  };

  const handleEdit = (feeType: ServiceFeeType) => {
    setFormData({
      name: feeType.name,
      description: feeType.description || "",
      calculation_type: feeType.calculation_type,
      percentage: feeType.percentage?.toString() || "",
      fixed_amount: feeType.fixed_amount?.toString() || "",
      is_active: feeType.is_active,
      organization_id: feeType.organization_id || "",
      service_id: feeType.service_id || "",
      application_mode: feeType.application_mode || "SUBTOTAL",
      apply_vat: feeType.apply_vat ?? true,
      vat_rate: (feeType.vat_rate ?? 23).toString(),
    });
    setEditingId(feeType.id);
    if (feeType.organization_id) {
      fetchServicesForCompany(feeType.organization_id);
    }
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('serviceFees.toast.notAuthenticated'));

      // Validation
      if (!formData.name.trim()) {
        toast({
          title: t('serviceFees.toast.nameRequired'),
          description: t('serviceFees.toast.enterName'),
          variant: "destructive",
        });
        return;
      }

      // Use activeCompany if not set in form (for consistency)
      const companyIdToUse = formData.organization_id || activeCompany?.id;
      if (!companyIdToUse) {
        toast({
          title: t('serviceFees.toast.companyRequired'),
          description: t('serviceFees.toast.selectCompany'),
          variant: "destructive",
        });
        return;
      }

      if (formData.application_mode === "LINE_PERCENTAGE") {
        if (formData.calculation_type !== "PERCENTAGE") {
          toast({
            title: "Modo inválido",
            description: "Taxas por linha exigem cálculo em percentagem.",
            variant: "destructive",
          });
          return;
        }
      }

      if (formData.calculation_type === "PERCENTAGE") {
        const pct = parseFloat(formData.percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          toast({
            title: t('serviceFees.toast.invalidPercentage'),
            description: t('serviceFees.toast.percentageRange'),
            variant: "destructive",
          });
          return;
        }
      } else {
        const amt = parseFloat(formData.fixed_amount);
        if (isNaN(amt) || amt < 0) {
          toast({
            title: t('serviceFees.toast.invalidValue'),
            description: t('serviceFees.toast.valueRange'),
            variant: "destructive",
          });
          return;
        }
      }

      const payload = {
        name: formData.name,
        description: formData.description || null,
        calculation_type: formData.calculation_type,
        percentage: formData.calculation_type === "PERCENTAGE" 
          ? parseFloat(formData.percentage) 
          : null,
        fixed_amount: formData.calculation_type === "FIXED" 
          ? parseFloat(formData.fixed_amount) 
          : null,
        is_active: formData.is_active,
        organization_id: companyIdToUse,
        service_id: formData.service_id || null,
        application_mode: formData.application_mode,
        apply_vat: formData.apply_vat,
        vat_rate: formData.apply_vat ? (parseFloat(formData.vat_rate) || 0) : 0,
      };

      if (editingId) {
        const { error } = await supabase
          .from("service_fee_types")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("organization_id", companyIdToUse);

        if (error) throw error;

        toast({
          title: t('serviceFees.toast.updateSuccess'),
          description: t('serviceFees.toast.updateSuccessDesc'),
        });
      } else {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) {
          toast({ title: "Erro de identidade", description: "Sessão inválida.", variant: "destructive" });
          return;
        }
        const { error } = await supabase
          .from("service_fee_types")
          .insert([{
            ...payload,
            created_by: businessUserId,
          }]);

        if (error) throw error;

        toast({
          title: t('serviceFees.toast.createSuccess'),
          description: t('serviceFees.toast.createSuccessDesc'),
        });
      }

      setShowDialog(false);
      resetForm();
      fetchFeeTypes();
    } catch (error: any) {
      const isUniqueViolation = error?.code === "23505" || /service_fee_types_one_line_percentage_per_org/i.test(error?.message || "");
      toast({
        title: isUniqueViolation ? "Já existe uma taxa por linha activa" : t('serviceFees.toast.saveError'),
        description: isUniqueViolation
          ? "Esta organização já tem uma taxa de serviço activa com modo 'Percentagem por linha'. Desactive ou apague a existente antes de criar outra."
          : error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const feeType = feeTypes.find((f) => f.id === deleteId);
      if (!feeType) {
        toast({ title: t('serviceFees.toast.deleteError'), description: "Fee type not found.", variant: "destructive" });
        return;
      }

      const { error } = await supabase
        .from("service_fee_types")
        .delete()
        .eq("id", deleteId)
        .eq("organization_id", feeType.organization_id ?? "");

      if (error) throw error;

      toast({
        title: t('serviceFees.toast.deleteSuccess'),
        description: t('serviceFees.toast.deleteSuccessDesc'),
      });

      fetchFeeTypes();
    } catch (error: any) {
      toast({
        title: t('serviceFees.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('serviceFees.title')}</h1>
            <p className="text-muted-foreground">
              {t('serviceFees.subtitle')}
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowDialog(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('serviceFees.newFee')}
          </Button>
        </div>

        <Card>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('serviceFees.loading')}
            </div>
          ) : feeTypes.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <p className="text-muted-foreground">
                {t('serviceFees.noFees')}
              </p>
              <Button onClick={() => { resetForm(); setShowDialog(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                {t('serviceFees.createFirstFee')}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('serviceFees.table.name')}</TableHead>
                  <TableHead>{t('serviceFees.table.company')}</TableHead>
                  <TableHead>{t('serviceFees.table.service')}</TableHead>
                  <TableHead>{t('serviceFees.table.type')}</TableHead>
                  <TableHead>{t('serviceFees.table.value')}</TableHead>
                  <TableHead>{t('serviceFees.table.status')}</TableHead>
                  <TableHead className="text-right">{t('serviceFees.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeTypes.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{fee.name}</div>
                        {fee.description && (
                          <div className="text-sm text-muted-foreground">
                            {fee.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{fee.anew_organizations?.name || "-"}</TableCell>
                    <TableCell>
                      {fee.services?.name ? (
                        <span>{fee.services.name}</span>
                      ) : (
                        <Badge variant="secondary">{t('serviceFees.general')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">
                          {fee.calculation_type === "PERCENTAGE"
                            ? t('serviceFees.type.percentage')
                            : t('serviceFees.type.fixed')}
                        </Badge>
                        {fee.application_mode === "LINE_PERCENTAGE" && (
                          <Badge variant="secondary">Por linha</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {fee.calculation_type === "PERCENTAGE"
                        ? `${fee.percentage}%`
                        : `€${fee.fixed_amount?.toFixed(2)}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={fee.is_active ? "default" : "secondary"}>
                        {fee.is_active ? t('serviceFees.status.active') : t('serviceFees.status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(fee)}
                          aria-label={t('serviceFees.actions.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(fee.id)}
                          aria-label={t('serviceFees.actions.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('serviceFees.dialog.editTitle') : t('serviceFees.dialog.newTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('serviceFees.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('serviceFees.form.company')}</Label>
              <Input
                value={activeCompany?.name || t('serviceFees.form.noCompanySelected')}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {t('serviceFees.form.companyHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t('serviceFees.form.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t('serviceFees.form.namePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('serviceFees.form.description')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t('serviceFees.form.descriptionPlaceholder')}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service_id">{t('serviceFees.form.service')}</Label>
              <Select
                value={formData.service_id || "none"}
                onValueChange={(value) =>
                  setFormData({ ...formData, service_id: value === "none" ? "" : value })
                }
                disabled={!formData.organization_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('serviceFees.form.selectService')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('serviceFees.form.noService')}</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('serviceFees.form.serviceHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calculation_type">{t('serviceFees.form.calculationType')}</Label>
              <Select
                value={formData.calculation_type}
                onValueChange={(value: "PERCENTAGE" | "FIXED") =>
                  setFormData({ ...formData, calculation_type: value })
                }
                disabled={formData.application_mode === "LINE_PERCENTAGE"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">{t('serviceFees.type.percentage')}</SelectItem>
                  <SelectItem value="FIXED">{t('serviceFees.type.fixed')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="application_mode">Modo de aplicação</Label>
              <Select
                value={formData.application_mode}
                onValueChange={(value: "SUBTOTAL" | "LINE_PERCENTAGE") =>
                  setFormData({
                    ...formData,
                    application_mode: value,
                    // Force PERCENTAGE when switching to LINE_PERCENTAGE
                    calculation_type: value === "LINE_PERCENTAGE" ? "PERCENTAGE" : formData.calculation_type,
                    fixed_amount: value === "LINE_PERCENTAGE" ? "" : formData.fixed_amount,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUBTOTAL">Subtotal do orçamento</SelectItem>
                  <SelectItem value="LINE_PERCENTAGE">Percentagem por linha (editável)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.application_mode === "LINE_PERCENTAGE"
                  ? "A percentagem definida é usada como default por linha e é editável no orçamento. Apenas uma taxa por linha activa por organização."
                  : "Aplica o valor uma vez ao subtotal do orçamento."}
              </p>
            </div>

            {formData.calculation_type === "PERCENTAGE" ? (
              <div className="space-y-2">
                <Label htmlFor="percentage">{t('serviceFees.form.percentage')}</Label>
                <Input
                  id="percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, percentage: e.target.value })
                  }
                  placeholder={t('serviceFees.form.percentagePlaceholder')}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="fixed_amount">{t('serviceFees.form.fixedAmount')}</Label>
                <Input
                  id="fixed_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.fixed_amount}
                  onChange={(e) =>
                    setFormData({ ...formData, fixed_amount: e.target.value })
                  }
                  placeholder={t('serviceFees.form.fixedAmountPlaceholder')}
                />
              </div>
            )}

            <div className="space-y-2 border rounded-md p-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="apply_vat"
                  checked={formData.apply_vat}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, apply_vat: checked })
                  }
                />
                <Label htmlFor="apply_vat">Aplicar IVA a esta taxa</Label>
              </div>
              {formData.apply_vat && (
                <div className="space-y-1">
                  <Label htmlFor="vat_rate" className="text-xs text-muted-foreground">Taxa de IVA (%)</Label>
                  <Input
                    id="vat_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.vat_rate}
                    onChange={(e) =>
                      setFormData({ ...formData, vat_rate: e.target.value })
                    }
                    placeholder="23"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
              <Label htmlFor="is_active">{t('serviceFees.form.activeFee')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('serviceFees.form.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? t('serviceFees.form.save') : t('serviceFees.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('serviceFees.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('serviceFees.delete.message')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('serviceFees.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('serviceFees.delete.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
