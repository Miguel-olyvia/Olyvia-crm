import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Key, Shield, UserPlus, LogIn, RefreshCw } from "lucide-react";

export default function DocsAuthentication() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Autenticação</h1>
          <p className="text-muted-foreground mt-2">
            Sistema de autenticação e gestão de sessões
          </p>
        </div>

        <Separator />

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Visão Geral
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              O sistema utiliza <strong>Supabase Auth</strong> para autenticação, 
              com suporte a email/password e gestão automática de sessões JWT.
            </p>
            
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Método</Badge>
                <span>Email + Password</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Confirmação</Badge>
                <span>Auto-confirm ativado (não requer verificação de email)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Sessão</Badge>
                <span>JWT com refresh automático</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Login Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Fluxo de Login
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Login com email/password
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

if (error) {
  console.error('Erro de login:', error.message);
} else {
  // data.user - dados do utilizador
  // data.session - sessão com access_token e refresh_token
}`}
              </pre>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Após login bem-sucedido:</h4>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                <li>JWT armazenado automaticamente no localStorage</li>
                <li>Refresh token gerido pelo Supabase SDK</li>
                <li>Utilizador redirecionado para /dashboard</li>
                <li>CompanyContext carrega empresas do utilizador</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Registration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Registo de Utilizadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>Self-Registration</Badge>
                  <span className="font-medium">Auto-registo de empresa</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Utilizadores podem criar nova empresa via edge function <code>register-company</code>.
                  Cria automaticamente: utilizador + empresa + company_admin entry.
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">Admin Creation</Badge>
                  <span className="font-medium">Criação por admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Admins criam utilizadores via edge function <code>create-user</code>.
                  Não envia email de confirmação - utilizador já fica ativo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Gestão de Sessão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Obter sessão atual
const { data: { session } } = await supabase.auth.getSession();

// Obter utilizador atual
const { data: { user } } = await supabase.auth.getUser();

// Listener de mudanças de auth
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    // Utilizador fez login
  } else if (event === 'SIGNED_OUT') {
    // Utilizador fez logout
  } else if (event === 'TOKEN_REFRESHED') {
    // Token foi renovado automaticamente
  }
});`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card>
          <CardHeader>
            <CardTitle>Logout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Fazer logout
await supabase.auth.signOut();

// Limpa automaticamente:
// - JWT do localStorage
// - Sessão do cliente
// - Redireciona para /auth`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Alteração de Password
            </CardTitle>
            <CardDescription>
              Sistema hierárquico de alteração de passwords
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              A alteração de passwords segue um sistema hierárquico baseado no tipo de utilizador.
              Utiliza a edge function <code>update-user-password</code>.
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-4">Tipo</th>
                    <th className="text-left py-2 px-4">Pode Alterar Password De</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-medium">system_admin</td>
                    <td className="py-2 px-4">Qualquer utilizador</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-medium">tenant_admin</td>
                    <td className="py-2 px-4">Utilizadores do seu tenant + próprio</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-medium">company_admin</td>
                    <td className="py-2 px-4">Utilizadores da sua empresa + próprio</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-medium">worker_user</td>
                    <td className="py-2 px-4">Apenas a própria password</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="font-medium">Validações:</div>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Password mínima: 6 caracteres</li>
                <li>Nova password não pode ser igual à atual</li>
                <li>Re-login automático se utilizador alterar a própria password</li>
              </ul>
            </div>

            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`// Alterar password via edge function
const { data, error } = await supabase.functions.invoke('update-user-password', {
  body: {
    targetUserId: userId,
    newPassword: 'novaPassword123'
  }
});`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Profile Trigger */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Trigger de Perfil
            </CardTitle>
            <CardDescription>
              Criação automática de perfil no registo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Quando um utilizador é criado em <code>auth.users</code>, um trigger 
              cria automaticamente o perfil na tabela <code>profiles</code>.
            </p>
            
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`-- Trigger: handle_new_user()
CREATE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, tipo)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'tipo', 'worker_user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
