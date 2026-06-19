import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Copy, 
  Check, 
  Code, 
  Frame, 
  Globe, 
  Webhook,
  ExternalLink,
  FileJson,
  Braces,
  Play,
  AlertCircle,
  Loader2,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TrackingPixelsManager } from "./TrackingPixelsManager";
import { LANGUAGES } from "@/constants/languages";
import { DEFAULT_FORM_LOCALE, readI18nConfig } from "@/lib/formI18n";

interface FormIntegrationsTabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
  formSlug: string;
  companyId?: string;
}

interface Campaign {
  id: string;
  name: string;
  source_id: string | null;
  campaign_sources?: CampaignSource[];
}

interface CampaignSource {
  source_id: string;
  is_default: boolean;
  lead_sources: LeadSource | null;
}

interface LeadSource {
  id: string;
  name: string;
}

export function FormIntegrationsTab({ 
  open, 
  onOpenChange, 
  formId, 
  formName,
  formSlug,
  companyId
}: FormIntegrationsTabProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [apiKey, setApiKey] = useState("olv_your_api_key_here");
  
  // New state for campaigns and sources
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignSources, setCampaignSources] = useState<LeadSource[]>([]);
  const [allSources, setAllSources] = useState<LeadSource[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [defaultLocale, setDefaultLocale] = useState(DEFAULT_FORM_LOCALE);
  const [activeLocales, setActiveLocales] = useState<string[]>([DEFAULT_FORM_LOCALE]);
  
  // Use the published URL for public forms (not the preview URL which requires auth)
  const publishedUrl = "https://olyvia.lovable.app";
  const baseUrl = publishedUrl;
  const projectId = "jfuyxszlgetnmdwfdmgw";
  const apiUrl = `https://${projectId}.supabase.co/functions/v1`;

  // Load campaigns associated with the form
  useEffect(() => {
    if (open && formId) {
      loadCampaigns();
      loadAllSources();
      loadFormLocales();
    }
  }, [open, formId]);

  // Load campaign sources when campaign changes
  useEffect(() => {
    const loadCampaignSources = async () => {
      if (campaignId) {
        const { data, error } = await supabase
          .from("campaign_sources" as any)
          .select("source_id, is_default, lead_sources(id, name)")
          .eq("campaign_id", campaignId);
        
        if (!error && data) {
          const sources = (data as any[]).map((s: any) => s.lead_sources).filter(Boolean);
          setCampaignSources(sources);
          // Auto-select the default source
          const defaultSource = (data as any[]).find((s: any) => s.is_default);
          if (defaultSource?.lead_sources) {
            setSelectedSource(defaultSource.lead_sources.id);
          } else if (sources.length > 0) {
            setSelectedSource(sources[0].id);
          }
        } else {
          // Fallback to old source_id if no campaign_sources
          const selectedCampaign = campaigns.find(c => c.id === campaignId);
          if (selectedCampaign?.source_id) {
            setSelectedSource(selectedCampaign.source_id);
            const source = allSources.find(s => s.id === selectedCampaign.source_id);
            if (source) {
              setCampaignSources([source]);
            }
          } else {
            setCampaignSources([]);
          }
        }
      } else {
        setSelectedSource("");
        setCampaignSources([]);
      }
    };
    loadCampaignSources();
  }, [campaignId, campaigns, allSources]);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, source_id")
        .eq("form_id", formId)
        .order("name");

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const loadFormLocales = async () => {
    try {
      const { data, error } = await supabase
        .from("forms")
        .select("settings")
        .eq("id", formId)
        .maybeSingle();

      if (error) throw error;
      const cfg = readI18nConfig(data?.settings);
      const def = (cfg.default_locale || DEFAULT_FORM_LOCALE).toLowerCase();
      const locales = [def, ...(cfg.enabled_locales || []).map((l) => l.toLowerCase()).filter((l) => l && l !== def)];
      setDefaultLocale(def);
      setActiveLocales(locales.length ? locales : [DEFAULT_FORM_LOCALE]);
    } catch (error) {
      console.error("Error loading form locales:", error);
      setDefaultLocale(DEFAULT_FORM_LOCALE);
      setActiveLocales([DEFAULT_FORM_LOCALE]);
    }
  };

  const loadAllSources = async () => {
    setLoadingSources(true);
    try {
      const { data, error } = await supabase
        .from("lead_sources")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setAllSources(data || []);
    } catch (error) {
      console.error("Error loading sources:", error);
    } finally {
      setLoadingSources(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copiado para a área de transferência!");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => copyToClipboard(text, id)}
    >
      {copied === id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  const localeLabel = (locale: string) => {
    const language = LANGUAGES.find((l) => l.code === locale);
    return `${language?.name || locale.toUpperCase()}${locale === defaultLocale ? " (principal)" : ""}`;
  };

  const formPathUrl = (locale: string) => {
    const params = new URLSearchParams();
    if (selectedSource) params.set("source", selectedSource);
    if (campaignId) params.set("campaign_id", campaignId);
    params.set("lang", locale);
    return `${baseUrl}/form/${formId}?${params.toString()}`;
  };

  const formQueryUrl = (locale: string) => {
    const params = new URLSearchParams({ form_id: formId, lang: locale });
    return `${baseUrl}/form?${params.toString()}`;
  };

  const primaryLocale = activeLocales[0] || defaultLocale || DEFAULT_FORM_LOCALE;

  // Generate iFrame code
  const iframeCode = `<iframe 
  src="${formPathUrl(primaryLocale)}"
  width="100%" 
  height="700" 
  frameborder="0"
  style="border: none; border-radius: 8px;"
  allow="geolocation"
  title="${formName}"
></iframe>`;

  // Generate JavaScript embed code
  const jsEmbedCode = `<!-- Olyvia Form Embed -->
<div id="olyvia-form-${formSlug}"></div>
<script>
(function() {
  var container = document.getElementById('olyvia-form-${formSlug}');
  var iframe = document.createElement('iframe');
  iframe.src = '${formPathUrl(primaryLocale)}';
  iframe.style.cssText = 'width:100%;height:700px;border:none;border-radius:8px;';
  iframe.allow = 'geolocation';
  iframe.title = '${formName}';
  container.appendChild(iframe);
  
  // Auto-resize listener
  window.addEventListener('message', function(e) {
    if (e.data.type === 'olyvia-form-resize' && e.data.formId === '${formId}') {
      iframe.style.height = e.data.height + 'px';
    }
  });
})();
</script>`;

  // Recommended embed snippet that forwards the host page UTMs / click ids
  // into the form (additive, opt-in). Uses the public Olyvia embed.js.
  const utmEmbedCode = `<!-- Olyvia Form com UTMs (recomendado) -->
<div id="olyvia-form"></div>
<script
  src="${baseUrl}/embed/olyvia-form.js"
  data-form-id="${formId}"
  data-routing="url"${selectedSource ? `\n  data-default-source="${selectedSource}"` : ''}${campaignId ? `\n  data-default-campaign="${campaignId}"` : ''}
  data-lang="${primaryLocale}"
  async></script>`;

  // Generate API code examples
  const apiCodeCurl = `curl -X POST "${apiUrl}/insert-lead" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "first_name": "João",
    "last_name": "Silva",
    "email": "joao@exemplo.pt",
    "phone": "912345678",
    "source": "${selectedSource || 'API'}",
    ${campaignId ? `"campaign_id": "${campaignId}",` : ''}
    "organization_id": "${companyId || 'your_organization_id'}",
    "notes": "Lead via API",
    "custom_fields": {
      "interesse": "Remodelação WC"
    }
  }'`;

  const apiCodeJs = `// JavaScript / Node.js
const response = await fetch('${apiUrl}/insert-lead', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${apiKey}'
  },
  body: JSON.stringify({
    first_name: 'João',
    last_name: 'Silva',
    email: 'joao@exemplo.pt',
    phone: '912345678',
    source: '${selectedSource || 'API'}',
    ${campaignId ? `campaign_id: '${campaignId}',` : ''}
    organization_id: '${companyId || 'your_organization_id'}',
    notes: 'Lead via API',
    custom_fields: {
      interesse: 'Remodelação WC'
    }
  })
});

const data = await response.json();
console.log('Lead created:', data.lead_id);`;

  const apiCodePython = `# Python
import requests

response = requests.post(
    '${apiUrl}/insert-lead',
    headers={
        'Content-Type': 'application/json',
        'X-API-Key': '${apiKey}'
    },
    json={
        'first_name': 'João',
        'last_name': 'Silva',
        'email': 'joao@exemplo.pt',
        'phone': '912345678',
        'source': '${selectedSource || 'API'}',
        ${campaignId ? `'campaign_id': '${campaignId}',` : ''}
        'organization_id': '${companyId || 'your_organization_id'}',
        'notes': 'Lead via API',
        'custom_fields': {
            'interesse': 'Remodelação WC'
        }
    }
)

data = response.json()
print('Lead created:', data['lead_id'])`;

  const apiCodePhp = `<?php
// PHP
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => '${apiUrl}/insert-lead',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-API-Key: ${apiKey}'
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'first_name' => 'João',
        'last_name' => 'Silva',
        'email' => 'joao@exemplo.pt',
        'phone' => '912345678',
        'source' => '${selectedSource || 'API'}',
        ${campaignId ? `'campaign_id' => '${campaignId}',` : ''}
        'organization_id' => '${companyId || 'your_organization_id'}',
        'notes' => 'Lead via API',
        'custom_fields' => [
            'interesse' => 'Remodelação WC'
        ]
    ])
]);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
echo 'Lead created: ' . $data['lead_id'];`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Integrações - {formName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* Config Section */}
          <Card className="mb-4 bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Configuração de Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Campanha</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger>
                    {loadingCampaigns ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground">A carregar...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Selecione uma campanha" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem campanha</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {campaigns.length === 0 && !loadingCampaigns 
                    ? "Nenhuma campanha associada a este formulário" 
                    : "Campanhas associadas a este formulário"}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Source (Origem)</Label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    {loadingSources ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-muted-foreground">A carregar...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Selecione uma source" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem source</SelectItem>
                    {(campaignId && campaignSources.length > 0 ? campaignSources : allSources).map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {campaignId && campaignSources.length > 0 
                    ? "Sources associadas a esta campanha"
                    : "Source para tracking (selecione uma campanha para ver as sources associadas)"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tracking Pixels Section */}
          <Card className="mb-4 bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Pixels de Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrackingPixelsManager formId={formId} />
            </CardContent>
          </Card>

          <Tabs defaultValue="iframe" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="iframe" className="text-xs">
                <Frame className="h-4 w-4 mr-1" />
                iFrame
              </TabsTrigger>
              <TabsTrigger value="embed" className="text-xs">
                <Braces className="h-4 w-4 mr-1" />
                JavaScript
              </TabsTrigger>
              <TabsTrigger value="utm-embed" className="text-xs">
                <Braces className="h-4 w-4 mr-1" />
                UTMs
              </TabsTrigger>
              <TabsTrigger value="api" className="text-xs">
                <Webhook className="h-4 w-4 mr-1" />
                API
              </TabsTrigger>
              <TabsTrigger value="link" className="text-xs">
                <ExternalLink className="h-4 w-4 mr-1" />
                Link Direto
              </TabsTrigger>
            </TabsList>

            {/* iFrame Tab */}
            <TabsContent value="iframe" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Código iFrame</CardTitle>
                  <CardDescription className="text-xs">
                    Cole este código HTML na sua página para incorporar o formulário no idioma principal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {iframeCode}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={iframeCode} id="iframe" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">URLs por idioma</CardTitle>
                  <CardDescription className="text-xs">
                    Use o mesmo form_id e altere apenas o parâmetro lang.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeLocales.map((locale) => {
                    const iframeByLocale = `<iframe src="${formPathUrl(locale)}" width="100%" height="700" frameborder="0" style="border: none; border-radius: 8px;" allow="geolocation" title="${formName}"></iframe>`;
                    return (
                      <div key={locale} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={locale === defaultLocale ? "default" : "secondary"}>{localeLabel(locale)}</Badge>
                          <CopyButton text={iframeByLocale} id={`iframe-${locale}`} />
                        </div>
                        <pre className="bg-zinc-900 text-zinc-100 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                          {iframeByLocale}
                        </pre>
                        <div className="space-y-1 text-xs">
                          <div className="font-mono break-all">{formPathUrl(locale)}</div>
                          <div className="font-mono break-all text-muted-foreground">{formQueryUrl(locale)}</div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Dicas de Implementação</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Ajuste a altura conforme necessário (recomendado: 600-800px)</li>
                        <li>• O formulário é responsivo e adapta-se ao container</li>
                        <li>• Use <code>allow="geolocation"</code> se precisar de localização</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* JavaScript Embed Tab */}
            <TabsContent value="embed" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Código JavaScript</CardTitle>
                  <CardDescription className="text-xs">
                    Script com auto-resize e melhor integração
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {jsEmbedCode}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={jsEmbedCode} id="js-embed" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* UTM Embed Tab (recommended) — additive, opt-in */}
            <TabsContent value="utm-embed" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Embed com UTMs (recomendado)</CardTitle>
                  <CardDescription className="text-xs">
                    Snippet que captura UTMs e click ids (gclid, fbclid, msclkid) da página onde está embebido e envia-os para o formulário e para a lead. Os snippets antigos continuam compatíveis.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {utmEmbedCode}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={utmEmbedCode} id="utm-embed" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Como funciona</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Lê <code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, <code>utm_content</code>, <code>utm_term</code>, <code>utm_id</code>, <code>gclid</code>, <code>fbclid</code>, <code>msclkid</code> da URL atual.</li>
                        <li>• Guarda também <code>landing_page</code> e <code>referrer</code>.</li>
                        <li>• Os <code>data-default-*</code> só são usados como fallback quando a URL não tem esses valores.</li>
                        <li>• Funciona em qualquer site cliente; não substitui snippets antigos já publicados.</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* API Tab */}
            <TabsContent value="api" className="mt-4 space-y-4">
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">API Key Necessária</p>
                      <div className="flex items-center gap-2">
                        <Input
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="olv_..."
                          className="text-xs font-mono"
                        />
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Obtenha a sua API Key em Configurações → Técnico → API Keys
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="curl" className="w-full">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="js">JavaScript</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                  <TabsTrigger value="php">PHP</TabsTrigger>
                </TabsList>

                <TabsContent value="curl">
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {apiCodeCurl}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={apiCodeCurl} id="api-curl" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="js">
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {apiCodeJs}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={apiCodeJs} id="api-js" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="python">
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {apiCodePython}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={apiCodePython} id="api-python" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="php">
                  <div className="relative">
                    <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                      {apiCodePhp}
                    </pre>
                    <div className="absolute top-2 right-2">
                      <CopyButton text={apiCodePhp} id="api-php" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Resposta da API
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg text-xs overflow-x-auto">
{`{
  "success": true,
  "lead_id": "uuid-da-lead-criada",
  "message": "Lead created successfully"
}`}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Direct Link Tab */}
            <TabsContent value="link" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Link Público</CardTitle>
                  <CardDescription className="text-xs">
                    Link direto para o formulário (pode partilhar ou usar em anúncios)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeLocales.map((locale) => (
                    <div key={locale} className="space-y-2 rounded-lg border p-3">
                      <Badge variant={locale === defaultLocale ? "default" : "secondary"}>{localeLabel(locale)}</Badge>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={formPathUrl(locale)} className="font-mono text-xs" />
                        <CopyButton text={formPathUrl(locale)} id={`direct-link-${locale}`} />
                        <Button variant="outline" size="sm" asChild>
                          <a href={formPathUrl(locale)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={formQueryUrl(locale)} className="font-mono text-xs" />
                        <CopyButton text={formQueryUrl(locale)} id={`direct-query-link-${locale}`} />
                      </div>
                    </div>
                  ))}

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Query Parameters Disponíveis</Label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">lang</code>
                        <p className="text-muted-foreground">Idioma do formulário</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">source</code>
                        <p className="text-muted-foreground">Nome da source</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">campaign_id</code>
                        <p className="text-muted-foreground">UUID da campanha</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">utm_source</code>
                        <p className="text-muted-foreground">UTM source</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">utm_medium</code>
                        <p className="text-muted-foreground">UTM medium</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">utm_campaign</code>
                        <p className="text-muted-foreground">UTM campaign</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <code className="text-primary">ref</code>
                        <p className="text-muted-foreground">Referência customizada</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
