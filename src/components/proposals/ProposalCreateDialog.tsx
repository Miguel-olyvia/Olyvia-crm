import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { searchEntityIds } from "@/lib/clientSearch";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { resolveSendProposalAlerts } from "@/lib/notifications/resolveSendProposalAlerts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { proposalSchema } from "@/lib/validations";
import { formatCurrency } from "@/lib/utils";
import { Plus, X, Palette } from "lucide-react";
import { InlineQuoteBuilder, InlineQuoteData, createEmptyInlineQuote, calcInlineQuoteTotal } from "@/components/proposals/InlineQuoteBuilder";
import { calculateProposalItemsTotal, ProposalItem } from "@/components/proposals/ProposalItemsEditor";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { ProposalManualItemsEditor } from "@/components/pipeline/ProposalManualItemsEditor";

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_active: boolean;
  organization_id?: string | null;
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

interface ContactSearchResult {
  entity_id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
}

interface ProposalCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, restrict deal search to deals belonging to this entity. */
  presetEntityId?: string;
  /** Optional ID of a proposal to edit. When null/undefined the dialog is in "create" mode. */
  editingId?: string | null;
  /** Called after a successful create/update with the proposal id. */
  onSaved?: (proposalId: string) => void;
}

export function ProposalCreateDialog({
  open,
  onOpenChange,
  presetEntityId,
  editingId = null,
  onSaved,
}: ProposalCreateDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const { isSystemAdmin } = usePermissions();
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds } = usePermissionScope();
  const navigate = useNavigate();

  const [savingProposal, setSavingProposal] = useState(false);
  const submitLockRef = useRef(false);

  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [proposalTemplates, setProposalTemplates] = useState<Array<{ id: string; name: string; is_default: boolean }>>([]);
  const [originalStageId, setOriginalStageId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [descendantOrgIds, setDescendantOrgIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: "", description: "", value: "", deal_id: "", valid_until: "", notes: "", stage_id: "", template_id: "",
  });

  const [dealSearch, setDealSearch] = useState("");
  const [dealSearchResults, setDealSearchResults] = useState<DealSearchResult[]>([]);
  const [showDealDropdown, setShowDealDropdown] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealSearchResult | null>(null);

  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteSearchResults, setQuoteSearchResults] = useState<QuoteItem[]>([]);
  const [showQuoteDropdown, setShowQuoteDropdown] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<QuoteItem[]>([]);

  const [contactSearch, setContactSearch] = useState("");
  const [contactSearchResults, setContactSearchResults] = useState<ContactSearchResult[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);

  const [proposalItems, setProposalItems] = useState<ProposalItem[]>([]);
  const [inlineQuotes, setInlineQuotes] = useState<InlineQuoteData[]>([]);

  // Resolve descendant org subtree
  useEffect(() => {
    if (!activeCompany?.id) { setDescendantOrgIds([]); return; }
    (async () => {
      const ids = [activeCompany.id];
      const queue = [activeCompany.id];
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        const { data } = await (supabase as any).from("anew_hierarchy").select("child_org_id").eq("parent_org_id", parentId);
        if (data) for (const row of data) {
          if (!ids.includes(row.child_org_id)) { ids.push(row.child_org_id); queue.push(row.child_org_id); }
        }
      }
      setDescendantOrgIds(ids);
    })();
  }, [activeCompany?.id]);

  // Load workflow stages + templates
  const loadStagesAndTemplates = useCallback(async () => {
    if (!activeCompany?.id) return;
    const { data: orgStages } = await (supabase.from("proposal_workflow_stages") as any)
      .select("id, name, label, color, stage_order, is_active, organization_id")
      .eq("organization_id", activeCompany.id).eq("is_active", true).order("stage_order");
    let stages: WorkflowStage[] = orgStages || [];
    if (stages.length === 0) {
      const { data: globalStages } = await (supabase.from("proposal_workflow_stages") as any)
        .select("id, name, label, color, stage_order, is_active, organization_id")
        .is("organization_id", null).eq("is_active", true).order("stage_order");
      stages = globalStages || [];
    }
    setWorkflowStages(stages);

    const { data: tmpl } = await (supabase as any).from("proposal_templates")
      .select("id, name, is_default").eq("organization_id", activeCompany.id).eq("template_type", "proposal").eq("is_active", true).order("name");
    setProposalTemplates(tmpl || []);
  }, [activeCompany?.id]);

  useEffect(() => { if (open) loadStagesAndTemplates(); }, [open, loadStagesAndTemplates]);

  // When editing, load proposal data
  useEffect(() => {
    if (!open || !editingId) return;
    (async () => {
      const { data: p } = await (supabase as any).from("proposals")
        .select("*, deals(id, title, probability, entity_id)")
        .eq("id", editingId).maybeSingle();
      if (!p) return;
      const stageId = p.stage_id || workflowStages[0]?.id || "";
      setOriginalStageId(stageId);
      setFormData({
        title: p.title, description: p.description || "", value: String(p.value || ""),
        deal_id: p.deal_id || "", valid_until: p.valid_until || "", notes: p.notes || "",
        stage_id: stageId, template_id: p.template_id || "",
      });
      if (p.deal_id && p.deals) {
        setSelectedDeal({ id: p.deals.id, title: p.deals.title, probability: p.deals.probability ?? null, entity_id: p.deals.entity_id ?? p.entity_id ?? null });
      }
      const { data: qs } = await supabase.from("quotes").select("id, quote_number, total, estado").eq("proposal_id", editingId);
      setSelectedQuotes((qs || []).map(q => ({ id: q.id, quote_number: q.quote_number, total: q.total, estado: q.estado })));
      const { data: items } = await supabase.from("proposal_items")
        .select("id, description, quantity, unit_price, vat_rate, sort_order")
        .eq("proposal_id", editingId).order("sort_order");
      setProposalItems((items || []).map(it => ({
        id: it.id, description: it.description, quantity: Number(it.quantity),
        unit_price: Number(it.unit_price), vat_rate: Number(it.vat_rate), sort_order: it.sort_order || 0,
      })));
    })();
  }, [open, editingId, workflowStages]);

  // Default stage for new proposals
  useEffect(() => {
    if (workflowStages.length > 0 && !formData.stage_id && !editingId) {
      setFormData(prev => ({ ...prev, stage_id: workflowStages[0].id }));
    }
  }, [workflowStages, formData.stage_id, editingId]);

  // Auto-fill value from quotes
  useEffect(() => {
    const quotesTotal = selectedQuotes.reduce((s, q) => s + (q.total || 0), 0);
    const inlineTotal = inlineQuotes.reduce((s, q) => s + calcInlineQuoteTotal(q), 0);
    const total = quotesTotal + inlineTotal;
    if (total > 0) setFormData(prev => ({ ...prev, value: total.toFixed(2) }));
  }, [inlineQuotes, selectedQuotes]);

  const resetForm = useCallback(() => {
    setOriginalStageId(null);
    setFormData({ title: "", description: "", value: "", deal_id: "", valid_until: "", notes: "", stage_id: workflowStages[0]?.id || "", template_id: "" });
    setSelectedDeal(null);
    setDealSearch(""); setDealSearchResults([]);
    setSelectedContact(null); setContactSearch(""); setContactSearchResults([]); setShowContactDropdown(false);
    setSelectedQuotes([]); setQuoteSearch(""); setQuoteSearchResults([]);
    setProposalItems([]); setInlineQuotes([]); setFieldErrors({});
  }, [workflowStages]);

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) resetForm();
  };

  /**
   * Save the proposal as a draft (if new) and open the full Quote Builder
   * pre-linked to it. Used by the "Criar orçamento aqui" button.
   */
  const handleCreateQuoteForProposal = async () => {
    if (savingProposal || submitLockRef.current) return;

    // Editing existing proposal — just navigate.
    if (editingId) {
      onOpenChange(false);
      navigate(`/quotes?new=1&proposal_id=${editingId}${formData.deal_id ? `&deal_id=${formData.deal_id}` : ""}`);
      return;
    }

    // Creating: require minimum data to save a draft.
    if (!formData.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Indica um título para a proposta antes de criar o orçamento.",
        variant: "destructive",
      });
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

      const proposalData = {
        title: formData.title,
        description: formData.description || null,
        value: 0,
        probability,
        deal_id: formData.deal_id || null,
        entity_id: presetEntityId || selectedDeal?.entity_id || selectedContact?.entity_id || null,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        stage_id: formData.stage_id || null,
        status: stage?.name || 'draft',
        organization_id: activeCompany.id,
        root_organization_id: (activeCompany as any).parent_id || activeCompany.id,
        template_id: templateId,
      };

      const { data, error } = await supabase
        .from("proposals")
        .insert({ ...proposalData, created_by: businessUserId })
        .select("id")
        .single();
      if (error) throw error;

      onOpenChange(false);
      resetForm();
      onSaved?.(data.id);
      navigate(`/quotes?new=1&proposal_id=${data.id}${formData.deal_id ? `&deal_id=${formData.deal_id}` : ""}`);
    } catch (err: any) {
      toast({ title: "Erro ao criar proposta", description: err.message, variant: "destructive" });
    } finally {
      submitLockRef.current = false;
      setSavingProposal(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || savingProposal) return;

    const quotesTotal = selectedQuotes.reduce((sum, q) => sum + (q.total || 0), 0);
    const inlineQuotesTotal = inlineQuotes.reduce((sum, q) => sum + calcInlineQuoteTotal(q), 0);
    const itemsTotal = calculateProposalItemsTotal(proposalItems);
    const calculatedValue = quotesTotal + inlineQuotesTotal + itemsTotal;
    const value = (selectedQuotes.length > 0 || inlineQuotes.length > 0 || proposalItems.length > 0)
      ? calculatedValue : parseFloat(formData.value) || 0;

    const validation = proposalSchema.safeParse({
      title: formData.title, description: formData.description, value, notes: formData.notes, valid_until: formData.valid_until,
    });
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
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

      const proposalData = {
        title: formData.title, description: formData.description || null, value, probability,
        deal_id: formData.deal_id || null,
        entity_id: presetEntityId || selectedDeal?.entity_id || selectedContact?.entity_id || null,
        valid_until: formData.valid_until || null, notes: formData.notes || null,
        stage_id: formData.stage_id || null, status: stage?.name || 'draft',
        organization_id: activeCompany.id,
        root_organization_id: (activeCompany as any).parent_id || activeCompany.id,
        template_id: templateId,
      };

      // Resolve business user id once — used for both proposal create and inline quote inserts.
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        return;
      }

      let savedProposalId: string | null = null;
      if (editingId) {
        const { error } = await supabase.from("proposals").update(proposalData).eq("id", editingId);
        if (error) throw error;
        savedProposalId = editingId;
        if (formData.stage_id && originalStageId && formData.stage_id !== originalStageId) {
          try {
            await supabase.functions.invoke('execute-workflow', {
              body: { source_entity: 'proposal', entity_id: editingId, new_stage_id: formData.stage_id, old_stage_id: originalStageId, organization_id: activeCompany?.id, triggered_by: user.id },
            });
          } catch (err) { console.error("Workflow execution error:", err); }
        }
        toast({ title: t('proposals.toast.updateSuccess') });
      } else {
        const { data, error } = await supabase.from("proposals").insert({ ...proposalData, created_by: businessUserId }).select("id").single();
        if (error) throw error;
        savedProposalId = data.id;
        toast({ title: t('proposals.toast.createSuccess') });
      }

      if (savedProposalId) {
        await resolveSendProposalAlerts(proposalData.entity_id, activeCompany.id);

        const selectedQuoteIds = selectedQuotes.map(q => q.id);
        if (selectedQuoteIds.length > 0) {
          await supabase.from("quotes").update({ proposal_id: null }).eq("proposal_id", savedProposalId).not("id", "in", `(${selectedQuoteIds.join(",")})`);
          await supabase.from("quotes").update({ proposal_id: savedProposalId }).in("id", selectedQuoteIds);
        } else {
          await supabase.from("quotes").update({ proposal_id: null }).eq("proposal_id", savedProposalId);
        }

        for (const iq of inlineQuotes) {
          const validLines = (iq.lines || []).filter(l => l.qt > 0);
          if (validLines.length === 0) continue;

          const dealOrgId = selectedDeal ? (selectedDeal as any).organization_id : activeCompany?.id;
          const quoteEntityId = presetEntityId || selectedDeal?.entity_id || selectedContact?.entity_id || null;
          const quoteData = {
            deal_id: formData.deal_id || null,
            entity_id: quoteEntityId,
            organization_id: dealOrgId || activeCompany?.id || null,
            root_organization_id: (activeCompany as any)?.parent_id || activeCompany?.id || null,
            title: iq.title || null, obra_notas: iq.obra_notas || null,
            modelo_base: iq.modelo_base && iq.modelo_base !== "0" ? iq.modelo_base : "default",
            desconto_global_percent: iq.desconto_global_percent, estado: "finalizado",
            validade_dias: iq.validade_dias, iva_rate: iq.iva_rate,
            client_notes: iq.client_notes || null, conditions: iq.conditions || null,
            proposal_id: savedProposalId, created_by: businessUserId,
          };

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
              quote_id: "" /* set below */, catalog_item_id: l.catalog_item_id || null,
              product_id: l.product_id || null, service_id: l.service_id || null,
              selected_attributes: l.selected_attributes || {}, categoria: "",
              descricao_snapshot: l.descricao_snapshot, qt: l.qt,
              custo_material_unit: l.custo_material_unit, custo_mao_obra_unit: l.custo_mao_obra_unit,
              margem_percent: l.margem_percent, iva_percent: l.iva_percent, int_percent: l.int_percent,
              discount_percent: lineDiscount, total_sem_iva: precoSemIva,
              total_com_iva: totalComIva, total_com_desconto: totalComDesconto,
              ordem: l.ordem, section_name: l.section_name || "Geral",
              unidade: l.unidade || null, item_description: l.item_description || null,
              cost_price: l.cost_price || 0,
            };
          });

          const totalSemIva = linesToInsert.reduce((s, l) => s + l.total_sem_iva, 0);
          const grandTotal = linesToInsert.reduce((s, l) => s + l.total_com_desconto, 0);

          const { data: newQuote, error: qError } = await (supabase.from("quotes") as any)
            .insert({ ...quoteData, subtotal: totalSemIva, total: grandTotal })
            .select("id").single();
          if (qError) throw qError;

          const finalLines = linesToInsert.map(l => ({ ...l, quote_id: newQuote.id }));
          const { error: linesError } = await supabase.from("quote_lines").insert(finalLines);
          if (linesError) throw linesError;
        }

        await supabase.from("proposal_items").delete().eq("proposal_id", savedProposalId);
        if (proposalItems.length > 0) {
          await supabase.from("proposal_items").insert(
            proposalItems.map((item, index) => ({
              proposal_id: savedProposalId, description: item.description,
              quantity: item.quantity, unit_price: item.unit_price,
              vat_rate: item.vat_rate, sort_order: index,
            }))
          );
        }
      }

      onOpenChange(false);
      resetForm();
      if (savedProposalId && onSaved) onSaved(savedProposalId);
    } catch (error: any) {
      toast({ title: editingId ? t('proposals.toast.updateError') : t('proposals.toast.createError'), description: error.message, variant: "destructive" });
    } finally {
      submitLockRef.current = false;
      setSavingProposal(false);
    }
  };

  const handleDealSearch = async (value: string) => {
    setDealSearch(value);
    if (value.trim().length < 1) { setDealSearchResults([]); setShowDealDropdown(false); return; }
    const searchTerm = value.trim().replace(/^@/, '').toLowerCase();
    const { data: { user } } = await supabase.auth.getUser();
    const dealScope = getPermissionScope("proposals.view");
    let dealsData: any[] = [];
    const orgIds = descendantOrgIds.length > 0 ? descendantOrgIds : (activeCompany?.id ? [activeCompany.id] : []);

    // Also resolve matching entity IDs (by name/email/phone/NIF) for cross-field search.
    const { ids: matchingEntityIds } = await searchEntityIds(searchTerm);

    let baseSelect = "id, title, probability, value, description, expected_close_date, entity_id, deal_stages(name)";
    const dedupe = (arr: any[]) => {
      const seen = new Set<string>();
      const out: any[] = [];
      for (const d of arr) { if (!seen.has(d.id)) { seen.add(d.id); out.push(d); } }
      return out;
    };

    if (dealScope === "ORG" || isSystemAdmin) {
      let q = supabase.from("deals").select(baseSelect).in("organization_id", orgIds).ilike("title", `%${searchTerm}%`).limit(50);
      if (presetEntityId) q = q.eq("entity_id", presetEntityId);
      const { data } = await q;
      dealsData = data || [];
      if (matchingEntityIds.length > 0) {
        let q2 = supabase.from("deals").select(baseSelect).in("organization_id", orgIds).in("entity_id", matchingEntityIds).limit(50);
        if (presetEntityId) q2 = q2.eq("entity_id", presetEntityId);
        const { data: data2 } = await q2;
        dealsData = dedupe([...dealsData, ...(data2 || [])]);
      }
    } else if (user?.id) {
      const allowedIds = new Set<string>();
      if (scopeAnewUserId) allowedIds.add(scopeAnewUserId);
      if (dealScope === "TEAM" && teamMemberIds.length > 0) teamMemberIds.forEach(id => allowedIds.add(id));
      const { data: userLeads } = await (supabase.from("anew_leads") as any).select("id").in("organization_id", orgIds).in("assigned_to", Array.from(allowedIds));
      const leadIds = (userLeads || []).map((l: any) => l.id);
      if (leadIds.length > 0) {
        let q = supabase.from("deals").select(baseSelect).in("organization_id", orgIds).in("lead_id", leadIds).ilike("title", `%${searchTerm}%`).limit(50);
        if (presetEntityId) q = q.eq("entity_id", presetEntityId);
        const { data } = await q;
        dealsData = data || [];
        if (matchingEntityIds.length > 0) {
          let q2 = supabase.from("deals").select(baseSelect).in("organization_id", orgIds).in("lead_id", leadIds).in("entity_id", matchingEntityIds).limit(50);
          if (presetEntityId) q2 = q2.eq("entity_id", presetEntityId);
          const { data: data2 } = await q2;
          dealsData = dedupe([...dealsData, ...(data2 || [])]);
        }
      }
    }

    const entityIds = dealsData.map((d: any) => d.entity_id).filter(Boolean);
    let entityMap: Record<string, any> = {};
    if (entityIds.length > 0) {
      const [entRes, emailRes, phoneRes] = await Promise.all([
        supabase.from("anew_entities").select("id, display_name").in("id", entityIds),
        supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", entityIds).eq("is_primary", true),
        supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", entityIds).eq("is_primary", true),
      ]);
      (entRes.data || []).forEach((e: any) => { entityMap[e.id] = { name: e.display_name }; });
      (emailRes.data || []).forEach((e: any) => { if (entityMap[e.entity_id]) entityMap[e.entity_id].email = e.email; });
      (phoneRes.data || []).forEach((p: any) => { if (entityMap[p.entity_id]) entityMap[p.entity_id].phone = p.phone_number; });
    }
    setDealSearchResults(dealsData.map((d: any) => {
      const ent = entityMap[d.entity_id] || {};
      return { id: d.id, title: d.title, probability: d.probability, entity_id: d.entity_id || null, value: d.value, expected_close_date: d.expected_close_date, stage_name: d.deal_stages?.name || null, lead_name: ent.name || null, lead_phone: ent.phone || null, lead_email: ent.email || null };
    }));
    setShowDealDropdown(dealsData.length > 0);
  };

  const handleContactSearch = async (value: string) => {
    setContactSearch(value);
    if (value.trim().length < 3) {
      setContactSearchResults([]); setShowContactDropdown(false); return;
    }
    const { ids } = await searchEntityIds(value.trim());
    if (ids.length === 0) {
      setContactSearchResults([]); setShowContactDropdown(false); return;
    }
    const { data: entities } = await supabase
      .from("anew_entities")
      .select("id, display_name")
      .in("id", ids)
      .limit(50);
    if (!entities || entities.length === 0) {
      setContactSearchResults([]); setShowContactDropdown(false); return;
    }
    const entityIds = entities.map((e: any) => e.id);
    const [emailRes, phoneRes] = await Promise.all([
      supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", entityIds).eq("is_primary", true),
      supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", entityIds).eq("is_primary", true),
    ]);
    const emailMap: Record<string, string> = {};
    const phoneMap: Record<string, string> = {};
    (emailRes.data || []).forEach((e: any) => { emailMap[e.entity_id] = e.email; });
    (phoneRes.data || []).forEach((p: any) => { phoneMap[p.entity_id] = p.phone_number; });
    setContactSearchResults(entities.map((e: any) => ({
      entity_id: e.id, display_name: e.display_name,
      email: emailMap[e.id] || null, phone: phoneMap[e.id] || null,
    })));
    setShowContactDropdown(true);
  };

  const handleSelectContact = async (contact: ContactSearchResult) => {
    setSelectedContact(contact);
    setSelectedDeal(null);
    setFormData(prev => ({ ...prev, deal_id: "" }));
    setContactSearch(""); setShowContactDropdown(false); setContactSearchResults([]);
    const { data: contactQuotes } = await supabase
      .from("quotes")
      .select("id, quote_number, total, estado")
      .eq("entity_id", contact.entity_id)
      .neq("estado", "rascunho")
      .order("created_at", { ascending: false });
    setSelectedQuotes((contactQuotes ?? []).map(q => ({ id: q.id, quote_number: q.quote_number, total: q.total, estado: q.estado })));
  };

  const handleSelectDeal = async (deal: DealSearchResult) => {
    setSelectedDeal(deal);
    setSelectedContact(null);
    setFormData({ ...formData, deal_id: deal.id });
    setDealSearch(""); setShowDealDropdown(false); setDealSearchResults([]);

    const { data: dealQuotes } = await supabase.from("quotes").select("id, quote_number, total, estado").eq("deal_id", deal.id).neq("estado", "rascunho").order("created_at", { ascending: false });
    if (dealQuotes && dealQuotes.length > 0) {
      setSelectedQuotes(dealQuotes.map(q => ({ id: q.id, quote_number: q.quote_number, total: q.total, estado: q.estado })));
      return;
    }
    setSelectedQuotes([]);

    // Auto-create inline quote from deal items
    let createdInline = false;
    try {
      const { data: dealNeeds } = await (supabase as any).from("deal_needs").select("id, title").eq("deal_id", deal.id);
      if (dealNeeds && dealNeeds.length > 0) {
        const needIds = dealNeeds.map((n: any) => n.id);
        const { data: needItems } = await (supabase as any).from("deal_need_items").select("*").in("deal_need_id", needIds).order("sort_order");
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
            let retailPrice = 0, costPrice = 0, vatRate = 23;
            const manualPrice = item.unit_price ? parseFloat(item.unit_price) : null;
            if (item.item_type === "product" && item.product_id) {
              const prod: any = prodNameMap.get(item.product_id);
              const retail: any = prodRetailMap.get(item.product_id);
              const cost: any = prodCostMap.get(item.product_id);
              if (prod) name = prod.name;
              retailPrice = manualPrice ?? (retail?.price || 0);
              costPrice = cost?.price || 0;
              vatRate = retail?.vat_rate || 23;
            } else if (item.item_type === "service" && item.service_id) {
              const svc: any = svcNameMap.get(item.service_id);
              const retail: any = svcRetailMap.get(item.service_id);
              const cost: any = svcCostMap.get(item.service_id);
              if (svc) name = svc.name;
              retailPrice = manualPrice ?? (retail?.price || 0);
              costPrice = cost?.price || 0;
              vatRate = retail?.vat_rate || 23;
            } else if (manualPrice) {
              retailPrice = manualPrice;
            }
            const margin = costPrice > 0 && retailPrice > 0 ? ((retailPrice - costPrice) / costPrice) * 100 : 30;
            return {
              id: `temp_deal_${Date.now()}_${idx}`, section_name: "Geral",
              descricao_snapshot: name, item_description: "",
              qt: item.quantity || 1, unidade: undefined,
              custo_material_unit: costPrice > 0 ? costPrice : (retailPrice > 0 ? retailPrice / (1 + margin / 100) : 0),
              custo_mao_obra_unit: 0, margem_percent: Math.round(margin * 100) / 100,
              iva_percent: vatRate, int_percent: 0, discount_percent: 0, ordem: idx + 1,
              product_id: item.item_type === "product" ? item.product_id : null,
              service_id: item.item_type === "service" ? item.service_id : null,
              retail_price_unit: retailPrice, cost_price: costPrice,
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
      if (!createdInline) {
        const dealValue = deal.value ? parseFloat(String(deal.value)) : 0;
        if (dealValue > 0) {
          const defaultMargin = 30;
          const materialCost = dealValue / (1 + defaultMargin / 100);
          const newInlineQuote = createEmptyInlineQuote(deal.title);
          newInlineQuote.lines = [{
            id: `temp_deal_fallback_${Date.now()}`, section_name: "Geral",
            descricao_snapshot: deal.title || "Pedido de Proposta", item_description: "",
            qt: 1, unidade: undefined,
            custo_material_unit: materialCost, custo_mao_obra_unit: 0,
            margem_percent: defaultMargin, iva_percent: 23, int_percent: 0, discount_percent: 0, ordem: 1,
            product_id: null, service_id: null, retail_price_unit: dealValue, cost_price: materialCost,
          }];
          setInlineQuotes([newInlineQuote]);
        }
      }
    } catch (err) {
      console.error("Error loading deal items for inline quote:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? t('proposals.editProposal') : t('proposals.newProposal')}</DialogTitle>
        </DialogHeader>
        {editingId && (
          <div className="px-1 mb-4">
            <PipelineBreadcrumb entityType="proposal" entityId={editingId} />
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="title">{t('proposals.form.title')} *</Label>
              <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className={fieldErrors.title ? "border-destructive" : ""} />
              {fieldErrors.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">{t('proposals.form.value')} *</Label>
              <Input id="value" type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valid_until">{t('proposals.form.validUntil')}</Label>
              <Input id="valid_until" type="date" value={formData.valid_until} onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="stage_id">{t('proposals.form.status')} *</Label>
              <Select value={formData.stage_id} onValueChange={(value) => setFormData({ ...formData, stage_id: value })}>
                <SelectTrigger><SelectValue placeholder={t('proposals.form.selectStatus')} /></SelectTrigger>
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
            {proposalTemplates.length > 0 && (
              <div className="col-span-2 space-y-2">
                <Label className="flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Template de Proposta
                </Label>
                <Select value={formData.template_id} onValueChange={(value) => setFormData({ ...formData, template_id: value === "none" ? "" : value })}>
                  <SelectTrigger><SelectValue placeholder="Template default" /></SelectTrigger>
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

            {/* Contact search */}
            <div className="col-span-2 space-y-2">
              <Label>Contacto</Label>
              <div className="relative">
                {selectedContact ? (
                  <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/30">
                    <Badge variant="secondary" className="shrink-0 mt-0.5">Contacto</Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{selectedContact.display_name}</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {selectedContact.email && <span className="text-xs text-muted-foreground">{selectedContact.email}</span>}
                        {selectedContact.phone && <span className="text-xs text-muted-foreground">{selectedContact.phone}</span>}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setSelectedContact(null); setSelectedQuotes([]); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      placeholder="Pesquisar contacto pelo nome..."
                      value={contactSearch}
                      onChange={(e) => handleContactSearch(e.target.value)}
                      onFocus={() => { if (contactSearchResults.length > 0) setShowContactDropdown(true); }}
                      onBlur={() => { setTimeout(() => setShowContactDropdown(false), 200); }}
                    />
                    {showContactDropdown && contactSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[280px] overflow-y-auto">
                        {contactSearchResults.map((contact) => (
                          <button key={contact.entity_id} type="button" className="w-full px-3 py-3 text-left hover:bg-muted border-b last:border-b-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectContact(contact)}>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs shrink-0">Contacto</Badge>
                              <span className="text-sm font-medium truncate">{contact.display_name}</span>
                            </div>
                            {contact.email && <div className="text-xs text-muted-foreground mt-1 ml-[52px]">{contact.email}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Deal search */}
            <div className="col-span-2 space-y-2">
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
                      placeholder={presetEntityId ? "Pesquisar pedidos deste contacto..." : (t('proposals.form.searchDealPlaceholder') || "Pesquisar pedidos de proposta...")}
                      value={dealSearch}
                      onChange={(e) => handleDealSearch(e.target.value)}
                      onFocus={() => { if (dealSearchResults.length > 0) setShowDealDropdown(true); }}
                      onBlur={() => { setTimeout(() => setShowDealDropdown(false), 200); }}
                      className={fieldErrors.deal_id ? "border-destructive" : ""}
                    />
                    {showDealDropdown && dealSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[280px] overflow-y-auto">
                        {dealSearchResults.map((deal) => (
                          <button key={deal.id} type="button" className="w-full px-3 py-3 text-left hover:bg-muted border-b last:border-b-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectDeal(deal)}>
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

            {/* Orçamentos section */}
            <div className="col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Orçamentos</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowQuoteDropdown(!showQuoteDropdown)}>
                      🔗 Associar existente
                    </Button>
                    {showQuoteDropdown && (
                      <div className="absolute z-50 top-8 left-0 w-80 bg-popover border rounded-lg shadow-lg p-2">
                        <Input
                          placeholder="Pesquisar orçamentos..."
                          value={quoteSearch}
                          autoFocus
                          onChange={async (e) => {
                            const val = e.target.value;
                            setQuoteSearch(val);
                            if (val.length < 2) { setQuoteSearchResults([]); return; }
                            const orgId = activeCompany?.id;
                            if (!orgId) return;
                            const { data } = await supabase
                              .from("quotes")
                              .select("id, quote_number, total, estado, title")
                              .eq("organization_id", orgId)
                              .neq("estado", "rascunho")
                              .or(`quote_number.ilike.%${val}%,title.ilike.%${val}%`)
                              .is("proposal_id", null)
                              .order("created_at", { ascending: false })
                              .limit(50);
                            setQuoteSearchResults((data || []).map(q => ({ id: q.id, quote_number: q.quote_number, total: q.total, estado: q.estado })));
                          }}
                          className="h-8 text-xs mb-2"
                        />
                        {quoteSearchResults.length > 0 ? (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {quoteSearchResults.filter(q => !selectedQuotes.some(sq => sq.id === q.id)).map(q => (
                              <button key={q.id} type="button" className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex justify-between items-center"
                                onClick={() => {
                                  setSelectedQuotes([...selectedQuotes, q]);
                                  setShowQuoteDropdown(false); setQuoteSearch(""); setQuoteSearchResults([]);
                                }}>
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
                <div className="pt-4 border-t">
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
              <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">{t('proposals.form.notes')}</Label>
              <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>{t('proposals.form.cancel')}</Button>
            <Button type="submit" disabled={savingProposal}>{editingId ? t('proposals.form.update') : t('proposals.form.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
