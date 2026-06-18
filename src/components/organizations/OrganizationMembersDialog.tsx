import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Trash2, Crown, User, Plus, Pencil, Eye, EyeOff, MapPin, FileText, KeyRound } from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { UserCombobox } from "@/components/users/UserCombobox";
import { MemberEditDialog } from "./MemberEditDialog";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Member {
  id: string;
  user_id: string;
  relationship_type: string;
  role_id: string | null;
  role_name?: string | null;
  role_code?: string | null;
  profile: {
    id: string;
    name: string;
    email: string;
  };
}

interface AnewUser {
  id: string;
  name: string;
  email: string;
}

interface OrganizationMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  onMembersChanged?: () => void;
}

export function OrganizationMembersDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  onMembersChanged,
}: OrganizationMembersDialogProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("organizations.manage");
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<AnewUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Add member form
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMode, setAddMode] = useState<"select" | "create">("select");
  const [memberForm, setMemberForm] = useState({
    user_id: "",
    relationship_type: "BELONGS_TO",
    role_id: "",
  });
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string; code: string }[]>([]);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    nif: "",
    nif_country: "PT",
  });
  const [newUserAddresses, setNewUserAddresses] = useState<Array<{
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
  }>>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

  // Edit member
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);

  useEffect(() => {
    if (open && organizationId) {
      fetchCurrentUser();
      fetchMembers();
      fetchAllUsers();
      fetchRoles();
      // Automatically show add form when opening dialog
      setIsAddingMember(true);
    } else {
      // Reset when closing
      resetForm();
    }
  }, [open, organizationId]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const fetchMembers = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("anew_memberships")
      .select(`
        id,
        user_id,
        relationship_type,
        role_id,
        profile:anew_users!anew_memberships_user_id_anew_fkey(id, name, email)
      `)
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (!error && data) {
      const roleIds = [...new Set((data || []).map((m: any) => m.role_id).filter(Boolean))];
      let rolesMap: Record<string, { name: string; code: string }> = {};
      if (roleIds.length > 0) {
        const { data: roles } = await (supabase as any)
          .from("anew_roles")
          .select("id, name, code")
          .in("id", roleIds);
        rolesMap = Object.fromEntries((roles || []).map((r: any) => [r.id, { name: r.name, code: r.code }]));
      }
      setMembers((data || []).map((m: any) => ({
        ...m,
        role_name: rolesMap[m.role_id]?.name || null,
        role_code: rolesMap[m.role_id]?.code || null,
      })) as Member[]);
    }
    setLoading(false);
  };

  const fetchRoles = async () => {
    const { data } = await (supabase as any)
      .from("anew_roles")
      .select("id, name, code")
      .eq("organization_id", organizationId)
      .order("name");
    const roles = (data || []) as { id: string; name: string; code: string }[];
    setAvailableRoles(roles);
    const defaultRole = roles.find((r) => r.code === "org_viewer") || roles[0];
    if (defaultRole) setMemberForm((prev) => ({ ...prev, role_id: prev.role_id || defaultRole.id }));
  };

  const fetchAllUsers = async () => {
    const { data } = await (supabase as any)
      .from("anew_users")
      .select("id, name, email")
      .eq("status", "active")
      .order("name");

    if (data) setAllUsers(data);
  };

  const handleAddExistingMember = async () => {
    if (!memberForm.user_id) {
      toast.error(t("common.required"));
      return;
    }

    // Check if user already has this relationship type with the organization
    const existingMember = members.find(
      m => m.user_id === memberForm.user_id && m.relationship_type === memberForm.relationship_type
    );

    if (existingMember) {
      toast.error(t("organizations.memberAlreadyExists"));
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const createdBy = await resolveBusinessUserId(userData.user?.id);
    if (!createdBy) {
      toast.error("Não foi possível resolver o utilizador de negócio do operador.");
      return;
    }

    const selectedRoleId = memberForm.role_id || availableRoles.find((r) => r.code === "org_viewer")?.id || availableRoles[0]?.id;
    if (!selectedRoleId) {
      toast.error("É obrigatório selecionar uma role.");
      return;
    }

    // Validate hierarchy — block if user has a higher role in a parent org
    const { validateMembershipHierarchy } = await import("@/utils/validateMembershipHierarchy");
    const validation = await validateMembershipHierarchy(memberForm.user_id, organizationId, selectedRoleId);
    if (!validation.allowed) {
      toast.error(validation.reason || "Não é permitido atribuir um cargo inferior ao que o utilizador já possui numa organização superior.");
      return;
    }

    const { error } = await (supabase as any).from("anew_memberships").insert({
      user_id: memberForm.user_id,
      organization_id: organizationId,
      relationship_type: memberForm.relationship_type,
      role_id: selectedRoleId,
      status: "active",
      created_by: createdBy,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error(t("organizations.memberAlreadyExists"));
        return;
      }
      toast.error(error.message);
      return;
    }

    toast.success(t("common.created"));
    resetForm();
    fetchMembers();
    onMembersChanged?.();
  };

  const handleCreateAndAddMember = async () => {
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      toast.error(t("common.required"));
      return;
    }

    const selectedRoleId = memberForm.role_id || availableRoles.find((r) => r.code === "org_viewer")?.id || availableRoles[0]?.id;
    if (!selectedRoleId) {
      toast.error("É obrigatório selecionar uma role.");
      return;
    }

    if (newUserForm.password.length < 6) {
      toast.error(t("users.passwordTooShort"));
      return;
    }

    setIsCreatingUser(true);

    try {
      // Use the create-user edge function to create auth user + anew_users + membership
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUserForm.email,
          password: newUserForm.password,
          name: newUserForm.name,
          phone: newUserForm.phone || null,
          status: "active",
          // Include membership to create at the same time
          membership: {
            organization_id: organizationId,
            relationship_type: memberForm.relationship_type,
            role_id: selectedRoleId,
          },
          // Include fiscal data if provided
          fiscal: newUserForm.nif ? {
            nif: newUserForm.nif,
            country_code: newUserForm.nif_country,
          } : null,
          // Include addresses if any
          addresses: newUserAddresses.length > 0 ? newUserAddresses : null,
        },
      });

      if (error) {
        toast.error(error.message || t("common.error"));
        setIsCreatingUser(false);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        setIsCreatingUser(false);
        return;
      }

      toast.success(t("users.created"));
      setIsCreatingUser(false);
      resetForm();
      fetchMembers();
      fetchAllUsers();
      onMembersChanged?.();
    } catch (err: any) {
      toast.error(err.message || t("common.error"));
      setIsCreatingUser(false);
    }
  };

  // Address management for new user creation
  const addNewUserAddress = () => {
    setNewUserAddresses([
      ...newUserAddresses,
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
        is_primary: newUserAddresses.length === 0,
      },
    ]);
  };

  const updateNewUserAddress = (index: number, field: string, value: string | boolean) => {
    const updated = [...newUserAddresses];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "is_primary" && value === true) {
      updated.forEach((addr, i) => {
        if (i !== index) addr.is_primary = false;
      });
    }
    setNewUserAddresses(updated);
  };

  const removeNewUserAddress = (index: number) => {
    const updated = newUserAddresses.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some(a => a.is_primary)) {
      updated[0].is_primary = true;
    }
    setNewUserAddresses(updated);
  };

  const resetForm = () => {
    setIsAddingMember(false);
    setAddMode("select");
    setMemberForm({ user_id: "", relationship_type: "BELONGS_TO", role_id: availableRoles.find((r) => r.code === "org_viewer")?.id || availableRoles[0]?.id || "" });
    setNewUserForm({ name: "", email: "", phone: "", password: "", nif: "", nif_country: "PT" });
    setNewUserAddresses([]);
    setShowPassword(false);
  };

  const handleEditClick = (member: Member) => {
    setMemberToEdit(member);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (member: Member) => {
    setMemberToDelete(member);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;

    const { error } = await (supabase as any)
      .from("anew_memberships")
      .delete()
      .eq("id", memberToDelete.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(t("common.deleted"));
    setDeleteDialogOpen(false);
    setMemberToDelete(null);
    fetchMembers();
    onMembersChanged?.();
  };

  // Filter out users already in the organization
  const availableUsers = allUsers.filter(
    (user) => !members.some((m) => m.user_id === user.id)
  );

  const getRelationshipIcon = (type: string) => {
    return type === "MANAGES" ? <Crown className="w-4 h-4 text-amber-500" /> : <User className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("organizations.members")} - {organizationName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add Member Button / Form */}
            {!isAddingMember && canManage ? (
              <Button onClick={() => setIsAddingMember(true)} size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                {t("organizations.addMember")}
              </Button>
            ) : (
              <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
                {/* Show parent organization context */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
                  <span>{t("organizations.addingMemberTo")}:</span>
                  <Badge variant="secondary" className="font-medium">{organizationName}</Badge>
                </div>
                <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "select" | "create")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="select">{t("organizations.members.selectExisting")}</TabsTrigger>
                    <TabsTrigger value="create">
                      <Plus className="w-4 h-4 mr-1" />
                      {t("organizations.members.createNew")}
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="select" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("common.user")} *</Label>
                        <UserCombobox
                          users={availableUsers}
                          value={memberForm.user_id}
                          onChange={(value) => setMemberForm((prev) => ({ ...prev, user_id: value }))}
                          placeholder={t("organizations.selectUser")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("users.role")} *</Label>
                        <Select value={memberForm.role_id} onValueChange={(value) => setMemberForm((prev) => ({ ...prev, role_id: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("users.selectRole")} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="create" className="space-y-4 mt-4 max-h-[50vh] overflow-y-auto pr-2">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t("common.name")} *</Label>
                        <Input
                          value={newUserForm.name}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder={t("users.namePlaceholder")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.email")} *</Label>
                        <Input
                          type="email"
                          value={newUserForm.email}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder={t("users.emailPlaceholder")}
                        />
                      </div>
                      <div className="space-y-2">
                        <PhoneInput
                          label={t("common.phone")}
                          phoneValue={newUserForm.phone.replace(/^\+\d+\s*/, '')}
                          countryCodeValue={newUserForm.phone.match(/^\+\d+/)?.[0] || '+351'}
                          onPhoneChange={(value) => {
                            const countryCode = newUserForm.phone.match(/^\+\d+/)?.[0] || '+351';
                            setNewUserForm((prev) => ({ ...prev, phone: `${countryCode} ${value}` }));
                          }}
                          onCountryCodeChange={(code) => {
                            const phoneNumber = newUserForm.phone.replace(/^\+\d+\s*/, '');
                            setNewUserForm((prev) => ({ ...prev, phone: `${code} ${phoneNumber}` }));
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Password */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-muted-foreground" />
                        {t("users.password")} *
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                          placeholder={t("users.passwordPlaceholder")}
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
                    </div>

                    {/* Fiscal Data */}
                    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {t("users.fiscal")}
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>{t("users.nif")}</Label>
                          <Input
                            value={newUserForm.nif}
                            onChange={(e) => setNewUserForm((prev) => ({ ...prev, nif: e.target.value }))}
                            placeholder="123456789"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("users.country")}</Label>
                          <Select
                            value={newUserForm.nif_country}
                            onValueChange={(v) => setNewUserForm((prev) => ({ ...prev, nif_country: v }))}
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
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          {t("users.addresses")}
                        </h4>
                        <Button variant="outline" size="sm" onClick={addNewUserAddress}>
                          <Plus className="w-4 h-4 mr-1" />
                          {t("common.add")}
                        </Button>
                      </div>

                      {newUserAddresses.length === 0 ? (
                        <div className="text-center py-4 border rounded-lg bg-muted/30">
                          <MapPin className="w-6 h-6 mx-auto text-muted-foreground/50 mb-1" />
                          <p className="text-xs text-muted-foreground">
                            {t("users.noAddresses")}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {newUserAddresses.map((address, index) => (
                            <div key={index} className="p-3 border rounded-lg bg-card space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={address.address_type}
                                    onValueChange={(v) => updateNewUserAddress(index, "address_type", v)}
                                  >
                                    <SelectTrigger className="w-24 h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="home">{t("users.addressHome")}</SelectItem>
                                      <SelectItem value="work">{t("users.addressWork")}</SelectItem>
                                      <SelectItem value="other">{t("users.addressOther")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <div className="flex items-center gap-1">
                                    <Switch
                                      checked={address.is_primary}
                                      onCheckedChange={(v) => updateNewUserAddress(index, "is_primary", v)}
                                    />
                                    <Label className="text-xs">{t("users.primaryAddress")}</Label>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => removeNewUserAddress(index)}
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-4 gap-2">
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">{t("addresses.street")}</Label>
                                  <Input
                                    value={address.street}
                                    onChange={(e) => updateNewUserAddress(index, "street", e.target.value)}
                                    placeholder={t("addresses.streetPlaceholder")}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("addresses.number")}</Label>
                                  <Input
                                    value={address.number}
                                    onChange={(e) => updateNewUserAddress(index, "number", e.target.value)}
                                    placeholder="123"
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("addresses.postalCode")}</Label>
                                  <Input
                                    value={address.postal_code}
                                    onChange={(e) => updateNewUserAddress(index, "postal_code", e.target.value)}
                                    placeholder="1000-001"
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("addresses.floor")}</Label>
                                  <Input
                                    value={address.floor}
                                    onChange={(e) => updateNewUserAddress(index, "floor", e.target.value)}
                                    placeholder="2º"
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("addresses.unit")}</Label>
                                  <Input
                                    value={address.unit}
                                    onChange={(e) => updateNewUserAddress(index, "unit", e.target.value)}
                                    placeholder="Esq"
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">{t("addresses.city")}</Label>
                                  <Input
                                    value={address.city}
                                    onChange={(e) => updateNewUserAddress(index, "city", e.target.value)}
                                    placeholder={t("addresses.cityPlaceholder")}
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
                
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    {t("common.cancel")}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={addMode === "select" ? handleAddExistingMember : handleCreateAndAddMember}
                    disabled={isCreatingUser}
                  >
                    {isCreatingUser ? t("common.loading") : t("common.add")}
                  </Button>
                </div>
              </div>
            )}

            {/* Members Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.email")}</TableHead>
                    <TableHead>{t("organizations.relationshipType")}</TableHead>
                    <TableHead>{t("users.role")}</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {t("common.loading")}
                      </TableCell>
                    </TableRow>
                  ) : members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {t("organizations.noMembers")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => {
                      const isCurrentUser = member.profile?.id === currentUserId;
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getRelationshipIcon(member.relationship_type)}
                              {member.profile?.name || member.user_id}
                              {isCurrentUser && (
                                <Badge variant="secondary" className="text-xs">
                                  {t("common.you")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.profile?.email || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {member.relationship_type === "MANAGES" 
                                ? t("organizations.manages") 
                                : t("organizations.belongsTo")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{member.role_name || member.role_code || "-"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {canManage && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditClick(member)}
                                    title={t("common.edit")}
                                    className="h-8 w-8"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteClick(member)}
                                    disabled={isCurrentUser}
                                    title={isCurrentUser ? t("organizations.cannotDeleteSelf") : t("common.delete")}
                                    className={`h-8 w-8 ${isCurrentUser ? "opacity-50 cursor-not-allowed" : "text-destructive hover:text-destructive"}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
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
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("organizations.removeMember.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToDelete && t("organizations.removeMember.description", { 
                name: memberToDelete.profile?.name || memberToDelete.user_id 
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToDelete(null)}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Member Dialog */}
      <MemberEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        memberId={memberToEdit?.id || ""}
        userId={memberToEdit?.user_id || ""}
        membershipType={memberToEdit?.relationship_type || "BELONGS_TO"}
        membershipRole={memberToEdit?.role_name || memberToEdit?.role_code || ""}
        organizationName={organizationName}
        onSaved={() => {
          fetchMembers();
          onMembersChanged?.();
        }}
      />
    </>
  );
}
