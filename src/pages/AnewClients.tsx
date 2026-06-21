import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEntityIdentity, createEntityWithIdentity, resolveEntityByIdentity } from "@/hooks/useEntityIdentity";
import { searchEntityIds } from "@/lib/clientSearch";
import { composeDisplayName, normalizeFirstLast } from "@/utils/composeDisplayName";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, User, Mail, Phone, PhoneCall, ClipboardList, Loader2, Search, Download, Upload, Building2, Trash2, MoreHorizontal, Eye, BarChart3, List, DollarSign, TrendingDown, RefreshCw, Star, UserPlus, FileText, Calendar, Tag, MessageSquare, ArrowUpDown, AlertTriangle, Lightbulb, Undo2 } from "lucide-react";
import { DuplicateEntityDialog, type DuplicateMatch } from "@/components/shared/DuplicateEntityDialog";
import { fetchGroupDuplicateMatches, fetchSameOrgMatchFields } from "@/lib/groupDuplicateMatches";
import { fetchSameOrgFieldsByEntity, revalidateStrongDuplicatesBeforeWrite } from "@/lib/duplicateBlockingRule";
import { ensureEntityOrgLink, linkEntityToOrg } from "@/utils/orgEntity";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientDetailsDialog } from "@/components/clients/ClientDetailsDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { usePostalCodeLookup } from "@/hooks/usePostalCodeLookup";
import { contactSchema, contactCompanySchema, addressSchema } from "@/lib/validations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn, formatCurrency } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { formatPhoneNumber } from "@/constants/countryCodes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { useTranslation } from "@/hooks/useTranslation";
import { AnewClientsDashboard } from "@/components/clients/AnewClientsDashboard";
import { useModuleAlerts } from "@/hooks/useModuleAlerts";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import { useClientEnrichedData } from "@/hooks/useClientEnrichedData";
import { ClientHealthBadge } from "@/components/clients/ClientHealthBadge";
import { ContactsAlertBar } from "@/components/contacts/ContactsAlertBar";
import { ClientSmartSuggestion } from "@/components/clients/ClientSmartSuggestion";
import { ClientsDashboardView } from "@/components/clients/ClientsDashboardView";
import { ClientsValueView } from "@/components/clients/ClientsValueView";
import { ClientsRetentionView } from "@/components/clients/ClientsRetentionView";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RegisterCallDialog } from "@/components/contacts/RegisterCallDialog";
import { formatWhatsAppLink } from "@/utils/whatsapp";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { useConversionRevert } from "@/hooks/useConversionRevert";

interface ClientRecord {
  id: string;
  entity_id: string;
  organization_id: string | null;
  root_organization_id: string | null;
  status: string;
  client_type: string | null;
  source_type: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at?: string | null;
  last_interaction_at?: string | null;
}

interface AnewUserNameRow { id: string; name: string | null }

interface SelectedClientRecord extends ClientRecord {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  phone_country_code?: string;
  vat?: string;
}

interface ClientAddress {
  street: string; number: string; floor_number: string; city: string;
  postal_code: string; district: string; municipality: string; is_primary: boolean;
}

const AnewClients = () => {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClientRecord | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);
  const { toast } = useToast();
  const { lookupPostalCode, loading: postalLoading } = usePostalCodeLookup();
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, loading: scopeLoading } = usePermissionScope();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { resolveEntities, getIdentity } = useEntityIdentity();
  const { alerts: clientAlerts, dismissAlert: dismissClientAlert } = useModuleAlerts('client', activeCompany?.id);

  const [assignedUserMap, setAssignedUserMap] = useState<Map<string, string>>(new Map());
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTarget, setEmailTarget] = useState<{ id: string; name: string; email: string; pdfAttachment?: any }>({ id: "", name: "", email: "" });
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [callTarget, setCallTarget] = useState<{ entityId: string; name: string; phone: string; clientId: string }>({ entityId: "", name: "", phone: "", clientId: "" });
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppContext | null>(null);

  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string; depth: number }[]>([]);
  const [orgNameMap, setOrgNameMap] = useState<Map<string, string>>(new Map());
  const [isParentOrg, setIsParentOrg] = useState<boolean | null>(null);
  const [resolvedRootOrgId, setResolvedRootOrgId] = useState<string | null>(null);
  const [scopeOrgIds, setScopeOrgIds] = useState<string[]>([]);

  const PAGE_SIZE = 10;
  const initialLoadDoneRef = useRef(false);
  const truncatedWarnedRef = useRef<string | null>(null);
  // Background: all clients for analytics views (Value, Retention, Dashboard)
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [allClientsLoaded, setAllClientsLoaded] = useState(false);
  const [clientType, setClientType] = useState<"person" | "company">("person");
  const [formData, setFormData] = useState({ first_name: "", last_name: "", email: "", phone: "", phone_country_code: "+351", vat: "", position: "", status: "active" });
  const [companyFormData, setCompanyFormData] = useState({ name: "", email: "", phone: "", phone_country_code: "+351", vat: "", website: "", industry: "", status: "active" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addressData, setAddressData] = useState<ClientAddress>({ street: "", number: "", floor_number: "", city: "", postal_code: "", district: "", municipality: "", is_primary: true });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const effectiveSearch = useMemo(() => {
    const trimmed = debouncedSearch.trim();
    return trimmed.length >= 3 ? trimmed : "";
  }, [debouncedSearch]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState("active");
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [clientToRevert, setClientToRevert] = useState<ClientRecord | null>(null);
  const [reverting, setReverting] = useState(false);
  const { revertContactToClient, canRevertClientToContact } = useConversionRevert();

  // Duplicate detection state for clients
  const [clientDuplicateDialogOpen, setClientDuplicateDialogOpen] = useState(false);
  const [clientDuplicateMatches, setClientDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [pendingClientData, setPendingClientData] = useState<{ entityId: string; displayName: string; email: string; phone: string; status: string; organizationId: string; internalUserId: string; clientType: string; addressData: ClientAddress } | null>(null);
  const [revertableClientIds, setRevertableClientIds] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<"dashboard" | "list" | "value" | "retention">("list");

  // New filter states
  const [healthFilter, setHealthFilter] = useState("all");
  const [salesRepFilter, setSalesRepFilter] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [lastContactFilter, setLastContactFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Enriched data for paginated list
  const entityIds = useMemo(() => clients.map(c => c.entity_id).filter(Boolean), [clients]);
  const identityMapForEnrichment = useMemo(() => {
    const map: Record<string, { display_name?: string; email?: string | null; phone?: string | null; vat?: string | null; type?: string }> = {};
    entityIds.forEach(eid => {
      const id = getIdentity(eid);
      if (id) map[eid] = { display_name: id.display_name, email: id.email, phone: id.phone, vat: id.vat, type: id.type };
    });
    return map;
  }, [entityIds, getIdentity]);
  const statusMapForEnrichment = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { if (c.entity_id) map[c.entity_id] = c.status || 'active'; });
    return map;
  }, [clients]);

  const activeListOrganizationId = companyFilter !== "all" ? companyFilter : activeCompany?.id;
  const { contracts: contractMap, interactions: interactionMap, healthScores, tags: tagMap, loading: enrichLoading } = useClientEnrichedData(entityIds, identityMapForEnrichment, statusMapForEnrichment, activeListOrganizationId);

  // Enriched data for ALL clients (analytics views)
  const allEntityIds = useMemo(() => allClients.map(c => c.entity_id).filter(Boolean), [allClients]);
  const allIdentityMapForEnrichment = useMemo(() => {
    const map: Record<string, { display_name?: string; email?: string | null; phone?: string | null; vat?: string | null; type?: string }> = {};
    allEntityIds.forEach(eid => {
      const id = getIdentity(eid);
      if (id) map[eid] = { display_name: id.display_name, email: id.email, phone: id.phone, vat: id.vat, type: id.type };
    });
    return map;
  }, [allEntityIds, getIdentity]);
  const allStatusMapForEnrichment = useMemo(() => {
    const map: Record<string, string> = {};
    allClients.forEach(c => { if (c.entity_id) map[c.entity_id] = c.status || 'active'; });
    return map;
  }, [allClients]);

  const {
    contracts: allContractMap, interactions: allInteractionMap,
    healthScores: allHealthScores, tags: allTagMap,
    refetch: refetchAllEnriched,
  } = useClientEnrichedData(allEntityIds, allIdentityMapForEnrichment, allStatusMapForEnrichment, activeListOrganizationId);

  // Use allClients data when available for analytics, fallback to paginated
  const analyticsClients = allClientsLoaded ? allClients : clients;
  const analyticsContractMap = allClientsLoaded ? allContractMap : contractMap;
  const analyticsInteractionMap = allClientsLoaded ? allInteractionMap : interactionMap;
  const analyticsHealthScores = allClientsLoaded ? allHealthScores : healthScores;
  const analyticsTagMap = allClientsLoaded ? allTagMap : tagMap;

  // Compute alert data
  const alertData = useMemo(() => {
    const now = new Date();
    const noContactClients: { id: string; entityId: string; name: string; value: number }[] = [];
    const expiringContracts: { id: string; entityId: string; name: string; value: number; expiryDate?: string }[] = [];
    const upsellClients: { id: string; entityId: string; name: string; value: number }[] = [];
    let totalContractValue = 0;
    let clientsWithContracts = 0;

    analyticsClients.filter(c => c.status === 'active').forEach(c => {
      const identity = getIdentity(c.entity_id);
      const name = identity?.display_name || 'N/A';
      const health = analyticsHealthScores.get(c.entity_id);
      const contract = analyticsContractMap.get(c.entity_id);
      const interaction = analyticsInteractionMap.get(c.entity_id);

      if (contract && contract.activeCount > 0) {
        totalContractValue += contract.totalValue;
        clientsWithContracts++;
      }

      // No contact > 30d
      if (interaction?.lastInteractionAt) {
        if (differenceInDays(now, new Date(interaction.lastInteractionAt)) > 30) {
          noContactClients.push({ id: c.id, entityId: c.entity_id, name, value: contract?.totalValue || 0 });
        }
      } else {
        noContactClients.push({ id: c.id, entityId: c.entity_id, name, value: contract?.totalValue || 0 });
      }

      // Expiring contracts
      if (contract?.expiringContracts.length) {
        contract.expiringContracts.forEach(ec => {
          expiringContracts.push({ id: c.id, entityId: c.entity_id, name, value: ec.total_value, expiryDate: format(new Date(ec.end_date), 'dd/MM') });
        });
      }
    });

    // Upsell: clients with exactly 1 contract below average
    const avgValue = clientsWithContracts > 0 ? totalContractValue / clientsWithContracts : 0;
    analyticsClients.filter(c => c.status === 'active').forEach(c => {
      const contract = analyticsContractMap.get(c.entity_id);
      if (contract && contract.activeCount === 1 && contract.totalValue < avgValue) {
        const identity = getIdentity(c.entity_id);
        upsellClients.push({ id: c.id, entityId: c.entity_id, name: identity?.display_name || 'N/A', value: contract.totalValue });
      }
    });

    // VIP at risk (tagged VIP with health < 40)
    const vipAtRisk = analyticsClients.filter(c => {
      const tags = analyticsTagMap.get(c.entity_id) || [];
      const health = analyticsHealthScores.get(c.entity_id);
      return tags.some(t => t.tag.toLowerCase() === 'vip') && health && health.score < 40;
    }).map(c => {
      const interaction = analyticsInteractionMap.get(c.entity_id);
      const days = interaction?.lastInteractionAt ? differenceInDays(now, new Date(interaction.lastInteractionAt)) : 999;
      return {
        name: getIdentity(c.entity_id)?.display_name || 'N/A',
        value: analyticsContractMap.get(c.entity_id)?.totalValue || 0,
        detail: `sem contacto há ${days} dias`,
      };
    });

    return { noContactClients, expiringContracts, upsellClients, avgValue, vipAtRisk };
  }, [analyticsClients, analyticsHealthScores, analyticsContractMap, analyticsInteractionMap, analyticsTagMap, getIdentity]);

  // Sorted/filtered clients for different views
  const displayClients = useMemo(() => {
    let filtered = [...clients];

    // Health filter
    if (healthFilter !== "all") {
      filtered = filtered.filter(c => healthScores.get(c.entity_id)?.level === healthFilter);
    }

    // Sales rep filter
    if (salesRepFilter !== "all") {
      filtered = filtered.filter(c => c.assigned_to === salesRepFilter);
    }

    // Special status filters (from KPI cards)
    if (statusFilter === "no_contact_30d") {
      filtered = filtered.filter(c => !["inactive", "churned", "lost"].includes(c.status || ""));
    } else if (statusFilter === "expiring_contracts") {
      filtered = filtered.filter(c => {
        if (["inactive", "churned", "lost"].includes(c.status || "")) return false;
        const contract = contractMap.get(c.entity_id);
        return !!contract && contract.expiringContracts.length > 0;
      });
    }

    // Last contact filter
    if (lastContactFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(c => {
        const int = interactionMap.get(c.entity_id);
        const days = int?.lastInteractionAt ? differenceInDays(now, new Date(int.lastInteractionAt)) : 999;
        switch (lastContactFilter) {
          case "7d": return days <= 7;
          case "30d": return days <= 30;
          case "30d+": return days > 30;
          case "60d+": return days > 60;
          default: return true;
        }
      });
    }

    // Only mine
    if (onlyMine && scopeAnewUserId) {
      filtered = filtered.filter(c => c.assigned_to === scopeAnewUserId || c.created_by === scopeAnewUserId);
    }

    // View-specific sorting
    if (activeView === "value") {
      filtered.sort((a, b) => (contractMap.get(b.entity_id)?.totalValue || 0) - (contractMap.get(a.entity_id)?.totalValue || 0));
    } else if (activeView === "retention") {
      filtered.sort((a, b) => (healthScores.get(a.entity_id)?.score || 0) - (healthScores.get(b.entity_id)?.score || 0));
    } else if (sortColumn === "health") {
      filtered.sort((a, b) => {
        const diff = (healthScores.get(a.entity_id)?.score || 0) - (healthScores.get(b.entity_id)?.score || 0);
        return sortDir === "asc" ? diff : -diff;
      });
    } else if (sortColumn === "value") {
      filtered.sort((a, b) => {
        const diff = (contractMap.get(a.entity_id)?.totalValue || 0) - (contractMap.get(b.entity_id)?.totalValue || 0);
        return sortDir === "asc" ? diff : -diff;
      });
    }

    return filtered;
  }, [clients, healthFilter, salesRepFilter, statusFilter, lastContactFilter, onlyMine, activeView, sortColumn, sortDir, healthScores, contractMap, interactionMap, scopeAnewUserId]);

  // Max contract value for progress bars
  const maxContractValue = useMemo(() => {
    let max = 0;
    contractMap.forEach(c => { if (c.totalValue > max) max = c.totalValue; });
    return max || 1;
  }, [contractMap]);

  // Unique sales reps for filter
  const salesReps = useMemo(() => {
    const reps = new Map<string, string>();
    clients.forEach(c => {
      if (c.assigned_to && assignedUserMap.has(c.assigned_to)) {
        reps.set(c.assigned_to, assignedUserMap.get(c.assigned_to)!);
      }
    });
    return Array.from(reps.entries());
  }, [clients, assignedUserMap]);

  // Load organizations (same pattern)
  useEffect(() => {
    const loadOrgs = async () => {
      if (!activeCompany?.id) { setOrgOptions([]); return; }
      try {
        const { data: allHierarchy } = await supabase.from("anew_hierarchy")
          .select("parent_org_id, child_org_id")
          .in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);
        const childrenMap = new Map<string, string[]>();
        (allHierarchy || []).forEach((h: any) => {
          const existing = childrenMap.get(h.parent_org_id) || [];
          existing.push(h.child_org_id);
          childrenMap.set(h.parent_org_id, existing);
        });
        const scopeIds = new Set<string>([activeCompany.id]);
        const queue = [activeCompany.id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const child of (childrenMap.get(current) || [])) {
            if (!scopeIds.has(child)) { scopeIds.add(child); queue.push(child); }
          }
        }
        setIsParentOrg(scopeIds.size > 1);
        const parentMap = new Map<string, string>();
        (allHierarchy || []).forEach((h: any) => { parentMap.set(h.child_org_id, h.parent_org_id); });
        let current = activeCompany.id;
        while (parentMap.has(current)) { current = parentMap.get(current)!; }
        setResolvedRootOrgId(current);
        const { data } = await supabase.from("anew_organizations").select("id, name")
          .in("id", Array.from(scopeIds)).eq("status", "active").order("name");
        const orgMap = new Map((data || []).map(o => [o.id, o.name]));
        setOrgNameMap(orgMap);
        const treeOrdered: { id: string; name: string; depth: number }[] = [];
        const buildTree = (parentId: string, depth: number) => {
          const name = orgMap.get(parentId);
          if (name !== undefined) treeOrdered.push({ id: parentId, name, depth });
          const children = (childrenMap.get(parentId) || []).filter(cid => scopeIds.has(cid))
            .sort((a, b) => (orgMap.get(a) || '').localeCompare(orgMap.get(b) || ''));
          for (const child of children) buildTree(child, depth + 1);
        };
        buildTree(activeCompany.id, 0);
        setOrgOptions(treeOrdered);
        setScopeOrgIds(Array.from(scopeIds));
      } catch (err) { console.error("Error loading organizations:", err); }
    };
    loadOrgs();
  }, [activeCompany?.id]);

  // Read ?filter= param from notification links
  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam) {
      const filterMap: Record<string, string> = {
        missing_nif: "missing_nif",
        no_contact: "no_contact_30d",
        no_contact_urgent: "no_contact_60d",
      };
      const mappedFilter = filterMap[filterParam] || "all";
      setStatusFilter(mappedFilter);
      // Remove the filter param from URL after applying
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("filter");
      newParams.delete("_t");
      setSearchParams(newParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (!scopeLoading && isParentOrg !== null) loadClients(0, true, initialLoadDoneRef.current);
  }, [effectiveSearch, statusFilter, companyFilter, dateFrom, dateTo, activeCompany?.id, orgOptions, isParentOrg, scopeAnewUserId, scopeLoading]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || selectedClient) return;

    const openFromQuery = async () => {
      const found = clients.find((c) => c.id === openId || c.entity_id === openId);
      if (found) {
        await openClientDetails(found);
        setSearchParams({});
        return;
      }

      let fetchedClient: ClientRecord | null = null;
      const { data: byId } = await (supabase as any)
        .from("anew_clients")
        .select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at")
        .eq("id", openId)
        .maybeSingle();
      fetchedClient = byId as ClientRecord | null;

      if (!fetchedClient && activeCompany?.id) {
        const { data: byEntityInActiveOrg } = await (supabase as any)
          .from("anew_clients")
          .select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at")
          .eq("entity_id", openId)
          .eq("organization_id", activeCompany.id)
          .maybeSingle();
        fetchedClient = byEntityInActiveOrg as ClientRecord | null;
      }

      if (fetchedClient) {
        await openClientDetails(fetchedClient as ClientRecord);
        setSearchParams({});
      }
    };

    void openFromQuery();
  }, [searchParams, clients, selectedClient, setSearchParams, resolveEntities]);

  const loadClients = async (offset: number, isInitial: boolean = false, silent: boolean = false) => {
    const shouldShowInitialLoader = isInitial && !silent;
    if (shouldShowInitialLoader) setLoading(true);
    else if (!isInitial) setLoadingMore(true);
    try {
      const viewScope = getPermissionScope("clients.view");
      let internalUserId: string | null = scopeAnewUserId || null;

      let query = (supabase as any).from("anew_clients").select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at", { count: 'exact' }).is("deleted_at", null);
      if (companyFilter !== "all") query = query.eq("organization_id", companyFilter);
      else if (scopeOrgIds.length > 0) query = query.in("organization_id", scopeOrgIds);
      else if (activeCompany?.id) query = query.eq("organization_id", activeCompany.id);
      // When searching, ignore status filter so inactive/churned/lost clients still appear
      if (!effectiveSearch) {
        if (statusFilter === "active") {
          query = query.not("status", "in", '("inactive","churned","lost")');
        } else if (statusFilter === "inactive") {
          query = query.in("status", ["inactive", "churned", "lost"]);
        } else if (statusFilter !== "all" && statusFilter !== "no_contact_30d" && statusFilter !== "no_contact_60d" && statusFilter !== "expiring_contracts" && statusFilter !== "missing_nif") {
          query = query.eq("status", statusFilter);
        }
        if (statusFilter === "no_contact_30d") {
          query = query.not("status", "in", '("inactive","churned","lost")');
          const atRiskIds = alertData.noContactClients.map(c => c.entityId).filter(Boolean);
          if (atRiskIds.length > 0) {
            query = query.in("entity_id", atRiskIds);
          }
        }
      }

      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) query = query.lte("created_at", dateTo.toISOString());
      if (viewScope === "OWNED" && internalUserId) {
        const orFilters = [`assigned_to.eq.${internalUserId}`, `created_by.eq.${internalUserId}`];
        query = query.or(orFilters.join(','));
      } else if (viewScope === "NONE") {
        if (isInitial) setClients([]); setHasMore(false); setLoading(false); return;
      }

      // Server-side search across name/email/phone/NIF (covers ALL visible clients, not just current page)
      if (effectiveSearch) {
        const { ids: matchedIds, truncated } = await searchEntityIds(effectiveSearch);
        if (truncated && truncatedWarnedRef.current !== effectiveSearch) {
          truncatedWarnedRef.current = effectiveSearch;
          toast({
            title: "Demasiados resultados",
            description: "Mais de 1000 resultados — refine a pesquisa para ver todos.",
          });
        }
        if (matchedIds.length === 0) {
          if (isInitial) setClients([]);
          setHasMore(false);
          return;
        }
        query = query.in("entity_id", matchedIds);
      }

      query = query.order("updated_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;

      let newClients = (data || []) as ClientRecord[];
      const eIds = newClients.map(c => c.entity_id).filter(Boolean);
      if (eIds.length > 0) await resolveEntities(eIds);

      // Text search is applied server-side above via searchEntityIds (entity_id .in).


      // Post-filter: missing NIF
      if (statusFilter === "missing_nif") {
        newClients = newClients.filter(c => {
          const id = getIdentity(c.entity_id);
          return !id?.vat;
        });
      }

      // Post-filter: no contact (60d)
      if (statusFilter === "no_contact_60d") {
        const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
        newClients = newClients.filter(c => {
          const lastInteraction = c.last_interaction_at ? new Date(c.last_interaction_at) : null;
          return !lastInteraction || lastInteraction < sixtyDaysAgo;
        });
      }

      const assignedIds = newClients.map(c => c.assigned_to).filter(Boolean) as string[];
      if (assignedIds.length > 0) {
        const uniqueIds = [...new Set(assignedIds)];
        const { data: users } = await (supabase as any).from("anew_users").select("id, name").in("id", uniqueIds);
        if (users) setAssignedUserMap(prev => {
          const next = new Map(prev);
          (users as AnewUserNameRow[]).forEach((u) => next.set(u.id, u.name || ''));
          return next;
        });
      }

      if (isInitial) setClients(newClients);
      else setClients(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        return [...prev, ...newClients.filter(c => !existingIds.has(c.id))];
      });
      setHasMore(newClients.length === PAGE_SIZE && (count ? offset + PAGE_SIZE < count : true));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro inesperado.";
      toast({ title: t('clients.loading'), description: message, variant: "destructive" });
    } finally {
      if (isInitial) initialLoadDoneRef.current = true;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreClients = () => { if (!loadingMore && hasMore) loadClients(clients.length); };

  // Background: load ALL clients recursively for analytics views
  const loadAllClients = useCallback(async () => {
    try {
      const viewScope = getPermissionScope("clients.view");
      if (viewScope === "NONE") { setAllClients([]); setAllClientsLoaded(true); return; }
      let internalUserId: string | null = scopeAnewUserId || null;

      // Server-side search: pre-resolve matching entity_ids (covers full universe, not just first batch)
      let searchEntityIdsList: string[] | null = null;
      if (effectiveSearch) {
        const { ids } = await searchEntityIds(effectiveSearch);
        if (ids.length === 0) {
          setAllClients([]);
          setAllClientsLoaded(true);
          return;
        }
        searchEntityIdsList = ids;
      }

      const BATCH = 500;
      const all: ClientRecord[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let query = (supabase as any).from("anew_clients").select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at").is("deleted_at", null);
        if (companyFilter !== "all") query = query.eq("organization_id", companyFilter);
        else if (scopeOrgIds.length > 0) query = query.in("organization_id", scopeOrgIds);
        else if (activeCompany?.id) query = query.eq("organization_id", activeCompany.id);
        if (viewScope === "OWNED" && internalUserId) {
          const orFilters = [`assigned_to.eq.${internalUserId}`, `created_by.eq.${internalUserId}`];
          query = query.or(orFilters.join(','));
        }
        if (searchEntityIdsList) query = query.in("entity_id", searchEntityIdsList);
        query = query.order("updated_at", { ascending: false }).range(offset, offset + BATCH - 1);
        const { data, error } = await query;
        if (error) throw error;
        const batch = (data || []) as ClientRecord[];
        all.push(...batch);
        // Resolve identities for new entity IDs
        const eIds = batch.map(c => c.entity_id).filter(Boolean);
        if (eIds.length > 0) await resolveEntities(eIds);
        hasMore = batch.length === BATCH;
        offset += BATCH;
      }
      setAllClients(all);
      setAllClientsLoaded(true);

      // Resolve names for ALL assigned_to ids found (the chart needs them)
      const assignedIds = [...new Set(all.map(c => c.assigned_to).filter(Boolean) as string[])];
      if (assignedIds.length > 0) {
        const missing = assignedIds.filter(id => !assignedUserMap.has(id));
        if (missing.length > 0) {
          const { data: users } = await (supabase as any).from("anew_users").select("id, name").in("id", missing);
          if (users) setAssignedUserMap(prev => {
            const next = new Map(prev);
            (users as AnewUserNameRow[]).forEach((u) => next.set(u.id, u.name || ''));
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Error loading all clients for analytics:", err);
    }
  }, [companyFilter, scopeOrgIds, activeCompany?.id, getPermissionScope, scopeAnewUserId, resolveEntities, effectiveSearch]);

  // Trigger background load for accurate KPIs — defer via idle to avoid competing with first paint
  useEffect(() => {
    if (scopeLoading || isParentOrg === null) return;
    setAllClientsLoaded(false);
    const w = window as any;
    const run = () => loadAllClients();
    const handle = typeof w.requestIdleCallback === "function"
      ? w.requestIdleCallback(run, { timeout: 2500 })
      : window.setTimeout(run, 1500);
    return () => {
      if (typeof w.cancelIdleCallback === "function" && typeof handle === "number") {
        try { w.cancelIdleCallback(handle); } catch {}
      } else {
        window.clearTimeout(handle as any);
      }
    };
  }, [scopeLoading, isParentOrg, companyFilter, scopeOrgIds, activeCompany?.id, dashboardKey, loadAllClients]);

  // Realtime: refresh both paginated list and full analytics on any anew_clients change in scope
  useEffect(() => {
    if (scopeLoading || isParentOrg === null) return;
    const orgIds = scopeOrgIds.length > 0 ? scopeOrgIds : (activeCompany?.id ? [activeCompany.id] : []);
    if (orgIds.length === 0) return;
    let timer: number | null = null;
    const orgSet = new Set(orgIds);
    const trigger = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setClients([]);
        setHasMore(true);
        loadClients(0, true, true);
        loadAllClients();
      }, 1500);
    };
    const channel = supabase
      .channel('anew-clients-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anew_clients' }, (payload: any) => {
        const orgId = payload?.new?.organization_id ?? payload?.old?.organization_id;
        if (!orgId || orgSet.has(orgId)) trigger();
      })
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [scopeLoading, isParentOrg, scopeOrgIds, activeCompany?.id, loadAllClients]);

  // Realtime: contracts / interactions — bump dashboardKey to force enriched data re-fetch
  useEffect(() => {
    if (scopeLoading || isParentOrg === null) return;
    if (allEntityIds.length === 0) return;
    const useFilter = allEntityIds.length <= 100;
    const filterStr = useFilter ? `entity_id=in.(${allEntityIds.join(',')})` : undefined;
    const entitySet = useFilter ? new Set(allEntityIds) : null;
    let timer: number | null = null;
    const trigger = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setDashboardKey(k => k + 1), 2000);
    };
    const handle = (payload: any) => {
      if (!entitySet) { trigger(); return; }
      const eid = payload?.new?.entity_id ?? payload?.old?.entity_id;
      if (!eid || entitySet.has(eid)) trigger();
    };
    const channel = supabase.channel('anew-clients-enriched-realtime');
    channel.on('postgres_changes',
      filterStr ? { event: '*', schema: 'public', table: 'client_contracts', filter: filterStr } as any
                : { event: '*', schema: 'public', table: 'client_contracts' },
      handle);
    channel.on('postgres_changes',
      filterStr ? { event: '*', schema: 'public', table: 'entity_interactions', filter: filterStr } as any
                : { event: '*', schema: 'public', table: 'entity_interactions' },
      handle);
    channel.subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [scopeLoading, isParentOrg, allEntityIds]);

  // Refetch enriched data when dashboardKey bumps (realtime contracts/interactions changes)
  useEffect(() => {
    if (dashboardKey > 0) refetchAllEnriched();
  }, [dashboardKey, refetchAllEnriched]);

  const handlePostalCodeLookup = async () => {
    if (!addressData.postal_code) return;
    const result = await lookupPostalCode(addressData.postal_code);
    if (result) setAddressData(prev => ({ ...prev, street: result.address.street || prev.street, city: result.locality || prev.city, district: result.district || prev.district, municipality: result.municipality || prev.municipality }));
  };

  const handleDeleteClick = (client: ClientRecord, e: React.MouseEvent) => { e.stopPropagation(); setClientToDelete(client); setDeleteDialogOpen(true); };

  const deactivateEntityRole = async (entityId: string, orgId: string, rootOrgId?: string) => {
    // Deactivate entity role in both possible org IDs to handle hierarchy mismatches
    const orgIds = [orgId];
    if (rootOrgId && rootOrgId !== orgId) orgIds.push(rootOrgId);
    await supabase.from("anew_entity_roles").update({ status: "inactive" })
      .eq("entity_id", entityId).eq("role", "client").in("organization_id", orgIds);
  };

  const resolveClientNotifications = async (clientIds: string[]) => {
    try {
      await (supabase as any).from("notifications")
        .update({ is_resolved: true })
        .in("entity_id", clientIds)
        .eq("entity_type", "client")
        .eq("kind", "alert")
        .eq("is_resolved", false);
    } catch (e) { console.error("Failed to resolve client notifications", e); }
  };

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;
    try {
      const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "client", p_id: clientToDelete.id });
      if (error) throw error;
      await resolveClientNotifications([clientToDelete.id]);
      toast({ title: "Cliente movido para lixo" });
      setDeleteDialogOpen(false); setClientToDelete(null); setClients([]); setHasMore(true); loadClients(0, true);
    } catch (error: any) { toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" }); }
  };

  const toggleSelectAll = () => { selectedIds.size === displayClients.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(displayClients.map(c => c.id))); };
  const toggleSelectOne = (id: string) => { const s = new Set(selectedIds); s.has(id) ? s.delete(id) : s.add(id); setSelectedIds(s); };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const { error } = await (supabase as any).from("anew_clients").update({ status: bulkNewStatus }).in("id", ids);
      if (error) throw error;
      // Sync entity roles for status changes to/from inactive
      const targetClients = clients.filter(c => selectedIds.has(c.id));
      for (const c of targetClients) {
        if (c.entity_id && bulkNewStatus === "inactive") {
          await deactivateEntityRole(c.entity_id, c.organization_id || '', c.root_organization_id);
        } else if (c.entity_id && bulkNewStatus !== "inactive") {
          const orgIds = [c.organization_id || ''];
          if (c.root_organization_id && c.root_organization_id !== c.organization_id) orgIds.push(c.root_organization_id);
          await supabase.from("anew_entity_roles").update({ status: "active" })
            .eq("entity_id", c.entity_id).eq("role", "client").in("organization_id", orgIds);
        }
      }
      // Auto-resolve notifications for inactive/lost clients
      const inactiveStatuses = ["lost", "inactive", "churned", "lost_definitive"];
      if (inactiveStatuses.includes(bulkNewStatus)) {
        await resolveClientNotifications(ids);
      }
      toast({ title: "Status atualizado", description: `${selectedIds.size} clientes atualizados` });
      setSelectedIds(new Set()); setBulkStatusDialogOpen(false); setClients([]); setHasMore(true); loadClients(0, true);
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "client", p_id: id });
        if (error) throw error;
      }
      await resolveClientNotifications(ids);
      toast({ title: "Clientes movidos para lixo", description: `${selectedIds.size} clientes` });
      setSelectedIds(new Set()); setBulkDeleteDialogOpen(false); setClients([]); setHasMore(true); loadClients(0, true);
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
  };

  const [savingClient, setSavingClient] = useState(false);
  const submitLockRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSavingClient(true);
    try {
    const dataToValidate = clientType === "person" ? formData : {
      first_name: companyFormData.name, last_name: "", email: companyFormData.email, phone: companyFormData.phone,
      phone_country_code: companyFormData.phone_country_code, vat: companyFormData.vat, position: "", status: companyFormData.status,
    };
    const schema = clientType === "company" ? contactCompanySchema : contactSchema;
    console.log('[DEBUG] clientType:', clientType, 'dataToValidate:', JSON.stringify(dataToValidate));
    const validation = schema.safeParse(dataToValidate);
    console.log('[DEBUG] validation result:', validation.success, validation.success ? 'OK' : JSON.stringify(validation.error.errors));
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach(err => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFieldErrors(errors);
      toast({ title: "Erro de validação", description: validation.error.errors[0]?.message, variant: "destructive" });
      return;
    }
    setFieldErrors({});
    if (addressData.postal_code) {
      const av = addressSchema.safeParse(addressData);
      if (!av.success) { toast({ title: "Erro na morada", description: av.error.errors[0]?.message, variant: "destructive" }); return; }
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { data: anewUser } = await (supabase as any).from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
      if (!anewUser?.id) {
        toast({ title: "Erro", description: "Perfil de utilizador não encontrado.", variant: "destructive" });
        return;
      }
      const internalUserId = anewUser.id;
      const organizationId = activeCompany?.id || null;
      if (!organizationId) { toast({ title: "Erro", description: "Nenhuma organização ativa", variant: "destructive" }); return; }

      const personNames = clientType === "person" ? normalizeFirstLast(formData.first_name, formData.last_name) : { first: null, last: null };
      const displayName = clientType === "person" ? composeDisplayName(personNames.first, personNames.last) : companyFormData.name;
      const entityType = clientType === "person" ? "person" : "organization";
      const email = clientType === "person" ? formData.email : companyFormData.email;
      const phone = clientType === "person" ? formData.phone : companyFormData.phone;
      const phoneCode = clientType === "person" ? formData.phone_country_code : companyFormData.phone_country_code;
      const vat = clientType === "person" ? formData.vat : companyFormData.vat;
      const firstName = clientType === "person" ? personNames.first : null;
      const lastName = clientType === "person" ? personNames.last : null;

      let entityId = await resolveEntityByIdentity({ email: email || null, phone: phone || null, vat: vat || null });
      if (!entityId) {
        entityId = await createEntityWithIdentity({
          displayName, type: entityType as 'person' | 'organization',
          email: email || null, phone: phone || null, phoneCountryCode: phoneCode,
          vat: vat || null, createdBy: internalUserId, firstName, lastName,
        });
      } else {
        await supabase.from("anew_entities").update({ display_name: displayName, first_name: firstName, last_name: lastName } as any).eq("id", entityId);
      }
      try {
        await ensureEntityOrgLink({ entityId: entityId!, organizationId, isPrimary: false });
      } catch (e) { console.warn('[org-link] non-fatal', e); }

      const status = clientType === "person" ? formData.status : companyFormData.status;

      // --- DUPLICATE CHECK: look for existing leads, contacts, clients with same entity in same org ---
      const [{ data: existingLeads }, { data: existingContacts }, { data: existingClientsCheck }] = await Promise.all([
        (supabase as any).from("anew_leads").select("id, entity_id, status, created_at, campaign_id, campaigns:campaigns!anew_leads_campaign_id_fkey(name), assigned_user:anew_users!anew_leads_assigned_to_fkey(name)").eq("entity_id", entityId).eq("organization_id", organizationId).not("status", "in", '("converted","lost","rejected")'),
        supabase.from("anew_contacts").select("id, entity_id, status, created_at, assigned_to, source_type").eq("entity_id", entityId).eq("organization_id", organizationId).not("status", "eq", "inactive"),
        supabase.from("anew_clients").select("id, entity_id, status, created_at, assigned_to").eq("entity_id", entityId).eq("organization_id", organizationId).not("status", "eq", "inactive"),
      ]);

      // Resolve real identity data for matched entities
      const allClientRawMatches = [
        ...(existingLeads || []).map((el: any) => ({ ...el, _type: "lead" as const })),
        ...(existingContacts || []).map((ec: any) => ({ ...ec, _type: "contact" as const })),
        ...(existingClientsCheck || []).map((ec: any) => ({ ...ec, _type: "client" as const })),
      ];
      const clientMatchEntityIds = [...new Set(allClientRawMatches.map((m: any) => m.entity_id).filter(Boolean))];
      const clientEntityIdentityMap = new Map<string, { displayName: string; email: string | null; phone: string | null }>();
      if (clientMatchEntityIds.length > 0) {
        const [entRes, emRes, phRes] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name").in("id", clientMatchEntityIds),
          supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", clientMatchEntityIds).eq("is_primary", true),
          supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", clientMatchEntityIds).eq("is_primary", true),
        ]);
        for (const eid of clientMatchEntityIds) {
          const ent = (entRes.data || []).find((e: any) => e.id === eid);
          const em = (emRes.data || []).find((e: any) => e.entity_id === eid);
          const ph = (phRes.data || []).find((p: any) => p.entity_id === eid);
          clientEntityIdentityMap.set(eid, {
            displayName: ent?.display_name || displayName,
            email: em?.email || null,
            phone: ph?.phone_number || null,
          });
        }
      }
      const clientSameOrgMatchFields = await fetchSameOrgMatchFields({
        orgId: organizationId, email: email || null, phone: phone || null, vat: vat || null,
      });
      const clientSameOrgFieldSets = await fetchSameOrgFieldsByEntity({
        orgId: organizationId, email: email || null, phone: phone || null, vat: vat || null,
      });
      const allClientMatches: DuplicateMatch[] = allClientRawMatches.map((m: any) => {
        const identity = clientEntityIdentityMap.get(m.entity_id) || { displayName, email: email || null, phone: phone || null };
        return {
          id: m.id, entityId: m.entity_id, displayName: identity.displayName,
          email: identity.email, phone: identity.phone,
          status: m.status, type: m._type, createdAt: m.created_at,
          campaignName: m.campaigns?.name || null, assignedToName: m.assigned_user?.name || null,
          matchField: clientSameOrgMatchFields.get(m.entity_id),
          matchFields: clientSameOrgFieldSets.get(m.entity_id),
        };
      });


      // Cross-org (group) sibling matches
      const localIds = [...new Set(allClientMatches.map((m) => m.entityId).filter(Boolean))];
      const groupMatches = await fetchGroupDuplicateMatches({
        orgId: organizationId, email: email || null, phone: phone || null, vat: vat || null,
        excludeEntityIds: localIds,
      });
      if (groupMatches.length > 0) allClientMatches.push(...groupMatches);

      if (allClientMatches.length > 0) {
        setClientDuplicateMatches(allClientMatches);
        setPendingClientData({ entityId, displayName, email: email || '', phone: phone || '', status, organizationId, internalUserId, clientType, addressData: { ...addressData } });
        setClientDuplicateDialogOpen(true);
        setSavingClient(false);
        submitLockRef.current = false;
        return;
      }

      // No duplicates — proceed with creation
      await createClientRecord(entityId, status, organizationId, internalUserId, entityType, addressData);

      toast({ title: "Cliente criado com sucesso" });
      setOpen(false); setClientType("person");
      setFormData({ first_name: "", last_name: "", email: "", phone: "", phone_country_code: "+351", vat: "", position: "", status: "active" });
      setCompanyFormData({ name: "", email: "", phone: "", phone_country_code: "+351", vat: "", website: "", industry: "", status: "active" });
      setAddressData({ street: "", number: "", floor_number: "", city: "", postal_code: "", district: "", municipality: "", is_primary: true });
      setFieldErrors({});
      setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1);
    } catch (error: any) { toast({ title: "Erro ao criar cliente", description: error.message, variant: "destructive" }); }
    } finally { submitLockRef.current = false; setSavingClient(false); }
  };

  // Extracted client creation logic for reuse
  const createClientRecord = async (entityId: string, status: string, organizationId: string, internalUserId: string, entityType: string, addr: ClientAddress) => {
    const { data: existingClient } = await (supabase as any).from("anew_clients").select("id")
      .eq("entity_id", entityId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    if (existingClient) {
      // Always reactivate when reusing: never leave an inactive client behind.
      await (supabase as any).from("anew_clients").update({ status: status || "active", deleted_at: null, organization_id: organizationId, source_type: "manual", updated_at: new Date().toISOString() }).eq("id", existingClient.id);
    } else {
      await (supabase as any).from("anew_clients").insert({
        entity_id: entityId, root_organization_id: resolvedRootOrgId || organizationId,
        organization_id: organizationId, status, client_type: entityType,
        source_type: "manual", created_by: internalUserId,
      });
    }
    const { data: existingRole } = await supabase.from("anew_entity_roles").select("id")
      .eq("entity_id", entityId).eq("role", "client").eq("organization_id", organizationId).maybeSingle();
    if (!existingRole) {
      await supabase.from("anew_entity_roles").insert({
        entity_id: entityId, role: "client", status: "active",
        organization_id: organizationId, source_type: "manual", created_by: internalUserId,
      });
    }
    if (addr.postal_code && addr.street) {
      const addressKey = `${addr.street}-${addr.number}-${addr.postal_code}`.toLowerCase().replace(/\s+/g, '-');
      const { data: newAddress } = await supabase.from("anew_addresses").insert({
        address_key: addressKey, street: addr.street, number: addr.number,
        floor: addr.floor_number || null, city: addr.city, postal_code: addr.postal_code,
        district: addr.district || null, country: "PT", created_by: internalUserId,
      }).select("id").single();
      if (newAddress) {
        await supabase.from("anew_entity_addresses").insert({
          entity_id: entityId, address_id: newAddress.id, address_type: "work", is_primary: true, created_by: internalUserId,
        });
      }
    }
  };

  // Duplicate client handlers
  const handleClientDuplicateOpenExisting = (match: DuplicateMatch) => {
    setClientDuplicateDialogOpen(false);
    setOpen(false);
    setPendingClientData(null);
    setClientDuplicateMatches([]);
    if (match.type === "lead") {
      navigate(`/leads?open=${match.id}`);
    } else if (match.type === "contact") {
      navigate(`/contacts?open=${match.id}`);
    } else {
      // Client — try to open detail on current page
      const existingClient = clients.find(c => c.id === match.id);
      if (existingClient) {
        setSelectedClient(existingClient);
        setDetailsOpen(true);
      } else {
        (async () => {
          const { data } = await (supabase as any).from("anew_clients").select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at, anew_entities!anew_clients_entity_id_fkey(*)").eq("id", match.id).single();
          if (data) {
            setSelectedClient(data);
            setDetailsOpen(true);
          }
        })();
      }
    }
  };

  const convertContactMatchToClient = async (match: DuplicateMatch) => {
    if (!pendingClientData || match.type !== "contact") return;
    await createClientRecord(pendingClientData.entityId, pendingClientData.status, pendingClientData.organizationId, pendingClientData.internalUserId, pendingClientData.clientType, pendingClientData.addressData);
    // createClientRecord already reactivates an existing client (any status, non-deleted) or inserts a new one.
    const { data: clientRow } = await (supabase as any)
      .from("anew_clients")
      .select("id")
      .eq("entity_id", pendingClientData.entityId)
      .eq("organization_id", pendingClientData.organizationId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (clientRow?.id) {
      await (supabase as any).from("anew_contacts").update({ status: "inactive", converted_to_client_id: clientRow.id, converted_at: new Date().toISOString() }).eq("id", match.id);
    }
    await supabase.from("anew_entity_roles").update({ status: "inactive" } as any).eq("entity_id", pendingClientData.entityId).eq("role", "contact").eq("organization_id", pendingClientData.organizationId);
    await supabase.from("anew_entity_roles").update({ status: "active" } as any).eq("entity_id", pendingClientData.entityId).eq("role", "client").eq("organization_id", pendingClientData.organizationId);
  };

  const handleClientDuplicateUpdateExisting = async (match: DuplicateMatch) => {
    if (!pendingClientData) return;
    if (match.type !== "client") {
      if (match.type === "contact") {
        setSavingClient(true);
        try {
          await convertContactMatchToClient(match);
          toast({ title: "Contacto convertido", description: `O contacto "${match.displayName}" foi convertido em cliente.` });
          setClientDuplicateDialogOpen(false); setOpen(false); setPendingClientData(null); setClientDuplicateMatches([]);
          setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1);
        } catch (err: any) {
          toast({ title: "Erro ao converter", description: err.message, variant: "destructive" });
        } finally { setSavingClient(false); }
      }
      return;
    }
    setSavingClient(true);
    try {
      await (supabase as any).from("anew_clients").update({ status: pendingClientData.status, organization_id: pendingClientData.organizationId }).eq("id", match.id);
      await supabase.from("anew_entity_roles").update({ status: pendingClientData.status } as any).eq("entity_id", pendingClientData.entityId).eq("role", "client").eq("organization_id", pendingClientData.organizationId);
      toast({ title: "Cliente atualizado", description: `Os dados do cliente "${match.displayName}" foram atualizados.` });
      setClientDuplicateDialogOpen(false); setOpen(false); setPendingClientData(null); setClientDuplicateMatches([]);
      setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally { setSavingClient(false); }
  };

  const handleClientDuplicateShareWithOrg = async (match: DuplicateMatch) => {
    if (!pendingClientData) return;
    setSavingClient(true);
    try {
      await linkEntityToOrg(match.entityId, pendingClientData.organizationId);
      // Reuse the (now shared) entity for the new client record
      await createClientRecord(match.entityId, pendingClientData.status, pendingClientData.organizationId, pendingClientData.internalUserId, pendingClientData.clientType, pendingClientData.addressData);
      toast({ title: "Cliente criado a partir de entidade do grupo" });
      setClientDuplicateDialogOpen(false); setOpen(false); setPendingClientData(null); setClientDuplicateMatches([]);
      setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: "Não foi possível partilhar a entidade", description: err.message, variant: "destructive" });
    } finally { setSavingClient(false); }
  };



  const handleClientDuplicateCreateAnyway = async () => {
    if (!pendingClientData) return;
    // Pre-write DB revalidation (strict mode).
    try {
      const revalidation = await revalidateStrongDuplicatesBeforeWrite({
        orgId: pendingClientData.organizationId,
        email: pendingClientData.email || null,
        phone: pendingClientData.phone || null,
        vat: null,
      });
      if (revalidation.shouldBlock) {
        toast({
          title: "Duplicado confirmado",
          description: "Este cliente passou a colidir com outro registo nesta organização.",
          variant: "destructive",
        });
        setClientDuplicateMatches(revalidation.matches);
        setClientDuplicateDialogOpen(true);
        return;
      }
    } catch (revErr) {
      console.warn('[client-create-anyway] pre-write revalidation failed (non-fatal)', revErr);
    }
    setClientDuplicateDialogOpen(false);
    setSavingClient(true);
    try {
      await createClientRecord(pendingClientData.entityId, pendingClientData.status, pendingClientData.organizationId, pendingClientData.internalUserId, pendingClientData.clientType, pendingClientData.addressData);
      toast({ title: "Cliente criado com sucesso" });
      setOpen(false); setPendingClientData(null); setClientDuplicateMatches([]);
      setFormData({ first_name: "", last_name: "", email: "", phone: "", phone_country_code: "+351", vat: "", position: "", status: "active" });
      setCompanyFormData({ name: "", email: "", phone: "", phone_country_code: "+351", vat: "", website: "", industry: "", status: "active" });
      setAddressData({ street: "", number: "", floor_number: "", city: "", postal_code: "", district: "", municipality: "", is_primary: true });
      setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: "Erro ao criar cliente", description: err.message, variant: "destructive" });
    } finally { setSavingClient(false); }
  };

  const handleExport = async () => {
    try {
      let query = (supabase as any).from("anew_clients").select("entity_id, status, organization_id, client_type");
      if (activeCompany?.id) {
        if (scopeOrgIds.length > 0) query = query.in("organization_id", scopeOrgIds);
        else query = query.eq("organization_id", activeCompany.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) { toast({ title: "Sem dados para exportar", variant: "destructive" }); return; }
      const eIds = data.map((r: any) => r.entity_id).filter(Boolean);
      let identityMap: Record<string, any> = {};
      if (eIds.length > 0) identityMap = await resolveEntities(eIds);
      const rows = [
        ["Nome", "Email", "Telefone", "NIF", "Status", "Tipo"],
        ...data.map((r: any) => {
          const id = identityMap[r.entity_id];
          return [id?.display_name || "", id?.email || "", id?.phone || "", id?.vat || "", r.status || "", r.client_type || ""];
        })
      ];
      const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(";")).join("\r\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.setAttribute("href", URL.createObjectURL(blob));
      link.setAttribute("download", `clients_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "Exportação concluída", description: `${data.length} clientes exportados` });
    } catch (error: any) { toast({ title: "Erro na exportação", description: error.message, variant: "destructive" }); }
  };

  const openClientDetails = async (client: ClientRecord | null | undefined) => {
    if (!client?.id || !client?.entity_id) {
      console.warn("Client details requested without a valid client", client);
      setDetailsOpen(false);
      setSelectedClient(null);
      return;
    }

    let identity = getIdentity(client.entity_id);

    if (!identity) {
      const resolved = await resolveEntities([client.entity_id]);
      identity = resolved[client.entity_id] || getIdentity(client.entity_id);
    }

    const displayName = identity?.display_name || "";
    const fallbackNameParts = displayName.split(' ');
    setSelectedClient({
      ...client,
      first_name: identity?.first_name || fallbackNameParts[0] || '', last_name: identity?.last_name || fallbackNameParts.slice(1).join(' ') || '',
      email: identity?.email || '', phone: identity?.phone || '',
      phone_country_code: identity?.phone_country_code || '+351', vat: identity?.vat || '',
    });
    setDetailsOpen(true);
  };

  const getLastContactInfo = (entityId: string) => {
    const int = interactionMap.get(entityId);
    if (!int?.lastInteractionAt) return { text: "Nunca", color: "text-red-500", warning: true };
    const days = differenceInDays(new Date(), new Date(int.lastInteractionAt));
    const text = `há ${days === 0 ? '< 1' : days} dias`;
    if (days <= 7) return { text, color: "text-green-600", warning: false };
    if (days <= 30) return { text, color: "text-yellow-600", warning: false };
    if (days <= 60) return { text, color: "text-red-500", warning: false };
    return { text, color: "text-red-600 font-semibold", warning: true };
  };

  const getSentimentEmoji = (entityId: string) => {
    const int = interactionMap.get(entityId);
    if (!int?.lastSentiment) return null;
    switch (int.lastSentiment) {
      case 'positive': return '😊';
      case 'neutral': return '😐';
      case 'negative': return '😟';
      default: return null;
    }
  };

  const getStatusDisplay = (status: string, _entityId: string) => {
    // ESTADO shows ONLY the actual client status — health is shown in the dedicated SAÚDE column.
    if (status === 'lost') return { label: "Fechado Perdido", className: "bg-muted text-muted-foreground" };
    if (status === 'inactive') return { label: t('clients.inactive'), className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" };
    if (status === 'active' || status === 'customer') return { label: t('clients.active'), className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" };
    if (status === 'prospect') return { label: status, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" };
    return { label: status, className: "bg-muted text-muted-foreground" };
  };

  const getRowBgClass = (client: ClientRecord) => {
    const health = healthScores.get(client.entity_id);
    if (health && !health.inactive && health.score < 40) return "bg-red-50/50 dark:bg-red-950/10";
    const contract = contractMap.get(client.entity_id);
    if (contract?.expiringContracts.length) return "bg-yellow-50/50 dark:bg-yellow-950/10";
    return "";
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDir("desc"); }
  };

  if (loading) {
    return (
      <>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">{t('clients.title')}</h1>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-full" />
            <div className="h-64 bg-muted rounded w-full" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {companyLoading ? (
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      ) : !activeCompany ? (
        <div className="space-y-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('clients.title')}</h1><p className="text-muted-foreground">{t('clients.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      ) : (
      <div className="space-y-4">
        <ModuleAlertsBanner
          alerts={clientAlerts}
          onDismiss={dismissClientAlert}
          onAction={async (alert) => {
            const alertRef = (alert.action_config as any)?.entity_id || alert.entity_id || (alert.action_config as any)?.client_id;
            if (!alertRef) return;

            let found = [...clients, ...allClients].find(
              (c: any) => c.id === alertRef || c.entity_id === alertRef
            );

            if (!found) {
              const { data: fetchedClient } = await supabase
                .from("anew_clients")
                .select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at")
                .or(`id.eq.${alertRef},entity_id.eq.${alertRef}`)
                .maybeSingle();

              if (fetchedClient) {
                await resolveEntities([fetchedClient.entity_id]);
                found = fetchedClient as ClientRecord;
              }
            }

            if (!found) {
              // Fallback: check if this is actually a contact
              const { data: contactRow } = await supabase
                .from("anew_contacts")
                .select("id")
                .or(`id.eq.${alertRef},entity_id.eq.${alertRef}`)
                .maybeSingle();
              if (contactRow) {
                navigate(`/contacts?open=${contactRow.id}`);
                return;
              }
              toast({ title: "Cliente não encontrado", variant: "destructive" });
              return;
            }

            // For "call_now" action, resolve phone and open tel: link
            if (alert.action_type === "call_now") {
              const identity = getIdentity(found.entity_id);
              if (identity?.phone) {
                const phoneNumber = `${identity.phone_country_code || '+351'}${identity.phone}`.replace(/\s/g, '');
                const a = document.createElement("a"); a.href = `tel:${phoneNumber}`; a.click();
              }
            }

            openClientDetails(found);
          }}
          onAlertClick={async (alert) => {
            const alertRef = (alert.action_config as any)?.entity_id || alert.entity_id || (alert.action_config as any)?.client_id;
            if (!alertRef) return;

            let found = [...clients, ...allClients].find(
              (c: any) => c.id === alertRef || c.entity_id === alertRef
            );

            if (!found) {
              const { data: fetchedClient } = await supabase
                .from("anew_clients")
                .select("id, entity_id, organization_id, root_organization_id, status, client_type, source_type, assigned_to, notes, created_at, created_by, updated_at, last_interaction_at")
                .or(`id.eq.${alertRef},entity_id.eq.${alertRef}`)
                .maybeSingle();

              if (fetchedClient) {
                await resolveEntities([fetchedClient.entity_id]);
                found = fetchedClient as ClientRecord;
              }
            }

            if (!found) {
              // Fallback: check if this is actually a contact
              const { data: contactRow } = await supabase
                .from("anew_contacts")
                .select("id")
                .or(`id.eq.${alertRef},entity_id.eq.${alertRef}`)
                .maybeSingle();
              if (contactRow) {
                navigate(`/contacts?open=${contactRow.id}`);
                return;
              }
              toast({ title: "Cliente não encontrado", variant: "destructive" });
              return;
            }

            openClientDetails(found);
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">{t('clients.title')}</h1>
            <p className="text-sm text-muted-foreground">Gestão e fidelização de clientes — retenção e maximização de valor</p>
          </div>
          <div className="flex gap-2">
            <PermissionGate permission="clients.export">
              <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />{t('clients.export')}</Button>
            </PermissionGate>
            <PermissionGate permission="clients.create">
              <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />{t('clients.newClient')}</Button>
            </PermissionGate>
          </div>
        </div>

        {/* Alert Bar - compact style like contacts */}
        <ContactsAlertBar alerts={[
          { key: "noContact", label: "sem contacto há >30 dias", count: alertData.noContactClients.length, color: "bg-destructive", action: () => setStatusFilter("no_contact_30d") },
          { key: "expiring", label: "contratos a expirar", count: alertData.expiringContracts.length, color: "bg-warning", action: () => setStatusFilter("expiring_contracts") },
          { key: "upsell", label: "oportunidades de upselling", count: alertData.upsellClients.length, color: "bg-blue-500", action: () => setActiveView("value") },
        ]} />

        {/* View Toggle */}
        <div className="flex items-center gap-4 flex-wrap">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="dashboard" className="gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Dashboard</TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5"><List className="w-3.5 h-3.5" />Lista</TabsTrigger>
              <TabsTrigger value="value" className="gap-1.5"><DollarSign className="w-3.5 h-3.5" />Valor</TabsTrigger>
              <TabsTrigger value="retention" className="gap-1.5"><TrendingDown className="w-3.5 h-3.5" />Retenção</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
            <span>• Total: <strong>{allClientsLoaded ? allClients.length : clients.length}</strong></span>
            <span>• Activos: <strong>{(allClientsLoaded ? allClients : clients).filter(c => !['inactive', 'churned', 'lost'].includes(c.status || '')).length}</strong></span>
          </div>
        </div>

        {/* Dashboard KPIs */}
        <AnewClientsDashboard
          key={dashboardKey}
          companyId={companyFilter !== "all" ? companyFilter : undefined}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
          scopeOrgIds={scopeOrgIds}
          activeView={activeView}
          salesRepFilter={salesRepFilter}
          healthScoresMap={analyticsHealthScores}
        />


        {/* Smart Suggestion - only on non-list views */}
        {activeView !== "list" && (
          <ClientSmartSuggestion
            vipAtRisk={alertData.vipAtRisk}
            expiringContracts={alertData.expiringContracts.slice(0, 2).map(c => ({
              name: c.name, value: c.value, detail: `a expirar em ${c.expiryDate}`,
            }))}
            upsellCount={alertData.upsellClients.length}
            upsellValue={alertData.upsellClients.reduce((sum, c) => sum + (alertData.avgValue - c.value), 0)}
            onCallVip={() => {}}
            onRenewContract={() => setStatusFilter("expiring_contracts")}
            onViewUpsell={() => setActiveView("value")}
          />
        )}

        {/* Dashboard View */}
        {activeView === "dashboard" && (
          <ClientsDashboardView
            clients={analyticsClients as any}
            healthScores={analyticsHealthScores}
            contracts={analyticsContractMap}
            identityMap={(allClientsLoaded ? allIdentityMapForEnrichment : identityMapForEnrichment) as any}
            assignedUserMap={assignedUserMap}
            loading={enrichLoading && !allClientsLoaded}
          />
        )}

        {/* Value View */}
        {activeView === "value" && (
          <ClientsValueView
            clients={analyticsClients as any}
            healthScores={analyticsHealthScores}
            contracts={analyticsContractMap}
            interactions={analyticsInteractionMap}
            tags={analyticsTagMap}
            identityMap={(allClientsLoaded ? allIdentityMapForEnrichment : identityMapForEnrichment) as any}
            scopeOrgIds={scopeOrgIds}
            onOpenClient={(entityId) => {
              const client = [...clients, ...allClients].find(c => c.entity_id === entityId);
              if (client) openClientDetails(client);
            }}
            onCreateDeal={() => navigate("/deals")}
          />
        )}

        {/* Retention View */}
        {activeView === "retention" && (
          <ClientsRetentionView
            clients={analyticsClients as any}
            healthScores={analyticsHealthScores}
            contracts={analyticsContractMap}
            interactions={analyticsInteractionMap}
            tags={analyticsTagMap}
            identityMap={(allClientsLoaded ? allIdentityMapForEnrichment : identityMapForEnrichment) as any}
            assignedUserMap={assignedUserMap}
            scopeOrgIds={scopeOrgIds}
            onOpenClient={(entityId) => {
              const client = [...clients, ...allClients].find(c => c.entity_id === entityId);
              if (client) openClientDetails(client);
            }}
            onCallClient={(entityId) => {
              const client = [...clients, ...allClients].find(c => c.entity_id === entityId);
              if (client) {
                const identity = getIdentity(client.entity_id);
                setCallTarget({ entityId: client.entity_id, name: identity?.display_name || "", phone: identity?.phone || "", clientId: client.id });
                setShowCallDialog(true);
              }
            }}
            onEmailClient={(entityId) => {
              const client = [...clients, ...allClients].find(c => c.entity_id === entityId);
              if (client) {
                const identity = getIdentity(client.entity_id);
                setEmailTarget({ id: client.id, name: identity?.display_name || "", email: identity?.email || "" });
                setShowEmailDialog(true);
              }
            }}
          />
        )}

        {/* List View */}
        {activeView === "list" && (
        <>
        {/* Filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Procurar por nome, email, NIF, empresa..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
              </div>
              <Button size="sm" variant={onlyMine ? "default" : "outline"} onClick={() => setOnlyMine(!onlyMine)} className="gap-1.5 h-9">
                <User className="w-3.5 h-3.5" />Só os meus
              </Button>
              {salesReps.length > 0 && (
                <Select value={salesRepFilter} onValueChange={setSalesRepFilter}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Comercial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Comercial</SelectItem>
                    {salesReps.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('clients.allStatus')}</SelectItem>
                  <SelectItem value="active">{t('clients.active')}</SelectItem>
                  <SelectItem value="inactive">{t('clients.inactive')}</SelectItem>
                  
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Saúde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Saúde</SelectItem>
                  <SelectItem value="excellent">Excelente</SelectItem>
                  <SelectItem value="good">Bom</SelectItem>
                  <SelectItem value="attention">Atenção</SelectItem>
                  <SelectItem value="at_risk">Em Risco</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                </SelectContent>
              </Select>
              <Select value={lastContactFilter} onValueChange={setLastContactFilter}>
                <SelectTrigger className="w-[155px] h-9"><SelectValue placeholder="Último contacto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Último contacto</SelectItem>
                  <SelectItem value="7d">{"< 7 dias"}</SelectItem>
                  <SelectItem value="30d">{"< 30 dias"}</SelectItem>
                  <SelectItem value="30d+">{"> 30 dias"}</SelectItem>
                  <SelectItem value="60d+">{"> 60 dias"}</SelectItem>
                </SelectContent>
              </Select>
              {orgOptions.length > 1 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t('clients.allCompanies')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('clients.allCompanies')}</SelectItem>
                    {orgOptions.map(org => <SelectItem key={org.id} value={org.id}>{"—".repeat(org.depth)} {org.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Special filter pills */}
            <div className="flex gap-2 mt-2">
              {alertData.noContactClients.length > 0 && (
                <Button size="sm" variant={statusFilter === "no_contact_30d" ? "destructive" : "outline"}
                  className="h-7 text-xs gap-1" onClick={() => setStatusFilter(statusFilter === "no_contact_30d" ? "all" : "no_contact_30d")}>
                  <AlertTriangle className="w-3 h-3" />Em risco ({alertData.noContactClients.length})
                </Button>
              )}
              {alertData.expiringContracts.length > 0 && (
                <Button size="sm" variant={statusFilter === "expiring_contracts" ? "default" : "outline"}
                  className="h-7 text-xs gap-1" onClick={() => setStatusFilter(statusFilter === "expiring_contracts" ? "all" : "expiring_contracts")}>
                  <RefreshCw className="w-3 h-3" />A renovar ({alertData.expiringContracts.length})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
            <CardContent className="p-3 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">{selectedIds.size} clientes selecionados</span>
              <Separator orientation="vertical" className="h-6" />
              <Button size="sm" variant="outline" className="h-8 gap-1.5"><UserPlus className="w-3.5 h-3.5" />Atribuir a...</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => {
                setShowEmailDialog(true);
                setEmailTarget({ id: "", name: `${selectedIds.size} clientes`, email: "" });
              }}><Mail className="w-3.5 h-3.5" />Enviar email</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5"><Star className="w-3.5 h-3.5" />Marcar VIP</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5"><FileText className="w-3.5 h-3.5" />Novo Pedido</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5"><Download className="w-3.5 h-3.5" />Exportar</Button>
              <PermissionGate permission="clients.delete">
                <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={() => setBulkDeleteDialogOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5" />Eliminar
                </Button>
              </PermissionGate>
              <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={() => setSelectedIds(new Set())}>× Limpar</Button>
            </CardContent>
          </Card>
        )}

        {displayClients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('clients.noClients')}</h3>
              <p className="text-muted-foreground mb-4">Crie o primeiro cliente para começar</p>
              <PermissionGate permission="clients.create">
                <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />{t('clients.newClient')}</Button>
              </PermissionGate>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="flex flex-col" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '400px' }}>
              <div
                ref={(el) => {
                  // Auto-load more if content fits without scroll (large screens)
                  if (el && hasMore && !loadingMore && el.scrollHeight <= el.clientHeight + 10) {
                    loadMoreClients();
                  }
                }}
                className="flex-1 min-h-0 overflow-auto leads-table-scroll"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && !loadingMore && hasMore) {
                    loadMoreClients();
                  }
                }}
              >
                <Table density="compact" className="min-w-[1200px]" containerClassName="overflow-visible">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox checked={selectedIds.size === displayClients.length && displayClients.length > 0} onCheckedChange={toggleSelectAll} />
                      </TableHead>
                      <TableHead className="w-[60px] cursor-pointer" onClick={() => handleSort("health")}>
                        <div className="flex items-center gap-1">Saúde <ArrowUpDown className="w-3 h-3" /></div>
                      </TableHead>
                      <TableHead className="w-[40px]" />
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contratos</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("value")}>
                        <div className="flex items-center gap-1">Valor Total <ArrowUpDown className="w-3 h-3" /></div>
                      </TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>NIF</TableHead>
                      <TableHead>Comercial</TableHead>
                      <TableHead>Último Contacto</TableHead>
                      <TableHead>Sentimento</TableHead>
                      <TableHead>Cliente Desde</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayClients.map((client) => {
                      const identity = getIdentity(client.entity_id);
                      const health = healthScores.get(client.entity_id);
                      const contract = contractMap.get(client.entity_id);
                      const clientTags = tagMap.get(client.entity_id) || [];
                      const lastContact = getLastContactInfo(client.entity_id);
                      const sentimentEmoji = getSentimentEmoji(client.entity_id);
                      const statusDisplay = getStatusDisplay(client.status, client.entity_id);
                      const isUpsell = contract && contract.activeCount === 1 && contract.totalValue < alertData.avgValue;

                      return (
                        <TableRow key={client.id} className={`cursor-pointer hover:bg-muted/50 ${getRowBgClass(client)}`}
                          onClick={() => openClientDetails(client)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(client.id)} onCheckedChange={() => toggleSelectOne(client.id)} />
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {health && <ClientHealthBadge health={health} size="sm" />}
                          </TableCell>
                          <TableCell>
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              health && health.level === 'excellent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30' :
                              health && health.level === 'good' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                              health && health.level === 'at_risk' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' :
                              health && health.level === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                              'bg-primary/10 text-primary'
                            }`}>
                              {(identity?.display_name || '??').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium flex items-center gap-1">
                                {identity?.display_name || "—"}
                                {lastContact.warning && <AlertTriangle className="w-3 h-3 text-red-500" />}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {identity?.email && <span>{identity.email}</span>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {contract && contract.activeCount > 0 ? (
                              <div>
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                  {contract.activeCount} activo{contract.activeCount > 1 ? 's' : ''} · {formatCurrency(contract.totalValue)}
                                </Badge>
                                {contract.expiringContracts.length > 0 && (
                                  <Badge variant="outline" className="text-xs ml-1 bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 animate-pulse">
                                    ⚠ Expira {format(new Date(contract.expiringContracts[0].end_date), 'dd/MM')}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic">Sem</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-purple-600 dark:text-purple-400">
                                {formatCurrency(contract?.totalValue || 0)}
                              </span>
                              {isUpsell && (
                                <TooltipProvider><Tooltip><TooltipTrigger>
                                  <span className="text-yellow-500 text-xs">💡</span>
                                </TooltipTrigger><TooltipContent>Oportunidade de upselling</TooltipContent></Tooltip></TooltipProvider>
                              )}
                            </div>
                            {contract && contract.totalValue > 0 && (
                              <div className="w-full bg-muted rounded-full h-1 mt-1">
                                <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${Math.min(100, (contract.totalValue / maxContractValue) * 100)}%` }} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {clientTags.map(tag => (
                                <Badge key={tag.id} variant="outline" className={`text-xs ${
                                  tag.tag.toLowerCase() === 'vip' ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  tag.tag.toLowerCase() === 'recorrente' ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' :
                                  tag.tag.toLowerCase() === 'novo' ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' :
                                  ''
                                }`}>{tag.tag}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {identity?.vat ? (
                              <span className="text-xs font-mono">{identity.vat}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.assigned_to && assignedUserMap.get(client.assigned_to) ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {(assignedUserMap.get(client.assigned_to) || '').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                </div>
                                <span className="text-xs">{assignedUserMap.get(client.assigned_to)?.split(' ')[0]}.</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 italic">Sem</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${lastContact.color}`}>
                              {lastContact.text}
                              {lastContact.warning && " ⚠"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {sentimentEmoji ? (
                              <TooltipProvider><Tooltip><TooltipTrigger>
                                <span className="text-lg">{sentimentEmoji}</span>
                              </TooltipTrigger><TooltipContent>
                                {interactionMap.get(client.entity_id)?.lastSentiment === 'positive' ? 'Positivo' :
                                 interactionMap.get(client.entity_id)?.lastSentiment === 'negative' ? 'Negativo' : 'Neutro'}
                              </TooltipContent></Tooltip></TooltipProvider>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{format(new Date(client.created_at), 'dd/MM/yyyy')}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusDisplay.className}>{statusDisplay.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-0.5 justify-end" onClick={(e) => e.stopPropagation()}>
                              {/* Quick actions */}
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/deals')}>
                                  <FileText className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>Novo Pedido</TooltipContent></Tooltip></TooltipProvider>

                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  setEmailTarget({ id: client.id, name: identity?.display_name || "", email: identity?.email || "" });
                                  setShowEmailDialog(true);
                                }}>
                                  <Mail className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent>Enviar email</TooltipContent></Tooltip></TooltipProvider>

                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${health && health.score < 40 ? 'text-red-500 animate-pulse' : ''}`}>
                                      <Phone className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem
                                      disabled={!identity?.phone}
                                      onClick={() => {
                                        const ph = identity?.phone;
                                        const cc = identity?.phone_country_code || "+351";
                                        if (ph) {
                                           const a = document.createElement("a"); a.href = `tel:${cc}${ph}`.replace(/\s/g, ""); a.click();
                                           setTimeout(() => { setCallTarget({ entityId: client.entity_id, name: identity?.display_name || "", phone: ph, clientId: client.id }); setShowCallDialog(true); }, 600);
                                        }
                                      }}
                                    ><PhoneCall className="w-3.5 h-3.5 mr-2" />{identity?.phone ? `Ligar para ${(identity.phone_country_code || "+351")}${identity.phone}` : "Sem número"}</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setCallTarget({ entityId: client.entity_id, name: identity?.display_name || "", phone: identity?.phone || "", clientId: client.id });
                                      setShowCallDialog(true);
                                    }}><ClipboardList className="w-3.5 h-3.5 mr-2" />Registar atividade</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TooltipTrigger><TooltipContent>Registar atividade</TooltipContent></Tooltip></TooltipProvider>

                              {contract?.expiringContracts.length ? (
                                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Renovar contrato</TooltipContent></Tooltip></TooltipProvider>
                              ) : null}

                              {/* More actions dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Comunicação</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => {
                                    setEmailTarget({ id: client.id, name: identity?.display_name || "", email: identity?.email || "" });
                                    setShowEmailDialog(true);
                                  }}><Mail className="w-3.5 h-3.5 mr-2" />Enviar email</DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!identity?.phone}
                                    onClick={() => {
                                      const ph = identity?.phone;
                                      const cc = identity?.phone_country_code || "+351";
                                      if (ph) {
                                         const a = document.createElement("a"); a.href = `tel:${cc}${ph}`.replace(/\s/g, ""); a.click();
                                         setTimeout(() => { setCallTarget({ entityId: client.entity_id, name: identity?.display_name || "", phone: ph, clientId: client.id }); setShowCallDialog(true); }, 600);
                                      }
                                    }}
                                  ><PhoneCall className="w-3.5 h-3.5 mr-2" />{identity?.phone ? `Ligar para ${(identity.phone_country_code || "+351")}${identity.phone}` : "Sem número"}</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    setCallTarget({ entityId: client.entity_id, name: identity?.display_name || "", phone: identity?.phone || "", clientId: client.id });
                                    setShowCallDialog(true);
                                  }}><ClipboardList className="w-3.5 h-3.5 mr-2" />Registar atividade</DropdownMenuItem>
                                  {identity?.phone && (
                                    <DropdownMenuItem onClick={() => {
                                      setWhatsAppContext({
                                        module: "clients",
                                        recipientName: identity?.display_name || "",
                                        recipientPhone: identity?.phone || "",
                                        clientId: client.id,
                                        entityId: client.entity_id,
                                      });
                                      setShowWhatsAppDialog(true);
                                    }}>
                                      <MessageSquare className="w-3.5 h-3.5 mr-2" />WhatsApp
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Comercial</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => navigate('/deals')}>
                                    <FileText className="w-3.5 h-3.5 mr-2" />Novo Pedido de Proposta
                                  </DropdownMenuItem>
                                  <DropdownMenuItem><FileText className="w-3.5 h-3.5 mr-2" />Criar proposta</DropdownMenuItem>
                                  <DropdownMenuItem><FileText className="w-3.5 h-3.5 mr-2" />Criar contrato</DropdownMenuItem>

                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Gestão</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => openClientDetails(client)}>
                                    <Eye className="w-3.5 h-3.5 mr-2" />Ver ficha completa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem><Tag className="w-3.5 h-3.5 mr-2" />Gerir tags</DropdownMenuItem>
                                  <DropdownMenuItem><Star className="w-3.5 h-3.5 mr-2" />Marcar como VIP</DropdownMenuItem>
                                  <DropdownMenuItem><Calendar className="w-3.5 h-3.5 mr-2" />Agendar reunião</DropdownMenuItem>

                                  {client.source_type === 'contact' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <PermissionGate permission="clients.edit">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setClientToRevert(client); setRevertDialogOpen(true); }}>
                                          <Undo2 className="w-3.5 h-3.5 mr-2" />Reverter para Contacto
                                        </DropdownMenuItem>
                                      </PermissionGate>
                                    </>
                                  )}

                                  <DropdownMenuSeparator />
                                  <PermissionGate permission="clients.delete">
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteClick(client, e)}>
                                      <Trash2 className="w-3.5 h-3.5 mr-2" />Eliminar
                                    </DropdownMenuItem>
                                  </PermissionGate>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {loadingMore && (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-4">
                        <div className="flex items-center justify-center gap-2">
                          <OlyviaLoader size={20} inline />
                          <span className="text-sm text-muted-foreground">{t('clients.loadingMore')}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
        </>
        )}

        {/* Client Details Dialog */}
        <ClientDetailsDialog
          client={selectedClient} open={detailsOpen && !!selectedClient}
          onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedClient(null); }}
          onClientUpdated={() => { loadClients(0, true); setDashboardKey(prev => prev + 1); }}
        />

        {/* New Client Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{t('clients.newClient')}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('clients.allTypes')}</h3>
                  <Tabs value={clientType} onValueChange={(v) => setClientType(v as "person" | "company")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="person"><User className="w-4 h-4 mr-2" />{t('clients.type.person')}</TabsTrigger>
                      <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-2" />{t('clients.type.company')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('clients.form.personalInfo')}</h3>
                  {clientType === "person" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('clients.form.firstName')}</Label>
                        <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className={fieldErrors.first_name ? "border-destructive" : ""} />
                        {fieldErrors.first_name && <p className="text-xs text-destructive">{fieldErrors.first_name}</p>}
                      </div>
                      <div className="space-y-2"><Label>{t('clients.form.lastName')}</Label><Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.email')}</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={fieldErrors.email ? "border-destructive" : ""} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.phone')}</Label><PhoneInput phoneValue={formData.phone} countryCodeValue={formData.phone_country_code} onPhoneChange={(v) => setFormData({ ...formData, phone: v })} onCountryCodeChange={(v) => setFormData({ ...formData, phone_country_code: v })} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.vatNumber')}</Label><Input value={formData.vat} onChange={(e) => setFormData({ ...formData, vat: e.target.value })} /></div>
                      <div className="space-y-2">
                        <Label>{t('clients.form.status')}</Label>
                        <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="active">{t('clients.active')}</SelectItem><SelectItem value="inactive">{t('clients.inactive')}</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2"><Label>{t('clients.form.companyName')}</Label><Input value={companyFormData.name} onChange={(e) => setCompanyFormData({ ...companyFormData, name: e.target.value })} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.email')}</Label><Input type="email" value={companyFormData.email} onChange={(e) => setCompanyFormData({ ...companyFormData, email: e.target.value })} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.phone')}</Label><PhoneInput phoneValue={companyFormData.phone} countryCodeValue={companyFormData.phone_country_code} onPhoneChange={(v) => setCompanyFormData({ ...companyFormData, phone: v })} onCountryCodeChange={(v) => setCompanyFormData({ ...companyFormData, phone_country_code: v })} /></div>
                      <div className="space-y-2"><Label>{t('clients.form.vatNumber')}</Label><Input value={companyFormData.vat} onChange={(e) => setCompanyFormData({ ...companyFormData, vat: e.target.value })} /></div>
                      <div className="space-y-2">
                        <Label>{t('clients.form.status')}</Label>
                        <Select value={companyFormData.status} onValueChange={(v) => setCompanyFormData({ ...companyFormData, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="active">{t('clients.active')}</SelectItem><SelectItem value="inactive">{t('clients.inactive')}</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('clients.form.address')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('clients.form.postalCode')}</Label>
                      <div className="flex gap-2">
                        <Input value={addressData.postal_code} onChange={(e) => setAddressData({ ...addressData, postal_code: e.target.value })} />
                        <Button type="button" variant="outline" onClick={handlePostalCodeLookup} disabled={postalLoading || !addressData.postal_code}>
                          {postalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('clients.form.lookup')}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2"><Label>{t('clients.form.street')}</Label><Input value={addressData.street} onChange={(e) => setAddressData({ ...addressData, street: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{t('clients.form.number')}</Label><Input value={addressData.number} onChange={(e) => setAddressData({ ...addressData, number: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{t('clients.form.floor')}</Label><Input value={addressData.floor_number} onChange={(e) => setAddressData({ ...addressData, floor_number: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{t('clients.form.city')}</Label><Input value={addressData.city} onChange={(e) => setAddressData({ ...addressData, city: e.target.value })} /></div>
                    <div className="space-y-2"><Label>{t('clients.form.district')}</Label><Input value={addressData.district} onChange={(e) => setAddressData({ ...addressData, district: e.target.value })} /></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('clients.form.cancel')}</Button>
                <Button type="submit" disabled={savingClient}>{savingClient ? t('common.creating') : `${t('clients.form.create')} ${t('clients.form.client')}`}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar cliente?</AlertDialogTitle>
              <AlertDialogDescription>O cliente será movido para inativos.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Status Dialog */}
        <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Alterar estado em massa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">{t('clients.active')}</SelectItem><SelectItem value="inactive">{t('clients.inactive')}</SelectItem></SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleBulkStatusChange}>Aplicar a {selectedIds.size} clientes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar {selectedIds.size} clientes?</AlertDialogTitle>
              <AlertDialogDescription>Os clientes serão movidos para inativos.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Email Dialog */}
        <SendEntityEmailDialog
          open={showEmailDialog} onOpenChange={setShowEmailDialog}
          module="clients" entityId={emailTarget.id}
          entityName={emailTarget.name} entityEmail={emailTarget.email}
          organizationId={activeCompany?.id || undefined}
          pdfAttachment={emailTarget.pdfAttachment}
        />

        {/* Register Call Dialog */}
        {showCallDialog && (
          <RegisterCallDialog
            open={showCallDialog}
            onOpenChange={setShowCallDialog}
            entityId={callTarget.entityId}
            entityName={callTarget.name}
            organizationId={activeCompany?.id || ""}
            contactId={callTarget.clientId || ""}
            onCallRegistered={() => { setShowCallDialog(false); setClients([]); setHasMore(true); loadClients(0, true); setDashboardKey(prev => prev + 1); }}
            onOpenWhatsApp={(eid, ename, ctx) => {
              const identity = getIdentity(eid);
              if (identity?.phone) {
                const dp = ctx?.dealOrProposal;
                const mod = dp?.type === "proposal" ? "proposals" : dp?.type === "quote" ? "quotes" : "clients";
                setWhatsAppContext({
                  module: mod as any,
                  recipientName: ename,
                  recipientPhone: identity.phone,
                  entityId: eid,
                  hasActiveDeal: dp?.type === "deal" || false,
                  dealName: dp?.type === "deal" ? dp.title : undefined,
                  proposalTitle: dp?.type === "proposal" ? dp.title : undefined,
                  proposalValue: dp?.type === "proposal" ? (dp.value || 0) : undefined,
                  quoteTitle: dp?.type === "quote" ? dp.title : undefined,
                  quoteValue: dp?.type === "quote" ? (dp.value || 0) : undefined,
                });
                setShowWhatsAppDialog(true);
              }
            }}
            onOpenEmail={(eid, ename, ctx) => {
              const identity = getIdentity(eid);
              setEmailTarget({ id: callTarget.clientId || "", name: ename, email: identity?.email || "", pdfAttachment: ctx?.pdfAttachment || null });
              setShowEmailDialog(true);
            }}
          />
        )}

        {/* WhatsApp Dialog */}
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onOpenChange={setShowWhatsAppDialog}
          context={whatsAppContext}
        />

        {/* Revert to Contact Confirmation */}
        <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Undo2 className="h-4 w-4 text-primary" />
                </div>
                Reverter para Contacto
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção vai reverter este cliente para contacto. O registo de cliente será desactivado e o contacto original será restaurado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reverting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={reverting}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!clientToRevert) return;
                  setReverting(true);
                  try {
                    const success = await revertContactToClient(clientToRevert.id);
                    if (success) {
                      setRevertDialogOpen(false);
                      setClientToRevert(null);
                      setClients([]);
                      setHasMore(true);
                      loadClients(0, true);
                    }
                  } finally {
                    setReverting(false);
                  }
                }}
              >
                {reverting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A reverter...</> : "Confirmar Reversão"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DuplicateEntityDialog
          open={clientDuplicateDialogOpen}
          onOpenChange={(open) => { setClientDuplicateDialogOpen(open); if (!open) { setPendingClientData(null); setClientDuplicateMatches([]); } }}
          matches={clientDuplicateMatches}
          entityType="client"
          onOpenExisting={handleClientDuplicateOpenExisting}
          onUpdateExisting={handleClientDuplicateUpdateExisting}
          onCreateAnyway={handleClientDuplicateCreateAnyway}
          onShareWithOrg={handleClientDuplicateShareWithOrg}
          loading={savingClient}
          strictBlocking={true}
        />
      </div>
      )}
    </>
  );
};

export default AnewClients;
