import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { 
  Plus, Building, Briefcase, Car, Rocket, Users, Trash2, Edit, Copy, 
  ChevronRight, FolderTree, Building2, Store, Factory, GraduationCap, 
  Heart, Utensils, Plane, Wrench, Truck, ShoppingCart, Home, Stethoscope,
  Scale, Landmark, Sparkles, Filter, ArrowLeft
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { TemplatesFAQSection } from "@/components/templates/TemplatesFAQSection";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface OrgTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  recommended_modules: string[] | null;
}

interface TemplateNode {
  id: string;
  template_id: string;
  parent_node_id: string | null;
  name: string;
  type: string;
  description: string | null;
  sort_order: number;
}

const iconMap: Record<string, React.ElementType> = {
  building: Building,
  building2: Building2,
  briefcase: Briefcase,
  car: Car,
  rocket: Rocket,
  users: Users,
  store: Store,
  factory: Factory,
  graduationcap: GraduationCap,
  heart: Heart,
  utensils: Utensils,
  plane: Plane,
  wrench: Wrench,
  truck: Truck,
  shoppingcart: ShoppingCart,
  home: Home,
  stethoscope: Stethoscope,
  scale: Scale,
  landmark: Landmark,
};

const categoryColors: Record<string, string> = {
  services: "bg-emerald-100 text-emerald-800 border-emerald-200",
  retail: "bg-blue-100 text-blue-800 border-blue-200",
  tech: "bg-violet-100 text-violet-800 border-violet-200",
  corporate: "bg-amber-100 text-amber-800 border-amber-200",
  healthcare: "bg-rose-100 text-rose-800 border-rose-200",
  education: "bg-cyan-100 text-cyan-800 border-cyan-200",
  hospitality: "bg-orange-100 text-orange-800 border-orange-200",
  logistics: "bg-slate-100 text-slate-800 border-slate-200",
  general: "bg-gray-100 text-gray-800 border-gray-200",
};

function TemplateNodeTree({ nodes, parentId = null, level = 0 }: { nodes: TemplateNode[]; parentId?: string | null; level?: number }) {
  const childNodes = nodes.filter(n => n.parent_node_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
  if (childNodes.length === 0) return null;
  
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      holding: "bg-amber-50 text-amber-700 border-amber-200",
      empresa: "bg-blue-50 text-blue-700 border-blue-200",
      departamento: "bg-green-50 text-green-700 border-green-200",
      equipa: "bg-purple-50 text-purple-700 border-purple-200",
      projeto: "bg-pink-50 text-pink-700 border-pink-200",
      divisao: "bg-cyan-50 text-cyan-700 border-cyan-200",
      filial: "bg-orange-50 text-orange-700 border-orange-200",
      loja: "bg-indigo-50 text-indigo-700 border-indigo-200",
      armazem: "bg-slate-50 text-slate-700 border-slate-200",
    };
    return colors[type.toLowerCase()] || "bg-gray-50 text-gray-700 border-gray-200";
  };
  
  return (
    <div className={cn("space-y-1", level > 0 && "ml-4 border-l border-dashed border-muted-foreground/30 pl-3")}>
      {childNodes.map(node => (
        <div key={node.id}>
          <div className="flex items-center gap-2 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
            <span className="text-sm font-medium">{node.name}</span>
            <Badge variant="outline" className={cn("text-xs border", getTypeColor(node.type))}>
              {node.type}
            </Badge>
          </div>
          <TemplateNodeTree nodes={nodes} parentId={node.id} level={level + 1} />
        </div>
      ))}
    </div>
  );
}

function TemplateCard({ template, nodes, onUseTemplate, onEdit, onDelete, t }: { 
  template: OrgTemplate; 
  nodes: TemplateNode[];
  onUseTemplate: (template: OrgTemplate) => void;
  onEdit: (template: OrgTemplate) => void;
  onDelete: (template: OrgTemplate) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = iconMap[template.icon] || Building;
  const templateNodes = nodes.filter(n => n.template_id === template.id);
  const categoryColor = categoryColors[template.category] || categoryColors.general;
  
  const moduleLabels: Record<string, { label: string; color: string }> = {
    crm: { label: "CRM", color: "bg-blue-100 text-blue-700 border-blue-200" },
    acquisition: { label: "Aquisição", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    marketing: { label: "Marketing", color: "bg-pink-100 text-pink-700 border-pink-200" },
    inventory: { label: "Inventário", color: "bg-amber-100 text-amber-700 border-amber-200" },
    products: { label: "Produtos", color: "bg-violet-100 text-violet-700 border-violet-200" },
    services: { label: "Serviços", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    users: { label: "Utilizadores", color: "bg-slate-100 text-slate-700 border-slate-200" },
  };

  const modules = template.recommended_modules || [];
  
  return (
    <Card className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-4 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{template.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge className={cn("border", categoryColor)}>
            {t(`orgTemplates.categories.${template.category}`) || template.category}
          </Badge>
          {template.is_system && (
            <Badge variant="outline" className="bg-background">
              <Sparkles className="h-3 w-3 mr-1" />
              {t("orgTemplates.system")}
            </Badge>
          )}
        </div>

        {/* Recommended Modules */}
        {modules.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("orgTemplates.recommendedModules") || "Módulos Recomendados"}</p>
            <div className="flex flex-wrap gap-1.5">
              {modules.map((mod) => {
                const info = moduleLabels[mod] || { label: mod, color: "bg-gray-100 text-gray-700 border-gray-200" };
                return (
                  <Badge key={mod} variant="outline" className={cn("text-xs border", info.color)}>
                    {info.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
        
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-90")} />
              <FolderTree className="h-4 w-4" />
              <span>{t("orgTemplates.viewStructure")} ({templateNodes.length} {t("orgTemplates.nodes")})</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-muted/30 rounded-lg p-4 mt-2 border border-dashed">
              <TemplateNodeTree nodes={templateNodes} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      
      <div className="bg-muted/30 px-5 py-3 flex gap-2 border-t">
        <Button onClick={() => onUseTemplate(template)} className="flex-1 gap-2">
          <Building2 className="h-4 w-4" />
          {t("orgTemplates.createCompany")}
        </Button>
        {!template.is_system && (
          <>
            <Button variant="outline" size="icon" onClick={() => onEdit(template)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(template)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export default function OrgTemplates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<OrgTemplate | null>(null);
  const [rootName, setRootName] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("general");
  const [newTemplateIcon, setNewTemplateIcon] = useState("building");
  
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['org-templates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('anew_org_templates')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true });
      if (error) throw error;
      return data as OrgTemplate[];
    }
  });
  
  const { data: nodes = [] } = useQuery({
    queryKey: ['org-template-nodes'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('anew_org_template_nodes')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as TemplateNode[];
    }
  });
  
  const createTemplate = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any)
        .from('anew_org_templates')
        .insert({
          name: newTemplateName,
          description: newTemplateDescription,
          category: newTemplateCategory,
          icon: newTemplateIcon,
          is_active: true,
          is_system: false
        })
        .select()
        .single();
      if (error) throw error;
      
      const { error: nodeError } = await (supabase as any)
        .from('anew_org_template_nodes')
        .insert({
          template_id: data.id,
          name: newTemplateName,
          type: 'empresa',
          sort_order: 1,
          parent_node_id: null
        });
      if (nodeError) throw nodeError;
      return data;
    },
    onSuccess: () => {
      toast.success(t('orgTemplates.templateCreated'));
      queryClient.invalidateQueries({ queryKey: ['org-templates'] });
      queryClient.invalidateQueries({ queryKey: ['org-template-nodes'] });
      setCreateDialogOpen(false);
      resetNewTemplateForm();
    },
    onError: (error) => {
      toast.error(t('common.error') + ": " + error.message);
    }
  });
  
  const resetNewTemplateForm = () => {
    setNewTemplateName("");
    setNewTemplateDescription("");
    setNewTemplateCategory("general");
    setNewTemplateIcon("building");
  };
  
  const createFromTemplate = useMutation({
    mutationFn: async ({ templateId, rootName }: { templateId: string; rootName: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const { data, error } = await (supabase as any)
        .rpc('create_orgs_from_template', {
          p_template_id: templateId,
          p_root_name: rootName || null,
          p_created_by: businessUserId
        });
      if (error) throw error;
      
      const rootOrgId = typeof data === 'string' ? data : String(data);
      const { assignCreatorAsAdminToHierarchy } = await import("@/utils/organizationCreation");
      const result = await assignCreatorAsAdminToHierarchy(rootOrgId, rootName || "Organization", userData.user.id);
      if (!result.success) {
        toast.error("Erro ao atribuir administrador: " + result.error);
      }
      return rootOrgId;
    },
    onSuccess: () => {
      toast.success("Estrutura criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['anew-organizations'] });
      setUseDialogOpen(false);
      setSelectedTemplate(null);
      setRootName("");
    },
    onError: (error) => {
      toast.error("Erro ao criar estrutura: " + error.message);
    }
  });
  
  const handleUseTemplate = (template: OrgTemplate) => {
    setSelectedTemplate(template);
    setRootName("");
    setUseDialogOpen(true);
  };
  
  const handleConfirmUse = () => {
    if (!selectedTemplate) return;
    createFromTemplate.mutate({ templateId: selectedTemplate.id, rootName });
  };
  
  const handleCreateTemplate = () => {
    if (!newTemplateName.trim()) {
      toast.error(t('orgTemplates.nameRequired'));
      return;
    }
    createTemplate.mutate();
  };
  
  const uniqueCategories = [...new Set(templates.map(t => t.category))].sort();
  const filteredTemplates = sectorFilter === "all" ? templates : templates.filter(t => t.category === sectorFilter);
  
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const cat = template.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, OrgTemplate[]>);
  
  return (
    <>
      <div className="container mx-auto py-6 space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate('/organizations')} title={t('orgTemplates.backToOrganizations')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('orgTemplates.title')}</h1>
              <p className="text-muted-foreground mt-1">{t('orgTemplates.description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t('orgTemplates.filterBySector')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('orgTemplates.allSectors')}</SelectItem>
                {uniqueCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {t(`orgTemplates.categories.${cat}`) || cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="lg" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-5 w-5" />
              {t('orgTemplates.newTemplate')}
            </Button>
          </div>
        </div>
        
        {templatesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse">
                <div className="p-5">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-muted rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                </div>
                <div className="bg-muted/30 px-5 py-3 border-t"><div className="h-9 bg-muted rounded" /></div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
              <section key={category}>
                <div className="flex items-center gap-3 mb-5">
                  <Badge className={cn("text-sm px-3 py-1 border", categoryColors[category] || categoryColors.general)}>
                    {t(`orgTemplates.categories.${category}`) || category}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {categoryTemplates.length} {categoryTemplates.length === 1 ? 'template' : 'templates'}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {categoryTemplates.map(template => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      nodes={nodes}
                      onUseTemplate={handleUseTemplate}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        
        <TemplatesFAQSection />
        
        {/* Use Template Dialog */}
        <Dialog open={useDialogOpen} onOpenChange={setUseDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {t("orgTemplates.createFromTemplate")}
              </DialogTitle>
              <DialogDescription>
                {t("orgTemplates.createFromTemplateDesc", { name: selectedTemplate?.name || "" })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rootName">{t("orgTemplates.companyName")}</Label>
                <Input id="rootName" value={rootName} onChange={(e) => setRootName(e.target.value)} placeholder={t("orgTemplates.companyNamePlaceholder")} className="text-base" />
                <p className="text-xs text-muted-foreground">{t("orgTemplates.companyNameHint")}</p>
              </div>
              {selectedTemplate && (
                <div className="bg-muted/30 rounded-lg p-4 border border-dashed">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FolderTree className="h-4 w-4" />
                    {t("orgTemplates.structureToCreate")}
                  </p>
                  <TemplateNodeTree nodes={nodes.filter(n => n.template_id === selectedTemplate.id)} />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setUseDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleConfirmUse} disabled={createFromTemplate.isPending} className="gap-2">
                {createFromTemplate.isPending ? (
                  <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{t("common.creating")}</>
                ) : (
                  <><Building2 className="h-4 w-4" />{t("orgTemplates.createCompanyBtn")}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Create New Template Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                {t("orgTemplates.newTemplate")}
              </DialogTitle>
              <DialogDescription>{t("orgTemplates.newTemplateDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">{t("orgTemplates.templateName")}</Label>
                <Input id="templateName" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder={t("orgTemplates.templateNamePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="templateDescription">{t("orgTemplates.templateDescription")}</Label>
                <Input id="templateDescription" value={newTemplateDescription} onChange={(e) => setNewTemplateDescription(e.target.value)} placeholder={t("orgTemplates.templateDescriptionPlaceholder")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("orgTemplates.category")}</Label>
                  <Select value={newTemplateCategory} onValueChange={setNewTemplateCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["general","corporate","tech","retail","services","healthcare","education","hospitality","logistics"].map(cat => (
                        <SelectItem key={cat} value={cat}>{t(`orgTemplates.categories.${cat}`) || cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("orgTemplates.icon")}</Label>
                  <Select value={newTemplateIcon} onValueChange={setNewTemplateIcon}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["building","building2","briefcase","users","store","factory","rocket","heart","graduationcap","utensils","truck","car"].map(icon => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleCreateTemplate} disabled={createTemplate.isPending || !newTemplateName.trim()} className="gap-2">
                {createTemplate.isPending ? (
                  <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{t("common.creating")}</>
                ) : (
                  <><Plus className="h-4 w-4" />{t("orgTemplates.createTemplate")}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
