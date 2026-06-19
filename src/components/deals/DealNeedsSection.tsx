import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, ClipboardList,
  Euro, FileText, Package, Wrench, GripVertical, X, Link2, Search,
  Eye, EyeOff, Settings2, ChevronRight, Hash, Calendar, Type, AlignLeft, List, Paperclip, Ruler,
  Layers, Save, ToggleLeft,
  Building2, Hammer, Briefcase, Lightbulb, Stethoscope, GraduationCap, Truck, Utensils,
  Monitor, PaintBucket, Zap, Shield, Leaf, Home, Car, Palette, Scissors, Cog, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

// ─── Types ───────────────────────────────────────────────────

interface CustomFieldValue {
  field_config_id: string;
  value: string;
}

interface MeasurementValue {
  field_id: string;
  value: number;
}

interface MeasurementFieldDef {
  id: string;
  name: string;
  unit: string;
}

interface DealNeed {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  internal_notes: string | null;
  initial_estimate: number;
  estimate_min: number;
  estimate_max: number;
  attachments: any[];
  custom_fields: CustomFieldValue[];
  measurement_values: MeasurementValue[];
  template_id: string | null;
  sort_order: number;
  created_at: string;
  category_id: string | null;
  category_name: string | null;
  technical_notes: string | null;
  measurements: Record<string, number>;
  checklist: { text: string; checked: boolean; value?: string }[];
}

interface DealNeedItem {
  id: string;
  deal_need_id: string;
  product_id: string | null;
  service_id: string | null;
  item_type: string;
  quantity: number;
  notes: string | null;
  product_name?: string;
  service_name?: string;
  unit_price?: number;
}

interface CatalogItem {
  id: string;
  name: string;
  sku?: string;
  price?: number;
}

interface FieldConfig {
  id: string;
  name: string;
  field_type: string;
  options: string[];
  is_required: boolean;
  sort_order: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  fieldIds: string[];
  show_measurements_tab: boolean | null;
  show_items_tab: boolean | null;
  icon: string;
  color: string;
  sector: string | null;
  default_priority: string;
  estimate_min: number;
  estimate_max: number;
  checklist: string[];
  measurement_field_ids: string[];
}

interface OrgSettings {
  show_measurements_tab: boolean;
  show_items_tab: boolean;
  measurement_fields: MeasurementFieldDef[];
}

interface DealNeedsSectionProps {
  dealId: string;
  organizationId: string | null;
  readOnly?: boolean;
}

// ─── Constants ───────────────────────────────────────────────

const priorityConfig = {
  alta: { label: "Alta", color: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
  media: { label: "Média", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", dot: "bg-amber-500" },
  baixa: { label: "Baixa", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", dot: "bg-emerald-500" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-muted text-muted-foreground" },
  em_analise: { label: "Em análise", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  orcamentado: { label: "Orçamentado", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  cancelado: { label: "Cancelado", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

const FIELD_TYPE_ICONS: Record<string, any> = {
  text: Type, number: Hash, dropdown: List, checkbox: ToggleLeft,
  date: Calendar, textarea: AlignLeft, file: Paperclip,
};

const CFG_FIELD_TYPES = [
  { value: "text", label: "Texto", icon: Type },
  { value: "number", label: "Número", icon: Hash },
  { value: "dropdown", label: "Dropdown", icon: List },
  { value: "checkbox", label: "Checkbox", icon: ToggleLeft },
  { value: "date", label: "Data", icon: Calendar },
  { value: "textarea", label: "Texto longo", icon: AlignLeft },
  { value: "file", label: "Ficheiro", icon: Paperclip },
];

const TEMPLATE_ICONS = [
  { value: "building", label: "Edifício", icon: Building2 },
  { value: "hammer", label: "Construção", icon: Hammer },
  { value: "briefcase", label: "Comercial", icon: Briefcase },
  { value: "lightbulb", label: "Consultoria", icon: Lightbulb },
  { value: "stethoscope", label: "Saúde", icon: Stethoscope },
  { value: "graduation", label: "Educação", icon: GraduationCap },
  { value: "truck", label: "Logística", icon: Truck },
  { value: "utensils", label: "Restauração", icon: Utensils },
  { value: "monitor", label: "Tecnologia", icon: Monitor },
  { value: "paint", label: "Design", icon: PaintBucket },
  { value: "zap", label: "Energia", icon: Zap },
  { value: "shield", label: "Segurança", icon: Shield },
  { value: "leaf", label: "Ambiente", icon: Leaf },
  { value: "home", label: "Imobiliário", icon: Home },
  { value: "car", label: "Automóvel", icon: Car },
  { value: "palette", label: "Criativo", icon: Palette },
  { value: "scissors", label: "Serviços", icon: Scissors },
  { value: "cog", label: "Industrial", icon: Cog },
  { value: "wrench", label: "Manutenção", icon: Wrench },
  { value: "package", label: "Produto", icon: Package },
];

const TEMPLATE_COLORS = [
  { value: "default", label: "Padrão", class: "bg-primary" },
  { value: "blue", label: "Azul", class: "bg-blue-500" },
  { value: "green", label: "Verde", class: "bg-emerald-500" },
  { value: "amber", label: "Âmbar", class: "bg-amber-500" },
  { value: "red", label: "Vermelho", class: "bg-red-500" },
  { value: "purple", label: "Roxo", class: "bg-purple-500" },
  { value: "pink", label: "Rosa", class: "bg-pink-500" },
  { value: "teal", label: "Teal", class: "bg-teal-500" },
  { value: "indigo", label: "Índigo", class: "bg-indigo-500" },
  { value: "orange", label: "Laranja", class: "bg-orange-500" },
];

const TEMPLATE_SECTORS = [
  "Construção", "Serviços", "Consultoria", "Criativo", "Tecnologia", "Saúde",
  "Educação", "Restauração", "Logística", "Imobiliário", "Energia", "Automóvel",
  "Segurança", "Ambiente", "Industrial", "Retalho", "Financeiro", "Jurídico",
  "Marketing", "Telecomunicações", "Agricultura", "Farmacêutico", "Outro",
];

const TEMPLATE_PRESETS = [
  { name: "Remodelação", desc: "Obras de remodelação e construção civil", icon: "hammer", measurements: true, items: true, sector: "Construção", priority: "media", color: "amber" },
  { name: "Construção Nova", desc: "Projectos de construção de raiz", icon: "building", measurements: true, items: true, sector: "Construção", priority: "alta", color: "blue" },
  { name: "Manutenção", desc: "Serviços de manutenção e reparação", icon: "wrench", measurements: false, items: true, sector: "Serviços", priority: "media", color: "green" },
  { name: "Consultoria", desc: "Serviços de consultoria e assessoria", icon: "lightbulb", measurements: false, items: false, sector: "Consultoria", priority: "media", color: "purple" },
  { name: "Design / Criativo", desc: "Projectos de design, branding, criativo", icon: "palette", measurements: false, items: false, sector: "Criativo", priority: "media", color: "pink" },
  { name: "Tecnologia / Software", desc: "Desenvolvimento de software, IT", icon: "monitor", measurements: false, items: true, sector: "Tecnologia", priority: "media", color: "indigo" },
  { name: "Saúde / Clínica", desc: "Serviços de saúde, clínicas, consultas", icon: "stethoscope", measurements: false, items: true, sector: "Saúde", priority: "alta", color: "teal" },
  { name: "Educação / Formação", desc: "Cursos, formações, workshops", icon: "graduation", measurements: false, items: true, sector: "Educação", priority: "baixa", color: "blue" },
  { name: "Restauração / Catering", desc: "Restaurantes, catering, eventos", icon: "utensils", measurements: false, items: true, sector: "Restauração", priority: "media", color: "orange" },
  { name: "Logística / Transporte", desc: "Transportes, entregas, armazéns", icon: "truck", measurements: true, items: true, sector: "Logística", priority: "media", color: "default" },
  { name: "Imobiliário", desc: "Vendas e gestão de imóveis", icon: "home", measurements: true, items: false, sector: "Imobiliário", priority: "media", color: "amber" },
  { name: "Energia / Climatização", desc: "AVAC, painéis solares, eficiência energética", icon: "zap", measurements: true, items: true, sector: "Energia", priority: "alta", color: "green" },
  { name: "Automóvel", desc: "Oficinas, peças, seguros auto", icon: "car", measurements: false, items: true, sector: "Automóvel", priority: "media", color: "red" },
  { name: "Segurança", desc: "Sistemas de segurança, vigilância, CCTV", icon: "shield", measurements: true, items: true, sector: "Segurança", priority: "alta", color: "indigo" },
  { name: "Ambiente / Jardins", desc: "Paisagismo, jardinagem, ambiente", icon: "leaf", measurements: true, items: true, sector: "Ambiente", priority: "media", color: "green" },
  { name: "Industrial", desc: "Equipamentos, máquinas, produção", icon: "cog", measurements: true, items: true, sector: "Industrial", priority: "alta", color: "default" },
];

const getTemplateIcon = (iconValue: string) => {
  const found = TEMPLATE_ICONS.find(i => i.value === iconValue);
  return found?.icon || FileText;
};

// ─── Component ───────────────────────────────────────────────

export function DealNeedsSection({ dealId, organizationId, readOnly = false }: DealNeedsSectionProps) {
  const [needs, setNeeds] = useState<DealNeed[]>([]);
  const [needItems, setNeedItems] = useState<Record<string, DealNeedItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNeed, setEditingNeed] = useState<DealNeed | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [expandedNeeds, setExpandedNeeds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Company config
  const [companyFields, setCompanyFields] = useState<FieldConfig[]>([]);
  const [companyTemplates, setCompanyTemplates] = useState<Template[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({ show_measurements_tab: false, show_items_tab: true, measurement_fields: [] });
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configTab, setConfigTab] = useState("tabs");

  // Config dialog field state
  const [cfgFieldDialogOpen, setCfgFieldDialogOpen] = useState(false);
  const [cfgEditingField, setCfgEditingField] = useState<FieldConfig | null>(null);
  const [cfgFieldName, setCfgFieldName] = useState("");
  const [cfgFieldType, setCfgFieldType] = useState("text");
  const [cfgFieldOptions, setCfgFieldOptions] = useState("");
  const [cfgFieldRequired, setCfgFieldRequired] = useState(false);

  // Config dialog measurement state
  const [cfgMeasurementDialogOpen, setCfgMeasurementDialogOpen] = useState(false);
  const [cfgEditingMeasurementIndex, setCfgEditingMeasurementIndex] = useState<number | null>(null);
  const [cfgMeasurementName, setCfgMeasurementName] = useState("");
  const [cfgMeasurementUnit, setCfgMeasurementUnit] = useState("m²");

  // Config dialog template state
  const [cfgTemplateDialogOpen, setCfgTemplateDialogOpen] = useState(false);
  const [cfgEditingTemplate, setCfgEditingTemplate] = useState<Template | null>(null);
  const [cfgTemplateName, setCfgTemplateName] = useState("");
  const [cfgTemplateDescription, setCfgTemplateDescription] = useState("");
  const [cfgTemplateFieldIds, setCfgTemplateFieldIds] = useState<Set<string>>(new Set());
  const [cfgTemplateShowMeasurements, setCfgTemplateShowMeasurements] = useState<boolean | null>(null);
  const [cfgTemplateShowItems, setCfgTemplateShowItems] = useState<boolean | null>(null);
  const [cfgTemplateIcon, setCfgTemplateIcon] = useState("briefcase");
  const [cfgTemplateColor, setCfgTemplateColor] = useState("default");
  const [cfgTemplateSector, setCfgTemplateSector] = useState("");
  const [cfgTemplateDefaultPriority, setCfgTemplateDefaultPriority] = useState("media");
  const [cfgTemplateMeasurementFieldIds, setCfgTemplateMeasurementFieldIds] = useState<Set<string>>(new Set());
  const [cfgTemplateEstimateMin, setCfgTemplateEstimateMin] = useState("");
  const [cfgTemplateEstimateMax, setCfgTemplateEstimateMax] = useState("");
  const [cfgTemplateChecklist, setCfgTemplateChecklist] = useState<string[]>([]);
  const [cfgTemplateNewChecklistItem, setCfgTemplateNewChecklistItem] = useState("");
  const [cfgShowPresets, setCfgShowPresets] = useState(false);
  const [cfgPresetSearch, setCfgPresetSearch] = useState("");

  // Effective tab visibility (org settings + template overrides)
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showItems, setShowItems] = useState(true);
  const [showCustomFields, setShowCustomFields] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("media");
  const [formStatus, setFormStatus] = useState("pendente");
  const [formEstimateMin, setFormEstimateMin] = useState("");
  const [formEstimateMax, setFormEstimateMax] = useState("");
  const [formInternalNotes, setFormInternalNotes] = useState("");
  const [formTemplateId, setFormTemplateId] = useState<string | null>(null);

  // Dynamic custom field values
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string>>({});
  const [activeFieldIds, setActiveFieldIds] = useState<string[]>([]);

  // Measurement values
  const [formMeasurements, setFormMeasurements] = useState<Record<string, string>>({});

  // Checklist state (from template)
  const [formChecklist, setFormChecklist] = useState<{ text: string; checked: boolean; value?: string }[]>([]);

  // Item linking state
  const [linkedItems, setLinkedItems] = useState<DealNeedItem[]>([]);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemPickerTab, setItemPickerTab] = useState("products");
  const [itemSearch, setItemSearch] = useState("");
  const [availableProducts, setAvailableProducts] = useState<CatalogItem[]>([]);
  const [availableServices, setAvailableServices] = useState<CatalogItem[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);

  // ─── Load data ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [needsRes, fieldsRes, templatesRes, settingsRes] = await Promise.all([
        supabase.from("deal_needs").select("id, deal_id, title, description, priority, status, internal_notes, initial_estimate, estimate_min, estimate_max, attachments, custom_fields, measurement_values, template_id, sort_order, created_at, category_id, category_name, technical_notes, measurements, checklist").eq("deal_id", dealId).order("sort_order"),
        organizationId
          ? supabase.from("needs_assessment_field_configs").select("id, name, field_type, options, is_required, sort_order").eq("organization_id", organizationId).eq("is_active", true).order("sort_order")
          : Promise.resolve({ data: [] }),
        organizationId
          ? supabase.from("needs_assessment_templates").select("id, name, description, show_measurements_tab, show_items_tab, icon, color, sector, default_priority, estimate_min, estimate_max, checklist, measurement_field_ids, needs_assessment_template_fields(field_config_id)").eq("organization_id", organizationId).eq("is_active", true)
          : Promise.resolve({ data: [] }),
        organizationId
          ? supabase.from("needs_assessment_settings").select("show_measurements_tab, show_items_tab, measurement_fields").eq("organization_id", organizationId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const mappedNeeds = (needsRes.data || []).map((n: any) => ({
        ...n,
        measurements: (typeof n.measurements === 'object' && n.measurements !== null ? n.measurements : {}) as Record<string, number>,
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
        custom_fields: (Array.isArray(n.custom_fields) ? n.custom_fields : []) as unknown as CustomFieldValue[],
        measurement_values: (Array.isArray(n.measurement_values) ? n.measurement_values : []) as unknown as MeasurementValue[],
        status: n.status || 'pendente',
        internal_notes: n.internal_notes || null,
        estimate_min: n.estimate_min || 0,
        estimate_max: n.estimate_max || 0,
        checklist: (Array.isArray(n.checklist) ? n.checklist : []) as { text: string; checked: boolean; value?: string }[],
      }));

      setNeeds(mappedNeeds);
      setCompanyFields((fieldsRes.data || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] })));
      setCompanyTemplates((templatesRes.data || []).map((t: any) => ({
        ...t,
        fieldIds: (t.needs_assessment_template_fields || []).map((tf: any) => tf.field_config_id),
        icon: t.icon || 'briefcase',
        color: t.color || 'default',
        sector: t.sector || null,
        default_priority: t.default_priority || 'media',
        estimate_min: t.estimate_min || 0,
        estimate_max: t.estimate_max || 0,
        checklist: Array.isArray(t.checklist) ? t.checklist : [],
        measurement_field_ids: Array.isArray(t.measurement_field_ids) ? t.measurement_field_ids : [],
      })));

      if (settingsRes.data) {
        setOrgSettings({
          show_measurements_tab: settingsRes.data.show_measurements_tab ?? false,
          show_items_tab: settingsRes.data.show_items_tab ?? true,
          measurement_fields: Array.isArray(settingsRes.data.measurement_fields) ? settingsRes.data.measurement_fields as MeasurementFieldDef[] : [],
        });
      }

      // Load items
      if (mappedNeeds.length > 0) {
        const needIds = mappedNeeds.map((n: any) => n.id);
        const { data: items } = await supabase.from("deal_need_items").select("id, deal_need_id, product_id, service_id, item_type, quantity, notes").in("deal_need_id", needIds);
        if (items && items.length > 0) {
          const productIds = items.filter(i => i.product_id).map(i => i.product_id!);
          const serviceIds = items.filter(i => i.service_id).map(i => i.service_id!);
          const [productsRes, servicesRes, productPricesRes, servicePricesRes] = await Promise.all([
            productIds.length > 0 ? supabase.from("products").select("id, name").in("id", productIds) : { data: [] },
            serviceIds.length > 0 ? supabase.from("services").select("id, name").in("id", serviceIds) : { data: [] },
            productIds.length > 0 ? supabase.from("product_prices").select("product_id, price, price_type").in("product_id", productIds).eq("price_type", "retail") : { data: [] },
            serviceIds.length > 0 ? supabase.from("service_prices").select("service_id, price, price_type").in("service_id", serviceIds).eq("price_type", "retail") : { data: [] },
          ]);
          const productMap = new Map((productsRes.data || []).map((p: any) => [p.id, p.name]));
          const serviceMap = new Map((servicesRes.data || []).map((s: any) => [s.id, s.name]));
          const productPriceMap = new Map((productPricesRes.data || []).map((pp: any) => [pp.product_id, pp.price]));
          const servicePriceMap = new Map((servicePricesRes.data || []).map((sp: any) => [sp.service_id, sp.price]));
          const grouped: Record<string, DealNeedItem[]> = {};
          items.forEach(item => {
            const mapped: DealNeedItem = {
              ...item,
              product_name: item.product_id ? productMap.get(item.product_id) : undefined,
              service_name: item.service_id ? serviceMap.get(item.service_id) : undefined,
              unit_price: item.product_id ? productPriceMap.get(item.product_id) : item.service_id ? servicePriceMap.get(item.service_id) : undefined,
            };
            if (!grouped[item.deal_need_id]) grouped[item.deal_need_id] = [];
            grouped[item.deal_need_id].push(mapped);
          });
          setNeedItems(grouped);
        } else {
          setNeedItems({});
        }
      }
    } catch (err: any) {
      console.error("Error loading deal needs:", err);
    } finally {
      setLoading(false);
    }
  }, [dealId, organizationId]);

  useEffect(() => { if (dealId) loadData(); }, [dealId, loadData]);

  // ─── Helpers ────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpandedNeeds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const updateTabVisibility = (templateId: string | null) => {
    if (templateId) {
      const tpl = companyTemplates.find(t => t.id === templateId);
      if (tpl) {
        setShowMeasurements(tpl.show_measurements_tab !== null ? tpl.show_measurements_tab : orgSettings.show_measurements_tab);
        setShowItems(tpl.show_items_tab !== null ? tpl.show_items_tab : orgSettings.show_items_tab);
        setActiveFieldIds(tpl.fieldIds);
        setShowCustomFields(tpl.fieldIds.length > 0);
        return;
      }
    }
    setShowMeasurements(orgSettings.show_measurements_tab);
    setShowItems(orgSettings.show_items_tab);
    setActiveFieldIds(companyFields.map(f => f.id));
    setShowCustomFields(companyFields.length > 0);
  };

  const resetForm = () => {
    setFormTitle(""); setFormDescription(""); setFormPriority("media"); setFormStatus("pendente");
    setFormEstimateMin(""); setFormEstimateMax(""); setFormInternalNotes("");
    setFormTemplateId(null); setFormFieldValues({}); setFormMeasurements({});
    setLinkedItems([]); setFormChecklist([]);
    updateTabVisibility(null);
  };

  const openCreateDialog = () => {
    setEditingNeed(null);
    resetForm();
    if (companyTemplates.length > 0) {
      setTemplatePickerOpen(true);
    } else {
      updateTabVisibility(null);
      setDialogOpen(true);
    }
  };

  const openCreateBlank = () => {
    setTemplatePickerOpen(false);
    updateTabVisibility(null);
    setDialogOpen(true);
  };

  const openCreateWithTemplate = (templateId: string) => {
    const tpl = companyTemplates.find(t => t.id === templateId);
    setFormTemplateId(templateId);
    
    // Pre-fill template default values
    if (tpl) {
      if (tpl.default_priority) setFormPriority(tpl.default_priority);
      if (tpl.estimate_min) setFormEstimateMin(tpl.estimate_min.toString());
      if (tpl.estimate_max) setFormEstimateMax(tpl.estimate_max.toString());
      // Pre-fill checklist from template
      if (tpl.checklist && tpl.checklist.length > 0) {
        setFormChecklist(tpl.checklist.map(item => ({ text: item, checked: false })));
      }
    }
    
    updateTabVisibility(templateId);
    setTemplatePickerOpen(false);
    setDialogOpen(true);
  };

  const openEditDialog = (need: DealNeed) => {
    setEditingNeed(need);
    setFormTitle(need.title);
    setFormDescription(need.description || "");
    setFormPriority(need.priority);
    setFormStatus(need.status || "pendente");
    setFormEstimateMin(need.estimate_min?.toString() || "");
    setFormEstimateMax(need.estimate_max?.toString() || "");
    setFormInternalNotes(need.internal_notes || "");
    setFormTemplateId(need.template_id);

    const vals: Record<string, string> = {};
    (need.custom_fields || []).forEach(cf => { vals[cf.field_config_id] = cf.value; });
    setFormFieldValues(vals);

    const mVals: Record<string, string> = {};
    (need.measurement_values || []).forEach(mv => { mVals[mv.field_id] = mv.value.toString(); });
    setFormMeasurements(mVals);

    updateTabVisibility(need.template_id);
    setLinkedItems(needItems[need.id] || []);
    setFormChecklist(need.checklist || []);
    setDialogOpen(true);
  };

  // ─── Item search ────────────────────────────────────────
  const searchItems = useCallback(async (query: string) => {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.length === 0) {
      setAvailableProducts([]);
      setAvailableServices([]);
      return;
    }

    setSearchingItems(true);
    try {
      // Build org scope: active org + descendants
      const orgIds: string[] = [organizationId];
      try {
        const { data: children } = await supabase
          .from("anew_hierarchy")
          .select("child_org_id")
          .eq("parent_org_id", organizationId);
        if (children) {
          for (const c of children) {
            if (c.child_org_id && !orgIds.includes(c.child_org_id)) {
              orgIds.push(c.child_org_id);
            }
          }
        }
      } catch (_) { /* ignore hierarchy errors */ }

      const orgFilter = orgIds.map(id => `organization_id.eq.${id}`).join(',');

      let pQuery = supabase
        .from("products")
        .select("id, name, sku, product_prices(price, price_type)")
        .or(orgFilter)
        .eq("is_active", true)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(200);

      let sQuery = supabase
        .from("services")
        .select("id, name, sku, service_prices(price, price_type)")
        .or(orgFilter)
        .eq("is_active", true)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(200);

      const [pRes, sRes] = await Promise.all([pQuery, sQuery]);
      setAvailableProducts((pRes.data || []).map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku,
        price: p.product_prices?.find((pp: any) => pp.price_type === 'retail')?.price ?? p.product_prices?.[0]?.price,
      })));
      setAvailableServices((sRes.data || []).map((s: any) => ({
        id: s.id, name: s.name, sku: s.sku,
        price: s.service_prices?.find((sp: any) => sp.price_type === 'retail')?.price ?? s.service_prices?.[0]?.price,
      })));
    } catch (err) { console.error("Search error:", err); }
    finally { setSearchingItems(false); }
  }, [organizationId]);

  useEffect(() => { if (itemPickerOpen) searchItems(itemSearch); }, [itemPickerOpen, itemSearch, searchItems]);

  const linkItem = (item: CatalogItem, type: 'product' | 'service') => {
    if (linkedItems.some(li => (type === 'product' && li.product_id === item.id) || (type === 'service' && li.service_id === item.id))) return;
    setLinkedItems(prev => [...prev, {
      id: `temp-${Date.now()}`, deal_need_id: editingNeed?.id || "", product_id: type === 'product' ? item.id : null,
      service_id: type === 'service' ? item.id : null, item_type: type, quantity: 1, notes: null,
      product_name: type === 'product' ? item.name : undefined, service_name: type === 'service' ? item.name : undefined, unit_price: item.price,
    }]);
  };

  const unlinkItem = (index: number) => setLinkedItems(prev => prev.filter((_, i) => i !== index));
  const updateItemQuantity = (index: number, qty: number) => setLinkedItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(1, qty) } : item));

  // ─── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!formTitle.trim()) {
      toast({ title: "Erro", description: "O título é obrigatório.", variant: "destructive" });
      return;
    }
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const customFieldsArray: CustomFieldValue[] = activeFieldIds
        .filter(fid => formFieldValues[fid])
        .map(fid => ({ field_config_id: fid, value: formFieldValues[fid] }));

      const measurementValuesArray: MeasurementValue[] = Object.entries(formMeasurements)
        .filter(([, v]) => v && parseFloat(v) > 0)
        .map(([fieldId, value]) => ({ field_id: fieldId, value: parseFloat(value) }));

      const needData = {
        deal_id: dealId,
        title: formTitle.trim(),
        description: formDescription || null,
        priority: formPriority,
        status: formStatus,
        internal_notes: formInternalNotes || null,
        initial_estimate: parseFloat(formEstimateMin) || 0,
        estimate_min: parseFloat(formEstimateMin) || 0,
        estimate_max: parseFloat(formEstimateMax) || 0,
        template_id: formTemplateId,
        custom_fields: customFieldsArray as unknown as any,
        measurement_values: measurementValuesArray as unknown as any,
        checklist: formChecklist as unknown as any,
        created_by: businessUserId,
        category_id: editingNeed?.category_id || null,
        category_name: editingNeed?.category_name || null,
        technical_notes: editingNeed?.technical_notes || null,
        measurements: editingNeed?.measurements || {},
      };

      let needId: string;
      if (editingNeed) {
        const { error } = await supabase.from("deal_needs").update(needData).eq("id", editingNeed.id);
        if (error) throw error;
        needId = editingNeed.id;
        await supabase.from("deal_need_items").delete().eq("deal_need_id", needId);
      } else {
        const { data: newNeed, error } = await supabase.from("deal_needs")
          .insert({ ...needData, sort_order: needs.length }).select("id").single();
        if (error) throw error;
        needId = newNeed.id;
      }

      if (linkedItems.length > 0) {
        const itemsToInsert = linkedItems.map((li, idx) => ({
          deal_need_id: needId, product_id: li.product_id, service_id: li.service_id,
          item_type: li.item_type, quantity: li.quantity, notes: li.notes, sort_order: idx,
        }));
        await supabase.from("deal_need_items").insert(itemsToInsert);
      }

      toast({ title: editingNeed ? "Necessidade atualizada" : "Necessidade adicionada" });
      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirmDelete = async () => {
    const idToDelete = pendingDeleteId;
    if (!idToDelete) return;
    setPendingDeleteId(null);
    try {
      await supabase.from("deal_need_items").delete().eq("deal_need_id", idToDelete);
      const { error } = await supabase.from("deal_needs").delete().eq("id", idToDelete);
      if (error) throw error;
      toast({ title: "Necessidade removida" });
      loadData();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  // ─── Value helpers ──────────────────────────────────────
  const calcItemsTotal = (items: DealNeedItem[]) => items.reduce((sum, i) => sum + (i.unit_price || 0) * i.quantity, 0);
  const calcNeedValue = (need: DealNeed) => {
    const items = needItems[need.id] || [];
    const itemsTotal = calcItemsTotal(items);
    return itemsTotal > 0 ? itemsTotal : (need.initial_estimate || 0);
  };
  const totalEstimate = needs.reduce((sum, n) => sum + calcNeedValue(n), 0);
  const formatCurrency = (v: number) => {
    const fixed = Math.abs(v).toFixed(2);
    const [int, dec] = fixed.split('.');
    return '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const getFieldById = (id: string) => companyFields.find(f => f.id === id);

  // ─── Config CRUD functions ─────────────────────────────
  const cfgSaveSettings = async (newSettings: Partial<OrgSettings>) => {
    if (!organizationId) return;
    const merged = { ...orgSettings, ...newSettings };
    setOrgSettings(merged);
    try {
      const payload = { show_measurements_tab: merged.show_measurements_tab, show_items_tab: merged.show_items_tab, measurement_fields: merged.measurement_fields as unknown as any, updated_at: new Date().toISOString() };
      const { data: existing } = await supabase.from("needs_assessment_settings").select("id").eq("organization_id", organizationId).maybeSingle();
      if (existing) { await supabase.from("needs_assessment_settings").update(payload).eq("organization_id", organizationId); }
      else { await supabase.from("needs_assessment_settings").insert([{ organization_id: organizationId, ...payload }]); }
    } catch (err: any) { toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" }); }
  };

  const cfgOpenFieldDialog = (field?: FieldConfig) => {
    if (field) { setCfgEditingField(field); setCfgFieldName(field.name); setCfgFieldType(field.field_type); setCfgFieldOptions(field.options.join(", ")); setCfgFieldRequired(field.is_required); }
    else { setCfgEditingField(null); setCfgFieldName(""); setCfgFieldType("text"); setCfgFieldOptions(""); setCfgFieldRequired(false); }
    setCfgFieldDialogOpen(true);
  };

  const cfgSaveField = async () => {
    if (!cfgFieldName.trim() || !organizationId) return;
    const options = cfgFieldType === "dropdown" ? cfgFieldOptions.split(",").map(o => o.trim()).filter(Boolean) : [];
    try {
      if (cfgEditingField) { await supabase.from("needs_assessment_field_configs").update({ name: cfgFieldName.trim(), field_type: cfgFieldType, options, is_required: cfgFieldRequired, updated_at: new Date().toISOString() }).eq("id", cfgEditingField.id); }
      else { await supabase.from("needs_assessment_field_configs").insert({ organization_id: organizationId, name: cfgFieldName.trim(), field_type: cfgFieldType, options, is_required: cfgFieldRequired, sort_order: companyFields.length }); }
      toast({ title: cfgEditingField ? "Campo atualizado" : "Campo criado" });
      setCfgFieldDialogOpen(false);
      loadData();
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };

  const cfgDeleteField = async (id: string) => {
    try { await supabase.from("needs_assessment_field_configs").delete().eq("id", id); toast({ title: "Campo eliminado" }); loadData(); }
    catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };

  const cfgOpenMeasurementDialog = (index?: number) => {
    if (index !== undefined) { const mf = orgSettings.measurement_fields[index]; setCfgEditingMeasurementIndex(index); setCfgMeasurementName(mf.name); setCfgMeasurementUnit(mf.unit); }
    else { setCfgEditingMeasurementIndex(null); setCfgMeasurementName(""); setCfgMeasurementUnit("m²"); }
    setCfgMeasurementDialogOpen(true);
  };

  const cfgSaveMeasurementField = () => {
    if (!cfgMeasurementName.trim()) return;
    const newFields = [...orgSettings.measurement_fields];
    const entry: MeasurementFieldDef = { id: cfgEditingMeasurementIndex !== null ? newFields[cfgEditingMeasurementIndex].id : `mf-${Date.now()}`, name: cfgMeasurementName.trim(), unit: cfgMeasurementUnit.trim() || "un" };
    if (cfgEditingMeasurementIndex !== null) newFields[cfgEditingMeasurementIndex] = entry; else newFields.push(entry);
    cfgSaveSettings({ measurement_fields: newFields });
    setCfgMeasurementDialogOpen(false);
  };

  const cfgDeleteMeasurementField = (index: number) => { cfgSaveSettings({ measurement_fields: orgSettings.measurement_fields.filter((_, i) => i !== index) }); };

  const cfgOpenTemplateDialog = (template?: Template) => {
    if (template) {
      setCfgEditingTemplate(template); setCfgTemplateName(template.name); setCfgTemplateDescription(template.description || "");
      setCfgTemplateFieldIds(new Set(template.fieldIds)); setCfgTemplateShowMeasurements(template.show_measurements_tab); setCfgTemplateShowItems(template.show_items_tab);
      setCfgTemplateIcon(template.icon || "briefcase"); setCfgTemplateColor(template.color || "default"); setCfgTemplateSector(template.sector || "");
      setCfgTemplateDefaultPriority(template.default_priority || "media"); setCfgTemplateMeasurementFieldIds(new Set(template.measurement_field_ids || []));
      setCfgTemplateEstimateMin(template.estimate_min ? template.estimate_min.toString() : ""); setCfgTemplateEstimateMax(template.estimate_max ? template.estimate_max.toString() : ""); setCfgTemplateChecklist(template.checklist || []); setCfgTemplateNewChecklistItem("");
      setCfgShowPresets(false);
    } else {
      setCfgEditingTemplate(null); setCfgTemplateName(""); setCfgTemplateDescription("");
      setCfgTemplateFieldIds(new Set()); setCfgTemplateShowMeasurements(null); setCfgTemplateShowItems(null);
      setCfgTemplateIcon("briefcase"); setCfgTemplateColor("default"); setCfgTemplateSector("");
      setCfgTemplateDefaultPriority("media"); setCfgTemplateMeasurementFieldIds(new Set());
      setCfgTemplateEstimateMin(""); setCfgTemplateEstimateMax(""); setCfgTemplateChecklist([]); setCfgTemplateNewChecklistItem("");
      setCfgShowPresets(true); setCfgPresetSearch("");
    }
    setCfgTemplateDialogOpen(true);
  };

  const cfgSaveTemplate = async () => {
    if (!cfgTemplateName.trim() || !organizationId) return;
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      let templateId: string;
      if (cfgEditingTemplate) {
        await supabase.from("needs_assessment_templates").update({ name: cfgTemplateName.trim(), description: cfgTemplateDescription || null, show_measurements_tab: cfgTemplateShowMeasurements, show_items_tab: cfgTemplateShowItems, icon: cfgTemplateIcon, color: cfgTemplateColor, sector: cfgTemplateSector || null, default_priority: cfgTemplateDefaultPriority, estimate_min: parseFloat(cfgTemplateEstimateMin) || 0, estimate_max: parseFloat(cfgTemplateEstimateMax) || 0, checklist: cfgTemplateChecklist as unknown as any, measurement_field_ids: Array.from(cfgTemplateMeasurementFieldIds) as unknown as any, updated_at: new Date().toISOString() } as any).eq("id", cfgEditingTemplate.id);
        templateId = cfgEditingTemplate.id;
        await supabase.from("needs_assessment_template_fields").delete().eq("template_id", templateId);
      } else {
        const { data, error } = await supabase.from("needs_assessment_templates").insert({ organization_id: organizationId, name: cfgTemplateName.trim(), description: cfgTemplateDescription || null, created_by: businessUserId, show_measurements_tab: cfgTemplateShowMeasurements, show_items_tab: cfgTemplateShowItems, icon: cfgTemplateIcon, color: cfgTemplateColor, sector: cfgTemplateSector || null, default_priority: cfgTemplateDefaultPriority, estimate_min: parseFloat(cfgTemplateEstimateMin) || 0, estimate_max: parseFloat(cfgTemplateEstimateMax) || 0, checklist: cfgTemplateChecklist as unknown as any, measurement_field_ids: Array.from(cfgTemplateMeasurementFieldIds) as unknown as any } as any).select("id").single();
        if (error) throw error;
        templateId = data.id;
      }
      if (cfgTemplateFieldIds.size > 0) {
        const rows = Array.from(cfgTemplateFieldIds).map((fid, idx) => ({ template_id: templateId, field_id: fid, sort_order: idx }));
        await supabase.from("needs_assessment_template_fields").insert(rows);
      }
      toast({ title: cfgEditingTemplate ? "Template atualizado" : "Template criado" });
      setCfgTemplateDialogOpen(false);
      loadData();
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };

  const cfgDeleteTemplate = async (id: string) => {
    try { await supabase.from("needs_assessment_templates").delete().eq("id", id); toast({ title: "Template eliminado" }); loadData(); }
    catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };
  // ─── Render helpers ─────────────────────────────────────
  const renderCustomFieldInput = (field: FieldConfig) => {
    const value = formFieldValues[field.id] || "";
    const onChange = (val: string) => setFormFieldValues(prev => ({ ...prev, [field.id]: val }));

    switch (field.field_type) {
      case "text":
        return <Input value={value} onChange={e => onChange(e.target.value)} placeholder={`Inserir ${field.name.toLowerCase()}...`} />;
      case "number":
        return <Input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} placeholder="0" />;
      case "textarea":
        return <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={`Inserir ${field.name.toLowerCase()}...`} rows={2} />;
      case "dropdown":
        return (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "date":
        return <Input type="date" value={value} onChange={e => onChange(e.target.value)} />;
      case "checkbox":
        return (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox checked={value === "true"} onCheckedChange={c => onChange(c ? "true" : "false")} />
            <span className="text-sm">Sim</span>
          </div>
        );
      default:
        return <Input value={value} onChange={e => onChange(e.target.value)} />;
    }
  };

  // Count visible tabs
  const tabCount = 1 + (showCustomFields ? 1 : 0) + (showMeasurements ? 1 : 0) + (showItems ? 1 : 0);

  // ─── LOADING ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Levantamento de Necessidades
          </h3>
        </div>
        <div className="animate-pulse space-y-2">
          {[1, 2].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  // ─── RENDER ─────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Levantamento de Necessidades
          {needs.length > 0 && <Badge variant="secondary" className="ml-1">{needs.length}</Badge>}
        </h3>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfigDialogOpen(true)} className="h-8 w-8 p-0" title="Configurar Levantamento">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {needs.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Estimativa total: <strong className="text-foreground">{formatCurrency(totalEstimate)}</strong></span>
          <span>•</span>
          <span>Alta: {needs.filter(n => n.priority === 'alta').length}</span>
          <span>Média: {needs.filter(n => n.priority === 'media').length}</span>
          <span>Baixa: {needs.filter(n => n.priority === 'baixa').length}</span>
        </div>
      )}

      {/* Empty state */}
      {needs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma necessidade registada</p>
            {!readOnly && (
              <Button size="sm" variant="link" onClick={openCreateDialog} className="mt-2">
                <Plus className="h-3.5 w-3.5 mr-1" /> Registar primeira necessidade
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {needs.map((need) => {
            const isExpanded = expandedNeeds.has(need.id);
            const pConfig = priorityConfig[need.priority as keyof typeof priorityConfig] || priorityConfig.media;
            const sConfig = statusConfig[need.status] || statusConfig.pendente;
            const items = needItems[need.id] || [];
            const customFieldValues = need.custom_fields || [];
            const measurementVals = need.measurement_values || [];

            return (
              <Card key={need.id} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(need.id)}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center gap-3 flex-1 min-w-0" role="button">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{need.title}</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", pConfig.color)}>{pConfig.label}</Badge>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", sConfig.color)}>{sConfig.label}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {(() => {
                              const itemsTotal = calcItemsTotal(items);
                              const hasRange = need.estimate_min > 0 || need.estimate_max > 0;
                              const displayValue = itemsTotal > 0 ? itemsTotal : need.initial_estimate;
                              return (
                                <>
                                  {displayValue > 0 && (
                                    <span className="flex items-center gap-0.5">
                                      <Euro className="h-3 w-3" /> {formatCurrency(displayValue)}
                                      {itemsTotal > 0 && need.initial_estimate > 0 && itemsTotal !== need.initial_estimate && (
                                        <span className="text-[10px] line-through opacity-50">{formatCurrency(need.initial_estimate)}</span>
                                      )}
                                    </span>
                                  )}
                                  {hasRange && displayValue === 0 && (
                                    <span className="flex items-center gap-0.5">
                                      <Euro className="h-3 w-3" />
                                      {need.estimate_min > 0 && need.estimate_max > 0
                                        ? `${formatCurrency(need.estimate_min)} — ${formatCurrency(need.estimate_max)}`
                                        : need.estimate_min > 0 ? `desde ${formatCurrency(need.estimate_min)}` : `até ${formatCurrency(need.estimate_max)}`}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                            {items.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Link2 className="h-3 w-3" /> {items.length} {items.length === 1 ? 'item' : 'itens'}
                              </span>
                            )}
                            {measurementVals.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Ruler className="h-3 w-3" /> {measurementVals.length} medições
                              </span>
                            )}
                            {customFieldValues.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Settings2 className="h-3 w-3" /> {customFieldValues.length} campos
                              </span>
                            )}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CollapsibleTrigger>
                    {!readOnly && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(need)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPendingDeleteId(need.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                  <CollapsibleContent>
                    <Separator />
                    <div className="p-3 space-y-3 bg-muted/20">
                      {need.description && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{need.description}</p>
                        </div>
                      )}
                      {need.internal_notes && (
                        <div className="p-2 rounded-md bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30">
                          <label className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <EyeOff className="h-3 w-3" /> Notas Internas
                          </label>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap text-amber-800 dark:text-amber-300">{need.internal_notes}</p>
                        </div>
                      )}
                      {/* Measurements display */}
                      {measurementVals.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Ruler className="h-3 w-3" /> Medições</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {measurementVals.map(mv => {
                              const mfDef = orgSettings.measurement_fields.find(mf => mf.id === mv.field_id);
                              return (
                                <Badge key={mv.field_id} variant="outline">
                                  {mfDef?.name || mv.field_id}: {mv.value} {mfDef?.unit || ''}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Legacy measurements */}
                      {need.technical_notes && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Notas Técnicas</label>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{need.technical_notes}</p>
                        </div>
                      )}
                      {need.measurements && Object.values(need.measurements).some(v => v && Number(v) > 0) && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Medições (legado)</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(need.measurements).filter(([, v]) => v && Number(v) > 0).map(([key, val]) => (
                              <Badge key={key} variant="outline">{key}: {val}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Custom fields display */}
                      {customFieldValues.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Settings2 className="h-3 w-3" /> Campos Personalizados
                          </label>
                          <div className="mt-1 space-y-1">
                            {customFieldValues.map(cf => {
                              const fieldDef = getFieldById(cf.field_config_id);
                              return (
                                <div key={cf.field_config_id} className="flex items-start gap-2 text-sm">
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <div>
                                    <span className="font-medium text-xs text-muted-foreground">{fieldDef?.name || cf.field_config_id}:</span>
                                    <span className="ml-1">{cf.value || <span className="text-muted-foreground italic">—</span>}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Linked items */}
                      {items.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Link2 className="h-3 w-3" /> Produtos/Serviços</label>
                          <div className="mt-1 space-y-1">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center gap-2 text-sm">
                                {item.item_type === 'product' ? <Package className="h-3.5 w-3.5 text-primary" /> : <Wrench className="h-3.5 w-3.5 text-accent-foreground" />}
                                <span>{item.product_name || item.service_name || 'Item'}</span>
                                {item.quantity > 1 && <Badge variant="secondary" className="text-[10px]">x{item.quantity}</Badge>}
                                {item.unit_price != null && <span className="text-xs text-muted-foreground">{formatCurrency(item.unit_price * item.quantity)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Template Picker Dialog ─── */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Necessidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={openCreateBlank}>
              <Plus className="h-4 w-4 mr-2 text-primary" />
              <div className="text-left">
                <span className="text-sm font-medium">Em branco</span>
                <p className="text-xs text-muted-foreground">Campos universais{companyFields.length > 0 ? ` + ${companyFields.length} campos da empresa` : ''}</p>
              </div>
            </Button>
            {companyTemplates.map(tpl => {
              const IconComp = getTemplateIcon(tpl.icon || 'briefcase');
              const colorObj = TEMPLATE_COLORS.find(c => c.value === (tpl.color || 'default'));
              return (
                <Button key={tpl.id} variant="outline" className="w-full justify-start h-auto py-3" onClick={() => openCreateWithTemplate(tpl.id)}>
                  <div className={cn("h-8 w-8 rounded-md flex items-center justify-center mr-3 shrink-0", colorObj?.class || "bg-primary")}>
                    <IconComp className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-medium">{tpl.name}</span>
                    {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
                    <div className="flex gap-1 mt-0.5">
                      {tpl.fieldIds.length > 0 && <Badge variant="secondary" className="text-[9px]">{tpl.fieldIds.length} campos</Badge>}
                      {tpl.show_measurements_tab === true && <Badge variant="secondary" className="text-[9px]">Medições</Badge>}
                      {tpl.show_items_tab === true && <Badge variant="secondary" className="text-[9px]">Itens</Badge>}
                      {tpl.sector && <Badge variant="outline" className="text-[9px]">{tpl.sector}</Badge>}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Create/Edit Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                {editingNeed ? "Editar Necessidade" : "Nova Necessidade"}
              </DialogTitle>
              {formTemplateId && (() => {
                const tpl = companyTemplates.find(t => t.id === formTemplateId);
                return tpl ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <FileText className="h-3 w-3" /> Template: {tpl.name}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive" onClick={() => { setFormTemplateId(null); updateTabVisibility(null); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null;
              })()}
            </DialogHeader>
          </div>

          <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3">
              <TabsList className={cn("grid w-full h-9", `grid-cols-${tabCount}`)}>
                <TabsTrigger value="details" className="text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Detalhes
                </TabsTrigger>
                {showCustomFields && (
                  <TabsTrigger value="custom" className="text-xs gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" /> Campos
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center">{activeFieldIds.length}</Badge>
                  </TabsTrigger>
                )}
                {showMeasurements && (
                  <TabsTrigger value="measurements" className="text-xs gap-1.5">
                    <Ruler className="h-3.5 w-3.5" /> Medições
                    {Object.values(formMeasurements).filter(v => v && parseFloat(v) > 0).length > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center">
                        {Object.values(formMeasurements).filter(v => v && parseFloat(v) > 0).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {showItems && (
                  <TabsTrigger value="items" className="text-xs gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Itens
                    {linkedItems.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center">{linkedItems.length}</Badge>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">

              {/* ─── Tab: Details ─── */}
              <TabsContent value="details" className="space-y-5 mt-0">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação</Label>
                    <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder='Ex: "Casa de banho", "Website corporativo", "Consultoria fiscal"' className="h-10 text-sm font-medium" />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classificação</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Prioridade do Cliente</Label>
                      <Select value={formPriority} onValueChange={setFormPriority}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alta"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive" /> Alta</span></SelectItem>
                          <SelectItem value="media"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /> Média</span></SelectItem>
                          <SelectItem value="baixa"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Baixa</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Estado</Label>
                      <Select value={formStatus} onValueChange={setFormStatus}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">⏳ Pendente</SelectItem>
                          <SelectItem value="em_analise">🔍 Em análise</SelectItem>
                          <SelectItem value="orcamentado">✅ Orçamentado</SelectItem>
                          <SelectItem value="cancelado">❌ Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</Label>
                  <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descreva em detalhe o que o cliente pretende..." rows={4} className="resize-none text-sm" />
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Euro className="h-3 w-3" /> Estimativa de Valor
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Mínimo (€)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                        <Input type="number" step="0.01" placeholder="0,00" value={formEstimateMin} onChange={e => setFormEstimateMin(e.target.value)} className="pl-7 h-9" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Máximo (€)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                        <Input type="number" step="0.01" placeholder="0,00" value={formEstimateMax} onChange={e => setFormEstimateMax(e.target.value)} className="pl-7 h-9" />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <EyeOff className="h-3 w-3" /> Notas Internas
                  </Label>
                  <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Visível apenas para a equipa interna
                    </p>
                    <Textarea value={formInternalNotes} onChange={e => setFormInternalNotes(e.target.value)} placeholder="Observações internas..." rows={2} className="resize-none text-sm bg-transparent border-amber-200/40 dark:border-amber-800/30 focus-visible:ring-amber-500/30" />
                  </div>
                </div>

                {/* ─── Checklist (from template) ─── */}
                {formChecklist.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <ClipboardList className="h-3 w-3" /> Checklist / Tarefas
                      </Label>
                      <div className="space-y-2">
                        {formChecklist.map((item, idx) => (
                          <div key={idx} className="space-y-1.5 p-3 rounded-lg border bg-card">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={item.checked}
                                  onCheckedChange={(checked) => {
                                    setFormChecklist(prev => prev.map((ci, i) => i === idx ? { ...ci, checked: !!checked } : ci));
                                  }}
                                />
                                <Label className={cn("text-sm font-medium", item.checked && "line-through text-muted-foreground")}>{item.text}</Label>
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => setFormChecklist(prev => prev.filter((_, i) => i !== idx))}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <Input
                              value={item.value || ""}
                              onChange={(e) => setFormChecklist(prev => prev.map((ci, i) => i === idx ? { ...ci, value: e.target.value } : ci))}
                              placeholder={`Preencher ${item.text.toLowerCase()}...`}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ─── Tab: Custom Fields ─── */}
              {showCustomFields && (
                <TabsContent value="custom" className="space-y-4 mt-0">
                  <div className="rounded-lg border bg-muted/20 p-3 mb-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" />
                      Campos configurados pela sua empresa.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {activeFieldIds.map(fid => {
                      const field = getFieldById(fid);
                      if (!field) return null;
                      const Icon = FIELD_TYPE_ICONS[field.field_type] || Type;
                      return (
                        <div key={fid} className="space-y-1.5 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                          <Label className="flex items-center gap-1.5 text-sm font-medium">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            {field.name}
                            {field.is_required && <span className="text-destructive text-xs">*</span>}
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{field.field_type}</Badge>
                          </Label>
                          {renderCustomFieldInput(field)}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              )}

              {/* ─── Tab: Measurements ─── */}
              {showMeasurements && (
                <TabsContent value="measurements" className="space-y-4 mt-0">
                  <div className="rounded-lg border bg-muted/20 p-3 mb-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Ruler className="h-3.5 w-3.5" />
                      Preencha as medições relevantes para esta necessidade.
                    </p>
                  </div>
                  {orgSettings.measurement_fields.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <Ruler className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Sem campos de medição configurados</p>
                      <p className="text-xs text-muted-foreground">Configure campos em "Configurar Levantamento"</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {orgSettings.measurement_fields.map(mf => (
                        <div key={mf.id} className="space-y-1.5 p-3 rounded-lg border bg-card">
                          <Label className="flex items-center gap-1.5 text-sm font-medium">
                            <Ruler className="h-3.5 w-3.5 text-primary" />
                            {mf.name}
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{mf.unit}</Badge>
                          </Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={formMeasurements[mf.id] || ""}
                            onChange={e => setFormMeasurements(prev => ({ ...prev, [mf.id]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )}

              {/* ─── Tab: Items ─── */}
              {showItems && (
                <TabsContent value="items" className="space-y-4 mt-0">
                  {linkedItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens associados</Label>
                        <span className="text-xs text-muted-foreground font-medium">Total: {formatCurrency(calcItemsTotal(linkedItems))}</span>
                      </div>
                      {linkedItems.map((item, idx) => (
                        <div key={item.id || idx} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                          <div className={cn("h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0", item.item_type === 'product' ? "bg-primary/10" : "bg-accent/50")}>
                            {item.item_type === 'product' ? <Package className="h-4 w-4 text-primary" /> : <Wrench className="h-4 w-4 text-accent-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">{item.product_name || item.service_name}</span>
                            {item.unit_price != null && <span className="text-[11px] text-muted-foreground">{formatCurrency(item.unit_price)} /un</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Input type="number" min={1} value={item.quantity} onChange={e => updateItemQuantity(idx, parseInt(e.target.value) || 1)} className="w-16 h-8 text-xs text-center" />
                            {item.unit_price != null && <span className="text-xs font-medium text-foreground min-w-[60px] text-right">{formatCurrency(item.unit_price * item.quantity)}</span>}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => unlinkItem(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Separator className="my-2" />
                    </div>
                  )}

                  {!itemPickerOpen ? (
                    <Button size="sm" variant="outline" onClick={() => { setItemPickerOpen(true); setItemSearch(""); }} className="w-full h-10 border-dashed gap-2">
                      <Link2 className="h-4 w-4" /> Associar Produto ou Serviço
                    </Button>
                  ) : (
                    <Card className="p-3 space-y-3 border-primary/20 shadow-sm">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Pesquisar produtos ou serviços..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="pl-8 h-9 text-sm" autoFocus />
                      </div>
                      <Tabs value={itemPickerTab} onValueChange={setItemPickerTab}>
                        <TabsList className="grid w-full grid-cols-2 h-8">
                          <TabsTrigger value="products" className="text-xs gap-1"><Package className="h-3 w-3" /> Produtos ({availableProducts.length})</TabsTrigger>
                          <TabsTrigger value="services" className="text-xs gap-1"><Wrench className="h-3 w-3" /> Serviços ({availableServices.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="products" className="mt-2 max-h-48 overflow-y-auto">
                          {searchingItems ? <p className="text-xs text-muted-foreground text-center py-4">A pesquisar...</p>
                            : availableProducts.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto encontrado</p>
                            : <div className="space-y-0.5">{availableProducts.map(p => (
                                <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => linkItem(p, 'product')}>
                                  <Package className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  <span className="text-sm flex-1 truncate">{p.name}</span>
                                  {p.price != null && <span className="text-xs text-muted-foreground">{formatCurrency(p.price)}</span>}
                                  <Plus className="h-3.5 w-3.5 text-primary" />
                                </div>
                              ))}</div>}
                        </TabsContent>
                        <TabsContent value="services" className="mt-2 max-h-48 overflow-y-auto">
                          {searchingItems ? <p className="text-xs text-muted-foreground text-center py-4">A pesquisar...</p>
                            : availableServices.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum serviço encontrado</p>
                            : <div className="space-y-0.5">{availableServices.map(s => (
                                <div key={s.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => linkItem(s, 'service')}>
                                  <Wrench className="h-3.5 w-3.5 text-accent-foreground flex-shrink-0" />
                                  <span className="text-sm flex-1 truncate">{s.name}</span>
                                  {s.price != null && <span className="text-xs text-muted-foreground">{formatCurrency(s.price)}</span>}
                                  <Plus className="h-3.5 w-3.5 text-primary" />
                                </div>
                              ))}</div>}
                        </TabsContent>
                      </Tabs>
                      <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => setItemPickerOpen(false)}>Fechar pesquisa</Button>
                    </Card>
                  )}

                  {linkedItems.length === 0 && !itemPickerOpen && (
                    <div className="text-center py-8 space-y-2">
                      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <Link2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Sem itens associados</p>
                      <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">Associe produtos ou serviços do catálogo para calcular o valor automaticamente.</p>
                    </div>
                  )}
                </TabsContent>
              )}
            </div>

            {/* Fixed footer */}
            <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {linkedItems.length > 0 && <span className="font-medium text-foreground">Valor: {formatCurrency(calcItemsTotal(linkedItems))}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} size="sm">Cancelar</Button>
                <Button onClick={handleSubmit} disabled={!formTitle.trim()} size="sm" className="min-w-[100px]">
                  {editingNeed ? "Guardar" : "Adicionar"}
                </Button>
              </div>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Config Dialog ─── */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Configurar Levantamento de Necessidades
              </DialogTitle>
            </DialogHeader>
          </div>

          <Tabs value={configTab} onValueChange={setConfigTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3">
              <TabsList className="grid w-full grid-cols-3 h-9">
                <TabsTrigger value="tabs" className="text-xs gap-1"><Layers className="h-3 w-3" /> Tabs</TabsTrigger>
                <TabsTrigger value="fields" className="text-xs gap-1"><Type className="h-3 w-3" /> Campos</TabsTrigger>
                <TabsTrigger value="templates" className="text-xs gap-1"><FileText className="h-3 w-3" /> Templates</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* ─── Tabs Visibility ─── */}
              <TabsContent value="tabs" className="space-y-3 mt-0">
                <p className="text-xs text-muted-foreground mb-3">Controle quais separadores aparecem no formulário.</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-primary" />
                      <div><p className="text-sm font-medium">Detalhes</p><p className="text-[10px] text-muted-foreground">Título, descrição, prioridade, estado</p></div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Sempre activo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-2.5">
                      <Settings2 className="h-4 w-4 text-primary" />
                      <div><p className="text-sm font-medium">Campos Custom</p><p className="text-[10px] text-muted-foreground">{companyFields.length > 0 ? `${companyFields.length} campos — visível` : "Sem campos — escondida"}</p></div>
                    </div>
                    <Badge variant={companyFields.length > 0 ? "default" : "outline"} className="text-[10px]">{companyFields.length > 0 ? "Visível" : "Escondida"}</Badge>
                  </div>
                  <div className={cn("flex items-center justify-between p-3 rounded-lg border", orgSettings.show_measurements_tab && "border-primary/30")}>
                    <div className="flex items-center gap-2.5">
                      <Ruler className={cn("h-4 w-4", orgSettings.show_measurements_tab ? "text-primary" : "text-muted-foreground")} />
                      <div><p className="text-sm font-medium">Medições</p><p className="text-[10px] text-muted-foreground">Campos de medição (m², m, kg, etc.)</p></div>
                    </div>
                    <Switch checked={orgSettings.show_measurements_tab} onCheckedChange={v => cfgSaveSettings({ show_measurements_tab: v })} />
                  </div>
                  <div className={cn("flex items-center justify-between p-3 rounded-lg border", orgSettings.show_items_tab && "border-primary/30")}>
                    <div className="flex items-center gap-2.5">
                      <Package className={cn("h-4 w-4", orgSettings.show_items_tab ? "text-primary" : "text-muted-foreground")} />
                      <div><p className="text-sm font-medium">Itens / Produtos e Serviços</p><p className="text-[10px] text-muted-foreground">Pesquisa de produtos e serviços do catálogo</p></div>
                    </div>
                    <Switch checked={orgSettings.show_items_tab} onCheckedChange={v => cfgSaveSettings({ show_items_tab: v })} />
                  </div>
                </div>
              </TabsContent>

              {/* ─── Custom Fields ─── */}
              <TabsContent value="fields" className="space-y-3 mt-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Campos personalizados do levantamento.</p>
                  <Button size="sm" onClick={() => cfgOpenFieldDialog()}><Plus className="h-3.5 w-3.5 mr-1" /> Novo Campo</Button>
                </div>
                {companyFields.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-lg">
                    <Settings2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum campo configurado.</p>
                    <Button size="sm" variant="link" className="mt-2" onClick={() => cfgOpenFieldDialog()}><Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro campo</Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {companyFields.map(field => {
                      const Icon = FIELD_TYPE_ICONS[field.field_type] || Type;
                      return (
                        <div key={field.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                            <div className="min-w-0">
                              <span className="text-sm font-medium">{field.name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{CFG_FIELD_TYPES.find(ft => ft.value === field.field_type)?.label || field.field_type}</Badge>
                                {field.is_required && <Badge variant="outline" className="text-[9px] px-1.5 py-0">Obrigatório</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cfgOpenFieldDialog(field)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cfgDeleteField(field.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>



              {/* ─── Templates ─── */}
              <TabsContent value="templates" className="space-y-3 mt-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Templates pré-carregam campos e definem tabs activas.</p>
                  <Button size="sm" onClick={() => cfgOpenTemplateDialog()}><Plus className="h-3.5 w-3.5 mr-1" /> Novo Template</Button>
                </div>
                {companyTemplates.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-lg">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum template criado.</p>
                    <Button size="sm" variant="link" className="mt-2" onClick={() => cfgOpenTemplateDialog()}><Plus className="h-3.5 w-3.5 mr-1" /> Criar primeiro</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {companyTemplates.map(tpl => {
                      const IconComp = getTemplateIcon(tpl.icon || 'briefcase');
                      const colorObj = TEMPLATE_COLORS.find(c => c.value === (tpl.color || 'default'));
                      return (
                      <div key={tpl.id} className="p-3 rounded-lg border bg-card space-y-2 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => { setConfigDialogOpen(false); setTimeout(() => openCreateWithTemplate(tpl.id), 150); }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", colorObj?.class || "bg-primary")}>
                              <IconComp className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span className="text-sm font-medium">{tpl.name}</span>
                          </div>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cfgOpenTemplateDialog(tpl)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cfgDeleteTemplate(tpl.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
                        <div className="flex flex-wrap gap-1">
                          {tpl.fieldIds.map(fid => { const fc = companyFields.find(f => f.id === fid); return fc ? <Badge key={fid} variant="outline" className="text-[9px]">{fc.name}</Badge> : null; })}
                          {tpl.show_measurements_tab !== null && <Badge variant={tpl.show_measurements_tab ? "default" : "outline"} className="text-[9px]">Medições {tpl.show_measurements_tab ? "ON" : "OFF"}</Badge>}
                          {tpl.show_items_tab !== null && <Badge variant={tpl.show_items_tab ? "default" : "outline"} className="text-[9px]">Itens {tpl.show_items_tab ? "ON" : "OFF"}</Badge>}
                          {tpl.checklist && tpl.checklist.length > 0 && <Badge variant="default" className="text-[9px]">Checklist ({tpl.checklist.length})</Badge>}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ─── Config: Field Dialog ─── */}
      <Dialog open={cfgFieldDialogOpen} onOpenChange={setCfgFieldDialogOpen}>
        <DialogContent className="max-w-md z-[650]">
          <DialogHeader><DialogTitle>{cfgEditingField ? "Editar Campo" : "Novo Campo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={cfgFieldName} onChange={e => setCfgFieldName(e.target.value)} placeholder='Ex: Área m², Tipo de intervenção' /></div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={cfgFieldType} onValueChange={setCfgFieldType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CFG_FIELD_TYPES.map(ft => (<SelectItem key={ft.value} value={ft.value}><div className="flex items-center gap-2"><ft.icon className="h-3.5 w-3.5" /><span>{ft.label}</span></div></SelectItem>))}</SelectContent>
              </Select>
            </div>
            {cfgFieldType === "dropdown" && <div className="space-y-2"><Label>Opções (separadas por vírgula)</Label><Textarea value={cfgFieldOptions} onChange={e => setCfgFieldOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" rows={2} /></div>}
            <div className="flex items-center gap-2"><Switch checked={cfgFieldRequired} onCheckedChange={setCfgFieldRequired} /><Label>Obrigatório</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgFieldDialogOpen(false)}>Cancelar</Button>
            <Button onClick={cfgSaveField} disabled={!cfgFieldName.trim()}><Save className="h-3.5 w-3.5 mr-1" /> {cfgEditingField ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Config: Measurement Dialog ─── */}
      <Dialog open={cfgMeasurementDialogOpen} onOpenChange={setCfgMeasurementDialogOpen}>
        <DialogContent className="max-w-sm z-[650]">
          <DialogHeader><DialogTitle>{cfgEditingMeasurementIndex !== null ? "Editar Medição" : "Novo Campo de Medição"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={cfgMeasurementName} onChange={e => setCfgMeasurementName(e.target.value)} placeholder="Ex: Comprimento, Largura, Área" /></div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={cfgMeasurementUnit} onValueChange={setCfgMeasurementUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["m²", "m", "cm", "kg", "g", "L", "mL", "h", "min", "un", "m³"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgMeasurementDialogOpen(false)}>Cancelar</Button>
            <Button onClick={cfgSaveMeasurementField} disabled={!cfgMeasurementName.trim()}><Save className="h-3.5 w-3.5 mr-1" /> {cfgEditingMeasurementIndex !== null ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Config: Template Dialog ─── */}
      <Dialog open={cfgTemplateDialogOpen} onOpenChange={setCfgTemplateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 z-[650]">
          <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(() => { const TplIcon = getTemplateIcon(cfgTemplateIcon); return <TplIcon className="h-5 w-5 text-primary" />; })()}
                {cfgEditingTemplate ? "Editar Template" : "Novo Template"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Presets section - only for new templates */}
            {!cfgEditingTemplate && cfgShowPresets && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Começar com preset
                  </Label>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setCfgShowPresets(false)}>
                    Criar do zero
                  </Button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Filtrar presets..." value={cfgPresetSearch} onChange={e => setCfgPresetSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                  {TEMPLATE_PRESETS
                    .filter(p => !cfgPresetSearch || p.name.toLowerCase().includes(cfgPresetSearch.toLowerCase()) || p.sector.toLowerCase().includes(cfgPresetSearch.toLowerCase()) || p.desc.toLowerCase().includes(cfgPresetSearch.toLowerCase()))
                    .map(preset => {
                      const PresetIcon = getTemplateIcon(preset.icon);
                      return (
                        <div
                          key={preset.name}
                          className="flex items-start gap-2.5 p-3 rounded-lg border hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                          onClick={() => {
                            setCfgTemplateName(preset.name);
                            setCfgTemplateDescription(preset.desc);
                            setCfgTemplateIcon(preset.icon);
                            setCfgTemplateShowMeasurements(preset.measurements);
                            setCfgTemplateShowItems(preset.items);
                            setCfgTemplateSector(preset.sector);
                            setCfgTemplateDefaultPriority(preset.priority);
                            setCfgTemplateColor(preset.color);
                            setCfgShowPresets(false);
                          }}
                        >
                          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                            <PresetIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{preset.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{preset.desc}</p>
                            <div className="flex gap-1 mt-1.5">
                              <Badge variant="secondary" className="text-[8px] px-1 py-0">{preset.sector}</Badge>
                              {preset.measurements && <Badge variant="outline" className="text-[8px] px-1 py-0">Medições</Badge>}
                              {preset.items && <Badge variant="outline" className="text-[8px] px-1 py-0">Itens</Badge>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Form - shown when presets are hidden or editing */}
            {(!cfgShowPresets || cfgEditingTemplate) && (
              <>
                {/* Icon + Color row */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ícone & Cor</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_ICONS.map(ti => {
                      const TIcon = ti.icon;
                      return (
                        <button
                          key={ti.value}
                          type="button"
                          title={ti.label}
                          className={cn(
                            "h-8 w-8 rounded-md flex items-center justify-center border transition-all",
                            cfgTemplateIcon === ti.value ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          onClick={() => setCfgTemplateIcon(ti.value)}
                        >
                          <TIcon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Cor:</span>
                    {TEMPLATE_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition-all",
                          c.class,
                          cfgTemplateColor === c.value ? "border-foreground scale-110 ring-2 ring-offset-2 ring-primary/30" : "border-transparent opacity-70 hover:opacity-100"
                        )}
                        onClick={() => setCfgTemplateColor(c.value)}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Name, Description, Sector */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>Nome *</Label>
                      <Input value={cfgTemplateName} onChange={e => setCfgTemplateName(e.target.value)} placeholder='Ex: Remodelação, Consultoria, Manutenção' />
                    </div>
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={cfgTemplateSector || "none"} onValueChange={v => setCfgTemplateSector(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Sector..." /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          <SelectItem value="none">Nenhum</SelectItem>
                          {TEMPLATE_SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea value={cfgTemplateDescription} onChange={e => setCfgTemplateDescription(e.target.value)} placeholder="Breve descrição do tipo de levantamento..." rows={2} />
                  </div>
                </div>

                <Separator />

                {/* Defaults: Priority + Estimate range */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valores padrão</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prioridade padrão</Label>
                      <Select value={cfgTemplateDefaultPriority} onValueChange={setCfgTemplateDefaultPriority}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alta">🔴 Alta</SelectItem>
                          <SelectItem value="media">🟡 Média</SelectItem>
                          <SelectItem value="baixa">🟢 Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Euro className="h-3 w-3" /> Est. Mínima</Label>
                      <Input type="number" step="any" placeholder="0" value={cfgTemplateEstimateMin} onChange={e => setCfgTemplateEstimateMin(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Euro className="h-3 w-3" /> Est. Máxima</Label>
                      <Input type="number" step="any" placeholder="0" value={cfgTemplateEstimateMax} onChange={e => setCfgTemplateEstimateMax(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Tabs config */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tabs activas neste template</Label>
                  <p className="text-[10px] text-muted-foreground">"Usar padrão" segue a configuração geral da empresa.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Ruler className="h-3 w-3" /> Medições</Label>
                      <Select value={cfgTemplateShowMeasurements === null ? "default" : cfgTemplateShowMeasurements ? "on" : "off"} onValueChange={v => setCfgTemplateShowMeasurements(v === "default" ? null : v === "on")}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="default">Usar padrão</SelectItem><SelectItem value="on">✅ Activar</SelectItem><SelectItem value="off">❌ Desactivar</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Itens</Label>
                      <Select value={cfgTemplateShowItems === null ? "default" : cfgTemplateShowItems ? "on" : "off"} onValueChange={v => setCfgTemplateShowItems(v === "default" ? null : v === "on")}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="default">Usar padrão</SelectItem><SelectItem value="on">✅ Activar</SelectItem><SelectItem value="off">❌ Desactivar</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Measurement fields selection */}
                {orgSettings.measurement_fields.length > 0 && (cfgTemplateShowMeasurements === true || (cfgTemplateShowMeasurements === null && orgSettings.show_measurements_tab)) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medições incluídas</Label>
                      <p className="text-[10px] text-muted-foreground">Selecione quais campos de medição aparecem neste template. Se nenhum for selecionado, todos os campos da empresa ficam visíveis.</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {orgSettings.measurement_fields.map(mf => (
                          <div key={mf.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-all", cfgTemplateMeasurementFieldIds.has(mf.id) ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50")} onClick={() => setCfgTemplateMeasurementFieldIds(prev => { const n = new Set(prev); if (n.has(mf.id)) n.delete(mf.id); else n.add(mf.id); return n; })}>
                            <Checkbox checked={cfgTemplateMeasurementFieldIds.has(mf.id)} className="pointer-events-none" />
                            <Ruler className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            <span className="text-sm flex-1">{mf.name}</span>
                            <Badge variant="secondary" className="text-[9px]">{mf.unit}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Custom fields */}
                {companyFields.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campos incluídos</Label>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {companyFields.map(f => {
                          const FIcon = FIELD_TYPE_ICONS[f.field_type] || Type;
                          return (
                            <div key={f.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-all", cfgTemplateFieldIds.has(f.id) ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50")} onClick={() => setCfgTemplateFieldIds(prev => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
                              <Checkbox checked={cfgTemplateFieldIds.has(f.id)} className="pointer-events-none" />
                              <FIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <span className="text-sm flex-1">{f.name}</span>
                              <Badge variant="secondary" className="text-[9px]">{CFG_FIELD_TYPES.find(ft => ft.value === f.field_type)?.label || f.field_type}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Checklist / Tasks */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checklist / Tarefas padrão</Label>
                  <p className="text-[10px] text-muted-foreground">Itens que serão pré-preenchidos ao usar este template.</p>
                  {cfgTemplateChecklist.length > 0 && (
                    <div className="space-y-1">
                      {cfgTemplateChecklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                          <Checkbox checked={false} disabled className="pointer-events-none opacity-50" />
                          <span className="text-sm flex-1">{item}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setCfgTemplateChecklist(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={cfgTemplateNewChecklistItem}
                      onChange={e => setCfgTemplateNewChecklistItem(e.target.value)}
                      placeholder="Ex: Verificar local, Tirar fotos, Medir..."
                      className="h-8 text-xs flex-1"
                      onKeyDown={e => {
                        if (e.key === "Enter" && cfgTemplateNewChecklistItem.trim()) {
                          setCfgTemplateChecklist(prev => [...prev, cfgTemplateNewChecklistItem.trim()]);
                          setCfgTemplateNewChecklistItem("");
                        }
                      }}
                    />
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!cfgTemplateNewChecklistItem.trim()} onClick={() => { setCfgTemplateChecklist(prev => [...prev, cfgTemplateNewChecklistItem.trim()]); setCfgTemplateNewChecklistItem(""); }}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  </div>
                </div>

                {!cfgEditingTemplate && (
                  <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={() => { setCfgShowPresets(true); setCfgTemplateName(""); setCfgTemplateDescription(""); }}>
                    <Sparkles className="h-3 w-3" /> Ver presets de sector
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Footer - only when form is visible */}
          {(!cfgShowPresets || cfgEditingTemplate) && (
            <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCfgTemplateDialogOpen(false)}>Cancelar</Button>
              <Button onClick={cfgSaveTemplate} disabled={!cfgTemplateName.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" /> {cfgEditingTemplate ? "Guardar" : "Criar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!pendingDeleteId} onOpenChange={() => setPendingDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar necessidade?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação é irreversível e irá remover a necessidade e todos os itens associados.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
