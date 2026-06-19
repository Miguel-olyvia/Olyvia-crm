import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, ExternalLink, Code } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function TestIframe() {
  const [formId, setFormId] = useState("a1b2c3d4-1111-2222-3333-444455556666");
  const [iframeHeight, setIframeHeight] = useState("auto");
  const [actualHeight, setActualHeight] = useState<number>(1500); // Start with larger height to avoid scroll
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const formUrl = `${window.location.origin}/lead-form/${formId}`;
  
  // Listen for height messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'IFRAME_RESIZE' && event.data.height) {
        setActualHeight(event.data.height);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  const displayHeight = iframeHeight === 'auto' ? actualHeight : parseInt(iframeHeight) || 800;
  
  const iframeCode = `<!-- Iframe com auto-resize -->
<div id="form-container">
  <iframe 
    id="lead-form-iframe"
    src="${formUrl}" 
    width="100%" 
    height="${displayHeight}px" 
    frameborder="0" 
    style="border: none; max-width: 100%;"
    allow="geolocation"
  ></iframe>
</div>

<script>
// Auto-resize listener
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'IFRAME_RESIZE') {
    var iframe = document.getElementById('lead-form-iframe');
    if (iframe && event.data.height) {
      iframe.style.height = event.data.height + 'px';
    }
  }
  // GTM events from iframe
  if (event.data && event.data.type === 'GTM_EVENT') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: event.data.event,
      ...event.data.data,
      source: 'iframe_form'
    });
  }
});
</script>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Teste de Iframe - Formulário Público</h1>
          <p className="text-gray-600 mt-2">Visualize como o formulário aparece quando incorporado num site externo</p>
        </div>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Configuração
            </CardTitle>
            <CardDescription>Configure os parâmetros do iframe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label htmlFor="height">Altura do Iframe</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    id="height"
                    value={iframeHeight} 
                    onChange={(e) => setIframeHeight(e.target.value)}
                    placeholder="auto ou valor em px"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Atual: {actualHeight}px
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use "auto" para altura dinâmica ou um número fixo em pixels
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>URL do Formulário</Label>
              <div className="flex gap-2">
                <Input value={formUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(formUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={formUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Código do Iframe</Label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">
                  {iframeCode}
                </pre>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(iframeCode)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização do Iframe</CardTitle>
            <CardDescription>Assim aparecerá o formulário quando incorporado num site</CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className="border-4 border-dashed border-gray-300 rounded-lg bg-white"
              style={{ overflow: 'hidden' }}
            >
              <iframe 
                ref={iframeRef}
                id="lead-form-iframe"
                src={formUrl}
                width="100%"
                height={`${displayHeight}px`}
                frameBorder="0"
                scrolling="no"
                style={{ border: "none", display: "block", transition: "height 0.3s ease", overflow: "hidden" }}
                allow="geolocation"
                title="Formulário de Lead"
              />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
