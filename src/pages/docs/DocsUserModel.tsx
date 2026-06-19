import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Shield, Key, UserCog, Building2, Network } from "lucide-react";

export default function DocsUserModel() {
  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Modelo de Utilizadores</h1>
          <p className="text-muted-foreground mt-2">
            Estrutura de utilizadores, roles e permissões do sistema
          </p>
        </div>

        <Separator />

        {/* User Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Tipos de Utilizador
            </CardTitle>
            <CardDescription>
              Hierarquia de tipos de utilizador (campo profile.tipo)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500">system_admin</Badge>
                  <span className="font-medium">System Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Acesso total à plataforma. Pode ver e gerir todos os utilizadores, empresas e configurações.
                  Destinado apenas à equipa interna (backoffice, suporte, desenvolvimento).
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> Qualquer tipo de utilizador
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-500">tenant_admin</Badge>
                  <span className="font-medium">Tenant Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Gere apenas organizações/empresas dentro do seu tenant. Vê todos os utilizadores 
                  das empresas do tenant. Pode promover até Tenant Admin.
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> worker_user, company_admin, tenant_admin
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">company_admin</Badge>
                  <span className="font-medium">Company Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Gere apenas uma empresa específica. Vê apenas utilizadores da sua empresa.
                  Pode gerir múltiplas empresas através do Company Switcher.
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> business_unit_admin, business_area_admin, worker_user
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-500">business_unit_admin</Badge>
                  <span className="font-medium">Business Unit Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Gere uma ou mais Business Units dentro de uma empresa. Pode gerir utilizadores 
                  e dados da sua BU (quotes, clientes, produtos, etc.).
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> business_area_admin, worker_user
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-teal-500">business_area_admin</Badge>
                  <span className="font-medium">Business Area Admin</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Gere uma ou mais Business Areas dentro de uma BU. Pode gerir utilizadores 
                  e dados da sua área de negócio.
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> worker_user apenas
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">worker_user</Badge>
                  <span className="font-medium">Worker User</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Utilizador operacional sem acesso administrativo. Não pode ver gestão de utilizadores 
                  ou secção de empresas. Acesso limitado às funcionalidades do dia-a-dia.
                </p>
                <div className="text-xs bg-muted p-2 rounded">
                  <strong>Pode criar:</strong> Nenhum utilizador
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Tables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Tabelas de Utilizadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-4">Tabela</th>
                    <th className="text-left py-2 px-4">Descrição</th>
                    <th className="text-left py-2 px-4">Campos Chave</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">auth.users</td>
                    <td className="py-2 px-4">Utilizadores autenticados (Supabase)</td>
                    <td className="py-2 px-4">id, email</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">profiles</td>
                    <td className="py-2 px-4">Perfis de utilizador</td>
                    <td className="py-2 px-4">id, full_name, tipo, employee_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">user_tenants</td>
                    <td className="py-2 px-4">Associação utilizador ↔ tenant</td>
                    <td className="py-2 px-4">user_id, tenant_id, is_tenant_admin</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">user_companies</td>
                    <td className="py-2 px-4">Associação utilizador ↔ empresa (Company Admin definido por profile.tipo)</td>
                    <td className="py-2 px-4">user_id, company_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">business_unit_admins</td>
                    <td className="py-2 px-4">Admins de Business Unit</td>
                    <td className="py-2 px-4">user_id, business_unit_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">business_area_admins</td>
                    <td className="py-2 px-4">Admins de Business Area</td>
                    <td className="py-2 px-4">user_id, business_area_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4 font-mono">employees</td>
                    <td className="py-2 px-4">Funcionários (podem ter user)</td>
                    <td className="py-2 px-4">id, company_id, business_unit_id</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Roles & Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles e Permissões
            </CardTitle>
            <CardDescription>
              Sistema RBAC (Role-Based Access Control)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="border rounded-lg p-3">
                <div className="font-medium">SystemAdmin</div>
                <p className="text-sm text-muted-foreground">Acesso total ao sistema</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">TenantAdmin</div>
                <p className="text-sm text-muted-foreground">Gestão de tenant e empresas associadas</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">CompanyAdmin</div>
                <p className="text-sm text-muted-foreground">Gestão de empresa específica</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">BusinessUnitAdmin</div>
                <p className="text-sm text-muted-foreground">Gestão de Business Unit e seus dados</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">BusinessAreaAdmin</div>
                <p className="text-sm text-muted-foreground">Gestão de Business Area e seus dados</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">Sales_Full</div>
                <p className="text-sm text-muted-foreground">Acesso completo a vendas (CRM, Quotes, etc.)</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">Sales_View</div>
                <p className="text-sm text-muted-foreground">Visualização de vendas (apenas leitura)</p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="font-medium">Viewer_Global</div>
                <p className="text-sm text-muted-foreground">Visualização geral do sistema</p>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-2">Tabelas de Roles:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><code className="bg-muted px-1 rounded">roles</code> - Definição de roles disponíveis</li>
                <li><code className="bg-muted px-1 rounded">permissions</code> - Permissões (codigo, modulo)</li>
                <li><code className="bg-muted px-1 rounded">role_permissions</code> - Ligação role ↔ permission</li>
                <li><code className="bg-muted px-1 rounded">user_roles</code> - Ligação user ↔ role</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Employee-User Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Ligação Funcionário ↔ Utilizador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Funcionários podem ser associados a utilizadores do sistema através do campo 
              <code className="bg-muted px-1 mx-1 rounded">profiles.employee_id</code>.
            </p>
            
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="font-medium">Regras:</div>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Relação 1:1 (um funcionário só pode ter um utilizador)</li>
                <li>Company Admins devem selecionar funcionário ao criar utilizadores</li>
                <li>System/Tenant Admins podem criar utilizadores sem funcionário associado</li>
                <li>Ao eliminar funcionário, o utilizador associado é eliminado automaticamente</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Access Scope */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Âmbito de Acesso por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-4">Tipo</th>
                    <th className="text-left py-2 px-4">Vê Utilizadores</th>
                    <th className="text-left py-2 px-4">Vê Empresas</th>
                    <th className="text-left py-2 px-4">Company Switcher</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-4">system_admin</td>
                    <td className="py-2 px-4">Todos</td>
                    <td className="py-2 px-4">Todas</td>
                    <td className="py-2 px-4">Não (acesso global)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4">tenant_admin</td>
                    <td className="py-2 px-4">Do tenant</td>
                    <td className="py-2 px-4">Do tenant</td>
                    <td className="py-2 px-4">Sim</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4">company_admin</td>
                    <td className="py-2 px-4">Da empresa</td>
                    <td className="py-2 px-4">Suas empresas</td>
                    <td className="py-2 px-4">Sim</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4">business_unit_admin</td>
                    <td className="py-2 px-4">Da sua BU</td>
                    <td className="py-2 px-4">Da empresa da BU</td>
                    <td className="py-2 px-4">Sim</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4">business_area_admin</td>
                    <td className="py-2 px-4">Da sua Área</td>
                    <td className="py-2 px-4">Da empresa da Área</td>
                    <td className="py-2 px-4">Sim</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-4">worker_user</td>
                    <td className="py-2 px-4">Nenhum</td>
                    <td className="py-2 px-4">Suas empresas (via user_companies)</td>
                    <td className="py-2 px-4">Sim (se múltiplas)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* RLS Policies */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Políticas RLS por Tipo
            </CardTitle>
            <CardDescription>
              Row Level Security para acesso a dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              As políticas RLS garantem que cada tipo de utilizador só acede aos dados do seu âmbito.
            </p>

            <div className="space-y-3">
              <div className="border rounded-lg p-3">
                <div className="font-medium mb-1">Companies (SELECT)</div>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  <li><strong>system_admin:</strong> Todas as empresas</li>
                  <li><strong>tenant_admin:</strong> Empresas do seu tenant</li>
                  <li><strong>company_admin:</strong> Empresas que administra</li>
                  <li><strong>worker_user:</strong> Empresas via user_companies</li>
                </ul>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium mb-1">Employees (SELECT)</div>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  <li>Filtrado pela empresa ativa (activeCompany)</li>
                  <li>Requer permissão <code>hr.view</code> ou admin</li>
                </ul>
              </div>

              <div className="border rounded-lg p-3">
                <div className="font-medium mb-1">Profiles (UPDATE)</div>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  <li>Utilizadores podem atualizar o próprio perfil</li>
                  <li>Admins podem atualizar perfis no seu âmbito</li>
                  <li>Validação hierárquica de tipo via trigger</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
