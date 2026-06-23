import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building, Users, Network, MoreHorizontal, Pencil, Trash2, Eye, ChevronRight, ChevronDown, CornerDownRight, FolderTree, ArrowUpDown, ArrowUp, ArrowDown, FileStack, ShieldAlert, Link2Off, Link2 } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { OrganizationsHelpDialog } from "@/components/organizations/OrganizationsHelpDialog";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { assignCreatorAsOrgAdmin, assignCreatorAsAdminToHierarchy } from "@/utils/organizationCreation";
import { upsertOrgFiscalEntity, removeOrgFiscalEntity, loadOrgFiscalEntity } from "@/utils/orgFiscalEntity";
import { ensureOrgEntity, resolveOrganizationEntityId } from "@/utils/orgEntity";
import { useTranslation } from "@/hooks/useTranslation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OrganizationMembersDialog } from "@/components/organizations/OrganizationMembersDialog";
import { OrganizationForm, OrganizationFormData, AddressData } from "@/components/organizations/OrganizationForm";
import { useAdministrativeDivisions } from "@/hooks/useAdministrativeDivisions";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope, applyScopeFilter, canActOnEntity } from "@/hooks/usePermissionScope";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  created_at: string;
  created_by?: string | null;
  member_count?: number;
  direct_member_count?: number;
  parent_id?: string | null;
  parent_name?: string;
  depth?: number;
  children_count?: number;
}

const SUGGESTED_TYPES = [
  { name: "empresa", label: "Empresa" },
  { name: "departamento", label: "Departamento" },
  { name: "equipa", label: "Equipa" },
  { name: "holding", label: "Holding" },
  { name: "filial", label: "Filial" },
  { name: "projeto", label: "Projeto" },
  { name: "divisao", label: "Divisão" },
];

export default function Organizations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeCompany, refreshCompanies, userType } = useCompany();
  const { getPermissionScope, anewUserId, authUserId, loading: scopeLoading } = usePermissionScope();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("organizations.create") || !activeCompany;
  const canEdit = hasPermission("organizations.edit");
  const canDelete = hasPermission("organizations.delete");
  const editScope = getPermissionScope("organizations.edit");
  const deleteScope = getPermissionScope("organizations.delete");

  const canEditOrg = (org: Organization) => canEdit && canActOnEntity(editScope, org, anewUserId, authUserId);
  const canDeleteOrg = (org: Organization) => canDelete && canActOnEntity(deleteScope, org, anewUserId, authUserId);

  const [searchParams, setSearchParams] = useSearchParams();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [hierarchicalOrgs, setHierarchicalOrgs] = useState<Organization[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  
  const viewScope = getPermissionScope("organizations.view");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [orgToUnlink, setOrgToUnlink] = useState<Organization | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [orgToLink, setOrgToLink] = useState<Organization | null>(null);
  const [linkTargetParentId, setLinkTargetParentId] = useState<string>("");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersDialogOrg, setMembersDialogOrg] = useState<Organization | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [unlinkedOrgIds, setUnlinkedOrgIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [sortField, setSortField] = useState<'name' | 'type' | 'members' | 'status'>('type');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelMode, setPanelMode] = useState<'closed' | 'create' | 'edit'>('closed');
  
  const emptyAddress: AddressData = {
    street: "", number: "", floor: "", unit: "", postal_code: "",
    city: "", city_id: "", district: "", district_id: "", country: "PT", extra: "",
  };

  const [formData, setFormData] = useState<OrganizationFormData>({
    name: "", type: "", customType: "", description: "", status: "active",
    parentId: "", sector: "", phone: "", isFiscal: false, nif: "", commercialName: "",
    addresses: [], address: { ...emptyAddress },
    fiscalAddressOption: 'same', fiscalAddress: { ...emptyAddress },
  });

  const { districts, municipalities, fetchMunicipalities } = useAdministrativeDivisions(formData.address.country);
  const { districts: fiscalDistricts, municipalities: fiscalMunicipalities, fetchMunicipalities: fetchFiscalMunicipalities } = useAdministrativeDivisions(formData.fiscalAddress.country);

  useEffect(() => {
    if (!scopeLoading) fetchOrganizations();
    fetchCountries();
    const fetchUserName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: anewUser } = await supabase.from("anew_users").select("name").eq("auth_user_id", user.id).maybeSingle();
        if (anewUser?.name) setCurrentUserName(anewUser.name.split(" ")[0]);
      }
    };
    fetchUserName();
  }, [activeCompany?.id, scopeLoading, viewScope, anewUserId, refreshCounter]);

  // Auto-open create panel when navigated with ?action=new
  useEffect(() => {
    if (searchParams.get("action") === "new" && canCreate) {
      setPanelMode('create');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, canCreate]);

  const fetchCountries = async () => {
    try {
      const { data, error } = await supabase.from("countries").select("code, name").eq("is_active", true).order("sort_order");
      if (error) throw error;
      setCountries(data || []);
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const { data: hierarchyData, error: hierarchyError } = await (supabase as any).from("anew_hierarchy").select("parent_org_id, child_org_id");
      if (hierarchyError) throw hierarchyError;

      const childrenMap: Record<string, string[]> = {};
      const parentMap: Record<string, string> = {};
      hierarchyData?.forEach((h: { parent_org_id: string; child_org_id: string }) => {
        parentMap[h.child_org_id] = h.parent_org_id;
        if (!childrenMap[h.parent_org_id]) childrenMap[h.parent_org_id] = [];
        childrenMap[h.parent_org_id].push(h.child_org_id);
      });

      const allChildIds = new Set<string>(hierarchyData?.map((h: any) => h.child_org_id) || []);
      const allParentIds = new Set<string>(hierarchyData?.map((h: any) => h.parent_org_id) || []);

      let scopedOrgIds: string[] | null = null;
      if (activeCompany) {
        const collectDescendants = (orgId: string, result: Set<string>) => {
          result.add(orgId);
          (childrenMap[orgId] || []).forEach(childId => collectDescendants(childId, result));
        };
        const scopeSet = new Set<string>();
        collectDescendants(activeCompany.id, scopeSet);
        // Also include recently unlinked orgs so they remain visible during the session
        unlinkedOrgIds.forEach(id => scopeSet.add(id));
        scopedOrgIds = Array.from(scopeSet);
      }

      let orgsQuery = (supabase as any).from("anew_organizations").select("id, name, type, description, status, created_by, created_at, sector, is_fiscal").order("created_at", { ascending: false });
      const isGlobalAdmin = userType === "system_admin";
      if (isGlobalAdmin) {
        // Fetch all orgs (RLS handles security), then post-filter
      } else if (scopedOrgIds && scopedOrgIds.length > 0) {
        orgsQuery = orgsQuery.in("id", scopedOrgIds);
      }

      const { data: rawOrgsData, error: orgsError } = await orgsQuery;
      if (orgsError) throw orgsError;

      // For global admins: also show independent root orgs (holdings/empresas without a parent)
      // so that unlinked orgs remain visible and can be reassociated
      let orgsData = rawOrgsData;
      if (isGlobalAdmin && activeCompany) {
        const scopeSet = new Set<string>(scopedOrgIds || []);
        const rootTypes = new Set(["holding", "empresa"]);
        orgsData = (rawOrgsData || []).filter((org: any) =>
          scopeSet.has(org.id) || (!allChildIds.has(org.id) && rootTypes.has((org.type || '').toLowerCase()))
        );
      }

      const visibleOrgIds = (orgsData || []).map((o: any) => o.id);
      const { data: membershipData, error: membershipError } = await (supabase as any).from("anew_memberships").select("organization_id, user_id").eq("status", "active").in("organization_id", visibleOrgIds);
      if (membershipError) throw membershipError;

      const directMembersMap = new Map<string, Set<string>>();
      membershipData?.forEach((m: { organization_id: string; user_id: string }) => {
        if (!m?.organization_id || !m?.user_id) return;
        const set = directMembersMap.get(m.organization_id) ?? new Set<string>();
        set.add(m.user_id);
        directMembersMap.set(m.organization_id, set);
      });

      const totalMembersCache = new Map<string, Set<string>>();
      const calculateTotalMemberSet = (orgId: string, visiting = new Set<string>()): Set<string> => {
        const cached = totalMembersCache.get(orgId);
        if (cached) return cached;
        if (visiting.has(orgId)) return new Set(directMembersMap.get(orgId) ?? []);
        visiting.add(orgId);
        const result = new Set<string>(directMembersMap.get(orgId) ?? []);
        (childrenMap[orgId] || []).forEach(childId => {
          calculateTotalMemberSet(childId, visiting).forEach(uid => result.add(uid));
        });
        visiting.delete(orgId);
        totalMembersCache.set(orgId, result);
        return result;
      };

      let orgsWithHierarchy = (orgsData || []).map((org: any) => ({
        ...org,
        parent_id: parentMap[org.id] || null,
        direct_member_count: directMembersMap.get(org.id)?.size || 0,
        member_count: calculateTotalMemberSet(org.id).size,
        children_count: (childrenMap[org.id] || []).length,
      }));

      if (!activeCompany) {
        if (anewUserId) {
          const memberOrgIds = new Set<string>();
          membershipData?.forEach((m: { organization_id: string; user_id: string }) => {
            if (m.user_id === anewUserId) memberOrgIds.add(m.organization_id);
          });
          orgsWithHierarchy = orgsWithHierarchy.filter((org: Organization) =>
            org.created_by === anewUserId || memberOrgIds.has(org.id)
          );
        } else {
          orgsWithHierarchy = [];
        }
      } else if (viewScope === "OWNED" && anewUserId) {
        const memberOrgIds = new Set<string>();
        membershipData?.forEach((m: { organization_id: string; user_id: string }) => {
          if (m.user_id === anewUserId) memberOrgIds.add(m.organization_id);
        });
        orgsWithHierarchy = orgsWithHierarchy.filter((org: Organization) =>
          org.created_by === anewUserId || memberOrgIds.has(org.id)
        );
      } else {
        orgsWithHierarchy = applyScopeFilter(orgsWithHierarchy, viewScope, anewUserId);
      }

      const scopedIdSet = new Set(orgsWithHierarchy.map((o: Organization) => o.id));
      orgsWithHierarchy = orgsWithHierarchy.map((org: Organization) => ({
        ...org,
        children_count: (childrenMap[org.id] || []).filter((cid: string) => scopedIdSet.has(cid)).length,
      }));

      setOrganizations(orgsWithHierarchy);
      const orgIdSet = new Set(orgsWithHierarchy.map((o: Organization) => o.id));
      const buildHierarchy = (orgs: Organization[], parentId: string | null = null, depth = 0): Organization[] => {
        const result: Organization[] = [];
        const filtered = orgs.filter(o => parentId === null ? (o.parent_id === null || !orgIdSet.has(o.parent_id!)) : o.parent_id === parentId);
        const typePriority: Record<string, number> = { holding: 0, empresa: 1, departamento: 2, equipa: 3, divisao: 4 };
        filtered.sort((a, b) => {
          const pa = typePriority[(a.type || '').toLowerCase()] ?? 99;
          const pb = typePriority[(b.type || '').toLowerCase()] ?? 99;
          return pa - pb || a.name.localeCompare(b.name);
        });
        for (const org of filtered) {
          result.push({ ...org, depth });
          result.push(...buildHierarchy(orgs, org.id, depth + 1));
        }
        return result;
      };
      setHierarchicalOrgs(buildHierarchy(orgsWithHierarchy));
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (isSubmitting) return;
    if (!formData.name) { toast.error(t("common.requiredFields")); return; }
    setIsSubmitting(true);
    try {
      if (selectedTemplateId) {
        const { data: userData } = await supabase.auth.getUser();
        const businessUserId = await resolveBusinessUserId(userData.user?.id);
        const { data: rootOrgId, error } = await (supabase as any).rpc('create_orgs_from_template', {
          p_template_id: selectedTemplateId, p_root_name: formData.name, p_created_by: businessUserId
        });
        if (error) throw error;
        if (userData.user?.id && rootOrgId) {
          await assignCreatorAsAdminToHierarchy(rootOrgId, formData.name, userData.user.id);
        }
        toast.success(t("common.created"));
        setPanelMode('closed'); resetForm();
        await refreshCompanies(); setRefreshCounter(c => c + 1);
        return;
      }

      if (!formData.type) { toast.error(t("common.requiredFields")); return; }
      const typeToUse = formData.type === "other" ? formData.customType : formData.type;
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const newOrgId = crypto.randomUUID();
      const newOrgName = formData.name;
      const hasFiscalData = formData.isFiscal && !!formData.nif?.trim();
      const isInitialOrganizationCreation = organizations.length === 0 && !hasPermission("organizations.create");

      if (isInitialOrganizationCreation) {
        const { data: initialOrg, error: initialOrgError } = await (supabase as any).rpc(
          "create_initial_organization",
          {
            p_name: newOrgName,
            p_type: typeToUse,
            p_description: formData.description || null,
            p_status: formData.status,
            p_sector: formData.sector || null,
            p_phone: formData.phone?.trim() || null,
            p_is_fiscal: formData.isFiscal,
          },
        );
        if (initialOrgError) throw initialOrgError;

        const initialOrgId = initialOrg?.organization_id as string | undefined;
        if (!initialOrgId) throw new Error("Initial organization bootstrap returned no organization");

        if (hasFiscalData) {
          await upsertOrgFiscalEntity(initialOrgId, formData.nif, formData.commercialName || null, "PT", businessUserId);
        }

        for (const addr of formData.addresses) {
          if (addr.street && addr.number && addr.city && addr.postal_code) {
            await (supabase as any).rpc("assign_address_to_org", {
              p_org_id: initialOrgId, p_street: addr.street, p_number: addr.number,
              p_floor: addr.floor || null, p_unit: addr.unit || null, p_postal_code: addr.postal_code,
              p_city: addr.city, p_district: addr.district || null, p_country: addr.country || "PT",
              p_extra: addr.extra || null, p_is_fiscal: addr.isFiscal || false, p_created_by: businessUserId,
            });
          }
        }

        toast.success(t("common.created"));
        setPanelMode('closed'); resetForm();
        await refreshCompanies(); setRefreshCounter(c => c + 1);
        return;
      }

      const entityId = await resolveOrganizationEntityId({
        orgName: newOrgName,
        createdBy: businessUserId,
        nif: hasFiscalData ? formData.nif : null,
      });

      const { error } = await (supabase as any).from("anew_organizations").insert({
        id: newOrgId,
        name: newOrgName,
        type: typeToUse,
        description: formData.description || null,
        status: formData.status,
        sector: !formData.parentId && formData.sector ? formData.sector : null,
        phone: formData.phone?.trim() || null,
        is_fiscal: formData.isFiscal,
        entity_id: entityId,
        created_by: businessUserId,
      });
      if (error) throw error;

      if (hasFiscalData) {
        await upsertOrgFiscalEntity(newOrgId, formData.nif, formData.commercialName || null, "PT", businessUserId);
      }

      if (formData.parentId) {
        await (supabase as any).from("anew_hierarchy").insert({
          parent_org_id: formData.parentId, child_org_id: newOrgId,
          relationship_type: "parent_child", is_primary: true, created_by: businessUserId,
        });
      }

      if (userData.user?.id) {
        const { error: bootstrapError } = await (supabase as any).rpc("bootstrap_org_creator", {
          p_organization_id: newOrgId,
          p_organization_name: newOrgName,
        });
        if (bootstrapError) {
          console.error("Bootstrap error, falling back:", bootstrapError);
          await assignCreatorAsOrgAdmin(newOrgId, newOrgName, userData.user.id);
        }
      }

      for (const addr of formData.addresses) {
        if (addr.street && addr.number && addr.city && addr.postal_code) {
          await (supabase as any).rpc("assign_address_to_org", {
            p_org_id: newOrgId, p_street: addr.street, p_number: addr.number,
            p_floor: addr.floor || null, p_unit: addr.unit || null, p_postal_code: addr.postal_code,
            p_city: addr.city, p_district: addr.district || null, p_country: addr.country || "PT",
            p_extra: addr.extra || null, p_is_fiscal: addr.isFiscal || false, p_created_by: businessUserId,
          });
        }
      }

      toast.success(t("common.created"));
      setPanelMode('closed'); resetForm();
      await refreshCompanies(); setRefreshCounter(c => c + 1);
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedOrg) return;
    try {
      const typeToUse = formData.type === "other" ? formData.customType : formData.type;
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      await ensureOrgEntity({
        orgId: selectedOrg.id,
        orgName: formData.name,
        createdBy: businessUserId,
        nif: formData.isFiscal && formData.nif?.trim() ? formData.nif : null,
      });
      const { error } = await (supabase as any).from("anew_organizations").update({
        name: formData.name, type: typeToUse, description: formData.description || null,
        status: formData.status, sector: !formData.parentId && formData.sector ? formData.sector : null,
        phone: formData.phone?.trim() || null,
        is_fiscal: formData.isFiscal, updated_at: new Date().toISOString(),
      }).eq("id", selectedOrg.id);

      if (!error) {
        if (formData.isFiscal && formData.nif) {
          await upsertOrgFiscalEntity(selectedOrg.id, formData.nif, formData.commercialName || null, "PT", businessUserId);
        } else {
          await removeOrgFiscalEntity(selectedOrg.id);
        }
      }
      if (error) throw error;

      await (supabase as any).rpc("unlink_organization_node", {
        p_child_org_id: selectedOrg.id,
        p_created_by: businessUserId,
      });
      if (formData.parentId) {
        await (supabase as any).rpc("move_organization_node", {
          p_child_org_id: selectedOrg.id,
          p_new_parent_org_id: formData.parentId,
          p_created_by: businessUserId,
        });
      }

      await (supabase as any).from("anew_org_addresses").delete().eq("org_id", selectedOrg.id);

      for (const addr of formData.addresses) {
        if (addr.street && addr.number && addr.city && addr.postal_code) {
          await (supabase as any).rpc("assign_address_to_org", {
            p_org_id: selectedOrg.id, p_street: addr.street, p_number: addr.number,
            p_floor: addr.floor || null, p_unit: addr.unit || null, p_postal_code: addr.postal_code,
            p_city: addr.city, p_district: addr.district || null, p_country: addr.country || "PT",
            p_extra: addr.extra || null, p_is_fiscal: addr.isFiscal || false, p_created_by: businessUserId,
          });
        }
      }

      toast.success(t("common.saved"));
      setPanelMode('closed'); resetForm();
      await refreshCompanies(); setRefreshCounter(c => c + 1);
    } catch (error: any) {
      console.error("Error updating organization:", error);
      toast.error(error.message);
    }
  };

  const handleDeleteClick = (org: Organization) => { setOrgToDelete(org); setDeleteDialogOpen(true); };

  const handleConfirmDelete = async () => {
    if (!orgToDelete) return;
    try {
      const collectDescendants = async (parentId: string): Promise<string[]> => {
        const { data: children } = await (supabase as any).from("anew_hierarchy").select("child_org_id").eq("parent_org_id", parentId);
        if (!children || children.length === 0) return [];
        const childIds = children.map((c: any) => c.child_org_id);
        const grandchildren = await Promise.all(childIds.map(collectDescendants));
        return [...childIds, ...grandchildren.flat()];
      };
      const descendantIds = await collectDescendants(orgToDelete.id);
      const { error } = await (supabase as any).rpc("delete_organization_subtree", {
        p_root_org_id: orgToDelete.id,
      });
      if (error) throw error;
      toast.success(t("common.deleted"));
      setDeleteDialogOpen(false); setOrgToDelete(null);
      if (selectedOrg?.id === orgToDelete.id || descendantIds.includes(selectedOrg?.id || "")) {
        setPanelMode('closed'); setSelectedOrg(null);
      }
      await refreshCompanies(); setRefreshCounter(c => c + 1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUnlinkClick = (org: Organization) => { setOrgToUnlink(org); setUnlinkDialogOpen(true); };

  const handleConfirmUnlink = async () => {
    if (!orgToUnlink) return;
    try {
      // 1. Find the current parent org before unlinking
      const { data: hierarchyLink } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", orgToUnlink.id)
        .maybeSingle();

      if (hierarchyLink?.parent_org_id) {
        // 2. Build ancestor chain from parent upward to find inherited memberships
        const ancestorIds: string[] = [];
        let currentId = hierarchyLink.parent_org_id;
        for (let i = 0; i < 10; i++) {
          ancestorIds.push(currentId);
          const { data: parentLink } = await (supabase as any)
            .from("anew_hierarchy")
            .select("parent_org_id")
            .eq("child_org_id", currentId)
            .maybeSingle();
          if (!parentLink?.parent_org_id) break;
          currentId = parentLink.parent_org_id;
        }

        // 3. Find all users who have memberships on ancestor orgs (inherited access)
        const { data: ancestorMemberships } = await supabase
          .from("anew_memberships")
          .select("user_id, role_id")
          .in("organization_id", ancestorIds)
          .eq("status", "active");

        // 4. Find users who already have direct memberships on the child org
        const { data: directMemberships } = await supabase
          .from("anew_memberships")
          .select("user_id")
          .eq("organization_id", orgToUnlink.id)
          .eq("status", "active");

        const directUserIds = new Set((directMemberships || []).map(m => m.user_id));

        // 5. For each inherited-only user, create a direct membership on the child org
        const usersToAdd = (ancestorMemberships || []).filter(m => !directUserIds.has(m.user_id));
        // Deduplicate by user_id (keep first/highest role found)
        const seenUsers = new Set<string>();
        for (const m of usersToAdd) {
          if (seenUsers.has(m.user_id)) continue;
          seenUsers.add(m.user_id);
          await supabase.from("anew_memberships").insert({
            user_id: m.user_id,
            organization_id: orgToUnlink.id,
            role_id: m.role_id,
            status: "active",
          });
        }
      }

      // 6. Now safe to delete the hierarchy link
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const { error } = await (supabase as any).rpc("unlink_organization_node", {
        p_child_org_id: orgToUnlink.id,
        p_created_by: businessUserId,
      });
      if (error) throw error;
      toast.success(t("organizations.unlinkSuccess") !== "organizations.unlinkSuccess" ? t("organizations.unlinkSuccess") : "Organização desassociada com sucesso");
      setUnlinkedOrgIds(prev => new Set(prev).add(orgToUnlink.id));
      setUnlinkDialogOpen(false);
      setOrgToUnlink(null);
      await refreshCompanies();
      setRefreshCounter(c => c + 1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleLinkClick = (org: Organization) => { setOrgToLink(org); setLinkTargetParentId(""); setLinkDialogOpen(true); };

  const handleConfirmLink = async () => {
    if (!orgToLink || !linkTargetParentId) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const { error } = await (supabase as any).rpc("move_organization_node", {
        p_child_org_id: orgToLink.id,
        p_new_parent_org_id: linkTargetParentId,
        p_created_by: businessUserId,
      });
      if (error) throw error;
      toast.success("Organização associada com sucesso");
      setLinkDialogOpen(false);
      setOrgToLink(null);
      setLinkTargetParentId("");
      setUnlinkedOrgIds(prev => { const n = new Set(prev); n.delete(orgToLink.id); return n; });
      await refreshCompanies();
      setRefreshCounter(c => c + 1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };


  const openEditPanel = async (org: Organization) => {
    setSelectedOrg(org);
    const isCustomType = !SUGGESTED_TYPES.some(st => st.name === org.type);
    let currentParentId = "";
    try {
      const { data: hd } = await (supabase as any).from("anew_hierarchy").select("parent_org_id").eq("child_org_id", org.id).maybeSingle();
      if (hd?.parent_org_id) currentParentId = hd.parent_org_id;
    } catch {}

    let fiscalNif = "", fiscalCommercialName = "";
    if ((org as any).is_fiscal) {
      const fiscal = await loadOrgFiscalEntity(org.id);
      if (fiscal) { fiscalNif = fiscal.nif; fiscalCommercialName = fiscal.commercialName; }
    }

    let loadedAddresses: any[] = [];
    try {
      // Load from anew_org_addresses (populated by assign_address_to_org RPC)
      const { data: oa } = await (supabase as any)
        .from("anew_org_addresses")
        .select("id, address_id, is_fiscal")
        .eq("org_id", org.id)
        .is("valid_to", null);

      if (oa?.length) {
        const addressIds = oa.map((o: any) => o.address_id).filter(Boolean);
        const { data: addresses } = addressIds.length
          ? await (supabase as any)
              .from("anew_addresses")
              .select("id, street, number, floor, unit, postal_code, city, district, country, extra")
              .in("id", addressIds)
          : { data: [] };

        const addrMap = new Map<string, any>((addresses || []).map((a: any) => [a.id, a]));
        loadedAddresses = oa.map((o: any) => {
          const a = addrMap.get(o.address_id);
          return {
            street: a?.street || "", number: a?.number || "", floor: a?.floor || "",
            unit: a?.unit || "", postal_code: a?.postal_code || "", city: a?.city || "",
            district: a?.district || "", country: a?.country || "PT", extra: a?.extra || "",
            isFiscal: o.is_fiscal || false,
          };
        });
      }
    } catch {}

    setFormData({
      name: org.name, type: isCustomType ? "other" : org.type, customType: isCustomType ? org.type : "",
      description: org.description || "", status: org.status, parentId: currentParentId,
      sector: (org as any).sector || "", phone: (org as any).phone || "", isFiscal: (org as any).is_fiscal || false,
      nif: fiscalNif, commercialName: fiscalCommercialName, addresses: loadedAddresses,
      address: { ...emptyAddress }, fiscalAddressOption: 'same', fiscalAddress: { ...emptyAddress },
    });
    setPanelMode('edit');
  };

  const openCreatePanel = (parentId?: string) => {
    resetForm();
    if (parentId) setFormData(prev => ({ ...prev, parentId }));
    setPanelMode('create');
  };

  const resetForm = () => {
    setFormData({ name: "", type: "", customType: "", description: "", status: "active", parentId: "", sector: "", phone: "", isFiscal: false, nif: "", commercialName: "", addresses: [], address: { ...emptyAddress }, fiscalAddressOption: 'same', fiscalAddress: { ...emptyAddress } });
    setSelectedOrg(null); clearSelectedTemplate();
  };

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
  const handleSelectTemplate = (templateId: string, templateName: string) => { setSelectedTemplateId(templateId); setSelectedTemplateName(templateName); toast.info(`Template "${templateName}" selecionado.`); };
  const clearSelectedTemplate = () => { setSelectedTemplateId(null); setSelectedTemplateName(null); };

  const toggleNode = (orgId: string) => {
    setExpandedNodes(prev => { const next = new Set(prev); next.has(orgId) ? next.delete(orgId) : next.add(orgId); return next; });
  };

  const isVisible = (org: Organization): boolean => {
    if (!org.parent_id) return true;
    const parent = hierarchicalOrgs.find(o => o.id === org.parent_id);
    if (!parent) return true;
    return expandedNodes.has(parent.id) && isVisible(parent);
  };

  const handleSort = (field: 'name' | 'type' | 'members' | 'status') => {
    if (sortField === field) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const getSortIcon = (field: 'name' | 'type' | 'members' | 'status') => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const sortOrganizations = (orgs: Organization[]) => {
    return [...orgs].sort((a, b) => {
      let c = 0;
      switch (sortField) {
        case 'name': c = a.name.localeCompare(b.name); break;
        case 'type': c = a.type.localeCompare(b.type); break;
        case 'members': c = (a.member_count || 0) - (b.member_count || 0); break;
        case 'status': c = a.status.localeCompare(b.status); break;
      }
      return sortDirection === 'asc' ? c : -c;
    });
  };

  const filteredOrganizations = sortOrganizations(organizations.filter(org => {
    const matchesSearch = org.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || org.type === filterType;
    return matchesSearch && matchesType;
  }));

  const filteredHierarchicalOrgs = hierarchicalOrgs.filter(org => {
    const matchesSearch = searchQuery === "" || org.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || org.type === filterType;
    if (searchQuery || filterType !== "all") return matchesSearch && matchesType;
    return isVisible(org);
  });

  const getTypeLabel = (type: string) => {
    const key = `organizations.types.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type.charAt(0).toUpperCase() + type.slice(1);
  };

  const uniqueTypes = Array.from(new Set(organizations.map(o => o.type)));

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      holding: "bg-purple-100 text-purple-800 border-purple-300",
      empresa: "bg-blue-100 text-blue-800 border-blue-300",
      filial: "bg-cyan-100 text-cyan-800 border-cyan-300",
      departamento: "bg-green-100 text-green-800 border-green-300",
      equipa: "bg-yellow-100 text-yellow-800 border-yellow-300",
      divisao: "bg-orange-100 text-orange-800 border-orange-300",
      projeto: "bg-pink-100 text-pink-800 border-pink-300",
    };
    return colors[type] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] gap-4">
        <div className={`flex flex-col gap-4 transition-all duration-300 ${panelMode !== 'closed' ? 'w-1/2' : 'w-full'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">{t("organizations.title")}</h1>
              <p className="text-muted-foreground">{t("organizations.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/org-templates')}>
                <FileStack className="w-4 h-4 mr-2" />{t("sidebar.orgTemplates")}
              </Button>
              <PageFAQSheet pageKey="organizations" />
              <OrganizationsHelpDialog />
              {canCreate && (
                <Button onClick={() => openCreatePanel()}>
                  <Plus className="w-4 h-4 mr-2" />{t("organizations.create")}
                </Button>
              )}
            </div>
          </div>

          {viewScope === "NONE" && activeCompany && (
            <Alert className="border-warning bg-warning/10">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>{t("permissions.noAccess")}</AlertDescription>
            </Alert>
          )}

          {(loading || scopeLoading) ? (
            <div className="flex items-center justify-center py-16">
              <OlyviaLoader size={32} />
            </div>
          ) : organizations.length === 0 ? (
            <div className="w-full rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-medium">{t("noOrg.title")}</h3>
                <p className="text-muted-foreground text-sm">{t("noOrg.description")}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {canCreate && (
                  <Button onClick={() => openCreatePanel()} size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {t("organizations.createFirst")}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigate('/org-templates')}>
                  <FileStack className="w-3.5 h-3.5 mr-1.5" />
                  {t("organizations.useTemplate")}
                </Button>
              </div>
            </div>
          ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{t("organizations.total")}</p>
                  <p className="text-4xl font-bold mt-1">{organizations.length}</p>
                </div>
                <div className="flex gap-6">
                  {(() => {
                    const holdings = organizations.filter(o => o.type?.toLowerCase() === 'holding').length;
                    const empresas = organizations.filter(o => o.type?.toLowerCase() === 'empresa').length;
                    const departamentos = organizations.filter(o => ['departamento', 'divisao', 'equipa', 'projeto'].includes(o.type?.toLowerCase() || '')).length;
                    const filiais = organizations.filter(o => o.type?.toLowerCase() === 'filial').length;
                    return (
                      <>
                        {holdings > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-primary">{holdings}</p>
                            <p className="text-xs text-muted-foreground">{t("organizations.types.holding")}</p>
                          </div>
                        )}
                        {empresas > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{empresas}</p>
                            <p className="text-xs text-muted-foreground">{t("organizations.types.empresa")}</p>
                          </div>
                        )}
                        {filiais > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-cyan-600">{filiais}</p>
                            <p className="text-xs text-muted-foreground">{t("organizations.types.filial")}</p>
                          </div>
                        )}
                        {departamentos > 0 && (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-amber-600">{departamentos}</p>
                            <p className="text-xs text-muted-foreground">{t("organizations.types.departamento")}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="p-3 rounded-xl bg-primary/10">
                  <Building className="h-6 w-6 text-primary" />
                </div>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input placeholder={t("common.search")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t("organizations.filterByType")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {SUGGESTED_TYPES.map(type => <SelectItem key={type.name} value={type.name}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 border rounded-lg p-1">
                <Button variant={viewMode === 'tree' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('tree')} className="gap-1">
                  <FolderTree className="h-4 w-4" />{t("organizations.treeView")}
                </Button>
                <Button variant={viewMode === 'flat' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('flat')} className="gap-1">
                  <Building className="h-4 w-4" />{t("organizations.flatView")}
                </Button>
              </div>
            </div>

            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-0 h-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px] cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('name')}>
                        <div className="flex items-center">{t("common.name")}{getSortIcon('name')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('type')}>
                        <div className="flex items-center">{t("organizations.type")}{getSortIcon('type')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('members')}>
                        <div className="flex items-center">{t("organizations.members")}{getSortIcon('members')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('status')}>
                        <div className="flex items-center">{t("common.status")}{getSortIcon('status')}</div>
                      </TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewMode === 'tree' ? filteredHierarchicalOrgs : filteredOrganizations).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">{t("common.noResults")}</TableCell></TableRow>
                    ) : (
                      (viewMode === 'tree' ? filteredHierarchicalOrgs : filteredOrganizations).map(org => (
                        <TableRow key={org.id} className={`group hover:bg-muted/50 cursor-pointer ${selectedOrg?.id === org.id ? 'bg-muted' : ''}`}
                          onClick={() => canEditOrg(org) ? openEditPanel(org) : navigate(`/organizations/${org.id}`)}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2" style={{ paddingLeft: viewMode === 'tree' ? `${(org.depth || 0) * 24}px` : 0 }}>
                              {viewMode === 'tree' && (org.children_count || 0) > 0 ? (
                                <button onClick={e => { e.stopPropagation(); toggleNode(org.id); }} className="p-0.5 rounded hover:bg-muted transition-colors">
                                  {expandedNodes.has(org.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                </button>
                              ) : viewMode === 'tree' ? <span className="w-5" /> : null}
                              {viewMode === 'tree' && (org.depth || 0) > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground/50" />}
                              <span className="truncate">{org.name}</span>
                              {(org.children_count || 0) > 0 && <span className="text-xs text-muted-foreground">({org.children_count})</span>}
                            </div>
                          </TableCell>
                          <TableCell><Badge className={`border ${getTypeColor(org.type)}`} variant="outline">{getTypeLabel(org.type)}</Badge></TableCell>
                          <TableCell>
                            <button onClick={e => { e.stopPropagation(); setMembersDialogOrg(org); setMembersDialogOpen(true); }}
                              className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                              title={`${t("organizations.directMembers")}: ${org.direct_member_count || 0} | ${t("organizations.totalMembers")}: ${org.member_count || 0}`}>
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{org.member_count || 0}</span>
                              {(org.direct_member_count || 0) < (org.member_count || 0) && <span className="text-xs text-muted-foreground ml-1">({org.direct_member_count})</span>}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={org.status === "active" ? "default" : org.status === "draft" ? "outline" : "secondary"}>
                              {org.status === "active" ? t("common.active") : org.status === "draft" ? t("common.draft") : t("common.inactive")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/organizations/${org.id}`); }}>
                                  <Eye className="w-4 h-4 mr-2" />{t("common.view")}
                                </DropdownMenuItem>
                                {canEditOrg(org) && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditPanel(org); }}>
                                    <Pencil className="w-4 h-4 mr-2" />{t("common.edit")}
                                  </DropdownMenuItem>
                                )}
                                {canCreate && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); openCreatePanel(org.id); }}>
                                    <Plus className="w-4 h-4 mr-2" />{t("organizations.addChild")}
                                  </DropdownMenuItem>
                                )}
                                {canEditOrg(org) && org.parent_id && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleUnlinkClick(org); }} className="text-orange-600">
                                    <Link2Off className="w-4 h-4 mr-2" />{t("organizations.unlink") !== "organizations.unlink" ? t("organizations.unlink") : "Desassociar"}
                                  </DropdownMenuItem>
                                )}
                                {canEditOrg(org) && !org.parent_id && org.id !== activeCompany?.id && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleLinkClick(org); }} className="text-primary">
                                    <Link2 className="w-4 h-4 mr-2" />Associar a grupo
                                  </DropdownMenuItem>
                                )}
                                {canDeleteOrg(org) && (
                                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDeleteClick(org); }} className="text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />{t("common.delete")}
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
          </>
          )}
        </div>

        {panelMode !== 'closed' && (
          <div className="w-full xl:w-1/2 h-full min-h-0">
            <OrganizationForm
              formData={formData} setFormData={setFormData} organizations={organizations}
              countries={countries} districts={districts} municipalities={municipalities}
              onDistrictChange={fetchMunicipalities} fiscalDistricts={fiscalDistricts}
              fiscalMunicipalities={fiscalMunicipalities} onFiscalDistrictChange={fetchFiscalMunicipalities}
              selectedOrg={selectedOrg} isEdit={panelMode === 'edit'} t={t} getTypeLabel={getTypeLabel}
              onSave={panelMode === 'edit' ? handleUpdate : handleCreate} isSaving={isSubmitting}
              onCancel={() => { setPanelMode('closed'); resetForm(); }}
              onUseTemplate={handleSelectTemplate} selectedTemplateId={selectedTemplateId}
              selectedTemplateName={selectedTemplateName} onClearTemplate={clearSelectedTemplate}
            />
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("organizations.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{orgToDelete && t("organizations.delete.description", { name: orgToDelete.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOrgToDelete(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desassociar organização</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja desassociar <strong>{orgToUnlink?.name}</strong> da organização pai? A organização não será eliminada, apenas deixará de estar associada ao grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOrgToUnlink(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUnlink} className="bg-orange-600 text-white hover:bg-orange-700">Desassociar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {membersDialogOrg && (
        <OrganizationMembersDialog
          open={membersDialogOpen}
          onOpenChange={open => { setMembersDialogOpen(open); if (!open) setMembersDialogOrg(null); }}
          organizationId={membersDialogOrg.id} organizationName={membersDialogOrg.name}
          onMembersChanged={fetchOrganizations}
        />
      )}

      <AlertDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Associar organização a grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha o grupo pai para associar <strong>{orgToLink?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={linkTargetParentId} onValueChange={setLinkTargetParentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar grupo pai..." />
              </SelectTrigger>
              <SelectContent>
                {organizations
                  .filter(o => o.id !== orgToLink?.id && (o.type === "holding" || o.type === "empresa"))
                  .map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setOrgToLink(null); setLinkTargetParentId(""); }}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLink} disabled={!linkTargetParentId}>Associar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
