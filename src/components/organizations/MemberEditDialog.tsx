import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Mail,
  MapPin,
  FileText,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Trash2,
  Building2,
  Loader2,
  Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { PhoneInput } from "@/components/PhoneInput";

interface MemberEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  userId: string;
  membershipType: string;
  membershipRole: string;
  organizationName: string;
  onSaved?: () => void;
}

interface AddressData {
  id?: string;
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
  district: string;
  country: string;
  extra: string;
  address_type: string;
  is_primary: boolean;
}

interface FiscalData {
  id?: string;
  nif: string;
  commercial_name: string;
  country_code: string;
}

export function MemberEditDialog({
  open,
  onOpenChange,
  memberId,
  userId,
  membershipType,
  membershipRole,
  organizationName,
  onSaved,
}: MemberEditDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("organizations.manage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [showPassword, setShowPassword] = useState(false);

  // User data
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "active",
  });

  // Membership data
  const [relationshipType, setRelationshipType] = useState(membershipType);
  const [role, setRole] = useState(membershipRole);

  // Fiscal data
  const [fiscalData, setFiscalData] = useState<FiscalData>({
    nif: "",
    commercial_name: "",
    country_code: "PT",
  });

  // Addresses
  const [addresses, setAddresses] = useState<AddressData[]>([]);

  useEffect(() => {
    if (open && userId) {
      fetchUserData();
      setRelationshipType(membershipType);
      setRole(membershipRole);
    }
  }, [open, userId, membershipType, membershipRole]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      // Fetch user basic info
      const { data: userData, error: userError } = await (supabase as any)
        .from("anew_users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      if (userData) {
        setFormData({
          name: userData.name || "",
          email: userData.email || "",
          phone: userData.phone || "",
          password: "",
          status: userData.status || "active",
        });
      }

      // Fetch fiscal entity via unified table
      const entityId = userData?.entity_id;
      const { data: fiscalLink } = entityId ? await (supabase as any)
        .from("anew_entity_fiscal_entities")
        .select(`
          id,
          fiscal_entity:fiscal_entities(id, nif, commercial_name, country_code)
        `)
        .eq("entity_id", entityId)
        .eq("is_primary", true)
        .maybeSingle() : { data: null };

      if (fiscalLink?.fiscal_entity) {
        setFiscalData({
          id: fiscalLink.fiscal_entity.id,
          nif: fiscalLink.fiscal_entity.nif || "",
          commercial_name: fiscalLink.fiscal_entity.commercial_name || "",
          country_code: fiscalLink.fiscal_entity.country_code || "PT",
        });
      } else {
        setFiscalData({ nif: "", commercial_name: "", country_code: "PT" });
      }

      // Fetch addresses
      const { data: addressLinks } = entityId ? await (supabase as any)
        .from("anew_entity_addresses")
        .select(`
          id,
          address_type,
          is_primary,
          address:anew_addresses!anew_entity_addresses_address_id_fkey(*)
        `)
        .eq("entity_id", entityId) : { data: [] };

      if (addressLinks && addressLinks.length > 0) {
        const mappedAddresses: AddressData[] = addressLinks.map((link: any) => ({
          id: link.address?.id,
          street: link.address?.street || "",
          number: link.address?.number || "",
          floor: link.address?.floor || "",
          unit: link.address?.unit || "",
          postal_code: link.address?.postal_code || "",
          city: link.address?.city || "",
          district: link.address?.district || "",
          country: link.address?.country || "PT",
          extra: link.address?.extra || "",
          address_type: link.address_type || "home",
          is_primary: link.is_primary || false,
        }));
        setAddresses(mappedAddresses);
      } else {
        setAddresses([]);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.email) {
      toast.error(t("common.required"));
      return;
    }

    setSaving(true);
    try {
      // Update anew_users
      const { error: userError } = await (supabase as any)
        .from("anew_users")
        .update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          status: formData.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (userError) throw userError;

      // Update membership
      const { error: memberError } = await (supabase as any)
        .from("anew_memberships")
        .update({
          relationship_type: relationshipType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", memberId);

      if (memberError) throw memberError;

      // Handle password update if provided
      if (formData.password) {
        // Get auth_user_id from anew_users
        const { data: userData } = await (supabase as any)
          .from("anew_users")
          .select("auth_user_id")
          .eq("id", userId)
          .single();

        if (userData?.auth_user_id) {
          const { error: pwError } = await supabase.functions.invoke("update-user-password", {
            body: { targetUserId: userData.auth_user_id, newPassword: formData.password },
          });
          if (pwError) {
            console.error("Password update error:", pwError);
            toast.error(t("users.passwordUpdateError"));
          }
        }
      }

      // Handle fiscal data
      if (fiscalData.nif) {
        const { data: existingFiscal } = await (supabase as any)
          .from("fiscal_entities")
          .select("id")
          .eq("nif", fiscalData.nif)
          .maybeSingle();

        let fiscalEntityId = existingFiscal?.id;

        if (!fiscalEntityId) {
          // Create new fiscal entity
          const { data: newFiscal, error: fiscalError } = await (supabase as any)
            .from("fiscal_entities")
            .insert({
              nif: fiscalData.nif,
              commercial_name: fiscalData.commercial_name || null,
              country_code: fiscalData.country_code,
            })
            .select()
            .single();

          if (fiscalError) throw fiscalError;
          fiscalEntityId = newFiscal.id;
        }

        // Link to entity via unified table
        const { data: userForEntity } = await (supabase as any)
          .from("anew_users")
          .select("entity_id")
          .eq("id", userId)
          .single();
        const entityIdForFiscal = userForEntity?.entity_id;

        if (entityIdForFiscal) {
          const { data: existingLink } = await (supabase as any)
            .from("anew_entity_fiscal_entities")
            .select("id")
            .eq("entity_id", entityIdForFiscal)
            .eq("is_primary", true)
            .maybeSingle();

          if (existingLink) {
            await (supabase as any)
              .from("anew_entity_fiscal_entities")
              .update({ fiscal_entity_id: fiscalEntityId })
              .eq("id", existingLink.id);
          } else {
            await (supabase as any)
              .from("anew_entity_fiscal_entities")
              .insert({
                entity_id: entityIdForFiscal,
                fiscal_entity_id: fiscalEntityId,
                is_primary: true,
              });
          }
        }
      }

      toast.success(t("common.updated"));
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  // Address functions
  const addAddress = () => {
    setAddresses([
      ...addresses,
      {
        street: "",
        number: "",
        floor: "",
        unit: "",
        postal_code: "",
        city: "",
        district: "",
        country: "PT",
        extra: "",
        address_type: "home",
        is_primary: addresses.length === 0,
      },
    ]);
  };

  const updateAddress = (index: number, field: string, value: string | boolean) => {
    const updated = [...addresses];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "is_primary" && value === true) {
      updated.forEach((addr, i) => {
        if (i !== index) addr.is_primary = false;
      });
    }
    setAddresses(updated);
  };

  const removeAddress = (index: number) => {
    const updated = addresses.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((a) => a.is_primary)) {
      updated[0].is_primary = true;
    }
    setAddresses(updated);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[90vw] sm:w-[850px] lg:w-[900px] max-w-[900px] overflow-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Pencil className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="block">{t("organizations.editMember")}</span>
              <span className="block text-sm font-normal text-muted-foreground">
                {formData.name || t("common.loading")}
              </span>
            </div>
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">
                  <User className="w-4 h-4 mr-2" />
                  {t("common.general")}
                </TabsTrigger>
                <TabsTrigger value="membership">
                  <Building2 className="w-4 h-4 mr-2" />
                  {t("organizations.membership")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {t("common.name")} *
                    </Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t("users.namePlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {t("common.status")}
                    </Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("common.active")}</SelectItem>
                        <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
                        <SelectItem value="pending">{t("common.pending")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      {t("common.email")} *
                    </Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={t("users.emailPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <PhoneInput
                      label={t("common.phone")}
                      phoneValue={formData.phone.replace(/^\+\d+\s*/, "")}
                      countryCodeValue={formData.phone.match(/^\+\d+/)?.[0] || "+351"}
                      onPhoneChange={(value) => {
                        const countryCode = formData.phone.match(/^\+\d+/)?.[0] || "+351";
                        setFormData({ ...formData, phone: `${countryCode} ${value}` });
                      }}
                      onCountryCodeChange={(code) => {
                        const phoneNumber = formData.phone.replace(/^\+\d+\s*/, "");
                        setFormData({ ...formData, phone: `${code} ${phoneNumber}` });
                      }}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    {t("users.password")}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={t("users.leaveEmptyToKeep")}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("users.passwordChangeHint")}</p>
                </div>

                {/* Fiscal Data */}
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t("users.fiscal")}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>{t("users.nif")}</Label>
                      <Input
                        value={fiscalData.nif}
                        onChange={(e) => setFiscalData({ ...fiscalData, nif: e.target.value })}
                        placeholder="123456789"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("users.country")}</Label>
                      <Select
                        value={fiscalData.country_code}
                        onValueChange={(v) => setFiscalData({ ...fiscalData, country_code: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PT">Portugal</SelectItem>
                          <SelectItem value="ES">Espanha</SelectItem>
                          <SelectItem value="FR">França</SelectItem>
                          <SelectItem value="DE">Alemanha</SelectItem>
                          <SelectItem value="UK">Reino Unido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Addresses */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {t("users.addresses")}
                    </h3>
                    <Button variant="outline" size="sm" onClick={addAddress}>
                      <Plus className="w-4 h-4 mr-1" />
                      {t("common.add")}
                    </Button>
                  </div>

                  {addresses.length === 0 ? (
                    <div className="text-center py-4 border rounded-lg bg-muted/30">
                      <MapPin className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">{t("users.noAddresses")}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {addresses.map((address, index) => (
                        <div key={index} className="p-3 border rounded-lg bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Select
                                value={address.address_type}
                                onValueChange={(v) => updateAddress(index, "address_type", v)}
                              >
                                <SelectTrigger className="w-24 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="home">{t("users.addressHome")}</SelectItem>
                                  <SelectItem value="work">{t("users.addressWork")}</SelectItem>
                                  <SelectItem value="other">{t("users.addressOther")}</SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={address.is_primary}
                                  onCheckedChange={(v) => updateAddress(index, "is_primary", v)}
                                />
                                <Label className="text-xs">{t("users.primaryAddress")}</Label>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeAddress(index)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">{t("addresses.street")}</Label>
                              <Input
                                value={address.street}
                                onChange={(e) => updateAddress(index, "street", e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("addresses.number")}</Label>
                              <Input
                                value={address.number}
                                onChange={(e) => updateAddress(index, "number", e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("addresses.postalCode")}</Label>
                              <Input
                                value={address.postal_code}
                                onChange={(e) => updateAddress(index, "postal_code", e.target.value)}
                                className="h-8"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">{t("addresses.city")}</Label>
                              <Input
                                value={address.city}
                                onChange={(e) => updateAddress(index, "city", e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("addresses.district")}</Label>
                              <Input
                                value={address.district}
                                onChange={(e) => updateAddress(index, "district", e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("users.country")}</Label>
                              <Select
                                value={address.country}
                                onValueChange={(v) => updateAddress(index, "country", v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PT">Portugal</SelectItem>
                                  <SelectItem value="ES">Espanha</SelectItem>
                                  <SelectItem value="FR">França</SelectItem>
                                  <SelectItem value="DE">Alemanha</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="membership" className="space-y-4 mt-4">
                <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="w-4 h-4" />
                    <span>{t("organizations.memberOf")}:</span>
                    <span className="font-medium text-foreground">{organizationName}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t("organizations.relationshipType")}</Label>
                      <Select value={relationshipType} onValueChange={setRelationshipType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BELONGS_TO">{t("organizations.belongsTo")}</SelectItem>
                          <SelectItem value="MANAGES">{t("organizations.manages")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("organizations.role")}</Label>
                      <Input
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder={t("organizations.rolePlaceholder")}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              {canManage && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {t("common.save")}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
