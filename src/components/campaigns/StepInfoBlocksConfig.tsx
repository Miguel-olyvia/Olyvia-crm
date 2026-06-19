import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";

interface InfoBlock {
  id: string;
  step_id: string;
  title: string;
  content: string;
  icon_type: string;
  sort_order: number;
  is_visible: boolean;
}

interface FormStep {
  id: string;
  step_number: number;
  step_title: string;
}

interface StepInfoBlocksConfigProps {
  campaignId: string;
  formSteps: FormStep[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ICON_OPTIONS = [
  { value: 'info', label: 'Informação', icon: Info },
  { value: 'warning', label: 'Aviso', icon: AlertTriangle },
  { value: 'success', label: 'Sucesso', icon: CheckCircle },
  { value: 'alert', label: 'Alerta', icon: AlertCircle },
];

export function StepInfoBlocksConfig({ campaignId, formSteps }: StepInfoBlocksConfigProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [infoBlocks, setInfoBlocks] = useState<InfoBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBlock, setEditingBlock] = useState<InfoBlock | null>(null);
  const [newBlock, setNewBlock] = useState({
    step_id: "",
    title: "",
    content: "",
    icon_type: "info",
    is_visible: true,
  });

  useEffect(() => {
    if (formSteps.length > 0) {
      loadInfoBlocks();
    }
  }, [formSteps]);

  const loadInfoBlocks = async () => {
    setLoading(true);
    try {
      const stepIds = formSteps.map(s => s.id);
      const { data, error } = await supabase
        .from("campaign_step_info_blocks")
        .select("*")
        .in("step_id", stepIds)
        .order("sort_order");

      if (error) throw error;
      setInfoBlocks(data || []);
    } catch (error) {
      console.error("Error loading info blocks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlock = async () => {
    if (!newBlock.step_id || !newBlock.title || !newBlock.content) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    try {
      const blocksInStep = infoBlocks.filter(b => b.step_id === newBlock.step_id);
      const { error } = await supabase
        .from("campaign_step_info_blocks")
        .insert({
          step_id: newBlock.step_id,
          title: newBlock.title,
          content: newBlock.content,
          icon_type: newBlock.icon_type,
          is_visible: newBlock.is_visible,
          sort_order: blocksInStep.length,
        });

      if (error) throw error;

      toast({ title: "Bloco de informação adicionado" });
      setNewBlock({
        step_id: newBlock.step_id,
        title: "",
        content: "",
        icon_type: "info",
        is_visible: true,
      });
      loadInfoBlocks();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar bloco", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateBlock = async () => {
    if (!editingBlock) return;

    try {
      const { error } = await supabase
        .from("campaign_step_info_blocks")
        .update({
          title: editingBlock.title,
          content: editingBlock.content,
          icon_type: editingBlock.icon_type,
          is_visible: editingBlock.is_visible,
        })
        .eq("id", editingBlock.id);

      if (error) throw error;

      toast({ title: "Bloco atualizado" });
      setEditingBlock(null);
      loadInfoBlocks();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteBlock = async (id: string) => {
    try {
      const { error } = await supabase
        .from("campaign_step_info_blocks")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Bloco removido" });
      loadInfoBlocks();
    } catch (error: any) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    }
  };

  const getIconComponent = (iconType: string) => {
    const option = ICON_OPTIONS.find(o => o.value === iconType);
    const IconComponent = option?.icon || Info;
    return <IconComponent className="h-4 w-4" />;
  };

  const getIconColor = (iconType: string) => {
    switch (iconType) {
      case 'warning': return 'text-amber-500';
      case 'success': return 'text-green-500';
      case 'alert': return 'text-red-500';
      default: return 'text-blue-500';
    }
  };

  const getBlockBgColor = (iconType: string) => {
    switch (iconType) {
      case 'warning': return 'bg-amber-50 border-amber-200';
      case 'success': return 'bg-green-50 border-green-200';
      case 'alert': return 'bg-red-50 border-red-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Add New Block */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Novo Bloco
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Passo do Formulário *</Label>
              <Select
                value={newBlock.step_id}
                onValueChange={(v) => setNewBlock({ ...newBlock, step_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o passo" />
                </SelectTrigger>
                <SelectContent>
                  {formSteps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.step_number}. {step.step_title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Ícone</Label>
              <Select
                value={newBlock.icon_type}
                onValueChange={(v) => setNewBlock({ ...newBlock, icon_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className={`h-4 w-4 ${getIconColor(option.value)}`} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={newBlock.title}
              onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
              placeholder="Ex: Informação Importante"
            />
          </div>

          <div className="space-y-2">
            <Label>Conteúdo *</Label>
            <Textarea
              value={newBlock.content}
              onChange={(e) => setNewBlock({ ...newBlock, content: e.target.value })}
              placeholder="Escreva o conteúdo do bloco de informação..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={newBlock.is_visible}
                onCheckedChange={(checked) => setNewBlock({ ...newBlock, is_visible: checked })}
              />
              <Label>Visível no formulário</Label>
            </div>
            <Button onClick={handleAddBlock}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Bloco
            </Button>
          </div>

          {/* Preview */}
          {newBlock.title && newBlock.content && (
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Pré-visualização:</Label>
              <div className={`flex items-start gap-3 p-4 border rounded-lg mt-2 ${getBlockBgColor(newBlock.icon_type)}`}>
                <span className={`mt-0.5 flex-shrink-0 ${getIconColor(newBlock.icon_type)}`}>
                  {getIconComponent(newBlock.icon_type)}
                </span>
                <div>
                  <h4 className={`font-semibold text-sm ${getIconColor(newBlock.icon_type).replace('text-', 'text-').replace('-500', '-800')}`}>
                    {newBlock.title}
                  </h4>
                  <p className="text-sm mt-1 whitespace-pre-line">{newBlock.content}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Blocks by Step */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Blocos Configurados ({infoBlocks.length})
        </h4>

        {formSteps.map((step) => {
          const stepBlocks = infoBlocks.filter(b => b.step_id === step.id);
          if (stepBlocks.length === 0) return null;

          return (
            <div key={step.id} className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                {step.step_number}. {step.step_title}
              </div>
              {stepBlocks.map((block) => (
                <div
                  key={block.id}
                  className={`flex items-start justify-between p-3 border rounded-lg ${
                    !block.is_visible ? 'opacity-50' : ''
                  }`}
                >
                  {editingBlock?.id === block.id ? (
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          value={editingBlock.title}
                          onChange={(e) => setEditingBlock({ ...editingBlock, title: e.target.value })}
                          placeholder="Título"
                        />
                        <Select
                          value={editingBlock.icon_type}
                          onValueChange={(v) => setEditingBlock({ ...editingBlock, icon_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ICON_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={editingBlock.content}
                        onChange={(e) => setEditingBlock({ ...editingBlock, content: e.target.value })}
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editingBlock.is_visible}
                            onCheckedChange={(checked) => setEditingBlock({ ...editingBlock, is_visible: checked })}
                          />
                          <Label className="text-sm">Visível</Label>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={handleUpdateBlock}>Guardar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingBlock(null)}>Cancelar</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex-shrink-0 ${getIconColor(block.icon_type)}`}>
                          {getIconComponent(block.icon_type)}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{block.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {block.content}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <Button variant="ghost" size="icon" onClick={() => setEditingBlock(block)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteBlock(block.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {infoBlocks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Nenhum bloco de informação configurado. Adicione o primeiro bloco acima.
          </div>
        )}
      </div>
    </div>
  );
}
