import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Code, Key, Globe, Lock } from "lucide-react";

export default function DocsApi() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">API Reference</h1>
          <p className="text-muted-foreground mt-2">
            Documentação da API REST e endpoints disponíveis
          </p>
        </div>

        <Separator />

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Visão Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              A API é baseada no <strong>Supabase Auto-generated API</strong>, que expõe 
              automaticamente todas as tabelas da base de dados como endpoints REST.
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <div className="font-mono text-sm">
                Base URL: <code>https://jfuyxszlgetnmdwfdmgw.supabase.co/rest/v1</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Autenticação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Todas as requests requerem os seguintes headers:</p>
            
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Headers obrigatórios
apikey: YOUR_ANON_KEY
Authorization: Bearer YOUR_JWT_TOKEN

// Exemplo com fetch
const response = await fetch(url, {
  headers: {
    'apikey': 'YOUR_ANON_KEY',
    'Authorization': 'Bearer ' + session.access_token,
    'Content-Type': 'application/json'
  }
});`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Endpoints Principais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {/* Companies */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>GET</Badge>
                  <code className="text-sm">/companies</code>
                </div>
                <p className="text-sm text-muted-foreground">Lista empresas (filtrada por RLS)</p>
              </div>

              {/* Contacts */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>GET</Badge>
                  <code className="text-sm">/contacts</code>
                </div>
                <p className="text-sm text-muted-foreground">Lista contactos</p>
              </div>

              {/* Quotes */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>GET</Badge>
                  <code className="text-sm">/quotes</code>
                </div>
                <p className="text-sm text-muted-foreground">Lista orçamentos</p>
              </div>

              {/* Products */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>GET</Badge>
                  <code className="text-sm">/products</code>
                </div>
                <p className="text-sm text-muted-foreground">Lista produtos</p>
              </div>

              {/* Employees */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>GET</Badge>
                  <code className="text-sm">/employees</code>
                </div>
                <p className="text-sm text-muted-foreground">Lista funcionários</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Query Parameters */}
        <Card>
          <CardHeader>
            <CardTitle>Parâmetros de Query</CardTitle>
            <CardDescription>Filtros e ordenação disponíveis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-4">Parâmetro</th>
                    <th className="text-left py-2 px-4">Descrição</th>
                    <th className="text-left py-2 px-4">Exemplo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">select</td>
                    <td className="py-2 px-4">Campos a retornar</td>
                    <td className="py-2 px-4"><code>?select=id,name</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">order</td>
                    <td className="py-2 px-4">Ordenação</td>
                    <td className="py-2 px-4"><code>?order=created_at.desc</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">limit</td>
                    <td className="py-2 px-4">Limite de resultados</td>
                    <td className="py-2 px-4"><code>?limit=10</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">eq</td>
                    <td className="py-2 px-4">Igual a</td>
                    <td className="py-2 px-4"><code>?status=eq.active</code></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">ilike</td>
                    <td className="py-2 px-4">Pesquisa texto</td>
                    <td className="py-2 px-4"><code>?name=ilike.*search*</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              O sistema suporta API Keys personalizadas para integrações externas.
              Geridas em <strong>Administração → API Keys</strong>.
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <div className="font-medium mb-2">Formato:</div>
              <code className="text-sm">olv_[40 caracteres aleatórios]</code>
            </div>

            <p className="text-sm text-muted-foreground">
              As API Keys são associadas a um tenant e permitem acesso aos endpoints 
              públicos do sistema sem autenticação de utilizador.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
