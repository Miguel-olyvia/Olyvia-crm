import { useState, useEffect, useRef } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompany } from "@/contexts/CompanyContext";
import { useComercialUsers } from "@/hooks/useComercialUsers";
import { usePermissionScope, applyScopeFilter } from "@/hooks/usePermissionScope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Removed unused Accordion imports
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { searchEntityIds } from "@/lib/clientSearch";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { resolveQuoteAssignedTo } from "@/utils/quotes/resolveQuoteAssignedTo";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { ArrowLeft, Save, Plus, Trash2, Tag, X, Percent, ChevronDown, ChevronRight, Layers, Eye, Copy, FileDown, GripVertical, Search, Package, Pencil, FileText, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { QuotePipelineBar } from "@/components/quote/QuotePipelineBar";
import { QuoteDealCard } from "@/components/quote/QuoteDealCard";
import { QuoteEntityPreview } from "@/components/quote/QuoteEntityPreview";
import { QuoteBuilderSidebar } from "@/components/quote/QuoteBuilderSidebar";
import { generateQuotePdfBlob } from "@/utils/generateQuotePdfBlob";
import { downloadBlob } from "@/utils/generateProposalPdfBlob";
import { QuoteConditions } from "@/components/quote/QuoteConditions";
import { QuotePdfPreviewDialog } from "@/components/quote/QuotePdfPreviewDialog";
import { SendQuoteDialog } from "@/components/quotes/SendQuoteDialog";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";

import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { resolveQuotePdfEntityId } from "@/utils/quotePdfClient";
import { fetchActivePdfTemplates } from "@/utils/quotePdfTemplate";

import LineAttributesDialog from "@/components/LineAttributesDialog";
import { InlineQuoteBuilder, InlineQuoteData, createEmptyInlineQuote } from "@/components/proposals/InlineQuoteBuilder";
import { AddItemsDialog } from "@/components/quote/AddItemsDialog";
import { BundleEditAttributesDialog } from "@/components/quote/BundleEditAttributesDialog";
import { InlineProductSelector } from "@/components/quote/InlineProductSelector";
import { getEffectiveProductOptionPrices } from "@/lib/product-attribute-option-prices";
import { getEffectiveProductRanges } from "@/lib/product-attribute-ranges";
import { calculateQuoteFees, type LineForFees } from "../../supabase/functions/_shared/calculateQuoteFees";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quoteSchema, quoteLineSchema } from "@/lib/validations";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Sortable row wrapper for quote items
function SortableQuoteRow({ id, children }: { id: string; children: (args: { setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  return <>{children({ setNodeRef, style, attributes, listeners, isDragging })}</>;
}

interface QuoteBuilderProps {
  quoteId: string | null;
  onClose: () => void;
  /** Pre-link the new quote to a proposal (when launched from a proposal context). */
  initialProposalId?: string | null;
  /** Pre-link the new quote to a deal (when launched from a proposal/deal context). */
  initialDealId?: string | null;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  client_type: "company" | "person";
}

interface Organization {
  id: string;
  name: string;
}

interface Deal {
  id: string;
  title: string;
  client_id: string | null;
  lead_id: string | null;
  contact_id?: string | null;
  organization_id: string | null;
  entity_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
}

interface CatalogItem {
  id: string;
  item_code: string | null;
  categoria: string;
  descricao: string;
  tipo: string;
  custo_material: number;
  custo_mao_obra: number;
  margem_default: number;
  iva_default: number;
  int_default: number;
  ordem: number;
}

interface ProductCatalogItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category_name: string | null;
  brand_name: string | null;
  retail_price: number | null;
  vat_rate: number | null;
  organization_id: string | null;
  uom_symbol: string | null;
  uom_name: string | null;
}

interface ProductAttribute {
  id: string;
  name: string;
  code: string;
  value_type: string;
  unit: string | null;
  allowed_values: string[] | null;
  values: Array<{ id: string; value: string }>;
}

interface ServiceFeeType {
  id: string;
  name: string;
  calculation_type: "PERCENTAGE" | "FIXED";
  percentage: number | null;
  fixed_amount: number | null;
  application_mode?: "SUBTOTAL" | "LINE_PERCENTAGE";
  apply_vat?: boolean;
  vat_rate?: number | null;
}


// Bundle component line (for expanded view)
interface BundleComponentLine {
  id: string;
  name: string;
  sku: string | null;
  type: "product" | "service";
  source_id: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

const isBundleComponentLine = (value: any): value is BundleComponentLine => {
  return !!value && typeof value === "object" && typeof value.name === "string" && typeof value.quantity === "number";
};

interface QuoteLine {
  id?: string;
  catalog_item_id: string | null;
  product_id?: string | null;
  service_id?: string | null;
  bundle_id?: string | null;
  bundle_components?: BundleComponentLine[];
  selected_attributes?: Record<string, any>;
  attribute_price_addon?: number;
  categoria: string;
  descricao_snapshot: string;
  sku?: string | null;
  unidade?: string | null;
  item_description?: string;
  cost_price?: number;
  qt: number;
  custo_material_unit: number;
  custo_mao_obra_unit: number;
  margem_percent: number;
  iva_percent: number;
  int_percent: number;
  discount_percent: number;
  ordem: number;
  retail_price_unit?: number;
  section_name: string;
}

const NEW_QUOTE_DRAFT_VERSION = 1;
const getNewQuoteDraftKey = (companyId?: string | null) => `olyvia:quote-builder:new:${companyId || "global"}`;

export function QuoteBuilder({ quoteId, onClose, initialProposalId = null, initialDealId = null }: QuoteBuilderProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [clients, setClients] = useState<Client[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [services, setServices] = useState<ProductCatalogItem[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [sections, setSections] = useState<string[]>(["Geral"]);
  const [activeSection, setActiveSection] = useState<string>("Geral");
  const [loading, setLoading] = useState(false);
  const [canEditCosts, setCanEditCosts] = useState(false);
  const [canEditMargins, setCanEditMargins] = useState(false);
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [showApplyVatDialog, setShowApplyVatDialog] = useState(false);
  const [applyVatValue, setApplyVatValue] = useState<string>("6");
  const [newSectionName, setNewSectionName] = useState("");
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<string[]>([]);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>("all");
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>("all");
  const [selectedFilterOrganization, setSelectedFilterOrganization] = useState<string>("all");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [productAttributes, setProductAttributes] = useState<Map<string, ProductAttribute[]>>(new Map());
  const [selectedItemAttributes, setSelectedItemAttributes] = useState<Record<string, Record<string, string>>>({});
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState<string>("");
  const [editingBundleLineIndex, setEditingBundleLineIndex] = useState<number | null>(null);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [serviceFees, setServiceFees] = useState<ServiceFeeType[]>([]);
  const [selectedFees, setSelectedFees] = useState<Set<string>>(new Set());
  const [feeVatOverrides, setFeeVatOverrides] = useState<Record<string, number>>({});
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
  const [resolvedRootOrgId, setResolvedRootOrgId] = useState<string | null>(null);
  
  // Replace product mode state
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceLineIndex, setReplaceLineIndex] = useState<number | null>(null);
  const [replaceItemType, setReplaceItemType] = useState<"product" | "service" | "bundle">("product");
  // Replace bundle component
  const [showReplaceBundleComponentDialog, setShowReplaceBundleComponentDialog] = useState(false);
  const [replaceBundleComponentTarget, setReplaceBundleComponentTarget] = useState<{ lineIndex: number; componentIndex: number; type: "product" | "service" } | null>(null);
  
  // Deal/contact/client search with @
  type SearchResult =
    | { kind: "deal"; id: string; title: string; client_id: string | null; lead_id: string | null; contact_id?: string | null; organization_id: string | null; entity_id?: string | null; assigned_to?: string | null; entity_name?: string | null }
    | { kind: "contact"; id: string; name: string; organization_id: string | null; entity_id: string | null; assigned_to: string | null }
    | { kind: "client"; id: string; name: string; organization_id: string | null; entity_id: string | null; assigned_to: string | null };
  const [dealSearch, setDealSearch] = useState("");
  const [dealSearchResults, setDealSearchResults] = useState<SearchResult[]>([]);
  const [showDealDropdown, setShowDealDropdown] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ kind: "contact" | "client"; id: string; name: string; entity_id: string | null; organization_id: string | null } | null>(null);
  const [resolvedQuoteEntityId, setResolvedQuoteEntityId] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, companies: userCompanies, userType: companyUserType } = useCompany();
  const { comercialUsers } = useComercialUsers(activeCompany?.id || null);
  const { getPermissionScope, anewUserId: scopeAnewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  

  // Resolve descendant org IDs for the active company subtree
  const [descendantOrgIds, setDescendantOrgIds] = useState<string[]>([]);
  useEffect(() => {
    if (!activeCompany?.id) { setDescendantOrgIds([]); return; }
    (async () => {
      const ids = [activeCompany.id];
      const queue = [activeCompany.id];
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        const { data } = await (supabase as any)
          .from("anew_hierarchy").select("child_org_id").eq("parent_org_id", parentId);
        if (data) {
          for (const row of data) {
            if (!ids.includes(row.child_org_id)) { ids.push(row.child_org_id); queue.push(row.child_org_id); }
          }
        }
      }
      setDescendantOrgIds(ids);
    })();
  }, [activeCompany?.id]);

  const [formData, setFormData] = useState({
    deal_id: "",
    cliente_id: "",
    organization_id: "",
    title: "",
    obra_notas: "",
    modelo_base: "0",
    desconto_global_percent: 0,
    estado: "rascunho" as "rascunho" | "enviado" | "aceite" | "rejeitado",
    validade_dias: 30,
    iva_rate: 23,
    client_notes: "",
    conditions: "",
    proposal_id: "" as string | null | "",
    assigned_to: "" as string | "",
    pdf_template_id: "" as string | "",
  });
  // Tracks explicit user intent on the "Comercial" dropdown.
  // false  -> assigned_to is recomputed from the selected deal/contact/client owner.
  // true   -> user picked something manually (or we're editing an existing quote),
  //           so never overwrite it automatically.
  const [assignedToTouched, setAssignedToTouched] = useState(false);
  const [pdfTemplates, setPdfTemplates] = useState<any[]>([]);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [autoReference, setAutoReference] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [templates, setTemplates] = useState<any[]>([]);
  const [inlineQuotes, setInlineQuotes] = useState<InlineQuoteData[]>([]);
  const saveLockRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const postSaveActionRef = useRef<"email" | "whatsapp" | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showSendEmailDialog, setShowSendEmailDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [savedQuoteData, setSavedQuoteData] = useState<{ id: string; quote_number: string | null; cliente_id: string | null; deal_id: string | null; organization_id: string | null } | null>(null);
  const [whatsAppCtx, setWhatsAppCtx] = useState<WhatsAppContext | null>(null);

  useEffect(() => {
    if (quoteId || !activeCompany?.id || draftRestoredRef.current || typeof window === "undefined") return;

    draftRestoredRef.current = true;
    const rawDraft = localStorage.getItem(getNewQuoteDraftKey(activeCompany.id));
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft);
      if (draft?.version !== NEW_QUOTE_DRAFT_VERSION || !draft.formData) return;

      setFormData(prev => ({ ...prev, ...draft.formData, organization_id: draft.formData.organization_id || activeCompany.id }));
      setQuoteNumber(draft.quoteNumber || null);
      setAutoReference(draft.autoReference || "");
      setLines(Array.isArray(draft.lines) ? draft.lines : []);
      setSections(Array.isArray(draft.sections) && draft.sections.length > 0 ? draft.sections : ["Geral"]);
      setActiveSection(typeof draft.activeSection === "string" ? draft.activeSection : "Geral");
      setSelectedFees(new Set(Array.isArray(draft.selectedFees) ? draft.selectedFees : []));
      setFeeVatOverrides(draft.feeVatOverrides && typeof draft.feeVatOverrides === "object" ? draft.feeVatOverrides : {});
      setInlineQuotes(Array.isArray(draft.inlineQuotes) ? draft.inlineQuotes : []);
      setSelectedDeal(draft.selectedDeal || null);
    } catch (error) {
      console.error("Error restoring quote draft:", error);
    }
  }, [quoteId, activeCompany?.id]);

  useEffect(() => {
    if (quoteId || !activeCompany?.id || !draftRestoredRef.current || typeof window === "undefined") return;

    const hasDraftContent = Boolean(
      formData.deal_id || formData.cliente_id || formData.title || formData.obra_notas ||
      formData.client_notes || formData.conditions || selectedDeal || lines.length > 0 || inlineQuotes.length > 0
    );
    if (!hasDraftContent) return;

    const timeoutId = window.setTimeout(() => {
      localStorage.setItem(getNewQuoteDraftKey(activeCompany.id), JSON.stringify({
        version: NEW_QUOTE_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        formData,
        quoteNumber,
        autoReference,
        lines,
        sections,
        activeSection,
        selectedFees: Array.from(selectedFees),
        feeVatOverrides,
        inlineQuotes,
        selectedDeal,
      }));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [quoteId, activeCompany?.id, formData, quoteNumber, autoReference, lines, sections, activeSection, selectedFees, feeVatOverrides, inlineQuotes, selectedDeal]);

  useEffect(() => {
    if (quoteId || !activeCompany?.id || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasDraftContent = Boolean(
        formData.deal_id || formData.cliente_id || formData.title || formData.obra_notas ||
        formData.client_notes || formData.conditions || selectedDeal || lines.length > 0 || inlineQuotes.length > 0
      );
      if (!hasDraftContent) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [quoteId, activeCompany?.id, formData, lines.length, inlineQuotes.length, selectedDeal]);

  // Generate auto-reference for new quotes
  useEffect(() => {
    if (!quoteId && !autoReference) {
      const hasSavedDraft = activeCompany?.id && typeof window !== "undefined"
        ? localStorage.getItem(getNewQuoteDraftKey(activeCompany.id))
        : null;
      if (hasSavedDraft) return;

      const year = new Date().getFullYear();
      const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
      setAutoReference(`Q-${year}-${seq}`);
    }
  }, [quoteId, autoReference, activeCompany?.id]);

  // Check if user is system admin
  useEffect(() => {
    // Use companyUserType from context instead of querying profiles
    setIsSystemAdmin(companyUserType === "system_admin");
  }, [companyUserType]);

  // Auto-set organization_id when activeCompany changes (for new quotes)
  useEffect(() => {
    if (activeCompany?.id && !quoteId && !formData.organization_id) {
      setFormData(prev => ({ ...prev, organization_id: activeCompany.id }));
    }
  }, [activeCompany?.id, quoteId]);

  useEffect(() => {
    let cancelled = false;

    const resolveEntity = async () => {
      const directEntityId = selectedDeal?.entity_id || selectedSource?.entity_id || null;
      if (directEntityId) {
        setResolvedQuoteEntityId(directEntityId);
        return;
      }

      const entityId = await resolveQuotePdfEntityId({
        dealId: formData.deal_id,
        proposalId: formData.proposal_id || null,
        clienteId: formData.cliente_id,
        clientId: selectedDeal?.client_id || null,
        contactId: (selectedDeal as any)?.contact_id || null,
        leadId: selectedDeal?.lead_id || null,
      });

      if (!cancelled) setResolvedQuoteEntityId(entityId || null);
    };

    void resolveEntity();
    return () => { cancelled = true; };
  }, [formData.cliente_id, formData.deal_id, formData.proposal_id, selectedDeal, selectedSource]);

  // When launched from a proposal context, pre-link the new quote and pre-fill
  // deal/entity/org from that proposal so the user doesn't have to re-pick them.
  const proposalContextLoadedRef = useRef(false);
  useEffect(() => {
    if (quoteId || proposalContextLoadedRef.current) return;
    if (!initialProposalId) return;
    proposalContextLoadedRef.current = true;
    (async () => {
      try {
        const { data: prop } = await (supabase as any)
          .from("proposals")
          .select("id, title, deal_id, entity_id, organization_id, assigned_to, deals!deal_id(id, title, entity_id, organization_id, client_id, assigned_to, lead_id, contact_id)")
          .eq("id", initialProposalId)
          .maybeSingle();
        if (!prop) return;
        const dealId = initialDealId || prop.deal_id || "";
        const orgId = prop.organization_id || prop.deals?.organization_id || activeCompany?.id || "";
        const clientId = prop.deals?.client_id || "";
        // Inherit assigned_to from the deal/lead/contact/client chain.
        // Only overwrite if the user hasn't touched the dropdown.
        const inheritedAssigned = await resolveQuoteAssignedTo({
          supabase: supabase as any,
          dealId: prop.deal_id || prop.deals?.id || null,
          clienteId: prop.deals?.client_id || null,
          organizationId: prop.organization_id || prop.deals?.organization_id || activeCompany?.id || null,
          fallbackUserId: prop.assigned_to || prop.deals?.assigned_to || null,
        });
        setFormData(prev => ({
          ...prev,
          proposal_id: prop.id,
          deal_id: dealId || prev.deal_id,
          organization_id: orgId || prev.organization_id,
          cliente_id: clientId || prev.cliente_id,
          title: prev.title || prop.title || "",
          is_draft: false,
          assigned_to: assignedToTouched ? prev.assigned_to : (inheritedAssigned ?? prev.assigned_to),
        }));
        if (prop.deals) {
          setSelectedDeal({
            id: prop.deals.id,
            title: prop.deals.title,
            entity_id: prop.deals.entity_id ?? null,
            organization_id: prop.deals.organization_id ?? null,
            client_id: prop.deals.client_id ?? null,
          } as any);
        }
      } catch (err) {
        console.error("[QuoteBuilder] failed to preload proposal context", err);
      }
    })();
  }, [quoteId, initialProposalId, initialDealId, activeCompany?.id]);

  // Resolve root organization id
  useEffect(() => {
    const resolveRoot = async () => {
      if (!activeCompany?.id) return;
      const { data: allH } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id")
        .in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);
      const parentMap = new Map<string, string>();
      (allH || []).forEach((h: any) => parentMap.set(h.child_org_id, h.parent_org_id));
      let current = activeCompany.id;
      while (parentMap.has(current)) current = parentMap.get(current)!;
      setResolvedRootOrgId(current);
    };
    resolveRoot();
  }, [activeCompany?.id]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchClients();
      fetchOrganizations();
      fetchCatalogItems();
      checkPermissions();
      if (quoteId) {
        fetchQuote();
      }
    }
  }, [quoteId, activeCompany?.id]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchTemplates();
    }
  }, [formData.organization_id, activeCompany?.id]);

  useEffect(() => {
    if (activeCompany?.id) {
      fetchProducts();
      fetchServices();
      fetchServiceFees();
    }
  }, [activeCompany?.id]);

  // Load PDF layout templates (proposal_templates) for the org
  useEffect(() => {
    const orgId = formData.organization_id || activeCompany?.id || null;
    if (!orgId) { setPdfTemplates([]); return; }
    (async () => {
      try {
        const tpls = await fetchActivePdfTemplates(orgId);
        setPdfTemplates(tpls || []);
      } catch (e) {
        console.error("Error loading PDF templates:", e);
        setPdfTemplates([]);
      }
    })();
  }, [formData.organization_id, activeCompany?.id]);

  // Reload clients, deals and service fees when form organization changes
  useEffect(() => {
    if (formData.organization_id) {
      fetchClients();
      fetchDeals();
      fetchServiceFees();
    }
  }, [formData.organization_id]);

  const checkPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user can edit costs (backoffice role)
      const { data: costsPermission } = await supabase
        .rpc('has_permission', { 
          _user_id: user.id, 
          _permission_code: 'quotes.manage' 
        });
      
      setCanEditCosts(!!costsPermission);

      // Check if user can edit margins (manager or admin)
      const { data: marginsPermission } = await supabase
        .rpc('has_permission', { 
          _user_id: user.id, 
          _permission_code: 'quotes.edit' 
        });
      
      setCanEditMargins(!!marginsPermission || !!costsPermission);
    } catch (error) {
      console.error("Error checking permissions:", error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const orgIds = Array.from(new Set([
        formData.organization_id,
        activeCompany?.id,
        ...descendantOrgIds,
      ].filter(Boolean)));

      let query = supabase
        .from("quote_templates")
        .select("*")
        .eq("active", true);

      if (orgIds.length > 0) {
        const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(",");
        query = query.or(`organization_id.is.null,${orgFilter}`);
      } else {
        query = query.is("organization_id", null);
      }

      const { data, error } = await query.order("codigo", { ascending: true });

      if (error) throw error;
      setTemplates(Array.from(new Map((data || []).map((template: any) => [template.id, template])).values()));
    } catch (error: any) {
      console.error("Error fetching templates:", error);
    }
  };

  const loadTemplateItems = async (templateCode: string) => {
    try {
      // Find template by codigo
      let query = supabase
        .from("quote_templates")
        .select("id")
        .eq("codigo", templateCode)
        .eq("active", true);

      // Filter by selected organization in the form
      const orgForTemplate = formData.organization_id || activeCompany?.id;
      if (orgForTemplate) {
        query = query.or(`organization_id.is.null,organization_id.eq.${orgForTemplate}`);
      } else {
        query = query.is("organization_id", null);
      }

      const { data: template, error: templateError } = await query.single();

      if (templateError || !template) {
        console.error("Template not found:", templateCode, templateError);
        toast({
          title: t('quoteBuilder.toast.templateNotFound'),
          description: t('quoteBuilder.toast.couldNotLoadTemplate'),
          variant: "destructive",
        });
        return;
      }

      // Load template items
      const { data: templateItems, error: itemsError } = await supabase
        .from("quote_template_items")
        .select(`
          *,
         default_attributes,
          bundle_id,
          item_type,
          product:products(
            id,
            name,
            description,
            sku,
            product_categories!category_id (name),
            uom:uom_id(code, description)
          ),
          service:services(
            id,
            name,
            short_desc,
            long_desc,
            sku,
            service_categories:service_category_id(name)
          )
        `)
        .eq("template_id", template.id)
        .order("ordem");

      if (itemsError) throw itemsError;

      // Extract all attribute IDs from default_attributes
      const allAttributeIds = new Set<string>();
      templateItems?.forEach(item => {
        if (item.default_attributes && typeof item.default_attributes === 'object') {
          Object.keys(item.default_attributes).forEach(attrId => allAttributeIds.add(attrId));
        }
      });

      if (!templateItems || templateItems.length === 0) {
        toast({
          title: t('quoteBuilder.toast.emptyTemplate'),
          description: t('quoteBuilder.toast.templateNoItems'),
          variant: "destructive",
        });
        return;
      }

      // Get product IDs, service IDs and bundle IDs
      const productIds = templateItems.filter(i => i.product_id).map(i => i.product_id!);
      const serviceIds = templateItems.filter(i => i.service_id).map(i => i.service_id!);
      const bundleIds = templateItems.filter(i => (i as any).item_type === 'bundle' && (i as any).bundle_id).map(i => (i as any).bundle_id as string);

      // Fetch all pricing data in parallel
      const [productPricesResult, servicePricesResult, attrRangesResult, optionPricesByProduct] = await Promise.all([
        // Fetch prices for products
        productIds.length > 0 
          ? supabase.from("product_prices").select("product_id, price, vat_rate").eq("price_type", "retail").in("product_id", productIds)
          : Promise.resolve({ data: [] }),
        // Fetch prices for services
        serviceIds.length > 0 
          ? supabase.from("service_prices").select("service_id, price, vat_rate").eq("price_type", "retail").in("service_id", serviceIds)
          : Promise.resolve({ data: [] }),
        // Fetch attribute price ranges via unified helper, per product (Product → Subcategory → Category → Ancestor → Global)
        allAttributeIds.size > 0 && productIds.length > 0
          ? Promise.all(productIds.map(async (pid) => {
              const map = await getEffectiveProductRanges({
                productId: pid,
                attributeIds: Array.from(allAttributeIds),
                priceContext: 'retail',
              });
              const flat: any[] = [];
              map.forEach((rows) => {
                for (const r of rows) flat.push({ ...r, product_id: pid });
              });
              return flat;
            })).then((arrays) => ({ data: arrays.flat() }))
          : Promise.resolve({ data: [] }),
        // Fetch attribute option prices via helper (respects product → subcategory → category → ancestor → global)
        allAttributeIds.size > 0 && productIds.length > 0
          ? Promise.all(productIds.map(async (pid) => {
              const list = await getEffectiveProductOptionPrices({
                productId: pid,
                attributeIds: Array.from(allAttributeIds),
                priceContext: 'retail',
              });
              return [pid, list] as const;
            })).then((entries) => new Map(entries))
          : Promise.resolve(new Map<string, Awaited<ReturnType<typeof getEffectiveProductOptionPrices>>>())

      ]);

      const productPricesMap = new Map<string, { price: number; vat_rate: number }>(
        (productPricesResult.data || []).map(p => [p.product_id, { price: p.price as number, vat_rate: p.vat_rate as number ?? 23 }])
      );

      const servicePricesMap = new Map<string, { price: number; vat_rate: number }>(
        (servicePricesResult.data || []).map(p => [p.service_id, { price: p.price as number, vat_rate: p.vat_rate as number ?? 23 }])
      );

      // Fetch bundles + components + prices for any bundle template items
      const bundlesMap = new Map<string, { name: string; sku: string; description: string | null; pricing_type: string; fixed_price: number | null; discount_percent: number | null; discount_fixed: number | null; components: any[]; choice_groups: any[] }>();
      if (bundleIds.length > 0) {
        const { data: bundlesData } = await supabase
          .from("bundles")
          .select(`
            id, sku, name, description, pricing_type, fixed_price, discount_percent, discount_fixed,
            bundle_components (
              id, product_id, service_id, quantity, is_optional,
              pricing_mode, custom_price, custom_discount_percent, custom_discount_fixed,
              choice_group_id, sort_order,
              products:product_id (
                id, name, sku,
                product_prices (price, vat_rate, price_type)
              ),
              services:service_id (
                id, name, sku,
                service_prices (price, vat_rate, price_type)
              )
            ),
            bundle_choice_groups (
              id, name, min_selections, max_selections, is_required, sort_order
            )
          `)
          .in("id", bundleIds);

        (bundlesData || []).forEach((b: any) => {
          bundlesMap.set(b.id, {
            name: b.name,
            sku: b.sku,
            description: b.description,
            pricing_type: b.pricing_type,
            fixed_price: b.fixed_price,
            discount_percent: b.discount_percent,
            discount_fixed: b.discount_fixed,
            components: b.bundle_components || [],
            choice_groups: b.bundle_choice_groups || [],
          });
        });
      }


      // Helper functions for attribute price calculation
      const parseDimension = (value: string): { depth: number; width: number } | null => {
        const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
        return match ? { depth: parseFloat(match[1]), width: parseFloat(match[2]) } : null;
      };

      const parseDimension3d = (value: string): { depth: number; width: number; height: number } | null => {
        const match = value.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
        return match ? { depth: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) } : null;
      };

      const extractNumericValue = (value: string): number | null => {
        const direct = parseFloat(value);
        if (!isNaN(direct)) return direct;
        const dims3d = parseDimension3d(value);
        if (dims3d) return Math.max(dims3d.depth, dims3d.width, dims3d.height);
        const dims = parseDimension(value);
        if (dims) return Math.max(dims.depth, dims.width);
        const numMatch = value.match(/(\d+(?:\.\d+)?)/);
        return numMatch ? parseFloat(numMatch[1]) : null;
      };

      const findRangePrice = (productId: string, attrId: string, value: string): number => {
        const ranges = attrRangesResult.data?.filter(r => r.attribute_id === attrId) || [];
        if (ranges.length === 0) return 0;

        // Prioritize product-specific ranges
        const productRanges = ranges.filter(r => r.product_id === productId);
        const finalRanges = productRanges.length > 0 ? productRanges : ranges.filter(r => r.product_id === null);
        if (finalRanges.length === 0) return 0;

        // Check 3D dimension ranges
        const dimension3dRanges = finalRanges.filter(r => (r.range_type ?? 'linear').toLowerCase() === 'dimension3d');
        if (dimension3dRanges.length > 0) {
          const dims3d = parseDimension3d(value);
          if (dims3d) {
            const sortedRanges = [...dimension3dRanges].sort((a, b) => {
              const aVolume = ((a.max_depth || 999999) - (a.min_depth || 0)) * 
                              ((a.max_width || 999999) - (a.min_width || 0)) * 
                              ((a.max_height || 999999) - (a.min_height || 0));
              const bVolume = ((b.max_depth || 999999) - (b.min_depth || 0)) * 
                              ((b.max_width || 999999) - (b.min_width || 0)) * 
                              ((b.max_height || 999999) - (b.min_height || 0));
              return aVolume - bVolume;
            });
            const match = sortedRanges.find(r => 
              dims3d.depth >= (r.min_depth || 0) && (r.max_depth === null || dims3d.depth <= r.max_depth) &&
              dims3d.width >= (r.min_width || 0) && (r.max_width === null || dims3d.width <= r.max_width) &&
              dims3d.height >= (r.min_height || 0) && (r.max_height === null || dims3d.height <= r.max_height)
            );
            if (match) return match.price_per_unit || 0;
          }
        }

        // Check 2D dimension ranges
        const dimensionRanges = finalRanges.filter(r => (r.range_type ?? 'linear').toLowerCase() === 'dimension');
        if (dimensionRanges.length > 0) {
          const dims = parseDimension(value);
          if (dims) {
            const sortedRanges = [...dimensionRanges].sort((a, b) => {
              const aArea = ((a.max_width || 999999) - (a.min_width || 0)) * ((a.max_height || 999999) - (a.min_height || 0));
              const bArea = ((b.max_width || 999999) - (b.min_width || 0)) * ((b.max_height || 999999) - (b.min_height || 0));
              return aArea - bArea;
            });
            const match = sortedRanges.find(r => 
              dims.depth >= (r.min_width || 0) && (r.max_width === null || dims.depth <= r.max_width) &&
              dims.width >= (r.min_height || 0) && (r.max_height === null || dims.width <= r.max_height)
            );
            if (match) return match.price_per_unit || 0;
          }
        }

        // Check linear ranges
        const linearRanges = finalRanges.filter(r => {
          const rt = (r.range_type ?? 'linear').toLowerCase();
          return rt === 'linear' || rt === '';
        });
        if (linearRanges.length > 0) {
          const numValue = extractNumericValue(value);
          if (numValue !== null) {
            const sortedRanges = [...linearRanges].sort((a, b) => {
              const aRange = (a.max_value || 999999) - (a.min_value || 0);
              const bRange = (b.max_value || 999999) - (b.min_value || 0);
              return aRange - bRange;
            });
            const match = sortedRanges.find(r => 
              numValue >= (r.min_value || 0) && (r.max_value === null || numValue <= r.max_value)
            );
            if (match) return match.price_per_unit || 0;
          }
        }

        return 0;
      };

      const findOptionPrice = (productId: string, attrId: string, value: string): number => {
        if (!value) return 0;
        const list = optionPricesByProduct.get(productId) || [];
        const match = list.find(p => p.attrId === attrId && p.value === value);
        // Return explicit price (including 0) when an effective override exists
        return match ? Number(match.price) || 0 : 0;
      };

      const calculateAttributeAddon = (productId: string, attributes: Record<string, any>): number => {
        let totalAddon = 0;
        Object.entries(attributes).forEach(([attrId, attrData]) => {
          const value = attrData.value?.toString() || '';
          if (value) {
            totalAddon += findRangePrice(productId, attrId, value);
            totalAddon += findOptionPrice(productId, attrId, value);
          }
        });
        return totalAddon;
      };

      // Create quote lines from template items
      const newLines: QuoteLine[] = templateItems
        .map((item, index) => {
          if (item.item_type === 'product' && item.product) {
            const priceInfo = productPricesMap.get(item.product.id) || { price: 0, vat_rate: 23 };
            const vatRate = priceInfo.vat_rate;

            // Calculate attribute price addon from default_attributes
            const attributePriceAddon = item.default_attributes && 
              typeof item.default_attributes === 'object' && 
              !Array.isArray(item.default_attributes) &&
              Object.keys(item.default_attributes).length > 0
              ? calculateAttributeAddon(item.product.id, item.default_attributes as Record<string, any>)
              : 0;

            const retailPrice = priceInfo.price + attributePriceAddon;
            const defaultMargin = 30;
            const materialCost = retailPrice > 0 ? retailPrice / (1 + defaultMargin / 100) : 0;
            
            return {
              catalog_item_id: null,
              product_id: item.product.id,
              selected_attributes: item.default_attributes || {},
              categoria: item.product.product_categories?.name || "General",
              descricao_snapshot: item.product.name,
              item_description: item.product.description || "",
              sku: item.product.sku,
              unidade: (item.product as any).uom?.code || (item.product as any).uom?.description || null,
              qt: item.default_qt,
              custo_material_unit: materialCost,
              custo_mao_obra_unit: 0,
              margem_percent: defaultMargin,
              iva_percent: vatRate,
              attribute_price_addon: attributePriceAddon,
              int_percent: 0,
              discount_percent: 0,
              ordem: index,
              section_name: "Geral",
            };
          } else if (item.item_type === 'service' && item.service) {
            const priceInfo = servicePricesMap.get(item.service.id) || { price: 0, vat_rate: 23 };
            const retailPrice = priceInfo.price;
            const vatRate = priceInfo.vat_rate;
            const defaultMargin = 30;
            const materialCost = retailPrice > 0 ? retailPrice / (1 + defaultMargin / 100) : 0;
            
            return {
              catalog_item_id: null,
              service_id: item.service.id,
              categoria: (item.service as any).service_categories?.name || "Service",
              descricao_snapshot: item.service.name,
              item_description: (item.service as any).long_desc || item.service.short_desc || "",
              sku: item.service.sku,
              unidade: (item.service as any).uom?.symbol || (item.service as any).uom?.name || null,
              qt: item.default_qt,
              custo_material_unit: materialCost,
              custo_mao_obra_unit: 0,
              margem_percent: defaultMargin,
              iva_percent: vatRate,
              int_percent: 0,
              discount_percent: 0,
              ordem: index,
              section_name: "Geral",
            };
          } else if ((item as any).item_type === 'bundle' && (item as any).bundle_id) {
            const bundle = bundlesMap.get((item as any).bundle_id);
            if (!bundle) return null;

            // Default-pick first N components per choice group (min_selections); include required + optional non-grouped
            const selectedChoice: any[] = [];
            (bundle.choice_groups || []).forEach((g: any) => {
              const groupComps = (bundle.components || [])
                .filter((c: any) => c.choice_group_id === g.id)
                .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
              const min = Math.max(0, g.min_selections || 0);
              selectedChoice.push(...groupComps.slice(0, min));
            });
            const baseComps = (bundle.components || []).filter((c: any) => !c.choice_group_id);

            const compBasePrice = (c: any): number => {
              if (c.product_id && c.products?.product_prices) {
                return c.products.product_prices.find((p: any) => p.price_type === 'retail')?.price || 0;
              }
              if (c.service_id && c.services?.service_prices) {
                return c.services.service_prices.find((p: any) => p.price_type === 'retail')?.price || 0;
              }
              return 0;
            };
            const compVatRate = (c: any): number => {
              if (c.product_id && c.products?.product_prices) {
                return c.products.product_prices.find((p: any) => p.price_type === 'retail')?.vat_rate ?? 23;
              }
              if (c.service_id && c.services?.service_prices) {
                return c.services.service_prices.find((p: any) => p.price_type === 'retail')?.vat_rate ?? 23;
              }
              return 23;
            };

            const allComps = [...baseComps, ...selectedChoice];
            const originalTotal = allComps.reduce((s, c) => s + compBasePrice(c) * (c.quantity || 1), 0);

            // Apply pricing_type at component level (matches BundleSelectionTab logic)
            const components = allComps.map((c: any) => {
              const base = compBasePrice(c);
              let unitPrice = base;
              if (bundle.pricing_type === 'fixed_price' && originalTotal > 0) {
                const proportion = base / originalTotal;
                unitPrice = (bundle.fixed_price || 0) * proportion;
              } else if (bundle.pricing_type === 'percentage_discount') {
                unitPrice = base * (1 - (bundle.discount_percent || 0) / 100);
              } else if (bundle.pricing_type === 'fixed_discount' && originalTotal > 0) {
                const proportion = base / originalTotal;
                const discountShare = (bundle.discount_fixed || 0) * proportion;
                unitPrice = Math.max(0, base - discountShare);
              } else if (bundle.pricing_type === 'custom') {
                if (c.pricing_mode === 'custom_price' && c.custom_price != null) unitPrice = c.custom_price;
                else if (c.pricing_mode === 'discount_percent' && c.custom_discount_percent != null) unitPrice = base * (1 - c.custom_discount_percent / 100);
                else if (c.pricing_mode === 'discount_fixed' && c.custom_discount_fixed != null) unitPrice = Math.max(0, base - c.custom_discount_fixed);
              }
              const isProduct = !!c.product_id;
              const itemRef = isProduct ? c.products : c.services;
              return {
                id: `${(item as any).bundle_id}_${c.id}`,
                name: itemRef?.name || '',
                sku: itemRef?.sku || null,
                type: isProduct ? 'product' : 'service',
                source_id: isProduct ? c.product_id : c.service_id,
                quantity: c.quantity || 1,
                unit_price: unitPrice,
                vat_rate: compVatRate(c),
              };
            });

            const unitTotalPrice = components.reduce((s, c) => s + c.unit_price * c.quantity, 0);
            const defaultMargin = 30;
            const defaultInt = 0;
            const materialCost = unitTotalPrice > 0
              ? unitTotalPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100)
              : 0;

            return {
              catalog_item_id: null,
              product_id: null,
              service_id: null,
              bundle_id: (item as any).bundle_id,
              bundle_components: components,
              selected_attributes: { bundle_components: components },
              categoria: "Bundles",
              descricao_snapshot: bundle.name,
              item_description: bundle.description || "",
              sku: bundle.sku,
              unidade: null,
              qt: item.default_qt,
              custo_material_unit: materialCost,
              custo_mao_obra_unit: 0,
              margem_percent: defaultMargin,
              iva_percent: 23,
              int_percent: defaultInt,
              discount_percent: 0,
              ordem: index,
              section_name: "Geral",
            } as QuoteLine;
          }
          return null;
        })
        .filter(Boolean) as QuoteLine[];

      setLines(newLines);

      toast({
        title: t('quoteBuilder.toast.templateLoaded'),
        description: t('quoteBuilder.toast.itemsAddedToQuote', { count: newLines.length }),
      });
    } catch (error: any) {
      console.error("Error loading template items:", error);
      toast({
        title: t('quoteBuilder.toast.errorLoadingTemplate'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleModeloBaseChange = (newModelo: string) => {
    setFormData({ ...formData, modelo_base: newModelo });
    // "0" / vazio = "Nenhum" → não carrega template e limpa itens
    if (!newModelo || newModelo === "0") {
      setLines([]);
      return;
    }
    loadTemplateItems(newModelo);
  };

  const fetchClients = async () => {
    const orgIdToUse = formData.organization_id || activeCompany?.id;
    if (!orgIdToUse && !isSystemAdmin) return;
    
    try {
      let query = (supabase as any)
        .from("anew_clients")
        .select("id, entity_id, client_type")
        .eq("status", "active");
      
      if (!isSystemAdmin && orgIdToUse) {
        query = query.eq("organization_id", orgIdToUse);
      }
      
      const { data: clientsData } = await query;
      
      if (!clientsData || clientsData.length === 0) {
        setClients([]);
        return;
      }
      
      // Resolve entity names
      const entityIds = clientsData.map((c: any) => c.entity_id).filter(Boolean);
      const { data: entities } = await (supabase as any)
        .from("anew_entities")
        .select("id, display_name, first_name, last_name, type")
        .in("id", entityIds);
      
      const entityMap = new Map<string, any>();
      (entities || []).forEach((e: any) => entityMap.set(e.id, e));
      
      const mapped = clientsData.map((c: any) => {
        const entity = entityMap.get(c.entity_id);
        return {
          id: c.id,
          first_name: entity?.first_name || entity?.display_name?.split(" ")[0] || "",
          last_name: entity?.last_name || "",
          company_name: entity?.type === "company" ? entity?.display_name : null,
          client_type: c.client_type === "company" ? "company" as const : "person" as const,
        };
      });
      
      setClients(mapped);
    } catch (error: any) {
      console.error("Error fetching clients:", error);
    }
  };

  const fetchOrganizations = async () => {
    const { data } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name")
      .order("name");
    setOrganizations(data || []);
  };

  const fetchCatalogItems = async () => {
    if (!activeCompany?.id && !isSystemAdmin) return;
    
    let query = supabase
      .from("catalog_items")
      .select("*")
      .eq("ativo", true);
    
    // Only filter by company if not system admin
    if (!isSystemAdmin && activeCompany?.id) {
      query = query.or(`organization_id.is.null,organization_id.eq.${activeCompany.id}`);
    }
    
    const { data } = await query.order("ordem");
    setCatalogItems(data || []);
  };

  const fetchDeals = async () => {
    const orgIdToUse = formData.organization_id || activeCompany?.id;
    if (!orgIdToUse) {
      setDeals([]);
      return;
    }

    try {
      const visibleOrgIds = userCompanies.map(c => c.id);
      const orgIds = visibleOrgIds.length > 0 ? visibleOrgIds : [orgIdToUse];

      const scope = getPermissionScope("deals.view");
      const isFullScope = isSystemAdmin || scope === "ORG";

      let query = (supabase as any)
        .from("deals")
        .select("id, title, client_id, lead_id, contact_id, organization_id, entity_id, assigned_to, created_by")
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false });

      if (!isFullScope) {
        if (scope === "NONE" || !scopeAnewUserId) { setDeals([]); return; }
        const allowedIds = new Set<string>([scopeAnewUserId]);
        if (scope === "TEAM") teamMemberIds.forEach(id => allowedIds.add(id));
        const allowedList = Array.from(allowedIds);
        query = query.or(
          `assigned_to.in.(${allowedList.join(',')}),created_by.in.(${allowedList.join(',')})`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setDeals(data || []);
    } catch (error: any) {
      console.error("Error loading deals:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let productsQuery = supabase
        .from("products")
        .select(`
          id,
          sku,
          name,
          description,
          organization_id,
          product_categories!category_id (name),
          brands (name),
          uom:uom_id(code, description)
        `)
        .eq("is_sellable", true)
        .eq("is_active", true)
        .eq("status", "active");

      // Filter by user's companies - load all products from user's companies for filtering
      const userCompanyIds = userCompanies.map(c => c.id);
      if (!isSystemAdmin && userCompanyIds.length > 0) {
        productsQuery = productsQuery.in("organization_id", userCompanyIds);
      } else if (isSystemAdmin && userCompanyIds.length > 0) {
        // System admin sees all from their companies + global
        const companyFilter = userCompanyIds.map(id => `organization_id.eq.${id}`).join(',');
        productsQuery = productsQuery.or(`organization_id.is.null,${companyFilter}`);
      }

      const { data: productsData } = await productsQuery.order("name").limit(10000);
      const productIds = productsData?.map(p => p.id) || [];
      
      // Batch price queries to avoid URL length limits with large ID lists
      const BATCH_SIZE = 200;
      const allPricesData: any[] = [];
      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        const batch = productIds.slice(i, i + BATCH_SIZE);
        const { data: batchPrices } = await supabase
          .from("product_prices")
          .select("product_id, price, vat_rate")
          .eq("price_type", "retail")
          .in("product_id", batch);
        if (batchPrices) allPricesData.push(...batchPrices);
      }

      const pricesMap = new Map(allPricesData.map(p => [p.product_id, { price: p.price, vat_rate: p.vat_rate }]));

      const mappedItems: ProductCatalogItem[] = (productsData || []).map((product: any) => {
        const priceInfo = pricesMap.get(product.id);
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          sku: product.sku,
          category_name: product.product_categories?.name || null,
          brand_name: product.brands?.name || null,
          retail_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
          organization_id: product.organization_id,
          uom_symbol: product.uom?.code || null,
          uom_name: product.uom?.description || null,
        };
      });

      setProducts(mappedItems);
      
      // Fetch attributes for products
      if (productIds.length > 0) {
        await fetchProductAttributes(productIds);
      }
    } catch (error: any) {
      console.error("Error loading products:", error);
    }
  };

  const fetchProductAttributes = async (productIds: string[]) => {
    try {
      const { data: attributeValues } = await supabase
        .from("product_attribute_values")
        .select(`
          product_id,
          attribute_id,
          value_text,
          product_attributes!inner (
            id,
            name
          )
        `)
        .in("product_id", productIds);

      const attributesMap = new Map<string, ProductAttribute[]>();
      
      (attributeValues || []).forEach((av: any) => {
        const productId = av.product_id;
        const attrId = av.attribute_id;
        const attrName = av.product_attributes?.name;
        const value = av.value_text;
        
        if (!attrName || !value) return;
        
        if (!attributesMap.has(productId)) {
          attributesMap.set(productId, []);
        }
        
        const attrs = attributesMap.get(productId)!;
        const existingAttr = attrs.find(a => a.id === attrId);
        
        if (existingAttr) {
          if (!existingAttr.values.find(v => v.value === value)) {
            existingAttr.values.push({ id: av.id, value: value });
          }
        } else {
          attrs.push({
            id: attrId,
            name: attrName,
            code: attrName.toLowerCase().replace(/\s+/g, '_'),
            value_type: 'text',
            unit: null,
            allowed_values: null,
            values: [{ id: av.id, value: value }]
          });
        }
      });

      setProductAttributes(attributesMap);
    } catch (error: any) {
      console.error("Error loading product attributes:", error);
    }
  };

  const fetchServices = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("services")
        .select(`
          id,
          sku,
          name,
          short_desc,
          long_desc,
          organization_id,
          service_categories:service_category_id(name)
        `)
        .eq("is_active", true)
        .in("service_type", ["sale", "both"]);

      // Filter by user's companies - load all services from user's companies for filtering
      const userCompanyIds = userCompanies.map(c => c.id);
      if (!isSystemAdmin && userCompanyIds.length > 0) {
        query = query.in("organization_id", userCompanyIds);
      } else if (isSystemAdmin && userCompanyIds.length > 0) {
        // System admin sees all from their companies + global
        const companyFilter = userCompanyIds.map(id => `organization_id.eq.${id}`).join(',');
        query = query.or(`organization_id.is.null,${companyFilter}`);
      }

      const { data: servicesData } = await query.order("name").limit(10000);
      const serviceIds = servicesData?.map(s => s.id) || [];
      
      // Batch price queries to avoid URL length limits with large ID lists
      const BATCH_SIZE = 200;
      const allPricesData: any[] = [];
      for (let i = 0; i < serviceIds.length; i += BATCH_SIZE) {
        const batch = serviceIds.slice(i, i + BATCH_SIZE);
        const { data: batchPrices } = await supabase
          .from("service_prices")
          .select("service_id, price, vat_rate")
          .eq("price_type", "retail")
          .in("service_id", batch);
        if (batchPrices) allPricesData.push(...batchPrices);
      }

      const pricesMap = new Map(allPricesData.map(p => [p.service_id, { price: p.price, vat_rate: p.vat_rate }]));

      const mappedServices: ProductCatalogItem[] = (servicesData || []).map((service: any) => {
        const priceInfo = pricesMap.get(service.id);
        return {
          id: service.id,
          name: service.name,
          description: service.long_desc || service.short_desc,
          sku: service.sku,
          category_name: service.service_categories?.name || null,
          brand_name: null,
          retail_price: priceInfo?.price || null,
          vat_rate: priceInfo?.vat_rate || 23,
          organization_id: service.organization_id,
          uom_symbol: null, // services don't have uom_id
          uom_name: null,
        };
      });

      setServices(mappedServices);
    } catch (error: any) {
      console.error("Error loading services:", error);
    }
  };

  const fetchServiceFees = async () => {
    const orgIdToUse = formData.organization_id || activeCompany?.id;
    if (!orgIdToUse) return;
    
    try {
      const { data, error } = await supabase
        .from("service_fee_types")
        .select("id, name, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate")
        .eq("is_active", true)
        .eq("organization_id", orgIdToUse);

      if (error) throw error;
      setServiceFees((data || []) as ServiceFeeType[]);
    } catch (error: any) {
      console.error("Error loading service fees:", error);
    }
  };

  const fetchQuote = async () => {
    if (!quoteId) return;

    try {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          deals!deal_id(id, title, entity_id, organization_id, client_id, lead_id, contact_id, assigned_to)
        `)
        .eq("id", quoteId)
        .single();

      if (quoteError) throw quoteError;

      setFormData({
        deal_id: quote.deal_id || "",
        cliente_id: quote.cliente_id || "",
        organization_id: quote.organization_id || "",
        title: (quote as any).title || "",
        obra_notas: quote.obra_notas || "",
        modelo_base: quote.modelo_base,
        desconto_global_percent: Number(quote.desconto_global_percent),
        estado: (["rascunho","enviado","aceite","rejeitado"].includes(quote.estado) ? quote.estado : "rascunho") as any,
        validade_dias: quote.validade_dias || 30,
        iva_rate: Number((quote as any).iva_rate) || 23,
        client_notes: (quote as any).client_notes || "",
        conditions: (quote as any).conditions || "",
        proposal_id: (quote as any).proposal_id || "",
        assigned_to: (quote as any).assigned_to || "",
        pdf_template_id: (quote as any).template_id || "",
      });
      // Existing quote: treat assigned_to as user-intentional to avoid silent rewrites.
      setAssignedToTouched(true);
      
      setQuoteNumber(quote.quote_number || null);
      
      // Set selected deal for display with lead info
      if (quote.deals) {
        const dealData = quote.deals as any;
        const fieldValues = dealData.leads?.field_values || {};
        setSelectedDeal({
          id: dealData.id,
          title: dealData.title,
          organization_id: dealData.organization_id,
          client_id: dealData.client_id,
          lead_id: dealData.lead_id,
          contact_id: dealData.contact_id,
          entity_id: dealData.entity_id,
          lead_name: fieldValues.nome || fieldValues.first_name || (fieldValues.first_name && fieldValues.last_name ? `${fieldValues.first_name} ${fieldValues.last_name}` : null),
          lead_phone: fieldValues.telefone || fieldValues.phone || null
        });
      } else if ((quote as any).entity_id) {
        // Hydrate selectedSource when quote has entity_id but no deal,
        // so a subsequent save doesn't downgrade entity_id to null.
        const qEntityId = (quote as any).entity_id as string;
        const qOrgId = (quote as any).organization_id as string | null;
        try {
          let resolved: { kind: "contact" | "client"; id: string; name: string; entity_id: string; organization_id: string | null } | null = null;

          let clientQ = supabase.from("anew_clients").select("id, organization_id").eq("entity_id", qEntityId);
          if (qOrgId) clientQ = clientQ.eq("organization_id", qOrgId);
          const { data: clientRow } = await clientQ.maybeSingle();

          let contactRow: any = null;
          if (!clientRow) {
            let contactQ = supabase.from("anew_contacts").select("id, organization_id").eq("entity_id", qEntityId);
            if (qOrgId) contactQ = contactQ.eq("organization_id", qOrgId);
            const { data } = await contactQ.maybeSingle();
            contactRow = data;
          }

          const { data: entRow } = await supabase
            .from("anew_entities")
            .select("display_name")
            .eq("id", qEntityId)
            .maybeSingle();
          const displayName = (entRow as any)?.display_name || "—";

          if (clientRow) {
            resolved = { kind: "client", id: (clientRow as any).id, name: displayName, entity_id: qEntityId, organization_id: (clientRow as any).organization_id || qOrgId };
          } else if (contactRow) {
            resolved = { kind: "contact", id: contactRow.id, name: displayName, entity_id: qEntityId, organization_id: contactRow.organization_id || qOrgId };
          } else {
            // Ghost source preserves entity_id even if no local role exists.
            resolved = { kind: "contact", id: "", name: displayName, entity_id: qEntityId, organization_id: qOrgId };
          }
          setSelectedSource(resolved);
        } catch (e) {
          console.warn("[QuoteBuilder] failed to hydrate selectedSource for entity", qEntityId, e);
        }
      }

      const { data: quoteLines, error: linesError } = await supabase
        .from("quote_lines")
        .select(`
          *,
          products(sku),
          services(sku)
        `)
        .eq("quote_id", quoteId)
        .order("ordem");

      if (linesError) throw linesError;

      setLines(
        quoteLines.map((line) => ({
          id: line.id,
          catalog_item_id: line.catalog_item_id,
          product_id: line.product_id,
          service_id: line.service_id,
          selected_attributes: line.selected_attributes as Record<string, any> || {},
          bundle_components: Array.isArray((line.selected_attributes as any)?.bundle_components)
            ? ((line.selected_attributes as any).bundle_components as any[]).filter(isBundleComponentLine)
            : undefined,
          bundle_id: (line as any).bundle_id || null,
          categoria: line.categoria,
          descricao_snapshot: line.descricao_snapshot,
          sku: (line.products as any)?.sku || (line.services as any)?.sku || null,
          unidade: (line as any).unidade || null,
          item_description: (line as any).item_description || "",
          cost_price: Number((line as any).cost_price) || 0,
          qt: Number(line.qt),
          custo_material_unit: Number(line.custo_material_unit),
          custo_mao_obra_unit: Number(line.custo_mao_obra_unit),
          margem_percent: Number(line.margem_percent),
          iva_percent: Number(line.iva_percent),
          int_percent: Number(line.int_percent),
          discount_percent: Number((line as any).discount_percent) || 0,
          ordem: line.ordem,
          section_name: (line as any).section_name || "Geral",
        }))
      );
      
      // Extract unique sections from loaded lines
      const loadedSections = [...new Set(quoteLines.map((l: any) => l.section_name || "Geral"))];
      if (loadedSections.length > 0) {
        setSections(loadedSections);
        setActiveSection(loadedSections[0]);
      }

      // Load selected service fees
      const { data: quoteFees, error: feesError } = await supabase
        .from("quote_fees")
        .select("fee_type_id, vat_rate")
        .eq("quote_id", quoteId);

      if (!feesError && quoteFees) {
        setSelectedFees(new Set(quoteFees.map(f => f.fee_type_id)));

        // Fetch current base vat_rate for each referenced fee type so we only
        // record manual overrides (values that differ from the live base).
        const feeIds = Array.from(new Set(quoteFees.map((f: any) => f.fee_type_id).filter(Boolean)));
        const baseByFeeId = new Map<string, number>();
        if (feeIds.length) {
          const { data: baseFees } = await supabase
            .from("service_fee_types")
            .select("id, vat_rate")
            .in("id", feeIds);
          (baseFees || []).forEach((bf: any) => {
            if (typeof bf.vat_rate === "number") baseByFeeId.set(bf.id, bf.vat_rate);
          });
        }

        const overrides: Record<string, number> = {};
        quoteFees.forEach((f: any) => {
          if (typeof f.vat_rate !== "number") return;
          const base = baseByFeeId.get(f.fee_type_id);
          if (typeof base === "number" && f.vat_rate === base) return; // segue a base actual
          overrides[f.fee_type_id] = f.vat_rate; // override manual
        });
        setFeeVatOverrides(overrides);
      }
    } catch (error: any) {
      toast({
        title: t('quoteBuilder.toast.errorLoadingQuote'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const buildWhatsAppContext = async (quoteIdForCtx: string, quoteData: { id: string; quote_number: string | null; cliente_id: string | null; deal_id: string | null; organization_id: string | null }) => {
    try {
      let recipientName = "";
      let recipientPhone = "";
      let recipientPhoneCountryCode = "";
      let entityId: string | undefined;

      // Try to get entity from quote
      const { data: quoteRow } = await (supabase.from("quotes") as any).select("entity_id").eq("id", quoteIdForCtx).single();
      const qEntityId = quoteRow?.entity_id;

      if (!qEntityId && quoteData.deal_id) {
        const { data: deal } = await supabase.from("deals").select("entity_id").eq("id", quoteData.deal_id).single();
        entityId = deal?.entity_id || undefined;
      } else {
        entityId = qEntityId || undefined;
      }

      if (entityId) {
        const [entityRes, phoneRes] = await Promise.all([
          supabase.from("anew_entities").select("display_name").eq("id", entityId).single(),
          supabase.from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", entityId).eq("is_primary", true).maybeSingle(),
        ]);
        recipientName = entityRes.data?.display_name || "";
        recipientPhone = phoneRes.data?.phone_number || "";
        recipientPhoneCountryCode = phoneRes.data?.country_code || "";
      }

      const ctx: WhatsAppContext = {
        module: "quotes",
        recipientName,
        recipientPhone,
        recipientPhoneCountryCode,
        entityId,
        organizationId: quoteData.organization_id || undefined,
        dealId: quoteData.deal_id || undefined,
        quoteTitle: quoteData.quote_number || "",
        quoteValue: totals.grandTotal || 0,
      };
      setWhatsAppCtx(ctx);
      setShowWhatsAppDialog(true);
    } catch (err) {
      console.error("Error building WhatsApp context:", err);
    }
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const handleDownloadPdf = async () => {
    if (!quoteId) {
      toast({ title: "Guarda o orçamento primeiro", description: "É preciso guardar antes de fazer download do PDF.", variant: "destructive" });
      return;
    }
    try {
      setDownloadingPdf(true);
      const { blob, fileName } = await generateQuotePdfBlob(quoteId);
      downloadBlob(blob, fileName);
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e?.message || "Tenta novamente.", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSaveAndSendEmail = () => {
    postSaveActionRef.current = "email";
    handleSave();
  };

  const handleSaveAndSendWhatsApp = () => {
    postSaveActionRef.current = "whatsapp";
    handleSave();
  };




  const handleSave = async () => {
    if (saveLockRef.current || loading) return;

    // Validate at least one line exists
    if (lines.length === 0) {
      toast({
        title: t('quoteBuilder.toast.validationError'),
        description: "Adicione pelo menos uma linha ao orçamento.",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    const errors: Record<string, string> = {};
    // Pedido de Proposta (deal_id) é opcional
    
    // Get organization_id from selected deal
    const companyId = selectedDeal?.organization_id || formData.organization_id || activeCompany?.id;
    if (!companyId) {
      errors.deal_id = t('quoteBuilder.toast.companyRequired');
      setFieldErrors(errors);
      toast({
        title: t('quoteBuilder.toast.validationError'),
        description: t('quoteBuilder.toast.selectCompany'),
        variant: "destructive",
      });
      return;
    }

    // Validate quote data
    const quoteValidation = quoteSchema.safeParse({
      obra_notas: formData.obra_notas,
      modelo_base: formData.modelo_base,
      desconto_global_percent: formData.desconto_global_percent,
    });

    if (!quoteValidation.success) {
      quoteValidation.error.errors.forEach((error) => {
        if (error.path[0]) {
          errors[error.path[0].toString()] = error.message;
        }
      });
      setFieldErrors(errors);
      
      const firstError = quoteValidation.error.errors[0];
      toast({
        title: t('quoteBuilder.toast.validationError'),
        description: firstError.message,
        variant: "destructive",
      });
      return;
    }
    setFieldErrors({});

    for (const line of lines.filter(l => l.qt > 0)) {
      const lineValidation = quoteLineSchema.safeParse({
        qt: line.qt,
        margem_percent: line.margem_percent,
        iva_percent: line.iva_percent,
        int_percent: line.int_percent,
      });

      if (!lineValidation.success) {
        const firstError = lineValidation.error.errors[0];
        toast({
          title: t('quoteBuilder.toast.lineValidationError'),
          description: `${line.descricao_snapshot}: ${firstError.message}`,
          variant: "destructive",
        });
        return;
      }
    }

    saveLockRef.current = true;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Resolve business user id (anew_users.id) for any created_by writes.
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Não foi possível identificar o utilizador. Faça login novamente.", variant: "destructive" });
        return;
      }

      let savedQuoteId = quoteId;

      const dealOrgId = selectedDeal?.organization_id || formData.organization_id || activeCompany?.id;
      const dealClientId = selectedDeal?.client_id || formData.cliente_id;

      // Resolve assigned_to via canonical chain (deal → lead → contact → client → entity → fallback).
      // If user manually picked a comercial (assignedToTouched), respect it.
      const dealOrgIdForResolve = selectedDeal?.organization_id || formData.organization_id || activeCompany?.id || null;
      const entityIdForResolve = selectedDeal?.entity_id || selectedSource?.entity_id || resolvedQuoteEntityId || null;
      const resolvedFromChain = await resolveQuoteAssignedTo({
        supabase: supabase as any,
        dealId: formData.deal_id || null,
        clienteId: dealClientId || (selectedSource?.kind === "client" ? selectedSource.id : null),
        entityId: entityIdForResolve,
        organizationId: dealOrgIdForResolve,
        fallbackUserId: null,
      });
      const resolvedAssignedTo: string | null = assignedToTouched
        ? (formData.assigned_to || null)
        : (resolvedFromChain ?? formData.assigned_to ?? null);

      // Defense in depth: never downgrade an existing quote's entity_id to null.
      // Fallback chain: explicit picker selection -> async-resolved entity (deal/proposal/lead/client/contact) -> existing DB value.
      let resolvedEntityId: string | null =
        selectedDeal?.entity_id || selectedSource?.entity_id || resolvedQuoteEntityId || null;
      if (quoteId && !resolvedEntityId) {
        try {
          const { data: existing } = await (supabase as any)
            .from("quotes")
            .select("entity_id")
            .eq("id", quoteId)
            .maybeSingle();
          if (existing?.entity_id) resolvedEntityId = existing.entity_id;
        } catch (e) {
          console.warn("[QuoteBuilder] failed reading existing entity_id guard", e);
        }
      }

      const quoteData = {
        deal_id: formData.deal_id || null,
        cliente_id: dealClientId || (selectedSource?.kind === "client" ? selectedSource.id : null),
        organization_id: dealOrgId || selectedSource?.organization_id || activeCompany?.id || null,
        root_organization_id: resolvedRootOrgId || activeCompany?.id || null,
        entity_id: resolvedEntityId,
        title: formData.title || null,
        obra_notas: formData.obra_notas,
        modelo_base: formData.modelo_base,
        desconto_global_percent: formData.desconto_global_percent,
        estado: formData.estado || "rascunho",
        validade_dias: formData.validade_dias,
        iva_rate: formData.iva_rate,
        client_notes: formData.client_notes || null,
        conditions: formData.conditions || null,
        proposal_id: formData.proposal_id || null,
        assigned_to: resolvedAssignedTo,
        template_id: formData.pdf_template_id || null,
      };

      if (quoteId) {
        const { error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq("id", quoteId);

        if (error) throw error;

        await supabase.from("quote_lines").delete().eq("quote_id", quoteId);
      } else {
        const { data, error } = await supabase
          .from("quotes")
          .insert({
            ...quoteData,
            created_by: businessUserId,
          })
          .select()
          .single();

        if (error) throw error;
        savedQuoteId = data.id;
      }

      if (lines.length > 0) {
        const linesToInsert = lines
          .filter((line) => line.qt > 0)
          .map((line) => {
            const custoUnit =
              line.custo_material_unit + line.custo_mao_obra_unit;
            const isManual = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
            const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
            const precoSemIvaBase = unitPrice * line.qt;
            const lineDiscount = line.discount_percent || 0;
            const precoSemIva = precoSemIvaBase * (1 - lineDiscount / 100);
            const ivaValor = precoSemIva * (line.iva_percent / 100);
            const totalComIva = precoSemIva + ivaValor;
            const totalComDesconto =
              totalComIva * (1 - formData.desconto_global_percent / 100);

            return {
              quote_id: savedQuoteId,
              catalog_item_id: line.catalog_item_id || null,
              product_id: line.product_id || null,
              service_id: line.service_id || null,
              bundle_id: line.bundle_id || null,
              selected_attributes: line.selected_attributes || {},
              categoria: line.categoria,
              descricao_snapshot: line.descricao_snapshot,
              qt: line.qt,
              custo_material_unit: line.custo_material_unit,
              custo_mao_obra_unit: line.custo_mao_obra_unit,
              margem_percent: line.margem_percent,
              iva_percent: line.iva_percent,
              int_percent: line.int_percent,
              discount_percent: lineDiscount,
              total_sem_iva: precoSemIva,
              total_com_iva: totalComIva,
              total_com_desconto: totalComDesconto,
              ordem: line.ordem,
              section_name: line.section_name || "Geral",
              unidade: line.unidade || null,
              item_description: line.item_description || null,
              cost_price: line.cost_price || 0,
            };
          });

        const { error: linesError } = await supabase
          .from("quote_lines")
          .insert(linesToInsert);

        if (linesError) throw linesError;
      }

      // Sempre limpar fees existentes em modo edição (mesmo quando o utilizador
      // remove todas as taxas — caso contrário ficariam órfãs em quote_fees).
      if (quoteId) {
        const { error: delFeesError } = await supabase
          .from("quote_fees")
          .delete()
          .eq("quote_id", savedQuoteId);
        if (delFeesError) throw delFeesError;
      }

      if (totals.fees && totals.fees.length > 0) {
        const feesToInsert = totals.fees.map(fee => ({
          quote_id: savedQuoteId,
          fee_type_id: fee.id,
          base_amount: fee.baseAmount,
          calculated_value: fee.calculatedValue,
          vat_rate: fee.vatRate,
          vat_amount: fee.vatAmount,
        }));

        const { error: feesError } = await supabase
          .from("quote_fees")
          .insert(feesToInsert);

        if (feesError) throw feesError;
      }


      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          subtotal: totals.totalSemIva,
          total_fees: totals.totalFeesWithVat,
          total: totals.grandTotal,
        })
        .eq("id", savedQuoteId);

      if (updateError) throw updateError;

      // Sync proposal value when this quote is linked to a proposal.
      // Must sum ALL quotes linked to the proposal, not just this one —
      // otherwise saving any single quote overwrites the proposal total.
      if (savedQuoteId && formData.proposal_id) {
        try {
          const { data: linkedQuotes, error: linkedQuotesError } = await supabase
            .from("quotes")
            .select("total")
            .eq("proposal_id", formData.proposal_id)
            .is("deleted_at", null);
          if (linkedQuotesError) throw linkedQuotesError;
          const proposalValue = (linkedQuotes || []).reduce((sum, q) => sum + (Number(q.total) || 0), 0);
          await (supabase.from("proposals") as any)
            .update({ value: proposalValue })
            .eq("id", formData.proposal_id);
        } catch (propErr) {
          console.error("Proposal value sync error:", propErr);
        }
      }

      if (savedQuoteId && formData.deal_id) {
        try {
          const { data: existingLink } = await (supabase.from("pipeline_links") as any)
            .select("id")
            .eq("deal_id", formData.deal_id)
            .eq("status", "active")
            .maybeSingle();
          if (existingLink) {
            await (supabase.from("pipeline_links") as any)
              .update({ quote_id: savedQuoteId, updated_at: new Date().toISOString() })
              .eq("id", existingLink.id);
          } else {
            await (supabase.from("pipeline_links") as any).insert({
              deal_id: formData.deal_id,
              quote_id: savedQuoteId,
              organization_id: dealOrgId || activeCompany?.id,
              root_organization_id: resolvedRootOrgId || activeCompany?.id,
              status: "active",
            });
          }
        } catch (linkErr) {
          console.error("Pipeline link creation error:", linkErr);
        }
      }

      // Save inline quotes (additional quotes created within the builder)
      for (const iq of inlineQuotes) {
        if (iq.lines.length === 0) continue;
        
        const iqData = {
          deal_id: formData.deal_id || null,
          organization_id: dealOrgId || activeCompany?.id || null,
          root_organization_id: resolvedRootOrgId || activeCompany?.id || null,
          title: iq.title || null,
          obra_notas: iq.obra_notas || null,
          modelo_base: iq.modelo_base && iq.modelo_base !== "0" ? iq.modelo_base : "default",
          desconto_global_percent: iq.desconto_global_percent,
          estado: "rascunho",
          validade_dias: iq.validade_dias,
          iva_rate: iq.iva_rate,
          client_notes: iq.client_notes || null,
          conditions: iq.conditions || null,
          created_by: businessUserId,
        };

        const { data: newIQ, error: iqError } = await (supabase.from("quotes") as any)
          .insert(iqData)
          .select("id")
          .single();

        if (iqError) throw iqError;

        if (iq.lines.filter(l => l.qt > 0).length > 0) {
          const iqLinesToInsert = iq.lines
            .filter(l => l.qt > 0)
            .map(l => {
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
                quote_id: newIQ.id,
                catalog_item_id: l.catalog_item_id || null,
                product_id: l.product_id || null,
                service_id: l.service_id || null,
                bundle_id: l.bundle_id || null,
                selected_attributes: l.selected_attributes || {},
                categoria: "",
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

          const { error: iqLinesError } = await supabase.from("quote_lines").insert(iqLinesToInsert);
          if (iqLinesError) throw iqLinesError;

          const iqTotalSemIva = iqLinesToInsert.reduce((s, l) => s + l.total_sem_iva, 0);
          const iqGrandTotal = iqLinesToInsert.reduce((s, l) => s + l.total_com_desconto, 0);
          await (supabase.from("quotes") as any)
            .update({ subtotal: iqTotalSemIva, total: iqGrandTotal })
            .eq("id", newIQ.id);
        }
      }

      // Clear inline quotes after saving
      setInlineQuotes([]);
      if (!quoteId && activeCompany?.id && typeof window !== "undefined") {
        localStorage.removeItem(getNewQuoteDraftKey(activeCompany.id));
      }

      toast({
        title: t('quoteBuilder.toast.quoteSaved'),
        description: t('quoteBuilder.toast.quoteSavedDesc'),
      });

      // Check if we have a post-save action
      const action = postSaveActionRef.current;
      postSaveActionRef.current = null;

      if (action && savedQuoteId) {
        const quoteForDialog = {
          id: savedQuoteId,
          quote_number: quoteNumber || autoReference,
          cliente_id: formData.cliente_id || selectedDeal?.client_id || null,
          deal_id: formData.deal_id || null,
          organization_id: formData.organization_id || activeCompany?.id || null,
        };
        setSavedQuoteData(quoteForDialog);

        if (action === "email") {
          setShowSendEmailDialog(true);
        } else if (action === "whatsapp") {
          buildWhatsAppContext(savedQuoteId, quoteForDialog);
        }
      } else {
        onClose();
      }
    } catch (error: any) {
      toast({
        title: t('quoteBuilder.toast.errorSavingQuote'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      saveLockRef.current = false;
      setLoading(false);
    }
  };

  const handleLineChange = (
    itemId: string,
    field: keyof QuoteLine,
    value: any
  ) => {
    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (l) => l.catalog_item_id === itemId || l.product_id === itemId || l.service_id === itemId || l.bundle_id === itemId
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          [field]: value,
        };
        return updated;
      } else {
        const item = catalogItems.find((i) => i.id === itemId);
        if (!item) return prev;

        return [
          ...prev,
          {
            catalog_item_id: itemId,
            categoria: item.categoria,
            descricao_snapshot: item.descricao,
            qt: field === "qt" ? value : 0,
            custo_material_unit: item.custo_material,
            custo_mao_obra_unit: item.custo_mao_obra,
            margem_percent: item.margem_default,
            iva_percent: item.iva_default,
            int_percent: item.int_default,
            discount_percent: 0,
            ordem: item.ordem,
            section_name: activeSection,
          },
        ];
      }
    });
  };

  const getLineValue = (itemId: string, field: keyof QuoteLine): any => {
    const line = lines.find((l) => l.product_id === itemId || l.service_id === itemId || l.bundle_id === itemId);
    return line ? line[field] : 0;
  };

  const handleRemoveItem = (itemId: string) => {
    setLines(lines.filter((line) => line.product_id !== itemId && line.service_id !== itemId && line.bundle_id !== itemId));
    toast({
      title: t('quoteBuilder.toast.itemRemoved'),
      description: t('quoteBuilder.toast.itemRemovedDesc'),
    });
  };

  const handleReplaceProduct = (lineIndex: number, newProduct: {
    id: string;
    name: string;
    sku: string | null;
    retail_price: number | null;
    vat_rate: number | null;
    uom_symbol: string | null;
    uom_name: string | null;
    type?: "product" | "service";
    description?: string | null;
  }, selectedAttributes?: Record<string, any>, attributePriceAddon?: number) => {
    const updatedLines = [...lines];
    const currentLine = updatedLines[lineIndex];
    
    const basePrice = newProduct.retail_price || 0;
    const addonPrice = attributePriceAddon || 0;
    const retailPrice = basePrice + addonPrice;
    const vatRate = newProduct.vat_rate || 23;
    const defaultMargin = currentLine.margem_percent || 30;
    const defaultInt = currentLine.int_percent || 0;
    
    // Calculate material cost to maintain margin structure
    const materialCost = retailPrice > 0 
      ? retailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100) - currentLine.custo_mao_obra_unit
      : 0;
    
    const isProduct = newProduct.type === "product" || (!newProduct.type && !!currentLine.product_id);
    
    updatedLines[lineIndex] = {
      ...currentLine,
      product_id: isProduct ? newProduct.id : null,
      service_id: !isProduct ? newProduct.id : null,
      catalog_item_id: null,
      bundle_id: null,
      descricao_snapshot: newProduct.name,
      sku: newProduct.sku,
      unidade: newProduct.uom_symbol || newProduct.uom_name || null,
      item_description: newProduct.description ?? currentLine.item_description ?? "",
      custo_material_unit: Math.max(0, materialCost),
      iva_percent: vatRate,
      selected_attributes: selectedAttributes || {},
      attribute_price_addon: addonPrice,
    };
    
    setLines(updatedLines);
    
    toast({
      title: t('quoteBuilder.toast.productChanged') || "Produto alterado",
      description: t('quoteBuilder.toast.productChangedDesc') || "O produto foi substituído com sucesso.",
    });
  };

  // Handler for replacing items from AddItemsDialog
  const handleReplaceItemFromDialog = (selectedItems: Array<{
    item: {
      id: string;
      name: string;
      description: string | null;
      sku: string | null;
      category_name: string | null;
      retail_price: number | null;
      vat_rate: number | null;
      organization_id: string | null;
      type: "product" | "service";
      uom_symbol?: string | null;
      uom_name?: string | null;
    };
    quantity: number;
    attributes: Record<string, string>;
    fullAttributes?: Record<string, { attribute_code: string; label: string; value_type: string; unit?: string; value: string; pricing_type?: string }>;
    attributePriceAddon?: number;
    bundleInfo?: {
      bundle_id: string;
      bundle_sku: string;
      bundle_name: string;
      bundle_description: string | null;
      components: Array<{
        id: string;
        name: string;
        sku: string | null;
        type: "product" | "service";
        source_id: string;
        quantity: number;
        unit_price: number;
        vat_rate: number;
      }>;
      total_price: number;
    };
  }>) => {
    if (replaceLineIndex === null || selectedItems.length === 0) return;
    
    const selected = selectedItems[0]; // Only use the first item for replacement
    const { item, fullAttributes, attributePriceAddon, bundleInfo } = selected;
    
    if (bundleInfo) {
      // Replace with a bundle
      const updatedLines = [...lines];
      const currentLine = updatedLines[replaceLineIndex];
      const defaultMargin = currentLine.margem_percent || 30;
      const defaultInt = currentLine.int_percent || 0;
      const retailPrice = bundleInfo.total_price || 0;
      const materialCost = retailPrice > 0
        ? retailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100) - (currentLine.custo_mao_obra_unit || 0)
        : 0;

      const bundleSelectedAttributes = {
        ...(fullAttributes || {}),
        bundle_components: bundleInfo.components,
      };

      updatedLines[replaceLineIndex] = {
        ...currentLine,
        product_id: null,
        service_id: null,
        catalog_item_id: null,
        bundle_id: bundleInfo.bundle_id,
        bundle_components: bundleInfo.components,
        descricao_snapshot: bundleInfo.bundle_name,
        sku: bundleInfo.bundle_sku,
        unidade: null,
        item_description: bundleInfo.bundle_description ?? currentLine.item_description ?? "",
        custo_material_unit: Math.max(0, materialCost),
        selected_attributes: bundleSelectedAttributes,
        categoria: "Bundles",
      };

      setLines(updatedLines);
      toast({
        title: "Bundle alterado",
        description: "O bundle foi substituído com sucesso.",
      });
    } else {
      handleReplaceProduct(replaceLineIndex, {
        id: item.id,
        name: item.name,
        sku: item.sku,
        retail_price: item.retail_price,
        vat_rate: item.vat_rate,
        uom_symbol: item.uom_symbol || null,
        uom_name: item.uom_name || null,
        type: item.type,
        description: item.description,
      }, fullAttributes, attributePriceAddon);
    }
    
    // Reset replace mode state
    setShowReplaceDialog(false);
    setReplaceLineIndex(null);
  };

  const handleAddCatalogItems = () => {
    const selectedProducts = products.filter(p => selectedCatalogItems.includes(p.id));
    const selectedServices = services.filter(s => selectedCatalogItems.includes(s.id));
    
    const allSelectedItems = [...selectedProducts, ...selectedServices];
    
    if (allSelectedItems.length === 0) {
      toast({
        title: t('quoteBuilder.toast.noItemsSelected'),
        description: t('quoteBuilder.toast.selectAtLeastOne'),
        variant: "destructive",
      });
      return;
    }
    
    // Validate that all selected items belong to the quote's organization
    const quoteOrgId = formData.organization_id || activeCompany?.id;
    const invalidItems = allSelectedItems.filter(item => 
      item.organization_id && item.organization_id !== quoteOrgId
    );
    
    if (invalidItems.length > 0) {
      const invalidNames = invalidItems.map(i => i.name).join(", ");
      const quoteOrgName = userCompanies.find(c => c.id === quoteOrgId)?.name || "selected organization";
      toast({
        title: t('quoteBuilder.toast.invalidItems'),
        description: t('quoteBuilder.toast.itemsWrongCompany', { company: quoteOrgName, items: invalidNames }),
        variant: "destructive",
      });
      return;
    }
    
    const defaultMargin = 30;
    const defaultInt = 0;
    
    const newLines: QuoteLine[] = [];
    
    for (let index = 0; index < allSelectedItems.length; index++) {
      const item = allSelectedItems[index];
      const itemId = item.id;
      const retailPrice = item.retail_price || 0;
      const vatRate = item.vat_rate || 23;
      const isProduct = selectedProducts.some(p => p.id === itemId);
      
      if (!retailPrice || retailPrice <= 0) {
        console.warn(`Skipping ${item.name} - no retail price`);
        toast({
          title: t('quoteBuilder.toast.missingPrice'),
          description: t('quoteBuilder.toast.noRetailPrice', { name: item.name }),
          variant: "destructive",
        });
        continue;
      }
      
      const materialCost = retailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100);
      
      // Get selected attributes and transform to full format
      const selectedAttrs = selectedItemAttributes[itemId] || {};
      const fullAttributes: Record<string, any> = {};
      
      if (Object.keys(selectedAttrs).length > 0) {
        const attrs = productAttributes.get(itemId);
        Object.entries(selectedAttrs).forEach(([attrId, valueId]) => {
          const attr = attrs?.find(a => a.id === attrId);
          const value = attr?.values.find(v => v.id === valueId as string);
          if (attr && value) {
            fullAttributes[attrId] = {
              attribute_code: attr.code,
              label: attr.name,
              value_type: attr.value_type,
              unit: attr.unit,
              value: value.value
            };
          }
        });
      }
      
      // Build description with attributes
      let description = item.name;
      if (Object.keys(fullAttributes).length > 0) {
        const attrStrings = Object.entries(fullAttributes).map(([attrId, attrData]) => {
          const displayValue = attrData.unit ? `${attrData.value} ${attrData.unit}` : attrData.value;
          return `${attrData.label}: ${displayValue}`;
        }).filter(Boolean);
        
        if (attrStrings.length > 0) {
          description = `${item.name} (${attrStrings.join(', ')})`;
        }
      }
      
      newLines.push({
        catalog_item_id: null,
        product_id: isProduct ? itemId : null,
        service_id: isProduct ? null : itemId,
        selected_attributes: fullAttributes,
        categoria: item.category_name || "General",
        descricao_snapshot: description,
        item_description: item.description || "",
        sku: item.sku || null,
        unidade: item.uom_symbol || item.uom_name || null,
        qt: 1,
        custo_material_unit: materialCost,
        custo_mao_obra_unit: 0,
        margem_percent: defaultMargin,
        iva_percent: vatRate,
        int_percent: defaultInt,
        discount_percent: 0,
        ordem: lines.length + index + 1,
        section_name: activeSection,
      });
    }

    if (newLines.length === 0) {
      toast({
        title: t('quoteBuilder.toast.noItemsAdded'),
        description: t('quoteBuilder.toast.invalidPrices'),
        variant: "destructive",
      });
      return;
    }

    setLines([...lines, ...newLines]);
    setSelectedCatalogItems([]);
    setSelectedItemAttributes({});
    setCatalogSearchTerm("");
    setShowCatalogDialog(false);
    
    toast({
      title: t('quoteBuilder.toast.itemsAdded'),
      description: t('quoteBuilder.toast.itemsAddedCount', { count: newLines.length }),
    });
  };

  // Handler for new AddItemsDialog
  const handleAddItemsFromDialog = (selectedItems: Array<{
    item: {
      id: string;
      name: string;
      description: string | null;
      sku: string | null;
      category_name: string | null;
      retail_price: number | null;
      vat_rate: number | null;
      organization_id: string | null;
      type: "product" | "service";
      uom_symbol?: string | null;
      uom_name?: string | null;
    };
    quantity: number;
    attributes: Record<string, string>;
    fullAttributes?: Record<string, { attribute_code: string; label: string; value_type: string; unit?: string; value: string; pricing_type?: string }>;
    attributePriceAddon?: number;
    bundleInfo?: {
      bundle_id: string;
      bundle_sku: string;
      bundle_name: string;
      bundle_description: string | null;
      components: Array<{
        id: string;
        name: string;
        sku: string | null;
        type: "product" | "service";
        source_id: string;
        quantity: number;
        unit_price: number;
        vat_rate: number;
      }>;
      total_price: number;
    };
  }>) => {
    const quoteOrgId = formData.organization_id || activeCompany?.id;
    const defaultMargin = 30;
    const defaultInt = 0;
    
    const newLines: QuoteLine[] = [];
    
    selectedItems.forEach((selected, index) => {
      const { item, quantity, attributes, fullAttributes, attributePriceAddon, bundleInfo } = selected;
      const basePrice = item.retail_price ?? 0;
      const vatRate = item.vat_rate || 23;
      
      // Calculate final retail price: base price + attribute price addon
      const retailPrice = basePrice + (attributePriceAddon || 0);
      
      // Allow items with price 0 (e.g., promotional items, included services)
      if (retailPrice < 0) {
        toast({
          title: t('quoteBuilder.toast.missingPrice'),
          description: t('quoteBuilder.toast.noRetailPrice', { name: item.name }),
          variant: "destructive",
        });
        return;
      }
      
      const materialCost = retailPrice > 0 
        ? retailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100)
        : 0;
      
      // Use fullAttributes if available (enriched data from AddItemsDialog)
      // This includes attribute_code, label, value_type, unit, and value
      const lineAttributes = fullAttributes || {};
      
      // Check if this is a bundle
      if (bundleInfo) {
        const bundleSelectedAttributes = {
          ...lineAttributes,
          bundle_components: bundleInfo.components,
        };

        newLines.push({
          catalog_item_id: null,
          product_id: null,
          service_id: null,
          bundle_id: bundleInfo.bundle_id,
          bundle_components: bundleInfo.components,
          selected_attributes: bundleSelectedAttributes,
          categoria: "Bundles",
          descricao_snapshot: bundleInfo.bundle_name,
          sku: bundleInfo.bundle_sku,
          unidade: null,
          qt: quantity,
          custo_material_unit: materialCost,
          custo_mao_obra_unit: 0,
          margem_percent: defaultMargin,
          iva_percent: vatRate,
          int_percent: defaultInt,
          discount_percent: 0,
          ordem: 0, // Will be recalculated
          section_name: activeSection,
        });
      } else {
        newLines.push({
          catalog_item_id: null,
          product_id: item.type === "product" ? item.id : null,
          service_id: item.type === "service" ? item.id : null,
          selected_attributes: lineAttributes,
          categoria: item.category_name || "General",
          descricao_snapshot: item.name,
          item_description: item.description || "",
          sku: item.sku || null,
          unidade: item.uom_symbol || item.uom_name || null,
          qt: quantity,
          custo_material_unit: materialCost,
          custo_mao_obra_unit: 0,
          margem_percent: defaultMargin,
          iva_percent: vatRate,
          int_percent: defaultInt,
          discount_percent: 0,
          ordem: 0, // Will be recalculated
          section_name: activeSection,
        });
      }
    });

    if (newLines.length > 0) {
      let updatedLines: QuoteLine[];
      
      if (insertAtIndex !== null && insertAtIndex >= 0 && insertAtIndex <= lines.length) {
        // Insert at specific position
        updatedLines = [
          ...lines.slice(0, insertAtIndex),
          ...newLines,
          ...lines.slice(insertAtIndex)
        ];
      } else {
        // Append to end (default behavior)
        updatedLines = [...lines, ...newLines];
      }
      
      // Recalculate ordem for all lines
      updatedLines = updatedLines.map((line, idx) => ({
        ...line,
        ordem: idx + 1
      }));
      
      setLines(updatedLines);
      setInsertAtIndex(null); // Reset insert position
      
      toast({
        title: t('quoteBuilder.toast.itemsAdded'),
        description: t('quoteBuilder.toast.itemsAddedCount', { count: newLines.length }),
      });
    }
  };

  // Load deal items (deal_needs + deal_need_items) and auto-populate quote lines
  const loadDealItems = async (dealId: string) => {
    try {
      // Fetch deal_needs for this deal
      const { data: dealNeeds } = await (supabase as any)
        .from("deal_needs")
        .select("id, title, initial_estimate")
        .eq("deal_id", dealId);

      const defaultMargin = 30;
      const defaultInt = 0;
      const newLines: QuoteLine[] = [];

      if (dealNeeds && dealNeeds.length > 0) {
        const needIds = dealNeeds.map((n: any) => n.id);

        // Fetch deal_need_items
        const { data: needItems } = await (supabase as any)
          .from("deal_need_items")
          .select("*")
          .in("deal_need_id", needIds)
          .order("sort_order");

        if (needItems && needItems.length > 0) {
          for (const item of needItems) {
            let name = item.notes || "Item";
            let retailPrice = 0;
            let vatRate = 23;
            let sku: string | null = null;
            let category = "Geral";
            let uom: string | null = null;
            const manualUnitPrice = item.unit_price ? parseFloat(item.unit_price) : null;

            if (item.item_type === "product" && item.product_id) {
              const prod = products.find(p => p.id === item.product_id);
              if (prod) {
                name = prod.name;
                sku = prod.sku || null;
                category = prod.category_name || "Produtos";
                retailPrice = manualUnitPrice ?? (prod.retail_price || 0);
                vatRate = prod.vat_rate || 23;
                uom = prod.uom_symbol || prod.uom_name || null;
              }
            } else if (item.item_type === "service" && item.service_id) {
              const svc = services.find(s => s.id === item.service_id);
              if (svc) {
                name = svc.name;
                sku = svc.sku || null;
                category = svc.category_name || "Serviços";
                retailPrice = manualUnitPrice ?? (svc.retail_price || 0);
                vatRate = svc.vat_rate || 23;
                uom = svc.uom_symbol || svc.uom_name || null;
              }
            } else if (manualUnitPrice && manualUnitPrice > 0) {
              // Manual item without catalog reference
              retailPrice = manualUnitPrice;
            }

            // If unit_price is set and no catalog match resolved, use it directly
            if (retailPrice === 0 && manualUnitPrice && manualUnitPrice > 0) {
              retailPrice = manualUnitPrice;
            }

            const materialCost = retailPrice > 0
              ? retailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100)
              : 0;

            newLines.push({
              catalog_item_id: null,
              product_id: item.item_type === "product" ? item.product_id : null,
              service_id: item.item_type === "service" ? item.service_id : null,
              selected_attributes: {},
              categoria: category,
              descricao_snapshot: name,
              sku,
              unidade: uom,
              qt: item.quantity || 1,
              custo_material_unit: materialCost,
              custo_mao_obra_unit: 0,
              margem_percent: defaultMargin,
              iva_percent: vatRate,
              int_percent: defaultInt,
              discount_percent: 0,
              ordem: 0,
              section_name: "Geral",
            });
          }
        }
      }

      // Fallback: if no items were created from deal_need_items, check deal value
      if (newLines.length === 0) {
        const { data: dealData } = await (supabase as any)
          .from("deals")
          .select("value, title")
          .eq("id", dealId)
          .single();

        if (dealData?.value && parseFloat(dealData.value) > 0) {
          const dealValue = parseFloat(dealData.value);
          const materialCost = dealValue / (1 + defaultMargin / 100) / (1 + defaultInt / 100);

          newLines.push({
            catalog_item_id: null,
            product_id: null,
            service_id: null,
            selected_attributes: {},
            categoria: "Geral",
            descricao_snapshot: dealData.title || "Pedido de Proposta",
            sku: null,
            unidade: null,
            qt: 1,
            custo_material_unit: materialCost,
            custo_mao_obra_unit: 0,
            margem_percent: defaultMargin,
            iva_percent: 23,
            int_percent: defaultInt,
            discount_percent: 0,
            ordem: 0,
            section_name: "Geral",
          });
        }
      }

      if (newLines.length > 0) {
        const updatedLines = [...lines, ...newLines].map((line, idx) => ({
          ...line,
          ordem: idx + 1,
        }));
        setLines(updatedLines);
        toast({
          title: "Itens do pedido carregados",
          description: `${newLines.length} item(ns) adicionado(s) automaticamente ao orçamento.`,
        });
      }
    } catch (err) {
      console.error("Error loading deal items:", err);
    }
  };

  // Removed handleSaveAttributes - now using LineAttributesDialog


  const calculateTotals = () => {
    let totalSemIva = 0;
    let totalIva = 0;

    // Global discount applies to the subtotal (sem IVA) BEFORE computing VAT,
    // so VAT is calculated on the discounted base and matches the PDF totals.
    const globalDiscountFactor = 1 - (formData.desconto_global_percent || 0) / 100;

    // Group VAT by rate for breakdown display (uses discounted base)
    const vatByRate: Record<number, { base: number; vat: number }> = {};

    // Per-line subtotal (sem IVA, pre-global-discount) — used for LINE_PERCENTAGE fees
    const linesBase: { line: any; precoSemIva: number }[] = [];

    lines
      .filter((line) => line.qt > 0)
      .forEach((line) => {
        const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
        const isManual = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
        const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
        const precoSemIvaBase = unitPrice * line.qt;
        const lineDiscount = line.discount_percent || 0;
        const precoSemIva = precoSemIvaBase * (1 - lineDiscount / 100);

        // Bundle lines may have components with mixed VAT rates — split the
        // line base across components by their share of the gross components
        // total and apply each component's own VAT rate. Mirrors PDF logic
        // in QuotePDFDocument so the configurator matches the printed totals.
        const bundleComponents: any[] = Array.isArray((line as any).bundle_components)
          ? (line as any).bundle_components
          : (Array.isArray((line as any).selected_attributes?.bundle_components)
            ? (line as any).selected_attributes.bundle_components
            : (Array.isArray((line as any).selected_attributes?.bundle_components_data)
              ? (line as any).selected_attributes.bundle_components_data
              : []));
        const componentsTotal = bundleComponents.reduce(
          (s: number, c: any) => s + (parseFloat(String(c.unit_price || 0)) * parseFloat(String(c.quantity || 0))),
          0,
        );
        const ivaOverride = (line as any).selected_attributes?.iva_override;
        const hasOverride = typeof ivaOverride === "number" && !Number.isNaN(ivaOverride);
        const hasMixedVat = bundleComponents.length > 0 && componentsTotal > 0 && !hasOverride;

        // VAT base is the line subtotal AFTER global discount.
        const precoSemIvaDescontado = precoSemIva * globalDiscountFactor;

        let ivaValor = 0;
        if (hasMixedVat) {
          bundleComponents.forEach((c: any) => {
            const cUnit = parseFloat(String(c.unit_price || 0));
            const cQty = parseFloat(String(c.quantity || 0));
            const cRate = parseFloat(String(c.vat_rate ?? 23));
            const share = (cUnit * cQty) / componentsTotal;
            const base = precoSemIvaDescontado * share;
            const vat = base * (cRate / 100);
            ivaValor += vat;
            if (!vatByRate[cRate]) vatByRate[cRate] = { base: 0, vat: 0 };
            vatByRate[cRate].base += base;
            vatByRate[cRate].vat += vat;
          });
        } else {
          const rate = hasOverride ? ivaOverride : line.iva_percent;
          ivaValor = precoSemIvaDescontado * (rate / 100);
          if (!vatByRate[rate]) vatByRate[rate] = { base: 0, vat: 0 };
          vatByRate[rate].base += precoSemIvaDescontado;
          vatByRate[rate].vat += ivaValor;
        }

        totalSemIva += precoSemIva;
        totalIva += ivaValor;
        linesBase.push({ line, precoSemIva });
      });

    const totalSemIvaComDesconto = totalSemIva * globalDiscountFactor;
    const totalComIva = totalSemIvaComDesconto + totalIva; // grand sub+VAT (post-discount)
    const totalComDesconto = totalSemIvaComDesconto + totalIva;

    // Cálculo de taxas via helper canónico (supabase/functions/_shared/calculateQuoteFees).
    // Fonte ÚNICA partilhada com a Olyvia (Edge Functions). Não duplicar lógica aqui.
    const feeLines: LineForFees[] = linesBase.map(({ line, precoSemIva }) => ({
      precoSemIva,
      isService: !!(line as any).service_id && !(line as any).product_id && !(line as any).bundle_id,
      riskFeePercent: (line as any).selected_attributes?.risk_fee_percent,
    }));
    const selectedFeeTypes = serviceFees.filter((fee) => selectedFees.has(fee.id));
    const feesResult = calculateQuoteFees({
      lines: feeLines,
      selectedFeeTypes,
      feeVatOverrides,
    });
    const calculatedFees = feesResult.perFee.map((f) => ({
      id: f.feeId,
      name: f.name ?? "",
      baseAmount: f.baseAmount,
      calculatedValue: f.calculatedValue,
      vatRate: f.vatRate,
      vatAmount: f.vatAmount,
      totalWithVat: f.totalWithVat,
    }));
    const totalFeesWithoutVat = feesResult.totalFeesWithoutVat;
    const totalFeesVat = feesResult.totalFeesVat;
    const totalFeesWithVat = feesResult.totalFeesWithVat;
    const grandTotal = totalComDesconto + totalFeesWithVat;
    
    // Convert vatByRate to sorted array for display
    const vatBreakdown = Object.entries(vatByRate)
      .map(([rate, data]) => ({ rate: Number(rate), base: data.base, vat: data.vat }))
      .sort((a, b) => b.rate - a.rate); // Sort by rate descending (23% first)

    return {
      totalSemIva,
      totalIva,
      totalComIva,
      totalComDesconto,
      fees: calculatedFees,
      totalFeesWithoutVat,
      totalFeesVat,
      totalFeesWithVat,
      grandTotal,
      vatBreakdown,
    };
  };

  const totals = calculateTotals();
  // Single LINE_PERCENTAGE fee currently selected (max 1 by design)
  const linePctFee = serviceFees.find(f => selectedFees.has(f.id) && f.application_mode === "LINE_PERCENTAGE") || null;
  
  // Group items by category
  const categorias = [...new Set(catalogItems.map((item) => item.categoria))].sort();
  
  // Calculate totals per category
  const categoryTotals = categorias.reduce((acc, categoria) => {
    const categoryLines = lines.filter(
      (line) => line.categoria === categoria && line.qt > 0
    );
    
    const total = categoryLines.reduce((sum, line) => {
      const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
      const precoSemIva =
        custoUnit *
        (1 + line.margem_percent / 100) *
        (1 + line.int_percent / 100) *
        line.qt;
      const ivaValor = precoSemIva * (line.iva_percent / 100);
      return sum + precoSemIva + ivaValor;
    }, 0);
    
    acc[categoria] = total;
    return acc;
  }, {} as Record<string, number>);

  const renderCategorySection = (categoria: string) => {
    const categoryItems = catalogItems.filter(
      (item) => item.categoria === categoria
    );

    if (categoryItems.length === 0) return null;

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">{t('quoteBuilder.description')}</TableHead>
              <TableHead className="w-[80px]">{t('quoteBuilder.quantity')}</TableHead>
              {canEditCosts && (
                <>
                  <TableHead className="w-[100px]">{t('quoteBuilder.table.matCost')}</TableHead>
                  <TableHead className="w-[100px]">{t('quoteBuilder.table.laborCost')}</TableHead>
                </>
              )}
              {canEditMargins && (
                <>
                  <TableHead className="w-[80px]">{t('quoteBuilder.table.margin')}</TableHead>
                  <TableHead className="w-[80px]">{t('quoteBuilder.table.vat')}</TableHead>
                  <TableHead className="w-[80px]">{t('quoteBuilder.table.int')}</TableHead>
                </>
              )}
              <TableHead className="text-right">{t('quoteBuilder.total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryItems.map((item) => {
              const qt = getLineValue(item.id, "qt") || 0;
              const margem = getLineValue(item.id, "margem_percent") || item.margem_default;
              const int = getLineValue(item.id, "int_percent") || item.int_default;
              const iva = getLineValue(item.id, "iva_percent") || item.iva_default;

              const custoUnit = item.custo_material + item.custo_mao_obra;
              const precoSemIva = qt > 0
                ? custoUnit * (1 + margem / 100) * (1 + int / 100) * qt
                : 0;
              const ivaValor = precoSemIva * (iva / 100);
              const total = precoSemIva + ivaValor;

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.descricao}
                    {item.tipo && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({item.tipo})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={qt}
                      onChange={(e) =>
                        handleLineChange(item.id, "qt", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </TableCell>
                  {canEditCosts && (
                    <>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(item.custo_material)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(item.custo_mao_obra)}
                        </span>
                      </TableCell>
                    </>
                  )}
                  {canEditMargins && (
                    <>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={margem}
                          onChange={(e) =>
                            handleLineChange(item.id, "margem_percent", Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={iva}
                          onChange={(e) =>
                            handleLineChange(item.id, "iva_percent", Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={int}
                          onChange={(e) =>
                            handleLineChange(item.id, "int_percent", Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
                    <span className="font-medium">
                      {formatCurrency(total)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  // Guard: require active company for non-system-admins
  if (!activeCompany?.id && !isSystemAdmin) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">
            {quoteId ? t('quoteBuilder.editQuote') : t('quoteBuilder.newQuote')}
          </h1>
        </div>
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              {t('quoteBuilder.selectCompanyRequired')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 max-w-[1600px]">
      {/* Enhanced Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {quoteId ? t('quoteBuilder.editQuote') : t('quoteBuilder.newQuote')}
          </h1>
          {(() => {
            const labels: Record<string,string> = { rascunho: "📝 Rascunho", enviado: "📤 Enviado", aceite: "✅ Aceite", rejeitado: "❌ Rejeitado" };
            const variants: Record<string,"secondary"|"default"|"destructive"> = { rascunho: "secondary", enviado: "default", aceite: "default", rejeitado: "destructive" };
            return (
              <Badge variant={variants[formData.estado] || "secondary"} className="text-xs">
                {labels[formData.estado] || "📝 Rascunho"}
              </Badge>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">


          <Button variant="outline" size="sm">
            <FileDown className="w-4 h-4 mr-1" /> Importar Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPdfPreview(true)}>
            <Eye className="w-4 h-4 mr-1" /> Pré-visualizar PDF
          </Button>
          <Button variant="outline" size="sm">
            <Copy className="w-4 h-4 mr-1" /> Duplicar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? t('quoteBuilder.saving') : "Guardar Orçamento"}
          </Button>
        </div>
      </div>

      {/* Pipeline Bar */}
      <div className="mb-5">
        <QuotePipelineBar hasDeal={!!formData.deal_id} />
      </div>

      {/* 2-Column Layout */}
      <div className="flex gap-6">
        {/* Left Column */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Quote Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">📋 Detalhes do Orçamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Deal / Contact / Client Search */}
              <div className="space-y-2">
                <Label>Pedido / Contacto / Cliente</Label>
                {selectedDeal ? (
                  <QuoteDealCard
                    deal={{
                      id: selectedDeal.id,
                      title: selectedDeal.title,
                      entity_id: selectedDeal.entity_id,
                      organization_id: selectedDeal.organization_id,
                    }}
                    onUnlink={() => {
                      setSelectedDeal(null);
                      setFormData({ ...formData, deal_id: "", organization_id: "", cliente_id: "", assigned_to: "", title: "" });
                      setAssignedToTouched(false);
                      setSelectedFees(new Set());
                      setLines([]);
                      setInlineQuotes([]);
                    }}
                  />
                ) : selectedSource ? (
                  <div className="space-y-3">
                    <div className="border rounded-lg p-4 bg-muted/20 flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-primary truncate">{selectedSource.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedSource.kind === "client" ? "Cliente" : "Contacto"} ligado ao orçamento</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="default" className="bg-green-600 text-xs">✅ Ligado</Badge>
                        <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs"
                          onClick={() => {
                            setSelectedSource(null);
                            setFormData({ ...formData, cliente_id: "", organization_id: "", assigned_to: "", title: "" });
                            setAssignedToTouched(false);
                            setSelectedFees(new Set());
                            setLines([]);
                            setInlineQuotes([]);
                          }}>
                          <X className="h-3 w-3 mr-1" /> Desligar
                        </Button>
                      </div>
                    </div>
                    <QuoteEntityPreview entityId={selectedSource.entity_id} />
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Digite @ para pesquisar pedidos, contactos ou clientes..."
                      value={dealSearch}
                      onChange={async (e) => {
                        const value = e.target.value;
                        setDealSearch(value);

                        if (!value.startsWith('@')) {
                          setDealSearchResults([]); setShowDealDropdown(false); return;
                        }
                        const searchTerm = value.slice(1).toLowerCase().trim();
                        // Require at least 2 chars to avoid heavy/timing-out queries on single letters
                        if (searchTerm.length < 2) {
                          setDealSearchResults([]); setShowDealDropdown(false); return;
                        }
                        const orgIds = descendantOrgIds.length > 0 ? descendantOrgIds : (activeCompany?.id ? [activeCompany.id] : []);
                        if (orgIds.length === 0) { setDealSearchResults([]); setShowDealDropdown(false); return; }

                        // Match entity ids by display_name
                        let matchingEntityIds: string[] = [];
                        if (searchTerm.length > 0) {
                          const { ids } = await searchEntityIds(searchTerm);
                          matchingEntityIds = ids;
                        }


                        const scope = getPermissionScope("deals.view");
                        const isFullScope = isSystemAdmin || scope === "ORG";
                        let ownershipFilter: string | null = null;
                        if (!isFullScope) {
                          if (scope === "NONE" || !scopeAnewUserId) {
                            setDealSearchResults([]); setShowDealDropdown(false); return;
                          }
                          const allowedIds = new Set<string>([scopeAnewUserId]);
                          if (scope === "TEAM") teamMemberIds.forEach(id => allowedIds.add(id));
                          const allowedList = Array.from(allowedIds);
                          ownershipFilter = `assigned_to.in.(${allowedList.join(',')}),created_by.in.(${allowedList.join(',')})`;
                        }

                        // --- Search deals ---
                        let dealsData: any[] = [];
                        let qTitle = (supabase as any)
                          .from("deals")
                          .select("id, title, client_id, lead_id, contact_id, organization_id, entity_id, assigned_to, created_by")
                          .in("organization_id", orgIds)
                          .ilike("title", `%${searchTerm}%`)
                          .is("deleted_at", null)
                          .limit(25);
                        if (ownershipFilter) qTitle = qTitle.or(ownershipFilter);
                        const { data: byTitle } = await qTitle;
                        dealsData = byTitle || [];
                        if (matchingEntityIds.length > 0) {
                          let qEntity = (supabase as any)
                            .from("deals")
                            .select("id, title, client_id, lead_id, contact_id, organization_id, entity_id, assigned_to, created_by")
                            .in("organization_id", orgIds)
                            .in("entity_id", matchingEntityIds)
                            .is("deleted_at", null)
                            .limit(25);
                          if (ownershipFilter) qEntity = qEntity.or(ownershipFilter);
                          const { data: byEntity } = await qEntity;
                          const seenIds = new Set(dealsData.map((d: any) => d.id));
                          (byEntity || []).forEach((d: any) => { if (!seenIds.has(d.id)) dealsData.push(d); });
                        }

                        // --- Search contacts ---
                        let contactsData: any[] = [];
                        if (matchingEntityIds.length > 0) {
                          const { data } = await (supabase as any)
                            .from("anew_contacts")
                            .select("id, entity_id, organization_id, assigned_to")
                            .in("organization_id", orgIds)
                            .in("entity_id", matchingEntityIds)
                            .is("deleted_at", null)
                            .limit(25);
                          contactsData = data || [];
                        }

                        // --- Search clients ---
                        let clientsData: any[] = [];
                        if (matchingEntityIds.length > 0) {
                          const { data } = await (supabase as any)
                            .from("anew_clients")
                            .select("id, entity_id, organization_id, assigned_to")
                            .in("organization_id", orgIds)
                            .in("entity_id", matchingEntityIds)
                            .is("deleted_at", null)
                            .limit(25);
                          clientsData = data || [];
                        }

                        // Build entity name map
                        const allEntityIds = new Set<string>();
                        dealsData.forEach((d: any) => d.entity_id && allEntityIds.add(d.entity_id));
                        contactsData.forEach((c: any) => c.entity_id && allEntityIds.add(c.entity_id));
                        clientsData.forEach((c: any) => c.entity_id && allEntityIds.add(c.entity_id));
                        let entityMap: Record<string, any> = {};
                        if (allEntityIds.size > 0) {
                          const { data: entities } = await (supabase as any)
                            .from("anew_entities").select("id, display_name")
                            .in("id", Array.from(allEntityIds));
                          (entities || []).forEach((e: any) => { entityMap[e.id] = e; });
                        }

                        const results: SearchResult[] = [
                          ...dealsData.map((d: any) => ({
                            kind: "deal" as const,
                            id: d.id, title: d.title,
                            client_id: d.client_id, lead_id: d.lead_id, contact_id: d.contact_id,
                            organization_id: d.organization_id, entity_id: d.entity_id,
                            assigned_to: d.assigned_to,
                            entity_name: d.entity_id ? entityMap[d.entity_id]?.display_name || null : null,
                          })),
                          ...contactsData.map((c: any) => ({
                            kind: "contact" as const,
                            id: c.id,
                            name: entityMap[c.entity_id]?.display_name || "Contacto",
                            entity_id: c.entity_id,
                            organization_id: c.organization_id,
                            assigned_to: c.assigned_to,
                          })),
                          ...clientsData.map((c: any) => ({
                            kind: "client" as const,
                            id: c.id,
                            name: entityMap[c.entity_id]?.display_name || "Cliente",
                            entity_id: c.entity_id,
                            organization_id: c.organization_id,
                            assigned_to: c.assigned_to,
                          })),
                        ];

                        setDealSearchResults(results);
                        setShowDealDropdown(results.length > 0);
                      }}
                      onFocus={() => { if (dealSearchResults.length > 0) setShowDealDropdown(true); }}
                      onBlur={() => { setTimeout(() => setShowDealDropdown(false), 200); }}
                      className={fieldErrors.deal_id ? "border-destructive" : ""}
                    />
                    {showDealDropdown && dealSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[260px] overflow-y-auto">
                        {dealSearchResults.map((r) => (
                          <button key={`${r.kind}-${r.id}`} type="button" className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2"
                            onClick={async () => {
                              if (r.kind === "deal") {
                                setSelectedDeal({
                                  id: r.id, title: r.title, client_id: r.client_id, lead_id: r.lead_id,
                                  organization_id: r.organization_id, entity_id: r.entity_id,
                                  lead_name: r.entity_name || null, lead_phone: null,
                                } as Deal);
                                setSelectedSource(null);
                                let inherited: string | null = null;
                                if (r.lead_id) {
                                  const { data: l } = await (supabase as any).from("anew_leads").select("assigned_to").eq("id", r.lead_id).maybeSingle();
                                  inherited = l?.assigned_to || null;
                                }
                                if (!inherited && r.contact_id) {
                                  const { data: c } = await (supabase as any).from("anew_contacts").select("assigned_to").eq("id", r.contact_id).maybeSingle();
                                  inherited = c?.assigned_to || null;
                                }
                                if (!inherited && r.client_id) {
                                  const { data: cl } = await (supabase as any).from("anew_clients").select("assigned_to").eq("id", r.client_id).maybeSingle();
                                  inherited = cl?.assigned_to || null;
                                }
                                if (!inherited) inherited = r.assigned_to || null;
                                setFormData(prev => ({ ...prev, deal_id: r.id, organization_id: r.organization_id || "", cliente_id: r.client_id || "", title: prev.title || r.title || "", assigned_to: assignedToTouched ? prev.assigned_to : (inherited ?? prev.assigned_to) }));
                                if (lines.length === 0) loadDealItems(r.id);
                              } else {
                                setSelectedSource({ kind: r.kind, id: r.id, name: r.name, entity_id: r.entity_id, organization_id: r.organization_id });
                                setSelectedDeal(null);
                                // Resolve via canonical chain (entity → client → contact → lead)
                                const inheritedEntity = await resolveQuoteAssignedTo({
                                  supabase: supabase as any,
                                  clienteId: r.kind === "client" ? r.id : null,
                                  entityId: r.entity_id,
                                  organizationId: r.organization_id,
                                  fallbackUserId: r.assigned_to || null,
                                });
                                setFormData(prev => ({
                                  ...prev,
                                  deal_id: "",
                                  organization_id: r.organization_id || prev.organization_id,
                                  cliente_id: r.kind === "client" ? r.id : prev.cliente_id,
                                  title: prev.title || r.name,
                                  assigned_to: assignedToTouched ? prev.assigned_to : (inheritedEntity ?? prev.assigned_to),
                                }));
                              }
                              setDealSearch(""); setShowDealDropdown(false); setDealSearchResults([]);
                            }}>
                            <Badge variant="secondary" className="text-xs">
                              {r.kind === "deal" ? "Pedido" : r.kind === "client" ? "Cliente" : "Contacto"}
                            </Badge>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm truncate">{r.kind === "deal" ? r.title : r.name}</span>
                              {r.kind === "deal" && r.entity_name && (
                                <span className="text-xs text-muted-foreground truncate">{r.entity_name}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Digite @ para pesquisar pedidos de proposta, contactos ou clientes</p>
                    {fieldErrors.deal_id && <p className="text-sm text-destructive">{fieldErrors.deal_id}</p>}
                  </div>
                )}
              </div>

              {/* Title + Reference */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Título do Orçamento *</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Remodelação Cozinha — Cliente"
                  />
                  <p className="text-xs text-muted-foreground">Preenchido do pedido</p>
                </div>
                <div className="space-y-2">
                  <Label>Referência</Label>
                  <Input
                    value={quoteNumber || autoReference}
                    readOnly
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">Gerada automaticamente</p>
                </div>
              </div>

              {/* Modelo Base + Validade */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('quoteBuilder.baseTemplate')}</Label>
                  <Select value={formData.modelo_base} onValueChange={handleModeloBaseChange}>
                    <SelectTrigger><SelectValue placeholder={t('quoteBuilder.selectTemplate')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('quoteBuilder.none')}</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.codigo} value={template.codigo}>{template.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Validade (dias)</Label>
                  <Input type="number" min="1" max="365" step="1" value={formData.validade_dias}
                    onChange={(e) => setFormData({ ...formData, validade_dias: Number(e.target.value) })} />
                </div>
              </div>

              {/* Layout do PDF */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Layout do PDF</Label>
                  <Select
                    value={formData.pdf_template_id || "__default__"}
                    onValueChange={(v) => setFormData({ ...formData, pdf_template_id: v === "__default__" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Layout padrão" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Layout padrão</SelectItem>
                      {pdfTemplates.map((tpl: any) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}{tpl.template_type === "quote" ? " · Orçamento" : tpl.template_type === "proposal" ? " · Proposta" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Aplicado no preview e no PDF gerado</p>
                </div>
              </div>

              {/* Desconto + Comercial */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Desconto Global (%)</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={formData.desconto_global_percent}
                    onChange={(e) => setFormData({ ...formData, desconto_global_percent: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Comercial</Label>
                  <Select
                    value={formData.assigned_to || "__none__"}
                    onValueChange={(v) => { setAssignedToTouched(true); setFormData({ ...formData, assigned_to: v === "__none__" ? "" : v }); }}
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
              </div>

              {/* Estado do Orçamento */}
              <div className="space-y-2 max-w-xs">
                <Label>Estado</Label>
                <Select value={formData.estado} onValueChange={(v) => setFormData({ ...formData, estado: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="aceite">Aceite</SelectItem>
                    <SelectItem value="rejeitado">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Internal Notes */}
              <div className="space-y-2">
                <Label>Notas Internas</Label>
                <Textarea
                  value={formData.obra_notas}
                  onChange={(e) => setFormData({ ...formData, obra_notas: e.target.value })}
                  placeholder="Notas internas (só visíveis no CRM, não aparecem no PDF)"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Service Fees Selection */}
          {serviceFees.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('quoteBuilder.serviceFees')}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-3">{t('quoteBuilder.selectFeesPrompt')}</p>
                  {serviceFees.map((fee) => (
                    <div key={fee.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                      <input type="checkbox" id={`fee-${fee.id}`} checked={selectedFees.has(fee.id)}
                        onChange={(e) => {
                          const s = new Set(selectedFees);
                          if (e.target.checked) {
                            // Enforce only one LINE_PERCENTAGE fee selected
                            if (fee.application_mode === "LINE_PERCENTAGE") {
                              serviceFees.forEach(f => {
                                if (f.application_mode === "LINE_PERCENTAGE" && f.id !== fee.id) {
                                  s.delete(f.id);
                                }
                              });
                            }
                            s.add(fee.id);
                          } else {
                            s.delete(fee.id);
                          }
                          setSelectedFees(s);
                        }}
                        className="mt-1 h-4 w-4 rounded border-gray-300" />
                      <label htmlFor={`fee-${fee.id}`} className="flex-1 cursor-pointer">
                        <div className="font-medium flex items-center gap-2">
                          {fee.name}
                          {fee.application_mode === "LINE_PERCENTAGE" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">Por linha</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {fee.application_mode === "LINE_PERCENTAGE"
                            ? `${fee.percentage}% default · editável por linha`
                            : (fee.calculation_type === "PERCENTAGE" ? `${fee.percentage}% ${t('quoteBuilder.ofSubtotal')}` : `${t('quoteBuilder.fixedAmount')} ${formatCurrency(fee.fixed_amount || 0)}`)}
                        </div>
                      </label>
                      {selectedFees.has(fee.id) && (
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor={`fee-vat-${fee.id}`}>IVA %</label>
                          <Input
                            id={`fee-vat-${fee.id}`}
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="h-8 w-20"
                            value={
                              typeof feeVatOverrides[fee.id] === "number"
                                ? feeVatOverrides[fee.id]
                                : (fee.apply_vat !== false ? (typeof fee.vat_rate === "number" ? fee.vat_rate : 23) : 0)
                            }
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setFeeVatOverrides(prev => ({
                                ...prev,
                                [fee.id]: Number.isNaN(v) ? 0 : v,
                              }));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quote Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2 sticky top-0 z-10 bg-card border-b">
              <CardTitle className="flex items-center gap-2">🧩 Itens do Orçamento</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowApplyVatDialog(true)} title="Aplicar um IVA único a todas as linhas (ex: Zona ARU)">
                  <Percent className="w-4 h-4 mr-1" /> Aplicar IVA…
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setNewSectionName(`Secção ${sections.length + 1}`);
                  setShowNewSectionDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Nova Secção
                </Button>
                <Button size="sm" onClick={() => { setInsertAtIndex(null); setShowCatalogDialog(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>

              {/* Enhanced Sections */}
              {sections.map((sectionName, sectionIdx) => {
                const sectionLines = lines.filter(l => l.section_name === sectionName);
                if (sectionLines.length === 0 && sections.length <= 1) return null;

                // Section metrics
                let sectionSubtotal = 0;
                let sectionCost = 0;
                let hasSectionCostData = false;
                sectionLines.filter(l => l.qt > 0).forEach(line => {
                  const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
                  const isManual = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
                  const unitPrice = isManual ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
                  const preco = unitPrice * line.qt;
                  const ld = line.discount_percent || 0;
                  sectionSubtotal += preco * (1 - ld / 100);
                  if (line.cost_price && line.cost_price > 0) {
                    hasSectionCostData = true;
                    sectionCost += line.cost_price * line.qt;
                  }
                });
                const sectionMargin = hasSectionCostData && sectionSubtotal > 0 ? ((sectionSubtotal - sectionCost) / sectionSubtotal) * 100 : 0;
                const marginColor = sectionMargin > 30 ? "bg-green-100 text-green-700" : sectionMargin >= 15 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";

                return (
                  <div key={`section-${sectionIdx}`} className="mb-6 border rounded-lg overflow-hidden">
                    {/* Section Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b group">
                      <div className="flex items-center gap-3">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <span className="text-lg font-bold">{sectionName === "Geral" ? "📦" : "🧱"}</span>
                        <input
                          className="font-semibold bg-transparent border-none outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 max-w-[200px]"
                          value={sectionName}
                          onChange={(e) => {
                            const oldName = sectionName;
                            const newName = e.target.value;
                            setSections(prev => prev.map(s => s === oldName ? newName : s));
                            setLines(prev => prev.map(l => l.section_name === oldName ? { ...l, section_name: newName } : l));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{sectionLines.filter(l => l.qt > 0).length} itens</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-primary">{formatCurrency(sectionSubtotal)}</span>
                        {hasSectionCostData && sectionLines.length > 0 && (
                          <Badge variant="secondary" className={`text-xs ${marginColor}`}>
                            Margem: {sectionMargin.toFixed(0)}%
                          </Badge>
                        )}
                        {sections.length > 1 && sectionName !== "Geral" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={() => {
                              if (confirm(`Remover a secção "${sectionName}"?`)) {
                                setLines(prev => prev.map(l => l.section_name === sectionName ? { ...l, section_name: "Geral" } : l));
                                setSections(prev => prev.filter(s => s !== sectionName));
                              }
                            }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Items Table */}
                    {sectionLines.length > 0 && (() => {
                      const sectionItemIds = sectionLines.map((line, idx) => {
                        const gIdx = lines.findIndex(l => l === line);
                        return `line-${gIdx}`;
                      });
                      return (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event: DragEndEvent) => {
                          const { active, over } = event;
                          if (!over || active.id === over.id) return;
                          const fromIdx = parseInt(String(active.id).replace("line-", ""), 10);
                          const toIdx = parseInt(String(over.id).replace("line-", ""), 10);
                          if (Number.isNaN(fromIdx) || Number.isNaN(toIdx)) return;
                          setLines(prev => {
                            const reordered = arrayMove(prev, fromIdx, toIdx);
                            return reordered.map((l, i) => ({ ...l, ordem: i + 1 }));
                          });
                        }}
                      >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[30px]"></TableHead>
                            <TableHead className="min-w-[180px]">ITEM</TableHead>
                            <TableHead className="w-[70px] text-center">QTD</TableHead>
                            <TableHead className="w-[70px] text-center">UN.</TableHead>
                            <TableHead className="w-[100px] text-center">P. VENDA</TableHead>
                            <TableHead className="w-[70px] text-center">IVA</TableHead>
                            {linePctFee && (
                              <TableHead className="w-[80px] text-center" title={linePctFee.name}>RISCO %</TableHead>
                            )}
                            <TableHead className="w-[100px] text-right">TOTAL S/IVA</TableHead>
                            <TableHead className="w-[100px] text-right">TOTAL C/IVA</TableHead>
                            <TableHead className="w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SortableContext items={sectionItemIds} strategy={verticalListSortingStrategy}>
                          {sectionLines.map((line, lineIndex) => {
                            const custoUnit = line.custo_material_unit + line.custo_mao_obra_unit;
                            const isManualPrice = custoUnit === 0 && (line.retail_price_unit !== undefined && line.retail_price_unit !== null);
                            const precoVenda = isManualPrice ? (line.retail_price_unit || 0) : custoUnit * (1 + line.margem_percent / 100) * (1 + line.int_percent / 100);
                            const lineDiscount = line.discount_percent || 0;
                            const subtotalComDesconto = precoVenda * line.qt * (1 - lineDiscount / 100);
                            const costPrice = line.cost_price || custoUnit;
                            const itemMargin = precoVenda > 0 ? ((precoVenda - costPrice) / precoVenda) * 100 : 0;
                            const itemMarginColor = itemMargin > 30 ? "text-green-600 bg-green-50" : itemMargin >= 15 ? "text-yellow-600 bg-yellow-50" : "text-red-600 bg-red-50";
                            const lineId = line.bundle_id || line.product_id || line.service_id || line.catalog_item_id || `line-${lineIndex}`;
                            const globalLineIndex = lines.findIndex(l => l === line);
                            const sortableId = `line-${globalLineIndex}`;
                            const isBundle = !!line.bundle_id;

                            // Detect bundle components with mixed VAT (mirrors calculateTotals + PDF logic)
                            const lineBundleComponents: any[] = Array.isArray((line as any).bundle_components)
                              ? (line as any).bundle_components
                              : (Array.isArray((line as any).selected_attributes?.bundle_components)
                                ? (line as any).selected_attributes.bundle_components
                                : (Array.isArray((line as any).selected_attributes?.bundle_components_data)
                                  ? (line as any).selected_attributes.bundle_components_data
                                  : []));
                            const lineComponentsTotal = lineBundleComponents.reduce(
                              (s: number, c: any) => s + (parseFloat(String(c.unit_price || 0)) * parseFloat(String(c.quantity || 0))),
                              0,
                            );
                            const distinctVatRates = Array.from(new Set(
                              lineBundleComponents.map((c: any) => Number(c.vat_rate ?? 23))
                            )).sort((a, b) => a - b);
                            const lineIvaOverride = (line as any).selected_attributes?.iva_override;
                            const hasLineOverride = typeof lineIvaOverride === "number" && !Number.isNaN(lineIvaOverride);
                            const hasMixedVat = lineBundleComponents.length > 0 && lineComponentsTotal > 0 && distinctVatRates.length > 1 && !hasLineOverride;

                            // Calculate IVA value for the line (split if mixed)
                            let lineIvaValor = 0;
                            const lineVatBreakdown: { rate: number; base: number; vat: number }[] = [];
                            if (hasMixedVat) {
                              lineBundleComponents.forEach((c: any) => {
                                const cUnit = parseFloat(String(c.unit_price || 0));
                                const cQty = parseFloat(String(c.quantity || 0));
                                const cRate = parseFloat(String(c.vat_rate ?? 23));
                                const share = (cUnit * cQty) / lineComponentsTotal;
                                const base = subtotalComDesconto * share;
                                const vat = base * (cRate / 100);
                                lineIvaValor += vat;
                                const existing = lineVatBreakdown.find(b => b.rate === cRate);
                                if (existing) { existing.base += base; existing.vat += vat; }
                                else lineVatBreakdown.push({ rate: cRate, base, vat });
                              });
                            } else {
                              const effRate = hasLineOverride ? lineIvaOverride : (line.iva_percent || formData.iva_rate);
                              lineIvaValor = subtotalComDesconto * (effRate / 100);
                            }
                            const lineTotalComIva = subtotalComDesconto + lineIvaValor;
                            const isBundleLine = lineBundleComponents.length > 0 && lineComponentsTotal > 0;

                            const unitOptions = ["un", "m²", "ml", "dia", "hora", "kg", "m", "vg"];

                            return (
                              <SortableQuoteRow key={sortableId} id={sortableId}>
                                {({ setNodeRef, style, attributes, listeners }) => (
                                <TableRow ref={setNodeRef as any} style={style} className="group hover:bg-muted/20">
                                  <TableCell className="text-center">
                                    <button
                                      type="button"
                                      className="cursor-grab active:cursor-grabbing touch-none"
                                      {...attributes}
                                      {...listeners}
                                      title="Arrastar para reordenar"
                                    >
                                      <GripVertical className="h-4 w-4 text-muted-foreground/60 mx-auto" />
                                    </button>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      {isBundle ? (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-primary" />
                                            <span className="font-medium text-primary flex-1">{line.descricao_snapshot}</span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6 opacity-70 hover:opacity-100 transition-opacity"
                                              onClick={() => setEditingBundleLineIndex(globalLineIndex)}
                                              title="Editar atributos dos componentes"
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </Button>
                                          </div>
                                          {lineBundleComponents.length > 0 && (
                                            <ul className="ml-6 text-xs text-muted-foreground space-y-0.5 list-disc">
                                              {lineBundleComponents.map((c: any, i: number) => {
                                                const attrs = c.selected_attributes
                                                  ? Object.values(c.selected_attributes)
                                                      .map((a: any) => a?.option_label ?? a?.value)
                                                      .filter((v: any) => v !== undefined && v !== null && v !== "")
                                                  : [];
                                                return (
                                                  <li key={i}>
                                                    <span>{c.quantity ?? 1}× {c.product_name || c.name || "Componente"}</span>
                                                    {attrs.length > 0 && (
                                                      <span className="ml-1 italic">— {attrs.join(", ")}</span>
                                                    )}
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          )}
                                        </div>
                                      ) : !line.product_id && !line.service_id && !line.catalog_item_id ? (
                                        <Input
                                          value={line.descricao_snapshot}
                                          onChange={(e) => {
                                            const updated = [...lines];
                                            updated[globalLineIndex] = { ...line, descricao_snapshot: e.target.value };
                                            setLines(updated);
                                          }}
                                          placeholder="Nome do item..."
                                          className="h-8 text-sm font-medium"
                                        />
                                      ) : (
                                        <InlineProductSelector
                                          currentDescription={line.descricao_snapshot}
                                          currentSku={line.sku || null}
                                          onEditClick={() => {
                                            setReplaceLineIndex(globalLineIndex);
                                            setReplaceItemType(line.product_id ? "product" : "service");
                                            setShowReplaceDialog(true);
                                          }}
                                          isProduct={!!line.product_id}
                                        />
                                      )}
                                      {/* Item description */}
                                      {line.item_description ? (
                                        <div className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2">
                                          <textarea
                                            value={line.item_description}
                                            onChange={(e) => {
                                              const updated = [...lines];
                                              updated[globalLineIndex] = { ...line, item_description: e.target.value };
                                              setLines(updated);
                                            }}
                                            rows={Math.min(8, Math.max(2, (line.item_description.match(/\n/g)?.length || 0) + 1))}
                                            className="w-full resize-y bg-transparent text-xs leading-relaxed text-foreground/80 outline-none whitespace-pre-wrap"
                                          />
                                        </div>
                                      ) : (
                                        <Input
                                          value=""
                                          onChange={(e) => {
                                            const updated = [...lines];
                                            updated[globalLineIndex] = { ...line, item_description: e.target.value };
                                            setLines(updated);
                                          }}
                                          placeholder="Descrição adicional..."
                                          className="mt-1 text-xs h-7 text-muted-foreground border-dashed"
                                        />
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Input type="number" min="0" step="1" value={line.qt}
                                      onChange={(e) => {
                                        const updated = [...lines];
                                        updated[globalLineIndex] = { ...line, qt: Number(e.target.value) };
                                        setLines(updated);
                                      }}
                                      className="w-16 mx-auto text-center h-8" />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Select value={line.unidade || "un"} onValueChange={(v) => {
                                      const updated = [...lines];
                                      updated[globalLineIndex] = { ...line, unidade: v };
                                      setLines(updated);
                                    }}>
                                      <SelectTrigger className="w-16 h-8 text-xs mx-auto"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {unitOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Input type="number" min="0" step="0.01"
                                      value={precoVenda.toFixed(2)}
                                      onChange={(e) => {
                                        const newPrice = Number(e.target.value);
                                        const updated = [...lines];
                                        if (custoUnit > 0 && newPrice > 0) {
                                          const newMargin = ((newPrice / custoUnit) - 1) * 100 / (1 + line.int_percent / 100);
                                          updated[globalLineIndex] = { ...line, margem_percent: Math.max(0, newMargin) };
                                        } else {
                                          updated[globalLineIndex] = { ...line, retail_price_unit: newPrice };
                                        }
                                        setLines(updated);
                                      }}
                                      className="w-20 mx-auto text-center h-8 text-xs font-medium" />
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        value={hasMixedVat ? "" : (hasLineOverride ? lineIvaOverride : (line.iva_percent ?? formData.iva_rate))}
                                        placeholder={hasMixedVat ? "Misto" : ""}
                                        title={hasMixedVat
                                          ? lineVatBreakdown
                                              .sort((a, b) => a.rate - b.rate)
                                              .map(b => `IVA ${b.rate}%: ${formatCurrency(b.vat)} (base ${formatCurrency(b.base)})`)
                                              .join('\n')
                                          : "IVA da linha (%)"}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const updated = [...lines];
                                          if (raw === "") {
                                            // Clear: remove override (bundles revert to mixed); keep iva_percent
                                            const sa = { ...((line as any).selected_attributes || {}) };
                                            delete sa.iva_override;
                                            updated[globalLineIndex] = { ...line, selected_attributes: sa };
                                          } else {
                                            const num = Math.max(0, Math.min(100, Number(raw)));
                                            const sa = { ...((line as any).selected_attributes || {}), iva_override: num };
                                            updated[globalLineIndex] = {
                                              ...line,
                                              iva_percent: num,
                                              selected_attributes: isBundleLine ? sa : ((line as any).selected_attributes || undefined),
                                            };
                                            // For non-bundle lines we don't need iva_override (no mixed source); only set on bundles
                                            if (!isBundleLine) {
                                              const sa2 = { ...((line as any).selected_attributes || {}) };
                                              delete sa2.iva_override;
                                              updated[globalLineIndex] = { ...updated[globalLineIndex], selected_attributes: Object.keys(sa2).length ? sa2 : (line as any).selected_attributes };
                                            }
                                          }
                                          setLines(updated);
                                        }}
                                        className="w-16 text-center h-7 text-xs font-semibold px-1"
                                      />
                                      {isBundleLine && hasLineOverride && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...lines];
                                            const sa = { ...((line as any).selected_attributes || {}) };
                                            delete sa.iva_override;
                                            updated[globalLineIndex] = { ...line, selected_attributes: sa };
                                            setLines(updated);
                                          }}
                                          title="Restaurar IVA misto do bundle"
                                          className="text-muted-foreground hover:text-foreground"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                  {linePctFee && (
                                    <TableCell className="text-center">
                                      {(!!(line as any).service_id && !(line as any).product_id && !(line as any).bundle_id) ? (
                                        <Input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step={0.5}
                                          value={(() => {
                                            const raw = (line as any).selected_attributes?.risk_fee_percent;
                                            if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
                                            return linePctFee.percentage ?? 0;
                                          })()}
                                          title={`Default ${linePctFee.percentage ?? 0}% (${linePctFee.name}). Limpar para usar default.`}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const updated = [...lines];
                                            const sa = { ...((line as any).selected_attributes || {}) };
                                            if (raw === "") {
                                              delete sa.risk_fee_percent;
                                            } else {
                                              const num = Math.max(0, Math.min(100, Number(raw)));
                                              sa.risk_fee_percent = num;
                                            }
                                            updated[globalLineIndex] = {
                                              ...line,
                                              selected_attributes: Object.keys(sa).length ? sa : undefined,
                                            } as any;
                                            setLines(updated);
                                          }}
                                          className="w-16 mx-auto text-center h-7 text-xs px-1"
                                        />
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right font-medium text-xs">
                                    {formatCurrency(subtotalComDesconto)}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-xs">
                                    {formatCurrency(lineTotalComIva)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="icon" className="h-6 w-6"
                                        title="Alterar item"
                                        onClick={() => {
                                          if (line.bundle_id) {
                                            setEditingBundleLineIndex(globalLineIndex);
                                            return;
                                          }
                                          setReplaceLineIndex(globalLineIndex);
                                          if (line.service_id) {
                                            setReplaceItemType("service");
                                          } else {
                                            setReplaceItemType("product");
                                          }
                                          setShowReplaceDialog(true);
                                        }}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6"
                                        title="Duplicar"
                                        onClick={() => {
                                          const dup = { ...line, ordem: lines.length + 1 };
                                          setLines([...lines, dup]);
                                        }}>
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                        title="Apagar"
                                        onClick={() => {
                                          setLines(lines.filter((_, i) => i !== globalLineIndex));
                                        }}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                )}
                              </SortableQuoteRow>
                            );
                          })}
                          </SortableContext>
                        </TableBody>
                      </Table>
                      </DndContext>
                      );
                    })()}

                    {/* Add item to section */}
                    <div className="px-4 py-2 border-t">
                      <Button variant="ghost" size="sm" className="text-primary"
                        onClick={() => {
                          const maxOrdem = lines.length > 0 ? Math.max(...lines.map(l => l.ordem)) + 1 : 1;
                          setLines(prev => [...prev, {
                            catalog_item_id: null,
                            product_id: null,
                            service_id: null,
                            categoria: sectionName,
                            descricao_snapshot: "Item",
                            qt: 1,
                            custo_material_unit: 0,
                            custo_mao_obra_unit: 0,
                            margem_percent: 0,
                            iva_percent: 23,
                            int_percent: 0,
                            discount_percent: 0,
                            ordem: maxOrdem,
                            retail_price_unit: 0,
                            section_name: sectionName,
                          }]);
                        }}>
                        <Plus className="w-4 h-4 mr-1" /> Adicionar item a {sectionName}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-primary ml-2"
                        onClick={() => { setActiveSection(sectionName); setInsertAtIndex(null); setShowCatalogDialog(true); }}>
                        🧩 Do catálogo
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* New Section Button */}
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <Button variant="ghost" onClick={() => {
                  setNewSectionName(`Secção ${sections.length + 1}`);
                  setShowNewSectionDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Nova Secção
                </Button>
              </div>

              {/* Inline Quotes */}
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

              {/* Add Another Quote Button */}
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                <Button variant="ghost" onClick={() => {
                  setInlineQuotes([...inlineQuotes, createEmptyInlineQuote(formData.title)]);
                }}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar outro orçamento
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Conditions */}
          <QuoteConditions
            clientNotes={formData.client_notes}
            onClientNotesChange={(v) => setFormData({ ...formData, client_notes: v })}
            conditions={formData.conditions}
            onConditionsChange={(v) => setFormData({ ...formData, conditions: v })}
          />
        </div>

        {/* Right Column - Sidebar */}
        <div className="w-[340px] shrink-0 hidden lg:block">
          <div className="sticky top-6">
            <QuoteBuilderSidebar
              sections={sections}
              lines={lines}
              totals={totals}
              descontoPercent={formData.desconto_global_percent}
              ivaRate={formData.iva_rate}
              onSave={handleSave}
              onSaveAndSendEmail={handleSaveAndSendEmail}
              onSaveAndSendWhatsApp={handleSaveAndSendWhatsApp}
              
              loading={loading}
              dealId={formData.deal_id || null}
              templates={templates}
              onLoadTemplate={handleModeloBaseChange}
              onPreviewPdf={() => setShowPdfPreview(true)}
              onDownloadPdf={handleDownloadPdf}
              downloadingPdf={downloadingPdf}
              inlineQuotes={inlineQuotes}
            />
          </div>
        </div>
      </div>

      {/* New Add Items Dialog */}
      <AddItemsDialog
        open={showCatalogDialog}
        onOpenChange={setShowCatalogDialog}
        onAddItems={handleAddItemsFromDialog}
        products={products.map(p => ({ ...p, type: "product" as const }))}
        services={services.map(s => ({ ...s, type: "service" as const }))}
      />

      {/* Replace Item Dialog */}
      <AddItemsDialog
        open={showReplaceDialog}
        onOpenChange={(open) => { setShowReplaceDialog(open); if (!open) setReplaceLineIndex(null); }}
        onAddItems={handleReplaceItemFromDialog}
        products={products.map(p => ({ ...p, type: "product" as const }))}
        services={services.map(s => ({ ...s, type: "service" as const }))}
        replaceMode={true}
        replaceItemType={replaceItemType}
      />

      {/* Edit Line Attributes Dialog */}
      {editingLineIndex !== null && editingProductId && (
        <LineAttributesDialog
          open={editingLineIndex !== null}
          onOpenChange={(open) => {
            if (!open) { setEditingLineIndex(null); setEditingProductId(null); setEditingProductName(""); }
          }}
          productId={editingProductId}
          productName={editingProductName}
          currentAttributes={lines[editingLineIndex]?.selected_attributes || {}}
          onSave={(attributes, attributePriceAddon) => {
            if (editingLineIndex !== null) {
              const line = lines[editingLineIndex];
              const updatedLines = [...lines];
              const product = products.find(p => p.id === line.product_id);
              const service = services.find(s => s.id === line.service_id);
              const basePrice = product?.retail_price ?? service?.retail_price ?? 0;
              const newRetailPrice = basePrice + (attributePriceAddon || 0);
              const defaultMargin = line.margem_percent || 30;
              const defaultInt = line.int_percent || 0;
              const laborCost = line.custo_mao_obra_unit || 0;
              const newMaterialCost = newRetailPrice > 0
                ? (newRetailPrice / (1 + defaultMargin / 100) / (1 + defaultInt / 100)) - laborCost
                : 0;
              updatedLines[editingLineIndex] = { ...line, selected_attributes: attributes, custo_material_unit: Math.max(0, newMaterialCost) };
              setLines(updatedLines);
              toast({ title: "Atributos atualizados", description: `Preço atualizado: €${newRetailPrice.toFixed(2)}` });
            }
          }}
        />
      )}

      {/* Edit Bundle Components Attributes Dialog */}
      {editingBundleLineIndex !== null && (() => {
        const bLine: any = lines[editingBundleLineIndex];
        if (!bLine) return null;
        const components: any[] = Array.isArray(bLine.bundle_components)
          ? bLine.bundle_components
          : (Array.isArray(bLine?.selected_attributes?.bundle_components)
            ? bLine.selected_attributes.bundle_components
            : (Array.isArray(bLine?.selected_attributes?.bundle_components_data)
              ? bLine.selected_attributes.bundle_components_data
              : []));
        return (
          <BundleEditAttributesDialog
            open={editingBundleLineIndex !== null}
            onOpenChange={(o) => { if (!o) setEditingBundleLineIndex(null); }}
            bundleName={(bLine as any).descricao_snapshot || bLine?.selected_attributes?.bundle_name || "Bundle"}
            bundleId={bLine.bundle_id || null}
            components={components}
            onSaveComponent={(componentIndex, attributes) => {
              const updated = [...lines];
              const targetLine: any = { ...updated[editingBundleLineIndex] };
              const newComponents = [...components];
              newComponents[componentIndex] = {
                ...newComponents[componentIndex],
                selected_attributes: attributes,
              };
              targetLine.bundle_components = newComponents;
              targetLine.selected_attributes = {
                ...(targetLine.selected_attributes || {}),
                bundle_components: newComponents,
              };
              updated[editingBundleLineIndex] = targetLine;
              setLines(updated);
              toast({ title: "Atributos atualizados", description: "Componente do bundle atualizado." });
            }}
            onReplaceWithChoiceOption={(componentIndex, opt) => {
              const updated = [...lines];
              const targetLine: any = { ...updated[editingBundleLineIndex!] };
              const newComponents = [...components];
              const old = newComponents[componentIndex] || {};
              newComponents[componentIndex] = {
                ...old,
                product_id: opt.type === "product" ? opt.source_id : null,
                source_id: opt.source_id,
                type: opt.type,
                product_name: opt.name,
                name: opt.name,
                sku: opt.sku,
                unit_price: opt.unit_price,
                vat_rate: opt.vat_rate,
                quantity: opt.quantity ?? old.quantity ?? 1,
                selected_attributes: {},
              };
              targetLine.bundle_components = newComponents;
              targetLine.selected_attributes = {
                ...(targetLine.selected_attributes || {}),
                bundle_components: newComponents,
              };
              // Recalculate bundle price from components
              const newTotal = newComponents.reduce((sum: number, c: any) => sum + (Number(c.unit_price) || 0) * (Number(c.quantity) || 1), 0);
              const margin = targetLine.margem_percent || 30;
              const intPct = targetLine.int_percent || 0;
              targetLine.custo_material_unit = newTotal > 0
                ? newTotal / (1 + margin / 100) / (1 + intPct / 100) - (targetLine.custo_mao_obra_unit || 0)
                : 0;
              updated[editingBundleLineIndex!] = targetLine;
              setLines(updated);
              toast({ title: "Componente substituído", description: `${opt.name} associado ao bundle.` });
            }}
            onChangeComponentVat={(componentIndex, vatRate) => {
              const updated = [...lines];
              const targetLine: any = { ...updated[editingBundleLineIndex!] };
              const newComponents = [...components];
              newComponents[componentIndex] = {
                ...newComponents[componentIndex],
                vat_rate: vatRate ?? 23,
              };
              targetLine.bundle_components = newComponents;
              targetLine.selected_attributes = {
                ...(targetLine.selected_attributes || {}),
                bundle_components: newComponents,
              };
              updated[editingBundleLineIndex!] = targetLine;
              setLines(updated);
            }}
          />
        );
      })()}

      {/* PDF Preview Dialog */}
      <QuotePdfPreviewDialog
        open={showPdfPreview}
        onOpenChange={setShowPdfPreview}
        quoteData={{
          ...formData,
          quote_number: quoteNumber || autoReference,
          created_at: new Date().toISOString(),
          entity_id: resolvedQuoteEntityId,
        }}
        lines={lines}
        organizationId={formData.organization_id || selectedSource?.organization_id || activeCompany?.id || null}
        entityId={resolvedQuoteEntityId}
        inlineQuotes={inlineQuotes}
        initialTemplateId={formData.pdf_template_id || null}
        onTemplateChange={(id) => setFormData(prev => ({ ...prev, pdf_template_id: id || "" }))}
        fees={totals.fees.map(f => ({
          calculated_value: f.calculatedValue,
          vat_amount: f.vatAmount,
          vat_rate: f.vatRate,
          service_fee_types: { name: f.name },
        }))}
      />

      {/* Send Quote Email Dialog */}
      <SendQuoteDialog
        open={showSendEmailDialog}
        onOpenChange={(open) => {
          setShowSendEmailDialog(open);
          if (!open) onClose();
        }}
        quote={savedQuoteData}
        onSent={() => onClose()}
      />

      {/* WhatsApp Dialog */}
      <WhatsAppSendDialog
        open={showWhatsAppDialog}
        onOpenChange={(open) => {
          setShowWhatsAppDialog(open);
          if (!open) onClose();
        }}
        context={whatsAppCtx}
      />

      {/* New Section Dialog */}
      <Dialog open={showNewSectionDialog} onOpenChange={setShowNewSectionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Secção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da secção</Label>
              <Input
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="Nome da secção..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const name = newSectionName.trim();
                    if (name && !sections.includes(name)) {
                      setSections(prev => [...prev, name]);
                      setActiveSection(name);
                      setShowNewSectionDialog(false);
                      setNewSectionName("");
                    }
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewSectionDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                const name = newSectionName.trim();
                if (name && !sections.includes(name)) {
                  setSections(prev => [...prev, name]);
                  setActiveSection(name);
                  setShowNewSectionDialog(false);
                  setNewSectionName("");
                }
              }}>Criar Secção</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply VAT to all lines Dialog */}
      <Dialog open={showApplyVatDialog} onOpenChange={setShowApplyVatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar IVA a todas as linhas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Aplica este IVA a todas as linhas (incluindo bundles com IVA misto). Útil para Zonas ARU, isenções ou regimes especiais.
            </p>
            <div className="space-y-2">
              <Label>IVA (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={applyVatValue}
                onChange={(e) => setApplyVatValue(e.target.value)}
                placeholder="ex: 6 para Zona ARU"
                autoFocus
              />
            </div>
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  const updated = lines.map((l) => {
                    const sa = { ...((l as any).selected_attributes || {}) };
                    delete sa.iva_override;
                    return { ...l, selected_attributes: Object.keys(sa).length ? sa : (l as any).selected_attributes };
                  });
                  setLines(updated);
                  setShowApplyVatDialog(false);
                  toast({ title: "IVA original restaurado", description: "Removidos os overrides de IVA das linhas." });
                }}
              >
                Restaurar IVA original
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowApplyVatDialog(false)}>Cancelar</Button>
                <Button
                  onClick={() => {
                    const num = Math.max(0, Math.min(100, Number(applyVatValue)));
                    if (Number.isNaN(num)) return;
                    const updated = lines.map((l) => {
                      const sa = { ...((l as any).selected_attributes || {}), iva_override: num };
                      return { ...l, iva_percent: num, selected_attributes: sa };
                    });
                    setLines(updated);
                    setShowApplyVatDialog(false);
                    toast({ title: `IVA ${num}% aplicado`, description: `${updated.length} linha(s) atualizada(s).` });
                  }}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
