import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Webhook, Mail, FileText, Globe, Code, FileCode, Link } from "lucide-react";

export default function DocsIntegrations() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Integrações</h1>
          <p className="text-muted-foreground mt-2">
            Integrações disponíveis e como configurá-las
          </p>
        </div>

        <Separator />

        {/* API de Leads - Principal */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              API de Leads (Webhook)
              <Badge className="ml-2">Principal</Badge>
            </CardTitle>
            <CardDescription>
              Endpoint para receção de leads de fontes externas (websites, landing pages, formulários)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="api" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="api">API REST</TabsTrigger>
                <TabsTrigger value="script">Script Embed</TabsTrigger>
                <TabsTrigger value="iframe">iFrame</TabsTrigger>
              </TabsList>

              <TabsContent value="api" className="space-y-4">
                <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-sm">
{`POST /functions/v1/insert-lead
Headers:
  X-API-Key: olv_your_api_key_here
  Content-Type: application/json

{
  "first_name": "João",
  "last_name": "Silva",
  "email": "joao@exemplo.pt",
  "phone": "912345678",
  "source": "Website Principal",
  "campaign_id": "uuid-da-campanha",
  "company_id": "uuid-da-empresa",
  "business_unit_id": "uuid-da-unidade",
  "notes": "Interessado em produto X",
  "custom_fields": {
    "tipo_servico": "Remodelação WC",
    "urgencia": "Alta"
  },
  "auto_schedule": true,
  "schedule_options": {
    "title": "Visita Comercial",
    "duration_minutes": 60,
    "preferred_date": "2026-01-25"
  }
}`}
                  </pre>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Campos Obrigatórios
                    </h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li><code>first_name</code> - Primeiro nome</li>
                      <li><code>last_name</code> - Último nome</li>
                    </ul>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Campos de Tracking
                    </h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li><code className="text-primary font-semibold">source</code> - Origem da lead *</li>
                      <li><code>campaign_id</code> - ID da campanha</li>
                      <li><code>company_id</code> - ID da empresa</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
                    ⚠️ Importante: Campo Source
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    O campo <code>source</code> deve corresponder ao nome exato de uma Source configurada em 
                    <strong> Marketing → Sources</strong>. Se não for enviado ou não existir, a lead aparecerá sem source atribuída.
                  </p>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Resposta de Sucesso (201)</h4>
                  <pre className="text-sm">
{`{
  "success": true,
  "lead_id": "uuid-gerado",
  "message": "Lead created successfully",
  "schedule": {
    "success": true,
    "item_id": "uuid-agendamento",
    "scheduled_start": "2026-01-25T10:00:00Z"
  }
}`}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="script" className="space-y-4">
                <p className="text-muted-foreground">
                  Incorpore um formulário de lead diretamente no seu website usando JavaScript.
                </p>
                <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-sm">
{`<script src="${window.location.origin}/embed.js"></script>
<div 
  id="olyvia-lead-form"
  data-form-id="uuid-do-formulario"
  data-source="Landing Page Verão"
  data-campaign-id="uuid-da-campanha"
></div>

<script>
  OlyviaForms.init({
    formId: 'uuid-do-formulario',
    source: 'Landing Page Verão',
    campaignId: 'uuid-da-campanha',
    onSuccess: (lead) => {
      console.log('Lead criada:', lead.id);
    }
  });
</script>`}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="iframe" className="space-y-4">
                <p className="text-muted-foreground">
                  Use um iFrame para incorporar o formulário completo.
                </p>
                <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                  <pre className="text-sm">
{`<iframe
  src="${window.location.origin}/form/{form_id}?source=Website&campaign_id={campaign_id}"
  width="100%" 
  height="600" 
  frameborder="0"
  allow="geolocation"
></iframe>`}
                  </pre>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2">Query Parameters Disponíveis</h4>
                  <ul className="text-sm space-y-2 text-muted-foreground">
                    <li><code>source</code> - Nome da source (ex: "Facebook Ads")</li>
                    <li><code>campaign_id</code> - UUID da campanha</li>
                    <li><code>utm_source</code> - UTM source para tracking</li>
                    <li><code>utm_medium</code> - UTM medium para tracking</li>
                    <li><code>utm_campaign</code> - UTM campaign para tracking</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email (SMTP)
            </CardTitle>
            <CardDescription>
              Configuração de envio de emails por organização (modelo unificado)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Cada nó da hierarquia organizacional pode configurar o seu próprio servidor SMTP para envio de emails 
              (orçamentos, notificações, confirmações de agendamento, etc.).
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Tabela de Configuração</h4>
              <ul className="text-sm space-y-1">
                <li><code>organization_smtp_settings</code> - Config SMTP por organização (empresa, unidade, área)</li>
              </ul>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Edge Function: send-email</h4>
              <p className="text-sm text-muted-foreground">
                Endpoint para envio de emails. Procura config SMTP na organização do contexto, subindo na hierarquia se necessário.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* PDF */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Geração de PDF
            </CardTitle>
            <CardDescription>
              React-PDF para geração de documentos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              O sistema utiliza <code>@react-pdf/renderer</code> para geração de PDFs no cliente.
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Componentes:</h4>
              <ul className="text-sm space-y-1">
                <li><code>QuotePDFDocument</code> - Template de orçamento</li>
                <li><code>PurchaseOrderPDFDocument</code> - Template de ordem de compra</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Códigos Postais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              API de Códigos Postais
            </CardTitle>
            <CardDescription>
              Lookup automático de moradas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Integração com API externa para preenchimento automático de moradas 
              a partir do código postal português.
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Hook: usePostalCodeLookup</h4>
              <p className="text-sm text-muted-foreground">
                Retorna automaticamente cidade, distrito e município com base no código postal.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Formulários */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Formulários Públicos
            </CardTitle>
            <CardDescription>
              Sistema de formulários independente de campanhas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Os formulários são geridos de forma independente e podem ser associados a múltiplas campanhas.
            </p>
            
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <h4 className="font-medium">Workflow</h4>
              <ol className="text-sm space-y-2 list-decimal list-inside">
                <li>Criar formulário em <strong>Marketing → Formulários</strong></li>
                <li>Configurar campos, branding e validações</li>
                <li>Associar formulário a uma ou mais campanhas</li>
                <li>Usar link público ou embed via iFrame/API</li>
              </ol>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Links de Formulário</h4>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>
                  <code>/form/{'{form_id}'}</code> - Acesso direto ao formulário
                </li>
                <li>
                  <code>/campaign/{'{campaign_id}'}</code> - Formulário via campanha (usa form associado)
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle>Storage (Ficheiros)</CardTitle>
            <CardDescription>
              Armazenamento de ficheiros na cloud
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Buckets disponíveis:</h4>
              <div className="grid gap-2">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <code className="text-sm">company-logos</code>
                    <Badge variant="outline">Público</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Logos das empresas
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <code className="text-sm">campaign-assets</code>
                    <Badge variant="outline">Público</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imagens e assets de campanhas/formulários
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
