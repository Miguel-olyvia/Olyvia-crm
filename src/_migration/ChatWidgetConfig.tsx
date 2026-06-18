import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  MessageCircle, 
  Save,
  Settings2,
  ExternalLink,
  Users,
  FileText,
  Calendar,
  Phone,
  MapPin,
  MessageSquare
} from 'lucide-react';
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

interface ChatWidgetConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
}

interface InitialOption {
  key: string;
  label: string;
  action: 'lead_capture' | 'client_lookup';
}

interface WidgetConfig {
  id?: string;
  widget_open_by_default: boolean;
  brand_name: string;
  is_active: boolean;
  // New flow configuration
  client_mode_enabled: boolean;
  client_validation_fields: string[];
  show_proposals: boolean;
  show_visits: boolean;
  welcome_message: string;
  client_question: string;
  new_client_cta: string;
  client_not_found_message: string;
  client_found_message: string;
  // Initial question with options
  initial_question: string;
  initial_options: InitialOption[];
  // Fallback contact
  fallback_contact_message: string;
  fallback_contact_phone: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  widget_open_by_default: false,
  brand_name: '',
  is_active: true,
  client_mode_enabled: true,
  client_validation_fields: ['phone', 'postal_code', 'locality'],
  show_proposals: true,
  show_visits: true,
  welcome_message: 'Olá! 👋 Bem-vindo(a)!',
  client_question: 'Já é nosso cliente?',
  new_client_cta: 'Quer receber um orçamento gratuito e sem compromisso? 😊',
  client_not_found_message: 'Não encontrámos nenhum registo com esses dados. Quer pedir um orçamento gratuito?',
  client_found_message: 'Encontrámos o seu registo! Aqui estão as informações:',
  initial_question: 'Como posso ajudar hoje?',
  initial_options: [
    { key: 'new_quote', label: 'Quero um orçamento gratuito', action: 'lead_capture' },
    { key: 'check_visit', label: 'Saber sobre a minha visita técnica', action: 'client_lookup' }
  ],
  fallback_contact_message: 'Se precisar de ajuda adicional, pode sempre ligar-nos para {phone}. Estamos aqui para ajudar! 😊',
  fallback_contact_phone: ''
};

export const ChatWidgetConfig: React.FC<ChatWidgetConfigProps> = ({
  open,
  onOpenChange,
  companyId
}) => {
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && companyId) {
      loadConfig();
    }
  }, [open, companyId]);

  const loadConfig = async () => {
    if (!companyId) return;
    
    setLoading(true);
    try {
      // organization_id renamed from company_id — types.ts not yet regenerated
      const { data, error } = await (supabase as any)
        .from('company_ai_knowledge')
        .select('*')
        .eq('organization_id', companyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const row = data as any;
        setConfig({
          id: row.id,
          widget_open_by_default: row.widget_open_by_default ?? false,
          brand_name: row.brand_name ?? '',
          is_active: row.is_active ?? true,
          client_mode_enabled: row.client_mode_enabled ?? true,
          client_validation_fields: (row.client_validation_fields as string[]) ?? ['phone', 'postal_code', 'locality'],
          show_proposals: row.show_proposals ?? true,
          show_visits: row.show_visits ?? true,
          welcome_message: row.welcome_message ?? DEFAULT_CONFIG.welcome_message,
          client_question: row.client_question ?? DEFAULT_CONFIG.client_question,
          new_client_cta: row.new_client_cta ?? DEFAULT_CONFIG.new_client_cta,
          client_not_found_message: row.client_not_found_message ?? DEFAULT_CONFIG.client_not_found_message,
          client_found_message: row.client_found_message ?? DEFAULT_CONFIG.client_found_message,
          initial_question: row.initial_question ?? DEFAULT_CONFIG.initial_question,
          initial_options: (row.initial_options as unknown as InitialOption[]) ?? DEFAULT_CONFIG.initial_options,
          fallback_contact_message: row.fallback_contact_message ?? DEFAULT_CONFIG.fallback_contact_message,
          fallback_contact_phone: row.fallback_contact_phone ?? DEFAULT_CONFIG.fallback_contact_phone
        });
      }
    } catch (error) {
      console.error('Error loading widget config:', error);
      toast.error('Erro ao carregar configuração do widget');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error('Empresa não selecionada');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Utilizador não autenticado');

      const updateData = {
        widget_open_by_default: config.widget_open_by_default,
        client_mode_enabled: config.client_mode_enabled,
        client_validation_fields: config.client_validation_fields,
        show_proposals: config.show_proposals,
        show_visits: config.show_visits,
        welcome_message: config.welcome_message,
        client_question: config.client_question,
        new_client_cta: config.new_client_cta,
        client_not_found_message: config.client_not_found_message,
        client_found_message: config.client_found_message,
        initial_question: config.initial_question,
        initial_options: config.initial_options as unknown as any,
        fallback_contact_message: config.fallback_contact_message,
        fallback_contact_phone: config.fallback_contact_phone,
        updated_at: new Date().toISOString()
      };

      if (config.id) {
        const { error } = await supabase
          .from('company_ai_knowledge')
          .update(updateData)
          .eq('id', config.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_ai_knowledge')
          .insert({
            organization_id: companyId,
            brand_name: config.brand_name || 'Empresa',
            is_active: true,
            created_by: user.id,
            ...updateData
          } as any);
        
        if (error) throw error;
      }

      toast.success('Configuração guardada com sucesso');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving widget config:', error);
      toast.error('Erro ao guardar configuração');
    } finally {
      setSaving(false);
    }
  };

  const toggleValidationField = (field: string) => {
    setConfig(prev => {
      const current = prev.client_validation_fields;
      if (current.includes(field)) {
        return { ...prev, client_validation_fields: current.filter(f => f !== field) };
      } else {
        return { ...prev, client_validation_fields: [...current, field] };
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            Configuração do Chat Widget
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <OlyviaLoader size={40} />
          </div>
        ) : (
          <Tabs defaultValue="behavior" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="behavior">Comportamento</TabsTrigger>
              <TabsTrigger value="client-flow">Fluxo Cliente</TabsTrigger>
              <TabsTrigger value="messages">Mensagens</TabsTrigger>
            </TabsList>

            <TabsContent value="behavior" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4 text-blue-600" />
                      <div>
                        <CardTitle className="text-base">Abrir Automaticamente</CardTitle>
                        <CardDescription className="text-xs">
                          O widget abre quando a página carrega
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={config.widget_open_by_default}
                      onCheckedChange={(checked) => setConfig(prev => ({ 
                        ...prev, 
                        widget_open_by_default: checked 
                      }))}
                    />
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-600" />
                      <div>
                        <CardTitle className="text-base">Modo Cliente Existente</CardTitle>
                        <CardDescription className="text-xs">
                          Perguntar "É nosso cliente?" no início
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={config.client_mode_enabled}
                      onCheckedChange={(checked) => setConfig(prev => ({ 
                        ...prev, 
                        client_mode_enabled: checked 
                      }))}
                    />
                  </div>
                </CardHeader>
              </Card>
            </TabsContent>

            <TabsContent value="client-flow" className="space-y-4 mt-4">
              {!config.client_mode_enabled ? (
                <div className="p-4 rounded-lg bg-muted/50 text-center text-sm text-muted-foreground">
                  Ative o "Modo Cliente Existente" para configurar este fluxo
                </div>
              ) : (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Campos de Validação
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Dados pedidos para identificar o cliente
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="val-phone"
                          checked={config.client_validation_fields.includes('phone')}
                          onCheckedChange={() => toggleValidationField('phone')}
                        />
                        <Label htmlFor="val-phone" className="flex items-center gap-2 cursor-pointer">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          Telefone
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="val-postal"
                          checked={config.client_validation_fields.includes('postal_code')}
                          onCheckedChange={() => toggleValidationField('postal_code')}
                        />
                        <Label htmlFor="val-postal" className="flex items-center gap-2 cursor-pointer">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          Código Postal
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="val-locality"
                          checked={config.client_validation_fields.includes('locality')}
                          onCheckedChange={() => toggleValidationField('locality')}
                        />
                        <Label htmlFor="val-locality" className="flex items-center gap-2 cursor-pointer">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          Localidade
                        </Label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Informações a Mostrar
                      </CardTitle>
                      <CardDescription className="text-xs">
                        O que mostrar quando o cliente é encontrado
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-proposals" className="flex items-center gap-2 cursor-pointer">
                          <FileText className="h-4 w-4 text-orange-500" />
                          Propostas e Estado
                        </Label>
                        <Switch
                          id="show-proposals"
                          checked={config.show_proposals}
                          onCheckedChange={(checked) => setConfig(prev => ({ 
                            ...prev, 
                            show_proposals: checked 
                          }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-visits" className="flex items-center gap-2 cursor-pointer">
                          <Calendar className="h-4 w-4 text-blue-500" />
                          Próximas Visitas
                        </Label>
                        <Switch
                          id="show-visits"
                          checked={config.show_visits}
                          onCheckedChange={(checked) => setConfig(prev => ({ 
                            ...prev, 
                            show_visits: checked 
                          }))}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="messages" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Pergunta Inicial
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Primeira pergunta com opções de escolha
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="welcome">Mensagem de Boas-vindas</Label>
                    <Textarea
                      id="welcome"
                      value={config.welcome_message}
                      onChange={(e) => setConfig(prev => ({ ...prev, welcome_message: e.target.value }))}
                      placeholder="Olá! 👋 Bem-vindo(a)!"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="initial-q">Pergunta Inicial</Label>
                    <Input
                      id="initial-q"
                      value={config.initial_question}
                      onChange={(e) => setConfig(prev => ({ ...prev, initial_question: e.target.value }))}
                      placeholder="Como posso ajudar hoje?"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Opções de Resposta</Label>
                    {config.initial_options.map((option, index) => (
                      <div key={option.key} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Opção {index + 1}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${option.action === 'lead_capture' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {option.action === 'lead_capture' ? 'Orçamento' : 'Cliente'}
                          </span>
                        </div>
                        <Input
                          value={option.label}
                          onChange={(e) => {
                            const newOptions = [...config.initial_options];
                            newOptions[index] = { ...option, label: e.target.value };
                            setConfig(prev => ({ ...prev, initial_options: newOptions }));
                          }}
                          placeholder="Texto da opção..."
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Mensagens do Fluxo Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="found">Mensagem: Cliente Encontrado</Label>
                    <Textarea
                      id="found"
                      value={config.client_found_message}
                      onChange={(e) => setConfig(prev => ({ ...prev, client_found_message: e.target.value }))}
                      placeholder="Encontrámos o seu registo!"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="not-found">Mensagem: Cliente Não Encontrado</Label>
                    <Textarea
                      id="not-found"
                      value={config.client_not_found_message}
                      onChange={(e) => setConfig(prev => ({ ...prev, client_not_found_message: e.target.value }))}
                      placeholder="Não encontrámos nenhum registo..."
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Mensagens do Fluxo Orçamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-cta">CTA para Novos Clientes</Label>
                    <Textarea
                      id="new-cta"
                      value={config.new_client_cta}
                      onChange={(e) => setConfig(prev => ({ ...prev, new_client_cta: e.target.value }))}
                      placeholder="Quer receber um orçamento gratuito?"
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Contacto de Emergência
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quando o AI não consegue ajudar, sugere este contacto
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fallback-phone">Número de Telefone</Label>
                    <Input
                      id="fallback-phone"
                      value={config.fallback_contact_phone}
                      onChange={(e) => setConfig(prev => ({ ...prev, fallback_contact_phone: e.target.value }))}
                      placeholder="212 482 261"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fallback-msg">Mensagem de Fallback</Label>
                    <Textarea
                      id="fallback-msg"
                      value={config.fallback_contact_message}
                      onChange={(e) => setConfig(prev => ({ ...prev, fallback_contact_message: e.target.value }))}
                      placeholder="Use {phone} para inserir o número"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 rounded">{'{phone}'}</code> para inserir o número automaticamente
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <Separator className="my-2" />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
