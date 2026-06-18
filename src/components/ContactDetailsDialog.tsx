import { useState, useEffect, useMemo } from "react";
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
import { Loader2, Plus, FileText, User, Mail, Phone, Briefcase, MapPin, Calendar, History, ListPlus, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { contactSchema, contactCompanySchema, dealSchema, proposalSchema } from "@/lib/validations";
import { PhoneInput } from "@/components/PhoneInput";
import { formatPhoneNumber } from "@/constants/countryCodes";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { differenceInDays } from "date-fns";
import { calculateHealthScore } from "@/hooks/useContactHealthScore";

// New sub-components
import { ContactDetailHeader } from "@/components/contacts/detail/ContactDetailHeader";
import { ContactSummaryBar } from "@/components/contacts/detail/ContactSummaryBar";
import { ContactSmartSuggestion } from "@/components/contacts/detail/ContactSmartSuggestion";
import { ContactInfoTab } from "@/components/contacts/detail/ContactInfoTab";
import { ContactEmailsTab } from "@/components/contacts/detail/ContactEmailsTab";
import { ContactScoringTab } from "@/components/contacts/detail/ContactScoringTab";
import { ContactJourneyTab } from "@/components/contacts/detail/ContactJourneyTab";
import { ContactTimelineTab } from "@/components/contacts/detail/ContactTimelineTab";
import { useEntitySendEvents } from "@/hooks/useEntitySendEvents";
import { RegisterCallDialog } from "@/components/contacts/RegisterCallDialog";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import { CatalogItemPicker, CatalogLineItem } from "@/components/clients/detail/CatalogItemPicker";
import { EditActionDialog } from "@/components/shared/EditActionDialog";
import { ProposalCreateDialog } from "@/components/proposals/ProposalCreateDialog";

interface ContactDetailsDialogProps {
  contact: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactUpdated?: () => void;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  probability?: number;
  created_at?: string;
  assigned_to?: string;
  stages: { name: string; color: string } | null;
}

interface Proposal {
  id: string;
  title: string;
  value: number;
  status: string;
  valid_until: string;
  created_at?: string;
  deals: { title: string } | null;
}

interface StatusHistory {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by: string | null;
  user_name: string | null;
}

interface MarketingList {
  id: string;
  name: string;
}

interface ContactList {
  id: string;
  list_id: string;
  marketing_lists: { name: string } | null;
}

export const ContactDetailsDialog = ({ contact, open, onOpenChange, onContactUpdated }: ContactDetailsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [availableLists, setAvailableLists] = useState<MarketingList[]>([]);
  const [selectedNewListIds, setSelectedNewListIds] = useState<Set<string>>(new Set());
  const [showAddListForm, setShowAddListForm] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [savingContact, setSavingContact] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<string>("");
  const [dealStages, setDealStages] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();
  const { t } = useTranslation();

  // New state
  const [interactions, setInteractions] = useState<any[]>([]);
  const [portalSends, setPortalSends] = useState<any[]>([]);
  const [tags, setTags] = useState<{ id: string; tag: string; color: string | null }[]>([]);
  const [sourceLead, setSourceLead] = useState<any>(null);
  const [assignedUserName, setAssignedUserName] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [overrideWhatsAppCtx, setOverrideWhatsAppCtx] = useState<{ id: string; title: string; value: number | null; type: "deal" | "proposal" | "quote" } | null>(null);
  const [showEditActionDialog, setShowEditActionDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [entityType, setEntityType] = useState<string>("person");

  const [editFormData, setEditFormData] = useState({
    first_name: "", last_name: "", email: "", phone: "", phone_country_code: "+351",
    vat: "", position: "", status: "", notes: "", organization_id: "", address: "", city: "", postal_code: "",
    assigned_to: "",
  });

  const [dealFormData, setDealFormData] = useState({ title: "", description: "", value: "", stage_id: "", expected_close_date: "" });
  const [proposalFormData, setProposalFormData] = useState({ title: "", description: "", value: "", valid_until: "" });
  const [dealLineItems, setDealLineItems] = useState<CatalogLineItem[]>([]);
  const [proposalLineItems, setProposalLineItems] = useState<CatalogLineItem[]>([]);

  const contactId = contact?.id;

  useEffect(() => {
    if (open && contact) {
      loadContactDetails();
      loadDealStages();
      loadTeamMembers();
      loadContactLists();
      loadAvailableLists();
      loadEnrichedData();
      setActiveTab("info");
      setEditFormData({
        first_name: contact.first_name || "", last_name: contact.last_name || "",
        email: contact.email || "", phone: contact.phone || "", phone_country_code: contact.phone_country_code || "+351",
        vat: contact.vat || "", position: contact.position || "", status: contact.status || "active",
        notes: contact.notes || "", organization_id: contact.organization_id || "",
        address: "", city: "", postal_code: "",
        assigned_to: contact.assigned_to || "",
      });
      setSelectedNewListIds(new Set());
      setShowAddListForm(false);
      // Detect entity type
      if (contact.entity_id) {
        supabase.from("anew_entities").select("type").eq("id", contact.entity_id).maybeSingle().then(({ data }) => {
          setEntityType(data?.type || "person");
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  // Once entity addresses load, hydrate the edit form's address fields from
  // the primary address (anew_addresses) so the user sees what's actually
  // stored — not the empty/legacy anew_contacts.address column.
  useEffect(() => {
    if (!open) return;
    if (!addresses || addresses.length === 0) return;
    const primary = addresses.find((a: any) => a.is_primary) || addresses[0];
    if (!primary) return;
    setEditFormData((prev) => {
      // Only hydrate fields the user hasn't manually edited yet (still empty)
      if (prev.address || prev.city || prev.postal_code) return prev;
      return {
        ...prev,
        address: primary.street || prev.address,
        city: primary.city || prev.city,
        postal_code: primary.postal_code || prev.postal_code,
      };
    });
  }, [open, addresses]);

  // Load enriched data (interactions, tags, source lead, assigned user)
  const loadEnrichedData = async () => {
    const entityId = contact.entity_id;
    if (!entityId) return;

    try {
      const [interactionsRes, tagsRes, leadRes] = await Promise.all([
        supabase.from("entity_interactions").select("*").eq("entity_id", entityId).order("interaction_at", { ascending: false }).limit(20),
        supabase.from("contact_tags").select("id, tag, color").eq("entity_id", entityId),
        contact.source_lead_id ? supabase.from("anew_leads").select("id, source, campaign_id, created_at").eq("id", contact.source_lead_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      setInteractions(interactionsRes.data || []);
      setTags(tagsRes.data || []);
      if (leadRes.data) {
        setSourceLead({ ...leadRes.data, source_type: leadRes.data.source, campaign: leadRes.data.campaign_id });
      } else {
        setSourceLead(null);
      }

      // Resolve assigned user name
      if (contact.assigned_to) {
        const { data: au } = await supabase.from("anew_users").select("name").eq("id", contact.assigned_to).maybeSingle();
        setAssignedUserName(au?.name || null);
      }

      // Build user map for interaction actors
      const actorIds = [...new Set((interactionsRes.data || []).map((i: any) => i.created_by).filter(Boolean))];
      const userMapLocal: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: users } = await supabase.from("anew_users").select("id, name").in("id", actorIds);
        (users || []).forEach((u: any) => { userMapLocal[u.id] = u.name; });
      }

      // Load portal sends for this entity
      const { data: portalData } = await (supabase as any)
        .from("client_portal_users")
        .select("id, proposal_id, contract_id, quote_id, created_by, created_at, portal_status")
        .eq("entity_id", entityId);
      
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
    const lastInteraction = interactions[0]?.interaction_at || contact?.last_interaction_at || null;
    return calculateHealthScore({
      lastInteractionAt: lastInteraction,
      hasActiveDeal: deals.length > 0,
      hasActiveProposal: proposals.length > 0,
      hasEmail: !!contact?.email,
      hasPhone: !!contact?.phone,
      hasVat: !!contact?.vat,
      interactionCount30d: count30d,
    });
  }, [interactions, deals, proposals, contact]);

  const pipelineValue = useMemo(() => {
    // Use proposal value as it's the last stage before contract; fallback to deals if no proposals
    const proposalsTotal = proposals.reduce((sum, p) => sum + (p.value || 0), 0);
    if (proposalsTotal > 0) return proposalsTotal;
    return deals.reduce((sum, d) => sum + (d.value || 0), 0);
  }, [deals, proposals]);

  const lastSentiment = useMemo(() => {
    const withSentiment = interactions.find(i => i.sentiment);
    return withSentiment ? { sentiment: withSentiment.sentiment, date: withSentiment.interaction_at } : null;
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
    const last = interactions[0]?.interaction_at || contact?.last_interaction_at || null;
    return last ? differenceInDays(new Date(), new Date(last)) : null;
  }, [interactions, contact]);

  const { events: sendEvents } = useEntitySendEvents(contact?.entity_id || null);

  const timelineEvents = useMemo(() => {
    const events: any[] = [];
    // Add interactions
    interactions.forEach(i => {
      events.push({
        id: i.id,
        type: i.interaction_type,
        title: i.interaction_type === "call" ? "Chamada realizada" : i.interaction_type === "email" ? `Email enviado: "${i.subject || ""}"` : i.interaction_type === "meeting" ? "Reunião" : i.interaction_type === "whatsapp" ? "WhatsApp enviado" : "Nota",
        description: i.notes || i.subject,
        date: i.interaction_at,
        actor: userMap[i.created_by] || null,
        sentiment: i.sentiment,
      });
    });
    // Add document send events (proposal/quote/contract via email/whatsapp/portal)
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
    // Add conversion event if source lead exists
    if (contact?.converted_at || contact?.created_at) {
      events.push({
        id: "conversion-" + (contact?.id ?? "unknown"),
        type: "conversion",
        title: "Convertido de Lead para Contacto",
        description: sourceLead ? `Origem: ${sourceLead.source_type || "Website"}${sourceLead.campaign ? ` · Campanha: ${sourceLead.campaign}` : ""}` : null,
        date: contact?.converted_at || contact?.created_at,
        actor: null,
      });
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events;
  }, [interactions, sendEvents, contact, sourceLead, userMap]);

  // ---- Existing functions (preserved) ----

  const loadBusinessUnits = async () => {
    try {
      const { data, error } = await (supabase as any).from("anew_organizations").select("id, name").order("name");
      if (error) throw error;
      setBusinessUnits(data || []);
    } catch (error: any) {
      console.error("Error loading organizations:", error);
    }
  };

  const loadTeamMembers = async () => {
    try {
      // Get client role id to exclude
      const { data: clientRole } = await (supabase as any).from("anew_roles").select("id").eq("code", "client").maybeSingle();
      const clientRoleId = clientRole?.id;
      
      const orgId = contact?.organization_id || contact?.root_organization_id;
      if (!orgId) return;
      
      const { data: memberships } = await (supabase as any)
        .from("anew_memberships")
        .select("user_id, role_id")
        .eq("organization_id", orgId)
        .eq("status", "active");
      
      if (!memberships || memberships.length === 0) return;
      
      // Filter out client role
      const userIds = (memberships as any[])
        .filter((m: any) => !clientRoleId || m.role_id !== clientRoleId)
        .map((m: any) => m.user_id);
      
      if (userIds.length === 0) return;
      
      const { data: users } = await (supabase as any)
        .from("anew_users")
        .select("id, name")
        .in("id", userIds)
        .order("name");
      
      setTeamMembers(users || []);
    } catch (e) {
      console.error("Error loading team members:", e);
    }
  };

  const loadDealStages = async () => {
    try {
      const { data, error } = await supabase.from("deal_stages").select("*").order("order_index");
      if (error) throw error;
      setDealStages(data || []);
    } catch (error: any) {
      console.error("Error loading deal stages:", error);
    }
  };

  const loadContactLists = async () => {
    setContactLists([]);
  };

  const loadAvailableLists = async () => {
    try {
      const orgId = contact?.organization_id || contact?.root_organization_id;
      if (!orgId) {
        setAvailableLists([]);
        return;
      }
      const { data, error } = await supabase.from("marketing_lists").select("id, name").eq("organization_id", orgId).order("name");
      if (error) throw error;
      setAvailableLists(data || []);
    } catch (error: any) {
      console.error("Error loading available lists:", error);
    }
  };

  const handleAddToLists = async () => {
    toast({ title: "Feature deprecated" });
  };

  const handleRemoveFromList = async (_associationId: string) => {};

  const getListsNotYetAdded = () => {
    const addedListIds = new Set(contactLists.map(cl => cl.list_id));
    return availableLists.filter(list => !addedListIds.has(list.id));
  };

  const loadContactDetails = async () => {
    setLoading(true);
    try {
      if (contact.entity_id) {
        const { data: addressesData } = await (supabase as any)
          .from("anew_entity_addresses")
          .select(`id, address_id, is_primary, address_type, anew_addresses:anew_addresses!anew_entity_addresses_address_id_fkey (id, street, number, floor, postal_code, city, district, country)`)
          .eq("entity_id", contact.entity_id)
          .is("valid_to", null)
          .order("is_primary", { ascending: false });

        const formatted = (addressesData || []).map((item: any) => ({
          id: item.id, is_primary: item.is_primary, address_type: item.address_type,
          street: item.anew_addresses?.street, number: item.anew_addresses?.number, floor: item.anew_addresses?.floor,
          postal_code: item.anew_addresses?.postal_code, city: item.anew_addresses?.city, district: item.anew_addresses?.district,
        }));
        setAddresses(formatted);
      } else {
        setAddresses([]);
      }

      const { data: dealsData } = await supabase
        .from("deals")
        .select("id, title, value, stage_id, probability, created_at, assigned_to, stages:deal_stages(name, color)")
        .eq("entity_id", contact.entity_id || contact.id)
        .order("created_at", { ascending: false });
      setDeals(dealsData || []);

      const dealIds = (dealsData || []).map(d => d.id);
      const [dealProposalsRes, directProposalsRes] = await Promise.all([
        dealIds.length > 0
          ? supabase
              .from("proposals")
              .select("id, title, value, status, valid_until, created_at, deals:deals(title)")
              .in("deal_id", dealIds)
          : Promise.resolve({ data: [] as any[] }),
        contact.entity_id
          ? supabase
              .from("proposals")
              .select("id, title, value, status, valid_until, created_at, deals:deals(title)")
              .eq("entity_id", contact.entity_id)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const mergedProposals = Array.from(
        new Map([...(dealProposalsRes.data || []), ...(directProposalsRes.data || [])].map((proposal: any) => [proposal.id, proposal])).values()
      ).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setProposals(mergedProposals as Proposal[]);

      setStatusHistory([]);
    } catch (error: any) {
      toast({ title: t('contacts.details.loadError'), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingContact) return;
    const schema = entityType === "organization" ? contactCompanySchema : contactSchema;
    const validation = schema.safeParse(editFormData);
    if (!validation.success) {
      toast({ title: "Validation Error", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    setSavingContact(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not found for current auth user");
      const entityId = contact.entity_id;

      if (entityId) {
        const normalized = normalizeFirstLast(editFormData.first_name, editFormData.last_name);
        const displayName = composeDisplayName(normalized.first, normalized.last);
        await (supabase as any).from("anew_entities").update({ display_name: displayName, first_name: normalized.first, last_name: normalized.last, updated_at: new Date().toISOString() }).eq("id", entityId);

        // Email: upsert primary
        if (editFormData.email) {
          const { data: existingEmail } = await (supabase as any).from("anew_entity_emails").select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle();
          if (existingEmail) {
            await (supabase as any).from("anew_entity_emails").update({ email: editFormData.email }).eq("id", existingEmail.id);
          } else {
            await (supabase as any).from("anew_entity_emails").insert({ entity_id: entityId, email: editFormData.email, is_primary: true, email_type: "personal", created_by: businessUserId });
          }
        }

        // Phone: upsert primary
        if (editFormData.phone) {
          const { data: existingPhone } = await (supabase as any).from("anew_entity_phones").select("id").eq("entity_id", entityId).eq("is_primary", true).maybeSingle();
          if (existingPhone) {
            await (supabase as any).from("anew_entity_phones").update({ phone_number: editFormData.phone, country_code: editFormData.phone_country_code }).eq("id", existingPhone.id);
          } else {
            await (supabase as any).from("anew_entity_phones").insert({ entity_id: entityId, phone_number: editFormData.phone, country_code: editFormData.phone_country_code, is_primary: true, phone_type: "mobile", created_by: businessUserId });
          }
        }

        // NIF/VAT: upsert fiscal entity link
        if (editFormData.vat) {
          const { data: existingFiscalLink } = await (supabase as any).from("anew_entity_fiscal_entities").select("id, fiscal_entity_id").eq("entity_id", entityId).is("valid_to", null).maybeSingle();
          if (existingFiscalLink) {
            await (supabase as any).from("fiscal_entities").update({ tax_id: editFormData.vat, updated_at: new Date().toISOString() }).eq("id", existingFiscalLink.fiscal_entity_id);
          } else {
            const { data: newFiscal } = await (supabase as any).from("fiscal_entities").insert({ tax_id: editFormData.vat, entity_type: entityType === "organization" ? "company" : "individual", created_by: businessUserId }).select("id").single();
            if (newFiscal) {
              await (supabase as any).from("anew_entity_fiscal_entities").insert({ entity_id: entityId, fiscal_entity_id: newFiscal.id, is_primary: true, created_by: businessUserId });
            }
          }
        }

        // Address: upsert primary address (errors are surfaced, not swallowed)
        if (editFormData.address || editFormData.city || editFormData.postal_code) {
          const { data: existingAddrLink, error: addrLinkErr } = await (supabase as any)
            .from("anew_entity_addresses")
            .select("id, address_id")
            .eq("entity_id", entityId)
            .eq("is_primary", true)
            .is("valid_to", null)
            .maybeSingle();
          if (addrLinkErr) throw addrLinkErr;
          const street = editFormData.address || "";
          const postal = editFormData.postal_code || "";
          const city = editFormData.city || "";
          const addressPayload = {
            street,
            number: "",
            city,
            postal_code: postal,
            country: "PT",
            address_key: `${street}-${postal}-${city}`.toLowerCase().replace(/\s+/g, "-"),
            updated_at: new Date().toISOString(),
          };
          if (existingAddrLink) {
            const { error: updErr } = await (supabase as any)
              .from("anew_addresses")
              .update(addressPayload)
              .eq("id", existingAddrLink.address_id);
            if (updErr) throw updErr;
          } else {
            const newAddressId = crypto.randomUUID();
            const { error: insAddrErr } = await (supabase as any)
              .from("anew_addresses")
              .insert({ id: newAddressId, ...addressPayload, created_by: businessUserId });
            if (insAddrErr) throw insAddrErr;
            const { error: linkErr } = await (supabase as any)
              .from("anew_entity_addresses")
              .insert({ entity_id: entityId, address_id: newAddressId, is_primary: true, address_type: "main", created_by: businessUserId });
            if (linkErr) throw linkErr;
          }
        }

        const { error: contactErr } = await (supabase as any).from("anew_contacts").update({ status: editFormData.status, notes: editFormData.notes || null, position: editFormData.position || null, assigned_to: editFormData.assigned_to || null, updated_at: new Date().toISOString() }).eq("id", contact.id);
        if (contactErr) throw contactErr;

        // Sync status to anew_entity_roles so listings reflect the change
        if (entityId) {
          const orgId = contact.root_organization_id || contact.organization_id;
          if (orgId) {
            await (supabase as any).from("anew_entity_roles").update({ status: editFormData.status, updated_at: new Date().toISOString() }).eq("entity_id", entityId).eq("role", "contact").eq("organization_id", orgId);
          }
        }
      } else {
        // No entity_id: only update fields that actually exist on anew_contacts
        // (the legacy first_name/email/phone/vat columns have been removed from this table).
        const { error } = await (supabase as any).from("anew_contacts").update({
          position: editFormData.position || null,
          status: editFormData.status,
          notes: editFormData.notes || null,
          organization_id: editFormData.organization_id || null,
          assigned_to: editFormData.assigned_to || null,
          updated_at: new Date().toISOString(),
        }).eq("id", contact.id);
        if (error) throw error;
      }

      toast({ title: t('contacts.details.contactUpdated') });
      onOpenChange(false);
      onContactUpdated?.();
    } catch (error: any) {
      toast({ title: t('contacts.details.updateError'), description: error.message, variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  };

  const [creatingDeal, setCreatingDeal] = useState(false);
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingDeal) return;
    const value = parseFloat(dealFormData.value) || 0;
    const validation = dealSchema.safeParse({ title: dealFormData.title, description: dealFormData.description, value, probability: 50, expected_close_date: dealFormData.expected_close_date });
    if (!validation.success) {
      toast({ title: "Validation Error", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    setCreatingDeal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const selectedStageId = dealFormData.stage_id;

      // Deduplication: check for recent identical deal (30s window)
      const recentWindow = new Date(Date.now() - 30_000).toISOString();
      const { data: recentDup } = await (supabase.from("deals") as any)
        .select("id")
        .eq("organization_id", contact.organization_id)
        .eq("created_by", user.id)
        .eq("title", dealFormData.title)
        .eq("value", value)
        .gte("created_at", recentWindow)
        .limit(1)
        .maybeSingle();

      if (recentDup?.id) {
        toast({ title: "Pedido já estava a ser criado" });
        setShowDealForm(false);
        setDealFormData({ title: "", description: "", value: "", stage_id: "", expected_close_date: "" });
        loadContactDetails();
        return;
      }

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) { toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" }); return; }
      const { data: newDeal, error } = await supabase.from("deals").insert({ contact_id: contact.id, entity_id: contact.entity_id || null, title: dealFormData.title, description: dealFormData.description, value, probability: 50, stage_id: selectedStageId, expected_close_date: dealFormData.expected_close_date || null, created_by: businessUserId, assigned_to: businessUserId, organization_id: contact.organization_id, root_organization_id: contact.root_organization_id || contact.organization_id }).select("id").single();
      if (error) throw error;

      // Trigger workflow automation (e.g., auto-create quote)
      if (newDeal?.id && selectedStageId) {
        try {
          await supabase.functions.invoke('execute-workflow', {
            body: {
              source_entity: 'deal',
              entity_id: newDeal.id,
              new_stage_id: selectedStageId,
              organization_id: contact.organization_id,
              triggered_by: user.id,
            },
          });
        } catch (wfErr) {
          console.error("Workflow execution error:", wfErr);
        }
      }

      toast({ title: t('contacts.details.dealCreated') });
      setShowDealForm(false);
      setDealFormData({ title: "", description: "", value: "", stage_id: "", expected_close_date: "" });
      loadContactDetails();
    } catch (error: any) {
      toast({ title: t('contacts.details.dealCreateError'), description: error.message, variant: "destructive" });
    } finally {
      setCreatingDeal(false);
    }
  };

  const [creatingProposal, setCreatingProposal] = useState(false);
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingProposal) return;
    if (!selectedDeal) { toast({ title: "Select a deal", description: "You need to select a deal to create a proposal", variant: "destructive" }); return; }
    const value = parseFloat(proposalFormData.value);
    const validation = proposalSchema.safeParse({ title: proposalFormData.title, description: proposalFormData.description, value, notes: "", valid_until: proposalFormData.valid_until });
    if (!validation.success) {
      toast({ title: "Validation Error", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    setCreatingProposal(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) { toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador.", variant: "destructive" }); return; }
      const { error } = await supabase.from("proposals").insert({ deal_id: selectedDeal, entity_id: contact.entity_id || null, title: proposalFormData.title, description: proposalFormData.description, value, valid_until: proposalFormData.valid_until, status: "draft", created_by: businessUserId, organization_id: contact.organization_id, root_organization_id: contact.root_organization_id || contact.organization_id });
      if (error) throw error;
      toast({ title: t('contacts.details.proposalCreated') });
      setShowProposalForm(false);
      setProposalFormData({ title: "", description: "", value: "", valid_until: "" });
      setSelectedDeal("");
      loadContactDetails();
    } catch (error: any) {
      toast({ title: t('contacts.details.proposalCreateError'), description: error.message, variant: "destructive" });
    } finally {
      setCreatingProposal(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-muted text-muted-foreground", sent: "bg-info/10 text-info",
      accepted: "bg-success/10 text-success", rejected: "bg-destructive/10 text-destructive",
    };
    return colors[status] || colors.draft;
  };

  const handleWhatsApp = () => {
    if (!contact.phone) {
      toast({ title: "Telefone não definido", description: "Adicione um número de telefone primeiro.", variant: "destructive" });
      return;
    }
    setShowWhatsAppDialog(true);
  };

  const whatsAppContext: WhatsAppContext | null = contact ? {
    module: overrideWhatsAppCtx?.type === "proposal" ? "proposals" : overrideWhatsAppCtx?.type === "quote" ? "quotes" : "contacts",
    recipientName: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contacto",
    recipientPhone: contact.phone || "",
    recipientPhoneCountryCode: (contact.phone_country_code || "+351").replace("+", ""),
    contactId: contact.id,
    entityId: contact.entity_id,
    hasActiveDeal: deals.length > 0 || overrideWhatsAppCtx?.type === "deal",
    dealName: overrideWhatsAppCtx?.type === "deal" ? overrideWhatsAppCtx.title : deals[0]?.title,
    proposalTitle: overrideWhatsAppCtx?.type === "proposal" ? overrideWhatsAppCtx.title : undefined,
    proposalValue: overrideWhatsAppCtx?.type === "proposal" ? (overrideWhatsAppCtx.value || 0) : undefined,
    quoteTitle: overrideWhatsAppCtx?.type === "quote" ? overrideWhatsAppCtx.title : undefined,
    quoteValue: overrideWhatsAppCtx?.type === "quote" ? (overrideWhatsAppCtx.value || 0) : undefined,
  } : null;

  const interactionCount30d = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return interactions.filter(i => new Date(i.interaction_at) >= d).length;
  }, [interactions]);

  const emailCount = useMemo(() => interactions.filter(i => i.interaction_type === "email").length, [interactions]);

  if (!contact) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0" hideClose>
          <div className="overflow-y-auto max-h-[92vh] px-6 py-5 space-y-4">
            {/* HEADER */}
            <ContactDetailHeader
              contact={contact}
              healthScore={healthScore}
              tags={tags}
              onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
              onEmail={() => setShowEmailDialog(true)}
              onCall={() => setShowCallDialog(true)}
              onWhatsApp={handleWhatsApp}
              onClose={() => onOpenChange(false)}
            />

            {/* SUMMARY BAR */}
            <ContactSummaryBar
              convertedAt={contact.converted_at || null}
              lastInteractionAt={interactions[0]?.interaction_at || contact.last_interaction_at}
              interactionCount={interactions.length}
              pipelineValue={pipelineValue}
              nextAction={nextAction}
            />

            {/* SMART SUGGESTION */}
            <ContactSmartSuggestion
              lastInteractionAt={interactions[0]?.interaction_at || contact.last_interaction_at}
              hasActiveDeal={deals.length > 0}
              hasNextAction={!!nextAction}
              dealCount={deals.length}
              proposalCount={proposals.length}
              contactName={[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
              onCall={() => setShowCallDialog(true)}
              onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
            />

            {/* TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="overflow-x-auto">
                <TabsList className="inline-flex w-auto min-w-full">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="edit">Editar</TabsTrigger>
                  <TabsTrigger value="lists">
                    <ListPlus className="w-3.5 h-3.5 mr-1" />
                    Listas
                  </TabsTrigger>
                  <TabsTrigger value="deals">
                    Pedidos de Proposta {deals.length > 0 && <Badge className="ml-1" variant="secondary">{deals.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="proposals">
                    Propostas {proposals.length > 0 && <Badge className="ml-1" variant="secondary">{proposals.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="emails">
                    ✉️ Emails {emailCount > 0 && <Badge className="ml-1" variant="secondary">{emailCount}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="timeline">📜 Timeline</TabsTrigger>
                  <TabsTrigger value="scoring">📈 Scoring</TabsTrigger>
                  <TabsTrigger value="journey">🗺 Percurso</TabsTrigger>
                </TabsList>
              </div>

              {/* TAB: INFO (enhanced) */}
              <TabsContent value="info" className="mt-4">
                <ContactInfoTab
                  contact={contact}
                  deals={deals}
                  proposals={proposals}
                  interactions={interactions}
                  tags={tags}
                  addresses={addresses}
                  assignedUserName={assignedUserName}
                  sourceLead={sourceLead}
                  lastSentiment={lastSentiment}
                  nextAction={nextAction}
                  userMap={userMap}
                  onCreateDeal={() => { setActiveTab("deals"); setShowDealForm(true); }}
                  onRegisterCall={() => setShowCallDialog(true)}
                  onAddTag={() => {/* TODO: open tag dialog */}}
                   onScheduleAction={() => setShowCallDialog(true)}
                   onEditAction={() => setShowEditActionDialog(true)}
                 />
              </TabsContent>

              {/* TAB: EDIT (preserved exactly) */}
              <TabsContent value="edit" className="space-y-4 mt-4">
                <form onSubmit={handleUpdateContact} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">{t('contacts.details.firstName')} *</Label>
                      <Input id="first_name" value={editFormData.first_name} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">{t('contacts.details.lastName')}{entityType !== "organization" ? " *" : ""}</Label>
                      <Input id="last_name" value={editFormData.last_name} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} required={entityType !== "organization"} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('contacts.details.email')}</Label>
                      <Input id="email" type="email" value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <PhoneInput label={t('contacts.details.phone')} phoneValue={editFormData.phone} countryCodeValue={editFormData.phone_country_code} onPhoneChange={(value) => setEditFormData({ ...editFormData, phone: value })} onCountryCodeChange={(value) => setEditFormData({ ...editFormData, phone_country_code: value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vat">{t('contacts.form.vat')}</Label>
                      <Input id="vat" value={editFormData.vat} onChange={(e) => setEditFormData({ ...editFormData, vat: e.target.value })} placeholder="PT123456789" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="position">{t('contacts.details.position')}</Label>
                      <Input id="position" value={editFormData.position} onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">{t('contacts.details.status')}</Label>
                      <Select value={editFormData.status} onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t('common.active')}</SelectItem>
                          <SelectItem value="inactive">{t('common.inactive') || 'Inativo'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business_unit">{t('contacts.details.businessUnit')}</Label>
                      <Select value={editFormData.organization_id || "none"} onValueChange={(value) => setEditFormData({ ...editFormData, organization_id: value === "none" ? "" : value })}>
                        <SelectTrigger><SelectValue placeholder={t('contacts.details.selectUnit')} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('contacts.details.noneF')}</SelectItem>
                          {businessUnits.map((unit) => (<SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assigned_to" className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Comercial Atribuído</Label>
                      <Select value={editFormData.assigned_to || "none"} onValueChange={(value) => setEditFormData({ ...editFormData, assigned_to: value === "none" ? "" : value })}>
                        <SelectTrigger><SelectValue placeholder="Selecionar comercial" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {teamMembers.map((m) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" />{t('contacts.details.address')}</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="address">{t('contacts.form.address')}</Label>
                        <Input id="address" value={editFormData.address} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} placeholder={t('contacts.form.addressPlaceholder')} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="postal_code">{t('contacts.form.postalCode')}</Label>
                          <Input id="postal_code" value={editFormData.postal_code} onChange={(e) => setEditFormData({ ...editFormData, postal_code: e.target.value })} placeholder="1000-001" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="city">{t('contacts.form.city')}</Label>
                          <Input id="city" value={editFormData.city} onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })} placeholder={t('contacts.form.cityPlaceholder')} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('contacts.details.notes')}</Label>
                    <Textarea id="notes" value={editFormData.notes} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} rows={4} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={savingContact}>{t('common.cancel')}</Button>
                    <Button type="submit" disabled={savingContact}>{savingContact ? "A guardar..." : t('contacts.details.saveChanges')}</Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB: LISTS (preserved exactly) */}
              <TabsContent value="lists" className="space-y-4 mt-4">
                {!showAddListForm ? (
                  <>
                    <Button onClick={() => setShowAddListForm(true)} className="w-full"><Plus className="w-4 h-4 mr-2" />{t('contacts.details.addToLists')}</Button>
                    {contactLists.length === 0 ? (
                      <div className="text-center py-8"><ListPlus className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">{t('contacts.details.noLists')}</p></div>
                    ) : (
                      <div className="space-y-2">
                        {contactLists.map((cl) => (
                          <Card key={cl.id}><CardContent className="flex items-center justify-between py-3"><div className="flex items-center gap-2"><ListPlus className="w-4 h-4 text-muted-foreground" /><span className="font-medium">{cl.marketing_lists?.name}</span></div><Button variant="ghost" size="sm" onClick={() => handleRemoveFromList(cl.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button></CardContent></Card>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Card><CardHeader><CardTitle className="text-base">{t('contacts.details.addToLists')}</CardTitle></CardHeader><CardContent className="space-y-4">
                    {getListsNotYetAdded().length === 0 ? (<p className="text-muted-foreground text-center py-4">{t('contacts.details.alreadyInAllLists')}</p>) : (
                      <ScrollArea className="h-[200px] pr-4"><div className="space-y-2">{getListsNotYetAdded().map((list) => (
                        <div key={list.id} className="flex items-center space-x-2">
                          <Checkbox id={`list-${list.id}`} checked={selectedNewListIds.has(list.id)} onCheckedChange={(checked) => { const newSet = new Set(selectedNewListIds); if (checked) { newSet.add(list.id); } else { newSet.delete(list.id); } setSelectedNewListIds(newSet); }} />
                          <label htmlFor={`list-${list.id}`} className="text-sm cursor-pointer">{list.name}</label>
                        </div>
                      ))}</div></ScrollArea>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => { setShowAddListForm(false); setSelectedNewListIds(new Set()); }}>{t('common.cancel')}</Button>
                      <Button onClick={handleAddToLists} disabled={selectedNewListIds.size === 0}>{t('contacts.details.addCount', { count: selectedNewListIds.size })}</Button>
                    </div>
                  </CardContent></Card>
                )}
              </TabsContent>

              {/* TAB: DEALS (preserved exactly) */}
              <TabsContent value="deals" className="space-y-4 mt-4">
                {!showDealForm ? (
                  <>
                    <Button onClick={() => setShowDealForm(true)} className="w-full"><Plus className="w-4 h-4 mr-2" />{t('contacts.details.newDeal')}</Button>
                    {loading ? (<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>) : deals.length === 0 ? (<div className="text-center py-8"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">{t('contacts.details.noDeals')}</p></div>) : (
                      <div className="space-y-3">{deals.map((deal) => (
                        <Card key={deal.id}><CardHeader className="pb-3"><CardTitle className="text-base flex items-center justify-between">{deal.title}{deal.stages && (<Badge style={{ backgroundColor: deal.stages.color }} className="text-white">{deal.stages.name}</Badge>)}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t('contacts.details.valueLabel')}: <span className="font-semibold text-foreground">€{deal.value?.toLocaleString('pt-PT')}</span></p></CardContent></Card>
                      ))}</div>
                    )}
                  </>
                ) : (
                  <Card><CardHeader><CardTitle className="text-base">{t('contacts.details.newDeal')}</CardTitle></CardHeader><CardContent>
                    <form onSubmit={handleCreateDeal} className="space-y-4">
                      <div className="space-y-2"><Label htmlFor="deal-title">{t('contacts.details.title')} *</Label><Input id="deal-title" value={dealFormData.title} onChange={(e) => setDealFormData({ ...dealFormData, title: e.target.value })} required /></div>
                      <div className="space-y-2"><Label htmlFor="deal-description">{t('contacts.details.description')}</Label><Textarea id="deal-description" value={dealFormData.description} onChange={(e) => setDealFormData({ ...dealFormData, description: e.target.value })} rows={3} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label htmlFor="deal-value">{t('contacts.details.value')} (€) *</Label><Input id="deal-value" type="number" step="0.01" value={dealFormData.value} onChange={(e) => setDealFormData({ ...dealFormData, value: e.target.value })} required /></div>
                        <div className="space-y-2"><Label htmlFor="deal-stage">{t('contacts.details.stage')} *</Label><Select value={dealFormData.stage_id} onValueChange={(value) => setDealFormData({ ...dealFormData, stage_id: value })} required><SelectTrigger><SelectValue placeholder={t('contacts.details.selectStage')} /></SelectTrigger><SelectContent>{dealStages.map((stage) => (<SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>))}</SelectContent></Select></div>
                      </div>
                      <div className="space-y-2"><Label htmlFor="deal-close-date">{t('contacts.details.expectedCloseDate')}</Label><Input id="deal-close-date" type="date" value={dealFormData.expected_close_date} onChange={(e) => setDealFormData({ ...dealFormData, expected_close_date: e.target.value })} /></div>
                      <Separator />
                      <CatalogItemPicker items={dealLineItems} onChange={(newItems) => {
                        setDealLineItems(newItems);
                        const total = newItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
                        if (total > 0) setDealFormData(prev => ({ ...prev, value: total.toFixed(2) }));
                      }} organizationId={contact.organization_id} />
                      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setShowDealForm(false); setDealLineItems([]); }} disabled={creatingDeal}>{t('common.cancel')}</Button><Button type="submit" disabled={creatingDeal}>{creatingDeal ? "A criar..." : t('contacts.details.createDeal')}</Button></div>
                    </form>
                  </CardContent></Card>
                )}
              </TabsContent>

              {/* TAB: PROPOSALS — uses the same full dialog as /proposals */}
              <TabsContent value="proposals" className="space-y-4 mt-4">
                <Button onClick={() => setShowProposalForm(true)} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />{t('contacts.details.newProposal')}
                </Button>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : proposals.length === 0 ? (
                  <div className="text-center py-8"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">{t('contacts.details.noProposals')}</p></div>
                ) : (
                  <div className="space-y-3">{proposals.map((proposal) => (
                    <Card key={proposal.id}><CardHeader className="pb-3"><CardTitle className="text-base flex items-center justify-between">{proposal.title}<Badge className={getStatusColor(proposal.status)}>{proposal.status}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">{proposal.deals && (<p className="text-sm text-muted-foreground">{t('contacts.details.dealLabel')}: <span className="font-medium text-foreground">{proposal.deals.title}</span></p>)}<p className="text-sm text-muted-foreground">{t('contacts.details.valueLabel')}: <span className="font-semibold text-foreground">€{proposal.value?.toLocaleString('pt-PT')}</span></p><p className="text-sm text-muted-foreground">{t('contacts.details.validUntil')}: <span className="font-medium text-foreground">{new Date(proposal.valid_until).toLocaleDateString('pt-PT')}</span></p></CardContent></Card>
                  ))}</div>
                )}
              </TabsContent>

              {/* TAB: EMAILS (new) */}
              <TabsContent value="emails">
                {contact.entity_id && <ContactEmailsTab entityId={contact.entity_id} />}
              </TabsContent>

              {/* TAB: TIMELINE (enhanced, replaces old history) */}
              <TabsContent value="timeline">
                <ContactTimelineTab events={timelineEvents} onRegisterCall={() => setShowCallDialog(true)} />
              </TabsContent>

              {/* TAB: SCORING (new) */}
              <TabsContent value="scoring">
                <ContactScoringTab
                  healthScore={healthScore}
                  daysSinceContact={daysSinceContact}
                  hasActiveDeal={deals.length > 0}
                  interactionCount={interactionCount30d}
                  hasEmail={!!contact.email}
                  hasPhone={!!contact.phone}
                  hasVat={!!contact.vat}
                  lastSentiment={lastSentiment?.sentiment || null}
                  hasNextAction={!!nextAction}
                />
              </TabsContent>

              {/* TAB: JOURNEY (new) */}
              <TabsContent value="journey">
                <ContactJourneyTab
                  sourceLead={sourceLead}
                  contact={contact}
                  convertedAt={contact.converted_at || null}
                  isClient={false}
                  clientSince={null}
                />
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register Call Dialog */}
      {contact.entity_id && (
        <RegisterCallDialog
          open={showCallDialog}
          onOpenChange={setShowCallDialog}
          entityId={contact.entity_id}
          entityName={[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
          organizationId={contact.organization_id || ""}
          contactId={contact.id}
          onCallRegistered={() => { loadContactDetails(); loadEnrichedData(); }}
          onOpenWhatsApp={(_eid, _ename, ctx) => {
            setShowCallDialog(false);
            if (ctx?.dealOrProposal) {
              setOverrideWhatsAppCtx(ctx.dealOrProposal);
            }
            handleWhatsApp();
          }}
          onOpenEmail={() => { setShowCallDialog(false); setShowEmailDialog(true); }}
        />
      )}

      {/* Send Email Dialog */}
      {contact.entity_id && contact.email && (
        <SendEntityEmailDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          module="contacts"
          entityId={contact.entity_id}
          entityName={[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
          entityEmail={contact.email}
          organizationId={contact.organization_id}
          onSent={() => { loadEnrichedData(); }}
        />
      )}

      {/* WhatsApp Dialog */}
      <WhatsAppSendDialog
        open={showWhatsAppDialog}
        onOpenChange={(v) => { setShowWhatsAppDialog(v); if (!v) setOverrideWhatsAppCtx(null); }}
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
          onSaved={() => loadEnrichedData()}
        />
      )}
      {/* Full proposal creation dialog (same form as /proposals) */}
      <ProposalCreateDialog
        open={showProposalForm}
        onOpenChange={setShowProposalForm}
        presetEntityId={contact?.entity_id || undefined}
        onSaved={() => loadContactDetails()}
      />
    </>
  );
};
