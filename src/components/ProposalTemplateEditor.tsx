import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Save, Eye, GripVertical, Palette, Type, Layout as LayoutIcon,
  Image, FileText, Settings, Columns, AlignLeft, AlignCenter, AlignRight,
  ChevronDown, ChevronUp, Trash2, Plus, RotateCcw, ImageIcon, Mail, X
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VariableBinding, readBinding, applyBinding } from "@/components/templates/VariableBinding";
import { ItemsTableSettings as ItemsTableSettingsPanel } from "@/components/document-editor";
import {
  DEFAULT_DOCUMENT_TEMPLATE_SETTINGS,
  type ItemsTableSettings as ItemsTableSettingsValue,
} from "@/utils/documentTemplate/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { GalleryPickerDialog } from "@/components/GalleryPickerDialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

// Mock data for preview
const mockProposal = {
  title: "Proposta de Serviços de Marketing Digital",
  description: "Proposta completa para implementação de estratégia de marketing digital incluindo SEO, gestão de redes sociais e campanhas publicitárias.",
  value: 15000,
  valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  notes: "Condições especiais para pagamento antecipado. Desconto de 5% para pagamento a pronto.",
  company: {
    name: "Empresa Exemplo, Lda",
    email: "contacto@empresa.pt",
    phone: "+351 912 345 678",
    address: "Rua da Liberdade, 123 - 1250-001 Lisboa",
    vat_number: "PT123456789",
  },
  client: {
    name: "Cliente Demonstração",
    email: "cliente@demo.pt",
    phone: "+351 987 654 321",
    address: "Av. República, 456 - 4000-001 Porto",
  },
  quotes: [
    {
      id: "1",
      quote_number: "ORC-2024-001",
      total: 8500,
      estado: "aceite",
      items: [
        { name: "Gestão de Redes Sociais", description: "Gestão mensal de 3 redes sociais", quantity: 12, unit_price: 500, total: 6000 },
        { name: "Criação de Conteúdo", description: "Produção de 20 posts/mês", quantity: 1, unit_price: 2500, total: 2500 },
      ]
    },
    {
      id: "2", 
      quote_number: "ORC-2024-002",
      total: 6500,
      estado: "pendente",
      items: [
        { name: "Campanha Google Ads", description: "Setup e gestão mensal", quantity: 6, unit_price: 800, total: 4800 },
        { name: "Consultoria SEO", description: "Auditoria e otimização", quantity: 1, unit_price: 1700, total: 1700 },
      ]
    }
  ]
};

// Section types
interface TemplateSection {
  id: string;
  type: 'header' | 'company_info' | 'client_info' | 'description' | 'value' | 'validity' | 'quotes' | 'quote_items' | 'notes' | 'terms' | 'thank_you' | 'footer' | 'custom';
  label: string;
  visible: boolean;
  settings: Record<string, any>;
}

// Default icons for sections
const sectionIcons: Record<string, string> = {
  company_info: '📍',
  client_info: '👤',
  description: '📄',
  value: '💰',
  validity: '📅',
  quotes: '📋',
  quote_items: '📦',
  notes: '📝',
  terms: '📋',
};

// Default sections
const defaultSections: TemplateSection[] = [
  { id: 'header', type: 'header', label: 'Cabeçalho', visible: true, settings: { layout: 'quote_pdf', showLogo: true, alignment: 'left', showDate: true, customTitle: 'PROPOSTA' } },
  { id: 'client_info', type: 'client_info', label: 'Cliente', visible: true, settings: { layout: 'quote_pdf', showAddress: true, showContacts: true, showIcon: false, customIcon: '', sectionLabel: 'CLIENTE' } },
  { id: 'notes', type: 'notes', label: 'Notas', visible: true, settings: { showTitle: true, showIcon: false, customIcon: '', sectionLabel: 'NOTAS' } },
  { id: 'quote_items', type: 'quote_items', label: 'Detalhes do Orçamento', visible: true, settings: { showDescription: true, showQuantity: true, showUnitPrice: true, tableStyle: 'quote_pdf', showIcon: false, customIcon: '', sectionLabel: 'DETALHES DO ORÇAMENTO' } },
  { id: 'terms', type: 'terms', label: 'Condições Gerais', visible: true, settings: { collapsible: false, showIcon: false, customIcon: '', sectionLabel: 'CONDIÇÕES GERAIS' } },
  { id: 'footer', type: 'footer', label: 'Rodapé', visible: true, settings: { showCompanyName: true } },
  { id: 'company_info', type: 'company_info', label: 'Info da Empresa', visible: false, settings: { layout: 'inline', showVat: true, showAddress: true, showContacts: true, showIcon: true, customIcon: '', sectionLabel: 'Empresa' } },
  { id: 'description', type: 'description', label: 'Descrição do trabalho', visible: false, settings: { showTitle: true, showIcon: true, customIcon: '', sectionLabel: 'Descrição do trabalho' } },
  { id: 'value', type: 'value', label: 'Valor da Proposta', visible: false, settings: { style: 'prominent', showCurrency: true, showIcon: true, customIcon: '', sectionLabel: 'Valor da Proposta' } },
  { id: 'validity', type: 'validity', label: 'Validade', visible: false, settings: { style: 'badge', showIcon: true, customIcon: '', sectionLabel: 'Válida até' } },
  { id: 'quotes', type: 'quotes', label: 'Orçamentos Associados', visible: false, settings: { showStatus: true, showTotal: true, expandItems: true, showIcon: true, customIcon: '', sectionLabel: 'Orçamentos Associados' } },
  { id: 'thank_you', type: 'thank_you', label: 'Agradecimento', visible: false, settings: { alignment: 'center' } },
];

// Default template config
const defaultConfig = {
  // Basic Info
  name: "",
  description: "",
  organization_id: "",
  template_type: "proposal" as "proposal" | "quote",
  is_default: false,
  is_active: true,
  
  // Branding
  logo_url: "",
  favicon_url: "",
  
  // Colors
  primary_color: "#000000",
  secondary_color: "#374151",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  surface_color: "#f3f4f6",
  text_color: "#1f2937",
  text_secondary_color: "#6b7280",
  border_color: "#e5e7eb",
  success_color: "#10b981",
  warning_color: "#f59e0b",
  error_color: "#ef4444",
  
  // Header colors
  header_bg_color: "#ffffff",
  header_text_color: "#000000",
  header_gradient: false,
  header_gradient_to: "#ffffff",
  
  // Quote/Items colors
  quote_header_bg: "#374151",
  quote_header_text: "#ffffff",
  quote_row_alt_bg: "#f9fafb",
  quote_border_color: "#e5e7eb",
  content_block_bg: "#ffffff",
  
  // Status colors
  status_pending_color: "#f59e0b",
  status_accepted_color: "#10b981",
  status_rejected_color: "#ef4444",
  status_sent_color: "#3b82f6",
  
  // Typography
  font_family: "Inter",
  heading_font_family: "Inter",
  font_size_base: 16,
  font_size_heading: 24,
  font_size_subheading: 18,
  font_size_small: 14,
  line_height: 1.6,
  
  // Spacing
  padding_page: 40,
  padding_section: 24,
  padding_card: 20,
  gap_sections: 24,
  border_radius: 0,
  
  // Layout
  max_width: 794,
  header_style: "modern",
  card_style: "elevated",
  table_style: "striped",
  
  // Content
  header_text: "",
  footer_text: "",
  terms_conditions: "1. Este orçamento é válido pelo período indicado.\n2. Os valores apresentados não incluem IVA, salvo indicação em contrário.\n3. O pagamento deve ser efetuado conforme as condições acordadas.",
  thank_you_message: "",
  
  // Email Configuration
  email_subject: "Proposta: {{titulo_proposta}}",
  email_body: `<p>Olá <strong>{{nome_cliente}}</strong>,</p>
<p>Esperamos que esteja tudo bem consigo.</p>
<p>Segue em anexo a proposta <strong>{{titulo_proposta}}</strong> no valor de <strong>{{valor_proposta}}</strong>, válida até <strong>{{validade_proposta}}</strong>.</p>
<p>Para visualizar todos os detalhes da proposta, clique no link abaixo:</p>
<p><a href="{{link_proposta}}">Ver Proposta Completa</a></p>
<p>Estamos à disposição para qualquer esclarecimento adicional.</p>
<p>Com os melhores cumprimentos,<br/>{{nome_utilizador}}<br/>{{nome_empresa}}</p>`,
  
  // Button styles
  accept_button_text: "Aceitar Proposta",
  accept_button_bg: "#10b981",
  accept_button_text_color: "#ffffff",
  reject_button_text: "Recusar",
  reject_button_bg: "#ef4444",
  reject_button_text_color: "#ffffff",
  
  // Accept Options
  accept_enabled: true,
  accept_verification_method: "none" as "none" | "email",
  show_quote_details: true,
  
  // Verification Email Templates
  verification_email_subject: "Código de Verificação - {{titulo_proposta}}",
  verification_email_body: `<p>Olá <strong>{{nome_cliente}}</strong>,</p>
<p>Para confirmar a sua decisão sobre a proposta "<strong>{{titulo_proposta}}</strong>", utilize o seguinte código:</p>
<div style="text-align: center; padding: 20px; background-color: #f3f4f6; border-radius: 8px; margin: 20px 0;">
<span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827;">{{codigo}}</span>
</div>
<p>Este código expira em 15 minutos.</p>
<p>Se não solicitou este código, pode ignorar este email.</p>`,
  
  // Sections
  sections: defaultSections,
};

const designSettingKeys = [
  "header_bg_color", "header_text_color", "header_gradient", "header_gradient_to",
  "surface_color", "text_secondary_color", "border_color",
  "quote_header_bg", "quote_header_text", "quote_row_alt_bg", "quote_border_color", "content_block_bg",
  "status_pending_color", "status_accepted_color", "status_rejected_color", "status_sent_color",
  "font_size_base", "font_size_heading", "font_size_subheading", "font_size_small", "line_height",
  "padding_page", "padding_section", "padding_card", "gap_sections", "border_radius", "max_width",
  "accept_button_text", "accept_button_bg", "accept_button_text_color",
  "reject_button_text", "reject_button_bg", "reject_button_text_color",
] as const;

type ProposalTemplateConfig = typeof defaultConfig;

function getDesignSettings(
  config: ProposalTemplateConfig,
  base?: Record<string, unknown> | null,
) {
  // Merge patch sobre o design_settings original para PRESERVAR chaves
  // geridas por outros adapters (ex: items_table do documentTemplate adapter).
  // Plano §3 — nunca apagar dados existentes em design_settings.
  const preserved = (base && typeof base === "object" && !Array.isArray(base)) ? { ...base } : {};
  const whitelisted = Object.fromEntries(designSettingKeys.map((key) => [key, config[key]]));
  return { ...preserved, ...whitelisted };
}

function parseDesignSettings(value: unknown): Partial<ProposalTemplateConfig> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<ProposalTemplateConfig>)
    : {};
}

// Sortable Section Component
function SortableSection({ section, onUpdate, onRemove }: { 
  section: TemplateSection; 
  onUpdate: (id: string, updates: Partial<TemplateSection>) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasSettings = ['header', 'company_info', 'client_info', 'description', 'value', 'validity', 'quotes', 'quote_items', 'notes', 'terms'].includes(section.type);
  const defaultIcon = sectionIcons[section.type] || '';
  const hasVisibleSectionLabel = ['company_info', 'client_info', 'description', 'value', 'validity', 'quotes', 'quote_items', 'notes', 'terms'].includes(section.type);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`p-3 bg-background border rounded-lg ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab hover:bg-muted p-1 rounded">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Switch
          checked={section.visible}
          onCheckedChange={(v) => onUpdate(section.id, { visible: v })}
        />
        <Input
          value={section.label}
          onChange={(e) => onUpdate(section.id, { label: e.target.value })}
          className={`h-7 flex-1 text-sm ${!section.visible ? 'text-muted-foreground line-through' : ''}`}
          placeholder="Nome da secção"
        />
        {hasSettings && section.visible && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6" 
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
        {section.type === 'custom' && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(section.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {/* Expanded settings */}
      {expanded && section.visible && (
        <div className="mt-3 pl-7 space-y-3 border-t pt-3">
          {/* Header specific settings */}
          {section.type === 'header' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Título Personalizado</Label>
                <Input
                  value={section.settings?.customTitle || ''}
                  onChange={(e) => onUpdate(section.id, { 
                    settings: { ...section.settings, customTitle: e.target.value } 
                  })}
                  placeholder="Usa o título da proposta"
                  className="h-7 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Deixe vazio para usar o título da proposta</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mostrar Logo</span>
                <Switch
                  checked={section.settings?.showLogo !== false}
                  onCheckedChange={(v) => onUpdate(section.id, { 
                    settings: { ...section.settings, showLogo: v } 
                  })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mostrar Data</span>
                <Switch
                  checked={section.settings?.showDate !== false}
                  onCheckedChange={(v) => onUpdate(section.id, { 
                    settings: { ...section.settings, showDate: v } 
                  })}
                />
              </div>
            </>
          )}

          {/* Settings for sections with icons */}
          {defaultIcon && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mostrar Ícone</span>
                <Switch
                  checked={section.settings?.showIcon !== false}
                  onCheckedChange={(v) => onUpdate(section.id, { 
                    settings: { ...section.settings, showIcon: v } 
                  })}
                />
              </div>
              {section.settings?.showIcon !== false && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ícone Personalizado</Label>
                  <Input
                    value={section.settings?.customIcon || ''}
                    onChange={(e) => onUpdate(section.id, { 
                      settings: { ...section.settings, customIcon: e.target.value } 
                    })}
                    placeholder={defaultIcon}
                    className="h-7 text-xs w-16"
                  />
                </div>
              )}
            </>
          )}

          {/* Label customization for sections */}
          {hasVisibleSectionLabel && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Título visível na proposta</Label>
              <Input
                value={section.settings?.sectionLabel ?? section.label}
                onChange={(e) => onUpdate(section.id, { 
                  settings: { ...section.settings, sectionLabel: e.target.value } 
                })}
                className="h-7 text-xs"
              />
            </div>
          )}

          {/* Quote items specific settings */}
          {section.type === 'quote_items' && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Mostrar Preços</span>
              <Switch
                checked={section.settings?.showUnitPrice !== false}
                onCheckedChange={(v) => onUpdate(section.id, { 
                  settings: { ...section.settings, showUnitPrice: v } 
                })}
              />
            </div>
          )}

          {/* Description and notes settings */}
          {(section.type === 'description' || section.type === 'notes' || section.type === 'terms') && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Mostrar Título</span>
              <Switch
                checked={section.settings?.showTitle !== false}
                onCheckedChange={(v) => onUpdate(section.id, { 
                  settings: { ...section.settings, showTitle: v } 
                })}
              />
            </div>
          )}

          {(section.type === 'description' || section.type === 'notes') && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Conteúdo</Label>
              <Textarea
                value={section.settings?.content || ''}
                onChange={(e) => onUpdate(section.id, {
                  settings: { ...section.settings, content: e.target.value }
                })}
                placeholder={section.type === 'notes' ? 'Escreva as notas a mostrar no portal...' : 'Escreva a descrição do trabalho...'}
                className="text-xs min-h-[90px]"
              />
            </div>
          )}

          {/* Custom section settings */}
          {section.type === 'custom' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Título da Secção</Label>
                <Input
                  value={section.label || ''}
                  onChange={(e) => onUpdate(section.id, { label: e.target.value })}
                  placeholder="Título da secção personalizada"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Conteúdo</Label>
                <Textarea
                  value={section.settings?.content || ''}
                  onChange={(e) => onUpdate(section.id, { 
                    settings: { ...section.settings, content: e.target.value } 
                  })}
                  placeholder="Escreva o conteúdo da secção..."
                  className="text-xs min-h-[100px]"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mostrar Ícone</span>
                <Switch
                  checked={section.settings?.showIcon !== false}
                  onCheckedChange={(v) => onUpdate(section.id, { 
                    settings: { ...section.settings, showIcon: v } 
                  })}
                />
              </div>
              {section.settings?.showIcon !== false && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ícone (emoji)</Label>
                  <Input
                    value={section.settings?.customIcon || '📝'}
                    onChange={(e) => onUpdate(section.id, { 
                      settings: { ...section.settings, customIcon: e.target.value } 
                    })}
                    placeholder="📝"
                    className="h-7 text-xs w-16"
                  />
                </div>
              )}
            </>
          )}

          {/* Company/Client info: mappings configuráveis com defaults inteligentes */}
          {(section.type === 'company_info' || section.type === 'client_info') && (() => {
            const isCompany = section.type === 'company_info';
            const fields = isCompany
              ? [
                  { fk: 'companyName',    rk: 'company.name',    label: 'Nome' },
                  { fk: 'companyEmail',   rk: 'company.email',   label: 'Email' },
                  { fk: 'companyPhone',   rk: 'company.phone',   label: 'Telefone' },
                  { fk: 'companyVat',     rk: 'company.vat',     label: 'NIF' },
                  { fk: 'companyAddress', rk: 'company.address', label: 'Morada' },
                ]
              : [
                  { fk: 'clientName',    rk: 'client.name',    label: 'Nome' },
                  { fk: 'clientEmail',   rk: 'client.email',   label: 'Email' },
                  { fk: 'clientPhone',   rk: 'client.phone',   label: 'Telefone' },
                  { fk: 'clientVat',     rk: 'client.vat',     label: 'NIF' },
                  { fk: 'clientAddress', rk: 'client.address', label: 'Morada' },
                ];
            return (
              <>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Origem dos dados
                  </Label>
                  {fields.map((f) => {
                    const defaultLabel = `${isCompany ? 'Empresa' : 'Cliente'} · ${f.label}`;
                    return (
                      <div key={f.fk} className="flex items-center gap-2">
                        <span className="text-xs w-20 shrink-0 text-muted-foreground">{f.label}</span>
                        <div className="flex-1 min-w-0">
                          <VariableBinding
                            defaultLabel={defaultLabel}
                            defaultRegistryKey={f.rk}
                            value={readBinding(section.settings, f.fk)}
                            onChange={(next) => onUpdate(section.id, { settings: applyBinding(section.settings, f.fk, next) })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Mostrar Morada</span>
                  <Switch
                    checked={section.settings?.showAddress !== false}
                    onCheckedChange={(v) => onUpdate(section.id, { settings: { ...section.settings, showAddress: v } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Mostrar Contactos</span>
                  <Switch
                    checked={section.settings?.showContacts !== false}
                    onCheckedChange={(v) => onUpdate(section.id, { settings: { ...section.settings, showContacts: v } })}
                  />
                </div>
              </>
            );
          })()}

          {/* Footer: contacto comercial + bloco empresa configuráveis */}
          {section.type === 'footer' && (
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Contacto (rodapé)
              </Label>
              {[
                { fk: 'footerContactName',  rk: 'commercial.name',  label: 'Nome' },
                { fk: 'footerContactEmail', rk: 'commercial.email', label: 'Email' },
                { fk: 'footerContactPhone', rk: 'commercial.phone', label: 'Telefone' },
              ].map((f) => (
                <div key={f.fk} className="flex items-center gap-2">
                  <span className="text-xs w-20 shrink-0 text-muted-foreground">{f.label}</span>
                  <div className="flex-1 min-w-0">
                    <VariableBinding
                      defaultLabel={`Comercial · ${f.label}`}
                      defaultRegistryKey={f.rk}
                      value={readBinding(section.settings, f.fk)}
                      onChange={(next) => onUpdate(section.id, { settings: applyBinding(section.settings, f.fk, next) })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {section.type === 'description' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Texto da descrição</Label>
              <Textarea value={section.settings?.content || ''} onChange={(e) => onUpdate(section.id, { settings: { ...section.settings, content: e.target.value } })} placeholder="Texto apresentado nesta secção" className="text-xs min-h-[90px]" />
            </div>
          )}

          {section.type === 'value' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor apresentado</Label>
              <Input type="number" value={section.settings?.amount || ''} onChange={(e) => onUpdate(section.id, { settings: { ...section.settings, amount: e.target.value } })} placeholder="15000" className="h-7 text-xs" />
            </div>
          )}

          {section.type === 'notes' && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Texto das notas</Label>
              <Textarea value={section.settings?.content || ''} onChange={(e) => onUpdate(section.id, { settings: { ...section.settings, content: e.target.value } })} placeholder="Notas apresentadas nesta secção" className="text-xs min-h-[90px]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Color Picker Component
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-8 p-1 cursor-pointer"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 text-xs"
      />
      <span className="text-xs text-muted-foreground w-20 truncate">{label}</span>
    </div>
  );
}

interface ProposalTemplateEditorProps {
  templateId?: string | null;
  onClose: () => void;
  /**
   * Tipo inicial ao CRIAR um novo template (templateId === null).
   * Usado pela página /quote-templates para pré-selecionar "quote".
   * Templates existentes ignoram este prop e carregam o template_type do registo.
   */
  initialTemplateType?: "proposal" | "quote";
  /** Se definido, bloqueia o seletor de tipo (Proposta/Orçamento) a este valor. */
  lockTemplateType?: "proposal" | "quote";
}

export function ProposalTemplateEditor({ templateId, onClose, initialTemplateType, lockTemplateType }: ProposalTemplateEditorProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();

  const [config, setConfig] = useState(() =>
    initialTemplateType && !templateId
      ? { ...defaultConfig, template_type: initialTemplateType }
      : defaultConfig
  );
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const initialConfigRef = useRef<string | null>(null);
  // design_settings raw da BD (para preservar chaves geridas por outros adapters
  // como items_table — ver getDesignSettings). Plano §3.
  const originalDesignSettingsRef = useRef<Record<string, unknown> | null>(null);
  // items_table vive em design_settings.items_table (gerido pelos adapters).
  // Mantemos estado local separado para não poluir o config principal.
  const [itemsTableSettings, setItemsTableSettings] = useState<ItemsTableSettingsValue>(
    () => ({ ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.items_table })
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const isDirty = isLoaded && initialConfigRef.current !== null && initialConfigRef.current !== JSON.stringify(config);

  const requestClose = useCallback(() => {
    if (isDirty) setCloseConfirmOpen(true);
    else onClose();
  }, [isDirty, onClose]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Selecione um ficheiro de imagem (PNG, JPG)", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Erro", description: "Imagem demasiado grande (máx. 5MB)", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const orgId = activeCompany?.id || "general";
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${orgId}/proposal-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("company-logos").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(filePath);
      setConfig(prev => ({ ...prev, logo_url: urlData.publicUrl }));
      toast({ title: "Logotipo carregado com sucesso" });
    } catch (err: any) {
      toast({ title: "Erro ao carregar logotipo", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [needsBaseline, setNeedsBaseline] = useState(false);

  useEffect(() => {
    loadCompanies();
    setIsLoaded(false);
    initialConfigRef.current = null;
    if (templateId) {
      loadTemplate().then(() => setNeedsBaseline(true));
    } else {
      setConfig(prev => ({ ...prev, organization_id: activeCompany?.id || "" }));
      setNeedsBaseline(true);
    }
  }, [templateId, activeCompany]);

  useEffect(() => {
    if (needsBaseline) {
      initialConfigRef.current = JSON.stringify(config);
      setIsLoaded(true);
      setNeedsBaseline(false);
    }
  }, [needsBaseline, config]);

  const loadCompanies = async () => {
    const { data } = await supabase.from("anew_organizations").select("id, name").order("name");
    setCompanies(data || []);
  };

  const loadTemplate = async () => {
    if (!templateId) return;
    const { data, error } = await supabase
      .from("proposal_templates")
      .select("*")
      .eq("id", templateId)
      .single();
    
    if (data && !error) {
      // Merge loaded data with default config
      // Load sections from DB if available, otherwise use defaults
      const loadedSections = Array.isArray(data.sections) 
        ? (data.sections as unknown as typeof defaultSections) 
        : null;
      originalDesignSettingsRef.current =
        (data as any).design_settings && typeof (data as any).design_settings === "object" && !Array.isArray((data as any).design_settings)
          ? { ...((data as any).design_settings as Record<string, unknown>) }
          : null;
      const designSettings = parseDesignSettings((data as any).design_settings);
      // Carrega items_table existente (gerido pelos adapters) ou aplica defaults.
      const rawItemsTable = (originalDesignSettingsRef.current as any)?.items_table;
      setItemsTableSettings({
        ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.items_table,
        ...(rawItemsTable && typeof rawItemsTable === "object" ? rawItemsTable : {}),
      });
      
      setConfig(prev => ({
        ...prev,
        ...designSettings,
        name: data.name || "",
        description: data.description || "",
        organization_id: (data as any).organization_id || "",
        template_type: (lockTemplateType || (data as any).template_type || "proposal") as "proposal" | "quote",
        logo_url: data.logo_url || "",
        primary_color: data.primary_color || prev.primary_color,
        secondary_color: data.secondary_color || prev.secondary_color,
        accent_color: data.accent_color || prev.accent_color,
        background_color: data.background_color || prev.background_color,
        text_color: data.text_color || prev.text_color,
        font_family: data.font_family || prev.font_family,
        heading_font_family: data.heading_font_family || prev.heading_font_family,
        header_style: data.header_style || prev.header_style,
        header_text: data.header_text || "",
        footer_text: data.footer_text || "",
        terms_conditions: data.terms_conditions || prev.terms_conditions,
        thank_you_message: data.thank_you_message || prev.thank_you_message,
        email_subject: (data as any).email_subject ?? prev.email_subject,
        email_body: (data as any).email_body ?? prev.email_body,
        is_default: data.is_default || false,
        is_active: data.is_active ?? true,
        accept_enabled: data.accept_enabled ?? true,
        accept_verification_method: (data.accept_verification_method || "none") as "none" | "email",
        verification_email_subject: (data as any).verification_email_subject ?? prev.verification_email_subject,
        verification_email_body: (data as any).verification_email_body ?? prev.verification_email_body,
        show_quote_details: data.show_quote_details ?? true,
        sections: loadedSections || prev.sections,
      }));
    }
  };

  const handleLogoSelect = (value: string, type: 'image' | 'icon') => {
    if (type === 'image') {
      setConfig(prev => ({ ...prev, logo_url: value }));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = config.sections.findIndex(s => s.id === active.id);
      const newIndex = config.sections.findIndex(s => s.id === over.id);
      setConfig(prev => ({
        ...prev,
        sections: arrayMove(prev.sections, oldIndex, newIndex)
      }));
    }
  };

  const updateSection = (id: string, updates: Partial<TemplateSection>) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const removeSection = (id: string) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== id)
    }));
  };

  const addCustomSection = () => {
    const newSection: TemplateSection = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      label: 'Secção Personalizada',
      visible: true,
      settings: { content: '' }
    };
    setConfig(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
  };

  const resetToDefaults = () => {
    setConfig(prev => ({
      ...defaultConfig,
      name: prev.name,
      description: prev.description,
      organization_id: prev.organization_id,
      template_type: prev.template_type,
    }));
    toast({ title: "Configurações resetadas" });
  };

  const applyQuotePdfTemplate = () => {
    setConfig(prev => ({
      ...prev,
      ...defaultConfig,
      name: prev.name,
      description: prev.description,
      organization_id: prev.organization_id,
      template_type: prev.template_type,
      is_default: prev.is_default,
      is_active: prev.is_active,
      logo_url: prev.logo_url,
    }));
    toast({ title: "Template de orçamento aplicado" });
  };

  const handleSave = async () => {
    if (!config.name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado");

      // Identity boundary: proposal_templates.created_by is a business id
      // (anew_users.id), not auth.uid(). Resolve before insert.
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Não foi possível identificar o utilizador");

      // If setting as default, unset others
      if (config.is_default) {
        const tbl = supabase.from("proposal_templates") as any;
        await tbl
          .update({ is_default: false })
          .eq("organization_id", config.organization_id || activeCompany?.id)
          .eq("template_type", config.template_type);
      }

      const templateData = {
        name: config.name,
        description: config.description || null,
        organization_id: config.organization_id || activeCompany?.id || null,
        template_type: config.template_type,
        logo_url: config.logo_url || null,
        primary_color: config.primary_color,
        secondary_color: config.secondary_color,
        accent_color: config.accent_color,
        background_color: config.background_color,
        text_color: config.text_color,
        font_family: config.font_family,
        heading_font_family: config.heading_font_family,
        header_style: config.header_style,
        show_company_info: config.sections.find(s => s.type === 'company_info')?.visible ?? true,
        show_client_info: config.sections.find(s => s.type === 'client_info')?.visible ?? true,
        show_validity: config.sections.find(s => s.type === 'validity')?.visible ?? true,
        show_terms: config.sections.find(s => s.type === 'terms')?.visible ?? true,
        header_text: config.header_text || null,
        footer_text: config.footer_text || null,
        terms_conditions: config.terms_conditions || null,
        thank_you_message: config.thank_you_message || null,
        email_subject: config.email_subject || null,
        email_body: config.email_body || null,
        is_default: config.is_default,
        is_active: config.is_active,
        accept_enabled: config.accept_enabled,
        accept_verification_method: config.accept_verification_method,
        show_quote_details: config.show_quote_details,
        verification_email_subject: config.verification_email_subject || null,
        verification_email_body: config.verification_email_body || null,
        sections: JSON.parse(JSON.stringify(config.sections)),
        design_settings: {
          ...getDesignSettings(config, originalDesignSettingsRef.current),
          items_table: itemsTableSettings,
        },
      };

      if (templateId) {
        const tbl = supabase.from("proposal_templates") as any;
        const { data: updated, error } = await tbl
          .update(templateData)
          .eq("id", templateId)
          .select("id");
        if (error) throw error;
        if (!updated || updated.length === 0) throw new Error("Sem permissão para guardar este template");
      } else {
        const tbl = supabase.from("proposal_templates") as any;
        const { data: inserted, error } = await tbl
          .insert({ ...templateData, created_by: businessUserId })
          .select("id");
        if (error) throw error;
        if (!inserted || inserted.length === 0) throw new Error("Sem permissão para criar template");
      }

      initialConfigRef.current = JSON.stringify(config);
      toast({ title: templateId ? "Template atualizado" : "Template criado" });
      onClose();
    } catch (error: any) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewWidth = previewMode === 'desktop' ? '100%' : previewMode === 'tablet' ? '768px' : '375px';

  return (
    <Layout>
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="flex-shrink-0 border-b bg-background px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={requestClose} className="relative">
              {isDirty && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" />}
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <Input
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do Template"
                className="text-lg font-semibold border-none shadow-none h-auto p-0 focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!lockTemplateType && (
              <div className="flex items-center overflow-hidden rounded-lg border bg-background">
                <Button
                  type="button"
                  variant={config.template_type === "proposal" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setConfig(prev => ({ ...prev, template_type: "proposal" }))}
                >
                  Proposta
                </Button>
                <Button
                  type="button"
                  variant={config.template_type === "quote" ? "secondary" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setConfig(prev => ({ ...prev, template_type: "quote" }))}
                >
                  Orçamento
                </Button>
              </div>
            )}
            <div className="flex border rounded-lg overflow-hidden">
              {(['desktop', 'tablet', 'mobile'] as const).map(mode => (
                <Button
                  key={mode}
                  variant={previewMode === mode ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setPreviewMode(mode)}
                  className="rounded-none"
                >
                  {mode === 'desktop' ? '🖥️' : mode === 'tablet' ? '📱' : '📲'}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={resetToDefaults}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={applyQuotePdfTemplate}>
              Usar layout Orçamento
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Settings */}
          <div className="w-80 flex-shrink-0 border-r bg-muted/30 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                <Tabs defaultValue="sections" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="sections" className="text-xs px-2">
                      <LayoutIcon className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="colors" className="text-xs px-2">
                      <Palette className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="typography" className="text-xs px-2">
                      <Type className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="content" className="text-xs px-2">
                      <FileText className="h-3 w-3" />
                    </TabsTrigger>
                  </TabsList>

                  {/* Sections Tab */}
                  <TabsContent value="sections" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Ordem das Secções</Label>
                        <Button variant="ghost" size="sm" onClick={addCustomSection}>
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Arraste para reordenar. Toggle para mostrar/esconder.</p>
                      
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={config.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {config.sections.map(section => (
                              <SortableSection
                                key={section.id}
                                section={section}
                                onUpdate={updateSection}
                                onRemove={removeSection}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>

                    <Separator />

                    {/* Layout Settings */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Layout</Label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Largura máxima</span>
                          <span className="text-xs text-muted-foreground">{config.max_width}px</span>
                        </div>
                        <Slider
                          value={[config.max_width]}
                          min={600}
                          max={1200}
                          step={50}
                          onValueChange={([v]) => setConfig(prev => ({ ...prev, max_width: v }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Padding página</span>
                          <span className="text-xs text-muted-foreground">{config.padding_page}px</span>
                        </div>
                        <Slider
                          value={[config.padding_page]}
                          min={16}
                          max={80}
                          step={4}
                          onValueChange={([v]) => setConfig(prev => ({ ...prev, padding_page: v }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Espaço entre secções</span>
                          <span className="text-xs text-muted-foreground">{config.gap_sections}px</span>
                        </div>
                        <Slider
                          value={[config.gap_sections]}
                          min={8}
                          max={48}
                          step={4}
                          onValueChange={([v]) => setConfig(prev => ({ ...prev, gap_sections: v }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Raio das bordas</span>
                          <span className="text-xs text-muted-foreground">{config.border_radius}px</span>
                        </div>
                        <Slider
                          value={[config.border_radius]}
                          min={0}
                          max={24}
                          step={2}
                          onValueChange={([v]) => setConfig(prev => ({ ...prev, border_radius: v }))}
                        />
                      </div>
                    </div>

                    {/* Tabela de Artigos — só layout/estética (Plano §7) */}
                    <ItemsTableSettingsPanel
                      context={config.template_type === "quote" ? "quote" : "proposal"}
                      value={itemsTableSettings}
                      onChange={(patch) => setItemsTableSettings(prev => ({ ...prev, ...patch }))}
                    />
                  </TabsContent>

                  {/* Colors Tab */}
                  <TabsContent value="colors" className="space-y-4 mt-4">
                    <Accordion type="multiple" defaultValue={["brand", "header", "quotes"]} className="w-full">
                      <AccordionItem value="brand">
                        <AccordionTrigger className="text-sm">Cores da Marca</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Primária" value={config.primary_color} onChange={v => setConfig(p => ({ ...p, primary_color: v }))} />
                          <ColorPicker label="Secundária" value={config.secondary_color} onChange={v => setConfig(p => ({ ...p, secondary_color: v }))} />
                          <ColorPicker label="Destaque" value={config.accent_color} onChange={v => setConfig(p => ({ ...p, accent_color: v }))} />
                        </AccordionContent>
                      </AccordionItem>
                      
                      <AccordionItem value="page">
                        <AccordionTrigger className="text-sm">Página</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Fundo" value={config.background_color} onChange={v => setConfig(p => ({ ...p, background_color: v }))} />
                          <ColorPicker label="Superfície" value={config.surface_color} onChange={v => setConfig(p => ({ ...p, surface_color: v }))} />
                          <ColorPicker label="Texto" value={config.text_color} onChange={v => setConfig(p => ({ ...p, text_color: v }))} />
                          <ColorPicker label="Texto Sec." value={config.text_secondary_color} onChange={v => setConfig(p => ({ ...p, text_secondary_color: v }))} />
                          <ColorPicker label="Bordas" value={config.border_color} onChange={v => setConfig(p => ({ ...p, border_color: v }))} />
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="header">
                        <AccordionTrigger className="text-sm">Cabeçalho</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Fundo" value={config.header_bg_color} onChange={v => setConfig(p => ({ ...p, header_bg_color: v }))} />
                          <ColorPicker label="Texto" value={config.header_text_color} onChange={v => setConfig(p => ({ ...p, header_text_color: v }))} />
                          <div className="flex items-center justify-between">
                            <span className="text-xs">Gradiente</span>
                            <Switch
                              checked={config.header_gradient}
                              onCheckedChange={v => setConfig(p => ({ ...p, header_gradient: v }))}
                            />
                          </div>
                          {config.header_gradient && (
                            <ColorPicker label="Gradiente até" value={config.header_gradient_to} onChange={v => setConfig(p => ({ ...p, header_gradient_to: v }))} />
                          )}
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="quotes">
                        <AccordionTrigger className="text-sm">Orçamentos/Tabelas</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Cabeçalho BG" value={config.quote_header_bg} onChange={v => setConfig(p => ({ ...p, quote_header_bg: v }))} />
                          <ColorPicker label="Cabeçalho Texto" value={config.quote_header_text} onChange={v => setConfig(p => ({ ...p, quote_header_text: v }))} />
                          <ColorPicker label="Linha Alternada" value={config.quote_row_alt_bg} onChange={v => setConfig(p => ({ ...p, quote_row_alt_bg: v }))} />
                          <ColorPicker label="Bordas" value={config.quote_border_color} onChange={v => setConfig(p => ({ ...p, quote_border_color: v }))} />
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="status">
                        <AccordionTrigger className="text-sm">Estados</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Pendente" value={config.status_pending_color} onChange={v => setConfig(p => ({ ...p, status_pending_color: v }))} />
                          <ColorPicker label="Aceite" value={config.status_accepted_color} onChange={v => setConfig(p => ({ ...p, status_accepted_color: v }))} />
                          <ColorPicker label="Rejeitada" value={config.status_rejected_color} onChange={v => setConfig(p => ({ ...p, status_rejected_color: v }))} />
                          <ColorPicker label="Enviada" value={config.status_sent_color} onChange={v => setConfig(p => ({ ...p, status_sent_color: v }))} />
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="buttons">
                        <AccordionTrigger className="text-sm">Botões de Ação</AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          <ColorPicker label="Aceitar BG" value={config.accept_button_bg} onChange={v => setConfig(p => ({ ...p, accept_button_bg: v }))} />
                          <ColorPicker label="Aceitar Texto" value={config.accept_button_text_color} onChange={v => setConfig(p => ({ ...p, accept_button_text_color: v }))} />
                          <ColorPicker label="Rejeitar BG" value={config.reject_button_bg} onChange={v => setConfig(p => ({ ...p, reject_button_bg: v }))} />
                          <ColorPicker label="Rejeitar Texto" value={config.reject_button_text_color} onChange={v => setConfig(p => ({ ...p, reject_button_text_color: v }))} />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </TabsContent>

                  {/* Typography Tab */}
                  <TabsContent value="typography" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Fonte do Corpo</Label>
                        <Select value={config.font_family} onValueChange={v => setConfig(p => ({ ...p, font_family: v }))}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter">Inter</SelectItem>
                            <SelectItem value="Roboto">Roboto</SelectItem>
                            <SelectItem value="Open Sans">Open Sans</SelectItem>
                            <SelectItem value="Lato">Lato</SelectItem>
                            <SelectItem value="Montserrat">Montserrat</SelectItem>
                            <SelectItem value="Poppins">Poppins</SelectItem>
                            <SelectItem value="Source Sans Pro">Source Sans Pro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fonte dos Títulos</Label>
                        <Select value={config.heading_font_family} onValueChange={v => setConfig(p => ({ ...p, heading_font_family: v }))}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter">Inter</SelectItem>
                            <SelectItem value="Roboto">Roboto</SelectItem>
                            <SelectItem value="Montserrat">Montserrat</SelectItem>
                            <SelectItem value="Playfair Display">Playfair Display</SelectItem>
                            <SelectItem value="Merriweather">Merriweather</SelectItem>
                            <SelectItem value="Raleway">Raleway</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Tamanho base</span>
                          <span className="text-xs text-muted-foreground">{config.font_size_base}px</span>
                        </div>
                        <Slider
                          value={[config.font_size_base]}
                          min={12}
                          max={20}
                          step={1}
                          onValueChange={([v]) => setConfig(p => ({ ...p, font_size_base: v }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Tamanho títulos</span>
                          <span className="text-xs text-muted-foreground">{config.font_size_heading}px</span>
                        </div>
                        <Slider
                          value={[config.font_size_heading]}
                          min={18}
                          max={36}
                          step={1}
                          onValueChange={([v]) => setConfig(p => ({ ...p, font_size_heading: v }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Altura de linha</span>
                          <span className="text-xs text-muted-foreground">{config.line_height}</span>
                        </div>
                        <Slider
                          value={[config.line_height * 10]}
                          min={12}
                          max={24}
                          step={1}
                          onValueChange={([v]) => setConfig(p => ({ ...p, line_height: v / 10 }))}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Content Tab */}
                  <TabsContent value="content" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      {/* Logo upload from PC */}
                      <div className="space-y-2">
                        <Label className="text-xs">Logotipo</Label>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          className="hidden"
                          onChange={handleLogoUpload}
                        />
                        <div className="flex items-center gap-2">
                          {config.logo_url ? (
                            <div className="relative h-12 w-20 border rounded overflow-hidden">
                              <img src={config.logo_url} alt="Logo" className="h-full w-full object-contain" />
                              <button
                                onClick={() => setConfig(p => ({ ...p, logo_url: "" }))}
                                className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-12 w-20 border border-dashed rounded flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={uploadingLogo}
                            onClick={() => logoInputRef.current?.click()}
                          >
                            {uploadingLogo ? "A carregar..." : "Escolher Ficheiro"}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Empresa</Label>
                        <Select value={config.organization_id} onValueChange={v => setConfig(p => ({ ...p, organization_id: v }))}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!lockTemplateType && (
                        <div className="space-y-2">
                          <Label className="text-xs">Tipo</Label>
                          <Select value={config.template_type} onValueChange={(v: "proposal" | "quote") => setConfig(p => ({ ...p, template_type: v }))}>
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Selecionar tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="proposal">Proposta</SelectItem>
                              <SelectItem value="quote">Orçamento</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      <Separator />
                      
                      {/* Email Configuration */}
                      <div className="space-y-3 p-3 border rounded-lg bg-blue-50/50">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-600" />
                          <Label className="text-xs font-medium">Email de Envio de Proposta</Label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Assunto do Email</Label>
                          <Input
                            value={config.email_subject}
                            onChange={e => setConfig(p => ({ ...p, email_subject: e.target.value }))}
                            placeholder="Proposta: {{titulo_proposta}}"
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">Use variáveis como {"{{nome_cliente}}"}, {"{{titulo_proposta}}"}</p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Corpo do Email</Label>
                          <RichTextEditor
                            value={config.email_body}
                            onChange={(v) => setConfig(p => ({ ...p, email_body: v }))}
                            placeholder="Escreva o email..."
                            minHeight="120px"
                          />
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <Label className="text-xs">Termos e Condições</Label>
                        <Textarea
                          value={config.terms_conditions}
                          onChange={e => setConfig(p => ({ ...p, terms_conditions: e.target.value }))}
                          rows={4}
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Mensagem na Proposta</Label>
                        <Textarea
                          value={config.thank_you_message}
                          onChange={e => setConfig(p => ({ ...p, thank_you_message: e.target.value }))}
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Texto do Rodapé</Label>
                        <Textarea
                          value={config.footer_text}
                          onChange={e => setConfig(p => ({ ...p, footer_text: e.target.value }))}
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-xs">Texto Botão Aceitar</Label>
                        <Input
                          value={config.accept_button_text}
                          onChange={e => setConfig(p => ({ ...p, accept_button_text: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Texto Botão Rejeitar</Label>
                        <Input
                          value={config.reject_button_text}
                          onChange={e => setConfig(p => ({ ...p, reject_button_text: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Separator />
                      
                      {/* Accept/Verification Options */}
                      <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                        <Label className="text-xs font-medium">Opções de Aceitação</Label>
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Permitir Aceitar</Label>
                          <Switch
                            checked={config.accept_enabled}
                            onCheckedChange={v => setConfig(p => ({ ...p, accept_enabled: v }))}
                          />
                        </div>
                        
                        {config.accept_enabled && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-xs">Verificação para Aceitar/Recusar</Label>
                              <Select 
                                value={config.accept_verification_method} 
                                onValueChange={(v: "none" | "email") => setConfig(p => ({ ...p, accept_verification_method: v }))}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Sem verificação</SelectItem>
                                  <SelectItem value="email">Código por Email</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-muted-foreground">
                                {config.accept_verification_method === "none" 
                                  ? "O cliente pode aceitar/recusar diretamente"
                                  : "O cliente recebe um código por email para confirmar a sua decisão"}
                              </p>
                            </div>
                            
                            {config.accept_verification_method === "email" && (
                              <div className="space-y-3 p-3 border rounded-lg bg-green-50/50">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-green-600" />
                                  <Label className="text-xs font-medium">Email de Verificação</Label>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Assunto</Label>
                                  <Input
                                    value={config.verification_email_subject || "Código de Verificação - {{titulo_proposta}}"}
                                    onChange={e => setConfig(p => ({ ...p, verification_email_subject: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Corpo do Email</Label>
                                  <RichTextEditor
                                    value={config.verification_email_body || ""}
                                    onChange={(v) => setConfig(p => ({ ...p, verification_email_body: v }))}
                                    placeholder="Escreva o email de verificação..."
                                    minHeight="120px"
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    Variáveis: {"{{nome_cliente}}"}, {"{{titulo_proposta}}"}, {"{{codigo}}"}
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Mostrar Detalhes Orçamentos</Label>
                          <Switch
                            checked={config.show_quote_details}
                            onCheckedChange={v => setConfig(p => ({ ...p, show_quote_details: v }))}
                          />
                        </div>
                      </div>
                      
                      <Separator />
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Template Padrão</Label>
                        <Switch
                          checked={config.is_default}
                          onCheckedChange={v => setConfig(p => ({ ...p, is_default: v }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Ativo</Label>
                        <Switch
                          checked={config.is_active}
                          onCheckedChange={v => setConfig(p => ({ ...p, is_active: v }))}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 overflow-auto bg-muted/50 p-4">
            <div className="flex justify-center">
              <div 
                style={{ 
                  width: previewWidth, 
                  maxWidth: '100%',
                  transition: 'width 0.3s ease'
                }}
              >
                <ProposalPreview config={config} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações por guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Tem alterações que ainda não foram guardadas. Tem a certeza que deseja sair sem guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar a editar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setCloseConfirmOpen(false); onClose(); }}>
              Sair sem guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

// Preview Component
function ProposalPreview({ config }: { config: typeof defaultConfig }) {
  const visibleSections = config.sections.filter(s => s.visible);

  const renderSection = (section: TemplateSection) => {
    const sectionStyle = {
      marginBottom: config.gap_sections,
    };

    switch (section.type) {
      case 'header':
        const headerSection = section;
        if (headerSection.settings?.layout === 'quote_pdf') {
          return (
            <div key={section.id} style={{ ...sectionStyle, paddingBottom: 24, borderBottom: `4px solid ${config.primary_color}` }}>
              <div className="flex justify-between items-start gap-8">
                <div>
                  <h1 style={{ fontFamily: config.heading_font_family, fontSize: 42, fontWeight: 'bold', color: config.header_text_color, marginBottom: 14 }}>
                    {headerSection.settings?.customTitle || 'PROPOSTA'}
                  </h1>
                  <p style={{ color: config.text_color, fontSize: config.font_size_small, marginBottom: 4 }}>P-2026-2140</p>
                  {headerSection.settings?.showDate !== false && (
                    <p style={{ color: config.text_color, fontSize: config.font_size_small }}>
                      Data: {format(new Date(), "dd/MM/yyyy", { locale: pt })}
                    </p>
                  )}
                  {config.header_text && <p style={{ color: config.text_secondary_color, marginTop: 12 }}>{config.header_text}</p>}
                </div>
                {headerSection.settings?.showLogo !== false && config.logo_url && (
                  <img src={config.logo_url} alt="Logo" className="h-24 w-48 object-contain" />
                )}
              </div>
            </div>
          );
        }
        return (
          <div 
            key={section.id}
            style={{
              ...sectionStyle,
              background: config.header_gradient 
                ? `linear-gradient(135deg, ${config.header_bg_color}, ${config.header_gradient_to})`
                : config.header_bg_color,
              color: config.header_text_color,
              padding: config.padding_section,
              borderRadius: config.border_radius,
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                {headerSection.settings?.showLogo !== false && config.logo_url && (
                  <img src={config.logo_url} alt="Logo" className="h-12 mb-4 object-contain" />
                )}
                <h1 style={{ 
                  fontFamily: config.heading_font_family, 
                  fontSize: config.font_size_heading,
                  fontWeight: 'bold',
                  marginBottom: 8
                }}>
                  {headerSection.settings?.customTitle || mockProposal.title}
                </h1>
                {config.header_text && (
                  <p style={{ opacity: 0.8 }}>{config.header_text}</p>
                )}
              </div>
              {headerSection.settings?.showDate !== false && (
                <div className="text-right">
                  <Badge className="bg-white/20 text-white">Enviada</Badge>
                  <p style={{ opacity: 0.8, fontSize: config.font_size_small, marginTop: 8 }}>
                    {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 'company_info':
        const companyIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.company_info) 
          : '';
        const companyLabel = section.settings?.sectionLabel || 'Empresa';
        return (
          <Card key={section.id} style={{ ...sectionStyle, borderRadius: config.border_radius, borderColor: config.border_color }}>
            <CardContent className="pt-4" style={{ padding: config.padding_card }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: config.primary_color }}>
                {companyIcon && <span>{companyIcon}</span>}
                <span className="text-sm font-medium">{companyLabel}</span>
              </div>
              <p className="font-semibold" style={{ color: config.text_color }}>{section.settings?.name || mockProposal.company.name}</p>
              {section.settings?.showContacts !== false && (
                <>
                  <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.email || mockProposal.company.email}</p>
                  <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.phone || mockProposal.company.phone}</p>
                </>
              )}
              {section.settings?.showAddress !== false && (
                <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.address || mockProposal.company.address}</p>
              )}
            </CardContent>
          </Card>
        );

      case 'client_info':
        const clientIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.client_info) 
          : '';
        const clientLabel = section.settings?.sectionLabel || 'Cliente';
        if (section.settings?.layout === 'quote_pdf') {
          return (
            <div key={section.id} style={sectionStyle}>
              <div style={{ backgroundColor: config.surface_color, padding: '8px 10px', marginBottom: 10 }}>
                <span style={{ color: config.text_color, fontWeight: 'bold', fontSize: config.font_size_small }}>{clientLabel}</span>
              </div>
              <div className="space-y-1">
                <div className="flex"><span className="font-bold w-28" style={{ color: config.text_color, fontSize: config.font_size_small }}>Nome:</span><span style={{ color: config.text_color, fontSize: config.font_size_small }}>{section.settings?.name || mockProposal.client.name}</span></div>
                {section.settings?.showContacts !== false && <div className="flex"><span className="font-bold w-28" style={{ color: config.text_color, fontSize: config.font_size_small }}>Email:</span><span style={{ color: config.text_color, fontSize: config.font_size_small }}>{section.settings?.email || mockProposal.client.email}</span></div>}
                {section.settings?.showContacts !== false && <div className="flex"><span className="font-bold w-28" style={{ color: config.text_color, fontSize: config.font_size_small }}>Telefone:</span><span style={{ color: config.text_color, fontSize: config.font_size_small }}>{section.settings?.phone || mockProposal.client.phone}</span></div>}
                {section.settings?.showAddress !== false && <div className="flex"><span className="font-bold w-28" style={{ color: config.text_color, fontSize: config.font_size_small }}>Morada:</span><span style={{ color: config.text_color, fontSize: config.font_size_small }}>{section.settings?.address || mockProposal.client.address}</span></div>}
              </div>
            </div>
          );
        }
        return (
          <Card key={section.id} style={{ ...sectionStyle, borderRadius: config.border_radius, borderColor: config.border_color }}>
            <CardContent className="pt-4" style={{ padding: config.padding_card }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: config.primary_color }}>
                {clientIcon && <span>{clientIcon}</span>}
                <span className="text-sm font-medium">{clientLabel}</span>
              </div>
              <p className="font-semibold" style={{ color: config.text_color }}>{section.settings?.name || mockProposal.client.name}</p>
              {section.settings?.showContacts !== false && (
                <>
                  <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.email || mockProposal.client.email}</p>
                  <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.phone || mockProposal.client.phone}</p>
                </>
              )}
              {section.settings?.showAddress !== false && (
                <p style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{section.settings?.address || mockProposal.client.address}</p>
              )}
            </CardContent>
          </Card>
        );

      case 'description':
        const descIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.description) 
          : '';
        const descLabel = section.settings?.sectionLabel || 'Descrição';
        const descriptionContent = section.settings?.content || mockProposal.description;
        return (
          <div key={section.id} style={sectionStyle}>
            {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: config.surface_color, padding: '8px 10px', marginBottom: 10 }}>
                <span style={{ color: config.text_color, fontWeight: 'bold', fontSize: config.font_size_small }}>
                  {descIcon && `${descIcon} `}{descLabel}
                </span>
              </div>
            )}
            <div style={{ padding: config.padding_card, backgroundColor: config.content_block_bg, border: `1px solid ${config.border_color}`, borderRadius: config.border_radius }}>
              <p style={{ color: config.text_secondary_color, lineHeight: config.line_height }}>
                {descriptionContent}
              </p>
            </div>
          </div>
        );

      case 'notes':
        const notesIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.notes) 
          : '';
        const notesLabel = section.settings?.sectionLabel || 'Notas';
        const notesContent = section.settings?.content || mockProposal.notes;
        return notesContent ? (
          <div key={section.id} style={sectionStyle}>
            {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: config.surface_color, padding: '8px 10px', marginBottom: 10 }}>
                <span style={{ color: config.text_color, fontWeight: 'bold', fontSize: config.font_size_small }}>
                  {notesIcon && `${notesIcon} `}{notesLabel}
                </span>
              </div>
            )}
            <div style={{ padding: config.padding_card, backgroundColor: config.content_block_bg, border: `1px solid ${config.border_color}`, borderRadius: config.border_radius }}>
              <p style={{ color: config.text_secondary_color, lineHeight: config.line_height }}>
                {notesContent}
              </p>
            </div>
          </div>
        ) : null;

      case 'terms':
        const termsIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.terms) 
          : '';
        const termsLabel = section.settings?.sectionLabel || 'Termos e Condições';
        return config.terms_conditions ? (
          <div key={section.id} style={sectionStyle}>
              {section.settings?.showTitle !== false && (
              <div style={{ backgroundColor: config.surface_color, padding: '8px 10px', marginBottom: 10 }}>
                <span style={{ color: config.text_color, fontWeight: 'bold', fontSize: config.font_size_small }}>
                  {termsIcon && `${termsIcon} `}{termsLabel}
                </span>
              </div>
              )}
            <div style={{ padding: config.padding_card, backgroundColor: config.content_block_bg, border: `1px solid ${config.border_color}`, borderRadius: config.border_radius }}>
              <p className="whitespace-pre-wrap" style={{ color: config.text_secondary_color, fontSize: config.font_size_small, lineHeight: config.line_height }}>
                {config.terms_conditions}
              </p>
            </div>
          </div>
        ) : null;

      case 'validity':
        const validityIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.validity) 
          : '';
        const validityLabel = section.settings?.sectionLabel || 'Válida até';
        return (
          <div key={section.id} style={{ ...sectionStyle }} className="flex items-center gap-2">
            {validityIcon && <span style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{validityIcon}</span>}
            <span style={{ color: config.text_secondary_color, fontSize: config.font_size_small }}>{validityLabel}:</span>
            <span className="font-medium" style={{ color: config.text_color, fontSize: config.font_size_small }}>
              {format(new Date(mockProposal.valid_until), "dd/MM/yyyy", { locale: pt })}
            </span>
          </div>
        );

      case 'value':
        const valueIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.value) 
          : '';
        const valueLabel = section.settings?.sectionLabel || 'Valor da Proposta';
        return (
          <div 
            key={section.id}
            style={{
              ...sectionStyle,
              background: `${config.primary_color}10`,
              padding: config.padding_card,
              borderRadius: config.border_radius,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div className="flex items-center gap-2">
              {valueIcon && <span style={{ color: config.primary_color }}>{valueIcon}</span>}
              <span className="font-medium" style={{ color: config.text_color }}>{valueLabel}</span>
            </div>
            <span className="text-2xl font-bold" style={{ color: config.primary_color }}>
              €{Number(section.settings?.amount || mockProposal.value).toLocaleString('pt-PT')}
            </span>
          </div>
        );

      case 'quotes':
        const quotesIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.quotes) 
          : '';
        const quotesLabel = section.settings?.sectionLabel || 'Orçamentos Associados';
        return (
          <div key={section.id} style={sectionStyle}>
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: config.text_color }}>
              {quotesIcon && <span>{quotesIcon}</span>}
              {quotesLabel}
            </h3>
            <div className="space-y-2">
              {mockProposal.quotes.map(quote => (
                <div 
                  key={quote.id}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ 
                    backgroundColor: config.surface_color,
                    borderRadius: config.border_radius,
                    border: `1px solid ${config.border_color}`
                  }}
                >
                  <span className="font-medium" style={{ color: config.text_color }}>{quote.quote_number}</span>
                  <span className="font-semibold" style={{ color: config.primary_color }}>
                    €{quote.total.toLocaleString('pt-PT')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'quote_items':
        const showPrices = section.settings?.showUnitPrice !== false;
        const quoteItemsIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || sectionIcons.quote_items) 
          : '';
        const quoteItemsLabel = section.settings?.sectionLabel || section.label || 'Itens dos Orçamentos';
        if (section.settings?.tableStyle === 'quote_pdf') {
          return (
            <div key={section.id} style={sectionStyle}>
              <div style={{ backgroundColor: config.surface_color, padding: '8px 10px', marginBottom: 10 }}>
                <span style={{ color: config.text_color, fontWeight: 'bold', fontSize: config.font_size_small }}>{quoteItemsLabel}</span>
              </div>
              <div style={{ border: `1px solid ${config.quote_border_color}` }}>
                <div className="flex px-3 py-2 font-bold" style={{ backgroundColor: config.quote_header_bg, color: config.quote_header_text, fontSize: 12 }}>
                  <span className="w-[14%]">SKU</span><span className="flex-1">Descrição</span><span className="w-[8%] text-center">Unid.</span><span className="w-[8%] text-right">Qtd.</span><span className="w-[13%] text-right">P. Unit.</span><span className="w-[7%] text-center">IVA</span><span className="w-[13%] text-right">Total</span>
                </div>
                {mockProposal.quotes.flatMap(q => q.items).map((item, idx) => (
                  <div key={idx} className="flex px-3 py-2" style={{ borderTop: `1px solid ${config.quote_border_color}`, fontSize: 12, color: config.text_color }}>
                    <span className="w-[14%]">{idx + 1}</span><span className="flex-1">{item.name}</span><span className="w-[8%] text-center">UN</span><span className="w-[8%] text-right">{item.quantity}</span><span className="w-[13%] text-right">€{item.unit_price}</span><span className="w-[7%] text-center">23%</span><span className="w-[13%] text-right font-bold">€{item.total}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={section.id} style={sectionStyle}>
            <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: config.text_color }}>
              {quoteItemsIcon && <span>{quoteItemsIcon}</span>}
              {quoteItemsLabel}
            </h3>
            {mockProposal.quotes.map(quote => (
              <div key={quote.id} className="mb-4">
                <h4 className="text-sm font-medium mb-2" style={{ color: config.text_secondary_color }}>
                  Itens de {quote.quote_number}
                </h4>
                <div style={{ borderRadius: config.border_radius, overflow: 'hidden', border: `1px solid ${config.quote_border_color}` }}>
                  <div 
                    className="flex p-3 text-sm font-medium"
                    style={{ backgroundColor: config.quote_header_bg, color: config.quote_header_text }}
                  >
                    <span className="flex-1">Item</span>
                    <span className="w-16 text-right">Qtd</span>
                    {showPrices && (
                      <>
                        <span className="w-24 text-right">Preço</span>
                        <span className="w-24 text-right">Total</span>
                      </>
                    )}
                  </div>
                  {quote.items.map((item, idx) => (
                    <div 
                      key={idx}
                      className="flex p-3 text-sm"
                      style={{ 
                        backgroundColor: idx % 2 === 1 ? config.quote_row_alt_bg : 'white',
                        borderBottom: idx < quote.items.length - 1 ? `1px solid ${config.quote_border_color}` : 'none'
                      }}
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: config.text_color }}>{item.name}</p>
                        <p className="text-xs" style={{ color: config.text_secondary_color }}>{item.description}</p>
                      </div>
                      <span className="w-16 text-right" style={{ color: config.text_color }}>{item.quantity}</span>
                      {showPrices && (
                        <>
                          <span className="w-24 text-right" style={{ color: config.text_secondary_color }}>€{item.unit_price}</span>
                          <span className="w-24 text-right font-medium" style={{ color: config.text_color }}>€{item.total}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case 'thank_you':
        return config.thank_you_message ? (
          <div 
            key={section.id}
            className="text-center"
            style={{ ...sectionStyle, padding: config.padding_section }}
          >
            <p style={{ color: config.text_color, lineHeight: config.line_height }}>
              {config.thank_you_message}
            </p>
          </div>
        ) : null;

      case 'footer':
        return config.footer_text ? (
          <div 
            key={section.id}
            className="text-center"
            style={{ 
              ...sectionStyle,
              color: config.text_secondary_color,
              fontSize: config.font_size_small,
              paddingTop: config.padding_section
            }}
          >
            {config.footer_text}
          </div>
        ) : null;

      case 'custom':
        const customIcon = section.settings?.showIcon !== false 
          ? (section.settings?.customIcon || '📝') 
          : '';
        return (
          <Card key={section.id} style={{ ...sectionStyle, borderRadius: config.border_radius, borderColor: config.border_color }}>
            <CardContent className="pt-4" style={{ padding: config.padding_card }}>
              <h3 className="font-semibold mb-2 flex items-center gap-2" style={{ color: config.text_color }}>
                {customIcon && <span>{customIcon}</span>}
                {section.label || 'Secção Personalizada'}
              </h3>
              <p className="whitespace-pre-wrap" style={{ color: config.text_secondary_color, lineHeight: config.line_height }}>
                {section.settings?.content || 'Clique para editar o conteúdo...'}
              </p>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      style={{
        backgroundColor: config.background_color,
        fontFamily: config.font_family,
        fontSize: config.font_size_base,
        lineHeight: config.line_height,
        color: config.text_color,
        padding: config.padding_page,
        maxWidth: config.max_width,
        margin: '0 auto',
        borderRadius: config.border_radius,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }}
    >
      {visibleSections.map(section => renderSection(section))}

      {/* Action Buttons */}
      <div className="text-center space-y-4 mt-8" style={{ paddingTop: config.padding_section }}>
        <p style={{ color: config.text_secondary_color }}>Deseja aceitar esta proposta?</p>
        <div className="flex justify-center gap-4">
          <button
            style={{
              backgroundColor: config.reject_button_bg,
              color: config.reject_button_text_color,
              padding: '12px 24px',
              borderRadius: config.border_radius,
              border: 'none',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {config.reject_button_text}
          </button>
          <button
            style={{
              backgroundColor: config.accept_button_bg,
              color: config.accept_button_text_color,
              padding: '12px 24px',
              borderRadius: config.border_radius,
              border: 'none',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {config.accept_button_text}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProposalTemplateEditor;
