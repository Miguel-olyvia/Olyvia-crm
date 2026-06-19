import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export interface PipelineModule {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  enabled: boolean;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  icon: string;
  modules: PipelineModule[];
  is_default: boolean;
}

export interface OrgPipelineConfig {
  id: string;
  organization_id: string;
  template_id: string | null;
  modules: PipelineModule[];
}

const DEFAULT_MODULES: PipelineModule[] = [
  { id: "pedido", label: "Pedido", sublabel: "Qualificado", icon: "Briefcase", color: "hsl(var(--primary))", enabled: true },
  { id: "proposta", label: "Proposta", sublabel: "Aceite", icon: "FileText", color: "hsl(142 71% 45%)", enabled: true },
  { id: "orcamento", label: "Orçamento", sublabel: "Aceite", icon: "Receipt", color: "hsl(217 91% 60%)", enabled: true },
  { id: "contrato", label: "Contrato", sublabel: "Assinado", icon: "FileSignature", color: "hsl(280 67% 55%)", enabled: true },
  { id: "cliente", label: "Cliente", sublabel: "Convertido", icon: "Users", color: "hsl(142 71% 45%)", enabled: true },
];

export function usePipelineConfig(companyId: string | null) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [config, setConfig] = useState<OrgPipelineConfig | null>(null);
  const [modules, setModules] = useState<PipelineModule[]>(DEFAULT_MODULES);
  const [loading, setLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    const { data } = await (supabase.from("pipeline_templates") as any)
      .select("id, name, description, industry, icon, modules, is_default")
      .order("is_default", { ascending: false });
    if (data) setTemplates(data.map((t: any) => ({ ...t, modules: t.modules || [] })));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase.from("organization_pipeline_config") as any)
      .select("id, organization_id, template_id, modules")
      .eq("organization_id", companyId)
      .maybeSingle();

    if (data) {
      setConfig(data);
      setModules(data.modules || DEFAULT_MODULES);
    } else {
      setConfig(null);
      setModules(DEFAULT_MODULES);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadTemplates();
    loadConfig();
  }, [loadTemplates, loadConfig]);

  const applyTemplate = useCallback(async (template: PipelineTemplate) => {
    if (!companyId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    
    const payload = {
      organization_id: companyId,
      template_id: template.id,
      modules: template.modules,
      created_by: businessUserId,
      updated_at: new Date().toISOString(),
    };

    if (config) {
      await (supabase.from("organization_pipeline_config") as any)
        .update({ template_id: template.id, modules: template.modules, updated_at: new Date().toISOString() })
        .eq("organization_id", companyId);
    } else {
      await (supabase.from("organization_pipeline_config") as any).insert([payload]);
    }

    toast({ title: `Template "${template.name}" aplicado` });
    await loadConfig();
  }, [companyId, config, toast, loadConfig]);

  const saveModules = useCallback(async (newModules: PipelineModule[]) => {
    if (!companyId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    const businessUserId = await resolveCurrentBusinessUserId();
    if (!businessUserId) throw new Error("Business user not resolved");
    
    if (config) {
      await (supabase.from("organization_pipeline_config") as any)
        .update({ modules: newModules, updated_at: new Date().toISOString() })
        .eq("organization_id", companyId);
    } else {
      await (supabase.from("organization_pipeline_config") as any).insert([{
        organization_id: companyId,
        modules: newModules,
        created_by: businessUserId,
      }]);
    }

    setModules(newModules);
    await loadConfig();
  }, [companyId, config, loadConfig]);

  const toggleModule = useCallback(async (moduleId: string) => {
    const updated = modules.map(m => 
      m.id === moduleId ? { ...m, enabled: !m.enabled } : m
    );
    await saveModules(updated);
  }, [modules, saveModules]);

  const reorderModules = useCallback(async (newModules: PipelineModule[]) => {
    await saveModules(newModules);
  }, [saveModules]);

  const updateModuleLabel = useCallback(async (moduleId: string, label: string, sublabel?: string) => {
    const updated = modules.map(m => 
      m.id === moduleId ? { ...m, label, ...(sublabel !== undefined ? { sublabel } : {}) } : m
    );
    await saveModules(updated);
  }, [modules, saveModules]);

  const activeModules = modules.filter(m => m.enabled);

  return {
    templates,
    config,
    modules,
    activeModules,
    loading,
    applyTemplate,
    toggleModule,
    reorderModules,
    updateModuleLabel,
    saveModules,
  };
}
