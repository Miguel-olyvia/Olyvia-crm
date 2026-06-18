import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { EntitySearchInput } from "@/components/EntitySearchInput";
import { searchEntityIds } from "@/lib/clientSearch";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, Target, Pencil, Trash2, Search, RefreshCw, Filter, X, Eye,
  ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon,
  User, Zap, Phone, Mail, Copy, AlertTriangle, Clock, MoreHorizontal, History
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { dealSchema } from "@/lib/validations";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useTranslation } from "@/hooks/useTranslation";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useBulkActions } from "@/hooks/useBulkActions";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { BulkStatusDialog, BulkDeleteDialog } from "@/components/BulkActionDialogs";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { DealWorkflowConfig } from "@/components/deals/DealWorkflowConfig";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { DealNeedsSection } from "@/components/deals/DealNeedsSection";
import { CatalogItemPicker, CatalogLineItem } from "@/components/clients/detail/CatalogItemPicker";
import { DealsKanbanView } from "@/components/deals/DealsKanbanView";
import { DealsDashboardView } from "@/components/deals/DealsDashboardView";
import { LayoutList, Columns3, BarChart3, Download, TrendingUp, Timer, AlertCircle } from "lucide-react";
import {
  getDealStageLabel,
  isWonStage,
  isLostStage,
  isClosedStage,
} from "@/lib/dealStageUtils";

interface DealStageRel {
  id: string;
  name: string;
  color: string;
  stage_key: string | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  is_final: boolean | null;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  probability: number;
  description: string | null;
  lost_reason: string | null;
  expected_close_date: string | null;
  created_at: string;
  closed_at: string | null;
  created_by: string | null;
  assigned_to: string | null;
  
  organization_id: string | null;
  lead_id: string | null;
  client_id: string | null;
  contact_id?: string | null;
  entity_id: string | null;
  entity_name?: string | null;
  organization_name?: string | null;
  creator_name?: string | null;
  entity_email?: string | null;
  entity_phone?: string | null;
  assigned_to_name?: string | null;
  lead_source?: string | null;
  deal_stages: DealStageRel | null;
  proposal_stage_id?: string | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order_index: number;
  stage_key: string | null;
  is_won: boolean | null;
  is_lost: boolean | null;
  is_final: boolean | null;
}

type SortColumn = 'title' | 'value' | 'probability' | 'stage' | 'created_at';
type SortDirection = 'asc' | 'desc';

type ViewMode = 'lista' | 'kanban' | 'dashboard';

const Deals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useTranslation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null);
  const [originalStageId, setOriginalStageId] = useState<string | null>(null);
  const [showWorkflowConfig, setShowWorkflowConfig] = useState(false);
  const [dealLineItems, setDealLineItems] = useState<CatalogLineItem[]>([]);
  const { toast } = useToast();
  const { activeCompany, userType: companyUserType, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading, isSystemAdmin } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  const [isParentOrg, setIsParentOrg] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [resolvedRootOrgId, setResolvedRootOrgId] = useState<string | null>(null);

  // Dashboard stats (independent from paginated data)
  const [dealsDashboardStats, setDealsDashboardStats] = useState<{
    total: number; totalValue: number;
    stageStats: Record<string, number>; stageValues: Record<string, number>;
    wonCount: number; wonValue: number; lostCount: number;
    conversionRate: number; avgCloseTimeDays: number;
    stalledCount: number; stalledValue: number;
    openCount: number; openValue: number;
  } | null>(null);
  const [dashboardDeals, setDashboardDeals] = useState<Deal[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<boolean>(false);
  const [teamBusinessUserIds, setTeamBusinessUserIds] = useState<Set<string>>(new Set());
  
  // Handle create from lead URL param
  const createFromLeadId = searchParams.get("create_from_lead");

  // Pagination
  const PAGE_SIZE = 200;
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const currentPageRef = useRef(0);
  const submitLockRef = useRef(false);
  const cachedChildrenMapRef = useRef<Map<string, string[]> | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const truncatedWarnedRef = useRef<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(true);

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");


  // Bulk actions
  const {
    selectedIds,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    bulkStatusDialogOpen,
    setBulkStatusDialogOpen,
    bulkDeleteDialogOpen,
    setBulkDeleteDialogOpen,
    bulkNewStatus,
    setBulkNewStatus,
    processing,
    setProcessing,
    handleBulkDelete,
  } = useBulkActions({
    tableName: "deals",
    onSuccess: () => {
      loadData();
    },
    softDelete: false,
  });

  // Custom bulk stage change for deals (uses stage_id instead of status)
  const handleBulkStageChange = async () => {
    if (selectedIds.size === 0 || !bulkNewStatus) return;
    setProcessing(true);

    try {
      const dealIds = Array.from(selectedIds);
      
      const { error } = await (supabase
        .from("deals" as any)
        .update({ stage_id: bulkNewStatus } as any)
        .in("id", dealIds) as any);

      if (error) throw error;

      // Trigger workflow for each deal (e.g. auto-create quotes)
      const workflowPromises = dealIds.map(async (dealId) => {
        try {
          // Get the deal's organization_id and created_by
          const { data: deal } = await (supabase
            .from("deals" as any)
            .select("organization_id, created_by")
            .eq("id", dealId)
            .single() as any);

          if (deal) {
            await supabase.functions.invoke('execute-workflow', {
              body: {
                source_entity: 'deal',
                entity_id: dealId,
                new_stage_id: bulkNewStatus,
                organization_id: deal.organization_id,
                triggered_by: deal.created_by,
              }
            });
          }
        } catch (wfError) {
          console.error(`Workflow failed for deal ${dealId}:`, wfError);
        }
      });

      await Promise.all(workflowPromises);

      toast({ 
        title: t('common.statusUpdated'),
        description: `${selectedIds.size} ${t('deals.records') || 'registos'} ${t('common.updated') || 'atualizados'}.`
      });
      clearSelection();
      setBulkStatusDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Status options for bulk change
  const stageStatusOptions = useMemo(() => 
    stages.map(s => ({ value: s.id, label: getDealStageLabel(s, t) })),
    [stages, t]
  );

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("deals.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Resolve root organization id (walk UP hierarchy)
  useEffect(() => {
    const resolveRootOrg = async () => {
      if (!activeCompany?.id) return;
      try {
        const { data: allHierarchy } = await supabase
          .from("anew_hierarchy")
          .select("parent_org_id, child_org_id")
          .in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);

        const parentMap = new Map<string, string>();
        const childrenMap = new Map<string, string[]>();
        (allHierarchy || []).forEach((h: any) => {
          parentMap.set(h.child_org_id, h.parent_org_id);
          const existing = childrenMap.get(h.parent_org_id) || [];
          existing.push(h.child_org_id);
          childrenMap.set(h.parent_org_id, existing);
        });

        // Walk up to find root
        let current = activeCompany.id;
        while (parentMap.has(current)) {
          current = parentMap.get(current)!;
        }
        setResolvedRootOrgId(current);

        // Check if activeCompany has children
        const scopeIds = new Set<string>([activeCompany.id]);
        const queue = [activeCompany.id];
        while (queue.length > 0) {
          const cur = queue.shift()!;
          for (const child of (childrenMap.get(cur) || [])) {
            if (!scopeIds.has(child)) {
              scopeIds.add(child);
              queue.push(child);
            }
          }
        }
        setIsParentOrg(scopeIds.size > 1);

        // Cache childrenMap for reuse in loadData (C9)
        cachedChildrenMapRef.current = childrenMap;
      } catch (err) {
        console.error("Error resolving root org:", err);
        setResolvedRootOrgId(activeCompany.id);
      }
    };
    resolveRootOrg();
  }, [activeCompany?.id]);

  // Fetch dashboard stats independently (all deals, no pagination)
  const fetchDealsDashboardStats = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!activeCompany?.id) return;
    setStatsLoading(true);
    try {
      let query = supabase
        .from("deals")
        .select("id, title, value, probability, created_at, closed_at, lost_reason, stage_id, assigned_to, lead_id, deal_stages(id, name, stage_key, color, is_won, is_lost, is_final)")
        .is("deleted_at", null)
        .range(0, 9999);
      if (activeCompany?.id) {
        // Use same org scope logic
        const childrenLookup = cachedChildrenMapRef.current;
        const scopeOrgIds = new Set<string>([activeCompany.id]);
        if (childrenLookup && childrenLookup.size > 0) {
          const bfsQueue = [activeCompany.id];
          while (bfsQueue.length > 0) {
            const cur = bfsQueue.shift()!;
            for (const child of (childrenLookup.get(cur) || [])) {
              if (!scopeOrgIds.has(child)) { scopeOrgIds.add(child); bfsQueue.push(child); }
            }
          }
        }
        query = query.in("organization_id", Array.from(scopeOrgIds));
      }
      const { data, error } = await query;
      if (error) throw error;
      const all = (data || []) as any[];
      const assignedToIds = [...new Set(all.map(d => d.assigned_to).filter(Boolean))] as string[];
      const leadIds = [...new Set(all.map(d => d.lead_id).filter(Boolean))] as string[];
      const [assignedUsersRes, leadSourcesRes] = await Promise.all([
        assignedToIds.length > 0
          ? supabase.from("anew_users").select("id, name").in("id", assignedToIds)
          : { data: [] },
        leadIds.length > 0
          ? (supabase.from("anew_leads") as any).select("id, source, campaign_id").in("id", leadIds)
          : { data: [] },
      ]);
      const assignedMap = new Map((assignedUsersRes.data || []).map((u: any) => [u.id, u.name]));
      const leadSourceMap = new Map((leadSourcesRes.data || []).map((l: any) => [l.id, l.source || (l.campaign_id ? "campanha" : "manual")]));
      setDashboardDeals(all.map((deal) => ({
        ...deal,
        probability: deal.probability ?? 0,
        closed_at: deal.closed_at ?? null,
        description: null,
        expected_close_date: null,
        created_by: null,
        organization_id: activeCompany.id,
        client_id: null,
        contact_id: null,
        entity_id: null,
        assigned_to_name: deal.assigned_to ? (assignedMap.get(deal.assigned_to) || "Utilizador") : null,
        lead_source: deal.lead_id ? (leadSourceMap.get(deal.lead_id) || null) : null,
      })) as Deal[]);
      const total = all.length;
      const totalValue = all.reduce((sum, d) => sum + (d.value || 0), 0);
      const stageStats: Record<string, number> = {};
      const stageValues: Record<string, number> = {};
      stages.forEach(stage => {
        const sd = all.filter(d => d.deal_stages?.id === stage.id);
        stageStats[stage.id] = sd.length;
        stageValues[stage.id] = sd.reduce((sum, d) => sum + (d.value || 0), 0);
      });
      const wonDeals = all.filter(d => isWonStage(d.deal_stages));
      const lostDeals = all.filter(d => isLostStage(d.deal_stages));
      const conversionRate = total > 0 ? Math.round((wonDeals.length / total) * 100 * 10) / 10 : 0;
      const avgCloseTimeDays = wonDeals.length > 0
        ? Math.round(wonDeals.reduce((sum, d) => sum + differenceInDays(new Date(), parseISO(d.created_at)), 0) / wonDeals.length)
        : 0;
      const stalledDeals = all.filter(d => {
        const daysOpen = differenceInDays(new Date(), parseISO(d.created_at));
        return daysOpen > 30 && !isClosedStage(d.deal_stages);
      });
      const stalledValue = stalledDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const openDeals = all.filter(d => !isClosedStage(d.deal_stages));
      const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      setDealsDashboardStats({
        total, totalValue, stageStats, stageValues,
        wonCount: wonDeals.length, wonValue: wonDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        lostCount: lostDeals.length, conversionRate, avgCloseTimeDays,
        stalledCount: stalledDeals.length, stalledValue,
        openCount: openDeals.length, openValue,
      });
    } catch (err) {
      console.error("Error fetching deals dashboard stats:", err);
      setDashboardDeals([]);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, [activeCompany?.id, stages]);

  // Stable ref so loadData doesn't depend on fetchDealsDashboardStats identity
  const fetchStatsRef = useRef(fetchDealsDashboardStats);
  fetchStatsRef.current = fetchDealsDashboardStats;

  useEffect(() => {
    if (activeCompany?.id && stages.length > 0) fetchDealsDashboardStats();
  }, [activeCompany?.id, stages, fetchDealsDashboardStats]);

  const [formData, setFormData] = useState({
    title: "",
    value: "",
    value_max: "",
    stage_id: "",
    lead_id: "",
    client_id: "",
    probability: "50",
    description: "",
    expected_close_date: "",
    lost_reason: "",
  });

   // Search states for lead/client/contact mention
  const [entityType, setEntityType] = useState<'lead' | 'client' | 'contact'>('lead');
  const [entitySearch, setEntitySearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ type: 'lead' | 'client' | 'contact'; id: string; name: string; email?: string; phone?: string }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: 'lead' | 'client' | 'contact'; id: string; name: string; email?: string; phone?: string; entityId?: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Helper: check if user can act on a specific deal based on scope
  const canActOnDeal = useCallback((deal: Deal, permissionCode: string): boolean => {
    if (isSystemAdmin) return true;
    const scope = getPermissionScope(permissionCode);
    if (scope === "NONE") return false;
    if (scope === "ORG") return true;
    const ownIds = new Set<string>();
    if (scopeAnewUserId) ownIds.add(scopeAnewUserId);
    if (scope === "TEAM") {
      teamBusinessUserIds.forEach(id => ownIds.add(id));
    }
    return ownIds.has(deal.created_by || "") || ownIds.has(deal.assigned_to || "");
  }, [getPermissionScope, scopeAnewUserId, teamBusinessUserIds, isSystemAdmin]);

  const isDisqualifiedStage = () => {
    const selectedStage = stages.find(s => s.id === formData.stage_id);
    return selectedStage?.name === 'Desqualificado';
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      currentPageRef.current = 0;
      fetchStatsRef.current();
    }

    const from = currentPageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    try {
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      const viewScope = getPermissionScope("deals.view");

      // If scope is still loading, skip — will re-run when ready
      if (scopeLoading) { setLoading(false); return; }

      // Load stages, companies, contacts, leads, clients (only on initial load)
      if (!append) {
        const stagesRes = await supabase.from("deal_stages").select("id, name, stage_key, order_index, color, is_won, is_lost, is_final").order("order_index");
        if (stagesRes.error) throw stagesRes.error;
        setStages(stagesRes.data || []);
        if (stagesRes.data && stagesRes.data.length > 0 && !formData.stage_id) {
          setFormData(prev => ({ ...prev, stage_id: stagesRes.data[0].id }));
        }
      }

      const scopedInternalUserIds = new Set<string>();

      if (scopeAnewUserId) scopedInternalUserIds.add(scopeAnewUserId);
      if (viewScope === "TEAM" && teamMemberIds.length > 0) {
        teamMemberIds.forEach((id) => scopedInternalUserIds.add(id));
      }

      // Store resolved business user IDs for scope-based action checks
      setTeamBusinessUserIds(new Set(scopedInternalUserIds));

      // Build organization subtree scope (used both for search pre-resolution and main query)
      let scopeOrgIdsArr: string[] = [];
      if (activeCompany?.id) {
        const childrenLookup = cachedChildrenMapRef.current;
        const scopeOrgIds = new Set<string>([activeCompany.id]);
        if (childrenLookup && childrenLookup.size > 0) {
          const bfsQueue = [activeCompany.id];
          while (bfsQueue.length > 0) {
            const cur = bfsQueue.shift()!;
            for (const child of (childrenLookup.get(cur) || [])) {
              if (!scopeOrgIds.has(child)) {
                scopeOrgIds.add(child);
                bfsQueue.push(child);
              }
            }
          }
        }
        scopeOrgIdsArr = Array.from(scopeOrgIds);
      }

      // Server-side search: pre-resolve deal IDs matching title or entity (name/email/phone/NIF)
      let searchDealIds: string[] | null = null;
      if (debouncedSearch && debouncedSearch.trim().length >= 3) {
        const term = debouncedSearch.trim();
        const { ids: matchedEntityIds, truncated } = await searchEntityIds(term);
        if (truncated && truncatedWarnedRef.current !== term) {
          truncatedWarnedRef.current = term;
          toast({
            title: "Demasiados resultados",
            description: "Mais de 1000 resultados — refine a pesquisa para ver todos.",
          });
        }
        // Escape special chars for PostgREST or filter
        const escTerm = term.replace(/[,()*]/g, " ").replace(/\s+/g, " ").trim();
        let searchIdsQuery = (supabase.from("deals") as any)
          .select("id")
          .is("deleted_at", null);
        if (scopeOrgIdsArr.length > 0) searchIdsQuery = searchIdsQuery.in("organization_id", scopeOrgIdsArr);
        if (matchedEntityIds.length > 0) {
          searchIdsQuery = searchIdsQuery.or(`title.ilike.%${escTerm}%,entity_id.in.(${matchedEntityIds.join(",")})`);
        } else {
          searchIdsQuery = searchIdsQuery.ilike("title", `%${escTerm}%`);
        }
        const { data: idsRows } = await searchIdsQuery.limit(2000);
        searchDealIds = (idsRows || []).map((r: any) => r.id);
        if (searchDealIds.length === 0) {
          if (!append) {
            setDeals([]);
            setTotalCount(0);
          }
          setHasMore(false);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
      }

      // Load deals with pagination filtered by organization
      let dealsQuery = supabase
        .from("deals")
        .select(`id, title, value, stage_id, probability, expected_close_date, description, assigned_to, created_by, created_at, closed_at, lost_reason, lead_id, client_id, organization_id, entity_id, contact_id, deal_stages(id, name, stage_key, color, is_won, is_lost, is_final)`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (scopeOrgIdsArr.length > 0) {
        dealsQuery = dealsQuery.in("organization_id", scopeOrgIdsArr);
      }
      if (searchDealIds) {
        dealsQuery = dealsQuery.in("id", searchDealIds);
      }
      
      // Apply scope-based ownership filtering
      const isFullScope = viewScope === "ORG" || isSystemAdmin;

      if (!isFullScope && scopedInternalUserIds.size > 0) {
        const allowedBusinessIds = Array.from(scopedInternalUserIds);
        dealsQuery = dealsQuery.or(`assigned_to.in.(${allowedBusinessIds.join(',')}),created_by.in.(${allowedBusinessIds.join(',')})`);
      }
      
      const { data: dealsData, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // For TEAM/OWNED scopes, also get deals where associated leads are assigned to allowed users
      let additionalDeals: any[] = [];
      if (!isFullScope && activeCompany?.id && scopedInternalUserIds.size > 0) {
        const leadOwnershipFilter = [
          scopedInternalUserIds.size > 0
            ? `assigned_to.in.(${Array.from(scopedInternalUserIds).join(',')})`
            : null,
          scopedInternalUserIds.size > 0
            ? `created_by.in.(${Array.from(scopedInternalUserIds).join(',')})`
            : null,
        ].filter(Boolean).join(',');

        const { data: userLeads } = await (supabase
          .from("anew_leads") as any)
          .select("id")
          .eq("organization_id", activeCompany.id)
          .or(leadOwnershipFilter);
        
        if (userLeads && userLeads.length > 0) {
          const leadIds = userLeads.map(l => l.id);
          const existingDealIds = (dealsData || []).map(d => d.id);
          
          let leadDealsQuery = supabase
            .from("deals")
            .select(`id, title, value, stage_id, probability, expected_close_date, description, assigned_to, created_by, created_at, closed_at, lost_reason, lead_id, client_id, organization_id, entity_id, contact_id, deal_stages(id, name, stage_key, color, is_won, is_lost, is_final)`)
            .eq("organization_id", activeCompany.id)
            .in("lead_id", leadIds)
            .is("deleted_at", null)
            .not("id", "in", `(${existingDealIds.length > 0 ? existingDealIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
            .order("created_at", { ascending: false });
          // Apply same server-side search filter to keep results consistent
          if (searchDealIds) {
            leadDealsQuery = leadDealsQuery.in("id", searchDealIds);
          }
          const { data: leadDeals } = await leadDealsQuery;
          
          additionalDeals = leadDeals || [];
        }
      }

      // Combine deals
      const allDealsData = Array.from(
        new Map([...(dealsData || []), ...additionalDeals].map((deal) => [deal.id, deal])).values()
      );

      // Collect unique entity_ids, organization_ids and creator user_ids for batch resolution
      const entityIds = [...new Set(allDealsData.map(d => d.entity_id).filter(Boolean))];
      const orgIds = [...new Set(allDealsData.map(d => d.organization_id).filter(Boolean))];
      const creatorIds = [...new Set(allDealsData.map(d => d.created_by).filter(Boolean))];
      const assignedToIds = [...new Set(allDealsData.map(d => d.assigned_to).filter(Boolean))];
      const leadIds = [...new Set(allDealsData.map(d => d.lead_id).filter(Boolean))];
      const dealIds = allDealsData.map(d => d.id);

      // Batch fetch: entities, organizations, creators, proposals, assigned users, lead sources — all in parallel
      const [entitiesRes, orgsRes, creatorsRes, proposalsRes, entityEmailsRes, entityPhonesRes, assignedUsersRes, leadSourcesRes] = await Promise.all([
        entityIds.length > 0 
          ? supabase.from("anew_entities").select("id, display_name").in("id", entityIds)
          : { data: [] },
        orgIds.length > 0
          ? supabase.from("anew_organizations").select("id, name").in("id", orgIds)
          : { data: [] },
        creatorIds.length > 0
          ? supabase.from("anew_users").select("id, name").in("id", creatorIds)
          : { data: [] },
        dealIds.length > 0
          ? supabase.from("proposals").select("deal_id, stage_id").in("deal_id", dealIds)
          : { data: [] },
        entityIds.length > 0
          ? supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", entityIds).eq("is_primary", true)
          : { data: [] },
        entityIds.length > 0
          ? supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", entityIds).eq("is_primary", true)
          : { data: [] },
        assignedToIds.length > 0
          ? supabase.from("anew_users").select("id, name").in("id", assignedToIds)
          : { data: [] },
        leadIds.length > 0
          ? (supabase.from("anew_leads") as any).select("id, source, campaign_id, assigned_to").in("id", leadIds)
          : { data: [] },
      ]);

      // Build lookup maps
      const entityMap = new Map((entitiesRes.data || []).map(e => [e.id, e.display_name]));
      const orgMap = new Map((orgsRes.data || []).map(o => [o.id, o.name]));
      const creatorMap = new Map((creatorsRes.data || []).map(u => [u.id, u.name]));
      const emailMap = new Map((entityEmailsRes.data || []).map(e => [e.entity_id, e.email]));
      const phoneMap = new Map((entityPhonesRes.data || []).map(p => [p.entity_id, p.phone_number]));
      const assignedMap = new Map((assignedUsersRes.data || []).map(u => [u.id, u.name]));
      const leadSourceMap = new Map((leadSourcesRes.data || []).map((l: any) => [l.id, l.source || (l.campaign_id ? 'campanha' : 'manual')]));
      const leadAssignedMap = new Map((leadSourcesRes.data || []).map((l: any) => [l.id, l.assigned_to]));

      // Resolve lead assigned_to names — leads use anew_users.id (internal), not auth_user_id
      const leadAssignedInternalIds = [...new Set(
        (leadSourcesRes.data || []).map((l: any) => l.assigned_to).filter(Boolean)
      )] as string[];
      const leadAssignedNameMap = new Map<string, string>();
      if (leadAssignedInternalIds.length > 0) {
        const { data: leadUsers } = await supabase
          .from("anew_users")
          .select("id, name")
          .in("id", leadAssignedInternalIds);
        (leadUsers || []).forEach((u: any) => leadAssignedNameMap.set(u.id, u.name));
      }
      
      const proposalsByDeal = new Map<string, string | null>();
      (proposalsRes.data || []).forEach((p: any) => {
        if (p.deal_id) proposalsByDeal.set(p.deal_id, p.stage_id);
      });

      // Map deals with resolved names
      const mappedDeals: Deal[] = allDealsData.map(deal => ({
        ...deal,
        entity_name: deal.entity_id ? entityMap.get(deal.entity_id) || null : null,
        organization_name: orgMap.get(deal.organization_id) || null,
        creator_name: deal.created_by ? creatorMap.get(deal.created_by) || null : null,
        entity_email: deal.entity_id ? emailMap.get(deal.entity_id) || null : null,
        entity_phone: deal.entity_id ? phoneMap.get(deal.entity_id) || null : null,
        assigned_to_name: deal.lead_id && leadAssignedMap.get(deal.lead_id)
          ? (leadAssignedNameMap.get(String(leadAssignedMap.get(deal.lead_id) || '')) || null)
          : (deal.assigned_to ? assignedMap.get(deal.assigned_to) || null : null),
        lead_source: deal.lead_id ? leadSourceMap.get(deal.lead_id) || null : null,
        proposal_stage_id: proposalsByDeal.has(deal.id) ? proposalsByDeal.get(deal.id) : null,
      }));

      

      // Update total count
      if (!append) {
        if (isFullScope) {
          let countQuery = supabase
            .from("deals")
            .select("id", { count: 'exact', head: true });
          
          if (activeCompany?.id) {
            countQuery = countQuery.eq("organization_id", activeCompany.id);
          }
          
          const { count } = await countQuery;
          setTotalCount(count || 0);
        } else {
          setTotalCount(mappedDeals.length);
        }
      }

      if (append) {
        setDeals(prev => {
          const merged = [...prev, ...mappedDeals];
          return Array.from(new Map(merged.map((deal) => [deal.id, deal])).values());
        });
      } else {
        setDeals(Array.from(new Map(mappedDeals.map((deal) => [deal.id, deal])).values()));
      }

      setHasMore(mappedDeals.length === PAGE_SIZE);
      currentPageRef.current += 1;
    } catch (error: any) {
      toast({
        title: t('deals.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [toast, t, formData.stage_id, activeCompany?.id, companyUserType, isSystemAdmin, getPermissionScope, scopeAnewUserId, teamMemberIds, scopeLoading, debouncedSearch]);

  useEffect(() => {
    // Reset and reload when company, userType, scope readiness, or search changes
    if (scopeLoading) return; // Wait for permissions to resolve
    setDeals([]);
    setDashboardDeals([]);
    setTotalCount(0);
    currentPageRef.current = 0;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id, companyUserType, scopeLoading, debouncedSearch]);

  const resolveDealForDetails = useCallback(async (dealId: string): Promise<Deal | null> => {
    const localDeal = deals.find((deal) => deal.id === dealId);
    if (localDeal) return localDeal;

    try {
      const { data, error } = await (supabase as any)
        .from("deals")
        .select("id, title, value, stage_id, probability, expected_close_date, description, assigned_to, created_by, created_at, closed_at, lost_reason, lead_id, client_id, organization_id, entity_id, contact_id, deal_stages(id, name, stage_key, color, is_won, is_lost, is_final)")
        .eq("id", dealId)
        .single();

      if (error || !data) return null;

      const [entityRes, orgRes, creatorRes, emailRes, phoneRes, leadRes] = await Promise.all([
        data.entity_id
          ? supabase.from("anew_entities").select("id, display_name").eq("id", data.entity_id).maybeSingle()
          : Promise.resolve({ data: null }),
        data.organization_id
          ? supabase.from("anew_organizations").select("id, name").eq("id", data.organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
        data.created_by
          ? supabase.from("anew_users").select("id, name").eq("id", data.created_by).maybeSingle()
          : Promise.resolve({ data: null }),
        data.entity_id
          ? supabase.from("anew_entity_emails").select("entity_id, email").eq("entity_id", data.entity_id).eq("is_primary", true).maybeSingle()
          : Promise.resolve({ data: null }),
        data.entity_id
          ? supabase.from("anew_entity_phones").select("entity_id, phone_number").eq("entity_id", data.entity_id).eq("is_primary", true).maybeSingle()
          : Promise.resolve({ data: null }),
        data.lead_id
          ? (supabase.from("anew_leads") as any).select("id, source, assigned_to").eq("id", data.lead_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      let assignedToName: string | null = null;

      if (leadRes.data?.assigned_to) {
        const { data: leadAssignedUser } = await supabase
          .from("anew_users")
          .select("id, name")
          .eq("id", leadRes.data.assigned_to)
          .maybeSingle();
        assignedToName = leadAssignedUser?.name || null;
      } else if (data.assigned_to) {
        const { data: assignedUser } = await supabase
          .from("anew_users")
          .select("id, name")
          .eq("id", data.assigned_to)
          .maybeSingle();
        assignedToName = assignedUser?.name || null;
      }

      return {
        ...data,
        entity_name: entityRes.data?.display_name || null,
        organization_name: orgRes.data?.name || null,
        creator_name: creatorRes.data?.name || null,
        entity_email: emailRes.data?.email || null,
        entity_phone: phoneRes.data?.phone_number || null,
        assigned_to_name: assignedToName,
        lead_source: leadRes.data?.source || null,
      } as Deal;
    } catch (err) {
      console.error("Error resolving deal for details:", err);
      return null;
    }
  }, [deals]);

  // Handle deep-link ?open=dealId
  const openDealIdParam = searchParams.get("open");
  const stateOpenDealId = (location.state as { openDealId?: string } | null)?.openDealId ?? null;
  const [pendingOpenDealId, setPendingOpenDealId] = useState<string | null>(stateOpenDealId || openDealIdParam);

  useEffect(() => {
    const paramId = searchParams.get("open");
    const nextOpenId = stateOpenDealId || paramId;
    if (nextOpenId && nextOpenId !== pendingOpenDealId) {
      setPendingOpenDealId(nextOpenId);
    }
  }, [searchParams, stateOpenDealId, pendingOpenDealId]);

  useEffect(() => {
    if (!pendingOpenDealId || loading) return;

    const openDeal = async () => {
      try {
        const resolvedDeal = await resolveDealForDetails(pendingOpenDealId);
        if (resolvedDeal) {
          setDetailDeal(resolvedDeal);
          setShowDetails(true);
        }
      } finally {
        setPendingOpenDealId(null);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("open");
        setSearchParams(nextParams, { replace: true });
        if (location.state && (location.state as { openDealId?: string }).openDealId) {
          navigate(location.pathname, { replace: true, state: {} });
        }
      }
    };

    openDeal();
  }, [pendingOpenDealId, loading, resolveDealForDetails, searchParams, setSearchParams, location.pathname, location.state, navigate]);

  // Handle create from lead param
  useEffect(() => {
    if (createFromLeadId && stages.length > 0) {
      // Fetch lead data and open modal
      const fetchLeadAndOpenModal = async () => {
        try {
          const { data: lead, error } = await (supabase
            .from("anew_leads") as any)
            .select("id, organization_id, client_id, entity_id")
            .eq("id", createFromLeadId)
            .single();
          
          if (error || !lead) {
            toast({ 
              title: t('common.error'), 
              description: t('deals.toast.leadNotFound') || 'Lead não encontrada',
              variant: "destructive"
            });
            searchParams.delete("create_from_lead");
            setSearchParams(searchParams);
            return;
          }

          // Resolve name via anew_entities
          let leadName = `Lead #${lead.id.slice(0, 8)}`;
          let leadEmail: string | undefined;
          let leadPhone: string | undefined;
          
          if (lead.entity_id) {
            const [entRes, emRes, phRes] = await Promise.all([
              supabase.from("anew_entities").select("display_name").eq("id", lead.entity_id).single(),
              supabase.from("anew_entity_emails").select("email").eq("entity_id", lead.entity_id).eq("is_primary", true).limit(1),
              supabase.from("anew_entity_phones").select("phone_number").eq("entity_id", lead.entity_id).eq("is_primary", true).limit(1),
            ]);
            leadName = entRes.data?.display_name || leadName;
            leadEmail = emRes.data?.[0]?.email;
            leadPhone = phRes.data?.[0]?.phone_number;
          }

          // client_id: legacy lead.client_id is deprecated. Resolver via entity_id+organization_id se necessário.
          let resolvedClientId = "";
          if (lead.entity_id && lead.organization_id) {
            const { data: clientRow } = await (supabase as any)
              .from("anew_clients")
              .select("id")
              .eq("entity_id", lead.entity_id)
              .eq("organization_id", lead.organization_id)
              .is("deleted_at", null)
              .maybeSingle();
            resolvedClientId = clientRow?.id || "";
          }

          setFormData({
            title: `Pedido - ${leadName}`,
            value: "",
            value_max: "",
            stage_id: stages[0]?.id || "",
            lead_id: lead.id,
            client_id: resolvedClientId,
            probability: "50",
            description: "",
            expected_close_date: "",
            lost_reason: "",
          });
          
          setEntityType('lead');
          setSelectedEntity({ 
            type: 'lead', 
            id: lead.id, 
            name: leadName,
            email: leadEmail,
            phone: leadPhone,
            entityId: lead.entity_id || undefined,
          });
          
          setOpen(true);
          
          // Clear the param
          searchParams.delete("create_from_lead");
          setSearchParams(searchParams);
        } catch (err) {
          console.error("Error fetching lead:", err);
        }
      };
      
      fetchLeadAndOpenModal();
    }
  }, [createFromLeadId, stages, searchParams, setSearchParams, toast, t]);

  const loadMoreDeals = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadData(true);
    }
  }, [loadingMore, hasMore, loadData]);

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMoreDeals,
    hasMore,
    isLoading: loadingMore
  });

  // Stats based on deal pipeline stages
  const stats = useMemo(() => {
    const total = deals.length;
    const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
    
    // Count by each deal stage
    const stageStats: Record<string, number> = {};
    const stageValues: Record<string, number> = {};
    stages.forEach(stage => {
      const stageDeals = deals.filter(d => d.deal_stages?.id === stage.id);
      stageStats[stage.id] = stageDeals.length;
      stageValues[stage.id] = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    });
    
    const avgProbability = deals.length > 0 
      ? Math.round(deals.reduce((sum, d) => sum + (d.probability || 0), 0) / deals.length)
      : 0;

    // Extra KPIs
    const wonDeals = deals.filter(d => isWonStage(d.deal_stages));
    const lostDeals = deals.filter(d => isLostStage(d.deal_stages));
    const activeDeals = deals.filter(d => !d.lost_reason);
    const conversionRate = total > 0 ? Math.round((wonDeals.length / total) * 100 * 10) / 10 : 0;
    
    const avgCloseTimeDays = wonDeals.length > 0
      ? Math.round(wonDeals.reduce((sum, d) => sum + differenceInDays(new Date(), parseISO(d.created_at)), 0) / wonDeals.length)
      : 0;

    const stalledDeals = deals.filter(d => {
      const daysOpen = differenceInDays(new Date(), parseISO(d.created_at));
      return daysOpen > 30 && !isClosedStage(d.deal_stages);
    });
    const stalledValue = stalledDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    // Open deals (not won or lost)
    const openDeals = deals.filter(d => !isClosedStage(d.deal_stages));
    const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    
    return { 
      total, 
      totalValue, 
      stageStats,
      stageValues,
      avgProbability,
      wonCount: wonDeals.length,
      wonValue: wonDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      lostCount: lostDeals.length,
      conversionRate,
      avgCloseTimeDays,
      stalledCount: stalledDeals.length,
      stalledValue,
      openCount: openDeals.length,
      openValue,
    };
  }, [deals, stages]);

  // Filtered and sorted deals (search is applied server-side; here only stage/date)
  const filteredDeals = useMemo(() => {
    let result = deals.filter((deal) => {
      // Stage filter
      if (stageFilter !== "all" && deal.deal_stages?.id !== stageFilter) {
        return false;
      }
      
      // Date range filter
      if (dateFrom || dateTo) {
        const dealDate = parseISO(deal.created_at);
        if (dateFrom && dateTo) {
          if (!isWithinInterval(dealDate, { start: startOfDay(dateFrom), end: endOfDay(dateTo) })) {
            return false;
          }
        } else if (dateFrom && dealDate < startOfDay(dateFrom)) {
          return false;
        } else if (dateTo && dealDate > endOfDay(dateTo)) {
          return false;
        }
      }
      
      return true;
    });
    
    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'value':
          comparison = (a.value || 0) - (b.value || 0);
          break;
        case 'probability':
          comparison = (a.probability || 0) - (b.probability || 0);
          break;
        case 'stage':
          comparison = getDealStageLabel(a.deal_stages, t).localeCompare(getDealStageLabel(b.deal_stages, t));
          break;
        case 'created_at':
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });


    
    return result;
  }, [deals, stageFilter, dateFrom, dateTo, sortColumn, sortDirection, t]);

  const clearFilters = () => {
    setSearchTerm("");
    setStageFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = searchTerm || stageFilter !== "all" || dateFrom || dateTo;

  // Kanban drag handler
  const handleKanbanStageDrop = useCallback(async (dealId: string, newStageId: string, oldStageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await (supabase.from("deals") as any)
        .update({ stage_id: newStageId })
        .eq("id", dealId);

      // Execute workflow for stage change
      try {
        await supabase.functions.invoke('execute-workflow', {
          body: {
            source_entity: 'deal',
            entity_id: dealId,
            new_stage_id: newStageId,
            old_stage_id: oldStageId,
            organization_id: activeCompany?.id,
            triggered_by: user?.id,
          },
        });
      } catch (wfError) {
        console.error("Workflow execution error:", wfError);
      }

      toast({ title: "Pedido movido com sucesso" });
      loadData();
    } catch (error: any) {
      toast({ title: "Erro ao mover pedido", description: error.message, variant: "destructive" });
    }
  }, [activeCompany?.id, toast, loadData]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const handleEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setOriginalStageId(deal.deal_stages?.id || null);
    setFormData({
      title: deal.title,
      value: deal.value?.toString() || "",
      value_max: (deal as any).value_max?.toString() || "",
      stage_id: deal.deal_stages?.id || stages[0]?.id || "",
      lead_id: deal.lead_id || "",
      client_id: deal.client_id || "",
      probability: deal.probability?.toString() || "50",
      description: deal.description || "",
      expected_close_date: deal.expected_close_date || "",
      lost_reason: deal.lost_reason || "",
    });
    
    // Set selected entity for display and entity type
    if (deal.lead_id) {
      setEntityType('lead');
      const name = deal.entity_name || `Lead #${deal.lead_id.slice(0, 8)}`;
      setSelectedEntity({ type: 'lead', id: deal.lead_id, name, email: deal.entity_email || undefined, phone: deal.entity_phone || undefined, entityId: deal.entity_id || undefined });
    } else if (deal.client_id) {
      setEntityType('client');
      const name = deal.entity_name || `Cliente #${deal.client_id.slice(0, 8)}`;
      setSelectedEntity({ type: 'client', id: deal.client_id, name, email: deal.entity_email || undefined, phone: deal.entity_phone || undefined, entityId: deal.entity_id || undefined });
    } else if (deal.contact_id && deal.entity_id && deal.entity_name) {
      // Deal has a modern contact FK but no lead/client — use the actual contact id
      setEntityType('contact');
      setSelectedEntity({ type: 'contact', id: deal.contact_id, name: deal.entity_name, email: deal.entity_email || undefined, phone: deal.entity_phone || undefined, entityId: deal.entity_id });
    } else {
      setEntityType('lead');
      setSelectedEntity(null);
    }
    
    // Load existing line items for this deal
    (async () => {
      try {
        const { data: needs } = await (supabase as any)
          .from("deal_needs")
          .select("id")
          .eq("deal_id", deal.id)
          .limit(1)
          .maybeSingle();
        
        if (needs?.id) {
          const { data: items } = await (supabase as any)
            .from("deal_need_items")
            .select("id, item_type, product_id, service_id, quantity, notes, sort_order, unit_price")
            .eq("deal_need_id", needs.id)
            .order("sort_order", { ascending: true });
          
          if (items && items.length > 0) {
            // Resolve product/service names
            const productIds = items.filter((i: any) => i.product_id).map((i: any) => i.product_id);
            const serviceIds = items.filter((i: any) => i.service_id).map((i: any) => i.service_id);
            
            let productMap: Record<string, { name: string; price: number }> = {};
            let serviceMap: Record<string, { name: string; price: number }> = {};
            
            if (productIds.length > 0) {
              const { data: products } = await supabase.from("products").select("id, name, base_price").in("id", productIds);
              products?.forEach((p: any) => { productMap[p.id] = { name: p.name, price: p.base_price || 0 }; });
            }
            if (serviceIds.length > 0) {
              const { data: services } = await supabase.from("services").select("id, name, base_price").in("id", serviceIds);
              services?.forEach((s: any) => { serviceMap[s.id] = { name: s.name, price: s.base_price || 0 }; });
            }
            
            const lineItems: CatalogLineItem[] = items.map((item: any) => ({
              id: item.id,
              type: item.item_type as "product" | "service",
              product_id: item.product_id || undefined,
              service_id: item.service_id || undefined,
              name: item.item_type === "product" 
                ? (productMap[item.product_id]?.name || item.notes || "Produto") 
                : (serviceMap[item.service_id]?.name || item.notes || "Serviço"),
              quantity: Number(item.quantity) || 1,
              unit_price: Number(item.unit_price) || (item.item_type === "product"
                ? (productMap[item.product_id]?.price || 0)
                : (serviceMap[item.service_id]?.price || 0)),
            }));
            
            setDealLineItems(lineItems);
          }
        }
      } catch (err) {
        console.error("Error loading deal items:", err);
      }
    })();
    
    setOpen(true);
  };

  const handleViewDetails = (deal: Deal) => {
    setDetailDeal(deal);
    setShowDetails(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;

    try {
      const { error } = await (supabase as any).rpc("soft_delete_business_entity", { p_kind: "deal", p_id: deletingId });

      if (error) throw error;

      toast({
        title: t('deals.toast.deleteSuccess'),
        description: t('deals.toast.deleteSuccessDesc'),
      });

      loadData();
    } catch (error: any) {
      toast({
        title: t('deals.toast.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (deal: Deal) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("deals").insert({
        title: `${deal.title} (cópia)`,
        value: deal.value,
        probability: deal.probability,
        description: deal.description,
        stage_id: stages[0]?.id || deal.deal_stages?.id,
        lead_id: deal.lead_id,
        client_id: deal.client_id,
        entity_id: deal.entity_id,
        organization_id: deal.organization_id,
        expected_close_date: deal.expected_close_date,
        created_by: businessUserId,
        assigned_to: deal.assigned_to,
      } as any);

      if (error) throw error;

      toast({ title: "Pedido duplicado", description: "Uma cópia foi criada com sucesso." });
      loadData();
    } catch (error: any) {
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    }
  };

  const getDaysOpen = (createdAt: string) => {
    return differenceInDays(new Date(), parseISO(createdAt));
  };

  const getSourceLabel = (source: string | null | undefined) => {
    if (!source) return 'Manual';
    const map: Record<string, string> = {
      'form': 'Formulário',
      'formulario': 'Formulário',
      'manual': 'Manual',
      'campanha': 'Campanha',
      'campaign': 'Campanha',
      'api': 'API',
      'website': 'Website',
      'referral': 'Referência',
    };
    return map[source.toLowerCase()] || source;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;

    // Validate that either lead, client, or contact is selected
    if (!formData.lead_id && !formData.client_id && !selectedEntity?.entityId) {
      setFieldErrors({ entity: t('deals.form.leadOrClientRequired') || 'Selecione uma lead, contacto ou cliente' });
      toast({
        title: t('deals.toast.validationError'),
        description: t('deals.form.leadOrClientRequired') || 'Selecione uma lead, contacto ou cliente',
        variant: "destructive",
      });
      return;
    }

    const value = parseFloat(formData.value) || 0;
    const probability = parseInt(formData.probability);

    const validation = dealSchema.safeParse({
      title: formData.title,
      description: formData.description,
      value,
      probability,
      expected_close_date: formData.expected_close_date,
    });

    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) {
          errors[error.path[0].toString()] = error.message;
        }
      });
      setFieldErrors(errors);
      
      const firstError = validation.error.errors[0];
      toast({
        title: t('deals.toast.validationError'),
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    submitLockRef.current = true;
    setSavingDeal(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const authUserId = user.id;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" });
        return;
      }
      let resolvedClientId: string | null = null;
      let resolvedContactId: string | null = null;

      if (selectedEntity) {
        if (selectedEntity.type === 'contact') {
          const candidateContactId = selectedEntity.id || null;
          if (candidateContactId) {
            const { data: directContact } = await (supabase as any)
              .from("anew_contacts")
              .select("id")
              .eq("id", candidateContactId)
              .maybeSingle();
            resolvedContactId = directContact?.id || null;
          }
          if (!resolvedContactId && selectedEntity.entityId) {
            const { data: entityContact } = await (supabase as any)
              .from("anew_contacts")
              .select("id")
              .eq("entity_id", selectedEntity.entityId)
              .eq("organization_id", activeCompany?.id || "")
              .maybeSingle();
            resolvedContactId = entityContact?.id || null;
          }
        }

        if (selectedEntity.type === 'client') {
          const candidateClientId = selectedEntity.id || null;
          if (candidateClientId) {
            const { data: directClient } = await (supabase as any)
              .from("anew_clients")
              .select("id")
              .eq("id", candidateClientId)
              .maybeSingle();
            resolvedClientId = directClient?.id || null;
          }
          if (!resolvedClientId && selectedEntity.entityId) {
            const { data: entityClient } = await (supabase as any)
              .from("anew_clients")
              .select("id")
              .eq("entity_id", selectedEntity.entityId)
              .eq("organization_id", activeCompany?.id || "")
              .maybeSingle();
            resolvedClientId = entityClient?.id || null;
          }
        }
      }

      if (editingId) {
        const { data: existingDeal } = await (supabase.from("deals") as any)
          .select("contact_id, client_id")
          .eq("id", editingId)
          .maybeSingle();

        if (!resolvedContactId && existingDeal?.contact_id) {
          resolvedContactId = existingDeal.contact_id;
        }
        if (!resolvedClientId && existingDeal?.client_id) {
          resolvedClientId = existingDeal.client_id;
        }
      }

      const dealData = {
        title: formData.title,
        value,
        stage_id: formData.stage_id,
        organization_id: activeCompany?.id || null,
        root_organization_id: resolvedRootOrgId || activeCompany?.id || null,
        lead_id: formData.lead_id || null,
        client_id: resolvedClientId,
        contact_id: resolvedContactId,
        entity_id: selectedEntity?.entityId || null,
        probability,
        description: formData.description || null,
        expected_close_date: formData.expected_close_date || null,
        lost_reason: isDisqualifiedStage() ? (formData.lost_reason || null) : null,
      };

      if (editingId) {
        const { error } = await (supabase.from("deals") as any)
          .update(dealData)
          .eq("id", editingId);

        if (error) throw error;

        if (originalStageId && formData.stage_id !== originalStageId) {
          try {
            await supabase.functions.invoke('execute-workflow', {
              body: {
                source_entity: 'deal',
                entity_id: editingId,
                new_stage_id: formData.stage_id,
                old_stage_id: originalStageId,
                organization_id: activeCompany?.id,
                triggered_by: authUserId,
              },
            });
          } catch (wfError) {
            console.error("Workflow execution error:", wfError);
          }
        }

        try {
          const { data: existingNeed } = await (supabase as any)
            .from("deal_needs")
            .select("id")
            .eq("deal_id", editingId)
            .limit(1)
            .maybeSingle();

          if (dealLineItems.length > 0) {
            let needId = existingNeed?.id;
            
            if (needId) {
              await (supabase as any).from("deal_need_items").delete().eq("deal_need_id", needId);
            } else {
              const { data: newNeed } = await (supabase as any).from("deal_needs").insert({
                deal_id: editingId,
                title: formData.title || "Itens do pedido",
                status: "pending",
                created_by: businessUserId,
                sort_order: 0,
              }).select("id").single();
              needId = newNeed?.id;
            }

            if (needId) {
              const needItems = dealLineItems.map((item, idx) => ({
                deal_need_id: needId,
                item_type: item.type,
                product_id: item.product_id || null,
                service_id: item.service_id || null,
                quantity: item.quantity,
                unit_price: item.unit_price || 0,
                notes: item.name,
                sort_order: idx,
              }));
              await (supabase as any).from("deal_need_items").insert(needItems);
            }
          } else if (existingNeed?.id) {
            await (supabase as any).from("deal_need_items").delete().eq("deal_need_id", existingNeed.id);
            await (supabase as any).from("deal_needs").delete().eq("id", existingNeed.id);
          }
        } catch (itemErr) {
          console.error("Error syncing deal items on update:", itemErr);
        }

        toast({ title: t('deals.toast.updateSuccess') });
      } else {
        const recentDuplicateWindow = new Date(Date.now() - 30_000).toISOString();
        let recentDuplicateQuery = (supabase.from("deals") as any)
          .select("id")
          .eq("organization_id", activeCompany?.id || "")
          .eq("created_by", businessUserId)
          .eq("title", formData.title)
          .eq("value", value)
          .gte("created_at", recentDuplicateWindow)
          .order("created_at", { ascending: false })
          .limit(1);

        if (formData.lead_id) {
          recentDuplicateQuery = recentDuplicateQuery.eq("lead_id", formData.lead_id);
        } else {
          recentDuplicateQuery = recentDuplicateQuery.is("lead_id", null);
        }

        if (selectedEntity?.entityId) {
          recentDuplicateQuery = recentDuplicateQuery.eq("entity_id", selectedEntity.entityId);
        }

        const { data: recentDuplicateDeal } = await recentDuplicateQuery.maybeSingle();

        if (recentDuplicateDeal?.id) {
          toast({ title: "Pedido já estava a ser criado" });
          setOpen(false);
          resetForm();
          loadData();
          return;
        }

        const insertData = {
          ...dealData,
          created_by: businessUserId,
          assigned_to: businessUserId,
        };
        const { data: newDeal, error } = await (supabase.from("deals") as any).insert(insertData).select("id").single();

        if (error) throw error;

        if (formData.lead_id) {
          // Check current lead state before updating — don't overwrite already-converted leads
          const { data: currentLead } = await (supabase.from("anew_leads") as any)
            .select("status, converted_to_contact_id, client_id")
            .eq("id", formData.lead_id)
            .single();

          const isAlreadyConverted = currentLead && (
            currentLead.status === "converted" ||
            currentLead.converted_to_contact_id != null ||
            currentLead.client_id != null
          );

          const { data: propostaStage } = await supabase
            .from("lead_workflow_stages")
            .select("id")
            .eq("name", "proposta")
            .or(`organization_id.eq.${activeCompany?.id},organization_id.is.null`)
            .order("organization_id", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          if (!isAlreadyConverted) {
            const leadUpdate: Record<string, any> = { status: "qualified" };
            if (propostaStage?.id) {
              leadUpdate.workflow_stage_id = propostaStage.id;
            }

            await (supabase.from("anew_leads") as any)
              .update(leadUpdate)
              .eq("id", formData.lead_id);
          }

          // NOTE: We intentionally do NOT call execute-workflow for the lead here.
          // The deal was already created above, so the workflow's auto "create_deal_from_lead"
          // action would race and create a duplicate. The lead stage is already updated.
        }

        if (newDeal?.id) {
          try {
            const linkData: Record<string, any> = {
              deal_id: newDeal.id,
              organization_id: activeCompany?.id || dealData.organization_id,
              root_organization_id: resolvedRootOrgId || activeCompany?.id || dealData.organization_id,
              status: "active",
            };
            if (formData.lead_id) {
              const { data: existingLink } = await (supabase.from("pipeline_links") as any)
                .select("id")
                .eq("lead_id", formData.lead_id)
                .eq("status", "active")
                .maybeSingle();
              if (existingLink) {
                await (supabase.from("pipeline_links") as any)
                  .update({ deal_id: newDeal.id, updated_at: new Date().toISOString() })
                  .eq("id", existingLink.id);
              } else {
                linkData.lead_id = formData.lead_id;
                await (supabase.from("pipeline_links") as any).insert(linkData);
              }
            } else {
              await (supabase.from("pipeline_links") as any).insert(linkData);
            }
          } catch (linkErr) {
            console.error("Pipeline link creation error:", linkErr);
          }
        }

        // Insert deal line items BEFORE workflow so quote creation can copy them
        if (newDeal?.id && dealLineItems.length > 0) {
          try {
            const { data: dealNeed } = await (supabase as any).from("deal_needs").insert({
              deal_id: newDeal.id,
              title: formData.title || "Itens do pedido",
              status: "pending",
              created_by: businessUserId,
              sort_order: 0,
            }).select("id").single();

            if (dealNeed?.id) {
              const needItems = dealLineItems.map((item, idx) => ({
                deal_need_id: dealNeed.id,
                item_type: item.type,
                product_id: item.product_id || null,
                service_id: item.service_id || null,
                quantity: item.quantity,
                unit_price: item.unit_price || 0,
                notes: item.name,
                sort_order: idx,
              }));
              await (supabase as any).from("deal_need_items").insert(needItems);
            }
          } catch (itemErr) {
            console.error("Error saving deal items:", itemErr);
          }
        }

        // Execute workflow AFTER items are saved so auto-created quotes get the line items
        if (newDeal?.id && formData.stage_id) {
          try {
            await supabase.functions.invoke('execute-workflow', {
              body: {
                source_entity: 'deal',
                entity_id: newDeal.id,
                new_stage_id: formData.stage_id,
                organization_id: activeCompany?.id,
                triggered_by: authUserId,
              },
            });
          } catch (wfError) {
            console.error("Workflow execution on create error:", wfError);
          }
        }

        toast({ title: t('deals.toast.createSuccess') });
      }

      setOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({
        title: editingId ? t('deals.toast.updateError') : t('deals.toast.createError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSavingDeal(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setOriginalStageId(null);
    setFormData({
      title: "",
      value: "",
      value_max: "",
      stage_id: stages[0]?.id || "",
      lead_id: "",
      client_id: "",
      probability: "50",
      description: "",
      expected_close_date: "",
      lost_reason: "",
    });
    setEntityType('lead');
    setSelectedEntity(null);
    setEntitySearch("");
    setSearchResults([]);
    setFieldErrors({});
    setDealLineItems([]);
  };




  const getStageBadge = (stage: DealStageRel | null) => {
    if (!stage) return <Badge variant="outline">-</Badge>;
    
    return (
      <Badge 
        style={{ 
          backgroundColor: stage.color + '20', 
          color: stage.color,
          borderColor: stage.color 
        }}
      >
        {getDealStageLabel(stage, t)}
      </Badge>
    );
  };

  const formatCurrency = (value: number) => {
    const fixed = Math.abs(value).toFixed(2);
    const [int, dec] = fixed.split('.');
    return (value < 0 ? '-' : '') + '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const getLocale = () => {
    return language === 'pt' ? pt : undefined;
  };

  if (loading) {
    return (
      <>
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          <div className="flex-shrink-0 p-4 md:p-6 border-b bg-background">
            <h1 className="text-2xl md:text-3xl font-bold">{t('deals.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('deals.subtitle')}</p>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))}
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
        <div className="space-y-6 p-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('deals.title')}</h1><p className="text-muted-foreground">{t('deals.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      ) : (
      <>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex-shrink-0 p-4 md:p-6 border-b bg-background">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{t('deals.title')}</h1>
              <p className="text-muted-foreground text-sm">{t('deals.subtitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PageFAQSheet pageKey="acquisition.deals" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                {t('common.refresh')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWorkflowConfig(true)}
              >
                <Zap className="h-4 w-4 mr-2" />
                Workflow
              </Button>
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('deals.filters') || 'Filtros'}
                {hasActiveFilters && (
                  <span className="ml-2 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs">!</span>
                )}
              </Button>
              <Dialog open={open} onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) resetForm();
              }}>
                <PermissionGate permission="deals.create">
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('deals.newDeal')}
                    </Button>
                  </DialogTrigger>
                </PermissionGate>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingId ? t('deals.editDeal') : t('deals.newDeal')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="title">{t('deals.form.title')} *</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          required
                          className={fieldErrors.title ? "border-destructive" : ""}
                        />
                        {fieldErrors.title && (
                          <p className="text-sm text-destructive">{fieldErrors.title}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="value">{t('deals.form.estimatedValue') || 'Valor Estimado (€)'}</Label>
                        <Input
                          id="value"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.value}
                          onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="value_max">{t('deals.form.maxValue') || 'Valor Máximo (€)'}</Label>
                        <Input
                          id="value_max"
                          type="number"
                          step="0.01"
                          placeholder="Opcional"
                          value={formData.value_max}
                          onChange={(e) => setFormData({ ...formData, value_max: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="probability">{t('deals.form.probability')}</Label>
                        <Input
                          id="probability"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.probability}
                          onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="stage_id">{t('deals.form.stage') || 'Fase'}</Label>
                        <Select value={formData.stage_id} onValueChange={(val) => setFormData({ ...formData, stage_id: val })}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('deals.form.selectStage') || 'Selecionar fase'} />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {getDealStageLabel(stage, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expected_close_date">{t('deals.form.expectedClose')}</Label>
                        <Input
                          id="expected_close_date"
                          type="date"
                          value={formData.expected_close_date}
                          onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                        />
                      </div>
                      {/* Lead / Client / Contact selection */}
                      <div className="col-span-2 space-y-2">
                        <Label>{t('deals.form.leadOrClient')} <span className="text-destructive">*</span></Label>
                        <EntitySearchInput
                          value={selectedEntity ? {
                            type: selectedEntity.type as "lead" | "client" | "contact",
                            id: selectedEntity.id,
                            name: selectedEntity.name,
                            email: selectedEntity.email,
                            phone: selectedEntity.phone,
                          } : null}
                          onChange={(entity) => {
                            if (entity) {
                              setSelectedEntity({ type: entity.type, id: entity.id, name: entity.name, email: entity.email, phone: entity.phone, entityId: entity.entityId });
                              setEntityType(entity.type);
                              // Contacts are treated as leads for deals (use entity_id to resolve the lead)
                              if (entity.type === 'contact' && entity.entityId) {
                                // Find the lead linked to the same entity
                                (supabase.from("anew_leads") as any).select("id").eq("entity_id", entity.entityId).eq("organization_id", activeCompany?.id || "").maybeSingle().then(({ data: linkedLead }: any) => {
                                  if (linkedLead) {
                                    setFormData(prev => ({ ...prev, lead_id: linkedLead.id, client_id: "" }));
                                  } else {
                                    // No lead found — check if client exists for this entity
                                    (supabase as any).from("anew_clients").select("id").eq("entity_id", entity.entityId).eq("organization_id", activeCompany?.id || "").maybeSingle().then(({ data: linkedClient }: any) => {
                                      if (linkedClient) {
                                        setFormData(prev => ({ ...prev, lead_id: "", client_id: linkedClient.id }));
                                      } else {
                                        // No lead or client found — use entity_id only
                                        setFormData(prev => ({ ...prev, lead_id: "", client_id: "" }));
                                      }
                                    });
                                  }
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  lead_id: entity.type === 'lead' ? entity.id : "",
                                  client_id: entity.type === 'client' ? entity.id : "",
                                });
                              }
                            } else {
                              setSelectedEntity(null);
                              setFormData({ ...formData, lead_id: "", client_id: "" });
                            }
                            setFieldErrors(prev => ({ ...prev, entity: "" }));
                          }}
                          error={fieldErrors.entity}
                          searchTypes={["lead", "client", "contact"]}
                        />
                      </div>

                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="description">{t('deals.form.description')}</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      {isDisqualifiedStage() && (
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="lost_reason">Motivo da Desqualificação *</Label>
                          <Textarea
                            id="lost_reason"
                            value={formData.lost_reason}
                            onChange={(e) => setFormData({ ...formData, lost_reason: e.target.value })}
                            rows={2}
                            placeholder="Indique o motivo da desqualificação..."
                            required
                            className={!formData.lost_reason ? "border-destructive/50" : ""}
                          />
                          <p className="text-xs text-muted-foreground">Obrigatório para pedidos desqualificados</p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={savingDeal}>
                        {t('deals.form.cancel')}
                      </Button>
                      <Button type="submit" disabled={savingDeal}>{editingId ? t('deals.form.update') : t('deals.form.create')}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'lista' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setViewMode('lista')}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Lista
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setViewMode('kanban')}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'dashboard' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setViewMode('dashboard')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Dashboard
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>● Total: <strong className="text-foreground">{(dealsDashboardStats?.total ?? stats.total)}</strong></span>
            <span>● Abertos: <strong className="text-primary">{(dealsDashboardStats?.openCount ?? stats.openCount)}</strong></span>
            <span>● Ganhos: <strong className="text-emerald-600">{(dealsDashboardStats?.wonCount ?? stats.wonCount)}</strong></span>
            <span className="font-semibold text-foreground">{formatCurrency(dealsDashboardStats?.totalValue ?? stats.totalValue)} em pipeline</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="flex-shrink-0 p-4 md:px-6">
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2">
              {/* Total card */}
              <Card 
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md min-w-[130px] flex-shrink-0",
                  stageFilter === "all" && "ring-2 ring-primary"
                )}
                onClick={() => setStageFilter("all")}
              >
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Pedidos</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <span className="text-2xl font-bold">{dealsDashboardStats?.total ?? stats.total}</span>
                  <p className="text-xs text-muted-foreground mt-1">{formatCurrency(dealsDashboardStats?.totalValue ?? stats.totalValue)} no pipeline</p>
                </CardContent>
              </Card>
              
              {/* Dynamic cards for each deal pipeline stage */}
              {stages.map((stage) => (
                <Card 
                  key={stage.id} 
                  className={cn("cursor-pointer transition-all hover:shadow-md min-w-[120px] flex-shrink-0", stageFilter === stage.id && "ring-2 ring-primary")}
                  onClick={() => setStageFilter(stageFilter === stage.id ? "all" : stage.id)}
                >
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium uppercase tracking-wide" style={{ color: stage.color }}>{getDealStageLabel(stage, t)}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <span className="text-2xl font-bold" style={{ color: stage.color }}>{(dealsDashboardStats?.stageStats[stage.id] ?? stats.stageStats[stage.id]) || 0}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency((dealsDashboardStats?.stageValues[stage.id] ?? stats.stageValues[stage.id]) || 0)}
                      {((dealsDashboardStats?.stageValues[stage.id] ?? stats.stageValues[stage.id]) || 0) === 0 && ((dealsDashboardStats?.stageStats[stage.id] ?? stats.stageStats[stage.id]) || 0) > 0 && (
                        <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                      )}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {/* Conversion Rate */}
              <Card className="min-w-[130px] flex-shrink-0">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Taxa Conversão</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <span className="text-2xl font-bold text-emerald-600">{dealsDashboardStats?.conversionRate ?? stats.conversionRate}%</span>
                </CardContent>
              </Card>

              {/* Avg Close Time */}
              <Card className="min-w-[130px] flex-shrink-0">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tempo Médio Fecho</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <span className="text-2xl font-bold">{dealsDashboardStats?.avgCloseTimeDays ?? stats.avgCloseTimeDays} dias</span>
                </CardContent>
              </Card>

              {/* Stalled 30d+ */}
              <Card 
                className={cn(
                  "min-w-[130px] flex-shrink-0 cursor-pointer",
                  (dealsDashboardStats?.stalledCount ?? stats.stalledCount) > 0 && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
                )}
              >
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parados +30D</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <span className={cn("text-2xl font-bold", (dealsDashboardStats?.stalledCount ?? stats.stalledCount) > 0 ? "text-destructive" : "text-muted-foreground")}>{dealsDashboardStats?.stalledCount ?? stats.stalledCount}</span>
                  <p className="text-xs text-muted-foreground mt-1">{formatCurrency(dealsDashboardStats?.stalledValue ?? stats.stalledValue)} parados</p>
                </CardContent>
              </Card>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex-shrink-0 px-4 md:px-6 pb-4">
            <Card className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common.search')}</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('deals.searchPlaceholder') || 'Pesquisar pedidos de propostas...'}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                
                <div className="w-[180px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('deals.form.stage')}</label>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('deals.allStages') || 'Todas as fases'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('deals.allStages') || 'Todas as fases'}</SelectItem>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {getDealStageLabel(stage, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('deals.dateFrom') || 'Data desde'}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : t('deals.selectDate') || 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={getLocale()} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('deals.dateTo') || 'Data até'}</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : t('deals.selectDate') || 'Selecionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={getLocale()} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    {t('deals.clearFilters') || 'Limpar'}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 md:px-6">
            <BulkActionsBar
              selectedCount={selectedIds.size}
              onStatusClick={() => setBulkStatusDialogOpen(true)}
              onDeleteClick={() => setBulkDeleteDialogOpen(true)}
              onClearSelection={clearSelection}
              showOrgAction={false}
              statusPermission="deals.edit"
              deletePermission="deals.delete"
            />
          </div>
        )}

        {/* View Content */}
        {viewMode === 'kanban' ? (
          <div className="flex-1 overflow-hidden">
            <DealsKanbanView
              deals={filteredDeals as any}
              stages={stages}
              onStageDrop={handleKanbanStageDrop}
              onViewDetails={handleViewDetails as any}
              formatCurrency={formatCurrency}
            />
          </div>
        ) : viewMode === 'dashboard' ? (
          <div className="flex-1 overflow-hidden">
            <DealsDashboardView
              deals={dashboardDeals as any}
              stages={stages as any}
              formatCurrency={formatCurrency}
              isLoading={statsLoading}
              hasError={statsError}
            />
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="flex-1 px-4 md:px-6 pb-4 overflow-hidden">
              <Card className="h-full flex flex-col">
                <ScrollArea className="flex-1">
                  {deals.length === 0 && !loading ? (
                    <div className="p-8 text-center space-y-4">
                      <Target className="mx-auto h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        {hasActiveFilters ? t('deals.noResults') || 'Nenhum resultado encontrado' : t('deals.noDeals') || 'Ainda não há pedidos de propostas'}
                      </p>
                      {!hasActiveFilters && (
                        <PermissionGate permission="deals.create">
                          <Button onClick={() => setOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('deals.createFirst') || 'Criar primeiro pedido de proposta'}
                          </Button>
                        </PermissionGate>
                      )}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={filteredDeals.length > 0 && selectedIds.size === filteredDeals.length}
                              onCheckedChange={() => toggleSelectAll(filteredDeals.map(d => d.id))}
                            />
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('title')}>
                            <div className="flex items-center">
                              {t('deals.columns.title') || 'Pedido'}
                              {getSortIcon('title')}
                            </div>
                          </TableHead>
                          <TableHead className="hidden md:table-cell">Contacto</TableHead>
                          <TableHead className="hidden lg:table-cell">Comercial</TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('value')}>
                            <div className="flex items-center">
                              {t('deals.columns.value') || 'Valor'}
                              {getSortIcon('value')}
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('stage')}>
                            <div className="flex items-center">
                              {t('deals.columns.stage') || 'Fase'}
                              {getSortIcon('stage')}
                            </div>
                          </TableHead>
                          <TableHead className="hidden sm:table-cell text-center">Dias</TableHead>
                          <TableHead className="hidden lg:table-cell">Origem</TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50 hidden sm:table-cell" onClick={() => handleSort('created_at')}>
                            <div className="flex items-center">
                              {t('deals.columns.date') || 'Data'}
                              {getSortIcon('created_at')}
                            </div>
                          </TableHead>
                          <TableHead className="w-[100px] text-right">{t('deals.columns.actions') || 'Ações'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDeals.map((deal) => {
                          const daysOpen = getDaysOpen(deal.created_at);
                          const isOverdue = daysOpen > 7;
                          const firstStageId = stages[0]?.id;
                          const isZeroValueAdvanced = deal.value === 0 && deal.deal_stages?.id !== firstStageId;
                          const isStalled = daysOpen > 30;
                          const isWon = isWonStage(deal.deal_stages);
                          const isLost = isLostStage(deal.deal_stages);

                          return (
                            <TableRow 
                              key={deal.id} 
                              className={cn(
                                "cursor-pointer hover:bg-muted/50",
                                selectedIds.has(deal.id) && "bg-muted/30",
                                isStalled && !isWon && !isLost && "bg-amber-50/50 dark:bg-amber-950/10",
                                isWon && "bg-emerald-50/50 dark:bg-emerald-950/10",
                                isZeroValueAdvanced && "bg-red-50/30 dark:bg-red-950/10"
                              )}
                              onClick={() => handleViewDetails(deal)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.has(deal.id)}
                                  onCheckedChange={() => toggleSelectOne(deal.id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-start gap-2">
                                  {/* Priority bar */}
                                  <div className={cn(
                                    "w-1 h-10 rounded-full flex-shrink-0",
                                    isWon ? "bg-emerald-500" : isLost ? "bg-destructive" : isStalled ? "bg-amber-500" : "bg-primary"
                                  )} />
                                  <div className="flex flex-col">
                                    <span className="font-medium truncate max-w-[200px]">{deal.title}</span>
                                    {isZeroValueAdvanced && (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                        Sem valor definido
                                      </span>
                                    )}
                                    {isStalled && !isWon && !isLost && (
                                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                        ⏰ Parado há {daysOpen} dias em {getDealStageLabel(deal.deal_stages, t)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <div className="flex flex-col gap-0.5">
                                  {deal.entity_name ? (
                                    <>
                                      <span className="text-sm font-medium truncate max-w-[160px]">{deal.entity_name}</span>
                                      <div className="flex items-center gap-2">
                                        {deal.entity_phone && (
                                          <a
                                            href={`tel:${deal.entity_phone}`}
                                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Phone className="w-3 h-3" />
                                            {deal.entity_phone}
                                          </a>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">— Sem contacto associado</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
                                  {deal.assigned_to_name || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium tabular-nums">
                                <span className={cn(deal.value === 0 && "text-destructive")}>
                                  {formatCurrency(deal.value)}
                                  {deal.value === 0 && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                                </span>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {getStageBadge(deal.deal_stages)}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-center">
                                <span className={cn(
                                  "text-sm tabular-nums font-medium",
                                  isStalled ? "text-destructive" : isOverdue ? "text-amber-600" : "text-muted-foreground"
                                )}>
                                  {daysOpen}d
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline" className="text-xs font-normal">
                                  {getSourceLabel(deal.lead_source)}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground text-sm tabular-nums">
                                {format(parseISO(deal.created_at), "dd/MM", { locale: getLocale() })}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-0.5">
                                  {deal.entity_phone && (
                                    <Button variant="ghost" size="icon" asChild title="Ligar" className="h-7 w-7">
                                      <a href={`tel:${deal.entity_phone}`}>
                                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                                      </a>
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" onClick={() => handleViewDetails(deal)} title="Ver ficha" className="h-7 w-7">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      <DropdownMenuLabel className="text-xs text-muted-foreground">Ações</DropdownMenuLabel>
                                      {canActOnDeal(deal, "deals.edit") && (
                                        <DropdownMenuItem onClick={() => handleEdit(deal)}>
                                          <Pencil className="w-3.5 h-3.5 mr-2" />
                                          Editar
                                        </DropdownMenuItem>
                                      )}
                                      {deal.entity_email && (
                                        <DropdownMenuItem asChild>
                                          <a href={`mailto:${deal.entity_email}`}>
                                            <Mail className="w-3.5 h-3.5 mr-2" />
                                            Enviar email
                                          </a>
                                        </DropdownMenuItem>
                                      )}
                                      {canActOnDeal(deal, "deals.create") && (
                                        <DropdownMenuItem onClick={() => handleDuplicate(deal)}>
                                          <Copy className="w-3.5 h-3.5 mr-2" />
                                          Duplicar
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      {canActOnDeal(deal, "deals.delete") && (
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteClick(deal.id)}>
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                                          Eliminar
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  
                  {/* Infinite scroll trigger */}
                  {hasMore && !loading && (
                    <div ref={loadMoreRef} className="p-4 text-center">
                      {loadingMore && (
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                
                {/* Footer with count */}
                <div className="flex-shrink-0 p-3 border-t bg-muted/30 text-sm text-muted-foreground">
                  {t('deals.showing') || 'A mostrar'} {filteredDeals.length} {t('deals.of') || 'de'} {totalCount} {t('deals.records') || 'registos'}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deals.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deals.delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {detailDeal?.title}
            </DialogTitle>
          </DialogHeader>
          
          {detailDeal && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6">
                {/* Main info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.columns.value')}</label>
                    <p className="text-xl font-bold">{formatCurrency(detailDeal.value)}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.columns.stage')}</label>
                    <div className="mt-1">{getStageBadge(detailDeal.deal_stages)}</div>
                  </div>
                </div>
                
                <Separator />
                
                {/* Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.columns.probability')}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${detailDeal.probability}%` }}
                        />
                      </div>
                      <span className="font-medium">{detailDeal.probability}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.form.expectedClose')}</label>
                    <p className="text-sm">
                      {detailDeal.expected_close_date 
                        ? format(parseISO(detailDeal.expected_close_date), "dd/MM/yyyy", { locale: getLocale() })
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.columns.company')}</label>
                    <p className="text-sm">{detailDeal.organization_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t('deals.form.leadOrClient')}</label>
                    <p className="text-sm">
                      {detailDeal.entity_name 
                        ? `${detailDeal.lead_id ? 'Lead' : 'Cliente'}: ${detailDeal.entity_name}`
                        : '-'
                      }
                    </p>
                  </div>
                </div>
                
                {detailDeal.description && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">{t('deals.form.description')}</label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{detailDeal.description}</p>
                    </div>
                  </>
                )}
                
                {detailDeal.lost_reason && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Motivo da Desqualificação</label>
                      <p className="text-sm mt-1 whitespace-pre-wrap text-destructive">{detailDeal.lost_reason}</p>
                    </div>
                  </>
                )}
                
                <Separator />

                {/* Levantamento de Necessidades */}
                <DealNeedsSection
                  dealId={detailDeal.id}
                  organizationId={detailDeal.organization_id}
                />

                <Separator />
                
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t('deals.columns.date')}</label>
                  <p className="text-sm">
                    {format(parseISO(detailDeal.created_at), "dd/MM/yyyy HH:mm", { locale: getLocale() })}
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}
          
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              {t('common.close')}
            </Button>
            {detailDeal && (
              canActOnDeal(detailDeal, "deals.edit") ? (
                <Button onClick={() => { handleEdit(detailDeal); setShowDetails(false); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {t('common.edit')}
                </Button>
              ) : null
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <BulkStatusDialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        selectedCount={selectedIds.size}
        status={bulkNewStatus}
        onStatusChange={setBulkNewStatus}
        onConfirm={handleBulkStageChange}
        processing={processing}
        statusOptions={stageStatusOptions}
      />

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        selectedCount={selectedIds.size}
        onConfirm={handleBulkDelete}
        processing={processing}
      />

      {/* Deal Workflow Config */}
      <DealWorkflowConfig
        open={showWorkflowConfig}
        onOpenChange={setShowWorkflowConfig}
        companyId={activeCompany?.id || null}
      />
      </>
      )}
    </>
  );
};

export default Deals;
