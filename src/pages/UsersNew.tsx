import { useState, useEffect, useMemo, useCallback } from "react";
import { useColumnResize, ColumnWidths } from "@/hooks/useColumnResize";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/contexts/LanguageContext";

import {
  Plus,
  Search,
  Pencil,
  Trash2,
  User,
  Loader2,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquareText,
  History,
  MapPin,
  Briefcase,
  Calendar,
  FileText,
  Filter,
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { UserTemplateManager } from "@/components/users/UserTemplateManager";
import { UserFormEnhanced } from "@/components/users/UserFormEnhanced";
import { PendingScopeEntry } from "@/components/users/MembershipScopesDialog";
import { useCompany } from "@/contexts/CompanyContext";

import { UsersFAQDialog } from "@/components/users/UsersFAQDialog";
import UserHistoryDialog from "@/components/users/UserHistoryDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope, canActOnEntity } from "@/hooks/usePermissionScope";
import { EmailEntry } from "@/components/users/MultiValueEmailInput";
import { PhoneEntry } from "@/components/users/MultiValuePhoneInput";
import { UsersTableColumns, UserColumnConfig } from "@/components/users/UsersTableColumns";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { UsersDashboard } from "@/components/users/UsersDashboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AnewUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  auth_user_id: string | null;
  status: string;
  created_at: string;
  created_by?: string | null;
  position?: string | null;
  location?: string | null;
  entity_id?: string | null;
  memberships?: Membership[];
}

interface Membership {
  id: string;
  organization_id: string;
  relationship_type: string;
  role_id: string;
  role_code?: string;
  role_name?: string;
  status: string;
  join_method?: string | null;
  organization?: {
    id: string;
    name: string;
    type: string;
    parent_name?: string | null;
  };
}

interface Organization {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
}

type SortField = "name" | "email" | "orgs" | "status";

async function extractFunctionErrorMessage(
  invokeResult: any,
  invokeError: any
): Promise<string | null> {
  // Try to get error from the data field (supabase-js v2 puts parsed JSON in data even on error)
  if (invokeResult?.data && typeof invokeResult.data === "object") {
    if (typeof invokeResult.data.error === "string") return invokeResult.data.error;
    if (typeof invokeResult.data.message === "string") return invokeResult.data.message;
  }

  // Try response from error context
  const response: Response | undefined = invokeError?.context;
  if (response && typeof response.clone === "function") {
    try {
      const cloned = response.clone();
      const contentType = cloned.headers?.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const json = await cloned.json().catch(() => null);
        if (json && typeof json.error === "string") return json.error;
        if (json && typeof json.message === "string") return json.message;
        if (json) return JSON.stringify(json);
      }
      const text = await cloned.text().catch(() => "");
      if (text) return text;
    } catch {
      // ignore
    }
  }

  if (typeof invokeError?.message === "string" && invokeError.message !== "Edge Function returned a non-2xx status code") {
    return invokeError.message;
  }
  return null;
}

type UserAddressInput = {
  street: string;
  number: string;
  floor?: string;
  unit?: string;
  postal_code: string;
  city: string;
  district?: string;
  country?: string;
  extra?: string;
  address_type?: string;
  is_primary?: boolean;
};

const normalizeAddressPart = (value: unknown) => String(value || "").trim();

const buildAddressKey = (address: UserAddressInput) =>
  [address.street, address.number, address.postal_code, address.city, address.country || "PT"]
    .map((part) => normalizeAddressPart(part).toLowerCase().replace(/\s+/g, " "))
    .join("|");

const prepareValidAddresses = (addresses: UserAddressInput[]) => {
  const prepared: Array<UserAddressInput & { address_key: string }> = [];

  for (const address of addresses) {
    const normalized = {
      ...address,
      street: normalizeAddressPart(address.street),
      number: normalizeAddressPart(address.number),
      postal_code: normalizeAddressPart(address.postal_code),
      city: normalizeAddressPart(address.city),
      country: normalizeAddressPart(address.country) || "PT",
      floor: normalizeAddressPart(address.floor),
      unit: normalizeAddressPart(address.unit),
      district: normalizeAddressPart(address.district),
      extra: normalizeAddressPart(address.extra),
      address_type: normalizeAddressPart(address.address_type) || "home",
      is_primary: Boolean(address.is_primary),
    };

    const meaningfulFields = [
      normalized.street,
      normalized.number,
      normalized.postal_code,
      normalized.city,
      normalized.floor,
      normalized.unit,
      normalized.district,
      normalized.extra,
    ];
    if (meaningfulFields.every((value) => !value)) continue;

    if (!normalized.street || !normalized.number || !normalized.postal_code || !normalized.city) {
      throw new Error("Morada incompleta: rua, número, código postal e cidade são obrigatórios.");
    }

    prepared.push({ ...normalized, address_key: buildAddressKey(normalized) });
  }

  return prepared;
};

export default function UsersNew() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { activeCompany, userType, companies, isLoading: companyLoading } = useCompany();
  const { hasPermission } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, authUserId: scopeAuthUserId } = usePermissionScope();
  const canCreate = hasPermission("users.create");
  const canEdit = hasPermission("users.edit");
  const canDelete = hasPermission("users.delete");
  const canViewHistory = hasPermission("users.view_history");
  const historyScope = getPermissionScope("users.view_history");
  const editScope = getPermissionScope("users.edit");
  const deleteScope = getPermissionScope("users.delete");

  // Check if target user is the original account creator (self-signup super_admin)
  const isAccountCreator = (user: AnewUser): boolean => {
    return (user.memberships || []).some(
      (m) => m.status === "active" && m.role_code === "super_admin" && m.join_method === "created_org"
    );
  };

  // Check if target user has super_admin role
  const isTargetSuperAdmin = (user: AnewUser): boolean => {
    return (user.memberships || []).some(
      (m) => m.status === "active" && m.role_code === "super_admin"
    );
  };

  // Check if the caller is the same person as the target
  const isSelf = (user: AnewUser): boolean => {
    return user.auth_user_id === scopeAuthUserId;
  };

  // Check if the target user is an owner in the active org — only owners/admins can edit owners
  const isTargetOwner = (user: AnewUser): boolean => {
    if (!activeCompany) return false;
    const protectedRoles = ["org_admin"];
    return (user.memberships || []).some(
      (m) => m.status === "active" && m.organization_id === activeCompany.id && protectedRoles.includes(m.role_code || "")
    );
  };
  const callerCanEditOwner = ["org_admin", "super_admin", "system_admin"].includes(userType);

  // Helper: check if the current caller is the account creator
  const callerIsAccountCreator = (): boolean => {
    return userType === "super_admin" && users.some(u => isSelf(u) && isAccountCreator(u));
  };

  const canEditUser = (user: AnewUser) => {
    // Users can always edit themselves
    if (isSelf(user)) return canEdit;
    // Account creator (self-signup super_admin) cannot be edited by anyone else
    if (isAccountCreator(user)) return false;
    // Other super_admins can only be edited by the account creator
    if (isTargetSuperAdmin(user) && !callerIsAccountCreator()) return false;
    if (isTargetOwner(user) && !callerCanEditOwner) return false;
    return canEdit && canActOnEntity(editScope, user, scopeAnewUserId, scopeAuthUserId);
  };
  const canDeleteUser = (user: AnewUser) => {
    // Users can never delete themselves
    if (isSelf(user)) return false;
    // Account creator cannot be deleted by anyone
    if (isAccountCreator(user)) return false;
    // Other super_admins can only be deleted by the account creator
    if (isTargetSuperAdmin(user) && !callerIsAccountCreator()) return false;
    if (isTargetOwner(user) && !callerCanEditOwner) return false;
    return canDelete && canActOnEntity(deleteScope, user, scopeAnewUserId, scopeAuthUserId);
  };
  const [users, setUsers] = useState<AnewUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userTab, setUserTab] = useState<"users" | "clients">("users");
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AnewUser | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showFAQ, setShowFAQ] = useState(false);
  const [historyUser, setHistoryUser] = useState<AnewUser | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<UserColumnConfig[]>([]);
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null);

  // "Me" label translations
  const meLabel: Record<string, string> = {
    pt: "Eu",
    en: "Me",
    es: "Yo",
    fr: "Moi",
    de: "Ich",
  };

  // Column resize hook
  const defaultColumnWidths: ColumnWidths = {
    name: 200,
    email: 250,
    phone: 140,
    status: 100,
    position: 130,
    location: 130,
    organizations: 220,
    created_at: 120,
  };

  const { columnWidths, handleMouseDown } = useColumnResize({
    storageKey: "users_table_column_widths",
    defaultWidths: defaultColumnWidths,
    minWidth: 80,
  });

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  // Organizations visible in the form (scoped + user's membership orgs when editing)
  const [formOrganizations, setFormOrganizations] = useState<Organization[]>([]);
  

  // Form state
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
  
  // Multi-value email and phone states
  const [formEmails, setFormEmails] = useState<EmailEntry[]>([]);
  const [formPhones, setFormPhones] = useState<PhoneEntry[]>([]);
  const [formSocialLinks, setFormSocialLinks] = useState({
    angellist: "",
    facebook: "",
    linkedin: "",
  });

  // Memberships for the user being edited/created
  const [formMemberships, setFormMemberships] = useState<
    Array<{
      id?: string;
      organization_id: string;
      relationship_type: string;
      role_id: string;
    }>
  >([]);

  // Addresses for the user
  const [formAddresses, setFormAddresses] = useState<
    Array<{
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
    }>
  >([]);

  // Fiscal data for the user
  const [formFiscalData, setFormFiscalData] = useState({
    nif: "",
    commercial_name: "",
    country_code: "PT",
  });
  
  // Custom attributes for the user (from template)
  const [formCustomAttributes, setFormCustomAttributes] = useState<Record<string, any>>({});
  
  // Template used during creation
  const [formTemplateId, setFormTemplateId] = useState<string | undefined>();
  
  // Template field configs (to check visibility for save logic)
  const [formTemplateFields, setFormTemplateFields] = useState<Array<{ key: string; isVisible: boolean }>>([]);
  
  // Template custom attribute keys (to filter custom_attributes on save)
  const [formTemplateAttrKeys, setFormTemplateAttrKeys] = useState<string[]>([]);
  
  // Pending scope overrides (deferred save) – key = membershipId
  const [pendingScopeChanges, setPendingScopeChanges] = useState<Record<string, PendingScopeEntry[]>>({});

  useEffect(() => {
    fetchData();
  }, [activeCompany?.id, userType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get current auth user for "me" detection
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setCurrentAuthUserId(authUser.id);
      }
      // Fetch hierarchy first to build parent relationships
      const { data: hierarchyData } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      // Build parent map
      const parentMap: Record<string, string> = {};
      const childrenMap: Record<string, string[]> = {};
      hierarchyData?.forEach((h: { parent_org_id: string; child_org_id: string }) => {
        parentMap[h.child_org_id] = h.parent_org_id;
        if (!childrenMap[h.parent_org_id]) {
          childrenMap[h.parent_org_id] = [];
        }
        childrenMap[h.parent_org_id].push(h.child_org_id);
      });

      // Build set of all descendant org IDs from activeCompany
      const getDescendants = (orgId: string): string[] => {
        const children = childrenMap[orgId] || [];
        let descendants: string[] = [...children];
        for (const child of children) {
          descendants = descendants.concat(getDescendants(child));
        }
        return descendants;
      };

      // Scope for organizations list (active + descendants + ancestors) - used for org selector/forms
      const scopeOrgIds = new Set<string>();
      if (activeCompany?.id) {
        scopeOrgIds.add(activeCompany.id);
        getDescendants(activeCompany.id).forEach((id) => scopeOrgIds.add(id));
        // Also add ancestor chain for org selector/forms context
        let currentParent = parentMap[activeCompany.id];
        while (currentParent) {
          scopeOrgIds.add(currentParent);
          currentParent = parentMap[currentParent];
        }
      }

      // Scope for user visibility - active org + descendants + ancestors
      // Users with membership in the holding (ancestor) should appear in child company lists
      const userVisibilityOrgIds = new Set<string>();
      if (activeCompany?.id) {
        userVisibilityOrgIds.add(activeCompany.id);
        getDescendants(activeCompany.id).forEach((id) => userVisibilityOrgIds.add(id));
        // Add ancestor chain so holding members appear in child companies
        let currentParent = parentMap[activeCompany.id];
        while (currentParent) {
          userVisibilityOrgIds.add(currentParent);
          currentParent = parentMap[currentParent];
        }
      }

      // Fetch organizations (scoped to activeCompany and descendants)
      let orgsQuery = supabase
        .from("anew_organizations")
        .select("id, name, type, created_by")
        .order("name");

      // Apply scope filtering based on organizations.view scope
      const orgViewScope = getPermissionScope("organizations.view");
      
      if (orgViewScope === "NONE") {
        // No org visibility - only show orgs where user already has membership
        const membershipOrgIds = companies.map(c => c.id);
        if (membershipOrgIds.length > 0) {
          orgsQuery = orgsQuery.in("id", membershipOrgIds);
        } else {
          // No memberships - use a filter that returns 0 rows without a 400 error
          orgsQuery = orgsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
        }
      } else if (orgViewScope === "OWNED" && scopeAnewUserId) {
        // OWNED scope - show only orgs created by the user + their membership orgs
        const ownedOrgIds = new Set<string>(companies.map(c => c.id));
        if (scopeOrgIds.size > 0) {
          // We'll filter after fetch to check created_by
          orgsQuery = orgsQuery.in("id", Array.from(scopeOrgIds));
        }
      } else if (scopeOrgIds.size > 0) {
        // ORG scope - show activeCompany + all descendants
        orgsQuery = orgsQuery.in("id", Array.from(scopeOrgIds));
      }

      let filteredOrgsData = await orgsQuery;
      
      if (filteredOrgsData.error) throw filteredOrgsData.error;
      
      let allOrgsData = filteredOrgsData.data || [];
      
      // Post-fetch filter for OWNED scope: only keep orgs created by user + membership orgs
      if (orgViewScope === "OWNED" && scopeAnewUserId) {
        const membershipOrgIds = new Set(companies.map(c => c.id));
        allOrgsData = allOrgsData.filter(org => 
          (org as any).created_by === scopeAnewUserId || 
          membershipOrgIds.has(org.id)
        );
      }

      // Create org name lookup
      const orgNameMap: Record<string, string> = {};
      allOrgsData?.forEach(org => {
        orgNameMap[org.id] = org.name;
      });

      const formatPhone = (countryCode?: string | null, phoneNumber?: string | null) => {
        const cc = (countryCode || "").trim();
        const pn = (phoneNumber || "").trim();
        if (!cc && !pn) return null;
        if (!cc) return pn;
        if (!pn) return cc;
        return `${cc} ${pn}`;
      };

      const computePrimaryPhone = (phones: Array<{ country_code?: string | null; phone_number?: string | null; is_primary?: boolean | null }> | null | undefined) => {
        if (!phones || phones.length === 0) return null;
        const primary = phones.find((p) => p.is_primary) || phones[0];
        return formatPhone(primary.country_code, primary.phone_number);
      };

      // Fetch users (no FK join - tables lack foreign keys)
      const { data: usersData, error: usersError } = await supabase
        .from("anew_users")
        .select("*")
        .order("name");

      if (usersError) throw usersError;

      // Fetch all memberships separately
      const userIds = (usersData || []).map((u: any) => u.id);
      let membershipsMap: Record<string, any[]> = {};
      if (userIds.length > 0) {
        const { data: membershipsData } = await (supabase as any)
          .from("anew_memberships")
          .select("id, user_id, organization_id, relationship_type, role_id, status, join_method")
          .in("user_id", userIds);

        // Fetch roles for these memberships
        const roleIds = [...new Set((membershipsData || []).map((m: any) => m.role_id).filter(Boolean))];
        let rolesMap: Record<string, { code: string; name: string }> = {};
        if (roleIds.length > 0) {
          const { data: rolesData } = await (supabase as any)
            .from("anew_roles")
            .select("id, code, name")
            .in("id", roleIds);
          for (const r of (rolesData || [])) {
            rolesMap[r.id] = { code: r.code, name: r.name };
          }
        }

        // Fetch organizations for memberships
        const memberOrgIds = [...new Set((membershipsData || []).map((m: any) => m.organization_id).filter(Boolean))];
        let memberOrgsMap: Record<string, { id: string; name: string; type: string }> = {};
        if (memberOrgIds.length > 0) {
          const { data: memberOrgsData } = await (supabase as any)
            .from("anew_organizations")
            .select("id, name, type")
            .in("id", memberOrgIds);
          for (const o of (memberOrgsData || [])) {
            memberOrgsMap[o.id] = { id: o.id, name: o.name, type: o.type };
          }
        }

        // Build memberships map grouped by user_id
        for (const m of (membershipsData || [])) {
          if (!membershipsMap[m.user_id]) membershipsMap[m.user_id] = [];
          membershipsMap[m.user_id].push({
            ...m,
            anew_roles: rolesMap[m.role_id] || null,
            organization: memberOrgsMap[m.organization_id] || null,
          });
        }
      }

      // Fetch phones from unified entity table
      const entityIds = (usersData || []).map((u: any) => u.entity_id).filter(Boolean);
      let phonesMap: Record<string, any[]> = {};
      if (entityIds.length > 0) {
        const { data: phonesData } = await (supabase as any)
          .from("anew_entity_phones")
          .select("entity_id, phone_number, country_code, is_primary")
          .in("entity_id", entityIds);
        for (const p of (phonesData || [])) {
          if (!phonesMap[p.entity_id]) phonesMap[p.entity_id] = [];
          phonesMap[p.entity_id].push(p);
        }
      }

      // Enrich memberships with parent org name
      const enrichedUsers = (usersData || []).map((user: any) => {
        const userPhones = phonesMap[user.entity_id] || [];
        const computedPhone = computePrimaryPhone(userPhones) || user.phone || null;

        return {
          ...user,
          phone: computedPhone,
          memberships: (membershipsMap[user.id] || []).map((m: any) => ({
            ...m,
            role_code: m.anew_roles?.code,
            role_name: m.anew_roles?.name,
            organization: m.organization
              ? {
                  ...m.organization,
                  parent_name: parentMap[m.organization.id]
                    ? orgNameMap[parentMap[m.organization.id]]
                    : null,
                }
              : null,
          })),
        };
      }).filter((user: AnewUser) => {
        // Always show the logged-in user themselves
        if (user.auth_user_id && user.auth_user_id === authUser?.id) return true;

        // Super admin / tenant admin sees users in active org + descendants
        if (userType === "system_admin") {
          if (!activeCompany?.id) return true;
          return (user.memberships || []).some(
            (m: Membership) => m.status === "active" && userVisibilityOrgIds.has(m.organization_id)
          );
        }
        // Other users: keep user if they have at least one active membership in the active org + descendants
        if (userVisibilityOrgIds.size === 0) return true;
        return (user.memberships || []).some(
          (m: Membership) => m.status === "active" && userVisibilityOrgIds.has(m.organization_id)
        );
      });
      // Users are organizational resources - if user has view access, they see all users in the org scope

      // Add parent_id to organizations for the form
      const orgsWithHierarchy = (allOrgsData || [])
        .filter(org => org.type !== 'inactive')
        .map(org => ({
          ...org,
          parent_id: parentMap[org.id] || null,
        }));

      setUsers(enrichedUsers);
      setOrganizations(orgsWithHierarchy);
      setFormOrganizations(orgsWithHierarchy);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4" />
    );
  };

  const filteredUsers = useMemo(() => {
    let result = users;

    // Tab filter: separate client portal users from regular users
    if (userTab === "clients") {
      result = result.filter((u) =>
        (u.memberships || []).some((m) => m.role_code === "client" && m.status === "active")
      );
    } else {
      result = result.filter((u) =>
        !(u.memberships || []).some((m) => m.role_code === "client" && m.status === "active") ||
        (u.memberships || []).some((m) => m.role_code !== "client" && m.status === "active")
      );
      // Exclude users that ONLY have client role
      result = result.filter((u) => {
        const activeMemberships = (u.memberships || []).filter((m) => m.status === "active");
        if (activeMemberships.length === 0) return true;
        const allClient = activeMemberships.every((m) => m.role_code === "client");
        return !allClient;
      });
    }

    // Status filter
    if (statusFilter === "active") {
      result = result.filter((u) => u.status === "active");
    } else if (statusFilter === "inactive") {
      result = result.filter((u) => u.status === "inactive");
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          u.phone?.toLowerCase().includes(query)
      );
    }

    // Sorting
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "email":
          comparison = a.email.localeCompare(b.email);
          break;
        case "orgs":
          comparison =
          (a.memberships?.filter((m) => m.status === "active").length || 0) -
          (b.memberships?.filter((m) => m.status === "active").length || 0);
          break;
        case "status":
          comparison = (a.status || "").localeCompare(b.status || "");
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [users, searchQuery, statusFilter, sortField, sortDirection, userTab]);

  const resetForm = () => {
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
    setFormEmails([]);
    setFormPhones([]);
    setFormSocialLinks({ angellist: "", facebook: "", linkedin: "" });
    setFormMemberships([]);
    setFormAddresses([]);
    setFormFiscalData({ nif: "", commercial_name: "", country_code: "PT" });
    setFormCustomAttributes({});
    setFormTemplateId(undefined);
    setFormTemplateFields([]);
    setFormTemplateAttrKeys([]);
    setPendingScopeChanges({});
    setSelectedUser(null);
    setFormOrganizations(organizations);
  };

  const openCreateSheet = () => {
    resetForm();
    setIsEditMode(false);
    setSheetOpen(true);
  };

  const openEditSheet = async (user: AnewUser) => {
    setSelectedUser(user);
    
    // Merge user's membership organizations into the scoped list
    // so that orgs the user belongs to (even outside current scope) appear in the combobox
    const memberOrgs: Organization[] = (user.memberships || [])
      .filter(m => m.organization)
      .map(m => ({
        id: m.organization!.id,
        name: m.organization!.name,
        type: m.organization!.type,
        parent_id: null, // parent info not critical for display in combobox
      }));
    
    const scopedOrgIds = new Set(organizations.map(o => o.id));
    const extraOrgs = memberOrgs.filter(o => !scopedOrgIds.has(o.id));
    setFormOrganizations([...organizations, ...extraOrgs]);
    
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      password: "", // Never load password
      status: user.status || "active",
      description: "", // Will load from DB
      position: "", // Will load from DB
      location: "", // Will load from DB
    });
    setFormMemberships(
      (user.memberships || [])
        .filter((m) => m.status === "active")
        .map((m) => ({
          id: m.id,
          organization_id: m.organization_id,
          relationship_type: m.relationship_type,
          role_id: m.role_id,
        }))
    );
    
    // Load emails from the new table (keyed by entity_id, NOT anew_users.id)
    const { data: emailsData } = user.entity_id ? await supabase
      .from("anew_entity_emails")
      .select("*")
      .eq("entity_id", user.entity_id) : { data: [] as any[] };
    
    setFormEmails(
      (emailsData || []).map((e: any) => ({
        email: e.email,
        email_type: e.email_type || "personal",
        is_primary: e.is_primary || false,
      }))
    );
    
    // If no emails in new table, use the main email
    if (!emailsData || emailsData.length === 0) {
      setFormEmails([{ email: user.email, email_type: "personal", is_primary: true }]);
    }
    
    // Load phones from the new table (keyed by entity_id)
    const { data: phonesData } = user.entity_id ? await supabase
      .from("anew_entity_phones")
      .select("*")
      .eq("entity_id", user.entity_id) : { data: [] as any[] };
    
    setFormPhones(
      (phonesData || []).map((p: any) => ({
        phone_number: p.phone_number,
        country_code: p.country_code || "+351",
        phone_type: p.phone_type || "mobile",
        is_primary: p.is_primary || false,
      }))
    );
    
    // Load template_id and custom_attributes from anew_users
    const { data: userData } = await supabase
      .from("anew_users")
      .select("description, position, location, template_id, custom_attributes")
      .eq("id", user.id)
      .maybeSingle();
    
    if (userData) {
      const customAttrs = (userData.custom_attributes as Record<string, any>) || {};
      setFormData(prev => ({
        ...prev,
        description: userData.description || "",
        position: userData.position || "",
        location: userData.location || "",
      }));
      // Load social links from custom_attributes
      setFormSocialLinks({
        angellist: customAttrs.social_angellist || "",
        facebook: customAttrs.social_facebook || "",
        linkedin: customAttrs.social_linkedin || "",
      });
      setFormTemplateId(userData.template_id || undefined);
      setFormCustomAttributes(customAttrs);
    }

    // Load user addresses (keyed by entity_id)
    const { data: addressLinks } = user.entity_id ? await supabase
      .from("anew_entity_addresses")
      .select("*, address:anew_addresses!anew_entity_addresses_address_id_fkey(*)")
      .eq("entity_id", user.entity_id)
      .is("valid_to", null) : { data: [] as any[] };

    setFormAddresses(
      (addressLinks || []).map((link: any) => ({
        id: link.id,
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
      }))
    );

    // Load user fiscal entity from unified table
    const { data: fiscalLinks } = await (supabase as any)
      .from("anew_entity_fiscal_entities")
      .select("*, fiscal_entity:fiscal_entities(*)")
      .eq("entity_id", user.entity_id)
      .is("valid_to", null)
      .limit(1);

    if (fiscalLinks && fiscalLinks.length > 0) {
      const fe = fiscalLinks[0].fiscal_entity;
      setFormFiscalData({
        nif: fe?.nif || "",
        commercial_name: fe?.commercial_name || "",
        country_code: fe?.country_code || "PT",
      });
    } else {
      setFormFiscalData({ nif: "", commercial_name: "", country_code: "PT" });
    }

    setIsEditMode(true);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    // Helper to check if address field is visible based on template
    const isAddressVisible = (): boolean => {
      // No template = base mode, address is visible by default
      if (!formTemplateId || formTemplateFields.length === 0) return true;
      const addressField = formTemplateFields.find(f => f.key === 'address');
      // If field not in config, default to visible
      if (!addressField) return true;
      return addressField.isVisible !== false;
    };

    // Get primary email or first email for auth
    const primaryEmail = formEmails.find(e => e.is_primary)?.email || formEmails[0]?.email;

    if (!formData.name) {
      toast.error(t("users.requiredFields"));
      return;
    }

    if (formEmails.length === 0 || !primaryEmail) {
      toast.error(t("users.atLeastOneEmail"));
      return;
    }

    if (formMemberships.some((m) => m.organization_id && !m.role_id)) {
      toast.error("É obrigatório selecionar uma role para cada organização.");
      return;
    }

    const validMemberships = formMemberships.filter(m => m.organization_id && m.role_id);
    if (validMemberships.length === 0) {
      toast.error(t("users.atLeastOneOrg") || "É obrigatório associar o utilizador a pelo menos uma organização com uma função.");
      return;
    }

    if (!selectedUser && !formData.password) {
      toast.error(t("users.passwordRequired"));
      return;
    }

    if (formData.password && formData.password.length < 6) {
      toast.error(t("users.passwordMinLength"));
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      // Canonical business user id for created_by columns (never auth_user_id).
      // See: src/lib/identity/resolveBusinessUserId.ts and mem://architecture/identity/auth-vs-business-id-boundary.
      const { resolveBusinessUserId } = await import("@/lib/identity/resolveBusinessUserId");
      const createdBy = await resolveBusinessUserId(authUser?.id);

      if (!createdBy) {
        throw new Error("Não foi possível resolver o utilizador de negócio do operador.");
      }

      if (selectedUser) {
        const primaryPhone = formPhones.find(p => p.is_primary) || formPhones[0];
        const primaryPhoneFormatted = primaryPhone
          ? `${primaryPhone.country_code} ${primaryPhone.phone_number}`
          : null;

        const filteredCustomAttributes: Record<string, any> = {};
        const socialKeys = ['social_facebook', 'social_linkedin', 'social_angellist'];

        Object.keys(formCustomAttributes).forEach(key => {
          if (socialKeys.includes(key) || formTemplateAttrKeys.includes(key)) {
            filteredCustomAttributes[key] = formCustomAttributes[key];
          }
        });

        filteredCustomAttributes.social_facebook = formSocialLinks.facebook || null;
        filteredCustomAttributes.social_linkedin = formSocialLinks.linkedin || null;
        filteredCustomAttributes.social_angellist = formSocialLinks.angellist || null;

        console.log("[UserEdit] Updating anew_users for", selectedUser.id);
        const { error: updateError } = await supabase
          .from("anew_users")
          .update({
            name: formData.name,
            email: primaryEmail,
            phone: primaryPhoneFormatted,
            status: formData.status,
            description: formData.description || null,
            position: formData.position || null,
            location: formData.location || null,
            template_id: formTemplateId || null,
            custom_attributes: filteredCustomAttributes,
          })
          .eq("id", selectedUser.id);

        if (updateError) {
          console.error("[UserEdit] anew_users update failed:", updateError);
          throw updateError;
        }

        if (selectedUser.entity_id) {
          await (supabase as any)
            .from("anew_entities")
            .update({ display_name: formData.name, updated_at: new Date().toISOString() })
            .eq("id", selectedUser.entity_id);
        }

        // Use canonical entity_id, NOT anew_users.id, for entity-keyed tables.
        // Atomic upsert via RPC (rolls back if any sub-step fails).
        if (selectedUser.entity_id) {
          console.log("[UserEdit] Upserting identity for entity", selectedUser.entity_id);
          const { error: identityError } = await (supabase as any).rpc("upsert_entity_identity", {
            p_entity_id: selectedUser.entity_id,
            p_emails: formEmails.map((e) => ({
              email: e.email,
              email_type: e.email_type,
              is_primary: e.is_primary,
            })),
            p_phones: formPhones.map((p) => ({
              phone_number: p.phone_number,
              country_code: p.country_code,
              phone_type: p.phone_type,
              is_primary: p.is_primary,
            })),
            p_addresses: null, // addresses handled separately further down
            p_created_by: createdBy,
          });
          if (identityError) {
            console.error("[UserEdit] upsert_entity_identity failed:", identityError);
            throw identityError;
          }
        } else {
          console.warn("[UserEdit] selectedUser has no entity_id; skipping identity upsert");
        }

        const existingMembershipIds = (selectedUser.memberships || []).map(m => m.id);
        const formMembershipIds = formMemberships.filter(m => m.id).map(m => m.id);
        const toDelete = existingMembershipIds.filter(id => !formMembershipIds.includes(id));

        if (toDelete.length > 0) {
          await supabase
            .from("anew_membership_permission_scopes")
            .delete()
            .in("membership_id", toDelete);

          await supabase
            .from("anew_memberships")
            .delete()
            .in("id", toDelete);
        }

        for (const m of formMemberships) {
          if (!m.organization_id) continue;

          if (m.id && existingMembershipIds.includes(m.id)) {
            await supabase
              .from("anew_memberships")
              .update({
                organization_id: m.organization_id,
                relationship_type: m.relationship_type,
                role_id: m.role_id,
                status: "active",
              })
              .eq("id", m.id);
          } else {
            await supabase
              .from("anew_memberships")
              .insert({
                user_id: selectedUser.id,
                organization_id: m.organization_id,
                relationship_type: m.relationship_type,
                role_id: m.role_id,
                status: "active",
                created_by: createdBy,
              });
          }
        }

        if (Object.keys(pendingScopeChanges).length > 0) {
          for (const [membershipId, scopes] of Object.entries(pendingScopeChanges)) {
            await supabase
              .from("anew_membership_permission_scopes")
              .delete()
              .eq("membership_id", membershipId);

            const scopesToInsert = scopes.filter(s => s.scope_level !== "OWNED");
            if (scopesToInsert.length > 0) {
              await supabase
                .from("anew_membership_permission_scopes")
                .insert(
                  scopesToInsert.map(s => ({
                    membership_id: membershipId,
                    permission_code: s.permission_code,
                    scope_level: s.scope_level,
                  }))
                );
            }
          }
        }

        if (formData.password && formData.password.trim().length >= 6 && selectedUser.auth_user_id) {
          console.log("[UserEdit] Updating password for auth_user_id", selectedUser.auth_user_id);
          const pwdInvoke = await supabase.functions.invoke("update-user-password", {
            body: { targetUserId: selectedUser.auth_user_id, newPassword: formData.password },
          });
          if (pwdInvoke.error) {
            const detailedError = await extractFunctionErrorMessage(pwdInvoke, pwdInvoke.error);
            console.error("[UserEdit] Password update failed:", detailedError || pwdInvoke.error);
            throw new Error(detailedError || "Erro ao atualizar password");
          }
          console.log("[UserEdit] Password updated successfully");
        }

        if (isAddressVisible()) {
          if (!selectedUser.entity_id) {
            throw new Error("Utilizador sem entity_id; não é possível gravar moradas.");
          }

          const validAddresses = prepareValidAddresses(formAddresses);

          await supabase
            .from("anew_entity_addresses")
            .update({ valid_to: new Date().toISOString() })
            .eq("entity_id", selectedUser.entity_id)
            .is("valid_to", null);

          for (const addr of validAddresses) {
            const { data: newAddress, error: addressError } = await (supabase as any)
              .from("anew_addresses")
              .insert({
                address_key: addr.address_key,
                street: addr.street,
                number: addr.number,
                floor: addr.floor || null,
                unit: addr.unit || null,
                postal_code: addr.postal_code,
                city: addr.city,
                district: addr.district || null,
                country: addr.country || "PT",
                extra: addr.extra || null,
                created_by: createdBy,
              })
              .select("id")
              .single();

            if (addressError) throw addressError;

            const { error: linkError } = await (supabase as any).from("anew_entity_addresses").insert({
              entity_id: selectedUser.entity_id,
              address_id: newAddress.id,
              address_type: addr.address_type || "home",
              is_primary: addr.is_primary,
              valid_from: new Date().toISOString(),
              created_by: createdBy,
            });

            if (linkError) throw linkError;
          }
        }

        if (formFiscalData.nif) {
          await (supabase as any)
            .from("anew_entity_fiscal_entities")
            .update({ valid_to: new Date().toISOString() })
            .eq("entity_id", selectedUser.entity_id)
            .is("valid_to", null);

          let { data: existingFiscal } = await supabase
            .from("fiscal_entities")
            .select("id")
            .eq("nif", formFiscalData.nif)
            .eq("country_code", formFiscalData.country_code)
            .limit(1)
            .single();

          let fiscalEntityId = existingFiscal?.id;

          if (!fiscalEntityId) {
            const { data: newFiscal, error: fiscalError } = await supabase
              .from("fiscal_entities")
              .insert({
                nif: formFiscalData.nif,
                commercial_name: formFiscalData.commercial_name || null,
                country_code: formFiscalData.country_code,
                created_by: createdBy,
              })
              .select("id")
              .single();

            if (fiscalError) throw fiscalError;
            fiscalEntityId = newFiscal?.id;
          }

          if (fiscalEntityId) {
            await (supabase as any).from("anew_entity_fiscal_entities").insert({
              entity_id: selectedUser.entity_id,
              fiscal_entity_id: fiscalEntityId,
              is_primary: true,
              valid_from: new Date().toISOString(),
              created_by: createdBy,
            });
          }
        }

        toast.success(t("users.updated"));
        setPendingScopeChanges({});
      } else {
        const primaryEmailForAuth = formEmails.find(e => e.is_primary)?.email || formEmails[0]?.email;
        const primaryPhone = formPhones.find(p => p.is_primary) || formPhones[0];

        const validMembershipsForEdge = formMemberships
          .filter(m => m.organization_id && m.role_id)
          .map(m => ({ organization_id: m.organization_id, relationship_type: m.relationship_type, role_id: m.role_id }));

        const validAddressesForEdge = isAddressVisible() ? prepareValidAddresses(formAddresses) : [];
        const primaryEmailLower = primaryEmailForAuth.toLowerCase().trim();
        const additionalEmailsForEdge = formEmails
          .filter((e) => e.email && e.email.toLowerCase().trim() !== primaryEmailLower)
          .map((e) => ({ email: e.email, email_type: e.email_type, is_primary: false }));
        const primaryPhoneKey = primaryPhone
          ? `${primaryPhone.country_code || ""}${primaryPhone.phone_number || ""}`.replace(/\s+/g, "")
          : "";
        const additionalPhonesForEdge = formPhones
          .filter((p) => p.phone_number && `${p.country_code || ""}${p.phone_number || ""}`.replace(/\s+/g, "") !== primaryPhoneKey)
          .map((p) => ({
            phone_number: p.phone_number,
            country_code: p.country_code,
            phone_type: p.phone_type,
            is_primary: false,
          }));

        const createInvoke = await supabase.functions.invoke("create-user", {
          body: {
            email: primaryEmailForAuth,
            password: formData.password,
            name: formData.name,
            tipo: "worker_user",
            phone: primaryPhone ? `${primaryPhone.country_code} ${primaryPhone.phone_number}` : null,
            template_id: formTemplateId || null,
            memberships: validMembershipsForEdge,
            fiscal: formFiscalData.nif ? { nif: formFiscalData.nif, country_code: formFiscalData.country_code } : null,
            addresses: validAddressesForEdge.length > 0 ? validAddressesForEdge : null,
            additional_emails: additionalEmailsForEdge,
            additional_phones: additionalPhonesForEdge,
          },
        });

        const createResult: any = (createInvoke as any).data;
        const createError: any = (createInvoke as any).error;

        if (createError) {
          const errorMessage = await extractFunctionErrorMessage(createInvoke, createError);
          if (errorMessage && /already been registered|email_exists/i.test(errorMessage)) {
            throw new Error("EMAIL_EXISTS");
          }
          throw new Error(errorMessage || createError.message || t("common.error"));
        }

        const finalUserId = createResult?.anew_user_id;
        if (!finalUserId) throw new Error("Failed to resolve created user");

        const primaryPhoneForUpdate = formPhones.find(p => p.is_primary) || formPhones[0];
        const primaryPhoneFormattedForUpdate = primaryPhoneForUpdate
          ? `${primaryPhoneForUpdate.country_code} ${primaryPhoneForUpdate.phone_number}`
          : null;

        await supabase
          .from("anew_users")
          .update({
            phone: primaryPhoneFormattedForUpdate,
            description: formData.description || null,
            position: formData.position || null,
            location: formData.location || null,
            template_id: formTemplateId || null,
            custom_attributes: Object.keys(formCustomAttributes).length > 0
              ? {
                  ...formCustomAttributes,
                  social_facebook: formSocialLinks.facebook || null,
                  social_linkedin: formSocialLinks.linkedin || null,
                  social_angellist: formSocialLinks.angellist || null,
                }
              : null,
          })
          .eq("id", finalUserId);

        toast.success(t("users.created"));
      }

      if (createMore && !selectedUser) {
        resetForm();
        fetchData();
      } else {
        setSheetOpen(false);
        resetForm();
        fetchData();
      }
    } catch (error: any) {
      console.error("[UserSave] Error saving user:", error);
      console.error("[UserSave] Error details:", JSON.stringify({ message: error?.message, code: error?.code, details: error?.details, hint: error?.hint }));

      if (error.message === "EMAIL_EXISTS" || error.message?.includes("already been registered")) {
        toast.error(t("users.errors.emailAlreadyRegistered"));
      } else {
        const msg = error.message || t("common.error");
        const displayMsg = msg === "Edge Function returned a non-2xx status code" ? t("common.error") : msg;
        toast.error(displayMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!deleteUserId) return;

    const user = users.find((u) => u.id === deleteUserId);

    const deleteFlow = user?.auth_user_id
      ? supabase.functions.invoke("delete-user", {
          body: { userId: user.auth_user_id },
        }).then((response) => {
          if (response.error) throw response.error;
        })
      : Promise.resolve();

    deleteFlow
      .then(() =>
        supabase
          .from("anew_users")
          .delete()
          .eq("id", deleteUserId)
      )
      .then(({ error }) => {
        if (error) throw error;
        toast.success(t("users.deleted"));
        setDeleteUserId(null);
        fetchData();
      })
      .catch((error: any) => {
        console.error("Error deleting:", error);
        toast.error(error.message || t("common.error"));
      });
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{t("users.title")}</h1>
            <p className="text-muted-foreground">{t("users.subtitle")}</p>
          </div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-12">
          <OlyviaLoader size={32} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t("users.title")}</h1>
            <p className="text-muted-foreground">{t("users.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9 rounded-full shrink-0"
              onClick={() => setShowFAQ(!showFAQ)}
              title={t("faq.title")}
            >
              <MessageSquareText className={`h-5 w-5 ${showFAQ ? 'text-primary' : 'text-muted-foreground hover:text-foreground'} transition-colors`} />
            </Button>
            <Button variant="outline" onClick={() => setShowTemplateManager(true)}>
              <FileText className="w-4 h-4 mr-2" />
              {t("templates.title")}
            </Button>
            {canCreate && (
              <Button onClick={openCreateSheet}>
                <Plus className="w-4 h-4 mr-2" />
                {t("users.create")}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setUserTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              userTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("users.title")}
            <Badge variant="secondary" className="ml-2 text-xs">
              {users.filter(u => {
                const active = (u.memberships || []).filter(m => m.status === "active");
                return active.length === 0 || !active.every(m => m.role_code === "client");
              }).length}
            </Badge>
          </button>
          <button
            onClick={() => setUserTab("clients")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              userTab === "clients"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("users.portalClients") || "Clientes Portal"}
            <Badge variant="secondary" className="ml-2 text-xs">
              {users.filter(u =>
                (u.memberships || []).some(m => m.role_code === "client" && m.status === "active")
              ).length}
            </Badge>
          </button>
        </div>

        {/* FAQ Dialog */}
        <UsersFAQDialog open={showFAQ} onOpenChange={setShowFAQ} />

        {/* Dashboard */}
        <UsersDashboard
          total={users.length}
          active={users.filter(u => u.status === "active").length}
          inactive={users.filter(u => u.status === "inactive").length}
          newLast30d={users.filter(u => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return new Date(u.created_at) >= thirtyDaysAgo;
          }).length}
          loading={loading}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t("users.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <UsersTableColumns onColumnsChange={setVisibleColumns} />
        </div>

        {/* Table */}
        <Card className="flex-1">
          <CardContent className="p-0 overflow-x-auto">
            <Table density="compact" style={{ tableLayout: "fixed", minWidth: "800px" }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {visibleColumns.map((col, colIndex) => {
                    const width = columnWidths[col.key] || defaultColumnWidths[col.key] || 150;
                    const isLastColumn = colIndex === visibleColumns.length - 1;
                    return (
                      <TableHead
                        key={col.id}
                        className={`py-4 relative ${
                          col.key === "name" || col.key === "email" || col.key === "organizations" || col.key === "status"
                            ? "cursor-pointer select-none hover:bg-muted/50"
                            : ""
                        }`}
                        style={{ width: `${width}px` }}
                        onClick={() => {
                          if (col.key === "name") handleSort("name");
                          if (col.key === "email") handleSort("email");
                          if (col.key === "status") handleSort("status");
                          if (col.key === "organizations") handleSort("orgs");
                        }}
                      >
                        <div className="flex items-center">
                          {col.label}
                          {col.key === "name" && getSortIcon("name")}
                          {col.key === "email" && getSortIcon("email")}
                          {col.key === "status" && getSortIcon("status")}
                          {col.key === "organizations" && getSortIcon("orgs")}
                        </div>
                        {/* Resize handle */}
                        {!isLastColumn && (
                          <div
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary group/resize z-10"
                            onMouseDown={(e) => handleMouseDown(e, col.key)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-border group-hover/resize:bg-primary/70 transition-colors" />
                          </div>
                        )}
                      </TableHead>
                    );
                  })}
                  <TableHead className="px-2" style={{ width: "50px" }}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 1} className="text-center py-12">
                      <Loader2 className="w-6 h-6 mx-auto animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 1} className="text-center py-12">
                      {t("common.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className={`group hover:bg-muted/50 ${canEditUser(user) ? 'cursor-pointer' : ''}`}
                      onClick={() => canEditUser(user) && openEditSheet(user)}
                    >
                      {visibleColumns.map((col) => {
                        const width = columnWidths[col.key] || defaultColumnWidths[col.key] || 150;
                        return (
                        <TableCell 
                          key={col.id} 
                          className="py-4 overflow-hidden"
                          style={{ width: `${width}px`, maxWidth: `${width}px` }}
                        >
                          {col.key === "name" && (
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <User className="w-4 h-4 text-primary" />
                              </div>
                              <span className="font-medium truncate">
                                {user.name}
                                {user.auth_user_id === currentAuthUserId && (
                                  <span className="text-muted-foreground font-normal ml-1">({meLabel[language] || meLabel.en})</span>
                                )}
                              </span>
                            </div>
                          )}
                          {col.key === "email" && (
                            <span className="text-muted-foreground truncate block">{user.email}</span>
                          )}
                          {col.key === "phone" && (
                            <span className="text-muted-foreground truncate block">{user.phone || "-"}</span>
                          )}
                          {col.key === "status" && (
                            <Badge variant={user.status === "active" ? "default" : "secondary"}>
                              {user.status === "active" ? t("users.active") : user.status === "inactive" ? t("users.inactive") : user.auth_user_id ? t("users.active") : t("users.noLogin")}
                            </Badge>
                          )}
                          {col.key === "position" && (
                            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                              {user.position ? (
                                <>
                                  <Briefcase className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{user.position}</span>
                                </>
                              ) : (
                                "-"
                              )}
                            </div>
                          )}
                          {col.key === "location" && (
                            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                              {user.location ? (
                                <>
                                  <MapPin className="w-4 h-4 shrink-0" />
                                  <span className="truncate">{user.location}</span>
                                </>
                              ) : (
                                "-"
                              )}
                            </div>
                          )}
                          {col.key === "organizations" && (
                            (() => {
                              const activeMemberships = (user.memberships || []).filter((m) => m.status === "active");
                              const firstMembership = activeMemberships[0];
                              const remainingCount = activeMemberships.length - 1;
                              
                              if (!firstMembership) return <span className="text-muted-foreground">-</span>;
                              
                              return (
                                <div className="flex items-center gap-1">
                                  <Badge
                                    variant="outline"
                                    className="text-xs truncate max-w-[160px]"
                                    title={`${firstMembership.organization?.name || "?"} - ${firstMembership.role_name || firstMembership.role_code || "?"}`}
                                  >
                                    {firstMembership.organization?.name || "?"}
                                    {firstMembership.role_name && (
                                      <span className="text-primary ml-1">
                                        ({firstMembership.role_name})
                                      </span>
                                    )}
                                  </Badge>
                                  {remainingCount > 0 && (
                                    <Popover>
                                      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Badge
                                          variant="secondary"
                                          className="text-xs cursor-pointer hover:bg-secondary/80"
                                        >
                                          +{remainingCount}
                                        </Badge>
                                      </PopoverTrigger>
                                      <PopoverContent 
                                        className="w-80 p-0" 
                                        align="start"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="p-3 border-b">
                                          <h4 className="font-medium text-sm">{t("users.organizations")}</h4>
                                          <p className="text-xs text-muted-foreground">{activeMemberships.length} {t("common.total").toLowerCase()}</p>
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                          {activeMemberships.map((m) => (
                                            <div 
                                              key={m.id} 
                                              className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 border-b last:border-b-0"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                  {m.organization?.name || "?"}
                                                </p>
                                                {m.organization?.parent_name && (
                                                  <p className="text-xs text-muted-foreground truncate">
                                                    {m.organization.parent_name}
                                                  </p>
                                                )}
                                              </div>
                                              <Badge variant="outline" className="text-xs shrink-0 ml-2">
                                                {m.role_name || m.role_code || "-"}
                                              </Badge>
                                            </div>
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              );
                            })()
                          )}
                          {col.key === "created_at" && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="w-4 h-4 shrink-0" />
                              <span className="text-sm">{new Date(user.created_at).toLocaleDateString('pt-PT')}</span>
                            </div>
                          )}
                        </TableCell>
                        );
                      })}
                      <TableCell className="py-4 px-2 w-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                            {canEditUser(user) && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditSheet(user);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                {t("common.edit")}
                              </DropdownMenuItem>
                            )}
                            {canViewHistory && (historyScope === 'ORG' || isSelf(user) || canActOnEntity(historyScope, user, scopeAnewUserId, scopeAuthUserId)) && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistoryUser(user);
                              }}
                            >
                              <History className="w-4 h-4 mr-2" />
                              {t("common.history")}
                            </DropdownMenuItem>
                            )}
                            {canDeleteUser(user) && user.auth_user_id !== currentAuthUserId && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteUserId(user.id);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("common.delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Side Sheet for Create/Edit - expandable width */}
      <Sheet open={sheetOpen} onOpenChange={(open) => {
        setSheetOpen(open);
        if (!open) {
          setSheetExpanded(false);
          setPendingScopeChanges({});
        }
      }}>
        <SheetContent className={`w-full p-0 overflow-hidden transition-all duration-300 ${
          sheetExpanded ? "sm:w-3/4 sm:max-w-none" : "sm:w-1/2 sm:max-w-none"
        }`}>
          <UserFormEnhanced
            formData={formData}
            setFormData={setFormData}
            emails={formEmails}
            setEmails={setFormEmails}
            phones={formPhones}
            setPhones={setFormPhones}
            socialLinks={formSocialLinks}
            setSocialLinks={setFormSocialLinks}
            memberships={formMemberships}
            setMemberships={setFormMemberships}
            addresses={formAddresses}
            setAddresses={setFormAddresses}
            fiscalData={formFiscalData}
            setFiscalData={setFormFiscalData}
            customAttributes={formCustomAttributes}
            setCustomAttributes={setFormCustomAttributes}
            organizations={formOrganizations}
            isEdit={isEditMode}
            saving={saving}
            onSave={handleSave}
            onCancel={() => { setPendingScopeChanges({}); setSheetOpen(false); }}
            isExpanded={sheetExpanded}
            onToggleExpand={() => setSheetExpanded(!sheetExpanded)}
            createMore={createMore}
            onCreateMoreChange={setCreateMore}
            initialTemplateId={formTemplateId}
            editUserId={selectedUser?.id}
            onTemplateChange={setFormTemplateId}
            onTemplateFieldsChange={setFormTemplateFields}
            onTemplateAttrKeysChange={setFormTemplateAttrKeys}
            pendingScopeChanges={pendingScopeChanges}
            onPendingScopeChanges={setPendingScopeChanges}
            isRolesReadOnly={
              isEditMode && !!selectedUser && isSelf(selectedUser) && isAccountCreator(selectedUser)
            }
          />
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteUserId}
        onOpenChange={() => setDeleteUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.delete.confirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <UserHistoryDialog
        open={!!historyUser}
        onOpenChange={(open) => !open && setHistoryUser(null)}
        userId={historyUser?.id || ""}
        userName={historyUser?.name || ""}
      />
      {/* Template Manager Dialog */}
      <UserTemplateManager
        open={showTemplateManager}
        onOpenChange={setShowTemplateManager}
        organizations={organizations}
      />
    </>
  );
}
