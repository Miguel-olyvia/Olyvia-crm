import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { sanitizeFieldValue } from "@/utils/sanitize";
import { syncEntityPrimaryAddressFromLead } from "@/utils/addressSanitization";
import { extractLeadContactInfo } from "@/utils/leadContactInfo";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useModuleAlerts } from "@/hooks/useModuleAlerts";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { supabase } from "@/integrations/supabase/client";
import { searchEntityIds } from "@/lib/clientSearch";
import { INTERNAL_ASSIGNMENT_EXCLUDED_ROLES } from "@/constants/userTypeRoles";
import { useToast } from "@/hooks/use-toast";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Search, Plus, RefreshCw, UserPlus, Eye, Trash2, Pencil, GripVertical, 
  Workflow, Phone, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, X, MessageCircle,
  LayoutDashboard, List, Filter, BarChart3, User, Building2, Link, Unlink, 
  Clock, Settings2, AlertCircle, BellRing, CheckCircle2, Sparkles, FileText, Mail, MapPin, Hash, Briefcase,
  Target, MoreHorizontal, Star, Copy, ExternalLink, Globe, StickyNote, Heart
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, startOfDay, endOfDay, isWithinInterval, formatDistanceToNow, isToday, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LeadWorkflowConfig, WorkflowStage } from "@/components/leads/LeadWorkflowConfig";
import { LeadAISchedulingRulesConfig } from "@/components/leads/LeadAISchedulingRulesConfig";
import { AnewLeadContactDialog } from "@/components/leads/AnewLeadContactDialog";
import { LeadsDashboard } from "@/components/leads/LeadsDashboard";
import { LeadsTableColumns, ColumnConfig } from "@/components/leads/LeadsTableColumns";
import { LeadsAIOrganization } from "@/components/leads/LeadsAIOrganization";
import { LeadsAIConfig } from "@/components/leads/LeadsAIConfig";
import { DynamicFormField } from "@/components/leads/DynamicFormField";
import { LeadsBulkActions } from "@/components/leads/LeadsBulkActions";
import { AnewLeadEditDialog } from "@/components/leads/AnewLeadEditDialog";
import { VisitReassignDialog } from "@/components/leads/VisitReassignDialog";
import { HelpButton } from "@/components/HelpButton";
import { PermissionGate } from "@/components/PermissionGate";
import { Calendar } from "@/components/ui/calendar";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useEntityIdentity, resolveEntityByIdentity, validateEntityCoherence } from "@/hooks/useEntityIdentity";
import { NativeSelect } from "@/components/ui/native-select";
import { usePipelineAutomation } from "@/hooks/usePipelineAutomation";
import { DuplicateEntityDialog } from "@/components/shared/DuplicateEntityDialog";
import { fetchGroupDuplicateMatches, fetchSameOrgMatchFields } from "@/lib/groupDuplicateMatches";
import {
  computeStrictShouldBlock,
  fetchSameOrgFieldsByEntity,
  revalidateStrongDuplicatesBeforeWrite,
} from "@/lib/duplicateBlockingRule";
import { ensureEntityOrgLink, linkEntityToOrg } from "@/utils/orgEntity";
import { assertNoSupabaseError } from "@/lib/assertNoSupabaseError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { LeadTableRow } from "@/components/leads/LeadTableRow";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { calculateLeadHealthScore, type LeadHealthScore } from "@/hooks/useLeadHealthScore";
import { LeadDetailHeader } from "@/components/leads/detail/LeadDetailHeader";
import { LeadSummaryBar } from "@/components/leads/detail/LeadSummaryBar";
import { LeadSmartSuggestion } from "@/components/leads/detail/LeadSmartSuggestion";
import { LeadPipelineBar } from "@/components/leads/detail/LeadPipelineBar";
import { LeadInfoTab } from "@/components/leads/detail/LeadInfoTab";
import { LeadTimelineTab } from "@/components/leads/detail/LeadTimelineTab";
import { LeadJourneyTab } from "@/components/leads/detail/LeadJourneyTab";
import { ClientNotesTab } from "@/components/clients/detail/ClientNotesTab";
import { resolveRootOrgIdLogic } from "@/lib/orgHierarchy";
import { checkNameDuplicatesBeforeInsert } from "@/lib/leadDuplicateCheck";


interface Lead {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  field_values: Record<string, any> | null;
  status: string;
  source: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  created_by: string | null;
  converted_to_contact_id: string | null;
  converted_at: string | null;
  assigned_to: string | null;
  entity_id?: string | null;
  campaigns?: { id: string; name: string } | null;
  last_contact_result?: string;
  last_contact_at?: string | null;
  converted_to_client_id?: string | null;
  callback_scheduled_at?: string | null;
  callback_notes?: string | null;
  profiles?: { name: string | null } | null;
  assigned_user?: { id: string; name: string | null } | null;
  [key: string]: any;
}

interface ContactResultConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface FieldDefinition {
  id: string;
  campaign_id: string | null;
  organization_id?: string | null;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: any;
  sort_order: number;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  placeholder?: string;
  help_text?: string;
  display_style?: string;
  [key: string]: any;
}

interface ContactOption {
  id: string;
  entity_id: string | null;
}

interface ClientOption {
  id: string;
  entity_id: string | null;
}

// Contact fields available for mapping - labels will be translated via t()
const CONTACT_FIELD_KEYS = [
  { value: "", labelKey: "leads.fields.noMapping" },
  { value: "first_name", labelKey: "leads.fields.firstName" },
  { value: "last_name", labelKey: "leads.fields.lastName" },
  { value: "email", labelKey: "leads.fields.email" },
  { value: "phone", labelKey: "leads.fields.phone" },
  { value: "mobile", labelKey: "leads.fields.mobile" },
  { value: "position", labelKey: "leads.fields.position" },
  { value: "department", labelKey: "leads.fields.department" },
  { value: "address", labelKey: "leads.fields.address" },
  { value: "city", labelKey: "leads.fields.city" },
  { value: "postal_code", labelKey: "leads.fields.postalCode" },
  { value: "country", labelKey: "leads.fields.country" },
  { value: "notes", labelKey: "leads.fields.notes" },
  { value: "website", labelKey: "leads.fields.website" },
  { value: "linkedin", labelKey: "leads.fields.linkedin" },
];

// Client fields available for mapping - labels will be translated via t()
const CLIENT_FIELD_KEYS = [
  { value: "", labelKey: "leads.fields.noMapping" },
  { value: "first_name", labelKey: "leads.fields.firstName" },
  { value: "last_name", labelKey: "leads.fields.lastName" },
  { value: "email", labelKey: "leads.fields.email" },
  { value: "phone", labelKey: "leads.fields.phone" },
  { value: "company_name", labelKey: "leads.fields.companyName" },
  { value: "vat", labelKey: "leads.fields.vat" },
  { value: "position", labelKey: "leads.fields.position" },
  { value: "industry", labelKey: "leads.fields.industry" },
  { value: "website", labelKey: "leads.fields.website" },
  { value: "notes", labelKey: "leads.fields.notes" },
];

const LEAD_CONTACT_DIALOG_STATE_KEY = "olyvia:leads:open-contact-dialog";

interface Campaign {
  id: string;
  name: string;
  form_id?: string | null;
}

export default function AnewLeads() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const navigate = useNavigate();
  const { resolveEntities, getIdentity } = useEntityIdentity();
  
  // Create translated field arrays (memoized to prevent re-creation every render)
  const CONTACT_FIELDS = useMemo(() => CONTACT_FIELD_KEYS.map(f => ({ value: f.value, label: t(f.labelKey) })), [t]);
  const CLIENT_FIELDS = useMemo(() => CLIENT_FIELD_KEYS.map(f => ({ value: f.value, label: t(f.labelKey) })), [t]);
  const activeCompanyId = activeCompany?.id;
  const { alerts: leadAlerts, dismissAlert: dismissLeadAlert } = useModuleAlerts('lead', activeCompanyId);
  const { toast } = useToast();
  const { createDealFromLead } = usePipelineAutomation();
  const { getPermissionScope, anewUserId: scopeAnewUserId, authUserId: scopeAuthUserId, loading: scopeLoading } = usePermissionScope();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDefinition[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [contactResults, setContactResults] = useState<ContactResultConfig[]>([]);
  const [referenceData, setReferenceData] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  
  // Infinite scroll / pagination state
  const PAGE_SIZE = 25;
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentPageRef = useRef(0);
  const isLoadingRef = useRef(false);
  const descendantCacheRef = useRef<{ key: string; ids: string[]; hierarchy: any[] } | null>(null);
  const leadsTableScrollRef = useRef<HTMLDivElement | null>(null);
  const leadsTableScrollbarRef = useRef<HTMLDivElement | null>(null);
  const [leadsTableScrollWidth, setLeadsTableScrollWidth] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const effectiveSearch = useMemo(() => {
    const trimmed = debouncedSearch.trim();
    return trimmed.length >= 3 ? trimmed : "";
  }, [debouncedSearch]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [contactResultFilter, setContactResultFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchParams, setSearchParams] = useSearchParams();

  // Read ?filter= param from notification links
  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam) {
      const filterMap: Record<string, string> = {
        no_contact: "no_contact",
        no_contact_urgent: "no_contact_urgent",
      };
      const mappedFilter = filterMap[filterParam] || "all";
      setStatusFilter(mappedFilter);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("filter");
      newParams.delete("_t");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Deep-link: ?open=<leadId> opens the details dialog (Olyvia chat links)
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || !activeCompanyId || selectedLead) return;
    let cancelled = false;
    (async () => {
      try {
        const found = leads.find((l) => l.id === openId);
        if (found) {
          if (!cancelled) {
            setSelectedLead(found);
            setDetailTab("info");
            setShowDetails(true);
          }
        } else {
          const { data } = await (supabase as any)
            .from("anew_leads")
            .select("*")
            .eq("id", openId)
            .eq("organization_id", activeCompanyId)
            .maybeSingle();
          if (!cancelled && data) {
            setSelectedLead(data as Lead);
            setDetailTab("info");
            setShowDetails(true);
          } else if (!cancelled) {
            toast({ title: "Lead não encontrado", description: "Pode não existir ou não tens permissão.", variant: "destructive" });
          }
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
  }, [searchParams, activeCompanyId, leads]);

  // Derive totals from statusCounts (single source of truth from RPC)
  const globalTotal = useMemo(() => 
    Object.entries(statusCounts).filter(([key]) => key !== 'converted').reduce((a, [, b]) => a + b, 0), 
    [statusCounts]
  );
  const paginationTotal = useMemo(() => {
    if (statusFilter === 'all') return globalTotal;
    if (statusFilter === 'lost') return (statusCounts['lost'] || 0) + (statusCounts['rejected'] || 0);
    return statusCounts[statusFilter] || 0;
  }, [statusFilter, statusCounts, globalTotal]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);
  const [comercialUsers, setComercialUsers] = useState<{ id: string; name: string; districts: string[]; org_ids: string[] }[]>([]);
  const [assignOrgFilter, setAssignOrgFilter] = useState<string>("all");
  const [assignOrgTree, setAssignOrgTree] = useState<{ id: string; name: string; type: string; depth: number }[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);
  const [showWorkflowConfig, setShowWorkflowConfig] = useState(false);
  const [configCampaignId, setConfigCampaignId] = useState<string>("");
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [createLeadCampaignId, setCreateLeadCampaignId] = useState<string>("");
  const [createLeadFormId, setCreateLeadFormId] = useState<string>("");
  const [createLeadFieldDefs, setCreateLeadFieldDefs] = useState<FieldDefinition[]>([]);
  const [extraCampaignFieldDefs, setExtraCampaignFieldDefs] = useState<FieldDefinition[]>([]);
  const [newLeadValues, setNewLeadValues] = useState<Record<string, any>>({});
  const [creatingLead, setCreatingLead] = useState(false);
  const [availableForms, setAvailableForms] = useState<{id: string; name: string; is_primary: boolean; form_id?: string}[]>([]);
  const [leadSources, setLeadSources] = useState<{id: string; name: string; icon: string | null; color: string | null}[]>([]);
  const [createLeadSourceId, setCreateLeadSourceId] = useState<string>("");

  // Duplicate detection state
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<import("@/components/shared/DuplicateEntityDialog").DuplicateMatch[]>([]);
  const [pendingLeadData, setPendingLeadData] = useState<{ entityId: string; fieldValues: Record<string, any>; assignedTo: string | null; resolvedRootOrgId: string | null; createdBy: string; displayName: string; emailValue: string; phoneValue: string; allFieldDefs: any[] } | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "list">("list");
  const [detailTab, setDetailTab] = useState("info");
  const [showFilters, setShowFilters] = useState(true);
  
  // New field form state
  const [newField, setNewField] = useState({
    field_key: "",
    field_label: "",
    field_type: "text",
    is_required: false,
    is_unique: false,
    contact_field_mapping: "",
    client_field_mapping: ""
  });
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  
  // Contact/Client association state
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [searchingClients, setSearchingClients] = useState(false);
  
  // Column customization state
  const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>([]);

  // Callbacks state
  const [todayCallbacks, setTodayCallbacks] = useState<Lead[]>([]);
  const [callbacksChecked, setCallbacksChecked] = useState(false);
  const [showCallbackAlert, setShowCallbackAlert] = useState(true);
  const [showAISchedulingConfig, setShowAISchedulingConfig] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [leadInteractionCounts, setLeadInteractionCounts] = useState<Record<string, number>>({});
  const [leadDealEntityIds, setLeadDealEntityIds] = useState<Set<string>>(new Set());
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isRootOrg, setIsRootOrg] = useState<boolean | null>(null);

  // Conversion dialog state
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionLead, setConversionLead] = useState<Lead | null>(null);
  const [conversionType, setConversionType] = useState<'contact' | 'client'>('contact');
  const [conversionCampaignId, setConversionCampaignId] = useState<string>("");
  const [isConverting, setIsConverting] = useState(false);
  const conversionLockRef = useRef(false);

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Visit reassign dialog state
  const [showVisitReassignDialog, setShowVisitReassignDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTarget, setEmailTarget] = useState<{ id: string; name: string; email: string; leadId?: string; entityId?: string }>({ id: "", name: "", email: "" });
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppContext | null>(null);

  const openContactDialogForLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowContactDialog(true);
    try {
      localStorage.setItem(LEAD_CONTACT_DIALOG_STATE_KEY, JSON.stringify({
        leadId: lead.id,
        companyId: activeCompanyId || null,
        openedAt: new Date().toISOString(),
      }));
    } catch {
      // Ignore storage failures; the dialog still opens normally.
    }
  }, [activeCompanyId]);

  const handleContactDialogOpenChange = useCallback((nextOpen: boolean) => {
    setShowContactDialog(nextOpen);
    if (!nextOpen) {
      try {
        localStorage.removeItem(LEAD_CONTACT_DIALOG_STATE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }
  }, []);

  useEffect(() => {
    if (!activeCompanyId || showContactDialog || selectedLead) return;
    try {
      const raw = localStorage.getItem(LEAD_CONTACT_DIALOG_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { leadId?: string; companyId?: string | null };
      if (!saved.leadId || saved.companyId !== activeCompanyId) return;
      const existing = leads.find((lead) => lead.id === saved.leadId);
      if (existing) {
        setSelectedLead(existing);
        setShowContactDialog(true);
      }
    } catch {
      localStorage.removeItem(LEAD_CONTACT_DIALOG_STATE_KEY);
    }
  }, [activeCompanyId, leads, selectedLead, showContactDialog]);

  // Cleanup effect to reset any lingering pointer-events blocks from Radix components on unmount
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, []);

  // Dedicated query for today's callbacks (independent of pagination/filters).
  // Ensures the banner reflects ALL callbacks scheduled for today, not only the page rows.
  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("anew_leads")
        .select("*, campaigns(id, name)")
        .eq("organization_id", activeCompanyId)
        .neq("status", "converted")
        .gte("callback_scheduled_at", todayStart.toISOString())
        .lte("callback_scheduled_at", todayEnd.toISOString());
      if (cancelled) return;
      const list = (data || []) as any[];
      setTodayCallbacks(list as Lead[]);
      if (!callbacksChecked) {
        setCallbacksChecked(true);
        if (list.length === 0) {
          toast({
            title: `📅 ${t('leads.noCallbacksToday')}`,
            description: t('leads.noCallbacksTodayDesc'),
          });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  // Determine if active company is a root org (no parent in hierarchy)
  useEffect(() => {
    const checkRoot = async () => {
      if (!activeCompanyId) return;
      // Invalidate descendant cache and reset root flag so guards wait for fresh value
      descendantCacheRef.current = null;
      setIsRootOrg(null);
      // Force the consolidated load effect to re-run as a "first mount" for this org
      initialLoadDoneRef.current = false;
      const { data } = await supabase
        .from("anew_hierarchy")
        .select("id")
        .eq("child_org_id", activeCompanyId)
        .limit(1);
      setIsRootOrg(!data || data.length === 0);
    };
    checkRoot();
  }, [activeCompanyId]);

  // Single consolidated effect for initial load + filter/search changes
  const initialLoadDoneRef = useRef(false);
  
  useEffect(() => {
    if (!activeCompanyId || isRootOrg === null || scopeLoading) return;
    
    if (!initialLoadDoneRef.current) {
      // First mount: load everything, defer secondary data
      initialLoadDoneRef.current = true;
      loadStatusCounts();
      loadLeads();
      loadWorkflowStages();
      
      // Defer secondary loads so critical path renders first
      const timer = setTimeout(() => {
        loadCampaigns();
        loadLeadSources();
        loadContactResults();
        loadForms();
        loadCompanyUsers();
        loadComercialUsers();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      // Subsequent renders: only reload leads + counts (filters/search changed)
      loadLeads();
      loadStatusCounts();
    }
  }, [activeCompanyId, isRootOrg, scopeLoading, effectiveSearch, statusFilter, campaignFilter, assignedToFilter, contactResultFilter, dateFrom, dateTo, onlyMine]);



  const statusToStageMap: Record<string, string> = {
    new: "novo",
    contacted: "contactado",
    qualified: "qualificado",
    proposal_sent: "proposta",
    converted: "ganho",
    won: "ganho",
    lost: "perdido",
    rejected: "perdido",
    callback_scheduled: "contactado",
    visit_scheduled: "contactado",
    negotiation: "proposta",
    no_answer: "contactado",
    incomplete: "novo",
  };

  // Load status counts directly from database (independent of pagination)
  // Uses server-side GROUP BY for maximum performance
  // Now accepts the same filters as the UI to keep counters synchronized
  const loadStatusCounts = useCallback(async () => {
    if (!activeCompanyId) return;
    
    const viewScope = getPermissionScope("leads.view");
    if (viewScope === "NONE") { setStatusCounts({}); return; }
    
    try {
      const rpcParams: Record<string, any> = {
        p_org_id: activeCompanyId,
        p_is_root: isRootOrg || false,
        p_scope: (viewScope === "OWNED" || onlyMine) ? "OWNED" : "ALL",
        p_anew_user_id: scopeAnewUserId || null,
        p_auth_user_id: scopeAuthUserId || null,
      };

      // Pass active UI filters so counters stay synchronized with the list
      if (campaignFilter !== "all") rpcParams.p_campaign_id = campaignFilter;
      if (assignedToFilter === "unassigned") {
        rpcParams.p_assigned_unassigned = true;
      } else if (assignedToFilter !== "all") {
        rpcParams.p_assigned_to = assignedToFilter;
      }
      if (contactResultFilter === "none") {
        rpcParams.p_contact_result_none = true;
      } else if (contactResultFilter !== "all") {
        rpcParams.p_contact_result = contactResultFilter;
      }
      if (dateFrom) rpcParams.p_date_from = startOfDay(dateFrom).toISOString();
      if (dateTo) rpcParams.p_date_to = endOfDay(dateTo).toISOString();
      if (effectiveSearch) rpcParams.p_search = effectiveSearch;

      const { data, error } = await (supabase.rpc as any)('get_lead_status_counts', rpcParams);

      if (error) {
        console.error("Error loading status counts:", error);
        return;
      }

      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        const status = row.status || 'unknown';
        counts[status] = (counts[status] || 0) + Number(row.count);
      });
      
      setStatusCounts(counts);
    } catch (error) {
      console.error("Error loading status counts:", error);
    }
  }, [activeCompanyId, isRootOrg, getPermissionScope, scopeAnewUserId, scopeAuthUserId, campaignFilter, assignedToFilter, contactResultFilter, dateFrom, dateTo, effectiveSearch, onlyMine]);




  const getDescendantOrgIds = useCallback(async (rootId: string): Promise<string[]> => {
    // Return cached result if same root
    if (descendantCacheRef.current?.key === rootId) {
      return descendantCacheRef.current.ids;
    }

    const { data: allHierarchy } = await supabase
      .from("anew_hierarchy")
      .select("parent_org_id, child_org_id");

    if (!allHierarchy) {
      descendantCacheRef.current = { key: rootId, ids: [rootId], hierarchy: [] };
      return [rootId];
    }

    const childrenMap = new Map<string, string[]>();
    allHierarchy.forEach(h => {
      const children = childrenMap.get(h.parent_org_id) || [];
      children.push(h.child_org_id);
      childrenMap.set(h.parent_org_id, children);
    });

    const allIds: string[] = [rootId];
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childrenMap.get(current) || [];
      for (const childId of children) {
        if (!allIds.includes(childId)) {
          allIds.push(childId);
          queue.push(childId);
        }
      }
    }
    
    descendantCacheRef.current = { key: rootId, ids: allIds, hierarchy: allHierarchy };
    return allIds;
  }, []);

  // Resolve the root organization ID by traversing hierarchy upward (cached, cycle-safe)
  const rootOrgCacheRef = useRef<Record<string, string>>({});
  const resolveRootOrgId = async (orgId: string): Promise<string> => {
    if (rootOrgCacheRef.current[orgId]) return rootOrgCacheRef.current[orgId];
    const root = await resolveRootOrgIdLogic(orgId, async (childOrgId) => {
      const { data } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", childOrgId)
        .maybeSingle();
      return data?.parent_org_id ?? null;
    });
    rootOrgCacheRef.current[orgId] = root;
    return root;
  };

  const loadCompanyUsers = async () => {
    if (!activeCompanyId) return;
    
    // Get all descendant org IDs (company + children)
    const orgIds = await getDescendantOrgIds(activeCompanyId);
    
    // Get active members of this organization and all descendants
    const { data: memberships } = await supabase
      .from("anew_memberships")
      .select("user_id, role_id")
      .in("organization_id", orgIds)
      .eq("status", "active");
    
    if (!memberships || memberships.length === 0) {
      setCompanyUsers([]);
      return;
    }

    // Filter out client/portal/contact/lead roles so they don't appear in
    // internal assignment dropdowns (e.g. "Atribuído a" in Leads).
    const roleIds = [...new Set(memberships.map((m: any) => m.role_id).filter(Boolean))];
    const roleCodeMap: Record<string, string> = {};
    if (roleIds.length > 0) {
      const { data: rolesData } = await supabase
        .from("anew_roles")
        .select("id, code")
        .in("id", roleIds);
      (rolesData || []).forEach((r: any) => {
        roleCodeMap[r.id] = (r.code || "").toLowerCase();
      });
    }
    const filteredMemberships = memberships.filter((m: any) => {
      const code = roleCodeMap[m.role_id];
      return !code || !INTERNAL_ASSIGNMENT_EXCLUDED_ROLES.has(code);
    });

    const userIds = [...new Set(filteredMemberships.map((m: any) => m.user_id))];
    
    const { data: usersData } = await supabase
      .from("anew_users")
      .select("id, name")
      .in("id", userIds);
    
    if (usersData) {
      setCompanyUsers(
        usersData.map(u => ({
          id: u.id,
          name: u.name || "Utilizador"
        }))
      );
    }
  };

  // Load members from the "Comercial" department with their address districts
  // Now searches the entire descendant tree for Comercial departments
  const loadComercialUsers = async () => {
    if (!activeCompanyId) return;

    // Get all descendant org IDs from activeCompany (uses cache)
    const allOrgIds = await getDescendantOrgIds(activeCompanyId);

    // Fetch orgs and reuse cached hierarchy in parallel
    const [orgsResult] = await Promise.all([
      supabase
        .from("anew_organizations")
        .select("id, name, type")
        .in("id", allOrgIds),
    ]);
    const allOrgs = orgsResult.data;

    // Reuse hierarchy from cache instead of fetching again
    const allHierarchy = descendantCacheRef.current?.hierarchy || [];

    const comercialDeptIds = (allOrgs || [])
      .filter((o: any) => o.name?.toLowerCase() === 'comercial' && o.type === 'departamento')
      .map((o: any) => o.id);

    // Build BFS tree for the assignment org filter
    const orgMap = new Map((allOrgs || []).map(o => [o.id, { name: o.name, type: o.type || '' }]));
    const childrenMap = new Map<string, string[]>();
    (allHierarchy || []).forEach(h => {
      const children = childrenMap.get(h.parent_org_id) || [];
      children.push(h.child_org_id);
      childrenMap.set(h.parent_org_id, children);
    });

    const tree: { id: string; name: string; type: string; depth: number }[] = [];
    const bfsQueue: { id: string; depth: number }[] = [{ id: activeCompanyId, depth: 0 }];
    const visited = new Set<string>();
    while (bfsQueue.length > 0) {
      const current = bfsQueue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const orgInfo = orgMap.get(current.id);
      if (orgInfo) {
        tree.push({ id: current.id, name: orgInfo.name, type: orgInfo.type, depth: current.depth });
      }
      const children = childrenMap.get(current.id) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          bfsQueue.push({ id: childId, depth: current.depth + 1 });
        }
      }
    }
    setAssignOrgTree(tree);

    // Fallback: if no "Comercial" department found, load all active members from org tree
    const membershipOrgIds = comercialDeptIds.length > 0 ? comercialDeptIds : allOrgIds;

    // Get active members
    const { data: rawMemberships } = await supabase
      .from("anew_memberships")
      .select("user_id, organization_id, role_id")
      .in("organization_id", membershipOrgIds)
      .eq("status", "active");

    const roleIds = [...new Set((rawMemberships || []).map((m: any) => m.role_id).filter(Boolean))];
    const roleCodeMap: Record<string, string> = {};
    if (roleIds.length > 0) {
      const { data: rolesData } = await supabase
        .from("anew_roles")
        .select("id, code")
        .in("id", roleIds);
      (rolesData || []).forEach((r: any) => { roleCodeMap[r.id] = (r.code || "").toLowerCase(); });
    }
    const memberships = (rawMemberships || []).filter((m: any) => {
      const code = roleCodeMap[m.role_id];
      return !code || !INTERNAL_ASSIGNMENT_EXCLUDED_ROLES.has(code);
    });

    if (memberships.length === 0) {
      setComercialUsers([]);
      return;
    }

    const userIds = [...new Set(memberships.map(m => m.user_id))];

    // Get user info
    const { data: usersData } = await supabase
      .from("anew_users")
      .select("id, name, entity_id, status")
      .in("id", userIds)
      .eq("status", "active");

    if (!usersData) {
      setComercialUsers([]);
      return;
    }

    // Build user -> department mapping
    const userDeptMap: Record<string, string[]> = {};
    memberships.forEach(m => {
      if (!userDeptMap[m.user_id]) userDeptMap[m.user_id] = [];
      if (!userDeptMap[m.user_id].includes(m.organization_id)) {
        userDeptMap[m.user_id].push(m.organization_id);
      }
    });

    // Map dept -> parent org (to know which company/loja the comercial dept belongs to)
    const deptParentMap = new Map<string, string>();
    (allHierarchy || []).forEach(h => {
      if (comercialDeptIds.includes(h.child_org_id)) {
        deptParentMap.set(h.child_org_id, h.parent_org_id);
      }
    });

    // Build user -> org_ids (parent orgs of their comercial depts)
    const userOrgMap: Record<string, string[]> = {};
    memberships.forEach(m => {
      const parentOrg = deptParentMap.get(m.organization_id) || m.organization_id;
      if (!userOrgMap[m.user_id]) userOrgMap[m.user_id] = [];
      if (!userOrgMap[m.user_id].includes(parentOrg)) {
        userOrgMap[m.user_id].push(parentOrg);
      }
      // Also include the dept itself
      if (!userOrgMap[m.user_id].includes(m.organization_id)) {
        userOrgMap[m.user_id].push(m.organization_id);
      }
    });

    // 1. Get personal addresses (work addresses) for users
    const entityIds = usersData.map(u => u.entity_id).filter(Boolean) as string[];
    let userPersonalDistricts: Record<string, string[]> = {};

    if (entityIds.length > 0) {
      const { data: userAddresses } = await (supabase as any)
        .from("anew_entity_addresses")
        .select("entity_id, address:anew_addresses!anew_entity_addresses_address_id_fkey(district, city)")
        .in("entity_id", entityIds)
        .is("valid_to", null);

      (userAddresses || []).forEach((ea: any) => {
        const district = ea.address?.district || ea.address?.city;
        if (district && ea.entity_id) {
          if (!userPersonalDistricts[ea.entity_id]) userPersonalDistricts[ea.entity_id] = [];
          if (!userPersonalDistricts[ea.entity_id].includes(district)) {
            userPersonalDistricts[ea.entity_id].push(district);
          }
        }
      });
    }

    // 2. Get department addresses as fallback
    const { data: deptOrgs } = await (supabase as any)
      .from("anew_organizations")
      .select("id, entity_id")
      .in("id", comercialDeptIds);

    const deptEntityMap: Record<string, string> = {};
    (deptOrgs || []).forEach((o: any) => {
      if (o.entity_id) deptEntityMap[o.id] = o.entity_id;
    });

    const deptEntityIds = Object.values(deptEntityMap).filter(Boolean);
    let deptDistricts: Record<string, string[]> = {};

    if (deptEntityIds.length > 0) {
      const { data: deptAddresses } = await (supabase as any)
        .from("anew_entity_addresses")
        .select("entity_id, address:anew_addresses!anew_entity_addresses_address_id_fkey(district, city)")
        .in("entity_id", deptEntityIds)
        .is("valid_to", null);

      (deptAddresses || []).forEach((ea: any) => {
        const district = ea.address?.district || ea.address?.city;
        if (district && ea.entity_id) {
          if (!deptDistricts[ea.entity_id]) deptDistricts[ea.entity_id] = [];
          if (!deptDistricts[ea.entity_id].includes(district)) {
            deptDistricts[ea.entity_id].push(district);
          }
        }
      });
    }

    // Assign districts: prefer user's personal address, fallback to department's
    setComercialUsers(
      usersData.map(u => {
        // First check user's own addresses
        let districts: string[] = [];
        if (u.entity_id && userPersonalDistricts[u.entity_id]?.length > 0) {
          districts = [...userPersonalDistricts[u.entity_id]];
        } else {
          // Fallback: inherit department addresses
          const userDepts = userDeptMap[u.id] || [];
          userDepts.forEach(deptId => {
            const deptEid = deptEntityMap[deptId];
            if (deptEid && deptDistricts[deptEid]) {
              deptDistricts[deptEid].forEach(d => {
                if (!districts.includes(d)) districts.push(d);
              });
            }
          });
        }
        return {
          id: u.id,
          name: u.name || "Utilizador",
          districts,
          org_ids: userOrgMap[u.id] || [],
        };
      })
    );
  };


  const loadForms = async () => {
    if (!activeCompanyId) return;
    
    // Load forms and campaign forms in parallel
    const [formsResult, campaignFormsResult] = await Promise.all([
      supabase
        .from("forms")
        .select("id, name, is_primary")
        .eq("organization_id", activeCompanyId)
        .eq("is_active", true)
        .eq("form_type", "lead")
        .order("is_primary", { ascending: false }),
      supabase
        .from("campaigns")
        .select("form_id, forms!campaigns_form_id_fkey(id, name, is_primary)")
        .eq("organization_id", activeCompanyId)
        .not("form_id", "is", null),
    ]);
    
    // Merge forms, avoiding duplicates
    const allForms = [...(formsResult.data || [])];
    (campaignFormsResult.data || []).forEach(cf => {
      const form = cf.forms as unknown as { id: string; name: string; is_primary: boolean } | null;
      if (form && !allForms.find(f => f.id === form.id)) {
        allForms.push(form);
      }
    });
    
    setAvailableForms(allForms);
  };

  const loadContactResults = async () => {
    const { data } = await supabase
      .from("lead_contact_results")
      .select("id, name, icon, color")
      .or(`organization_id.is.null,organization_id.eq.${activeCompanyId}`)
      .eq("is_active", true);
    
    if (data) {
      setContactResults(data);
    }
  };

  const getContactResultInfo = useCallback((resultName: string | undefined) => {
    if (!resultName) return null;
    return contactResults.find(r => r.id === resultName || r.name === resultName);
  }, [contactResults]);

  const loadWorkflowStages = async () => {
    if (!activeCompanyId) return;
    
    const { data: allStages, error } = await supabase
      .from("lead_workflow_stages")
      .select("id, name, label, color, stage_order, is_active, is_conversion, is_rejection, is_final, organization_id, default_status")
      .or(`organization_id.eq.${activeCompanyId},organization_id.is.null`)
      .eq("is_active", true)
      .order("stage_order");

    const mapStage = (s: any): WorkflowStage => ({
      ...s,
      organization_id: s.organization_id ?? null,
      default_status: s.default_status ?? null,
    });

    if (!error && allStages) {
      const orgStages = allStages.filter(s => s.organization_id === activeCompanyId);
      const globalStages = allStages.filter(s => !s.organization_id);
      setWorkflowStages((orgStages.length > 0 ? orgStages : globalStages).map(mapStage));
    } else {
      setWorkflowStages([]);
    }
  };

  // Helper to get status color from workflow stage or fallback
  const getStatusColor = useCallback((status: string) => {
    const stage = workflowStages.find(s => s.name === status);
    if (stage) {
      return { backgroundColor: stage.color + '20', color: stage.color };
    }
    // Fallback colors
    const fallback: Record<string, string> = {
      new: "#3b82f6",
      contacted: "#eab308", 
      qualified: "#22c55e",
      converted: "#8b5cf6",
      rejected: "#ef4444",
      visit_scheduled: "#f97316",
      scheduled: "#f97316",
    };
    const color = fallback[status] || "#6b7280";
    return { backgroundColor: color + '20', color };
  }, [workflowStages]);

  // Map DB status values to translation keys
  const statusTranslationKeys: Record<string, string> = {
    new: 'contactResults.statuses.new',
    contacted: 'contactResults.statuses.contacted',
    callback_scheduled: 'contactResults.statuses.callbackScheduled',
    visit_scheduled: 'contactResults.statuses.visitScheduled',
    scheduled: 'contactResults.statuses.visitScheduled',
    qualified: 'contactResults.statuses.qualified',
    proposal_sent: 'contactResults.statuses.proposalSent',
    negotiation: 'contactResults.statuses.negotiation',
    won: 'contactResults.statuses.converted',
    lost: 'contactResults.statuses.lost',
    no_answer: 'contactResults.statuses.noAnswer',
    converted: 'contactResults.statuses.converted',
    rejected: 'contactResults.statuses.rejected',
    incomplete: 'contactResults.statuses.new',
  };

  // Get status label from workflow (translated) 
  const getStatusLabel = useCallback((status: string) => {
    const stage = workflowStages.find(s => s.name === status);
    if (stage?.label) return stage.label;
    const key = statusTranslationKeys[status];
    return key ? t(key) : status;
  }, [workflowStages, t]);

  const normalizeStatusToken = (value: string | null | undefined) => {
    return (value || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  };

  const isVisitScheduledValue = (value: string | null | undefined) => {
    const normalized = normalizeStatusToken(value);
    return normalized === 'visit_scheduled' || normalized === 'visita_agendada';
  };

  const isVisitScheduledSignal = (
    leadOrResult: { scheduled_visit_id?: string | null; last_contact_result?: string | null } | string | null | undefined,
    knownVisitResultIds?: Set<string>
  ) => {
    const resultValue = typeof leadOrResult === 'string'
      ? leadOrResult
      : leadOrResult?.last_contact_result;

    const hasLinkedVisit = typeof leadOrResult === 'string' ? false : Boolean(leadOrResult?.scheduled_visit_id);
    if (hasLinkedVisit) return true;

    if (knownVisitResultIds?.has(resultValue || '')) return true;
    if (isVisitScheduledValue(resultValue)) return true;

    const resultInfo = getContactResultInfo(resultValue || undefined);
    if (resultInfo && (isVisitScheduledValue(resultInfo.name) || isVisitScheduledValue(resultInfo.id))) {
      return true;
    }

    return false;
  };

  // Compute effective status: if a lead has a scheduled visit signal, show visit_scheduled regardless of raw status.
  // EXCEPT when the user has explicitly moved the lead to a later/decisive state via the contact dialog
  // (callback_scheduled, rejected, lost, converted, qualified, proposal_sent). In those cases the real
  // status wins so the UI stays in sync with last_contact_result.
  const STATUS_OVERRIDES_VISIT = new Set([
    'callback_scheduled',
    'rejected',
    'lost',
    'converted',
    'qualified',
    'proposal_sent',
  ]);
  const getEffectiveStatus = useCallback((lead: any): string => {
    const rawStatus = lead.status || 'new';
    if (STATUS_OVERRIDES_VISIT.has(rawStatus)) return rawStatus;
    if (rawStatus === 'visit_scheduled' || rawStatus === 'scheduled') return 'visit_scheduled';
    if (isVisitScheduledSignal(lead)) return 'visit_scheduled';
    return rawStatus;
  }, [isVisitScheduledSignal]);

  useEffect(() => {
    if (configCampaignId) {
      loadFieldDefinitions(configCampaignId);
    }
  }, [configCampaignId]);

  const loadCampaigns = useCallback(async () => {
    if (!activeCompanyId) return;
    
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, name, status, form_id")
      .eq("organization_id", activeCompanyId)
      .eq("status", "active")
      .order("name");

    if (!error && data) {
      setCampaigns(data.map(c => ({ id: c.id, name: c.name, form_id: c.form_id })));
      // Set first campaign as default for config
      if (data.length > 0 && !configCampaignId) {
        setConfigCampaignId(data[0].id);
      }
    } else if (error) {
      console.error("Error loading campaigns:", error);
    }
  }, [activeCompanyId, configCampaignId]);

  const loadLeadSources = async () => {
    const { data } = await supabase
      .from("lead_sources")
      .select("id, name, icon, color")
      .eq("is_active", true)
      .order("name");
    if (data) setLeadSources(data);
  };


  // Load leads with server-side pagination
  const loadLeads = useCallback(async (append = false) => {
    if (!activeCompanyId) return;
    
    if (append) {
      if (isLoadingRef.current) return;
      setLoadingMore(true);
    } else {
      setLoading(true);
      currentPageRef.current = 0;
    }
    isLoadingRef.current = true;
    
    const from = currentPageRef.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    
    const viewScope = getPermissionScope("leads.view");
    if (viewScope === "NONE") {
      setLeads([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
      return;
    }
    
    // Build server-side filters helper
    const applyServerFilters = (q: any) => {
      if (statusFilter !== "all") {
        if (statusFilter === "lost") {
          q = q.in("status", ["lost", "rejected"]);
        } else if (statusFilter === "visit_scheduled") {
          // Include raw visit_scheduled OR leads that are effectively visit_scheduled
          // (status=new but have scheduled_visit_id or last_contact_result = Visita Agendada)
          // We filter server-side for status=visit_scheduled, then also include new+signal client-side
          q = q.or("status.eq.visit_scheduled,scheduled_visit_id.not.is.null");
        } else if (statusFilter === "new") {
          // Exclude leads that are effectively visit_scheduled even though raw status is new
          q = q.eq("status", "new").is("scheduled_visit_id", null);
        } else {
          q = q.eq("status", statusFilter);
        }
      }
      if (campaignFilter !== "all") q = q.eq("campaign_id", campaignFilter);
      if (assignedToFilter !== "all") {
        if (assignedToFilter === "unassigned") {
          q = q.is("assigned_to", null);
        } else {
          q = q.eq("assigned_to", assignedToFilter);
        }
      }
      if (contactResultFilter !== "all") {
        if (contactResultFilter === "none") {
          q = q.is("last_contact_result", null);
        } else {
          q = q.eq("last_contact_result", contactResultFilter);
        }
      }
      if (dateFrom) q = q.gte("created_at", startOfDay(dateFrom).toISOString());
      if (dateTo) q = q.lte("created_at", endOfDay(dateTo).toISOString());
      if (effectiveSearch) {
        q = q.ilike("search_text", `%${effectiveSearch}%`);
      }
      return q;
    };

    // Total count is now derived from statusCounts (loaded via RPC) — no separate count query needed
    
    let query = supabase
      .from("anew_leads")
      .select(`
        id, entity_id, campaign_id,
        status, workflow_stage_id, assigned_to, created_by,
        organization_id, root_organization_id,
        created_at, updated_at, converted_at,
        converted_to_contact_id, converted_to_client_id, scheduled_visit_id,
        field_values, notes, source, source_id,
        last_contact_at, last_contact_result, contact_attempts,
        callback_scheduled_at, callback_notes,
        tags, search_text,
        campaigns(id, name)
      `)
      .is("deleted_at", null)
      .neq("status", "converted")
      .is("converted_to_contact_id", null)
      .is("converted_at", null);
    
    if (isRootOrg) {
      query = query.or(`root_organization_id.eq.${activeCompanyId},organization_id.eq.${activeCompanyId}`);
    } else {
      query = query.or(`organization_id.eq.${activeCompanyId}`);
    }

    if ((viewScope === "OWNED" || onlyMine) && scopeAnewUserId) {
      query = query.or(`assigned_to.eq.${scopeAnewUserId},created_by.eq.${scopeAnewUserId}`);
    }

    query = applyServerFilters(query);
    
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      toast({ title: "Error loading leads", description: error.message, variant: "destructive" });
    } else {
      const allUserIds = new Set<string>();
      for (const d of (data || [])) {
        if (d.created_by && d.source !== 'web' && d.source !== 'api' && d.source !== 'import') {
          allUserIds.add(d.created_by);
        }
        if (d.assigned_to) {
          allUserIds.add(d.assigned_to as string);
        }
      }
      
      const userMap = new Map<string, { id: string; name: string }>();
      if (allUserIds.size > 0) {
        const { data: usersData } = await supabase
          .from("anew_users")
          .select("id, name")
          .in("id", Array.from(allUserIds));
        for (const u of (usersData || [])) {
          userMap.set(u.id, u);
        }
      }

      const mappedLeads = (data || []).map((d) => {
        let profiles = null;
        let assigned_user = null;
        
        if (d.created_by && d.source !== 'web' && d.source !== 'api' && d.source !== 'import') {
          const u = userMap.get(d.created_by);
          profiles = u ? { name: u.name } : null;
        }
        
        if (d.assigned_to) {
          const u = userMap.get(d.assigned_to as string);
          assigned_user = u ? { id: u.id, name: u.name } : null;
        }
        
        return {
          ...d,
          field_values: (d.field_values && typeof d.field_values === 'object' && !Array.isArray(d.field_values)) 
            ? d.field_values as Record<string, any>
            : {},
          campaigns: d.campaigns as { id: string; name: string } | null,
          profiles,
          assigned_user,
          assigned_to: d.assigned_to as string | null,
          last_contact_at: d.last_contact_at as string | null,
          callback_scheduled_at: d.callback_scheduled_at as string | null,
          callback_notes: d.callback_notes as string | null
        };
      }) as Lead[];

      const entityIds = mappedLeads.flatMap(l => [
        l.entity_id,
      ]).filter(Boolean) as string[];
      if (entityIds.length > 0) {
        await resolveEntities(entityIds);
      }

      // Fetch interaction counts (30d) and deal associations for health score
      // Only on first page / refresh — loadMore reuses existing health data.
      const leadEntityIds = mappedLeads.map(l => l.entity_id).filter(Boolean) as string[];
      if (!append && leadEntityIds.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [{ data: interData }, { data: dealData }] = await Promise.all([
          supabase
            .from("entity_interactions")
            .select("entity_id")
            .in("entity_id", leadEntityIds)
            .gte("interaction_at", thirtyDaysAgo.toISOString()),
          supabase
            .from("deals")
            .select("entity_id")
            .in("entity_id", leadEntityIds)
            .not("status", "in", '("won","lost")'),
        ]);

        const counts: Record<string, number> = {};
        (interData || []).forEach(r => {
          counts[r.entity_id] = (counts[r.entity_id] || 0) + 1;
        });
        setLeadInteractionCounts(counts);

        const dealSet = new Set<string>();
        (dealData || []).forEach(r => {
          if (r.entity_id) dealSet.add(r.entity_id);
        });
        setLeadDealEntityIds(dealSet);
      }

      // Client-side post-filter: ensure effective status alignment
      // When filtering by "new", exclude leads that are effectively visit_scheduled (via last_contact_result)
      // When filtering by "visit_scheduled", include leads that are effectively visit_scheduled regardless of raw status
      let finalLeads = mappedLeads;
      if (statusFilter === "new") {
        finalLeads = mappedLeads.filter(l => !isVisitScheduledSignal(l));
      } else if (statusFilter === "visit_scheduled") {
        // Server already returns status=visit_scheduled and scheduled_visit_id!=null
        // But we also need leads with last_contact_result indicating visit_scheduled
        // These are already included if raw status matches, but some may have status=new + last_contact_result signal
        // The server OR filter covers scheduled_visit_id, but not last_contact_result text matching
        // So we keep all results (server already filtered) — no extra exclusion needed
      }
      
      if (append) {
        setLeads(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const newLeads = finalLeads.filter(l => !existingIds.has(l.id));
          return [...prev, ...newLeads];
        });
      } else {
        setLeads(finalLeads);
      }
      
      setHasMore(mappedLeads.length === PAGE_SIZE);
      currentPageRef.current += 1;
    }
    
    isLoadingRef.current = false;
    setLoading(false);
    setLoadingMore(false);
  }, [activeCompanyId, isRootOrg, toast, getPermissionScope, scopeAnewUserId, scopeAuthUserId, effectiveSearch, statusFilter, campaignFilter, assignedToFilter, contactResultFilter, dateFrom, dateTo, onlyMine]);

  // Refresh a single lead in-place (prevents losing infinite scroll state)
  const refreshSingleLead = useCallback(async (leadId: string) => {
    if (!activeCompanyId) return;

    // L5: usar lista de colunas explícita (mesma de loadLeads) em vez de '*'
    // para reduzir payload e evitar trazer colunas internas como search_text.
    const { data: d, error } = await supabase
      .from("anew_leads")
      .select(`
        id, entity_id, campaign_id,
        status, workflow_stage_id, assigned_to, created_by,
        organization_id, root_organization_id,
        created_at, updated_at, converted_at,
        converted_to_contact_id, converted_to_client_id, scheduled_visit_id,
        field_values, notes, source, source_id,
        last_contact_at, last_contact_result, contact_attempts,
        callback_scheduled_at, callback_notes,
        tags,
        campaigns(id, name)
      `)
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      console.error("Error refreshing lead:", error);
      return;
    }

    if (!d) {
      // Lead was deleted — remove from local state
      setLeads(prev => prev.filter(l => l.id !== leadId));
      return;
    }

    // Map the single lead — batch user lookups in parallel
    let profiles = null;
    let assigned_user = null;

    const userIdsToFetch = [...new Set([d.created_by, d.assigned_to].filter(Boolean))] as string[];
    if (userIdsToFetch.length > 0) {
      const { data: users } = await supabase
        .from("anew_users")
        .select("id, name")
        .in("id", userIdsToFetch);
      const userMap: Record<string, string> = {};
      (users || []).forEach(u => { userMap[u.id] = u.name || ''; });

      if (d.created_by && d.source !== 'web' && d.source !== 'api' && d.source !== 'import' && userMap[d.created_by]) {
        profiles = { name: userMap[d.created_by] };
      }
      if (d.assigned_to && userMap[d.assigned_to]) {
        assigned_user = { id: d.assigned_to, name: userMap[d.assigned_to] };
      }
    }

    const mapped: Lead = {
      ...d,
      field_values: (d.field_values && typeof d.field_values === 'object' && !Array.isArray(d.field_values))
        ? d.field_values as Record<string, any>
        : {},
      campaigns: d.campaigns as { id: string; name: string } | null,
      profiles,
      assigned_user,
      assigned_to: d.assigned_to as string | null,
      last_contact_at: d.last_contact_at as string | null,
      callback_scheduled_at: d.callback_scheduled_at as string | null,
      callback_notes: d.callback_notes as string | null,
    };

    // Resolve entity identities
    const entityIds = [mapped.entity_id].filter(Boolean) as string[];
    if (entityIds.length > 0) {
      await resolveEntities(entityIds);
    }

    setLeads(prev => prev.map(l => l.id === leadId ? mapped : l));
    // Refresh status counts since the lead's status may have changed
    loadStatusCounts();
  }, [activeCompanyId, loadStatusCounts]);

  // Load more leads for infinite scroll
  const loadMoreLeads = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      loadLeads(true);
    }
  }, [loading, loadingMore, hasMore, loadLeads]);

  // Effective hasMore: stop loading when we've reached the RPC total
  const effectiveHasMore = hasMore && leads.length < paginationTotal;

  // Setup infinite scroll
  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMoreLeads,
    hasMore: effectiveHasMore,
    isLoading: loading || loadingMore
  });

  // Debounce timers for search inputs (300ms) — cancels pending query on each keystroke
  const searchContactsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchClientsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search contacts for association
  const searchContacts = (query: string) => {
    if (searchContactsTimer.current) clearTimeout(searchContactsTimer.current);
    if (!query || query.length < 2) {
      setContactOptions([]);
      return;
    }
    searchContactsTimer.current = setTimeout(async () => {
      setSearchingContacts(true);
      // First resolve entity IDs matching the query, then find associated contacts
      const { ids: matchingEntityIds } = await searchEntityIds(query);
      if (matchingEntityIds.length === 0) {
        setContactOptions([]);
        setSearchingContacts(false);
        return;
      }
      const { data } = await supabase
        .from("anew_contacts")
        .select("id, entity_id")
        .eq("organization_id", activeCompanyId)
        .eq("status", "active")
        .in("entity_id", matchingEntityIds)
        .limit(10);
      const results = (data || []).map((c: any) => ({ id: c.id, entity_id: c.entity_id }));
      const eIds = results.map((r: any) => r.entity_id).filter(Boolean);
      if (eIds.length > 0) await resolveEntities(eIds);
      setContactOptions(results as ContactOption[]);
      setSearchingContacts(false);
    }, 300);
  };

  // Search clients for association
  const searchClients = (query: string) => {
    if (searchClientsTimer.current) clearTimeout(searchClientsTimer.current);
    if (!query || query.length < 2) {
      setClientOptions([]);
      return;
    }
    searchClientsTimer.current = setTimeout(async () => {
      setSearchingClients(true);
      // First resolve entity IDs matching the query, then find associated clients
      const { ids: matchingEntityIds } = await searchEntityIds(query);
      if (matchingEntityIds.length === 0) {
        setClientOptions([]);
        setSearchingClients(false);
        return;
      }
      const { data } = await supabase
        .from("anew_clients")
        .select("id, entity_id")
        .eq("organization_id", activeCompanyId)
        .in("entity_id", matchingEntityIds)
        .limit(10);
      const results = (data || []).map((c: any) => ({ id: c.id, entity_id: c.entity_id }));
      const eIds = results.map((r: any) => r.entity_id).filter(Boolean);
      if (eIds.length > 0) await resolveEntities(eIds);
      setClientOptions(results as ClientOption[]);
      setSearchingClients(false);
    }, 300);
  };

  // Associate lead with contact (uses converted_to_contact_id → anew_contacts).
  const handleAssociateContact = async (leadId: string, contactId: string | null) => {
    const { error } = await supabase
      .from("anew_leads")
      .update({ converted_to_contact_id: contactId } as any)
      .eq("id", leadId);

    if (error) {
      toast({ title: t('leads.toast.associateContactError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: contactId ? t('leads.toast.contactAssociated') : t('leads.toast.contactRemoved') });
      refreshSingleLead(leadId);
    }
  };

  // Associate lead with client (uses converted_to_client_id → anew_clients).
  // Legacy column client_id references the deprecated `clients` table and must not be used.
  const handleAssociateClient = async (leadId: string, clientId: string | null) => {
    const { error } = await supabase
      .from("anew_leads")
      .update({ converted_to_client_id: clientId } as any)
      .eq("id", leadId);

    if (error) {
      toast({ title: t('leads.toast.associateClientError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: clientId ? t('leads.toast.clientAssociated') : t('leads.toast.clientRemoved') });
      refreshSingleLead(leadId);
    }
  };

  const loadFieldDefinitions = async (campaignId: string) => {
    if (!campaignId) return;

    // Try to get form_id from campaign — form_fields has correct contact_field_mapping
    const { data: campaignRow } = await supabase
      .from("campaigns")
      .select("form_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignRow?.form_id) {
      // NOTE: `default_value` lives on `lead_field_definitions` (HubSpot Property Model),
      // NOT on `form_fields` — including it here causes a 400 (column does not exist).
      const { data: formFields, error: ffError } = await supabase
        .from("form_fields")
        .select("id, form_id, field_key, field_label, field_type, is_required, is_active, sort_order, options, placeholder, contact_field_mapping, client_field_mapping")
        .eq("form_id", campaignRow.form_id)
        .eq("is_active", true)
        .order("sort_order");

      if (!ffError && formFields && formFields.length > 0) {
        // Map form_fields to same FieldDefinition shape
        const mapped = formFields.map((f: any) => ({
          id: f.id,
          campaign_id: campaignId,
          field_key: f.field_key,
          field_label: f.field_label,
          field_type: f.field_type,
          is_required: f.is_required,
          is_unique: false,
          is_active: f.is_active,
          sort_order: f.sort_order,
          options: f.options,
          placeholder: f.placeholder,
          default_value: null,
          organization_id: null,
          contact_field_mapping: f.contact_field_mapping,
          client_field_mapping: f.client_field_mapping,
        }));
        setFieldDefs(mapped as any);
        loadReferenceData(mapped as any);
        return;
      }
    }

    // Fallback: legacy lead_field_definitions
    const { data, error } = await supabase
      .from("lead_field_definitions")
      .select("id, campaign_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, default_value, organization_id, contact_field_mapping, client_field_mapping")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading field definitions:", error);
    } else {
      setFieldDefs(data || []);
      loadReferenceData(data || []);
    }
  };

  // Load reference data for fields that store IDs (ref_district, ref_company, etc.)
  const loadReferenceData = async (fields: FieldDefinition[]) => {
    const refFields = fields.filter(f => f.field_type.startsWith('ref_'));
    if (refFields.length === 0) return;

    const types = new Set(refFields.map(f => f.field_type));
    const newRefData: Record<string, Record<string, string>> = {};

    // Pre-fetch orgIds once (shared by ref_company, ref_contact, ref_client)
    const orgIds = activeCompanyId ? await getDescendantOrgIds(activeCompanyId) : [];

    const loaders: Promise<void>[] = [];

    if (types.has('ref_district')) {
      loaders.push(
        Promise.resolve(supabase.from('administrative_divisions').select('id, name').eq('admin_level', 1)
          .then(({ data }) => {
            const map: Record<string, string> = {};
            (data || []).forEach(d => { map[d.id] = d.name; });
            refFields.filter(f => f.field_type === 'ref_district').forEach(f => { newRefData[f.field_key] = map; });
          }))
      );
    }

    if (types.has('ref_company') && orgIds.length > 0) {
      loaders.push(
        Promise.resolve(supabase.from('anew_organizations').select('id, name').in('id', orgIds)
          .then(({ data }) => {
            const map: Record<string, string> = {};
            (data || []).forEach(c => { map[c.id] = c.name; });
            refFields.filter(f => f.field_type === 'ref_company').forEach(f => { newRefData[f.field_key] = map; });
          }))
      );
    }

    if (types.has('ref_contact') && activeCompanyId && orgIds.length > 0) {
      loaders.push(
        Promise.resolve(supabase.from('anew_contacts').select('id, entity_id').in('organization_id', orgIds).eq('status', 'active')
          .then(async ({ data: contacts }) => {
            if (!contacts) return;
            const eIds = contacts.map(c => c.entity_id).filter(Boolean);
            if (eIds.length > 0) await resolveEntities(eIds);
            const map: Record<string, string> = {};
            contacts.forEach((c: any) => {
              const identity = getIdentity(c.entity_id);
              map[c.id] = identity?.display_name || `Contact #${c.id.slice(0, 8)}`;
            });
            refFields.filter(f => f.field_type === 'ref_contact').forEach(f => { newRefData[f.field_key] = map; });
          }))
      );
    }

    if (types.has('ref_client') && activeCompanyId) {
      loaders.push(
        Promise.resolve(supabase.from('anew_clients').select('id, entity_id').eq('organization_id', activeCompanyId)
          .then(async ({ data: clients }) => {
            if (!clients) return;
            const eIds = (clients as any[]).map((c: any) => c.entity_id).filter(Boolean);
            if (eIds.length > 0) await resolveEntities(eIds);
            const map: Record<string, string> = {};
            (clients as any[]).forEach((c: any) => {
              const identity = getIdentity(c.entity_id);
              map[c.id] = identity?.display_name || `Client #${c.id.slice(0, 8)}`;
            });
            refFields.filter(f => f.field_type === 'ref_client').forEach(f => { newRefData[f.field_key] = map; });
          }))
      );
    }

    await Promise.all(loaders);
    setReferenceData(prev => ({ ...prev, ...newRefData }));
  };

  // Helper to resolve reference values
  const resolveFieldValue = useCallback((fieldKey: string, value: any): string => {
    if (!value) return "-";
    
    // Check if this field has reference data
    if (referenceData[fieldKey] && referenceData[fieldKey][value]) {
      return referenceData[fieldKey][value];
    }
    
    // If value looks like a UUID but we don't have reference data, show abbreviated
    if (typeof value === 'string' && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)) {
      return value.substring(0, 8) + '...';
    }
    
    // Handle arrays (multi-select)
    if (Array.isArray(value)) {
      return value.map(v => referenceData[fieldKey]?.[v] || v).join(', ');
    }
    
    return sanitizeFieldValue(value);
  }, [referenceData]);

  // Smart field extraction: find value by pattern matching field keys
  const extractSmartField = (fieldValues: Record<string, any> | null, patterns: string[]): string => {
    if (!fieldValues) return "-";
    
    for (const key of Object.keys(fieldValues)) {
      if (key === '_meta') continue;
      const keyLower = key.toLowerCase();
      if (patterns.some(p => keyLower.includes(p))) {
        const value = fieldValues[key];
        if (value && value !== '') return String(value);
      }
    }
    return "-";
  };

  // Extract phone number from lead field values
  const extractPhoneFromLead = (fieldValues: Record<string, any> | null): string | null => {
    if (!fieldValues) return null;
    
    const phonePatterns = ['phone', 'telefone', 'tel', 'mobile', 'telemovel', 'contacto', 'celular'];
    
    for (const key of Object.keys(fieldValues)) {
      if (key === '_meta') continue;
      const keyLower = key.toLowerCase();
      if (phonePatterns.some(p => keyLower.includes(p))) {
        const value = fieldValues[key];
        if (value && value !== '') return String(value);
      }
    }
    return null;
  };

  // Format phone for WhatsApp link (remove non-digits, add country code if needed)
  const formatWhatsAppLink = (phone: string): string => {
    // Remove all non-digit characters
    let cleanPhone = phone.replace(/\D/g, '');
    
    // If starts with 00, remove it
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.substring(2);
    }
    
    // If doesn't start with country code (assuming PT 351 if 9 digits)
    if (cleanPhone.length === 9 && (cleanPhone.startsWith('9') || cleanPhone.startsWith('2'))) {
      cleanPhone = '351' + cleanPhone;
    }
    
    return `https://wa.me/${cleanPhone}`;
  };

  // Check if a field key is a phone field
  const isPhoneField = (fieldKey: string): boolean => {
    const keyLower = fieldKey.toLowerCase();
    return ['phone', 'telefone', 'tel', 'mobile', 'telemovel', 'contacto', 'celular'].some(p => keyLower.includes(p));
  };

  const handleAddField = async () => {
    if (!configCampaignId || !newField.field_key || !newField.field_label) {
      toast({ title: t('leads.toast.fillCampaignAndField'), variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("lead_field_definitions")
      .insert({
        campaign_id: configCampaignId,
        organization_id: activeCompanyId,
        field_key: newField.field_key.toLowerCase().replace(/\s+/g, '_'),
        field_label: newField.field_label,
        field_type: newField.field_type,
        is_required: newField.is_required,
        is_unique: newField.is_unique,
        contact_field_mapping: newField.contact_field_mapping || null,
        client_field_mapping: newField.client_field_mapping || null,
        sort_order: fieldDefs.length,
        created_by: scopeAnewUserId,
      });

    if (error) {
      toast({ title: t('leads.toast.fieldAddError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t('leads.toast.fieldAdded') });
      setNewField({ field_key: "", field_label: "", field_type: "text", is_required: false, is_unique: false, contact_field_mapping: "", client_field_mapping: "" });
      loadFieldDefinitions(configCampaignId);
    }
  };

  const handleUpdateField = async () => {
    if (!editingField) return;

    const { error } = await supabase
      .from("lead_field_definitions")
      .update({
        field_label: editingField.field_label,
        field_type: editingField.field_type,
        is_required: editingField.is_required,
        is_unique: editingField.is_unique,
        contact_field_mapping: editingField.contact_field_mapping || null,
        client_field_mapping: editingField.client_field_mapping || null
      })
      .eq("id", editingField.id);

    if (error) {
      toast({ title: t('leads.toast.fieldUpdateError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t('leads.toast.fieldUpdated') });
      setEditingField(null);
      loadFieldDefinitions(configCampaignId);
    }
  };

  const handleDeleteField = async (id: string) => {
    const { error } = await supabase
      .from("lead_field_definitions")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast({ title: t('leads.toast.fieldDeleteError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t('leads.toast.fieldDeleted') });
      loadFieldDefinitions(configCampaignId);
    }
  };

  // Auto-mapping aliases for common field names
  const FIELD_ALIASES: Record<string, string[]> = {
    first_name: ['first_name', 'nome', 'firstName', 'primeiro_nome', 'name', 'nome_completo', 'primeironome'],
    last_name: ['last_name', 'apelido', 'lastName', 'ultimo_nome', 'surname', 'sobrenome', 'ultimonome'],
    email: ['email', 'e-mail', 'e_mail', 'mail', 'correio_eletronico', 'correio'],
    phone: ['phone', 'telefone', 'telemovel', 'mobile', 'cel', 'telemóvel', 'cellphone', 'contacto', 'celular'],
    phone_country_code: ['phone_country_code', 'codigo_pais', 'country_code', 'indicativo', 'ddi'],
    company_name: ['company_name', 'empresa', 'company', 'nome_empresa', 'organizacao', 'companyname'],
    vat: ['vat', 'nif', 'contribuinte', 'fiscal', 'tax_id', 'taxid', 'numero_contribuinte'],
    position: ['position', 'cargo', 'funcao', 'job_title', 'profissao', 'jobtitle'],
    address: ['address', 'morada', 'endereco', 'rua', 'endereço', 'street'],
    city: ['city', 'cidade', 'localidade'],
    postal_code: ['postal_code', 'codigo_postal', 'cp', 'cep', 'postalcode', 'zip', 'zipcode'],
    district: ['district', 'distrito', 'regiao', 'região', 'provincia', 'estado'],
    notes: ['notes', 'notas', 'observacoes', 'observações', 'comentarios', 'obs'],
    website: ['website', 'site', 'url', 'pagina', 'web'],
    industry: ['industry', 'industria', 'setor', 'ramo', 'sector'],
  };

  // Extract fields using automatic mapping (aliases)
  const extractFieldsWithAutoMapping = (fieldValues: Record<string, any> | null, targetType: 'contact' | 'client'): Record<string, any> => {
    const result: Record<string, any> = {};
    if (!fieldValues) return result;

    const targetFields = targetType === 'contact' 
      ? ['first_name', 'last_name', 'email', 'phone', 'phone_country_code', 'vat', 'position', 'address', 'city', 'postal_code', 'district', 'notes', 'website']
      : ['first_name', 'last_name', 'email', 'phone', 'phone_country_code', 'company_name', 'vat', 'position', 'industry', 'website', 'address', 'city', 'postal_code', 'district', 'notes'];

    for (const targetField of targetFields) {
      const aliases = FIELD_ALIASES[targetField] || [targetField];
      
      for (const key of Object.keys(fieldValues)) {
        if (key === '_meta') continue;
        const keyLower = key.toLowerCase().replace(/[-_\s]/g, '');
        
        if (aliases.some(alias => keyLower === alias.toLowerCase().replace(/[-_\s]/g, '') || keyLower.includes(alias.toLowerCase().replace(/[-_\s]/g, '')))) {
          const value = fieldValues[key];
          if (value && value !== '') {
            result[targetField] = value;
            break; // Found a match, move to next target field
          }
        }
      }
    }

    return result;
  };

  // Opens the conversion dialog to ask about campaign association
  const openConversionDialog = (lead: Lead, type: 'contact' | 'client') => {
    setConversionLead(lead);
    setConversionType(type);
    setConversionCampaignId(lead.campaign_id || "");
    setShowConversionDialog(true);
  };

  // Execute the actual conversion (contact or client)
  const executeConversion = async () => {
    if (!conversionLead || conversionLockRef.current) return;

    conversionLockRef.current = true;
    setIsConverting(true);
    try {
      if (conversionType === 'contact') {
        await doConvertToContact(conversionLead, conversionCampaignId || null);
      } else {
        await doConvertToClient(conversionLead, conversionCampaignId || null);
      }
      setShowConversionDialog(false);
      setConversionLead(null);
    } finally {
      conversionLockRef.current = false;
      setIsConverting(false);
    }
  };

  const doConvertToContact = async (lead: Lead, selectedCampaignId: string | null) => {
    let contactData: Record<string, any> = {};
    let usedAutoMapping = false;

    // Try campaign-based mapping first if campaign exists
    const campaignToUse = selectedCampaignId || lead.campaign_id;
    if (campaignToUse) {
      const { data: fieldDefsForConvert } = await supabase
        .from("lead_field_definitions")
        .select("id, campaign_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, default_value, organization_id, contact_field_mapping, client_field_mapping")
        .eq("campaign_id", campaignToUse)
        .eq("is_active", true);

      const fieldsWithMapping = (fieldDefsForConvert || []).filter(f => f.contact_field_mapping);
      
      if (fieldsWithMapping.length > 0) {
        for (const field of fieldsWithMapping) {
          const leadValue = lead.field_values?.[field.field_key];
          if (leadValue && field.contact_field_mapping) {
            contactData[field.contact_field_mapping] = leadValue;
          }
        }
      } else {
        contactData = extractFieldsWithAutoMapping(lead.field_values, 'contact');
        usedAutoMapping = true;
      }
    } else {
      contactData = extractFieldsWithAutoMapping(lead.field_values, 'contact');
      usedAutoMapping = true;
    }

    // Entity data (name, email, phone, address, NIF) already lives in anew_entity_* tables
    // via the lead's entity_id — no need to duplicate. Only extract name for the contact record.
    const firstName = contactData.first_name || null;
    const lastName = contactData.last_name || null;

    const authUserId = scopeAuthUserId;
    if (!authUserId) throw new Error('Utilizador não autenticado');
    const convertedByUserId = scopeAnewUserId || authUserId;

    // Garantir que a entidade tem link na org local antes de qualquer
    // acesso a anew_contacts / anew_entity_roles (caso contrário RLS bloqueia silenciosamente).
    if (lead.entity_id) {
      try {
        await ensureEntityOrgLink({
          entityId: lead.entity_id,
          organizationId: lead.organization_id,
          isPrimary: false,
        });
      } catch (linkErr: any) {
        console.error('[convertToContact] ensureEntityOrgLink failed', linkErr);
        toast({
          title: t('leads.toast.convertError'),
          description: `Não foi possível associar a entidade à organização: ${linkErr?.message || linkErr}`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Check if a contact already exists for this entity in this organization (anew_contacts first)
    let newContact: any = null;
    if (lead.entity_id) {
      const { data: existingAnewContact } = await supabase
        .from("anew_contacts")
        .select("*")
        .eq("entity_id", lead.entity_id)
        .eq("organization_id", lead.organization_id)
        .maybeSingle();
      if (existingAnewContact) {
        newContact = existingAnewContact;
        // Reactivate and clear previous client conversion metadata
        const updateFields: Record<string, any> = {};
        if (existingAnewContact.status !== 'active') updateFields.status = 'active';
        if (existingAnewContact.converted_to_client_id) {
          updateFields.converted_to_client_id = null;
          updateFields.converted_at = null;
        }
        if (Object.keys(updateFields).length > 0) {
          await supabase.from("anew_contacts").update(updateFields as any).eq("id", existingAnewContact.id);
        }
      }
    }

    if (!newContact) {
      // Determine root_organization_id
      let rootOrgId = lead.organization_id;
      const { data: hierarchyData } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", lead.organization_id)
        .limit(1)
        .maybeSingle();
      if (hierarchyData?.parent_org_id) {
        const { data: parentH } = await supabase
          .from("anew_hierarchy")
          .select("parent_org_id")
          .eq("child_org_id", hierarchyData.parent_org_id)
          .maybeSingle();
        rootOrgId = parentH?.parent_org_id || hierarchyData.parent_org_id;
      }

      // Create in anew_contacts (primary destination)
      const { data: createdContact, error: contactError } = await supabase
        .from("anew_contacts")
        .insert([{
          organization_id: lead.organization_id,
          root_organization_id: rootOrgId,
          entity_id: lead.entity_id || null,
          position: contactData.position || contactData.job_title || null,
          notes: contactData.notes || null,
          source_type: 'lead',
          source_lead_id: lead.id,
          created_by: convertedByUserId,
          assigned_to: lead.assigned_to,
          status: 'active',
        }])
        .select()
        .single();

      if (contactError) {
        toast({ title: t('leads.toast.createContactError'), description: contactError.message, variant: "destructive" });
        return;
      }
      newContact = createdContact;
    }

    // Entity role management: create contact role and inactivate lead role
    if (lead.entity_id && lead.organization_id) {
      const { data: existingContactRole } = await supabase
        .from("anew_entity_roles")
        .select("id")
        .eq("entity_id", lead.entity_id)
        .eq("role", "contact")
        .eq("organization_id", lead.organization_id)
        .maybeSingle();
      if (!existingContactRole) {
        await supabase.from("anew_entity_roles").insert({
          entity_id: lead.entity_id,
          role: "contact",
          status: "active",
          organization_id: lead.organization_id,
          source_type: "lead",
          source_id: lead.id,
          created_by: convertedByUserId,
        });
      } else {
        await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", existingContactRole.id);
      }
      // Inactivate lead role
      await supabase
        .from("anew_entity_roles" as any)
        .update({ status: 'inactive' })
        .eq('organization_id', lead.organization_id)
        .eq('entity_id', lead.entity_id)
        .eq('role', 'lead');
      // Deactivate client role ONLY in the lead's own organization (not cross-org)
      // This allows the converted contact to appear in the contacts list for this org
      // without affecting client roles the entity may have in other organizations
      await supabase
        .from("anew_entity_roles" as any)
        .update({ status: 'inactive' })
        .eq('organization_id', lead.organization_id)
        .eq('entity_id', lead.entity_id)
        .eq('role', 'client');
    }


    // Sync primary address from lead.field_values (safe orchestrator)
    if (lead.entity_id && lead.field_values) {
      try {
        const syncRes = await syncEntityPrimaryAddressFromLead({
          supabase,
          entityId: lead.entity_id,
          fieldValues: lead.field_values as Record<string, any>,
          actorId: convertedByUserId,
          allowOverwriteValid: true, // explicit user-driven conversion
        });
        console.log("[address-sync/convert]", syncRes);
      } catch (e) {
        console.error("[address-sync/convert] failed", e);
      }
    }

    // Update lead status
    const updateData: Record<string, any> = {
      status: "converted",
      converted_to_contact_id: newContact.id,
      converted_at: new Date().toISOString(),
      converted_by: convertedByUserId
    };
    if (selectedCampaignId && !lead.campaign_id) {
      updateData.campaign_id = selectedCampaignId;
    }

    const { error: leadError } = await supabase
      .from("anew_leads")
      .update(updateData as any)
      .eq("id", lead.id);

    if (leadError) {
      toast({ title: t('leads.toast.updateLeadError'), description: leadError.message, variant: "destructive" });
      return;
    }

    // Update entity first_name/last_name
    if (lead.entity_id && (firstName || lastName)) {
      const entityNameUpdate: Record<string, any> = {};
      if (firstName) entityNameUpdate.first_name = firstName;
      if (lastName) entityNameUpdate.last_name = lastName;
      await supabase.from("anew_entities").update(entityNameUpdate as any).eq("id", lead.entity_id);
    }

    // Entity status stays 'active' — role transition handled by sync_contact_entity_role trigger

    toast({ title: t('leads.toast.convertedToContact'), description: t('leads.toast.newContactCreated') });
    setShowDetails(false);
    loadLeads();
    loadStatusCounts();
  };

  const doConvertToClient = async (lead: Lead, selectedCampaignId: string | null) => {
    let clientData: Record<string, any> = {};

    const campaignToUse = selectedCampaignId || lead.campaign_id;
    if (campaignToUse) {
      const { data: fieldDefsForConvert } = await supabase
        .from("lead_field_definitions")
        .select("*")
        .eq("campaign_id", campaignToUse)
        .eq("is_active", true);

      const fieldsWithMapping = (fieldDefsForConvert || []).filter(f => f.client_field_mapping);
      if (fieldsWithMapping.length > 0) {
        for (const field of fieldsWithMapping) {
          const leadValue = lead.field_values?.[field.field_key];
          if (leadValue && field.client_field_mapping) {
            clientData[field.client_field_mapping] = leadValue;
          }
        }
      } else {
        clientData = extractFieldsWithAutoMapping(lead.field_values, 'client');
      }
    } else {
      clientData = extractFieldsWithAutoMapping(lead.field_values, 'client');
    }

    const authUserId = scopeAuthUserId;
    if (!authUserId) throw new Error('Utilizador não autenticado');
    const convertedByUserId = scopeAnewUserId || authUserId;

    // Garantir link entidade↔org antes de tocar em anew_contacts / anew_clients / anew_entity_roles.
    if (lead.entity_id) {
      try {
        await ensureEntityOrgLink({
          entityId: lead.entity_id,
          organizationId: lead.organization_id,
          isPrimary: false,
        });
      } catch (linkErr: any) {
        console.error('[convertToClient] ensureEntityOrgLink failed', linkErr);
        toast({
          title: t('leads.toast.convertError'),
          description: `Não foi possível associar a entidade à organização: ${linkErr?.message || linkErr}`,
          variant: 'destructive',
        });
        return;
      }
    }

    const hasCompanyName = !!clientData.company_name;
    const clientType: "company" | "person" = hasCompanyName ? 'company' : 'person';

    let firstName = clientData.first_name;
    let lastName = clientData.last_name;
    let companyName = clientData.company_name;

    if (clientType === 'person') {
      firstName = firstName || null;
      lastName = lastName || null;
    } else {
      companyName = companyName || null;
    }

    const rootOrgId = await resolveRootOrgId(lead.organization_id);
    const orgIdsToSync = Array.from(new Set([lead.organization_id, rootOrgId].filter(Boolean)));

    let sourceContactId: string | null = null;
    if (lead.entity_id) {
      const { data: contactRows, error: contactLookupError } = await supabase
        .from("anew_contacts")
        .select("id")
        .eq("entity_id", lead.entity_id)
        .eq("organization_id", lead.organization_id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (contactLookupError) throw contactLookupError;
      sourceContactId = contactRows?.[0]?.id || null;
    }

    let clientId: string | null = null;
    if (lead.entity_id) {
      const { data: existingClients, error: existingClientError } = await supabase
        .from("anew_clients")
        .select("id")
        .eq("entity_id", lead.entity_id)
        .eq("root_organization_id", rootOrgId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (existingClientError) throw existingClientError;
      clientId = existingClients?.[0]?.id || null;
    }

    if (!clientId) {
      const { data: newClient, error: clientError } = await supabase
        .from("anew_clients")
        .insert([{
          organization_id: lead.organization_id,
          root_organization_id: rootOrgId,
          entity_id: lead.entity_id || null,
          client_type: clientType,
          source_type: sourceContactId ? 'contact' : 'lead',
          source_id: sourceContactId || lead.id,
          status: 'active',
          created_by: convertedByUserId,
          assigned_to: lead.assigned_to,
        }])
        .select("id")
        .single();

      if (clientError) {
        toast({ title: t('leads.toast.createClientError'), description: clientError.message, variant: "destructive" });
        return;
      }

      clientId = newClient.id;
    }

    const nowIso = new Date().toISOString();
    const updateData: Record<string, any> = {
      status: "converted",
      converted_to_client_id: clientId,
      converted_to_contact_id: sourceContactId,
      converted_at: nowIso,
      converted_by: convertedByUserId,
    };
    if (selectedCampaignId && !lead.campaign_id) {
      updateData.campaign_id = selectedCampaignId;
    }

    const { error: leadError } = await supabase
      .from("anew_leads")
      .update(updateData as any)
      .eq("id", lead.id);

    if (leadError) {
      toast({ title: t('leads.toast.updateLeadError'), description: leadError.message, variant: "destructive" });
      return;
    }

    if (sourceContactId && clientId) {
      let contactUpdateQuery: any = supabase
        .from("anew_contacts")
        .update({ converted_to_client_id: clientId, converted_at: nowIso, status: "inactive" })
        .eq("entity_id", lead.entity_id)
        .eq("organization_id", lead.organization_id);
      await contactUpdateQuery;
    }

    if (lead.entity_id) {
      const entityNameUpdate: Record<string, any> = {};
      if (firstName) entityNameUpdate.first_name = firstName;
      if (lastName) entityNameUpdate.last_name = lastName;
      if (companyName && clientType === 'company') entityNameUpdate.display_name = companyName;
      if (Object.keys(entityNameUpdate).length > 0) {
        await supabase.from("anew_entities").update(entityNameUpdate as any).eq("id", lead.entity_id);
      }

      const { data: existingClientRoleRows, error: clientRoleLookupError } = await supabase
        .from("anew_entity_roles")
        .select("id")
        .eq("entity_id", lead.entity_id)
        .eq("role", "client")
        .eq("organization_id", lead.organization_id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (clientRoleLookupError) throw clientRoleLookupError;

      const existingClientRoleId = existingClientRoleRows?.[0]?.id;
      if (!existingClientRoleId) {
        await supabase.from("anew_entity_roles").insert({
          entity_id: lead.entity_id,
          role: "client",
          status: "active",
          organization_id: lead.organization_id,
          source_type: sourceContactId ? "contact" : "lead",
          source_id: sourceContactId || lead.id,
          created_by: convertedByUserId,
        });
      } else {
        await supabase.from("anew_entity_roles").update({ status: "active" }).eq("id", existingClientRoleId);
      }

      // Deactivate lead and contact roles ONLY in the lead's own organization
      await supabase
        .from("anew_entity_roles" as any)
        .update({ status: 'inactive' })
        .eq('entity_id', lead.entity_id)
        .eq('role', 'lead')
        .eq('organization_id', lead.organization_id);

      await supabase
        .from("anew_entity_roles" as any)
        .update({ status: 'inactive' })
        .eq('entity_id', lead.entity_id)
        .eq('role', 'contact')
        .eq('organization_id', lead.organization_id);
    }

    toast({ title: t('leads.toast.convertedToClient'), description: clientId ? 'Cliente sincronizado sem duplicar registos.' : t('leads.toast.newClientCreated') });
    setShowDetails(false);
    loadLeads();
    loadStatusCounts();
  };

  const handleCreateDealFromLead = useCallback((lead: Lead) => {
    // Navigate to deals page with lead_id parameter to pre-fill the form
    navigate(`/deals?create_from_lead=${lead.id}`);
  }, [navigate]);

  const handleCreateLead = async () => {
    // Merge base + extra campaign fields for validation
    const allFieldDefs = [...createLeadFieldDefs, ...extraCampaignFieldDefs];
    // Validate required fields
    const missingRequired = allFieldDefs
      .filter(f => f.is_required && !newLeadValues[f.field_key])
      .map(f => f.field_label);

    if (missingRequired.length > 0) {
      toast({ title: t('leads.toast.missingRequiredFields'), description: missingRequired.join(", "), variant: "destructive" });
      return;
    }

    setCreatingLead(true);

    // Use already-resolved user IDs from usePermissionScope (no extra auth calls)
    const authUserId = scopeAuthUserId;
    const anewUserId = scopeAnewUserId;
    if (!authUserId) {
      toast({ title: t('leads.toast.createError'), description: 'Utilizador não autenticado', variant: "destructive" });
      setCreatingLead(false);
      return;
    }
    const createdByResolved = anewUserId || authUserId;
    const resolvedRootOrgId = (!isRootOrg && activeCompanyId) ? await resolveRootOrgId(activeCompanyId) : activeCompanyId;

    // ─── Compensable-state tracking (best-effort frontend rollback) ───
    type CompensableTable = "anew_leads" | "anew_entities" | "anew_entity_emails" | "anew_entity_phones";
    type CreatedRecord = { table: CompensableTable; id: string };
    type PrimaryDeactivation = { kind: "email" | "phone"; id: string };
    const createdIds: CreatedRecord[] = [];
    const primaryDeactivations: PrimaryDeactivation[] = [];
    let entityCreatedHere = false;
    let dbCommitted = false;

    const runCleanup = async (err: unknown) => {
      if (dbCommitted) {
        console.error("[runCleanup] called after commit — refusing to delete");
        return;
      }
      const failures: Array<{ what: string; reason: string }> = [];
      for (const rec of [...createdIds].reverse()) {
        try {
          const { error } = await supabase.from(rec.table).delete().eq("id", rec.id);
          if (error) failures.push({ what: `${rec.table}:${rec.id}`, reason: error.message });
        } catch (e: any) {
          failures.push({ what: `${rec.table}:${rec.id}`, reason: e?.message ?? String(e) });
        }
      }
      for (const p of [...primaryDeactivations].reverse()) {
        const table = p.kind === "email" ? "anew_entity_emails" : "anew_entity_phones";
        try {
          const { error } = await (supabase.from(table) as any).update({ is_primary: true }).eq("id", p.id);
          if (error) failures.push({ what: `restore-primary:${table}:${p.id}`, reason: error.message });
        } catch (e: any) {
          failures.push({ what: `restore-primary:${p.kind}:${p.id}`, reason: e?.message ?? String(e) });
        }
      }
      if (failures.length > 0) {
        console.error("[rollback] partial failure", failures);
        toast({
          title: "Erro ao criar lead — limpeza incompleta",
          description: `Não foi possível reverter ${failures.length} registo(s). Contacte o suporte.`,
          variant: "destructive",
        });
      } else if (err) {
        const description = await getFriendlyErrorMessage(err);
        toast({ title: t('leads.toast.createError'), description, variant: "destructive" });
      }
      // err===null (interrupção por duplicados): sem toast — o dialog comunica.
    };

    // Captured outside the inner try so post-commit can use them.
    let entityIdForPostCommit: string | null = null;
    let newLeadIdForPostCommit: string | null = null;
    let cleanFieldValuesForPostCommit: Record<string, any> = {};
    let assignedToForPostCommit: string | null = null;
    let selectedLeadSourceNameForPostCommit = "manual";
    let coherenceWarningForPostCommit: { storedName: string | null; storedEmail: string | null; storedPhone: string | null; matched: string[] } | null = null;
    let entityRenamePayloadForPostCommit: Record<string, any> | null = null;
    let entityReusedForPostCommit = false;

    try {
      try {
        // --- Extract contact data from field_values using field definitions ---
        let displayName = '';
        let emailValue = '';
        let phoneValue = '';
        let vatValue = '';
        let addressData: Record<string, any> | null = null;

        for (const fieldDef of allFieldDefs) {
          const val = newLeadValues[fieldDef.field_key];
          if (!val) continue;

          const mapping = (fieldDef as any).contact_field_mapping;
          const key = fieldDef.field_key.toLowerCase();
          const fType = fieldDef.field_type;

          // Name detection
          if (mapping === 'first_name' || mapping === 'last_name' || mapping === 'full_name' ||
              fType === 'text' && (key.includes('nome') || key.includes('name'))) {
            displayName = displayName ? `${displayName} ${val}` : String(val);
          }
          // Email detection
          if (mapping === 'email' || fType === 'email' || key.includes('email')) {
            emailValue = String(val);
          }
          // Phone detection
          if (mapping === 'phone' || fType === 'phone' || key.includes('phone') || key.includes('telefone') || key.includes('telemovel')) {
            phoneValue = String(val);
          }
          // VAT detection
          if (mapping === 'vat' || key.includes('vat') || key.includes('nif')) {
            vatValue = String(val);
          }
          // Address detection
          if (fType === 'address' || mapping === 'address' || key.includes('morada') || key.includes('address')) {
            addressData = typeof val === 'object' ? val : { address_line1: String(val) };
          }
        }

        emailValue = emailValue.trim().toLowerCase();
        phoneValue = phoneValue.trim();
        vatValue = vatValue.trim().toUpperCase();

        if (!displayName) {
          displayName = emailValue || phoneValue || 'Lead sem nome';
        }

        // --- 1. Resolve or create entity (deduplication by email/phone/vat) ---
        let entityId: string | null = null;
        let entityWasResolved = false;
        let coherenceWarning: { storedName: string | null; storedEmail: string | null; storedPhone: string | null; matched: string[] } | null = null;

        if (emailValue || phoneValue || vatValue) {
          const candidate = await resolveEntityByIdentity({
            email: emailValue || null,
            phone: phoneValue || null,
            vat: vatValue || null,
          });
          if (candidate) {
            const coherence = await validateEntityCoherence(candidate, {
              name: displayName || null,
              email: emailValue || null,
              phone: phoneValue || null,
              vat: vatValue || null,
            });
            if (coherence.level === 'full') {
              entityId = candidate;
              entityWasResolved = true;
            } else if (coherence.level === 'partial') {
              entityId = candidate;
              entityWasResolved = true;
              const matched: string[] = [];
              if (coherence.matches.email) matched.push('email');
              if (coherence.matches.phone) matched.push('telefone');
              if (coherence.matches.vat) matched.push('NIF');
              if (coherence.matches.name) matched.push('nome');
              coherenceWarning = {
                storedName: coherence.storedIdentity.name,
                storedEmail: coherence.storedIdentity.email,
                storedPhone: coherence.storedIdentity.phone,
                matched,
              };
              console.warn('[lead-create] Partial entity coherence — reusing with warning', {
                candidate, matched, stored: coherence.storedIdentity,
              });
            } else {
              console.warn('[lead-create] Entity match rejected (no coherence)', {
                rejectedEntityId: candidate,
                submitted: { name: displayName, email: emailValue, phone: phoneValue, vat: vatValue },
                stored: coherence.storedIdentity,
              });
            }
          }
        }

        // L2 — Dedup by display_name BEFORE creating the entity when no identifier.
        if (!entityId && !emailValue && !phoneValue && !vatValue) {
          const preCheck = await checkNameDuplicatesBeforeInsert(
            displayName,
            activeCompanyId!,
            {
              searchEntitiesByName: async (name, limit) => {
                const { data } = await supabase
                  .from("anew_entities")
                  .select("id")
                  .ilike("display_name", name)
                  .limit(limit);
                return (data || []) as Array<{ id: string }>;
              },
              findLeadsByEntityIds: async (ids, orgId) => {
                const { data } = await (supabase as any)
                  .from("anew_leads")
                  .select("id, status, entity_id, created_at, campaign_id, assigned_to, field_values, campaigns:campaigns!anew_leads_campaign_id_fkey(name), assigned_user:anew_users!anew_leads_assigned_to_fkey(name)")
                  .in("entity_id", ids)
                  .eq("organization_id", orgId)
                  .not("status", "in", '("converted","lost","rejected")')
                  .order("created_at", { ascending: false });
                return data || [];
              },
              findContactsByEntityIds: async (ids, orgId) => {
                const { data } = await supabase
                  .from("anew_contacts")
                  .select("id, entity_id, status, created_at, assigned_to")
                  .in("entity_id", ids)
                  .eq("organization_id", orgId)
                  .not("status", "eq", "inactive");
                return data || [];
              },
              findClientsByEntityIds: async (ids, orgId) => {
                const { data } = await supabase
                  .from("anew_clients")
                  .select("id, entity_id, status, created_at, assigned_to")
                  .in("entity_id", ids)
                  .eq("organization_id", orgId)
                  .not("status", "eq", "inactive");
                return data || [];
              },
            },
          );

          if (preCheck.hasDuplicates) {
            // Open dialog WITHOUT having created any entity — nothing to clean up.
            const allRawMatches = [
              ...preCheck.leads.map((el: any) => ({ ...el, _type: "lead" as const })),
              ...preCheck.contacts.map((ec: any) => ({ ...ec, _type: "contact" as const })),
              ...preCheck.clients.map((ec: any) => ({ ...ec, _type: "client" as const })),
            ];
            const matchEntityIds = [...new Set(allRawMatches.map((m: any) => m.entity_id).filter(Boolean))];
            const entityIdentityMap = new Map<string, { displayName: string; email: string | null; phone: string | null }>();
            if (matchEntityIds.length > 0) {
              const [entitiesRes, emailsRes, phonesRes] = await Promise.all([
                supabase.from("anew_entities").select("id, display_name").in("id", matchEntityIds),
                supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", matchEntityIds).eq("is_primary", true),
                supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", matchEntityIds).eq("is_primary", true),
              ]);
              for (const eid of matchEntityIds) {
                const ent = (entitiesRes.data || []).find((e: any) => e.id === eid);
                const em = (emailsRes.data || []).find((e: any) => e.entity_id === eid);
                const ph = (phonesRes.data || []).find((p: any) => p.entity_id === eid);
                entityIdentityMap.set(eid, {
                  displayName: ent?.display_name || displayName,
                  email: em?.email || null,
                  phone: ph?.phone_number || null,
                });
              }
            }
            const sameOrgMatchFields = await fetchSameOrgMatchFields({
              orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
            });
            const sameOrgFieldSets = await fetchSameOrgFieldsByEntity({
              orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
            });
            const allMatches: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch[] = allRawMatches.map((m: any) => {
              const identity = entityIdentityMap.get(m.entity_id) || { displayName, email: null, phone: null };
              return {
                id: m.id,
                entityId: m.entity_id,
                displayName: identity.displayName,
                email: identity.email,
                phone: identity.phone,
                status: m.status,
                type: m._type,
                createdAt: m.created_at,
                campaignName: m.campaigns?.name || null,
                assignedToName: m.assigned_user?.name || null,
                matchField: sameOrgMatchFields.get(m.entity_id),
                matchFields: sameOrgFieldSets.get(m.entity_id),
              };
            });
            const localEntityIds = [...new Set(allMatches.map((m) => m.entityId).filter(Boolean))];
            const groupMatches = await fetchGroupDuplicateMatches({
              orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
              excludeEntityIds: localEntityIds,
            });

            if (groupMatches.length > 0) allMatches.push(...groupMatches);
            setDuplicateMatches(allMatches);
            setPendingLeadData({
              entityId: null,
              fieldValues: newLeadValues,
              assignedTo: newLeadValues._assigned_to || null,
              resolvedRootOrgId,
              createdBy: createdByResolved,
              displayName,
              emailValue,
              phoneValue,
              allFieldDefs,
            });
            setDuplicateDialogOpen(true);
            return; // No writes — no cleanup
          }
        }

        if (!entityId) {
          const firstName = (() => {
            for (const fd of allFieldDefs) {
              const m = (fd as any).contact_field_mapping;
              if (m === 'first_name' && newLeadValues[fd.field_key]) return String(newLeadValues[fd.field_key]);
            }
            return displayName.trim().split(' ')[0] || null;
          })();
          const lastName = (() => {
            for (const fd of allFieldDefs) {
              const m = (fd as any).contact_field_mapping;
              if (m === 'last_name' && newLeadValues[fd.field_key]) return String(newLeadValues[fd.field_key]);
            }
            const parts = displayName.trim().split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : null;
          })();

          const { data: createdEntityId, error: entityError } = await (supabase as any)
            .rpc("create_lead_entity_for_org", {
              p_organization_id: activeCompanyId,
              p_display_name: displayName.trim(),
              p_first_name: firstName,
              p_last_name: lastName,
            });

          if (entityError) {
            console.error('Error creating entity:', entityError);

            // 42501 fallback — try to resolve and REUSE an existing entity.
            // The entity was NOT created here — never push to createdIds.
            if (entityError.code === '42501' && (emailValue || phoneValue || vatValue)) {
              const fallbackEntityId = await resolveEntityByIdentity({
                email: emailValue || null,
                phone: phoneValue || null,
                vat: vatValue || null,
              });

              if (fallbackEntityId) {
                const coherence = await validateEntityCoherence(fallbackEntityId, {
                  name: displayName || null,
                  email: emailValue || null,
                  phone: phoneValue || null,
                  vat: vatValue || null,
                });
                if (coherence.level === 'none') {
                  console.error('[lead-create] Fallback entity rejected (no coherence)', {
                    rejectedEntityId: fallbackEntityId, stored: coherence.storedIdentity,
                  });
                  throw new Error('Não foi possível criar uma nova entidade e a existente não corresponde aos dados submetidos.');
                }
                entityId = fallbackEntityId;
                entityWasResolved = true;
              } else {
                throw entityError;
              }
            } else {
              throw entityError;
            }
          } else {
            entityId = createdEntityId as string;
            entityCreatedHere = true;
            createdIds.push({ table: "anew_entities", id: entityId });
          }
        }

        if (!entityId) {
          throw new Error('Não foi possível associar ou criar a entidade do lead');
        }

        // Local idempotent org link — is_primary only when WE created the entity here.
        // CASCADE on anew_entity_org_links handles cleanup if entity is deleted by rollback.
        try {
          await ensureEntityOrgLink({
            entityId,
            organizationId: activeCompanyId!,
            isPrimary: !entityWasResolved,
          });
        } catch (linkErr) {
          console.warn('[org-link] non-fatal failure', linkErr);
        }

        // --- DUPLICATE CHECK: existing leads/contacts/clients with same entity in same org ---
        const entityIdForCheck = entityId;
        const entityIdQueries = Promise.all([
          (supabase as any)
            .from("anew_leads")
            .select("id, status, entity_id, created_at, campaign_id, assigned_to, field_values, campaigns:campaigns!anew_leads_campaign_id_fkey(name), assigned_user:anew_users!anew_leads_assigned_to_fkey(name)")
            .eq("entity_id", entityIdForCheck)
            .eq("organization_id", activeCompanyId)
            .not("status", "in", '("converted","lost","rejected")')
            .order("created_at", { ascending: false }),
          supabase
            .from("anew_contacts")
            .select("id, entity_id, status, created_at, assigned_to")
            .eq("entity_id", entityIdForCheck)
            .eq("organization_id", activeCompanyId)
            .not("status", "eq", "inactive"),
          supabase
            .from("anew_clients")
            .select("id, entity_id, status, created_at, assigned_to")
            .eq("entity_id", entityIdForCheck)
            .eq("organization_id", activeCompanyId)
            .not("status", "eq", "inactive"),
        ]);

        const nameNormalized = displayName.trim().toLowerCase();
        const nameBasedQuery = (nameNormalized && nameNormalized !== 'lead sem nome')
          ? supabase
              .from("anew_entities")
              .select("id, display_name, first_name, last_name")
              .ilike("display_name", nameNormalized)
              .neq("id", entityIdForCheck)
              .limit(20)
          : Promise.resolve({ data: [] as any[] });

        const [entityIdResults, nameEntities] = await Promise.all([entityIdQueries, nameBasedQuery]);
        const [{ data: existingLeads }, { data: existingContacts }, { data: existingClients }] = entityIdResults;

        let nameMatchedLeads: any[] = [];
        let nameMatchedContacts: any[] = [];
        let nameMatchedClients: any[] = [];

        if (!(existingLeads?.length || existingContacts?.length || existingClients?.length)) {
          const nameEntityIds = ((nameEntities as any)?.data || []).map((e: any) => e.id).filter(Boolean);
          if (nameEntityIds.length > 0) {
            const [nlRes, ncRes, nclRes] = await Promise.all([
              (supabase as any)
                .from("anew_leads")
                .select("id, status, entity_id, created_at, campaign_id, assigned_to, field_values, campaigns:campaigns!anew_leads_campaign_id_fkey(name), assigned_user:anew_users!anew_leads_assigned_to_fkey(name)")
                .in("entity_id", nameEntityIds)
                .eq("organization_id", activeCompanyId)
                .not("status", "in", '("converted","lost","rejected")')
                .order("created_at", { ascending: false }),
              supabase
                .from("anew_contacts")
                .select("id, entity_id, status, created_at, assigned_to")
                .in("entity_id", nameEntityIds)
                .eq("organization_id", activeCompanyId)
                .not("status", "eq", "inactive"),
              supabase
                .from("anew_clients")
                .select("id, entity_id, status, created_at, assigned_to")
                .in("entity_id", nameEntityIds)
                .eq("organization_id", activeCompanyId)
                .not("status", "eq", "inactive"),
            ]);
            nameMatchedLeads = nlRes.data || [];
            nameMatchedContacts = ncRes.data || [];
            nameMatchedClients = nclRes.data || [];
          }
        }

        const allRawMatches = [
          ...(existingLeads || []).map((el: any) => ({ ...el, _type: "lead" as const })),
          ...(existingContacts || []).map((ec: any) => ({ ...ec, _type: "contact" as const })),
          ...(existingClients || []).map((ec: any) => ({ ...ec, _type: "client" as const })),
          ...nameMatchedLeads.map((el: any) => ({ ...el, _type: "lead" as const })),
          ...nameMatchedContacts.map((ec: any) => ({ ...ec, _type: "contact" as const })),
          ...nameMatchedClients.map((ec: any) => ({ ...ec, _type: "client" as const })),
        ];

        const matchEntityIds = [...new Set(allRawMatches.map((m: any) => m.entity_id).filter(Boolean))];
        const entityIdentityMap = new Map<string, { displayName: string; email: string | null; phone: string | null }>();

        if (matchEntityIds.length > 0) {
          const [entitiesRes, emailsRes, phonesRes] = await Promise.all([
            supabase.from("anew_entities").select("id, display_name").in("id", matchEntityIds),
            supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", matchEntityIds).eq("is_primary", true),
            supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", matchEntityIds).eq("is_primary", true),
          ]);
          for (const eid of matchEntityIds) {
            const ent = (entitiesRes.data || []).find((e: any) => e.id === eid);
            const em = (emailsRes.data || []).find((e: any) => e.entity_id === eid);
            const ph = (phonesRes.data || []).find((p: any) => p.entity_id === eid);
            entityIdentityMap.set(eid, {
              displayName: ent?.display_name || displayName,
              email: em?.email || null,
              phone: ph?.phone_number || null,
            });
          }
        }

        const sameOrgMatchFields2 = await fetchSameOrgMatchFields({
          orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
        });
        const sameOrgFieldSets2 = await fetchSameOrgFieldsByEntity({
          orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
        });
        const allMatches: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch[] = allRawMatches.map((m: any) => {
          const identity = entityIdentityMap.get(m.entity_id) || { displayName, email: emailValue || null, phone: phoneValue || null };
          return {
            id: m.id,
            entityId: m.entity_id,
            displayName: identity.displayName,
            email: identity.email,
            phone: identity.phone,
            status: m.status,
            type: m._type,
            createdAt: m.created_at,
            campaignName: m.campaigns?.name || null,
            assignedToName: m.assigned_user?.name || null,
            matchField: sameOrgMatchFields2.get(m.entity_id),
            matchFields: sameOrgFieldSets2.get(m.entity_id),
          };
        });

        const localEntityIdsInScope = [...new Set(allMatches.map((m) => m.entityId).filter(Boolean))];
        const groupMatches = await fetchGroupDuplicateMatches({
          orgId: activeCompanyId!, email: emailValue, phone: phoneValue, vat: vatValue,
          excludeEntityIds: localEntityIdsInScope,
        });
        if (groupMatches.length > 0) allMatches.push(...groupMatches);

        if (allMatches.length > 0) {
          // Interrupção por duplicados depois de já existirem escritas (entidade
          // criada agora ou link). Limpar antes de abrir o dialog.
          if (createdIds.length > 0 || primaryDeactivations.length > 0) {
            await runCleanup(null);
          }
          setDuplicateMatches(allMatches);
          setPendingLeadData({
            entityId,
            fieldValues: newLeadValues,
            assignedTo: newLeadValues._assigned_to || null,
            resolvedRootOrgId,
            createdBy: createdByResolved,
            displayName,
            emailValue,
            phoneValue,
            allFieldDefs,
          });
          setDuplicateDialogOpen(true);
          return;
        }

        // ─── Critical sequential writes (each may trigger rollback on failure) ───

        // Email handling — dedupe by ilike; for reused entity, snapshot+deactivate primary first.
        if (emailValue) {
          const existing = await assertNoSupabaseError<{ id: string } | null>(
            supabase
              .from("anew_entity_emails")
              .select("id")
              .eq("entity_id", entityId)
              .ilike("email", emailValue)
              .maybeSingle(),
            "lookup existing email",
          );
          if (!existing) {
            if (!entityCreatedHere) {
              const prevPrimary = await assertNoSupabaseError<{ id: string } | null>(
                supabase
                  .from("anew_entity_emails")
                  .select("id")
                  .eq("entity_id", entityId)
                  .eq("is_primary", true)
                  .maybeSingle(),
                "lookup primary email",
              );
              if (prevPrimary?.id) {
                await assertNoSupabaseError(
                  (supabase.from("anew_entity_emails") as any)
                    .update({ is_primary: false })
                    .eq("id", prevPrimary.id),
                  "deactivate primary email",
                );
                primaryDeactivations.push({ kind: "email", id: prevPrimary.id });
              }
            }
            const inserted = await assertNoSupabaseError<{ id: string }>(
              (supabase.from("anew_entity_emails") as any)
                .insert({
                  entity_id: entityId, email: emailValue, email_type: 'personal',
                  is_primary: true, created_by: createdByResolved,
                })
                .select("id")
                .single(),
              "insert email",
            );
            if (inserted?.id) createdIds.push({ table: "anew_entity_emails", id: inserted.id });
          }
        }

        // Phone handling — dedupe by 7-digit suffix; same snapshot semantics for reused entity.
        if (phoneValue) {
          const digits = String(phoneValue).replace(/\D/g, "");
          const suffix = digits.length >= 7 ? digits.slice(-7) : digits;
          let exists = false;
          if (suffix.length >= 7) {
            const rows = await assertNoSupabaseError<Array<{ id: string; phone_number: string | null }>>(
              supabase
                .from("anew_entity_phones")
                .select("id, phone_number")
                .eq("entity_id", entityId),
              "lookup existing phone",
            );
            exists = (rows || []).some((r: any) => {
              const d = String(r.phone_number || "").replace(/\D/g, "");
              return d.length >= 7 && d.slice(-7) === suffix;
            });
          }
          if (!exists) {
            if (!entityCreatedHere) {
              const prevPrimary = await assertNoSupabaseError<{ id: string } | null>(
                supabase
                  .from("anew_entity_phones")
                  .select("id")
                  .eq("entity_id", entityId)
                  .eq("is_primary", true)
                  .maybeSingle(),
                "lookup primary phone",
              );
              if (prevPrimary?.id) {
                await assertNoSupabaseError(
                  (supabase.from("anew_entity_phones") as any)
                    .update({ is_primary: false })
                    .eq("id", prevPrimary.id),
                  "deactivate primary phone",
                );
                primaryDeactivations.push({ kind: "phone", id: prevPrimary.id });
              }
            }
            const inserted = await assertNoSupabaseError<{ id: string }>(
              (supabase.from("anew_entity_phones") as any)
                .insert({
                  entity_id: entityId, phone_number: phoneValue, phone_type: 'mobile',
                  is_primary: true, created_by: createdByResolved,
                })
                .select("id")
                .single(),
              "insert phone",
            );
            if (inserted?.id) createdIds.push({ table: "anew_entity_phones", id: inserted.id });
          }
        }

        // --- Lead INSERT ---
        const assignedTo = newLeadValues._assigned_to || null;
        const { _assigned_to, ...cleanFieldValues } = newLeadValues;

        const newLead = await assertNoSupabaseError<{ id: string }>(
          (supabase.from("anew_leads") as any)
            .insert({
              campaign_id: createLeadCampaignId || null,
              organization_id: activeCompanyId,
              root_organization_id: resolvedRootOrgId,
              field_values: cleanFieldValues,
              status: "new",
              source: (createLeadSourceId && createLeadSourceId !== "none")
                ? (leadSources.find(s => s.id === createLeadSourceId)?.name || "manual")
                : "manual",
              source_id: (createLeadSourceId && createLeadSourceId !== "none") ? createLeadSourceId : null,
              created_by: createdByResolved,
              entity_id: entityId,
              assigned_to: assignedTo,
            })
            .select("id")
            .single(),
          "insert lead",
        );
        if (newLead?.id) createdIds.push({ table: "anew_leads", id: newLead.id });

        // --- Role upsert = COMMIT POINT ---
        if (activeCompanyId && newLead) {
          await assertNoSupabaseError(
            (supabase.from("anew_entity_roles") as any).upsert({
              organization_id: activeCompanyId, entity_id: entityId, role: 'lead',
              status: 'active', source_type: 'lead', source_id: newLead.id, created_by: createdByResolved,
            }, { onConflict: 'organization_id,entity_id,role' }),
            "upsert role",
          );
        }
        dbCommitted = true;

        // Capture for post-commit
        entityIdForPostCommit = entityId;
        newLeadIdForPostCommit = newLead?.id || null;
        cleanFieldValuesForPostCommit = cleanFieldValues;
        assignedToForPostCommit = assignedTo;
        selectedLeadSourceNameForPostCommit = (createLeadSourceId && createLeadSourceId !== "none")
          ? (leadSources.find((s) => s.id === createLeadSourceId)?.name || "manual")
          : "manual";
        coherenceWarningForPostCommit = coherenceWarning;
        entityReusedForPostCommit = entityWasResolved;

        if (entityWasResolved) {
          // Build rename payload — only for reused entity (post-commit best-effort).
          const nameUpdate: Record<string, any> = { display_name: displayName.trim() };
          for (const fd of allFieldDefs) {
            const m = (fd as any).contact_field_mapping;
            if (m === 'first_name' && newLeadValues[fd.field_key]) nameUpdate.first_name = String(newLeadValues[fd.field_key]);
            if (m === 'last_name' && newLeadValues[fd.field_key]) nameUpdate.last_name = String(newLeadValues[fd.field_key]);
          }
          entityRenamePayloadForPostCommit = nameUpdate;
        }
      } catch (err: any) {
        console.error('Lead creation error:', err);
        if (createdIds.length === 0 && primaryDeactivations.length === 0) {
          const description = await getFriendlyErrorMessage(err);
          toast({ title: t('leads.toast.createError'), description, variant: "destructive" });
        } else {
          await runCleanup(err);
        }
        return;
      }

      // ─── POST-COMMIT (isolated; failures here never trigger rollback) ───
      if (!entityIdForPostCommit) return;

      try {
        const addr = await syncEntityPrimaryAddressFromLead({
          supabase,
          entityId: entityIdForPostCommit,
          fieldValues: newLeadValues,
          actorId: createdByResolved,
          allowOverwriteValid: false,
        });
        if (addr.decision === "error") {
          console.warn("[post-commit] address sync failed", addr.reason);
          toast({
            title: "Lead criado, mas a morada não foi sincronizada",
            description: addr.reason ?? undefined,
          });
        }
      } catch (e) {
        console.warn("[post-commit] address sync threw", e);
      }

      if (entityRenamePayloadForPostCommit && entityReusedForPostCommit) {
        try {
          const { error } = await (supabase.from("anew_entities") as any)
            .update(entityRenamePayloadForPostCommit)
            .eq("id", entityIdForPostCommit);
          if (error) console.warn("[post-commit] entity rename failed", error.message);
        } catch (e) {
          console.warn("[post-commit] entity rename threw", e);
        }
      }

      toast({ title: t('leads.toast.createSuccess') });
      if (coherenceWarningForPostCommit) {
        toast({
          title: '⚠️ Lead associado a entidade existente',
          description: `Apenas ${coherenceWarningForPostCommit.matched.join(' e ')} corresponde${coherenceWarningForPostCommit.matched.length === 1 ? '' : 'm'} à entidade "${coherenceWarningForPostCommit.storedName || 'sem nome'}". Verifica se é a mesma pessoa.`,
          duration: 8000,
        });
      }
      setShowCreateLead(false);
      setNewLeadValues({});
      setCreateLeadCampaignId("");
      setCreateLeadSourceId("");
      if (newLeadIdForPostCommit) {
        setLeads(prev => [{
          id: newLeadIdForPostCommit!,
          organization_id: activeCompanyId!,
          campaign_id: createLeadCampaignId || null,
          field_values: cleanFieldValuesForPostCommit,
          status: 'new',
          source: selectedLeadSourceNameForPostCommit,
          notes: null,
          tags: null,
          created_at: new Date().toISOString(),
          created_by: createdByResolved,
          converted_to_contact_id: null,
          converted_at: null,
          assigned_to: assignedToForPostCommit,
          entity_id: entityIdForPostCommit,
        } as Lead, ...prev]);
      }
      await loadStatusCounts();
    } finally {
      setCreatingLead(false);
    }
  };


  // Handle "Create anyway" from duplicate dialog — create a BRAND NEW entity
  // (the user is consciously rejecting the deduplication) and insert the lead
  // anchored to it. Never reuse pendingLeadData.entityId here, otherwise the
  // new lead would silently share an entity with the duplicates the user just
  // declined.
  const handleDuplicateCreateAnyway = async (reuseEntityIdArg?: string) => {
    if (!pendingLeadData) return;
    // Guard: when wired directly to an onClick handler, React passes the
    // MouseEvent as the first argument. Only accept plain string ids; anything
    // else (event objects, etc.) is treated as "no reuse" to avoid sending a
    // circular structure to Supabase.
    const reuseEntityId = typeof reuseEntityIdArg === 'string' ? reuseEntityIdArg : undefined;

    // Pre-write DB revalidation (strict mode). Re-checks the strong-field
    // duplicates in BD right before writing — protects against stale matches
    // in the UI snapshot and against another user creating a duplicate
    // between dialog open and click. Does NOT close the race vs the INSERTs.
    if (pendingLeadData && activeCompanyId && !reuseEntityId) {
      try {
        const revalidation = await revalidateStrongDuplicatesBeforeWrite({
          orgId: activeCompanyId,
          email: pendingLeadData.emailValue || null,
          phone: pendingLeadData.phoneValue || null,
          vat: null,
        });
        if (revalidation.shouldBlock) {
          toast({
            title: "Duplicado confirmado",
            description: "Esta lead passou a colidir com outro registo nesta organização. Recarregue para ver os duplicados.",
            variant: "destructive",
          });
          setDuplicateMatches(revalidation.matches);
          setDuplicateDialogOpen(true);
          return;
        }
      } catch (revErr) {
        console.warn('[create-anyway] pre-write revalidation failed (non-fatal)', revErr);
      }
    }

    setDuplicateDialogOpen(false);
    setCreatingLead(true);
    const {
      fieldValues, assignedTo, resolvedRootOrgId, createdBy,
      displayName, emailValue, phoneValue, allFieldDefs,
    } = pendingLeadData;

    // Cleanup tracking
    type CompensableTable = "anew_leads" | "anew_entities" | "anew_entity_emails" | "anew_entity_phones";
    type CreatedRecord = { table: CompensableTable; id: string };
    type PrimaryDeactivation = { kind: "email" | "phone"; id: string };
    const createdIds: CreatedRecord[] = [];
    const primaryDeactivations: PrimaryDeactivation[] = [];
    let entityCreatedHere = false;
    let dbCommitted = false;

    const runCleanup = async (err: unknown) => {
      if (dbCommitted) {
        console.error("[runCleanup/create-anyway] called after commit — refusing to delete");
        return;
      }
      const failures: Array<{ what: string; reason: string }> = [];
      for (const rec of [...createdIds].reverse()) {
        try {
          const { error } = await supabase.from(rec.table).delete().eq("id", rec.id);
          if (error) failures.push({ what: `${rec.table}:${rec.id}`, reason: error.message });
        } catch (e: any) {
          failures.push({ what: `${rec.table}:${rec.id}`, reason: e?.message ?? String(e) });
        }
      }
      for (const p of [...primaryDeactivations].reverse()) {
        const table = p.kind === "email" ? "anew_entity_emails" : "anew_entity_phones";
        try {
          const { error } = await (supabase.from(table) as any).update({ is_primary: true }).eq("id", p.id);
          if (error) failures.push({ what: `restore-primary:${table}:${p.id}`, reason: error.message });
        } catch (e: any) {
          failures.push({ what: `restore-primary:${p.kind}:${p.id}`, reason: e?.message ?? String(e) });
        }
      }
      if (failures.length > 0) {
        console.error("[rollback/create-anyway] partial failure", failures);
        toast({
          title: "Erro ao criar lead — limpeza incompleta",
          description: `Não foi possível reverter ${failures.length} registo(s). Contacte o suporte.`,
          variant: "destructive",
        });
      } else if (err) {
        const description = await getFriendlyErrorMessage(err);
        toast({ title: t('leads.toast.createError'), description, variant: "destructive" });
      }
    };

    let entityIdForPostCommit: string | null = null;
    let newLeadIdForPostCommit: string | null = null;
    let cleanFieldValuesForPostCommit: Record<string, any> = {};

    try {
      try {
        let entityId: string;
        if (reuseEntityId) {
          entityId = reuseEntityId;
          // Entidade reutilizada — NUNCA entra em createdIds.
        } else {
          const firstName = (() => {
            for (const fd of allFieldDefs) {
              const m = (fd as any).contact_field_mapping;
              if (m === 'first_name' && fieldValues[fd.field_key]) return String(fieldValues[fd.field_key]);
            }
            return (displayName || '').trim().split(' ')[0] || null;
          })();
          const lastName = (() => {
            for (const fd of allFieldDefs) {
              const m = (fd as any).contact_field_mapping;
              if (m === 'last_name' && fieldValues[fd.field_key]) return String(fieldValues[fd.field_key]);
            }
            const parts = (displayName || '').trim().split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : null;
          })();

          const { data: newEntityId, error: entityError } = await (supabase as any)
            .rpc("create_lead_entity_for_org", {
              p_organization_id: activeCompanyId,
              p_display_name: (displayName || '').trim() || 'Lead sem nome',
              p_first_name: firstName,
              p_last_name: lastName,
            });
          if (entityError) throw entityError;
          entityId = newEntityId as string;
          entityCreatedHere = true;
          createdIds.push({ table: "anew_entities", id: entityId });

          try {
            await ensureEntityOrgLink({
              entityId,
              organizationId: activeCompanyId!,
              isPrimary: true,
            });
          } catch (linkErr) {
            console.warn('[org-link/create-anyway] non-fatal failure', linkErr);
          }
        }

        // Sequential email — only for reused entity do we snapshot the existing primary.
        if (emailValue) {
          const existing = await assertNoSupabaseError<{ id: string } | null>(
            supabase
              .from("anew_entity_emails")
              .select("id")
              .eq("entity_id", entityId)
              .ilike("email", emailValue)
              .maybeSingle(),
            "lookup existing email (create-anyway)",
          );
          if (!existing) {
            if (!entityCreatedHere) {
              const prevPrimary = await assertNoSupabaseError<{ id: string } | null>(
                supabase.from("anew_entity_emails")
                  .select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle(),
                "lookup primary email (create-anyway)",
              );
              if (prevPrimary?.id) {
                await assertNoSupabaseError(
                  (supabase.from("anew_entity_emails") as any).update({ is_primary: false }).eq("id", prevPrimary.id),
                  "deactivate primary email (create-anyway)",
                );
                primaryDeactivations.push({ kind: "email", id: prevPrimary.id });
              }
            }
            const inserted = await assertNoSupabaseError<{ id: string }>(
              (supabase.from("anew_entity_emails") as any).insert({
                entity_id: entityId, email: emailValue, email_type: 'personal',
                is_primary: true, created_by: createdBy,
              }).select("id").single(),
              "insert email (create-anyway)",
            );
            if (inserted?.id) createdIds.push({ table: "anew_entity_emails", id: inserted.id });
          }
        }

        if (phoneValue) {
          const digits = String(phoneValue).replace(/\D/g, "");
          const suffix = digits.length >= 7 ? digits.slice(-7) : digits;
          let exists = false;
          if (suffix.length >= 7) {
            const rows = await assertNoSupabaseError<Array<{ id: string; phone_number: string | null }>>(
              supabase.from("anew_entity_phones").select("id, phone_number").eq("entity_id", entityId),
              "lookup existing phone (create-anyway)",
            );
            exists = (rows || []).some((r: any) => {
              const d = String(r.phone_number || "").replace(/\D/g, "");
              return d.length >= 7 && d.slice(-7) === suffix;
            });
          }
          if (!exists) {
            if (!entityCreatedHere) {
              const prevPrimary = await assertNoSupabaseError<{ id: string } | null>(
                supabase.from("anew_entity_phones")
                  .select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle(),
                "lookup primary phone (create-anyway)",
              );
              if (prevPrimary?.id) {
                await assertNoSupabaseError(
                  (supabase.from("anew_entity_phones") as any).update({ is_primary: false }).eq("id", prevPrimary.id),
                  "deactivate primary phone (create-anyway)",
                );
                primaryDeactivations.push({ kind: "phone", id: prevPrimary.id });
              }
            }
            const inserted = await assertNoSupabaseError<{ id: string }>(
              (supabase.from("anew_entity_phones") as any).insert({
                entity_id: entityId, phone_number: phoneValue, phone_type: 'mobile',
                is_primary: true, created_by: createdBy,
              }).select("id").single(),
              "insert phone (create-anyway)",
            );
            if (inserted?.id) createdIds.push({ table: "anew_entity_phones", id: inserted.id });
          }
        }

        const { _assigned_to, ...cleanFieldValues } = fieldValues;
        const newLead = await assertNoSupabaseError<{ id: string }>(
          (supabase.from("anew_leads") as any).insert({
            campaign_id: createLeadCampaignId || null,
            organization_id: activeCompanyId,
            root_organization_id: resolvedRootOrgId,
            field_values: cleanFieldValues,
            status: "new",
            source: (createLeadSourceId && createLeadSourceId !== "none") ? (leadSources.find(s => s.id === createLeadSourceId)?.name || "manual") : "manual",
            source_id: (createLeadSourceId && createLeadSourceId !== "none") ? createLeadSourceId : null,
            created_by: createdBy,
            entity_id: entityId,
            assigned_to: assignedTo,
          }).select("id").single(),
          "insert lead (create-anyway)",
        );
        if (newLead?.id) createdIds.push({ table: "anew_leads", id: newLead.id });

        // Role upsert = commit point
        if (activeCompanyId && newLead) {
          await assertNoSupabaseError(
            (supabase.from("anew_entity_roles") as any).upsert({
              organization_id: activeCompanyId, entity_id: entityId, role: 'lead',
              status: 'active', source_type: 'lead', source_id: newLead.id, created_by: createdBy,
            }, { onConflict: 'organization_id,entity_id,role' }),
            "upsert role (create-anyway)",
          );
        }
        dbCommitted = true;

        entityIdForPostCommit = entityId;
        newLeadIdForPostCommit = newLead?.id || null;
        cleanFieldValuesForPostCommit = cleanFieldValues;
      } catch (err: any) {
        console.error('[create-anyway] failed:', err);
        if (createdIds.length === 0 && primaryDeactivations.length === 0) {
          const description = await getFriendlyErrorMessage(err);
          toast({ title: t('leads.toast.createError'), description, variant: "destructive" });
        } else {
          await runCleanup(err);
        }
        return;
      }

      // POST-COMMIT
      if (!entityIdForPostCommit) return;

      try {
        const addr = await syncEntityPrimaryAddressFromLead({
          supabase, entityId: entityIdForPostCommit, fieldValues, actorId: createdBy, allowOverwriteValid: false,
        });
        if (addr.decision === "error") {
          console.warn("[post-commit/create-anyway] address sync failed", addr.reason);
          toast({ title: "Lead criado, mas a morada não foi sincronizada", description: addr.reason ?? undefined });
        }
      } catch (e) {
        console.warn("[post-commit/create-anyway] address sync threw", e);
      }

      toast({ title: t('leads.toast.createSuccess') });
      setShowCreateLead(false); setNewLeadValues({}); setCreateLeadCampaignId(""); setCreateLeadSourceId("");
      if (newLeadIdForPostCommit) {
        setLeads(prev => [{
          id: newLeadIdForPostCommit!, organization_id: activeCompanyId!,
          campaign_id: createLeadCampaignId || null, field_values: cleanFieldValuesForPostCommit,
          status: 'new', source: "manual", notes: null, tags: null, created_at: new Date().toISOString(),
          created_by: createdBy, converted_to_contact_id: null, converted_at: null,
          assigned_to: assignedTo, entity_id: entityIdForPostCommit,
        } as Lead, ...prev]);
      }
      await loadStatusCounts();
    } finally {
      setCreatingLead(false);
      setPendingLeadData(null);
      setDuplicateMatches([]);
    }
  };


  // Handle "Partilhar com esta org" from duplicate dialog (group scope only).
  // Calls RPC link_entity_to_org (the ONLY path that writes shared_from_org_id /
  // shared_by / shared_at). After sharing, continues creating the lead reusing
  // the shared entity_id.
  const handleDuplicateShareWithOrg = async (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    if (!pendingLeadData || !activeCompanyId) return;
    setCreatingLead(true);
    try {
      await linkEntityToOrg(match.entityId, activeCompanyId);
      // Reuse the (now-shared) entity instead of creating a new one.
      await handleDuplicateCreateAnyway(match.entityId);
    } catch (err: any) {
      toast({ title: "Não foi possível partilhar a entidade", description: err.message, variant: "destructive" });
      setCreatingLead(false);
    }
  };



  // Handle "Open existing" from duplicate dialog
  const handleDuplicateOpenExisting = (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    setDuplicateDialogOpen(false);
    setShowCreateLead(false);
    setPendingLeadData(null);
    setDuplicateMatches([]);
    if (match.type === "contact") {
      navigate(`/contacts?open=${match.id}`);
      return;
    }
    if (match.type === "client") {
      navigate(`/clients?open=${match.id}`);
      return;
    }
    // Lead — open in current page
    const existingLead = leads.find(l => l.id === match.id);
    if (existingLead) {
      setSelectedLead(existingLead);
      setShowDetails(true);
    } else {
      // Fetch and open even if not in current page
      (async () => {
        const { data } = await (supabase as any).from("anew_leads").select("*").eq("id", match.id).single();
        if (data) {
          setSelectedLead(data);
          setShowDetails(true);
        } else {
          toast({ title: "Lead encontrada", description: `A lead "${match.displayName}" já existe. Pesquise por ela na lista.` });
        }
      })();
    }
  };

  // Handle "Update existing" from duplicate dialog
  const handleDuplicateUpdateExisting = async (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    if (!pendingLeadData) return;
    setCreatingLead(true);
    try {
      const { fieldValues } = pendingLeadData;
      const { _assigned_to, ...cleanFieldValues } = fieldValues;
      // Merge field_values — existing lead gets new data overlaid, and status becomes "new" if it was lost/rejected
      const { data: existingLead } = await (supabase as any).from("anew_leads").select("field_values, status").eq("id", match.id).single();
      const mergedValues = { ...(existingLead?.field_values || {}), ...cleanFieldValues };
      const newStatus = ["lost", "rejected"].includes(existingLead?.status) ? "new" : existingLead?.status;
      await (supabase as any).from("anew_leads").update({ field_values: mergedValues, status: newStatus, ...(fieldValues._assigned_to ? { assigned_to: fieldValues._assigned_to } : {}) }).eq("id", match.id);
      toast({ title: "Lead atualizada", description: `Os dados da lead "${match.displayName}" foram atualizados.` });
      setDuplicateDialogOpen(false);
      setShowCreateLead(false);
      setPendingLeadData(null);
      setDuplicateMatches([]);
      setNewLeadValues({});
      setLeads([]); setHasMore(true); loadLeads();
      loadStatusCounts();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally {
      setCreatingLead(false);
    }
  };

  const BASE_FIELD_KEYS = ['first_name', 'last_name', 'email', 'phone', 'company_name', 'address', 'postal_code', 'city', 'notes'];
  const BASE_FIELD_KEY_SET = new Set(BASE_FIELD_KEYS.map((key) => key.toLowerCase()));
  const BASE_CONTACT_MAPPINGS = new Set(['first_name', 'last_name', 'email', 'phone', 'mobile', 'address', 'postal_code', 'city', 'notes']);
  const BASE_CLIENT_MAPPINGS = new Set(['first_name', 'last_name', 'email', 'phone', 'company_name', 'name', 'notes']);

  const isMappedToBaseLeadField = (field: {
    field_key?: string | null;
    contact_field_mapping?: string | null;
    client_field_mapping?: string | null;
  }) => {
    const fieldKey = String(field.field_key || '').toLowerCase();
    const contactMapping = String(field.contact_field_mapping || '').toLowerCase();
    const clientMapping = String(field.client_field_mapping || '').toLowerCase();

    return (
      BASE_FIELD_KEY_SET.has(fieldKey) ||
      (!!contactMapping && BASE_CONTACT_MAPPINGS.has(contactMapping)) ||
      (!!clientMapping && BASE_CLIENT_MAPPINGS.has(clientMapping))
    );
  };
  
  useEffect(() => {
    // Always set base fields for the create dialog
    const baseFields = [
      { id: 'base_first_name', campaign_id: null, organization_id: null, field_key: 'first_name', field_label: t('leads.fields.firstName'), field_type: 'text', is_required: true, sort_order: 1, contact_field_mapping: 'first_name' },
      { id: 'base_last_name', campaign_id: null, organization_id: null, field_key: 'last_name', field_label: t('leads.fields.lastName'), field_type: 'text', is_required: true, sort_order: 2, contact_field_mapping: 'last_name' },
      { id: 'base_email', campaign_id: null, organization_id: null, field_key: 'email', field_label: t('leads.fields.email'), field_type: 'email', is_required: false, sort_order: 3, contact_field_mapping: 'email' },
      { id: 'base_phone', campaign_id: null, organization_id: null, field_key: 'phone', field_label: t('leads.fields.phone'), field_type: 'phone', is_required: false, sort_order: 4, contact_field_mapping: 'phone' },
      { id: 'base_company', campaign_id: null, organization_id: null, field_key: 'company_name', field_label: t('leads.fields.companyName'), field_type: 'text', is_required: false, sort_order: 5, client_field_mapping: 'name' },
      { id: 'base_address', campaign_id: null, organization_id: null, field_key: 'address', field_label: t('leads.fields.address') || 'Morada', field_type: 'text', is_required: false, sort_order: 6 },
      { id: 'base_postal_code', campaign_id: null, organization_id: null, field_key: 'postal_code', field_label: t('leads.fields.postalCode') || 'Código Postal', field_type: 'text', is_required: false, sort_order: 7 },
      { id: 'base_city', campaign_id: null, organization_id: null, field_key: 'city', field_label: t('leads.fields.city') || 'Cidade', field_type: 'text', is_required: false, sort_order: 8 },
      { id: 'base_notes', campaign_id: null, organization_id: null, field_key: 'notes', field_label: t('leads.fields.notes'), field_type: 'textarea', is_required: false, sort_order: 9 },
    ];
    setCreateLeadFieldDefs(baseFields as any);
  }, []);

  // Load extra campaign fields when campaign changes
  useEffect(() => {
    const loadCampaignFields = async () => {
      if (!createLeadCampaignId) {
        setExtraCampaignFieldDefs([]);
        setCreateLeadFormId("");
        return;
      }

      // Check if campaign has an associated form
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("form_id")
        .eq("id", createLeadCampaignId)
        .single();

      let formIdToUse = campaign?.form_id || "";
      if (formIdToUse) {
        setCreateLeadFormId(formIdToUse);
      }

      if (!formIdToUse) {
        // Fallback: load from lead_field_definitions
        const { data } = await supabase
          .from("lead_field_definitions")
          .select("*")
          .eq("campaign_id", createLeadCampaignId)
          .eq("is_active", true)
          .order("sort_order");
        if (data && data.length > 0) {
          setExtraCampaignFieldDefs(data);
          return;
        }
        setExtraCampaignFieldDefs([]);
        return;
      }

      // Load fields from form_fields
      const { data } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formIdToUse)
        .eq("is_active", true)
        .order("step_number")
        .order("sort_order");

      // Map form fields (no filtering - all form fields shown; base fields hidden instead)
      const mappedFields = (data || [])
        .map(f => ({
          id: f.id,
          campaign_id: null,
          organization_id: null,
          field_key: f.field_key,
          field_label: f.field_label,
          field_type: f.field_type,
          is_required: f.is_required,
          is_unique: f.is_unique,
          options: f.options,
          sort_order: f.sort_order,
          contact_field_mapping: f.contact_field_mapping,
          client_field_mapping: f.client_field_mapping,
          placeholder: f.placeholder,
          help_text: f.help_text,
          display_style: f.display_style,
        }));

      setExtraCampaignFieldDefs(mappedFields);
    };
    loadCampaignFields();
  }, [createLeadCampaignId, availableForms]);

  const handleDeleteLead = useCallback(async (id: string) => {
    const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "lead", p_id: id });

    if (error) {
      toast({ title: t('leads.toast.deleteError'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t('leads.toast.deleteSuccess') });
      setLeads(prev => prev.filter(l => l.id !== id));
      loadStatusCounts();
    }
  }, [toast, t, loadStatusCounts]);

  // Assign lead to user
  const handleAssignLead = async (leadId: string, userId: string | null) => {
    const { error } = await supabase
      .from("anew_leads")
      .update({ assigned_to: userId })
      .eq("id", leadId);

    if (error) {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    } else {
      toast({ title: userId ? t('leads.toast.assigned') : t('leads.toast.unassigned') });
      refreshSingleLead(leadId);
    }
  };

  // Bulk actions handlers
  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;

    setIsBulkDeleting(true);
    let firstError: any = null;
    for (const id of selectedLeadIds) {
      const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "lead", p_id: id });
      if (error && !firstError) firstError = error;
    }

    if (firstError) {
      toast({ title: "Erro ao eliminar", description: firstError.message, variant: "destructive" });
    } else {
      toast({ title: `${selectedLeadIds.length} lead(s) movida(s) para o lixo` });
      setSelectedLeadIds([]);
      loadLeads();
      loadStatusCounts();
    }
    setIsBulkDeleting(false);
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedLeadIds.length === 0) return;
    
    setIsBulkUpdating(true);
    // Find matching workflow stage
    const matchingStage = workflowStages.find(s => s.name === newStatus);
    const updatePayload: any = { status: newStatus };
    if (matchingStage?.id) {
      updatePayload.workflow_stage_id = matchingStage.id;
    }
    const { error } = await supabase
      .from("anew_leads")
      .update(updatePayload)
      .in("id", selectedLeadIds);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status atualizado para ${selectedLeadIds.length} lead(s)` });
      // Execute workflow for each lead BEFORE reloading
      if (matchingStage?.id && activeCompanyId) {
        for (const leadId of selectedLeadIds) {
          try {
            await supabase.functions.invoke('execute-workflow', {
              body: {
                source_entity: 'lead',
                entity_id: leadId,
                new_stage_id: matchingStage.id,
                organization_id: activeCompanyId,
                triggered_by: scopeAuthUserId,
              }
            });
          } catch (wfErr) {
            console.error("Workflow execution error for lead:", leadId, wfErr);
          }
        }
      }
      setSelectedLeadIds([]);
      // Reload AFTER workflow completes
      loadLeads();
      loadStatusCounts();
    }
    setIsBulkUpdating(false);
  };

  const handleBulkContactResultChange = async (resultId: string) => {
    if (selectedLeadIds.length === 0) return;
    
    setIsBulkUpdating(true);
    const updateData = resultId === "clear" 
      ? { last_contact_result: null }
      : { last_contact_result: resultId, last_contact_at: new Date().toISOString() };
    
    const { error } = await supabase
      .from("anew_leads")
      .update(updateData)
      .in("id", selectedLeadIds);

    if (error) {
      toast({ title: "Erro ao atualizar resultado", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Resultado atualizado para ${selectedLeadIds.length} lead(s)` });
      setSelectedLeadIds([]);
      loadLeads();
      loadStatusCounts();
    }
    setIsBulkUpdating(false);
  };

  const handleBulkAssigneeChange = async (userId: string) => {
    if (selectedLeadIds.length === 0) return;
    
    setIsBulkUpdating(true);
    const updateData = userId === "clear" 
      ? { assigned_to: null }
      : { assigned_to: userId };
    
    const { error } = await supabase
      .from("anew_leads")
      .update(updateData)
      .in("id", selectedLeadIds);

    if (error) {
      toast({ title: "Erro ao atualizar atribuído", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Atribuição atualizada para ${selectedLeadIds.length} lead(s)` });
      setSelectedLeadIds([]);
      loadLeads();
    }
    setIsBulkUpdating(false);
  };

  const handleSelectAllLeads = useCallback(() => {
    // This will be called after filteredLeads is defined
  }, []);

  const toggleLeadSelection = useCallback((leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedLeadIds(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  }, []);

  // Distinct source options fetched from DB (covers all leads in org, not only loaded page)
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    (async () => {
      try {
        let q = (supabase as any).from("anew_leads").select("source");
        if (isRootOrg) {
          q = q.or(`root_organization_id.eq.${activeCompanyId},organization_id.eq.${activeCompanyId}`);
        } else {
          q = q.eq("organization_id", activeCompanyId);
        }
        const { data, error } = await q.not("source", "is", null).limit(5000);
        if (error || cancelled) return;
        const set = new Set<string>();
        (data || []).forEach((r: any) => {
          const s = (r.source || "").trim();
          if (s) set.add(s);
        });
        // Merge with any sources visible in the current page (safety net)
        leads.forEach((l) => {
          const s = (l.source || "").trim();
          if (s) set.add(s);
        });
        setSourceOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
      } catch {
        // fallback: derive from in-memory leads
        const set = new Set<string>();
        leads.forEach((l) => {
          const s = (l.source || "").trim();
          if (s) set.add(s);
        });
        if (!cancelled) setSourceOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
      }
    })();
    return () => { cancelled = true; };
  }, [activeCompanyId, isRootOrg, leads]);

  // Filter (by source) + sort leads — memoized to stabilize reference
  const filteredLeads = useMemo(() => {
    const base = sourceFilter === "all"
      ? leads
      : sourceFilter === "none"
        ? leads.filter((l) => !l.source)
        : leads.filter((l) => (l.source || "") === sourceFilter);

    return [...base].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortColumn) {
        case "created_at":
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "source":
          aVal = a.source || "";
          bVal = b.source || "";
          break;
        case "last_contact_result":
          aVal = a.last_contact_result || "";
          bVal = b.last_contact_result || "";
          break;
        case "campaign":
          aVal = a.campaigns?.name || "";
          bVal = b.campaigns?.name || "";
          break;
        default:
          // For field_values columns
          aVal = a.field_values?.[sortColumn] || "";
          bVal = b.field_values?.[sortColumn] || "";
      }
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [leads, sortColumn, sortDirection, sourceFilter]);

  const visibleStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    filteredLeads.forEach((lead) => {
      const effectiveStatus = getEffectiveStatus(lead);
      counts[effectiveStatus] = (counts[effectiveStatus] || 0) + 1;
    });

    return counts;
  }, [filteredLeads]);

  // Computed values that depend on filteredLeads
  const isAllSelected = filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length;
  const isSomeSelected = selectedLeadIds.length > 0 && selectedLeadIds.length < filteredLeads.length;

  const selectAllFilteredLeads = () => {
    const allIds = filteredLeads.map(l => l.id);
    setSelectedLeadIds(allIds);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // SortIcon as a render function (not a component) to avoid unmount/remount
  const renderSortIcon = useCallback((column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  }, [sortColumn, sortDirection]);

  // Get field definitions for the selected campaign filter (for display columns)
  const [displayFieldDefs, setDisplayFieldDefs] = useState<FieldDefinition[]>([]);
  
  useEffect(() => {
    const loadDisplayFields = async () => {
      if (campaignFilter !== "all") {
        const { data } = await supabase
          .from("lead_field_definitions")
          .select("id, campaign_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, default_value, organization_id, contact_field_mapping, client_field_mapping")
          .eq("campaign_id", campaignFilter)
          .eq("is_active", true)
          .order("sort_order");
        setDisplayFieldDefs(data || []);
      } else {
        setDisplayFieldDefs([]);
      }
    };
    loadDisplayFields();
  }, [campaignFilter]);

  useEffect(() => {
    const scrollEl = leadsTableScrollRef.current;
    const scrollbarEl = leadsTableScrollbarRef.current;
    if (!scrollEl || !scrollbarEl) return;

    let syncingFromTable = false;
    let syncingFromScrollbar = false;

    const syncWidth = () => {
      const contentWidth = scrollEl.scrollWidth;
      setLeadsTableScrollWidth(contentWidth);
    };

    const handleTableScroll = () => {
      if (syncingFromScrollbar) return;
      syncingFromTable = true;
      scrollbarEl.scrollLeft = scrollEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromTable = false;
      });
    };

    const handleScrollbarScroll = () => {
      if (syncingFromTable) return;
      syncingFromScrollbar = true;
      scrollEl.scrollLeft = scrollbarEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromScrollbar = false;
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      syncWidth();
      scrollbarEl.scrollLeft = scrollEl.scrollLeft;
    });

    resizeObserver.observe(scrollEl);
    if (scrollEl.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(scrollEl.firstElementChild);
    }

    scrollEl.addEventListener("scroll", handleTableScroll, { passive: true });
    scrollbarEl.addEventListener("scroll", handleScrollbarScroll, { passive: true });

    syncWidth();
    scrollbarEl.scrollLeft = scrollEl.scrollLeft;

    return () => {
      resizeObserver.disconnect();
      scrollEl.removeEventListener("scroll", handleTableScroll);
      scrollbarEl.removeEventListener("scroll", handleScrollbarScroll);
    };
  }, [filteredLeads.length, campaignFilter, loadingMore]);
  
  // Smart field detection: auto-detect common fields from all leads — memoized
  const smartDetectedColumns = useMemo(() => {
    if (campaignFilter !== "all" || leads.length === 0) return [];
    
    // Priority fields to look for (common lead fields)
    const priorityPatterns = [
      { patterns: ['name', 'nome', 'full_name', 'nome_completo', 'first_name', 'nome_proprio'], label: 'Nome' },
      { patterns: ['phone', 'telefone', 'tel', 'mobile', 'telemovel', 'contacto'], label: 'Telefone' },
      { patterns: ['email', 'e_mail', 'e-mail', 'correio'], label: 'Email' },
    ];
    
    // Collect all unique field keys from all leads (excluding _meta)
    const allFieldKeys = new Set<string>();
    leads.forEach(lead => {
      if (lead.field_values) {
        Object.keys(lead.field_values).forEach(key => {
          if (key !== '_meta') allFieldKeys.add(key);
        });
      }
    });
    
    const detectedColumns: { key: string; label: string }[] = [];
    const usedKeys = new Set<string>();
    
    // First, try to find priority fields
    for (const priority of priorityPatterns) {
      for (const key of allFieldKeys) {
        const keyLower = key.toLowerCase();
        if (priority.patterns.some(p => keyLower.includes(p)) && !usedKeys.has(key)) {
          detectedColumns.push({ key, label: priority.label });
          usedKeys.add(key);
          break;
        }
      }
    }
    
    return detectedColumns;
  }, [campaignFilter, leads]);
  
  const displayColumns = campaignFilter !== "all" 
    ? displayFieldDefs.slice(0, 4) 
    : smartDetectedColumns;

  // Memoized data for LeadsAIOrganization
  const aiOrgLeads = useMemo(() => leads.map(l => ({
    id: l.id,
    name: l.field_values?.nome || l.field_values?.name || 'Lead',
    postal_code: l.field_values?.codigo_postal || l.field_values?.postal_code,
    city: l.field_values?.cidade || l.field_values?.city,
    district: l.field_values?.distrito || l.field_values?.district,
    last_contacted_at: l.last_contact_at || undefined,
    callback_scheduled_at: l.callback_scheduled_at || undefined,
    status: l.status,
    created_at: l.created_at,
    value: l.field_values?.valor || l.field_values?.value
  })), [leads]);

  const handleRowViewDetails = useCallback((lead: any) => {
    setSelectedLead(lead);
    setDetailTab("info");
    setShowDetails(true);
  }, []);

  const handleRowContact = useCallback((lead: any) => {
    openContactDialogForLead(lead);
  }, [openContactDialogForLead]);

  const handleRowEdit = useCallback((lead: any) => {
    setSelectedLead(lead);
    setShowEditDialog(true);
  }, []);

  const handleRowEmail = useCallback(async (lead: any) => {
    const info = extractLeadContactInfo(lead.field_values || {});
    let emailAddr = "";
    let nameStr = "";
    // Prefer entity-level data (display_name + primary email) like proposals/contacts/clients
    if (lead.entity_id) {
      try {
        const [emailsRes, entityRes] = await Promise.all([
          (supabase as any).from("anew_entity_emails").select("email, is_primary").eq("entity_id", lead.entity_id).order("is_primary", { ascending: false }).limit(1),
          (supabase as any).from("anew_entities").select("display_name, first_name, last_name").eq("id", lead.entity_id).maybeSingle(),
        ]);
        emailAddr = emailsRes?.data?.[0]?.email || "";
        const ent = entityRes?.data;
        if (ent) {
          nameStr = ent.display_name || `${ent.first_name || ""} ${ent.last_name || ""}`.trim();
        }
      } catch (e) { /* noop */ }
    }
    // Fallback to lead field_values aliases (po_email, nome, etc.)
    if (!emailAddr) emailAddr = info.email || "";
    if (!nameStr) nameStr = info.name || "";
    setEmailTarget({ id: lead.entity_id || lead.id, name: nameStr || "Lead", email: emailAddr, leadId: lead.id, entityId: lead.entity_id || undefined });
    setShowEmailDialog(true);
  }, []);

  const handleRowWhatsApp = useCallback((lead: any) => {
    const fv = lead.field_values || {};
    const leadPhone = extractSmartField(fv, ['phone', 'telefone', 'tel', 'mobile', 'telemovel', 'celular']);
    const leadName = `${fv.first_name || fv.nome || ""} ${fv.last_name || fv.apelido || ""}`.trim();
    setWhatsAppContext({
      module: "leads",
      recipientName: leadName || "Lead",
      recipientPhone: leadPhone,
      leadId: lead.id,
      entityId: lead.entity_id || undefined,
      organizationId: lead.organization_id || undefined,
    });
    setShowWhatsAppDialog(true);
  }, [extractSmartField]);

  const handleRowConvertToContact = useCallback((lead: any) => {
    openConversionDialog(lead, 'contact');
  }, [openConversionDialog]);

  const handleRowConvertToClient = useCallback((lead: any) => {
    openConversionDialog(lead, 'client');
  }, [openConversionDialog]);

  const handleRowDuplicate = useCallback((lead: any) => {
    const newValues = { ...(lead.field_values || {}) };
    setNewLeadValues(newValues);
    setCreateLeadCampaignId(lead.campaign_id || "");
    setShowCreateLead(true);
  }, []);

  const handleRowReassignVisit = useCallback((lead: any) => {
    setSelectedLead(lead);
    setShowVisitReassignDialog(true);
  }, []);

  return (
    <>
      {companyLoading ? (
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      ) : !activeCompany ? (
        <div className="space-y-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('leads.title')}</h1><p className="text-muted-foreground">{t('leads.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      ) : (
      <div className="space-y-6">
        <ModuleAlertsBanner alerts={leadAlerts} onDismiss={dismissLeadAlert} onAction={() => {}} onAlertClick={(alert) => {
          const entityIds = alert.action_config?.entity_ids as string[] | undefined;
          const alertRef = entityIds?.[0] || alert.entity_id;
          if (!alertRef) return;
          const found = leads.find((l: any) => l.id === alertRef || l.entity_id === alertRef);
          if (found) { handleRowViewDetails(found); }
        }} />
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold">{t('leads.title')}</h1>
              <HelpButton pageKey="marketing.leads" />
            </div>
            <p className="text-muted-foreground">
              {t('leads.subtitle')}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => loadLeads(false)} title={t('leads.refresh')}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <PermissionGate permission="leads.create">
              <Button onClick={() => { setCreateLeadCampaignId(""); setCreateLeadFormId(""); setCreateLeadSourceId(""); setNewLeadValues({}); setExtraCampaignFieldDefs([]); setShowCreateLead(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('leads.newLead')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="leads.config">
              <Button variant="outline" onClick={() => setShowWorkflowConfig(true)}>
                <Workflow className="w-4 h-4 mr-2" />
                {t('leads.workflow')}
              </Button>
            </PermissionGate>
            <PermissionGate permission="leads.config">
              <Button variant="outline" onClick={() => setShowAISchedulingConfig(true)}>
                <Sparkles className="w-4 h-4 mr-2" />
                {t('leads.aiScheduling')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Callbacks Alert */}
        {showCallbackAlert && todayCallbacks.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <BellRing className="h-4 w-4 text-amber-600" />
            <div className="flex-1">
              <AlertDescription className="flex items-center justify-between gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="font-medium text-amber-800 dark:text-amber-200 hover:underline text-left"
                    >
                      {t('leads.callbacksToday').replace('{count}', String(todayCallbacks.length))}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="text-sm font-medium">
                        {t('leads.callbacksToday').replace('{count}', String(todayCallbacks.length))}
                      </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y">
                      {todayCallbacks.map((lead) => {
                        const info = extractLeadContactInfo(lead.field_values);
                        const time = lead.callback_scheduled_at
                          ? new Date(lead.callback_scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : null;
                        return (
                          <button
                            key={lead.id}
                            type="button"
                            className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                            onClick={() => {
                              openContactDialogForLead(lead);
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {info.name || 'Lead'}
                              </p>
                              {info.phone && (
                                <p className="text-xs text-muted-foreground truncate">{info.phone}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {time && (
                                <span className="text-xs text-muted-foreground">{time}</span>
                              )}
                              <Phone className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-500 text-amber-700 hover:bg-amber-100"
                    onClick={() => {
                      const firstCallback = todayCallbacks[0];
                      if (firstCallback) {
                        openContactDialogForLead(firstCallback);
                      }
                    }}
                  >
                    <Phone className="w-3 h-3 mr-1" />
                    {t('leads.callNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowCallbackAlert(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dashboard" | "list")} className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                {t('leads.tabs.dashboard')}
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                {t('leads.tabs.list')}
              </TabsTrigger>
            </TabsList>
            
            {/* Stats summary for quick reference */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary"></div>
                <span className="text-muted-foreground">{t('leads.stats.total')}:</span>
                <span className="font-semibold">{globalTotal}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-warning"></div>
                <span className="text-muted-foreground">{t('leads.stats.new')}:</span>
                <span className="font-semibold">{statusCounts['new'] || 0}</span>
              </div>
            {/* Average Health Score */}
            {(() => {
              const dist = { excellent: 0, good: 0, attention: 0, at_risk: 0, critical: 0 };
              let totalScore = 0;
              let countActive = 0;
              leads.forEach(l => {
                if (l.status === 'lost' || l.status === 'rejected') return;
                const resultObj = contactResults.find(r => r.id === l.last_contact_result);
                const hs = calculateLeadHealthScore({
                  lastContactResultName: resultObj?.name || null,
                  lastContactAt: l.last_contact_at || null,
                  createdAt: l.created_at,
                  status: l.status,
                  contactAttempts: l.contact_attempts || 0,
                });
                totalScore += hs.score;
                countActive++;
                dist[hs.level]++;
              });
              const avgHealth = countActive > 0 ? Math.round(totalScore / countActive) : 0;
              const healthColor = avgHealth >= 80 ? "text-green-600" : avgHealth >= 60 ? "text-blue-600" : avgHealth >= 40 ? "text-yellow-600" : avgHealth >= 20 ? "text-orange-600" : "text-red-600";
              return (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 cursor-help">
                        <Heart className={`w-3.5 h-3.5 ${healthColor}`} />
                        <span className="text-muted-foreground">Saúde Média:</span>
                        <span className={`font-semibold ${healthColor}`}>{avgHealth}/100</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1 p-3">
                      <div>
                        <p className="font-semibold mb-1">📊 Distribuição ({countActive} leads activas)</p>
                        <div className="space-y-0.5">
                          <p>🟢 Excelente (80-100): <strong>{dist.excellent}</strong></p>
                          <p>🔵 Bom (60-79): <strong>{dist.good}</strong></p>
                          <p>🟡 Atenção (40-59): <strong>{dist.attention}</strong></p>
                          <p>🟠 Risco (20-39): <strong>{dist.at_risk}</strong></p>
                          <p>🔴 Crítico (0-19): <strong>{dist.critical}</strong></p>
                        </div>
                        <hr className="my-2 border-border" />
                        <p className="font-semibold mb-1">📐 Como é calculada?</p>
                        <p>Score de 0-100 baseado em 4 componentes:</p>
                        <ul className="list-disc ml-3 mt-1 space-y-0.5">
                          <li><strong>Resultado contacto</strong> — até 35 pts</li>
                          <li><strong>Dias sem contacto</strong> — até 25 pts</li>
                          <li><strong>Fase no funil</strong> — até 20 pts</li>
                          <li><strong>Tentativas vs resultado</strong> — até 20 pts</li>
                        </ul>
                        <p className="text-muted-foreground mt-1">Exclui leads Lost/Rejected da média.</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })()}
            </div>
          </div>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            <LeadsDashboard 
              leads={leads}
              workflowStages={workflowStages}
              campaigns={campaigns}
              companyId={activeCompanyId}
            />
          </TabsContent>

          {/* List Tab */}
          <TabsContent value="list" className="space-y-6 mt-6">
            {/* AI Organization Suggestions */}
            <LeadsAIOrganization
              leads={aiOrgLeads}
              onSelectLeads={(ids) => {
                setSelectedLeadIds(ids);
                if (ids.length > 0) {
                  // Scroll to table
                  const tableElement = document.querySelector('[data-leads-table]');
                  if (tableElement) {
                    tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                  toast({
                    title: `🎯 ${ids.length} leads priorizadas`,
                    description: "As leads estão destacadas na tabela abaixo"
                  });
                }
              }}
              onOpenConfig={() => setShowAIConfig(true)}
              companyId={activeCompanyId}
            />

            {/* Quick Status Cards */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {workflowStages.length > 0 ? (
                workflowStages.filter(stage => stage.name !== 'converted').map(stage => (
                  <Card 
                    key={stage.id} 
                    className={`cursor-pointer hover:shadow-md transition-all min-w-[130px] flex-shrink-0 ${
                      statusFilter === stage.name ? 'ring-2 ring-primary shadow-md' : ''
                    }`}
                    onClick={() => setStatusFilter(stage.name === statusFilter ? "all" : stage.name)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: stage.color }}
                        />
                        <div className="text-xl font-bold">
                          {statusCounts[stage.name] || 0}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{stage.label}</div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                [
                  { name: "new", label: "New", color: "#3b82f6" },
                  { name: "contacted", label: "Contacted", color: "#f59e0b" },
                  { name: "callback_scheduled", label: "Callback Agendado", color: "#a855f7" },
                  { name: "visit_scheduled", label: "Visita Agendada", color: "#06b6d4" },
                  { name: "qualified", label: "Qualified", color: "#22c55e" },
                  { name: "proposal_sent", label: "Proposal Sent", color: "#6366f1" },
                  { name: "negotiation", label: "Negotiation", color: "#ec4899" },
                  { name: "lost", label: "Lost / Rejected", color: "#ef4444" },
                ].map(status => (
                  <Card 
                    key={status.name} 
                    className={`cursor-pointer hover:shadow-md transition-all min-w-[130px] flex-shrink-0 ${
                      statusFilter === status.name ? 'ring-2 ring-primary shadow-md' : ''
                    }`}
                    onClick={() => setStatusFilter(status.name === statusFilter ? "all" : status.name)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: status.color }}
                        />
                        <div className="text-xl font-bold">
                          {status.name === 'lost' 
                            ? (statusCounts['lost'] || 0) + (statusCounts['rejected'] || 0) + (statusCounts['Rejected'] || 0)
                            : (statusCounts[status.name] || 0)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{status.label}</div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Filters Section - Enhanced */}
            <Card className="bg-gradient-to-r from-muted/30 to-muted/10">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Filter className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <span className="font-semibold text-sm">Filtros Avançados</span>
                      <p className="text-xs text-muted-foreground">
                        {Math.min(filteredLeads.length, paginationTotal)} de {paginationTotal} leads
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(searchTerm || campaignFilter !== "all" || statusFilter !== "all" || contactResultFilter !== "all" || dateFrom || dateTo) && (
                      <Badge variant="secondary" className="gap-1">
                        <span className="text-xs">
                          {[
                            searchTerm && "Pesquisa",
                            campaignFilter !== "all" && "Campanha",
                            statusFilter !== "all" && "Status",
                            contactResultFilter !== "all" && "Resultado",
                            (dateFrom || dateTo) && "Data"
                          ].filter(Boolean).length} filtros ativos
                        </span>
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setSearchTerm("");
                        setCampaignFilter("all");
                        setStatusFilter("all");
                        setContactResultFilter("all");
                        setSourceFilter("all");
                        setDateFrom(undefined);
                        setDateTo(undefined);
                      }}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Limpar Tudo
                    </Button>
                  </div>
                </div>
                
                {/* Main Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar por nome, email, telefone, campanha..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10 h-10 bg-background border-muted-foreground/20"
                    />
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => setSearchTerm("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {searchTerm.length > 0 && searchTerm.length < 3 && (
                    <p className="text-xs text-muted-foreground mt-1">Digite pelo menos 3 caracteres para pesquisar</p>
                  )}
                </div>

                {/* Only Mine Toggle + Filter Grid */}
                <div className="flex items-end gap-3 mb-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Meus</span>
                    <div className="flex items-center gap-1.5 h-9">
                      <Switch checked={onlyMine} onCheckedChange={setOnlyMine} className="scale-75" />
                      <span className={cn("text-xs font-medium", onlyMine ? "text-primary" : "text-muted-foreground")}>Só os meus</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Campaign Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Campanha</Label>
                    <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Campanhas</SelectItem>
                        {campaigns.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Status</SelectItem>
                        {workflowStages.length > 0 ? (
                          workflowStages.map(stage => (
                            <SelectItem key={stage.id} value={stage.name}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                                {stage.label}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            
                            <SelectItem value="callback_scheduled">Callback Agendado</SelectItem>
                            <SelectItem value="visit_scheduled">Visita Agendada</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Contact Result Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Resultado Contacto</Label>
                    <Select value={contactResultFilter} onValueChange={setContactResultFilter}>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Resultados</SelectItem>
                        <SelectItem value="none">Sem Contacto</SelectItem>
                        {contactResults.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                              {r.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assigned To Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('leads.assignedTo')}</Label>
                    <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="unassigned">Não Atribuído</SelectItem>
                        {companyUsers.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3" />
                              {u.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Source / Origem Filter */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Origem</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas Origens</SelectItem>
                        <SelectItem value="none">Sem Origem</SelectItem>
                        {sourceOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date From */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Data Início</Label>
                    <Popover modal={false}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal bg-background",
                            !dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                          locale={pt}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Date To */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Data Fim</Label>
                    <Popover modal={false}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal bg-background",
                            !dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                          locale={pt}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Active Filters Pills */}
                {(searchTerm || onlyMine || campaignFilter !== "all" || statusFilter !== "all" || contactResultFilter !== "all" || dateFrom || dateTo) && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                    {onlyMine && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Só os meus</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setOnlyMine(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {searchTerm && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Pesquisa: {searchTerm}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setSearchTerm("")}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {campaignFilter !== "all" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Campanha: {campaigns.find(c => c.id === campaignFilter)?.name}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setCampaignFilter("all")}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {statusFilter !== "all" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Status: {workflowStages.find(s => s.name === statusFilter)?.label || statusFilter}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setStatusFilter("all")}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {contactResultFilter !== "all" && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Resultado: {contactResultFilter === "none" ? "Sem Contacto" : contactResults.find(r => r.id === contactResultFilter)?.name}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setContactResultFilter("all")}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {dateFrom && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>De: {format(dateFrom, "dd/MM/yy")}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setDateFrom(undefined)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                    {dateTo && (
                      <Badge variant="secondary" className="gap-1 pr-1">
                        <span>Até: {format(dateTo, "dd/MM/yy")}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-transparent" onClick={() => setDateTo(undefined)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bulk Actions Bar */}
            <LeadsBulkActions
              selectedCount={selectedLeadIds.length}
              totalCount={filteredLeads.length}
              onSelectAll={selectAllFilteredLeads}
              onClearSelection={() => setSelectedLeadIds([])}
              onBulkStatusChange={handleBulkStatusChange}
              onBulkContactResultChange={handleBulkContactResultChange}
              onBulkAssigneeChange={handleBulkAssigneeChange}
              onBulkDelete={handleBulkDelete}
              workflowStages={workflowStages}
              contactResults={contactResults}
              companyUsers={companyUsers}
              isDeleting={isBulkDeleting}
              isUpdating={isBulkUpdating}
            />

            {/* Leads Table */}
            <Card data-leads-table className="flex flex-col max-h-[calc(100vh-280px)] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{filteredLeads.length} leads</span>
                </div>
                <LeadsTableColumns
                  campaignId={campaignFilter !== "all" ? campaignFilter : undefined}
                  fieldDefinitions={fieldDefs.map(f => ({ field_key: f.field_key, field_label: f.field_label }))}
                  onColumnsChange={setVisibleColumns}
                />
              </div>
              <div
                ref={leadsTableScrollRef}
                className="flex-1 min-h-0 overflow-auto leads-table-scroll"
              >
                  <Table density="compact" className="min-w-[1200px]" containerClassName="overflow-visible">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        {/* Checkbox Column */}
                        <TableHead className="w-10 text-center">
                          <Checkbox
                            checked={isAllSelected}
                            ref={(el) => {
                              if (el) {
                                (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = isSomeSelected;
                              }
                            }}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                selectAllFilteredLeads();
                              } else {
                                setSelectedLeadIds([]);
                              }
                            }}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                        {/* Last Contact At */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none w-28"
                          onClick={() => handleSort("last_contact_at")}
                        >
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs">Últ. Contacto</span>
                            {renderSortIcon("last_contact_at")}
                          </div>
                        </TableHead>
                        {/* Name */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("nome")}
                        >
                          <div className="flex items-center">Nome{renderSortIcon("nome")}</div>
                        </TableHead>
                        {/* Phone */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("telefone")}
                        >
                          <div className="flex items-center">Telefone{renderSortIcon("telefone")}</div>
                        </TableHead>
                        {/* WhatsApp Column */}
                        <TableHead className="w-10 text-center">
                          <MessageCircle className="h-4 w-4 mx-auto text-green-600" />
                        </TableHead>
                        {/* Email */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("email")}
                        >
                          <div className="flex items-center">Email{renderSortIcon("email")}</div>
                        </TableHead>
                        {/* Status */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("status")}
                        >
                          <div className="flex items-center">Status{renderSortIcon("status")}</div>
                        </TableHead>
                        {/* Campaign - only if filter is "all" */}
                        {campaignFilter === "all" && (
                          <TableHead 
                            className="cursor-pointer hover:bg-muted/50 select-none"
                            onClick={() => handleSort("campaign")}
                          >
                            <div className="flex items-center">Campanha{renderSortIcon("campaign")}</div>
                          </TableHead>
                        )}
                        {/* Dynamic columns from campaign fields - only when filtered */}
                        {campaignFilter !== "all" && displayColumns.slice(3).map(col => (
                          <TableHead 
                            key={col.field_key}
                            className="cursor-pointer hover:bg-muted/50 select-none"
                            onClick={() => handleSort(col.field_key)}
                          >
                            <div className="flex items-center">
                              {col.field_label}
                              {renderSortIcon(col.field_key)}
                            </div>
                          </TableHead>
                        ))}
                        {/* Created */}
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none w-28"
                          onClick={() => handleSort("created_at")}
                        >
                          <div className="flex items-center">Criado{renderSortIcon("created_at")}</div>
                        </TableHead>
                        {/* Created by / Source */}
                        <TableHead
                          className="w-32 cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("source")}
                        >
                          <div className="flex items-center">Origem{renderSortIcon("source")}</div>
                        </TableHead>
                        {/* Assigned To */}
                        <TableHead className="w-36">
                          <div className="flex items-center">{t('leads.assignedTo')}</div>
                        </TableHead>
                        {/* Dias sem contacto */}
                        <TableHead className="w-32">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs">Dias s/ contacto</span>
                          </div>
                        </TableHead>
                        {/* Actions Column - Last */}
                        <TableHead className="text-right sticky right-0 bg-muted/30 z-10 min-w-[180px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-8">
                            <OlyviaLoader size={28} text="A carregar..." />
                          </TableCell>
                        </TableRow>
                      ) : filteredLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                            {campaigns.length === 0 && globalTotal === 0 ? (
                              <div className="space-y-2">
                                <p>Nenhuma campanha configurada. Crie uma campanha primeiro.</p>
                              </div>
                            ) : (
                              "Nenhuma lead encontrada"
                            )}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLeads.map(lead => {
                          const phone = extractPhoneFromLead(lead.field_values);
                          const identity = lead.entity_id ? getIdentity(lead.entity_id) : null;
                          const name = identity?.first_name && identity?.last_name
                            ? `${identity.first_name} ${identity.last_name}`
                            : identity?.display_name || extractSmartField(lead.field_values, ['name', 'nome', 'full_name', 'nome_completo', 'first_name']);
                          const email = extractSmartField(lead.field_values, ['email', 'e_mail', 'e-mail']);
                          const isSelected = selectedLeadIds.includes(lead.id);

                          return (
                            <LeadTableRow
                              key={lead.id}
                              lead={lead}
                              isSelected={isSelected}
                              name={name}
                              phone={phone}
                              email={email}
                              campaignFilter={campaignFilter}
                              displayColumns={displayColumns}
                              getStatusColor={getStatusColor}
                              getStatusLabel={getStatusLabel}
                              getEffectiveStatus={getEffectiveStatus}
                              getContactResultInfo={getContactResultInfo}
                              resolveFieldValue={resolveFieldValue}
                              onSelect={toggleLeadSelection}
                              onViewDetails={handleRowViewDetails}
                              onContact={handleRowContact}
                              onEdit={handleRowEdit}
                              onCreateDeal={handleCreateDealFromLead}
                              onConvertToContact={handleRowConvertToContact}
                              onConvertToClient={handleRowConvertToClient}
                              onDuplicate={handleRowDuplicate}
                              onDelete={handleDeleteLead}
                              onEmail={handleRowEmail}
                              onWhatsApp={handleRowWhatsApp}
                              onReassignVisit={handleRowReassignVisit}
                              t={t}
                            />
                          );
                        })
                      )}
                    </TableBody>
                  </Table>

                  {/* Infinite Scroll Trigger + Loading indicator */}
                  <div 
                    ref={loadMoreRef} 
                    className="py-4 flex items-center justify-center"
                  >
                    {loadingMore && !loading && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <OlyviaLoader size={20} inline />
                        <span className="text-sm">A carregar mais...</span>
                      </div>
                    )}
                    {!loadingMore && effectiveHasMore && filteredLeads.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        A mostrar {Math.min(filteredLeads.length, paginationTotal)} de {paginationTotal} leads
                      </span>
                    )}
                    {!effectiveHasMore && filteredLeads.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Todos os {paginationTotal} leads carregados
                      </span>
                    )}
                  </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Lead Details Dialog — Enhanced */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0">
            <div className="overflow-y-auto max-h-[92vh] px-6 py-5 space-y-4">
            {selectedLead && (() => {
              const fieldValues = selectedLead.field_values || {};
              const LEAD_FIELD_ALIASES: Record<string, string[]> = {
                name: ['name', 'nome', 'full_name', 'nome_completo', 'first_name', 'primeiro_nome', 'client_name', 'nome_cliente', 'contacto', 'contact_name', 'firstname', 'lastname', 'last_name'],
                email: ['email', 'e-mail', 'email_address', 'mail', 'e_mail', 'po_email'],
                phone: ['phone', 'telefone', 'tel', 'telemovel', 'mobile', 'celular', 'po_telefone'],
                address: ['address', 'morada', 'endereco', 'rua', 'endereço', 'street', 'po_morada'],
                city: ['city', 'cidade', 'localidade', 'concelho', 'po_localidade'],
                postal_code: ['postal_code', 'codigo_postal', 'cp', 'cep', 'postalcode', 'zip', 'po_codigo_postal'],
              };
              const normalizeStr = (str: string): string => str.toLowerCase().replace(/[-_\s]/g, '');
              const isEmptyPlaceholder = (v: string) => /^[-–—.,\s]*$/.test(v);
              const findLeadFieldValue = (aliases: string[]): string | null => {
                const normalizedAliases = aliases.map(normalizeStr);
                for (const key of Object.keys(fieldValues)) {
                  if (key === '_meta') continue;
                  const normalizedKey = normalizeStr(key);
                  if (normalizedAliases.some(alias => normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey))) {
                    const value = fieldValues[key];
                    if (value && typeof value === 'string' && value.trim() && !isEmptyPlaceholder(value.trim())) return value.trim();
                  }
                }
                return null;
              };

              const identity = selectedLead.entity_id ? getIdentity(selectedLead.entity_id) : null;
              const leadName = identity?.first_name && identity?.last_name
                ? `${identity.first_name} ${identity.last_name}`
                : identity?.display_name || findLeadFieldValue(LEAD_FIELD_ALIASES.name) || "Lead";
              const leadEmail = identity?.email || findLeadFieldValue(LEAD_FIELD_ALIASES.email);
              const leadPhone = identity?.phone || findLeadFieldValue(LEAD_FIELD_ALIASES.phone);
              const leadAddress = identity?.address || findLeadFieldValue(LEAD_FIELD_ALIASES.address);
              const leadCity = identity?.city || findLeadFieldValue(LEAD_FIELD_ALIASES.city);
              const leadPostalCode = identity?.postal_code || findLeadFieldValue(LEAD_FIELD_ALIASES.postal_code);
              const fullAddress = [leadAddress, leadPostalCode, leadCity].filter(Boolean).join(', ') || null;

              const assignedUser = companyUsers.find(u => u.id === selectedLead.assigned_to);
              const assignedUserName = assignedUser?.name || null;

              // Health score for this lead
              const selectedEntityId = selectedLead.entity_id || "";
              const selectedResultObj = contactResults.find(r => r.id === selectedLead.last_contact_result);
              const healthScore = calculateLeadHealthScore({
                lastContactResultName: selectedResultObj?.name || null,
                lastContactAt: selectedLead.last_contact_at || null,
                createdAt: selectedLead.created_at,
                status: selectedLead.status,
                contactAttempts: selectedLead.contact_attempts || 0,
              });

              // Next action from entity_interactions
              const nextAction: { description: string; date: string } | null = null; // populated from interactions if available

              const getStatusLabel = (s: string) => {
                const stage = workflowStages.find(ws => ws.name === s);
                return stage?.label || s;
              };
              const getStatusColorLocal = (s: string) => {
                if (s === 'new') return 'border-blue-500 text-blue-600';
                if (s === 'contacted') return 'border-green-500 text-green-600';
                if (s === 'qualified') return 'border-purple-500 text-purple-600';
                if (s === 'converted') return 'border-emerald-500 text-emerald-600';
                if (s === 'lost' || s === 'rejected') return 'border-red-500 text-red-600';
                return 'border-primary text-primary';
              };

              return (
                <>
                  {/* HEADER */}
                  <LeadDetailHeader
                    leadName={leadName}
                    status={selectedLead.status}
                    source={selectedLead.source}
                    tags={selectedLead.tags}
                    healthScore={healthScore}
                    campaignName={selectedLead.campaigns?.name || null}
                    getStatusLabel={getStatusLabel}
                    getStatusColor={getStatusColorLocal}
                    onClose={() => setShowDetails(false)}
                  />

                  {/* PIPELINE BAR */}
                  <LeadPipelineBar
                    currentStatus={selectedLead.status}
                    workflowStages={workflowStages}
                  />

                  {/* SUMMARY BAR */}
                  <LeadSummaryBar
                    source={selectedLead.source}
                    lastInteractionAt={selectedLead.last_contact_at || null}
                    interactionCount={leadInteractionCounts[selectedEntityId] || 0}
                    createdAt={selectedLead.created_at}
                    nextAction={nextAction}
                  />

                  {/* SMART SUGGESTION */}
                  <LeadSmartSuggestion
                    lastInteractionAt={selectedLead.last_contact_at || null}
                    hasActiveDeal={leadDealEntityIds.has(selectedEntityId)}
                    hasNextAction={false}
                    status={selectedLead.status}
                    leadName={leadName}
                    onCall={() => {
                      setShowDetails(false);
                      openContactDialogForLead(selectedLead);
                    }}
                    onCreateDeal={async () => {
                      if (!selectedLead || !activeCompanyId) return;
                      const result = await createDealFromLead({
                        lead_id: selectedLead.id,
                        title: `Pedido - ${leadName}`,
                        organization_id: selectedLead.organization_id,
                        root_organization_id: selectedLead.root_organization_id || selectedLead.organization_id,
                        entity_id: selectedLead.entity_id || undefined,
                      });
                      if (result?.created_id) {
                        setShowDetails(false);
                        navigate(`/deals?open=${result.created_id}`);
                      }
                    }}
                  />

                  {/* TABS */}
                  <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
                    <div className="overflow-x-auto">
                      <TabsList className="inline-flex w-auto min-w-full">
                        <TabsTrigger value="info">Info</TabsTrigger>
                        <TabsTrigger value="edit">Editar</TabsTrigger>
                        <TabsTrigger value="deals">Negócios</TabsTrigger>
                        <TabsTrigger value="proposals">Propostas</TabsTrigger>
                        <TabsTrigger value="emails">Emails</TabsTrigger>
                        <TabsTrigger value="notes">📝 Notas</TabsTrigger>
                        <TabsTrigger value="timeline">📜 Timeline</TabsTrigger>
                        <TabsTrigger value="scoring">📈 Scoring</TabsTrigger>
                        <TabsTrigger value="journey">🗺 Percurso</TabsTrigger>
                      </TabsList>
                    </div>

                    {/* TAB: INFO */}
                    <TabsContent value="info" className="mt-4">
                      <LeadInfoTab
                        lead={selectedLead}
                        fieldDefs={fieldDefs.filter(f => !isMappedToBaseLeadField(f))}
                        fieldValues={fieldValues}
                        leadName={leadName}
                        leadEmail={leadEmail}
                        leadPhone={leadPhone}
                        leadAddress={fullAddress}
                        status={selectedLead.status}
                        source={selectedLead.source}
                        assignedUserName={assignedUserName}
                        resolveFieldValue={resolveFieldValue}
                        deals={[]}
                        nextAction={nextAction}
                        contactAssociation={selectedLead.contacts}
                        clientAssociation={selectedLead.clients}
                        getIdentity={getIdentity}
                        onCreateDeal={async () => {
                          if (!selectedLead || !activeCompanyId) return;
                          const result = await createDealFromLead({
                            lead_id: selectedLead.id,
                            title: `Pedido - ${leadName}`,
                            organization_id: selectedLead.organization_id,
                            root_organization_id: selectedLead.root_organization_id || selectedLead.organization_id,
                            entity_id: selectedLead.entity_id || undefined,
                          });
                          if (result?.created_id) {
                            setShowDetails(false);
                            navigate(`/deals?open=${result.created_id}`);
                          }
                        }}
                        onScheduleAction={() => {
                          setShowDetails(false);
                          openContactDialogForLead(selectedLead);
                        }}
                        contactOptions={contactOptions}
                        clientOptions={clientOptions}
                        searchingContacts={searchingContacts}
                        searchingClients={searchingClients}
                        onSearchContacts={searchContacts}
                        onSearchClients={searchClients}
                        onAssociateContact={handleAssociateContact}
                        onAssociateClient={handleAssociateClient}
                        leadId={selectedLead.id}
                      />
                    </TabsContent>

                    {/* TAB: EDIT */}
                    <TabsContent value="edit" className="mt-4">
                      <div className="text-center py-4">
                        <Button 
                          variant="outline"
                          onClick={() => {
                            setShowDetails(false);
                            setShowEditDialog(true);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Abrir formulário de edição
                        </Button>
                      </div>
                    </TabsContent>

                    {/* TAB: DEALS */}
                    <TabsContent value="deals" className="mt-4">
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center py-4">Pedidos de proposta associados a esta lead</p>
                        <button 
                          onClick={async () => {
                            if (!selectedLead || !activeCompanyId) return;
                            const result = await createDealFromLead({
                              lead_id: selectedLead.id,
                              title: `Pedido - ${leadName}`,
                              organization_id: selectedLead.organization_id,
                              root_organization_id: selectedLead.root_organization_id || selectedLead.organization_id,
                              entity_id: selectedLead.entity_id || undefined,
                            });
                            if (result?.created_id) {
                              setShowDetails(false);
                              navigate(`/deals?open=${result.created_id}`);
                            }
                          }}
                          className="w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-2"
                        >
                          + Novo Pedido de Proposta
                        </button>
                      </div>
                    </TabsContent>

                    {/* TAB: PROPOSALS */}
                    <TabsContent value="proposals" className="mt-4">
                      <p className="text-sm text-muted-foreground text-center py-8">Propostas associadas a esta lead</p>
                    </TabsContent>

                    {/* TAB: EMAILS */}
                    <TabsContent value="emails" className="mt-4">
                      <p className="text-sm text-muted-foreground text-center py-8">Emails enviados a esta lead</p>
                    </TabsContent>

                    {/* TAB: TIMELINE */}
                    <TabsContent value="timeline" className="mt-4">
                      <LeadTimelineTab
                        entityId={selectedLead.entity_id || null}
                        organizationId={selectedLead.organization_id}
                        onRegisterCall={() => {
                          setShowDetails(false);
                          openContactDialogForLead(selectedLead);
                        }}
                        userMap={Object.fromEntries(companyUsers.map(u => [u.id, u.name]))}
                      />
                    </TabsContent>

                    {/* TAB: SCORING */}
                    <TabsContent value="scoring" className="mt-4">
                      <div className="space-y-6">
                        <div className="text-center space-y-1">
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">📈 Health Score</h3>
                          <p className="text-4xl font-bold">{healthScore.score}<span className="text-lg text-muted-foreground">/100</span></p>
                          <p className={`text-sm font-medium ${healthScore.color}`}>{healthScore.label}</p>
                        </div>
                        <div className="space-y-3">
                          {[
                            { label: "📞 Resultado do contacto", value: healthScore.breakdown.contactResult, max: 35 },
                            { label: "📅 Dias sem contacto", value: healthScore.breakdown.daysSinceContact, max: 25 },
                            { label: "🔄 Fase no funil", value: healthScore.breakdown.funnelStage, max: 20 },
                            { label: "🎯 Tentativas vs resultado", value: healthScore.breakdown.attemptsVsResult, max: 20 },
                          ].map((item) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{item.label}</span>
                                <span className="font-semibold">{item.value}/{item.max}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${item.value >= item.max * 0.7 ? 'bg-green-500' : item.value >= item.max * 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${(item.value / item.max) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    {/* TAB: JOURNEY */}
                    <TabsContent value="journey" className="mt-4">
                      <LeadJourneyTab
                        lead={selectedLead}
                        hasContact={!!selectedLead.contacts}
                        hasClient={!!selectedLead.clients}
                        contactCreatedAt={null}
                        clientCreatedAt={null}
                        interactionCount={leadInteractionCounts[selectedEntityId] || 0}
                        dealCount={0}
                        dealValue={0}
                      />
                    </TabsContent>

                    {/* TAB: NOTES */}
                    <TabsContent value="notes" className="mt-4">
                      {selectedLead.entity_id ? (
                        <ClientNotesTab entityId={selectedLead.entity_id} organizationId={selectedLead.organization_id || ""} />
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">Esta lead não tem entidade associada para registar notas.</p>
                      )}
                    </TabsContent>
                  </Tabs>

                  {/* ACTION BUTTONS */}
                  <div className="border-t pt-4 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PermissionGate permission="leads.edit">
                        <Button size="sm" variant="outline" onClick={() => { setShowDetails(false); setShowEditDialog(true); }}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                        </Button>
                      </PermissionGate>
                      <Button size="sm" variant="outline" onClick={() => { setShowDetails(false); openContactDialogForLead(selectedLead); }}>
                        <Phone className="w-3.5 h-3.5 mr-1" /> Chamada
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setEmailTarget({ id: selectedLead.entity_id || selectedLead.id, name: leadName, email: leadEmail || "", leadId: selectedLead.id, entityId: selectedLead.entity_id || undefined });
                        setShowEmailDialog(true);
                      }}>
                        <Mail className="w-3.5 h-3.5 mr-1" /> Email
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setWhatsAppContext({
                          module: "leads",
                          recipientName: leadName,
                          recipientPhone: leadPhone || undefined,
                          leadId: selectedLead.id,
                          entityId: selectedLead.entity_id || undefined,
                          organizationId: selectedLead.organization_id || undefined,
                        });
                        setShowWhatsAppDialog(true);
                      }}>
                        <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDetailTab("notes")}>
                        <StickyNote className="w-3.5 h-3.5 mr-1" /> Nota
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        // TODO: Schedule visit
                      }}>
                        <CalendarIcon className="w-3.5 h-3.5 mr-1" /> Agendar Visita
                      </Button>
                      <PermissionGate permission="deals.create">
                        <Button size="sm" variant="outline" onClick={async () => {
                          if (!selectedLead || !activeCompanyId) return;
                          const result = await createDealFromLead({
                            lead_id: selectedLead.id,
                            title: `Pedido - ${leadName}`,
                            organization_id: selectedLead.organization_id,
                            root_organization_id: selectedLead.root_organization_id || selectedLead.organization_id,
                            entity_id: selectedLead.entity_id || undefined,
                          });
                          if (result?.created_id) {
                            setShowDetails(false);
                            navigate(`/deals?open=${result.created_id}`);
                          }
                        }}>
                          <Target className="w-3.5 h-3.5 mr-1" /> Criar Pedido
                        </Button>
                      </PermissionGate>
                    </div>
                    {selectedLead.status !== "converted" && (
                      <div className="flex items-center gap-2">
                        <PermissionGate permission="leads.convert">
                          <Button size="sm" variant="outline" onClick={() => openConversionDialog(selectedLead, 'client')}>
                            <Building2 className="w-3.5 h-3.5 mr-1" /> Converter para Cliente
                          </Button>
                          <Button size="sm" onClick={() => openConversionDialog(selectedLead, 'contact')} className="bg-primary">
                            <UserPlus className="w-3.5 h-3.5 mr-1" /> Converter para Contacto
                          </Button>
                        </PermissionGate>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* Conversion Dialog - Simplified confirmation */}
        <Dialog open={showConversionDialog} onOpenChange={(open) => {
          if (!open) {
            setShowConversionDialog(false);
            setConversionLead(null);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {conversionType === 'contact' ? 'Converter para Contacto' : 'Converter para Cliente'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Os seguintes dados serão utilizados na conversão:
              </p>

              {conversionLead && (() => {
                // Extract the data that will be converted using auto-mapping
                const fieldValues = conversionLead.field_values || {};
                const CONV_ALIASES: Record<string, string[]> = {
                  name: ['name', 'nome', 'full_name', 'nome_completo', 'first_name', 'primeiro_nome', 'client_name', 'nome_cliente', 'contacto', 'contact_name', 'first_name', 'last_name', 'primeironome', 'ultimonome', 'firstname', 'lastname'],
                  email: ['email', 'e-mail', 'email_address', 'endereco_email', 'correio_eletronico', 'mail', 'e_mail', 'correio'],
                  phone: ['phone', 'telefone', 'phone_number', 'numero_telefone', 'tel', 'telemovel', 'mobile', 'celular', 'contacto_telefonico', 'telemóvel', 'cellphone', 'cel', 'contacto'],
                  vat: ['vat', 'nif', 'contribuinte', 'fiscal', 'tax_id', 'taxid', 'numero_contribuinte'],
                  address: ['address', 'morada', 'endereco', 'rua', 'endereço', 'street'],
                  city: ['city', 'cidade', 'localidade', 'concelho'],
                  postal_code: ['postal_code', 'codigo_postal', 'cp', 'cep', 'postalcode', 'zip', 'zipcode'],
                  district: ['district', 'distrito', 'regiao', 'região', 'provincia'],
                  position: ['position', 'cargo', 'funcao', 'job_title', 'profissao'],
                };
                
                const normalize = (str: string): string => str.toLowerCase().replace(/[-_\s]/g, '');
                
                const findFieldValue = (aliases: string[]): string | null => {
                  const normalizedAliases = aliases.map(normalize);
                  for (const key of Object.keys(fieldValues)) {
                    if (key === '_meta') continue;
                    const normalizedKey = normalize(key);
                    if (normalizedAliases.some(alias => normalizedKey === alias || normalizedKey.includes(alias) || alias.includes(normalizedKey))) {
                      const value = fieldValues[key];
                      if (value && typeof value === 'object' && !Array.isArray(value)) {
                        // Format address objects
                        const addr = value as Record<string, any>;
                        const parts = [
                          [addr.street || addr.rua, addr.number || addr.numero].filter(Boolean).join(' '),
                          addr.floor || addr.andar || null,
                          [addr.postal_code || addr.codigo_postal, addr.city || addr.cidade].filter(Boolean).join(' '),
                        ].filter(Boolean);
                        return parts.join(', ') || null;
                      }
                      if (value && typeof value === 'string' && value.trim()) {
                        return value.trim();
                      }
                    }
                  }
                  return null;
                };
                
                const extractedName = findFieldValue(CONV_ALIASES.name);
                const extractedEmail = findFieldValue(CONV_ALIASES.email);
                const extractedPhone = findFieldValue(CONV_ALIASES.phone);
                const extractedVat = findFieldValue(CONV_ALIASES.vat);
                const extractedAddress = findFieldValue(CONV_ALIASES.address);
                const extractedCity = findFieldValue(CONV_ALIASES.city);
                const extractedPostalCode = findFieldValue(CONV_ALIASES.postal_code);
                const extractedDistrict = findFieldValue(CONV_ALIASES.district);
                const extractedPosition = findFieldValue(CONV_ALIASES.position);
                
                const hasAddressInfo = extractedAddress || extractedCity || extractedPostalCode;
                const fullAddress = [extractedAddress, extractedPostalCode, extractedCity].filter(Boolean).join(', ');

                const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) => (
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium">{value || <span className="text-muted-foreground italic">Não encontrado</span>}</p>
                    </div>
                  </div>
                );
                
                return (
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <InfoRow icon={User} label="Nome" value={extractedName} />
                    <InfoRow icon={Mail} label="Email" value={extractedEmail} />
                    <InfoRow icon={Phone} label="Telefone" value={extractedPhone} />
                    {extractedVat && <InfoRow icon={Hash} label="NIF" value={extractedVat} />}
                    {extractedPosition && <InfoRow icon={Briefcase} label="Cargo" value={extractedPosition} />}
                    {hasAddressInfo && <InfoRow icon={MapPin} label="Morada" value={fullAddress} />}
                    {extractedDistrict && <InfoRow icon={MapPin} label="Distrito" value={extractedDistrict} />}
                    
                    {conversionLead.campaign_id && (
                      <div className="pt-2 mt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Campanha associada: será usado o mapeamento configurado
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConversionDialog(false)} disabled={isConverting}>
                Cancelar
              </Button>
              <Button onClick={executeConversion} disabled={isConverting}>
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    A converter...
                  </>
                ) : (
                  <>
                    {conversionType === 'contact' ? <UserPlus className="w-4 h-4 mr-2" /> : <Building2 className="w-4 h-4 mr-2" />}
                    Confirmar
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fields Configuration Dialog */}
        <Dialog open={showFieldsConfig} onOpenChange={setShowFieldsConfig}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configure Lead Fields</DialogTitle>
            </DialogHeader>
            
            {/* Campaign Selector */}
            <div className="mb-4">
              <Label className="mb-2 block">Select Campaign</Label>
              <Select value={configCampaignId} onValueChange={setConfigCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-2">
                Each campaign has its own set of lead fields. Select a campaign to configure its form fields.
              </p>
            </div>

            {!configCampaignId ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                {campaigns.length === 0 ? (
                  <p>No campaigns found. Create a campaign first in the Campaigns section.</p>
                ) : (
                  <p>Select a campaign above to configure its lead fields.</p>
                )}
              </div>
            ) : (
              <>

            {/* Add New Field Form */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add New Field
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Field Key</Label>
                    <Input
                      placeholder="e.g. first_name"
                      value={newField.field_key}
                      onChange={e => setNewField({ ...newField, field_key: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Display Label</Label>
                    <Input
                      placeholder="e.g. First Name"
                      value={newField.field_label}
                      onChange={e => setNewField({ ...newField, field_label: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Field Type</Label>
                    <Select value={newField.field_type} onValueChange={v => setNewField({ ...newField, field_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="datetime">Date & Time</SelectItem>
                        <SelectItem value="boolean">Yes/No</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="textarea">Long Text</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                        <SelectItem value="_separator1" disabled className="text-muted-foreground font-semibold">— References —</SelectItem>
                        <SelectItem value="ref_company">Company</SelectItem>
                        <SelectItem value="ref_contact">Contact</SelectItem>
                        <SelectItem value="ref_client">Client</SelectItem>
                        <SelectItem value="ref_employee">Employee</SelectItem>
                        <SelectItem value="_separator2" disabled className="text-muted-foreground font-semibold">— Lists —</SelectItem>
                        <SelectItem value="list_products">Product List</SelectItem>
                        <SelectItem value="list_services">Service List</SelectItem>
                        <SelectItem value="ref_product">Single Product</SelectItem>
                        <SelectItem value="ref_service">Single Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Mapear para Contacto</Label>
                    <Select value={newField.contact_field_mapping} onValueChange={v => setNewField({ ...newField, contact_field_mapping: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem mapeamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_FIELDS.map(f => (
                          <SelectItem key={f.value || "_none"} value={f.value || "_none"}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mapear para Cliente</Label>
                    <Select value={newField.client_field_mapping} onValueChange={v => setNewField({ ...newField, client_field_mapping: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem mapeamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_FIELDS.map(f => (
                          <SelectItem key={f.value || "_none"} value={f.value || "_none"}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-4 pt-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newField.is_required}
                        onCheckedChange={v => setNewField({ ...newField, is_required: v })}
                      />
                      <Label>Obrigatório</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newField.is_unique}
                        onCheckedChange={v => setNewField({ ...newField, is_unique: v })}
                      />
                      <Label>Único</Label>
                    </div>
                  </div>
                </div>
                <Button onClick={handleAddField} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Campo
                </Button>
              </CardContent>
            </Card>

            {/* Existing Fields */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Configured Fields ({fieldDefs.length})
              </h4>
              {fieldDefs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  No fields configured yet. Add your first field above.
                </div>
              ) : (
                fieldDefs.map(field => (
                  <div key={field.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    {editingField?.id === field.id ? (
                      // Edit mode
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={editingField.field_label}
                            onChange={e => setEditingField({ ...editingField, field_label: e.target.value })}
                            placeholder="Label"
                          />
                          <Select value={editingField.field_type} onValueChange={v => setEditingField({ ...editingField, field_type: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="phone">Phone</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="datetime">Date & Time</SelectItem>
                              <SelectItem value="boolean">Yes/No</SelectItem>
                              <SelectItem value="select">Dropdown</SelectItem>
                              <SelectItem value="textarea">Long Text</SelectItem>
                              <SelectItem value="url">URL</SelectItem>
                              <SelectItem value="_separator1" disabled className="text-muted-foreground font-semibold">— References —</SelectItem>
                              <SelectItem value="ref_company">Company</SelectItem>
                              <SelectItem value="ref_contact">Contact</SelectItem>
                              <SelectItem value="ref_client">Client</SelectItem>
                              <SelectItem value="ref_employee">Employee</SelectItem>
                              <SelectItem value="_separator2" disabled className="text-muted-foreground font-semibold">— Lists —</SelectItem>
                              <SelectItem value="list_products">Product List</SelectItem>
                              <SelectItem value="list_services">Service List</SelectItem>
                              <SelectItem value="ref_product">Single Product</SelectItem>
                              <SelectItem value="ref_service">Single Service</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Select 
                            value={editingField.contact_field_mapping || "_none"} 
                            onValueChange={v => setEditingField({ ...editingField, contact_field_mapping: v === "_none" ? null : v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Mapear para Contacto" />
                            </SelectTrigger>
                            <SelectContent>
                              {CONTACT_FIELDS.map(f => (
                                <SelectItem key={f.value || "_none"} value={f.value || "_none"}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select 
                            value={editingField.client_field_mapping || "_none"} 
                            onValueChange={v => setEditingField({ ...editingField, client_field_mapping: v === "_none" ? null : v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Mapear para Cliente" />
                            </SelectTrigger>
                            <SelectContent>
                              {CLIENT_FIELDS.map(f => (
                                <SelectItem key={f.value || "_none"} value={f.value || "_none"}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={editingField.is_required}
                              onCheckedChange={v => setEditingField({ ...editingField, is_required: v })}
                            />
                            <span className="text-xs">Req</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={editingField.is_unique}
                              onCheckedChange={v => setEditingField({ ...editingField, is_unique: v })}
                            />
                            <span className="text-xs">Uniq</span>
                          </div>
                        </div>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" onClick={handleUpdateField}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingField(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div className="flex items-center gap-2 flex-1">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{field.field_label}</span>
                              <span className="text-muted-foreground text-sm">({field.field_key})</span>
                            </div>
                            {field.contact_field_mapping && (
                              <div className="text-xs text-muted-foreground">
                                → Contacto: <span className="font-medium">{field.contact_field_mapping}</span>
                              </div>
                            )}
                            {field.client_field_mapping && (
                              <div className="text-xs text-muted-foreground">
                                → Cliente: <span className="font-medium">{field.client_field_mapping}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{field.field_type}</Badge>
                          {field.is_required && <Badge>Obrigatório</Badge>}
                          {field.is_unique && <Badge variant="secondary">Único</Badge>}
                          {(field.contact_field_mapping || field.client_field_mapping) && <Badge variant="default" className="bg-green-600">Mapeado</Badge>}
                          <Button variant="ghost" size="icon" onClick={() => setEditingField(field)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteField(field.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            </>
            )}

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setShowFieldsConfig(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Lead Dialog */}
        <Dialog open={showCreateLead} onOpenChange={setShowCreateLead}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('leads.createLead') || 'Criar Nova Lead'}</DialogTitle>
            </DialogHeader>
            
            {/* ── Campaign (optional) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  {t('leads.optionalCampaign') || 'Campanha (opcional)'}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => navigate('/forms')}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('leads.createNewForm') || 'Criar Formulário'}
                  <ExternalLink className="h-3 w-3 ml-0.5" />
                </Button>
              </div>
              <Select value={createLeadCampaignId || ""} onValueChange={(v) => {
                setCreateLeadCampaignId(v);
                setCreateLeadFormId("");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('leads.selectCampaignPlaceholder') || 'Selecionar campanha...'} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        {c.name}
                        {c.form_id && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            <FileText className="h-2.5 w-2.5 mr-0.5" />
                            Form
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!createLeadCampaignId && (
                <p className="text-xs text-muted-foreground">
                  {t('leads.noCampaignNeeded') || 'Pode criar a lead sem campanha. Selecione uma campanha para adicionar campos extra.'}
                </p>
              )}
            </div>

            {/* Form indicator */}
            {createLeadCampaignId && createLeadFormId && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">{t('leads.usingForm') || 'Formulário'}:</span>
                  <span className="ml-2 text-sm font-medium">
                    {availableForms.find(f => f.id === createLeadFormId)?.name || 'Formulário associado'}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {extraCampaignFieldDefs.length} {t('leads.additionalCampaignFields') || 'campos extra'}
                </Badge>
              </div>
            )}

            {/* ── Source (optional) ── */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                {t('leads.source') || 'Fonte da Lead'}
              </Label>
              <Select value={createLeadSourceId} onValueChange={setCreateLeadSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('leads.selectSource') || 'Selecionar fonte...'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('leads.noSource') || 'Sem fonte específica'}</SelectItem>
                  {leadSources.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color || '#6B7280' }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4 mt-2 space-y-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                {t('leads.baseForm') || 'Dados Base'}
              </h3>
              <p className="text-xs text-muted-foreground">{t('leads.baseFormDesc') || 'Informação essencial da lead'}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {createLeadFieldDefs
                .filter(baseField => {
                  // Hide base fields that are already covered by a mapped form/campaign field
                  if (extraCampaignFieldDefs.length === 0) return true;
                  const baseKey = baseField.field_key.toLowerCase();
                  return !extraCampaignFieldDefs.some(ef => {
                    const cm = (ef.contact_field_mapping || '').toLowerCase();
                    const clm = (ef.client_field_mapping || '').toLowerCase();
                    const efKey = (ef.field_key || '').toLowerCase();
                    return cm === baseKey || clm === baseKey || efKey === baseKey;
                  });
                })
                .map(field => (
                <div key={field.id} className={field.field_type === 'textarea' || field.field_type === 'composite_address' ? 'md:col-span-2' : ''}>
                  <DynamicFormField
                    field={field}
                    value={newLeadValues[field.field_key]}
                    onChange={(value) => setNewLeadValues({ ...newLeadValues, [field.field_key]: value })}
                    campaignId={createLeadCampaignId || undefined}
                  />
                </div>
              ))}
            </div>

            {/* ── Extra campaign fields ── */}
            {extraCampaignFieldDefs.length > 0 && (
              <div className="border-t pt-4 mt-2 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {t('leads.additionalCampaignFields') || 'Campos adicionais da campanha'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {extraCampaignFieldDefs.map(field => (
                    <div key={field.id} className={field.field_type === 'textarea' || field.field_type === 'composite_address' ? 'md:col-span-2' : ''}>
                      <DynamicFormField
                        field={field}
                        value={newLeadValues[field.field_key]}
                        onChange={(value) => setNewLeadValues({ ...newLeadValues, [field.field_key]: value })}
                        campaignId={createLeadCampaignId || undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Assignment ── */}
            <div className="border-t pt-4 mt-2 space-y-3">
              <Label className="mb-2 block">{t('leads.assignedToSales') || 'Atribuído a (Comercial)'}</Label>
              
              {/* Org tree filter */}
              {assignOrgTree.length > 1 && (
                <Select value={assignOrgFilter} onValueChange={(v) => {
                  setAssignOrgFilter(v);
                  setNewLeadValues((prev: any) => ({ ...prev, _assigned_to: "" }));
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('leads.filterByOrg') || 'Filtrar por organização...'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('leads.allOrganizations') || 'Todas as organizações'}</SelectItem>
                    {assignOrgTree.map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        <span style={{ paddingLeft: `${node.depth * 16}px` }} className="flex items-center gap-1">
                          {node.depth > 0 && <span className="text-muted-foreground">└</span>}
                          {node.name}
                          <span className="text-muted-foreground text-xs ml-1">({node.type})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(() => {
                const leadDistrict = newLeadValues.distrito || newLeadValues.district || '';
                const leadDistrictLower = typeof leadDistrict === 'string' ? leadDistrict.toLowerCase() : '';
                const orgFilteredUsers = assignOrgFilter === "all" 
                  ? comercialUsers 
                  : comercialUsers.filter(u => u.org_ids.includes(assignOrgFilter));
                const filteredUsers = leadDistrictLower
                  ? orgFilteredUsers.filter(u => 
                      u.districts.length > 0 &&
                      u.districts.some(d => d.toLowerCase().includes(leadDistrictLower) || leadDistrictLower.includes(d.toLowerCase()))
                    )
                  : orgFilteredUsers;
                const usersToShow = leadDistrictLower ? filteredUsers : orgFilteredUsers;
                const showingAll = filteredUsers.length === 0 && leadDistrictLower && orgFilteredUsers.length > 0;
                
                return (
                  <>
                    <Select value={newLeadValues._assigned_to || ""} onValueChange={(v) => setNewLeadValues({ ...newLeadValues, _assigned_to: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('leads.selectComercial') || 'Selecionar comercial...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {usersToShow.map(u => {
                          const displayDistricts = leadDistrictLower && u.districts.length > 0
                            ? u.districts.filter(d => d.toLowerCase().includes(leadDistrictLower) || leadDistrictLower.includes(d.toLowerCase()))
                            : u.districts;
                          return (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                              {displayDistricts.length > 0 && (
                                <span className="text-muted-foreground ml-1">({displayDistricts.join(', ')})</span>
                              )}
                            </SelectItem>
                          );
                        })}
                        {orgFilteredUsers.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            {t('leads.noComercialFound') || 'Nenhum comercial encontrado'}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    {leadDistrictLower && filteredUsers.length > 0 && filteredUsers.length < orgFilteredUsers.length && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('leads.showingComercialFrom') || 'Mostrando comerciais de'} {leadDistrict}
                      </p>
                    )}
                    {showingAll && (
                      <p className="text-xs text-destructive/70 mt-1">
                        {t('leads.noComercialInZone') || 'Nenhum comercial na zona de'} {leadDistrict} — {t('leads.showingAll') || 'a mostrar todos'}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => {
                setShowCreateLead(false);
                setNewLeadValues({});
                setCreateLeadCampaignId("");
                setCreateLeadFormId("");
              }}>
                {t('common.cancel') || 'Cancelar'}
              </Button>
              <Button 
                onClick={handleCreateLead} 
                disabled={creatingLead}
              >
                {creatingLead ? (t('common.creating') || 'A criar...') : (t('leads.createLead') || 'Criar Lead')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <LeadWorkflowConfig
          open={showWorkflowConfig}
          onOpenChange={setShowWorkflowConfig}
          companyId={activeCompanyId || null}
          onStagesUpdated={loadWorkflowStages}
        />

        {/* Contact Dialog */}
        <AnewLeadContactDialog
          open={showContactDialog}
          onOpenChange={handleContactDialogOpenChange}
          lead={selectedLead as any}
          companyId={activeCompanyId || null}
          onLeadUpdated={() => { if (selectedLead) refreshSingleLead(selectedLead.id); }}
        />

        {/* AI Scheduling Rules Config */}
        <LeadAISchedulingRulesConfig
          open={showAISchedulingConfig}
          onOpenChange={setShowAISchedulingConfig}
          companyId={activeCompanyId || null}
        />

        {/* Leads AI Config */}
        <LeadsAIConfig
          open={showAIConfig}
          onOpenChange={setShowAIConfig}
          companyId={activeCompanyId}
        />

        {/* Lead Edit Dialog */}
        <AnewLeadEditDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          lead={selectedLead as any}
          companyId={activeCompanyId || ""}
          companyUsers={companyUsers}
          onLeadUpdated={() => { if (selectedLead) refreshSingleLead(selectedLead.id); }}
        />

        {/* Visit Reassign Dialog */}
        <VisitReassignDialog
          open={showVisitReassignDialog}
          onOpenChange={setShowVisitReassignDialog}
          lead={selectedLead as any}
          companyId={activeCompanyId || ""}
          onUpdated={loadLeads}
        />

        {/* Send Email Dialog */}
        <SendEntityEmailDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          module="leads"
          entityId={emailTarget.id}
          entityName={emailTarget.name}
          entityEmail={emailTarget.email}
          organizationId={activeCompanyId || undefined}
          leadId={emailTarget.leadId}
        />

        {/* WhatsApp Dialog */}
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onOpenChange={setShowWhatsAppDialog}
          context={whatsAppContext}
        />

        {/* Duplicate Detection Dialog */}
        <DuplicateEntityDialog
          open={duplicateDialogOpen}
          onOpenChange={(open) => { setDuplicateDialogOpen(open); if (!open) { setPendingLeadData(null); setDuplicateMatches([]); } }}
          matches={duplicateMatches}
          entityType="lead"
          onOpenExisting={handleDuplicateOpenExisting}
          onUpdateExisting={handleDuplicateUpdateExisting}
          onCreateAnyway={handleDuplicateCreateAnyway}
          onShareWithOrg={handleDuplicateShareWithOrg}
          loading={creatingLead}
          strictBlocking={true}
        />
      </div>
      )}
    </>
  );
}
