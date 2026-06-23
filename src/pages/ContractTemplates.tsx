import { useState, useRef, useCallback, useMemo, useDeferredValue, useEffect } from "react";
import DOMPurify from "dompurify";
import { renderContractHeaderHtml } from "@/components/contracts/contractHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy, Eye, Loader2, FileText, ShieldAlert, ArrowLeft, Star, ChevronDown, FileEdit, Settings2, Download, PenTool, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PermissionGate } from "@/components/PermissionGate";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { CONTRACT_VARIABLES, substituteVariables, SAMPLE_VARIABLE_DATA } from "@/utils/contractVariables";
import { applyQuoteItemsToken, applyFormulaChips, injectSignatoryIntoSignatureBlock } from "@/components/contracts/contractDocument";
import { useOrgHeaderData, applyOrgHeaderOverrides } from "@/components/contracts/useOrgHeaderData";
import { upsertQuoteItemsChipInHtml, readQuoteItemsChipConfig } from "@/components/contracts/TableInsertPopover";
import { DEFAULT_QUOTE_ITEMS_CONFIG, type QuoteItemsChipConfig } from "@/components/contracts/DataTableConfigForm";
import { BASE_TEMPLATES, VARIABLE_CATEGORIES, CLAUSE_ORDINALS, type BaseTemplate } from "@/utils/contractBaseTemplates";
import { DocumentSettingsPanel } from "@/components/contracts/DocumentSettingsPanel";
import { TemplateDocSettingsPanel, type TemplateDocSettings } from "@/components/contracts/TemplateDocSettingsPanel";
import { EnhancedToolbarButtons } from "@/components/contracts/EnhancedToolbarButtons";
import { useDocumentSettings, type DocumentSettings } from "@/hooks/useDocumentSettings";
import { CustomVariablesManager } from "@/components/contracts/CustomVariablesManager";
import { TemplateFileImport } from "@/components/contracts/TemplateFileImport";
import { VariableDetectionAssistant } from "@/components/contracts/VariableDetectionAssistant";
import { TemplateExportButtons } from "@/components/contracts/TemplateExportButtons";
import { SignatoriesPanel, type Signatory } from "@/components/contracts/SignatoriesPanel";
import { SignatoryOtpDialog } from "@/components/contracts/SignatoryOtpDialog";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { DocumentPreview } from "@/components/document-editor/DocumentPreview";

interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  body_html: string;
  is_active: boolean | null;
  is_default: boolean | null;
  organization_id: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  signatory_user_id: string | null;
  signatory_role_id: string | null;
  doc_settings: TemplateDocSettings | null;
}

const ContractTemplates = () => {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading, isSystemAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSettings, setPreviewSettings] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", body_html: "", is_active: true, is_default: false, signatory_user_id: null as string | null, signatory_role_id: null as string | null, doc_settings: null as TemplateDocSettings | null });
  const [showBaseTemplates, setShowBaseTemplates] = useState(false);
  const [editorTab, setEditorTab] = useState<string>("editor");
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);
  const [pendingSignatory, setPendingSignatory] = useState<Signatory | null>(null);
  
  const editorRef = useRef<RichTextEditorHandle>(null);
  const { settings: docSettings } = useDocumentSettings();
  const [liveDocSettings, setLiveDocSettings] = useState<typeof docSettings>(null);
  const [isVariableAssistantOpen, setIsVariableAssistantOpen] = useState(false);

  // Fetch organization custom variables to merge into the editor's variable dropdown
  const { data: customVariables = [] } = useQuery({
    queryKey: ["custom-contract-variables", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("custom_contract_variables")
        .select("variable_key, label, description")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!activeCompany?.id,
  });

  const editorVariables = useMemo(() => {
    const customs = (customVariables as any[]).map((v) => ({
      key: v.variable_key,
      label: v.label,
      description: v.description || "Variável personalizada",
    }));
    return [...CONTRACT_VARIABLES, ...customs];
  }, [customVariables]);

  // Shared preview pipeline — editor live pane uses mergedSettings; Preview Dialog uses its own snapshot via previewSettings.
  const mergedSettings = useMemo<any>(() => ({
    ...(docSettings || {}),
    ...(liveDocSettings || {}),
    ...(formData.doc_settings || {}),
    show_quote_items: true,
  }), [docSettings, liveDocSettings, formData.doc_settings]);
  const primaryColor: string = mergedSettings.primary_color || "#7C3AED";
  // Fetch active org empresa data so the template preview reflects real organization info
  const { data: orgHeader } = useOrgHeaderData();
  const orgPreviewData = useMemo<Record<string, any> | null>(() => {
    if (!orgHeader) return null;
    const overrides = {
      company_name_override: mergedSettings.company_name_override,
      company_address_override: mergedSettings.company_address_override,
      company_nif_override: mergedSettings.company_nif_override,
      company_phone_override: mergedSettings.company_phone_override,
      company_email_override: mergedSettings.company_email_override,
      company_website: mergedSettings.company_website,
    };
    const merged = applyOrgHeaderOverrides(orgHeader, overrides);
    // Strip empty so we fall back to sample
    const out: Record<string, any> = { ...merged };
    Object.keys(out).forEach((k) => { if (!out[k]) delete out[k]; });
    return out;
  }, [
    orgHeader,
    mergedSettings.company_name_override,
    mergedSettings.company_address_override,
    mergedSettings.company_nif_override,
    mergedSettings.company_phone_override,
    mergedSettings.company_email_override,
    mergedSettings.company_website,
  ]);

  // Resolve real data for the selected signatory (name + role label) so the
  // preview reflects who will actually sign for the company.
  const { data: selectedSignatoryData } = useQuery({
    queryKey: ["selected-signatory", formData.signatory_user_id, formData.signatory_role_id],
    queryFn: async () => {
      if (!formData.signatory_user_id) return null;
      const [{ data: u }, { data: r }] = await Promise.all([
        (supabase as any).from("anew_users").select("name").eq("id", formData.signatory_user_id).maybeSingle(),
        formData.signatory_role_id
          ? (supabase as any).from("anew_roles").select("name").eq("id", formData.signatory_role_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { name: u?.name || "", roleName: r?.name || "" };
    },
    enabled: !!formData.signatory_user_id,
  });

  const previewSampleData = useMemo(() => {
    const base: Record<string, any> = {
      ...SAMPLE_VARIABLE_DATA,
      ...(orgPreviewData || {}),
    };
    if (selectedSignatoryData?.name) {
      base.signatario_nome = selectedSignatoryData.name;
      base.signatario_cargo = selectedSignatoryData.roleName || "";
    }
    return base;
  }, [orgPreviewData, selectedSignatoryData]);

  // Reutiliza o helper partilhado (mesma lógica usada na geração/preview do contrato do cliente)
  const injectSignatoryFallback = useCallback((html: string): string => {
    return injectSignatoryIntoSignatureBlock(
      html,
      selectedSignatoryData?.name,
      selectedSignatoryData?.roleName,
    );
  }, [selectedSignatoryData]);

  const editorPreprocess = useCallback(
    (html: string, sampleData: Record<string, any>) => {
      const withItems = applyQuoteItemsToken(html, sampleData as any, mergedSettings, primaryColor, false);
      const substituted = substituteVariables(withItems, sampleData);
      const withFormulas = applyFormulaChips(substituted, sampleData as any);
      return injectSignatoryFallback(withFormulas);
    },
    [mergedSettings, primaryColor, injectSignatoryFallback],
  );
  const buildPreviewHtml = useCallback(
    (html: string, sampleData: Record<string, any>, settings: any) => {
      const color = settings?.primary_color || "#7C3AED";
      const withItems = applyQuoteItemsToken(html, sampleData as any, settings, color, false);
      const substituted = substituteVariables(withItems, sampleData);
      const withFormulas = applyFormulaChips(substituted, sampleData as any);
      return injectSignatoryFallback(withFormulas);
    },
    [injectSignatoryFallback],
  );
  const deferredBody = useDeferredValue(formData.body_html);

  // ─── Sync between lateral "Lista de Artigos" settings and the block in body_html ───
  // The settings panel writes into formData.doc_settings; this effect propagates
  // toggle/title/columns changes into body_html (insert / update / remove the block).
  // It runs only when the editor dialog is open to avoid touching unsaved drafts.
  const lastSyncedSigRef = useRef<string>("");
  useEffect(() => {
    if (!isEditorOpen) return;
    const ds: any = formData.doc_settings || {};
    const enabled = ds.show_quote_items === true;
    const descriptionOnly = ds.quote_items_description_only === true;
    const cfg: QuoteItemsChipConfig = {
      ...DEFAULT_QUOTE_ITEMS_CONFIG,
      title: ds.quote_items_title || DEFAULT_QUOTE_ITEMS_CONFIG.title,
      columnOrder: Array.isArray(ds.quote_items_column_order) ? ds.quote_items_column_order : DEFAULT_QUOTE_ITEMS_CONFIG.columnOrder,
      showQuantity: descriptionOnly ? false : (ds.quote_items_show_quantity !== false),
      showUnit:     descriptionOnly ? false : (ds.quote_items_show_unit     !== false),
      showPrice:    descriptionOnly ? false : (ds.quote_items_show_price    !== false),
      showTotal:    descriptionOnly ? false : (ds.quote_items_show_total    !== false),
      headerBg:    ds.table_header_color || ds.primary_color || null,
      headerColor: ds.table_header_text_color || null,
      zebra:       ds.table_zebra === true,
      zebraColor:  ds.table_zebra_color || null,
      borderColor: ds.table_border_color || null,
    };
    const sig = JSON.stringify({ enabled, cfg });
    if (sig === lastSyncedSigRef.current) return;
    const nextBody = upsertQuoteItemsChipInHtml(formData.body_html || "", cfg, enabled);
    lastSyncedSigRef.current = sig;
    if (nextBody !== formData.body_html) {
      setFormData(fd => ({ ...fd, body_html: nextBody }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditorOpen,
    formData.doc_settings?.show_quote_items,
    formData.doc_settings?.quote_items_title,
    formData.doc_settings?.quote_items_description_only,
    formData.doc_settings?.quote_items_show_quantity,
    formData.doc_settings?.quote_items_show_unit,
    formData.doc_settings?.quote_items_show_price,
    formData.doc_settings?.quote_items_show_total,
    JSON.stringify(formData.doc_settings?.quote_items_column_order || []),
    formData.doc_settings?.table_header_color,
    formData.doc_settings?.table_header_text_color,
    formData.doc_settings?.table_zebra,
    formData.doc_settings?.table_zebra_color,
    formData.doc_settings?.table_border_color,
  ]);

  // Reset sync signature when opening a different template so the first sync runs.
  useEffect(() => {
    lastSyncedSigRef.current = "";
  }, [editingTemplate?.id, isEditorOpen]);

  const canView = hasPermission("client_contracts.view") || hasPermission("client_contracts.manage_templates") || isSystemAdmin;
  const canManage = hasPermission("client_contracts.manage_templates") || isSystemAdmin;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["contract-templates", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("client_contract_templates")
        .select("id, name, description, body_html, is_active, is_default, organization_id, created_at, created_by, updated_at, signatory_user_id, signatory_role_id, doc_settings")
        .eq("organization_id", activeCompany.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ContractTemplate[];
    },
    enabled: !!activeCompany?.id && canView,
  });

  const { data: usageCounts = {} } = useQuery({
    queryKey: ["contract-template-usage", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return {};
      const { data, error } = await (supabase as any)
        .from("client_contracts")
        .select("template_id")
        .eq("organization_id", activeCompany.id)
        .not("template_id", "is", null);
      if (error) return {};
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => { counts[c.template_id] = (counts[c.template_id] || 0) + 1; });
      return counts;
    },
    enabled: !!activeCompany?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Não autenticado");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      if (data.is_default) {
        await (supabase as any).from("client_contract_templates").update({ is_default: false }).eq("organization_id", activeCompany?.id);
      }
      const { data: inserted, error } = await (supabase as any).from("client_contract_templates").insert({
        name: data.name, body_html: data.body_html, is_active: data.is_active, is_default: data.is_default,
        organization_id: activeCompany?.id, created_by: businessUserId,
        signatory_user_id: data.signatory_user_id, signatory_role_id: data.signatory_role_id,
        doc_settings: data.doc_settings,
      }).select("id");
      if (error) throw error;
      if (!inserted || inserted.length === 0) throw new Error("Sem permissão para criar minuta");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Minuta criada com sucesso");
      handleCloseEditor();
    },
    onError: (error) => toast.error("Erro: " + error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      if (data.is_default) {
        await (supabase as any).from("client_contract_templates").update({ is_default: false }).eq("organization_id", activeCompany?.id);
      }
      const { data: updated, error } = await (supabase as any)
        .from("client_contract_templates")
        .update({ name: data.name, body_html: data.body_html, is_active: data.is_active, is_default: data.is_default, signatory_user_id: data.signatory_user_id, signatory_role_id: data.signatory_role_id, doc_settings: data.doc_settings })
        .eq("id", data.id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("Sem permissão para guardar esta minuta");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Minuta actualizada");
      handleCloseEditor();
    },
    onError: (error) => toast.error("Erro: " + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: deleted, error } = await (supabase as any).from("client_contract_templates").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Sem permissão para eliminar minuta");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Minuta eliminada");
      setIsDeleteOpen(false);
      setDeleteId(null);
    },
    onError: (error) => toast.error("Erro: " + error.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: ContractTemplate) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Não autenticado");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const { data: inserted, error } = await (supabase as any).from("client_contract_templates").insert({
        name: `${template.name} (cópia)`, body_html: template.body_html, is_active: false, is_default: false,
        organization_id: activeCompany?.id, created_by: businessUserId,
      }).select("id");
      if (error) throw error;
      if (!inserted || inserted.length === 0) throw new Error("Sem permissão para duplicar minuta");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Minuta duplicada");
    },
    onError: (error) => toast.error("Erro: " + error.message),
  });

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingTemplate(null);
    setFormData({ name: "", body_html: "", is_active: true, is_default: false, signatory_user_id: null, signatory_role_id: null, doc_settings: null });
    setShowBaseTemplates(false);
    setEditorTab("editor");


  };

  const handleEdit = (template: ContractTemplate) => {
    setEditingTemplate(template);
    setFormData({ name: template.name, body_html: template.body_html, is_active: template.is_active ?? true, is_default: template.is_default ?? false, signatory_user_id: template.signatory_user_id, signatory_role_id: template.signatory_role_id, doc_settings: template.doc_settings ?? null });
    setIsEditorOpen(true);
  };

  const handlePreview = (template: ContractTemplate) => {
    const tDoc: any = { ...(docSettings || {}), ...(template.doc_settings || {}), show_quote_items: true };
    setPreviewHtml(buildPreviewHtml(template.body_html, previewSampleData, tDoc));
    setPreviewSettings(tDoc);
    setIsPreviewOpen(true);
  };

  const handleFileImport = (html: string, fileName: string, isFromPdf: boolean) => {
    const baseName = fileName.replace(/\.(docx|pdf)$/i, "").trim();
    setFormData({ ...formData, name: formData.name || baseName, body_html: html });
    setIsEditorOpen(true);
    if (isFromPdf) {
      toast.info("Texto extraído do PDF — reveja a formatação e insira as variáveis", { duration: 5000 });
    }
    // Open variable detection assistant after a brief delay
    setTimeout(() => setIsVariableAssistantOpen(true), 500);
  };

  const handleSelectBaseTemplate = (base: BaseTemplate) => {
    setFormData({ ...formData, name: formData.name || `Contrato de ${base.name}`, body_html: base.html });
    setShowBaseTemplates(false);
  };

  const handleInsertClause = () => {
    if (!editorRef.current) return;
    const currentHtml = formData.body_html || "";
    const clauseMatches = currentHtml.match(/<strong>([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+) —/g);
    const nextIndex = clauseMatches ? clauseMatches.length : 0;
    const ordinal = CLAUSE_ORDINALS[nextIndex] || `CLÁUSULA ${nextIndex + 1}`;
    const clauseHtml = `<br/><p><strong>${ordinal} — Título da Cláusula</strong></p><p><em>(clique aqui para editar esta cláusula...)</em></p><br/>`;
    document.execCommand("insertHTML", false, clauseHtml);
  };

  const handleExecCommand = useCallback((cmd: string, value?: string) => {
    editorRef.current?.execCommand(cmd, value);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.body_html) { toast.error("Preencha o nome e o corpo da minuta"); return; }
    if (editingTemplate) {
      updateMutation.mutate({ ...formData, id: editingTemplate.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (permissionsLoading) {
    return <><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></>;
  }

  if (!canView && !isSystemAdmin && activeCompany) {
    navigate("/dashboard");
    return null;
  }

  const wordCount = formData.body_html ? formData.body_html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length : 0;
  const clauseCount = countClauses(formData.body_html);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" /> Minutas / Templates de Contrato
              </h1>
              <p className="text-muted-foreground text-sm">Crie modelos de contrato reutilizáveis com variáveis automáticas</p>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <TemplateFileImport onImport={handleFileImport} />
              <Button onClick={() => setIsEditorOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nova Minuta
              </Button>
            </div>
          )}
        </div>

        {/* Templates list */}
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma minuta encontrada</p>
            <p className="text-sm">Crie a primeira minuta de contrato</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => {
              const usage = usageCounts[template.id] || 0;
              return (
                <div
                  key={template.id}
                  className={`border rounded-lg p-4 transition-colors ${template.is_default ? "border-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{template.name}</h3>
                          {template.is_default && <Badge className="bg-primary/20 text-primary text-[10px]">Default</Badge>}
                          {!template.is_active && <Badge variant="secondary" className="text-[10px]">Inactiva</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {countClauses(template.body_html)} cláusulas · Usado {usage} {usage === 1 ? "vez" : "vezes"} · Última edição: {new Date(template.updated_at).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(template)} title="Editar"><Pencil className="h-4 w-4 text-orange-500" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateMutation.mutate(template)} disabled={duplicateMutation.isPending} title="Duplicar"><Copy className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(template)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <TemplateExportButtons templateName={template.name} bodyHtml={template.body_html} variant="icon" docSettingsOverride={{ ...(docSettings || {}), ...(template.doc_settings || {}) }} sampleData={previewSampleData} />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDeleteId(template.id); setIsDeleteOpen(true); }} title="Eliminar"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Editor Dialog */}
        <Dialog open={isEditorOpen} onOpenChange={(open) => !open && handleCloseEditor()}>
          <DialogContent className="max-w-[95vw] w-[1400px] max-h-[95vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? `Editar Minuta — "${editingTemplate.name}"` : showBaseTemplates ? "Nova Minuta" : (formData.body_html ? `Nova Minuta — ${formData.name || "Contrato"}` : "Nova Minuta")}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate ? "Edite o texto, insira variáveis e organize as cláusulas" : "Crie uma nova minuta de contrato com variáveis automáticas"}
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Base template selection */}
            {!editingTemplate && !formData.body_html && !showBaseTemplates ? (
              <div className="space-y-5 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nome da Minuta *</Label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Contrato de Prestação de Serviços" />
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Switch id="is_active_sel" checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c })} />
                      <Label htmlFor="is_active_sel" className="text-sm">Activa</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="is_default_sel" checked={formData.is_default} onCheckedChange={c => setFormData({ ...formData, is_default: c })} />
                      <Label htmlFor="is_default_sel" className="text-sm">Default</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Começar com um modelo base:</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BASE_TEMPLATES.map(bt => (
                      <button
                        key={bt.id}
                        type="button"
                        onClick={() => handleSelectBaseTemplate(bt)}
                        className="border-2 border-muted rounded-xl p-4 text-center hover:border-primary/50 hover:bg-primary/5 transition-all group cursor-pointer"
                      >
                        <span className="text-3xl block mb-2">{bt.icon}</span>
                        <p className="font-semibold text-sm">{bt.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{bt.description}</p>
                        <p className="text-xs text-primary font-medium mt-2">{bt.clauseCount} cláusulas</p>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowBaseTemplates(true)}
                      className="border-2 border-dashed border-muted rounded-xl p-4 text-center hover:border-primary/30 hover:bg-muted/20 transition-all cursor-pointer"
                    >
                      <FileEdit className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-semibold text-sm">Começar do Zero</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Editor vazio para escrever de raiz</p>
                    </button>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseEditor}>Cancelar</Button>
                </DialogFooter>
              </div>
            ) : (
              /* Step 2: Editor with tabs */
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nome da Minuta *</Label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Contrato de Prestação de Serviços" required />
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Switch id="is_active" checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c })} />
                      <Label htmlFor="is_active" className="text-sm">Activa</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="is_default" checked={formData.is_default} onCheckedChange={c => setFormData({ ...formData, is_default: c })} />
                      <Label htmlFor="is_default" className="text-sm flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Default</Label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] gap-4 flex-1 min-h-0">
                <Tabs value={editorTab} onValueChange={setEditorTab} className="flex-1 flex flex-col min-h-0">
                  <TabsList className="mb-2">
                    <TabsTrigger value="editor" className="gap-1.5">
                      <FileEdit className="h-3.5 w-3.5" /> Editor
                    </TabsTrigger>
                    <TabsTrigger value="template_layout" className="gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" /> Layout da Minuta
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" /> Layout Global
                    </TabsTrigger>
                    <TabsTrigger value="variables" className="gap-1.5">
                      Variáveis
                    </TabsTrigger>
                    <TabsTrigger value="signatures" className="gap-1.5">
                      <PenTool className="h-3.5 w-3.5" /> Assinaturas
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="flex-1 min-h-0 overflow-y-auto space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Editor da Minuta *</Label>
                        <span className="text-xs text-muted-foreground">{clauseCount} cláusulas · ~{wordCount} palavras</span>
                      </div>
                      {(() => {
                        const knownKeys = new Set(editorVariables.map((v: any) => String(v.key).replace(/^\{\{|\}\}$/g, "").trim()));
                        const found = new Set<string>();
                        const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
                        let m: RegExpExecArray | null;
                        while ((m = re.exec(formData.body_html || "")) !== null) {
                          if (!knownKeys.has(m[1])) found.add(m[1]);
                        }
                        if (found.size === 0) return null;
                        return (
                          <div className="border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 rounded-lg p-2 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center gap-2">
                            <span className="font-medium">Variáveis sem propriedade:</span>
                            {[...found].map((k) => (
                              <Badge key={k} variant="outline" className="font-mono text-[10px] border-amber-500/50 text-amber-900 dark:text-amber-200">
                                {"{{"}{k}{"}}"}
                              </Badge>
                            ))}
                            <span className="text-[11px] opacity-80">Estes tokens não vão ser preenchidos automaticamente — funcionam como texto livre.</span>
                          </div>
                        );
                      })()}
                      <RichTextEditor
                        ref={editorRef}
                        value={formData.body_html}
                        onChange={v => setFormData({ ...formData, body_html: v })}
                        placeholder="... continuar a escrever cláusulas ..."
                        variables={editorVariables}
                        minHeight="400px"
                        extraToolbarButtons={
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs border-primary/30 text-primary hover:bg-primary/10"
                              onClick={handleInsertClause}
                            >
                              + Cláusula
                            </Button>
                            <EnhancedToolbarButtons onExecCommand={handleExecCommand} />
                          </>
                        }
                      />
                    </div>
                  </TabsContent>


                  <TabsContent value="template_layout" forceMount className="flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                    <div className="border rounded-lg bg-muted/10">
                      <TemplateDocSettingsPanel
                        orgName={activeCompany?.name}
                        value={formData.doc_settings || {}}
                        onChange={(next) => {
                          const isEmpty = !next || Object.keys(next).length === 0;
                          setFormData({ ...formData, doc_settings: isEmpty ? null : next });
                        }}
                        bodyHtml={formData.body_html}
                        onBodyHtmlChange={(html) => setFormData((fd) => ({ ...fd, body_html: html }))}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="settings" forceMount className="flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                    <div className="border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 rounded-lg p-3 mb-2 text-xs text-amber-900 dark:text-amber-200">
                      ⚠ Estas configurações aplicam-se a <strong>todos os documentos da organização</strong> que não definam um layout próprio. Para configurar apenas esta minuta, use o separador <strong>"Layout da Minuta"</strong>.
                    </div>
                    <div className="border rounded-lg bg-muted/10">
                      <DocumentSettingsPanel orgName={activeCompany?.name} onSettingsChange={setLiveDocSettings} />
                    </div>
                  </TabsContent>

                  <TabsContent value="variables" className="flex-1 min-h-0 overflow-y-auto space-y-4">
                    {/* System variables */}
                    <div className="border rounded-lg p-4 bg-muted/20 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Variáveis do Sistema (clique para inserir)
                      </p>
                      <div className="space-y-1">
                        {VARIABLE_CATEGORIES.map(cat => (
                          <Collapsible key={cat.label} defaultOpen>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm font-medium group">
                              <span>{cat.icon}</span>
                              <span>{cat.label}</span>
                              <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="flex flex-wrap gap-1.5 pl-7 pb-2 pt-1">
                                {cat.variables.map(v => (
                                  <Badge
                                    key={v.key}
                                    variant="outline"
                                    className="cursor-pointer hover:bg-primary/10 text-xs font-mono transition-colors"
                                    title={v.description}
                                    onClick={() => editorRef.current?.insertVariable(v.key)}
                                  >
                                    {v.key}
                                  </Badge>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </div>

                    {/* Custom variables */}
                    <div className="border rounded-lg p-4 bg-muted/20">
                      <CustomVariablesManager
                        onInsertVariable={(key) => editorRef.current?.insertVariable(key)}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="signatures" className="flex-1 min-h-0 overflow-y-auto space-y-4">
                    <SignatoriesPanel
                      companyId={activeCompany?.id}
                      selectable
                      selectedSignatoryId={formData.signatory_user_id}
                      onSelectSignatory={(s) => {
                        if (!s) {
                          // Deselect
                          setFormData({ ...formData, signatory_user_id: null, signatory_role_id: null });
                          
                          return;
                        }
                        // Trigger OTP verification
                        setPendingSignatory(s);
                        setOtpDialogOpen(true);
                      }}
                    />
                    <SignatoryOtpDialog
                      open={otpDialogOpen}
                      onOpenChange={setOtpDialogOpen}
                      signatory={pendingSignatory}
                      templateId={editingTemplate?.id}
                      onVerified={(s) => {
                        setFormData({
                          ...formData,
                          signatory_user_id: s.userId,
                          signatory_role_id: s.roleId,
                        });
                        
                      }}
                    />
                  </TabsContent>
                </Tabs>

                <aside className="hidden lg:flex flex-col min-h-0 border rounded-lg bg-muted/10 overflow-hidden">
                  <header className="flex items-center justify-between px-3 py-2 border-b bg-background/60">
                    <span className="text-xs font-medium text-muted-foreground">Preview</span>
                    <Badge variant="secondary" className="text-[10px]">Dados de exemplo</Badge>
                  </header>
                  <div className="flex-1 overflow-y-auto p-4">
                    <DocumentPreview
                      context="contract"
                      settings={mergedSettings}
                      bodyHtml={deferredBody}
                      sampleData={previewSampleData as any}
                      preprocessHtml={editorPreprocess}
                      headerSlot={<ContractPreviewHeader settings={mergedSettings} />}
                      footerSlot={<ContractPreviewFooter settings={mergedSettings} />}
                    />
                  </div>
                </aside>
                </div>

                <DialogFooter className="mt-4 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={handleCloseEditor}>Cancelar</Button>
                  {formData.body_html && (
                    <TemplateExportButtons templateName={formData.name || "minuta"} bodyHtml={formData.body_html} variant="button" docSettingsOverride={mergedSettings} sampleData={previewSampleData} />
                  )}
                  <Button
                    type="button" variant="outline" disabled={!formData.body_html}
                    onClick={() => {
                      setPreviewHtml(buildPreviewHtml(formData.body_html, previewSampleData, mergedSettings));
                      setPreviewSettings(mergedSettings);
                      setIsPreviewOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1.5" /> Preview
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingTemplate ? "Guardar" : "Criar Minuta"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
            <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" /> Preview — {formData.name || editingTemplate?.name || "Contrato"}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Dados de exemplo</Badge>
                <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(false)}>✕ Fechar</Button>
              </div>
            </div>
            <div className="p-8">
              {(() => {
                const ds: any = {
                  margin_top: 20, margin_bottom: 20, margin_left: 20, margin_right: 20,
                  font_family: "Arial", header_layout: "center", show_nif: true, show_address: true,
                  show_phone: true, show_email: true, show_website: false, show_footer: true,
                  show_page_numbers: true, header_show_separator: true, primary_color: "#7C3AED",
                  ...(previewSettings || {}),
                };
                return (
                  <DocumentPreview
                    context="contract"
                    settings={ds}
                    bodyHtml={previewHtml}
                    sampleData={previewSampleData as any}
                    headerSlot={<ContractPreviewHeader settings={ds} sampleData={previewSampleData} />}
                    footerSlot={<ContractPreviewFooter settings={ds} />}
                  />
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar Minuta</AlertDialogTitle>
              <AlertDialogDescription>Tem a certeza que deseja eliminar esta minuta? Esta acção é irreversível.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Variable Detection Assistant */}
        <VariableDetectionAssistant
          open={isVariableAssistantOpen}
          onOpenChange={setIsVariableAssistantOpen}
          html={formData.body_html}
          onApply={(newHtml) => setFormData({ ...formData, body_html: newHtml })}
        />
      </div>
    </>
  );
};

function ContractPreviewHeader({ settings, sampleData }: { settings: any; sampleData?: any }) {
  const html = renderContractHeaderHtml(settings || {}, (sampleData || SAMPLE_VARIABLE_DATA) as any);
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}

function ContractPreviewFooter({ settings }: { settings: any }) {
  const ds = settings || {};
  if (ds.show_footer === false) return null;
  return (
    <div className="mt-12 pt-4 border-t text-center text-xs text-muted-foreground">
      {ds.footer_text && <p>{ds.footer_text}</p>}
      {ds.show_page_numbers !== false && <p className="mt-1">Página 1 de 1</p>}
    </div>
  );
}

function countClauses(html: string): number {
  if (!html) return 0;
  const matches = html.match(/<strong>([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+) —/g);
  return matches ? matches.length : 0;
}

export default ContractTemplates;
