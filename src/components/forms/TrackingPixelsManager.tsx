import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  BarChart3, 
  Plus, 
  Trash2, 
  Loader2, 
  Save,
  Facebook,
  Instagram,
  Linkedin,
  Code2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TrackingPixel {
  id: string;
  pixel_type: string;
  pixel_id: string;
  pixel_name: string | null;
  is_active: boolean | null;
  config: Record<string, any> | null;
}

interface TrackingPixelsManagerProps {
  formId: string;
}

const PIXEL_TYPES = [
  { 
    value: 'gtm', 
    label: 'Google Tag Manager', 
    placeholder: 'GTM-XXXXXXX',
    icon: BarChart3,
    color: 'bg-blue-500'
  },
  { 
    value: 'meta', 
    label: 'Meta Pixel (Facebook/Instagram)', 
    placeholder: '123456789012345',
    icon: Facebook,
    color: 'bg-indigo-500'
  },
  { 
    value: 'tiktok', 
    label: 'TikTok Pixel', 
    placeholder: 'XXXXXXXXXXXXXXXXXX',
    icon: Code2,
    color: 'bg-black'
  },
  { 
    value: 'google_ads', 
    label: 'Google Ads', 
    placeholder: 'AW-XXXXXXXXX',
    icon: BarChart3,
    color: 'bg-yellow-500'
  },
  { 
    value: 'linkedin', 
    label: 'LinkedIn Insight Tag', 
    placeholder: '123456',
    icon: Linkedin,
    color: 'bg-blue-700'
  },
  { 
    value: 'custom', 
    label: 'Script Personalizado', 
    placeholder: 'ID personalizado',
    icon: Code2,
    color: 'bg-gray-500'
  }
];

const GTM_EVENTS = [
  { event: 'form_loaded', description: 'Formulário carregou' },
  { event: 'form_field_interaction', description: 'Interação com campo' },
  { event: 'step_completed', description: 'Passo concluído' },
  { event: 'form_completed', description: 'Formulário completo' },
  { event: 'lead_created', description: 'Lead criada' },
  { event: 'form_error', description: 'Erro no formulário' }
];

export function TrackingPixelsManager({ formId }: TrackingPixelsManagerProps) {
  const [pixels, setPixels] = useState<TrackingPixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPixelType, setNewPixelType] = useState<string>("");
  const [newPixelId, setNewPixelId] = useState("");
  const [newPixelName, setNewPixelName] = useState("");

  useEffect(() => {
    loadPixels();
  }, [formId]);

  const loadPixels = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_tracking_pixels")
        .select("*")
        .eq("form_id", formId)
        .order("created_at");

      if (error) throw error;
      setPixels((data || []).map(p => ({
        ...p,
        is_active: p.is_active ?? true,
        config: (p.config as Record<string, any>) || {}
      })));
    } catch (err) {
      console.error("Error loading pixels:", err);
      toast.error("Erro ao carregar pixels");
    } finally {
      setLoading(false);
    }
  };

  const addPixel = async () => {
    if (!newPixelType || !newPixelId.trim()) {
      toast.error("Selecione o tipo e insira o ID do pixel");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("form_tracking_pixels")
        .insert({
          form_id: formId,
          pixel_type: newPixelType,
          pixel_id: newPixelId.trim().toUpperCase(),
          pixel_name: newPixelName.trim() || null,
          is_active: true,
          config: {}
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error("Este pixel já está configurado para este formulário");
        } else {
          throw error;
        }
        return;
      }

      setPixels([...pixels, {
        ...data,
        is_active: data.is_active ?? true,
        config: (data.config as Record<string, any>) || {}
      }]);
      setNewPixelType("");
      setNewPixelId("");
      setNewPixelName("");
      toast.success("Pixel adicionado com sucesso!");
    } catch (err) {
      console.error("Error adding pixel:", err);
      toast.error("Erro ao adicionar pixel");
    } finally {
      setSaving(false);
    }
  };

  const togglePixel = async (pixelId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("form_tracking_pixels")
        .update({ is_active: isActive })
        .eq("id", pixelId);

      if (error) throw error;

      setPixels(pixels.map(p => 
        p.id === pixelId ? { ...p, is_active: isActive } : p
      ));
      toast.success(isActive ? "Pixel ativado" : "Pixel desativado");
    } catch (err) {
      console.error("Error toggling pixel:", err);
      toast.error("Erro ao alterar estado do pixel");
    }
  };

  const deletePixel = async (pixelId: string) => {
    try {
      const { error } = await supabase
        .from("form_tracking_pixels")
        .delete()
        .eq("id", pixelId);

      if (error) throw error;

      setPixels(pixels.filter(p => p.id !== pixelId));
      toast.success("Pixel removido");
    } catch (err) {
      console.error("Error deleting pixel:", err);
      toast.error("Erro ao remover pixel");
    }
  };

  const getPixelConfig = (type: string) => {
    return PIXEL_TYPES.find(p => p.value === type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add New Pixel */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Pixel de Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={newPixelType} onValueChange={setNewPixelType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {PIXEL_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ID do Pixel</Label>
              <Input
                placeholder={getPixelConfig(newPixelType)?.placeholder || "ID do pixel"}
                value={newPixelId}
                onChange={(e) => setNewPixelId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome para identificar"
                  value={newPixelName}
                  onChange={(e) => setNewPixelName(e.target.value)}
                />
                <Button 
                  onClick={addPixel}
                  disabled={saving || !newPixelType || !newPixelId.trim()}
                  size="icon"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configured Pixels */}
      {pixels.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhum pixel configurado</p>
          <p className="text-xs">Adicione pixels para tracking de conversões</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pixels.map((pixel) => {
            const config = getPixelConfig(pixel.pixel_type);
            const IconComponent = config?.icon || Code2;
            
            return (
              <Card key={pixel.id} className={!pixel.is_active ? "opacity-60" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config?.color || 'bg-gray-500'} text-white`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {pixel.pixel_name || config?.label || pixel.pixel_type}
                          </span>
                          <Badge variant={pixel.is_active ? "default" : "secondary"} className="text-xs">
                            {pixel.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <code className="text-xs text-muted-foreground font-mono">
                          {pixel.pixel_id}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={pixel.is_active}
                        onCheckedChange={(checked) => togglePixel(pixel.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deletePixel(pixel.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Show GTM events info for GTM pixels */}
                  {pixel.pixel_type === 'gtm' && pixel.is_active && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-primary mb-2">Eventos Automáticos:</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                        {GTM_EVENTS.map((e) => (
                          <div key={e.event}>
                            <code className="bg-muted px-1 rounded">{e.event}</code> - {e.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show Meta events info */}
                  {pixel.pixel_type === 'meta' && pixel.is_active && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-primary mb-2">Eventos Meta Automáticos:</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                        <div><code className="bg-muted px-1 rounded">PageView</code> - Visualização</div>
                        <div><code className="bg-muted px-1 rounded">Lead</code> - Lead criada</div>
                        <div><code className="bg-muted px-1 rounded">CompleteRegistration</code> - Formulário completo</div>
                        <div><code className="bg-muted px-1 rounded">ViewContent</code> - Cada passo</div>
                      </div>
                    </div>
                  )}

                  {/* Show TikTok events info */}
                  {pixel.pixel_type === 'tiktok' && pixel.is_active && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-primary mb-2">Eventos TikTok Automáticos:</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                        <div><code className="bg-muted px-1 rounded">PageView</code> - Visualização</div>
                        <div><code className="bg-muted px-1 rounded">SubmitForm</code> - Lead criada</div>
                        <div><code className="bg-muted px-1 rounded">CompleteRegistration</code> - Formulário completo</div>
                        <div><code className="bg-muted px-1 rounded">ViewContent</code> - Cada passo</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
