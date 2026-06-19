import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailTemplateEditorDialog, { type EmailTemplateData } from "@/components/email-templates/EmailTemplateEditorDialog";
import {
  Plus, Mail, Target, Users, Building, FileText, FileCheck, BookOpen, Handshake,
  Copy, Pencil, Trash2, Search, Zap, Clock, Hand
} from "lucide-react";

const MODULES = [
  { value: "leads", label: "Leads", icon: Target, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "contacts", label: "Contactos", icon: Users, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "clients", label: "Clientes", icon: Building, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "proposals", label: "Propostas", icon: FileText, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { value: "quotes", label: "Orçamentos", icon: FileCheck, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  { value: "contracts", label: "Contratos", icon: BookOpen, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "deals", label: "Pedidos de Proposta", icon: Handshake, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
];

const TRIGGER_TYPES = [
  { value: "manual", label: "Manual", icon: Hand },
  { value: "automatic", label: "Automático", icon: Zap },
  { value: "semi_automatic", label: "Semi-auto", icon: Clock },
];

interface EmailTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  module: string;
  trigger_phase: string | null;
  trigger_type: string;
  trigger_delay_hours: number;
  subject: string;
  body_html: string;
  variables: string[];
  is_active: boolean;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function EmailTemplates() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();
  const { toast } = useToast();

  const canCreate = hasPermission("email_templates.create");
  const canEdit = hasPermission("email_templates.edit");
  const canDelete = hasPermission("email_templates.delete");
  const canDuplicate = hasPermission("email_templates.duplicate");

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateData | null>(null);

  const orgId = activeCompany?.id;

  const fetchTemplates = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("module")
      .order("name");
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setTemplates((data || []) as unknown as EmailTemplate[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [orgId]);

  const filtered = useMemo(() => {
    return templates.filter(tp => {
      if (moduleFilter !== "all" && tp.module !== moduleFilter) return false;
      if (activeFilter === "active" && !tp.is_active) return false;
      if (activeFilter === "inactive" && tp.is_active) return false;
      if (search && !tp.name.toLowerCase().includes(search.toLowerCase()) && !tp.subject.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, moduleFilter, activeFilter, search]);

  const handleDuplicate = async (tpl: EmailTemplate) => {
    if (!orgId) return;
    const { id, created_at, updated_at, ...rest } = tpl;
    const { error } = await supabase.from("email_templates").insert({
      ...rest,
      name: `${rest.name} (cópia)`,
      is_system: false,
      organization_id: orgId,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Duplicado", description: "Template duplicado com sucesso" });
      fetchTemplates();
    }
  };

  const handleDelete = async (tpl: EmailTemplate) => {
    if (tpl.is_system) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", tpl.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eliminado", description: "Template eliminado" });
      fetchTemplates();
    }
  };

  const handleToggleActive = async (tpl: EmailTemplate) => {
    const { error } = await supabase.from("email_templates").update({ is_active: !tpl.is_active }).eq("id", tpl.id);
    if (!error) {
      setTemplates(prev => prev.map(tp => tp.id === tpl.id ? { ...tp, is_active: !tp.is_active } : tp));
    }
  };

  const getModuleConfig = (mod: string) => MODULES.find(m => m.value === mod) || MODULES[0];
  const getTriggerConfig = (type: string) => TRIGGER_TYPES.find(tr => tr.value === type) || TRIGGER_TYPES[0];

  const openNew = () => {
    const defaultModule = moduleFilter !== "all" ? moduleFilter : "leads";
    setEditingTemplate({
      name: "", description: "", module: defaultModule, trigger_phase: "",
      trigger_type: "manual", trigger_delay_hours: 0, subject: "",
      body_html: "", variables: [], is_active: true, is_system: false,
    });
    setDialogOpen(true);
  };

  const openEdit = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl as unknown as EmailTemplateData);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              Templates de Email
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie templates reutilizáveis para cada fase do processo comercial
            </p>
          </div>
          {canCreate && (
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Template
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={moduleFilter} onValueChange={setModuleFilter}>
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              {MODULES.map(m => (
                <TabsTrigger key={m.value} value={m.value} className="gap-1.5">
                  <m.icon className="h-3.5 w-3.5" /> {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={activeFilter} onValueChange={(v: any) => setActiveFilter(v)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
          </div>
        </div>

        {/* Template Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum template encontrado</p>
            <p className="text-sm mt-1">Crie um novo template ou ajuste os filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(tpl => {
              const mod = getModuleConfig(tpl.module);
              const trigger = getTriggerConfig(tpl.trigger_type);
              const ModIcon = mod.icon;
              const TriggerIcon = trigger.icon;
              return (
                <Card key={tpl.id} className={`transition-all hover:shadow-md ${!tpl.is_active ? "opacity-60" : ""}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${mod.color}`}>
                          <ModIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-foreground leading-tight">{tpl.name}</h3>
                          {tpl.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tpl.description}</p>
                          )}
                        </div>
                      </div>
                      <Switch checked={tpl.is_active} disabled={!canEdit} onCheckedChange={() => canEdit && handleToggleActive(tpl)} />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className={mod.color}>{mod.label}</Badge>
                      {tpl.trigger_phase && (
                        <Badge variant="outline" className="text-xs">{tpl.trigger_phase}</Badge>
                      )}
                      <Badge variant="outline" className="text-xs gap-1">
                        <TriggerIcon className="h-3 w-3" /> {trigger.label}
                      </Badge>
                      {tpl.is_system && (
                        <Badge className="bg-primary/10 text-primary text-xs">Sistema</Badge>
                      )}
                      {tpl.trigger_delay_hours > 0 && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Clock className="h-3 w-3" /> {tpl.trigger_delay_hours}h
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground truncate" title={tpl.subject}>
                      <span className="font-medium">Assunto:</span> {tpl.subject}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(tpl)}>
                          <Pencil className="h-3 w-3" /> Editar
                        </Button>
                      )}
                      {canDuplicate && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDuplicate(tpl)}>
                          <Copy className="h-3 w-3" /> Duplicar
                        </Button>
                      )}
                      {canDelete && !tpl.is_system && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive" onClick={() => handleDelete(tpl)}>
                          <Trash2 className="h-3 w-3" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Editor Dialog */}
        <EmailTemplateEditorDialog
          open={dialogOpen}
          onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingTemplate(null); } else setDialogOpen(true); }}
          template={editingTemplate}
          onSaved={fetchTemplates}
        />
      </div>
    </>
  );
}
