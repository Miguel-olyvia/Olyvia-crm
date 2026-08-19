import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { resolveSendProposalAlerts } from "@/lib/notifications/resolveSendProposalAlerts";
import { resolveRootOrgIdLogic } from "@/lib/orgHierarchy";
import { searchEntityIds } from "@/lib/clientSearch";
import { useScopedEntitySearch } from "@/hooks/useScopedEntitySearch";
import { useDescendantOrgIds } from "@/hooks/useDescendantOrgIds";
import { MIN_SEARCH_TERM_LENGTH, normalizeSearchTerm } from "@/lib/search/scopedEntitySearch";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PageFAQSheet } from "@/components/PageFAQSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StickyHorizontalScroll } from "@/components/ui/sticky-horizontal-scroll";
import { 
  Plus, FileText, Pencil, Trash2, Search, RefreshCw, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, X, Eye, Settings2,
  Copy, History, Link2, Paintbrush, Palette,
  CheckSquare, Send, Mail, MoreHorizontal, Phone, MessageSquare, KeyRound,
  RotateCcw, BarChart3, Columns3, LayoutList, Download, HelpCircle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { proposalSchema } from "@/lib/validations";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { useComercialUsers } from "@/hooks/useComercialUsers";
import { useClientPortalAccess } from "@/hooks/useClientPortalAccess";
import { PortalStatusBadge } from "@/components/portal/PortalStatusBadge";
import { EntitySearchInput, type EntitySearchResult } from "@/components/EntitySearchInput";
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
import { RegisterCallDialog } from "@/components/contacts/RegisterCallDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn, formatCurrency } from "@/lib/utils";
import { format, startOfDay, endOfDay, differenceInDays, parseISO, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import ProposalItemsEditor, { ProposalItem, calculateProposalItemsTotal } from "@/components/proposals/ProposalItemsEditor";
import { Checkbox } from "@/components/ui/checkbox";

import { SendProposalDialog } from "@/components/proposals/SendProposalDialog";
import { ProposalSendHistory } from "@/components/proposals/ProposalSendHistory";
import { ProposalDetailsDialog } from "@/components/proposals/ProposalDetailsDialog";
import { ProposalRejectReasonDialog, type ProposalRejectionDecision } from "@/components/proposals/ProposalRejectReasonDialog";
import { ProposalWorkflowConfig } from "@/components/proposals/ProposalWorkflowConfig";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { ProposalManualItemsEditor } from "@/components/pipeline/ProposalManualItemsEditor";
import { AIProposalGeneratorDialog } from "@/components/proposals/AIProposalGeneratorDialog";
import { ProposalPortalPreview } from "@/components/proposals/ProposalPortalPreview";
import { useModuleAlerts } from "@/hooks/useModuleAlerts";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import { ProposalsWorkflowBar } from "@/components/proposals/ProposalsWorkflowBar";
import { ProposalsAlertBars } from "@/components/proposals/ProposalsAlertBars";
import { useAlertSettings } from "@/hooks/useAlertSettings";
import { ProposalsDashboardView } from "@/components/proposals/ProposalsDashboardView";
import { ProposalsPipelineMini } from "@/components/proposals/ProposalsPipelineMini";
import { ProposalsKanbanView } from "@/components/proposals/ProposalsKanbanView";
import { InlineQuoteBuilder, InlineQuoteData, createEmptyInlineQuote, calcInlineQuoteTotal } from "@/components/proposals/InlineQuoteBuilder";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";
import { generateProposalPdfBlob, downloadBlob } from "@/utils/generateProposalPdfBlob";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";

interface WorkflowStage {
  id: string;
  organization_id?: string | null;
  name: string;
  label: string;
  color: string;
  icon: string | null;
  stage_order: number;
  is_active: boolean;
  is_final: boolean;
  is_won: boolean;
  is_lost: boolean;
  [key: string]: any;
}

interface Proposal {
  id: string;
  title: string;
  description: string | null;
  value: number;
  value_sem_iva: number | null;
  probability: number | null;
  status: string;
  stage_id: string | null;
  valid_until: string | null;
  created_at: string;
  notes: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  deals: { id: string; title: string } | null;
  proposal_workflow_stages?: WorkflowStage | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  proposal_number?: string | null;
  published_at?: string | null;
  has_unpublished_changes?: boolean | null;
}

interface Deal {
  id: string;
  title: string;
  probability: number | null;
}

interface DealSearchResult {
  id: string;
  title: string;
  probability: number | null;
  entity_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  value?: number | null;
  stage_name?: string | null;
  expected_close_date?: string | null;
}

interface QuoteItem {
  id: string;
  quote_number: string | null;
  total: number | null;
  estado: string;
}

const Proposals = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProposal, setSavingProposal] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Republishing an already-accepted proposal to the portal reopens it for re-signature
  // (backend resets status + clears the prior signature). Confirm with the user first.
  const [portalReopenConfirm, setPortalReopenConfirm] = useState<{ proposal: Proposal; forceNewPassword: boolean } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showWorkflowConfig, setShowWorkflowConfig] = useState(false);
  const [rejectReasonDialogOpen, setRejectReasonDialogOpen] = useState(false);
  // Drag-and-drop no kanban para uma stage `is_lost`: guarda a proposta e o
  // stage de destino enquanto se pede o motivo de rejeição (mesmo diálogo
  // usado no "Rejeitar (com motivo)" do dropdown).
  const [kanbanRejectTarget, setKanbanRejectTarget] = useState<{ proposal: Proposal; stageId: string } | null>(null);
  const [kanbanRejectDialogOpen, setKanbanRejectDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, loading: permissionsLoading, isSystemAdmin } = usePermissions();
  const { t } = useTranslation();
  const { activeCompany, userType: companyUserType, isLoading: companyLoading } = useCompany();
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  const { comercialUsers } = useComercialUsers(activeCompany?.id || null, {
    viewerScope: getPermissionScope("proposals.view"),
    viewerAnewUserId: scopeAnewUserId,
    teamMemberIds,
    scopeLoading,
  });
  const { alerts: proposalAlerts, dismissAlert: dismissProposalAlert } = useModuleAlerts('proposal', activeCompany?.id);
  const alertSettings = useAlertSettings();

  // Descendant org IDs for the active company subtree (shared traversal).
  const { orgIds: descendantOrgIds } = useDescendantOrgIds();

  const stageFromUrl = searchParams.get("stage");

  // View mode
  const [viewMode, setViewMode] = useState<"lista" | "kanban" | "dashboard">("lista");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [searchEntityIdSet, setSearchEntityIdSet] = useState<Set<string> | null>(null);
  const truncatedWarnedRef = useRef<string | null>(null);
  // Resolve entity IDs matching the search term (covers name/email/phone/NIF)
  useEffect(() => {
    const term = debouncedSearch.trim();
    if (term.length < 3) {
      setSearchEntityIdSet(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { ids, truncated } = await searchEntityIds(term);
      if (cancelled) return;
      if (truncated && truncatedWarnedRef.current !== term) {
        truncatedWarnedRef.current = term;
        toast({
          title: "Demasiados resultados",
          description: "Mais de 1000 resultados — refine a pesquisa para ver todos.",
        });
      }
      setSearchEntityIdSet(new Set(ids));
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, toast]);
  const [statusFilter, setStatusFilter] = useState<string>(stageFromUrl || "all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [onlyMine, setOnlyMine] = useState(false);
  const [comercialFilter, setComercialFilter] = useState<string>("all");
  const [comercialNamesMap, setComercialNamesMap] = useState<Record<string, string>>({});
  const [noResponseFilter, setNoResponseFilter] = useState(false);
  const [expiredFilter, setExpiredFilter] = useState(false);
  const [noValidityFilter, setNoValidityFilter] = useState(false);

  useEffect(() => {
    if (stageFromUrl) {
      setStatusFilter(stageFromUrl);
    }
  }, [stageFromUrl]);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    value: "",
    deal_id: "",
    valid_until: "",
    notes: "",
    stage_id: "",
    template_id: "",
    assigned_to: "",
  });
  const [proposalTemplates, setProposalTemplates] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [originalStageId, setOriginalStageId] = useState<string | null>(null);
  // When editing a proposal already "Enviada", only the Orçamentos section stays
  // editable — the rest of the form is locked (visually disabled).
  const [editingProposalIsSent, setEditingProposalIsSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  const [dealSearch, setDealSearch] = useState("");
  const [dealSearchResults, setDealSearchResults] = useState<DealSearchResult[]>([]);
  const [showDealDropdown, setShowDealDropdown] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealSearchResult | null>(null);

  // Deal lookup for this dialog. Routed through the shared scoped search so it
  // applies deals.view (not proposals.view, which it used to gate on) and so it
  // finds deals the user owns directly — the old query could only reach deals
  // through leads assigned to the user, and returned nothing for anyone with no
  // assigned leads. `dealSearchResults` stays a state array because
  // handleEntityChange also populates it with an entity's deals.
  const {
    results: scopedDealResults,
    loading: dealSearchLoading,
    search: runDealSearch,
  } = useScopedEntitySearch({ kinds: ["deal"], limitPerKind: 20 });
  useEffect(() => {
    setDealSearchResults(
      scopedDealResults.map((r) => ({
        id: r.id,
        title: r.name,
        probability: r.dealProbability ?? null,
        entity_id: r.entityId,
        lead_name: r.contactName ?? null,
        lead_phone: r.phone ?? null,
        lead_email: r.email ?? null,
        value: r.dealValue ?? null,
        stage_name: r.dealStageName ?? null,
        expected_close_date: r.dealExpectedCloseDate ?? null,
      })),
    );
  }, [scopedDealResults]);
  const [selectedEntity, setSelectedEntity] = useState<EntitySearchResult | null>(null);
  
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteSearchResults, setQuoteSearchResults] = useState<QuoteItem[]>([]);
  const [showQuoteDropdown, setShowQuoteDropdown] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<QuoteItem[]>([]);
  const [showNullTotalDialog, setShowNullTotalDialog] = useState(false);
  const [nullTotalQuoteNames, setNullTotalQuoteNames] = useState<string[]>([]);
  const nullTotalConfirmedRef = useRef(false);
  const proposalFormRef = useRef<HTMLFormElement>(null);
  const [suggestedQuotes, setSuggestedQuotes] = useState<QuoteItem[]>([]);
  
  const [proposalItems, setProposalItems] = useState<ProposalItem[]>([]);
  const [inlineQuotes, setInlineQuotes] = useState<InlineQuoteData[]>([]);
  
  const [visualEditorProposalId, setVisualEditorProposalId] = useState<string | null>(null);

  // Auto-fill value field from inline quotes + selected quotes total.
  // Compares the computed total against the current formData.value before writing
  // to avoid unnecessary re-renders when selectedQuotes' reference changes but
  // the actual total is unchanged.
  useEffect(() => {
    const quotesTotal = selectedQuotes.reduce((sum, q) => sum + (q.total || 0), 0);
    const inlineTotal = inlineQuotes.reduce((sum, q) => sum + calcInlineQuoteTotal(q), 0);
    const total = quotesTotal + inlineTotal;
    if (total > 0) {
      setFormData(prev => {
        const next = total.toFixed(2);
        return prev.value === next ? prev : { ...prev, value: next };
      });
    }
  }, [inlineQuotes, selectedQuotes]);

  // Suggested quotes (drafts + unattached) for the selected Deal or Entity
  useEffect(() => {
    const orgId = activeCompany?.id;
    const dealId = selectedDeal?.id || formData.deal_id || null;
    const entityId = selectedEntity?.entityId || null;
    if (!orgId || (!dealId && !entityId)) { setSuggestedQuotes([]); return; }
    let cancelled = false;
    (async () => {
      let q = supabase
        .from("quotes")
        .select("id, quote_number, total, estado, deal_id, entity_id")
        .eq("organization_id", orgId)
        .is("proposal_id", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (dealId) {
        // For deals, keep showing only drafts (the typical "ready to attach" set)
        q = q.eq("deal_id", dealId).eq("estado", "rascunho");
      } else if (entityId) {
        // Surface only relevant quotes: drafts, or quotes already assigned to the
        // same commercial as the proposal being edited.
        const assignedTo = formData.assigned_to;
        q = q.eq("entity_id", entityId).or(assignedTo ? `estado.eq.rascunho,assigned_to.eq.${assignedTo}` : `estado.eq.rascunho`);
      }
      const { data } = await q;
      if (cancelled) return;
      setSuggestedQuotes((data || []).map((r: any) => ({ id: r.id, quote_number: r.quote_number, total: r.total, estado: r.estado })));
    })();
    return () => { cancelled = true; };
  }, [selectedDeal?.id, formData.deal_id, selectedEntity?.entityId, activeCompany?.id, selectedQuotes.length, formData.assigned_to]);

  // Pre-fill "Comercial" in create mode based on selected client/contact/deal.
  // Never overrides a manual choice; falls back to current business user when no entity/deal.
  useEffect(() => {
    if (editingId) return;
    if (formData.assigned_to) return;
    const orgId = activeCompany?.id;
    if (!orgId) return;
    const entityId = selectedEntity?.entityId || null;
    const dealId = selectedDeal?.id || formData.deal_id || null;

    if (!entityId && !dealId) {
      if (scopeAnewUserId) {
        setFormData(prev => prev.assigned_to ? prev : { ...prev, assigned_to: scopeAnewUserId });
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("resolve_proposal_commercial", {
        p_entity_id: entityId,
        p_deal_id: dealId,
        p_org_id: orgId,
        p_created_by: scopeAnewUserId || null,
      });
      if (cancelled) return;
      if (error) {
        console.error("[Proposals] resolve_proposal_commercial error:", error);
        return;
      }
      if (data) {
        setFormData(prev => prev.assigned_to ? prev : { ...prev, assigned_to: data });
      }
    })();
    return () => { cancelled = true; };
  }, [editingId, formData.assigned_to, activeCompany?.id, selectedEntity?.entityId, selectedDeal?.id, formData.deal_id, scopeAnewUserId]);

  const toQuoteItem = useCallback((quote: any): QuoteItem => ({
    id: quote.id,
    quote_number: quote.quote_number,
    total: quote.total,
    estado: quote.estado || "rascunho",
  }), []);

  const loadOpenQuotesForEntity = useCallback(async (entityId: string): Promise<QuoteItem[]> => {
    if (!activeCompany?.id || !entityId) return [];
    const { data, error } = await supabase
      .from("quotes")
      .select("id, quote_number, total, estado, created_at")
      .eq("organization_id", activeCompany.id)
      .eq("entity_id", entityId)
      .is("proposal_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("Error loading quotes for selected entity:", error);
      return [];
    }
    return (data || []).map(toQuoteItem);
  }, [activeCompany?.id, toQuoteItem]);

  const handleEntityChange = useCallback(async (entity: EntitySearchResult | null) => {
    setSelectedEntity(entity);
    setSelectedQuotes([]);
    setDealSearchResults([]);
    setShowDealDropdown(false);
    if (!entity?.entityId) return;
    const quotes = await loadOpenQuotesForEntity(entity.entityId);
    if (quotes.length > 0) setSelectedQuotes(quotes);

    // Also surface any deals (pedidos) for this entity so the user can pick one
    // — searching by deal title alone wouldn't find them when the title is generic.
    const orgIds = descendantOrgIds.length > 0 ? descendantOrgIds : (activeCompany?.id ? [activeCompany.id] : []);
    if (orgIds.length > 0) {
      const { data: entityDeals } = await supabase
        .from("deals")
        .select("id, title, probability, value, description, expected_close_date, entity_id, deal_stages(name)")
        .in("organization_id", orgIds)
        .eq("entity_id", entity.entityId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (entityDeals && entityDeals.length > 0) {
        setDealSearchResults(entityDeals.map((d: any) => ({
          id: d.id, title: d.title, probability: d.probability, value: d.value,
          expected_close_date: d.expected_close_date, stage_name: d.deal_stages?.name || null,
          lead_name: entity.name || null, lead_phone: entity.phone || null, lead_email: entity.email || null,
        })));
        setShowDealDropdown(true);
      }
    }
  }, [loadOpenQuotesForEntity, descendantOrgIds, activeCompany?.id]);

  const searchQuotes = useCallback(async (value: string) => {
    const val = value.trim();
    setQuoteSearch(value);
    if (val.length < 2) { setQuoteSearchResults([]); return; }
    const orgId = activeCompany?.id;
    if (!orgId) return;
    const like = `%${val}%`;
    const assignedTo = formData.assigned_to;
    const relevanceFilter = assignedTo ? `estado.eq.rascunho,assigned_to.eq.${assignedTo}` : `estado.eq.rascunho`;

    const directPromise = supabase
      .from("quotes")
      .select("id, quote_number, total, estado, title, created_at")
      .eq("organization_id", orgId)
      .or(`quote_number.ilike.${like},title.ilike.${like}`)
      .or(relevanceFilter)
      .is("proposal_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    const entityIdsPromise = Promise.all([
      supabase
        .from("anew_entities")
        .select("id")
        .or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
        .limit(100),
      supabase.from("anew_entity_emails").select("entity_id").ilike("email", like).limit(100),
      supabase.from("anew_entity_phones").select("entity_id").ilike("phone_number", like).limit(100),
    ]).then(([names, emails, phones]) => Array.from(new Set([
      ...(names.data || []).map((r: any) => r.id),
      ...(emails.data || []).map((r: any) => r.entity_id),
      ...(phones.data || []).map((r: any) => r.entity_id),
    ].filter(Boolean))));

    const [{ data: directData, error: directError }, entityIds] = await Promise.all([directPromise, entityIdsPromise]);
    if (directError) console.error("Error searching quotes directly:", directError);

    let byEntity: any[] = [];
    if (entityIds.length > 0) {
      const { data: qByEntity, error: entityQuoteError } = await supabase
        .from("quotes")
        .select("id, quote_number, total, estado, title, created_at")
        .eq("organization_id", orgId)
        .in("entity_id", entityIds)
        .or(relevanceFilter)
        .is("proposal_id", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (entityQuoteError) console.error("Error searching quotes by entity:", entityQuoteError);
      byEntity = qByEntity || [];
    }

    const merged = Array.from(
      new Map([...(directData || []), ...byEntity].map((q: any) => [q.id, q])).values()
    );
    setQuoteSearchResults(merged.map(toQuoteItem));
  }, [activeCompany?.id, toQuoteItem, formData.assigned_to]);


  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState("");
  // Bulk status change para uma stage `is_lost`: pede motivo de rejeição
  // (aplicado a todas as propostas selecionadas) em vez de gravar direto.
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkStatusChanging, setIsBulkStatusChanging] = useState(false);
  const [duplicatingProposalId, setDuplicatingProposalId] = useState<string | null>(null);
  const { generatePortalAccess, loading: portalAccessLoading } = useClientPortalAccess({ onSuccess: () => loadData() });

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendProposal, setSendProposal] = useState<any>(null);

  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<{ entityId: string; name: string }>({ entityId: "", name: "" });

  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppContext | null>(null);

  const [bulkEmailSending, setBulkEmailSending] = useState(false);
  const [bulkPdfExporting, setBulkPdfExporting] = useState(false);

  const [sendHistoryOpen, setSendHistoryOpen] = useState(false);
  const [sendHistoryProposalId, setSendHistoryProposalId] = useState<string | null>(null);
  const [sendHistoryProposalTitle, setSendHistoryProposalTitle] = useState<string>("");
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewProposalId, setRenewProposalId] = useState<string | null>(null);
  const [portalPreviewOpen, setPortalPreviewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState("");

  // Pipeline data for proposals
  const [pipelineLinks, setPipelineLinks] = useState<Record<string, any>>({});
  const [contractStatuses, setContractStatuses] = useState<Record<string, string>>({});
  const [proposalsWithQuotes, setProposalsWithQuotes] = useState<Set<string>>(new Set());
  const [portalStatuses, setPortalStatuses] = useState<Record<string, string>>({});
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [entityEmails, setEntityEmails] = useState<Record<string, string>>({});
  const [entityPhones, setEntityPhones] = useState<Record<string, string>>({});
  const [dealEntityIds, setDealEntityIds] = useState<Record<string, string>>({}); // deal_id -> entity_id, for proposals without a direct entity_id
  const submitLockRef = useRef(false);
  const acceptProposalLockRef = useRef(false);
  const [isAcceptingProposal, setIsAcceptingProposal] = useState(false);

  useEffect(() => {
    if (!permissionsLoading && activeCompany && !isSystemAdmin && !hasPermission("proposals.view")) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, hasPermission, isSystemAdmin, navigate, activeCompany]);

  const loadWorkflowStages = useCallback(async () => {
    const { data: orgStages } = await (supabase
      .from("proposal_workflow_stages") as any)
      .select("id, name, label, color, stage_order, is_active, organization_id, is_final, is_won, is_lost")
      .eq("organization_id", activeCompany?.id || '')
      .eq("is_active", true)
      .order("stage_order");

    if (orgStages && orgStages.length > 0) {
      setWorkflowStages(orgStages);
    } else {
      const { data: globalStages } = await (supabase
        .from("proposal_workflow_stages") as any)
        .select("id, name, label, color, stage_order, is_active, organization_id, is_final, is_won, is_lost")
        .is("organization_id", null)
        .eq("is_active", true)
        .order("stage_order");
      
      setWorkflowStages(globalStages || []);
    }
  }, [activeCompany?.id]);

  const loadProposalTemplates = useCallback(async () => {
    if (!activeCompany?.id) return;
    const { data } = await (supabase as any)
      .from("proposal_templates")
      .select("id, name, is_default")
      .eq("organization_id", activeCompany.id)
      .eq("template_type", "proposal")
      .eq("is_active", true)
      .order("name");
    setProposalTemplates(data || []);
  }, [activeCompany?.id]);

  // True once the first successful page load has painted; keeps later
  // refreshes from re-triggering the full-page loader.
  const hasLoadedOnceRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!activeCompany?.id || permissionsLoading || scopeLoading) {
      if (!activeCompany?.id) {
        setProposals([]);
        setDeals([]);
      }
      setLoading(!!activeCompany?.id);
      return;
    }
    // Only the FIRST load may take over the screen. `loadData` runs again
    // after every edit/confirm/delete (18 call sites), and `loading` drives a
    // full-page early return further down — so each action was unmounting the
    // whole page and remounting it, losing scroll position and flashing the
    // loader. Subsequent refreshes now update the data in place.
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      await Promise.all([loadWorkflowStages(), loadProposalTemplates()]);

      const { data: { user } } = await supabase.auth.getUser();
      const viewScope = getPermissionScope("proposals.view");

      let proposalsData: Proposal[] = [];
      let dealsData: Deal[] = [];

      if (viewScope === "ORG" || isSystemAdmin) {
        // ORG scope or system admin: see all proposals in the organization
        const [proposalsRes, dealsRes] = await Promise.all([
          (supabase
            .from("proposals") as any)
            .select("*, deals(id, title, probability), proposal_workflow_stages(*), proposal_items(subtotal, vat_amount, total), quotes!proposal_id(desconto_global_percent)")
            .eq("organization_id", activeCompany.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("deals")
            .select("id, title, probability")
            .eq("organization_id", activeCompany.id),
        ]);

        if (proposalsRes.error) throw proposalsRes.error;
        if (dealsRes.error) throw dealsRes.error;

        proposalsData = proposalsRes.data || [];
        dealsData = dealsRes.data || [];
      } else if ((viewScope === "TEAM" || viewScope === "OWNED") && user?.id) {
        // Get anew user id
        const { data: anewUser } = await supabase
          .from("anew_users")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        const anewUserId = anewUser?.id;

        // Build list of business user IDs whose leads/proposals we can see.
        const allowedUserIds = new Set<string>();
        if (anewUserId) allowedUserIds.add(anewUserId);
        if (viewScope === "TEAM" && teamMemberIds.length > 0) {
          teamMemberIds.forEach(id => allowedUserIds.add(id));
        }

        // Get leads assigned to allowed users
        const { data: userLeads } = await (supabase
          .from("anew_leads") as any)
          .select("id")
          .eq("organization_id", activeCompany.id)
          .in("assigned_to", Array.from(allowedUserIds));

        const leadIds = (userLeads || []).map((l: any) => l.id);

        if (leadIds.length > 0) {
          const { data: userDeals } = await supabase
            .from("deals")
            .select("id, title, probability")
            .eq("organization_id", activeCompany.id)
            .in("lead_id", leadIds);

          const dealIds = (userDeals || []).map(d => d.id);
          dealsData = userDeals || [];

          if (dealIds.length > 0) {
            const { data: proposalsRes, error } = await (supabase
              .from("proposals") as any)
              .select("*, deals(id, title, probability), proposal_workflow_stages(*), proposal_items(subtotal, vat_amount, total), quotes!proposal_id(desconto_global_percent)")
              .eq("organization_id", activeCompany.id)
              .is("deleted_at", null)
              .in("deal_id", dealIds)
              .order("created_at", { ascending: false });

            if (error) throw error;
            proposalsData = proposalsRes || [];
          }
        }

        // Also include proposals created by allowed users (fallback)
        if (proposalsData.length === 0 || viewScope === "TEAM") {
          const { data: ownedProposals } = await (supabase
            .from("proposals") as any)
            .select("*, deals(id, title, probability), proposal_workflow_stages(*), proposal_items(subtotal, vat_amount, total), quotes!proposal_id(desconto_global_percent)")
            .eq("organization_id", activeCompany.id)
            .is("deleted_at", null)
            .in("created_by", Array.from(allowedUserIds))
            .order("created_at", { ascending: false });

          if (ownedProposals) {
            const existingIds = new Set(proposalsData.map(p => p.id));
            for (const p of ownedProposals) {
              if (!existingIds.has(p.id)) {
                proposalsData.push(p);
              }
            }
          }
        }
      }

      // Load pipeline links for proposals
      if (proposalsData.length > 0) {
        const proposalIds = proposalsData.map(p => p.id);
        const { data: links } = await (supabase.from("pipeline_links") as any)
          .select("id, proposal_id, deal_id, quote_id, contract_id, status")
          .in("proposal_id", proposalIds)
          .eq("organization_id", activeCompany?.id);
        
        const linksMap: Record<string, any> = {};
        (links || []).forEach((l: any) => {
          linksMap[l.proposal_id] = l;
        });
        setPipelineLinks(linksMap);

        // Load contract statuses for linked contracts (no FK between pipeline_links.contract_id
        // and client_contracts, so this must be a separate query, not an embed).
        const contractIds = Array.from(new Set((links || []).map((l: any) => l.contract_id).filter(Boolean)));
        if (contractIds.length > 0) {
          const { data: linkedContracts } = await (supabase.from("client_contracts") as any)
            .select("id, status")
            .in("id", contractIds);
          const contractStatusMap: Record<string, string> = {};
          (linkedContracts || []).forEach((c: any) => {
            contractStatusMap[c.id] = c.status;
          });
          setContractStatuses(contractStatusMap);
        } else {
          setContractStatuses({});
        }

        // Check which proposals have quotes directly linked (via quotes.proposal_id)
        const { data: quotesLinked } = await (supabase.from("quotes") as any)
          .select("proposal_id")
          .in("proposal_id", proposalIds)
          .eq("organization_id", activeCompany?.id)
          .not("proposal_id", "is", null);
        const quotesSet = new Set<string>();
        (quotesLinked || []).forEach((q: any) => {
          if (q.proposal_id) quotesSet.add(q.proposal_id);
        });
        setProposalsWithQuotes(quotesSet);

        // Load portal statuses for proposals
        const { data: portalUsers } = await (supabase as any)
          .from("client_portal_users")
          .select("proposal_id, portal_status")
          .eq("organization_id", activeCompany.id)
          .in("proposal_id", proposalIds);
        
        const statusMap: Record<string, string> = {};
        (portalUsers || []).forEach((pu: any) => {
          if (pu.proposal_id) statusMap[pu.proposal_id] = pu.portal_status;
        });
        setPortalStatuses(statusMap);

        // Resolve entity names for proposals (including from deals as fallback)
        const directEntityIds = proposalsData.map((p: any) => p.entity_id).filter(Boolean);
        const dealIds = proposalsData.filter((p: any) => !p.entity_id && p.deal_id).map((p: any) => p.deal_id);
        
        // Fetch deal entity_ids for proposals without entity_id
        const dealEntityMap: Record<string, string> = {};
        if (dealIds.length > 0) {
          const { data: dealEntities } = await supabase
            .from("deals")
            .select("id, entity_id")
            .in("id", dealIds);
          (dealEntities || []).forEach((d: any) => {
            if (d.entity_id) dealEntityMap[d.id] = d.entity_id;
          });
        }

        const allEntityIds = [...new Set([
          ...directEntityIds,
          ...Object.values(dealEntityMap),
        ])];

        if (allEntityIds.length > 0) {
          const [entRes, emailRes, phoneRes] = await Promise.all([
            supabase.from("anew_entities").select("id, display_name").in("id", allEntityIds),
            supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", allEntityIds).eq("is_primary", true),
            supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", allEntityIds).eq("is_primary", true),
          ]);
          const nameMap: Record<string, string> = {};
          const emailMap: Record<string, string> = {};
          const phoneMap: Record<string, string> = {};
          (entRes.data || []).forEach((e: any) => { nameMap[e.id] = e.display_name; });
          (emailRes.data || []).forEach((e: any) => { emailMap[e.entity_id] = e.email; });
          (phoneRes.data || []).forEach((e: any) => { phoneMap[e.entity_id] = e.phone_number; });
          
          // Map deal entity data to proposal keys using deal_id
          proposalsData.forEach((p: any) => {
            if (!p.entity_id && p.deal_id && dealEntityMap[p.deal_id]) {
              const entityId = dealEntityMap[p.deal_id];
              if (nameMap[entityId]) nameMap[`deal:${p.id}`] = nameMap[entityId];
              if (emailMap[entityId]) emailMap[`deal:${p.id}`] = emailMap[entityId];
              if (phoneMap[entityId]) phoneMap[`deal:${p.id}`] = phoneMap[entityId];
            }
          });
          
          setEntityNames(nameMap);
          setEntityEmails(emailMap);
          setEntityPhones(phoneMap);
          setDealEntityIds(dealEntityMap);
        } else {
          setEntityNames({});
          setEntityEmails({});
          setEntityPhones({});
          setDealEntityIds({});
        }
      }

      const uniqueProposals = Array.from(
        new Map((proposalsData || []).map((proposal) => [proposal.id, proposal])).values()
      );

      setProposals(uniqueProposals);
      setDeals(dealsData);
    } catch (error: any) {
      toast({
        title: t('proposals.toast.loadError'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [
    loadWorkflowStages,
    loadProposalTemplates,
    toast,
    t,
    activeCompany?.id,
    isSystemAdmin,
    permissionsLoading,
    scopeLoading,
    getPermissionScope,
    teamMemberIds,
  ]);

  useEffect(() => {
    if (!permissionsLoading && !scopeLoading) {
      loadData();
    }
  }, [loadData, permissionsLoading, scopeLoading]);

  const handleViewDetails = useCallback((proposal: Proposal) => {
    setSelectedProposal(proposal);
    setDetailsOpen(true);
  }, []);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || selectedProposal) return;

    let cancelled = false;
    const openFromQuery = async () => {
      const found = proposals.find(p => p.id === openId);
      if (found) {
        if (!cancelled) handleViewDetails(found);
        return;
      }

      const { data: fetchedProposal } = await (supabase as any)
        .from("proposals")
        .select("*")
        .eq("id", openId)
        .eq("organization_id", activeCompany?.id)
        .maybeSingle();

      if (!cancelled && fetchedProposal) {
        handleViewDetails(fetchedProposal as Proposal);
      }
    };

    void openFromQuery();
    return () => { cancelled = true; };
  }, [searchParams, proposals, selectedProposal, handleViewDetails, activeCompany?.id]);

  useEffect(() => {
    if (workflowStages.length > 0 && !formData.stage_id) {
      setFormData(prev => ({ ...prev, stage_id: workflowStages[0].id }));
    }
  }, [workflowStages, formData.stage_id]);

  // Resolve commercial names.
  // comercialNamesMap is included in deps so the effect re-evaluates which IDs
  // are still missing after each resolution batch.  The cancelled flag prevents
  // a stale async call from overwriting a later result.
  useEffect(() => {
    const ids = new Set<string>();
    proposals.forEach(p => { const a = (p as any).assigned_to; if (a) ids.add(a); });
    const missing = Array.from(ids).filter(id => !comercialNamesMap[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("anew_users").select("id, name").in("id", missing);
      if (cancelled) return;
      if (data) setComercialNamesMap(prev => {
        const next = { ...prev };
        (data as any[]).forEach(u => { next[u.id] = u.name || "Utilizador"; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [proposals, comercialNamesMap]);

  const handleEdit = async (proposal: Proposal) => {
    const editStageName = getStageName(proposal);
    setEditingProposalIsSent(editStageName === "sent" || editStageName === "enviada");
    setEditingId(proposal.id);
    const currentStageId = proposal.stage_id || proposal.proposal_workflow_stages?.id || workflowStages[0]?.id || "";
    setOriginalStageId(currentStageId);
    setFormData({
      title: proposal.title,
      description: proposal.description || "",
      value: proposal.value.toString(),
      deal_id: proposal.deal_id || "",
      valid_until: proposal.valid_until || "",
      notes: proposal.notes || "",
      stage_id: currentStageId,
      template_id: (proposal as any).template_id || "",
      assigned_to: (proposal as any).assigned_to || "",
    });
    if (proposal.deal_id && proposal.deals) {
      setSelectedDeal({
        id: proposal.deals.id,
        title: proposal.deals.title,
        probability: (proposal.deals as any).probability || null,
      });
      setSelectedEntity(null);
    } else {
      setSelectedDeal(null);
      // Load entity if proposal has direct entity_id (no deal)
      const propEntityId = (proposal as any).entity_id;
      if (propEntityId) {
        const [entRes, emailRes, phoneRes] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name, type").eq("id", propEntityId).maybeSingle(),
          supabase.from("anew_entity_emails").select("email").eq("entity_id", propEntityId).eq("is_primary", true).maybeSingle(),
          supabase.from("anew_entity_phones").select("phone_number").eq("entity_id", propEntityId).eq("is_primary", true).maybeSingle(),
        ]);
        if (entRes.data) {
          setSelectedEntity({
            type: entRes.data.type === "client" ? "client" : "lead",
            id: propEntityId,
            entityId: propEntityId,
            name: entRes.data.display_name,
            email: emailRes.data?.email,
            phone: phoneRes.data?.phone_number,
          });
        } else {
          setSelectedEntity(null);
        }
      } else {
        setSelectedEntity(null);
      }
    }
    setDealSearch("");
    setQuoteSearch("");

    // Fetch quotes and proposal items in parallel — no data dependency between them.
    const [quotesRes, itemsRes] = await Promise.all([
      supabase
        .from("quotes")
        .select("id, quote_number, total, estado")
        .eq("proposal_id", proposal.id)
        .eq("organization_id", activeCompany?.id),
      supabase
        .from("proposal_items")
        .select("id, description, quantity, unit_price, vat_rate, sort_order")
        .eq("proposal_id", proposal.id)
        .eq("organization_id", activeCompany?.id)
        .order("sort_order"),
    ]);

    setSelectedQuotes(
      (quotesRes.data || []).map(q => ({
        id: q.id,
        quote_number: q.quote_number,
        total: q.total,
        estado: q.estado,
      }))
    );

    setProposalItems(
      (itemsRes.data || []).map(item => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        vat_rate: Number(item.vat_rate),
        sort_order: item.sort_order || 0,
      }))
    );

    setOpen(true);
  };

  const openProposalById = async (proposalId?: string | null) => {
    if (!proposalId) return;

    const found = proposals.find(p => p.id === proposalId);
    if (found) {
      handleViewDetails(found);
      return;
    }

    const { data: fetchedProposal } = await (supabase as any)
      .from("proposals")
      .select("*")
      .eq("id", proposalId)
      .eq("organization_id", activeCompany?.id)
      .maybeSingle();

    if (fetchedProposal) {
      handleViewDetails(fetchedProposal as Proposal);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      const businessUserIdDel = await resolveCurrentBusinessUserId();
      if (!businessUserIdDel) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserIdDel, p_source: 'ui' });
      const { error } = await (supabase as any).rpc("soft_delete_business_entity", { p_kind: "proposal", p_id: deletingId });
      if (error) throw error;
      toast({ title: t('proposals.toast.deleteSuccess'), description: t('proposals.toast.movedToTrashDesc') });
      loadData();
    } catch (error: any) {
      toast({ title: t('proposals.toast.deleteError'), description: error.message, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const requestPortalPublish = (proposal: Proposal, forceNewPassword: boolean) => {
    // Accepted proposals with pending changes should warn the user that
    // republication will invalidate the previous signature.
    if (proposal.status === "accepted" && proposal.has_unpublished_changes) {
      setPortalReopenConfirm({ proposal, forceNewPassword });
      return;
    }
    generatePortalAccess("proposal", proposal.id, forceNewPassword);
  };

  const handlePortalReopenConfirm = () => {
    if (!portalReopenConfirm) return;
    const { proposal, forceNewPassword } = portalReopenConfirm;
    setPortalReopenConfirm(null);
    generatePortalAccess("proposal", proposal.id, forceNewPassword);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredProposals.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      const businessUserIdBulkDel = await resolveCurrentBusinessUserId();
      if (!businessUserIdBulkDel) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      for (const id of selectedIds) {
        await supabase.rpc('set_audit_context', { p_user_id: businessUserIdBulkDel, p_source: 'ui' });
        const { error: delErr } = await (supabase as any).rpc('soft_delete_business_entity', { p_kind: 'proposal', p_id: id });
        if (delErr) throw delErr;
      }
      toast({ title: t('common.deleteSuccess'), description: `${selectedIds.length} propostas movidas para o lixo.` });
      setSelectedIds([]);
      setBulkDeleteDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: t('proposals.toast.deleteError'), description: error.message, variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkNewStatus) return;
    if (!activeCompany?.id) return;
    setIsBulkStatusChanging(true);
    try {
      const businessUserIdBulkSt = await resolveCurrentBusinessUserId();
      if (!businessUserIdBulkSt) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserIdBulkSt, p_source: 'ui' });
      const { error } = await supabase
        .from("proposals")
        .update({ stage_id: bulkNewStatus })
        .in("id", selectedIds)
        .eq("organization_id", activeCompany.id);
      if (error) throw error;
      toast({ title: t('common.statusUpdated'), description: `${selectedIds.length} propostas atualizadas.` });
      setSelectedIds([]);
      setBulkStatusDialogOpen(false);
      setBulkNewStatus("");
      loadData();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setIsBulkStatusChanging(false);
    }
  };

  // Bulk status change para uma stage `is_lost`: em vez de gravar direto,
  // pede o motivo (uma vez) e aplica-o a todas as propostas selecionadas,
  // reutilizando `rejectProposalCore` — cada proposta herda a mesma cascata
  // para os seus orçamentos. Loop sequencial, seguindo o padrão já usado em
  // `handleBulkDelete`.
  const handleBulkRejectConfirm = async (reason: ProposalRejectionDecision) => {
    if (!bulkNewStatus) return;
    setIsBulkStatusChanging(true);
    try {
      const targets = filteredProposals.filter(p => selectedIds.includes(p.id));
      let anyWorkflowFailed = false;
      for (const proposal of targets) {
        const { workflowFailed } = await rejectProposalCore(proposal, reason, bulkNewStatus);
        if (workflowFailed) anyWorkflowFailed = true;
      }
      toast({
        title: t('common.statusUpdated'),
        description: anyWorkflowFailed ? t('proposals.toast.workflowWarning') : `${targets.length} propostas atualizadas.`,
      });
      setSelectedIds([]);
      setBulkStatusDialogOpen(false);
      setBulkRejectDialogOpen(false);
      setBulkNewStatus("");
      loadData();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } finally {
      setIsBulkStatusChanging(false);
    }
  };

  // Bulk email: reuses the same send-proposal-email edge function as
  // SendProposalDialog (single-row send), applied sequentially to every
  // selected proposal that has a resolvable recipient email. Kept simple on
  // purpose — no per-proposal message editing UI for the bulk case.
  const handleBulkSendEmail = async () => {
    if (selectedIds.length === 0) return;
    setBulkEmailSending(true);
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    try {
      for (const id of selectedIds) {
        const proposal = proposals.find(p => p.id === id);
        if (!proposal) { failCount++; continue; }
        const directEntityId = (proposal as any).entity_id as string | null;
        const eid = directEntityId || (proposal.deal_id ? dealEntityIds[proposal.deal_id] : null);
        const email = (eid ? entityEmails[eid] : entityEmails[`deal:${id}`]) || "";
        const name = (eid ? entityNames[eid] : entityNames[`deal:${id}`]) || "";
        if (!email) { skipCount++; continue; }
        try {
          const { error } = await supabase.functions.invoke("send-proposal-email", {
            body: {
              proposal_id: id,
              recipient_email: email,
              recipient_name: name,
              recipients: [email],
              cc: [],
              subject: `Proposta ${proposal.title}`,
              message: `Olá${name ? ` ${name}` : ""},\n\nSegue a proposta "${proposal.title}" para a sua análise.\n\nCumprimentos`,
            },
          });
          if (error) throw error;
          successCount++;
        } catch (sendError) {
          console.error(`Error sending proposal ${id}:`, sendError);
          failCount++;
        }
      }
      toast({
        title: "Envio em lote concluído",
        description: `${successCount} enviada(s), ${skipCount} sem email, ${failCount} com erro.`,
        variant: failCount > 0 ? "destructive" : undefined,
      });
      setSelectedIds([]);
      loadData();
    } finally {
      setBulkEmailSending(false);
    }
  };

  // Bulk PDF export: reuses generateProposalPdfBlob (same as the row-level
  // "Descarregar PDF" dropdown item) and triggers a browser download per
  // selected proposal, sequentially to avoid overwhelming the download manager.
  const handleBulkExportPdf = async () => {
    if (selectedIds.length === 0) return;
    setBulkPdfExporting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      toast({ title: "A gerar PDFs…", description: "Pode demorar alguns segundos." });
      for (const id of selectedIds) {
        try {
          const { blob, fileName } = await generateProposalPdfBlob(id);
          downloadBlob(blob, fileName);
          successCount++;
        } catch (exportError) {
          console.error(`Error exporting PDF for proposal ${id}:`, exportError);
          failCount++;
        }
      }
      toast({
        title: "Exportação concluída",
        description: `${successCount} PDF(s) gerado(s)${failCount > 0 ? `, ${failCount} com erro` : ""}.`,
        variant: failCount > 0 ? "destructive" : undefined,
      });
    } finally {
      setBulkPdfExporting(false);
    }
  };

  const handleDuplicate = async (proposalId: string) => {
    setDuplicatingProposalId(proposalId);
    try {
      const { data, error } = await supabase.rpc('duplicate_proposal', {
        source_proposal_id: proposalId,
        new_title: null
      });
      if (error) throw error;
      toast({ title: t('proposals.toast.duplicateSuccess'), description: t('proposals.toast.duplicateSuccessDesc') });
      loadData();
    } catch (error: any) {
      toast({ title: t('proposals.toast.duplicateError'), description: error.message, variant: "destructive" });
    } finally {
      setDuplicatingProposalId(null);
    }
  };

  // Recursive top-ancestor walk via the shared resolveRootOrgIdLogic helper (same
  // as AnewLeads.tsx) — replaces the previous one-hop activeCompany.parent_id,
  // which under-resolved root_organization_id for orgs more than one level below
  // the true root. NOTE: QuoteBuilder.tsx/ClientContracts.tsx compute the same
  // concept via their own inline walk that filters relationship_type to
  // ('PARENT_OF','parent_of','parent_child') and has no cycle guard — unlike
  // this unfiltered, cycle-capped version. The three implementations can
  // disagree on edge cases; unifying them is a tracked follow-up, not done here.
  const resolveRootOrgId = useCallback(async (orgId: string): Promise<string> => {
    return resolveRootOrgIdLogic(orgId, async (childOrgId) => {
      const { data } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", childOrgId)
        .maybeSingle();
      return data?.parent_org_id ?? null;
    });
  }, []);

  /**
   * Save proposal as draft (if new) and open the full Quote Builder pre-linked.
   * Used by the "Criar orçamento aqui" button.
   */
  const handleCreateQuoteForProposal = async () => {
    if (savingProposal || submitLockRef.current) return;

    if (editingId) {
      setOpen(false);
      navigate(`/quotes?new=1&proposal_id=${editingId}${formData.deal_id ? `&deal_id=${formData.deal_id}` : ""}`);
      return;
    }

    if (!formData.title.trim()) {
      toast({ title: "Título obrigatório", description: "Indica um título para a proposta antes de criar o orçamento.", variant: "destructive" });
      return;
    }
    if (!activeCompany?.id) {
      toast({ title: "Empresa ativa não definida", variant: "destructive" });
      return;
    }

    try {
      submitLockRef.current = true;
      setSavingProposal(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" });
        return;
      }

      const stage = workflowStages.find(s => s.id === formData.stage_id);
      const defaultTemplate = proposalTemplates.find(tt => tt.is_default);
      const templateId = formData.template_id || defaultTemplate?.id || null;
      const probability = selectedDeal?.probability ?? 50;
      const proposalEntityId = !formData.deal_id ? (selectedEntity?.entityId || null) : (selectedDeal?.entity_id || null);
      const rootOrgId = await resolveRootOrgId(activeCompany.id);

      const proposalData = {
        title: formData.title,
        description: formData.description || null,
        value: 0,
        probability,
        deal_id: formData.deal_id || null,
        entity_id: proposalEntityId,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        stage_id: formData.stage_id || null,
        status: stage?.name || 'draft',
        organization_id: activeCompany.id,
        root_organization_id: rootOrgId,
        template_id: templateId,
        assigned_to: formData.assigned_to || null,
      };


      await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
      const { data, error } = await supabase
        .from("proposals")
        .insert({ ...proposalData, created_by: businessUserId })
        .select("id")
        .single();
      if (error) throw error;

      setOpen(false);
      resetForm();
      loadData();
      navigate(`/quotes?new=1&proposal_id=${data.id}${formData.deal_id ? `&deal_id=${formData.deal_id}` : ""}`);
    } catch (err: any) {
      toast({ title: t('proposals.toast.createError'), description: err.message, variant: "destructive" });
    } finally {
      submitLockRef.current = false;
      setSavingProposal(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || savingProposal) return;

    // Pre-validation: block submit if any inline quote has lines but ALL of them are invalid (qt <= 0).
    // Prevents the silent skip that previously allowed proposals to be created without their quote.
    const invalidQuotes = inlineQuotes
      .map((iq) => ({
        title: iq.title,
        totalLines: (iq.lines || []).length,
        invalidLines: (iq.lines || []).filter(l => !l.qt || l.qt <= 0).length,
      }))
      .filter(q => q.totalLines > 0 && q.invalidLines === q.totalLines);

    if (invalidQuotes.length > 0) {
      console.warn('[Proposals.submit] blocked — inline quotes with no valid lines', invalidQuotes);
      toast({
        title: "Orçamento sem linhas válidas",
        description: `O orçamento "${invalidQuotes[0].title}" não tem nenhuma linha com quantidade > 0. Corrija ou remova antes de gravar.`,
        variant: "destructive",
      });
      return;
    }

    const quotesWithNullTotal = selectedQuotes.filter(q => q.total == null);
    if (quotesWithNullTotal.length > 0 && !nullTotalConfirmedRef.current) {
      setNullTotalQuoteNames(quotesWithNullTotal.map(q => q.quote_number || q.id.slice(0, 8)));
      setShowNullTotalDialog(true);
      return;
    }
    nullTotalConfirmedRef.current = false;

    const quotesTotal = selectedQuotes.reduce((sum, q) => sum + (q.total || 0), 0);
    const inlineQuotesTotal = inlineQuotes.reduce((sum, q) => sum + calcInlineQuoteTotal(q), 0);
    const itemsTotal = calculateProposalItemsTotal(proposalItems);
    const calculatedValue = quotesTotal + inlineQuotesTotal + itemsTotal;
    const value = (selectedQuotes.length > 0 || inlineQuotes.length > 0 || proposalItems.length > 0) 
      ? calculatedValue 
      : parseFloat(formData.value) || 0;
    
    const validation = proposalSchema.safeParse({
      title: formData.title,
      description: formData.description,
      value,
      notes: formData.notes,
      valid_until: formData.valid_until,
    });

    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((error) => {
        if (error.path[0]) {
          errors[error.path[0].toString()] = error.message;
        }
      });
      setFieldErrors(errors);
      toast({ title: t('proposals.toast.validationError'), description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    setFieldErrors({});

    try {
      submitLockRef.current = true;
      setSavingProposal(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      if (!activeCompany?.id) throw new Error("Empresa ativa não definida");

      const stage = workflowStages.find(s => s.id === formData.stage_id);
      const probability = selectedDeal?.probability ?? 50;

      const defaultTemplate = proposalTemplates.find(t => t.is_default);
      const templateId = formData.template_id || defaultTemplate?.id || null;
      const rootOrgId = await resolveRootOrgId(activeCompany.id);

      const proposalData = {
        title: formData.title,
        description: formData.description || null,
        value,
        probability,
        deal_id: formData.deal_id || null,
        entity_id: !formData.deal_id ? (selectedEntity?.entityId || null) : null,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        stage_id: formData.stage_id || null,
        status: stage?.name || 'draft',
        organization_id: activeCompany.id,
        root_organization_id: rootOrgId,
        template_id: templateId,
        assigned_to: formData.assigned_to || null,
      };

      let savedProposalId: string | null = null;
      // Hoisted here so it is accessible both inside the if (savedProposalId) block
      // and in the post-block check below — avoids the previous @ts-ignore workaround.
      const skippedQuotes: Array<{ title: string; reason: string }> = [];

      // Resolve business user id up-front: required for inline quote inserts in
      // both edit and create paths (identity boundary — quotes.created_by is a
      // business id, not auth.uid()).
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        return;
      }

      // Pre-compute inline quotes payload up-front — needed for the RPC call either way
      // (create or update). Preserves the exact same skip logic: quotes whose lines are
      // all qt <= 0 are dropped and reported to the user via skippedQuotes/toast below.
      const inlineQuotesPayload: any[] = [];
      for (const iq of inlineQuotes) {
        const validLines = (iq.lines || []).filter(l => l.qt > 0);
        if (validLines.length === 0) {
          const reason = (iq.lines || []).length === 0
            ? "sem linhas"
            : "todas as linhas com quantidade 0";
          console.warn('[Proposals.submit] skipping inline quote', { title: iq.title, reason, totalLines: (iq.lines || []).length });
          skippedQuotes.push({ title: iq.title || "(sem título)", reason });
          continue;
        }

        const linesToInsert = validLines.map(l => {
          const custoUnit = l.custo_material_unit + l.custo_mao_obra_unit;
          const isManual = custoUnit === 0 && l.retail_price_unit !== undefined && l.retail_price_unit !== null;
          const unitPrice = isManual ? (l.retail_price_unit || 0) : custoUnit * (1 + l.margem_percent / 100) * (1 + l.int_percent / 100);
          const precoSemIvaBase = unitPrice * l.qt;
          const lineDiscount = l.discount_percent || 0;
          const precoSemIva = precoSemIvaBase * (1 - lineDiscount / 100);
          const ivaValor = precoSemIva * (l.iva_percent / 100);
          const totalComIva = precoSemIva + ivaValor;
          const totalComDesconto = totalComIva * (1 - iq.desconto_global_percent / 100);

          return {
            catalog_item_id: l.catalog_item_id || null,
            product_id: l.product_id || null,
            service_id: l.service_id || null,
            selected_attributes: l.selected_attributes || {},
            descricao_snapshot: l.descricao_snapshot,
            qt: l.qt,
            custo_material_unit: l.custo_material_unit,
            custo_mao_obra_unit: l.custo_mao_obra_unit,
            margem_percent: l.margem_percent,
            iva_percent: l.iva_percent,
            int_percent: l.int_percent,
            discount_percent: lineDiscount,
            total_sem_iva: precoSemIva,
            total_com_iva: totalComIva,
            total_com_desconto: totalComDesconto,
            ordem: l.ordem,
            section_name: l.section_name || "Geral",
            unidade: l.unidade || null,
            item_description: l.item_description || null,
            cost_price: l.cost_price || 0,
          };
        });

        inlineQuotesPayload.push({
          title: iq.title || null,
          obra_notas: iq.obra_notas || null,
          modelo_base: iq.modelo_base && iq.modelo_base !== "0" ? iq.modelo_base : "default",
          desconto_global_percent: iq.desconto_global_percent,
          validade_dias: iq.validade_dias,
          iva_rate: iq.iva_rate,
          client_notes: iq.client_notes || null,
          conditions: iq.conditions || null,
          lines: linesToInsert,
        });
      }

      const selectedQuoteIds = selectedQuotes.map(q => q.id);
      const proposalItemsPayload = proposalItems.map((item, index) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
        sort_order: index,
      }));

      // Same cascade used for the inline-quote entity below — passed explicitly to the RPC
      // because it is NOT the same cascade as proposals.entity_id.
      const quoteEntityId = selectedDeal?.entity_id || selectedEntity?.entityId || null;

      let savedProposal: any = null;
      if (editingId) {
        const { data, error } = await supabase.rpc('rpc_update_proposal', {
          p_id: editingId,
          p_proposal_data: proposalData,
          p_selected_quote_ids: selectedQuoteIds,
          p_inline_quotes: inlineQuotesPayload,
          p_proposal_items: proposalItemsPayload,
          p_quote_entity_id: quoteEntityId,
        });
        if (error) throw error;
        savedProposal = data;
        savedProposalId = editingId;

        let workflowFailed = false;
        if (formData.stage_id && originalStageId && formData.stage_id !== originalStageId) {
          try {
            const { error: workflowError } = await supabase.functions.invoke('execute-workflow', {
              body: {
                source_entity: 'proposal',
                entity_id: editingId,
                new_stage_id: formData.stage_id,
                old_stage_id: originalStageId,
                organization_id: activeCompany?.id,
                triggered_by: user.id,
              }
            });
            if (workflowError) throw workflowError;
          } catch (workflowError) {
            console.error("Workflow execution error:", workflowError);
            workflowFailed = true;
          }
        }
        toast({
          title: t('proposals.toast.updateSuccess'),
          description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
        });
      } else {
        const { data, error } = await supabase.rpc('rpc_create_proposal', {
          p_proposal_data: proposalData,
          p_selected_quote_ids: selectedQuoteIds,
          p_inline_quotes: inlineQuotesPayload,
          p_proposal_items: proposalItemsPayload,
          p_quote_entity_id: quoteEntityId,
        });
        if (error) throw error;
        savedProposal = data;
        savedProposalId = data.id;
        toast({ title: t('proposals.toast.createSuccess') });
      }

      if (savedProposalId) {
        const proposalEntityId = selectedDeal?.entity_id || selectedEntity?.entityId || savedProposal?.entity_id || proposalData.entity_id || null;
        await resolveSendProposalAlerts(proposalEntityId, activeCompany.id);
      }

      // If any inline quote was skipped, warn the user explicitly and keep the dialog open
      // so they can fix the offending lines and re-submit.
      if (skippedQuotes.length > 0) {
        const list = skippedQuotes.map(s => `• "${s.title}" — ${s.reason}`).join("\n");
        console.warn('[Proposals.submit] some inline quotes were not persisted', skippedQuotes);
        toast({
          title: `${skippedQuotes.length} orçamento(s) não gravado(s)`,
          description: `A proposta foi gravada mas o(s) seguinte(s) orçamento(s) foi(ram) ignorado(s):\n${list}\n\nCorrija e grave novamente.`,
          variant: "destructive",
        });
        loadData();
        // Don't close the dialog — let user fix and re-save.
        return;
      }

      setOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({ title: editingId ? t('proposals.toast.updateError') : t('proposals.toast.createError'), description: error.message, variant: "destructive" });
    } finally {
      submitLockRef.current = false;
      setSavingProposal(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setOriginalStageId(null);
    setEditingProposalIsSent(false);
    setFormData({ title: "", description: "", value: "", deal_id: "", valid_until: "", notes: "", stage_id: workflowStages[0]?.id || "", template_id: "", assigned_to: "" });
    setSelectedDeal(null);
    setSelectedEntity(null);
    setDealSearch("");
    setDealSearchResults([]);
    setSelectedQuotes([]);
    setQuoteSearch("");
    setQuoteSearchResults([]);
    setProposalItems([]);
    setInlineQuotes([]);
    setFieldErrors({});
  };

  const handleRenewValidity = async () => {
    if (!renewProposalId || !renewDate) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: 'Utilizador não identificado', variant: 'destructive' });
        return;
      }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
      const { error } = await supabase
        .from("proposals")
        .update({ valid_until: renewDate })
        .eq("id", renewProposalId);
      if (error) throw error;
      toast({ title: "Validade renovada com sucesso" });
      setRenewDialogOpen(false);
      setRenewProposalId(null);
      setRenewDate("");
      loadData();
    } catch (error: any) {
      toast({ title: "Erro ao renovar validade", description: error.message, variant: "destructive" });
    }
  };

  const openRenewDialog = (proposalId: string) => {
    // Default to 30 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    setRenewProposalId(proposalId);
    setRenewDate(format(defaultDate, "yyyy-MM-dd"));
    setRenewDialogOpen(true);
  };


  const handleMarkAsSent = async (proposal: Proposal) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const sentStage = workflowStages.find(s => s.name === "sent" || s.name === "enviada");
      if (!sentStage) { toast({ title: "Erro", description: "Estágio 'Enviada' não encontrado", variant: "destructive" }); return; }
      const oldStageId = proposal.stage_id;
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
      const { error } = await supabase
        .from("proposals")
        .update({ stage_id: sentStage.id, status: "sent", sent_at: new Date().toISOString() })
        .eq("id", proposal.id);
      if (error) throw error;
      let workflowFailed = false;
      try {
        const { error: workflowError } = await supabase.functions.invoke('execute-workflow', {
          body: { source_entity: 'proposal', entity_id: proposal.id, new_stage_id: sentStage.id, old_stage_id: oldStageId, organization_id: activeCompany?.id, triggered_by: user.id }
        });
        if (workflowError) throw workflowError;
      } catch (workflowError) {
        console.error("Workflow execution error:", workflowError);
        workflowFailed = true;
      }
      toast({
        title: "Proposta marcada como enviada",
        description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
      });
      loadData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleAcceptProposal = async (proposalToAccept?: Proposal) => {
    if (acceptProposalLockRef.current) return;
    const targetProposal = proposalToAccept ?? selectedProposal;
    if (!targetProposal) return;
    acceptProposalLockRef.current = true;
    setIsAcceptingProposal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const acceptedStage = workflowStages.find(s => s.name === "accepted" || s.name === "aceite");
      if (!acceptedStage) { toast({ title: "Erro", description: "Estágio 'Aceite' não encontrado", variant: "destructive" }); return; }
      const oldStageId = targetProposal.stage_id;
      const businessUserIdAccept = await resolveCurrentBusinessUserId();
      if (!businessUserIdAccept) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserIdAccept, p_source: 'ui' });
      const { error } = await supabase.from("proposals").update({ stage_id: acceptedStage.id, status: "accepted", accepted_at: new Date().toISOString() }).eq("id", targetProposal.id);
      if (error) throw error;
      let workflowFailed = false;
      try {
        const { error: workflowError } = await supabase.functions.invoke('execute-workflow', {
          body: { source_entity: 'proposal', entity_id: targetProposal.id, new_stage_id: acceptedStage.id, old_stage_id: oldStageId, organization_id: activeCompany?.id, triggered_by: user.id }
        });
        if (workflowError) throw workflowError;
      } catch (workflowError) {
        console.error("Workflow execution error:", workflowError);
        workflowFailed = true;
      }
      toast({
        title: "Proposta aceite com sucesso",
        description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
      });
      setDetailsOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      acceptProposalLockRef.current = false;
      setIsAcceptingProposal(false);
    }
  };

  /**
   * Núcleo da rejeição de uma proposta: atualiza stage/status/motivo na
   * proposta e faz cascata do MESMO motivo para os orçamentos (`quotes`)
   * ligados que ainda estejam em rascunho/enviado. Orçamentos já aceites ou
   * já rejeitados não são tocados. Não mostra toast nem fecha diálogos —
   * cada caminho de chamada (dropdown, drag no kanban, bulk) decide isso.
   * `stageIdOverride` permite indicar o stage `is_lost` exato de destino
   * (ex.: drag-and-drop no kanban ou bulk); sem isso, resolve o stage
   * "Rejeitada" pelo nome, como sempre fez.
   */
  const rejectProposalCore = async (
    proposal: Proposal,
    reason: ProposalRejectionDecision,
    stageIdOverride?: string,
  ): Promise<{ workflowFailed: boolean }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const rejectedStage = stageIdOverride
      ? workflowStages.find(s => s.id === stageIdOverride)
      : workflowStages.find(s => s.name === "rejected" || s.name === "rejeitada");
    if (!rejectedStage) throw new Error("Estágio 'Rejeitada' não encontrado");
    const oldStageId = proposal.stage_id;
    const businessUserIdReject = await resolveCurrentBusinessUserId();
    if (!businessUserIdReject) throw new Error("Utilizador não identificado");
    await supabase.rpc('set_audit_context', { p_user_id: businessUserIdReject, p_source: 'ui' });
    const { error } = await supabase.from("proposals").update({
      stage_id: rejectedStage.id,
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason_id: reason.reasonId,
      rejection_reason_code: reason.code,
      rejection_reason: reason.label,
      rejection_notes: reason.notes,
    }).eq("id", proposal.id);
    if (error) throw error;

    // Cascata: orçamentos ligados a esta proposta que ainda estejam em
    // rascunho/enviado herdam o mesmo motivo e passam a rejeitado. Um erro
    // aqui não desfaz a rejeição da proposta (já persistida) — só é
    // registado, para não bloquear o fluxo principal por uma falha lateral.
    const { error: quotesError } = await supabase
      .from("quotes")
      .update({ estado: "rejeitado", lost_reason: reason.label } as any)
      .eq("proposal_id", proposal.id)
      .in("estado", ["rascunho", "enviado"]);
    if (quotesError) {
      console.error("Erro ao rejeitar orçamentos ligados à proposta:", quotesError);
    }

    let workflowFailed = false;
    try {
      const { error: workflowError } = await supabase.functions.invoke('execute-workflow', {
        body: { source_entity: 'proposal', entity_id: proposal.id, new_stage_id: rejectedStage.id, old_stage_id: oldStageId, organization_id: activeCompany?.id, triggered_by: user.id }
      });
      if (workflowError) throw workflowError;
    } catch (workflowError) {
      console.error("Workflow execution error:", workflowError);
      workflowFailed = true;
    }
    return { workflowFailed };
  };

  const handleRejectProposal = async (reason: ProposalRejectionDecision) => {
    if (!selectedProposal) return;
    try {
      const { workflowFailed } = await rejectProposalCore(selectedProposal, reason);
      toast({
        title: "Proposta recusada",
        description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
      });
      setRejectReasonDialogOpen(false);
      setDetailsOpen(false);
      loadData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleReopenProposal = async (proposal: Proposal) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const draftStage = workflowStages.find(s => s.name === "draft" || s.name === "rascunho");
      if (!draftStage) { toast({ title: "Erro", description: "Estágio 'Rascunho' não encontrado", variant: "destructive" }); return; }
      const oldStageId = proposal.stage_id;
      const businessUserIdReopen = await resolveCurrentBusinessUserId();
      if (!businessUserIdReopen) { toast({ title: 'Utilizador não identificado', variant: 'destructive' }); return; }
      await supabase.rpc('set_audit_context', { p_user_id: businessUserIdReopen, p_source: 'ui' });
      const { error: reopenError } = await supabase.from("proposals").update({
        stage_id: draftStage.id,
        status: "draft",
        accepted_at: null,
        rejected_at: null,
        rejection_reason: null,
        rejection_reason_id: null,
        rejection_reason_code: null,
        rejection_notes: null,
      }).eq("id", proposal.id);
      if (reopenError) throw reopenError;
      let workflowFailed = false;
      try {
        const { error: workflowError } = await supabase.functions.invoke('execute-workflow', {
          body: { source_entity: 'proposal', entity_id: proposal.id, new_stage_id: draftStage.id, old_stage_id: oldStageId, organization_id: activeCompany?.id, triggered_by: user.id }
        });
        if (workflowError) throw workflowError;
      } catch (workflowError) {
        console.error("Workflow execution error:", workflowError);
        workflowFailed = true;
      }
      toast({
        title: "Proposta reaberta",
        description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
      });
      loadData();
    } catch (error: any) {
      toast({ title: "Erro ao reabrir proposta", description: error.message, variant: "destructive" });
    }
  };

  const getProposalStage = useCallback((proposal: Proposal): WorkflowStage | null => {
    if (proposal.proposal_workflow_stages) return proposal.proposal_workflow_stages;
    return workflowStages.find(s => s.name === proposal.status) || null;
  }, [workflowStages]);

  const getStageBadge = (proposal: Proposal) => {
    const stage = getProposalStage(proposal);
    if (!stage) return <Badge variant="outline">{proposal.status}</Badge>;
    return (
      <Badge style={{ backgroundColor: stage.color + '20', color: stage.color, borderColor: stage.color }}>
        {stage.label}
      </Badge>
    );
  };

  // Helper to get stage name — memoised so useMemo dep arrays are stable.
  const getStageName = useCallback((proposal: Proposal): string => {
    const stage = getProposalStage(proposal);
    return stage?.name || proposal.status || "";
  }, [getProposalStage]);

  // A linked contract is only viewable once it has actually been signed.
  // Matches the "signed" / "active" convention used throughout ClientContracts.tsx.
  const isContractSigned = (contractId?: string | null) =>
    !!contractId && (contractStatuses[contractId] === "signed" || contractStatuses[contractId] === "active");

  // Opens the contract's real PDF. Navigates to ClientContracts.tsx, which
  // generates the PDF and shows it inline (iframe in a dialog) — no
  // window.open involved, so it can never be blocked as a pop-up.
  const openContractPdf = (contractId?: string | null) => {
    if (!isContractSigned(contractId)) return;
    navigate(`/client-contracts?open=${contractId}&viewPdf=1`);
  };

  // Filter and sort
  const filteredProposals = useMemo(() => {
    const now = new Date();
    return proposals
      .filter(proposal => {
        // "Só os meus" — filter to proposals assigned to the current user.
        // scopeAnewUserId is the anew_users.id of the current user.
        if (onlyMine && scopeAnewUserId) {
          if ((proposal as any).assigned_to !== scopeAnewUserId) return false;
        }

        if (statusFilter !== "all") {
          const stage = getProposalStage(proposal);
          if (stage?.id !== statusFilter && proposal.status !== statusFilter) return false;
        }

        if (noResponseFilter) {
          const sn = getStageName(proposal);
          if (!((sn === "sent" || sn === "enviada") && differenceInDays(now, parseISO(proposal.created_at)) > 5)) return false;
        }

        if (expiredFilter) {
          if (!(proposal.valid_until && isPast(parseISO(proposal.valid_until)))) return false;
        }

        if (noValidityFilter) {
          if (proposal.valid_until) return false;
        }

        const term = debouncedSearch.trim();
        const searchLower = term.toLowerCase();
        const proposalDate = new Date(proposal.created_at);
        const matchesDateFrom = !dateFrom || proposalDate >= startOfDay(dateFrom);
        const matchesDateTo = !dateTo || proposalDate <= endOfDay(dateTo);

        // Search: requires >= 3 chars; matches title, deal title, or entity (name/email/phone/NIF)
        let matchesSearch = true;
        if (term.length >= 3) {
          const titleHit = proposal.title?.toLowerCase().includes(searchLower) ||
            proposal.deals?.title?.toLowerCase().includes(searchLower);
          const entityHit = searchEntityIdSet
            ? ((proposal as any).entity_id && searchEntityIdSet.has((proposal as any).entity_id))
            : false;
          matchesSearch = !!(titleHit || entityHit);
        }

        if (comercialFilter !== "all") {
          if (comercialFilter === "none") {
            if ((proposal as any).assigned_to) return false;
          } else if ((proposal as any).assigned_to !== comercialFilter) return false;
        }
        return matchesSearch && matchesDateFrom && matchesDateTo;
      })
      .sort((a, b) => {
        let aVal: any, bVal: any;
        switch (sortColumn) {
          case "created_at": aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); break;
          case "title": aVal = a.title; bVal = b.title; break;
          case "value": aVal = a.value; bVal = b.value; break;
          case "status": aVal = getProposalStage(a)?.stage_order || 0; bVal = getProposalStage(b)?.stage_order || 0; break;
          case "valid_until": aVal = a.valid_until ? new Date(a.valid_until).getTime() : 0; bVal = b.valid_until ? new Date(b.valid_until).getTime() : 0; break;
          default: aVal = a.created_at; bVal = b.created_at;
        }
        if (typeof aVal === "string" && typeof bVal === "string") return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      });
  }, [proposals, statusFilter, debouncedSearch, searchEntityIdSet, dateFrom, dateTo, sortColumn, sortDirection, noResponseFilter, expiredFilter, noValidityFilter, getProposalStage, getStageName, comercialFilter, onlyMine, scopeAnewUserId]);

  // Stats — computed over filteredProposals so KPI cards reflect active filters
  const stats = useMemo(() => {
    const now = new Date();
    const total = filteredProposals.length;
    const totalValue = filteredProposals.reduce((sum, p) => sum + Number(p.value), 0);

    const stageCounts: Record<string, number> = {};
    const stageValues: Record<string, number> = {};

    workflowStages.forEach(stage => {
      stageCounts[stage.id] = 0;
      stageValues[stage.id] = 0;
    });

    filteredProposals.forEach(p => {
      const stage = getProposalStage(p);
      if (stage) {
        stageCounts[stage.id] = (stageCounts[stage.id] || 0) + 1;
        stageValues[stage.id] = (stageValues[stage.id] || 0) + Number(p.value);
      }
    });

    const wonValue = filteredProposals
      .filter(p => { const stage = getProposalStage(p); return stage?.is_won; })
      .reduce((sum, p) => sum + Number(p.value), 0);

    // Extra KPIs
    const acceptedProposals = filteredProposals.filter(p => {
      const stage = getProposalStage(p);
      return stage?.is_won;
    });
    const totalSentOrLater = filteredProposals.filter(p => {
      const stage = getProposalStage(p);
      return stage && stage.stage_order > 1; // sent or later
    }).length;
    const conversionRate = totalSentOrLater > 0 ? Math.round((acceptedProposals.length / totalSentOrLater) * 100) : 0;

    // Avg close time (days from created_at to accepted_at for accepted proposals)
    const closeTimes = acceptedProposals.map(p => {
      const accepted = (p as any).accepted_at;
      if (accepted) return differenceInDays(parseISO(accepted), parseISO(p.created_at));
      return differenceInDays(now, parseISO(p.created_at));
    }).filter(d => d >= 0);
    const avgCloseTime = closeTimes.length > 0 ? Math.round(closeTimes.reduce((s, d) => s + d, 0) / closeTimes.length) : 0;

    const noResponse5d = filteredProposals.filter(p => {
      const sn = getStageName(p);
      return (sn === "sent" || sn === "enviada") && differenceInDays(now, parseISO(p.created_at)) > 5;
    });
    const noResponse5dValue = noResponse5d.reduce((s, p) => s + Number(p.value), 0);

    const noValidity = filteredProposals.filter(p => {
      const stage = getProposalStage(p);
      return !p.valid_until && !stage?.is_lost;
    });

    const expired = filteredProposals.filter(p => {
      const stage = getProposalStage(p);
      return p.valid_until && isPast(parseISO(p.valid_until)) && !stage?.is_won && !stage?.is_lost;
    });

    return { total, totalValue, stageCounts, stageValues, wonValue, conversionRate, avgCloseTime, noResponse5d, noResponse5dValue, noValidity, expired };
  }, [filteredProposals, workflowStages, getProposalStage, getStageName]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setOnlyMine(false);
    setNoResponseFilter(false);
    setExpiredFilter(false);
    setNoValidityFilter(false);
    setComercialFilter("all");
  };

  const hasActiveFilters = searchTerm || statusFilter !== "all" || dateFrom || dateTo || onlyMine || noResponseFilter || expiredFilter || noValidityFilter || comercialFilter !== "all";

  // Contextual subtitle for a proposal
  const getSubtitle = (proposal: Proposal): { text: string; color: string } | null => {
    const now = new Date();
    const sn = getStageName(proposal);
    const stage = getProposalStage(proposal);
    const daysOld = differenceInDays(now, parseISO(proposal.created_at));

    if (stage?.is_won) {
      const link = pipelineLinks[proposal.id];
      if (link?.contract_id) return { text: "✅ Aceite — contrato criado automaticamente", color: "text-green-600" };
      return { text: "✅ Aceite", color: "text-green-600" };
    }
    if (stage?.is_lost) {
      return { text: "❌ Rejeitada", color: "text-red-500" };
    }
    if ((sn === "sent" || sn === "enviada") && daysOld > 5) {
      return { text: `⏰ Enviada há ${daysOld} dias sem resposta — follow-up urgente`, color: "text-orange-600" };
    }
    if ((sn === "draft" || sn === "rascunho") && daysOld > 2) {
      return { text: `📝 Rascunho há ${daysOld} dias — enviar?`, color: "text-muted-foreground" };
    }
    if (!proposal.valid_until && !stage?.is_lost) {
      return { text: "⚠ Sem validade definida", color: "text-amber-600" };
    }
    if (proposal.valid_until && isPast(parseISO(proposal.valid_until)) && !stage?.is_won && !stage?.is_lost) {
      return { text: "🔴 Expirada", color: "text-red-500" };
    }
    return null;
  };

  // Row background color
  // Resolves the client/lead entity linked to a proposal (direct entity_id, or
  // via its deal), used to wire up phone/call/WhatsApp actions consistently
  // across the quick-actions row and the row dropdown.
  const getProposalEntityInfo = (proposal: Proposal) => {
    const directEntityId = (proposal as any).entity_id as string | null;
    const entityId = directEntityId || (proposal.deal_id ? dealEntityIds[proposal.deal_id] : null) || "";
    const name = (directEntityId ? entityNames[directEntityId] : entityNames[`deal:${proposal.id}`]) || proposal.title;
    const phone = (directEntityId ? entityPhones[directEntityId] : entityPhones[`deal:${proposal.id}`]) || "";
    return { entityId, name, phone };
  };

  const handleQuickCall = (proposal: Proposal) => {
    const { entityId, name } = getProposalEntityInfo(proposal);
    if (!entityId) {
      toast({ title: "Sem entidade associada", description: "Esta proposta não tem um cliente/lead associado.", variant: "destructive" });
      return;
    }
    setCallTarget({ entityId, name });
    setCallDialogOpen(true);
  };

  const handleQuickWhatsApp = (proposal: Proposal) => {
    const { name, phone, entityId } = getProposalEntityInfo(proposal);
    if (!phone) {
      toast({ title: "Sem telefone", description: "Este cliente/lead não tem telefone associado.", variant: "destructive" });
      return;
    }
    setWhatsAppContext({
      module: "proposals",
      recipientName: name,
      recipientPhone: phone,
      entityId: entityId || undefined,
      organizationId: (proposal as any).organization_id || activeCompany?.id || undefined,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      proposalValue: proposal.value ?? undefined,
    });
    setWhatsAppDialogOpen(true);
  };

  const getRowBg = (proposal: Proposal): string => {
    const now = new Date();
    const stage = getProposalStage(proposal);
    const sn = getStageName(proposal);
    if (stage?.is_won) return "bg-green-50/50 dark:bg-green-950/20";
    if (stage?.is_lost) return "bg-red-50/30 dark:bg-red-950/10 opacity-75";
    if ((sn === "sent" || sn === "enviada") && differenceInDays(now, parseISO(proposal.created_at)) > 5) return "bg-amber-50/50 dark:bg-amber-950/20";
    if (sn === "draft" || sn === "rascunho") return "bg-muted/30";
    return "";
  };

  // Dynamic actions per state
  const getQuickActions = (proposal: Proposal) => {
    const sn = getStageName(proposal);
    const stage = getProposalStage(proposal);
    const now = new Date();
    const daysOld = differenceInDays(now, parseISO(proposal.created_at));
    const isNoResponse = (sn === "sent" || sn === "enviada") && daysOld > 5;

    if (sn === "draft" || sn === "rascunho") {
      return (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(proposal)} title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSendProposal(proposal); setSendDialogOpen(true); }} title="Enviar email">
            <Mail className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewDetails(proposal)} title="Ver">
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    }
    if (sn === "sent" || sn === "enviada") {
      return (
        <>
          <Button size="icon" variant={isNoResponse ? "default" : "ghost"} className={cn("h-7 w-7", isNoResponse && "animate-pulse")} onClick={() => handleQuickCall(proposal)} title="Follow-up">
            <Phone className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSendProposal(proposal); setSendDialogOpen(true); }} title="Reenviar">
            <Mail className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(proposal)} title="Adicionar orçamento">
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewDetails(proposal)} title="Ver">
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    }
    if (stage?.is_won) {
      return (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewDetails(proposal)} title="Ver">
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
            disabled={!isContractSigned(pipelineLinks[proposal.id]?.contract_id)}
            title={isContractSigned(pipelineLinks[proposal.id]?.contract_id) ? "Ver contrato" : "Contrato ainda não assinado"}
            onClick={() => openContractPdf(pipelineLinks[proposal.id]?.contract_id)}>
            <FileText className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleReopenProposal(proposal)} title="Reabrir">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(proposal.id)} disabled={duplicatingProposalId === proposal.id} title="Duplicar">
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    }
    if (stage?.is_lost) {
      return (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewDetails(proposal)} title="Ver">
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleReopenProposal(proposal)} title="Reabrir">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleQuickCall(proposal)} title="Follow-up">
            <Phone className="w-3.5 h-3.5" />
          </Button>
        </>
      );
    }
    // Default (analysis, negotiation, etc.)
    return (
      <>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewDetails(proposal)} title="Ver">
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleQuickCall(proposal)} title="Ligar">
          <Phone className="w-3.5 h-3.5" />
        </Button>
      </>
    );
  };

  // Dynamic dropdown per state
  const getDropdownItems = (proposal: Proposal) => {
    const sn = getStageName(proposal);
    const stage = getProposalStage(proposal);
    const link = pipelineLinks[proposal.id];
    const directEntityId = (proposal as any).entity_id as string | null;
    const proposalEntityId = directEntityId || (proposal.deal_id ? dealEntityIds[proposal.deal_id] : null) || "";
    const proposalEntityName = (directEntityId ? entityNames[directEntityId] : entityNames[`deal:${proposal.id}`]) || proposal.title;

    return (
      <DropdownMenuContent align="end" className="w-56">
        {/* Communication */}
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📨 Comunicação</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => { setSendProposal(proposal); setSendDialogOpen(true); }}>
          <Mail className="w-3.5 h-3.5 mr-2" /> {sn === "sent" || sn === "enviada" ? "Reenviar email" : "Enviar por email"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleQuickWhatsApp(proposal)}>
          <MessageSquare className="w-3.5 h-3.5 mr-2" /> WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            try {
              toast({ title: "A gerar PDF…", description: "Pode demorar alguns segundos." });
              const { blob, fileName } = await generateProposalPdfBlob(proposal.id);
              downloadBlob(blob, fileName);
            } catch (e: any) {
              toast({ title: "Erro ao gerar PDF", description: e?.message || "Tenta novamente.", variant: "destructive" });
            }
          }}
        >
          <Download className="w-3.5 h-3.5 mr-2" /> Descarregar PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!proposalEntityId}
          onClick={() => {
            setCallTarget({ entityId: proposalEntityId, name: proposalEntityName });
            setCallDialogOpen(true);
          }}
        >
          <Phone className="w-3.5 h-3.5 mr-2" /> Registar atividade
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📊 Avançar</DropdownMenuLabel>
        {(sn === "draft" || sn === "rascunho") && (
          <DropdownMenuItem onClick={() => handleMarkAsSent(proposal)}>
            <Send className="w-3.5 h-3.5 mr-2" /> Marcar como Enviada
          </DropdownMenuItem>
        )}
        {!stage?.is_won && !stage?.is_lost && (
          <DropdownMenuItem className="text-green-600" onClick={() => { setSelectedProposal(proposal); handleAcceptProposal(proposal); }}>
            <CheckSquare className="w-3.5 h-3.5 mr-2" /> Aceitar
            <span className="text-[10px] text-muted-foreground ml-1">⚡ cria contrato</span>
          </DropdownMenuItem>
        )}
        {!stage?.is_won && !stage?.is_lost && (
          <DropdownMenuItem
            className="text-red-500"
            onClick={() => { setSelectedProposal(proposal); setRejectReasonDialogOpen(true); }}
          >
            <X className="w-3.5 h-3.5 mr-2" /> Rejeitar (com motivo)
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📅 Validade</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => openRenewDialog(proposal.id)}>
          <RefreshCw className="w-3.5 h-3.5 mr-2" /> {proposal.valid_until ? "Renovar validade" : "Definir validade"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>🔗 Portal</span>
          {proposal.has_unpublished_changes && (
            <span className="text-[10px] text-amber-600 font-semibold normal-case tracking-normal">
              ● Alterações por publicar
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={portalAccessLoading}
          onClick={(e) => {
            e.preventDefault();
            requestPortalPublish(proposal, false);
          }}
        >
          <Send className="w-3.5 h-3.5 mr-2 text-purple-600" /> {proposal.published_at ? "Republicar no portal" : "Enviar para Portal Cliente"}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={async (e) => {
            e.preventDefault();
            const link = `${window.location.origin}/auth`;
            await navigator.clipboard.writeText(link);
            toast({ title: "Link copiado!", description: "Link do portal copiado para a área de transferência." });
          }}
        >
          <Link2 className="w-3.5 h-3.5 mr-2" /> Copiar link do portal
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={portalAccessLoading}
          onClick={(e) => {
            e.preventDefault();
            requestPortalPublish(proposal, true);
          }}
        >
          <KeyRound className="w-3.5 h-3.5 mr-2" /> Reenviar credenciais
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">🔗 Relacionados</DropdownMenuLabel>
        <DropdownMenuItem disabled={!proposal.deal_id} onClick={() => proposal.deal_id && navigate(`/deals?open=${proposal.deal_id}`)}>
          <FileText className="w-3.5 h-3.5 mr-2" /> Ver pedido {!proposal.deal_id && <span className="text-[10px] text-muted-foreground ml-1">(não existe)</span>}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!isContractSigned(link?.contract_id)} onClick={() => openContractPdf(link?.contract_id)}>
          <FileText className="w-3.5 h-3.5 mr-2" /> Ver contrato {!link?.contract_id && <span className="text-[10px] text-muted-foreground ml-1">(não criado)</span>}
          {link?.contract_id && !isContractSigned(link?.contract_id) && <span className="text-[10px] text-muted-foreground ml-1">(ainda não assinado)</span>}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">📋 Acções</DropdownMenuLabel>
        {(sn === "draft" || sn === "rascunho" || sn === "sent" || sn === "enviada") && (
          <PermissionGate permission="proposals.edit">
            <DropdownMenuItem onClick={() => handleEdit(proposal)}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> {(sn === "sent" || sn === "enviada") ? "Adicionar orçamento" : "Editar proposta"}
            </DropdownMenuItem>
          </PermissionGate>
        )}
        <DropdownMenuItem onClick={() => { setVisualEditorProposalId(proposal.id); setPortalPreviewOpen(true); }}>
          <Eye className="w-3.5 h-3.5 mr-2" /> Preview Portal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDuplicate(proposal.id)} disabled={duplicatingProposalId === proposal.id}>
          <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setSendHistoryProposalId(proposal.id); setSendHistoryProposalTitle(proposal.title); setSendHistoryOpen(true); }}>
          <History className="w-3.5 h-3.5 mr-2" /> Histórico
        </DropdownMenuItem>

        {stage?.is_lost && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">🔄 Recuperação</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleReopenProposal(proposal)}>
              <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reabrir
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleQuickCall(proposal)}>
              <Phone className="w-3.5 h-3.5 mr-2" /> Contactar cliente
            </DropdownMenuItem>
          </>
        )}

        {stage?.is_won && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">🔄 Recuperação</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleReopenProposal(proposal)}>
              <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reabrir
            </DropdownMenuItem>
          </>
        )}

        {(sn === "draft" || sn === "rascunho") && (
          <>
            <DropdownMenuSeparator />
            <PermissionGate permission="proposals.delete">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteClick(proposal.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
              </DropdownMenuItem>
            </PermissionGate>
          </>
        )}
      </DropdownMenuContent>
    );
  };

  if (loading) {
    return (
      <>
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">{t('proposals.title')}</h1>
              <p className="text-muted-foreground">{t('proposals.subtitle')}</p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse min-w-[130px]">
                <CardContent className="p-3">
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
        <div className="space-y-6 p-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('proposals.title')}</h1><p className="text-muted-foreground">{t('proposals.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-2">
          <ModuleAlertsBanner alerts={proposalAlerts} onDismiss={dismissProposalAlert} onAction={(alert) => {
            const ids = alert.action_config?.entity_ids;
            void openProposalById(alert.action_config?.proposal_id || alert.entity_id || (ids?.length === 1 ? ids[0] : null));
          }} onAlertClick={(alert) => {
            const ids = alert.action_config?.entity_ids;
            void openProposalById(alert.action_config?.proposal_id || alert.entity_id || (ids?.length === 1 ? ids[0] : null));
          }} />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">{t('proposals.title')}</h1>
              <p className="text-muted-foreground">Gestão de propostas comerciais — do envio à aceitação</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <PageFAQSheet pageKey="acquisition.proposals" />
              <Button variant="outline" size="icon" onClick={loadData} title="Atualizar">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
              <PermissionGate permission="proposals.manage">
                <Button variant="outline" size="sm" onClick={() => navigate("/proposal-templates")}>
                  <FileText className="w-4 h-4 mr-2" /> Templates
                </Button>
              </PermissionGate>
              <PermissionGate permission="proposals.manage">
                <Button variant="outline" size="sm" onClick={() => setShowWorkflowConfig(true)}>
                  <Settings2 className="w-4 h-4 mr-2" /> Workflow
                </Button>
              </PermissionGate>
              <PermissionGate permission="proposals.create">
                <Button variant="outline" onClick={() => setAiGeneratorOpen(true)}>
                  <Sparkles className="w-4 h-4 mr-2" /> Gerar com IA
                </Button>
              </PermissionGate>
              <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
                <PermissionGate permission="proposals.create">
                  <DialogTrigger asChild>
                    <Button><Plus className="w-4 h-4 mr-2" /> Nova Proposta</Button>
                  </DialogTrigger>
                </PermissionGate>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingProposalIsSent ? "Adicionar orçamento" : editingId ? t('proposals.editProposal') : t('proposals.newProposal')}</DialogTitle>
                  </DialogHeader>
                  {editingId && (
                    <div className="px-1 mb-4">
                      <PipelineBreadcrumb entityType="proposal" entityId={editingId} />
                    </div>
                  )}
                  <form onSubmit={handleSubmit} ref={proposalFormRef} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="title">{t('proposals.form.title')} *</Label>
                        <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required disabled={editingProposalIsSent} className={fieldErrors.title ? "border-destructive" : ""} />
                        {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="value">{t('proposals.form.value')} *</Label>
                        <Input id="value" type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} required disabled={editingProposalIsSent} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="valid_until">{t('proposals.form.validUntil')}</Label>
                        <Input id="valid_until" type="date" value={formData.valid_until} onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })} disabled={editingProposalIsSent} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assigned_to">Comercial</Label>
                        <Select
                          value={formData.assigned_to || "__none__"}
                          onValueChange={(v) => setFormData({ ...formData, assigned_to: v === "__none__" ? "" : v })}
                          disabled={editingProposalIsSent}
                        >
                          <SelectTrigger><SelectValue placeholder="Sem comercial" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem comercial</SelectItem>
                            {comercialUsers.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="stage_id">{t('proposals.form.status')} *</Label>
                        <Select value={formData.stage_id} onValueChange={(value) => setFormData({ ...formData, stage_id: value })} disabled={editingProposalIsSent}>
                          <SelectTrigger><SelectValue placeholder={t('proposals.form.selectStatus')} /></SelectTrigger>
                          <SelectContent>
                            {workflowStages.filter(stage => !stage.is_lost).map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                                  {stage.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Para rejeitar, usa a ação "Rejeitar (com motivo)" no menu.
                        </p>
                      </div>
                      {/* Template de proposta */}
                      {proposalTemplates.length > 0 && (
                        <div className="col-span-2 space-y-2">
                          <Label className="flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Template de Proposta
                          </Label>
                          <Select value={formData.template_id} onValueChange={(value) => setFormData({ ...formData, template_id: value === "none" ? "" : value })} disabled={editingProposalIsSent}>
                            <SelectTrigger>
                              <SelectValue placeholder="Template default" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum (usa default)</SelectItem>
                              {proposalTemplates.map((tmpl) => (
                                <SelectItem key={tmpl.id} value={tmpl.id}>
                                  <div className="flex items-center gap-2">
                                    {tmpl.name}
                                    {tmpl.is_default && <Badge variant="secondary" className="text-xs ml-1">Default</Badge>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Define o design da proposta no portal e no PDF</p>
                        </div>
                      )}
                      {/* Deal search */}
                      <div className={cn("col-span-2 space-y-2", editingProposalIsSent && "opacity-50 pointer-events-none")}>
                        <Label>{t('proposals.form.deal')}</Label>
                        <div className="relative">
                          {selectedDeal ? (
                            <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                              <Badge variant="secondary" className="shrink-0 mt-0.5">Pedido</Badge>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{selectedDeal.title}</span>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                  {selectedDeal.lead_name && <span className="text-xs text-muted-foreground">{selectedDeal.lead_name}</span>}
                                  {selectedDeal.lead_phone && <span className="text-xs text-muted-foreground">{selectedDeal.lead_phone}</span>}
                                  {selectedDeal.lead_email && <span className="text-xs text-muted-foreground">{selectedDeal.lead_email}</span>}
                                </div>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSelectedDeal(null); setFormData({ ...formData, deal_id: "" }); setSelectedQuotes([]); }}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Input
                                placeholder={t('proposals.form.searchDealPlaceholder') || "Pesquisar pedidos de proposta..."}
                                value={dealSearch}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setDealSearch(value);
                                  // Org + deals.view scoping happens inside the
                                  // shared search; this handler only drives it.
                                  runDealSearch(value);
                                  setShowDealDropdown(normalizeSearchTerm(value).length >= MIN_SEARCH_TERM_LENGTH);
                                }}
                                onFocus={() => { if (dealSearchResults.length > 0) setShowDealDropdown(true); }}
                                onBlur={() => { setTimeout(() => setShowDealDropdown(false), 200); }}
                                className={fieldErrors.deal_id ? "border-destructive" : ""}
                              />
                              {showDealDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[280px] overflow-y-auto">
                                  {dealSearchLoading && dealSearchResults.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">A pesquisar…</div>
                                  )}
                                  {!dealSearchLoading && dealSearchResults.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">Sem resultados</div>
                                  )}
                                  {dealSearchResults.map((deal) => (
                                    <button key={deal.id} type="button" className="w-full px-3 py-3 text-left hover:bg-muted border-b last:border-b-0" onMouseDown={(e) => e.preventDefault()}
                                      onClick={async () => {
                                        setSelectedDeal(deal);
                                        setFormData({ ...formData, deal_id: deal.id });
                                        setDealSearch("");
                                        setShowDealDropdown(false);
                                        setDealSearchResults([]);
                                        
                                        // Load existing quotes for this deal
                                        const { data: dealQuotes } = await supabase.from("quotes").select("id, quote_number, total, estado").eq("deal_id", deal.id).eq("organization_id", activeCompany?.id).neq("estado", "rascunho").order("created_at", { ascending: false });
                                        if (dealQuotes && dealQuotes.length > 0) {
                                          setSelectedQuotes(dealQuotes.map(q => ({ id: q.id, quote_number: q.quote_number, total: q.total, estado: q.estado })));
                                        } else {
                                          setSelectedQuotes([]);
                                          
                                          // No existing quotes — auto-create inline quote from deal items
                                          let createdInline = false;
                                          try {
                                            const { data: dealNeeds } = await (supabase as any)
                                              .from("deal_needs").select("id, title").eq("deal_id", deal.id);
                                            
                                            if (dealNeeds && dealNeeds.length > 0) {
                                              const needIds = dealNeeds.map((n: any) => n.id);
                                              const { data: needItems } = await (supabase as any)
                                                .from("deal_need_items").select("*").in("deal_need_id", needIds).order("sort_order");
                                              
                                              if (needItems && needItems.length > 0) {
                                                const productIds = needItems.filter((i: any) => i.product_id).map((i: any) => i.product_id);
                                                const serviceIds = needItems.filter((i: any) => i.service_id).map((i: any) => i.service_id);
                                                
                                                const [prodRetail, prodCost, svcRetail, svcCost, prodNames, svcNames] = await Promise.all([
                                                  productIds.length > 0 ? supabase.from("product_prices").select("product_id, price, vat_rate").eq("price_type", "retail").in("product_id", productIds) : Promise.resolve({ data: [] as any[] }),
                                                  productIds.length > 0 ? supabase.from("product_prices").select("product_id, price").eq("price_type", "purchase").in("product_id", productIds) : Promise.resolve({ data: [] as any[] }),
                                                  serviceIds.length > 0 ? supabase.from("service_prices").select("service_id, price, vat_rate").eq("price_type", "retail").in("service_id", serviceIds) : Promise.resolve({ data: [] as any[] }),
                                                  serviceIds.length > 0 ? supabase.from("service_prices").select("service_id, price").eq("price_type", "purchase").in("service_id", serviceIds) : Promise.resolve({ data: [] as any[] }),
                                                  productIds.length > 0 ? supabase.from("products").select("id, name, sku").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
                                                  serviceIds.length > 0 ? supabase.from("services").select("id, name, sku").in("id", serviceIds) : Promise.resolve({ data: [] as any[] }),
                                                ]);
                                                
                                                const prodRetailMap = new Map((prodRetail.data || []).map((p: any) => [p.product_id, p]));
                                                const prodCostMap = new Map((prodCost.data || []).map((p: any) => [p.product_id, p]));
                                                const svcRetailMap = new Map((svcRetail.data || []).map((s: any) => [s.service_id, s]));
                                                const svcCostMap = new Map((svcCost.data || []).map((s: any) => [s.service_id, s]));
                                                const prodNameMap = new Map((prodNames.data || []).map((p: any) => [p.id, p]));
                                                const svcNameMap = new Map((svcNames.data || []).map((s: any) => [s.id, s]));
                                                
                                                const lines: any[] = needItems.map((item: any, idx: number) => {
                                                  let name = item.notes || "Item";
                                                  let retailPrice = 0;
                                                  let costPrice = 0;
                                                  let vatRate = 23;
                                                  let sku: string | null = null;
                                                  const manualPrice = item.unit_price ? parseFloat(item.unit_price) : null;
                                                  
                                                  if (item.item_type === "product" && item.product_id) {
                                                    const prod = prodNameMap.get(item.product_id);
                                                    const retail = prodRetailMap.get(item.product_id);
                                                    const cost = prodCostMap.get(item.product_id);
                                                    if (prod) { name = prod.name; sku = prod.sku; }
                                                    retailPrice = manualPrice ?? (retail?.price || 0);
                                                    costPrice = cost?.price || 0;
                                                    vatRate = retail?.vat_rate || 23;
                                                  } else if (item.item_type === "service" && item.service_id) {
                                                    const svc = svcNameMap.get(item.service_id);
                                                    const retail = svcRetailMap.get(item.service_id);
                                                    const cost = svcCostMap.get(item.service_id);
                                                    if (svc) { name = svc.name; sku = svc.sku; }
                                                    retailPrice = manualPrice ?? (retail?.price || 0);
                                                    costPrice = cost?.price || 0;
                                                    vatRate = retail?.vat_rate || 23;
                                                  } else if (manualPrice) {
                                                    retailPrice = manualPrice;
                                                  }
                                                  
                                                  const margin = costPrice > 0 && retailPrice > 0 ? ((retailPrice - costPrice) / costPrice) * 100 : 30;
                                                  
                                                  return {
                                                    id: `temp_deal_${Date.now()}_${idx}`,
                                                    section_name: "Geral",
                                                    descricao_snapshot: name,
                                                    item_description: "",
                                                    qt: item.quantity || 1,
                                                    unidade: undefined,
                                                    custo_material_unit: costPrice > 0 ? costPrice : (retailPrice > 0 ? retailPrice / (1 + margin / 100) : 0),
                                                    custo_mao_obra_unit: 0,
                                                    margem_percent: Math.round(margin * 100) / 100,
                                                    iva_percent: vatRate,
                                                    int_percent: 0,
                                                    discount_percent: 0,
                                                    ordem: idx + 1,
                                                    product_id: item.item_type === "product" ? item.product_id : null,
                                                    service_id: item.item_type === "service" ? item.service_id : null,
                                                    retail_price_unit: retailPrice,
                                                    cost_price: costPrice,
                                                  };
                                                });
                                                
                                                if (lines.length > 0) {
                                                  const newInlineQuote = createEmptyInlineQuote(deal.title);
                                                  newInlineQuote.lines = lines;
                                                  setInlineQuotes([newInlineQuote]);
                                                  createdInline = true;
                                                }
                                              }
                                            }
                                            
                                            // Fallback: no deal_needs or no items — use deal value
                                            if (!createdInline) {
                                              const dealValue = deal.value ? parseFloat(String(deal.value)) : 0;
                                              if (dealValue > 0) {
                                                const defaultMargin = 30;
                                                const materialCost = dealValue / (1 + defaultMargin / 100);
                                                const newInlineQuote = createEmptyInlineQuote(deal.title);
                                                newInlineQuote.lines = [{
                                                  id: `temp_deal_fallback_${Date.now()}`,
                                                  section_name: "Geral",
                                                  descricao_snapshot: deal.title || "Pedido de Proposta",
                                                  item_description: "",
                                                  qt: 1,
                                                  unidade: undefined,
                                                  custo_material_unit: materialCost,
                                                  custo_mao_obra_unit: 0,
                                                  margem_percent: defaultMargin,
                                                  iva_percent: 23,
                                                  int_percent: 0,
                                                  discount_percent: 0,
                                                  ordem: 1,
                                                  product_id: null,
                                                  service_id: null,
                                                  retail_price_unit: dealValue,
                                                  cost_price: materialCost,
                                                }];
                                                setInlineQuotes([newInlineQuote]);
                                              }
                                            }
                                          } catch (err) {
                                            console.error("Error loading deal items for inline quote:", err);
                                          }
                                        }
                                      }}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-xs shrink-0">Pedido</Badge>
                                        <span className="text-sm font-medium truncate">{deal.title}</span>
                                      </div>
                                      {deal.lead_name && <div className="text-xs text-muted-foreground mt-1 ml-[52px]">{deal.lead_name}</div>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Entity (contact/client) — only shown when no Deal is selected */}
                      {!selectedDeal && !formData.deal_id && (
                        <div className={cn("col-span-2 space-y-2", editingProposalIsSent && "opacity-50 pointer-events-none")}>
                          <Label>Lead ou Cliente</Label>
                          <EntitySearchInput
                            value={selectedEntity}
                            onChange={handleEntityChange}
                            searchTypes={["lead", "client"]}
                            placeholder="Pesquisar lead ou cliente para associar..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Opcional — associe um lead ou cliente diretamente quando não existe Pedido de Proposta.
                          </p>
                        </div>
                      )}

                      {/* Orçamentos section */}
                      <div className="col-span-2 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Orçamentos</Label>
                          <div className="flex gap-2">
                            <div className="relative">
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowQuoteDropdown(!showQuoteDropdown)}>
                                🔗 Associar existente
                              </Button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground inline-block ml-1 align-middle cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  Mostra orçamentos em rascunho ou já atribuídos ao mesmo comercial desta proposta.
                                </TooltipContent>
                              </Tooltip>
                              {showQuoteDropdown && (
                                <div className="absolute z-50 top-8 left-0 w-80 bg-popover border rounded-lg shadow-lg p-2">
                                  <Input
                                    placeholder="Pesquisar orçamentos..."
                                    value={quoteSearch}
                                    autoFocus
                                    onChange={(e) => searchQuotes(e.target.value)}
                                    className="h-8 text-xs mb-2"
                                  />
                                  {quoteSearchResults.length > 0 ? (
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                      {quoteSearchResults
                                        .filter(q => !selectedQuotes.some(sq => sq.id === q.id))
                                        .map(q => (
                                          <button
                                            key={q.id}
                                            type="button"
                                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex justify-between items-center"
                                            onClick={() => {
                                              setSelectedQuotes([...selectedQuotes, q]);
                                              setShowQuoteDropdown(false);
                                              setQuoteSearch("");
                                              setQuoteSearchResults([]);
                                            }}
                                          >
                                            <span className="font-medium">{q.quote_number || `#${q.id.slice(0, 8)}`}</span>
                                            <span className="text-muted-foreground">{q.total ? formatCurrency(q.total) : "—"}</span>
                                          </button>
                                        ))}
                                    </div>
                                  ) : quoteSearch.length >= 2 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum orçamento encontrado</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground text-center py-2">Digite para pesquisar...</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={savingProposal}
                              onClick={handleCreateQuoteForProposal}
                            >
                              📝 Criar orçamento aqui
                            </Button>
                          </div>
                        </div>

                        {/* Existing associated quotes */}
                        {selectedQuotes.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {selectedQuotes.map((quote) => (
                              <Badge key={quote.id} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                                <span>🔗 {quote.quote_number || `#${quote.id.slice(0, 8)}`}</span>
                                {quote.total && <span className="text-xs">{formatCurrency(quote.total)}</span>}
                                <Button type="button" variant="ghost" size="icon" className="h-4 w-4 ml-1 p-0" onClick={() => setSelectedQuotes(selectedQuotes.filter(q => q.id !== quote.id))}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Suggested quotes (drafts + unattached) for the selected Deal/Entity */}
                        {(() => {
                          const available = suggestedQuotes.filter(q => !selectedQuotes.some(sq => sq.id === q.id));
                          if (available.length === 0) return null;
                          return (
                            <div className="rounded-md border border-dashed bg-muted/20 p-2 space-y-1.5">
                              <p className="text-xs text-muted-foreground">
                                Orçamentos em rascunho disponíveis {selectedDeal ? "para este Pedido" : "deste contacto/cliente"}:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {available.map((q) => (
                                  <button
                                    key={q.id}
                                    type="button"
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background hover:bg-accent text-xs"
                                    onClick={() => setSelectedQuotes([...selectedQuotes, q])}
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span className="font-medium">{q.quote_number || `#${q.id.slice(0, 8)}`}</span>
                                    {q.estado === "rascunho" && <Badge variant="outline" className="text-[10px] h-4 px-1">Rascunho</Badge>}
                                    {q.total != null && <span className="text-muted-foreground">{formatCurrency(q.total)}</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Inline quotes (legacy — still rendered if present, e.g. when editing
                            an old draft that pre-dates the redirect to the full Quote Builder) */}
                        {inlineQuotes.map((iq, idx) => (
                          <InlineQuoteBuilder
                            key={iq.tempId}
                            quote={iq}
                            onChange={(updated) => {
                              const newInline = [...inlineQuotes];
                              newInline[idx] = updated;
                              setInlineQuotes(newInline);
                            }}
                            onRemove={() => setInlineQuotes(inlineQuotes.filter((_, i) => i !== idx))}
                            proposalTitle={formData.title}
                            organizationId={activeCompany?.id}
                          />
                        ))}
                      </div>
                       
                      <div className="col-span-2">
                        {editingId && (
                          <div className={cn("pt-4 border-t", editingProposalIsSent && "opacity-50 pointer-events-none")}>
                            <div className="flex items-center justify-between mb-4">
                              <Label className="text-base font-semibold">Itens Manuais</Label>
                            </div>
                            <ProposalManualItemsEditor proposalId={editingId} />
                          </div>
                        )}
                        {(selectedQuotes.length > 0 || inlineQuotes.length > 0) && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                            <div className="text-sm space-y-1">
                              {selectedQuotes.length > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Orçamentos associados:</span>
                                  <span className="font-medium">{formatCurrency(selectedQuotes.reduce((sum, q) => sum + (q.total || 0), 0))}</span>
                                </div>
                              )}
                              {inlineQuotes.length > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Orçamentos inline ({inlineQuotes.length}):</span>
                                  <span className="font-medium">{formatCurrency(inlineQuotes.reduce((sum, q) => sum + calcInlineQuoteTotal(q), 0))}</span>
                                </div>
                              )}
                              <Separator className="my-2" />
                              <div className="flex justify-between font-semibold">
                                <span>Total:</span>
                                <span className="text-primary">{formatCurrency(selectedQuotes.reduce((sum, q) => sum + (q.total || 0), 0) + inlineQuotes.reduce((sum, q) => sum + calcInlineQuoteTotal(q), 0))}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="description">{t('proposals.form.description')}</Label>
                        <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} disabled={editingProposalIsSent} />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="notes">{t('proposals.form.notes')}</Label>
                        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} disabled={editingProposalIsSent} />
                      </div>
                    </div>
                    <DialogFooter className="flex justify-between sm:justify-between">
                      <div>
                        {editingId && (
                          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setPortalPreviewOpen(true)}>
                            <Eye className="h-4 w-4" /> Preview Portal
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('proposals.form.cancel')}</Button>
                        <Button type="submit" disabled={savingProposal}>{editingProposalIsSent ? "Guardar orçamentos" : editingId ? t('proposals.form.update') : t('proposals.form.create')}</Button>
                      </div>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Workflow Bar */}
        <div className="flex-shrink-0 px-4 md:px-6">
          <ProposalsWorkflowBar />
        </div>

        {/* Alert Bars */}
        <div className="flex-shrink-0 px-4 md:px-6 mt-2">
          <ProposalsAlertBars
            proposals={proposals.map(p => ({
              id: p.id,
              title: p.title,
              value: Number(p.value),
              status: p.status,
              stage_name: getProposalStage(p)?.name,
              valid_until: p.valid_until,
              created_at: p.created_at,
              sent_at: (p as any).sent_at ?? null,
              updated_at: (p as any).updated_at,
              contract_id: pipelineLinks[p.id]?.contract_id,
            }))}
            noResponseDays={alertSettings.get("proposal_no_response", 5).days_threshold}
            noResponseUrgentDays={alertSettings.get("proposal_no_response_urgent", 10).days_threshold}
            noResponseEnabled={alertSettings.get("proposal_no_response", 5).is_active}
            noResponseUrgentEnabled={alertSettings.get("proposal_no_response_urgent", 10).is_active}
            expiredEnabled={alertSettings.get("proposal_expired").is_active}
            noValidityEnabled={alertSettings.get("proposal_no_validity").is_active}
            draftStaleEnabled={alertSettings.get("proposal_draft_stale", 5).is_active}
            draftStaleDays={alertSettings.get("proposal_draft_stale", 5).days_threshold}
            onNavigateContracts={() => navigate("/client-contracts")}
            onRenewValidity={openRenewDialog}
            onOpenProposal={(id) => {
              const found = proposals.find(p => p.id === id);
              if (found) handleViewDetails(found);
            }}
          />
        </div>

        {/* View Toggle + Summary */}
        <div className="flex-shrink-0 px-4 md:px-6 mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            <Button variant={viewMode === "lista" ? "default" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setViewMode("lista")}>
              <LayoutList className="h-3.5 w-3.5" /> Lista
            </Button>
            <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setViewMode("kanban")}>
              <Columns3 className="h-3.5 w-3.5" /> Kanban
            </Button>
            <Button variant={viewMode === "dashboard" ? "default" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setViewMode("dashboard")}>
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Total: {stats.total} · Pipeline: <span className="font-semibold text-foreground">{formatCurrency(stats.totalValue)}</span> · Aceite: <span className="font-bold text-green-600">{formatCurrency(stats.wonValue)}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="flex-shrink-0 px-4 md:px-6 mt-3">
          <div className="flex gap-3 overflow-x-auto pb-2">
            <Card className={cn("cursor-pointer hover:shadow-md transition-all min-w-[130px] flex-shrink-0", statusFilter === "all" && "ring-2 ring-primary shadow-md")} onClick={() => setStatusFilter("all")}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium uppercase">Total</div>
                <div className="text-xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">{formatCurrency(stats.totalValue)} em pipeline</div>
              </CardContent>
            </Card>
            
            {workflowStages.map((stage) => (
              <Card key={stage.id} className={cn("cursor-pointer hover:shadow-md transition-all min-w-[130px] flex-shrink-0", statusFilter === stage.id && "ring-2 ring-primary shadow-md")} onClick={() => setStatusFilter(stage.id === statusFilter ? "all" : stage.id)}>
                <CardContent className="p-3">
                  <div className="text-xs font-medium uppercase" style={{ color: stage.color }}>{stage.label}</div>
                  <div className="text-xl font-bold" style={{ color: stage.color }}>{stats.stageCounts[stage.id] || 0}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(stats.stageValues[stage.id] || 0)}</div>
                </CardContent>
              </Card>
            ))}
            
            <Card className="min-w-[160px] flex-shrink-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium uppercase">Valor Aceite</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(stats.wonValue)}</div>
              </CardContent>
            </Card>

            <Card className="min-w-[130px] flex-shrink-0">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium uppercase">Taxa Conversão</div>
                <div className="text-xl font-bold text-primary">{stats.conversionRate}%</div>
                <div className="text-xs text-muted-foreground">{filteredProposals.filter(p => getProposalStage(p)?.is_won).length} aceites</div>
              </CardContent>
            </Card>

            <Card className="min-w-[130px] flex-shrink-0">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium uppercase">Tempo Médio Fecho</div>
                <div className="text-xl font-bold text-primary">{stats.avgCloseTime}d</div>
              </CardContent>
            </Card>

            {stats.noResponse5d.length > 0 && (
              <Card className="min-w-[150px] flex-shrink-0 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 cursor-pointer" onClick={() => setNoResponseFilter(!noResponseFilter)}>
                <CardContent className="p-3">
                  <div className="text-xs text-orange-600 font-medium uppercase">Sem Resposta +5d</div>
                  <div className="text-xl font-bold text-orange-600">{stats.noResponse5d.length}</div>
                  <div className="text-xs text-orange-500">{formatCurrency(stats.noResponse5dValue)}</div>
                </CardContent>
              </Card>
            )}

            {stats.noValidity.length > 0 && (
              <Card className="min-w-[130px] flex-shrink-0 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer" onClick={() => setNoValidityFilter(!noValidityFilter)}>
                <CardContent className="p-3">
                  <div className="text-xs text-amber-600 font-medium uppercase">Sem Validade</div>
                  <div className="text-xl font-bold text-amber-600">{stats.noValidity.length}</div>
                </CardContent>
              </Card>
            )}

            {stats.expired.length > 0 && (
              <Card className="min-w-[130px] flex-shrink-0 border-red-200 bg-red-50/50 dark:bg-red-950/20 cursor-pointer" onClick={() => setExpiredFilter(!expiredFilter)}>
                <CardContent className="p-3">
                  <div className="text-xs text-red-600 font-medium uppercase">Expiradas</div>
                  <div className="text-xl font-bold text-red-600">{stats.expired.length}</div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Content area */}
        {viewMode === "dashboard" ? (
          <ProposalsDashboardView
            proposals={filteredProposals}
            workflowStages={workflowStages}
            getProposalStage={getProposalStage}
            comercialNamesMap={comercialNamesMap}
            isLoading={loading}
            hasAnyProposals={proposals.length > 0}
          />
        ) : viewMode === "kanban" ? (
          <ProposalsKanbanView
            proposals={filteredProposals.map(p => {
              const eid = (p as any).entity_id;
              const key = eid || `deal:${p.id}`;
              return {
                ...p,
                entity_name: entityNames[eid] || entityNames[`deal:${p.id}`] || null,
                entity_email: entityEmails[eid] || entityEmails[`deal:${p.id}`] || null,
                entity_phone: entityPhones[eid] || entityPhones[`deal:${p.id}`] || null,
              };
            })}
            workflowStages={workflowStages}
            getProposalStage={getProposalStage}
            onMoveStage={async (proposalId, newStageId) => {
              const { error } = await supabase.from("proposals").update({ stage_id: newStageId }).eq("id", proposalId);
              if (error) {
                toast({ title: "Erro", description: error.message, variant: "destructive" });
              } else {
                toast({ title: "Proposta movida" });
                loadData();
              }
            }}
            onLostStageDrop={(proposalId, stageId) => {
              const proposal = filteredProposals.find(p => p.id === proposalId);
              if (!proposal) return;
              setKanbanRejectTarget({ proposal, stageId });
              setKanbanRejectDialogOpen(true);
            }}
            onViewProposal={(p) => { setSelectedProposal(p as any); setDetailsOpen(true); }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 md:px-6 mt-3 pb-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Procurar por título, cliente, pedido, valor..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              
              <Button variant={onlyMine ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setOnlyMine(!onlyMine)}>
                👤 Só as minhas
              </Button>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {workflowStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                        {stage.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={comercialFilter} onValueChange={setComercialFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Comercial" /></SelectTrigger>
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

              <Button variant={noResponseFilter ? "default" : "outline"} size="sm" className={cn("gap-1", noResponseFilter && "bg-orange-600 hover:bg-orange-700")} onClick={() => setNoResponseFilter(!noResponseFilter)}>
                ⏰ Sem resposta +5d
              </Button>

              <Button variant={expiredFilter ? "default" : "outline"} size="sm" className={cn("gap-1", expiredFilter && "bg-red-600 hover:bg-red-700")} onClick={() => setExpiredFilter(!expiredFilter)}>
                ⏳ Expiradas
              </Button>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" /> Limpar
                </Button>
              )}
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="mb-4 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <span className="text-sm font-medium text-primary">{selectedIds.length} proposta{selectedIds.length > 1 ? "s" : ""} seleccionada{selectedIds.length > 1 ? "s" : ""}</span>
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" disabled={bulkEmailSending} onClick={handleBulkSendEmail}>
                    <Mail className="w-3.5 h-3.5 mr-1" /> {bulkEmailSending ? "A enviar…" : "Enviar email"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setBulkStatusDialogOpen(true)}>
                    <Columns3 className="w-3.5 h-3.5 mr-1" /> Mover estado
                  </Button>
                  <Button variant="outline" size="sm" disabled={bulkPdfExporting} onClick={handleBulkExportPdf}>
                    <FileText className="w-3.5 h-3.5 mr-1" /> {bulkPdfExporting ? "A gerar…" : "Exportar PDF"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            {filteredProposals.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {proposals.length === 0 ? t('proposals.noProposals') : 'Nenhum resultado encontrado'}
                  </p>
                  {proposals.length === 0 && (
                    <PermissionGate permission="proposals.create">
                      <Button onClick={() => setOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> {t('proposals.createFirst')}
                      </Button>
                    </PermissionGate>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="overflow-auto quotes-table-scroll max-h-[calc(100vh-320px)]">
                  <Table containerClassName="overflow-visible" className="min-w-[1400px]">
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox checked={filteredProposals.length > 0 && selectedIds.length === filteredProposals.length} onCheckedChange={(checked) => handleSelectAll(!!checked)} />
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("title")}>
                          <div className="flex items-center">Título <SortIcon column="title" /></div>
                        </TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Comercial</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("value")}>
                          <div className="flex items-center">Valor <SortIcon column="value" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("status")}>
                          <div className="flex items-center">Estado <SortIcon column="status" /></div>
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("valid_until")}>
                          <div className="flex items-center">Válida até <SortIcon column="valid_until" /></div>
                        </TableHead>
                        <TableHead>Pipeline</TableHead>
                        <TableHead>Portal</TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("created_at")}>
                          <div className="flex items-center">Criada <SortIcon column="created_at" /></div>
                        </TableHead>
                        <TableHead className="text-right">Acções</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProposals.map((proposal) => {
                        const subtitle = getSubtitle(proposal);
                        const stage = getProposalStage(proposal);
                        const link = pipelineLinks[proposal.id];
                        
                        return (
                          <TableRow key={proposal.id} className={cn("hover:bg-muted/50 transition-colors", getRowBg(proposal), selectedIds.includes(proposal.id) && "ring-1 ring-primary/30")}>
                            <TableCell>
                              <Checkbox checked={selectedIds.includes(proposal.id)} onCheckedChange={(checked) => handleSelectOne(proposal.id, !!checked)} />
                            </TableCell>
                            <TableCell>
                              <div className="min-w-[160px]">
                                <div className="flex items-center gap-2">
                                  <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: stage?.color || 'transparent' }} />
                                  <div>
                                    {proposal.proposal_number && (
                                      <div className="text-[11px] text-muted-foreground font-mono leading-none mb-0.5">
                                        {proposal.proposal_number}
                                      </div>
                                    )}
                                    <span className="font-medium text-sm">{proposal.title}</span>
                                    {subtitle && (
                                      <div className={cn("text-[11px] mt-0.5", subtitle.color)}>{subtitle.text}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const eid = (proposal as any).entity_id;
                                const name = eid ? entityNames[eid] : entityNames[`deal:${proposal.id}`];
                                return name ? (
                                  <span className="text-sm">{name}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              {(proposal as any).assigned_to ? (
                                <span className="text-xs">{comercialNamesMap[(proposal as any).assigned_to] || "..."}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {proposal.deals ? (
                                <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => navigate(`/deals?open=${proposal.deal_id}`)}>
                                  {proposal.deals.title}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className={cn("font-bold text-base", stage?.is_lost ? "line-through text-muted-foreground" : "text-foreground")}>
                                {(() => {
                                  const items = (proposal as any).proposal_items || [];
                                  const itemsSubtotal = items.reduce((s: number, i: any) => s + (Number(i.subtotal) || 0), 0);
                                  const itemsTotal = items.reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
                                  const proposalValue = Number(proposal.value) || 0;
                                  // Use proposal.value (grand total) as authoritative source when items total doesn't match
                                  const displayTotal = Math.abs(itemsTotal - proposalValue) < 0.05 ? itemsTotal : proposalValue;
                                  const displayValue = itemsSubtotal > 0 ? itemsSubtotal : proposalValue;
                                  const linkedQuotes: any[] = (proposal as any).quotes || [];
                                  const maxDiscount = linkedQuotes.reduce((max: number, q: any) => Math.max(max, Number(q.desconto_global_percent) || 0), 0);
                                  return (
                                    <>
                                      {formatCurrency(displayValue)}
                                      {displayTotal > 0 && displayTotal !== displayValue && (
                                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                                          c/ IVA: {formatCurrency(displayTotal)}
                                        </span>
                                      )}
                                      {maxDiscount > 0 && (
                                        <span className="block text-[10px] text-orange-500 dark:text-orange-400 tabular-nums">
                                          Desc. global: {maxDiscount}%
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </span>
                            </TableCell>
                            <TableCell>{getStageBadge(proposal)}</TableCell>
                            <TableCell>
                              {proposal.valid_until ? (
                                <span className={cn("text-sm", isPast(parseISO(proposal.valid_until)) && !stage?.is_won ? "text-red-500 font-medium" : "text-muted-foreground")}>
                                  {isPast(parseISO(proposal.valid_until)) && !stage?.is_won && "⚠ "}
                                  {format(new Date(proposal.valid_until), "dd/MM/yyyy", { locale: pt })}
                                  {isPast(parseISO(proposal.valid_until)) && !stage?.is_won && (
                                    <span className="text-[10px] block">({differenceInDays(new Date(), parseISO(proposal.valid_until))} dias)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-xs text-amber-500">⚠ Não definida</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <ProposalsPipelineMini
                                dealExists={!!proposal.deal_id}
                                quoteExists={!!link?.quote_id || proposalsWithQuotes.has(proposal.id)}
                                proposalStatus={stage?.name || proposal.status}
                                contractCreated={!!link?.contract_id}
                                pipelineLabel={link?.contract_id ? "Contrato ✅" : stage?.is_won ? "A criar contrato..." : stage?.is_lost ? "Pipeline parado" : "A aguardar"}
                              />
                            </TableCell>
                            <TableCell>
                              <PortalStatusBadge status={proposal.status === 'accepted' ? 'signed' : ((portalStatuses as any)?.[proposal.id] || null)} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(proposal.created_at), "dd/MM/yyyy", { locale: pt })}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-0.5">
                                {getQuickActions(proposal)}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  {getDropdownItems(proposal)}
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ProposalDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} proposal={selectedProposal}
        onSendProposal={() => { if (selectedProposal) { setSendProposal(selectedProposal); setSendDialogOpen(true); setDetailsOpen(false); } }}
        onViewHistory={() => { if (selectedProposal) { setSendHistoryProposalId(selectedProposal.id); setSendHistoryProposalTitle(selectedProposal.title); setSendHistoryOpen(true); setDetailsOpen(false); } }}
        onAccept={() => handleAcceptProposal(selectedProposal ?? undefined)}
        onReject={() => setRejectReasonDialogOpen(true)}
        isAccepting={isAcceptingProposal}
      />

      <ProposalRejectReasonDialog
        open={rejectReasonDialogOpen}
        onOpenChange={setRejectReasonDialogOpen}
        organizationId={activeCompany?.id ?? null}
        onConfirm={handleRejectProposal}
      />

      {/* Drag-and-drop no kanban para uma stage "is_lost": pede o motivo
          antes de gravar, reutilizando o mesmo diálogo/lógica de rejeição. */}
      <ProposalRejectReasonDialog
        open={kanbanRejectDialogOpen}
        onOpenChange={(open) => {
          setKanbanRejectDialogOpen(open);
          if (!open) setKanbanRejectTarget(null);
        }}
        organizationId={activeCompany?.id ?? null}
        onConfirm={async (reason) => {
          if (!kanbanRejectTarget) return;
          try {
            const { workflowFailed } = await rejectProposalCore(
              kanbanRejectTarget.proposal,
              reason,
              kanbanRejectTarget.stageId,
            );
            toast({
              title: "Proposta movida",
              description: workflowFailed ? t('proposals.toast.workflowWarning') : undefined,
            });
            setKanbanRejectDialogOpen(false);
            setKanbanRejectTarget(null);
            loadData();
          } catch (error: any) {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
          }
        }}
      />

      <AlertDialog open={showNullTotalDialog} onOpenChange={setShowNullTotalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Orçamentos sem valor total</AlertDialogTitle>
            <AlertDialogDescription>
              {nullTotalQuoteNames.length === 1
                ? `O orçamento "${nullTotalQuoteNames[0]}" não tem total definido e será contabilizado como €0.`
                : `${nullTotalQuoteNames.length} orçamentos sem total definido serão contabilizados como €0: ${nullTotalQuoteNames.join(", ")}.`}
              {" "}Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              nullTotalConfirmedRef.current = true;
              setShowNullTotalDialog(false);
              proposalFormRef.current?.requestSubmit();
            }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('proposals.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('proposals.delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('proposals.form.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('proposals.actions.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!portalReopenConfirm} onOpenChange={(openState) => { if (!openState) setPortalReopenConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Republicar proposta aceite?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta proposta já foi aceite. Foram detetadas alterações nos orçamentos após a aceitação.</p>
                <p>Ao republicar, a assinatura anterior deixa de ser válida e o cliente terá de aceitar e assinar novamente com os novos valores.</p>
                {portalReopenConfirm && (
                  <p className="text-xs text-muted-foreground">
                    {portalReopenConfirm.proposal.proposal_number ? `${portalReopenConfirm.proposal.proposal_number} — ` : ""}
                    {portalReopenConfirm.proposal.title}
                    {" · "}
                    {formatCurrency(Number(portalReopenConfirm.proposal.value ?? 0))}
                  </p>
                )}
                <p className="text-xs font-medium text-amber-600">
                  Nota: se já existir um contrato assinado, a republicação será bloqueada. Se existir apenas um rascunho, ele será removido e regenerado após a nova aceitação.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPortalReopenConfirm(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePortalReopenConfirm} className="bg-purple-600 text-white hover:bg-purple-700">
              Republicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProposalWorkflowConfig open={showWorkflowConfig} onOpenChange={setShowWorkflowConfig} companyId={activeCompany?.id || null} onStagesUpdated={loadWorkflowStages} />

      <SendProposalDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen} proposal={sendProposal} onSent={() => loadData()} />
      <RegisterCallDialog
        open={callDialogOpen}
        onOpenChange={setCallDialogOpen}
        entityId={callTarget.entityId}
        entityName={callTarget.name}
        organizationId={activeCompany?.id || ""}
        onCallRegistered={() => { setCallDialogOpen(false); loadData(); }}
      />
      <WhatsAppSendDialog
        open={whatsAppDialogOpen}
        onOpenChange={setWhatsAppDialogOpen}
        context={whatsAppContext}
      />
      <ProposalSendHistory open={sendHistoryOpen} onOpenChange={setSendHistoryOpen} proposalId={sendHistoryProposalId} proposalTitle={sendHistoryProposalTitle} />
      {(visualEditorProposalId || editingId) && (
        <ProposalPortalPreview open={portalPreviewOpen} onOpenChange={(open) => { setPortalPreviewOpen(open); if (!open) setVisualEditorProposalId(null); }} proposalId={(visualEditorProposalId || editingId)!} />
      )}

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{`Tem a certeza que deseja eliminar ${selectedIds.length} propostas?`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('common.changeStatus')}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Alterar estado de {selectedIds.length} propostas selecionadas.</p>
            <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
              <SelectTrigger><SelectValue placeholder={t('common.newStatus')} /></SelectTrigger>
              <SelectContent>
                {workflowStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      {stage.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)} disabled={isBulkStatusChanging}>{t('common.cancel')}</Button>
            <Button
              onClick={() => {
                const targetStage = workflowStages.find(s => s.id === bulkNewStatus);
                if (targetStage?.is_lost) {
                  setBulkRejectDialogOpen(true);
                } else {
                  handleBulkStatusChange();
                }
              }}
              disabled={!bulkNewStatus || isBulkStatusChanging}
            >{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk status change para uma stage "is_lost": pede o motivo (uma vez,
          aplicado a todas as selecionadas) em vez de gravar direto. */}
      <ProposalRejectReasonDialog
        open={bulkRejectDialogOpen}
        onOpenChange={setBulkRejectDialogOpen}
        organizationId={activeCompany?.id ?? null}
        onConfirm={handleBulkRejectConfirm}
      />

      <AIProposalGeneratorDialog
        open={aiGeneratorOpen}
        onOpenChange={setAiGeneratorOpen}
        {...({onApply: (data: any) => {
          setEditingId(null);
          setFormData({ title: data.title, description: data.description, value: "", deal_id: "", valid_until: "", notes: "", stage_id: workflowStages[0]?.id || "", template_id: "", assigned_to: "" });
          setProposalItems(data.items.map((item: any, i: number) => ({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            vat_rate: item.vat_rate,
            sort_order: i,
          })));
          setOpen(true);
        }} as any)}
      />

      {/* Renew Validity Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renovar validade da proposta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nova data de validade</Label>
              <Input
                type="date"
                value={renewDate}
                onChange={(e) => setRenewDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRenewValidity} disabled={!renewDate}>Renovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Proposals;
