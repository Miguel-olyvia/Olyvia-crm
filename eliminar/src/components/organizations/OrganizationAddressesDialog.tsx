import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { Plus, Trash2, MapPin, Building2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface OrgAddress {
  id: string;
  org_id: string;
  address_id: string;
  is_fiscal: boolean;
  valid_from: string;
  valid_to: string | null;
  address?: {
    id: string;
    street: string;
    number: string;
    floor: string | null;
    unit: string | null;
    postal_code: string;
    city: string;
    district: string | null;
    country: string;
    extra: string | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
}

export function OrganizationAddressesDialog({ open, onOpenChange, orgId, orgName }: Props) {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<OrgAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
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

  useEffect(() => {
    if (open && orgId) {
      fetchAddresses();
    }
  }, [open, orgId]);

  const fetchAddresses = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("anew_org_addresses")
      .select(`
        id,
        org_id,
        address_id,
        is_fiscal,
        valid_from,
        valid_to,
        address:anew_addresses!anew_org_addresses_address_id_fkey(
          id, street, number, floor, unit, postal_code, city, district, country, extra
        )
      `)
      .eq("org_id", orgId)
      .is("valid_to", null)
      .order("is_fiscal", { ascending: false });

    if (!error && data) {
      setAddresses(data);
    }
    setLoading(false);
  };

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

  const handleStartAdd = () => {
    resetForm();
    setAddDialogOpen(true);
  };

  const handleCancelAdd = () => {
    resetForm();
    setAddDialogOpen(false);
  };

  const handleAddAddress = async () => {
    if (!form.street || !form.number || !form.postal_code || !form.city) {
      toast.error(t("common.required"));
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const businessUserId = await resolveBusinessUserId(userData.user?.id);

    // Use the helper function to assign address
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
    setAddDialogOpen(false);
    fetchAddresses();
  };

  const handleDeleteClick = (id: string) => {
    setDeleteItemId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteItemId) return;

    // Instead of deleting, we close the link (set valid_to)
    const { error } = await (supabase as any)
      .from("anew_org_addresses")
      .update({ valid_to: new Date().toISOString() })
      .eq("id", deleteItemId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("common.deleted"));
      fetchAddresses();
    }

    setDeleteDialogOpen(false);
    setDeleteItemId(null);
  };

  const formatAddress = (addr: OrgAddress["address"]) => {
    if (!addr) return "-";
    const parts = [
      `${addr.street}, ${addr.number}`,
      addr.floor && `${t("addresses.floor")} ${addr.floor}`,
      addr.unit && `${t("addresses.unit")} ${addr.unit}`,
    ].filter(Boolean);
    
    const location = [
      addr.postal_code,
      addr.city,
      addr.district,
      addr.country,
    ].filter(Boolean).join(", ");

    return `${parts.join(" • ")} — ${location}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {t("addresses.title")} - {orgName}
            </DialogTitle>
          </DialogHeader>

          {/* LIST VIEW */}
          <div className="space-y-4">
            {/* Add Address Button */}
            <div className="flex justify-end">
              <Button onClick={handleStartAdd}>
                <Plus className="w-4 h-4 mr-2" />
                {t("addresses.add")}
              </Button>
            </div>

            {/* Address List */}
            {loading ? (
              <p className="text-center text-muted-foreground py-8">{t("common.loading")}</p>
            ) : addresses.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("addresses.noAddresses")}</p>
            ) : (
              <div className="space-y-3">
                {addresses.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {item.is_fiscal && (
                          <Badge variant="default" className="gap-1">
                            <Building2 className="w-3 h-3" />
                            {t("addresses.fiscal")}
                          </Badge>
                        )}
                        {!item.is_fiscal && (
                          <Badge variant="outline">{t("addresses.other")}</Badge>
                        )}
                      </div>
                      <p className="text-sm">{formatAddress(item.address)}</p>
                      {item.address?.extra && (
                        <p className="text-xs text-muted-foreground mt-1">{item.address.extra}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(item.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ADD ADDRESS DIALOG */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
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
              <Button variant="outline" onClick={handleCancelAdd}>
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

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("addresses.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
