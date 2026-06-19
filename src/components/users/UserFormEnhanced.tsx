import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Trash2,
  X,
  Loader2,
  User,
  MapPin,
  FileText,
  Eye,
  EyeOff,
  KeyRound,
  Briefcase,
  Info,
  Maximize2,
  Minimize2,
  Settings2,
  Sparkles,
  Hash,
  ToggleLeft,
  Calendar,
  Type,
  Wand2,
  Shield,
  Lock,
} from "lucide-react";
import { MembershipScopesDialog, PendingScopeEntry } from "./MembershipScopesDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { OrganizationCombobox } from "./OrganizationCombobox";
import { MultiValueEmailInput, EmailEntry } from "./MultiValueEmailInput";
import { MultiValuePhoneInput, PhoneEntry } from "./MultiValuePhoneInput";
// SocialLinksInput removed - social links are now template-configurable fields
import { TemplateTabSelector } from "./TemplateTabSelector";
import { UserTemplateManager } from "./UserTemplateManager";
import { FieldConfig } from "./TemplateFieldsConfig";
import { OrgAddressPickerDialog, OrgAddressOption } from "./OrgAddressPickerDialog";
import { useCountries } from "@/hooks/useCountries";
import { useAdministrativeDivisions } from "@/hooks/useAdministrativeDivisions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";

interface RoleOption {
  id: string;
  code: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
}

interface Membership {
  id?: string;
  organization_id: string;
  relationship_type: string;
  role_id: string;
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

interface FiscalData {
  nif: string;
  commercial_name: string;
  country_code: string;
}

interface SocialLinks {
  angellist: string;
  facebook: string;
  linkedin: string;
}

interface UserFormData {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: string;
  description: string;
  position: string;
  location: string;
}

interface UserFormEnhancedProps {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  emails: EmailEntry[];
  setEmails: (emails: EmailEntry[]) => void;
  phones: PhoneEntry[];
  setPhones: (phones: PhoneEntry[]) => void;
  socialLinks: SocialLinks;
  setSocialLinks: (links: SocialLinks) => void;
  memberships: Membership[];
  setMemberships: (memberships: Membership[]) => void;
  addresses: AddressData[];
  setAddresses: (addresses: AddressData[]) => void;
  fiscalData: FiscalData;
  setFiscalData: (data: FiscalData) => void;
  customAttributes: Record<string, any>;
  setCustomAttributes: (attrs: Record<string, any>) => void;
  organizations: Organization[];
  isEdit: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  createMore?: boolean;
  onCreateMoreChange?: (value: boolean) => void;
  initialTemplateId?: string;
  editUserId?: string;
  onTemplateChange?: (templateId: string | undefined) => void;
  onTemplateFieldsChange?: (fields: Array<{ key: string; isVisible: boolean }>) => void;
  onTemplateAttrKeysChange?: (keys: string[]) => void;
  pendingScopeChanges?: Record<string, PendingScopeEntry[]>;
  onPendingScopeChanges?: (changes: Record<string, PendingScopeEntry[]>) => void;
  isRolesReadOnly?: boolean;
}

export function UserFormEnhanced({
  formData,
  setFormData,
  emails,
  setEmails,
  phones,
  setPhones,
  socialLinks,
  setSocialLinks,
  memberships,
  setMemberships,
  addresses,
  setAddresses,
  fiscalData,
  setFiscalData,
  customAttributes,
  setCustomAttributes,
  organizations,
  isEdit,
  saving,
  onSave,
  onCancel,
  isExpanded = false,
  onToggleExpand,
  createMore = false,
  onCreateMoreChange,
  initialTemplateId,
  editUserId,
  onTemplateChange,
  onTemplateFieldsChange,
  onTemplateAttrKeysChange,
  pendingScopeChanges = {},
  onPendingScopeChanges,
  isRolesReadOnly = false,
}: UserFormEnhancedProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const [showPassword, setShowPassword] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(initialTemplateId);
  const [templateFields, setTemplateFields] = useState<FieldConfig[]>([]);
  const [templateCustomAttrs, setTemplateCustomAttrs] = useState<FieldConfig[]>([]);
  const { countries } = useCountries();
  const { hasPermission, permissions: currentUserPermissions, isSystemAdmin } = usePermissions();
  const { userType: currentUserType } = useCompany();
  // Stable key for permissions to avoid infinite useEffect re-runs
  const permissionsKey = useMemo(() => currentUserPermissions.slice().sort().join(","), [currentUserPermissions]);
  // Roles indexed by organization_id – each org only sees its own roles (no global/system roles)
  const [rolesByOrg, setRolesByOrg] = useState<Record<string, RoleOption[]>>({});
  const [scopesDialogOpen, setScopesDialogOpen] = useState(false);
  const [selectedMembershipForScopes, setSelectedMembershipForScopes] = useState<{id: string; orgName: string; roleId: string} | null>(null);
  
  // Sync with initialTemplateId when it changes (e.g., when editing a different user)

  // Load roles per organization – only org-scoped roles (organization_id IS NOT NULL)
  // Filter: only show roles whose permissions are a subset of the current user's permissions
  useEffect(() => {
    const loadRoles = async () => {
      const membershipOrgIds = memberships
        .map(m => m.organization_id)
        .filter(Boolean);

      if (membershipOrgIds.length === 0) {
        setRolesByOrg({});
        return;
      }

      // Collect ancestor org IDs for each membership org (roles inherited from holding)
      const allOrgIds = new Set<string>(membershipOrgIds);
      for (const orgId of membershipOrgIds) {
        let currentId = orgId;
        for (let i = 0; i < 10; i++) {
          const { data: parentLink } = await (supabase as any)
            .from("anew_hierarchy")
            .select("parent_org_id")
            .eq("child_org_id", currentId)
            .maybeSingle();
          if (!parentLink?.parent_org_id) break;
          allOrgIds.add(parentLink.parent_org_id);
          currentId = parentLink.parent_org_id;
        }
      }

      // Fetch org-scoped roles (including ancestor orgs)
      const { data, error } = await supabase
        .from("anew_roles")
        .select("id, code, name, organization_id")
        .in("organization_id", Array.from(allOrgIds))
        .order("name");
      
      if (error) {
        console.error("Error loading roles:", error);
        return;
      }

      // Also fetch system roles (like super_admin) that the user already has assigned
      // so they appear in the selector instead of being blank
      const existingRoleIds = memberships.map(m => m.role_id).filter(Boolean);
      let systemRoles: any[] = [];
      if (existingRoleIds.length > 0) {
        const { data: sysData } = await supabase
          .from("anew_roles")
          .select("id, code, name, organization_id")
          .in("id", existingRoleIds)
          .is("organization_id", null);
        systemRoles = sysData || [];
      }
      
      if (data) {
        // For super_admin, skip permission-subset check — they can assign any role
        if (isSystemAdmin) {
          const map: Record<string, RoleOption[]> = {};
          membershipOrgIds.forEach(orgId => { map[orgId] = []; });
          data.forEach((r: any) => {
            if (r.organization_id) {
              // Add role to its own org AND to all child orgs in membershipOrgIds
              membershipOrgIds.forEach(orgId => {
                if (r.organization_id === orgId || allOrgIds.has(r.organization_id)) {
                  if (!map[orgId]) map[orgId] = [];
                  if (!map[orgId].some((existing: RoleOption) => existing.id === r.id)) {
                    map[orgId].push({ id: r.id, code: r.code, name: r.name });
                  }
                }
              });
            }
          });
          systemRoles.forEach((sr: any) => {
            memberships.forEach(m => {
              if (m.role_id === sr.id && m.organization_id) {
                if (!map[m.organization_id]) map[m.organization_id] = [];
                if (!map[m.organization_id].some(r => r.id === sr.id)) {
                  map[m.organization_id].push({ id: sr.id, code: sr.code, name: sr.name });
                }
              }
            });
          });
          setRolesByOrg(map);
          return;
        }

        // Fetch permissions for ALL candidate roles in one query
        const allRoleIds = data.map((r: any) => r.id);
        const { data: rolePermsData } = await supabase
          .from("anew_role_permissions")
          .select("role_id, permission_code")
          .in("role_id", allRoleIds);

        // Build a map: role_id → Set<permission_code>
        const rolePermsMap: Record<string, Set<string>> = {};
        (rolePermsData || []).forEach((rp: any) => {
          if (!rolePermsMap[rp.role_id]) rolePermsMap[rp.role_id] = new Set();
          rolePermsMap[rp.role_id].add(rp.permission_code);
        });

        const currentPermsSet = new Set(currentUserPermissions);

        const map: Record<string, RoleOption[]> = {};
        membershipOrgIds.forEach(orgId => { map[orgId] = []; });
        data.forEach((r: any) => {
          if (r.organization_id) {
            // Check: every permission of this role must exist in current user's permissions
            const rolePermissions = rolePermsMap[r.id] || new Set();
            const canAssign = Array.from(rolePermissions).every(p => currentPermsSet.has(p));
            if (!canAssign) return;
            // Add role to its own org AND to all child orgs in membershipOrgIds
            membershipOrgIds.forEach(orgId => {
              if (r.organization_id === orgId || allOrgIds.has(r.organization_id)) {
                if (!map[orgId]) map[orgId] = [];
                if (!map[orgId].some((existing: RoleOption) => existing.id === r.id)) {
                  map[orgId].push({ id: r.id, code: r.code, name: r.name });
                }
              }
            });
          }
        });
        // Add system roles to the orgs where the user already has them assigned
        systemRoles.forEach((sr: any) => {
          memberships.forEach(m => {
            if (m.role_id === sr.id && m.organization_id) {
              if (!map[m.organization_id]) map[m.organization_id] = [];
              if (!map[m.organization_id].some(r => r.id === sr.id)) {
                map[m.organization_id].push({ id: sr.id, code: sr.code, name: sr.name });
              }
            }
          });
        });
        setRolesByOrg(map);
      }
    };
    loadRoles();
  }, [memberships, currentUserType, permissionsKey, isSystemAdmin]);

  // and load the template fields/customAttrs from DB
  useEffect(() => {
    // Always sync (including when it becomes undefined) so switching template/base updates UI.
    setSelectedTemplateId(initialTemplateId);

    // No template (Base) -> clear rules
    if (!initialTemplateId) {
      setTemplateFields([]);
      setTemplateCustomAttrs([]);
      return;
    }

    // If there's a template, load its fields from DB
    (async () => {
      try {
        const [fieldsRes, attrsRes] = await Promise.all([
          supabase
            .from("user_template_fields")
            .select("*")
            .eq("template_id", initialTemplateId)
            .order("sort_order"),
          supabase
            .from("user_template_attributes")
            .select("*")
            .eq("template_id", initialTemplateId)
            .order("sort_order"),
        ]);

        const fields: FieldConfig[] =
          fieldsRes.data?.map((f: any) => ({
            key: f.field_key,
            label: f.field_label,
            type: f.field_type,
            isRequired: f.is_required,
            isVisible: f.is_visible,
            isCustom: false,
            defaultValue: f.default_value || undefined,
            sortOrder: f.sort_order,
          })) || [];

        const customAttrs: FieldConfig[] =
          attrsRes.data?.map((a: any) => ({
            key: a.attribute_name,
            label: a.attribute_label,
            type: a.attribute_type,
            isRequired: a.is_required || false,
            isVisible: true,
            isCustom: true,
            defaultValue: a.default_value || undefined,
            options: a.options
              ? Array.isArray(a.options)
                ? a.options.map((o: unknown) => String(o))
                : []
              : [],
            placeholder: a.placeholder || undefined,
            sortOrder: a.sort_order || 0,
          })) || [];

        setTemplateFields(fields);
        setTemplateCustomAttrs(customAttrs);
      } catch (error) {
        console.error("Error loading template on edit:", error);
      }
    })();
  }, [initialTemplateId]);
  
  // Notify parent when templateFields change so save logic can respect visibility
  useEffect(() => {
    if (onTemplateFieldsChange) {
      onTemplateFieldsChange(templateFields.map(f => ({ key: f.key, isVisible: f.isVisible !== false })));
    }
  }, [templateFields, onTemplateFieldsChange]);
  
  // Notify parent when templateCustomAttrs change so save logic can filter attributes
  useEffect(() => {
    if (onTemplateAttrKeysChange) {
      onTemplateAttrKeysChange(templateCustomAttrs.map(a => a.key));
    }
  }, [templateCustomAttrs, onTemplateAttrKeysChange]);
  
  // Track which address is expanded for cascading selectors
  const [expandedAddressIndex, setExpandedAddressIndex] = useState<number | null>(null);
  const [selectedDistrictIds, setSelectedDistrictIds] = useState<Record<number, string>>({});
  const [fetchingOrgAddress, setFetchingOrgAddress] = useState(false);
  
  // State for address picker dialog
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [pendingOrgAddresses, setPendingOrgAddresses] = useState<OrgAddressOption[]>([]);
  const [pendingOrgName, setPendingOrgName] = useState("");
  
  // Get the country of the first address or default to PT
  const activeCountry = addresses[expandedAddressIndex ?? 0]?.country || 'PT';
  const { districts, municipalities, fetchMunicipalities } = useAdministrativeDivisions(activeCountry);

  // Handle address selection from picker dialog
  const handleAddressSelected = useCallback((addr: OrgAddressOption) => {
    const newAddress: AddressData = {
      street: addr.street || '',
      number: addr.number || '',
      floor: addr.floor || '',
      unit: addr.unit || '',
      postal_code: addr.postal_code || '',
      city: addr.city || '',
      city_id: '',
      district: addr.district || '',
      district_id: '',
      country: addr.country || 'PT',
      extra: addr.extra || '',
      address_type: 'work',
      is_primary: addresses.length === 0,
    };

    // If a work/remote address already exists, replace it (do not create duplicates)
    const existingWorkIndex = addresses.findIndex((a) => a.address_type === 'work' || a.address_type === 'remote');
    if (existingWorkIndex >= 0) {
      const updated = [...addresses];
      const keepPrimary = updated[existingWorkIndex]?.is_primary ?? false;
      updated[existingWorkIndex] = { ...newAddress, is_primary: keepPrimary };
      setAddresses(updated);
      setExpandedAddressIndex(existingWorkIndex);
    } else if (addresses.length === 0) {
      setAddresses([newAddress]);
      setExpandedAddressIndex(0);
    } else {
      setAddresses([...addresses, newAddress]);
      setExpandedAddressIndex(addresses.length);
    }

    toast({
      title: t("users.orgAddressApplied"),
      description: t("users.orgAddressAppliedDesc"),
    });
  }, [addresses, setAddresses, toast, t]);

  // Handle remote work selection - creates a "remote" address entry and opens for editing
  const handleRemoteWorkSelected = useCallback(() => {
    const remoteAddress: AddressData = {
      street: '',
      number: '',
      floor: '',
      unit: '',
      postal_code: '',
      city: '',
      city_id: '',
      district: '',
      district_id: '',
      country: 'PT',
      extra: '',
      address_type: 'remote',
      is_primary: addresses.length === 0,
    };

    // If a work/remote address already exists, replace it
    const existingWorkIndex = addresses.findIndex((a) => a.address_type === 'work' || a.address_type === 'remote');
    let newIndex: number;
    
    if (existingWorkIndex >= 0) {
      const updated = [...addresses];
      const keepPrimary = updated[existingWorkIndex]?.is_primary ?? false;
      updated[existingWorkIndex] = { ...remoteAddress, is_primary: keepPrimary };
      setAddresses(updated);
      newIndex = existingWorkIndex;
    } else if (addresses.length === 0) {
      setAddresses([remoteAddress]);
      newIndex = 0;
    } else {
      setAddresses([...addresses, remoteAddress]);
      newIndex = addresses.length;
    }

    setPendingOrgAddresses([]);
    
    // Expand the address form for the user to fill in their remote work location
    setExpandedAddressIndex(newIndex);

    toast({
      title: t("users.remoteWorkApplied") || "Teletrabalho",
      description: t("users.fillRemoteAddress") || "Preencha a morada onde trabalha remotamente",
    });
  }, [addresses, setAddresses, toast, t]);
  // Fetch organization's addresses when organization is selected
  const fetchOrganizationAddress = useCallback(async (orgId: string) => {
    if (!orgId) return;
    
    // Skip if address field is not visible in template
    const addressVisible = !selectedTemplateId
      ? true
      : templateFields.some((f) => f.key === "address" && f.isVisible !== false);
    if (!addressVisible) return;
    
    setFetchingOrgAddress(true);
    try {
      // Get organization name and entity_id
      const { data: orgData } = await (supabase as any)
        .from('anew_organizations')
        .select('name, entity_id')
        .eq('id', orgId)
        .single();

      const orgEntityId = orgData?.entity_id;
      let addressOptions: OrgAddressOption[] = [];

      // Fetch organization addresses when entity_id exists
      if (orgEntityId) {
        const { data: orgAddresses, error } = await (supabase as any)
          .from('anew_entity_addresses')
          .select(`
            address_id,
            is_fiscal,
            address:anew_addresses!anew_entity_addresses_address_id_fkey (
              id,
              street,
              number,
              floor,
              unit,
              postal_code,
              city,
              district,
              country,
              extra
            )
          `)
          .eq('entity_id', orgEntityId)
          .is('valid_to', null)
          .order('is_fiscal', { ascending: false });

        if (!error && orgAddresses?.length) {
          addressOptions = orgAddresses
            .filter((oa: any) => oa.address)
            .map((oa: any) => ({
              id: (oa.address as any).id,
              street: (oa.address as any).street || '',
              number: (oa.address as any).number || '',
              floor: (oa.address as any).floor || undefined,
              unit: (oa.address as any).unit || undefined,
              postal_code: (oa.address as any).postal_code || '',
              city: (oa.address as any).city || '',
              district: (oa.address as any).district || undefined,
              country: (oa.address as any).country || 'PT',
              extra: (oa.address as any).extra || undefined,
              is_fiscal: oa.is_fiscal,
            }));
        }
      } else {
        console.log('Organization has no entity_id:', orgId);
      }

      // Always open picker so user can choose remote work even when org has no saved address
      setPendingOrgName(orgData?.name || '');
      setPendingOrgAddresses(addressOptions);
      setAddressPickerOpen(true);
    } catch (err) {
      console.error('Error fetching organization addresses:', err);
    } finally {
      setFetchingOrgAddress(false);
    }
  }, [selectedTemplateId, templateFields]);

  // When editing, the user can switch organizations multiple times.
  // Trigger the org-address prompt whenever new org(s) are selected,
  // but only if the current template has the Address field enabled (handled inside fetchOrganizationAddress).
  // Track if initial load has happened - suppress first prompt for pre-selected orgs
  const isInitialLoadRef = useRef(true);
  const prevMembershipOrgIdsRef = useRef<string[]>([]);
  const suppressInitialOrgPromptRef = useRef(true); // Start as true to suppress initial prompt
  const lastEditUserIdRef = useRef<string | undefined>(undefined);
  const suppressTemplateOrgPromptRef = useRef(false); // Suppress prompt when template changes orgs

  // When entering edit mode (or switching to a different user), suppress the initial prompt.
  // Also suppress for new user creation when orgs come pre-selected.
  useEffect(() => {
    if (isEdit) {
      if (editUserId !== lastEditUserIdRef.current) {
        lastEditUserIdRef.current = editUserId;
        suppressInitialOrgPromptRef.current = true;
      }
    } else {
      // For new users: suppress the very first render if memberships already exist
      if (isInitialLoadRef.current && memberships.length > 0) {
        suppressInitialOrgPromptRef.current = true;
      }
      lastEditUserIdRef.current = undefined;
    }
  }, [isEdit, editUserId, memberships.length]);

  useEffect(() => {
    const currentOrgIds = memberships
      .map((m) => m.organization_id)
      .filter(Boolean) as string[];

    // Suppress prompt on initial load (both edit and create with pre-selected orgs)
    if (suppressInitialOrgPromptRef.current) {
      // Prime the previous org list without prompting.
      prevMembershipOrgIdsRef.current = currentOrgIds;
      suppressInitialOrgPromptRef.current = false;
      isInitialLoadRef.current = false;
      return;
    }

    // Suppress prompt when template changes organizations
    if (suppressTemplateOrgPromptRef.current) {
      prevMembershipOrgIdsRef.current = currentOrgIds;
      suppressTemplateOrgPromptRef.current = false;
      return;
    }

    const prevOrgIds = prevMembershipOrgIdsRef.current;
    prevMembershipOrgIdsRef.current = currentOrgIds;

    const newlySelected = currentOrgIds.filter((id) => !prevOrgIds.includes(id));
    if (newlySelected.length === 0) return;

    // If multiple orgs were added at once (template), prompt for each.
    newlySelected.forEach((orgId) => {
      fetchOrganizationAddress(orgId);
    });
  }, [memberships, fetchOrganizationAddress]);
  
  // Resolve district_id from name when districts load - run only once when districts first load
  useEffect(() => {
    if (districts.length === 0 || addresses.length === 0) return;

    // Check if any address needs district_id resolution
    const needsResolution = addresses.some(addr => addr.district && !addr.district_id);
    if (!needsResolution) return;

    const updatedAddresses = addresses.map((addr, idx) => {
      if (addr.district && !addr.district_id) {
        const found = districts.find(d => d.name.toLowerCase() === addr.district.toLowerCase());
        if (found) {
          if (expandedAddressIndex === idx) {
            setSelectedDistrictIds(prev => ({ ...prev, [idx]: found.id }));
          }
          return { ...addr, district_id: found.id };
        }
      }
      return addr;
    });
    
    setAddresses(updatedAddresses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts.length]);

  // Load municipalities when expanded address has district_id
  useEffect(() => {
    if (expandedAddressIndex !== null && addresses[expandedAddressIndex]) {
      const addr = addresses[expandedAddressIndex];
      if (addr.district_id && selectedDistrictIds[expandedAddressIndex] !== addr.district_id) {
        setSelectedDistrictIds(prev => ({ ...prev, [expandedAddressIndex]: addr.district_id! }));
        fetchMunicipalities(addr.district_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedAddressIndex]);

  // Load municipalities when district selection changes
  useEffect(() => {
    if (expandedAddressIndex !== null && selectedDistrictIds[expandedAddressIndex]) {
      fetchMunicipalities(selectedDistrictIds[expandedAddressIndex]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistrictIds[expandedAddressIndex]]);

  // Resolve city_id from city name when municipalities load - run only once when municipalities load
  useEffect(() => {
    if (municipalities.length === 0 || expandedAddressIndex === null) return;
    
    const addr = addresses[expandedAddressIndex];
    if (addr?.city && !addr.city_id) {
      const found = municipalities.find(m => m.name.toLowerCase() === addr.city.toLowerCase());
      if (found) {
        const updated = [...addresses];
        if (updated[expandedAddressIndex]) {
          updated[expandedAddressIndex] = { ...updated[expandedAddressIndex], city_id: found.id };
        }
        setAddresses(updated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalities.length]);

  // Membership functions
  const addMembership = () => {
    setMemberships([
      ...memberships,
      { organization_id: "", relationship_type: "BELONGS_TO", role_id: "" },
    ]);
  };

  const updateMembership = (index: number, field: string, value: string) => {
    const updated = [...memberships];
    updated[index] = { ...updated[index], [field]: value };
    // When organization changes, clear the role since roles are org-specific
    if (field === "organization_id") {
      updated[index].role_id = "";
    }
    setMemberships(updated);
  };

  const removeMembership = (index: number) => {
    // Prevent removing the last membership — at least one org is required
    if (memberships.length <= 1) return;
    setMemberships(memberships.filter((_, i) => i !== index));
  };

  // Auto-add one empty membership if none exist (org is required)
  useEffect(() => {
    if (memberships.length === 0) {
      setMemberships([{ organization_id: "", relationship_type: "BELONGS_TO", role_id: "" }]);
    }
  }, [memberships.length]);

  // Address functions
  const addAddress = () => {
    const newIndex = addresses.length;
    setAddresses([
      ...addresses,
      {
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
        is_primary: addresses.length === 0,
      },
    ]);
    setExpandedAddressIndex(newIndex);
  };

  const updateAddress = (index: number, field: string, value: string | boolean) => {
    const updated = [...addresses];
    updated[index] = { ...updated[index], [field]: value };
    
    // If setting as primary, unset others
    if (field === "is_primary" && value === true) {
      updated.forEach((addr, i) => {
        if (i !== index) addr.is_primary = false;
      });
    }
    
    setAddresses(updated);
  };

  const handleCountryChange = (index: number, countryCode: string) => {
    const updated = [...addresses];
    updated[index] = {
      ...updated[index],
      country: countryCode,
      district: "",
      district_id: "",
      city: "",
      city_id: "",
    };
    setAddresses(updated);
    setSelectedDistrictIds(prev => ({ ...prev, [index]: "" }));
  };

  const handleDistrictChange = (index: number, districtId: string) => {
    const district = districts.find(d => d.id === districtId);
    const updated = [...addresses];
    updated[index] = {
      ...updated[index],
      district_id: districtId,
      district: district?.name || "",
      city_id: "",
      city: "",
    };
    setAddresses(updated);
    setSelectedDistrictIds(prev => ({ ...prev, [index]: districtId }));
  };

  const handleCityChange = (index: number, cityId: string) => {
    const city = municipalities.find(m => m.id === cityId);
    const updated = [...addresses];
    updated[index] = {
      ...updated[index],
      city_id: cityId,
      city: city?.name || "",
    };
    setAddresses(updated);
  };

  const removeAddress = (index: number) => {
    const updated = addresses.filter((_, i) => i !== index);
    // Ensure at least one primary if addresses exist
    if (updated.length > 0 && !updated.some(a => a.is_primary)) {
      updated[0].is_primary = true;
    }
    setAddresses(updated);
    // Clear selected district for removed index
    setSelectedDistrictIds(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    if (expandedAddressIndex === index) {
      setExpandedAddressIndex(null);
    }
  };

  // Helper to check if a field should be visible based on template configuration
  const isFieldVisible = (fieldKey: string): boolean => {
    // Social links are hidden by default in base mode - only visible when template enables them
    const socialFields = ['linkedin', 'facebook'];
    
    // If no template is selected (base mode)
    if (!selectedTemplateId || templateFields.length === 0) {
      // Social fields are hidden in base mode
      if (socialFields.includes(fieldKey)) return false;
      // Other fields are visible
      return true;
    }
    
    const fieldConfig = templateFields.find(f => f.key === fieldKey);
    // If field not found in config, default to visible (except social fields)
    if (!fieldConfig) {
      return !socialFields.includes(fieldKey);
    }
    return fieldConfig.isVisible !== false;
  };

  // Check if the contact tab has any visible fields
  const hasContactFields = (): boolean => {
    const contactFieldKeys = ['phone', 'location', 'nif', 'address'];
    return contactFieldKeys.some(key => isFieldVisible(key));
  };

  // Helper to check if a field is required based on template configuration
  const isFieldRequired = (fieldKey: string): boolean => {
    // Locked fields are always required
    const lockedFields = ['name', 'email', 'password'];
    if (lockedFields.includes(fieldKey)) return true;
    
    // If no template, only name/email/password are required
    if (!selectedTemplateId || templateFields.length === 0) return false;
    
    const fieldConfig = templateFields.find(f => f.key === fieldKey);
    return fieldConfig?.isRequired === true;
  };

  // Apply template values to form
  const handleApplyTemplate = (
    template: { id: string; name: string; organization_id: string | null; organization_ids?: string[] } | null,
    fields: FieldConfig[],
    customAttrs: FieldConfig[]
  ) => {
    if (!template) {
      setSelectedTemplateId(undefined);
      setTemplateFields([]);
      setTemplateCustomAttrs([]);
      onTemplateChange?.(undefined);
      return;
    }

    setSelectedTemplateId(template.id);
    onTemplateChange?.(template.id);
    setTemplateFields(fields);
    setTemplateCustomAttrs(customAttrs);

    // Apply default values from fields
    const updates: Partial<UserFormData> = {};
    fields.forEach(field => {
      if (field.defaultValue && field.isVisible) {
        if (field.key === 'position') updates.position = field.defaultValue;
        if (field.key === 'location') updates.location = field.defaultValue;
      }
    });
    
    if (Object.keys(updates).length > 0) {
      setFormData({ ...formData, ...updates });
    }

    // Apply organizations from template (supports multiple)
    const orgIds = template.organization_ids && template.organization_ids.length > 0
      ? template.organization_ids
      : template.organization_id 
        ? [template.organization_id]
        : [];

    if (orgIds.length > 0) {
      // Suppress the address picker prompt when template changes organizations
      suppressTemplateOrgPromptRef.current = true;
      const newMemberships = orgIds.map(orgId => ({
        organization_id: orgId,
        relationship_type: "BELONGS_TO",
        role_id: "",
      }));
      setMemberships(newMemberships);
    }

    toast({
      title: t("templates.applied"),
      description: t("templates.appliedDesc", { name: template.name }),
      duration: 2000,
    });
  };

  return (
    <>
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {isEdit ? t("users.edit") : t("users.create")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isEdit
                  ? t("users.editDescription")
                  : t("users.createDescription")}
              </p>
            </div>
          </div>
          {onToggleExpand && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onToggleExpand}
              title={isExpanded ? t("common.collapse") : t("common.expand")}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
          )}
        </div>
        
        {/* Template Tab Selector - Inline in header for faster access */}
        <div className="mt-4 pt-4 border-t">
          <TemplateTabSelector
            organizations={organizations}
            selectedTemplateId={selectedTemplateId}
            onTemplateSelect={handleApplyTemplate}
            onManageTemplates={() => setShowTemplateManager(true)}
          />
        </div>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-4">
          <TabsList className="h-10 w-full justify-start bg-transparent p-0 gap-4">
            <TabsTrigger
              value="basic"
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
            >
              <User className="w-4 h-4 mr-2" />
              {t("users.basicInfo")}
            </TabsTrigger>
            {hasContactFields() && (
              <TabsTrigger
                value="contact"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
              >
                <MapPin className="w-4 h-4 mr-2" />
                {t("users.contactInfo")}
              </TabsTrigger>
            )}
            {isFieldVisible('organization') && hasPermission('users.manage_roles') && (
              <TabsTrigger
                value="roles"
                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                {t("users.rolesTab") || "Funções"}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* Basic Info Tab */}
          <TabsContent value="basic" forceMount className={cn("p-6 space-y-6 mt-0", activeTab !== "basic" && "hidden")}>
            {/* Name - Required */}
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                {t("common.name")} *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t("users.namePlaceholder")}
              />
            </div>

            {/* Status - only show in edit mode */}
            {isEdit && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
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
            )}

            {/* Emails - Multi-value - Required */}
            <MultiValueEmailInput
              emails={emails}
              onChange={setEmails}
            />

            {/* Description - Optional (not controlled by templates) */}
            <div className="space-y-2">
              <Label htmlFor="description" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {t("common.description")}
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("common.optional")}
                rows={3}
              />
            </div>

            {/* Password */}
            <div className="space-y-2 p-4 rounded-lg border bg-muted/30">
              <Label htmlFor="password" className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                {t("users.password")} {!isEdit && "*"}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder={isEdit ? t("users.leaveEmptyToKeep") : t("users.passwordPlaceholder")}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-10"
                  onClick={() => {
                    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
                    let pwd = "";
                    for (let i = 0; i < 12; i++) {
                      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    setFormData({ ...formData, password: pwd });
                    setShowPassword(true);
                  }}
                >
                  <Wand2 className="w-4 h-4 mr-1" />
                  Gerar
                </Button>
              </div>
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  {t("users.passwordChangeHint")}
                </p>
              )}
            </div>

            {/* Custom Attributes Section - Social links based on template + custom attrs */}
            {(isFieldVisible('linkedin') || isFieldVisible('facebook') || templateCustomAttrs.length > 0) && (
              <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {t("users.customAttributes")}
                </h3>
                <div className="grid gap-3">
                  {/* LinkedIn - Only visible if enabled in template */}
                  {isFieldVisible('linkedin') && (
                    <div className="space-y-2">
                      <Label htmlFor="linkedin" className="text-sm flex items-center gap-1.5">
                        LinkedIn {isFieldRequired('linkedin') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="linkedin"
                        type="url"
                        placeholder="https://linkedin.com/in/username"
                        value={socialLinks.linkedin}
                        onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                      />
                    </div>
                  )}
                  
                  {/* Facebook - Only visible if enabled in template */}
                  {isFieldVisible('facebook') && (
                    <div className="space-y-2">
                      <Label htmlFor="facebook" className="text-sm flex items-center gap-1.5">
                        Facebook {isFieldRequired('facebook') && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        id="facebook"
                        type="url"
                        placeholder="https://facebook.com/username"
                        value={socialLinks.facebook}
                        onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                      />
                    </div>
                  )}
                  
                  {/* Template-defined custom attributes */}
                  {templateCustomAttrs.map((attr) => {
                    const value = customAttributes[attr.key] ?? "";
                    
                    const renderInput = () => {
                      switch (attr.type) {
                        case "number":
                          return (
                            <div className="relative">
                              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="number"
                                value={value}
                                onChange={(e) =>
                                  setCustomAttributes({
                                    ...customAttributes,
                                    [attr.key]: e.target.value ? parseFloat(e.target.value) : "",
                                  })
                                }
                                placeholder={attr.label}
                                className="pl-9"
                              />
                            </div>
                          );
                        case "boolean":
                          return (
                            <div className="flex items-center gap-3 p-2 rounded-md border bg-background">
                              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                              <Switch
                                checked={value === true}
                                onCheckedChange={(checked) =>
                                  setCustomAttributes({
                                    ...customAttributes,
                                    [attr.key]: checked,
                                  })
                                }
                              />
                              <span className="text-sm">
                                {value ? t("common.yes") : t("common.no")}
                              </span>
                            </div>
                          );
                        case "date":
                          return (
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="date"
                                value={value}
                                onChange={(e) =>
                                  setCustomAttributes({
                                    ...customAttributes,
                                    [attr.key]: e.target.value,
                                  })
                                }
                                className="pl-9"
                              />
                            </div>
                          );
                        case "social":
                        case "link":
                          return (
                            <Input
                              type="url"
                              value={value}
                              onChange={(e) =>
                                setCustomAttributes({
                                  ...customAttributes,
                                  [attr.key]: e.target.value,
                                })
                              }
                              placeholder={attr.type === "social" ? `https://${attr.label.toLowerCase()}.com/...` : "https://..."}
                            />
                          );
                        case "textarea":
                          return (
                            <Textarea
                              value={value}
                              onChange={(e) =>
                                setCustomAttributes({
                                  ...customAttributes,
                                  [attr.key]: e.target.value,
                                })
                              }
                              placeholder={attr.label}
                              rows={3}
                            />
                          );
                        case "select":
                          return (
                            <Select
                              value={value}
                              onValueChange={(val) =>
                                setCustomAttributes({
                                  ...customAttributes,
                                  [attr.key]: val,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={attr.label} />
                              </SelectTrigger>
                              <SelectContent>
                                {(attr.options || []).map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        default: // text
                          return (
                            <div className="relative">
                              <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="text"
                                value={value}
                                onChange={(e) =>
                                  setCustomAttributes({
                                    ...customAttributes,
                                    [attr.key]: e.target.value,
                                  })
                                }
                                placeholder={attr.label}
                                className="pl-9"
                              />
                            </div>
                          );
                      }
                    };

                    return (
                      <div key={attr.key} className="space-y-1.5">
                        <Label className="text-sm flex items-center gap-1.5">
                          {attr.label}
                          {attr.isRequired && <span className="text-destructive">*</span>}
                        </Label>
                        {renderInput()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Contact Info Tab */}
          <TabsContent value="contact" forceMount className={cn("p-6 space-y-6 mt-0", activeTab !== "contact" && "hidden")}>
            {/* Phones - Multi-value - Optional */}
            {isFieldVisible('phone') && (
              <MultiValuePhoneInput
                phones={phones}
                onChange={setPhones}
              />
            )}

            {/* Main Location - Optional */}
            {isFieldVisible('location') && (
              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  {t("users.locationMain")} {isFieldRequired('location') && '*'}
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  placeholder={t("users.locationPlaceholder")}
                />
              </div>
            )}


            {/* Fiscal Data */}
            {isFieldVisible('nif') && (
              <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {t("users.fiscal")}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="nif">{t("users.nif")} {isFieldRequired('nif') && '*'}</Label>
                    <Input
                      id="nif"
                      value={fiscalData.nif}
                      onChange={(e) =>
                        setFiscalData({ ...fiscalData, nif: e.target.value })
                      }
                      placeholder="123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("users.country")}</Label>
                    <Select
                      value={fiscalData.country_code}
                      onValueChange={(v) =>
                        setFiscalData({ ...fiscalData, country_code: v })
                      }
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
            )}

            {/* Addresses */}
            {isFieldVisible('address') && (
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
                <div className="text-center py-6 border rounded-lg bg-muted/30">
                  <MapPin className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t("users.noAddresses")}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1"
                    onClick={addAddress}
                  >
                    {t("users.addFirstAddress")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address, index) => {
                    const isExpanded = expandedAddressIndex === index;
                    const currentDistrictId = address.district_id || selectedDistrictIds[index] || '';
                    const hasCascadingData = districts.length > 0 && address.country === 'PT';
                    const addressMunicipalities = isExpanded && currentDistrictId ? municipalities : [];
                    
                    return (
                      <div 
                        key={index} 
                        className="p-4 border rounded-lg bg-card space-y-3"
                        onClick={() => setExpandedAddressIndex(index)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {["home", "work", "remote", ""].includes(address.address_type || "") || !address.address_type ? (
                              <Select
                                value={["home", "work", "remote"].includes(address.address_type || "") ? address.address_type : ""}
                                onValueChange={(v) => {
                                  if (v === "other") {
                                    updateAddress(index, "address_type", " ");
                                  } else {
                                    updateAddress(index, "address_type", v);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-32 h-8">
                                  <SelectValue placeholder={t("users.addressType") || "Tipo"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="home">{t("users.addressHome")}</SelectItem>
                                  <SelectItem value="work">{t("users.addressWork")}</SelectItem>
                                  <SelectItem value="remote">{t("users.addressRemote") || "Teletrabalho"}</SelectItem>
                                  <SelectItem value="other">{t("users.addressOther")}</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={address.address_type?.trim() || ""}
                                  onChange={(e) => updateAddress(index, "address_type", e.target.value || " ")}
                                  placeholder={t("users.customAddressType") || "Tipo..."}
                                  className="w-28 h-8 text-sm"
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateAddress(index, "address_type", "home")}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAddress(index);
                            }}
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
                              placeholder={t("addresses.streetPlaceholder")}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.number")}</Label>
                            <Input
                              value={address.number}
                              onChange={(e) => updateAddress(index, "number", e.target.value)}
                              placeholder="123"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.postalCode")}</Label>
                            <Input
                              value={address.postal_code}
                              onChange={(e) => updateAddress(index, "postal_code", e.target.value)}
                              placeholder="1000-001"
                              className="h-8"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.floor")}</Label>
                            <Input
                              value={address.floor}
                              onChange={(e) => updateAddress(index, "floor", e.target.value)}
                              placeholder="2º"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.unit")}</Label>
                            <Input
                              value={address.unit}
                              onChange={(e) => updateAddress(index, "unit", e.target.value)}
                              placeholder="Esq"
                              className="h-8"
                            />
                          </div>
                          {/* City - cascading or freetext */}
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.city")}</Label>
                            {hasCascadingData && addressMunicipalities.length > 0 ? (
                              <Select
                                value={address.city_id || '__none__'}
                                onValueChange={(v) => handleCityChange(index, v === '__none__' ? '' : v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder={t("common.select")}>
                                    {address.city_id 
                                      ? addressMunicipalities.find(m => m.id === address.city_id)?.name || address.city || t("common.select")
                                      : address.city || t("common.select")}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">{t("common.select")}</SelectItem>
                                  {addressMunicipalities.map((muni) => (
                                    <SelectItem key={muni.id} value={muni.id}>
                                      {muni.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={address.city}
                                onChange={(e) => updateAddress(index, "city", e.target.value)}
                                placeholder="Lisboa"
                                className="h-8"
                              />
                            )}
                          </div>
                          {/* District - cascading or freetext */}
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.district")}</Label>
                            {hasCascadingData ? (
                              <Select
                                value={address.district_id || '__none__'}
                                onValueChange={(v) => handleDistrictChange(index, v === '__none__' ? '' : v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder={t("common.select")}>
                                    {address.district_id 
                                      ? districts.find(d => d.id === address.district_id)?.name || t("common.select")
                                      : t("common.select")}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">{t("common.select")}</SelectItem>
                                  {districts.map((dist) => (
                                    <SelectItem key={dist.id} value={dist.id}>
                                      {dist.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={address.district}
                                onChange={(e) => updateAddress(index, "district", e.target.value)}
                                placeholder="Lisboa"
                                className="h-8"
                              />
                            )}
                          </div>
                        </div>

                        {/* Country selector */}
                        <div className="grid grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("addresses.country")}</Label>
                            <Select
                              value={address.country}
                              onValueChange={(v) => handleCountryChange(index, v)}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {countries.map((country) => (
                                  <SelectItem key={country.code} value={country.code}>
                                    {country.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}
          </TabsContent>

          {/* Roles/Organizations Tab */}
          <TabsContent value="roles" forceMount className={cn("p-6 space-y-6 mt-0", activeTab !== "roles" && "hidden")}>
            {isRolesReadOnly && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <Lock className="h-4 w-4" />
                <span>{t("users.rolesReadOnlyMessage") || "As funções do criador da conta não podem ser alteradas."}</span>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    {t("users.organizations")} *
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("users.multipleOrgsHint")}
                  </p>
                </div>
                {!isRolesReadOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMembership}
                    className="h-8"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    {t("common.add")}
                  </Button>
                )}
              </div>
              
              {memberships.length === 0 ? null : (
                <div className="space-y-3">
                  {memberships.map((membership, index) => {
                    const org = organizations.find(o => o.id === membership.organization_id);
                    return (
                      <div key={membership.id || index} className="p-3 rounded-lg border bg-card space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className={isRolesReadOnly ? "pointer-events-none opacity-70" : ""}>
                              <OrganizationCombobox
                                organizations={organizations}
                                value={membership.organization_id}
                                onChange={(orgId) => {
                                  if (orgId) {
                                    updateMembership(index, "organization_id", orgId);
                                  }
                                }}
                              />
                            </div>
                            {org && (
                              <Badge variant="outline" className="text-xs">
                                {org.type}
                              </Badge>
                            )}
                          </div>
                          {!isRolesReadOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => removeMembership(index)}
                              disabled={memberships.length <= 1}
                              title={memberships.length <= 1 ? (t("users.atLeastOneOrgRequired") || "Obrigatório pelo menos uma organização") : undefined}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        
                        {/* Role selector – org-scoped roles only */}
                        <div className="flex items-center gap-2 pl-13">
                          <Label className="text-xs text-muted-foreground shrink-0">
                            {t("users.roleLabel") || "Função:"}
                          </Label>
                          {(() => {
                            const orgRoles = rolesByOrg[membership.organization_id] || [];
                            return (
                              <Select
                                value={membership.role_id}
                                onValueChange={(roleId) => updateMembership(index, "role_id", roleId)}
                                disabled={isRolesReadOnly}
                              >
                                <SelectTrigger className="h-8 flex-1">
                                  <SelectValue placeholder={orgRoles.length === 0 ? "Sem funções nesta organização" : (t("users.selectRole") || "Selecionar função...")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {orgRoles
                                    .filter((role, idx, arr) => arr.findIndex(r => r.name === role.name) === idx)
                                    .map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      {role.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                          {/* Scopes button - only show if membership is saved */}
                          {membership.id && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => {
                                setSelectedMembershipForScopes({
                                  id: membership.id!,
                                  orgName: org?.name || "Organização",
                                  roleId: membership.role_id,
                                });
                                setScopesDialogOpen(true);
                              }}
                              title="Configurar scopes de permissões"
                            >
                              <Shield className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {fetchingOrgAddress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t("users.loadingOrgAddress") || "A carregar moradas..."}
                </div>
              )}
            </div>
          </TabsContent>

        </ScrollArea>
      </Tabs>

      {/* Footer Actions */}
      <div className="flex-shrink-0 border-t p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          {/* Create More toggle - only show in create mode */}
          {!isEdit && onCreateMoreChange ? (
            <div className="flex items-center gap-2">
              <Switch
                id="create-more"
                checked={createMore}
                onCheckedChange={onCreateMoreChange}
              />
              <Label htmlFor="create-more" className="text-sm text-muted-foreground cursor-pointer">
                {t("users.createMore")}
              </Label>
            </div>
          ) : (
            <div />
          )}
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? t("common.save") : t("common.create")}
            </Button>
          </div>
        </div>
      </div>
    </Card>

    {/* Template Manager Dialog */}
    <UserTemplateManager
      open={showTemplateManager}
      onOpenChange={setShowTemplateManager}
      organizations={organizations}
      onTemplateSelect={(template, fields, customAttrs) => {
        handleApplyTemplate(template, fields, customAttrs);
        setShowTemplateManager(false);
      }}
    />
    
    {/* Organization Address Picker Dialog */}
    <OrgAddressPickerDialog
      open={addressPickerOpen}
      onOpenChange={setAddressPickerOpen}
      organizationName={pendingOrgName}
      addresses={pendingOrgAddresses}
      onSelect={handleAddressSelected}
      onSkip={() => setPendingOrgAddresses([])}
      onRemoteWork={handleRemoteWorkSelected}
    />
    
    {/* Membership Scopes Dialog */}
    <MembershipScopesDialog
      open={scopesDialogOpen}
      onOpenChange={setScopesDialogOpen}
      membershipId={selectedMembershipForScopes?.id || null}
      organizationName={selectedMembershipForScopes?.orgName}
      roleId={selectedMembershipForScopes?.roleId}
      pendingScopes={selectedMembershipForScopes?.id ? pendingScopeChanges[selectedMembershipForScopes.id] : undefined}
      onScopeChange={(membershipId, scopes) => {
        onPendingScopeChanges?.({
          ...pendingScopeChanges,
          [membershipId]: scopes,
        });
      }}
    />
    </>
  );
}
