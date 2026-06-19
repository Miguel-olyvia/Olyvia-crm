import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
  Calendar, User, MapPin, Clock, Sparkles, RefreshCw, 
  Check, AlertTriangle, ChevronRight, CalendarDays
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { UserSchedulePreview } from "./UserSchedulePreview";
import { cn } from "@/lib/utils";
import { extractLeadContactInfo } from "@/utils/leadContactInfo";
import { findScheduleItemForLead } from "./leadVisitMatching";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { extractLeadLocation as extractSharedLeadLocation } from "@/lib/leads/location";

interface ScheduledVisit {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  location: string | null;
  status: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  resource_id: string | null;
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
  last_visit_info?: string;
  postal_code_match?: boolean;
}

interface Lead {
  id: string;
  organization_id?: string;
  campaign_id: string | null;
  field_values: Record<string, any> | null;
  assigned_to?: string;
  scheduled_visit_id?: string | null;
  // Relational links that can exist on older data and are more reliable than name matching
  contact_id?: string | null;
  client_id?: string | null;
  converted_to_contact_id?: string | null;
}

interface VisitReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  companyId: string;
  onUpdated?: (append?: boolean, payload?: VisitReassignDialogUpdate) => void | Promise<void>;
}

export interface VisitReassignDialogUpdate {
  leadId: string;
  visitId: string;
  assignedTo: string;
  resourceId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
}

export function VisitReassignDialog({
  open,
  onOpenChange,
  lead,
  companyId,
  onUpdated,
}: VisitReassignDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visit, setVisit] = useState<ScheduledVisit | null>(null);
  const [suggestions, setSuggestions] = useState<AssigneeSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  // Manual visit selection (legacy data repair)
  const [manualVisits, setManualVisits] = useState<any[]>([]);
  const [loadingManualVisits, setLoadingManualVisits] = useState(false);
  const [manualVisitId, setManualVisitId] = useState<string>("");

  const extractLeadLocation = (leadData: Lead | null): string => {
    if (!leadData?.field_values) return "";

    const findFieldValue = (aliases: string[]): string | null => {
      for (const key of Object.keys(leadData.field_values!)) {
        if (key === "_meta") continue;
        const keyLower = key.toLowerCase().replace(/[-_\s]/g, "");
        for (const alias of aliases) {
          const aliasNorm = alias.toLowerCase().replace(/[-_\s]/g, "");
          if (keyLower === aliasNorm || keyLower.endsWith(aliasNorm)) {
            const val = leadData.field_values![key];
            if (val && val !== "") return String(val);
          }
        }
      }
      return null;
    };

    const address = findFieldValue(["morada", "address", "endereco", "endereço", "rua"]);
    const city = findFieldValue(["cidade", "city", "localidade"]);
    const postalCode = findFieldValue(["codigo_postal", "postal_code", "cp", "cep"]);

    return [address, city, postalCode].filter(Boolean).join(", ");
  };

  const applyFoundVisit = async (found: any, reason: string) => {
    if (!lead) return;
    const leadInfo = extractLeadContactInfo(lead.field_values);
    const expectedTitle = leadInfo.name ? `Visita: ${leadInfo.name}` : found.title;
    const expectedLocation = extractSharedLeadLocation(lead) || found.location || null;

    const assignee = (found as any).assignees?.[0]?.resource;
    setVisit({
      id: found.id,
      title: expectedTitle,
      start_datetime: found.start_datetime,
      end_datetime: found.end_datetime,
      location: expectedLocation,
      status: found.status,
      assignee_user_id: assignee?.user_id || null,
      assignee_name: assignee?.name || null,
      resource_id: assignee?.id || null,
    });

    if (assignee?.user_id) {
      // assignee.user_id is an auth UUID — resolve to anew_users.id for consistency
      const { data: anewUser } = await supabase
        .from("anew_users")
        .select("id")
        .eq("auth_user_id", assignee.user_id)
        .maybeSingle();
      if (anewUser) {
        setSelectedUserId(anewUser.id);
      } else {
        // Fallback: use as-is (handleReassign has defensive fallback)
        setSelectedUserId(assignee.user_id);
      }
    }
    setSelectedDate(format(new Date(found.start_datetime), "yyyy-MM-dd"));
    setSelectedTime(format(new Date(found.start_datetime), "HH:mm"));

    // Best-effort repair (do not block UI if RLS/permissions prevent writes)
    const existingMd =
      found.metadata && typeof found.metadata === "object" && !Array.isArray(found.metadata)
        ? (found.metadata as Record<string, any>)
        : {};

    const scheduleItemPatch: Record<string, any> = {};

    if (existingMd.lead_id !== lead.id) {
      scheduleItemPatch.metadata = {
        ...existingMd,
        lead_id: lead.id,
        ...(leadInfo.email ? { lead_email: leadInfo.email } : {}),
        ...(leadInfo.phone ? { lead_phone: leadInfo.phone } : {}),
        ...(leadInfo.name ? { lead_name: leadInfo.name } : {}),
        linked_by: "visit-reassign-dialog",
        linked_reason: reason,
      };
    }

    if (expectedTitle && found.title !== expectedTitle) {
      scheduleItemPatch.title = expectedTitle;
    }

    if (expectedLocation && found.location !== expectedLocation) {
      scheduleItemPatch.location = expectedLocation;
    }

    if (Object.keys(scheduleItemPatch).length > 0) {
      const { error: repairError } = await supabase
        .from("schedule_items")
        .update(scheduleItemPatch as any)
        .eq("id", found.id);

      if (repairError) console.warn("[VisitReassignDialog] Failed to repair schedule_item fields", repairError);
    }

    if (!lead.scheduled_visit_id) {
      const { error: linkError } = await (supabase as any)
        .from("anew_leads")
        .update({ scheduled_visit_id: found.id })
        .eq("id", lead.id);
      if (linkError) console.warn("[VisitReassignDialog] Failed to set lead.scheduled_visit_id", linkError);
    }

    fetchSuggestions(found.start_datetime, found.end_datetime);
  };
  
  // Selection state
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  // Load visit and users when dialog opens
  useEffect(() => {
    if (open && lead && companyId) {
      loadVisitForLead();
      loadUsers();
    }
  }, [open, lead, companyId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setVisit(null);
      setSuggestions([]);
      setSelectedUserId("");
      setShowCalendar(false);
      setSelectedDate("");
      setSelectedTime("");
      setManualVisits([]);
      setLoadingManualVisits(false);
      setManualVisitId("");
    }
  }, [open]);

  const loadManualVisits = async () => {
    if (!lead || !companyId) return;
    setLoadingManualVisits(true);
    setManualVisits([]);
    setManualVisitId("");

    try {
      const postalCode = extractPostalCode(lead);
      const leadInfo = extractLeadContactInfo(lead.field_values);
      const firstName = leadInfo.firstName?.trim();
      const lastName = leadInfo.lastName?.trim();
      const fullName = leadInfo.name?.trim();

      const baseQuery = () =>
        supabase
          .from("schedule_items")
          .select(
            `
            id, title, start_datetime, end_datetime, location, status, metadata, description,
            assignees:schedule_item_assignees(
              resource:schedule_resources(id, user_id, name)
            )
          `
          )
          .eq("organization_id", companyId)
          .in("status", ["scheduled", "confirmed", "completed"])
          .order("start_datetime", { ascending: false })
          .limit(100);

      const candidateQueries = [
        postalCode && postalCode.length >= 4 ? baseQuery().ilike("location", `%${postalCode}%`) : null,
        leadInfo.email ? baseQuery().contains("metadata", { lead_email: leadInfo.email }) : null,
        leadInfo.phone ? baseQuery().contains("metadata", { lead_phone: leadInfo.phone }) : null,
        fullName && fullName.length >= 4 ? baseQuery().ilike("title", `%${fullName}%`) : null,
        lastName && lastName.length >= 4 ? baseQuery().ilike("title", `%${lastName}%`) : null,
        firstName && firstName.length >= 4 ? baseQuery().ilike("title", `%${firstName}%`) : null,
      ].filter(Boolean) as PromiseLike<any>[];

      const results = await Promise.all(candidateQueries);
      const merged = new Map<string, any>();

      for (const result of results) {
        if (result?.error) throw result.error;
        for (const item of (result?.data as any[]) || []) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
      }

      if (merged.size === 0) {
        const fallback = await baseQuery();
        if (fallback.error) throw fallback.error;
        for (const item of (fallback.data as any[]) || []) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
      }

      setManualVisits(Array.from(merged.values()));
    } catch (error: any) {
      console.error("[VisitReassignDialog] Error loading manual visits", error);
      toast({
        title: "Erro ao procurar visitas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingManualVisits(false);
    }
  };

  const handleManualVisitSelect = async (visitId: string) => {
    setManualVisitId(visitId);
    const item = manualVisits.find((v) => v.id === visitId);
    if (!item) return;
    await applyFoundVisit(item, "manual select");
  };

  const loadVisitForLead = async () => {
    if (!lead) return;
    setLoading(true);
    
    try {
      // Refresh lead links from backend to avoid stale table row state
      const { data: freshLead, error: freshLeadError } = await (supabase as any)
        .from("anew_leads")
        .select("id, scheduled_visit_id, converted_to_contact_id, converted_to_client_id, field_values, status")
        .eq("id", lead.id)
        .maybeSingle();

      if (freshLeadError) {
        console.warn("[VisitReassignDialog] Failed to refresh lead links", freshLeadError);
      }

      const leadForLookup = {
        ...lead,
        ...(freshLead || {}),
      } as Lead & { status?: string };

      const leadInfo = extractLeadContactInfo(leadForLookup.field_values || lead.field_values);
      const scheduledVisitId = leadForLookup.scheduled_visit_id || lead.scheduled_visit_id;

      // Debug helpers (kept minimal; useful for diagnosing legacy data)
      console.debug("[VisitReassignDialog] loadVisitForLead", {
        lead_id: leadForLookup.id,
        scheduled_visit_id: scheduledVisitId,
        converted_to_contact_id: leadForLookup.converted_to_contact_id,
        converted_to_client_id: (leadForLookup as any).converted_to_client_id,
        has_email: !!leadInfo.email,
        has_phone: !!leadInfo.phone,
        status: leadForLookup.status,
      });

      // 1) Prefer explicit link from lead -> scheduled_visit_id (most reliable)
      //    BUT validate that the visit actually belongs to this lead via metadata.lead_id
      if (scheduledVisitId) {
        const { data: directItem, error: directError } = await supabase
          .from("schedule_items")
          .select(
            `
            id, title, start_datetime, end_datetime, location, status, metadata, description,
            assignees:schedule_item_assignees(
              resource:schedule_resources(id, user_id, name)
            )
          `
          )
          .eq("id", scheduledVisitId)
          .maybeSingle();

        if (directError) throw directError;

        if (directItem && directItem.status !== "cancelled") {
          const itemMd = directItem.metadata && typeof directItem.metadata === "object" && !Array.isArray(directItem.metadata)
            ? (directItem.metadata as Record<string, any>)
            : {};

          // If visit has a lead_id in metadata and it's a DIFFERENT lead, this link is stale/wrong.
          // Clear the bad link on the current lead and continue searching for the correct visit.
          if (itemMd.lead_id && itemMd.lead_id !== leadForLookup.id) {
            console.warn("[VisitReassignDialog] scheduled_visit_id points to visit owned by another lead", {
              current_lead: leadForLookup.id,
              visit_lead_id: itemMd.lead_id,
              visit_id: directItem.id,
            });
            // Clear the stale scheduled_visit_id on this lead
            await (supabase as any)
              .from("anew_leads")
              .update({ scheduled_visit_id: null })
              .eq("id", lead.id);
          } else {
            await applyFoundVisit(directItem, "lead.scheduled_visit_id");
            return;
          }
        }
      }

      // 1a) Server-side lookup by metadata.lead_id (avoids the 1000-row default limit)
      // Only trust metadata that was NOT set by unreliable legacy name matching.
      const { data: byMetadata, error: byMetadataError } = await supabase
        .from("schedule_items")
        .select(
          `
          id, title, start_datetime, end_datetime, location, status, metadata, description,
          assignees:schedule_item_assignees(
            resource:schedule_resources(id, user_id, name)
          )
        `
        )
        .eq("organization_id", companyId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .contains("metadata", { lead_id: leadForLookup.id })
        .order("start_datetime", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byMetadataError) {
        console.warn("[VisitReassignDialog] metadata.lead_id lookup failed", byMetadataError);
      }
      if (byMetadata) {
        const md = byMetadata.metadata && typeof byMetadata.metadata === "object" && !Array.isArray(byMetadata.metadata)
          ? (byMetadata.metadata as Record<string, any>)
          : {};
        // Don't trust metadata that was set by unreliable legacy name matching
        const unreliableReasons = ["lead name (legacy)", "lead name"];
        const isUnreliable = unreliableReasons.includes(md.linked_reason);

        if (!isUnreliable) {
          await applyFoundVisit(byMetadata, "metadata.lead_id (server)");
          return;
        } else {
          console.warn("[VisitReassignDialog] Skipping metadata match — was set by unreliable name matching", {
            visit_id: byMetadata.id,
            linked_reason: md.linked_reason,
          });
        }
      }

      // 1b) Legacy-safe: try linking via relational references (contact/client) if present
      // Using converted_to_* (preferred) only; legacy contact_id/client_id columns are deprecated.
      const relationalCandidates: Array<{
        label: string;
        column: "contact_id" | "client_id";
        value: string;
      }> = [];

      const leadContactId = leadForLookup.converted_to_contact_id || null;
      if (leadContactId) {
        relationalCandidates.push({
          label: "lead.converted_to_contact_id",
          column: "contact_id",
          value: leadContactId,
        });
      }

      const leadClientId = (leadForLookup as any).converted_to_client_id || null;
      if (leadClientId) {
        relationalCandidates.push({
          label: "lead.converted_to_client_id",
          column: "client_id",
          value: leadClientId,
        });
      }

      for (const c of relationalCandidates) {
        const { data: linkedItem, error: linkedError } = await supabase
          .from("schedule_items")
          .select(
            `
            id, title, start_datetime, end_datetime, location, status, metadata, description,
            assignees:schedule_item_assignees(
              resource:schedule_resources(id, user_id, name)
            )
          `
          )
          .eq("organization_id", companyId)
          .in("status", ["scheduled", "confirmed", "completed"])
          .eq(c.column, c.value as string)
          .order("start_datetime", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (linkedError) throw linkedError;
        if (!linkedItem) continue;

        console.debug("[VisitReassignDialog] Matched via relational link", {
          reason: c.label,
          item_id: linkedItem.id,
        });

        await applyFoundVisit(linkedItem, c.label);
        return;
      }
      
      const { data: items, error } = await supabase
        .from("schedule_items")
        .select(`
          id, title, start_datetime, end_datetime, location, status, metadata, description,
          assignees:schedule_item_assignees(
            resource:schedule_resources(id, user_id, name)
          )
        `)
        .eq("organization_id", companyId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .order("start_datetime", { ascending: false });

      if (error) throw error;

      // Find the visit for this lead using strict keys (lead_id/email/phone)
      const { item: leadVisit, matchReason } = findScheduleItemForLead(
        (items as any[]) || [],
        { id: leadForLookup.id, field_values: leadForLookup.field_values || lead.field_values }
      );

      if (leadVisit) {
        await applyFoundVisit(leadVisit, matchReason);
      } else {
        // Keep dialog actionable even when auto-match fails
        await loadManualVisits();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      // Get active members from anew_memberships
      const { data: memberships, error: mError } = await supabase
        .from("anew_memberships")
        .select("user_id")
        .eq("organization_id", companyId)
        .eq("status", "active");

      if (mError) throw mError;

      const userIds = [...new Set((memberships || []).map(m => m.user_id))];
      
      if (userIds.length === 0) {
        setUsers([]);
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from("anew_users")
        .select("id, name")
        .in("id", userIds);

      if (usersError) throw usersError;

      const usersList = (usersData || [])
        .filter((u: any) => u.name)
        .map((u: any) => ({
          id: u.id,
          name: u.name,
        }));

      setUsers(usersList);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const fetchSuggestions = async (startDatetime: string, endDatetime: string) => {
    if (!lead || !companyId) return;
    
    setLoadingSuggestions(true);
    try {
      // Extract postal code from lead
      const postalCode = extractPostalCode(lead);
      const visitDate = new Date(startDatetime);
      
      const { data, error } = await supabase.functions.invoke("suggest-schedule-assignee", {
        body: {
          organization_id: companyId,
          campaign_id: lead.campaign_id,
          requested_date: format(visitDate, "yyyy-MM-dd"),
          requested_time: format(visitDate, "HH:mm"),
          duration_minutes: Math.round(
            (new Date(endDatetime).getTime() - visitDate.getTime()) / 60000
          ),
          lead_postal_code: postalCode,
          lead_location: extractSharedLeadLocation(lead),
        },
      });

      if (error) throw error;

      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        setAiUsed(data.ai_used || false);
      }
    } catch (error: any) {
      console.error("Error fetching suggestions:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const extractPostalCode = (leadData: Lead): string => {
    if (!leadData?.field_values) return "";
    
    const aliases = ["codigo_postal", "postal_code", "cp", "zip", "zipcode", "cep"];
    for (const key of Object.keys(leadData.field_values)) {
      if (key === "_meta") continue;
      const keyLower = key.toLowerCase().replace(/[-_\s]/g, "");
      for (const alias of aliases) {
        if (keyLower.includes(alias.replace(/[-_\s]/g, ""))) {
          return String(leadData.field_values[key] || "");
        }
      }
    }
    return "";
  };

  const handleSelectSuggestion = async (suggestion: AssigneeSuggestion) => {
    // suggestion.user_id may be auth UUID — try resolving to anew_users.id
    const { data: anewUser } = await supabase
      .from("anew_users")
      .select("id")
      .eq("auth_user_id", suggestion.user_id)
      .maybeSingle();
    setSelectedUserId(anewUser?.id || suggestion.user_id);
    setShowCalendar(true);
  };

  const handleSelectSlot = (date: string, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
  };

  const handleReassign = async () => {
    if (!visit || !selectedUserId || !selectedDate || !selectedTime) {
      toast({
        title: "Dados incompletos",
        description: "Selecione um colaborador e horário",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Não autenticado");

      // Calculate new datetime
      const [hours, mins] = selectedTime.split(":").map(Number);
      const newStart = new Date(selectedDate);
      newStart.setHours(hours, mins, 0, 0);
      
      const originalDuration = new Date(visit.end_datetime).getTime() - 
                               new Date(visit.start_datetime).getTime();
      const newEnd = new Date(newStart.getTime() + originalDuration);

      // Update schedule item datetime
      const { error: updateError } = await supabase
        .from("schedule_items")
        .update({
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString(),
        })
        .eq("id", visit.id);

      if (updateError) throw updateError;

      // Resolve anew_users.id -> auth_user_id for schedule_resources (FK points to profiles/auth)
      let anewUserData: { id: string; auth_user_id: string; name: string | null } | null = null;

      // Primary lookup: selectedUserId is anew_users.id
      const { data: primaryLookup } = await supabase
        .from("anew_users")
        .select("id, auth_user_id, name")
        .eq("id", selectedUserId)
        .maybeSingle();
      anewUserData = primaryLookup;

      // Defensive fallback: selectedUserId might be an auth UUID
      if (!anewUserData?.auth_user_id) {
        const { data: fallbackLookup } = await supabase
          .from("anew_users")
          .select("id, auth_user_id, name")
          .eq("auth_user_id", selectedUserId)
          .maybeSingle();
        anewUserData = fallbackLookup;
      }

      if (!anewUserData?.auth_user_id) {
        throw new Error("Não foi possível resolver o auth_user_id do utilizador selecionado.");
      }

      const anewUserId = anewUserData.id;
      const userName = anewUserData.name || "Utilizador";
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      // Get or create resource for new user (using anew internal id)
      let newResourceId: string | null = null;
      const { data: existingResource } = await supabase
        .from("schedule_resources")
        .select("id")
        .eq("user_id", anewUserId)
        .eq("organization_id", companyId)
        .maybeSingle();

      if (existingResource) {
        newResourceId = existingResource.id;
      } else {
        const { data: newResource, error: resourceError } = await supabase
          .from("schedule_resources")
          .insert({
            organization_id: companyId,
            name: userName,
            resource_type: "user",
            user_id: anewUserId,
            is_active: true,
            color: "#10b981",
            metadata: {},
            created_by: businessUserId,
          })
          .select("id")
          .single();

        if (resourceError) throw resourceError;
        newResourceId = newResource?.id;
      }

      // Update assignee
      if (newResourceId) {
        // Remove ALL existing assignees for this item
        await supabase
          .from("schedule_item_assignees")
          .delete()
          .eq("item_id", visit.id);

        // Add new assignee
        const { error: assigneeError } = await supabase
          .from("schedule_item_assignees")
          .insert({
            item_id: visit.id,
            resource_id: newResourceId,
          });

        if (assigneeError) throw assigneeError;
      }

      // Update lead assigned_to using Anew internal user id (already resolved above)
      if (lead) {
        const { error: leadUpdateError } = await (supabase as any)
          .from("anew_leads")
          .update({ assigned_to: anewUserId })
          .eq("id", lead.id);

        if (leadUpdateError) {
          console.error("Error updating lead assigned_to:", leadUpdateError);
          throw new Error("Falha ao atualizar atribuição da lead: " + leadUpdateError.message);
        }

        console.log("Lead assigned_to updated successfully to anew_user_id:", anewUserId);
      }

      toast({ title: "Visita reatribuída com sucesso!" });
      await onUpdated?.(undefined, {
        leadId: lead.id,
        visitId: visit.id,
        assignedTo: anewUserId,
        resourceId: newResourceId,
        scheduledStart: newStart.toISOString(),
        scheduledEnd: newEnd.toISOString(),
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao reatribuir visita",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getDurationMinutes = () => {
    if (!visit) return 60;
    return Math.round(
      (new Date(visit.end_datetime).getTime() - 
       new Date(visit.start_datetime).getTime()) / 60000
    );
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Reatribuir Visita
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !visit ? (
          <div className="text-center py-12 text-muted-foreground space-y-4">
            <div>
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma visita agendada encontrada para esta lead.</p>
              <p className="text-sm mt-2">
                Para leads antigas, pode ser necessário selecionar a visita manualmente (isto também repara a ligação para futuras reatribuições).
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <Button
                variant="secondary"
                onClick={loadManualVisits}
                disabled={loadingManualVisits}
              >
                {loadingManualVisits ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    A procurar...
                  </>
                ) : (
                  "Procurar visitas e selecionar"
                )}
              </Button>

              {manualVisits.length > 0 && (
                <div className="w-full max-w-xl text-left">
                  <Select value={manualVisitId} onValueChange={handleManualVisitSelect}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecionar a visita correta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {manualVisits.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{v.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(v.start_datetime), "dd/MM/yyyy HH:mm", { locale: pt })}
                              {v.location ? ` • ${v.location}` : ""}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Visit Info */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Visita Atual
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Título:</span>
                    <p className="font-medium">{visit.title}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <p className="font-medium">
                      {format(new Date(visit.start_datetime), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Atribuído a:</span>
                    <p className="font-medium flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {visit.assignee_name || "Não atribuído"}
                    </p>
                  </div>
                  {visit.location && (
                    <div>
                      <span className="text-muted-foreground">Local:</span>
                      <p className="font-medium flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {visit.location}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  Sugestões de Colaboradores
                  {aiUsed && (
                    <Badge variant="secondary" className="text-xs">
                      AI
                    </Badge>
                  )}
                  {loadingSuggestions && (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                {suggestions.length === 0 && !loadingSuggestions ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sugestão disponível
                  </p>
                ) : (
                  <div className="space-y-2">
                    {suggestions.slice(0, 5).map((suggestion, idx) => (
                      <div
                        key={suggestion.user_id}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedUserId === suggestion.user_id
                            ? "border-primary bg-primary/5"
                            : "hover:border-muted-foreground/30 hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                              idx === 0 ? "bg-green-100 text-green-700" :
                              idx === 1 ? "bg-blue-100 text-blue-700" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm flex items-center gap-2">
                                {suggestion.name}
                                {suggestion.postal_code_match && (
                                  <Badge variant="outline" className="text-xs">
                                    Zona próxima
                                  </Badge>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {suggestion.reason}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {suggestion.daily_visits !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                {suggestion.daily_visits} visitas hoje
                              </span>
                            )}
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manual Selection */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Seleção Manual
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <Select value={selectedUserId} onValueChange={(v) => {
                  setSelectedUserId(v);
                  setShowCalendar(true);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecionar colaborador..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Calendar Preview */}
            {showCalendar && selectedUserId && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Calendário do Colaborador
                    {selectedDate && selectedTime && (
                      <Badge variant="secondary" className="ml-auto">
                        {format(new Date(selectedDate), "dd/MM", { locale: pt })} às {selectedTime}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <UserSchedulePreview
                    userId={selectedUserId}
                    companyId={companyId}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    duration={getDurationMinutes()}
                    onSelectSlot={handleSelectSlot}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleReassign} 
            disabled={saving || !visit || !selectedUserId || !selectedDate || !selectedTime}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Reatribuir Visita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
