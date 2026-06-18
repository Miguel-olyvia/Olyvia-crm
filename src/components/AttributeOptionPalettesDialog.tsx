import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Settings2, GripVertical, ChevronRight, FolderOpen, Tag, Copy } from "lucide-react";
import CategoryAttributePricesDialog from "@/components/CategoryAttributePricesDialog";
import RangeScalesTab from "@/components/RangeScalesTab";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface AttributeOptionPalettesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributeId: string;
  attributeLabel: string;
  globalAllowedValues: string[];
  pricingType: string;
  hasHexColor: boolean;
  valueType: string;
}

interface OptionGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface GroupValue {
  id: string;
  group_id: string;
  value_text: string;
  display_name: string | null;
  hex_color: string | null;
  sort_order: number;
  is_active: boolean;
}

interface CategoryPalette {
  id: string;
  category_id: string;
  attribute_id: string;
  base_group_id: string | null;
  additional_values: any[];
  excluded_values: string[];
}

interface Category {
  id: string;
  name: string;
  parent_category_id: string | null;
  parent_id: string | null;
  level?: number;
}

export default function AttributeOptionPalettesDialog({
  open,
  onOpenChange,
  attributeId,
  attributeLabel,
  globalAllowedValues,
  pricingType,
  hasHexColor,
  valueType
}: AttributeOptionPalettesDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [groupValues, setGroupValues] = useState<Record<string, GroupValue[]>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPalettes, setCategoryPalettes] = useState<Record<string, CategoryPalette>>({});
  
  // Form states
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newValueText, setNewValueText] = useState("");
  const [newValueHexColor, setNewValueHexColor] = useState("");
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [priceCategoryId, setPriceCategoryId] = useState<string | null>(null);
  const [priceCategoryName, setPriceCategoryName] = useState("");
  const [duplicatingGroupId, setDuplicatingGroupId] = useState<string | null>(null);
  const [duplicateName, setDuplicateName] = useState("");

  const getCategoryParentId = (category: Pick<Category, "parent_id" | "parent_category_id">) =>
    category.parent_id ?? category.parent_category_id ?? null;

  const rootCategories = categories.filter((category) => !getCategoryParentId(category));
  const subcategories = categories.filter((category) => !!getCategoryParentId(category));

  useEffect(() => {
    if (open && attributeId && activeCompany?.id) {
      loadData();
    }
  }, [open, attributeId, activeCompany?.id]);

  const loadData = async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      // Load groups for this attribute
      let { data: groupsData, error: groupsError } = await (supabase as any)
        .from('attribute_option_groups')
        .select('*')
        .eq('attribute_id', attributeId)
        .eq('organization_id', activeCompany.id)
        .order('sort_order');

      if (groupsError) throw groupsError;

      // Auto-create base group if list attribute has no groups
      if (valueType === 'list' && (!groupsData || groupsData.length === 0)) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("User not authenticated");
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error("Business user not resolved");
        const { data: newGroup, error: createError } = await (supabase as any)
          .from('attribute_option_groups')
          .insert({
            attribute_id: attributeId,
            organization_id: activeCompany.id,
            name: attributeLabel,
            sort_order: 0,
            created_by: businessUserId
          })
          .select()
          .single();

        if (createError) throw createError;

        // Migrate legacy allowed_values if any
        if (globalAllowedValues.length > 0) {
          const valuesToInsert = globalAllowedValues.map((v, i) => ({
            group_id: newGroup.id,
            value_text: v.toUpperCase(),
            display_name: v,
            sort_order: i
          }));
          await (supabase as any)
            .from('attribute_option_group_values')
            .insert(valuesToInsert);
        }

        // Reload groups after auto-creation
        const { data: reloadedGroups } = await (supabase as any)
          .from('attribute_option_groups')
          .select('*')
          .eq('attribute_id', attributeId)
          .eq('organization_id', activeCompany.id)
          .order('sort_order');
        groupsData = reloadedGroups || [];
      }

      setGroups(groupsData || []);

      // Auto-select first group if none selected
      if (!selectedGroupId && groupsData && groupsData.length > 0) {
        setSelectedGroupId(groupsData[0].id);
      }

      // Load values for each group
      const valuesMap: Record<string, GroupValue[]> = {};
      for (const group of groupsData || []) {
        const { data: valuesData } = await (supabase as any)
          .from('attribute_option_group_values')
          .select('*')
          .eq('group_id', group.id)
          .order('sort_order');
        valuesMap[group.id] = valuesData || [];
      }
      setGroupValues(valuesMap);

      // Load categories (hierarchy)
      const { data: categoriesData } = await supabase
        .from('product_categories')
        .select('id, name, parent_category_id, parent_id')
        .eq('organization_id', activeCompany.id)
        .order('name');
      
      // Build hierarchy with levels, supporting both legacy parent_category_id and current parent_id
      const buildHierarchy = (cats: Category[], parentId: string | null = null, level = 0): Category[] => {
        const result: Category[] = [];
        for (const cat of cats) {
          if (getCategoryParentId(cat) === parentId) {
            result.push({ ...cat, level });
            result.push(...buildHierarchy(cats, cat.id, level + 1));
          }
        }
        return result;
      };
      setCategories(buildHierarchy(categoriesData || []));

      // Load category palettes for this attribute
      const { data: palettesData } = await (supabase as any)
        .from('category_attribute_palettes')
        .select('*')
        .eq('attribute_id', attributeId);
      
      const palettesMap: Record<string, CategoryPalette> = {};
      for (const p of palettesData || []) {
        palettesMap[p.category_id] = p;
      }
      setCategoryPalettes(palettesMap);

    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !activeCompany?.id) return;
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      
      const { error } = await (supabase as any)
        .from('attribute_option_groups')
        .insert({
          attribute_id: attributeId,
          organization_id: activeCompany.id,
          name: newGroupName.trim(),
          description: newGroupDescription.trim() || null,
          sort_order: groups.length,
          created_by: businessUserId
        });

      if (error) throw error;
      
      toast({ title: hasHexColor ? "Paleta criada com sucesso" : "Grupo criado com sucesso" });
      setNewGroupName("");
      setNewGroupDescription("");
      // Reload and auto-select the new group
      const { data: updatedGroups } = await (supabase as any)
        .from('attribute_option_groups')
        .select('*')
        .eq('attribute_id', attributeId)
        .eq('organization_id', activeCompany.id)
        .order('sort_order');
      if (updatedGroups && updatedGroups.length > 0) {
        const newestGroup = updatedGroups[updatedGroups.length - 1];
        setSelectedGroupId(newestGroup.id);
      }
      loadData();
    } catch (error: any) {
      toast({
        title: hasHexColor ? "Erro ao criar paleta" : "Erro ao criar grupo",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm(hasHexColor ? "Tem certeza que deseja eliminar esta paleta? Isto removerá todas as cores associadas." : "Tem certeza que deseja eliminar este grupo? Isto removerá todas as opções associadas.")) return;
    
    try {
      const { error } = await (supabase as any)
        .from('attribute_option_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      
      toast({ title: hasHexColor ? "Paleta eliminada" : "Grupo eliminado" });
      if (selectedGroupId === groupId) setSelectedGroupId(null);
      loadData();
    } catch (error: any) {
      toast({
        title: hasHexColor ? "Erro ao eliminar paleta" : "Erro ao eliminar grupo",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleStartDuplicate = (groupId: string) => {
    const sourceGroup = groups.find(g => g.id === groupId);
    if (!sourceGroup) return;
    setDuplicateName(`${sourceGroup.name} (cópia)`);
    setDuplicatingGroupId(groupId);
  };

  const handleConfirmDuplicate = async () => {
    const groupId = duplicatingGroupId;
    if (!groupId || !activeCompany?.id || !duplicateName.trim()) return;
    const sourceGroup = groups.find(g => g.id === groupId);
    if (!sourceGroup) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");

      const { data: newGroup, error: createError } = await (supabase as any)
        .from('attribute_option_groups')
        .insert({
          attribute_id: attributeId,
          organization_id: activeCompany.id,
          name: duplicateName.trim(),
          description: sourceGroup.description,
          sort_order: groups.length,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Copy all values from source group
      const sourceValues = groupValues[groupId] || [];
      if (sourceValues.length > 0) {
        const valuesToInsert = sourceValues.map((v, i) => ({
          group_id: newGroup.id,
          value_text: v.value_text,
          display_name: v.display_name,
          hex_color: v.hex_color,
          sort_order: i,
          is_active: v.is_active,
        }));
        await (supabase as any)
          .from('attribute_option_group_values')
          .insert(valuesToInsert);
      }

      toast({ title: hasHexColor ? "Paleta duplicada com sucesso" : "Grupo duplicado com sucesso" });
      setSelectedGroupId(newGroup.id);
      setDuplicatingGroupId(null);
      setDuplicateName("");
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao duplicar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleAddValueToGroup = async (groupId: string) => {
    if (!newValueText.trim()) return;
    
    try {
      const existingValues = groupValues[groupId] || [];
      
      const { error } = await (supabase as any)
        .from('attribute_option_group_values')
        .insert({
          group_id: groupId,
          value_text: newValueText.trim().toUpperCase(),
          display_name: newValueText.trim(),
          hex_color: newValueHexColor || null,
          sort_order: existingValues.length
        });

      if (error) throw error;
      
      setNewValueText("");
      setNewValueHexColor("");
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar opção",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleRemoveValueFromGroup = async (valueId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('attribute_option_group_values')
        .delete()
        .eq('id', valueId);

      if (error) throw error;
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao remover opção",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleImportGlobalValues = async (groupId: string) => {
    if (!globalAllowedValues.length) {
      toast({ title: "Não existem valores globais para importar", variant: "destructive" });
      return;
    }

    try {
      const existingValues = groupValues[groupId] || [];
      const existingTexts = existingValues.map(v => v.value_text.toUpperCase());
      
      const valuesToInsert = globalAllowedValues
        .filter(v => !existingTexts.includes(v.toUpperCase()))
        .map((v, i) => ({
          group_id: groupId,
          value_text: v.toUpperCase(),
          display_name: v,
          sort_order: existingValues.length + i
        }));

      if (valuesToInsert.length === 0) {
        toast({ title: hasHexColor ? "Todos os valores já existem na paleta" : "Todos os valores já existem no grupo" });
        return;
      }

      const { error } = await (supabase as any)
        .from('attribute_option_group_values')
        .insert(valuesToInsert);

      if (error) throw error;
      
      toast({ title: `${valuesToInsert.length} valores importados` });
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao importar valores",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleAssignPaletteToCategory = async (categoryId: string, groupId: string | null) => {
    try {
      if (groupId) {
        // Upsert the palette assignment
        const existing = categoryPalettes[categoryId];
        if (existing) {
          const { error } = await (supabase as any)
            .from('category_attribute_palettes')
            .update({ base_group_id: groupId })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any)
            .from('category_attribute_palettes')
            .insert({
              category_id: categoryId,
              attribute_id: attributeId,
              base_group_id: groupId
            });
          if (error) throw error;
        }
        toast({ title: hasHexColor ? "Paleta atribuída à categoria" : "Grupo atribuído à categoria" });
      } else {
        // Remove assignment
        const existing = categoryPalettes[categoryId];
        if (existing) {
          const { error } = await (supabase as any)
            .from('category_attribute_palettes')
            .delete()
            .eq('id', existing.id);
          if (error) throw error;
          toast({ title: hasHexColor ? "Paleta removida da categoria" : "Grupo removido da categoria" });
        }
      }
      loadData();
    } catch (error: any) {
      toast({
        title: hasHexColor ? "Erro ao atribuir paleta" : "Erro ao atribuir grupo",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getGroupValueCount = (groupId: string) => (groupValues[groupId] || []).length;

  const getCategoryPaletteName = (categoryId: string) => {
    const palette = categoryPalettes[categoryId];
    if (!palette?.base_group_id) return null;
    const group = groups.find(g => g.id === palette.base_group_id);
    return group?.name || null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configurar Opções - {attributeLabel}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={valueType === 'list' ? 'palettes' : 'ranges'} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className={`grid w-full ${
            valueType === 'list' && pricingType === 'range' ? 'grid-cols-4' :
            valueType === 'list' ? 'grid-cols-3' : 'grid-cols-1'
          }`}>
            {valueType === 'list' && <TabsTrigger value="palettes">{hasHexColor ? 'Paletas' : 'Grupos de Opções'}</TabsTrigger>}
            {valueType === 'list' && <TabsTrigger value="categories">Categorias</TabsTrigger>}
            {valueType === 'list' && <TabsTrigger value="subcategories">Subcategorias</TabsTrigger>}
            {pricingType === 'range' && <TabsTrigger value="ranges">Escalões</TabsTrigger>}
          </TabsList>

          <TabsContent value="palettes" className="flex-1 overflow-hidden min-h-[450px]">
            <div className="grid grid-cols-2 gap-4 h-[450px]">
              {/* Left: Groups list */}
              <div className="flex flex-col space-y-4">
                {!showNewGroupForm ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowNewGroupForm(true)}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {hasHexColor ? 'Nova Paleta' : 'Novo Grupo'}
                  </Button>
                ) : (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{hasHexColor ? 'Nova Paleta' : 'Novo Grupo'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Input
                        placeholder={hasHexColor ? "Nome da paleta (ex: Cores Metálicas)" : "Nome do grupo (ex: Acabamentos Standard)"}
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                      />
                      <Input
                        placeholder="Descrição (opcional)"
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleCreateGroup} className="flex-1" size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          {hasHexColor ? 'Criar Paleta' : 'Criar Grupo'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowNewGroupForm(false); setNewGroupName(""); setNewGroupDescription(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <ScrollArea className="flex-1 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {groups.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {hasHexColor ? 'Nenhuma paleta criada' : 'Nenhum grupo criado'}
                      </p>
                    ) : (
                      groups.map((group) => (
                        <React.Fragment key={group.id}>
                          <div
                            className={`p-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors group ${
                              selectedGroupId === group.id
                                ? 'bg-primary/10 border border-primary'
                                : 'hover:bg-muted border border-transparent'
                            }`}
                            onClick={() => setSelectedGroupId(group.id)}
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">{group.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {getGroupValueCount(group.id)} opções
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleStartDuplicate(group.id); }}
                                title="Duplicar"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                          {duplicatingGroupId === group.id && (
                            <div className="flex items-center gap-2 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                              <Input
                                value={duplicateName}
                                onChange={(e) => setDuplicateName(e.target.value)}
                                placeholder="Nome da cópia"
                                className="h-8 text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleConfirmDuplicate();
                                  if (e.key === 'Escape') { setDuplicatingGroupId(null); setDuplicateName(""); }
                                }}
                              />
                              <Button size="sm" className="h-8 px-3" onClick={handleConfirmDuplicate}>
                                OK
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setDuplicatingGroupId(null); setDuplicateName(""); }}>
                                ✕
                              </Button>
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Selected group values */}
              <div className="flex flex-col space-y-4 h-full min-h-0">
                {selectedGroupId ? (
                  <>
                    <Card>
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm">
                          {groups.find(g => g.id === selectedGroupId)?.name}
                        </CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleImportGlobalValues(selectedGroupId)}
                          >
                            Importar Globais
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteGroup(selectedGroupId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Nova opção"
                            value={newValueText}
                            onChange={(e) => setNewValueText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddValueToGroup(selectedGroupId);
                            }}
                          />
                          {hasHexColor && (
                            <Input
                              type="color"
                              className="w-12 p-1 h-9"
                              value={newValueHexColor || '#ffffff'}
                              onChange={(e) => setNewValueHexColor(e.target.value)}
                              title="Cor (opcional)"
                            />
                          )}
                          <Button size="sm" onClick={() => handleAddValueToGroup(selectedGroupId)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <ScrollArea className="flex-1 min-h-0 border rounded-lg">
                      <div className="p-3 flex flex-wrap gap-2">
                        {(groupValues[selectedGroupId] || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground w-full text-center py-4">
                            Nenhuma opção adicionada
                          </p>
                        ) : (
                          (groupValues[selectedGroupId] || []).map((value) => (
                            <Badge
                              key={value.id}
                              variant="secondary"
                              className="flex items-center gap-1 py-1.5 px-3"
                              style={value.hex_color ? { 
                                backgroundColor: value.hex_color + '20',
                                borderColor: value.hex_color 
                              } : undefined}
                            >
                              {value.hex_color && (
                                <div
                                  className="w-3 h-3 rounded-full border"
                                  style={{ backgroundColor: value.hex_color }}
                                />
                              )}
                              {value.display_name || value.value_text}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveValueFromGroup(value.id);
                                }}
                                className="ml-1 text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">{hasHexColor ? 'Selecione uma paleta para editar' : 'Selecione um grupo para editar'}</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="flex-1 overflow-hidden">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {hasHexColor
                    ? 'Crie primeiro uma paleta na aba "Paletas" para poder atribuir a categorias.'
                    : 'Crie primeiro um grupo na aba "Grupos de Opções" para poder atribuir a categorias.'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                {rootCategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma categoria encontrada</p>
                ) : (
                  <div className="space-y-1.5">
                    {rootCategories.map((category) => (
                      <div key={category.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{category.name}</span>
                          {getCategoryPaletteName(category.id) && (
                            <Badge variant="outline" className="text-xs shrink-0">{getCategoryPaletteName(category.id)}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={categoryPalettes[category.id]?.base_group_id || "none"}
                            onValueChange={(value) => handleAssignPaletteToCategory(category.id, value === "none" ? null : value)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder={hasHexColor ? "Selecionar paleta" : "Selecionar grupo"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem grupo atribuído</SelectItem>
                              {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>{group.name} ({getGroupValueCount(group.id)})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {categoryPalettes[category.id]?.base_group_id && (
                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setPriceCategoryId(category.id); setPriceCategoryName(category.name); }}>
                              <Tag className="h-3.5 w-3.5 mr-1" /> Preços
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="subcategories" className="flex-1 overflow-hidden">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {hasHexColor
                    ? 'Crie primeiro uma paleta na aba "Paletas" para poder atribuir a subcategorias.'
                    : 'Crie primeiro um grupo na aba "Grupos de Opções" para poder atribuir a subcategorias.'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                {subcategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma subcategoria encontrada</p>
                ) : (
                  <div className="space-y-1.5">
                    {subcategories.map((category) => {
                      const parent = categories.find((item) => item.id === getCategoryParentId(category));
                      return (
                        <div key={category.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <span className="text-sm font-medium truncate block">{category.name}</span>
                              {parent && <span className="text-[10px] text-muted-foreground">{parent.name}</span>}
                            </div>
                            {getCategoryPaletteName(category.id) && (
                              <Badge variant="outline" className="text-xs shrink-0">{getCategoryPaletteName(category.id)}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Select
                              value={categoryPalettes[category.id]?.base_group_id || "none"}
                              onValueChange={(value) => handleAssignPaletteToCategory(category.id, value === "none" ? null : value)}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder={hasHexColor ? "Selecionar paleta" : "Selecionar grupo"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem grupo atribuído</SelectItem>
                                {groups.map((group) => (
                                  <SelectItem key={group.id} value={group.id}>{group.name} ({getGroupValueCount(group.id)})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {categoryPalettes[category.id]?.base_group_id && (
                              <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setPriceCategoryId(category.id); setPriceCategoryName(category.name); }}>
                                <Tag className="h-3.5 w-3.5 mr-1" /> Preços
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </TabsContent>

          {pricingType === 'range' && (
            <TabsContent value="ranges" className="flex flex-1 min-h-0 overflow-hidden">
              <RangeScalesTab attributeId={attributeId} />
            </TabsContent>
          )}
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>

      {priceCategoryId && (
        <CategoryAttributePricesDialog
          open={!!priceCategoryId}
          onOpenChange={(open) => {
            if (!open) {
              setPriceCategoryId(null);
              setPriceCategoryName("");
            }
          }}
          categoryId={priceCategoryId}
          categoryName={priceCategoryName}
          attributeId={attributeId}
        />
      )}
    </Dialog>
  );
}
