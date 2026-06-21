import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeFieldValue } from "@/utils/sanitize";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Phone, PhoneOff, PhoneMissed, Clock, Calendar, 
  CheckCircle, XCircle, User, CalendarCheck, History,
  PhoneCall, PhoneForwarded, MessageSquare, Ban, Sparkles,
  MapPin, AlertTriangle, RefreshCw, Pencil
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserSchedulePreview } from "./UserSchedulePreview";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { extractLeadContactInfo } from "@/utils/leadContactInfo";
import {
  createSupabaseLeadDialogFieldDefinitionResolverClient,
  resolveLeadDialogFieldDefinitions,
  type LeadDialogFieldDefinition,
} from "@/lib/leads/fieldDefinitions";
import { extractLeadLocation as extractSharedLeadLocation } from "@/lib/leads/location";

interface Lead {
  id: string;
  organization_id?: string;
  campaign_id: string | null;
  field_values: Record<string, any> | null;
  status: string;
  contact_attempts?: number;
  last_contact_at?: string;
  last_contact_result?: string;
  callback_scheduled_at?: string;
  callback_notes?: string;
  assigned_to?: string;
  scheduled_visit_id?: string;
  entity_id?: string | null;
}

interface ContactHistory {
  id: string;
  contacted_by: string;
  contacted_at: string;
  result: string;
  notes: string | null;
  callback_scheduled_at: string | null;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

interface ContactResultConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  workflow_next_status: string | null;
  is_positive: boolean;
  is_negative: boolean;
  requires_callback: boolean;
  requires_visit: boolean;
}

interface AssigneeSuggestion {
  user_id: string;
  name: string;
  score: number;
  reason: string;
  available: boolean;
  suggested_time?: string;
  resource_id?: string;
  type?: string;
  daily_visits?: number;
  weekly_visits?: number;
  last_visit?: {
    date: string;
    location: string | null;
  } | null;
  last_visit_info?: string;
  postal_code_match?: boolean;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "phone": Phone,
  "phone-off": PhoneOff,
  "phone-missed": PhoneMissed,
  "phone-call": PhoneCall,
  "phone-forwarded": PhoneForwarded,
  "clock": Clock,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
  "calendar-check": CalendarCheck,
  "message-square": MessageSquare,
  "ban": Ban,
};

interface LeadContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  companyId: string | null;
  onLeadUpdated?: (payload?: LeadContactDialogUpdate) => void;
}

export interface LeadContactDialogUpdate {
  leadId: string;
  entityId: string | null;
  status: string;
  assignedTo: string | null;
  contactResult: string;
  callbackScheduledAt: string | null;
  workflowStageId: string | null;
  scheduledVisitId: string | null;
  fieldValues?: Record<string, any>;
}

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

export function AnewLeadContactDialog({ 
  open, 
  onOpenChange, 
  lead, 
  companyId,
  onLeadUpdated 
}: LeadContactDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [contactHistory, setContactHistory] = useState<ContactHistory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [contactResults, setContactResults] = useState<ContactResultConfig[]>([]);
  const [campaignConfig, setCampaignConfig] = useState<{
    has_scheduling: boolean;
    scheduling_description_fields: string[];
    scheduling_default_duration: number;
  } | null>(null);
  
  // Campaign field definitions
  const [fieldDefinitions, setFieldDefinitions] = useState<LeadDialogFieldDefinition[]>([]);
  
  // Reference data for resolving UUIDs (e.g. district IDs to names)
  const [refLookup, setRefLookup] = useState<Record<string, Record<string, string>>>({});
  
  // AI Suggestions state
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<AssigneeSuggestion[]>([]);
  const [aiUsed, setAiUsed] = useState(false);
  
  // Conflict check state
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [nearbyVisits, setNearbyVisits] = useState<{
    before?: { title: string; start: string; end: string };
    after?: { title: string; start: string; end: string };
    conflict?: { title: string; start: string; end: string };
    timeOff?: { type: string; title: string };
  } | null>(null);
  
  // Form state
  const [contactResult, setContactResult] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [scheduleCallback, setScheduleCallback] = useState(false);
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [scheduleVisit, setScheduleVisit] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitDuration, setVisitDuration] = useState("60");
  const [visitLocation, setVisitLocation] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [newStatus, setNewStatus] = useState<string>("");
  
  // Editable lead field values
  const [editableFieldValues, setEditableFieldValues] = useState<Record<string, any>>({});
  const [isEditingFields, setIsEditingFields] = useState(false);

  const draftStorageKey = lead?.id && companyId
    ? `olyvia:lead-contact-draft:${companyId}:${lead.id}`
    : null;

  useEffect(() => {
    if (open && lead) {
      // Reset all state to avoid stale data from previous lead
      setFieldDefinitions([]);
      setVisitLocation("");
      setContactResult("");
      setNotes("");
      setScheduleCallback(false);
      setCallbackDate("");
      setCallbackTime("");
      setScheduleVisit(false);
      setVisitDate("");
      setVisitTime("");
      setVisitDuration("60");
      
      loadContactHistory();
      loadUsers();
      loadContactResults();
      loadCampaignConfig();
      loadFieldDefinitions();
      setNewStatus(lead.status);
      setAssignedTo(lead.assigned_to || "");
      
      // Initialize editable field values from lead
      setEditableFieldValues(lead.field_values ? { ...lead.field_values } : {});
      setIsEditingFields(false);
      if (draftStorageKey) {
        try {
          const savedDraft = localStorage.getItem(draftStorageKey);
          if (savedDraft) {
            const draft = JSON.parse(savedDraft);
            setContactResult(draft.contactResult || "");
            setNotes(draft.notes || "");
            setScheduleCallback(!!draft.scheduleCallback);
            setCallbackDate(draft.callbackDate || "");
            setCallbackTime(draft.callbackTime || "");
            setScheduleVisit(!!draft.scheduleVisit);
            setVisitDate(draft.visitDate || "");
            setVisitTime(draft.visitTime || "");
            setVisitDuration(draft.visitDuration || "60");
            setVisitLocation(draft.visitLocation || "");
            setAssignedTo(draft.assignedTo || lead.assigned_to || "");
            setNewStatus(draft.newStatus || lead.status);
            toast({ title: "Rascunho de contacto recuperado" });
          }
        } catch {
          localStorage.removeItem(draftStorageKey);
        }
      }
      
      // Pre-populate location from lead field_values, fallback to entity address
      const extractedLocation = extractSharedLeadLocation(lead);
      if (extractedLocation) {
        setVisitLocation(extractedLocation);
      } else if (lead.entity_id) {
        fetchEntityAddress(lead.entity_id).then((addr) => {
          if (addr) setVisitLocation(addr);
        });
      }
    } else if (!open) {
      // Clear state when dialog closes
      setFieldDefinitions([]);
      setVisitLocation("");
    }
  }, [open, lead?.id, lead?.campaign_id, companyId, draftStorageKey]);

  useEffect(() => {
    if (!open || !draftStorageKey || !lead) return;
    const hasDraft = Boolean(
      contactResult || notes || scheduleCallback || callbackDate || callbackTime ||
      scheduleVisit || visitDate || visitTime || visitLocation ||
      (assignedTo && assignedTo !== (lead.assigned_to || "")) ||
      (newStatus && newStatus !== lead.status)
    );

    if (!hasDraft) return;

    localStorage.setItem(draftStorageKey, JSON.stringify({
      contactResult,
      notes,
      scheduleCallback,
      callbackDate,
      callbackTime,
      scheduleVisit,
      visitDate,
      visitTime,
      visitDuration,
      visitLocation,
      assignedTo,
      newStatus,
      savedAt: new Date().toISOString(),
    }));
  }, [open, draftStorageKey, lead, contactResult, notes, scheduleCallback, callbackDate, callbackTime, scheduleVisit, visitDate, visitTime, visitDuration, visitLocation, assignedTo, newStatus]);

  // Fetch address from entity's anew_entity_addresses → anew_addresses
  const fetchEntityAddress = async (entityId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from("anew_entity_addresses")
        .select("address:anew_addresses!anew_entity_addresses_address_id_fkey(street, number, city, postal_code, district)")
        .eq("entity_id", entityId)
        .is("valid_to", null)
        .order("is_primary", { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return "";

      const addr = (data[0] as any)?.address;
      if (!addr) return "";

      const parts = [
        [addr.street, addr.number].filter(Boolean).join(" "),
        addr.city,
        addr.postal_code,
      ].filter(Boolean);

      return parts.join(", ");
    } catch {
      return "";
    }
  };

  // Helper to extract location from lead field_values (supports prefixed keys like po_morada)
  const extractLeadLocation = (leadData: Lead | null): string => {
    if (!leadData?.field_values) return "";
    
    const findFieldValue = (aliases: string[]): string | null => {
      for (const key of Object.keys(leadData.field_values!)) {
        if (key === '_meta') continue;
        const keyLower = key.toLowerCase().replace(/[-_\s]/g, '');
        for (const alias of aliases) {
          const aliasNorm = alias.toLowerCase().replace(/[-_\s]/g, '');
          if (keyLower === aliasNorm || keyLower.endsWith(aliasNorm)) {
            const val = leadData.field_values![key];
            if (val && val !== '') return sanitizeFieldValue(val);
          }
        }
      }
      return null;
    };

    const address = findFieldValue(['morada', 'address', 'endereco', 'endereço', 'rua']);
    const city = findFieldValue(['cidade', 'city', 'localidade']);
    const postalCode = findFieldValue(['codigo_postal', 'postal_code', 'cp', 'cep']);
    
    const parts = [address, city, postalCode].filter(Boolean);
    return parts.join(", ");
  };

  const loadCampaignConfig = async () => {
    if (!lead?.campaign_id) {
      setCampaignConfig(null);
      return;
    }
    
    const { data } = await supabase
      .from("campaigns")
      .select("has_scheduling, scheduling_description_fields, scheduling_default_duration")
      .eq("id", lead.campaign_id)
      .single();
    
    if (data) {
      setCampaignConfig(data);
      // Set default visit duration from campaign config
      if (data.scheduling_default_duration) {
        setVisitDuration(String(data.scheduling_default_duration));
      }
    }
  };

  const resolveCampaignId = async (): Promise<string | null> => {
    if (lead?.campaign_id != null) return lead.campaign_id;
    if (!lead?.id) return null;

    const { data, error } = await supabase
      .from("anew_leads")
      .select("campaign_id")
      .eq("id", lead.id)
      .maybeSingle();

    if (error) return null;
    return data?.campaign_id ?? null;
  };

  const loadFieldDefinitions = async () => {
    try {
      const campaignId = await resolveCampaignId();
      const resolvedDefinitions = await resolveLeadDialogFieldDefinitions(
        {
          campaignId,
          organizationId: companyId || lead?.organization_id || null,
        },
        fieldDefinitionResolverClient,
      );

      setFieldDefinitions(resolvedDefinitions);

      const refFields = resolvedDefinitions.filter((field) => field.field_type.startsWith("ref_"));
      if (refFields.length === 0) return;

      const lookup: Record<string, Record<string, string>> = {};
      for (const rf of refFields) {
        if (rf.field_type === "ref_district") {
          const { data: districts } = await supabase
            .from("administrative_divisions")
            .select("id, name")
            .eq("admin_level", 1);
          if (districts) {
            lookup[rf.field_key] = {};
            districts.forEach((district) => {
              lookup[rf.field_key][district.id] = district.name;
            });
          }
        }
      }

      setRefLookup((prev) => ({ ...prev, ...lookup }));
    } catch (error) {
      console.error("Error loading field definitions:", error);
      setFieldDefinitions([]);
    }
  };

  const loadContactResults = async () => {
    const { data, error } = await supabase
      .from("lead_contact_results")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${companyId}`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setContactResults(data);
    }
  };

  const loadContactHistory = async () => {
    if (!lead) return;
    
    const { data, error } = await supabase
      .from("lead_contact_history")
      .select("*")
      .eq("lead_id", lead.id)
      .order("contacted_at", { ascending: false });

    if (!error && data) {
      setContactHistory(data);
      // L7: form de novo contacto arranca sempre vazio para evitar
      // submissão acidental de uma cópia do último contacto.
      // O histórico continua visível na secção própria do diálogo.
    }
  };

  const loadUsers = async () => {
    const effectiveCompanyId = companyId || null;
    if (!effectiveCompanyId) return;

    setLoadingUsers(true);
    try {
      // Get active members from anew_memberships for this organization
      const { data: memberships, error: membershipsError } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", effectiveCompanyId)
        .eq("status", "active");

      if (membershipsError) {
        console.error("Error loading memberships:", membershipsError);
        setUsers([]);
        return;
      }

      const userIds = [...new Set((memberships || []).map(m => m.user_id))];
      if (userIds.length === 0) {
        setUsers([]);
        return;
      }

      // Fetch user details from anew_users
      const { data: usersData, error: usersError } = await supabase
        .from("anew_users")
        .select("id, name")
        .in("id", userIds);

      if (usersError) {
        console.error("Error loading users:", usersError);
        setUsers([]);
        return;
      }

      setUsers(
        (usersData || []).map((u: any) => ({
          id: u.id,
          email: "",
          name: u.name || undefined,
        }))
      );
    } catch (error) {
      console.error("Error loading users:", error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch AI suggestions for assignees
  // L8: useCallback com deps completas (companyId, lead, ...) para reagir
  // correctamente a mudanças de organização ou lead mid-flight.
  const fetchSuggestions = useCallback(async () => {
    const effectiveCompanyId = companyId || lead?.organization_id || null;
    if (!effectiveCompanyId || !scheduleVisit) return;

    if (!visitDate) {
      toast({ title: "Selecione a data", description: "Escolha uma data para gerar sugestões", variant: "destructive" });
      return;
    }

    setLoadingSuggestions(true);
    setSuggestions([]);

    try {
      const session = await supabase.auth.getSession();
      const authToken = session.data.session?.access_token;

      if (!authToken) {
        toast({ title: "Sessão expirada", description: "Por favor faça login novamente.", variant: "destructive" });
        setLoadingSuggestions(false);
        return;
      }

      // Extract postal code from lead
      const leadPostalCode =
        lead?.field_values?.codigo_postal || lead?.field_values?.postal_code || lead?.field_values?.cp || null;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-schedule-assignee`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          organization_id: effectiveCompanyId,
          campaign_id: lead?.campaign_id || null,
          requested_date: visitDate,
          requested_time: visitTime || null,
          duration_minutes: parseInt(visitDuration),
          lead_postal_code: leadPostalCode,
          lead_location: extractSharedLeadLocation(lead),
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            title: "Limite de pedidos excedido",
            description: "Tente novamente mais tarde",
            variant: "destructive",
          });
          return;
        }
        if (response.status === 402) {
          toast({
            title: "Créditos insuficientes",
            description: "Adicione créditos à sua conta",
            variant: "destructive",
          });
          return;
        }
        throw new Error("Failed to fetch suggestions");
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setAiUsed(data.ai_used || false);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      toast({ title: "Erro ao obter sugestões", variant: "destructive" });
    } finally {
      setLoadingSuggestions(false);
    }
  }, [scheduleVisit, visitDate, visitTime, visitDuration, companyId, lead?.id, lead?.organization_id, lead?.campaign_id, lead?.field_values, toast]);

  // Auto-fetch suggestions when visit scheduling is enabled
  useEffect(() => {
    if (scheduleVisit && visitDate) {
      fetchSuggestions();
    }
  }, [scheduleVisit, visitDate, fetchSuggestions]);

  // Check for conflicts when manually selecting an assignee
  // L9: useCallback com deps completas (companyId, scheduleVisit) para
  // revalidar conflitos quando a organização muda ou o agendamento alterna.
  const checkAssigneeConflicts = useCallback(async (anewUserId: string) => {
    if (!scheduleVisit) return;
    if (!anewUserId || !visitDate || !visitTime || !companyId) {
      setNearbyVisits(null);
      return;
    }
    
    setLoadingConflicts(true);
    setNearbyVisits(null);
    
    try {
      // schedule_resources.user_id now references anew_users.id directly
      // anewUserId is already an anew_users.id, so use it directly
      
      // Get resource ID for this user
      const { data: resource } = await supabase
        .from("schedule_resources")
        .select("id")
        .eq("user_id", anewUserId)
        .eq("organization_id", companyId)
        .maybeSingle();

      // Use resource/user_id to check time-off instead of employees table
      const employee = resource ? { id: anewUserId } : null;

      const result: typeof nearbyVisits = {};

      // Check for time-off (vacations, sick leave, absences)
      if (employee) {
        // Check in schedule_items for time-off board entries
        const { data: timeOffBoard } = await supabase
          .from("schedule_boards")
          .select("id")
          .eq("organization_id", companyId)
          .eq("board_type", "time_off")
          .maybeSingle();

        if (timeOffBoard) {
          const { data: timeOffItems } = await supabase
            .from("schedule_items")
            .select("id, title, time_off_type, start_datetime, end_datetime, status, approval_status")
            .eq("board_id", timeOffBoard.id)
            .eq("user_id", employee.id)
            .in("status", ["scheduled", "confirmed"])
            .or(`approval_status.is.null,approval_status.eq.approved`);

          if (timeOffItems && timeOffItems.length > 0) {
            for (const item of timeOffItems) {
              const itemStart = new Date(item.start_datetime).toISOString().split('T')[0];
              const itemEnd = new Date(item.end_datetime).toISOString().split('T')[0];
              
              // Check if visit date falls within time-off period
              if (visitDate >= itemStart && visitDate <= itemEnd) {
                const typeLabels: Record<string, string> = {
                  'vacation': 'Férias',
                  'sick_leave': 'Baixa médica',
                  'personal': 'Falta pessoal',
                  'other': 'Ausência'
                };
                result.timeOff = {
                  type: item.time_off_type || 'other',
                  title: typeLabels[item.time_off_type || 'other'] || item.title || 'Indisponível'
                };
                break;
              }
            }
          }
        }

        // Also check resource_time_off table
        if (!result.timeOff && resource) {
          const { data: resourceTimeOff } = await supabase
            .from("resource_time_off")
            .select("id, title, reason, start_date, end_date, approved")
            .eq("resource_id", resource.id)
            .eq("approved", true);

          if (resourceTimeOff && resourceTimeOff.length > 0) {
            for (const timeOff of resourceTimeOff) {
              if (visitDate >= timeOff.start_date && visitDate <= timeOff.end_date) {
                result.timeOff = {
                  type: 'other',
                  title: timeOff.title || timeOff.reason || 'Indisponível'
                };
                break;
              }
            }
          }
        }
      }

      // If on time-off, no need to check visits
      if (result.timeOff) {
        setNearbyVisits(result);
        setLoadingConflicts(false);
        return;
      }
      
      if (!resource) {
        setLoadingConflicts(false);
        return;
      }

      const visitStart = new Date(`${visitDate}T${visitTime}:00`);
      const visitEndTime = new Date(visitStart.getTime() + parseInt(visitDuration) * 60000);
      
      const { data: items } = await supabase
        .from("schedule_item_assignees")
        .select(`
          schedule_items!inner(
            id, title, start_datetime, end_datetime, status
          )
        `)
        .eq("resource_id", resource.id);
      
      if (items && items.length > 0) {
        // Filter items for this day
        const dayItems = items
          .map((a: any) => a.schedule_items)
          .filter((item: any) => {
            if (!item) return false;
            const itemDate = new Date(item.start_datetime).toISOString().split('T')[0];
            return itemDate === visitDate && item.status !== 'cancelled';
          })
          .sort((a: any, b: any) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
        
        for (const item of dayItems) {
          const itemStart = new Date(item.start_datetime);
          const itemEnd = new Date(item.end_datetime);
          
          // Check for conflict (overlapping)
          if (visitStart < itemEnd && visitEndTime > itemStart) {
            result.conflict = {
              title: item.title,
              start: format(itemStart, "HH:mm", { locale: pt }),
              end: format(itemEnd, "HH:mm", { locale: pt })
            };
          }
          // Check for visit before (ends before our visit starts)
          else if (itemEnd <= visitStart) {
            result.before = {
              title: item.title,
              start: format(itemStart, "HH:mm", { locale: pt }),
              end: format(itemEnd, "HH:mm", { locale: pt })
            };
          }
          // Check for visit after (starts after our visit ends)
          else if (itemStart >= visitEndTime && !result.after) {
            result.after = {
              title: item.title,
              start: format(itemStart, "HH:mm", { locale: pt }),
              end: format(itemEnd, "HH:mm", { locale: pt })
            };
          }
        }
      }
      
      if (result.before || result.after || result.conflict || result.timeOff) {
        setNearbyVisits(result);
      }
      
    } catch (error) {
      console.error("Error checking conflicts:", error);
    } finally {
      setLoadingConflicts(false);
    }
  }, [companyId, visitDate, visitTime, visitDuration, scheduleVisit]);

  // Auto-check conflicts when assignee, date, or time changes
  useEffect(() => {
    if (scheduleVisit && assignedTo && visitDate && visitTime) {
      checkAssigneeConflicts(assignedTo);
    } else {
      setNearbyVisits(null);
    }
  }, [scheduleVisit, assignedTo, visitDate, visitTime, visitDuration, checkAssigneeConflicts]);

  const handleRegisterContact = async () => {
    if (!lead || !contactResult) {
      toast({ title: "Selecione um resultado do contacto", variant: "destructive" });
      return;
    }

    // Validate callback scheduling - if switch is on, date and time are required
    if (scheduleCallback && (!callbackDate || !callbackTime)) {
      toast({ 
        title: "Dados do callback incompletos", 
        description: "Preencha a data e hora do callback agendado",
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();

    // L11: resolver anew_users.id 1× e reusar (em vez de 2 queries idênticas).
    const currentAnewUserId = await resolveBusinessUserId(userData?.user?.id);

    if (scheduleVisit && visitDate && visitTime && assignedTo && !currentAnewUserId) {
      toast({
        title: "Perfil de utilizador não encontrado",
        description: "Não foi possível criar o agendamento com segurança.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      // Calculate callback datetime if scheduled
      let callbackDatetime: string | null = null;
      if (scheduleCallback && callbackDate && callbackTime) {
        callbackDatetime = `${callbackDate}T${callbackTime}:00`;
      }
      let scheduledVisitId: string | null = lead.scheduled_visit_id || null;

      // Insert contact history (organization_id = anew model)
      const { error: historyError } = await supabase
        .from("lead_contact_history")
        .insert({
          lead_id: lead.id,
          organization_id: companyId,
          contacted_by: userData?.user?.id,
          result: contactResult,
          notes: notes || null,
          callback_scheduled_at: callbackDatetime
        } as any);

      if (historyError) {
        const code = (historyError as any)?.code;
        if (code === "23503") {
          throw new Error("Erro de integridade: a lead ou organização não existe na base de dados.");
        }
        throw historyError;
      }

      // Dual-write to entity_interactions for timeline visibility
      let entityIdForTimeline = lead.entity_id || null;
      if (!entityIdForTimeline) {
        const { data: leadData } = await supabase
          .from("anew_leads")
          .select("entity_id")
          .eq("id", lead.id)
          .maybeSingle();
        entityIdForTimeline = leadData?.entity_id || null;
      }
      if (entityIdForTimeline) {
        // L11: reusar currentAnewUserId resolvido no início do handler
        const interactionCreatedBy = currentAnewUserId ?? userData?.user?.id ?? null;

        await supabase
          .from("entity_interactions")
          .insert({
            entity_id: entityIdForTimeline,
            interaction_type: "call",
            result: contactResult,
            notes: notes || null,
            subject: "Contacto de lead",
            interaction_at: new Date().toISOString(),
            created_by: interactionCreatedBy,
            organization_id: companyId,
          });

        // Emit event for timeline refresh
        window.dispatchEvent(
          new CustomEvent("entity-interaction-created", {
            detail: { entityId: entityIdForTimeline },
          })
        );
      }

      // Calculate new status based on selected result's workflow
      const selectedResult = getSelectedResult();
      let statusToSet = newStatus || lead.status;
      if (selectedResult?.workflow_next_status) {
        statusToSet = selectedResult.workflow_next_status;
      }

      // assignedTo is already an anew_users.id (loaded from anew_users table)
      const resolvedAssignedTo: string | null = assignedTo || null;

      // L11: reusar currentAnewUserId resolvido no início do handler
      const resolvedContactBy: string | null = currentAnewUserId;

      // Update lead with edited field values
      const statusChanged = statusToSet !== lead.status;
      const updateData: Record<string, any> = {
        contact_attempts: (lead.contact_attempts || 0) + 1,
        last_contact_at: new Date().toISOString(),
        last_contact_by: resolvedContactBy,
        last_contact_result: contactResult,
        status: statusToSet,
        callback_scheduled_at: callbackDatetime,
        callback_notes: scheduleCallback ? notes : null,
        assigned_to: resolvedAssignedTo,
        // L24: only persist field_values when the user is actively editing them.
        // Prevents auto-saves (notes, status, scheduling) from clobbering concurrent edits.
        ...(isEditingFields ? { field_values: editableFieldValues } : {}),
      };

      // Resolve workflow stage if status changed
      let workflowStageId: string | null = null;
      if (statusChanged && companyId) {
        const { data: stageData } = await supabase
          .from("lead_workflow_stages")
          .select("id, organization_id")
          .eq("name", statusToSet)
          .or(`organization_id.eq.${companyId},organization_id.is.null`);
        const orgStage = stageData?.find(s => s.organization_id === companyId);
        workflowStageId = orgStage?.id || stageData?.find(s => s.organization_id === null)?.id || null;
        if (workflowStageId) {
          updateData.workflow_stage_id = workflowStageId;
        }
      }

      const { error: updateError } = await supabase
        .from("anew_leads")
        .update(updateData as any)
        .eq("id", lead.id);

      if (updateError) throw updateError;

      // Trigger workflow automations if status changed
      if (statusChanged && workflowStageId && companyId) {
        try {
          await supabase.functions.invoke("execute-workflow", {
            body: {
              source_entity: "lead",
              entity_id: lead.id,
              new_stage_id: workflowStageId,
              organization_id: companyId,
              triggered_by: userData?.user?.id,
            },
          });
          console.log("[LeadContactDialog] Workflow executed for status:", statusToSet);
        } catch (wfErr) {
          console.error("[LeadContactDialog] Workflow execution error:", wfErr);
        }
      }

      // Create scheduled visit if requested
      if (scheduleVisit && visitDate && visitTime && assignedTo) {
        if (!companyId) {
          throw new Error("Selecione uma empresa ativa antes de agendar uma visita.");
        }
        if (!currentAnewUserId) {
          throw new Error("Perfil de utilizador não encontrado para criar o agendamento.");
        }

        // Prevent double-scheduling: if this lead already has a visit, skip
        if (lead.scheduled_visit_id) {
          console.log("[LeadContactDialog] Lead already has scheduled_visit_id, skipping visit creation");
        } else {
          const visitStartDate = new Date(`${visitDate}T${visitTime}:00`);
          if (Number.isNaN(visitStartDate.getTime())) {
            throw new Error("Data/hora da visita inválida.");
          }

          const visitStart = visitStartDate.toISOString();
          const visitEnd = new Date(
            visitStartDate.getTime() + parseInt(visitDuration) * 60000
          ).toISOString();

          // Get or create the Visitas board (reuse existing — ignore is_active to avoid duplicates)
          let boardId: string | null = null;
            const { data: existingBoards } = await supabase
              .from("schedule_boards")
              .select("id")
              .eq("organization_id", companyId)
              .eq("name", "Visitas")
              .order("created_at", { ascending: true })
            .limit(1);

          if (existingBoards && existingBoards.length > 0) {
            boardId = existingBoards[0].id;
            // Ensure the board is active
            await supabase
              .from("schedule_boards")
              .update({ is_active: true })
              .eq("id", boardId);
          } else {
            const { data: newBoard, error: newBoardError } = await supabase
              .from("schedule_boards")
                .insert({
                  organization_id: companyId,
                  name: "Visitas",
                  description: "Agendamento de visitas e reuniões",
                  color: "#8b5cf6",
                  created_by: currentAnewUserId,
                  is_active: true,
                  is_system_board: false,
                  board_type: "visits",
                })
              .select("id")
              .single();

            if (newBoardError) throw newBoardError;
            boardId = newBoard?.id || null;
          }

          if (boardId) {
            // Helper to find field value with multiple aliases (supports prefixed keys like po_morada)
            const findFieldValue = (aliases: string[]): string | null => {
              if (!lead.field_values) return null;
              for (const key of Object.keys(lead.field_values)) {
                if (key === '_meta') continue;
                const keyLower = key.toLowerCase().replace(/[-_\s]/g, '');
                for (const alias of aliases) {
                  const aliasNorm = alias.toLowerCase().replace(/[-_\s]/g, '');
                  if (keyLower === aliasNorm || keyLower.endsWith(aliasNorm)) {
                    const val = lead.field_values[key];
                    if (val && val !== '') return sanitizeFieldValue(val);
                  }
                }
              }
              return null;
            };

            // Get lead name from field_values
            const leadName = findFieldValue(['nome', 'name', 'first_name']) || "Lead";
            const leadInfo = extractLeadContactInfo(lead.field_values);

            // Use the editable visitLocation state instead of re-extracting
            console.log("[LeadContactDialog] Using location from form:", visitLocation);

            // Build description from campaign config fields
            let scheduleDescription = notes || "";
            if (campaignConfig?.scheduling_description_fields && lead.field_values) {
              const fieldDescriptions = campaignConfig.scheduling_description_fields
                .map((field) => {
                  const value = lead.field_values?.[field];
                  if (value) {
                    return `${field}: ${value}`;
                  }
                  return null;
                })
                .filter(Boolean)
                .join("\n");

              if (fieldDescriptions) {
                scheduleDescription = fieldDescriptions + (notes ? `\n\n${notes}` : "");
              }
            }
            
            // If no description from config, add lead details
            if (!scheduleDescription && lead.field_values) {
              const detailFields = ['nome', 'name', 'email', 'telefone', 'phone', 'morada', 'address'];
              const details = detailFields
                .map(field => {
                  const value = lead.field_values?.[field];
                  return value ? `${field}: ${value}` : null;
                })
                .filter(Boolean)
                .join("\n");
              scheduleDescription = details;
            }

            // Create schedule item
            const { data: scheduleItem, error: scheduleItemError } = await supabase
              .from("schedule_items")
              .insert([{
                board_id: boardId,
                organization_id: companyId,
                title: `Visita: ${leadName}`,
                description: scheduleDescription || null,
                location: visitLocation || null,
                start_datetime: visitStart,
                end_datetime: visitEnd,
                status: "scheduled",
                origin: "manual",
                metadata: {
                  lead_id: lead.id,
                  ...(leadInfo.email ? { lead_email: leadInfo.email } : {}),
                  ...(leadInfo.phone ? { lead_phone: leadInfo.phone } : {}),
                  ...(leadInfo.name ? { lead_name: leadInfo.name } : {}),
                  linked_by: "lead-contact-dialog",
                },
                created_by: currentAnewUserId,
              }])
              .select("id")
              .single();

            if (scheduleItemError) throw scheduleItemError;

            // Persist the link Lead -> Scheduled Visit
            if (scheduleItem?.id) {
              scheduledVisitId = scheduleItem.id;
              const { error: linkError } = await supabase
                .from("anew_leads")
                .update({ scheduled_visit_id: scheduleItem.id })
                .eq("id", lead.id);

              if (linkError) throw linkError;
            }

            // Find or create resource for assigned user
            // assignedTo is an anew_users.id and schedule_resources.user_id must use that internal id
            const resourceUserId = assignedTo || null;

            let resourceId: string | null = null;
            if (resourceUserId) {
              const { data: existingResource } = await supabase
                .from("schedule_resources")
                .select("id")
                .eq("user_id", resourceUserId)
                .eq("organization_id", companyId)
                .maybeSingle();

              if (existingResource?.id) {
                resourceId = existingResource.id;
              } else {
                const assignedUser = users.find((u) => u.id === assignedTo);
                const { data: newResource, error: newResourceError } = await supabase
                  .from("schedule_resources")
                  .insert({
                    organization_id: companyId,
                    name: assignedUser?.name || assignedUser?.email || "Utilizador",
                    resource_type: "user",
                    user_id: resourceUserId,
                    is_active: true,
                    color: "#10b981",
                    metadata: {},
                    created_by: currentAnewUserId,
                  })
                  .select("id")
                  .single();

                if (newResourceError) throw newResourceError;
                resourceId = newResource?.id || null;
              }
            }

            // Link assignee to schedule item
            if (resourceId && scheduleItem?.id) {
              const { error: assigneeError } = await supabase
                .from("schedule_item_assignees")
                .insert({
                  item_id: scheduleItem.id,
                  resource_id: resourceId,
                });

              if (assigneeError) throw assigneeError;

              // Sync lead assigned_to with visit assignee
              if (assignedTo && assignedTo !== lead.assigned_to) {
                await supabase
                  .from("anew_leads")
                  .update({ assigned_to: assignedTo })
                  .eq("id", lead.id);
              }
            }
          }
        }
      }

      toast({ title: "Contacto registado com sucesso!" });
      if (draftStorageKey) localStorage.removeItem(draftStorageKey);
      resetForm();
      onLeadUpdated?.({
        leadId: lead.id,
        entityId: entityIdForTimeline,
        status: statusToSet,
        assignedTo: resolvedAssignedTo,
        contactResult,
        callbackScheduledAt: callbackDatetime,
        workflowStageId,
        scheduledVisitId,
        ...(isEditingFields ? { fieldValues: editableFieldValues } : {}),
      });
      onOpenChange(false);

    } catch (error: any) {
      console.error("[AnewLeadContactDialog] Error:", error);
      toast({ 
        title: "Erro ao registar contacto", 
        description: error.message || "Erro desconhecido",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setContactResult("");
    setNotes("");
    setScheduleCallback(false);
    setCallbackDate("");
    setCallbackTime("");
    setScheduleVisit(false);
    setVisitDate("");
    setVisitTime("");
    setVisitDuration("60");
  };

  const getResultInfo = (result: string) => {
    return contactResults.find(r => r.id === result || r.name === result);
  };

  const getSelectedResult = () => {
    return contactResults.find(r => r.id === contactResult);
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Registar Contacto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Lead Info Summary - Editable */}
          <Card className="bg-muted/50">
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{editableFieldValues?.nome || editableFieldValues?.name || "Lead"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    {lead.contact_attempts || 0} tentativas
                  </Badge>
                  {lead.last_contact_at && (
                    <span className="text-xs text-muted-foreground">
                      Último: {format(new Date(lead.last_contact_at), "dd/MM HH:mm", { locale: pt })}
                    </span>
                  )}
                  {!isEditingFields && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs gap-1"
                      onClick={() => setIsEditingFields(true)}
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              {/* Editable lead field values - Use field definitions if available */}
              {fieldDefinitions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fieldDefinitions.map((fieldDef) => {
                    const value = editableFieldValues[fieldDef.field_key];
                    
                    // Handle different value types
                    const isArray = Array.isArray(value);
                    const isObject = typeof value === 'object' && value !== null && !isArray;
                    
                    // For arrays, show as comma-separated editable text
                    // Resolve reference values (e.g. district UUID -> name)
                    const resolvedValue = refLookup[fieldDef.field_key]?.[value as string] ?? value;
                    const displayValue = isArray ? value.join(', ') : (isObject ? JSON.stringify(value) : (resolvedValue ?? ''));
                    
                    return (
                      <div key={fieldDef.id} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {fieldDef.field_label}
                          {fieldDef.is_required && <span className="text-destructive ml-0.5">*</span>}
                        </Label>
                        {isEditingFields ? (
                          <Input
                            value={String(displayValue)}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setEditableFieldValues(prev => ({
                                ...prev,
                                [fieldDef.field_key]: isArray ? newValue.split(',').map(s => s.trim()).filter(Boolean) : newValue
                              }));
                            }}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <p className="text-sm font-medium py-1">{String(displayValue) || '-'}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : Object.keys(editableFieldValues).filter(k => k !== '_meta').length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(editableFieldValues)
                    .filter(([key]) => key !== '_meta')
                    .map(([key, value]) => {
                      // Format the key for display
                      const displayKey = key
                        .replace(/^po_/, '')
                        .replace(/_/g, ' ')
                        .replace(/([A-Z])/g, ' $1')
                        .trim();
                      
                      // Handle different value types
                      const isArray = Array.isArray(value);
                      const isObject = typeof value === 'object' && value !== null && !isArray;
                      
                      // For arrays, show as comma-separated editable text
                      const displayValue = isArray ? value.join(', ') : (isObject ? JSON.stringify(value) : (value ?? ''));
                      
                      return (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs text-muted-foreground capitalize">{displayKey}</Label>
                          {isEditingFields ? (
                            <Input
                              value={String(displayValue)}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setEditableFieldValues(prev => ({
                                  ...prev,
                                  [key]: isArray ? newValue.split(',').map(s => s.trim()).filter(Boolean) : newValue
                                }));
                              }}
                              className="h-8 text-sm"
                            />
                          ) : (
                            <p className="text-sm font-medium py-1">{String(displayValue) || '-'}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados adicionais</p>
              )}
              {isEditingFields && (
                <div className="flex justify-end gap-2 mt-3 pt-3 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setEditableFieldValues(lead.field_values ? { ...lead.field_values } : {});
                      setIsEditingFields(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={async () => {
                      const { error } = await supabase
                        .from("anew_leads")
                        .update({ field_values: editableFieldValues })
                        .eq("id", lead.id);
                      
                      if (error) {
                        toast({ title: "Erro ao guardar", variant: "destructive" });
                      } else {
                        toast({ title: "Dados guardados" });
                        setIsEditingFields(false);
                        onLeadUpdated?.({
                          leadId: lead.id,
                          entityId: lead.entity_id || null,
                          status: lead.status,
                          assignedTo: lead.assigned_to || null,
                          contactResult: "",
                          callbackScheduledAt: lead.callback_scheduled_at || null,
                          workflowStageId: null,
                          scheduledVisitId: lead.scheduled_visit_id || null,
                          fieldValues: editableFieldValues,
                        });
                      }
                    }}
                  >
                    Guardar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Result */}
          <div className="space-y-3">
            <Label>Resultado do Contacto *</Label>
            <div className="grid grid-cols-3 gap-2">
              {contactResults.map(result => {
                const IconComponent = ICON_MAP[result.icon] || Phone;
                const isSelected = contactResult === result.id;
                return (
                  <Button
                    key={result.id}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className="h-auto py-2 px-3 justify-start gap-2"
                    style={!isSelected ? { color: result.color } : undefined}
                    onClick={() => {
                      setContactResult(result.id);
                      if (result.requires_callback) setScheduleCallback(true);
                      if (result.requires_visit) setScheduleVisit(true);
                    }}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="text-xs">{result.name}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              placeholder="Adicione notas sobre o contacto..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>


          {/* Schedule Callback */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Label>Agendar Callback</Label>
                </div>
                <Switch
                  checked={scheduleCallback}
                  onCheckedChange={setScheduleCallback}
                />
              </div>
              {scheduleCallback && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={callbackDate}
                      onChange={e => setCallbackDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hora</Label>
                    <Input
                      type="time"
                      value={callbackTime}
                      onChange={e => setCallbackTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule Visit */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-muted-foreground" />
                  <Label>Agendar Visita</Label>
                </div>
                <Switch
                  checked={scheduleVisit}
                  onCheckedChange={setScheduleVisit}
                />
              </div>
              {scheduleVisit && (
                <div className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Data</Label>
                      <Input
                        type="date"
                        value={visitDate}
                        onChange={e => setVisitDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hora</Label>
                      <Input
                        type="time"
                        value={visitTime}
                        onChange={e => setVisitTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Duração</Label>
                    <Select value={visitDuration} onValueChange={setVisitDuration}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                        <SelectItem value="90">1h 30min</SelectItem>
                        <SelectItem value="120">2 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Location field */}
                  <div>
                    <Label className="text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Localização
                    </Label>
                    <Input
                      type="text"
                      value={visitLocation}
                      onChange={e => setVisitLocation(e.target.value)}
                      placeholder="Morada, cidade, código postal..."
                      className="mt-1"
                    />
                    {visitLocation && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Pré-preenchido dos dados da lead
                      </p>
                    )}
                  </div>
                  
                  {/* AI Suggestions */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-primary" />
                        Colaboradores Sugeridos
                        {aiUsed && (
                          <Badge variant="secondary" className="text-[10px] px-1">
                            IA
                          </Badge>
                        )}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={fetchSuggestions}
                        disabled={loadingSuggestions || !visitDate}
                      >
                        {loadingSuggestions ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </Button>
                    </div>

                    {!visitDate ? (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Selecione a data para gerar sugestões
                      </p>
                    ) : loadingSuggestions ? (
                      <div className="flex items-center justify-center py-4 text-muted-foreground text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        A analisar disponibilidade...
                      </div>
                    ) : suggestions.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {suggestions.map((suggestion, idx) => (
                          <div
                            key={suggestion.user_id || idx}
                            className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                              assignedTo === suggestion.user_id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            } ${!suggestion.available ? "opacity-50" : ""}`}
                            onClick={() => {
                              if (suggestion.available && suggestion.user_id) {
                                setAssignedTo(suggestion.user_id);
                                if (suggestion.suggested_time && !visitTime) {
                                  setVisitTime(suggestion.suggested_time);
                                }
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                  suggestion.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                }`}
                              >
                                {suggestion.score || 100 - idx * 15}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium truncate">{suggestion.name}</p>
                                  {suggestion.postal_code_match && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <MapPin className="w-3 h-3 text-green-600 flex-shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent>Código postal próximo</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                  {suggestion.weekly_visits !== undefined && (
                                    <span>{suggestion.weekly_visits} visitas/semana</span>
                                  )}
                                  {(suggestion.last_visit || suggestion.last_visit_info) && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center gap-0.5 cursor-help">
                                          <History className="w-2.5 h-2.5" />
                                          Última visita
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {suggestion.last_visit_info ||
                                          (suggestion.last_visit
                                            ? `${format(new Date(suggestion.last_visit.date), "dd/MM", { locale: pt })} - ${
                                                suggestion.last_visit.location || "Sem local"
                                              }`
                                            : "Sem visitas anteriores")}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {suggestion.suggested_time && !visitTime && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[10px]">
                                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                                      {suggestion.suggested_time}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Horário sugerido</TooltipContent>
                                </Tooltip>
                              )}
                              {!suggestion.available && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>Indisponível neste horário</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Sem sugestões para esta data
                      </p>
                    )}
                  </div>
                  
                  {/* Manual selection fallback */}
                  <div className="pt-2">
                    <Label className="text-xs">Ou selecione manualmente</Label>
                    <Select value={assignedTo || "unassigned"} onValueChange={(val) => setAssignedTo(val === "unassigned" ? "" : val)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecionar utilizador..." />
                      </SelectTrigger>
                      <SelectContent key={`assignees-visit-${loadingUsers}-${users.length}`}>
                        <SelectItem value="unassigned">Não atribuído</SelectItem>
                        {loadingUsers ? (
                          <SelectItem value="loading" disabled>
                            A carregar utilizadores...
                          </SelectItem>
                        ) : users.length === 0 ? (
                          <SelectItem value="empty" disabled>
                            Sem utilizadores disponíveis
                          </SelectItem>
                        ) : (
                          users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name || user.email}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* User Schedule Preview - shows when user is selected */}
                  {assignedTo && companyId && (
                    <div className="mt-3 pt-3 border-t">
                      <UserSchedulePreview
                        userId={assignedTo}
                        companyId={companyId}
                        selectedDate={visitDate}
                        selectedTime={visitTime}
                        duration={parseInt(visitDuration)}
                        onSelectSlot={(date, time) => {
                          setVisitDate(date);
                          setVisitTime(time);
                        }}
                      />
                    </div>
                  )}
                  
                  {/* Conflict/Nearby visits info */}
                  {assignedTo && visitDate && visitTime && (
                    <div className="space-y-1.5 mt-2">
                      {loadingConflicts ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          A verificar agenda...
                        </div>
                      ) : nearbyVisits ? (
                        <div className="space-y-1">
                          {nearbyVisits.timeOff && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">
                              <Ban className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>
                                <strong>Indisponível!</strong> {nearbyVisits.timeOff.title} nesta data
                              </span>
                            </div>
                          )}
                          {nearbyVisits.conflict && !nearbyVisits.timeOff && (
                            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>
                                <strong>Conflito!</strong> Visita "{nearbyVisits.conflict.title}" das {nearbyVisits.conflict.start} às {nearbyVisits.conflict.end}
                              </span>
                            </div>
                          )}
                          {nearbyVisits.before && !nearbyVisits.conflict && !nearbyVisits.timeOff && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>
                                Visita anterior: "{nearbyVisits.before.title}" das {nearbyVisits.before.start} às {nearbyVisits.before.end}
                              </span>
                            </div>
                          )}
                          {nearbyVisits.after && !nearbyVisits.conflict && !nearbyVisits.timeOff && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>
                                Visita seguinte: "{nearbyVisits.after.title}" das {nearbyVisits.after.start} às {nearbyVisits.after.end}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded-md">
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            Visita agendada das {visitTime} às {(() => {
                              const [h, m] = visitTime.split(':').map(Number);
                              const endDate = new Date();
                              endDate.setHours(h, m + parseInt(visitDuration), 0);
                              return format(endDate, "HH:mm");
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!assignedTo && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Selecione um utilizador para atribuir a visita
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>


          {/* Contact History */}
          {contactHistory.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Histórico de Contactos
                </CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3">
                <div className="space-y-2 max-h-32 overflow-y-auto">
                {contactHistory.slice(0, 5).map(history => {
                    const resultInfo = getResultInfo(history.result);
                    const Icon = resultInfo?.icon || Phone;
                    return (
                      <div 
                        key={history.id}
                        className="flex flex-col gap-1 text-sm border-b last:border-0 pb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${resultInfo?.color || ""}`} />
                            <span>{resultInfo?.name || history.result}</span>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(history.contacted_at), "dd/MM HH:mm", { locale: pt })}
                          </span>
                        </div>
                        {history.callback_scheduled_at && (
                          <div className="flex items-center gap-1.5 ml-6 text-xs text-primary">
                            <CalendarCheck className="w-3 h-3" />
                            <span>
                              Agendado para: {format(new Date(history.callback_scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                            </span>
                          </div>
                        )}
                        {history.notes && (
                          <p className="ml-6 text-xs text-muted-foreground truncate max-w-xs">
                            {history.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleRegisterContact}
            disabled={loading || !contactResult}
          >
            {loading ? "A registar..." : "Registar Contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
