import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Settings, ListPlus } from "lucide-react";
import BundleComponentsEditor from "./BundleComponentsEditor";
import BundleChoiceGroupsEditor from "./BundleChoiceGroupsEditor";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface Bundle {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  pricing_type: string;
  fixed_price: number | null;
  discount_percent: number | null;
  discount_fixed: number | null;
  is_active: boolean;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
}

const bundleSchema = z.object({
  sku: z.string().trim().min(1, "O SKU é obrigatório.").max(100, "O SKU deve ter menos de 100 caracteres."),
  name: z.string().trim().min(1, "O nome é obrigatório.").max(200, "O nome deve ter menos de 200 caracteres."),
  description: z.string().trim().max(2000, "A descrição deve ter menos de 2000 caracteres.").optional().or(z.literal("")),
  pricing_type: z.enum(["custom", "fixed_discount", "fixed_price", "percentage_discount"]),
  status: z.enum(["draft", "active", "discontinued"]),
  fixed_price: z.number().min(0, "O preço fixo deve ser positivo.").optional().nullable(),
  discount_percent: z.number().min(0, "O desconto deve ser pelo menos 0.").max(100, "O desconto deve ser no máximo 100.").optional().nullable(),
  discount_fixed: z.number().min(0, "O desconto fixo deve ser positivo.").optional().nullable(),
  valid_from: z.string().optional().or(z.literal("")),
  valid_to: z.string().optional().or(z.literal("")),
}).refine((data) => !data.valid_from || !data.valid_to || data.valid_to >= data.valid_from, {
  message: "A data de fim de validade deve ser posterior à data de início.",
  path: ["valid_to"],
});

interface BundleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: Bundle | null;
  onSuccess: () => void;
}

export default function BundleFormDialog({ open, onOpenChange, bundle, onSuccess }: BundleFormDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    pricing_type: "custom",
    fixed_price: "",
    discount_percent: "",
    discount_fixed: "",
    status: "draft",
    valid_from: "",
    valid_to: "",
  });

  useEffect(() => {
    if (bundle) {
      setFormData({
        sku: bundle.sku || "",
        name: bundle.name || "",
        description: bundle.description || "",
        pricing_type: bundle.pricing_type || "custom",
        fixed_price: bundle.fixed_price?.toString() || "",
        discount_percent: bundle.discount_percent?.toString() || "",
        discount_fixed: bundle.discount_fixed?.toString() || "",
        status: bundle.status || "draft",
        valid_from: bundle.valid_from?.split("T")[0] || "",
        valid_to: bundle.valid_to?.split("T")[0] || "",
      });
      setBundleId(bundle.id);
    } else {
      setFormData({
        sku: "",
        name: "",
        description: "",
        pricing_type: "custom",
        fixed_price: "",
        discount_percent: "",
        discount_fixed: "",
        status: "draft",
        valid_from: "",
        valid_to: "",
      });
      setBundleId(null);
    }
    setActiveTab("details");
    setFieldErrors({});
  }, [bundle, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = bundleSchema.safeParse({
      sku: formData.sku,
      name: formData.name,
      description: formData.description,
      pricing_type: formData.pricing_type,
      status: formData.status,
      fixed_price: formData.pricing_type === 'fixed_price' ? (parseFloat(formData.fixed_price) || null) : null,
      discount_percent: formData.pricing_type === 'percentage_discount' ? (parseFloat(formData.discount_percent) || null) : null,
      discount_fixed: formData.pricing_type === 'fixed_discount' ? (parseFloat(formData.discount_fixed) || null) : null,
      valid_from: formData.valid_from,
      valid_to: formData.valid_to,
    });

    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) errors[error.path[0].toString()] = error.message;
      });
      setFieldErrors(errors);
      const firstError = validation.error.errors[0];
      toast({
        title: t('common.error'),
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    if (!activeCompany?.id) {
      toast({
        title: t('common.error'),
        description: t('bundles.form.noCompany'),
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado");

      const pricingType = formData.pricing_type as "custom" | "fixed_discount" | "fixed_price" | "percentage_discount";

      const fixedPrice = formData.pricing_type === 'fixed_price' ? parseFloat(formData.fixed_price) || null : null;
      const discountPercent = formData.pricing_type === 'percentage_discount' ? parseFloat(formData.discount_percent) || null : null;
      const discountFixed = formData.pricing_type === 'fixed_discount' ? parseFloat(formData.discount_fixed) || null : null;
      const description = formData.description.trim() || null;
      const validFrom = formData.valid_from || null;
      const validTo = formData.valid_to || null;

      if (bundleId) {
        const { error } = await withAuditContext(supabase, businessUserId, () =>
          supabase.rpc("rpc_update_bundle", {
            p_id: bundleId,
            p_organization_id: activeCompany.id,
            p_sku: formData.sku.trim(),
            p_name: formData.name.trim(),
            p_description: description,
            p_pricing_type: pricingType,
            p_fixed_price: fixedPrice,
            p_discount_percent: discountPercent,
            p_discount_fixed: discountFixed,
            p_status: formData.status,
            p_valid_from: validFrom,
            p_valid_to: validTo,
          })
        );

        if (error) throw error;

        toast({
          title: t('bundles.toast.updated'),
          description: t('bundles.toast.updatedDescription'),
        });
      } else {
        const { data, error } = await withAuditContext(supabase, businessUserId, () =>
          supabase.rpc("rpc_create_bundle", {
            p_organization_id: activeCompany.id,
            p_sku: formData.sku.trim(),
            p_name: formData.name.trim(),
            p_description: description,
            p_pricing_type: pricingType,
            p_fixed_price: fixedPrice,
            p_discount_percent: discountPercent,
            p_discount_fixed: discountFixed,
            p_status: formData.status,
            p_valid_from: validFrom,
            p_valid_to: validTo,
          })
        );

        if (error) throw error;
        if (!data) throw new Error("Falha ao criar bundle: resposta vazia");

        setBundleId(data.id);
        setActiveTab("components");

        toast({
          title: t('bundles.toast.created'),
          description: t('bundles.toast.createdDescription'),
        });
        return; // Don't close dialog, switch to components tab
      }

      onSuccess();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderPricingFields = () => {
    switch (formData.pricing_type) {
      case 'fixed_price':
        return (
          <div className="space-y-2">
            <Label htmlFor="fixed_price">{t('bundles.form.fixedPrice')}</Label>
            <Input
              id="fixed_price"
              type="number"
              step="0.01"
              min="0"
              value={formData.fixed_price}
              onChange={(e) => setFormData({ ...formData, fixed_price: e.target.value })}
              placeholder="0.00"
              className={fieldErrors.fixed_price ? "border-destructive" : ""}
            />
            {fieldErrors.fixed_price && <p className="text-sm text-destructive">{fieldErrors.fixed_price}</p>}
          </div>
        );
      case 'percentage_discount':
        return (
          <div className="space-y-2">
            <Label htmlFor="discount_percent">{t('bundles.form.discountPercent')}</Label>
            <Input
              id="discount_percent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.discount_percent}
              onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
              placeholder="10"
              className={fieldErrors.discount_percent ? "border-destructive" : ""}
            />
            {fieldErrors.discount_percent && <p className="text-sm text-destructive">{fieldErrors.discount_percent}</p>}
          </div>
        );
      case 'fixed_discount':
        return (
          <div className="space-y-2">
            <Label htmlFor="discount_fixed">{t('bundles.form.discountFixed')}</Label>
            <Input
              id="discount_fixed"
              type="number"
              step="0.01"
              min="0"
              value={formData.discount_fixed}
              onChange={(e) => setFormData({ ...formData, discount_fixed: e.target.value })}
              placeholder="5.00"
              className={fieldErrors.discount_fixed ? "border-destructive" : ""}
            />
            {fieldErrors.discount_fixed && <p className="text-sm text-destructive">{fieldErrors.discount_fixed}</p>}
          </div>
        );
      default:
        return (
          <p className="text-sm text-muted-foreground">
            {t('bundles.form.customPricingHint')}
          </p>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden min-h-0">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {bundle ? t('bundles.editBundle') : t('bundles.addBundle')}
          </DialogTitle>
          <DialogDescription>
            {bundle ? t('bundles.editDescription') : t('bundles.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {t('bundles.tabs.details')}
            </TabsTrigger>
            <TabsTrigger value="components" disabled={!bundleId} className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {t('bundles.tabs.components')}
            </TabsTrigger>
            <TabsTrigger value="choices" disabled={!bundleId} className="flex items-center gap-2">
              <ListPlus className="h-4 w-4" />
              {t('bundles.tabs.choices')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4 overflow-y-auto pr-4 pb-24">
            <TabsContent value="details" className="mt-0 space-y-4">
                <form id="bundle-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sku">{t('bundles.form.sku')} *</Label>
                      <Input
                        id="sku"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        placeholder="BUNDLE-001"
                        required
                        className={fieldErrors.sku ? "border-destructive" : ""}
                      />
                      {fieldErrors.sku && <p className="text-sm text-destructive">{fieldErrors.sku}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">{t('bundles.form.status')}</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">{t('bundles.status.draft')}</SelectItem>
                          <SelectItem value="active">{t('bundles.status.active')}</SelectItem>
                          <SelectItem value="discontinued">{t('bundles.status.discontinued')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">{t('bundles.form.name')} *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('bundles.form.namePlaceholder')}
                      required
                      className={fieldErrors.name ? "border-destructive" : ""}
                    />
                    {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('bundles.form.description')}</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={t('bundles.form.descriptionPlaceholder')}
                      rows={3}
                      className={fieldErrors.description ? "border-destructive" : ""}
                    />
                    {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-4">{t('bundles.form.pricingSection')}</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('bundles.form.pricingType')}</Label>
                        <Select
                          value={formData.pricing_type}
                          onValueChange={(value) => setFormData({ ...formData, pricing_type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">{t('bundles.pricing.custom')}</SelectItem>
                            <SelectItem value="fixed_price">{t('bundles.pricing.fixedPrice')}</SelectItem>
                            <SelectItem value="percentage_discount">{t('bundles.pricing.percentageDiscount')}</SelectItem>
                            <SelectItem value="fixed_discount">{t('bundles.pricing.fixedDiscount')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {renderPricingFields()}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-4">{t('bundles.form.validitySection')}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="valid_from">{t('bundles.form.validFrom')}</Label>
                        <Input
                          id="valid_from"
                          type="date"
                          value={formData.valid_from}
                          onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                          className={fieldErrors.valid_from ? "border-destructive" : ""}
                        />
                        {fieldErrors.valid_from && <p className="text-sm text-destructive">{fieldErrors.valid_from}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="valid_to">{t('bundles.form.validTo')}</Label>
                        <Input
                          id="valid_to"
                          type="date"
                          value={formData.valid_to}
                          onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                          className={fieldErrors.valid_to ? "border-destructive" : ""}
                        />
                        {fieldErrors.valid_to && <p className="text-sm text-destructive">{fieldErrors.valid_to}</p>}
                      </div>
                    </div>
                  </div>
                </form>
              </TabsContent>

            <TabsContent value="components" className="mt-0">
              {bundleId && <BundleComponentsEditor bundleId={bundleId} />}
            </TabsContent>

            <TabsContent value="choices" className="mt-0">
              {bundleId && <BundleChoiceGroupsEditor bundleId={bundleId} />}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="pt-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {activeTab === "details" && (
            <Button type="submit" form="bundle-form" disabled={loading}>
              {loading ? t('common.saving') : (bundle ? t('common.save') : t('bundles.form.createAndContinue'))}
            </Button>
          )}
          {activeTab !== "details" && bundleId && (
            <Button onClick={() => onSuccess()}>
              {t('common.done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
