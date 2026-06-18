import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, 
  LayoutDashboard, 
  ShoppingCart, 
  Target, 
  Users, 
  Wrench, 
  Package, 
  Truck, 
  Megaphone, 
  HardHat, 
  UserCog, 
  Settings,
  Building2,
  Calendar,
  Phone,
  Warehouse,
  Key,
  Car,
  Cog
} from "lucide-react";

interface PermissionGroup {
  icon: React.ReactNode;
  title: string;
  description: string;
  submodules: {
    name: string;
    permissions: string[];
  }[];
}

// 217 permissões da BD organizadas por módulos na ordem da Sidebar
const permissionGroups: PermissionGroup[] = [
  {
    icon: <LayoutDashboard className="h-5 w-5" />,
    title: "Dashboard",
    description: "Acesso ao painel principal",
    submodules: [
      {
        name: "Dashboard",
        permissions: ["dashboard.view"]
      }
    ]
  },
  {
    icon: <ShoppingCart className="h-5 w-5" />,
    title: "Sales (Vendas)",
    description: "Orçamentos, Templates, Catálogo de Itens e Serviços",
    submodules: [
      {
        name: "Orçamentos",
        permissions: ["quotes.view", "quotes.create", "quotes.edit", "quotes.delete", "quotes.export", "quotes.generate_pdf"]
      },
      {
        name: "Modelos de Orçamento",
        permissions: ["quote_templates.view", "quote_templates.create", "quote_templates.edit", "quote_templates.delete", "quote_templates.duplicate"]
      },
      {
        name: "Itens de Catálogo",
        permissions: ["catalog_items.view", "catalog_items.delete", "catalog_items.export", "catalog_items.import"]
      },
      {
        name: "Catálogo de Serviços",
        permissions: ["service_catalog.view", "service_catalog.delete", "service_catalog.export", "service_catalog.import"]
      }
    ]
  },
  {
    icon: <Target className="h-5 w-5" />,
    title: "Sales Management",
    description: "Gestão de pedidos de proposta e propostas",
    submodules: [
      {
        name: "Pedidos de Proposta",
        permissions: ["deals.view", "deals.create", "deals.edit", "deals.delete"]
      },
      {
        name: "Propostas",
        permissions: ["proposals.view", "proposals.create", "proposals.edit", "proposals.delete"]
      }
    ]
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Customers (Clientes)",
    description: "Clientes e contactos",
    submodules: [
      {
        name: "Clientes",
        permissions: ["clients.view", "clients.create", "clients.edit", "clients.delete", "clients.export", "clients.import"]
      },
      {
        name: "Contactos",
        permissions: ["contacts.view", "contacts.view_details", "contacts.create", "contacts.edit", "contacts.delete", "contacts.export", "contacts.import"]
      }
    ]
  },
  {
    icon: <Calendar className="h-5 w-5" />,
    title: "Calendar (Calendário)",
    description: "Visitas e eventos do calendário",
    submodules: [
      {
        name: "Calendário",
        permissions: ["calendar.view_company", "calendar.create"]
      }
    ]
  },
  {
    icon: <Phone className="h-5 w-5" />,
    title: "Call Center",
    description: "Centro de chamadas e atividades",
    submodules: [
      {
        name: "Call Center",
        permissions: ["call_center.view", "call_center.handle_calls", "call_center.manage"]
      },
      {
        name: "Atividades",
        permissions: ["activities.view", "activities.create", "activities.edit", "activities.delete"]
      }
    ]
  },
  {
    icon: <Wrench className="h-5 w-5" />,
    title: "Services (Serviços)",
    description: "Gestão de serviços, categorias, subcategorias e taxas",
    submodules: [
      {
        name: "Serviços",
        permissions: ["services.view", "services.create", "services.edit", "services.delete", "services.manage_prices", "services.view_price_history"]
      },
      {
        name: "Categorias de Serviços",
        permissions: ["service_categories.view", "service_categories.create", "service_categories.edit", "service_categories.delete"]
      },
      {
        name: "Subcategorias de Serviços",
        permissions: ["service_subcategories.view", "service_subcategories.create", "service_subcategories.edit", "service_subcategories.delete"]
      },
      {
        name: "Taxas de Serviço",
        permissions: ["service_fees.view", "service_fees.create", "service_fees.edit", "service_fees.delete"]
      }
    ]
  },
  {
    icon: <Package className="h-5 w-5" />,
    title: "Products (Produtos)",
    description: "Produtos, categorias, subcategorias, atributos e marcas",
    submodules: [
      {
        name: "Produtos",
        permissions: ["products.view", "products.create", "products.edit", "products.delete", "products.export", "products.import", "products.manage_catalog", "products.manage_prices", "products.view_price_history", "products.manage_attributes"]
      },
      {
        name: "Categorias de Produtos",
        permissions: ["product_categories.view", "product_categories.create", "product_categories.edit", "product_categories.delete"]
      },
      {
        name: "Subcategorias de Produtos",
        permissions: ["product_subcategories.view", "product_subcategories.create", "product_subcategories.edit", "product_subcategories.delete"]
      },
      {
        name: "Atributos de Produtos",
        permissions: ["product_attributes.view", "product_attributes.create", "product_attributes.edit", "product_attributes.delete"]
      },
      {
        name: "Marcas",
        permissions: ["brands.view", "brands.create", "brands.edit", "brands.delete"]
      },
      {
        name: "Inventário/Stocks",
        permissions: ["inventory.view", "inventory.create", "inventory.edit", "inventory.delete", "inventory.adjust", "inventory.transfer", "inventory.export", "inventory.import"]
      }
    ]
  },
  {
    icon: <Truck className="h-5 w-5" />,
    title: "Purchases (Compras)",
    description: "Fornecedores, armazéns, encomendas e peças sobressalentes",
    submodules: [
      {
        name: "Fornecedores",
        permissions: ["suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete", "suppliers.export", "suppliers.import"]
      },
      {
        name: "Armazéns",
        permissions: ["warehouses.view", "warehouses.create", "warehouses.edit", "warehouses.delete", "warehouses.export", "warehouses.import"]
      },
      {
        name: "Encomendas",
        permissions: ["purchase_orders.view", "purchase_orders.create", "purchase_orders.edit", "purchase_orders.delete", "purchase_orders.export", "purchase_orders.import"]
      },
      {
        name: "Peças Sobressalentes",
        permissions: ["spare_parts.view", "spare_parts.create", "spare_parts.edit", "spare_parts.delete"]
      }
    ]
  },
  {
    icon: <Megaphone className="h-5 w-5" />,
    title: "Marketing",
    description: "Campanhas, canais e listas",
    submodules: [
      {
        name: "Campanhas",
        permissions: ["campaigns.view", "campaigns.create", "campaigns.edit", "campaigns.delete"]
      },
      {
        name: "Canais",
        permissions: ["channels.view", "channels.create", "channels.edit", "channels.delete"]
      },
      {
        name: "Listas",
        permissions: ["lists.view", "lists.create", "lists.edit", "lists.delete", "lists.add_contacts"]
      }
    ]
  },
  {
    icon: <HardHat className="h-5 w-5" />,
    title: "Operations (Operações)",
    description: "Ativos, veículos, motoristas, ordens de trabalho e pedidos de serviço",
    submodules: [
      {
        name: "Ativos",
        permissions: ["assets.view", "assets.create", "assets.edit", "assets.delete", "assets.export", "assets.import"]
      },
      {
        name: "Veículos",
        permissions: ["vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.delete", "vehicles.export", "vehicles.import"]
      },
      {
        name: "Motoristas",
        permissions: ["drivers.view", "drivers.create", "drivers.edit", "drivers.delete", "drivers.export", "drivers.import"]
      },
      {
        name: "Ordens de Trabalho",
        permissions: ["work_orders.view", "work_orders.create", "work_orders.edit", "work_orders.delete"]
      },
      {
        name: "Pedidos de Serviço",
        permissions: ["service_requests.view", "service_requests.create", "service_requests.edit", "service_requests.delete"]
      }
    ]
  },
  {
    icon: <UserCog className="h-5 w-5" />,
    title: "HR Management (Recursos Humanos)",
    description: "Funcionários e férias",
    submodules: [
      {
        name: "Funcionários",
        permissions: ["employees.view", "employees.create", "employees.edit", "employees.delete", "employees.export", "employees.import"]
      },
      {
        name: "Férias",
        permissions: ["vacations.view", "vacations.create", "vacations.manage"]
      }
    ]
  },
  {
    icon: <Settings className="h-5 w-5" />,
    title: "Administration (Administração)",
    description: "Utilizadores, roles, API keys e organizações",
    submodules: [
      {
        name: "Utilizadores",
        permissions: ["users.view", "users.create", "users.edit", "users.delete", "users.manage_roles", "users.change_password"]
      },
      {
        name: "Roles",
        permissions: ["roles.view", "roles.create", "roles.edit", "roles.delete", "roles.clone"]
      },
      {
        name: "API Keys",
        permissions: ["api_keys.view", "api_keys.create", "api_keys.edit", "api_keys.delete", "api_keys.copy", "api_keys.toggle"]
      },
      {
        name: "Organizações/Tenants",
        permissions: ["tenants.view", "tenants.create", "tenants.edit", "tenants.delete", "tenants.manage_companies"]
      }
    ]
  },
  {
    icon: <Building2 className="h-5 w-5" />,
    title: "Companies / Estrutura",
    description: "Empresas, unidades e áreas de negócio",
    submodules: [
      {
        name: "Empresas",
        permissions: ["companies.view", "companies.create", "companies.edit", "companies.delete", "companies.upload_logo"]
      },
      {
        name: "Unidades de Negócio",
        permissions: ["business_units.view", "business_units.create", "business_units.edit", "business_units.delete", "business_units.export", "business_units.import"]
      },
      {
        name: "Áreas de Negócio",
        permissions: ["business_areas.view", "business_areas.create", "business_areas.edit", "business_areas.delete"]
      },
      {
        name: "Grupos de Utilizadores",
        permissions: ["company_groups.view", "company_groups.create", "company_groups.edit", "company_groups.delete"]
      }
    ]
  },
  {
    icon: <Cog className="h-5 w-5" />,
    title: "Technical Settings (Configurações Técnicas)",
    description: "Configurações técnicas do sistema",
    submodules: [
      {
        name: "Configurações Técnicas",
        permissions: ["technical_settings.view", "technical_settings.edit"]
      },
      {
        name: "SMTP",
        permissions: ["smtp.view", "smtp.edit"]
      }
    ]
  },
  {
    icon: <Calendar className="h-5 w-5" />,
    title: "Scheduling (Agendamentos)",
    description: "Gestão de agendamentos, boards, recursos e regras",
    submodules: [
      {
        name: "Itens de Agendamento",
        permissions: ["scheduling.items.view", "scheduling.items.create", "scheduling.items.edit", "scheduling.items.delete"]
      },
      {
        name: "Boards",
        permissions: ["scheduling.boards.view", "scheduling.boards.create", "scheduling.boards.edit", "scheduling.boards.delete"]
      },
      {
        name: "Recursos",
        permissions: ["scheduling.resources.view", "scheduling.resources.create", "scheduling.resources.edit", "scheduling.resources.delete"]
      },
      {
        name: "Regras de Auto-Agendamento",
        permissions: ["scheduling.rules.view", "scheduling.rules.create", "scheduling.rules.edit", "scheduling.rules.delete"]
      },
      {
        name: "Configurações e Exportação",
        permissions: ["scheduling.settings", "scheduling.export"]
      }
    ]
  }
];

export default function DocsPermissions() {
  const totalPermissions = permissionGroups.reduce((acc, group) => 
    acc + group.submodules.reduce((subAcc, sub) => subAcc + sub.permissions.length, 0), 0);
  
  const totalSubmodules = permissionGroups.reduce((acc, group) => acc + group.submodules.length, 0);

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Sistema de Permissões</h1>
          <p className="text-muted-foreground mt-2">
            Lista completa das {totalPermissions} permissões do sistema, organizadas por módulo e submódulo
          </p>
        </div>

        <Separator />

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Visão Geral
            </CardTitle>
            <CardDescription>
              Estrutura de permissões RBAC (Role-Based Access Control)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{totalPermissions}</div>
                <div className="text-sm text-muted-foreground">Permissões</div>
              </div>
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{permissionGroups.length}</div>
                <div className="text-sm text-muted-foreground">Módulos</div>
              </div>
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">{totalSubmodules}</div>
                <div className="text-sm text-muted-foreground">Submódulos</div>
              </div>
              <div className="bg-muted p-4 rounded-lg text-center">
                <div className="text-2xl font-bold">6</div>
                <div className="text-sm text-muted-foreground">Roles</div>
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Padrão de Nomenclatura:</h4>
              <div className="text-sm space-y-1">
                <p><code className="bg-muted px-1 rounded">modulo.view</code> - Ver/listar dados</p>
                <p><code className="bg-muted px-1 rounded">modulo.create</code> - Criar novos registos</p>
                <p><code className="bg-muted px-1 rounded">modulo.edit</code> - Editar registos existentes</p>
                <p><code className="bg-muted px-1 rounded">modulo.delete</code> - Eliminar registos</p>
                <p><code className="bg-muted px-1 rounded">modulo.export</code> - Exportar dados</p>
                <p><code className="bg-muted px-1 rounded">modulo.import</code> - Importar dados (Bulk Upload)</p>
                <p><code className="bg-muted px-1 rounded">modulo.manage</code> - Gestão avançada (config, settings)</p>
                <p><code className="bg-muted px-1 rounded">modulo.manage_prices</code> - Gerir preços</p>
                <p><code className="bg-muted px-1 rounded">modulo.view_price_history</code> - Ver histórico de preços</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permission Groups */}
        {permissionGroups.map((group, index) => {
          const groupPermissionCount = group.submodules.reduce((acc, sub) => acc + sub.permissions.length, 0);
          
          return (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {group.icon}
                  {group.title}
                  <Badge variant="secondary" className="ml-auto">
                    {groupPermissionCount} permissões
                  </Badge>
                </CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.submodules.map((submodule, subIndex) => (
                  <div key={subIndex} className="border-l-2 border-primary/20 pl-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm">{submodule.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {submodule.permissions.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {submodule.permissions.map((permission) => (
                        <code
                          key={permission}
                          className="bg-muted px-2 py-1 rounded text-xs font-mono"
                        >
                          {permission}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* Roles Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Roles Disponíveis</CardTitle>
            <CardDescription>
              6 roles pré-definidos no sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500">SystemAdmin</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Acesso total - todas as {totalPermissions} permissões
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-500">TenantAdmin</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Gestão de organização - permissões do tenant e empresas associadas
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500">CompanyAdmin</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Gestão de empresa - todas as permissões dentro da empresa
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">BusinessUnitAdmin</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Gestão de unidade de negócio - permissões operacionais limitadas à unidade
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500">Worker</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Trabalhador - permissões básicas de visualização e operação
                </p>
              </div>
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-gray-500">Viewer_Global</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Apenas visualização - sem permissões de edição
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Tables */}
        <Card>
          <CardHeader>
            <CardTitle>Tabelas de Base de Dados</CardTitle>
            <CardDescription>
              Estrutura de permissões na base de dados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Tabela</th>
                    <th className="text-left py-2 px-3">Descrição</th>
                    <th className="text-left py-2 px-3">Colunas Principais</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">roles</td>
                    <td className="py-2 px-3">Definição de roles</td>
                    <td className="py-2 px-3 text-xs">id, nome, descricao, empresa_id, tenant_id, is_template</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">permissions</td>
                    <td className="py-2 px-3">Lista de permissões disponíveis</td>
                    <td className="py-2 px-3 text-xs">id, codigo, descricao, modulo</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">role_permissions</td>
                    <td className="py-2 px-3">Associação role-permissão</td>
                    <td className="py-2 px-3 text-xs">id, role_id, permission_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">user_roles</td>
                    <td className="py-2 px-3">Associação utilizador-role</td>
                    <td className="py-2 px-3 text-xs">id, user_id, role_id, company_id</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">company_groups</td>
                    <td className="py-2 px-3">Grupos de utilizadores por empresa</td>
                    <td className="py-2 px-3 text-xs">id, name, company_id, is_active</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono text-xs">group_permissions</td>
                    <td className="py-2 px-3">Permissões atribuídas a grupos</td>
                    <td className="py-2 px-3 text-xs">id, group_id, permission_id</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
