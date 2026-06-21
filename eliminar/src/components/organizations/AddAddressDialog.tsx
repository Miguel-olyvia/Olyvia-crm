import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onSuccess?: () => void;
}

export function AddAddressDialog({ open, onOpenChange, orgId, onSuccess }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    street: "",
    number: "",
    floor: "",
    unit: "",
    postal_code: "",
    city: "",
    district: "",
    country: "PT",
    extra: "",
    is_fiscal: false,
  });

  const resetForm = () => {
    setForm({
      street: "",
      number: "",
      floor: "",
      unit: "",
      postal_code: "",
      city: "",
      district: "",
      country: "PT",
      extra: "",
      is_fiscal: false,
    });
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleAddAddress = async () => {
    if (!form.street || !form.number || !form.postal_code || !form.city) {
      toast.error(t("common.required"));
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const businessUserId = await resolveBusinessUserId(userData.user?.id);

    const { data, error } = await (supabase as any).rpc("assign_address_to_org", {
      p_org_id: orgId,
      p_street: form.street,
      p_number: form.number,
      p_floor: form.floor || null,
      p_unit: form.unit || null,
      p_postal_code: form.postal_code,
      p_city: form.city,
      p_district: form.district || null,
      p_country: form.country || "PT",
      p_extra: form.extra || null,
      p_is_fiscal: form.is_fiscal,
      p_created_by: businessUserId,
    });

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success(t("common.created"));
    setSaving(false);
    resetForm();
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addresses.add")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>{t("addresses.street")} *</Label>
              <Input
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                placeholder={t("addresses.streetPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("addresses.number")} *</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                placeholder="10B"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("addresses.floor")}</Label>
              <Input
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value })}
                placeholder="3º"
              />
            </div>
            <div>
              <Label>{t("addresses.unit")}</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="Esq."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("addresses.postalCode")} *</Label>
              <Input
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                placeholder="1000-001"
              />
            </div>
            <div>
              <Label>{t("addresses.city")} *</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Lisboa"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("addresses.district")}</Label>
              <Input
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                placeholder={t("addresses.districtPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("addresses.country")}</Label>
              <Input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="PT"
              />
            </div>
          </div>

          <div>
            <Label>{t("addresses.extra")}</Label>
            <Textarea
              value={form.extra}
              onChange={(e) => setForm({ ...form, extra: e.target.value })}
              placeholder={t("addresses.extraPlaceholder")}
              rows={2}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("addresses.isFiscal")}</Label>
              <p className="text-xs text-muted-foreground">{t("addresses.isFiscalDescription")}</p>
            </div>
            <Switch
              checked={form.is_fiscal}
              onCheckedChange={(checked) => setForm({ ...form, is_fiscal: checked })}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={handleCancel}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAddAddress} disabled={saving}>
              <Check className="w-4 h-4 mr-2" />
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
