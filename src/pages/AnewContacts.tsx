import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useEntityIdentity, createEntityWithIdentity, resolveEntityByIdentity } from "@/hooks/useEntityIdentity";
import { composeDisplayName, normalizeFirstLast } from "@/utils/composeDisplayName";
import { useConversionRevert } from "@/hooks/useConversionRevert";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, User, Mail, Phone, PhoneCall, ClipboardList, Loader2, Search, Download, Upload, Building2, Trash2, CalendarPlus, UserPlus, AlertTriangle, Clock, MoreHorizontal, Eye, Tag, MessageCircle, Handshake, Heart, BarChart3, List, Network, Target, Filter, X, Zap, Users, DollarSign, FileText, ScrollText, Undo2 } from "lucide-react";
import { DuplicateEntityDialog } from "@/components/shared/DuplicateEntityDialog";
import { fetchGroupDuplicateMatches, fetchSameOrgMatchFields } from "@/lib/groupDuplicateMatches";
import { fetchSameOrgFieldsByEntity, revalidateStrongDuplicatesBeforeWrite } from "@/lib/duplicateBlockingRule";
import { ensureEntityOrgLink, linkEntityToOrg } from "@/utils/orgEntity";
import { syncEntityPrimaryAddressFromLead } from "@/utils/addressSanitization";
import { searchEntityIds as searchEntityIdsFn } from "@/lib/clientSearch";

import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactDetailsDialog } from "@/components/ContactDetailsDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { usePostalCodeLookup } from "@/hooks/usePostalCodeLookup";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema, contactCompanySchema, addressSchema } from "@/lib/validations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { formatPhoneNumber } from "@/constants/countryCodes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { useCalendarScheduling } from "@/hooks/useCalendarScheduling";
import { useCompany } from "@/contexts/CompanyContext";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleAlerts } from "@/hooks/useModuleAlerts";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { calculateHealthScore } from "@/hooks/useContactHealthScore";
import { formatWhatsAppLink } from "@/utils/whatsapp";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { ContactTagsDialog, getTagColorClass } from "@/components/contacts/ContactTagsDialog";
import { RegisterCallDialog } from "@/components/contacts/RegisterCallDialog";
import { ContactsAlertBar } from "@/components/contacts/ContactsAlertBar";
import { ContactsInsightBanner } from "@/components/contacts/ContactsInsightBanner";
import { ContactsFullDashboard } from "@/components/contacts/ContactsFullDashboard";
import { ContactsScoringView } from "@/components/contacts/ContactsScoringView";
import { ContactsRelationsMap } from "@/components/contacts/ContactsRelationsMap";
import { Switch } from "@/components/ui/switch";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import {
  buildContactScopeOrFilter,
  contactMatchesScope,
  getContactScopeUserIds,
  normalizeContactScope,
} from "@/lib/contacts/scope";
import { findScopedContactByRef } from "@/lib/contacts/resolution";
import { parseContactsCsv, serializeContactsCsv } from "@/lib/contacts/csv";

// --- Types ---
interface ContactRecord {
  id: string;
  entity_id: string;
  organization_id: string | null;
  root_organization_id: string | null;
  status: string;
  source_type: string | null;
  source_lead_id: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  last_interaction_at: string | null;
}

interface ContactAddress {
  street: string; number: string; floor_number: string; city: string;
  postal_code: string; district: string; municipality: string; is_primary: boolean;
}

type ActiveView = "list" | "dashboard" | "scoring" | "relations";

const AnewContacts = () => {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [allContacts, setAllContacts] = useState<ContactRecord[]>([]);
  const [allContactsLoading, setAllContactsLoading] = useState(false);
  const [serverAlertCounts, setServerAlertCounts] = useState<{ total: number; active: number; inactive: number; no_contact_14d: number; no_contact_7d: number; without_deals: number; with_deals: number; unassigned: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);
  const { toast } = useToast();
  const { lookupPostalCode, loading: postalLoading } = usePostalCodeLookup();
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, authUserId: scopeAuthUserId, loading: scopeLoading, teamMemberIds } = usePermissionScope();
  const { activeCompany, userType, isLoading: companyLoading } = useCompany();
  const { createVisit, loading: schedulingLoading } = useCalendarScheduling(activeCompany?.id);
  const { resolveEntities, getIdentity } = useEntityIdentity();
  const { alerts: contactAlerts, dismissAlert: dismissContactAlert } = useModuleAlerts('contact', activeCompany?.id);
  const [alertContactNameMap, setAlertContactNameMap] = useState<Map<string, string>>(new Map());
 
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [contactToConvert, setContactToConvert] = useState<ContactRecord | null>(null);
  const [converting, setConverting] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [contactToRevert, setContactToRevert] = useState<ContactRecord | null>(null);
  const [reverting, setReverting] = useState(false);
  const { revertLeadToContact } = useConversionRevert();
  const convertClientLockRef = useRef(false);
  const [clientOrgPairKeys, setClientOrgPairKeys] = useState<Set<string>>(new Set());

  // Duplicate detection state for contacts
  const [contactDuplicateDialogOpen, setContactDuplicateDialogOpen] = useState(false);
  const [contactDuplicateMatches, setContactDuplicateMatches] = useState<import("@/components/shared/DuplicateEntityDialog").DuplicateMatch[]>([]);
  const [pendingContactData, setPendingContactData] = useState<{ entityId: string; displayName: string; email: string; phone: string; phoneCountryCode: string; vat: string; firstName: string | null; lastName: string | null; entityType: 'person' | 'organization'; roleStatus: string; organizationId: string; internalUserId: string; contactType: string } | null>(null);
  const [dealsEntityIds, setDealsEntityIds] = useState<Set<string>>(new Set());
  const [assignedUserMap, setAssignedUserMap] = useState<Map<string, string>>(new Map());
  const assignedUserMapRef = useRef<Map<string, string>>(new Map());
  // Keep ref in sync
  useEffect(() => { assignedUserMapRef.current = assignedUserMap; }, [assignedUserMap]);

  // Health score data
  const [interactionCounts, setInteractionCounts] = useState<Record<string, number>>({});
  const [lastInteractions, setLastInteractions] = useState<Record<string, string>>({});
  const [dealsData, setDealsData] = useState<Record<string, { count: number; value: number }>>({});
  const [dealCommercialMap, setDealCommercialMap] = useState<Record<string, string>>({}); // entity_id → anew_users.id
  const [proposalsData, setProposalsData] = useState<Record<string, { count: number; value: number; valueWithIva: number }>>({});

  const [quotesData, setQuotesData] = useState<Record<string, { count: number; value: number; valueWithIva: number }>>({});
  const [pipelineLinksData, setPipelineLinksData] = useState<Record<string, any>>({});
  const [tagsData, setTagsData] = useState<Record<string, { id: string; tag: string; color: string }[]>>({});
  const [lastSentiments, setLastSentiments] = useState<Record<string, string>>({});
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [tagsEntityId, setTagsEntityId] = useState("");
  const [tagsEntityName, setTagsEntityName] = useState("");
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callEntityId, setCallEntityId] = useState("");
  const [callEntityName, setCallEntityName] = useState("");
  const [callContactId, setCallContactId] = useState("");
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppContext | null>(null);

  // Advanced filters
  const [healthFilter, setHealthFilter] = useState<string[]>([]);
  const [noContact14dFilter, setNoContact14dFilter] = useState(false);
  const [dealsFilter, setDealsFilter] = useState("all");
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [commercialFilter, setCommercialFilter] = useState("all");
  const [smartFilter, setSmartFilter] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [contactForSchedule, setContactForSchedule] = useState<any>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTarget, setEmailTarget] = useState<{ id: string; name: string; email: string; pdfAttachment?: any }>({ id: "", name: "", email: "" });
  const [scheduleUsers, setScheduleUsers] = useState<{ id: string; name: string }[]>([]);
  const [suggestedSlots, setSuggestedSlots] = useState<{ start: Date; end: Date }[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState({
    title: "", description: "", visit_type: "meeting", location: "",
    start_time: "", end_time: "", assigned_to: "", notes: "",
  });

  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string; depth: number }[]>([]);
  const [orgNameMap, setOrgNameMap] = useState<Map<string, string>>(new Map());
  const [isParentOrg, setIsParentOrg] = useState<boolean | null>(null);
  const [resolvedRootOrgId, setResolvedRootOrgId] = useState<string | null>(null);
  const [scopeOrgIds, setScopeOrgIds] = useState<string[]>([]);

  const PAGE_SIZE = 25;
  const [contactType, setContactType] = useState<"person" | "company">("person");

  const [formData, setFormData] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    phone_country_code: "+351", vat: "", position: "", status: "active",
  });
  const [companyFormData, setCompanyFormData] = useState({
    name: "", email: "", phone: "", phone_country_code: "+351",
    vat: "", website: "", industry: "", status: "active",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addressData, setAddressData] = useState<ContactAddress>({
    street: "", number: "", floor_number: "", city: "",
    postal_code: "", district: "", municipality: "", is_primary: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const truncatedWarnedRef = useRef<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ContactRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState("active");
  const [searchParams, setSearchParams] = useSearchParams();
  const viewScope = useMemo(
    () => normalizeContactScope(getPermissionScope("contacts.view"), onlyMine),
    [getPermissionScope, onlyMine],
  );
  const scopedUserIds = useMemo(
    () => getContactScopeUserIds(scopeAnewUserId, scopeAuthUserId, teamMemberIds),
    [scopeAnewUserId, scopeAuthUserId, teamMemberIds],
  );
  const effectiveOrgIds = useMemo(() => {
    if (companyFilter !== "all") return [companyFilter];
    if (scopeOrgIds.length > 0) return scopeOrgIds;
    return activeCompany?.id ? [activeCompany.id] : [];
  }, [companyFilter, scopeOrgIds, activeCompany?.id]);
  const currentScopeOptions = useMemo(
    () => ({
      scope: viewScope,
      scopedUserIds,
      allowedOrgIds: effectiveOrgIds,
    }),
    [viewScope, scopedUserIds, effectiveOrgIds],
  );

  // Load organizations for filter
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

  useEffect(() => {
    const alertRefs = Array.from(new Set(
      contactAlerts
        .filter((alert) => alert.type.startsWith("contact_no_contact_"))
        .flatMap((alert) => [
          alert.entity_id,
          (alert.action_config as any)?.contact_id,
          (alert.action_config as any)?.entity_id,
        ])
        .filter(Boolean)
    )) as string[];

    if (alertRefs.length === 0) return;

    const contactPool = (allContacts.length > 0 ? allContacts : contacts).filter((contact) =>
      contactMatchesScope(contact, currentScopeOptions),
    );
    const missingRefs = alertRefs.filter((ref) => {
      const localContact = findScopedContactByRef(contactPool, ref, currentScopeOptions);
      const localName = localContact ? getIdentity(localContact.entity_id)?.display_name : null;
      const cachedName = alertContactNameMap.get(ref);
      return !localName && !cachedName;
    });

    if (missingRefs.length === 0) return;

    let cancelled = false;

    const loadAlertContactNames = async () => {
      if (viewScope === "NONE") return;

      const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
      let contactsByIdQuery = supabase
        .from("anew_contacts")
        .select("id, entity_id, organization_id, assigned_to, created_by, converted_to_client_id, deleted_at")
        .is("deleted_at", null)
        .is("converted_to_client_id", null)
        .in("id", missingRefs);
      let contactsByEntityIdQuery = supabase
        .from("anew_contacts")
        .select("id, entity_id, organization_id, assigned_to, created_by, converted_to_client_id, deleted_at")
        .is("deleted_at", null)
        .is("converted_to_client_id", null)
        .in("entity_id", missingRefs);

      if (effectiveOrgIds.length > 0) {
        contactsByIdQuery = contactsByIdQuery.in("organization_id", effectiveOrgIds);
        contactsByEntityIdQuery = contactsByEntityIdQuery.in("organization_id", effectiveOrgIds);
      }
      if (scopeFilter) {
        contactsByIdQuery = contactsByIdQuery.or(scopeFilter);
        contactsByEntityIdQuery = contactsByEntityIdQuery.or(scopeFilter);
      }

      const [contactsByIdResult, contactsByEntityIdResult] = await Promise.all([
        contactsByIdQuery,
        contactsByEntityIdQuery,
      ]);

      const contactRows = [
        ...(contactsByIdResult.data || []),
        ...(contactsByEntityIdResult.data || []),
      ];

      const entityIds = Array.from(new Set(contactRows.map((contact) => contact.entity_id).filter(Boolean)));
      if (entityIds.length === 0 || cancelled) return;

      const { data: entities } = await supabase
        .from("anew_entities")
        .select("id, display_name")
        .in("id", entityIds);

      if (cancelled) return;

      const entityNameMap = new Map((entities || []).map((entity) => [entity.id, entity.display_name]));

      setAlertContactNameMap((prev) => {
        const next = new Map(prev);
        contactRows.forEach((contact) => {
          const contactName = entityNameMap.get(contact.entity_id);
          if (!contactName) return;
          next.set(contact.id, contactName);
          next.set(contact.entity_id, contactName);
        });
        return next;
      });
    };

    void loadAlertContactNames();

    return () => {
      cancelled = true;
    };
  }, [contactAlerts, allContacts, contacts, getIdentity, alertContactNameMap, currentScopeOptions, effectiveOrgIds, scopedUserIds, viewScope]);

  const personalizedContactAlerts = useMemo(() => {
    const contactPool = (allContacts.length > 0 ? allContacts : contacts).filter((contact) =>
      contactMatchesScope(contact, currentScopeOptions),
    );

    return contactAlerts.map((alert) => {
      if (!alert.type.startsWith("contact_no_contact_")) return alert;

      const alertRef = (alert.action_config as any)?.entity_id || alert.entity_id || (alert.action_config as any)?.contact_id;
      const matchedContact = findScopedContactByRef(contactPool, alertRef, currentScopeOptions);
      const contactName = (matchedContact ? getIdentity(matchedContact.entity_id)?.display_name : null) || (alertRef ? alertContactNameMap.get(alertRef) : null);

      if (!contactName) return alert;

      const days = alert.type.match(/_(\d+)d$/)?.[1];
      const isFollowUpAlert = alert.type === "contact_no_contact_7d";

      return {
        ...alert,
        title: days ? `${contactName} — sem interação há ${days} dias` : contactName,
        message: isFollowUpAlert
          ? `Considere fazer follow-up com ${contactName}.`
          : `${contactName} não é abordado há mais de ${days} dias.`,
      };
    });
  }, [contactAlerts, allContacts, contacts, getIdentity, alertContactNameMap, currentScopeOptions]);
 
  useEffect(() => {
    const newContact = searchParams.get("newContact");
    if (newContact === "true") { setOpen(true); setSearchParams({}); return; }
 
    const openId = searchParams.get("open");
    if (!openId || selectedContact) return;
 
    const openFromQuery = async () => {
      const contactPool = allContacts.length > 0 ? allContacts : contacts;
      const found = findScopedContactByRef(contactPool, openId, currentScopeOptions);
      if (found) {
        await openContactDetails(found);
        setSearchParams({});
        return;
      }

      if (viewScope === "NONE") return;

      let query = supabase
        .from("anew_contacts")
        .select("id, entity_id, organization_id, root_organization_id, status, position, source_type, source_lead_id, assigned_to, notes, created_at, created_by, last_interaction_at, converted_to_client_id, updated_at, deleted_at")
        .is("deleted_at", null)
        .is("converted_to_client_id", null)
        .or(`id.eq.${openId},entity_id.eq.${openId}`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (effectiveOrgIds.length > 0) query = query.in("organization_id", effectiveOrgIds);
      const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
      if (scopeFilter) query = query.or(scopeFilter);

      const { data: fetchedContacts } = await query;
      const fetchedContact = findScopedContactByRef((fetchedContacts || []) as any[], openId, currentScopeOptions);

      if (fetchedContact) {
        await openContactDetails(fetchedContact as ContactRecord);
        setSearchParams({});
      }
    };

    void openFromQuery();
  }, [searchParams, setSearchParams, contacts, allContacts, selectedContact, currentScopeOptions, effectiveOrgIds, scopedUserIds, viewScope]);

  // Initial load effect moved after loadContacts definition (see below)

  // Realtime subscription + 30s polling backup
  useEffect(() => {
    if (scopeLoading || isParentOrg === null) return;

    // 30s polling backup — silent refresh (isInitial=false to avoid loading spinner & list reset)
    const pollInterval = setInterval(() => {
      loadContactsRef.current?.(0, false);
    }, 30000);

    // Realtime subscription for INSERT/UPDATE/DELETE on anew_contacts
    const channel = supabase
      .channel('anew-contacts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'anew_contacts' },
        () => {
          loadContactsRef.current?.(0, false);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [scopeLoading, isParentOrg]);

  const loadContactsRef = useRef<(offset: number, isInitial?: boolean) => Promise<void>>();
  const contactsLengthRef = useRef(0);
  const hasLoadedContactsRef = useRef(false);
  useEffect(() => { contactsLengthRef.current = contacts.length; }, [contacts.length]);

  // Cache auth user and exclude IDs to avoid redundant network calls on each scroll page
  const cachedAuthRef = useRef<{ authUserId: string | null; internalUserId: string | null } | null>(null);
  const cachedExcludeRef = useRef<{ ids: string[]; clientPairs: Set<string>; key: string } | null>(null);

  const loadContacts = useCallback(async (offset: number, isInitial: boolean = false) => {
    const shouldShowInitialLoader = isInitial && !hasLoadedContactsRef.current && contactsLengthRef.current === 0;
    if (shouldShowInitialLoader) setLoading(true); else if (offset > 0) setLoadingMore(true);
    try {
      // Cache auth user resolution — only fetch once per session
      let authUserId: string | null = null;
      let internalUserId: string | null = scopeAnewUserId || null;
      if (cachedAuthRef.current) {
        authUserId = cachedAuthRef.current.authUserId;
        if (!internalUserId) internalUserId = cachedAuthRef.current.internalUserId;
      } else {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        authUserId = currentUser?.id || null;
        if (!internalUserId && authUserId) {
          const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
          internalUserId = anewUser?.id || null;
        }
        cachedAuthRef.current = { authUserId, internalUserId };
      }

      const viewScope = getPermissionScope("contacts.view");

      // Cache exclude entity IDs — only re-fetch on initial load or filter changes
      const excludeCacheKey = `${effectiveOrgIds.join(",")}|${viewScope}`;
      let excludeEntityIds: string[] = [];
      let clientOrgPairs: Set<string> = new Set();
      if (!isInitial && cachedExcludeRef.current?.key === excludeCacheKey) {
        excludeEntityIds = cachedExcludeRef.current.ids;
        clientOrgPairs = cachedExcludeRef.current.clientPairs;
      } else {
        let inactiveQuery = supabase.from("anew_entity_roles").select("entity_id").eq("role", "contact").eq("status", "inactive");
        let clientQuery = supabase.from("anew_clients").select("entity_id, organization_id").neq("status", "inactive");
        if (effectiveOrgIds.length > 0) {
          inactiveQuery = inactiveQuery.in("organization_id", effectiveOrgIds);
          clientQuery = clientQuery.in("organization_id", effectiveOrgIds);
        }
        const [inactiveRes, clientRes] = await Promise.all([inactiveQuery, clientQuery]);
        // Inactive contact roles: exclude globally (entity has no active contact role)
        const inactiveSet = new Set<string>();
        (inactiveRes.data || []).forEach(r => inactiveSet.add(r.entity_id));
        excludeEntityIds = [...inactiveSet];
        // Client roles: build org-scoped pairs for client-side filtering
        clientOrgPairs = new Set<string>();
        (clientRes.data || []).forEach((r: any) => {
          clientOrgPairs.add(`${r.entity_id}|${r.organization_id}`);
        });
        cachedExcludeRef.current = { ids: excludeEntityIds, clientPairs: clientOrgPairs, key: excludeCacheKey };
        if (isInitial) setClientOrgPairKeys(new Set(clientOrgPairs));
      }

      // Server-side search via shared searchEntityIds (trigram-indexed RPC: name + email + phone + NIF)
      let searchEntityIds: string[] | null = null;
      if (debouncedSearch && debouncedSearch.trim().length >= 2) {
        const term = debouncedSearch.trim();
        const { ids: matchedIds, truncated } = await searchEntityIdsFn(term);
        if (truncated && truncatedWarnedRef.current !== term) {
          truncatedWarnedRef.current = term;
          toast({
            title: "Demasiados resultados",
            description: "Mais de 1000 resultados — refine a pesquisa para ver todos.",
          });
        }
        searchEntityIds = matchedIds;
        if (searchEntityIds.length === 0) {
          if (isInitial) { setContacts([]); setTotalCount(0); }
          setHasMore(false); setLoading(false); setLoadingMore(false);
          return;
        }
      }

      let query = supabase.from("anew_contacts").select("id, entity_id, organization_id, root_organization_id, status, position, source_type, source_lead_id, assigned_to, notes, created_at, created_by, last_interaction_at, converted_to_client_id, updated_at", { count: isInitial ? 'estimated' : undefined });
      query = query.is("deleted_at", null);
      // Always exclude contacts already converted to client
      query = query.is("converted_to_client_id", null);
      // Apply server-side search filter
      if (searchEntityIds) query = query.in("entity_id", searchEntityIds);
      if (excludeEntityIds.length > 0) query = query.not("entity_id", "in", `(${excludeEntityIds.join(",")})`);
      if (effectiveOrgIds.length > 0) query = query.in("organization_id", effectiveOrgIds);
      if (statusFilter === "deals") query = query.eq("status", "active");
      else if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) query = query.lte("created_at", dateTo.toISOString());
      if (commercialFilter !== "all") query = query.eq("assigned_to", commercialFilter);
      if (viewScope === "NONE") { if (isInitial) setContacts([]); setHasMore(false); setLoading(false); return; }
      const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
      if (scopeFilter) query = query.or(scopeFilter);
      query = query.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      const { data, error, count } = await query;
      if (error) throw error;

      let newContacts = (data || []) as ContactRecord[];
      const entityIds = newContacts.map(c => c.entity_id).filter(Boolean);
      if (entityIds.length > 0) await resolveEntities(entityIds);

      const assignedIds = newContacts.map(c => c.assigned_to).filter(Boolean) as string[];
      if (assignedIds.length > 0) {
        const uniqueIds = [...new Set(assignedIds)];
        // Only query IDs not already in the cache
        const uncachedIds = uniqueIds.filter(id => !assignedUserMapRef.current.has(id));
        if (uncachedIds.length > 0) {
          const { data: users } = await supabase.from("anew_users").select("id, name").in("id", uncachedIds);
          if (users) setAssignedUserMap(prev => {
            const next = new Map(prev);
            users.forEach((u: any) => next.set(u.id, u.name || ''));
            return next;
          });
        }
      }

      // Org-scoped client exclusion: only hide a contact if there's an active client role in the SAME org
      if (clientOrgPairs.size > 0) {
        newContacts = newContacts.filter(c => !clientOrgPairs.has(`${c.entity_id}|${c.organization_id}`));
      }
      if (statusFilter === "deals") newContacts = newContacts.filter(c => dealsEntityIds.has(c.entity_id));

      if (isInitial || offset === 0) setContacts(newContacts);
      else setContacts(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        return [...prev, ...newContacts.filter(c => !existingIds.has(c.id))];
      });
      if (isInitial && count !== null) setTotalCount(count);
      setHasMore(newContacts.length === PAGE_SIZE && (count ? offset + PAGE_SIZE < count : true));
      hasLoadedContactsRef.current = true;
    } catch (error: any) {
      toast({ title: t('contacts.toast.loadContactsError'), description: error.message, variant: "destructive" });
    } finally { setLoading(false); setLoadingMore(false); }
  }, [activeCompany?.id, effectiveOrgIds, statusFilter, dateFrom, dateTo, scopeAnewUserId, scopeLoading, isParentOrg, resolveEntities, dealsEntityIds, debouncedSearch, t, toast, commercialFilter, scopedUserIds, viewScope]);

  // Keep a stable ref to loadContacts for infinite scroll
  useEffect(() => { loadContactsRef.current = loadContacts; }, [loadContacts]);

  // Read ?filter= param from notification links
  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam) {
      const filterMap: Record<string, string> = {
        no_contact: "no_contact",
        no_contact_urgent: "no_contact_urgent",
        no_deal: "no_deal",
      };
      const mappedFilter = filterMap[filterParam] || "all";
      setStatusFilter(mappedFilter);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("filter");
      newParams.delete("_t");
      setSearchParams(newParams, { replace: true });
    }
  }, []);

  // Initial load + reload on filter changes — also invalidate caches
  useEffect(() => {
    cachedExcludeRef.current = null;
    supplementaryLoadedRef.current = new Set();
    if (!scopeLoading && isParentOrg !== null) loadContacts(0, true);
  }, [loadContacts]);

  const loadMoreContacts = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadContactsRef.current?.(contactsLengthRef.current);
    }
  }, [loadingMore, hasMore]);

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMoreContacts,
    hasMore,
    isLoading: loadingMore,
  });

  const loadSupplementaryData = useCallback(async (entityIds: string[]) => {
    if (entityIds.length === 0) return;
    const uniqueIds = [...new Set(entityIds)];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [interactionsRes, tagsRes, dealsRes, sentimentRes, proposalsRes, quotesRes] = await Promise.all([
      supabase.from("entity_interactions").select("entity_id, id").in("entity_id", uniqueIds).gte("interaction_at", thirtyDaysAgo.toISOString()),
      supabase.from("contact_tags").select("entity_id, id, tag, color").in("entity_id", uniqueIds),
      (supabase as any).from("deals").select("entity_id, id, value, assigned_to, created_by").in("entity_id", uniqueIds).is("lost_reason", null),
      supabase.from("entity_interactions").select("entity_id, sentiment, interaction_at").in("entity_id", uniqueIds).not("sentiment", "is", null).order("interaction_at", { ascending: false }),
      (supabase as any).from("proposals").select("entity_id, id, value, status, proposal_items(subtotal, total)").in("entity_id", uniqueIds).neq("status", "rejeitada"),
      (supabase as any).from("quotes").select("entity_id, id, subtotal, total, estado").in("entity_id", uniqueIds).neq("estado", "perdido"),
    ]);
    const counts: Record<string, number> = {};
    (interactionsRes.data || []).forEach((i: any) => { counts[i.entity_id] = (counts[i.entity_id] || 0) + 1; });
    setInteractionCounts(prev => ({ ...prev, ...counts }));
    const lastDates: Record<string, string> = {};
    (sentimentRes.data || []).forEach((i: any) => { if (!lastDates[i.entity_id]) lastDates[i.entity_id] = i.interaction_at; });
    setLastInteractions(prev => ({ ...prev, ...lastDates }));
    const tagMap: Record<string, { id: string; tag: string; color: string }[]> = {};
    (tagsRes.data || []).forEach((t: any) => {
      if (!tagMap[t.entity_id]) tagMap[t.entity_id] = [];
      tagMap[t.entity_id].push({ id: t.id, tag: t.tag, color: t.color || "blue" });
    });
    setTagsData(prev => ({ ...prev, ...tagMap }));
    const dealMap: Record<string, { count: number; value: number }> = {};
    (dealsRes.data || []).forEach((d: any) => {
      if (!dealMap[d.entity_id]) dealMap[d.entity_id] = { count: 0, value: 0 };
      dealMap[d.entity_id].count++;
      dealMap[d.entity_id].value += (d.value || 0);
    });
    setDealsData(prev => ({ ...prev, ...dealMap }));

    // Build deal commercial map: entity_id → commercial user (from deal assigned_to or created_by)
    // Deals store auth_user_id, so we need to resolve to anew_users.id
    const dealAuthIds = new Set<string>();
    const entityToDealAuthId: Record<string, string> = {};
    (dealsRes.data || []).forEach((d: any) => {
      if (!entityToDealAuthId[d.entity_id]) {
        const authId = d.assigned_to || d.created_by;
        if (authId) {
          entityToDealAuthId[d.entity_id] = authId;
          dealAuthIds.add(authId);
        }
      }
    });
    if (dealAuthIds.size > 0) {
      const authIdsArr = [...dealAuthIds];
      const { data: resolvedUsers } = await supabase.from("anew_users").select("id, name, auth_user_id").in("auth_user_id", authIdsArr);
      if (resolvedUsers && resolvedUsers.length > 0) {
        const authToAnew = new Map<string, { id: string; name: string }>();
        resolvedUsers.forEach((u: any) => authToAnew.set(u.auth_user_id, { id: u.id, name: u.name || '' }));
        const newDealCommercial: Record<string, string> = {};
        for (const [entityId, authId] of Object.entries(entityToDealAuthId)) {
          const anewUser = authToAnew.get(authId);
          if (anewUser) {
            newDealCommercial[entityId] = anewUser.id;
            // Also add to assignedUserMap cache
            if (!assignedUserMapRef.current.has(anewUser.id)) {
              setAssignedUserMap(prev => { const n = new Map(prev); n.set(anewUser.id, anewUser.name); return n; });
            }
          }
        }
        setDealCommercialMap(prev => ({ ...prev, ...newDealCommercial }));
      }
    }
    // Proposals
    const proposalMap: Record<string, { count: number; value: number; valueWithIva: number }> = {};
    (proposalsRes.data || []).forEach((p: any) => {
      if (!p.entity_id) return;
      if (!proposalMap[p.entity_id]) proposalMap[p.entity_id] = { count: 0, value: 0, valueWithIva: 0 };
      proposalMap[p.entity_id].count++;
      // Use proposal_items total if available, otherwise fall back to proposal.value
      const itemsTotal = (p.proposal_items || []).reduce((s: number, i: any) => s + (Number(i.total) || 0), 0);
      const itemsSubtotal = (p.proposal_items || []).reduce((s: number, i: any) => s + (Number(i.subtotal) || 0), 0);
      proposalMap[p.entity_id].value += itemsSubtotal > 0 ? itemsSubtotal : (p.value || 0);
      proposalMap[p.entity_id].valueWithIva += itemsTotal > 0 ? itemsTotal : (p.value || 0);
    });
    setProposalsData(prev => ({ ...prev, ...proposalMap }));
    // Quotes
    const quoteMap: Record<string, { count: number; value: number; valueWithIva: number }> = {};
    (quotesRes.data || []).forEach((q: any) => {
      if (!q.entity_id) return;
      if (!quoteMap[q.entity_id]) quoteMap[q.entity_id] = { count: 0, value: 0, valueWithIva: 0 };
      quoteMap[q.entity_id].count++;
      quoteMap[q.entity_id].value += (q.subtotal || q.total || 0);
      quoteMap[q.entity_id].valueWithIva += (q.total || 0);
    });
    setQuotesData(prev => ({ ...prev, ...quoteMap }));
    const sentiments: Record<string, string> = {};
    (sentimentRes.data || []).forEach((s: any) => { if (!sentiments[s.entity_id]) sentiments[s.entity_id] = s.sentiment; });
    setLastSentiments(prev => ({ ...prev, ...sentiments }));
  }, []);

  // Defer supplementary data loading — run after initial render, not blocking the list display
  const supplementaryLoadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const entityIds = contacts.map(c => c.entity_id).filter(Boolean);
    const newIds = entityIds.filter(id => !supplementaryLoadedRef.current.has(id));
    if (newIds.length > 0) {
      // Defer to avoid blocking initial render
      const timer = setTimeout(() => {
        loadSupplementaryData(newIds);
        newIds.forEach(id => supplementaryLoadedRef.current.add(id));
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [contacts, loadSupplementaryData]);

  // Load ALL contacts for dashboard/scoring/relations views
  const loadAllContacts = useCallback(async () => {
    if (scopeLoading || isParentOrg === null || !activeCompany?.id) return;
    setAllContactsLoading(true);
    try {
      // Reuse cached auth from loadContacts instead of re-querying
      let authUserId: string | null = null;
      let internalUserId: string | null = scopeAnewUserId || null;
      if (cachedAuthRef.current) {
        authUserId = cachedAuthRef.current.authUserId;
        if (!internalUserId) internalUserId = cachedAuthRef.current.internalUserId;
      } else {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        authUserId = currentUser?.id || null;
        if (!internalUserId && authUserId) {
          const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
          internalUserId = anewUser?.id || null;
        }
        cachedAuthRef.current = { authUserId, internalUserId };
      }
      // Reuse cached exclude IDs from loadContacts instead of re-querying
      const excludeCacheKey = `${effectiveOrgIds.join(",")}|${viewScope}`;
      let excludeEntityIds: string[] = [];
      let clientOrgPairs: Set<string> = new Set();
      if (cachedExcludeRef.current?.key === excludeCacheKey) {
        excludeEntityIds = cachedExcludeRef.current.ids;
        clientOrgPairs = cachedExcludeRef.current.clientPairs;
      } else {
        let inactiveQuery = supabase.from("anew_entity_roles").select("entity_id").eq("role", "contact").eq("status", "inactive");
        let clientQuery = supabase.from("anew_clients").select("entity_id, organization_id").neq("status", "inactive");
        if (effectiveOrgIds.length > 0) {
          inactiveQuery = inactiveQuery.in("organization_id", effectiveOrgIds);
          clientQuery = clientQuery.in("organization_id", effectiveOrgIds);
        }
        const [inactiveRes, clientRes] = await Promise.all([inactiveQuery, clientQuery]);
        const inactiveSet = new Set<string>();
        (inactiveRes.data || []).forEach((r: any) => inactiveSet.add(r.entity_id));
        excludeEntityIds = [...inactiveSet];
        clientOrgPairs = new Set<string>();
        (clientRes.data || []).forEach((r: any) => clientOrgPairs.add(`${r.entity_id}|${r.organization_id}`));
        cachedExcludeRef.current = { ids: excludeEntityIds, clientPairs: clientOrgPairs, key: excludeCacheKey };
      }

      // Load all contacts recursively in batches of 500
      const BATCH_SIZE = 500;
      const MAX_LOAD_RECORDS = 10_000;
      let allData: ContactRecord[] = [];
      let offset = 0;
      let keepGoing = true;
      while (keepGoing) {
        let query = supabase.from("anew_contacts").select("id, entity_id, organization_id, root_organization_id, status, position, source_type, source_lead_id, assigned_to, notes, created_at, created_by, last_interaction_at, converted_to_client_id, updated_at");
        query = query.is("deleted_at", null);
        query = query.is("converted_to_client_id", null);
        if (excludeEntityIds.length > 0) query = query.not("entity_id", "in", `(${excludeEntityIds.join(",")})`);
        if (effectiveOrgIds.length > 0) query = query.in("organization_id", effectiveOrgIds);
        if (statusFilter === "deals") query = query.eq("status", "active");
        else if (statusFilter !== "all") query = query.eq("status", statusFilter);
        if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
        if (dateTo) query = query.lte("created_at", dateTo.toISOString());
        if (commercialFilter !== "all") query = query.eq("assigned_to", commercialFilter);
        if (viewScope === "NONE") { setAllContacts([]); setAllContactsLoading(false); return; }
        const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
        if (scopeFilter) query = query.or(scopeFilter);
        query = query.order("created_at", { ascending: false }).range(offset, offset + BATCH_SIZE - 1);
        const { data, error } = await query;
        if (error) throw error;
        const batch = (data || []) as ContactRecord[];
        allData = [...allData, ...batch];
        if (batch.length < BATCH_SIZE) keepGoing = false;
        else if (allData.length >= MAX_LOAD_RECORDS) keepGoing = false;
        else offset += BATCH_SIZE;
      }

      // Resolve entities and assigned users for all contacts
      const entityIds = allData.map(c => c.entity_id).filter(Boolean);
      if (entityIds.length > 0) await resolveEntities(entityIds);
      const assignedIds = [...new Set(allData.map(c => c.assigned_to).filter(Boolean) as string[])];
      if (assignedIds.length > 0) {
        // Only query IDs not already in the cache
        const uncachedIds = assignedIds.filter(id => !assignedUserMapRef.current.has(id));
        if (uncachedIds.length > 0) {
          const { data: users } = await supabase.from("anew_users").select("id, name").in("id", uncachedIds);
          if (users) setAssignedUserMap(prev => {
            const next = new Map(prev);
            users.forEach((u: any) => next.set(u.id, u.name || ''));
            return next;
          });
        }
      }

      // Load supplementary data for all
      if (entityIds.length > 0) await loadSupplementaryData(entityIds);

      // Org-scoped client exclusion for dashboard
      if (clientOrgPairs.size > 0) {
        allData = allData.filter(c => !clientOrgPairs.has(`${c.entity_id}|${c.organization_id}`));
      }

      setAllContacts(allData);
    } catch (error: any) {
      console.error("Error loading all contacts for dashboard:", error);
    } finally {
      setAllContactsLoading(false);
    }
  }, [activeCompany?.id, effectiveOrgIds, statusFilter, dateFrom, dateTo, scopeAnewUserId, scopeLoading, isParentOrg, resolveEntities, loadSupplementaryData, commercialFilter, scopedUserIds, viewScope]);

  // Trigger full load for accurate KPIs — always, but defer via idle to not block first paint
  useEffect(() => {
    if (allContactsLoading) return;
    const immediate = dealsFilter !== "all" || noContact14dFilter;
    const w = window as any;
    const run = () => loadAllContacts();
    if (immediate) { run(); return; }
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
  }, [loadAllContacts, activeView, dealsFilter, noContact14dFilter]);

  // Server-side dashboard KPIs - lightweight RPC, runs on every view.
  // M3: aggregate counts are computed server-side instead of loading up to
  // 10,000 contacts client-side just to derive totals.
  useEffect(() => {
    if (scopeLoading || !scopeOrgIds.length) return;
    const loadAlertCounts = async () => {
      try {
        const { data, error } = await supabase.rpc('get_contact_dashboard_kpis', { p_org_ids: scopeOrgIds });
        if (!error && data) {
          setServerAlertCounts(data as any);
        }
      } catch (e) { console.error('Error loading alert counts:', e); }
    };
    loadAlertCounts();
    const interval = setInterval(loadAlertCounts, 120000); // 2min instead of 30s
    return () => clearInterval(interval);
  }, [scopeOrgIds, scopeLoading]);

  useEffect(() => {
    if (activeView === "list" || scopeLoading || isParentOrg === null) return;
    // Realtime — debounced to avoid storms on bulk operations
    let timer: number | null = null;
    const debouncedReload = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { loadAllContacts(); }, 2000);
    };
    const channel = supabase
      .channel('anew-contacts-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anew_contacts' }, debouncedReload)
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [activeView, scopeLoading, isParentOrg, loadAllContacts]);

  useEffect(() => {
    const loadAllTags = async () => {
      if (!activeCompany?.id) return;
      const orgIds = scopeOrgIds.length > 0 ? scopeOrgIds : [activeCompany.id];
      const { data } = await supabase.from("contact_tags").select("tag").in("organization_id", orgIds);
      if (data) setAllTags([...new Set(data.map(t => t.tag))].sort());
    };
    loadAllTags();
  }, [activeCompany?.id, scopeOrgIds]);

  // Load all org members upfront for the commercial filter (independent of loaded contacts)
  useEffect(() => {
    const loadCompanyUsers = async () => {
      if (!activeCompany?.id || scopeOrgIds.length === 0) return;
      const { data: memberships } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .in("organization_id", scopeOrgIds)
        .eq("status", "active");
      if (!memberships || memberships.length === 0) { setCompanyUsers([]); return; }
      const userIds = [...new Set(memberships.map(m => m.user_id))];
      const { data: users } = await supabase.from("anew_users").select("id, name").in("id", userIds);
      if (users) setCompanyUsers(users.filter(u => u.name).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    };
    loadCompanyUsers();
  }, [activeCompany?.id, scopeOrgIds]);


  const getHealthScore = useCallback((entityId: string, lastInteractionAt: string | null) => {
    const identity = getIdentity(entityId);
    return calculateHealthScore({
      lastInteractionAt: lastInteractions[entityId] || lastInteractionAt,
      hasActiveDeal: !!dealsData[entityId]?.count,
      hasActiveProposal: !!proposalsData[entityId]?.count,
      hasActiveQuote: !!quotesData[entityId]?.count,
      hasEmail: !!identity?.email, hasPhone: !!identity?.phone,
      hasVat: !!identity?.vat, interactionCount30d: interactionCounts[entityId] || 0,
    });
  }, [getIdentity, lastInteractions, dealsData, proposalsData, quotesData, interactionCounts]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isServerTextSearchActive = normalizedSearchQuery.length >= 2;

  // Client-side filtering
  const sourceForFiltering = ((dealsFilter !== "all" || noContact14dFilter) && allContacts.length > 0) ? allContacts : contacts;
  const filteredContacts = sourceForFiltering.filter(contact => {
    const entityId = contact.entity_id;
    if (clientOrgPairKeys.has(`${entityId}|${contact.organization_id}`)) return false;
    if (!contactMatchesScope(contact, currentScopeOptions)) return false;
    if (normalizedSearchQuery && !isServerTextSearchActive) {
      const identity = getIdentity(entityId);
      const name = (identity?.display_name || "").toLowerCase();
      const email = (identity?.email || "").toLowerCase();
      const phone = (identity?.phone || "").toLowerCase();
      const words = normalizedSearchQuery.split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        const w = words[0];
        if (!name.includes(w) && !email.includes(w) && !phone.includes(w)) return false;
      } else {
        if (!words.every(w => name.includes(w))) return false;
      }
    }
    if (healthFilter.length > 0) {
      const hs = getHealthScore(entityId, contact.last_interaction_at);
      if (!healthFilter.includes(hs.level)) return false;
    }
    if (noContact14dFilter) {
      const lastDate = lastInteractions[entityId] || contact.last_interaction_at;
      if (lastDate && differenceInDays(new Date(), new Date(lastDate)) <= 14) return false;
    }
    const hasPipelineData = !!(dealsData[entityId]?.count || proposalsData[entityId]?.count || quotesData[entityId]?.count);
    if (dealsFilter === "with" && !hasPipelineData) return false;
    if (dealsFilter === "without" && hasPipelineData) return false;
    if (tagsFilter.length > 0) {
      const tags = tagsData[entityId] || [];
      if (!tagsFilter.some(tf => tags.some(t => t.tag === tf))) return false;
    }
    if (sentimentFilter !== "all" && lastSentiments[entityId] !== sentimentFilter) return false;
    if (commercialFilter !== "all" && contact.assigned_to !== commercialFilter) return false;
    if (smartFilter) {
      const hs = getHealthScore(entityId, contact.last_interaction_at);
      if (hs.score >= 40) return false;
      const lastDate = lastInteractions[entityId] || contact.last_interaction_at;
      if (lastDate && differenceInDays(new Date(), new Date(lastDate)) <= 7) return false;
    }
    return true;
  });

  // Alert data - use server-side RPC only when scope is ORG, otherwise compute from loaded data
  const alertData = useMemo(() => {
    const viewScope = getPermissionScope("contacts.view");
    if (viewScope === "ORG" && serverAlertCounts) {
      return {
        noContact14d: serverAlertCounts.no_contact_14d || 0,
        noDeal: serverAlertCounts.without_deals || 0,
        unassigned: serverAlertCounts.unassigned || 0,
      };
    }
    // For OWNED/TEAM scope, compute from the scoped data
    const source = allContacts.length > 0 ? allContacts : contacts;
    let noContact14d = 0, noDeal = 0, unassigned = 0;
    source.forEach(c => {
      const lastDate = lastInteractions[c.entity_id] || c.last_interaction_at;
      if (!lastDate || differenceInDays(new Date(), new Date(lastDate)) > 14) noContact14d++;
      if (!dealsData[c.entity_id]?.count) noDeal++;
      if (!c.assigned_to) unassigned++;
    });
    return { noContact14d, noDeal, unassigned };
  }, [serverAlertCounts, getPermissionScope, allContacts, contacts, lastInteractions, dealsData]);

  // Insight contacts (high health + no deal + >14d no contact) - use allContacts when available
  const insightContacts = useMemo(() => {
    const source = allContacts.length > 0 ? allContacts : contacts;
    return source.filter(c => {
      const hs = getHealthScore(c.entity_id, c.last_interaction_at);
      if (hs.score < 60 || dealsData[c.entity_id]?.count || proposalsData[c.entity_id]?.count) return false;
      const lastDate = lastInteractions[c.entity_id] || c.last_interaction_at;
      return !lastDate || differenceInDays(new Date(), new Date(lastDate)) > 14;
    }).map(c => ({
      name: getIdentity(c.entity_id)?.display_name || "—",
      score: getHealthScore(c.entity_id, c.last_interaction_at).score,
      entityId: c.entity_id,
    }));
  }, [contacts, allContacts, lastInteractions, dealsData, proposalsData, interactionCounts, getIdentity, getHealthScore]);

  // Determine if any client-side filter is active (to decide whether KPIs should use filtered data)
  // Note: dealsFilter is excluded from KPI recalculation to keep alert cards stable when filtering by deals
  const hasActiveClientFilter = commercialFilter !== "all" || onlyMine || healthFilter.length > 0 || tagsFilter.length > 0 || sentimentFilter !== "all" || smartFilter || searchQuery.length > 0 || noContact14dFilter;
  const hasActiveClientFilterForList = hasActiveClientFilter || dealsFilter !== "all";

  // KPI data - use server-side counts for stable numbers when no filter, client-side filtered data when filters active
  const kpiData = useMemo(() => {
    const source = hasActiveClientFilter ? filteredContacts : (allContacts.length > 0 ? allContacts : contacts);
    let totalPipeline = 0, withDeals = 0, withProposals = 0, withPipeline = 0, totalScore = 0;
    source.forEach(c => {
      const hs = getHealthScore(c.entity_id, c.last_interaction_at);
      totalScore += hs.score;
      const hasDeal = !!dealsData[c.entity_id]?.count;
      const hasProposal = !!proposalsData[c.entity_id]?.count;
      const hasQuote = !!quotesData[c.entity_id]?.count;
      if (hasDeal) withDeals++;
      if (hasProposal) withProposals++;
      if (hasDeal || hasProposal || hasQuote) withPipeline++;
      if (hasProposal) { totalPipeline += proposalsData[c.entity_id].value; }
      else if (hasQuote) { totalPipeline += quotesData[c.entity_id].value; }
      else if (hasDeal) { totalPipeline += dealsData[c.entity_id].value; }
    });

    // Use server-side counts only when no filter is active AND scope is ORG (server RPC doesn't respect scope)
    const viewScope = getPermissionScope("contacts.view");
    const useServerCounts = !hasActiveClientFilter && viewScope === "ORG";
    const total = useServerCounts ? (serverAlertCounts?.total ?? totalCount ?? source.length) : (hasActiveClientFilter ? source.length : (totalCount || source.length));
    const active = useServerCounts ? (serverAlertCounts?.active ?? source.filter(c => c.status === "active").length) : source.filter(c => c.status === "active").length;
    const inactive = useServerCounts ? (serverAlertCounts?.inactive ?? source.filter(c => c.status === "inactive").length) : source.filter(c => c.status === "inactive").length;
    const calcNoContact7d = () => {
      let count = 0;
      source.forEach(c => {
        const lastDate = lastInteractions[c.entity_id] || c.last_interaction_at;
        if (!lastDate || differenceInDays(new Date(), new Date(lastDate)) > 7) count++;
      });
      return count;
    };
    const noContact7d = useServerCounts ? (serverAlertCounts?.no_contact_7d ?? calcNoContact7d()) : calcNoContact7d();
    const withoutDeals = useServerCounts ? (serverAlertCounts?.without_deals ?? (total - withDeals)) : (total - withDeals);
    return {
      total, active, inactive,
      pipeline: totalPipeline, withDeals, withProposals, withPipeline, withoutDeals,
      noContact7d, avgHealth: source.length > 0 ? Math.round(totalScore / source.length) : 0,
    };
  }, [contacts, allContacts, filteredContacts, totalCount, lastInteractions, dealsData, proposalsData, quotesData, interactionCounts, getIdentity, serverAlertCounts, hasActiveClientFilter, getPermissionScope]);

  // Active filter count
  const activeFilterCount = [
    healthFilter.length > 0, dealsFilter !== "all", tagsFilter.length > 0, sentimentFilter !== "all", onlyMine, smartFilter, commercialFilter !== "all", noContact14dFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setHealthFilter([]); setDealsFilter("all"); setTagsFilter([]); setSentimentFilter("all");
    setOnlyMine(false); setSmartFilter(false); setSearchQuery(""); setStatusFilter("all");
    setCompanyFilter("all"); setDateFrom(undefined); setDateTo(undefined); setCommercialFilter("all");
    setNoContact14dFilter(false);
  };

  // --- All handlers from original (preserved exactly) ---
  const handlePostalCodeLookup = async () => {
    if (!addressData.postal_code) return;
    const result = await lookupPostalCode(addressData.postal_code);
    if (result) setAddressData(prev => ({ ...prev, street: result.address.street || prev.street, city: result.locality || prev.city, district: result.district || prev.district, municipality: result.municipality || prev.municipality }));
  };
  const handleDeleteClick = (contact: ContactRecord, e: React.MouseEvent) => { e.stopPropagation(); setContactToDelete(contact); setDeleteDialogOpen(true); };
  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return;
    try {
      const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "contact", p_id: contactToDelete.id });
      if (error) throw error;
      toast({ title: t('contacts.toast.movedToTrash'), description: t('contacts.toast.restoreHint') });
      setDeleteDialogOpen(false); setContactToDelete(null); setContacts([]); setHasMore(true); loadContacts(0, true);
    } catch (error: any) { toast({ title: t('contacts.toast.deleteError'), description: error.message, variant: "destructive" }); }
  };
  const toggleSelectAll = () => { selectedIds.size === filteredContacts.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filteredContacts.map(c => c.id))); };
  const toggleSelectOne = (id: string) => { const s = new Set(selectedIds); s.has(id) ? s.delete(id) : s.add(id); setSelectedIds(s); };
  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0) return;
    try {
      const { error } = await supabase.from("anew_contacts").update({ status: bulkNewStatus }).in("id", Array.from(selectedIds));
      if (error) throw error;
      toast({ title: t('contacts.toast.statusUpdated'), description: t('contacts.toast.statusUpdatedDesc', { count: selectedIds.size }) });
      setSelectedIds(new Set()); setBulkStatusDialogOpen(false); setContacts([]); setHasMore(true); loadContacts(0, true);
    } catch (error: any) { toast({ title: t('contacts.toast.statusError'), description: error.message, variant: "destructive" }); }
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      for (const id of Array.from(selectedIds)) {
        const { error } = await (supabase as any).rpc("soft_delete_entity_facet", { p_kind: "contact", p_id: id });
        if (error) throw error;
      }
      toast({ title: t('contacts.toast.bulkMovedToTrash'), description: t('contacts.toast.bulkRestoreHint', { count: selectedIds.size }) });
      setSelectedIds(new Set()); setBulkDeleteDialogOpen(false); setContacts([]); setHasMore(true); loadContacts(0, true);
    } catch (error: any) { toast({ title: t('contacts.toast.deleteError'), description: error.message, variant: "destructive" }); }
  };

  const formatDateTimeLocal = (date: Date): string => {
    const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
    const h = String(date.getHours()).padStart(2,'0'), min = String(date.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${d}T${h}:${min}`;
  };
  const findAvailableSlots = async (userId: string, count: number): Promise<{ start: Date; end: Date }[]> => {
    const slots: { start: Date; end: Date }[] = [];
    const now = new Date();
    let searchStart = new Date(now); searchStart.setMinutes(0,0,0);
    if (searchStart.getHours() < 9) searchStart.setHours(9);
    else if (searchStart.getHours() >= 18) { searchStart.setDate(searchStart.getDate()+1); searchStart.setHours(9); }
    else searchStart.setHours(searchStart.getHours()+1);
    const searchEnd = new Date(searchStart); searchEnd.setDate(searchEnd.getDate()+14);
    const { data: assignedItems } = await (supabase as any).from("schedule_items").select("id, start_datetime, end_datetime, status").eq("assigned_to_user_id", userId).neq("status","cancelled").gte("start_datetime", searchStart.toISOString()).lte("start_datetime", searchEnd.toISOString());
    const busyTimes = (assignedItems||[]).map((item:any)=>({start:new Date(item.start_datetime),end:new Date(item.end_datetime)}));
    let currentDate = new Date(searchStart); let daysSearched = 0;
    while (slots.length < count && daysSearched < 14) {
      const dow = currentDate.getDay();
      if (dow === 0 || dow === 6) { currentDate.setDate(currentDate.getDate()+1); currentDate.setHours(9,0,0,0); daysSearched++; continue; }
      for (let hour = Math.max(9, currentDate.getHours()); hour <= 17 && slots.length < count; hour++) {
        const ss = new Date(currentDate); ss.setHours(hour,0,0,0);
        const se = new Date(ss); se.setMinutes(se.getMinutes()+60);
        if (ss <= now) continue;
        if (!busyTimes.some(b => ss < b.end && se > b.start)) slots.push({start:ss,end:se});
      }
      currentDate.setDate(currentDate.getDate()+1); currentDate.setHours(9,0,0,0); daysSearched++;
    }
    return slots;
  };
  const selectSuggestedSlot = (slot: {start:Date;end:Date}) => {
    setScheduleFormData(prev=>({...prev, start_time: formatDateTimeLocal(slot.start), end_time: formatDateTimeLocal(slot.end)}));
  };
  const openScheduleDialog = async (contact: any, e: React.MouseEvent) => {
    e.stopPropagation(); setContactForSchedule(contact); setSuggestedSlots([]); setLoadingSuggestions(true);
    try {
      const orgId = activeCompany?.id;
      let users: {id:string;name:string}[] = [];
      if (orgId) {
        const { data: members } = await supabase.from("anew_memberships").select("user_id, anew_users!anew_memberships_user_id_anew_fkey(id, name)").eq("organization_id", orgId).eq("status","active");
        users = (members||[]).map((m:any)=>m.anew_users).filter(Boolean).sort((a:any,b:any)=>(a.name||'').localeCompare(b.name||''));
      }
      setScheduleUsers(users);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const assignedUserId = contact.assigned_to || currentUser?.id || "";
      const suggestions = await findAvailableSlots(assignedUserId, 3);
      setSuggestedSlots(suggestions);
      const defaultStart = suggestions.length > 0 ? suggestions[0].start : new Date(Date.now()+3600000);
      const defaultEnd = suggestions.length > 0 ? suggestions[0].end : new Date(defaultStart.getTime()+3600000);
      setScheduleFormData({ title: `Meeting with ${getIdentity(contact.entity_id)?.display_name || 'Contact'}`, description: "", visit_type: "meeting", location: "", start_time: formatDateTimeLocal(defaultStart), end_time: formatDateTimeLocal(defaultEnd), assigned_to: assignedUserId, notes: "" });
      setScheduleDialogOpen(true);
    } catch (error) { console.error("Error loading schedule data:", error); } finally { setLoadingSuggestions(false); }
  };
  const handleCreateSchedule = async () => {
    if (!contactForSchedule || !scheduleFormData.title || !scheduleFormData.start_time || !scheduleFormData.end_time) {
      toast({ title: t('contacts.toast.missingFields'), description: t('contacts.toast.missingFieldsDesc'), variant: "destructive" }); return;
    }
    const success = await createVisit({ contact_id: contactForSchedule.id, title: scheduleFormData.title, description: scheduleFormData.description, visit_type: scheduleFormData.visit_type, location: scheduleFormData.location, start_time: new Date(scheduleFormData.start_time).toISOString(), end_time: new Date(scheduleFormData.end_time).toISOString(), status: "scheduled", notes: scheduleFormData.notes, assigned_to: scheduleFormData.assigned_to || undefined });
    if (success) { setScheduleDialogOpen(false); setContactForSchedule(null); }
  };

  const [savingContact, setSavingContact] = useState(false);
  const submitLockRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSavingContact(true);
    try {
    const dataToValidate = contactType === "person" ? formData : { first_name: companyFormData.name, last_name: "", email: companyFormData.email, phone: companyFormData.phone, phone_country_code: companyFormData.phone_country_code, vat: companyFormData.vat, position: "", status: companyFormData.status };
    const schema = contactType === "company" ? contactCompanySchema : contactSchema;
    const contactValidation = schema.safeParse(dataToValidate);
    if (!contactValidation.success) {
      const errors: Record<string,string> = {};
      contactValidation.error.errors.forEach(err => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFieldErrors(errors);
      toast({ title: t('contacts.toast.validationError'), description: contactValidation.error.errors[0]?.message, variant: "destructive" }); return;
    }
    setFieldErrors({});
    if (addressData.postal_code) {
      const av = addressSchema.safeParse(addressData);
      if (!av.success) { toast({ title: t('contacts.toast.addressValidationError'), description: av.error.errors[0]?.message, variant: "destructive" }); return; }
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
      const internalUserId = anewUser?.id;
      if (!internalUserId) throw new Error("Perfil de utilizador não encontrado");
      const organizationId = activeCompany?.id || null;
      if (!organizationId) { toast({ title: t('contacts.toast.validationError'), description: t('contacts.toast.noOrganization'), variant: "destructive" }); return; }
      const personNames = contactType === "person" ? normalizeFirstLast(formData.first_name, formData.last_name) : { first: null, last: null };
      const contactDisplayName = contactType === "person" ? composeDisplayName(personNames.first, personNames.last) : companyFormData.name;
      const contactEntityType = contactType === "person" ? "person" : "organization";
      const contactEmail = contactType === "person" ? formData.email : companyFormData.email;
      const contactPhone = contactType === "person" ? formData.phone : companyFormData.phone;
      const contactPhoneCode = contactType === "person" ? formData.phone_country_code : companyFormData.phone_country_code;
      const contactVat = contactType === "person" ? formData.vat : companyFormData.vat;
      const contactFirstName = contactType === "person" ? personNames.first : null;
      const contactLastName = contactType === "person" ? personNames.last : null;
      let contactEntityId = await resolveEntityByIdentity({ email: contactEmail || null, phone: contactPhone || null, vat: contactVat || null });
      const contactEntityResolved = !!contactEntityId;
      if (!contactEntityId) {
        contactEntityId = await createEntityWithIdentity({ displayName: contactDisplayName, type: contactEntityType as 'person'|'organization', email: contactEmail || null, phone: contactPhone || null, phoneCountryCode: contactPhoneCode, vat: contactVat || null, createdBy: internalUserId, firstName: contactFirstName, lastName: contactLastName });
      }
      // NOTE: NÃO atualizar display_name aqui — sobrescreveria o nome da entidade
      // existente ANTES de mostrar o diálogo de duplicados (faria com que os duplicados
      // aparecessem com o nome recém-digitado em vez do nome real).
      // O update é feito mais abaixo, só quando não há duplicado.

      try {
        await ensureEntityOrgLink({ entityId: contactEntityId!, organizationId, isPrimary: !contactEntityResolved });
      } catch (e) { console.warn('[org-link] non-fatal', e); }
      const roleStatus = contactType === "person" ? formData.status : companyFormData.status;

      // --- DUPLICATE CHECK: look for existing leads, contacts, clients with same entity in same org ---
      const [{ data: existingContacts }, { data: existingLeads }, { data: existingClients }] = await Promise.all([
        supabase.from("anew_contacts").select("id, entity_id, status, created_at, assigned_to, source_type").eq("entity_id", contactEntityId).eq("organization_id", organizationId).not("status", "eq", "inactive"),
        (supabase as any).from("anew_leads").select("id, entity_id, status, created_at, campaign_id, campaigns:campaigns!anew_leads_campaign_id_fkey(name), assigned_user:anew_users!anew_leads_assigned_to_fkey(name)").eq("entity_id", contactEntityId).eq("organization_id", organizationId).not("status", "in", '("converted","lost","rejected")'),
        supabase.from("anew_clients").select("id, entity_id, status, created_at, assigned_to").eq("entity_id", contactEntityId).eq("organization_id", organizationId).not("status", "eq", "inactive"),
      ]);

      // Resolve real identity data for matched entities
      const allContactRawMatches = [
        ...(existingContacts || []).map((ec: any) => ({ ...ec, _type: "contact" as const })),
        ...(existingLeads || []).map((el: any) => ({ ...el, _type: "lead" as const })),
        ...(existingClients || []).map((ec: any) => ({ ...ec, _type: "client" as const })),
      ];
      const contactMatchEntityIds = [...new Set(allContactRawMatches.map((m: any) => m.entity_id).filter(Boolean))];
      const contactEntityIdentityMap = new Map<string, { displayName: string; email: string | null; phone: string | null }>();
      if (contactMatchEntityIds.length > 0) {
        const [entRes, emRes, phRes] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name").in("id", contactMatchEntityIds),
          supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", contactMatchEntityIds).eq("is_primary", true),
          supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", contactMatchEntityIds).eq("is_primary", true),
        ]);
        for (const eid of contactMatchEntityIds) {
          const ent = (entRes.data || []).find((e: any) => e.id === eid);
          const em = (emRes.data || []).find((e: any) => e.entity_id === eid);
          const ph = (phRes.data || []).find((p: any) => p.entity_id === eid);
          contactEntityIdentityMap.set(eid, {
            displayName: ent?.display_name || contactDisplayName,
            email: em?.email || null,
            phone: ph?.phone_number || null,
          });
        }
      }
      const contactSameOrgMatchFields = await fetchSameOrgMatchFields({
        orgId: organizationId, email: contactEmail || null, phone: contactPhone || null, vat: contactVat || null,
      });
      const contactSameOrgFieldSets = await fetchSameOrgFieldsByEntity({
        orgId: organizationId, email: contactEmail || null, phone: contactPhone || null, vat: contactVat || null,
      });
      const allContactMatches: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch[] = allContactRawMatches.map((m: any) => {
        const identity = contactEntityIdentityMap.get(m.entity_id) || { displayName: contactDisplayName, email: contactEmail || null, phone: contactPhone || null };
        return {
          id: m.id, entityId: m.entity_id, displayName: identity.displayName,
          email: identity.email, phone: identity.phone,
          status: m.status, type: m._type, createdAt: m.created_at,
          campaignName: m.campaigns?.name || null, assignedToName: m.assigned_user?.name || null,
          matchField: contactSameOrgMatchFields.get(m.entity_id),
          matchFields: contactSameOrgFieldSets.get(m.entity_id),
        };
      });


      // Cross-org (group) sibling matches
      const localIds = [...new Set(allContactMatches.map((m) => m.entityId).filter(Boolean))];
      const groupMatches = await fetchGroupDuplicateMatches({
        orgId: organizationId, email: contactEmail || null, phone: contactPhone || null, vat: contactVat || null,
        excludeEntityIds: localIds,
      });
      if (groupMatches.length > 0) allContactMatches.push(...groupMatches);

      if (allContactMatches.length > 0) {
        setContactDuplicateMatches(allContactMatches);
        setPendingContactData({ entityId: contactEntityId, displayName: contactDisplayName, email: contactEmail || '', phone: contactPhone || '', phoneCountryCode: contactPhoneCode || '+351', vat: contactVat || '', firstName: contactFirstName, lastName: contactLastName, entityType: contactEntityType as 'person'|'organization', roleStatus, organizationId, internalUserId, contactType });
        setContactDuplicateDialogOpen(true);
        setSavingContact(false);
        submitLockRef.current = false;
        return;
      }

      // Sem duplicado — agora sim podemos sincronizar o display_name na entidade reutilizada.
      if (contactEntityResolved) {
        await supabase.from("anew_entities").update({ display_name: contactDisplayName, first_name: contactFirstName, last_name: contactLastName } as any).eq("id", contactEntityId);
      }
      // No duplicate — proceed with creation.
      // M1 — single transactional RPC: guarantees the contact never persists
      // without its role. Any RPC error is treated as a total creation failure.
      const { error: createRpcError } = await supabase.rpc('create_contact_with_role', {
        p_payload: {
          entityId: contactEntityId,
          organizationId,
          rootOrganizationId: resolvedRootOrgId || organizationId,
          displayName: contactDisplayName,
          entityType: contactEntityType,
          firstName: contactFirstName,
          lastName: contactLastName,
          email: contactEmail || null,
          phone: contactPhone || null,
          phoneCountryCode: contactPhoneCode || null,
          vat: contactVat || null,
          status: roleStatus,
          sourceType: "manual",
          assignedTo: null,
        },
      });
      if (createRpcError) throw createRpcError;
      if (addressData.postal_code || addressData.street || addressData.city) {
        // Use shared sanitizer-aware helper to prevent placeholders ("N/A", "0000-000")
        // from being persisted. Helper is a no-op when data lacks core minimum.
        try {
          await syncEntityPrimaryAddressFromLead({
            supabase,
            entityId: contactEntityId,
            fieldValues: {
              street: addressData.street,
              postal_code: addressData.postal_code,
              city: addressData.city,
              district: addressData.district,
            },
            actorId: internalUserId,
            allowOverwriteValid: false,
          });
        } catch (addrErr) {
          console.warn("[contact-address-sync] non-fatal:", addrErr);
        }
      }

      toast({ title: t('contacts.toast.createSuccess') });
      setOpen(false); setContactType("person");
      setFormData({ first_name:"", last_name:"", email:"", phone:"", phone_country_code:"+351", vat:"", position:"", status:"active" });
      setCompanyFormData({ name:"", email:"", phone:"", phone_country_code:"+351", vat:"", website:"", industry:"", status:"active" });
      setAddressData({ street:"", number:"", floor_number:"", city:"", postal_code:"", district:"", municipality:"", is_primary: true });
      setFieldErrors({});
      setContacts([]); setHasMore(true); loadContacts(0, true); setDashboardKey(prev=>prev+1);
    } catch (error: any) { toast({ title: t('contacts.toast.createError'), description: error.message, variant: "destructive" }); }
    } finally { submitLockRef.current = false; setSavingContact(false); }
  };

  // Duplicate contact handlers
  const handleContactDuplicateOpenExisting = (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    setContactDuplicateDialogOpen(false);
    setOpen(false);
    setPendingContactData(null);
    setContactDuplicateMatches([]);
    if (match.type === "lead") {
      navigate(`/leads?open=${match.id}`);
      return;
    }
    if (match.type === "client") {
      navigate(`/clients?open=${match.id}`);
      return;
    }
    // Contact — open in current page
    const existingContact = contacts.find(c => c.id === match.id);
    if (existingContact) {
      setSelectedContact(existingContact);
      setDetailsOpen(true);
    } else {
      (async () => {
        const { data } = await (supabase as any).from("anew_contacts").select("*, anew_entities!anew_contacts_entity_id_fkey(*)").eq("id", match.id).single();
        if (data) {
          setSelectedContact(data);
          setDetailsOpen(true);
        } else {
          toast({ title: "Contacto encontrado", description: `O contacto "${match.displayName}" já existe. Pesquise na lista.` });
        }
      })();
    }
  };

  const handleContactDuplicateUpdateExisting = async (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    if (!pendingContactData) return;
    setSavingContact(true);
    try {
      const { error: updContactErr } = await supabase.from("anew_contacts").update({ status: pendingContactData.roleStatus, organization_id: pendingContactData.organizationId } as any).eq("id", match.id);
      if (updContactErr) throw updContactErr;
      const { error: updRoleErr } = await supabase.from("anew_entity_roles").update({ status: pendingContactData.roleStatus } as any).eq("entity_id", pendingContactData.entityId).eq("role", "contact").eq("organization_id", pendingContactData.organizationId);
      if (updRoleErr) throw updRoleErr;
      toast({ title: "Contacto atualizado", description: `Os dados do contacto "${match.displayName}" foram atualizados.` });
      setContactDuplicateDialogOpen(false); setOpen(false); setPendingContactData(null); setContactDuplicateMatches([]);
      setContacts([]); setHasMore(true); loadContacts(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally { setSavingContact(false); }
  };

  const handleContactDuplicateCreateAnyway = async () => {
    if (!pendingContactData) return;
    // Pre-write DB revalidation (strict mode).
    try {
      const revalidation = await revalidateStrongDuplicatesBeforeWrite({
        orgId: pendingContactData.organizationId,
        email: pendingContactData.email || null,
        phone: pendingContactData.phone || null,
        vat: pendingContactData.vat || null,
      });
      if (revalidation.shouldBlock) {
        toast({
          title: "Duplicado confirmado",
          description: "Este contacto passou a colidir com outro registo nesta organização.",
          variant: "destructive",
        });
        setContactDuplicateMatches(revalidation.matches);
        setContactDuplicateDialogOpen(true);
        return;
      }
    } catch (revErr) {
      console.warn('[contact-create-anyway] pre-write revalidation failed (non-fatal)', revErr);
    }
    setContactDuplicateDialogOpen(false);
    setSavingContact(true);
    try {
      // "Create anyway" = user explicitly wants a SEPARATE record.
      // M1 — single transactional RPC creates a brand-new entity (entityId
      // omitted) + contact + role atomically, guaranteeing the contact never
      // persists without its role. Any RPC error is a total creation failure.
      const { error: createAnywayRpcError } = await supabase.rpc('create_contact_with_role', {
        p_payload: {
          entityId: null,
          organizationId: pendingContactData.organizationId,
          rootOrganizationId: resolvedRootOrgId || pendingContactData.organizationId,
          displayName: pendingContactData.displayName,
          entityType: pendingContactData.entityType,
          firstName: pendingContactData.firstName,
          lastName: pendingContactData.lastName,
          email: pendingContactData.email || null,
          phone: pendingContactData.phone || null,
          phoneCountryCode: pendingContactData.phoneCountryCode || null,
          vat: pendingContactData.vat || null,
          status: pendingContactData.roleStatus,
          sourceType: "manual",
          assignedTo: null,
        },
      });
      if (createAnywayRpcError) throw createAnywayRpcError;
      toast({ title: t('contacts.toast.createSuccess') });
      setOpen(false); setPendingContactData(null); setContactDuplicateMatches([]);
      setContacts([]); setHasMore(true); loadContacts(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: t('contacts.toast.createError'), description: err.message, variant: "destructive" });
    } finally { setSavingContact(false); }
  };

  const handleContactDuplicateShareWithOrg = async (match: import("@/components/shared/DuplicateEntityDialog").DuplicateMatch) => {
    if (!pendingContactData) return;
    setSavingContact(true);
    try {
      await linkEntityToOrg(match.entityId, pendingContactData.organizationId);
      // M1 — single transactional RPC reusing the shared entity_id: creates
      // the contact + role atomically, guaranteeing the contact never
      // persists without its role. Any RPC error is a total creation failure.
      const { error: shareRpcError } = await supabase.rpc('create_contact_with_role', {
        p_payload: {
          entityId: match.entityId,
          organizationId: pendingContactData.organizationId,
          rootOrganizationId: resolvedRootOrgId || pendingContactData.organizationId,
          displayName: pendingContactData.displayName,
          entityType: pendingContactData.entityType,
          firstName: pendingContactData.firstName,
          lastName: pendingContactData.lastName,
          email: pendingContactData.email || null,
          phone: pendingContactData.phone || null,
          phoneCountryCode: pendingContactData.phoneCountryCode || null,
          vat: pendingContactData.vat || null,
          status: pendingContactData.roleStatus,
          sourceType: "manual",
          assignedTo: null,
        },
      });
      if (shareRpcError) throw shareRpcError;
      toast({ title: "Contacto criado a partir de entidade do grupo" });
      setContactDuplicateDialogOpen(false); setOpen(false); setPendingContactData(null); setContactDuplicateMatches([]);
      setContacts([]); setHasMore(true); loadContacts(0, true); setDashboardKey(prev => prev + 1);
    } catch (err: any) {
      toast({ title: "Não foi possível partilhar a entidade", description: err.message, variant: "destructive" });
    } finally { setSavingContact(false); }
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "inactive": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleExport = async () => {
    try {
      const MAX_EXPORT_RECORDS = 10_000;
      if (viewScope === "NONE") { toast({ title: t('contacts.export.noData'), variant: "destructive" }); return; }

      let query = supabase
        .from("anew_contacts")
        .select("entity_id, status, organization_id, assigned_to, created_by")
        .is("deleted_at", null)
        .is("converted_to_client_id", null);
      if (effectiveOrgIds.length > 0) query = query.in("organization_id", effectiveOrgIds);
      else if (activeCompany?.id) query = query.eq("organization_id", activeCompany.id);

      // H2 — apply the same OWNED/TEAM scope as the main listing; exporting
      // must never surface records outside the user's effective scope.
      const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
      if (scopeFilter) query = query.or(scopeFilter);

      const { data, error } = await query.limit(MAX_EXPORT_RECORDS);
      if (error) throw error;

      const scopedData = (data || []).filter((r) => contactMatchesScope(r as any, currentScopeOptions));
      if (scopedData.length === 0) { toast({ title: t('contacts.export.noData'), variant: "destructive" }); return; }
      if (scopedData.length === MAX_EXPORT_RECORDS) { toast({ title: "Export limitado", description: `O export foi limitado a ${MAX_EXPORT_RECORDS.toLocaleString()} registos.`, variant: "default" }); }

      const entityIds = scopedData.map((r: any) => r.entity_id).filter(Boolean);
      let identityMap: Record<string, any> = {};
      if (entityIds.length > 0) identityMap = await resolveEntities(entityIds);

      // H4 — use the single CSV schema shared with the importer.
      const csvContent = serializeContactsCsv(scopedData.map((r: any) => {
        const id = identityMap[r.entity_id];
        const entityType: "person" | "organization" = id?.type === "organization" ? "organization" : "person";
        return {
          entityType,
          firstName: entityType === "person" ? (id?.first_name || "") : "",
          lastName: entityType === "person" ? (id?.last_name || "") : "",
          companyName: entityType === "organization" ? (id?.display_name || "") : "",
          email: id?.email || "",
          phone: id?.phone || "",
          vat: id?.vat || "",
          status: r.status || "active",
        };
      }));
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.setAttribute("href", URL.createObjectURL(blob));
      link.setAttribute("download", `contacts_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: t('contacts.export.success'), description: t('contacts.export.successDesc', { count: scopedData.length }) });
    } catch (error: any) { toast({ title: t('contacts.export.error'), description: error.message, variant: "destructive" }); }
  };

  const handleImport = async () => {
    if (!importFile) { toast({ title: t('contacts.import.noFile'), variant: "destructive" }); return; }
    try {
      const text = await importFile.text();
      // H4 - single CSV schema/parser shared with the exporter.
      const contactsToImport = parseContactsCsv(text);
      if (contactsToImport.length === 0) { toast({ title: t('contacts.import.invalid'), variant: "destructive" }); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      let importedCount = 0;
      let skippedCount = 0;
      const orgId = activeCompany?.id || '';
      for (const c of contactsToImport) {
        const entityId = await resolveEntityByIdentity({ email: c.email || null, phone: c.phone || null, vat: c.vat || null });
        if (entityId) {
          // Check for existing active records in this org (leads, contacts, clients)
          const [{ data: exContacts }, { data: exLeads }, { data: exClients }] = await Promise.all([
            supabase.from("anew_contacts").select("id").eq("entity_id", entityId).eq("organization_id", orgId).not("status", "eq", "inactive").limit(1),
            (supabase as any).from("anew_leads").select("id").eq("entity_id", entityId).eq("organization_id", orgId).not("status", "in", '("converted","lost","rejected")').limit(1),
            supabase.from("anew_clients").select("id").eq("entity_id", entityId).eq("organization_id", orgId).not("status", "eq", "inactive").limit(1),
          ]);
          if ((exContacts && exContacts.length > 0) || (exLeads && exLeads.length > 0) || (exClients && exClients.length > 0)) {
            skippedCount++;
            continue;
          }
        }

        // M1 - single transactional RPC: creates entity (if needed) + contact + role
        // atomically, guaranteeing the contact never persists without its role.
        const { error: rpcError } = await supabase.rpc('create_contact_with_role', {
          p_payload: {
            entityId: entityId || null,
            organizationId: orgId,
            rootOrganizationId: resolvedRootOrgId || orgId,
            displayName: c.displayName || null,
            entityType: c.entityType,
            firstName: c.firstName || null,
            lastName: c.lastName || null,
            email: c.email || null,
            phone: c.phone || null,
            vat: c.vat || null,
            status: c.status || "active",
            sourceType: "import",
            assignedTo: null,
          },
        });
        if (rpcError) {
          console.error('[import] create_contact_with_role failed', rpcError);
          skippedCount++;
          continue;
        }
        importedCount++;
      }
      const importDesc = skippedCount > 0
        ? `${importedCount} importados, ${skippedCount} ignorados por duplicacao ou erro`
        : t('contacts.import.successDesc', { count: importedCount });
      toast({ title: t('contacts.import.success'), description: importDesc });
      setImportDialogOpen(false); setImportFile(null); setContacts([]); setHasMore(true); loadContacts(0, true);
    } catch (error: any) { toast({ title: t('contacts.import.failed'), description: error.message, variant: "destructive" }); }
  };

  const openContactDetails = async (contact: ContactRecord) => {
    let targetContact = contact;
    let identity = getIdentity(contact.entity_id);

    if (!identity) {
      const { data: fetchedContact } = await supabase
        .from("anew_contacts")
        .select("id, entity_id, organization_id, root_organization_id, status, position, source_type, source_lead_id, assigned_to, notes, created_at, created_by, last_interaction_at, converted_to_client_id, updated_at")
        .or(`id.eq.${contact.id},entity_id.eq.${contact.entity_id}`)
        .maybeSingle();

      if (fetchedContact) {
        targetContact = fetchedContact as ContactRecord;
      }

      const resolved = await resolveEntities([targetContact.entity_id]);
      identity = resolved[targetContact.entity_id] || getIdentity(targetContact.entity_id);
    }

    const displayName = identity?.display_name || '';
    const fallbackNameParts = displayName.split(' ');
    setSelectedContact({
      ...targetContact,
      first_name: identity?.first_name || fallbackNameParts[0] || '', last_name: identity?.last_name || fallbackNameParts.slice(1).join(' ') || '',
      email: identity?.email || '', phone: identity?.phone || '', phone_country_code: identity?.phone_country_code || '+351',
      vat: identity?.vat || '', position: (targetContact as any).position || '',
    });
    setDetailsOpen(true);
  };

  // Loading state is now shown inline in the table area instead of blocking the whole page

  return (
    <>
      {companyLoading ? (
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      ) : !activeCompany ? (
        <div className="space-y-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('contacts.title')}</h1><p className="text-muted-foreground">{t('contacts.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      ) : (
      <div className="space-y-4">
        <ModuleAlertsBanner
          alerts={personalizedContactAlerts}
          onDismiss={dismissContactAlert}
          onAlertClick={async (alert) => {
            const alertRef = (alert.action_config as any)?.entity_id || alert.entity_id || (alert.action_config as any)?.contact_id;
            if (!alertRef) return;

            const contactPool = (allContacts.length > 0 ? allContacts : contacts);
            const found = findScopedContactByRef(contactPool, alertRef, currentScopeOptions);

            if (found) {
              await openContactDetails(found);
              return;
            }

            if (viewScope === "NONE") return;

            // Apply the same org + OWNED/TEAM scope as the main listing —
            // never fall back to an unscoped query (see M2 audit finding).
            const scopeFilter = buildContactScopeOrFilter(viewScope, scopedUserIds);
            let query = supabase
              .from("anew_contacts")
              .select("*")
              .or(`id.eq.${alertRef},entity_id.eq.${alertRef}`)
              .is("deleted_at", null)
              .is("converted_to_client_id", null);
            if (effectiveOrgIds.length > 0) query = query.in("organization_id", effectiveOrgIds);
            if (scopeFilter) query = query.or(scopeFilter);
            const { data: rows } = await query.limit(1);

            if (rows && rows[0]) await openContactDetails(rows[0] as ContactRecord);
          }}
        />

        {/* Alert Bar - server-side counts, stable */}
        {serverAlertCounts && (
          <ContactsAlertBar alerts={[
            { key: "noContact", label: `sem contacto há >14 dias`, count: alertData.noContact14d, color: "bg-destructive", action: () => { setSmartFilter(false); setHealthFilter([]); setNoContact14dFilter(true); } },
            { key: "noDeal", label: "sem pedido criado", count: alertData.noDeal, color: "bg-warning", action: () => { setDealsFilter("without"); } },
            { key: "unassigned", label: "sem atribuição", count: alertData.unassigned, color: "bg-muted-foreground", action: () => {} },
          ]} />
        )}

        {/* Header + View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">{t('contacts.title')}</h1>
            {/* Inline summary badges */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              <span>● Total: <strong className="text-foreground">{kpiData.total}</strong></span>
              <span className="text-green-600">● Ativos: <strong>{kpiData.active}</strong></span>
              <span className="text-red-500">● Inativos: <strong>{kpiData.inactive}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border bg-muted p-0.5">
              {([
                { view: "list" as const, icon: List, label: "Lista" },
                { view: "dashboard" as const, icon: BarChart3, label: "Dashboard" },
                { view: "scoring" as const, icon: Target, label: "Scoring" },
                // Relations view hidden until contacts have org/deal links
                // { view: "relations" as const, icon: Network, label: "Relações" },
              ]).map(v => (
                <button key={v.view} onClick={() => setActiveView(v.view)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    activeView === v.view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}>
                  <v.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
            <PermissionGate permission="contacts.export">
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-3.5 h-3.5" /></Button>
            </PermissionGate>
            <PermissionGate permission="contacts.import">
              <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}><Upload className="w-3.5 h-3.5" /></Button>
            </PermissionGate>
            <PermissionGate permission="contacts.create">
              <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" />Novo</Button>
            </PermissionGate>
          </div>
        </div>

        {/* Insight Banner */}
        <ContactsInsightBanner
          contacts={insightContacts}
          onCreateDeals={() => { navigate(`/deals?newDeal=true`); }}
          onViewList={() => { setDealsFilter("without"); setHealthFilter(["excellent", "good"]); }}
        />

        {/* KPIs Row */}
        <div className="grid grid-cols-5 gap-2">
          {([
            { label: "TOTAL", value: kpiData.total, icon: Users, sub: null, clickAction: () => { clearAllFilters(); }, iconColor: "text-primary" },
            { label: "PIPELINE", value: formatCurrency(kpiData.pipeline), icon: DollarSign, sub: `${kpiData.withPipeline} em pipeline`, clickAction: () => { setDealsFilter("with"); }, iconColor: "text-purple-600" },
            { label: "SEM PEDIDO", value: kpiData.withoutDeals, icon: Handshake, sub: null, clickAction: () => { setDealsFilter("without"); }, danger: kpiData.withoutDeals > 0, iconColor: "text-orange-600" },
            { label: "SEM CONTACTO >7D", value: kpiData.noContact7d, icon: AlertTriangle, sub: null, clickAction: () => { setSmartFilter(true); }, danger: kpiData.noContact7d > 0, iconColor: "text-red-600" },
            { label: "SAÚDE MÉDIA", value: `${kpiData.avgHealth}/100`, icon: Heart, sub: null, clickAction: () => { setActiveView("scoring"); }, iconColor: kpiData.avgHealth >= 60 ? "text-green-600" : kpiData.avgHealth >= 40 ? "text-yellow-600" : "text-red-600" },
          ] as Array<{label: string; value: string|number; icon: any; sub: string|null; clickAction: () => void; danger?: boolean; iconColor: string}>).map(kpi => {
            const card = (
              <button key={kpi.label} onClick={kpi.clickAction}
                className="bg-card rounded-xl border p-3.5 min-w-[120px] flex-1 transition-all cursor-pointer hover:shadow-md hover:border-primary/30 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                  <kpi.icon className={cn("h-3.5 w-3.5 opacity-60", kpi.danger ? "text-destructive" : (kpi.iconColor || "text-primary"))} />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tracking-tight">{kpi.value}</span>
                </div>
                {kpi.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>}
              </button>
            );
            if (kpi.label === "SAÚDE MÉDIA") {
              return (
                <TooltipProvider key={kpi.label} delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>{card}</TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs p-3 text-xs leading-relaxed">
                      <div>
                        <p className="font-semibold mb-1">📊 Como é calculada?</p>
                        <p>Score de 0-100 baseado em 4 fatores:</p>
                        <ul className="list-disc ml-3 mt-1 space-y-0.5">
                          <li><strong>Último contacto</strong> — até 25 pts (≤3d=25, ≤7d=20, ≤14d=15, ≤30d=10)</li>
                          <li><strong>Pipeline</strong> — até 15 pts (Deal=15, Proposta=12, Orçamento=8)</li>
                          <li><strong>Dados completos</strong> — até 10 pts (email=4, telefone=4, NIF=2)</li>
                          <li><strong>Frequência 30d</strong> — até 10 pts (≥5 interações=10)</li>
                        </ul>
                        <p className="mt-2 font-semibold">🎯 Para que serve?</p>
                        <p>Identifica contactos que precisam de atenção. Abaixo de 40 é considerado "Em Risco".</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }
            return card;
          })}
        </div>

        {/* Filters (visible for list view) */}
        {activeView === "list" && (
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Pesquisar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>

                {/* Only mine toggle */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Meus</span>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={onlyMine} onCheckedChange={setOnlyMine} className="scale-75" />
                    <span className={cn("text-xs font-medium", onlyMine ? "text-primary" : "text-muted-foreground")}>Só os meus</span>
                  </div>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Estado</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativos</SelectItem>
                      <SelectItem value="inactive">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Pedidos</span>
                  <Select value={dealsFilter} onValueChange={setDealsFilter}>
                    <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue placeholder="Pedidos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="with">Com pedido</SelectItem>
                      <SelectItem value="without">Sem pedido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Sentimento</span>
                  <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Sentimento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="positive">😊 Positivo</SelectItem>
                      <SelectItem value="neutral">😐 Neutro</SelectItem>
                      <SelectItem value="negative">😟 Negativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Commercial filter */}
                {companyUsers.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Comercial</span>
                    <Select value={commercialFilter} onValueChange={setCommercialFilter}>
                      <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Comercial" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {companyUsers.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {orgOptions.length > 1 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Organização</span>
                    <Select value={companyFilter} onValueChange={setCompanyFilter}>
                      <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Organização" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {orgOptions.map(org => (<SelectItem key={org.id} value={org.id}>{"\u00A0".repeat(org.depth * 2)}{org.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Smart filter chip */}
                <button onClick={() => setSmartFilter(!smartFilter)}
                  className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                    smartFilter ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  <Zap className="h-3 w-3" />Precisam de atenção
                  {smartFilter && <X className="h-3 w-3 ml-0.5" onClick={(e) => { e.stopPropagation(); setSmartFilter(false); }} />}
                </button>

                {/* No-contact >14d chip */}
                {noContact14dFilter && (
                  <button onClick={() => setNoContact14dFilter(false)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border bg-destructive text-destructive-foreground border-destructive">
                    Sem contacto &gt;14d
                    <X className="h-3 w-3 ml-0.5" />
                  </button>
                )}

                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <X className="h-3 w-3" />Limpar ({activeFilterCount})
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <Badge variant="secondary" className="text-xs">{selectedIds.size} seleccionados</Badge>
              <PermissionGate permission="contacts.edit">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkStatusDialogOpen(true)}>Mudar estado</Button>
              </PermissionGate>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { /* bulk email */ }}>
                <Mail className="w-3 h-3 mr-1" />Email
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                const firstEntity = contacts.find(c => selectedIds.has(c.id))?.entity_id;
                if (firstEntity) { setTagsEntityId(firstEntity); setTagsEntityName("Seleccionados"); setTagsDialogOpen(true); }
              }}>
                <Tag className="w-3 h-3 mr-1" />Tags
              </Button>
              <PermissionGate permission="contacts.delete">
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setBulkDeleteDialogOpen(true)}>
                  <Trash2 className="w-3 h-3 mr-1" />Eliminar
                </Button>
              </PermissionGate>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground ml-auto">Limpar</button>
            </CardContent>
          </Card>
        )}

        {/* View Content */}
        {activeView === "dashboard" && (
          allContactsLoading && allContacts.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <OlyviaLoader size={28} text="A carregar dashboard completo..." />
            </div>
          ) : (
            <ContactsFullDashboard
              contacts={allContacts.length > 0 ? allContacts : filteredContacts}
              interactionCounts={interactionCounts}
              lastInteractions={lastInteractions}
              dealsData={dealsData}
              proposalsData={proposalsData}
              quotesData={quotesData}
              assignedUserMap={assignedUserMap}
              getIdentity={getIdentity}
            />
          )
        )}

        {activeView === "scoring" && (
          allContactsLoading && allContacts.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <OlyviaLoader size={28} text="A carregar dados..." />
            </div>
          ) : (
            <ContactsScoringView
              contacts={allContacts.length > 0 ? allContacts : filteredContacts}
              interactionCounts={interactionCounts}
              lastInteractions={lastInteractions}
              dealsData={dealsData}
              assignedUserMap={assignedUserMap}
              getIdentity={getIdentity}
              onContactClick={openContactDetails}
            />
          )
        )}

        {activeView === "relations" && (
          allContactsLoading && allContacts.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <OlyviaLoader size={28} text="A carregar dados..." />
            </div>
          ) : (
            <ContactsRelationsMap
              contacts={allContacts.length > 0 ? allContacts : filteredContacts}
              interactionCounts={interactionCounts}
              lastInteractions={lastInteractions}
              dealsData={dealsData}
              getIdentity={getIdentity}
              onContactClick={openContactDetails}
            />
          )
        )}

        {activeView === "list" && (
          <>
            {(loading && filteredContacts.length === 0) || (noContact14dFilter && allContactsLoading && allContacts.length === 0) ? (
              <Card>
                <CardContent className="py-12">
                  <div className="animate-pulse space-y-3">
                    <div className="h-8 bg-muted rounded w-full" />
                    <div className="h-8 bg-muted rounded w-full" />
                    <div className="h-8 bg-muted rounded w-full" />
                    <div className="h-8 bg-muted rounded w-full" />
                    <div className="h-8 bg-muted rounded w-full" />
                  </div>
                </CardContent>
              </Card>
            ) : filteredContacts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <User className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{t('contacts.noContacts')}</h3>
                  <p className="text-muted-foreground mb-4">{t('contacts.createFirst')}</p>
                  <PermissionGate permission="contacts.create">
                    <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />{t('contacts.newContact')}</Button>
                  </PermissionGate>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="flex flex-col" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                  <div className="flex-1 min-h-0 overflow-auto leads-table-scroll">
                    <Table density="compact" className="min-w-[1200px]" containerClassName="overflow-visible">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[36px]">
                            <Checkbox checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0} onCheckedChange={toggleSelectAll} />
                          </TableHead>
                          <TableHead className="w-[50px]">Saúde</TableHead>
                          <TableHead className="w-[36px]" />
                          <TableHead>Nome</TableHead>
                          <TableHead>Pipeline</TableHead>
                          <TableHead>Tags</TableHead>
                          <TableHead>Sentimento</TableHead>
                          <TableHead>Comercial</TableHead>
                          <TableHead>Último contacto</TableHead>
                          <TableHead className="text-right w-[100px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContacts.map((contact) => {
                          const identity = getIdentity(contact.entity_id);
                          const healthScore = getHealthScore(contact.entity_id, contact.last_interaction_at);
                          const contactDeals = dealsData[contact.entity_id];
                          const contactProposals = proposalsData[contact.entity_id];
                          const contactQuotes = quotesData[contact.entity_id];
                          const contactTags = tagsData[contact.entity_id] || [];
                          const sentiment = lastSentiments[contact.entity_id];
                          const hasPipeline = !!(contactDeals?.count || contactProposals?.count || contactQuotes?.count);
                          return (
                            <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openContactDetails(contact)}>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selectedIds.has(contact.id)} onCheckedChange={() => toggleSelectOne(contact.id)} />
                              </TableCell>
                              {/* Health Score - larger circle */}
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className={cn("flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold text-white",
                                      healthScore.level === 'excellent' ? 'bg-green-500' :
                                      healthScore.level === 'good' ? 'bg-blue-500' :
                                      healthScore.level === 'attention' ? 'bg-yellow-500' :
                                      healthScore.level === 'at_risk' ? 'bg-orange-500' : 'bg-red-500'
                                    )}>
                                      {healthScore.score}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p className="font-semibold mb-1">{healthScore.label}</p>
                                    <p>Contacto: {healthScore.breakdown.lastContact}/25</p>
                                    <p>Pipeline: {healthScore.breakdown.dealActivity}/15</p>
                                    <p>Dados: {healthScore.breakdown.dataCompleteness}/10</p>
                                    <p>Freq: {healthScore.breakdown.interactionFrequency}/10</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              {/* Avatar */}
                              <TableCell>
                                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium",
                                  identity?.type === 'organization' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-primary/10 text-primary'
                                )}>
                                  {identity?.type === 'organization' ? <Building2 className="h-3.5 w-3.5" /> :
                                    (identity?.display_name || "?").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()
                                  }
                                </div>
                              </TableCell>
                              {/* Name + email + phone */}
                              <TableCell>
                                <div>
                                  <span className="font-medium text-sm">{identity?.display_name || "—"}</span>
                                  {identity?.email && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{identity.email}</p>}
                                </div>
                              </TableCell>
                              {/* Pipeline: Deals + Proposals + Quotes */}
                              <TableCell>
                                {hasPipeline ? (
                                  <div className="flex flex-col gap-0.5">
                                    {contactDeals && contactDeals.count > 0 && (
                                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit">
                                        <Handshake className="h-3 w-3 mr-1" />
                                        {contactDeals.count} pedido{contactDeals.count > 1 ? 's' : ''} · {formatCurrency(contactDeals.value)}
                                      </Badge>
                                    )}
                                    {contactProposals && contactProposals.count > 0 && (
                                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                                        <FileText className="h-3 w-3 mr-1" />
                                        {contactProposals.count} proposta{contactProposals.count > 1 ? 's' : ''} · {formatCurrency(contactProposals.value)}
                                        {contactProposals.valueWithIva > 0 && contactProposals.valueWithIva !== contactProposals.value ? ` (c/ IVA: ${formatCurrency(contactProposals.valueWithIva)})` : ''}
                                      </Badge>
                                    )}
                                    {contactQuotes && contactQuotes.count > 0 && (
                                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                                        <ScrollText className="h-3 w-3 mr-1" />
                                        {contactQuotes.count} orçamento{contactQuotes.count > 1 ? 's' : ''} · {formatCurrency(contactQuotes.value)}{contactQuotes.valueWithIva > 0 && contactQuotes.valueWithIva !== contactQuotes.value ? ` (c/ IVA: ${formatCurrency(contactQuotes.valueWithIva)})` : ''}
                                      </Badge>
                                    )}
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              {/* Tags */}
                              <TableCell>
                                <div className="flex flex-wrap gap-0.5 max-w-[100px]">
                                  {contactTags.slice(0, 2).map(t => (
                                    <Badge key={t.id} className={`${getTagColorClass(t.color)} text-[9px] px-1 py-0`}>{t.tag}</Badge>
                                  ))}
                                  {contactTags.length > 2 && <span className="text-[9px] text-muted-foreground">+{contactTags.length - 2}</span>}
                                </div>
                              </TableCell>
                              {/* Sentiment */}
                              <TableCell className="text-center">
                                {sentiment ? (
                                  <span className="text-base">{sentiment === 'positive' ? '😊' : sentiment === 'negative' ? '😟' : '😐'}</span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              {/* Commercial */}
                              <TableCell>
                                {(() => {
                                  const commercialId = contact.assigned_to || dealCommercialMap[contact.entity_id];
                                  const commercialName = commercialId ? assignedUserMap.get(commercialId) : null;
                                  if (commercialName) {
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                                          {commercialName[0]}
                                        </div>
                                        <span className="text-xs truncate max-w-[80px]">{commercialName}</span>
                                      </div>
                                    );
                                  }
                                  return <span className="text-xs text-muted-foreground">—</span>;
                                })()}
                              </TableCell>
                              {/* Last contact */}
                              <TableCell>
                                {(() => {
                                  const lastDate = lastInteractions[contact.entity_id] || contact.last_interaction_at;
                                  if (!lastDate) return (<div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400"><AlertTriangle className="h-3.5 w-3.5" /><span className="text-xs">Sem contacto</span></div>);
                                  const days = differenceInDays(new Date(), new Date(lastDate));
                                  const relative = formatDistanceToNow(new Date(lastDate), { addSuffix: true, locale: pt });
                                  const colorClass = days <= 3 ? 'text-green-600 dark:text-green-400' : days <= 7 ? 'text-yellow-600 dark:text-yellow-400' : 'text-destructive';
                                  return (<div className={cn("flex items-center gap-1 text-xs font-medium", colorClass)}>
                                    <Clock className="h-3 w-3" /><span>{relative}</span>
                                  </div>);
                                })()}
                              </TableCell>
                              {/* Actions */}
                              <TableCell className="text-right">
                                <div className="flex gap-0.5 justify-end">
                                    {identity?.phone && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                                          e.stopPropagation();
                                          setWhatsAppContext({
                                            module: "contacts",
                                            recipientName: identity?.display_name || "",
                                            recipientPhone: identity?.phone || "",
                                            contactId: contact.id,
                                            entityId: contact.entity_id,
                                            hasActiveDeal: !!dealsData[contact.entity_id]?.count,
                                          });
                                          setShowWhatsAppDialog(true);
                                        }}>
                                          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>WhatsApp</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <PermissionGate permission="calendar.create">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => openScheduleDialog(contact, e)}>
                                      <CalendarPlus className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  </PermissionGate>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52">
                                      <DropdownMenuLabel className="text-xs text-muted-foreground">Ações</DropdownMenuLabel>
                                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openContactDetails(contact); }}><Eye className="w-3.5 h-3.5 mr-2" />Ver detalhes</DropdownMenuItem>
                                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); const id = getIdentity(contact.entity_id); setEmailTarget({ id: contact.id, name: id?.display_name || "", email: id?.email || "" }); setShowEmailDialog(true); }}><Mail className="w-3.5 h-3.5 mr-2" />Enviar email</DropdownMenuItem>
                                      {identity?.phone && (
                                        <DropdownMenuItem onClick={(e) => {
                                          e.stopPropagation();
                                          setWhatsAppContext({
                                            module: "contacts",
                                            recipientName: identity?.display_name || "",
                                            recipientPhone: identity?.phone || "",
                                            contactId: contact.id,
                                            entityId: contact.entity_id,
                                            hasActiveDeal: !!dealsData[contact.entity_id]?.count,
                                          });
                                          setShowWhatsAppDialog(true);
                                        }}><MessageCircle className="w-3.5 h-3.5 mr-2" />WhatsApp</DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={(e) => {
                                          e.stopPropagation();
                                          const phone = identity?.phone;
                                          const cc = identity?.phone_country_code || "+351";
                                          if (phone) {
                                            const a = document.createElement("a"); a.href = `tel:${cc}${phone}`.replace(/\s/g, ""); a.click();
                                            setTimeout(() => { setCallEntityId(contact.entity_id); setCallEntityName(identity?.display_name || ""); setCallContactId(contact.id); setCallDialogOpen(true); }, 600);
                                          }
                                        }} disabled={!identity?.phone}><PhoneCall className="w-3.5 h-3.5 mr-2" />{identity?.phone ? `Ligar para ${(identity.phone_country_code || "+351")}${identity.phone}` : "Sem número"}</DropdownMenuItem>
                                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCallEntityId(contact.entity_id); setCallEntityName(identity?.display_name || ""); setCallContactId(contact.id); setCallDialogOpen(true); }}><ClipboardList className="w-3.5 h-3.5 mr-2" />Registar atividade</DropdownMenuItem>
                                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/deals?newDeal=true&entityId=${contact.entity_id}&entityName=${encodeURIComponent(identity?.display_name || '')}`); }}><Handshake className="w-3.5 h-3.5 mr-2" />Novo Pedido de Proposta</DropdownMenuItem>
                                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setTagsEntityId(contact.entity_id); setTagsEntityName(identity?.display_name || ""); setTagsDialogOpen(true); }}><Tag className="w-3.5 h-3.5 mr-2" />Gerir tags</DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <PermissionGate permission="clients.create">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setContactToConvert(contact); setConvertDialogOpen(true); }}><UserPlus className="w-3.5 h-3.5 mr-2" />Converter em Cliente</DropdownMenuItem>
                                      </PermissionGate>
                                      {contact.source_lead_id && (
                                        <PermissionGate permission="contacts.edit">
                                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setContactToRevert(contact); setRevertDialogOpen(true); }}><Undo2 className="w-3.5 h-3.5 mr-2" />Reverter para Lead</DropdownMenuItem>
                                        </PermissionGate>
                                      )}
                                      <DropdownMenuSeparator />
                                      <PermissionGate permission="contacts.delete">
                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDeleteClick(contact, e)}><Trash2 className="w-3.5 h-3.5 mr-2" />Eliminar</DropdownMenuItem>
                                      </PermissionGate>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {/* Infinite scroll sentinel - inside scrollable container */}
                    <div ref={loadMoreRef} className="h-4" />
                    {loadingMore && (<div className="flex items-center justify-center py-6"><OlyviaLoader size={24} inline /><span className="ml-2 text-sm text-muted-foreground">{t('contacts.loadingMore')}</span></div>)}
                    {!loadingMore && !hasMore && contacts.length > 0 && (<div className="text-center text-xs text-muted-foreground py-2">{t('contacts.noMoreContacts')}</div>)}
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {/* All Dialogs (preserved) */}
        <ContactDetailsDialog contact={selectedContact} open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setSelectedContact(null); }} onContactUpdated={() => { loadContacts(0, true); setDashboardKey(prev=>prev+1); }} />

        {/* New Contact Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{t('contacts.newContact')}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contacts.contactType')}</h3>
                  <Tabs value={contactType} onValueChange={(v) => setContactType(v as "person"|"company")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="person"><User className="w-4 h-4 mr-2" />{t('contacts.person')}</TabsTrigger>
                      <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-2" />{t('contacts.company')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contacts.form.basicInfo')}</h3>
                  {contactType === "person" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>{t('contacts.form.firstName')}</Label><Input value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} required className={fieldErrors.first_name?"border-destructive":""} />{fieldErrors.first_name && <p className="text-sm text-destructive">{fieldErrors.first_name}</p>}</div>
                      <div className="space-y-2"><Label>{t('contacts.form.lastName')}</Label><Input value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} required className={fieldErrors.last_name?"border-destructive":""} />{fieldErrors.last_name && <p className="text-sm text-destructive">{fieldErrors.last_name}</p>}</div>
                      <div className="space-y-2"><Label>{t('contacts.form.email')}</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
                      <div className="space-y-2"><PhoneInput label={t('contacts.form.phone')} phoneValue={formData.phone} countryCodeValue={formData.phone_country_code} onPhoneChange={(v) => setFormData({...formData, phone: v})} onCountryCodeChange={(v) => setFormData({...formData, phone_country_code: v})} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.vat')}</Label><Input value={formData.vat} onChange={(e) => setFormData({...formData, vat: e.target.value})} placeholder={t('contacts.form.vatPlaceholder')} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.status')}</Label><Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t('contacts.status.active')}</SelectItem><SelectItem value="inactive">{t('contacts.status.inactive')}</SelectItem></SelectContent></Select></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 col-span-2"><Label>{t('contacts.form.companyName')}</Label><Input value={companyFormData.name} onChange={(e) => setCompanyFormData({...companyFormData, name: e.target.value})} required /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.email')}</Label><Input type="email" value={companyFormData.email} onChange={(e) => setCompanyFormData({...companyFormData, email: e.target.value})} /></div>
                      <div className="space-y-2"><PhoneInput label={t('contacts.form.phone')} phoneValue={companyFormData.phone} countryCodeValue={companyFormData.phone_country_code} onPhoneChange={(v) => setCompanyFormData({...companyFormData, phone: v})} onCountryCodeChange={(v) => setCompanyFormData({...companyFormData, phone_country_code: v})} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.vat')}</Label><Input value={companyFormData.vat} onChange={(e) => setCompanyFormData({...companyFormData, vat: e.target.value})} placeholder={t('contacts.form.vatPlaceholder')} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.website')}</Label><Input value={companyFormData.website} onChange={(e) => setCompanyFormData({...companyFormData, website: e.target.value})} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.industry')}</Label><Input value={companyFormData.industry} onChange={(e) => setCompanyFormData({...companyFormData, industry: e.target.value})} /></div>
                      <div className="space-y-2"><Label>{t('contacts.form.status')}</Label><Select value={companyFormData.status} onValueChange={(v) => setCompanyFormData({...companyFormData, status: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t('contacts.status.active')}</SelectItem><SelectItem value="inactive">{t('contacts.status.inactive')}</SelectItem></SelectContent></Select></div>
                    </div>
                  )}
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contacts.address.title')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{t('contacts.address.postalCode')}</Label><div className="flex gap-2"><Input value={addressData.postal_code} onChange={(e) => setAddressData({...addressData, postal_code: e.target.value})} placeholder={t('contacts.address.postalPlaceholder')} /><Button type="button" variant="outline" onClick={handlePostalCodeLookup} disabled={postalLoading || !addressData.postal_code}>{postalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('contacts.address.search')}</Button></div></div>
                    <div className="space-y-2"><Label>{t('contacts.address.street')}</Label><Input value={addressData.street} onChange={(e) => setAddressData({...addressData, street: e.target.value})} /></div>
                    <div className="space-y-2"><Label>{t('contacts.address.number')}</Label><Input value={addressData.number} onChange={(e) => setAddressData({...addressData, number: e.target.value})} /></div>
                    <div className="space-y-2"><Label>{t('contacts.address.floor')}</Label><Input value={addressData.floor_number} onChange={(e) => setAddressData({...addressData, floor_number: e.target.value})} /></div>
                    <div className="space-y-2"><Label>{t('contacts.address.city')}</Label><Input value={addressData.city} onChange={(e) => setAddressData({...addressData, city: e.target.value})} /></div>
                    <div className="space-y-2"><Label>{t('contacts.address.district')}</Label><Input value={addressData.district} onChange={(e) => setAddressData({...addressData, district: e.target.value})} /></div>
                    <div className="space-y-2"><Label>{t('contacts.address.municipality')}</Label><Input value={addressData.municipality} onChange={(e) => setAddressData({...addressData, municipality: e.target.value})} /></div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('contacts.form.cancel')}</Button>
                <Button type="submit" disabled={savingContact}>{savingContact ? t('common.creating') : t('contacts.form.save')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>{t('contacts.delete.confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('contacts.delete.description', { name: contactToDelete ? (getIdentity(contactToDelete.entity_id)?.display_name || '') : "" })}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t('contacts.form.cancel')}</AlertDialogCancel><AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('contacts.bulk.delete')}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Convert */}
        <AlertDialog open={convertDialogOpen} onOpenChange={(open) => { setConvertDialogOpen(open); if (!open) setContactToConvert(null); }}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><UserPlus className="h-4 w-4 text-primary" /></div>Converter em Cliente</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>Tem a certeza que deseja converter este contacto em cliente?</p>
                  {contactToConvert && (() => {
                    const identity = getIdentity(contactToConvert.entity_id);
                    return (<div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span className="font-medium text-foreground">{identity?.display_name || "—"}</span><Badge variant="outline" className="ml-auto text-xs">{identity?.type === "organization" ? "Empresa" : "Pessoa"}</Badge></div>
                      {identity?.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span>{identity.email}</span></div>}
                      {identity?.phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span>{identity.phone}</span></div>}
                    </div>);
                  })()}
                  <p className="text-xs text-muted-foreground">Esta ação irá ativar o papel de cliente e desativar o papel de contacto.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={converting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={converting} onClick={async () => {
                if (!contactToConvert || convertClientLockRef.current) return;
                convertClientLockRef.current = true;
                setConverting(true);
                try {
                  // H5 — single transactional RPC: any error is a total
                  // conversion failure, never a partial client/contact/role state.
                  const { data: convertResult, error: convertError } = await supabase.rpc('convert_contact_to_client', {
                    p_contact_id: contactToConvert.id,
                  });
                  if (convertError) throw convertError;

                  const reusedExistingClient = !!(convertResult as any)?.reused_existing_client;
                  toast({ title: "Convertido em Cliente", description: reusedExistingClient ? "Cliente existente reutilizado e contacto sincronizado." : "O contacto foi convertido em cliente com sucesso." });
                  cachedExcludeRef.current = null;
                  loadContacts(0, true); setDashboardKey(prev=>prev+1);
                } catch (err: any) { toast({ title: "Erro na conversão", description: err.message, variant: "destructive" }); }
                finally { convertClientLockRef.current = false; setConverting(false); setConvertDialogOpen(false); setContactToConvert(null); }
              }}>
                {converting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Revert to Lead */}
        <AlertDialog open={revertDialogOpen} onOpenChange={(open) => { setRevertDialogOpen(open); if (!open) setContactToRevert(null); }}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><Undo2 className="h-4 w-4 text-primary" /></div>
                Reverter para Lead
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta acção vai reverter este contacto para lead. O contacto será desactivado e a lead original será restaurada com o estado "qualified".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={reverting} onClick={async (e) => {
                e.preventDefault();
                if (!contactToRevert) return;
                setReverting(true);
                try {
                  const success = await revertLeadToContact(contactToRevert.id);
                  if (success) {
                    loadContacts(0, true);
                    setDashboardKey(prev => prev + 1);
                  }
                } finally {
                  setReverting(false);
                  setRevertDialogOpen(false);
                  setContactToRevert(null);
                }
              }}>
                {reverting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('contacts.import.dialogTitle')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>{t('contacts.import.csvFile')}</Label><Input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="mt-2" /><p className="text-sm text-muted-foreground mt-2">{t('contacts.import.format')}</p></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setImportDialogOpen(false); setImportFile(null); }}>{t('contacts.form.cancel')}</Button><Button onClick={handleImport} disabled={!importFile}><Upload className="w-4 h-4 mr-2" />{t('contacts.import')}</Button></div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Status */}
        <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('contacts.bulk.changeStatus')}</DialogTitle><DialogDescription>{t('contacts.bulk.statusDescription', { count: selectedIds.size })}</DialogDescription></DialogHeader>
            <div className="py-4"><Label>{t('contacts.bulk.newStatus')}</Label><Select value={bulkNewStatus} onValueChange={setBulkNewStatus}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t('contacts.status.active')}</SelectItem><SelectItem value="inactive">{t('contacts.status.inactive')}</SelectItem></SelectContent></Select></div>
            <DialogFooter><Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>{t('contacts.form.cancel')}</Button><Button onClick={handleBulkStatusChange}>{t('contacts.bulk.updateStatus')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Delete */}
        <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('contacts.bulk.deleteTitle')}</DialogTitle><DialogDescription>{t('contacts.bulk.deleteDescription', { count: selectedIds.size })}</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setBulkDeleteDialogOpen(false)}>{t('contacts.form.cancel')}</Button><Button variant="destructive" onClick={handleBulkDelete}>{t('contacts.bulk.delete')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule */}
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" />{t('contacts.schedule.title')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>{t('contacts.schedule.titleField')}</Label><Input value={scheduleFormData.title} onChange={(e) => setScheduleFormData({...scheduleFormData, title: e.target.value})} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t('contacts.schedule.type')}</Label><Select value={scheduleFormData.visit_type} onValueChange={(v) => setScheduleFormData({...scheduleFormData, visit_type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="meeting">{t('contacts.schedule.type.meeting')}</SelectItem><SelectItem value="phone_call">{t('contacts.schedule.type.phoneCall')}</SelectItem><SelectItem value="site_visit">{t('contacts.schedule.type.siteVisit')}</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>{t('contacts.schedule.location')}</Label><Input value={scheduleFormData.location} onChange={(e) => setScheduleFormData({...scheduleFormData, location: e.target.value})} /></div>
              </div>
              {suggestedSlots.length > 0 && (<div className="space-y-2"><Label className="text-sm font-medium">{t('contacts.schedule.availableSlots')}</Label><div className="flex flex-wrap gap-2">{suggestedSlots.map((slot, i) => (<Button key={i} type="button" variant="outline" size="sm" onClick={() => selectSuggestedSlot(slot)}>{format(slot.start, "dd/MM HH:mm")} - {format(slot.end, "HH:mm")}</Button>))}</div></div>)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t('contacts.schedule.startDateTime')}</Label><Input type="datetime-local" value={scheduleFormData.start_time} onChange={(e) => setScheduleFormData({...scheduleFormData, start_time: e.target.value})} /></div>
                <div className="space-y-2"><Label>{t('contacts.schedule.endDateTime')}</Label><Input type="datetime-local" value={scheduleFormData.end_time} onChange={(e) => setScheduleFormData({...scheduleFormData, end_time: e.target.value})} /></div>
              </div>
              <div className="space-y-2"><Label>{t('contacts.schedule.assignedTo')}</Label><Select value={scheduleFormData.assigned_to} onValueChange={(v) => setScheduleFormData({...scheduleFormData, assigned_to: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{scheduleUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>{t('contacts.schedule.notes')}</Label><Textarea value={scheduleFormData.notes} onChange={(e) => setScheduleFormData({...scheduleFormData, notes: e.target.value})} /></div>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>{t('contacts.form.cancel')}</Button><Button onClick={handleCreateSchedule} disabled={schedulingLoading}>{schedulingLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarPlus className="w-4 h-4 mr-2" />}{t('contacts.schedule.create')}</Button></div>
            </div>
          </DialogContent>
        </Dialog>

        <SendEntityEmailDialog open={showEmailDialog} onOpenChange={setShowEmailDialog} module="contacts" entityId={emailTarget.id} entityName={emailTarget.name} entityEmail={emailTarget.email} organizationId={activeCompany?.id || undefined} pdfAttachment={emailTarget.pdfAttachment} />
        <ContactTagsDialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen} entityId={tagsEntityId} organizationId={activeCompany?.id || ""} entityName={tagsEntityName} onTagsChanged={() => { const entityIds = contacts.map(c => c.entity_id).filter(Boolean); if (entityIds.length > 0) loadSupplementaryData(entityIds); }} />
        <RegisterCallDialog open={callDialogOpen} onOpenChange={setCallDialogOpen} entityId={callEntityId} entityName={callEntityName} organizationId={activeCompany?.id || ""} contactId={callContactId} onCallRegistered={() => { const entityIds = contacts.map(c => c.entity_id).filter(Boolean); if (entityIds.length > 0) loadSupplementaryData(entityIds); }} onOpenWhatsApp={(eid, ename, ctx) => { const identity = getIdentity(eid); if (identity?.phone) { const dp = ctx?.dealOrProposal; const mod = dp?.type === "proposal" ? "proposals" : dp?.type === "quote" ? "quotes" : "contacts"; setWhatsAppContext({ module: mod as any, recipientName: ename, recipientPhone: identity.phone, entityId: eid, hasActiveDeal: !!dealsData[eid]?.count || dp?.type === "deal", dealName: dp?.type === "deal" ? dp.title : undefined, proposalTitle: dp?.type === "proposal" ? dp.title : undefined, proposalValue: dp?.type === "proposal" ? (dp.value || 0) : undefined, quoteTitle: dp?.type === "quote" ? dp.title : undefined, quoteValue: dp?.type === "quote" ? (dp.value || 0) : undefined }); setShowWhatsAppDialog(true); } }} onOpenEmail={(eid, ename, ctx) => { const identity = getIdentity(eid); setEmailTarget({ id: callContactId, name: ename, email: identity?.email || "", pdfAttachment: ctx?.pdfAttachment || null }); setShowEmailDialog(true); }} />
        <WhatsAppSendDialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog} context={whatsAppContext} />

        {/* Duplicate Detection Dialog */}
        <DuplicateEntityDialog
          open={contactDuplicateDialogOpen}
          onOpenChange={(open) => { setContactDuplicateDialogOpen(open); if (!open) { setPendingContactData(null); setContactDuplicateMatches([]); } }}
          matches={contactDuplicateMatches}
          entityType="contact"
          onOpenExisting={handleContactDuplicateOpenExisting}
          onUpdateExisting={handleContactDuplicateUpdateExisting}
          onCreateAnyway={handleContactDuplicateCreateAnyway}
          onShareWithOrg={handleContactDuplicateShareWithOrg}
          loading={savingContact}
          strictBlocking={true}
        />
      </div>
      )}
    </>
  );
};

export default AnewContacts;
