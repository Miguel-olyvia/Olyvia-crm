import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, GripVertical, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FormStep {
  id: string;
  step_number: number;
  step_title: string;
}

interface FormSection {
  id: string;
  step_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible: boolean;
}

interface FormSectionsConfigProps {
  campaignId: string;
  formSteps: FormStep[];
}

export function FormSectionsConfig({ campaignId, formSteps }: FormSectionsConfigProps) {
  const { toast } = useToast();
  const [sections, setSections] = useState<FormSection[]>([]);
  const [editingSection, setEditingSection] = useState<FormSection | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<string[]>([]);
  const [newSection, setNewSection] = useState({
    step_id: "",
    title: "",
    description: "",
    is_visible: true,
  });

  useEffect(() => {
    loadSections();
  }, [campaignId]);

  const loadSections = async () => {
    const stepIds = formSteps.map(s => s.id);
    if (stepIds.length === 0) return;

    const { data, error } = await supabase
      .from("campaign_form_sections")
      .select("*")
      .in("step_id", stepIds)
      .order("sort_order");

    if (error) {
      console.error("Error loading sections:", error);
    } else {
      setSections(data || []);
    }
  };

  const handleAddSection = async () => {
    if (!newSection.step_id || !newSection.title.trim()) {
      toast({ title: "Selecione um passo e insira o título", variant: "destructive" });
      return;
    }

    const stepSections = sections.filter(s => s.step_id === newSection.step_id);
    const nextOrder = stepSections.length;

    const { error } = await supabase.from("campaign_form_sections").insert({
      step_id: newSection.step_id,
      title: newSection.title.trim(),
      description: newSection.description.trim() || null,
      sort_order: nextOrder,
      is_visible: newSection.is_visible,
    });

    if (error) {
      toast({ title: "Erro ao adicionar secção", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Secção adicionada" });
      setNewSection({ step_id: newSection.step_id, title: "", description: "", is_visible: true });
      loadSections();
    }
  };

  const handleUpdateSection = async () => {
    if (!editingSection) return;

    const { error } = await supabase
      .from("campaign_form_sections")
      .update({
        title: editingSection.title,
        description: editingSection.description,
        is_visible: editingSection.is_visible,
      })
      .eq("id", editingSection.id);

    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Secção atualizada" });
      setEditingSection(null);
      loadSections();
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    const { error } = await supabase
      .from("campaign_form_sections")
      .delete()
      .eq("id", sectionId);

    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Secção eliminada" });
      loadSections();
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => 
      prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId]
    );
  };

  const getSectionsForStep = (stepId: string) => sections.filter(s => s.step_id === stepId);

  return (
    <div className="space-y-6">
      {/* Add New Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Adicionar Secção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Passo *</Label>
              <Select value={newSection.step_id} onValueChange={(v) => setNewSection(prev => ({ ...prev, step_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um passo" />
                </SelectTrigger>
                <SelectContent>
                  {formSteps.map(step => (
                    <SelectItem key={step.id} value={step.id}>
                      Passo {step.step_number}: {step.step_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Informações Pessoais"
                value={newSection.title}
                onChange={(e) => setNewSection(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              placeholder="Descrição curta da secção..."
              value={newSection.description}
              onChange={(e) => setNewSection(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                checked={newSection.is_visible}
                onCheckedChange={(checked) => setNewSection(prev => ({ ...prev, is_visible: checked }))}
              />
              <Label className="font-normal">Visível</Label>
            </div>
            <Button onClick={handleAddSection} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sections by Step */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-4">
          {formSteps.map(step => {
            const stepSections = getSectionsForStep(step.id);
            const isExpanded = expandedSteps.includes(step.id);

            return (
              <Collapsible key={step.id} open={isExpanded} onOpenChange={() => toggleStep(step.id)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Passo {step.step_number}: {step.step_title}</span>
                        <span className="text-xs text-muted-foreground">({stepSections.length} secções)</span>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="divide-y">
                      {stepSections.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          Nenhuma secção neste passo
                        </div>
                      ) : (
                        stepSections.map(section => (
                          <div key={section.id} className="p-4 space-y-3">
                            {editingSection?.id === section.id ? (
                              <div className="space-y-3">
                                <Input
                                  value={editingSection.title}
                                  onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })}
                                />
                                <Textarea
                                  value={editingSection.description || ""}
                                  onChange={(e) => setEditingSection({ ...editingSection, description: e.target.value })}
                                  rows={2}
                                />
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      checked={editingSection.is_visible}
                                      onCheckedChange={(checked) => setEditingSection({ ...editingSection, is_visible: checked })}
                                    />
                                    <Label className="font-normal text-sm">Visível</Label>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                                      Cancelar
                                    </Button>
                                    <Button size="sm" onClick={handleUpdateSection}>
                                      Guardar
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                  <div>
                                    <p className={`font-medium ${!section.is_visible ? 'text-muted-foreground line-through' : ''}`}>
                                      {section.title}
                                    </p>
                                    {section.description && (
                                      <p className="text-xs text-muted-foreground">{section.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => setEditingSection(section)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => handleDeleteSection(section.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
