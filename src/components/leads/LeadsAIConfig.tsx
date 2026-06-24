import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  Sparkles, 
  MapPin, 
  Clock, 
  Phone, 
  TrendingUp, 
  Calendar,
  Save,
  RotateCcw,
  Settings2
} from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

interface LeadsAIConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
}

interface AIConfig {
  id?: string;
  days_without_contact_alert: number;
  days_without_contact_enabled: boolean;
  group_by_location_enabled: boolean;
  min_leads_for_location_group: number;
  location_radius_km: number;
  callback_reminder_enabled: boolean;
  callback_reminder_hours_before: number;
  priority_leads_enabled: boolean;
  high_value_threshold: number;
  new_leads_alert_enabled: boolean;
  new_leads_check_hours: number;
  follow_up_reminder_enabled: boolean;
  follow_up_days: number;
}

const defaultConfig: AIConfig = {
  days_without_contact_alert: 7,
  days_without_contact_enabled: true,
  group_by_location_enabled: true,
  min_leads_for_location_group: 3,
  location_radius_km: 10,
  callback_reminder_enabled: true,
  callback_reminder_hours_before: 1,
  priority_leads_enabled: true,
  high_value_threshold: 1000,
  new_leads_alert_enabled: true,
  new_leads_check_hours: 24,
  follow_up_reminder_enabled: true,
  follow_up_days: 3
};

export const LeadsAIConfig: React.FC<LeadsAIConfigProps> = ({
  open,
  onOpenChange,
  companyId
}) => {
  const [config, setConfig] = useState<AIConfig>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open, companyId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('leads_ai_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          days_without_contact_alert: data.days_without_contact_alert ?? 7,
          days_without_contact_enabled: data.days_without_contact_enabled ?? true,
          group_by_location_enabled: data.group_by_location_enabled ?? true,
          min_leads_for_location_group: data.min_leads_for_location_group ?? 3,
          location_radius_km: data.location_radius_km ?? 10,
          callback_reminder_enabled: data.callback_reminder_enabled ?? true,
          callback_reminder_hours_before: data.callback_reminder_hours_before ?? 1,
          priority_leads_enabled: data.priority_leads_enabled ?? true,
          high_value_threshold: Number(data.high_value_threshold) || 1000,
          new_leads_alert_enabled: data.new_leads_alert_enabled ?? true,
          new_leads_check_hours: data.new_leads_check_hours ?? 24,
          follow_up_reminder_enabled: data.follow_up_reminder_enabled ?? true,
          follow_up_days: data.follow_up_days ?? 3
        });
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
      toast.error('Erro ao carregar configuração');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilizador não autenticado');

      const configData = {
        user_id: user.id,
        organization_id: companyId || null,
        days_without_contact_alert: config.days_without_contact_alert,
        days_without_contact_enabled: config.days_without_contact_enabled,
        group_by_location_enabled: config.group_by_location_enabled,
        min_leads_for_location_group: config.min_leads_for_location_group,
        location_radius_km: config.location_radius_km,
        callback_reminder_enabled: config.callback_reminder_enabled,
        callback_reminder_hours_before: config.callback_reminder_hours_before,
        priority_leads_enabled: config.priority_leads_enabled,
        high_value_threshold: config.high_value_threshold,
        new_leads_alert_enabled: config.new_leads_alert_enabled,
        new_leads_check_hours: config.new_leads_check_hours,
        follow_up_reminder_enabled: config.follow_up_reminder_enabled,
        follow_up_days: config.follow_up_days,
        updated_at: new Date().toISOString()
      };

      if (config.id) {
        const { error } = await supabase
          .from('leads_ai_config')
          .update(configData as any)
          .eq('id', config.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('leads_ai_config')
          .insert(configData as any);
        
        if (error) throw error;
      }

      toast.success('Configuração guardada com sucesso');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving AI config:', error);
      toast.error('Erro ao guardar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({ ...defaultConfig, id: config.id });
    toast.info('Configuração reposta para valores padrão');
  };

  const updateConfig = (key: keyof AIConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const configSections = [
    {
      title: 'Agrupamento por Localização',
      description: 'Agrupa leads próximas para otimizar deslocações',
      icon: <MapPin className="h-4 w-4" />,
      color: 'text-blue-600',
      enabled: config.group_by_location_enabled,
      enabledKey: 'group_by_location_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Mínimo de leads para sugerir agrupamento',
          key: 'min_leads_for_location_group' as keyof AIConfig,
          type: 'number',
          min: 2,
          max: 20
        },
        {
          label: 'Raio de proximidade (km)',
          key: 'location_radius_km' as keyof AIConfig,
          type: 'number',
          min: 1,
          max: 100
        }
      ]
    },
    {
      title: 'Leads sem Contacto',
      description: 'Alerta para leads não contactadas há muito tempo',
      icon: <Clock className="h-4 w-4" />,
      color: 'text-orange-600',
      enabled: config.days_without_contact_enabled,
      enabledKey: 'days_without_contact_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Dias sem contacto para alertar',
          key: 'days_without_contact_alert' as keyof AIConfig,
          type: 'number',
          min: 1,
          max: 90
        }
      ]
    },
    {
      title: 'Callbacks',
      description: 'Lembrete de chamadas agendadas para retornar',
      icon: <Phone className="h-4 w-4" />,
      color: 'text-purple-600',
      enabled: config.callback_reminder_enabled,
      enabledKey: 'callback_reminder_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Horas antes para lembrar',
          key: 'callback_reminder_hours_before' as keyof AIConfig,
          type: 'number',
          min: 0,
          max: 24
        }
      ]
    },
    {
      title: 'Novas Leads',
      description: 'Destaca leads recentes que precisam de atenção',
      icon: <TrendingUp className="h-4 w-4" />,
      color: 'text-green-600',
      enabled: config.new_leads_alert_enabled,
      enabledKey: 'new_leads_alert_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Considerar "nova" nas últimas X horas',
          key: 'new_leads_check_hours' as keyof AIConfig,
          type: 'number',
          min: 1,
          max: 168
        }
      ]
    },
    {
      title: 'Follow-up',
      description: 'Sugere follow-up para leads contactadas',
      icon: <Calendar className="h-4 w-4" />,
      color: 'text-yellow-600',
      enabled: config.follow_up_reminder_enabled,
      enabledKey: 'follow_up_reminder_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Dias após contacto para sugerir follow-up',
          key: 'follow_up_days' as keyof AIConfig,
          type: 'number',
          min: 1,
          max: 30
        }
      ]
    },
    {
      title: 'Leads Prioritárias',
      description: 'Destaca leads de alto valor',
      icon: <TrendingUp className="h-4 w-4" />,
      color: 'text-red-600',
      enabled: config.priority_leads_enabled,
      enabledKey: 'priority_leads_enabled' as keyof AIConfig,
      fields: [
        {
          label: 'Valor mínimo para considerar prioritária (€)',
          key: 'high_value_threshold' as keyof AIConfig,
          type: 'number',
          min: 0,
          max: 100000
        }
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            Configuração Leads AI
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <OlyviaLoader size={40} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Configure os alertas e sugestões inteligentes que aparecem ao aceder às leads.
              </p>
            </div>

            {configSections.map((section, index) => (
              <Card key={index} className={!section.enabled ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={section.color}>{section.icon}</div>
                      <div>
                        <CardTitle className="text-base">{section.title}</CardTitle>
                        <CardDescription className="text-xs">
                          {section.description}
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={section.enabled}
                      onCheckedChange={(checked) => updateConfig(section.enabledKey, checked)}
                    />
                  </div>
                </CardHeader>
                {section.enabled && (
                  <CardContent className="pt-0">
                    <div className="grid gap-3">
                      {section.fields.map((field, fieldIndex) => (
                        <div key={fieldIndex} className="flex items-center gap-3">
                          <Label className="flex-1 text-sm">{field.label}</Label>
                          <Input
                            type="number"
                            className="w-24"
                            min={field.min}
                            max={field.max}
                            value={config[field.key] as number}
                            onChange={(e) => updateConfig(field.key, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            <Separator />

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Repor Padrão
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'A guardar...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
