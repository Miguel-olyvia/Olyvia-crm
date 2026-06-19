import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Eye,
  Star,
  FileText,
  Settings2,
  Palette,
  Loader2,
  CheckCircle2,
  XCircle,
  Link2,
  Check,
  MapPin,
  ExternalLink,
  Code,
  Globe,
} from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { FormBuilder } from "@/components/forms/FormBuilder";
import { FormBrandingConfig } from "@/components/forms/FormBrandingConfig";
import { FormPreview } from "@/components/forms/FormPreview";
import { FormLocationConfig } from "@/components/forms/FormLocationConfig";
import { FormIntegrationsTab } from "@/components/forms/FormIntegrationsTab";
import { FormLocalesConfig } from "@/components/forms/FormLocalesConfig";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { LANGUAGES } from "@/constants/languages";
import {
  readI18nConfig,
  withI18nConfig,
  DEFAULT_FORM_LOCALE,
  type FormI18nConfig,
} from "@/lib/formI18n";

interface Form {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  is_primary: boolean;
  form_type: string;
  settings: any;
  branding: any;
  country_code: string | null;
  location_required: boolean;
  iframe_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  anew_organizations?: { name: string } | null;
  _count?: { fields: number; steps: number };
}

interface Organization {
  id: string;
  name: string;
}

export default function Forms() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  
  const [forms, setForms] = useState<Form[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOrganization, setFilterOrganization] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [localesOpen, setLocalesOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [formToDelete, setFormToDelete] = useState<Form | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    slug: "",
    organization_id: "",
    form_type: "lead",
    is_active: true,
    is_primary: false,
    default_locale: DEFAULT_FORM_LOCALE,
    enabled_locales: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, [activeCompany]);

  useEffect(() => {
    if (activeCompany) {
      setFormData(prev => ({ ...prev, organization_id: activeCompany.id }));
    }
  }, [activeCompany]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Build query - filter by active company if set
      let formsQuery = supabase
        .from("forms")
        .select(`
          *,
          anew_organizations!forms_organization_id_fkey(name)
        `) as any;
      
      // Apply company filter based on activeCompany
      if (activeCompany) {
        formsQuery = formsQuery.eq("organization_id", activeCompany.id);
      }
      
      const { data: formsData, error: formsError } = await formsQuery.order("created_at", { ascending: false });

      if (formsError) throw formsError;

      // Load step and field counts for each form
      const formsWithCounts = await Promise.all((formsData || []).map(async (form) => {
        const [stepsResult, fieldsResult] = await Promise.all([
          supabase.from("form_steps").select("id", { count: "exact" }).eq("form_id", form.id),
          supabase.from("form_fields").select("id", { count: "exact" }).eq("form_id", form.id).eq("is_active", true),
        ]);
        
        return {
          ...form,
          _count: {
            steps: stepsResult.count || 0,
            fields: fieldsResult.count || 0,
          }
        };
      }));

      setForms(formsWithCounts);

      // Load organizations - only show activeCompany for filtering
      if (activeCompany) {
        setOrganizations([{ id: activeCompany.id, name: activeCompany.name }]);
      } else {
        const { data: organizationsData } = await supabase
          .from("anew_organizations")
          .select("id, name")
          .in("type", ["empresa"])
        setOrganizations(organizationsData || []);
      }
    } catch (error) {
      console.error("Error loading forms:", error);
      toast({ title: "Erro ao carregar formulários", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({
          title: "Erro de identidade",
          description: "Não foi possível resolver o utilizador de negócio. Contacta o suporte.",
          variant: "destructive",
        });
        return;
      }
      const slug = formData.slug || generateSlug(formData.name);

      // If setting as primary, unset others
      if (formData.is_primary) {
        await supabase
          .from("forms")
          .update({ is_primary: false })
          .eq("organization_id", formData.organization_id || activeCompany?.id)
          .eq("form_type", formData.form_type);
      }

      // Build i18n payload (only persist when at least one secondary locale is enabled)
      const buildI18nForUpdate = (currentSettings: any): any => {
        const current = readI18nConfig(currentSettings);
        const next: FormI18nConfig = {
          default_locale: formData.default_locale || DEFAULT_FORM_LOCALE,
          enabled_locales: (formData.enabled_locales || []).filter(
            (l) => l !== (formData.default_locale || DEFAULT_FORM_LOCALE),
          ),
          content: current.content || {},
        };
        return withI18nConfig(currentSettings, next);
      };

      if (selectedForm) {
        // Update — fetch settings first to preserve existing overlay content
        const { data: cur } = await supabase
          .from("forms")
          .select("settings")
          .eq("id", selectedForm.id)
          .maybeSingle();
        const nextSettings = buildI18nForUpdate(cur?.settings);

        const { error } = await supabase
          .from("forms")
          .update({
            name: formData.name,
            description: formData.description || null,
            slug,
            organization_id: formData.organization_id || activeCompany?.id || null,
            form_type: formData.form_type,
            is_active: formData.is_active,
            is_primary: formData.is_primary,
            settings: nextSettings,
          })
          .eq("id", selectedForm.id);

        if (error) throw error;
        toast({ title: "Formulário atualizado" });
      } else {
        // Create
        const initialI18n: FormI18nConfig = {
          default_locale: formData.default_locale || DEFAULT_FORM_LOCALE,
          enabled_locales: (formData.enabled_locales || []).filter(
            (l) => l !== (formData.default_locale || DEFAULT_FORM_LOCALE),
          ),
          content: {},
        };
        const initialSettings = withI18nConfig({}, initialI18n);

        const { data: newForm, error } = await supabase
          .from("forms")
          .insert({
            name: formData.name,
            description: formData.description || null,
            slug,
            organization_id: formData.organization_id || activeCompany?.id || null,
            form_type: formData.form_type,
            is_active: formData.is_active,
            is_primary: formData.is_primary,
            settings: initialSettings,
            created_by: businessUserId,
          })
          .select("id")
          .single();

        if (error) throw error;

        // Auto-seed base contact fields for lead forms
        if (formData.form_type === "lead" && newForm?.id) {
          try {
            // Create default step
            const { data: newStep } = await supabase
              .from("form_steps")
              .insert({
                form_id: newForm.id,
                step_number: 1,
                step_title: "Informações de Contacto",
                step_description: null,
                sort_order: 1,
                step_type: "fields",
              })
              .select("id")
              .single();

            if (newStep) {
              const { LEAD_FORM_BASE_FIELDS } = await import("@/constants/fieldMappings");
              const baseFields = LEAD_FORM_BASE_FIELDS.map((f, idx) => ({
                form_id: newForm.id,
                step_number: 1,
                field_key: f.field_key,
                field_label: f.field_label,
                field_type: f.field_type,
                is_required: f.is_required,
                is_unique: false,
                is_active: true,
                sort_order: idx + 1,
                contact_field_mapping: f.contact_field_mapping,
              }));

              await supabase.from("form_fields").insert(baseFields);
            }
          } catch (seedError) {
            console.error("Error seeding base fields:", seedError);
          }
        }

        toast({ title: "Formulário criado" });
      }

      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error("Error saving form:", error);
      toast({ 
        title: "Erro ao guardar", 
        description: error.message?.includes("duplicate") ? "Já existe um formulário com este slug" : error.message,
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!formToDelete) return;

    try {
      const { error } = await supabase
        .from("forms")
        .delete()
        .eq("id", formToDelete.id);

      if (error) throw error;

      toast({ title: "Formulário eliminado" });
      setDeleteDialogOpen(false);
      setFormToDelete(null);
      loadData();
    } catch (error: any) {
      console.error("Error deleting form:", error);
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    }
  };

  const handleSetPrimary = async (form: Form) => {
    try {
      // Unset all primary for this company/type
      await supabase
        .from("forms")
        .update({ is_primary: false })
        .eq("organization_id", form.organization_id)
        .eq("form_type", form.form_type);

      // Set this one as primary
      const { error } = await supabase
        .from("forms")
        .update({ is_primary: true })
        .eq("id", form.id);

      if (error) throw error;

      toast({ title: "Formulário definido como primário" });
      loadData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (form: Form) => {
    try {
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({
          title: "Erro de identidade",
          description: "Não foi possível resolver o utilizador de negócio. Contacta o suporte.",
          variant: "destructive",
        });
        return;
      }
      const newSlug = `${form.slug}-copy-${Date.now()}`;

      // Create new form
      const { data: newForm, error: formError } = await supabase
        .from("forms")
        .insert({
          name: `${form.name} (Cópia)`,
          description: form.description,
          slug: newSlug,
          organization_id: form.organization_id,
          form_type: form.form_type,
          is_active: false,
          is_primary: false,
          settings: form.settings,
          branding: form.branding,
          country_code: form.country_code,
          location_required: form.location_required,
          iframe_enabled: form.iframe_enabled,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (formError) throw formError;

      // Copy steps
      const { data: steps } = await supabase
        .from("form_steps")
        .select("*")
        .eq("form_id", form.id);

      if (steps && steps.length > 0) {
        await supabase.from("form_steps").insert(
          steps.map(s => ({
            form_id: newForm.id,
            step_number: s.step_number,
            step_title: s.step_title,
            step_description: s.step_description,
            step_subtitle: s.step_subtitle,
            next_button_text: s.next_button_text,
            previous_button_text: s.previous_button_text,
            submit_button_text: s.submit_button_text,
            sort_order: s.sort_order,
          }))
        );
      }

      // Copy fields
      const { data: fields } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", form.id);

      if (fields && fields.length > 0) {
        await supabase.from("form_fields").insert(
          fields.map(f => ({
            form_id: newForm.id,
            step_number: f.step_number,
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type,
            is_required: f.is_required,
            is_unique: f.is_unique,
            is_active: f.is_active,
            placeholder: f.placeholder,
            help_text: f.help_text,
            options: f.options,
            display_style: f.display_style,
            min_length: f.min_length,
            max_length: f.max_length,
            min_value: f.min_value,
            max_value: f.max_value,
            pattern: f.pattern,
            pattern_message: f.pattern_message,
            contact_field_mapping: f.contact_field_mapping,
            client_field_mapping: f.client_field_mapping,
            sort_order: f.sort_order,
            created_by: businessUserId,
          }))
        );
      }

      // Copy branding
      const { data: branding } = await supabase
        .from("form_branding")
        .select("*")
        .eq("form_id", form.id)
        .maybeSingle();

      if (branding) {
        const { id, form_id, created_at, updated_at, ...brandingData } = branding;
        await supabase.from("form_branding").insert({
          ...brandingData,
          form_id: newForm.id,
        });
      }

      // Copy districts
      const { data: districts } = await supabase
        .from("form_districts")
        .select("district_id")
        .eq("form_id", form.id);

      if (districts && districts.length > 0) {
        await supabase.from("form_districts").insert(
          districts.map(d => ({
            form_id: newForm.id,
            district_id: d.district_id,
          }))
        );
      }

      toast({ title: "Formulário duplicado" });
      loadData();
    } catch (error: any) {
      console.error("Error duplicating form:", error);
      toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    }
  };

  const copyPublicLink = async (form: Form, e: React.MouseEvent) => {
    e.stopPropagation();
    const publicUrl = `${window.location.origin}/form/${form.id}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLinkId(form.id);
      toast({ title: "Link copiado!", description: "Link público copiado para a área de transferência" });
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (err) {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const openEditDialog = (form: Form) => {
    setSelectedForm(form);
    const i18n = readI18nConfig(form.settings);
    setFormData({
      name: form.name,
      description: form.description || "",
      slug: form.slug,
      organization_id: form.organization_id || "",
      form_type: form.form_type,
      is_active: form.is_active,
      is_primary: form.is_primary,
      default_locale: i18n.default_locale || DEFAULT_FORM_LOCALE,
      enabled_locales: i18n.enabled_locales || [],
    });
    setDialogOpen(true);
  };

  const openBuilder = (form: Form) => {
    setSelectedForm(form);
    setBuilderOpen(true);
  };

  const openBranding = (form: Form) => {
    setSelectedForm(form);
    setBrandingOpen(true);
  };

  const openPreview = (form: Form) => {
    setSelectedForm(form);
    setPreviewOpen(true);
  };

  const openLocation = (form: Form) => {
    setSelectedForm(form);
    setLocationOpen(true);
  };

  const openIntegrations = (form: Form) => {
    setSelectedForm(form);
    setIntegrationsOpen(true);
  };

  const openLocales = (form: Form) => {
    setSelectedForm(form);
    setLocalesOpen(true);
  };

  const resetForm = () => {
    setSelectedForm(null);
    setFormData({
      name: "",
      description: "",
      slug: "",
      organization_id: activeCompany?.id || "",
      form_type: "lead",
      is_active: true,
      is_primary: false,
      default_locale: DEFAULT_FORM_LOCALE,
      enabled_locales: [],
    });
  };

  // Filter forms
  const filteredForms = forms.filter(form => {
    const matchesSearch = form.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          form.slug.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrganization = filterOrganization === "all" || form.organization_id === filterOrganization;
    const matchesType = filterType === "all" || form.form_type === filterType;
    const matchesStatus = filterStatus === "all" || 
                          (filterStatus === "active" && form.is_active) ||
                          (filterStatus === "inactive" && !form.is_active);
    
    return matchesSearch && matchesOrganization && matchesType && matchesStatus;
  });

  const getFormTypeLabel = (type: string) => {
    const typeKey = `forms.type.${type}` as const;
    return t(typeKey) || type;
  };

  if (companyLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </>
    );
  }

  if (!activeCompany) {
    return (
      <>
        <div className="space-y-6">
          <div><h1 className="text-2xl font-bold">{t("forms.title")}</h1><p className="text-muted-foreground">{t("forms.subtitle")}</p></div>
          <NoOrganizationState inline />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("forms.title")}</h1>
            <p className="text-muted-foreground">
              {t("forms.subtitle")}
            </p>
          </div>
          <PermissionGate permission="forms.create">
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("forms.new")}
            </Button>
          </PermissionGate>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("forms.search")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              
              <Select value={filterOrganization} onValueChange={setFilterOrganization}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("forms.filter.allCompanies")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("forms.filter.allCompanies")}</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t("forms.filter.allTypes")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("forms.filter.allTypes")}</SelectItem>
                  <SelectItem value="lead">{t("forms.type.lead")}</SelectItem>
                  <SelectItem value="contact">{t("forms.type.contact")}</SelectItem>
                  <SelectItem value="survey">{t("forms.type.survey")}</SelectItem>
                  <SelectItem value="feedback">{t("forms.type.feedback")}</SelectItem>
                  <SelectItem value="registration">{t("forms.type.registration")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t("forms.filter.allStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("forms.filter.allStatus")}</SelectItem>
                  <SelectItem value="active">{t("forms.filter.active")}</SelectItem>
                  <SelectItem value="inactive">{t("forms.filter.inactive")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Forms Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <OlyviaLoader size={40} />
              </div>
            ) : filteredForms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">{t("forms.noFormsFound")}</p>
                <p className="text-sm">{t("forms.createFirst")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("forms.table.name")}</TableHead>
                    <TableHead>{t("forms.table.company")}</TableHead>
                    <TableHead>{t("forms.table.type")}</TableHead>
                    <TableHead className="text-center">{t("forms.table.fields")}</TableHead>
                    <TableHead className="text-center">{t("forms.table.steps")}</TableHead>
                    <TableHead className="text-center">{t("forms.table.status")}</TableHead>
                    <TableHead className="text-center">{t("forms.table.primary")}</TableHead>
                    <TableHead className="text-center">{t("forms.table.quickActions")}</TableHead>
                    <TableHead className="text-right">{t("forms.table.menu")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredForms.map(form => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{form.name}</p>
                          <p className="text-xs text-muted-foreground">/{form.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{form.anew_organizations?.name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getFormTypeLabel(form.form_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{form._count?.fields || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{form._count?.steps || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {form.is_active ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t("forms.status.active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t("forms.status.inactive")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {form.is_primary && (
                          <Star className="h-4 w-4 text-yellow-500 mx-auto fill-yellow-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => copyPublicLink(form, e)}
                              >
                                {copiedLinkId === form.id ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Link2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("forms.tooltip.copyLink")}</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openPreview(form)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("forms.tooltip.preview")}</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openBranding(form)}
                              >
                                <Palette className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("forms.tooltip.branding")}</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openLocation(form)}
                              >
                                <MapPin className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("forms.tooltip.location")}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openIntegrations(form)}
                              >
                                <Code className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Integrações / Embed</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <PermissionGate permission="forms.edit">
                              <DropdownMenuItem onClick={() => openBuilder(form)}>
                                <Settings2 className="h-4 w-4 mr-2" />
                                {t("forms.menu.configureFields")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(form)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                {t("forms.menu.edit")}
                              </DropdownMenuItem>
                            </PermissionGate>
                            <PermissionGate permission="forms.create">
                              <DropdownMenuItem onClick={() => handleDuplicate(form)}>
                                <Copy className="h-4 w-4 mr-2" />
                                {t("forms.menu.duplicate")}
                              </DropdownMenuItem>
                            </PermissionGate>
                            {!form.is_primary && (
                              <PermissionGate permission="forms.edit">
                                <DropdownMenuItem onClick={() => handleSetPrimary(form)}>
                                  <Star className="h-4 w-4 mr-2" />
                                  {t("forms.menu.setPrimary")}
                                </DropdownMenuItem>
                              </PermissionGate>
                            )}
                            <PermissionGate permission="forms.edit">
                              <DropdownMenuItem onClick={() => openIntegrations(form)}>
                                <Code className="h-4 w-4 mr-2" />
                                Integrações
                              </DropdownMenuItem>
                            </PermissionGate>
                            <PermissionGate permission="forms.edit">
                              <DropdownMenuItem onClick={() => openLocales(form)}>
                                <Globe className="h-4 w-4 mr-2" />
                                Idiomas
                              </DropdownMenuItem>
                            </PermissionGate>
                            <DropdownMenuSeparator />
                            <PermissionGate permission="forms.delete">
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => { setFormToDelete(form); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t("forms.menu.delete")}
                              </DropdownMenuItem>
                            </PermissionGate>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedForm ? t("forms.dialog.editForm") : t("forms.dialog.newForm")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("forms.dialog.name")} *</Label>
              <Input
                placeholder={t("forms.dialog.namePlaceholder")}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ 
                    ...formData, 
                    name: e.target.value,
                    slug: !selectedForm ? generateSlug(e.target.value) : formData.slug
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("forms.dialog.slug")}</Label>
              <Input
                placeholder="formulario-leads"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: generateSlug(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">{t("forms.dialog.slugHint")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("forms.dialog.description")}</Label>
              <Textarea
                placeholder={t("forms.dialog.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("forms.dialog.company")}</Label>
                <Select
                  value={formData.organization_id}
                  onValueChange={(v) => setFormData({ ...formData, organization_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("forms.dialog.selectCompany")} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("forms.dialog.type")}</Label>
                <Select
                  value={formData.form_type}
                  onValueChange={(v) => setFormData({ ...formData, form_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">{t("forms.type.lead")}</SelectItem>
                    <SelectItem value="contact">{t("forms.type.contact")}</SelectItem>
                    <SelectItem value="survey">{t("forms.type.survey")}</SelectItem>
                    <SelectItem value="feedback">{t("forms.type.feedback")}</SelectItem>
                    <SelectItem value="registration">{t("forms.type.registration")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Languages */}
            <div className="space-y-3">
              <div>
                <Label>Idiomas</Label>
                <p className="text-xs text-muted-foreground">
                  O idioma principal escreve nos campos base. Idiomas adicionais ficam guardados como tradução opcional.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Idioma principal</Label>
                  <Select
                    value={formData.default_locale}
                    onValueChange={(v) =>
                      setFormData({
                        ...formData,
                        default_locale: v,
                        enabled_locales: formData.enabled_locales.filter((l) => l !== v),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Idiomas adicionais</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.filter((lang) => lang.code !== formData.default_locale).map((lang) => {
                    const enabled = formData.enabled_locales.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            enabled_locales: enabled
                              ? formData.enabled_locales.filter((l) => l !== lang.code)
                              : [...formData.enabled_locales, lang.code],
                          })
                        }
                        className={`px-2.5 py-1 rounded-md border text-xs transition ${
                          enabled
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border"
                        }`}
                      >
                        {lang.name}
                      </button>
                    );
                  })}
                </div>
                {formData.enabled_locales.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Sem idiomas adicionais — o formulário funciona apenas em {LANGUAGES.find((l) => l.code === formData.default_locale)?.name || formData.default_locale}.
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t("forms.dialog.active")}</Label>
                  <p className="text-xs text-muted-foreground">{t("forms.dialog.activeHint")}</p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />
                    {t("forms.dialog.primary")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t("forms.dialog.primaryHint")}</p>
                </div>
                <Switch
                  checked={formData.is_primary}
                  onCheckedChange={(v) => setFormData({ ...formData, is_primary: v })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("forms.delete.cancel")}</Button>
            <Button onClick={handleSubmit}>
              {selectedForm ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("forms.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("forms.delete.description", { name: formToDelete?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("forms.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t("forms.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form Builder Dialog */}
      {selectedForm && (
        <FormBuilder
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
          companyId={selectedForm.organization_id || ""}
          formType={selectedForm.form_type}
        />
      )}

      {/* Form Branding Dialog */}
      {selectedForm && (
        <FormBrandingConfig
          open={brandingOpen}
          onOpenChange={setBrandingOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
        />
      )}

      {/* Form Preview Dialog */}
      {selectedForm && (
        <FormPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
          formSlug={selectedForm.slug}
        />
      )}

      {/* Form Location Dialog */}
      {selectedForm && (
        <FormLocationConfig
          open={locationOpen}
          onOpenChange={setLocationOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
          currentCountryCode={selectedForm.country_code || undefined}
          currentLocationRequired={selectedForm.location_required}
          onSave={loadData}
        />
      )}

      {/* Form Integrations Dialog */}
      {selectedForm && (
        <FormIntegrationsTab
          open={integrationsOpen}
          onOpenChange={setIntegrationsOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
          formSlug={selectedForm.slug}
          companyId={selectedForm.organization_id || undefined}
        />
      )}

      {/* Form Locales Dialog */}
      {selectedForm && (
        <FormLocalesConfig
          open={localesOpen}
          onOpenChange={setLocalesOpen}
          formId={selectedForm.id}
          formName={selectedForm.name}
          onSave={loadData}
        />
      )}
    </>
  );
}
