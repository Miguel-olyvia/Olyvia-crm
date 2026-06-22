import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Plus, FileText, Pencil, Trash2, Download, Filter, X, Search, 
  RefreshCw, Eye, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon,
  FileCheck, FileClock, FileX, Send, CheckCircle2, History, Clock,
  MessageCircle, Edit, LucideIcon, MoreHorizontal, Copy, Mail,
  Phone, RotateCcw, FileSignature, DollarSign, Percent,
  Timer, BarChart3, Coins, List, LayoutDashboard
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import { generateQuotePdfBlob } from "@/utils/generateQuotePdfBlob";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useCompany } from "@/contexts/CompanyContext";
import { useComercialUsers } from "@/hooks/useComercialUsers";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsTab } from "@/components/shared/DocumentsTab";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn, formatCurrency } from "@/lib/utils";
import { format, parseISO, startOfDay, endOfDay, isWithinInterval, differenceInDays, addDays } from "date-fns";
import { pt } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { QuoteSendHistory } from "@/components/quotes/QuoteSendHistory";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionsBar } from "@/components/BulkActionsBar";
import { useBulkActions } from "@/hooks/useBulkActions";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { usePipelineAutomation } from "@/hooks/usePipelineAutomation";
import { SendQuoteDialog } from "@/components/quotes/SendQuoteDialog";
import { QuotesWorkflowBar } from "@/components/quotes/QuotesWorkflowBar";
import { QuotesAlertBars } from "@/components/quotes/QuotesAlertBars";
import { useAlertSettings } from "@/hooks/useAlertSettings";
import { QuotesDashboardView } from "@/components/quotes/QuotesDashboardView";
import { QuotesMarginsView } from "@/components/quotes/QuotesMarginsView";
import { QuotesPipelineMini } from "@/components/quotes/QuotesPipelineMini";
import { resolveLineUnitCosts, resolveLineDetails, type LineResolution } from "@/utils/quoteCostResolver";
import { requestControlledExport } from "@/lib/exports/requestControlledExport";

interface Quote {
  id: string;
  quote_number: string | null;
  cliente_id: string | null;
  organization_id: string | null;
  root_organization_id: string | null;
  deal_id: string | null;
  obra_endereco: string | null;
  modelo_base: string;
  estado: string;
  created_at: string;
  created_by?: string | null;
  assigned_to?: string | null;
  updated_at?: string;
  validade_dias?: number | null;
  accepted_at?: string | null;
  observacoes?: string | null;
  desconto_global?: number | null;
  proposal_id?: string | null;
  title?: string | null;
  clients: { 
    id: string;
    entity_id?: string | null;
    client_addresses: Array<{
      street: string | null;
      number: string | null;
      postal_code: string | null;
      city: string | null;
      municipality: string | null;
      district: string | null;
      is_primary: boolean | null;
    }>;
  } | null;
  deals?: {
    id: string;
    title: string;
    entity_id?: string | null;
  } | null;
  proposals?: {
    id: string;
    title: string;
    stage_id?: string | null;
  } | null;
}

interface ProposalWorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  icon: string;
  stage_order: number;
  is_won: boolean;
  is_lost: boolean;
}

interface QuoteLinesAgg {
  quoteId: string;
  totalValue: number;
  totalWithIva: number;
  totalCost: number;
  hasCostData: boolean;
  margin: number;
  lineCount: number;
  sections: string[];
}

const getStageIcon = (iconName: string): LucideIcon => {
  const iconMap: Record<string, LucideIcon> = {
    'file-edit': Edit, 'send': Send, 'clock': Clock, 'message-circle': MessageCircle,
    'check-circle': CheckCircle2, 'x-circle': FileX, 'file-text': FileText, 'file-check': FileCheck,
  };
  return iconMap[iconName] || FileText;
};

interface QuoteLine {
  id: string;
  descricao_snapshot?: string;
  qt?: number;
  custo_material_unit?: number;
  custo_mao_obra_unit?: number;
  margem_percent?: number;
  iva_percent?: number;
  total_sem_iva?: number;
  seccao?: string | null;
}

type SortColumn = 'quote_number' | 'client' | 'estado' | 'created_at' | 'valor' | 'margem';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'lista' | 'dashboard' | 'margens';
const getNewQuoteDraftKey = (companyId?: string | null) => `olyvia:quote-builder:new:${companyId || "global"}`;

// Batched .in() helper — contorna o teto de 1000 linhas/resposta do PostgREST
async function fetchInBatches<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<T[]>,
  chunkSize = 200,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    out.push(...(await fetcher(ids.slice(i, i + chunkSize))));
  }
  return out;
}



export default function Quotes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [entityNamesMap, setEntityNamesMap] = useState<Record<string, string>>({});
  const [proposalStages, setProposalStages] = useState<ProposalWorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [builderInitialProposalId, setBuilderInitialProposalId] = useState<string | null>(null);
  const [builderInitialDealId, setBuilderInitialDealId] = useState<string | null>(null);
  
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null);
  const [detailLines, setDetailLines] = useState<QuoteLine[]>([]);
  const [detailLineCosts, setDetailLineCosts] = useState<Record<string, number>>({});
  const [detailLineDetails, setDetailLineDetails] = useState<Record<string, LineResolution>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('lista');
  const [linesAgg, setLinesAgg] = useState<Record<string, QuoteLinesAgg>>({});
  

  // Dashboard stats (independent from paginated data)
  const [dashboardStats, setDashboardStats] = useState<{
    total: number; rascunho: number; enviado: number; aceite: number; perdido: number; finalizado: number; rejeitado: number; outros: number;
    totalValue: number; avgValue: number; taxaAceitacao: number; avgAcceptTime: number;
    rascunhoValue: number; enviadoValue: number;
    aceiteValue: number; perdidoValue: number; finalizadoValue: number; rejeitadoValue: number; outrosValue: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  // Full quote list (id, estado, total, created_at, accepted_at, validade_dias, assigned_to)
  // used by the Dashboard view so it always reflects the real DB state — independent of
  // the paginated `quotes` list shown in the Lista view.
  const [allQuotesForDashboard, setAllQuotesForDashboard] = useState<Array<{
    id: string; estado: string; total: number | null; created_at: string;
    accepted_at: string | null; validade_dias: number | null; assigned_to: string | null;
  }>>([]);
  
  // Pagination
  const PAGE_SIZE = 20;
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentPageRef = useRef(0);
  const quoteDraftAutoOpenedRef = useRef(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [marginFilter, setMarginFilter] = useState<string>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [comercialFilter, setComercialFilter] = useState<string>("all");
  const [comercialNamesMap, setComercialNamesMap] = useState<Record<string, string>>({});
  // IDs of quotes that belong to the current user personally (creator OR
  // owner/assignee of the related deal/lead). Used by the "Só os meus" toggle
  // so the filter still works for TEAM-scope users.
  const [myQuoteIds, setMyQuoteIds] = useState<Set<string>>(new Set());
  
  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Dialog states
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyQuote, setHistoryQuote] = useState<Quote | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendQuote, setSendQuote] = useState<Quote | null>(null);
  const [lostReasonDialog, setLostReasonDialog] = useState<{ open: boolean; quoteId: string; reason: string } | null>(null);
  
  const { toast } = useToast();
  const { createContractFromQuote } = usePipelineAutomation();
  
  const { t, language } = useTranslation();
  const { hasPermission, loading: permissionsLoading, isSystemAdmin } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  const { activeCompany, userType: companyUserType, isLoading: companyLoading } = useCompany();
  const alertSettings = useAlertSettings();
  const { comercialUsers } = useComercialUsers(activeCompany?.id || null);
  const [isParentOrg, setIsParentOrg] = useState(false);
  const [resolvedRootOrgId, setResolvedRootOrgId] = useState<string | null>(null);

  // Resolve root organization id
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

        let current = activeCompany.id;
        while (parentMap.has(current)) {
          current = parentMap.get(current)!;
        }
        setResolvedRootOrgId(current);

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
      } catch (err) {
        console.error("Error resolving root org:", err);
        setResolvedRootOrgId(activeCompany.id);
      }
    };
    resolveRootOrg();
  }, [activeCompany?.id]);

  // Fetch dashboard stats via RPC (KPIs sempre correctos) + query separada para visualizacoes
  const fetchDashboardStats = useCallback(async () => {
    if (!activeCompany?.id) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      // KPIs via RPC — agrega no servidor independentemente do volume de registos
      const { data: kpiData, error: kpiError } = await supabase.rpc("get_quotes_kpi_stats", {
        p_org_id:        activeCompany.id,
        p_is_parent_org: isParentOrg,
        p_root_org_id:   isParentOrg ? activeCompany.id : null,
      });
      if (kpiError) throw kpiError;
      const kpi = kpiData as any;
      setDashboardStats({
        total:           kpi.total           ?? 0,
        rascunho:        kpi.rascunho        ?? 0,
        enviado:         kpi.enviado         ?? 0,
        aceite:          kpi.aceite          ?? 0,
        perdido:         kpi.perdido         ?? 0,
        finalizado:      kpi.finalizado      ?? 0,
        rejeitado:       kpi.rejeitado       ?? 0,
        outros:          kpi.outros          ?? 0,
        totalValue:      kpi.totalValue      ?? 0,
        rascunhoValue:   kpi.rascunhoValue   ?? 0,
        enviadoValue:    kpi.enviadoValue    ?? 0,
        aceiteValue:     kpi.aceiteValue     ?? 0,
        perdidoValue:    kpi.perdidoValue    ?? 0,
        finalizadoValue: kpi.finalizadoValue ?? 0,
        rejeitadoValue:  kpi.rejeitadoValue  ?? 0,
        outrosValue:     kpi.outrosValue     ?? 0,
        avgValue:        kpi.avgValue        ?? 0,
        taxaAceitacao:   kpi.taxaAceitacao   ?? 0,
        avgAcceptTime:   kpi.avgAcceptTime   ?? 0,
      });

      // Query separada com limite para graficos/visualizacoes no dashboard
      let vizQuery = supabase
        .from("quotes")
        .select("id, estado, total, created_at, accepted_at, validade_dias, assigned_to")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (isParentOrg) {
        vizQuery = vizQuery.eq("root_organization_id", activeCompany.id);
      } else {
        vizQuery = vizQuery.eq("organization_id", activeCompany.id);
      }
      const { data: vizData, error: vizError } = await vizQuery;
      if (vizError) throw vizError;
      setAllQuotesForDashboard((vizData || []).map((q: any) => ({
        id: q.id, estado: q.estado, total: q.total, created_at: q.created_at,
        accepted_at: q.accepted_at ?? null, validade_dias: q.validade_dias ?? null,
        assigned_to: q.assigned_to,
      })));
    } catch (err: any) {
      console.error("Error fetching dashboard stats:", err);
      setStatsError(err?.message ?? "Erro ao carregar estatísticas");
    } finally {
      setStatsLoading(false);
    }
  }, [activeCompany?.id, isParentOrg]);

  useEffect(() => {
    if (activeCompany?.id) fetchDashboardStats();
  }, [activeCompany?.id, fetchDashboardStats]);

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !hasPermission("quotes.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, navigate, activeCompany]);

  // Open builder automatically when navigated with ?new=1&proposal_id=...
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      const proposalId = searchParams.get("proposal_id");
      const dealId = searchParams.get("deal_id");
      setSelectedQuote(null);
      setBuilderInitialProposalId(proposalId);
      setBuilderInitialDealId(dealId);
      setShowBuilder(true);
      // Clear params so a refresh doesn't re-trigger
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      next.delete("proposal_id");
      next.delete("deal_id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Deep-link: ?open=<quoteId> opens the details dialog (used by Olyvia chat links)
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || !activeCompany?.id || detailQuote) return;
    let cancelled = false;
    (async () => {
      try {
        const found = quotes.find((q) => q.id === openId);
        if (found) {
          if (!cancelled) await handleViewDetails(found);
        } else {
          const { data } = await supabase
            .from("quotes")
            .select("*")
            .eq("id", openId)
            .eq("organization_id", activeCompany.id)
            .maybeSingle();
          if (!cancelled && data) await handleViewDetails(data as unknown as Quote);
          else if (!cancelled) toast({ title: "Orçamento não encontrado", description: "Pode não existir ou não tens permissão.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete("open");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeCompany?.id, quotes]);

  const fetchQuotes = useCallback(async (append = false) => {
    if (!activeCompany?.id) return;
    // Wait for scope to load — otherwise we'd query with NONE/OWNED defaults
    // and incorrectly hide team data for leaders like Rita.
    if (scopeLoading) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      currentPageRef.current = 0;
      fetchDashboardStats();
    }

    const from = currentPageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: { user } } = await supabase.auth.getUser();
    const viewScope = getPermissionScope("quotes.view");
    const isFullScope = viewScope === "ORG" || isSystemAdmin;

    if (!append) {
      let stagesQuery = supabase
        .from("proposal_workflow_stages")
        .select("*")
        .order("stage_order")
        .limit(100);
      if (activeCompany?.id) {
        stagesQuery = stagesQuery.eq("organization_id", activeCompany.id);
      }
      const { data: stagesData } = await stagesQuery;
      if (stagesData) setProposalStages(stagesData);
    }

    try {
      let quotesData: Quote[] = [];

      if (isFullScope) {
        let adminQuery = (supabase as any)
          .from("quotes")
          .select(`*, deals!deal_id (id, title, entity_id), proposals!proposal_id (id, title, stage_id)`)
          .is("deleted_at", null);

        if (isParentOrg) {
          adminQuery = adminQuery.eq("root_organization_id", activeCompany.id);
        } else {
          adminQuery = adminQuery.eq("organization_id", activeCompany.id);
        }

        const { data, error } = await adminQuery.order("created_at", { ascending: false }).range(from, to);
        if (error) throw error;
        quotesData = (data || []) as unknown as Quote[];

        if (!append) {
          let countQuery = supabase.from("quotes").select("*", { count: 'exact', head: true }).is("deleted_at", null);
          if (isParentOrg) {
            countQuery = countQuery.eq("root_organization_id", activeCompany.id);
          } else {
            countQuery = countQuery.eq("organization_id", activeCompany.id);
          }
          const { count } = await countQuery;
          setTotalCount(count || 0);
          setMyQuoteIds(new Set());
        }
        if (append) {
          setQuotes(prev => {
            const merged = [...prev, ...quotesData];
            return Array.from(new Map(merged.map((quote) => [quote.id, quote])).values());
          });
        } else {
          setQuotes(Array.from(new Map(quotesData.map((quote) => [quote.id, quote])).values()));
        }
        setHasMore(quotesData.length === PAGE_SIZE);
        currentPageRef.current += 1;
      } else if (user?.id) {
        // Build allowed business user IDs based on scope
        // (OWNED = self, TEAM = self + subordinates).
        const allowedUserIds = new Set<string>();
        if (scopeAnewUserId) allowedUserIds.add(scopeAnewUserId);
        if (viewScope === "TEAM" && teamMemberIds.length > 0) {
          teamMemberIds.forEach(id => allowedUserIds.add(id));
        }

        const allowedArr = Array.from(allowedUserIds);
        if (allowedArr.length === 0) {
          if (!append) {
            setQuotes([]);
            setTotalCount(0);
            setMyQuoteIds(new Set());
          }
          setHasMore(false);
          currentPageRef.current += 1;
        } else {
          // Resolve the set of quote ids visible to this user via
          // (a) quotes they created, (b) deals they own/are assigned to,
          // and (c) leads they own/are assigned to (via their deals).
          // URL-size safety: .in() ≤ 30 IDs; .or("a.in,b.in") ≤ 15 IDs
          // (60 UUIDs efetivos por URL).
          const resolveVisibleQuoteIds = async (userIds: string[]): Promise<Set<string>> => {
            const result = new Set<string>();

            // (a) quotes they created
            const directQuotes = await fetchInBatches(userIds, async (chunk) => {
              const { data, error } = await (supabase as any).from("quotes").select("id")
                .eq("organization_id", activeCompany.id).in("created_by", chunk);
              if (error) throw error;
              return (data as any[]) || [];
            }, 30);
            directQuotes.forEach((q: any) => result.add(q.id));

            // (b) deals they own/are assigned to
            const dealIds: string[] = [];
            const dealsRes = await fetchInBatches(userIds, async (chunk) => {
              const orFilter = `created_by.in.(${chunk.join(',')}),assigned_to.in.(${chunk.join(',')})`;
              const { data, error } = await (supabase as any).from("deals").select("id")
                .eq("organization_id", activeCompany.id).or(orFilter);
              if (error) throw error;
              return (data as any[]) || [];
            }, 15);
            dealsRes.forEach((d: any) => dealIds.push(d.id));

            // (c) leads they own/are assigned to
            const leadIdsArr: string[] = [];
            const leadsRes = await fetchInBatches(userIds, async (chunk) => {
              const orFilter = `created_by.in.(${chunk.join(',')}),assigned_to.in.(${chunk.join(',')})`;
              const { data, error } = await (supabase as any).from("anew_leads").select("id")
                .eq("organization_id", activeCompany.id).or(orFilter);
              if (error) throw error;
              return (data as any[]) || [];
            }, 15);
            leadsRes.forEach((l: any) => leadIdsArr.push(l.id));

            if (leadIdsArr.length > 0) {
              const dealsFromLeads = await fetchInBatches(leadIdsArr, async (chunk) => {
                const { data, error } = await (supabase as any).from("deals").select("id")
                  .eq("organization_id", activeCompany.id).in("lead_id", chunk);
                if (error) throw error;
                return (data as any[]) || [];
              }, 30);
              dealsFromLeads.forEach((d: any) => dealIds.push(d.id));
            }

            if (dealIds.length > 0) {
              const uniqueDealIds = Array.from(new Set(dealIds));
              const quotesViaDeals = await fetchInBatches(uniqueDealIds, async (chunk) => {
                const { data, error } = await (supabase as any).from("quotes").select("id")
                  .eq("organization_id", activeCompany.id).in("deal_id", chunk);
                if (error) throw error;
                return (data as any[]) || [];
              }, 30);
              quotesViaDeals.forEach((q: any) => result.add(q.id));
            }
            return result;
          };

          const visibleQuoteIds = await resolveVisibleQuoteIds(allowedArr);

          if (!append && scopeAnewUserId) {
            const mineSet = await resolveVisibleQuoteIds([scopeAnewUserId]);
            setMyQuoteIds(mineSet);
          }

          if (visibleQuoteIds.size === 0) {
            if (!append) {
              setQuotes([]);
              setTotalCount(0);
            }
            setHasMore(false);
            currentPageRef.current += 1;
          } else {
            const idsArr = Array.from(visibleQuoteIds);

            // 1) Fetch only id + created_at for ALL visible quotes (filtered
            //    by deleted_at), in chunks of 30, to compute true totalCount
            //    and page slice without exceeding URL size.
            const metaRowsRaw = await fetchInBatches(idsArr, async (chunk) => {
              const { data, error } = await (supabase as any)
                .from("quotes")
                .select("id, created_at")
                .eq("organization_id", activeCompany.id)
                .in("id", chunk)
                .is("deleted_at", null);
              if (error) throw error;
              return (data as any[]) || [];
            }, 30);

            // 2) Dedup by id (chunks shouldn't overlap, but defensive)
            const metaMap = new Map<string, { id: string; created_at: string }>();
            metaRowsRaw.forEach((r: any) => { metaMap.set(r.id, { id: r.id, created_at: r.created_at }); });
            const metaRows = Array.from(metaMap.values());

            // 3) Deterministic ordering: created_at desc, id desc
            metaRows.sort((a, b) => {
              const ta = a.created_at || '';
              const tb = b.created_at || '';
              if (tb < ta) return -1;
              if (tb > ta) return 1;
              return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
            });

            if (!append) setTotalCount(metaRows.length);

            const pageIds = metaRows.slice(from, to + 1).map(r => r.id);

            if (pageIds.length === 0) {
              if (!append) setQuotes([]);
              // append === true: keep existing list unchanged
              setHasMore(false);
              currentPageRef.current += 1;
            } else {
              const { data, error } = await (supabase as any)
                .from("quotes")
                .select(`*, deals!deal_id (id, title, entity_id), proposals!proposal_id (id, title, stage_id)`)
                .eq("organization_id", activeCompany.id)
                .in("id", pageIds)
                .is("deleted_at", null);
              if (error) throw error;
              const fetched = (data || []) as unknown as Quote[];

              // Reorder to match pageIds order
              const byId = new Map<string, Quote>();
              fetched.forEach(q => byId.set(q.id, q));
              quotesData = pageIds.map(id => byId.get(id)).filter(Boolean) as Quote[];

              if (append) {
                setQuotes(prev => {
                  const merged = [...prev, ...quotesData];
                  return Array.from(new Map(merged.map((quote) => [quote.id, quote])).values());
                });
              } else {
                setQuotes(Array.from(new Map(quotesData.map((quote) => [quote.id, quote])).values()));
              }
              setHasMore(from + PAGE_SIZE < metaRows.length);
              currentPageRef.current += 1;
            }
          }
        }
      }
    } catch (error: any) {
      toast({ title: t('quotes.toast.loadError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCompany?.id, toast, t, isSystemAdmin, companyUserType, getPermissionScope, scopeAnewUserId, teamMemberIds, scopeLoading, isParentOrg, fetchDashboardStats]);

  // Resolve entity names
  useEffect(() => {
    const resolveEntityNames = async () => {
      const entityIds = new Set<string>();
      quotes.forEach(q => {
        if ((q as any).entity_id) entityIds.add((q as any).entity_id);
        if (q.clients?.entity_id) entityIds.add(q.clients.entity_id);
        if ((q.deals as any)?.entity_id) entityIds.add((q.deals as any).entity_id);
      });
      if (entityIds.size === 0) return;
      
      const data = await fetchInBatches(Array.from(entityIds), async (chunk) => {
        const { data, error } = await (supabase as any)
          .from("anew_entities")
          .select("id, display_name")
          .in("id", chunk);
        if (error) throw error;
        return (data as any[]) || [];
      }, 30);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((e: any) => { map[e.id] = e.display_name; });
        setEntityNamesMap(prev => ({ ...prev, ...map }));
      }
    };
    resolveEntityNames();
  }, [quotes]);

  // Server-side search: the paginated list only loads PAGE_SIZE quotes, so
  // when the user types a search term we fetch matching quotes (by number,
  // entity name/email/phone, or related deal entity) and merge them into the
  // in-memory list so the existing client-side filter can find them.
  // RLS still scopes results to what the user is allowed to see.
  useEffect(() => {
    if (!activeCompany?.id) return;
    const term = searchTerm.trim();
    if (term.length < 2) return;
    const handle = setTimeout(async () => {
      try {
        const like = `%${term}%`;
        const [byName, byEmail, byPhone] = await Promise.all([
          supabase.from("anew_entities").select("id").ilike("display_name", like).limit(200),
          supabase.from("anew_entity_emails").select("entity_id").ilike("email", like).limit(200),
          supabase.from("anew_entity_phones").select("entity_id").ilike("phone_number", like).limit(200),
        ]);
        const entityIds = Array.from(new Set([
          ...((byName.data || []).map((e: any) => e.id)),
          ...((byEmail.data || []).map((e: any) => e.entity_id)),
          ...((byPhone.data || []).map((e: any) => e.entity_id)),
        ])).filter(Boolean) as string[];

        // dealIds via entityIds, batched ≤30
        let dealIds: string[] = [];
        if (entityIds.length) {
          const dealsData = await fetchInBatches(entityIds, async (chunk) => {
            const { data, error } = await (supabase as any)
              .from("deals").select("id")
              .eq("organization_id", activeCompany.id)
              .in("entity_id", chunk).limit(500);
            if (error) throw error;
            return (data as any[]) || [];
          }, 30);
          dealIds = Array.from(new Set(dealsData.map((d: any) => d.id)));
        }

        const baseQuery = () => {
          let q = (supabase as any)
            .from("quotes")
            .select(`*, deals!deal_id (id, title, entity_id), proposals!proposal_id (id, title, stage_id)`)
            .is("deleted_at", null)
            .limit(100);
          if (isParentOrg) q = q.eq("root_organization_id", activeCompany.id);
          else q = q.eq("organization_id", activeCompany.id);
          return q;
        };

        const merged = new Map<string, Quote>();

        // 1) by quote_number
        {
          const { data, error } = await baseQuery().ilike("quote_number", like);
          if (error) throw error;
          (data as any[] | null)?.forEach(d => merged.set(d.id, d as Quote));
        }

        // 2) by entity_id, chunked ≤30 (single field → .in)
        if (entityIds.length) {
          const entityResults = await fetchInBatches(entityIds, async (chunk) => {
            const { data, error } = await baseQuery().in("entity_id", chunk);
            if (error) throw error;
            return (data as any[]) || [];
          }, 30);
          entityResults.forEach(d => merged.set(d.id, d as Quote));
        }

        // 3) by deal_id, chunked ≤30 (single field → .in)
        if (dealIds.length) {
          const dealResults = await fetchInBatches(dealIds, async (chunk) => {
            const { data, error } = await baseQuery().in("deal_id", chunk);
            if (error) throw error;
            return (data as any[]) || [];
          }, 30);
          dealResults.forEach(d => merged.set(d.id, d as Quote));
        }

        if (merged.size > 0) {
          setQuotes(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            merged.forEach((d, id) => { if (!map.has(id)) map.set(id, d); });
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error("Quote server-side search error:", err);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [searchTerm, activeCompany?.id, isParentOrg]);

  // Resolve commercial (assigned_to) user names — covers both the paginated
  // `quotes` and the full `allQuotesForDashboard` so the Dashboard view always
  // shows real names instead of "Não atribuído".
  useEffect(() => {
    const resolveComercialNames = async () => {
      const ids = new Set<string>();
      quotes.forEach(q => { if (q.assigned_to) ids.add(q.assigned_to); });
      allQuotesForDashboard.forEach(q => { if (q.assigned_to) ids.add(q.assigned_to); });
      const missing = Array.from(ids).filter(id => !comercialNamesMap[id]);
      if (missing.length === 0) return;
      const data = await fetchInBatches(missing, async (chunk) => {
        const { data, error } = await supabase.from("anew_users").select("id, name").in("id", chunk);
        if (error) throw error;
        return (data as any[]) || [];
      }, 30);
      if (data.length) {
        setComercialNamesMap(prev => {
          const next = { ...prev };
          data.forEach((u: any) => { next[u.id] = u.name || "Utilizador"; });
          return next;
        });
      }
    };
    resolveComercialNames();
  }, [quotes, allQuotesForDashboard]);

  // Aggregate quote lines for all loaded quotes (for margin, cost, items columns).
  // Costs resolved in REAL-TIME via shared resolver (handles products, services,
  // bundles by id, and legacy bundles by name match).
  useEffect(() => {
    const fetchLinesAgg = async () => {
      if (quotes.length === 0) { setLinesAgg({}); return; }
      const ids = quotes.map(q => q.id);
      // chunkSize = 30 (CRÍTICO): worst case ~31 linhas/quote × 30 = 930 < teto 1000 do PostgREST
      const lines = await fetchInBatches(ids, async (chunk) => {
        const { data } = await supabase
          .from("quote_lines")
          .select("id, quote_id, qt, cost_price, custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent, total_sem_iva, total_com_iva, section_name, product_id, service_id, bundle_id, descricao_snapshot, selected_attributes")
          .in("quote_id", chunk)
          .limit(1000);
        return (data as any[]) || [];
      }, 30);

      const detailsMap = await resolveLineDetails((lines || []) as any);

      const agg: Record<string, QuoteLinesAgg> = {};
      (lines || []).forEach((line: any) => {
        if (!agg[line.quote_id]) {
          agg[line.quote_id] = { quoteId: line.quote_id, totalValue: 0, totalWithIva: 0, totalCost: 0, hasCostData: false, margin: 0, lineCount: 0, sections: [] };
        }
        const a = agg[line.quote_id];
        const qty = parseFloat(String(line.qt || 1));
        const base = parseFloat(String(line.total_sem_iva || 0));
        a.totalValue += base;

        // Recalcular IVA em tempo real a partir das taxas reais do catálogo
        const shares = detailsMap[line.id]?.vatRateShares;
        let ivaAmount = 0;
        if (shares && Object.keys(shares).length > 0) {
          for (const [rateStr, share] of Object.entries(shares)) {
            const rate = parseFloat(rateStr);
            ivaAmount += base * share * (rate / 100);
          }
        } else {
          const rate = parseFloat(String(line.iva_percent ?? 23));
          ivaAmount = base * (rate / 100);
        }
        a.totalWithIva += base + ivaAmount;

        const unitCost = detailsMap[line.id]?.unitCost || 0;
        if (unitCost > 0) {
          a.totalCost += unitCost * qty;
          a.hasCostData = true;
        }
        a.lineCount++;
        if (line.section_name && !a.sections.includes(line.section_name)) a.sections.push(line.section_name);
      });
      Object.values(agg).forEach(a => {
        a.margin = a.hasCostData && a.totalValue > 0 ? ((a.totalValue - a.totalCost) / a.totalValue) * 100 : 0;
      });
      setLinesAgg(agg);
    };
    fetchLinesAgg();
  }, [quotes]);

  useEffect(() => {
    if (activeCompany?.id) fetchQuotes();
  }, [activeCompany?.id, fetchQuotes]);

  // Limpa qualquer rascunho de novo orçamento ao entrar na página de listagem
  // (evita reabrir o Quote Builder automaticamente).
  useEffect(() => {
    if (!activeCompany?.id || typeof window === "undefined") return;
    try {
      localStorage.removeItem(getNewQuoteDraftKey(activeCompany.id));
    } catch {}
  }, [activeCompany?.id]);


  const loadMoreQuotes = useCallback(() => {
    if (!loadingMore && hasMore) fetchQuotes(true);
  }, [loadingMore, hasMore, fetchQuotes]);

  const { loadMoreRef } = useInfiniteScroll({ onLoadMore: loadMoreQuotes, hasMore, isLoading: loadingMore });

  const {
    selectedIds, toggleSelectOne, toggleSelectAll, clearSelection,
    bulkStatusDialogOpen, setBulkStatusDialogOpen, bulkDeleteDialogOpen, setBulkDeleteDialogOpen,
    bulkNewStatus, setBulkNewStatus, processing, setProcessing, handleBulkDelete
  } = useBulkActions({ tableName: "quotes", onSuccess: fetchQuotes });

  const getClientAddress = (quote: Quote) => {
    if (quote.clients?.client_addresses?.length) {
      const primaryAddress = quote.clients.client_addresses.find(addr => addr.is_primary) || quote.clients.client_addresses[0];
      const parts = [primaryAddress.street, primaryAddress.number, primaryAddress.postal_code, primaryAddress.city].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
    }
    return "—";
  };

  const getEntityId = (quote: Quote): string | undefined => {
    return (quote as any).entity_id || quote.clients?.entity_id || (quote.deals as any)?.entity_id;
  };

  const getClientName = (quote: Quote): { name: string; isClient: boolean } => {
    const entityId = getEntityId(quote);
    if (entityId && entityNamesMap[entityId]) return { name: entityNamesMap[entityId], isClient: true };
    if (quote.clients) return { name: `Cliente #${quote.clients.id.slice(0, 8)}`, isClient: true };
    const titleFallback = (quote.title || "").replace(/\s*\((Cópia|v\d+)\)\s*$/i, "").trim();
    if (titleFallback) return { name: titleFallback, isClient: false };
    return { name: t('quotes.noClient'), isClient: false };
  };

  const getClientNameString = (quote: Quote): string => getClientName(quote).name;

  // Enhanced stats
  const stats = useMemo(() => {
    const total = quotes.length;
    const rascunho = quotes.filter(q => q.estado === 'rascunho').length;
    const enviado = quotes.filter(q => q.estado === 'enviado').length;
    const aceite = quotes.filter(q => q.estado === 'aceite').length;
    const perdido = quotes.filter(q => q.estado === 'perdido').length;
    
    // Value stats
    const totalValue = Object.values(linesAgg).reduce((s, a) => s + a.totalValue, 0);
    const quotesWithCost = Object.values(linesAgg).filter(a => a.hasCostData);
    const totalCost = quotesWithCost.reduce((s, a) => s + a.totalCost, 0);
    const totalValueWithCost = quotesWithCost.reduce((s, a) => s + a.totalValue, 0);
    const avgMargin = totalValueWithCost > 0 ? ((totalValueWithCost - totalCost) / totalValueWithCost) * 100 : 0;
    const avgValue = total > 0 ? totalValue / total : 0;
    const taxaAceitacao = total > 0 ? Math.round((aceite / total) * 100) : 0;
    
    // Avg acceptance time
    const aceitedQuotes = quotes.filter(q => q.estado === 'aceite');
    const avgAcceptTime = aceitedQuotes.length > 0 
      ? Math.round(aceitedQuotes.reduce((s, q) => s + differenceInDays(new Date(), parseISO(q.created_at)), 0) / aceitedQuotes.length)
      : 0;
    
    return { total, rascunho, enviado, aceite, perdido, totalValue, totalCost, avgMargin, avgValue, taxaAceitacao, avgAcceptTime };
  }, [quotes, linesAgg]);

  // Check if any quote has actual cost data
  const canViewCosts = hasPermission("quotes.view_costs") || isSystemAdmin;
  const hasCostData = useMemo(() => {
    return canViewCosts && Object.values(linesAgg).some(a => a.hasCostData);
  }, [linesAgg, canViewCosts]);

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    let result = quotes.filter((quote) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const quoteNumber = quote.quote_number?.toLowerCase() || "";
        const clientName = getClientNameString(quote).toLowerCase();
        const location = getClientAddress(quote).toLowerCase();
        if (!quoteNumber.includes(search) && !clientName.includes(search) && !location.includes(search)) return false;
      }
      if (statusFilter !== "all" && quote.estado !== statusFilter) return false;
      if (dateFrom || dateTo) {
        const quoteDate = parseISO(quote.created_at);
        if (dateFrom && dateTo) {
          if (!isWithinInterval(quoteDate, { start: startOfDay(dateFrom), end: endOfDay(dateTo) })) return false;
        } else if (dateFrom && quoteDate < startOfDay(dateFrom)) return false;
        else if (dateTo && quoteDate > endOfDay(dateTo)) return false;
      }
      if (marginFilter !== "all") {
        const agg = linesAgg[quote.id];
        if (marginFilter === "high" && (!agg?.hasCostData || agg.margin < 30)) return false;
        if (marginFilter === "medium" && (!agg?.hasCostData || agg.margin < 15 || agg.margin >= 30)) return false;
        if (marginFilter === "low" && (!agg?.hasCostData || agg.margin >= 15)) return false;
      }
      if (onlyMine) {
        // For TEAM-scope users, "meus" includes quotes they created OR quotes
        // attached to deals/leads they own. myQuoteIds is precomputed in fetchQuotes.
        if (myQuoteIds.size > 0) {
          if (!myQuoteIds.has(quote.id)) return false;
        } else if (scopeAnewUserId && quote.created_by !== scopeAnewUserId) {
          return false;
        }
      }
      if (comercialFilter !== "all") {
        if (comercialFilter === "none") {
          if (quote.assigned_to) return false;
        } else if (quote.assigned_to !== comercialFilter) return false;
      }
      return true;
    });
    
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'quote_number': comparison = (a.quote_number || '').localeCompare(b.quote_number || ''); break;
        case 'client': comparison = getClientNameString(a).localeCompare(getClientNameString(b)); break;
        case 'estado': comparison = a.estado.localeCompare(b.estado); break;
        case 'valor': comparison = ((a as any).total || linesAgg[a.id]?.totalValue || 0) - ((b as any).total || linesAgg[b.id]?.totalValue || 0); break;
        case 'margem': comparison = (linesAgg[a.id]?.margin || 0) - (linesAgg[b.id]?.margin || 0); break;
        case 'created_at':
        default: comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    
    return result;
  }, [quotes, searchTerm, statusFilter, dateFrom, dateTo, sortColumn, sortDirection, linesAgg, marginFilter, onlyMine, scopeAnewUserId, myQuoteIds, comercialFilter]);

  const clearFilters = () => {
    setSearchTerm(""); setStatusFilter("all"); setDateFrom(undefined); setDateTo(undefined); setMarginFilter("all"); setOnlyMine(false); setComercialFilter("all");
  };

  const hasActiveFilters = searchTerm || statusFilter !== "all" || dateFrom || dateTo || marginFilter !== "all" || onlyMine || comercialFilter !== "all";

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column); setSortDirection('desc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const handleDelete = async () => {
    if (!deleteQuoteId) return;
    try {
      const { error } = await (supabase as any).rpc("soft_delete_business_entity", { p_kind: "quote", p_id: deleteQuoteId });
      if (error) throw error;
      toast({ title: t('quotes.toast.deleteSuccess'), description: t('quotes.toast.deleteDescription') });
      fetchQuotes();
    } catch (error: any) {
      toast({ title: t('quotes.toast.deleteError'), description: error.message, variant: "destructive" });
    } finally {
      setDeleteQuoteId(null);
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0 || !bulkNewStatus) return;
    setProcessing(true);
    try {
      const idsArr = Array.from(selectedIds);
      for (let i = 0; i < idsArr.length; i += 30) {
        const chunk = idsArr.slice(i, i + 30);
        const { error } = await supabase.from("quotes").update({ estado: bulkNewStatus }).in("id", chunk);
        if (error) throw error;
      }
      toast({ title: t('common.statusUpdated'), description: `${selectedIds.size} ${t('quotes.records')} ${t('common.updated')}.` });
      clearSelection(); setBulkStatusDialogOpen(false); fetchQuotes();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!activeCompany?.id) {
      toast({ title: t('quotes.toast.exportError'), description: "Selecione uma organização.", variant: "destructive" });
      return;
    }
    try {
      const includeSensitive =
        hasPermission("quotes.export_sensitive") &&
        window.confirm(
          "Pretende incluir a morada da obra? Esta exportação contém dados sensíveis e ficará registada na auditoria.",
        );
      const result = await requestControlledExport({
        module: "quotes",
        organizationId: activeCompany.id,
        includeSensitive,
        filters: {
          status: statusFilter !== "all" ? statusFilter : undefined,
          dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
          dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
        },
      });
      toast({
        title: t('quotes.toast.exportSuccess'),
        description: `${result.rowCount} orçamentos exportados em XLSX${result.includesSensitive ? " com campos sensíveis autorizados" : ""}.`,
      });
    } catch (error: any) {
      toast({ title: t('quotes.toast.exportError'), description: error.message, variant: "destructive" });
    }
  };

  const handleViewDetails = async (quote: Quote) => {
    setDetailQuote(quote);
    const { data: lines } = await supabase.from('quote_lines').select('*').eq('quote_id', quote.id).order('ordem');
    const linesArr = (lines as QuoteLine[]) || [];
    setDetailLines(linesArr);
    const details = await resolveLineDetails(linesArr as any);
    setDetailLineDetails(details);
    const costs: Record<string, number> = {};
    Object.keys(details).forEach((k) => { costs[k] = details[k].unitCost; });
    setDetailLineCosts(costs);
    setShowDetails(true);
  };

  const handleAcceptQuote = async (quote: Quote) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("quotes").update({ estado: 'aceite', accepted_at: new Date().toISOString() } as any).eq("id", quote.id);
    if (!error) {
      try {
        const { data: wfData, error: wfError } = await supabase.functions.invoke('execute-workflow', {
          body: { source_entity: 'quote', entity_id: quote.id, new_stage_id: 'aceite', old_stage_id: quote.estado, organization_id: activeCompany?.id || "", triggered_by: user.id },
        });
        console.log("[execute-workflow] quote aceite response:", JSON.stringify(wfData), wfError);
        if (wfError) {
          toast({ title: "Orçamento aceite", description: `Atenção: erro no workflow — ${wfError.message}`, variant: "destructive" });
        } else if (wfData && (wfData as any).stageActions === 0) {
          const logs = (wfData as any).logs as Array<{type: string; status: string; message: string}> | undefined;
          const errLog = logs?.find(l => l.status === "error");
          toast({ title: "Orçamento aceite", description: errLog ? `Proposta não criada: ${errLog.message}` : "Workflow executado mas sem ações (verifique configuração).", variant: "destructive" });
        } else {
          toast({ title: "Orçamento aceite", description: "Proposta criada automaticamente." });
        }
      } catch (wfErr: any) {
        console.error("Quote workflow error:", wfErr);
        toast({ title: "Orçamento aceite", description: `Erro no workflow: ${wfErr?.message || wfErr}`, variant: "destructive" });
      }
      fetchQuotes();
    }
  };

  const handleMarkAsLost = async (quoteId: string, reason: string) => {
    const { error } = await supabase.from("quotes").update({ estado: 'perdido', observacoes: reason } as any).eq("id", quoteId);
    if (!error) {
      toast({ title: "Orçamento marcado como perdido" });
      fetchQuotes();
    }
    setLostReasonDialog(null);
  };

  const handleDuplicateQuote = async (quote: Quote, applyDiscountPercent?: number) => {
    try {
      toast({ title: "A duplicar orçamento…" });
      const { data, error } = await supabase.functions.invoke('duplicate-quote', {
        body: {
          quote_id: quote.id,
          title_suffix: applyDiscountPercent && applyDiscountPercent > 0 ? " (v2)" : " (Cópia)",
          ...(applyDiscountPercent && applyDiscountPercent > 0 ? { apply_discount_percent: applyDiscountPercent } : {}),
        },
      });
      if (error) throw error;
      const newId = (data as any)?.id as string | undefined;
      toast({ title: "Orçamento duplicado", description: (data as any)?.quote_number ? `Novo nº ${(data as any).quote_number}` : undefined });
      await fetchQuotes();
      if (newId) {
        setSelectedQuote(newId);
        setShowBuilder(true);
      }
    } catch (e: any) {
      console.error("[duplicate-quote] error", e);
      toast({ title: "Erro ao duplicar", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const handleMarkAsSent = async (quoteId: string) => {
    const { error } = await supabase.from("quotes").update({ estado: 'enviado' }).eq("id", quoteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }

    // Register a manual send event so it shows up in the contact/client timeline & emails tab
    try {
      const quote = quotes.find(q => q.id === quoteId);
      const { data: { user } } = await supabase.auth.getUser();
      let senderAnewUserId: string | null = null;
      if (user) {
        const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
        senderAnewUserId = anewUser?.id ?? null;
      }
      // Resolve recipient via entity emails when available
      let recipientEmail = "—";
      let recipientName: string | null = null;
      const entityId: string | null = (quote as any)?.entity_id ?? null;
      if (entityId) {
        const { data: emailRow } = await supabase.from("anew_entity_emails").select("email").eq("entity_id", entityId).order("is_primary", { ascending: false }).limit(1).maybeSingle();
        if (emailRow?.email) recipientEmail = emailRow.email;
        const { data: ent } = await supabase.from("anew_entities").select("display_name").eq("id", entityId).maybeSingle();
        recipientName = ent?.display_name ?? null;
      }
      await (supabase as any).from("quote_sends").insert({
        quote_id: quoteId,
        organization_id: quote?.organization_id ?? null,
        sent_by: senderAnewUserId,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject: `Orçamento ${quote?.quote_number || quoteId.slice(0, 8)} (envio manual)`,
        message: "Marcado manualmente como enviado pelo utilizador.",
        status: "sent",
        channel: "manual",
        sent_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[handleMarkAsSent] failed to register manual send", e);
    }

    toast({ title: "Orçamento marcado como enviado" });
    fetchQuotes();
  };

  const handleGeneratePDF = async (quoteId: string) => {
    try {
      const { blob, fileName } = await generateQuotePdfBlob(quoteId);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: t('quotes.toast.pdfSuccess'), description: t('quotes.toast.pdfDescription') });
    } catch (error: any) {
      toast({ title: t('quotes.toast.pdfError'), description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { icon: React.ReactNode; color: string }> = {
      rascunho: { icon: <FileClock className="w-3 h-3 mr-1" />, color: "bg-muted text-muted-foreground" },
      enviado: { icon: <Send className="w-3 h-3 mr-1" />, color: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
      aceite: { icon: <CheckCircle2 className="w-3 h-3 mr-1" />, color: "bg-green-500/20 text-green-600 dark:text-green-400" },
      perdido: { icon: <FileX className="w-3 h-3 mr-1" />, color: "bg-destructive/20 text-destructive" },
    };
    const statusLabels: Record<string, string> = {
      rascunho: t('quotes.status.draft'), enviado: t('quotes.status.sent'),
      aceite: t('quotes.status.accepted'), perdido: t('quotes.status.lost'),
    };
    const cfg = config[status] || config.rascunho;
    return <Badge className={cn("flex items-center", cfg.color)}>{cfg.icon}{statusLabels[status] || status}</Badge>;
  };

  const getContextualSubtitle = (quote: Quote): string | null => {
    const daysOld = differenceInDays(new Date(), parseISO(quote.created_at));
    const agg = linesAgg[quote.id];
    
    if (quote.estado === 'rascunho' && daysOld > 2) return `Rascunho há ${daysOld} dias — enviar ao cliente?`;
    if (quote.estado === 'aceite' && quote.proposal_id) return "Aceite — proposta criada automaticamente";
    if (quote.estado === 'aceite') return "Aceite — a aguardar criação de proposta";
    if (quote.estado === 'enviado' && daysOld > 5) return `Enviado há ${daysOld} dias — sem resposta`;
    if (agg?.hasCostData && agg.margin < 15 && agg.totalValue > 0) return `⚠ Margem abaixo do target (${agg.margin.toFixed(0)}%)`;
    if (quote.estado === 'perdido') return `❌ Perdido`;
    return null;
  };

  const getRowColorClass = (quote: Quote): string => {
    if (quote.estado === 'aceite') return "bg-green-50/50 dark:bg-green-950/10";
    if (quote.estado === 'perdido') return "bg-red-50/50 dark:bg-red-950/10";
    if (quote.estado === 'rascunho') return "bg-muted/20";
    if (quote.estado === 'enviado' && differenceInDays(new Date(), parseISO(quote.created_at)) > 5) return "bg-amber-50/50 dark:bg-amber-950/10";
    return "";
  };

  const getLocale = () => {
    return language === 'pt' ? pt : undefined;
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

  if (!activeCompany?.id) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('quotes.title')}</h1><p className="text-muted-foreground">{t('quotes.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  if (showBuilder) {
    return (
      <QuoteBuilder
        quoteId={selectedQuote}
        initialProposalId={builderInitialProposalId}
        initialDealId={builderInitialDealId}
        onClose={() => {
          const returnProposalId = builderInitialProposalId;
          setShowBuilder(false);
          setSelectedQuote(null);
          setBuilderInitialProposalId(null);
          setBuilderInitialDealId(null);
          if (returnProposalId) {
            navigate(`/proposals?open=${returnProposalId}`);
            return;
          }
          fetchQuotes();
        }}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex-shrink-0 p-4 md:p-6 border-b bg-background">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{t('quotes.title')}</h1>
              <p className="text-muted-foreground text-sm">{t('quotes.subtitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PageFAQSheet pageKey="acquisition.quotes" />
              <Button variant="outline" size="sm" onClick={() => fetchQuotes()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                {t('common.refresh')}
              </Button>
              <Button variant={showFilters ? "secondary" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="h-4 w-4 mr-2" />
                {t('quotes.filters')}
                {hasActiveFilters && <span className="ml-2 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-xs">!</span>}
              </Button>
              <PermissionGate permission="quotes.export">
                <Button variant="outline" size="sm" onClick={handleExport} disabled={quotes.length === 0}>
                  <Download className="h-4 w-4 mr-2" />{t('quotes.export')}
                </Button>
              </PermissionGate>
              <PermissionGate permission="quotes.manage">
                <Button variant="outline" size="sm" onClick={() => navigate("/quote-templates")}>
                  <FileText className="h-4 w-4 mr-2" />Templates
                </Button>
              </PermissionGate>
              <PermissionGate permission="quotes.manage">
                <Button variant="outline" size="sm" onClick={() => navigate("/quote-models")}>
                  <FileText className="h-4 w-4 mr-2" />Modelos Rápidos
                </Button>
              </PermissionGate>
              <PermissionGate permission="quotes.create">
                <Button size="sm" onClick={() => { setSelectedQuote(null); setShowBuilder(true); }}>
                  <Plus className="h-4 w-4 mr-2" />{t('quotes.newQuote')}
                </Button>
              </PermissionGate>
            </div>
          </div>
        </div>

        {/* Workflow Bar */}
        <QuotesWorkflowBar />

        {/* Alert Bars */}
        <QuotesAlertBars
          quotes={quotes}
          linesAgg={linesAgg}
          onNavigateProposals={() => navigate("/proposals")}
          onOpenQuote={handleViewDetails}
          onViewLowMargin={canViewCosts ? () => setViewMode('margens') : undefined}
          showMarginAlerts={canViewCosts}
          staleDraftDays={alertSettings.get("quote_stale", 7).days_threshold}
          staleDraftEnabled={alertSettings.get("quote_stale", 7).is_active}
          pendingSentDays={alertSettings.get("quote_pending_sent", 5).days_threshold}
          pendingSentEnabled={alertSettings.get("quote_pending_sent", 5).is_active}
        />

        {/* View Toggle + Summary */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {([
              { key: 'lista', icon: List, label: 'Lista' },
              { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              ...(canViewCosts ? [{ key: 'margens', icon: Coins, label: 'Margens' }] : []),
            ] as const).map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                variant={viewMode === key ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setViewMode(key as ViewMode)}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </Button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground hidden md:flex items-center gap-2">
            Total: <strong>{(dashboardStats?.total ?? stats.total)}</strong> · Valor: <strong className="text-primary">{formatCurrency(dashboardStats?.totalValue ?? stats.totalValue)}</strong>{hasCostData && <> · Custo: <strong>{formatCurrency(stats.totalCost)}</strong> · Margem: <strong className={cn(stats.avgMargin >= 30 ? "text-green-600" : stats.avgMargin >= 15 ? "text-amber-600" : "text-red-600")}>{stats.avgMargin.toFixed(0)}%</strong></>}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="flex-shrink-0 p-4 md:px-6">
          <div className="flex flex-wrap gap-3">
            {(() => {
              const ds = dashboardStats;
              const s = stats;
              const cardData = [
                { key: "all", label: "TOTAL ORÇAMENTOS", count: ds?.total ?? s.total, subtitle: `${formatCurrency(ds?.totalValue ?? s.totalValue)} total`, icon: FileText, color: "text-primary" },
                { key: "rascunho", label: "RASCUNHO", count: ds?.rascunho ?? s.rascunho, subtitle: "A aguardar envio", icon: FileClock, color: "text-muted-foreground" },
                { key: "enviado", label: "ENVIADO", count: ds?.enviado ?? s.enviado, subtitle: "A aguardar resposta", icon: Send, color: "text-blue-500" },
                { key: "aceite", label: "ACEITE", count: ds?.aceite ?? s.aceite, subtitle: (ds?.aceite ?? s.aceite) > 0 ? `${formatCurrency(ds?.aceiteValue ?? 0)}` : formatCurrency(0), icon: CheckCircle2, color: "text-green-500", bgTint: (ds?.aceite ?? s.aceite) > 0 ? "bg-green-50/50 dark:bg-green-950/20" : "" },
                { key: "perdido", label: "PERDIDO", count: ds?.perdido ?? s.perdido, subtitle: (ds?.perdido ?? s.perdido) > 0 ? `${formatCurrency(ds?.perdidoValue ?? 0)}` : formatCurrency(0), icon: FileX, color: "text-red-500", bgTint: (ds?.perdido ?? s.perdido) > 0 ? "bg-red-50/50 dark:bg-red-950/20" : "" },
                ...((ds?.finalizado ?? 0) > 0 ? [{ key: "finalizado", label: "FINALIZADO", count: ds!.finalizado, subtitle: formatCurrency(ds!.finalizadoValue), icon: FileCheck, color: "text-green-600", bgTint: "bg-green-50/50 dark:bg-green-950/20" }] : []),
                ...((ds?.rejeitado ?? 0) > 0 ? [{ key: "rejeitado", label: "REJEITADO", count: ds!.rejeitado, subtitle: formatCurrency(ds!.rejeitadoValue), icon: FileX, color: "text-orange-500", bgTint: "bg-orange-50/50 dark:bg-orange-950/20" }] : []),
                ...((ds?.outros ?? 0) > 0 ? [{ key: "_outros", label: "OUTROS ESTADOS", count: ds!.outros, subtitle: formatCurrency(ds!.outrosValue), icon: FileText, color: "text-muted-foreground" }] : []),
                { key: "_avgValue", label: "VALOR MÉDIO", count: null, displayValue: formatCurrency(ds?.avgValue ?? s.avgValue), subtitle: "por orçamento", icon: DollarSign, color: "text-primary" },
                ...(hasCostData ? [{ key: "_avgMargin", label: "MARGEM MÉDIA", count: null, displayValue: `${s.avgMargin.toFixed(0)}%`, subtitle: s.avgMargin >= 30 ? "Saudável" : s.avgMargin >= 15 ? "Atenção" : "Crítica", icon: Percent, color: s.avgMargin >= 30 ? "text-green-600" : s.avgMargin >= 15 ? "text-amber-600" : "text-red-600", bgTint: s.avgMargin >= 30 ? "bg-green-50/50 dark:bg-green-950/20" : s.avgMargin >= 15 ? "bg-amber-50/50 dark:bg-amber-950/20" : "bg-red-50/50 dark:bg-red-950/20" }] : []),
                { key: "_taxaAceitacao", label: "TAXA ACEITAÇÃO", count: null, displayValue: `${ds?.taxaAceitacao ?? s.taxaAceitacao}%`, subtitle: `${ds?.aceite ?? s.aceite} de ${ds?.total ?? s.total} aceites`, icon: BarChart3, color: "text-green-600", bgTint: "bg-green-50/50 dark:bg-green-950/20" },
                { key: "_avgAcceptTime", label: "TEMPO MÉDIO ACEITAÇÃO", count: null, displayValue: `${ds?.avgAcceptTime ?? s.avgAcceptTime}d`, subtitle: "Da criação à aceitação", icon: Timer, color: "text-primary" },
              ];
              return cardData.map(({ key, label, count, displayValue, subtitle, icon: Icon, color, bgTint }) => (
              <Card 
                key={key}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md min-w-[120px] flex-1",
                  statusFilter === key && "ring-2 ring-primary",
                  (bgTint as string) || ""
                )}
                onClick={() => { if (!key.startsWith("_")) setStatusFilter(key); }}
              >
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className={cn("text-2xl font-bold", color)}>
                    {displayValue || count}
                  </div>
                  {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
                </CardContent>
              </Card>
            ));
            })()}
          </div>
        </div>

        {/* Filters */}
        {showFilters && viewMode === 'lista' && (
          <div className="flex-shrink-0 px-4 md:px-6 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('quotes.searchPlaceholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-9" />
              </div>
              <Button variant={onlyMine ? "default" : "outline"} size="sm" className="h-9 gap-1.5" onClick={() => setOnlyMine(!onlyMine)}>
                👤 Só os meus
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="aceite">Aceite</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                  <SelectItem value="rejeitado">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={marginFilter} onValueChange={setMarginFilter}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Margem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="high">Alta &gt;30%</SelectItem>
                  <SelectItem value="medium">Média 15-30%</SelectItem>
                  <SelectItem value="low">Baixa &lt;15%</SelectItem>
                </SelectContent>
              </Select>
              <Select value={comercialFilter} onValueChange={setComercialFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Comercial" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os comerciais</SelectItem>
                  <SelectItem value="none">Sem comercial</SelectItem>
                  {comercialUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
                    <CalendarIcon className="h-4 w-4" />
                    {dateFrom && dateTo
                      ? `${format(dateFrom, 'dd/MM/yy')} - ${format(dateTo, 'dd/MM/yy')}`
                      : dateFrom
                      ? `Desde ${format(dateFrom, 'dd/MM/yy')}`
                      : dateTo
                      ? `Até ${format(dateTo, 'dd/MM/yy')}`
                      : 'Data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateFrom, to: dateTo }}
                    onSelect={(range: any) => {
                      setDateFrom(range?.from);
                      setDateTo(range?.to);
                    }}
                    numberOfMonths={2}
                    locale={pt}
                  />
                  {(dateFrom || dateTo) && (
                    <div className="p-2 border-t flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                        Limpar datas
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" className="h-9 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => setMarginFilter("low")}>
                📉 Margem baixa
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs border-amber-200 text-amber-600 hover:bg-amber-50" onClick={() => { setStatusFilter("rascunho"); }}>
                📝 Rascunhos antigos
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />Limpar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        <div className="px-4 md:px-6">
          <BulkActionsBar
            selectedCount={selectedIds.size} onStatusClick={() => setBulkStatusDialogOpen(true)}
            onDeleteClick={() => setBulkDeleteDialogOpen(true)} onClearSelection={clearSelection}
            showOrgAction={false} statusPermission="quotes.edit" deletePermission="quotes.delete"
          />
        </div>

        {/* Content Area */}
        {viewMode === 'dashboard' ? (
          <QuotesDashboardView
            rpcStatusCounts={dashboardStats ? {
              rascunho: dashboardStats.rascunho, enviado: dashboardStats.enviado,
              aceite: dashboardStats.aceite, perdido: dashboardStats.perdido,
              finalizado: dashboardStats.finalizado, rejeitado: dashboardStats.rejeitado,
              outros: dashboardStats.outros,
            } : undefined}
            rpcStatusValues={dashboardStats ? {
              rascunhoValue: dashboardStats.rascunhoValue, enviadoValue: dashboardStats.enviadoValue,
              aceiteValue: dashboardStats.aceiteValue, perdidoValue: dashboardStats.perdidoValue,
              finalizadoValue: dashboardStats.finalizadoValue, rejeitadoValue: dashboardStats.rejeitadoValue,
              outrosValue: dashboardStats.outrosValue,
            } : undefined}
            quotes={allQuotesForDashboard.map(q => ({
              id: q.id,
              quote_number: null,
              estado: q.estado,
              created_at: q.created_at,
              accepted_at: q.accepted_at,
              validade_dias: q.validade_dias,
              total: q.total,
              assigned_to_name: q.assigned_to ? (comercialNamesMap[q.assigned_to] || undefined) : undefined,
            }))}
            isLoading={statsLoading}
            hasError={!!statsError}
            errorMessage={statsError ?? undefined}
          />
        ) : viewMode === 'margens' && canViewCosts ? (
          <QuotesMarginsView quotes={quotes} linesAgg={linesAgg} entityNamesMap={entityNamesMap} getEntityId={getEntityId} />
        ) : (
          /* Lista View */
          <div className="flex-1 px-4 md:px-6 pb-4 min-h-[340px]">
            <Card className="h-full flex flex-col min-h-[340px]">
              <div className="flex-1 overflow-auto quotes-table-scroll min-h-[280px]">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />{t('quotes.loading')}
                  </div>
                ) : filteredQuotes.length === 0 ? (
                  <div className="p-8 text-center space-y-4">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">{hasActiveFilters ? t('quotes.noResults') : t('quotes.noQuotes')}</p>
                    {!hasActiveFilters && (
                      <PermissionGate permission="quotes.create">
                        <Button onClick={() => { setSelectedQuote(null); setShowBuilder(true); }}>
                          <Plus className="mr-2 h-4 w-4" />{t('quotes.createFirst')}
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ) : (
                  <Table density="compact" containerClassName="overflow-visible" className="min-w-[1200px]">
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.size === filteredQuotes.length && filteredQuotes.length > 0} onCheckedChange={() => toggleSelectAll(filteredQuotes.map(q => q.id))} />
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('quote_number')}>
                          <div className="flex items-center text-xs">NÚMERO{getSortIcon('quote_number')}</div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('client')}>
                          <div className="flex items-center text-xs">CLIENTE{getSortIcon('client')}</div>
                        </TableHead>
                        <TableHead className="text-xs hidden md:table-cell">COMERCIAL</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">PEDIDO ORIGEM</TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('valor')}>
                          <div className="flex items-center text-xs">VALOR{getSortIcon('valor')}</div>
                        </TableHead>
                        {hasCostData && <TableHead className="text-xs hidden xl:table-cell">CUSTO</TableHead>}
                        {hasCostData && <TableHead className="cursor-pointer hover:bg-muted/50 hidden xl:table-cell" onClick={() => handleSort('margem')}>
                          <div className="flex items-center text-xs">MARGEM{getSortIcon('margem')}</div>
                        </TableHead>}
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('estado')}>
                          <div className="flex items-center text-xs">ESTADO{getSortIcon('estado')}</div>
                        </TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">PIPELINE</TableHead>
                        
                        <TableHead className="cursor-pointer hover:bg-muted/50 hidden sm:table-cell" onClick={() => handleSort('created_at')}>
                          <div className="flex items-center text-xs">DATA{getSortIcon('created_at')}</div>
                        </TableHead>
                        <TableHead className="text-right text-xs">ACÇÕES</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuotes.map((quote) => {
                        const agg = linesAgg[quote.id];
                        const contextSub = getContextualSubtitle(quote);
                        const marginVal = agg?.margin || 0;
                        
                        return (
                          <TableRow 
                            key={quote.id} 
                            className={cn("cursor-pointer hover:bg-muted/50", getRowColorClass(quote), selectedIds.has(quote.id) && "bg-muted/50")}
                            onClick={() => handleViewDetails(quote)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selectedIds.has(quote.id)} onCheckedChange={() => toggleSelectOne(quote.id)} />
                            </TableCell>
                            {/* Number + subtitle */}
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className={cn("font-semibold text-sm", quote.estado === 'perdido' && "line-through text-muted-foreground")}>
                                  {quote.quote_number || '-'}
                                </span>
                                {contextSub && (
                                  <span className={cn(
                                    "text-[10px] leading-tight",
                                    quote.estado === 'aceite' ? "text-green-600 dark:text-green-400" :
                                    quote.estado === 'perdido' ? "text-destructive" :
                                    contextSub.includes("⚠") ? "text-amber-600" : "text-muted-foreground"
                                  )}>
                                    {contextSub}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            {/* Client */}
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                                  {getClientNameString(quote).slice(0, 2).toUpperCase()}
                                </div>
                                <span className="font-medium text-sm truncate max-w-[120px]">{getClientNameString(quote)}</span>
                              </div>
                            </TableCell>
                            {/* Comercial */}
                            <TableCell className="hidden md:table-cell">
                              {quote.assigned_to ? (
                                <span className="text-xs">{comercialNamesMap[quote.assigned_to] || "..."}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            {/* Deal origin */}
                            <TableCell className="hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                              {quote.deals ? (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 text-xs text-primary"
                                  onClick={() => navigate(`/deals?open=${quote.deals!.id}`, { state: { openDealId: quote.deals!.id } })}
                                >
                                  <FileSignature className="h-3 w-3 mr-1" />{quote.deals.title}
                                </Button>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            {/* Value */}
                            <TableCell>
                              {(() => {
                                const hasFees = ((quote as any).total_fees || 0) > 0;
                                const primaryVal = hasFees
                                  ? ((quote as any).total || 0)
                                  : (agg?.totalValue || (quote as any).total || 0);
                                const secondaryVal = hasFees ? null : (agg?.totalWithIva || 0);
                                return (
                                  <>
                                    <span className={cn("font-bold text-sm tabular-nums", quote.estado === 'perdido' && "line-through text-muted-foreground")}>
                                      {formatCurrency(primaryVal)}
                                    </span>
                                    {!hasFees && secondaryVal > 0 && secondaryVal !== primaryVal && (
                                      <span className="block text-[10px] text-muted-foreground tabular-nums">
                                        c/ IVA: {formatCurrency(secondaryVal)}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                              {((quote as any).desconto_global_percent || 0) > 0 && (
                                <span className="block text-[10px] text-orange-500 dark:text-orange-400 tabular-nums">
                                  Desc. global: {(quote as any).desconto_global_percent}%
                                </span>
                              )}
                            </TableCell>
                            {hasCostData && (
                              <TableCell className="hidden xl:table-cell">
                                {agg?.hasCostData ? (
                                  <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(agg.totalCost)}</span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                            )}
                            {hasCostData && (
                              <TableCell className="hidden xl:table-cell">
                                {agg?.hasCostData && agg.totalValue > 0 ? (
                                  <Badge className={cn(
                                    "text-xs font-semibold",
                                    marginVal >= 30 ? "bg-green-500/20 text-green-700 dark:text-green-400" :
                                    marginVal >= 15 ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" :
                                    "bg-red-500/20 text-red-700 dark:text-red-400"
                                  )}>
                                    {marginVal.toFixed(0)}%
                                    {marginVal >= 30 ? " ✅" : marginVal >= 15 ? " ⚠" : " ❌"}
                                  </Badge>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                            )}
                            {/* Status */}
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {getStatusBadge(quote.estado)}
                            </TableCell>
                            {/* Pipeline Mini */}
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-col gap-1">
                                <QuotesPipelineMini
                                  dealExists={!!quote.deals}
                                  quoteStatus={quote.estado}
                                  proposalCreated={!!quote.proposal_id}
                                  proposalInfo={quote.proposals ? `Proposta ${quote.proposals.title}` : undefined}
                                />
                                {quote.proposal_id && quote.proposals && (
                                  <span className="text-[10px] text-green-600">Proposta criada ✅</span>
                                )}
                                {quote.estado === 'enviado' && (
                                  <span className="text-[10px] text-muted-foreground">A aguardar resposta</span>
                                )}
                              </div>
                            </TableCell>
                            {/* Date */}
                            <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                              {format(parseISO(quote.created_at), "dd/MM/yyyy", { locale: getLocale() })}
                            </TableCell>
                            {/* Actions - Dynamic by state */}
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-0.5">
                                {/* Edit — available on all states except 'aceite' (client accepted) */}
                                {quote.estado !== 'aceite' && (
                                  <PermissionGate permission="quotes.edit">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedQuote(quote.id); setShowBuilder(true); }} title="Editar">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </PermissionGate>
                                )}
                                {/* View — all states except rascunho (which has edit) */}
                                {quote.estado !== 'rascunho' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewDetails(quote)} title="Ver">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* PDF — always */}
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleGeneratePDF(quote.id)} title="PDF">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                {/* Email — all except aceite */}
                                {quote.estado !== 'aceite' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSendQuote(quote); setSendDialogOpen(true); }} title="Enviar email">
                                    <Mail className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* Accept — rascunho and enviado */}
                                {(quote.estado === 'rascunho' || quote.estado === 'enviado') && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleAcceptQuote(quote)} title="Aceitar (cria proposta)">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* View proposal — when linked */}
                                {quote.proposal_id && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => navigate(`/proposals?open=${quote.proposal_id}`)} title="Ver proposta">
                                    <FileCheck className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* Reopen — perdido only */}
                                {quote.estado === 'perdido' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleDuplicateQuote(quote, 5)} title="Reabrir com desconto (v2)">
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {/* Dropdown menu */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    sideOffset={8}
                                    collisionPadding={16}
                                    className="w-72 max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto"
                                  >
                                    {/* COMUNICAÇÃO */}
                                    <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📨 Comunicação</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => { setSendQuote(quote); setSendDialogOpen(true); }}>
                                      <Mail className="w-3.5 h-3.5 mr-2" />
                                      {quote.estado === 'aceite' ? "Enviar confirmação ao cliente" : "Enviar por email"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />

                                    {/* AVANÇAR - state-dependent */}
                                    {quote.estado !== 'aceite' && quote.estado !== 'perdido' && (
                                      <>
                                        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📊 Avançar</DropdownMenuLabel>
                                        {quote.estado === 'rascunho' && (
                                          <DropdownMenuItem onClick={() => handleMarkAsSent(quote.id)}>
                                            <Send className="w-3.5 h-3.5 mr-2" />Marcar como Enviado
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem className="text-green-600 font-medium" onClick={() => handleAcceptQuote(quote)}>
                                          <CheckCircle2 className="w-3.5 h-3.5 mr-2" />Marcar como Aceite
                                          <span className="ml-auto text-[10px] text-muted-foreground">⚡ cria proposta</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onClick={() => setLostReasonDialog({ open: true, quoteId: quote.id, reason: '' })}>
                                          <FileX className="w-3.5 h-3.5 mr-2" />Marcar como Perdido
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                      </>
                                    )}

                                    {/* RELACIONADOS */}
                                    <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">🔗 Relacionados</DropdownMenuLabel>
                                    {quote.deals ? (
                                      <DropdownMenuItem onClick={() => navigate(`/deals?open=${quote.deals!.id}`)}>
                                        <FileSignature className="w-3.5 h-3.5 mr-2" />Ver pedido de proposta
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem disabled className="text-muted-foreground">
                                        <FileSignature className="w-3.5 h-3.5 mr-2" />Ver pedido de proposta (sem pedido)
                                      </DropdownMenuItem>
                                    )}
                                    {quote.proposal_id ? (
                                      <DropdownMenuItem onClick={() => navigate(`/proposals?open=${quote.proposal_id}`)}>
                                        <FileCheck className="w-3.5 h-3.5 mr-2 text-green-600" />Ver proposta criada
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem disabled className="text-muted-foreground">
                                        <FileCheck className="w-3.5 h-3.5 mr-2" />Ver proposta (não criada)
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />

                                    {/* ACÇÕES */}
                                    <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📋 Acções</DropdownMenuLabel>
                                    {quote.estado !== 'aceite' && (
                                      <PermissionGate permission="quotes.edit">
                                        <DropdownMenuItem onClick={() => { setSelectedQuote(quote.id); setShowBuilder(true); }}>
                                          <Pencil className="w-3.5 h-3.5 mr-2" />Editar orçamento
                                        </DropdownMenuItem>
                                      </PermissionGate>
                                    )}
                                    <DropdownMenuItem onClick={() => handleDuplicateQuote(quote)}>
                                      <Copy className="w-3.5 h-3.5 mr-2" />Duplicar orçamento
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGeneratePDF(quote.id)}>
                                      <Download className="w-3.5 h-3.5 mr-2" />Download PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setHistoryQuote(quote); setHistoryDialogOpen(true); }}>
                                      <History className="w-3.5 h-3.5 mr-2" />Ver histórico
                                    </DropdownMenuItem>
                                    
                                    {/* PERDIDO special actions */}
                                    {quote.estado === 'perdido' && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">🔄 Recuperação</DropdownMenuLabel>
                                        <DropdownMenuItem onClick={() => handleDuplicateQuote(quote, 5)}>
                                          <RotateCcw className="w-3.5 h-3.5 mr-2" />Reabrir com desconto (v2)
                                        </DropdownMenuItem>
                                      </>
                                    )}


                                    <DropdownMenuSeparator />
                                    {/* Delete - only drafts */}
                                    {quote.estado !== 'aceite' ? (
                                      <PermissionGate permission="quotes.delete">
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteQuoteId(quote.id)}>
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />Eliminar
                                        </DropdownMenuItem>
                                      </PermissionGate>
                                    ) : (
                                      <DropdownMenuItem disabled className="text-muted-foreground">
                                        <Trash2 className="w-3.5 h-3.5 mr-2" />Eliminar (aceite não pode ser eliminado)
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
                
                {hasMore && !loading && (
                  <div ref={loadMoreRef} className="p-4 text-center">
                    {loadingMore && <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />}
                  </div>
                )}
              </div>
              
              <div className="flex-shrink-0 p-3 border-t bg-muted/30 text-sm text-muted-foreground">
                {t('quotes.showing')} {filteredQuotes.length} {t('quotes.of')} {totalCount} {t('quotes.records')}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteQuoteId} onOpenChange={() => setDeleteQuoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('quotes.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('quotes.deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lost reason dialog */}
      <Dialog open={!!lostReasonDialog?.open} onOpenChange={() => setLostReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Perdido</DialogTitle>
            <DialogDescription>Indique o motivo de perda deste orçamento.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={lostReasonDialog?.reason || ''} onValueChange={(v) => setLostReasonDialog(prev => prev ? { ...prev, reason: v } : null)}>
              <SelectTrigger><SelectValue placeholder="Motivo..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Preço elevado">Preço elevado</SelectItem>
                <SelectItem value="Concorrência">Concorrência</SelectItem>
                <SelectItem value="Sem resposta">Sem resposta</SelectItem>
                <SelectItem value="Desistência do cliente">Desistência do cliente</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostReasonDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => lostReasonDialog && handleMarkAsLost(lostReasonDialog.quoteId, lostReasonDialog.reason)} disabled={!lostReasonDialog?.reason}>
              Marcar como Perdido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('quotes.details')} - {detailQuote?.quote_number || '-'}
            </DialogTitle>
          </DialogHeader>
          
          {detailQuote && (
            <div className="px-1 mb-2">
              <PipelineBreadcrumb entityType="quote" entityId={detailQuote.id} />
            </div>
          )}
          
          {detailQuote && (
            <Tabs defaultValue="resumo" className="flex-1 flex flex-col overflow-hidden min-h-0">
              <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="flex-1 overflow-hidden mt-4 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1 min-h-0 pr-4">
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('quotes.columns.client')}</label>
                        <p className="font-medium">{getClientName(detailQuote).name}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('quotes.columns.location')}</label>
                        <p className="text-sm">{getClientAddress(detailQuote)}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Comercial</label>
                        <p className="text-sm">{detailQuote.assigned_to ? (comercialNamesMap[detailQuote.assigned_to] || "...") : "—"}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('quotes.columns.status')}</label>
                        <div className="mt-1 flex items-center gap-2">
                          {getStatusBadge(detailQuote.estado)}
                          {detailQuote.estado !== 'aceite' && detailQuote.estado !== 'perdido' && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] border-green-200 text-green-700 hover:bg-green-50"
                              onClick={() => { handleAcceptQuote(detailQuote); setShowDetails(false); }}>
                              Aceitar
                            </Button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">{t('quotes.columns.date')}</label>
                        <p className="text-sm">{format(parseISO(detailQuote.created_at), "dd/MM/yyyy HH:mm", { locale: getLocale() })}</p>
                      </div>
                      {detailQuote.validade_dias != null && detailQuote.created_at && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">{t('quotes.validity')}</label>
                          <p className="text-sm">{format(addDays(parseISO(detailQuote.created_at), detailQuote.validade_dias), "dd/MM/yyyy", { locale: getLocale() })}</p>
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">{t('quotes.lines')}</label>
                      {detailLines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('quotes.noLines')}</p>
                      ) : (
                        <>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('quotes.lineColumns.description')}</TableHead>
                                <TableHead className="text-right">{t('quotes.lineColumns.qty')}</TableHead>
                                <TableHead className="text-right">{t('quotes.lineColumns.unitPrice')}</TableHead>
                                {canViewCosts && <TableHead className="text-right">Custo unit.</TableHead>}
                                {canViewCosts && <TableHead className="text-right">Custo linha</TableHead>}
                                {canViewCosts && <TableHead className="text-right">Margem</TableHead>}
                                <TableHead className="text-right">{t('quotes.lineColumns.subtotal')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detailLines.map((line) => {
                                const materialCost = parseFloat(String(line.custo_material_unit || 0));
                                const laborCost = parseFloat(String(line.custo_mao_obra_unit || 0));
                                const margin = parseFloat(String(line.margem_percent || 0));
                                const unitPrice = (materialCost + laborCost) * (1 + margin / 100);
                                const qty = parseFloat(String(line.qt || 0));
                                const subtotalLine = parseFloat(String(line.total_sem_iva || 0));
                                const unitCost = detailLineCosts[line.id] ?? 0;
                                const lineMargin = unitPrice > 0 && unitCost > 0
                                  ? ((unitPrice - unitCost) / unitPrice) * 100
                                  : null;
                                const marginColor = lineMargin == null
                                  ? "text-muted-foreground"
                                  : lineMargin >= 30 ? "text-green-600 dark:text-green-400"
                                  : lineMargin >= 15 ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400";
                                return (
                                  <TableRow key={line.id}>
                                    <TableCell>{line.descricao_snapshot}</TableCell>
                                    <TableCell className="text-right">{qty}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                                    {canViewCosts && (
                                      <TableCell className="text-right text-muted-foreground">
                                        {unitCost > 0 ? formatCurrency(unitCost) : '—'}
                                      </TableCell>
                                    )}
                                    {canViewCosts && (
                                      <TableCell className="text-right text-muted-foreground">
                                        {unitCost > 0 ? formatCurrency(unitCost * qty) : '—'}
                                      </TableCell>
                                    )}
                                    {canViewCosts && (
                                      <TableCell className={`text-right font-medium ${marginColor}`}>
                                        {lineMargin != null ? `${lineMargin.toFixed(1)}%` : '—'}
                                      </TableCell>
                                    )}
                                    <TableCell className="text-right font-medium">{formatCurrency(subtotalLine)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {(() => {
                            const subtotal = detailLines.reduce((sum, l) => sum + parseFloat(String(l.total_sem_iva || 0)), 0);
                            const totalCost = detailLines.reduce((sum, l) => {
                              const qty = parseFloat(String(l.qt || 0));
                              const c = detailLineCosts[l.id] ?? 0;
                              return sum + (c * qty);
                            }, 0);
                            const globalMargin = subtotal > 0 && totalCost > 0
                              ? ((subtotal - totalCost) / subtotal) * 100
                              : null;
                            // Agrupar IVA por taxa real do catálogo (product_prices/service_prices).
                            // Para bundles com componentes mistos, usa a distribuição calculada pelo resolver.
                            const ivaByRate = new Map<number, number>();
                            detailLines.forEach((l) => {
                              const base = parseFloat(String(l.total_sem_iva || 0));
                              const shares = detailLineDetails[l.id]?.vatRateShares;
                              if (shares && Object.keys(shares).length > 0) {
                                Object.entries(shares).forEach(([rateStr, share]) => {
                                  const rate = parseFloat(rateStr);
                                  const amount = base * share * (rate / 100);
                                  ivaByRate.set(rate, (ivaByRate.get(rate) || 0) + amount);
                                });
                              } else {
                                const rate = parseFloat(String(l.iva_percent ?? 23));
                                const amount = base * (rate / 100);
                                ivaByRate.set(rate, (ivaByRate.get(rate) || 0) + amount);
                              }
                            });
                            const ivaRates = Array.from(ivaByRate.entries()).sort((a, b) => a[0] - b[0]);
                            const ivaTotal = ivaRates.reduce((s, [, v]) => s + v, 0);
                            const total = subtotal + ivaTotal;
                            const marginColor = globalMargin == null
                              ? ""
                              : globalMargin >= 30 ? "text-green-600 dark:text-green-400"
                              : globalMargin >= 15 ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400";
                            return (
                              <div className="flex justify-end mt-4">
                                <div className="w-72 space-y-2 text-sm">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                                  {canViewCosts && totalCost > 0 && (
                                    <>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Custo total</span><span>{formatCurrency(totalCost)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Margem global</span><span className={`font-medium ${marginColor}`}>{globalMargin!.toFixed(1)}%</span></div>
                                    </>
                                  )}
                                  {ivaRates.map(([rate, amount]) => (
                                    <div key={rate} className="flex justify-between">
                                      <span className="text-muted-foreground">IVA ({rate}%)</span>
                                      <span>{formatCurrency(amount)}</span>
                                    </div>
                                  ))}
                                  <Separator />
                                  <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(total)}</span></div>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                    {detailQuote.observacoes && (
                      <>
                        <Separator />
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">{t('quotes.observations')}</label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{detailQuote.observacoes}</p>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="documentos" className="flex-1 overflow-auto mt-4 pr-4 min-h-0">
                {detailQuote.organization_id ? (
                  <DocumentsTab
                    entityType="quote"
                    entityId={detailQuote.id}
                    organizationId={detailQuote.organization_id}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">A carregar…</div>
                )}
              </TabsContent>
            </Tabs>
          )}
          
          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={() => setShowDetails(false)}>{t('common.close')}</Button>
            {detailQuote && (
              <>
                <Button variant="outline" onClick={() => handleGeneratePDF(detailQuote.id)}>
                  <Download className="h-4 w-4 mr-2" />{t('quotes.downloadPdf')}
                </Button>
                <PermissionGate permission="quotes.edit">
                  <Button onClick={() => { setSelectedQuote(detailQuote.id); setShowBuilder(true); setShowDetails(false); }}>
                    <Pencil className="h-4 w-4 mr-2" />{t('common.edit')}
                  </Button>
                </PermissionGate>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <QuoteSendHistory
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        quoteId={historyQuote?.id || null}
        quoteTitle={historyQuote?.quote_number || undefined}
      />

      {/* Bulk Status Change */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.changeStatus')}</DialogTitle>
            <DialogDescription>{t('common.bulkStatusDescription', { count: selectedIds.size })}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
              <SelectTrigger><SelectValue placeholder={t('quotes.selectStatus')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">{t('quotes.status.draft')}</SelectItem>
                <SelectItem value="enviado">{t('quotes.status.sent')}</SelectItem>
                <SelectItem value="aceite">{t('quotes.status.accepted')}</SelectItem>
                <SelectItem value="perdido">{t('quotes.status.lost')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleBulkStatusChange} disabled={processing || !bulkNewStatus}>{processing ? t('common.processing') : t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.bulkDeleteDescription', { count: selectedIds.size })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={processing}>
              {processing ? t('common.processing') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Quote Email */}
      <SendQuoteDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen} quote={sendQuote} onSent={() => fetchQuotes()} />
    </>
  );
}
