import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { 
  X, UserPlus, User, Mail, Eye, EyeOff, KeyRound, MapPin, 
  FileText, Plus, Trash2, Loader2, Pencil, Wand2
} from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { UserCombobox } from "@/components/users/UserCombobox";
import { useCountries } from "@/hooks/useCountries";
import { useAdministrativeDivisions } from "@/hooks/useAdministrativeDivisions";
import { cn } from "@/lib/utils";
import { TemplateTabSelector } from "@/components/users/TemplateTabSelector";
import { FieldConfig } from "@/components/users/TemplateFieldsConfig";
import { UserFormEnhanced } from "@/components/users/UserFormEnhanced";
import { EmailEntry } from "@/components/users/MultiValueEmailInput";
import { PhoneEntry } from "@/components/users/MultiValuePhoneInput";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { NativeSelect } from "@/components/ui/native-select";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface AnewUser {
  id: string;
  name: string;
  email: string;
}

interface Member {
  id: string;
  user_id: string;
  relationship_type: string;
  role_id: string | null;
  profile: {
    id: string;
    name: string;
    email: string;
  };
}

interface Organization {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
}

interface MemberFormPanelProps {
  mode: "add" | "edit";
  organizationId: string;
  organizationName: string;
  member?: Member | null;
  existingMemberUserIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}

interface AddressData {
  id?: string;
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
  city_id?: string;
  district: string;
  district_id?: string;
  country: string;
  extra: string;
  address_type: string;
  is_primary: boolean;
}

export function MemberFormPanel({
  mode,
  organizationId,
  organizationName,
  member,
  existingMemberUserIds = [],
  onClose,
  onSaved,
}: MemberFormPanelProps) {
  const { t } = useTranslation();
  const { countries } = useCountries();
  const { anewRoleCode } = usePermissionScope();
  const [allUsers, setAllUsers] = useState<AnewUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState<"select" | "create">("select");
  const [showPassword, setShowPassword] = useState(false);
  const [createUserSheetOpen, setCreateUserSheetOpen] = useState(false);
  
  // Available roles for assignment (filtered by current user's role level)
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string; code: string }[]>([]);
  
  // Cascading address selectors
  const [expandedAddressIndex, setExpandedAddressIndex] = useState<number | null>(null);
  const [selectedDistrictIds, setSelectedDistrictIds] = useState<Record<number, string>>({});
  
  // Form for selecting existing user
  const [memberForm, setMemberForm] = useState({
    user_id: "",
    relationship_type: "BELONGS_TO",
    role_id: "",
  });
  
  // ========== NEW: State for UserFormEnhanced ==========
  const [allowedOrganizations, setAllowedOrganizations] = useState<Organization[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "active",
    description: "",
    position: "",
    location: "",
  });
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [socialLinks, setSocialLinks] = useState({ angellist: "", facebook: "", linkedin: "" });
  const [newUserMemberships, setNewUserMemberships] = useState<Array<{ organization_id: string; relationship_type: string; role_id: string }>>([
    { organization_id: organizationId, relationship_type: "BELONGS_TO", role_id: "" }
  ]);
  const [newUserAddresses, setNewUserAddresses] = useState<AddressData[]>([]);
  const [fiscalData, setFiscalData] = useState({ nif: "", commercial_name: "", country_code: "PT" });
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});
  const [savingNewUser, setSavingNewUser] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [formTemplateAttrKeys, setFormTemplateAttrKeys] = useState<string[]>([]);
  
  // Organizations for template selector (simplified - just need organization_id context)
  const [templateOrganizations, setTemplateOrganizations] = useState<{ id: string; name: string; type: string }[]>([]);
  
  // Administrative divisions for address cascading
  const activeCountry = newUserAddresses[expandedAddressIndex ?? 0]?.country || 'PT';
  const { districts, municipalities, fetchMunicipalities } = useAdministrativeDivisions(activeCountry);
  
  // Edit mode data
  const [editUserData, setEditUserData] = useState({
    name: "",
    email: "",
    phone: "",
    status: "active",
    nif: "",
    nif_country: "PT",
  });
  const [editTemplateId, setEditTemplateId] = useState<string | undefined>();
  const [editTemplateFields, setEditTemplateFields] = useState<FieldConfig[]>([]);
  const [editTemplateCustomAttrs, setEditTemplateCustomAttrs] = useState<FieldConfig[]>([]);
  const [editUserAddresses, setEditUserAddresses] = useState<AddressData[]>([]);
  const [editMembershipType, setEditMembershipType] = useState("BELONGS_TO");
  const [editPassword, setEditPassword] = useState("");
  const [editExpandedAddressIndex, setEditExpandedAddressIndex] = useState<number | null>(null);
  const [editSelectedDistrictIds, setEditSelectedDistrictIds] = useState<Record<number, string>>({});
  
  // Administrative divisions for edit mode address
  const editActiveCountry = editUserAddresses[editExpandedAddressIndex ?? 0]?.country || 'PT';
  const { districts: editDistricts, municipalities: editMunicipalities, fetchMunicipalities: editFetchMunicipalities } = useAdministrativeDivisions(editActiveCountry);
  
  // Load municipalities when district changes
  useEffect(() => {
    if (expandedAddressIndex !== null && selectedDistrictIds[expandedAddressIndex]) {
      fetchMunicipalities(selectedDistrictIds[expandedAddressIndex]);
    }
  }, [selectedDistrictIds, expandedAddressIndex]);
  
  useEffect(() => {
    if (mode === "add") {
      fetchAllUsers();
      fetchTemplateOrganizations();
      fetchAllowedOrganizations();
      fetchAvailableRoles();
    } else if (mode === "edit" && member) {
      loadMemberData();
    }
  }, [mode, member, organizationId, anewRoleCode]);
  
  const fetchAllUsers = async () => {
    const { data } = await (supabase as any)
      .from("anew_users")
      .select("id, name, email")
      .eq("status", "active")
      .order("name");
    if (data) setAllUsers(data);
  };
  
  // Role hierarchy: lower index = higher privilege
  const ROLE_CODE_HIERARCHY = ["system_admin", "super_admin", "org_admin", "org_viewer"];
  
  const fetchAvailableRoles = async () => {
    const { data: roles } = await supabase
      .from("anew_roles")
      .select("id, name, code, organization_id")
      .eq("organization_id", organizationId)
      .order("name");
    
    if (!roles) return;
    
    const currentRoleIndex = anewRoleCode ? ROLE_CODE_HIERARCHY.indexOf(anewRoleCode) : -1;

    const filtered = roles.filter((role) => {
      const roleIndex = ROLE_CODE_HIERARCHY.indexOf(role.code);

      // Custom/org-specific roles are allowed in the current org context
      if (roleIndex === -1) return true;

      // Known hierarchy roles cannot be assigned above the current user's level
      if (currentRoleIndex === -1) return false;

      return roleIndex >= currentRoleIndex;
    });
    
    setAvailableRoles(filtered.map(({ id, name, code }) => ({ id, name, code })));
    
    if (!memberForm.role_id) {
      const defaultRole = filtered.find((r) => r.code === "org_viewer") || filtered[0];
      if (defaultRole) {
        setMemberForm((prev) => ({ ...prev, role_id: defaultRole.id }));
      }
    }
  };

  const fetchTemplateOrganizations = async () => {
    const { data } = await supabase
      .from("anew_organizations")
      .select("id, name, type")
      .eq("status", "active")
      .order("name");
    if (data) setTemplateOrganizations(data);
  };
  
  // Fetch current org + all descendant organizations
  const fetchAllowedOrganizations = async () => {
    // First fetch current org
    const { data: currentOrg } = await supabase
      .from("anew_organizations")
      .select("id, name, type")
      .eq("id", organizationId)
      .single();
    
    if (!currentOrg) return;
    
    // Fetch all hierarchy relationships
    const { data: allHierarchy } = await supabase
      .from("anew_hierarchy")
      .select("parent_org_id, child_org_id");
    
    if (!allHierarchy) {
      setAllowedOrganizations([{ ...currentOrg, parent_id: null }]);
      return;
    }
    
    // Build a map of parent -> children
    const childrenMap = new Map<string, string[]>();
    allHierarchy.forEach(h => {
      const children = childrenMap.get(h.parent_org_id) || [];
      children.push(h.child_org_id);
      childrenMap.set(h.parent_org_id, children);
    });
    
    // Recursively collect all descendant IDs
    const collectDescendants = (parentId: string): string[] => {
      const children = childrenMap.get(parentId) || [];
      let result = [...children];
      for (const childId of children) {
        result = [...result, ...collectDescendants(childId)];
      }
      return result;
    };
    
    const descendantIds = collectDescendants(organizationId);
    const allIds = [organizationId, ...descendantIds];
    
    // Fetch all those organizations
    const { data: orgs } = await supabase
      .from("anew_organizations")
      .select("id, name, type")
      .in("id", allIds)
      .eq("status", "active")
      .order("name");
    
    if (orgs) {
      // Add parent_id info for hierarchy display
      const orgsWithParent = orgs.map(org => {
        const parentRel = allHierarchy.find(h => h.child_org_id === org.id);
        return {
          ...org,
          parent_id: parentRel?.parent_org_id || null,
        };
      });
      setAllowedOrganizations(orgsWithParent);
    }
  };
  
  const loadMemberData = async () => {
    if (!member) return;
    
    setLoading(true);
    await fetchTemplateOrganizations();
    
    // Fetch user data including template_id
    const { data: userData } = await (supabase as any)
      .from("anew_users")
      .select("*")
      .eq("id", member.user_id)
      .single();
    
    if (userData) {
      setEditUserData({
        name: userData.name || "",
        email: userData.email || "",
        phone: userData.phone || "",
        status: userData.status || "active",
        nif: "",
        nif_country: "PT",
      });
      // Set the template_id from user data
      if (userData.template_id) {
        setEditTemplateId(userData.template_id);
      }
    }
    
    // Fetch fiscal entity via unified table
    const entityId = userData?.entity_id;
    const { data: fiscalData } = entityId ? await (supabase as any)
      .from("anew_entity_fiscal_entities")
      .select("fiscal_entity_id, fiscal_entities(nif, country_code)")
      .eq("entity_id", entityId)
      .eq("is_primary", true)
      .maybeSingle() : { data: null };
    
    if (fiscalData?.fiscal_entities) {
      setEditUserData(prev => ({
        ...prev,
        nif: fiscalData.fiscal_entities.nif || "",
        nif_country: fiscalData.fiscal_entities.country_code || "PT",
      }));
    }
    
    // Fetch addresses
    const { data: addressesData } = entityId ? await (supabase as any)
      .from("anew_entity_addresses")
      .select(`
        id,
        address_type,
        is_primary,
        address:anew_addresses!anew_entity_addresses_address_id_fkey(*)
      `)
      .eq("entity_id", entityId) : { data: [] };
    
    if (addressesData) {
      const formattedAddresses: AddressData[] = addressesData.map((ua: any) => ({
        id: ua.id,
        street: ua.address?.street || "",
        number: ua.address?.number || "",
        floor: ua.address?.floor || "",
        unit: ua.address?.unit || "",
        postal_code: ua.address?.postal_code || "",
        city: ua.address?.city || "",
        city_id: "",
        district: ua.address?.district || "",
        district_id: "",
        country: ua.address?.country || "PT",
        extra: ua.address?.extra || "",
        address_type: ua.address_type || "home",
        is_primary: ua.is_primary || false,
      }));
      setEditUserAddresses(formattedAddresses);
    }
    
    setEditMembershipType(member.relationship_type);
    setLoading(false);
  };
  
  // Handle template selection for edit mode
  const handleApplyEditTemplate = (
    template: { id: string; name: string; organization_id: string | null } | null,
    fields: FieldConfig[],
    customAttrs: FieldConfig[]
  ) => {
    if (!template) {
      setEditTemplateId(undefined);
      setEditTemplateFields([]);
      setEditTemplateCustomAttrs([]);
      return;
    }

    setEditTemplateId(template.id);
    setEditTemplateFields(fields);
    setEditTemplateCustomAttrs(customAttrs);
    toast.success(t("templates.applied"));
  };
  
  const handleAddExistingMember = async () => {
    if (!memberForm.user_id || !memberForm.role_id) {
      toast.error(t("common.required"));
      return;
    }
    
    setLoading(true);

    // Validate hierarchy — block if user has a higher role in a parent org
    const { validateMembershipHierarchy } = await import("@/utils/validateMembershipHierarchy");
    const validation = await validateMembershipHierarchy(memberForm.user_id, organizationId, memberForm.role_id);
    if (!validation.allowed) {
      toast.error(validation.reason || "Não é permitido atribuir um cargo inferior ao que o utilizador já possui numa organização superior.");
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const createdBy = await resolveBusinessUserId(userData.user?.id);
    if (!createdBy) {
      toast.error("Não foi possível resolver o utilizador de negócio do operador.");
      setLoading(false);
      return;
    }
    
    const { error } = await (supabase as any).from("anew_memberships").insert({
      user_id: memberForm.user_id,
      organization_id: organizationId,
      relationship_type: memberForm.relationship_type,
      role_id: memberForm.role_id,
      status: "active",
      created_by: createdBy,
    });
    
    if (error) {
      if (error.code === '23505') {
        toast.error(t("organizations.memberAlreadyExists"));
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }
    
    toast.success(t("common.created"));
    setLoading(false);
    onSaved();
  };
  
  // NEW: Create user using UserFormEnhanced data
  const handleCreateNewUser = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.error(t("common.required"));
      return;
    }

    if (newUserMemberships.some((m) => m.organization_id && !m.role_id)) {
      toast.error("É obrigatório selecionar uma role para cada organização.");
      return;
    }
    
    setSavingNewUser(true);
    
    try {
      // Filter custom_attributes based on current template
      const socialKeys = ['social_facebook', 'social_linkedin', 'social_angellist'];
      const filteredCustomAttributes: Record<string, any> = {};
      
      Object.keys(customAttributes).forEach(key => {
        if (socialKeys.includes(key) || formTemplateAttrKeys.includes(key)) {
          filteredCustomAttributes[key] = customAttributes[key];
        }
      });
      
      // Add social links
      if (socialLinks.facebook) filteredCustomAttributes['social_facebook'] = socialLinks.facebook;
      if (socialLinks.linkedin) filteredCustomAttributes['social_linkedin'] = socialLinks.linkedin;
      if (socialLinks.angellist) filteredCustomAttributes['social_angellist'] = socialLinks.angellist;
      
      const primaryEmail = formData.email.toLowerCase().trim();
      const primaryPhoneKey = formData.phone.replace(/\s+/g, "");

      const { data: functionData, error: functionError } = await supabase.functions.invoke('create-user', {
        body: {
          email: formData.email,
          password: formData.password,
          name: formData.name,
          phone: formData.phone || null,
          fiscal: fiscalData.nif ? { nif: fiscalData.nif, country_code: fiscalData.country_code } : null,
          addresses: newUserAddresses.length > 0 ? newUserAddresses : null,
          memberships: newUserMemberships.filter(m => m.organization_id && m.role_id),
          template_id: selectedTemplateId || null,
          custom_attributes: Object.keys(filteredCustomAttributes).length > 0 ? filteredCustomAttributes : null,
          position: formData.position || null,
          location: formData.location || null,
          description: formData.description || null,
          additional_emails: emails.filter(e => e.email && e.email.toLowerCase().trim() !== primaryEmail).map(e => ({
            email: e.email,
            email_type: e.email_type,
            is_primary: false,
          })),
          additional_phones: phones.filter(p => p.phone_number && `${p.country_code || ""}${p.phone_number || ""}`.replace(/\s+/g, "") !== primaryPhoneKey).map(p => ({
            phone_number: p.phone_number,
            country_code: p.country_code,
            phone_type: p.phone_type,
            is_primary: false,
          })),
        },
      });
      
      if (functionError) {
        toast.error(functionError.message);
        setSavingNewUser(false);
        return;
      }
      
      if (functionData?.error) {
        toast.error(functionData.error);
        setSavingNewUser(false);
        return;
      }
      
      toast.success(t("common.created"));
      setSavingNewUser(false);
      setCreateUserSheetOpen(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar utilizador");
      setSavingNewUser(false);
    }
  };
  
  const handleUpdateMember = async () => {
    if (!member || !editUserData.name || !editUserData.email) {
      toast.error(t("common.required"));
      return;
    }
    
    setLoading(true);
    
    // Update user data including template_id
    const { error: userError } = await (supabase as any)
      .from("anew_users")
      .update({
        name: editUserData.name,
        email: editUserData.email,
        phone: editUserData.phone || null,
        status: editUserData.status,
        template_id: editTemplateId || null,
      })
      .eq("id", member.user_id);
    
    if (userError) {
      toast.error(userError.message);
      setLoading(false);
      return;
    }
    
    // Update membership
    const { error: memberError } = await (supabase as any)
      .from("anew_memberships")
      .update({
        relationship_type: editMembershipType,
      })
      .eq("id", member.id);
    
    if (memberError) {
      toast.error(memberError.message);
      setLoading(false);
      return;
    }
    
    // Update password if provided
    if (editPassword) {
      const { error: pwError } = await supabase.functions.invoke('update-user-password', {
        body: { targetUserId: member.user_id, newPassword: editPassword },
      });
      if (pwError) {
        toast.error(pwError.message);
      }
    }
    
    toast.success(t("common.saved"));
    setLoading(false);
    onSaved();
  };
  
  // Edit mode address functions
  const addEditAddress = () => {
    const newIndex = editUserAddresses.length;
    setEditUserAddresses([...editUserAddresses, {
      street: "",
      number: "",
      floor: "",
      unit: "",
      postal_code: "",
      city: "",
      city_id: "",
      district: "",
      district_id: "",
      country: "PT",
      extra: "",
      address_type: "home",
      is_primary: editUserAddresses.length === 0,
    }]);
    setEditExpandedAddressIndex(newIndex);
  };
  
  const removeEditAddress = (index: number) => {
    setEditUserAddresses(editUserAddresses.filter((_, i) => i !== index));
    setEditSelectedDistrictIds(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    if (editExpandedAddressIndex === index) {
      setEditExpandedAddressIndex(null);
    }
  };
  
  const updateEditAddress = (index: number, field: keyof AddressData, value: string | boolean) => {
    const updated = [...editUserAddresses];
    (updated[index] as any)[field] = value;
    setEditUserAddresses(updated);
  };
  
  // Reset form when sheet opens
  const handleOpenCreateSheet = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      password: "",
      status: "active",
      description: "",
      position: "",
      location: "",
    });
    setEmails([]);
    setPhones([]);
    setSocialLinks({ angellist: "", facebook: "", linkedin: "" });
    setNewUserMemberships([{ organization_id: organizationId, relationship_type: "BELONGS_TO", role_id: "" }]);
    setNewUserAddresses([]);
    setFiscalData({ nif: "", commercial_name: "", country_code: "PT" });
    setCustomAttributes({});
    setSelectedTemplateId(undefined);
    setCreateUserSheetOpen(true);
  };
  
  if (loading && mode === "edit") {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-col bg-background", mode === "add" ? "h-auto" : "h-full")}>
      {/* Header - styled like Dialog */}
      <div className="flex items-start justify-between p-6 border-b">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {mode === "add" ? (
              <UserPlus className="h-5 w-5 text-primary" />
            ) : (
              <Pencil className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "add" ? t("users.newUser") : t("organizations.editMember")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "add" ? t("users.createUserDescription") : organizationName}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {mode === "add" ? (
        <>
          <div className="px-6 py-4 space-y-4">
            <div className="space-y-2">
              <Label>{t("common.user")} *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <UserCombobox
                    users={allUsers.filter(u => !existingMemberUserIds.includes(u.id))}
                    value={memberForm.user_id}
                    onChange={(userId) => setMemberForm(prev => ({ ...prev, user_id: userId }))}
                    placeholder={t("organizations.searchUser")}
                  />
                </div>
                <Button variant="outline" onClick={handleOpenCreateSheet} className="shrink-0">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t("users.createNew")}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t("users.role")} *</Label>
              <NativeSelect
                options={availableRoles.map(r => ({ value: r.id, label: r.name }))}
                value={memberForm.role_id}
                onValueChange={(value) => setMemberForm(prev => ({ ...prev, role_id: value }))}
                placeholder={t("users.selectRole")}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleAddExistingMember}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.add")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="px-2">
              <div className="space-y-4">
                {/* Template Selector for Edit Mode */}
                <div className="pb-4 border-b">
                  <TemplateTabSelector
                    organizations={templateOrganizations}
                    selectedTemplateId={editTemplateId}
                    onTemplateSelect={handleApplyEditTemplate}
                  />
                </div>
                
                <Tabs defaultValue="user">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="user">{t("common.general")}</TabsTrigger>
                    <TabsTrigger value="addresses">{t("users.addresses")}</TabsTrigger>
                    <TabsTrigger value="membership">{t("organizations.membership")}</TabsTrigger>
                  </TabsList>
                  
                  {/* General Tab */}
                  <TabsContent value="user" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("common.name")} *</Label>
                      <Input
                        value={editUserData.name}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.email")} *</Label>
                      <Input
                        type="email"
                        value={editUserData.email}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.phone")}</Label>
                      <Input
                        value={editUserData.phone}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.status")}</Label>
                      <NativeSelect
                        options={[
                          { value: "active", label: t("common.active") },
                          { value: "inactive", label: t("common.inactive") },
                        ]}
                        value={editUserData.status}
                        onValueChange={(value) => setEditUserData(prev => ({ ...prev, status: value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("users.newPassword")}</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder={t("users.leaveBlank")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>NIF</Label>
                      <Input
                        value={editUserData.nif}
                        onChange={(e) => setEditUserData(prev => ({ ...prev, nif: e.target.value }))}
                      />
                    </div>
                  </TabsContent>
                  
                  {/* Addresses Tab */}
                  <TabsContent value="addresses" className="space-y-4 mt-4">
                    {editUserAddresses.map((addr, index) => (
                      <div key={index} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{addr.street || t("users.newAddress")}</span>
                            {addr.is_primary && <Badge variant="secondary" className="text-[10px]">Principal</Badge>}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditExpandedAddressIndex(editExpandedAddressIndex === index ? null : index)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeEditAddress(index)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {editExpandedAddressIndex === index && (
                          <div className="space-y-2 pt-2 border-t">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.street")}</Label>
                                <Input value={addr.street} onChange={(e) => updateEditAddress(index, "street", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.number")}</Label>
                                <Input value={addr.number} onChange={(e) => updateEditAddress(index, "number", e.target.value)} />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.floor")}</Label>
                                <Input value={addr.floor} onChange={(e) => updateEditAddress(index, "floor", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.unit")}</Label>
                                <Input value={addr.unit} onChange={(e) => updateEditAddress(index, "unit", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.postalCode")}</Label>
                                <Input value={addr.postal_code} onChange={(e) => updateEditAddress(index, "postal_code", e.target.value)} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.district")}</Label>
                                <NativeSelect
                                  options={editDistricts.map(d => ({ value: d.id, label: d.name }))}
                                  value={editSelectedDistrictIds[index] || ""}
                                  onValueChange={(val) => {
                                    setEditSelectedDistrictIds(prev => ({ ...prev, [index]: val }));
                                    const district = editDistricts.find(d => d.id === val);
                                    if (district) updateEditAddress(index, "district", district.name);
                                    updateEditAddress(index, "district_id", val);
                                    editFetchMunicipalities(val);
                                  }}
                                  placeholder={t("users.selectDistrict")}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t("users.city")}</Label>
                                <NativeSelect
                                  options={editMunicipalities.map(m => ({ value: m.id, label: m.name }))}
                                  value={addr.city_id || ""}
                                  onValueChange={(val) => {
                                    const mun = editMunicipalities.find(m => m.id === val);
                                    if (mun) updateEditAddress(index, "city", mun.name);
                                    updateEditAddress(index, "city_id", val);
                                  }}
                                  placeholder={t("users.selectCity")}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t("users.country")}</Label>
                              <NativeSelect
                                options={countries.map(c => ({ value: c.code, label: c.name }))}
                                value={addr.country}
                                onValueChange={(val) => updateEditAddress(index, "country", val)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={addr.is_primary}
                                onCheckedChange={(checked) => updateEditAddress(index, "is_primary", checked)}
                              />
                              <Label className="text-xs">Principal</Label>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addEditAddress} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      {t("users.addAddress")}
                    </Button>
                  </TabsContent>
                  
                  {/* Membership Tab */}
                  <TabsContent value="membership" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>{t("organizations.relationshipType")}</Label>
                      <NativeSelect
                        options={[
                          { value: "BELONGS_TO", label: "Pertence a" },
                          { value: "WORKS_AT", label: "Trabalha em" },
                          { value: "MANAGES", label: "Gere" },
                        ]}
                        value={editMembershipType}
                        onValueChange={setEditMembershipType}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("organizations.organization")}</Label>
                      <p className="font-medium">{organizationName}</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </ScrollArea>
          
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button 
              onClick={handleUpdateMember}
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}

      {/* Create New User Sheet - using UserFormEnhanced */}
      <Sheet open={createUserSheetOpen} onOpenChange={(open) => {
        setCreateUserSheetOpen(open);
        if (!open) {
          setAddMode("select");
        }
      }}>
        <SheetContent className="w-[95vw] sm:w-[700px] md:w-[800px] lg:w-[900px] sm:max-w-[900px] p-0 overflow-hidden">
          <div className="h-full">
            <UserFormEnhanced
              formData={formData}
              setFormData={setFormData}
              emails={emails}
              setEmails={setEmails}
              phones={phones}
              setPhones={setPhones}
              socialLinks={socialLinks}
              setSocialLinks={setSocialLinks}
              memberships={newUserMemberships}
              setMemberships={setNewUserMemberships}
              addresses={newUserAddresses}
              setAddresses={setNewUserAddresses}
              fiscalData={fiscalData}
              setFiscalData={setFiscalData}
              customAttributes={customAttributes}
              setCustomAttributes={setCustomAttributes}
              organizations={allowedOrganizations}
              isEdit={false}
              saving={savingNewUser}
              onSave={handleCreateNewUser}
              onCancel={() => {
                setCreateUserSheetOpen(false);
                setAddMode("select");
              }}
              initialTemplateId={selectedTemplateId}
              onTemplateChange={setSelectedTemplateId}
              onTemplateAttrKeysChange={setFormTemplateAttrKeys}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
