import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link, Variable, X, Save, Send, Eye,
  Zap, Clock, Hand, ChevronDown, Globe, Target, Users, Building,
  FileText, FileCheck, BookOpen, Handshake, PenLine, Plus, Trash2, Sparkles
} from "lucide-react";

// --- Module config ---
const MODULES = [
  { value: "leads", label: "Leads", icon: Target },
  { value: "contacts", label: "Contactos", icon: Users },
  { value: "clients", label: "Clientes", icon: Building },
  { value: "proposals", label: "Propostas", icon: FileText },
  { value: "quotes", label: "Orçamentos", icon: FileCheck },
  { value: "contracts", label: "Contratos", icon: BookOpen },
  { value: "deals", label: "Negócios", icon: Handshake },
];

// --- Variables by category per module ---
interface VarDef { key: string; label: string; example: string }
interface VarCategory { category: string; icon: typeof Globe; vars: VarDef[] }

const GLOBAL_VARS: VarDef[] = [
  { key: "company_name", label: "Nome da empresa", example: "Olyvia Solutions" },
  { key: "company_email", label: "Email da empresa", example: "info@olyvia.pt" },
  { key: "company_phone", label: "Telefone da empresa", example: "+351 210 000 000" },
  { key: "commercial_name", label: "Nome do comercial", example: "Ana Silva" },
  { key: "commercial_email", label: "Email do comercial", example: "ana.silva@olyvia.pt" },
  { key: "commercial_phone", label: "Telefone do comercial", example: "+351 912 345 678" },
  { key: "data_atual", label: "Data actual", example: new Date().toLocaleDateString("pt-PT") },
];

const LEAD_VARS: VarDef[] = [
  { key: "lead_name", label: "Nome da lead", example: "Rui Bernardo" },
  { key: "lead_email", label: "Email da lead", example: "rui@example.com" },
  { key: "lead_phone", label: "Telefone", example: "+351 913 456 789" },
  { key: "lead_source", label: "Origem", example: "Website" },
  { key: "lead_stage", label: "Fase actual", example: "Novo" },
  { key: "lead_value", label: "Valor estimado", example: "€2.500" },
];

const CLIENT_VARS: VarDef[] = [
  { key: "client_name", label: "Nome", example: "Rui Bernardo" },
  { key: "client_email", label: "Email", example: "rui@example.com" },
  { key: "client_phone", label: "Telefone", example: "+351 913 456 789" },
  { key: "client_company", label: "Empresa do cliente", example: "TechCorp Lda" },
  { key: "client_nif", label: "NIF", example: "509 123 456" },
];

const PROPOSAL_VARS: VarDef[] = [
  { key: "proposal_title", label: "Título da proposta", example: "Proposta Comercial #42" },
  { key: "proposal_value", label: "Valor da proposta", example: "€3.590" },
  { key: "proposal_link", label: "Link público", example: "https://app.olyvia.pt/p/abc123" },
  { key: "valid_until", label: "Validade", example: "15/04/2026" },
  { key: "proposal_date", label: "Data da proposta", example: "10/03/2026" },
  { key: "proposal_number", label: "Número da proposta", example: "P-2026-0042" },
];

const QUOTE_VARS: VarDef[] = [
  { key: "quote_title", label: "Título do orçamento", example: "Orçamento #78" },
  { key: "quote_value", label: "Valor do orçamento", example: "€1.250" },
  { key: "quote_number", label: "Número do orçamento", example: "Q-2026-0078" },
  { key: "quote_items", label: "Tabela de itens (HTML)", example: "<table><tr><td>Item 1</td><td>€500</td></tr></table>" },
];

const CONTRACT_VARS: VarDef[] = [
  { key: "contract_number", label: "Número do contrato", example: "CC-2026-0015" },
  { key: "contract_value", label: "Valor do contrato", example: "€12.000/ano" },
  { key: "contract_start", label: "Início", example: "01/04/2026" },
  { key: "contract_end", label: "Fim", example: "31/03/2027" },
  { key: "contract_link", label: "Link do contrato", example: "https://app.olyvia.pt/c/xyz789" },
];

const DEAL_VARS: VarDef[] = [
  { key: "deal_title", label: "Título do negócio", example: "Negócio TechCorp" },
  { key: "deal_value", label: "Valor do negócio", example: "€8.500" },
];

function getVarCategories(module: string): VarCategory[] {
  const cats: VarCategory[] = [
    { category: "Globais", icon: Globe, vars: GLOBAL_VARS },
  ];
  switch (module) {
    case "leads":
      cats.push({ category: "Lead", icon: Target, vars: LEAD_VARS });
      break;
    case "contacts":
      cats.push({ category: "Contacto / Cliente", icon: Users, vars: CLIENT_VARS });
      break;
    case "clients":
      cats.push({ category: "Cliente", icon: Building, vars: CLIENT_VARS });
      break;
    case "proposals":
      cats.push({ category: "Cliente", icon: Building, vars: CLIENT_VARS });
      cats.push({ category: "Proposta", icon: FileText, vars: PROPOSAL_VARS });
      break;
    case "quotes":
      cats.push({ category: "Cliente", icon: Building, vars: CLIENT_VARS });
      cats.push({ category: "Orçamento", icon: FileCheck, vars: QUOTE_VARS });
      break;
    case "contracts":
      cats.push({ category: "Cliente", icon: Building, vars: CLIENT_VARS });
      cats.push({ category: "Contrato", icon: BookOpen, vars: CONTRACT_VARS });
      break;
    case "deals":
      cats.push({ category: "Cliente", icon: Building, vars: CLIENT_VARS });
      cats.push({ category: "Negócio", icon: Handshake, vars: DEAL_VARS });
      break;
  }
  return cats;
}

// Build example data map from all vars
function buildExampleMap(module: string): Record<string, string> {
  const map: Record<string, string> = {};
  getVarCategories(module).forEach(cat => {
    cat.vars.forEach(v => { map[v.key] = v.example; });
  });
  return map;
}

function replaceVars(text: string, examples: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => examples[key] || `{{${key}}}`);
}

// Workflow stage table mapping
const STAGE_TABLES: Record<string, string> = {
  leads: "lead_workflow_stages",
  proposals: "proposal_workflow_stages",
  quotes: "quote_workflow_stages",
};

export interface CustomVarDef { key: string; label: string; example: string }

export interface EmailTemplateData {
  id?: string;
  organization_id?: string;
  name: string;
  description: string;
  module: string;
  trigger_phase: string;
  trigger_type: string;
  trigger_delay_hours: number;
  subject: string;
  body_html: string;
  variables: string[];
  custom_variables?: CustomVarDef[];
  is_active: boolean;
  is_system: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplateData | null;
  onSaved: () => void;
}

export default function EmailTemplateEditorDialog({ open, onOpenChange, template, onSaved }: Props) {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<EmailTemplateData>({
    name: "", description: "", module: "leads", trigger_phase: "",
    trigger_type: "manual", trigger_delay_hours: 0, subject: "",
    body_html: "", variables: [], custom_variables: [], is_active: true, is_system: false,
  });
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState<{ key: string; label: string }[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">("hours");
  const [delayValue, setDelayValue] = useState(0);

  // Logged-in user signature
  const [userSignature, setUserSignature] = useState<string>("");
  const [userBusinessId, setUserBusinessId] = useState<string | null>(null);
  const [signatureEditorOpen, setSignatureEditorOpen] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<string>("");
  const [savingSignature, setSavingSignature] = useState(false);

  // Custom variable creation popover
  const [newVarOpen, setNewVarOpen] = useState(false);
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarExample, setNewVarExample] = useState("");

  // Sync form when template changes
  useEffect(() => {
    if (template) {
      setForm({ ...template, custom_variables: template.custom_variables || [] });
      const hours = template.trigger_delay_hours || 0;
      if (hours >= 24 && hours % 24 === 0) {
        setDelayUnit("days");
        setDelayValue(hours / 24);
      } else {
        setDelayUnit("hours");
        setDelayValue(hours);
      }
    }
  }, [template]);

  // Set editor content when dialog opens (DialogContent mounts only when open=true,
  // so editorRef.current is null on the initial template-change effect run).
  useEffect(() => {
    if (!open) return;
    // Defer to next tick so the contentEditable div is mounted
    const id = requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = sanitizeRichHtml(template?.body_html || "");
      }
    });
    return () => cancelAnimationFrame(id);
  }, [open, template]);

  // Fetch workflow stages for the selected module
  useEffect(() => {
    const table = STAGE_TABLES[form.module];
    if (!table) {
      // For modules without workflow stages, provide static options
      const staticStages: Record<string, { key: string; label: string }[]> = {
        contacts: [{ key: "novo", label: "Novo" }, { key: "activo", label: "Activo" }],
        clients: [{ key: "novo", label: "Novo" }, { key: "activo", label: "Activo" }],
        contracts: [
          { key: "rascunho", label: "Rascunho" }, { key: "enviado", label: "Enviado" },
          { key: "assinado", label: "Assinado" }, { key: "expirado", label: "Expirado" },
        ],
        deals: [
          { key: "aberto", label: "Aberto" }, { key: "negociacao", label: "Negociação" },
          { key: "ganho", label: "Ganho" }, { key: "perdido", label: "Perdido" },
        ],
      };
      setStages(staticStages[form.module] || []);
      return;
    }
    const orgId = activeCompany?.id;
    (async () => {
      const { data } = await (supabase
        .from(table as any)
        .select("key, name")
        .or(`organization_id.eq.${orgId},organization_id.is.null`)
        .order("sort_order") as any);
      if (data) {
        setStages(data.map((s: any) => ({ key: s.key, label: s.name })));
      }
    })();
  }, [form.module, activeCompany?.id]);

  // Load logged-in user's signature when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase
        .from("anew_users")
        .select("id, email_signature")
        .eq("auth_user_id", user.id)
        .maybeSingle() as any);
      if (data) {
        setUserBusinessId(data.id);
        setUserSignature(data.email_signature || "");
        setSignatureDraft(data.email_signature || "");
      }
    })();
  }, [open]);

  const varCategories = useMemo(() => {
    const cats = getVarCategories(form.module);
    const customs = form.custom_variables || [];
    if (customs.length > 0) {
      cats.push({ category: "Personalizadas", icon: Sparkles, vars: customs });
    }
    return cats;
  }, [form.module, form.custom_variables]);
  const exampleMap = useMemo(() => {
    const map = buildExampleMap(form.module);
    (form.custom_variables || []).forEach(v => { map[v.key] = v.example; });
    return map;
  }, [form.module, form.custom_variables]);

  const updateField = <K extends keyof EmailTemplateData>(key: K, value: EmailTemplateData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // Delay sync
  useEffect(() => {
    const hours = delayUnit === "days" ? delayValue * 24 : delayValue;
    updateField("trigger_delay_hours", hours);
  }, [delayValue, delayUnit]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    if (editorRef.current) {
      updateField("body_html", sanitizeRichHtml(editorRef.current.innerHTML));
    }
  }, []);

  const handleEditorInput = () => {
    if (editorRef.current) {
      updateField("body_html", sanitizeRichHtml(editorRef.current.innerHTML));
    }
  };

  const handleEditorPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const insertVarIntoEditor = (varKey: string) => {
    const tag = `{{${varKey}}}`;
    const sel = window.getSelection();
    if (sel && editorRef.current && editorRef.current.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.className = "bg-primary/20 text-primary px-1 rounded text-xs font-mono";
      span.contentEditable = "false";
      span.textContent = tag;
      range.deleteContents();
      range.insertNode(span);
      range.setStartAfter(span);
      range.setEndAfter(span);
      sel.removeAllRanges();
      sel.addRange(range);
      editorRef.current.focus();
      updateField("body_html", sanitizeRichHtml(editorRef.current.innerHTML));
    } else {
      // Fallback — append
      if (editorRef.current) {
        const span = document.createElement("span");
        span.className = "bg-primary/20 text-primary px-1 rounded text-xs font-mono";
        span.contentEditable = "false";
        span.textContent = tag;
        editorRef.current.appendChild(span);
        updateField("body_html", sanitizeRichHtml(editorRef.current.innerHTML));
      }
    }
    // track variable
    setForm(prev => ({
      ...prev,
      variables: [...new Set([...(prev.variables || []), varKey])],
    }));
  };

  const insertVarIntoSubject = (varKey: string) => {
    const tag = `{{${varKey}}}`;
    const el = subjectRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const newVal = el.value.substring(0, start) + tag + el.value.substring(end);
      updateField("subject", newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      updateField("subject", (form.subject || "") + tag);
    }
  };

  // Insert the logged-in user's signature at the end of the body
  const insertSignature = () => {
    if (!editorRef.current) return;
    if (!userSignature || !userSignature.trim()) {
      setSignatureEditorOpen(true);
      return;
    }
    const safeSig = sanitizeRichHtml(userSignature);
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-signature", "true");
    wrapper.innerHTML = `<br/><br/>--<br/>${safeSig}`;
    editorRef.current.querySelectorAll('[data-signature="true"]').forEach(n => n.remove());
    editorRef.current.appendChild(wrapper);
    updateField("body_html", sanitizeRichHtml(editorRef.current.innerHTML));
    toast({ title: "Assinatura inserida", description: "A sua assinatura foi adicionada ao final do email." });
  };

  const handleSaveSignature = async () => {
    if (!userBusinessId) {
      toast({ title: "Erro", description: "Não foi possível identificar o utilizador", variant: "destructive" });
      return;
    }
    setSavingSignature(true);
    const cleaned = sanitizeRichHtml(signatureDraft || "");
    const { error } = await (supabase
      .from("anew_users")
      .update({ email_signature: cleaned })
      .eq("id", userBusinessId) as any);
    setSavingSignature(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setUserSignature(cleaned);
    setSignatureEditorOpen(false);
    toast({ title: "Assinatura guardada", description: "A sua assinatura foi atualizada." });
  };

  const addCustomVariable = () => {
    const key = newVarKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = newVarLabel.trim();
    if (!key || !label) {
      toast({ title: "Dados em falta", description: "Indique chave e descrição", variant: "destructive" });
      return;
    }
    const builtIn = getVarCategories(form.module).flatMap(c => c.vars.map(v => v.key));
    const existingCustom = (form.custom_variables || []).map(v => v.key);
    if (builtIn.includes(key) || existingCustom.includes(key)) {
      toast({ title: "Chave já existe", description: `"${key}" já está em uso`, variant: "destructive" });
      return;
    }
    setForm(prev => ({
      ...prev,
      custom_variables: [...(prev.custom_variables || []), { key, label, example: newVarExample.trim() || `{{${key}}}` }],
    }));
    setNewVarKey(""); setNewVarLabel(""); setNewVarExample("");
    setNewVarOpen(false);
  };

  const removeCustomVariable = (key: string) => {
    setForm(prev => ({
      ...prev,
      custom_variables: (prev.custom_variables || []).filter(v => v.key !== key),
    }));
  };

  const handleSave = async (activate?: boolean) => {
    if (!activeCompany?.id) return;
    setSaving(true);
    const payload: any = {
      organization_id: activeCompany.id,
      name: form.name,
      description: form.description || null,
      module: form.module,
      trigger_phase: form.trigger_phase || null,
      trigger_type: form.trigger_type,
      trigger_delay_hours: form.trigger_delay_hours,
      subject: form.subject,
      body_html: sanitizeRichHtml(form.body_html),
      variables: form.variables,
      custom_variables: form.custom_variables || [],
      is_active: activate !== undefined ? activate : form.is_active,
      is_system: form.is_system,
    };

    let error;
    if (form.id) {
      const { error: e } = await supabase.from("email_templates").update(payload).eq("id", form.id);
      error = e;
    } else {
      const { error: e } = await supabase.from("email_templates").insert(payload);
      error = e;
    }
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: form.id ? "Template atualizado" : "Template criado" });
      onSaved();
      onOpenChange(false);
    }
  };

  const handleSendTest = async () => {
    toast({ title: "Teste", description: "Email de teste enviado para o seu email (funcionalidade requer SMTP configurado)" });
  };

  const previewSubject = replaceVars(form.subject, exampleMap);
  const previewBody = replaceVars(form.body_html, exampleMap);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] max-h-[92vh] p-0 gap-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <h2 className="text-base font-semibold text-foreground">
            {form.id ? "Editar Template" : "Novo Template de Email"}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving || !form.name || !form.subject}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar rascunho
            </Button>
            <Button size="sm" onClick={() => handleSave(true)} disabled={saving || !form.name || !form.subject}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar e activar
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSendTest}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar teste
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(92vh - 56px)" }}>
          {/* LEFT — Editor */}
          <div className="flex-1 overflow-y-auto border-r">
            <ScrollArea className="h-full">
              <div className="p-5 space-y-5">
                {/* Name + Module */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome do Template</Label>
                    <Input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Ex: Primeiro Contacto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Módulo</Label>
                    <Select value={form.module} onValueChange={v => updateField("module", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODULES.map(m => (
                          <SelectItem key={m.value} value={m.value}>
                            <span className="flex items-center gap-2"><m.icon className="h-3.5 w-3.5" /> {m.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</Label>
                  <Input value={form.description} onChange={e => updateField("description", e.target.value)} placeholder="Breve descrição do template (opcional)" />
                </div>

                {/* Phase + Trigger type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fase / Estado que dispara</Label>
                    <Select value={form.trigger_phase || "_none"} onValueChange={v => updateField("trigger_phase", v === "_none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar fase..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma (manual)</SelectItem>
                        {stages.map(s => (
                          <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de disparo</Label>
                    <RadioGroup
                      value={form.trigger_type}
                      onValueChange={v => updateField("trigger_type", v)}
                      className="flex gap-1"
                    >
                      {[
                        { value: "manual", label: "Manual", icon: Hand, desc: "O comercial escolhe quando enviar" },
                        { value: "semi_automatic", label: "Semi-auto", icon: Clock, desc: "Sugere envio quando a fase muda" },
                        { value: "automatic", label: "Automático", icon: Zap, desc: "Envia sozinho quando a fase muda" },
                      ].map(opt => (
                        <label
                          key={opt.value}
                          className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${
                            form.trigger_type === opt.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <RadioGroupItem value={opt.value} className="sr-only" />
                          <opt.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-foreground">{opt.label}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                </div>

                {/* Delay (only for semi_automatic / automatic) */}
                {(form.trigger_type === "semi_automatic" || form.trigger_type === "automatic") && (
                  <div className="flex items-end gap-3 p-3 rounded-lg bg-muted/40 border border-dashed">
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Delay após mudança de fase
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          value={delayValue}
                          onChange={e => setDelayValue(parseInt(e.target.value) || 0)}
                          className="w-24"
                        />
                        <Select value={delayUnit} onValueChange={(v: "hours" | "days") => setDelayUnit(v)}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pb-2">
                      {delayValue === 0
                        ? "Imediatamente"
                        : `${delayValue} ${delayUnit === "days" ? "dia(s)" : "hora(s)"} após mudar para "${stages.find(s => s.key === form.trigger_phase)?.label || form.trigger_phase || "a fase"}"`
                      }
                    </p>
                  </div>
                )}

                <Separator />

                {/* Subject */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assunto do Email</Label>
                    <SubjectVarInserter categories={varCategories} onInsert={insertVarIntoSubject} />
                  </div>
                  <Input
                    ref={subjectRef}
                    value={form.subject}
                    onChange={e => updateField("subject", e.target.value)}
                    placeholder="Ex: {{company_name}} — Recebemos o seu pedido"
                  />
                  {form.subject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Eye className="h-3 w-3 inline mr-1" />
                      Preview: <span className="text-foreground font-medium">{previewSubject}</span>
                    </p>
                  )}
                </div>

                {/* Body editor */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Corpo do Email</Label>
                  <div className="border rounded-lg overflow-hidden bg-background">
                    {/* Toolbar */}
                    <div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
                      {[
                        { cmd: "bold", icon: Bold, title: "Negrito" },
                        { cmd: "italic", icon: Italic, title: "Itálico" },
                        { cmd: "underline", icon: Underline, title: "Sublinhado" },
                      ].map(b => (
                        <Button key={b.cmd} type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => execCommand(b.cmd)} title={b.title}>
                          <b.icon className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                      <Separator orientation="vertical" className="h-5 mx-1" />
                      {[
                        { cmd: "justifyLeft", icon: AlignLeft },
                        { cmd: "justifyCenter", icon: AlignCenter },
                        { cmd: "justifyRight", icon: AlignRight },
                      ].map(b => (
                        <Button key={b.cmd} type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => execCommand(b.cmd)}>
                          <b.icon className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                      <Separator orientation="vertical" className="h-5 mx-1" />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => execCommand("insertUnorderedList")}>
                        <List className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => execCommand("insertOrderedList")}>
                        <ListOrdered className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => {
                          const url = prompt("URL do link:");
                          if (url) execCommand("createLink", url);
                        }}>
                        <Link className="h-3.5 w-3.5" />
                      </Button>
                      <Separator orientation="vertical" className="h-5 mx-1" />
                      <BodyVarInserter categories={varCategories} onInsert={insertVarIntoEditor} />
                      <Separator orientation="vertical" className="h-5 mx-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={insertSignature}
                        title="Insere a sua assinatura no final do email"
                      >
                        <PenLine className="h-3.5 w-3.5" /> Inserir minha assinatura
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-muted-foreground"
                        onClick={() => { setSignatureDraft(userSignature || ""); setSignatureEditorOpen(true); }}
                        title="Editar a minha assinatura pessoal"
                      >
                        Editar
                      </Button>
                    </div>
                    {/* Editable area */}
                    <div
                      ref={editorRef}
                      contentEditable
                      onInput={handleEditorInput}
                      onPaste={handleEditorPaste}
                      className="p-4 outline-none prose prose-sm max-w-none min-h-[250px]"
                      data-placeholder="Escreva o corpo do email aqui..."
                    />
                    <style>{`
                      [contenteditable]:empty:before {
                        content: attr(data-placeholder);
                        color: hsl(var(--muted-foreground));
                        pointer-events: none;
                      }
                    `}</style>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT — Variables + Preview */}
          <div className="w-[420px] shrink-0 flex flex-col overflow-hidden bg-muted/10">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Variables panel */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Variable className="h-3.5 w-3.5" /> Variáveis Disponíveis
                    </h3>
                    <Popover open={newVarOpen} onOpenChange={setNewVarOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1">
                          <Plus className="h-3 w-3" /> Nova
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3 space-y-2" align="end">
                        <p className="text-xs font-semibold">Nova variável personalizada</p>
                        <div className="space-y-1.5">
                          <Label className="text-[10px]">Chave (sem espaços)</Label>
                          <Input
                            value={newVarKey}
                            onChange={e => setNewVarKey(e.target.value)}
                            placeholder="ex: numero_encomenda"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px]">Descrição</Label>
                          <Input
                            value={newVarLabel}
                            onChange={e => setNewVarLabel(e.target.value)}
                            placeholder="ex: Número da encomenda"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px]">Valor de exemplo (opcional)</Label>
                          <Input
                            value={newVarExample}
                            onChange={e => setNewVarExample(e.target.value)}
                            placeholder="ex: ENC-2026-001"
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button type="button" size="sm" className="w-full h-7 text-xs" onClick={addCustomVariable}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-3">
                    {varCategories.map(cat => {
                      const isCustom = cat.category === "Personalizadas";
                      return (
                        <div key={cat.category}>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <cat.icon className="h-3 w-3" /> {cat.category}
                          </p>
                          <div className="grid grid-cols-1 gap-1">
                            {cat.vars.map(v => (
                              <div key={v.key} className="flex items-center gap-1 group">
                                <button
                                  type="button"
                                  onClick={() => insertVarIntoEditor(v.key)}
                                  className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors text-xs"
                                >
                                  <Badge variant="secondary" className="font-mono text-[10px] shrink-0 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                    {`{{${v.key}}}`}
                                  </Badge>
                                  <span className="text-muted-foreground truncate">{v.label}</span>
                                </button>
                                {isCustom && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
                                    onClick={() => removeCustomVariable(v.key)}
                                    title="Remover variável"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Preview */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Preview em Tempo Real
                    </h3>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowPreview(p => !p)}>
                      {showPreview ? "Esconder" : "Mostrar"}
                    </Button>
                  </div>
                  {showPreview && (
                    <div className="rounded-lg border bg-background overflow-hidden">
                      {/* Email header preview */}
                      <div className="px-3 py-2 border-b bg-muted/30 space-y-1">
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-muted-foreground font-medium">De:</span>
                          <span className="text-foreground">{exampleMap.commercial_name} &lt;{exampleMap.commercial_email}&gt;</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-muted-foreground font-medium">Para:</span>
                          <span className="text-foreground">{exampleMap.client_name || exampleMap.lead_name || "destinatário"} &lt;{exampleMap.client_email || exampleMap.lead_email || "email@example.com"}&gt;</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-muted-foreground font-medium">Assunto:</span>
                          <span className="text-foreground font-semibold">{previewSubject || "(sem assunto)"}</span>
                        </div>
                      </div>
                      {/* Email body preview */}
                      <div
                        className="p-4 prose prose-sm max-w-none text-xs min-h-[120px]"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewBody || '<p class="text-muted-foreground italic">O conteúdo do email aparecerá aqui...</p>') }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>

      {/* Signature editor dialog */}
      <Dialog open={signatureEditorOpen} onOpenChange={setSignatureEditorOpen}>
        <DialogContent className="max-w-lg">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" /> A minha assinatura
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Esta assinatura será inserida no final dos seus emails. Pode usar HTML simples (links, &lt;br/&gt;, &lt;b&gt;, etc.).
              </p>
            </div>
            <Textarea
              value={signatureDraft}
              onChange={e => setSignatureDraft(e.target.value)}
              rows={8}
              placeholder={`Ex:\nRicardo Paiágua\nDirector Comercial\nOlyvia Solutions\n+351 912 345 678`}
              className="font-mono text-xs"
            />
            <div>
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase">Pré-visualização</Label>
              <div
                className="mt-1 p-3 rounded-md border bg-muted/30 text-xs prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signatureDraft || '<span class="text-muted-foreground italic">A sua assinatura aparecerá aqui</span>') }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSignatureEditorOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveSignature} disabled={savingSignature}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar assinatura
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// --- Small helper components for variable insertion popovers ---

function SubjectVarInserter({ categories, onInsert }: { categories: VarCategory[]; onInsert: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] gap-1">
          <Variable className="h-3 w-3" /> Variável
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <ScrollArea className="h-[220px]">
          {categories.map(cat => (
            <div key={cat.category} className="mb-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 mb-1">{cat.category}</p>
              {cat.vars.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => { onInsert(v.key); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-accent text-left text-xs"
                >
                  <Badge variant="secondary" className="font-mono text-[9px]">{`{{${v.key}}}`}</Badge>
                  <span className="text-muted-foreground">{v.label}</span>
                </button>
              ))}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function BodyVarInserter({ categories, onInsert }: { categories: VarCategory[]; onInsert: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Variable className="h-3.5 w-3.5" /> Inserir variável
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <ScrollArea className="h-[280px]">
          {categories.map(cat => (
            <div key={cat.category} className="mb-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 mb-1 flex items-center gap-1">
                <cat.icon className="h-3 w-3" /> {cat.category}
              </p>
              {cat.vars.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => { onInsert(v.key); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-xs transition-colors"
                >
                  <Badge variant="secondary" className="font-mono text-[9px] shrink-0">{`{{${v.key}}}`}</Badge>
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">{v.label}</span>
                    <span className="text-muted-foreground ml-1.5">→ {v.example}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
