import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Code, Palette, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DocsEmbedWidget() {
  const [formId, setFormId] = useState("YOUR_FORM_ID");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");
  const [title, setTitle] = useState("Assistente Virtual");
  const [welcomeMessage, setWelcomeMessage] = useState("Olá! 👋 Posso ajudá-lo a preencher o formulário. Quer começar?");
  
  // Use the official Olyvia domain
  const defaultDomain = "https://olyvia-ai.com";
  const [customDomain, setCustomDomain] = useState(defaultDomain);

  const generateEmbedCode = () => {
    let code = `<script src="${customDomain}/embed/chat-widget.js"
  data-form-id="${formId}"`;
    
    if (primaryColor !== "#7c3aed") {
      code += `\n  data-color="${primaryColor}"`;
    }
    if (title !== "Assistente Virtual") {
      code += `\n  data-title="${title}"`;
    }
    if (welcomeMessage !== "Olá! 👋 Posso ajudá-lo a preencher o formulário. Quer começar?") {
      code += `\n  data-welcome="${welcomeMessage}"`;
    }
    
    code += `></script>`;
    return code;
  };

  const copyCode = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    toast.success("Código copiado!");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Widget de Chat Embeddable</h1>
        <p className="text-muted-foreground">
          Adicione um assistente de chat ao seu site para recolher leads de forma conversacional.
        </p>
      </div>

      <div className="space-y-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="domain">Domínio</Label>
                <Input
                  id="domain"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder={window.location.origin}
                />
                <p className="text-xs text-muted-foreground">
                  Use o seu domínio personalizado se tiver um configurado
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="formId">ID do Formulário *</Label>
                <Input
                  id="formId"
                  value={formId}
                  onChange={(e) => setFormId(e.target.value)}
                  placeholder="a1b2c3d4-..."
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
                    placeholder="#7c3aed"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="title">Título do Widget</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Assistente Virtual"
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="welcome">Mensagem de Boas-Vindas</Label>
                <Input
                  id="welcome"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="Olá! 👋 ..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Generated Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Código para Embed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{generateEmbedCode()}</code>
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={copyCode}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Cole este código antes do <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> do seu site.
            </p>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Funcionalidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Widget flutuante</strong> - Aparece no canto inferior direito do seu site</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Conversação guiada</strong> - O bot pergunta campo a campo de forma natural</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Validação em tempo real</strong> - Email, telefone e campos obrigatórios</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Totalmente personalizável</strong> - Cores, título e mensagens</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Leve e rápido</strong> - JavaScript puro, sem dependências</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500">✓</span>
                <span><strong>Mobile-friendly</strong> - Adapta-se a qualquer tamanho de ecrã</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Attributes Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Atributos Disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Atributo</th>
                    <th className="text-left py-2 pr-4">Obrigatório</th>
                    <th className="text-left py-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">data-form-id</code></td>
                    <td className="py-2 pr-4">Sim</td>
                    <td className="py-2">UUID do formulário</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">data-color</code></td>
                    <td className="py-2 pr-4">Não</td>
                    <td className="py-2">Cor principal (hex). Default: #7c3aed</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">data-title</code></td>
                    <td className="py-2 pr-4">Não</td>
                    <td className="py-2">Título no header do chat</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">data-welcome</code></td>
                    <td className="py-2 pr-4">Não</td>
                    <td className="py-2">Mensagem inicial do assistente</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
