import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Copy, 
  Check, 
  Globe, 
  Send, 
  RefreshCw, 
  Database, 
  FileJson, 
  Code2,
  Terminal,
  BookOpen,
  Zap,
  Shield,
  AlertCircle,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { HelpButton } from "@/components/HelpButton";

interface ApiEndpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  auth: "public" | "api_key" | "jwt";
  requestBody?: object;
  responseExample?: object;
  params?: { name: string; type: string; required: boolean; description: string }[];
  headers?: { name: string; value: string; required: boolean; description: string }[];
}

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

const endpoints: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/get-campaign-form",
    title: "Obter Formulário da Campanha",
    description: "Retorna a estrutura completa do formulário de uma campanha, incluindo passos, campos, opções de entidades do sistema, branding e configurações de localização.",
    auth: "public",
    params: [
      { name: "campaign_id", type: "UUID", required: true, description: "ID da campanha" }
    ],
    responseExample: {
      campaign_id: "uuid",
      campaign_name: "Campanha Exemplo",
      campaign_description: "Descrição da campanha",
      organization_id: "uuid",
      total_steps: 2,
      steps: [
        {
          step_number: 1,
          step_title: "Dados Pessoais",
          step_description: "Preencha os seus dados",
          fields: [
            {
              field_key: "nome",
              field_label: "Nome Completo",
              field_type: "text",
              is_required: true,
              display_style: "input"
            }
          ],
          info_blocks: [],
          sections: []
        }
      ],
      system_entities: {},
      location_required: false,
      allowed_districts: [],
      branding: {
        logo_url: "https://...",
        primary_color: "#000000",
        form_title: "Formulário de Contacto"
      }
    }
  },
  {
    method: "POST",
    path: "/create-lead",
    title: "Criar Lead",
    description: "Cria um novo lead no sistema. Suporta formulários multi-passo, validando campos obrigatórios e únicos por passo. Retorna o ID do lead para chamadas subsequentes.",
    auth: "public",
    headers: [
      { name: "Content-Type", value: "application/json", required: true, description: "Tipo de conteúdo" }
    ],
    requestBody: {
      campaign_id: "uuid (obrigatório)",
      organization_id: "uuid (opcional, usa o da campanha se não fornecido)",
      business_unit_id: "uuid (opcional)",
      step_number: "number (default: 1)",
      field_values: {
        nome: "João Silva",
        email: "joao@email.com",
        telefone: "912345678"
      },
      source: "string (opcional, default: 'public_api')",
      notes: "string (opcional)",
      tags: ["tag1", "tag2"]
    },
    responseExample: {
      success: true,
      lead_id: "uuid",
      current_step: 1,
      total_steps: 2,
      is_complete: false,
      next_step: 2,
      lead: {
        id: "uuid",
        campaign_id: "uuid",
        organization_id: "uuid",
        field_values: {},
        status: "incomplete",
        source: "public_api",
        created_at: "2025-01-16T12:00:00Z"
      },
      message: "Step 1 completed. Continue with update-lead API."
    }
  },
  {
    method: "PATCH",
    path: "/update-lead",
    title: "Atualizar Lead",
    description: "Atualiza um lead existente com novos valores. Usado para continuar formulários multi-passo após a criação inicial. Valida campos obrigatórios e únicos por passo. Por segurança, exige campaign_id que deve corresponder à campanha do lead.",
    auth: "public",
    headers: [
      { name: "Content-Type", value: "application/json", required: true, description: "Tipo de conteúdo" }
    ],
    requestBody: {
      lead_id: "uuid (obrigatório)",
      campaign_id: "uuid (obrigatório - deve corresponder à campanha do lead)",
      step_number: "number (opcional, auto-incrementa se não fornecido)",
      field_values: {
        distrito: "uuid-do-distrito",
        preferencia_horario: "manha"
      }
    },
    responseExample: {
      success: true,
      lead_id: "uuid",
      current_step: 2,
      total_steps: 2,
      is_complete: true,
      next_step: null,
      steps_completed: [1, 2]
    }
  },
  {
    method: "GET",
    path: "/get-campaign-districts",
    title: "Obter Distritos da Campanha",
    description: "Retorna os distritos permitidos para uma campanha com validação de localização ativa.",
    auth: "public",
    params: [
      { name: "campaign_id", type: "UUID", required: true, description: "ID da campanha" }
    ],
    responseExample: {
      districts: [
        { id: "uuid", name: "Lisboa", code: "11" },
        { id: "uuid", name: "Porto", code: "13" }
      ]
    }
  },
  {
    method: "POST",
    path: "/insert-lead",
    title: "Inserir Lead (Legacy)",
    description: "Endpoint legacy para inserção de leads. Suporta auto-agendamento e campos customizados. Requer API Key.",
    auth: "api_key",
    headers: [
      { name: "X-API-Key", value: "sua_api_key", required: true, description: "Chave de API para autenticação" },
      { name: "Content-Type", value: "application/json", required: true, description: "Tipo de conteúdo" }
    ],
    requestBody: {
      name: "Nome do Lead",
      email: "email@exemplo.com",
      phone: "912345678",
      organization_id: "uuid (opcional)",
      source: "website",
      auto_schedule: false,
      custom_fields: {
        campo_customizado: "valor"
      }
    },
    responseExample: {
      success: true,
      contact_id: "uuid",
      message: "Lead created successfully"
    }
  }
];

const methodColors: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PATCH: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
};

const authLabels: Record<string, { label: string; color: string }> = {
  public: { label: "Público", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  api_key: { label: "API Key", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  jwt: { label: "JWT Auth", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" }
};

export default function MarketingApi() {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(endpoints[0]);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    toast.success("Copiado!");
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const generateCurlExample = (endpoint: ApiEndpoint) => {
    const url = `${BASE_URL}${endpoint.path}${endpoint.params ? `?${endpoint.params.filter(p => p.required).map(p => `${p.name}=<${p.type}>`).join('&')}` : ''}`;
    
    let curl = `curl -X ${endpoint.method} "${url}"`;
    
    if (endpoint.headers) {
      endpoint.headers.forEach(h => {
        curl += ` \\\n  -H "${h.name}: ${h.value}"`;
      });
    }
    
    if (endpoint.requestBody && (endpoint.method === "POST" || endpoint.method === "PATCH")) {
      curl += ` \\\n  -d '${JSON.stringify(endpoint.requestBody, null, 2)}'`;
    }
    
    return curl;
  };

  const generateJsExample = (endpoint: ApiEndpoint) => {
    const url = endpoint.params 
      ? `${BASE_URL}${endpoint.path}?${endpoint.params.filter(p => p.required).map(p => `${p.name}=\${campaignId}`).join('&')}`
      : `${BASE_URL}${endpoint.path}`;

    if (endpoint.method === "GET") {
      return `const response = await fetch(\`${url}\`);
const data = await response.json();
console.log(data);`;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (endpoint.auth === "api_key") {
      headers["X-API-Key"] = "YOUR_API_KEY";
    }

    return `const response = await fetch("${BASE_URL}${endpoint.path}", {
  method: "${endpoint.method}",
  headers: ${JSON.stringify(headers, null, 4)},
  body: JSON.stringify(${JSON.stringify(endpoint.requestBody, null, 4)})
});

const data = await response.json();
console.log(data);`;
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar com lista de endpoints */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4" />
                Endpoints
                <HelpButton pageKey="marketing.api" className="ml-auto" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {endpoints.map((ep, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedEndpoint(ep)}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${
                      selectedEndpoint?.path === ep.path ? "bg-muted" : ""
                    }`}
                  >
                    <Badge className={`${methodColors[ep.method]} font-mono text-xs shrink-0`}>
                      {ep.method}
                    </Badge>
                    <span className="text-sm truncate">{ep.title}</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Autenticação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs ${authLabels.public.color}`}>
                  Público
                </div>
                <span className="text-muted-foreground">Sem autenticação</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs ${authLabels.api_key.color}`}>
                  API Key
                </div>
                <span className="text-muted-foreground">Header X-API-Key</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs ${authLabels.jwt.color}`}>
                  JWT
                </div>
                <span className="text-muted-foreground">Bearer Token</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Base URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted p-2 rounded flex-1 truncate">
                  {BASE_URL}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(BASE_URL, "base-url")}
                >
                  {copiedItem === "base-url" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo principal */}
        <div className="lg:col-span-3 space-y-6">
          {selectedEndpoint && (
            <>
              {/* Header do endpoint */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge className={`${methodColors[selectedEndpoint.method]} font-mono`}>
                          {selectedEndpoint.method}
                        </Badge>
                        <code className="text-lg font-mono">{selectedEndpoint.path}</code>
                        <Badge className={authLabels[selectedEndpoint.auth].color}>
                          {authLabels[selectedEndpoint.auth].label}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{selectedEndpoint.title}</CardTitle>
                      <CardDescription className="text-base">
                        {selectedEndpoint.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Parâmetros */}
              {selectedEndpoint.params && selectedEndpoint.params.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileJson className="h-5 w-5" />
                      Query Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Parâmetro</th>
                            <th className="text-left p-2 font-medium">Tipo</th>
                            <th className="text-left p-2 font-medium">Obrigatório</th>
                            <th className="text-left p-2 font-medium">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedEndpoint.params.map((param, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="p-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded">{param.name}</code>
                              </td>
                              <td className="p-2 text-muted-foreground">{param.type}</td>
                              <td className="p-2">
                                {param.required ? (
                                  <Badge variant="destructive" className="text-xs">Sim</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Não</Badge>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground">{param.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Headers */}
              {selectedEndpoint.headers && selectedEndpoint.headers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Send className="h-5 w-5" />
                      Headers
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Header</th>
                            <th className="text-left p-2 font-medium">Valor</th>
                            <th className="text-left p-2 font-medium">Obrigatório</th>
                            <th className="text-left p-2 font-medium">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedEndpoint.headers.map((header, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="p-2">
                                <code className="bg-muted px-1.5 py-0.5 rounded">{header.name}</code>
                              </td>
                              <td className="p-2">
                                <code className="text-muted-foreground">{header.value}</code>
                              </td>
                              <td className="p-2">
                                {header.required ? (
                                  <Badge variant="destructive" className="text-xs">Sim</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Não</Badge>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground">{header.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Request Body e Response */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {selectedEndpoint.requestBody && (
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        Request Body
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(JSON.stringify(selectedEndpoint.requestBody, null, 2), "request")}
                      >
                        {copiedItem === "request" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                        <code>{JSON.stringify(selectedEndpoint.requestBody, null, 2)}</code>
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {selectedEndpoint.responseExample && (
                  <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        Response
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(JSON.stringify(selectedEndpoint.responseExample, null, 2), "response")}
                      >
                        {copiedItem === "response" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                        <code>{JSON.stringify(selectedEndpoint.responseExample, null, 2)}</code>
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Exemplos de código */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code2 className="h-5 w-5" />
                    Exemplos de Código
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="curl">
                    <TabsList>
                      <TabsTrigger value="curl" className="flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        cURL
                      </TabsTrigger>
                      <TabsTrigger value="js" className="flex items-center gap-2">
                        <Code2 className="h-4 w-4" />
                        JavaScript
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="curl" className="mt-4">
                      <div className="relative">
                        <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-xs">
                          <code>{generateCurlExample(selectedEndpoint)}</code>
                        </pre>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:text-zinc-100"
                          onClick={() => copyToClipboard(generateCurlExample(selectedEndpoint), "curl")}
                        >
                          {copiedItem === "curl" ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="js" className="mt-4">
                      <div className="relative">
                        <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto text-xs">
                          <code>{generateJsExample(selectedEndpoint)}</code>
                        </pre>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:text-zinc-100"
                          onClick={() => copyToClipboard(generateJsExample(selectedEndpoint), "js")}
                        >
                          {copiedItem === "js" ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
