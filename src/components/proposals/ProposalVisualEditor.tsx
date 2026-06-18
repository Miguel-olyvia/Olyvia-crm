import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Save,
  X,
  GripVertical,
  Plus,
  Trash2,
  Palette,
  Eye,
  Settings2,
  Building2,
  User,
  Calendar,
  Euro,
  FileText,
  Loader2,
  Check,
  Package,
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { GalleryPickerDialog } from "@/components/GalleryPickerDialog";
import { ProductPickerDialog } from "@/components/proposals/ProductPickerDialog";

interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  isNew?: boolean;
}

interface QuoteLine {
  id: string;
  descricao_snapshot: string | null;
  qt: number;
  total_sem_iva: number;
  total_com_iva: number;
  iva_percent: number | null;
  ordem: number;
}

interface Quote {
  id: string;
  quote_number: string | null;
  total: number | null;
  estado: string;
  quote_lines: QuoteLine[];
}

interface TemplateConfig {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  heading_font_family: string;
  header_style: string;
  show_company_info: boolean;
  show_client_info: boolean;
  show_validity: boolean;
  show_terms: boolean;
  header_text: string | null;
  footer_text: string | null;
  terms_conditions: string | null;
  show_quote_details: boolean;
}

interface ProposalData {
  id: string;
  title: string;
  description: string | null;
  value: number;
  status: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  currency: string;
  companies: {
    name: string;
    email: string | null;
    phone: string | null;
    logo_url: string | null;
  } | null;
  clients: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    client_type: string;
    email: string | null;
    phone: string | null;
  } | null;
  proposal_templates: TemplateConfig | null;
  quotes: Quote[];
  proposal_items: ProposalItem[];
}

interface ProposalVisualEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposalId: string;
  onSave?: () => void;
}

// Sortable Item Component
function SortableProposalItem({
  item,
  onUpdate,
  onDelete,
  currency,
}: {
  item: ProposalItem;
  onUpdate: (id: string, field: keyof ProposalItem, value: any) => void;
  onDelete: (id: string) => void;
  currency: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const total = item.quantity * item.unit_price;

  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className="w-8">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell>
        <Input
          value={item.description}
          onChange={(e) => onUpdate(item.id, "description", e.target.value)}
          className="border-0 bg-transparent focus:bg-background focus:border"
          placeholder="Descrição do item..."
        />
      </TableCell>
      <TableCell className="w-24">
        <Input
          type="number"
          value={item.quantity}
          onChange={(e) => onUpdate(item.id, "quantity", parseFloat(e.target.value) || 0)}
          className="border-0 bg-transparent focus:bg-background focus:border text-right"
          min={0}
          step={0.01}
        />
      </TableCell>
      <TableCell className="w-28">
        <Input
          type="number"
          value={item.unit_price}
          onChange={(e) => onUpdate(item.id, "unit_price", parseFloat(e.target.value) || 0)}
          className="border-0 bg-transparent focus:bg-background focus:border text-right"
          min={0}
          step={0.01}
        />
      </TableCell>
      <TableCell className="w-20">
        <Input
          type="number"
          value={item.vat_rate}
          onChange={(e) => onUpdate(item.id, "vat_rate", parseFloat(e.target.value) || 0)}
          className="border-0 bg-transparent focus:bg-background focus:border text-right"
          min={0}
          max={100}
          step={1}
        />
      </TableCell>
      <TableCell className="w-28 text-right font-medium">
        {currency === "EUR" ? "€" : currency} {total.toFixed(2)}
      </TableCell>
      <TableCell className="w-10">
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

const defaultTemplate: TemplateConfig = {
  logo_url: null,
  primary_color: "#8B5CF6",
  secondary_color: "#A78BFA",
  accent_color: "#C4B5FD",
  background_color: "#F8FAFC",
  text_color: "#1E293B",
  font_family: "Inter",
  heading_font_family: "Inter",
  header_style: "modern",
  show_company_info: true,
  show_client_info: true,
  show_validity: true,
  show_terms: true,
  header_text: null,
  footer_text: null,
  terms_conditions: null,
  show_quote_details: true,
};

export function ProposalVisualEditor({
  open,
  onOpenChange,
  proposalId,
  onSave,
}: ProposalVisualEditorProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [activeTab, setActiveTab] = useState("preview");
  const [showLogoGallery, setShowLogoGallery] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  
  // Editable fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [template, setTemplate] = useState<TemplateConfig>(defaultTemplate);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (open && proposalId) {
      fetchProposal();
    }
  }, [open, proposalId]);

  const fetchProposal = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("proposals")
        .select(`
          id, title, description, value, status, valid_until, notes, created_at, currency,
          organization_id, entity_id,
          proposal_templates!template_id(
            logo_url, primary_color, secondary_color, accent_color,
            background_color, text_color, font_family, heading_font_family,
            header_style, show_company_info, show_client_info, show_validity,
            show_terms, header_text, footer_text, terms_conditions, show_quote_details
          ),
          quotes!proposal_id(
            id, quote_number, total, estado,
            quote_lines(id, descricao_snapshot, qt, total_sem_iva, total_com_iva, iva_percent, ordem)
          ),
          proposal_items(id, description, quantity, unit_price, vat_rate)
        `)
        .eq("id", proposalId)
        .single();

      if (error) throw error;

      // Resolve organization and entity data
      let companiesData: any = null;
      let clientsData: any = null;
      
      if ((data as any).organization_id) {
        const { data: org } = await supabase.from("anew_organizations").select("name, email, phone, logo_url").eq("id", (data as any).organization_id).single();
        companiesData = org || null;
      }
      
      if ((data as any).entity_id) {
        const [entityRes, emailRes, phoneRes] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name, first_name, last_name, type").eq("id", (data as any).entity_id).single(),
          supabase.from("anew_entity_emails").select("email").eq("entity_id", (data as any).entity_id).eq("is_primary", true).maybeSingle(),
          supabase.from("anew_entity_phones").select("phone_number").eq("entity_id", (data as any).entity_id).eq("is_primary", true).maybeSingle(),
        ]);
        if (entityRes.data) {
          clientsData = {
            first_name: entityRes.data.first_name,
            last_name: entityRes.data.last_name,
            company_name: entityRes.data.type === 'organization' ? entityRes.data.display_name : null,
            client_type: entityRes.data.type === 'organization' ? 'company' : 'person',
            email: emailRes.data?.email || null,
            phone: phoneRes.data?.phone_number || null,
          };
        }
      }

      setProposal({ ...data, companies: companiesData, clients: clientsData } as unknown as ProposalData);
      setTitle(data.title || "");
      setDescription(data.description || "");
      setNotes(data.notes || "");
      setValidUntil(data.valid_until || "");
      
      // Use proposal_items if available, otherwise populate from quote lines
      let loadedItems = (data.proposal_items as ProposalItem[]) || [];
      if (loadedItems.length === 0) {
        // First try direct quotes relation
        let quoteLines: any[] = [];
        const directQuotes = (data as any).quotes;
        if (directQuotes) {
          const quotesArr = Array.isArray(directQuotes) ? directQuotes : [directQuotes];
          for (const quote of quotesArr) {
            if (quote?.quote_lines?.length > 0) {
              quoteLines = quote.quote_lines;
              break;
            }
          }
        }
        
        // Fallback: find quotes via pipeline_links
        if (quoteLines.length === 0) {
          const { data: pLink } = await (supabase as any)
            .from("pipeline_links")
            .select("quote_id")
            .eq("proposal_id", proposalId)
            .eq("status", "active")
            .maybeSingle();
          
          if (pLink?.quote_id) {
            const { data: qlData } = await supabase
              .from("quote_lines")
              .select("id, descricao_snapshot, qt, total_sem_iva, total_com_iva, iva_percent, ordem")
              .eq("quote_id", pLink.quote_id)
              .order("ordem");
            quoteLines = qlData || [];
          }
        }
        
        if (quoteLines.length > 0) {
          loadedItems = quoteLines
            .sort((a: any, b: any) => (a.ordem || 0) - (b.ordem || 0))
            .map((line: any) => ({
              id: `quote-${line.id}`,
              description: line.descricao_snapshot || "",
              quantity: line.qt || 1,
              unit_price: line.total_sem_iva ? (line.qt ? line.total_sem_iva / line.qt : line.total_sem_iva) : 0,
              vat_rate: line.iva_percent || 23,
              isNew: true,
            }));
        }
      }
      setItems(loadedItems);
      setTemplate((data.proposal_templates as TemplateConfig) || defaultTemplate);
      setHasChanges(loadedItems.length > 0 && ((data.proposal_items as any[]) || []).length === 0);
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const handleItemUpdate = (id: string, field: keyof ProposalItem, value: any) => {
    setItems((items) =>
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    setHasChanges(true);
  };

  const handleItemDelete = (id: string) => {
    setItems((items) => items.filter((item) => item.id !== id));
    setHasChanges(true);
  };

  const handleAddItem = () => {
    const newItem: ProposalItem = {
      id: `new-${Date.now()}`,
      description: "",
      quantity: 1,
      unit_price: 0,
      vat_rate: 23,
      isNew: true,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
  };

  const handleAddFromCatalog = (products: any[]) => {
    const newItems = products.map((p, i) => ({
      id: `cat-${Date.now()}-${i}`,
      description: p.name || p.description || "",
      quantity: 1,
      unit_price: p.price || 0,
      vat_rate: p.vat_rate || 23,
      isNew: true,
    }));
    setItems([...items, ...newItems]);
    setHasChanges(true);
    setShowProductPicker(false);
  };

  const calculateTotal = useCallback(() => {
    return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  }, [items]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update proposal main data
      const { error: proposalError } = await supabase
        .from("proposals")
        .update({
          title,
          description: description || null,
          notes: notes || null,
          valid_until: validUntil || null,
          value: calculateTotal(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", proposalId);

      if (proposalError) throw proposalError;

      // Delete removed items
      const existingIds = items.filter((i) => !i.isNew).map((i) => i.id);
      const originalIds = proposal?.proposal_items?.map((i) => i.id) || [];
      const deletedIds = originalIds.filter((id) => !existingIds.includes(id));

      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("proposal_items")
          .delete()
          .in("id", deletedIds);
        if (deleteError) throw deleteError;
      }

      // Update existing items
      for (const item of items.filter((i) => !i.isNew)) {
        const { error: updateError } = await supabase
          .from("proposal_items")
          .update({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            vat_rate: item.vat_rate,
          })
          .eq("id", item.id);
        if (updateError) throw updateError;
      }

      // Insert new items
      const newItems = items.filter((i) => i.isNew);
      if (newItems.length > 0) {
        const { error: insertError } = await supabase
          .from("proposal_items")
          .insert(
            newItems.map((item) => ({
              proposal_id: proposalId,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              vat_rate: item.vat_rate,
            }))
          );
        if (insertError) throw insertError;
      }

      toast({
        title: t("common.success"),
        description: t("proposals.saved"),
      });

      setHasChanges(false);
      onSave?.();
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateChange = (field: keyof TemplateConfig, value: any) => {
    setTemplate((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const formatCurrency = (value: number) => {
    const symbol = proposal?.currency === "EUR" ? "€" : proposal?.currency || "€";
    const fixed = Math.abs(value).toFixed(2);
    const [int, dec] = fixed.split('.');
    return symbol + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const getClientName = () => {
    if (!proposal?.clients) return "";
    if (proposal.clients.client_type === "company") {
      return proposal.clients.company_name || "";
    }
    return `${proposal.clients.first_name || ""} ${proposal.clients.last_name || ""}`.trim();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[95vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              {t("proposals.visualEditor")}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Badge variant="outline" className="text-amber-600 border-amber-600">
                  {t("common.unsavedChanges")}
                </Badge>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                <X className="h-4 w-4 mr-2" />
                {t("common.close")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar with tabs */}
          <div className="w-80 border-r flex-shrink-0 flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="mx-4 mt-4 grid grid-cols-2">
                <TabsTrigger value="preview" className="text-xs">
                  <Eye className="h-3 w-3 mr-1" />
                  {t("proposals.preview")}
                </TabsTrigger>
                <TabsTrigger value="style" className="text-xs">
                  <Palette className="h-3 w-3 mr-1" />
                  {t("proposals.style")}
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <TabsContent value="preview" className="p-4 space-y-4 m-0">
                  <div className="space-y-2">
                    <Label>{t("proposals.form.title")}</Label>
                    <Input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setHasChanges(true);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("proposals.form.description")}</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setHasChanges(true);
                      }}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("proposals.form.validUntil")}</Label>
                    <Input
                      type="date"
                      value={validUntil}
                      onChange={(e) => {
                        setValidUntil(e.target.value);
                        setHasChanges(true);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("proposals.form.notes")}</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setHasChanges(true);
                      }}
                      rows={3}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label>{t("proposals.showQuoteDetails")}</Label>
                    <Switch
                      checked={template.show_quote_details}
                      onCheckedChange={(checked) => handleTemplateChange("show_quote_details", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>{t("proposals.showCompanyInfo")}</Label>
                    <Switch
                      checked={template.show_company_info}
                      onCheckedChange={(checked) => handleTemplateChange("show_company_info", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>{t("proposals.showClientInfo")}</Label>
                    <Switch
                      checked={template.show_client_info}
                      onCheckedChange={(checked) => handleTemplateChange("show_client_info", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>{t("proposals.showValidity")}</Label>
                    <Switch
                      checked={template.show_validity}
                      onCheckedChange={(checked) => handleTemplateChange("show_validity", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>{t("proposals.showTerms")}</Label>
                    <Switch
                      checked={template.show_terms}
                      onCheckedChange={(checked) => handleTemplateChange("show_terms", checked)}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="style" className="p-4 space-y-4 m-0">
                  <div className="space-y-2">
                    <Label>{t("proposals.template.logo")}</Label>
                    <div className="flex gap-2">
                      {template.logo_url && (
                        <img
                          src={template.logo_url}
                          alt="Logo"
                          className="h-10 w-10 object-contain border rounded"
                        />
                      )}
                      <Button variant="outline" size="sm" onClick={() => setShowLogoGallery(true)}>
                        {t("proposals.template.chooseLogo")}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("proposals.template.primaryColor")}</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          value={template.primary_color}
                          onChange={(e) => handleTemplateChange("primary_color", e.target.value)}
                          className="w-10 h-8 p-0 border-0"
                        />
                        <Input
                          value={template.primary_color}
                          onChange={(e) => handleTemplateChange("primary_color", e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("proposals.template.secondaryColor")}</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          value={template.secondary_color}
                          onChange={(e) => handleTemplateChange("secondary_color", e.target.value)}
                          className="w-10 h-8 p-0 border-0"
                        />
                        <Input
                          value={template.secondary_color}
                          onChange={(e) => handleTemplateChange("secondary_color", e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("proposals.template.backgroundColor")}</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          value={template.background_color}
                          onChange={(e) => handleTemplateChange("background_color", e.target.value)}
                          className="w-10 h-8 p-0 border-0"
                        />
                        <Input
                          value={template.background_color}
                          onChange={(e) => handleTemplateChange("background_color", e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("proposals.template.textColor")}</Label>
                      <div className="flex gap-1">
                        <Input
                          type="color"
                          value={template.text_color}
                          onChange={(e) => handleTemplateChange("text_color", e.target.value)}
                          className="w-10 h-8 p-0 border-0"
                        />
                        <Input
                          value={template.text_color}
                          onChange={(e) => handleTemplateChange("text_color", e.target.value)}
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>{t("proposals.template.headerText")}</Label>
                    <Textarea
                      value={template.header_text || ""}
                      onChange={(e) => handleTemplateChange("header_text", e.target.value)}
                      rows={2}
                      placeholder={t("proposals.template.headerTextPlaceholder")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("proposals.template.footerText")}</Label>
                    <Textarea
                      value={template.footer_text || ""}
                      onChange={(e) => handleTemplateChange("footer_text", e.target.value)}
                      rows={2}
                      placeholder={t("proposals.template.footerTextPlaceholder")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t("proposals.template.termsConditions")}</Label>
                    <Textarea
                      value={template.terms_conditions || ""}
                      onChange={(e) => handleTemplateChange("terms_conditions", e.target.value)}
                      rows={4}
                      placeholder={t("proposals.template.termsPlaceholder")}
                    />
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Main preview area */}
          <div className="flex-1 overflow-auto bg-muted/30 p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <OlyviaLoader size={40} />
              </div>
            ) : proposal ? (
              <div
                className="max-w-4xl mx-auto rounded-lg shadow-lg overflow-hidden"
                style={{
                  backgroundColor: template.background_color,
                  color: template.text_color,
                  fontFamily: template.font_family,
                }}
              >
                {/* Header */}
                <div
                  className="p-8"
                  style={{
                    background: `linear-gradient(135deg, ${template.primary_color} 0%, ${template.secondary_color} 100%)`,
                  }}
                >
                  <div className="flex items-start justify-between">
                    {template.logo_url && (
                      <img
                        src={template.logo_url}
                        alt="Logo"
                        className="h-16 object-contain"
                      />
                    )}
                    <div className="text-right text-white">
                      <h1
                        className="text-3xl font-bold"
                        style={{ fontFamily: template.heading_font_family }}
                      >
                        {title || t("proposals.untitled")}
                      </h1>
                      {template.header_text && (
                        <p className="mt-2 opacity-90">{template.header_text}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-8">
                  {/* Company & Client Info */}
                  {(template.show_company_info || template.show_client_info) && (
                    <div className="grid md:grid-cols-2 gap-8">
                      {template.show_company_info && proposal.companies && (
                        <div>
                          <h3 className="font-semibold text-sm opacity-60 mb-2 flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {t("proposals.company")}
                          </h3>
                          <p className="font-semibold">{proposal.companies.name}</p>
                          {proposal.companies.email && (
                            <p className="text-sm opacity-70">{proposal.companies.email}</p>
                          )}
                          {proposal.companies.phone && (
                            <p className="text-sm opacity-70">{proposal.companies.phone}</p>
                          )}
                        </div>
                      )}
                      {template.show_client_info && proposal.clients && (
                        <div>
                          <h3 className="font-semibold text-sm opacity-60 mb-2 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {t("proposals.client")}
                          </h3>
                          <p className="font-semibold">{getClientName()}</p>
                          {proposal.clients.email && (
                            <p className="text-sm opacity-70">{proposal.clients.email}</p>
                          )}
                          {proposal.clients.phone && (
                            <p className="text-sm opacity-70">{proposal.clients.phone}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  {description && (
                    <div>
                      <h3 className="font-semibold mb-2">{t("proposals.description")}</h3>
                      <p className="opacity-80 whitespace-pre-wrap">{description}</p>
                    </div>
                  )}

                  {/* Validity */}
                  {template.show_validity && validUntil && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      <span className="opacity-60">{t("proposals.validUntil")}:</span>
                      <span className="font-medium">
                        {format(new Date(validUntil), "dd 'de' MMMM 'de' yyyy", { locale: pt })}
                      </span>
                    </div>
                  )}

                  {/* Proposal Items */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">{t("proposals.items")}</h3>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowProductPicker(true)}>
                          <Package className="h-4 w-4 mr-1" />
                          Catálogo
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleAddItem}>
                          <Plus className="h-4 w-4 mr-1" />
                          Manual
                        </Button>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden bg-white">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>{t("proposals.itemDescription")}</TableHead>
                              <TableHead className="text-right w-24">{t("proposals.quantity")}</TableHead>
                              <TableHead className="text-right w-28">{t("proposals.unitPrice")}</TableHead>
                              <TableHead className="text-right w-20">{t("proposals.vatRate")}</TableHead>
                              <TableHead className="text-right w-28">{t("proposals.total")}</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <SortableContext
                              items={items.map((i) => i.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {items.map((item) => (
                                <SortableProposalItem
                                  key={item.id}
                                  item={item}
                                  onUpdate={handleItemUpdate}
                                  onDelete={handleItemDelete}
                                  currency={proposal.currency}
                                />
                              ))}
                            </SortableContext>
                          </TableBody>
                        </Table>
                      </DndContext>

                      {items.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>{t("proposals.noItems")}</p>
                          <Button size="sm" variant="link" onClick={handleAddItem}>
                            {t("proposals.addFirstItem")}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="flex justify-end mt-4">
                      <div
                        className="px-6 py-4 rounded-lg"
                        style={{ backgroundColor: template.primary_color + "15" }}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-medium">{t("proposals.totalValue")}:</span>
                          <span
                            className="text-2xl font-bold"
                            style={{ color: template.primary_color }}
                          >
                            {formatCurrency(calculateTotal())}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quote Details */}
                  {template.show_quote_details && proposal.quotes && proposal.quotes.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4">{t("proposals.linkedQuotes")}</h3>
                      {proposal.quotes.map((quote) => (
                        <Card key={quote.id} className="mb-4">
                          <CardHeader className="py-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {t("quotes.quote")} #{quote.quote_number || quote.id.slice(0, 8)}
                              </span>
                              <Badge variant="outline">{quote.estado}</Badge>
                            </div>
                          </CardHeader>
                          {quote.quote_lines && quote.quote_lines.length > 0 && (
                            <CardContent className="pt-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>{t("proposals.itemDescription")}</TableHead>
                                    <TableHead className="text-right w-20">{t("proposals.quantity")}</TableHead>
                                    <TableHead className="text-right w-28">{t("proposals.total")}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {quote.quote_lines.map((line) => (
                                    <TableRow key={line.id}>
                                      <TableCell>{line.descricao_snapshot || "-"}</TableCell>
                                      <TableCell className="text-right">{line.qt}</TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatCurrency(line.total_com_iva)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </CardContent>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {notes && (
                    <div>
                      <h3 className="font-semibold mb-2">{t("proposals.notes")}</h3>
                      <p className="opacity-80 whitespace-pre-wrap">{notes}</p>
                    </div>
                  )}

                  {/* Terms */}
                  {template.show_terms && template.terms_conditions && (
                    <div className="pt-4 border-t">
                      <h3 className="font-semibold mb-2">{t("proposals.termsConditions")}</h3>
                      <p className="text-sm opacity-70 whitespace-pre-wrap">
                        {template.terms_conditions}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  {template.footer_text && (
                    <div className="pt-4 border-t text-center text-sm opacity-60">
                      {template.footer_text}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {t("proposals.notFound")}
              </div>
            )}
          </div>
        </div>

        <GalleryPickerDialog
          open={showLogoGallery}
          onOpenChange={setShowLogoGallery}
          onSelect={(value) => {
            handleTemplateChange("logo_url", value);
            setShowLogoGallery(false);
          }}
          title={t("proposals.template.chooseLogo")}
          mode="image"
        />

        <ProductPickerDialog
          open={showProductPicker}
          onOpenChange={setShowProductPicker}
          onSelectProducts={handleAddFromCatalog}
          organizationId={(proposal as any)?.organization_id}
        />
      </DialogContent>
    </Dialog>
  );
}
