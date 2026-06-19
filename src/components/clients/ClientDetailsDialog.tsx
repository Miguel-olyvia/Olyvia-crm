import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { composeDisplayName, normalizeFirstLast } from "@/utils/composeDisplayName";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, FileText, MapPin, ListPlus, Trash2, Undo2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useConversionRevert } from "@/hooks/useConversionRevert";
import { Separator } from "@/components/ui/separator";
import { contactSchema, contactCompanySchema, dealSchema, proposalSchema } from "@/lib/validations";
import { PhoneInput } from "@/components/PhoneInput";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { differenceInDays } from "date-fns";
import { calculateHealthScore } from "@/hooks/useContactHealthScore";

import { ClientDetailHeader } from "@/components/clients/detail/ClientDetailHeader";
import { ClientSummaryBar } from "@/components/clients/detail/ClientSummaryBar";
import { ClientSmartSuggestion } from "@/components/clients/detail/ClientSmartSuggestion";
import { ClientSummaryTab } from "@/components/clients/detail/ClientSummaryTab";
import { ClientContractsTab } from "@/components/clients/detail/ClientContractsTab";
import { ClientNotesTab } from "@/components/clients/detail/ClientNotesTab";
import { ContactEmailsTab } from "@/components/contacts/detail/ContactEmailsTab";
import { ContactTimelineTab } from "@/components/contacts/detail/ContactTimelineTab";
import { useEntitySendEvents } from "@/hooks/useEntitySendEvents";
import { ContactScoringTab } from "@/components/contacts/detail/ContactScoringTab";
import { ContactJourneyTab } from "@/components/contacts/detail/ContactJourneyTab";
import { RegisterCallDialog } from "@/components/contacts/RegisterCallDialog";
import { RegisterMeetingDialog } from "@/components/clients/detail/RegisterMeetingDialog";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import { EditActionDialog } from "@/components/shared/EditActionDialog";
import { CatalogItemPicker, CatalogLineItem } from "@/components/clients/detail/CatalogItemPicker";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";

interface ClientDetailsDialogProps {
  client: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientUpdated?: () => void;
}

interface Deal {
  id: string; title: string; value: number; stage_id: string;
  probability?: number; created_at?: string; assigned_to?: string;
  stages: { name: string; color: string } | null;
}

interface Proposal {
  id: string; title: string; value: number; status: string;
  valid_until: string; created_at?: string; deals: { title: string } | null;
}

interface Contract {
  id: string; title: string; status: string; total_value: number;
  start_date: string | null; end_date: string | null; payment_terms: string | null;
}

export const ClientDetailsDialog = ({ client, open, onOpenChange, onClientUpdated }: ClientDetailsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contactLists, setContactLists] = useState<any[]>([]);
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  const [selectedNewListIds, setSelectedNewListIds] = useState<Set<string>>(new Set());
  const [showAddListForm, setShowAddListForm] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<string>("");
  const [dealStages, setDealStages] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const { toast } = useToast();
  const { t } = useTranslation();

  const [interactions, setInteractions] = useState<any[]>([]);
  const [portalSends, setPortalSends] = useState<any[]>([]);
  const [tags, setTags] = useState<{ id: string; tag: string; color: string | null }[]>([]);
  const [sourceLead, setSourceLead] = useState<any>(null);
  const [groupCompanyNames, setGroupCompanyNames] = useState<string[]>([]);
  const [assignedUserName, setAssignedUserName] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showEditActionDialog, setShowEditActionDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [entityType, setEntityType] = useState<string>("person");
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [canRevert, setCanRevert] = useState(false);
  const { revertContactToClient, canRevertClientToContact } = useConversionRevert();

  const [editFormData, setEditFormData] = useState({
    first_name: "", last_name: "", email: "", phone: "", phone_country_code: "+351",
    vat: "", position: "", status: "", notes: "", organization_id: "", address: "", city: "", postal_code: "",
    assigned_to: "" as string | null,
  });
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([]);

  const [dealFormData, setDealFormData] = useState({ title: "", description: "", value: "", stage_id: "", expected_close_date: "" });
  const [dealLineItems, setDealLineItems] = useState<CatalogLineItem[]>([]);
  const [proposalFormData, setProposalFormData] = useState({ title: "", description: "", value: "", valid_until: "" });
  const [proposalLineItems, setProposalLineItems] = useState<CatalogLineItem[]>([]);

  useEffect(() => {
    if (!open || !client) return;
    let isCancelled = false;

    loadClientDetails();
    loadDealStages();
    loadEnrichedData();
    loadGroupCompanies();
    setActiveTab("summary");
    canRevertClientToContact(client.id).then(v => { if (!isCancelled) setCanRevert(v); });
    setEditFormData({
      first_name: client.first_name || "", last_name: client.last_name || "",
      email: client.email || "", phone: client.phone || "", phone_country_code: client.phone_country_code || "+351",
      vat: client.vat || "", position: client.position || "", status: client.status || "customer",
      notes: client.notes || "", organization_id: client.organization_id || "",
      address: client.address || "", city: client.city || "", postal_code: client.postal_code || "",
      assigned_to: client.assigned_to || null,
    });

    // C14: Parallel fetch of entity type + org users (independent queries)
    // C15: isCancelled guard on all setState calls
    const fetchEntityType = async () => {
      if (!client.entity_id) return;
      const { data, error } = await supabase.from("anew_entities").select("type").eq("id", client.entity_id).maybeSingle();
      if (error) console.error("Error fetching entity type:", error);
      if (!isCancelled) setEntityType(data?.type || "person");
    };

    const fetchOrgUsers = async () => {
      if (!client.organization_id) return;
      const { data: clientRoles, error: rolesError } = await supabase.from("anew_roles").select("id").eq("code", "client");
      if (rolesError) { console.error("Error fetching client roles:", rolesError); return; }
      if (isCancelled) return;
      const clientRoleIds = (clientRoles || []).map((r: any) => r.id);

      const { data: members, error: membersError } = await supabase.from("anew_memberships")
        .select("user_id, role_id")
        .eq("organization_id", client.organization_id)
        .eq("status", "active");
      if (membersError) { console.error("Error fetching memberships:", membersError); return; }
      if (isCancelled) return;

      if (members && members.length > 0) {
        const nonClientMembers = clientRoleIds.length > 0
          ? members.filter((m: any) => !clientRoleIds.includes(m.role_id))
          : members;
        if (nonClientMembers.length > 0) {
          const userIds = [...new Set(nonClientMembers.map((m: any) => m.user_id))];
          const { data: users, error: usersError } = await supabase.from("anew_users").select("id, name").in("id", userIds);
          if (usersError) { console.error("Error fetching org users:", usersError); return; }
          if (!isCancelled) setOrgUsers((users || []).filter((u: any) => u.name));
        } else {
          if (!isCancelled) setOrgUsers([]);
        }
      }
    };

    // Fire both in parallel
    Promise.all([fetchEntityType(), fetchOrgUsers()]);

    setSelectedNewListIds(new Set());
    setShowAddListForm(false);

    return () => { isCancelled = true; };
  }, [open, client]);

  // Populate edit form address from loaded entity addresses (primary first)
  useEffect(() => {
    if (addresses.length > 0) {
      const primary = addresses.find((a: any) => a.is_primary) || addresses[0];
      if (primary) {
        setEditFormData(prev => ({
          ...prev,
          address: [primary.street, primary.number, primary.floor].filter(Boolean).join(", ") || prev.address,
          city: primary.city || prev.city,
          postal_code: primary.postal_code || prev.postal_code,
        }));
      }
    }
  }, [addresses]);

  const loadEnrichedData = async () => {
    const entityId = client?.entity_id;
    const organizationId = client?.organization_id;
    if (!entityId || !organizationId) return;
    try {
      const [interactionsRes, tagsRes, contractsRes] = await Promise.all([
        supabase.from("entity_interactions").select("id, interaction_type, sentiment, subject, notes, next_action_type, next_action_date, interaction_at, created_by, created_at").eq("entity_id", entityId).eq("organization_id", organizationId).order("interaction_at", { ascending: false }).limit(50),
        supabase.from("contact_tags").select("id, tag, color").eq("entity_id", entityId).eq("organization_id", organizationId),
        (supabase as any).from("client_contracts").select("id, title:contract_number, status, total_value, start_date, end_date, payment_terms").eq("entity_id", entityId).eq("organization_id", organizationId).order("created_at", { ascending: false }),
      ]);

      setInteractions(interactionsRes.data || []);
      setTags(tagsRes.data || []);
      setContracts(contractsRes.data || []);

      // Try to find source lead
      if (client.source_lead_id || client.source_id) {
        const leadId = client.source_lead_id || client.source_id;
        const { data: leadData } = await supabase.from("anew_leads").select("id, source, campaign_id, created_at").eq("id", leadId).maybeSingle();
        if (leadData) setSourceLead({ ...leadData, source_type: leadData.source, campaign: leadData.campaign_id });
        else setSourceLead(null);
      } else {
        setSourceLead(null);
      }

      // Resolve assigned user
      if (client.assigned_to) {
        const { data: au } = await supabase.from("anew_users").select("name").eq("id", client.assigned_to).maybeSingle();
        setAssignedUserName(au?.name || null);
      }

      // Build user map
      const actorIds = [...new Set((interactionsRes.data || []).map((i: any) => i.created_by).filter(Boolean))];
      const userMapLocal: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: users } = await supabase.from("anew_users").select("id, name").in("id", actorIds);
        (users || []).forEach((u: any) => { userMapLocal[u.id] = u.name; });
      }

      // Load portal sends
      const { data: portalData } = await (supabase as any)
        .from("client_portal_users")
        .select("id, proposal_id, contract_id, quote_id, created_by, created_at, portal_status")
        .eq("entity_id", entityId)
        .eq("organization_id", organizationId);

      if (portalData && portalData.length > 0) {
        setPortalSends(portalData);
        const portalActorIds = portalData.map((p: any) => p.created_by).filter(Boolean);
        const newActorIds = portalActorIds.filter((id: string) => !userMapLocal[id]);
        if (newActorIds.length > 0) {
          const { data: portalUsers } = await supabase.from("anew_users").select("id, name").in("id", newActorIds);
          (portalUsers || []).forEach((u: any) => { userMapLocal[u.id] = u.name; });
        }
      } else {
        setPortalSends([]);
      }

      setUserMap(userMapLocal);
    } catch (e) {
      console.error("Error loading enriched data:", e);
    }
  };

  // Computed values
  const healthScore = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const count30d = interactions.filter(i => new Date(i.interaction_at) >= thirtyDaysAgo).length;
    const lastInteraction = interactions[0]?.interaction_at || client?.last_interaction_at || null;
    return calculateHealthScore({
      lastInteractionAt: lastInteraction,
      hasActiveDeal: deals.length > 0,
      hasActiveProposal: proposals.length > 0,
      hasEmail: !!client?.email,
      hasPhone: !!client?.phone,
      hasVat: !!client?.vat,
      interactionCount30d: count30d,
    });
  }, [interactions, deals, proposals, client]);

  const totalValue = useMemo(() => {
    const contractVal = contracts.filter(c => c.status === "active" || c.status === "signed").reduce((s, c) => s + (c.total_value || 0), 0);
    const dealVal = deals.reduce((s, d) => s + (d.value || 0), 0);
    return contractVal + dealVal;
  }, [contracts, deals]);

  const activeContractCount = useMemo(() => contracts.filter(c => c.status === "active" || c.status === "signed").length, [contracts]);

  const lastSentiment = useMemo(() => {
    const ws = interactions.find(i => i.sentiment);
    return ws ? { sentiment: ws.sentiment, date: ws.interaction_at } : null;
  }, [interactions]);

  const nextAction = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = interactions
      .filter(i => i.next_action_date && new Date(i.next_action_date) >= today)
      .sort((a, b) => {
        const aRef = new Date(a.created_at || a.interaction_at || a.next_action_date!).getTime();
        const bRef = new Date(b.created_at || b.interaction_at || b.next_action_date!).getTime();
        return bRef - aRef;
      });

    const wa = upcoming[0];
    return wa ? { id: wa.id, description: wa.next_action_type || "Follow-up", date: wa.next_action_date } : null;
  }, [interactions]);

  const daysSinceContact = useMemo(() => {
    const last = interactions[0]?.interaction_at || client?.last_interaction_at || null;
    return last ? differenceInDays(new Date(), new Date(last)) : null;
  }, [interactions, client]);

  const expiringContract = useMemo(() => {
    const now = new Date();
    const expiring = contracts.find(c => {
      if (c.status !== "active" && c.status !== "signed") return false;
      if (!c.end_date) return false;
      const days = differenceInDays(new Date(c.end_date), now);
      return days > 0 && days <= 60;
    });
    if (!expiring) return null;
    return { name: expiring.title, daysUntil: differenceInDays(new Date(expiring.end_date!), now) };
  }, [contracts]);

  const { events: sendEvents } = useEntitySendEvents(client?.entity_id || null);

  const timelineEvents = useMemo(() => {
    const events: any[] = [];
    interactions.forEach(i => {
      events.push({
        id: i.id, type: i.interaction_type,
        title: i.interaction_type === "call" ? "Chamada realizada" : i.interaction_type === "email" ? `Email enviado: "${i.subject || ""}"` : i.interaction_type === "meeting" ? "Reunião realizada" : i.interaction_type === "whatsapp" ? "WhatsApp enviado" : "Nota",
        description: i.notes || i.subject, date: i.interaction_at,
        actor: userMap[i.created_by] || null, sentiment: i.sentiment,
      });
    });
    // Document send events (proposal/quote/contract via email/whatsapp/portal)
    sendEvents.forEach(s => {
      const docLabel = s.docType === "proposal" ? "Proposta" : s.docType === "quote" ? "Orçamento" : s.docType === "contract" ? "Contrato" : "Documento";
      const channelLabel = s.channel === "portal" ? "Portal Cliente" : s.channel === "whatsapp" ? "WhatsApp" : "Email";
      events.push({
        id: "send-" + s.id,
        type: s.channel,
        title: `${docLabel} enviado por ${channelLabel}${s.docTitle ? `: ${s.docTitle}` : ""}`,
        description: s.recipient ? `Para: ${s.recipient}` : null,
        date: s.sentAt,
        actor: s.actorId ? (userMap[s.actorId] || null) : null,
      });
    });
    if (client?.created_at) {
      events.push({
        id: "client-created", type: "conversion",
        title: "Convertido para Cliente",
        description: sourceLead ? "Convertido de Lead" : null,
        date: client.client_since || client.created_at, actor: null,
      });
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events;
  }, [interactions, sendEvents, client, sourceLead, userMap]);

  const interactionCount30d = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return interactions.filter(i => new Date(i.interaction_at) >= d).length;
  }, [interactions]);

  const emailCount = useMemo(() => interactions.filter(i => i.interaction_type === "email").length, [interactions]);

  // Data loaders
  const loadDealStages = async () => {
    try {
      const { data } = await supabase.from("deal_stages").select("id, name, order_index, color").order("order_index");
      const stages = data || [];
      setDealStages(stages);
      setDealFormData(prev => prev.stage_id ? prev : { ...prev, stage_id: stages[0]?.id || "" });
    } catch (e) { console.error(e); }
  };

  const loadClientDetails = async () => {
    setLoading(true);
    try {
      const organizationId = client?.organization_id;
      if (!organizationId) throw new Error("Cliente sem organização associada");
      if (client?.entity_id) {
        const { data: addressesData } = await (supabase as any)
          .from("anew_entity_addresses")
          .select(`id, address_id, is_primary, address_type, anew_addresses:anew_addresses!anew_entity_addresses_address_id_fkey (id, street, number, floor, postal_code, city, district, country)`)
          .eq("entity_id", client.entity_id).is("valid_to", null).order("is_primary", { ascending: false });
        setAddresses((addressesData || []).map((item: any) => ({
          id: item.id, is_primary: item.is_primary, address_type: item.address_type,
          street: item.anew_addresses?.street, number: item.anew_addresses?.number, floor: item.anew_addresses?.floor,
          postal_code: item.anew_addresses?.postal_code, city: item.anew_addresses?.city, district: item.anew_addresses?.district,
        })));
      } else {
        setAddresses([]);
      }

      const { data: dealsData } = await supabase
        .from("deals")
        .select("id, title, value, stage_id, probability, created_at, assigned_to, stages:deal_stages(name, color)")
        .eq("entity_id", client?.entity_id || client?.id)
        .eq("organization_id", organizationId || "")
        .order("created_at", { ascending: false });
      setDeals(dealsData || []);

      const dealIds = (dealsData || []).map(d => d.id);
      const [dealProposalsRes, directProposalsRes] = await Promise.all([
        dealIds.length > 0
          ? supabase
              .from("proposals")
              .select("id, title, value, status, valid_until, created_at, deals:deals(title)")
              .in("deal_id", dealIds)
              .eq("organization_id", organizationId || "")
          : Promise.resolve({ data: [] as any[] }),
        client.entity_id
          ? supabase
              .from("proposals")
              .select("id, title, value, status, valid_until, created_at, deals:deals(title)")
              .eq("entity_id", client.entity_id)
              .eq("organization_id", organizationId || "")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const mergedProposals = Array.from(
        new Map([...(dealProposalsRes.data || []), ...(directProposalsRes.data || [])].map((proposal: any) => [proposal.id, proposal])).values()
      ).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setProposals(mergedProposals as Proposal[]);
    } catch (error: any) {
      toast({ title: "Erro ao carregar dados", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadGroupCompanies = async () => {
    if (!client?.entity_id || !client?.organization_id) {
      setGroupCompanyNames([]);
      return;
    }

    const currentRootId = client.root_organization_id || client.organization_id;
    const { data: otherClients } = await (supabase as any)
      .from("anew_clients")
      .select("organization_id, root_organization_id")
      .eq("entity_id", client.entity_id)
      .neq("organization_id", client.organization_id);

    const sameGroupOrgIds = [...new Set((otherClients || [])
      .filter((row: any) => (row.root_organization_id || row.organization_id) === currentRootId)
      .map((row: any) => row.organization_id)
      .filter(Boolean))];

    if (sameGroupOrgIds.length === 0) {
      setGroupCompanyNames([]);
      return;
    }

    const { data: orgs } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name")
      .in("id", sameGroupOrgIds);

    setGroupCompanyNames((orgs || []).map((org: any) => org.name).filter(Boolean));
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const schema = entityType === "organization" ? contactCompanySchema : contactSchema;
    const validation = schema.safeParse(editFormData);
    if (!validation.success) {
      toast({ title: "Erro de validação", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not found for current auth user");
      const entityId = client.entity_id;

      if (entityId) {
        const normalized = normalizeFirstLast(editFormData.first_name, editFormData.last_name);
        const displayName = composeDisplayName(normalized.first, normalized.last);
        await (supabase as any).from("anew_entities").update({ display_name: displayName, first_name: normalized.first, last_name: normalized.last, updated_at: new Date().toISOString() }).eq("id", entityId);
        if (editFormData.email) {
          const { data: existingEmail } = await (supabase as any).from("anew_entity_emails").select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle();
          if (existingEmail) await (supabase as any).from("anew_entity_emails").update({ email: editFormData.email }).eq("id", existingEmail.id);
          else await (supabase as any).from("anew_entity_emails").insert({ entity_id: entityId, email: editFormData.email, is_primary: true, email_type: "personal", created_by: businessUserId });
        }
        if (editFormData.phone) {
          const { data: existingPhone } = await (supabase as any).from("anew_entity_phones").select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle();
          if (existingPhone) await (supabase as any).from("anew_entity_phones").update({ phone_number: editFormData.phone, country_code: editFormData.phone_country_code }).eq("id", existingPhone.id);
          else await (supabase as any).from("anew_entity_phones").insert({ entity_id: entityId, phone_number: editFormData.phone, country_code: editFormData.phone_country_code, is_primary: true, phone_type: "mobile", created_by: businessUserId });
        }
        await (supabase as any).from("anew_clients").update({ status: editFormData.status, notes: editFormData.notes || null, assigned_to: editFormData.assigned_to || null, updated_at: new Date().toISOString() }).eq("id", client.id);

        // Save VAT/NIF via fiscal_entities + anew_entity_fiscal_entities
        if (editFormData.vat) {
          const { data: existingFiscalLink } = await (supabase as any)
            .from("anew_entity_fiscal_entities")
            .select("id, fiscal_entity_id")
            .eq("entity_id", entityId)
            .eq("is_primary", true)
            .maybeSingle();

          if (existingFiscalLink) {
            // Update existing fiscal entity NIF
            await (supabase as any).from("fiscal_entities").update({ nif: editFormData.vat, updated_at: new Date().toISOString() }).eq("id", existingFiscalLink.fiscal_entity_id);
          } else {
            // Create new fiscal entity and link
            const { data: newFiscal } = await (supabase as any).from("fiscal_entities").insert({ nif: editFormData.vat, country_code: "PT", created_by: businessUserId }).select("id").single();
            if (newFiscal) {
              await (supabase as any).from("anew_entity_fiscal_entities").insert({ entity_id: entityId, fiscal_entity_id: newFiscal.id, is_primary: true, created_by: businessUserId });
            }
          }
        } else {
          // If VAT was cleared, close the fiscal link
          await (supabase as any)
            .from("anew_entity_fiscal_entities")
            .update({ valid_to: new Date().toISOString() })
            .eq("entity_id", entityId)
            .eq("is_primary", true)
            .is("valid_to", null);
        }
      }

      toast({ title: "Cliente actualizado" });
      onOpenChange(false);
      onClientUpdated?.();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const [creatingDeal, setCreatingDeal] = useState(false);
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingDeal) return;
    const value = parseFloat(dealFormData.value) || 0;
    const validation = dealSchema.safeParse({ title: dealFormData.title, description: dealFormData.description, value, probability: 50, expected_close_date: dealFormData.expected_close_date });
    if (!validation.success) { toast({ title: "Erro", description: validation.error.errors[0].message, variant: "destructive" }); return; }
    setCreatingDeal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const selectedStageId = dealFormData.stage_id || dealStages[0]?.id || null;
      if (!selectedStageId) {
        toast({ title: "Erro", description: "Sem fases disponíveis para criar negócio.", variant: "destructive" });
        return;
      }

      // Deduplication: check for recent identical deal (30s window)
      const recentWindow = new Date(Date.now() - 30_000).toISOString();
      let dedupQuery = (supabase.from("deals") as any)
        .select("id")
        .eq("organization_id", client.organization_id)
        .eq("created_by", user.id)
        .eq("title", dealFormData.title)
        .eq("value", value)
        .gte("created_at", recentWindow)
        .limit(1);

      if (client.entity_id) {
        dedupQuery = dedupQuery.eq("entity_id", client.entity_id);
      }

      const { data: recentDup } = await dedupQuery.maybeSingle();

      if (recentDup?.id) {
        toast({ title: "Pedido já estava a ser criado" });
        setShowDealForm(false);
        setDealFormData({ title: "", description: "", value: "", stage_id: dealStages[0]?.id || "", expected_close_date: "" });
        setDealLineItems([]);
        loadClientDetails();
        return;
      }

      // Resolve contact_id from anew_contacts via entity_id
      let contactId: string | null = null;
      if (client.entity_id) {
        const { data: contactMatch } = await supabase
          .from("anew_contacts")
          .select("id")
          .eq("entity_id", client.entity_id)
          .eq("organization_id", client.organization_id)
          .limit(1)
          .maybeSingle();
        contactId = contactMatch?.id || null;
      }

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) { toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" }); return; }
      const { data: newDeal, error: dealErr } = await supabase.from("deals").insert({
        contact_id: contactId,
        entity_id: client.entity_id,
        title: dealFormData.title,
        description: dealFormData.description,
        value,
        probability: 50,
        stage_id: selectedStageId,
        expected_close_date: dealFormData.expected_close_date || null,
        created_by: businessUserId,
        assigned_to: businessUserId,
        organization_id: client.organization_id,
        root_organization_id: client.root_organization_id || client.organization_id,
      }).select("id").single();
      if (dealErr) throw dealErr;

      // Create pipeline_link for traceability
      if (newDeal?.id) {
        await supabase.from("pipeline_links" as any).insert({
          deal_id: newDeal.id,
          organization_id: client.organization_id,
          root_organization_id: client.root_organization_id || client.organization_id,
          status: "active",
        } as any);

        // Save catalog line items as deal_needs + deal_need_items
        if (dealLineItems.length > 0) {
          const { data: dealNeed } = await (supabase as any).from("deal_needs").insert({
            deal_id: newDeal.id,
            title: dealFormData.title || "Itens do negócio",
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
              notes: item.name,
              sort_order: idx,
            }));
            await (supabase as any).from("deal_need_items").insert(needItems);
          }
        }
      }

      // Trigger workflow automation (e.g., auto-create quote)
      if (newDeal?.id && selectedStageId) {
        try {
          await supabase.functions.invoke('execute-workflow', {
            body: {
              source_entity: 'deal',
              entity_id: newDeal.id,
              new_stage_id: selectedStageId,
              organization_id: client.organization_id,
              triggered_by: user.id,
            },
          });
        } catch (wfErr) {
          console.error("Workflow execution error:", wfErr);
        }
      }

      toast({ title: "Deal criado com sucesso" });
      setShowDealForm(false);
      setDealFormData({ title: "", description: "", value: "", stage_id: dealStages[0]?.id || "", expected_close_date: "" });
      setDealLineItems([]);
      loadClientDetails();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setCreatingDeal(false);
    }
  };

  const [creatingProposal, setCreatingProposal] = useState(false);
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingProposal) return;
    if (!selectedDeal) { toast({ title: "Seleccione um deal", variant: "destructive" }); return; }
    const value = parseFloat(proposalFormData.value);
    setCreatingProposal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) { toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" }); return; }
      const { data: newProposal, error: propErr } = await supabase.from("proposals").insert({
        deal_id: selectedDeal,
        entity_id: client.entity_id || null,
        title: proposalFormData.title,
        description: proposalFormData.description,
        value,
        valid_until: proposalFormData.valid_until,
        status: "draft",
        created_by: businessUserId,
        organization_id: client.organization_id,
        root_organization_id: client.root_organization_id || client.organization_id,
      }).select("id").single();
      if (propErr) throw propErr;

      // Save line items as proposal_manual_items
      if (newProposal?.id && proposalLineItems.length > 0) {
        const manualItems = proposalLineItems.map((item, idx) => ({
          proposal_id: newProposal.id,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: idx,
        }));
        await (supabase as any).from("proposal_manual_items").insert(manualItems);
      }

      toast({ title: "Proposta criada com sucesso" });
      setShowProposalForm(false);
      setProposalFormData({ title: "", description: "", value: "", valid_until: "" });
      setProposalLineItems([]);
      setSelectedDeal("");
      loadClientDetails();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setCreatingProposal(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = { draft: "bg-muted text-muted-foreground", sent: "bg-blue-100 text-blue-700", accepted: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };
    return colors[status] || colors.draft;
  };

  const handleWhatsApp = () => {
    if (!client?.phone) {
      toast({ title: "Telefone não definido", description: "Adicione um número de telefone primeiro.", variant: "destructive" });
      return;
    }
    setShowWhatsAppDialog(true);
  };

  const whatsAppContext: WhatsAppContext | null = client ? {
    module: "clients",
    recipientName: [client.first_name, client.last_name].filter(Boolean).join(" ") || "Cliente",
    recipientPhone: client.phone || "",
    recipientPhoneCountryCode: (client.phone_country_code || "+351").replace("+", ""),
    clientId: client.id,
    entityId: client.entity_id,
  } : null;

  const handleCall = () => {
    if (!client?.phone) {
      toast({ title: "Sem telefone", description: "Este cliente não tem número de telefone. Adicione no separador Editar.", variant: "destructive" });
      return;
    }
    setShowCallDialog(true);
  };

  const handleScheduleAction = () => {
    setShowCallDialog(true);
  };

  const handleRefresh = () => { loadClientDetails(); loadEnrichedData(); };

  if (!client) return null;

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0">
          <div className="overflow-y-auto max-h-[92vh] px-6 py-5 space-y-4">
            {/* HEADER */}
            <ClientDetailHeader
              client={client} healthScore={healthScore} tags={tags}
              onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
              onEmail={() => {
                if (!client.email) {
                  toast({ title: "Sem email", description: "Este cliente não tem email configurado. Adicione um email no separador Editar.", variant: "destructive" });
                  return;
                }
                setShowEmailDialog(true);
              }}
              onCall={handleCall}
              onWhatsApp={handleWhatsApp}
              onEdit={() => setActiveTab("edit")}
              onClose={() => onOpenChange(false)}
              onRevertToContact={() => setRevertDialogOpen(true)}
              canRevert={canRevert}
            />

            {/* SUMMARY BAR */}
            {groupCompanyNames.length > 0 && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Cliente do grupo: {groupCompanyNames.length === 1 ? "empresa" : "empresas"} {groupCompanyNames.join(", ")}
              </div>
            )}

            {/* SUMMARY BAR */}
            <ClientSummaryBar
              clientSince={client.client_since || client.created_at || null}
              lastInteractionAt={interactions[0]?.interaction_at || client.last_interaction_at}
              interactionCount={interactions.length}
              totalValue={totalValue}
              activeContracts={activeContractCount}
              nextAction={nextAction}
            />

            {/* SMART SUGGESTION */}
            <ClientSmartSuggestion
              lastInteractionAt={interactions[0]?.interaction_at || client.last_interaction_at}
              hasActiveDeal={deals.length > 0}
              hasNextAction={!!nextAction}
              dealCount={deals.length}
              contractCount={activeContractCount}
              totalValue={totalValue}
              clientName={fullName}
              expiringContract={expiringContract}
              onCall={handleCall}
              onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
              onEmail={() => {
                if (!client.email) {
                  toast({ title: "Sem email", description: "Este cliente não tem email configurado. Adicione um email no separador Editar.", variant: "destructive" });
                  return;
                }
                setShowEmailDialog(true);
              }}
              onSchedule={handleScheduleAction}
            />

            {/* TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="overflow-x-auto">
                <TabsList className="inline-flex w-auto min-w-full">
                  <TabsTrigger value="summary">📊 Resumo</TabsTrigger>
                  <TabsTrigger value="timeline">
                    📜 Timeline {interactions.length > 0 && <Badge className="ml-1" variant="secondary">{interactions.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="contracts">
                    📑 Contratos {activeContractCount > 0 && <Badge className="ml-1" variant="secondary">{activeContractCount}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="deals">
                    📋 Pedidos {deals.length > 0 && <Badge className="ml-1" variant="secondary">{deals.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="proposals">
                    📄 Propostas {proposals.length > 0 && <Badge className="ml-1" variant="secondary">{proposals.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="emails">
                    ✉️ Emails {emailCount > 0 && <Badge className="ml-1" variant="secondary">{emailCount}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="notes">📝 Notas</TabsTrigger>
                  <TabsTrigger value="journey">🗺 Percurso</TabsTrigger>
                  <TabsTrigger value="edit">✏️ Editar</TabsTrigger>
                </TabsList>
              </div>

              {/* SUMMARY */}
              <TabsContent value="summary">
                <ClientSummaryTab
                  client={client} deals={deals} contracts={contracts} interactions={interactions}
                  healthScore={healthScore} nextAction={nextAction} sourceLead={sourceLead} userMap={userMap}
                  onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
                   onScheduleAction={handleScheduleAction}
                   onEditAction={() => setShowEditActionDialog(true)}
                />
              </TabsContent>

              {/* TIMELINE */}
              <TabsContent value="timeline">
                <ContactTimelineTab events={timelineEvents} onRegisterCall={() => setShowCallDialog(true)} />
              </TabsContent>

              {/* CONTRACTS */}
              <TabsContent value="contracts">
                {client.entity_id && client.organization_id && <ClientContractsTab entityId={client.entity_id} organizationId={client.organization_id} />}
              </TabsContent>

              {/* DEALS */}
              <TabsContent value="deals" className="space-y-4 mt-4">
                {!showDealForm ? (
                  <>
                    <Button onClick={() => setShowDealForm(true)} className="w-full"><Plus className="w-4 h-4 mr-2" />Novo Pedido de Proposta</Button>
                    {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : deals.length === 0 ? (
                      <div className="text-center py-8"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">Sem pedidos de proposta</p></div>
                    ) : (
                      <div className="space-y-3">{deals.map(deal => (
                        <Card key={deal.id}>
                          <CardContent className="py-3 px-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{deal.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {deal.stages && <Badge className="text-[10px]" style={{ backgroundColor: deal.stages.color, color: "white" }}>{deal.stages.name}</Badge>}
                                {deal.probability && <span className="text-[10px] text-amber-600">{deal.probability}%</span>}
                                {deal.assigned_to && userMap[deal.assigned_to] && <span className="text-[10px] text-muted-foreground">{userMap[deal.assigned_to]}</span>}
                              </div>
                            </div>
                            <p className="text-sm font-bold text-green-600">€{deal.value?.toLocaleString("pt-PT")}</p>
                          </CardContent>
                        </Card>
                      ))}</div>
                    )}
                  </>
                ) : (
                  <Card><CardHeader><CardTitle className="text-base">Novo Pedido de Proposta</CardTitle></CardHeader><CardContent>
                    <form onSubmit={handleCreateDeal} className="space-y-4">
                      <div className="space-y-2"><Label>Título *</Label><Input value={dealFormData.title} onChange={e => setDealFormData({ ...dealFormData, title: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Descrição</Label><Textarea value={dealFormData.description} onChange={e => setDealFormData({ ...dealFormData, description: e.target.value })} rows={3} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Valor (€) *</Label><Input type="number" step="0.01" value={dealFormData.value} onChange={e => setDealFormData({ ...dealFormData, value: e.target.value })} required /></div>
                        <div className="space-y-2"><Label>Fase *</Label><Select value={dealFormData.stage_id} onValueChange={v => setDealFormData({ ...dealFormData, stage_id: v })}><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger><SelectContent>{dealStages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                      </div>
                      <div className="space-y-2"><Label>Data prevista fecho</Label><Input type="date" value={dealFormData.expected_close_date} onChange={e => setDealFormData({ ...dealFormData, expected_close_date: e.target.value })} /></div>
                      <Separator />
                      <CatalogItemPicker items={dealLineItems} onChange={(newItems) => {
                        setDealLineItems(newItems);
                        const total = newItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
                        if (total > 0) setDealFormData(prev => ({ ...prev, value: total.toFixed(2) }));
                      }} organizationId={client.organization_id} />
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setShowDealForm(false); setDealLineItems([]); }} disabled={creatingDeal}>Cancelar</Button><Button type="submit" disabled={creatingDeal}>{creatingDeal ? "A criar..." : "Criar Pedido"}</Button></div>
                    </form>
                  </CardContent></Card>
                )}
              </TabsContent>

              {/* PROPOSALS */}
              <TabsContent value="proposals" className="space-y-4 mt-4">
                {!showProposalForm ? (
                  <>
                    <Button onClick={() => setShowProposalForm(true)} className="w-full"><Plus className="w-4 h-4 mr-2" />Nova Proposta</Button>
                    {proposals.length === 0 ? (
                      <div className="text-center py-8"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">Sem propostas</p></div>
                    ) : (
                      <div className="space-y-3">{proposals.map(p => (
                        <Card key={p.id}><CardContent className="py-3 px-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{p.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`text-[10px] ${getStatusColor(p.status)}`}>
                                {p.status === "sent" ? "Enviada" : p.status === "accepted" ? "Aceite" : p.status === "draft" ? "Rascunho" : p.status}
                              </Badge>
                              {p.created_at && <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString("pt-PT")}</span>}
                            </div>
                          </div>
                          <p className="text-sm font-bold">€{p.value?.toLocaleString("pt-PT")}</p>
                        </CardContent></Card>
                      ))}</div>
                    )}
                  </>
                ) : (
                  <Card><CardHeader><CardTitle className="text-base">Nova Proposta</CardTitle></CardHeader><CardContent>
                    <form onSubmit={handleCreateProposal} className="space-y-4">
                      <div className="space-y-2"><Label>Deal *</Label><Select value={selectedDeal} onValueChange={setSelectedDeal}><SelectTrigger><SelectValue placeholder="Seleccionar deal..." /></SelectTrigger><SelectContent>{deals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>Título *</Label><Input value={proposalFormData.title} onChange={e => setProposalFormData({ ...proposalFormData, title: e.target.value })} required /></div>
                      <div className="space-y-2"><Label>Descrição</Label><Textarea value={proposalFormData.description} onChange={e => setProposalFormData({ ...proposalFormData, description: e.target.value })} rows={3} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Valor (€) *</Label><Input type="number" step="0.01" value={proposalFormData.value} onChange={e => setProposalFormData({ ...proposalFormData, value: e.target.value })} required /></div>
                        <div className="space-y-2"><Label>Válida até *</Label><Input type="date" value={proposalFormData.valid_until} onChange={e => setProposalFormData({ ...proposalFormData, valid_until: e.target.value })} required /></div>
                      </div>
                      <Separator />
                      <CatalogItemPicker items={proposalLineItems} onChange={(newItems) => {
                        setProposalLineItems(newItems);
                        const total = newItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
                        if (total > 0) setProposalFormData(prev => ({ ...prev, value: total.toFixed(2) }));
                      }} organizationId={client.organization_id} />
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setShowProposalForm(false); setProposalLineItems([]); }}>Cancelar</Button><Button type="submit">Criar Proposta</Button></div>
                    </form>
                  </CardContent></Card>
                )}
              </TabsContent>

              {/* EMAILS */}
              <TabsContent value="emails">
                {client.entity_id && <ContactEmailsTab entityId={client.entity_id} />}
              </TabsContent>

              {/* NOTES */}
              <TabsContent value="notes">
                {client.entity_id && <ClientNotesTab entityId={client.entity_id} organizationId={client.organization_id || ""} />}
              </TabsContent>

              {/* JOURNEY */}
              <TabsContent value="journey">
                <ContactJourneyTab
                  sourceLead={sourceLead} contact={client}
                  convertedAt={client.converted_at || null}
                  isClient={true}
                  clientSince={client.client_since || client.created_at}
                />
              </TabsContent>

              {/* EDIT */}
              <TabsContent value="edit" className="space-y-4 mt-4">
                <form onSubmit={handleUpdateClient} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Nome *</Label><Input value={editFormData.first_name} onChange={e => setEditFormData({ ...editFormData, first_name: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Apelido{entityType !== "organization" ? " *" : ""}</Label><Input value={editFormData.last_name} onChange={e => setEditFormData({ ...editFormData, last_name: e.target.value })} required={entityType !== "organization"} /></div>
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={editFormData.email} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} /></div>
                    <div className="space-y-2"><PhoneInput label="Telefone" phoneValue={editFormData.phone} countryCodeValue={editFormData.phone_country_code} onPhoneChange={v => setEditFormData({ ...editFormData, phone: v })} onCountryCodeChange={v => setEditFormData({ ...editFormData, phone_country_code: v })} /></div>
                    <div className="space-y-2"><Label>NIF</Label><Input value={editFormData.vat} onChange={e => setEditFormData({ ...editFormData, vat: e.target.value })} placeholder="PT123456789" /></div>
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Select value={editFormData.status} onValueChange={v => setEditFormData({ ...editFormData, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="prospect">Prospect</SelectItem>
                          <SelectItem value="customer">Cliente</SelectItem>
                          <SelectItem value="partner">Parceiro</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="churned">Perdido</SelectItem>
                          <SelectItem value="lost">Perdido (Definitivo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Comercial Atribuído</Label>
                      <Select value={editFormData.assigned_to || "unassigned"} onValueChange={v => setEditFormData({ ...editFormData, assigned_to: v === "unassigned" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="Selecionar comercial..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Não atribuído</SelectItem>
                          {orgUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" />Morada</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2"><Label>Morada</Label><Input value={editFormData.address} onChange={e => setEditFormData({ ...editFormData, address: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Código Postal</Label><Input value={editFormData.postal_code} onChange={e => setEditFormData({ ...editFormData, postal_code: e.target.value })} placeholder="1000-001" /></div>
                        <div className="space-y-2"><Label>Cidade</Label><Input value={editFormData.city} onChange={e => setEditFormData({ ...editFormData, city: e.target.value })} /></div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2"><Label>Notas</Label><Textarea value={editFormData.notes} onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })} rows={4} /></div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button type="submit">Guardar Alterações</Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Call Dialog */}
      {client.entity_id && (
        <RegisterCallDialog
          open={showCallDialog} onOpenChange={setShowCallDialog}
          entityId={client.entity_id} entityName={fullName}
          organizationId={client.organization_id || ""} contactId={client.id}
          onCallRegistered={handleRefresh}
          onOpenWhatsApp={() => { setShowCallDialog(false); handleWhatsApp(); }}
          onOpenEmail={() => { setShowCallDialog(false); setShowEmailDialog(true); }}
        />
      )}

      {/* Register Meeting Dialog */}
      {client.entity_id && (
        <RegisterMeetingDialog
          open={showMeetingDialog} onOpenChange={setShowMeetingDialog}
          entityId={client.entity_id} entityName={fullName}
          organizationId={client.organization_id || ""} contactId={client.id}
          onMeetingRegistered={handleRefresh}
          onOpenWhatsApp={() => { setShowMeetingDialog(false); handleWhatsApp(); }}
          onOpenEmail={() => { setShowMeetingDialog(false); setShowEmailDialog(true); }}
        />
      )}

      {/* Send Email Dialog */}
      {client.entity_id && client.email && (
        <SendEntityEmailDialog
          open={showEmailDialog} onOpenChange={setShowEmailDialog}
          module="clients" entityId={client.entity_id} entityName={fullName}
          entityEmail={client.email} organizationId={client.organization_id}
          onSent={handleRefresh}
        />
      )}

      {/* WhatsApp Dialog */}
      <WhatsAppSendDialog
        open={showWhatsAppDialog}
        onOpenChange={setShowWhatsAppDialog}
        context={whatsAppContext}
      />

      {/* Edit Action Dialog */}
      {nextAction?.id && (
        <EditActionDialog
          open={showEditActionDialog}
          onOpenChange={setShowEditActionDialog}
          interactionId={nextAction.id}
          currentType={nextAction.description}
          currentDate={nextAction.date}
          onSaved={handleRefresh}
        />
      )}
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
                setReverting(true);
                try {
                  const success = await revertContactToClient(client.id);
                  if (success) {
                    setRevertDialogOpen(false);
                    onOpenChange(false);
                    onClientUpdated?.();
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
    </>
  );
};
