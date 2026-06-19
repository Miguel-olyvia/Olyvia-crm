import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
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
  Eye,
  Pencil,
  Settings2,
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
  Copy,
  ArrowRight,
  Smartphone,
  Monitor,
  Tablet,
  X,
  Save,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// Field Types with icons
const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "number", label: "Number", icon: Hash },
  { value: "date", label: "Date", icon: Calendar },
  { value: "datetime", label: "Date & Time", icon: Calendar },
  { value: "boolean", label: "Yes/No", icon: CheckSquare },
  { value: "select", label: "Dropdown", icon: ChevronDown },
  { value: "textarea", label: "Long Text", icon: AlignLeft },
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
  campaign_id: string;
  step_number: number;
  step_title: string;
  step_description: string | null;
  step_subtitle: string | null;
  next_button_text: string | null;
  previous_button_text: string | null;
  submit_button_text: string | null;
  sort_order: number;
}

interface FieldDefinition {
  id: string;
  campaign_id: string | null;
  organization_id: string | null;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_unique: boolean;
  options: any;
  sort_order: number;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  step_number: number;
  placeholder?: string | null;
  help_text?: string | null;
  display_style?: string | null;
}

interface CampaignFormBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  companyId: string;
}

// Sortable Step Component
function SortableStep({ 
  step, 
  fields, 
  isActive,
  onSelect,
  onUpdate,
  onDelete,
  onFieldSelect,
  selectedFieldId,
  onFieldReorder,
}: { 
  step: FormStep;
  fields: FieldDefinition[];
  isActive: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<FormStep>) => void;
  onDelete: () => void;
  onFieldSelect: (field: FieldDefinition | null) => void;
  selectedFieldId: string | null;
  onFieldReorder: (fieldId: string, direction: 'up' | 'down') => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

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
      {/* Step Header */}
      <div 
        className={`flex items-center gap-2 p-3 cursor-pointer transition-colors ${
          isActive ? 'bg-primary/10' : 'bg-muted/50 hover:bg-muted'
        }`}
        onClick={onSelect}
      >
        <button {...attributes} {...listeners} className="cursor-grab hover:bg-muted p-1 rounded" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Badge variant="default" className="text-sm px-2 py-0.5">
          {step.step_number}
        </Badge>
        <span className="flex-1 font-medium text-sm truncate">{step.step_title}</span>
        <span className="text-xs text-muted-foreground">{fields.length} campos</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {/* Fields in Step */}
      {isActive && (
        <div className="p-2 space-y-1 bg-background">
          {fields.length === 0 ? (
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
}: { 
  field: FieldDefinition;
  isSelected: boolean;
  onSelect: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
      {field.is_required && (
        <span className="text-destructive text-xs">*</span>
      )}
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-5 w-5" 
          onClick={onMoveUp}
          disabled={!canMoveUp}
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-5 w-5" 
          onClick={onMoveDown}
          disabled={!canMoveDown}
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface BrandingStyles {
  primary_color?: string;
  input_border_color?: string;
  input_background_color?: string;
  input_border_radius?: string;
  text_color?: string;
}

// Field Preview Component for the form preview
function FieldPreview({ field, branding }: { field: FieldDefinition; branding?: BrandingStyles }) {
  const fieldType = [...FIELD_TYPES, ...SYSTEM_FIELD_TYPES].find(t => t.value === field.field_type);
  
  const inputStyle: React.CSSProperties = branding ? {
    borderColor: branding.input_border_color || undefined,
    backgroundColor: branding.input_background_color || undefined,
    borderRadius: branding.input_border_radius || undefined,
  } : {};
  
  const renderInput = () => {
    switch (field.field_type) {
      case 'textarea':
        return (
          <Textarea 
            placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}...`}
            className="bg-muted/30"
            style={inputStyle}
            disabled
          />
        );
      case 'select':
      case 'ref_district':
      case 'ref_service':
      case 'ref_product':
      case 'ref_business_unit':
      case 'ref_department':
        return (
          <Select disabled>
            <SelectTrigger className="bg-muted/30" style={inputStyle}>
              <SelectValue placeholder={field.placeholder || "Selecione..."} />
            </SelectTrigger>
          </Select>
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
            {['Opção 1', 'Opção 2', 'Opção 3'].map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-full border-2" 
                  style={{ borderColor: branding?.primary_color || 'currentColor' }}
                />
                <span className="text-sm">{opt}</span>
              </div>
            ))}
          </div>
        );
      case 'checkbox':
      case 'list_districts':
      case 'list_services':
      case 'list_products':
        return (
          <div className="space-y-2">
            {['Opção 1', 'Opção 2', 'Opção 3'].map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded border-2" 
                  style={{ borderColor: branding?.primary_color || 'currentColor' }}
                />
                <span className="text-sm">{opt}</span>
              </div>
            ))}
          </div>
        );
      default:
        return (
          <Input 
            type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
            placeholder={field.placeholder || `O seu ${field.field_label.toLowerCase()}...`}
            className="bg-muted/30"
            style={inputStyle}
            disabled
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1" style={{ color: branding?.text_color }}>
        {field.field_label}
        {field.is_required && <span className="text-destructive">*</span>}
      </Label>
      {renderInput()}
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
    </div>
  );
}

export function CampaignFormBuilder({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  companyId,
}: CampaignFormBuilderProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const [steps, setSteps] = useState<FormStep[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [branding, setBranding] = useState<{
    primary_color?: string;
    secondary_color?: string;
    background_color?: string;
    text_color?: string;
    button_text_color?: string;
    accent_color?: string;
    font_family?: string;
    border_radius?: string;
    input_border_color?: string;
    input_background_color?: string;
    input_border_radius?: string;
    input_padding?: string;
    input_font_size?: string;
    input_focus_border_color?: string;
    card_border_radius?: string;
  }>({});
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<FieldDefinition | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [activePreviewStep, setActivePreviewStep] = useState(1);
  const [draggedItem, setDraggedItem] = useState<UniqueIdentifier | null>(null);
  const [saving, setSaving] = useState(false);
  
  // New field form state
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

  // Load data
  useEffect(() => {
    if (open && campaignId) {
      loadSteps();
      loadFields();
      loadBranding();
    }
  }, [open, campaignId]);

  const loadBranding = async () => {
    const { data, error } = await supabase
      .from("campaign_branding")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    
    if (!error && data) {
      setBranding(data);
    }
  };

  useEffect(() => {
    if (steps.length > 0 && !activeStepId) {
      setActiveStepId(steps[0].id);
    }
  }, [steps, activeStepId]);

  const loadSteps = async () => {
    const { data, error } = await supabase
      .from("campaign_form_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_number");

    if (error) {
      console.error("Error loading steps:", error);
    } else if (data && data.length > 0) {
      setSteps(data);
    } else {
      // Create default step
      const { data: newStep } = await supabase
        .from("campaign_form_steps")
        .insert({
          campaign_id: campaignId,
          step_number: 1,
          step_title: "Informações Básicas",
          sort_order: 0,
        })
        .select()
        .single();
      
      if (newStep) {
        setSteps([newStep]);
      }
    }
  };

  const loadFields = async () => {
    const { data, error } = await supabase
      .from("lead_field_definitions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading fields:", error);
    } else {
      setFields(data || []);
    }
  };

  const getFieldsForStep = (stepNumber: number) => {
    return fields.filter(f => f.step_number === stepNumber).sort((a, b) => a.sort_order - b.sort_order);
  };

  const handleAddStep = async () => {
    const nextNumber = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
    
    const { data, error } = await supabase
      .from("campaign_form_steps")
      .insert({
        campaign_id: campaignId,
        step_number: nextNumber,
        step_title: `Passo ${nextNumber}`,
        sort_order: nextNumber - 1,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar passo", variant: "destructive" });
    } else if (data) {
      setSteps([...steps, data]);
      setActiveStepId(data.id);
      toast({ title: "Passo adicionado" });
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    const stepFields = getFieldsForStep(step.step_number);
    if (stepFields.length > 0) {
      toast({ 
        title: "Não é possível eliminar", 
        description: "Mova os campos para outro passo primeiro",
        variant: "destructive" 
      });
      return;
    }

    if (steps.length <= 1) {
      toast({ title: "É necessário pelo menos um passo", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("campaign_form_steps")
      .delete()
      .eq("id", stepId);

    if (error) {
      toast({ title: "Erro ao eliminar", variant: "destructive" });
    } else {
      const newSteps = steps.filter(s => s.id !== stepId);
      setSteps(newSteps);
      if (activeStepId === stepId && newSteps.length > 0) {
        setActiveStepId(newSteps[0].id);
      }
      toast({ title: "Passo eliminado" });
    }
  };

  const handleUpdateStep = async (stepId: string, updates: Partial<FormStep>) => {
    const { error } = await supabase
      .from("campaign_form_steps")
      .update(updates)
      .eq("id", stepId);

    if (!error) {
      setSteps(steps.map(s => s.id === stepId ? { ...s, ...updates } : s));
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
      .from("lead_field_definitions")
      .insert({
        campaign_id: campaignId,
        organization_id: companyId,
        field_key: newField.field_key.toLowerCase().replace(/\s+/g, "_"),
        field_label: newField.field_label,
        field_type: newField.field_type,
        is_required: newField.is_required,
        is_unique: false,
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
      setNewField({
        field_key: "",
        field_label: "",
        field_type: "text",
        is_required: false,
        placeholder: "",
        help_text: "",
      });
      setSelectedField(data);
      toast({ title: "Campo adicionado" });
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    const { error } = await supabase
      .from("lead_field_definitions")
      .update({ is_active: false })
      .eq("id", fieldId);

    if (error) {
      toast({ title: "Erro ao eliminar", variant: "destructive" });
    } else {
      setFields(fields.filter(f => f.id !== fieldId));
      if (selectedField?.id === fieldId) {
        setSelectedField(null);
      }
      toast({ title: "Campo eliminado" });
    }
  };

  const handleUpdateField = async (fieldId: string, updates: Partial<FieldDefinition>) => {
    const { error } = await supabase
      .from("lead_field_definitions")
      .update(updates)
      .eq("id", fieldId);

    if (!error) {
      setFields(fields.map(f => f.id === fieldId ? { ...f, ...updates } : f));
      if (selectedField?.id === fieldId) {
        setSelectedField({ ...selectedField, ...updates });
      }
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
    
    // Update sort_order for all affected fields
    const updates = reorderedFields.map((f, i) => ({
      id: f.id,
      sort_order: i,
    }));

    for (const update of updates) {
      await supabase
        .from("lead_field_definitions")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id);
    }

    // Update local state
    setFields(fields.map(f => {
      const updateInfo = updates.find(u => u.id === f.id);
      return updateInfo ? { ...f, sort_order: updateInfo.sort_order } : f;
    }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedItem(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggedItem(null);
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    // Check if dragging steps
    const isStep = steps.some(s => s.id === active.id);
    if (isStep) {
      const oldIndex = steps.findIndex(s => s.id === active.id);
      const newIndex = steps.findIndex(s => s.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedSteps = arrayMove(steps, oldIndex, newIndex);
        
        // Update step numbers
        const updatedSteps = reorderedSteps.map((s, i) => ({
          ...s,
          step_number: i + 1,
          sort_order: i,
        }));
        
        setSteps(updatedSteps);
        
        // Save to database
        for (const step of updatedSteps) {
          await supabase
            .from("campaign_form_steps")
            .update({ step_number: step.step_number, sort_order: step.sort_order })
            .eq("id", step.id);
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
          <div className="flex items-center gap-4">
            <DialogTitle className="text-lg font-semibold">
              {t("campaigns.formBuilder.title") || "Form Builder"} - {campaignName}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Preview Mode Toggle */}
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                variant={previewMode === 'desktop' ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewMode('desktop')}
                className="rounded-none"
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                variant={previewMode === 'tablet' ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewMode('tablet')}
                className="rounded-none"
              >
                <Tablet className="h-4 w-4" />
              </Button>
              <Button
                variant={previewMode === 'mobile' ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPreviewMode('mobile')}
                className="rounded-none"
              >
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
          {/* Left Panel - Steps & Fields */}
          <div className="w-80 flex-shrink-0 border-r bg-muted/30 overflow-hidden flex flex-col">
            <div className="p-3 border-b bg-background flex items-center justify-between">
              <span className="font-medium text-sm">Estrutura do Formulário</span>
              <Button size="sm" variant="outline" onClick={handleAddStep}>
                <Plus className="h-3 w-3 mr-1" />
                Passo
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={steps.map(s => s.id)} 
                    strategy={verticalListSortingStrategy}
                  >
                    {steps.map(step => (
                      <SortableStep
                        key={step.id}
                        step={step}
                        fields={getFieldsForStep(step.step_number)}
                        isActive={activeStepId === step.id}
                        onSelect={() => setActiveStepId(step.id)}
                        onUpdate={(updates) => handleUpdateStep(step.id, updates)}
                        onDelete={() => handleDeleteStep(step.id)}
                        onFieldSelect={setSelectedField}
                        selectedFieldId={selectedField?.id || null}
                        onFieldReorder={handleFieldReorder}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </ScrollArea>

            {/* Add Field Quick Form */}
            <div className="p-3 border-t bg-background space-y-3">
              <span className="font-medium text-sm">Adicionar Campo</span>
              <div className="space-y-2">
                <Input
                  placeholder="Chave (ex: first_name)"
                  value={newField.field_key}
                  onChange={(e) => setNewField({ ...newField, field_key: e.target.value })}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="Label (ex: Nome)"
                  value={newField.field_label}
                  onChange={(e) => setNewField({ ...newField, field_label: e.target.value })}
                  className="h-8 text-sm"
                />
                <Select
                  value={newField.field_type}
                  onValueChange={(v) => setNewField({ ...newField, field_type: v })}
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
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newField.is_required}
                    onCheckedChange={(v) => setNewField({ ...newField, is_required: v })}
                  />
                  <span className="text-xs">Obrigatório</span>
                </div>
                <Button size="sm" className="w-full" onClick={handleAddField}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar Campo
                </Button>
              </div>
            </div>
          </div>

          {/* Center - Live Preview */}
          <div 
            className="flex-1 overflow-auto p-6"
            style={{ 
              backgroundColor: branding.background_color || 'hsl(var(--muted) / 0.2)',
              fontFamily: branding.font_family || undefined,
            }}
          >
            <div className={`mx-auto ${getPreviewWidth()} transition-all`}>
              <Card 
                className="shadow-lg overflow-hidden"
                style={{ borderRadius: branding.card_border_radius || branding.border_radius }}
              >
                <CardHeader 
                  className="rounded-t-lg"
                  style={{ 
                    backgroundColor: branding.primary_color || 'hsl(var(--primary))',
                    color: branding.button_text_color || 'hsl(var(--primary-foreground))',
                    borderRadius: branding.card_border_radius ? `${branding.card_border_radius} ${branding.card_border_radius} 0 0` : undefined,
                  }}
                >
                  <CardTitle className="text-center">{campaignName}</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Step Indicator */}
                  {steps.length > 1 && (
                    <div className="flex items-center justify-center gap-2 mb-6">
                      {steps.map((step, i) => (
                        <div key={step.id} className="flex items-center">
                          <button
                            onClick={() => setActivePreviewStep(step.step_number)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors`}
                            style={{
                              backgroundColor: activePreviewStep === step.step_number 
                                ? (branding.primary_color || 'hsl(var(--primary))') 
                                : activePreviewStep > step.step_number 
                                  ? (branding.primary_color ? `${branding.primary_color}33` : 'hsl(var(--primary) / 0.2)')
                                  : 'hsl(var(--muted))',
                              color: activePreviewStep === step.step_number 
                                ? (branding.button_text_color || 'hsl(var(--primary-foreground))') 
                                : activePreviewStep > step.step_number 
                                  ? (branding.primary_color || 'hsl(var(--primary))')
                                  : 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {step.step_number}
                          </button>
                          {i < steps.length - 1 && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Step Title */}
                  {steps.find(s => s.step_number === activePreviewStep) && (
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold" style={{ color: branding.text_color }}>
                        {steps.find(s => s.step_number === activePreviewStep)?.step_title}
                      </h3>
                      {steps.find(s => s.step_number === activePreviewStep)?.step_description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {steps.find(s => s.step_number === activePreviewStep)?.step_description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Fields Preview */}
                  <div className="space-y-4">
                    {getFieldsForStep(activePreviewStep).map(field => (
                      <div 
                        key={field.id} 
                        className={`transition-all rounded-lg p-2 -m-2 ${
                          selectedField?.id === field.id 
                            ? 'ring-2 ring-primary bg-primary/5' 
                            : 'hover:bg-muted/50 cursor-pointer'
                        }`}
                        onClick={() => setSelectedField(field)}
                      >
                        <FieldPreview field={field} branding={branding} />
                      </div>
                    ))}
                    
                    {getFieldsForStep(activePreviewStep).length === 0 && (
                      <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p>Nenhum campo neste passo</p>
                        <p className="text-sm">Adicione campos usando o painel à esquerda</p>
                      </div>
                    )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between mt-8 pt-4 border-t">
                    <Button 
                      variant="outline" 
                      disabled={activePreviewStep === 1}
                      onClick={() => setActivePreviewStep(Math.max(1, activePreviewStep - 1))}
                      style={branding.secondary_color ? { 
                        borderColor: branding.secondary_color,
                        color: branding.secondary_color,
                      } : undefined}
                    >
                      Anterior
                    </Button>
                    {activePreviewStep < steps.length ? (
                      <Button 
                        onClick={() => setActivePreviewStep(activePreviewStep + 1)}
                        style={branding.primary_color ? {
                          backgroundColor: branding.primary_color,
                          color: branding.button_text_color || '#fff',
                        } : undefined}
                      >
                        Continuar
                      </Button>
                    ) : (
                      <Button 
                        style={branding.primary_color ? {
                          backgroundColor: branding.primary_color,
                          color: branding.button_text_color || '#fff',
                        } : undefined}
                      >
                        Submeter
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Panel - Field Settings */}
          {selectedField && (
            <div className="w-80 flex-shrink-0 border-l bg-background overflow-hidden flex flex-col">
              <div className="p-3 border-b flex items-center justify-between">
                <span className="font-medium text-sm">Configurar Campo</span>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6"
                  onClick={() => setSelectedField(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Chave do Campo</Label>
                    <Input
                      value={selectedField.field_key}
                      disabled
                      className="h-8 text-sm bg-muted"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={selectedField.field_label}
                      onChange={(e) => handleUpdateField(selectedField.id, { field_label: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Tipo de Campo</Label>
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

                  <Separator />
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Placeholder</Label>
                    <Input
                      value={selectedField.placeholder || ""}
                      onChange={(e) => handleUpdateField(selectedField.id, { placeholder: e.target.value })}
                      placeholder="Texto de exemplo..."
                      className="h-8 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Texto de Ajuda</Label>
                    <Textarea
                      value={selectedField.help_text || ""}
                      onChange={(e) => handleUpdateField(selectedField.id, { help_text: e.target.value })}
                      placeholder="Instruções para o utilizador..."
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
                  
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleDeleteField(selectedField.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    Eliminar Campo
                  </Button>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
