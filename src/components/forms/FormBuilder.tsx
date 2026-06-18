import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/constants/languages";
import {
  readI18nConfig,
  persistI18nConfig,
  setOverlayValue,
  setFieldOptionTranslation,
  getOverlayValue,
  getFieldOptionTranslation,
  computeStepCoverage,
  computeFieldCoverage,
  DEFAULT_FORM_LOCALE,
  type FormI18nConfig,
  type LocaleCoverage,
} from "@/lib/formI18n";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  GripVertical,
  Plus,
  Trash2,
  Type,
  Mail,
  Phone,
  Hash,
  Calendar,
  Link,
  AlignLeft,
  CheckSquare,
  ListChecks,
  CircleDot,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  Smartphone,
  Monitor,
  Tablet,
  X,
  Zap,
  Image as ImageIcon,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { CONTACT_FIELDS, CLIENT_FIELDS, CONTACT_FIELD_DEFAULTS } from "@/constants/fieldMappings";
import { IconGallery, LucideIcon, normalizeLucideIconName } from "@/components/campaigns/IconGallery";

// Field Types with icons
const FIELD_TYPES = [
  { value: "text", label: "Texto", icon: Type },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Telefone", icon: Phone },
  { value: "number", label: "Número", icon: Hash },
  { value: "date", label: "Data", icon: Calendar },
  { value: "datetime", label: "Data e Hora", icon: Calendar },
  { value: "boolean", label: "Sim/Não", icon: CheckSquare },
  { value: "select", label: "Dropdown", icon: ChevronDown },
  { value: "textarea", label: "Texto Longo", icon: AlignLeft },
  { value: "url", label: "URL", icon: Link },
  { value: "radio", label: "Radio", icon: CircleDot },
  { value: "checkbox", label: "Checkbox", icon: ListChecks },
];

const SYSTEM_FIELD_TYPES = [
  { value: "ref_district", label: "Distrito", icon: Layers },
  { value: "ref_service", label: "Serviço", icon: Layers },
  { value: "ref_product", label: "Produto", icon: Layers },
  { value: "ref_business_unit", label: "Unidade de Negócio", icon: Layers },
  { value: "ref_department", label: "Departamento", icon: Layers },
  { value: "list_districts", label: "Lista Distritos", icon: ListChecks },
  { value: "list_services", label: "Lista Serviços", icon: ListChecks },
  { value: "list_products", label: "Lista Produtos", icon: ListChecks },
];

interface FormStep {
  id: string;
  form_id: string;
  step_number: number;
  step_title: string;
  step_description: string | null;
  step_subtitle: string | null;
  next_button_text: string | null;
  previous_button_text: string | null;
  submit_button_text: string | null;
  sort_order: number;
  step_type: string;
  scheduling_duration_minutes: number | null;
  scheduling_board_id: string | null;
  scheduling_postal_code_field_key: string | null;
}

interface FormField {
  id: string;
  form_id: string;
  step_number: number;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  is_active: boolean;
  placeholder: string | null;
  help_text: string | null;
  options: any;
  display_style: string | null;
  sort_order: number;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  option_icon_names?: any;
}

interface FormBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
  companyId: string;
  formType?: string;
}

const OPTION_BASED_FIELD_TYPES = ["select", "radio", "checkbox"];

const isOptionBasedField = (fieldType: string) => OPTION_BASED_FIELD_TYPES.includes(fieldType);

const getFieldOptionValues = (options: unknown): string[] => {
  if (Array.isArray(options)) {
    return options.filter((option): option is string => typeof option === "string" && option.trim().length > 0);
  }

  if (options && typeof options === "object" && Array.isArray((options as { options?: unknown[] }).options)) {
    return (options as { options: unknown[] }).options.filter(
      (option): option is string => typeof option === "string" && option.trim().length > 0
    );
  }

  return [];
};

const buildFieldOptionsPayload = (existingOptions: unknown, nextOptions: string[]) => {
  if (Array.isArray(existingOptions)) {
    return nextOptions;
  }

  if (existingOptions && typeof existingOptions === "object") {
    return {
      ...(existingOptions as Record<string, unknown>),
      options: nextOptions,
    };
  }

  return { options: nextOptions };
};

// Sortable Step Component
// Internal-only badge for translation coverage (Form Builder UI; never rendered on public surfaces)
function LocaleBadge({ code, coverage }: { code: string; coverage: LocaleCoverage }) {
  if (coverage.total === 0) return null;
  const complete = coverage.translated >= coverage.total;
  const upper = code.toUpperCase();
  return (
    <span
      title={`${coverage.translated}/${coverage.total} traduzidos`}
      className={`inline-flex items-center gap-0.5 rounded-sm border px-1 py-0 text-[10px] leading-4 font-medium select-none ${
        complete
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      🌐 {upper}{complete ? " ✓" : ""}
    </span>
  );
}

function SortableStep({ 
  step, 
  fields, 
  isActive,
  onSelect,
  onDelete,
  onFieldSelect,
  selectedFieldId,
  onFieldReorder,
  onTitleChange,
  i18nConfig,
  secondaryLocales,
}: { 
  step: FormStep;
  fields: FormField[];
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onFieldSelect: (field: FormField | null) => void;
  selectedFieldId: string | null;
  onFieldReorder: (fieldId: string, direction: 'up' | 'down') => void;
  onTitleChange: (newTitle: string) => Promise<void>;
  i18nConfig: FormI18nConfig;
  secondaryLocales: string[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(step.step_title ?? "");

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(step.step_title ?? "");
  }, [step.step_title, isEditingTitle]);

  const commitTitle = async () => {
    const next = titleDraft.trim();
    setIsEditingTitle(false);
    if (next === (step.step_title ?? "")) return;
    await onTitleChange(next);
  };

  const cancelTitle = () => {
    setTitleDraft(step.step_title ?? "");
    setIsEditingTitle(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`border rounded-lg overflow-hidden transition-all ${
        isActive ? 'ring-2 ring-primary border-primary' : 'border-border'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div 
        className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${
          isActive ? 'bg-primary/10' : 'bg-muted/50 hover:bg-muted'
        }`}
        onClick={onSelect}
      >
        <button {...attributes} {...listeners} className="cursor-grab hover:bg-muted p-1 rounded" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Badge variant={step.step_type === 'scheduling' ? 'secondary' : 'default'} className="text-sm px-2 py-0.5">
          {step.step_type === 'scheduling' ? <Calendar className="h-3 w-3" /> : step.step_number}
        </Badge>
        {isEditingTitle ? (
          <Input
            value={titleDraft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTitle();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelTitle();
              }
            }}
            placeholder="Sem título"
            className="flex-1 h-7 text-sm"
          />
        ) : (
          <span
            className={`flex-1 font-medium text-sm truncate hover:underline ${
              step.step_title ? '' : 'text-muted-foreground italic'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              setIsEditingTitle(true);
            }}
            title="Clica para editar (deixa vazio para esconder no formulário público)"
          >
            {step.step_title || "Sem título"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {step.step_type === 'scheduling' ? '📅 Agendamento' : `${fields.length} campos`}
        </span>
        {secondaryLocales.length > 0 && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {secondaryLocales.map((loc) => (
              <LocaleBadge key={loc} code={loc} coverage={computeStepCoverage(i18nConfig, loc, step)} />
            ))}
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {isActive && (
        <div className="p-2 space-y-1 bg-background">
          {step.step_type === 'scheduling' ? (
            <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
              Passo de Agendamento
              <p className="text-xs mt-1">Configuração no painel lateral</p>
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              Arraste campos aqui ou adicione um novo
            </div>
          ) : (
            fields.map((field, index) => (
              <SortableField 
                key={field.id} 
                field={field} 
                isSelected={selectedFieldId === field.id}
                onSelect={() => onFieldSelect(field)}
                canMoveUp={index > 0}
                canMoveDown={index < fields.length - 1}
                onMoveUp={() => onFieldReorder(field.id, 'up')}
                onMoveDown={() => onFieldReorder(field.id, 'down')}
                i18nConfig={i18nConfig}
                secondaryLocales={secondaryLocales}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Sortable Field Component
function SortableField({ 
  field, 
  isSelected,
  onSelect,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  i18nConfig,
  secondaryLocales,
}: { 
  field: FormField;
  isSelected: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  i18nConfig: FormI18nConfig;
  secondaryLocales: string[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const fieldType = [...FIELD_TYPES, ...SYSTEM_FIELD_TYPES].find(t => t.value === field.field_type);
  const IconComponent = fieldType?.icon || Type;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all ${
        isSelected 
          ? 'bg-primary/10 ring-1 ring-primary' 
          : 'hover:bg-muted/50'
      } ${isDragging ? 'shadow-md' : ''}`}
      onClick={onSelect}
    >
      <button {...attributes} {...listeners} className="cursor-grab p-1 rounded hover:bg-muted" onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      <IconComponent className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-sm truncate">{field.field_label}</span>
      {field.contact_field_mapping && (
        <Zap className="h-3 w-3 text-primary flex-shrink-0" />
      )}
      {field.is_required && (
        <span className="text-destructive text-xs">*</span>
      )}
      {secondaryLocales.length > 0 && (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {secondaryLocales.map((loc) => (
            <LocaleBadge key={loc} code={loc} coverage={computeFieldCoverage(i18nConfig, loc, field)} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveUp} disabled={!canMoveUp}>
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onMoveDown} disabled={!canMoveDown}>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// Field Preview Component
function FieldPreview({
  field,
  branding,
  displayLabel,
  displayPlaceholder,
  displayHelpText,
  displayOptions,
}: {
  field: FormField;
  branding?: any;
  displayLabel?: string;
  displayPlaceholder?: string;
  displayHelpText?: string;
  displayOptions?: string[];
}) {
  const inputStyle = {
    borderColor: branding?.input_border_color || undefined,
    borderRadius: branding?.input_border_radius || undefined,
    backgroundColor: branding?.input_background_color || undefined,
  };
  const baseOptions = getFieldOptionValues(field.options);
  const previewOptions = displayOptions && displayOptions.length === baseOptions.length
    ? displayOptions
    : baseOptions;
  const effectiveLabel = displayLabel ?? field.field_label;
  const effectivePlaceholder = displayPlaceholder ?? (field.placeholder ?? "");
  const effectiveHelpText = displayHelpText ?? (field.help_text ?? "");
  const optionIcons: Record<string, string> = (field.option_icon_names && typeof field.option_icon_names === "object")
    ? (field.option_icon_names as Record<string, string>)
    : {};
  const resolveOptionIconName = (option: string) => {
    const raw = String(option || "");
    const trimmed = raw.trim();
    const norm = trimmed.toLowerCase();

    const direct = optionIcons[raw] || optionIcons[trimmed];
    if (direct) return direct;

    const normalizedHit = Object.keys(optionIcons).find((key) => String(key || "").trim().toLowerCase() === norm);
    if (normalizedHit) return optionIcons[normalizedHit];

    if (norm.includes('urgente') || norm.includes('urgent')) return 'Zap';
    if (norm.includes('normal') || norm.includes('prazo')) return 'Clock';
    if (norm.includes('cozinha') || norm.includes('kitchen')) return 'Utensils';
    if (norm.includes('banho') || norm.includes('bath') || norm.includes('wc')) return 'Bath';
    if (norm.includes('quarto') || norm.includes('bedroom')) return 'BedDouble';
    if (norm.includes('sala')) return 'Sofa';
    if (norm.includes('escritório') || norm.includes('escritorio') || norm.includes('office')) return 'Briefcase';
    if (norm.includes('edifí') || norm.includes('edific') || norm.includes('building')) return 'Building2';
    if (norm.includes('casa') || norm.includes('home') || norm.includes('moradia')) return 'Home';
    if (norm.includes('apartamento') || norm.includes('apartment')) return 'Building';
    if (norm.includes('loja') || norm.includes('store') || norm.includes('comercial')) return 'Store';
    if (norm.includes('armazém') || norm.includes('armazem') || norm.includes('warehouse')) return 'Warehouse';
    if (norm.includes('hotel')) return 'Hotel';
    if (norm.includes('escola') || norm.includes('school')) return 'School';
    if (norm.includes('pavimento') || norm.includes('chão') || norm.includes('chao') || norm.includes('soalho') || norm.includes('floor') || norm.includes('spc') || norm.includes('pvc') || norm.includes('vinílico') || norm.includes('vinilico')) return 'Layers';
    if (norm.includes('parede') || norm.includes('wall')) return 'SquareStack';
    if (norm.includes('teto') || norm.includes('tecto') || norm.includes('ceiling')) return 'LampCeiling';
    if (norm.includes('porta') || norm.includes('door')) return 'DoorOpen';
    if (norm.includes('janela') || norm.includes('window')) return 'Grid2x2';
    if (norm.includes('limpeza') || norm.includes('cleaning')) return 'Sparkles';
    if (norm.includes('manutenção') || norm.includes('manutencao') || norm.includes('maintenance')) return 'Settings';
    if (norm.includes('reparação') || norm.includes('reparacao') || norm.includes('repair') || norm.includes('conserto')) return 'Wrench';
    if (norm.includes('pintura') || norm.includes('paint')) return 'Paintbrush';
    if (norm.includes('canaliz') || norm.includes('plumbing') || norm.includes('águas') || norm.includes('aguas')) return 'Pipette';
    if (norm.includes('elétric') || norm.includes('electric') || norm.includes('eletric')) return 'Plug';
    if (norm.includes('jardin') || norm.includes('garden') || norm.includes('jardim')) return 'Trees';
    if (norm.includes('porteiro') || norm.includes('portaria') || norm.includes('segurança') || norm.includes('seguranca') || norm.includes('security')) return 'Shield';
    if (norm.includes('facility') || norm.includes('facilit')) return 'Building2';
    if (norm.includes('gestão') || norm.includes('gestao') || norm.includes('management')) return 'ClipboardList';
    if (norm.includes('remodel') || norm.includes('renov')) return 'Hammer';
    if (norm.includes('construç') || norm.includes('construc') || norm.includes('obra')) return 'HardHat';
    if (norm.includes('mudança') || norm.includes('mudanca') || norm.includes('moving')) return 'Truck';
    if (norm.includes('sim') || norm.includes('yes')) return 'Check';
    if (norm.includes('não') || norm.includes('nao') || norm === 'no') return 'X';
    if (norm.includes('outro') || norm.includes('other')) return 'HelpCircle';
    return null;
  };
  
  const renderInput = () => {
    switch (field.field_type) {
      case 'textarea':
        return <Textarea placeholder={effectivePlaceholder || `Enter ${effectiveLabel.toLowerCase()}...`} className="bg-muted/30" style={inputStyle} disabled />;
      case 'select':
      case 'ref_district':
      case 'ref_service':
      case 'ref_product':
      case 'ref_business_unit':
      case 'ref_department':
        return (
          <div className="space-y-2">
            <Select disabled>
              <SelectTrigger className="bg-muted/30" style={inputStyle}>
                <SelectValue placeholder={effectivePlaceholder || "Selecione..."} />
              </SelectTrigger>
            </Select>
            {previewOptions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {previewOptions.map((opt) => {
                  const iconName = resolveOptionIconName(opt);
                  return (
                    <Badge key={opt} variant="secondary" className="text-[11px] font-normal flex items-center gap-1">
                      {iconName && <LucideIcon name={iconName} className="h-3 w-3" />}
                      {opt}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch disabled />
            <span className="text-sm text-muted-foreground">Sim / Não</span>
          </div>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {(previewOptions.length > 0 ? previewOptions : ['Opção 1', 'Opção 2', 'Opção 3']).map((opt, i) => {
              const iconName = resolveOptionIconName(opt);
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: branding?.primary_color || 'hsl(var(--muted-foreground))' }} />
                  {iconName && <LucideIcon name={iconName} className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm">{opt}</span>
                </div>
              );
            })}
          </div>
        );
      case 'checkbox':
      case 'list_districts':
      case 'list_services':
      case 'list_products':
        return (
          <div className="space-y-2">
            {(previewOptions.length > 0 ? previewOptions : ['Opção 1', 'Opção 2', 'Opção 3']).map((opt, i) => {
              const iconName = resolveOptionIconName(opt);
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2" style={{ borderColor: branding?.primary_color || 'hsl(var(--muted-foreground))' }} />
                  {iconName && <LucideIcon name={iconName} className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm">{opt}</span>
                </div>
              );
            })}
          </div>
        );
      default:
        return (
          <Input 
            type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
            placeholder={effectivePlaceholder || `Enter ${effectiveLabel.toLowerCase()}...`}
            className="bg-muted/30"
            style={inputStyle}
            disabled
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1" style={{ color: branding?.text_color || undefined }}>
        {effectiveLabel}
        {field.is_required && <span className="text-destructive">*</span>}
      </Label>
      {renderInput()}
      {effectiveHelpText && (
        <p className="text-xs text-muted-foreground">{effectiveHelpText}</p>
      )}
    </div>
  );
}

export function FormBuilder({
  open,
  onOpenChange,
  formId,
  formName,
  companyId,
  formType,
}: FormBuilderProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  
  const [steps, setSteps] = useState<FormStep[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [branding, setBranding] = useState<any>(null);
  const [i18nConfig, setI18nConfig] = useState<FormI18nConfig>({
    default_locale: DEFAULT_FORM_LOCALE,
    enabled_locales: [],
    content: {},
  });
  const [activeLocale, setActiveLocale] = useState<string>(DEFAULT_FORM_LOCALE);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [activePreviewStep, setActivePreviewStep] = useState(1);
  const [showStepTypeMenu, setShowStepTypeMenu] = useState(false);
  const [scheduleBoards, setScheduleBoards] = useState<{id: string; name: string}[]>([]);
  const [newOptionValue, setNewOptionValue] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerOption, setIconPickerOption] = useState<string | null>(null);
  
  const [newField, setNewField] = useState({
    field_key: "",
    field_label: "",
    field_type: "text",
    is_required: false,
    placeholder: "",
    help_text: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open && formId) {
      loadSteps();
      loadFields();
      loadBranding();
      loadScheduleBoards();
      loadI18nConfig();
    }
  }, [open, formId]);

  const loadI18nConfig = async () => {
    const { data } = await supabase.from("forms").select("settings").eq("id", formId).maybeSingle();
    const cfg = readI18nConfig(data?.settings);
    setI18nConfig(cfg);
    setActiveLocale(cfg.default_locale || DEFAULT_FORM_LOCALE);
  };

  const availableLocales = useMemo(() => {
    const def = i18nConfig.default_locale || DEFAULT_FORM_LOCALE;
    return [def, ...(i18nConfig.enabled_locales || []).filter((l) => l !== def)];
  }, [i18nConfig]);

  // Locales other than the default — used by internal-only translation badges.
  const secondaryLocales = useMemo(() => {
    const def = i18nConfig.default_locale || DEFAULT_FORM_LOCALE;
    return (i18nConfig.enabled_locales || []).filter((l) => l !== def);
  }, [i18nConfig]);

  const isDefaultLocale = activeLocale === (i18nConfig.default_locale || DEFAULT_FORM_LOCALE);

  /** Persist a translation overlay change to settings.i18n. */
  const updateOverlay = async (mutator: (cfg: FormI18nConfig) => FormI18nConfig) => {
    const next = mutator(i18nConfig);
    setI18nConfig(next);
    try {
      await persistI18nConfig(formId, next);
    } catch (e) {
      console.error("Failed to persist i18n overlay", e);
      toast({ title: "Erro ao guardar tradução", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (steps.length > 0 && !activeStepId) {
      setActiveStepId(steps[0].id);
    }
  }, [steps, activeStepId]);

  useEffect(() => {
    setNewOptionValue("");
  }, [selectedField?.id]);

  const loadSteps = async () => {
    const { data, error } = await supabase
      .from("form_steps")
      .select("*")
      .eq("form_id", formId)
      .order("step_number");

    if (error) {
      console.error("Error loading steps:", error);
    } else if (data && data.length > 0) {
      setSteps(data);
    } else {
      const { data: newStep } = await supabase
        .from("form_steps")
        .insert({
          form_id: formId,
          step_number: 1,
          step_title: "Informações Básicas",
          sort_order: 0,
        })
        .select()
        .single();
      
      if (newStep) setSteps([newStep]);
    }
  };

  const loadFields = async () => {
    const { data, error } = await supabase
      .from("form_fields")
      .select("*")
      .eq("form_id", formId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading fields:", error);
    } else {
      setFields(data || []);
    }
  };

  const loadBranding = async () => {
    const { data, error } = await supabase
      .from("form_branding")
      .select("*")
      .eq("form_id", formId)
      .maybeSingle();

    if (error) {
      console.error("Error loading branding:", error);
    } else {
      setBranding(data);
    }
  };

  const loadScheduleBoards = async () => {
    let query = supabase
      .from("schedule_boards")
      .select("id, name")
      .eq("is_active", true);
    
    if (activeCompany?.id) {
      query = query.eq("organization_id", activeCompany.id);
    }

    const { data } = await query.order("name");
    setScheduleBoards(data || []);
  };

  const getFieldsForStep = (stepNumber: number) => {
    return fields.filter(f => f.step_number === stepNumber).sort((a, b) => a.sort_order - b.sort_order);
  };

  const handleAddStep = async (stepType: 'fields' | 'scheduling' = 'fields') => {
    const nextNumber = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
    
    const insertData: any = {
      form_id: formId,
      step_number: nextNumber,
      step_title: stepType === 'scheduling' ? 'Agendamento' : `Passo ${nextNumber}`,
      sort_order: nextNumber - 1,
      step_type: stepType,
    };

    if (stepType === 'scheduling') {
      insertData.scheduling_duration_minutes = 60;
      insertData.scheduling_board_id = scheduleBoards.length > 0 ? scheduleBoards[0].id : null;
    }

    const { data, error } = await supabase
      .from("form_steps")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar passo", variant: "destructive" });
    } else if (data) {
      setSteps([...steps, data]);
      setActiveStepId(data.id);
      setShowStepTypeMenu(false);
      toast({ title: stepType === 'scheduling' ? "Passo de agendamento adicionado" : "Passo adicionado" });
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    if (steps.length <= 1) {
      toast({ title: "É necessário pelo menos um passo", variant: "destructive" });
      return;
    }

    const stepFields = getFieldsForStep(step.step_number);
    
    // Auto-move orphaned fields to the nearest non-scheduling step
    if (stepFields.length > 0) {
      const otherSteps = steps
        .filter(s => s.id !== stepId && s.step_type !== 'scheduling')
        .sort((a, b) => a.step_number - b.step_number);
      
      if (otherSteps.length === 0) {
        toast({ title: "Não há passos disponíveis para mover os campos", variant: "destructive" });
        return;
      }
      
      const targetStep = otherSteps[0];
      for (const f of stepFields) {
        await supabase.from("form_fields").update({ step_number: targetStep.step_number }).eq("id", f.id);
      }
      setFields(fields.map(f => 
        stepFields.find(sf => sf.id === f.id) 
          ? { ...f, step_number: targetStep.step_number } 
          : f
      ));
      toast({ title: `${stepFields.length} campo(s) movido(s) para "${targetStep.step_title}"` });
    }

    const { error } = await supabase.from("form_steps").delete().eq("id", stepId);

    if (!error) {
      const newSteps = steps.filter(s => s.id !== stepId);
      setSteps(newSteps);
      if (activeStepId === stepId && newSteps.length > 0) {
        setActiveStepId(newSteps[0].id);
      }
      toast({ title: "Passo eliminado" });
    }
  };

  const handleAddField = async () => {
    if (!newField.field_key || !newField.field_label) {
      toast({ title: "Preencha a chave e o label", variant: "destructive" });
      return;
    }

    const activeStep = steps.find(s => s.id === activeStepId);
    if (!activeStep) return;

    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    const stepFields = getFieldsForStep(activeStep.step_number);

    const { data, error } = await supabase
      .from("form_fields")
      .insert({
        form_id: formId,
        field_key: newField.field_key.toLowerCase().replace(/\s+/g, "_"),
        field_label: newField.field_label,
        field_type: newField.field_type,
        is_required: newField.is_required,
        is_unique: false,
        is_active: true,
        sort_order: stepFields.length,
        step_number: activeStep.step_number,
        placeholder: newField.placeholder || null,
        help_text: newField.help_text || null,
        created_by: businessUserId,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar campo", variant: "destructive" });
    } else if (data) {
      setFields([...fields, data]);
      setNewField({ field_key: "", field_label: "", field_type: "text", is_required: false, placeholder: "", help_text: "" });
      setSelectedField(data);
      toast({ title: "Campo adicionado" });
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    const { error } = await supabase
      .from("form_fields")
      .update({ is_active: false })
      .eq("id", fieldId);

    if (!error) {
      setFields(fields.filter(f => f.id !== fieldId));
      if (selectedField?.id === fieldId) setSelectedField(null);
      toast({ title: "Campo eliminado" });
    }
  };

  const handleUpdateField = async (fieldId: string, updates: Partial<FormField>) => {
    const { error, data } = await supabase
      .from("form_fields")
      .update(updates)
      .eq("id", fieldId)
      .select()
      .single();

    if (error) {
      toast({
        title: "Erro ao guardar campo",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }

    if (data) {
      setFields(fields.map(f => f.id === fieldId ? { ...f, ...data } : f));
      if (selectedField?.id === fieldId) {
        setSelectedField({ ...selectedField, ...data });
      }
    }

    return data;
  };

  /**
   * Locale-aware field text writer.
   * - Default locale → writes to base column (form_fields).
   * - Secondary locale → writes to settings.i18n overlay only.
   */
  const handleUpdateFieldText = async (
    fieldId: string,
    key: "field_label" | "placeholder" | "help_text",
    value: string,
  ) => {
    if (isDefaultLocale) {
      await handleUpdateField(fieldId, { [key]: value || null } as Partial<FormField>);
      return;
    }
    const overlayKey = key === "field_label" ? "label" : key;
    await updateOverlay((cfg) => setOverlayValue(cfg, "fields", fieldId, activeLocale, overlayKey, value));
  };

  /** Locale-aware step title writer. */
  const handleUpdateStepTitle = async (stepId: string, value: string) => {
    if (isDefaultLocale) {
      await supabase.from("form_steps").update({ step_title: value }).eq("id", stepId);
      setSteps(steps.map((s) => (s.id === stepId ? { ...s, step_title: value } : s)));
      return;
    }
    await updateOverlay((cfg) => setOverlayValue(cfg, "steps", stepId, activeLocale, "title", value));
  };

  /**
   * Resolve the displayed value for a field text in the current locale.
   * In default locale → base column. In secondary → overlay value (or empty if none).
   */
  const getDisplayedFieldText = (
    field: FormField,
    key: "field_label" | "placeholder" | "help_text",
  ): string => {
    if (isDefaultLocale) {
      return ((field as any)[key] as string) || "";
    }
    const overlayKey = key === "field_label" ? "label" : key;
    return getOverlayValue(i18nConfig, "fields", field.id, activeLocale, overlayKey) || "";
  };

  /** Placeholder shown to translators in secondary locales (the base value as reference). */
  const getBaseTextPlaceholder = (
    field: FormField,
    key: "field_label" | "placeholder" | "help_text",
  ): string => {
    return ((field as any)[key] as string) || "";
  };

  const getDisplayedStepTitle = (step: FormStep): string => {
    if (isDefaultLocale) return step.step_title || "";
    return (
      getOverlayValue(i18nConfig, "steps", step.id, activeLocale, "title") || ""
    );
  };

  // Preview-only helpers: show overlay when present, otherwise fall back to base
  // text so the central preview always renders something readable.
  const getPreviewStepTitle = (step: FormStep): string => {
    if (isDefaultLocale) return step.step_title || "";
    return (
      getOverlayValue(i18nConfig, "steps", step.id, activeLocale, "title") ||
      step.step_title ||
      ""
    );
  };

  const getPreviewFieldText = (
    field: FormField,
    key: "label" | "placeholder" | "help_text",
  ): string => {
    const baseKey = key === "label" ? "field_label" : key;
    const baseVal = ((field as any)[baseKey] as string | null) || "";
    if (isDefaultLocale) return baseVal;
    return getOverlayValue(i18nConfig, "fields", field.id, activeLocale, key) || baseVal;
  };

  const getPreviewFieldOptions = (field: FormField): string[] => {
    const base = getFieldOptionValues(field.options);
    if (isDefaultLocale) return base;
    return base.map((opt, i) =>
      getFieldOptionTranslation(i18nConfig, field.id, activeLocale, String(i)) || opt,
    );
  };

  const getPreviewBrandingText = (key: string, fallback: string): string => {
    const baseVal = (branding?.[key] as string) || fallback;
    if (isDefaultLocale) return baseVal;
    return getOverlayValue(i18nConfig, "branding", "branding", activeLocale, key) || baseVal;
  };

  const handleAddFieldOption = async () => {
    if (!selectedField || !isOptionBasedField(selectedField.field_type)) return;

    const nextOption = newOptionValue.trim();
    if (!nextOption) return;

    const currentOptions = getFieldOptionValues(selectedField.options);
    if (currentOptions.some((option) => option.toLowerCase() === nextOption.toLowerCase())) {
      toast({ title: "Essa opção já existe", variant: "destructive" });
      return;
    }

    await handleUpdateField(selectedField.id, {
      options: buildFieldOptionsPayload(selectedField.options, [...currentOptions, nextOption]),
    });
    setNewOptionValue("");
  };

  const handleUpdateFieldOption = async (index: number, value: string) => {
    if (!selectedField || !isOptionBasedField(selectedField.field_type)) return;

    const currentOptions = getFieldOptionValues(selectedField.options);

    // In a secondary locale we never mutate the base options array — only the overlay.
    if (!isDefaultLocale) {
      const optionId = String(index); // legacy fallback id (must match get-form-data)
      await updateOverlay((cfg) =>
        setFieldOptionTranslation(cfg, selectedField.id, activeLocale, optionId, value),
      );
      return;
    }

    const previousOption = currentOptions[index];
    const nextOptions = currentOptions.map((option, optionIndex) =>
      optionIndex === index ? value : option
    );

    const currentIcons = (selectedField.option_icon_names && typeof selectedField.option_icon_names === "object")
      ? { ...(selectedField.option_icon_names as Record<string, string>) }
      : {};

    if (previousOption && previousOption !== value && currentIcons[previousOption]) {
      currentIcons[value] = currentIcons[previousOption];
      delete currentIcons[previousOption];
    }

    await handleUpdateField(selectedField.id, {
      options: buildFieldOptionsPayload(selectedField.options, nextOptions),
      option_icon_names: currentIcons,
    });
  };

  const handleRemoveFieldOption = async (index: number) => {
    if (!selectedField || !isOptionBasedField(selectedField.field_type)) return;

    const currentOptions = getFieldOptionValues(selectedField.options);
    const removedOption = currentOptions[index];
    const nextOptions = currentOptions.filter((_, optionIndex) => optionIndex !== index);

    const currentIcons = (selectedField.option_icon_names && typeof selectedField.option_icon_names === "object")
      ? { ...(selectedField.option_icon_names as Record<string, string>) }
      : {};
    if (removedOption) delete currentIcons[removedOption];

    await handleUpdateField(selectedField.id, {
      options: buildFieldOptionsPayload(selectedField.options, nextOptions),
      option_icon_names: currentIcons,
    });
  };

  const handleSetOptionIcon = async (iconName: string) => {
    if (!selectedField || !iconPickerOption) return;

    const currentIcons = (selectedField.option_icon_names && typeof selectedField.option_icon_names === "object")
      ? { ...(selectedField.option_icon_names as Record<string, string>) }
      : {};

    const normalizedIconName = normalizeLucideIconName(iconName);

    if (normalizedIconName) {
      currentIcons[iconPickerOption] = normalizedIconName;
    } else {
      delete currentIcons[iconPickerOption];
    }

    const savedField = await handleUpdateField(selectedField.id, { option_icon_names: currentIcons });

    if (savedField) {
      setIconPickerOpen(false);
      setIconPickerOption(null);
      toast({ title: "Ícone guardado" });
    }
  };

  const handleFieldReorder = async (fieldId: string, direction: 'up' | 'down') => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const stepFields = getFieldsForStep(field.step_number);
    const currentIndex = stepFields.findIndex(f => f.id === fieldId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= stepFields.length) return;

    const reorderedFields = arrayMove(stepFields, currentIndex, newIndex);
    
    const updates = reorderedFields.map((f, i) => ({ id: f.id, sort_order: i }));

    for (const update of updates) {
      await supabase.from("form_fields").update({ sort_order: update.sort_order }).eq("id", update.id);
    }

    setFields(fields.map(f => {
      const updateInfo = updates.find(u => u.id === f.id);
      return updateInfo ? { ...f, sort_order: updateInfo.sort_order } : f;
    }));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isStep = steps.some(s => s.id === active.id);
    if (isStep) {
      const oldIndex = steps.findIndex(s => s.id === active.id);
      const newIndex = steps.findIndex(s => s.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        // Build a map from old step_number -> new step_number
        const reorderedSteps = arrayMove(steps, oldIndex, newIndex);
        const updatedSteps = reorderedSteps.map((s, i) => ({ ...s, step_number: i + 1, sort_order: i }));
        
        const stepNumberMap: Record<number, number> = {};
        steps.forEach((oldStep, _i) => {
          const newStep = updatedSteps.find(s => s.id === oldStep.id);
          if (newStep) stepNumberMap[oldStep.step_number] = newStep.step_number;
        });
        
        // Update fields to follow their step's new step_number
        const updatedFields = fields.map(f => {
          const newStepNumber = stepNumberMap[f.step_number];
          return newStepNumber !== undefined ? { ...f, step_number: newStepNumber } : f;
        });

        setSteps(updatedSteps);
        setFields(updatedFields);
        
        // Persist step order
        for (const step of updatedSteps) {
          await supabase.from("form_steps").update({ step_number: step.step_number, sort_order: step.sort_order }).eq("id", step.id);
        }
        // Persist field step_number updates
        for (const field of updatedFields) {
          await supabase.from("form_fields").update({ step_number: field.step_number }).eq("id", field.id);
        }
      }
    }
  };

  const getPreviewWidth = () => {
    switch (previewMode) {
      case 'mobile': return 'max-w-[375px]';
      case 'tablet': return 'max-w-[768px]';
      default: return 'max-w-[900px]';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b bg-background px-4 py-3 flex items-center justify-between">
          <DialogTitle className="text-lg font-semibold">
            Form Builder - {formName}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {availableLocales.length > 1 && (
              <Select value={activeLocale} onValueChange={setActiveLocale}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLocales.map((loc) => {
                    const lang = LANGUAGES.find((l) => l.code === loc);
                    const isDef = loc === (i18nConfig.default_locale || DEFAULT_FORM_LOCALE);
                    return (
                      <SelectItem key={loc} value={loc}>
                        {lang?.name || loc.toUpperCase()} {isDef ? "(principal)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            <div className="flex border rounded-lg overflow-hidden">
              <Button variant={previewMode === 'desktop' ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode('desktop')} className="rounded-none">
                <Monitor className="h-4 w-4" />
              </Button>
              <Button variant={previewMode === 'tablet' ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode('tablet')} className="rounded-none">
                <Tablet className="h-4 w-4" />
              </Button>
              <Button variant={previewMode === 'mobile' ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewMode('mobile')} className="rounded-none">
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel */}
          <div className="w-80 flex-shrink-0 border-r bg-muted/30 overflow-hidden flex flex-col">
            <div className="p-3 border-b bg-background flex items-center justify-between">
              <span className="font-medium text-sm">Estrutura</span>
              <div className="relative">
                <Button size="sm" variant="outline" onClick={() => setShowStepTypeMenu(!showStepTypeMenu)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Passo
                </Button>
                {showStepTypeMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-lg overflow-hidden w-48">
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => handleAddStep('fields')}
                    >
                      <Layers className="h-4 w-4" />
                      Passo de Campos
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                      onClick={() => handleAddStep('scheduling')}
                    >
                      <Calendar className="h-4 w-4" />
                      Passo de Agendamento
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    {steps.map(step => (
                      <SortableStep
                        key={step.id}
                        step={step}
                        fields={getFieldsForStep(step.step_number)}
                        isActive={activeStepId === step.id}
                        onSelect={() => setActiveStepId(step.id)}
                        onDelete={() => handleDeleteStep(step.id)}
                        onFieldSelect={setSelectedField}
                        selectedFieldId={selectedField?.id || null}
                        onFieldReorder={handleFieldReorder}
                        onTitleChange={async (newTitle) => {
                          await handleUpdateStepTitle(step.id, newTitle);
                        }}
                        i18nConfig={i18nConfig}
                        secondaryLocales={secondaryLocales}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </ScrollArea>

            {/* Add Property + Add Field */}
            <div className="p-3 border-t bg-background space-y-3">
              {/* Add Property from mapping */}
              <div className="space-y-2">
                <span className="font-medium text-sm flex items-center gap-1">
                  <Zap className="h-3 w-3 text-primary" />
                  Adicionar Propriedade
                </span>
                <Select
                  value=""
                  onValueChange={async (mapping) => {
                    const prop = CONTACT_FIELDS.find(f => f.value === mapping);
                    if (!prop || !mapping) return;
                    const activeStep = steps.find(s => s.id === activeStepId);
                    if (!activeStep) return;

                    // Check duplicate mapping
                    const alreadyMapped = fields.some(f => f.contact_field_mapping === mapping);
                    if (alreadyMapped) {
                      toast({ title: "Esta propriedade já está mapeada neste form", variant: "destructive" });
                      return;
                    }

                    const defaults = CONTACT_FIELD_DEFAULTS[mapping] || { field_type: "text", is_required: false };
                    const businessUserId = await resolveCurrentBusinessUserId();
                    if (!businessUserId) throw new Error("Business user not resolved");
                    const stepFields = getFieldsForStep(activeStep.step_number);

                    const { data, error } = await supabase
                      .from("form_fields")
                      .insert({
                        form_id: formId,
                        field_key: mapping,
                        field_label: prop.label,
                        field_type: defaults.field_type,
                        is_required: defaults.is_required,
                        is_unique: false,
                        is_active: true,
                        sort_order: stepFields.length,
                        step_number: activeStep.step_number,
                        contact_field_mapping: mapping,
                        created_by: businessUserId,
                      })
                      .select()
                      .single();

                    if (error) {
                      toast({ title: "Erro ao adicionar propriedade", variant: "destructive" });
                    } else if (data) {
                      setFields([...fields, data]);
                      setSelectedField(data);
                      toast({ title: `Propriedade "${prop.label}" adicionada` });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecionar propriedade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_FIELDS.filter(f => f.value && !fields.some(ff => ff.contact_field_mapping === f.value)).map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Manual field add */}
              <span className="font-medium text-sm">Campo Extra</span>
              <div className="space-y-2">
                <Input
                  placeholder="Chave (ex: observacoes)"
                  value={newField.field_key}
                  onChange={(e) => setNewField({ ...newField, field_key: e.target.value })}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Label (ex: Observações)"
                  value={newField.field_label}
                  onChange={(e) => setNewField({ ...newField, field_label: e.target.value })}
                  className="h-8 text-sm"
                />
                <Select value={newField.field_type} onValueChange={(v) => setNewField({ ...newField, field_type: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-3 w-3" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                    <Separator className="my-1" />
                    {SYSTEM_FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-3 w-3" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch checked={newField.is_required} onCheckedChange={(v) => setNewField({ ...newField, is_required: v })} />
                  <span className="text-xs">Obrigatório</span>
                </div>
                <Button size="sm" className="w-full" onClick={handleAddField}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          {/* Center - Preview */}
          <div className="flex-1 bg-muted/20 overflow-auto p-6" style={{ backgroundColor: branding?.background_color ? `${branding.background_color}20` : undefined }}>
            <div className={`mx-auto ${getPreviewWidth()} transition-all`}>
              <Card className="shadow-lg overflow-hidden" style={{ 
                backgroundColor: branding?.background_color || undefined,
                borderRadius: branding?.border_radius || undefined,
              }}>
                <CardHeader 
                  className="rounded-t-lg"
                  style={{ 
                    backgroundColor: branding?.primary_color || 'hsl(var(--primary))',
                    color: branding?.button_text_color || 'hsl(var(--primary-foreground))',
                  }}
                >
                  {branding?.logo_url && (
                    <img src={branding.logo_url} alt="Logo" className="h-8 mb-2 object-contain mx-auto" />
                  )}
                  <CardTitle className="text-center" style={{ 
                    fontFamily: branding?.heading_font_family || branding?.font_family || undefined,
                    color: branding?.button_text_color || undefined,
                  }}>
                    {getPreviewBrandingText("form_title", formName)}
                  </CardTitle>
                  {(() => {
                    const subtitle = getPreviewBrandingText("form_subtitle", "");
                    return subtitle ? (
                      <p className="text-center text-sm opacity-90 mt-1">{subtitle}</p>
                    ) : null;
                  })()}
                </CardHeader>
                <CardContent className="p-6" style={{ 
                  fontFamily: branding?.font_family || undefined,
                  color: branding?.text_color || undefined,
                }}>
                  {steps.length > 1 && (
                    <div className="flex items-center justify-center gap-2 mb-6">
                      {steps.map((step, i) => (
                        <div key={step.id} className="flex items-center">
                          <button
                            onClick={() => setActivePreviewStep(step.step_number)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors"
                            style={{
                              backgroundColor: activePreviewStep === step.step_number 
                                ? (branding?.primary_color || 'hsl(var(--primary))') 
                                : activePreviewStep > step.step_number 
                                  ? `${branding?.primary_color || 'hsl(var(--primary))'}33`
                                  : 'hsl(var(--muted))',
                              color: activePreviewStep === step.step_number 
                                ? (branding?.button_text_color || 'white') 
                                : activePreviewStep > step.step_number 
                                  ? (branding?.primary_color || 'hsl(var(--primary))')
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {step.step_number}
                          </button>
                          {i < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {(() => {
                    const previewStep = steps.find(s => s.step_number === activePreviewStep);
                    if (!previewStep) return null;
                    const title = getPreviewStepTitle(previewStep);
                    if (!title) return null;
                    return (
                      <div className="text-center mb-6">
                        <h3 className="text-lg font-semibold" style={{ fontFamily: branding?.heading_font_family || branding?.font_family || undefined }}>
                          {title}
                        </h3>
                      </div>
                    );
                  })()}

                  {(() => {
                    const previewStep = steps.find(s => s.step_number === activePreviewStep);
                    if (previewStep?.step_type === 'scheduling') {
                      return (
                        <div className="text-center py-12 space-y-4 border-2 border-dashed rounded-lg">
                          <Calendar className="h-10 w-10 mx-auto text-muted-foreground" />
                          <div>
                            <p className="font-medium text-muted-foreground">Passo de Agendamento</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Duração: {previewStep.scheduling_duration_minutes || 60} min
                            </p>
                            {previewStep.scheduling_board_id && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Board: {scheduleBoards.find(b => b.id === previewStep.scheduling_board_id)?.name || 'Configurado'}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            O utilizador verá um calendário com horários disponíveis
                          </p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="space-y-4">
                          {getFieldsForStep(activePreviewStep)
                            .filter(f => !(steps.some(s => s.step_type === 'scheduling') && f.field_type === 'ref_service'))
                            .map(field => (
                            <div 
                              key={field.id} 
                              className={`transition-all rounded-lg p-2 -m-2 ${
                                selectedField?.id === field.id ? 'ring-2' : 'hover:bg-muted/50 cursor-pointer'
                              }`}
                              style={{
                                boxShadow: selectedField?.id === field.id ? `0 0 0 2px ${branding?.primary_color || 'hsl(var(--primary))'}` : undefined,
                                backgroundColor: selectedField?.id === field.id ? `${branding?.primary_color || 'hsl(var(--primary))'}10` : undefined,
                              }}
                              onClick={() => setSelectedField(field)}
                            >
                              <FieldPreview
                                field={field}
                                branding={branding}
                                displayLabel={isDefaultLocale ? undefined : getPreviewFieldText(field, "label")}
                                displayPlaceholder={isDefaultLocale ? undefined : getPreviewFieldText(field, "placeholder")}
                                displayHelpText={isDefaultLocale ? undefined : getPreviewFieldText(field, "help_text")}
                                displayOptions={isDefaultLocale ? undefined : getPreviewFieldOptions(field)}
                              />
                            </div>
                          ))}
                          
                          {getFieldsForStep(activePreviewStep).length === 0 && (
                            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                              <p>Nenhum campo neste passo</p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <div className="flex justify-between mt-8 pt-4 border-t">
                    <Button 
                      variant="outline" 
                      disabled={activePreviewStep === 1} 
                      onClick={() => setActivePreviewStep(Math.max(1, activePreviewStep - 1))}
                      style={{
                        borderColor: branding?.primary_color || undefined,
                        color: branding?.primary_color || undefined,
                      }}
                    >
                      {branding?.previous_button_text || "Anterior"}
                    </Button>
                    {activePreviewStep < steps.length ? (
                      <Button 
                        onClick={() => setActivePreviewStep(activePreviewStep + 1)}
                        style={{
                          backgroundColor: branding?.primary_color || undefined,
                          color: branding?.button_text_color || undefined,
                        }}
                      >
                        {branding?.next_button_text || "Continuar"}
                      </Button>
                    ) : (
                      <Button
                        style={{
                          backgroundColor: branding?.primary_color || undefined,
                          color: branding?.button_text_color || undefined,
                        }}
                      >
                        {branding?.submit_button_text || "Submeter"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Panel - Scheduling Step Config or Field Settings */}
          {(() => {
            const activeStep = steps.find(s => s.id === activeStepId);
            if (activeStep?.step_type === 'scheduling' && !selectedField) {
              return (
                <div className="w-80 flex-shrink-0 border-l bg-background overflow-hidden flex flex-col">
                  <div className="p-3 border-b">
                    <span className="font-medium text-sm">Configurar Agendamento</span>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Título do Passo</Label>
                      <Input
                        value={getDisplayedStepTitle(activeStep)}
                        onChange={(e) => void handleUpdateStepTitle(activeStep.id, e.target.value)}
                        placeholder={isDefaultLocale ? "" : (activeStep.step_title || "")}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Board de Agendamento</Label>
                      <Select
                        value={activeStep.scheduling_board_id || ''}
                        onValueChange={async (v) => {
                          await supabase.from("form_steps").update({ scheduling_board_id: v }).eq("id", activeStep.id);
                          setSteps(steps.map(s => s.id === activeStep.id ? { ...s, scheduling_board_id: v } : s));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {scheduleBoards.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Duração (minutos)</Label>
                      <Input
                        type="number"
                        value={activeStep.scheduling_duration_minutes || 60}
                        onChange={async (e) => {
                          const val = parseInt(e.target.value) || 60;
                          await supabase.from("form_steps").update({ scheduling_duration_minutes: val }).eq("id", activeStep.id);
                          setSteps(steps.map(s => s.id === activeStep.id ? { ...s, scheduling_duration_minutes: val } : s));
                        }}
                        className="h-8 text-sm"
                        min={15}
                        step={15}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Campo de Código Postal (proximidade)</Label>
                      <Select
                        value={activeStep.scheduling_postal_code_field_key || "__none__"}
                        onValueChange={async (v) => {
                          const val = v === "__none__" ? null : v;
                          await supabase.from("form_steps").update({ scheduling_postal_code_field_key: val }).eq("id", activeStep.id);
                          setSteps(steps.map(s => s.id === activeStep.id ? { ...s, scheduling_postal_code_field_key: val } : s));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione um campo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum — sem filtro geográfico</SelectItem>
                          {fields
                            .filter(f => {
                              const fieldStep = steps.find(s => s.step_number === f.step_number);
                              return !fieldStep || fieldStep.step_type !== 'scheduling';
                            })
                            .map(f => (
                              <SelectItem key={f.id} value={f.field_key}>
                                {f.field_label || f.field_key}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Selecione o campo que contém o código postal para filtrar recursos por proximidade.</p>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}
          {selectedField && (
            <div className="w-80 flex-shrink-0 border-l bg-background overflow-hidden flex flex-col">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="font-medium text-sm">Configurar Campo</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSelectedField(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Chave</Label>
                    <Input value={selectedField.field_key} disabled className="h-8 text-sm bg-muted" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Label {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Input
                      value={getDisplayedFieldText(selectedField, "field_label")}
                      onChange={(e) => void handleUpdateFieldText(selectedField.id, "field_label", e.target.value)}
                      placeholder={isDefaultLocale ? "" : getBaseTextPlaceholder(selectedField, "field_label")}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={selectedField.field_type}
                      onValueChange={(v) => handleUpdateField(selectedField.id, { field_type: v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-3 w-3" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                        <Separator className="my-1" />
                        {SYSTEM_FIELD_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-3 w-3" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isOptionBasedField(selectedField.field_type) && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Opções visíveis no formulário</Label>
                        <p className="text-[11px] text-muted-foreground">
                          É aqui que defines os serviços que aparecem nesse campo.
                        </p>
                      </div>

                      <div className="space-y-2">
                        {getFieldOptionValues(selectedField.options).length > 0 ? (
                          getFieldOptionValues(selectedField.options).map((option, index) => {
                            const optionIcons = (selectedField.option_icon_names && typeof selectedField.option_icon_names === "object")
                              ? (selectedField.option_icon_names as Record<string, string>)
                              : {};
                            const currentIcon = optionIcons[option];
                            const optionId = String(index);
                            const overlayValue = !isDefaultLocale
                              ? getFieldOptionTranslation(i18nConfig, selectedField.id, activeLocale, optionId) || ""
                              : null;
                            const displayedValue = isDefaultLocale ? option : (overlayValue ?? "");
                            return (
                              <div key={`${selectedField.id}-option-${index}`} className="flex items-center gap-2">
                                <Input
                                  value={displayedValue}
                                  onChange={(e) => handleUpdateFieldOption(index, e.target.value)}
                                  placeholder={isDefaultLocale ? "" : option}
                                  className="h-8 text-sm bg-background"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  title={currentIcon ? `Ícone: ${currentIcon}` : "Escolher ícone"}
                                  disabled={!isDefaultLocale}
                                  onClick={() => {
                                    setIconPickerOption(option);
                                    setIconPickerOpen(true);
                                  }}
                                >
                                  {currentIcon ? (
                                    <LucideIcon name={currentIcon} className="h-3.5 w-3.5" />
                                  ) : (
                                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  disabled={!isDefaultLocale}
                                  onClick={() => handleRemoveFieldOption(index)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground">
                            Ainda não tens opções definidas para este campo.
                          </div>
                        )}
                      </div>

                      {isDefaultLocale ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={newOptionValue}
                            onChange={(e) => setNewOptionValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleAddFieldOption();
                              }
                            }}
                            placeholder="Ex: Sala, Quarto, Escritório"
                            className="h-8 text-sm bg-background"
                          />
                          <Button type="button" size="sm" className="h-8" onClick={() => void handleAddFieldOption()}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Adicionar
                          </Button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Adicionar/remover opções só está disponível no idioma principal.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Passo</Label>
                    <Select
                      value={String(selectedField.step_number)}
                      onValueChange={(v) => handleUpdateField(selectedField.id, { step_number: parseInt(v) })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {steps.map(step => (
                          <SelectItem key={step.step_number} value={String(step.step_number)}>
                            {step.step_number}. {step.step_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Contact Property Mapping */}
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" />
                      Propriedade do Contacto
                    </Label>
                    <Select
                      value={selectedField.contact_field_mapping || "_none"}
                      onValueChange={(v) => {
                        const val = v === "_none" ? null : v;
                        if (val && fields.some(f => f.id !== selectedField.id && f.contact_field_mapping === val)) {
                          toast({ title: "Esta propriedade já está mapeada noutro campo", variant: "destructive" });
                          return;
                        }
                        handleUpdateField(selectedField.id, { contact_field_mapping: val });
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Sem mapeamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sem mapeamento</SelectItem>
                        {CONTACT_FIELDS.filter(f => f.value).map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Client Property Mapping - only for non-lead forms */}
                  {formType !== "lead" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Propriedade do Cliente</Label>
                    <Select
                      value={selectedField.client_field_mapping || "_none"}
                      onValueChange={(v) => {
                        const val = v === "_none" ? null : v;
                        if (val && fields.some(f => f.id !== selectedField.id && f.client_field_mapping === val)) {
                          toast({ title: "Esta propriedade já está mapeada noutro campo", variant: "destructive" });
                          return;
                        }
                        handleUpdateField(selectedField.id, { client_field_mapping: val });
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Sem mapeamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sem mapeamento</SelectItem>
                        {CLIENT_FIELDS.filter(f => f.value).map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}

                  <Separator />
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Placeholder {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Input
                      value={getDisplayedFieldText(selectedField, "placeholder")}
                      onChange={(e) => void handleUpdateFieldText(selectedField.id, "placeholder", e.target.value)}
                      placeholder={
                        isDefaultLocale
                          ? "Texto de exemplo..."
                          : getBaseTextPlaceholder(selectedField, "placeholder") || "Texto de exemplo..."
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Texto de Ajuda {!isDefaultLocale && <span className="text-[10px] text-muted-foreground">({activeLocale.toUpperCase()})</span>}</Label>
                    <Textarea
                      value={getDisplayedFieldText(selectedField, "help_text")}
                      onChange={(e) => void handleUpdateFieldText(selectedField.id, "help_text", e.target.value)}
                      placeholder={
                        isDefaultLocale
                          ? "Instruções..."
                          : getBaseTextPlaceholder(selectedField, "help_text") || "Instruções..."
                      }
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  <Separator />
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Obrigatório</Label>
                      <Switch
                        checked={selectedField.is_required}
                        onCheckedChange={(v) => handleUpdateField(selectedField.id, { is_required: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Valor Único</Label>
                      <Switch
                        checked={selectedField.is_unique}
                        onCheckedChange={(v) => handleUpdateField(selectedField.id, { is_unique: v })}
                      />
                    </div>
                  </div>

                  <Separator />
                  
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => handleDeleteField(selectedField.id)}>
                    <Trash2 className="h-3 w-3 mr-2" />
                    Eliminar Campo
                  </Button>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>

      <IconGallery
        open={iconPickerOpen}
        onOpenChange={(open) => {
          setIconPickerOpen(open);
          if (!open) setIconPickerOption(null);
        }}
        onSelect={(iconName) => {
          void handleSetOptionIcon(iconName);
        }}
        selectedIcon={
          iconPickerOption && selectedField?.option_icon_names && typeof selectedField.option_icon_names === "object"
            ? (selectedField.option_icon_names as Record<string, string>)[iconPickerOption]
            : undefined
        }
      />
    </Dialog>
  );
}
