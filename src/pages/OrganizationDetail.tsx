import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, Building, Users, Network, Link2, Plus, Trash2, 
  UserPlus, User, GitBranch, Pencil, MapPin, MessageSquareText, History 
} from "lucide-react";
import { OrganizationDetailFAQ } from "@/components/organizations/OrganizationDetailFAQ";
import { AnewEntityHistoryDialog } from "@/components/AnewEntityHistoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationAddressManager } from "@/components/organizations/OrganizationAddressManager";
import { assignCreatorAsOrgAdmin } from "@/utils/organizationCreation";
import { upsertOrgFiscalEntity } from "@/utils/orgFiscalEntity";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { ChildOrganizationsTree } from "@/components/organizations/ChildOrganizationsTree";
import { OrganizationMembersDialog } from "@/components/organizations/OrganizationMembersDialog";
import { MemberFormPanel } from "@/components/organizations/MemberFormPanel";
import { OrgAssociationsTab } from "@/components/organizations/OrgAssociationsTab";
import { MemberHierarchyTab } from "@/components/organizations/MemberHierarchyTab";
import { OrganizationForm, OrganizationFormData, emptyAddress } from "@/components/organizations/OrganizationForm";
import { OrganizationCombobox } from "@/components/users/OrganizationCombobox";
import { useCountries } from "@/hooks/useCountries";
import { useAdministrativeDivisions } from "@/hooks/useAdministrativeDivisions";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { resolveOrganizationEntityId } from "@/utils/orgEntity";

interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
}

interface Member {
  id: string;
  user_id: string;
  relationship_type: string;
  role_id: string | null;
  role?: { id: string; name: string } | null;
  status: string;
  metadata: any;
  profile: {
    id: string;
    name: string | null;
  };
}

interface HierarchyItem {
  id: string;
  parent_org_id: string;
  child_org_id: string;
  parent?: Organization;
  child?: Organization;
}

interface RelationItem {
  id: string;
  source_org_id: string;
  target_org_id: string;
  relation_type: string;
  relation_label: string | null;
  metadata: any;
  source?: Organization;
  target?: Organization;
  direction?: string;
}

interface Profile {
  id: string;
  name: string | null;
}

export default function OrganizationDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { hasPermission } = usePermissions();
  const canViewOrgHistory = hasPermission("organizations.view_history");
  const canManageOrg = hasPermission("organizations.manage");

  const { countries } = useCountries();
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const { districts, municipalities, fetchMunicipalities } = useAdministrativeDivisions('PT');

  useEffect(() => {
    if (selectedDistrictId) {
      fetchMunicipalities(selectedDistrictId);
    }
  }, [selectedDistrictId]);
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [totalMemberCount, setTotalMemberCount] = useState<number>(0);
  const [parents, setParents] = useState<HierarchyItem[]>([]);
  const [children, setChildren] = useState<HierarchyItem[]>([]);
  const [relations, setRelations] = useState<RelationItem[]>([]);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [allHierarchy, setAllHierarchy] = useState<{ parent_org_id: string; child_org_id: string }[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [orgsWithChildren, setOrgsWithChildren] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Dialog states
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddHierarchyOpen, setIsAddHierarchyOpen] = useState(false);
  const [isAddRelationOpen, setIsAddRelationOpen] = useState(false);
  const [isCreateOrgSheetOpen, setIsCreateOrgSheetOpen] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showChangeHistory, setShowChangeHistory] = useState(false);

  // Member panel state
  const [memberPanelMode, setMemberPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [memberToEdit, setMemberToEdit] = useState<Member | null>(null);

  // Delete confirmation states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'member' | 'hierarchy' | 'relation' | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  // Edit child organization dialog state
  const [isEditChildOpen, setIsEditChildOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Organization | null>(null);
  const [editChildForm, setEditChildForm] = useState({ name: "", type: "", description: "" });

  // Edit member state (legacy)
  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editMemberForm, setEditMemberForm] = useState({ relationship_type: "BELONGS_TO", role: "" });

  // Form states
  const [memberForm, setMemberForm] = useState({ user_id: "", relationship_type: "BELONGS_TO", role: "" });
  const [hierarchyForm, setHierarchyForm] = useState({ type: "parent", organization_id: "" });
  const [relationForm, setRelationForm] = useState({ target_id: "", relation_type: "RELATED_TO", relation_label: "", description: "" });

  // Full organization form data for Sheet
  const emptyFormData: OrganizationFormData = {
    name: "", type: "departamento", customType: "", description: "", status: "active",
    parentId: "", sector: "", phone: "", isFiscal: false, nif: "", commercialName: "",
    addresses: [],
    address: { street: "", number: "", floor: "", unit: "", postal_code: "", city: "", city_id: "", district: "", district_id: "", country: "PT", extra: "" },
    fiscalAddressOption: "same",
    fiscalAddress: { street: "", number: "", floor: "", unit: "", postal_code: "", city: "", city_id: "", district: "", district_id: "", country: "PT", extra: "" },
  };
  const [newOrgFormData, setNewOrgFormData] = useState<OrganizationFormData>(emptyFormData);

  const getTypeLabel = (type: string) => {
    const key = `organizations.types.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type.charAt(0).toUpperCase() + type.slice(1);
  };

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchOrganization(),
      fetchMembers(),
      fetchHierarchy(),
      fetchRelations(),
      fetchAllOrganizations(),
      fetchAllUsers(),
    ]);
    setLoading(false);
  };

  const fetchOrganization = async () => {
    const { data, error } = await (supabase as any)
      .from("anew_organizations").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      setNotFound(true);
      setOrganization(null);
      return;
    }
    setNotFound(false);
    setOrganization(data);
  };

  const fetchMembers = async () => {
    try {
      // 1) Fetch direct members for this org
      const { data: membershipsData, error } = await (supabase as any)
        .from("anew_memberships")
        .select("id, user_id, relationship_type, role_id, status, metadata")
        .eq("organization_id", id)
        .eq("status", "active");

      if (error) {
        console.error("Error fetching memberships:", error);
        setMembers([]);
        setTotalMemberCount(0);
        return;
      }

      // 2) Resolve descendant org IDs for total count
      const visitedOrgIds = new Set<string>(id ? [id] : []);
      let currentParentIds = id ? [id] : [];

      while (currentParentIds.length > 0) {
        const { data: childRows, error: hierarchyError } = await (supabase as any)
          .from("anew_hierarchy")
          .select("child_org_id")
          .in("parent_org_id", currentParentIds);

        if (hierarchyError) {
          console.error("Error fetching hierarchy for member count:", hierarchyError);
          break;
        }

        if (!childRows || childRows.length === 0) break;

        const nextParentIds = childRows
          .map((c: any) => c.child_org_id)
          .filter((childOrgId: string) => {
            if (visitedOrgIds.has(childOrgId)) return false;
            visitedOrgIds.add(childOrgId);
            return true;
          });

        currentParentIds = nextParentIds;
      }

      const allOrgIds = Array.from(visitedOrgIds);

      // 3) Count unique members across all descendant orgs
      const { data: allMemberships, error: totalCountError } = await (supabase as any)
        .from("anew_memberships")
        .select("user_id")
        .in("organization_id", allOrgIds)
        .eq("status", "active");

      if (totalCountError) {
        console.error("Error fetching total member count:", totalCountError);
        const uniqueDirectUsers = new Set((membershipsData || []).map((m: any) => m.user_id));
        setTotalMemberCount(uniqueDirectUsers.size);
      } else {
        const uniqueUsers = new Set((allMemberships || []).map((m: any) => m.user_id));
        setTotalMemberCount(uniqueUsers.size);
      }

      if (!membershipsData || membershipsData.length === 0) {
        setMembers([]);
        return;
      }

      const userIds = [...new Set(membershipsData.map((m: any) => m.user_id).filter(Boolean))];
      const roleIds = [...new Set(membershipsData.map((m: any) => m.role_id).filter(Boolean))];

      const [{ data: usersData }, { data: rolesData }] = await Promise.all([
        (supabase as any)
          .from("anew_users")
          .select("id, name, email")
          .in("id", userIds),
        roleIds.length > 0
          ? (supabase as any)
              .from("anew_roles")
              .select("id, name")
              .in("id", roleIds)
          : Promise.resolve({ data: [] }),
      ]);

      const usersMap = new Map<string, { id: string; name: string | null; email: string | null }>();
      (usersData || []).forEach((u: any) => usersMap.set(u.id, u));

      const rolesMap = new Map<string, { id: string; name: string }>();
      (rolesData || []).forEach((role: any) => rolesMap.set(role.id, role));

      const membersWithProfiles = membershipsData.map((m: any) => {
        const user = usersMap.get(m.user_id);
        const role = m.role_id ? rolesMap.get(m.role_id) : null;

        return {
          ...m,
          role: role || null,
          profile: {
            id: m.user_id,
            name: user?.name || null,
            email: user?.email || null,
          },
        };
      });

      setMembers(membersWithProfiles);
    } catch (error) {
      console.error("Error in fetchMembers:", error);
      setMembers([]);
      setTotalMemberCount(0);
    }
  };

  const fetchHierarchy = async () => {
    const { data: parentData } = await (supabase as any)
      .from("anew_hierarchy")
      .select("id, parent_org_id, child_org_id, parent:anew_organizations!anew_hierarchy_parent_org_id_fkey(id, name, type, description, status)")
      .eq("child_org_id", id);
    if (parentData) setParents(parentData as any);

    const { data: childData } = await (supabase as any)
      .from("anew_hierarchy")
      .select("id, parent_org_id, child_org_id, child:anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type, description, status)")
      .eq("parent_org_id", id);
    if (childData) setChildren(childData as any);
  };

  const fetchRelations = async () => {
    const { data: sourceData } = await (supabase as any)
      .from("anew_relations")
      .select("id, source_org_id, target_org_id, relation_type, relation_label, metadata, target:anew_organizations!anew_relations_target_org_id_fkey(id, name, type, description, status)")
      .eq("source_org_id", id);

    const { data: targetData } = await (supabase as any)
      .from("anew_relations")
      .select("id, source_org_id, target_org_id, relation_type, relation_label, metadata, source:anew_organizations!anew_relations_source_org_id_fkey(id, name, type, description, status)")
      .eq("target_org_id", id);

    const allRelations = [
      ...(sourceData || []).map((r: any) => ({ ...r, direction: "outgoing" })),
      ...(targetData || []).map((r: any) => ({ ...r, direction: "incoming" })),
    ];
    setRelations(allRelations as any);
  };

  const fetchAllOrganizations = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const authUserId = userData.user?.id;

    const { data } = await (supabase as any)
      .from("anew_organizations").select("id, name, type, description, status, created_by")
      .neq("id", id).eq("status", "active").order("name");

    let userMembershipOrgIds: string[] = [];
    let businessUserId: string | null = null;
    if (authUserId) {
      const { data: anewUser } = await (supabase as any)
        .from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
      if (anewUser) {
        businessUserId = anewUser.id;
        const { data: memberships } = await (supabase as any)
          .from("anew_memberships").select("organization_id").eq("user_id", anewUser.id).eq("status", "active");
        if (memberships) userMembershipOrgIds = memberships.map((m: any) => m.organization_id);
      }
    }

    if (data) {
      const filtered = data.filter((org: any) =>
        org.created_by === businessUserId || userMembershipOrgIds.includes(org.id)
      );
      setAllOrganizations(filtered);
    }

    const { data: hierarchyData } = await (supabase as any)
      .from("anew_hierarchy").select("parent_org_id, child_org_id");
    if (hierarchyData) {
      setAllHierarchy(hierarchyData);
      const parentIds = [...new Set(hierarchyData.map((h: any) => h.parent_org_id))] as string[];
      setOrgsWithChildren(parentIds);
    }
  };

  const fetchAllUsers = async () => {
    const { data } = await (supabase as any)
      .from("anew_users").select("id, name").order("name");
    if (data) setAllUsers(data.map((u: any) => ({ id: u.id, name: u.name })));
  };

  // Member actions
  const handleEditMember = (member: Member) => { setMemberToEdit(member); setMemberPanelMode('edit'); };
  const handleAddMemberPanel = () => { setMemberToEdit(null); setMemberPanelMode('add'); };
  const handleMemberPanelClose = () => { setMemberPanelMode('closed'); setMemberToEdit(null); };
  const handleMemberPanelSaved = () => { setMemberPanelMode('closed'); setMemberToEdit(null); fetchMembers(); };

  const handleRemoveMember = (memberId: string) => { setDeleteType('member'); setDeleteItemId(memberId); setDeleteDialogOpen(true); };
  const confirmRemoveMember = async (memberId: string) => {
    const { error } = await (supabase as any).from("anew_memberships").delete().eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.deleted")); fetchMembers();
  };

  // Hierarchy actions
  const handleAddHierarchy = async () => {
    if (!hierarchyForm.organization_id) { toast.error(t("common.required")); return; }
    const { data: userData } = await supabase.auth.getUser();
    const businessUserId = await resolveBusinessUserId(userData.user?.id);
    const insertData = hierarchyForm.type === "parent"
      ? { parent_org_id: hierarchyForm.organization_id, child_org_id: id, relationship_type: "parent_of", is_primary: true, created_by: businessUserId }
      : { parent_org_id: id, child_org_id: hierarchyForm.organization_id, relationship_type: "parent_of", is_primary: true, created_by: businessUserId };
    const { error } = await (supabase as any).from("anew_hierarchy").insert(insertData);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.created"));
    setIsAddHierarchyOpen(false);
    setHierarchyForm({ type: "parent", organization_id: "" });
    fetchHierarchy();
  };

  const handleCreateOrgFromSheet = async () => {
    if (!newOrgFormData.name) { toast.error(t("common.required")); return; }
    const { data: userData } = await supabase.auth.getUser();
    const businessUserId = await resolveBusinessUserId(userData.user?.id);
    const finalType = newOrgFormData.type === "other" ? newOrgFormData.customType : newOrgFormData.type;
    const newOrgId = crypto.randomUUID();
    const newOrgName = newOrgFormData.name.trim();
    const hasFiscalData = newOrgFormData.isFiscal && !!newOrgFormData.nif?.trim();
    const entityId = await resolveOrganizationEntityId({
      orgName: newOrgName,
      createdBy: businessUserId,
      nif: hasFiscalData ? newOrgFormData.nif : null,
    });

    const { error: createError } = await (supabase as any)
      .from("anew_organizations")
      .insert({
        id: newOrgId,
        name: newOrgName,
        type: finalType || "departamento",
        description: newOrgFormData.description || null,
        status: newOrgFormData.status || "active",
        sector: newOrgFormData.sector || null,
        is_fiscal: newOrgFormData.isFiscal,
        entity_id: entityId,
        created_by: businessUserId,
      });

    if (createError) { toast.error(createError.message); return; }

    if (hasFiscalData) {
      await upsertOrgFiscalEntity(newOrgId, newOrgFormData.nif, newOrgFormData.commercialName || null, "PT", businessUserId);
    }

    const insertData = hierarchyForm.type === "parent"
      ? { parent_org_id: newOrgId, child_org_id: id, relationship_type: "parent_of", is_primary: true, created_by: businessUserId }
      : { parent_org_id: id, child_org_id: newOrgId, relationship_type: "parent_of", is_primary: true, created_by: businessUserId };
    const { error: hierarchyError } = await (supabase as any).from("anew_hierarchy").insert(insertData);
    if (hierarchyError) { toast.error(hierarchyError.message); return; }

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

    for (const addr of newOrgFormData.addresses) {
      if (addr.street && addr.number && addr.city && addr.postal_code) {
        await (supabase as any).rpc('assign_address_to_org', {
          p_org_id: newOrgId, p_street: addr.street, p_number: addr.number,
          p_floor: addr.floor || null, p_unit: addr.unit || null, p_postal_code: addr.postal_code,
          p_city: addr.city, p_district: addr.district || null, p_country: addr.country || 'PT',
          p_extra: addr.extra || null, p_is_fiscal: addr.isFiscal || false, p_created_by: businessUserId,
        });
      }
    }

    toast.success(t("common.created"));
    setIsCreateOrgSheetOpen(false); setIsAddHierarchyOpen(false);
    setNewOrgFormData(emptyFormData); setHierarchyForm({ type: "parent", organization_id: "" });
    fetchHierarchy(); fetchAllOrganizations();
  };

  const handleRemoveHierarchy = (hierarchyId: string) => { setDeleteType('hierarchy'); setDeleteItemId(hierarchyId); setDeleteDialogOpen(true); };
  const confirmRemoveHierarchy = async (hierarchyId: string) => {
    const { error } = await (supabase as any).from("anew_hierarchy").delete().eq("id", hierarchyId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.deleted")); fetchHierarchy();
  };

  // Edit Child Organization
  const handleEditChild = (child: Organization) => {
    setEditingChild(child);
    setEditChildForm({ name: child.name, type: child.type, description: child.description || "" });
    setIsEditChildOpen(true);
  };
  const handleSaveChildEdit = async () => {
    if (!editingChild || !editChildForm.name) { toast.error(t("common.required")); return; }
    const { error } = await (supabase as any).from("anew_organizations")
      .update({ name: editChildForm.name, type: editChildForm.type, description: editChildForm.description || null })
      .eq("id", editingChild.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.saved"));
    setIsEditChildOpen(false); setEditingChild(null); setEditChildForm({ name: "", type: "", description: "" });
    fetchHierarchy();
  };

  // Relations
  const handleAddRelation = async () => {
    if (!relationForm.target_id || !relationForm.relation_type) { toast.error(t("common.required")); return; }
    const { data: userData } = await supabase.auth.getUser();
    const businessUserId = await resolveBusinessUserId(userData.user?.id);
    if (!businessUserId) { toast.error("Business user not resolved"); return; }
    const { error } = await (supabase as any).from("anew_relations").insert({
      source_org_id: id, target_org_id: relationForm.target_id,
      relation_type: relationForm.relation_type, relation_label: relationForm.relation_label || null,
      description: relationForm.description || null, created_by: businessUserId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.created"));
    setIsAddRelationOpen(false);
    setRelationForm({ target_id: "", relation_type: "RELATED_TO", relation_label: "", description: "" });
    fetchRelations();
  };
  const handleRemoveRelation = (relationId: string) => { setDeleteType('relation'); setDeleteItemId(relationId); setDeleteDialogOpen(true); };
  const confirmRemoveRelation = async (relationId: string) => {
    const { error } = await (supabase as any).from("anew_relations").delete().eq("id", relationId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.deleted")); fetchRelations();
  };

  const handleConfirmDelete = async () => {
    if (!deleteItemId || !deleteType) return;
    switch (deleteType) {
      case 'member': await confirmRemoveMember(deleteItemId); break;
      case 'hierarchy': await confirmRemoveHierarchy(deleteItemId); break;
      case 'relation': await confirmRemoveRelation(deleteItemId); break;
    }
    setDeleteDialogOpen(false); setDeleteType(null); setDeleteItemId(null);
  };

  // State for adding child from tree
  const [addChildParentName, setAddChildParentName] = useState<string>("");
  const handleRequestAddChild = (parentOrg: { id: string; name: string; type: string }) => {
    setHierarchyForm({ type: "child", organization_id: "" });
    setAddChildParentName(parentOrg.name);
    setNewOrgFormData({ ...emptyFormData, parentId: parentOrg.id });
    setIsCreateOrgSheetOpen(true);
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <p>{t("common.loading")}</p>
        </div>
      </>
    );
  }

  if (notFound || !organization) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <p className="text-lg font-medium">Organização não encontrada ou sem acesso.</p>
          <Button variant="outline" onClick={() => navigate("/organizations")}>{t("common.back")}</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/organizations")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{organization.name}</h1>
              <Badge variant="outline">
                {t(`organizations.types.${organization.type}`) !== `organizations.types.${organization.type}` 
                  ? t(`organizations.types.${organization.type}`) : organization.type}
              </Badge>
              <Badge variant={organization.status === "active" ? "default" : "secondary"}>
                {organization.status === "active" ? t("common.active") : t("common.inactive")}
              </Badge>
            </div>
            {organization.description && (
              <p className="text-muted-foreground mt-1">{organization.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canViewOrgHistory && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
                onClick={() => setShowChangeHistory(true)} title="Histórico de alterações">
                <History className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full"
              onClick={() => setShowFAQ(!showFAQ)} title={t("faq.title")}>
              <MessageSquareText className={`h-5 w-5 ${showFAQ ? 'text-primary' : 'text-muted-foreground hover:text-foreground'} transition-colors`} />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("organizations.members")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMemberCount}</div>
              {members.length < totalMemberCount && (
                <p className="text-xs text-muted-foreground mt-1">
                  {members.length} {t("organizations.directMembers").toLowerCase()}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("organizations.parents")}</CardTitle>
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{parents.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("organizations.children")}</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{children.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("organizations.relations")}</CardTitle>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{relations.length}</div></CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members" className="gap-2"><Users className="w-4 h-4" />{t("organizations.members")}</TabsTrigger>
            <TabsTrigger value="hierarchy" className="gap-2"><GitBranch className="w-4 h-4" />{t("organizations.hierarchy")}</TabsTrigger>
            <TabsTrigger value="relations" className="gap-2"><Link2 className="w-4 h-4" />{t("organizations.relations")}</TabsTrigger>
            <TabsTrigger value="addresses" className="gap-2"><MapPin className="w-4 h-4" />{t("addresses.title")}</TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className={cn(
              "flex gap-4 transition-all duration-300",
              memberPanelMode !== 'closed' ? "flex-row" : "flex-col"
            )}>
              <Card className={cn("transition-all duration-300", memberPanelMode !== 'closed' ? "w-1/2" : "w-full")}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>{t("organizations.members")}</CardTitle>
                    <CardDescription>{t("organizations.membersDescription")}</CardDescription>
                  </div>
                  {canManageOrg && (
                    <Button onClick={handleAddMemberPanel}>
                      <UserPlus className="w-4 h-4 mr-2" />{t("organizations.addMember")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">{t("organizations.noMembers")}</p>
                  ) : (
                    <div className="space-y-3">
                      {members.map((member) => (
                        <div key={member.id}
                          className={cn(
                            "flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors",
                            memberToEdit?.id === member.id && "ring-2 ring-primary bg-primary/5"
                          )}
                          onClick={() => handleEditMember(member)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{member.profile?.name || t("common.unknown")}</p>
                              <p className="text-sm text-muted-foreground">{member.role?.name || "-"}</p>
                            </div>
                          </div>
                          {canManageOrg && (
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon"
                                onClick={(e) => { e.stopPropagation(); handleEditMember(member); }}
                                className="text-muted-foreground hover:text-foreground">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={(e) => { e.stopPropagation(); handleRemoveMember(member.id); }}
                                className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {memberPanelMode !== 'closed' && (
                <Card className="w-1/2 animate-in slide-in-from-right duration-300 overflow-hidden min-h-[500px]">
                  <MemberFormPanel
                    mode={memberPanelMode === 'add' ? 'add' : 'edit'}
                    organizationId={id || ""}
                    organizationName={organization?.name || ""}
                    existingMemberUserIds={members.map(m => m.user_id)}
                    member={memberToEdit ? {
                      id: memberToEdit.id,
                      user_id: memberToEdit.user_id,
                      relationship_type: memberToEdit.relationship_type,
                      role_id: memberToEdit.role_id,
                      profile: {
                        id: memberToEdit.profile?.id || memberToEdit.user_id,
                        name: memberToEdit.profile?.name || "",
                        email: "",
                      }
                    } : null}
                    onClose={handleMemberPanelClose}
                    onSaved={handleMemberPanelSaved}
                  />
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Hierarchy Tab - Member Hierarchy */}
          <TabsContent value="hierarchy">
            <MemberHierarchyTab
              orgId={id || ""}
              orgName={organization?.name || ""}
              orgType={organization?.type || ""}
              canManage={canManageOrg}
            />
          </TabsContent>

          {/* Relations Tab */}
          <TabsContent value="relations">
            <OrgAssociationsTab
              orgId={id || ""}
              orgName={organization?.name || ""}
              orgType={organization?.type || ""}
              canManage={canManageOrg}
            />
          </TabsContent>

          {/* Addresses Tab */}
          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <CardTitle>{t("addresses.title")}</CardTitle>
                <CardDescription>{t("addresses.isFiscalDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <OrganizationAddressManager orgId={id || ""} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* FAQ Section */}
        {showFAQ && <OrganizationDetailFAQ />}

        {/* Change History Dialog */}
        {showChangeHistory && (
          <AnewEntityHistoryDialog
            entityId={id || ""}
            entityName={organization?.name || ""}
            entityType="organization"
            open={showChangeHistory}
            onOpenChange={setShowChangeHistory}
          />
        )}

        {/* Add/Manage Members Dialog */}
        <OrganizationMembersDialog
          open={isAddMemberOpen}
          onOpenChange={setIsAddMemberOpen}
          organizationId={id || ""}
          organizationName={organization?.name || ""}
          onMembersChanged={fetchMembers}
        />

        {/* Add Hierarchy Dialog */}
        <Dialog open={isAddHierarchyOpen} onOpenChange={(open) => {
          setIsAddHierarchyOpen(open);
          if (!open) setHierarchyForm({ type: "parent", organization_id: "" });
        }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("organizations.addHierarchy")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("organizations.hierarchyType")}</Label>
                <Select value={hierarchyForm.type} onValueChange={(value) => setHierarchyForm({ ...hierarchyForm, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">{t("organizations.addAsParent")}</SelectItem>
                    <SelectItem value="child">{t("organizations.addAsChild")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("organizations.selectOrganization")} *</Label>
                <OrganizationCombobox
                  organizations={allOrganizations
                    .filter((org) => org.id !== id && !orgsWithChildren.includes(org.id))
                    .map((org) => ({
                      id: org.id, name: org.name, type: org.type,
                      parent_id: allHierarchy.find(h => h.child_org_id === org.id)?.parent_org_id || null
                    }))}
                  value={hierarchyForm.organization_id}
                  onChange={(value) => setHierarchyForm({ ...hierarchyForm, organization_id: value })}
                  placeholder={t("organizations.selectOrganization")}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("common.or")}</span>
                <Button variant="link" className="p-0 h-auto text-primary"
                  onClick={() => { setNewOrgFormData(emptyFormData); setIsCreateOrgSheetOpen(true); }}>
                  <Plus className="w-3 h-3 mr-1" />{t("organizations.createNew")}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddHierarchyOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleAddHierarchy} disabled={!hierarchyForm.organization_id}>{t("common.add")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create New Organization Sheet */}
        <Sheet open={isCreateOrgSheetOpen} onOpenChange={setIsCreateOrgSheetOpen}>
          <SheetContent className="w-[95vw] sm:w-[90vw] lg:w-[55vw] min-w-0 max-w-[900px] h-[90vh] p-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              {(isAddHierarchyOpen || newOrgFormData.parentId) && (
                <div className="bg-primary/10 border-b border-primary/20 px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
                  <GitBranch className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm">
                    {newOrgFormData.parentId
                      ? t("organizations.willBeAddedAsChildOf", { parent: addChildParentName || allOrganizations.find(o => o.id === newOrgFormData.parentId)?.name || "" })
                      : hierarchyForm.type === "parent"
                        ? t("organizations.willBeAddedAsParent", { org: organization?.name })
                        : t("organizations.willBeAddedAsChild", { org: organization?.name })
                    }
                  </span>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <OrganizationForm
                  formData={newOrgFormData}
                  setFormData={setNewOrgFormData}
                  organizations={allOrganizations}
                  countries={countries}
                  districts={districts}
                  municipalities={municipalities}
                  onDistrictChange={setSelectedDistrictId}
                  selectedOrg={null}
                  isEdit={false}
                  t={t}
                  getTypeLabel={getTypeLabel}
                  onSave={handleCreateOrgFromSheet}
                  onCancel={() => { setIsCreateOrgSheetOpen(false); setNewOrgFormData(emptyFormData); }}
                  title={t("organizations.createNew")}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Add Relation Dialog */}
        <Dialog open={isAddRelationOpen} onOpenChange={setIsAddRelationOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("organizations.addRelation")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("organizations.targetOrg")} *</Label>
                <Select value={relationForm.target_id} onValueChange={(value) => setRelationForm({ ...relationForm, target_id: value })}>
                  <SelectTrigger><SelectValue placeholder={t("organizations.selectOrganization")} /></SelectTrigger>
                  <SelectContent>
                    {allOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name} ({org.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("organizations.relationLabel")}</Label>
                <Input value={relationForm.relation_label}
                  onChange={(e) => setRelationForm({ ...relationForm, relation_label: e.target.value })}
                  placeholder={t("organizations.relationTypePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Textarea value={relationForm.description}
                  onChange={(e) => setRelationForm({ ...relationForm, description: e.target.value })}
                  placeholder={t("organizations.relationDescPlaceholder")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddRelationOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleAddRelation}>{t("common.add")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("common.deleteWarning")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setDeleteType(null); setDeleteItemId(null); }}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete}>{t("common.delete")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Child Organization Dialog */}
        <Dialog open={isEditChildOpen} onOpenChange={(open) => {
          setIsEditChildOpen(open);
          if (!open) { setEditingChild(null); setEditChildForm({ name: "", type: "", description: "" }); }
        }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("organizations.editChild")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("common.name")} *</Label>
                <Input value={editChildForm.name}
                  onChange={(e) => setEditChildForm({ ...editChildForm, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("organizations.type")}</Label>
                <Input value={editChildForm.type}
                  onChange={(e) => setEditChildForm({ ...editChildForm, type: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Textarea value={editChildForm.description}
                  onChange={(e) => setEditChildForm({ ...editChildForm, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditChildOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSaveChildEdit}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
