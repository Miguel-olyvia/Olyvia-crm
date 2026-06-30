import { useCallback, useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Search, Settings2, Pencil, Trash2, Shield, Copy } from "lucide-react";
import AttributeOptionPalettesDialog from "@/components/AttributeOptionPalettesDialog";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PermissionGate } from "@/components/PermissionGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { OrganizationFormSection, OrganizationSelection } from "@/components/OrganizationFormSection";
import { OrganizationFilters } from "@/components/OrganizationFilters";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkDeleteDialog, BulkOrgDialog } from "@/components/BulkActionDialogs";
import { useBulkActions } from "@/hooks/useBulkActions";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  unit: string | null;
  is_filterable: boolean;
  is_required: boolean;
  is_variant_option: boolean;
  sort_order: number;
  allowed_values: any;
  organization_id: string | null;
  pricing_type: string | null;
  price_per_unit: number | null;
  pricing_unit: string | null;
  has_hex_color: boolean;
  is_measurement: boolean;
  measurement_type: string | null;
  valorization_type: string | null;
  pricing_dimension: string | null;
}


export default function ProductAttributes() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, userType, companies } = useCompany();
  const { loading: permissionsLoading, hasModuleAccess, isSystemAdmin } = usePermissions();
  const canView = hasModuleAccess("product_attributes");
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<ProductAttribute | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    value_type: "string",
    unit: "",
    is_filterable: false,
    is_required: false,
    is_variant_option: false,
    sort_order: 0,
    allowed_values: [] as string[],
    pricing_type: "none" as string,
    price_per_unit: 0,
    pricing_unit: "",
    has_hex_color: false,
    is_measurement: false,
    measurement_type: "" as string,
    pricing_dimension: "" as string,
  });
  
  const [organizationSelection, setOrganizationSelection] = useState<OrganizationSelection>({
    tenantId: "",
    companyId: "",
    businessUnitId: "",
    departmentId: "",
    secondaryCompanyIds: [],
    selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
    levelSelections: [],
  });
  
  // Palette dialog state
  const [palettesDialogOpen, setPalettesDialogOpen] = useState(false);
  const [palettesAttribute, setPalettesAttribute] = useState<ProductAttribute | null>(null);

  // Delete confirmation dialog state (replaces window.confirm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Valorization-type change confirmation dialog state (replaces window.confirm)
  const [valorizationConfirm, setValorizationConfirm] = useState<{ count: number } | null>(null);
  // Ref to store the submit continuation — resolved when user confirms/cancels
  const valorizationResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  // Filter states
  const [filterTenantId, setFilterTenantId] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const isAdmin = isSystemAdmin;




  const loadData = useCallback(async () => {
    // ALWAYS require activeCompany to be set
    if (!activeCompany?.id) {
      setAttributes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // ALWAYS use activeCompany.id - ignore filter overrides
      const companyIdToFilter = activeCompany.id;

      const { data, error } = await supabase
        .from("product_attributes")
        .select("*")
        .eq("organization_id", companyIdToFilter)
        .order("sort_order");

      if (error) throw error;
      setAttributes(data || []);



    } catch (error: any) {
      toast({
        title: t('productAttributes.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id, t, toast]);

  // Bulk actions hook
  const bulkActions = useBulkActions({
    tableName: "product_attributes",
    onSuccess: loadData,
    softDelete: false,
    organizationId: activeCompany?.id,
  });

  const { clearSelection } = bulkActions;

  // Clear immediately on company change, then reload.
  // loadData is a useCallback whose dep array already includes activeCompany?.id,
  // so including it here is correct and ensures the effect reruns whenever the
  // callback identity changes (i.e. when activeCompany changes).
  useEffect(() => {
    setAttributes([]);
    bulkActions.clearSelection();
    void loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('productAttributes.toast.notAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      // Rule 7: Warn if valorization_type changed and attribute is used by products
      if (editingAttribute) {
        const oldValorizationType = editingAttribute.valorization_type || 'none';
        const newValorizationType = (formData.value_type === 'list' || formData.value_type === 'number') ? formData.pricing_type : 'none';

        if (oldValorizationType !== newValorizationType) {
          const { count } = await supabase
            .from('product_attribute_values')
            .select('id', { count: 'exact', head: true })
            .eq('attribute_id', editingAttribute.id);

          if (count && count > 0) {
            // Show accessible confirmation dialog instead of window.confirm
            const confirmed = await new Promise<boolean>((resolve) => {
              valorizationResolveRef.current = resolve;
              setValorizationConfirm({ count });
            });
            if (!confirmed) return;
          }
        }
      }

      // Get all selected company IDs from multi-select
      const allCompanyIds = organizationSelection.selectedCompanyIds || [];
      const finalCompanyId = allCompanyIds.length > 0 ? allCompanyIds[0] : (activeCompany?.id || null);

      if (allCompanyIds.length === 0 && userType !== 'system_admin') {
        toast({
          title: t('common.error'),
          description: "Selecione uma empresa",
          variant: "destructive",
        });
        return;
      }

      const attributeData: any = {
        label: formData.label,
        value_type: formData.value_type,
        is_filterable: formData.is_filterable,
        is_required: formData.is_required,
        is_variant_option: formData.is_variant_option,
        sort_order: formData.sort_order,
        organization_id: finalCompanyId,
        pricing_type: formData.pricing_type,
        price_per_unit: formData.pricing_type === 'per_unit' || formData.pricing_type === 'both' ? formData.price_per_unit : 0,
        pricing_unit: formData.pricing_type === 'per_unit' || formData.pricing_type === 'both' ? formData.pricing_unit : null,
        has_hex_color: formData.value_type === 'list' ? formData.has_hex_color : false,
        is_measurement: formData.value_type === 'number' ? formData.is_measurement : false,
        measurement_type: formData.value_type === 'number' && formData.is_measurement ? formData.measurement_type : null,
        valorization_type: (formData.value_type === 'list' || formData.value_type === 'number') ? formData.pricing_type : 'none',
        pricing_dimension: formData.has_hex_color ? 'color' : (formData.is_measurement && formData.pricing_type === 'base_price' ? 'size' : (formData.pricing_dimension || null)),
      };

      if (formData.unit) {
        attributeData.unit = formData.unit;
      }

      let attributeId = editingAttribute?.id;

      if (editingAttribute) {
        await withAuditContext(supabase, businessUserId, async () => {
          const { error } = await supabase
            .from("product_attributes")
            .update(attributeData)
            .eq("id", editingAttribute.id)
            .eq("organization_id", activeCompany.id);
          if (error) throw error;
        });
      } else {
        attributeData.code = formData.code;
        attributeData.created_by = businessUserId;

        const inserted = await withAuditContext(supabase, businessUserId, async () => {
          const { data, error } = await supabase
            .from("product_attributes")
            .insert(attributeData)
            .select('id')
            .single();
          if (error) throw error;
          return data;
        });
        attributeId = inserted.id;
      }

      // Value prices and price ranges are now managed in AttributeOptionPalettesDialog
      // No longer saved from the edit form to avoid overwriting data

      toast({
        title: editingAttribute ? t('productAttributes.toast.updateSuccess') : t('productAttributes.toast.createSuccess'),
      });

      handleCloseDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: editingAttribute ? t('productAttributes.toast.updateError') : t('productAttributes.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    // Delegate confirmation to AlertDialog — called after user confirms
    if (!activeCompany?.id) {
      toast({ title: t('common.error'), description: t('common.noActiveCompany') || "Nenhuma empresa ativa selecionada.", variant: "destructive" });
      return;
    }

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      await withAuditContext(supabase, businessUserId, async () => {
        const { error } = await supabase
          .from("product_attributes")
          .delete()
          .eq("id", id)
          .eq("organization_id", activeCompany.id);
        if (error) throw error;
      });

      toast({
        title: t('productAttributes.toast.success'),
        description: t('productAttributes.toast.deleteSuccess'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('productAttributes.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const openEditDialog = async (attribute: ProductAttribute) => {
    setEditingAttribute(attribute);
    setFormData({
      code: attribute.code,
      label: attribute.label,
      value_type: attribute.value_type,
      unit: attribute.unit || "",
      is_filterable: attribute.is_filterable,
      is_required: attribute.is_required,
      is_variant_option: attribute.is_variant_option,
      sort_order: attribute.sort_order,
      allowed_values: attribute.allowed_values || [],
      pricing_type: attribute.pricing_type || "none",
      price_per_unit: attribute.price_per_unit || 0,
      pricing_unit: attribute.pricing_unit || "",
      has_hex_color: attribute.has_hex_color || false,
      is_measurement: attribute.is_measurement || false,
      measurement_type: attribute.measurement_type || "",
      pricing_dimension: attribute.pricing_dimension || "",
    });
    setOrganizationSelection({
      tenantId: "",
      companyId: "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: attribute.organization_id ? [attribute.organization_id] : (activeCompany?.id ? [activeCompany.id] : []),
      levelSelections: [],
    });
    
    // Value prices and ranges are now loaded/managed in AttributeOptionPalettesDialog
    
    setOpen(true);
  };

  const resetForm = () => {
    setEditingAttribute(null);
    setFormData({
      code: "",
      label: "",
      value_type: "string",
      unit: "",
      is_filterable: false,
      is_required: false,
      is_variant_option: false,
      sort_order: 0,
      allowed_values: [],
      pricing_type: "none",
      price_per_unit: 0,
      pricing_unit: "",
      has_hex_color: false,
      is_measurement: false,
      measurement_type: "",
      pricing_dimension: "",
    });
    setOrganizationSelection({
      tenantId: "",
      companyId: "",
      businessUnitId: "",
      departmentId: "",
      secondaryCompanyIds: [],
      selectedCompanyIds: activeCompany?.id ? [activeCompany.id] : [],
      levelSelections: [],
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

  // Client-side filtering
  const filteredAttributes = attributes.filter((attr) => {
    // Search filter
    const matchesSearch =
      attr.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attr.label.toLowerCase().includes(searchTerm.toLowerCase());




    // Company filter (client-side)
    const hasCompanyFilter = filterCompanyId && filterCompanyId !== "all";
    const matchesCompany = !hasCompanyFilter || attr.organization_id === filterCompanyId;

    return matchesSearch && matchesCompany;
  });

  const allIds = filteredAttributes.map(a => a.id);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "string":
      case "text":
        return "default";
      case "number":
        return "secondary";
      case "boolean":
        return "outline";
      case "list":
        return "default";
      case "date":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "string":
      case "text":
        return t('productAttributes.type.text');
      case "number":
        return t('productAttributes.type.number');
      case "boolean":
        return t('productAttributes.type.boolean');
      case "list":
        return t('productAttributes.type.list');
      case "date":
        return t('productAttributes.type.date');
      default:
        return type;
    }
  };

  const handleDuplicate = async (attr: ProductAttribute) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('productAttributes.toast.notAuthenticated'));
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      // Find a unique code by appending _copy / _copy_2 / ...
      let newCode = `${attr.code}_copy`;
      let suffix = 1;
      while (true) {
        const { data: existing } = await supabase
          .from("product_attributes")
          .select("id")
          .eq("code", newCode)
          .eq("organization_id", activeCompany?.id)
          .maybeSingle();
        if (!existing) break;
        suffix += 1;
        newCode = `${attr.code}_copy_${suffix}`;
      }

      const { id, ...rest } = attr as any;
      const newAttribute = {
        ...rest,
        code: newCode,
        label: `${attr.label} (cópia)`,
        created_by: businessUserId,
      };

      // Wrap the entire duplicate operation (main attribute insert + all clones) in a
      // single audit context so every write records the acting user.
      const newAttrId = await withAuditContext(supabase, businessUserId, async () => {
        const { data: inserted, error } = await supabase
          .from("product_attributes")
          .insert(newAttribute)
          .select("id")
          .single();
        if (error) throw error;
        return inserted.id;
      });

      // Duplicate all related details (best-effort, in parallel).
      // Each clone function runs inside its own withAuditContext so the audit
      // trigger sees the acting user even when clones settle independently.

      // 1) Option groups + their values
      const cloneOptionGroups = async () => {
        const { data: groups, error: groupsErr } = await (supabase as any)
          .from("attribute_option_groups")
          .select("id, organization_id, name, description, is_active, sort_order")
          .eq("attribute_id", attr.id);

        if (groupsErr) {
          console.error("[duplicate] read groups failed", groupsErr);
          return;
        }
        if (!groups || groups.length === 0) return;

        for (const g of groups) {
          const newGroup = await withAuditContext(supabase, businessUserId, async () => {
            const { data, error: gErr } = await (supabase as any)
              .from("attribute_option_groups")
              .insert({
                attribute_id: newAttrId,
                organization_id: g.organization_id,
                name: g.name,
                description: g.description,
                is_active: g.is_active,
                sort_order: g.sort_order,
                created_by: businessUserId,
              })
              .select("id")
              .single();
            if (gErr || !data) throw gErr ?? new Error("insert group returned no data");
            return data;
          }).catch((gErr: unknown) => {
            console.error("[duplicate] insert group failed", gErr);
            return null;
          });
          if (!newGroup) continue;

          const { data: values, error: valuesReadErr } = await (supabase as any)
            .from("attribute_option_group_values")
            .select("value_text, display_name, hex_color, sort_order, is_active")
            .eq("group_id", g.id)
            .order("sort_order", { ascending: true });

          if (valuesReadErr) {
            console.error("[duplicate] read values failed", valuesReadErr);
            continue;
          }
          if (!values || values.length === 0) continue;

          // Insert in chunks of 100 to avoid payload limits / silent failures
          const rows = values.map((v: any) => ({
            group_id: newGroup.id,
            value_text: v.value_text,
            display_name: v.display_name,
            hex_color: v.hex_color,
            sort_order: v.sort_order ?? 0,
            is_active: v.is_active ?? true,
          }));
          const chunkSize = 100;
          for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            await withAuditContext(supabase, businessUserId, async () => {
              const { error: insErr } = await (supabase as any)
                .from("attribute_option_group_values")
                .insert(chunk);
              if (insErr) {
                console.error("[duplicate] insert values chunk failed", insErr, chunk[0]);
              }
            });
          }
        }
      };

      // 2) Category-level value prices (no product_id)
      const cloneValuePrices = async () => {
        const { data: prices } = await supabase
          .from("product_attribute_value_prices")
          .select("organization_id, category_id, value_option, price, cost_impact, is_available, sort_order, price_context_id")
          .eq("attribute_id", attr.id)
          .is("product_id", null);
        if (prices && prices.length > 0) {
          await withAuditContext(supabase, businessUserId, async () => {
            await supabase.from("product_attribute_value_prices").insert(
              prices.map((p: any) => ({ ...p, attribute_id: newAttrId })),
            );
          });
        }
      };

      // 3) Category-level price ranges (no product_id)
      const clonePriceRanges = async () => {
        const { data: ranges } = await supabase
          .from("product_attribute_price_ranges")
          .select("organization_id, category_id, range_type, min_value, max_value, min_width, max_width, min_height, max_height, min_depth, max_depth, price_per_unit, cost_impact, price_context_id")
          .eq("attribute_id", attr.id)
          .is("product_id", null);
        if (ranges && ranges.length > 0) {
          await withAuditContext(supabase, businessUserId, async () => {
            await supabase.from("product_attribute_price_ranges").insert(
              ranges.map((r: any) => ({ ...r, attribute_id: newAttrId })),
            );
          });
        }
      };

      // 4) Organization links
      const cloneOrgLinks = async () => {
        const { data: orgs } = await supabase
          .from("product_attribute_organizations")
          .select("organization_id")
          .eq("attribute_id", attr.id);
        if (orgs && orgs.length > 0) {
          await withAuditContext(supabase, businessUserId, async () => {
            await supabase.from("product_attribute_organizations").insert(
              orgs.map((o: any) => ({
                attribute_id: newAttrId,
                organization_id: o.organization_id,
                created_by: businessUserId,
              })),
            );
          });
        }
      };

      // 5) Category attribute palette configuration
      const clonePaletteCfg = async () => {
        const { data: paletteCfgs } = await (supabase as any)
          .from("category_attribute_palettes")
          .select("category_id, base_group_id, additional_values, excluded_values")
          .eq("attribute_id", attr.id);
        if (paletteCfgs && paletteCfgs.length > 0) {
          await withAuditContext(supabase, businessUserId, async () => {
            await (supabase as any).from("category_attribute_palettes").insert(
              paletteCfgs.map((p: any) => ({ ...p, attribute_id: newAttrId })),
            );
          });
        }
      };

      await Promise.allSettled([
        cloneOptionGroups(),
        cloneValuePrices(),
        clonePriceRanges(),
        cloneOrgLinks(),
        clonePaletteCfg(),
      ]);


      toast({
        title: t('productAttributes.toast.success'),
        description: `Atributo duplicado como "${newCode}"`,
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('productAttributes.toast.error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };


  if (loading || permissionsLoading) {
    return (
      <>
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">{t('productAttributes.loading')}</div>
          </div>
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <div className="p-8">
          <Card className="p-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">{t('productAttributes.accessDenied')}</h2>
              <p className="text-muted-foreground">{t('productAttributes.noPermission')}</p>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('productAttributes.title')}</h1>
          </div>
          <PermissionGate permission="product_attributes.create">
            <Button onClick={() => { resetForm(); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              {t('productAttributes.addAttribute')}
            </Button>
          </PermissionGate>
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle>{editingAttribute ? t('productAttributes.dialog.editTitle') : t('productAttributes.dialog.newTitle')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <ScrollArea className="flex-1 pr-4 [&>[data-radix-scroll-area-viewport]]:max-h-[calc(90vh-180px)]">
                  <div className="space-y-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">{t('productAttributes.form.code')}</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder={t('productAttributes.form.codePlaceholder')}
                      required
                      disabled={!!editingAttribute}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="label">{t('productAttributes.form.label')}</Label>
                    <Input
                      id="label"
                      value={formData.label}
                      onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                      placeholder={t('productAttributes.form.labelPlaceholder')}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="value_type">{t('productAttributes.form.type')}</Label>
                    <Select
                      value={formData.value_type}
                      onValueChange={(value) => setFormData({ ...formData, value_type: value, has_hex_color: false, is_measurement: false, measurement_type: "", pricing_type: "none" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">{t('productAttributes.type.text')}</SelectItem>
                        <SelectItem value="number">{t('productAttributes.type.number')}</SelectItem>
                        <SelectItem value="boolean">{t('productAttributes.type.boolean')}</SelectItem>
                        <SelectItem value="list">{t('productAttributes.type.list')}</SelectItem>
                        <SelectItem value="date">{t('productAttributes.type.date')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {!(formData.value_type === 'number' && formData.is_measurement) && (
                    <div className="space-y-2">
                      <Label htmlFor="unit">{t('productAttributes.form.unit')}</Label>
                      <Input
                        id="unit"
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        placeholder={t('productAttributes.form.unitPlaceholder')}
                      />
                    </div>
                  )}
                </div>


                <div className="space-y-2">
                  <Label htmlFor="sort_order">{t('productAttributes.form.sortOrder')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_filterable">{t('productAttributes.switch.filterable')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('productAttributes.switch.filterableDesc')}
                      </p>
                    </div>
                    <Switch
                      id="is_filterable"
                      checked={formData.is_filterable}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_filterable: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_required">{t('productAttributes.switch.required')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('productAttributes.switch.requiredDesc')}
                      </p>
                    </div>
                    <Switch
                      id="is_required"
                      checked={formData.is_required}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_variant_option">{t('productAttributes.switch.variantOption')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('productAttributes.switch.variantOptionDesc')}
                      </p>
                    </div>
                    <Switch
                      id="is_variant_option"
                      checked={formData.is_variant_option}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_variant_option: checked })}
                    />
                  </div>

                  {/* Has Hex Color - only for list type */}
                  {formData.value_type === 'list' && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="has_hex_color">{t('productAttributes.switch.hasHexColor')}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t('productAttributes.switch.hasHexColorDesc')}
                        </p>
                      </div>
                      <Switch
                        id="has_hex_color"
                        checked={formData.has_hex_color}
                        onCheckedChange={(checked) => setFormData({ 
                          ...formData, 
                          has_hex_color: checked, 
                          ...(checked ? { 
                            is_measurement: false, 
                            measurement_type: "", 
                            pricing_type: "fixed",  // Rule 5: has_hex_color → force adjustment
                            pricing_dimension: "color" // Rule 5: has_hex_color → force color
                          } : {}) 
                        })}
                      />
                    </div>
                  )}

                  {/* Is Measurement - only for number type */}
                  {formData.value_type === 'number' && (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="is_measurement">É medida</Label>
                          <p className="text-sm text-muted-foreground">
                            Define dimensões mensuráveis (comprimento, área, volume)
                          </p>
                        </div>
                        <Switch
                          id="is_measurement"
                          checked={formData.is_measurement}
                          onCheckedChange={(checked) => setFormData({ ...formData, is_measurement: checked, ...(checked ? { has_hex_color: false, measurement_type: formData.measurement_type || "linear" } : { measurement_type: "" }) })}
                        />
                      </div>

                    </>
                  )}
                </div>

                {/* Pricing/Valorization Section - only for list and number types */}
                {(formData.value_type === 'list' || formData.value_type === 'number') && (
                  <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-medium flex items-center gap-2">
                      💰 {t('productAttributes.pricing.title') || 'Valorização'}
                    </h4>
                    
                    <div className="space-y-2">
                      <Label>{t('productAttributes.pricing.type') || 'Tipo de Valorização'}</Label>
                      <Select
                        value={formData.pricing_type}
                        onValueChange={(value) => setFormData({ ...formData, pricing_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('productAttributes.pricing.none') || 'Sem valorização'}</SelectItem>
                          {formData.value_type === 'list' && (
                            <>
                              <SelectItem value="fixed">{t('productAttributes.pricing.fixed') || 'Preço fixo por opção'}</SelectItem>
                              <SelectItem value="both">{t('productAttributes.pricing.both') || 'Ambos (fixo + por unidade)'}</SelectItem>
                            </>
                          )}
                          {formData.value_type === 'number' && (
                            <>
                              <SelectItem value="per_unit">{t('productAttributes.pricing.perUnit') || 'Preço por unidade'}</SelectItem>
                              <SelectItem value="range">{t('productAttributes.pricing.range') || 'Preço por escalão'}</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {(formData.pricing_type === 'per_unit' || formData.pricing_type === 'both') && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t('productAttributes.pricing.pricePerUnit') || 'Preço por Unidade'}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.price_per_unit}
                            onChange={(e) => setFormData({ ...formData, price_per_unit: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('productAttributes.pricing.pricingUnit') || 'Unidade de Preço'}</Label>
                          <Input
                            value={formData.pricing_unit}
                            onChange={(e) => setFormData({ ...formData, pricing_unit: e.target.value })}
                            placeholder="ex: m², kg, L"
                          />
                        </div>
                      </div>
                    )}

                    {formData.pricing_type !== 'none' && (
                      <>
                        {/* Pricing Dimension dropdown - manual selection */}
                        <div className="space-y-2">
                          <Label>Dimensão de preço</Label>
                          <Select
                            value={formData.pricing_dimension || ''}
                            onValueChange={(value) => setFormData({ ...formData, pricing_dimension: value })}
                            disabled={formData.has_hex_color} // Rule 5: locked to 'color' when has_hex_color
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar dimensão..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="color">Cor</SelectItem>
                              <SelectItem value="size">Tamanho</SelectItem>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="finish">Acabamento</SelectItem>
                              <SelectItem value="weight">Peso</SelectItem>
                              <SelectItem value="other">Outra</SelectItem>
                            </SelectContent>
                          </Select>
                          {formData.has_hex_color && (
                            <p className="text-xs text-muted-foreground">Bloqueado em "Cor" porque o atributo tem cores hex.</p>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground italic">
                          Configure opções e preços detalhados no botão "Configurar Opções" na tabela após guardar.
                        </p>
                      </>
                    )}
                  </div>
                )}

                <OrganizationFormSection
                  value={organizationSelection}
                  onChange={setOrganizationSelection}
                  showBusinessUnit={true}
                  showDepartment={true}
                  showSecondaryCompanies={false}
                  multiSelectCompanies={true}
                  activeOrganizationOnly
                />
                  </div>
                </ScrollArea>
                <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    {t('productAttributes.form.cancel')}
                  </Button>
                  <Button type="submit">{editingAttribute ? t('productAttributes.form.update') : t('productAttributes.form.create')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('productAttributes.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <OrganizationFilters
            companyFilter={filterCompanyId}
            onCompanyFilterChange={setFilterCompanyId}
            tenantFilter={filterTenantId}
            onTenantFilterChange={setFilterTenantId}
            showStatusFilter={false}
          />
        </div>

        <BulkActionsBar
          selectedCount={bulkActions.selectedIds.size}
          onStatusClick={() => {}}
          onDeleteClick={() => bulkActions.setBulkDeleteDialogOpen(true)}
          onOrgClick={() => bulkActions.setBulkOrgDialogOpen(true)}
          onClearSelection={bulkActions.clearSelection}
          showOrgAction={true}
          statusPermission="product_attributes.edit"
          deletePermission="product_attributes.delete"
        />

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={bulkActions.selectedIds.size === allIds.length && allIds.length > 0}
                      onCheckedChange={() => bulkActions.toggleSelectAll(allIds)}
                      aria-label={t('common.selectAll')}
                    />
                  </TableHead>
                  <TableHead>{t('productAttributes.table.code')}</TableHead>
                  <TableHead>{t('productAttributes.table.label')}</TableHead>
                  <TableHead>{t('productAttributes.table.type')}</TableHead>
                  <TableHead>{t('productAttributes.table.unit')}</TableHead>
                  <TableHead>{t('productAttributes.table.filterable')}</TableHead>
                  <TableHead>{t('productAttributes.table.required')}</TableHead>
                  <TableHead>{t('productAttributes.table.variant')}</TableHead>
                  <TableHead className="text-right">{t('productAttributes.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttributes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t('productAttributes.noAttributes')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAttributes.map((attr) => (
                    <TableRow key={attr.id}>
                      <TableCell>
                        <Checkbox
                          checked={bulkActions.selectedIds.has(attr.id)}
                          onCheckedChange={() => bulkActions.toggleSelectOne(attr.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">
                        {attr.code}
                      </TableCell>
                      <TableCell>{attr.label}</TableCell>
                      <TableCell>
                        <Badge variant={getTypeColor(attr.value_type)}>
                          {getTypeLabel(attr.value_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>{attr.unit || "-"}</TableCell>
                      <TableCell>
                        {attr.is_filterable ? (
                          <Badge variant="default">{t('productAttributes.yes')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('productAttributes.no')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {attr.is_required ? (
                          <Badge variant="default">{t('productAttributes.yes')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('productAttributes.no')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {attr.is_variant_option ? (
                          <Badge variant="default">{t('productAttributes.yes')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('productAttributes.no')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {(attr.value_type === 'list' || (attr.pricing_type && attr.pricing_type !== 'none')) && (
                            <PermissionGate permission="product_attributes.edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Configurar Opções"
                                onClick={() => {
                                  setPalettesAttribute(attr);
                                  setPalettesDialogOpen(true);
                                }}
                              >
                                <Settings2 className="w-4 h-4" />
                              </Button>
                            </PermissionGate>
                          )}
                          <PermissionGate permission="product_attributes.create">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Duplicar"
                              onClick={() => handleDuplicate(attr)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="product_attributes.edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => openEditDialog(attr)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate permission="product_attributes.delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(attr.id)}
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

      <BulkDeleteDialog
        open={bulkActions.bulkDeleteDialogOpen}
        onOpenChange={bulkActions.setBulkDeleteDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        onConfirm={bulkActions.handleBulkDelete}
        processing={bulkActions.processing}
      />

      <BulkOrgDialog
        open={bulkActions.bulkOrgDialogOpen}
        onOpenChange={bulkActions.setBulkOrgDialogOpen}
        selectedCount={bulkActions.selectedIds.size}
        companyId={bulkActions.bulkNewCompanyId}
        onCompanyChange={bulkActions.setBulkNewCompanyId}
        onConfirm={() => bulkActions.handleBulkCompanyChange("organization_id")}
        processing={bulkActions.processing}
        companies={[]}
      />

      {palettesAttribute && (
        <AttributeOptionPalettesDialog
          open={palettesDialogOpen}
          onOpenChange={setPalettesDialogOpen}
          attributeId={palettesAttribute.id}
          attributeLabel={palettesAttribute.label}
          globalAllowedValues={palettesAttribute.allowed_values || []}
          pricingType={palettesAttribute.pricing_type || 'none'}
          hasHexColor={palettesAttribute.has_hex_color || false}
          valueType={palettesAttribute.value_type}
        />
      )}

      {/* Delete confirmation AlertDialog — replaces window.confirm */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('productAttributes.toast.deleteConfirm') || "Eliminar atributo?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('productAttributes.deleteConfirmDesc') || "Esta ação não pode ser desfeita. Os valores deste atributo em produtos existentes serão removidos."}
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

      {/* Valorization-type change confirmation AlertDialog — replaces window.confirm in handleSubmit */}
      <AlertDialog
        open={valorizationConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            valorizationResolveRef.current?.(false);
            valorizationResolveRef.current = null;
            setValorizationConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('productAttributes.valorizationChangeTitle') || "Alterar tipo de valorização?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('productAttributes.valorizationChangeDesc', { count: valorizationConfirm?.count ?? 0 }) ||
                `Este atributo está atribuído a ${valorizationConfirm?.count ?? 0} produto(s). A alteração do tipo de valorização irá invalidar os preços calculados. Confirmar e recalcular automaticamente?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              valorizationResolveRef.current?.(false);
              valorizationResolveRef.current = null;
              setValorizationConfirm(null);
            }}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              valorizationResolveRef.current?.(true);
              valorizationResolveRef.current = null;
              setValorizationConfirm(null);
            }}>
              {t('common.confirm') || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
