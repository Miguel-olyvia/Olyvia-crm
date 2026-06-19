import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Code, RefreshCw, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function TestWidget() {
  const [formId, setFormId] = useState("a1b2c3d4-1111-2222-3333-444455556666");
  const [primaryColor, setPrimaryColor] = useState("#1e3a5f");
  const [title, setTitle] = useState("Assistente Mudelar");
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  
  const embedCode = `<script src="https://olyvia-ai.com/embed/chat-widget.js"
  data-form-id="${formId}"
  data-color="${primaryColor}"
  data-title="${title}"></script>`;

  const loadWidget = () => {
    // Remove existing widget elements
    const existingBtn = document.querySelector('.olyvia-widget-btn');
    const existingWindow = document.querySelector('.olyvia-chat-window');
    const existingScript = document.getElementById('olyvia-widget-script');
    
    if (existingBtn) existingBtn.remove();
    if (existingWindow) existingWindow.remove();
    if (existingScript) existingScript.remove();
    
    // Create and inject the script
    const script = document.createElement('script');
    script.id = 'olyvia-widget-script';
    script.src = '/embed/chat-widget.js';
    script.setAttribute('data-form-id', formId);
    script.setAttribute('data-color', primaryColor);
    script.setAttribute('data-title', title);
    
    document.body.appendChild(script);
    setWidgetLoaded(true);
    toast.success("Widget carregado! Clique no botão no canto inferior direito.");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const existingBtn = document.querySelector('.olyvia-widget-btn');
      const existingWindow = document.querySelector('.olyvia-chat-window');
      const existingScript = document.getElementById('olyvia-widget-script');
      
      if (existingBtn) existingBtn.remove();
      if (existingWindow) existingWindow.remove();
      if (existingScript) existingScript.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <MessageCircle className="h-8 w-8 text-primary" />
            Teste do Chat Widget
          </h1>
          <p className="text-gray-600 mt-2">
            Teste o widget de chat AI antes de o incorporar no seu site
          </p>
        </div>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Configuração do Widget
            </CardTitle>
            <CardDescription>
              Configure os parâmetros e carregue o widget para testar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="formId">ID do Formulário</Label>
                <Input 
                  id="formId"
                  value={formId} 
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="UUID do formulário"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Cor Principal</Label>
                <div className="flex gap-2">
                  <Input 
                    id="color"
                    type="color"
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-14 h-10 p-1 cursor-pointer"
                  />
                  <Input 
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#1e3a5f"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Título do Chat</Label>
                <Input 
                  id="title"
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Assistente Virtual"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={loadWidget} className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                {widgetLoaded ? "Recarregar Widget" : "Carregar Widget"}
              </Button>
            </div>

            {widgetLoaded && (
              <p className="text-sm text-green-600 text-center">
                ✓ Widget ativo! Procure o botão de chat no canto inferior direito da página.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Embed Code */}
        <Card>
          <CardHeader>
            <CardTitle>Código para Incorporar</CardTitle>
            <CardDescription>
              Cole este código antes do {"</body>"} no seu site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">
                {embedCode}
              </pre>
              <Button 
                variant="secondary" 
                size="sm" 
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(embedCode)}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Como Testar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Configure os parâmetros acima (ID do formulário, cor, título)</p>
            <p>2. Clique em "Carregar Widget"</p>
            <p>3. Um botão de chat aparecerá no canto inferior direito</p>
            <p>4. Clique no botão para abrir o chat e testar a conversa com a IA</p>
            <p>5. A IA irá guiar o utilizador através do formulário de forma conversacional</p>
          </CardContent>
        </Card>

        {/* Demo Area */}
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle>Área de Demonstração</CardTitle>
            <CardDescription>
              O widget aparece sobreposto a esta área (canto inferior direito)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="min-h-[400px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-400">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p>O chat widget aparecerá no canto inferior direito da página</p>
                <p className="text-sm mt-2">após clicar em "Carregar Widget"</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
