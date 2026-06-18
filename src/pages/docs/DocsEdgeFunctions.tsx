import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Server, Code, Shield, Zap } from "lucide-react";

export default function DocsEdgeFunctions() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Edge Functions</h1>
          <p className="text-muted-foreground mt-2">
            Funções serverless para lógica de backend
          </p>
        </div>

        <Separator />

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Visão Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Edge Functions são funções serverless executadas no edge (Deno), permitindo 
              lógica de backend segura sem expor credenciais ao cliente.
            </p>
            
            <div className="bg-muted p-4 rounded-lg">
              <div className="font-mono text-sm">
                Base URL: <code>{`\${VITE_SUPABASE_URL}/functions/v1`}</code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Functions List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Funções Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* create-user */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge>POST</Badge>
                <code className="font-medium">/create-user</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Cria utilizadores sem enviar email de confirmação (para admins)
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação (Administrador com permissão)
              </div>
              <div className="bg-zinc-900 text-zinc-100 p-3 rounded overflow-x-auto">
                <pre className="text-xs">
{`{
  "email": "user@example.com",
  "password": "password123",
  "name": "Nome Completo",
  "organization_id": "uuid",
  "role_id": "uuid"
}`}
                </pre>
              </div>
            </div>

            {/* delete-user */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">DELETE</Badge>
                <code className="font-medium">/delete-user</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Elimina utilizador do sistema (auth + anew_users)
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação (Admin com permissão)
              </div>
            </div>

            {/* list-users */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">GET</Badge>
                <code className="font-medium">/list-users</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Lista utilizadores com filtragem por scope do admin
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação (Admin)
              </div>
            </div>

            {/* insert-lead */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge>POST</Badge>
                <code className="font-medium">/insert-lead</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Recebe leads externas via API Key
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> API Key válida
              </div>
            </div>

            {/* send-email */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge>POST</Badge>
                <code className="font-medium">/send-email</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Envia emails usando configuração SMTP da empresa
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação + Configuração SMTP
              </div>
            </div>

            {/* register-company */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge>POST</Badge>
                <code className="font-medium">/register-company</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-registo de nova empresa + utilizador admin
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Nenhum (endpoint público)
              </div>
            </div>

            {/* api-proxy */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">*</Badge>
                <code className="font-medium">/api-proxy</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Proxy para chamadas a APIs externas (evita CORS)
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação
              </div>
            </div>

            {/* update-user-password */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge>POST</Badge>
                <code className="font-medium">/update-user-password</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Altera password de utilizadores com validação hierárquica de permissões
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                <strong>Requer:</strong> Autenticação (scope hierárquico)
              </div>
              <div className="bg-zinc-900 text-zinc-100 p-3 rounded overflow-x-auto">
                <pre className="text-xs">
{`{
  "targetUserId": "uuid-do-utilizador",
  "newPassword": "novaPassword123"
}

// Regras de scope:
// - super_admin: qualquer utilizador
// - org_admin: utilizadores da sua organização
// - Todos podem alterar a própria password`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Verificação de Autenticação:</h4>
              <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm">
{`// Verificar JWT do utilizador
const authHeader = req.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');

const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) {
  return new Response('Unauthorized', { status: 401 });
}`}
                </pre>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Secrets Disponíveis:</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li><code>SUPABASE_URL</code> - URL do projeto</li>
                <li><code>SUPABASE_ANON_KEY</code> - Chave pública</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Example */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Exemplo de Chamada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Chamar edge function do frontend
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.functions.invoke('create-user', {
  body: {
    email: 'novo@user.com',
    password: 'senha123',
    name: 'Novo Utilizador',
    organization_id: organizationId,
    role_id: roleId
  }
});

if (error) {
  console.error('Erro:', error);
} else {
  console.log('Utilizador criado:', data);
}`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
