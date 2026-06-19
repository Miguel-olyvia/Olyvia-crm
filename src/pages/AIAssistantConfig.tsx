import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, RefreshCw, Bot, MessageSquare, Sparkles } from "lucide-react";

interface AIConfig {
  id: string;
  config_key: string;
  config_value: string;
  description: string | null;
}

export default function AIAssistantConfig() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<AIConfig[]>([]);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_assistant_config")
        .select("*")
        .order("config_key");

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error("Error loading configs:", error);
      toast({ title: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (config: AIConfig) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ai_assistant_config")
        .update({ config_value: config.config_value })
        .eq("id", config.id);

      if (error) throw error;
      toast({ title: "Configuração guardada com sucesso! ✅" });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({ title: "Erro ao guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key: string, value: string) => {
    setConfigs(prev => prev.map(c => c.config_key === key ? { ...c, config_value: value } : c));
  };

  const getConfig = (key: string) => configs.find(c => c.config_key === key);

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  const systemPromptConfig = getConfig("system_prompt");
  const welcomeMessageConfig = getConfig("welcome_message");
  const welcomeDescConfig = getConfig("welcome_description");
  const suggestionsConfig = getConfig("quick_suggestions");

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Configuração do Assistente IA
            </h1>
            <p className="text-muted-foreground">
              Configure os prompts e mensagens da Olyvia
            </p>
          </div>
          <Button onClick={loadConfigs} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Recarregar
          </Button>
        </div>

        <Tabs defaultValue="prompt" className="space-y-4">
          <TabsList>
            <TabsTrigger value="prompt">
              <Sparkles className="h-4 w-4 mr-2" />
              Prompt do Sistema
            </TabsTrigger>
            <TabsTrigger value="messages">
              <MessageSquare className="h-4 w-4 mr-2" />
              Mensagens
            </TabsTrigger>
          </TabsList>

          {/* System Prompt Tab */}
          <TabsContent value="prompt">
            <Card>
              <CardHeader>
                <CardTitle>Prompt do Sistema</CardTitle>
                <CardDescription>
                  Este é o prompt principal que define o comportamento e personalidade da Olyvia.
                  Aqui podes definir como ela responde, que links sugere, e as regras de resposta.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {systemPromptConfig && (
                  <>
                    <Textarea
                      value={systemPromptConfig.config_value}
                      onChange={(e) => updateConfig("system_prompt", e.target.value)}
                      rows={20}
                      className="font-mono text-sm"
                      placeholder="Prompt do sistema..."
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={() => handleSave(systemPromptConfig)} 
                        disabled={saving}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? "A guardar..." : "Guardar Prompt"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-4">
            {/* Welcome Message */}
            <Card>
              <CardHeader>
                <CardTitle>Mensagem de Boas-vindas</CardTitle>
                <CardDescription>
                  A primeira mensagem que aparece quando o utilizador abre o assistente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {welcomeMessageConfig && (
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={welcomeMessageConfig.config_value}
                      onChange={(e) => updateConfig("welcome_message", e.target.value)}
                      placeholder="Olá! Sou a Olyvia 👋"
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={() => handleSave(welcomeMessageConfig)} 
                        disabled={saving}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Welcome Description */}
            <Card>
              <CardHeader>
                <CardTitle>Descrição de Boas-vindas</CardTitle>
                <CardDescription>
                  Texto que aparece abaixo do título de boas-vindas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {welcomeDescConfig && (
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={welcomeDescConfig.config_value}
                      onChange={(e) => updateConfig("welcome_description", e.target.value)}
                      rows={2}
                      placeholder="Posso ajudar-te a criar leads, propostas..."
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={() => handleSave(welcomeDescConfig)} 
                        disabled={saving}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle>Sugestões Rápidas</CardTitle>
                <CardDescription>
                  Botões de sugestão que aparecem no ecrã inicial. Separa cada sugestão com |
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {suggestionsConfig && (
                  <div className="space-y-2">
                    <Label>Sugestões (separadas por |)</Label>
                    <Textarea
                      value={suggestionsConfig.config_value}
                      onChange={(e) => updateConfig("quick_suggestions", e.target.value)}
                      rows={3}
                      placeholder="Como criar um lead?|Como fazer uma proposta?|Como configurar campanhas?"
                    />
                    <p className="text-xs text-muted-foreground">
                      Exemplo: Como criar um lead?|Como fazer uma proposta?|Como configurar campanhas?
                    </p>
                    <div className="flex justify-end">
                      <Button 
                        onClick={() => handleSave(suggestionsConfig)} 
                        disabled={saving}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
