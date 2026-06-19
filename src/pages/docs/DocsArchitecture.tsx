import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Network, Database, Users, Shield, Layers } from "lucide-react";

export default function DocsArchitecture() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Estrutura do Sistema</h1>
          <p className="text-muted-foreground mt-2">
            Arquitetura e organização hierárquica do sistema Olyvia CRM
          </p>
        </div>

        <Separator />

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Visão Geral
            </CardTitle>
            <CardDescription>
              Arquitetura multi-tenant com hierarquia organizacional
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              O sistema utiliza uma arquitetura <strong>multi-tenant</strong> que permite 
              múltiplas organizações (tenants) operarem de forma isolada na mesma instância.
            </p>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Hierarquia de Administração (Roles):</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm">
{`System Admin (Plataforma - Acesso Total)
  └── Tenant Admin (Organização)
        └── Company Admin (Empresa)
              └── Business Unit Admin (Unidade de Negócio)
                    └── Business Area Admin (Área de Negócio)
                          └── Worker / Client User (Operacional)`}
                  </pre>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Hierarquia de Dados (Organizacional):</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-sm">
{`Tenant (Organização)
  └── Company (Empresa)
        └── Business Unit (Unidade de Negócio)
              └── Business Area (Área de Negócio)`}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin Hierarchy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Hierarquia de Administração
            </CardTitle>
            <CardDescription>
              Níveis de acesso administrativo ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-500 hover:bg-red-600">System Admin</Badge>
                <span className="font-medium">Administrador da Plataforma</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Nível mais alto do sistema. Acesso total a todas as organizações, empresas e configurações.
                Reservado para a equipa interna (backoffice, suporte, desenvolvimento).
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-500 hover:bg-orange-600">Tenant Admin</Badge>
                <span className="font-medium">Administrador de Organização</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Gere todas as empresas dentro do seu tenant/organização. Pode criar empresas e
                promover utilizadores até Tenant Admin.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500 hover:bg-blue-600">Company Admin</Badge>
                <span className="font-medium">Administrador de Empresa</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Gere uma ou mais empresas específicas. Pode criar utilizadores operacionais
                e outras empresas independentes.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-500 hover:bg-purple-600">Business Unit Admin</Badge>
                <span className="font-medium">Administrador de Unidade de Negócio</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Gere uma ou mais Business Units dentro de uma empresa. Pode gerir utilizadores e dados 
                da sua BU. Pode criar Business Area Admins e utilizadores operacionais.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-teal-500 hover:bg-teal-600">Business Area Admin</Badge>
                <span className="font-medium">Administrador de Área de Negócio</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Gere uma ou mais Business Areas dentro de uma BU. Pode gerir utilizadores e dados 
                da sua área. Pode criar utilizadores operacionais.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Worker / Client User</Badge>
                <span className="font-medium">Utilizador Operacional</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Utilizador do dia-a-dia sem acesso administrativo. Acesso limitado às funcionalidades operacionais.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data Hierarchy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Hierarquia de Dados
            </CardTitle>
            <CardDescription>
              Estrutura organizacional dos dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">Tenant</Badge>
                <span className="font-medium">Organização de Topo</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Agrupa múltiplas empresas sob uma mesma organização. Gerido por Tenant Admins.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Company</Badge>
                <span className="font-medium">Empresa</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Entidade legal/comercial. Pode pertencer a um tenant ou ser independente (tenant_id = NULL).
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Business Unit</Badge>
                <span className="font-medium">Unidade de Negócio</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Divisão dentro de uma empresa (ex: filial, departamento, loja).
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Business Area</Badge>
                <span className="font-medium">Área de Negócio</span>
              </div>
              <p className="text-sm text-muted-foreground ml-4">
                Segmento ou vertical de negócio (ex: Vendas, Serviços, Manutenção).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Modelo de Dados Principal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">Tabela</th>
                    <th className="text-left py-2 px-4">Descrição</th>
                    <th className="text-left py-2 px-4">Relação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">tenants</td>
                    <td className="py-2 px-4">Organizações de topo</td>
                    <td className="py-2 px-4">-</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">companies</td>
                    <td className="py-2 px-4">Empresas</td>
                    <td className="py-2 px-4">tenant_id → tenants</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">business_units</td>
                    <td className="py-2 px-4">Unidades de negócio</td>
                    <td className="py-2 px-4">company_id → companies</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">business_areas</td>
                    <td className="py-2 px-4">Áreas de negócio</td>
                    <td className="py-2 px-4">-</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">business_unit_areas</td>
                    <td className="py-2 px-4">Ligação N:N</td>
                    <td className="py-2 px-4">business_unit_id, business_area_id</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Security Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Modelo de Segurança
            </CardTitle>
            <CardDescription>
              Row Level Security (RLS) e controlo de acesso baseado em roles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Toda a segurança de dados é implementada ao nível da base de dados usando 
              <strong> Row Level Security (RLS)</strong> do PostgreSQL.
            </p>
            
            <div className="space-y-2">
              <h4 className="font-medium">Funções de Segurança:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><code>is_system_admin_user(user_id)</code> - Verifica se é System Admin</li>
                <li><code>is_tenant_admin_user(user_id)</code> - Verifica se é Tenant Admin</li>
                <li><code>is_company_admin_user(user_id)</code> - Verifica se é Company Admin</li>
                <li><code>is_business_unit_admin_user(user_id)</code> - Verifica se é BU Admin</li>
                <li><code>is_business_area_admin_user(user_id)</code> - Verifica se é Area Admin</li>
                <li><code>has_permission(user_id, permission_code)</code> - Verifica permissão</li>
                <li><code>user_in_business_unit_admin_scope(target_user_id, admin_id)</code> - Scope de BU</li>
                <li><code>user_in_business_area_admin_scope(target_user_id, admin_id)</code> - Scope de Area</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Technical Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Definições Técnicas
            </CardTitle>
            <CardDescription>
              Configurações avançadas por nível organizacional
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              A área de <strong>Definições Técnicas</strong> permite configurar tokens de API e 
              definições SMTP a diferentes níveis organizacionais (Empresa, Business Unit, Business Area).
            </p>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Tokens de API:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Tokens scoped ao nível onde são criados (empresa, BU ou área)</li>
                  <li>Permissões granulares (ex: leads.write, contacts.read)</li>
                  <li>Cada token só acede a dados do seu nível organizacional</li>
                  <li>Usados para integrações externas (ex: inserção de leads via API)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Configuração SMTP:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Definições de servidor de email por nível organizacional</li>
                  <li>Permite emails personalizados por empresa/BU/área</li>
                  <li>Inclui host, porta, credenciais e informações do remetente</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Acesso:</h4>
                <p className="text-sm text-muted-foreground">
                  Apenas administradores (Company Admin, BU Admin, Area Admin) têm acesso às 
                  Definições Técnicas, e cada um só pode configurar o seu nível organizacional.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tech Stack */}
        <Card>
          <CardHeader>
            <CardTitle>Stack Tecnológico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Frontend</div>
                <div className="text-sm text-muted-foreground">React + TypeScript</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Styling</div>
                <div className="text-sm text-muted-foreground">Tailwind CSS + shadcn/ui</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Backend</div>
                <div className="text-sm text-muted-foreground">Supabase (Lovable Cloud)</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Database</div>
                <div className="text-sm text-muted-foreground">PostgreSQL</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Auth</div>
                <div className="text-sm text-muted-foreground">Supabase Auth</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">Storage</div>
                <div className="text-sm text-muted-foreground">Supabase Storage</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
