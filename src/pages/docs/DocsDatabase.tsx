import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Database, Table, Key, Shield } from "lucide-react";

export default function DocsDatabase() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Base de Dados</h1>
          <p className="text-muted-foreground mt-2">
            Documentação do schema PostgreSQL e tabelas principais
          </p>
        </div>

        <Separator />

        {/* Schema Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Schemas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Badge>public</Badge>
                  <span className="font-medium">Schema Principal</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Contém todas as tabelas de negócio da aplicação
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">auth</Badge>
                  <span className="font-medium">Autenticação (Supabase)</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerido automaticamente pelo Supabase Auth
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">storage</Badge>
                  <span className="font-medium">Ficheiros (Supabase)</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerido automaticamente pelo Supabase Storage
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Tables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Tabelas Principais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Organization */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">ORGANIZAÇÃO</h4>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">tenants</code>
                    <span className="text-xs text-muted-foreground">Organizações de topo</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">companies</code>
                    <span className="text-xs text-muted-foreground">Empresas</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">business_units</code>
                    <span className="text-xs text-muted-foreground">Unidades de negócio</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">business_areas</code>
                    <span className="text-xs text-muted-foreground">Áreas de negócio</span>
                  </div>
                </div>
              </div>

              {/* Users */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">UTILIZADORES</h4>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">profiles</code>
                    <span className="text-xs text-muted-foreground">Perfis de utilizador</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">employees</code>
                    <span className="text-xs text-muted-foreground">Funcionários</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">roles</code>
                    <span className="text-xs text-muted-foreground">Roles do sistema</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">permissions</code>
                    <span className="text-xs text-muted-foreground">Permissões</span>
                  </div>
                </div>
              </div>

              {/* CRM */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">CRM</h4>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">contacts</code>
                    <span className="text-xs text-muted-foreground">Contactos</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">clients</code>
                    <span className="text-xs text-muted-foreground">Clientes</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">deals</code>
                    <span className="text-xs text-muted-foreground">Negócios/Oportunidades</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">activities</code>
                    <span className="text-xs text-muted-foreground">Atividades</span>
                  </div>
                </div>
              </div>

              {/* Sales */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">VENDAS</h4>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">quotes</code>
                    <span className="text-xs text-muted-foreground">Orçamentos</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">quote_lines</code>
                    <span className="text-xs text-muted-foreground">Linhas de orçamento</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">proposals</code>
                    <span className="text-xs text-muted-foreground">Propostas</span>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">PRODUTOS & SERVIÇOS</h4>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">products</code>
                    <span className="text-xs text-muted-foreground">Produtos</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">services</code>
                    <span className="text-xs text-muted-foreground">Serviços</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">product_categories</code>
                    <span className="text-xs text-muted-foreground">Categorias</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <code className="text-sm">brands</code>
                    <span className="text-xs text-muted-foreground">Marcas</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RLS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Row Level Security (RLS)
            </CardTitle>
            <CardDescription>
              Todas as tabelas têm RLS ativado para segurança de dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              O RLS garante que cada utilizador só vê os dados que lhe são permitidos, 
              baseado no seu tipo e âmbito de acesso.
            </p>
            
            <div className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm">
{`-- Exemplo de política RLS
CREATE POLICY "Users can view their company data"
ON public.employees
FOR SELECT
USING (
  is_system_admin(auth.uid())
  OR company_id IN (SELECT get_user_company_ids(auth.uid()))
);`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Key Functions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Funções de Base de Dados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">is_system_admin(user_id)</code>
                <p className="text-xs text-muted-foreground mt-1">Verifica se é System Admin</p>
              </div>
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">is_tenant_admin(user_id, tenant_id)</code>
                <p className="text-xs text-muted-foreground mt-1">Verifica se é admin do tenant</p>
              </div>
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">is_company_admin(user_id, company_id)</code>
                <p className="text-xs text-muted-foreground mt-1">Verifica se é admin da empresa</p>
              </div>
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">has_permission(user_id, permission_code)</code>
                <p className="text-xs text-muted-foreground mt-1">Verifica permissão específica</p>
              </div>
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">get_user_company_ids(user_id)</code>
                <p className="text-xs text-muted-foreground mt-1">Retorna IDs das empresas do utilizador</p>
              </div>
              <div className="border rounded-lg p-3">
                <code className="text-sm font-medium">generate_quote_number()</code>
                <p className="text-xs text-muted-foreground mt-1">Gera número sequencial de orçamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
